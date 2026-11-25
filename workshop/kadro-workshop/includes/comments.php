<?php
// Comments on published workshop items, for the gallery on kadro.studio (and
// later the app). Members with a confirmed e-mail comment and their comments
// appear at once; anyone can report one, moderators hide or remove it. The
// item's author gets a letter (community.php). The same /comments/{id} routes
// edit, delete and report forum replies too.

if (!defined('ABSPATH')) {
	exit;
}

add_action('rest_api_init', function () {
	$paging = [
		'page'     => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
		'per_page' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50, 'default' => 20],
	];
	register_rest_route('kadro/v1', '/items/(?P<id>\d+)/comments', [
		[
			'methods'             => 'GET',
			'callback'            => 'kw_rest_comments',
			'permission_callback' => '__return_true',
			'args'                => $paging + ['order' => ['type' => 'string', 'enum' => ['desc', 'asc'], 'default' => 'desc']],
		],
		[
			'methods'             => 'POST',
			'callback'            => 'kw_rest_add_comment',
			'permission_callback' => '__return_true',
			'args'                => ['content' => ['type' => 'string']],
		],
	]);
	register_rest_route('kadro/v1', '/comments/(?P<id>\d+)', [
		[
			'methods'             => 'POST',
			'callback'            => 'kw_rest_edit_comment',
			'permission_callback' => '__return_true',
			'args'                => ['content' => ['type' => 'string']],
		],
		[
			'methods'             => 'DELETE',
			'callback'            => 'kw_rest_delete_comment',
			'permission_callback' => '__return_true',
		],
	]);
	register_rest_route('kadro/v1', '/comments/(?P<id>\d+)/report', [
		'methods'             => 'POST',
		'callback'            => 'kw_rest_report_comment',
		'permission_callback' => '__return_true',
		'args'                => ['reason' => ['type' => 'string']],
	]);
});

function kw_rest_comments(WP_REST_Request $r) {
	$post = kw_find((int) $r['id']);
	if (!$post || $post->post_status !== 'publish') {
		return kw_error('kw_not_found', 'Item not found', 404);
	}
	$list = kw_comment_list($post->ID, 'kw_comment', (int) $r['page'], (int) $r['per_page'], $r['order'] === 'asc' ? 'ASC' : 'DESC');
	return [
		'comments' => $list['posts'],
		'total'    => $list['total'],
		'pages'    => $list['pages'],
		'page'     => $list['page'],
		'count'    => $list['count'],
		'open'     => kw_comments_open(),
	];
}

function kw_rest_add_comment(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	if (!kw_is_moderator() && !kw_confirmed($user)) {
		return kw_unconfirmed();
	}
	if (!kw_comments_open()) {
		return kw_error('kw_off', 'Comments are switched off', 403);
	}
	$post = kw_find((int) $r['id']);
	if (!$post || $post->post_status !== 'publish') {
		return kw_error('kw_not_found', 'Item not found', 404);
	}
	$text = kw_post_text($r->get_param('content'), 2000);
	if (is_wp_error($text)) {
		return $text;
	}
	$error = kw_links_error($text);
	if ($error) {
		return $error;
	}
	// Check the limits, save, count: one request at a time per member.
	$lock = kw_member_lock($user);
	if (!kw_lock($lock)) {
		return kw_busy();
	}
	try {
		$error = kw_post_rate($user);
		if ($error) {
			return $error;
		}
		$c = kw_insert_comment($post->ID, 'kw_comment', $text, $user);
		if (is_wp_error($c)) {
			return $c;
		}
		kw_post_counted($user);
	} finally {
		kw_unlock($lock);
	}
	kw_notify_author('comment', $post, $c);
	return new WP_REST_Response(kw_post_json($c), 201);
}

/**
 * Whether the current user may edit (or report) a comment or reply now: the feature
 * must be on, and a reply's topic open (moderators may always). Reports skip the
 * topic rule; deleting your own post needs neither.
 */
function kw_comment_rules(WP_Comment $c, WP_Post $post, bool $closed_rule = true): ?WP_Error {
	if (kw_is_moderator()) {
		return null;
	}
	if ($c->comment_type === 'kw_comment') {
		return kw_comments_open() ? null : kw_error('kw_off', 'Comments are switched off', 403);
	}
	if (!kw_forum_open()) {
		return kw_error('kw_off', 'The forum is switched off', 403);
	}
	if ($closed_rule && get_post_meta($post->ID, '_kw_closed', true) === '1') {
		return kw_error('kw_closed', 'This topic is closed', 403);
	}
	return null;
}

/** The author edits their comment or reply at any time; moderators edit any. */
function kw_rest_edit_comment(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	$found = kw_find_post_comment((int) $r['id']);
	if (!$found) {
		return kw_error('kw_not_found', 'Comment not found', 404);
	}
	[$c, $post] = $found;
	$mod        = kw_is_moderator();
	if ((int) $c->user_id !== $user && !$mod) {
		return kw_error('kw_forbidden', 'You can edit only your own posts', 403);
	}
	if (!$mod && !kw_confirmed($user)) {
		return kw_unconfirmed();
	}
	$error = kw_comment_rules($c, $post);
	if ($error) {
		return $error;
	}
	$text = kw_post_text($r->get_param('content'), 2000);
	if (is_wp_error($text)) {
		return $text;
	}
	$error = kw_links_error($text) ?? kw_post_gap($user);
	if ($error) {
		return $error;
	}
	$stored  = kw_store_text($text);
	$changed = $stored !== $c->comment_content;
	$saved   = wp_update_comment(wp_slash(['comment_ID' => (int) $c->comment_ID, 'comment_content' => $stored]), true);
	if ($saved === false || is_wp_error($saved)) {
		return kw_error('kw_store', 'Could not save the post', 500);
	}
	update_comment_meta((int) $c->comment_ID, '_kw_edited', time());
	// New words from the author: people whose reports a moderator dismissed may report it again.
	if ($changed && !$mod) {
		delete_comment_meta((int) $c->comment_ID, '_kw_reports_cleared');
	}
	kw_post_counted($user, false, true);
	return kw_post_json(get_comment((int) $c->comment_ID));
}

/**
 * The author removes their comment or reply (to the trash) at any time: also in a
 * closed topic, while comments or the forum are switched off, and while the work or
 * topic is not shown. Moderators remove any they can see.
 */
function kw_rest_delete_comment(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	$found = kw_find_own_comment((int) $r['id']) ?? kw_find_post_comment((int) $r['id']);
	if (!$found) {
		return kw_error('kw_not_found', 'Comment not found', 404);
	}
	$c = $found[0];
	if ((int) $c->user_id !== $user && !kw_is_moderator()) {
		return kw_error('kw_forbidden', 'You can remove only your own posts', 403);
	}
	wp_trash_comment((int) $c->comment_ID);
	return ['removed' => true];
}

/** Reports on comments and replies others can see (approved ones). */
function kw_rest_report_comment(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	if (!kw_is_moderator() && !kw_confirmed($user)) {
		return kw_unconfirmed();
	}
	$found = kw_find_post_comment((int) $r['id']);
	if (!$found || $found[0]->comment_approved !== '1') {
		return kw_error('kw_not_found', 'Comment not found', 404);
	}
	[$c, $post] = $found;
	$error = kw_comment_rules($c, $post, false);
	if ($error) {
		return $error;
	}
	return kw_report_comment($c, $post, $r);
}

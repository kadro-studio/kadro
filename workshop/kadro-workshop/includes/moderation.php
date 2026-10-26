<?php
// Moderation: moderators approve or reject items waiting for review (with a
// reason the author sees), users report published items, and authors whose
// work has been approved a few times publish without waiting. Letters tell
// the author and the site admin what happened.

if (!defined('ABSPATH')) {
	exit;
}

add_action('rest_api_init', function () {
	register_rest_route('kadro/v1', '/items/(?P<id>\d+)/review', [
		'methods'             => 'POST',
		'callback'            => 'kw_rest_review',
		'permission_callback' => 'kw_is_moderator',
		'args'                => [
			'action' => ['type' => 'string', 'enum' => ['approve', 'reject', 'dismiss'], 'required' => true],
			'reason' => ['type' => 'string'],
		],
	]);
	register_rest_route('kadro/v1', '/items/(?P<id>\d+)/report', [
		'methods'             => 'POST',
		'callback'            => 'kw_rest_report',
		'permission_callback' => 'is_user_logged_in',
		'args'                => ['reason' => ['type' => 'string']],
	]);
	register_rest_route('kadro/v1', '/me/confirm', [
		'methods'             => 'POST',
		'callback'            => 'kw_rest_resend_confirmation',
		'permission_callback' => 'is_user_logged_in',
	]);
});

/** Authors with this many approved items publish without review (0 turns it off). */
function kw_trusted(int $user): bool {
	$after = (int) get_option('kw_trusted_after', 3);
	if ($after <= 0) {
		return false;
	}
	$q = new WP_Query([
		'post_type'      => KW_POST_TYPE,
		'post_status'    => 'publish',
		'author'         => $user,
		'fields'         => 'ids',
		'posts_per_page' => $after,
		'no_found_rows'  => true,
	]);
	return count($q->posts) >= $after;
}

/** Reports on an item: who sent them, why and when. */
function kw_reports(int $id): array {
	$v = get_post_meta($id, '_kw_reports', true);
	return is_array($v) ? $v : [];
}

function kw_reason(WP_REST_Request $r): string {
	return mb_substr(trim(sanitize_textarea_field((string) $r->get_param('reason'))), 0, 500);
}

function kw_rest_review(WP_REST_Request $r) {
	$post = get_post((int) $r['id']);
	if (!$post || $post->post_type !== KW_POST_TYPE || $post->post_status === 'trash') {
		return kw_error('kw_not_found', 'Item not found', 404);
	}
	$action = (string) $r['action'];
	$reason = kw_reason($r);
	$author = get_userdata((int) $post->post_author);
	$lang   = $author ? kw_user_lang($author->ID) : 0;
	$vars   = ['title' => get_the_title($post), 'kind' => kw_tl('kind_' . kw_meta($post->ID, 'kind'), $lang), 'page' => get_permalink($post), 'reason' => $reason];
	if ($action === 'approve') {
		wp_update_post(['ID' => $post->ID, 'post_status' => 'publish']);
		delete_post_meta($post->ID, '_kw_rejected');
		if ($author) {
			$vars['page'] = get_permalink($post->ID);
			kw_mail($author->user_email, kw_tl('mail_approved_subject', $lang, $vars), kw_tl('mail_approved_body', $lang, $vars));
		}
	} elseif ($action === 'reject') {
		if ($reason === '') {
			return kw_error('kw_reason', 'Say why, so the author can fix it', 400);
		}
		// A rejected item goes back to its author as a draft, with the reason.
		wp_update_post(['ID' => $post->ID, 'post_status' => 'draft']);
		update_post_meta($post->ID, '_kw_rejected', $reason);
		delete_post_meta($post->ID, '_kw_reports');
		if ($author) {
			kw_mail($author->user_email, kw_tl('mail_rejected_subject', $lang, $vars), kw_tl('mail_rejected_body', $lang, $vars));
		}
	} else {
		// Reports looked at and found harmless.
		delete_post_meta($post->ID, '_kw_reports');
	}
	return kw_item(get_post($post->ID));
}

function kw_rest_report(WP_REST_Request $r) {
	$post = kw_find((int) $r['id']);
	if (!$post || $post->post_status !== 'publish') {
		return kw_error('kw_not_found', 'Item not found', 404);
	}
	$user = get_current_user_id();
	if ((int) $post->post_author === $user) {
		return kw_error('kw_own', 'This is your own item', 400);
	}
	$reason = kw_reason($r);
	if ($reason === '') {
		return kw_error('kw_reason', 'Say what is wrong', 400);
	}
	$reports = kw_reports($post->ID);
	foreach ($reports as $rep) {
		if ((int) $rep['user'] === $user) {
			return ['reported' => true];
		}
	}
	$reports[] = ['user' => $user, 'reason' => $reason, 'time' => time()];
	update_post_meta($post->ID, '_kw_reports', array_slice($reports, -50));
	// The admin hears about the first report on an item; later ones only add up.
	if (count($reports) === 1) {
		$vars = ['title' => get_the_title($post), 'reason' => $reason, 'page' => get_permalink($post), 'count' => count($reports)];
		kw_mail(get_option('admin_email'), kw_tl('mail_report_subject', kw_lang(), $vars), kw_tl('mail_report_body', kw_lang(), $vars));
	}
	return ['reported' => true];
}

function kw_rest_resend_confirmation() {
	$user = get_current_user_id();
	if (kw_confirmed($user)) {
		return ['sent' => false, 'confirmed' => true];
	}
	$key = 'kw_resend_' . $user;
	if ((int) get_transient($key) >= 3) {
		return kw_error('kw_resend_limit', 'Too many letters; try again in an hour', 429);
	}
	set_transient($key, (int) get_transient($key) + 1, HOUR_IN_SECONDS);
	kw_send_confirmation($user);
	return ['sent' => true, 'confirmed' => false];
}

/** Tells the site admin that something new waits for review. */
function kw_notify_pending(WP_Post $post): void {
	$author = get_userdata((int) $post->post_author);
	$vars   = [
		'title'  => get_the_title($post),
		'author' => $author ? $author->display_name : '?',
		'kind'   => kw_tl('kind_' . kw_meta($post->ID, 'kind'), kw_lang()),
		'edit'   => admin_url('post.php?post=' . $post->ID . '&action=edit'),
	];
	kw_mail(get_option('admin_email'), kw_tl('mail_pending_subject', kw_lang(), $vars), kw_tl('mail_pending_body', kw_lang(), $vars));
}

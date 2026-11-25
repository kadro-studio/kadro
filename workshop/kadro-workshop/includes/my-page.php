<?php
// /my/: the member's own works — status, numbers, changing the title,
// description and tags, deleting. New works and new versions still come from
// the app. Also ?kadro=whoami, which tells the Kadro website who is signed in
// for the account menu in its header.

if (!defined('ABSPATH')) {
	exit;
}

/** Sites whose pages may ask who is signed in: the Kadro website, and a local copy of it while developing. */
function kw_site_origins(): array {
	$origins = ['https://kadro.studio'];
	if (wp_get_environment_type() === 'local') {
		$origins[] = 'http://localhost:5190';
		$origins[] = 'http://127.0.0.1:5190';
	}
	return apply_filters('kw_site_origins', $origins);
}

/**
 * Who is signed in, for the Kadro website (same site, so the browser sends the
 * sign-in cookie along): the display name, a sign-out link, whether the e-mail
 * is confirmed and the member moderates, links to their pages, and the REST
 * nonce the website sends with comments and forum posts. Only the website's
 * own pages can read it (CORS), so no other site gets the nonce.
 */
function kw_whoami(): void {
	$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
	if (in_array($origin, kw_site_origins(), true)) {
		header('Access-Control-Allow-Origin: ' . $origin);
		header('Access-Control-Allow-Credentials: true');
	}
	header('Vary: Origin');
	header('Content-Type: application/json; charset=utf-8');
	header('X-Content-Type-Options: nosniff');
	$u = wp_get_current_user();
	if (!$u->exists()) {
		echo wp_json_encode(['signedIn' => false]);
		return;
	}
	echo wp_json_encode([
		'signedIn'  => true,
		// WordPress stores display names HTML-escaped ("&amp;"); the website shows plain text.
		'name'      => kw_decode($u->display_name),
		'logout'    => kw_url('login', ['logout' => 1, '_wpnonce' => wp_create_nonce('kw_logout')]),
		'nonce'     => wp_create_nonce('wp_rest'),
		'confirmed' => kw_confirmed($u->ID),
		'moderator' => kw_is_moderator(),
		'account'   => kw_url('account'),
		'my'        => kw_url('my'),
	]);
}

/** What a work's author sees: 'publish', 'pending', 'rejected' (sent back with a reason) or 'draft'. */
function kw_work_status(WP_Post $post): string {
	if ($post->post_status === 'publish' || $post->post_status === 'pending') {
		return $post->post_status;
	}
	return kw_meta($post->ID, 'rejected') ? 'rejected' : 'draft';
}

/** Whether a change by this author shows at once, or waits for a moderator (the same rule as publishing from the app). */
function kw_publishes_directly(int $user): bool {
	return current_user_can('publish_posts') || get_option('kw_auto_publish') === '1' || kw_trusted($user);
}

function kw_my_page(): void {
	$lang = kw_page_lang();
	$t    = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$code = KW_LANG_CODES[$lang];
	if (!is_user_logged_in()) {
		wp_safe_redirect(kw_url('login', ['redirect_to' => kw_url('my'), 'lang' => $code]));
		exit;
	}
	$u     = wp_get_current_user();
	$error = '';
	$at    = 0;
	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		$action = sanitize_key($_POST['kw_action'] ?? '');
		$at     = (int) ($_POST['item'] ?? 0);
		if (!wp_verify_nonce((string) ($_POST['_wpnonce'] ?? ''), 'kw_my')) {
			$error = $t('session_expired');
		} else {
			[$error, $done] = kw_my_action($action, $at, $u, $lang);
			if ($error === '') {
				$deleted = $action === 'delete';
				wp_safe_redirect(kw_url('my', ['lang' => $code, 'done' => $done, 'item' => $deleted ? '' : $at]) . ($deleted ? '' : '#item-' . $at));
				exit;
			}
		}
	}
	$done = sanitize_key($_GET['done'] ?? '');
	$said = ['saved' => $t('work_saved'), 'review' => $t('work_in_review'), 'deleted' => $t('work_deleted')];
	if (!$at && isset($_GET['item'])) {
		$at = (int) $_GET['item'];
	}

	kw_page_start($t('my_title'), $lang, true);
	echo '<h1>' . esc_html($t('my_title')) . '</h1>';
	echo '<div class="kw-row"><a class="kw-btn ghost small" href="' . esc_url(KW_GALLERY . '?lang=' . $code) . '">' . esc_html($t('open_workshop')) . '</a>';
	echo '<a class="kw-btn ghost small" href="' . esc_url(kw_url('account', ['lang' => $code])) . '">' . esc_html($t('account_title')) . '</a></div>';
	echo '<p class="kw-small">' . esc_html($t('my_lead')) . '</p>';
	if ($done === 'deleted') {
		kw_notice($said['deleted'], 'ok');
	}

	$q = new WP_Query([
		'post_type'      => KW_POST_TYPE,
		'author'         => $u->ID,
		'post_status'    => ['publish', 'pending', 'draft'],
		'posts_per_page' => 100,
		'orderby'        => 'modified',
		'no_found_rows'  => true,
	]);
	// An error about a work that is not on the list (gone, or not theirs) shows at the top.
	if ($error && !in_array($at, wp_list_pluck($q->posts, 'ID'), true)) {
		kw_notice($error);
	}
	if (!$q->posts) {
		echo '<p>' . esc_html($t('items_none')) . '</p>';
	}
	$form   = fn(string $action, int $id) => '<form method="post" action="' . esc_url(kw_url('my', ['lang' => $code])) . '#item-' . $id . '">' . wp_nonce_field('kw_my', '_wpnonce', false, false) . kw_hidden(['kw_action' => $action, 'item' => $id]);
	$direct = kw_publishes_directly($u->ID);
	foreach ($q->posts as $post) {
		$id     = $post->ID;
		$status = kw_work_status($post);
		$kind   = kw_tl('kind_' . kw_meta($id, 'kind'), $lang);
		$thumb  = get_the_post_thumbnail_url($post, 'thumbnail');
		$tags   = wp_get_post_terms($id, KW_TAXONOMY, ['fields' => 'names']);
		$tags   = is_wp_error($tags) ? [] : $tags;
		$tag    = $status === 'rejected' ? 'status_sent_back' : 'status_' . $status;
		// Edited text is checked again, unless the author's works go out without review.
		$review = $status === 'rejected' || $status === 'draft' || ($status === 'publish' && !$direct);

		echo '<article class="kw-work" id="item-' . $id . '"><div class="kw-work-head">';
		echo $thumb ? '<img src="' . esc_url($thumb) . '" alt="">' : '<i class="kw-ph">' . esc_html($kind) . '</i>';
		echo '<div><b>' . esc_html(get_the_title($post)) . '</b><small>' . esc_html($kind . ' · v' . kw_meta($id, 'version', '1.0.0') . ' · ↓ ' . (int) kw_meta($id, 'downloads', 0) . ' · ♥ ' . (int) kw_meta($id, 'likes', 0) . ' · ' . $t('work_updated', ['date' => kw_date((int) get_post_modified_time('U', true, $post), $lang)])) . '</small></div>';
		echo '<span class="kw-tag ' . esc_attr($status) . '">' . esc_html($t($tag)) . '</span></div>';
		if ($status === 'rejected') {
			echo '<p class="kw-note">' . esc_html($t('moderator_said', ['reason' => kw_meta($id, 'rejected')])) . '</p>';
		}
		if ($at === $id) {
			if ($error) {
				kw_notice($error);
			} elseif (isset($said[$done])) {
				kw_notice($said[$done], 'ok');
			}
		}
		echo '<div class="kw-links">';
		if ($status === 'publish') {
			echo '<a class="kw-btn ghost small" href="' . esc_url(KW_GALLERY . '?lang=' . $code . '#item-' . $id) . '">' . esc_html($t('open_gallery')) . '</a>';
		}
		echo '<a class="kw-btn ghost small" href="' . esc_attr('kadro://workshop/item/' . $id) . '">' . esc_html($t('open_kadro')) . '</a></div>';

		// Title, description and tags; the file and new versions come from the app.
		echo '<details' . ($at === $id && $error ? ' open' : '') . '><summary>' . esc_html($t('work_edit')) . '</summary>' . $form('edit', $id);
		echo '<label>' . esc_html($t('work_title')) . '<input name="title" required maxlength="80" value="' . esc_attr($post->post_title) . '"></label>';
		echo '<label>' . esc_html($t('work_description')) . '<textarea name="description" rows="4" maxlength="1500">' . esc_textarea($post->post_content) . '</textarea></label>';
		echo '<label>' . esc_html($t('work_tags')) . '<input name="tags" maxlength="220" value="' . esc_attr(implode(', ', $tags)) . '"><small>' . esc_html($t('work_tags_hint')) . '</small></label>';
		if ($review) {
			echo '<p class="kw-small">' . esc_html($t('work_review_note')) . '</p>';
		}
		echo '<button class="kw-btn small" type="submit">' . esc_html($t('save')) . '</button></form></details>';

		echo '<details class="kw-danger"><summary>' . esc_html($t('work_delete')) . '</summary>' . $form('delete', $id);
		echo '<p>' . esc_html($t('work_delete_lead')) . '</p>';
		echo '<button class="kw-btn danger small" type="submit">' . esc_html($t('work_delete_submit', ['title' => get_the_title($post)])) . '</button></form></details>';
		echo '</article>';
	}
	kw_page_end($lang);
}

/** Does what a form on /my/ asked: ['', what was done] or [why not, '']. */
function kw_my_action(string $action, int $id, WP_User $u, int $lang): array {
	$t    = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$post = get_post($id);
	if (!$post || $post->post_type !== KW_POST_TYPE || (int) $post->post_author !== $u->ID || !in_array($post->post_status, ['publish', 'pending', 'draft'], true)) {
		return [$t('work_gone'), ''];
	}

	if ($action === 'delete') {
		wp_trash_post($post->ID);
		return ['', 'deleted'];
	}
	if ($action !== 'edit') {
		return [$t('session_expired'), ''];
	}
	if (!kw_is_moderator() && !kw_confirmed($u->ID)) {
		return [$t('work_unconfirmed'), ''];
	}
	$title = trim(sanitize_text_field(wp_unslash($_POST['title'] ?? '')));
	if ($title === '' || mb_strlen($title) > 80) {
		return [$t('work_title_bad'), ''];
	}
	$description = mb_substr(sanitize_textarea_field(wp_unslash($_POST['description'] ?? '')), 0, 1500);
	$tags        = kw_parse_tags((string) wp_unslash($_POST['tags'] ?? ''));
	$old_tags    = wp_get_post_terms($post->ID, KW_TAXONOMY, ['fields' => 'names']);
	$old_tags    = is_wp_error($old_tags) ? [] : $old_tags;
	$same_tags   = array_map('mb_strtolower', $tags);
	$was_tags    = array_map('mb_strtolower', $old_tags);
	sort($same_tags);
	sort($was_tags);
	if ($title === $post->post_title && $description === $post->post_content && $same_tags === $was_tags) {
		return ['', 'saved'];
	}

	// A published work stays out only if the author's works go out without review;
	// one sent back goes to review again with its new text.
	$status = $post->post_status === 'publish' && kw_publishes_directly($u->ID) ? 'publish' : 'pending';
	$saved  = wp_update_post(wp_slash(['ID' => $post->ID, 'post_title' => $title, 'post_content' => $description, 'post_status' => $status]), true);
	if (is_wp_error($saved)) {
		return [$t('session_expired'), ''];
	}
	wp_set_post_terms($post->ID, $tags, KW_TAXONOMY, false);
	if ($status === 'pending' && $post->post_status !== 'pending') {
		delete_post_meta($post->ID, '_kw_rejected');
		kw_notify_pending(get_post($post->ID));
	}
	return ['', $post->post_status === $status ? 'saved' : 'review'];
}

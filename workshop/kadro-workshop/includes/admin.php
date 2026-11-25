<?php
// WordPress admin: list columns, item details box, moderation count, settings, confirming e-mails by hand,
// reports on the Comments screen and the Forum and Feedback counts in the menu.

if (!defined('ABSPATH')) {
	exit;
}

add_filter('manage_' . KW_POST_TYPE . '_posts_columns', function ($cols) {
	$out = [];
	foreach ($cols as $k => $v) {
		$out[$k] = $v;
		if ($k === 'title') {
			$out['kw_kind']      = kw_t('kind');
			$out['kw_downloads'] = kw_t('downloads');
			$out['kw_likes']     = kw_t('likes');
			$out['kw_reports']   = kw_t('reports');
		}
	}
	return $out;
});

add_action('manage_' . KW_POST_TYPE . '_posts_custom_column', function ($col, $id) {
	if ($col === 'kw_kind') {
		echo esc_html(kw_t('kind_' . kw_meta($id, 'kind')));
	} elseif ($col === 'kw_downloads') {
		echo (int) kw_meta($id, 'downloads', 0);
	} elseif ($col === 'kw_likes') {
		echo (int) kw_meta($id, 'likes', 0);
	} elseif ($col === 'kw_reports') {
		$n = count(kw_reports((int) $id));
		echo $n ? '<strong style="color:#d63638">' . $n . '</strong>' : '0';
	}
}, 10, 2);

add_action('add_meta_boxes', function () {
	add_meta_box('kw_details', kw_t('item'), function (WP_Post $post) {
		$file = rest_url('kadro/v1/items/' . $post->ID . '/file');
		echo '<p><strong>' . esc_html(kw_t('kind')) . ':</strong> ' . esc_html(kw_t('kind_' . kw_meta($post->ID, 'kind'))) . '</p>';
		echo '<p><strong>' . esc_html(kw_t('version')) . ':</strong> ' . esc_html(kw_meta($post->ID, 'version')) . '</p>';
		echo '<p><strong>' . esc_html(kw_t('license')) . ':</strong> ' . esc_html(kw_meta($post->ID, 'license')) . '</p>';
		echo '<p><strong>' . esc_html(kw_t('file')) . ':</strong> <a href="' . esc_url($file) . '">' . esc_html(kw_meta($post->ID, 'file_name')) . '</a> (' . esc_html(size_format((int) kw_meta($post->ID, 'file_size', 0))) . ')</p>';
		echo '<p><code style="word-break:break-all">sha256 ' . esc_html(kw_meta($post->ID, 'sha256')) . '</code></p>';
		echo '<p>' . esc_html(kw_t('downloads')) . ': ' . (int) kw_meta($post->ID, 'downloads', 0) . ' · ' . esc_html(kw_t('likes')) . ': ' . (int) kw_meta($post->ID, 'likes', 0) . '</p>';
	}, KW_POST_TYPE, 'side', 'high');
});

// Number of items waiting for review next to the menu entry.
add_action('admin_menu', function () {
	global $menu;
	$pending = (int) wp_count_posts(KW_POST_TYPE)->pending;
	if (!$pending || !is_array($menu)) {
		return;
	}
	foreach ($menu as $i => $item) {
		if (($item[2] ?? '') === 'edit.php?post_type=' . KW_POST_TYPE) {
			$menu[$i][0] .= ' <span class="awaiting-mod"><span class="pending-count">' . $pending . '</span></span>';
		}
	}
}, 99);

/** A count bubble next to a top-level menu entry, like the one above. */
function kw_menu_bubble(string $slug, int $count): void {
	global $menu;
	if ($count <= 0 || !is_array($menu)) {
		return;
	}
	foreach ($menu as $i => $item) {
		if (($item[2] ?? '') === $slug) {
			$menu[$i][0] .= ' <span class="awaiting-mod"><span class="pending-count">' . $count . '</span></span>';
		}
	}
}

// Forum: hidden or reported topics and replies. Feedback: messages nobody has opened yet.
add_action('admin_menu', function () {
	if (current_user_can('edit_others_posts')) {
		kw_menu_bubble('edit.php?post_type=' . KW_TOPIC_TYPE, kw_forum_attention());
	}
	if (current_user_can('manage_options')) {
		kw_feedback_mark_open();
		kw_menu_bubble('edit.php?post_type=' . KW_FEEDBACK_TYPE, kw_feedback_unread());
	}
}, 99);

// Comments screen: reports on workshop comments and forum replies, and a way to dismiss them.
add_filter('manage_edit-comments_columns', function ($cols) {
	$cols['kw_reports'] = kw_t('reports');
	return $cols;
});

add_action('manage_comments_custom_column', function ($col, $id) {
	if ($col !== 'kw_reports') {
		return;
	}
	$c = get_comment((int) $id);
	if (!$c || !in_array($c->comment_type, KW_COMMENT_TYPES, true)) {
		return;
	}
	$reports = kw_comment_reports((int) $id);
	$reasons = array_map(fn($x) => kw_decode((string) ($x['reason'] ?? '')), array_slice($reports, -10));
	echo $reports ? '<strong style="color:#d63638" title="' . esc_attr(implode("\n", $reasons)) . '">' . count($reports) . '</strong>' : '0';
}, 10, 2);

add_filter('comment_row_actions', function ($actions, $c) {
	if ($c instanceof WP_Comment && in_array($c->comment_type, KW_COMMENT_TYPES, true) && kw_comment_reports((int) $c->comment_ID) && current_user_can('edit_comment', $c->comment_ID)) {
		$url = wp_nonce_url(admin_url('admin-post.php?action=kw_dismiss_reports&c=' . (int) $c->comment_ID), 'kw_dismiss_' . (int) $c->comment_ID);
		$actions['kw_dismiss'] = '<a href="' . esc_url($url) . '" title="' . esc_attr(kw_t('reports_dismiss_hint')) . '">' . esc_html(kw_t('reports_dismiss')) . '</a>';
	}
	return $actions;
}, 10, 2);

add_action('admin_post_kw_dismiss_reports', function () {
	$id = (int) ($_GET['c'] ?? 0);
	check_admin_referer('kw_dismiss_' . $id);
	$c = get_comment($id);
	if (!$c || !in_array($c->comment_type, KW_COMMENT_TYPES, true) || !current_user_can('edit_comment', $id)) {
		wp_die(esc_html__('Sorry, you are not allowed to edit this comment.'), 403);
	}
	kw_clear_reports('comment', $id);
	wp_safe_redirect(add_query_arg('kw_dismissed', 1, wp_get_referer() ?: admin_url('edit-comments.php')));
	exit;
});

// The comment-type filter on the Comments screen knows ours.
add_filter('admin_comment_types_dropdown', function ($types) {
	$types['kw_comment'] = kw_t('ctype_comment');
	$types['kw_reply']   = kw_t('ctype_reply');
	return $types;
});

add_action('admin_menu', function () {
	add_submenu_page('edit.php?post_type=' . KW_POST_TYPE, kw_t('settings'), kw_t('settings'), 'manage_options', 'kw-settings', 'kw_settings_page');
});

add_action('admin_init', function () {
	register_setting('kw_settings', 'kw_auto_publish', ['type' => 'string', 'sanitize_callback' => function ($v) {
		return $v === '1' ? '1' : '0';
	}]);
	register_setting('kw_settings', 'kw_daily_limit', ['type' => 'string', 'sanitize_callback' => function ($v) {
		return (string) max(1, min(500, (int) $v));
	}]);
	register_setting('kw_settings', 'kw_trusted_after', ['type' => 'string', 'sanitize_callback' => function ($v) {
		return (string) max(0, min(100, (int) $v));
	}]);
	// Comments, forum, feedback. Every option here needs a field on the page: options.php saves them all.
	foreach (['kw_comments_open', 'kw_forum_open', 'kw_feedback_open'] as $switch) {
		register_setting('kw_settings', $switch, ['type' => 'string', 'sanitize_callback' => function ($v) {
			return $v === '1' ? '1' : '0';
		}]);
	}
	register_setting('kw_settings', 'kw_post_limit', ['type' => 'string', 'sanitize_callback' => function ($v) {
		return (string) max(1, min(500, (int) $v));
	}]);
	register_setting('kw_settings', 'kw_auto_hide', ['type' => 'string', 'sanitize_callback' => function ($v) {
		return (string) max(0, min(50, (int) $v));
	}]);
	foreach (array_keys(kw_providers()) as $p) {
		register_setting('kw_settings', 'kw_' . $p . '_id', ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
		// The secret is never shown again: an empty field keeps the saved one.
		register_setting('kw_settings', 'kw_' . $p . '_secret', ['type' => 'string', 'sanitize_callback' => function ($v) use ($p) {
			$v = trim(sanitize_text_field((string) $v));
			return $v === '' ? (string) get_option('kw_' . $p . '_secret', '') : $v;
		}]);
	}
});

function kw_settings_page() {
	echo '<div class="wrap"><h1>' . esc_html(kw_t('settings')) . '</h1><form method="post" action="options.php">';
	settings_fields('kw_settings');
	echo '<table class="form-table"><tr><th>' . esc_html(kw_t('auto_publish')) . '</th><td><input type="checkbox" name="kw_auto_publish" value="1" ' . checked(get_option('kw_auto_publish'), '1', false) . '></td></tr>';
	echo '<tr><th>' . esc_html(kw_t('daily_limit')) . '</th><td><input type="number" min="1" max="500" name="kw_daily_limit" value="' . esc_attr(get_option('kw_daily_limit', '20')) . '"></td></tr>';
	echo '<tr><th>' . esc_html(kw_t('trusted_after')) . '</th><td><input type="number" min="0" max="100" name="kw_trusted_after" value="' . esc_attr(get_option('kw_trusted_after', '3')) . '"></td></tr></table>';
	echo '<h2>' . esc_html(kw_t('set_community')) . '</h2><table class="form-table">';
	foreach (['kw_comments_open' => 'set_comments_open', 'kw_forum_open' => 'set_forum_open', 'kw_feedback_open' => 'set_feedback_open'] as $option => $label) {
		echo '<tr><th>' . esc_html(kw_t($label)) . '</th><td><label><input type="checkbox" name="' . esc_attr($option) . '" value="1" ' . checked((string) get_option($option, '1'), '1', false) . '> ' . esc_html(kw_t('set_on')) . '</label></td></tr>';
	}
	echo '<tr><th></th><td><p class="description" style="margin-top:-12px">' . esc_html(kw_t('set_open_hint')) . '</p></td></tr>';
	echo '<tr><th>' . esc_html(kw_t('set_post_limit')) . '</th><td><input type="number" min="1" max="500" name="kw_post_limit" value="' . esc_attr(get_option('kw_post_limit', '30')) . '"></td></tr>';
	echo '<tr><th>' . esc_html(kw_t('set_auto_hide')) . '</th><td><input type="number" min="0" max="50" name="kw_auto_hide" value="' . esc_attr(get_option('kw_auto_hide', '3')) . '"><p class="description">' . esc_html(kw_t('set_auto_hide_hint')) . '</p></td></tr></table>';
	echo '<h2>' . esc_html(kw_t('social_settings')) . '</h2><p>' . esc_html(kw_t('social_settings_hint')) . '</p><table class="form-table">';
	$consoles = ['google' => 'https://console.cloud.google.com/apis/credentials', 'discord' => 'https://discord.com/developers/applications'];
	foreach (kw_providers() as $p => $pr) {
		$saved = get_option('kw_' . $p . '_secret') ? kw_t('secret_saved') : '';
		echo '<tr><th>' . esc_html($pr['name']) . '</th><td>';
		echo '<p><label>Client ID<br><input class="regular-text" name="kw_' . esc_attr($p) . '_id" value="' . esc_attr(get_option('kw_' . $p . '_id', '')) . '" autocomplete="off"></label></p>';
		echo '<p><label>Client secret<br><input class="regular-text" type="password" name="kw_' . esc_attr($p) . '_secret" placeholder="' . esc_attr($saved) . '" autocomplete="new-password"></label></p>';
		echo '<p class="description">' . esc_html(kw_t('redirect_uri')) . ': <code>' . esc_html(kw_oauth_redirect($p)) . '</code></p>';
		echo '<p class="description"><a href="' . esc_url($consoles[$p]) . '" target="_blank" rel="noopener">' . esc_html(kw_t('provider_console')) . '</a></p></td></tr>';
	}
	echo '</table>';
	submit_button();
	echo '</form></div>';
}

// Users list: whether each member confirmed their e-mail, and a way to confirm it by hand
// for someone whose letters do not arrive.
add_filter('manage_users_columns', function ($cols) {
	$cols['kw_email'] = kw_t('email_col');
	return $cols;
});

add_filter('manage_users_custom_column', function ($out, $col, $user) {
	if ($col !== 'kw_email') {
		return $out;
	}
	return kw_confirmed((int) $user) ? '✓' : '<span style="color:#b26200">' . esc_html(kw_t('email_not_yet')) . '</span>';
}, 10, 3);

add_filter('user_row_actions', function ($actions, WP_User $user) {
	if (!kw_confirmed($user->ID) && current_user_can('edit_user', $user->ID)) {
		$url = wp_nonce_url(admin_url('admin-post.php?action=kw_confirm_email&user=' . $user->ID), 'kw_confirm_email_' . $user->ID);
		$ask = kw_tl('confirm_email_ask', kw_lang(), ['email' => $user->user_email]);
		$actions['kw_confirm_email'] = '<a href="' . esc_url($url) . '" onclick="return confirm(' . esc_attr(wp_json_encode($ask)) . ')">' . esc_html(kw_t('confirm_email')) . '</a>';
	}
	return $actions;
}, 10, 2);

add_action('admin_post_kw_confirm_email', function () {
	$user = (int) ($_GET['user'] ?? 0);
	check_admin_referer('kw_confirm_email_' . $user);
	if (!get_userdata($user) || !current_user_can('edit_user', $user)) {
		wp_die(esc_html__('Sorry, you are not allowed to edit this user.'), 403);
	}
	update_user_meta($user, '_kw_email_confirmed', '1');
	delete_user_meta($user, '_kw_confirm_token');
	wp_safe_redirect(add_query_arg('kw_confirmed', $user, admin_url('users.php')));
	exit;
});

add_action('admin_notices', function () {
	$screen = get_current_screen();
	$user   = isset($_GET['kw_confirmed']) ? get_userdata((int) $_GET['kw_confirmed']) : false;
	if ($user && $screen && $screen->id === 'users') {
		echo '<div class="notice notice-success is-dismissible"><p>' . esc_html(kw_tl('email_confirmed_by_hand', kw_lang(), ['name' => $user->display_name])) . '</p></div>';
	}
	if (!empty($_GET['kw_dismissed']) && $screen && $screen->id === 'edit-comments') {
		echo '<div class="notice notice-success is-dismissible"><p>' . esc_html(kw_t('reports_dismissed')) . '</p></div>';
	}
});

// Removing an item also removes its stored file.
add_action('before_delete_post', function ($id) {
	if (get_post_type($id) !== KW_POST_TYPE) {
		return;
	}
	$file = kw_meta($id, 'file');
	if ($file) {
		@unlink(trailingslashit(kw_storage_dir()) . basename($file));
	}
});

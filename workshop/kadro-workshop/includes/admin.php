<?php
// WordPress admin: list columns, item details box, moderation count, settings.

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
});

function kw_settings_page() {
	echo '<div class="wrap"><h1>' . esc_html(kw_t('settings')) . '</h1><form method="post" action="options.php">';
	settings_fields('kw_settings');
	echo '<table class="form-table"><tr><th>' . esc_html(kw_t('auto_publish')) . '</th><td><input type="checkbox" name="kw_auto_publish" value="1" ' . checked(get_option('kw_auto_publish'), '1', false) . '></td></tr>';
	echo '<tr><th>' . esc_html(kw_t('daily_limit')) . '</th><td><input type="number" min="1" max="500" name="kw_daily_limit" value="' . esc_attr(get_option('kw_daily_limit', '20')) . '"></td></tr>';
	echo '<tr><th>' . esc_html(kw_t('trusted_after')) . '</th><td><input type="number" min="0" max="100" name="kw_trusted_after" value="' . esc_attr(get_option('kw_trusted_after', '3')) . '"></td></tr></table>';
	submit_button();
	echo '</form></div>';
}

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

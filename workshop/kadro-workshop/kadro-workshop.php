<?php
/**
 * Plugin Name: Kadro Workshop
 * Description: Community workshop for the Kadro video editor: shared effects, transitions, elements, filters, title styles, LUTs, themes and project templates, with sign-up, moderation, reports, likes and download counts. The Kadro app talks to it through the kadro/v1 REST API.
 * Version: 1.1.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Author: Kadro
 * License: MIT
 * Text Domain: kadro-workshop
 */

if (!defined('ABSPATH')) {
	exit;
}

const KW_POST_TYPE = 'kadro_item';
const KW_TAXONOMY  = 'kadro_tag';
const KW_KINDS     = ['effect', 'transition', 'element', 'look', 'textStyle', 'lut', 'theme', 'template'];
/** Largest upload per kind, bytes. */
const KW_MAX_BYTES = [
	'effect'     => 262144,
	'transition' => 262144,
	'element'    => 262144,
	'look'       => 8388608,
	'textStyle'  => 65536,
	'lut'        => 8388608,
	'theme'      => 16384,
	'template'   => 16777216,
];
const KW_EXTENSIONS = [
	'effect'     => 'vrmod',
	'transition' => 'vrmod',
	'element'    => 'vrmod',
	'look'       => 'kadroitem',
	'textStyle'  => 'kadroitem',
	'lut'        => 'cube',
	'theme'      => 'kadroitem',
	'template'   => 'kadroitem',
];

require_once __DIR__ . '/includes/strings.php';
require_once __DIR__ . '/includes/validate.php';
require_once __DIR__ . '/includes/rest.php';
require_once __DIR__ . '/includes/accounts.php';
require_once __DIR__ . '/includes/moderation.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/frontend.php';

// ---------------------------------------------------------------------------
// Data model

add_action('init', function () {
	register_post_type(KW_POST_TYPE, [
		'labels'       => [
			'name'          => kw_t('items'),
			'singular_name' => kw_t('item'),
			'menu_name'     => kw_t('menu'),
			'all_items'     => kw_t('all_items'),
			'edit_item'     => kw_t('edit_item'),
			'search_items'  => kw_t('search_items'),
		],
		'public'       => true,
		'has_archive'  => 'workshop',
		'rewrite'      => ['slug' => 'item'],
		'menu_icon'    => 'dashicons-store',
		'supports'     => ['title', 'editor', 'author', 'thumbnail', 'comments'],
		'show_in_rest' => false,
		// Items come from the app; the admin reviews and edits them.
		'capabilities' => ['create_posts' => 'do_not_allow'],
		'map_meta_cap' => true,
	]);
	register_taxonomy(KW_TAXONOMY, KW_POST_TYPE, [
		'labels'       => ['name' => kw_t('tags')],
		'public'       => true,
		'hierarchical' => false,
		'rewrite'      => ['slug' => 'workshop-tag'],
		'show_in_rest' => false,
	]);
});

register_activation_hook(__FILE__, function () {
	add_option('kw_auto_publish', '0');
	add_option('kw_daily_limit', '20');
	add_option('kw_trusted_after', '3');
	kw_storage_dir();
	flush_rewrite_rules();
});

register_deactivation_hook(__FILE__, function () {
	flush_rewrite_rules();
});

/** Folder for uploaded item files (served only through the REST API). */
function kw_storage_dir(): string {
	$dir = trailingslashit(wp_upload_dir()['basedir']) . 'kadro-workshop';
	if (!is_dir($dir)) {
		wp_mkdir_p($dir);
		// Apache: no listing, no direct access. Other servers rely on random file names.
		file_put_contents($dir . '/.htaccess', "Options -Indexes\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n");
		file_put_contents($dir . '/index.html', '');
	}
	return $dir;
}

function kw_meta(int $id, string $key, $default = '') {
	$v = get_post_meta($id, '_kw_' . $key, true);
	return $v === '' ? $default : $v;
}

/** Users who liked an item. */
function kw_likers(int $id): array {
	$v = get_post_meta($id, '_kw_liked_by', true);
	return is_array($v) ? array_map('intval', $v) : [];
}

/** Public shape of an item, as the app expects it (WorkshopItem). */
function kw_item(WP_Post $post): array {
	$author = get_userdata((int) $post->post_author);
	$tags   = wp_get_post_terms($post->ID, KW_TAXONOMY, ['fields' => 'names']);
	$thumb  = get_the_post_thumbnail_url($post, 'medium_large');
	$user   = get_current_user_id();
	$own    = $user && (int) $post->post_author === $user;
	$mod    = kw_is_moderator();
	$item   = [
		'id'          => $post->ID,
		'kind'        => kw_meta($post->ID, 'kind'),
		'title'       => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
		'description' => trim(wp_strip_all_tags($post->post_content)),
		'author'      => $author ? $author->display_name : '',
		'version'     => kw_meta($post->ID, 'version', '1.0.0'),
		'license'     => kw_meta($post->ID, 'license'),
		'tags'        => is_wp_error($tags) ? [] : array_values($tags),
		'created'     => mysql_to_rfc3339($post->post_date_gmt),
		'updated'     => mysql_to_rfc3339($post->post_modified_gmt),
		'downloads'   => (int) kw_meta($post->ID, 'downloads', 0),
		'likes'       => (int) kw_meta($post->ID, 'likes', 0),
		'liked'       => $user ? in_array($user, kw_likers($post->ID), true) : false,
		'status'      => $post->post_status,
		'fileName'    => kw_meta($post->ID, 'file_name'),
		'fileSize'    => (int) kw_meta($post->ID, 'file_size', 0),
		'preview'     => $thumb ? $thumb : null,
		'page'        => get_permalink($post),
		'own'         => $own,
	];
	// Why a moderator turned it down: for its author and the moderators.
	if ($own || $mod) {
		$item['rejected'] = kw_meta($post->ID, 'rejected') ?: null;
	}
	if ($mod) {
		$reports              = kw_reports($post->ID);
		$item['reports']      = count($reports);
		$item['reportReasons'] = array_values(array_map(fn($x) => (string) $x['reason'], array_slice($reports, -10)));
	}
	return $item;
}

/** Whether the current user may see an item (published, or their own / an editor). */
function kw_can_see(WP_Post $post): bool {
	if ($post->post_type !== KW_POST_TYPE) {
		return false;
	}
	if ($post->post_status === 'publish') {
		return true;
	}
	if ($post->post_status === 'trash') {
		return false;
	}
	$user = get_current_user_id();
	return $user && ((int) $post->post_author === $user || current_user_can('edit_post', $post->ID));
}

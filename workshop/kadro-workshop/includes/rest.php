<?php
// REST API used by the Kadro app (and the website): namespace kadro/v1.
// Signed-in requests use WordPress application passwords (Basic auth).

if (!defined('ABSPATH')) {
	exit;
}

add_action('rest_api_init', function () {
	register_rest_route('kadro/v1', '/items', [
		[
			'methods'             => 'GET',
			'callback'            => 'kw_rest_list',
			'permission_callback' => '__return_true',
			'args'                => [
				'kind'     => ['type' => 'string', 'enum' => KW_KINDS],
				'search'   => ['type' => 'string'],
				'sort'     => ['type' => 'string', 'enum' => ['popular', 'new', 'liked'], 'default' => 'popular'],
				'mine'     => ['type' => 'boolean', 'default' => false],
				'page'     => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
				'per_page' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 48, 'default' => 24],
			],
		],
		[
			'methods'             => 'POST',
			'callback'            => 'kw_rest_publish',
			'permission_callback' => 'is_user_logged_in',
		],
	]);
	register_rest_route('kadro/v1', '/items/(?P<id>\d+)', [
		[
			'methods'             => 'GET',
			'callback'            => 'kw_rest_get',
			'permission_callback' => '__return_true',
		],
		[
			'methods'             => 'DELETE',
			'callback'            => 'kw_rest_delete',
			'permission_callback' => 'is_user_logged_in',
		],
	]);
	register_rest_route('kadro/v1', '/items/(?P<id>\d+)/file', [
		'methods'             => 'GET',
		'callback'            => 'kw_rest_file',
		'permission_callback' => '__return_true',
	]);
	register_rest_route('kadro/v1', '/items/(?P<id>\d+)/like', [
		'methods'             => 'POST',
		'callback'            => 'kw_rest_like',
		'permission_callback' => 'is_user_logged_in',
	]);
	register_rest_route('kadro/v1', '/me', [
		'methods'             => 'GET',
		'callback'            => 'kw_rest_me',
		'permission_callback' => 'is_user_logged_in',
	]);
});

function kw_error(string $code, string $message, int $status): WP_Error {
	return new WP_Error($code, $message, ['status' => $status]);
}

/** Item by id that the current user may see, or null. */
function kw_find(int $id): ?WP_Post {
	$post = get_post($id);
	return $post && kw_can_see($post) ? $post : null;
}

function kw_rest_list(WP_REST_Request $r) {
	$mine = (bool) $r['mine'];
	if ($mine && !is_user_logged_in()) {
		return kw_error('kw_auth', 'Not signed in', 401);
	}
	$args = [
		'post_type'      => KW_POST_TYPE,
		'post_status'    => $mine ? ['publish', 'pending', 'draft'] : 'publish',
		'posts_per_page' => (int) $r['per_page'],
		'paged'          => (int) $r['page'],
		'no_found_rows'  => false,
	];
	if ($mine) {
		$args['author'] = get_current_user_id();
	}
	if (!empty($r['kind'])) {
		$args['meta_query'] = [['key' => '_kw_kind', 'value' => $r['kind']]];
	}
	if (!empty($r['search'])) {
		$args['s'] = sanitize_text_field($r['search']);
	}
	switch ($r['sort']) {
		case 'new':
			$args['orderby'] = 'date';
			$args['order']   = 'DESC';
			break;
		case 'liked':
			$args['meta_key'] = '_kw_likes';
			$args['orderby']  = ['meta_value_num' => 'DESC', 'date' => 'DESC'];
			break;
		default:
			$args['meta_key'] = '_kw_downloads';
			$args['orderby']  = ['meta_value_num' => 'DESC', 'date' => 'DESC'];
	}
	$q = new WP_Query($args);
	return [
		'items' => array_map('kw_item', $q->posts),
		'total' => (int) $q->found_posts,
		'pages' => max(1, (int) $q->max_num_pages),
	];
}

function kw_rest_get(WP_REST_Request $r) {
	$post = kw_find((int) $r['id']);
	return $post ? kw_item($post) : kw_error('kw_not_found', 'Item not found', 404);
}

function kw_rest_me() {
	$u = wp_get_current_user();
	return ['name' => $u->display_name, 'login' => $u->user_login, 'valid' => true];
}

function kw_rest_like(WP_REST_Request $r) {
	$post = kw_find((int) $r['id']);
	if (!$post || $post->post_status !== 'publish') {
		return kw_error('kw_not_found', 'Item not found', 404);
	}
	$user   = get_current_user_id();
	$likers = kw_likers($post->ID);
	$liked  = in_array($user, $likers, true);
	$likers = $liked ? array_values(array_diff($likers, [$user])) : array_merge($likers, [$user]);
	update_post_meta($post->ID, '_kw_liked_by', $likers);
	update_post_meta($post->ID, '_kw_likes', count($likers));
	return ['likes' => count($likers), 'liked' => !$liked];
}

function kw_rest_delete(WP_REST_Request $r) {
	$post = kw_find((int) $r['id']);
	if (!$post) {
		return kw_error('kw_not_found', 'Item not found', 404);
	}
	if ((int) $post->post_author !== get_current_user_id() && !current_user_can('delete_post', $post->ID)) {
		return kw_error('kw_forbidden', 'You can remove only your own items', 403);
	}
	wp_trash_post($post->ID);
	return ['removed' => true];
}

/** Sends the item's file and counts the download (once per visitor per day). */
function kw_rest_file(WP_REST_Request $r) {
	$post = kw_find((int) $r['id']);
	$file = $post ? kw_meta($post->ID, 'file') : '';
	$path = $file ? trailingslashit(kw_storage_dir()) . basename($file) : '';
	if (!$post || !$path || !is_file($path)) {
		return kw_error('kw_not_found', 'File not found', 404);
	}
	if ($post->post_status === 'publish') {
		$ip  = $_SERVER['REMOTE_ADDR'] ?? '';
		$key = 'kw_dl_' . md5($ip . '|' . $post->ID);
		if (!get_transient($key)) {
			set_transient($key, 1, DAY_IN_SECONDS);
			update_post_meta($post->ID, '_kw_downloads', (int) kw_meta($post->ID, 'downloads', 0) + 1);
		}
	}
	nocache_headers();
	header('Content-Type: application/octet-stream');
	header('Content-Length: ' . filesize($path));
	header('Content-Disposition: attachment; filename="' . rawurlencode(kw_meta($post->ID, 'file_name', 'item')) . '"');
	header('X-Content-Type-Options: nosniff');
	readfile($path);
	exit;
}

/** Uploads a new item or a new version of the user's own item. */
function kw_rest_publish(WP_REST_Request $r) {
	$user  = get_current_user_id();
	$files = $r->get_file_params();
	$kind  = (string) $r->get_param('kind');
	if (!in_array($kind, KW_KINDS, true)) {
		return kw_error('kw_kind', 'Unknown kind', 400);
	}
	$title = trim(sanitize_text_field((string) $r->get_param('title')));
	if ($title === '' || mb_strlen($title) > 80) {
		return kw_error('kw_title', 'Title must be 1–80 characters', 400);
	}
	$description = mb_substr(sanitize_textarea_field((string) $r->get_param('description')), 0, 1500);
	$version     = preg_replace('/[^0-9A-Za-z.\-]/', '', (string) $r->get_param('version')) ?: '1.0.0';
	$license     = mb_substr(sanitize_text_field((string) $r->get_param('license')), 0, 60) ?: 'CC BY 4.0';
	$tags        = array_slice(array_filter(array_map(function ($t) {
		return mb_substr(sanitize_text_field(trim($t)), 0, 24);
	}, explode(',', (string) $r->get_param('tags')))), 0, 8);

	// Daily upload limit per user (moderators are exempt).
	$limit = (int) get_option('kw_daily_limit', 20);
	if (!current_user_can('edit_others_posts')) {
		$today = new WP_Query([
			'post_type'      => KW_POST_TYPE,
			'post_status'    => 'any',
			'author'         => $user,
			'date_query'     => [['after' => '24 hours ago']],
			'fields'         => 'ids',
			'posts_per_page' => $limit + 1,
		]);
		if (count($today->posts) >= $limit) {
			return kw_error('kw_limit', 'Daily upload limit reached', 429);
		}
	}

	if (empty($files['file']['tmp_name']) || !is_readable($files['file']['tmp_name'])) {
		return kw_error('kw_file', 'Missing file', 400);
	}
	$data  = file_get_contents($files['file']['tmp_name']);
	$error = kw_validate_file($kind, $data);
	if ($error) {
		return kw_error('kw_invalid', $error, 400);
	}

	$update = (int) $r->get_param('update');
	if ($update) {
		$post = get_post($update);
		if (!$post || $post->post_type !== KW_POST_TYPE || (int) $post->post_author !== $user || kw_meta($post->ID, 'kind') !== $kind) {
			return kw_error('kw_forbidden', 'You can update only your own item of the same kind', 403);
		}
	}

	$status  = current_user_can('publish_posts') || get_option('kw_auto_publish') === '1' ? 'publish' : 'pending';
	$postarr = [
		'post_type'    => KW_POST_TYPE,
		'post_title'   => $title,
		'post_content' => $description,
		'post_status'  => $status,
		'post_author'  => $user,
	];
	if ($update) {
		$postarr['ID'] = $update;
		$id            = wp_update_post($postarr, true);
	} else {
		$id = wp_insert_post($postarr, true);
	}
	if (is_wp_error($id)) {
		return $id;
	}

	// Store the file under a random name; the old version is removed.
	$dir  = kw_storage_dir();
	$old  = kw_meta($id, 'file');
	$name = $id . '-' . wp_generate_password(16, false) . '.' . KW_EXTENSIONS[$kind];
	if (file_put_contents(trailingslashit($dir) . $name, $data) === false) {
		return kw_error('kw_store', 'Could not store the file', 500);
	}
	if ($old && $old !== $name) {
		@unlink(trailingslashit($dir) . basename($old));
	}
	$clean = sanitize_file_name((string) ($files['file']['name'] ?? 'item')) ?: 'item';
	$clean = preg_replace('/\.[^.]*$/', '', $clean) . '.' . KW_EXTENSIONS[$kind];
	update_post_meta($id, '_kw_kind', $kind);
	update_post_meta($id, '_kw_version', $version);
	update_post_meta($id, '_kw_license', $license);
	update_post_meta($id, '_kw_file', $name);
	update_post_meta($id, '_kw_file_name', $clean);
	update_post_meta($id, '_kw_file_size', strlen($data));
	update_post_meta($id, '_kw_sha256', hash('sha256', $data));
	if (!$update) {
		update_post_meta($id, '_kw_downloads', 0);
		update_post_meta($id, '_kw_likes', 0);
	}
	wp_set_post_terms($id, $tags, KW_TAXONOMY, false);

	// Preview rendered by the app becomes the featured image.
	if (!empty($files['preview']['tmp_name']) && is_readable($files['preview']['tmp_name'])) {
		$perror = kw_validate_preview($files['preview']['tmp_name']);
		if (!$perror) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
			$old_thumb = get_post_thumbnail_id($id);
			$attach    = media_handle_sideload(['name' => 'kadro-' . $id . '.jpg', 'tmp_name' => $files['preview']['tmp_name']], $id, $title);
			if (!is_wp_error($attach)) {
				set_post_thumbnail($id, $attach);
				if ($old_thumb) {
					wp_delete_attachment($old_thumb, true);
				}
			}
		}
	}
	return kw_item(get_post($id));
}

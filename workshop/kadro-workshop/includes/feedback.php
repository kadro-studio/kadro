<?php
// The feedback form on kadro.studio/contact/ (and later the app): anyone may
// write, no account needed. Messages are kept in WP admin (Feedback menu,
// administrators only) for a year and mailed to the site admin with Reply-To
// set to the sender's address, within the daily letter budget (community.php).

if (!defined('ABSPATH')) {
	exit;
}

const KW_FEEDBACK_TOPICS = ['question', 'bug', 'idea', 'workshop', 'other'];
/** At most this many messages are kept a day, from everyone together. */
const KW_FEEDBACK_STORE_DAY = 300;

add_action('init', function () {
	// Only administrators see the messages: every capability is manage_options, and nobody creates one by hand.
	$admin = 'manage_options';
	register_post_type(KW_FEEDBACK_TYPE, [
		'labels'              => [
			'name'          => kw_t('feedback_menu'),
			'singular_name' => kw_t('feedback_item'),
			'menu_name'     => kw_t('feedback_menu'),
			'all_items'     => kw_t('feedback_all'),
			'edit_item'     => kw_t('feedback_item'),
			'search_items'  => kw_t('feedback_search'),
			'not_found'     => kw_t('feedback_none'),
		],
		'public'              => false,
		'publicly_queryable'  => false,
		'exclude_from_search' => true,
		'show_ui'             => true,
		'show_in_menu'        => true,
		'show_in_nav_menus'   => false,
		'show_in_admin_bar'   => false,
		'menu_icon'           => 'dashicons-email-alt',
		'supports'            => ['title'],
		'delete_with_user'    => false,
		'show_in_rest'        => false,
		'has_archive'         => false,
		'rewrite'             => false,
		'query_var'           => false,
		'map_meta_cap'        => false,
		'capabilities'        => [
			'edit_post'              => $admin,
			'read_post'              => $admin,
			'delete_post'            => $admin,
			'edit_posts'             => $admin,
			'edit_others_posts'      => $admin,
			'edit_published_posts'   => $admin,
			'edit_private_posts'     => $admin,
			'publish_posts'          => $admin,
			'read_private_posts'     => $admin,
			'delete_posts'           => $admin,
			'delete_others_posts'    => $admin,
			'delete_published_posts' => $admin,
			'delete_private_posts'   => $admin,
			'read'                   => $admin,
			'create_posts'           => 'do_not_allow',
		],
	]);
});

// ---------------------------------------------------------------------------
// REST: POST kadro/v1/feedback

add_action('rest_api_init', function () {
	register_rest_route('kadro/v1', '/feedback', [
		'methods'             => 'POST',
		'callback'            => 'kw_rest_feedback',
		'permission_callback' => '__return_true',
		'args'                => [
			'name'    => ['type' => 'string'],
			'email'   => ['type' => 'string'],
			'topic'   => ['type' => 'string'],
			'message' => ['type' => 'string'],
			'page'    => ['type' => 'string'],
			'lang'    => ['type' => 'string'],
			'website' => ['type' => 'string'],
		],
	]);
});

function kw_rest_feedback(WP_REST_Request $r) {
	$elsewhere = kw_error('kw_forbidden', 'Send it from the Kadro website', 403);
	// Only a real POST: WordPress would also run this route for a GET with ?_method=POST
	// (an image on any web page, sent with no Origin), reading the fields from the address.
	if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) !== 'POST') {
		return $elsewhere;
	}
	// Browsers say where a request comes from: kadro.studio is the same site as the
	// workshop, another site is not; only the Kadro website's pages may send it (the app sends neither header).
	if (strtolower((string) $r->get_header('sec_fetch_site')) === 'cross-site') {
		return $elsewhere;
	}
	$origin = (string) $r->get_header('origin');
	if ($origin !== '' && !in_array($origin, kw_site_origins(), true)) {
		return $elsewhere;
	}
	if (!kw_feedback_open()) {
		return kw_error('kw_off', 'The feedback form is switched off', 403);
	}
	// The fields come only from the body, never from the address.
	$json = $r->get_json_params();
	$body = array_merge((array) $r->get_body_params(), is_array($json) ? $json : []);
	$in   = function (string $key) use ($body): string {
		return isset($body[$key]) && is_scalar($body[$key]) ? (string) $body[$key] : '';
	};
	// The hidden field is filled only by bots: they hear "sent", nothing is kept.
	if (trim($in('website')) !== '') {
		return ['sent' => true];
	}
	$name  = trim(mb_substr(kw_plain_text($in('name'), false), 0, 80));
	$raw   = trim($in('email'));
	$email = '';
	if ($raw !== '') {
		if (preg_match('/[\r\n]/', $raw) || !is_email($raw)) {
			return kw_error('kw_email', 'This e-mail does not look right', 400);
		}
		$email = sanitize_email($raw);
	}
	$topic   = in_array($in('topic'), KW_FEEDBACK_TOPICS, true) ? $in('topic') : 'other';
	$message = kw_plain_text($in('message'), true);
	$len     = mb_strlen($message);
	if ($len < 10 || $len > 3000) {
		return kw_error('kw_message', 'The message must be 10–3000 characters', 400);
	}
	$page = esc_url_raw(trim($in('page')), ['http', 'https']);
	$page = strlen($page) > 300 ? substr($page, 0, 300) : $page;
	$lang = in_array($in('lang'), ['uk', 'ru', 'en'], true) ? $in('lang') : '';

	// A few messages an hour from one address and for one e-mail, and a ceiling for
	// the day from everyone; counted once accepted.
	$hour = gmdate('YmdH');
	$ip   = 'fb' . kw_ip() . '|' . $hour;
	$mail = $email !== '' ? 'fbmail' . strtolower($email) . '|' . $hour : '';
	$day  = 'fb_store|' . gmdate('Ymd');
	if (kw_limited($ip, 5) || ($mail && kw_limited($mail, 3))) {
		return kw_error('kw_rate', 'Too many messages; please try again in an hour', 429);
	}
	if (kw_limited($day, KW_FEEDBACK_STORE_DAY)) {
		return kw_error('kw_rate', 'Too many messages today; please try again tomorrow', 429);
	}

	// Stored like posts (kw_store_text): everything that shows it decodes it once.
	$title = (string) preg_replace('/\s+/u', ' ', $message);
	$id    = wp_insert_post(wp_slash([
		'post_type'    => KW_FEEDBACK_TYPE,
		'post_status'  => 'publish',
		'post_title'   => kw_store_text(mb_strlen($title) > 70 ? rtrim(mb_substr($title, 0, 70)) . '…' : $title),
		'post_content' => kw_store_text($message),
		'post_author'  => 0,
	]), true);
	if (is_wp_error($id) || !$id) {
		return kw_error('kw_store', 'Could not save the message', 500);
	}
	kw_count($ip, HOUR_IN_SECONDS + 10 * MINUTE_IN_SECONDS);
	if ($mail) {
		kw_count($mail, HOUR_IN_SECONDS + 10 * MINUTE_IN_SECONDS);
	}
	kw_count($day, DAY_IN_SECONDS + HOUR_IN_SECONDS);
	$user = get_current_user_id();
	$meta = [
		'_kw_fb_name'   => kw_store_text($name),
		'_kw_fb_email'  => $email,
		'_kw_fb_topic'  => $topic,
		'_kw_fb_page'   => $page,
		'_kw_fb_lang'   => $lang,
		'_kw_fb_user'   => $user,
		'_kw_fb_mailed' => '0',
		'_kw_fb_read'   => '0',
	];
	foreach ($meta as $key => $value) {
		update_post_meta($id, $key, wp_slash($value));
	}
	if (kw_feedback_letter($id)) {
		update_post_meta($id, '_kw_fb_mailed', '1');
	}
	return ['sent' => true];
}

/** Mails a message to the site admin; the sender's address goes in Reply-To, never in From. */
function kw_feedback_letter(int $id): bool {
	$post = get_post($id);
	if (!$post) {
		return false;
	}
	$lang    = kw_lang();
	$name    = (string) get_post_meta($id, '_kw_fb_name', true);
	$email   = (string) get_post_meta($id, '_kw_fb_email', true);
	$topic   = (string) get_post_meta($id, '_kw_fb_topic', true);
	$user    = get_userdata((int) get_post_meta($id, '_kw_fb_user', true));
	$none    = '—';
	$replyto = $email !== '' && is_email($email) && !preg_match('/[\r\n]/', $email);
	$vars    = [
		'topic'   => kw_tl('fb_topic_' . ($topic ?: 'other'), $lang),
		'who'     => $name !== '' ? kw_decode($name) : ($email !== '' ? $email : kw_tl('fb_anonymous', $lang)),
		'message' => kw_decode($post->post_content),
		'name'    => $name !== '' ? kw_decode($name) : $none,
		'email'   => $email !== '' ? $email : $none,
		'page'    => (string) get_post_meta($id, '_kw_fb_page', true) ?: $none,
		'lang'    => (string) get_post_meta($id, '_kw_fb_lang', true) ?: $none,
		'account' => $user ? $user->user_login . ' (' . kw_decode($user->display_name) . ')' : $none,
		'reply'   => kw_tl($replyto ? 'mail_feedback_reply' : 'fb_no_email', $lang),
		'link'    => admin_url('post.php?post=' . $id . '&action=edit'),
	];
	return kw_mail_budget('feedback', (string) get_option('admin_email'), kw_tl('mail_feedback_subject', $lang, $vars), kw_tl('mail_feedback_body', $lang, $vars), $replyto ? ['Reply-To: ' . $email] : []);
}

// Messages are kept for a year.
add_action('kw_cleanup', function () {
	$old = get_posts([
		'post_type'        => KW_FEEDBACK_TYPE,
		'post_status'      => ['publish', 'draft', 'pending', 'private', 'trash'],
		'date_query'       => [['before' => '365 days ago', 'column' => 'post_date_gmt']],
		'fields'           => 'ids',
		'numberposts'      => 200,
		'suppress_filters' => true,
	]);
	foreach ($old as $id) {
		wp_delete_post((int) $id, true);
	}
});

// ---------------------------------------------------------------------------
// WordPress admin

/** Messages nobody has opened yet (for the menu bubble). */
function kw_feedback_unread(): int {
	$q = new WP_Query([
		'post_type'      => KW_FEEDBACK_TYPE,
		'post_status'    => 'publish',
		'meta_query'     => [['key' => '_kw_fb_read', 'value' => '0']],
		'fields'         => 'ids',
		'posts_per_page' => 1,
	]);
	return (int) $q->found_posts;
}

/** Opening a message marks it read (before the menu counts what is unread). */
function kw_feedback_mark_open(): void {
	global $pagenow;
	if ($pagenow !== 'post.php' || empty($_GET['post']) || !current_user_can('manage_options')) {
		return;
	}
	$id = (int) $_GET['post'];
	if (get_post_type($id) === KW_FEEDBACK_TYPE) {
		update_post_meta($id, '_kw_fb_read', '1');
	}
}

add_action('add_meta_boxes_' . KW_FEEDBACK_TYPE, function () {
	add_meta_box('kw_feedback', kw_t('feedback_item'), 'kw_feedback_box', KW_FEEDBACK_TYPE, 'normal', 'high');
});

/** The message, read-only, with everything sent along and a reply link. */
function kw_feedback_box(WP_Post $post): void {
	$id    = $post->ID;
	$email = (string) get_post_meta($id, '_kw_fb_email', true);
	$page  = (string) get_post_meta($id, '_kw_fb_page', true);
	$topic = (string) get_post_meta($id, '_kw_fb_topic', true);
	$user  = get_userdata((int) get_post_meta($id, '_kw_fb_user', true));
	// The text as stored: the screen's $post is prepared for editing (escaped again, depending on the browser).
	echo '<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;padding:12px 14px;background:#f6f7f7;border-radius:4px;margin:6px 0 14px">' . kw_html((string) get_post_field('post_content', $id, 'raw')) . '</div>';
	echo '<table class="form-table" role="presentation" style="margin-top:0">';
	$row = function (string $label, string $html) {
		echo '<tr><th scope="row" style="padding:6px 10px 6px 0">' . esc_html($label) . '</th><td style="padding:6px 10px">' . $html . '</td></tr>';
	};
	$name = (string) get_post_meta($id, '_kw_fb_name', true);
	$row(kw_t('fb_name'), $name !== '' ? kw_html($name) : '—');
	$row(kw_t('fb_email'), $email !== '' ? '<a href="' . esc_url('mailto:' . $email) . '">' . esc_html($email) . '</a>' : '—');
	$row(kw_t('fb_topic'), esc_html(kw_t('fb_topic_' . ($topic ?: 'other'))));
	$row(kw_t('fb_page'), $page !== '' ? '<a href="' . esc_url($page) . '" target="_blank" rel="noopener noreferrer">' . esc_html($page) . '</a>' : '—');
	$row(kw_t('fb_lang'), esc_html((string) get_post_meta($id, '_kw_fb_lang', true) ?: '—'));
	$row(kw_t('fb_account'), $user ? '<a href="' . esc_url(get_edit_user_link($user->ID)) . '">' . esc_html($user->user_login . ' (' . kw_decode($user->display_name) . ')') . '</a>' : '—');
	$row(kw_t('fb_date'), esc_html(get_the_date('', $post) . ' ' . get_the_time('', $post)));
	$row(kw_t('fb_mailed'), esc_html(kw_t(get_post_meta($id, '_kw_fb_mailed', true) === '1' ? 'fb_yes' : 'fb_no')));
	echo '</table>';
	if ($email !== '') {
		echo '<p><a class="button button-primary" href="' . esc_url('mailto:' . $email . '?subject=' . rawurlencode('Re: Kadro')) . '">' . esc_html(kw_t('fb_reply')) . '</a></p>';
	} else {
		echo '<p class="description">' . esc_html(kw_t('fb_no_email')) . '</p>';
	}
}

add_filter('manage_' . KW_FEEDBACK_TYPE . '_posts_columns', function ($cols) {
	$out = [];
	foreach ($cols as $k => $v) {
		if ($k === 'date') {
			$out['kw_from']   = kw_t('fb_from');
			$out['kw_topic']  = kw_t('fb_topic');
			$out['kw_mailed'] = kw_t('fb_mailed');
		}
		$out[$k] = $v;
	}
	return $out;
});

add_action('manage_' . KW_FEEDBACK_TYPE . '_posts_custom_column', function ($col, $id) {
	$id = (int) $id;
	if ($col === 'kw_from') {
		$name  = (string) get_post_meta($id, '_kw_fb_name', true);
		$email = (string) get_post_meta($id, '_kw_fb_email', true);
		echo $name !== '' ? kw_html($name) : '<em>' . esc_html(kw_t('fb_anonymous')) . '</em>';
		if ($email !== '') {
			echo '<br><a href="' . esc_url('mailto:' . $email) . '">' . esc_html($email) . '</a>';
		}
	} elseif ($col === 'kw_topic') {
		$topic = (string) get_post_meta($id, '_kw_fb_topic', true);
		echo esc_html(kw_t('fb_topic_' . ($topic ?: 'other')));
	} elseif ($col === 'kw_mailed') {
		echo esc_html(kw_t(get_post_meta($id, '_kw_fb_mailed', true) === '1' ? 'fb_yes' : 'fb_no'));
	}
}, 10, 2);

// Unread messages in bold.
add_filter('post_class', function ($classes, $class, $id) {
	if (is_admin() && get_post_type($id) === KW_FEEDBACK_TYPE && get_post_meta($id, '_kw_fb_read', true) !== '1') {
		$classes[] = 'kw-unread';
	}
	return $classes;
}, 10, 3);

add_action('admin_head-edit.php', function () {
	$screen = get_current_screen();
	if ($screen && $screen->post_type === KW_FEEDBACK_TYPE) {
		echo '<style>tr.kw-unread td,tr.kw-unread .row-title{font-weight:600}</style>';
	}
});

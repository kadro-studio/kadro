<?php
// Sign-in with Google or Discord (OAuth 2.0, authorization code). A button
// appears once the admin pastes the app's client ID and secret in the
// settings. The first time, a person picks the name others will see; later
// the same button signs them in. Members can connect either service from the
// account page.

if (!defined('ABSPATH')) {
	exit;
}

function kw_providers(): array {
	return [
		'google'  => [
			'name'  => 'Google',
			'auth'  => 'https://accounts.google.com/o/oauth2/v2/auth',
			'token' => 'https://oauth2.googleapis.com/token',
			'user'  => 'https://openidconnect.googleapis.com/v1/userinfo',
			'scope' => 'openid email profile',
			'extra' => ['prompt' => 'select_account'],
			'icon'  => '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>',
		],
		'discord' => [
			'name'  => 'Discord',
			'auth'  => 'https://discord.com/oauth2/authorize',
			'token' => 'https://discord.com/api/oauth2/token',
			'user'  => 'https://discord.com/api/users/@me',
			'scope' => 'identify email',
			'extra' => ['prompt' => 'none'],
			'icon'  => '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
		],
	];
}

function kw_provider_ready(string $p): bool {
	return get_option('kw_' . $p . '_id') !== false && trim((string) get_option('kw_' . $p . '_id')) !== '' && trim((string) get_option('kw_' . $p . '_secret')) !== '';
}

/** The address the service sends people back to; the admin registers it with the service. */
function kw_oauth_redirect(string $p): string {
	return kw_url('oauth', ['p' => $p]);
}

/** "Continue with Google / Discord" above the sign-in and sign-up forms. */
function kw_social_buttons(int $lang, array $ctx): void {
	$on = array_filter(array_keys(kw_providers()), 'kw_provider_ready');
	if (!$on) {
		return;
	}
	echo '<div class="kw-social">';
	foreach ($on as $p) {
		$pr = kw_providers()[$p];
		echo '<a class="' . esc_attr($p) . '" href="' . esc_url(kw_url('oauth', ['p' => $p] + $ctx)) . '">' . $pr['icon'] . esc_html(kw_tl('continue_with', $lang, ['name' => $pr['name']])) . '</a>';
	}
	echo '</div><div class="kw-or">' . esc_html(kw_tl('or', $lang)) . '</div>';
}

/** Why the last attempt with a service did not work (?oauth=…&via=…), or ''. */
function kw_oauth_notice(int $lang): string {
	$code = sanitize_key($_GET['oauth'] ?? '');
	$via  = sanitize_key($_GET['via'] ?? '');
	$all  = kw_providers();
	$keys = ['cancelled' => 'oauth_cancelled', 'failed' => 'oauth_failed', 'taken' => 'oauth_taken', 'link_first' => 'oauth_link_first', 'no_email' => 'oauth_no_email', 'closed' => 'join_closed'];
	if (!isset($keys[$code], $all[$via])) {
		return '';
	}
	return kw_tl($keys[$code], $lang, ['name' => $all[$via]['name']]);
}

function kw_cookie(string $name, string $value, int $ttl): void {
	setcookie($name, $value, ['expires' => time() + $ttl, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax']);
}

/** The member who signs in with this Google or Discord account, or 0. */
function kw_user_by_provider(string $p, string $id): int {
	$ids = get_users(['meta_key' => '_kw_' . $p, 'meta_value' => $id, 'number' => 1, 'fields' => 'ID']);
	return $ids ? (int) $ids[0] : 0;
}

/** Connects a service account to a member (and takes its picture if they have none from elsewhere). */
function kw_link_provider(int $user, string $p, array $profile): void {
	update_user_meta($user, '_kw_' . $p, $profile['id']);
	update_user_meta($user, '_kw_' . $p . '_email', $profile['email']);
	$from = (string) get_user_meta($user, '_kw_avatar_from', true);
	if ($profile['avatar'] && ($from === '' || $from === $p)) {
		update_user_meta($user, '_kw_avatar', esc_url_raw($profile['avatar']));
		update_user_meta($user, '_kw_avatar_from', $p);
	}
}

function kw_oauth_page(): void {
	$p    = (string) get_query_var('kw_provider');
	$p    = $p !== '' ? $p : sanitize_key(wp_unslash($_GET['p'] ?? ''));
	$lang = kw_page_lang();
	if (!isset(kw_providers()[$p]) || !kw_provider_ready($p)) {
		kw_message_page(kw_tl('oauth_off_title', $lang), kw_tl('oauth_off', $lang), $lang, kw_tl('login_submit', $lang), kw_url('login', ['lang' => KW_LANG_CODES[$lang]]));
	}
	// The service always sends the state back. (WordPress drops an "error" parameter on pretty addresses.)
	if (isset($_GET['state'])) {
		kw_oauth_return($p, $lang);
	} else {
		kw_oauth_start($p, $lang);
	}
}

function kw_oauth_start(string $p, int $lang): void {
	$ctx  = kw_ctx();
	$link = 0;
	if (!empty($_GET['link'])) {
		if (!is_user_logged_in() || !wp_verify_nonce((string) ($_GET['_wpnonce'] ?? ''), 'kw_link')) {
			kw_message_page(kw_tl('confirm_failed_title', $lang), kw_tl('session_expired', $lang), $lang, kw_tl('account_title', $lang), kw_url('account', ['lang' => $ctx['lang']]));
		}
		$link = get_current_user_id();
	}
	// The state ties the answer to this request, the cookie to this browser.
	$state   = wp_generate_password(32, false);
	$browser = wp_generate_password(32, false);
	set_transient('kw_oauth_' . $state, ['p' => $p, 'ctx' => $ctx, 'link' => $link, 'browser' => hash('sha256', $browser)], 15 * MINUTE_IN_SECONDS);
	kw_cookie('kw_oauth', $browser, 15 * MINUTE_IN_SECONDS);
	$pr   = kw_providers()[$p];
	$args = [
		'client_id'     => trim((string) get_option('kw_' . $p . '_id')),
		'redirect_uri'  => kw_oauth_redirect($p),
		'response_type' => 'code',
		'scope'         => $pr['scope'],
		'state'         => $state,
	] + $pr['extra'];
	wp_redirect($pr['auth'] . '?' . http_build_query($args, '', '&', PHP_QUERY_RFC3986));
	exit;
}

/** The service's answer: the person, as {id, email, verified, name, avatar}, or null. */
function kw_oauth_profile(string $p, string $code): ?array {
	$pr  = kw_providers()[$p];
	$res = wp_remote_post($pr['token'], [
		'timeout' => 15,
		'headers' => ['Accept' => 'application/json'],
		'body'    => [
			'grant_type'    => 'authorization_code',
			'code'          => $code,
			'redirect_uri'  => kw_oauth_redirect($p),
			'client_id'     => trim((string) get_option('kw_' . $p . '_id')),
			'client_secret' => trim((string) get_option('kw_' . $p . '_secret')),
		],
	]);
	$token = is_wp_error($res) ? null : json_decode(wp_remote_retrieve_body($res), true);
	if (empty($token['access_token'])) {
		return null;
	}
	$res = wp_remote_get($pr['user'], ['timeout' => 15, 'headers' => ['Authorization' => 'Bearer ' . $token['access_token'], 'Accept' => 'application/json']]);
	$d   = is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200 ? null : json_decode(wp_remote_retrieve_body($res), true);
	if (!is_array($d)) {
		return null;
	}
	if ($p === 'google') {
		$profile = [
			'id'       => (string) ($d['sub'] ?? ''),
			'email'    => strtolower((string) ($d['email'] ?? '')),
			'verified' => !empty($d['email_verified']) && $d['email_verified'] !== 'false',
			'name'     => (string) ($d['name'] ?? ''),
			'avatar'   => (string) ($d['picture'] ?? ''),
		];
	} else {
		$id      = (string) ($d['id'] ?? '');
		$profile = [
			'id'       => $id,
			'email'    => strtolower((string) ($d['email'] ?? '')),
			'verified' => !empty($d['verified']),
			'name'     => (string) (($d['global_name'] ?? '') ?: ($d['username'] ?? '')),
			'avatar'   => !empty($d['avatar']) ? 'https://cdn.discordapp.com/avatars/' . rawurlencode($id) . '/' . rawurlencode((string) $d['avatar']) . '.png?size=128' : '',
		];
	}
	return $profile['id'] !== '' ? $profile : null;
}

function kw_oauth_return(string $p, int $lang): void {
	$state   = preg_replace('/[^A-Za-z0-9]/', '', (string) wp_unslash($_GET['state'] ?? ''));
	$saved   = $state !== '' ? get_transient('kw_oauth_' . $state) : false;
	$browser = (string) ($_COOKIE['kw_oauth'] ?? '');
	if ($saved) {
		delete_transient('kw_oauth_' . $state);
	}
	kw_cookie('kw_oauth', '', -HOUR_IN_SECONDS);
	if (!is_array($saved) || $saved['p'] !== $p || !hash_equals($saved['browser'], hash('sha256', $browser))) {
		kw_message_page(kw_tl('confirm_failed_title', $lang), kw_tl('oauth_failed', $lang, ['name' => kw_providers()[$p]['name']]), $lang, kw_tl('login_submit', $lang), kw_url('login', ['lang' => KW_LANG_CODES[$lang]]));
	}
	$ctx  = $saved['ctx'];
	$link = (int) $saved['link'];
	$back = $link ? kw_url('account', ['lang' => $ctx['lang']]) : kw_url('login', $ctx);
	$fail = function (string $why) use ($back, $p, $link) {
		wp_safe_redirect(add_query_arg(['oauth' => $why, 'via' => $p], $back) . ($link ? '#signin' : ''));
		exit;
	};
	if (!isset($_GET['code'])) {
		$fail('cancelled');
	}
	$profile = kw_oauth_profile($p, (string) wp_unslash($_GET['code'] ?? ''));
	if (!$profile) {
		$fail('failed');
	}
	$owner = kw_user_by_provider($p, $profile['id']);

	// Connecting a service from the account page.
	if ($link) {
		if (get_current_user_id() !== $link) {
			$fail('failed');
		}
		if ($owner && $owner !== $link) {
			$fail('taken');
		}
		kw_link_provider($link, $p, $profile);
		wp_safe_redirect(kw_url('account', ['lang' => $ctx['lang'], 'done' => 'linked', 'via' => $p]) . '#signin');
		exit;
	}

	// A member who already has an account with this e-mail: the service has confirmed it, so the two are joined.
	if (!$owner && $profile['email'] !== '' && $profile['verified']) {
		$same = get_user_by('email', $profile['email']);
		if ($same) {
			// Moderators connect services themselves, signed in with their password.
			if (user_can($same, 'edit_others_posts')) {
				$fail('link_first');
			}
			kw_claim_account($same->ID, $p);
			kw_link_provider($same->ID, $p, $profile);
			$owner = $same->ID;
		}
	}
	if ($owner) {
		kw_link_provider($owner, $p, $profile);
		kw_sign_in($owner);
		wp_safe_redirect(kw_after_login($ctx));
		exit;
	}

	// Someone new: they pick a name on /join/ and agree to the rules.
	if ($profile['email'] === '' || !$profile['verified']) {
		$fail('no_email');
	}
	if (!get_option('users_can_register')) {
		$fail('closed');
	}
	$token = wp_generate_password(32, false);
	set_transient('kw_social_' . $token, ['p' => $p] + $profile, 20 * MINUTE_IN_SECONDS);
	kw_cookie('kw_social', $token, 20 * MINUTE_IN_SECONDS);
	wp_safe_redirect(kw_url('join', $ctx + ['social' => 1]));
	exit;
}

/** Someone back from Google or Discord who has not finished signing up yet, or null. */
function kw_social_pending(): ?array {
	$token = (string) ($_COOKIE['kw_social'] ?? '');
	$data  = preg_match('/^[A-Za-z0-9]{32}$/', $token) ? get_transient('kw_social_' . $token) : false;
	return is_array($data) ? $data + ['token' => $token] : null;
}

/** Finishes a sign-up made with a service: its e-mail is confirmed, and there is no password yet. */
function kw_social_attach(int $user, array $social): void {
	kw_link_provider($user, $social['p'], $social);
	update_user_meta($user, '_kw_email_confirmed', '1');
	update_user_meta($user, '_kw_no_password', '1');
	delete_transient('kw_social_' . $social['token']);
	kw_cookie('kw_social', '', -HOUR_IN_SECONDS);
}

/** A free login name made from the person's name or e-mail. */
function kw_suggest_login(string $name, string $email): string {
	$clean = fn(string $s) => substr(preg_replace('/[^A-Za-z0-9._-]/', '', sanitize_user(remove_accents($s), true)), 0, 24);
	$base  = $clean(str_replace(' ', '', $name));
	if (strlen($base) < 3) {
		$base = $clean((string) strstr($email, '@', true));
	}
	if (strlen($base) < 3) {
		$base = 'member';
	}
	$login = $base;
	for ($n = 2; username_exists($login) && $n < 1000; $n++) {
		$login = $base . $n;
	}
	return $login;
}

// Pictures from Google or Discord for members who signed in with them.
add_filter('pre_get_avatar_data', function ($args, $who) {
	$user = 0;
	if (is_numeric($who)) {
		$user = (int) $who;
	} elseif ($who instanceof WP_User) {
		$user = $who->ID;
	} elseif ($who instanceof WP_Post) {
		$user = (int) $who->post_author;
	} elseif ($who instanceof WP_Comment) {
		$user = (int) $who->user_id;
	} elseif (is_string($who) && is_email($who)) {
		$u    = get_user_by('email', $who);
		$user = $u ? $u->ID : 0;
	}
	$url = $user ? (string) get_user_meta($user, '_kw_avatar', true) : '';
	if ($url) {
		$args['url']          = $url;
		$args['found_avatar'] = true;
	}
	return $args;
}, 10, 2);

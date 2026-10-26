<?php
// Accounts: sign-up, sign-in, password reset and connecting the Kadro app,
// e-mail confirmation and the letters the workshop sends. People who sign up
// can publish once their e-mail is confirmed; everyone can browse and download
// without an account. The WordPress sign-in stays for the site admin.

if (!defined('ABSPATH')) {
	exit;
}

/** Moderators publish without review and see everything waiting for it. */
function kw_is_moderator(): bool {
	return current_user_can('edit_others_posts');
}

/**
 * Whether a user may publish: people who signed up on /join/ confirm their
 * e-mail first; accounts made any other way (the admin, invited users) count as confirmed.
 */
function kw_confirmed(int $user): bool {
	return get_user_meta($user, '_kw_email_confirmed', true) !== '0';
}

/** Accounts made with Google or Discord have no password of their own until they set one. */
function kw_has_password(int $user): bool {
	return get_user_meta($user, '_kw_no_password', true) !== '1';
}

/** Language index (0 en, 1 ru, 2 uk) for a user's letters, from their locale. */
function kw_user_lang(int $user): int {
	$locale = get_user_locale($user);
	if (strpos($locale, 'uk') === 0) {
		return 2;
	}
	return strpos($locale, 'ru') === 0 ? 1 : 0;
}

/** A string in a given language, with {placeholders} filled in. */
function kw_tl(string $key, int $lang, array $vars = []): string {
	$s = kw_strings();
	$text = isset($s[$key]) ? $s[$key][$lang] : $key;
	foreach ($vars as $k => $v) {
		$text = str_replace('{' . $k . '}', (string) $v, $text);
	}
	return $text;
}

/** Plain-text letter; a failure to send never stops the action that caused it. */
function kw_mail(string $to, string $subject, string $body): void {
	if (!is_email($to)) {
		return;
	}
	wp_mail($to, '[' . kw_tl('site_name', 0) . '] ' . $subject, $body);
}

function kw_send_confirmation(int $user): void {
	$u = get_userdata($user);
	if (!$u) {
		return;
	}
	$token = wp_generate_password(32, false);
	update_user_meta($user, '_kw_confirm_token', wp_hash_password($token));
	$lang = kw_user_lang($user);
	$link = kw_url('confirm', ['u' => $user, 't' => $token, 'lang' => KW_LANG_CODES[$lang]]);
	kw_mail($u->user_email, kw_tl('mail_confirm_subject', $lang), kw_tl('mail_confirm_body', $lang, ['name' => $u->display_name, 'link' => $link]));
}

/** Sends the confirmation letter again, at most three times an hour: 'sent', 'limit' or 'confirmed'. */
function kw_resend_confirmation(int $user): string {
	if (kw_confirmed($user)) {
		return 'confirmed';
	}
	$key = 'kw_resend_' . $user;
	if ((int) get_transient($key) >= 3) {
		return 'limit';
	}
	set_transient($key, (int) get_transient($key) + 1, HOUR_IN_SECONDS);
	kw_send_confirmation($user);
	return 'sent';
}

function kw_send_reset(WP_User $user): void {
	// A few letters an hour per account, whoever asks for them.
	if (kw_limited('reset' . $user->ID, 3)) {
		return;
	}
	$key = get_password_reset_key($user);
	if (is_wp_error($key)) {
		return;
	}
	kw_count('reset' . $user->ID, HOUR_IN_SECONDS);
	$lang = kw_user_lang($user->ID);
	$link = kw_url('reset', ['login' => $user->user_login, 'key' => $key, 'lang' => KW_LANG_CODES[$lang]]);
	kw_mail($user->user_email, kw_tl('mail_reset_subject', $lang), kw_tl('mail_reset_body', $lang, ['name' => $user->display_name, 'link' => $link]));
}

function kw_sign_in(int $user): void {
	$u = get_userdata($user);
	wp_set_current_user($user);
	wp_set_auth_cookie($user, true, is_ssl());
	do_action('wp_login', $u->user_login, $u);
}

/** Why a login name cannot be used, or '' when it can. */
function kw_login_error(string $login, int $lang): string {
	if (mb_strlen($login) < 3 || mb_strlen($login) > 30 || !validate_username($login)) {
		return kw_tl('join_bad_login', $lang);
	}
	return username_exists($login) ? kw_tl('join_login_taken', $lang) : '';
}

// ---------------------------------------------------------------------------
// /join/: sign up with an e-mail, or finish signing up with Google or Discord

function kw_join_page(): void {
	$lang   = kw_page_lang();
	$t      = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$ctx    = kw_ctx();
	$social = !empty($_REQUEST['social']) ? kw_social_pending() : null;
	if (is_user_logged_in()) {
		wp_safe_redirect(kw_after_login($ctx));
		exit;
	}
	$error = !empty($_REQUEST['social']) && !$social ? $t('social_expired') : '';
	$login = $social ? kw_suggest_login($social['name'], $social['email']) : '';
	$email = '';

	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		$error = '';
		$login = sanitize_user(wp_unslash($_POST['login'] ?? ''), true);
		$email = $social ? $social['email'] : sanitize_email(wp_unslash($_POST['email'] ?? ''));
		$pass  = $social ? wp_generate_password(32, true, true) : (string) wp_unslash($_POST['password'] ?? '');
		$key   = 'join' . kw_ip();
		if (!get_option('users_can_register')) {
			$error = $t('join_closed');
		} elseif (!empty($_POST['website'])) {
			// The hidden field is filled only by bots.
			$error = $t('join_failed');
		} elseif (kw_limited($key, 5)) {
			$error = $t('join_too_many');
		} elseif (($bad = kw_login_error($login, $lang)) !== '') {
			$error = $bad;
		} elseif (!is_email($email)) {
			$error = $t('join_bad_email');
		} elseif (email_exists($email)) {
			$error = $t('join_email_taken');
		} elseif (mb_strlen($pass) < 8) {
			$error = $t('join_short_password');
		} elseif (empty($_POST['agree'])) {
			$error = $t('join_agree_needed');
		} else {
			// Anti-spam plugins check sign-ups through the usual WordPress filters.
			$errors = apply_filters('registration_errors', new WP_Error(), $login, $email);
			if ($errors instanceof WP_Error && $errors->has_errors()) {
				$error = wp_strip_all_tags($errors->get_error_message());
			} else {
				$id = wp_insert_user([
					'user_login'   => $login,
					'user_email'   => $email,
					'user_pass'    => $pass,
					'display_name' => $login,
					'nickname'     => $login,
					'role'         => get_option('default_role', 'subscriber') ?: 'subscriber',
					'locale'       => KW_LOCALES[$lang],
				]);
				if (is_wp_error($id)) {
					$error = wp_strip_all_tags($id->get_error_message());
				} else {
					kw_count($key, HOUR_IN_SECONDS);
					if ($social) {
						kw_social_attach($id, $social);
					} else {
						update_user_meta($id, '_kw_email_confirmed', '0');
						kw_send_confirmation($id);
					}
					kw_sign_in($id);
					$next = $ctx['from'] === 'app' || $ctx['redirect_to'] ? kw_after_login($ctx) : kw_url('account', ['lang' => $ctx['lang'], 'welcome' => 1]);
					wp_safe_redirect($next);
					exit;
				}
			}
		}
	}

	$action = kw_url('join', $ctx + ['social' => $social ? 1 : '']);
	$rules  = '<label class="kw-check"><input type="checkbox" name="agree" value="1" required> <span>' . esc_html($t('join_rules')) . '</span></label>';
	if ($social) {
		kw_page_start($t('social_title'), $lang);
		echo '<h1>' . esc_html($t('social_title')) . '</h1>';
		echo '<p>' . esc_html($t('social_lead', ['email' => $social['email'], 'provider' => kw_providers()[$social['p']]['name']])) . '</p>';
		kw_notice($error);
		echo '<form method="post" action="' . esc_url($action) . '">';
		echo '<label>' . esc_html($t('join_login')) . '<input name="login" required minlength="3" maxlength="30" autocomplete="username" value="' . esc_attr($login) . '"><small>' . esc_html($t('join_login_hint')) . '</small></label>';
		echo $rules . '<button class="kw-btn" type="submit">' . esc_html($t('join_submit')) . '</button></form>';
		kw_page_end();
		return;
	}
	kw_page_start($t('join_title'), $lang);
	kw_tabs('join', $lang, $ctx);
	echo '<p>' . esc_html($t('join_lead')) . '</p>';
	kw_social_buttons($lang, $ctx);
	kw_notice($error);
	echo '<form method="post" action="' . esc_url($action) . '">';
	echo '<label>' . esc_html($t('join_login')) . '<input name="login" required minlength="3" maxlength="30" autocomplete="username" value="' . esc_attr($login) . '"><small>' . esc_html($t('join_login_hint')) . '</small></label>';
	echo '<label>' . esc_html($t('join_email')) . '<input name="email" type="email" required autocomplete="email" value="' . esc_attr($email) . '"><small>' . esc_html($t('join_email_hint')) . '</small></label>';
	echo '<label>' . esc_html($t('join_password')) . '<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>';
	echo '<label class="kw-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>';
	echo $rules . '<button class="kw-btn" type="submit">' . esc_html($t('join_submit')) . '</button></form>';
	kw_page_end($lang);
}

// ---------------------------------------------------------------------------
// /login/: sign in with a name or e-mail and a password (or Google, Discord)

function kw_login_page(): void {
	$lang   = kw_page_lang();
	$t      = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$ctx    = kw_ctx();
	$notice = '';
	if (isset($_GET['logout']) && wp_verify_nonce((string) ($_GET['_wpnonce'] ?? ''), 'kw_logout')) {
		wp_logout();
		$notice = $t('logged_out');
	} elseif (is_user_logged_in()) {
		wp_safe_redirect(kw_after_login($ctx));
		exit;
	}
	$error = kw_oauth_notice($lang);
	$log   = '';
	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		$log = trim(sanitize_text_field(wp_unslash($_POST['log'] ?? '')));
		$key = 'login' . kw_ip();
		if (kw_limited($key, 10)) {
			$error = $t('login_too_many');
		} else {
			$user = wp_signon([
				'user_login'    => $log,
				'user_password' => (string) wp_unslash($_POST['pwd'] ?? ''),
				'remember'      => !empty($_POST['remember']),
			], is_ssl());
			if (is_wp_error($user)) {
				kw_count($key, 15 * MINUTE_IN_SECONDS);
				$error = $t('login_failed');
			} else {
				wp_set_current_user($user->ID);
				wp_safe_redirect(kw_after_login($ctx));
				exit;
			}
		}
	}
	kw_page_start($t('login_title'), $lang);
	kw_tabs('login', $lang, $ctx);
	echo '<p>' . esc_html($t($ctx['from'] === 'app' ? 'login_lead_app' : 'login_lead')) . '</p>';
	kw_social_buttons($lang, $ctx);
	kw_notice($notice, 'ok');
	kw_notice($error);
	echo '<form method="post" action="' . esc_url(kw_url('login', $ctx)) . '">';
	echo '<label>' . esc_html($t('login_name')) . '<input name="log" required autocomplete="username" value="' . esc_attr($log) . '"></label>';
	echo '<label>' . esc_html($t('login_password')) . '<input name="pwd" type="password" required autocomplete="current-password"></label>';
	echo '<div class="kw-row" style="margin:-2px 0 16px"><label class="kw-check" style="margin:0"><input type="checkbox" name="remember" value="1" checked> <span>' . esc_html($t('login_remember')) . '</span></label>';
	echo '<a href="' . esc_url(kw_url('forgot', ['lang' => $ctx['lang']])) . '" style="font-size:13.5px">' . esc_html($t('login_forgot')) . '</a></div>';
	echo '<button class="kw-btn" type="submit">' . esc_html($t('login_submit')) . '</button></form>';
	kw_page_end($lang);
}

// ---------------------------------------------------------------------------
// /forgot/ and /reset/: a link by e-mail to set a new password

function kw_forgot_page(): void {
	$lang  = kw_page_lang();
	$t     = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$error = '';
	$sent  = false;
	$log   = '';
	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		$log = trim(sanitize_text_field(wp_unslash($_POST['log'] ?? '')));
		$key = 'forgot' . kw_ip();
		if (kw_limited($key, 5)) {
			$error = $t('forgot_too_many');
		} elseif ($log !== '') {
			kw_count($key, HOUR_IN_SECONDS);
			$user = is_email($log) ? get_user_by('email', $log) : get_user_by('login', $log);
			if ($user) {
				kw_send_reset($user);
			}
			// The same answer either way, so the page does not tell who has an account.
			$sent = true;
		}
	}
	$back = '<p class="kw-small"><a href="' . esc_url(kw_url('login', ['lang' => KW_LANG_CODES[$lang]])) . '">' . esc_html($t('back_to_login')) . '</a></p>';
	kw_page_start($t('forgot_title'), $lang);
	echo '<h1>' . esc_html($t('forgot_title')) . '</h1>';
	if ($sent) {
		kw_notice($t('forgot_sent'), 'ok');
		echo $back;
		kw_page_end();
		return;
	}
	echo '<p>' . esc_html($t('forgot_lead')) . '</p>';
	kw_notice($error);
	echo '<form method="post" action="' . esc_url(kw_url('forgot', ['lang' => KW_LANG_CODES[$lang]])) . '">';
	echo '<label>' . esc_html($t('login_name')) . '<input name="log" required autocomplete="username" value="' . esc_attr($log) . '"></label>';
	echo '<button class="kw-btn" type="submit">' . esc_html($t('forgot_submit')) . '</button></form>' . $back;
	kw_page_end($lang);
}

function kw_reset_page(): void {
	$lang  = kw_page_lang();
	$t     = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$login = sanitize_user(wp_unslash($_REQUEST['login'] ?? ''));
	$key   = preg_replace('/[^A-Za-z0-9]/', '', (string) wp_unslash($_REQUEST['key'] ?? ''));
	$user  = $login !== '' && $key !== '' ? check_password_reset_key($key, $login) : new WP_Error('kw_reset');
	if (is_wp_error($user)) {
		kw_message_page($t('confirm_failed_title'), $t('reset_bad'), $lang, $t('reset_again'), kw_url('forgot', ['lang' => KW_LANG_CODES[$lang]]));
	}
	$error = '';
	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		$pass = (string) wp_unslash($_POST['password'] ?? '');
		if (mb_strlen($pass) < 8) {
			$error = $t('join_short_password');
		} elseif ($pass !== (string) wp_unslash($_POST['repeat'] ?? '')) {
			$error = $t('reset_mismatch');
		} else {
			// The admin does not need a letter each time a member resets a password.
			remove_action('after_password_reset', 'wp_password_change_notification');
			reset_password($user, $pass);
			delete_user_meta($user->ID, '_kw_no_password');
			// The link came by e-mail, so the address works.
			if (!kw_confirmed($user->ID)) {
				update_user_meta($user->ID, '_kw_email_confirmed', '1');
			}
			kw_sign_in($user->ID);
			kw_message_page($t('reset_title'), $t('reset_done'), $lang, $t('account_title'), kw_url('account', ['lang' => KW_LANG_CODES[$lang]]));
		}
	}
	kw_page_start($t('reset_title'), $lang);
	echo '<h1>' . esc_html($t('reset_title')) . '</h1><p>' . esc_html($t('reset_lead', ['name' => $user->display_name])) . '</p>';
	kw_notice($error);
	echo '<form method="post" action="' . esc_url(kw_url('reset', ['lang' => KW_LANG_CODES[$lang]])) . '">' . kw_hidden(['login' => $login, 'key' => $key]);
	// For password managers: whose password this is.
	echo '<input type="text" name="username" value="' . esc_attr($user->user_login) . '" autocomplete="username" hidden>';
	echo '<label>' . esc_html($t('reset_password')) . '<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>';
	echo '<label>' . esc_html($t('reset_repeat')) . '<input name="repeat" type="password" required minlength="8" autocomplete="new-password"></label>';
	echo '<button class="kw-btn" type="submit">' . esc_html($t('reset_submit')) . '</button></form>';
	kw_page_end();
}

// ---------------------------------------------------------------------------
// /connect/: one click lets the Kadro app use the account. It gets an
// application password through kadro://auth, as WordPress's own approval
// page would send it.

function kw_connect_page(): void {
	$lang = kw_page_lang();
	$t    = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$code = KW_LANG_CODES[$lang];
	if (!is_user_logged_in()) {
		wp_safe_redirect(kw_url('login', ['from' => 'app', 'lang' => $code]));
		exit;
	}
	$u     = wp_get_current_user();
	$error = '';
	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		if (!wp_verify_nonce((string) ($_POST['_wpnonce'] ?? ''), 'kw_connect')) {
			$error = $t('session_expired');
		} elseif (!wp_is_application_passwords_available_for_user($u)) {
			$error = $t('connect_unavailable');
		} else {
			$made = WP_Application_Passwords::create_new_application_password($u->ID, [
				'name'   => 'Kadro · ' . wp_date('Y-m-d H:i:s'),
				'app_id' => KW_APP_ID,
			]);
			if (is_wp_error($made)) {
				$error = $t('connect_failed');
			} else {
				$back = add_query_arg([
					'site_url'   => rawurlencode(site_url()),
					'user_login' => rawurlencode($u->user_login),
					'password'   => rawurlencode($made[0]),
				], 'kadro://auth');
				kw_page_start($t('connect_done_title'), $lang);
				echo '<h1>' . esc_html($t('connect_done_title')) . '</h1><p>' . esc_html($t('connect_done')) . '</p>';
				echo '<p><a class="kw-btn" id="kw-open" href="' . esc_attr($back) . '">' . esc_html($t('connect_open')) . '</a></p>';
				echo '<p class="kw-small"><a href="' . esc_url(kw_url('account', ['lang' => $code])) . '">' . esc_html($t('account_title')) . '</a></p>';
				echo '<script>setTimeout(function(){location.href=document.getElementById("kw-open").href},300)</script>';
				kw_page_end();
				return;
			}
		}
	}
	kw_page_start($t('connect_title'), $lang);
	echo '<div class="kw-me"><img src="' . esc_url(get_avatar_url($u->ID, ['size' => 112])) . '" alt=""><div><b>' . esc_html($u->display_name) . '</b><span>' . esc_html($u->user_email) . '</span></div></div>';
	echo '<h1>' . esc_html($t('connect_title')) . '</h1><p>' . esc_html($t('connect_lead', ['name' => $u->display_name])) . '</p>';
	kw_notice($error);
	echo '<form method="post" action="' . esc_url(kw_url('connect', ['lang' => $code])) . '">' . wp_nonce_field('kw_connect', '_wpnonce', false, false);
	echo '<button class="kw-btn" type="submit">' . esc_html($t('connect_title')) . '</button></form>';
	$other = kw_url('login', ['from' => 'app', 'lang' => $code, 'logout' => 1, '_wpnonce' => wp_create_nonce('kw_logout')]);
	echo '<p class="kw-small"><a href="' . esc_url($other) . '">' . esc_html($t('connect_other')) . '</a></p>';
	kw_page_end($lang);
}

// ---------------------------------------------------------------------------
// /confirm/: links from letters (a new account's e-mail, a changed e-mail)

function kw_confirm_page(): void {
	$user  = isset($_GET['u']) ? (int) $_GET['u'] : 0;
	$token = isset($_GET['t']) ? (string) wp_unslash($_GET['t']) : '';
	$lang  = $user && get_userdata($user) ? kw_user_lang($user) : kw_page_lang();
	if (($_GET['kind'] ?? '') === 'email') {
		kw_confirm_new_email($user, $token, $lang);
		return;
	}
	$hash = $user ? (string) get_user_meta($user, '_kw_confirm_token', true) : '';
	$ok   = $hash !== '' && $token !== '' && wp_check_password($token, $hash);
	if ($ok) {
		update_user_meta($user, '_kw_email_confirmed', '1');
		delete_user_meta($user, '_kw_confirm_token');
	}
	$account = kw_url('account', ['lang' => KW_LANG_CODES[$lang]]);
	if ($ok || ($user && get_userdata($user) && kw_confirmed($user))) {
		kw_message_page(kw_tl('confirm_title', $lang), kw_tl('confirm_done', $lang), $lang, kw_tl('account_title', $lang), $account);
	}
	kw_message_page(kw_tl('confirm_failed_title', $lang), kw_tl('confirm_failed', $lang), $lang, kw_tl('account_title', $lang), $account);
}

// ---------------------------------------------------------------------------
// WordPress's own sign-in and sign-up pages lead to these ones

// Kadro 0.4 and older open WordPress's approval page: send them to /connect/ instead.
add_filter('login_url', function ($url, $redirect) {
	if ($redirect && strpos($redirect, 'authorize-application.php') !== false && strpos($redirect, KW_APP_ID) !== false) {
		parse_str((string) wp_parse_url($redirect, PHP_URL_QUERY), $q);
		return kw_url('login', ['from' => 'app', 'lang' => sanitize_key($q['lang'] ?? '')]);
	}
	// The dashboard (and its "session expired" sign-in) keeps the WordPress page; everything else uses the workshop's.
	if (is_admin() || ($redirect && strpos($redirect, admin_url()) === 0)) {
		return $url;
	}
	return kw_url('login', ['redirect_to' => $redirect]);
}, 10, 2);

add_filter('register_url', fn() => kw_url('join'));
add_filter('lostpassword_url', fn() => kw_url('forgot'));

add_action('login_form_register', function () {
	wp_safe_redirect(kw_url('join'));
	exit;
});

add_action('admin_init', function () {
	global $pagenow;
	if ($pagenow === 'authorize-application.php' && ($_GET['app_id'] ?? '') === KW_APP_ID) {
		wp_safe_redirect(kw_url('connect', ['lang' => sanitize_key($_GET['lang'] ?? '')]));
		exit;
	}
	// Workshop members have nothing to do in the dashboard: their page is /account/.
	if (!current_user_can('edit_posts') && !wp_doing_ajax() && !in_array($pagenow, ['admin-post.php', 'authorize-application.php'], true)) {
		wp_safe_redirect(kw_url('account'));
		exit;
	}
});

add_filter('show_admin_bar', fn($show) => $show && current_user_can('edit_posts'));

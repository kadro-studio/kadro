<?php
// Accounts: a short sign-up page (/join/) for Kadro users, e-mail confirmation
// and the letters the workshop sends. People who sign up here can publish once
// their e-mail is confirmed; everyone can browse and download without an account.

if (!defined('ABSPATH')) {
	exit;
}

/** Same app as in the Kadro app (src/main/workshop.ts): the page WordPress shows to approve it. */
function kw_authorize_url(): string {
	return add_query_arg([
		'app_name'    => 'Kadro',
		'app_id'      => '6b1d6f0e-3d4c-4f6a-9a5e-4b2f9c1d7e21',
		'success_url' => rawurlencode('kadro://auth'),
	], admin_url('authorize-application.php'));
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
	$link = add_query_arg(['kadro' => 'confirm', 'u' => $user, 't' => $token], home_url('/'));
	$lang = kw_user_lang($user);
	kw_mail($u->user_email, kw_tl('mail_confirm_subject', $lang), kw_tl('mail_confirm_body', $lang, ['name' => $u->display_name, 'link' => $link]));
}

// ---------------------------------------------------------------------------
// Pages: /?kadro=join (sign up) and /?kadro=confirm (the link from the letter)

add_action('template_redirect', function () {
	$page = isset($_GET['kadro']) ? sanitize_key(wp_unslash($_GET['kadro'])) : '';
	if ($page === 'join') {
		kw_join_page();
	} elseif ($page === 'confirm') {
		kw_confirm_page();
	}
});

/** Interface language of the page: ?lang= from the app or the site, else the browser's. */
function kw_page_lang(): int {
	$want = isset($_REQUEST['lang']) ? sanitize_key(wp_unslash($_REQUEST['lang'])) : '';
	if ($want === '') {
		$accept = strtolower((string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''));
		$want = substr($accept, 0, 2);
	}
	return $want === 'uk' ? 2 : ($want === 'ru' ? 1 : 0);
}

const KW_LANG_CODES = ['en', 'ru', 'uk'];
const KW_LOCALES    = ['en_US', 'ru_RU', 'uk'];

function kw_join_page(): void {
	nocache_headers();
	$lang  = kw_page_lang();
	$t     = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$app   = !empty($_REQUEST['from']) && $_REQUEST['from'] === 'app';
	$error = '';
	$done  = false;
	$login = '';
	$email = '';

	if (is_user_logged_in()) {
		$done = true;
	} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
		$login = sanitize_user(wp_unslash($_POST['login'] ?? ''), true);
		$email = sanitize_email(wp_unslash($_POST['email'] ?? ''));
		$pass  = (string) wp_unslash($_POST['password'] ?? '');
		$ip    = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
		$key   = 'kw_join_' . md5($ip);
		$tries = (int) get_transient($key);
		if (!get_option('users_can_register')) {
			$error = $t('join_closed');
		} elseif (!empty($_POST['website'])) {
			// The hidden field is filled only by bots.
			$error = $t('join_failed');
		} elseif ($tries >= 5) {
			$error = $t('join_too_many');
		} elseif (mb_strlen($login) < 3 || mb_strlen($login) > 30 || !validate_username($login)) {
			$error = $t('join_bad_login');
		} elseif (username_exists($login)) {
			$error = $t('join_login_taken');
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
					set_transient($key, $tries + 1, HOUR_IN_SECONDS);
					update_user_meta($id, '_kw_email_confirmed', '0');
					kw_send_confirmation($id);
					wp_set_current_user($id);
					wp_set_auth_cookie($id, true, is_ssl());
					// From the app: straight on to approving Kadro, which brings the user back signed in.
					if ($app) {
						wp_safe_redirect(kw_authorize_url());
						exit;
					}
					$done = true;
				}
			}
		}
	}
	kw_page_start($t('join_title'), $lang);
	if ($done) {
		$u = wp_get_current_user();
		echo '<h1>' . esc_html($t('join_done_title')) . '</h1>';
		echo '<p>' . esc_html($t('join_signed_in_as', ['name' => $u->display_name])) . '</p>';
		if (!kw_confirmed($u->ID)) {
			echo '<p class="kw-note">' . esc_html($t('join_check_mail', ['email' => $u->user_email])) . '</p>';
		}
		echo '<p><a class="kw-btn" href="' . esc_url(kw_authorize_url()) . '">' . esc_html($t('join_connect_app')) . '</a></p>';
		echo '<p class="kw-small">' . esc_html($t('join_connect_hint')) . '</p>';
	} else {
		echo '<h1>' . esc_html($t('join_title')) . '</h1>';
		echo '<p>' . esc_html($t('join_lead')) . '</p>';
		if ($error) {
			echo '<p class="kw-error" role="alert">' . esc_html($error) . '</p>';
		}
		echo '<form method="post" action="' . esc_url(add_query_arg(['kadro' => 'join', 'lang' => KW_LANG_CODES[$lang]] + ($app ? ['from' => 'app'] : []), home_url('/'))) . '">';
		echo '<label>' . esc_html($t('join_login')) . '<input name="login" required minlength="3" maxlength="30" autocomplete="username" value="' . esc_attr($login) . '"><small>' . esc_html($t('join_login_hint')) . '</small></label>';
		echo '<label>' . esc_html($t('join_email')) . '<input name="email" type="email" required autocomplete="email" value="' . esc_attr($email) . '"><small>' . esc_html($t('join_email_hint')) . '</small></label>';
		echo '<label>' . esc_html($t('join_password')) . '<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>';
		echo '<label class="kw-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>';
		echo '<label class="kw-check"><input type="checkbox" name="agree" value="1" required> <span>' . esc_html($t('join_rules')) . '</span></label>';
		echo '<button class="kw-btn" type="submit">' . esc_html($t('join_submit')) . '</button>';
		echo '</form>';
		echo '<p class="kw-small">' . esc_html($t('join_have_account')) . ' <a href="' . esc_url($app ? kw_authorize_url() : wp_login_url()) . '">' . esc_html($t('join_sign_in')) . '</a></p>';
	}
	kw_page_end();
	exit;
}

function kw_confirm_page(): void {
	nocache_headers();
	$user  = isset($_GET['u']) ? (int) $_GET['u'] : 0;
	$token = isset($_GET['t']) ? (string) wp_unslash($_GET['t']) : '';
	$hash  = $user ? (string) get_user_meta($user, '_kw_confirm_token', true) : '';
	$ok    = $hash !== '' && $token !== '' && wp_check_password($token, $hash);
	if ($ok) {
		update_user_meta($user, '_kw_email_confirmed', '1');
		delete_user_meta($user, '_kw_confirm_token');
	}
	$lang = $user ? kw_user_lang($user) : kw_page_lang();
	kw_page_start(kw_tl('confirm_title', $lang), $lang);
	if ($ok || ($user && kw_confirmed($user))) {
		echo '<h1>' . esc_html(kw_tl('confirm_title', $lang)) . '</h1><p>' . esc_html(kw_tl('confirm_done', $lang)) . '</p>';
	} else {
		echo '<h1>' . esc_html(kw_tl('confirm_failed_title', $lang)) . '</h1><p>' . esc_html(kw_tl('confirm_failed', $lang)) . '</p>';
	}
	kw_page_end();
	exit;
}

/** A small page of its own, the same in every theme. */
function kw_page_start(string $title, int $lang): void {
	status_header(200);
	header('Content-Type: text/html; charset=utf-8');
	echo '<!doctype html><html lang="' . esc_attr(KW_LANG_CODES[$lang]) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">';
	echo '<title>' . esc_html($title . ' — ' . kw_tl('site_name', $lang)) . '</title>';
	echo '<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;color:#f2f2f5;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px;box-sizing:border-box}
main{width:100%;max-width:420px;background:#131316;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:28px 26px}
.kw-logo{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:18px;color:#f2f2f5;text-decoration:none}
.kw-logo i{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#ff6d7b,#e8263b)}
h1{font-size:23px;margin:0 0 8px;letter-spacing:-.02em}
p{color:#c4c4cc;margin:0 0 14px}
label{display:block;margin:0 0 14px;font-size:13.5px;color:#a6a6b0}
input:not([type=checkbox]){display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0e0e11;color:#f2f2f5;font:inherit}
input:focus{outline:2px solid #ff3b4f;outline-offset:1px}
small{display:block;margin-top:4px;color:#6d6d77;font-size:12px}
.kw-check{display:flex;gap:9px;align-items:flex-start;color:#c4c4cc}
.kw-check input{margin-top:4px}
.kw-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.kw-btn{display:inline-block;width:100%;box-sizing:border-box;text-align:center;padding:11px 16px;border:0;border-radius:11px;background:linear-gradient(180deg,#ff4f61,#e8263b);color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer;text-decoration:none}
.kw-error{padding:10px 12px;border-radius:10px;background:rgba(255,59,79,.12);color:#ff9aa5}
.kw-note{padding:10px 12px;border-radius:10px;background:rgba(255,179,0,.1);color:#ffd27a}
.kw-small{font-size:13px;color:#8a8a94;margin-top:14px}
a{color:#ff6d7b}
</style></head><body><main><a class="kw-logo" href="https://kadro.studio/workshop/"><i></i>' . esc_html(kw_tl('site_name', $lang)) . '</a>';
}

function kw_page_end(): void {
	echo '</main></body></html>';
}

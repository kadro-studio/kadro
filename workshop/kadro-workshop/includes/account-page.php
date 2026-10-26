<?php
// /account/: the member's own page — name, e-mail, password, sign-in with
// Google or Discord, the Kadro apps using the account, their publications,
// signing out and deleting the account.

if (!defined('ABSPATH')) {
	exit;
}

function kw_account_page(): void {
	$lang = kw_page_lang();
	$t    = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$code = KW_LANG_CODES[$lang];
	if (!is_user_logged_in()) {
		wp_safe_redirect(kw_url('login', ['redirect_to' => kw_url('account'), 'lang' => $code]));
		exit;
	}
	$u      = wp_get_current_user();
	$errors = [];
	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		$action = sanitize_key($_POST['kw_action'] ?? '');
		if (!wp_verify_nonce((string) ($_POST['_wpnonce'] ?? ''), 'kw_account')) {
			$errors[$action] = $t('session_expired');
		} else {
			$error = kw_account_action($action, $u, $lang);
			if ($error === '') {
				wp_safe_redirect(kw_url('account', ['lang' => $code, 'done' => $action]) . '#' . ($action === 'unlink' ? 'signin' : $action));
				exit;
			}
			$errors[$action] = $error;
		}
		$u = wp_get_current_user();
	}

	$done = sanitize_key($_GET['done'] ?? '');
	$via  = sanitize_key($_GET['via'] ?? '');
	$all  = kw_providers();
	$ok   = [
		'profile'  => $t('account_saved'),
		'email'    => $t('email_pending', ['email' => (get_user_meta($u->ID, '_kw_new_email', true) ?: [])['email'] ?? '']),
		'password' => $t('password_changed'),
		'resend'   => $t('resent'),
		'unlink'   => $t('account_saved'),
		'linked'   => isset($all[$via]) ? $t('method_linked_done', ['name' => $all[$via]['name']]) : '',
		'revoke'   => $t('apps_revoked'),
	];
	// What the last form in a section did: its error, or what changed.
	$msg = function (string $section) use ($errors, $done, $ok) {
		$codes = $section === 'signin' ? ['unlink', 'linked'] : [$section];
		foreach ($codes as $c) {
			if (isset($errors[$c])) {
				kw_notice($errors[$c]);
				return;
			}
		}
		if (in_array($done, $codes, true)) {
			kw_notice($ok[$done] ?? '', 'ok');
		}
	};
	$form = fn(string $action) => '<form method="post" action="' . esc_url(kw_url('account', ['lang' => $code])) . '">' . wp_nonce_field('kw_account', '_wpnonce', false, false) . kw_hidden(['kw_action' => $action]);
	$has_pass = kw_has_password($u->ID);
	$mod      = kw_is_moderator();

	kw_page_start($t('account_title'), $lang, true);
	echo '<div class="kw-me"><img src="' . esc_url(get_avatar_url($u->ID, ['size' => 112])) . '" alt=""><div><b>' . esc_html($u->display_name);
	if ($mod) {
		echo '<span class="kw-badge">' . esc_html($t('account_moderator')) . '</span>';
	}
	echo '</b><span>@' . esc_html($u->user_login) . ' · ' . esc_html($u->user_email) . '</span></div></div>';
	echo '<div class="kw-row"><a class="kw-btn ghost small" href="https://kadro.studio/workshop/">' . esc_html($t('open_workshop')) . '</a>';
	echo '<a class="kw-btn ghost small" href="' . esc_url(kw_url('login', ['lang' => $code, 'logout' => 1, '_wpnonce' => wp_create_nonce('kw_logout')])) . '">' . esc_html($t('sign_out')) . '</a></div>';

	if (!empty($_GET['welcome'])) {
		echo '<p></p>';
		kw_notice($t('welcome'), 'ok');
	}
	$oauth = kw_oauth_notice($lang);
	if ($oauth) {
		echo '<p></p>';
		kw_notice($oauth);
	}
	if (!kw_confirmed($u->ID)) {
		echo '<section id="resend">';
		$msg('resend');
		echo '<p class="kw-note">' . esc_html($t('join_check_mail', ['email' => $u->user_email])) . '</p>';
		echo $form('resend') . '<button class="kw-btn ghost small" type="submit">' . esc_html($t('resend')) . '</button></form></section>';
	}

	// Profile
	echo '<section id="profile"><h2>' . esc_html($t('profile_title')) . '</h2>';
	$msg('profile');
	echo $form('profile');
	echo '<label>' . esc_html($t('display_name')) . '<input name="display_name" required minlength="2" maxlength="40" value="' . esc_attr($u->display_name) . '"><small>' . esc_html($t('display_name_hint', ['login' => $u->user_login])) . '</small></label>';
	echo '<button class="kw-btn small" type="submit">' . esc_html($t('save')) . '</button></form></section>';

	// E-mail
	echo '<section id="email"><h2>E-mail</h2>';
	$msg('email');
	echo '<p>' . esc_html($t('email_current', ['email' => $u->user_email])) . '</p>' . $form('email');
	echo '<label>' . esc_html($t('email_new')) . '<input name="email" type="email" required autocomplete="email"></label>';
	if ($has_pass) {
		echo '<label>' . esc_html($t('current_password')) . '<input name="current" type="password" required autocomplete="current-password"></label>';
	}
	echo '<button class="kw-btn small" type="submit">' . esc_html($t('email_change')) . '</button></form></section>';

	// Password
	echo '<section id="password"><h2>' . esc_html($t('password_title')) . '</h2>';
	$msg('password');
	if (!$has_pass) {
		echo '<p>' . esc_html($t('password_none')) . '</p>';
	}
	echo $form('password') . '<input type="text" name="username" value="' . esc_attr($u->user_login) . '" autocomplete="username" hidden>';
	if ($has_pass) {
		echo '<label>' . esc_html($t('current_password')) . '<input name="current" type="password" required autocomplete="current-password"></label>';
	}
	echo '<label>' . esc_html($t('reset_password')) . '<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>';
	echo '<label>' . esc_html($t('reset_repeat')) . '<input name="repeat" type="password" required minlength="8" autocomplete="new-password"></label>';
	echo '<button class="kw-btn small" type="submit">' . esc_html($t($has_pass ? 'password_change' : 'password_set')) . '</button></form></section>';

	// Google and Discord: the ones the site offers, and any already connected.
	$shown = array_filter(array_keys($all), fn($p) => kw_provider_ready($p) || get_user_meta($u->ID, '_kw_' . $p, true));
	if ($shown) {
		echo '<section id="signin"><h2>' . esc_html($t('methods_title')) . '</h2>';
		$msg('signin');
		echo '<ul class="kw-list">';
		foreach ($shown as $p) {
			$linked = (string) get_user_meta($u->ID, '_kw_' . $p, true);
			echo '<li><div><b>' . esc_html($all[$p]['name']) . '</b>';
			if ($linked) {
				echo '<small>' . esc_html($t('method_linked', ['email' => get_user_meta($u->ID, '_kw_' . $p . '_email', true)])) . '</small></div>';
				echo $form('unlink') . kw_hidden(['provider' => $p]) . '<button class="kw-btn ghost small" type="submit">' . esc_html($t('method_unlink')) . '</button></form>';
			} else {
				echo '</div><a class="kw-btn ghost small" href="' . esc_url(kw_url('oauth', ['p' => $p, 'link' => 1, 'lang' => $code, '_wpnonce' => wp_create_nonce('kw_link')])) . '">' . esc_html($t('method_link')) . '</a>';
			}
			echo '</li>';
		}
		echo '</ul></section>';
	}

	// The Kadro apps using this account (application passwords).
	echo '<section id="revoke"><h2>' . esc_html($t('apps_title')) . '</h2>';
	$msg('revoke');
	$apps = class_exists('WP_Application_Passwords') ? WP_Application_Passwords::get_user_application_passwords($u->ID) : [];
	if (!$apps) {
		echo '<p>' . esc_html($t('apps_none')) . '</p>';
	} else {
		echo '<ul class="kw-list">';
		foreach (array_reverse($apps) as $a) {
			$used = $a['last_used'] ? kw_date((int) $a['last_used'], $lang) : $t('apps_never');
			echo '<li><div><b>' . esc_html(preg_replace('/\s·.*$/', '', $a['name'])) . '</b><small>' . esc_html($t('apps_used', ['created' => kw_date((int) $a['created'], $lang), 'used' => $used])) . '</small></div>';
			echo $form('revoke') . kw_hidden(['uuid' => $a['uuid']]) . '<button class="kw-btn ghost small" type="submit">' . esc_html($t('method_unlink')) . '</button></form></li>';
		}
		echo '</ul>';
	}
	echo '</section>';

	// Publications
	echo '<section id="items"><h2>' . esc_html($t('items_title')) . '</h2>';
	$q = new WP_Query([
		'post_type'      => KW_POST_TYPE,
		'author'         => $u->ID,
		'post_status'    => ['publish', 'pending', 'draft', 'private', 'future'],
		'posts_per_page' => 100,
		'orderby'        => 'modified',
		'no_found_rows'  => true,
	]);
	if (!$q->posts) {
		echo '<p>' . esc_html($t('items_none')) . '</p>';
	} else {
		echo '<ul class="kw-list">';
		foreach ($q->posts as $post) {
			$rejected = kw_meta($post->ID, 'rejected');
			$status   = $post->post_status === 'publish' ? 'publish' : ($post->post_status === 'pending' ? 'pending' : ($rejected ? 'rejected' : 'draft'));
			$title    = esc_html(get_the_title($post));
			echo '<li><div>' . ($status === 'publish' ? '<a href="' . esc_url(get_permalink($post)) . '">' . $title . '</a>' : '<b>' . $title . '</b>');
			echo '<small>' . esc_html(kw_tl('kind_' . kw_meta($post->ID, 'kind'), $lang)) . ' · ↓ ' . (int) kw_meta($post->ID, 'downloads', 0) . ' · ♥ ' . (int) kw_meta($post->ID, 'likes', 0) . '</small></div>';
			echo '<span class="kw-tag ' . esc_attr($status) . '">' . esc_html($t('status_' . $status, ['reason' => $rejected])) . '</span></li>';
		}
		echo '</ul>';
	}
	echo '</section>';

	// Deleting the account
	echo '<section id="delete"><details' . (isset($errors['delete']) ? ' open' : '') . '><summary>' . esc_html($t('delete_title')) . '</summary>';
	$msg('delete');
	if ($mod) {
		echo '<p>' . esc_html($t('delete_moderator')) . '</p>';
	} else {
		echo '<p>' . esc_html($t('delete_lead')) . '</p>' . $form('delete');
		echo $has_pass
			? '<label>' . esc_html($t('current_password')) . '<input name="current" type="password" required autocomplete="current-password"></label>'
			: '<label>' . esc_html($t('delete_confirm_login', ['login' => $u->user_login])) . '<input name="confirm" required autocomplete="off"></label>';
		echo '<button class="kw-btn danger" type="submit">' . esc_html($t('delete_submit')) . '</button></form>';
	}
	echo '</details></section>';
	kw_page_end($lang);
}

/** Does what one of the account forms asked; returns '' or why it did not. */
function kw_account_action(string $action, WP_User $u, int $lang): string {
	$t        = fn(string $k, array $v = []) => kw_tl($k, $lang, $v);
	$has_pass = kw_has_password($u->ID);
	$current  = (string) wp_unslash($_POST['current'] ?? '');
	$pass_ok  = fn() => wp_check_password($current, $u->user_pass, $u->ID);

	if ($action === 'profile') {
		$name = trim(preg_replace('/\s+/u', ' ', sanitize_text_field(wp_unslash($_POST['display_name'] ?? ''))));
		if (mb_strlen($name) < 2 || mb_strlen($name) > 40) {
			return $t('display_name_bad');
		}
		// Nobody may look like someone else: other members' names and logins are taken.
		$taken = get_users(['search' => $name, 'search_columns' => ['display_name', 'user_login'], 'exclude' => [$u->ID], 'number' => 1, 'fields' => 'ID']);
		if ($taken) {
			return $t('display_name_taken');
		}
		wp_update_user(['ID' => $u->ID, 'display_name' => $name, 'nickname' => $name]);
		return '';
	}

	if ($action === 'email') {
		$email = sanitize_email(wp_unslash($_POST['email'] ?? ''));
		if (!is_email($email)) {
			return $t('join_bad_email');
		}
		if (strtolower($email) === strtolower($u->user_email)) {
			return $t('email_same');
		}
		if ($has_pass && !$pass_ok()) {
			return $t('wrong_password');
		}
		if (email_exists($email)) {
			return $t('join_email_taken');
		}
		if (kw_limited('email' . $u->ID, 3)) {
			return $t('forgot_too_many');
		}
		kw_count('email' . $u->ID, HOUR_IN_SECONDS);
		$token = wp_generate_password(32, false);
		update_user_meta($u->ID, '_kw_new_email', ['email' => $email, 'hash' => wp_hash_password($token), 'time' => time()]);
		$link = kw_url('confirm', ['u' => $u->ID, 't' => $token, 'kind' => 'email', 'lang' => KW_LANG_CODES[$lang]]);
		kw_mail($email, $t('mail_email_subject'), $t('mail_email_body', ['name' => $u->display_name, 'link' => $link]));
		return '';
	}

	if ($action === 'password') {
		$pass = (string) wp_unslash($_POST['password'] ?? '');
		if ($has_pass && !$pass_ok()) {
			return $t('wrong_password');
		}
		if (mb_strlen($pass) < 8) {
			return $t('join_short_password');
		}
		if ($pass !== (string) wp_unslash($_POST['repeat'] ?? '')) {
			return $t('reset_mismatch');
		}
		// A new password signs out other browsers; application passwords (Kadro) stay.
		wp_set_password($pass, $u->ID);
		delete_user_meta($u->ID, '_kw_no_password');
		wp_set_auth_cookie($u->ID, true, is_ssl());
		return '';
	}

	if ($action === 'resend') {
		return kw_resend_confirmation($u->ID) === 'limit' ? $t('forgot_too_many') : '';
	}

	if ($action === 'unlink') {
		$p   = sanitize_key($_POST['provider'] ?? '');
		$all = kw_providers();
		if (!isset($all[$p])) {
			return $t('session_expired');
		}
		$others = array_filter(array_keys($all), fn($o) => $o !== $p && get_user_meta($u->ID, '_kw_' . $o, true));
		if (!$has_pass && !$others) {
			return $t('method_last');
		}
		delete_user_meta($u->ID, '_kw_' . $p);
		delete_user_meta($u->ID, '_kw_' . $p . '_email');
		if (get_user_meta($u->ID, '_kw_avatar_from', true) === $p) {
			delete_user_meta($u->ID, '_kw_avatar');
			delete_user_meta($u->ID, '_kw_avatar_from');
		}
		return '';
	}

	if ($action === 'revoke') {
		$uuid = sanitize_text_field(wp_unslash($_POST['uuid'] ?? ''));
		WP_Application_Passwords::delete_application_password($u->ID, $uuid);
		return '';
	}

	if ($action === 'delete') {
		if (kw_is_moderator()) {
			return $t('delete_moderator');
		}
		if ($has_pass ? !$pass_ok() : trim((string) wp_unslash($_POST['confirm'] ?? '')) !== $u->user_login) {
			return $t($has_pass ? 'wrong_password' : 'delete_wrong');
		}
		require_once ABSPATH . 'wp-admin/includes/user.php';
		$lang_code = KW_LANG_CODES[$lang];
		wp_logout();
		// Their items (and the files) go with them; so do the Kadro connections.
		wp_delete_user($u->ID);
		kw_message_page(kw_tl('deleted_title', $lang), kw_tl('deleted', $lang), $lang, kw_tl('open_workshop', $lang), 'https://kadro.studio/workshop/?lang=' . $lang_code);
	}
	return kw_tl('session_expired', $lang);
}

/** The link from the letter sent to a new e-mail address. */
function kw_confirm_new_email(int $user, string $token, int $lang): void {
	$p  = $user ? get_user_meta($user, '_kw_new_email', true) : null;
	$ok = is_array($p) && $token !== '' && time() - (int) $p['time'] < 2 * DAY_IN_SECONDS
		&& wp_check_password($token, (string) $p['hash']) && !email_exists($p['email']);
	$account = kw_url('account', ['lang' => KW_LANG_CODES[$lang]]);
	if (!$ok) {
		kw_message_page(kw_tl('confirm_failed_title', $lang), kw_tl('confirm_failed', $lang), $lang, kw_tl('account_title', $lang), $account);
	}
	// WordPress also tells the old address about the change.
	wp_update_user(['ID' => $user, 'user_email' => $p['email']]);
	update_user_meta($user, '_kw_email_confirmed', '1');
	delete_user_meta($user, '_kw_new_email');
	kw_message_page(kw_tl('email_changed_title', $lang), kw_tl('email_changed', $lang, ['email' => $p['email']]), $lang, kw_tl('account_title', $lang), $account);
}

function kw_date(int $time, int $lang): string {
	return wp_date($lang === 0 ? 'M j, Y' : 'd.m.Y', $time);
}

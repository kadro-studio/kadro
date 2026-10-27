<?php
// Pages of the workshop site that are not posts: sign-up, sign-in, password
// reset, connecting the app, the account page and sign-in with Google or
// Discord. Each has a short address (/login/) on sites with pretty permalinks
// and works as /?kadro=login everywhere.

if (!defined('ABSPATH')) {
	exit;
}

const KW_LANG_CODES = ['en', 'ru', 'uk'];
const KW_LOCALES    = ['en_US', 'ru_RU', 'uk'];

add_filter('query_vars', function ($vars) {
	$vars[] = 'kadro';
	$vars[] = 'kw_provider';
	return $vars;
});

add_action('init', function () {
	add_rewrite_rule('^(join|login|forgot|reset|connect|account|confirm)/?$', 'index.php?kadro=$matches[1]', 'top');
	add_rewrite_rule('^oauth/(google|discord)/?$', 'index.php?kadro=oauth&kw_provider=$matches[1]', 'top');
	// Updating the plugin by upload does not run the activation hook, so new rules are applied here once.
	if (get_option('kw_rewrite_version') !== KW_VERSION) {
		flush_rewrite_rules(false);
		update_option('kw_rewrite_version', KW_VERSION);
	}
}, 20);

add_action('template_redirect', function () {
	$page = (string) get_query_var('kadro');
	if ($page === '' && isset($_GET['kadro'])) {
		$page = sanitize_key(wp_unslash($_GET['kadro']));
	}
	$pages = [
		'join'    => 'kw_join_page',
		'login'   => 'kw_login_page',
		'forgot'  => 'kw_forgot_page',
		'reset'   => 'kw_reset_page',
		'connect' => 'kw_connect_page',
		'account' => 'kw_account_page',
		'confirm' => 'kw_confirm_page',
		'oauth'   => 'kw_oauth_page',
	];
	if (isset($pages[$page])) {
		// Page caches (Batcache on WordPress.com and others) ignore no-cache headers and cookies other than
		// WordPress's own, and some of these pages show one person's details: keep them out.
		if (function_exists('batcache_cancel')) {
			batcache_cancel();
		}
		if (!defined('DONOTCACHEPAGE')) {
			define('DONOTCACHEPAGE', true);
		}
		nocache_headers();
		$pages[$page]();
		exit;
	}
}, 5);

// After signing in people may be sent back to the Kadro website.
add_filter('allowed_redirect_hosts', function ($hosts) {
	$hosts[] = 'kadro.studio';
	return $hosts;
});

/** Address of one of these pages, with query arguments. */
function kw_url(string $page, array $args = []): string {
	$args = array_filter($args, fn($v) => $v !== '' && $v !== null);
	if (get_option('permalink_structure')) {
		if ($page === 'oauth') {
			$url = home_url('/oauth/' . ($args['p'] ?? '') . '/');
			unset($args['p']);
		} else {
			$url = home_url('/' . $page . '/');
		}
	} else {
		$url  = home_url('/');
		$args = ['kadro' => $page] + $args;
	}
	return $args ? add_query_arg(urlencode_deep($args), $url) : $url;
}

/** Interface language of a page: ?lang= from the app or the site, the user's own, else the browser's. */
function kw_page_lang(): int {
	$want = isset($_REQUEST['lang']) ? sanitize_key(wp_unslash($_REQUEST['lang'])) : '';
	if ($want === '' && is_user_logged_in()) {
		return kw_user_lang(get_current_user_id());
	}
	if ($want === '') {
		$accept = strtolower((string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''));
		$want = substr($accept, 0, 2);
	}
	return $want === 'uk' ? 2 : ($want === 'ru' ? 1 : 0);
}

/**
 * Where the visitor came from and goes next, carried from page to page:
 * from=app (the Kadro app waits for a sign-in), redirect_to and the language.
 */
function kw_ctx(): array {
	$from = isset($_REQUEST['from']) && $_REQUEST['from'] === 'app' ? 'app' : '';
	$to   = isset($_REQUEST['redirect_to']) ? esc_url_raw(wp_unslash($_REQUEST['redirect_to'])) : '';
	return ['from' => $from, 'redirect_to' => $to, 'lang' => KW_LANG_CODES[kw_page_lang()]];
}

/** Where to go after signing in: on to connecting the app, back where the visitor was, or the account page. */
function kw_after_login(array $ctx): string {
	if ($ctx['from'] === 'app') {
		return kw_url('connect', ['lang' => $ctx['lang']]);
	}
	$to = $ctx['redirect_to'] ? wp_validate_redirect($ctx['redirect_to'], '') : '';
	return $to ?: kw_url('account', ['lang' => $ctx['lang']]);
}

function kw_hidden(array $fields): string {
	$out = '';
	foreach ($fields as $k => $v) {
		if ($v !== '' && $v !== null) {
			$out .= '<input type="hidden" name="' . esc_attr($k) . '" value="' . esc_attr($v) . '">';
		}
	}
	return $out;
}

function kw_notice(string $text, string $kind = 'error'): void {
	if ($text !== '') {
		echo '<p class="kw-' . esc_attr($kind) . '" role="' . ($kind === 'error' ? 'alert' : 'status') . '">' . esc_html($text) . '</p>';
	}
}

/** "Sign in | Create account" switch above both forms. */
function kw_tabs(string $active, int $lang, array $ctx): void {
	echo '<nav class="kw-tabs">';
	foreach (['login' => 'login_submit', 'join' => 'join_submit'] as $page => $label) {
		$cls = $page === $active ? ' class="on" aria-current="page"' : '';
		echo '<a' . $cls . ' href="' . esc_url(kw_url($page, $ctx)) . '">' . esc_html(kw_tl($label, $lang)) . '</a>';
	}
	echo '</nav>';
}

/** Attempts per key within a window (sign-in, letters, sign-ups). */
function kw_limited(string $key, int $max): bool {
	return (int) get_transient('kw_l_' . md5($key)) >= $max;
}

function kw_count(string $key, int $window): void {
	$k = 'kw_l_' . md5($key);
	set_transient($k, (int) get_transient($k) + 1, $window);
}

function kw_ip(): string {
	return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

/** A short page with a title, a line of text and an optional button. */
function kw_message_page(string $title, string $text, int $lang, string $button = '', string $href = ''): void {
	kw_page_start($title, $lang);
	echo '<h1>' . esc_html($title) . '</h1><p>' . esc_html($text) . '</p>';
	if ($button) {
		echo '<p><a class="kw-btn" href="' . esc_url($href) . '">' . esc_html($button) . '</a></p>';
	}
	kw_page_end($lang);
	exit;
}

/** A small page of its own, the same in every theme. */
function kw_page_start(string $title, int $lang, bool $wide = false): void {
	status_header(200);
	header('Content-Type: text/html; charset=utf-8');
	header('Referrer-Policy: same-origin');
	// No other site may show these pages inside its own.
	header('X-Frame-Options: DENY');
	header("Content-Security-Policy: frame-ancestors 'none'");
	header('X-Content-Type-Options: nosniff');
	echo '<!doctype html><html lang="' . esc_attr(KW_LANG_CODES[$lang]) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">';
	echo '<title>' . esc_html($title . ' — ' . kw_tl('site_name', $lang)) . '</title>';
	echo '<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;color:#f2f2f5;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px}
main{width:100%;max-width:420px;background:#131316;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:28px 26px}
main.wide{max-width:600px}
.kw-logo{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:18px;color:#f2f2f5;text-decoration:none}
.kw-logo i{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#ff6d7b,#e8263b)}
h1{font-size:23px;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:16px;margin:0 0 10px}
p{color:#c4c4cc;margin:0 0 14px}
label{display:block;margin:0 0 14px;font-size:13.5px;color:#a6a6b0}
input:not([type=checkbox]){display:block;width:100%;margin-top:5px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0e0e11;color:#f2f2f5;font:inherit}
input[readonly]{color:#8a8a94}
input:focus,button:focus-visible,a:focus-visible{outline:2px solid #ff3b4f;outline-offset:1px}
small{display:block;margin-top:4px;color:#6d6d77;font-size:12px}
.kw-check{display:flex;gap:9px;align-items:flex-start;color:#c4c4cc}
.kw-check input{margin-top:4px}
.kw-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.kw-btn{display:inline-block;width:100%;text-align:center;padding:11px 16px;border:0;border-radius:11px;background:linear-gradient(180deg,#ff4f61,#e8263b);color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer;text-decoration:none}
.kw-btn.ghost{background:#1c1c21;border:1px solid rgba(255,255,255,.1);color:#f2f2f5}
.kw-btn.small{width:auto;padding:7px 13px;font-size:13.5px;border-radius:9px}
.kw-btn.danger{background:#3a1218;border:1px solid #7a2230;color:#ff9aa5}
.kw-error{padding:10px 12px;border-radius:10px;background:rgba(255,59,79,.12);color:#ff9aa5}
.kw-note{padding:10px 12px;border-radius:10px;background:rgba(255,179,0,.1);color:#ffd27a}
.kw-ok{padding:10px 12px;border-radius:10px;background:rgba(52,199,89,.12);color:#8fe3a5}
.kw-small{font-size:13px;color:#8a8a94;margin-top:14px}
.kw-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.kw-tabs{display:flex;gap:4px;padding:4px;margin:0 0 20px;border-radius:12px;background:#0e0e11;border:1px solid rgba(255,255,255,.06)}
.kw-tabs a{flex:1;text-align:center;padding:8px 10px;border-radius:9px;color:#a6a6b0;text-decoration:none;font-weight:600;font-size:14px}
.kw-tabs a.on{background:#1f1f25;color:#f2f2f5}
.kw-social{display:grid;gap:9px;margin:0 0 4px}
.kw-social a{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 14px;border-radius:11px;font-weight:600;text-decoration:none}
.kw-social .google{background:#fff;color:#1f1f1f}
.kw-social .discord{background:#5865f2;color:#fff}
.kw-or{display:flex;align-items:center;gap:12px;margin:16px 0;color:#6d6d77;font-size:13px}
.kw-or::before,.kw-or::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.08)}
.kw-me{display:flex;align-items:center;gap:14px;margin:0 0 18px}
.kw-me img{width:56px;height:56px;border-radius:50%;background:#1f1f25}
.kw-me b{display:block;font-size:19px}
.kw-me span{color:#8a8a94;font-size:13.5px}
.kw-badge{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:99px;background:rgba(255,59,79,.15);color:#ff9aa5;font-size:12px;font-weight:600;vertical-align:middle}
section{border-top:1px solid rgba(255,255,255,.07);padding-top:18px;margin-top:18px}
.kw-list{list-style:none;margin:0 0 6px;padding:0}
.kw-list li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.kw-list li:last-child{border-bottom:0}
.kw-list a{color:#f2f2f5;text-decoration:none;font-weight:600}
.kw-list small{margin:2px 0 0}
.kw-tag{flex:none;padding:2px 9px;border-radius:99px;font-size:12px;background:#1f1f25;color:#a6a6b0;max-width:55%;text-align:right}
.kw-tag.publish{background:rgba(52,199,89,.12);color:#8fe3a5}
.kw-tag.pending{background:rgba(255,179,0,.1);color:#ffd27a}
.kw-tag.rejected{background:rgba(255,59,79,.12);color:#ff9aa5}
details summary{cursor:pointer;color:#ff9aa5;font-weight:600;margin-bottom:12px}
form.inline{display:inline;margin:0}
footer{margin-top:22px;font-size:12.5px;color:#6d6d77;text-align:center}
footer a{color:#8a8a94;margin:0 6px}
a{color:#ff6d7b}
</style></head><body><main' . ($wide ? ' class="wide"' : '') . '><a class="kw-logo" href="https://kadro.studio/workshop/"><i></i>' . esc_html(kw_tl('site_name', $lang)) . '</a>';
}

/** Closes the page; with a language, GET pages get links to the other two languages. */
function kw_page_end(int $lang = -1): void {
	if ($lang >= 0 && $_SERVER['REQUEST_METHOD'] === 'GET') {
		echo '<footer>';
		foreach (['uk' => 'Українська', 'ru' => 'Русский', 'en' => 'English'] as $code => $name) {
			if ($code !== KW_LANG_CODES[$lang]) {
				echo '<a href="' . esc_url(add_query_arg('lang', $code)) . '">' . esc_html($name) . '</a>';
			}
		}
		echo '</footer>';
	}
	echo '</main></body></html>';
}

<?php
// What comments, the forum and feedback share: the switches, text rules, rate
// limits, the shape of a comment or reply in the API, reports and hiding,
// letters (within a daily budget), no-cache headers for the community routes,
// keeping cookie sign-ins away from WordPress's own REST API, and what happens
// to someone's posts when they delete their account.
//
// Comments on works are WordPress comments of type kw_comment on kadro_item;
// forum replies are comments of type kw_reply on kadro_topic. People write
// them only through the kadro/v1 routes (comments.php, forum.php), which check
// the rules below; WordPress's own comment form, XML-RPC and pingbacks are closed.

if (!defined('ABSPATH')) {
	exit;
}

/** Letters that are not about the account itself (notifications, reports, feedback): at most this many a day in all. */
const KW_MAIL_DAY      = 150;
/** Of those, letters to the admin about reports, and feedback letters. */
const KW_MAIL_REPORTS  = 30;
const KW_MAIL_FEEDBACK = 100;

// ---------------------------------------------------------------------------
// Switches (Workshop → Settings). Options added by an upload update have no value yet: on by default.

function kw_comments_open(): bool {
	return (string) get_option('kw_comments_open', '1') === '1';
}

function kw_forum_open(): bool {
	return (string) get_option('kw_forum_open', '1') === '1';
}

function kw_feedback_open(): bool {
	return (string) get_option('kw_feedback_open', '1') === '1';
}

// ---------------------------------------------------------------------------
// Text

/**
 * Stored text back as plain text, exactly as it was written (see kw_store_text()).
 * Everything that leaves the plugin goes through this once, and clients show it as text.
 */
function kw_decode(string $s): string {
	return html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/**
 * Stored text for a WP admin page: exactly what was typed, escaped once for HTML.
 * Not esc_html(kw_decode()): esc_html() keeps entities as they are, so a typed
 * "&amp;" would show as "&".
 */
function kw_html(string $s): string {
	return htmlspecialchars(kw_decode($s), ENT_QUOTES, 'UTF-8');
}

/**
 * Plain text from a form or a request, kept as typed: no tags or %xx sequences
 * are taken out ("press <Ctrl>+<Z>", "…/wiki/%D0%9A%D0%B8" stay). Only what no
 * one types is cleaned: broken UTF-8 (the whole text is dropped, as WordPress does),
 * control characters (a tab becomes a space), Windows line breaks. $multiline: at
 * most one empty line in a row; otherwise one line, every run of spaces and line
 * breaks one space. Trimmed.
 */
function kw_plain_text($value, bool $multiline = true): string {
	$s = wp_check_invalid_utf8(is_scalar($value) ? (string) $value : '');
	$s = str_replace(["\r\n", "\r", "\t"], ["\n", "\n", ' '], $s);
	// C0 controls except the line break, DEL and C1 controls.
	$s = (string) preg_replace('/[\x{00}-\x{09}\x{0B}-\x{1F}\x{7F}-\x{9F}]/u', '', $s);
	$s = $multiline ? (string) preg_replace("/\n{3,}/", "\n\n", $s) : (string) preg_replace('/\s+/u', ' ', $s);
	return (string) preg_replace('/^\s+|\s+$/u', '', $s);
}

/**
 * Plain text as it is stored, for everyone alike: "&", "<" and ">" as entities
 * (quotes as they are). kses then has nothing to change (no tags, every entity
 * one it keeps), and kw_decode() gives back exactly what was typed — "&amp;"
 * typed by someone is stored as "&amp;amp;" and comes back as "&amp;".
 */
function kw_store_text(string $s): string {
	return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $s);
}

/** A time for the API, always in UTC with a "Z": a unix time or a MySQL GMT date; null when there is none. */
function kw_iso_gmt($v): ?string {
	if (is_int($v) || (is_string($v) && ctype_digit($v))) {
		$t = (int) $v;
	} else {
		$s = (string) $v;
		if ($s === '' || strpos($s, '0000-00-00') === 0) {
			return null;
		}
		$t = strtotime($s . ' UTC');
	}
	return $t ? gmdate('Y-m-d\TH:i:s\Z', $t) : null;
}

/**
 * Text of a comment, reply or topic from a request: the text as typed (kw_store_text()
 * it to save it), or kw_empty / kw_too_long. The length is of the typed text; nothing is cut silently.
 */
function kw_post_text($value, int $max) {
	$text = kw_plain_text($value, true);
	$len  = mb_strlen($text);
	if ($len === 0) {
		return kw_error('kw_empty', 'Write something first', 400);
	}
	if ($len > $max) {
		return kw_error('kw_too_long', 'The text is too long: at most ' . $max . ' characters', 400);
	}
	return $text;
}

/** More than five links in one post (moderators may post more): kw_links. */
function kw_links_error(string $text): ?WP_Error {
	if (!kw_is_moderator() && preg_match_all('~https?://~i', $text) > 5) {
		return kw_error('kw_links', 'Too many links: at most 5 in one post', 400);
	}
	return null;
}

/**
 * The first 300 characters on one line, for letters. In letters to members
 * ($lang >= 0) links become "[link]": the workshop's address must not carry anyone's links.
 */
function kw_excerpt(string $text, int $lang = -1): string {
	$s = trim((string) preg_replace('/\s+/u', ' ', kw_decode(wp_strip_all_tags($text))));
	if ($lang >= 0) {
		$s = kw_no_links($s, $lang);
	}
	return mb_strlen($s) > 300 ? rtrim(mb_substr($s, 0, 300)) . '…' : $s;
}

function kw_no_links(string $s, int $lang): string {
	return (string) preg_replace('~https?://\S+~iu', kw_tl('mail_link', $lang), $s);
}

function kw_signed_out(): WP_Error {
	return kw_error('kw_auth', 'Sign in first', 401);
}

function kw_unconfirmed(): WP_Error {
	return kw_error('kw_unconfirmed', 'Confirm your e-mail first: open the link in the letter from the workshop', 403);
}

/** Display name of a user for the API and letters, '' when the account is gone. */
function kw_user_name(int $user): string {
	$u = $user ? get_userdata($user) : false;
	return $u ? kw_decode($u->display_name) : '';
}

function kw_user_is_moderator(int $user): bool {
	return $user > 0 && user_can($user, 'edit_others_posts');
}

// ---------------------------------------------------------------------------
// Rate limits for members (moderators are exempt). Fixed windows: the hour or
// the day is part of the key, so a busy member is not locked out for good.

/** At least 10 seconds between two posts or edits by one member. */
function kw_post_gap(int $user): ?WP_Error {
	if (kw_is_moderator()) {
		return null;
	}
	$last = (int) get_transient('kw_last_post_' . $user);
	return $last && time() - $last < 10 ? kw_error('kw_rate', 'Please wait a few seconds before posting again', 429) : null;
}

/** Whether a member may post now: the 10-second gap, posts this hour, new topics today. */
function kw_post_rate(int $user, bool $topic = false): ?WP_Error {
	if (kw_is_moderator()) {
		return null;
	}
	$gap = kw_post_gap($user);
	if ($gap) {
		return $gap;
	}
	$limit = max(1, (int) get_option('kw_post_limit', 30));
	if (kw_limited('post' . $user . '|' . gmdate('YmdH'), $limit)) {
		return kw_error('kw_rate', 'Too many posts in this hour; please try again later', 429);
	}
	if ($topic && kw_limited('topic' . $user . '|' . gmdate('Ymd'), 5)) {
		return kw_error('kw_rate', 'Too many new topics today; please try again tomorrow', 429);
	}
	return null;
}

/** Counts an accepted post (or, with $edit, only starts the 10-second gap again). */
function kw_post_counted(int $user, bool $topic = false, bool $edit = false): void {
	set_transient('kw_last_post_' . $user, time(), MINUTE_IN_SECONDS);
	if ($edit || kw_is_moderator()) {
		return;
	}
	kw_count('post' . $user . '|' . gmdate('YmdH'), HOUR_IN_SECONDS + 10 * MINUTE_IN_SECONDS);
	if ($topic) {
		kw_count('topic' . $user . '|' . gmdate('Ymd'), DAY_IN_SECONDS + HOUR_IN_SECONDS);
	}
}

/** At most 20 reports an hour from one member (works, comments, replies and topics together); moderators are exempt. */
function kw_report_rate(int $user): ?WP_Error {
	if (kw_is_moderator() || !kw_limited('report' . $user . '|' . gmdate('YmdH'), 20)) {
		return null;
	}
	return kw_error('kw_rate', 'Too many reports in this hour; please try again later', 429);
}

function kw_report_counted(int $user): void {
	if (!kw_is_moderator()) {
		kw_count('report' . $user . '|' . gmdate('YmdH'), HOUR_IN_SECONDS + 10 * MINUTE_IN_SECONDS);
	}
}

// ---------------------------------------------------------------------------
// Locks. The limits above are read → act → count: parallel requests from one
// member would all pass them. Posting and reporting therefore run one at a time
// per member, under a MySQL named lock. Elsewhere (WordPress Playground runs on
// SQLite) there are no named locks: kw_lock() does nothing and says yes.

/** Whether the database has named locks (MySQL, MariaDB). */
function kw_db_has_locks(): bool {
	global $wpdb;
	static $has = null;
	if ($has === null) {
		$has = !(defined('DB_ENGINE') && strtolower((string) DB_ENGINE) === 'sqlite')
			&& !defined('SQLITE_DB_DROPIN_VERSION')
			&& is_object($wpdb) && stripos(get_class($wpdb), 'sqlite') === false;
	}
	return $has;
}

/** Locks this request holds: name => how many times taken. */
function &kw_locks_held(): array {
	static $held = [];
	return $held;
}

/** The lock's name on the database server, which other sites may share. */
function kw_lock_key(string $name): string {
	global $wpdb;
	return 'kw_' . md5((defined('DB_NAME') ? DB_NAME : '') . '|' . $wpdb->prefix . '|' . $name);
}

/**
 * Waits up to $timeout seconds for the lock $name. False only when someone else
 * kept it that long (answer kw_busy()); true when it is ours or there are no locks here.
 * Every kw_lock() that said true is followed by kw_unlock(), in a finally block.
 */
function kw_lock(string $name, int $timeout = 5): bool {
	global $wpdb;
	$held = &kw_locks_held();
	if (isset($held[$name])) {
		$held[$name]++;
		return true;
	}
	if (!kw_db_has_locks()) {
		return true;
	}
	// Never a database error in the log: where GET_LOCK does not work, go on without it.
	$quiet = $wpdb->suppress_errors(true);
	$got   = $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, %d)', kw_lock_key($name), max(0, $timeout)));
	$wpdb->suppress_errors($quiet);
	if ($got === null) {
		return true;
	}
	if ((string) $got !== '1') {
		return false;
	}
	$held[$name] = 1;
	return true;
}

function kw_unlock(string $name): void {
	global $wpdb;
	$held = &kw_locks_held();
	if (!isset($held[$name])) {
		return;
	}
	if (--$held[$name] > 0) {
		return;
	}
	unset($held[$name]);
	$quiet = $wpdb->suppress_errors(true);
	$wpdb->query($wpdb->prepare('SELECT RELEASE_LOCK(%s)', kw_lock_key($name)));
	$wpdb->suppress_errors($quiet);
}

/** The member's lock for posting and reporting. */
function kw_member_lock(int $user): string {
	return 'post_' . $user;
}

function kw_busy(): WP_Error {
	return kw_error('kw_rate', 'Another request is still running; please try again in a moment', 429);
}

// ---------------------------------------------------------------------------
// Letters within the day's budget. Brevo sends 300 letters a day for everything;
// confirmations and password resets must always get through, so notifications,
// report letters and feedback share KW_MAIL_DAY, and past it nothing is sent.

/** $kind: 'notify', 'report' or 'feedback'. False when not sent (over the budget, or the letter failed). */
function kw_mail_budget(string $kind, string $to, string $subject, string $body, array $headers = []): bool {
	$day   = gmdate('Ymd');
	$total = 'mail_day|' . $day;
	$caps  = ['report' => ['mail_report|' . $day, KW_MAIL_REPORTS], 'feedback' => ['fb_day|' . $day, KW_MAIL_FEEDBACK]];
	$part  = $caps[$kind] ?? null;
	if (kw_limited($total, KW_MAIL_DAY) || ($part && kw_limited($part[0], $part[1]))) {
		return false;
	}
	$sent = kw_mail($to, $subject, $body, $headers);
	if ($sent) {
		kw_count($total, DAY_IN_SECONDS + HOUR_IN_SECONDS);
		if ($part) {
			kw_count($part[0], DAY_IN_SECONDS + HOUR_IN_SECONDS);
		}
	}
	return $sent;
}

/**
 * Tells the author of a work about a new comment ('comment'), or the author of a
 * topic about a new reply ('reply'): not themselves, not when they turned these
 * letters off, at most one letter per work or topic in 30 minutes.
 */
function kw_notify_author(string $kind, WP_Post $target, WP_Comment $c): void {
	$to   = (int) $target->post_author;
	$from = (int) $c->user_id;
	if (!$to || $to === $from || get_post_meta($target->ID, '_kw_author_deleted', true) === '1') {
		return;
	}
	$u = get_userdata($to);
	// An address nobody confirmed may not be theirs: no letters to it.
	if (!$u || get_user_meta($to, '_kw_notify', true) === '0' || !kw_confirmed($to)) {
		return;
	}
	$key = 'kw_ntf_' . $to . '_' . $target->ID;
	if (get_transient($key)) {
		return;
	}
	// Claimed before sending, so a comment arriving meanwhile sends no second letter.
	set_transient($key, 1, 30 * MINUTE_IN_SECONDS);
	$lang = kw_user_lang($to);
	$code = KW_LANG_CODES[$lang];
	$link = $kind === 'comment'
		? KW_GALLERY . '?lang=' . $code . '#item-' . $target->ID . '-comments'
		: KW_FORUM . '?t=' . $target->ID . '&r=' . (int) $c->comment_ID . '&lang=' . $code;
	$vars = [
		'name'    => kw_decode($u->display_name),
		'author'  => kw_no_links(kw_user_name($from), $lang),
		'title'   => kw_no_links(kw_decode($target->post_title), $lang),
		'excerpt' => kw_excerpt($c->comment_content, $lang),
		'link'    => $link,
		'off'     => kw_url('account', ['lang' => $code]) . '#notify',
	];
	if (!kw_mail_budget('notify', $u->user_email, kw_tl('mail_' . $kind . '_subject', $lang, $vars), kw_tl('mail_' . $kind . '_body', $lang, $vars))) {
		// Not sent (over the budget, or the mail failed): a later comment may try again.
		delete_transient($key);
	}
}

// ---------------------------------------------------------------------------
// Comments and replies in the API

/** Who reported a comment or reply: [{user, reason, time}], at most 50. */
function kw_comment_reports(int $id): array {
	$v = get_comment_meta($id, '_kw_reports', true);
	return is_array($v) ? $v : [];
}

/** The shape of a comment or a forum reply for the website and the app. */
function kw_post_json(WP_Comment $c): array {
	$uid    = (int) $c->user_id;
	$me     = get_current_user_id();
	$edited = (int) get_comment_meta($c->comment_ID, '_kw_edited', true);
	$out    = [
		'id'      => (int) $c->comment_ID,
		'author'  => kw_user_name($uid),
		'mod'     => kw_user_is_moderator($uid),
		'content' => kw_decode($c->comment_content),
		'created' => kw_iso_gmt($c->comment_date_gmt),
		'edited'  => $edited ? kw_iso_gmt($edited) : null,
		'own'     => $me > 0 && $uid === $me,
		'status'  => $c->comment_approved === '1' ? 'publish' : 'hidden',
	];
	if (kw_is_moderator()) {
		$out['reports'] = count(kw_comment_reports((int) $c->comment_ID));
	}
	return $out;
}

/** Approved comments of a type on a post. */
function kw_comment_count(int $post, string $type = 'kw_comment'): int {
	return (int) get_comments(['post_id' => $post, 'type' => $type, 'status' => 'approve', 'count' => true]);
}

/**
 * One page of comments or replies the current user may see: everyone sees the
 * approved ones, authors also their own hidden ones, moderators all hidden ones.
 * 'total' counts those rows (for paging), 'count' only the approved ones.
 */
function kw_comment_list(int $post, string $type, int $page, int $per, string $order): array {
	$me   = get_current_user_id();
	$mod  = kw_is_moderator();
	$args = [
		'post_id'       => $post,
		'type'          => $type,
		'status'        => $mod ? 'all' : 'approve',
		'orderby'       => 'comment_date_gmt',
		'order'         => $order,
		'number'        => $per,
		'paged'         => $page,
		'no_found_rows' => false,
	];
	if (!$mod && $me) {
		$args['include_unapproved'] = [$me];
	}
	$q     = new WP_Comment_Query($args);
	$rows  = $q->comments;
	$total = (int) $q->found_comments;
	cache_users(array_filter(array_map('intval', wp_list_pluck($rows, 'user_id'))));
	return [
		'posts' => array_map('kw_post_json', $rows),
		'total' => $total,
		'pages' => max(1, (int) ceil($total / max(1, $per))),
		'page'  => $page,
		'count' => $mod || $me ? kw_comment_count($post, $type) : $total,
	];
}

/** Saves a new comment or reply by $user ($text as typed): it appears at once. */
function kw_insert_comment(int $post, string $type, string $text, int $user) {
	$u  = get_userdata($user);
	$id = wp_insert_comment(wp_slash([
		'comment_post_ID'      => $post,
		'comment_content'      => kw_store_text($text),
		'comment_type'         => $type,
		'comment_approved'     => 1,
		'user_id'              => $user,
		'comment_author'       => $u ? $u->display_name : '',
		// Nothing else about the person: no e-mail, address or browser (see the privacy policy).
		'comment_author_email' => '',
		'comment_author_url'   => '',
		'comment_author_IP'    => '',
		'comment_agent'        => '',
		'comment_parent'       => 0,
	]));
	$c = $id ? get_comment($id) : null;
	return $c instanceof WP_Comment ? $c : kw_error('kw_store', 'Could not save the post', 500);
}

/**
 * A comment (on a work) or a forum reply by id that the current user may see,
 * with its work or topic: [WP_Comment, WP_Post], or null. Other comments on the
 * site are not ours to touch.
 */
function kw_find_post_comment(int $id): ?array {
	$c = get_comment($id);
	if (!$c instanceof WP_Comment || !in_array($c->comment_type, KW_COMMENT_TYPES, true)) {
		return null;
	}
	$post = get_post((int) $c->comment_post_ID);
	if (!$post) {
		return null;
	}
	$visible = $c->comment_type === 'kw_comment'
		? $post->post_type === KW_POST_TYPE && kw_can_see($post)
		: $post->post_type === KW_TOPIC_TYPE && kw_topic_can_see($post);
	if (!$visible) {
		return null;
	}
	if ($c->comment_approved === '1') {
		return [$c, $post];
	}
	$me = get_current_user_id();
	if ($c->comment_approved === '0' && (($me && (int) $c->user_id === $me) || kw_is_moderator())) {
		return [$c, $post];
	}
	return null;
}

/**
 * The current user's own comment or reply by id, shown or hidden, with its work or
 * topic: [WP_Comment, WP_Post], or null. Also while that work or topic is not shown
 * (back on review, returned to its author, hidden after reports), so people can always
 * remove what they wrote. Not one already in the trash, or on a work or topic in it.
 */
function kw_find_own_comment(int $id): ?array {
	$me = get_current_user_id();
	$c  = get_comment($id);
	if (!$me || !$c instanceof WP_Comment || !in_array($c->comment_type, KW_COMMENT_TYPES, true) || (int) $c->user_id !== $me) {
		return null;
	}
	// 'trash', 'spam' and 'post-trashed' (its work or topic went to the trash) are not theirs to touch.
	if ($c->comment_approved !== '1' && $c->comment_approved !== '0') {
		return null;
	}
	$post = get_post((int) $c->comment_post_ID);
	$type = $c->comment_type === 'kw_comment' ? KW_POST_TYPE : KW_TOPIC_TYPE;
	if (!$post || $post->post_type !== $type || $post->post_status === 'trash') {
		return null;
	}
	return [$c, $post];
}

// ---------------------------------------------------------------------------
// Reports on comments, replies and topics. Stored like reports on works:
// _kw_reports = [{user, reason, time}], at most 50. The admin hears about the
// first one. kw_auto_hide reports from confirmed members who are not moderators
// hide the post until a moderator approves it again; those people's reports on
// it then move to _kw_reports_cleared and never count again.

function kw_reports_of(string $type, int $id): array {
	$v = $type === 'comment' ? get_comment_meta($id, '_kw_reports', true) : get_post_meta($id, '_kw_reports', true);
	return is_array($v) ? $v : [];
}

function kw_reports_cleared(string $type, int $id): array {
	$v = $type === 'comment' ? get_comment_meta($id, '_kw_reports_cleared', true) : get_post_meta($id, '_kw_reports_cleared', true);
	return is_array($v) ? array_map('intval', $v) : [];
}

/** Reports looked at: the post stays, and these people's reports on it no longer count. */
function kw_clear_reports(string $type, int $id): void {
	$reports = kw_reports_of($type, $id);
	if (!$reports) {
		return;
	}
	$cleared = array_values(array_unique(array_merge(kw_reports_cleared($type, $id), array_map(fn($x) => (int) ($x['user'] ?? 0), $reports))));
	if ($type === 'comment') {
		update_comment_meta($id, '_kw_reports_cleared', $cleared);
		delete_comment_meta($id, '_kw_reports');
	} else {
		update_post_meta($id, '_kw_reports_cleared', $cleared);
		delete_post_meta($id, '_kw_reports');
	}
}

/** Reports that count toward hiding a post: from confirmed members who are not moderators, not cleared before. */
function kw_counting_reports(array $reports, array $cleared): int {
	$n = 0;
	foreach ($reports as $rep) {
		$u = (int) ($rep['user'] ?? 0);
		if ($u && !in_array($u, $cleared, true) && get_userdata($u) && kw_confirmed($u) && !kw_user_is_moderator($u)) {
			$n++;
		}
	}
	return $n;
}

/**
 * Files the current user's report. $type is 'comment' (comments and replies) or
 * 'post' (topics), $author wrote the post, $mail(reason) writes to the admin,
 * $hide() hides the post. The caller has checked sign-in, e-mail and visibility.
 */
function kw_report(string $type, int $id, int $author, WP_REST_Request $r, callable $mail, callable $hide) {
	$user = get_current_user_id();
	if ($author && $author === $user) {
		return kw_error('kw_own', 'This is your own post', 400);
	}
	$reason = kw_reason($r);
	if ($reason === '') {
		return kw_error('kw_reason', 'Say what is wrong', 400);
	}
	$lock = kw_member_lock($user);
	if (!kw_lock($lock)) {
		return kw_busy();
	}
	try {
		// Reports saved while this request waited: not in this request's copy of the meta.
		wp_cache_delete($id, $type === 'comment' ? 'comment_meta' : 'post_meta');
		$reports = kw_reports_of($type, $id);
		$cleared = kw_reports_cleared($type, $id);
		// One report per person; a moderator already looked at the earlier one.
		if (in_array($user, $cleared, true)) {
			return ['reported' => true];
		}
		foreach ($reports as $rep) {
			if ((int) ($rep['user'] ?? 0) === $user) {
				return ['reported' => true];
			}
		}
		$error = kw_report_rate($user);
		if ($error) {
			return $error;
		}
		$reports[] = ['user' => $user, 'reason' => $reason, 'time' => time()];
		$reports   = array_slice($reports, -50);
		if ($type === 'comment') {
			update_comment_meta($id, '_kw_reports', wp_slash($reports));
		} else {
			update_post_meta($id, '_kw_reports', wp_slash($reports));
		}
		kw_report_counted($user);
	} finally {
		kw_unlock($lock);
	}
	if (count($reports) === 1) {
		$mail($reason);
	}
	$limit = (int) get_option('kw_auto_hide', 3);
	if ($limit > 0 && !kw_user_is_moderator($author) && kw_counting_reports($reports, $cleared) >= $limit) {
		$hide();
	}
	return ['reported' => true];
}

/** The admin's letter about the first report on a comment, reply or topic ($what: comment, reply, topic). */
function kw_report_letter(string $what, int $author, string $title, string $text, string $reason, string $link): void {
	$lang = kw_lang();
	$name = kw_user_name($author);
	$vars = [
		'what'    => kw_tl('creport_' . $what, $lang),
		'author'  => $name !== '' ? $name : kw_tl('forum_author_deleted', $lang),
		'title'   => kw_decode($title),
		'excerpt' => kw_excerpt($text),
		'reason'  => kw_decode($reason),
		'link'    => $link,
	];
	kw_mail_budget('report', (string) get_option('admin_email'), kw_tl('mail_creport_subject', $lang, $vars), kw_tl('mail_creport_body', $lang, $vars));
}

/** The report flow for a comment or reply the caller may see (approved ones only). */
function kw_report_comment(WP_Comment $c, WP_Post $post, WP_REST_Request $r) {
	$id   = (int) $c->comment_ID;
	$what = $c->comment_type === 'kw_comment' ? 'comment' : 'reply';
	return kw_report('comment', $id, (int) $c->user_id, $r, function ($reason) use ($c, $post, $what) {
		kw_report_letter($what, (int) $c->user_id, $post->post_title, $c->comment_content, $reason, admin_url('comment.php?action=editcomment&c=' . (int) $c->comment_ID));
	}, function () use ($id) {
		wp_set_comment_status($id, 'hold');
	});
}

// ---------------------------------------------------------------------------
// WordPress's own comment paths

// The comment form, XML-RPC and pingbacks: closed on works and topics (the kadro/v1 routes are the way in).
function kw_comments_closed_here($open, $post_id) {
	return in_array(get_post_type($post_id), [KW_POST_TYPE, KW_TOPIC_TYPE], true) ? false : $open;
}
add_filter('comments_open', 'kw_comments_closed_here', 10, 2);
add_filter('pings_open', 'kw_comments_closed_here', 10, 2);

// A moderator's reply from the Comments screen or the topic's edit screen becomes
// one of ours: the right type, no threads, nothing stored about the browser, and
// plain text stored like the website's (kw_store_text). That reply box takes HTML:
// tags go, entities become the characters they stand for. The data here is slashed.
add_filter('preprocess_comment', function ($data) {
	$type = get_post_type((int) ($data['comment_post_ID'] ?? 0));
	if ($type === KW_POST_TYPE) {
		$data['comment_type'] = 'kw_comment';
	} elseif ($type === KW_TOPIC_TYPE) {
		$data['comment_type'] = 'kw_reply';
	} else {
		return $data;
	}
	$data['comment_parent']       = 0;
	$data['comment_content']      = wp_slash(kw_store_text(kw_plain_text(kw_decode(wp_strip_all_tags(wp_unslash((string) ($data['comment_content'] ?? '')))), true)));
	$data['comment_author_email'] = '';
	$data['comment_author_url']   = '';
	$data['comment_author_IP']    = '';
	$data['comment_agent']        = '';
	return $data;
});

// WordPress's own "new comment" letters would go out in English, outside the budget.
function kw_no_core_letters($maybe, $comment_id) {
	$c = get_comment($comment_id);
	return $c && in_array($c->comment_type, KW_COMMENT_TYPES, true) ? false : $maybe;
}
add_filter('notify_post_author', 'kw_no_core_letters', 10, 2);
add_filter('notify_moderator', 'kw_no_core_letters', 10, 2);

// A topic's last activity follows its replies wherever they change: the API, the
// Comments screen (approve, unapprove, spam, trash), deleting an account.
function kw_reply_changed($id, $c = null): void {
	$c = $c instanceof WP_Comment ? $c : get_comment($id);
	if ($c instanceof WP_Comment && $c->comment_type === 'kw_reply') {
		kw_topic_touch((int) $c->comment_post_ID);
	}
}
add_action('wp_insert_comment', 'kw_reply_changed', 10, 2);
add_action('trashed_comment', 'kw_reply_changed', 10, 2);
add_action('untrashed_comment', 'kw_reply_changed', 10, 2);
add_action('spammed_comment', 'kw_reply_changed', 10, 2);
add_action('unspammed_comment', 'kw_reply_changed', 10, 2);
add_action('deleted_comment', 'kw_reply_changed', 10, 2);
add_action('transition_comment_status', function ($new, $old, $c) {
	kw_reply_changed(0, $c);
	// A moderator approved a hidden comment or reply: the reports on it are dealt with.
	if ($new === 'approved' && $old === 'unapproved' && $c instanceof WP_Comment && in_array($c->comment_type, KW_COMMENT_TYPES, true)) {
		kw_clear_reports('comment', (int) $c->comment_ID);
	}
}, 10, 3);

add_action('transition_post_status', function ($new, $old, $post) {
	if ($new === 'publish' && $old === 'pending' && $post instanceof WP_Post && $post->post_type === KW_TOPIC_TYPE) {
		kw_clear_reports('post', $post->ID);
	}
}, 10, 3);

// Since WordPress 5.6 a post restored from the trash becomes a draft; a topic goes back to what it was.
add_filter('wp_untrash_post_status', function ($status, $post_id, $previous) {
	return get_post_type($post_id) === KW_TOPIC_TYPE && $previous ? $previous : $status;
}, 10, 3);

// ---------------------------------------------------------------------------
// WordPress's own edit screen: the title of a topic or a feedback message as typed
//
// WordPress fills its title field with the stored text as HTML source, so a stored
// "AT&amp;T" would read "AT&amp;T" there. For topics and feedback the field shows the
// text as typed instead, and what comes back from it (on Update, or as the autosave of
// a draft) is plain text, stored like the website's (kw_store_text). Every other save
// keeps the title as it comes: Quick Edit still shows and sends the stored form. The
// text box below stays WordPress's HTML editor (its visual mode shows the text as typed),
// as do the comment boxes, where a reply written in WP admin is read as HTML too.

function kw_plain_title_type(string $type): bool {
	return in_array($type, [KW_TOPIC_TYPE, KW_FEEDBACK_TYPE], true);
}

add_filter('title_edit_pre', function ($title, $id) {
	return kw_plain_title_type((string) get_post_type((int) $id)) ? kw_decode((string) $title) : $title;
}, 10, 2);

add_action('edit_form_after_title', function ($post) {
	if ($post instanceof WP_Post && kw_plain_title_type($post->post_type)) {
		wp_nonce_field('kw_title_' . $post->ID, 'kw_title_nonce', false);
	}
});

/**
 * The title typed on the edit screen of post $id, when $saving (slashed) is that very
 * title coming back from there; else null (another save, also a later one in the same request).
 */
function kw_typed_title(int $id, $saving): ?string {
	if (!$id || !is_string($saving) || !is_admin()) {
		return null;
	}
	$sent  = null;
	$nonce = $_POST['kw_title_nonce'] ?? null;
	if (is_string($nonce) && (int) ($_POST['post_ID'] ?? 0) === $id && wp_verify_nonce(wp_unslash($nonce), 'kw_title_' . $id)) {
		$sent = $_POST['post_title'] ?? null;
	} elseif (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE && (int) ($_POST['data']['wp_autosave']['post_id'] ?? 0) === $id) {
		$sent = $_POST['data']['wp_autosave']['post_title'] ?? null;
	}
	return is_string($sent) && wp_unslash($sent) === wp_unslash($saving) ? wp_unslash($sent) : null;
}

add_filter('wp_insert_post_data', function ($data, $postarr, $unsanitized) {
	$type = (string) ($data['post_type'] ?? '');
	$id   = (int) ($postarr['ID'] ?? 0);
	if ($type === 'revision') {
		// The autosave of a published topic, kept aside as a revision: the same, so restoring it gives the title back.
		$id   = (int) ($data['post_parent'] ?? 0);
		$type = (string) get_post_type($id);
	}
	if (!kw_plain_title_type($type)) {
		return $data;
	}
	$typed = kw_typed_title($id, $unsanitized['post_title'] ?? null);
	if ($typed !== null) {
		// The data here is slashed; WordPress unslashes it right after this filter.
		$data['post_title'] = wp_slash(kw_store_text(kw_plain_text($typed, false)));
	}
	return $data;
}, 10, 3);

// ---------------------------------------------------------------------------
// REST: fresh answers for the community routes, and cookie sign-ins kept to kadro/v1

// Threads change all the time: the host's caches must not keep old copies.
add_filter('rest_post_dispatch', function ($response, $server, $request) {
	$route = (string) $request->get_route();
	if ($response instanceof WP_HTTP_Response && preg_match('#^/kadro/v1/(?:(?:forum|comments|feedback)(?:/|$)|items/\d+/comments)#', $route)) {
		$response->header('Cache-Control', 'no-cache, must-revalidate, max-age=0');
		if (function_exists('batcache_cancel')) {
			batcache_cancel();
		}
	}
	return $response;
}, 10, 3);

/*
 * The website signs in with the cookie and the nonce from ?kadro=whoami. With
 * them WordPress's own REST API could change the password or e-mail without the
 * current password (/wp/v2/users/me) or create application passwords, so a
 * member signed in that way reaches only kadro/v1. The app uses application
 * passwords and is not affected; editors and admins keep everything.
 */
add_filter('rest_pre_dispatch', function ($result, $server, $request) {
	if ($result !== null || ($GLOBALS['wp_rest_auth_cookie'] ?? null) !== true || !is_user_logged_in() || current_user_can('edit_posts')) {
		return $result;
	}
	if (strpos((string) $request->get_route(), '/kadro/v1/') === 0) {
		return $result;
	}
	return kw_error('kw_forbidden', 'Not available with this sign-in', 403);
}, 10, 3);

// ---------------------------------------------------------------------------
// Deleting an account (before WordPress deletes it): comments and replies go for
// good. Topics go too, except one that other people replied to: it stays under
// its title, without the text and the author.

add_action('delete_user', function ($id, $reassign = null) {
	global $wpdb;
	$id  = (int) $id;
	$ids = get_comments(['user_id' => $id, 'status' => 'any', 'type__in' => KW_COMMENT_TYPES, 'fields' => 'ids']);
	foreach ($ids as $cid) {
		wp_delete_comment((int) $cid, true);
	}
	$statuses = ['publish', 'pending', 'draft', 'future', 'private', 'trash'];
	// An admin who gives the user's content to someone else keeps the topics as they
	// are (WordPress moves them after this hook); the last activity moves with them.
	if ($reassign !== null) {
		$last = get_posts([
			'post_type'        => KW_TOPIC_TYPE,
			'post_status'      => $statuses,
			'meta_query'       => [['key' => '_kw_last_user', 'value' => (string) $id]],
			'fields'           => 'ids',
			'numberposts'      => -1,
			'suppress_filters' => true,
		]);
		foreach ($last as $tid) {
			update_post_meta((int) $tid, '_kw_last_user', (int) $reassign);
		}
		return;
	}
	$topics = get_posts([
		'post_type'        => KW_TOPIC_TYPE,
		'author'           => $id,
		'post_status'      => $statuses,
		'fields'           => 'ids',
		'numberposts'      => -1,
		'suppress_filters' => true,
	]);
	foreach ($topics as $tid) {
		$tid = (int) $tid;
		if (kw_comment_count($tid, 'kw_reply') > 0) {
			// Directly, so WordPress filters nothing else; post_author 0 so no new account ever "owns" it.
			$wpdb->update($wpdb->posts, ['post_content' => '', 'post_author' => 0], ['ID' => $tid]);
			clean_post_cache($tid);
			update_post_meta($tid, '_kw_author_deleted', '1');
			if ((int) get_post_meta($tid, '_kw_last_user', true) === $id) {
				update_post_meta($tid, '_kw_last_user', 0);
			}
		} else {
			wp_delete_post($tid, true);
		}
	}
}, 10, 2);

// ---------------------------------------------------------------------------
// Daily clean-up (old feedback: feedback.php)

add_action('init', function () {
	if (!wp_next_scheduled('kw_cleanup')) {
		wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'kw_cleanup');
	}
});

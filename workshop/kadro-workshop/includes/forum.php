<?php
// The forum on kadro.studio/forum/, with the same accounts as the workshop.
// Topics are posts of type kadro_topic in one section each (taxonomy
// kadro_forum); replies are comments of type kw_reply. The website reads and
// writes them through kadro/v1/forum; moderators also work in WP admin (Forum
// menu, Comments screen). Topics are not public in WordPress itself: no pages,
// no archives, nothing for the front-end redirect to catch.

if (!defined('ABSPATH')) {
	exit;
}

/** The sections every forum starts with: slug => [order, only moderators start topics]. Names and descriptions come from the strings. */
const KW_FORUM_SECTIONS = [
	'news'     => [1, true],
	'help'     => [2, false],
	'ideas'    => [3, false],
	'bugs'     => [4, false],
	'showcase' => [5, false],
	'workshop' => [6, false],
	'chat'     => [7, false],
];

// ---------------------------------------------------------------------------
// Data model

add_action('init', function () {
	register_post_type(KW_TOPIC_TYPE, [
		'labels'              => [
			'name'          => kw_t('forum_topics'),
			'singular_name' => kw_t('forum_topic'),
			'menu_name'     => kw_t('forum_menu'),
			'all_items'     => kw_t('forum_all_topics'),
			'add_new'       => kw_t('forum_add_topic'),
			'add_new_item'  => kw_t('forum_add_topic'),
			'edit_item'     => kw_t('forum_edit_topic'),
			'search_items'  => kw_t('forum_search_topics'),
			'not_found'     => kw_t('forum_no_topics'),
		],
		'public'              => false,
		'publicly_queryable'  => false,
		'exclude_from_search' => true,
		'show_ui'             => true,
		'show_in_menu'        => true,
		'show_in_nav_menus'   => false,
		'show_in_admin_bar'   => false,
		'menu_icon'           => 'dashicons-format-chat',
		'supports'            => ['title', 'editor', 'author', 'comments'],
		// Deleting an account must not take other people's replies with the topic (community.php decides).
		'delete_with_user'    => false,
		'show_in_rest'        => false,
		'capability_type'     => 'post',
		'map_meta_cap'        => true,
		'has_archive'         => false,
		'rewrite'             => false,
		'query_var'           => false,
	]);
	register_taxonomy(KW_FORUM_TAX, KW_TOPIC_TYPE, [
		'labels'             => [
			'name'          => kw_t('forum_sections'),
			'singular_name' => kw_t('forum_section'),
			'menu_name'     => kw_t('forum_sections'),
			'add_new_item'  => kw_t('forum_add_section'),
			'edit_item'     => kw_t('forum_edit_section'),
		],
		'public'             => false,
		'show_ui'            => true,
		'show_in_menu'       => true,
		'show_admin_column'  => true,
		'show_in_quick_edit' => false,
		'show_tagcloud'      => false,
		'show_in_nav_menus'  => false,
		'hierarchical'       => false,
		'rewrite'            => false,
		'query_var'          => false,
		'show_in_rest'       => false,
		// Exactly one section per topic: radio buttons instead of a tag box.
		'meta_box_cb'        => 'kw_section_box',
		/*
		 * Chat is the default section: WordPress creates it when it is missing, never
		 * deletes it, and moves the topics of a deleted section there. The name must
		 * be the same in every request (WordPress looks the term up by it, or by the
		 * slug made from it, each time): "Chat" finds the slug chat whatever the term
		 * is called, and kw_section_slug_kept() never lets that slug change;
		 * kw_forum_seed() gives a new one its name in the site's language.
		 */
		'default_term'       => [
			'name'        => kw_tl('forum_s_chat', 0),
			'slug'        => 'chat',
			'description' => kw_tl('forum_sd_chat', 0),
		],
	]);
	kw_forum_seed();
});

/** Creates the default sections (once per plugin version; an existing slug is left alone). */
function kw_forum_seed(): void {
	if (get_option('kw_forum_seeded') === KW_VERSION) {
		return;
	}
	foreach (KW_FORUM_SECTIONS as $slug => $how) {
		$have = get_term_by('slug', $slug, KW_FORUM_TAX);
		if ($have instanceof WP_Term) {
			// Chat as WordPress made it (the default section, in English): in the site's language like the others.
			if ($slug === 'chat' && $have->name === kw_tl('forum_s_chat', 0) && $have->description === kw_tl('forum_sd_chat', 0) && kw_t('forum_s_chat') !== $have->name) {
				wp_update_term((int) $have->term_id, KW_FORUM_TAX, ['name' => kw_t('forum_s_chat'), 'slug' => 'chat', 'description' => kw_t('forum_sd_chat')]);
			}
			continue;
		}
		$made = wp_insert_term(kw_t('forum_s_' . $slug), KW_FORUM_TAX, ['slug' => $slug, 'description' => kw_t('forum_sd_' . $slug)]);
		if (is_wp_error($made)) {
			continue;
		}
		update_term_meta((int) $made['term_id'], '_kw_order', $how[0]);
		update_term_meta((int) $made['term_id'], '_kw_locked', $how[1] ? '1' : '0');
	}
	// Topics that came some other way get what the lists sort by.
	$missing = get_posts([
		'post_type'        => KW_TOPIC_TYPE,
		'post_status'      => ['publish', 'pending', 'draft', 'future', 'private'],
		'fields'           => 'ids',
		'numberposts'      => 500,
		'meta_query'       => [['key' => '_kw_last', 'compare' => 'NOT EXISTS']],
		'suppress_filters' => true,
	]);
	foreach ($missing as $id) {
		kw_topic_defaults((int) $id);
	}
	update_option('kw_forum_seeded', KW_VERSION, true);
}

/** Meta every topic has, so ordering by it never drops one: pinned and closed as '0'/'1', and the last activity. */
function kw_topic_defaults(int $id): void {
	$post = get_post($id);
	if (!$post) {
		return;
	}
	foreach (['_kw_pinned', '_kw_closed'] as $key) {
		if (get_post_meta($id, $key, true) === '') {
			update_post_meta($id, $key, '0');
		}
	}
	if (get_post_meta($id, '_kw_last', true) === '') {
		update_post_meta($id, '_kw_last', (int) (get_post_timestamp($post) ?: time()));
		update_post_meta($id, '_kw_last_user', (int) $post->post_author);
	}
}

/**
 * The last activity in a topic: its newest approved reply, else the topic itself.
 * The same answer every time nothing changed, so saving a topic never moves it up.
 */
function kw_topic_touch(int $topic): void {
	$post = get_post($topic);
	if (!$post || $post->post_type !== KW_TOPIC_TYPE) {
		return;
	}
	// WordPress fires deleted_comment before it clears the comment caches: a
	// persistent object cache would still answer with the reply just deleted.
	wp_cache_set_comments_last_changed();
	$last = get_comments(['post_id' => $topic, 'type' => 'kw_reply', 'status' => 'approve', 'number' => 1, 'orderby' => 'comment_date_gmt', 'order' => 'DESC']);
	if ($last) {
		$time = (int) strtotime($last[0]->comment_date_gmt . ' UTC');
		$user = (int) $last[0]->user_id;
	} else {
		$time = (int) (get_post_timestamp($post) ?: time());
		$user = get_post_meta($topic, '_kw_author_deleted', true) === '1' ? 0 : (int) $post->post_author;
	}
	update_post_meta($topic, '_kw_last', $time);
	update_post_meta($topic, '_kw_last_user', $user);
}

/** Who may see a topic: everyone when published; a hidden one (pending) its author and the moderators. */
function kw_topic_can_see(WP_Post $post): bool {
	if ($post->post_type !== KW_TOPIC_TYPE) {
		return false;
	}
	if ($post->post_status === 'publish') {
		return true;
	}
	if ($post->post_status !== 'pending') {
		return false;
	}
	$me = get_current_user_id();
	return $me > 0 && (kw_topic_author($post) === $me || kw_is_moderator());
}

function kw_find_topic(int $id): ?WP_Post {
	$post = get_post($id);
	return $post && kw_topic_can_see($post) ? $post : null;
}

/** The topic's author, 0 when their account was deleted. */
function kw_topic_author(WP_Post $post): int {
	return get_post_meta($post->ID, '_kw_author_deleted', true) === '1' ? 0 : (int) $post->post_author;
}

/** Hides a topic after enough reports: straight in the database (no kses run as the reporter), with the usual hooks. */
function kw_hide_topic(int $id): void {
	global $wpdb;
	$post = get_post($id);
	if (!$post || $post->post_status !== 'publish') {
		return;
	}
	$wpdb->update($wpdb->posts, ['post_status' => 'pending'], ['ID' => $id]);
	clean_post_cache($id);
	wp_transition_post_status('pending', 'publish', get_post($id));
}

// ---------------------------------------------------------------------------
// Sections

/** All sections in their order (_kw_order, a missing one counts as 100), then by name. */
function kw_forum_sections(): array {
	$terms = get_terms(['taxonomy' => KW_FORUM_TAX, 'hide_empty' => false]);
	if (is_wp_error($terms)) {
		return [];
	}
	usort($terms, function ($a, $b) {
		$d = kw_section_order($a) <=> kw_section_order($b);
		return $d ?: strcasecmp($a->name, $b->name);
	});
	return $terms;
}

function kw_section_order(WP_Term $t): int {
	$o = get_term_meta($t->term_id, '_kw_order', true);
	return $o === '' ? 100 : (int) $o;
}

function kw_section_locked(WP_Term $t): bool {
	return get_term_meta($t->term_id, '_kw_locked', true) === '1';
}

function kw_forum_section(string $slug): ?WP_Term {
	$slug = sanitize_title($slug);
	if ($slug === '') {
		return null;
	}
	$t = get_term_by('slug', $slug, KW_FORUM_TAX);
	return $t instanceof WP_Term ? $t : null;
}

/** Where a topic goes when it has no section: the default section (Chat), else the first section. */
function kw_default_section_id(): int {
	$id = (int) get_option('default_term_' . KW_FORUM_TAX, 0);
	if ($id && get_term($id, KW_FORUM_TAX) instanceof WP_Term) {
		return $id;
	}
	$chat = kw_forum_section('chat');
	if ($chat) {
		return (int) $chat->term_id;
	}
	$all = kw_forum_sections();
	return $all ? (int) $all[0]->term_id : 0;
}

/** Name and description in every language: the default sections from the strings, others as the admin wrote them. */
function kw_section_texts(WP_Term $t): array {
	$name = [];
	$desc = [];
	foreach (KW_LANG_CODES as $i => $code) {
		if (isset(KW_FORUM_SECTIONS[$t->slug])) {
			$name[$code] = kw_tl('forum_s_' . $t->slug, $i);
			$desc[$code] = kw_tl('forum_sd_' . $t->slug, $i);
		} else {
			$name[$code] = kw_decode($t->name);
			$desc[$code] = kw_decode(wp_strip_all_tags($t->description));
		}
	}
	return [$name, $desc];
}

function kw_topic_section(WP_Post $post): string {
	$terms = get_the_terms($post, KW_FORUM_TAX);
	return $terms && !is_wp_error($terms) ? $terms[0]->slug : '';
}

// ---------------------------------------------------------------------------
// Topics in the API

/** Approved replies per topic, in one query. */
function kw_reply_counts(array $ids): array {
	global $wpdb;
	$ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
	if (!$ids) {
		return [];
	}
	$out  = array_fill_keys($ids, 0);
	$rows = $wpdb->get_results("SELECT comment_post_ID AS id, COUNT(*) AS n FROM {$wpdb->comments} WHERE comment_post_ID IN (" . implode(',', $ids) . ") AND comment_type = 'kw_reply' AND comment_approved = '1' GROUP BY comment_post_ID");
	foreach ($rows as $row) {
		$out[(int) $row->id] = (int) $row->n;
	}
	return $out;
}

/** A topic for the website: the list form, or with $detail its text and what the current user may do. */
function kw_topic_json(WP_Post $p, bool $detail = false, ?int $replies = null): array {
	$author = kw_topic_author($p);
	$me     = get_current_user_id();
	$mod    = kw_is_moderator();
	$closed = get_post_meta($p->ID, '_kw_closed', true) === '1';
	$last   = (int) get_post_meta($p->ID, '_kw_last', true);
	$edited = (int) get_post_meta($p->ID, '_kw_edited', true);
	$out    = [
		'id'         => $p->ID,
		'title'      => kw_decode($p->post_title),
		'section'    => kw_topic_section($p),
		'author'     => kw_user_name($author),
		'mod'        => kw_user_is_moderator($author),
		'created'    => kw_iso_gmt((int) get_post_timestamp($p)),
		'last'       => kw_iso_gmt($last ?: (int) get_post_timestamp($p)),
		'lastAuthor' => kw_user_name((int) get_post_meta($p->ID, '_kw_last_user', true)),
		'replies'    => $replies ?? kw_comment_count($p->ID, 'kw_reply'),
		'pinned'     => get_post_meta($p->ID, '_kw_pinned', true) === '1',
		'closed'     => $closed,
		'own'        => $me > 0 && $author === $me,
		'status'     => $p->post_status === 'publish' ? 'publish' : 'hidden',
		'edited'     => $edited ? kw_iso_gmt($edited) : null,
	];
	if ($mod) {
		$out['reports'] = count(kw_reports($p->ID));
	}
	if ($detail) {
		$open           = kw_forum_open();
		$text           = trim(kw_decode(wp_strip_all_tags($p->post_content)));
		$out['content'] = (string) preg_replace("/\n{3,}/", "\n\n", str_replace("\r\n", "\n", $text));
		$out['open']    = $open;
		$out['canReply'] = $open && $p->post_status === 'publish' && (!$closed || $mod) && $me > 0 && ($mod || kw_confirmed($me));
	}
	return $out;
}

/** Topics for a list, with the reply counts and the people in one go. */
function kw_topics_json(array $posts): array {
	$counts = kw_reply_counts(wp_list_pluck($posts, 'ID'));
	$users  = [];
	foreach ($posts as $p) {
		$users[] = (int) $p->post_author;
		$users[] = (int) get_post_meta($p->ID, '_kw_last_user', true);
	}
	cache_users(array_values(array_unique(array_filter($users))));
	return array_map(fn($p) => kw_topic_json($p, false, $counts[$p->ID] ?? 0), $posts);
}

/** WP_Query for topic lists; with $own_pending, hidden topics only of that member. */
function kw_topic_query(array $args, int $own_pending = 0): WP_Query {
	if (!$own_pending) {
		return new WP_Query($args);
	}
	$where = function ($w) use ($own_pending) {
		global $wpdb;
		return $w . $wpdb->prepare(" AND ({$wpdb->posts}.post_status <> 'pending' OR {$wpdb->posts}.post_author = %d)", $own_pending);
	};
	add_filter('posts_where', $where);
	$q = new WP_Query($args);
	remove_filter('posts_where', $where);
	return $q;
}

/** A topic title from a request: 3–120 characters on one line, as typed (kw_store_text() it to save it), or kw_title. */
function kw_topic_title($value) {
	$title = kw_plain_text($value, false);
	$len   = mb_strlen($title);
	if ($len < 3 || $len > 120) {
		return kw_error('kw_title', 'The title must be 3–120 characters', 400);
	}
	return $title;
}

// ---------------------------------------------------------------------------
// REST: kadro/v1/forum…

add_action('rest_api_init', function () {
	$paging = [
		'page'     => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
		'per_page' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50, 'default' => 20],
	];
	register_rest_route('kadro/v1', '/forum', [
		'methods'             => 'GET',
		'callback'            => 'kw_rest_forum',
		'permission_callback' => '__return_true',
		'args'                => ['lang' => ['type' => 'string']],
	]);
	register_rest_route('kadro/v1', '/forum/topics', [
		[
			'methods'             => 'GET',
			'callback'            => 'kw_rest_topics',
			'permission_callback' => '__return_true',
			'args'                => $paging + [
				'section' => ['type' => 'string'],
				'search'  => ['type' => 'string'],
				'mine'    => ['type' => 'boolean', 'default' => false],
			],
		],
		[
			'methods'             => 'POST',
			'callback'            => 'kw_rest_add_topic',
			'permission_callback' => '__return_true',
			'args'                => [
				'section' => ['type' => 'string'],
				'title'   => ['type' => 'string'],
				'content' => ['type' => 'string'],
			],
		],
	]);
	register_rest_route('kadro/v1', '/forum/topics/(?P<id>\d+)', [
		[
			'methods'             => 'GET',
			'callback'            => 'kw_rest_topic',
			'permission_callback' => '__return_true',
		],
		[
			'methods'             => 'POST',
			'callback'            => 'kw_rest_edit_topic',
			'permission_callback' => '__return_true',
			// No defaults: only what the request sends changes.
			'args'                => [
				'title'   => ['type' => 'string'],
				'content' => ['type' => 'string'],
				'section' => ['type' => 'string'],
				'pinned'  => ['type' => 'boolean'],
				'closed'  => ['type' => 'boolean'],
			],
		],
		[
			'methods'             => 'DELETE',
			'callback'            => 'kw_rest_delete_topic',
			'permission_callback' => '__return_true',
		],
	]);
	register_rest_route('kadro/v1', '/forum/topics/(?P<id>\d+)/report', [
		'methods'             => 'POST',
		'callback'            => 'kw_rest_report_topic',
		'permission_callback' => '__return_true',
		'args'                => ['reason' => ['type' => 'string']],
	]);
	register_rest_route('kadro/v1', '/forum/topics/(?P<id>\d+)/replies', [
		[
			'methods'             => 'GET',
			'callback'            => 'kw_rest_replies',
			'permission_callback' => '__return_true',
			'args'                => $paging,
		],
		[
			'methods'             => 'POST',
			'callback'            => 'kw_rest_add_reply',
			'permission_callback' => '__return_true',
			'args'                => ['content' => ['type' => 'string']],
		],
	]);
});

/** The forum's front page: sections with their numbers and latest topic, and the five latest topics. */
function kw_rest_forum() {
	global $wpdb;
	$topics  = $wpdb->get_results($wpdb->prepare(
		"SELECT tt.term_id, COUNT(*) AS n FROM {$wpdb->term_relationships} tr
		INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
		INNER JOIN {$wpdb->posts} p ON p.ID = tr.object_id
		WHERE tt.taxonomy = %s AND p.post_type = %s AND p.post_status = 'publish' GROUP BY tt.term_id",
		KW_FORUM_TAX,
		KW_TOPIC_TYPE
	), OBJECT_K);
	$replies = $wpdb->get_results($wpdb->prepare(
		"SELECT tt.term_id, COUNT(*) AS n FROM {$wpdb->comments} c
		INNER JOIN {$wpdb->posts} p ON p.ID = c.comment_post_ID
		INNER JOIN {$wpdb->term_relationships} tr ON tr.object_id = p.ID
		INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
		WHERE tt.taxonomy = %s AND p.post_type = %s AND p.post_status = 'publish' AND c.comment_type = 'kw_reply' AND c.comment_approved = '1'
		GROUP BY tt.term_id",
		KW_FORUM_TAX,
		KW_TOPIC_TYPE
	), OBJECT_K);
	$sections = [];
	foreach (kw_forum_sections() as $t) {
		[$name, $desc] = kw_section_texts($t);
		$sections[]    = [
			'slug'        => $t->slug,
			'name'        => $name,
			'description' => $desc,
			'locked'      => kw_section_locked($t),
			'topics'      => (int) ($topics[$t->term_id]->n ?? 0),
			'replies'     => (int) ($replies[$t->term_id]->n ?? 0),
			'last'        => kw_section_last($t),
		];
	}
	$recent = new WP_Query([
		'post_type'      => KW_TOPIC_TYPE,
		'post_status'    => 'publish',
		'posts_per_page' => 5,
		'no_found_rows'  => true,
		'meta_key'       => '_kw_last',
		'orderby'        => ['meta_value_num' => 'DESC', 'ID' => 'DESC'],
	]);
	return ['open' => kw_forum_open(), 'sections' => $sections, 'recent' => kw_topics_json($recent->posts)];
}

/** The section's most recently active topic: {id, title, time, author (of the last activity)} or null. */
function kw_section_last(WP_Term $t): ?array {
	$q = new WP_Query([
		'post_type'      => KW_TOPIC_TYPE,
		'post_status'    => 'publish',
		'posts_per_page' => 1,
		'no_found_rows'  => true,
		'tax_query'      => [['taxonomy' => KW_FORUM_TAX, 'field' => 'term_id', 'terms' => (int) $t->term_id]],
		'meta_key'       => '_kw_last',
		'orderby'        => ['meta_value_num' => 'DESC', 'ID' => 'DESC'],
	]);
	if (!$q->posts) {
		return null;
	}
	$p = $q->posts[0];
	return [
		'id'     => $p->ID,
		'title'  => kw_decode($p->post_title),
		'time'   => kw_iso_gmt((int) get_post_meta($p->ID, '_kw_last', true) ?: (int) get_post_timestamp($p)),
		'author' => kw_user_name((int) get_post_meta($p->ID, '_kw_last_user', true)),
	];
}

/** Topics of a section, a search, or the member's own; newest activity first (pinned first inside a section). */
function kw_rest_topics(WP_REST_Request $r) {
	$me   = get_current_user_id();
	$mod  = kw_is_moderator();
	$mine = (bool) $r['mine'];
	if ($mine && !$me) {
		return kw_signed_out();
	}
	$term = null;
	$slug = (string) $r['section'];
	if ($slug !== '') {
		$term = kw_forum_section($slug);
		if (!$term) {
			return kw_error('kw_section', 'No such section', 400);
		}
	}
	$page = (int) $r['page'];
	$per  = (int) $r['per_page'];
	$args = [
		'post_type'      => KW_TOPIC_TYPE,
		'post_status'    => $me ? ['publish', 'pending'] : 'publish',
		'posts_per_page' => $per,
		'paged'          => $page,
		'meta_query'     => ['last' => ['key' => '_kw_last', 'compare' => 'EXISTS', 'type' => 'NUMERIC']],
		'orderby'        => ['last' => 'DESC', 'ID' => 'DESC'],
	];
	if ($term) {
		$args['tax_query']         = [['taxonomy' => KW_FORUM_TAX, 'field' => 'term_id', 'terms' => (int) $term->term_id]];
		$args['meta_query']['pin'] = ['key' => '_kw_pinned', 'compare' => 'EXISTS'];
		$args['orderby']           = ['pin' => 'DESC', 'last' => 'DESC', 'ID' => 'DESC'];
	}
	if ($mine) {
		$args['author'] = $me;
	}
	$search = kw_plain_text((string) $r['search'], false);
	if ($search !== '') {
		// Written the way topics are stored (kw_store_text), so "&" and "<" are found too; WP_Query unslashes it.
		$args['s']              = wp_slash(kw_store_text($search));
		$args['search_columns'] = ['post_title', 'post_content'];
	}
	$q     = kw_topic_query($args, $me && !$mod ? $me : 0);
	$total = (int) $q->found_posts;
	$count = $total;
	if ($me) {
		$published = kw_topic_query(array_merge($args, ['post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => 1, 'paged' => 1]));
		$count     = (int) $published->found_posts;
	}
	return [
		'topics' => kw_topics_json($q->posts),
		'total'  => $total,
		'pages'  => max(1, (int) $q->max_num_pages),
		'page'   => $page,
		'count'  => $count,
	];
}

function kw_rest_topic(WP_REST_Request $r) {
	$post = kw_find_topic((int) $r['id']);
	return $post ? kw_topic_json($post, true) : kw_error('kw_not_found', 'Topic not found', 404);
}

function kw_rest_add_topic(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	$mod = kw_is_moderator();
	if (!$mod && !kw_confirmed($user)) {
		return kw_unconfirmed();
	}
	if (!kw_forum_open()) {
		return kw_error('kw_off', 'The forum is switched off', 403);
	}
	$term = kw_forum_section((string) $r['section']);
	if (!$term) {
		return kw_error('kw_section', 'Choose a section', 400);
	}
	if (!$mod && kw_section_locked($term)) {
		return kw_error('kw_locked', 'Only moderators start topics in this section', 403);
	}
	$title = kw_topic_title($r->get_param('title'));
	if (is_wp_error($title)) {
		return $title;
	}
	$text = kw_post_text($r->get_param('content'), 5000);
	if (is_wp_error($text)) {
		return $text;
	}
	$error = kw_links_error($title . "\n" . $text);
	if ($error) {
		return $error;
	}
	// Check the limits, save, count: one request at a time per member.
	$lock = kw_member_lock($user);
	if (!kw_lock($lock)) {
		return kw_busy();
	}
	try {
		$error = kw_post_rate($user, true);
		if ($error) {
			return $error;
		}
		$id = wp_insert_post(wp_slash([
			'post_type'    => KW_TOPIC_TYPE,
			'post_title'   => kw_store_text($title),
			'post_content' => kw_store_text($text),
			'post_status'  => 'publish',
			'post_author'  => $user,
		]), true);
		if (is_wp_error($id) || !$id) {
			return kw_error('kw_store', 'Could not save the topic', 500);
		}
		wp_set_object_terms($id, [(int) $term->term_id], KW_FORUM_TAX, false);
		// Last activity: now (the topic's own date), as every later touch will find it.
		kw_topic_touch($id);
		kw_post_counted($user, true);
	} finally {
		kw_unlock($lock);
	}
	return new WP_REST_Response(kw_topic_json(get_post($id), true), 201);
}

/**
 * Changes only the fields the request sends: the author its title and text,
 * moderators also the section, pinned and closed. Editing keeps the last activity.
 */
function kw_rest_edit_topic(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	$post = kw_find_topic((int) $r['id']);
	if (!$post) {
		return kw_error('kw_not_found', 'Topic not found', 404);
	}
	$mod = kw_is_moderator();
	if (kw_topic_author($post) !== $user && !$mod) {
		return kw_error('kw_forbidden', 'You can edit only your own topics', 403);
	}
	if (!$mod && !kw_confirmed($user)) {
		return kw_unconfirmed();
	}
	if (!$mod && !kw_forum_open()) {
		return kw_error('kw_off', 'The forum is switched off', 403);
	}
	$fields = array_values(array_filter(['title', 'content', 'section', 'pinned', 'closed'], fn($k) => $r->has_param($k)));
	if (!$fields) {
		return kw_error('kw_empty', 'Nothing to change', 400);
	}
	if (!$mod && array_intersect($fields, ['section', 'pinned', 'closed'])) {
		return kw_error('kw_forbidden', 'Only moderators move, pin or close topics', 403);
	}
	$postarr = ['ID' => $post->ID];
	$title   = null;
	$text    = null;
	if (in_array('title', $fields, true)) {
		$title = kw_topic_title($r->get_param('title'));
		if (is_wp_error($title)) {
			return $title;
		}
		$postarr['post_title'] = kw_store_text($title);
	}
	if (in_array('content', $fields, true)) {
		$text = kw_post_text($r->get_param('content'), 5000);
		if (is_wp_error($text)) {
			return $text;
		}
		$postarr['post_content'] = kw_store_text($text);
	}
	$term = null;
	if (in_array('section', $fields, true)) {
		$term = kw_forum_section((string) $r['section']);
		if (!$term) {
			return kw_error('kw_section', 'Choose a section', 400);
		}
	}
	if (count($postarr) > 1) {
		$typed = ($title ?? kw_decode($post->post_title)) . "\n" . ($text ?? kw_decode(wp_strip_all_tags($post->post_content)));
		$error = kw_links_error($typed) ?? kw_post_gap($user);
		if ($error) {
			return $error;
		}
		$changed = ($title !== null && $postarr['post_title'] !== $post->post_title) || ($text !== null && $postarr['post_content'] !== $post->post_content);
		$saved   = wp_update_post(wp_slash($postarr), true);
		if (is_wp_error($saved) || !$saved) {
			return kw_error('kw_store', 'Could not save the topic', 500);
		}
		update_post_meta($post->ID, '_kw_edited', time());
		// New words from the author: people whose reports a moderator dismissed may report it again.
		if ($changed && !$mod) {
			delete_post_meta($post->ID, '_kw_reports_cleared');
		}
		kw_post_counted($user, false, true);
	}
	if ($term) {
		wp_set_object_terms($post->ID, [(int) $term->term_id], KW_FORUM_TAX, false);
	}
	foreach (['pinned', 'closed'] as $flag) {
		if (in_array($flag, $fields, true)) {
			update_post_meta($post->ID, '_kw_' . $flag, $r->get_param($flag) ? '1' : '0');
		}
	}
	clean_post_cache($post->ID);
	return kw_topic_json(get_post($post->ID), true);
}

/**
 * The author removes their topic (to the trash) while nobody else has replied —
 * also when it is closed or the forum is switched off; moderators remove any.
 */
function kw_rest_delete_topic(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	$post = kw_find_topic((int) $r['id']);
	if (!$post) {
		return kw_error('kw_not_found', 'Topic not found', 404);
	}
	if (!kw_is_moderator()) {
		if (kw_topic_author($post) !== $user) {
			return kw_error('kw_forbidden', 'You can remove only your own topics', 403);
		}
		$others = (int) get_comments(['post_id' => $post->ID, 'type' => 'kw_reply', 'status' => 'approve', 'author__not_in' => [$user], 'count' => true]);
		if ($others > 0) {
			return kw_error('kw_has_replies', 'Other people have replied: ask a moderator to remove the topic', 403);
		}
	}
	wp_trash_post($post->ID);
	return ['removed' => true];
}

function kw_rest_report_topic(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	$mod = kw_is_moderator();
	if (!$mod && !kw_confirmed($user)) {
		return kw_unconfirmed();
	}
	$post = get_post((int) $r['id']);
	if (!$post || $post->post_type !== KW_TOPIC_TYPE || $post->post_status !== 'publish') {
		return kw_error('kw_not_found', 'Topic not found', 404);
	}
	if (!$mod && !kw_forum_open()) {
		return kw_error('kw_off', 'The forum is switched off', 403);
	}
	$author = kw_topic_author($post);
	return kw_report('post', $post->ID, $author, $r, function ($reason) use ($post, $author) {
		kw_report_letter('topic', $author, $post->post_title, $post->post_content, $reason, admin_url('post.php?post=' . $post->ID . '&action=edit'));
	}, function () use ($post) {
		kw_hide_topic($post->ID);
	});
}

/** Replies of a topic the caller may see, oldest first. */
function kw_rest_replies(WP_REST_Request $r) {
	$post = kw_find_topic((int) $r['id']);
	if (!$post) {
		return kw_error('kw_not_found', 'Topic not found', 404);
	}
	$list = kw_comment_list($post->ID, 'kw_reply', (int) $r['page'], (int) $r['per_page'], 'ASC');
	return [
		'replies' => $list['posts'],
		'total'   => $list['total'],
		'pages'   => $list['pages'],
		'page'    => $list['page'],
		'count'   => $list['count'],
	];
}

function kw_rest_add_reply(WP_REST_Request $r) {
	$user = get_current_user_id();
	if (!$user) {
		return kw_signed_out();
	}
	$mod = kw_is_moderator();
	if (!$mod && !kw_confirmed($user)) {
		return kw_unconfirmed();
	}
	if (!kw_forum_open()) {
		return kw_error('kw_off', 'The forum is switched off', 403);
	}
	$post = get_post((int) $r['id']);
	if (!$post || $post->post_type !== KW_TOPIC_TYPE || $post->post_status !== 'publish') {
		return kw_error('kw_not_found', 'Topic not found', 404);
	}
	if (!$mod && get_post_meta($post->ID, '_kw_closed', true) === '1') {
		return kw_error('kw_closed', 'This topic is closed', 403);
	}
	$text = kw_post_text($r->get_param('content'), 2000);
	if (is_wp_error($text)) {
		return $text;
	}
	$error = kw_links_error($text);
	if ($error) {
		return $error;
	}
	// Check the limits, save, count: one request at a time per member.
	$lock = kw_member_lock($user);
	if (!kw_lock($lock)) {
		return kw_busy();
	}
	try {
		$error = kw_post_rate($user);
		if ($error) {
			return $error;
		}
		// The topic's last activity follows in the wp_insert_comment hook (community.php).
		$c = kw_insert_comment($post->ID, 'kw_reply', $text, $user);
		if (is_wp_error($c)) {
			return $c;
		}
		kw_post_counted($user);
	} finally {
		kw_unlock($lock);
	}
	kw_notify_author('reply', $post, $c);
	return new WP_REST_Response(kw_post_json($c), 201);
}

// ---------------------------------------------------------------------------
// WordPress admin: topics

// Pinned, closed, one section, last activity — whichever way a topic was saved.
add_action('save_post_' . KW_TOPIC_TYPE, function ($id, $post) {
	if (wp_is_post_revision($id) || wp_is_post_autosave($id) || $post->post_status === 'auto-draft') {
		return;
	}
	if (is_admin() && current_user_can('edit_post', $id)) {
		if (isset($_POST['kw_topic_nonce']) && wp_verify_nonce((string) wp_unslash($_POST['kw_topic_nonce']), 'kw_topic_' . $id)) {
			update_post_meta($id, '_kw_pinned', empty($_POST['kw_pinned']) ? '0' : '1');
			update_post_meta($id, '_kw_closed', empty($_POST['kw_closed']) ? '0' : '1');
			if (!empty($_POST['kw_dismiss'])) {
				kw_clear_reports('post', (int) $id);
			}
		}
		if (isset($_POST['kw_section_nonce']) && wp_verify_nonce((string) wp_unslash($_POST['kw_section_nonce']), 'kw_section_' . $id)) {
			$term = get_term((int) ($_POST['kw_section'] ?? 0), KW_FORUM_TAX);
			if ($term instanceof WP_Term) {
				wp_set_object_terms($id, [(int) $term->term_id], KW_FORUM_TAX, false);
			}
		}
	}
	kw_topic_defaults((int) $id);
	// Published (also a draft published later, or a hidden topic approved again): the
	// last activity from its replies or its date. Unchanged when nothing else changed.
	if ($post->post_status === 'publish') {
		kw_topic_touch((int) $id);
	}
	$terms = wp_get_object_terms($id, KW_FORUM_TAX, ['fields' => 'ids']);
	if (!is_wp_error($terms) && count($terms) !== 1) {
		$keep = $terms ? (int) $terms[0] : kw_default_section_id();
		if ($keep) {
			wp_set_object_terms($id, [$keep], KW_FORUM_TAX, false);
		}
	}
}, 10, 2);

/** The section box on the topic screen: one radio button per section. */
function kw_section_box(WP_Post $post): void {
	wp_nonce_field('kw_section_' . $post->ID, 'kw_section_nonce');
	$terms   = wp_get_object_terms($post->ID, KW_FORUM_TAX, ['fields' => 'ids']);
	$current = !is_wp_error($terms) && $terms ? (int) $terms[0] : kw_default_section_id();
	$code    = KW_LANG_CODES[kw_lang()];
	foreach (kw_forum_sections() as $t) {
		$lock = kw_section_locked($t) ? ' <span class="dashicons dashicons-lock" style="font-size:15px;width:15px;height:15px" title="' . esc_attr(kw_t('forum_locked')) . '"></span>' : '';
		echo '<p style="margin:5px 0"><label><input type="radio" name="kw_section" value="' . (int) $t->term_id . '"' . checked($current, (int) $t->term_id, false) . '> ' . esc_html(kw_section_texts($t)[0][$code]) . $lock . '</label></p>';
	}
}

add_action('add_meta_boxes_' . KW_TOPIC_TYPE, function () {
	add_meta_box('kw_topic_flags', kw_t('forum_flags'), 'kw_topic_flags_box', KW_TOPIC_TYPE, 'side', 'high');
});

/** Pinned and closed, and the reports with a way to dismiss them. */
function kw_topic_flags_box(WP_Post $post): void {
	wp_nonce_field('kw_topic_' . $post->ID, 'kw_topic_nonce');
	echo '<p><label><input type="checkbox" name="kw_pinned" value="1"' . checked(get_post_meta($post->ID, '_kw_pinned', true), '1', false) . '> ' . esc_html(kw_t('forum_pinned_label')) . '</label></p>';
	echo '<p><label><input type="checkbox" name="kw_closed" value="1"' . checked(get_post_meta($post->ID, '_kw_closed', true), '1', false) . '> ' . esc_html(kw_t('forum_closed_label')) . '</label></p>';
	if (get_post_meta($post->ID, '_kw_author_deleted', true) === '1') {
		echo '<p><em>' . esc_html(kw_t('forum_author_deleted')) . '</em></p>';
	}
	$reports = kw_reports($post->ID);
	echo '<p><strong>' . esc_html(kw_t('reports')) . ':</strong> ' . ($reports ? count($reports) : esc_html(kw_t('reports_none'))) . '</p>';
	if ($reports) {
		echo '<ul style="margin:0 0 8px;list-style:disc;padding-left:18px">';
		foreach (array_slice($reports, -10) as $rep) {
			$who = kw_user_name((int) ($rep['user'] ?? 0));
			echo '<li>' . esc_html(($who !== '' ? $who . ': ' : '') . kw_decode((string) ($rep['reason'] ?? ''))) . '</li>';
		}
		echo '</ul><p><label><input type="checkbox" name="kw_dismiss" value="1"> ' . esc_html(kw_t('reports_dismiss')) . '</label><br><span class="description">' . esc_html(kw_t('reports_dismiss_hint')) . '</span></p>';
	}
}

add_filter('manage_' . KW_TOPIC_TYPE . '_posts_columns', function ($cols) {
	// Our own replies column instead of WordPress's comment count (that one counts every comment type).
	unset($cols['comments']);
	$out = [];
	foreach ($cols as $k => $v) {
		if ($k === 'date') {
			$out['kw_replies'] = kw_t('forum_replies');
			$out['kw_reports'] = kw_t('reports');
		}
		$out[$k] = $v;
		if ($k === 'title') {
			$out['kw_flags'] = '<span class="dashicons dashicons-sticky" title="' . esc_attr(kw_t('forum_pinned') . ' / ' . kw_t('forum_closed')) . '"></span><span class="screen-reader-text">' . esc_html(kw_t('forum_pinned') . ' / ' . kw_t('forum_closed')) . '</span>';
		}
	}
	return $out;
});

add_action('manage_' . KW_TOPIC_TYPE . '_posts_custom_column', function ($col, $id) {
	$id = (int) $id;
	if ($col === 'kw_flags') {
		if (get_post_meta($id, '_kw_pinned', true) === '1') {
			echo '<span class="dashicons dashicons-sticky" title="' . esc_attr(kw_t('forum_pinned')) . '"></span>';
		}
		if (get_post_meta($id, '_kw_closed', true) === '1') {
			echo '<span class="dashicons dashicons-lock" title="' . esc_attr(kw_t('forum_closed')) . '"></span>';
		}
	} elseif ($col === 'kw_replies') {
		$held = (int) get_comments(['post_id' => $id, 'type' => 'kw_reply', 'status' => 'hold', 'count' => true]);
		echo '<a href="' . esc_url(admin_url('edit-comments.php?p=' . $id)) . '">' . kw_comment_count($id, 'kw_reply') . '</a>';
		if ($held) {
			echo ' <span style="color:#b26200">(' . esc_html(kw_tl('forum_hidden_count', kw_lang(), ['n' => $held])) . ')</span>';
		}
	} elseif ($col === 'kw_reports') {
		$reports = kw_reports($id);
		$reasons = array_map(fn($x) => kw_decode((string) ($x['reason'] ?? '')), array_slice($reports, -10));
		echo $reports ? '<strong style="color:#d63638" title="' . esc_attr(implode("\n", $reasons)) . '">' . count($reports) . '</strong>' : '0';
	}
}, 10, 2);

// ---------------------------------------------------------------------------
// WordPress admin: sections (order, and whether only moderators start topics)

add_action(KW_FORUM_TAX . '_add_form_fields', function () {
	wp_nonce_field('kw_forum_term', 'kw_forum_term_nonce');
	echo '<div class="form-field"><label for="kw_order">' . esc_html(kw_t('forum_order')) . '</label><input type="number" name="kw_order" id="kw_order" value="100" min="0" max="9999"><p>' . esc_html(kw_t('forum_order_hint')) . '</p></div>';
	echo '<div class="form-field"><label><input type="checkbox" name="kw_locked" value="1"> ' . esc_html(kw_t('forum_locked')) . '</label><p>' . esc_html(kw_t('forum_locked_hint')) . '</p></div>';
});

add_action(KW_FORUM_TAX . '_edit_form_fields', function ($term) {
	wp_nonce_field('kw_forum_term', 'kw_forum_term_nonce');
	$keep = kw_section_fixed_slug($term);
	if ($keep !== '') {
		// The slug field above: read-only here, and kept by kw_section_slug_kept() whatever is sent.
		echo '<tr class="form-field"><th scope="row"></th><td><p class="description">' . esc_html(kw_tl('forum_slug_fixed', kw_lang(), ['slug' => $keep])) . '</p>'
			. '<script>(function(){var s=document.getElementById("slug");if(s){s.readOnly=true;}})();</script></td></tr>';
	}
	echo '<tr class="form-field"><th scope="row"><label for="kw_order">' . esc_html(kw_t('forum_order')) . '</label></th><td><input type="number" name="kw_order" id="kw_order" value="' . esc_attr((string) kw_section_order($term)) . '" min="0" max="9999"><p class="description">' . esc_html(kw_t('forum_order_hint')) . '</p></td></tr>';
	echo '<tr class="form-field"><th scope="row">' . esc_html(kw_t('forum_locked')) . '</th><td><label><input type="checkbox" name="kw_locked" value="1"' . checked(kw_section_locked($term), true, false) . '> ' . esc_html(kw_t('forum_locked')) . '</label><p class="description">' . esc_html(kw_t('forum_locked_hint')) . '</p></td></tr>';
});

function kw_save_section_fields(int $term_id): void {
	if (!isset($_POST['kw_forum_term_nonce']) || !wp_verify_nonce((string) wp_unslash($_POST['kw_forum_term_nonce']), 'kw_forum_term') || !current_user_can('manage_categories')) {
		return;
	}
	update_term_meta($term_id, '_kw_order', max(0, min(9999, (int) ($_POST['kw_order'] ?? 100))));
	update_term_meta($term_id, '_kw_locked', empty($_POST['kw_locked']) ? '0' : '1');
}

add_action('created_' . KW_FORUM_TAX, function ($term_id) {
	kw_save_section_fields((int) $term_id);
	// Sorting by order must not drop a section that has none. One of the default
	// sections made outside the form (Chat, by WordPress as the default) gets its own.
	if (get_term_meta((int) $term_id, '_kw_order', true) === '') {
		$term = get_term((int) $term_id, KW_FORUM_TAX);
		$how  = $term instanceof WP_Term ? (KW_FORUM_SECTIONS[$term->slug] ?? null) : null;
		update_term_meta((int) $term_id, '_kw_order', $how ? $how[0] : 100);
		if ($how) {
			update_term_meta((int) $term_id, '_kw_locked', $how[1] ? '1' : '0');
		}
	}
});

/**
 * The slug a section must keep: a default section's own slug, and chat for the default
 * section whatever happened to it; '' for the sections an admin added.
 */
function kw_section_fixed_slug($term): string {
	if (!$term instanceof WP_Term) {
		return '';
	}
	if (isset(KW_FORUM_SECTIONS[$term->slug])) {
		return $term->slug;
	}
	return (int) $term->term_id === (int) get_option('default_term_' . KW_FORUM_TAX, 0) ? 'chat' : '';
}

/*
 * The default sections keep their slugs (the edit form, Quick Edit, any wp_update_term()).
 * The site takes their names and descriptions from the strings by slug, kw_forum_seed()
 * would add a missing one again, and WordPress looks the default section up in every
 * request by the slug chat or the name "Chat": under another slug, on a site where Chat
 * has its Ukrainian or Russian name, it would quietly make a second, empty Chat the default.
 */
function kw_section_slug_kept($data, $term_id, $taxonomy) {
	if ($taxonomy !== KW_FORUM_TAX || !is_array($data)) {
		return $data;
	}
	// Still the stored term: WordPress clears the term cache only after this update.
	$keep = kw_section_fixed_slug(get_term((int) $term_id, KW_FORUM_TAX));
	if ($keep !== '' && ($data['slug'] ?? '') !== $keep) {
		$other = get_term_by('slug', $keep, KW_FORUM_TAX);
		if (!$other instanceof WP_Term || (int) $other->term_id === (int) $term_id) {
			$data['slug'] = $keep;
		}
	}
	return $data;
}
add_filter('wp_update_term_data', 'kw_section_slug_kept', 10, 3);

add_action('edited_' . KW_FORUM_TAX, function ($term_id) {
	// Only the section the form is about (kw_forum_seed() may rename Chat during any request).
	if ((int) ($_POST['tag_ID'] ?? 0) === (int) $term_id) {
		kw_save_section_fields((int) $term_id);
	}
});

add_filter('manage_edit-' . KW_FORUM_TAX . '_columns', function ($cols) {
	$cols['kw_order']  = kw_t('forum_order');
	$cols['kw_locked'] = '<span class="dashicons dashicons-lock" title="' . esc_attr(kw_t('forum_locked')) . '"></span><span class="screen-reader-text">' . esc_html(kw_t('forum_locked')) . '</span>';
	return $cols;
});

add_filter('manage_' . KW_FORUM_TAX . '_custom_column', function ($out, $col, $term_id) {
	$term = get_term((int) $term_id, KW_FORUM_TAX);
	if (!$term instanceof WP_Term) {
		return $out;
	}
	if ($col === 'kw_order') {
		return (string) kw_section_order($term);
	}
	if ($col === 'kw_locked') {
		return kw_section_locked($term) ? '<span class="dashicons dashicons-lock" title="' . esc_attr(kw_t('forum_locked')) . '"></span>' : '';
	}
	return $out;
}, 10, 3);

/** What waits for a moderator in the forum: hidden or reported topics and replies (for the menu bubble). */
function kw_forum_attention(): int {
	$pending  = (int) wp_count_posts(KW_TOPIC_TYPE)->pending;
	$reported = new WP_Query([
		'post_type'      => KW_TOPIC_TYPE,
		'post_status'    => 'publish',
		'meta_query'     => [['key' => '_kw_reports', 'compare' => 'EXISTS']],
		'fields'         => 'ids',
		'posts_per_page' => 1,
	]);
	$held        = (int) get_comments(['type' => 'kw_reply', 'status' => 'hold', 'count' => true]);
	$reported_re = (int) get_comments(['type' => 'kw_reply', 'status' => 'approve', 'meta_query' => [['key' => '_kw_reports', 'compare' => 'EXISTS']], 'count' => true]);
	return $pending + (int) $reported->found_posts + $held + $reported_re;
}

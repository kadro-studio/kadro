<?php
// Item pages on the workshop site: details, "Open in Kadro", download and like.

if (!defined('ABSPATH')) {
	exit;
}

add_filter('the_content', function ($content) {
	if (!is_singular(KW_POST_TYPE) || !in_the_loop() || !is_main_query()) {
		return $content;
	}
	$post = get_post();
	if (!$post || !kw_can_see($post)) {
		return $content;
	}
	$item = kw_item($post);
	$open = 'kadro://workshop/item/' . $post->ID;
	$file = rest_url('kadro/v1/items/' . $post->ID . '/file');
	ob_start();
	?>
	<div class="kw-item">
		<?php if ($post->post_status !== 'publish') : ?>
			<p class="kw-pending"><?php echo esc_html(kw_t('pending_notice')); ?></p>
		<?php endif; ?>
		<p class="kw-meta">
			<?php echo esc_html(kw_t('kind_' . $item['kind'])); ?> ·
			<?php echo esc_html(kw_t('version')); ?> <?php echo esc_html($item['version']); ?> ·
			<?php echo esc_html(kw_t('license')); ?>: <?php echo esc_html($item['license']); ?> ·
			<?php echo esc_html(kw_t('downloads')); ?>: <?php echo (int) $item['downloads']; ?> ·
			<?php echo esc_html(kw_t('likes')); ?>: <span class="kw-likes"><?php echo (int) $item['likes']; ?></span>
		</p>
		<p class="kw-actions">
			<a class="wp-element-button kw-open" href="<?php echo esc_attr($open); ?>"><?php echo esc_html(kw_t('open_in_kadro')); ?></a>
			<a class="wp-element-button kw-download" href="<?php echo esc_url($file); ?>"><?php echo esc_html(kw_t('download')); ?></a>
			<?php if (is_user_logged_in() && $post->post_status === 'publish') : ?>
				<button type="button" class="wp-element-button kw-like" data-id="<?php echo (int) $post->ID; ?>" aria-pressed="<?php echo $item['liked'] ? 'true' : 'false'; ?>">♥ <?php echo esc_html(kw_t('like')); ?></button>
			<?php elseif ($post->post_status === 'publish') : ?>
				<a href="<?php echo esc_url(wp_login_url(get_permalink($post))); ?>"><?php echo esc_html(kw_t('login_to_like')); ?></a>
			<?php endif; ?>
		</p>
		<p class="kw-get"><?php echo esc_html(kw_t('get_kadro')); ?> <a href="https://kadro.studio">kadro.studio</a></p>
	</div>
	<?php
	return $content . ob_get_clean();
});

add_action('wp_enqueue_scripts', function () {
	if (!is_singular(KW_POST_TYPE) || !is_user_logged_in()) {
		return;
	}
	wp_register_script('kw-like', '', [], '1.0.0', true);
	wp_enqueue_script('kw-like');
	wp_add_inline_script('kw-like', 'window.kwRest=' . wp_json_encode(['root' => esc_url_raw(rest_url('kadro/v1/')), 'nonce' => wp_create_nonce('wp_rest')]) . ';
document.addEventListener("click", async (e) => {
  const b = e.target.closest(".kw-like");
  if (!b) return;
  const r = await fetch(kwRest.root + "items/" + b.dataset.id + "/like", { method: "POST", headers: { "X-WP-Nonce": kwRest.nonce } });
  if (!r.ok) return;
  const d = await r.json();
  b.setAttribute("aria-pressed", d.liked ? "true" : "false");
  const n = document.querySelector(".kw-likes");
  if (n) n.textContent = d.likes;
});');
	wp_add_inline_style('wp-block-library', '.kw-like[aria-pressed="true"]{opacity:.75}.kw-pending{padding:.6em .9em;background:#fff4d6;border-radius:6px}');
});

<?php
// Interface strings in Ukrainian, Russian and English, picked by the site or
// user locale (kept here instead of .po files so the plugin is one folder).

if (!defined('ABSPATH')) {
	exit;
}

function kw_strings(): array {
	return [
		'items'          => ['Workshop items', 'Предметы мастерской', 'Предмети майстерні'],
		'item'           => ['Workshop item', 'Предмет мастерской', 'Предмет майстерні'],
		'menu'           => ['Workshop', 'Мастерская', 'Майстерня'],
		'all_items'      => ['All items', 'Все предметы', 'Усі предмети'],
		'edit_item'      => ['Edit item', 'Редактировать', 'Редагувати'],
		'search_items'   => ['Search items', 'Искать', 'Шукати'],
		'tags'           => ['Workshop tags', 'Теги мастерской', 'Теги майстерні'],
		'kind'           => ['Kind', 'Тип', 'Тип'],
		'downloads'      => ['Downloads', 'Загрузки', 'Завантаження'],
		'likes'          => ['Likes', 'Лайки', 'Вподобання'],
		'version'        => ['Version', 'Версия', 'Версія'],
		'license'        => ['Licence', 'Лицензия', 'Ліцензія'],
		'file'           => ['File', 'Файл', 'Файл'],
		'open_in_kadro'  => ['Open in Kadro', 'Открыть в Kadro', 'Відкрити в Kadro'],
		'download'       => ['Download file', 'Скачать файл', 'Завантажити файл'],
		'get_kadro'      => ['No Kadro yet? It is free:', 'Ещё нет Kadro? Он бесплатный:', 'Ще немає Kadro? Він безкоштовний:'],
		'pending_notice' => ['Waiting for review — visible only to you and moderators.', 'Ожидает проверки — видно только вам и модераторам.', 'Чекає на перевірку — видно лише вам і модераторам.'],
		'settings'       => ['Kadro Workshop', 'Мастерская Kadro', 'Майстерня Kadro'],
		'auto_publish'   => ['Publish new items without review', 'Публиковать новое без проверки', 'Публікувати нове без перевірки'],
		'daily_limit'    => ['Uploads per user per day', 'Загрузок на пользователя в день', 'Завантажень на користувача на день'],
		'pending_count'  => ['%d item(s) waiting for review', 'Ожидают проверки: %d', 'Чекають на перевірку: %d'],
		'kind_effect'    => ['Effect', 'Эффект', 'Ефект'],
		'kind_transition'=> ['Transition', 'Переход', 'Перехід'],
		'kind_element'   => ['Element', 'Элемент', 'Елемент'],
		'kind_look'      => ['Filter', 'Фильтр', 'Фільтр'],
		'kind_textStyle' => ['Title style', 'Стиль титров', 'Стиль титрів'],
		'kind_lut'       => ['LUT', 'LUT', 'LUT'],
		'kind_theme'     => ['Theme', 'Тема', 'Тема'],
		'kind_template'  => ['Template', 'Шаблон', 'Шаблон'],
		'like'           => ['Like', 'Нравится', 'Подобається'],
		'login_to_like'  => ['Log in to like', 'Войдите, чтобы ставить лайки', 'Увійдіть, щоб вподобати'],
	];
}

function kw_lang(): int {
	$locale = function_exists('determine_locale') ? determine_locale() : get_locale();
	if (strpos($locale, 'uk') === 0) {
		return 2;
	}
	return strpos($locale, 'ru') === 0 ? 1 : 0;
}

function kw_t(string $key): string {
	$s = kw_strings();
	return isset($s[$key]) ? $s[$key][kw_lang()] : $key;
}

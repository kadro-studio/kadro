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
		'site_name'      => ['Kadro Workshop', 'Мастерская Kadro', 'Майстерня Kadro'],
		'join_title'     => ['Create an account', 'Создать аккаунт', 'Створити акаунт'],
		'join_lead'      => ['An account lets you publish your effects, filters, title styles, LUTs, themes and templates. Browsing and installing work without one.', 'Аккаунт нужен, чтобы публиковать свои эффекты, фильтры, стили титров, LUT, темы и шаблоны. Смотреть и устанавливать можно и без него.', 'Акаунт потрібен, щоб публікувати свої ефекти, фільтри, стилі титрів, LUT, теми й шаблони. Переглядати й встановлювати можна й без нього.'],
		'join_login'     => ['Name (login)', 'Имя (логин)', 'Ім’я (логін)'],
		'join_login_hint' => ['Shown as the author of what you publish: 3–30 Latin letters, digits, dots, dashes or underscores.', 'Видно как автора ваших публикаций: 3–30 латинских букв, цифр, точек, дефисов или подчёркиваний.', 'Видно як автора ваших публікацій: 3–30 латинських літер, цифр, крапок, дефісів чи підкреслень.'],
		'join_email'     => ['E-mail', 'E-mail', 'E-mail'],
		'join_email_hint' => ['For the confirmation letter and news about your items. Never shown to anyone.', 'Для письма с подтверждением и новостей о ваших публикациях. Никому не показывается.', 'Для листа з підтвердженням і новин про ваші публікації. Нікому не показується.'],
		'join_password'  => ['Password (at least 8 characters)', 'Пароль (не меньше 8 символов)', 'Пароль (щонайменше 8 символів)'],
		'join_rules'     => ['I publish only my own work or what its author’s licence allows, nothing harmful or offensive, and moderators may remove what breaks these rules.', 'Я публикую только свои работы или то, что разрешает лицензия автора, ничего вредного или оскорбительного, и модераторы могут убрать то, что нарушает эти правила.', 'Я публікую лише свої роботи або те, що дозволяє ліцензія автора, нічого шкідливого чи образливого, і модератори можуть прибрати те, що порушує ці правила.'],
		'join_submit'    => ['Create account', 'Создать аккаунт', 'Створити акаунт'],
		'join_have_account' => ['Already have an account?', 'Уже есть аккаунт?', 'Вже маєте акаунт?'],
		'join_sign_in'   => ['Sign in', 'Войти', 'Увійти'],
		'join_closed'    => ['Sign-up is closed right now.', 'Регистрация сейчас закрыта.', 'Реєстрацію зараз закрито.'],
		'join_failed'    => ['Could not create the account. Please try again.', 'Не удалось создать аккаунт. Попробуйте ещё раз.', 'Не вдалося створити акаунт. Спробуйте ще раз.'],
		'join_too_many'  => ['Too many sign-ups from this network. Try again in an hour.', 'Слишком много регистраций из этой сети. Попробуйте через час.', 'Забагато реєстрацій із цієї мережі. Спробуйте за годину.'],
		'join_bad_login' => ['The name must be 3–30 Latin letters, digits, dots, dashes or underscores.', 'Имя — это 3–30 латинских букв, цифр, точек, дефисов или подчёркиваний.', 'Ім’я — це 3–30 латинських літер, цифр, крапок, дефісів чи підкреслень.'],
		'join_login_taken' => ['This name is taken — try another one.', 'Это имя занято — попробуйте другое.', 'Це ім’я зайняте — спробуйте інше.'],
		'join_bad_email' => ['This e-mail does not look right.', 'Этот e-mail выглядит неправильно.', 'Цей e-mail виглядає неправильно.'],
		'join_email_taken' => ['An account with this e-mail already exists. Sign in instead (the sign-in page can also reset the password).', 'Аккаунт с этим e-mail уже есть. Войдите (на странице входа можно и сбросить пароль).', 'Акаунт із цим e-mail уже є. Увійдіть (на сторінці входу можна й скинути пароль).'],
		'join_short_password' => ['The password needs at least 8 characters.', 'В пароле должно быть не меньше 8 символов.', 'У паролі має бути щонайменше 8 символів.'],
		'join_agree_needed' => ['Please agree to the workshop rules.', 'Пожалуйста, согласитесь с правилами мастерской.', 'Будь ласка, погодьтеся з правилами майстерні.'],
		'join_done_title' => ['You are signed in', 'Вы вошли', 'Ви увійшли'],
		'join_signed_in_as' => ['Signed in as {name}.', 'Вы вошли как {name}.', 'Ви увійшли як {name}.'],
		'join_check_mail' => ['We sent a letter to {email}: open the link in it to be able to publish. Browsing and installing work right away.', 'Мы отправили письмо на {email}: откройте ссылку в нём, чтобы публиковать. Смотреть и устанавливать можно сразу.', 'Ми надіслали лист на {email}: відкрийте посилання в ньому, щоб публікувати. Переглядати й встановлювати можна вже зараз.'],
		'join_connect_app' => ['Connect Kadro', 'Подключить Kadro', 'Під’єднати Kadro'],
		'join_connect_hint' => ['Opens the page where you allow the Kadro app to use this account; the app then signs in by itself.', 'Откроется страница, где вы разрешаете программе Kadro пользоваться этим аккаунтом; после этого программа войдёт сама.', 'Відкриється сторінка, де ви дозволяєте програмі Kadro користуватися цим акаунтом; після цього програма увійде сама.'],
		'confirm_title'  => ['E-mail confirmed', 'E-mail подтверждён', 'E-mail підтверджено'],
		'confirm_done'   => ['Thank you! You can now publish in the workshop from Kadro.', 'Спасибо! Теперь можно публиковать в мастерской из Kadro.', 'Дякуємо! Тепер можна публікувати в майстерні з Kadro.'],
		'confirm_failed_title' => ['The link does not work', 'Ссылка не работает', 'Посилання не працює'],
		'confirm_failed' => ['It is old or was already used. In Kadro, open the Workshop tab and send the letter again.', 'Она устарела или уже использована. В Kadro откройте вкладку «Мастерская» и отправьте письмо ещё раз.', 'Воно застаріло або вже використане. У Kadro відкрийте вкладку «Майстерня» й надішліть лист ще раз.'],
		'mail_confirm_subject' => ['Confirm your e-mail', 'Подтвердите e-mail', 'Підтвердьте e-mail'],
		'mail_confirm_body' => ["Hello, {name}!\n\nTo publish in the Kadro workshop, confirm your e-mail by opening this link:\n{link}\n\nIf you did not sign up, just ignore this letter.", "Здравствуйте, {name}!\n\nЧтобы публиковать в мастерской Kadro, подтвердите e-mail по этой ссылке:\n{link}\n\nЕсли вы не регистрировались, просто проигнорируйте это письмо.", "Вітаємо, {name}!\n\nЩоб публікувати в майстерні Kadro, підтвердьте e-mail за цим посиланням:\n{link}\n\nЯкщо ви не реєструвалися, просто проігноруйте цей лист."],
		'mail_approved_subject' => ['“{title}” is published', '«{title}» опубликовано', '«{title}» опубліковано'],
		'mail_approved_body' => ["“{title}” ({kind}) passed review and is now available to everyone:\n{page}\n\nThank you for sharing!", "«{title}» ({kind}) прошло проверку и теперь доступно всем:\n{page}\n\nСпасибо, что делитесь!", "«{title}» ({kind}) пройшло перевірку й тепер доступне всім:\n{page}\n\nДякуємо, що ділитеся!"],
		'mail_rejected_subject' => ['“{title}” did not pass review', '«{title}» не прошло проверку', '«{title}» не пройшло перевірку'],
		'mail_rejected_body' => ["“{title}” ({kind}) was not published.\n\nModerator’s note: {reason}\n\nFix it and publish a new version from Kadro: Workshop → My items → the item → New version.", "«{title}» ({kind}) не опубликовано.\n\nЗамечание модератора: {reason}\n\nИсправьте и опубликуйте новую версию из Kadro: «Мастерская» → «Мои» → элемент → «Новая версия».", "«{title}» ({kind}) не опубліковано.\n\nЗауваження модератора: {reason}\n\nВиправте й опублікуйте нову версію з Kadro: «Майстерня» → «Мої» → елемент → «Нова версія»."],
		'mail_pending_subject' => ['New item to review: “{title}”', 'Новое на проверку: «{title}»', 'Нове на перевірку: «{title}»'],
		'mail_pending_body' => ["{author} published “{title}” ({kind}). It waits for review.\n\nReview it in Kadro (Workshop → To review) or here:\n{edit}", "{author} опубликовал(а) «{title}» ({kind}). Ждёт проверки.\n\nПроверьте в Kadro («Мастерская» → «На проверке») или здесь:\n{edit}", "{author} опублікував(-ла) «{title}» ({kind}). Чекає на перевірку.\n\nПеревірте в Kadro («Майстерня» → «На перевірці») або тут:\n{edit}"],
		'mail_report_subject' => ['Report on “{title}”', 'Жалоба на «{title}»', 'Скарга на «{title}»'],
		'mail_report_body' => ["Someone reported “{title}”: {reason}\n\n{page}\n\nLook at it in Kadro (Workshop → Reports).", "На «{title}» пожаловались: {reason}\n\n{page}\n\nПосмотрите в Kadro («Мастерская» → «Жалобы»).", "На «{title}» поскаржилися: {reason}\n\n{page}\n\nПерегляньте в Kadro («Майстерня» → «Скарги»)."],
		'trusted_after'  => ['Publish without review after this many approved items (0 — always review)', 'Публиковать без проверки после стольких одобренных (0 — проверять всегда)', 'Публікувати без перевірки після стількох схвалених (0 — перевіряти завжди)'],
		'reports'        => ['Reports', 'Жалобы', 'Скарги'],
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

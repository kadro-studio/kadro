<?php
// Strings for comments, the forum and the feedback form, in the same order as
// strings.php: English, Russian, Ukrainian. kw_strings() merges them in.

if (!defined('ABSPATH')) {
	exit;
}

function kw_community_strings(): array {
	return [
		// Forum in the WordPress admin
		'forum_menu'          => ['Forum', 'Форум', 'Форум'],
		'forum_topics'        => ['Forum topics', 'Темы форума', 'Теми форуму'],
		'forum_topic'         => ['Forum topic', 'Тема форума', 'Тема форуму'],
		'forum_all_topics'    => ['All topics', 'Все темы', 'Усі теми'],
		'forum_add_topic'     => ['New topic', 'Новая тема', 'Нова тема'],
		'forum_edit_topic'    => ['Edit topic', 'Редактировать тему', 'Редагувати тему'],
		'forum_search_topics' => ['Search topics', 'Искать темы', 'Шукати теми'],
		'forum_no_topics'     => ['No topics yet', 'Тем пока нет', 'Тем поки немає'],
		'forum_sections'      => ['Sections', 'Разделы', 'Розділи'],
		'forum_section'       => ['Section', 'Раздел', 'Розділ'],
		'forum_add_section'   => ['Add section', 'Добавить раздел', 'Додати розділ'],
		'forum_edit_section'  => ['Edit section', 'Редактировать раздел', 'Редагувати розділ'],
		'forum_replies'       => ['Replies', 'Ответы', 'Відповіді'],
		'forum_hidden_count'  => ['{n} hidden', 'скрыто: {n}', 'приховано: {n}'],
		'forum_flags'         => ['Topic', 'Тема', 'Тема'],
		'forum_pinned'        => ['Pinned', 'Закреплена', 'Закріплена'],
		'forum_closed'        => ['Closed', 'Закрыта', 'Закрита'],
		'forum_pinned_label'  => ['Pin to the top of its section', 'Закрепить вверху раздела', 'Закріпити вгорі розділу'],
		'forum_closed_label'  => ['Closed: only moderators can reply', 'Закрыта: отвечать могут только модераторы', 'Закрита: відповідати можуть лише модератори'],
		'forum_order'         => ['Order', 'Порядок', 'Порядок'],
		'forum_order_hint'    => ['Sections are listed from the smallest number up.', 'Разделы идут по возрастанию числа.', 'Розділи йдуть за зростанням числа.'],
		'forum_locked'        => ['Only moderators start topics', 'Темы создают только модераторы', 'Теми створюють лише модератори'],
		'forum_locked_hint'   => ['Everyone can still reply in its topics.', 'Отвечать в темах по-прежнему могут все.', 'Відповідати в темах і далі можуть усі.'],
		'forum_slug_fixed'    => ['One of the default sections: its slug stays “{slug}”, because by it the site finds the section’s name and description in every language.', 'Один из разделов по умолчанию: его ярлык (slug) остаётся «{slug}», потому что по нему сайт находит название и описание раздела на всех языках.', 'Один із розділів за замовчуванням: його ярлик (slug) лишається «{slug}», бо за ним сайт знаходить назву й опис розділу всіма мовами.'],
		'forum_author_deleted' => ['Deleted member', 'Удалённый участник', 'Видалений учасник'],
		'reports_none'        => ['No reports.', 'Жалоб нет.', 'Скарг немає.'],
		'reports_dismiss'     => ['Dismiss reports', 'Снять жалобы', 'Зняти скарги'],
		'reports_dismiss_hint' => ['The post stays, and these people cannot report it again.', 'Запись остаётся, а эти люди больше не смогут на неё пожаловаться.', 'Допис лишається, а ці люди більше не зможуть на нього поскаржитися.'],
		'reports_dismissed'   => ['Reports dismissed.', 'Жалобы сняты.', 'Скарги знято.'],
		'ctype_comment'       => ['Workshop comments', 'Комментарии мастерской', 'Коментарі майстерні'],
		'ctype_reply'         => ['Forum replies', 'Ответы на форуме', 'Відповіді на форумі'],

		// Default forum sections: names and descriptions
		'forum_s_news'      => ['News', 'Новости', 'Новини'],
		'forum_sd_news'     => ['Kadro updates and announcements from the team.', 'Обновления Kadro и объявления команды.', 'Оновлення Kadro та оголошення від команди.'],
		'forum_s_help'      => ['Help', 'Помощь', 'Допомога'],
		'forum_sd_help'     => ['Questions about editing in Kadro: how to do something and where to find it.', 'Вопросы о монтаже в Kadro: как что-то сделать и где это найти.', 'Питання про монтаж у Kadro: як щось зробити і де це знайти.'],
		'forum_s_ideas'     => ['Ideas', 'Идеи', 'Ідеї'],
		'forum_sd_ideas'    => ['Suggest new features and improvements.', 'Предлагайте новые функции и улучшения.', 'Пропонуйте нові функції та покращення.'],
		'forum_s_bugs'      => ['Bugs', 'Ошибки', 'Помилки'],
		'forum_sd_bugs'     => ['Something does not work as it should? Tell us what happened and how to repeat it.', 'Что-то работает не так? Расскажите, что случилось и как это повторить.', 'Щось працює не так? Розкажіть, що сталося і як це повторити.'],
		'forum_s_showcase'  => ['Showcase', 'Ваши работы', 'Ваші роботи'],
		'forum_sd_showcase' => ['Show the videos you made in Kadro.', 'Показывайте видео, смонтированные в Kadro.', 'Показуйте відео, змонтовані в Kadro.'],
		'forum_s_workshop'  => ['Workshop', 'Мастерская', 'Майстерня'],
		'forum_sd_workshop' => ['Effects, templates and everything else from the workshop.', 'Эффекты, шаблоны и всё остальное из мастерской.', 'Ефекти, шаблони та все інше з майстерні.'],
		'forum_s_chat'      => ['Chat', 'Общение', 'Спілкування'],
		'forum_sd_chat'     => ['Everything else.', 'Обо всём остальном.', 'Про все інше.'],

		// Feedback in the WordPress admin
		'feedback_menu'     => ['Feedback', 'Обратная связь', 'Зворотний зв’язок'],
		'feedback_item'     => ['Message', 'Сообщение', 'Повідомлення'],
		'feedback_all'      => ['All messages', 'Все сообщения', 'Усі повідомлення'],
		'feedback_search'   => ['Search messages', 'Искать сообщения', 'Шукати повідомлення'],
		'feedback_none'     => ['No messages yet', 'Сообщений пока нет', 'Повідомлень поки немає'],
		'fb_from'           => ['From', 'От кого', 'Від кого'],
		'fb_name'           => ['Name', 'Имя', 'Ім’я'],
		'fb_email'          => ['E-mail', 'E-mail', 'E-mail'],
		'fb_topic'          => ['Topic', 'Тема', 'Тема'],
		'fb_mailed'         => ['Mailed', 'Письмо', 'Лист'],
		'fb_page'           => ['Sent from', 'Отправлено со страницы', 'Надіслано зі сторінки'],
		'fb_lang'           => ['Language', 'Язык', 'Мова'],
		'fb_account'        => ['Account', 'Аккаунт', 'Акаунт'],
		'fb_date'           => ['Received', 'Получено', 'Отримано'],
		'fb_yes'            => ['Yes', 'Да', 'Так'],
		'fb_no'             => ['No', 'Нет', 'Ні'],
		'fb_reply'          => ['Reply by e-mail', 'Ответить письмом', 'Відповісти листом'],
		'fb_no_email'       => ['No e-mail given: there is no way to reply.', 'E-mail не указан: ответить не получится.', 'E-mail не вказано: відповісти не вийде.'],
		'fb_anonymous'      => ['anonymous', 'аноним', 'анонім'],
		'fb_topic_question' => ['Question', 'Вопрос', 'Питання'],
		'fb_topic_bug'      => ['Bug', 'Ошибка', 'Помилка'],
		'fb_topic_idea'     => ['Idea', 'Идея', 'Ідея'],
		'fb_topic_workshop' => ['Workshop', 'Мастерская', 'Майстерня'],
		'fb_topic_other'    => ['Other', 'Другое', 'Інше'],

		// Settings (WordPress admin)
		'set_community'     => ['Comments, forum and feedback', 'Комментарии, форум и обратная связь', 'Коментарі, форум і зворотний зв’язок'],
		'set_comments_open' => ['Comments on workshop items', 'Комментарии к работам мастерской', 'Коментарі до робіт майстерні'],
		'set_forum_open'    => ['Forum', 'Форум', 'Форум'],
		'set_feedback_open' => ['Feedback form on kadro.studio', 'Форма обратной связи на kadro.studio', 'Форма зворотного зв’язку на kadro.studio'],
		'set_on'            => ['On', 'Включено', 'Увімкнено'],
		'set_open_hint'     => ['When off, everything already written stays readable, but nobody can write.', 'Если выключено, всё написанное остаётся видно, но писать нельзя.', 'Якщо вимкнено, усе написане лишається видимим, але писати не можна.'],
		'set_post_limit'    => ['Comments, replies and topics per member per hour', 'Комментариев, ответов и тем на участника в час', 'Коментарів, відповідей і тем на учасника за годину'],
		'set_auto_hide'     => ['Hide a post automatically after this many reports (0 — never)', 'Скрывать запись автоматически после стольких жалоб (0 — никогда)', 'Приховувати допис автоматично після стількох скарг (0 — ніколи)'],
		'set_auto_hide_hint' => ['Only reports from members with a confirmed e-mail count; moderators’ posts are never hidden automatically. Approving the post again shows it.', 'Считаются только жалобы участников с подтверждённым e-mail; записи модераторов автоматически не скрываются. Одобрите запись снова, чтобы показать её.', 'Рахуються лише скарги учасників із підтвердженим e-mail; дописи модераторів автоматично не приховуються. Схваліть допис знову, щоб показати його.'],

		// The account page
		'notify_title'      => ['Letters', 'Письма', 'Листи'],
		'notify_label'      => ['Letters when someone comments on my works or replies to my topics', 'Письма, когда кто-то комментирует мои работы или отвечает в моих темах', 'Листи, коли хтось коментує мої роботи чи відповідає в моїх темах'],
		'notify_hint'       => ['At most one letter per work or topic in half an hour.', 'Не чаще одного письма на работу или тему за полчаса.', 'Не частіше ніж один лист на роботу чи тему за пів години.'],
		'notify_saved'      => ['Saved.', 'Сохранено.', 'Збережено.'],

		// Letters to members
		'mail_comment_subject' => ['New comment on “{title}”', 'Новый комментарий к «{title}»', 'Новий коментар до «{title}»'],
		'mail_comment_body'    => ["Hello, {name}!\n\n{author} commented on your work “{title}”:\n\n{excerpt}\n\nRead and reply:\n{link}\n\nDon’t want these letters? Turn them off on your account page:\n{off}", "Здравствуйте, {name}!\n\n{author} прокомментировал(а) вашу работу «{title}»:\n\n{excerpt}\n\nПрочитать и ответить:\n{link}\n\nНе хотите получать такие письма? Отключите их на странице аккаунта:\n{off}", "Вітаємо, {name}!\n\n{author} прокоментував(-ла) вашу роботу «{title}»:\n\n{excerpt}\n\nПрочитати й відповісти:\n{link}\n\nНе хочете отримувати такі листи? Вимкніть їх на сторінці акаунта:\n{off}"],
		'mail_reply_subject'   => ['New reply in “{title}”', 'Новый ответ в теме «{title}»', 'Нова відповідь у темі «{title}»'],
		'mail_reply_body'      => ["Hello, {name}!\n\n{author} replied in your topic “{title}”:\n\n{excerpt}\n\nRead and reply:\n{link}\n\nDon’t want these letters? Turn them off on your account page:\n{off}", "Здравствуйте, {name}!\n\n{author} ответил(а) в вашей теме «{title}»:\n\n{excerpt}\n\nПрочитать и ответить:\n{link}\n\nНе хотите получать такие письма? Отключите их на странице аккаунта:\n{off}", "Вітаємо, {name}!\n\n{author} відповів(-ла) у вашій темі «{title}»:\n\n{excerpt}\n\nПрочитати й відповісти:\n{link}\n\nНе хочете отримувати такі листи? Вимкніть їх на сторінці акаунта:\n{off}"],
		'mail_link'            => ['[link]', '[ссылка]', '[посилання]'],

		// Letters to the site admin
		'creport_comment'      => ['a comment', 'комментарий', 'коментар'],
		'creport_reply'        => ['a forum reply', 'ответ на форуме', 'відповідь на форумі'],
		'creport_topic'        => ['a forum topic', 'тему форума', 'тему форуму'],
		'mail_creport_subject' => ['Report on {what} by {author}', 'Жалоба на {what} от {author}', 'Скарга на {what} від {author}'],
		'mail_creport_body'    => ["Someone reported {what} by {author}.\n\nWhere: “{title}”\n\n{excerpt}\n\nReason: {reason}\n\nModerate it here:\n{link}", "Пожаловались на {what} от {author}.\n\nГде: «{title}»\n\n{excerpt}\n\nПричина: {reason}\n\nМодерировать здесь:\n{link}", "Поскаржилися на {what} від {author}.\n\nДе: «{title}»\n\n{excerpt}\n\nПричина: {reason}\n\nМодерувати тут:\n{link}"],
		'mail_feedback_subject' => ['Feedback: {topic} — {who}', 'Обратная связь: {topic} — {who}', 'Зворотний зв’язок: {topic} — {who}'],
		'mail_feedback_body'   => ["A message from the feedback form on kadro.studio:\n\n{message}\n\n—\nName: {name}\nE-mail: {email}\nTopic: {topic}\nPage: {page}\nLanguage: {lang}\nAccount: {account}\n\n{reply}\n\nIn the workshop admin:\n{link}", "Сообщение из формы обратной связи на kadro.studio:\n\n{message}\n\n—\nИмя: {name}\nE-mail: {email}\nТема: {topic}\nСтраница: {page}\nЯзык: {lang}\nАккаунт: {account}\n\n{reply}\n\nВ админке мастерской:\n{link}", "Повідомлення з форми зворотного зв’язку на kadro.studio:\n\n{message}\n\n—\nІм’я: {name}\nE-mail: {email}\nТема: {topic}\nСторінка: {page}\nМова: {lang}\nАкаунт: {account}\n\n{reply}\n\nВ адмінці майстерні:\n{link}"],
		'mail_feedback_reply'  => ['Reply to this letter to answer them.', 'Чтобы ответить, просто ответьте на это письмо.', 'Щоб відповісти, просто дайте відповідь на цей лист.'],
	];
}

// Comments, the forum and feedback on kadro.studio: shared helpers and the thread component
// (window.KadroCommunity). The workshop site (WordPress, kadro/v1 REST) stores everything; this
// site only shows it. Whatever people write goes onto the page as text (textContent), never as
// HTML; only http(s) addresses in posts become links. Drafts live in memory only.
(function () {
  const here = document.currentScript ? document.currentScript.src : location.href;
  // A local copy of the site may point at a test WordPress: ?api=http://127.0.0.1:9400
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const asked = local ? new URLSearchParams(location.search).get('api') : null;
  const override = asked && /^https?:\/\//i.test(asked) ? asked : null;
  const DEFAULT_BASE = 'https://workshop.kadro.studio';
  const PER_PAGE = 20;
  const MAX = { post: 2000, topic: 5000, title: 120, titleMin: 3, reason: 500, links: 5 };

  const T = {
    uk: {
      loading: 'Завантаження…',
      more: 'Показати ще',
      retry: 'Спробувати ще раз',
      'empty.item': 'Коментарів ще немає — напишіть перший.',
      'empty.topic': 'Відповідей ще немає.',
      unavailable: 'Обговорення скоро запрацює.',
      'label.item': 'Ваш коментар',
      'label.topic': 'Ваша відповідь',
      'ph.item': 'Що думаєте про цю роботу?',
      'ph.topic': 'Напишіть відповідь…',
      send: 'Надіслати',
      sending: 'Надсилання…',
      save: 'Зберегти',
      saving: 'Збереження…',
      cancel: 'Скасувати',
      edit: 'Редагувати',
      delete: 'Видалити',
      report: 'Поскаржитися',
      moderate: 'Модерувати',
      'edit.label': 'Текст допису',
      'delete.item': 'Видалити цей коментар? Повернути його не вийде.',
      'delete.topic': 'Видалити цю відповідь? Повернути її не вийде.',
      'delete.yes': 'Так, видалити',
      deleting: 'Видалення…',
      'report.label': 'Причина скарги',
      'report.ph': 'Що не так: спам, образи, чужі особисті дані…',
      'report.send': 'Надіслати скаргу',
      reported: 'Скаргу надіслано — модератори перевірять.',
      edited: 'змінено',
      'edited.at': 'Змінено {date}',
      hidden: 'приховано',
      'hidden.title': 'Цей допис приховано: його бачите лише ви й модератори.',
      mod: 'модератор',
      deleted: 'Видалений учасник',
      reports: { one: '{n} скарга', few: '{n} скарги', many: '{n} скарг', other: '{n} скарги' },
      justNow: 'щойно',
      published: 'Вашу відповідь опубліковано.',
      'published.show': 'Показати',
      'note.signin': 'Щоб написати, {in} або {join}.',
      'note.in': 'увійдіть',
      'note.join': 'створіть акаунт',
      'note.confirm': 'Щоб писати, підтвердьте e-mail: відкрийте посилання з листа майстерні.',
      'note.resend': 'Надіслати лист ще раз',
      'note.account': 'Мій акаунт',
      'note.sent': 'Лист надіслано. Перевірте пошту, зокрема папку «Спам».',
      'note.confirmed': 'Адресу підтверджено — можна писати.',
      'note.closed': 'Тему закрито: нові відповіді не приймаються.',
      'note.off.item': 'Нові коментарі зараз вимкнено.',
      'note.off.topic': 'Нові відповіді зараз вимкнено.',
      'note.off.forum': 'Нові теми зараз не приймаються.',
      'note.blocked': 'Відповідати в цій темі зараз не можна.',
      'err.network': 'Немає зв’язку з сервером майстерні. Перевірте інтернет і спробуйте ще раз.',
      'err.kw_server': 'Щось пішло не так. Спробуйте трохи пізніше.',
      'err.kw_unavailable': 'Це ще не запрацювало. Спробуйте трохи пізніше.',
      'err.kw_auth': 'Увійдіть знову: схоже, ви вийшли з акаунта.',
      'err.rest_cookie_invalid_nonce': 'Сесія застаріла. Оновіть сторінку й спробуйте ще раз.',
      'err.rest_invalid_param': 'Перевірте заповнені поля.',
      'err.kw_unconfirmed': 'Спершу підтвердьте e-mail: відкрийте посилання з листа майстерні.',
      'err.kw_forbidden': 'На це у вас немає прав.',
      'err.kw_off': 'Зараз це вимкнено.',
      'err.kw_locked': 'У цьому розділі теми створюють лише модератори.',
      'err.kw_closed': 'Тему закрито: нові відповіді не приймаються.',
      'err.kw_has_replies': 'У темі вже є відповіді інших учасників, тож видалити її може лише модератор.',
      'err.kw_not_found': 'Не знайдено: можливо, це вже видалили.',
      'err.kw_empty': 'Напишіть текст.',
      'err.kw_too_long': 'Текст задовгий — скоротіть його.',
      'err.kw_title': 'Назва теми — від 3 до 120 символів.',
      'err.kw_section': 'Виберіть розділ.',
      'err.kw_links': 'Забагато посилань: у дописі може бути щонайбільше 5.',
      'err.kw_reason': 'Напишіть причину скарги.',
      'err.kw_own': 'На власний допис скаржитися не можна.',
      'err.kw_email': 'Перевірте адресу e-mail.',
      'err.kw_message': 'Повідомлення має бути від 10 до 3000 символів.',
      'err.kw_rate': 'Забагато дописів за короткий час. Зачекайте трохи й спробуйте знову.',
      'err.kw_resend_limit': 'Листів надіслано вже забагато. Спробуйте за годину.',
      'err.kw_mail_failed': 'Лист зараз не вдалося надіслати. Спробуйте пізніше.',
    },
    ru: {
      loading: 'Загрузка…',
      more: 'Показать ещё',
      retry: 'Попробовать ещё раз',
      'empty.item': 'Комментариев пока нет — напишите первый.',
      'empty.topic': 'Ответов пока нет.',
      unavailable: 'Обсуждение скоро заработает.',
      'label.item': 'Ваш комментарий',
      'label.topic': 'Ваш ответ',
      'ph.item': 'Что думаете об этой работе?',
      'ph.topic': 'Напишите ответ…',
      send: 'Отправить',
      sending: 'Отправка…',
      save: 'Сохранить',
      saving: 'Сохранение…',
      cancel: 'Отмена',
      edit: 'Изменить',
      delete: 'Удалить',
      report: 'Пожаловаться',
      moderate: 'Модерировать',
      'edit.label': 'Текст сообщения',
      'delete.item': 'Удалить этот комментарий? Вернуть его не получится.',
      'delete.topic': 'Удалить этот ответ? Вернуть его не получится.',
      'delete.yes': 'Да, удалить',
      deleting: 'Удаление…',
      'report.label': 'Причина жалобы',
      'report.ph': 'Что не так: спам, оскорбления, чужие личные данные…',
      'report.send': 'Отправить жалобу',
      reported: 'Жалоба отправлена — модераторы проверят.',
      edited: 'изменено',
      'edited.at': 'Изменено {date}',
      hidden: 'скрыто',
      'hidden.title': 'Это сообщение скрыто: его видите только вы и модераторы.',
      mod: 'модератор',
      deleted: 'Удалённый участник',
      reports: { one: '{n} жалоба', few: '{n} жалобы', many: '{n} жалоб', other: '{n} жалобы' },
      justNow: 'только что',
      published: 'Ваш ответ опубликован.',
      'published.show': 'Показать',
      'note.signin': 'Чтобы написать, {in} или {join}.',
      'note.in': 'войдите',
      'note.join': 'создайте аккаунт',
      'note.confirm': 'Чтобы писать, подтвердите e-mail: откройте ссылку из письма мастерской.',
      'note.resend': 'Отправить письмо ещё раз',
      'note.account': 'Мой аккаунт',
      'note.sent': 'Письмо отправлено. Проверьте почту, в том числе папку «Спам».',
      'note.confirmed': 'Адрес подтверждён — можно писать.',
      'note.closed': 'Тема закрыта: новые ответы не принимаются.',
      'note.off.item': 'Новые комментарии сейчас отключены.',
      'note.off.topic': 'Новые ответы сейчас отключены.',
      'note.off.forum': 'Новые темы сейчас не принимаются.',
      'note.blocked': 'Отвечать в этой теме сейчас нельзя.',
      'err.network': 'Нет связи с сервером мастерской. Проверьте интернет и попробуйте ещё раз.',
      'err.kw_server': 'Что-то пошло не так. Попробуйте чуть позже.',
      'err.kw_unavailable': 'Это ещё не заработало. Попробуйте чуть позже.',
      'err.kw_auth': 'Войдите снова: похоже, вы вышли из аккаунта.',
      'err.rest_cookie_invalid_nonce': 'Сессия устарела. Обновите страницу и попробуйте ещё раз.',
      'err.rest_invalid_param': 'Проверьте заполненные поля.',
      'err.kw_unconfirmed': 'Сначала подтвердите e-mail: откройте ссылку из письма мастерской.',
      'err.kw_forbidden': 'На это у вас нет прав.',
      'err.kw_off': 'Сейчас это отключено.',
      'err.kw_locked': 'В этом разделе темы создают только модераторы.',
      'err.kw_closed': 'Тема закрыта: новые ответы не принимаются.',
      'err.kw_has_replies': 'В теме уже есть ответы других участников, поэтому удалить её может только модератор.',
      'err.kw_not_found': 'Не найдено: возможно, это уже удалили.',
      'err.kw_empty': 'Напишите текст.',
      'err.kw_too_long': 'Текст слишком длинный — сократите его.',
      'err.kw_title': 'Название темы — от 3 до 120 символов.',
      'err.kw_section': 'Выберите раздел.',
      'err.kw_links': 'Слишком много ссылок: в сообщении может быть не больше 5.',
      'err.kw_reason': 'Напишите причину жалобы.',
      'err.kw_own': 'На своё сообщение жаловаться нельзя.',
      'err.kw_email': 'Проверьте адрес e-mail.',
      'err.kw_message': 'Сообщение должно быть от 10 до 3000 символов.',
      'err.kw_rate': 'Слишком много сообщений за короткое время. Подождите немного и попробуйте снова.',
      'err.kw_resend_limit': 'Писем отправлено уже слишком много. Попробуйте через час.',
      'err.kw_mail_failed': 'Письмо сейчас не удалось отправить. Попробуйте позже.',
    },
    en: {
      loading: 'Loading…',
      more: 'Show more',
      retry: 'Try again',
      'empty.item': 'No comments yet — be the first to write one.',
      'empty.topic': 'No replies yet.',
      unavailable: 'Discussions are coming soon.',
      'label.item': 'Your comment',
      'label.topic': 'Your reply',
      'ph.item': 'What do you think of this work?',
      'ph.topic': 'Write a reply…',
      send: 'Send',
      sending: 'Sending…',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      report: 'Report',
      moderate: 'Moderate',
      'edit.label': 'Post text',
      'delete.item': 'Delete this comment? It can’t be brought back.',
      'delete.topic': 'Delete this reply? It can’t be brought back.',
      'delete.yes': 'Yes, delete',
      deleting: 'Deleting…',
      'report.label': 'Reason for the report',
      'report.ph': 'What’s wrong: spam, insults, someone’s personal data…',
      'report.send': 'Send report',
      reported: 'Report sent — the moderators will check it.',
      edited: 'edited',
      'edited.at': 'Edited {date}',
      hidden: 'hidden',
      'hidden.title': 'This post is hidden: only you and the moderators can see it.',
      mod: 'moderator',
      deleted: 'Deleted member',
      reports: { one: '{n} report', other: '{n} reports' },
      justNow: 'just now',
      published: 'Your reply is published.',
      'published.show': 'Show it',
      'note.signin': 'To write here, {in} or {join}.',
      'note.in': 'sign in',
      'note.join': 'create an account',
      'note.confirm': 'To write, confirm your e-mail address: open the link in the letter from the workshop.',
      'note.resend': 'Send the letter again',
      'note.account': 'My account',
      'note.sent': 'Letter sent. Check your inbox, and the spam folder too.',
      'note.confirmed': 'Your address is confirmed — you can write now.',
      'note.closed': 'This topic is closed: no new replies.',
      'note.off.item': 'New comments are switched off for now.',
      'note.off.topic': 'New replies are switched off for now.',
      'note.off.forum': 'New topics are not accepted right now.',
      'note.blocked': 'You can’t reply in this topic right now.',
      'err.network': 'Can’t reach the workshop server. Check your connection and try again.',
      'err.kw_server': 'Something went wrong. Please try again a bit later.',
      'err.kw_unavailable': 'This isn’t available yet. Please try again a bit later.',
      'err.kw_auth': 'Please sign in again: it looks like you were signed out.',
      'err.rest_cookie_invalid_nonce': 'Your session has expired. Reload the page and try again.',
      'err.rest_invalid_param': 'Please check the fields.',
      'err.kw_unconfirmed': 'Confirm your e-mail address first: open the link in the letter from the workshop.',
      'err.kw_forbidden': 'You don’t have permission to do that.',
      'err.kw_off': 'This is switched off right now.',
      'err.kw_locked': 'Only moderators start topics in this section.',
      'err.kw_closed': 'This topic is closed: no new replies.',
      'err.kw_has_replies': 'Other members have already replied, so only a moderator can delete this topic.',
      'err.kw_not_found': 'Not found: it may have been deleted.',
      'err.kw_empty': 'Please write something.',
      'err.kw_too_long': 'The text is too long — please shorten it.',
      'err.kw_title': 'A topic title needs 3 to 120 characters.',
      'err.kw_section': 'Please choose a section.',
      'err.kw_links': 'Too many links: a post can have 5 at most.',
      'err.kw_reason': 'Please give a reason for the report.',
      'err.kw_own': 'You can’t report your own post.',
      'err.kw_email': 'Please check the e-mail address.',
      'err.kw_message': 'The message needs 10 to 3000 characters.',
      'err.kw_rate': 'Too many posts in a short time. Please wait a little and try again.',
      'err.kw_resend_limit': 'Too many letters already. Please try again in an hour.',
      'err.kw_mail_failed': 'The letter couldn’t be sent right now. Please try again later.',
    },
  };
  const LOCALES = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-GB' };

  // ---------- language, text and small DOM helpers ----------

  const lang = () => {
    const l = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    return T[l] ? l : 'en';
  };
  const locale = () => LOCALES[lang()];
  const vars = (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : String(s));
  const t = (key, v) => vars(T[lang()][key] ?? T.en[key] ?? key, v);

  const rules = {};
  // Counted forms: "1 відповідь / 2 відповіді / 5 відповідей". `forms` is {one, few, many, other}.
  function plural(forms, n) {
    if (typeof forms === 'string') return vars(forms, { n });
    const L = locale();
    let rule = 'other';
    try {
      rules[L] ||= new Intl.PluralRules(L);
      rule = rules[L].select(n);
    } catch {
      rule = n === 1 ? 'one' : 'other';
    }
    return vars(forms[rule] ?? forms.other, { n: Number(n).toLocaleString(L) });
  }
  const tn = (key, n) => plural(T[lang()][key] ?? T.en[key], n);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // "Text {a} text {b}" with nodes in place of the {names}.
  function fill(template, nodes) {
    const frag = document.createDocumentFragment();
    for (const part of String(template).split(/(\{\w+\})/)) {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m && nodes[m[1]] !== undefined) frag.append(nodes[m[1]]);
      else if (part) frag.append(part);
    }
    return frag;
  }

  function button(text, cls, onClick) {
    const b = el('button', cls || 'link-btn', text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  // A link whose address is worked out when it is used (the page's URL may have changed since).
  function liveLink(text, make, cls) {
    const a = el('a', cls || '', text);
    const set = () => {
      a.href = make();
    };
    set();
    for (const ev of ['pointerdown', 'focus', 'click', 'contextmenu']) a.addEventListener(ev, set);
    return a;
  }

  // Characters as the server counts them (code points), without the outer spaces.
  const len = (s) => Array.from(String(s).trim()).length;

  // ---------- links in posts ----------

  const URL_RE = /\bhttps?:\/\/[^\s<>"'«»“”]+/gi;

  function linkify(text) {
    const s = String(text ?? '');
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of s.matchAll(URL_RE)) {
      let url = m[0];
      // Punctuation at the end belongs to the sentence, not to the address.
      for (;;) {
        if (/[.,;:!?…]$/.test(url)) url = url.slice(0, -1);
        else if (url.endsWith(')') && url.split('(').length < url.split(')').length) url = url.slice(0, -1);
        else break;
      }
      let href = null;
      try {
        const u = new URL(url);
        if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href;
      } catch {
        href = null;
      }
      if (m.index > last) frag.append(s.slice(last, m.index));
      if (href) {
        const a = el('a', '', url);
        a.href = href;
        a.rel = 'nofollow ugc noopener';
        a.target = '_blank';
        frag.append(a);
      } else {
        frag.append(url);
      }
      last = m.index + url.length;
    }
    if (last < s.length) frag.append(s.slice(last));
    return frag;
  }

  function textEl(content, cls) {
    const p = el('p', cls || 'cm-text');
    p.append(linkify(content));
    return p;
  }

  // ---------- dates ----------

  // The server sends UTC times; a time without an offset is read as UTC too.
  function parseDate(s) {
    if (typeof s !== 'string' || !s) return null;
    const d = new Date(/(?:Z|[+-]\d\d:?\d\d)$/i.test(s) ? s : `${s}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fullDate(s) {
    const d = parseDate(s);
    if (!d) return '';
    try {
      return d.toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' });
    } catch {
      return d.toLocaleString(locale());
    }
  }

  // "5 хв тому" for the last week, then the date.
  function when(s) {
    const d = parseDate(s);
    if (!d) return '';
    const sec = (Date.now() - d.getTime()) / 1000;
    if (sec < 7 * 86400 && typeof Intl.RelativeTimeFormat === 'function') {
      if (sec < 45) return t('justNow');
      const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' });
      if (sec < 3600) return rtf.format(-Math.max(1, Math.floor(sec / 60)), 'minute');
      if (sec < 86400) return rtf.format(-Math.floor(sec / 3600), 'hour');
      return rtf.format(-Math.floor(sec / 86400), 'day');
    }
    return d.toLocaleDateString(locale());
  }

  function timeEl(s, cls) {
    const n = el('time', cls || 'cm-time', when(s));
    const d = parseDate(s);
    if (d) {
      n.dateTime = d.toISOString();
      n.title = fullDate(s);
    }
    return n;
  }

  // ---------- where the workshop is ----------

  let cfgNow = null;
  let cfgPromise = null;

  // {base, api, open} from workshop.json next to this script (the app reads the same file).
  function config() {
    if (!cfgPromise) {
      const make = (url, open) => {
        const base = String(url).replace(/\/+$/, '');
        cfgNow = { base, api: `${base}/wp-json/kadro/v1`, open };
        return cfgNow;
      };
      cfgPromise = (async () => {
        if (override) return make(override, true);
        try {
          const c = await (await fetch(new URL('workshop.json', here), { cache: 'no-cache' })).json();
          return make(typeof c.url === 'string' && c.url.startsWith('https://') ? c.url : DEFAULT_BASE, c.open !== false);
        } catch {
          return make(DEFAULT_BASE, true);
        }
      })();
    }
    return cfgPromise;
  }

  const base = () => (cfgNow ? cfgNow.base : DEFAULT_BASE);
  const signInUrl = (back) => `${base()}/?kadro=login&lang=${lang()}&redirect_to=${encodeURIComponent(back || location.href)}`;
  const joinUrl = (back) => `${base()}/?kadro=join&lang=${lang()}&redirect_to=${encodeURIComponent(back || location.href)}`;
  const accountUrl = () => `${base()}/?kadro=account&lang=${lang()}`;
  // Moderators open a comment/reply ('post') or a topic ('topic') in the workshop's admin.
  const moderateUrl = (what, id) =>
    what === 'topic'
      ? `${base()}/wp-admin/post.php?post=${Number(id)}&action=edit`
      : `${base()}/wp-admin/comment.php?action=editcomment&c=${Number(id)}`;

  // ---------- who is signed in ----------

  let meNow = null;
  let mePromise = null;
  let refreshing = null;
  const meListeners = new Set();

  function normalize(m) {
    if (!m || typeof m !== 'object' || m.signedIn !== true) return { signedIn: false };
    return {
      ...m,
      signedIn: true,
      name: typeof m.name === 'string' ? m.name : '',
      nonce: typeof m.nonce === 'string' ? m.nonce : '',
      confirmed: m.confirmed !== false,
      moderator: m.moderator === true,
    };
  }

  const identity = (m) => (m ? [m.signedIn, m.name, m.moderator, m.confirmed, !!m.nonce].join('|') : '');

  function setMe(m) {
    const prev = meNow;
    meNow = m;
    if (prev && identity(prev) !== identity(m)) {
      for (const cb of [...meListeners]) {
        try {
          cb(m, prev);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  // {ok: true, me} when the workshop answered (2xx with an object); {ok: false, code} when it
  // could not be asked (no connection: 'network'; an error page or not JSON: 'kw_server').
  async function askWhoami() {
    const c = await config();
    if (!c.open) return { ok: true, me: { signedIn: false } };
    let r;
    try {
      r = await fetch(`${c.base}/?kadro=whoami`, { credentials: 'include', cache: 'no-store' });
    } catch {
      return { ok: false, code: 'network' };
    }
    let j = null;
    try {
      j = r.ok ? await r.json() : null;
    } catch {
      j = null;
    }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, code: 'kw_server' };
    return { ok: true, me: normalize(j) };
  }

  // The first answer of the visit: signed out when the workshop cannot be asked.
  const fetchWhoami = () => askWhoami().then((a) => (a.ok ? a.me : { signedIn: false }));

  const domReady = () =>
    document.readyState === 'loading'
      ? new Promise((res) => document.addEventListener('DOMContentLoaded', res, { once: true }))
      : Promise.resolve();

  // The header script (account.js) asks first and shares its answer as window.kadroMe.
  function me() {
    if (!mePromise) {
      mePromise = Promise.all([config(), domReady()])
        .then(() => (window.kadroMe && typeof window.kadroMe.then === 'function' ? window.kadroMe : fetchWhoami()))
        .then(normalize, () => ({ signedIn: false }))
        .then((m) => {
          if (!meNow) setMe(m);
          return meNow;
        });
    }
    return mePromise.then(() => meNow);
  }

  // Asks whoami again. Only a real answer changes who is signed in: when the workshop cannot be
  // reached (or sends an error page), the current state stays as it is. Resolves with {ok, me, code}.
  function renewMe() {
    if (!refreshing) {
      refreshing = askWhoami().then((a) => {
        refreshing = null;
        if (a.ok) {
          if (!mePromise) mePromise = Promise.resolve(a.me);
          setMe(a.me);
        }
        return a;
      });
    }
    return refreshing;
  }

  // The same for the pages: resolves with who is signed in now (unchanged when whoami failed).
  const refreshMe = () => renewMe().then((a) => (a.ok ? a.me : meNow || { signedIn: false }));

  function onMe(cb) {
    meListeners.add(cb);
    return () => meListeners.delete(cb);
  }

  // Someone who just confirmed the address or signed in in another tab comes back to this one.
  let lastCheck = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !meNow || !meListeners.size) return;
    if (meNow.signedIn && (meNow.confirmed || meNow.moderator)) return;
    if (Date.now() - lastCheck < 3000) return;
    lastCheck = Date.now();
    refreshMe();
  });

  // ---------- requests ----------

  let unavailable = false;

  function fail(code, status, message) {
    const e = new Error(message || code);
    e.code = code;
    e.status = status;
    return e;
  }

  function toBody(body) {
    if (body === undefined || body === null) return undefined;
    if (body instanceof FormData || body instanceof URLSearchParams) return body;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    }
    return q;
  }

  // The same person: a renewed nonce is used only for them, never for another account.
  // (whoami gives no account number, so the name and the moderator flag tell them apart.)
  const samePerson = (a, b) => !!(a && b && a.signedIn && b.signedIn && a.name === b.name && a.moderator === b.moderator);

  // fetch to the workshop's REST API with the sign-in cookie and, when signed in, the nonce.
  // Resolves with the JSON; throws an Error with .code (a kw_* or core code, 'network',
  // 'kw_server', 'kw_unavailable') and .status.
  // o.anonOk: the request also works without an account (feedback). When the session has ended
  // (or another account is signed in now), it is sent once more anonymously instead of failing.
  async function request(method, path, body, o) {
    const anonOk = !!(o && o.anonOk);
    const c = await config();
    let m = await me();
    // Signed in but no nonce: the workshop runs an older plugin without community features.
    if (m.signedIn && !m.nonce) {
      unavailable = true;
      throw fail('kw_unavailable', 0);
    }
    const get = method === 'GET';
    const payload = get ? undefined : toBody(body);
    let anon = false;
    let renewed = false;
    for (;;) {
      const headers = {};
      if (!anon && m.signedIn && m.nonce) headers['X-WP-Nonce'] = m.nonce;
      let r;
      try {
        r = await fetch(c.api + path, { method, headers, body: payload, credentials: anon ? 'omit' : 'include', cache: 'no-store' });
      } catch {
        throw fail('network', 0);
      }
      let data = null;
      try {
        data = await r.json();
      } catch {
        data = null;
      }
      if (r.ok) {
        if (!data || typeof data !== 'object') throw fail('kw_server', r.status);
        return data;
      }
      const code = data && typeof data.code === 'string' ? data.code : 'kw_server';
      if (code === 'rest_no_route') {
        unavailable = true;
        throw fail('kw_unavailable', r.status);
      }
      if (code === 'rest_cookie_invalid_nonce' && !renewed && !anon) {
        // The nonce went stale (or the session ended): ask again once.
        renewed = true;
        const was = m;
        const a = await renewMe();
        const now = a.ok ? a.me : null;
        // The same person with a fresh nonce: send it again.
        if (now && now.signedIn && now.nonce && samePerson(was, now)) {
          m = now;
          continue;
        }
        // Signed out, someone else signed in now, or whoami did not answer: reading goes on
        // anonymously (the page is drawn again for a new state anyway), and so does feedback.
        if (get || anonOk) {
          if (now) m = now;
          anon = true;
          continue;
        }
        // Anything else is never sent as a different account. When whoami did not answer, this is
        // a connection or server problem (the sign-in state stays), not a signed-out visitor.
        if (!a.ok) throw fail(a.code, a.code === 'network' ? 0 : r.status);
        throw fail('kw_auth', 401);
      }
      if (get && !anon && (r.status === 401 || r.status === 403)) {
        anon = true;
        continue;
      }
      if (r.status === 401 && m.signedIn) refreshMe();
      if (code === 'kw_unconfirmed' && m.signedIn && m.confirmed) refreshMe();
      throw fail(code, r.status, data && typeof data.message === 'string' ? data.message : '');
    }
  }

  // A message for the person, by error code. `own` may be a page's t() with 'err.<code>' keys.
  function errorText(err, own) {
    let code = (err && err.code) || 'kw_server';
    if (code === 'rest_forbidden' || (err && err.status === 401)) code = 'kw_auth';
    if (code === 'kw_limit') code = 'kw_rate';
    if (code === 'rest_no_route') code = 'kw_unavailable';
    if (typeof own === 'function') {
      const v = own(`err.${code}`);
      if (v && v !== `err.${code}`) return v;
    }
    return T[lang()][`err.${code}`] ?? T.en[`err.${code}`] ?? t('err.kw_server');
  }

  // The same limits the server enforces; '' when the text is fine.
  function check(text, o) {
    const n = len(text);
    if (n === 0) return o.emptyCode || 'kw_empty';
    if (o.min && n < o.min) return o.minCode || 'kw_empty';
    if (n > o.max) return o.maxCode || 'kw_too_long';
    if (o.links !== false && !(meNow && meNow.moderator)) {
      if ((String(text).match(/https?:\/\//gi) || []).length > MAX.links) return 'kw_links';
    }
    return '';
  }

  // "12 / 2000" next to a field; turns red past the limit.
  function counter(field, max) {
    const n = el('span', 'counter');
    n.setAttribute('aria-live', 'polite');
    const update = () => {
      const k = len(field.value);
      n.textContent = `${k.toLocaleString(locale())} / ${max.toLocaleString(locale())}`;
      n.classList.toggle('over', k > max);
    };
    field.addEventListener('input', update);
    update();
    return { el: n, update };
  }

  function errorBox() {
    const p = el('p', 'form-error');
    p.setAttribute('role', 'alert');
    p.hidden = true;
    return {
      el: p,
      show(text) {
        p.textContent = text;
        p.hidden = !text;
      },
      clear() {
        p.textContent = '';
        p.hidden = true;
      },
    };
  }

  // ---------- pieces shared by threads and the forum ----------

  function hue(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 6;
  }

  // A coloured circle with the first letter: no pictures from other sites.
  function avatar(name) {
    const s = String(name || '').trim();
    const n = el('span', `acct-pic cm-pic ${s ? `cm-pic-${hue(s)}` : 'cm-pic-none'}`, s ? Array.from(s)[0].toUpperCase() : '?');
    n.setAttribute('aria-hidden', 'true');
    return n;
  }

  function badge(text, cls, title) {
    const b = el('span', `cm-badge${cls ? ` ${cls}` : ''}`, text);
    if (title) b.title = title;
    return b;
  }

  // Author, moderator badge, time, "edited", hidden and (for moderators) reports.
  function byline(p) {
    const head = el('div', 'cm-head');
    const name = typeof p.author === 'string' ? p.author.trim() : '';
    head.append(el('b', `cm-author${name ? '' : ' gone'}`, name || t('deleted')));
    if (p.mod) head.append(badge(t('mod')));
    head.append(timeEl(p.created));
    if (p.edited) {
      const e = el('span', 'cm-edited', t('edited'));
      const at = fullDate(p.edited);
      if (at) e.title = t('edited.at', { date: at });
      head.append(e);
    }
    if (p.status === 'hidden') head.append(badge(t('hidden'), 'muted', t('hidden.title')));
    if (meNow && meNow.moderator && Number(p.reports) > 0) head.append(badge(tn('reports', Number(p.reports)), 'warn'));
    return head;
  }

  // An inline report form: a labelled reason field, send and cancel.
  let fieldSeq = 0;
  function reportBox({ onSend, onCancel, draftKey }) {
    const box = el('form', 'cm-inline');
    box.noValidate = true;
    const id = `cm-reason-${++fieldSeq}`;
    const label = el('label', 'field-label', t('report.label'));
    label.htmlFor = id;
    const input = el('input', 'input');
    input.id = id;
    input.type = 'text';
    input.maxLength = MAX.reason;
    input.placeholder = t('report.ph');
    input.autocomplete = 'off';
    if (draftKey) input.value = drafts.get(draftKey) || '';
    const err = errorBox();
    const send = el('button', 'btn btn-ghost btn-sm', t('report.send'));
    send.type = 'submit';
    const row = el('div', 'cm-inline-row');
    row.append(send, button(t('cancel'), 'link-btn', onCancel));
    input.addEventListener('input', () => {
      if (draftKey) drafts.set(draftKey, input.value);
      err.clear();
    });
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = input.value.trim();
      if (!reason) {
        err.show(errorText({ code: 'kw_reason' }));
        input.focus();
        return;
      }
      send.disabled = true;
      send.textContent = t('sending');
      try {
        await onSend(reason);
        if (draftKey) drafts.delete(draftKey);
      } catch (ex) {
        err.show(errorText(ex));
        send.disabled = false;
        send.textContent = t('report.send');
      }
    });
    box.append(label, input, err.el, row);
    box.focusFirst = () => input.focus();
    return box;
  }

  // "Delete this? [Yes, delete] [Cancel]" — nothing is deleted without this step.
  function confirmBox({ text, onYes, onCancel }) {
    const box = el('div', 'cm-confirm');
    box.setAttribute('role', 'group');
    const q = el('p', 'cm-confirm-text', text);
    const err = errorBox();
    const yes = el('button', 'btn btn-danger btn-sm', t('delete.yes'));
    yes.type = 'button';
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      yes.textContent = t('deleting');
      try {
        await onYes();
      } catch (ex) {
        err.show(errorText(ex));
        yes.disabled = false;
        yes.textContent = t('delete.yes');
      }
    });
    const row = el('div', 'cm-inline-row');
    row.append(yes, button(t('cancel'), 'link-btn', onCancel));
    box.append(q, err.el, row);
    box.focusFirst = () => yes.focus();
    return box;
  }

  // Why the current person cannot write here, or '' when they can.
  // o: {off, closed, blocked}
  function gate(o) {
    const m = meNow || { signedIn: false };
    if (o.off) return 'off';
    if (o.closed && !m.moderator) return 'closed';
    if (!m.signedIn) return 'signin';
    if (!m.confirmed && !m.moderator) return 'confirm';
    if (o.blocked) return 'blocked';
    return '';
  }

  // The note shown instead of a form. o: {kind: 'item'|'topic'|'forum', back: () => url}
  function note(reason, o) {
    const box = el('div', 'cm-note');
    const p = el('p');
    box.append(p);
    if (reason === 'signin') {
      const back = () => (o.back ? o.back() : location.href);
      p.append(
        fill(t('note.signin'), {
          in: liveLink(t('note.in'), () => signInUrl(back())),
          join: liveLink(t('note.join'), () => joinUrl(back())),
        }),
      );
    } else if (reason === 'confirm') {
      p.textContent = t('note.confirm');
      const row = el('div', 'cm-inline-row');
      const status = el('p', 'cm-note-status');
      status.setAttribute('role', 'status');
      const resend = button(t('note.resend'), 'btn btn-ghost btn-sm', async () => {
        resend.disabled = true;
        status.textContent = '';
        try {
          const r = await request('POST', '/me/confirm');
          if (r.confirmed) {
            status.textContent = t('note.confirmed');
            refreshMe();
          } else {
            status.textContent = t('note.sent');
          }
        } catch (e) {
          status.textContent = errorText(e);
        }
        resend.disabled = false;
      });
      const acc = el('a', '', t('note.account'));
      acc.href = accountUrl();
      row.append(resend, acc);
      box.append(row, status);
    } else if (reason === 'closed') {
      p.textContent = t('note.closed');
    } else if (reason === 'blocked') {
      p.textContent = t('note.blocked');
    } else {
      p.textContent = t(`note.off.${o.kind === 'topic' ? 'topic' : o.kind === 'forum' ? 'forum' : 'item'}`);
    }
    return box;
  }

  // ---------- the thread: comments on an item or replies in a topic ----------

  const drafts = new Map(); // thread key or 'edit:<id>' / 'report:<id>' → text
  const reported = new Set(); // posts reported during this visit
  // The inline form (thread state field) → the button that opens it (data-act).
  const ACT = { editing: 'edit', deleting: 'delete', reporting: 'report' };

  // thread(container, {kind:'item'|'topic', id, open, closed, blocked, focus, onCount(n),
  //   onUnavailable(), back: () => url to return to after signing in})
  // Items: newest first, the form on top. Topics: oldest first, the form at the end.
  function thread(container, opts) {
    const kind = opts.kind === 'topic' ? 'topic' : 'item';
    const id = Number(opts.id);
    const key = `${kind}:${id}`;
    const asc = kind === 'topic';
    const listPath = asc ? `/forum/topics/${id}/replies` : `/items/${id}/comments`;
    const root = el('div', `cm-thread cm-${kind}`);
    container.append(root);

    const st = {
      posts: [],
      page: 0,
      pages: 1,
      total: 0,
      count: null,
      status: 'loading', // loading | idle | error | unavailable
      error: null,
      open: opts.open,
      closed: !!opts.closed,
      blocked: !!opts.blocked,
      editing: 0,
      deleting: 0,
      reporting: 0,
      more: false,
      moreError: null,
      flash: 0,
      focusForm: false,
      me: null,
      formReason: null,
      shift: 0, // posts added (+) or deleted (−) here since the pages were loaded
      seq: 0,
      dead: false,
    };
    const els = new Map();
    let ui = null;

    const writable = () => !(cfgNow && !cfgNow.open) && st.open !== false;
    const emitCount = () => {
      if (opts.onCount && st.count !== null) opts.onCount(st.count);
    };

    function renderAll() {
      if (st.dead) return;
      root.textContent = '';
      els.clear();
      ui = {
        form: el('div', 'cm-compose'),
        flash: el('div', 'cm-flash-box'),
        state: el('div', 'cm-state'),
        list: el('ol', 'cm-list'),
        more: el('div', 'cm-more'),
      };
      if (asc) root.append(ui.state, ui.list, ui.more, ui.flash, ui.form);
      else root.append(ui.form, ui.flash, ui.state, ui.list, ui.more);
      for (const p of st.posts) ui.list.append(postEl(p));
      renderState();
      renderMore();
      renderForm();
      renderFlash();
    }

    function renderState() {
      const box = ui.state;
      box.textContent = '';
      let text = '';
      if (st.status === 'loading') text = t('loading');
      else if (st.status === 'unavailable') text = t('unavailable');
      else if (st.status === 'idle' && st.posts.length === 0) text = t(`empty.${kind}`);
      if (st.status === 'error') {
        const p = el('p', 'ws-state', errorText(st.error));
        p.setAttribute('role', 'alert');
        box.append(p, button(t('retry'), 'btn btn-ghost btn-sm', () => load(false)));
      } else if (text) {
        box.append(el('p', 'ws-state', text));
      }
      box.hidden = !box.firstChild;
    }

    function renderMore() {
      const box = ui.more;
      box.textContent = '';
      if (st.status !== 'idle' || st.page >= st.pages) return;
      if (st.moreError) {
        const p = el('p', 'form-error', errorText(st.moreError));
        p.setAttribute('role', 'alert');
        box.append(p);
      }
      const b = button(st.more ? t('loading') : t('more'), 'btn btn-ghost btn-sm', () => load(true));
      b.disabled = st.more;
      box.append(b);
    }

    function renderFlash() {
      const box = ui.flash;
      box.textContent = '';
      if (!st.flash) return;
      const p = el('p', 'cm-flash');
      p.setAttribute('role', 'status');
      const pid = st.flash;
      p.append(`${t('published')} `, button(t('published.show'), 'link-btn', () => jumpTo(pid)));
      box.append(p);
    }

    // What the form area offers: 'none' (nothing yet), '' (the form) or the reason for a note.
    const formReason = () => (!st.me || st.status === 'unavailable' ? 'none' : gate({ off: !writable(), closed: st.closed, blocked: st.blocked }));

    // The posts after a (re)load. The form area stays as it is (someone may be typing in it or have
    // just pressed "send the letter again") unless what it offers has changed.
    function renderPosts() {
      if (!ui) {
        renderAll();
        return;
      }
      ui.list.textContent = '';
      els.clear();
      for (const p of st.posts) ui.list.append(postEl(p));
      renderState();
      renderMore();
      renderFlash();
      if (formReason() !== st.formReason) renderForm();
    }

    function renderForm() {
      const box = ui.form;
      box.textContent = '';
      const reason = formReason();
      st.formReason = reason;
      if (reason === 'none') return;
      if (reason) {
        box.append(note(reason, { kind, back: opts.back }));
        return;
      }
      const form = el('form', 'cm-form');
      form.noValidate = true;
      const fid = `cm-${kind}-${id}-text`;
      const label = el('label', 'field-label', t(`label.${kind}`));
      label.htmlFor = fid;
      const ta = el('textarea', 'textarea cm-textarea');
      ta.id = fid;
      ta.rows = 3;
      ta.placeholder = t(`ph.${kind}`);
      ta.value = drafts.get(key) || '';
      const count = counter(ta, MAX.post);
      const err = errorBox();
      const send = el('button', 'btn btn-primary btn-sm', t('send'));
      send.type = 'submit';
      const foot = el('div', 'cm-form-foot');
      foot.append(count.el, send);
      ta.addEventListener('input', () => {
        drafts.set(key, ta.value);
        err.clear();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        const bad = check(text, { max: MAX.post });
        if (bad) {
          err.show(errorText({ code: bad }));
          ta.focus();
          return;
        }
        send.disabled = true;
        send.textContent = t('sending');
        try {
          const p = await request('POST', listPath, { content: text });
          // The text is cleared only once the post is on the server — also when the thread left
          // the page meanwhile (the item's window was closed), so it is not offered again later.
          drafts.delete(key);
          if (st.dead) return;
          st.focusForm = true;
          added(p);
          renderForm();
        } catch (ex) {
          if (st.dead) return;
          send.disabled = false;
          send.textContent = t('send');
          if (writeFailed(ex)) return;
          err.show(errorText(ex));
        }
      });
      form.append(label, ta, err.el, foot);
      box.append(form);
      if (st.focusForm) {
        st.focusForm = false;
        ta.focus();
      }
    }

    // Errors that change what the thread offers; true when the thread was redrawn.
    function writeFailed(ex) {
      if (ex.code === 'kw_off') {
        st.open = false;
        renderForm();
        return true;
      }
      if (ex.code === 'kw_closed') {
        st.closed = true;
        renderForm();
        return true;
      }
      if (ex.code === 'kw_unavailable') {
        unavailableNow();
        return true;
      }
      return false;
    }

    function unavailableNow() {
      st.status = 'unavailable';
      if (opts.onUnavailable) opts.onUnavailable();
      renderAll();
    }

    function added(p) {
      if (!p || typeof p.id !== 'number') {
        load(false);
        return;
      }
      if (st.posts.some((x) => x.id === p.id)) return;
      st.total += 1;
      if (p.status !== 'hidden') st.count = (st.count ?? 0) + 1;
      emitCount();
      if (!asc) {
        // Newest first: everything below moves one place down on the server's pages.
        st.shift += 1;
        st.posts.unshift(p);
        const n = postEl(p);
        ui.list.prepend(n);
        n.classList.add('cm-focus');
      } else if (st.page >= st.pages) {
        // Oldest first: a new reply joins the end only when the end is on the page.
        st.posts.push(p);
        st.pages = Math.max(1, Math.ceil(st.total / PER_PAGE));
        st.page = st.pages;
        const n = postEl(p);
        ui.list.append(n);
        n.classList.add('cm-focus');
      } else {
        st.flash = p.id;
        renderFlash();
      }
      renderState();
      renderMore();
    }

    function removed(p) {
      st.posts = st.posts.filter((x) => x.id !== p.id);
      const n = els.get(p.id);
      // The focus moves to the neighbouring post (or the thread) instead of getting lost.
      const next = n && (n.nextElementSibling || n.previousElementSibling);
      if (n) n.remove();
      els.delete(p.id);
      // The posts after it move one place up on the server's pages (see load()).
      st.shift -= 1;
      const to = next || root;
      to.tabIndex = -1;
      to.focus({ preventScroll: true });
      st.total = Math.max(0, st.total - 1);
      if (p.status !== 'hidden' && st.count !== null) st.count = Math.max(0, st.count - 1);
      emitCount();
      renderState();
    }

    function redraw(pid) {
      const p = st.posts.find((x) => x.id === pid);
      const old = els.get(pid);
      if (!p || !old) return null;
      const n = postEl(p);
      old.replaceWith(n);
      return n;
    }

    // Only one inline form per kind at a time: switching redraws the old and the new post.
    function mode(field, pid) {
      const prev = st[field];
      st[field] = pid;
      if (prev && prev !== pid) redraw(prev);
      if (pid) {
        const n = redraw(pid);
        const f = n && n.querySelector('textarea, input, .btn-danger');
        if (f) f.focus();
      } else if (prev) {
        // The inline form closed: back to the button that opened it.
        focusPost(els.get(prev), ACT[field]);
      }
    }

    // After a post was drawn again the focus goes to its `act` control (data-act), another of its
    // buttons, the "report sent" note, or the post itself — never lost to the page.
    function focusPost(n, act) {
      if (!n || !n.isConnected) return;
      const to =
        (act && n.querySelector(`.cm-actions [data-act="${act}"]`)) ||
        n.querySelector('.cm-actions button, .cm-actions a[href]') ||
        n.querySelector('.cm-done') ||
        n;
      if (!to.matches('button, a[href]')) to.tabIndex = -1;
      to.focus();
    }

    function postEl(p) {
      const li = el('li', `cm-post${p.status === 'hidden' ? ' is-hidden' : ''}`);
      li.id = `${asc ? 'r' : 'c'}-${p.id}`;
      li.append(avatar(p.author));
      const body = el('div', 'cm-body');
      body.append(byline(p));
      if (st.editing === p.id) body.append(editForm(p));
      else body.append(textEl(p.content));
      const actions = postActions(p);
      if (actions) body.append(actions);
      if (st.reporting === p.id) {
        body.append(
          reportBox({
            draftKey: `report:${p.id}`,
            onCancel: () => mode('reporting', 0),
            onSend: async (reason) => {
              await request('POST', `/comments/${p.id}/report`, { reason });
              reported.add(p.id);
              st.reporting = 0;
              // The form had the focus; it moves to the "report sent" note that replaces it.
              focusPost(redraw(p.id), 'reported');
            },
          }),
        );
      }
      if (st.deleting === p.id) {
        body.append(
          confirmBox({
            text: t(`delete.${kind}`),
            onCancel: () => mode('deleting', 0),
            onYes: async () => {
              await request('DELETE', `/comments/${p.id}`);
              st.deleting = 0;
              removed(p);
            },
          }),
        );
      }
      li.append(body);
      els.set(p.id, li);
      return li;
    }

    function postActions(p) {
      const m = st.me || { signedIn: false };
      const own = p.own === true;
      const mod = m.moderator === true;
      const box = el('div', 'cm-actions');
      const busy = st.editing === p.id || st.deleting === p.id;
      const act = (name, text, onClick) => {
        const b = button(text, 'link-btn', onClick);
        b.dataset.act = name;
        box.append(b);
      };
      // Editing needs the thread open (moderators always may); authors can always delete what
      // they wrote, also in a closed topic or while new posts are switched off.
      if ((own || mod) && !busy && (mod || (writable() && !st.closed))) act('edit', t('edit'), () => mode('editing', p.id));
      if ((own || mod) && !busy) act('delete', t('delete'), () => mode('deleting', p.id));
      if (m.signedIn && !own && !mod && p.status !== 'hidden') {
        if (reported.has(p.id)) {
          const done = el('span', 'cm-done', t('reported'));
          done.setAttribute('role', 'status');
          done.dataset.act = 'reported';
          box.append(done);
        } else if (st.reporting !== p.id) act('report', t('report'), () => mode('reporting', p.id));
      }
      if (mod) {
        const a = el('a', 'link-btn', t('moderate'));
        a.href = moderateUrl('post', p.id);
        a.target = '_blank';
        a.rel = 'noopener';
        box.append(a);
      }
      return box.firstChild ? box : null;
    }

    function editForm(p) {
      const dk = `edit:${p.id}`;
      const form = el('form', 'cm-form cm-edit');
      form.noValidate = true;
      const fid = `cm-edit-${p.id}`;
      const label = el('label', 'field-label sr-only', t('edit.label'));
      label.htmlFor = fid;
      const ta = el('textarea', 'textarea cm-textarea');
      ta.id = fid;
      ta.rows = 4;
      ta.value = drafts.has(dk) ? drafts.get(dk) : p.content || '';
      const count = counter(ta, MAX.post);
      const err = errorBox();
      const save = el('button', 'btn btn-primary btn-sm', t('save'));
      save.type = 'submit';
      const foot = el('div', 'cm-form-foot');
      const buttons = el('div', 'cm-inline-row');
      buttons.append(
        save,
        button(t('cancel'), 'link-btn', () => {
          drafts.delete(dk);
          mode('editing', 0);
        }),
      );
      foot.append(count.el, buttons);
      ta.addEventListener('input', () => {
        drafts.set(dk, ta.value);
        err.clear();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if (text === String(p.content || '').trim()) {
          drafts.delete(dk);
          mode('editing', 0);
          return;
        }
        const bad = check(text, { max: MAX.post });
        if (bad) {
          err.show(errorText({ code: bad }));
          return;
        }
        save.disabled = true;
        save.textContent = t('saving');
        try {
          const next = await request('POST', `/comments/${p.id}`, { content: text });
          drafts.delete(dk);
          const i = st.posts.findIndex((x) => x.id === p.id);
          if (i >= 0 && next && typeof next.id === 'number') st.posts[i] = next;
          mode('editing', 0);
        } catch (ex) {
          if (st.dead) return;
          save.disabled = false;
          save.textContent = t('save');
          // The topic may have been closed or the feature switched off meanwhile: the composer
          // below changes to its note, and this form (still open, text kept) says why it failed.
          writeFailed(ex);
          err.show(errorText(ex));
        }
      });
      form.append(label, ta, err.el, foot);
      return form;
    }

    async function load(more) {
      const seq = ++st.seq;
      const page = more ? st.page + 1 : 1;
      if (more) {
        st.more = true;
        st.moreError = null;
        renderMore();
      } else {
        st.status = 'loading';
        renderState();
        renderMore();
      }
      const ask = (n) => {
        const q = new URLSearchParams({ page: String(n), per_page: String(PER_PAGE) });
        if (!asc) q.set('order', 'desc');
        return request('GET', `${listPath}?${q}`);
      };
      const listOf = (d) => (Array.isArray(d.comments) ? d.comments : Array.isArray(d.replies) ? d.replies : []);
      try {
        // Posts deleted here moved later ones up onto pages already loaded; without asking for
        // those pages again, "Show more" would skip them (duplicates are dropped below).
        const earlier = [];
        if (more && st.shift < 0) {
          for (let n = Math.max(1, st.page - Math.ceil(-st.shift / PER_PAGE) + 1); n <= st.page; n++) {
            earlier.push(...listOf(await ask(n)));
            if (seq !== st.seq || st.dead) return false;
          }
        }
        const data = await ask(page);
        if (seq !== st.seq || st.dead) return false;
        const seen = new Set(more ? st.posts.map((x) => x.id) : []);
        const list = [...earlier, ...listOf(data)].filter((p) => p && typeof p.id === 'number' && !seen.has(p.id) && seen.add(p.id));
        st.shift = 0;
        st.page = Number(data.page) || page;
        st.pages = Math.max(1, Number(data.pages) || 1);
        st.total = Number(data.total) || 0;
        if (typeof data.count === 'number') st.count = data.count;
        else if (!more) st.count = st.total;
        if (typeof data.open === 'boolean') st.open = data.open;
        st.status = 'idle';
        st.more = false;
        if (more) {
          st.posts.push(...list);
          for (const p of list) ui.list.append(postEl(p));
          renderState();
          renderMore();
          if (st.flash && els.has(st.flash)) {
            st.flash = 0;
            renderFlash();
          }
        } else {
          st.posts = list;
          renderPosts();
        }
        emitCount();
        return true;
      } catch (e) {
        if (seq !== st.seq || st.dead) return false;
        st.more = false;
        if (e.code === 'kw_unavailable') {
          unavailableNow();
        } else if (more) {
          st.moreError = e;
          renderMore();
        } else {
          st.status = 'error';
          st.error = e;
          renderPosts();
        }
        return false;
      }
    }

    // Loads pages until the post is there (at most 10), then scrolls to it and highlights it.
    async function jumpTo(pid) {
      for (let i = 0; i < 10 && !els.has(pid) && st.page < st.pages && !st.dead; i++) {
        if (!(await load(true))) break;
      }
      const n = els.get(pid);
      if (!n) return false;
      if (st.flash === pid) {
        st.flash = 0;
        renderFlash();
      }
      n.classList.remove('cm-focus');
      void n.offsetWidth;
      n.classList.add('cm-focus');
      n.tabIndex = -1;
      n.focus({ preventScroll: true });
      n.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return true;
    }

    const unsub = onMe((m, prev) => {
      if (st.dead) return;
      st.me = m;
      const who = (x) => [x.signedIn, x.name, x.moderator].join('|');
      if (who(m) !== who(prev)) load(false);
      else renderAll();
    });

    const handle = {
      root,
      // Redraws in the current language (drafts and loaded posts stay).
      render: renderAll,
      reload: () => load(false),
      // {open, closed, blocked} changed on the page (a moderator closed the topic, for example).
      update(o) {
        if ('open' in o) st.open = o.open;
        if ('closed' in o) st.closed = !!o.closed;
        if ('blocked' in o) st.blocked = !!o.blocked;
        renderAll();
      },
      jumpTo,
      destroy() {
        st.dead = true;
        unsub();
        root.remove();
      },
    };

    renderAll();
    me().then(async (m) => {
      if (st.dead) return;
      st.me = m;
      renderAll();
      await load(false);
      if (opts.focus && !st.dead) jumpTo(Number(opts.focus));
    });
    return handle;
  }

  window.KadroCommunity = {
    MAX,
    PER_PAGE,
    config,
    me,
    refreshMe,
    onMe,
    request,
    errorText,
    isUnavailable: () => unavailable,
    thread,
    // helpers for the page scripts
    lang,
    t,
    tn,
    plural,
    el,
    fill,
    button,
    liveLink,
    linkify,
    textEl,
    parseDate,
    when,
    fullDate,
    timeEl,
    avatar,
    badge,
    byline,
    check,
    counter,
    errorBox,
    reportBox,
    confirmBox,
    gate,
    note,
    drafts,
    signInUrl,
    joinUrl,
    accountUrl,
    moderateUrl,
    base,
    len,
  };
})();

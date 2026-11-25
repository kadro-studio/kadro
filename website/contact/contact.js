// Feedback form: sends a message to the workshop site (POST kadro/v1/feedback), which keeps it in its
// admin and mails it to the administrator. No account needed; when signed in, the account is noted.
// If the form cannot send (the workshop is closed or not updated yet), it points to GitHub issues
// and keeps what was typed.
(function () {
  const C = window.KadroCommunity;
  const site = window.KADRO_SITE;
  const T = {
    uk: {
      'doc.title': 'Зворотний зв’язок — Kadro',
      'nav.features': 'Можливості',
      'nav.workshop': 'Майстерня',
      'nav.forum': 'Форум',
      'nav.support': 'Підтримати',
      'nav.faq': 'Питання',
      'nav.download': 'Завантажити',
      'footer.forum': 'Форум',
      'footer.contact': 'Зворотний зв’язок',
      'footer.source': 'Вихідний код',
      'footer.issues': 'Повідомити про помилку',
      'footer.privacy': 'Приватність',
      title: 'Зворотний зв’язок',
      lead: 'Питання, ідея чи щось не працює? Напишіть нам — ми читаємо кожне повідомлення. Акаунт для цього не потрібен.',
      name: 'Ім’я',
      optional: '(необов’язково)',
      email: 'E-mail',
      emailHint: 'Якщо хочете отримати відповідь.',
      topic: 'Тема',
      'topic.question': 'Питання',
      'topic.bug': 'Помилка',
      'topic.idea': 'Ідея',
      'topic.workshop': 'Майстерня',
      'topic.other': 'Інше',
      message: 'Повідомлення',
      messagePh: 'Опишіть, що сталося або що ви пропонуєте. Якщо це помилка — що ви робили, що побачили і яка у вас версія Kadro.',
      consent: 'Надсилаючи повідомлення, ви погоджуєтеся, що ми збережемо його, як описано в {privacy}.',
      privacy: 'політиці приватності',
      send: 'Надіслати',
      sending: 'Надсилання…',
      thanks: 'Дякуємо! Повідомлення надіслано.',
      thanksReply: 'Якщо буде потрібно, ми відповімо на вказаний e-mail.',
      thanksNoReply: 'Ви не вказали e-mail, тож відповісти не зможемо, але повідомлення обов’язково прочитаємо.',
      again: 'Написати ще',
      other: 'Інші способи',
      'other.forum': 'Форум',
      'other.forumText': 'поставте питання спільноті або поділіться ідеєю.',
      'other.issues': 'GitHub Issues',
      'other.issuesText': 'для помилок, якщо у вас є акаунт GitHub. Повідомлення там бачать усі.',
      off: 'Форма зараз не працює. Повідомити про помилку чи запропонувати ідею можна в {github}.',
      offKeep: 'Ваш текст лишився у формі — його можна скопіювати.',
    },
    ru: {
      'doc.title': 'Обратная связь — Kadro',
      'nav.features': 'Возможности',
      'nav.workshop': 'Мастерская',
      'nav.forum': 'Форум',
      'nav.support': 'Поддержать',
      'nav.faq': 'Вопросы',
      'nav.download': 'Скачать',
      'footer.forum': 'Форум',
      'footer.contact': 'Обратная связь',
      'footer.source': 'Исходный код',
      'footer.issues': 'Сообщить об ошибке',
      'footer.privacy': 'Конфиденциальность',
      title: 'Обратная связь',
      lead: 'Вопрос, идея или что-то не работает? Напишите нам — мы читаем каждое сообщение. Аккаунт для этого не нужен.',
      name: 'Имя',
      optional: '(необязательно)',
      email: 'E-mail',
      emailHint: 'Если хотите получить ответ.',
      topic: 'Тема',
      'topic.question': 'Вопрос',
      'topic.bug': 'Ошибка',
      'topic.idea': 'Идея',
      'topic.workshop': 'Мастерская',
      'topic.other': 'Другое',
      message: 'Сообщение',
      messagePh: 'Опишите, что случилось или что вы предлагаете. Если это ошибка — что вы делали, что увидели и какая у вас версия Kadro.',
      consent: 'Отправляя сообщение, вы соглашаетесь, что мы сохраним его, как описано в {privacy}.',
      privacy: 'политике конфиденциальности',
      send: 'Отправить',
      sending: 'Отправка…',
      thanks: 'Спасибо! Сообщение отправлено.',
      thanksReply: 'Если понадобится, мы ответим на указанный e-mail.',
      thanksNoReply: 'Вы не указали e-mail, поэтому ответить мы не сможем, но сообщение обязательно прочитаем.',
      again: 'Написать ещё',
      other: 'Другие способы',
      'other.forum': 'Форум',
      'other.forumText': 'задайте вопрос сообществу или поделитесь идеей.',
      'other.issues': 'GitHub Issues',
      'other.issuesText': 'для ошибок, если у вас есть аккаунт GitHub. Сообщения там видят все.',
      off: 'Форма сейчас не работает. Сообщить об ошибке или предложить идею можно в {github}.',
      offKeep: 'Ваш текст остался в форме — его можно скопировать.',
    },
    en: {
      'doc.title': 'Feedback — Kadro',
      'nav.features': 'Features',
      'nav.workshop': 'Workshop',
      'nav.forum': 'Forum',
      'nav.support': 'Support',
      'nav.faq': 'FAQ',
      'nav.download': 'Download',
      'footer.forum': 'Forum',
      'footer.contact': 'Feedback',
      'footer.source': 'Source code',
      'footer.issues': 'Report a bug',
      'footer.privacy': 'Privacy',
      title: 'Feedback',
      lead: 'A question, an idea, or something doesn’t work? Write to us — we read every message. No account needed.',
      name: 'Name',
      optional: '(optional)',
      email: 'E-mail',
      emailHint: 'If you would like a reply.',
      topic: 'Topic',
      'topic.question': 'Question',
      'topic.bug': 'Bug',
      'topic.idea': 'Idea',
      'topic.workshop': 'Workshop',
      'topic.other': 'Other',
      message: 'Message',
      messagePh: 'Tell us what happened or what you suggest. For a bug: what you did, what you saw, and your Kadro version.',
      consent: 'By sending the message, you agree that we keep it as described in the {privacy}.',
      privacy: 'privacy policy',
      send: 'Send',
      sending: 'Sending…',
      thanks: 'Thank you! Your message is sent.',
      thanksReply: 'If needed, we’ll reply to the e-mail address you gave.',
      thanksNoReply: 'You didn’t give an e-mail address, so we can’t reply, but we will certainly read it.',
      again: 'Write another',
      other: 'Other ways',
      'other.forum': 'Forum',
      'other.forumText': 'ask the community or share an idea.',
      'other.issues': 'GitHub Issues',
      'other.issuesText': 'for bugs, if you have a GitHub account. Everything there is public.',
      off: 'The form isn’t working right now. You can report a bug or suggest an idea in {github}.',
      offKeep: 'Your text is still in the form — you can copy it.',
    },
  };
  const TOPICS = ['question', 'bug', 'idea', 'workshop', 'other'];

  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const nameEl = $('ct-name');
  const emailEl = $('ct-email');
  const topicEl = $('ct-topic');
  const messageEl = $('ct-message');
  const hpEl = $('ct-website');
  const errorEl = $('ct-error');
  const sendEl = $('ct-send');
  const done = $('done');
  const off = $('off');
  const state = { lang: 'uk', off: false, keep: false, sending: false };
  const t = (key) => T[state.lang][key] ?? T.en[key] ?? key;

  const gh = site.repo ? `https://github.com/${site.repo}` : '';
  const issues = site.links.issues || (gh && `${gh}/issues`);
  const apiParam = new URLSearchParams(location.search).get('api');

  const count = C.counter(messageEl, 3000);
  $('ct-count').replaceWith(count.el);
  count.el.id = 'ct-count';

  function showError(text) {
    errorEl.textContent = text || '';
    errorEl.hidden = !text;
  }

  // The form cannot send: point to GitHub issues; `keep` leaves the form (and the text) in place.
  function showOff(keep) {
    state.off = true;
    state.keep = keep;
    off.hidden = false;
    form.hidden = !keep;
    $('off-keep').hidden = !keep || !messageEl.value.trim();
    drawOff();
    showError('');
  }

  function drawOff() {
    const p = $('off-text');
    const a = document.createElement('a');
    a.href = issues;
    a.textContent = 'GitHub Issues';
    p.replaceChildren(C.fill(t('off'), { github: a }));
  }

  function drawConsent() {
    const a = document.createElement('a');
    a.href = `../privacy/?lang=${state.lang}`;
    a.textContent = t('privacy');
    $('ct-consent').replaceChildren(C.fill(t('consent'), { privacy: a }));
  }

  // The page the visitor came from on this site (without the hash), or this page.
  function fromPage() {
    try {
      const r = new URL(document.referrer);
      if (r.origin === location.origin && r.pathname !== location.pathname) {
        r.searchParams.delete('api');
        return r.href.slice(0, 300);
      }
    } catch {
      // no referrer
    }
    return `${location.origin}${location.pathname}`.slice(0, 300);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.sending) return;
    const message = messageEl.value.trim();
    const email = emailEl.value.trim();
    const n = C.len(message);
    if (n < 10 || n > 3000) {
      showError(C.errorText({ code: 'kw_message' }));
      messageEl.focus();
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError(C.errorText({ code: 'kw_email' }));
      emailEl.focus();
      return;
    }
    state.sending = true;
    sendEl.disabled = true;
    sendEl.textContent = t('sending');
    showError('');
    try {
      // No account is needed: if the session ended since the page was opened (or another account
      // is signed in now), the message goes anonymously instead of asking to sign in again.
      await C.request(
        'POST',
        '/feedback',
        {
          name: nameEl.value.trim().slice(0, 80),
          email,
          topic: TOPICS.includes(topicEl.value) ? topicEl.value : 'other',
          message,
          page: fromPage(),
          lang: state.lang,
          website: hpEl.value,
        },
        { anonOk: true },
      );
      // Sent: only now is the text cleared.
      messageEl.value = '';
      count.update();
      form.hidden = true;
      off.hidden = true;
      state.off = false;
      done.hidden = false;
      $('done-note').textContent = t(email ? 'thanksReply' : 'thanksNoReply');
      $('done-title').focus();
    } catch (ex) {
      if (ex.code === 'kw_off' || ex.code === 'kw_unavailable') showOff(true);
      else showError(C.errorText(ex));
    } finally {
      state.sending = false;
      sendEl.disabled = false;
      sendEl.textContent = t('send');
    }
  });

  messageEl.addEventListener('input', () => showError(''));
  emailEl.addEventListener('input', () => showError(''));

  $('again').addEventListener('click', () => {
    done.hidden = true;
    form.hidden = false;
    messageEl.focus();
  });

  function applyLang(lang) {
    state.lang = lang;
    document.documentElement.lang = lang;
    $('lang').value = lang;
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(n.dataset.i18nPlaceholder);
    document.title = t('doc.title');
    drawConsent();
    if (state.off) drawOff();
    count.update();
    try {
      localStorage.setItem('kadro.lang', lang);
    } catch {
      // private mode
    }
  }

  // Footer and "other ways" links; the forum link keeps ?api= on a local copy.
  for (const a of document.querySelectorAll('[data-link]')) {
    const url = a.dataset.link === 'issues' ? issues : a.dataset.link === 'source' ? site.links.source || gh : '';
    if (url) a.href = url;
    else a.hidden = true;
  }
  if (apiParam) {
    for (const a of document.querySelectorAll('a[href^="../forum/"]')) a.href = `../forum/?api=${encodeURIComponent(apiParam)}`;
  }

  $('lang').addEventListener('change', (e) => applyLang(e.target.value));
  let saved = null;
  try {
    saved = localStorage.getItem('kadro.lang');
  } catch {
    // private mode
  }
  const nav = navigator.language?.toLowerCase() ?? '';
  const params = new URLSearchParams(location.search);
  const known = (x) => ['uk', 'ru', 'en'].includes(x);
  const asked = params.get('lang');
  applyLang(known(asked) ? asked : known(saved) ? saved : nav.startsWith('uk') ? 'uk' : nav.startsWith('ru') ? 'ru' : 'en');
  // Links may pick the topic: /contact/?topic=bug
  if (TOPICS.includes(params.get('topic'))) topicEl.value = params.get('topic');
  if (params.has('lang')) {
    params.delete('lang');
    const rest = params.toString();
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  }

  // The workshop is closed (workshop.json): nothing can be sent, so only the GitHub link.
  // Signed in: the name is filled in (it can be changed or cleared).
  C.config().then((c) => {
    if (!c.open) {
      showOff(false);
      return;
    }
    C.me().then((m) => {
      if (m.signedIn && !m.nonce) showOff(false);
      else if (m.signedIn && !nameEl.value) nameEl.value = String(m.name || '').slice(0, 80);
    });
  });
})();

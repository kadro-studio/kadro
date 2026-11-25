// Privacy policy: shows the article in the chosen language (?lang=, then the saved choice, then
// the browser's) and fills in the contact from config.js.
(function () {
  const site = window.KADRO_SITE;
  const T = {
    uk: {
      title: 'Політика приватності — Kadro',
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
      contactPage: 'форма зворотного зв’язку',
    },
    ru: {
      title: 'Политика конфиденциальности — Kadro',
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
      contactPage: 'форма обратной связи',
    },
    en: {
      title: 'Privacy policy — Kadro',
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
      contactPage: 'the feedback form',
    },
  };

  const gh = site.repo ? `https://github.com/${site.repo}` : '';
  const issues = site.links.issues || (gh && `${gh}/issues`);
  const links = { source: site.links.source || gh, issues };
  for (const a of document.querySelectorAll('[data-link]')) {
    const url = links[a.dataset.link];
    if (url) a.href = url;
    else a.hidden = true;
  }

  // Requests about data go to the contact in config.js: a page of this site ("/contact/"), an
  // e-mail address, or, without either, GitHub issues.
  const contact = typeof site.contact === 'string' ? site.contact.trim() : '';
  const page = contact.startsWith('/') ? contact : '';
  const mail = !page && contact.includes('@') ? contact : '';
  for (const box of document.querySelectorAll('[data-contact]')) {
    const a = document.createElement('a');
    if (page) {
      const L = box.closest('article')?.lang;
      const lang = T[L] ? L : 'en';
      const url = new URL(page, location.href);
      url.searchParams.set('lang', lang);
      a.href = url.href;
      a.textContent = T[lang].contactPage;
    } else {
      a.href = mail ? `mailto:${mail}` : issues;
      a.textContent = mail || 'GitHub Issues';
    }
    box.replaceChildren(a);
  }
  // The hint about public issues is only for the GitHub fallback.
  for (const p of document.querySelectorAll('[data-contact-hint]')) p.hidden = !!(mail || page);

  function apply(lang) {
    for (const a of document.querySelectorAll('article[data-lang]')) a.hidden = a.dataset.lang !== lang;
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = T[lang][n.dataset.i18n];
    document.title = T[lang].title;
    document.documentElement.lang = lang;
    document.getElementById('lang').value = lang;
    try {
      localStorage.setItem('kadro.lang', lang);
    } catch {
      // private mode
    }
  }

  const known = (v) => (['uk', 'ru', 'en'].includes(v) ? v : null);
  let saved = null;
  try {
    saved = localStorage.getItem('kadro.lang');
  } catch {
    // private mode
  }
  const nav = navigator.language?.toLowerCase() ?? '';
  apply(
    known(new URLSearchParams(location.search).get('lang')) ||
      known(saved) ||
      (nav.startsWith('uk') ? 'uk' : nav.startsWith('ru') ? 'ru' : 'en'),
  );
  document.getElementById('lang').addEventListener('change', (e) => apply(e.target.value));
})();

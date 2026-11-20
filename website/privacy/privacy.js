// Privacy policy: shows the article in the chosen language (?lang=, then the saved choice, then
// the browser's) and fills in the contact from config.js.
(function () {
  const site = window.KADRO_SITE;
  const T = {
    uk: {
      title: 'Політика приватності — Kadro',
      'nav.features': 'Можливості',
      'nav.workshop': 'Майстерня',
      'nav.support': 'Підтримати',
      'nav.faq': 'Питання',
      'nav.download': 'Завантажити',
      'footer.source': 'Вихідний код',
      'footer.issues': 'Повідомити про помилку',
    },
    ru: {
      title: 'Политика конфиденциальности — Kadro',
      'nav.features': 'Возможности',
      'nav.workshop': 'Мастерская',
      'nav.support': 'Поддержать',
      'nav.faq': 'Вопросы',
      'nav.download': 'Скачать',
      'footer.source': 'Исходный код',
      'footer.issues': 'Сообщить об ошибке',
    },
    en: {
      title: 'Privacy policy — Kadro',
      'nav.features': 'Features',
      'nav.workshop': 'Workshop',
      'nav.support': 'Support',
      'nav.faq': 'FAQ',
      'nav.download': 'Download',
      'footer.source': 'Source code',
      'footer.issues': 'Report a bug',
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

  // Requests about data go to the e-mail in config.js; without one, to GitHub issues.
  const mail = typeof site.contact === 'string' && site.contact.includes('@') ? site.contact : '';
  for (const box of document.querySelectorAll('[data-contact]')) {
    const a = document.createElement('a');
    a.href = mail ? `mailto:${mail}` : issues;
    a.textContent = mail || 'GitHub Issues';
    box.replaceChildren(a);
  }
  for (const p of document.querySelectorAll('[data-contact-hint]')) p.hidden = !!mail;

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

// Kadro Animate page: language switch (shared with the Kadro pages) and download links from config.js.
(function () {
  const site = window.KADRO_SITE;
  const anim = site.animate;

  const EN = {
    'nav.features': 'Features',
    'nav.assistant': 'Assistant',
    'nav.faq': 'FAQ',
    'nav.kadro': 'Kadro video editor',
    'nav.open': 'Open',
    'hero.badge': 'Kadro family · version <span data-version></span>',
    'hero.title': 'Frame-by-frame 2D animation right in your browser',
    'hero.lead':
      'Kadro Animate is a free hand-drawn animation editor: pressure-sensitive brushes, layers with keys, onion skin, camera and sound, plus a smart animator’s assistant. It runs in the browser with nothing to install, or as a Windows app.',
    'cta.open': 'Open in the browser',
    'cta.installer': 'Download for Windows',
    'cta.meta': 'Chrome, Edge or Firefox — or Windows 10 / 11 · about 2 MB · no sign-up',
    'strip.1': 'Free',
    'strip.2': 'No sign-up',
    'strip.3': 'Works offline',
    'strip.4': 'Pen pressure',
    'strip.5': 'Projects stay on your disk',
    'features.title': 'Everything for hand-drawn animation',
    'features.lead': 'The habits you know from Animate and Clip Studio — and tools they don’t have.',
    'f1.t': 'Brushes by kind',
    'f1.d': 'Pens and ink, pencils, brushes, airbrush and effects — each is its own tool with presets. Pressure, paper grain, stroke taper and a stabiliser.',
    'f2.t': 'Keys and exposure',
    'f2.d': 'Layers with keys as in Animate: F5, F6, F7, cell blocks, moving and copying frames, onion skin of neighbouring drawings and a seamless one for cycles.',
    'f3.t': 'Smart in-between',
    'f3.d': 'An in-between ghost blends the neighbouring drawings by position and size, and the timing chart spaces in-betweens with ease-in and ease-out.',
    'f4.t': 'Flipping',
    'f4.d': 'Hold the ` key and move the pen — frames flip like paper in your hand. Let go and you are back on your frame.',
    'f5.t': 'Arcs and pops',
    'f5.d': 'A motion arc through the centres of the drawings, a silhouette check, smear frames and a search for frames where the animation jitters.',
    'f6.t': 'One-click colouring',
    'f6.d': 'Flat fill of every area, colours carried over to the next frames, auto shading and recolouring across the whole animation.',
    'f7.t': 'Camera and sound',
    'f7.d': 'Camera keys with smooth easing, camera shake, a sound track, auto lip-sync and markers tapped to the beat during playback.',
    'f8.t': 'Export anywhere',
    'f8.d': 'GIF, MP4 and WebM, PNG sequences and sprite sheets for games — through the camera or not, with a transparent background.',
    'f9.t': 'Made for tablets',
    'f9.d': 'The tablet ring rotates the canvas, a held wheel scrubs the history, and any button can be assigned in the tablet tester.',
    'as.title': 'The animator’s assistant',
    'as.p1':
      'More than twenty helpers take over the routine: in-betweens, colouring, cycles, lip-sync, camera shake, cleanup and silhouette outlines. Each one undoes in a single Ctrl+Z.',
    'as.p2': 'A built-in self-test runs more than eight hundred automated checks inside the app, so every release is tested.',
    'kadro.title': 'Also in the family: the Kadro video editor',
    'kadro.lead': 'Cut your finished animation with sound, titles and effects — also free and without watermarks.',
    'kadro.open': 'More about Kadro',
    'faq.title': 'Questions',
    q1: 'How is the browser version different from the app?',
    a1: 'The features are the same. The Windows app adds system open and save dialogs, a menu, keyboard shortcuts without browser limits and opening .inkf projects with a double click.',
    q2: 'Where is my work stored?',
    a2: 'On your computer: projects are saved as .inkf files. The browser also keeps an autosave in case of a crash. Nothing is sent over the network.',
    q3: 'Which tablet do I need?',
    a3: 'Any that works with a pen in Windows or the browser: Wacom, Huion, XP-Pen and others. Pressure works right away, and buttons and the ring can be assigned in Help → “Tablet and key tester”.',
    q4: 'Windows says “Windows protected your PC”. What do I do?',
    a4: 'That is how SmartScreen treats new programs without a paid code-signing certificate. Click “More info” → “Run anyway”.',
    q5: 'What language is the interface in?',
    a5: 'Ukrainian, Russian and English. The browser version opens in the language of the site, the Windows app in the language of the system, and you can change it in View → Language or File → Settings.',
    q6: 'Is it really free?',
    a6: 'Yes, just like Kadro: no subscriptions, trials, watermarks or account. Everything you draw is yours.',
    'footer.kadro': 'Kadro video editor',
    'footer.releases': 'All versions',
    'footer.issues': 'Report a bug',
    'footer.note': 'Free. In the browser and on Windows 10 / 11.',
  };
  const UK = {
    'nav.features': 'Можливості',
    'nav.assistant': 'Асистент',
    'nav.faq': 'Питання',
    'nav.kadro': 'Відеоредактор Kadro',
    'nav.open': 'Відкрити',
    'hero.badge': 'Родина Kadro · версія <span data-version></span>',
    'hero.title': 'Покадрова 2D-анімація просто в браузері',
    'hero.lead':
      'Kadro Animate — безкоштовний редактор мальованої анімації: пензлі з натиском пера, шари з ключами, калька, камера і звук, а ще розумний асистент аніматора. Працює в браузері без встановлення і як програма для Windows.',
    'cta.open': 'Відкрити в браузері',
    'cta.installer': 'Завантажити для Windows',
    'cta.meta': 'Chrome, Edge або Firefox — чи Windows 10 / 11 · близько 2 МБ · без реєстрації',
    'strip.1': 'Безкоштовно',
    'strip.2': 'Без реєстрації',
    'strip.3': 'Працює офлайн',
    'strip.4': 'Натиск пера',
    'strip.5': 'Проєкти на вашому диску',
    'features.title': 'Усе для мальованої анімації',
    'features.lead': 'Звичні прийоми Animate і Clip Studio — та інструменти, яких там немає.',
    'f1.t': 'Пензлі за видами',
    'f1.d': 'Пера й туш, олівці, пензлі, аерограф і ефекти — у кожного свій інструмент із пресетами. Натиск, зерно паперу, звуження штриха і стабілізатор.',
    'f2.t': 'Ключі та експозиція',
    'f2.d': 'Шари з ключами, як в Animate: F5, F6, F7, блоки клітинок, перенесення й копіювання кадрів, калька на сусідні малюнки й безшовна калька для циклів.',
    'f3.t': 'Розумний проміжок',
    'f3.d': 'Привид інбетвіну зводить сусідні малюнки в середину за положенням і розміром, а шкала фаз розставляє проміжки з розгоном і гальмуванням.',
    'f4.t': 'Перегортання',
    'f4.d': 'Затисніть клавішу ` і водіть пером — кадри перегортаються, як папір у руці. Відпустіть — повернетеся до свого кадру.',
    'f5.t': 'Траєкторії та стрибки',
    'f5.d': 'Дуга руху через центри малюнків, перевірка силуету, змаз-кадри й пошук місць, де анімація «смикається».',
    'f6.t': 'Розфарбування в один клік',
    'f6.d': 'Пласка заливка всіх областей, перенесення кольорів на наступні кадри, автотіні й перефарбування в усій анімації.',
    'f7.t': 'Камера і звук',
    'f7.d': 'Ключі камери з плавними переходами, трясіння, звукова доріжка, автоліпсинк і мітки, відбиті в ритм просто під час відтворення.',
    'f8.t': 'Експорт куди завгодно',
    'f8.d': 'GIF, MP4 і WebM, PNG-послідовність і спрайт-лист для ігор — через камеру чи без, із прозорим тлом.',
    'f9.t': 'Створений для планшета',
    'f9.d': 'Кільце планшета повертає полотно, затиснуте колесо гортає історію, а будь-яку кнопку можна призначити в «Перевірці планшета».',
    'as.title': 'Асистент аніматора',
    'as.p1':
      'Понад двадцять помічників, які беруть на себе рутину: проміжки, розфарбування, цикли, ліпсинк, трясіння камери, очищення сміття й обведення силуету. Кожен скасовується одним кроком Ctrl+Z.',
    'as.p2': 'Вбудована самоперевірка запускає понад вісімсот автотестів просто в програмі, тож редактор перевірено в кожному випуску.',
    'kadro.title': 'Ще в родині: відеоредактор Kadro',
    'kadro.lead': 'Змонтуйте готову анімацію зі звуком, титрами й ефектами — теж безкоштовно й без водяних знаків.',
    'kadro.open': 'Докладніше про Kadro',
    'faq.title': 'Питання',
    q1: 'Чим версія в браузері відрізняється від програми?',
    a1: 'Можливості однакові. У програмі для Windows — системні вікна відкриття й збереження, меню, гарячі клавіші без обмежень браузера та відкриття проєктів .inkf подвійним клацанням.',
    q2: 'Де зберігаються мої роботи?',
    a2: 'На вашому комп’ютері: проєкти зберігаються у файли .inkf. Браузер ще робить автозбереження на випадок збою. Нічого не надсилається в мережу.',
    q3: 'Який потрібен планшет?',
    a3: 'Будь-який, що працює з пером у Windows або браузері: Wacom, Huion, XP-Pen та інші. Натиск працює одразу, а кнопки й кільце можна призначити в Довідка → «Перевірка планшета і клавіш».',
    q4: 'Windows пише «Систему Windows захищено». Що робити?',
    a4: 'Так SmartScreen реагує на нові програми без платного цифрового підпису. Натисніть «Докладніше» → «Усе одно запустити».',
    q5: 'Якою мовою інтерфейс?',
    a5: 'Українською, російською та англійською. Версія в браузері відкривається мовою сайту, програма для Windows — мовою системи, а змінити мову можна в меню Вигляд → Мова або Файл → Налаштування.',
    q6: 'Це справді безкоштовно?',
    a6: 'Так, як і Kadro: без підписок, пробних періодів, водяних знаків і облікового запису. Усе, що ви намалювали, належить вам.',
    'footer.kadro': 'Відеоредактор Kadro',
    'footer.releases': 'Усі версії',
    'footer.issues': 'Повідомити про помилку',
    'footer.note': 'Безкоштовно. У браузері та на Windows 10 / 11.',
  };
  const SOON = { ru: 'скоро', uk: 'незабаром', en: 'coming soon' };
  const DOWNLOADS = { uk: 'Завантажень: {n}', ru: 'Скачиваний: {n}', en: 'Downloads: {n}' };
  const LOCALE = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-US' };

  // Original (Russian) texts are kept from the markup.
  const nodes = [...document.querySelectorAll('[data-i18n]')];
  const RU = Object.fromEntries(nodes.map((n) => [n.dataset.i18n, n.innerHTML]));

  const links = { ...(anim.links ?? {}) };
  if (site.repo) {
    const gh = `https://github.com/${site.repo}`;
    links.installer ||= `${gh}/releases/download/${anim.tag}/Kadro-Animate-Setup-${anim.version}.exe`;
    links.releases ||= `${gh}/releases/tag/${anim.tag}`;
    links.issues ||= `${gh}/issues`;
  }

  function stored() {
    try {
      return localStorage.getItem('kadro.lang');
    } catch {
      return null;
    }
  }

  function apply(lang) {
    const dict = lang === 'en' ? EN : lang === 'uk' ? UK : RU;
    for (const n of nodes) {
      const v = dict[n.dataset.i18n];
      if (v !== undefined) n.innerHTML = v;
    }
    for (const v of document.querySelectorAll('[data-version]')) v.textContent = anim.version;
    document.documentElement.lang = lang;
    document.getElementById('lang').value = lang;
    const soon = SOON[lang] ?? SOON.en;
    for (const a of document.querySelectorAll('[data-link]')) {
      const url = links[a.dataset.link];
      a.href = url || '#download';
      a.classList.toggle('disabled', !url);
      if (url) a.removeAttribute('title');
      else a.title = soon;
    }
    // The web version opens in the language chosen here; screenshots show the interface in it.
    for (const a of document.querySelectorAll('[data-app]')) a.href = `app/?lang=${lang}`;
    for (const img of document.querySelectorAll('[data-shot]')) img.src = `../assets/${img.dataset.shot}-${lang}.webp`;
    renderDownloads(lang);
    try {
      localStorage.setItem('kadro.lang', lang);
    } catch {
      // private mode
    }
  }

  // Download counter for the Kadro Animate installers only, kept for an hour (GitHub API limit).
  let downloads = null;
  const DL_KEY = 'kadro.animate.downloads';

  function renderDownloads(lang) {
    const el = document.getElementById('downloads');
    if (downloads == null || downloads < 1) return;
    el.textContent = (DOWNLOADS[lang] ?? DOWNLOADS.en).replace('{n}', downloads.toLocaleString(LOCALE[lang] ?? 'en-US'));
    el.hidden = false;
  }

  async function loadDownloads() {
    if (!site.repo) return;
    try {
      const cached = JSON.parse(localStorage.getItem(DL_KEY) ?? 'null');
      if (cached && Date.now() - cached.at < 3600000) {
        downloads = cached.n;
        return;
      }
    } catch {
      // private mode
    }
    try {
      const r = await fetch(`https://api.github.com/repos/${site.repo}/releases?per_page=100`);
      if (!r.ok) return;
      const releases = await r.json();
      downloads = releases
        .flatMap((rel) => rel.assets)
        .filter((a) => a.name.startsWith('Kadro-Animate') && a.name.endsWith('.exe'))
        .reduce((s, a) => s + a.download_count, 0);
      try {
        localStorage.setItem(DL_KEY, JSON.stringify({ n: downloads, at: Date.now() }));
      } catch {
        // private mode
      }
    } catch {
      // offline or rate-limited: the counter just stays hidden
    }
  }

  const nav = navigator.language?.toLowerCase() ?? '';
  const saved = stored();
  const initial = ['uk', 'ru', 'en'].includes(saved) ? saved : nav.startsWith('uk') ? 'uk' : nav.startsWith('ru') ? 'ru' : 'en';
  apply(initial);
  loadDownloads().then(() => renderDownloads(document.documentElement.lang));
  document.getElementById('lang').addEventListener('change', (e) => apply(e.target.value));
})();

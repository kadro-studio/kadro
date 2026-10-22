// Language switch, download/donation links from config.js.
(function () {
  const site = window.KADRO_SITE;

  const EN = {
    'nav.features': 'Features',
    'nav.free': 'Free forever',
    'nav.support': 'Support',
    'nav.faq': 'FAQ',
    'nav.download': 'Download',
    'hero.badge': 'Open source · MIT · version <span data-version></span>',
    'hero.title': 'Video editing without watermarks, subscriptions or licences',
    'hero.lead':
      'Kadro is a free video editor for Windows. Everything others charge for — a multi-track timeline, colour grading, chroma key, AI subtitles and background removal — available to everyone, for good.',
    'cta.installer': 'Download for Windows',
    'cta.portable': 'Portable version',
    'cta.meta': 'Windows 10 / 11 · 64-bit · about 160 MB · no sign-up',
    'strip.1': 'No watermarks',
    'strip.2': 'No sign-up',
    'strip.3': 'No subscription',
    'strip.4': 'Works offline',
    'strip.5': 'Open source',
    'features.title': 'Professional-grade tools',
    'features.lead': 'What usually hides behind expensive plans is in Kadro from day one.',
    'f1.t': 'A real timeline',
    'f1.d': 'Unlimited tracks, ripple, roll, slip and slide edits, cutting at scene changes, beat markers, track solo and lock.',
    'f2.t': 'Studio-grade colour',
    'f2.d': 'Colour wheels, RGB curves, HSL selective colour, LUTs (.cube), 18 blend modes, video scopes, chroma key and masks.',
    'f3.t': 'AI on your own computer',
    'f3.d': 'Auto subtitles and background removal run locally: no cloud, no credits, your videos never leave your PC.',
    'f4.t': 'Clean sound',
    'f4.d': 'Noise reduction, EBU R128 loudness normalisation, music ducking under speech, EQ, compressor and voice-over recording.',
    'f5.t': 'Effects and mods',
    'f5.d': 'Shader effects and transitions, animated overlays and backgrounds, stickers, stabilisation, picture-in-picture and your own GLSL mods.',
    'f7.t': 'Online library',
    'f7.d': 'Free video, photos, music and sound effects right inside the app — with authors and licences saved in the project.',
    'f8.t': 'Titles and fonts',
    'f8.d': '24 bundled fonts with Cyrillic, 22 title styles, gradients, outlines, shadows and entrance animations.',
    'f9.t': 'Make it yours',
    'f9.d': 'Five themes including a light one, any accent colour, interface scale. Ukrainian, Russian and English.',
    'f6.t': 'Fast export',
    'f6.d': 'NVENC, Quick Sync and AMF hardware encoding. MP4, WebM, ProRes, GIF — up to 4K.',
    'shot2.caption': '4K footage edits smoothly: lightweight copies are made automatically, and video scopes show the colour of every frame.',
    'free.title': 'Free means free',
    'free.p1':
      'Kadro sells no licences and hides nothing behind a paid edition. No watermark on export, no trial period, no account. Everyone gets the same program.',
    'free.p2':
      'The source code is MIT-licensed: inspect it, change it, build it yourself. The app collects no data and works offline — the network is only needed once to download AI models, and for the online library.',
    'cmp.paid': 'Paid editors',
    'cmp.price': 'Price',
    'cmp.free': '$0',
    'cmp.sub': 'subscription or licence',
    'cmp.wm': 'Watermark',
    'cmp.no': 'none',
    'cmp.wmFree': 'in the free edition',
    'cmp.ai': 'AI features',
    'cmp.local': 'local, unlimited',
    'cmp.credits': 'cloud, paid credits',
    'cmp.acc': 'Account',
    'cmp.notNeeded': 'not needed',
    'cmp.needed': 'required',
    'cmp.code': 'Open source',
    'cmp.yes': 'yes',
    'cmp.no2': 'no',
    'support.title': 'Support the project',
    'support.lead': 'Donations are voluntary and unlock nothing — everyone has the same app. They buy more time for new features.',
    'support.other': 'You can also help for free: tell others about Kadro, report a bug or make a mod.',
    'support.soon': 'coming soon',
    'faq.title': 'Questions',
    q1: 'Is it really free? What’s the catch?',
    a1: 'There is no catch. Kadro is an open-source project supported voluntarily by its users.',
    q2: 'Windows says “Windows protected your PC”. What do I do?',
    a2: 'That is how SmartScreen treats new programs without a paid code-signing certificate. Click “More info” → “Run anyway”. The source is open and you can build the installer yourself.',
    q3: 'Do I need the internet?',
    a3: 'No. Only the first time you use an AI feature does the app download its model once (40–250 MB), and the online library of course needs a connection.',
    q4: 'Which systems are supported?',
    a4: 'Windows 10 and 11 (64-bit). macOS and Linux builds are planned.',
    q5: 'Can I use it for commercial work?',
    a5: 'Yes. Everything you edit is yours, with no royalties or marks.',
    q6: 'How do I make my own effect?',
    a6: 'Effects, transitions and animated elements are written in GLSL in .vrmod files. See MODS.md in the repository.',
    'footer.source': 'Source code',
    'footer.releases': 'All releases',
    'footer.issues': 'Report a bug',
    'footer.note': 'MIT. FFmpeg is used as a separate program under its own licence.',
  };
  const UK = {
    "nav.features": "Можливості",
    "nav.free": "Безкоштовно назавжди",
    "nav.support": "Підтримати",
    "nav.faq": "Питання",
    "nav.download": "Завантажити",
    "hero.badge": "Відкритий код · MIT · версія <span data-version></span>",
    "hero.title": "Монтаж без водяних знаків, підписок і ліцензій",
    "hero.lead": "Kadro — безкоштовний відеоредактор для Windows. Усе, за що інші просять гроші: багатодоріжковий таймлайн, кольорокорекція, хромакей, ШІ-субтитри та видалення фону — доступно кожному й назавжди.",
    "cta.installer": "Завантажити для Windows",
    "cta.portable": "Portable-версія",
    "cta.meta": "Windows 10 / 11 · 64-біт · близько 160 МБ · без реєстрації",
    "strip.1": "Без водяних знаків",
    "strip.2": "Без реєстрації",
    "strip.3": "Без підписки",
    "strip.4": "Працює офлайн",
    "strip.5": "Відкритий код",
    "features.title": "Інструменти професійного рівня",
    "features.lead": "Те, що зазвичай сховано в дорогих тарифах, у Kadro є одразу.",
    "f1.t": "Справжній таймлайн",
    "f1.d": "Необмежені доріжки, ripple-, roll-, slip- і slide-правка, нарізка за змінами сцен, мітки в ритм музики, соло й блокування доріжок.",
    "f2.t": "Колір як у студії",
    "f2.d": "Колірні кола, RGB-криві, вибірковий колір HSL, LUT (.cube), 18 режимів накладання, відеоскопи, хромакей і маски.",
    "f3.t": "ШІ просто на комп’ютері",
    "f3.d": "Автосубтитри й видалення фону працюють локально: без хмари, кредитів і надсилання ваших відео будь-куди.",
    "f4.t": "Чистий звук",
    "f4.d": "Шумозаглушення, нормалізація гучності за EBU R128, автоприглушення музики під голос, еквалайзер, компресор і запис голосу.",
    "f5.t": "Ефекти й моди",
    "f5.d": "Шейдерні ефекти й переходи, анімовані оверлеї та фони, стікери, стабілізація, «картинка в картинці» і власні моди на GLSL.",
    "f6.t": "Швидкий експорт",
    "f6.d": "Апаратне кодування NVENC, Quick Sync і AMF. MP4, WebM, ProRes, GIF — до 4K.",
    "f7.t": "Онлайн-бібліотека",
    "f7.d": "Безкоштовні відео, фото, музика й звуки просто в програмі — з авторами та ліцензіями, що зберігаються в проєкті.",
    "f8.t": "Титри й шрифти",
    "f8.d": "24 вбудовані шрифти з кирилицею, 22 стилі титрів, градієнти, обведення, тіні й анімації появи.",
    "f9.t": "Під себе",
    "f9.d": "П’ять тем, зокрема світла, будь-який колір акценту, масштаб інтерфейсу. Українська, російська та англійська мови.",
    "shot2.caption": "4K-відео монтується плавно: полегшені копії створюються самі, а відеоскопи показують колір кадру.",
    "free.title": "Безкоштовно — означає безкоштовно",
    "free.p1": "Kadro не продає ліцензій і не ховає функції за платною версією. Немає водяного знака на експорті, немає пробного періоду й облікового запису. Усі отримують ту саму програму.",
    "free.p2": "Вихідний код відкритий під ліцензією MIT: його можна перевірити, змінити й зібрати самостійно. Програма не збирає даних і працює без інтернету — мережа потрібна лише один раз, щоб завантажити ШІ-моделі, і для онлайн-бібліотеки.",
    "cmp.paid": "Платні редактори",
    "cmp.price": "Ціна",
    "cmp.free": "0 ₴",
    "cmp.sub": "підписка або ліцензія",
    "cmp.wm": "Водяний знак",
    "cmp.no": "немає",
    "cmp.wmFree": "у безкоштовній версії",
    "cmp.ai": "ШІ-функції",
    "cmp.local": "локально, без лімітів",
    "cmp.credits": "у хмарі, за кредити",
    "cmp.acc": "Обліковий запис",
    "cmp.notNeeded": "не потрібен",
    "cmp.needed": "обов’язковий",
    "cmp.code": "Відкритий код",
    "cmp.yes": "так",
    "cmp.no2": "ні",
    "support.title": "Підтримати проєкт",
    "support.lead": "Донати добровільні й нічого не відкривають — у всіх однакова програма. Вони допомагають приділяти більше часу новим функціям.",
    "support.other": "Ще можна допомогти безкоштовно: розповісти про Kadro, повідомити про помилку або зробити мод.",
    "faq.title": "Питання",
    "q1": "Це справді безкоштовно? У чому підступ?",
    "a1": "Підступу немає. Kadro — проєкт із відкритим кодом, який живе на добровільній підтримці користувачів.",
    "q2": "Windows пише «Систему Windows захищено». Що робити?",
    "a2": "Так SmartScreen реагує на нові програми без платного цифрового підпису. Натисніть «Докладніше» → «Усе одно запустити». Вихідний код відкритий, і інсталятор можна зібрати самостійно.",
    "q3": "Чи потрібен інтернет?",
    "a3": "Ні. Лише під час першого використання ШІ-функцій програма один раз завантажує моделі (від 40 до 250 МБ), а онлайн-бібліотека, звісно, працює через мережу.",
    "q4": "Які системи підтримуються?",
    "a4": "Windows 10 і 11 (64-біт). Збірки для macOS і Linux заплановані.",
    "q5": "Чи можна використовувати для комерційних проєктів?",
    "a5": "Так. Усе, що ви змонтували, належить вам, без жодних відрахувань і позначок.",
    "q6": "Як зробити свій ефект?",
    "a6": "Ефекти, переходи й анімовані елементи пишуться на GLSL у файлах .vrmod. Інструкція — у MODS.md у репозиторії.",
    "footer.source": "Вихідний код",
    "footer.releases": "Усі версії",
    "footer.issues": "Повідомити про помилку",
    "footer.note": "MIT. FFmpeg використовується як окрема програма під власною ліцензією.",
  };
  const SOON = { ru: 'скоро', uk: 'незабаром', en: EN['support.soon'] };

  // Original (Russian) texts are kept from the markup.
  const nodes = [...document.querySelectorAll('[data-i18n]')];
  const RU = Object.fromEntries(nodes.map((n) => [n.dataset.i18n, n.innerHTML]));

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
    for (const v of document.querySelectorAll('[data-version]')) v.textContent = site.version;
    document.documentElement.lang = lang;
    document.getElementById('lang').value = lang;
    for (const img of document.querySelectorAll('[data-shot]')) img.src = `assets/${img.dataset.shot}-${lang}.webp`;
    renderLinks(lang);
    try {
      localStorage.setItem('kadro.lang', lang);
    } catch {
      // private mode
    }
  }

  const local = (v, lang) => (v && typeof v === 'object' ? (v[lang] ?? v.en) : v);

  const links = { ...site.links };
  if (site.repo) {
    const gh = `https://github.com/${site.repo}`;
    const dl = `${gh}/releases/download/v${site.version}`;
    links.installer ||= `${dl}/Kadro-Setup-${site.version}.exe`;
    links.portable ||= `${dl}/Kadro-${site.version}-portable.exe`;
    links.source ||= gh;
    links.releases ||= `${gh}/releases`;
    links.issues ||= `${gh}/issues`;
  }

  function renderLinks(lang) {
    const soon = SOON[lang] ?? SOON.en;
    for (const a of document.querySelectorAll('[data-link]')) {
      const url = links[a.dataset.link];
      if (url) {
        a.href = url;
        a.classList.remove('disabled');
        a.removeAttribute('title');
      } else {
        a.href = '#download';
        a.classList.add('disabled');
        a.title = soon;
      }
    }
    const list = document.getElementById('donate-list');
    list.textContent = '';
    for (const d of site.donate) {
      const card = document.createElement(d.url ? 'a' : 'div');
      card.className = `donate-card${d.url ? '' : ' disabled'}`;
      if (d.url) {
        card.href = d.url;
        card.target = '_blank';
        card.rel = 'noopener';
      }
      const text = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = local(d.name, lang);
      text.append(name);
      if (d.note) {
        const sub = document.createElement('small');
        sub.textContent = local(d.note, lang);
        text.append(sub);
      }
      const note = document.createElement('span');
      note.textContent = d.url ? '→' : soon;
      card.append(text, note);
      list.append(card);
    }
  }

  const nav = navigator.language?.toLowerCase() ?? '';
  const saved = stored();
  const initial = ['uk', 'ru', 'en'].includes(saved) ? saved : nav.startsWith('uk') ? 'uk' : nav.startsWith('ru') ? 'ru' : 'en';
  apply(initial);
  document.getElementById('lang').addEventListener('change', (e) => apply(e.target.value));
})();

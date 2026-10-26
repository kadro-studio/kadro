// Workshop gallery: items from the workshop site's REST API (kadro/v1), with "Open in Kadro" links.
(function () {
  const site = window.KADRO_SITE;
  // A local copy of the site may point at a test WordPress: ?api=http://127.0.0.1:9400
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const override = local ? new URLSearchParams(location.search).get('api') : null;
  // Address and whether the workshop is open come from ../workshop.json (the app reads it too).
  const DEFAULT_BASE = 'https://workshop.kadro.studio';
  let open = true;
  let BASE = '';
  let API = '';
  const setBase = (url) => {
    BASE = (url || '').replace(/\/+$/, '');
    API = `${BASE}/wp-json/kadro/v1`;
  };
  const KINDS = ['effect', 'transition', 'element', 'look', 'textStyle', 'lut', 'theme', 'template'];
  const PER_PAGE = 24;

  const T = {
    uk: {
      'nav.features': 'Можливості',
      'nav.workshop': 'Майстерня',
      'nav.support': 'Підтримати',
      'nav.faq': 'Питання',
      'nav.download': 'Завантажити',
      title: 'Майстерня спільноти',
      lead: 'Ефекти, переходи, фільтри, LUT, стилі титрів, теми й шаблони проєктів від користувачів Kadro. Знайдіть потрібне тут і встановіть у програму одним кліком.',
      search: 'Пошук',
      'sort.popular': 'Популярні',
      'sort.new': 'Нові',
      'sort.liked': 'Найбільше вподобань',
      more: 'Показати ще',
      'kind.all': 'Усе',
      'kind.effect': 'Ефекти',
      'kind.transition': 'Переходи',
      'kind.element': 'Елементи',
      'kind.look': 'Фільтри',
      'kind.textStyle': 'Стилі титрів',
      'kind.lut': 'LUT',
      'kind.theme': 'Теми',
      'kind.template': 'Шаблони',
      'one.effect': 'Ефект',
      'one.transition': 'Перехід',
      'one.element': 'Елемент',
      'one.look': 'Фільтр',
      'one.textStyle': 'Стиль титрів',
      'one.lut': 'LUT',
      'one.theme': 'Тема',
      'one.template': 'Шаблон',
      loading: 'Завантаження…',
      empty: 'Тут поки нічого немає.',
      emptySearch: 'Нічого не знайдено.',
      error: 'Майстерня зараз недоступна. Спробуйте трохи пізніше.',
      closed: 'Майстерня відкриється найближчим часом. Тут з’являться ефекти, переходи, фільтри, LUT, теми й шаблони від користувачів Kadro.',
      notFound: 'Цей елемент не знайдено: можливо, автор його видалив.',
      by: 'Автор:',
      open: 'Відкрити в Kadro',
      download: 'Завантажити файл',
      page: 'Сторінка на сайті майстерні',
      openHint: 'Кнопка відкриє елемент у Kadro, де його можна встановити. Файл також можна завантажити й перетягнути у вікно програми.',
      noKadro: 'Ще немає Kadro?',
      getKadro: 'Завантажити безкоштовно',
      version: 'Версія',
      license: 'Ліцензія',
      updated: 'Оновлено',
      downloads: 'Завантажень',
      likes: 'Вподобань',
      size: 'Розмір',
      close: 'Закрити',
      'share.title': 'Поділіться своїм',
      'share.lead': 'Публікувати можна прямо з програми — без файлів і ручного завантаження.',
      'share.1': 'Створіть акаунт майстерні (кнопка нижче або «Створити акаунт» у програмі) й увійдіть у вкладці «Майстерня» в Kadro.',
      'share.join': 'Створити акаунт',
      'share.2': 'Натисніть «Опублікувати», виберіть ефект, фільтр, LUT, стиль титрів чи тему та додайте опис.',
      'share.3': 'Після перевірки модератором елемент з’явиться тут і в програмі в усіх користувачів.',
      'share.rules':
        'Публікуйте лише власні роботи або те, що дозволяє ліцензія автора. Ефекти з CapCut і TikTok переносити не можна — але схожий ефект завжди можна зробити самому.',
      'footer.site': 'Сайт майстерні',
      'footer.source': 'Вихідний код',
      'footer.issues': 'Повідомити про помилку',
      'footer.note': 'Кожен елемент належить своєму автору й поширюється під указаною ліцензією.',
    },
    ru: {
      'nav.features': 'Возможности',
      'nav.workshop': 'Мастерская',
      'nav.support': 'Поддержать',
      'nav.faq': 'Вопросы',
      'nav.download': 'Скачать',
      title: 'Мастерская сообщества',
      lead: 'Эффекты, переходы, фильтры, LUT, стили титров, темы и шаблоны проектов от пользователей Kadro. Найдите нужное здесь и установите в программу одним кликом.',
      search: 'Поиск',
      'sort.popular': 'Популярные',
      'sort.new': 'Новые',
      'sort.liked': 'Больше всего лайков',
      more: 'Показать ещё',
      'kind.all': 'Всё',
      'kind.effect': 'Эффекты',
      'kind.transition': 'Переходы',
      'kind.element': 'Элементы',
      'kind.look': 'Фильтры',
      'kind.textStyle': 'Стили титров',
      'kind.lut': 'LUT',
      'kind.theme': 'Темы',
      'kind.template': 'Шаблоны',
      'one.effect': 'Эффект',
      'one.transition': 'Переход',
      'one.element': 'Элемент',
      'one.look': 'Фильтр',
      'one.textStyle': 'Стиль титров',
      'one.lut': 'LUT',
      'one.theme': 'Тема',
      'one.template': 'Шаблон',
      loading: 'Загрузка…',
      empty: 'Здесь пока ничего нет.',
      emptySearch: 'Ничего не найдено.',
      error: 'Мастерская сейчас недоступна. Попробуйте чуть позже.',
      closed: 'Мастерская откроется в ближайшее время. Здесь появятся эффекты, переходы, фильтры, LUT, темы и шаблоны от пользователей Kadro.',
      notFound: 'Этот элемент не найден: возможно, автор его удалил.',
      by: 'Автор:',
      open: 'Открыть в Kadro',
      download: 'Скачать файл',
      page: 'Страница на сайте мастерской',
      openHint: 'Кнопка откроет элемент в Kadro, где его можно установить. Файл также можно скачать и перетащить в окно программы.',
      noKadro: 'Ещё нет Kadro?',
      getKadro: 'Скачать бесплатно',
      version: 'Версия',
      license: 'Лицензия',
      updated: 'Обновлено',
      downloads: 'Скачиваний',
      likes: 'Лайков',
      size: 'Размер',
      close: 'Закрыть',
      'share.title': 'Поделитесь своим',
      'share.lead': 'Публиковать можно прямо из программы — без файлов и ручной загрузки.',
      'share.1': 'Создайте аккаунт мастерской (кнопка ниже или «Создать аккаунт» в программе) и войдите во вкладке «Мастерская» в Kadro.',
      'share.join': 'Создать аккаунт',
      'share.2': 'Нажмите «Опубликовать», выберите эффект, фильтр, LUT, стиль титров или тему и добавьте описание.',
      'share.3': 'После проверки модератором элемент появится здесь и в программе у всех пользователей.',
      'share.rules':
        'Публикуйте только свои работы или то, что разрешает лицензия автора. Эффекты из CapCut и TikTok переносить нельзя — но похожий эффект всегда можно сделать самому.',
      'footer.site': 'Сайт мастерской',
      'footer.source': 'Исходный код',
      'footer.issues': 'Сообщить об ошибке',
      'footer.note': 'Каждый элемент принадлежит своему автору и распространяется под указанной лицензией.',
    },
    en: {
      'nav.features': 'Features',
      'nav.workshop': 'Workshop',
      'nav.support': 'Support',
      'nav.faq': 'FAQ',
      'nav.download': 'Download',
      title: 'Community workshop',
      lead: 'Effects, transitions, filters, LUTs, title styles, themes and project templates made by Kadro users. Find what you need here and install it into the app in one click.',
      search: 'Search',
      'sort.popular': 'Popular',
      'sort.new': 'New',
      'sort.liked': 'Most liked',
      more: 'Show more',
      'kind.all': 'All',
      'kind.effect': 'Effects',
      'kind.transition': 'Transitions',
      'kind.element': 'Elements',
      'kind.look': 'Filters',
      'kind.textStyle': 'Title styles',
      'kind.lut': 'LUTs',
      'kind.theme': 'Themes',
      'kind.template': 'Templates',
      'one.effect': 'Effect',
      'one.transition': 'Transition',
      'one.element': 'Element',
      'one.look': 'Filter',
      'one.textStyle': 'Title style',
      'one.lut': 'LUT',
      'one.theme': 'Theme',
      'one.template': 'Template',
      loading: 'Loading…',
      empty: 'Nothing here yet.',
      emptySearch: 'Nothing found.',
      error: 'The workshop is unavailable right now. Please try again a bit later.',
      closed: 'The workshop opens soon. Effects, transitions, filters, LUTs, themes and templates from Kadro users will appear here.',
      notFound: 'This item was not found: its author may have removed it.',
      by: 'By',
      open: 'Open in Kadro',
      download: 'Download file',
      page: 'Page on the workshop site',
      openHint: 'The button opens the item in Kadro, where you can install it. You can also download the file and drop it onto the app window.',
      noKadro: 'No Kadro yet?',
      getKadro: 'Download for free',
      version: 'Version',
      license: 'Licence',
      updated: 'Updated',
      downloads: 'Downloads',
      likes: 'Likes',
      size: 'Size',
      close: 'Close',
      'share.title': 'Share your own',
      'share.lead': 'You publish straight from the app — no files to upload by hand.',
      'share.1': 'Create a workshop account (the button below, or Create account in the app) and sign in on the Workshop tab in Kadro.',
      'share.join': 'Create an account',
      'share.2': 'Press Publish, pick an effect, filter, LUT, title style or theme and add a description.',
      'share.3': 'Once a moderator has checked it, the item appears here and in the app for everyone.',
      'share.rules':
        'Only publish your own work or what the author’s licence allows. Effects from CapCut and TikTok cannot be brought over — but you can always make a similar one yourself.',
      'footer.site': 'Workshop site',
      'footer.source': 'Source code',
      'footer.issues': 'Report a bug',
      'footer.note': 'Every item belongs to its author and is shared under the licence shown.',
    },
  };

  const $ = (id) => document.getElementById(id);
  const itemsBox = $('items');
  const stateBox = $('state');
  const moreBtn = $('more');
  const dialog = $('details');
  const state = { lang: 'uk', kind: '', sort: 'popular', search: '', page: 1, pages: 1, items: [], status: 'loading' };
  let request = 0;

  const t = (key) => T[state.lang][key] ?? T.en[key] ?? key;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // Only images and pages from the workshop site itself are shown.
  function fromWorkshop(url) {
    try {
      const u = new URL(url);
      return BASE && u.origin === new URL(BASE).origin ? u.href : null;
    } catch {
      return null;
    }
  }

  const fileUrl = (id) => `${API}/items/${id}/file`;

  function formatSize(bytes) {
    if (!bytes) return '';
    const kb = bytes / 1024;
    return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(state.lang === 'uk' ? 'uk-UA' : state.lang === 'ru' ? 'ru-RU' : 'en-GB');
  }

  function preview(item, cls) {
    const box = el('div', `${cls} kind-${item.kind}`);
    const src = item.preview && fromWorkshop(item.preview);
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      box.append(img);
    } else {
      box.append(el('span', 'ws-ph', t(`one.${item.kind}`)));
    }
    return box;
  }

  function card(item) {
    const b = el('button', 'ws-card');
    b.type = 'button';
    b.addEventListener('click', () => openItem(item));
    const body = el('div', 'ws-card-body');
    body.append(el('strong', 'ws-card-title', item.title));
    const meta = el('div', 'ws-card-meta');
    meta.append(el('span', 'ws-kind', t(`one.${item.kind}`)), el('span', '', item.author));
    const stats = el('div', 'ws-card-stats');
    stats.append(el('span', '', `↓ ${item.downloads}`), el('span', '', `♥ ${item.likes}`));
    body.append(meta, stats);
    b.append(preview(item, 'ws-card-preview'), body);
    return b;
  }

  function render() {
    itemsBox.textContent = '';
    for (const item of state.items) itemsBox.append(card(item));
    const msg =
      state.status === 'loading'
        ? t('loading')
        : state.status === 'error'
          ? t('error')
          : state.status === 'closed'
            ? t('closed')
          : state.items.length === 0
            ? t(state.search || state.kind ? 'emptySearch' : 'empty')
            : '';
    stateBox.textContent = msg;
    stateBox.hidden = !msg;
    moreBtn.hidden = state.status !== 'idle' || state.page >= state.pages;
  }

  async function load(append = false) {
    const id = ++request;
    state.status = 'loading';
    if (!append) {
      state.page = 1;
      state.items = [];
    }
    render();
    const q = new URLSearchParams({ sort: state.sort, page: String(state.page), per_page: String(PER_PAGE) });
    if (state.kind) q.set('kind', state.kind);
    if (state.search) q.set('search', state.search);
    try {
      if (!BASE) throw new Error('no workshop');
      const r = await fetch(`${API}/items?${q}`);
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      if (id !== request) return;
      state.items = append ? [...state.items, ...data.items] : data.items;
      state.pages = data.pages ?? 1;
      state.status = 'idle';
    } catch {
      if (id !== request) return;
      state.status = 'error';
    }
    render();
  }

  function renderKinds() {
    const box = $('kinds');
    box.textContent = '';
    for (const k of ['', ...KINDS]) {
      const b = el('button', `ws-kind-chip${state.kind === k ? ' active' : ''}`, t(`kind.${k || 'all'}`));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(state.kind === k));
      b.addEventListener('click', () => {
        if (state.kind === k) return;
        state.kind = k;
        renderKinds();
        load();
      });
      box.append(b);
    }
  }

  let shown = null;

  function detail(item) {
    const box = $('detail');
    box.textContent = '';
    if (!item) {
      box.append(el('p', 'ws-state', t('notFound')));
      return;
    }
    box.append(preview(item, 'ws-detail-preview'));
    const head = el('div', 'ws-detail-head');
    head.append(el('span', 'ws-kind', t(`one.${item.kind}`)), el('h2', '', item.title), el('p', 'ws-author', `${t('by')} ${item.author}`));
    box.append(head);
    if (item.description) box.append(el('p', 'ws-desc', item.description));
    if (item.tags?.length) {
      const tags = el('div', 'ws-tags');
      for (const tag of item.tags) tags.append(el('span', '', `#${tag}`));
      box.append(tags);
    }
    const facts = el('dl', 'ws-facts');
    const fact = (k, v) => {
      if (!v) return;
      const row = el('div');
      row.append(el('dt', '', t(k)), el('dd', '', v));
      facts.append(row);
    };
    fact('version', item.version);
    fact('license', item.license);
    fact('updated', formatDate(item.updated));
    fact('size', formatSize(item.fileSize));
    fact('downloads', String(item.downloads));
    fact('likes', String(item.likes));
    box.append(facts);

    const actions = el('div', 'ws-detail-actions');
    const open = el('a', 'btn btn-primary', t('open'));
    open.href = `kadro://workshop/item/${Number(item.id)}`;
    const dl = el('a', 'btn btn-ghost', t('download'));
    dl.href = fileUrl(Number(item.id));
    actions.append(open, dl);
    box.append(actions);
    box.append(el('p', 'hint', t('openHint')));

    const foot = el('p', 'ws-detail-foot');
    const page = item.page && fromWorkshop(item.page);
    if (page) {
      const a = el('a', '', t('page'));
      a.href = page;
      a.target = '_blank';
      a.rel = 'noopener';
      foot.append(a, ' · ');
    }
    const get = el('a', '', t('getKadro'));
    get.href = '../#download';
    foot.append(`${t('noKadro')} `, get);
    box.append(foot);
  }

  function openItem(item) {
    shown = item;
    detail(item);
    if (!dialog.open) dialog.showModal();
    const hash = item ? `#item-${item.id}` : location.hash;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  // Shared links: kadro.studio/workshop/#item-123
  async function openFromHash() {
    const m = /^#item-(\d+)$/.exec(location.hash);
    if (!m) return;
    const id = Number(m[1]);
    const known = state.items.find((x) => x.id === id);
    if (known) return openItem(known);
    try {
      const r = await fetch(`${API}/items/${id}`);
      openItem(r.ok ? await r.json() : null);
    } catch {
      openItem(null);
    }
  }

  dialog.addEventListener('close', () => {
    shown = null;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });
  // A click on the backdrop closes the dialog.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  function applyLang(lang) {
    state.lang = lang;
    document.documentElement.lang = lang;
    $('lang').value = lang;
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(n.dataset.i18nPlaceholder);
    for (const n of document.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));
    renderKinds();
    render();
    if (BASE) footerLinks();
    if (dialog.open) detail(shown);
    try {
      localStorage.setItem('kadro.lang', lang);
    } catch {
      // private mode
    }
  }

  function footerLinks() {
    const gh = site.repo ? `https://github.com/${site.repo}` : '';
    // The sign-up page opens in the language of this page.
    const join = BASE ? `${BASE}/?kadro=join&lang=${state.lang}` : '';
    const links = { workshopSite: BASE, join, source: site.links.source || gh, issues: site.links.issues || (gh && `${gh}/issues`) };
    for (const a of document.querySelectorAll('[data-link]')) {
      const url = links[a.dataset.link];
      if (url) a.href = url;
      else a.hidden = true;
    }
  }

  let searchTimer = 0;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const v = e.target.value.trim();
      if (v === state.search) return;
      state.search = v;
      load();
    }, 300);
  });
  $('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    load();
  });
  moreBtn.addEventListener('click', () => {
    state.page += 1;
    load(true);
  });
  $('lang').addEventListener('change', (e) => applyLang(e.target.value));
  window.addEventListener('hashchange', openFromHash);

  let saved = null;
  try {
    saved = localStorage.getItem('kadro.lang');
  } catch {
    // private mode
  }
  const nav = navigator.language?.toLowerCase() ?? '';
  applyLang(['uk', 'ru', 'en'].includes(saved) ? saved : nav.startsWith('uk') ? 'uk' : nav.startsWith('ru') ? 'ru' : 'en');

  async function loadConfig() {
    if (override) return setBase(override);
    try {
      const r = await fetch('../workshop.json', { cache: 'no-cache' });
      const c = await r.json();
      setBase(typeof c.url === 'string' && c.url.startsWith('https://') ? c.url : DEFAULT_BASE);
      open = c.open !== false;
    } catch {
      setBase(DEFAULT_BASE);
    }
  }

  loadConfig().then(() => {
    footerLinks();
    if (open) return load().then(openFromHash);
    // Not open yet: say so instead of showing an empty gallery.
    state.status = 'closed';
    document.querySelector('.ws-bar').hidden = true;
    document.querySelector('[data-link=workshopSite]').hidden = true;
    document.querySelector('[data-link=join]').hidden = true;
    render();
  });
})();

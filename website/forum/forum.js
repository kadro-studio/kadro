// Kadro forum: sections, topics and replies from the workshop site's REST API (kadro/v1), drawn
// on this page with community.js. The view comes from the address: ?s=<section>,
// ?t=<topic>[&r=<reply>], ?new=1[&s=<section>], ?q=<search>, ?mine=1, or none for the overview.
// Links are real links; plain clicks switch views with pushState.
(function () {
  const C = window.KadroCommunity;
  const site = window.KADRO_SITE;
  const { el, button } = C;

  const T = {
    uk: {
      title: 'Форум Kadro',
      lead: 'Питання про монтаж, ідеї, повідомлення про помилки, ваші роботи й новини Kadro. Читати може кожен, а писати — з акаунтом майстерні.',
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
      'footer.note': 'Будьте ввічливими: без спаму, реклами й чужих особистих даних. Модератори можуть видаляти дописи.',
      loading: 'Завантаження…',
      more: 'Показати ще',
      retry: 'Спробувати ще раз',
      error: 'Форум зараз недоступний. Спробуйте трохи пізніше.',
      search: 'Пошук у форумі',
      searchPh: 'Пошук тем',
      searchGo: 'Знайти',
      newTopic: 'Нова тема',
      mine: 'Мої теми',
      sections: 'Розділи',
      recent: 'Останні теми',
      noRecent: 'Тем ще немає — почніть першу.',
      forum: 'Форум',
      topicsN: { one: '{n} тема', few: '{n} теми', many: '{n} тем', other: '{n} теми' },
      repliesN: { one: '{n} відповідь', few: '{n} відповіді', many: '{n} відповідей', other: '{n} відповіді' },
      last: 'Остання:',
      locked: 'Теми тут створюють модератори',
      emptySection: 'У цьому розділі ще немає тем.',
      noSection: 'Такого розділу немає.',
      noTopic: 'Тему не знайдено: можливо, її видалили.',
      back: 'До форуму',
      pinned: 'закріплено',
      closed: 'закрито',
      searchTitle: 'Пошук: «{q}»',
      searchEmpty: 'Нічого не знайдено.',
      searchHint: 'Напишіть, що шукаєте.',
      mineEmpty: 'Ви ще не створили жодної теми.',
      replies: 'Відповіді',
      section: 'Розділ',
      topicTitle: 'Назва',
      topicText: 'Текст',
      titlePh: 'Коротко: про що тема',
      textPh: 'Розкажіть докладно. Якщо щось не працює — що ви робили, що сталося і яка у вас версія Kadro.',
      publish: 'Опублікувати',
      publishing: 'Публікація…',
      cancel: 'Скасувати',
      save: 'Зберегти',
      saving: 'Збереження…',
      edit: 'Редагувати',
      delete: 'Видалити',
      report: 'Поскаржитися',
      moderate: 'Модерувати',
      pin: 'Закріпити',
      unpin: 'Відкріпити',
      close: 'Закрити тему',
      reopen: 'Відкрити тему',
      move: 'Розділ теми',
      deleteTopic: 'Видалити цю тему? Повернути її не вийде.',
      deletedTopic: 'Тему видалено.',
      reported: 'Скаргу надіслано — модератори перевірять.',
      soon: 'Скоро тут буде форум спільноти Kadro: питання про монтаж, ідеї, ваші роботи й новини. А поки напишіть нам через {contact}.',
      soonLink: 'форму зворотного зв’язку',
    },
    ru: {
      title: 'Форум Kadro',
      lead: 'Вопросы о монтаже, идеи, сообщения об ошибках, ваши работы и новости Kadro. Читать может каждый, а писать — с аккаунтом мастерской.',
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
      'footer.note': 'Будьте вежливы: без спама, рекламы и чужих личных данных. Модераторы могут удалять сообщения.',
      loading: 'Загрузка…',
      more: 'Показать ещё',
      retry: 'Попробовать ещё раз',
      error: 'Форум сейчас недоступен. Попробуйте чуть позже.',
      search: 'Поиск по форуму',
      searchPh: 'Поиск тем',
      searchGo: 'Найти',
      newTopic: 'Новая тема',
      mine: 'Мои темы',
      sections: 'Разделы',
      recent: 'Последние темы',
      noRecent: 'Тем пока нет — начните первую.',
      forum: 'Форум',
      topicsN: { one: '{n} тема', few: '{n} темы', many: '{n} тем', other: '{n} темы' },
      repliesN: { one: '{n} ответ', few: '{n} ответа', many: '{n} ответов', other: '{n} ответа' },
      last: 'Последняя:',
      locked: 'Темы здесь создают модераторы',
      emptySection: 'В этом разделе пока нет тем.',
      noSection: 'Такого раздела нет.',
      noTopic: 'Тема не найдена: возможно, её удалили.',
      back: 'К форуму',
      pinned: 'закреплено',
      closed: 'закрыто',
      searchTitle: 'Поиск: «{q}»',
      searchEmpty: 'Ничего не найдено.',
      searchHint: 'Напишите, что ищете.',
      mineEmpty: 'Вы ещё не создали ни одной темы.',
      replies: 'Ответы',
      section: 'Раздел',
      topicTitle: 'Название',
      topicText: 'Текст',
      titlePh: 'Коротко: о чём тема',
      textPh: 'Расскажите подробно. Если что-то не работает — что вы делали, что произошло и какая у вас версия Kadro.',
      publish: 'Опубликовать',
      publishing: 'Публикация…',
      cancel: 'Отмена',
      save: 'Сохранить',
      saving: 'Сохранение…',
      edit: 'Изменить',
      delete: 'Удалить',
      report: 'Пожаловаться',
      moderate: 'Модерировать',
      pin: 'Закрепить',
      unpin: 'Открепить',
      close: 'Закрыть тему',
      reopen: 'Открыть тему',
      move: 'Раздел темы',
      deleteTopic: 'Удалить эту тему? Вернуть её не получится.',
      deletedTopic: 'Тема удалена.',
      reported: 'Жалоба отправлена — модераторы проверят.',
      soon: 'Скоро здесь будет форум сообщества Kadro: вопросы о монтаже, идеи, ваши работы и новости. А пока напишите нам через {contact}.',
      soonLink: 'форму обратной связи',
    },
    en: {
      title: 'Kadro forum',
      lead: 'Questions about editing, ideas, bug reports, your work and Kadro news. Anyone can read; to write, you need a workshop account.',
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
      'footer.note': 'Be kind: no spam, ads or other people’s personal data. Moderators may remove posts.',
      loading: 'Loading…',
      more: 'Show more',
      retry: 'Try again',
      error: 'The forum is unavailable right now. Please try again a bit later.',
      search: 'Search the forum',
      searchPh: 'Search topics',
      searchGo: 'Search',
      newTopic: 'New topic',
      mine: 'My topics',
      sections: 'Sections',
      recent: 'Latest topics',
      noRecent: 'No topics yet — start the first one.',
      forum: 'Forum',
      topicsN: { one: '{n} topic', other: '{n} topics' },
      repliesN: { one: '{n} reply', other: '{n} replies' },
      last: 'Latest:',
      locked: 'Only moderators start topics here',
      emptySection: 'No topics in this section yet.',
      noSection: 'There is no such section.',
      noTopic: 'Topic not found: it may have been deleted.',
      back: 'Back to the forum',
      pinned: 'pinned',
      closed: 'closed',
      searchTitle: 'Search: “{q}”',
      searchEmpty: 'Nothing found.',
      searchHint: 'Type what you are looking for.',
      mineEmpty: 'You haven’t started any topics yet.',
      replies: 'Replies',
      section: 'Section',
      topicTitle: 'Title',
      topicText: 'Text',
      titlePh: 'In short: what is it about',
      textPh: 'Tell us the details. If something doesn’t work: what you did, what happened, and your Kadro version.',
      publish: 'Publish',
      publishing: 'Publishing…',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      edit: 'Edit',
      delete: 'Delete',
      report: 'Report',
      moderate: 'Moderate',
      pin: 'Pin',
      unpin: 'Unpin',
      close: 'Close topic',
      reopen: 'Reopen topic',
      move: 'Topic section',
      deleteTopic: 'Delete this topic? It can’t be brought back.',
      deletedTopic: 'The topic was deleted.',
      reported: 'Report sent — the moderators will check it.',
      soon: 'The Kadro community forum is coming soon: questions about editing, ideas, your work and news. Meanwhile, write to us through {contact}.',
      soonLink: 'the feedback form',
    },
  };

  const $ = (id) => document.getElementById(id);
  const viewBox = $('view');
  const state = { lang: 'uk' };
  const t = (key, v) => {
    const s = T[state.lang][key] ?? T.en[key] ?? key;
    return v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s;
  };
  const tn = (key, n) => C.plural(T[state.lang][key] ?? T.en[key], n);
  // Section names and descriptions come as {en, ru, uk}.
  const loc = (v) => (v && typeof v === 'object' ? String(v[state.lang] || v.en || v.uk || v.ru || '') : typeof v === 'string' ? v : '');
  const author = (name) => (typeof name === 'string' && name.trim() ? name.trim() : C.t('deleted'));
  const MAX = C.MAX;

  let cfg = { open: true };
  let me = { signedIn: false };

  // ---------- addresses ----------

  // A local copy keeps ?api= on every link (testing against a local WordPress).
  const apiParam = new URLSearchParams(location.search).get('api');

  function href(params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, String(v));
    }
    if (apiParam) q.set('api', apiParam);
    const s = q.toString();
    return s ? `${location.pathname}?${s}` : location.pathname;
  }

  const contactHref = () => `../contact/${apiParam ? `?api=${encodeURIComponent(apiParam)}` : ''}`;

  function navLink(text, params, cls) {
    const a = el('a', cls || '', text);
    a.href = href(params);
    a.dataset.nav = '1';
    return a;
  }

  function navigate(params, replace) {
    history[replace ? 'replaceState' : 'pushState'](null, '', href(params));
    route(true);
  }

  // Whether a request's result may still move the visitor on: their view is the one that sent it,
  // or it was only drawn again on the same address (signed in elsewhere, for example).
  const still = (ctx, at) => ctx.alive() || location.href === at;

  function parse() {
    const p = new URLSearchParams(location.search);
    const num = (k) => (/^\d{1,10}$/.test(p.get(k) || '') ? Number(p.get(k)) : 0);
    if (num('t')) return { name: 'topic', id: num('t'), r: num('r') };
    if (p.get('new')) return { name: 'new', s: (p.get('s') || '').slice(0, 200) };
    if (p.get('s')) return { name: 'section', s: p.get('s').slice(0, 200) };
    if (p.has('q')) return { name: 'search', q: (p.get('q') || '').trim().slice(0, 100) };
    if (p.get('mine')) return { name: 'mine' };
    return { name: 'home' };
  }

  // ---------- data ----------

  let forumData = null;
  let forumPromise = null;

  // Sections (names in all three languages) and the latest topics; fetched once, again on the overview.
  function loadForum(fresh) {
    if (fresh || !forumPromise) {
      const p = C.request('GET', `/forum?lang=${state.lang}`).then((d) => {
        forumData = {
          open: d.open !== false,
          sections: Array.isArray(d.sections) ? d.sections.filter((s) => s && typeof s.slug === 'string') : [],
          recent: Array.isArray(d.recent) ? d.recent : [],
        };
        return forumData;
      });
      forumPromise = p;
      p.catch(() => {
        if (forumPromise === p) forumPromise = null;
      });
    }
    return forumPromise;
  }

  const findSection = (slug) => (forumData ? forumData.sections.find((s) => s.slug === slug) : null) || null;
  const writable = () => cfg.open !== false && !(forumData && forumData.open === false);
  const canStart = (sec) => writable() && !(sec && sec.locked && !me.moderator);

  // ---------- shared view pieces ----------

  function header(title, lead) {
    const box = el('div', 'fm-head');
    const h1 = el('h1', 'fm-title', title);
    h1.tabIndex = -1;
    const p = el('p', 'fm-lead', lead || '');
    p.hidden = !lead;
    box.append(h1, p);
    return { box, h1, lead: p };
  }

  function crumbs(items) {
    const nav = el('nav', 'fm-crumbs');
    nav.setAttribute('aria-label', t('forum'));
    items.forEach((x, i) => {
      if (i) nav.append(el('span', 'fm-sep', '›'));
      nav.append(x);
    });
    return nav;
  }

  const stateP = (text) => el('p', 'ws-state', text);

  function errorState(err, retry) {
    const box = el('div', 'fm-error');
    const p = el('p', 'ws-state', err && err.code === 'network' ? C.errorText(err) : t('error'));
    p.setAttribute('role', 'alert');
    box.append(p);
    if (retry) box.append(button(t('retry'), 'btn btn-ghost btn-sm', retry));
    return box;
  }

  let searchText = '';
  function searchForm(q) {
    const f = el('form', 'fm-search');
    f.setAttribute('role', 'search');
    const label = el('label', 'sr-only', t('search'));
    label.htmlFor = 'fm-q';
    const input = el('input', 'ws-search');
    input.type = 'search';
    input.id = 'fm-q';
    input.maxLength = 100;
    input.placeholder = t('searchPh');
    input.value = searchText || q || '';
    input.addEventListener('input', () => {
      searchText = input.value;
    });
    const go = el('button', 'btn btn-ghost btn-sm', t('searchGo'));
    go.type = 'submit';
    f.append(label, input, go);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) {
        input.focus();
        return;
      }
      searchText = '';
      navigate({ q: v });
    });
    return f;
  }

  function sectionCard(s) {
    const card = el('article', `fm-section${s.locked ? ' is-locked' : ''}`);
    const h = el('h3');
    h.append(navLink(loc(s.name) || s.slug, { s: s.slug }, 'fm-section-link'));
    card.append(h);
    const d = loc(s.description);
    if (d) card.append(el('p', 'fm-section-desc', d));
    const stats = el('div', 'fm-stats');
    stats.append(el('span', '', tn('topicsN', Number(s.topics) || 0)), el('span', '', tn('repliesN', Number(s.replies) || 0)));
    if (s.locked) stats.append(el('span', 'fm-locked', t('locked')));
    card.append(stats);
    if (s.last && Number(s.last.id) > 0) {
      const p = el('p', 'fm-section-last');
      p.append(`${t('last')} `, navLink(String(s.last.title || ''), { t: Number(s.last.id) }), ` — ${author(s.last.author)}, `, C.timeEl(s.last.time));
      card.append(p);
    }
    return card;
  }

  function topicRow(tp, showSection) {
    const li = el('li', `fm-topic${tp.status === 'hidden' ? ' is-hidden' : ''}${tp.pinned ? ' is-pinned' : ''}`);
    const main = el('div', 'fm-topic-main');
    const title = el('div', 'fm-topic-title');
    if (tp.pinned) title.append(C.badge(t('pinned')));
    if (tp.closed) title.append(C.badge(t('closed'), 'muted'));
    title.append(navLink(String(tp.title || ''), { t: Number(tp.id) }, 'fm-topic-link'));
    if (tp.status === 'hidden') title.append(C.badge(C.t('hidden'), 'muted', C.t('hidden.title')));
    if (me.moderator && Number(tp.reports) > 0) title.append(C.badge(C.tn('reports', Number(tp.reports)), 'warn'));
    const meta = el('div', 'fm-topic-meta');
    if (showSection) {
      const s = findSection(tp.section);
      meta.append(el('span', 'fm-sec', s ? loc(s.name) : String(tp.section || '')));
    }
    meta.append(el('span', '', author(tp.author)), C.timeEl(tp.created));
    main.append(title, meta);
    const side = el('div', 'fm-topic-side');
    side.append(el('span', 'fm-count', tn('repliesN', Number(tp.replies) || 0)));
    const last = el('span', 'fm-last');
    last.append(`${author(tp.lastAuthor || tp.author)}, `, C.timeEl(tp.last || tp.created));
    side.append(last);
    li.append(main, side);
    return li;
  }

  // A paged list of topics (GET /forum/topics with `params`).
  function topicList(box, params, o) {
    const ol = el('ol', 'fm-topics');
    const st = el('div', 'fm-list-state');
    const more = el('div', 'ws-more');
    box.append(ol, st, more);
    const L = { items: [], page: 0, pages: 1, loading: false, err: null, view: seq };
    function draw() {
      ol.textContent = '';
      for (const tp of L.items) ol.append(topicRow(tp, o.showSection));
      ol.hidden = !L.items.length;
      st.textContent = '';
      if (L.err && !L.items.length) st.append(errorState(L.err, load));
      else if (!L.items.length) st.append(stateP(L.loading ? t('loading') : o.empty()));
      more.textContent = '';
      if (L.items.length && (L.page < L.pages || L.err)) {
        if (L.err) {
          const p = el('p', 'form-error', C.errorText(L.err));
          p.setAttribute('role', 'alert');
          more.append(p);
        }
        const b = button(L.loading ? t('loading') : t('more'), 'btn btn-ghost btn-sm', load);
        b.disabled = L.loading;
        more.append(b);
      }
    }
    async function load() {
      if (L.loading) return;
      L.loading = true;
      L.err = null;
      draw();
      const q = new URLSearchParams(params);
      q.set('page', String(L.page + 1));
      q.set('per_page', String(C.PER_PAGE));
      try {
        const d = await C.request('GET', `/forum/topics?${q}`);
        if (L.view !== seq) return;
        L.page = Number(d.page) || L.page + 1;
        L.pages = Math.max(1, Number(d.pages) || 1);
        for (const tp of Array.isArray(d.topics) ? d.topics : []) {
          if (tp && typeof tp.id === 'number' && !L.items.some((x) => x.id === tp.id)) L.items.push(tp);
        }
      } catch (e) {
        if (L.view !== seq) return;
        if (e.code === 'kw_unavailable') {
          soon();
          return;
        }
        L.err = e;
      }
      L.loading = false;
      draw();
    }
    load();
    return { relabel: draw };
  }

  // ---------- views ----------

  let view = null; // { relabel(), destroy() }
  let seq = 0;
  let flash = ''; // a notice for the next view (after a topic was deleted)
  let preloaded = null; // the topic just created, so it is not fetched again

  function route(moved) {
    const my = ++seq;
    if (view && view.destroy) view.destroy();
    view = null;
    viewBox.textContent = '';
    const v = parse();
    const ctx = {
      alive: () => my === seq,
      focus: (h1) => {
        if (moved && my === seq) h1.focus({ preventScroll: true });
      },
    };
    if (moved) window.scrollTo(0, 0);
    if (v.name === 'topic') view = topicView(v, ctx);
    else if (v.name === 'new') view = newView(v, ctx);
    else if (v.name === 'section') view = sectionView(v, ctx);
    else if (v.name === 'search') view = searchView(v, ctx);
    else if (v.name === 'mine') view = mineView(v, ctx);
    else view = homeView(ctx);
  }

  // The workshop runs an older plugin (no forum yet): a calm "coming soon".
  function soon() {
    seq++;
    if (view && view.destroy) view.destroy();
    viewBox.textContent = '';
    const head = header(t('title'), '');
    const p = el('p', 'fm-soon');
    const a = el('a', '', t('soonLink'));
    a.href = contactHref();
    p.append(C.fill(t('soon'), { contact: a }));
    viewBox.append(head.box, p);
    document.title = t('title');
    view = { relabel: soon };
  }

  function homeView(ctx) {
    const head = header(t('title'), t('lead'));
    const tools = el('div', 'fm-toolbar');
    const body = el('div', 'fm-body');
    viewBox.append(head.box, tools, body);
    let data = null;
    let err = null;
    function draw() {
      document.title = t('title');
      head.h1.textContent = t('title');
      head.lead.textContent = t('lead');
      tools.textContent = '';
      tools.append(searchForm(''));
      const acts = el('div', 'fm-actions');
      if (data && canStart(null)) acts.append(navLink(t('newTopic'), { new: 1 }, 'btn btn-primary btn-sm'));
      if (me.signedIn) acts.append(navLink(t('mine'), { mine: 1 }, 'btn btn-ghost btn-sm'));
      if (acts.firstChild) tools.append(acts);
      body.textContent = '';
      if (err) {
        body.append(errorState(err, load));
        return;
      }
      if (!data) {
        body.append(stateP(t('loading')));
        return;
      }
      body.append(el('h2', 'fm-h2', t('sections')));
      const grid = el('div', 'fm-sections');
      for (const s of data.sections) grid.append(sectionCard(s));
      body.append(grid);
      body.append(el('h2', 'fm-h2', t('recent')));
      if (data.recent.length) {
        const ol = el('ol', 'fm-topics');
        for (const tp of data.recent) if (tp && typeof tp.id === 'number') ol.append(topicRow(tp, true));
        body.append(ol);
      } else {
        body.append(stateP(t('noRecent')));
      }
    }
    async function load() {
      err = null;
      data = null;
      draw();
      try {
        data = await loadForum(true);
      } catch (e) {
        if (!ctx.alive()) return;
        if (e.code === 'kw_unavailable') {
          soon();
          return;
        }
        err = e;
      }
      if (ctx.alive()) draw();
    }
    draw();
    ctx.focus(head.h1);
    load();
    return { relabel: draw };
  }

  function sectionView(v, ctx) {
    const nav = el('div');
    const head = header(t('loading'), '');
    const tools = el('div', 'fm-toolbar');
    const note = el('div');
    const body = el('div', 'fm-body');
    viewBox.append(nav, head.box, tools, note, body);
    let sec = null;
    let missing = false;
    let err = null;
    let list = null;
    let done = flash;
    flash = '';
    function draw() {
      nav.replaceChildren(crumbs([navLink(t('forum'), {})]));
      head.h1.textContent = sec ? loc(sec.name) || sec.slug : missing ? t('noSection') : t('loading');
      head.lead.textContent = sec ? loc(sec.description) : '';
      head.lead.hidden = !head.lead.textContent;
      document.title = `${sec ? loc(sec.name) || sec.slug : t('forum')} — ${t('title')}`;
      tools.textContent = '';
      if (sec) {
        if (canStart(sec)) tools.append(navLink(t('newTopic'), { new: 1, s: sec.slug }, 'btn btn-primary btn-sm'));
        else if (sec.locked) tools.append(el('span', 'fm-muted', t('locked')));
      }
      tools.hidden = !tools.firstChild;
      note.textContent = '';
      if (done) {
        const p = el('p', 'fm-flash', done);
        p.setAttribute('role', 'status');
        note.append(p);
      }
      if (missing) {
        body.textContent = '';
        body.append(navLink(t('back'), {}, 'btn btn-ghost btn-sm'));
      } else if (err) {
        body.textContent = '';
        body.append(errorState(err, load));
      } else if (list) {
        list.relabel();
      }
    }
    async function load() {
      err = null;
      draw();
      try {
        await loadForum(false);
      } catch (e) {
        if (!ctx.alive()) return;
        if (e.code === 'kw_unavailable') {
          soon();
          return;
        }
        err = e;
        draw();
        return;
      }
      if (!ctx.alive()) return;
      sec = findSection(v.s);
      missing = !sec;
      body.textContent = '';
      if (sec) list = topicList(body, { section: sec.slug }, { showSection: false, empty: () => t('emptySection') });
      draw();
      ctx.focus(head.h1);
    }
    load();
    return { relabel: draw };
  }

  function searchView(v, ctx) {
    const nav = crumbs([navLink(t('forum'), {})]);
    const head = header('', '');
    const tools = el('div', 'fm-toolbar');
    const body = el('div', 'fm-body');
    viewBox.append(nav, head.box, tools, body);
    let list = null;
    function draw() {
      nav.replaceChildren(...crumbs([navLink(t('forum'), {})]).childNodes);
      const title = v.q ? t('searchTitle', { q: v.q }) : t('search');
      head.h1.textContent = title;
      document.title = `${title} — ${t('title')}`;
      tools.replaceChildren(searchForm(v.q));
      if (list) list.relabel();
      else {
        body.textContent = '';
        body.append(stateP(t('searchHint')));
      }
    }
    if (v.q) list = topicList(body, { search: v.q }, { showSection: true, empty: () => t('searchEmpty') });
    draw();
    ctx.focus(head.h1);
    // Section names for the results.
    loadForum(false).then(
      () => ctx.alive() && list && list.relabel(),
      () => {},
    );
    return { relabel: draw };
  }

  function mineView(v, ctx) {
    const nav = crumbs([navLink(t('forum'), {})]);
    const head = header(t('mine'), '');
    const body = el('div', 'fm-body');
    viewBox.append(nav, head.box, body);
    let list = null;
    function draw() {
      nav.replaceChildren(...crumbs([navLink(t('forum'), {})]).childNodes);
      head.h1.textContent = t('mine');
      document.title = `${t('mine')} — ${t('title')}`;
      if (list) list.relabel();
      else {
        body.textContent = '';
        body.append(C.note('signin', { kind: 'forum' }));
      }
    }
    if (me.signedIn) list = topicList(body, { mine: '1' }, { showSection: true, empty: () => t('mineEmpty') });
    draw();
    ctx.focus(head.h1);
    loadForum(false).then(
      () => ctx.alive() && list && list.relabel(),
      () => {},
    );
    return { relabel: draw };
  }

  // The new-topic form; what is typed stays in memory while the page is open.
  const newDraft = { section: '', title: '', text: '' };

  function newView(v, ctx) {
    const nav = el('div');
    const head = header(t('newTopic'), '');
    const body = el('div', 'fm-body');
    viewBox.append(nav, head.box, body);
    let data = null;
    let err = null;
    function draw() {
      const sec = data && findSection(v.s);
      const trail = [navLink(t('forum'), {})];
      if (sec) trail.push(navLink(loc(sec.name) || sec.slug, { s: sec.slug }));
      nav.replaceChildren(crumbs(trail));
      head.h1.textContent = t('newTopic');
      document.title = `${t('newTopic')} — ${t('title')}`;
      body.textContent = '';
      if (err) {
        body.append(errorState(err, load));
        return;
      }
      if (!data) {
        body.append(stateP(t('loading')));
        return;
      }
      const allowed = data.sections.filter((s) => !s.locked || me.moderator);
      const reason = C.gate({ off: !writable() || !allowed.length });
      if (reason) {
        body.append(C.note(reason, { kind: 'forum' }));
        return;
      }
      if (!allowed.some((s) => s.slug === newDraft.section)) newDraft.section = allowed[0].slug;
      body.append(form(allowed, sec));
    }
    function form(allowed, sec) {
      const f = el('form', 'fm-form');
      f.noValidate = true;
      const field = (id, label, input, extra) => {
        const box = el('div', 'field');
        const l = el('label', 'field-label', label);
        l.htmlFor = id;
        input.id = id;
        box.append(l, input);
        if (extra) box.append(extra);
        return box;
      };
      const select = el('select', 'select');
      for (const s of allowed) {
        const o = el('option', '', loc(s.name) || s.slug);
        o.value = s.slug;
        select.append(o);
      }
      select.value = newDraft.section;
      select.addEventListener('change', () => {
        newDraft.section = select.value;
      });
      const title = el('input', 'input');
      title.type = 'text';
      title.autocomplete = 'off';
      title.placeholder = t('titlePh');
      title.value = newDraft.title;
      const titleCount = C.counter(title, MAX.title);
      const text = el('textarea', 'textarea');
      text.rows = 10;
      text.placeholder = t('textPh');
      text.value = newDraft.text;
      const textCount = C.counter(text, MAX.topic);
      const err2 = C.errorBox();
      title.addEventListener('input', () => {
        newDraft.title = title.value;
        err2.clear();
      });
      text.addEventListener('input', () => {
        newDraft.text = text.value;
        err2.clear();
      });
      const send = el('button', 'btn btn-primary', t('publish'));
      send.type = 'submit';
      const row = el('div', 'fm-form-row');
      row.append(send, navLink(t('cancel'), sec ? { s: sec.slug } : {}, 'link-btn'));
      f.append(
        field('fm-new-section', t('section'), select),
        field('fm-new-title', t('topicTitle'), title, titleCount.el),
        field('fm-new-text', t('topicText'), text, textCount.el),
        err2.el,
        row,
      );
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = title.value.replace(/\s+/g, ' ').trim();
        const n = C.len(name);
        if (n < MAX.titleMin || n > MAX.title) {
          err2.show(C.errorText({ code: 'kw_title' }));
          title.focus();
          return;
        }
        const content = text.value.trim();
        const bad = C.check(content, { max: MAX.topic });
        if (bad) {
          err2.show(C.errorText({ code: bad }));
          text.focus();
          return;
        }
        send.disabled = true;
        send.textContent = t('publishing');
        const at = location.href;
        try {
          const d = await C.request('POST', '/forum/topics', { section: select.value, title: name, content });
          newDraft.title = '';
          newDraft.text = '';
          forumPromise = null;
          // The visitor went to another page of the forum meanwhile: the topic is published, and
          // they stay where they are (going to it would replace the page they are on now).
          if (!still(ctx, at)) return;
          if (d && typeof d.id === 'number') {
            preloaded = d;
            navigate({ t: d.id }, true);
          } else {
            navigate(sec ? { s: sec.slug } : {}, true);
          }
        } catch (ex) {
          send.disabled = false;
          send.textContent = t('publish');
          if (!ctx.alive()) return;
          if (ex.code === 'kw_off' && forumData) {
            forumData.open = false;
            draw();
            return;
          }
          if (ex.code === 'kw_unavailable') {
            soon();
            return;
          }
          err2.show(C.errorText(ex));
        }
      });
      return f;
    }
    async function load() {
      err = null;
      draw();
      try {
        data = await loadForum(false);
      } catch (e) {
        if (!ctx.alive()) return;
        if (e.code === 'kw_unavailable') {
          soon();
          return;
        }
        err = e;
      }
      if (!ctx.alive()) return;
      // Coming from a section's "New topic": that section is picked.
      const sec = data && findSection(v.s);
      if (sec && (!sec.locked || me.moderator)) newDraft.section = sec.slug;
      draw();
    }
    ctx.focus(head.h1);
    load();
    return { relabel: draw };
  }

  function topicView(v, ctx) {
    const nav = el('div');
    const head = el('div', 'fm-topic-head');
    const h1 = el('h1', 'fm-title', t('loading'));
    h1.tabIndex = -1;
    const badges = el('div', 'fm-badges');
    head.append(h1, badges);
    const first = el('article', 'fm-post');
    const replies = el('section', 'fm-replies');
    const rh = el('h2', 'fm-h2');
    rh.id = 'fm-replies-title';
    replies.setAttribute('aria-labelledby', rh.id);
    const body = el('div', 'fm-body');
    viewBox.append(nav, head, first, replies, body);
    first.hidden = true;
    replies.hidden = true;
    const tv = { d: null, err: null, editing: false, deleting: false, reporting: false, reported: false, modErr: null, count: null, thread: null };
    const editKey = `topic-edit:${v.id}`;

    function drawNav() {
      const trail = [navLink(t('forum'), {})];
      if (tv.d) {
        const s = findSection(tv.d.section);
        trail.push(navLink(s ? loc(s.name) || s.slug : String(tv.d.section || ''), { s: tv.d.section }));
      }
      nav.replaceChildren(crumbs(trail));
    }

    function drawHead() {
      const d = tv.d;
      h1.textContent = d ? String(d.title || '') : tv.err ? (tv.err.code === 'kw_not_found' ? t('noTopic') : t('error')) : t('loading');
      document.title = `${d ? d.title : t('forum')} — ${t('title')}`;
      badges.textContent = '';
      if (d && d.pinned) badges.append(C.badge(t('pinned')));
      if (d && d.closed) badges.append(C.badge(t('closed'), 'muted'));
      badges.hidden = !badges.firstChild;
    }

    function drawRepliesTitle() {
      rh.textContent = typeof tv.count === 'number' ? `${t('replies')} (${tv.count})` : t('replies');
    }

    function actions() {
      const d = tv.d;
      const own = d.own === true;
      const mod = me.moderator === true;
      const box = el('div', 'cm-actions');
      const busy = tv.editing || tv.deleting;
      const act = (name, text, onClick) => {
        const b = button(text, 'link-btn', onClick);
        b.dataset.act = name;
        box.append(b);
      };
      // Editing needs the forum on and the topic open (moderators always may); authors can
      // always delete their topic (the server still keeps one that others replied to).
      if ((own || mod) && !busy && (mod || (writable() && d.open !== false && !d.closed))) {
        act('edit', t('edit'), () => {
          tv.editing = true;
          tv.reporting = false;
          drawFirst();
          const f = first.querySelector('input, textarea');
          if (f) f.focus();
        });
      }
      if ((own || mod) && !busy) {
        act('delete', t('delete'), () => {
          tv.deleting = true;
          drawFirst();
          const b = first.querySelector('.btn-danger');
          if (b) b.focus();
        });
      }
      if (me.signedIn && !own && !mod && d.status === 'publish') {
        if (tv.reported) {
          const done = el('span', 'cm-done', t('reported'));
          done.setAttribute('role', 'status');
          done.dataset.act = 'reported';
          box.append(done);
        } else if (!tv.reporting) {
          act('report', t('report'), () => {
            tv.reporting = true;
            drawFirst();
            const f = first.querySelector('.cm-inline input');
            if (f) f.focus();
          });
        }
      }
      if (mod) {
        const a = el('a', 'link-btn', t('moderate'));
        a.href = C.moderateUrl('topic', d.id);
        a.target = '_blank';
        a.rel = 'noopener';
        box.append(a);
      }
      return box.firstChild ? box : null;
    }

    function editForm() {
      const d = tv.d;
      const draft = C.drafts.get(editKey) || { title: String(d.title || ''), content: String(d.content || '') };
      const f = el('form', 'cm-form fm-edit');
      f.noValidate = true;
      const tl = el('label', 'field-label', t('topicTitle'));
      tl.htmlFor = 'fm-edit-title';
      const title = el('input', 'input');
      title.id = 'fm-edit-title';
      title.type = 'text';
      title.value = draft.title;
      const titleCount = C.counter(title, MAX.title);
      const xl = el('label', 'field-label', t('topicText'));
      xl.htmlFor = 'fm-edit-text';
      const text = el('textarea', 'textarea');
      text.id = 'fm-edit-text';
      text.rows = 8;
      text.value = draft.content;
      const textCount = C.counter(text, MAX.topic);
      const err = C.errorBox();
      const keep = () => {
        C.drafts.set(editKey, { title: title.value, content: text.value });
        err.clear();
      };
      title.addEventListener('input', keep);
      text.addEventListener('input', keep);
      const save = el('button', 'btn btn-primary btn-sm', t('save'));
      save.type = 'submit';
      const row = el('div', 'cm-inline-row');
      row.append(
        save,
        button(t('cancel'), 'link-btn', () => {
          C.drafts.delete(editKey);
          tv.editing = false;
          drawFirst();
          refocus('edit');
        }),
      );
      const tf = el('div', 'field');
      tf.append(tl, title, titleCount.el);
      const xf = el('div', 'field');
      xf.append(xl, text, textCount.el);
      f.append(tf, xf, err.el, row);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Only what changed is sent.
        const changes = {};
        const name = title.value.replace(/\s+/g, ' ').trim();
        const content = text.value.trim();
        if (name !== String(d.title || '')) {
          const n = C.len(name);
          if (n < MAX.titleMin || n > MAX.title) {
            err.show(C.errorText({ code: 'kw_title' }));
            title.focus();
            return;
          }
          changes.title = name;
        }
        if (content !== String(d.content || '').trim()) {
          const bad = C.check(content, { max: MAX.topic });
          if (bad) {
            err.show(C.errorText({ code: bad }));
            text.focus();
            return;
          }
          changes.content = content;
        }
        if (!Object.keys(changes).length) {
          C.drafts.delete(editKey);
          tv.editing = false;
          drawFirst();
          refocus('edit');
          return;
        }
        save.disabled = true;
        save.textContent = t('saving');
        try {
          const next = await C.request('POST', `/forum/topics/${d.id}`, changes);
          C.drafts.delete(editKey);
          tv.editing = false;
          if (!updated(next)) drawFirst();
          refocus('edit');
        } catch (ex) {
          save.disabled = false;
          save.textContent = t('save');
          err.show(C.errorText(ex));
        }
      });
      return f;
    }

    // Moderators: pin, close and move; each sends only the field it changes.
    function modBar() {
      const d = tv.d;
      const bar = el('div', 'fm-modbar');
      const err = C.errorBox();
      const set = async (changes, which) => {
        for (const b of bar.querySelectorAll('button, select')) b.disabled = true;
        tv.modErr = null;
        try {
          if (!updated(await C.request('POST', `/forum/topics/${d.id}`, changes))) drawFirst();
        } catch (ex) {
          tv.modErr = ex;
          drawFirst();
        }
        // The bar was drawn again: keep the focus on the same control.
        const again = first.querySelector(`[data-mod="${which}"]`);
        if (again) again.focus();
      };
      const pin = button(d.pinned ? t('unpin') : t('pin'), 'btn btn-ghost btn-sm', () => set({ pinned: !d.pinned }, 'pin'));
      pin.dataset.mod = 'pin';
      const close = button(d.closed ? t('reopen') : t('close'), 'btn btn-ghost btn-sm', () => set({ closed: !d.closed }, 'close'));
      close.dataset.mod = 'close';
      bar.append(pin, close);
      if (forumData && forumData.sections.length) {
        const wrap = el('div', 'fm-move');
        const l = el('label', 'field-label', t('move'));
        l.htmlFor = 'fm-move';
        const sel = el('select', 'select select-sm');
        sel.id = 'fm-move';
        sel.dataset.mod = 'move';
        for (const s of forumData.sections) {
          const o = el('option', '', loc(s.name) || s.slug);
          o.value = s.slug;
          sel.append(o);
        }
        sel.value = d.section;
        sel.addEventListener('change', () => set({ section: sel.value }, 'move'));
        wrap.append(l, sel);
        bar.append(wrap);
      }
      if (tv.modErr) err.show(C.errorText(tv.modErr));
      bar.append(err.el);
      return bar;
    }

    function drawFirst() {
      const d = tv.d;
      first.textContent = '';
      first.hidden = !d;
      if (!d) return;
      first.classList.toggle('is-hidden', d.status === 'hidden');
      first.append(C.avatar(d.author));
      const b = el('div', 'cm-body');
      b.append(C.byline(d));
      if (tv.editing) b.append(editForm());
      else b.append(C.textEl(d.content, 'cm-text fm-text'));
      const acts = actions();
      if (acts) b.append(acts);
      if (tv.reporting) {
        b.append(
          C.reportBox({
            draftKey: `topic-report:${d.id}`,
            onCancel: () => {
              tv.reporting = false;
              drawFirst();
              refocus('report');
            },
            onSend: async (reason) => {
              await C.request('POST', `/forum/topics/${d.id}/report`, { reason });
              tv.reporting = false;
              tv.reported = true;
              drawFirst();
              refocus('reported');
            },
          }),
        );
      }
      if (tv.deleting) {
        b.append(
          C.confirmBox({
            text: t('deleteTopic'),
            onCancel: () => {
              tv.deleting = false;
              drawFirst();
              refocus('delete');
            },
            onYes: async () => {
              const at = location.href;
              await C.request('DELETE', `/forum/topics/${d.id}`);
              forumPromise = null;
              C.drafts.delete(editKey);
              C.drafts.delete(`topic-report:${d.id}`);
              // The visitor went to another page meanwhile: the topic is gone, their page stays.
              if (!still(ctx, at)) return;
              flash = t('deletedTopic');
              navigate({ s: d.section }, true);
            },
          }),
        );
      }
      if (me.moderator) b.append(modBar());
      first.append(b);
    }

    // drawFirst() builds the post again, which drops the focus: it goes back to the control that
    // matches (`act`, see actions()), another of the post's buttons, or the title.
    function refocus(act) {
      if (!ctx.alive() || !first.isConnected) return;
      const n =
        (act && first.querySelector(`.cm-actions [data-act="${act}"]`)) || first.querySelector('.cm-actions button, .cm-actions a[href]');
      if (n) {
        if (!n.matches('button, a[href]')) n.tabIndex = -1;
        n.focus();
      } else {
        h1.focus({ preventScroll: true });
      }
    }

    // A changed topic from the server; false when the answer was not a topic (nothing redrawn).
    function updated(next) {
      if (!next || typeof next.id !== 'number') return false;
      const wasClosed = !!tv.d.closed;
      tv.d = { ...tv.d, ...next };
      drawNav();
      drawHead();
      drawFirst();
      if (tv.thread && wasClosed !== !!tv.d.closed) tv.thread.update({ closed: !!tv.d.closed });
      return true;
    }

    async function load() {
      tv.err = null;
      body.textContent = '';
      drawHead();
      const pre = preloaded && preloaded.id === v.id ? preloaded : null;
      preloaded = null;
      try {
        const [d] = await Promise.all([
          pre ? Promise.resolve(pre) : C.request('GET', `/forum/topics/${v.id}`),
          loadForum(false).catch((e) => {
            if (e.code === 'kw_unavailable') throw e;
            return null;
          }),
        ]);
        if (!ctx.alive()) return;
        tv.d = d;
        tv.count = typeof d.replies === 'number' ? d.replies : null;
      } catch (e) {
        if (!ctx.alive()) return;
        if (e.code === 'kw_unavailable') {
          soon();
          return;
        }
        tv.err = e;
        drawNav();
        drawHead();
        body.append(e.code === 'kw_not_found' ? navLink(t('back'), {}, 'btn btn-ghost btn-sm') : errorState(e, load));
        ctx.focus(h1);
        return;
      }
      drawNav();
      drawHead();
      drawFirst();
      replies.hidden = false;
      replies.append(rh);
      drawRepliesTitle();
      const d = tv.d;
      tv.thread = C.thread(replies, {
        kind: 'topic',
        id: d.id,
        open: d.open !== false,
        closed: !!d.closed,
        blocked: d.status !== 'publish',
        focus: v.r,
        back: () => location.href,
        onCount: (n) => {
          tv.count = n;
          drawRepliesTitle();
        },
        onUnavailable: soon,
      });
      ctx.focus(h1);
    }

    drawNav();
    drawHead();
    load();
    return {
      relabel() {
        drawNav();
        drawHead();
        if (tv.d) {
          drawFirst();
          drawRepliesTitle();
        } else if (tv.err) {
          body.textContent = '';
          body.append(tv.err.code === 'kw_not_found' ? navLink(t('back'), {}, 'btn btn-ghost btn-sm') : errorState(tv.err, load));
        }
        if (tv.thread) tv.thread.render();
      },
      destroy() {
        if (tv.thread) tv.thread.destroy();
      },
    };
  }

  // ---------- language, links, start ----------

  function footerLinks() {
    const gh = site.repo ? `https://github.com/${site.repo}` : '';
    const links = { source: site.links.source || gh, issues: site.links.issues || (gh && `${gh}/issues`) };
    for (const a of document.querySelectorAll('[data-link]')) {
      const url = links[a.dataset.link];
      if (url) a.href = url;
      else a.hidden = true;
    }
  }

  function applyLang(lang) {
    state.lang = lang;
    document.documentElement.lang = lang;
    $('lang').value = lang;
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    if (view && view.relabel) view.relabel();
    else document.title = t('title');
    try {
      localStorage.setItem('kadro.lang', lang);
    } catch {
      // private mode
    }
  }

  // Real links: a plain left click switches the view here; new tabs and copying work as usual.
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[data-nav]') : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    e.preventDefault();
    history.pushState(null, '', a.href);
    route(true);
  });
  window.addEventListener('popstate', () => route(true));
  $('lang').addEventListener('change', (e) => applyLang(e.target.value));

  let saved = null;
  try {
    saved = localStorage.getItem('kadro.lang');
  } catch {
    // private mode
  }
  const nav = navigator.language?.toLowerCase() ?? '';
  const params = new URLSearchParams(location.search);
  const asked = params.get('lang');
  const known = (x) => ['uk', 'ru', 'en'].includes(x);
  applyLang(known(asked) ? asked : known(saved) ? saved : nav.startsWith('uk') ? 'uk' : nav.startsWith('ru') ? 'ru' : 'en');
  // A language from a letter's link is used once; after that the saved choice wins.
  if (params.has('lang')) {
    params.delete('lang');
    const rest = params.toString();
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  }
  footerLinks();

  Promise.all([C.config(), C.me()]).then(([c, m]) => {
    cfg = c;
    me = m;
    // Signed in or out elsewhere, or the address got confirmed: draw the view again.
    C.onMe((next) => {
      me = next;
      route(false);
    });
    route(false);
  });
})();

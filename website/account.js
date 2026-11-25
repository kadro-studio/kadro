// Workshop account in the header: "Sign in", or the member's name with a menu
// (My works, My account, Sign out). The workshop site says who is signed in
// (same site, so the browser sends its sign-in cookie); this site stores nothing.
// The answer is shared as window.kadroMe (a promise that always resolves to an object,
// {signedIn:false} on any failure), so comments and the forum do not ask twice.
(function () {
  const here = document.currentScript.src;
  // A local copy of the site may point at a test WordPress: ?api=http://localhost:9400
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const override = local ? new URLSearchParams(location.search).get('api') : null;
  const community = window.KadroCommunity;
  let base = '';
  let me = null;

  // Address and "open" from workshop.json (community.js reads the same file when it is on the page).
  async function config() {
    if (community) return community.config();
    if (override) return { base: override.replace(/\/+$/, ''), open: true };
    const c = await (await fetch(new URL('workshop.json', here), { cache: 'no-cache' })).json();
    const url = typeof c.url === 'string' && c.url.startsWith('https://') ? c.url : 'https://workshop.kadro.studio';
    return { base: url.replace(/\/+$/, ''), open: c.open !== false };
  }

  // {me, show}: show is false when the workshop is closed or does not answer (no button then).
  async function load() {
    try {
      const c = await config();
      base = c.base;
      if (!c.open) return { me: { signedIn: false }, show: false };
      const r = await fetch(`${base}/?kadro=whoami`, { credentials: 'include', cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      if (!j || typeof j !== 'object') return { me: { signedIn: false }, show: false };
      return { me: j.signedIn === true ? j : { signedIn: false }, show: true };
    } catch {
      return { me: { signedIn: false }, show: false };
    }
  }

  const loaded = load();
  window.kadroMe = loaded.then((x) => x.me);

  const box = document.querySelector('.nav-actions');
  if (!box) return;
  const T = {
    uk: { signIn: 'Увійти', menu: 'Акаунт майстерні', my: 'Мої роботи', account: 'Мій акаунт', signOut: 'Вийти' },
    ru: { signIn: 'Войти', menu: 'Аккаунт мастерской', my: 'Мои работы', account: 'Мой аккаунт', signOut: 'Выйти' },
    en: { signIn: 'Sign in', menu: 'Workshop account', my: 'My works', account: 'My account', signOut: 'Sign out' },
  };
  const lang = () => (T[document.documentElement.lang] ? document.documentElement.lang : 'en');
  const t = (k) => T[lang()][k];
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  // The page's address can change after the menu is drawn (the forum and the workshop modal
  // change it), so links that come back here get it when they are used.
  const live = (a, make) => {
    const set = () => {
      a.href = make();
    };
    set();
    for (const ev of ['pointerdown', 'focus', 'click', 'contextmenu']) a.addEventListener(ev, set);
  };

  const root = el('div', 'acct');
  box.prepend(root);

  function render() {
    root.textContent = '';
    if (!me) return;
    const L = lang();
    if (!me.signedIn) {
      // After signing in, the workshop brings the visitor back to this page.
      const a = el('a', 'btn btn-ghost btn-sm acct-in', t('signIn'));
      live(a, () => `${base}/?kadro=login&lang=${lang()}&redirect_to=${encodeURIComponent(location.href)}`);
      root.append(a);
      return;
    }
    const btn = el('button', 'acct-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = t('menu');
    const name = (me.name || '').trim();
    btn.append(el('span', 'acct-pic', (Array.from(name)[0] || '?').toUpperCase()), el('span', 'acct-name', name));
    const menu = el('div', 'acct-menu');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const item = (text, href) => {
      const a = el('a', '', text);
      a.href = href;
      a.setAttribute('role', 'menuitem');
      menu.append(a);
      return a;
    };
    item(t('my'), `${base}/?kadro=my&lang=${L}`);
    item(t('account'), `${base}/?kadro=account&lang=${L}`);
    let out = null;
    try {
      out = new URL(me.logout);
    } catch {
      out = null;
    }
    if (out && (out.protocol === 'https:' || out.protocol === 'http:')) {
      live(item(t('signOut'), out.href), () => {
        out.searchParams.set('redirect_to', location.href);
        return out.href;
      });
    }
    const open = (yes) => {
      menu.hidden = !yes;
      btn.setAttribute('aria-expanded', String(yes));
    };
    btn.addEventListener('click', () => open(menu.hidden));
    close = (focus) => {
      if (menu.hidden) return;
      open(false);
      if (focus) btn.focus();
    };
    root.append(btn, menu);
  }

  // A click elsewhere or Escape closes the menu.
  let close = () => {};
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) close(false);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close(true);
  });

  loaded.then(({ me: m, show }) => {
    me = show ? m : null;
    render();
    // Comments and the forum may learn that the session ended or began; the header follows.
    if (show && community) {
      community.onMe((next) => {
        me = next.signedIn ? next : { signedIn: false };
        render();
      });
    }
  });

  // The page scripts switch the language first; the menu follows.
  document.getElementById('lang')?.addEventListener('change', render);
})();

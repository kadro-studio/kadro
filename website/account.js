// Workshop account in the header: "Sign in", or the member's name with a menu
// (My works, My account, Sign out). The workshop site says who is signed in
// (same site, so the browser sends its sign-in cookie); this site stores nothing.
(function () {
  const box = document.querySelector('.nav-actions');
  if (!box) return;
  const here = document.currentScript.src;
  // A local copy of the site may point at a test WordPress: ?api=http://localhost:9400
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const override = local ? new URLSearchParams(location.search).get('api') : null;
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

  const root = el('div', 'acct');
  box.prepend(root);
  let base = '';
  let me = null;

  function render() {
    root.textContent = '';
    if (!me) return;
    const L = lang();
    if (!me.signedIn) {
      // After signing in, the workshop brings the visitor back to this page.
      const a = el('a', 'btn btn-ghost btn-sm acct-in', t('signIn'));
      a.href = `${base}/?kadro=login&lang=${L}&redirect_to=${encodeURIComponent(location.href)}`;
      root.append(a);
      return;
    }
    const btn = el('button', 'acct-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = t('menu');
    const name = (me.name || '').trim();
    btn.append(el('span', 'acct-pic', (name[0] || '?').toUpperCase()), el('span', 'acct-name', name));
    const menu = el('div', 'acct-menu');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const item = (text, href) => {
      const a = el('a', '', text);
      a.href = href;
      a.setAttribute('role', 'menuitem');
      menu.append(a);
    };
    item(t('my'), `${base}/?kadro=my&lang=${L}`);
    item(t('account'), `${base}/?kadro=account&lang=${L}`);
    const out = new URL(me.logout);
    out.searchParams.set('redirect_to', location.href);
    item(t('signOut'), out.href);
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

  async function load() {
    try {
      let open = true;
      if (override) {
        base = override.replace(/\/+$/, '');
      } else {
        const c = await (await fetch(new URL('workshop.json', here), { cache: 'no-cache' })).json();
        base = (typeof c.url === 'string' && c.url.startsWith('https://') ? c.url : 'https://workshop.kadro.studio').replace(/\/+$/, '');
        open = c.open !== false;
      }
      if (!open) return;
      const r = await fetch(`${base}/?kadro=whoami`, { credentials: 'include', cache: 'no-store' });
      me = r.ok ? await r.json() : null;
    } catch {
      me = null;
    }
    render();
  }

  // The page scripts switch the language first; the menu follows.
  document.getElementById('lang')?.addEventListener('change', render);
  load();
})();

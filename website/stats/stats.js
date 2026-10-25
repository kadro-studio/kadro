// Download statistics for the author. GitHub keeps only a running total per release file, so
// .github/workflows/download-stats.yml records a snapshot every day on the `stats` branch; the
// difference between two snapshots is that day's downloads. The last bar runs from the latest
// snapshot to now, from the live counts. `?data=<url>` reads another history file (for testing).
(() => {
  const repo = (window.KADRO_SITE && window.KADRO_SITE.repo) || 'kadro-studio/kadro';
  const params = new URLSearchParams(location.search);
  const DATA_URL = params.get('data') || `https://raw.githubusercontent.com/${repo}/stats/downloads.json`;
  const LIVE_KEY = 'kadro.stats.live';
  const fmt = new Intl.NumberFormat('uk-UA');
  const SERIES = {
    setup: { label: 'Інсталятор', color: 'var(--series-setup)' },
    portable: { label: 'Портативна', color: 'var(--series-portable)' },
    updates: { label: 'Перевірки оновлень', color: 'var(--series-updates)' },
  };
  const zero = () => ({ setup: 0, portable: 0, updates: 0, blockmap: 0, other: 0 });

  let history = null;
  let live = null;
  let product = 'kadro';

  // Same rules as scripts/download-stats.mjs.
  function kindOf(name) {
    const n = name.toLowerCase();
    if (n.endsWith('.blockmap')) return 'blockmap';
    if (n.endsWith('.yml')) return 'updates';
    if (n.endsWith('.exe')) return n.includes('portable') ? 'portable' : 'setup';
    return 'other';
  }

  /** Current counts from the GitHub API, kept for ten minutes so reloads do not use up the limit. */
  async function loadLive() {
    try {
      const cached = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
      if (cached && Date.now() - cached.saved < 600000) return cached.snap;
    } catch {
      // private mode
    }
    const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`);
    if (!r.ok) return null;
    const counts = {};
    const releases = {};
    for (const rel of await r.json()) {
      if (rel.draft) continue;
      const animate = rel.tag_name.startsWith('animate-') || rel.assets.some((a) => a.name.startsWith('Kadro-Animate'));
      releases[rel.tag_name] = { name: rel.name || rel.tag_name, published: rel.published_at, product: animate ? 'animate' : 'kadro' };
      const c = zero();
      for (const a of rel.assets) c[kindOf(a.name)] += a.download_count;
      counts[rel.tag_name] = c;
    }
    const snap = { at: new Date().toISOString(), counts, releases };
    try {
      localStorage.setItem(LIVE_KEY, JSON.stringify({ saved: Date.now(), snap }));
    } catch {
      // private mode
    }
    return snap;
  }

  async function loadHistory() {
    try {
      const r = await fetch(DATA_URL, { cache: 'no-cache' });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Numbers

  const meta = () => ({ ...(history ? history.releases : {}), ...(live ? live.releases : {}) });
  const ours = (tag) => meta()[tag]?.product === product;
  const latestCounts = () => (live ? live.counts : history?.days.at(-1)?.counts) || {};
  const sum = (counts, kind) => Object.entries(counts).filter(([tag]) => ours(tag)).reduce((s, [, c]) => s + (c[kind] || 0), 0);

  /** What was added between two snapshots (a release that disappears does not count against). */
  function delta(prev, curr, kind) {
    let s = 0;
    for (const [tag, c] of Object.entries(curr)) if (ours(tag)) s += Math.max(0, (c[kind] || 0) - (prev[tag]?.[kind] || 0));
    return s;
  }

  function bars() {
    const days = history?.days || [];
    const out = [];
    const bar = (a, b, extra) => ({ from: a.at, to: b.at, setup: delta(a.counts, b.counts, 'setup'), portable: delta(a.counts, b.counts, 'portable'), updates: delta(a.counts, b.counts, 'updates'), ...extra });
    for (let i = 1; i < days.length; i++) out.push(bar(days[i - 1], days[i], { label: days[i - 1].date }));
    if (live && days.length) out.push(bar(days.at(-1), live, { label: 'зараз', live: true }));
    return out;
  }

  const shortDate = (iso) => {
    const [, m, d] = iso.slice(0, 10).split('-');
    return `${d}.${m}`;
  };
  const when = (iso) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // ---------------------------------------------------------------------------
  // Drawing

  function niceStep(raw) {
    if (raw <= 1) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }

  /** A bar with rounded top corners, its bottom square on the baseline. */
  function roundTop(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  }

  /** Stacked daily bars of `keys`, with a hover tooltip per bar. */
  function drawBars(host, data, keys) {
    host.innerHTML = '';
    if (!data.length) {
      host.innerHTML = `<p class="st-empty">${history ? 'Стовпчики з’являться після наступного щоденного знімка.' : 'Історія ще не почалась: її записує щоденний збір на GitHub. Поки видно лише загальні числа.'}</p>`;
      return;
    }
    const W = Math.max(300, host.clientWidth);
    const H = 230;
    const m = { l: 36, r: 6, t: 10, b: 24 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const totals = data.map((b) => keys.reduce((s, k) => s + b[k], 0));
    const step = niceStep(Math.max(1, ...totals) / 4);
    const top = Math.max(step, Math.ceil(Math.max(1, ...totals) / step) * step);
    const y = (v) => m.t + ph - (v / top) * ph;
    const col = pw / data.length;
    const bw = Math.max(3, Math.min(26, col * 0.62));
    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(pw / 54))));
    let svg = '';
    for (let v = 0; v <= top; v += step) {
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? 'var(--axis)' : 'var(--grid)'}" />`;
      svg += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt.format(v)}</text>`;
    }
    data.forEach((b, i) => {
      const x = m.l + i * col + (col - bw) / 2;
      let base = y(0);
      const parts = keys.filter((k) => b[k] > 0);
      let g = '';
      parts.forEach((k, j) => {
        const h = Math.max(1.5, (b[k] / top) * ph - (j > 0 ? 2 : 0));
        const yy = base - h - (j > 0 ? 2 : 0);
        const last = j === parts.length - 1;
        g += last ? `<path d="${roundTop(x, yy, bw, h, 4)}" fill="${SERIES[k].color}" />` : `<rect x="${x}" y="${yy}" width="${bw}" height="${h}" fill="${SERIES[k].color}" />`;
        base = yy;
      });
      svg += `<g class="bar${b.live ? ' live' : ''}" data-i="${i}">${g}</g>`;
      if (i % every === 0 || i === data.length - 1) {
        svg += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${b.live ? 'зараз' : shortDate(b.label)}</text>`;
      }
      svg += `<rect class="hit" data-i="${i}" x="${m.l + i * col}" y="${m.t}" width="${col}" height="${ph}" fill="transparent" />`;
    });
    host.innerHTML = `<svg class="st-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${svg}</svg>`;
    const el = host.querySelector('svg');
    const card = host.closest('.st-card');
    let tip = card.querySelector('.st-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'st-tip';
      tip.hidden = true;
      card.append(tip);
    }
    const show = (e) => {
      const i = Number(e.target.dataset.i);
      const b = data[i];
      el.classList.add('dim');
      el.querySelectorAll('.bar').forEach((n) => n.classList.toggle('on', n.dataset.i === String(i)));
      const rows = keys.map((k) => `<div><i style="background:${SERIES[k].color}"></i>${SERIES[k].label}: <b>${fmt.format(b[k])}</b></div>`).join('');
      tip.innerHTML = `<div class="when">${when(b.from)} → ${b.live ? 'зараз' : when(b.to)}</div>${rows}${keys.length > 1 ? `<div>Разом: <b>${fmt.format(totals[i])}</b></div>` : ''}`;
      tip.hidden = false;
      const c = card.getBoundingClientRect();
      const r = e.target.getBoundingClientRect();
      const left = Math.min(c.width - tip.offsetWidth - 8, Math.max(8, r.left - c.left + r.width / 2 - tip.offsetWidth / 2));
      tip.style.left = `${left}px`;
      tip.style.top = `${r.top - c.top + 8}px`;
    };
    el.querySelectorAll('.hit').forEach((h) => {
      h.addEventListener('mouseenter', show);
      h.addEventListener('mouseleave', () => {
        tip.hidden = true;
        el.classList.remove('dim');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Page

  function render() {
    document.querySelectorAll('#product button').forEach((b) => b.classList.toggle('active', b.dataset.product === product));
    const counts = latestCounts();
    const all = bars();
    const total = sum(counts, 'setup') + sum(counts, 'portable');
    const weekAgo = Date.now() - 7 * 86400000;
    const week = all.filter((b) => new Date(b.to).getTime() > weekAgo).reduce((s, b) => s + b.setup + b.portable, 0);
    const now = all.find((b) => b.live);
    const lastDay = all.filter((b) => !b.live).at(-1);
    const hasUpdates = sum(counts, 'updates') > 0;
    const tiles = [
      [fmt.format(total), 'завантажень за весь час'],
      [history?.days.length > 1 || now ? fmt.format(week) : '—', 'за останні 7 днів'],
      [now ? fmt.format(now.setup + now.portable) : '—', 'від ранкового знімка'],
    ];
    if (hasUpdates) tiles.push([lastDay ? fmt.format(lastDay.updates) : now ? fmt.format(now.updates) : '—', lastDay ? 'перевірок оновлень за останню добу' : 'перевірок оновлень від ранкового знімка']);
    document.getElementById('tiles').innerHTML = tiles.map(([v, k]) => `<div class="st-tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');

    const keys = ['setup', 'portable'].filter((k) => sum(counts, k) > 0 || k === 'setup');
    document.getElementById('dl-legend').innerHTML = keys
      .map((k) => `<span><i style="background:${SERIES[k].color}"></i>${SERIES[k].label} <b>${fmt.format(sum(counts, k))}</b></span>`)
      .join('');
    drawBars(document.getElementById('dl-chart'), all, keys);
    document.getElementById('upd-card').hidden = !hasUpdates;
    if (hasUpdates) drawBars(document.getElementById('upd-chart'), all, ['updates']);

    // By version, newest first.
    const m = meta();
    const tags = Object.keys(counts).filter(ours).sort((a, b) => (m[b].published || '').localeCompare(m[a].published || ''));
    const cell = (v) => `<td>${fmt.format(v)}</td>`;
    let rows = `<tr><th>Версія</th><th>Вийшла</th>${keys.map((k) => `<th>${SERIES[k].label}</th>`).join('')}<th>Разом</th>${hasUpdates ? '<th>Перевірки оновлень</th>' : ''}</tr>`;
    for (const tag of tags) {
      const c = counts[tag];
      const date = m[tag].published ? new Date(m[tag].published).toLocaleDateString('uk-UA') : '';
      rows += `<tr><td>${m[tag].name}</td><td>${date}</td>${keys.map((k) => cell(c[k])).join('')}${cell(c.setup + c.portable)}${hasUpdates ? cell(c.updates) : ''}</tr>`;
    }
    rows += `<tr><td><b>Разом</b></td><td></td>${keys.map((k) => cell(sum(counts, k))).join('')}${cell(total)}${hasUpdates ? cell(sum(counts, 'updates')) : ''}</tr>`;
    document.getElementById('versions').innerHTML = rows;

    // Every bar as a row, newest first.
    let days = `<tr><th>Період</th>${keys.map((k) => `<th>${SERIES[k].label}</th>`).join('')}<th>Разом</th>${hasUpdates ? '<th>Перевірки оновлень</th>' : ''}</tr>`;
    for (const b of [...all].reverse()) days += `<tr><td>${when(b.from)} → ${b.live ? 'зараз' : when(b.to)}</td>${keys.map((k) => cell(b[k])).join('')}${cell(b.setup + b.portable)}${hasUpdates ? cell(b.updates) : ''}</tr>`;
    document.getElementById('days').innerHTML = all.length ? days : '<tr><td>Ще немає жодного дня.</td></tr>';

    const first = history?.days[0];
    document.getElementById('note').textContent = [
      first ? `Історія записується з ${new Date(first.at).toLocaleDateString('uk-UA')}; до того відомі лише загальні числа.` : 'Щоденний збір ще не записав жодного знімка.',
      live ? `Живі лічильники GitHub оновлено о ${when(live.at).slice(6)}.` : 'Живі лічильники GitHub зараз недоступні.',
    ].join(' ');
  }

  document.getElementById('product').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    product = b.dataset.product;
    render();
  });

  let pending = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => history || live ? render() : undefined);
  }).observe(document.getElementById('dl-chart'));

  Promise.all([loadHistory(), loadLive().catch(() => null)]).then(([h, l]) => {
    history = h;
    live = l;
    render();
  });
})();

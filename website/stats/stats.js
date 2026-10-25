// Download statistics for the author. GitHub keeps only a running total per release file, so
// .github/workflows/download-stats.yml checks the counts every hour and, when one changed, saves a
// snapshot on the `stats` branch. The difference between two snapshots is the downloads that
// happened between them, which gives the day and the hour. Downloads since the latest snapshot
// come from the live counts. `?data=<url>` reads another history file (for testing).
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
  const KINDS = ['setup', 'portable', 'updates'];
  const DAY = 86400000;

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
      const c = { setup: 0, portable: 0, updates: 0, blockmap: 0, other: 0 };
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
  const snaps = () => history?.snapshots || [];
  const latestCounts = () => (live ? live.counts : snaps().at(-1)?.counts) || {};
  const sum = (counts, kind) => Object.entries(counts).filter(([tag]) => ours(tag)).reduce((s, [, c]) => s + (c[kind] || 0), 0);

  /**
   * Downloads between snapshots, one entry per release and kind: they happened between `from` and
   * `to`. The last ones (live) are not saved yet: they happened after the latest snapshot.
   */
  function events() {
    const list = snaps();
    const out = [];
    const add = (prev, curr, from, to, pending) => {
      for (const [tag, c] of Object.entries(curr)) {
        if (!ours(tag)) continue;
        for (const kind of KINDS) {
          const n = (c[kind] || 0) - (prev[tag]?.[kind] || 0);
          if (n > 0) out.push({ tag, kind, n, from: Date.parse(from), to: Date.parse(to), pending });
        }
      }
    };
    for (let i = 1; i < list.length; i++) add(list[i - 1].counts, list[i].counts, list[i].since || list[i - 1].at, list[i].at, false);
    if (live && list.length) add(list.at(-1).counts, live.counts, list.at(-1).at, live.at, true);
    return out;
  }

  const dayStart = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const two = (n) => String(n).padStart(2, '0');
  const dm = (t) => {
    const d = new Date(t);
    return `${two(d.getDate())}.${two(d.getMonth() + 1)}`;
  };
  const hm = (t) => {
    const d = new Date(t);
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
  };
  /** "25.10, 14:07–15:07", or both dates when the window crosses midnight. */
  const span = (from, to) => (dayStart(from) === dayStart(to) ? `${dm(to)}, ${hm(from)}–${hm(to)}` : `${dm(from)} ${hm(from)} – ${dm(to)} ${hm(to)}`);
  const WEEKDAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];

  /** One bar per day from the first snapshot to today; a download counts on the day its window ends. */
  function dayBars(evs) {
    const first = snaps()[0];
    if (!first) return [];
    const today = dayStart(Date.now());
    const bars = [];
    for (let d = dayStart(Date.parse(first.at)); d <= today; d = dayStart(d + DAY * 1.5)) {
      bars.push({ day: d, tick: dm(d), title: `${WEEKDAYS[new Date(d).getDay()]}, ${dm(d)}`, live: d === today, setup: 0, portable: 0, updates: 0 });
    }
    const index = new Map(bars.map((b, i) => [b.day, i]));
    for (const e of evs) {
      const i = index.get(dayStart(e.to));
      if (i !== undefined) bars[i][e.kind] += e.n;
    }
    return bars;
  }

  /** Downloads by hour of the day (local time), each at the middle of its window. */
  function hourBars(evs) {
    const bars = Array.from({ length: 24 }, (_, h) => ({ tick: two(h), title: `${two(h)}:00–${two((h + 1) % 24)}:00`, setup: 0, portable: 0, updates: 0 }));
    for (const e of evs) if (e.kind !== 'updates') bars[new Date((e.from + e.to) / 2).getHours()][e.kind] += e.n;
    return bars;
  }

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

  /** Stacked bars of `keys` (each bar has `tick`, `title`, optional `live`), with a hover tooltip. */
  function drawBars(host, data, keys, empty) {
    host.innerHTML = '';
    if (!data.length) {
      host.innerHTML = `<p class="st-empty">${empty}</p>`;
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
    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(pw / 46))));
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
        g += j === parts.length - 1 ? `<path d="${roundTop(x, yy, bw, h, 4)}" fill="${SERIES[k].color}" />` : `<rect x="${x}" y="${yy}" width="${bw}" height="${h}" fill="${SERIES[k].color}" />`;
        base = yy;
      });
      svg += `<g class="bar${b.live ? ' live' : ''}" data-i="${i}">${g}</g>`;
      if (i % every === 0 || i === data.length - 1) svg += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${b.tick}</text>`;
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
      tip.innerHTML = `<div class="when">${b.title}${b.live ? ' (ще триває)' : ''}</div>${rows}${keys.length > 1 ? `<div>Разом: <b>${fmt.format(totals[i])}</b></div>` : ''}`;
      tip.hidden = false;
      const c = card.getBoundingClientRect();
      const r = e.target.getBoundingClientRect();
      tip.style.left = `${Math.min(c.width - tip.offsetWidth - 8, Math.max(8, r.left - c.left + r.width / 2 - tip.offsetWidth / 2))}px`;
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

  const NO_HISTORY = 'Історія ще не почалась: її записує щогодинний збір на GitHub. Поки видно лише загальні числа.';

  function render() {
    document.querySelectorAll('#product button').forEach((b) => b.classList.toggle('active', b.dataset.product === product));
    const m = meta();
    const counts = latestCounts();
    const evs = events();
    const downloads = evs.filter((e) => e.kind !== 'updates');
    const days = dayBars(evs);
    const total = sum(counts, 'setup') + sum(counts, 'portable');
    const since = (t) => downloads.filter((e) => e.to > t).reduce((s, e) => s + e.n, 0);
    const hasUpdates = sum(counts, 'updates') > 0;
    const tiles = [
      [fmt.format(total), 'завантажень за весь час'],
      [snaps().length ? fmt.format(since(dayStart(Date.now()))) : '—', 'сьогодні'],
      [snaps().length ? fmt.format(since(Date.now() - 7 * DAY)) : '—', 'за останні 7 днів'],
    ];
    if (hasUpdates) tiles.push([snaps().length ? fmt.format(days.at(-1)?.updates ?? 0) : '—', 'перевірок оновлень сьогодні']);
    document.getElementById('tiles').innerHTML = tiles.map(([v, k]) => `<div class="st-tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');

    const keys = ['setup', 'portable'].filter((k) => sum(counts, k) > 0 || k === 'setup');
    document.getElementById('dl-legend').innerHTML = keys
      .map((k) => `<span><i style="background:${SERIES[k].color}"></i>${SERIES[k].label} <b>${fmt.format(sum(counts, k))}</b></span>`)
      .join('');
    drawBars(document.getElementById('dl-chart'), days, keys, NO_HISTORY);
    drawBars(document.getElementById('hour-chart'), downloads.length ? hourBars(downloads) : [], keys, snaps().length ? 'Тут зʼявиться, о котрій годині завантажують, щойно після початку запису хтось завантажить програму.' : NO_HISTORY);
    document.getElementById('upd-card').hidden = !hasUpdates;
    if (hasUpdates) drawBars(document.getElementById('upd-chart'), days, ['updates'], NO_HISTORY);

    // Journal: every download with its hour, newest first.
    const journal = [...downloads].sort((a, b) => b.to - a.to);
    const rowsShown = journal.slice(0, 200);
    let log = '<tr><th>Коли</th><th>Версія</th><th>Що</th><th>Скільки</th></tr>';
    for (const e of rowsShown) {
      const when = e.pending ? `після ${dm(e.from)} ${hm(e.from)} (ще не записано)` : span(e.from, e.to);
      log += `<tr><td>${when}</td><td>${m[e.tag]?.name ?? e.tag}</td><td>${SERIES[e.kind].label}</td><td>${fmt.format(e.n)}</td></tr>`;
    }
    document.getElementById('journal').innerHTML = journal.length ? log : `<tr><td>${snaps().length ? 'Після початку запису завантажень ще не було.' : 'Запис ще не почався.'}</td></tr>`;
    document.getElementById('journal-note').textContent = journal.length > rowsShown.length ? `Показано останні ${rowsShown.length} з ${journal.length}.` : '';

    // By version, newest first.
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

    // Every day as a row, newest first.
    let table = `<tr><th>День</th>${keys.map((k) => `<th>${SERIES[k].label}</th>`).join('')}<th>Разом</th>${hasUpdates ? '<th>Перевірки оновлень</th>' : ''}</tr>`;
    for (const b of [...days].reverse()) table += `<tr><td>${b.title}</td>${keys.map((k) => cell(b[k])).join('')}${cell(b.setup + b.portable)}${hasUpdates ? cell(b.updates) : ''}</tr>`;
    document.getElementById('days').innerHTML = days.length ? table : '<tr><td>Ще немає жодного дня.</td></tr>';

    const first = snaps()[0];
    const before = first ? sum(first.counts, 'setup') + sum(first.counts, 'portable') : 0;
    document.getElementById('note').textContent = [
      first ? `Запис іде з ${dm(Date.parse(first.at))} ${hm(Date.parse(first.at))}; ${fmt.format(before)} завантажень до того — без дати й часу.` : 'Щогодинний збір ще не записав жодного знімка.',
      'Час відомий з точністю до години: GitHub не каже, коли саме завантажили файл, тож це проміжок між двома перевірками.',
      live ? `Живі лічильники GitHub оновлено о ${hm(Date.parse(live.at))}.` : 'Живі лічильники GitHub зараз недоступні.',
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
    pending = requestAnimationFrame(() => (history || live ? render() : undefined));
  }).observe(document.getElementById('dl-chart'));

  Promise.all([loadHistory(), loadLive().catch(() => null)]).then(([h, l]) => {
    history = h;
    live = l;
    render();
  });
})();

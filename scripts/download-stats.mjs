// Records the download counts of every release file in a JSON history.
// GitHub only keeps a running total per file, so snapshots are what make
// "downloads per day" and "when were they downloaded" possible. Run every hour
// by .github/workflows/download-stats.yml; kadro.studio/stats/ draws the result.
//
//   node scripts/download-stats.mjs <history.json> [owner/repo]
//
// A snapshot is added only when some count changed. Its `since` is the time of
// the previous check, when the counts were still the old ones, so the new
// downloads happened between `since` and `at` (within the hour). GITHUB_TOKEN,
// when set, is used for the API (and to find the previous check in Actions).
import fs from 'node:fs';

const [file, repo = 'kadro-studio/kadro'] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node scripts/download-stats.mjs <history.json> [owner/repo]');
  process.exit(1);
}

/** What a release file is: the installer, the portable build, the update feed (one fetch per update check) or a blockmap. */
function kindOf(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.blockmap')) return 'blockmap';
  if (n.endsWith('.yml')) return 'updates';
  if (n.endsWith('.exe')) return n.includes('portable') ? 'portable' : 'setup';
  return 'other';
}

/** Kadro Animate has releases of its own in the same repository. */
function productOf(release) {
  return release.tag_name.startsWith('animate-') || release.assets.some((a) => a.name.startsWith('Kadro-Animate')) ? 'animate' : 'kadro';
}

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'kadro-download-stats' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function api(path) {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers });
  if (!r.ok) throw new Error(`GitHub API ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

/** When the previous successful run of this workflow read the counts (Actions only). */
async function previousCheck() {
  const workflow = process.env.STATS_WORKFLOW;
  if (!workflow || !process.env.GITHUB_TOKEN) return null;
  try {
    const { workflow_runs: runs } = await api(`/actions/workflows/${workflow}/runs?status=success&per_page=1`);
    return runs[0]?.updated_at ?? null;
  } catch {
    return null;
  }
}

const releases = [];
for (let page = 1; ; page++) {
  const batch = await api(`/releases?per_page=100&page=${page}`);
  releases.push(...batch.filter((rel) => !rel.draft));
  if (batch.length < 100) break;
}

let history = { repo, releases: {}, snapshots: [] };
if (fs.existsSync(file)) history = JSON.parse(fs.readFileSync(file, 'utf8'));

const counts = {};
for (const rel of releases) {
  history.releases[rel.tag_name] = { name: rel.name || rel.tag_name, published: rel.published_at, product: productOf(rel) };
  const c = { setup: 0, portable: 0, updates: 0, blockmap: 0, other: 0 };
  for (const a of rel.assets) c[kindOf(a.name)] += a.download_count;
  counts[rel.tag_name] = c;
}

// Compared tag by tag, whatever order the API lists the releases in.
const canon = (c) => JSON.stringify(Object.keys(c).sort().map((tag) => [tag, c[tag]]));
const last = history.snapshots.at(-1);
const changed = !last || canon(last.counts) !== canon(counts);
const at = new Date().toISOString();
if (changed) {
  // The new downloads happened after the previous check (an hour ago, or later if a run was skipped).
  const prev = last ? await previousCheck() : null;
  const since = last ? (prev && prev > last.at && prev < at ? prev : last.at) : null;
  history.snapshots.push({ at, since, counts });
}

const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const after = JSON.stringify(history, null, 1) + '\n';
if (after !== before) fs.writeFileSync(file, after);
const total = (product) =>
  Object.entries(counts)
    .filter(([tag]) => history.releases[tag]?.product === product)
    .reduce((s, [, c]) => s + c.setup + c.portable, 0);
console.log(`${at}: Kadro ${total('kadro')} downloads, Kadro Animate ${total('animate')}; ${changed ? 'new snapshot' : 'no change'} (${history.snapshots.length} snapshots)`);

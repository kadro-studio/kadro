// Records today's download counts of every release file in a JSON history.
// GitHub only keeps a running total per file, so a daily snapshot is what makes
// "downloads per day" possible. Run by .github/workflows/download-stats.yml;
// kadro.studio/stats/ draws the result.
//
//   node scripts/download-stats.mjs <history.json> [owner/repo]
//
// GITHUB_TOKEN, when set, is used for the API request (higher rate limit).
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
const releases = [];
for (let page = 1; ; page++) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, { headers });
  if (!r.ok) throw new Error(`GitHub API: ${r.status} ${await r.text()}`);
  const batch = await r.json();
  releases.push(...batch.filter((rel) => !rel.draft));
  if (batch.length < 100) break;
}

let history = { repo, releases: {}, days: [] };
if (fs.existsSync(file)) history = JSON.parse(fs.readFileSync(file, 'utf8'));

const counts = {};
for (const rel of releases) {
  history.releases[rel.tag_name] = { name: rel.name || rel.tag_name, published: rel.published_at, product: productOf(rel) };
  const c = { setup: 0, portable: 0, updates: 0, blockmap: 0, other: 0 };
  for (const a of rel.assets) c[kindOf(a.name)] += a.download_count;
  counts[rel.tag_name] = c;
}

const now = new Date();
const date = now.toISOString().slice(0, 10);
const snapshot = { date, at: now.toISOString(), counts };
// A second run on the same day replaces that day's snapshot.
history.days = history.days.filter((d) => d.date !== date);
history.days.push(snapshot);
history.days.sort((a, b) => a.date.localeCompare(b.date));

fs.writeFileSync(file, JSON.stringify(history, null, 1) + '\n');
const total = (product) =>
  Object.entries(counts)
    .filter(([tag]) => history.releases[tag]?.product === product)
    .reduce((s, [, c]) => s + c.setup + c.portable, 0);
console.log(`${date}: Kadro ${total('kadro')} downloads, Kadro Animate ${total('animate')} (${history.days.length} days recorded)`);

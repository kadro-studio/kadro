// Collects the licence texts of the bundled fonts into the app's public folder
// (OFL and Apache require them to travel with the font files).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const fonts = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) => n.startsWith('@fontsource'));
const parts = ['Fonts bundled with Kadro and their licences.\n'];
for (const name of fonts.sort()) {
  const dir = path.join(root, 'node_modules', name);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const license = fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8').trim();
  parts.push(`${'='.repeat(78)}\n${name} ${meta.version} — ${meta.license}\n${'='.repeat(78)}\n\n${license}\n`);
}
const out = path.join(root, 'src', 'renderer', 'public', 'THIRD_PARTY_FONTS.txt');
fs.writeFileSync(out, parts.join('\n'));
console.log(`${fonts.length} font licences → ${path.relative(root, out)}`);

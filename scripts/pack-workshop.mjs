// Packs the WordPress plugin (workshop/kadro-workshop) into release/kadro-workshop.zip,
// ready for Plugins → Add New → Upload Plugin.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'workshop', 'kadro-workshop');
const outDir = path.join(root, 'release');
const out = path.join(outDir, 'kadro-workshop.zip');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

// DOS date/time of a file for the zip headers.
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const locals = [];
const central = [];
let offset = 0;
for (const file of files(src).sort()) {
  const name = Buffer.from(path.join('kadro-workshop', path.relative(src, file)).split(path.sep).join('/'), 'utf8');
  const data = fs.readFileSync(file);
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data);
  const { time, date } = dosTime(fs.statSync(file).mtime);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x0800, 6); // UTF-8 names
  head.writeUInt16LE(8, 8); // deflate
  head.writeUInt16LE(time, 10);
  head.writeUInt16LE(date, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  locals.push(head, name, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt16LE(time, 12);
  entry.writeUInt16LE(date, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += head.length + name.length + packed.length;
}
const dir = Buffer.concat(central);
const count = central.length / 2;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(count, 8);
end.writeUInt16LE(count, 10);
end.writeUInt32LE(dir.length, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, Buffer.concat([...locals, dir, end]));
console.log(`${path.relative(root, out)}: ${count} files, ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);

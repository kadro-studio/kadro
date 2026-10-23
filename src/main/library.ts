// Online media library: searches free sources and downloads the chosen file
// into the app's cache. Every result carries its author and licence.
import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { LibraryItem, LibraryKind, LibraryResult, LibrarySearch, ShadertoyShader } from '../shared/api';

const UA = 'Kadro/0.1 (free open-source video editor)';
const PAGE = 24;
const MAX_DOWNLOAD = 1.5 * 1024 ** 3;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const detail = /"detail"\s*:\s*"([^"]+)/.exec(body)?.[1] ?? body.slice(0, 120);
    // Key-based sources answer 401/403 for a wrong key.
    if ((r.status === 401 || r.status === 403) && headers.Authorization) throw new Error('API key rejected');
    if ((r.status === 401 || r.status === 403 || r.status === 400) && /key/i.test(url) && /key/i.test(detail)) throw new Error('API key rejected');
    throw new Error(`${new URL(url).host}: HTTP ${r.status}${detail ? ` (${detail})` : ''}`);
  }
  return r.json();
}

function stripHtml(s: string | undefined): string {
  return (s ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

// ---------------------------------------------------------------------------
// Openverse (images, audio): CC0, public domain and CC BY by default

interface OvItem {
  id: string;
  title?: string;
  url: string;
  thumbnail?: string;
  creator?: string;
  creator_url?: string;
  license: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  attribution?: string;
  width?: number;
  height?: number;
  duration?: number;
  filetype?: string;
  provider?: string;
  category?: string;
}

async function openverse(q: LibrarySearch): Promise<LibraryResult> {
  const kind = q.kind === 'audio' ? 'audio' : 'images';
  // Anonymous Openverse requests are limited to 20 results per page.
  const params = new URLSearchParams({ q: q.query || (q.kind === 'audio' ? (q.audioCategory === 'sound_effect' ? 'ambience' : 'calm instrumental') : 'nature'), page: String(q.page), page_size: '20', license: 'cc0,pdm,by', mature: 'false' });
  if (q.kind === 'audio' && q.audioCategory) params.set('category', q.audioCategory);
  const data = (await getJson(`https://api.openverse.org/v1/${kind}/?${params}`)) as { result_count: number; page_count: number; results: OvItem[] };
  const items: LibraryItem[] = data.results.map((r) => ({
    id: `ov-${r.id}`,
    provider: 'openverse',
    kind: q.kind,
    title: r.title || 'Untitled',
    thumb: r.thumbnail ?? r.url,
    preview: q.kind === 'audio' ? r.url : undefined,
    downloadUrl: r.url,
    ext: q.kind === 'audio' ? (r.filetype && /^(mp3|ogg|flac|wav|m4a)$/.test(r.filetype) ? r.filetype : 'mp3') : 'jpg',
    width: r.width,
    height: r.height,
    duration: r.duration ? r.duration / 1000 : undefined,
    author: r.creator ?? '',
    authorUrl: r.creator_url,
    license: r.license === 'cc0' ? 'CC0' : r.license === 'pdm' ? 'Public domain' : `CC ${r.license.toUpperCase()} ${r.license_version ?? ''}`.trim(),
    licenseUrl: r.license_url,
    sourceUrl: r.foreign_landing_url ?? r.url,
    attribution: r.attribution ?? '',
    origin: r.provider,
  }));
  return { items, hasMore: q.page < data.page_count };
}

// ---------------------------------------------------------------------------
// Wikimedia Commons (video, images)

interface CommonsPage {
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl: string;
    width: number;
    height: number;
    duration?: number;
    mime: string;
    size: number;
    extmetadata?: Record<string, { value: string }>;
  }[];
}

const COMMONS_FREE = /^(cc0|public domain|pd|cc by(?!-nc)|cc-by(?!-nc)|cc by-sa|cc-by-sa|attribution)/i;

async function commons(q: LibrarySearch): Promise<LibraryResult> {
  const filetype = q.kind === 'video' ? 'filetype:video' : 'filetype:bitmap';
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${q.query || (q.kind === 'video' ? 'nature' : 'landscape')} ${filetype}`,
    gsrnamespace: '6',
    gsrlimit: String(PAGE),
    gsroffset: String((q.page - 1) * PAGE),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '480',
    iiextmetadatafilter: 'LicenseShortName|Artist|LicenseUrl|ObjectName',
    origin: '*',
  });
  const data = (await getJson(`https://commons.wikimedia.org/w/api.php?${params}`)) as {
    continue?: unknown;
    query?: { pages: Record<string, CommonsPage & { index: number }> };
  };
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  const items: LibraryItem[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const meta = ii.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value) || 'see source';
    // Only freely reusable material: no non-commercial or unclear terms.
    if (!COMMONS_FREE.test(license)) continue;
    if (q.kind === 'video' && (ii.width < 640 || !(ii.duration && ii.duration > 1))) continue;
    const author = stripHtml(meta.Artist?.value);
    const title = stripHtml(meta.ObjectName?.value) || p.title.replace(/^File:/, '').replace(/\.[^.]+$/, '');
    const ext = (p.title.split('.').pop() ?? 'bin').toLowerCase();
    items.push({
      id: `wc-${crypto.createHash('sha1').update(p.title).digest('hex').slice(0, 16)}`,
      provider: 'commons',
      kind: q.kind,
      title,
      thumb: ii.thumburl ?? ii.url,
      downloadUrl: ii.url.split('?')[0],
      ext,
      width: ii.width,
      height: ii.height,
      duration: ii.duration,
      size: ii.size,
      author,
      license,
      licenseUrl: meta.LicenseUrl?.value,
      sourceUrl: ii.descriptionurl,
      attribution: `"${title}" by ${author || 'unknown'}, ${license}, via Wikimedia Commons (${ii.descriptionurl})`,
    });
  }
  return { items, hasMore: !!data.continue };
}

// ---------------------------------------------------------------------------
// Pexels and Pixabay (need the user's free API key)

interface PexelsVideo {
  id: number;
  url: string;
  image: string;
  duration: number;
  width: number;
  height: number;
  user: { name: string; url: string };
  video_files: { quality: string; file_type: string; width: number; height: number; link: string }[];
}
interface PexelsPhoto {
  id: number;
  url: string;
  width: number;
  height: number;
  alt?: string;
  photographer: string;
  photographer_url: string;
  src: Record<string, string>;
}

async function pexels(q: LibrarySearch): Promise<LibraryResult> {
  if (!q.keys?.pexels) throw new Error('NO_KEY');
  const headers = { Authorization: q.keys.pexels };
  const params = new URLSearchParams({ query: q.query || 'nature', per_page: String(PAGE), page: String(q.page) });
  if (q.kind === 'video') {
    const data = (await getJson(`https://api.pexels.com/videos/search?${params}`, headers)) as { videos: PexelsVideo[]; next_page?: string };
    const items = data.videos.map((v): LibraryItem => {
      const mp4 = v.video_files.filter((f) => f.file_type === 'video/mp4').sort((a, b) => b.width - a.width);
      // Largest file up to 4K for download, a small one for the hover preview.
      const best = mp4.find((f) => f.width <= 3840) ?? mp4[0];
      const small = [...mp4].reverse().find((f) => f.width >= 360) ?? mp4[mp4.length - 1];
      return {
        id: `px-v${v.id}`,
        provider: 'pexels',
        kind: 'video',
        title: `Pexels video ${v.id}`,
        thumb: v.image,
        preview: small?.link,
        downloadUrl: best?.link ?? '',
        ext: 'mp4',
        width: best?.width ?? v.width,
        height: best?.height ?? v.height,
        duration: v.duration,
        author: v.user.name,
        authorUrl: v.user.url,
        license: 'Pexels License',
        licenseUrl: 'https://www.pexels.com/license/',
        sourceUrl: v.url,
        attribution: `Video by ${v.user.name} from Pexels (${v.url})`,
      };
    });
    return { items: items.filter((i) => i.downloadUrl), hasMore: !!data.next_page };
  }
  const data = (await getJson(`https://api.pexels.com/v1/search?${params}`, headers)) as { photos: PexelsPhoto[]; next_page?: string };
  return {
    items: data.photos.map((p) => ({
      id: `px-p${p.id}`,
      provider: 'pexels',
      kind: 'image',
      title: p.alt || `Pexels photo ${p.id}`,
      thumb: p.src.medium ?? p.src.small,
      downloadUrl: p.src.large2x ?? p.src.original,
      ext: 'jpg',
      width: p.width,
      height: p.height,
      author: p.photographer,
      authorUrl: p.photographer_url,
      license: 'Pexels License',
      licenseUrl: 'https://www.pexels.com/license/',
      sourceUrl: p.url,
      attribution: `Photo by ${p.photographer} from Pexels (${p.url})`,
    })),
    hasMore: !!data.next_page,
  };
}

interface PixabayHit {
  id: number;
  pageURL: string;
  user: string;
  tags?: string;
  duration?: number;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  videos?: Record<string, { url: string; width: number; height: number; thumbnail?: string }>;
}

async function pixabay(q: LibrarySearch): Promise<LibraryResult> {
  if (!q.keys?.pixabay) throw new Error('NO_KEY');
  const params = new URLSearchParams({ key: q.keys.pixabay, q: q.query || 'nature', per_page: String(PAGE), page: String(q.page), safesearch: 'true' });
  const base = q.kind === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/';
  if (q.kind !== 'video') params.set('image_type', 'photo');
  const data = (await getJson(`${base}?${params}`)) as { totalHits: number; hits: PixabayHit[] };
  const items = data.hits.map((h): LibraryItem => {
    const v = h.videos;
    const big = v?.large?.url ? v.large : v?.medium;
    return {
      id: `pb-${h.id}`,
      provider: 'pixabay',
      kind: q.kind,
      title: h.tags ? h.tags.split(',')[0].trim() : `Pixabay ${h.id}`,
      thumb: v ? (v.medium?.thumbnail ?? v.small?.thumbnail ?? '') : (h.webformatURL ?? h.previewURL ?? ''),
      preview: v?.tiny?.url ?? v?.small?.url,
      downloadUrl: v ? (big?.url ?? '') : (h.largeImageURL ?? h.webformatURL ?? ''),
      ext: v ? 'mp4' : 'jpg',
      width: v ? big?.width : h.imageWidth,
      height: v ? big?.height : h.imageHeight,
      duration: h.duration,
      author: h.user,
      license: 'Pixabay Content License',
      licenseUrl: 'https://pixabay.com/service/license-summary/',
      sourceUrl: h.pageURL,
      attribution: `${v ? 'Video' : 'Image'} by ${h.user} from Pixabay (${h.pageURL})`,
    };
  });
  return { items: items.filter((i) => i.downloadUrl && i.thumb), hasMore: q.page * PAGE < data.totalHits };
}

export async function searchLibrary(q: LibrarySearch): Promise<LibraryResult> {
  switch (q.provider) {
    case 'openverse':
      return openverse(q);
    case 'commons':
      return commons(q);
    case 'pexels':
      return pexels(q);
    case 'pixabay':
      return pixabay(q);
    default:
      throw new Error('unknown provider');
  }
}

function libraryDir(): string {
  const dir = path.join(app.getPath('userData'), 'library');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const KIND_MIME: Record<LibraryKind, RegExp> = {
  video: /^(video\/|application\/ogg|application\/octet-stream)/,
  image: /^(image\/|application\/octet-stream)/,
  audio: /^(audio\/|video\/|application\/ogg|application\/octet-stream)/,
};

/** Downloads a library item (once) and returns the local path. */
export async function downloadLibraryItem(item: LibraryItem, onProgress: (p: number) => void): Promise<string> {
  const url = new URL(item.downloadUrl);
  if (url.protocol !== 'https:') throw new Error('Only https downloads are allowed');
  const safeTitle = item.title.replace(/[^\p{L}\p{N} _.-]+/gu, '').trim().slice(0, 60) || item.id;
  const ext = (item.ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
  const out = path.join(libraryDir(), `${safeTitle} [${item.id}].${ext}`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30 * 60_000) });
  if (!r.ok || !r.body) throw new Error(`Download failed: HTTP ${r.status}`);
  const type = r.headers.get('content-type') ?? 'application/octet-stream';
  if (!KIND_MIME[item.kind].test(type)) throw new Error(`Unexpected file type: ${type}`);
  const total = Number(r.headers.get('content-length')) || item.size || 0;
  if (total > MAX_DOWNLOAD) throw new Error('File is too large');
  const tmp = `${out}.part`;
  let done = 0;
  let last = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      done += chunk.byteLength;
      if (done > MAX_DOWNLOAD) throw new Error('File is too large');
      const now = Date.now();
      if (total && now - last > 150) {
        last = now;
        onProgress(Math.min(0.99, done / total));
      }
      ctrl.enqueue(chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(r.body.pipeThrough(counter) as import('node:stream/web').ReadableStream), fs.createWriteStream(tmp));
    await fs.promises.rename(tmp, out);
  } catch (e) {
    await fs.promises.unlink(tmp).catch(() => undefined);
    throw e;
  }
  onProgress(1);
  return out;
}

// ---------------------------------------------------------------------------
// Shadertoy (one shader by id, with the user's free API key)

interface StPass {
  type: string;
  name?: string;
  code: string;
}

interface StResponse {
  Error?: string;
  Shader?: { info: { id: string; name: string; username: string; description?: string; tags?: string[] }; renderpass: StPass[] };
}

export async function fetchShadertoy(id: string, key: string): Promise<ShadertoyShader> {
  if (!/^[A-Za-z0-9]{4,12}$/.test(id)) throw new Error('Invalid shader id');
  const data = (await getJson(`https://www.shadertoy.com/api/v1/shaders/${id}?key=${encodeURIComponent(key)}`)) as StResponse;
  if (data.Error || !data.Shader) throw new Error(data.Error ?? 'Shader not found');
  const passes = data.Shader.renderpass;
  const image = passes.find((p) => p.type === 'image');
  if (!image) throw new Error('No image pass');
  const common = passes.filter((p) => p.type === 'common').map((p) => p.code);
  const info = data.Shader.info;
  return {
    id: info.id,
    name: info.name,
    author: info.username,
    description: stripHtml(info.description).slice(0, 300),
    code: [...common, image.code].join('\n'),
    buffers: passes.filter((p) => p.type === 'buffer' || p.type === 'cubemap').length,
    url: `https://www.shadertoy.com/view/${info.id}`,
  };
}

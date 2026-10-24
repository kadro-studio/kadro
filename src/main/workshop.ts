// Client of the community workshop (WordPress site with the kadro-workshop
// plugin). Requests run here rather than in the page: the account's
// application password is stored encrypted by the OS (safeStorage) and never
// returned to the renderer.
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkshopAccount, WorkshopPublish, WorkshopQuery } from '../shared/api';
import { SITE_URL, WORKSHOP_URL } from '../shared/brand';

const MAX_DOWNLOAD = 64 * 1024 * 1024;
const UA = `${app.getName()}/${app.getVersion()} (+${WORKSHOP_URL})`;

/**
 * The website publishes the workshop's address and whether it is open
 * (website/workshop.json), so the server can open or move without a new app
 * release. Offline, the built-in address is used.
 */
interface RemoteConfig {
  url: string;
  open: boolean;
}
let remote: RemoteConfig | null = null;
let remoteAt = 0;
const REMOTE_TTL = 30 * 60_000;

async function loadRemote(): Promise<void> {
  if (process.env.KADRO_WORKSHOP_URL || (remote && Date.now() - remoteAt < REMOTE_TTL)) return;
  try {
    const r = await fetch(`${SITE_URL}workshop.json`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return;
    const j = (await r.json()) as Partial<RemoteConfig>;
    const url = (typeof j.url === 'string' ? j.url : WORKSHOP_URL).replace(/\/+$/, '');
    if (new URL(url).protocol !== 'https:') return;
    remote = { url, open: j.open !== false };
    remoteAt = Date.now();
  } catch {
    // offline or not published yet
  }
}

/** Thrown while the website says the workshop is not open yet. */
const CLOSED = 'WORKSHOP_CLOSED';

async function ready(): Promise<void> {
  await loadRemote();
  if (remote && !remote.open) throw new Error(CLOSED);
}

/** Site root; tests point it at a local WordPress through KADRO_WORKSHOP_URL. */
export function workshopSite(): string {
  return (process.env.KADRO_WORKSHOP_URL || remote?.url || WORKSHOP_URL).replace(/\/+$/, '');
}

function apiBase(): string {
  return `${workshopSite()}/wp-json/kadro/v1`;
}

/** Only https, or plain http to this computer (local test sites). */
function checkUrl(url: string): URL {
  const u = new URL(url);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('Insecure workshop address');
  return u;
}

// ---------------------------------------------------------------------------
// Account (application password), encrypted at rest

interface StoredAuth {
  site: string;
  user: string;
  /** base64 of safeStorage-encrypted password, or plain when encryption is unavailable. */
  secret: string;
  encrypted: boolean;
}

const authFile = () => path.join(app.getPath('userData'), 'workshop-account.json');

function readAuth(): { site: string; user: string; password: string } | null {
  try {
    const s = JSON.parse(fs.readFileSync(authFile(), 'utf8')) as StoredAuth;
    if (s.site !== workshopSite()) return null;
    const password = s.encrypted ? safeStorage.decryptString(Buffer.from(s.secret, 'base64')) : s.secret;
    return { site: s.site, user: s.user, password };
  } catch {
    return null;
  }
}

export function saveAuth(user: string, password: string): void {
  const encrypted = safeStorage.isEncryptionAvailable();
  const secret = encrypted ? safeStorage.encryptString(password).toString('base64') : password;
  const data: StoredAuth = { site: workshopSite(), user, secret, encrypted };
  fs.writeFileSync(authFile(), JSON.stringify(data), { mode: 0o600 });
}

export function clearAuth(): void {
  fs.rmSync(authFile(), { force: true });
}

function authHeader(): Record<string, string> {
  const a = readAuth();
  return a ? { Authorization: `Basic ${Buffer.from(`${a.user}:${a.password}`).toString('base64')}` } : {};
}

/** WordPress page that creates an application password and sends it back to kadro://auth. */
export async function authorizeUrl(): Promise<string> {
  await ready();
  const u = new URL(`${workshopSite()}/wp-admin/authorize-application.php`);
  u.searchParams.set('app_name', 'Kadro');
  u.searchParams.set('app_id', '6b1d6f0e-3d4c-4f6a-9a5e-4b2f9c1d7e21');
  u.searchParams.set('success_url', 'kadro://auth');
  return u.toString();
}

/** Handles kadro://auth?site_url=…&user_login=…&password=… from the browser. */
export function acceptAuthRedirect(url: string): boolean {
  const u = new URL(url);
  const user = u.searchParams.get('user_login');
  const password = u.searchParams.get('password');
  const site = (u.searchParams.get('site_url') ?? '').replace(/\/+$/, '');
  if (!user || !password) return false;
  // Only credentials issued by our workshop are kept.
  if (site && site !== workshopSite()) return false;
  saveAuth(user, password);
  return true;
}

// ---------------------------------------------------------------------------
// Requests

async function call<T>(method: string, route: string, body?: FormData, auth = false): Promise<T> {
  await ready();
  const url = checkUrl(`${apiBase()}${route}`);
  const r = await fetch(url, {
    method,
    body,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(auth ? authHeader() : {}) },
    signal: AbortSignal.timeout(60000),
  });
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON (e.g. a hosting error page)
  }
  if (!r.ok) {
    const msg = (data as { message?: string } | null)?.message;
    if (r.status === 401 || r.status === 403) throw new Error(msg || 'Not signed in');
    if (r.status === 404 && !msg) throw new Error('Workshop is not available');
    throw new Error(msg ? msg.replace(/<[^>]+>/g, '') : `HTTP ${r.status}`);
  }
  return data as T;
}

export function listItems(q: WorkshopQuery): Promise<unknown> {
  const p = new URLSearchParams();
  if (q.kind) p.set('kind', q.kind);
  if (q.search) p.set('search', q.search);
  if (q.sort) p.set('sort', q.sort);
  if (q.mine) p.set('mine', '1');
  p.set('page', String(q.page ?? 1));
  p.set('per_page', String(q.perPage ?? 24));
  // Signed in, the list says which items the user already liked.
  return call('GET', `/items?${p}`, undefined, true);
}

export function getItem(id: number): Promise<unknown> {
  return call('GET', `/items/${Number(id)}`, undefined, true);
}

export function likeItem(id: number): Promise<unknown> {
  return call('POST', `/items/${Number(id)}/like`, undefined, true);
}

export function deleteItem(id: number): Promise<unknown> {
  return call('DELETE', `/items/${Number(id)}`, undefined, true);
}

/** Downloads an item's file (counted by the site) as bytes. */
export async function downloadItem(id: number): Promise<Uint8Array> {
  await ready();
  const url = checkUrl(`${apiBase()}/items/${Number(id)}/file`);
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_DOWNLOAD) throw new Error('File is too large');
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.byteLength > MAX_DOWNLOAD) throw new Error('File is too large');
  return buf;
}

export async function publishItem(p: WorkshopPublish): Promise<unknown> {
  const form = new FormData();
  form.set('kind', p.kind);
  form.set('title', p.title);
  form.set('description', p.description);
  form.set('version', p.version);
  form.set('license', p.license);
  form.set('tags', p.tags.join(','));
  // IPC delivers Uint8Arrays; copy into plain ArrayBuffers for Blob.
  form.set('file', new Blob([Uint8Array.from(p.file).buffer]), p.fileName);
  if (p.preview) form.set('preview', new Blob([Uint8Array.from(p.preview).buffer], { type: 'image/jpeg' }), 'preview.jpg');
  if (p.updateId) form.set('update', String(p.updateId));
  return call('POST', '/items', form, true);
}

export async function account(): Promise<WorkshopAccount | null> {
  const a = readAuth();
  if (!a) return null;
  try {
    return await call<WorkshopAccount>('GET', '/me', undefined, true);
  } catch (e) {
    // Keep the stored login when the site is just unreachable.
    if (e instanceof Error && /Not signed in|Invalid|incorrect/i.test(e.message)) return { name: a.user, login: a.user, valid: false };
    return { name: a.user, login: a.user, valid: true, offline: true };
  }
}

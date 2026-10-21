export const EPS = 1e-6;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function snapToFrame(t: number, fps: number): number {
  return Math.round(t * fps) / fps;
}

export function frameDuration(fps: number): number {
  return 1 / fps;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** HH:MM:SS:FF */
export function formatTimecode(t: number, fps: number): string {
  const totalFrames = Math.max(0, Math.round(t * fps));
  const fpsInt = Math.round(fps);
  const frames = totalFrames % fpsInt;
  const totalSeconds = Math.floor(totalFrames / fpsInt);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(frames)}`;
}

/** m:ss or h:mm:ss */
export function formatDuration(t: number): string {
  const total = Math.max(0, Math.round(t));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Ruler label: shows frames only when zoomed in far enough to need them. */
export function formatRuler(t: number, fps: number, withFrames: boolean): string {
  const fpsInt = Math.round(fps);
  const totalFrames = Math.round(t * fps);
  const sec = Math.floor(totalFrames / fpsInt);
  const f = totalFrames % fpsInt;
  const s = sec % 60;
  const m = Math.floor(sec / 60);
  const base = `${m}:${pad(s)}`;
  return withFrames && f !== 0 ? `${base}:${pad(f)}` : base;
}

/** Parses "HH:MM:SS:FF", "MM:SS", "SS.s" etc. Returns null when invalid. */
export function parseTimecode(text: string, fps: number): number | null {
  const s = text.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 4) return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / fps;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

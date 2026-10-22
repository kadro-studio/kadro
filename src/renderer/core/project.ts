import type {
  Adjust,
  AudioFx,
  ChromaKey,
  ClipMask,
  ColorWheels,
  ShapeKind,
  ShapeStyle,
  Clip,
  ClipType,
  Crop,
  MediaAsset,
  Project,
  TextStyle,
  Track,
  TrackKind,
  Transform,
} from './types';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const DEFAULT_IMAGE_DURATION = 5;
export const DEFAULT_TEXT_DURATION = 5;

export function defaultTransform(): Transform {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipH: false, flipV: false };
}

export function defaultCrop(): Crop {
  return { left: 0, top: 0, right: 0, bottom: 0 };
}

export function defaultAdjust(): Adjust {
  return {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    hue: 0,
    highlights: 0,
    shadows: 0,
    vignette: 0,
    blur: 0,
    sharpen: 0,
  };
}

export function defaultWheels(): ColorWheels {
  return { lift: { x: 0, y: 0, l: 0 }, gamma: { x: 0, y: 0, l: 0 }, gain: { x: 0, y: 0, l: 0 } };
}

export function defaultShape(kind: ShapeKind = 'rect'): ShapeStyle {
  const square = ['ellipse', 'star', 'triangle', 'heart', 'burst', 'hexagon', 'ring', 'check', 'cross'].includes(kind);
  return {
    kind,
    width: kind === 'line' || kind === 'arrow' ? 600 : square ? 400 : 640,
    height: kind === 'line' ? 12 : kind === 'arrow' ? 160 : kind === 'pill' ? 160 : square ? 400 : 360,
    fill: '#4d8dff',
    fillOpacity: 100,
    stroke: '#ffffff',
    strokeWidth: 0,
    radius: kind === 'bubble' ? 40 : 0,
  };
}

export function defaultMask(): ClipMask {
  return { shape: 'none', x: 0.5, y: 0.5, width: 0.6, height: 0.6, rotation: 0, feather: 0.05, invert: false };
}

export function defaultAudioFx(): AudioFx {
  return { low: 0, mid: 0, high: 0, compressor: false };
}

export function defaultChroma(): ChromaKey {
  return { enabled: false, color: '#00ff00', similarity: 40, smoothness: 10, spill: 50 };
}

export function defaultTextStyle(): TextStyle {
  return {
    content: 'Text',
    fontFamily: 'Montserrat Variable',
    fontSize: 96,
    bold: true,
    weight: 700,
    italic: false,
    color: '#ffffff',
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: '#000000',
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 0,
    background: '#000000',
    backgroundOpacity: 0,
    backgroundPadding: 24,
    backgroundRadius: 12,
  };
}

export function makeClip(type: ClipType, partial: Partial<Clip> = {}): Clip {
  return {
    id: uid(),
    type,
    name: type,
    start: 0,
    duration: DEFAULT_IMAGE_DURATION,
    mediaId: null,
    in: 0,
    speed: 1,
    transform: defaultTransform(),
    crop: defaultCrop(),
    adjust: defaultAdjust(),
    wheels: defaultWheels(),
    filter: { id: 'none', amount: 100 },
    effects: [],
    mask: defaultMask(),
    lut: null,
    curves: null,
    hsl: null,
    chroma: defaultChroma(),
    blend: 'normal',
    animIn: { type: 'none', duration: 0.5 },
    animOut: { type: 'none', duration: 0.5 },
    transition: { type: 'none', duration: 0.6 },
    keyframes: {},
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    muted: false,
    audioFx: defaultAudioFx(),
    text: null,
    shape: null,
    overlay: null,
    color: '#1e88e5',
    ...partial,
  };
}

export function makeTrack(kind: TrackKind, name: string): Track {
  return { id: uid(), kind, name, muted: false, hidden: false, locked: false, volume: 1, clips: [] };
}

export function createProject(name = 'Untitled'): Project {
  return {
    version: 1,
    name,
    settings: { width: 1920, height: 1080, fps: 30, background: '#000000' },
    media: [],
    tracks: [makeTrack('video', 'V1'), makeTrack('video', 'V2'), makeTrack('audio', 'A1'), makeTrack('audio', 'A2')],
    markers: [],
  };
}

export function clipEnd(c: Clip): number {
  return c.start + c.duration;
}

export function isVisual(c: Clip): boolean {
  return c.type !== 'audio';
}

export function hasMedia(c: Clip): boolean {
  return c.type === 'video' || c.type === 'audio' || c.type === 'image';
}

/** Whether the clip's media has a time axis (trimming is bounded by source length). */
export function isTimeBased(c: Clip): boolean {
  return c.type === 'video' || c.type === 'audio';
}

export function projectDuration(p: Project): number {
  let end = 0;
  for (const t of p.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c));
  return end;
}

export function mediaMap(p: Project): Map<string, MediaAsset> {
  return new Map(p.media.map((m) => [m.id, m]));
}

export function findClip(p: Project, id: string): { clip: Clip; track: Track; index: number } | null {
  for (const track of p.tracks) {
    const index = track.clips.findIndex((c) => c.id === id);
    if (index >= 0) return { clip: track.clips[index], track, index };
  }
  return null;
}

export function findTrack(p: Project, id: string): Track | null {
  return p.tracks.find((t) => t.id === id) ?? null;
}

export function tracksOfKind(p: Project, kind: TrackKind): Track[] {
  return p.tracks.filter((t) => t.kind === kind);
}

/** Order in which tracks are shown top-to-bottom in the timeline. */
export function displayTracks(p: Project): Track[] {
  return [...tracksOfKind(p, 'video').reverse(), ...tracksOfKind(p, 'audio')];
}

/** Longest timeline length the clip may have given its source media. */
export function maxClipDuration(c: Clip, media: MediaAsset | undefined): number {
  if (!isTimeBased(c) || !media || !(media.duration > 0)) return Infinity;
  return Math.max(0, (media.duration - c.in) / c.speed);
}

export function clipAtTime(track: Track, t: number): Clip | null {
  for (const c of track.clips) {
    if (t >= c.start && t < clipEnd(c)) return c;
  }
  return null;
}

/** Previous clip ending exactly where `clip` starts (within half a frame). */
export function adjacentBefore(track: Track, clip: Clip, fps: number): Clip | null {
  const tol = 0.5 / fps;
  for (const c of track.clips) {
    if (c.id !== clip.id && Math.abs(clipEnd(c) - clip.start) <= tol) return c;
  }
  return null;
}

export function adjacentAfter(track: Track, clip: Clip, fps: number): Clip | null {
  const tol = 0.5 / fps;
  for (const c of track.clips) {
    if (c.id !== clip.id && Math.abs(c.start - clipEnd(clip)) <= tol) return c;
  }
  return null;
}

export function sortClips(track: Track): void {
  track.clips.sort((a, b) => a.start - b.start);
}

/** Next free track name like "V3". */
export function nextTrackName(p: Project, kind: TrackKind): string {
  const prefix = kind === 'video' ? 'V' : 'A';
  let n = 1;
  const names = new Set(p.tracks.map((t) => t.name));
  while (names.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Fills defaults into a project loaded from disk (older or hand-edited files). */
export function normalizeProject(raw: unknown): Project {
  const src = (raw ?? {}) as Partial<Project>;
  const base = createProject(src.name ?? 'Untitled');
  const settings = { ...base.settings, ...(src.settings ?? {}) };
  const media = Array.isArray(src.media) ? src.media.filter((m) => m && m.id && m.path) : [];
  const tracks: Track[] = Array.isArray(src.tracks)
    ? src.tracks.map((t) => {
        const kind: TrackKind = t.kind === 'audio' ? 'audio' : 'video';
        const track = { ...makeTrack(kind, t.name ?? kind), ...t, kind };
        track.clips = (Array.isArray(t.clips) ? t.clips : []).map((c) => {
          const def = makeClip(c.type ?? 'video');
          return {
            ...def,
            ...c,
            transform: { ...def.transform, ...(c.transform ?? {}) },
            crop: { ...def.crop, ...(c.crop ?? {}) },
            adjust: { ...def.adjust, ...(c.adjust ?? {}) },
            filter: { ...def.filter, ...(c.filter ?? {}) },
            chroma: { ...def.chroma, ...(c.chroma ?? {}) },
            mask: { ...def.mask, ...(c.mask ?? {}) },
            lut:
              c.lut && typeof c.lut.path === 'string'
                ? { path: c.lut.path, name: c.lut.name ?? c.lut.path, amount: typeof c.lut.amount === 'number' ? c.lut.amount : 100 }
                : null,
            audioFx: { ...def.audioFx, ...(c.audioFx ?? {}) },
            wheels: {
              lift: { ...def.wheels.lift, ...(c.wheels?.lift ?? {}) },
              gamma: { ...def.wheels.gamma, ...(c.wheels?.gamma ?? {}) },
              gain: { ...def.wheels.gain, ...(c.wheels?.gain ?? {}) },
            },
            shape: c.type === 'shape' ? { ...defaultShape(c.shape?.kind), ...(c.shape ?? {}) } : null,
            overlay: c.type === 'overlay' && c.overlay ? { id: String(c.overlay.id), params: { ...(c.overlay.params ?? {}) }, colorA: c.overlay.colorA ?? '#ffffff', colorB: c.overlay.colorB ?? '#ffffff' } : null,
            animIn: { ...def.animIn, ...(c.animIn ?? {}) },
            animOut: { ...def.animOut, ...(c.animOut ?? {}) },
            transition: { ...def.transition, ...(c.transition ?? {}) },
            keyframes: { ...(c.keyframes ?? {}) },
            effects: Array.isArray(c.effects)
              ? c.effects.filter((e) => e && typeof e.type === 'string').map((e) => ({ id: e.id ?? uid(), type: e.type, enabled: e.enabled !== false, params: { ...(e.params ?? {}) } }))
              : [],
            // Projects from before variable weights only stored bold.
            text: c.type === 'text' ? { ...defaultTextStyle(), ...(c.text ?? {}), weight: c.text?.weight ?? (c.text?.bold === false ? 400 : 700) } : null,
          };
        });
        sortClips(track);
        return track;
      })
    : base.tracks;
  if (!tracks.some((t) => t.kind === 'video')) tracks.unshift(makeTrack('video', 'V1'));
  if (!tracks.some((t) => t.kind === 'audio')) tracks.push(makeTrack('audio', 'A1'));
  return {
    version: 1,
    name: src.name ?? 'Untitled',
    settings,
    media,
    tracks,
    markers: Array.isArray(src.markers) ? src.markers : [],
    fx: Array.isArray(src.fx) ? src.fx : [],
  };
}

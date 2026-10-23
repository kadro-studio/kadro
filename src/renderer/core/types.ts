import type { MediaKind } from '../../shared/api';

export type { MediaKind };

export type TrackKind = 'video' | 'audio';
/** 'adjustment' applies its effects and colour to everything below it; 'shape' is a vector graphic. */
export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'color' | 'adjustment' | 'shape' | 'overlay';

export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'line'
  | 'bubble'
  | 'pill'
  | 'heart'
  | 'burst'
  | 'hexagon'
  | 'ring'
  | 'check'
  | 'cross';

/** Procedural animated element (overlay or background) drawn by a generator shader. */
export interface OverlayStyle {
  /** Generator definition id. */
  id: string;
  params: Record<string, number>;
  colorA: string;
  colorB: string;
}

export interface ShapeStyle {
  kind: ShapeKind;
  /** Project pixels. */
  width: number;
  height: number;
  fill: string;
  /** 0..100 */
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  /** Corner radius for rectangles / bubbles, px. */
  radius: number;
}

/** One colour wheel: x, y in -1..1 (hue/strength), l = brightness -1..1. */
export interface Wheel {
  x: number;
  y: number;
  l: number;
}

/** Lift / gamma / gain primary correction (shadows, midtones, highlights). */
export interface ColorWheels {
  lift: Wheel;
  gamma: Wheel;
  gain: Wheel;
}
export type BlendMode =
  | 'normal'
  | 'add'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'softLight'
  | 'hardLight'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'exclusion'
  | 'colorDodge'
  | 'colorBurn'
  | 'linearBurn'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/** Curve control point, both axes 0..1. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** Tone curves: master first, then per channel. */
export interface Curves {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export type HslBand = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta';

/** Per-colour-range hue / saturation / lightness shifts, -100..100. */
export type HslAdjust = Record<HslBand, { h: number; s: number; l: number }>;
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';
export type AnimProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume';

export interface Keyframe {
  /** Seconds from clip start. */
  t: number;
  v: number;
  /** Interpolation towards the next keyframe. */
  ease: Ease;
}

export interface Transform {
  /** Offset of the layer centre from the frame centre, project pixels. */
  x: number;
  y: number;
  /** 1 = media fitted inside the frame. */
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** 0..1 */
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  /** Width and height stretch of pictures (video, image) on top of scale; 1 keeps the proportions. */
  stretchX: number;
  stretchY: number;
}

/** Fractions (0..1) hidden from each edge. */
export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Colour correction. All values are -100..100 except blur/vignette/sharpen (0..100). */
export interface Adjust {
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  hue: number;
  highlights: number;
  shadows: number;
  vignette: number;
  blur: number;
  sharpen: number;
}

export interface ChromaKey {
  enabled: boolean;
  color: string;
  similarity: number;
  smoothness: number;
  spill: number;
}

export interface ClipAnim {
  type: string;
  duration: number;
}

export interface ClipTransition {
  type: string;
  duration: number;
  /** Parameters of shader transitions (built-in or mod). */
  params?: Record<string, number>;
}

export interface ClipFilter {
  id: string;
  amount: number;
}

export type MaskShape = 'none' | 'rect' | 'ellipse';

/** Shape mask in the clip's own content space (0..1 across the uncropped image). */
export interface ClipMask {
  shape: MaskShape;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees. */
  rotation: number;
  /** 0..1 */
  feather: number;
  invert: boolean;
}

/** 3D colour lookup table (.cube) applied after colour correction. */
export interface ClipLut {
  path: string;
  name: string;
  /** 0..100 */
  amount: number;
}

/** Per-clip audio processing (dB for the EQ bands). */
export interface AudioFx {
  low: number;
  mid: number;
  high: number;
  compressor: boolean;
}

/** A shader effect instance in a clip's effect stack. */
export interface ClipEffect {
  /** Instance id (a clip can use the same effect twice). */
  id: string;
  /** Effect definition id (built-in or mod). */
  type: string;
  enabled: boolean;
  params: Record<string, number>;
}

/** Effect/transition/generator definition embedded in a project (keeps mod-based projects portable). */
export interface EmbeddedFx {
  id: string;
  kind: 'effect' | 'transition' | 'generator';
  name: string;
  nameRu?: string;
  author?: string;
  version?: string;
  description?: string;
  params: { id: string; name: string; nameRu?: string; min: number; max: number; default: number; step?: number }[];
  glsl: string;
  blend?: string;
  colors?: [string, string];
  category?: 'overlay' | 'background';
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  background: string;
  backgroundOpacity: number;
  backgroundPadding: number;
  backgroundRadius: number;
  /** 100..900; when missing, derived from `bold`. */
  weight?: number;
  uppercase?: boolean;
  /** Fill blends from `color` to `gradientColor` at `gradientAngle` degrees. */
  gradient?: boolean;
  gradientColor?: string;
  gradientAngle?: number;
}

export interface Clip {
  id: string;
  type: ClipType;
  name: string;
  /** Timeline position and length, seconds. */
  start: number;
  duration: number;

  mediaId: string | null;
  /** Source offset, seconds. */
  in: number;
  speed: number;

  transform: Transform;
  crop: Crop;
  adjust: Adjust;
  wheels: ColorWheels;
  filter: ClipFilter;
  effects: ClipEffect[];
  mask: ClipMask;
  lut: ClipLut | null;
  chroma: ChromaKey;
  blend: BlendMode;
  curves: Curves | null;
  hsl: HslAdjust | null;
  animIn: ClipAnim;
  animOut: ClipAnim;
  /** Transition from the previous clip on the same track into this one. */
  transition: ClipTransition;
  keyframes: Partial<Record<AnimProp, Keyframe[]>>;

  volume: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  audioFx: AudioFx;

  text: TextStyle | null;
  shape: ShapeStyle | null;
  overlay: OverlayStyle | null;
  color: string;
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  /** When any track is soloed, only soloed tracks are heard. */
  solo?: boolean;
  /** Custom lane height in px (default by kind). */
  height?: number;
  volume: number;
  clips: Clip[];
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  background: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  hasVideo: boolean;
  size: number;
  /** Video colour matrix from the file (e.g. bt709); missing in older projects. */
  colorSpace?: string | null;
  /** Transparent video (e.g. AI background removal results). */
  hasAlpha?: boolean;
  /** Author and licence of media taken from the online library. */
  credit?: MediaCredit;
  /** Template slot: path is empty until the user picks a file; kept after filling so it can be replaced. */
  slot?: TemplateSlot;
}

export interface TemplateSlot {
  /** 1-based order in which slots are filled (first use on the timeline). */
  index: number;
}

export interface MediaCredit {
  title: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  attribution: string;
  provider: string;
}

export interface Project {
  version: 1;
  name: string;
  settings: ProjectSettings;
  media: MediaAsset[];
  /** Video tracks are stored bottom-up (index 0 renders first); audio tracks top-down. */
  tracks: Track[];
  markers: Marker[];
  /** Definitions of mod effects/transitions used by the project. */
  fx?: EmbeddedFx[];
  /** In/out marks (I / O keys): export and range playback can use them. */
  markIn?: number | null;
  markOut?: number | null;
}

/** Session-only media state (not saved, not part of undo history). */
export interface MediaRuntime {
  status: 'pending' | 'ready' | 'proxying' | 'error' | 'missing';
  thumb: string | null;
  filmstrip: { path: string; count: number; tileW: number; tileH: number; interval: number } | null;
  proxyPath: string | null;
  /** Chromium cannot play the original: the proxy is always used for preview. */
  proxyRequired: boolean;
  /** An editing proxy is being built in the background (media stays usable). */
  optimizing: boolean;
  progress: number;
  error: string | null;
  hasWaveform: boolean;
}

/** File the live preview should play for a media asset. */
export function previewPath(m: MediaAsset, rt: MediaRuntime | undefined, useProxies: boolean): string {
  if (rt?.proxyPath && (rt.proxyRequired || useProxies)) return rt.proxyPath;
  return m.path;
}

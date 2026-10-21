import type { MediaKind } from '../../shared/api';

export type { MediaKind };

export type TrackKind = 'video' | 'audio';
export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'color';
export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen';
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';
export type AnimProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

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
}

export interface ClipFilter {
  id: string;
  amount: number;
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
  filter: ClipFilter;
  chroma: ChromaKey;
  blend: BlendMode;
  animIn: ClipAnim;
  animOut: ClipAnim;
  /** Transition from the previous clip on the same track into this one. */
  transition: ClipTransition;
  keyframes: Partial<Record<AnimProp, Keyframe[]>>;

  volume: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;

  text: TextStyle | null;
  color: string;
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
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
}

export interface Project {
  version: 1;
  name: string;
  settings: ProjectSettings;
  media: MediaAsset[];
  /** Video tracks are stored bottom-up (index 0 renders first); audio tracks top-down. */
  tracks: Track[];
  markers: Marker[];
}

/** Session-only media state (not saved, not part of undo history). */
export interface MediaRuntime {
  status: 'pending' | 'ready' | 'proxying' | 'error' | 'missing';
  thumb: string | null;
  filmstrip: { path: string; count: number; tileW: number; tileH: number; interval: number } | null;
  proxyPath: string | null;
  progress: number;
  error: string | null;
  hasWaveform: boolean;
}

// Contract between the Electron main process and the renderer.
// Everything that crosses the IPC boundary is described here.

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaProbe {
  path: string;
  name: string;
  kind: MediaKind;
  /** Seconds. 0 for still images. */
  duration: number;
  /** Display size (rotation metadata already applied). */
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string;
  size: number;
  /** ffprobe color_space of the video stream, e.g. bt709 (null when untagged). */
  colorSpace: string | null;
  /** Video carries an alpha channel (e.g. VP9 with alpha). */
  hasAlpha: boolean;
}

export interface FilmstripInfo {
  /** Horizontal sprite of `count` tiles, each tileW x tileH. */
  path: string;
  count: number;
  tileW: number;
  tileH: number;
  /** Source seconds between consecutive tiles. */
  interval: number;
}

export interface DecoderSpec {
  path: string;
  /** Source time of the first frame, seconds. */
  sourceIn: number;
  speed: number;
  fps: number;
  width: number;
  height: number;
  /** Timeline seconds worth of frames to produce. */
  duration: number;
  /**
   * 'yuv420p' (default): planar YUV, limited range, source colour matrix.
   * 'yuva420p': the same plus a full-resolution alpha plane (transparent video).
   * 'rgba': packed 8-bit RGBA (AI models).
   */
  format?: 'yuv420p' | 'yuva420p' | 'rgba';
}

/** Bytes per decoded frame for a decoder format. */
export function frameBytes(width: number, height: number, format: DecoderSpec['format'] = 'yuv420p'): number {
  if (format === 'rgba') return width * height * 4;
  if (format === 'yuva420p') return (width * height * 5) / 2;
  return (width * height * 3) / 2;
}

export interface StabilizeOptions {
  /** 0..100: how strongly camera motion is smoothed. */
  smoothing: number;
  /** Zoom in just enough to hide the moving edges. */
  zoom: boolean;
}

export interface DenoiseOptions {
  /** 0..100 */
  strength: number;
  /** Also cut rumble and hiss outside the speech band. */
  voice: boolean;
}

export interface Loudness {
  /** Integrated loudness, LUFS (-Infinity for silence). */
  lufs: number;
  /** True peak, dBTP. */
  peak: number;
}

/** Bakes an AI alpha matte into a transparent copy of a source range. */
export interface MatteSpec {
  source: string;
  sourceIn: number;
  duration: number;
  fps: number;
  /** Size of the matte frames sent with exportFrame (8-bit grey). */
  matteWidth: number;
  matteHeight: number;
  withAudio: boolean;
  outPath: string;
}

export type ExportFormat = 'mp4' | 'mp4-hevc' | 'webm' | 'mov-prores' | 'gif' | 'mp3' | 'wav';
export type ExportQuality = 'high' | 'medium' | 'low';
/** 'auto' picks a GPU encoder when one works, otherwise the CPU (x264/x265). */
export type EncoderChoice = 'auto' | 'cpu' | 'nvenc' | 'qsv' | 'amf';
export type HwEncoder = Exclude<EncoderChoice, 'auto' | 'cpu'>;

export interface AudioSegment {
  path: string;
  /** Source offset and source length, seconds. */
  sourceIn: number;
  sourceDuration: number;
  speed: number;
  /** Timeline placement, seconds. */
  start: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** Clip volume keyframes (segment-local seconds, linear), multiplied by `volume`. */
  volumeKeys?: { t: number; v: number }[];
  /** EQ band gains in dB: low shelf 200 Hz, peak 1 kHz, high shelf 4 kHz. */
  eq?: { low: number; mid: number; high: number };
  compressor?: boolean;
}

/** Audio processing constants shared by the preview (Web Audio) and export (ffmpeg). */
export const AUDIO_FX = {
  lowFreq: 200,
  midFreq: 1000,
  midQ: 1,
  highFreq: 4000,
  compThresholdDb: -24,
  compRatio: 4,
  compAttack: 0.003,
  compRelease: 0.25,
  compKneeDb: 6,
} as const;

export interface ExportSpec {
  outPath: string;
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  duration: number;
  quality: ExportQuality;
  audio: AudioSegment[];
  /** Layout of frames sent with exportFrame: GPU-packed YUV, or bottom-up RGBA. */
  pixelFormat: 'yuv420p' | 'rgba';
  encoder: EncoderChoice;
}

/** Where export time went (milliseconds, summed over all frames). */
export interface ExportStats {
  frames: number;
  seconds: number;
  decode: number;
  render: number;
  readback: number;
  send: number;
  finish: number;
}

export interface ExportResult {
  ok: boolean;
  error?: string;
  stats?: ExportStats;
  /** ffmpeg encoder that produced the file, e.g. h264_nvenc. */
  encoder?: string;
}

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  platform: string;
  ffmpeg: string;
  ffmpegVersion: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface AutosaveMeta {
  filePath: string | null;
  name: string;
}

export interface AutosaveData {
  json: string;
  meta: AutosaveMeta;
  savedAt: number;
}

export interface ModFile {
  file: string;
  text: string;
}

export interface ClosePrompt {
  message: string;
  detail: string;
  cancel: string;
  discard: string;
}

export interface VrApi {
  openMediaDialog(): Promise<string[]>;
  openProjectDialog(): Promise<string | null>;
  openFileDialog(filters: FileFilter[]): Promise<string | null>;
  saveFileDialog(defaultName: string, filters: FileFilter[]): Promise<string | null>;
  readText(path: string): Promise<string>;
  /** Atomic write; `backup` keeps the previous version as <path>.bak. */
  writeText(path: string, text: string, backup?: boolean): Promise<void>;
  autosaveWrite(json: string, meta: AutosaveMeta): Promise<void>;
  autosaveRead(): Promise<AutosaveData | null>;
  autosaveClear(): Promise<void>;
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;

  probe(path: string): Promise<MediaProbe>;
  thumbnail(path: string, kind: MediaKind, duration: number): Promise<string | null>;
  filmstrip(path: string, width: number, height: number, duration: number): Promise<FilmstripInfo | null>;
  waveform(path: string): Promise<Uint8Array | null>;
  /** PNG of the source frame at `time` (cached). */
  extractFrame(path: string, time: number): Promise<string>;
  /** Reversed copy of [start, start + duration) of the source (cached). */
  reverseRange(path: string, start: number, duration: number, withAudio: boolean): Promise<string>;
  /** Stabilised copy of a source range (cached); progress is reported under `taskId`. */
  stabilize(path: string, start: number, duration: number, opts: StabilizeOptions, taskId: string): Promise<string>;
  /** Copy of a file with denoised audio (cached); progress is reported under `taskId`. */
  denoise(path: string, opts: DenoiseOptions, taskId: string): Promise<string>;
  measureLoudness(path: string, start: number, duration: number): Promise<Loudness>;
  onTaskProgress(cb: (taskId: string, progress: number) => void): () => void;
  /** Mono 16 kHz float samples of a source range (speech recognition). */
  readPcm(path: string, start: number, duration: number): Promise<Float32Array>;
  /** Fresh file path in the app's work folder, e.g. for AI results. */
  workPath(name: string): Promise<string>;
  /** On-disk cache for AI model files, keyed by download URL. */
  modelCacheGet(url: string): Promise<Uint8Array | null>;
  modelCachePut(url: string, data: Uint8Array): Promise<void>;
  matteStart(spec: MatteSpec): Promise<string>;
  proxy(path: string, kind: MediaKind, duration: number): Promise<string>;
  onProxyProgress(cb: (path: string, progress: number) => void): () => void;

  /** Hardware encoders that actually work on this machine (probed once). */
  hwEncoders(): Promise<HwEncoder[]>;
  exportStart(spec: ExportSpec): Promise<string>;
  exportFrame(jobId: string, rgba: Uint8Array): Promise<void>;
  exportFinish(jobId: string): Promise<ExportResult>;
  exportCancel(jobId: string): Promise<void>;

  decoderOpen(spec: DecoderSpec): Promise<string>;
  decoderRead(id: string): Promise<Uint8Array | null>;
  decoderClose(id: string): Promise<void>;

  listMods(): Promise<ModFile[]>;
  /** Example mods shipped with the app. */
  listModCatalog(): Promise<ModFile[]>;
  installMods(paths: string[]): Promise<number>;
  removeMod(file: string): Promise<void>;
  openModsFolder(): void;
  openModsDialog(): Promise<string[]>;

  setDirty(dirty: boolean, prompt: ClosePrompt): void;
  setTitle(title: string): void;
  showItemInFolder(path: string): void;
  appInfo(): Promise<AppInfo>;
  /** Project file the app was started with (once), e.g. from Explorer. */
  takeOpenFile(): Promise<string | null>;
  /** Project files opened while the app is already running. */
  onOpenFile(cb: (path: string) => void): () => void;
  toggleDevTools(): void;
  getPathForFile(file: File): string;
}

/** Peaks per second stored in waveform data. */
export const WAVEFORM_RATE = 100;

export const MEDIA_SCHEME = 'media';

export function mediaUrl(path: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(path)}`;
}

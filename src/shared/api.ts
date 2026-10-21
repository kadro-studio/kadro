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
}

export type ExportFormat = 'mp4' | 'mp4-hevc' | 'webm' | 'mov-prores' | 'gif' | 'mp3' | 'wav';
export type ExportQuality = 'high' | 'medium' | 'low';

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
}

export interface ExportSpec {
  outPath: string;
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  duration: number;
  quality: ExportQuality;
  audio: AudioSegment[];
}

export interface ExportResult {
  ok: boolean;
  error?: string;
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

export interface ClosePrompt {
  message: string;
  detail: string;
  cancel: string;
  discard: string;
}

export interface VrApi {
  openMediaDialog(): Promise<string[]>;
  openProjectDialog(): Promise<string | null>;
  saveFileDialog(defaultName: string, filters: FileFilter[]): Promise<string | null>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;

  probe(path: string): Promise<MediaProbe>;
  thumbnail(path: string, kind: MediaKind, duration: number): Promise<string | null>;
  filmstrip(path: string, width: number, height: number, duration: number): Promise<FilmstripInfo | null>;
  waveform(path: string): Promise<Uint8Array | null>;
  proxy(path: string, kind: MediaKind, duration: number): Promise<string>;
  onProxyProgress(cb: (path: string, progress: number) => void): () => void;

  exportStart(spec: ExportSpec): Promise<string>;
  exportFrame(jobId: string, rgba: Uint8Array): Promise<void>;
  exportFinish(jobId: string): Promise<ExportResult>;
  exportCancel(jobId: string): Promise<void>;

  decoderOpen(spec: DecoderSpec): Promise<string>;
  decoderRead(id: string): Promise<Uint8Array | null>;
  decoderClose(id: string): Promise<void>;

  setDirty(dirty: boolean, prompt: ClosePrompt): void;
  setTitle(title: string): void;
  showItemInFolder(path: string): void;
  appInfo(): Promise<AppInfo>;
  toggleDevTools(): void;
  getPathForFile(file: File): string;
}

/** Peaks per second stored in waveform data. */
export const WAVEFORM_RATE = 100;

export const MEDIA_SCHEME = 'media';

export function mediaUrl(path: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(path)}`;
}

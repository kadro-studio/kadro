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

export type LibraryKind = 'video' | 'image' | 'audio';
export type LibraryProvider = 'openverse' | 'commons' | 'pexels' | 'pixabay';

export interface LibrarySearch {
  provider: LibraryProvider;
  kind: LibraryKind;
  query: string;
  page: number;
  /** Openverse audio: 'music' or 'sound_effect'. */
  audioCategory?: string;
  keys?: { pexels?: string; pixabay?: string };
}

/** A search result with everything needed to credit the author. */
export interface LibraryItem {
  id: string;
  provider: LibraryProvider;
  kind: LibraryKind;
  title: string;
  thumb: string;
  /** Small playable file for hover previews (video) or listening (audio). */
  preview?: string;
  downloadUrl: string;
  ext: string;
  width?: number;
  height?: number;
  duration?: number;
  size?: number;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  attribution: string;
  /** Original site behind an aggregator (e.g. flickr, jamendo). */
  origin?: string;
}

export interface LibraryResult {
  items: LibraryItem[];
  hasMore: boolean;
}

export type StorageKind = 'cache' | 'library' | 'models';

export interface StorageInfo {
  /** The app's data folder. */
  root: string;
  /** Bytes used by thumbnails, waveforms, proxies and processed copies. */
  cache: number;
  /** Bytes of files downloaded from the online library. */
  library: number;
  /** Bytes of downloaded AI models. */
  models: number;
}

export interface Appearance {
  titleBarColor: string;
  symbolColor: string;
  zoom: number;
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

/** Shape of a fade, as in Vegas: how fast it starts and ends. */
export type FadeCurve = 'fast' | 'linear' | 'slow' | 'smooth' | 'sharp';

/**
 * Gain of a fade-in at x (0..1 through the fade); a fade-out uses the same
 * shape mirrored in time. These are ffmpeg's afade curves, so the preview and
 * the export sound the same.
 */
export function fadeShape(curve: FadeCurve | undefined, x: number): number {
  const v = Math.max(0, Math.min(1, x));
  switch (curve) {
    case 'fast':
      return 1 - (1 - v) * (1 - v);
    case 'slow':
      return v * v;
    case 'smooth':
      return (1 - Math.cos(v * Math.PI)) / 2;
    case 'sharp':
      return Math.acos(1 - 2 * v) / Math.PI;
    default:
      return v;
  }
}

/** ffmpeg afade curve names for each shape. */
export const FFMPEG_FADE: Record<FadeCurve, string> = { fast: 'ipar', linear: 'tri', slow: 'qua', smooth: 'hsin', sharp: 'ihsin' };

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
  fadeInCurve?: FadeCurve;
  fadeOutCurve?: FadeCurve;
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
  /** Target video bitrate in Mbit/s; overrides the quality level. */
  bitrate?: number;
  /** Audio bitrate in kbit/s (default per format). */
  audioBitrate?: number;
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
  /** Show first-run screens (off for the isolated profiles that automated tests use). */
  firstRun: boolean;
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

/** A Shadertoy shader fetched by id: the common and image passes joined. */
export interface ShadertoyShader {
  id: string;
  name: string;
  author: string;
  description: string;
  code: string;
  /** Buffer/cubemap passes, which cannot be imported. */
  buffers: number;
  url: string;
}

/** Where an update of the installed app stands. */
export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'latest' | 'dev' }
  | { state: 'downloading'; version: string; progress: number }
  /** Downloaded: installed on restart (or on the next quit). */
  | { state: 'ready'; version: string }
  /** Portable copy: a newer release to download by hand. */
  | { state: 'available'; version: string; url: string }
  | { state: 'error'; message: string };

/** System clipboard content usable in a project: files (pictures are saved to a file first) or text. */
export interface ClipboardContent {
  files: string[];
  text: string;
}

/** A video downloaded once from a TikTok link. */
export interface LinkVideo {
  path: string;
  id: string;
  title: string;
  author: string;
  authorId: string;
  url: string;
}

/** The downloader used for links (yt-dlp), fetched on first use. */
export interface LinkToolStatus {
  installed: boolean;
  version: string | null;
}

/** A project template in the user's library (.kadroitem text). */
export interface TemplateFile {
  file: string;
  path: string;
  text: string;
  modified: number;
}

/** A .cube file in the user's LUT library. */
export interface LutFile {
  file: string;
  path: string;
  name: string;
}

/** What the workshop shares. Mods are split by kind so they can be browsed separately. */
export type WorkshopKind = 'effect' | 'transition' | 'element' | 'look' | 'textStyle' | 'lut' | 'theme' | 'template';

export interface WorkshopQuery {
  kind?: WorkshopKind;
  search?: string;
  sort?: 'popular' | 'new' | 'liked';
  /** The signed-in user's own items, including those awaiting review. */
  mine?: boolean;
  /** Moderators: items waiting for review, or published items people reported. */
  review?: 'pending' | 'reported';
  page?: number;
  perPage?: number;
}

export interface WorkshopItem {
  id: number;
  kind: WorkshopKind;
  title: string;
  description: string;
  author: string;
  version: string;
  license: string;
  tags: string[];
  created: string;
  updated: string;
  downloads: number;
  likes: number;
  liked: boolean;
  status: 'publish' | 'pending' | 'draft' | 'private' | 'trash';
  fileName: string;
  fileSize: number;
  preview: string | null;
  page: string;
  /** Published by the signed-in user. */
  own?: boolean;
  /** Why a moderator turned it down (for its author and moderators). */
  rejected?: string | null;
  /** Moderators: number of reports and the latest reasons. */
  reports?: number;
  reportReasons?: string[];
}

export interface WorkshopPage {
  items: WorkshopItem[];
  total: number;
  pages: number;
}

export interface WorkshopPublish {
  kind: WorkshopKind;
  title: string;
  description: string;
  version: string;
  license: string;
  tags: string[];
  fileName: string;
  file: Uint8Array;
  /** JPEG preview rendered by the app. */
  preview: Uint8Array | null;
  /** Item to replace with a new version (own items only). */
  updateId?: number;
}

export interface WorkshopAccount {
  name: string;
  login: string;
  /** False when the stored password was rejected. */
  valid: boolean;
  offline?: boolean;
  /** False until the e-mail of an account made on the workshop's sign-up page is confirmed. */
  confirmed?: boolean;
  /** May approve, reject and see reports; with the numbers waiting. */
  moderator?: boolean;
  pending?: number;
  reported?: number;
}

export type WorkshopReview = 'approve' | 'reject' | 'dismiss';

/** A font file in the user's fonts folder. */
export interface FontFile {
  file: string;
  size: number;
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
  /** Shot changes in a source range (seconds from start); threshold 0..1. */
  detectScenes(path: string, start: number, duration: number, threshold: number): Promise<number[]>;
  onTaskProgress(cb: (taskId: string, progress: number) => void): () => void;
  searchLibrary(q: LibrarySearch): Promise<LibraryResult>;
  /** Downloads a library item into the cache (once); progress under `taskId`. */
  downloadLibraryItem(item: LibraryItem, taskId: string): Promise<string>;
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
  /** Saves a mod given as text into the mods folder (returns the file path). */
  installModText(fileName: string, text: string): Promise<string>;
  fetchShadertoy(id: string, key: string): Promise<ShadertoyShader>;

  checkForUpdates(): Promise<UpdateStatus>;
  updateStatus(): Promise<UpdateStatus>;
  /** Restarts into the downloaded update. */
  installUpdate(): void;
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void;

  readClipboard(): Promise<ClipboardContent>;
  writeClipboardText(text: string): Promise<void>;

  linkToolStatus(): Promise<LinkToolStatus>;
  /** Downloads the user's own TikTok video once; progress on taskId (video) and taskId:tool (first-use download of yt-dlp). */
  importLinkVideo(url: string, taskId: string): Promise<LinkVideo>;

  listLuts(): Promise<LutFile[]>;
  /** Saves .cube text into the LUT library; returns the file path. */
  installLutText(name: string, text: string): Promise<string>;
  addLutFiles(paths: string[]): Promise<string[]>;
  removeLut(file: string): Promise<void>;
  openLutsFolder(): void;

  listTemplates(): Promise<TemplateFile[]>;
  /** Saves a template (.kadroitem text) into the library; returns the file path. */
  saveTemplate(name: string, text: string): Promise<string>;
  removeTemplate(file: string): Promise<void>;

  workshopList(q: WorkshopQuery): Promise<WorkshopPage>;
  workshopItem(id: number): Promise<WorkshopItem>;
  workshopLike(id: number): Promise<{ likes: number; liked: boolean }>;
  workshopDelete(id: number): Promise<void>;
  workshopDownload(id: number): Promise<Uint8Array>;
  workshopPublish(p: WorkshopPublish): Promise<WorkshopItem>;
  workshopAccount(): Promise<WorkshopAccount | null>;
  /** Opens the workshop site to approve Kadro; the result arrives with onWorkshopAuth. */
  workshopSignIn(): void;
  /** Opens the workshop's sign-up page (in the app's language); it goes on to approving Kadro. */
  workshopSignUp(lang: string): void;
  /** Sends the e-mail confirmation letter again. */
  workshopResendConfirm(): Promise<{ sent: boolean; confirmed: boolean }>;
  /** Moderators: approve, reject (with a reason) or dismiss the reports of an item. */
  workshopReview(id: number, action: WorkshopReview, reason?: string): Promise<WorkshopItem>;
  workshopReport(id: number, reason: string): Promise<void>;
  workshopSignOut(): void;
  /** Stores a login and application password typed by the user. */
  workshopSaveLogin(user: string, password: string): Promise<void>;
  /** Opens a page of the workshop site in the browser. */
  workshopOpen(route: string): void;
  onWorkshopAuth(cb: (ok: boolean) => void): () => void;
  /** kadro:// links other than sign-in (e.g. installing a workshop item from the site). */
  onDeepLink(cb: (url: string) => void): () => void;
  /** Delivers a kadro:// link the app was started with (once). */
  takeLink(): Promise<void>;

  listFonts(): Promise<FontFile[]>;
  readFont(file: string): Promise<Uint8Array>;
  /** Copies font files into the profile; returns the added file names. */
  installFonts(paths: string[]): Promise<string[]>;
  removeFont(file: string): Promise<void>;
  openFontsFolder(): void;
  openFontsDialog(): Promise<string[]>;

  setDirty(dirty: boolean, prompt: ClosePrompt): void;
  setTitle(title: string): void;
  /** Title-bar colours (native caption buttons) and interface zoom. */
  setAppearance(a: Appearance): void;
  /** The window is closing with unsaved changes; the page asks the user. */
  onCloseRequest(cb: () => void): () => void;
  /** Close the window now, without asking again. */
  closeNow(): void;
  showItemInFolder(path: string): void;
  appInfo(): Promise<AppInfo>;
  storageInfo(): Promise<StorageInfo>;
  clearStorage(kind: StorageKind): Promise<void>;
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

// Messages between the UI and the AI worker.

export interface AsrChunk {
  text: string;
  /** Seconds from the start of the audio passed in. */
  start: number;
  end: number;
}

export type AiRequest =
  | { id: number; type: 'init'; ortBase: string }
  | { id: number; type: 'asr'; audio: Float32Array; model: string; language: string | null }
  | { id: number; type: 'matte'; rgba: Uint8Array; width: number; height: number; model: string };

export type AiResponse =
  | { id: number; type: 'progress'; stage: 'download' | 'run'; progress: number; file?: string; loaded?: number; total?: number }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; error: string }
  /** Worker asks the UI thread (which can reach the disk cache) for a model file. */
  | { id: number; type: 'cache'; hid: number; op: 'get' | 'put'; url: string; data?: Uint8Array };

/** UI thread's reply to a cache request. */
export interface CacheReply {
  type: 'cacheReply';
  hid: number;
  data: Uint8Array | null;
}

export interface AiProgress {
  stage: 'download' | 'run' | 'frames';
  /** 0..1 */
  progress: number;
  file?: string;
}

export const ASR_MODELS = [
  { id: 'onnx-community/whisper-tiny', size: 40, key: 'ai.model.tiny' },
  { id: 'onnx-community/whisper-base', size: 80, key: 'ai.model.base' },
  { id: 'onnx-community/whisper-small', size: 250, key: 'ai.model.small' },
] as const;

export const MATTE_MODEL = { id: 'Xenova/modnet', size: 25 };

export const ASR_LANGUAGES = [
  { id: null, key: 'ai.lang.auto' },
  { id: 'russian', key: 'ai.lang.ru' },
  { id: 'english', key: 'ai.lang.en' },
  { id: 'ukrainian', key: 'ai.lang.uk' },
  { id: 'german', key: 'ai.lang.de' },
  { id: 'french', key: 'ai.lang.fr' },
  { id: 'spanish', key: 'ai.lang.es' },
] as const;

// .cube 3D LUT loading (Adobe/Resolve format), cached per file.
import { api } from '../api';

export interface Lut {
  size: number;
  /** size³ RGB triplets, red changing fastest. */
  data: Float32Array;
}

const cache = new Map<string, Lut | null>();
const loading = new Map<string, Promise<Lut | null>>();
const listeners = new Set<() => void>();

export function parseCube(text: string): Lut {
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toUpperCase();
    if (key === 'LUT_3D_SIZE') size = Number(parts[1]);
    else if (key === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number);
    else if (key === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number);
    else if (key === 'TITLE' || key === 'LUT_1D_SIZE' || key === 'LUT_3D_INPUT_RANGE') {
      if (key === 'LUT_1D_SIZE') throw new Error('1D LUTs are not supported');
    } else if (/^[-+.\d]/.test(parts[0]) && parts.length >= 3) {
      values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
  }
  if (!(size >= 2 && size <= 256)) throw new Error('Missing or invalid LUT_3D_SIZE');
  if (values.length !== size * size * size * 3) throw new Error(`Expected ${size ** 3} entries, found ${values.length / 3}`);
  // Normalise output values from a non-default domain into 0..1.
  const data = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const c = i % 3;
    data[i] = (values[i] - min[c]) / Math.max(1e-6, max[c] - min[c]);
  }
  return { size, data };
}

export function loadLut(path: string): Promise<Lut | null> {
  if (cache.has(path)) return Promise.resolve(cache.get(path)!);
  let p = loading.get(path);
  if (!p) {
    p = api
      .readText(path)
      .then(parseCube)
      .catch((e) => {
        console.warn('LUT load failed', path, e);
        return null;
      })
      .then((lut) => {
        cache.set(path, lut);
        loading.delete(path);
        for (const l of listeners) l();
        return lut;
      });
    loading.set(path, p);
  }
  return p;
}

/** Loaded LUT, or undefined while it is still loading (loading starts on first call). */
export function getLut(path: string): Lut | null | undefined {
  if (cache.has(path)) return cache.get(path);
  void loadLut(path);
  return undefined;
}

export function onLutLoaded(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

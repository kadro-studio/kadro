// Video scopes: the player hands each rendered frame to an optional sink,
// which samples it into a small 2D canvas and computes scope data.
export interface ScopeData {
  width: number;
  height: number;
  /** RGBA pixels of the downsampled frame. */
  pixels: Uint8ClampedArray;
}

type Sink = (data: ScopeData) => void;

const SW = 240;
const SH = 135;
let sink: Sink | null = null;
let sampler: CanvasRenderingContext2D | null = null;
let lastFeed = 0;

export function setScopesSink(fn: Sink | null): void {
  sink = fn;
}

export function scopesActive(): boolean {
  return sink !== null;
}

/** Called by the player right after drawing (WebGL contents are only valid in that task). */
export function feedScopes(canvas: HTMLCanvasElement, playing: boolean): void {
  if (!sink) return;
  const now = performance.now();
  if (playing && now - lastFeed < 80) return;
  lastFeed = now;
  if (!sampler) {
    const c = document.createElement('canvas');
    c.width = SW;
    c.height = SH;
    sampler = c.getContext('2d', { willReadFrequently: true })!;
  }
  sampler.drawImage(canvas, 0, 0, SW, SH);
  sink({ width: SW, height: SH, pixels: sampler.getImageData(0, 0, SW, SH).data });
}

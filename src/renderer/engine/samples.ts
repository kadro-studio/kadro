// Sample photos used for effect, filter, transition and text previews.
export const SAMPLES = ['mountain', 'street', 'spa'] as const;
export type SampleId = (typeof SAMPLES)[number];

export function sampleUrl(id: SampleId): string {
  return `./samples/${id}.jpg`;
}

const loading = new Map<SampleId, Promise<HTMLImageElement>>();
const loaded = new Map<SampleId, HTMLImageElement>();

export function loadSample(id: SampleId): Promise<HTMLImageElement> {
  let p = loading.get(id);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        loaded.set(id, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`sample ${id} failed to load`));
      img.src = sampleUrl(id);
    });
    loading.set(id, p);
  }
  return p;
}

/** The image if it has finished loading (for synchronous per-frame drawing). */
export function sampleIfLoaded(id: SampleId): HTMLImageElement | null {
  return loaded.get(id) ?? null;
}

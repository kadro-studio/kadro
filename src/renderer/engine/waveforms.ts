// In-memory waveform peaks per media id (WAVEFORM_RATE values per second).
const peaks = new Map<string, Uint8Array>();

export function setWaveform(mediaId: string, data: Uint8Array): void {
  peaks.set(mediaId, data);
}

export function getWaveform(mediaId: string): Uint8Array | undefined {
  return peaks.get(mediaId);
}

export function clearWaveforms(): void {
  peaks.clear();
}

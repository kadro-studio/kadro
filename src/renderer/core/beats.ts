// Beat detection on mono PCM: spectral-flux onsets, a tempo estimate from the
// onset envelope's autocorrelation, and a beat grid snapped to nearby onsets.

const FFT = 1024;
const HOP = 256;

function fftMagnitudes(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Onset strength per hop (positive spectral flux on log magnitudes). */
export function onsetEnvelope(pcm: Float32Array): Float32Array {
  const frames = Math.max(0, Math.floor((pcm.length - FFT) / HOP) + 1);
  const env = new Float32Array(frames);
  const win = new Float64Array(FFT).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1)));
  const re = new Float64Array(FFT);
  const im = new Float64Array(FFT);
  const bins = FFT / 2;
  let prev = new Float64Array(bins);
  let cur = new Float64Array(bins);
  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FFT; i++) {
      re[i] = pcm[off + i] * win[i];
      im[i] = 0;
    }
    fftMagnitudes(re, im);
    let flux = 0;
    for (let k = 1; k < bins; k++) {
      cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = cur[k] - prev[k];
      if (d > 0) flux += d;
    }
    env[f] = f === 0 ? 0 : flux;
    [prev, cur] = [cur, prev];
  }
  return env;
}

export interface BeatAnalysis {
  bpm: number;
  /** Beat times in seconds (regular grid snapped to onsets). */
  beats: number[];
  /** Individual accents in seconds. */
  onsets: number[];
}

export function analyzeBeats(pcm: Float32Array, rate: number): BeatAnalysis {
  const env = onsetEnvelope(pcm);
  const dt = HOP / rate;
  // A frame's flux belongs to the middle of its analysis window.
  const lead = FFT / 2 / rate;
  const n = env.length;
  if (n < 8) return { bpm: 0, beats: [], onsets: [] };

  // Onsets: local maxima above a moving average plus a fraction of the spread.
  const w = Math.round(0.4 / dt);
  let mean = 0;
  for (const v of env) mean += v;
  mean /= n;
  let sd = 0;
  for (const v of env) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / n);
  const onsets: number[] = [];
  let lastOnset = -1e9;
  for (let i = 1; i < n - 1; i++) {
    let local = 0;
    let count = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) {
      local += env[j];
      count++;
    }
    local /= count;
    const isPeak = env[i] >= env[i - 1] && env[i] >= env[i + 1];
    if (isPeak && env[i] > local + 0.5 * sd && env[i] > mean && i * dt - lastOnset > 0.12) {
      onsets.push(i * dt + lead);
      lastOnset = i * dt;
    }
  }

  // Tempo: strongest autocorrelation lag between 60 and 190 BPM, gently
  // weighted towards ~120 BPM to avoid half/double tempo picks.
  const minLag = Math.round(60 / 190 / dt);
  const maxLag = Math.round(60 / 60 / dt);
  const centred = env.map((v) => v - mean);
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= Math.min(maxLag, n - 1); lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += centred[i] * centred[i + lag];
    const bpm = 60 / (lag * dt);
    const weight = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2 / 0.6);
    const score = (s / (n - lag)) * weight;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag || bestScore <= 0) return { bpm: 0, beats: onsets, onsets };

  // Phase: the offset whose grid collects the most onset strength.
  let bestPhase = 0;
  let bestSum = -Infinity;
  for (let ph = 0; ph < bestLag; ph++) {
    let s = 0;
    for (let i = ph; i < n; i += bestLag) s += env[i];
    if (s > bestSum) {
      bestSum = s;
      bestPhase = ph;
    }
  }
  const beats: number[] = [];
  for (let i = bestPhase; i < n; i += bestLag) {
    // Snap each grid beat to the strongest frame nearby.
    let best = i;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) if (env[j] > env[best]) best = j;
    beats.push(best * dt + lead);
  }
  return { bpm: Math.round(60 / (bestLag * dt)), beats, onsets };
}

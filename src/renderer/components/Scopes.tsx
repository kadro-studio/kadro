import { useEffect, useRef } from 'react';
import { player } from '../engine/player';
import { setScopesSink, type ScopeData } from '../engine/scopes';
import { useT } from '../i18n';
import { useEditor } from '../store/editor';

const WF_H = 110;
const VS = 140;

function drawWaveform(ctx: CanvasRenderingContext2D, d: ScopeData): void {
  const W = d.width;
  const grid = new Uint16Array(W * WF_H);
  for (let i = 0, p = 0; i < d.pixels.length; i += 4, p++) {
    const luma = 0.2126 * d.pixels[i] + 0.7152 * d.pixels[i + 1] + 0.0722 * d.pixels[i + 2];
    const y = WF_H - 1 - Math.round((luma / 255) * (WF_H - 1));
    grid[y * W + (p % W)]++;
  }
  const img = ctx.createImageData(W, WF_H);
  for (let i = 0; i < grid.length; i++) {
    const v = Math.min(255, grid[i] * 45);
    img.data[i * 4] = v * 0.55;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v * 0.6;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  for (const level of [0.25, 0.5, 0.75]) {
    const y = Math.round(WF_H * (1 - level)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawHistogram(ctx: CanvasRenderingContext2D, d: ScopeData, w: number, h: number): void {
  const bins = [new Uint32Array(64), new Uint32Array(64), new Uint32Array(64)];
  for (let i = 0; i < d.pixels.length; i += 4) {
    bins[0][d.pixels[i] >> 2]++;
    bins[1][d.pixels[i + 1] >> 2]++;
    bins[2][d.pixels[i + 2] >> 2]++;
  }
  let max = 1;
  for (const b of bins) for (let i = 1; i < 63; i++) max = Math.max(max, b[i]);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  ['rgba(255,70,70,0.7)', 'rgba(70,255,90,0.7)', 'rgba(80,120,255,0.7)'].forEach((color, c) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 64; i++) ctx.lineTo((i / 63) * w, h - Math.min(1, bins[c][i] / max) * (h - 2));
    ctx.lineTo(w, h);
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
}

function drawVectorscope(ctx: CanvasRenderingContext2D, d: ScopeData): void {
  const c = VS / 2;
  const grid = new Uint16Array(VS * VS);
  for (let i = 0; i < d.pixels.length; i += 4) {
    const r = d.pixels[i] / 255;
    const g = d.pixels[i + 1] / 255;
    const b = d.pixels[i + 2] / 255;
    const cb = -0.1146 * r - 0.3854 * g + 0.5 * b;
    const cr = 0.5 * r - 0.4542 * g - 0.0458 * b;
    const x = Math.round(c + cb * (VS - 8));
    const y = Math.round(c - cr * (VS - 8));
    if (x >= 0 && x < VS && y >= 0 && y < VS) grid[y * VS + x]++;
  }
  const img = ctx.createImageData(VS, VS);
  for (let i = 0; i < grid.length; i++) {
    const v = Math.min(255, grid[i] * 60);
    img.data[i * 4] = v * 0.7;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v * 0.7;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(c, c, c - 4, 0, Math.PI * 2);
  ctx.stroke();
  // Targets of the primary/secondary colours at 75 % and the skin-tone line.
  const targets: [string, number, number, number][] = [
    ['R', 0.75, 0, 0],
    ['Y', 0.75, 0.75, 0],
    ['G', 0, 0.75, 0],
    ['C', 0, 0.75, 0.75],
    ['B', 0, 0, 0.75],
    ['M', 0.75, 0, 0.75],
  ];
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '9px Segoe UI';
  for (const [name, r, g, b] of targets) {
    const cb = -0.1146 * r - 0.3854 * g + 0.5 * b;
    const cr = 0.5 * r - 0.4542 * g - 0.0458 * b;
    const x = c + cb * (VS - 8);
    const y = c - cr * (VS - 8);
    ctx.strokeRect(x - 4, y - 4, 8, 8);
    ctx.fillText(name, x + 6, y + 3);
  }
  ctx.strokeStyle = 'rgba(255,190,140,0.5)';
  ctx.beginPath();
  ctx.moveTo(c, c);
  const skin = (123 * Math.PI) / 180;
  ctx.lineTo(c + Math.cos(skin) * (c - 4), c - Math.sin(skin) * (c - 4));
  ctx.stroke();
}

export function ScopesPanel() {
  const t = useT();
  const wave = useRef<HTMLCanvasElement>(null);
  const hist = useRef<HTMLCanvasElement>(null);
  const vec = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setScopesSink((d) => {
      const w = wave.current?.getContext('2d');
      const h = hist.current?.getContext('2d');
      const v = vec.current?.getContext('2d');
      if (w) drawWaveform(w, d);
      if (h) drawHistogram(h, d, hist.current!.width, hist.current!.height);
      if (v) drawVectorscope(v, d);
    });
    player.requestRender();
    return () => setScopesSink(null);
  }, []);

  return (
    <div className="scopes">
      <div className="scope-title">{t('scopes.waveform')}</div>
      <canvas ref={wave} width={240} height={WF_H} />
      <div className="scope-title">{t('scopes.histogram')}</div>
      <canvas ref={hist} width={240} height={80} />
      <div className="scope-title">{t('scopes.vectorscope')}</div>
      <canvas ref={vec} width={VS} height={VS} className="vectorscope" />
    </div>
  );
}

/** Stereo peak meter of the preview output. */
export function LevelMeter() {
  const playing = useEditor((s) => s.playing);
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (!playing) {
      for (const b of bars.current) if (b) b.style.width = '0%';
      return;
    }
    let raf = 0;
    const tick = () => {
      const levels = player.levels();
      levels.forEach((l, i) => {
        const b = bars.current[i];
        if (!b) return;
        // dBFS scale from -48 dB to 0.
        const db = 20 * Math.log10(Math.max(1e-5, l));
        b.style.width = `${Math.max(0, Math.min(100, ((db + 48) / 48) * 100))}%`;
        b.classList.toggle('hot', l > 0.89);
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return (
    <div className="vu" title="L / R">
      {[0, 1].map((i) => (
        <div key={i} className="vu-track">
          <div ref={(el) => void (bars.current[i] = el)} className="vu-bar" />
        </div>
      ))}
    </div>
  );
}

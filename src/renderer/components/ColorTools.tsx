import { useEffect, useRef, useState } from 'react';
import type { Draft } from 'immer';
import {
  CURVE_CHANNELS,
  curveFunction,
  defaultCurves,
  defaultHsl,
  HSL_BANDS,
  HSL_SWATCH,
  isIdentityCurve,
  type CurveChannel,
} from '../core/curves';
import type { Clip, CurvePoint, HslBand } from '../core/types';
import { useT, type I18nKey } from '../i18n';
import { IconButton, Section, SliderField } from '../ui/controls';

type Setter = (recipe: (c: Draft<Clip>) => void, final: boolean) => void;

const CHANNEL_COLOR: Record<CurveChannel, string> = { master: '#f0f0f3', r: '#ff4d4d', g: '#3ddc5f', b: '#4d8dff' };
const SIZE = 256;
const HIT = 12;

/** Tone curves: click to add a point, drag to move, double-click to remove. */
export function CurvesSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const [channel, setChannel] = useState<CurveChannel>('master');
  const canvas = useRef<HTMLCanvasElement>(null);
  const curves = clip.curves ?? defaultCurves();
  const points = curves[channel];

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#0c0c0f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = Math.round((i * SIZE) / 4) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, SIZE);
      ctx.moveTo(0, p);
      ctx.lineTo(SIZE, p);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, SIZE);
    ctx.lineTo(SIZE, 0);
    ctx.stroke();
    const draw = (ch: CurveChannel, active: boolean) => {
      const f = curveFunction(curves[ch]);
      ctx.strokeStyle = active ? CHANNEL_COLOR[ch] : `${CHANNEL_COLOR[ch]}55`;
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      for (let x = 0; x <= SIZE; x += 2) {
        const y = SIZE - Math.min(1, Math.max(0, f(x / SIZE))) * SIZE;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    for (const ch of CURVE_CHANNELS) if (ch !== channel && !isIdentityCurve(curves[ch])) draw(ch, false);
    draw(channel, true);
    for (const p of points) {
      ctx.fillStyle = '#0c0c0f';
      ctx.strokeStyle = CHANNEL_COLOR[channel];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * SIZE, SIZE - p.y * SIZE, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [curves, channel, points]);

  const write = (pts: CurvePoint[], final: boolean) =>
    set((c) => {
      const next = c.curves ?? defaultCurves();
      next[channel] = pts;
      c.curves = next;
    }, final);

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
      scale: SIZE / r.width,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const pos = toLocal(e);
    let pts = points.map((p) => ({ ...p }));
    let index = pts.findIndex((p) => Math.hypot((p.x - pos.x) * SIZE, (p.y - pos.y) * SIZE) < HIT * pos.scale);
    if (index < 0) {
      pts.push({ x: pos.x, y: pos.y });
      pts.sort((a, b) => a.x - b.x);
      index = pts.findIndex((p) => p.x === pos.x && p.y === pos.y);
      write(pts, false);
    }
    const last = pts.length - 1;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = toLocal(ev);
      pts = pts.map((q) => ({ ...q }));
      const lo = index === 0 ? 0 : pts[index - 1].x + 0.01;
      const hi = index === last ? 1 : pts[index + 1].x - 0.01;
      // The end points keep their x so the curve always spans 0..1.
      pts[index].x = index === 0 ? 0 : index === last ? 1 : Math.min(hi, Math.max(lo, p.x));
      pts[index].y = p.y;
      write(pts, false);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      write(pts, true);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const onDouble = (e: React.MouseEvent) => {
    const pos = toLocal(e);
    const i = points.findIndex((p) => Math.hypot((p.x - pos.x) * SIZE, (p.y - pos.y) * SIZE) < HIT * pos.scale);
    if (i > 0 && i < points.length - 1) write(points.filter((_, k) => k !== i), true);
  };

  return (
    <Section
      id="curves"
      title={t('sec.curves')}
      actions={<IconButton icon="reset" size={14} className="small" title={t('p.reset')} onClick={() => set((c) => void (c.curves = null), true)} />}
    >
      <div className="seg">
        {CURVE_CHANNELS.map((ch) => (
          <button key={ch} className={channel === ch ? 'active' : ''} onClick={() => setChannel(ch)}>
            <span className="curve-dot" style={{ background: CHANNEL_COLOR[ch] }} />
            {t(`curves.${ch}` as I18nKey)}
          </button>
        ))}
      </div>
      <canvas ref={canvas} className="curves-canvas" width={SIZE} height={SIZE} onPointerDown={onDown} onDoubleClick={onDouble} title={t('curves.hint')} />
    </Section>
  );
}

/** Hue / saturation / lightness per colour range. */
export function HslSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const [band, setBand] = useState<HslBand>('orange');
  const hsl = clip.hsl ?? defaultHsl();
  const v = hsl[band];
  const write = (key: 'h' | 's' | 'l', value: number, final: boolean) =>
    set((c) => {
      const next = c.hsl ?? defaultHsl();
      next[band][key] = value;
      c.hsl = next;
    }, final);
  return (
    <Section
      id="hsl"
      title={t('sec.hsl')}
      actions={<IconButton icon="reset" size={14} className="small" title={t('p.reset')} onClick={() => set((c) => void (c.hsl = null), true)} />}
    >
      <div className="hsl-bands">
        {HSL_BANDS.map((b) => {
          const changed = hsl[b].h || hsl[b].s || hsl[b].l;
          return (
            <button
              key={b}
              className={`hsl-band ${band === b ? 'active' : ''} ${changed ? 'changed' : ''}`}
              style={{ background: HSL_SWATCH[b] }}
              title={t(`hsl.${b}` as I18nKey)}
              onClick={() => setBand(b)}
            />
          );
        })}
      </div>
      <div className="hsl-name">{t(`hsl.${band}` as I18nKey)}</div>
      <SliderField label={t('hsl.hue')} value={v.h} min={-100} max={100} defaultValue={0} onChange={(x, f) => write('h', x, f)} />
      <SliderField label={t('hsl.saturation')} value={v.s} min={-100} max={100} defaultValue={0} onChange={(x, f) => write('s', x, f)} />
      <SliderField label={t('hsl.lightness')} value={v.l} min={-100} max={100} defaultValue={0} onChange={(x, f) => write('l', x, f)} />
    </Section>
  );
}

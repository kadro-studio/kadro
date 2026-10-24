import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fadeShape, mediaUrl, WAVEFORM_RATE } from '../../../shared/api';
import { keyframeTimes } from '../../core/keyframes';
import { formatRuler } from '../../core/time';
import type { Clip, FadeCurve, MediaAsset, MediaRuntime, Track } from '../../core/types';
import { getWaveform } from '../../engine/waveforms';
import { useT } from '../../i18n';
import { renameTrack, setTrackFlag } from '../../store/actions';
import { commitPreview, previewEdit, useEditor } from '../../store/editor';
import { Icon, type IconName } from '../../ui/Icon';
import { IconButton } from '../../ui/controls';
import { themeColor, useThemeVersion } from '../../store/theme';
import { usePrefs } from '../../store/prefs';

export const HEADER_W = 168;
export const RULER_H = 28;

export const TRACK_MIN_H = 30;
export const TRACK_MAX_H = 180;

export function trackHeight(track: Track): number {
  return track.height ?? (track.kind === 'video' ? 68 : 54);
}

/** Drag on the header's bottom edge to resize the lane; double-click resets it. */
function beginTrackResize(e: React.PointerEvent, track: Track): void {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const startY = e.clientY;
  const h0 = trackHeight(track);
  const onMove = (ev: PointerEvent) => {
    const h = Math.round(Math.min(TRACK_MAX_H, Math.max(TRACK_MIN_H, h0 + ev.clientY - startY)));
    previewEdit((d) => {
      const tr = d.tracks.find((x) => x.id === track.id);
      if (tr) tr.height = h;
    });
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    commitPreview();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// ---------------------------------------------------------------------------
// Ruler

const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

export function RulerCanvas({ width, scrollLeft, pps, fps }: { width: number; scrollLeft: number; pps: number; fps: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const themeVersion = useThemeVersion();
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(width));
    canvas.width = w * dpr;
    canvas.height = RULER_H * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${RULER_H}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, RULER_H);

    const frameSteps = [1, 2, 5, 10].map((n) => n / fps);
    const steps = [...frameSteps, 0.5, ...RULER_STEPS];
    const major = steps.find((s) => s * pps >= 90) ?? 3600;
    const minor = major * pps / 5 >= 7 ? major / 5 : major / 2;
    const t0 = scrollLeft / pps;
    const t1 = (scrollLeft + w) / pps;
    const colors = { major: themeColor('--ruler-major', '#7b8090'), minor: themeColor('--ruler-minor', '#4a4e59'), text: themeColor('--ruler-text', '#a3a7b1') };
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.textBaseline = 'top';
    const first = Math.floor(t0 / minor) * minor;
    for (let i = 0; ; i++) {
      const tt = first + i * minor;
      if (tt > t1 + minor) break;
      if (tt < 0) continue;
      const x = Math.round(tt * pps - scrollLeft) + 0.5;
      const ratio = tt / major;
      const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-6;
      ctx.strokeStyle = isMajor ? colors.major : colors.minor;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, RULER_H - (isMajor ? 11 : 5));
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = colors.text;
        ctx.fillText(formatRuler(tt, fps, major < 1), x + 4, 4);
      }
    }
  }, [width, scrollLeft, pps, fps, themeVersion]);
  return <canvas ref={ref} style={{ left: HEADER_W }} />;
}

export function RulerPlayhead({ pps }: { pps: number }) {
  const playhead = useEditor((s) => s.playhead);
  return <div className="playhead-head" style={{ left: playhead * pps }} />;
}

export function PlayheadLine({ pps, scrollRef }: { pps: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const x = HEADER_W + playhead * pps;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing || !usePrefs.getState().followPlayhead) return;
    const viewLeft = el.scrollLeft + HEADER_W;
    const viewRight = el.scrollLeft + el.clientWidth;
    if (x > viewRight - 30 || x < viewLeft) el.scrollLeft = Math.max(0, x - HEADER_W - 60);
  }, [x, playing, scrollRef]);
  return <div className="playhead" style={{ left: x }} />;
}

// ---------------------------------------------------------------------------
// Track header

export function TrackHeader({ track, height, onContextMenu }: { track: Track; height: number; onContextMenu: (e: React.MouseEvent) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);
  return (
    <div className="track-header" style={{ width: HEADER_W, height }} onContextMenu={onContextMenu}>
      <div className="track-name" onDoubleClick={() => (setName(track.name), setEditing(true))}>
        <span
          className="track-kind"
          style={{ background: `var(--clip-${track.kind})`, '--kind-glow': `var(--clip-${track.kind})` } as React.CSSProperties}
        />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              renameTrack(track.id, name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
              e.stopPropagation();
            }}
          />
        ) : (
          <span title={t('tl.renameTrack')}>{track.name}</span>
        )}
      </div>
      {track.kind === 'video' && (
        <IconButton
          icon={track.hidden ? 'eyeOff' : 'eye'}
          size={15}
          className="small"
          title={t('tl.hide')}
          active={track.hidden}
          onClick={() => setTrackFlag(track.id, 'hidden', !track.hidden)}
        />
      )}
      <IconButton
        icon={track.muted ? 'volumeOff' : 'volume'}
        size={15}
        className="small"
        title={t('tl.mute')}
        active={track.muted}
        onClick={() => setTrackFlag(track.id, 'muted', !track.muted)}
      />
      <button
        className={`solo-btn ${track.solo ? 'active' : ''}`}
        title={t('tl.solo')}
        onClick={() => setTrackFlag(track.id, 'solo', !track.solo)}
      >
        S
      </button>
      <IconButton
        icon={track.locked ? 'lock' : 'unlock'}
        size={15}
        className="small"
        title={t('tl.lock')}
        active={track.locked}
        onClick={() => setTrackFlag(track.id, 'locked', !track.locked)}
      />
      <div
        className="track-resize"
        title={t('tl.resizeTrack')}
        onPointerDown={(e) => beginTrackResize(e, track)}
        onDoubleClick={() =>
          commitPreview((d) => {
            const tr = d.tracks.find((x) => x.id === track.id);
            if (tr) delete tr.height;
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clips

const TYPE_ICON: Record<Clip['type'], IconName> = {
  video: 'film',
  audio: 'music',
  image: 'image',
  text: 'text',
  color: 'shapes',
  adjustment: 'layers',
  shape: 'shapes',
  overlay: 'wand',
};

function Waveform({ clip, pps, color, waveVersion }: { clip: Clip; pps: number; color: string; waveVersion: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cssW = Math.max(1, Math.round(clip.duration * pps));
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas || !clip.mediaId) return;
    const peaks = getWaveform(clip.mediaId);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(4096, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (!peaks) return;
    ctx.fillStyle = color;
    const srcLen = clip.duration * clip.speed;
    const gain = Math.min(1.6, clip.muted ? 0.2 : clip.volume);
    for (let x = 0; x < w; x++) {
      const s0 = clip.in + (x / w) * srcLen;
      const s1 = clip.in + ((x + 1) / w) * srcLen;
      const i0 = Math.floor(s0 * WAVEFORM_RATE);
      const i1 = Math.max(i0 + 1, Math.floor(s1 * WAVEFORM_RATE));
      let max = 0;
      for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > max) max = peaks[i];
      const bar = Math.min(1, (max / 255) * gain) * h;
      if (bar > 0.5) ctx.fillRect(x, (h - bar) / 2, 1, bar);
    }
  }, [clip.mediaId, clip.in, clip.speed, clip.duration, clip.volume, clip.muted, cssW, color, waveVersion]);
  return <canvas ref={ref} className="clip-wave" />;
}

function Filmstrip({ clip, rt, pps, height }: { clip: Clip; rt: MediaRuntime | undefined; pps: number; height: number }) {
  const width = clip.duration * pps;
  if (clip.type === 'image' && rt?.thumb) {
    return (
      <div
        className="clip-strip"
        style={{ backgroundImage: `url("${mediaUrl(rt.thumb)}")`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }}
      />
    );
  }
  const fs = rt?.filmstrip;
  if (!fs || height <= 0) return null;
  const tileW = (fs.tileW / fs.tileH) * height;
  const maxTiles = 160;
  const n = Math.max(1, Math.min(maxTiles, Math.ceil(width / tileW)));
  const step = width / n;
  const url = `url("${mediaUrl(fs.path)}")`;
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const local = (i * step + step / 2) / pps;
    const src = clip.in + local * clip.speed;
    const idx = Math.max(0, Math.min(fs.count - 1, Math.floor(src / fs.interval)));
    tiles.push(
      <div
        key={i}
        style={{
          width: step,
          backgroundImage: url,
          backgroundSize: `${fs.count * tileW}px ${height}px`,
          backgroundPosition: `${-idx * tileW}px 0`,
        }}
      />,
    );
  }
  return <div className="clip-strip">{tiles}</div>;
}

/** Points of a fade curve in a 0..100 high box: from silent/transparent at the bottom to full at the top. */
function fadePoints(x0: number, len: number, curve: FadeCurve | undefined, out: boolean): string {
  const pts: string[] = [];
  const n = 24;
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const g = fadeShape(curve, out ? 1 - f : f);
    pts.push(`${(x0 + f * len).toFixed(1)},${((1 - g) * 100).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Vegas-style fades drawn over the clip: the curve, and shade where it is faded. */
function FadeCurves({ clip, width, pps }: { clip: Clip; width: number; pps: number }) {
  const fi = Math.min(clip.fadeIn, clip.duration) * pps;
  const fo = Math.min(clip.fadeOut, clip.duration) * pps;
  if (fi <= 0 && fo <= 0) return null;
  const inPts = fi > 0 ? fadePoints(0, fi, clip.fadeInCurve, false) : '';
  const outPts = fo > 0 ? fadePoints(width - fo, fo, clip.fadeOutCurve, true) : '';
  return (
    <svg className="clip-fades" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
      {fi > 0 && (
        <>
          <polygon className="shade" points={`0,0 ${inPts}`} />
          <polyline className="line" points={inPts} vectorEffect="non-scaling-stroke" />
        </>
      )}
      {fo > 0 && (
        <>
          <polygon className="shade" points={`${outPts} ${width},0`} />
          <polyline className="line" points={outPts} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

/** A small picture of a fade curve, for menus. */
export function FadeGlyph({ curve, out = false }: { curve: FadeCurve; out?: boolean }) {
  return (
    <svg className="fade-glyph" viewBox="-4 -8 108 116" width={24} height={16} preserveAspectRatio="none">
      <polyline points={fadePoints(0, 100, curve, out)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface ClipViewProps {
  clip: Clip;
  track: Track;
  pps: number;
  height: number;
  selected: boolean;
  media: MediaAsset | undefined;
  rt: MediaRuntime | undefined;
  razor: boolean;
  waveVersion: number;
  /** Linked to another clip (a video and its sound). */
  linked: boolean;
  /** Length shown next to a fade handle while it is dragged. */
  fadeTip: { side: 'in' | 'out'; len: number } | null;
  onPointerDown: (e: React.PointerEvent, clip: Clip, part: 'body' | 'l' | 'r') => void;
  onFadeDown: (e: React.PointerEvent, clip: Clip, side: 'in' | 'out') => void;
  onContextMenu: (e: React.MouseEvent, clip: Clip) => void;
}

export const ClipView = memo(function ClipView(p: ClipViewProps) {
  const t = useT();
  const { clip, track, pps } = p;
  const left = clip.start * pps;
  const width = Math.max(2, clip.duration * pps);
  const bodyH = p.height - 6 - 17 - 2;
  const hasAudio = clip.type === 'audio' || (clip.type === 'video' && !clip.detached && !!p.media?.hasAudio);
  // Fade handles sit on the top corners, at the inner end of each fade.
  const fadeX = (len: number) => Math.min(Math.max(0, Math.min(len, clip.duration) * pps - 5), width - 10);
  const fadeHandles = !track.locked && !p.razor && width >= 26;
  const thumbs = usePrefs((s) => s.clipThumbs);
  const waves = usePrefs((s) => s.clipWaves);
  const showStrip = thumbs && (clip.type === 'video' || clip.type === 'image');
  const kfs = keyframeTimes(clip).filter((k) => k >= 0 && k <= clip.duration);
  const wheelsUsed = Object.values(clip.wheels).some((w) => w.x !== 0 || w.y !== 0 || w.l !== 0);
  const fxActive =
    clip.filter.id !== 'none' ||
    clip.chroma.enabled ||
    clip.effects.some((e) => e.enabled) ||
    !!clip.lut ||
    !!clip.curves ||
    !!clip.hsl ||
    wheelsUsed ||
    Object.values(clip.adjust).some((v) => v !== 0);
  const cls = ['clip', clip.type, p.selected && 'selected', track.locked && 'locked', p.razor && 'razor', clip.muted && 'muted-clip']
    .filter(Boolean)
    .join(' ');
  const label = clip.type === 'text' && clip.text ? clip.text.content.split('\n')[0] : clip.name;

  return (
    <div
      className={cls}
      style={{ left, width }}
      onPointerDown={(e) => p.onPointerDown(e, clip, 'body')}
      onContextMenu={(e) => p.onContextMenu(e, clip)}
      title={clip.name}
    >
      <div className="clip-label">
        <Icon name={TYPE_ICON[clip.type]} size={12} />
        <span>{label}</span>
        {clip.speed !== 1 && <span className="badge">×{+clip.speed.toFixed(2)}</span>}
        {fxActive && <span className="badge">fx</span>}
        {clip.muted && hasAudio && <Icon name="volumeOff" size={12} />}
        {p.linked && <Icon name="link" size={11} className="clip-link" />}
      </div>
      <div className="clip-body">
        {showStrip && <Filmstrip clip={clip} rt={p.rt} pps={pps} height={bodyH} />}
        {clip.type === 'color' && <div className="clip-strip" style={{ background: clip.color, opacity: 0.85 }} />}
        {clip.type === 'shape' && clip.shape && <div className="clip-strip" style={{ background: clip.shape.fill, opacity: 0.6 }} />}
        {hasAudio && waves && <Waveform clip={clip} pps={pps} color={clip.type === 'audio' ? '#a5f3d0' : 'rgba(255,255,255,0.8)'} waveVersion={p.waveVersion} />}
      </div>
      {clip.transition.type !== 'none' && <div className="clip-transition" style={{ width: Math.min(clip.transition.duration, clip.duration) * pps }} />}
      <FadeCurves clip={clip} width={width} pps={pps} />
      {kfs.map((k) => (
        <div key={k} className="clip-kf" style={{ left: k * pps }} />
      ))}
      {!track.locked && !p.razor && (
        <>
          <div className="clip-trim l" onPointerDown={(e) => (e.stopPropagation(), p.onPointerDown(e, clip, 'l'))} />
          <div className="clip-trim r" onPointerDown={(e) => (e.stopPropagation(), p.onPointerDown(e, clip, 'r'))} />
        </>
      )}
      {fadeHandles && (
        <>
          <div
            className={`fade-handle in ${clip.fadeIn > 0 ? 'set' : ''}`}
            style={{ left: fadeX(clip.fadeIn) }}
            title={t('fade.handle')}
            onPointerDown={(e) => p.onFadeDown(e, clip, 'in')}
          />
          <div
            className={`fade-handle out ${clip.fadeOut > 0 ? 'set' : ''}`}
            style={{ right: fadeX(clip.fadeOut) }}
            title={t('fade.handle')}
            onPointerDown={(e) => p.onFadeDown(e, clip, 'out')}
          />
        </>
      )}
      {p.fadeTip && (
        <span className="fade-tip" style={p.fadeTip.side === 'in' ? { left: fadeX(p.fadeTip.len) + 12 } : { right: fadeX(p.fadeTip.len) + 12 }}>
          {t('prefs.seconds', { n: p.fadeTip.len.toFixed(2) })}
        </span>
      )}
    </div>
  );
});

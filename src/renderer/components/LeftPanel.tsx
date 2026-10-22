import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { fxOfKind, useFx } from '../engine/fx/registry';
import { drawFxFrame, filterThumbnail, fxThumbnail, THUMB_SIZE } from '../engine/fx/thumbs';
import { sampleUrl } from '../engine/samples';
import { fxName, type FxDef } from '../engine/fx/types';
import { ModsPanel } from './ModsPanel';
import { LibraryPanel } from './LibraryPanel';
import { mediaUrl } from '../../shared/api';
import { FILTERS, TRANSITIONS } from '../core/effects';
import { TEXT_PRESETS } from '../core/textPresets';
import { formatBytes, formatDuration } from '../core/time';
import type { MediaAsset } from '../core/types';
import { useLang, useT, type I18nKey } from '../i18n';
import { api } from '../api';
import {
  addAdjustmentClip,
  addColorClip,
  addEffect,
  addMediaClip,
  addShapeClip,
  addOverlayClip,
  addSticker,
  addTextClip,
  applyFilter,
  applyTransition,
  setLeftTab,
} from '../store/actions';
import type { ShapeKind } from '../core/types';
import { toast, useEditor, type LeftTab } from '../store/editor';
import { createEditingProxy, importFiles, importViaDialog, relinkMedia, removeEditingProxy, removeMedia } from '../store/media';
import { openContextMenu, type MenuEntry } from '../ui/ContextMenu';
import { Icon, type IconName } from '../ui/Icon';
import { DND } from './dnd';

const TABS: { id: LeftTab; icon: IconName; label: I18nKey }[] = [
  { id: 'media', icon: 'folder', label: 'tab.media' },
  { id: 'library', icon: 'globe', label: 'tab.library' },
  { id: 'text', icon: 'text', label: 'tab.text' },
  { id: 'transitions', icon: 'transition', label: 'tab.transitions' },
  { id: 'effects', icon: 'wand', label: 'tab.effects' },
  { id: 'filters', icon: 'palette', label: 'tab.filters' },
  { id: 'elements', icon: 'shapes', label: 'tab.elements' },
  { id: 'mods', icon: 'layers', label: 'tab.mods' },
];

export function LeftPanel() {
  const t = useT();
  const tab = useEditor((s) => s.leftTab);
  const current = TABS.find((x) => x.id === tab) ?? TABS[0];
  return (
    <div className="left-layout">
      <nav className="rail">
        {TABS.map((x) => (
          <button key={x.id} className={`rail-btn ${tab === x.id ? 'active' : ''}`} onClick={() => setLeftTab(x.id)} title={t(x.label)}>
            <Icon name={x.icon} size={19} />
            <span className="rail-label">{t(x.label)}</span>
          </button>
        ))}
      </nav>
      <div className="left-content">
        <div className="panel-title">{t(current.label)}</div>
        <div className="panel-body">
          {tab === 'media' && <MediaPanel />}
          {tab === 'library' && <LibraryPanel />}
          {tab === 'text' && <TextPanel />}
          {tab === 'transitions' && <TransitionsPanel />}
          {tab === 'effects' && <EffectsPanel />}
          {tab === 'filters' && <FiltersPanel />}
          {tab === 'elements' && <ElementsPanel />}
          {tab === 'mods' && <ModsPanel />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MediaPanel() {
  const t = useT();
  const media = useEditor((s) => s.project.media);
  const tracks = useEditor((s) => s.project.tracks);
  const used = useMemo(() => new Set(tracks.flatMap((tr) => tr.clips.map((c) => c.mediaId))), [tracks]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const paths = [...e.dataTransfer.files].map((f) => api.getPathForFile(f)).filter(Boolean);
    if (paths.length) void importFiles(paths);
  };

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
      style={{ minHeight: '100%' }}
    >
      <div className="panel-toolbar">
        <button className="btn primary" onClick={() => void importViaDialog()}>
          <Icon name="import" size={16} />
          {t('media.import')}
        </button>
      </div>
      {media.length === 0 ? (
        <div className="dropzone">
          <Icon name="film" size={32} />
          <strong>{t('media.emptyTitle')}</strong>
          <span>{t('media.dropHint')}</span>
        </div>
      ) : (
        <div className="media-grid">
          {media.map((m) => (
            <MediaCard key={m.id} m={m} used={used.has(m.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({ m, used }: { m: MediaAsset; used: boolean }) {
  const t = useT();
  const rt = useEditor((s) => s.runtime[m.id]);
  const icon: IconName = m.kind === 'audio' ? 'music' : m.kind === 'image' ? 'image' : 'film';
  const thumbStyle: CSSProperties = rt?.thumb ? { backgroundImage: `url("${mediaUrl(rt.thumb)}")` } : {};
  const status = rt?.status ?? 'pending';

  const menu = (e: React.MouseEvent) => {
    e.preventDefault();
    const proxyItems: MenuEntry[] = [];
    if (m.kind === 'video' && status === 'ready' && !rt?.proxyRequired) {
      proxyItems.push(
        rt?.proxyPath
          ? { label: t('media.dropProxy'), onClick: () => removeEditingProxy(m.id) }
          : { label: t('media.makeProxy'), onClick: () => void createEditingProxy(m.id), disabled: rt?.optimizing },
      );
    }
    openContextMenu(e.clientX, e.clientY, [
      { label: t('media.add'), onClick: () => addMediaClip(m.id), disabled: status === 'missing' },
      ...proxyItems,
      { label: t('media.relink'), onClick: () => void relinkMedia(m.id) },
      { separator: true },
      { label: t('media.remove'), onClick: () => removeMedia(m.id) },
    ]);
  };

  return (
    <div
      className={`media-card ${used ? 'used' : ''}`}
      draggable={status !== 'missing'}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND.media, m.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={() => status !== 'missing' && addMediaClip(m.id)}
      onContextMenu={menu}
      title={`${m.name}\n${m.width ? `${m.width}×${m.height} · ` : ''}${formatBytes(m.size)}\n${m.path}`}
    >
      <div className={`media-thumb ${m.kind === 'audio' ? 'audio' : ''}`} style={thumbStyle}>
        {!rt?.thumb && <Icon name={icon} size={28} />}
      </div>
      <div className="media-badge">
        <Icon name={icon} size={11} />
        {m.kind !== 'image' && formatDuration(m.duration)}
        {rt?.proxyPath && !rt.proxyRequired && <span title={t('media.proxyBadge')}>· P</span>}
      </div>
      {rt?.optimizing && (
        <div className="media-optimizing" title={t('media.optimizing', { p: Math.round(rt.progress * 100) })}>
          <div style={{ width: `${rt.progress * 100}%` }} />
        </div>
      )}
      {status !== 'missing' && (
        <button
          className="media-add"
          title={t('media.add')}
          onClick={(e) => {
            e.stopPropagation();
            addMediaClip(m.id);
          }}
        >
          <Icon name="plus" size={14} />
        </button>
      )}
      <div className="media-info">
        <div className="media-name">{m.name}</div>
        <div className="media-meta">
          <span>{m.kind === 'audio' ? t('media.audio') : m.width ? `${m.width}×${m.height}` : ''}</span>
          {m.kind === 'video' && <span>{Math.round(m.fps * 100) / 100} fps</span>}
        </div>
      </div>
      {status === 'proxying' && (
        <div className="media-status">
          <div style={{ width: '80%' }}>
            {t('media.proxying', { p: Math.round((rt?.progress ?? 0) * 100) })}
            <div className="progress" style={{ marginTop: 4 }}>
              <div style={{ width: `${(rt?.progress ?? 0) * 100}%` }} />
            </div>
          </div>
        </div>
      )}
      {status === 'missing' && (
        <div className="media-status error">
          <div>
            <Icon name="alert" size={16} />
            <div>{t('media.missing')}</div>
            <button className="btn small" style={{ marginTop: 4 }} onClick={() => void relinkMedia(m.id)}>
              {t('media.relink')}
            </button>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="media-status error" title={rt?.error ?? ''}>
          <div>
            <Icon name="alert" size={16} />
            <div>{t('media.error')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function textPreviewStyle(style: (typeof TEXT_PRESETS)[number]['style']): CSSProperties {
  const scale = 0.16;
  return {
    fontFamily: `"${style.fontFamily ?? 'Montserrat Variable'}", sans-serif`,
    fontSize: Math.max(10, (style.fontSize ?? 96) * scale),
    fontWeight: style.weight ?? (style.bold === false ? 400 : 700),
    fontStyle: style.italic ? 'italic' : 'normal',
    textTransform: style.uppercase ? 'uppercase' : undefined,
    color: style.color ?? '#fff',
    ...(style.gradient
      ? {
          backgroundImage: `linear-gradient(${style.gradientAngle ?? 90}deg, ${style.color}, ${style.gradientColor})`,
          WebkitBackgroundClip: 'text',
          color: 'transparent',
        }
      : {}),
    letterSpacing: (style.letterSpacing ?? 0) * scale,
    WebkitTextStroke: style.strokeWidth ? `${Math.max(0.6, style.strokeWidth * scale)}px ${style.strokeColor}` : undefined,
    textShadow: style.shadowBlur ? `0 0 ${style.shadowBlur * scale * 1.5}px ${style.shadowColor}` : undefined,
    background: style.backgroundOpacity ? `${style.background}${Math.round((style.backgroundOpacity / 100) * 255).toString(16).padStart(2, '0')}` : undefined,
    padding: style.backgroundOpacity ? '2px 6px' : undefined,
    borderRadius: style.backgroundOpacity ? 3 : undefined,
    whiteSpace: 'pre',
    textAlign: style.align ?? 'center',
    lineHeight: 1.15,
  };
}

function TextPanel() {
  const t = useT();
  return (
    <>
      <p className="panel-hint">{t('text.hint')}</p>
      <div className="preset-grid">
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.id}
            className="preset-card"
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.text, p.id)}
            onClick={() => addTextClip(p.id)}
          >
            <div className="preset-visual photo-dim" style={{ backgroundImage: `url(${sampleUrl('spa')})` }}>
              <span style={textPreviewStyle(p.style)}>{t(p.sampleKey)}</span>
            </div>
            <div className="preset-label">{t(p.nameKey)}</div>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function transitionBStyle(type: string): CSSProperties {
  switch (type) {
    case 'dissolve':
      return { opacity: 0.5 };
    case 'fadeBlack':
      return { background: '#000' };
    case 'fadeWhite':
      return { background: '#fff' };
    case 'wipeRight':
      return { clipPath: 'inset(0 50% 0 0)' };
    case 'wipeLeft':
      return { clipPath: 'inset(0 0 0 50%)' };
    case 'wipeDown':
      return { clipPath: 'inset(0 0 50% 0)' };
    case 'wipeUp':
      return { clipPath: 'inset(50% 0 0 0)' };
    case 'wipeDiagonal':
      return { clipPath: 'polygon(0 0, 100% 0, 0 100%)' };
    case 'slideLeft':
    case 'pushLeft':
      return { transform: 'translateX(50%)' };
    case 'slideRight':
    case 'pushRight':
      return { transform: 'translateX(-50%)' };
    case 'slideUp':
    case 'pushUp':
      return { transform: 'translateY(50%)' };
    case 'slideDown':
    case 'pushDown':
      return { transform: 'translateY(-50%)' };
    case 'zoomIn':
      return { transform: 'scale(0.6)', opacity: 0.7 };
    case 'zoomOut':
      return { transform: 'scale(1.3)', opacity: 0.6 };
    case 'iris':
      return { clipPath: 'circle(32% at 50% 50%)' };
    case 'clock':
      return { clipPath: 'polygon(50% 50%, 50% 0, 100% 0, 100% 100%, 50% 100%)' };
    case 'blur':
      return { filter: 'blur(2px)', opacity: 0.6 };
    case 'spin':
      return { transform: 'rotate(-40deg) scale(0.6)' };
    default:
      return { display: 'none' };
  }
}

function transitionAStyle(type: string): CSSProperties {
  if (type === 'pushLeft') return { transform: 'translateX(-50%)' };
  if (type === 'pushRight') return { transform: 'translateX(50%)' };
  if (type === 'pushUp') return { transform: 'translateY(-50%)' };
  if (type === 'pushDown') return { transform: 'translateY(50%)' };
  if (type === 'zoomIn') return { transform: 'scale(1.3)' };
  return {};
}

/** Card for a shader effect or transition, previewed with the real shader; plays on hover. */
export function FxCard({ def, active, onClick }: { def: FxDef; active?: boolean; onClick: () => void }) {
  const lang = useLang((s) => s.lang);
  const error = useFx((s) => s.errors[def.id]);
  const [thumb, setThumb] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const live = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    void fxThumbnail(def).then((url) => alive && setThumb(url));
    return () => {
      alive = false;
    };
  }, [def]);
  useEffect(() => {
    const ctx = live.current?.getContext('2d');
    if (!hover || !ctx || !thumb) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      // Transitions loop through their progress, effects run in real time.
      if (drawFxFrame(def, def.kind === 'transition' ? Math.min(1, (s % 1.8) / 1.4) : s + 1, ctx)) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [hover, def, thumb]);
  return (
    <button
      className={`preset-card ${active ? 'active' : ''}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      draggable
      onDragStart={(e) =>
        def.kind === 'generator'
          ? e.dataTransfer.setData(DND.element, JSON.stringify({ kind: 'overlay', id: def.id }))
          : e.dataTransfer.setData(def.kind === 'effect' ? DND.effect : DND.transition, def.id)
      }
      onClick={onClick}
      title={[def.description, def.author && `© ${def.author}`, error].filter(Boolean).join('\n')}
    >
      <div className="preset-visual">
        {thumb ? <img src={thumb} alt="" className="fx-thumb" /> : <Icon name="wand" size={24} />}
        {hover && thumb && <canvas ref={live} className="fx-thumb fx-live" width={THUMB_SIZE.w} height={THUMB_SIZE.h} />}
        {def.source !== 'builtin' && <span className="fx-badge">MOD</span>}
        {error && <span className="fx-badge error">!</span>}
      </div>
      <div className="preset-label">{fxName(def, lang)}</div>
    </button>
  );
}

function EffectsPanel() {
  const t = useT();
  const selection = useEditor((s) => s.selection);
  const defs = useFx((s) => s.defs);
  return (
    <>
      <p className="panel-hint">{t('effects.hint')}</p>
      <div className="preset-grid">
        {fxOfKind(defs, 'effect').map((def) => (
          <FxCard key={def.id} def={def} onClick={() => addEffect(selection, def.id)} />
        ))}
      </div>
    </>
  );
}

function TransitionsPanel() {
  const t = useT();
  const selection = useEditor((s) => s.selection);
  const defs = useFx((s) => s.defs);
  const selectedType = useEditor((s) => {
    const id = s.selection[0];
    for (const tr of s.project.tracks) for (const c of tr.clips) if (c.id === id) return c.transition.type;
    return null;
  });
  const apply = (type: string) => {
    if (selection.length === 0) toast(t('toast.selectClipFirst'));
    for (const id of selection) applyTransition(id, type);
  };
  return (
    <>
      <p className="panel-hint">{t('transitions.hint')}</p>
      <div className="preset-grid">
        {fxOfKind(defs, 'transition').map((def) => (
          <FxCard key={def.id} def={def} active={selectedType === def.id} onClick={() => apply(def.id)} />
        ))}
      </div>
      <div className="preset-grid" style={{ marginTop: 8 }}>
        {TRANSITIONS.filter((x) => x !== 'none').map((type) => (
          <button
            key={type}
            className={`preset-card ${selectedType === type ? 'active' : ''}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.transition, type)}
            onClick={() => apply(type)}
          >
            <div className="preset-visual">
              <div className="transition-visual" style={{ overflow: 'hidden', borderRadius: 3 }}>
                <div className="photo" style={{ backgroundImage: `url(${sampleUrl('mountain')})`, ...transitionAStyle(type) }} />
                <div className="photo" style={{ backgroundImage: `url(${sampleUrl('street')})`, ...transitionBStyle(type) }} />
              </div>
            </div>
            <div className="preset-label">{t(`transition.${type}` as I18nKey)}</div>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function FilterThumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void filterThumbnail(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url ? <img src={url} alt="" className="fx-thumb" /> : <div className="photo" style={{ backgroundImage: `url(${sampleUrl('street')})` }} />;
}

function FiltersPanel() {
  const t = useT();
  const selection = useEditor((s) => s.selection);
  const selectedFilter = useEditor((s) => {
    const id = s.selection[0];
    for (const tr of s.project.tracks) for (const c of tr.clips) if (c.id === id) return c.filter.id;
    return null;
  });
  return (
    <>
      <p className="panel-hint">{t('filters.hint')}</p>
      <div className="preset-grid">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`preset-card ${selectedFilter === f.id ? 'active' : ''}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.filter, f.id)}
            onClick={() => applyFilter(selection, f.id)}
          >
            <div className="preset-visual">
              <FilterThumb id={f.id} />
            </div>
            <div className="preset-label">{t(`filter.${f.id}` as I18nKey)}</div>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

const COLORS = ['#000000', '#ffffff', '#1e88e5', '#e53935', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#ec407a', '#6d4c41', '#37474f'];

const SHAPES: ShapeKind[] = ['rect', 'pill', 'ellipse', 'ring', 'triangle', 'hexagon', 'star', 'burst', 'heart', 'arrow', 'line', 'bubble', 'check', 'cross'];

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  const p: Record<ShapeKind, string> = {
    rect: 'M8 14h48v36H8z',
    ellipse: 'M32 12a24 20 0 1 0 0.01 0z',
    triangle: 'M32 10l26 44H6z',
    star: 'M32 8l7 16 17 1-13 11 4 17-15-9-15 9 4-17-13-11 17-1z',
    arrow: 'M6 26h34V14l18 18-18 18V38H6z',
    line: 'M6 29h52v6H6z',
    bubble: 'M10 10h44a6 6 0 016 6v22a6 6 0 01-6 6H24l-10 10V44h-4a6 6 0 01-6-6V16a6 6 0 016-6z',
    pill: 'M18 20h28a12 12 0 010 24H18a12 12 0 010-24z',
    heart: 'M32 54C14 41 6 31 8 21c2-9 14-13 24-3 10-10 22-6 24 3 2 10-6 20-24 33z',
    burst: 'M32 4l5 12 11-7-2 13 13 1-9 9 9 9-13 1 2 13-11-7-5 12-5-12-11 7 2-13-13-1 9-9-9-9 13-1-2-13 11 7z',
    hexagon: 'M32 6l23 13v26L32 58 9 45V19z',
    ring: 'M32 8a24 24 0 100 48 24 24 0 000-48zm0 9a15 15 0 110 30 15 15 0 010-30z',
    check: 'M6 34l9-9 12 12 23-26 9 9-32 35z',
    cross: 'M14 6l18 18L50 6l8 8-18 18 18 18-8 8-18-18-18 18-8-8 18-18L6 14z',
  };
  return (
    <svg viewBox="0 0 64 64" width="56" height="56">
      <path d={p[kind]} fill="currentColor" />
    </svg>
  );
}

const STICKERS = [
  '😀', '😂', '😍', '🥳', '😎', '🤩', '😮', '😢', '😡', '🤔', '👍', '👎', '👏', '🙌', '🔥', '✨',
  '⭐', '💥', '💯', '❤️', '💔', '💖', '💬', '💡', '🎉', '🎊', '🎁', '🎂', '🎵', '🎬', '📷', '🎮',
  '⚡', '☀️', '🌙', '🌈', '❄️', '🌊', '🍕', '☕', '🚀', '✈️', '🏆', '⚽', '🐶', '🐱', '🌸', '🍀',
  '👀', '✅', '❌', '⚠️', '➡️', '⬇️', '📍', '🔔',
];

function ElementsPanel() {
  const t = useT();
  const defs = useFx((s) => s.defs);
  const generators = fxOfKind(defs, 'generator');
  const overlays = generators.filter((d) => d.category !== 'background');
  const backgrounds = generators.filter((d) => d.category === 'background');
  return (
    <>
      <div className="mods-section-title" style={{ marginTop: 0 }}>
        {t('elements.overlays')}
      </div>
      <p className="panel-hint">{t('elements.overlaysHint')}</p>
      <div className="preset-grid">
        {overlays.map((def) => (
          <FxCard key={def.id} def={def} onClick={() => addOverlayClip(def.id)} />
        ))}
      </div>
      <div className="mods-section-title">{t('elements.backgrounds')}</div>
      <div className="preset-grid">
        {backgrounds.map((def) => (
          <FxCard key={def.id} def={def} onClick={() => addOverlayClip(def.id)} />
        ))}
      </div>
      <div className="mods-section-title">{t('elements.stickers')}</div>
      <div className="sticker-grid">
        {STICKERS.map((emoji) => (
          <button
            key={emoji}
            className="sticker"
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.element, JSON.stringify({ kind: 'sticker', emoji }))}
            onClick={() => addSticker(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="mods-section-title">{t('elements.adjustment')}</div>
      <button
        className="preset-card adjustment-card"
        draggable
        onDragStart={(e) => e.dataTransfer.setData(DND.element, JSON.stringify({ kind: 'adjustment' }))}
        onClick={() => addAdjustmentClip()}
      >
        <div className="preset-label">
          <Icon name="layers" size={16} /> {t('elements.adjustmentHint')}
        </div>
      </button>
      <div className="mods-section-title">{t('elements.shapes')}</div>
      <div className="preset-grid">
        {SHAPES.map((kind) => (
          <button
            key={kind}
            className="preset-card"
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.element, JSON.stringify({ kind: 'shape', shape: kind }))}
            onClick={() => addShapeClip(kind)}
          >
            <div className="preset-visual photo-dim shape-visual" style={{ backgroundImage: `url(${sampleUrl('mountain')})` }}>
              <ShapeIcon kind={kind} />
            </div>
            <div className="preset-label">{t(`shape.${kind}` as I18nKey)}</div>
          </button>
        ))}
      </div>
      <div className="mods-section-title">{t('elements.colors')}</div>
      <p className="panel-hint">{t('elements.hint')}</p>
      <div className="preset-grid">
        {COLORS.map((c) => (
          <button
            key={c}
            className="preset-card"
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.color, c)}
            onClick={() => addColorClip(c)}
          >
            <div className="preset-visual" style={{ background: c }} />
            <div className="preset-label">
              {t('elements.solid')} {c.toUpperCase()}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

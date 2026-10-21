import { useMemo, type CSSProperties } from 'react';
import { mediaUrl } from '../../shared/api';
import { FILTERS, TRANSITIONS } from '../core/effects';
import { TEXT_PRESETS } from '../core/textPresets';
import { formatBytes, formatDuration } from '../core/time';
import type { MediaAsset } from '../core/types';
import { useT, type I18nKey } from '../i18n';
import { api } from '../api';
import { addColorClip, addMediaClip, addTextClip, applyFilter, applyTransition, setLeftTab } from '../store/actions';
import { toast, useEditor, type LeftTab } from '../store/editor';
import { importFiles, importViaDialog, relinkMedia, removeMedia } from '../store/media';
import { openContextMenu } from '../ui/ContextMenu';
import { Icon, type IconName } from '../ui/Icon';
import { DND } from './dnd';

const TABS: { id: LeftTab; icon: IconName; label: I18nKey }[] = [
  { id: 'media', icon: 'folder', label: 'tab.media' },
  { id: 'text', icon: 'text', label: 'tab.text' },
  { id: 'transitions', icon: 'transition', label: 'tab.transitions' },
  { id: 'filters', icon: 'sparkles', label: 'tab.filters' },
  { id: 'elements', icon: 'shapes', label: 'tab.elements' },
];

export function LeftPanel() {
  const t = useT();
  const tab = useEditor((s) => s.leftTab);
  return (
    <>
      <div className="tabs">
        {TABS.map((x) => (
          <button key={x.id} className={`tab ${tab === x.id ? 'active' : ''}`} onClick={() => setLeftTab(x.id)}>
            <Icon name={x.icon} size={18} />
            {t(x.label)}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'media' && <MediaPanel />}
        {tab === 'text' && <TextPanel />}
        {tab === 'transitions' && <TransitionsPanel />}
        {tab === 'filters' && <FiltersPanel />}
        {tab === 'elements' && <ElementsPanel />}
      </div>
    </>
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
    openContextMenu(e.clientX, e.clientY, [
      { label: t('media.add'), onClick: () => addMediaClip(m.id), disabled: status === 'missing' },
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
      </div>
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
    fontFamily: `"${style.fontFamily ?? 'Segoe UI'}", sans-serif`,
    fontSize: Math.max(10, (style.fontSize ?? 96) * scale),
    fontWeight: style.bold === false ? 400 : 700,
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color ?? '#fff',
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
            <div className="preset-visual" style={{ background: '#1b1d23' }}>
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

function TransitionsPanel() {
  const t = useT();
  const selection = useEditor((s) => s.selection);
  const selectedType = useEditor((s) => {
    const id = s.selection[0];
    for (const tr of s.project.tracks) for (const c of tr.clips) if (c.id === id) return c.transition.type;
    return null;
  });
  return (
    <>
      <p className="panel-hint">{t('transitions.hint')}</p>
      <div className="preset-grid">
        {TRANSITIONS.filter((x) => x !== 'none').map((type) => (
          <button
            key={type}
            className={`preset-card ${selectedType === type ? 'active' : ''}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.transition, type)}
            onClick={() => {
              if (selection.length === 0) toast(t('toast.selectClipFirst'));
              for (const id of selection) applyTransition(id, type);
            }}
          >
            <div className="preset-visual">
              <div className="transition-visual" style={{ overflow: 'hidden', borderRadius: 3 }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#2f6fe6,#1b3f8f)', ...transitionAStyle(type) }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#ff9f43,#e8590c)', ...transitionBStyle(type) }} />
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
              <div className="sample-scene" style={{ filter: f.swatch }} />
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

function ElementsPanel() {
  const t = useT();
  return (
    <>
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

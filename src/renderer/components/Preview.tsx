import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { contentSize, layerBox, pointInBox } from '../core/geometry';
import { setPropAt, propValue } from '../core/keyframes';
import { findClip, mediaMap, projectDuration } from '../core/project';
import { resolveScene, type LayerPlan } from '../core/scene';
import { formatTimecode, parseTimecode } from '../core/time';
import { measureText } from '../engine/text';
import { player } from '../engine/player';
import { useT } from '../i18n';
import { shortcutLabel, withShortcut } from '../keymap';
import { commitPreview, previewEdit, select, toast, useEditor } from '../store/editor';
import { setPrefs, usePrefs } from '../store/prefs';
import { saveSnapshot, toggleLoop } from '../commands';
import { openProjectFile } from '../store/actions';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/controls';
import { LevelMeter, ScopesPanel } from './Scopes';

interface StageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Preview() {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<StageBox>({ left: 0, top: 0, width: 0, height: 0 });
  const width = useEditor((s) => s.project.settings.width);
  const height = useEditor((s) => s.project.settings.height);
  const hasClips = useEditor((s) => s.project.tracks.some((tr) => tr.clips.length > 0));
  const showScopes = usePrefs((p) => p.showScopes);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      player.attach(canvasRef.current);
    } catch (e) {
      console.error(e);
      toast(t('toast.webgl'), 'error');
    }
    return () => player.detach();
  }, [t]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const pad = 12;
      const sw = Math.max(1, stage.clientWidth - pad * 2);
      const sh = Math.max(1, stage.clientHeight - pad * 2);
      const aspect = width / height;
      let w = sw;
      let h = w / aspect;
      if (h > sh) {
        h = sh;
        w = h * aspect;
      }
      setBox({ left: Math.round((stage.clientWidth - w) / 2), top: Math.round((stage.clientHeight - h) / 2), width: Math.round(w), height: Math.round(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [width, height]);

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.sel-box')) return;
    const s = useEditor.getState();
    const rect = stageRef.current!.getBoundingClientRect();
    const k = box.width / s.project.settings.width;
    const px = (e.clientX - rect.left - box.left) / k;
    const py = (e.clientY - rect.top - box.top) / k;
    const media = mediaMap(s.project);
    const plans = resolveScene(s.project, s.playhead, media).filter((p) => !p.tail && !p.track.locked);
    for (let i = plans.length - 1; i >= 0; i--) {
      const plan = plans[i];
      if (pointInBox(layerBox(plan, planContent(plan, media), s.project.settings.width, s.project.settings.height), px, py)) {
        select([plan.clip.id]);
        return;
      }
    }
    select([]);
  };

  return (
    <div className="preview">
      <div className="preview-body">
        <div className="preview-stage" ref={stageRef} onPointerDown={onStagePointerDown}>
          <canvas ref={canvasRef} className="preview-canvas" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />
          <TransformOverlay box={box} />
          {!hasClips && (
            <div className="preview-empty">
              <div>
                <img className="empty-logo" src="./logo.png" alt="" draggable={false} />
                <h3>{t('preview.emptyTitle')}</h3>
                <div>{t('preview.emptyHint', { key: shortcutLabel('import') || '—' })}</div>
                <RecentProjects />
              </div>
            </div>
          )}
        </div>
        {showScopes && <ScopesPanel />}
      </div>
      <Transport stageRef={stageRef} />
    </div>
  );
}

function RecentProjects() {
  const t = useT();
  const recent = usePrefs((p) => p.recent);
  const hasMedia = useEditor((s) => s.project.media.length > 0);
  if (recent.length === 0 || hasMedia) return null;
  return (
    <div className="recent-list">
      <h4>{t('preview.recent')}</h4>
      {recent.slice(0, 5).map((r) => (
        <button key={r.path} className="recent-item" onClick={() => void openProjectFile(r.path)} title={r.path}>
          <span>{r.name}</span>
          <small>{r.path}</small>
        </button>
      ))}
    </div>
  );
}

function planContent(plan: LayerPlan, media: Map<string, import('../core/types').MediaAsset>) {
  const { clip } = plan;
  const s = useEditor.getState().project.settings;
  const m = clip.mediaId ? media.get(clip.mediaId) : undefined;
  return contentSize(clip, m, s.width, s.height, clip.text ? measureText(clip.text) : undefined);
}

type DragKind = 'move' | 'scale' | 'rotate';

function TransformOverlay({ box }: { box: StageBox }) {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

  if (playing || selection.length !== 1 || box.width === 0) return null;
  const found = findClip(project, selection[0]);
  if (!found || found.clip.type === 'audio' || found.track.locked) return null;
  const media = mediaMap(project);
  const plan = resolveScene(project, playhead, media).find((p) => p.clip.id === found.clip.id && !p.tail);
  if (!plan) return null;

  const { width: W, height: H, fps } = project.settings;
  const k = box.width / W;
  const lb = layerBox(plan, planContent(plan, media), W, H);
  const clipId = found.clip.id;
  const local = playhead - found.clip.start;
  const tol = 0.5 / fps;

  const begin = (kind: DragKind) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const clip = found.clip;
    const x0 = propValue(clip, 'x', local);
    const y0 = propValue(clip, 'y', local);
    const s0 = propValue(clip, 'scale', local);
    const r0 = propValue(clip, 'rotation', local);
    const stage = target.closest('.preview-stage')!.getBoundingClientRect();
    // Anchor (layer centre) in client coordinates.
    const ax = stage.left + box.left + (W / 2 + plan.x) * k;
    const ay = stage.top + box.top + (H / 2 + plan.y) * k;
    const startX = e.clientX;
    const startY = e.clientY;
    const d0 = Math.max(4, Math.hypot(startX - ax, startY - ay));
    const a0 = Math.atan2(startY - ay, startX - ax);

    const onMove = (ev: PointerEvent) => {
      previewEdit((d) => {
        const c = d.tracks.flatMap((tr) => tr.clips).find((x) => x.id === clipId);
        if (!c) return;
        if (kind === 'move') {
          let nx = x0 + (ev.clientX - startX) / k;
          let ny = y0 + (ev.clientY - startY) / k;
          const snap = 8 / k;
          const v = !ev.altKey && Math.abs(nx) < snap;
          const h = !ev.altKey && Math.abs(ny) < snap;
          if (v) nx = 0;
          if (h) ny = 0;
          setGuides({ v, h });
          setPropAt(c, 'x', local, Math.round(nx), tol);
          setPropAt(c, 'y', local, Math.round(ny), tol);
        } else if (kind === 'scale') {
          const dist = Math.hypot(ev.clientX - ax, ev.clientY - ay);
          setPropAt(c, 'scale', local, Math.max(0.01, Math.round(s0 * (dist / d0) * 1000) / 1000), tol);
        } else {
          let deg = r0 + ((Math.atan2(ev.clientY - ay, ev.clientX - ax) - a0) * 180) / Math.PI;
          if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
          setPropAt(c, 'rotation', local, Math.round(deg * 10) / 10, tol);
        }
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setGuides({ v: false, h: false });
      commitPreview();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const w = lb.w * k;
  const h = lb.h * k;
  const x = box.left + lb.cx * k - w / 2;
  const y = box.top + lb.cy * k - h / 2;
  return (
    <>
      {guides.v && <div className="guide v" style={{ left: box.left + box.width / 2, top: box.top, height: box.height, bottom: 'auto' }} />}
      {guides.h && <div className="guide h" style={{ top: box.top + box.height / 2, left: box.left, width: box.width, right: 'auto' }} />}
      <div
        className="sel-box"
        style={{ width: w, height: h, transform: `translate(${x}px, ${y}px) rotate(${lb.rotation}deg)` }}
        onPointerDown={begin('move')}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
          <div key={c} className={`sel-handle ${c}`} onPointerDown={begin('scale')} />
        ))}
        <div className="sel-rotate" onPointerDown={begin('rotate')} />
      </div>
    </>
  );
}

function TimecodeInput() {
  const playhead = useEditor((s) => s.playhead);
  const fps = useEditor((s) => s.project.settings.fps);
  const [editing, setEditing] = useState<string | null>(null);
  if (editing !== null) {
    return (
      <input
        className="num-input timecode"
        style={{ width: 110, textAlign: 'center' }}
        autoFocus
        value={editing}
        onChange={(e) => setEditing(e.target.value)}
        onBlur={() => setEditing(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = parseTimecode(editing, fps);
            if (v !== null) player.seek(v);
            setEditing(null);
          } else if (e.key === 'Escape') setEditing(null);
        }}
      />
    );
  }
  return (
    <span className="timecode" style={{ cursor: 'text' }} onDoubleClick={() => setEditing(formatTimecode(playhead, fps))}>
      {formatTimecode(playhead, fps)}
    </span>
  );
}

function Transport({ stageRef }: { stageRef: React.RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const playing = useEditor((s) => s.playing);
  const fps = useEditor((s) => s.project.settings.fps);
  const duration = useEditor((s) => projectDuration(s.project));
  const previewScale = useEditor((s) => s.previewScale);
  const useProxies = usePrefs((p) => p.useProxies);
  const showScopes = usePrefs((p) => p.showScopes);
  const loop = usePrefs((p) => p.loopPlayback);
  usePrefs((p) => p.keymap);

  return (
    <div className="transport">
      <div className="transport-left">
        <TimecodeInput />
        <span className="timecode dim">/ {formatTimecode(duration, fps)}</span>
        <LevelMeter />
      </div>
      <div className="transport-center">
        <IconButton icon="toStart" title={withShortcut(t('preview.toStart'), 'goStart')} onClick={() => player.seek(0)} />
        <IconButton icon="stepBack" title={withShortcut(t('preview.prevFrame'), 'frameBack')} onClick={() => player.stepFrames(-1)} />
        <button className="play-btn" title={withShortcut(playing ? t('preview.pause') : t('preview.play'), 'playPause')} onClick={() => player.toggle()}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <IconButton icon="stepFwd" title={withShortcut(t('preview.nextFrame'), 'frameForward')} onClick={() => player.stepFrames(1)} />
        <IconButton icon="toEnd" title={withShortcut(t('preview.toEnd'), 'goEnd')} onClick={() => player.seek(duration)} />
        <IconButton icon="loop" title={withShortcut(t('cmd.loop'), 'loop')} active={loop} onClick={toggleLoop} />
      </div>
      <div className="transport-right">
        <select
          className="select compact"
          title={t('preview.quality')}
          value={previewScale}
          onChange={(e) => useEditor.setState({ previewScale: Number(e.target.value) })}
        >
          <option value={1}>{t('preview.full')}</option>
          <option value={0.5}>{t('preview.half')}</option>
          <option value={0.25}>{t('preview.quarter')}</option>
        </select>
        <IconButton icon="speed" title={t('preview.useProxies')} active={useProxies} onClick={() => setPrefs({ useProxies: !useProxies })} />
        <IconButton icon="scopes" title={withShortcut(t('preview.scopes'), 'toggleScopes')} active={showScopes} onClick={() => setPrefs({ showScopes: !showScopes })} />
        <IconButton icon="camera" title={withShortcut(t('menu.snapshot'), 'snapshot')} onClick={() => void saveSnapshot()} />
        <IconButton
          icon="fullscreen"
          title={t('preview.fullscreen')}
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void stageRef.current?.requestFullscreen();
          }}
        />
      </div>
    </div>
  );
}

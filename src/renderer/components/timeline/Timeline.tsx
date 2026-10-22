import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Draft } from 'immer';
import { clearRange, insertClip, openGap, splitClip, trimBounds, trimEndTo, trimStartTo } from '../../core/edit';
import { clipAtTime, clipEnd, displayTracks, findClip, mediaMap, projectDuration, tracksOfKind } from '../../core/project';
import { clamp, snapToFrame } from '../../core/time';
import type { Clip, Project, ShapeKind, Track } from '../../core/types';
import { player } from '../../engine/player';
import { useT } from '../../i18n';
import {
  addAdjustmentClip,
  addColorClip,
  addEffect,
  addMarker,
  addShapeClip,
  addMediaClip,
  addTextClip,
  addTrack,
  applyFilter,
  applyTransition,
  closeTrackGaps,
  copySelection,
  cutSelection,
  deleteSelection,
  detachAudio,
  duplicateSelection,
  freezeFrame,
  openDialog,
  paste,
  removeMarker,
  removeTrack,
  reverseClip,
  selectForward,
  splitAt,
  updateClip,
  zoomBy,
  zoomToFit,
} from '../../store/actions';
import { commitPreview, previewEdit, redo, select, undo, useEditor, type Tool } from '../../store/editor';
import { startRipple, startRoll, startSlide, startSlip, type DragContext } from './toolDrags';
import type { IconName } from '../../ui/Icon';
import type { I18nKey } from '../../i18n';
import { importFiles } from '../../store/media';
import { api } from '../../api';
import { openContextMenu, type MenuEntry } from '../../ui/ContextMenu';
import { IconButton } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { defaultAdjust, defaultChroma } from '../../core/project';
import { ClipView, HEADER_W, PlayheadLine, RulerCanvas, RulerPlayhead, TrackHeader, trackHeight } from './parts';
import { DND } from '../dnd';

const SNAP_PX = 9;

function snapPoints(p: Project, exclude: Set<string>, playhead: number): number[] {
  const pts = [0, playhead];
  for (const m of p.markers) pts.push(m.time);
  for (const tr of p.tracks) {
    for (const c of tr.clips) {
      if (exclude.has(c.id)) continue;
      pts.push(c.start, clipEnd(c));
    }
  }
  return pts;
}

/** Best adjustment to bring any of `edges` onto a snap point, or 0. */
function snapDelta(edges: number[], points: number[], threshold: number): { delta: number; at: number | null } {
  let best = threshold;
  let delta = 0;
  let at: number | null = null;
  for (const e of edges) {
    for (const pt of points) {
      const d = pt - e;
      if (Math.abs(d) < best) {
        best = Math.abs(d);
        delta = d;
        at = pt;
      }
    }
  }
  return { delta, at };
}

export const TOOLS: { id: Tool; icon: IconName; label: I18nKey }[] = [
  { id: 'select', icon: 'cursor', label: 'tl.select' },
  { id: 'forward', icon: 'forward', label: 'tool.forward' },
  { id: 'ripple', icon: 'ripple', label: 'tool.ripple' },
  { id: 'roll', icon: 'roll', label: 'tool.roll' },
  { id: 'slip', icon: 'slip', label: 'tool.slip' },
  { id: 'slide', icon: 'slide', label: 'tool.slide' },
  { id: 'razor', icon: 'razor', label: 'tl.razor' },
];

function kindIndex(p: Project, track: Track): number {
  return tracksOfKind(p, track.kind).findIndex((tr) => tr.id === track.id);
}

type DragState =
  | {
      kind: 'move';
      base: Project;
      ids: string[];
      anchorId: string;
      startX: number;
      startY: number;
      moved: boolean;
      clickedSelected: boolean;
      dt: number;
      trackDelta: number;
    }
  | { kind: 'trim'; base: Project; id: string; side: 'l' | 'r'; startX: number };

export function Timeline() {
  const t = useT();
  const project = useEditor((s) => s.project);
  const pps = useEditor((s) => s.pxPerSec);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const snapping = useEditor((s) => s.snapping);
  const runtime = useEditor((s) => s.runtime);
  const waveVersion = useEditor((s) => s.waveVersion);
  const snapLine = useEditor((s) => s.snapLine);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 800, scrollLeft: 0 });
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const insertOnDrop = useRef(false);
  const pendingScroll = useRef<number | null>(null);

  const duration = projectDuration(project);
  const contentW = Math.max((duration + 30) * pps, view.w - HEADER_W);
  const rows = displayTracks(project);
  const media = useMemo(() => mediaMap(project), [project]);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const hasClips = project.tracks.some((tr) => tr.clips.length > 0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setView({ w: el.clientWidth, scrollLeft: el.scrollLeft });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pendingScroll.current !== null) {
      el.scrollLeft = Math.max(0, pendingScroll.current);
      pendingScroll.current = null;
    }
  }, [pps]);

  // Ctrl + wheel zooms around the cursor.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const s = useEditor.getState();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER_W;
      const tAt = (x + el.scrollLeft) / s.pxPerSec;
      const next = clamp(s.pxPerSec * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 2, 1200);
      pendingScroll.current = tAt * next - x;
      useEditor.setState({ pxPerSec: next });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAt = useCallback(
    (clientX: number): number => {
      const el = scrollRef.current!;
      const rect = el.getBoundingClientRect();
      return Math.max(0, (clientX - rect.left + el.scrollLeft - HEADER_W) / pps);
    },
    [pps],
  );

  // -------------------------------------------------------------------------
  // Ruler scrubbing

  const onRulerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    player.pause();
    const seekTo = (x: number) => {
      const s = useEditor.getState();
      let tt = timeAt(x);
      if (s.snapping) {
        const { delta } = snapDelta([tt], snapPoints(s.project, new Set(), -1), SNAP_PX / pps);
        tt += delta;
      }
      player.seek(tt);
    };
    seekTo(e.clientX);
    const move = (ev: PointerEvent) => seekTo(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // -------------------------------------------------------------------------
  // Clip move / trim

  const applyMove = (d: Draft<Project>, st: Extract<DragState, { kind: 'move' }>, final: boolean, insert = false) => {
    const fps = st.base.settings.fps;
    const moved: { clip: Draft<Clip>; target: Draft<Track> }[] = [];
    for (const id of st.ids) {
      const from = d.tracks.find((tr) => tr.clips.some((c) => c.id === id));
      if (!from) continue;
      const idx = from.clips.findIndex((c) => c.id === id);
      const [clip] = from.clips.splice(idx, 1);
      clip.start = Math.max(0, snapToFrame(clip.start + st.dt, fps));
      const kindTracks = d.tracks.filter((tr) => tr.kind === from.kind);
      const ki = kindTracks.indexOf(from);
      const target = kindTracks[ki + st.trackDelta] ?? from;
      moved.push({ clip, target });
    }
    const movedIds = new Set(st.ids);
    for (const { clip, target } of moved) {
      if (final && insert) {
        const straddling = target.clips.find((c) => c.start < clip.start - 1e-6 && clipEnd(c) > clip.start + 1e-6);
        if (straddling) splitClip(target, straddling.id, clip.start, 1 / fps);
        openGap(target, clip.start, clip.duration);
      } else if (final) {
        clearRange(target, clip.start, clipEnd(clip), movedIds);
      }
      insertClip(target, clip);
    }
  };

  const applyTrim = (d: Draft<Project>, st: Extract<DragState, { kind: 'trim' }>, newEdge: number) => {
    const tr = d.tracks.find((x) => x.clips.some((c) => c.id === st.id));
    const clip = tr?.clips.find((c) => c.id === st.id);
    if (!tr || !clip) return;
    if (st.side === 'l') trimStartTo(clip, newEdge);
    else trimEndTo(clip, newEdge);
  };

  const toolContext = (): DragContext => ({
    media,
    snap: (time, exclude) => {
      const s = useEditor.getState();
      if (!s.snapping) return { time, at: null };
      const { delta, at } = snapDelta([time], snapPoints(s.project, exclude, s.playhead), SNAP_PX / s.pxPerSec);
      return { time: time + delta, at };
    },
  });

  // Rubber-band selection on empty lane space; a plain click moves the playhead.
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const onLanePointerDown = (e: React.PointerEvent, track: Track) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const s = useEditor.getState();
    if (s.tool === 'forward') {
      const ids = selectForward(timeAt(e.clientX), e.shiftKey ? track.id : undefined);
      if (ids.length) startMove(e, ids, ids[0], false);
      return;
    }
    const x0 = e.clientX;
    const y0 = e.clientY;
    const additive = e.shiftKey || e.ctrlKey;
    const baseSel = additive ? s.selection : [];
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      const left = Math.min(x0, ev.clientX);
      const top = Math.min(y0, ev.clientY);
      const right = Math.max(x0, ev.clientX);
      const bottom = Math.max(y0, ev.clientY);
      setMarquee({ x: left, y: top, w: right - left, h: bottom - top });
      const t0 = timeAt(left);
      const t1 = timeAt(right);
      const p = useEditor.getState().project;
      const hit: string[] = [];
      document.querySelectorAll<HTMLElement>('.track-lane[data-track-id]').forEach((lane) => {
        const r = lane.getBoundingClientRect();
        if (r.bottom < top || r.top > bottom) return;
        const tr = p.tracks.find((x) => x.id === lane.dataset.trackId);
        if (!tr || tr.locked) return;
        for (const c of tr.clips) if (c.start < t1 && clipEnd(c) > t0) hit.push(c.id);
      });
      select([...new Set([...baseSel, ...hit])]);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setMarquee(null);
      if (!moved) {
        select([]);
        player.pause();
        player.seek(timeAt(ev.clientX));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onClipPointerDown = (e: React.PointerEvent, clip: Clip, part: 'body' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useEditor.getState();
    const found = findClip(s.project, clip.id);
    if (!found || found.track.locked) return;

    if (s.tool === 'razor') {
      let tt = snapToFrame(timeAt(e.clientX), s.project.settings.fps);
      if (s.snapping && Math.abs(tt - s.playhead) * pps < SNAP_PX) tt = s.playhead;
      splitAt(tt, [clip.id]);
      return;
    }

    // Advanced tools handle the gesture themselves; otherwise fall through to select/move/trim.
    const tools = toolContext();
    if (part !== 'body' && s.tool === 'ripple') {
      select([clip.id]);
      startRipple(e, clip.id, part, tools);
      return;
    }
    if (part !== 'body' && s.tool === 'roll') {
      select([clip.id]);
      if (startRoll(e, clip.id, part, tools)) return;
    }
    if (part === 'body' && s.tool === 'slip') {
      select([clip.id]);
      if (startSlip(e, clip.id, tools)) return;
    }
    if (part === 'body' && s.tool === 'slide') {
      select([clip.id]);
      startSlide(e, clip.id, tools);
      return;
    }

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const wasSelected = s.selection.includes(clip.id);
    let ids = s.selection;
    if (s.tool === 'forward' && part === 'body') {
      ids = selectForward(clip.start, e.shiftKey ? found.track.id : undefined);
    } else if (additive) {
      ids = wasSelected ? s.selection.filter((x) => x !== clip.id) : [...s.selection, clip.id];
      select(ids);
      if (wasSelected) return;
    } else if (!wasSelected) {
      ids = [clip.id];
      select(ids);
    }

    if (part === 'body') {
      startMove(e, ids, clip.id, wasSelected && !additive);
    } else {
      select([clip.id]);
      beginDrag({ kind: 'trim', base: s.project, id: clip.id, side: part, startX: e.clientX });
    }
  };

  const startMove = (e: React.PointerEvent, ids: string[], anchorId: string, clickedSelected: boolean) => {
    const s = useEditor.getState();
    const editable = ids.filter((id) => {
      const f = findClip(s.project, id);
      return f && !f.track.locked;
    });
    beginDrag({
      kind: 'move',
      base: s.project,
      ids: editable,
      anchorId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      clickedSelected,
      dt: 0,
      trackDelta: 0,
    });
  };

  const beginDrag = (state: DragState) => {
    drag.current = state;
    const onMove = (ev: PointerEvent) => {
      const st = drag.current;
      if (!st) return;
      const state = useEditor.getState();
      const threshold = SNAP_PX / state.pxPerSec;
      if (st.kind === 'move') {
        if (!st.moved && Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) < 4) return;
        st.moved = true;
        let dt = (ev.clientX - st.startX) / state.pxPerSec;
        const clips = st.ids.map((id) => findClip(st.base, id)!).filter(Boolean);
        const minStart = Math.min(...clips.map((f) => f.clip.start));
        const maxEnd = Math.max(...clips.map((f) => clipEnd(f.clip)));
        if (minStart + dt < 0) dt = -minStart;
        let at: number | null = null;
        if (state.snapping && !ev.altKey) {
          const snap = snapDelta([minStart + dt, maxEnd + dt], snapPoints(st.base, new Set(st.ids), state.playhead), threshold);
          dt += snap.delta;
          at = snap.at;
        }
        // Vertical: move between tracks of the same kind.
        const anchor = findClip(st.base, st.anchorId);
        let trackDelta = 0;
        const hovered = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-track-id]') as HTMLElement | null;
        const hoveredTrack = hovered ? st.base.tracks.find((tr) => tr.id === hovered.dataset.trackId) : undefined;
        if (anchor && hoveredTrack && hoveredTrack.kind === anchor.track.kind && !hoveredTrack.locked) {
          trackDelta = kindIndex(st.base, hoveredTrack) - kindIndex(st.base, anchor.track);
          // Keep every moved clip on an existing track.
          for (const f of clips) {
            if (f.track.kind !== anchor.track.kind) continue;
            const list = tracksOfKind(st.base, f.track.kind);
            const idx = list.indexOf(f.track) + trackDelta;
            if (idx < 0 || idx >= list.length || list[idx].locked) {
              trackDelta = 0;
              break;
            }
          }
        }
        st.dt = dt;
        st.trackDelta = trackDelta;
        previewEdit((d) => applyMove(d, st, false));
        useEditor.setState({ snapLine: at });
      } else {
        const f = findClip(st.base, st.id);
        if (!f) return;
        const m = f.clip.mediaId ? media.get(f.clip.mediaId) : undefined;
        const minLen = 1 / st.base.settings.fps;
        const b = trimBounds(f.track, f.clip, m, minLen);
        const dt = (ev.clientX - st.startX) / state.pxPerSec;
        let edge = st.side === 'l' ? f.clip.start + dt : clipEnd(f.clip) + dt;
        let at: number | null = null;
        if (state.snapping && !ev.altKey) {
          const snap = snapDelta([edge], snapPoints(st.base, new Set([st.id]), state.playhead), threshold);
          edge += snap.delta;
          at = snap.at;
        }
        edge = snapToFrame(edge, st.base.settings.fps);
        edge = st.side === 'l' ? clamp(edge, b.minStart, b.maxStartForMin) : clamp(edge, b.minEndForMin, b.maxEnd);
        previewEdit((d) => applyTrim(d, st, edge));
        useEditor.setState({ snapLine: at });
      }
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      insertOnDrop.current = ev.ctrlKey || ev.metaKey;
      const st = drag.current;
      drag.current = null;
      if (!st) return;
      if (st.kind === 'move') {
        if (!st.moved) {
          if (st.clickedSelected) select([st.anchorId]);
          return;
        }
        // Ctrl on release: insert edit (push clips right) instead of overwriting.
        commitPreview((d) => applyMove(d, st, true, insertOnDrop.current));
      } else {
        commitPreview();
      }
      useEditor.setState({ snapLine: null });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // -------------------------------------------------------------------------
  // Context menus

  const clipMenu = (e: React.MouseEvent, clip: Clip) => {
    e.preventDefault();
    e.stopPropagation();
    const s = useEditor.getState();
    if (!s.selection.includes(clip.id)) select([clip.id]);
    const at = timeAt(e.clientX);
    const playheadInside = s.playhead > clip.start && s.playhead < clipEnd(clip);
    const hasAudio = clip.type === 'video' && !!(clip.mediaId && media.get(clip.mediaId)?.hasAudio);
    const items: MenuEntry[] = [
      { label: t('ctx.split'), shortcut: 'S', onClick: () => splitAt(playheadInside ? s.playhead : at, [clip.id]) },
      { label: t('ctx.copy'), shortcut: 'Ctrl+C', onClick: copySelection },
      { label: t('ctx.cut'), shortcut: 'Ctrl+X', onClick: cutSelection },
      { label: t('ctx.paste'), shortcut: 'Ctrl+V', onClick: () => paste(at), disabled: !s.clipboard },
      { label: t('ctx.duplicate'), shortcut: 'Ctrl+D', onClick: duplicateSelection },
      { label: `${t('menu.pasteAttrs')}…`, shortcut: 'Ctrl+Alt+V', onClick: () => openDialog('paste-attrs'), disabled: !s.clipboard },
    ];
    if (hasAudio) items.push({ label: t('ctx.detachAudio'), onClick: () => detachAudio(clip.id) });
    if (clip.type === 'video') items.push({ label: t('tool.freeze'), shortcut: 'Shift+F', onClick: () => void freezeFrame() });
    if (clip.type === 'video' || clip.type === 'audio') items.push({ label: t('tool.reverse'), shortcut: 'Ctrl+R', onClick: () => void reverseClip(clip.id) });
    if (clip.type === 'video') items.push({ label: `${t('enh.stabilize')}…`, onClick: () => openDialog('stabilize') });
    if (hasAudio || clip.type === 'audio') {
      items.push(
        { label: `${t('enh.denoise')}…`, onClick: () => openDialog('denoise') },
        { label: `${t('enh.loudness')}…`, onClick: () => openDialog('loudness') },
      );
    }
    if (clip.type === 'video' || clip.type === 'image') items.push({ label: `✨ ${t('ai.bgTitle')}…`, onClick: () => openDialog('ai-bg') });
    if (hasAudio || clip.type === 'audio') items.push({ label: `✨ ${t('ai.subsTitle')}…`, onClick: () => openDialog('ai-subs') });
    if (clip.transition.type !== 'none') {
      items.push({ label: t('ctx.removeTransition'), onClick: () => updateClip(clip.id, (c) => void (c.transition.type = 'none')) });
    }
    if (clip.type !== 'audio') {
      items.push({
        label: t('ctx.resetEffects'),
        onClick: () =>
          updateClip(clip.id, (c) => {
            c.adjust = defaultAdjust();
            c.filter = { id: 'none', amount: 100 };
            c.chroma = defaultChroma();
          }),
      });
    }
    items.push(
      { separator: true },
      { label: t('ctx.delete'), shortcut: 'Del', onClick: () => deleteSelection(false) },
      { label: t('ctx.rippleDelete'), shortcut: 'Shift+Del', onClick: () => deleteSelection(true) },
    );
    openContextMenu(e.clientX, e.clientY, items);
  };

  const laneMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault();
    const at = timeAt(e.clientX);
    const s = useEditor.getState();
    openContextMenu(e.clientX, e.clientY, [
      { label: t('ctx.paste'), shortcut: 'Ctrl+V', onClick: () => paste(at), disabled: !s.clipboard },
      { label: t('tl.marker'), onClick: () => addMarker(at) },
      { separator: true },
      { label: t('tl.addVideoTrack'), onClick: () => addTrack('video') },
      { label: t('tl.addAudioTrack'), onClick: () => addTrack('audio') },
      { label: t('ctx.closeGaps'), onClick: () => closeTrackGaps(track.id), disabled: track.locked },
      {
        label: t('tl.deleteTrack'),
        onClick: () => removeTrack(track.id),
        disabled: tracksOfKind(s.project, track.kind).length <= 1,
      },
    ]);
  };

  // -------------------------------------------------------------------------
  // Drag & drop from panels and the file system

  const acceptsDrop = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    return Object.values(DND).some((k) => types.includes(k)) || types.includes('Files');
  };

  const handleDrop = async (e: React.DragEvent, track: Track | null) => {
    e.preventDefault();
    setDropTarget(null);
    const s = useEditor.getState();
    const fps = s.project.settings.fps;
    let time = snapToFrame(timeAt(e.clientX), fps);
    if (s.snapping) {
      const { delta } = snapDelta([time], snapPoints(s.project, new Set(), s.playhead), SNAP_PX / pps);
      time = snapToFrame(time + delta, fps);
    }
    const dt = e.dataTransfer;
    // Ctrl while dropping: insert edit (push later clips right) instead of overwrite.
    const insert = !!track && (e.ctrlKey || e.metaKey);
    const opts = { trackId: track?.id, time, overwrite: !!track && !insert, insert, newTrack: !track };
    const mediaId = dt.getData(DND.media);
    const textId = dt.getData(DND.text);
    const transition = dt.getData(DND.transition);
    const filter = dt.getData(DND.filter);
    const color = dt.getData(DND.color);
    const effect = dt.getData(DND.effect);
    const element = dt.getData(DND.element);
    if (element) {
      const el = JSON.parse(element) as { kind: 'adjustment' } | { kind: 'shape'; shape: ShapeKind };
      const where = track?.kind === 'video' ? opts : { time, newTrack: !track };
      if (el.kind === 'adjustment') addAdjustmentClip(where);
      else addShapeClip(el.shape, where);
      return;
    }
    if (effect && track) {
      const target = clipAtTime(track, timeAt(e.clientX));
      if (target) {
        addEffect([target.id], effect);
        select([target.id]);
      }
      return;
    }
    if (mediaId) addMediaClip(mediaId, opts);
    else if (textId) addTextClip(textId, track?.kind === 'video' ? opts : { time, newTrack: !track });
    else if (color) addColorClip(color, track?.kind === 'video' ? opts : { time, newTrack: !track });
    else if (transition || filter) {
      if (!track) return;
      const target = clipAtTime(track, timeAt(e.clientX));
      if (!target) return;
      if (transition) applyTransition(target.id, transition);
      else applyFilter([target.id], filter);
      select([target.id]);
    } else if (dt.files.length > 0) {
      const paths = [...dt.files].map((f) => api.getPathForFile(f)).filter(Boolean);
      const assets = await importFiles(paths);
      let at = time;
      for (const a of assets) {
        addMediaClip(a.id, { trackId: track?.id, time: at, overwrite: !!track, newTrack: !track });
        const added = useEditor.getState().selection[0];
        const f = added ? findClip(useEditor.getState().project, added) : null;
        if (f) at = clipEnd(f.clip);
      }
    }
  };

  const laneDragProps = (track: Track | null, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrop(e) || track?.locked) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.stopPropagation();
      void handleDrop(e, track);
    },
  });

  // -------------------------------------------------------------------------

  const s = useEditor.getState;
  return (
    <div className="timeline">
      <div className="tl-toolbar">
        {TOOLS.map((x) => (
          <IconButton key={x.id} icon={x.icon} title={t(x.label)} active={tool === x.id} onClick={() => useEditor.setState({ tool: x.id })} />
        ))}
        <div className="sep" />
        <IconButton icon="undo" title={`${t('menu.undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={undo} />
        <IconButton icon="redo" title={`${t('menu.redo')} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={redo} />
        <div className="sep" />
        <IconButton icon="scissors" title={t('tl.split')} onClick={() => splitAt(s().playhead)} />
        <IconButton icon="trash" title={t('tl.delete')} disabled={selection.length === 0} onClick={() => deleteSelection(false)} />
        <IconButton icon="marker" title={t('tl.marker')} onClick={() => addMarker()} />
        <IconButton icon="mic" title={t('vo.title')} onClick={() => openDialog('voiceover')} />
        <div className="sep" />
        <IconButton icon="magnet" title={t('tl.snap')} active={snapping} onClick={() => useEditor.setState({ snapping: !snapping })} />
        <div className="spacer" />
        <IconButton icon="film" title={t('tl.addVideoTrack')} onClick={() => addTrack('video')} />
        <IconButton icon="music" title={t('tl.addAudioTrack')} onClick={() => addTrack('audio')} />
        <div className="sep" />
        <IconButton icon="minus" title={t('tl.zoomOut')} onClick={() => zoomBy(1 / 1.4)} />
        <input
          type="range"
          className="tl-zoom"
          min={0}
          max={100}
          step={0.5}
          value={(Math.log(pps / 2) / Math.log(600)) * 100}
          onChange={(e) => useEditor.setState({ pxPerSec: 2 * Math.pow(600, Number(e.target.value) / 100) })}
        />
        <IconButton icon="plus" title={t('tl.zoomIn')} onClick={() => zoomBy(1.4)} />
        <IconButton icon="fit" title={t('tl.fit')} onClick={() => zoomToFit(view.w - HEADER_W)} />
      </div>
      <div
        className={`tl-scroll tool-${tool}`}
        ref={scrollRef}
        onPointerDown={(e) => {
          if (e.button === 0 && e.target === e.currentTarget) select([]);
        }}
      >
        <div className="tl-inner" style={{ width: HEADER_W + contentW }}>
          <div className="tl-ruler-row">
            <div className="tl-corner" style={{ width: HEADER_W }}>
              <Icon name="layers" size={14} />
            </div>
            <div className="tl-ruler" style={{ width: contentW }} onPointerDown={onRulerDown}>
              <RulerCanvas width={Math.max(1, view.w - HEADER_W)} scrollLeft={view.scrollLeft} pps={pps} fps={project.settings.fps} />
              <RulerPlayhead pps={pps} />
              {(project.markIn != null || project.markOut != null) && (
                <div
                  className="io-range"
                  style={{
                    left: (project.markIn ?? 0) * pps,
                    width: Math.max(2, ((project.markOut ?? Math.max(duration, project.markIn ?? 0)) - (project.markIn ?? 0)) * pps),
                  }}
                  title={t('export.range')}
                />
              )}
              {project.markers.map((m) => (
                <div
                  key={m.id}
                  className="marker"
                  style={{ left: m.time * pps, background: m.color }}
                  title={t('tl.deleteMarker')}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    player.seek(m.time);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(e.clientX, e.clientY, [{ label: t('tl.deleteMarker'), onClick: () => removeMarker(m.id) }]);
                  }}
                />
              ))}
            </div>
          </div>

          {rows.map((track) => {
            const h = trackHeight(track);
            return (
              <div className="tl-row" key={track.id} style={{ height: h }}>
                <TrackHeader track={track} height={h} onContextMenu={(e) => laneMenu(e, track)} />
                <div
                  className={`track-lane ${track.locked ? 'locked' : ''} ${dropTarget === track.id ? 'drop-target' : ''}`}
                  data-track-id={track.id}
                  style={{ width: contentW }}
                  onPointerDown={(e) => onLanePointerDown(e, track)}
                  onContextMenu={(e) => e.target === e.currentTarget && laneMenu(e, track)}
                  {...laneDragProps(track, track.id)}
                >
                  {track.clips.map((clip) => (
                    <ClipView
                      key={clip.id}
                      clip={clip}
                      track={track}
                      pps={pps}
                      height={h}
                      selected={selSet.has(clip.id)}
                      media={clip.mediaId ? media.get(clip.mediaId) : undefined}
                      rt={clip.mediaId ? runtime[clip.mediaId] : undefined}
                      razor={tool === 'razor'}
                      waveVersion={waveVersion}
                      onPointerDown={onClipPointerDown}
                      onContextMenu={clipMenu}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="tl-row tl-add-row">
            <div className="track-header" style={{ width: HEADER_W }} />
            <div className={`track-lane ${dropTarget === '__new__' ? 'drop-target' : ''}`} style={{ width: contentW }} {...laneDragProps(null, '__new__')}>
              {t('tl.newTrack')}
            </div>
          </div>

          {project.markers.map((m) => (
            <div key={m.id} className="marker-line" style={{ left: HEADER_W + m.time * pps, background: m.color }} />
          ))}
          {snapLine !== null && <div className="snap-line" style={{ left: HEADER_W + snapLine * pps }} />}
          {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
          <PlayheadLine pps={pps} scrollRef={scrollRef} />
          {!hasClips && (
            <div className="tl-empty">
              <Icon name="import" size={18} />
              {t('tl.dropHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Keyboard shortcuts and menu commands.
import { api } from './api';
import { SITE_URL, SOURCE_URL } from '../shared/brand';
import { projectDuration } from './core/project';
import { player } from './engine/player';
import { setLang, t, useLang } from './i18n';
import {
  addMarker,
  copySelection,
  detachAudio,
  splitAllTracks,
  toggleMuteSelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  clearMarks,
  editPoints,
  freezeFrame,
  setMark,
  newProject,
  nudgeSelection,
  reverseClip,
  openDialog,
  openProjectFile,
  paste,
  saveProject,
  selectAll,
  splitAtPlayhead,
  zoomBy,
  zoomToFit,
} from './store/actions';
import { redo, select, toast, undo, useEditor } from './store/editor';
import { importViaDialog } from './store/media';
import { setPrefs, usePrefs } from './store/prefs';
import { commandFor, comboFromEvent, shortcutLabel } from './keymap';
import { exportSrt } from './ai/tasks';
import { importSubtitles } from './store/tools';
import type { MenuEntry } from './ui/ContextMenu';

export async function saveSnapshot(): Promise<void> {
  player.pause();
  const blob = await player.snapshot();
  if (!blob) return;
  const s = useEditor.getState();
  const base = (s.project.name || 'frame').replace(/[\\/:*?"<>|]/g, '_');
  const path = await api.saveFileDialog(`${base}-${Math.round(s.playhead * 1000)}.png`, [{ name: 'PNG', extensions: ['png'] }]);
  if (!path) return;
  await api.writeBinary(path, new Uint8Array(await blob.arrayBuffer()));
  toast(t('toast.snapshotSaved'), 'success');
}

function jumpEditPoint(dir: 1 | -1): void {
  const s = useEditor.getState();
  const pts = editPoints();
  const eps = 0.5 / s.project.settings.fps;
  const target = dir > 0 ? pts.find((p) => p > s.playhead + eps) : [...pts].reverse().find((p) => p < s.playhead - eps);
  if (target !== undefined) {
    player.pause();
    player.seek(target);
  }
}

function timelineWidth(): number {
  return document.querySelector('.tl-scroll')?.clientWidth ?? 1000;
}

/** What each keyboard command does (bindings live in keymap.ts). */
const RUN: Record<string, () => void> = {
  newProject: () => void newProject(),
  openProject: () => void openProjectFile(),
  save: () => void saveProject(),
  saveAs: () => void saveProject(true),
  import: () => void importViaDialog(),
  export: () => openDialog('export'),
  snapshot: () => void saveSnapshot(),
  projectSettings: () => openDialog('settings'),
  prefs: () => openDialog('prefs'),
  undo,
  redo,
  cut: cutSelection,
  copy: copySelection,
  paste: () => paste(),
  pasteAttrs: () => openDialog('paste-attrs'),
  duplicate: duplicateSelection,
  selectAll,
  delete: () => deleteSelection(false),
  rippleDelete: () => deleteSelection(true),
  split: splitAtPlayhead,
  splitAll: () => splitAllTracks(),
  muteClips: toggleMuteSelection,
  detachAudio: () => {
    for (const id of useEditor.getState().selection) detachAudio(id);
  },
  escape: () => {
    const s = useEditor.getState();
    if (s.tool !== 'select') useEditor.setState({ tool: 'select' });
    else select([]);
  },
  playPause: () => player.toggle(),
  play: () => player.play(),
  loop: toggleLoop,
  frameBack: () => player.stepFrames(-1),
  frameForward: () => player.stepFrames(1),
  secondBack: () => seekBy(-1),
  secondForward: () => seekBy(1),
  prevEdit: () => jumpEditPoint(-1),
  nextEdit: () => jumpEditPoint(1),
  goStart: () => seekTo(0),
  goEnd: () => seekTo(projectDuration(useEditor.getState().project)),
  nudgeLeft: () => nudgeSelection(-1),
  nudgeRight: () => nudgeSelection(1),
  nudgeLeft10: () => nudgeSelection(-10),
  nudgeRight10: () => nudgeSelection(10),
  marker: () => addMarker(),
  markIn: () => setMark('in'),
  markOut: () => setMark('out'),
  clearMarks,
  snapping: () => useEditor.setState((s) => ({ snapping: !s.snapping })),
  zoomIn: () => zoomBy(1.4),
  zoomOut: () => zoomBy(1 / 1.4),
  zoomFit: () => zoomToFit(timelineWidth()),
  freeze: () => void freezeFrame(),
  reverse: () => {
    const sel = useEditor.getState().selection;
    if (sel.length === 1) void reverseClip(sel[0]);
  },
  toggleScopes: () => setPrefs({ showScopes: !usePrefs.getState().showScopes }),
  toolSelect: () => useEditor.setState({ tool: 'select' }),
  toolForward: () => useEditor.setState({ tool: 'forward' }),
  toolRipple: () => useEditor.setState({ tool: 'ripple' }),
  toolRoll: () => useEditor.setState({ tool: 'roll' }),
  toolSlip: () => useEditor.setState({ tool: 'slip' }),
  toolSlide: () => useEditor.setState({ tool: 'slide' }),
  toolRazor: () => useEditor.setState({ tool: 'razor' }),
};

export function runCommand(id: string): void {
  RUN[id]?.();
}

function seekTo(t: number): void {
  player.pause();
  player.seek(t);
}

function seekBy(dt: number): void {
  seekTo(useEditor.getState().playhead + dt);
}

export function toggleLoop(): void {
  const loop = !usePrefs.getState().loopPlayback;
  setPrefs({ loopPlayback: loop });
  toast(t(loop ? 'toast.loopOn' : 'toast.loopOff'));
}

export function handleKeyDown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (target?.closest('input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable=true]')) return;
  if (useEditor.getState().dialog) return;
  const combo = comboFromEvent(e);
  const id = combo ? commandFor(combo) : null;
  if (!id || !RUN[id]) return;
  e.preventDefault();
  RUN[id]();
}

export interface MenuDef {
  id: string;
  label: string;
  items: () => MenuEntry[];
}

/** Menu label of a command's first binding. */
const sc = (id: string): string | undefined => shortcutLabel(id) || undefined;

export function menus(): MenuDef[] {
  const s = useEditor.getState();
  const hasSel = s.selection.length > 0;
  return [
    {
      id: 'file',
      label: t('menu.file'),
      items: () => {
        const recent = usePrefs.getState().recent.slice(0, 6);
        const recentItems: MenuEntry[] = recent.length
          ? [
              { separator: true },
              { label: t('menu.recent'), onClick: () => undefined, disabled: true },
              ...recent.map((r) => ({ label: `   ${r.name}`, shortcut: r.path.split(/[\\/]/).pop(), onClick: () => void openProjectFile(r.path) })),
            ]
          : [];
        return [
          { label: t('menu.new'), shortcut: sc('newProject'), onClick: newProject },
          { label: t('menu.open'), shortcut: sc('openProject'), onClick: () => void openProjectFile() },
          { label: t('menu.save'), shortcut: sc('save'), onClick: () => void saveProject() },
          { label: t('menu.saveAs'), shortcut: sc('saveAs'), onClick: () => void saveProject(true) },
          ...recentItems,
          { separator: true },
          { label: t('menu.import'), shortcut: sc('import'), onClick: () => void importViaDialog() },
          { label: `${t('subs.import')}…`, onClick: () => void importSubtitles() },
          { label: `${t('credits.title')}…`, onClick: () => openDialog('credits') },
          { label: t('menu.export'), shortcut: sc('export'), onClick: () => openDialog('export') },
          { label: t('menu.snapshot'), shortcut: sc('snapshot'), onClick: () => void saveSnapshot() },
          { separator: true },
          { label: t('menu.projectSettings'), shortcut: sc('projectSettings'), onClick: () => openDialog('settings') },
          { label: t('menu.prefs'), shortcut: sc('prefs'), onClick: () => openDialog('prefs') },
        ];
      },
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: () => [
        { label: t('menu.undo'), shortcut: sc('undo'), onClick: undo, disabled: s.past.length === 0 },
        { label: t('menu.redo'), shortcut: sc('redo'), onClick: redo, disabled: s.future.length === 0 },
        { separator: true },
        { label: t('menu.cut'), shortcut: sc('cut'), onClick: cutSelection, disabled: !hasSel },
        { label: t('menu.copy'), shortcut: sc('copy'), onClick: copySelection, disabled: !hasSel },
        { label: t('menu.paste'), shortcut: sc('paste'), onClick: () => paste(), disabled: !s.clipboard },
        { label: t('menu.duplicate'), shortcut: sc('duplicate'), onClick: duplicateSelection, disabled: !hasSel },
        { label: t('menu.delete'), shortcut: sc('delete'), onClick: () => deleteSelection(false), disabled: !hasSel },
        { label: t('menu.rippleDelete'), shortcut: sc('rippleDelete'), onClick: () => deleteSelection(true), disabled: !hasSel },
        { separator: true },
        { label: t('menu.split'), shortcut: sc('split'), onClick: splitAtPlayhead },
        { label: t('cmd.splitAll'), shortcut: sc('splitAll'), onClick: () => splitAllTracks() },
        { label: t('menu.selectAll'), shortcut: sc('selectAll'), onClick: selectAll },
        { label: t('menu.addMarker'), shortcut: sc('marker'), onClick: () => addMarker() },
        { label: t('menu.markIn'), shortcut: sc('markIn'), onClick: () => setMark('in') },
        { label: t('menu.markOut'), shortcut: sc('markOut'), onClick: () => setMark('out') },
        { label: t('menu.clearMarks'), shortcut: sc('clearMarks'), onClick: clearMarks },
        { separator: true },
        { label: t('menu.pasteAttrs'), shortcut: sc('pasteAttrs'), onClick: () => openDialog('paste-attrs'), disabled: !s.clipboard || !hasSel },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: () => [
        { label: t('menu.zoomIn'), shortcut: sc('zoomIn'), onClick: () => zoomBy(1.4) },
        { label: t('menu.zoomOut'), shortcut: sc('zoomOut'), onClick: () => zoomBy(1 / 1.4) },
        { label: t('menu.zoomFit'), shortcut: sc('zoomFit'), onClick: () => zoomToFit(timelineWidth()) },
        { label: t('cmd.loop'), shortcut: sc('loop'), checked: usePrefs.getState().loopPlayback, onClick: toggleLoop },
        { label: t('cmd.toggleScopes'), shortcut: sc('toggleScopes'), checked: usePrefs.getState().showScopes, onClick: () => runCommand('toggleScopes') },
        { separator: true },
        { label: 'Українська', checked: useLang.getState().lang === 'uk', onClick: () => setLang('uk') },
        { label: 'Русский', checked: useLang.getState().lang === 'ru', onClick: () => setLang('ru') },
        { label: 'English', checked: useLang.getState().lang === 'en', onClick: () => setLang('en') },
        { separator: true },
        { label: t('menu.devtools'), shortcut: 'F12', onClick: () => api.toggleDevTools() },
      ],
    },
    {
      id: 'ai',
      label: t('menu.ai'),
      items: () => [
        { label: t('ai.subsTitle'), onClick: () => openDialog('ai-subs') },
        { label: t('ai.bgTitle'), onClick: () => openDialog('ai-bg'), disabled: !hasSel },
        { separator: true },
        {
          label: t('ai.exportSrt'),
          onClick: () => void exportSrt().then((ok) => !ok && toast(t('ai.noSubs'))),
        },
      ],
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: () => [
        { label: t('menu.shortcuts'), onClick: () => openDialog('shortcuts') },
        { separator: true },
        { label: t('menu.website'), onClick: () => window.open(SITE_URL) },
        { label: t('menu.support'), onClick: () => window.open(`${SITE_URL}#support`) },
        { label: t('menu.reportBug'), onClick: () => window.open(`${SOURCE_URL}/issues`) },
        { separator: true },
        { label: t('menu.about'), onClick: () => openDialog('about') },
      ],
    },
  ];
}

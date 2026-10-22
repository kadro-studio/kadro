// Keyboard shortcuts and menu commands.
import { api } from './api';
import { projectDuration } from './core/project';
import { player } from './engine/player';
import { setLang, t, useLang } from './i18n';
import {
  addMarker,
  copySelection,
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
import { usePrefs } from './store/prefs';
import { exportSrt } from './ai/tasks';
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

export function handleKeyDown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (target?.closest('input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable=true]')) return;
  const s = useEditor.getState();
  if (s.dialog) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const code = e.code;
  let handled = true;

  if (ctrl) {
    switch (code) {
      case 'KeyZ':
        if (shift) redo();
        else undo();
        break;
      case 'KeyY':
        redo();
        break;
      case 'KeyC':
        copySelection();
        break;
      case 'KeyX':
        cutSelection();
        break;
      case 'KeyV':
        if (e.altKey) openDialog('paste-attrs');
        else paste();
        break;
      case 'KeyD':
        duplicateSelection();
        break;
      case 'KeyA':
        selectAll();
        break;
      case 'KeyK':
        splitAtPlayhead();
        break;
      case 'KeyS':
        void saveProject(shift);
        break;
      case 'KeyO':
        void openProjectFile();
        break;
      case 'KeyN':
        newProject();
        break;
      case 'KeyI':
        void importViaDialog();
        break;
      case 'KeyE':
        openDialog('export');
        break;
      case 'Comma':
        openDialog('prefs');
        break;
      case 'KeyR':
        if (s.selection.length === 1) void reverseClip(s.selection[0]);
        break;
      case 'Equal':
      case 'NumpadAdd':
        zoomBy(1.4);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        zoomBy(1 / 1.4);
        break;
      case 'Digit0':
        zoomToFit(timelineWidth());
        break;
      default:
        handled = false;
    }
  } else {
    switch (code) {
      case 'Space':
      case 'KeyK':
        player.toggle();
        break;
      case 'KeyL':
        player.play();
        break;
      case 'ArrowLeft':
        if (e.altKey) nudgeSelection(shift ? -10 : -1);
        else if (shift) {
          player.pause();
          player.seek(s.playhead - 1);
        } else player.stepFrames(-1);
        break;
      case 'ArrowRight':
        if (e.altKey) nudgeSelection(shift ? 10 : 1);
        else if (shift) {
          player.pause();
          player.seek(s.playhead + 1);
        } else player.stepFrames(1);
        break;
      case 'ArrowUp':
        jumpEditPoint(-1);
        break;
      case 'ArrowDown':
        jumpEditPoint(1);
        break;
      case 'Home':
        player.pause();
        player.seek(0);
        break;
      case 'End':
        player.pause();
        player.seek(projectDuration(s.project));
        break;
      case 'KeyS':
        splitAtPlayhead();
        break;
      case 'Delete':
      case 'Backspace':
        deleteSelection(shift);
        break;
      case 'KeyV':
        useEditor.setState({ tool: 'select' });
        break;
      case 'KeyC':
        useEditor.setState({ tool: 'razor' });
        break;
      case 'KeyA':
        useEditor.setState({ tool: 'forward' });
        break;
      case 'KeyB':
        useEditor.setState({ tool: 'ripple' });
        break;
      case 'KeyR':
        useEditor.setState({ tool: 'roll' });
        break;
      case 'KeyY':
        useEditor.setState({ tool: 'slip' });
        break;
      case 'KeyU':
        useEditor.setState({ tool: 'slide' });
        break;
      case 'KeyF':
        if (shift) void freezeFrame();
        else handled = false;
        break;
      case 'KeyN':
        useEditor.setState({ snapping: !s.snapping });
        break;
      case 'KeyM':
        addMarker();
        break;
      case 'KeyI':
        setMark('in');
        break;
      case 'KeyO':
        setMark('out');
        break;
      case 'KeyX':
        if (e.altKey) clearMarks();
        else handled = false;
        break;
      case 'Equal':
      case 'NumpadAdd':
        zoomBy(1.4);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        zoomBy(1 / 1.4);
        break;
      case 'Backslash':
        zoomToFit(timelineWidth());
        break;
      case 'Escape':
        if (s.tool !== 'select') useEditor.setState({ tool: 'select' });
        else select([]);
        break;
      default:
        handled = false;
    }
  }
  if (handled) e.preventDefault();
}

export interface MenuDef {
  id: string;
  label: string;
  items: () => MenuEntry[];
}

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
          { label: t('menu.new'), shortcut: 'Ctrl+N', onClick: newProject },
          { label: t('menu.open'), shortcut: 'Ctrl+O', onClick: () => void openProjectFile() },
          { label: t('menu.save'), shortcut: 'Ctrl+S', onClick: () => void saveProject() },
          { label: t('menu.saveAs'), shortcut: 'Ctrl+Shift+S', onClick: () => void saveProject(true) },
          ...recentItems,
          { separator: true },
          { label: t('menu.import'), shortcut: 'Ctrl+I', onClick: () => void importViaDialog() },
          { label: t('menu.export'), shortcut: 'Ctrl+E', onClick: () => openDialog('export') },
          { label: t('menu.snapshot'), onClick: () => void saveSnapshot() },
          { separator: true },
          { label: t('menu.projectSettings'), onClick: () => openDialog('settings') },
          { label: t('menu.prefs'), shortcut: 'Ctrl+,', onClick: () => openDialog('prefs') },
        ];
      },
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: () => [
        { label: t('menu.undo'), shortcut: 'Ctrl+Z', onClick: undo, disabled: s.past.length === 0 },
        { label: t('menu.redo'), shortcut: 'Ctrl+Shift+Z', onClick: redo, disabled: s.future.length === 0 },
        { separator: true },
        { label: t('menu.cut'), shortcut: 'Ctrl+X', onClick: cutSelection, disabled: !hasSel },
        { label: t('menu.copy'), shortcut: 'Ctrl+C', onClick: copySelection, disabled: !hasSel },
        { label: t('menu.paste'), shortcut: 'Ctrl+V', onClick: () => paste(), disabled: !s.clipboard },
        { label: t('menu.duplicate'), shortcut: 'Ctrl+D', onClick: duplicateSelection, disabled: !hasSel },
        { label: t('menu.delete'), shortcut: 'Del', onClick: () => deleteSelection(false), disabled: !hasSel },
        { label: t('menu.rippleDelete'), shortcut: 'Shift+Del', onClick: () => deleteSelection(true), disabled: !hasSel },
        { separator: true },
        { label: t('menu.split'), shortcut: 'S', onClick: splitAtPlayhead },
        { label: t('menu.selectAll'), shortcut: 'Ctrl+A', onClick: selectAll },
        { label: t('menu.addMarker'), shortcut: 'M', onClick: () => addMarker() },
        { label: t('menu.markIn'), shortcut: 'I', onClick: () => setMark('in') },
        { label: t('menu.markOut'), shortcut: 'O', onClick: () => setMark('out') },
        { label: t('menu.clearMarks'), shortcut: 'Alt+X', onClick: clearMarks },
        { separator: true },
        { label: t('menu.pasteAttrs'), shortcut: 'Ctrl+Alt+V', onClick: () => openDialog('paste-attrs'), disabled: !s.clipboard || !hasSel },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: () => [
        { label: t('menu.zoomIn'), shortcut: '+', onClick: () => zoomBy(1.4) },
        { label: t('menu.zoomOut'), shortcut: '−', onClick: () => zoomBy(1 / 1.4) },
        { label: t('menu.zoomFit'), shortcut: '\\', onClick: () => zoomToFit(timelineWidth()) },
        { separator: true },
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
        { label: t('menu.about'), onClick: () => openDialog('about') },
      ],
    },
  ];
}

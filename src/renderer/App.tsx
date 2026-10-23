import { useEffect, useState } from 'react';
import { handleKeyDown } from './commands';
import { Dialogs } from './components/Dialogs';
import { Inspector } from './components/Inspector';
import { LeftPanel } from './components/LeftPanel';
import { Preview } from './components/Preview';
import { TopBar } from './components/TopBar';
import { Timeline } from './components/timeline/Timeline';
import { api } from './api';
import { APP_NAME } from '../shared/brand';
import { useT, useLang } from './i18n';
import { handleCloseRequest, openProjectFile, setLeftTab, syncDirtyFlag } from './store/actions';
import { PromptHost } from './components/PromptHost';
import { TooltipHost } from './ui/Tooltip';
import { isDirty, toast, useEditor } from './store/editor';
import { importFiles, startProxyProgressListener } from './store/media';
import { pendingRecovery, startAutosave } from './store/autosave';
import { reloadMods } from './store/mods';
import { handleWorkshopLink, initWorkshop, refreshAccount } from './store/workshop';
import { ContextMenuHost } from './ui/ContextMenu';

interface Layout {
  left: number;
  right: number;
  timeline: number;
}

function loadLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem('vr.layout') ?? '');
    if (raw && raw.left && raw.right && raw.timeline) return raw as Layout;
  } catch {
    // default layout
  }
  return { left: 390, right: 330, timeline: Math.round(window.innerHeight * 0.38) };
}

function Splitter({ dir, onDrag }: { dir: 'left' | 'right' | 'h'; onDrag: (dx: number, dy: number) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`${dir === 'h' ? 'split-h' : `split-v ${dir}`} ${dragging ? 'dragging' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        setDragging(true);
        let x = e.clientX;
        let y = e.clientY;
        const move = (ev: PointerEvent) => {
          onDrag(ev.clientX - x, ev.clientY - y);
          x = ev.clientX;
          y = ev.clientY;
        };
        const up = () => {
          setDragging(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`}>
          {x.text}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const t = useT();
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [fileDrag, setFileDrag] = useState(false);
  const name = useEditor((s) => s.project.name);
  const filePath = useEditor((s) => s.filePath);
  const dirty = useEditor((s) => isDirty(s));
  const lang = useLang((s) => s.lang);

  useEffect(() => {
    try {
      localStorage.setItem('vr.layout', JSON.stringify(layout));
    } catch {
      // storage unavailable
    }
  }, [layout]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    const stop = startProxyProgressListener();
    const stopAutosave = startAutosave();
    void reloadMods();
    void pendingRecovery().then((data) => data && useEditor.setState({ recovery: data }));
    // Project files open; workshop files (.kadroitem, .vrmod, .cube) install.
    const openFile = (file: string) => void (/\.vrproj$/i.test(file) ? openProjectFile(file) : importFiles([file]));
    void api.takeOpenFile().then((file) => file && openFile(file));
    const stopOpen = api.onOpenFile(openFile);
    const stopClose = api.onCloseRequest(() => void handleCloseRequest());
    void initWorkshop();
    const stopAuth = api.onWorkshopAuth((ok) => {
      toast(ok ? t('ws.signedIn') : t('ws.signInFailed'), ok ? 'success' : 'error');
      void refreshAccount();
    });
    const stopLinks = api.onDeepLink((url) => {
      if (handleWorkshopLink(url)) setLeftTab('workshop');
    });
    void api.takeLink();
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error(e.reason);
      toast(t('toast.unexpected', { err: e.reason instanceof Error ? e.reason.message : String(e.reason) }), 'error');
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('unhandledrejection', onRejection);
      stop();
      stopAutosave();
      stopOpen();
      stopClose();
      stopAuth();
      stopLinks();
    };
  }, [t]);

  useEffect(() => {
    const file = filePath ? filePath.split(/[\\/]/).pop() : name;
    api.setTitle(`${dirty ? '● ' : ''}${file} — ${APP_NAME}`);
    syncDirtyFlag();
  }, [name, filePath, dirty, lang]);

  // Files dropped anywhere outside the timeline go to the media bin.
  useEffect(() => {
    let depth = 0;
    const isFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth++;
      setFileDrag(true);
    };
    const leave = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setFileDrag(false);
    };
    const over = (e: DragEvent) => {
      if (isFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setFileDrag(false);
      if (!isFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      const paths = [...(e.dataTransfer?.files ?? [])].map((f) => api.getPathForFile(f)).filter(Boolean);
      if (paths.length) void importFiles(paths);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const clampW = (v: number) => Math.max(220, Math.min(620, v));
  return (
    <div className="app" onContextMenu={(e) => e.preventDefault()}>
      <TopBar />
      <div
        className="workspace"
        style={
          {
            '--left-w': `${layout.left}px`,
            '--right-w': `${layout.right}px`,
            '--tl-h': `${layout.timeline}px`,
          } as React.CSSProperties
        }
      >
        <div className="area-left panel">
          <LeftPanel />
        </div>
        <Splitter dir="left" onDrag={(dx) => setLayout((l) => ({ ...l, left: clampW(l.left + dx) }))} />
        <div className="area-center panel">
          <Preview />
        </div>
        <Splitter dir="right" onDrag={(dx) => setLayout((l) => ({ ...l, right: clampW(l.right - dx) }))} />
        <div className="area-right panel">
          <Inspector />
        </div>
        <Splitter
          dir="h"
          onDrag={(_dx, dy) => setLayout((l) => ({ ...l, timeline: Math.max(160, Math.min(window.innerHeight - 260, l.timeline - dy)) }))}
        />
        <div className="area-timeline panel">
          <Timeline />
        </div>
      </div>
      <Dialogs />
      <ContextMenuHost />
      <PromptHost />
      <TooltipHost />
      <Toasts />
      {fileDrag && <div className="drop-overlay">{t('media.dropHint')}</div>}
    </div>
  );
}

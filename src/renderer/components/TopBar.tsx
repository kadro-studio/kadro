import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { menus } from '../commands';
import { useT } from '../i18n';
import { openDialog } from '../store/actions';
import { isDirty, useEditor } from '../store/editor';
import { setPrefs, usePrefs } from '../store/prefs';
import { MenuItems } from '../ui/ContextMenu';
import { Icon } from '../ui/Icon';
import { APP_NAME } from '../../shared/brand';

export function TopBar() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const filePath = useEditor((s) => s.filePath);
  const name = useEditor((s) => s.project.name);
  const dirty = useEditor((s) => isDirty(s));
  const simple = usePrefs((p) => p.simpleMode);
  // Re-render menus when relevant state changes.
  useEditor(useShallow((s) => [s.selection.length, s.past.length, s.future.length, s.clipboard]));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : null;
  // The bar doubles as the window title bar: empty areas drag the window,
  // and the right padding keeps clear of the native caption buttons.
  return (
    <div className="topbar">
      <div className="brand">
        <img className="brand-logo" src="./logo.png" alt="" draggable={false} />
        <span className="brand-name">{APP_NAME}</span>
      </div>
      <div className="menus" ref={rootRef}>
        {menus().map((m) => (
          <div className="menu-root" key={m.id}>
            <button
              className={`menu-button ${open === m.id ? 'open' : ''}`}
              onClick={() => setOpen(open === m.id ? null : m.id)}
              onPointerEnter={() => open && open !== m.id && setOpen(m.id)}
            >
              {m.label}
            </button>
            {open === m.id && (
              <div className="menu-dropdown">
                <MenuItems items={m.items()} onDone={() => setOpen(null)} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="top-title">
        <div className="title-pill">
          <span className="title-name">{name}</span>
          {fileName && <span className="title-file">{fileName}</span>}
          {dirty && <span className="dirty" title={t('top.unsaved')} />}
        </div>
      </div>
      <div className="top-actions">
        <button className={`simple-toggle ${simple ? 'on' : ''}`} title={t('simple.tip')} onClick={() => setPrefs({ simpleMode: !simple })}>
          <Icon name="sparkles" size={14} />
          {t('simple.label')}
        </button>
        <button className="icon-btn" title={t('menu.projectSettings')} onClick={() => openDialog('settings')}>
          <Icon name="settings" />
        </button>
        <button className="btn primary export-btn" onClick={() => openDialog('export')}>
          <Icon name="export" size={16} />
          {t('top.export')}
        </button>
      </div>
    </div>
  );
}

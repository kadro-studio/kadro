import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Icon } from './Icon';

export type MenuEntry =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      shortcut?: string;
      onClick: () => void;
      disabled?: boolean;
      checked?: boolean;
    };

interface MenuState {
  menu: { x: number; y: number; items: MenuEntry[] } | null;
}

const useMenu = create<MenuState>(() => ({ menu: null }));

export function openContextMenu(x: number, y: number, items: MenuEntry[]): void {
  useMenu.setState({ menu: { x, y, items } });
}

export function closeContextMenu(): void {
  useMenu.setState({ menu: null });
}

export function MenuItems({ items, onDone }: { items: MenuEntry[]; onDone: () => void }) {
  const showChecks = items.some((i) => !i.separator && i.checked !== undefined);
  return (
    <>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            className="menu-item"
            disabled={item.disabled}
            onClick={() => {
              onDone();
              item.onClick();
            }}
          >
            {showChecks && <span className="check">{item.checked ? <Icon name="check" size={14} /> : null}</span>}
            <span>{item.label}</span>
            {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
          </button>
        ),
      )}
    </>
  );
}

export function ContextMenuHost() {
  const menu = useMenu((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      closeContextMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeContextMenu();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', closeContextMenu);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', closeContextMenu);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuItems items={menu.items} onDone={closeContextMenu} />
    </div>
  );
}

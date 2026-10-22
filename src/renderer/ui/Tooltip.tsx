import { useEffect, useState } from 'react';

interface Tip {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

const DELAY = 450;

/**
 * Replaces the browser's native title tooltips with styled ones: on hover the
 * element's title moves to data-tip (so the native one never shows) and is
 * drawn by this host instead.
 */
export function TooltipHost() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer = 0;
    let target: HTMLElement | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      target = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip]') as HTMLElement | null;
      if (el === target) return;
      hide();
      if (!el) return;
      const title = el.getAttribute('title');
      if (title !== null) {
        el.dataset.tip = title;
        el.removeAttribute('title');
      }
      const text = el.dataset.tip ?? '';
      if (!text.trim()) return;
      target = el;
      timer = window.setTimeout(() => {
        if (target !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 60;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, DELAY);
    };
    window.addEventListener('pointerover', over, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      window.removeEventListener('pointerover', over, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip) return null;
  const left = Math.min(window.innerWidth - 12, Math.max(12, tip.x));
  return (
    <div className={`tooltip ${tip.below ? 'below' : ''}`} style={{ left, top: tip.y }}>
      {tip.text}
    </div>
  );
}

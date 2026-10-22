import { useEffect, useMemo, useRef, useState } from 'react';
import { BUNDLED_FONTS, fontLabel, listSystemFonts, type FontCategory } from '../engine/fonts';
import { useT, type I18nKey } from '../i18n';
import { Icon } from './Icon';

const ORDER: FontCategory[] = ['sans', 'serif', 'display', 'script', 'mono', 'system'];

/** Font chooser: bundled title fonts by category, then the system's fonts. */
export function FontPicker({ label, value, onChange }: { label: string; value: string; onChange: (family: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [system, setSystem] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void listSystemFonts().then(setSystem);
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bundled = new Set(BUNDLED_FONTS.map((f) => f.label.toLowerCase()));
    const all = [
      ...BUNDLED_FONTS.map((f) => ({ family: f.family, label: f.label, category: f.category })),
      ...system.filter((s) => !bundled.has(s.toLowerCase())).map((s) => ({ family: s, label: s, category: 'system' as FontCategory })),
    ].filter((f) => !q || f.label.toLowerCase().includes(q));
    return ORDER.map((c) => ({ category: c, fonts: all.filter((f) => f.category === c) })).filter((g) => g.fonts.length > 0);
  }, [query, system]);

  return (
    <div className="field font-picker" ref={root}>
      <label className="field-label">{label}</label>
      <button className="font-trigger" onClick={() => setOpen(!open)} style={{ fontFamily: `"${value}"` }}>
        <span>{fontLabel(value)}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="font-menu">
          <input className="text-input font-search" autoFocus placeholder={t('font.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="font-list">
            {groups.map((g) => (
              <div key={g.category}>
                <div className="font-group">{t(`font.cat.${g.category}` as I18nKey)}</div>
                {g.fonts.map((f) => (
                  <button
                    key={f.family}
                    className={`font-item ${f.family === value ? 'active' : ''}`}
                    style={{ fontFamily: `"${f.family}"` }}
                    onClick={() => {
                      onChange(f.family);
                      setOpen(false);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { BUNDLED_FONTS, fontLabel, listSystemFonts, type FontCategory } from '../engine/fonts';
import { useT, type I18nKey } from '../i18n';
import { addUserFonts, removeUserFont, useUserFonts } from '../store/userFonts';
import { Icon } from './Icon';

const ORDER: FontCategory[] = ['custom', 'sans', 'serif', 'display', 'script', 'mono', 'system'];

/** Font chooser: the user's own fonts, bundled title fonts by category, then the system's fonts. */
export function FontPicker({ label, value, onChange }: { label: string; value: string; onChange: (family: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [system, setSystem] = useState<string[]>([]);
  const custom = useUserFonts((s) => s.fonts);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void listSystemFonts().then(setSystem);
    const onDown = (e: PointerEvent) => {
      // Clicks in an in-app dialog (e.g. confirming a removal) keep the list open.
      if (!root.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.prompt-backdrop')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.prompt-backdrop')) {
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
    const taken = new Set([...custom.map((f) => f.family.toLowerCase()), ...BUNDLED_FONTS.map((f) => f.label.toLowerCase())]);
    const all = [
      ...custom.map((f) => ({ family: f.family, label: f.family, category: 'custom' as FontCategory })),
      ...BUNDLED_FONTS.map((f) => ({ family: f.family, label: f.label, category: f.category })),
      ...system.filter((s) => !taken.has(s.toLowerCase())).map((s) => ({ family: s, label: s, category: 'system' as FontCategory })),
    ].filter((f) => !q || f.label.toLowerCase().includes(q));
    return ORDER.map((c) => ({ category: c, fonts: all.filter((f) => f.category === c) })).filter((g) => g.fonts.length > 0);
  }, [query, system, custom]);

  return (
    <div className="field font-picker" ref={root}>
      <label className="field-label">{label}</label>
      <button className="font-trigger" onClick={() => setOpen(!open)} style={{ fontFamily: `"${value}"` }}>
        <span>{fontLabel(value)}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="font-menu">
          <div className="font-top">
            <input className="text-input font-search" autoFocus placeholder={t('font.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn small" title={t('fonts.add')} onClick={() => void addUserFonts()}>
              <Icon name="plus" size={14} />
            </button>
            <button className="btn small" title={t('fonts.folder')} onClick={() => api.openFontsFolder()}>
              <Icon name="folder" size={14} />
            </button>
          </div>
          <div className="font-list">
            {groups.map((g) => (
              <div key={g.category}>
                <div className="font-group">{t(`font.cat.${g.category}` as I18nKey)}</div>
                {g.fonts.map((f) => (
                  <div key={`${g.category}:${f.family}`} className={`font-item ${f.family === value ? 'active' : ''}`}>
                    <button
                      className="font-item-name"
                      style={{ fontFamily: `"${f.family}"` }}
                      onClick={() => {
                        onChange(f.family);
                        setOpen(false);
                      }}
                    >
                      {f.label}
                    </button>
                    {g.category === 'custom' && (
                      <button className="font-item-remove" title={t('fonts.remove')} onClick={() => void removeUserFont(f.family)}>
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

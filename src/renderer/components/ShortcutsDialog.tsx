// Keyboard shortcuts: every command can be bound to any key combination.
import { useEffect, useMemo, useState } from 'react';
import { useT, type I18nKey } from '../i18n';
import {
  assignCombo,
  bindingsOf,
  COMMAND_GROUPS,
  COMMANDS,
  comboFromEvent,
  comboLabel,
  commandLabel,
  isCustomized,
  isReservedCombo,
  removeCombo,
  resetAllCommands,
  resetCommand,
} from '../keymap';
import { usePrefs } from '../store/prefs';
import { toast } from '../store/editor';
import { IconButton } from '../ui/controls';
import { Modal } from './Modal';

const MOUSE: { key: I18nKey; keys: string[] }[] = [
  { key: 'sc.marquee', keys: ['Drag'] },
  { key: 'sc.insertDrop', keys: ['Ctrl'] },
  { key: 'sc.noSnap', keys: ['Alt'] },
  { key: 'sc.razorAll', keys: ['Shift+Click'] },
  { key: 'sc.zoomWheel', keys: ['Ctrl+Wheel'] },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const keymap = usePrefs((p) => p.keymap);
  const [query, setQuery] = useState('');
  const [capture, setCapture] = useState<string | null>(null);

  // While capturing, the next key press becomes the binding; nothing else sees it.
  useEffect(() => {
    if (!capture) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setCapture(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;
      setCapture(null);
      if (isReservedCombo(combo)) {
        toast(t('shortcuts.reserved', { key: comboLabel(combo) }), 'error');
        return;
      }
      const taken = assignCombo(capture, combo);
      if (taken) toast(t('shortcuts.taken', { key: comboLabel(combo), name: commandLabel(taken) }));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capture, t]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMMAND_GROUPS.map((g) => ({
      group: g,
      commands: COMMANDS.filter((c) => {
        if (c.group !== g) return false;
        if (!q) return true;
        const keys = bindingsOf(c.id, keymap).map(comboLabel).join(' ').toLowerCase();
        return t(c.label).toLowerCase().includes(q) || keys.includes(q);
      }),
    })).filter((g) => g.commands.length > 0);
  }, [query, keymap, t]);

  const customized = Object.keys(keymap).length > 0;

  return (
    <Modal
      title={t('shortcuts.title')}
      onClose={capture ? undefined : onClose}
      width={720}
      footer={
        <>
          <button className="btn" disabled={!customized} onClick={resetAllCommands}>
            {t('shortcuts.resetAll')}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn primary" onClick={onClose}>
            {t('common.ok')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('shortcuts.hint')}
      </p>
      <input className="text-input" placeholder={t('shortcuts.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="keymap">
        {groups.map(({ group, commands }) => (
          <section key={group}>
            <div className="keymap-group">{t(`cmd.group.${group}` as I18nKey)}</div>
            {commands.map((c) => {
              const keys = bindingsOf(c.id, keymap);
              return (
                <div key={c.id} className={`keymap-row ${capture === c.id ? 'capturing' : ''}`}>
                  <span className="keymap-label">{t(c.label)}</span>
                  <span className="keymap-keys">
                    {keys.length === 0 && capture !== c.id && <span className="keymap-none">{t('shortcuts.none')}</span>}
                    {keys.map((k) => (
                      <kbd key={k} className="keymap-key">
                        {comboLabel(k)}
                        <button title={t('shortcuts.remove')} onClick={() => removeCombo(c.id, k)}>
                          ×
                        </button>
                      </kbd>
                    ))}
                    {capture === c.id && <span className="keymap-press">{t('shortcuts.press')}</span>}
                  </span>
                  <span className="keymap-actions">
                    <IconButton icon="plus" title={t('shortcuts.add')} active={capture === c.id} onClick={() => setCapture(capture === c.id ? null : c.id)} />
                    {isCustomized(c.id) && <IconButton icon="undo" title={t('shortcuts.reset')} onClick={() => resetCommand(c.id)} />}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
        {!query && (
          <section>
            <div className="keymap-group">{t('shortcuts.mouse')}</div>
            {MOUSE.map((m) => (
              <div key={m.key} className="keymap-row">
                <span className="keymap-label">{t(m.key)}</span>
                <span className="keymap-keys">
                  {m.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
                <span className="keymap-actions" />
              </div>
            ))}
          </section>
        )}
      </div>
    </Modal>
  );
}

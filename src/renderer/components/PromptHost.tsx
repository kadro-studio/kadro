import { useEffect, useRef, useState } from 'react';
import { answer, usePrompt } from '../store/prompt';
import { Icon, type IconName } from '../ui/Icon';

const ICONS: Record<string, IconName> = { warning: 'alert', danger: 'alert', question: 'info', info: 'info' };

/** Renders the current in-app question (see store/prompt.ts). */
export function PromptHost() {
  const p = usePrompt((s) => s.current);
  const primary = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!p) return;
    setText(p.input?.value ?? '');
    if (!p.input) primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        answer(p.cancelId);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [p]);

  if (!p) return null;
  const icon = p.icon ?? 'question';
  const main = p.buttons.find((b) => b.kind === 'primary') ?? p.buttons[p.buttons.length - 1];
  return (
    <div className="modal-backdrop prompt-backdrop" onPointerDown={(e) => e.target === e.currentTarget && answer(p.cancelId)}>
      <div className="prompt-card" role="alertdialog" aria-labelledby="prompt-title">
        <div className="prompt-main">
          <div className={`prompt-icon ${icon}`}>
            <Icon name={ICONS[icon]} size={22} />
          </div>
          <div className="prompt-text">
            <h3 id="prompt-title">{p.title}</h3>
            {p.message && <p>{p.message}</p>}
            {p.input && (
              <input
                className="text-input prompt-input"
                autoFocus
                value={text}
                placeholder={p.input.placeholder}
                onChange={(e) => setText(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.key === 'Enter' && answer(main.id, text)}
              />
            )}
          </div>
        </div>
        <div className="prompt-buttons">
          {p.buttons.map((b) => (
            <button
              key={b.id}
              ref={b === main ? primary : undefined}
              className={`btn ${b.kind === 'primary' ? 'primary' : b.kind === 'danger' ? 'danger' : ''}`}
              onClick={() => answer(b.id, text)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

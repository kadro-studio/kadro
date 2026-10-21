import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Value change callback: `final` is true when the gesture ends (one undo step). */
export type OnValue<T> = (value: T, final: boolean) => void;

function fmt(v: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return v.toFixed(decimals);
}

export interface KeyframeControl {
  animated: boolean;
  atKey: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  defaultValue,
  keyframe,
  softMax,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: OnValue<number>;
  defaultValue?: number;
  keyframe?: KeyframeControl;
  /** Slider range end; the number field may still go up to `max`. */
  softMax?: number;
}) {
  const [text, setText] = useState(fmt(value, step));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value, step));
  }, [value, step, focused]);

  const commitText = () => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)), true);
    else setText(fmt(value, step));
  };

  return (
    <div className="field slider-field">
      <label
        className="field-label"
        title={defaultValue !== undefined ? `${label} — double-click to reset` : label}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue, true)}
      >
        {label}
      </label>
      <div className="slider-row">
        <input
          type="range"
          min={min}
          max={softMax ?? max}
          step={step}
          value={Math.min(softMax ?? max, value)}
          onChange={(e) => onChange(Number(e.target.value), false)}
          onPointerUp={(e) => onChange(Number((e.target as HTMLInputElement).value), true)}
          onKeyUp={(e) => onChange(Number((e.target as HTMLInputElement).value), true)}
        />
        <input
          className="num-input"
          value={text}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            commitText();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(fmt(value, step));
              setFocused(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {unit && <span className="unit">{unit}</span>}
        {keyframe && <KeyframeButtons kf={keyframe} />}
      </div>
    </div>
  );
}

export function KeyframeButtons({ kf }: { kf: KeyframeControl }) {
  return (
    <span className="kf-buttons">
      <button className="icon-btn tiny" disabled={!kf.animated} onClick={kf.onPrev} title="◀">
        <Icon name="chevronLeft" size={12} />
      </button>
      <button
        className={`icon-btn tiny kf-toggle ${kf.atKey ? 'on' : kf.animated ? 'animated' : ''}`}
        onClick={kf.onToggle}
        title="Keyframe"
      >
        <Icon name="diamond" size={12} filled={kf.atKey} />
      </button>
      <button className="icon-btn tiny" disabled={!kf.animated} onClick={kf.onNext} title="▶">
        <Icon name="chevronRight" size={12} />
      </button>
    </span>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field toggle-field">
      <span className="field-label">{label}</span>
      <input type="checkbox" className="switch" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: OnValue<string> }) {
  const ref = useRef<HTMLInputElement>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onInput = () => cb.current(el.value, false);
    const onDone = () => cb.current(el.value, true);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onDone);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onDone);
    };
  }, []);
  return (
    <div className="field color-field">
      <label className="field-label">{label}</label>
      <div className="color-row">
        <input ref={ref} type="color" value={value.slice(0, 7)} onChange={() => undefined} />
        <span className="color-hex">{value.toUpperCase()}</span>
      </div>
    </div>
  );
}

export function TextField({ label, value, onChange, multiline }: { label: string; value: string; onChange: OnValue<string>; multiline?: boolean }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  const common = {
    value: text,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      if (text !== value) onChange(text, true);
    },
  };
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {multiline ? (
        <textarea
          className="text-input"
          rows={3}
          {...common}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value, false);
          }}
        />
      ) : (
        <input
          className="text-input"
          {...common}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      )}
    </div>
  );
}

export function Section({ id, title, children, actions }: { id: string; title: string; children: ReactNode; actions?: ReactNode }) {
  const storageKey = `vr.section.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== '0';
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(storageKey, open ? '0' : '1');
    } catch {
      // storage unavailable
    }
  };
  return (
    <section className={`insp-section ${open ? 'open' : ''}`}>
      <header onClick={toggle}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        <span>{title}</span>
        <span className="section-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </span>
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function IconButton({
  icon,
  title,
  onClick,
  active,
  disabled,
  size = 18,
  className = '',
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <button className={`icon-btn ${active ? 'active' : ''} ${className}`} title={title} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={size} />
    </button>
  );
}

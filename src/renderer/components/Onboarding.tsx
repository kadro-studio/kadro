// First run: a welcome screen that asks how much the user has edited before,
// and a short guided tour of the window (Help → Tour repeats it).
import { useEffect, useLayoutEffect, useState } from 'react';
import { setLang, useLang, useT, type I18nKey } from '../i18n';
import { setPrefs } from '../store/prefs';
import { create } from 'zustand';
import { Icon } from '../ui/Icon';
import { Modal } from './Modal';
import { APP_NAME } from '../../shared/brand';

/** Index of the tour step on screen, or null. */
export const useTour = create<{ step: number | null }>(() => ({ step: null }));

export function startTour(): void {
  useTour.setState({ step: 0 });
}

interface Step {
  /** Element to point at; null shows the bubble in the middle. */
  target: string | null;
  title: I18nKey;
  text: I18nKey;
}

const STEPS: Step[] = [
  { target: '.area-left', title: 'tour.media.t', text: 'tour.media.d' },
  { target: '.area-timeline', title: 'tour.timeline.t', text: 'tour.timeline.d' },
  { target: '.area-center', title: 'tour.preview.t', text: 'tour.preview.d' },
  { target: '.area-right', title: 'tour.inspector.t', text: 'tour.inspector.d' },
  { target: '.rail', title: 'tour.tabs.t', text: 'tour.tabs.d' },
  { target: '.export-btn', title: 'tour.export.t', text: 'tour.export.d' },
  { target: '.simple-toggle', title: 'tour.simple.t', text: 'tour.simple.d' },
];

export function WelcomeDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const choose = (simple: boolean, tour: boolean) => {
    setPrefs({ simpleMode: simple, onboarded: true });
    onClose();
    if (tour) setTimeout(startTour, 250);
  };
  return (
    <Modal title={t('welcome.title', { app: APP_NAME })} onClose={() => choose(false, false)} width={620}>
      <div className="welcome-langs">
        {(['uk', 'ru', 'en'] as const).map((l) => (
          <button key={l} className={`chip ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>
            {{ uk: 'Українська', ru: 'Русский', en: 'English' }[l]}
          </button>
        ))}
      </div>
      <p className="welcome-lead">{t('welcome.lead')}</p>
      <div className="welcome-choices">
        <button className="welcome-card" onClick={() => choose(true, true)}>
          <Icon name="sparkles" size={26} />
          <strong>{t('welcome.new.t')}</strong>
          <span>{t('welcome.new.d')}</span>
        </button>
        <button className="welcome-card" onClick={() => choose(false, false)}>
          <Icon name="scissors" size={26} />
          <strong>{t('welcome.pro.t')}</strong>
          <span>{t('welcome.pro.d')}</span>
        </button>
      </div>
      <p className="panel-hint" style={{ margin: 0, textAlign: 'center' }}>
        {t('welcome.later')}
      </p>
    </Modal>
  );
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function TourOverlay() {
  const t = useT();
  const step = useTour((s) => s.step);
  const [rect, setRect] = useState<Rect | null>(null);
  const current = step === null ? null : STEPS[step];

  useLayoutEffect(() => {
    if (!current) return;
    const measure = () => {
      const el = current.target ? document.querySelector(current.target) : null;
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [current]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useTour.setState({ step: null });
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (step === null || !current) return null;
  const last = step === STEPS.length - 1;
  const next = () => useTour.setState({ step: last ? null : step + 1 });
  const back = () => useTour.setState({ step: Math.max(0, step - 1) });

  // The bubble sits beside the highlighted area, on the side with more room.
  const pad = 8;
  const W = 330;
  let bubble: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const right = vw - (rect.x + rect.w);
    const below = vh - (rect.y + rect.h);
    if (right > W + 24) bubble = { left: rect.x + rect.w + 16, top: Math.min(Math.max(16, rect.y), vh - 220) };
    else if (rect.x > W + 24) bubble = { left: rect.x - W - 16, top: Math.min(Math.max(16, rect.y), vh - 220) };
    else if (below > 200) bubble = { left: Math.min(Math.max(16, rect.x), vw - W - 16), top: rect.y + rect.h + 16 };
    // Above the area, anchored by its bottom edge so a tall text never covers the area.
    else bubble = { left: Math.min(Math.max(16, rect.x), vw - W - 16), bottom: Math.max(16, vh - rect.y + 16) };
  }

  return (
    <div className="tour" role="dialog" aria-labelledby="tour-title">
      {rect ? (
        <div className="tour-spot" style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-bubble" style={{ ...bubble, width: W }}>
        <span className="tour-count">{t('tour.count', { n: step + 1, total: STEPS.length })}</span>
        <strong id="tour-title">{t(current.title)}</strong>
        <p>{t(current.text)}</p>
        <div className="tour-actions">
          <button className="link-btn" onClick={() => useTour.setState({ step: null })}>
            {t('tour.skip')}
          </button>
          <span style={{ flex: 1 }} />
          {step > 0 && (
            <button className="btn small" onClick={back}>
              {t('tour.back')}
            </button>
          )}
          <button className="btn small primary" onClick={next}>
            {last ? t('tour.done') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>
  );
}

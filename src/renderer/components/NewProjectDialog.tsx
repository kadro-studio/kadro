// File → New: name, frame format (or "automatic": the first video decides) and frame rate.
import { useState } from 'react';
import { useT, type I18nKey } from '../i18n';
import { createNewProject, openDialog } from '../store/actions';
import { usePrefs } from '../store/prefs';
import { Icon } from '../ui/Icon';
import { Modal } from './Modal';

interface Format {
  id: string;
  title: I18nKey;
  sub: string;
  w: number;
  h: number;
}

const FORMATS: Format[] = [
  { id: '1920x1080', title: 'np.youtube', sub: '16:9 · 1920×1080', w: 16, h: 9 },
  { id: '1080x1920', title: 'np.vertical', sub: '9:16 · 1080×1920', w: 9, h: 16 },
  { id: '1080x1080', title: 'np.square', sub: '1:1 · 1080×1080', w: 1, h: 1 },
  { id: '1080x1350', title: 'np.portrait', sub: '4:5 · 1080×1350', w: 4, h: 5 },
  { id: '3840x2160', title: 'np.uhd', sub: '16:9 · 3840×2160', w: 16, h: 9 },
  { id: '2560x1080', title: 'np.cinema', sub: '21:9 · 2560×1080', w: 21, h: 9 },
];
const FPS = [24, 25, 30, 50, 60];

function Shape({ w, h }: { w: number; h: number }) {
  const k = 44 / Math.max(w, h);
  return <div className="np-shape" style={{ width: w * k, height: h * k }} />;
}

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const prefs = usePrefs();
  const [name, setName] = useState('');
  const [format, setFormat] = useState(prefs.newProjectFormat);
  const [fps, setFps] = useState(FPS.includes(prefs.newProjectFps) ? prefs.newProjectFps : 30);

  const create = () => {
    createNewProject(name, format, fps);
    onClose();
  };

  return (
    <Modal
      title={t('np.title')}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn" onClick={() => openDialog('templates')}>
            <Icon name="layers" size={15} />
            {t('tpl.start')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={create}>
            {t('np.create')}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">{t('settings.name')}</label>
        <input className="text-input" autoFocus value={name} placeholder={t('top.untitled')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      </div>
      <span className="field-label">{t('np.format')}</span>
      <div className="np-grid">
        <button className={`np-card ${format === 'auto' ? 'active' : ''}`} onClick={() => setFormat('auto')}>
          <div className="np-visual">
            <Icon name="sparkles" size={24} />
          </div>
          <strong>{t('np.auto')}</strong>
          <span>{t('np.autoSub')}</span>
        </button>
        {FORMATS.map((f) => (
          <button key={f.id} className={`np-card ${format === f.id ? 'active' : ''}`} onClick={() => setFormat(f.id)}>
            <div className="np-visual">
              <Shape w={f.w} h={f.h} />
            </div>
            <strong>{t(f.title)}</strong>
            <span>{f.sub}</span>
          </button>
        ))}
      </div>
      {format === 'auto' ? (
        <p className="panel-hint" style={{ margin: 0 }}>
          {t('np.autoHint')}
        </p>
      ) : (
        <div className="field">
          <label className="field-label">{t('settings.fps')}</label>
          <div className="seg">
            {FPS.map((f) => (
              <button key={f} className={fps === f ? 'active' : ''} onClick={() => setFps(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

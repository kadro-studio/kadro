import { useRef, useState } from 'react';
import { autoSubtitles, removeBackground, type CancelFlag } from '../ai/tasks';
import { ASR_LANGUAGES, ASR_MODELS, MATTE_MODEL, type AiProgress } from '../ai/protocol';
import { findClip, mediaMap } from '../core/project';
import { clipHasAudio } from '../core/scene';
import { useT, type I18nKey } from '../i18n';
import { toast, useEditor } from '../store/editor';
import { Icon } from '../ui/Icon';
import { Modal } from './Modal';

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function ProgressView({ p }: { p: AiProgress | null }) {
  const t = useT();
  if (!p) return null;
  const label =
    p.stage === 'download' ? t('ai.downloading', { file: p.file ?? '' }) : p.stage === 'frames' ? t('ai.processing', { at: p.file ?? '' }) : t('ai.running');
  return (
    <div className="export-status">
      <div className={`progress ${p.stage === 'run' ? 'indeterminate' : ''}`}>
        <div style={{ width: `${Math.round(p.progress * 100)}%` }} />
      </div>
      <div className="line">
        <span>{label}</span>
        <span>{p.stage !== 'run' ? `${Math.round(p.progress * 100)}%` : ''}</span>
      </div>
    </div>
  );
}

export function SubtitlesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const selected = useEditor((s) => {
    const f = s.selection.length === 1 ? findClip(s.project, s.selection[0]) : null;
    return f && clipHasAudio(f.clip, mediaMap(s.project)) ? f.clip : null;
  });
  const [model, setModel] = useState<string>(ASR_MODELS[1].id);
  const [lang, setLang] = useState<string>('russian');
  const [scope, setScope] = useState<'clip' | 'project'>(selected ? 'clip' : 'project');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AiProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const size = ASR_MODELS.find((m) => m.id === model)?.size ?? 0;

  const start = async () => {
    setRunning(true);
    setError(null);
    setProgress({ stage: 'run', progress: 0 });
    try {
      const n = await autoSubtitles(
        { model, language: lang === 'auto' ? null : lang, clipId: scope === 'clip' && selected ? selected.id : null },
        setProgress,
      );
      toast(t('ai.subsDone', { n }), 'success');
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      title={t('ai.subsTitle')}
      onClose={running ? undefined : onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={running}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => void start()} disabled={running}>
            <Icon name="sparkles" size={16} />
            {t('ai.start')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('ai.subsHint')}
      </p>
      <div className="seg">
        <button className={scope === 'clip' ? 'active' : ''} disabled={!selected || running} onClick={() => setScope('clip')}>
          {t('ai.scopeClip')}
        </button>
        <button className={scope === 'project' ? 'active' : ''} disabled={running} onClick={() => setScope('project')}>
          {t('ai.scopeProject')}
        </button>
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">{t('ai.language')}</label>
          <select className="select" value={lang} disabled={running} onChange={(e) => setLang(e.target.value)}>
            {ASR_LANGUAGES.map((l) => (
              <option key={l.id ?? 'auto'} value={l.id ?? 'auto'}>
                {t(l.key as I18nKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">{t('ai.model')}</label>
          <select className="select" value={model} disabled={running} onChange={(e) => setModel(e.target.value)}>
            {ASR_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {t(m.key as I18nKey)} (~{m.size} MB)
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('ai.privacy', { size })}
      </p>
      {running && <ProgressView p={progress} />}
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

export function BackgroundDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const clip = useEditor((s) => {
    const f = s.selection.length === 1 ? findClip(s.project, s.selection[0]) : null;
    return f && (f.clip.type === 'video' || f.clip.type === 'image') ? f.clip : null;
  });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AiProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<CancelFlag>({ cancelled: false });

  const start = async () => {
    if (!clip) return;
    cancel.current = { cancelled: false };
    setRunning(true);
    setError(null);
    setProgress({ stage: 'run', progress: 0 });
    try {
      await removeBackground(clip.id, setProgress, cancel.current);
      toast(t('ai.bgDone'), 'success');
      onClose();
    } catch (e) {
      if (!cancel.current.cancelled) setError(errText(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      title={t('ai.bgTitle')}
      onClose={running ? undefined : onClose}
      footer={
        running ? (
          <button className="btn danger" onClick={() => (cancel.current.cancelled = true)}>
            {t('common.cancel')}
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" onClick={() => void start()} disabled={!clip}>
              <Icon name="sparkles" size={16} />
              {t('ai.start')}
            </button>
          </>
        )
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {clip ? t('ai.bgHint', { name: clip.name }) : t('toast.selectClipFirst')}
      </p>
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('ai.privacy', { size: MATTE_MODEL.size })}
      </p>
      {running && <ProgressView p={progress} />}
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

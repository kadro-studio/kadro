// Project templates: the library (start from a template, save the project as
// one) and filling a template's slots with the user's own files.
import { useEffect, useMemo } from 'react';
import { mediaUrl } from '../../shared/api';
import { emptySlot, projectDuration } from '../core/project';
import { formatDuration } from '../core/time';
import { projectThumbnail } from '../engine/fx/thumbs';
import { useLang, useT } from '../i18n';
import { builtinTemplates } from '../store/builtinTemplates';
import { setLeftTab } from '../store/actions';
import { useEditor } from '../store/editor';
import { askText } from '../store/prompt';
import {
  fillEmptySlotsViaDialog,
  fillSlotViaDialog,
  projectSlots,
  reloadTemplates,
  removeTemplate,
  saveProjectAsTemplate,
  startFromTemplate,
  useTemplates,
  type TemplateEntry,
} from '../store/templates';
import { setFilter } from '../store/workshop';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/controls';
import { Modal } from './Modal';

/** A frame a little into the template, where titles and effects are usually on screen. */
function previewTime(duration: number): number {
  return Math.min(duration * 0.3, 1.2);
}

function TemplateCard({ entry }: { entry: TemplateEntry }) {
  const t = useT();
  const thumb = useMemo(() => projectThumbnail(entry.data.project, previewTime(entry.duration)), [entry]);
  const { width, height } = entry.data.project.settings;
  return (
    <div className="tpl-card">
      <button className="tpl-thumb" title={t('tpl.use')} onClick={() => void startFromTemplate(entry)}>
        {thumb ? <img src={thumb} alt="" /> : <Icon name="layers" size={28} />}
      </button>
      <div className="tpl-body">
        <div className="tpl-name" title={entry.name}>
          {entry.name}
        </div>
        <div className="tpl-meta">
          {t('tpl.slots', { n: entry.slots })} · {formatDuration(entry.duration)} · {width}×{height}
        </div>
      </div>
      <div className="tpl-actions">
        <button className="btn primary small" onClick={() => void startFromTemplate(entry)}>
          {t('tpl.use')}
        </button>
        {!entry.builtin && <IconButton icon="trash" title={t('common.delete')} onClick={() => void removeTemplate(entry)} />}
      </div>
    </div>
  );
}

export function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const list = useTemplates((s) => s.list);
  const hasClips = useEditor((s) => s.project.tracks.some((tr) => tr.clips.length > 0));
  const projectName = useEditor((s) => s.project.name);
  const lang = useLang((s) => s.lang);
  // Built in, in the current language (their texts are translated when built).
  const builtins = useMemo(() => builtinTemplates(), [lang]);

  useEffect(() => {
    void reloadTemplates();
  }, []);

  const saveCurrent = async () => {
    const name = await askText({ title: t('tpl.saveTitle'), value: projectName, ok: t('common.save'), cancel: t('common.cancel') });
    if (name?.trim()) await saveProjectAsTemplate(name.trim());
  };

  const browse = () => {
    onClose();
    setLeftTab('workshop');
    setFilter({ kind: 'template' });
  };

  return (
    <Modal
      title={t('tpl.title')}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn" onClick={browse}>
            <Icon name="workshop" size={15} />
            {t('tpl.browse')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={!hasClips} onClick={() => void saveCurrent()} title={hasClips ? '' : t('tpl.saveEmpty')}>
            {t('tpl.saveCurrent')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('tpl.hint')}
      </p>
      <span className="field-label">{t('tpl.builtin')}</span>
      <div className="tpl-grid">
        {builtins.map((e) => (
          <TemplateCard key={e.path} entry={e} />
        ))}
      </div>
      <span className="field-label">{t('tpl.mine')}</span>
      {list.length === 0 ? (
        <div className="ws-empty">
          <Icon name="layers" size={28} />
          <span>{t('tpl.empty')}</span>
        </div>
      ) : (
        <div className="tpl-grid">
          {list.map((e) => (
            <TemplateCard key={e.path} entry={e} />
          ))}
        </div>
      )}
    </Modal>
  );
}

export function FillTemplateDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const project = useEditor((s) => s.project);
  const runtime = useEditor((s) => s.runtime);
  const slots = useMemo(() => projectSlots(project), [project]);
  const empty = slots.filter(emptySlot).length;
  const preview = useMemo(() => projectThumbnail(project, previewTime(projectDuration(project))), [project]);

  return (
    <Modal
      title={t('tpl.fillTitle')}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn" disabled={empty === 0} onClick={() => void fillEmptySlotsViaDialog()}>
            <Icon name="import" size={15} />
            {t('tpl.pickMany')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={onClose}>
            {empty ? t('tpl.later') : t('tpl.done')}
          </button>
        </>
      }
    >
      <div className="tpl-fill-head">
        {preview && <img src={preview} alt="" />}
        <p className="panel-hint" style={{ margin: 0 }}>
          {t('tpl.fillHint')}
          <br />
          <strong>{empty ? t('tpl.emptyLeft', { n: empty, total: slots.length }) : t('tpl.allFilled')}</strong>
        </p>
      </div>
      <div className="tpl-slots">
        {slots.map((m) => {
          const filled = !emptySlot(m);
          const thumb = filled ? runtime[m.id]?.thumb : null;
          return (
            <div key={m.id} className={`tpl-slot ${filled ? 'filled' : ''}`}>
              <div className="tpl-slot-thumb" style={thumb ? { backgroundImage: `url("${mediaUrl(thumb)}")` } : undefined}>
                {!thumb && <span>{m.slot!.index}</span>}
              </div>
              <div className="tpl-slot-info">
                <strong>{m.name.split(' · ')[0]}</strong>
                <span>
                  {filled ? m.name.split(' · ').slice(1).join(' · ') : m.kind === 'audio' ? t('tpl.wantSound') : t('tpl.wantPicture', { d: formatDuration(m.duration) })}
                </span>
              </div>
              <button className={`btn small ${filled ? '' : 'primary'}`} onClick={() => void fillSlotViaDialog(m.id)}>
                {filled ? t('tpl.replace') : t('tpl.pick')}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

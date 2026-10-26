// Publishing a local effect, look, title style, LUT or theme to the workshop.
import { useEffect, useMemo, useState } from 'react';
import type { WorkshopKind } from '../../shared/api';
import { useT, type I18nKey } from '../i18n';
import { useLuts } from '../store/luts';
import { useMods } from '../store/mods';
import { usePrefs } from '../store/prefs';
import { usePresets } from '../store/presets';
import { publish, resendConfirmation, signIn, signUp, useWorkshop } from '../store/workshop';
import { localSources, packSource } from '../workshop/items';
import { Modal } from './Modal';

const KINDS: WorkshopKind[] = ['effect', 'transition', 'element', 'look', 'textStyle', 'lut', 'theme', 'template'];
const LICENSES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC0', 'MIT'];

function bump(v: string): string {
  const parts = v.split('.').map((x) => Number(x) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2]++;
  return parts.slice(0, 3).join('.');
}

export function PublishDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const account = useWorkshop((s) => s.account);
  const open = useWorkshop((s) => s.open);
  const update = open && account && open.author === account.name ? open : null;
  // Re-list when local things change.
  useMods((s) => s.installed);
  usePresets((s) => s);
  useLuts((s) => s.luts);
  usePrefs((p) => p.myThemes);

  const [kind, setKind] = useState<WorkshopKind>(update?.kind ?? 'effect');
  const sources = localSources(kind);
  const [ref, setRef] = useState('');
  const source = sources.find((s) => s.ref === ref) ?? sources[0];
  const [title, setTitle] = useState(update?.title ?? '');
  const [description, setDescription] = useState(update?.description ?? '');
  const [tags, setTags] = useState(update?.tags.join(', ') ?? '');
  const [license, setLicense] = useState(update?.license ?? LICENSES[0]);
  const [version, setVersion] = useState(update ? bump(update.version) : '1.0.0');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);

  // An imported shader keeps its original licence and credit.
  const forcedLicense = source?.license;
  const effectiveLicense = forcedLicense ?? license;

  useEffect(() => {
    if (!source || update) return;
    setTitle(source.name || '');
  }, [source?.ref, kind]);

  useEffect(() => {
    setPreview(null);
    if (!source) return;
    let alive = true;
    void packSource(source, title || source.name || 'preview')
      .then((pkg) => {
        if (!alive || !pkg.preview) return;
        const blob = new Blob([Uint8Array.from(pkg.preview).buffer], { type: 'image/jpeg' });
        setPreview(URL.createObjectURL(blob));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [source?.ref, kind]);

  const credit = useMemo(() => {
    if (!source?.author) return '';
    return t('pub.credit', { author: source.author, url: source.sourceUrl ?? '' });
  }, [source, t]);

  const submit = async () => {
    if (!source) return;
    setBusy(true);
    const desc = [description.trim(), credit].filter(Boolean).join('\n\n');
    const item = await publish({
      source,
      title: title.trim(),
      description: desc,
      license: effectiveLicense,
      tags: tags
        .split(',')
        .map((x) => x.trim().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 8),
      version: version.trim() || '1.0.0',
      updateId: update?.id,
    });
    setBusy(false);
    if (item) onClose();
  };

  const emptyHint = `pub.empty.${kind}` as I18nKey;
  return (
    <Modal
      title={update ? t('pub.updateTitle', { name: update.title }) : t('pub.title')}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!account || account.confirmed === false || !source || !title.trim() || !agree || busy} onClick={() => void submit()}>
            {busy ? t('pub.sending') : t('pub.send')}
          </button>
        </>
      }
    >
      {!account && (
        <div className="ws-pending-box">
          {t('pub.signInFirst')}{' '}
          <button className="link-btn" onClick={signIn}>
            {t('ws.signIn')}
          </button>
          {' · '}
          <button className="link-btn" onClick={signUp}>
            {t('ws.signUp')}
          </button>
        </div>
      )}
      {account?.confirmed === false && (
        <div className="ws-pending-box">
          {t('ws.unconfirmed')}{' '}
          <button className="link-btn" onClick={() => void resendConfirmation()}>
            {t('ws.resend')}
          </button>
        </div>
      )}
      {!update && (
        <div className="ws-chips">
          {KINDS.map((k) => (
            <button
              key={k}
              className={`chip ${kind === k ? 'active' : ''}`}
              onClick={() => {
                setKind(k);
                setRef('');
              }}
            >
              {t(`ws.kinds.${k}` as I18nKey)}
            </button>
          ))}
        </div>
      )}
      {sources.length === 0 ? (
        <p className="panel-hint" style={{ margin: 0 }}>
          {t(emptyHint)}
        </p>
      ) : (
        <div className="st-grid">
          <div className="st-preview">{preview ? <img src={preview} alt="" /> : <span className="panel-hint">{t('st.previewHint')}</span>}</div>
          <div className="st-options">
            <div className="field">
              <label className="field-label">{t('pub.what')}</label>
              <select className="select" value={source?.ref} onChange={(e) => setRef(e.target.value)}>
                {sources.map((s) => (
                  <option key={s.ref} value={s.ref}>
                    {s.ref === 'current' ? t(s.kind === 'template' ? 'pub.currentProject' : 'pub.currentTheme') : s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">{t('st.name')}</label>
              <input className="text-input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
        </div>
      )}
      <div className="field">
        <label className="field-label">{t('pub.description')}</label>
        <textarea className="text-input" rows={3} maxLength={1500} value={description} placeholder={t('pub.descriptionHint')} onChange={(e) => setDescription(e.target.value)} />
        {credit && <span className="panel-hint" style={{ margin: 0 }}>{credit}</span>}
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">{t('pub.tags')}</label>
          <input className="text-input" value={tags} placeholder={t('pub.tagsHint')} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">{t('pub.version')}</label>
          <input className="text-input" value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">{t('st.license')}</label>
          {forcedLicense ? (
            <span className="panel-hint" style={{ margin: 0 }}>
              {t('pub.keptLicense', { license: forcedLicense })}
            </span>
          ) : (
            <select className="select" value={license} onChange={(e) => setLicense(e.target.value)}>
              {LICENSES.map((l) => (
                <option key={l} value={l}>
                  {t(`pub.lic.${l.replace(/[^A-Za-z0-9]/g, '')}` as I18nKey)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <label className="ws-agree">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{t('pub.agree')}</span>
      </label>
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('pub.reviewNote')}
      </p>
    </Modal>
  );
}

// One-time import of a Shadertoy shader as a mod (effect or element).
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { clearFxError, useFx } from '../engine/fx/registry';
import { convertShadertoy, ShadertoyError, shadertoyId, shadertoyLicense, type ShadertoyKind } from '../engine/fx/shadertoy';
import { fxThumbnail } from '../engine/fx/thumbs';
import { validateFxDef, type FxDef } from '../engine/fx/types';
import { useT, type I18nKey } from '../i18n';
import { openDialog } from '../store/actions';
import { toast } from '../store/editor';
import { reloadMods } from '../store/mods';
import { usePrefs } from '../store/prefs';
import { ToggleField } from '../ui/controls';
import { Modal } from './Modal';

const PREVIEW_ID = 'shadertoy.preview';

interface Meta {
  id: string | null;
  author: string;
  description: string;
  url: string;
  buffers: number;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function ShadertoyDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const key = usePrefs((p) => p.libraryKeys.shadertoy ?? '');
  const [link, setLink] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ShadertoyKind>('auto');
  const [transparent, setTransparent] = useState(true);
  const [meta, setMeta] = useState<Meta>({ id: null, author: '', description: '', url: '', buffers: 0 });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  /** Preview outcome per converted code: compiled programs and thumbnails are cached, errors are reported once. */
  const results = useRef(new Map<string, { url: string | null; error: string | null }>());

  const converted = useMemo(() => {
    if (!code.trim()) return null;
    try {
      return { ok: convertShadertoy(code, kind, transparent) };
    } catch (e) {
      const reason = e instanceof ShadertoyError ? t(`st.err.${e.code}` as I18nKey) : String(e);
      return { error: reason };
    }
  }, [code, kind, transparent, t]);

  const license = useMemo(() => shadertoyLicense(code), [code]);

  const buildDef = (id: string): FxDef | null => {
    if (!converted?.ok) return null;
    const def: FxDef = {
      id,
      kind: converted.ok.kind,
      name: name.trim() || t('st.untitled'),
      author: meta.author || undefined,
      version: '1.0.0',
      description: meta.description || undefined,
      license,
      sourceUrl: meta.url || undefined,
      params: [],
      glsl: converted.ok.glsl,
      source: 'mod',
    };
    if (def.kind === 'generator') {
      def.category = transparent ? 'overlay' : 'background';
      def.blend = 'normal';
    }
    return def;
  };

  // Live preview: the converted shader on the sample photo.
  useEffect(() => {
    setPreview(null);
    setCompileError(null);
    const def = buildDef(PREVIEW_ID);
    if (!def) return;
    const known = results.current.get(def.glsl);
    if (known) {
      setPreview(known.url);
      setCompileError(known.error);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      clearFxError(PREVIEW_ID);
      // A shader that fails to compile is reported, and the photo is drawn without it.
      void fxThumbnail(def).then((url) => {
        const error = useFx.getState().errors[PREVIEW_ID] ?? null;
        results.current.set(def.glsl, { url: error ? null : url, error });
        if (!alive) return;
        setPreview(error ? null : url);
        setCompileError(error);
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [converted]);

  const load = async () => {
    const id = shadertoyId(link);
    if (!id) {
      toast(t('st.badLink'), 'error');
      return;
    }
    setBusy(true);
    try {
      const s = await api.fetchShadertoy(id, key);
      setCode(s.code);
      setName(s.name);
      setMeta({ id: s.id, author: s.author, description: s.description, url: s.url, buffers: s.buffers });
    } catch (e) {
      toast(t('st.fetchFailed', { err: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    const id = `shadertoy.${meta.id ?? hash(code)}`;
    const def = buildDef(id);
    if (!def) return;
    const invalid = validateFxDef(def);
    if (invalid) {
      toast(invalid, 'error');
      return;
    }
    const { source: _source, ...file } = def;
    await api.installModText(`${id.replace(/\./g, '-')}.vrmod`, JSON.stringify({ format: 1, ...file }, null, 2));
    await reloadMods();
    toast(t(def.kind === 'effect' ? 'st.installedEffect' : 'st.installedElement', { name: def.name }), 'success');
    onClose();
  };

  const error = converted?.error ?? compileError ?? null;
  return (
    <Modal
      title={t('st.title')}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
          <button className="btn primary" disabled={!converted?.ok || !!compileError || busy} onClick={() => void install()}>
            {t('st.install')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('st.hint')}
      </p>
      <div className="field">
        <label className="field-label">{t('st.link')}</label>
        <div className="file-row">
          <input className="text-input" value={link} placeholder="https://www.shadertoy.com/view/…" onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key && void load()} />
          <button className="btn" disabled={!key || busy || !link.trim()} onClick={() => void load()}>
            {t('st.load')}
          </button>
        </div>
        {!key && (
          <span className="panel-hint" style={{ margin: 0 }}>
            {t('st.noKey')}{' '}
            <button className="link-btn" onClick={() => openDialog('prefs')}>
              {t('st.openSettings')}
            </button>
          </span>
        )}
      </div>
      <div className="field">
        <label className="field-label">{t('st.code')}</label>
        <textarea className="text-input code-input" rows={9} spellCheck={false} value={code} placeholder="void mainImage(out vec4 fragColor, in vec2 fragCoord) { … }" onChange={(e) => setCode(e.target.value)} />
      </div>
      {meta.buffers > 0 && <div className="error-box">{t('st.buffers', { n: meta.buffers })}</div>}
      <div className="st-grid">
        <div className="st-preview">{preview ? <img src={preview} alt="" /> : <span className="panel-hint">{error ?? t('st.previewHint')}</span>}</div>
        <div className="st-options">
          <div className="field">
            <label className="field-label">{t('st.name')}</label>
            <input className="text-input" value={name} placeholder={t('st.untitled')} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="seg">
            {(['auto', 'effect', 'generator'] as const).map((k) => (
              <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
                {t(`st.kind.${k}` as I18nKey)}
              </button>
            ))}
          </div>
          <span className="panel-hint" style={{ margin: 0 }}>
            {converted?.ok ? t(converted.ok.kind === 'effect' ? 'st.asEffect' : 'st.asElement') : ''}
          </span>
          {converted?.ok?.kind === 'generator' && <ToggleField label={t('st.transparent')} value={transparent} onChange={setTransparent} />}
          {code.trim() && (
            <span className="panel-hint" style={{ margin: 0 }}>
              {meta.author ? `${t('st.author')}: ${meta.author} · ` : ''}
              {t('st.license')}: {license}
            </span>
          )}
        </div>
      </div>
      {error && code.trim() && <div className="error-box">{error}</div>}
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('st.licenseHint')}
      </p>
    </Modal>
  );
}

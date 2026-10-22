import { useEffect, useState } from 'react';
import type { StorageInfo, StorageKind } from '../../shared/api';
import { api } from '../api';
import { useEditor } from '../store/editor';
import { analyzeMedia } from '../store/media';
import { confirmAction } from '../store/prompt';
import { setLang, useLang, useT, type I18nKey } from '../i18n';
import { setPrefs, setTheme, usePrefs } from '../store/prefs';
import { ACCENTS, SURFACES, type Corners } from '../store/theme';
import { Modal } from './Modal';
import { openDialog } from '../store/actions';
import { exportPresetsFile, importPresetsFile, usePresets } from '../store/presets';
import { addUserFonts, removeUserFont, useUserFonts } from '../store/userFonts';
import { Icon } from '../ui/Icon';

type Tab = 'general' | 'appearance' | 'mine' | 'performance' | 'library' | 'storage';
const TABS: { id: Tab; label: I18nKey }[] = [
  { id: 'general', label: 'prefs.tab.general' },
  { id: 'appearance', label: 'prefs.tab.appearance' },
  { id: 'mine', label: 'prefs.tab.mine' },
  { id: 'performance', label: 'prefs.tab.performance' },
  { id: 'library', label: 'prefs.tab.library' },
  { id: 'storage', label: 'prefs.tab.storage' },
];

const SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3];
const CORNERS: Corners[] = ['sharp', 'normal', 'round'];

export function PrefsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('general');
  return (
    <Modal title={t('prefs.title')} onClose={onClose} width={720} footer={<button className="btn primary" onClick={onClose}>{t('common.ok')}</button>}>
      <div className="prefs">
        <nav className="prefs-nav">
          {TABS.map((x) => (
            <button key={x.id} className={`prefs-tab ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
              {t(x.label)}
            </button>
          ))}
        </nav>
        <div className="prefs-page">
          {tab === 'general' && <GeneralPage />}
          {tab === 'appearance' && <AppearancePage />}
          {tab === 'mine' && <MinePage />}
          {tab === 'performance' && <PerformancePage />}
          {tab === 'library' && <LibraryPage />}
          {tab === 'storage' && <StoragePage />}
        </div>
      </div>
    </Modal>
  );
}

function GeneralPage() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const autosave = usePrefs((p) => p.autosaveMinutes);
  const still = usePrefs((p) => p.stillDuration);
  const follow = usePrefs((p) => p.followPlayhead);
  return (
    <>
      <div className="field">
        <label className="field-label">{t('menu.language')}</label>
        <select className="select" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
          <option value="uk">Українська</option>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="field">
        <label className="field-label">{t('prefs.autosave')}</label>
        <select className="select" value={autosave} onChange={(e) => setPrefs({ autosaveMinutes: Number(e.target.value) })}>
          <option value={0}>{t('prefs.off')}</option>
          {[1, 2, 5, 10].map((m) => (
            <option key={m} value={m}>
              {t('prefs.everyMinutes', { n: m })}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label">{t('prefs.stillDuration')}</label>
        <select className="select" value={still} onChange={(e) => setPrefs({ stillDuration: Number(e.target.value) })}>
          {[2, 3, 5, 7, 10, 15].map((s) => (
            <option key={s} value={s}>
              {t('prefs.seconds', { n: s })}
            </option>
          ))}
        </select>
      </div>
      <label className="field toggle-field">
        <span className="field-label">{t('prefs.followPlayhead')}</span>
        <input type="checkbox" className="switch" checked={follow} onChange={(e) => setPrefs({ followPlayhead: e.target.checked })} />
      </label>
    </>
  );
}

/** The user's own things: presets, fonts and keyboard shortcuts. */
function MinePage() {
  const t = useT();
  const presets = usePresets((p) => p);
  const fonts = useUserFonts((s) => s.fonts);
  const customKeys = usePrefs((p) => Object.keys(p.keymap).length);
  return (
    <>
      <div className="mods-section-title">{t('prefs.mine.presets')}</div>
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('prefs.mine.presetsCount', { text: presets.text.length, looks: presets.looks.length, exports: presets.exports.length })}
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => void exportPresetsFile()}>
          <Icon name="export" size={16} />
          {t('prefs.mine.exportPresets')}
        </button>
        <button className="btn" onClick={() => void importPresetsFile()}>
          <Icon name="import" size={16} />
          {t('prefs.mine.importPresets')}
        </button>
      </div>
      <div className="mods-section-title">{t('prefs.mine.fonts')}</div>
      {fonts.length === 0 && <p className="panel-hint" style={{ margin: 0 }}>{t('prefs.mine.noFonts')}</p>}
      {fonts.map((f) => (
        <div key={f.family} className="storage-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="storage-title" style={{ fontFamily: `"${f.family}"`, fontSize: 18 }}>{f.family}</div>
            <div className="panel-hint" style={{ margin: 0 }}>{f.files.join(', ')}</div>
          </div>
          <button className="btn small danger" onClick={() => void removeUserFont(f.family)}>
            {t('common.delete')}
          </button>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => void addUserFonts()}>
          <Icon name="plus" size={16} />
          {t('fonts.add')}
        </button>
        <button className="btn" onClick={() => api.openFontsFolder()}>
          <Icon name="folder" size={16} />
          {t('fonts.folder')}
        </button>
      </div>
      <div className="mods-section-title">{t('shortcuts.title')}</div>
      <p className="panel-hint" style={{ margin: 0 }}>{customKeys ? t('prefs.mine.keysCustom', { n: customKeys }) : t('prefs.mine.keysDefault')}</p>
      <div className="row">
        <button className="btn" onClick={() => openDialog('shortcuts')}>
          <Icon name="keyboard" size={16} />
          {t('prefs.mine.editKeys')}
        </button>
      </div>
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const STORAGE_ROWS: { kind: StorageKind; label: I18nKey; hint: I18nKey }[] = [
  { kind: 'cache', label: 'storage.cache', hint: 'storage.cacheHint' },
  { kind: 'library', label: 'storage.library', hint: 'storage.libraryHint' },
  { kind: 'models', label: 'storage.models', hint: 'storage.modelsHint' },
];

function StoragePage() {
  const t = useT();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = () => void api.storageInfo().then(setInfo);
  useEffect(refresh, []);
  const clear = async (kind: StorageKind, label: string) => {
    const ok = await confirmAction({ title: t('storage.clearTitle', { name: label }), message: t('storage.clearText'), confirm: t('storage.clear'), cancel: t('common.cancel'), danger: true });
    if (!ok) return;
    await api.clearStorage(kind);
    // Thumbnails, waveforms and proxies of the open project are rebuilt.
    if (kind === 'cache') for (const m of useEditor.getState().project.media) void analyzeMedia(m);
    refresh();
  };
  return (
    <>
      {STORAGE_ROWS.map((r) => (
        <div key={r.kind} className="storage-row">
          <div>
            <div className="storage-title">
              {t(r.label)} <span>{info ? formatSize(info[r.kind]) : '…'}</span>
            </div>
            <div className="panel-hint" style={{ margin: 0 }}>
              {t(r.hint)}
            </div>
          </div>
          <button className="btn small danger" disabled={!info || info[r.kind] === 0} onClick={() => void clear(r.kind, t(r.label))}>
            {t('storage.clear')}
          </button>
        </div>
      ))}
      {info && (
        <button className="btn" onClick={() => api.showItemInFolder(info.root)}>
          {t('storage.openFolder')}
        </button>
      )}
    </>
  );
}

function AppearancePage() {
  const t = useT();
  const theme = usePrefs((p) => p.theme);
  const custom = !ACCENTS.includes(theme.accent);
  return (
    <>
      <div className="field">
        <label className="field-label">{t('theme.surface')}</label>
        <div className="surface-grid">
          {SURFACES.map((s) => (
            <button key={s.id} className={`surface-card ${theme.surface === s.id ? 'active' : ''}`} onClick={() => setTheme({ surface: s.id })}>
              <span className="surface-preview" style={{ background: s.swatch[0] }}>
                <i style={{ background: s.swatch[1] }} />
                <i style={{ background: s.swatch[1] }} />
                <b style={{ background: theme.accent }} />
              </span>
              <span>{t(`theme.${s.id}` as I18nKey)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label">{t('theme.accent')}</label>
        <div className="accent-row">
          {ACCENTS.map((c) => (
            <button
              key={c}
              className={`accent-dot ${theme.accent === c ? 'active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => setTheme({ accent: c })}
            />
          ))}
          <label className={`accent-dot custom ${custom ? 'active' : ''}`} title={t('theme.custom')} style={custom ? { background: theme.accent } : undefined}>
            <input type="color" value={theme.accent} onChange={(e) => setTheme({ accent: e.target.value })} />
          </label>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">{t('theme.scale')}</label>
          <select className="select" value={theme.uiScale} onChange={(e) => setTheme({ uiScale: Number(e.target.value) })}>
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {Math.round(s * 100)} %
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">{t('theme.corners')}</label>
          <div className="seg">
            {CORNERS.map((c) => (
              <button key={c} className={theme.corners === c ? 'active' : ''} onClick={() => setTheme({ corners: c })}>
                {t(`theme.corners.${c}` as I18nKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="field toggle-field">
        <span className="field-label">{t('theme.calm')}</span>
        <input type="checkbox" className="switch" checked={theme.calm} onChange={(e) => setTheme({ calm: e.target.checked })} />
      </label>
    </>
  );
}

function PerformancePage() {
  const t = useT();
  const prefs = usePrefs();
  return (
    <>
      <label className="field toggle-field">
        <span className="field-label">{t('prefs.autoProxy')}</span>
        <input type="checkbox" className="switch" checked={prefs.autoProxy} onChange={(e) => setPrefs({ autoProxy: e.target.checked })} />
      </label>
      <label className="field toggle-field">
        <span className="field-label">{t('preview.useProxies')}</span>
        <input type="checkbox" className="switch" checked={prefs.useProxies} onChange={(e) => setPrefs({ useProxies: e.target.checked })} />
      </label>
    </>
  );
}

const KEY_SITES = { pexels: 'https://www.pexels.com/api/', pixabay: 'https://pixabay.com/api/docs/' } as const;

function LibraryPage() {
  const t = useT();
  const keys = usePrefs((p) => p.libraryKeys);
  return (
    <>
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('prefs.libraryHint')}
      </p>
      {(['pexels', 'pixabay'] as const).map((k) => (
        <div className="field" key={k}>
          <label className="field-label">{t('prefs.apiKey', { name: k === 'pexels' ? 'Pexels' : 'Pixabay' })}</label>
          <div className="file-row">
            <input
              className="text-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keys[k] ?? ''}
              placeholder={t('prefs.apiKeyPlaceholder')}
              onChange={(e) => setPrefs({ libraryKeys: { ...keys, [k]: e.target.value.trim() } })}
            />
            <button className="btn" onClick={() => window.open(KEY_SITES[k], '_blank')}>
              {t('prefs.getKey')}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

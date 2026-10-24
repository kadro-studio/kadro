import { useEffect, useState } from 'react';
import type { StorageInfo, StorageKind } from '../../shared/api';
import { api } from '../api';
import { toast, useEditor } from '../store/editor';
import { analyzeMedia } from '../store/media';
import { askText, confirmAction } from '../store/prompt';
import { refreshAccount, signOut, useWorkshop } from '../store/workshop';
import { themePreview } from '../workshop/items';
import { uid } from '../core/project';
import { setLang, useLang, useT, type I18nKey } from '../i18n';
import { setPrefs, setTheme, usePrefs } from '../store/prefs';
import { ACCENTS, SURFACES, type Corners } from '../store/theme';
import { Modal } from './Modal';
import { openDialog } from '../store/actions';
import { exportPresetsFile, importPresetsFile, usePresets } from '../store/presets';
import { addUserFonts, removeUserFont, useUserFonts } from '../store/userFonts';
import { checkUpdatesNow } from '../store/updates';
import { startTour } from './Onboarding';
import { Icon } from '../ui/Icon';

type Tab = 'general' | 'appearance' | 'interface' | 'mine' | 'performance' | 'library' | 'storage';
const TABS: { id: Tab; label: I18nKey }[] = [
  { id: 'general', label: 'prefs.tab.general' },
  { id: 'appearance', label: 'prefs.tab.appearance' },
  { id: 'interface', label: 'prefs.tab.interface' },
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
          {tab === 'interface' && <InterfacePage />}
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
  const autoUpdate = usePrefs((p) => p.autoUpdate);
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
      <label className="field toggle-field">
        <span className="field-label">{t('prefs.autoUpdate')}</span>
        <input type="checkbox" className="switch" checked={autoUpdate} onChange={(e) => setPrefs({ autoUpdate: e.target.checked })} />
      </label>
      <span className="panel-hint" style={{ margin: 0 }}>
        {t('prefs.autoUpdateHint')}{' '}
        <button className="link-btn" onClick={() => void checkUpdatesNow()}>
          {t('upd.checkNow')}
        </button>
      </span>
    </>
  );
}

/** The user's own things: presets, fonts and keyboard shortcuts. */
/** Workshop account: browser sign-in, or a login and application password typed in. */
function WorkshopAccountSection() {
  const t = useT();
  const account = useWorkshop((s) => s.account);
  const [manual, setManual] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const saveManual = async () => {
    await api.workshopSaveLogin(user.trim(), password.trim());
    setPassword('');
    await refreshAccount();
    const a = useWorkshop.getState().account;
    if (a?.valid) {
      setManual(false);
      toast(t('ws.signedIn'), 'success');
    } else toast(t('ws.signInFailed'), 'error');
  };
  return (
    <>
      <div className="mods-section-title">{t('tab.workshop')}</div>
      <p className="panel-hint" style={{ margin: 0 }}>
        {account ? (account.valid ? t('ws.signedInAs', { name: account.name }) : t('prefs.ws.invalid', { name: account.name })) : t('prefs.ws.signedOut')}
      </p>
      <div className="row" style={{ gap: 8 }}>
        {account ? (
          <button className="btn" onClick={signOut}>
            {t('prefs.ws.signOut')}
          </button>
        ) : (
          <button className="btn primary" onClick={() => api.workshopSignIn()}>
            <Icon name="globe" size={16} />
            {t('prefs.ws.signInBrowser')}
          </button>
        )}
        {!account && (
          <button className="btn" onClick={() => setManual(!manual)}>
            {t('prefs.ws.manual')}
          </button>
        )}
      </div>
      {manual && !account && (
        <div className="grid-2">
          <div className="field">
            <label className="field-label">{t('prefs.ws.login')}</label>
            <input className="text-input" autoComplete="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">{t('prefs.ws.appPassword')}</label>
            <input className="text-input" type="password" autoComplete="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <p className="panel-hint" style={{ margin: 0, gridColumn: '1 / -1' }}>
            {t('prefs.ws.manualHint')}
          </p>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn primary" disabled={!user.trim() || !password.trim()} onClick={() => void saveManual()}>
              {t('ws.signIn')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MinePage() {
  const t = useT();
  const presets = usePresets((p) => p);
  const fonts = useUserFonts((s) => s.fonts);
  const customKeys = usePrefs((p) => Object.keys(p.keymap).length);
  return (
    <>
      <WorkshopAccountSection />
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
      <MyThemes />
    </>
  );
}

/** Saved and workshop themes: apply with a click. */
function MyThemes() {
  const t = useT();
  const themes = usePrefs((p) => p.myThemes);
  const current = usePrefs((p) => p.theme);
  const save = async () => {
    const name = await askText({ title: t('theme.saveTitle'), value: t('theme.defaultName', { n: themes.length + 1 }), ok: t('common.save'), cancel: t('common.cancel') });
    if (name?.trim()) setPrefs({ myThemes: [...themes, { id: uid(), name: name.trim(), theme: { ...current } }] });
  };
  return (
    <div className="field">
      <label className="field-label">{t('theme.mine')}</label>
      <div className="my-themes">
        {themes.map((x) => (
          <div key={x.id} className="my-theme" title={x.name}>
            <button className="my-theme-apply" onClick={() => setTheme(x.theme)}>
              <img src={themePreview(x.theme)} alt="" />
              <span>{x.name}</span>
            </button>
            <button className="my-theme-remove" title={t('common.delete')} onClick={() => setPrefs({ myThemes: themes.filter((y) => y.id !== x.id) })}>
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
        <button className="btn small" onClick={() => void save()}>
          <Icon name="plus" size={13} />
          {t('theme.saveCurrent')}
        </button>
      </div>
    </div>
  );
}

/** How the window is laid out and behaves: everything the user may want their own way. */
function InterfacePage() {
  const t = useT();
  const prefs = usePrefs();
  const toggle = (key: keyof typeof prefs, label: I18nKey, hint?: I18nKey) => (
    <>
      <label className="field toggle-field">
        <span className="field-label">{t(label)}</span>
        <input type="checkbox" className="switch" checked={!!prefs[key]} onChange={(e) => setPrefs({ [key]: e.target.checked })} />
      </label>
      {hint && (
        <span className="panel-hint" style={{ margin: '-4px 0 0' }}>
          {t(hint)}
        </span>
      )}
    </>
  );
  const reset = () => {
    setPrefs({ simpleMode: false, layoutMirror: false, hiddenToolbar: [], hiddenTabs: [], timelineWheel: 'scroll', clipThumbs: true, clipWaves: true, transitionDuration: 0.6 });
    window.dispatchEvent(new Event('kadro:resetLayout'));
    toast(t('ui.resetDone'), 'success');
  };
  return (
    <>
      {toggle('simpleMode', 'simple.label', 'ui.simpleHint')}
      {toggle('layoutMirror', 'ui.mirror', 'ui.mirrorHint')}
      <div className="field">
        <label className="field-label">{t('ui.wheel')}</label>
        <select className="select" value={prefs.timelineWheel} onChange={(e) => setPrefs({ timelineWheel: e.target.value as typeof prefs.timelineWheel })}>
          <option value="scroll">{t('ui.wheel.scroll')}</option>
          <option value="time">{t('ui.wheel.time')}</option>
          <option value="zoom">{t('ui.wheel.zoom')}</option>
        </select>
      </div>
      {toggle('clipThumbs', 'ui.thumbs')}
      {toggle('clipWaves', 'ui.waves', 'ui.lightHint')}
      {toggle('openLastProject', 'ui.openLast')}
      <div className="field">
        <label className="field-label">{t('ui.transition')}</label>
        <select className="select" value={prefs.transitionDuration} onChange={(e) => setPrefs({ transitionDuration: Number(e.target.value) })}>
          {[0.2, 0.3, 0.5, 0.6, 0.8, 1, 1.5, 2].map((v) => (
            <option key={v} value={v}>
              {t('prefs.seconds', { n: v })}
            </option>
          ))}
        </select>
      </div>
      <span className="panel-hint" style={{ margin: 0 }}>
        {t('ui.customizeHint')}
      </span>
      <div className="row wrap">
        <button className="btn small" onClick={() => setPrefs({ hiddenToolbar: [] })} disabled={prefs.hiddenToolbar.length === 0}>
          {t('ui.showButtons')}
        </button>
        <button className="btn small" onClick={() => setPrefs({ hiddenTabs: [] })} disabled={prefs.hiddenTabs.length === 0}>
          {t('ui.showTabs')}
        </button>
        <button className="btn small" onClick={() => { openDialog(null); setTimeout(startTour, 200); }}>
          {t('tour.menu')}
        </button>
        <button className="btn small" onClick={reset}>
          {t('ui.reset')}
        </button>
      </div>
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

const KEY_SITES = { pexels: 'https://www.pexels.com/api/', pixabay: 'https://pixabay.com/api/docs/', shadertoy: 'https://www.shadertoy.com/myapps' } as const;
const KEY_NAMES = { pexels: 'Pexels', pixabay: 'Pixabay', shadertoy: 'Shadertoy' } as const;

function LibraryPage() {
  const t = useT();
  const keys = usePrefs((p) => p.libraryKeys);
  return (
    <>
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('prefs.libraryHint')}
      </p>
      {(['pexels', 'pixabay', 'shadertoy'] as const).map((k) => (
        <div className="field" key={k}>
          <label className="field-label">{t('prefs.apiKey', { name: KEY_NAMES[k] })}</label>
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

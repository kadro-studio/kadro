import { api } from '../api';
import { useFx } from '../engine/fx/registry';
import { fxDescription, fxName } from '../engine/fx/types';
import { useLang, useT } from '../i18n';
import { installMods, installModsViaDialog, uninstallMod, useMods, type ModEntry } from '../store/mods';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/controls';

const SAMPLE = `{
  "format": 1,
  "id": "me.soft-pulse",
  "kind": "effect",
  "name": "Soft pulse",
  "nameRu": "Мягкая пульсация",
  "author": "Me",
  "params": [
    { "id": "speed", "name": "Speed", "min": 0.1, "max": 10, "default": 2 }
  ],
  "glsl": "vec4 effect(vec2 uv) {\\n  vec4 c = src(uv);\\n  c.rgb *= 0.85 + 0.15 * sin(u_time * speed);\\n  return c;\\n}"
}`;

function ModRow({ entry, action }: { entry: ModEntry; action: React.ReactNode }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const compileError = useFx((s) => (entry.def ? s.errors[entry.def.id] : undefined));
  const def = entry.def;
  const description = def ? fxDescription(def, lang) : undefined;
  const kind = def?.kind === 'effect' ? t('mods.effect') : def?.kind === 'transition' ? t('mods.transition') : t('mods.generator');
  return (
    <div className="mod-row">
      <Icon name={def?.kind === 'transition' ? 'transition' : def?.kind === 'generator' ? 'shapes' : 'wand'} size={20} />
      <div className="mod-info">
        <div className="mod-name">{def ? fxName(def, lang) : entry.fileName}</div>
        <div className="mod-meta">
          {def ? `${kind}${def.author ? ` · ${def.author}` : ''}${def.version ? ` · v${def.version}` : ''}` : entry.fileName}
        </div>
        {description && <div className="mod-meta">{description}</div>}
        {(entry.error || compileError) && <div className="mod-error">{entry.error ?? compileError}</div>}
      </div>
      {action}
    </div>
  );
}

export function ModsPanel() {
  const t = useT();
  const installed = useMods((s) => s.installed);
  const catalog = useMods((s) => s.catalog);
  const installedNames = new Set(installed.map((m) => m.fileName.toLowerCase()));

  return (
    <>
      <p className="panel-hint">{t('mods.hint')}</p>
      <div className="panel-toolbar">
        <button className="btn primary" onClick={() => void installModsViaDialog()}>
          <Icon name="import" size={16} />
          {t('mods.install')}
        </button>
        <button className="btn" onClick={() => api.openModsFolder()}>
          <Icon name="folder" size={16} />
          {t('mods.folder')}
        </button>
      </div>

      <div className="mods-section-title">{t('mods.installedTitle', { n: installed.length })}</div>
      {installed.length === 0 && <p className="panel-hint">{t('mods.noneInstalled')}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {installed.map((m) => (
          <ModRow
            key={m.file}
            entry={m}
            action={<IconButton icon="trash" title={t('mods.remove')} onClick={() => void uninstallMod(m.file)} />}
          />
        ))}
      </div>

      {catalog.length > 0 && (
        <>
          <div className="mods-section-title">{t('mods.catalog')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {catalog.map((m) => {
              const has = installedNames.has(m.fileName.toLowerCase());
              return (
                <ModRow
                  key={m.file}
                  entry={m}
                  action={
                    <button className="btn small" disabled={has || !m.def} onClick={() => void installMods([m.file])}>
                      {has ? t('mods.isInstalled') : t('mods.get')}
                    </button>
                  }
                />
              );
            })}
          </div>
        </>
      )}

      <div className="mods-section-title">{t('mods.createTitle')}</div>
      <p className="panel-hint">{t('mods.createText')}</p>
      <div className="code-sample">{SAMPLE}</div>
    </>
  );
}

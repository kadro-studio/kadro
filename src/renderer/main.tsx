import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setLang, t } from './i18n';
import * as actions from './store/actions';
import * as editor from './store/editor';
import * as media from './store/media';
import * as enhance from './store/enhance';
import * as prefsStore from './store/prefs';
import * as tools from './store/tools';
import { player } from './engine/player';
import { runExport } from './engine/exporter';
import { Compositor } from './engine/gl';
import * as fxRegistry from './engine/fx/registry';
import { fxThumbnail } from './engine/fx/thumbs';
import * as mods from './store/mods';
import * as aiTasks from './ai/tasks';
import { aiDevice } from './ai/client';
import './styles.css';
import { applyTheme } from './store/theme';
import { usePrefs } from './store/prefs';
import { loadUserFonts } from './store/userFonts';
import * as presets from './store/presets';
import * as userFonts from './store/userFonts';
import * as keymap from './keymap';
import * as templates from './store/templates';

applyTheme(usePrefs.getState().theme);
void loadUserFonts();
editor.loadProject(actions.freshProject(t('top.untitled')), null);

// Automation/debug handle (used by scripts/smoke.mjs and handy in DevTools).
(window as unknown as { __vr: unknown }).__vr = { ...actions, ...editor, ...media, ...enhance, ...prefsStore, ...tools, ...presets, ...userFonts, ...keymap, player, runExport, setLang, Compositor };
(window as unknown as { __vrFx: unknown }).__vrFx = { ...fxRegistry, fxThumbnail };
(window as unknown as { __vrMods: unknown }).__vrMods = mods;
(window as unknown as { __vrAi: unknown }).__vrAi = { ...aiTasks, aiDevice };
(window as unknown as { __vrTpl: unknown }).__vrTpl = templates;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

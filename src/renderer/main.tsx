import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createProject } from './core/project';
import { setLang, t } from './i18n';
import * as actions from './store/actions';
import * as editor from './store/editor';
import * as media from './store/media';
import { player } from './engine/player';
import { runExport } from './engine/exporter';
import './styles.css';

editor.loadProject(createProject(t('top.untitled')), null);

// Automation/debug handle (used by scripts/smoke.mjs and handy in DevTools).
(window as unknown as { __vr: unknown }).__vr = { ...actions, ...editor, ...media, player, runExport, setLang };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

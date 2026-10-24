// Keyboard commands and their bindings. Defaults live here; the user's changes
// are stored in preferences as per-command overrides. A binding is a combo
// string like "Ctrl+Shift+KeyZ": modifiers in a fixed order plus the physical
// key code, so shortcuts work the same on any keyboard layout.
import { t, type I18nKey } from './i18n';
import { usePrefs } from './store/prefs';

export type CommandGroup = 'file' | 'edit' | 'playback' | 'timeline' | 'tools';

export interface CommandDef {
  id: string;
  group: CommandGroup;
  label: I18nKey;
  keys: string[];
}

const cmd = (group: CommandGroup, id: string, label: I18nKey, ...keys: string[]): CommandDef => ({ id, group, label, keys });

export const COMMANDS: CommandDef[] = [
  cmd('file', 'newProject', 'menu.new', 'Ctrl+KeyN'),
  cmd('file', 'openProject', 'menu.open', 'Ctrl+KeyO'),
  cmd('file', 'save', 'menu.save', 'Ctrl+KeyS'),
  cmd('file', 'saveAs', 'menu.saveAs', 'Ctrl+Shift+KeyS'),
  cmd('file', 'import', 'menu.import', 'Ctrl+KeyI'),
  cmd('file', 'export', 'menu.export', 'Ctrl+KeyE'),
  cmd('file', 'snapshot', 'menu.snapshot'),
  cmd('file', 'projectSettings', 'menu.projectSettings'),
  cmd('file', 'prefs', 'menu.prefs', 'Ctrl+Comma'),

  cmd('edit', 'undo', 'menu.undo', 'Ctrl+KeyZ'),
  cmd('edit', 'redo', 'menu.redo', 'Ctrl+Shift+KeyZ', 'Ctrl+KeyY'),
  cmd('edit', 'cut', 'menu.cut', 'Ctrl+KeyX'),
  cmd('edit', 'copy', 'menu.copy', 'Ctrl+KeyC'),
  cmd('edit', 'paste', 'menu.paste', 'Ctrl+KeyV'),
  cmd('edit', 'pasteAttrs', 'menu.pasteAttrs', 'Ctrl+Alt+KeyV'),
  cmd('edit', 'duplicate', 'menu.duplicate', 'Ctrl+KeyD'),
  cmd('edit', 'selectAll', 'menu.selectAll', 'Ctrl+KeyA'),
  cmd('edit', 'delete', 'menu.delete', 'Delete', 'Backspace'),
  cmd('edit', 'rippleDelete', 'menu.rippleDelete', 'Shift+Delete', 'Shift+Backspace'),
  cmd('edit', 'split', 'menu.split', 'KeyS', 'Ctrl+KeyK'),
  cmd('edit', 'splitAll', 'cmd.splitAll', 'Ctrl+Shift+KeyK'),
  cmd('edit', 'muteClips', 'cmd.muteClips'),
  cmd('edit', 'detachAudio', 'ctx.detachAudio'),
  cmd('edit', 'linkClips', 'link.link', 'Ctrl+KeyG'),
  cmd('edit', 'unlinkClips', 'link.unlink', 'Ctrl+Shift+KeyG'),
  cmd('edit', 'escape', 'cmd.escape', 'Escape'),

  cmd('playback', 'playPause', 'sc.playPause', 'Space', 'KeyK'),
  cmd('playback', 'play', 'cmd.play', 'KeyL'),
  cmd('playback', 'loop', 'cmd.loop', 'Ctrl+KeyL'),
  cmd('playback', 'frameBack', 'cmd.frameBack', 'ArrowLeft'),
  cmd('playback', 'frameForward', 'cmd.frameForward', 'ArrowRight'),
  cmd('playback', 'secondBack', 'cmd.secondBack', 'Shift+ArrowLeft'),
  cmd('playback', 'secondForward', 'cmd.secondForward', 'Shift+ArrowRight'),
  cmd('playback', 'prevEdit', 'cmd.prevEdit', 'ArrowUp'),
  cmd('playback', 'nextEdit', 'cmd.nextEdit', 'ArrowDown'),
  cmd('playback', 'goStart', 'cmd.goStart', 'Home'),
  cmd('playback', 'goEnd', 'cmd.goEnd', 'End'),

  cmd('timeline', 'nudgeLeft', 'cmd.nudgeLeft', 'Alt+ArrowLeft'),
  cmd('timeline', 'nudgeRight', 'cmd.nudgeRight', 'Alt+ArrowRight'),
  cmd('timeline', 'nudgeLeft10', 'cmd.nudgeLeft10', 'Alt+Shift+ArrowLeft'),
  cmd('timeline', 'nudgeRight10', 'cmd.nudgeRight10', 'Alt+Shift+ArrowRight'),
  cmd('timeline', 'marker', 'menu.addMarker', 'KeyM'),
  cmd('timeline', 'markIn', 'menu.markIn', 'KeyI'),
  cmd('timeline', 'markOut', 'menu.markOut', 'KeyO'),
  cmd('timeline', 'clearMarks', 'menu.clearMarks', 'Alt+KeyX'),
  cmd('timeline', 'snapping', 'sc.snap', 'KeyN'),
  cmd('timeline', 'linking', 'tl.linking'),
  cmd('timeline', 'zoomIn', 'menu.zoomIn', 'Equal', 'NumpadAdd', 'Ctrl+Equal', 'Ctrl+NumpadAdd'),
  cmd('timeline', 'zoomOut', 'menu.zoomOut', 'Minus', 'NumpadSubtract', 'Ctrl+Minus', 'Ctrl+NumpadSubtract'),
  cmd('timeline', 'zoomFit', 'menu.zoomFit', 'Backslash', 'Ctrl+Digit0'),
  cmd('timeline', 'freeze', 'tool.freeze', 'Shift+KeyF'),
  cmd('timeline', 'reverse', 'sc.reverse', 'Ctrl+KeyR'),
  cmd('timeline', 'toggleScopes', 'cmd.toggleScopes'),

  cmd('tools', 'toolSelect', 'cmd.toolSelect', 'KeyV'),
  cmd('tools', 'toolForward', 'cmd.toolForward', 'KeyA'),
  cmd('tools', 'toolRipple', 'cmd.toolRipple', 'KeyB'),
  cmd('tools', 'toolRoll', 'cmd.toolRoll', 'KeyR'),
  cmd('tools', 'toolSlip', 'cmd.toolSlip', 'KeyY'),
  cmd('tools', 'toolSlide', 'cmd.toolSlide', 'KeyU'),
  cmd('tools', 'toolRazor', 'cmd.toolRazor', 'KeyC'),
];

export const COMMAND_GROUPS: CommandGroup[] = ['file', 'edit', 'playback', 'timeline', 'tools'];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

/** Combos the app itself uses (developer tools) and that cannot be assigned. */
const RESERVED = new Set(['F12', 'Ctrl+Shift+KeyI']);

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

/** Combo for a key press, or null for a bare modifier. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code) || !e.code) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code);
  return parts.join('+');
}

export function isReservedCombo(combo: string): boolean {
  return RESERVED.has(combo);
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Equal: '=',
  Minus: '-',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num −',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  NumpadEnter: 'Num Enter',
  Backslash: '\\',
  Slash: '/',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Delete: 'Del',
  Insert: 'Ins',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

function keyName(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) return code.startsWith('Numpad') ? `Num ${digit[1]}` : digit[1];
  if (code === 'Space') return t('key.space');
  return KEY_NAMES[code] ?? code;
}

/** Human-readable combo, e.g. "Ctrl+Shift+Z". */
export function comboLabel(combo: string): string {
  const parts = combo.split('+');
  const code = parts.pop() ?? '';
  return [...parts, keyName(code)].join('+');
}

/** Current bindings of a command (user override or default). */
export function bindingsOf(id: string, keymap = usePrefs.getState().keymap): string[] {
  return keymap[id] ?? BY_ID.get(id)?.keys ?? [];
}

let indexFor: Record<string, string[]> | null = null;
let index = new Map<string, string>();

/** Command bound to a combo, if any. */
export function commandFor(combo: string): string | null {
  const keymap = usePrefs.getState().keymap;
  if (keymap !== indexFor) {
    index = new Map();
    for (const c of COMMANDS) for (const k of bindingsOf(c.id, keymap)) if (!index.has(k)) index.set(k, c.id);
    indexFor = keymap;
  }
  return index.get(combo) ?? null;
}

/** First binding of a command for menus and tooltips ("" when unbound). */
export function shortcutLabel(id: string): string {
  const k = bindingsOf(id)[0];
  return k ? comboLabel(k) : '';
}

/** Tooltip text with the command's shortcut appended. */
export function withShortcut(text: string, id: string): string {
  const k = shortcutLabel(id);
  return k ? `${text} (${k})` : text;
}

export function commandLabel(id: string): string {
  const c = BY_ID.get(id);
  return c ? t(c.label) : id;
}

/**
 * Binds a combo to a command. A command that already used the combo loses it;
 * its id is returned so the caller can tell the user.
 */
export function assignCombo(id: string, combo: string): string | null {
  const keymap = { ...usePrefs.getState().keymap };
  let taken: string | null = null;
  for (const c of COMMANDS) {
    if (c.id === id) continue;
    const keys = bindingsOf(c.id, keymap);
    if (keys.includes(combo)) {
      keymap[c.id] = keys.filter((k) => k !== combo);
      taken = c.id;
    }
  }
  const own = bindingsOf(id, keymap);
  if (!own.includes(combo)) keymap[id] = [...own, combo];
  usePrefs.setState({ keymap: normalize(keymap) });
  return taken;
}

export function removeCombo(id: string, combo: string): void {
  const keymap = { ...usePrefs.getState().keymap };
  keymap[id] = bindingsOf(id, keymap).filter((k) => k !== combo);
  usePrefs.setState({ keymap: normalize(keymap) });
}

export function resetCommand(id: string): void {
  const keymap = { ...usePrefs.getState().keymap };
  delete keymap[id];
  // Taking the default back may collide with another command's custom binding.
  for (const k of BY_ID.get(id)?.keys ?? []) {
    for (const c of COMMANDS) {
      if (c.id !== id && keymap[c.id]?.includes(k)) keymap[c.id] = keymap[c.id].filter((x) => x !== k);
    }
  }
  usePrefs.setState({ keymap: normalize(keymap) });
}

export function resetAllCommands(): void {
  usePrefs.setState({ keymap: {} });
}

export function isCustomized(id: string): boolean {
  return usePrefs.getState().keymap[id] !== undefined;
}

/** Drops overrides that equal the defaults, so later default changes still apply. */
function normalize(keymap: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, keys] of Object.entries(keymap)) {
    const def = BY_ID.get(id);
    if (!def) continue;
    if (keys.length === def.keys.length && keys.every((k, i) => k === def.keys[i])) continue;
    out[id] = keys;
  }
  return out;
}

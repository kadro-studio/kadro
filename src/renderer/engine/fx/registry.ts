// All effect/transition definitions known to this session: built-ins, installed
// mods and definitions embedded in the open project.
import { create } from 'zustand';
import { BUILTIN_EFFECTS, BUILTIN_TRANSITIONS } from './builtins';
import { BUILTIN_GENERATORS } from './generators';
import type { FxDef, FxKind } from './types';

interface FxState {
  defs: Record<string, FxDef>;
  /** Compile errors reported by the compositor, by definition id. */
  errors: Record<string, string>;
}

function builtins(): Record<string, FxDef> {
  return Object.fromEntries([...BUILTIN_EFFECTS, ...BUILTIN_TRANSITIONS, ...BUILTIN_GENERATORS].map((d) => [d.id, d]));
}

export const useFx = create<FxState>(() => ({ defs: builtins(), errors: {} }));

export function getFx(id: string): FxDef | undefined {
  return useFx.getState().defs[id];
}

export function fxOfKind(defs: Record<string, FxDef>, kind: FxKind): FxDef[] {
  return Object.values(defs).filter((d) => d.kind === kind);
}

/** Replaces all definitions of one source (installed mods are re-listed as a whole). */
export function setFxSource(source: 'mod' | 'project', list: FxDef[]): void {
  useFx.setState((s) => {
    const defs: Record<string, FxDef> = {};
    for (const d of Object.values(s.defs)) if (d.source !== source) defs[d.id] = d;
    for (const d of list) {
      // Built-ins and installed mods win over copies embedded in projects.
      const existing = defs[d.id];
      if (existing && (existing.source === 'builtin' || (existing.source === 'mod' && source === 'project'))) continue;
      defs[d.id] = { ...d, source };
    }
    return { defs };
  });
}

export function reportFxError(id: string, message: string): void {
  if (useFx.getState().errors[id] === message) return;
  useFx.setState((s) => ({ errors: { ...s.errors, [id]: message } }));
}

/** Parameter values of a definition in declaration order, filled with defaults. */
export function paramValues(def: FxDef, values: Record<string, number> | undefined): number[] {
  return def.params.map((p) => {
    const v = values?.[p.id];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
  });
}

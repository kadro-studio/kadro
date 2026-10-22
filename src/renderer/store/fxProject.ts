// Keeps projects that use mod effects portable: the definitions they use are
// saved inside the project file and registered again when it is opened.
import { getFx, setFxSource } from '../engine/fx/registry';
import { validateFxDef, type FxDef } from '../engine/fx/types';
import type { EmbeddedFx, Project } from '../core/types';

export function usedFxIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const tr of p.tracks) {
    for (const c of tr.clips) {
      for (const e of c.effects) ids.add(e.type);
      if (c.transition.type !== 'none') ids.add(c.transition.type);
      if (c.overlay) ids.add(c.overlay.id);
    }
  }
  return ids;
}

/** Project copy carrying the non-built-in definitions it uses. */
export function withEmbeddedFx(p: Project): Project {
  const fx: EmbeddedFx[] = [];
  for (const id of usedFxIds(p)) {
    const def = getFx(id);
    if (!def || def.source === 'builtin') continue;
    const { source: _source, ...rest } = def;
    fx.push(rest);
  }
  return { ...p, fx };
}

/** Registers definitions embedded in a loaded project (mods the user may not have). */
export function registerProjectFx(p: Project): void {
  const defs: FxDef[] = [];
  for (const raw of p.fx ?? []) {
    if (validateFxDef(raw)) continue;
    defs.push({ ...(raw as EmbeddedFx), source: 'project' });
  }
  setFxSource('project', defs);
}

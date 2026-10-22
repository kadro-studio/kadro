// Shader effects and transitions. Built-ins and user mods share this format.
//
// Effect GLSL defines   vec4 effect(vec2 uv)       and may call src(uv).
// Transition GLSL defines vec4 transition(vec2 uv) and may call fromColor(uv),
// toColor(uv); `progress` (0..1) and `ratio` (width / height) are available.
// In both, uv (0,0) is the bottom-left corner, each parameter is available by
// its id, and helpers rand(vec2), luma(vec3) and PI are predefined. Effects
// also get u_size (source pixels) and u_time (seconds since the clip started).

export type FxKind = 'effect' | 'transition';

export interface FxParam {
  id: string;
  name: string;
  nameRu?: string;
  min: number;
  max: number;
  default: number;
  step?: number;
}

export interface FxDef {
  id: string;
  kind: FxKind;
  name: string;
  nameRu?: string;
  description?: string;
  author?: string;
  version?: string;
  params: FxParam[];
  glsl: string;
  /** Where the definition came from (built-ins are not saved into projects). */
  source: 'builtin' | 'mod' | 'project';
}

export const MAX_FX_PARAMS = 8;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
const RESERVED = new Set([
  'uv', 'progress', 'ratio', 'src', 'fromColor', 'toColor', 'effect', 'transition', 'rand', 'luma', 'PI',
  'half', 'sample', 'input', 'output', 'filter', 'texture', 'main', 'common', 'partition', 'active',
]);

/** Validates an untrusted definition (mods, project files). Returns an error or null. */
export function validateFxDef(raw: unknown): string | null {
  const d = raw as Partial<FxDef> | null;
  if (!d || typeof d !== 'object') return 'not an object';
  if (typeof d.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(d.id)) return 'invalid id';
  if (d.kind !== 'effect' && d.kind !== 'transition') return 'kind must be "effect" or "transition"';
  if (typeof d.name !== 'string' || !d.name.trim()) return 'missing name';
  if (typeof d.glsl !== 'string' || d.glsl.length > 20000) return 'missing or too large glsl';
  const fn = d.kind === 'effect' ? /vec4\s+effect\s*\(\s*vec2\s+\w+\s*\)/ : /vec4\s+transition\s*\(\s*vec2\s+\w+\s*\)/;
  if (!fn.test(d.glsl)) return d.kind === 'effect' ? 'glsl must define vec4 effect(vec2 uv)' : 'glsl must define vec4 transition(vec2 uv)';
  if (/#\s*(version|extension)/.test(d.glsl)) return '#version/#extension are not allowed';
  const params = d.params ?? [];
  if (!Array.isArray(params) || params.length > MAX_FX_PARAMS) return `at most ${MAX_FX_PARAMS} params`;
  for (const p of params) {
    if (!p || typeof p.id !== 'string' || !IDENT.test(p.id) || RESERVED.has(p.id)) return `invalid param id ${p?.id}`;
    if (![p.min, p.max, p.default].every((n) => typeof n === 'number' && Number.isFinite(n)) || p.min > p.max) return `invalid range for ${p.id}`;
  }
  return null;
}

/** Display name in the current language. */
export function fxName(def: { name: string; nameRu?: string }, lang: string): string {
  return lang === 'ru' && def.nameRu ? def.nameRu : def.name;
}

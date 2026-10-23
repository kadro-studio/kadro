// Shader effects and transitions. Built-ins and user mods share this format.
//
// Effect GLSL defines   vec4 effect(vec2 uv)       and may call src(uv).
// Transition GLSL defines vec4 transition(vec2 uv) and may call fromColor(uv),
// toColor(uv); `progress` (0..1) and `ratio` (width / height) are available.
// In both, uv (0,0) is the bottom-left corner, each parameter is available by
// its id, and helpers rand(vec2), luma(vec3) and PI are predefined. Effects
// also get u_size (source pixels) and u_time (seconds since the clip started).
// Generator GLSL defines vec4 generate(vec2 uv) and draws an animated element
// from nothing (overlays, backgrounds); it gets `time`, `ratio`, u_size and the
// element's two colours as `colorA` / `colorB`, and returns straight RGBA.

export type FxKind = 'effect' | 'transition' | 'generator';

export interface FxParam {
  id: string;
  name: string;
  nameRu?: string;
  nameUk?: string;
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
  descriptionRu?: string;
  descriptionUk?: string;
  author?: string;
  version?: string;
  /** Licence and original page of imported definitions (e.g. Shadertoy). */
  license?: string;
  sourceUrl?: string;
  params: FxParam[];
  glsl: string;
  /** Where the definition came from (built-ins are not saved into projects). */
  source: 'builtin' | 'mod' | 'project';
  /** Generators: default blend mode, colours and panel section. */
  blend?: string;
  colors?: [string, string];
  category?: 'overlay' | 'background';
  nameUk?: string;
}

export const MAX_FX_PARAMS = 8;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
const RESERVED = new Set([
  'uv', 'progress', 'ratio', 'src', 'fromColor', 'toColor', 'effect', 'transition', 'rand', 'luma', 'PI',
  'half', 'sample', 'input', 'output', 'filter', 'texture', 'main', 'common', 'partition', 'active',
  'generate', 'time', 'colorA', 'colorB',
]);

/** Validates an untrusted definition (mods, project files). Returns an error or null. */
export function validateFxDef(raw: unknown): string | null {
  const d = raw as Partial<FxDef> | null;
  if (!d || typeof d !== 'object') return 'not an object';
  if (typeof d.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(d.id)) return 'invalid id';
  if (d.kind !== 'effect' && d.kind !== 'transition' && d.kind !== 'generator') return 'kind must be "effect", "transition" or "generator"';
  if (typeof d.name !== 'string' || !d.name.trim()) return 'missing name';
  if (typeof d.glsl !== 'string' || d.glsl.length > 64000) return 'missing or too large glsl';
  const fnName = d.kind === 'effect' ? 'effect' : d.kind === 'transition' ? 'transition' : 'generate';
  if (!new RegExp(`vec4\\s+${fnName}\\s*\\(\\s*vec2\\s+\\w+\\s*\\)`).test(d.glsl)) return `glsl must define vec4 ${fnName}(vec2 uv)`;
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
export function fxName(def: { name: string; nameRu?: string; nameUk?: string }, lang: string): string {
  if (lang === 'uk') return def.nameUk ?? def.nameRu ?? def.name;
  return lang === 'ru' && def.nameRu ? def.nameRu : def.name;
}

/** Description in the current language, falling back like fxName. */
export function fxDescription(def: { description?: string; descriptionRu?: string; descriptionUk?: string }, lang: string): string | undefined {
  if (lang === 'uk') return def.descriptionUk ?? def.descriptionRu ?? def.description;
  return lang === 'ru' && def.descriptionRu ? def.descriptionRu : def.description;
}

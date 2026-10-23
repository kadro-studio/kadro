// Converts a Shadertoy "Image" shader into a Kadro effect or element (generator).
// Shadertoy code defines mainImage(out vec4, in vec2) and reads iTime,
// iResolution and iChannel0..3. Shaders that sample iChannel0 become effects
// (the clip is the channel); others draw on their own and become elements.
// Buffers, extra channels, keyboard and sound inputs have no equivalent.

export type ShadertoyKind = 'auto' | 'effect' | 'generator';

export interface ShadertoyResult {
  kind: 'effect' | 'generator';
  glsl: string;
}

/** Names our shader prelude defines (functions or macros) that user code must not reuse. */
const RESERVED = [
  'rand', 'luma', 'src', 'time', 'ratio', 'colorA', 'colorB', 'progress', 'fromColor', 'toColor',
  'effect', 'generate', 'transition', 'outColor', 'v_uv',
];

const UNIFORMS = `vec3 iResolution;
float iTime;
float iTimeDelta;
float iFrameRate;
int iFrame;
vec4 iMouse;
vec4 iDate;
float iSampleRate;
vec3 iChannelResolution[4];
float iChannelTime[4];
`;

/** Shader id from a shadertoy.com link (or the bare id). */
export function shadertoyId(input: string): string | null {
  const s = input.trim();
  const m = /shadertoy\.com\/(?:view|embed)\/([A-Za-z0-9]{4,12})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9]{4,12}$/.test(s) ? s : null;
}

export class ShadertoyError extends Error {
  constructor(readonly code: 'noMain' | 'channels' | 'channel0' | 'sound') {
    super(code);
  }
}

export function convertShadertoy(source: string, kind: ShadertoyKind, transparentBlack = false): ShadertoyResult {
  let code = source.replace(/\r\n?/g, '\n');
  if (/\bmainSound\s*\(/.test(code) && !/\bmainImage\s*\(/.test(code)) throw new ShadertoyError('sound');
  if (!/\bvoid\s+mainImage\s*\(/.test(code)) throw new ShadertoyError('noMain');
  if (/\biChannel[1-3]\b/.test(code)) throw new ShadertoyError('channels');
  const usesChannel0 = /\biChannel0\b/.test(code);
  const target: 'effect' | 'generator' = kind === 'auto' ? (usesChannel0 ? 'effect' : 'generator') : kind;
  if (target === 'generator' && usesChannel0) throw new ShadertoyError('channel0');

  // Lines the prelude already provides or forbids.
  code = code
    .split('\n')
    .filter((l) => !/^\s*#\s*(version|extension)\b/.test(l))
    .filter((l) => !/^\s*#\s*define\s+PI\b/.test(l))
    .filter((l) => !/^\s*(const\s+)?float\s+PI\s*=/.test(l))
    .join('\n');
  code = code.replace(new RegExp(`\\b(${RESERVED.join('|')})\\b`, 'g'), 'st_$1');
  code = code.replace(/\bmainImage\b/g, 'st_mainImage');
  // The clip stands in for iChannel0.
  code = code
    .replace(/\b(?:texture|texture2D|textureLod|textureGrad)\s*\(\s*iChannel0\s*,/g, 'st_tex0(')
    .replace(/\btexelFetch\s*\(\s*iChannel0\s*,/g, 'st_fetch0(')
    .replace(/\btextureSize\s*\(\s*iChannel0\s*,\s*[^)]*\)/g, 'ivec2(u_size)');

  const setup = `  iResolution = vec3(u_size, 1.0);
  iTime = u_time;
  iTimeDelta = 1.0 / 30.0;
  iFrameRate = 30.0;
  iFrame = int(u_time * 30.0);
  iMouse = vec4(0.0);
  iDate = vec4(2026.0, 0.0, 1.0, u_time);
  iSampleRate = 44100.0;
  for (int i = 0; i < 4; i++) {
    iChannelResolution[i] = vec3(u_size, 1.0);
    iChannelTime[i] = u_time;
  }`;

  if (target === 'effect') {
    const glsl = `// Imported from Shadertoy.
${UNIFORMS}vec4 st_tex0(vec2 p) { return src(p); }
vec4 st_tex0(vec2 p, float lod) { return src(p); }
vec4 st_tex0(vec2 p, vec2 dx, vec2 dy) { return src(p); }
vec4 st_fetch0(ivec2 p, int lod) { return src((vec2(p) + 0.5) / u_size); }
#line 1
${code}
vec4 effect(vec2 uv) {
${setup}
  vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
  st_mainImage(col, uv * u_size);
  return vec4(clamp(col.rgb, 0.0, 1.0), src(uv).a);
}`;
    return { kind: 'effect', glsl };
  }
  // Elements: black can become transparent, so glows and particles overlay the video.
  const out = transparentBlack
    ? `  float a = max(c.r, max(c.g, c.b));
  return vec4(c / max(a, 1e-4), a);`
    : '  return vec4(c, 1.0);';
  const glsl = `// Imported from Shadertoy.
${UNIFORMS}#line 1
${code}
vec4 generate(vec2 uv) {
${setup}
  vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
  st_mainImage(col, uv * u_size);
  vec3 c = clamp(col.rgb, 0.0, 1.0);
${out}
}`;
  return { kind: 'generator', glsl };
}

/** Licence named in the code's comments; Shadertoy's default otherwise. */
export function shadertoyLicense(code: string): string {
  const comments = (code.match(/\/\/.*|\/\*[\s\S]*?\*\//g) ?? []).join('\n');
  const m = /(CC0|MIT|Apache[- ]2\.0|BSD|Unlicense|public domain|CC[- ]BY(?:[- ](?:NC|SA|ND))*(?:[- ]\d\.\d)?|Creative Commons[^\n.]*)/i.exec(comments);
  return m ? m[1].trim() : 'CC BY-NC-SA 3.0';
}

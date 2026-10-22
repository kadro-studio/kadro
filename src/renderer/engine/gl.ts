// WebGL2 compositor. Draws resolved layers (see core/scene.ts) with transforms,
// crop, colour grading, blur, chroma key, blend modes and transition masks.
// The same code renders the live preview and exported frames.
import type { LayerPlan } from '../core/scene';
import type { Size } from '../core/geometry';
import type { Adjust, BlendMode, ChromaKey } from '../core/types';
import { getFx, paramValues, reportFxError } from './fx/registry';
import { MAX_FX_PARAMS, type FxDef } from './fx/types';

export type YuvMatrix = 'bt601' | 'bt709' | 'bt2020';

export interface TexSource {
  /** Texture cache key. */
  key: string;
  /** 'pixels' is RGBA; 'yuv' is planar 8-bit 4:2:0, limited range; 'adjust' is the frame drawn so far. */
  kind: 'element' | 'pixels' | 'yuv' | 'color' | 'adjust';
  el?: TexImageSource;
  data?: Uint8Array;
  width: number;
  height: number;
  /** Re-uploaded when it changes; 'dynamic' uploads on every frame (video). */
  version: string | number;
  color?: [number, number, number, number];
  matrix?: YuvMatrix;
  /** 'yuv' data also carries a full-resolution alpha plane. */
  alpha?: boolean;
}

/** Layout of exported frame data. */
export type ReadbackFormat = 'yuv420p' | 'rgba';

export interface ReadbackHandle {
  format: ReadbackFormat;
  slot: number;
  size: number;
  width: number;
  height: number;
  sync: WebGLSync;
}

const KR_KB: Record<YuvMatrix, [number, number]> = {
  bt601: [0.299, 0.114],
  bt709: [0.2126, 0.0722],
  bt2020: [0.2627, 0.0593],
};

/** GPU YUV readback needs whole 4-byte texels per chroma row. */
export function canReadYuv(width: number, height: number): boolean {
  return width % 8 === 0 && height % 2 === 0;
}

export interface DrawItem {
  plan: LayerPlan;
  content: Size;
  source: TexSource;
  adjust: Adjust;
  /** Lift/gamma/gain offsets per channel, or null when neutral. */
  wheels: { lift: [number, number, number]; gamma: [number, number, number]; gain: [number, number, number] } | null;
  colorize: [number, number, number, number] | null;
  chroma: ChromaKey;
  blend: BlendMode;
  /** Enabled shader effects, applied to the source in order. */
  effects: { def: FxDef; params: number[] }[];
  /** 3D LUT (RGB floats, red fastest) and its strength 0..1. */
  lut: { key: string; size: number; data: Float32Array; amount: number } | null;
  /** Seconds since the clip started (animated effects). */
  time: number;
}

export interface FrameInfo {
  width: number;
  height: number;
  background: string;
}

const VS = `#version 300 es
in vec2 a_pos;
uniform mat3 u_matrix;
uniform vec4 u_uvRect;
uniform vec4 u_localRect;
out vec2 v_uv;
out vec2 v_local;
void main() {
  vec3 p = u_matrix * vec3(a_pos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  v_uv = mix(u_uvRect.xy, u_uvRect.zw, a_pos);
  // Position within the uncropped, unflipped content (0,0 = top-left), for shape masks.
  v_local = mix(u_localRect.xy, u_localRect.zw, a_pos);
}`;

const FS = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_uv;
in vec2 v_local;
out vec4 outColor;

uniform sampler3D u_lut;
uniform vec2 u_lutParams;  // size, amount
uniform int u_shape;       // 0 none, 1 rectangle, 2 ellipse
uniform vec4 u_shapeA;     // centre x, centre y, width, height (content fractions)
uniform vec4 u_shapeB;     // rotation (rad), feather, invert, content aspect

uniform sampler2D u_tex;
uniform int u_solid;
uniform vec4 u_color;
uniform vec2 u_texel;
uniform float u_blur;
uniform float u_lod;
uniform float u_sharpen;
uniform float u_opacity;
uniform vec4 u_adj1;      // exposure (stops), brightness, contrast, saturation
uniform vec4 u_adj2;      // temperature, tint, hue (rad), vignette
uniform vec2 u_adj3;      // highlights, shadows
uniform vec3 u_lift;      // colour wheels (0 = neutral)
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec4 u_colorize;  // tone rgb, amount
uniform vec4 u_fade;      // rgb, amount
uniform int u_keyOn;
uniform vec3 u_keyColor;
uniform vec3 u_keyParams; // similarity, smoothness, spill
uniform int u_maskType;
uniform vec4 u_mask;
uniform vec2 u_resolution;
uniform float u_aspect;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec4 sampleSource(vec2 uv) {
  if (u_blur < 0.5) {
    vec4 c = texture(u_tex, uv);
    if (u_sharpen > 0.0) {
      vec3 n = texture(u_tex, uv + vec2(u_texel.x, 0.0)).rgb
             + texture(u_tex, uv - vec2(u_texel.x, 0.0)).rgb
             + texture(u_tex, uv + vec2(0.0, u_texel.y)).rgb
             + texture(u_tex, uv - vec2(0.0, u_texel.y)).rgb;
      c.rgb += u_sharpen * (c.rgb - n * 0.25);
    }
    return c;
  }
  // Golden-angle spiral sampling over a disc, premultiplied accumulation.
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 48; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 48.0);
    float a = fi * 2.39996323;
    vec2 off = vec2(cos(a), sin(a)) * r * u_blur * u_texel;
    vec4 s = textureLod(u_tex, uv + off, u_lod);
    float w = 1.0 - 0.6 * r;
    acc += vec4(s.rgb * s.a, s.a) * w;
    wsum += w;
  }
  acc /= wsum;
  return acc.a > 0.0001 ? vec4(acc.rgb / acc.a, acc.a) : vec4(0.0);
}

vec3 hueRotate(vec3 c, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float h = atan(yiq.z, yiq.y) + a;
  float chroma = length(yiq.yz);
  return toRGB * vec3(yiq.x, chroma * cos(h), chroma * sin(h));
}

vec3 grade(vec3 c) {
  c *= exp2(u_adj1.x);
  c += u_adj1.y;
  c.r += u_adj2.x * 0.12;
  c.b -= u_adj2.x * 0.12;
  c.g -= u_adj2.y * 0.10;
  c.rb += u_adj2.y * 0.03;
  // Lift raises shadows, gain scales highlights, gamma bends the midtones.
  c = c + u_lift * (1.0 - clamp(c, 0.0, 1.0));
  c = c * (1.0 + u_gain);
  c = pow(max(c, 0.0), 1.0 / max(vec3(0.1), 1.0 + u_gamma));
  float l = dot(c, LUMA);
  c += u_adj3.y * 0.25 * (1.0 - smoothstep(0.0, 0.55, l));
  c += u_adj3.x * 0.25 * smoothstep(0.45, 1.0, l);
  c = (c - 0.5) * max(0.0, 1.0 + u_adj1.z) + 0.5;
  l = dot(c, LUMA);
  c = mix(vec3(l), c, max(0.0, 1.0 + u_adj1.w));
  if (abs(u_adj2.z) > 0.0001) c = hueRotate(c, u_adj2.z);
  if (u_colorize.a > 0.0) {
    vec3 tone = u_colorize.rgb / max(0.001, dot(u_colorize.rgb, LUMA));
    c = mix(c, dot(c, LUMA) * tone, u_colorize.a);
  }
  return c;
}

vec2 cbcr(vec3 c) {
  return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
}

float shapeMask() {
  if (u_shape == 0) return 1.0;
  float aspect = u_shapeB.w;
  vec2 p = (v_local - u_shapeA.xy) * vec2(aspect, 1.0);
  float c = cos(-u_shapeB.x);
  float s = sin(-u_shapeB.x);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec2 q = p / max(vec2(1e-4), u_shapeA.zw * 0.5 * vec2(aspect, 1.0));
  float d = u_shape == 1 ? max(abs(q.x), abs(q.y)) : length(q);
  float f = max(1e-3, u_shapeB.y);
  float m = 1.0 - smoothstep(1.0 - f, 1.0 + f, d);
  return u_shapeB.z > 0.5 ? 1.0 - m : m;
}

float maskValue() {
  if (u_maskType == 0) return 1.0;
  vec2 fp = vec2(gl_FragCoord.x / u_resolution.x, 1.0 - gl_FragCoord.y / u_resolution.y);
  if (u_maskType == 1) {
    float v = dot(fp, u_mask.xy);
    return 1.0 - smoothstep(u_mask.z - u_mask.w, u_mask.z + u_mask.w, v);
  }
  if (u_maskType == 2) {
    float r = length((fp - u_mask.xy) * vec2(u_aspect, 1.0));
    return 1.0 - smoothstep(u_mask.z - u_mask.w, u_mask.z, r);
  }
  vec2 d = fp - u_mask.xy;
  float ang = atan(d.x, -d.y);
  float a01 = ang / 6.2831853 + (ang < 0.0 ? 1.0 : 0.0);
  return 1.0 - smoothstep(u_mask.z - u_mask.w, u_mask.z, a01);
}

void main() {
  vec4 src = u_solid == 1 ? u_color : sampleSource(v_uv);
  vec3 c = src.rgb;
  float alpha = src.a;
  if (u_keyOn == 1) {
    float d = distance(cbcr(c), cbcr(u_keyColor));
    alpha *= smoothstep(u_keyParams.x, u_keyParams.x + u_keyParams.y, d);
    float spill = (1.0 - smoothstep(u_keyParams.x, u_keyParams.x + u_keyParams.y + 0.2, d)) * u_keyParams.z;
    c = mix(c, vec3(dot(c, LUMA)), spill);
  }
  c = grade(c);
  if (u_lutParams.y > 0.0) {
    float n = u_lutParams.x;
    vec3 lc = texture(u_lut, clamp(c, 0.0, 1.0) * ((n - 1.0) / n) + 0.5 / n).rgb;
    c = mix(c, lc, u_lutParams.y);
  }
  if (u_adj2.w != 0.0) {
    float d = length(v_uv - 0.5) * 1.4142;
    c *= 1.0 - u_adj2.w * smoothstep(0.3, 1.0, d);
  }
  if (u_fade.a > 0.0) c = mix(c, u_fade.rgb, u_fade.a);
  c = clamp(c, 0.0, 1.0);
  alpha *= u_opacity * maskValue() * shapeMask();
  outColor = vec4(c * alpha, alpha);
}`;

// Fullscreen passes: v_uv (0,0) is texture row 0, which holds the image top.
const FULL_VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
  v_uv = a_pos;
}`;

// Planar YUV 4:2:0 (limited range) -> RGBA.
const YUV_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_y;
uniform sampler2D u_u;
uniform sampler2D u_v;
uniform sampler2D u_a;
uniform int u_hasA;
uniform vec2 u_k;
void main() {
  // MPEG-4/H.264 chroma is co-sited with even luma columns ("left"), a quarter
  // chroma texel left of where plain bilinear sampling would look.
  vec2 cuv = v_uv + vec2(0.25 / float(textureSize(u_u, 0).x), 0.0);
  float Y = (texture(u_y, v_uv).r - 16.0 / 255.0) * (255.0 / 219.0);
  float U = (texture(u_u, cuv).r - 128.0 / 255.0) * (255.0 / 224.0);
  float V = (texture(u_v, cuv).r - 128.0 / 255.0) * (255.0 / 224.0);
  float kr = u_k.x;
  float kb = u_k.y;
  float R = Y + 2.0 * (1.0 - kr) * V;
  float B = Y + 2.0 * (1.0 - kb) * U;
  float G = (Y - kr * R - kb * B) / (1.0 - kr - kb);
  float A = u_hasA == 1 ? texture(u_a, v_uv).r : 1.0;
  outColor = vec4(clamp(vec3(R, G, B), 0.0, 1.0), A);
}`;

// Frame (bottom-up copy of the canvas) -> planar YUV 4:2:0, BT.709 limited range,
// packed four bytes per RGBA texel so one readPixels returns the exact
// Y, U, V plane layout ffmpeg expects (top row first).
const PACK_FS = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;
uniform sampler2D u_frame;
uniform ivec2 u_size;
const vec3 KY = vec3(0.2126, 0.7152, 0.0722);
const vec3 KU = vec3(-0.114572, -0.385428, 0.5);
const vec3 KV = vec3(0.5, -0.454153, -0.045847);
vec3 px(int x, int y) {
  return texelFetch(u_frame, ivec2(x, u_size.y - 1 - y), 0).rgb;
}
void main() {
  int W = u_size.x;
  int H = u_size.y;
  int base = (int(gl_FragCoord.y) * (W / 4) + int(gl_FragCoord.x)) * 4;
  int ySize = W * H;
  int cSize = ySize / 4;
  int cw = W / 2;
  vec4 o;
  for (int k = 0; k < 4; k++) {
    int b = base + k;
    float v;
    if (b < ySize) {
      v = (16.0 + 219.0 * dot(px(b % W, b / W), KY)) / 255.0;
    } else {
      int cb = b - ySize;
      bool isV = cb >= cSize;
      if (isV) cb -= cSize;
      // Left-sited chroma: [1 2 1]/4 across columns centred on the even luma
      // column, averaged over the two rows.
      int cx = (cb % cw) * 2;
      int cy = (cb / cw) * 2;
      int xl = max(cx - 1, 0);
      vec3 c = (px(xl, cy) + 2.0 * px(cx, cy) + px(cx + 1, cy)
              + px(xl, cy + 1) + 2.0 * px(cx, cy + 1) + px(cx + 1, cy + 1)) * 0.125;
      v = (128.0 + 224.0 * dot(c, isV ? KV : KU)) / 255.0;
    }
    o[k] = v;
  }
  outColor = o;
}`;

// Shared by effect and transition programs (see engine/fx/types.ts for the mod API).
const FX_HELPERS = `
#define PI 3.141592653589793
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/** Full fragment shader for an effect or transition definition. */
function fxSource(def: FxDef): string {
  const defines = def.params.map((p, i) => `#define ${p.id} u_p[${i}]`).join('\n');
  const head = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_p[${MAX_FX_PARAMS}];
${FX_HELPERS}`;
  if (def.kind === 'effect') {
    // Effects see uv with y pointing up, like transitions.
    return `${head}
uniform sampler2D u_src;
uniform vec2 u_size;
uniform float u_time;
uniform int u_flipSrc;
vec4 src(vec2 uv) { return texture(u_src, vec2(uv.x, u_flipSrc == 1 ? uv.y : 1.0 - uv.y)); }
${defines}
#line 1
${def.glsl}
void main() { outColor = effect(vec2(v_uv.x, u_flipSrc == 1 ? v_uv.y : 1.0 - v_uv.y)); }`;
  }
  return `${head}
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform float u_ratio;
vec4 fromColor(vec2 uv) { return texture(u_from, uv); }
vec4 toColor(vec2 uv) { return texture(u_to, uv); }
#define progress u_progress
#define ratio u_ratio
#define getFromColor fromColor
#define getToColor toColor
${defines}
#line 1
${def.glsl}
void main() { outColor = transition(v_uv); }`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface FxProgram {
  prog: WebGLProgram;
  src: WebGLUniformLocation | null;
  flip: WebGLUniformLocation | null;
  size: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  params: WebGLUniformLocation | null;
  from: WebGLUniformLocation | null;
  to: WebGLUniformLocation | null;
  progress: WebGLUniformLocation | null;
  ratio: WebGLUniformLocation | null;
}

const UNIFORMS = [
  'u_matrix', 'u_uvRect', 'u_tex', 'u_solid', 'u_color', 'u_texel', 'u_blur', 'u_lod', 'u_sharpen', 'u_opacity',
  'u_adj1', 'u_adj2', 'u_adj3', 'u_colorize', 'u_fade', 'u_keyOn', 'u_keyColor', 'u_keyParams',
  'u_maskType', 'u_mask', 'u_resolution', 'u_aspect',
  'u_localRect', 'u_lut', 'u_lutParams', 'u_shape', 'u_shapeA', 'u_shapeB',
  'u_lift', 'u_gamma', 'u_gain',
] as const;
type UniformName = (typeof UNIFORMS)[number];

interface TexEntry {
  tex: WebGLTexture;
  width: number;
  height: number;
  version: string | number | null;
  lastUsed: number;
  mips: boolean;
  /** YUV sources: plane textures and the framebuffer used to convert them. */
  planes?: WebGLTexture[];
  fbo?: WebGLFramebuffer;
  /** Render pass of the last upload, so a frame never uploads the same source twice. */
  uploadedFrame?: number;
}

type Mat3 = Float32Array;

function mat(a: number, b: number, c: number, d: number, e: number, f: number): Mat3 {
  // Column-major affine matrix [a c e; b d f; 0 0 1].
  return new Float32Array([a, b, 0, c, d, 0, e, f, 1]);
}

function mul(x: Mat3, y: Mat3): Mat3 {
  const o = new Float32Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      o[col * 3 + row] = x[row] * y[col * 3] + x[3 + row] * y[col * 3 + 1] + x[6 + row] * y[col * 3 + 2];
    }
  }
  return o;
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, 'a_pos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

function newTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return tex;
}


export class Compositor {
  readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly loc = {} as Record<UniformName, WebGLUniformLocation | null>;
  private readonly textures = new Map<string, TexEntry>();
  private readonly dummyLut: WebGLTexture;
  private readonly lutTextures = new Map<string, WebGLTexture>();
  private readonly yuvProgram: WebGLProgram;
  private readonly yuvK: WebGLUniformLocation | null;
  private readonly yuvHasA: WebGLUniformLocation | null;
  private readonly packProgram: WebGLProgram;
  private readonly packSize: WebGLUniformLocation | null;
  /** Readback resources: canvas copy, packing target, ping-pong pixel buffers. */
  private frameTex: WebGLTexture | null = null;
  private packTex: WebGLTexture | null = null;
  private packFbo: WebGLFramebuffer | null = null;
  private readbackSize = { w: 0, h: 0 };
  private pbos: { buf: WebGLBuffer; size: number }[] = [];
  private nextSlot = 0;
  private frameNo = 0;
  private lost = false;

  constructor(readonly canvas: HTMLCanvasElement, opts: { preserve?: boolean } = {}) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: !!opts.preserve,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });

    const prog = link(gl, VS, FS);
    this.program = prog;
    for (const name of UNIFORMS) this.loc[name] = gl.getUniformLocation(prog, name);
    // The LUT sampler lives on unit 2 with a neutral 1x1x1 texture when unused,
    // so it never shares a unit with the 2D sampler.
    gl.useProgram(prog);
    gl.uniform1i(this.loc.u_lut, 2);
    this.dummyLut = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.activeTexture(gl.TEXTURE0);
    this.yuvProgram = link(gl, FULL_VS, YUV_FS);
    gl.useProgram(this.yuvProgram);
    gl.uniform1i(gl.getUniformLocation(this.yuvProgram, 'u_y'), 0);
    gl.uniform1i(gl.getUniformLocation(this.yuvProgram, 'u_u'), 1);
    gl.uniform1i(gl.getUniformLocation(this.yuvProgram, 'u_v'), 2);
    gl.uniform1i(gl.getUniformLocation(this.yuvProgram, 'u_a'), 3);
    this.yuvK = gl.getUniformLocation(this.yuvProgram, 'u_k');
    this.yuvHasA = gl.getUniformLocation(this.yuvProgram, 'u_hasA');
    this.packProgram = link(gl, FULL_VS, PACK_FS);
    gl.useProgram(this.packProgram);
    gl.uniform1i(gl.getUniformLocation(this.packProgram, 'u_frame'), 0);
    this.packSize = gl.getUniformLocation(this.packProgram, 'u_size');
    gl.useProgram(null);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  private texture(src: TexSource): TexEntry | null {
    const gl = this.gl;
    let entry = this.textures.get(src.key);
    const needsUpload =
      !entry || entry.version !== src.version || (src.version === 'dynamic' && entry.uploadedFrame !== this.frameNo);
    if (needsUpload) {
      if (src.kind === 'element' && src.el instanceof HTMLVideoElement && src.el.readyState < 2) {
        if (entry) entry.lastUsed = this.frameNo;
        return entry ?? null;
      }
      if (!entry) {
        entry = { tex: newTexture(gl), width: 0, height: 0, version: null, lastUsed: 0, mips: false };
        this.textures.set(src.key, entry);
      }
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      try {
        if (src.kind === 'yuv' && src.data) {
          this.convertYuv(entry, src);
        } else if (src.kind === 'pixels' && src.data) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
        } else if (src.el) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.el);
        }
      } catch (e) {
        console.warn('Texture upload failed', src.key, e);
        return null;
      }
      entry.width = src.width;
      entry.height = src.height;
      entry.version = src.version;
      entry.uploadedFrame = this.frameNo;
      if (entry.mips) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        entry.mips = false;
      }
    }
    entry!.lastUsed = this.frameNo;
    return entry!;
  }

  /** Uploads Y/U/V planes and converts them into the entry's RGBA texture. */
  private convertYuv(entry: TexEntry, src: TexSource): void {
    const gl = this.gl;
    const { width: w, height: h } = src;
    const cw = w >> 1;
    const ch = h >> 1;
    const data = src.data!;
    if (entry.width !== w || entry.height !== h || !entry.fbo) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      entry.fbo ??= gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, entry.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, entry.tex, 0);
      if (!entry.planes) {
        entry.planes = [newTexture(gl), newTexture(gl), newTexture(gl), newTexture(gl)];
        // Keep the alpha unit valid for opaque sources.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));
      }
    }
    const planes = entry.planes!;
    const sizes: [number, number, number][] = [
      [w, h, 0],
      [cw, ch, w * h],
      [cw, ch, w * h + cw * ch],
    ];
    // Transparent video: a full-size alpha plane follows the chroma planes.
    if (src.alpha) sizes.push([w, h, w * h + 2 * cw * ch]);
    sizes.forEach(([pw, ph, offset], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, planes[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, pw, ph, 0, gl.RED, gl.UNSIGNED_BYTE, data.subarray(offset, offset + pw * ph));
    });
    if (!src.alpha) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, planes[3]);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, entry.fbo!);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.yuvProgram);
    gl.uniform2fv(this.yuvK, KR_KB[src.matrix ?? 'bt709']);
    gl.uniform1i(this.yuvHasA, src.alpha ? 1 : 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
  }

  render(items: DrawItem[], frame: FrameInfo): void {
    if (this.lost) return;
    const gl = this.gl;
    this.frameNo++;
    // Upload/convert sources and run effect stacks first: those passes use
    // their own framebuffers and programs.
    this.processed.clear();
    for (const item of items) {
      if (item.source.kind === 'color' || item.source.kind === 'adjust') continue;
      const entry = this.texture(item.source);
      if (entry && item.effects.length > 0) {
        const tex = this.applyEffects(item, entry);
        if (tex !== entry.tex) this.processed.set(item, tex);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const [r, g, b] = hexToRgb(frame.background);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.beginMainPass(frame);
    for (let i = 0; i < items.length; i++) {
      if (items[i].source.kind === 'adjust') {
        this.drawAdjustment(items[i], frame);
        continue;
      }
      const group = items[i].plan.group;
      if (!group) {
        this.drawItem(items[i], frame);
        continue;
      }
      // Both layers of a shader transition are drawn offscreen, then mixed.
      const from: DrawItem[] = [];
      const to: DrawItem[] = [];
      let j = i;
      while (j < items.length && items[j].plan.group?.key === group.key) {
        (items[j].plan.group!.role === 'from' ? from : to).push(items[j]);
        j++;
      }
      this.drawTransition(group.type, group.progress, group.params, from, to, frame);
      i = j - 1;
    }
    gl.bindVertexArray(null);
    this.collectGarbage();
  }

  /**
   * Adjustment layer: copies the frame drawn so far, runs the layer's effects
   * on it and draws it back with the layer's colour, mask and opacity.
   */
  private drawAdjustment(item: DrawItem, frame: FrameInfo): void {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!this.adjCopy || this.adjSize.w !== w || this.adjSize.h !== h) {
      this.adjCopy ??= newTexture(gl);
      gl.bindTexture(gl.TEXTURE_2D, this.adjCopy);
      // RGB: the canvas has no alpha, and copyTexSubImage2D needs matching channels.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
      this.adjSize = { w, h };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.adjCopy);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
    const tex = item.effects.length ? this.runEffects(item, this.adjCopy, w, h, true) : this.adjCopy;
    // The copy is bottom-up: draw it flipped, full frame, uncropped.
    const clip = item.plan.clip;
    const flipped: DrawItem = {
      ...item,
      plan: { ...item.plan, clip: { ...clip, transform: { ...clip.transform, flipH: false, flipV: true }, crop: { left: 0, top: 0, right: 0, bottom: 0 } } },
    };
    this.processed.set(flipped, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    this.beginMainPass(frame);
    this.drawItem(flipped, frame);
  }

  private adjCopy: WebGLTexture | null = null;
  private adjSize = { w: 0, h: 0 };

  private beginMainPass(frame: FrameInfo): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.loc.u_tex, 0);
    gl.uniform2f(this.loc.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.u_aspect, frame.width / frame.height);
  }

  // -------------------------------------------------------------------------
  // Shader effects and transitions (built-ins and mods share this path)

  private readonly processed = new Map<DrawItem, WebGLTexture>();
  private readonly fxPrograms = new Map<string, FxProgram | null>();
  private readonly fxTargets = new Map<string, { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number; lastUsed: number }>();
  private readonly fxParams = new Float32Array(MAX_FX_PARAMS);

  private fxProgram(def: FxDef): FxProgram | null {
    const key = `${def.id}:${def.glsl.length}:${hashString(def.glsl)}:${def.params.map((p) => p.id).join(',')}`;
    if (this.fxPrograms.has(key)) return this.fxPrograms.get(key)!;
    const gl = this.gl;
    let result: FxProgram | null = null;
    try {
      const prog = link(gl, FULL_VS, fxSource(def));
      const u = (n: string) => gl.getUniformLocation(prog, n);
      result = {
        prog,
        src: u('u_src'),
        flip: u('u_flipSrc'),
        size: u('u_size'),
        time: u('u_time'),
        params: u('u_p[0]') ?? u('u_p'),
        from: u('u_from'),
        to: u('u_to'),
        progress: u('u_progress'),
        ratio: u('u_ratio'),
      };
    } catch (e) {
      reportFxError(def.id, e instanceof Error ? e.message : String(e));
    }
    this.fxPrograms.set(key, result);
    return result;
  }

  private fxTarget(key: string, w: number, h: number) {
    const gl = this.gl;
    let t = this.fxTargets.get(key);
    if (!t) {
      t = { tex: newTexture(gl), fbo: gl.createFramebuffer()!, w: 0, h: 0, lastUsed: 0 };
      this.fxTargets.set(key, t);
    }
    if (t.w !== w || t.h !== h) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
      t.w = w;
      t.h = h;
    }
    t.lastUsed = this.frameNo;
    return t;
  }

  private setFxParams(loc: WebGLUniformLocation | null, values: number[]): void {
    this.fxParams.fill(0);
    values.forEach((v, i) => (this.fxParams[i] = v));
    if (loc) this.gl.uniform1fv(loc, this.fxParams);
  }

  /** Runs an item's effect stack on its source texture; returns the result. */
  private applyEffects(item: DrawItem, entry: TexEntry): WebGLTexture {
    return this.runEffects(item, entry.tex, Math.max(1, entry.width), Math.max(1, entry.height), false);
  }

  /** `bottomUp` marks textures whose first row is the image bottom (canvas copies). */
  private runEffects(item: DrawItem, input: WebGLTexture, w: number, h: number, bottomUp: boolean): WebGLTexture {
    const gl = this.gl;
    let tex = input;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    item.effects.forEach((fx, i) => {
      const prog = this.fxProgram(fx.def);
      if (!prog) return;
      const target = this.fxTarget(`${item.plan.clip.id}#${i % 2}`, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog.prog);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(prog.src, 0);
      gl.uniform1i(prog.flip, bottomUp ? 1 : 0);
      gl.uniform2f(prog.size, w, h);
      gl.uniform1f(prog.time, item.time);
      this.setFxParams(prog.params, fx.params);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      tex = target.tex;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return tex;
  }

  private drawTransition(
    type: string,
    progress: number,
    values: Record<string, number> | undefined,
    from: DrawItem[],
    to: DrawItem[],
    frame: FrameInfo,
  ): void {
    const gl = this.gl;
    const def = getFx(type);
    const prog = def && def.kind === 'transition' ? this.fxProgram(def) : null;
    if (!def || !prog) {
      // Unknown or broken transition: plain cut.
      for (const item of to) this.drawItem(item, frame);
      return;
    }
    const w = this.canvas.width;
    const h = this.canvas.height;
    const layers = [from, to].map((list, n) => {
      const t = this.fxTarget(`__transition${n}`, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.beginMainPass(frame);
      for (const item of list) this.drawItem(item, frame);
      return t.tex;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.prog);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, layers[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, layers[0]);
    gl.uniform1i(prog.from, 0);
    gl.uniform1i(prog.to, 1);
    gl.uniform1f(prog.progress, progress);
    gl.uniform1f(prog.ratio, frame.width / frame.height);
    this.setFxParams(prog.params, paramValues(def, values));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.beginMainPass(frame);
  }

  private drawItem(item: DrawItem, frame: FrameInfo): void {
    const gl = this.gl;
    const L = this.loc;
    const { plan, content, source } = item;
    const clip = plan.clip;
    const W = frame.width;
    const H = frame.height;
    const crop = clip.crop;
    const x0 = -content.w / 2 + crop.left * content.w;
    const x1 = content.w / 2 - crop.right * content.w;
    const y0 = -content.h / 2 + crop.top * content.h;
    const y1 = content.h / 2 - crop.bottom * content.h;
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5 || Math.abs(plan.scale) < 1e-4) return;

    let entry: TexEntry | null = null;
    if (source.kind === 'color') {
      gl.uniform1i(L.u_solid, 1);
      gl.uniform4fv(L.u_color, source.color ?? [0, 0, 0, 1]);
    } else if (source.kind === 'adjust') {
      // Only valid through drawAdjustment, which prepares the frame copy.
      const tex = this.processed.get(item);
      if (!tex) return;
      entry = { tex, width: this.canvas.width, height: this.canvas.height, version: null, lastUsed: 0, mips: false };
      gl.uniform1i(L.u_solid, 0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    } else {
      entry = this.texture(source);
      if (!entry) return;
      gl.uniform1i(L.u_solid, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.processed.get(item) ?? entry.tex);
    }
    const hasMips = !!entry && entry.mips && !this.processed.has(item);

    const rad = (plan.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const proj = mat(2 / W, 0, 0, -2 / H, -1, 1);
    const place = mat(cos, sin, -sin, cos, W / 2 + plan.x, H / 2 + plan.y);
    const scale = mat(plan.scale, 0, 0, plan.scale, 0, 0);
    const quad = mat(x1 - x0, 0, 0, y1 - y0, x0, y0);
    gl.uniformMatrix3fv(L.u_matrix, false, mul(mul(proj, place), mul(scale, quad)));

    let u0 = crop.left;
    let u1 = 1 - crop.right;
    let v0 = crop.top;
    let v1 = 1 - crop.bottom;
    gl.uniform4f(L.u_localRect, u0, v0, u1, v1);
    if (clip.transform.flipH) [u0, u1] = [1 - crop.left, crop.right];
    if (clip.transform.flipV) [v0, v1] = [1 - crop.top, crop.bottom];
    gl.uniform4f(L.u_uvRect, u0, v0, u1, v1);

    const shape = clip.mask;
    if (shape && shape.shape !== 'none') {
      gl.uniform1i(L.u_shape, shape.shape === 'rect' ? 1 : 2);
      gl.uniform4f(L.u_shapeA, shape.x, shape.y, shape.width, shape.height);
      gl.uniform4f(L.u_shapeB, (shape.rotation * Math.PI) / 180, shape.feather, shape.invert ? 1 : 0, content.w / Math.max(1, content.h));
    } else {
      gl.uniform1i(L.u_shape, 0);
    }

    gl.activeTexture(gl.TEXTURE2);
    if (item.lut && item.lut.amount > 0) {
      gl.bindTexture(gl.TEXTURE_3D, this.lutTexture(item.lut));
      gl.uniform2f(L.u_lutParams, item.lut.size, item.lut.amount);
    } else {
      gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
      gl.uniform2f(L.u_lutParams, 1, 0);
    }
    gl.activeTexture(gl.TEXTURE0);

    const a = item.adjust;
    const blurAmount = Math.max(0, a.blur + plan.blur);
    let blurTexels = 0;
    let lod = 0;
    if (entry && blurAmount > 0.01) {
      const displayed = content.w * Math.abs(plan.scale);
      const radiusFramePx = (blurAmount / 100) * 0.03 * W;
      blurTexels = displayed > 0 ? (radiusFramePx * entry.width) / displayed : 0;
      // Effect outputs have no mip chain; their blur stays at full resolution.
      if (blurTexels > 12 && !this.processed.has(item)) {
        lod = Math.log2(blurTexels / 12);
        if (!hasMips) {
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          entry.mips = true;
        }
      }
    }
    gl.uniform1f(L.u_blur, blurTexels);
    gl.uniform1f(L.u_lod, lod);
    gl.uniform2f(L.u_texel, entry ? 1 / Math.max(1, entry.width) : 0, entry ? 1 / Math.max(1, entry.height) : 0);
    gl.uniform1f(L.u_sharpen, (a.sharpen / 100) * 1.5);
    gl.uniform1f(L.u_opacity, plan.opacity);
    gl.uniform4f(L.u_adj1, a.exposure / 50, (a.brightness / 100) * 0.3, a.contrast / 100, a.saturation / 100);
    gl.uniform4f(L.u_adj2, a.temperature / 100, a.tint / 100, (a.hue / 100) * Math.PI, a.vignette / 100);
    gl.uniform2f(L.u_adj3, a.highlights / 100, a.shadows / 100);
    const wh = item.wheels;
    gl.uniform3fv(L.u_lift, wh?.lift ?? [0, 0, 0]);
    gl.uniform3fv(L.u_gamma, wh?.gamma ?? [0, 0, 0]);
    gl.uniform3fv(L.u_gain, wh?.gain ?? [0, 0, 0]);
    gl.uniform4fv(L.u_colorize, item.colorize ?? [0, 0, 0, 0]);
    gl.uniform4fv(L.u_fade, plan.fade ?? [0, 0, 0, 0]);

    const key = item.chroma;
    gl.uniform1i(L.u_keyOn, key.enabled && source.kind !== 'color' ? 1 : 0);
    if (key.enabled) {
      gl.uniform3fv(L.u_keyColor, hexToRgb(key.color));
      gl.uniform3f(L.u_keyParams, (key.similarity / 100) * 0.5, (key.smoothness / 100) * 0.3 + 0.001, key.spill / 100);
    }

    const m = plan.mask;
    if (m) {
      const type = m.kind === 'linear' ? 1 : m.kind === 'circle' ? 2 : 3;
      gl.uniform1i(L.u_maskType, type);
      if (m.kind === 'linear') gl.uniform4f(L.u_mask, m.dirX, m.dirY, m.offset, m.feather);
      else if (m.kind === 'circle') gl.uniform4f(L.u_mask, m.cx, m.cy, m.radius, m.feather);
      else gl.uniform4f(L.u_mask, m.cx, m.cy, m.progress, m.feather);
    } else {
      gl.uniform1i(L.u_maskType, 0);
    }

    switch (item.blend) {
      case 'add':
        gl.blendFunc(gl.ONE, gl.ONE);
        break;
      case 'multiply':
        gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
        break;
      case 'screen':
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        break;
      default:
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private lutTexture(lut: NonNullable<DrawItem['lut']>): WebGLTexture {
    const gl = this.gl;
    let tex = this.lutTextures.get(lut.key);
    if (!tex) {
      tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_3D, tex);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, lut.size, lut.size, lut.size, 0, gl.RGB, gl.FLOAT, lut.data);
      this.lutTextures.set(lut.key, tex);
    }
    return tex;
  }

  private deleteEntry(e: TexEntry): void {
    const gl = this.gl;
    gl.deleteTexture(e.tex);
    for (const p of e.planes ?? []) gl.deleteTexture(p);
    if (e.fbo) gl.deleteFramebuffer(e.fbo);
  }

  private collectGarbage(): void {
    if (this.frameNo % 60 !== 0) return;
    for (const [key, e] of this.textures) {
      if (this.frameNo - e.lastUsed > 180) {
        this.deleteEntry(e);
        this.textures.delete(key);
      }
    }
    for (const [key, t] of this.fxTargets) {
      if (this.frameNo - t.lastUsed > 180) {
        this.gl.deleteTexture(t.tex);
        this.gl.deleteFramebuffer(t.fbo);
        this.fxTargets.delete(key);
      }
    }
  }

  /** Forces a texture to be re-uploaded on next use. */
  invalidate(key: string): void {
    const e = this.textures.get(key);
    if (e) e.version = null;
  }

  private ensureReadbackTargets(w: number, h: number): void {
    const gl = this.gl;
    if (this.frameTex && this.readbackSize.w === w && this.readbackSize.h === h) return;
    this.frameTex ??= newTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    // The canvas has no alpha channel; copyTexSubImage2D into RGBA would be rejected.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    this.packTex ??= newTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, this.packTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w / 4, (h * 3) / 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.packFbo ??= gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.packFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.packTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.readbackSize = { w, h };
  }

  /**
   * Starts an asynchronous readback of the last rendered frame into a pixel
   * buffer. 'yuv420p' converts on the GPU (needs canReadYuv); 'rgba' rows are
   * bottom-up. Up to three readbacks may be in flight.
   */
  beginReadback(format: ReadbackFormat): ReadbackHandle {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    let size = w * h * 4;
    if (format === 'yuv420p') {
      this.ensureReadbackTargets(w, h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.packFbo);
      gl.viewport(0, 0, w / 4, (h * 3) / 2);
      gl.disable(gl.BLEND);
      gl.useProgram(this.packProgram);
      gl.uniform2i(this.packSize, w, h);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      size = (w * h * 3) / 2;
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const slot = this.nextSlot;
    this.nextSlot = (slot + 1) % 3;
    let pbo = this.pbos[slot];
    if (!pbo || pbo.size !== size) {
      if (pbo) gl.deleteBuffer(pbo.buf);
      pbo = { buf: gl.createBuffer()!, size };
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.buf);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
      this.pbos[slot] = pbo;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.buf);
    if (format === 'yuv420p') gl.readPixels(0, 0, w / 4, (h * 3) / 2, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    else gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    return { format, slot, size, width: w, height: h, sync };
  }

  /**
   * Queries a readback's fence. Chromium refreshes fence status only in a task
   * after the first query, so touching it a frame before finishReadback lets
   * the read be served from its fast shadow copy.
   */
  touchReadback(handle: ReadbackHandle): void {
    this.gl.getSyncParameter(handle.sync, this.gl.SYNC_STATUS);
  }

  /**
   * Copies a readback out of its pixel buffer (blocking if the GPU is not done;
   * that measured faster than yielding to the event loop to poll).
   */
  finishReadback(handle: ReadbackHandle): Uint8Array {
    const gl = this.gl;
    gl.clientWaitSync(handle.sync, 0, 0);
    const out = new Uint8Array(handle.size);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[handle.slot].buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteSync(handle.sync);
    return out;
  }

  /**
   * Frees GPU resources. `loseContext` also releases the context itself; pass
   * false for canvases that stay on screen (getContext would return the dead one).
   */
  dispose(loseContext = true): void {
    const gl = this.gl;
    for (const e of this.textures.values()) this.deleteEntry(e);
    this.textures.clear();
    for (const t of this.fxTargets.values()) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.fxTargets.clear();
    for (const p of this.fxPrograms.values()) if (p) gl.deleteProgram(p.prog);
    this.fxPrograms.clear();
    for (const t of this.lutTextures.values()) gl.deleteTexture(t);
    this.lutTextures.clear();
    if (this.frameTex) gl.deleteTexture(this.frameTex);
    if (this.adjCopy) gl.deleteTexture(this.adjCopy);
    this.adjCopy = null;
    if (this.packTex) gl.deleteTexture(this.packTex);
    if (this.packFbo) gl.deleteFramebuffer(this.packFbo);
    for (const p of this.pbos) gl.deleteBuffer(p.buf);
    this.frameTex = this.packTex = null;
    this.packFbo = null;
    this.pbos = [];
    if (loseContext) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

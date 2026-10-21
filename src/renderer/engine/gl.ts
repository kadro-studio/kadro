// WebGL2 compositor. Draws resolved layers (see core/scene.ts) with transforms,
// crop, colour grading, blur, chroma key, blend modes and transition masks.
// The same code renders the live preview and exported frames.
import type { LayerPlan } from '../core/scene';
import type { Size } from '../core/geometry';
import type { Adjust, BlendMode, ChromaKey } from '../core/types';

export interface TexSource {
  /** Texture cache key. */
  key: string;
  kind: 'element' | 'pixels' | 'color';
  el?: TexImageSource;
  data?: Uint8Array;
  width: number;
  height: number;
  /** Re-uploaded when it changes; 'dynamic' uploads on every frame (video). */
  version: string | number;
  color?: [number, number, number, number];
}

export interface DrawItem {
  plan: LayerPlan;
  content: Size;
  source: TexSource;
  adjust: Adjust;
  colorize: [number, number, number, number] | null;
  chroma: ChromaKey;
  blend: BlendMode;
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
out vec2 v_uv;
void main() {
  vec3 p = u_matrix * vec3(a_pos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  v_uv = mix(u_uvRect.xy, u_uvRect.zw, a_pos);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

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
  if (u_adj2.w != 0.0) {
    float d = length(v_uv - 0.5) * 1.4142;
    c *= 1.0 - u_adj2.w * smoothstep(0.3, 1.0, d);
  }
  if (u_fade.a > 0.0) c = mix(c, u_fade.rgb, u_fade.a);
  c = clamp(c, 0.0, 1.0);
  alpha *= u_opacity * maskValue();
  outColor = vec4(c * alpha, alpha);
}`;

const UNIFORMS = [
  'u_matrix', 'u_uvRect', 'u_tex', 'u_solid', 'u_color', 'u_texel', 'u_blur', 'u_lod', 'u_sharpen', 'u_opacity',
  'u_adj1', 'u_adj2', 'u_adj3', 'u_colorize', 'u_fade', 'u_keyOn', 'u_keyColor', 'u_keyParams',
  'u_maskType', 'u_mask', 'u_resolution', 'u_aspect',
] as const;
type UniformName = (typeof UNIFORMS)[number];

interface TexEntry {
  tex: WebGLTexture;
  width: number;
  height: number;
  version: string | number | null;
  lastUsed: number;
  mips: boolean;
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

export class Compositor {
  readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly loc = {} as Record<UniformName, WebGLUniformLocation | null>;
  private readonly textures = new Map<string, TexEntry>();
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

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    this.program = prog;
    for (const name of UNIFORMS) this.loc[name] = gl.getUniformLocation(prog, name);

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
    const needsUpload = !entry || src.version === 'dynamic' || entry.version !== src.version;
    if (needsUpload) {
      if (src.kind === 'element' && src.el instanceof HTMLVideoElement && src.el.readyState < 2) {
        if (entry) entry.lastUsed = this.frameNo;
        return entry ?? null;
      }
      if (!entry) {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        entry = { tex, width: 0, height: 0, version: null, lastUsed: 0, mips: false };
        this.textures.set(src.key, entry);
      }
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      try {
        if (src.kind === 'pixels' && src.data) {
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
      if (entry.mips) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        entry.mips = false;
      }
    }
    entry!.lastUsed = this.frameNo;
    return entry!;
  }

  render(items: DrawItem[], frame: FrameInfo): void {
    if (this.lost) return;
    const gl = this.gl;
    this.frameNo++;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const [r, g, b] = hexToRgb(frame.background);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.loc.u_tex, 0);
    gl.uniform2f(this.loc.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.u_aspect, frame.width / frame.height);
    for (const item of items) this.drawItem(item, frame);
    gl.bindVertexArray(null);
    this.collectGarbage();
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
    } else {
      entry = this.texture(source);
      if (!entry) return;
      gl.uniform1i(L.u_solid, 0);
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    }

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
    if (clip.transform.flipH) [u0, u1] = [1 - crop.left, crop.right];
    if (clip.transform.flipV) [v0, v1] = [1 - crop.top, crop.bottom];
    gl.uniform4f(L.u_uvRect, u0, v0, u1, v1);

    const a = item.adjust;
    const blurAmount = Math.max(0, a.blur + plan.blur);
    let blurTexels = 0;
    let lod = 0;
    if (entry && blurAmount > 0.01) {
      const displayed = content.w * Math.abs(plan.scale);
      const radiusFramePx = (blurAmount / 100) * 0.03 * W;
      blurTexels = displayed > 0 ? (radiusFramePx * entry.width) / displayed : 0;
      if (blurTexels > 12) {
        lod = Math.log2(blurTexels / 12);
        if (!entry.mips) {
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

  private collectGarbage(): void {
    if (this.frameNo % 60 !== 0) return;
    for (const [key, e] of this.textures) {
      if (this.frameNo - e.lastUsed > 180) {
        this.gl.deleteTexture(e.tex);
        this.textures.delete(key);
      }
    }
  }

  /** Forces a texture to be re-uploaded on next use. */
  invalidate(key: string): void {
    const e = this.textures.get(key);
    if (e) e.version = null;
  }

  readPixels(): Uint8Array {
    const gl = this.gl;
    const out = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }

  /**
   * Frees GPU resources. `loseContext` also releases the context itself; pass
   * false for canvases that stay on screen (getContext would return the dead one).
   */
  dispose(loseContext = true): void {
    for (const e of this.textures.values()) this.gl.deleteTexture(e.tex);
    this.textures.clear();
    if (loseContext) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

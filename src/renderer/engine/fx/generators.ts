// Built-in generator elements: animated overlays and backgrounds drawn entirely
// by shaders, so they work at any resolution and need no footage files.
import { APP_NAME } from '../../../shared/brand';
import type { FxDef, FxParam } from './types';

const p = (id: string, name: string, nameRu: string, nameUk: string, min: number, max: number, def: number, step?: number) =>
  ({ id, name, nameRu, nameUk, min, max, default: def, step }) as FxParam & { nameUk: string };

const INTENSITY = p('intensity', 'Intensity', 'Яркость', 'Яскравість', 0, 2, 1, 0.01);
const SPEED = p('speed', 'Speed', 'Скорость', 'Швидкість', 0, 3, 1, 0.01);
const SIZE = p('size', 'Size', 'Размер', 'Розмір', 0.2, 3, 1, 0.01);
const DENSITY = p('density', 'Density', 'Плотность', 'Щільність', 0, 1, 0.5, 0.01);
const AMOUNT = p('amount', 'Amount', 'Сила', 'Сила', 0, 1, 0.5, 0.01);

function gen(
  id: string,
  names: [string, string, string],
  category: 'overlay' | 'background',
  blend: string,
  colors: [string, string],
  params: FxParam[],
  glsl: string,
): FxDef {
  const [name, nameRu, nameUk] = names;
  return { id, kind: 'generator', name, nameRu, nameUk, category, blend, colors, params, glsl, source: 'builtin', author: APP_NAME };
}

const NOISE = `
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rand(i), rand(i + vec2(1.0, 0.0)), u.x), mix(rand(i + vec2(0.0, 1.0)), rand(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}`;

export const BUILTIN_GENERATORS: FxDef[] = [
  gen('gen.lightLeak', ['Light leak', 'Засветка', 'Засвітка'], 'overlay', 'screen', ['#ff7a1a', '#ff3b7f'], [INTENSITY, SPEED, SIZE], `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y);
  float t = time * speed * 0.25;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2((0.1 + 0.8 * fract(0.37 * fi + t * (0.15 + 0.05 * fi))) * ratio, 0.5 + 0.55 * sin(t * (0.9 + 0.3 * fi) + fi * 2.1));
    float d = length(q - c) / size;
    float g = exp(-d * d * (5.0 + 2.0 * fi));
    col += mix(colorA, colorB, 0.5 + 0.5 * sin(fi * 1.7 + t * 1.3)) * g * (0.9 - 0.15 * fi);
  }
  float edge = smoothstep(0.55, 0.0, uv.x) * (0.55 + 0.45 * sin(t * 1.7));
  col += colorA * edge * 0.45;
  return vec4(col * intensity, 1.0);
}`),

  gen('gen.filmGrain', ['Film grain', 'Плёночное зерно', 'Плівкове зерно'], 'overlay', 'overlay', ['#808080', '#808080'], [
    p('amount', 'Amount', 'Сила', 'Сила', 0, 1, 0.3, 0.01),
    p('size', 'Grain size', 'Размер зерна', 'Розмір зерна', 1, 4, 1.5, 0.1),
  ], `
vec4 generate(vec2 uv) {
  float frame = floor(time * 24.0);
  vec2 cell = floor(uv * u_size / size);
  float n = rand(cell + vec2(frame * 13.1, frame * 7.7)) + rand(cell * 1.7 + frame) - 1.0;
  return vec4(vec3(0.5 + n * 0.5 * amount), 1.0);
}`),

  gen('gen.bokeh', ['Bokeh', 'Боке', 'Боке'], 'overlay', 'screen', ['#ffd27a', '#ff8fb1'], [INTENSITY, SPEED, SIZE], `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    float r = (0.025 + 0.06 * rand(vec2(fi, 1.3))) * size;
    vec2 c = vec2(rand(vec2(fi, 2.7)) * ratio + 0.04 * sin(time * 0.4 + fi), fract(rand(vec2(fi, 5.1)) + time * speed * 0.02 * (0.4 + rand(vec2(fi, 9.0)))) * 1.3 - 0.15);
    float d = length(q - c);
    float disk = smoothstep(r, r * 0.88, d);
    float rim = smoothstep(r * 0.55, r, d) * disk;
    vec3 tint = mix(colorA, colorB, rand(vec2(fi, 7.7)));
    col += tint * (disk * 0.35 + rim * 0.25) * (0.4 + 0.6 * rand(vec2(fi, 3.3)));
  }
  return vec4(col * intensity, 1.0);
}`),

  gen('gen.snow', ['Snow', 'Снег', 'Сніг'], 'overlay', 'normal', ['#ffffff', '#dbe8ff'], [DENSITY, SPEED, SIZE], `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y);
  float a = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 10.0 + fl * 9.0;
    vec2 s = q * scale;
    s.y += time * speed * (1.6 + fl * 0.9);
    s.x += sin(time * 0.6 + s.y * 0.35 + fl) * 0.45;
    vec2 cell = floor(s);
    vec2 f = fract(s) - 0.5;
    if (rand(cell + fl * 17.0) > 1.0 - density) {
      vec2 o = vec2(rand(cell + 3.1), rand(cell + 7.7)) - 0.5;
      float d = length(f - o * 0.6);
      float rad = (0.09 + 0.1 * rand(cell + 1.7)) * size * (1.0 - fl * 0.2);
      a = max(a, smoothstep(rad, rad * 0.25, d) * (1.0 - fl * 0.22));
    }
  }
  return vec4(mix(colorA, colorB, 1.0 - a), a);
}`),

  gen('gen.rain', ['Rain', 'Дождь', 'Дощ'], 'overlay', 'screen', ['#cfe3ff', '#ffffff'], [DENSITY, SPEED, INTENSITY,
    p('slant', 'Slant', 'Наклон', 'Нахил', -0.5, 0.5, 0.12, 0.01)], `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y);
  float v = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    vec2 s = q * vec2(70.0 + fl * 45.0, 3.0 + fl * 1.5);
    // Shear in uv space, expressed in the stretched cell space.
    s.x += s.y * slant * (70.0 + fl * 45.0) / (3.0 + fl * 1.5);
    s.y += time * speed * (7.0 + fl * 3.0);
    vec2 cell = floor(s);
    vec2 f = fract(s);
    if (rand(vec2(cell.x, cell.y + fl * 31.0)) > 1.0 - density * 0.6) {
      float x = abs(f.x - 0.5);
      float streak = smoothstep(0.2, 0.0, x) * smoothstep(0.0, 0.35, f.y) * smoothstep(1.0, 0.55, f.y);
      v += streak * (0.75 - fl * 0.18);
    }
  }
  return vec4(colorA * v * intensity, 1.0);
}`),

  gen('gen.confetti', ['Confetti', 'Конфетти', 'Конфеті'], 'overlay', 'normal', ['#ff3b4f', '#ffd23f'], [SPEED, SIZE, DENSITY], `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y);
  vec4 acc = vec4(0.0);
  int n = int(20.0 + density * 80.0);
  for (int i = 0; i < 100; i++) {
    if (i >= n) break;
    float fi = float(i);
    float fall = speed * (0.1 + 0.12 * rand(vec2(fi, 1.0)));
    vec2 c = vec2(rand(vec2(fi, 2.0)) * ratio, 1.1 - fract(rand(vec2(fi, 3.0)) + time * fall) * 1.25);
    c.x += 0.035 * sin(time * (1.0 + rand(vec2(fi, 4.0)) * 2.0) + fi);
    float ang = time * (1.5 + 4.0 * rand(vec2(fi, 5.0))) + fi;
    vec2 d = q - c;
    d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
    d.y /= max(0.2, abs(sin(ang * 0.7 + fi)));
    vec2 sz = vec2(0.02, 0.011) * size;
    float m = (1.0 - smoothstep(sz.x * 0.8, sz.x, abs(d.x))) * (1.0 - smoothstep(sz.y * 0.8, sz.y, abs(d.y)));
    float pick = rand(vec2(fi, 6.0));
    vec3 tint = pick < 0.33 ? colorA : pick < 0.66 ? colorB : 0.55 + 0.45 * cos(6.2831 * (pick + vec3(0.0, 0.33, 0.67)));
    acc = mix(acc, vec4(tint, 1.0), m);
  }
  return acc;
}`),

  gen('gen.sparkles', ['Sparkles', 'Блёстки', 'Блискітки'], 'overlay', 'screen', ['#ffffff', '#ffe08a'], [INTENSITY, SPEED, DENSITY, SIZE], `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y) * (4.0 + density * 10.0);
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  vec3 col = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(float(x), float(y));
      float h = rand(c);
      if (h < 0.45) continue;
      vec2 o = vec2(rand(c + 1.3), rand(c + 2.9)) - 0.5;
      vec2 d = f - vec2(float(x), float(y)) - o * 0.8;
      float tw = pow(max(0.0, sin(time * speed * (1.2 + 2.0 * rand(c + 4.1)) + h * 40.0)), 4.0);
      float s = 0.07 * size;
      float core = exp(-length(d) / s * 1.4);
      float rays = exp(-abs(d.x) / s * 6.0) * exp(-abs(d.y) / (s * 2.5)) + exp(-abs(d.y) / s * 6.0) * exp(-abs(d.x) / (s * 2.5));
      col += mix(colorA, colorB, rand(c + 5.5)) * (core + rays * 0.7) * tw;
    }
  }
  return vec4(col * intensity, 1.0);
}`),

  gen('gen.fog', ['Fog', 'Туман', 'Туман'], 'overlay', 'normal', ['#e8eef5', '#ffffff'], [DENSITY, SPEED,
    p('scale', 'Scale', 'Масштаб', 'Масштаб', 0.5, 4, 1.6, 0.01)], NOISE + `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y) * scale;
  float t = time * speed * 0.08;
  float n = fbm(q + vec2(t, t * 0.3) + 0.8 * fbm(q * 0.7 - vec2(t * 0.5, 0.0)));
  float ground = mix(1.0, 0.45, smoothstep(0.0, 0.9, uv.y));
  float a = smoothstep(0.3, 0.85, n) * density * 1.4 * ground;
  return vec4(mix(colorB, colorA, n), clamp(a, 0.0, 1.0));
}`),

  gen('gen.flare', ['Lens flare', 'Блик объектива', 'Відблиск обʼєктива'], 'overlay', 'screen', ['#ffd9a0', '#7fb8ff'], [INTENSITY, SPEED], `
vec4 generate(vec2 uv) {
  vec2 q = (uv - 0.5) * vec2(ratio, 1.0);
  vec2 l = vec2(cos(time * speed * 0.25) * 0.38 * ratio, 0.22 + 0.08 * sin(time * speed * 0.4));
  vec2 dl = q - l;
  float d = length(dl);
  vec3 col = colorA * (0.0025 / (d * d + 0.0025)) * 0.6;
  col += colorA * exp(-d * 7.0) * 0.5;
  col += mix(colorA, colorB, 0.5) * exp(-abs(dl.y) * 120.0) * exp(-abs(dl.x) * 1.2) * 0.7;
  for (int i = 1; i <= 6; i++) {
    float fi = float(i);
    vec2 g = -l * (fi * 0.32 - 0.25);
    float r = 0.025 + 0.022 * fi;
    float gd = length(q - g);
    col += mix(colorB, colorA, fi / 6.0) * (smoothstep(r, r * 0.7, gd) * 0.12 + smoothstep(r * 1.05, r, gd) * smoothstep(r * 0.9, r, gd) * 0.1);
  }
  float ring = abs(length(q) - 0.42 * ratio * 0.5);
  col += colorB * exp(-ring * 60.0) * 0.05 * smoothstep(0.6, 0.0, d);
  return vec4(col * intensity, 1.0);
}`),

  gen('gen.vhs', ['VHS', 'VHS', 'VHS'], 'overlay', 'overlay', ['#808080', '#808080'], [AMOUNT, SPEED,
    p('lines', 'Line size', 'Размер строк', 'Розмір рядків', 1, 6, 2, 0.1)], `
vec4 generate(vec2 uv) {
  float scan = 0.5 + 0.5 * sin(uv.y * u_size.y * PI / lines);
  float v = 0.5 - 0.14 * amount * (1.0 - scan);
  v += (rand(floor(uv * u_size / 2.0) + floor(time * 30.0)) - 0.5) * 0.16 * amount;
  float band = fract(time * speed * 0.12);
  float inBand = smoothstep(0.035, 0.0, abs(uv.y - (1.0 - band)));
  v += inBand * (rand(vec2(floor(uv.x * u_size.x / 3.0), floor(time * 60.0))) - 0.35) * 0.7 * amount;
  float vig = smoothstep(1.25, 0.45, length((uv - 0.5) * vec2(1.0, 1.2)) * 1.5);
  v = mix(0.32, v, mix(1.0, vig, 0.7 * amount));
  return vec4(vec3(v), 1.0);
}`),

  gen('gen.oldFilm', ['Old film', 'Старая плёнка', 'Стара плівка'], 'overlay', 'multiply', ['#ffffff', '#ffffff'], [AMOUNT,
    p('tint', 'Sepia', 'Сепия', 'Сепія', 0, 1, 0.6, 0.01),
    p('vignette', 'Vignette', 'Виньетка', 'Віньєтка', 0, 1, 0.6, 0.01)], `
vec4 generate(vec2 uv) {
  float frame = floor(time * 18.0);
  float flicker = 0.93 + 0.07 * rand(vec2(frame, 1.0));
  vec3 base = mix(vec3(1.0), vec3(1.0, 0.9, 0.74), tint) * flicker;
  base *= mix(1.0, smoothstep(1.05, 0.35, length((uv - 0.5) * vec2(1.0, 1.15)) * 1.35), vignette);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    if (rand(vec2(frame, fi)) > 0.55) {
      float x = rand(vec2(frame * 0.37 + fi, 3.0));
      float w = 0.0012 + 0.002 * rand(vec2(fi, frame));
      base *= 1.0 - 0.55 * smoothstep(w, 0.0, abs(uv.x - x)) * amount;
    }
  }
  vec2 g = floor(uv * vec2(180.0 * ratio, 180.0));
  if (rand(g + frame * 7.3) > 1.0 - 0.004 * amount) base *= 0.3;
  return vec4(base, 1.0);
}`),

  gen('gen.fireflies', ['Fireflies', 'Светлячки', 'Світлячки'], 'overlay', 'screen', ['#ffe27a', '#9dff7a'], [INTENSITY, SPEED, SIZE], `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    vec2 c = vec2(fract(rand(vec2(fi, 1.0)) + 0.04 * sin(time * 0.35 + fi * 1.3)) * ratio,
                  fract(rand(vec2(fi, 2.0)) + time * speed * 0.015 * (0.5 + rand(vec2(fi, 3.0)))));
    float d = length(q - c);
    float r = 0.013 * size * (0.6 + rand(vec2(fi, 4.0)));
    float pulse = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(time * (1.5 + rand(vec2(fi, 6.0))) + fi * 3.0), 2.0);
    col += mix(colorA, colorB, rand(vec2(fi, 5.0))) * (r * r / (d * d + r * r * 0.15)) * 0.6 * pulse;
  }
  return vec4(col * intensity, 1.0);
}`),

  gen('gen.frame', ['Glow frame', 'Светящаяся рамка', 'Сяйлива рамка'], 'overlay', 'normal', ['#ffffff', '#ff3b4f'], [
    p('thickness', 'Thickness', 'Толщина', 'Товщина', 0, 10, 1.5, 0.1),
    p('margin', 'Margin', 'Отступ', 'Відступ', 0, 20, 4, 0.1),
    p('radius', 'Corner radius', 'Скругление', 'Заокруглення', 0, 30, 4, 0.1),
    p('glow', 'Glow', 'Свечение', 'Сяйво', 0, 2, 1, 0.01)], `
float sdBox(vec2 q, vec2 b, float r) {
  vec2 d = abs(q) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
vec4 generate(vec2 uv) {
  float s = min(u_size.x, u_size.y);
  vec2 q = (uv - 0.5) * u_size;
  vec2 b = u_size * 0.5 - s * margin * 0.01;
  float d = sdBox(q, b, s * radius * 0.01);
  float th = s * thickness * 0.005;
  float border = smoothstep(th * 0.5 + 1.0, th * 0.5 - 1.0, abs(d));
  float halo = exp(-abs(d) / (s * 0.025)) * glow * (0.75 + 0.25 * sin(time * 2.0));
  float a = clamp(border + halo * (1.0 - border), 0.0, 1.0);
  vec3 col = (colorA * border + colorB * halo * (1.0 - border)) / max(a, 1e-3);
  return vec4(col, a);
}`),

  gen('gen.starfield', ['Starfield', 'Звёздное небо', 'Зоряне небо'], 'background', 'normal', ['#cfe0ff', '#3b2a7a'], [SPEED, DENSITY], `
vec4 generate(vec2 uv) {
  vec2 q = (uv - 0.5) * vec2(ratio, 1.0);
  vec3 col = mix(colorB * 0.35, vec3(0.0), clamp(length(q) * 1.4, 0.0, 1.0));
  for (int layer = 0; layer < 5; layer++) {
    float fl = float(layer);
    float depth = fract(time * speed * 0.06 + fl * 0.2);
    float scale = mix(28.0, 1.0, depth);
    float fade = smoothstep(0.0, 0.25, depth) * smoothstep(1.0, 0.85, depth);
    vec2 s = q * scale + fl * 7.31;
    vec2 cell = floor(s);
    vec2 f = fract(s) - 0.5;
    float h = rand(cell + fl * 3.7);
    if (h > 1.0 - density * 0.6) {
      vec2 o = vec2(rand(cell + 2.0), rand(cell + 5.0)) - 0.5;
      float d = length(f - o * 0.7);
      col += mix(colorA, vec3(1.0), h) * smoothstep(0.09, 0.0, d) * fade * 1.6;
    }
  }
  return vec4(col, 1.0);
}`),

  gen('gen.aurora', ['Aurora', 'Северное сияние', 'Північне сяйво'], 'background', 'normal', ['#22e3a0', '#7a5cff'], [INTENSITY, SPEED], NOISE + `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y);
  float t = time * speed * 0.1;
  vec3 sky = mix(vec3(0.005, 0.01, 0.04), vec3(0.02, 0.04, 0.12), uv.y);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Each ribbon has a bright lower edge that wanders, fading upwards in rays.
    float centre = 0.5 + 0.12 * fi + 0.24 * (fbm(vec2(q.x * 0.7 + t + fi * 3.0, t * 0.5 + fi)) - 0.5);
    float dy = uv.y - centre;
    float curtain = smoothstep(-0.025, 0.0, dy) * exp(-max(dy, 0.0) * (4.0 + 2.0 * fi));
    float rays = 0.35 + 0.65 * fbm(vec2(q.x * 22.0 + fi * 10.0, t * 1.5));
    col += mix(colorA, colorB, clamp(dy * 3.5 + fi * 0.25, 0.0, 1.0)) * curtain * rays * (1.0 - 0.22 * fi);
  }
  float star = step(0.998, rand(floor(uv * u_size * 0.5))) * rand(floor(uv * u_size));
  return vec4(sky + col * intensity + star * 0.8, 1.0);
}`),

  gen('gen.gradient', ['Living gradient', 'Живой градиент', 'Живий градієнт'], 'background', 'normal', ['#ff3b4f', '#2f5bff'], [SPEED], `
vec4 generate(vec2 uv) {
  vec2 q = vec2(uv.x * ratio, uv.y);
  float t = time * speed * 0.25;
  vec2 a = vec2((0.3 + 0.22 * sin(t)) * ratio, 0.3 + 0.25 * cos(t * 1.3));
  vec2 b = vec2((0.7 + 0.22 * cos(t * 0.8)) * ratio, 0.7 + 0.25 * sin(t * 1.1));
  vec2 c = vec2((0.5 + 0.3 * sin(t * 0.6 + 2.0)) * ratio, 0.5 + 0.3 * cos(t * 0.9 + 1.0));
  float wa = 1.0 / (0.03 + dot(q - a, q - a));
  float wb = 1.0 / (0.03 + dot(q - b, q - b));
  float wc = 0.6 / (0.05 + dot(q - c, q - c));
  vec3 mid = mix(colorA, colorB, 0.5) * 1.15;
  vec3 col = (colorA * wa + colorB * wb + mid * wc) / (wa + wb + wc);
  col += (rand(uv * u_size + time) - 0.5) / 128.0;
  return vec4(col, 1.0);
}`),

  gen('gen.synthwave', ['Synthwave', 'Синтвейв', 'Синтвейв'], 'background', 'normal', ['#ff3bd0', '#2fd0ff'], [SPEED], `
vec4 generate(vec2 uv) {
  vec2 q = (uv - vec2(0.5, 0.42)) * vec2(ratio, 1.0);
  vec3 col = mix(vec3(0.03, 0.0, 0.08), colorA * 0.35, smoothstep(-0.05, 0.65, q.y));
  if (q.y >= 0.0) {
    float r = 0.24;
    float d = length(q - vec2(0.0, 0.17));
    vec3 sunCol = mix(colorA, vec3(1.0, 0.85, 0.25), smoothstep(-0.02, 0.4, q.y));
    float stripes = step(0.0, sin((q.y - 0.17) * 85.0 - time * speed * 1.5)) + step(0.12, q.y);
    col = mix(col, sunCol, smoothstep(r, r - 0.004, d) * clamp(stripes, 0.0, 1.0));
    col += colorA * 0.35 * exp(-max(0.0, d - r) * 7.0);
  } else {
    float z = 0.12 / (-q.y + 0.002);
    vec2 g = vec2(q.x * z, z + time * speed * 1.2);
    vec2 w = fwidth(g) * 1.2;
    // Distance to the nearest grid line, in cell units.
    vec2 f = 0.5 - abs(fract(g) - 0.5);
    vec2 gl = 1.0 - smoothstep(vec2(0.0), w + 0.02, f);
    float grid = max(gl.x, gl.y);
    col = vec3(0.02, 0.0, 0.05) + colorB * grid * exp(-z * 0.06) * 1.3 + colorA * 0.25 * exp(q.y * 18.0);
  }
  return vec4(col, 1.0);
}`),
];

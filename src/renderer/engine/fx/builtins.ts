// Built-in shader effects and transitions (written for this project).
import { APP_NAME } from '../../../shared/brand';
import type { FxDef, FxParam } from './types';

const p = (id: string, name: string, nameRu: string, min: number, max: number, def: number, step?: number): FxParam => ({
  id,
  name,
  nameRu,
  min,
  max,
  default: def,
  step,
});

function effect(id: string, name: string, nameRu: string, params: FxParam[], glsl: string): FxDef {
  return { id, kind: 'effect', name, nameRu, params, glsl, source: 'builtin', author: APP_NAME };
}

function transition(id: string, name: string, nameRu: string, params: FxParam[], glsl: string): FxDef {
  return { id, kind: 'transition', name, nameRu, params, glsl, source: 'builtin', author: APP_NAME };
}

const AMOUNT = p('amount', 'Amount', 'Сила', 0, 1, 0.6, 0.01);

export const BUILTIN_EFFECTS: FxDef[] = [
  effect('fx.pixelate', 'Pixelate', 'Пикселизация', [p('size', 'Cell size', 'Размер ячейки', 2, 120, 18, 1)], `
vec4 effect(vec2 uv) {
  vec2 cell = vec2(max(1.0, size)) / u_size;
  return src((floor(uv / cell) + 0.5) * cell);
}`),

  effect('fx.rgbSplit', 'RGB split', 'RGB-сдвиг', [p('amount', 'Distance', 'Смещение', 0, 40, 8, 0.5), p('angle', 'Angle', 'Угол', 0, 360, 0, 1)], `
vec4 effect(vec2 uv) {
  float a = radians(angle);
  vec2 off = vec2(cos(a), sin(a)) * amount / u_size;
  vec4 c = src(uv);
  return vec4(src(uv + off).r, c.g, src(uv - off).b, c.a);
}`),

  effect('fx.glitch', 'Glitch', 'Глитч', [AMOUNT, p('speed', 'Speed', 'Скорость', 1, 30, 10, 1)], `
vec4 effect(vec2 uv) {
  float t = floor(u_time * speed);
  float band = floor(uv.y * 26.0);
  float r = rand(vec2(band, t));
  float shift = r > 1.0 - amount * 0.6 ? (rand(vec2(t, band + 7.0)) - 0.5) * 0.18 * amount : 0.0;
  vec2 q = vec2(fract(uv.x + shift), uv.y);
  float split = amount * 0.015 * (rand(vec2(t, 3.0)) - 0.5);
  vec4 c = src(q);
  c.r = src(q + vec2(split, 0.0)).r;
  c.b = src(q - vec2(split, 0.0)).b;
  float block = step(1.0 - amount * 0.12, rand(floor(uv * vec2(18.0, 10.0)) + t));
  c.rgb = mix(c.rgb, c.gbr, block);
  return c;
}`),

  effect('fx.grain', 'Film grain', 'Зерно', [p('amount', 'Amount', 'Сила', 0, 1, 0.35, 0.01), p('size', 'Size', 'Размер', 1, 4, 1.5, 0.1)], `
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float n = rand(floor(uv * u_size / size) + fract(u_time * 13.7)) - 0.5;
  c.rgb += n * amount * 0.5;
  return c;
}`),

  effect('fx.oldFilm', 'Old film', 'Старая плёнка', [p('amount', 'Amount', 'Сила', 0, 1, 0.75, 0.01)], `
vec4 effect(vec2 uv) {
  float t = u_time;
  vec2 jitter = vec2(0.0, (rand(vec2(floor(t * 12.0), 1.0)) - 0.5) * 0.004 * amount);
  vec4 c = src(uv + jitter);
  float l = luma(c.rgb);
  c.rgb = mix(c.rgb, l * vec3(1.07, 0.88, 0.68), 0.8 * amount);
  c.rgb += (rand(uv * u_size + fract(t)) - 0.5) * 0.18 * amount;
  c.rgb *= 1.0 + (rand(vec2(floor(t * 24.0), 9.0)) - 0.5) * 0.12 * amount;
  float sx = rand(vec2(floor(t * 8.0), 4.0));
  float scratch = smoothstep(0.0015, 0.0, abs(uv.x - sx)) * step(0.6, rand(vec2(floor(t * 8.0), 5.0)));
  c.rgb = mix(c.rgb, vec3(0.95), scratch * amount * 0.7);
  c.rgb *= 1.0 - amount * 0.6 * smoothstep(0.45, 1.0, length(uv - 0.5) * 1.3);
  return c;
}`),

  effect('fx.vhs', 'VHS', 'VHS-кассета', [p('amount', 'Amount', 'Сила', 0, 1, 0.7, 0.01)], `
vec4 effect(vec2 uv) {
  float t = u_time;
  float line = floor(uv.y * u_size.y);
  float jitter = (rand(vec2(line, floor(t * 30.0))) - 0.5) * 0.004 * amount;
  float tear = step(0.985, rand(vec2(floor(t * 5.0), 1.0))) * smoothstep(0.02, 0.0, abs(uv.y - fract(t * 0.7))) * 0.03;
  vec2 q = vec2(uv.x + jitter + tear * amount, uv.y);
  vec4 c = src(q);
  c.r = src(q + vec2(0.003 * amount, 0.0)).r;
  c.b = src(q - vec2(0.003 * amount, 0.0)).b;
  c.rgb *= 1.0 - amount * 0.18 * (0.5 + 0.5 * sin(uv.y * u_size.y * PI));
  c.rgb += (rand(uv * u_size + t) - 0.5) * 0.1 * amount;
  c.rgb = mix(c.rgb, vec3(luma(c.rgb)), 0.25 * amount);
  return c;
}`),

  effect('fx.glow', 'Glow', 'Свечение', [
    p('amount', 'Amount', 'Сила', 0, 2, 0.8, 0.01),
    p('threshold', 'Threshold', 'Порог', 0, 1, 0.6, 0.01),
    p('radius', 'Radius', 'Радиус', 1, 60, 14, 1),
  ], `
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 32.0) * radius;
    float a = fi * 2.39996;
    vec3 s = src(uv + vec2(cos(a), sin(a)) * r / u_size).rgb;
    acc += max(s - threshold, 0.0) / max(0.001, 1.0 - threshold);
  }
  c.rgb += acc / 32.0 * amount;
  return c;
}`),

  effect('fx.mirror', 'Mirror', 'Зеркало', [p('mode', 'Mode', 'Режим', 0, 3, 0, 1)], `
vec4 effect(vec2 uv) {
  int m = int(mode + 0.5);
  if (m == 0) uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x;
  else if (m == 1) uv.x = uv.x > 0.5 ? uv.x : 1.0 - uv.x;
  else if (m == 2) uv.y = uv.y > 0.5 ? uv.y : 1.0 - uv.y;
  else uv = 0.5 - abs(uv - 0.5);
  return src(uv);
}`),

  effect('fx.kaleidoscope', 'Kaleidoscope', 'Калейдоскоп', [p('segments', 'Segments', 'Сегменты', 2, 16, 6, 1), p('rotate', 'Rotation', 'Поворот', 0, 360, 0, 1)], `
vec4 effect(vec2 uv) {
  vec2 aspect = vec2(u_size.x / u_size.y, 1.0);
  vec2 q = (uv - 0.5) * aspect;
  float r = length(q);
  float seg = 2.0 * PI / max(2.0, floor(segments));
  float a = mod(atan(q.y, q.x) + radians(rotate), seg);
  a = abs(a - seg * 0.5);
  return src(vec2(cos(a), sin(a)) * r / aspect + 0.5);
}`),

  effect('fx.fisheye', 'Fisheye', 'Рыбий глаз', [p('amount', 'Amount', 'Сила', -1, 1, 0.6, 0.01)], `
vec4 effect(vec2 uv) {
  vec2 q = uv * 2.0 - 1.0;
  q *= 1.0 + amount * (dot(q, q) - 1.0) * 0.5;
  vec2 r = q * 0.5 + 0.5;
  if (r.x < 0.0 || r.x > 1.0 || r.y < 0.0 || r.y > 1.0) return vec4(0.0);
  return src(r);
}`),

  effect('fx.swirl', 'Swirl', 'Водоворот', [p('angle', 'Angle', 'Угол', -720, 720, 180, 1), p('radius', 'Radius', 'Радиус', 0.05, 1, 0.5, 0.01)], `
vec4 effect(vec2 uv) {
  vec2 aspect = vec2(u_size.x / u_size.y, 1.0);
  vec2 q = (uv - 0.5) * aspect;
  float r = length(q);
  if (r < radius) {
    float k = (radius - r) / radius;
    float a = radians(angle) * k * k;
    q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  }
  return src(q / aspect + 0.5);
}`),

  effect('fx.wave', 'Wave', 'Волна', [
    p('amplitude', 'Amplitude', 'Амплитуда', 0, 60, 12, 1),
    p('frequency', 'Frequency', 'Частота', 1, 30, 5, 0.5),
    p('speed', 'Speed', 'Скорость', 0, 10, 2, 0.1),
  ], `
vec4 effect(vec2 uv) {
  uv.x += sin(uv.y * frequency * 2.0 * PI + u_time * speed) * amplitude / u_size.x;
  return src(uv);
}`),

  effect('fx.shake', 'Camera shake', 'Тряска камеры', [p('amplitude', 'Strength', 'Сила', 0, 60, 14, 1), p('speed', 'Speed', 'Скорость', 1, 30, 12, 1)], `
vec4 effect(vec2 uv) {
  float t = u_time * speed;
  float k = floor(t);
  vec2 a = vec2(rand(vec2(k, 1.0)), rand(vec2(k, 2.0))) - 0.5;
  vec2 b = vec2(rand(vec2(k + 1.0, 1.0)), rand(vec2(k + 1.0, 2.0))) - 0.5;
  vec2 off = mix(a, b, smoothstep(0.0, 1.0, fract(t))) * 2.0 * amplitude / u_size;
  float zoom = 1.0 - 2.0 * amplitude / min(u_size.x, u_size.y);
  return src((uv - 0.5) * zoom + 0.5 + off);
}`),

  effect('fx.zoomBlur', 'Zoom blur', 'Радиальное размытие', [
    AMOUNT,
    p('cx', 'Centre X', 'Центр X', 0, 1, 0.5, 0.01),
    p('cy', 'Centre Y', 'Центр Y', 0, 1, 0.5, 0.01),
  ], `
vec4 effect(vec2 uv) {
  vec2 c = vec2(cx, cy);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 24; i++) acc += src(c + (uv - c) * (1.0 - amount * 0.25 * float(i) / 23.0));
  return acc / 24.0;
}`),

  effect('fx.posterize', 'Posterize', 'Постеризация', [p('levels', 'Levels', 'Уровни', 2, 16, 5, 1)], `
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float n = max(2.0, floor(levels));
  return vec4(min(floor(c.rgb * n) / (n - 1.0), 1.0), c.a);
}`),

  effect('fx.sketch', 'Sketch', 'Набросок', [AMOUNT, p('strength', 'Line strength', 'Толщина линий', 0.5, 6, 2, 0.1)], `
vec4 effect(vec2 uv) {
  vec2 px = 1.0 / u_size;
  float tl = luma(src(uv + px * vec2(-1.0, 1.0)).rgb), t = luma(src(uv + px * vec2(0.0, 1.0)).rgb), tr = luma(src(uv + px * vec2(1.0, 1.0)).rgb);
  float l = luma(src(uv - px * vec2(1.0, 0.0)).rgb), r = luma(src(uv + px * vec2(1.0, 0.0)).rgb);
  float bl = luma(src(uv - px).rgb), b = luma(src(uv - px * vec2(0.0, 1.0)).rgb), br = luma(src(uv + px * vec2(1.0, -1.0)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  float e = clamp(length(vec2(gx, gy)) * strength, 0.0, 1.0);
  vec4 c = src(uv);
  return vec4(mix(c.rgb, vec3(1.0 - e), amount), c.a);
}`),

  effect('fx.halftone', 'Halftone', 'Полутон', [
    p('size', 'Dot size', 'Размер точек', 3, 40, 10, 1),
    p('angle', 'Angle', 'Угол', 0, 90, 45, 1),
    p('color', 'Colour', 'Цвет', 0, 1, 1, 0.01),
  ], `
vec4 effect(vec2 uv) {
  float a = radians(angle);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 q = rot * (uv * u_size) / size;
  vec2 centre = inverse(rot) * ((floor(q) + 0.5) * size) / u_size;
  vec4 c = src(centre);
  float rad = sqrt(1.0 - luma(c.rgb)) * 0.62;
  float dotv = smoothstep(rad + 0.06, rad - 0.06, length(fract(q) - 0.5));
  return vec4(mix(vec3(1.0), mix(vec3(0.0), c.rgb, color), dotv), c.a);
}`),

  effect('fx.invert', 'Invert', 'Негатив', [p('amount', 'Amount', 'Сила', 0, 1, 1, 0.01)], `
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  return vec4(mix(c.rgb, 1.0 - c.rgb, amount), c.a);
}`),

  effect('fx.threshold', 'Threshold', 'Порог (Ч/Б)', [p('level', 'Level', 'Уровень', 0, 1, 0.5, 0.01), p('softness', 'Softness', 'Мягкость', 0, 0.5, 0.03, 0.01)], `
vec4 effect(vec2 uv) {
  vec4 c = src(uv);
  float v = smoothstep(level - softness, level + softness + 0.0001, luma(c.rgb));
  return vec4(vec3(v), c.a);
}`),

  effect('fx.emboss', 'Emboss', 'Тиснение', [p('amount', 'Amount', 'Сила', 0, 3, 1, 0.01)], `
vec4 effect(vec2 uv) {
  vec2 px = 1.0 / u_size;
  vec3 d = src(uv - px).rgb - src(uv + px).rgb;
  return vec4(vec3(0.5 + luma(d) * amount * 2.0), src(uv).a);
}`),
];

export const BUILTIN_TRANSITIONS: FxDef[] = [
  transition('tr.flash', 'Flash', 'Вспышка', [p('intensity', 'Intensity', 'Яркость', 0, 1, 0.9, 0.01)], `
vec4 transition(vec2 uv) {
  float f = 1.0 - abs(progress - 0.5) * 2.0;
  vec4 c = mix(fromColor(uv), toColor(uv), smoothstep(0.4, 0.6, progress));
  return mix(c, vec4(1.0), f * f * intensity);
}`),

  transition('tr.glitch', 'Glitch', 'Глитч', [], `
vec4 transition(vec2 uv) {
  float strength = sin(progress * PI);
  float n = rand(vec2(floor(uv.y * 22.0), floor(progress * 30.0)));
  vec2 shift = vec2((n - 0.5) * 0.22 * strength, 0.0);
  float useTo = step(n, progress);
  vec4 c = mix(fromColor(fract(uv + shift)), toColor(fract(uv - shift)), useTo);
  c.r = mix(fromColor(fract(uv + shift * 1.6)).r, toColor(fract(uv - shift * 1.6)).r, useTo);
  return c;
}`),

  transition('tr.pixelize', 'Pixelize', 'Пиксели', [p('cells', 'Max cell', 'Макс. ячейка', 0.01, 0.2, 0.06, 0.005)], `
vec4 transition(vec2 uv) {
  float d = min(progress, 1.0 - progress);
  float s = ceil(d * 20.0) / 20.0 * cells * 2.0;
  vec2 cell = vec2(s, s * ratio);
  vec2 q = s > 0.0 ? (floor(uv / cell) + 0.5) * cell : uv;
  return mix(fromColor(q), toColor(q), progress);
}`),

  transition('tr.ripple', 'Ripple', 'Рябь', [
    p('amplitude', 'Amplitude', 'Амплитуда', 0, 0.1, 0.03, 0.001),
    p('frequency', 'Frequency', 'Частота', 5, 80, 40, 1),
  ], `
vec4 transition(vec2 uv) {
  vec2 dir = uv - 0.5;
  float dist = length(dir * vec2(ratio, 1.0));
  vec2 off = normalize(dir + 1e-5) * sin(dist * frequency - progress * 20.0) * amplitude * sin(progress * PI);
  return mix(fromColor(uv + off), toColor(uv + off), smoothstep(0.2, 0.8, progress));
}`),

  transition('tr.crossZoom', 'Cross zoom', 'Зум-переход', [p('strength', 'Strength', 'Сила', 0, 1, 0.6, 0.01)], `
vec4 transition(vec2 uv) {
  float s = sin(progress * PI) * strength;
  float m = smoothstep(0.35, 0.65, progress);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 20; i++) {
    vec2 q = 0.5 + (uv - 0.5) * (1.0 - s * float(i) / 19.0 * 0.3);
    acc += mix(fromColor(q), toColor(q), m);
  }
  return acc / 20.0;
}`),

  transition('tr.burn', 'Burn', 'Выгорание', [], `
vec4 transition(vec2 uv) {
  if (progress >= 1.0) return toColor(uv);
  vec4 a = fromColor(uv);
  vec4 b = toColor(uv);
  float n = rand(floor(uv * vec2(ratio, 1.0) * 60.0)) * 0.25 + luma(a.rgb) * 0.75;
  float edge = progress * 1.2 - 0.1;
  vec4 c = mix(b, a, smoothstep(edge - 0.05, edge + 0.05, n));
  c.rgb += vec3(1.0, 0.45, 0.1) * smoothstep(0.08, 0.0, abs(n - edge)) * 1.5 * c.a;
  return c;
}`),

  transition('tr.blinds', 'Blinds', 'Жалюзи', [p('slats', 'Slats', 'Полосы', 2, 30, 10, 1)], `
vec4 transition(vec2 uv) {
  if (progress <= 0.0) return fromColor(uv);
  if (progress >= 1.0) return toColor(uv);
  float f = fract(uv.x * floor(slats));
  return mix(toColor(uv), fromColor(uv), smoothstep(progress - 0.01, progress + 0.01, f));
}`),

  transition('tr.checker', 'Checkerboard', 'Шахматы', [p('size', 'Squares', 'Клетки', 2, 20, 8, 1)], `
vec4 transition(vec2 uv) {
  vec2 cell = floor(uv * vec2(size * ratio, size));
  float order = mod(cell.x + cell.y, 2.0) * 0.5;
  return mix(fromColor(uv), toColor(uv), clamp((progress - order) * 2.0, 0.0, 1.0));
}`),

  transition('tr.mosaic', 'Mosaic', 'Мозаика', [p('size', 'Tiles', 'Плитки', 2, 40, 12, 1)], `
vec4 transition(vec2 uv) {
  float r = rand(floor(uv * vec2(size * ratio, size)));
  return mix(fromColor(uv), toColor(uv), smoothstep(r - 0.1, r + 0.1, progress * 1.2 - 0.1));
}`),

  transition('tr.heart', 'Heart', 'Сердце', [], `
vec4 transition(vec2 uv) {
  if (progress >= 0.999) return toColor(uv);
  vec2 q = (uv - vec2(0.5, 0.45)) * vec2(ratio, 1.0) / max(1e-4, progress * 1.6);
  float v = pow(q.x * q.x + q.y * q.y - 1.0, 3.0) - q.x * q.x * q.y * q.y * q.y;
  return mix(toColor(uv), fromColor(uv), smoothstep(-0.02, 0.02, v));
}`),

  transition('tr.swirl', 'Swirl', 'Водоворот', [p('turns', 'Turns', 'Обороты', 0, 3, 1, 0.05)], `
vec4 transition(vec2 uv) {
  vec2 q = (uv - 0.5) * vec2(ratio, 1.0);
  float k = sin(progress * PI) * turns * 2.0 * PI * (1.0 - smoothstep(0.0, 0.8, length(q)));
  q = vec2(q.x * cos(k) - q.y * sin(k), q.x * sin(k) + q.y * cos(k));
  vec2 r = q / vec2(ratio, 1.0) + 0.5;
  return mix(fromColor(r), toColor(r), smoothstep(0.3, 0.7, progress));
}`),

  transition('tr.doorway', 'Doorway', 'Двери', [], `
vec4 transition(vec2 uv) {
  float h = progress * 0.5;
  if (uv.x < 0.5 - h) return fromColor(vec2(uv.x + h, uv.y));
  if (uv.x > 0.5 + h) return fromColor(vec2(uv.x - h, uv.y));
  vec4 b = toColor(0.5 + (uv - 0.5) * mix(0.7, 1.0, progress));
  return vec4(b.rgb * mix(0.4, 1.0, progress), b.a);
}`),
];

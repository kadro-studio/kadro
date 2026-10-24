// Ready-made templates that come with the app, so the Templates window is never
// empty: put your clips into the numbered slots and the edit is done.
import { createProject, defaultTextStyle, makeClip, projectDuration } from '../core/project';
import { TEXT_PRESETS } from '../core/textPresets';
import type { Clip, Keyframe, MediaAsset, Project } from '../core/types';
import { t, type I18nKey } from '../i18n';
import type { TemplateEntry } from './templates';

interface Shot {
  dur: number;
  transition?: string;
}

interface Title {
  preset: string;
  text: I18nKey;
  start: number;
  dur: number;
}

interface Recipe {
  id: string;
  name: I18nKey;
  w: number;
  h: number;
  shots: Shot[];
  titles: Title[];
  /** A quick zoom that settles on every cut. */
  punch: boolean;
}

const RECIPES: Recipe[] = [
  {
    id: 'stories',
    name: 'tplb.stories',
    w: 1080,
    h: 1920,
    shots: [{ dur: 2 }, { dur: 2, transition: 'zoomIn' }, { dur: 2, transition: 'slideLeft' }, { dur: 2, transition: 'spin' }, { dur: 2, transition: 'wipeRight' }, { dur: 2.5, transition: 'pushUp' }],
    titles: [
      { preset: 'headline', text: 'tplb.storiesTitle', start: 0, dur: 2 },
      { preset: 'subtitle', text: 'tplb.thanks', start: 10.5, dur: 2 },
    ],
    punch: true,
  },
  {
    id: 'intro',
    name: 'tplb.intro',
    w: 1920,
    h: 1080,
    shots: [{ dur: 2.5 }, { dur: 2.5, transition: 'dissolve' }, { dur: 3, transition: 'dissolve' }],
    titles: [
      { preset: 'cinematic', text: 'tplb.introTitle', start: 0.4, dur: 4 },
      { preset: 'lowerThird', text: 'tplb.introName', start: 4.6, dur: 3 },
    ],
    punch: false,
  },
  {
    id: 'beat',
    name: 'tplb.beat',
    w: 1080,
    h: 1920,
    shots: [
      { dur: 0.75 },
      { dur: 0.75, transition: 'zoomIn' },
      { dur: 0.75 },
      { dur: 0.75, transition: 'blur' },
      { dur: 0.75 },
      { dur: 0.75, transition: 'zoomOut' },
      { dur: 0.75 },
      { dur: 1.5, transition: 'iris' },
    ],
    titles: [{ preset: 'chunky', text: 'tplb.beatTitle', start: 0, dur: 1.5 }],
    punch: true,
  },
  {
    id: 'travel',
    name: 'tplb.travel',
    w: 1920,
    h: 1080,
    shots: [{ dur: 3 }, { dur: 3, transition: 'slideLeft' }, { dur: 3, transition: 'slideLeft' }, { dur: 3, transition: 'slideLeft' }, { dur: 3.5, transition: 'fadeBlack' }],
    titles: [
      { preset: 'elegant', text: 'tplb.travelTitle', start: 0.3, dur: 2.7 },
      { preset: 'minimal', text: 'tplb.travelEnd', start: 12.3, dur: 3 },
    ],
    punch: false,
  },
];

/** A title clip from a built-in style, scaled to the frame like the Text tab does. */
function titleClip(tt: Title, W: number, H: number): Clip {
  const preset = TEXT_PRESETS.find((p) => p.id === tt.preset) ?? TEXT_PRESETS[0];
  const k = Math.min(W, H) / 1080;
  const style = { ...defaultTextStyle(), ...preset.style, content: t(tt.text) };
  style.fontSize = Math.round(style.fontSize * k);
  style.backgroundPadding = Math.round(style.backgroundPadding * k);
  style.strokeWidth = Math.round(style.strokeWidth * k * 10) / 10;
  style.shadowBlur = Math.round(style.shadowBlur * k);
  style.letterSpacing = Math.round(style.letterSpacing * k);
  const c = makeClip('text', {
    name: style.content,
    start: tt.start,
    duration: tt.dur,
    text: style,
    animIn: { type: preset.animIn, duration: 0.5 },
    animOut: { type: preset.animOut, duration: 0.5 },
  });
  c.transform.x = Math.round(preset.x * W);
  c.transform.y = Math.round(preset.y * H);
  return c;
}

function build(r: Recipe): TemplateEntry {
  const p: Project = createProject(t(r.name));
  p.settings = { ...p.settings, width: r.w, height: r.h, fps: 30 };
  const total = r.shots.reduce((s, x) => s + x.dur, 0);
  const media: MediaAsset[] = r.shots.map((s, i) => ({
    id: `${r.id}-slot-${i + 1}`,
    name: t('tpl.slotClip', { n: i + 1 }),
    path: '',
    kind: 'video',
    duration: s.dur,
    width: r.w,
    height: r.h,
    fps: 30,
    hasAudio: false,
    hasVideo: true,
    size: 0,
    slot: { index: i + 1 },
  }));
  media.push({
    id: `${r.id}-slot-music`,
    name: t('tpl.slotAudio', { n: r.shots.length + 1 }),
    path: '',
    kind: 'audio',
    duration: total,
    width: 0,
    height: 0,
    fps: 0,
    hasAudio: false,
    hasVideo: false,
    size: 0,
    slot: { index: r.shots.length + 1 },
  });
  p.media = media;
  let at = 0;
  const [v1, v2, a1] = [p.tracks.find((x) => x.kind === 'video')!, p.tracks.filter((x) => x.kind === 'video')[1], p.tracks.find((x) => x.kind === 'audio')!];
  r.shots.forEach((s, i) => {
    const c = makeClip('video', { name: media[i].name, mediaId: media[i].id, start: at, duration: s.dur });
    // Clips of another shape get a blurred fill instead of black bars.
    c.bgFill = 'blur';
    if (s.transition) c.transition = { type: s.transition, duration: Math.min(0.5, s.dur * 0.4) };
    if (r.punch) {
      const kf: Keyframe[] = [
        { t: 0, v: 1.08, ease: 'easeOut' },
        { t: Math.min(0.3, s.dur / 2), v: 1, ease: 'linear' },
      ];
      c.keyframes.scale = kf;
    }
    v1.clips.push(c);
    at += s.dur;
  });
  for (const tt of r.titles) v2.clips.push(titleClip(tt, r.w, r.h));
  a1.clips.push(makeClip('audio', { name: media[media.length - 1].name, mediaId: media[media.length - 1].id, start: 0, duration: total, fadeOut: 1 }));
  return {
    file: `builtin:${r.id}`,
    path: `builtin:${r.id}`,
    name: t(r.name),
    data: { project: p, luts: [] },
    slots: media.length,
    duration: projectDuration(p),
    builtin: true,
  };
}

/** The built-in templates, in the current language. */
export function builtinTemplates(): TemplateEntry[] {
  return RECIPES.map(build);
}

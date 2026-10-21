import type { Draft } from 'immer';
import { ANIMATIONS, FILTERS, TRANSITIONS } from '../core/effects';
import { fillScale } from '../core/geometry';
import { isAnimated, keyframeAt, propValue, setPropAt, toggleKeyframe, clearKeyframes } from '../core/keyframes';
import { defaultAdjust, defaultCrop, defaultTransform, findClip, maxClipDuration, mediaMap, projectDuration } from '../core/project';
import { setClipSpeed } from '../core/edit';
import { clipHasAudio } from '../core/scene';
import { FONT_FAMILIES } from '../core/textPresets';
import { formatTimecode } from '../core/time';
import type { Adjust, AnimProp, BlendMode, Clip, MediaAsset, Project, TextAlign } from '../core/types';
import { player } from '../engine/player';
import { useT, type I18nKey } from '../i18n';
import { deleteSelection, detachAudio, openDialog } from '../store/actions';
import { commitPreview, edit, previewEdit, useEditor } from '../store/editor';
import {
  ColorField,
  IconButton,
  Section,
  SelectField,
  SliderField,
  TextField,
  ToggleField,
  type KeyframeControl,
} from '../ui/controls';

const TYPE_COLOR: Record<Clip['type'], string> = {
  video: 'var(--clip-video)',
  audio: 'var(--clip-audio)',
  image: 'var(--clip-image)',
  text: 'var(--clip-text)',
  color: 'var(--clip-color)',
};

type ClipRecipe = (c: Draft<Clip>) => void;

function clipSetter(clipId: string) {
  return (recipe: ClipRecipe, final: boolean) => {
    const r = (d: Draft<Project>) => {
      for (const tr of d.tracks) {
        const c = tr.clips.find((x) => x.id === clipId);
        if (c) {
          recipe(c);
          return;
        }
      }
    };
    if (final) commitPreview(r);
    else previewEdit(r);
  };
}

export function Inspector() {
  const t = useT();
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  // While playing, freeze the time used for animated values to avoid 60 fps re-renders.
  const paused = useEditor((s) => (s.playing ? null : s.playhead));
  const playhead = paused ?? useEditor.getState().playhead;

  if (selection.length === 0) return <ProjectInfo project={project} />;
  if (selection.length > 1) {
    return (
      <>
        <div className="inspector-head">
          <span className="title">{t('insp.multi', { n: selection.length })}</span>
        </div>
        <div className="inspector-body">
          <div className="inspector-empty">
            <button className="btn danger" onClick={() => deleteSelection(false)}>
              {t('menu.delete')}
            </button>
          </div>
        </div>
      </>
    );
  }
  const found = findClip(project, selection[0]);
  if (!found) return <ProjectInfo project={project} />;
  const { clip } = found;
  const media = mediaMap(project);
  const m = clip.mediaId ? media.get(clip.mediaId) : undefined;
  const set = clipSetter(clip.id);
  const visual = clip.type !== 'audio';
  const local = playhead - clip.start;

  return (
    <>
      <div className="inspector-head">
        <span className="type-dot" style={{ background: TYPE_COLOR[clip.type] }} />
        <span className="title" title={clip.name}>
          {clip.type === 'text' && clip.text ? clip.text.content.split('\n')[0] : clip.name}
        </span>
      </div>
      <div className="inspector-body" key={clip.id}>
        <ClipSection clip={clip} set={set} fps={project.settings.fps} />
        {clip.type === 'text' && <TextSection clip={clip} set={set} />}
        {clip.type === 'color' && (
          <Section id="fill" title={t('sec.fill')}>
            <ColorField label={t('p.color')} value={clip.color} onChange={(v, f) => set((c) => void (c.color = v), f)} />
          </Section>
        )}
        {visual && <TransformSection clip={clip} m={m} local={local} project={project} set={set} />}
        {visual && <AnimationSection clip={clip} set={set} />}
        {visual && <TransitionSection clip={clip} set={set} />}
        {(clip.type === 'video' || clip.type === 'audio') && <SpeedSection clip={clip} m={m} />}
        {clipHasAudio(clip, media) && <AudioSection clip={clip} set={set} />}
        {visual && <ColorSection clip={clip} set={set} />}
        {visual && <FilterSection clip={clip} set={set} />}
        {(clip.type === 'video' || clip.type === 'image') && <ChromaSection clip={clip} set={set} />}
        {(clip.type === 'video' || clip.type === 'image') && <CropSection clip={clip} set={set} />}
        {visual && <BlendSection clip={clip} set={set} />}
      </div>
    </>
  );
}

type Setter = ReturnType<typeof clipSetter>;

function ProjectInfo({ project }: { project: Project }) {
  const t = useT();
  const s = project.settings;
  return (
    <>
      <div className="inspector-head">
        <span className="title">{t('insp.project')}</span>
      </div>
      <div className="inspector-body">
        <div className="inspector-empty">
          <dl className="info-table">
            <dt>{t('settings.name')}</dt>
            <dd>{project.name}</dd>
            <dt>{t('insp.resolution')}</dt>
            <dd>
              {s.width}×{s.height}
            </dd>
            <dt>{t('insp.frameRate')}</dt>
            <dd>{s.fps} fps</dd>
            <dt>{t('insp.duration')}</dt>
            <dd>{formatTimecode(projectDuration(project), s.fps)}</dd>
          </dl>
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => openDialog('settings')}>
            {t('insp.editSettings')}
          </button>
          <p className="panel-hint" style={{ marginTop: 16 }}>
            {t('insp.noSelection')}
          </p>
        </div>
      </div>
    </>
  );
}

function ClipSection({ clip, set, fps }: { clip: Clip; set: Setter; fps: number }) {
  const t = useT();
  return (
    <Section id="clip" title={t('sec.clip')}>
      {clip.type !== 'text' && <TextField label={t('p.name')} value={clip.name} onChange={(v, f) => set((c) => void (c.name = v), f)} />}
      <dl className="info-table">
        <dt>{t('p.start')}</dt>
        <dd className="timecode">{formatTimecode(clip.start, fps)}</dd>
        <dt>{t('p.length')}</dt>
        <dd className="timecode">{formatTimecode(clip.duration, fps)}</dd>
      </dl>
    </Section>
  );
}

function kfControl(clip: Clip, prop: AnimProp, local: number, fps: number): KeyframeControl {
  const tol = 0.5 / fps;
  const kfs = clip.keyframes[prop] ?? [];
  return {
    animated: isAnimated(clip, prop),
    atKey: !!keyframeAt(clip, prop, local, tol),
    onToggle: () =>
      edit((d) => {
        const c = d.tracks.flatMap((tr) => tr.clips).find((x) => x.id === clip.id);
        if (c) toggleKeyframe(c, prop, local, tol);
      }),
    onPrev: () => {
      const prev = [...kfs].reverse().find((k) => k.t < local - tol);
      if (prev) player.seek(clip.start + prev.t);
    },
    onNext: () => {
      const next = kfs.find((k) => k.t > local + tol);
      if (next) player.seek(clip.start + next.t);
    },
  };
}

function TransformSection({ clip, m, local, project, set }: { clip: Clip; m: MediaAsset | undefined; local: number; project: Project; set: Setter }) {
  const t = useT();
  const { width: W, height: H, fps } = project.settings;
  const tol = 0.5 / fps;
  const prop = (p: AnimProp) => propValue(clip, p, local);
  const setProp = (p: AnimProp, v: number, final: boolean) => set((c) => setPropAt(c, p, local, v, tol), final);
  const anyAnimated = (['x', 'y', 'scale', 'rotation', 'opacity'] as AnimProp[]).some((p) => isAnimated(clip, p));

  return (
    <Section
      id="transform"
      title={t('sec.transform')}
      actions={
        <>
          {anyAnimated && (
            <IconButton
              icon="diamond"
              size={14}
              className="small"
              title={t('p.clearKf')}
              onClick={() =>
                set((c) => {
                  for (const p of ['x', 'y', 'scale', 'rotation', 'opacity'] as AnimProp[]) clearKeyframes(c, p, local);
                }, true)
              }
            />
          )}
          <IconButton
            icon="reset"
            size={14}
            className="small"
            title={t('p.reset')}
            onClick={() =>
              set((c) => {
                c.transform = defaultTransform();
                c.keyframes = {};
              }, true)
            }
          />
        </>
      }
    >
      <SliderField label={t('p.x')} value={prop('x')} min={-W * 2} max={W * 2} softMax={W} step={1} unit="px" defaultValue={0}
        onChange={(v, f) => setProp('x', v, f)} keyframe={kfControl(clip, 'x', local, fps)} />
      <SliderField label={t('p.y')} value={prop('y')} min={-H * 2} max={H * 2} softMax={H} step={1} unit="px" defaultValue={0}
        onChange={(v, f) => setProp('y', v, f)} keyframe={kfControl(clip, 'y', local, fps)} />
      <SliderField label={t('p.scale')} value={Math.round(prop('scale') * 1000) / 10} min={1} max={2000} softMax={400} step={1} unit="%" defaultValue={100}
        onChange={(v, f) => setProp('scale', v / 100, f)} keyframe={kfControl(clip, 'scale', local, fps)} />
      <SliderField label={t('p.rotation')} value={prop('rotation')} min={-3600} max={3600} softMax={180} step={1} unit="°" defaultValue={0}
        onChange={(v, f) => setProp('rotation', v, f)} keyframe={kfControl(clip, 'rotation', local, fps)} />
      <SliderField label={t('p.opacity')} value={Math.round(prop('opacity') * 100)} min={0} max={100} step={1} unit="%" defaultValue={100}
        onChange={(v, f) => setProp('opacity', v / 100, f)} keyframe={kfControl(clip, 'opacity', local, fps)} />
      <div className="row">
        <button className="btn small" onClick={() => setProp('scale', 1, true)}>
          {t('p.fit')}
        </button>
        {m && (
          <button className="btn small" onClick={() => set((c) => {
            setPropAt(c, 'scale', local, Math.round(fillScale(m, W, H) * 1000) / 1000, tol);
            setPropAt(c, 'x', local, 0, tol);
            setPropAt(c, 'y', local, 0, tol);
          }, true)}>
            {t('p.fill')}
          </button>
        )}
        <IconButton icon="flipH" title={t('p.flipH')} active={clip.transform.flipH} onClick={() => set((c) => void (c.transform.flipH = !c.transform.flipH), true)} />
        <IconButton icon="flipV" title={t('p.flipV')} active={clip.transform.flipV} onClick={() => set((c) => void (c.transform.flipV = !c.transform.flipV), true)} />
      </div>
    </Section>
  );
}

const ADJUST_FIELDS: { key: keyof Adjust; label: I18nKey; min: number }[] = [
  { key: 'exposure', label: 'p.exposure', min: -100 },
  { key: 'brightness', label: 'p.brightness', min: -100 },
  { key: 'contrast', label: 'p.contrast', min: -100 },
  { key: 'saturation', label: 'p.saturation', min: -100 },
  { key: 'temperature', label: 'p.temperature', min: -100 },
  { key: 'tint', label: 'p.tint', min: -100 },
  { key: 'hue', label: 'p.hue', min: -100 },
  { key: 'highlights', label: 'p.highlights', min: -100 },
  { key: 'shadows', label: 'p.shadows', min: -100 },
  { key: 'vignette', label: 'p.vignette', min: -100 },
  { key: 'blur', label: 'p.blur', min: 0 },
  { key: 'sharpen', label: 'p.sharpen', min: 0 },
];

function ColorSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  return (
    <Section
      id="color"
      title={t('sec.color')}
      actions={<IconButton icon="reset" size={14} className="small" title={t('p.resetAdjust')} onClick={() => set((c) => void (c.adjust = defaultAdjust()), true)} />}
    >
      {ADJUST_FIELDS.map((f) => (
        <SliderField
          key={f.key}
          label={t(f.label)}
          value={clip.adjust[f.key]}
          min={f.min}
          max={100}
          defaultValue={0}
          onChange={(v, fin) => set((c) => void (c.adjust[f.key] = v), fin)}
        />
      ))}
    </Section>
  );
}

function FilterSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  return (
    <Section id="filter" title={t('sec.filter')}>
      <SelectField
        label={t('p.preset')}
        value={clip.filter.id}
        options={FILTERS.map((f) => ({ value: f.id, label: t(`filter.${f.id}` as I18nKey) }))}
        onChange={(v) => set((c) => void (c.filter.id = v), true)}
      />
      {clip.filter.id !== 'none' && (
        <SliderField label={t('p.amount')} value={clip.filter.amount} min={0} max={100} unit="%" defaultValue={100}
          onChange={(v, f) => set((c) => void (c.filter.amount = v), f)} />
      )}
    </Section>
  );
}

function ChromaSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const k = clip.chroma;
  const hasEyeDropper = 'EyeDropper' in window;
  return (
    <Section id="chroma" title={t('sec.chroma')}>
      <ToggleField label={t('p.enable')} value={k.enabled} onChange={(v) => set((c) => void (c.chroma.enabled = v), true)} />
      {k.enabled && (
        <>
          <div className="row">
            <ColorField label={t('p.keyColor')} value={k.color} onChange={(v, f) => set((c) => void (c.chroma.color = v), f)} />
            {hasEyeDropper && (
              <IconButton
                icon="wand"
                title="Pick"
                onClick={async () => {
                  try {
                    const ED = (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
                    const r = await new ED().open();
                    set((c) => void (c.chroma.color = r.sRGBHex), true);
                  } catch {
                    // cancelled
                  }
                }}
              />
            )}
          </div>
          <SliderField label={t('p.similarity')} value={k.similarity} min={0} max={100} defaultValue={40}
            onChange={(v, f) => set((c) => void (c.chroma.similarity = v), f)} />
          <SliderField label={t('p.smoothness')} value={k.smoothness} min={0} max={100} defaultValue={10}
            onChange={(v, f) => set((c) => void (c.chroma.smoothness = v), f)} />
          <SliderField label={t('p.spill')} value={k.spill} min={0} max={100} defaultValue={50}
            onChange={(v, f) => set((c) => void (c.chroma.spill = v), f)} />
        </>
      )}
    </Section>
  );
}

function CropSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const sides: { key: keyof Clip['crop']; label: I18nKey; other: keyof Clip['crop'] }[] = [
    { key: 'left', label: 'p.left', other: 'right' },
    { key: 'right', label: 'p.right', other: 'left' },
    { key: 'top', label: 'p.top', other: 'bottom' },
    { key: 'bottom', label: 'p.bottom', other: 'top' },
  ];
  return (
    <Section
      id="crop"
      title={t('sec.crop')}
      actions={<IconButton icon="reset" size={14} className="small" title={t('p.reset')} onClick={() => set((c) => void (c.crop = defaultCrop()), true)} />}
    >
      {sides.map((s) => (
        <SliderField
          key={s.key}
          label={t(s.label)}
          value={Math.round(clip.crop[s.key] * 1000) / 10}
          min={0}
          max={100}
          step={0.5}
          unit="%"
          defaultValue={0}
          onChange={(v, f) => set((c) => void (c.crop[s.key] = Math.min(v / 100, 0.99 - c.crop[s.other])), f)}
        />
      ))}
    </Section>
  );
}

function BlendSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const modes: BlendMode[] = ['normal', 'add', 'multiply', 'screen'];
  return (
    <Section id="blend" title={t('sec.blend')}>
      <SelectField
        label={t('p.blendMode')}
        value={clip.blend}
        options={modes.map((m) => ({ value: m, label: t(`blend.${m}` as I18nKey) }))}
        onChange={(v) => set((c) => void (c.blend = v), true)}
      />
    </Section>
  );
}

function AnimationSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const types = ANIMATIONS.filter((a) => a !== 'typewriter' || clip.type === 'text');
  const options = types.map((a) => ({ value: a as string, label: t(`anim.${a}` as I18nKey) }));
  const maxDur = Math.max(0.1, Math.min(10, clip.duration));
  return (
    <Section id="animation" title={t('sec.animation')}>
      <SelectField label={t('p.animIn')} value={clip.animIn.type} options={options} onChange={(v) => set((c) => void (c.animIn.type = v), true)} />
      {clip.animIn.type !== 'none' && (
        <SliderField label={t('p.duration')} value={clip.animIn.duration} min={0.1} max={maxDur} step={0.1} unit="s"
          onChange={(v, f) => set((c) => void (c.animIn.duration = v), f)} />
      )}
      <SelectField label={t('p.animOut')} value={clip.animOut.type} options={options} onChange={(v) => set((c) => void (c.animOut.type = v), true)} />
      {clip.animOut.type !== 'none' && (
        <SliderField label={t('p.duration')} value={clip.animOut.duration} min={0.1} max={maxDur} step={0.1} unit="s"
          onChange={(v, f) => set((c) => void (c.animOut.duration = v), f)} />
      )}
    </Section>
  );
}

function TransitionSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  return (
    <Section id="transition" title={t('sec.transition')}>
      <SelectField
        label={t('p.type')}
        value={clip.transition.type}
        options={TRANSITIONS.map((x) => ({ value: x as string, label: t(`transition.${x}` as I18nKey) }))}
        onChange={(v) => set((c) => void (c.transition.type = v), true)}
      />
      {clip.transition.type !== 'none' && (
        <SliderField label={t('p.duration')} value={clip.transition.duration} min={0.1} max={Math.max(0.1, Math.min(5, clip.duration))} step={0.05} unit="s"
          onChange={(v, f) => set((c) => void (c.transition.duration = v), f)} />
      )}
    </Section>
  );
}

const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];

function SpeedSection({ clip, m }: { clip: Clip; m: MediaAsset | undefined }) {
  const t = useT();
  const apply = (v: number, final: boolean) => {
    const r = (d: Draft<Project>) => setClipSpeed(d, clip.id, Math.min(16, Math.max(0.1, v)), m);
    if (final) commitPreview(r);
    else previewEdit(r);
  };
  return (
    <Section id="speed" title={t('sec.speed')}>
      <div className="seg">
        {SPEED_PRESETS.map((s) => (
          <button key={s} className={Math.abs(clip.speed - s) < 1e-3 ? 'active' : ''} onClick={() => apply(s, true)}>
            {s}×
          </button>
        ))}
      </div>
      <SliderField label={t('p.speed')} value={clip.speed} min={0.1} max={16} softMax={4} step={0.05} unit="×" defaultValue={1} onChange={apply} />
      {Number.isFinite(maxClipDuration(clip, m)) && (
        <span className="panel-hint" style={{ margin: 0 }}>
          {t('p.length')}: {formatTimecode(clip.duration, useEditor.getState().project.settings.fps)}
        </span>
      )}
    </Section>
  );
}

function AudioSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const maxFade = Math.max(0, Math.min(10, clip.duration / 2));
  return (
    <Section id="audio" title={t('sec.audio')}>
      <SliderField label={t('p.volume')} value={Math.round(clip.volume * 100)} min={0} max={200} unit="%" defaultValue={100}
        onChange={(v, f) => set((c) => void (c.volume = v / 100), f)} />
      <SliderField label={t('p.fadeIn')} value={clip.fadeIn} min={0} max={maxFade} step={0.1} unit="s" defaultValue={0}
        onChange={(v, f) => set((c) => void (c.fadeIn = v), f)} />
      <SliderField label={t('p.fadeOut')} value={clip.fadeOut} min={0} max={maxFade} step={0.1} unit="s" defaultValue={0}
        onChange={(v, f) => set((c) => void (c.fadeOut = v), f)} />
      <ToggleField label={t('p.mute')} value={clip.muted} onChange={(v) => set((c) => void (c.muted = v), true)} />
      {clip.type === 'video' && (
        <button className="btn small" onClick={() => detachAudio(clip.id)}>
          {t('p.detachAudio')}
        </button>
      )}
    </Section>
  );
}

function TextSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const s = clip.text!;
  const setText = (recipe: (ts: Draft<NonNullable<Clip['text']>>) => void, final: boolean) =>
    set((c) => {
      if (c.text) recipe(c.text);
    }, final);
  const aligns: { v: TextAlign; label: I18nKey }[] = [
    { v: 'left', label: 'p.alignLeft' },
    { v: 'center', label: 'p.alignCenter' },
    { v: 'right', label: 'p.alignRight' },
  ];
  const fonts = FONT_FAMILIES.includes(s.fontFamily) ? FONT_FAMILIES : [s.fontFamily, ...FONT_FAMILIES];
  return (
    <Section id="text" title={t('sec.text')}>
      <TextField label={t('p.content')} multiline value={s.content} onChange={(v, f) => setText((x) => void (x.content = v), f)} />
      <SelectField label={t('p.font')} value={s.fontFamily} options={fonts.map((f) => ({ value: f, label: f }))}
        onChange={(v) => setText((x) => void (x.fontFamily = v), true)} />
      <SliderField label={t('p.size')} value={s.fontSize} min={6} max={1000} softMax={400} unit="px"
        onChange={(v, f) => setText((x) => void (x.fontSize = v), f)} />
      <div className="seg">
        <button className={s.bold ? 'active' : ''} style={{ fontWeight: 700 }} onClick={() => setText((x) => void (x.bold = !x.bold), true)}>
          {t('p.bold')}
        </button>
        <button className={s.italic ? 'active' : ''} style={{ fontStyle: 'italic' }} onClick={() => setText((x) => void (x.italic = !x.italic), true)}>
          {t('p.italic')}
        </button>
      </div>
      <div className="seg">
        {aligns.map((a) => (
          <button key={a.v} className={s.align === a.v ? 'active' : ''} onClick={() => setText((x) => void (x.align = a.v), true)}>
            {t(a.label)}
          </button>
        ))}
      </div>
      <ColorField label={t('p.color')} value={s.color} onChange={(v, f) => setText((x) => void (x.color = v), f)} />
      <SliderField label={t('p.lineHeight')} value={s.lineHeight} min={0.6} max={3} step={0.05} defaultValue={1.2}
        onChange={(v, f) => setText((x) => void (x.lineHeight = v), f)} />
      <SliderField label={t('p.letterSpacing')} value={s.letterSpacing} min={-20} max={100} defaultValue={0} unit="px"
        onChange={(v, f) => setText((x) => void (x.letterSpacing = v), f)} />
      <div className="grid-2">
        <ColorField label={t('p.stroke')} value={s.strokeColor} onChange={(v, f) => setText((x) => void (x.strokeColor = v), f)} />
        <ColorField label={t('p.shadow')} value={s.shadowColor} onChange={(v, f) => setText((x) => void (x.shadowColor = v), f)} />
      </div>
      <SliderField label={t('p.strokeWidth')} value={s.strokeWidth} min={0} max={40} step={0.5} defaultValue={0}
        onChange={(v, f) => setText((x) => void (x.strokeWidth = v), f)} />
      <SliderField label={t('p.shadowBlur')} value={s.shadowBlur} min={0} max={100} defaultValue={0}
        onChange={(v, f) => setText((x) => void (x.shadowBlur = v), f)} />
      <SliderField label={t('p.shadowX')} value={s.shadowX} min={-60} max={60} defaultValue={0}
        onChange={(v, f) => setText((x) => void (x.shadowX = v), f)} />
      <SliderField label={t('p.shadowY')} value={s.shadowY} min={-60} max={60} defaultValue={0}
        onChange={(v, f) => setText((x) => void (x.shadowY = v), f)} />
      <ColorField label={t('p.background')} value={s.background} onChange={(v, f) => setText((x) => void (x.background = v), f)} />
      <SliderField label={t('p.bgOpacity')} value={s.backgroundOpacity} min={0} max={100} unit="%" defaultValue={0}
        onChange={(v, f) => setText((x) => void (x.backgroundOpacity = v), f)} />
      {s.backgroundOpacity > 0 && (
        <>
          <SliderField label={t('p.padding')} value={s.backgroundPadding} min={0} max={200} defaultValue={24}
            onChange={(v, f) => setText((x) => void (x.backgroundPadding = v), f)} />
          <SliderField label={t('p.radius')} value={s.backgroundRadius} min={0} max={200} defaultValue={12}
            onChange={(v, f) => setText((x) => void (x.backgroundRadius = v), f)} />
        </>
      )}
    </Section>
  );
}

import type { Draft } from 'immer';
import { ANIMATIONS, FILTERS, TRANSITIONS } from '../core/effects';
import { fillScale, stretchOf } from '../core/geometry';
import { isAnimated, keyframeAt, propValue, setPropAt, toggleKeyframe, clearKeyframes } from '../core/keyframes';
import { defaultAdjust, defaultCrop, defaultTransform, defaultWheels, findClip, maxClipDuration, mediaMap, projectDuration } from '../core/project';
import { clipHasAudio } from '../core/scene';
import { formatTimecode } from '../core/time';
import type { Adjust, AnimProp, BlendMode, Clip, FadeCurve, MediaAsset, Project, ShapeKind, ShapeStyle, TextAlign } from '../core/types';
import { player } from '../engine/player';
import { useLang, useT, type I18nKey } from '../i18n';
import { addEffect, applyTransition, deleteSelection, detachAudio, FADE_CURVES, moveEffect, openDialog, removeEffect, restoreAudio, setFade, speedRecipe } from '../store/actions';
import { oneGroup, partnersOf } from '../core/links';
import { fxOfKind, useFx } from '../engine/fx/registry';
import { fxName } from '../engine/fx/types';
import { edit, previewEdit, select, toast, useEditor } from '../store/editor';
import { setPrefs, usePrefs } from '../store/prefs';
import { api } from '../api';
import { loadLut } from '../engine/lut';
import { LayoutPicker } from './LayoutPicker';
import { CurvesSection, HslSection } from './ColorTools';
import { FontPicker } from '../ui/FontPicker';
import { isVariableFont, textWeight } from '../engine/fonts';
import { MAX_VOLUME } from '../store/enhance';
import { saveLookPreset, saveTextPreset } from '../store/presets';
import {
  ColorField,
  ColorWheelField,
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
  adjustment: '#5b4bb0',
  shape: '#2b6f7a',
  overlay: '#b4237a',
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
    // The final value lands on top of any live preview (one undo step from before it),
    // so a control that previewed without committing never loses its change.
    if (final) edit(r);
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
  // Simple mode shows the everyday settings only.
  const pro = !usePrefs((p) => p.simpleMode);

  if (selection.length === 0) return <ProjectInfo project={project} />;
  // A video and its linked sound are one thing to edit: the clicked one is shown.
  if (selection.length > 1 && !oneGroup(project, selection)) {
    return (
      <>
        <div className="inspector-head">
          <span className="title">{t('insp.multi', { n: selection.length })}</span>
        </div>
        <div className="inspector-body">
          <Section id="layout" title={t('sec.layout')}>
            <span className="panel-hint" style={{ margin: 0 }}>
              {t('layout.hint')}
            </span>
            <LayoutPicker />
          </Section>
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
        <span className="type-dot" style={{ background: TYPE_COLOR[clip.type], color: TYPE_COLOR[clip.type] }} />
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
        {clip.type === 'shape' && clip.shape && <ShapeSection clip={clip} set={set} />}
        {clip.type === 'overlay' && clip.overlay && <OverlaySection clip={clip} set={set} />}
        {visual && clip.type !== 'adjustment' && <TransformSection clip={clip} m={m} local={local} project={project} set={set} />}
        {clip.type === 'adjustment' && (
          <Section id="adjustment" title={t('elements.adjustment')}>
            <span className="panel-hint" style={{ margin: 0 }}>
              {t('elements.adjustmentHint')}
            </span>
            <SliderField label={t('p.opacity')} value={Math.round(propValue(clip, 'opacity', local) * 100)} min={0} max={100} unit="%" defaultValue={100}
              onChange={(v, f) => set((c) => setPropAt(c, 'opacity', local, v / 100, 0.5 / project.settings.fps), f)}
              keyframe={kfControl(clip, 'opacity', local, project.settings.fps)} />
          </Section>
        )}
        <FadeSection clip={clip} />
        {visual && <AnimationSection clip={clip} set={set} />}
        {visual && <TransitionSection clip={clip} set={set} />}
        {(clip.type === 'video' || clip.type === 'audio') && <SpeedSection clip={clip} m={m} />}
        {clipHasAudio(clip, media) && <AudioSection clip={clip} set={set} local={local} fps={project.settings.fps} />}
        {clip.type === 'video' && clip.detached && <LinkedSoundSection clip={clip} project={project} />}
        {visual && clip.type !== 'color' && <EffectsSection clip={clip} set={set} />}
        {pro && visual && clip.type !== 'shape' && <WheelsSection clip={clip} set={set} />}
        {pro && visual && clip.type !== 'shape' && <CurvesSection clip={clip} set={set} />}
        {pro && visual && clip.type !== 'shape' && <HslSection clip={clip} set={set} />}
        {visual && <ColorSection clip={clip} set={set} />}
        {visual && <FilterSection clip={clip} set={set} />}
        {pro && (clip.type === 'video' || clip.type === 'image') && <ChromaSection clip={clip} set={set} />}
        {(clip.type === 'video' || clip.type === 'image') && <CropSection clip={clip} set={set} />}
        {pro && visual && clip.type !== 'color' && <MaskSection clip={clip} set={set} />}
        {pro && visual && <BlendSection clip={clip} set={set} />}
        {!pro && (
          <button className="link-btn simple-more" onClick={() => setPrefs({ simpleMode: false })}>
            {t('simple.showAll')}
          </button>
        )}
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

/** Parameters and colours of an animated generator element. */
function OverlaySection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const o = clip.overlay!;
  const def = useFx((s) => s.defs[o.id]);
  if (!def) return null;
  return (
    <Section id="overlay" title={`${t('sec.overlay')}: ${fxName(def, lang)}`}>
      {def.params.map((p) => (
        <SliderField
          key={p.id}
          label={fxName(p, lang)}
          value={o.params[p.id] ?? p.default}
          min={p.min}
          max={p.max}
          step={p.step ?? (p.max - p.min) / 100}
          defaultValue={p.default}
          onChange={(v, f) => set((c) => void (c.overlay!.params[p.id] = v), f)}
        />
      ))}
      {/* Imported elements (e.g. from Shadertoy) do not use the two colours. */}
      {def.colors && (
        <div className="grid-2">
          <ColorField label={t('p.colorA')} value={o.colorA} onChange={(v, f) => set((c) => void (c.overlay!.colorA = v), f)} />
          <ColorField label={t('p.colorB')} value={o.colorB} onChange={(v, f) => set((c) => void (c.overlay!.colorB = v), f)} />
        </div>
      )}
    </Section>
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

function kfControl(clip: Clip, prop: AnimProp, local: number, fps: number): KeyframeControl | undefined {
  // Simple mode hides keyframes, unless the property is already animated.
  if (usePrefs.getState().simpleMode && !isAnimated(clip, prop)) return undefined;
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
      {(clip.type === 'video' || clip.type === 'image') && (
        <>
          <SliderField label={t('p.stretchX')} value={Math.round(clip.transform.stretchX * 1000) / 10} min={5} max={1000} softMax={300} step={1} unit="%" defaultValue={100}
            onChange={(v, f) => set((c) => void (c.transform.stretchX = v / 100), f)} />
          <SliderField label={t('p.stretchY')} value={Math.round(clip.transform.stretchY * 1000) / 10} min={5} max={1000} softMax={300} step={1} unit="%" defaultValue={100}
            onChange={(v, f) => set((c) => void (c.transform.stretchY = v / 100), f)} />
        </>
      )}
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
            setPropAt(c, 'scale', local, Math.round(fillScale(m, W, H, stretchOf(c)) * 1000) / 1000, tol);
            setPropAt(c, 'x', local, 0, tol);
            setPropAt(c, 'y', local, 0, tol);
          }, true)}>
            {t('p.fill')}
          </button>
        )}
        <IconButton icon="flipH" title={t('p.flipH')} active={clip.transform.flipH} onClick={() => set((c) => void (c.transform.flipH = !c.transform.flipH), true)} />
        <IconButton icon="flipV" title={t('p.flipV')} active={clip.transform.flipV} onClick={() => set((c) => void (c.transform.flipV = !c.transform.flipV), true)} />
      </div>
      {(clip.type === 'video' || clip.type === 'image') && <BackgroundFields clip={clip} set={set} />}
      {clip.type === 'video' && (
        <button className="btn small" onClick={() => openDialog('stabilize')}>
          {t('enh.stabilize')}…
        </button>
      )}
      {clip.type !== 'text' && (
        <>
          <span className="field-label">{t('sec.layout')}</span>
          <LayoutPicker />
        </>
      )}
    </Section>
  );
}

/** Fill around a picture that does not cover the frame: none, its own blurred copy, or a colour. */
function BackgroundFields({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const applyToAll = () => {
    let n = 0;
    edit((d) => {
      for (const tr of d.tracks) {
        for (const c of tr.clips) {
          if (c.type !== 'video' && c.type !== 'image') continue;
          c.bgFill = clip.bgFill;
          c.bgColor = clip.bgColor;
          c.bgBlur = clip.bgBlur;
          n++;
        }
      }
    });
    toast(t('bg.applied', { n }), 'success');
  };
  return (
    <>
      <span className="field-label" title={t('bg.hint')}>
        {t('bg.title')}
      </span>
      <div className="seg">
        {(['none', 'blur', 'color'] as const).map((v) => (
          <button key={v} className={clip.bgFill === v ? 'active' : ''} onClick={() => set((c) => void (c.bgFill = v), true)}>
            {t(`bg.${v}`)}
          </button>
        ))}
      </div>
      {clip.bgFill === 'blur' && (
        <SliderField label={t('bg.blur')} value={clip.bgBlur} min={0} max={100} step={1} unit="%" defaultValue={60} onChange={(v, f) => set((c) => void (c.bgBlur = v), f)} />
      )}
      {clip.bgFill === 'color' && <ColorField label={t('bg.color')} value={clip.bgColor} onChange={(v, f) => set((c) => void (c.bgColor = v), f)} />}
      {clip.bgFill !== 'none' && (
        <button className="btn small" onClick={applyToAll}>
          {t('bg.applyAll')}
        </button>
      )}
    </>
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
      <div className="field">
        <label className="field-label">{t('p.lut')}</label>
        <div className="row">
          <button
            className="btn small"
            title={clip.lut?.path}
            onClick={async () => {
              const path = await api.openFileDialog([{ name: 'LUT (.cube)', extensions: ['cube'] }]);
              if (!path) return;
              const lut = await loadLut(path);
              if (!lut) {
                toast(t('toast.lutFailed'), 'error');
                return;
              }
              set((c) => void (c.lut = { path, name: path.split(/[\\/]/).pop() ?? path, amount: 100 }), true);
            }}
          >
            {clip.lut ? clip.lut.name : t('p.lutLoad')}
          </button>
          {clip.lut && <IconButton icon="close" size={14} className="small" title={t('common.reset')} onClick={() => set((c) => void (c.lut = null), true)} />}
        </div>
      </div>
      {clip.lut && (
        <SliderField label={t('p.amount')} value={clip.lut.amount} min={0} max={100} unit="%" defaultValue={100}
          onChange={(v, f) => set((c) => void (c.lut && (c.lut.amount = v)), f)} />
      )}
    </Section>
  );
}

function WheelsSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const keys = ['lift', 'gamma', 'gain'] as const;
  return (
    <Section
      id="wheels"
      title={t('sec.wheels')}
      actions={<IconButton icon="reset" size={14} className="small" title={t('common.reset')} onClick={() => set((c) => void (c.wheels = defaultWheels()), true)} />}
    >
      <div className="wheels-row">
        {keys.map((k) => (
          <ColorWheelField key={k} label={t(`wheel.${k}` as I18nKey)} value={clip.wheels[k]} onChange={(v, f) => set((c) => void (c.wheels[k] = v), f)} />
        ))}
      </div>
    </Section>
  );
}

function ShapeSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const s = clip.shape!;
  const kinds: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'star', 'arrow', 'line', 'bubble', 'pill', 'heart', 'burst', 'hexagon', 'ring', 'check', 'cross'];
  const setShape = (recipe: (x: Draft<ShapeStyle>) => void, final: boolean) =>
    set((c) => {
      if (c.shape) recipe(c.shape);
    }, final);
  return (
    <Section id="shape" title={t('sec.shape')}>
      <SelectField label={t('p.type')} value={s.kind} options={kinds.map((k) => ({ value: k, label: t(`shape.${k}` as I18nKey) }))}
        onChange={(v) => setShape((x) => void (x.kind = v), true)} />
      <SliderField label={t('p.width')} value={s.width} min={2} max={8000} softMax={2000} unit="px" onChange={(v, f) => setShape((x) => void (x.width = v), f)} />
      <SliderField label={t('p.height')} value={s.height} min={2} max={8000} softMax={2000} unit="px" onChange={(v, f) => setShape((x) => void (x.height = v), f)} />
      <ColorField label={t('p.fillColor')} value={s.fill} onChange={(v, f) => setShape((x) => void (x.fill = v), f)} />
      <SliderField label={t('p.fillOpacity')} value={s.fillOpacity} min={0} max={100} unit="%" defaultValue={100}
        onChange={(v, f) => setShape((x) => void (x.fillOpacity = v), f)} />
      <ColorField label={t('p.stroke')} value={s.stroke} onChange={(v, f) => setShape((x) => void (x.stroke = v), f)} />
      <SliderField label={t('p.strokeWidth')} value={s.strokeWidth} min={0} max={100} defaultValue={0}
        onChange={(v, f) => setShape((x) => void (x.strokeWidth = v), f)} />
      {(s.kind === 'rect' || s.kind === 'bubble') && (
        <SliderField label={t('p.radius')} value={s.radius} min={0} max={500} softMax={200} defaultValue={0}
          onChange={(v, f) => setShape((x) => void (x.radius = v), f)} />
      )}
    </Section>
  );
}

function MaskSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const m = clip.mask;
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const field = (key: 'x' | 'y' | 'width' | 'height' | 'feather', label: I18nKey, def: number) => (
    <SliderField key={key} label={t(label)} value={pct(m[key])} min={0} max={100} step={0.5} unit="%" defaultValue={def * 100}
      onChange={(v, f) => set((c) => void (c.mask[key] = v / 100), f)} />
  );
  return (
    <Section id="mask" title={t('sec.mask')}>
      <div className="seg">
        {(['none', 'rect', 'ellipse'] as const).map((s) => (
          <button key={s} className={m.shape === s ? 'active' : ''} onClick={() => set((c) => void (c.mask.shape = s), true)}>
            {t(`mask.${s}` as I18nKey)}
          </button>
        ))}
      </div>
      {m.shape !== 'none' && (
        <>
          {field('x', 'p.x', 0.5)}
          {field('y', 'p.y', 0.5)}
          {field('width', 'p.width', 0.6)}
          {field('height', 'p.height', 0.6)}
          <SliderField label={t('p.rotation')} value={m.rotation} min={-180} max={180} unit="°" defaultValue={0}
            onChange={(v, f) => set((c) => void (c.mask.rotation = v), f)} />
          {field('feather', 'p.feather', 0.05)}
          <ToggleField label={t('p.invert')} value={m.invert} onChange={(v) => set((c) => void (c.mask.invert = v), true)} />
        </>
      )}
    </Section>
  );
}

function FilterSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  return (
    <Section
      id="filter"
      title={t('sec.filter')}
      actions={<IconButton icon="save" size={14} className="small" title={t('presets.saveLookHint')} onClick={() => void saveLookPreset(clip)} />}
    >
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
  const modes: BlendMode[] = [
    'normal', 'darken', 'multiply', 'colorBurn', 'linearBurn', 'lighten', 'screen', 'colorDodge', 'add',
    'overlay', 'softLight', 'hardLight', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  ];
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

/** Fade in / out of the picture and the sound, with Vegas's curve shapes. Linked partners follow. */
function FadeSection({ clip }: { clip: Clip }) {
  const t = useT();
  const curves = FADE_CURVES.map((c) => ({ value: c as string, label: t(`fade.${c}` as I18nKey) }));
  const field = (side: 'in' | 'out') => {
    const len = side === 'in' ? clip.fadeIn : clip.fadeOut;
    const other = side === 'in' ? clip.fadeOut : clip.fadeIn;
    const curve = (side === 'in' ? clip.fadeInCurve : clip.fadeOutCurve) ?? 'linear';
    const max = Math.max(0.1, Math.min(10, clip.duration - other));
    const preview = (v: number) =>
      previewEdit((d) => {
        const c = d.tracks.flatMap((x) => x.clips).find((x) => x.id === clip.id);
        if (c && side === 'in') c.fadeIn = v;
        else if (c) c.fadeOut = v;
      });
    return (
      <>
        <SliderField label={t(side === 'in' ? 'p.fadeIn' : 'p.fadeOut')} value={Math.min(len, max)} min={0} max={max} step={0.05} unit="s" defaultValue={0}
          onChange={(v, final) => (final ? setFade(clip.id, side, { len: v }) : preview(v))} />
        {len > 0 && (
          <SelectField label={t('fade.curve')} value={curve} options={curves} onChange={(v) => setFade(clip.id, side, { curve: v as FadeCurve })} />
        )}
      </>
    );
  };
  return (
    <Section id="fades" title={t('sec.fades')}>
      {field('in')}
      {field('out')}
      <span className="panel-hint" style={{ margin: 0 }}>
        {t('fade.hint')}
      </span>
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
  const lang = useLang((s) => s.lang);
  const defs = useFx((s) => s.defs);
  const shader = defs[clip.transition.type];
  const options = [
    ...TRANSITIONS.map((x) => ({ value: x as string, label: t(`transition.${x}` as I18nKey) })),
    ...fxOfKind(defs, 'transition').map((d) => ({ value: d.id, label: `${fxName(d, lang)}${d.source !== 'builtin' ? ' (mod)' : ''}` })),
  ];
  return (
    <Section id="transition" title={t('sec.transition')}>
      <SelectField label={t('p.type')} value={clip.transition.type} options={options} onChange={(v) => applyTransition(clip.id, v)} />
      {clip.transition.type !== 'none' && (
        <SliderField label={t('p.duration')} value={clip.transition.duration} min={0.1} max={Math.max(0.1, Math.min(5, clip.duration))} step={0.05} unit="s"
          onChange={(v, f) => set((c) => void (c.transition.duration = v), f)} />
      )}
      {shader?.params.map((p) => (
        <SliderField
          key={p.id}
          label={fxName(p, lang)}
          value={clip.transition.params?.[p.id] ?? p.default}
          min={p.min}
          max={p.max}
          step={p.step ?? (p.max - p.min) / 100}
          defaultValue={p.default}
          onChange={(v, f) =>
            set((c) => {
              c.transition.params = { ...(c.transition.params ?? {}), [p.id]: v };
            }, f)
          }
        />
      ))}
    </Section>
  );
}

function EffectsSection({ clip, set }: { clip: Clip; set: Setter }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const defs = useFx((s) => s.defs);
  const errors = useFx((s) => s.errors);
  const add = (
    <select className="select compact" value="" onChange={(e) => e.target.value && addEffect([clip.id], e.target.value)} title={t('fx.add')}>
      <option value="">+ {t('fx.add')}</option>
      {fxOfKind(defs, 'effect').map((d) => (
        <option key={d.id} value={d.id}>
          {fxName(d, lang)}
        </option>
      ))}
    </select>
  );
  return (
    <Section id="effects" title={t('sec.effects')} actions={add}>
      {clip.effects.length === 0 && <span className="panel-hint" style={{ margin: 0 }}>{t('fx.none')}</span>}
      {clip.effects.map((e, i) => {
        const def = defs[e.type];
        return (
          <div className="fx-item" key={e.id}>
            <div className="fx-item-head">
              <input
                type="checkbox"
                className="switch"
                checked={e.enabled}
                title={t('p.enable')}
                onChange={(ev) => set((c) => void (c.effects.find((x) => x.id === e.id)!.enabled = ev.target.checked), true)}
              />
              <span title={def ? errors[def.id] : undefined}>
                {def ? fxName(def, lang) : `${e.type} — ${t('fx.missing')}`}
                {def && errors[def.id] ? ' ⚠' : ''}
              </span>
              <IconButton icon="chevronUp" size={14} className="small" title="↑" disabled={i === 0} onClick={() => moveEffect(clip.id, e.id, -1)} />
              <IconButton icon="chevronDown" size={14} className="small" title="↓" disabled={i === clip.effects.length - 1} onClick={() => moveEffect(clip.id, e.id, 1)} />
              <IconButton icon="close" size={14} className="small" title={t('ctx.delete')} onClick={() => removeEffect(clip.id, e.id)} />
            </div>
            {def &&
              e.enabled &&
              def.params.map((p) => (
                <SliderField
                  key={p.id}
                  label={fxName(p, lang)}
                  value={e.params[p.id] ?? p.default}
                  min={p.min}
                  max={p.max}
                  step={p.step ?? (p.max - p.min) / 100}
                  defaultValue={p.default}
                  onChange={(v, f) =>
                    set((c) => {
                      const x = c.effects.find((q) => q.id === e.id);
                      if (x) x.params[p.id] = v;
                    }, f)
                  }
                />
              ))}
          </div>
        );
      })}
    </Section>
  );
}

const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];

function SpeedSection({ clip, m }: { clip: Clip; m: MediaAsset | undefined }) {
  const t = useT();
  const apply = (v: number, final: boolean) => {
    const r = speedRecipe(clip.id, v);
    if (final) edit(r);
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

function AudioSection({ clip, set, local, fps }: { clip: Clip; set: Setter; local: number; fps: number }) {
  const t = useT();
  const tol = 0.5 / fps;
  const band = (key: 'low' | 'mid' | 'high', label: I18nKey) => (
    <SliderField key={key} label={t(label)} value={clip.audioFx[key]} min={-12} max={12} step={0.5} unit="dB" defaultValue={0}
      onChange={(v, f) => set((c) => void (c.audioFx[key] = v), f)} />
  );
  return (
    <Section id="audio" title={t('sec.audio')}>
      <SliderField
        label={t('p.volume')}
        value={Math.round(propValue(clip, 'volume', local) * 100)}
        min={0}
        max={MAX_VOLUME * 100}
        softMax={200}
        unit="%"
        defaultValue={100}
        onChange={(v, f) => set((c) => setPropAt(c, 'volume', local, v / 100, tol), f)}
        keyframe={kfControl(clip, 'volume', local, fps)}
      />
      {!usePrefs.getState().simpleMode && (
        <>
          {band('low', 'p.eqLow')}
          {band('mid', 'p.eqMid')}
          {band('high', 'p.eqHigh')}
          <ToggleField label={t('p.compressor')} value={clip.audioFx.compressor} onChange={(v) => set((c) => void (c.audioFx.compressor = v), true)} />
        </>
      )}
      <ToggleField label={t('p.mute')} value={clip.muted} onChange={(v) => set((c) => void (c.muted = v), true)} />
      <div className="row wrap">
        <button className="btn small" onClick={() => openDialog('denoise')}>
          {t('enh.denoise')}…
        </button>
        <button className="btn small" onClick={() => openDialog('silence')}>
          {t('enh.silence')}…
        </button>
        <button className="btn small" onClick={() => openDialog('loudness')}>
          {t('enh.loudness')}…
        </button>
        {clip.type === 'video' && (
          <button className="btn small" onClick={() => detachAudio(clip.id)}>
            {t('p.detachAudio')}
          </button>
        )}
      </div>
    </Section>
  );
}

/** A video whose sound is a separate clip on an audio track: shortcuts to that sound. */
function LinkedSoundSection({ clip, project }: { clip: Clip; project: Project }) {
  const t = useT();
  const sound = partnersOf(project, clip).find((x) => x.clip.type === 'audio')?.clip;
  return (
    <Section id="audio" title={t('sec.audio')}>
      <span className="panel-hint" style={{ margin: 0 }}>
        {t(sound ? 'link.soundHint' : 'link.noSound')}
      </span>
      <div className="row wrap">
        {sound ? (
          <>
            <button className="btn small" onClick={() => select([sound.id])}>
              {t('link.editSound')}
            </button>
            <button
              className="btn small"
              onClick={() => {
                select([clip.id, sound.id]);
                openDialog('silence');
              }}
            >
              {t('enh.silence')}…
            </button>
          </>
        ) : (
          <button className="btn small" onClick={() => restoreAudio(clip.id)}>
            {t('link.restore')}
          </button>
        )}
      </div>
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
  const weight = textWeight(s);
  const setWeight = (w: number, final: boolean) =>
    setText((x) => {
      x.weight = w;
      x.bold = w >= 600;
    }, final);
  return (
    <Section
      id="text"
      title={t('sec.text')}
      actions={
        <IconButton icon="save" size={14} className="small" title={t('presets.saveText')}
          onClick={() => void saveTextPreset(clip, useEditor.getState().project.settings)} />
      }
    >
      <TextField label={t('p.content')} multiline value={s.content} onChange={(v, f) => setText((x) => void (x.content = v), f)} />
      <FontPicker label={t('p.font')} value={s.fontFamily} onChange={(v) => setText((x) => void (x.fontFamily = v), true)} />
      <SliderField label={t('p.size')} value={s.fontSize} min={6} max={1000} softMax={400} unit="px"
        onChange={(v, f) => setText((x) => void (x.fontSize = v), f)} />
      {isVariableFont(s.fontFamily) && (
        <SliderField label={t('p.weight')} value={weight} min={100} max={900} step={50} defaultValue={700} onChange={setWeight} />
      )}
      <div className="seg">
        <button className={weight >= 600 ? 'active' : ''} style={{ fontWeight: 700 }} onClick={() => setWeight(weight >= 600 ? 400 : 700, true)}>
          {t('p.bold')}
        </button>
        <button className={s.italic ? 'active' : ''} style={{ fontStyle: 'italic' }} onClick={() => setText((x) => void (x.italic = !x.italic), true)}>
          {t('p.italic')}
        </button>
        <button className={s.uppercase ? 'active' : ''} onClick={() => setText((x) => void (x.uppercase = !x.uppercase), true)}>
          {t('p.uppercase')}
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
      <ToggleField label={t('p.gradient')} value={!!s.gradient} onChange={(v) => setText((x) => {
        x.gradient = v;
        x.gradientColor ??= '#ff3b4f';
        x.gradientAngle ??= 90;
      }, true)} />
      {s.gradient && (
        <>
          <ColorField label={t('p.gradientColor')} value={s.gradientColor ?? '#ff3b4f'} onChange={(v, f) => setText((x) => void (x.gradientColor = v), f)} />
          <SliderField label={t('p.gradientAngle')} value={s.gradientAngle ?? 90} min={0} max={360} unit="°" defaultValue={90}
            onChange={(v, f) => setText((x) => void (x.gradientAngle = v), f)} />
        </>
      )}
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

// Dynamic editing window: speed ramps, camera moves, effects on the beat, zoom
// cuts and boomerangs, each with presets shown as small pictures.
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { BEAT_FX, CAMERA_MOVES, RAMP_PRESETS, rampSpeedAt, type BeatFx, type CameraMove, type RampPreset } from '../core/dynamic';
import { findClip, mediaMap } from '../core/project';
import { clipHasAudio } from '../core/scene';
import type { Clip } from '../core/types';
import { useT, type I18nKey } from '../i18n';
import { openDialog } from '../store/actions';
import { applyBeatFx, applyCameraMove, applySpeedRamp, applyZoomCuts, beatTimes, clearMotion, makeBoomerang } from '../store/dynamic';
import { toast, useEditor } from '../store/editor';
import { errText } from '../store/media';
import { Icon, type IconName } from '../ui/Icon';
import { SliderField, ToggleField } from '../ui/controls';
import { Modal } from './Modal';

export type DynTool = 'ramp' | 'camera' | 'beat' | 'zoomCuts' | 'boomerang';

const useDynamic = create<{ tool: DynTool }>(() => ({ tool: 'ramp' }));

/** Opens the window on one of its tools. */
export function openDynamic(tool: DynTool): void {
  useDynamic.setState({ tool });
  openDialog('dynamic');
}

const TOOLS: { id: DynTool; icon: IconName; label: I18nKey }[] = [
  { id: 'ramp', icon: 'speed', label: 'dyn.ramp' },
  { id: 'camera', icon: 'camera', label: 'dyn.camera' },
  { id: 'beat', icon: 'music', label: 'dyn.beat' },
  { id: 'zoomCuts', icon: 'scissors', label: 'dyn.zoomCuts' },
  { id: 'boomerang', icon: 'loop', label: 'dyn.boomerang' },
];

// ---------------------------------------------------------------------------
// Small pictures of the presets

function RampGlyph({ preset, strength }: { preset: RampPreset; strength: number }) {
  // Speed on a log scale: 1× in the middle, 0.15× at the bottom, 6× at the top.
  const y = (s: number) => 30 - (Math.log(s) / Math.log(6)) * 26;
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) pts.push(`${(i / 40) * 100},${y(rampSpeedAt(preset, i / 40, strength)).toFixed(1)}`);
  return (
    <svg className="dyn-glyph" viewBox="-4 0 108 60" preserveAspectRatio="none">
      <line x1="0" x2="100" y1="30" y2="30" className="base" />
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

const CAMERA_PATHS: Record<CameraMove, string> = {
  zoomIn: 'M38 22h24v16H38zM30 14l8 8M70 14l-8 8M30 46l8-8M70 46l-8-8',
  zoomOut: 'M38 22h24v16H38zM38 22l-8-8M62 22l8-8M38 38l-8 8M62 38l8 8',
  panLeft: 'M30 16h40v28H30zM62 30H38M44 24l-6 6 6 6',
  panRight: 'M30 16h40v28H30zM38 30h24M56 24l6 6-6 6',
  panUp: 'M30 16h40v28H30zM50 38V22M44 28l6-6 6 6',
  panDown: 'M30 16h40v28H30zM50 22v16M44 32l6 6 6-6',
  handheld: 'M30 18h40v26H30zM24 30c4-4 6 4 10 0s6 4 10 0 6 4 10 0 6 4 10 0 6 4 10 0',
  pulse: 'M36 20h28v20H36zM30 14h40v32H30z',
  tilt: 'M33 21l36-6 4 24-36 6zM24 48a30 30 0 0 1 6-10',
};

function CameraGlyph({ move }: { move: CameraMove }) {
  return (
    <svg className="dyn-glyph" viewBox="20 8 60 44">
      <path d={CAMERA_PATHS[move]} />
    </svg>
  );
}

function BeatGlyph({ fx }: { fx: BeatFx }) {
  const beats = [10, 35, 60, 85];
  let d = '';
  if (fx === 'punch') d = beats.map((b) => `M${b} 46V14l12 32`).join('') + 'M0 46h100';
  if (fx === 'shake') d = beats.map((b) => `M${b} 30l3-14 3 26 3-20 3 12 3-4`).join('') + 'M0 30h100';
  if (fx === 'swing') d = beats.map((b, i) => `M${b} 30q6 ${i % 2 ? 22 : -22} 14 0`).join('') + 'M0 30h100';
  if (fx === 'blink') d = 'M0 14' + beats.map((b) => `H${b}V44l10-30`).join('') + 'H100';
  return (
    <svg className="dyn-glyph" viewBox="-4 6 108 48" preserveAspectRatio="none">
      <path d={d} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

export function DynamicDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const tool = useDynamic((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const clips = useMemo(() => selection.map((id) => findClip(project, id)?.clip).filter((c): c is Clip => !!c), [selection, project]);
  const visual = clips.filter((c) => c.type !== 'audio');
  const video = visual.find((c) => c.type === 'video');
  // Music on the timeline: audio files (not the sound of videos), the longest clip of each.
  const music = useMemo(() => {
    const media = mediaMap(project);
    const best = new Map<string, Clip>();
    for (const c of project.tracks.flatMap((tr) => tr.clips)) {
      if (c.type !== 'audio' || !c.mediaId || media.get(c.mediaId)?.kind !== 'audio' || !clipHasAudio(c, media)) continue;
      const had = best.get(c.mediaId);
      if (!had || c.duration > had.duration) best.set(c.mediaId, c);
    }
    return [...best.values()];
  }, [project]);

  const [ramp, setRamp] = useState<RampPreset>('montage');
  const [strength, setStrength] = useState(100);
  const [keepSound, setKeepSound] = useState(true);
  const [move, setMove] = useState<CameraMove>('zoomIn');
  const [beatFx, setBeatFx] = useState<BeatFx>('punch');
  const [beatSource, setBeatSource] = useState<string>(() => (music[0] ? music[0].id : 'markers'));
  const [every, setEvery] = useState(1);
  const [zoom, setZoom] = useState(0.15);
  const [push, setPush] = useState(false);
  const [cycles, setCycles] = useState(1);
  const [busy, setBusy] = useState(false);

  const k = strength / 100;
  const target = tool === 'ramp' || tool === 'boomerang' ? video : visual[0];
  const ready = !!target && !busy && (tool !== 'zoomCuts' || visual.length >= 1) && (tool !== 'beat' || beatSource !== 'markers' || project.markers.length > 0);

  const apply = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (tool === 'ramp') {
        const n = applySpeedRamp(target.id, ramp, k, keepSound);
        if (n) toast(t('dyn.rampDone', { n }), 'success');
      } else if (tool === 'camera') {
        applyCameraMove(visual.map((c) => c.id), move, k);
      } else if (tool === 'beat') {
        const { times } = await beatTimes(beatSource === 'markers' ? { kind: 'markers' } : { kind: 'music', clipId: beatSource });
        const hits = applyBeatFx(visual.map((c) => c.id), beatFx, times, every, k);
        toast(hits ? t('dyn.beatDone', { n: hits }) : t('dyn.beatNone'), hits ? 'success' : 'error');
        if (!hits) {
          setBusy(false);
          return;
        }
      } else if (tool === 'zoomCuts') {
        const n = applyZoomCuts(visual.map((c) => c.id), zoom, push);
        toast(n ? t('dyn.zoomCutsDone', { n }) : t('dyn.zoomCutsNone'), n ? 'success' : 'error');
        if (!n) {
          setBusy(false);
          return;
        }
      } else if (tool === 'boomerang') {
        if (!(await makeBoomerang(target.id, cycles))) {
          setBusy(false);
          return;
        }
      }
      onClose();
    } catch (e) {
      toast(errText(e), 'error');
      setBusy(false);
    }
  };

  const strengthField = <SliderField label={t('dyn.strength')} value={strength} min={30} max={200} step={5} unit="%" defaultValue={100} onChange={(v) => setStrength(v)} />;

  return (
    <Modal
      title={t('dyn.title')}
      onClose={busy ? undefined : onClose}
      width={700}
      footer={
        <>
          {tool === 'camera' || tool === 'beat' ? (
            <button className="btn" disabled={busy || visual.length === 0} onClick={() => (clearMotion(visual.map((c) => c.id)), onClose())}>
              {t('dyn.clearMotion')}
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!ready} onClick={() => void apply()}>
            {busy ? t('dyn.working') : t('dyn.apply')}
          </button>
        </>
      }
    >
      <div className="dyn-tabs">
        {TOOLS.map((x) => (
          <button key={x.id} className={tool === x.id ? 'active' : ''} onClick={() => useDynamic.setState({ tool: x.id })}>
            <Icon name={x.icon} size={16} />
            {t(x.label)}
          </button>
        ))}
      </div>
      <p className="panel-hint" style={{ margin: 0 }}>
        {t(`dyn.${tool}Hint` as I18nKey)}
      </p>
      <div className="dyn-target">
        {target ? (
          <>
            <Icon name={target.type === 'video' ? 'film' : 'image'} size={14} />
            {tool === 'camera' || tool === 'beat' || tool === 'zoomCuts'
              ? visual.length > 1
                ? t('dyn.targets', { n: visual.length })
                : target.name
              : target.name}
          </>
        ) : (
          <span className="dyn-warn">{t(tool === 'ramp' || tool === 'boomerang' ? 'dyn.needVideo' : 'dyn.needClip')}</span>
        )}
      </div>

      {tool === 'ramp' && (
        <>
          <div className="dyn-grid">
            {RAMP_PRESETS.map((r) => (
              <button key={r} className={`np-card dyn-card ${ramp === r ? 'active' : ''}`} onClick={() => setRamp(r)}>
                <RampGlyph preset={r} strength={k} />
                <strong>{t(`dyn.r.${r}` as I18nKey)}</strong>
              </button>
            ))}
          </div>
          {strengthField}
          <ToggleField label={t('dyn.keepSound')} value={keepSound} onChange={setKeepSound} />
        </>
      )}

      {tool === 'camera' && (
        <>
          <div className="dyn-grid">
            {CAMERA_MOVES.map((m) => (
              <button key={m} className={`np-card dyn-card ${move === m ? 'active' : ''}`} onClick={() => setMove(m)}>
                <CameraGlyph move={m} />
                <strong>{t(`dyn.c.${m}` as I18nKey)}</strong>
              </button>
            ))}
          </div>
          {strengthField}
        </>
      )}

      {tool === 'beat' && (
        <>
          <div className="dyn-grid">
            {BEAT_FX.map((f) => (
              <button key={f} className={`np-card dyn-card ${beatFx === f ? 'active' : ''}`} onClick={() => setBeatFx(f)}>
                <BeatGlyph fx={f} />
                <strong>{t(`dyn.b.${f}` as I18nKey)}</strong>
              </button>
            ))}
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">{t('dyn.beatSource')}</label>
              <select className="select" value={beatSource} onChange={(e) => setBeatSource(e.target.value)}>
                {music.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t('dyn.fromMusic', { name: c.name })}
                  </option>
                ))}
                <option value="markers">{t('dyn.fromMarkers', { n: project.markers.length })}</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">{t('dyn.every')}</label>
              <div className="seg">
                {[1, 2, 4].map((n) => (
                  <button key={n} className={every === n ? 'active' : ''} onClick={() => setEvery(n)}>
                    {t(n === 1 ? 'mt.r.1' : n === 2 ? 'mt.r.2' : 'mt.r.4')}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {strengthField}
        </>
      )}

      {tool === 'zoomCuts' && (
        <>
          <div className="field">
            <label className="field-label">{t('dyn.zoomAmount')}</label>
            <div className="seg">
              {[0.1, 0.15, 0.2, 0.3].map((z) => (
                <button key={z} className={Math.abs(zoom - z) < 1e-6 ? 'active' : ''} onClick={() => setZoom(z)}>
                  {Math.round((1 + z) * 100)}%
                </button>
              ))}
            </div>
          </div>
          <ToggleField label={t('dyn.push')} value={push} onChange={setPush} />
        </>
      )}

      {tool === 'boomerang' && (
        <div className="field">
          <label className="field-label">{t('dyn.cycles')}</label>
          <div className="seg">
            {[1, 2, 3].map((n) => (
              <button key={n} className={cycles === n ? 'active' : ''} onClick={() => setCycles(n)}>
                {n}×
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

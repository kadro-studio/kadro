import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../api';
import { clipEnd, findClip, mediaMap, tracksOfKind } from '../core/project';
import { clipHasAudio } from '../core/scene';
import { formatTimecode, snapToFrame } from '../core/time';
import { player } from '../engine/player';
import { useT, type I18nKey } from '../i18n';
import { shortcutLabel } from '../keymap';
import { addMediaClip, ATTR_GROUPS, pasteAttributes, type AttrGroup } from '../store/actions';
import { denoiseClip, normalizeLoudness, stabilizeClip } from '../store/enhance';
import { duckUnderVoice, markBeats, splitAtScenes } from '../store/tools';
import { toast, useEditor } from '../store/editor';
import { importFiles } from '../store/media';
import { Icon } from '../ui/Icon';
import { SelectField, SliderField, ToggleField } from '../ui/controls';
import { Modal } from './Modal';

export type EnhanceKind = 'stabilize' | 'denoise' | 'loudness' | 'scenes' | 'beats' | 'duck';

const LOUDNESS_TARGETS = [
  { value: '-14', label: 'enh.target14' },
  { value: '-16', label: 'enh.target16' },
  { value: '-23', label: 'enh.target23' },
] as const;

/** Tools that work on the picture; the rest need a clip with sound. */
const VIDEO_KINDS: EnhanceKind[] = ['stabilize', 'scenes'];
/** Tools without measurable progress show a running bar instead. */
const NO_PROGRESS: EnhanceKind[] = ['scenes', 'beats', 'duck'];

/** Clip tools with options: stabilise, denoise, loudness, scene cuts, beat markers, ducking. */
export function EnhanceDialog({ kind, onClose }: { kind: EnhanceKind; onClose: () => void }) {
  const t = useT();
  const targets = useEditor(
    useShallow((s) => {
      const media = mediaMap(s.project);
      return s.selection.filter((id) => {
        const f = findClip(s.project, id);
        if (!f) return false;
        return VIDEO_KINDS.includes(kind) ? f.clip.type === 'video' : clipHasAudio(f.clip, media);
      });
    }),
  );
  const [smoothing, setSmoothing] = useState(50);
  const [zoom, setZoom] = useState(true);
  const [strength, setStrength] = useState(50);
  const [voice, setVoice] = useState(true);
  const [target, setTarget] = useState<string>('-14');
  const [sensitivity, setSensitivity] = useState(50);
  const [beatMode, setBeatMode] = useState<'beats' | 'onsets'>('beats');
  const [duckDb, setDuckDb] = useState(-14);
  const [progress, setProgress] = useState<number | null>(null);

  const single = kind !== 'loudness';
  const ready = single ? targets.length === 1 : targets.length > 0;

  const run = async () => {
    setProgress(0);
    let ok = false;
    if (kind === 'stabilize') ok = await stabilizeClip(targets[0], { smoothing, zoom }, setProgress);
    else if (kind === 'denoise') ok = await denoiseClip(targets[0], { strength, voice }, setProgress);
    else if (kind === 'loudness') {
      const n = await normalizeLoudness(targets, Number(target), setProgress);
      ok = n > 0;
      toast(n > 0 ? t('enh.loudnessDone', { n }) : t('enh.loudnessNone'), n > 0 ? 'success' : 'error');
    } else if (kind === 'scenes') {
      const n = await splitAtScenes(targets[0], sensitivity);
      toast(n > 0 ? t('tools.scenesDone', { n }) : t('tools.scenesNone'), n > 0 ? 'success' : 'info');
      ok = true;
    } else if (kind === 'beats') {
      const r = await markBeats(targets[0], beatMode);
      toast(r.count > 0 ? t('tools.beatsDone', { n: r.count, bpm: r.bpm || '—' }) : t('tools.beatsNone'), r.count > 0 ? 'success' : 'info');
      ok = true;
    } else {
      const n = duckUnderVoice(targets[0], duckDb, sensitivity);
      toast(n > 0 ? t('tools.duckDone', { n }) : t('tools.duckNone'), n > 0 ? 'success' : 'info');
      ok = true;
    }
    setProgress(null);
    if (ok) onClose();
  };

  const busy = progress !== null;
  const indeterminate = NO_PROGRESS.includes(kind);
  return (
    <Modal
      title={t(`enh.${kind}` as I18nKey)}
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <button className="btn" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!ready || busy} onClick={() => void run()}>
            {t('common.apply')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {ready ? t(`enh.${kind}Hint` as I18nKey) : t(VIDEO_KINDS.includes(kind) ? 'enh.selectOne' : single ? 'enh.selectOneAudio' : 'enh.selectAudio')}
      </p>
      {kind === 'stabilize' && (
        <>
          <SliderField label={t('enh.smoothing')} value={smoothing} min={0} max={100} unit="%" defaultValue={50} onChange={(v) => setSmoothing(v)} />
          <ToggleField label={t('enh.zoom')} value={zoom} onChange={setZoom} />
        </>
      )}
      {kind === 'denoise' && (
        <>
          <SliderField label={t('enh.strength')} value={strength} min={0} max={100} unit="%" defaultValue={50} onChange={(v) => setStrength(v)} />
          <ToggleField label={t('enh.voice')} value={voice} onChange={setVoice} />
        </>
      )}
      {kind === 'loudness' && (
        <SelectField label={t('enh.target')} value={target} options={LOUDNESS_TARGETS.map((o) => ({ value: o.value, label: t(o.label) }))} onChange={setTarget} />
      )}
      {(kind === 'scenes' || kind === 'duck') && (
        <SliderField label={t('tools.sensitivity')} value={sensitivity} min={0} max={100} unit="%" defaultValue={50} onChange={(v) => setSensitivity(v)} />
      )}
      {kind === 'beats' && (
        <SelectField
          label={t('tools.beatMode')}
          value={beatMode}
          options={[
            { value: 'beats', label: t('tools.beatGrid') },
            { value: 'onsets', label: t('tools.onsets') },
          ]}
          onChange={setBeatMode}
        />
      )}
      {kind === 'duck' && (
        <SliderField label={t('tools.duckAmount')} value={duckDb} min={-40} max={-3} unit="dB" defaultValue={-14} onChange={(v) => setDuckDb(v)} />
      )}
      {busy && (
        <div className="export-status">
          <div className={`progress ${indeterminate ? 'indeterminate' : ''}`}>
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="line">
            <span>{t('enh.working')}</span>
            <span>{indeterminate ? '' : `${Math.round(progress * 100)}%`}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PasteAttributesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const source = useEditor((s) => s.clipboard?.clips[0]?.clip ?? null);
  const count = useEditor((s) => s.selection.length);
  const [groups, setGroups] = useState<Set<AttrGroup>>(new Set(['color', 'effects', 'mask', 'animation']));
  const toggle = (g: AttrGroup) => {
    const next = new Set(groups);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setGroups(next);
  };
  return (
    <Modal
      title={t('menu.pasteAttrs')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!source || count === 0 || groups.size === 0}
            onClick={() => {
              pasteAttributes([...groups]);
              onClose();
            }}
          >
            {t('common.apply')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {source ? t('attrs.hint', { name: source.name, n: count }) : t('attrs.copyFirst', { key: shortcutLabel('copy') || '—' })}
      </p>
      {ATTR_GROUPS.map((g) => (
        <label key={g} className="field toggle-field">
          <span className="field-label">{t(`attrs.${g}` as I18nKey)}</span>
          <input type="checkbox" className="switch" checked={groups.has(g)} onChange={() => toggle(g)} />
        </label>
      ))}
    </Modal>
  );
}

/** Records narration from a microphone while the timeline plays. */
export function VoiceoverDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [hearProject, setHearProject] = useState(false);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startAt = useRef(0);
  const fps = useEditor((s) => s.project.settings.fps);

  // Open the microphone (and keep a level meter running) while the dialog is open.
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: true } : { noiseSuppression: true },
        });
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream.current?.getTracks().forEach((tr) => tr.stop());
        stream.current = s;
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === 'audioinput'));
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v));
          setLevel(peak);
          raf = requestAnimationFrame(tick);
        };
        tick();
        setError(null);
      } catch (e) {
        setError(t('vo.noMic', { err: e instanceof Error ? e.message : String(e) }));
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void ctx?.close();
    };
  }, [deviceId, t]);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((tr) => tr.stop());
      player.setMasterVolume(1);
    },
    [],
  );

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(useEditor.getState().playhead - startAt.current), 100);
    return () => clearInterval(timer);
  }, [recording]);

  const start = () => {
    if (!stream.current) return;
    chunks.current = [];
    const rec = new MediaRecorder(stream.current, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    recorder.current = rec;
    startAt.current = snapToFrame(useEditor.getState().playhead, fps);
    player.setMasterVolume(hearProject ? 1 : 0);
    rec.start(250);
    player.play();
    setRecording(true);
  };

  const stop = async () => {
    const rec = recorder.current;
    if (!rec) return;
    player.pause();
    player.setMasterVolume(1);
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    setRecording(false);
    const blob = new Blob(chunks.current, { type: 'audio/webm' });
    if (blob.size < 1000) return;
    const path = await api.workPath(`voiceover-${formatTimecode(startAt.current, fps).replace(/:/g, '-')}.webm`);
    await api.writeBinary(path, new Uint8Array(await blob.arrayBuffer()));
    const [asset] = await importFiles([path]);
    if (!asset) return;
    // A free audio track at the recording position, or a new one.
    const p = useEditor.getState().project;
    const end = startAt.current + asset.duration;
    const free = tracksOfKind(p, 'audio').find((tr) => !tr.locked && !tr.clips.some((c) => c.start < end && clipEnd(c) > startAt.current));
    addMediaClip(asset.id, free ? { trackId: free.id, time: startAt.current } : { time: startAt.current, newTrack: true });
    toast(t('vo.done'), 'success');
    onClose();
  };

  return (
    <Modal
      title={t('vo.title')}
      onClose={recording ? undefined : onClose}
      footer={
        recording ? (
          <button className="btn danger" onClick={() => void stop()}>
            <Icon name="pause" size={14} />
            {t('vo.stop')} · {elapsed.toFixed(1)} s
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" disabled={!stream.current || !!error} onClick={start}>
              <span className="rec-dot" />
              {t('vo.record')}
            </button>
          </>
        )
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('vo.hint')}
      </p>
      <div className="field">
        <label className="field-label">{t('vo.mic')}</label>
        <select className="select" value={deviceId} disabled={recording} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">{t('vo.defaultMic')}</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>
      <div className="level-meter">
        <div style={{ width: `${Math.min(100, Math.sqrt(level) * 100)}%`, background: level > 0.9 ? 'var(--danger)' : undefined }} />
      </div>
      <label className="field toggle-field">
        <span className="field-label">{t('vo.hear')}</span>
        <input type="checkbox" className="switch" checked={hearProject} disabled={recording} onChange={(e) => setHearProject(e.target.checked)} />
      </label>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

/** Authors and licences of library media used in the project. */
export function CreditsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const media = useEditor((s) => s.project.media);
  const credited = media.filter((m) => m.credit);
  const text = credited.map((m) => m.credit!.attribution).join('\n');
  return (
    <Modal
      title={t('credits.title')}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.ok')}
          </button>
          <button
            className="btn primary"
            disabled={!text}
            onClick={() => void navigator.clipboard.writeText(text).then(() => toast(t('credits.copied'), 'success'))}
          >
            {t('credits.copy')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {credited.length ? t('credits.hint') : t('credits.none')}
      </p>
      {credited.map((m) => (
        <div key={m.id} className="credit-row">
          <div className="credit-title">{m.credit!.title}</div>
          <div className="credit-meta">
            {m.credit!.author || t('credits.unknown')} · {m.credit!.license} ·{' '}
            <a href={m.credit!.sourceUrl} target="_blank" rel="noreferrer">
              {t('credits.source')}
            </a>
          </div>
        </div>
      ))}
      {text && <textarea className="text-input credit-text" readOnly value={text} rows={Math.min(8, credited.length + 1)} />}
    </Modal>
  );
}

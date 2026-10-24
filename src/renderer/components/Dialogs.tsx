import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppInfo, AutosaveData, EncoderChoice, ExportFormat, ExportQuality, ExportResult, HwEncoder } from '../../shared/api';
import { setPrefs, usePrefs } from '../store/prefs';
import { restoreAutosave } from '../store/autosave';
import { emptySlot, projectDuration } from '../core/project';
import { formatBytes, formatDuration } from '../core/time';
import { AUDIO_ONLY, runExport, type CancelToken, type ExportProgress } from '../engine/exporter';
import { player } from '../engine/player';
import { useT, type I18nKey } from '../i18n';
import { api } from '../api';
import { APP_NAME, SITE_URL, SOURCE_URL } from '../../shared/brand';
import { markedRange, openDialog } from '../store/actions';
import { edit, useEditor } from '../store/editor';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/controls';
import { deletePreset, saveExportPreset, usePresets, type ExportPreset } from '../store/presets';
import { Modal } from './Modal';
import { BackgroundDialog, SubtitlesDialog } from './AiDialog';
import { CreditsDialog, EnhanceDialog, PasteAttributesDialog, VoiceoverDialog, type EnhanceKind } from './ToolDialogs';

const ENHANCE_KINDS: EnhanceKind[] = ['stabilize', 'denoise', 'loudness', 'scenes', 'beats', 'duck', 'silence'];
import { PrefsDialog } from './PrefsDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { ShadertoyDialog } from './ShadertoyDialog';
import { PublishDialog } from './PublishDialog';
import { LinkImportDialog } from './LinkImportDialog';
import { FillTemplateDialog, TemplatesDialog } from './TemplateDialogs';
import { NewProjectDialog } from './NewProjectDialog';
import { WelcomeDialog } from './Onboarding';
import { AutoMontageDialog } from './AutoMontageDialog';
import { DynamicDialog } from './DynamicDialog';

export function Dialogs() {
  const dialog = useEditor((s) => s.dialog);
  const recovery = useEditor((s) => s.recovery);
  const close = () => openDialog(null);
  if (recovery) return <RecoveryDialog data={recovery} />;
  if (dialog === 'export') return <ExportDialog onClose={close} />;
  if (dialog === 'settings') return <SettingsDialog onClose={close} />;
  if (dialog === 'about') return <AboutDialog onClose={close} />;
  if (dialog === 'shortcuts') return <ShortcutsDialog onClose={close} />;
  if (dialog === 'prefs') return <PrefsDialog onClose={close} />;
  if (dialog === 'ai-subs') return <SubtitlesDialog onClose={close} />;
  if (dialog === 'ai-bg') return <BackgroundDialog onClose={close} />;
  if (dialog === 'paste-attrs') return <PasteAttributesDialog onClose={close} />;
  if (dialog === 'voiceover') return <VoiceoverDialog onClose={close} />;
  if (dialog === 'credits') return <CreditsDialog onClose={close} />;
  if (dialog === 'shadertoy') return <ShadertoyDialog onClose={close} />;
  if (dialog === 'publish') return <PublishDialog onClose={close} />;
  if (dialog === 'link') return <LinkImportDialog onClose={close} />;
  if (dialog === 'templates') return <TemplatesDialog onClose={close} />;
  if (dialog === 'fillTemplate') return <FillTemplateDialog onClose={close} />;
  if (dialog === 'newProject') return <NewProjectDialog onClose={close} />;
  if (dialog === 'welcome') return <WelcomeDialog onClose={close} />;
  if (dialog === 'autoMontage') return <AutoMontageDialog onClose={close} />;
  if (dialog === 'dynamic') return <DynamicDialog onClose={close} />;
  if (dialog && ENHANCE_KINDS.includes(dialog as EnhanceKind)) return <EnhanceDialog kind={dialog as EnhanceKind} onClose={close} />;
  return null;
}

// ---------------------------------------------------------------------------
// Crash recovery and preferences

function RecoveryDialog({ data }: { data: AutosaveData }) {
  const t = useT();
  const dismiss = () => {
    useEditor.setState({ recovery: null });
    void api.autosaveClear();
  };
  return (
    <Modal
      title={t('recovery.title')}
      footer={
        <>
          <button className="btn" onClick={dismiss}>
            {t('recovery.discard')}
          </button>
          <button className="btn primary" onClick={() => restoreAutosave(data)}>
            {t('recovery.restore')}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{t('recovery.text', { name: data.meta.name, time: new Date(data.savedAt).toLocaleString() })}</p>
      {data.meta.filePath && <p className="panel-hint" style={{ margin: 0, userSelect: 'text' }}>{data.meta.filePath}</p>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Export

const FORMATS: ExportFormat[] = ['mp4', 'mp4-hevc', 'webm', 'mov-prores', 'gif', 'mp3', 'wav'];
const EXT: Record<ExportFormat, string> = { mp4: 'mp4', 'mp4-hevc': 'mp4', webm: 'webm', 'mov-prores': 'mov', gif: 'gif', mp3: 'mp3', wav: 'wav' };
const HEIGHTS = [2160, 1440, 1080, 720, 480, 360];
const HW_NAMES: Record<HwEncoder, string> = { nvenc: 'NVIDIA NVENC', qsv: 'Intel Quick Sync', amf: 'AMD AMF' };

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Ready-made export settings; `short` is the shorter side (0 = project size), fps 0 = project rate. */
const BUILTIN_EXPORTS: (Omit<ExportPreset, 'name'> & { nameKey: I18nKey })[] = [
  { id: 'b:youtube4k', nameKey: 'export.p.youtube4k', format: 'mp4', short: 2160, fps: 0, quality: 'high' },
  { id: 'b:youtube', nameKey: 'export.p.youtube', format: 'mp4', short: 1080, fps: 0, quality: 'high' },
  { id: 'b:social', nameKey: 'export.p.social', format: 'mp4', short: 1080, fps: 30, quality: 'high', bitrate: 12 },
  { id: 'b:messenger', nameKey: 'export.p.messenger', format: 'mp4', short: 720, fps: 30, quality: 'medium', bitrate: 3, audioBitrate: 128 },
  { id: 'b:master', nameKey: 'export.p.master', format: 'mov-prores', short: 0, fps: 0, quality: 'high' },
  { id: 'b:web', nameKey: 'export.p.web', format: 'webm', short: 1080, fps: 0, quality: 'medium' },
  { id: 'b:gif', nameKey: 'export.p.gif', format: 'gif', short: 480, fps: 15, quality: 'medium' },
  { id: 'b:mp3', nameKey: 'export.p.mp3', format: 'mp3', short: 0, fps: 0, quality: 'high' },
];
const AUDIO_RATES = [96, 128, 160, 192, 256, 320];

function ExportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const project = useEditor((s) => s.project);
  const filePath = useEditor((s) => s.filePath);
  const s = project.settings;
  const duration = projectDuration(project);
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [height, setHeight] = useState<number>(s.height);
  const [customHeight, setCustomHeight] = useState(false);
  const [fps, setFps] = useState<number>(s.fps);
  const [quality, setQuality] = useState<ExportQuality>('high');
  /** Target video bitrate in Mbit/s; null uses the quality level. */
  const [bitrate, setBitrate] = useState<number | null>(null);
  /** 0 = the format's default. */
  const [audioBitrate, setAudioBitrate] = useState(0);
  const [presetId, setPresetId] = useState('');
  const myPresets = usePresets((p) => p.exports);
  const [outPath, setOutPath] = useState('');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const token = useRef<CancelToken>({ cancelled: false });
  const encoder = usePrefs((p) => p.encoder);
  // Plain values from the store: an object built in the selector would change on every read.
  const markIn = useEditor((s) => s.project.markIn ?? null);
  const markOut = useEditor((s) => s.project.markOut ?? null);
  const marked = useMemo(() => (markIn != null || markOut != null ? markedRange() : null), [markIn, markOut, duration]);
  const [useRange, setUseRange] = useState(!!marked);
  const [hw, setHw] = useState<HwEncoder[]>([]);
  useEffect(() => {
    void api.hwEncoders().then(setHw);
  }, []);

  const width = even((s.width * height) / s.height);
  const h = even(height);
  const audioOnly = AUDIO_ONLY.includes(format);
  const usesEncoderChoice = format === 'mp4' || format === 'mp4-hevc';
  const supportsBitrate = format === 'mp4' || format === 'mp4-hevc' || format === 'webm';
  const supportsAudioRate = format === 'mp4' || format === 'mp4-hevc' || format === 'webm' || format === 'mp3';
  const landscape = s.width >= s.height;
  const heightForShort = (short: number) => (short <= 0 ? s.height : landscape ? short : even((short * s.height) / s.width));

  /** Any manual change leaves the chosen preset. */
  const manual = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPresetId('');
  };

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = BUILTIN_EXPORTS.find((x) => x.id === id) ?? myPresets.find((x) => x.id === id);
    if (!p) return;
    setFormat(p.format);
    const nextHeight = heightForShort(p.short);
    setHeight(nextHeight);
    setCustomHeight(!heights.includes(nextHeight));
    setFps(p.fps > 0 ? p.fps : s.fps);
    setQuality(p.quality);
    setBitrate(p.bitrate ?? null);
    setAudioBitrate(p.audioBitrate ?? 0);
  };

  const saveAsPreset = async () => {
    const saved = await saveExportPreset({
      format,
      short: Math.min(width, h),
      fps,
      quality,
      bitrate: supportsBitrate && bitrate ? bitrate : undefined,
      audioBitrate: supportsAudioRate && audioBitrate ? audioBitrate : undefined,
    });
    if (saved) setPresetId(saved.id);
  };

  const estimate = (() => {
    if (!bitrate || !supportsBitrate) return null;
    const seconds = useRange && marked ? marked.end - marked.start : duration;
    const audio = (audioBitrate || (format === 'webm' ? 160 : 192)) * 1000;
    return formatBytes(((bitrate * 1e6 + audio) / 8) * seconds);
  })();

  useEffect(() => {
    player.pause();
    const base = (project.name || 'video').replace(/[\\/:*?"<>|]/g, '_');
    const dir = filePath ? filePath.replace(/[\\/][^\\/]*$/, '') : '';
    setOutPath(dir ? `${dir}\\${base}.${EXT.mp4}` : '');
  }, [project.name, filePath]);

  // Keep the extension in sync with the chosen format.
  useEffect(() => {
    setOutPath((p) => (p ? p.replace(/\.[^.\\/]+$/, '') + '.' + EXT[format] : p));
    if (format === 'gif') {
      setHeight((x) => Math.min(x, 480));
      setFps((x) => Math.min(x, 15));
    }
  }, [format]);

  const heights = useMemo(() => {
    const list = new Set([s.height, ...HEIGHTS.filter((x) => x <= Math.max(s.height, 2160))]);
    return [...list].sort((a, b) => b - a);
  }, [s.height]);

  const browse = async () => {
    const base = (project.name || 'video').replace(/[\\/:*?"<>|]/g, '_');
    const p = await api.saveFileDialog(outPath || `${base}.${EXT[format]}`, [{ name: t(`fmt.${format}` as I18nKey), extensions: [EXT[format]] }]);
    if (p) setOutPath(p);
    return p;
  };

  const start = async () => {
    let target = outPath;
    if (!target) {
      const p = await browse();
      if (!p) return;
      target = p;
    }
    token.current = { cancelled: false };
    setRunning(true);
    setResult(null);
    setProgress(null);
    const range = useRange && marked ? marked : undefined;
    const r = await runExport(
      {
        outPath: target,
        format,
        width,
        height: h,
        fps,
        quality,
        bitrate: supportsBitrate && bitrate ? bitrate : undefined,
        audioBitrate: supportsAudioRate && audioBitrate ? audioBitrate : undefined,
        encoder,
        range,
      },
      setProgress,
      token.current,
    );
    setRunning(false);
    if (r.error === 'cancelled') {
      setProgress(null);
      return;
    }
    if (r.error === 'empty') {
      setResult({ ok: false, error: t('export.empty') });
      return;
    }
    setResult(r);
    if (r.ok) setOutPath(target);
  };

  const pct = progress ? Math.round((progress.frame / progress.total) * 100) : 0;
  const eta = progress && progress.etaSeconds > 0 ? formatDuration(progress.etaSeconds) : '';

  return (
    <Modal
      title={t('export.title')}
      onClose={running ? undefined : onClose}
      width={560}
      footer={
        running ? (
          <button className="btn danger" onClick={() => (token.current.cancelled = true)}>
            {t('export.cancel')}
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              {t('common.close')}
            </button>
            <button className="btn primary" onClick={() => void start()} disabled={duration <= 0}>
              <Icon name="export" size={16} />
              {t('export.start')}
            </button>
          </>
        )
      }
    >
      {duration <= 0 && <div className="error-box">{t('export.empty')}</div>}
      {project.media.some(emptySlot) && (
        <p className="panel-hint" style={{ margin: 0 }}>
          {t('export.emptySlots')}{' '}
          <button className="link-btn" onClick={() => openDialog('fillTemplate')}>
            {t('tpl.fill')}
          </button>
        </p>
      )}
      <div className="field">
        <label className="field-label">{t('export.file')}</label>
        <div className="file-row">
          <input className="text-input" value={outPath} onChange={(e) => setOutPath(e.target.value)} disabled={running} />
          <button className="btn" onClick={() => void browse()} disabled={running}>
            {t('common.browse')}
          </button>
        </div>
      </div>
      <div className="field">
        <label className="field-label">{t('export.preset')}</label>
        <div className="file-row">
          <select className="select" value={presetId} disabled={running} onChange={(e) => applyPreset(e.target.value)}>
            <option value="">{t('export.preset.custom')}</option>
            <optgroup label={t('export.preset.builtIn')}>
              {BUILTIN_EXPORTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.nameKey)}
                </option>
              ))}
            </optgroup>
            {myPresets.length > 0 && (
              <optgroup label={t('export.preset.mine')}>
                {myPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <IconButton icon="save" title={t('presets.saveExport')} disabled={running} onClick={() => void saveAsPreset()} />
          {myPresets.some((p) => p.id === presetId) && (
            <IconButton icon="trash" title={t('common.delete')} disabled={running} onClick={() => void deletePreset('exports', presetId).then(() => setPresetId(''))} />
          )}
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">{t('export.format')}</label>
          <select className="select" value={format} disabled={running} onChange={(e) => manual(setFormat)(e.target.value as ExportFormat)}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {t(`fmt.${f}` as I18nKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">{t('export.quality')}</label>
          <select
            className="select"
            value={supportsBitrate && bitrate ? 'bitrate' : quality}
            disabled={running}
            onChange={(e) => manual((v: string) => {
              if (v === 'bitrate') {
                // A sensible start: about 0.1 bit per pixel per frame.
                setBitrate(Math.max(1, Math.round((width * h * fps * 0.1) / 1e6)));
              } else {
                setBitrate(null);
                setQuality(v as ExportQuality);
              }
            })(e.target.value)}
          >
            <option value="high">{t('export.q.high')}</option>
            <option value="medium">{t('export.q.medium')}</option>
            <option value="low">{t('export.q.low')}</option>
            {supportsBitrate && <option value="bitrate">{t('export.q.bitrate')}</option>}
          </select>
        </div>
        {supportsBitrate && bitrate !== null && (
          <div className="field">
            <label className="field-label">{t('export.bitrate')}</label>
            <input
              className="text-input"
              type="number"
              min={0.5}
              max={400}
              step={0.5}
              value={bitrate}
              disabled={running}
              onChange={(e) => manual(setBitrate)(Math.min(400, Math.max(0.5, Number(e.target.value) || 0.5)))}
            />
          </div>
        )}
        {supportsAudioRate && (
          <div className="field">
            <label className="field-label">{t('export.audioBitrate')}</label>
            <select className="select" value={audioBitrate} disabled={running} onChange={(e) => manual(setAudioBitrate)(Number(e.target.value))}>
              <option value={0}>{t('export.audioAuto')}</option>
              {AUDIO_RATES.map((r) => (
                <option key={r} value={r}>
                  {r} kbit/s
                </option>
              ))}
            </select>
          </div>
        )}
        {!audioOnly && (
          <>
            <div className="field">
              <label className="field-label">{t('export.resolution')}</label>
              <select
                className="select"
                value={customHeight ? 'custom' : height}
                disabled={running}
                onChange={(e) => manual((v: string) => {
                  if (v === 'custom') setCustomHeight(true);
                  else {
                    setCustomHeight(false);
                    setHeight(Number(v));
                  }
                })(e.target.value)}
              >
                {heights.map((x) => (
                  <option key={x} value={x}>
                    {x === s.height ? t('export.projectRes', { w: s.width, h: s.height }) : `${even((s.width * x) / s.height)}×${even(x)}`}
                  </option>
                ))}
                <option value="custom">{customHeight ? `${width}×${h}` : t('export.customRes')}</option>
              </select>
            </div>
            {customHeight && (
              <div className="field">
                <label className="field-label">{t('export.height')}</label>
                <input
                  className="text-input"
                  type="number"
                  min={16}
                  max={8192}
                  step={2}
                  value={height}
                  disabled={running}
                  onChange={(e) => manual(setHeight)(Math.min(8192, Math.max(16, Number(e.target.value) || 16)))}
                />
              </div>
            )}
            <div className="field">
              <label className="field-label">{t('export.fps')}</label>
              <select className="select" value={fps} disabled={running} onChange={(e) => manual(setFps)(Number(e.target.value))}>
                {[...new Set([s.fps, 10, 12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120])].sort((a, b) => a - b).map((x) => (
                  <option key={x} value={x}>
                    {x} fps
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {marked && (
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">{t('export.range')}</label>
            <div className="seg">
              <button className={!useRange ? 'active' : ''} disabled={running} onClick={() => setUseRange(false)}>
                {t('export.rangeAll')}
              </button>
              <button className={useRange ? 'active' : ''} disabled={running} onClick={() => setUseRange(true)}>
                {t('export.rangeMarked', { a: formatDuration(marked.start), b: formatDuration(marked.end) })}
              </button>
            </div>
          </div>
        )}
        {usesEncoderChoice && (
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">{t('export.encoder')}</label>
            <select
              className="select"
              value={encoder}
              disabled={running}
              onChange={(e) => setPrefs({ encoder: e.target.value as EncoderChoice })}
            >
              <option value="auto">
                {t('export.enc.auto')}
                {hw.length ? ` — ${HW_NAMES[hw[0]]}` : ` — ${t('export.enc.cpu')}`}
              </option>
              <option value="cpu">{t('export.enc.cpu')}</option>
              {hw.map((x) => (
                <option key={x} value={x}>
                  {HW_NAMES[x]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="panel-hint" style={{ margin: 0 }}>
        {t('export.summary', {
          duration: formatDuration(useRange && marked ? marked.end - marked.start : duration),
          w: audioOnly ? '—' : width,
          h: audioOnly ? '—' : h,
          fps: audioOnly ? '—' : fps,
        })}
        {estimate && ` · ${t('export.estimate', { size: estimate })}`}
      </div>
      {(running || progress) && !result && (
        <div className="export-status">
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="line">
            <span>{progress?.phase === 'finish' ? t('export.encoding') : t('export.rendering', { n: progress?.frame ?? 0, total: progress?.total ?? 0 })}</span>
            <span>{progress && progress.phase === 'render' ? t('export.eta', { fps: progress.fps.toFixed(1), eta }) : ''}</span>
          </div>
        </div>
      )}
      {result?.ok && (
        <div className="success-box">
          <Icon name="check" size={20} />
          <span style={{ flex: 1 }}>
            {t('export.done')}
            {result.stats && (
              <span className="panel-hint" style={{ display: 'block', margin: 0 }}>
                {t('export.doneStats', {
                  time: formatDuration(result.stats.seconds),
                  fps: (result.stats.frames / Math.max(0.001, result.stats.seconds)).toFixed(1),
                  encoder: result.encoder ?? '',
                })}
              </span>
            )}
          </span>
          <button className="btn small" onClick={() => api.showItemInFolder(outPath)}>
            {t('export.showFile')}
          </button>
        </div>
      )}
      {result && !result.ok && (
        <>
          <strong style={{ color: 'var(--danger)' }}>{t('export.failed')}</strong>
          <div className="error-box">{result.error}</div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Project settings

const PRESETS: { key: I18nKey; w: number; h: number }[] = [
  { key: 'preset.landscape1080', w: 1920, h: 1080 },
  { key: 'preset.landscape4k', w: 3840, h: 2160 },
  { key: 'preset.landscape720', w: 1280, h: 720 },
  { key: 'preset.vertical', w: 1080, h: 1920 },
  { key: 'preset.square', w: 1080, h: 1080 },
  { key: 'preset.portrait', w: 1080, h: 1350 },
  { key: 'preset.classic', w: 1440, h: 1080 },
  { key: 'preset.cinema', w: 2560, h: 1080 },
];
const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const project = useEditor((s) => s.project);
  const [name, setName] = useState(project.name);
  const [w, setW] = useState(project.settings.width);
  const [h, setH] = useState(project.settings.height);
  const [fps, setFps] = useState(project.settings.fps);
  const [bg, setBg] = useState(project.settings.background);
  const preset = PRESETS.findIndex((p) => p.w === w && p.h === h);

  const apply = () => {
    edit((d) => {
      d.name = name.trim() || d.name;
      d.settings.width = even(Math.min(8192, Math.max(16, w)));
      d.settings.height = even(Math.min(8192, Math.max(16, h)));
      d.settings.fps = fps;
      d.settings.background = bg;
      // A format chosen by hand is no longer taken from the first video.
      delete d.autoFormat;
    });
    onClose();
  };

  return (
    <Modal
      title={t('settings.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={apply}>
            {t('common.apply')}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">{t('settings.name')}</label>
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label">{t('settings.preset')}</label>
        <select
          className="select"
          value={preset}
          onChange={(e) => {
            const p = PRESETS[Number(e.target.value)];
            if (p) {
              setW(p.w);
              setH(p.h);
            }
          }}
        >
          {preset < 0 && <option value={-1}>{t('settings.custom')}</option>}
          {PRESETS.map((p, i) => (
            <option key={p.key} value={i}>
              {t(p.key)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">{t('settings.width')}</label>
          <input className="text-input" type="number" value={w} onChange={(e) => setW(Number(e.target.value))} />
        </div>
        <div className="field">
          <label className="field-label">{t('settings.height')}</label>
          <input className="text-input" type="number" value={h} onChange={(e) => setH(Number(e.target.value))} />
        </div>
        <div className="field">
          <label className="field-label">{t('settings.fps')}</label>
          <select className="select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            {[...new Set([fps, ...FPS_OPTIONS])].sort((a, b) => a - b).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">{t('settings.background')}</label>
          <div className="color-row">
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
            <span className="color-hex">{bg.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void api.appInfo().then(setInfo);
  }, []);
  return (
    <Modal title={t('menu.about')} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>{t('common.ok')}</button>}>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <img className="brand-logo" src="./logo.png" alt="" draggable={false} style={{ width: 48, height: 48, flex: 'none', borderRadius: 12 }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{APP_NAME} {info?.version}</div>
          <div className="panel-hint" style={{ margin: 0 }}>
            {t('app.tagline')}
          </div>
        </div>
      </div>
      <p style={{ margin: 0 }}>{t('about.text')}</p>
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('about.license')}
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => window.open(`${SITE_URL}#support`)}>
          {t('menu.support')}
        </button>
        <button className="btn" onClick={() => window.open(SITE_URL)}>
          {t('menu.website')}
        </button>
        <button className="btn" onClick={() => window.open(SOURCE_URL)}>
          {t('about.source')}
        </button>
      </div>
      {info && (
        <dl className="info-table">
          <dt>Electron</dt>
          <dd>{info.electron}</dd>
          <dt>Chromium</dt>
          <dd>{info.chrome}</dd>
          <dt>FFmpeg</dt>
          <dd style={{ userSelect: 'text' }}>{info.ffmpegVersion}</dd>
          <dt>Platform</dt>
          <dd>{info.platform}</dd>
        </dl>
      )}
    </Modal>
  );
}


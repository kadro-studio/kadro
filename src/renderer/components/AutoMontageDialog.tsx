// Auto montage window: pick a song and pictures, choose the pace and style.
import { useMemo, useState } from 'react';
import { mediaUrl } from '../../shared/api';
import { emptySlot } from '../core/project';
import { formatDuration } from '../core/time';
import { useT, type I18nKey } from '../i18n';
import { useEditor } from '../store/editor';
import { errText, importViaDialog } from '../store/media';
import { buildMontage, type MontageRhythm, type MontageStyle } from '../store/montage';
import { Icon } from '../ui/Icon';
import { ToggleField } from '../ui/controls';
import { Modal } from './Modal';

const RHYTHMS: { v: MontageRhythm; label: I18nKey }[] = [
  { v: 'auto', label: 'mt.r.auto' },
  { v: 1, label: 'mt.r.1' },
  { v: 2, label: 'mt.r.2' },
  { v: 4, label: 'mt.r.4' },
];
const STYLES: { v: MontageStyle; label: I18nKey }[] = [
  { v: 'cut', label: 'mt.s.cut' },
  { v: 'smooth', label: 'mt.s.smooth' },
  { v: 'dynamic', label: 'mt.s.dynamic' },
];
const LENGTHS: { v: number | null; label: string }[] = [
  { v: null, label: '' },
  { v: 15, label: '15 s' },
  { v: 30, label: '30 s' },
  { v: 60, label: '60 s' },
];

export function AutoMontageDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const media = useEditor((s) => s.project.media);
  const runtime = useEditor((s) => s.runtime);
  const songs = useMemo(() => media.filter((m) => !emptySlot(m) && (m.kind === 'audio' || (m.kind === 'video' && m.hasAudio && m.duration > 5))), [media]);
  const pics = useMemo(() => media.filter((m) => !emptySlot(m) && (m.kind === 'video' || m.kind === 'image')), [media]);
  const [musicId, setMusicId] = useState(() => songs.find((m) => m.kind === 'audio')?.id ?? songs[0]?.id ?? '');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(pics.map((m) => m.id)));
  const [rhythm, setRhythm] = useState<MontageRhythm>('auto');
  const [style, setStyle] = useState<MontageStyle>('dynamic');
  const [shuffle, setShuffle] = useState(false);
  const [punch, setPunch] = useState(true);
  const [length, setLength] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = pics.filter((m) => picked.has(m.id));
  const music = songs.find((m) => m.id === musicId) ?? songs[0];
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const run = async () => {
    if (!music || chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await buildMontage({ musicId: music.id, mediaIds: chosen.map((m) => m.id), rhythm, style, shuffle, punch, length });
      onClose();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };

  const importMore = async () => {
    const added = await importViaDialog();
    setPicked((s) => new Set([...s, ...added.map((m) => m.id)]));
    const song = added.find((m) => m.kind === 'audio');
    if (song && !musicId) setMusicId(song.id);
  };

  return (
    <Modal
      title={t('mt.title')}
      onClose={busy ? undefined : onClose}
      width={680}
      footer={
        <>
          <button className="btn" disabled={busy} onClick={() => void importMore()}>
            <Icon name="import" size={15} />
            {t('mt.import')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={busy || !music || chosen.length === 0} onClick={() => void run()}>
            {busy ? t('mt.working') : t('mt.make')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('mt.hint')}
      </p>
      <div className="field">
        <label className="field-label">{t('mt.music')}</label>
        {songs.length ? (
          <select className="select" value={music?.id} onChange={(e) => setMusicId(e.target.value)}>
            {songs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {formatDuration(m.duration)}
              </option>
            ))}
          </select>
        ) : (
          <span className="panel-hint" style={{ margin: 0 }}>
            {t('mt.noMusic')}
          </span>
        )}
      </div>
      <div className="field">
        <label className="field-label">
          {t('mt.pictures', { n: chosen.length, total: pics.length })}
        </label>
        {pics.length ? (
          <div className="mt-grid">
            {pics.map((m) => {
              const thumb = runtime[m.id]?.thumb;
              const on = picked.has(m.id);
              return (
                <button key={m.id} className={`mt-pic ${on ? 'on' : ''}`} title={m.name} onClick={() => toggle(m.id)} style={thumb ? { backgroundImage: `url("${mediaUrl(thumb)}")` } : undefined}>
                  {!thumb && <Icon name={m.kind === 'image' ? 'image' : 'film'} size={18} />}
                  <span className="mt-check">{on && <Icon name="check" size={12} />}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <span className="panel-hint" style={{ margin: 0 }}>
            {t('mt.noPictures')}
          </span>
        )}
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">{t('mt.rhythm')}</label>
          <div className="seg">
            {RHYTHMS.map((r) => (
              <button key={String(r.v)} className={rhythm === r.v ? 'active' : ''} onClick={() => setRhythm(r.v)}>
                {t(r.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">{t('mt.style')}</label>
          <div className="seg">
            {STYLES.map((s) => (
              <button key={s.v} className={style === s.v ? 'active' : ''} onClick={() => setStyle(s.v)}>
                {t(s.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">{t('mt.length')}</label>
          <div className="seg">
            {LENGTHS.map((l) => (
              <button key={String(l.v)} className={length === l.v ? 'active' : ''} onClick={() => setLength(l.v)}>
                {l.v === null ? t('mt.wholeSong') : l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <ToggleField label={t('mt.punch')} value={punch} onChange={setPunch} />
          <ToggleField label={t('mt.shuffle')} value={shuffle} onChange={setShuffle} />
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

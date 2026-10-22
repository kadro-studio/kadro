import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryItem, LibraryKind } from '../../shared/api';
import { useT, type I18nKey } from '../i18n';
import { openDialog } from '../store/actions';
import { addFromLibrary, LIBRARY_SOURCES, searchSource, type LibrarySource } from '../store/library';
import { usePrefs } from '../store/prefs';
import { Icon } from '../ui/Icon';

const KINDS: { id: LibraryKind; label: I18nKey }[] = [
  { id: 'video', label: 'library.video' },
  { id: 'image', label: 'library.photo' },
  { id: 'audio', label: 'library.audio' },
];

// Labels follow the interface language; the query stays English, which the sources index best.
const IDEAS: Record<LibraryKind, string[]> = {
  video: ['ocean', 'city', 'space', 'forest', 'clouds', 'fire'],
  image: ['mountains', 'sunset', 'city', 'food', 'flowers', 'texture'],
  audio: ['ambient', 'piano', 'rock', 'cinematic', 'whoosh', 'applause'],
};

function shortLicense(l: string): string {
  if (/^cc0/i.test(l)) return 'CC0';
  if (/public domain|^pd/i.test(l)) return 'PD';
  const m = /CC[ -]?(BY(?:-SA)?)/i.exec(l);
  if (m) return m[1].toUpperCase();
  if (/pexels/i.test(l)) return 'Pexels';
  if (/pixabay/i.test(l)) return 'Pixabay';
  return l.slice(0, 8);
}

function formatDuration(s?: number): string {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Free photos, video, music and sound effects with their licences. */
export function LibraryPanel() {
  const t = useT();
  const [kind, setKind] = useState<LibraryKind>('video');
  const sources = useMemo(() => LIBRARY_SOURCES.filter((s) => s.kind === kind), [kind]);
  const [sourceId, setSourceId] = useState(sources[0].id);
  const source = sources.find((s) => s.id === sourceId) ?? sources[0];
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = usePrefs((p) => p.libraryKeys);
  const missingKey = source.needsKey && !keys[source.needsKey];
  const searchId = useRef(0);

  const run = async (src: LibrarySource, q: string, p: number) => {
    const id = ++searchId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await searchSource(src, q, p);
      if (id !== searchId.current) return;
      setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items]));
      setHasMore(r.hasMore);
      setPage(p);
    } catch (e) {
      if (id !== searchId.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('NO_KEY') ? null : msg.includes('API key') ? t('library.badKey') : t('library.offline', { err: msg }));
      if (p === 1) setItems([]);
    } finally {
      if (id === searchId.current) setLoading(false);
    }
  };

  // A fresh search whenever the kind or source changes (popular items first).
  useEffect(() => {
    if (missingKey) {
      setItems([]);
      return;
    }
    void run(source, query, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, missingKey]);

  const changeKind = (k: LibraryKind) => {
    // A photo query rarely makes sense for music, so each type starts fresh.
    setQuery('');
    setKind(k);
    setSourceId(LIBRARY_SOURCES.find((s) => s.kind === k)!.id);
  };

  return (
    <div className="library">
      <div className="seg">
        {KINDS.map((k) => (
          <button key={k.id} className={kind === k.id ? 'active' : ''} onClick={() => changeKind(k.id)}>
            {t(k.label)}
          </button>
        ))}
      </div>
      <form
        className="library-search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(source, query, 1);
        }}
      >
        <input className="text-input" placeholder={t('library.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" value={source.id} onChange={(e) => setSourceId(e.target.value)} title={t('library.source')}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.audioCategory ? `${t(s.audioCategory === 'music' ? 'library.music' : 'library.sfx')} · ${s.label}` : s.label}
              {s.needsKey ? ' 🔑' : ''}
            </option>
          ))}
        </select>
      </form>
      <div className="library-ideas">
        {IDEAS[kind].map((q) => (
          <button
            key={q}
            className="chip"
            onClick={() => {
              setQuery(q);
              void run(source, q, 1);
            }}
          >
            {t(`library.idea.${q}` as I18nKey)}
          </button>
        ))}
      </div>
      {missingKey ? (
        <div className="library-note">
          <p>{t('library.needKey', { name: source.label })}</p>
          <button className="btn small primary" onClick={() => openDialog('prefs')}>
            {t('library.addKey')}
          </button>
        </div>
      ) : (
        <>
          {error && <div className="error-box">{error}</div>}
          <div className={`library-grid ${kind === 'audio' ? 'audio' : ''}`}>
            {items.map((item) => (
              <LibraryCard key={item.id} item={item} />
            ))}
          </div>
          {loading && <div className="progress indeterminate library-loading"><div /></div>}
          {!loading && !error && items.length === 0 && <p className="panel-hint">{t('library.nothing')}</p>}
          {hasMore && !loading && (
            <button className="btn block" onClick={() => void run(source, query, page + 1)}>
              {t('library.more')}
            </button>
          )}
        </>
      )}
      <p className="panel-hint library-legal">{t('library.legal')}</p>
    </div>
  );
}

let audioEl: HTMLAudioElement | null = null;

function LibraryCard({ item }: { item: LibraryItem }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => {
    if (playing && audioEl) audioEl.pause();
  }, [playing]);

  const add = async () => {
    if (state !== 'idle') return;
    setState('loading');
    const asset = await addFromLibrary(item, setProgress);
    setState(asset ? 'done' : 'idle');
  };

  const toggleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.preview) return;
    audioEl ??= new Audio();
    if (playing) {
      audioEl.pause();
      setPlaying(false);
      return;
    }
    audioEl.src = item.preview;
    audioEl.onended = () => setPlaying(false);
    void audioEl.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const info = [item.author, shortLicense(item.license)].filter(Boolean).join(' · ');
  const tip = `${item.title}\n${item.attribution}`;
  if (item.kind === 'audio') {
    return (
      <div className="library-row" title={tip}>
        <button className="icon-btn" onClick={toggleAudio} title={playing ? t('library.stop') : t('library.listen')}>
          <Icon name={playing ? 'pauseSmall' : 'playSmall'} size={16} />
        </button>
        <div className="library-row-text">
          <div className="library-title">{item.title}</div>
          <div className="library-meta">
            {formatDuration(item.duration)} {info}
          </div>
        </div>
        <button className={`btn small ${state === 'done' ? '' : 'primary'}`} disabled={state !== 'idle'} onClick={() => void add()}>
          {state === 'loading' ? `${Math.round(progress * 100)}%` : state === 'done' ? '✓' : t('library.add')}
        </button>
      </div>
    );
  }
  return (
    <button className="library-card" title={tip} onClick={() => void add()} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <img src={item.thumb} alt="" loading="lazy" />
      {hover && item.preview && item.kind === 'video' && <video src={item.preview} autoPlay muted loop playsInline />}
      {item.duration ? <span className="media-badge">{formatDuration(item.duration)}</span> : null}
      <span className="library-license">{shortLicense(item.license)}</span>
      <span className="library-author">{info}</span>
      {state !== 'idle' && (
        <span className="library-state">
          {state === 'loading' ? (
            <>
              <span>{Math.round(progress * 100)}%</span>
              <span className="progress">
                <span style={{ width: `${progress * 100}%` }} />
              </span>
            </>
          ) : (
            <Icon name="check" size={22} />
          )}
        </span>
      )}
    </button>
  );
}

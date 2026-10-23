// One-time import of the user's own TikTok video by link.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useT } from '../i18n';
import { setLeftTab } from '../store/actions';
import { addFromLink } from '../store/library';
import { errText } from '../store/media';
import { Modal } from './Modal';

const TIKTOK = /^https?:\/\/([a-z0-9-]+\.)*tiktok\.com\//i;

type Stage = 'idle' | 'tool' | 'video';

/** Plain-language reasons for the usual yt-dlp failures. */
function reason(err: string): string | null {
  if (/private|log ?in|cookies|authenticat/i.test(err)) return 'link.err.private';
  if (/IP address is blocked/i.test(err)) return 'link.err.blocked';
  if (/not available|unavailable|removed|404|does not exist/i.test(err)) return 'link.err.gone';
  if (/too large/i.test(err)) return 'link.err.large';
  if (/unable to download webpage|timed out|getaddrinfo|network|ENOTFOUND|ECONN/i.test(err)) return 'link.err.network';
  return null;
}

export function LinkImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [url, setUrl] = useState('');
  const [own, setOwn] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toolInstalled, setToolInstalled] = useState(true);

  useEffect(() => {
    void api.linkToolStatus().then((s) => setToolInstalled(s.installed));
  }, []);

  const valid = TIKTOK.test(url.trim());
  const busy = stage !== 'idle';

  const start = async () => {
    if (!valid || !own || busy) return;
    setError(null);
    setProgress(0);
    setStage(toolInstalled ? 'video' : 'tool');
    try {
      const asset = await addFromLink(
        url.trim(),
        (p) => {
          setStage('tool');
          setProgress(p);
        },
        (p) => {
          setStage('video');
          setProgress(p);
        },
      );
      if (asset) {
        setLeftTab('media');
        onClose();
        return;
      }
      setError(t('link.err.unknown'));
    } catch (e) {
      const msg = errText(e);
      const key = reason(msg);
      setError(key ? t(key as Parameters<typeof t>[0]) : t('link.err.other', { err: msg }));
      void api.linkToolStatus().then((s) => setToolInstalled(s.installed));
    }
    setStage('idle');
  };

  return (
    <Modal
      title={t('link.title')}
      onClose={busy ? undefined : onClose}
      width={520}
      footer={
        <>
          <button className="btn" disabled={busy} onClick={onClose}>
            {t('common.close')}
          </button>
          <button className="btn primary" disabled={!valid || !own || busy} onClick={() => void start()}>
            {t('link.import')}
          </button>
        </>
      }
    >
      <p className="panel-hint" style={{ margin: 0 }}>
        {t('link.hint')}
      </p>
      <div className="field">
        <label className="field-label">{t('link.url')}</label>
        <input
          className="text-input"
          autoFocus
          value={url}
          disabled={busy}
          placeholder="https://www.tiktok.com/@…/video/…"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void start()}
        />
        {url.trim() && !valid && <span className="panel-hint" style={{ margin: 0 }}>{t('link.notTikTok')}</span>}
      </div>
      <label className="ws-agree">
        <input type="checkbox" checked={own} disabled={busy} onChange={(e) => setOwn(e.target.checked)} />
        <span>{t('link.own')}</span>
      </label>
      {!toolInstalled && !busy && (
        <p className="panel-hint" style={{ margin: 0 }}>
          {t('link.toolHint')}
        </p>
      )}
      {busy && (
        <div className="field">
          <span className="panel-hint" style={{ margin: 0 }}>
            {t(stage === 'tool' ? 'link.stage.tool' : 'link.stage.video')} {progress > 0 ? `${Math.round(progress * 100)}%` : ''}
          </span>
          <div className={`progress${progress > 0 ? '' : ' indeterminate'}`}>
            <div style={{ width: `${Math.max(progress, 0.02) * 100}%` }} />
          </div>
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

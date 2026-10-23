// A small card in the corner when a new version is ready (installed copy) or
// available to download (portable copy).
import { useT } from '../i18n';
import { restartToUpdate, useUpdates } from '../store/updates';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/controls';

export function UpdateBanner() {
  const t = useT();
  const status = useUpdates((s) => s.status);
  const dismissed = useUpdates((s) => s.dismissed);
  if (dismissed || (status.state !== 'ready' && status.state !== 'available')) return null;
  return (
    <div className="update-banner" role="status">
      <Icon name="sparkles" size={18} />
      <div className="update-text">
        <strong>{t('upd.title', { v: status.version })}</strong>
        <span>{t(status.state === 'ready' ? 'upd.readyHint' : 'upd.availableHint')}</span>
      </div>
      {status.state === 'ready' ? (
        <button className="btn small primary" onClick={() => void restartToUpdate()}>
          {t('upd.restart')}
        </button>
      ) : (
        <button className="btn small primary" onClick={() => window.open(status.url)}>
          {t('upd.download')}
        </button>
      )}
      <IconButton icon="close" title={t('upd.later')} onClick={() => useUpdates.setState({ dismissed: true })} />
    </div>
  );
}

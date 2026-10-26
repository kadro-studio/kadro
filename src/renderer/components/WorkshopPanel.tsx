// Community workshop browser in the left panel.
import { useEffect, useState } from 'react';
import type { WorkshopItem } from '../../shared/api';
import { api } from '../api';
import { useT, type I18nKey } from '../i18n';
import { openDialog } from '../store/actions';
import {
  installedVersion,
  installItem,
  loadItems,
  moderate,
  removeOwnItem,
  reportItem,
  resendConfirmation,
  openAccount,
  setFilter,
  signIn,
  signUp,
  toggleLike,
  useWorkshop,
  WORKSHOP_CLOSED,
  type KindFilter,
  type Sort,
} from '../store/workshop';
import { startFromTemplate, useTemplates } from '../store/templates';
import { confirmAction } from '../store/prompt';
import { Icon } from '../ui/Icon';

const KINDS: KindFilter[] = ['all', 'effect', 'transition', 'element', 'look', 'textStyle', 'lut', 'theme', 'template'];
const SORTS: Sort[] = ['popular', 'new', 'liked'];

function count(n: number): string {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function InstallButton({ item, small }: { item: WorkshopItem; small?: boolean }) {
  const t = useT();
  const busy = useWorkshop((s) => !!s.busy[item.id]);
  const installed = useWorkshop((s) => s.installed);
  const templates = useTemplates((s) => s.list);
  const version = installedVersion(item);
  // An installed template is started from right here.
  const template = item.kind === 'template' && version === item.version ? templates.find((x) => x.path === installed[String(item.id)]?.ref) : undefined;
  if (template && !small) {
    return (
      <button className="btn primary" onClick={() => void startFromTemplate(template)}>
        {t('tpl.use')}
      </button>
    );
  }
  const label = busy ? t('ws.installing') : version === null ? t('ws.install') : version !== item.version ? t('ws.update') : t('ws.installedShort');
  return (
    <button
      className={`btn ${small ? 'small' : ''} ${version === item.version ? '' : 'primary'}`}
      disabled={busy || version === item.version}
      onClick={(e) => {
        e.stopPropagation();
        void installItem(item);
      }}
    >
      {label}
    </button>
  );
}

function ItemCard({ item }: { item: WorkshopItem }) {
  const t = useT();
  return (
    <div className="ws-card" role="button" tabIndex={0} onClick={() => useWorkshop.setState({ open: item })}>
      <div className="preset-visual">
        {item.preview ? <img src={item.preview} alt="" className="fx-thumb" loading="lazy" /> : <Icon name="sparkles" size={24} />}
        {item.status === 'pending' && <span className="fx-badge">{t('ws.pending')}</span>}
        {item.status === 'draft' && item.rejected && <span className="fx-badge error">{t('ws.rejectedBadge')}</span>}
        {!!item.reports && <span className="fx-badge error">{t('ws.reportsCount', { n: item.reports })}</span>}
      </div>
      <div className="ws-card-body">
        <div className="ws-card-title" title={item.title}>
          {item.title}
        </div>
        <div className="ws-card-meta">
          <span title={t('ws.author')}>{item.author}</span>
          <span className="ws-stats">
            <Icon name="import" size={11} /> {count(item.downloads)}
            <Icon name="heart" size={11} /> {count(item.likes)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ItemDetails({ item }: { item: WorkshopItem }) {
  const t = useT();
  const account = useWorkshop((s) => s.account);
  const own = item.own ?? (!!account && account.name === item.author);
  const mod = !!account?.moderator;
  return (
    <div className="ws-details">
      <button className="btn small ws-back" onClick={() => useWorkshop.setState({ open: null })}>
        <Icon name="chevronLeft" size={14} />
        {t('ws.back')}
      </button>
      <div className="ws-hero">{item.preview ? <img src={item.preview} alt="" /> : <Icon name="sparkles" size={32} />}</div>
      <h3 className="ws-title">{item.title}</h3>
      <div className="ws-meta-line">
        {t(`ws.kind.${item.kind}` as I18nKey)} · {item.author} · v{item.version}
      </div>
      {item.status === 'pending' && <div className="ws-pending-box">{t(own ? 'ws.pendingHint' : 'ws.pendingMod')}</div>}
      {item.rejected && item.status !== 'publish' && <div className="ws-pending-box error">{t('ws.rejectedBox', { reason: item.rejected })}</div>}
      {mod && !!item.reports && (
        <div className="ws-pending-box error">
          <strong>{t('ws.reportsCount', { n: item.reports })}</strong>
          {(item.reportReasons ?? []).map((r, i) => (
            <div key={i}>— {r}</div>
          ))}
        </div>
      )}
      {item.description && <p className="ws-desc">{item.description}</p>}
      <div className="ws-meta-line">
        {t('st.license')}: {item.license}
        {item.tags.length > 0 && ` · ${item.tags.map((x) => `#${x}`).join(' ')}`}
      </div>
      <div className="ws-meta-line">
        <Icon name="import" size={12} /> {item.downloads} · <Icon name="heart" size={12} /> {item.likes}
      </div>
      <div className="ws-actions">
        <InstallButton item={item} />
        {item.status === 'publish' && (
          <button className={`btn ${item.liked ? 'active' : ''}`} title={t('ws.like')} onClick={() => void toggleLike(item)}>
            <Icon name="heart" size={15} />
            {item.liked ? t('ws.liked') : t('ws.like')}
          </button>
        )}
        {item.page && (
          <button className="btn" title={t('ws.openSite')} onClick={() => api.workshopOpen(item.page)}>
            <Icon name="globe" size={15} />
          </button>
        )}
      </div>
      {mod && item.status === 'pending' && (
        <div className="ws-actions">
          <button className="btn primary" onClick={() => void moderate(item, 'approve')}>
            <Icon name="check" size={15} />
            {t('ws.approve')}
          </button>
          <button className="btn danger" onClick={() => void moderate(item, 'reject')}>
            {t('ws.reject')}
          </button>
        </div>
      )}
      {mod && item.status === 'publish' && !!item.reports && (
        <div className="ws-actions">
          <button className="btn" onClick={() => void moderate(item, 'dismiss')}>
            {t('ws.dismiss')}
          </button>
          <button className="btn danger" onClick={() => void moderate(item, 'reject')}>
            {t('ws.unpublish')}
          </button>
        </div>
      )}
      {!own && !mod && item.status === 'publish' && account && (
        <button className="link-btn ws-report" onClick={() => void reportItem(item)}>
          {t('ws.report')}
        </button>
      )}
      {own && (
        <div className="ws-actions">
          <button className="btn small" onClick={() => openDialog('publish')}>
            {t('ws.newVersion')}
          </button>
          <button
            className="btn small danger"
            onClick={async () => {
              if (await confirmAction({ title: t('ws.removeTitle', { name: item.title }), confirm: t('common.delete'), cancel: t('common.cancel'), danger: true })) {
                void removeOwnItem(item);
              }
            }}
          >
            {t('ws.remove')}
          </button>
        </div>
      )}
    </div>
  );
}

export function WorkshopPanel() {
  const t = useT();
  const s = useWorkshop();
  const [search, setSearch] = useState(s.search);

  useEffect(() => {
    if (s.items.length === 0 && !s.loading && !s.error) void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (s.open) return <ItemDetails item={s.open} />;
  return (
    <>
      <div className="ws-top">
        {s.account ? (
          <button className="ws-account" title={`${t('ws.signedInAs', { name: s.account.name })} · ${t('ws.myAccount')}`} onClick={openAccount}>
            <Icon name="check" size={13} /> {s.account.name}
          </button>
        ) : (
          <span className="ws-sign">
            <button className="btn small" onClick={signIn}>
              {t('ws.signIn')}
            </button>
            <button className="btn small" onClick={signUp}>
              {t('ws.signUp')}
            </button>
          </span>
        )}
        <button className="btn small primary" onClick={() => openDialog('publish')}>
          <Icon name="export" size={14} />
          {t('ws.publish')}
        </button>
      </div>
      {!s.account && <span className="panel-hint ws-account-hint">{t('ws.accountHint')}</span>}
      {s.account?.confirmed === false && (
        <div className="ws-pending-box">
          {t('ws.unconfirmed')}{' '}
          <button className="link-btn" onClick={() => void resendConfirmation()}>
            {t('ws.resend')}
          </button>
        </div>
      )}
      {s.account?.moderator && (
        <div className="ws-chips ws-review">
          <button className={`chip ${s.review === 'pending' ? 'active' : ''}`} onClick={() => setFilter({ review: s.review === 'pending' ? null : 'pending' })}>
            {t('ws.reviewQueue')}
            {!!s.account.pending && <b className="ws-count">{s.account.pending}</b>}
          </button>
          <button className={`chip ${s.review === 'reported' ? 'active' : ''}`} onClick={() => setFilter({ review: s.review === 'reported' ? null : 'reported' })}>
            {t('ws.reportsQueue')}
            {!!s.account.reported && <b className="ws-count">{s.account.reported}</b>}
          </button>
        </div>
      )}
      <input
        className="text-input"
        placeholder={t('ws.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && setFilter({ search })}
        onBlur={() => search !== s.search && setFilter({ search })}
      />
      <div className="ws-chips">
        {KINDS.map((k) => (
          <button key={k} className={`chip ${s.kind === k ? 'active' : ''}`} onClick={() => setFilter({ kind: k })}>
            {t(`ws.kinds.${k}` as I18nKey)}
          </button>
        ))}
      </div>
      <div className="ws-row">
        <select className="select compact" value={s.sort} onChange={(e) => setFilter({ sort: e.target.value as Sort })}>
          {SORTS.map((x) => (
            <option key={x} value={x}>
              {t(`ws.sort.${x}` as I18nKey)}
            </option>
          ))}
        </select>
        {s.account && (
          <label className="ws-mine">
            <input type="checkbox" checked={s.mine} onChange={(e) => setFilter({ mine: e.target.checked })} />
            {t('ws.mine')}
          </label>
        )}
      </div>
      {s.error === WORKSHOP_CLOSED && (
        <div className="ws-empty">
          <Icon name="workshop" size={26} />
          <strong>{t('ws.closedTitle')}</strong>
          <span className="panel-hint" style={{ margin: 0 }}>
            {t('ws.closedText')}
          </span>
        </div>
      )}
      {s.error && s.error !== WORKSHOP_CLOSED && (
        <div className="ws-empty">
          <Icon name="alert" size={22} />
          <span>{t('ws.unavailable')}</span>
          <span className="panel-hint" style={{ margin: 0 }}>
            {s.error}
          </span>
          <button className="btn small" onClick={() => void loadItems()}>
            {t('ws.retry')}
          </button>
        </div>
      )}
      {!s.error && !s.loading && s.items.length === 0 && (
        <div className="ws-empty">
          <Icon name="sparkles" size={22} />
          <span>{s.review === 'pending' ? t('ws.noneReview') : s.review === 'reported' ? t('ws.noneReports') : s.mine ? t('ws.noneMine') : t('ws.none')}</span>
        </div>
      )}
      <div className="ws-grid">
        {s.items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
      {s.loading && <div className="panel-hint">{t('ws.loading')}</div>}
      {!s.loading && s.page < s.pages && (
        <button className="btn" onClick={() => void loadItems(true)}>
          {t('ws.more')}
        </button>
      )}
    </>
  );
}


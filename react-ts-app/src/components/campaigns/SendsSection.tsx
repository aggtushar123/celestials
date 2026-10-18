import { useId, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Clock } from 'lucide-react';
import { fetchCampaignSend, fetchSends } from '../../features/campaigns/campaignApi';
import { openSendOf, withOpenSend } from '../../features/campaigns/campaignParams';
import { countsParts, sendByText, sendDay } from '../../features/campaigns/campaignText';
import type { Campaign, CampaignSend } from '../../features/campaigns/campaignTypes';
import { useSendingPoll } from '../../hooks/useSendingPoll';
import { MoreButton } from '../organizations/portfolio/PortfolioSections';
import { Parts } from '../rules/Parts';
import { Badge, CardHeader, EmptyState, ErrorState, FOCUS, INLINE_TARGET, ListCard, LoadingState, TYPE } from '../ui';
import { Deliveries } from './Deliveries';
import { usePagedList } from './usePagedList';

const LINK = `${INLINE_TARGET} font-semibold text-ink hover:underline ${FOCUS}`;

/** "From rule <link>", or the plain words (Contract note 10). */
function SentBy({ send }: { send: CampaignSend }) {
  if (send.kind === 'rule' && send.rule && send.rule.id !== null) {
    return (
      <span className={TYPE.bodyMuted}>
        From rule{' '}
        <Link to={`/scenarios/rules/${send.rule.id}`} className={LINK}>
          {send.rule.name}
        </Link>
      </span>
    );
  }
  return <span className={TYPE.bodyMuted}>{sendByText(send)}</span>;
}

function SendRow({ campaignId, send, open, onToggle, onUpdate }: {
  campaignId: number;
  send: CampaignSend;
  open: boolean;
  onToggle: () => void;
  onUpdate: (send: CampaignSend) => void;
}) {
  const panelId = useId();
  useSendingPoll(send.id, send, () => fetchCampaignSend(campaignId, send.id), onUpdate);
  return (
    <li data-send={send.id} className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
          className={`flex min-h-11 items-center gap-2 rounded-lg text-left ${TYPE.body} font-semibold sm:min-h-9 ${FOCUS}`}
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          {sendDay(send)}
        </button>
        <SentBy send={send} />
        {send.migrated ? <Badge>Migrated</Badge> : null}
        <span role="status" data-part="figures" className={`inline-flex items-center gap-1 sm:ml-auto ${TYPE.bodyMuted}`}>
          {send.status === 'sending' ? (
            <>
              <Clock className="h-4 w-4" aria-hidden="true" />
              Sending…{' '}
            </>
          ) : null}
          <Parts parts={countsParts(send.counts)} />
        </span>
      </div>
      {open ? (
        <div id={panelId} className="flex flex-col gap-3 border-t border-line-subtle px-4 py-3">
          <div data-part="as-sent" className="flex max-w-[68ch] flex-col gap-1">
            <p className={TYPE.label}>As sent</p>
            <p className={`break-words ${TYPE.body} font-semibold`}>{send.subject}</p>
            <p className={`whitespace-pre-wrap break-words ${TYPE.body}`}>{send.body}</p>
          </div>
          <Deliveries campaignId={campaignId} sendId={send.id} status={send.status} />
        </div>
      ) : null}
    </li>
  );
}

const WORDS = { error: 'Could not load its sends.', more: 'Could not load more sends.' };

/** The campaign's sends (spec §2.3), newest first, each a disclosure that
 *  opens what went out and to whom; `?send=` opens one (Decision 7). A
 *  send that finishes while shown reads the campaign again (`onFinished`). */
export function SendsSection({ campaign, version, onFinished }: { campaign: Campaign; version: number; onFinished: () => void }) {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [search, setSearch] = useSearchParams();
  const openId = openSendOf(search);
  const list = usePagedList(`${campaign.id}|${version}`, (cursor) => fetchSends(campaign.id, cursor), WORDS);
  const current = list.rows || list.error ? list : null;

  const replace = (next: CampaignSend) => {
    const before = list.rows?.find((row) => row.id === next.id);
    list.update((rows) => rows.map((row) => (row.id === next.id ? next : row)));
    if (before?.status === 'sending' && next.status === 'sent') onFinished();
  };
  const toggle = (id: number) => setSearch((prev) => withOpenSend(prev, openId === id ? null : id), { replace: true });

  const state = !current ? (
    <LoadingState label="Loading its sends" count={2} />
  ) : current.error ? (
    <ErrorState message={current.error} onRetry={list.retry} />
  ) : current.rows && current.rows.length === 0 ? (
    <EmptyState title="Not sent yet" detail={campaign.is_owner ? 'Each send is kept here with who it reached and who was skipped.' : 'Its owner has not sent it yet.'} />
  ) : undefined;
  return (
    <ListCard
      label="Sends"
      header={<CardHeader title="Sends" id={headingId} />}
      state={state}
      listRef={listRef}
      footer={list.next ? <MoreButton next={list.next} loading={list.more.busy} error={list.more.error} label="Show more sends" onClick={list.showMore} list={listRef} /> : undefined}
    >
      {current?.rows?.map((send) => (
        <SendRow key={send.id} campaignId={campaign.id} send={send} open={send.id === openId} onToggle={() => toggle(send.id)} onUpdate={replace} />
      ))}
    </ListCard>
  );
}

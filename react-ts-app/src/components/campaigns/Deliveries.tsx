import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Network } from 'lucide-react';
import { fetchDeliveries } from '../../features/campaigns/campaignApi';
import { REASON_LABEL, SKIP_ORDER } from '../../features/campaigns/campaignOptions';
import type { DeliveryShow } from '../../features/campaigns/campaignParams';
import { hiddenPeople, reasonText, recordPath } from '../../features/campaigns/campaignText';
import type { CampaignSend, Delivery, SkipReason } from '../../features/campaigns/campaignTypes';
import { MoreButton } from '../organizations/portfolio/PortfolioSections';
import { EmptyState, ErrorState, FOCUS, INLINE_TARGET, LoadingState, NUM, SegmentedControl, Select, TYPE } from '../ui';
import { DeliveryStatus } from './parts';
import { usePagedList } from './usePagedList';

const SHOW: readonly { value: DeliveryShow; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'skipped', label: 'Skipped' },
];
const LINK = `${INLINE_TARGET} z-10 inline-flex min-w-0 items-center gap-1 hover:underline ${FOCUS}`;

const WORDS = { error: 'Could not load who it reached.', more: 'Could not load more people.' };

function DeliveryRow({ delivery }: { delivery: Delivery }) {
  const record = delivery.record;
  const RecordIcon = record?.kind === 'account' ? Layers : Network;
  return (
    <li data-delivery={delivery.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 ${TYPE.body}`}>
      <Link to={`/contacts/${delivery.contact.id}`} className={`${LINK} font-semibold text-ink`}>
        {delivery.contact.name}
      </Link>
      {record ? (
        <Link to={recordPath(record)} className={`${LINK} text-ink-muted`}>
          <RecordIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{record.name}</span>
        </Link>
      ) : null}
      <DeliveryStatus status={delivery.status} />
      {delivery.reason ? <span className={TYPE.bodyMuted}>{reasonText(delivery.reason)}</span> : null}
    </li>
  );
}

/** A send's deliveries (spec §2.3): only people the reader may open, a count
 *  of the rest; All / Sent / Skipped and, with Skipped, a reason (Decision 8).
 *  `status` is the send's own, not read here: it is in the key only so a
 *  send moving from `sending` to `sent` while this panel is open re-reads
 *  it, instead of leaving every "Waiting" row stuck until a close/reopen
 *  or a manual retry. */
export function Deliveries({ campaignId, sendId, status }: { campaignId: number; sendId: number; status: CampaignSend['status'] }) {
  const [show, setShow] = useState<DeliveryShow>('all');
  const [reason, setReason] = useState<SkipReason | ''>('');
  const list = usePagedList(`${campaignId}|${sendId}|${status}|${show}|${reason}`, (cursor) => fetchDeliveries(campaignId, sendId, show, reason, cursor), WORDS);
  const listRef = useRef<HTMLUListElement>(null);
  const current = list.rows || list.error ? list : null;
  const hidden = hiddenPeople(list.page?.hidden ?? 0);

  return (
    <section aria-label="Deliveries" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <SegmentedControl
          label="Show"
          options={SHOW}
          value={show}
          onChange={(next) => {
            setShow(next);
            setReason('');
          }}
        />
        {show === 'skipped' ? (
          <Select<SkipReason | ''>
            label="Reason"
            labelPosition="inline"
            value={reason}
            onChange={setReason}
            options={[{ value: '', label: 'All reasons' }, ...SKIP_ORDER.map((one) => ({ value: one, label: REASON_LABEL[one] }))]}
          />
        ) : null}
      </div>
      {!current ? <LoadingState label="Loading who it reached" count={3} /> : null}
      {current?.error ? <ErrorState message={current.error} onRetry={list.retry} /> : null}
      {current?.rows && current.rows.length === 0 ? <EmptyState size="inline" title="Nobody here you can open." /> : null}
      {current?.rows && current.rows.length > 0 ? (
        <ul ref={listRef} aria-label="People" className="flex flex-col divide-y divide-line-subtle">
          {current.rows.map((delivery) => (
            <DeliveryRow key={delivery.id} delivery={delivery} />
          ))}
        </ul>
      ) : null}
      {hidden ? (
        <p data-part="hidden" className={TYPE.meta}>
          <span className={NUM}>{hidden.n}</span> {hidden.text}
        </p>
      ) : null}
      {list.rows ? (
        <MoreButton next={list.next} loading={list.more.busy} error={list.more.error} label="Show more people" onClick={list.showMore} list={listRef} className="mt-1.5" />
      ) : null}
    </section>
  );
}

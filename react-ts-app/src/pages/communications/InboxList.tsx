// The list: rows grouped by the month they started waiting, newest group
// first, flat inside the glass shell (UI foundations spec §4.1, §4.2), on
// grid columns from a 44rem region. The waiting time is a neutral figure:
// there is no SLA to be past, so nothing here is red (spec §7).

import { AtSign, Hash, LifeBuoy, Mail, Phone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CommunicationKind, CommunicationRow } from '../../features/communications/communicationsSlice';
import { Badge, IconChip, ListHeaderRow, ListRow, LoadingState, NUM, TYPE } from '../../components/ui';
import { QUEUE_COLUMNS, QUEUE_GRID_AT, QUEUE_HEADER_SHOW, QUEUE_NARROW_ONLY } from './queueColumns';

const ICONS: Record<CommunicationKind, LucideIcon> = { email: Mail, question: AtSign, ticket: LifeBuoy, call: Phone, slack: Hash };
const KIND_LABEL: Record<CommunicationKind, string> = {
  email: 'Reply owed',
  question: 'Question for you',
  ticket: 'Open ticket',
  call: 'Call to wrap up',
  slack: 'Slack thread',
};

function monthOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Earlier' : d.toLocaleDateString(undefined, { month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function InboxList({
  rows,
  selectedId,
  isLoading,
  onSelect,
  emptyState,
}: {
  rows: CommunicationRow[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  emptyState: React.ReactNode;
}) {
  if (isLoading && rows.length === 0) return <LoadingState label="Loading your inbox" count={6} />;
  if (rows.length === 0) return <>{emptyState}</>;

  const groups = new Map<string, CommunicationRow[]>();
  for (const row of rows) {
    const key = monthOf(row.waiting_since);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div className="flex flex-col">
      <ListHeaderRow columns={QUEUE_COLUMNS} labels={['From', 'Subject', 'Kind', 'Waiting']} align={['left', 'left', 'left', 'right']} show={QUEUE_HEADER_SHOW} />
      {[...groups.entries()].map(([month, items]) => (
        <section key={month} aria-label={month}>
          <h3 className={`px-4 pt-4 pb-1 ${TYPE.meta} font-semibold`}>{month}</h3>
          <ul role="list" aria-label={month} className="divide-y divide-line-subtle">
            {items.map((row) => (
              <ListRow
                key={row.id}
                dataAttrs={{ 'data-row': row.id }}
                title={row.who}
                onSelect={() => onSelect(row.id)}
                selected={row.id === selectedId}
                leading={<IconChip icon={ICONS[row.kind]} />}
                meta={
                  <>
                    {row.account ? row.account.name : null}
                    <span className={QUEUE_NARROW_ONLY}>
                      {row.account ? ' · ' : null}
                      {row.subject}
                    </span>
                  </>
                }
                columns={QUEUE_COLUMNS}
                gridAt={QUEUE_GRID_AT}
                cells={[
                  <p key="subject" className={`truncate ${TYPE.body}`}>
                    {row.subject}
                    {row.snippet ? <span className="text-ink-muted">: {row.snippet}</span> : null}
                  </p>,
                  <Badge key="kind">{KIND_LABEL[row.kind]}</Badge>,
                ]}
                trailing={
                  <span className={`ml-auto ${TYPE.meta}`}>
                    <span className={NUM}>{row.waiting_days}d</span>
                    <span className="sr-only @min-[44rem]:not-sr-only"> waiting</span>
                  </span>
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

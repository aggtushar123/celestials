// The mailbox list: the Categories block on top (what is waiting, by kind),
// then every conversation grouped by month, newest first, as flat grid rows
// (UI foundations spec §4.2) from a 44rem region. Sent and Drafts list
// messages, addressed "To" their recipients (two-way Gmail D2, Decision 1).

import { CircleAlert, Paperclip } from 'lucide-react';
import { AGENT_LABEL } from '../../features/agents/agentsText';
import { Badge, FOCUS, Initials, ListHeaderRow, ListRow, LoadingState, NUM, TYPE } from '../../components/ui';
import type { MailCategory, MailCategoryBlock, MailThread } from '../../features/mail/mailboxSlice';
import { CATEGORY_DOT } from './mailCategories';
import { LabelChips } from './MailLabels';
import { dayOf, threadWho } from './mailWho';
import { MAIL_COLUMNS, QUEUE_GRID_AT, QUEUE_HEADER_SHOW, QUEUE_NARROW_ONLY } from './queueColumns';

function monthOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Earlier' : d.toLocaleDateString(undefined, { month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0].charAt(0) + (parts[1]?.charAt(0) ?? '')).toUpperCase();
}

/** Density rule 12: a row's box shows on hover or focus from sm, always on
 *  touch, and always once anything is ticked. */
const BOX_UNTIL_HOVER = 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';

export function CategoriesBlock({ blocks, active, onPick }: { blocks: MailCategoryBlock[]; active: MailCategory | null; onPick: (category: MailCategory) => void }) {
  if (blocks.length === 0) return null;
  return (
    <section aria-label="Waiting by category" className="mb-2">
      <h3 className={`px-4 pt-3 pb-1 ${TYPE.meta} font-semibold`}>Categories</h3>
      <ul role="list" aria-label="Categories" className="divide-y divide-line-subtle">
        {blocks.map((block) => (
          <ListRow
            key={block.category}
            density="compact"
            title={block.subjects.join(', ')}
            meta={`${block.senders[0] ?? ''}${block.more_senders > 0 ? ` · +${block.more_senders}` : ''}`}
            leading={<span aria-hidden="true" className={`block h-2 w-2 rounded-full ${CATEGORY_DOT[block.category]}`} />}
            trailing={<Badge>{block.label}</Badge>}
            onSelect={() => onPick(block.category)}
            selected={active === block.category}
          />
        ))}
      </ul>
    </section>
  );
}

export function MailList({
  rows,
  isLoading,
  onSelect,
  emptyState,
  footer = null,
  monthLevel = 'h3',
  checked = [],
  onToggleCheck,
}: {
  rows: MailThread[];
  isLoading: boolean;
  onSelect: (id: number) => void;
  emptyState: React.ReactNode;
  /** Below the last group: the way to the next page, when there is one. */
  footer?: React.ReactNode;
  /** The months sit under the folder title (h2), or under "In your
   *  mailbox" (h3) in Drafts. */
  monthLevel?: 'h3' | 'h4';
  /** Ticked rows (bulk select); with `onToggleCheck`, every row has a box. */
  checked?: readonly number[];
  onToggleCheck?: (id: number) => void;
}) {
  if (isLoading && rows.length === 0) return <LoadingState label="Loading your mail" count={6} />;
  if (rows.length === 0) return <>{emptyState}</>;

  const MonthHeading = monthLevel;
  const groups = new Map<string, MailThread[]>();
  for (const row of rows) {
    const key = monthOf(row.last_sent_at);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div className="flex flex-col">
      <ListHeaderRow columns={MAIL_COLUMNS} labels={['From', 'Subject', 'Labels', 'Date']} align={['left', 'left', 'left', 'right']} show={QUEUE_HEADER_SHOW} />
      {[...groups.entries()].map(([month, items]) => (
        <section key={month} aria-label={month}>
          <MonthHeading className={`px-4 pt-4 pb-1 ${TYPE.meta} font-semibold`}>{month}</MonthHeading>
          <ul role="list" aria-label={month} className="divide-y divide-line-subtle">
            {items.map((row) => {
              const name = threadWho(row);
              const first = row.participants[0];
              const title = row.sent ? `To ${name}` : name;
              return (
                <ListRow
                  key={row.id}
                  dataAttrs={{ 'data-thread-id': row.id }}
                  title={title}
                  strong={!row.is_read}
                  leading={
                    <span className="flex items-center gap-1">
                      {onToggleCheck ? (
                        <label className={`relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center ${checked.length > 0 ? '' : BOX_UNTIL_HOVER}`}>
                          <input type="checkbox" checked={checked.includes(row.id)} onChange={() => onToggleCheck(row.id)} aria-label={`Select ${title}`} className={`h-4 w-4 accent-accent ${FOCUS}`} />
                        </label>
                      ) : null}
                      <span className="relative block">
                        <Initials text={initialsOf(first ? first.name || first.address : '')} />
                        {!row.is_read ? <span role="img" aria-label="Unread message" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-info" /> : null}
                      </span>
                    </span>
                  }
                  meta={
                    <>
                      {row.account ? row.account.name : null}
                      <span className={QUEUE_NARROW_ONLY}>
                        {row.account ? ' · ' : null}
                        {row.labels.length > 0 ? (
                          <>
                            <LabelChips labels={row.labels} max={1} />{' '}
                          </>
                        ) : null}
                        {row.subject}
                      </span>
                    </>
                  }
                  columns={MAIL_COLUMNS}
                  gridAt={QUEUE_GRID_AT}
                  cells={[
                    <div key="subject" className="flex min-w-0 items-center gap-1.5">
                      {row.has_attachments ? (
                        <>
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                          <span className="sr-only">Has attachments</span>
                        </>
                      ) : null}
                      {row.message_count > 1 ? (
                        <span className={`shrink-0 ${TYPE.meta} ${NUM}`}>
                          {row.message_count}
                          <span className="sr-only"> messages</span>
                        </span>
                      ) : null}
                      <p className={`min-w-0 truncate ${TYPE.body}`}>
                        {row.subject}
                        {row.snippet ? <span className="text-ink-muted">: {row.snippet}</span> : null}
                      </p>
                    </div>,
                    <LabelChips key="labels" labels={row.labels} max={2} />,
                  ]}
                  trailing={
                    <>
                      {row.sync_issue ? (
                        <span title={row.sync_issue.text} className="text-ink-muted">
                          <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">{row.sync_issue.text}</span>
                        </span>
                      ) : null}
                      {row.draft?.agent ? <Badge>{AGENT_LABEL[row.draft.agent]}</Badge> : null}
                      <span className={`ml-auto ${TYPE.meta} ${NUM}`}>{dayOf(row.last_sent_at)}</span>
                    </>
                  }
                  onSelect={() => onSelect(row.id)}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {footer}
    </div>
  );
}

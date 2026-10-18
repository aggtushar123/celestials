import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import { Card, CardHeader, CardSection, EmptyState, ErrorState, LoadingState, NO_VALUE, QUIET, TYPE } from '../../ui';
import type { Headline } from '../../../features/customers/customersSlice';
import { formatDate } from '../../../features/customers/formatters';


// A status dot, coloured by what the status actually means — the mock
// hardcoded `bg-danger` for every card, including "Closed", which read
// as an alert on a storyline that had been resolved.
const STATUS_DOT: Record<string, string> = {
  open: 'bg-line-strong',
  in_progress: 'bg-warning',
  closed: 'bg-success',
};

export interface HeadlinesTabProps {
  headlines: Headline[];
  isLoading: boolean;
  error: string | null;
  /** Omitted when there's no real entity to generate against (a direct
   * URL visit to an account page with no resolvable parent Customer —
   * see ActivityFeed's own prop doc). The button hides rather than
   * offering an action that can only 404. */
  onRegenerate?: () => Promise<void>;
  isRegenerating?: boolean;
  /** Shown as a banner above the cards, not in place of them — a failed
   * regenerate leaves the existing cards perfectly readable. */
  regenerateError?: string | null;
  /** Inside a page that scrolls on its own and heads the section itself (the
   *  organization page): a card like its neighbours, with no scroll area and
   *  no "Account Headlines" title of its own. Off by default. */
  embedded?: boolean;
}

export function HeadlinesTab({
  headlines,
  isLoading,
  error,
  onRegenerate,
  isRegenerating = false,
  regenerateError = null,
  embedded = false,
}: HeadlinesTabProps) {
  const [confirming, setConfirming] = useState(false);
  const headingId = useId();
  const summaryItems = headlines.filter((item) => item.kind === 'summary');
  const feedItems = headlines.filter((item) => item.kind !== 'summary');

  // `group` arrives derived from period_end (see HeadlineSerializer) —
  // the mock stored it as free text, which is how it drifted from the
  // dates on the same card. Cards with no period_end have no group and
  // fall into one trailing untitled section rather than vanishing.
  const grouped = feedItems.reduce<Record<string, Headline[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  // Feed order is newest group first. Entries already arrive
  // period_end-descending within a group, so only the groups
  // themselves need sorting — by the newest card each one holds,
  // since "January 2026" doesn't sort chronologically as a string.
  const sortedGroups = Object.entries(grouped).sort((a, b) => {
    const newest = (items: Headline[]) =>
      items.reduce((max, item) => (item.period_end && item.period_end > max ? item.period_end : max), '');
    return newest(b[1]).localeCompare(newest(a[1]));
  });

  // Regenerating discards the cards the model wrote last time, and
  // there's no undo — but only if there are any. With nothing generated
  // yet (a fresh account, or only hand-written cards, which the backend
  // never touches) there's nothing to lose, so the confirm would be
  // friction for no reason.
  const hasGeneratedCards = headlines.some((item) => item.generated_at !== null);

  function handleRegenerateClick() {
    if (hasGeneratedCards) {
      setConfirming(true);
    } else {
      void onRegenerate?.();
    }
  }

  const regenerateButton = onRegenerate && (
    <button type="button" onClick={handleRegenerateClick} disabled={isRegenerating} className={QUIET}>
      <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
      {isRegenerating ? 'Regenerating…' : 'Regenerate'}
    </button>
  );

  const confirmDialog = confirming && onRegenerate && (
    <ConfirmDialog
      title="Regenerate headlines?"
      message="This rewrites the cards written for this account from its current notes, emails, tickets and activities. The previous versions can't be recovered. Anything written by hand is left alone."
      confirmLabel="Regenerate"
      onConfirm={onRegenerate}
      onClose={() => setConfirming(false)}
    />
  );

  const failure = regenerateError ? (
    <p role="alert" className="px-4 pb-3 text-[13px] font-semibold text-danger-ink">
      {regenerateError}
    </p>
  ) : null;

  // Embedded, the page scrolls and sets the column. On the account feed the
  // card sits in its own scroll area.
  const frame = (action: ReactNode, content: ReactNode) => {
    const card = (
      <Card as="section" pad="none" aria-labelledby={headingId}>
        <CardHeader id={headingId} title="Headlines" action={action} />
        {content}
      </Card>
    );
    return (
      <>
        {embedded ? card : <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">{card}</div>}
        {confirmDialog}
      </>
    );
  };

  if (isLoading) return frame(undefined, <LoadingState label="Loading headlines" variant="block" />);
  if (error) return frame(undefined, <ErrorState message={error} />);
  if (headlines.length === 0) {
    return frame(
      undefined,
      <>
        {failure}
        <EmptyState title="No headlines yet" action={regenerateButton || undefined} />
      </>,
    );
  }

  return frame(
    regenerateButton || undefined,
    <>
      {failure}
      {/* Summary cards (TL;DR) sit above the groups, without a heading */}
      {summaryItems.length > 0 && (
        <CardSection>
          <div className="divide-y divide-line-subtle">
            {summaryItems.map((item) => (
              <HeadlineRow key={item.id} item={item} />
            ))}
          </div>
        </CardSection>
      )}
      {sortedGroups.map(([group, groupItems]) => (
        <CardSection key={group}>
          {group && <h3 className={`${TYPE.label} mb-1`}>{group}</h3>}
          <div className="divide-y divide-line-subtle">
            {groupItems.map((item) => (
              <HeadlineRow key={item.id} item={item} />
            ))}
          </div>
        </CardSection>
      ))}
    </>,
  );
}

function HeadlineRow({ item }: { item: Headline }) {
  const [expanded, setExpanded] = useState(true);
  // Which footer a row gets follows `kind`, not whether it happens to
  // carry data sources: the generator records sources on every row it
  // writes, so that proxy would drop a storyline's date span.
  const isSummary = item.kind === 'summary';

  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <h4 className={`${TYPE.body} font-semibold`}>{item.title}</h4>
        {item.status && (
          <div className={`flex shrink-0 items-center gap-1.5 ${TYPE.meta}`}>
            <div className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status] ?? 'bg-ink-faint'}`} />
            <span>{item.status_display}</span>
          </div>
        )}
      </div>

      {expanded && <p className={TYPE.bodyMuted}>{item.content}</p>}

      {/* Footer for TL;DR type rows */}
      {expanded && isSummary && (
        <p className={TYPE.meta}>
          Data sources: <span className="font-semibold">{item.data_sources_display}</span>
          {item.time_period_label ? (
            <>
              {' · '}Time period: <span className="font-semibold">{item.time_period_label}</span>
            </>
          ) : null}
        </p>
      )}

      {/* Footer for standard headline rows */}
      {!isSummary && item.period_start && (
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setExpanded(!expanded)} className={`${QUIET} -ml-3`}>
            {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          <div className={TYPE.meta}>
            {formatDate(item.period_start)} to {item.period_end ? formatDate(item.period_end) : NO_VALUE}
          </div>
        </div>
      )}
    </div>
  );
}

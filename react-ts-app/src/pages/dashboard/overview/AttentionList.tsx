import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../lib/apiClient';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { snooze, unsnooze } from '../../../features/attention/attentionApi';
import type { AttentionItem, AttentionKind } from '../../../features/attention/attentionApi';
import { useDrill } from '../drill/useDrill';
import { useAsk } from '../ask/useAsk';
import { Panel } from '../shared/Panel';
import { Empty, ErrorState } from '../shared/DataState';
import { ScrollArea } from '../shared/ScrollTable';

const KIND_LABEL: Record<AttentionKind, string> = {
  renewal: 'Renewal',
  risk: 'Risk',
  going_quiet: 'Going quiet',
  support: 'Support',
  anomaly: 'Anomaly',
};

type Acted = 'snoozed' | 'done';

const ACTED_LINE: Record<Acted, string> = { snoozed: 'Snoozed', done: 'Marked done' };

const BUTTON =
  'min-h-9 px-3 rounded-lg text-[13px] font-semibold transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed';
// Hover only on a button that can act: a busy or stale row's buttons look inert.
const SECONDARY = `${BUTTON} border border-line text-ink bg-surface enabled:not-aria-disabled:hover:bg-subtle`;
const QUIET = `${BUTTON} text-ink-muted enabled:not-aria-disabled:hover:text-ink enabled:not-aria-disabled:hover:bg-subtle`;

function SkeletonRows() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading what needs attention</span>
      <ol className="divide-y divide-line" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} data-testid="attention-skeleton-row" className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-5 w-16 rounded-md bg-subtle animate-pulse" />
                <span className="h-4 w-40 max-w-full rounded bg-subtle animate-pulse" />
              </div>
              <span className="block h-3 w-56 max-w-full rounded bg-subtle animate-pulse" />
            </div>
            <span className="h-4 w-14 rounded bg-subtle animate-pulse" />
            <div className="flex gap-2">
              <span className="h-9 w-28 rounded-lg bg-subtle animate-pulse" />
              <span className="h-9 w-16 rounded-lg bg-subtle animate-pulse" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** An item the viewer has touched this session, held here so a reload of
 *  the list cannot take it away: a snoozed item keeps its Undo line after
 *  the server stops returning it, and an undone one comes back at the
 *  place it left even before the server returns it again. */
interface Local {
  state: Acted | 'restored';
  item: AttentionItem;
  /** Its position in the list as shown when it was acted on. */
  index: number;
}

type Entry = { item: AttentionItem; acted: Acted | null };

/** The server's list with the local entries spliced back in at their saved
 *  positions. Acted keys are dropped from the server's list first, so an
 *  item the server still returns is never shown twice. A restored item the
 *  server returns again simply takes the server's place for it. */
function merge(server: AttentionItem[], local: Record<string, Local>): Entry[] {
  const serverKeys = new Set(server.map((item) => item.key));
  const overrides = Object.values(local)
    .filter((entry) => entry.state !== 'restored' || !serverKeys.has(entry.item.key))
    .sort((a, b) => a.index - b.index);
  const skip = new Set(overrides.map((entry) => entry.item.key));
  const out: Entry[] = server.filter((item) => !skip.has(item.key)).map((item) => ({ item, acted: null }));
  for (const entry of overrides) {
    const acted = entry.state === 'restored' ? null : entry.state;
    out.splice(Math.min(entry.index, out.length), 0, { item: entry.item, acted });
  }
  return out;
}

/**
 * The ranked "Needs attention" list: what to act on first, across renewals,
 * risk, quiet accounts, support and anomalies. The order is the server's
 * (score descending); nothing here re-ranks it.
 *
 * Snooze and Done are optimistic: the row gives way to an Undo line at once
 * and comes back if the server says no. The line holds the row's place, so
 * Undo restores it exactly where it was. It lasts until the filter changes
 * (the Overview keys this list by its query) or the page is left; the first
 * fresh list after a filter change is the only reload it has to survive.
 *
 * Focus follows the row: Snooze/Done hand it to the Undo that replaces them,
 * Undo (or a failed action) hands it back to the row's Snooze. A button
 * whose call is in flight is `aria-disabled`, not `disabled`, so it can
 * still hold that focus.
 *
 * Inside the dashboard frame each row also has Why?, which asks the Ask
 * rail about that item at once.
 */
export function AttentionList({
  items,
  currency,
  loading,
  error,
}: {
  /** Null until the first load. */
  items: AttentionItem[] | null;
  currency: CurrencyCode;
  /** True while a load is in flight. With `items` already set, those are
   *  the previous query's rows: shown, but not actionable. */
  loading: boolean;
  error: boolean;
}) {
  const { open } = useDrill();
  const ask = useAsk();
  const [local, setLocal] = useState<Record<string, Local>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  // Where focus goes after the row it was on is swapped out: the key plus
  // which button. Applied after the swap has rendered.
  const [focusTo, setFocusTo] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const register = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(id, el);
    else buttons.current.delete(id);
  };

  useEffect(() => {
    if (focusTo === null) return;
    buttons.current.get(focusTo)?.focus();
  }, [focusTo, local]);

  // Rows from the previous query (a refetch in flight) or from a failed
  // load are shown for reading only: an action taken on one would be filed
  // under a filter it doesn't belong to.
  const stale = loading || error;

  const entries = merge(items ?? [], local);
  const remaining = entries.filter((entry) => !entry.acted).length;

  const put = (key: string, entry: Local | undefined) =>
    setLocal((prev) => {
      const next = { ...prev };
      if (entry) next[key] = entry;
      else delete next[key];
      return next;
    });
  const busy = (key: string, value: boolean) => setPending((prev) => ({ ...prev, [key]: value }));

  const reason = (err: unknown) => (err instanceof ApiError ? ` ${err.message}` : '');

  async function act(item: AttentionItem, index: number, choice: Acted) {
    const before = local[item.key];
    setActionError(null);
    put(item.key, { state: choice, item, index });
    busy(item.key, true);
    setFocusTo(`${item.key}:undo`);
    try {
      await snooze(item.key, choice === 'done' ? { done: true } : { days: 7 });
    } catch (err) {
      put(item.key, before);
      setFocusTo(`${item.key}:snooze`);
      setActionError(`Could not ${choice === 'done' ? 'mark done' : 'snooze'} ${item.title}.${reason(err)}`);
    } finally {
      busy(item.key, false);
    }
  }

  async function undo(item: AttentionItem) {
    const was = local[item.key];
    setActionError(null);
    put(item.key, { state: 'restored', item, index: was.index });
    busy(item.key, true);
    setFocusTo(`${item.key}:snooze`);
    try {
      await unsnooze(item.key);
    } catch (err) {
      // A 404 means there is no snooze to remove (undone elsewhere, or it
      // expired): the item is already back, which is what Undo wanted.
      if (err instanceof ApiError && err.status === 404) return;
      put(item.key, was);
      setFocusTo(`${item.key}:undo`);
      setActionError(`Could not undo ${item.title}.${reason(err)}`);
    } finally {
      busy(item.key, false);
    }
  }

  const header = (
    <div className="flex items-baseline gap-3 min-w-0">
      {actionError && (
        <p role="alert" className="text-[11px] font-semibold text-danger">
          {actionError}
        </p>
      )}
      {items !== null && (
        <span data-testid="attention-count" className="font-mono-brand tabular-nums text-[13px] text-ink-muted">
          {remaining}
        </span>
      )}
    </div>
  );

  let body;
  if (loading && items === null) {
    body = <SkeletonRows />;
  } else if (error && entries.length === 0) {
    body = <ErrorState message="Could not load what needs attention." />;
  } else if (entries.length === 0) {
    body = <Empty label="Nothing needs you right now." />;
  } else {
    body = (
      <>
        {error && (
          <p role="alert" className="mb-2 text-[11px] font-semibold text-danger">
            Could not load for these filters. Showing the last list.
          </p>
        )}
        <ScrollArea label="Needs attention, scrollable" maxHeight={560} className="-mx-1 px-1">
          <ol aria-label="Needs attention" aria-busy={stale || undefined} className="divide-y divide-line">
            {entries.map(({ item, acted: done }, index) => {
              if (done) {
                return (
                  <li key={item.key} aria-live="polite" className="flex items-center justify-between gap-3 py-3">
                    <p className="text-[13px] text-ink-muted min-w-0 truncate">
                      {ACTED_LINE[done]} · <span className="text-ink">{item.title}</span>
                    </p>
                    <button
                      type="button"
                      ref={register(`${item.key}:undo`)}
                      aria-label={`Undo: ${item.title}`}
                      className={QUIET}
                      disabled={stale}
                      aria-disabled={pending[item.key] || undefined}
                      onClick={() => !pending[item.key] && undo(item)}
                    >
                      Undo
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
                        {KIND_LABEL[item.kind]}
                      </span>
                      {item.customer_id !== null ? (
                        <Link
                          to={`/organizations/${item.customer_id}`}
                          className="min-w-0 truncate text-[13px] font-semibold text-ink hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) =>
                            open(
                              {
                                title: item.title,
                                figure: item.companies.length === 1 ? '1 company' : `${item.companies.length} companies`,
                                source: {
                                  kind: 'rows',
                                  rows: item.companies.map((c) => ({ id: String(c.id), name: c.name })),
                                },
                              },
                              event.currentTarget,
                            )
                          }
                          className="min-w-0 truncate text-left text-[13px] font-semibold text-ink hover:underline rounded cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {item.title}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-muted">{item.reason}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                    <span className="text-right">
                      <span className="block font-mono-brand tabular-nums text-[13px] text-ink">
                        {formatCompactMoney(item.at_stake, currency)}
                      </span>
                      <span className="block text-[11px] text-ink-muted">at stake</span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        ref={register(`${item.key}:snooze`)}
                        aria-label={`Snooze ${item.title} for 7 days`}
                        className={SECONDARY}
                        disabled={stale}
                        aria-disabled={pending[item.key] || undefined}
                        onClick={() => !pending[item.key] && act(item, index, 'snoozed')}
                      >
                        Snooze 7 days
                      </button>
                      <button
                        type="button"
                        aria-label={`Mark ${item.title} done`}
                        className={QUIET}
                        disabled={stale}
                        aria-disabled={pending[item.key] || undefined}
                        onClick={() => !pending[item.key] && act(item, index, 'done')}
                      >
                        Done
                      </button>
                      {ask && (
                        <button
                          type="button"
                          aria-label={`Ask why ${item.title} is on my list`}
                          className={QUIET}
                          disabled={stale}
                          aria-disabled={Boolean(ask.thread.pending) || pending[item.key] || undefined}
                          onClick={() =>
                            !ask.thread.pending && !pending[item.key] && ask.ask('Why is this on my list?', { kind: 'attention', key: item.key })
                          }
                        >
                          Why?
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </ScrollArea>
      </>
    );
  }

  return (
    <Panel title="Needs attention" action={header}>
      {body}
    </Panel>
  );
}

// This module intentionally exports both the section components and the
// pure `sectionStartsOpen` helper the brief's interface and tests share
// (Task 13). Fast refresh doesn't apply to this module, same precedent as
// rowParts.tsx and AccountDetails.tsx.
/* eslint-disable react-refresh/only-export-components */
import { useCallback, useId, useState, type ReactNode, type RefObject } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { capitalise, type PortfolioNoun } from '../../../features/organizations/portfolioLabels';
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type {
  FilterOptions,
  PortfolioGroup,
  PortfolioPage,
  PortfolioRow,
  PortfolioRowBase,
} from '../../../features/organizations/portfolioTypes';
import { ErrorState } from '../../../pages/dashboard/shared/DataState';
import { BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, ListCard, ListHeaderRow, LoadingState, NUM } from '../../ui';
import { rowAligns, rowColumns, rowLabels } from './rowColumns';
import { usePortfolioKind } from './portfolioKind';
import type { PagedBook } from './usePagedBook';
import { usePagedRead, type Paged } from './usePagedRead';
import { SECTION_PAGE_SIZE, type PortfolioState } from './usePortfolio';
import { FOCUS, QUIET } from './styles';

export function sectionStartsOpen(index: number, total: number): boolean {
  return total <= 4 || index === 0;
}

/** A row renderer that also gets its own section's (or the flat list's)
 *  `loading`, so it can disable that row's checkbox while a fetch for it is
 *  in flight (spec §1's "disabled while loading" rule). */
export type PortfolioRowRenderer<R extends PortfolioRowBase = PortfolioRow> = (row: R, state: { loading: boolean }) => ReactNode;

/** Item-shaped loading placeholders, with no page's words: an avatar
 *  circle first unless `avatar` is false (a Pipelines item has none). */
export function ItemSkeleton({ count, label, avatar = true }: { count: number; label: string; avatar?: boolean }) {
  return (
    <div role="status" aria-label={label}>
      <ul aria-hidden="true" className="flex flex-col gap-1.5">
        {Array.from({ length: Math.max(1, count) }, (_, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
            {avatar ? <span className="h-10 w-10 animate-pulse rounded-full bg-subtle" /> : null}
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="block h-3 w-40 animate-pulse rounded bg-subtle" />
              <span className="block h-2.5 w-28 animate-pulse rounded bg-subtle" />
            </span>
            <span className="hidden h-3 w-16 animate-pulse rounded bg-subtle sm:block" />
            <span className="hidden h-3 w-20 animate-pulse rounded bg-subtle sm:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The portfolio kind's row placeholders ("Loading organizations"). */
export function RowSkeleton({ count, label }: { count: number; label?: string }) {
  const kind = usePortfolioKind();
  return <ItemSkeleton count={count} label={label ?? `Loading ${kind.noun.many}`} />;
}

/** Retry renders only when `onRetry` is given — some callers (a shared tab
 *  mounted by a page that doesn't own that fetch's retry) have none. */
export function ErrorBlock({ message, onRetry, detail = 'Nothing is shown rather than a partial list.' }: { message: string; onRetry?: () => void; detail?: string }) {
  return (
    <div className="rounded-xl bg-surface">
      <ErrorState message={message} detail={detail} />
      {onRetry ? (
        <div className="flex justify-center pb-6">
          <button type="button" onClick={onRetry} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-surface px-4 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {detail ? <p className="text-[13px] text-ink-muted">{detail}</p> : null}
      {action}
    </div>
  );
}

/** A book with nothing in it: filters that match nothing (with Clear
 *  filters), or an empty book in the page's own words (with Add). */
export function EmptyBook({
  filtered,
  noun,
  title,
  detail,
  onClearFilters,
  onAdd,
}: {
  filtered: boolean;
  noun: PortfolioNoun;
  /** The unfiltered state's words. */
  title: string;
  detail: string;
  onClearFilters: () => void;
  onAdd: () => void;
}) {
  return filtered ? (
    <EmptyState
      title={`No ${noun.many} match these filters`}
      detail="Remove a filter, or clear them all."
      action={
        <button type="button" onClick={onClearFilters} className={`${QUIET} border border-line`}>
          Clear filters
        </button>
      }
    />
  ) : (
    <EmptyState
      title={title}
      detail={detail}
      action={
        <button type="button" onClick={onAdd} className={`${QUIET} bg-accent text-on-accent hover:bg-accent-hover`}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          {`Add ${noun.one}`}
        </button>
      }
    />
  );
}

/** EmptyBook drawn inside the list's own card (UI foundations spec §4.4):
 *  neutral, no box of its own. The toolbar holds the page's one primary,
 *  so Add here is a plain button. */
export function EmptyBookState({ filtered, noun, title, detail, onClearFilters, onAdd }: Parameters<typeof EmptyBook>[0]) {
  return filtered ? (
    <UiEmptyState
      title={`No ${noun.many} match these filters`}
      detail="Remove a filter, or clear them all."
      action={
        <button type="button" onClick={onClearFilters} className={BUTTON}>
          Clear filters
        </button>
      }
    />
  ) : (
    <UiEmptyState
      title={title}
      detail={detail}
      action={
        <button type="button" onClick={onAdd} className={BUTTON}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {`Add ${noun.one}`}
        </button>
      }
    />
  );
}

/** How long a Show more click waits for its page before it gives up on
 *  moving focus (a slow read leaves focus where it was). */
const FOCUS_NEW_ROW_MS = 10_000;
let disarmFocusNewRow: (() => void) | null = null;

/** Paging focus: remember how many rows `list` holds, then focus the first
 *  link or button of the first new row once it lands. It lives outside the
 *  button, so it still runs when the last page unmounts Show more; a new
 *  click re-arms it, and it gives up after FOCUS_NEW_ROW_MS or if focus
 *  has moved elsewhere meanwhile. */
function focusFirstNewRow(list: HTMLElement, button: HTMLElement) {
  disarmFocusNewRow?.();
  const index = list.children.length;
  const observer = new MutationObserver(() => {
    const row = list.children[index];
    if (!row) return;
    const active = document.activeElement;
    if (!active || active === document.body || active === button) row.querySelector<HTMLElement>('a, button')?.focus();
    stop();
  });
  const timer = window.setTimeout(() => stop(), FOCUS_NEW_ROW_MS);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
    if (disarmFocusNewRow === stop) disarmFocusNewRow = null;
  }
  observer.observe(list, { childList: true });
  disarmFocusNewRow = stop;
}

/** Show more: fills a list card's footer; elsewhere the call site gives its
 *  spacing through `className`. With `list` (the rows' list), focus moves
 *  to the first new row once its page lands. */
export function MoreButton({
  next,
  loading,
  error,
  label,
  onClick,
  list,
  className = '',
}: {
  next: string | null;
  loading: boolean;
  error: string | null;
  label: string;
  onClick: () => void;
  list?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  if (!next) return null;
  return (
    <div className={`flex w-full flex-col items-center gap-1 ${className}`.trim()}>
      <button
        type="button"
        onClick={(event) => {
          if (list?.current) focusFirstNewRow(list.current, event.currentTarget);
          onClick();
        }}
        disabled={loading}
        className={`${QUIET} w-full`}
      >
        {loading ? 'Loading…' : label}
      </button>
      {error ? (
        <p role="alert" className="text-[11px] leading-4 text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** What a grouped section's header reads. */
export interface SectionGroup {
  key: string;
  label: string;
  count: number;
}

/** A book page with its groups (a portfolio's or a Pipelines kind's). */
export type SectionsPage<R, G extends SectionGroup> = Paged<R> & { count: number; groups: G[] };

function Section<R, P extends SectionsPage<R, G>, G extends SectionGroup>({
  read,
  noun,
  group,
  groupsKey,
  query,
  version,
  money,
  defaultOpen,
  renderRow,
  onRowsLoaded,
  skeleton,
  framed,
  listHeader,
}: {
  read: (query: string) => Promise<P>;
  noun: PortfolioNoun;
  group: G;
  /** The joined keys of every group currently shown, so this section's
   *  `open` state can be reset below when the *set* of groups changes (a
   *  filter change can shift which index this group sits at, or shift the
   *  total across the "4 or fewer" line) even though React reuses this same
   *  component instance (its own `key` — this group's key alone — didn't
   *  change). Merely opening/closing this one section does not change it. */
  groupsKey: string;
  /** This section's own read. */
  query: string;
  version: number;
  /** The header's total, already formatted in the workspace currency. */
  money: string;
  defaultOpen: boolean;
  renderRow: (row: R, state: { loading: boolean }) => ReactNode;
  onRowsLoaded: (rows: R[]) => void;
  skeleton: (count: number) => ReactNode;
  framed?: boolean;
  listHeader?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Re-applies the start-open rule whenever the group set changes, adjusted
  // during render (no effect). A section this flips from closed to open was
  // never fetched (it was disabled), so it fetches page one below — accepted,
  // since the group set changing already means the list moved under the user.
  const [seenGroups, setSeenGroups] = useState(groupsKey);
  if (seenGroups !== groupsKey) {
    setSeenGroups(groupsKey);
    setOpen(defaultOpen);
  }
  const bodyId = useId();
  const page = usePagedRead<R, P>(read, noun, query, open, version, onRowsLoaded);
  return (
    <section>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
          className={`flex w-full min-h-11 sm:min-h-9 items-center gap-2 rounded-lg px-1 text-left text-[13px] font-semibold text-ink hover:bg-subtle ${FOCUS}`}
        >
          <ChevronRight
            className={`w-4 h-4 text-ink-muted transition-transform duration-[var(--dur-fast)] ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          {group.label}{' '}
          <span className="font-normal text-ink-muted">
            {' · '}
            <span className={NUM}>{group.count}</span>
            {' · '}
            <span className={NUM}>{money}</span>
          </span>
        </button>
      </h2>
      {open ? (
        <div id={bodyId} className="mt-1.5">
          {framed ? (
            page.error && page.rows.length === 0 ? (
              <ListCard label={group.label} state={<UiErrorState message={page.error} onRetry={page.retry} />} />
            ) : page.loading && page.rows.length === 0 ? (
              <ListCard label={group.label} state={<LoadingState label={`Loading ${group.label}`} count={Math.min(3, group.count)} />} />
            ) : (
              <div aria-busy={page.loading}>
                <ListCard label={group.label} header={listHeader}>
                  {page.rows.map((row) => renderRow(row, { loading: page.loading }))}
                </ListCard>
              </div>
            )
          ) : page.error && page.rows.length === 0 ? (
            <p role="alert" className="flex items-center gap-2 px-1 text-[13px] text-danger">
              {page.error}
              <button type="button" onClick={page.retry} className={QUIET}>
                Try again
              </button>
            </p>
          ) : page.loading && page.rows.length === 0 ? (
            skeleton(Math.min(3, group.count))
          ) : (
            <ul className="flex flex-col gap-1.5" aria-busy={page.loading}>
              {page.rows.map((row) => renderRow(row, { loading: page.loading }))}
            </ul>
          )}
          <MoreButton
            next={page.next}
            loading={page.loadingMore}
            error={page.moreError}
            label={`Show more ${group.label}`}
            onClick={() => void page.loadMore()}
            className="mt-1.5"
          />
        </div>
      ) : null}
    </section>
  );
}

/** A book's list body, for any page: grouped sections (each with its own
 *  pages, read through `read` with `sectionQuery`) or one flat list, plus
 *  the loading, empty and error states spec §1 asks for. The page supplies
 *  its words, its empty state, its placeholders and each group's total. */
export function PagedSections<R, P extends SectionsPage<R, G>, G extends SectionGroup>({
  book,
  read,
  noun,
  grouped,
  listHeading,
  sectionQuery,
  version,
  groupMoney,
  renderRow,
  onRowsLoaded,
  empty,
  skeleton,
  framed = false,
  listHeader,
}: {
  book: PagedBook<R, P>;
  read: (query: string) => Promise<P>;
  noun: PortfolioNoun;
  grouped: boolean;
  /** The flat list's own (visually hidden) heading. */
  listHeading: string;
  sectionQuery: (groupKey: string) => string;
  version: number;
  groupMoney: (group: G) => string;
  renderRow: (row: R, state: { loading: boolean }) => ReactNode;
  onRowsLoaded: (rows: R[]) => void;
  /** Shown when the book is empty (EmptyBook, in the page's words). */
  empty: ReactNode;
  skeleton: (count: number) => ReactNode;
  /** Draw the list as one divided card, its states inside it (Records). */
  framed?: boolean;
  /** Column labels at the top of each framed card. */
  listHeader?: ReactNode;
}) {
  const { data, error } = book;
  if (!data && error) {
    return framed ? (
      <ListCard label={listHeading} state={<UiErrorState message={error} onRetry={book.retry} />} />
    ) : (
      <ErrorBlock message={error} onRetry={book.retry} />
    );
  }
  if (!data) return framed ? <ListCard label={listHeading} state={<LoadingState label={`Loading ${noun.many}`} count={6} />} /> : skeleton(6);
  if (data.count === 0) return framed ? <ListCard label={listHeading} state={empty} /> : empty;

  // `error` is a stale-but-still-shown re-fetch failure (spec §1: keep the
  // last good list rather than blank it) and already ends in its own period
  // (e.g. "Could not load organizations."), so appending a sentence needs
  // its own leading capital, not a second period run on from the first.
  const staleError = error ? (
    <p role="alert" className="flex items-center gap-2 text-[13px] text-danger">
      {error} Showing the last result.
      <button type="button" onClick={book.retry} className={QUIET}>
        Try again
      </button>
    </p>
  ) : null;

  if (!grouped) {
    return (
      <div aria-busy={book.loading}>
        {/* The flat list's own heading, so an opened row's panels (h3) sit
            under it rather than under the last summary tile's. */}
        <h2 className="sr-only">{listHeading}</h2>
        {staleError}
        {framed ? (
          <ListCard label={listHeading} header={listHeader}>
            {book.rows.map((row) => renderRow(row, { loading: book.loading }))}
          </ListCard>
        ) : (
          <ul className="flex flex-col gap-1.5">{book.rows.map((row) => renderRow(row, { loading: book.loading }))}</ul>
        )}
        <MoreButton
          next={book.next}
          loading={book.loadingMore}
          error={book.moreError}
          label={`Show more ${noun.many}`}
          onClick={() => void book.loadMore()}
          className="mt-1.5"
        />
      </div>
    );
  }

  const groupsKey = data.groups.map((group) => group.key).join('|');

  return (
    <div className="flex flex-col gap-4" aria-busy={book.loading}>
      {staleError}
      {data.groups.map((group, index) => (
        <Section<R, P, G>
          key={group.key}
          read={read}
          noun={noun}
          group={group}
          groupsKey={groupsKey}
          query={sectionQuery(group.key)}
          version={version}
          money={groupMoney(group)}
          defaultOpen={sectionStartsOpen(index, data.groups.length)}
          renderRow={renderRow}
          onRowsLoaded={onRowsLoaded}
          skeleton={skeleton}
          framed={framed}
          listHeader={listHeader}
        />
      ))}
    </div>
  );
}

/** The portfolio kind's list body (Organizations, Accounts). */
export function PortfolioSections<R extends PortfolioRowBase>({
  params,
  version,
  portfolio,
  currency,
  filtered,
  renderRow,
  onRowsLoaded,
  onClearFilters,
  onAdd,
  pinned = false,
}: {
  params: PortfolioParams;
  version: number;
  portfolio: PortfolioState<R, FilterOptions>;
  currency: CurrencyCode;
  filtered: boolean;
  renderRow: PortfolioRowRenderer<R>;
  /** Rows that just landed (a page one or a `loadMore` append), for a
   *  pinned-fields cache or the like. It only ever *adds* — it must never be
   *  used to prune the selection against these rows (grouped mode has no one
   *  full row set to prune against, and flat mode prunes only when
   *  `portfolio.loadedQuery` changes, not on every append this callback
   *  also sees). */
  onRowsLoaded: (rows: R[]) => void;
  onClearFilters: () => void;
  onAdd: () => void;
  /** Any pinned field shows on the rows: the grid gains its column. */
  pinned?: boolean;
}) {
  const kind = usePortfolioKind();
  const read = useCallback((q: string) => kind.fetch(q) as Promise<PortfolioPage<R, FilterOptions>>, [kind]);
  return (
    <PagedSections<R, PortfolioPage<R, FilterOptions>, PortfolioGroup>
      book={portfolio}
      read={read}
      noun={kind.noun}
      grouped={params.group !== ''}
      listHeading={`${capitalise(kind.noun.many)} list`}
      sectionQuery={(groupKey) => toApiQuery(params, { group_value: groupKey, limit: String(SECTION_PAGE_SIZE) })}
      version={version}
      groupMoney={(group) => formatCompactMoney(group.arr, currency)}
      renderRow={renderRow}
      onRowsLoaded={onRowsLoaded}
      framed
      listHeader={<ListHeaderRow columns={rowColumns(pinned)} labels={rowLabels(pinned)} align={rowAligns(pinned)} show="@min-[62rem]:grid @min-[62rem]:gap-x-2" />}
      empty={
        <EmptyBookState
          filtered={filtered}
          noun={kind.noun}
          title={`No ${kind.noun.many} yet`}
          detail={`Add an ${kind.noun.one} to start your portfolio.`}
          onClearFilters={onClearFilters}
          onAdd={onAdd}
        />
      }
      skeleton={(count) => <RowSkeleton count={count} />}
    />
  );
}

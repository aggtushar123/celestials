import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { FilterOptions, LifecycleValue, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { BoardCard } from './BoardCard';
import { usePortfolioKind } from './portfolioKind';
import { useColumnRows } from './boardFrame';
import { withMovedRow, type BoardColumnSpec, type BoardMove, type StageMove } from './boardMove';
import { MoreButton } from './PortfolioSections';
import { useEndSentinel } from './useEndSentinel';
import type { Paged, PagedRead } from './usePagedRead';
import { usePagedPortfolio } from './usePortfolio';
import { COLUMN_ICON_BUTTON, QUIET } from './styles';
import { BUTTON, NUM, TYPE } from '../../ui';

export interface BoardColumnProps<R extends PortfolioRowBase = PortfolioRow> {
  /** The header's figures, already adjusted for an optimistic move. */
  spec: BoardColumnSpec;
  /** This column's read: the view's query plus group_value and limit. */
  query: string;
  /** Whether to read at all: false for a column the server counts empty
   *  and for the drop-only Churn column. */
  enabled: boolean;
  version: number;
  currency: CurrencyCode;
  isSm: boolean;
  /** Beside the open Ask rail: w-64 rather than w-72 (from sm). */
  narrow?: boolean;
  canMove: boolean;
  saving: boolean;
  /** Why moving is off, when it is stuck (the frame reload failed). */
  pausedNote?: string | null;
  move: BoardMove<R> | null;
  filtered: boolean;
  openId: number | null;
  /** The card moved here from its Move to… menu: until the move settles,
   *  focus is put back on its Open button whenever it falls to <body>
   *  (its mount here, and every re-sort that moves its node). */
  focusId: number | null;
  /** The card being dragged, if any (held by the board, not read back from dataTransfer). */
  dragging: R | null;
  onOpen: (row: R) => void;
  onMove: (row: R, to: LifecycleValue, fromMenu?: boolean) => void;
  onDragStart: (row: R) => void;
  onDragEnd: () => void;
  /** This column has swapped a saved move's guess for its own fresh page
   *  (or its read failed, so it never will). */
  onHandedOver: (key: string, token: number) => void;
  onRowsLoaded: (rows: R[]) => void;
  /** The drop-only Churn column's "Show churned" (Organizations only). */
  onShowChurned?: () => void;
  /** Lifecycle columns the kind adds to (Organizations: not Churn, ruling
   *  R2): the header's "+" adds a record already in this stage. Absent,
   *  there is no "+". */
  onAdd?: (stage: LifecycleValue) => void;
  /** Phones: the panel the column tabs scroll to. */
  panelRef?: (element: HTMLElement | null) => void;
}

/** Card-shaped loading placeholders: an avatar circle first unless
 *  `avatar` is false (a Pipelines card has none). */
export function CardSkeleton({ label, count, avatar = true }: { label: string; count: number; avatar?: boolean }) {
  return (
    <div role="status" aria-label={`Loading ${label}`}>
      <ul aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: Math.max(1, count) }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
            <span className="flex items-center gap-2.5">
              {avatar ? <span className="h-10 w-10 animate-pulse rounded-full bg-subtle" /> : null}
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="block h-3 w-28 animate-pulse rounded bg-subtle" />
                <span className="block h-2.5 w-20 animate-pulse rounded bg-subtle" />
              </span>
            </span>
            <span className="block h-3 w-24 animate-pulse rounded bg-subtle" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A column header's " · count · money" (mono), after its label. */
export function ColumnFigures({ count, money, part }: { count: number; money: string; part: string }) {
  return (
    <span className="font-normal text-ink-muted">
      {' · '}
      <span data-part="count" className={NUM}>
        {count}
      </span>
      {' · '}
      <span data-part={part} className={NUM}>
        {money}
      </span>
    </span>
  );
}

export interface StageColumnProps<R extends { id: number }> {
  columnKey: string;
  label: string;
  /** ColumnFigures, or null for a column with no figures. */
  figures: ReactNode;
  /** The header's buttons after the label. */
  actions?: ReactNode;
  /** A body in place of the cards (a drop-only or collapsed column). */
  placeholder?: ReactNode;
  /** This column's read (group_value=<key>). */
  page: PagedRead<R, Paged<R>>;
  enabled: boolean;
  /** The header count, for the placeholders' number. */
  count: number;
  /** From `sm`: its width in the row (w-72, w-64 beside a rail, …). */
  width: string;
  isSm: boolean;
  canMove: boolean;
  saving: boolean;
  move: StageMove<R> | null;
  withMoved: (rows: R[]) => R[];
  focusId: number | null;
  dragging: R | null;
  stageOf: (row: R) => string;
  /** A card dropped here. */
  onDrop: (row: R) => void;
  onHandedOver: (key: string, token: number) => void;
  emptyText: string;
  skeletonAvatar: boolean;
  renderCard: (row: R) => ReactNode;
  panelRef?: (element: HTMLElement | null) => void;
}

/** One column of any board: its own cursor-paged read that loads its next
 *  page when its end scrolls into view, with a visible Show more as the
 *  fallback; the move's guess until its fresh page lands; a drop target
 *  while cards can move. The column has no surface of its own (cards are
 *  the items). */
export function StageColumn<R extends { id: number }>({
  columnKey,
  label,
  figures,
  actions = null,
  placeholder = null,
  page,
  enabled,
  count,
  width,
  isSm,
  canMove,
  saving,
  move,
  withMoved,
  focusId,
  dragging,
  stageOf,
  onDrop: onDropCard,
  onHandedOver,
  emptyText,
  skeletonAvatar,
  renderCard,
  panelRef,
}: StageColumnProps<R>) {
  const headingId = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [over, setOver] = useState(false);
  const rows = useColumnRows({ page, columnKey, enabled, move, withMoved, onHandedOver, focusId, sectionRef });
  const sentinelRef = useEndSentinel(
    () => void page.loadMore(),
    enabled && page.next !== null && !page.loadingMore && page.moreError === null,
  );
  const dropEnabled = canMove && !saving && dragging !== null && stageOf(dragging) !== columnKey;
  // A drag cancelled with Escape sends no dragleave here: forget the hover
  // with the drag, so the next drag doesn't light this column up unvisited.
  if (over && dragging === null) setOver(false);

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!dropEnabled) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (!over) setOver(true);
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOver(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setOver(false);
    if (dropEnabled && dragging) onDropCard(dragging);
  };

  let body: ReactNode;
  if (placeholder) {
    body = placeholder;
  } else if (page.error && rows.length === 0) {
    body = (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
        {page.error}
        <button type="button" onClick={page.retry} className={QUIET}>
          Try again
        </button>
      </p>
    );
  } else if (enabled && page.loading && rows.length === 0) {
    body = <CardSkeleton label={label} count={Math.min(3, count)} avatar={skeletonAvatar} />;
  } else if (rows.length === 0) {
    body = <p className={`rounded-xl border border-dashed border-line p-3 ${TYPE.bodyMuted}`}>{emptyText}</p>;
  } else {
    body = (
      <ul className="flex flex-col gap-2" aria-busy={page.loading}>
        {rows.map(renderCard)}
        <li ref={sentinelRef} data-sentinel="" aria-hidden="true" className="h-px" />
      </ul>
    );
  }

  return (
    <section
      ref={(element) => {
        sectionRef.current = element;
        panelRef?.(element);
      }}
      data-column={columnKey}
      aria-labelledby={headingId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex min-h-0 shrink-0 flex-col gap-2 rounded-xl p-1 transition-colors duration-[var(--dur-fast)] ${
        isSm ? width : 'w-full snap-start'
      } ${over && dropEnabled ? 'bg-accent-dim ring-2 ring-accent' : ''}`}
    >
      <div className="flex items-center gap-1">
        <h2 id={headingId} className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold text-ink">
          {label}
          {figures}
        </h2>
        {actions}
      </div>
      <div data-scroll-root={isSm ? '' : undefined} className={isSm ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
        {body}
        <MoreButton
          next={enabled ? page.next : null}
          loading={page.loadingMore}
          error={page.moreError}
          label={`Show more ${label}`}
          onClick={() => void page.loadMore()}
          className="mt-1.5"
        />
      </div>
    </section>
  );
}

/** One Organizations or Accounts Board column (spec §1 "Board"), a
 *  StageColumn of BoardCards. Lifecycle columns are drop targets. */
export function BoardColumn<R extends PortfolioRowBase>({
  spec,
  query,
  enabled,
  version,
  currency,
  isSm,
  narrow = false,
  canMove,
  saving,
  pausedNote = null,
  move,
  filtered,
  openId,
  focusId,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onHandedOver,
  onRowsLoaded,
  onShowChurned,
  onAdd,
  panelRef,
}: BoardColumnProps<R>) {
  const kind = usePortfolioKind();
  const page = usePagedPortfolio<R, FilterOptions>(query, enabled, version, onRowsLoaded);
  return (
    <StageColumn<R>
      columnKey={spec.key}
      label={spec.label}
      figures={spec.dropOnly ? null : <ColumnFigures count={spec.count} money={formatCompactMoney(spec.arr, currency)} part="arr" />}
      actions={
        onAdd && kind.addsTo(spec.key as LifecycleValue) ? (
          <button
            type="button"
            onClick={() => onAdd(spec.key as LifecycleValue)}
            aria-label={`Add ${kind.noun.one} to ${spec.label}`}
            className={COLUMN_ICON_BUTTON}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : null
      }
      placeholder={
        spec.dropOnly ? (
          <div className={`flex flex-col items-start gap-2 rounded-xl border border-dashed border-line p-3 ${TYPE.bodyMuted}`}>
            <p>Churned accounts are hidden.</p>
            <p>{isSm ? 'Drop a card here to churn it.' : 'Use a card’s Move to… menu to churn it.'}</p>
            <button type="button" onClick={onShowChurned} className={BUTTON}>
              Show churned
            </button>
          </div>
        ) : null
      }
      page={page}
      enabled={enabled}
      count={spec.count}
      width={narrow ? 'w-64' : 'w-72'}
      isSm={isSm}
      canMove={canMove}
      saving={saving}
      move={move}
      withMoved={(rows) => withMovedRow(rows, spec.key, move)}
      focusId={focusId}
      dragging={dragging}
      stageOf={(row) => row.lifecycle.value}
      onDrop={(row) => onMove(row, spec.key as LifecycleValue)}
      onHandedOver={onHandedOver}
      emptyText={filtered ? 'None match these filters.' : `No ${kind.noun.many} in ${spec.label}.`}
      skeletonAvatar
      renderCard={(row) => (
        <BoardCard
          key={row.id}
          row={row}
          currency={currency}
          isSm={isSm}
          open={openId === row.id}
          canMove={canMove}
          moveDisabled={saving}
          moveNote={pausedNote}
          onOpen={onOpen}
          onMove={onMove}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      )}
      panelRef={panelRef}
    />
  );
}

import { useCallback, useEffect, useRef, useState, type ReactNode, type UIEvent } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { toApiQuery, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions, LifecycleValue, PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { BoardColumn } from './BoardColumn';
import { PAUSED, useBoardMoves, useFrameInputs } from './boardFrame';
import { boardColumns, withMove, type BoardMove } from './boardMove';
import { usePortfolioKind } from './portfolioKind';
import { EmptyBookState } from './PortfolioSections';
import { Card, ErrorState as UiErrorState, NUM } from '../../ui';
import { SECTION_PAGE_SIZE, type PortfolioState } from './usePortfolio';
import { FOCUS, QUIET } from './styles';

/** The phone panels' gap (`gap-3`), for reading which panel a swipe rests on. */
const PANEL_GAP = 12;
/** How long a tab's smooth scroll may take before swipes are followed again
 *  even if it never arrived (the user swiped mid-way). */
const JUMP_MS = 1000;

export interface PortfolioBoardProps<R extends PortfolioRowBase = PortfolioRow> {
  /** The Board's params (boardParams): `group` is never '' here. */
  params: PortfolioParams;
  /** The frame read: groups (the column headers), count and currency. */
  portfolio: PortfolioState<R, FilterOptions>;
  /** Reloads everything when bumped (Add, Edit, Churn). */
  version: number;
  /** Per-column reload counters, bumped for the two columns a move touched. */
  columnBumps: Record<string, number>;
  currency: CurrencyCode;
  isSm: boolean;
  /** The Ask rail is open beside the board (from `sm`): columns are w-64
   *  rather than w-72, so more of them fit beside it. */
  narrow?: boolean;
  filtered: boolean;
  move: BoardMove<R> | null;
  /** A move is saving or settling: moving is off (one at a time). */
  saving: boolean;
  openId: number | null;
  onOpen: (row: R) => void;
  onMove: (row: R, to: LifecycleValue) => void;
  onRowsLoaded: (rows: R[]) => void;
  onClearFilters: () => void;
  /** Add a row (an organization or an account, by kind): from the empty
   *  state with no stage, or from a lifecycle column's "+" with that
   *  stage (ruling R2). */
  onAdd: (stage?: LifecycleValue) => void;
  /** The drop-only Churn column's "Show churned" (Organizations only). */
  onShowChurned?: () => void;
  /** A saved move's reloads have all landed (the frame and both columns),
   *  so the page can forget it and allow the next one. */
  onMoveSettled: (token: number) => void;
}

export function BoardSkeleton({ isSm, narrow }: { isSm: boolean; narrow: boolean }) {
  return (
    <div role="status" aria-label="Loading the board" className="flex gap-3 overflow-hidden">
      {Array.from({ length: isSm ? 4 : 1 }, (_, i) => (
        <div key={i} aria-hidden="true" className={`flex shrink-0 flex-col gap-2 p-1 ${isSm ? (narrow ? 'w-64' : 'w-72') : 'w-full'}`}>
          <span className="block h-3 w-24 animate-pulse rounded bg-subtle" />
          {[0, 1, 2].map((j) => (
            <span key={j} className="block h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The Board's body (spec §1 "Board", owner decisions 2026-09-26). Columns
 *  are the groups; grouped by lifecycle every stage is a column and cards
 *  move between them. From `sm` the columns sit in a row that scrolls
 *  sideways, and each column scrolls on its own. Below `sm` they are
 *  full-width panels that snap, with a strip of column tabs. */
export function PortfolioBoard<R extends PortfolioRowBase>({
  params,
  portfolio,
  version,
  columnBumps,
  currency,
  isSm,
  narrow = false,
  filtered,
  move,
  saving,
  openId,
  onOpen,
  onMove,
  onRowsLoaded,
  onClearFilters,
  onAdd,
  onShowChurned,
  onMoveSettled,
}: PortfolioBoardProps<R>) {
  const kind = usePortfolioKind();
  const { data, error } = portfolio;
  const fresh = !portfolio.loading && !error;
  const inputs = useFrameInputs({ params, version, columnBumps }, fresh);

  const group = inputs.params.group || 'lifecycle';
  const canMove = group === 'lifecycle';
  const columns = data ? boardColumns(group, data.groups, kind.churnVisible(inputs.params)) : [];
  const reads = (key: string) => columns.some((spec) => spec.key === key && spec.count > 0 && !spec.dropOnly);
  // A kind's churn form (Organizations) takes focus itself.
  const keepsFocus = useCallback((to: LifecycleValue) => !(to === 'churn' && kind.churnByModal), [kind]);
  const { dragging, startDrag, endDrag, moveCard, focusId, onHandedOver, countsMoved } = useBoardMoves<R, LifecycleValue>({
    move,
    frameKey: portfolio.loadedKey,
    fresh,
    reads,
    onMove,
    onMoveSettled,
    keepsFocus,
  });

  if (!data && error) return (
      <Card pad="none">
        <UiErrorState message={error} onRetry={portfolio.retry} />
      </Card>
    );
  if (!data) return <BoardSkeleton isSm={isSm} narrow={narrow} />;
  if (data.count === 0) {
    return (
      <Card pad="none">
        <EmptyBookState
          filtered={filtered}
          noun={kind.noun}
          title={`No ${kind.noun.many} yet`}
          detail={`Add an ${kind.noun.one} to start your portfolio.`}
          onClearFilters={onClearFilters}
          onAdd={() => onAdd()}
        />
      </Card>
    );
  }

  const shown = columns.map((spec) => (countsMoved ? withMove(spec, move) : spec));
  // A saved move settles only once the frame reloads, so while that reload
  // is failing, moving stays off: say why, on the alert and on each control.
  const paused = error !== null && move !== null;

  const renderColumn = (index: number, panelRef?: (element: HTMLElement | null) => void) => {
    const spec = columns[index];
    return (
      <BoardColumn
        key={spec.key}
        spec={shown[index]}
        query={toApiQuery(inputs.params, { group_value: spec.key, limit: String(SECTION_PAGE_SIZE) })}
        enabled={spec.count > 0 && !spec.dropOnly}
        version={inputs.version + (inputs.columnBumps[spec.key] ?? 0)}
        currency={currency}
        isSm={isSm}
        narrow={narrow}
        canMove={canMove}
        saving={saving}
        pausedNote={paused ? PAUSED : null}
        move={move}
        filtered={filtered}
        openId={openId}
        focusId={focusId}
        dragging={dragging}
        onOpen={onOpen}
        onMove={moveCard}
        onDragStart={startDrag}
        onDragEnd={endDrag}
        onHandedOver={onHandedOver}
        onRowsLoaded={onRowsLoaded}
        onShowChurned={onShowChurned}
        onAdd={canMove ? onAdd : undefined}
        panelRef={panelRef}
      />
    );
  };

  return (
    <BoardLayout
      isSm={isSm}
      busy={portfolio.loading}
      error={error}
      paused={paused}
      onRetry={portfolio.retry}
      tabs={shown.map((spec) => ({ key: spec.key, label: spec.label, count: spec.dropOnly ? null : spec.count }))}
      renderColumn={renderColumn}
    />
  );
}

/** The body every board shares once its frame has landed: the stale-frame
 *  alert, then from `sm` the columns in a row that scrolls sideways (each
 *  scrolls on its own); below `sm` full-width panels that snap, with a
 *  strip of column tabs that follows the swipes. `renderColumn` draws the
 *  column at `index`, given the panel ref the tabs scroll to (phones). */
export function BoardLayout({
  isSm,
  busy,
  error,
  paused,
  onRetry,
  tabs,
  renderColumn,
}: {
  isSm: boolean;
  busy: boolean;
  /** The frame's reload failed: the board shows the last result. */
  error: string | null;
  /** …while a saved move waits on it, so moving is off. */
  paused: boolean;
  onRetry: () => void;
  /** One per column; `count` null shows none (a drop-only column). */
  tabs: { key: string; label: string; count: number | null }[];
  renderColumn: (index: number, panelRef?: (element: HTMLElement | null) => void) => ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  // The panels the tabs scroll to, by key: filled by the columns' ref
  // callbacks, read in the tabs' click handler (one Map for the board's life).
  const [panels] = useState(() => new Map<string, HTMLElement>());
  const jumping = useRef<{ key: string; until: number } | null>(null);
  const setPanel = (key: string, element: HTMLElement | null) => {
    if (element) panels.set(key, element);
    else panels.delete(key);
  };
  const activeKey = active !== null && tabs.some((tab) => tab.key === active) ? active : (tabs[0]?.key ?? null);

  // `at` is the click's event timeStamp, the clock the scroll events use.
  const jump = (key: string, at: number) => {
    setActive(key);
    jumping.current = { key, until: at + JUMP_MS };
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panels.get(key)?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  };

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.clientWidth === 0) return;
    const key = tabs[Math.round(el.scrollLeft / (el.clientWidth + PANEL_GAP))]?.key;
    // A tab's smooth scroll passes the panels between: ignore them until it
    // arrives, so aria-current doesn't flicker through every stage.
    const pending = jumping.current;
    if (pending) {
      if (key === pending.key || event.timeStamp > pending.until) jumping.current = null;
      else return;
    }
    if (key && key !== activeKey) setActive(key);
  };

  const staleError = error ? (
    <p role="alert" className="flex items-center gap-2 text-[13px] text-danger-ink">
      {error} Showing the last result.{paused ? ` ${PAUSED}` : ''}
      <button type="button" onClick={onRetry} className={QUIET}>
        Try again
      </button>
    </p>
  ) : null;

  const columnEls = tabs.map((tab, index) => renderColumn(index, isSm ? undefined : (element) => setPanel(tab.key, element)));
  const { ref: rowRef, more, onScroll: onRowScroll } = useMoreToTheRight();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-busy={busy}>
      {staleError}
      {isSm ? (
        // UI broken-things fix 13: with the Ask rail open the last column sat
        // past the edge with no hint. The row keeps a visible scrollbar and
        // fades at its right edge while there is more to scroll to.
        <div
          ref={rowRef}
          onScroll={onRowScroll}
          data-more={more ? 'right' : undefined}
          className={`rv-scrollbar flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 ${more ? MORE_FADE : ''}`}
        >
          {columnEls}
        </div>
      ) : (
        <>
          <nav aria-label="Board columns" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-current={tab.key === activeKey ? 'true' : undefined}
                onClick={(event) => jump(tab.key, event.timeStamp)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] ${
                  tab.key === activeKey ? 'bg-accent-dim font-semibold text-ink' : 'text-ink-muted hover:bg-subtle active:bg-line-subtle'
                } ${FOCUS}`}
              >
                {tab.label}
                {tab.count === null ? null : (
                  <>
                    {' '}
                    <span className={`${NUM} text-[11px]`}>{tab.count}</span>
                  </>
                )}
              </button>
            ))}
          </nav>
          <div data-part="panels" onScroll={onScroll} className="flex snap-x snap-mandatory gap-3 overflow-x-auto">
            {columnEls}
          </div>
        </>
      )}
    </div>
  );
}

/** The fade a row wears while columns sit past its right edge. */
export const MORE_FADE = '[mask-image:linear-gradient(to_right,var(--color-ink)_calc(100%-48px),transparent)]';

/** Whether a sideways-scrolling row has more past its right edge: read on
 *  scroll, on a resize and after every render (columns load in later). */
function useMoreToTheRight() {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);
  useEffect(() => {
    measure();
  });
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  return { ref, more, onScroll: measure };
}

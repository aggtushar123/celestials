import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { MD, SM, useMediaQuery } from '../../lib/useMediaQuery';
import { fetchPlansPaged, updatePlan } from '../../features/plans/planApi';
import { BOARD_COLUMNS, PLAN_NOUN, STATUS_LABEL } from '../../features/plans/planOptions';
import { columnQuery, isFiltered, cleared, type PlanParams, type PlanScope } from '../../features/plans/planParams';
import { allMilestonesDone, isOpen, moveNotice, moveRefusal } from '../../features/plans/planText';
import type { PlanCounts, PlanRow, PlanStatus, PlansPage, SettableStatus } from '../../features/plans/planTypes';
import { Link } from 'react-router-dom';
import { BOARD_CARD_ACTIONS } from '../organizations/portfolio/BoardCard';
import { DismissibleAlert } from '../organizations/portfolio/DismissibleAlert';
import { MoreButton } from '../organizations/portfolio/PortfolioSections';
import { MoveToMenu } from '../organizations/portfolio/MoveToMenu';
import { errorMessage, usePagedRead } from '../organizations/portfolio/usePagedRead';
import { BUTTON, Card, EmptyState, ErrorState, FilterChip, FilterChipRow, FOCUS, LoadingState, NUM, Select, TYPE } from '../ui';
import { NextDue, PendingTasks, ProgressBar, RecordLink } from './parts';

/** The keyboard and touch alternative to dragging (Decision 6). Not started
 *  is never offered (Contract note 6); Done waits for every milestone. */
const moveTargets = (row: PlanRow) =>
  (['on_track', 'at_risk', 'done'] as const)
    .filter((status) => status !== row.status && (status !== 'done' || allMilestonesDone(row)))
    .map((status) => ({ value: status, label: STATUS_LABEL[status] }));

function PlanCard({ row, draggable, busy, onDragStart, onDragEnd, onMove }: {
  row: PlanRow;
  draggable: boolean;
  busy: boolean;
  onDragStart: (row: PlanRow) => void;
  onDragEnd: () => void;
  onMove: (row: PlanRow, to: PlanStatus) => void;
}) {
  const start = (event: DragEvent<HTMLElement>) => {
    // jsdom has no DataTransfer; browsers get the id so Firefox starts the drag.
    event.dataTransfer?.setData?.('text/plain', String(row.id));
    onDragStart(row);
  };
  const canMove = row.can_edit && isOpen(row.status);
  return (
    <Card
      as="li"
      pad="none"
      data-plan={row.id}
      draggable={draggable}
      onDragStart={draggable ? start : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      aria-busy={busy}
      className={`group relative ${busy ? 'opacity-60' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`.trim()}
    >
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-start gap-2">
          <Link
            to={`/projects/${row.id}`}
            draggable={false}
            className={`flex min-h-11 min-w-0 flex-1 items-center rounded-sm ${TYPE.body} font-semibold hover:underline sm:min-h-0 sm:pr-10 ${FOCUS}`}
          >
            <span className="truncate">{row.name}</span>
          </Link>
          {canMove ? (
            <div className={BOARD_CARD_ACTIONS}>
              <MoveToMenu name={row.name} disabled={busy} note={null} targets={moveTargets(row)} onChoose={(to) => onMove(row, to as PlanStatus)} />
            </div>
          ) : null}
        </div>
        <p className={`flex min-w-0 flex-wrap items-center gap-x-1.5 ${TYPE.meta}`}>
          <RecordLink record={row.record} /> · {row.owner.name}
        </p>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <ProgressBar done={row.milestones_done} total={row.milestones_total} label="milestones" />
          {row.status === 'draft' ? <PendingTasks n={row.pending_tasks} /> : <NextDue date={row.next_due} overdue={row.is_overdue} />}
        </span>
      </div>
    </Card>
  );
}

/** One column: one GET plans/?status=<s> under the same filters (Contract
 *  note 7). A card dropped on it asks the board to move it. */
function PlanColumn({ status, query, version, dragging, moving, isSm, onCount, onDragStart, onDragEnd, onDrop, onMove }: {
  status: PlanStatus;
  query: string;
  version: number;
  dragging: PlanRow | null;
  moving: number | null;
  isSm: boolean;
  onCount: (counts: PlanCounts) => void;
  onDragStart: (row: PlanRow) => void;
  onDragEnd: () => void;
  onDrop: (to: PlanStatus) => void;
  onMove: (row: PlanRow, to: PlanStatus) => void;
}) {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const read = usePagedRead<PlanRow, PlansPage & { next_cursor: string | null }>(fetchPlansPaged, PLAN_NOUN, query, true, version);
  const counts = read.data?.counts ?? null;
  useEffect(() => {
    if (counts) onCount(counts);
  }, [counts, onCount]);
  const [over, setOver] = useState(false);
  return (
    <section
      aria-labelledby={headingId}
      data-column={status}
      onDragOver={(event) => {
        if (!dragging) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDrop(status);
      }}
      className={`flex min-w-0 flex-col gap-2 rounded-xl p-2 ${over ? 'bg-subtle' : ''}`}
    >
      <h2 id={headingId} className={`flex items-center gap-2 px-1 ${TYPE.label}`}>
        {STATUS_LABEL[status]}
        <span className={`${TYPE.meta} ${NUM}`}>{counts ? (counts[status] ?? 0) : ''}</span>
      </h2>
      {read.error && read.rows.length === 0 ? (
        <Card pad="none">
          <ErrorState message={read.error} onRetry={read.retry} />
        </Card>
      ) : null}
      {read.loading && read.rows.length === 0 && !read.error ? (
        <Card pad="none">
          <LoadingState label={`Loading ${STATUS_LABEL[status]}`} count={2} />
        </Card>
      ) : null}
      {!read.loading && !read.error && read.rows.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-line px-3 py-6 text-center ${TYPE.bodyMuted}`}>No plans</p>
      ) : null}
      {read.rows.length > 0 ? (
        <ul ref={listRef} aria-label={`${STATUS_LABEL[status]} plans`} aria-busy={read.loading} className="flex flex-col gap-2">
          {read.rows.map((row) => (
            <PlanCard
              key={row.id}
              row={row}
              draggable={isSm && row.can_edit && isOpen(row.status) && moving === null}
              busy={moving === row.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMove={onMove}
            />
          ))}
        </ul>
      ) : null}
      <MoreButton next={read.next} loading={read.loadingMore} error={read.moreError} label="Show more" onClick={() => void read.loadMore()} list={listRef} className="mt-1.5" />
    </section>
  );
}

/** The board (spec §2.1): Not started · On track · At risk · Done, with Draft first on Show drafts and
 *  Cancelled on Show cancelled. Moves are not optimistic (Decision 6): the
 *  card stays until the server answers, then every column reads again. */
export function PlansBoard({ params, scope, onChange }: { params: PlanParams; scope: PlanScope; onChange: (next: PlanParams) => void }) {
  const isMd = useMediaQuery(MD);
  const isSm = useMediaQuery(SM);
  // A Draft is never open (Decision 11): its column comes first, on Show drafts.
  const columns: PlanStatus[] = [...(params.drafts ? (['draft'] as PlanStatus[]) : []), ...BOARD_COLUMNS, ...(params.cancelled ? (['cancelled'] as PlanStatus[]) : [])];
  const [picked, setPicked] = useState<PlanStatus>('not_started');
  const shown = isMd ? columns : [columns.includes(picked) ? picked : 'not_started'];
  const [version, setVersion] = useState(0);
  const [dragging, setDragging] = useState<PlanRow | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Every column's page carries every status's count; keep the latest for
  // these filters, so the picker and the empty board can read them.
  const base = columnQuery(params, scope, 'not_started');
  const [counts, setCounts] = useState<{ base: string; counts: PlanCounts } | null>(null);
  const onCount = useCallback((next: PlanCounts) => setCounts({ base, counts: next }), [base]);
  const known = counts?.base === base ? counts.counts : null;
  // Drafts count toward an empty board only while Show drafts is on.
  const empty = known !== null && Object.entries(known).every(([status, n]) => (status === 'draft' && !params.drafts) || n === 0);

  async function move(row: PlanRow, to: PlanStatus) {
    if (to === row.status || moving !== null) return;
    setNotice('');
    const refusal = moveRefusal(row, to);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    setMoving(row.id);
    try {
      await updatePlan(row.id, { status: to as SettableStatus });
      setNotice(moveNotice(row.name, to));
      setVersion((n) => n + 1);
    } catch (err) {
      setError(`Could not move ${row.name}: ${errorMessage(err, 'try again.')}`);
    } finally {
      setMoving(null);
    }
  }
  const drop = (to: PlanStatus) => {
    const row = dragging;
    setDragging(null);
    if (row) void move(row, to);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!isMd ? (
          <Select
            label="Column"
            labelPosition="inline"
            value={shown[0]}
            onChange={(status) => setPicked(status)}
            options={columns.map((status) => ({ value: status, label: known ? `${STATUS_LABEL[status]} (${known[status] ?? 0})` : STATUS_LABEL[status] }))}
          />
        ) : null}
        <div className="sm:ml-auto">
          <FilterChipRow label="Board columns">
            <FilterChip label="Show drafts" pressed={params.drafts} onToggle={() => onChange({ ...params, drafts: !params.drafts })} />
            <FilterChip label="Show cancelled" pressed={params.cancelled} onToggle={() => onChange({ ...params, cancelled: !params.cancelled })} />
          </FilterChipRow>
        </div>
      </div>
      <p role="status" data-part="board-notice" className={`${TYPE.bodyMuted} empty:sr-only`}>
        {notice}
      </p>
      {error ? <DismissibleAlert message={error} onDismiss={() => setError(null)} /> : null}
      {empty ? (
        <Card pad="none">
          <EmptyState
            title={isFiltered(params) ? 'No plans match these filters' : 'No plans yet'}
            detail={isFiltered(params) ? 'Remove a filter, or clear them all.' : 'A plan sets out the work on one customer over weeks: milestones, and the tasks under them.'}
            action={
              isFiltered(params) ? (
                <button type="button" onClick={() => onChange(cleared(params))} className={BUTTON}>
                  Clear filters
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : null}
      {/* Hidden, not unmounted, while empty: the columns keep reading as the filters change. */}
      <div hidden={empty} className={`grid gap-3 md:grid-cols-2 lg:grid-cols-4 ${columns.length === 5 ? 'xl:grid-cols-5' : ''} ${columns.length === 6 ? 'xl:grid-cols-6' : ''}`}>
        {shown.map((status) => (
          <PlanColumn
            key={status}
            status={status}
            query={columnQuery(params, scope, status)}
            version={version}
            dragging={dragging}
            moving={moving}
            isSm={isSm}
            onCount={onCount}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onDrop={drop}
            onMove={(row, to) => void move(row, to)}
          />
        ))}
      </div>
    </div>
  );
}

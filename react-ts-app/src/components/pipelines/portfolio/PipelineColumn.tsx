import { useEffect, useRef } from 'react';
import { EyeOff, Plus } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelinePage, PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { ColumnFigures, StageColumn } from '../../organizations/portfolio/BoardColumn';
import { COLUMN_ICON_BUTTON, QUIET } from '../../organizations/portfolio/styles';
import { usePagedRead } from '../../organizations/portfolio/usePagedRead';
import { PipelineCard } from './PipelineCard';
import { withMovedPipelineRow, type PipelineColumnSpec, type PipelineMove } from './pipelineMove';

export interface PipelineColumnProps {
  kind: PipelineKind;
  /** The header's figures, already adjusted for an optimistic move. */
  spec: PipelineColumnSpec;
  /** Closed Lost before Show: still a drop target, but it reads nothing. */
  collapsed: boolean;
  /** This column's read: the view's query plus group_value and limit. */
  query: string;
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
  move: PipelineMove | null;
  filtered: boolean;
  /** The card moved here from its Move to… menu: focus returns to its title. */
  focusId: number | null;
  dragging: PipelineRow | null;
  onOpen: (row: PipelineRow) => void;
  onMove: (row: PipelineRow, to: string, fromMenu?: boolean) => void;
  onDragStart: (row: PipelineRow) => void;
  onDragEnd: () => void;
  onHandedOver: (key: string, token: number) => void;
  onRowsLoaded: (rows: PipelineRow[]) => void;
  /** Stage columns: the header's "+" adds an item already in this stage
   *  (not while collapsed). */
  onAdd?: (stage: string) => void;
  /** A collapsible column's Show / Hide. */
  onToggleCollapsed?: () => void;
  /** Phones: the panel the column tabs scroll to. */
  panelRef?: (element: HTMLElement | null) => void;
}

/** One Pipelines Board column: the boards' StageColumn with this kind's
 *  read, PipelineCards, MRR in the header, and Closed Lost's Show / Hide. */
export function PipelineColumn({
  kind,
  spec,
  collapsed,
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
  focusId,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onHandedOver,
  onRowsLoaded,
  onAdd,
  onToggleCollapsed,
  panelRef,
}: PipelineColumnProps) {
  const page = usePagedRead<PipelineRow, PipelinePage>(kind.fetch, kind.noun, query, enabled, version, onRowsLoaded);
  const show = `Show ${spec.label}`;
  const hide = `Hide ${spec.label}`;
  const hideRef = useRef<HTMLButtonElement | null>(null);
  const showRef = useRef<HTMLButtonElement | null>(null);
  // Hide and Show replace each other's button, so a click always removes
  // the node focus was on: land it on whichever one takes its place. Only
  // after a click here, never on mount (StrictMode runs mount effects twice,
  // and focusing would scroll the board to this column).
  const toggled = useRef(false);
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    if (collapsed) showRef.current?.focus();
    else hideRef.current?.focus();
  }, [collapsed]);
  const toggle = () => {
    toggled.current = true;
    onToggleCollapsed?.();
  };
  return (
    <StageColumn<PipelineRow>
      columnKey={spec.key}
      label={spec.label}
      figures={<ColumnFigures count={spec.count} money={formatCompactMoney(spec.mrr, currency)} part="mrr" />}
      actions={
        <>
          {onToggleCollapsed && !collapsed ? (
            <button ref={hideRef} type="button" onClick={toggle} aria-label={hide} title={hide} className={COLUMN_ICON_BUTTON}>
              <EyeOff className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : null}
          {onAdd && !collapsed ? (
            <button type="button" onClick={() => onAdd(spec.key)} aria-label={`Add ${kind.noun.one} to ${spec.label}`} className={COLUMN_ICON_BUTTON}>
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : null}
        </>
      }
      placeholder={
        collapsed ? (
          <button ref={showRef} type="button" onClick={toggle} title={show} className={`${QUIET} w-full border border-dashed border-line`}>
            {show}
          </button>
        ) : null
      }
      page={page}
      enabled={enabled}
      count={spec.count}
      width={collapsed ? 'w-44' : narrow ? 'w-64' : 'w-72'}
      isSm={isSm}
      canMove={canMove}
      saving={saving}
      move={move}
      withMoved={(rows) => withMovedPipelineRow(rows, spec.key, move, kind)}
      focusId={focusId}
      dragging={dragging}
      stageOf={(row) => row.stage.value}
      onDrop={(row) => onMove(row, spec.key)}
      onHandedOver={onHandedOver}
      emptyText={filtered ? 'None match these filters.' : `No ${kind.noun.many} in ${spec.label}.`}
      skeletonAvatar={false}
      renderCard={(row) => (
        <PipelineCard
          key={row.id}
          row={row}
          kind={kind}
          currency={currency}
          isSm={isSm}
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

import { useCallback, useState } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { withArticle, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import { pipelineApiQuery, type PipelineParams } from '../../../features/pipelines/pipelineParams';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { PAUSED, useBoardMoves, useFrameInputs } from '../../organizations/portfolio/boardFrame';
import { BoardLayout, BoardSkeleton } from '../../organizations/portfolio/PortfolioBoard';
import { EmptyBookState } from '../../organizations/portfolio/PortfolioSections';
import { Card, ErrorState as UiErrorState } from '../../ui';
import { PipelineColumn } from './PipelineColumn';
import { pipelineColumns, withPipelineMove, type PipelineMove } from './pipelineMove';
import { PIPELINE_SECTION_SIZE, type PipelineBook } from './usePipelineBook';

export interface PipelineBoardProps {
  kind: PipelineKind;
  /** The Board's params (boardPipelineParams): `group` is never ''. */
  params: PipelineParams;
  /** The frame read: groups (the column figures), summary.stages (the
   *  stage columns), count and currency. */
  book: PipelineBook;
  /** Reloads everything when bumped (Add, Edit, Delete). */
  version: number;
  /** Per-column reload counters, bumped for the two columns a move touched. */
  columnBumps: Record<string, number>;
  currency: CurrencyCode;
  isSm: boolean;
  /** The Ask rail is open beside the board (from `sm`): columns are w-64
   *  rather than w-72, so more of them fit beside it. */
  narrow?: boolean;
  filtered: boolean;
  move: PipelineMove | null;
  /** A move is saving or settling: moving is off (one at a time). */
  saving: boolean;
  onOpen: (row: PipelineRow) => void;
  onMove: (row: PipelineRow, to: string) => void;
  onRowsLoaded: (rows: PipelineRow[]) => void;
  onClearFilters: () => void;
  /** Add from the empty state (no stage) or a stage column's "+". */
  onAdd: (stage?: string) => void;
  /** A saved move's reloads have all landed (the frame and both columns). */
  onMoveSettled: (token: number) => void;
}

/** The Board's body (spec §1 "Board"), on the boards' shared frame,
 *  moves and layout (as Organizations and Accounts): columns are the
 *  groups; by stage every stage is a column (Closed Lost collapsed until
 *  shown, for this visit only) and cards move between them. */
export function PipelineBoard({
  kind,
  params,
  book,
  version,
  columnBumps,
  currency,
  isSm,
  narrow = false,
  filtered,
  move,
  saving,
  onOpen,
  onMove,
  onRowsLoaded,
  onClearFilters,
  onAdd,
  onMoveSettled,
}: PipelineBoardProps) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const { data, error } = book;
  const fresh = !book.loading && !error;
  const inputs = useFrameInputs({ params, version, columnBumps }, fresh);

  const group = inputs.params.group || 'stage';
  const canMove = group === 'stage';
  const columns = data ? pipelineColumns(group, data, kind, inputs.params.stage) : [];
  const collapsed = (key: string) => canMove && kind.collapsedStages.includes(key) && !expanded.includes(key);
  const reads = (key: string) => columns.some((spec) => spec.key === key && spec.count > 0 && !collapsed(key));
  const { dragging, startDrag, endDrag, moveCard, focusId, onHandedOver, countsMoved } = useBoardMoves<PipelineRow, string>({
    move,
    frameKey: book.loadedKey,
    fresh,
    reads,
    onMove,
    onMoveSettled,
  });
  const toggleCollapsed = useCallback(
    (key: string) => setExpanded((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])),
    [],
  );

  if (!data && error) {
    return (
      <Card pad="none">
        <UiErrorState message={error} onRetry={book.retry} />
      </Card>
    );
  }
  if (!data) return <BoardSkeleton isSm={isSm} narrow={narrow} />;
  if (data.count === 0) {
    return (
      <Card pad="none">
        <EmptyBookState
          filtered={filtered}
          noun={kind.noun}
          title={`No ${kind.noun.many} yet`}
          detail={`Add ${withArticle(kind.noun.one)} to start your pipeline.`}
          onClearFilters={onClearFilters}
          onAdd={() => onAdd()}
        />
      </Card>
    );
  }

  const shown = columns.map((spec) => (countsMoved ? withPipelineMove(spec, move) : spec));
  // A saved move settles only once the frame reloads: while that reload
  // fails, moving stays off, and the alert and each control say why.
  const paused = error !== null && move !== null;

  const renderColumn = (index: number, panelRef?: (element: HTMLElement | null) => void) => {
    const spec = columns[index];
    const isCollapsed = collapsed(spec.key);
    return (
      <PipelineColumn
        key={spec.key}
        kind={kind}
        spec={shown[index]}
        collapsed={isCollapsed}
        query={pipelineApiQuery(inputs.params, 'board', { group_value: spec.key, limit: String(PIPELINE_SECTION_SIZE) })}
        enabled={spec.count > 0 && !isCollapsed}
        version={inputs.version + (inputs.columnBumps[spec.key] ?? 0)}
        currency={currency}
        isSm={isSm}
        narrow={narrow}
        canMove={canMove}
        saving={saving}
        pausedNote={paused ? PAUSED : null}
        move={move}
        filtered={filtered}
        focusId={focusId}
        dragging={dragging}
        onOpen={onOpen}
        onMove={moveCard}
        onDragStart={startDrag}
        onDragEnd={endDrag}
        onHandedOver={onHandedOver}
        onRowsLoaded={onRowsLoaded}
        onAdd={canMove ? onAdd : undefined}
        onToggleCollapsed={canMove && spec.collapsible ? () => toggleCollapsed(spec.key) : undefined}
        panelRef={panelRef}
      />
    );
  };

  return (
    <BoardLayout
      isSm={isSm}
      busy={book.loading}
      error={error}
      paused={paused}
      onRetry={book.retry}
      tabs={shown.map((spec) => ({ key: spec.key, label: spec.label, count: spec.count }))}
      renderColumn={renderColumn}
    />
  );
}

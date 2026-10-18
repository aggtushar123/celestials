import { useRef, useState, type ReactNode } from 'react';
import { EyeOff, Plus } from 'lucide-react';
import { EntityAvatar } from '../shared/EntityAvatar';
import { formatMoney, companyLabel } from '../../features/customers/formatters';
import { PRIORITY_COLORS, pipelineOrgLabel } from './kanbanConfig';
import type { PipelineCardEntity } from './kanbanConfig';
import type { CurrencyCode } from '../../features/auth/authSlice';

// Generic Kanban rendering for a stage-column board — built for the
// standalone Opportunity/Risk board and the embedded Pipelines tab
// (both since retired or rebuilt: the Pipelines portfolio now reads its
// own PipelineColumn on the shared StageColumn instead — see
// pages/pipelines/List.tsx and Board.tsx), now used only by the
// Organization/Account Details page's own Deals & risks tab
// (DealsTab.tsx) — same "one shared component, not page-local copies"
// reasoning as ContactsTab. `renderCard` is the only entity-specific
// part; column layout, drag-and-drop, and the "N in this column" count
// are otherwise fully generic. Stage columns/colors/labels for the
// pipeline case live in ./kanbanConfig instead of here — a file
// exporting a component can only export components (react-refresh/
// only-export-components), not also that plain data.

// Plain function passed as KanbanBoard's own renderCard prop (called
// directly as renderCard(entity), not rendered as JSX) — can't call
// useOrgCurrency() itself, so currency comes in as an explicit param,
// threaded by each page's own renderCard={(entity) => PipelineCardContent(entity, currency)} closure.
export function PipelineCardContent(entity: PipelineCardEntity, currency: CurrencyCode) {
  return (
    <>
      <h4 className="text-[12.5px] font-bold text-ink leading-snug mb-2.5">
        {entity.title}
        {entity.department && (
          <span className="ml-1.5 px-1.5 py-px rounded-full bg-subtle border border-line text-[10px] font-bold text-ink-muted align-middle" title="Department">
            {entity.department_display}
          </span>
        )}
      </h4>
      <div className="text-[12px] font-bold text-accent mb-3">MRR: {formatMoney(entity.mrr, currency)}</div>
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <EntityAvatar name={companyLabel(entity.companies)} className="w-5 h-5 rounded-full text-[9px]" />
          <span className="text-[11.5px] text-ink-muted font-semibold truncate max-w-[120px]">{pipelineOrgLabel(entity)}</span>
        </div>
        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold capitalize shrink-0 ${PRIORITY_COLORS[entity.priority]}`}>
          {entity.priority}
        </span>
      </div>
    </>
  );
}

function KanbanCard<T extends { id: number }>({
  entity,
  renderCard,
  onDragStart,
  onClick,
}: {
  entity: T;
  renderCard: (entity: T) => ReactNode;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, entity.id)}
      onClick={onClick}
      className="bg-surface border border-line/80 rounded-lg p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-accent/40 transition-all duration-200 cursor-grab active:cursor-grabbing active:opacity-60 active:scale-[0.98] select-none"
    >
      {renderCard(entity)}
    </div>
  );
}

function KanbanColumn<S extends string, T extends { id: number }>({
  stage,
  title,
  disableAdd,
  collapsed,
  onToggleCollapsed,
  entities,
  renderCard,
  onDragStart,
  onDragOver,
  onDrop,
  onCardClick,
  onAddClick,
  isDragOver,
}: {
  stage: S;
  title: string;
  /** This one column's own "+" is hidden even though the board's
   * `onAddClick` is set — e.g. the Organizations board's own Churn
   * column, which nothing can be directly added into (see Board.tsx's
   * own docstring). */
  disableAdd?: boolean;
  /** A collapsible column shows only its title, its count and "Show …"
   *  until opened; it stays a drop target. */
  collapsed: boolean;
  /** Set on a collapsible column: its Show / Hide. */
  onToggleCollapsed?: () => void;
  entities: T[];
  renderCard: (entity: T) => ReactNode;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragOver: (e: React.DragEvent, stage: S) => void;
  onDrop: (e: React.DragEvent, stage: S) => void;
  onCardClick: (entity: T) => void;
  /** Omitted entirely (rather than a no-op) hides every column's own
   * "+" — an add-per-stage action doesn't make sense for every board. */
  onAddClick?: (stage: S) => void;
  isDragOver: boolean;
}) {
  return (
    <div
      className={`flex flex-col w-[220px] shrink-0 rounded-xl transition-colors duration-150 ${isDragOver ? 'bg-accent-dim/60' : 'bg-subtle/60'}`}
      onDragOver={e => { e.preventDefault(); onDragOver(e, stage); }}
      onDrop={e => onDrop(e, stage)}
    >
      <div className="px-3 pt-3 pb-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-bold text-ink-muted tracking-tight">{title}</span>
          <span className="text-[11px] text-ink-faint font-bold">({entities.length})</span>
        </div>
        {onToggleCollapsed && !collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={`Hide ${title}`}
            className="ml-auto mr-1 inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-ink-faint hover:bg-subtle hover:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        {onAddClick && !disableAdd && (
          <button
            onClick={() => onAddClick(stage)}
            className="p-0.5 text-ink-faint hover:text-ink-muted transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2.5px]" />
          </button>
        )}
      </div>

      {isDragOver && (
        <div className="mx-2 mb-2 h-1 bg-accent rounded-full opacity-60 transition-all" />
      )}

      {collapsed ? (
        <div className="px-2 pb-3">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-dashed border-line px-3 text-[13px] font-semibold text-ink-muted hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {`Show ${title}`}
          </button>
        </div>
      ) : (
      <div className="flex flex-col gap-2.5 px-2 pb-3 flex-1 min-h-[60px]">
        {entities.map(e => (
          <KanbanCard key={e.id} entity={e} renderCard={renderCard} onDragStart={onDragStart} onClick={() => onCardClick(e)} />
        ))}
        {entities.length === 0 && (
          <div className="flex-1 border-2 border-dashed border-line rounded-lg flex items-center justify-center min-h-[80px] text-[12px] text-ink-faint font-semibold">
            Drop here
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export interface KanbanBoardProps<S extends string, T extends { id: number; stage: S }> {
  /** `disableAdd` hides that one column's own "+" even when `onAddClick`
   * is set (see KanbanColumn's own docstring) — e.g. a stage nothing
   * can be directly created into. `collapsible` starts that column
   * collapsed ("Show Closed Lost"); it opens and closes for as long as the
   * board is mounted. */
  columns: { stage: S; title: string; disableAdd?: boolean; collapsible?: boolean }[];
  entities: T[];
  /** The card's own inner content — everything inside KanbanBoard's
   * shared draggable/clickable card chrome (border, hover, shadow,
   * cursor-grab). Use PipelineCardContent (above) for an Opportunity/
   * Risk board, or a page-specific one for anything else. */
  renderCard: (entity: T) => ReactNode;
  onCardClick: (entity: T) => void;
  /** Omit to hide every column's own "+" (an add-per-stage action
   * doesn't make sense for every board — see KanbanColumn's own
   * docstring). */
  onAddClick?: (stage: S) => void;
  /** Drag a card to another column — move the dragged entity's own
   * `stage`. Caller's own responsibility (dispatches updateOpportunity/
   * updateRisk/updateCustomer, or opens a dedicated modal first, as
   * the Organizations board's own Churn column does) since KanbanBoard
   * doesn't know which thunk (or extra confirmation) applies. */
  onMove: (id: number, stage: S) => void;
  /** Caps each column's own scroll area instead of the whole page's —
   * matches the standalone board's own `calc(100vh - 260px)`; an
   * embedded tab (less vertical chrome above it) passes a shorter one. */
  minHeight?: string;
}

export function KanbanBoard<S extends string, T extends { id: number; stage: S }>({
  columns,
  entities,
  renderCard,
  onCardClick,
  onAddClick,
  onMove,
  minHeight = 'calc(100vh - 260px)',
}: KanbanBoardProps<S, T>) {
  const [dragOverStage, setDragOverStage] = useState<S | null>(null);
  const [opened, setOpened] = useState<S[]>([]);
  const toggle = (stage: S) => setOpened((open) => (open.includes(stage) ? open.filter((s) => s !== stage) : [...open, stage]));
  const draggingId = useRef<number | null>(null);

  const handleDragStart = (_e: React.DragEvent, id: number) => {
    draggingId.current = id;
  };

  const handleDragOver = (_e: React.DragEvent, stage: S) => {
    setDragOverStage(stage);
  };

  const handleDrop = (_e: React.DragEvent, targetStage: S) => {
    const id = draggingId.current;
    draggingId.current = null;
    setDragOverStage(null);
    if (id === null) return;
    const current = entities.find(e => e.id === id);
    if (!current || current.stage === targetStage) return;
    onMove(id, targetStage);
  };

  const handleDragEnd = () => {
    draggingId.current = null;
    setDragOverStage(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight }} onDragEnd={handleDragEnd}>
      {columns.map(col => (
        <KanbanColumn
          key={col.stage}
          stage={col.stage}
          title={col.title}
          disableAdd={col.disableAdd}
          collapsed={!!col.collapsible && !opened.includes(col.stage)}
          onToggleCollapsed={col.collapsible ? () => toggle(col.stage) : undefined}
          entities={entities.filter(e => e.stage === col.stage)}
          renderCard={renderCard}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={onCardClick}
          onAddClick={onAddClick}
          isDragOver={dragOverStage === col.stage}
        />
      ))}
    </div>
  );
}

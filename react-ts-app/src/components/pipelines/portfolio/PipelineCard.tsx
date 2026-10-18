import { memo, type DragEvent } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { pipelineAskQuestion, pipelineFocusOf } from '../../../features/pipelines/askContext';
import { dateText, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { AskAboutButton } from '../../copilot/AskAboutButton';
import { BOARD_CARD_ACTIONS } from '../../organizations/portfolio/BoardCard';
import { MoveToMenu } from '../../organizations/portfolio/MoveToMenu';
import { Card, FOCUS, NUM, TYPE } from '../../ui';
import { DateLine, PartOf, PriorityTag } from './itemParts';

export interface PipelineCardProps {
  row: PipelineRow;
  kind: PipelineKind;
  currency: CurrencyCode;
  /** From `sm`. HTML5 drag has no touch support, so phones move with the menu only. */
  isSm: boolean;
  /** Grouped by stage: the card drags and has a Move to… menu. */
  canMove: boolean;
  /** A move is saving or settling (one at a time). */
  moveDisabled: boolean;
  /** Why moving is off, shown on the Move to… button when it is stuck. */
  moveNote?: string | null;
  onOpen: (row: PipelineRow) => void;
  /** `fromMenu`: a Move to… choice, whose card keeps focus in its new column. */
  onMove: (row: PipelineRow, to: string, fromMenu?: boolean) => void;
  onDragStart: (row: PipelineRow) => void;
  onDragEnd: () => void;
}

/** One item on the Board (spec §1): the title and Part of (with the
 *  department), then MRR, priority and the date on one line, the same on
 *  every card. The title opens the form (`data-part="open"`, where focus
 *  returns after a Move to…). Move to… and Ask about this float over the
 *  card's corner on hover from sm (UI foundations spec §7), in the row on
 *  touch. Memoised: dragging re-renders the board. */
function PipelineCardView({
  row,
  kind,
  currency,
  isSm,
  canMove,
  moveDisabled,
  moveNote = null,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: PipelineCardProps) {
  const draggable = isSm && canMove && !moveDisabled;
  const targets = kind.stages.filter((stage) => stage.value !== row.stage.value);
  const focus = pipelineFocusOf(row);
  const date = dateText(kind, row.date, row.open);

  const startDrag = (event: DragEvent<HTMLElement>) => {
    // jsdom has no DataTransfer. Browsers get the id so Firefox starts the drag.
    event.dataTransfer?.setData('text/plain', String(row.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    onDragStart(row);
  };

  return (
    <Card
      as="li"
      pad="sm"
      data-card-id={row.id}
      draggable={draggable}
      onDragStart={draggable ? startDrag : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={() => onOpen(row)}
      className={`group relative cursor-pointer ${draggable ? 'active:cursor-grabbing' : ''}`}
    >
      <div data-part="card-header" className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            data-part="open"
            aria-haspopup="dialog"
            draggable={false}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(row);
            }}
            className={`block max-w-full truncate rounded-sm text-left ${TYPE.body} font-semibold hover:underline ${FOCUS}`}
          >
            {row.title}
          </button>
          <p className={`truncate ${TYPE.meta}`}>
            <PartOf row={row} />
            {` · ${row.department.label || 'Whole company'}`}
          </p>
        </div>
        <div className={BOARD_CARD_ACTIONS}>
          {canMove ? (
            <MoveToMenu name={row.title} disabled={moveDisabled} note={moveNote} targets={targets} onChoose={(to) => onMove(row, to, true)} />
          ) : null}
          <AskAboutButton name={row.title} question={pipelineAskQuestion(focus)} focus={focus} />
        </div>
      </div>
      <div data-part="facts" className="mt-2 flex min-w-0 items-center gap-2">
        <span data-field="mrr" className={`shrink-0 ${TYPE.body} ${NUM}`}>
          {formatCompactMoney(row.mrr, currency)}
        </span>
        <PriorityTag priority={row.priority} long={row.priority.value === 'high'} />
        <span className="ml-auto shrink-0 whitespace-nowrap">
          <DateLine text={date} overdue={row.overdue} />
        </span>
      </div>
    </Card>
  );
}

export const PipelineCard = memo(PipelineCardView);

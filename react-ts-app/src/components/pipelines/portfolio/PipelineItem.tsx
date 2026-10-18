import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { pipelineAskQuestion, pipelineFocusOf } from '../../../features/pipelines/askContext';
import { dateText, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { AskAboutButton } from '../../copilot/AskAboutButton';
import { FOCUS, ListRow, NUM, TYPE } from '../../ui';
import { DateLine, PartOf, PriorityTag, StageTag } from './itemParts';
import { PIPELINE_COLUMNS, PIPELINE_GRID_AT, PIPELINE_NARROW_ONLY } from './pipelineColumns';

export interface PipelineItemProps {
  row: PipelineRow;
  kind: PipelineKind;
  currency: CurrencyCode;
  /** Any item is selected (or the Select mode is on): taps select and the
   *  checkbox shows. */
  selecting: boolean;
  selected: boolean;
  /** Its list is loading or a bulk action is running: no checkbox. */
  selectDisabled?: boolean;
  /** The selection is at its 500-id cap. */
  atLimit?: boolean;
  onToggleSelect: (id: number) => void;
  /** Opens the item's form. */
  onOpen: (row: PipelineRow) => void;
}

/** One opportunity or risk as a row of the one list card (UI foundations
 *  spec §4.2). From a 60rem column it is a grid line on PIPELINE_COLUMNS:
 *  title and Part of, MRR, stage, priority, department, date; below, one
 *  flex line whose meta says the facts. The title, the item's body and a tap
 *  all open its form; while selecting they select instead. The signal pill
 *  is not drawn: High priority shows in its column and Overdue in the date.
 *  Under Ask Revenact its line ends with "Ask about this", which narrows one
 *  question to the item; opening the item narrows nothing (Decision 8). */
export function PipelineItem({ row, kind, currency, selecting, selected, selectDisabled = false, atLimit = false, onToggleSelect, onOpen }: PipelineItemProps) {
  const checkboxDisabled = selectDisabled || (atLimit && !selected);
  const focus = pipelineFocusOf(row);
  const mrr = formatCompactMoney(row.mrr, currency);
  const date = dateText(kind, row.date, row.open);
  const department = row.department.label || 'Whole company';
  return (
    <ListRow
      dataAttrs={{ 'data-item-id': row.id }}
      title={row.title}
      onSelect={() => (selecting ? onToggleSelect(row.id) : onOpen(row))}
      selected={selected}
      columns={PIPELINE_COLUMNS}
      gridAt={PIPELINE_GRID_AT}
      // The checkbox only while selecting: no reserved indent, so the
      // title lines up with its column label.
      leading={
        selecting ? (
          <label className="relative z-10 -my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center sm:m-0 sm:h-6 sm:w-6">
            <input
              type="checkbox"
              checked={selected}
              disabled={checkboxDisabled}
              onChange={() => onToggleSelect(row.id)}
              aria-label={`Select ${row.title}`}
              title={atLimit && !selected ? '500 is the most you can select at once' : undefined}
              className={`h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed ${FOCUS}`}
            />
          </label>
        ) : undefined
      }
      meta={
        <>
          <span className={PIPELINE_NARROW_ONLY}>
            <span className={NUM}>{mrr}</span>
            {` · ${row.stage.label} · ${row.priority.value === 'high' ? 'High priority' : row.priority.label} · `}
            <DateLine text={date} overdue={row.overdue} />
            {' · '}
          </span>
          <PartOf row={row} />
        </>
      }
      cells={[
        <span key="mrr" data-field="mrr" className={`block text-right ${TYPE.body} ${NUM}`}>
          {mrr}
        </span>,
        <StageTag key="stage" label={row.stage.label} />,
        <PriorityTag key="priority" priority={row.priority} />,
        <span key="department" data-field="department" title={department} className={`block truncate ${TYPE.meta}`}>
          {department}
        </span>,
        <DateLine key="date" text={date} overdue={row.overdue} />,
      ]}
      // Ask about this (spec §3): an icon below sm, on hover from sm, always
      // on touch; while selecting a tap selects, so it steps aside.
      actions={selecting ? undefined : <AskAboutButton name={row.title} question={pipelineAskQuestion(focus)} focus={focus} />}
    />
  );
}

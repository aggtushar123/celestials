import { Link } from 'react-router-dom';
import { parentHref } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { Figured } from '../../brain/Figured';
import { Badge, FOCUS, INLINE_TARGET } from '../../ui';

// The pieces of a Pipelines item and card (spec 2026-09-30 §1 "List items").

/** "Closes in 12d", "Overdue 5d", "No date" (dateText): the figure in
 *  tabular figures, the danger ink when overdue. */
export function DateLine({ text, overdue }: { text: string; overdue: boolean }) {
  return (
    <span data-field="date" className={`text-[11px] leading-4 ${overdue ? 'font-semibold text-danger-ink' : 'text-ink-muted'}`}>
      <Figured text={text} />
    </span>
  );
}

/** The stage, a neutral tag (UI foundations spec §7: categories are neutral). */
export function StageTag({ label }: { label: string }) {
  return (
    <span data-field="stage">
      <Badge truncate>{label}</Badge>
    </span>
  );
}

/** Priority: High is the item's one warning; Medium and Low are neutral
 *  (spec §7: more than a third of the rows amber means the threshold is
 *  wrong). `long` says "High priority" where no column heading says it. */
export function PriorityTag({ priority, long = false }: { priority: PipelineRow['priority']; long?: boolean }) {
  return (
    <span data-field="priority" className="shrink-0">
      <Badge tone={priority.value === 'high' ? 'warning' : 'neutral'}>{long ? `${priority.label} priority` : priority.label}</Badge>
    </span>
  );
}

/** "Part of Pizza Hut EMEA · Pizza Hut", inline in a meta line: the item's
 *  organisation or account as a link (the server sends a row only when the
 *  viewer may open it), and for an account-level item the first
 *  organisation of that account the viewer may open (plan Decision 12).
 *  The link sits above a row's stretched title (`relative z-10`). */
export function PartOf({ row }: { row: PipelineRow }) {
  const organisation = row.parent.type === 'account' ? row.companies[0]?.name : undefined;
  return (
    <>
      Part of{' '}
      <Link
        to={parentHref(row.parent)}
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        data-field="parent"
        // INLINE_TARGET's 44px area is clipped by the row's truncated meta line on phones: accepted (WCAG 2.5.8 inline exception; the row is the main target).
        className={`z-10 inline-flex items-center rounded-sm text-ink underline-offset-2 hover:underline ${INLINE_TARGET} ${FOCUS}`}
      >
        {row.parent.name}
      </Link>
      {organisation ? ` · ${organisation}` : null}
    </>
  );
}

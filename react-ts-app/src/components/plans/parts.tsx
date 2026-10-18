import { Link } from 'react-router-dom';
import { AlertTriangle, Layers, Network } from 'lucide-react';
import { KIND_LABEL, STATUS_LABEL } from '../../features/plans/planOptions';
import { pendingText, progress, recordHref, shortDay } from '../../features/plans/planText';
import type { PersonRef, PlanKind, PlanStatus, RecordKind, RecordRef } from '../../features/plans/planTypes';
import { Badge, FOCUS, INLINE_TARGET, NUM, TYPE, type BadgeTone } from '../ui';

/** Status tones (UI foundations spec section 7): on track and at risk are
 *  status; Draft, Not started, Done and Cancelled are neutral. */
const STATUS_TONE: Record<PlanStatus, BadgeTone> = {
  draft: 'neutral',
  not_started: 'neutral',
  on_track: 'success',
  at_risk: 'warning',
  done: 'neutral',
  cancelled: 'neutral',
};

/** The status as a word in a badge; never colour alone. */
export function StatusPill({ status }: { status: PlanStatus }) {
  return (
    <span data-status={status} className="inline-flex shrink-0">
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
    </span>
  );
}

export function KindChip({ kind }: { kind: PlanKind }) {
  return <Badge>{KIND_LABEL[kind]}</Badge>;
}

/** A bar for the eye and "3/5"; the bar is hidden from screen readers,
 *  which read "3/5 milestones done". */
export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </span>
      <span className={TYPE.meta}>
        <span className={NUM}>{progress(done, total)}</span>
        <span className="sr-only"> {label} done</span>
      </span>
    </span>
  );
}

export function RecordIcon({ kind }: { kind: RecordKind }) {
  const Icon = kind === 'organization' ? Network : Layers;
  return <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />;
}

/** The record, with its kind's icon, as a link to its page. It takes its
 *  size and colour from the line it sits in; below sm a 44px hit area that
 *  takes no room (INLINE_TARGET), above a row's stretched title (z-10). */
export function RecordLink({ record }: { record: RecordRef }) {
  return (
    <Link to={recordHref(record)} className={`${INLINE_TARGET} z-10 inline-flex min-w-0 items-center gap-1 align-middle text-ink hover:underline ${FOCUS}`}>
      <RecordIcon kind={record.kind} />
      <span className="truncate">{record.name}</span>
    </Link>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

/** The owner's initials in a circle, then their name. */
export function OwnerName({ person }: { person: PersonRef }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${TYPE.bodyMuted}`}>
      <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] font-semibold text-ink-muted">
        {initials(person.name)}
      </span>
      <span className="truncate">{person.name}</span>
    </span>
  );
}

/** The next due date; past, it reads "Overdue" with an icon in the danger
 *  colour (spec section 2.1). */
export function NextDue({ date, overdue }: { date: string | null; overdue: boolean }) {
  if (!date) return <span className={`shrink-0 ${TYPE.meta}`}>Nothing left to do</span>;
  if (overdue) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] leading-4 font-semibold text-danger-ink">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Overdue · <span className={NUM}>{shortDay(date)}</span>
      </span>
    );
  }
  return (
    <span className={`shrink-0 ${TYPE.meta}`}>
      Next <span className={NUM}>{shortDay(date)}</span>
    </span>
  );
}

/** A Draft's figure in place of the next due date (Agents delivery 2). */
export function PendingTasks({ n }: { n: number }) {
  const { text } = pendingText(n);
  return (
    <span className={`shrink-0 ${TYPE.meta}`}>
      <span className={NUM}>{n}</span> {text}
    </span>
  );
}

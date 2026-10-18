import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CalendarDays, CircleCheck, MailCheck, Hash, Layers, Lightbulb, ListChecks, Lock, Mail, MessageCircleQuestion, SquareKanban, Ticket, type LucideIcon, MessageSquare } from 'lucide-react';
import type { SignalSource } from '../../features/agents/agentTypes';
import { recordPath } from '../../features/brain/deskText';
import { formatDate } from '../../features/customers/formatters';
import { FEED, dayText, forText } from '../../features/work/feed';
import { PRIORITY_LABEL, sourceText } from '../../features/work/workText';
import type { FeedGroupKey, FeedItem, FeedKind } from '../../features/work/workTypes';
import { FOCUS, INLINE_TARGET, NUM, TYPE } from '../ui';

/** One icon per kind (spec §5: "an icon by kind"). */
export const KIND_ICON: Record<FeedKind, LucideIcon> = {
  bundle: Layers,
  rule_review: ListChecks,
  question: MessageCircleQuestion,
  draft: Mail,
  task: CircleCheck,
  todo: CircleCheck,
  suggestion: Lightbulb,
  slack_message: MessageSquare,
  meeting_proposal: CalendarClock,
  email_suggestion: MailCheck,
};

/** A meeting's bundle (sales review report, 2026-10-18). */
export const MEETING_ICON: LucideIcon = CalendarDays;

/** A message bundle's icon by channel (Decision 4); the nightly review keeps the bundle icon. */
export const CHANNEL_ICON: Record<SignalSource, LucideIcon> = {
  mail: Mail,
  slack: Hash,
  zendesk: Ticket,
  freshdesk: Ticket,
  jira: SquareKanban,
  webhook: Ticket,
};

/** A feed row's focus ring, for when focus is moved to the row itself
 *  (Show more's first new row), drawn inside the list card. */
export const ROW_FOCUS = `${FOCUS} focus-visible:-outline-offset-2`;

export const META_LINK = `inline-flex items-center font-semibold text-ink-muted hover:text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`;

/** "Only you": a row or source only its person ever sees. */
export function OnlyYou() {
  return (
    <span data-part="private" className="inline-flex items-center gap-1">
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      {FEED.ONLY_YOU}
    </span>
  );
}

/** The row's one meta line: the record, then the due line for a task (Due,
 *  Overdue, priority, in progress, where it came from) or who and when for
 *  everything else, then "Only you" on a to-do. */
export function FeedRowMeta({ item, group, extra }: { item: FeedItem; group: FeedGroupKey; extra?: ReactNode }) {
  const parts: ReactNode[] = [];
  const owner = forText(item.for);
  if (owner) parts.push(<span key="for" data-part="for">{owner}</span>);
  if (item.record) {
    parts.push(
      // SE4-26: a participant who can't open the record reads its name only
      item.record.can_open === false ? (
        <span key="record">{item.record.name}</span>
      ) : (
        <Link key="record" to={recordPath(item.record)} className={META_LINK}>
          {item.record.name}
        </Link>
      ),
    );
  }
  if (item.kind === 'task' || item.kind === 'todo') {
    parts.push(
      item.due_date ? (
        <span key="due">
          Due <span className={NUM}>{formatDate(item.due_date)}</span>
        </span>
      ) : (
        <span key="due">{FEED.NO_DATE}</span>
      ),
    );
    if (group === 'overdue') parts.push(<span key="late" className="font-semibold text-danger-ink">{FEED.OVERDUE}</span>);
    parts.push(<span key="priority">{PRIORITY_LABEL[item.detail.priority]} priority</span>);
    if (item.detail.status === 'in-progress') parts.push(<span key="progress">In progress</span>);
    const slack = item.detail.from_slack;
    const source = item.detail.from_email ? `From an email by ${item.detail.from_email.by}` : slack ? `From Slack by ${slack.by}` : sourceText(item.detail);
    if (source) parts.push(<span key="source">{source}</span>);
    if (slack?.permalink?.startsWith('https://'))
      parts.push(
        <a key="slack" href={slack.permalink} target="_blank" rel="noopener noreferrer" className={META_LINK}>
          {FEED.OPEN_IN_SLACK}
        </a>,
      );
  } else {
    parts.push(<span key="from">{item.from.label}</span>);
    if (extra) parts.push(<span key="extra">{extra}</span>);
    parts.push(
      <span key="at" className={NUM}>
        {dayText(item.at)}
      </span>,
    );
  }
  if (item.private) parts.push(<OnlyYou key="private" />);
  return (
    <p data-part="meta" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
      {parts.flatMap((part, index) => (index === 0 ? [part] : [<span key={`dot-${index}`} aria-hidden="true"> · </span>, part]))}
    </p>
  );
}

import { useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  HeartPulse,
  LifeBuoy,
  Mail,
  MessagesSquare,
  Phone,
  SquareCheck,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AskAboutButton } from '../../copilot/AskAboutButton';
import { askAboutQuestion } from '../../../features/organizations/detailAskContext';
import { KIND_NAME, sourceName } from '../../../features/organizations/storyKinds';
import { timeLabel } from '../../../features/organizations/storyDays';
import type { StoryItem, StoryKind } from '../../../features/organizations/storyTypes';
import { useTaskLink } from '../../work/useTaskLink';
import { FOCUS, Badge, IconChip, NUM, ROW_ACTIONS, TYPE } from '../../ui';
import { TITLE_CONTROL } from './rowTitle';
import { ShowAccountTags } from './accountNames';
import { FromSlackLine, TicketLines } from './LinkLines';
import { LINKS } from '../../../features/organizations/linkText';

const ICON: Record<StoryKind, LucideIcon> = {
  activity: Activity,
  call: Phone,
  email: Mail,
  slack: MessagesSquare,
  calendar_event: CalendarDays,
  ticket: LifeBuoy,
  task: SquareCheck,
  note: StickyNote,
  survey: ClipboardList,
  health: HeartPulse,
};

export const LINK = `mt-1 inline-flex min-h-11 items-center gap-1 rounded-sm text-[13px] font-semibold text-ink underline sm:min-h-9 ${FOCUS}`;
const PLAN_LINK = `inline-flex min-h-11 max-w-full items-center gap-1 rounded-sm text-[11px] font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 ${FOCUS}`;

/** `link.url`: a ticket in its source system or a call's recording, in a new
 *  tab. The backend sends only http(s) URLs; the check stays because the
 *  value lands in an href. The backend sends no in-app paths. */
function ItemLink({ item }: { item: StoryItem }) {
  const url = item.link.url ?? '';
  if (!/^https?:\/\//i.test(url)) return null;
  const name = sourceName(item.source);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={LINK}>
      {item.kind === 'call' && !name ? 'Open the recording' : `Open in ${name || 'its source'}`}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

/** A task's title opens the task panel over this page (Work spec §1.5).
 *  Its own component, so rows of other kinds need no router. */
function TaskTitle({ id, title, className }: { id: number; title: string; className: string }) {
  const taskLink = useTaskLink();
  return (
    <Link {...taskLink(id)} className={className}>
      {title}
    </Link>
  );
}

/** One story item (spec §1.6): icon, title, time, a one-line summary, then
 *  the account tag, kind · who · source, and "Ask about this". An email with
 *  a thread opens it; any other item with more to show opens in place. */
export function StoryItemRow({
  item,
  onOpenEmail,
  onOpenSlack,
}: {
  item: StoryItem;
  onOpenEmail: (item: StoryItem) => void;
  onOpenSlack: (item: StoryItem) => void;
}) {
  const showTag = useContext(ShowAccountTags);
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const Icon = ICON[item.kind] ?? Activity;
  const time = timeLabel(item);
  const threaded = (item.kind === 'email' && Boolean(item.link.thread_id)) || item.kind === 'slack';
  // Opening in place shows the whole summary and the link, so it is offered
  // only when there is more than the row already shows: a link, a summary of
  // several lines, or one cut off at the row's width (measured, and again
  // when the row resizes).
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const line = summaryRef.current;
    if (!line) return;
    const measure = () => setClipped(line.scrollWidth > line.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(line);
    return () => observer.disconnect();
  }, [item.summary, expanded]);
  const linked = /^https?:\/\//i.test(item.link.url ?? '');
  const expandable = !threaded && (linked || item.summary.includes('\n') || clipped);
  const source = sourceName(item.source);
  const meta = [KIND_NAME[item.kind] ?? 'Record', item.actor?.name, source ? `via ${source}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <li data-story-item={`${item.kind}:${item.id}`} className="group relative flex gap-3 px-4 py-3">
      <IconChip icon={Icon} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2 max-sm:min-h-11 max-sm:items-center">
          <h3 className={`min-w-0 flex-1 truncate ${TYPE.body} font-semibold`}>
            {item.kind === 'task' ? (
              <TaskTitle id={item.id} title={item.title} className={TITLE_CONTROL} />
            ) : threaded ? (
              <button type="button" aria-haspopup="dialog" onClick={() => (item.kind === 'slack' ? onOpenSlack(item) : onOpenEmail(item))} className={TITLE_CONTROL}>
                {item.title}
              </button>
            ) : expandable ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                onClick={() => setExpanded((value) => !value)}
                className={TITLE_CONTROL}
              >
                {item.title}
              </button>
            ) : (
              item.title
            )}
          </h3>
          {time ? (
            <time dateTime={item.occurred_at} className={`shrink-0 ${TYPE.meta} ${NUM}`}>
              {time}
            </time>
          ) : null}
        </div>
        {item.kind === 'task' && item.plan ? (
          <Link data-part="plan" to={`/projects/${item.plan.id}`} className={PLAN_LINK}>
            <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.milestone ? `${item.plan.name} · ${item.milestone.name}` : item.plan.name}</span>
          </Link>
        ) : null}
        {expanded ? (
          <div id={detailId}>
            {item.summary ? <p className={`whitespace-pre-line break-words ${TYPE.bodyMuted}`}>{item.summary}</p> : null}
            <ItemLink item={item} />
          </div>
        ) : item.summary ? (
          <p ref={summaryRef} className={`truncate ${TYPE.bodyMuted}`}>
            {item.summary}
          </p>
        ) : null}
        <p className={`mt-0.5 flex min-w-0 items-center gap-2 ${TYPE.meta}`}>
          {showTag && item.account ? <Badge truncate>{item.account.name}</Badge> : null}
          <span className="min-w-0 truncate">{meta}</span>
        </p>
        {item.kind === 'slack' ? <TicketLines tickets={item.tickets ?? []} hidden={item.hidden_links ?? 0} /> : null}
        {item.kind === 'ticket' ? (
          <FromSlackLine
            from={item.from_slack ?? null}
            hidden={item.hidden_links ?? 0}
            onOpen={(from) => onOpenSlack({ ...item, kind: 'slack', id: from.id, title: LINKS.THREAD })}
          />
        ) : null}
      </div>
      {/* From sm it floats over the row's top-right corner (as on a Board
          card), so the time sits flush right; in the row on touch screens. */}
      <div className={`${ROW_ACTIONS} self-start sm:absolute sm:right-3 sm:top-2 sm:rounded-lg sm:bg-surface [@media(hover:none)]:static`}>
        <AskAboutButton name={item.title} question={askAboutQuestion({ kind: item.kind, id: item.id })} focus={{ kind: item.kind, id: item.id }} />
      </div>
    </li>
  );
}

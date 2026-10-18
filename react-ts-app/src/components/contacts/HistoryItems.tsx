import { useId, useState } from 'react';
import { ExternalLink, Mail, Phone, Sparkles, Ticket } from 'lucide-react';
import { durationLabel } from '../../features/calls/callFormat';
import { classificationLabel, dayLabel, placeLabel, readingBadge, safeUrl } from '../../features/contacts/contactsFormat';
import type { Classification, HistoryCall, HistoryEmail, HistoryTicket } from '../../features/contacts/contactsTypes';
import type { CompanyRef } from '../../features/customers/customersSlice';
import { TITLE_CONTROL } from '../organizations/detail/rowTitle';
import { Badge, IconChip, NUM, QUIET, ROW_ACTIONS, TYPE } from '../ui';

// A person's calls, emails and tickets on their profile (spec 2026-09-28
// §3): plain rows like the organisation page's, each with its reading
// (sentiment, "Not enough to analyse", or nothing while it waits), the AI's
// classification and the organisation › account it is on.

function Reading({ record }: { record: { analysis: HistoryCall['analysis']; sentiment: HistoryCall['sentiment'] } }) {
  const reading = readingBadge(record);
  return reading ? <Badge tone={reading.tone}>{reading.label}</Badge> : null;
}

function Place({ organisation, account }: { organisation: CompanyRef | null; account: CompanyRef | null }) {
  const label = placeLabel({ organisation, account });
  return label ? <Badge truncate>{label}</Badge> : null;
}

function Classified({ classification }: { classification: Classification }) {
  const label = classificationLabel(classification);
  if (!label) return null;
  return (
    <span data-ai="" className="inline-flex min-w-0 items-center gap-1">
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">AI classification: </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className={`shrink-0 ${TYPE.meta} ${NUM}`}>
      {dayLabel(iso)}
    </time>
  );
}

/** One call: date, title, reading, the summary its title opens in place,
 *  the classification, host and length, the organisation › account, and
 *  the recording. */
export function HistoryCallItem({ call }: { call: HistoryCall }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const recording = safeUrl(call.link.url);
  const who = [call.host_name, durationLabel(call.duration_minutes) || null].filter(Boolean).join(' · ');
  return (
    <li data-history-call={call.id} className="group relative flex gap-3 py-3">
      <IconChip icon={Phone} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2 max-sm:min-h-11">
          <h4 className={`min-w-0 flex-1 truncate ${TYPE.body} font-semibold`}>
            {call.summary ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                onClick={() => setExpanded((value) => !value)}
                className={TITLE_CONTROL}
              >
                {call.title}
              </button>
            ) : (
              call.title
            )}
          </h4>
          <When iso={call.occurred_at} />
        </div>
        {!call.summary ? (
          <p className={TYPE.bodyMuted}>No summary.</p>
        ) : expanded ? (
          <p id={detailId} className={`whitespace-pre-line break-words ${TYPE.bodyMuted}`}>
            {call.summary}
          </p>
        ) : (
          <p className={`truncate ${TYPE.bodyMuted}`}>{call.summary}</p>
        )}
        <p className={`mt-0.5 flex min-w-0 items-center gap-2 ${TYPE.meta}`}>
          <Reading record={call} />
          <Place organisation={call.organisation} account={call.account} />
          {who ? <span className="min-w-0 truncate">{who}</span> : null}
          <Classified classification={call.classification} />
        </p>
      </div>
      {recording ? (
        <div className={`${ROW_ACTIONS} self-start`}>
          <a href={recording} target="_blank" rel="noopener noreferrer" className={QUIET}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Recording
          </a>
        </div>
      ) : null}
    </li>
  );
}

/** One email from them: subject, date, reading, snippet and where it is
 *  filed. Never a link — the app has no page for a thread outside an
 *  organisation's Story, and the backend can send no thread id at all
 *  (link.thread_id is nullable). */
export function HistoryEmailItem({ email }: { email: HistoryEmail }) {
  return (
    <li data-history-email={email.id} className="group relative flex gap-3 py-3">
      <IconChip icon={Mail} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2 max-sm:min-h-11">
          <h4 className={`min-w-0 flex-1 truncate ${TYPE.body} font-semibold`}>{email.subject || '(no subject)'}</h4>
          <When iso={email.sent_at} />
        </div>
        {email.snippet ? <p className={`truncate ${TYPE.bodyMuted}`}>{email.snippet}</p> : null}
        <p className={`mt-0.5 flex min-w-0 items-center gap-2 ${TYPE.meta}`}>
          <Reading record={email} />
          <Place organisation={email.organisation} account={email.account} />
          {email.sender_name ? <span className="min-w-0 truncate">from {email.sender_name}</span> : null}
          <Classified classification={email.classification} />
        </p>
      </div>
    </li>
  );
}

/** One ticket they raised: number, title, status, reading and the ticket itself. */
export function HistoryTicketItem({ ticket }: { ticket: HistoryTicket }) {
  const url = safeUrl(ticket.link.url);
  return (
    <li data-history-ticket={ticket.id} className="group relative flex gap-3 py-3">
      <IconChip icon={Ticket} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2 max-sm:min-h-11">
          <h4 className={`min-w-0 flex-1 truncate ${TYPE.body} font-semibold`}>
            <span className={`${NUM} text-ink-muted`}>{ticket.ticket_number}</span> {ticket.title}
          </h4>
          <When iso={ticket.opened_at} />
        </div>
        <p className={`mt-0.5 flex min-w-0 items-center gap-2 ${TYPE.meta}`}>
          <span>{ticket.department_display ? `${ticket.department_display} · ${ticket.status_display}` : ticket.status_display}</span>
          <Reading record={ticket} />
          <Place organisation={ticket.organisation} account={ticket.account} />
          <Classified classification={ticket.classification} />
        </p>
      </div>
      {url ? (
        <div className={`${ROW_ACTIONS} self-start`}>
          <a href={url} target="_blank" rel="noopener noreferrer" className={QUIET}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open ticket
          </a>
        </div>
      ) : null}
    </li>
  );
}

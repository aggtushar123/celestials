import { useId, useState } from 'react';
import { ExternalLink, FileText, Phone } from 'lucide-react';
import { durationLabel } from '../../../features/calls/callFormat';
import type { Call } from '../../../features/calls/callsSlice';
import { readingBadge } from '../../../features/contacts/contactsFormat';
import { downloadAttachment } from '../../../features/files/filesSlice';
import { timeLabel } from '../../../features/organizations/storyDays';
import { Badge, IconChip, NUM, QUIET, ROW_ACTIONS, TYPE } from '../../ui';
import { AccountTag } from './ListParts';
import { TITLE_CONTROL } from './rowTitle';

/** "account_management" reads "account management" (Records audit S9). */
const humanise = (value: string) => value.replace(/_/g, ' ');

/** One call as a plain row, like a Story item (spec 2026-09-27 §4), of one
 *  height: title and time, a one-line summary its title opens in place
 *  (with who was on it, and their roles), then the account tag, host,
 *  duration, where it came from (a recorder, or who logged it), the AI's
 *  classification and a sentiment badge or "Not enough to analyse" (nothing
 *  while it waits to be read, spec 2026-09-28 §5). The transcript and
 *  recording wait in the row's actions. */
export function CallItem({ call }: { call: Call }) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const detailId = useId();
  const reading = readingBadge(call);
  // The value lands in an href: only http(s) is linked.
  const recording = /^https?:\/\//i.test(call.recording_url) ? call.recording_url : null;
  const who = [call.host_name, durationLabel(call.duration_minutes) || null].filter(Boolean).join(' · ');
  const source = call.connector_name ? `via ${call.connector_name}` : call.logged_by ? `logged by ${call.logged_by.name}` : null;
  const classification = call.ai_category || call.ai_area;
  const participants = call.participants
    .map((person) => (person.role_display ? `${person.name} · ${person.role_display}` : person.name))
    .join(', ');
  const transcript = call.transcript;

  async function openTranscript() {
    if (!transcript) return;
    setFailed(false);
    try {
      await downloadAttachment(transcript);
    } catch {
      setFailed(true);
    }
  }

  const base = [who, source].filter(Boolean).join(' · ');
  const expandable = Boolean(call.summary || participants);

  return (
    <li data-call={call.id} className="group relative flex gap-3 px-4 py-3">
      <IconChip icon={Phone} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2 max-sm:min-h-11">
          <h4 className={`min-w-0 flex-1 truncate ${TYPE.body} font-semibold`}>
            {expandable ? (
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
          <time dateTime={call.occurred_at} className={`shrink-0 ${TYPE.meta} ${NUM}`}>
            {timeLabel({ occurred_at: call.occurred_at, all_day: false })}
          </time>
        </div>
        {expanded ? (
          <div id={detailId} className="break-words">
            {call.summary ? <p className={`whitespace-pre-line ${TYPE.bodyMuted}`}>{call.summary}</p> : <p className={TYPE.bodyMuted}>No summary yet.</p>}
            {participants ? <p className={`mt-1 ${TYPE.meta}`}>With {participants}</p> : null}
          </div>
        ) : call.summary ? (
          <p className={`truncate ${TYPE.bodyMuted}`}>{call.summary}</p>
        ) : (
          <p className={TYPE.bodyMuted}>No summary yet.</p>
        )}
        <p className={`mt-0.5 flex min-w-0 items-center gap-2 ${TYPE.meta}`}>
          <AccountTag record={call} />
          <span className="min-w-0 truncate">
            {base}
            {classification ? (
              <>
                {base ? ' · ' : null}
                <span data-ai="">
                  <span className="sr-only">AI classification: </span>
                  {humanise(classification)}
                </span>
              </>
            ) : null}
          </span>
          {reading ? <Badge tone={reading.tone}>{reading.label}</Badge> : null}
        </p>
        {failed ? (
          <p role="alert" className="text-[11px] leading-4 text-danger-ink">
            Could not download the transcript.
          </p>
        ) : null}
      </div>
      {transcript || recording ? (
        <div className={`${ROW_ACTIONS} self-start`}>
          {transcript ? (
            <button type="button" onClick={() => void openTranscript()} className={QUIET}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              Transcript
            </button>
          ) : null}
          {recording ? (
            <a href={recording} target="_blank" rel="noopener noreferrer" className={QUIET}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Recording
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

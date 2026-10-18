import { AlertTriangle, MailX } from 'lucide-react';
import { CHECK, SAY } from '../../features/canvas/canvasOptions';
import { contacted, sentimentOf, surveyParts } from '../../features/canvas/canvasText';
// SENTIMENT_DOT/TEXT are keyed by the same three slugs (Contract note 4).
import type { LatestSurvey, PersonFacts } from '../../features/canvas/canvasTypes';
import { SENTIMENT_DOT, SENTIMENT_TEXT } from '../../features/contacts/contactsFormat';
import { NUM } from '../ui';

/** Sentiment as a dot and its word (never colour alone). */
export function SentimentWord({ person }: { person: PersonFacts }) {
  const s = sentimentOf(person);
  return (
    <span data-sentiment={s.reading} className={`inline-flex items-center gap-1 font-semibold ${SENTIMENT_TEXT[s.reading]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SENTIMENT_DOT[s.reading]}`} />
      {s.word}
    </span>
  );
}

/** "Contacted 12 days ago", or the warning with its icon and words. Only
 *  "Not contacted in 60+ days" is overdue (amber and the icon); "Not
 *  contacted yet" stays neutral (spec §7), though both carry data-stale. */
export function ContactedLine({ iso }: { iso: string | null }) {
  const c = contacted(iso);
  const warn = c.stale && c.figure !== null;
  return (
    <span data-stale={c.stale ? '' : undefined} className={`inline-flex items-center gap-1 ${warn ? 'font-semibold text-warning-ink' : ''}`}>
      {warn ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      <span>
        {c.lead}
        {c.figure ? <span className={NUM}>{c.figure}</span> : null}
        {c.tail}
      </span>
    </span>
  );
}

/** "NPS 9 · 3 Oct", the score and day in DM Mono. */
export function SurveyLine({ survey }: { survey: LatestSurvey }) {
  const p = surveyParts(survey);
  return (
    <span>
      {p.label} <span className={NUM}>{p.score}</span> · <span className={NUM}>{p.day}</span>
    </span>
  );
}

export function UnsubscribedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 font-semibold text-ink-muted">
      <MailX className="h-3.5 w-3.5" aria-hidden="true" />
      {SAY.UNSUBSCRIBED}
    </span>
  );
}

/** A person's live facts (spec §2.2), as one short list. */
export function PersonFactsList({ person }: { person: PersonFacts }) {
  if (person.pending) return <p className="text-[11px] text-ink-muted">{CHECK.PENDING}</p>;
  return (
    <ul aria-label="Facts" className="flex flex-col gap-1 text-[11px] text-ink-muted">
      <li>
        <SentimentWord person={person} />
      </li>
      <li>
        <ContactedLine iso={person.last_contacted_at} />
      </li>
      {person.latest_survey ? (
        <li>
          <SurveyLine survey={person.latest_survey} />
        </li>
      ) : null}
      {person.campaigns_unsubscribed ? (
        <li>
          <UnsubscribedChip />
        </li>
      ) : null}
    </ul>
  );
}

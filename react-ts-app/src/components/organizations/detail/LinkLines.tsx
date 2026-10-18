import { ExternalLink } from 'lucide-react';
import { fromSlackText, hiddenText, ticketLineText } from '../../../features/organizations/linkText';
import type { FromSlack, LinkedTicket } from '../../../features/organizations/storyTypes';
import { TYPE } from '../../ui';
import { LINK } from './StoryItemRow';

/** A Slack thread's Jira tickets (Slack escalations D4 frontend Decision 6;
 *  contract §2.3): each opens in Jira; what the reader may not read is a count. */
export function TicketLines({ tickets, hidden }: { tickets: LinkedTicket[]; hidden: number }) {
  if (tickets.length === 0 && hidden === 0) return null;
  return (
    <ul className="flex flex-col">
      {tickets.map((t) => (
        <li key={t.id}>
          {t.url && /^https:\/\//.test(t.url) ? (
            <a href={t.url} target="_blank" rel="noopener noreferrer" className={LINK}>
              {ticketLineText(t)}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span className={TYPE.meta}>{ticketLineText(t)}</span>
          )}
        </li>
      ))}
      {hidden > 0 ? (
        <li>
          <span className={TYPE.meta}>{hiddenText(hidden)}</span>
        </li>
      ) : null}
    </ul>
  );
}

/** A ticket's Slack thread (contract §2.4): it opens the thread sheet. */
export function FromSlackLine({ from, hidden, onOpen }: { from: FromSlack | null; hidden: number; onOpen: (from: FromSlack) => void }) {
  if (from) {
    return (
      <button type="button" aria-haspopup="dialog" onClick={() => onOpen(from)} className={LINK}>
        {fromSlackText(from)}
      </button>
    );
  }
  return hidden > 0 ? <p className={TYPE.meta}>{hiddenText(hidden)}</p> : null;
}

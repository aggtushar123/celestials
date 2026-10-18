import { Link } from 'react-router-dom';
import { dayOf } from '../../features/brain/brainText';
import type { CustomerSentiment } from '../../features/brain/brainTypes';
import { contactPath, CS, negativeText, turnedEmpty, turnedHeading, wasText } from '../../features/brain/customersText';
import { recordPath } from '../../features/brain/deskText';
import { EmptyState, ListCard, TYPE } from '../ui';
import { Figured } from './Figured';
import { LINK } from './styles';

/** Sentiment (spec §2.1, Decision 4): the scope's negative contacts, and who
 *  turned negative in the last 30 days, in words, never by colour alone. */
export function SentimentPanel({ sentiment, today }: { sentiment: CustomerSentiment; today: Date }) {
  return (
    <div className="flex flex-col gap-3">
      <p data-part="negative" className={TYPE.title}>
        <Figured text={negativeText(sentiment.negative)} />
      </p>
      <h3 className={TYPE.label}>{turnedHeading(sentiment.tracking_since, today)}</h3>
      <ListCard label={CS.TURNED_LIST} state={sentiment.turned_negative.length === 0 ? <EmptyState size="inline" title={turnedEmpty(sentiment.tracking_since)} /> : undefined}>
        {sentiment.turned_negative.map((turned) => (
          // Final review #13: `${contact.id}-${changed_at}` so a contact
          // who turned negative twice doesn't collide on contact.id alone.
          <li key={`${turned.contact.id}-${turned.changed_at}`} data-contact={turned.contact.id} className="flex flex-col gap-1 px-4 py-3">
            <p className={`flex flex-wrap items-center gap-x-1 ${TYPE.bodyMuted}`}>
              <Link to={contactPath(turned.contact.id)} className={LINK}>
                {turned.contact.name}
              </Link>
              {turned.record ? (
                <>
                  <span>on</span>
                  <Link to={recordPath(turned.record)} className={LINK}>
                    {turned.record.name}
                  </Link>
                </>
              ) : null}
            </p>
            <p data-part="meta" className={TYPE.bodyMuted}>
              <Figured text={`${wasText(turned.previous)} · ${dayOf(turned.changed_at)}`} />
            </p>
          </li>
        ))}
      </ListCard>
    </div>
  );
}

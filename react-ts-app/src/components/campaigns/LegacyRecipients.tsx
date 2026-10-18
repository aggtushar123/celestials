import { useId } from 'react';
import { Link } from 'react-router-dom';
import { hiddenPeople } from '../../features/campaigns/campaignText';
import type { Campaign } from '../../features/campaigns/campaignTypes';
import { Card, CardBody, CardHeader, FOCUS, NUM, PRIMARY, TYPE } from '../ui';

/** A migrated draft's hand-picked recipients, read-only history (spec §2.3):
 *  the people the reader may open, a count of the rest, and for the owner
 *  "Choose a segment to send". */
export function LegacyRecipients({ campaign }: { campaign: Campaign }) {
  const headingId = useId();
  if (!campaign.needs_segment) return null;
  const hidden = hiddenPeople(campaign.legacy_hidden);
  return (
    <Card pad="none" as="section" aria-labelledby={headingId} data-part="legacy">
      <CardHeader title="Picked by hand before segments" id={headingId} />
      <CardBody>
        <div className="flex flex-col gap-2">
          <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>
            These people were chosen one by one. A campaign now goes to a segment, so this list is kept as history and is never emailed.
          </p>
          {campaign.legacy_recipients.length > 0 ? (
            <ul aria-label="Old recipients" className="flex flex-col divide-y divide-line-subtle">
              {campaign.legacy_recipients.map((person) => (
                <li key={person.id} className="py-1">
                  {/* Alone on its row, so it takes the 44px itself (an inline hit area would overlap the next row's). */}
                  <Link to={`/contacts/${person.id}`} className={`min-h-11 sm:min-h-0 inline-flex items-center ${TYPE.body} hover:underline ${FOCUS}`}>
                    {person.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {hidden ? (
            <p data-part="hidden" className={TYPE.meta}>
              <span className={NUM}>{hidden.n}</span> {hidden.text}
            </p>
          ) : null}
          {campaign.is_owner ? (
            <Link to={`/campaigns/${campaign.id}/edit`} className={`${PRIMARY} self-start`}>
              Choose a segment to send
            </Link>
          ) : (
            <p className={TYPE.bodyMuted}>Its owner has to choose a segment before it can be sent.</p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

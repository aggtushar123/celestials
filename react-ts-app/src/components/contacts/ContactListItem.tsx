import type { ReactNode } from 'react';
import { SENTIMENT_LABEL, callsLabel, placeLabel, placeOf } from '../../features/contacts/contactsFormat';
import type { Contact } from '../../features/customers/customersSlice';
import { formatRelativeTime, initials } from '../../features/customers/formatters';
import { Initials, ListRow, SentimentBadge } from '../ui';

/** One person in the Contacts list (spec 2026-09-28 §3) as a list row:
 *  initials, the name that opens their profile, one meta line of role,
 *  "Organisation › Account", "n calls" and when they were last contacted,
 *  and sentiment as the row's one badge. `actions` (a segment member's
 *  menu) wait in the row's hover actions. */
export function ContactListItem({ contact, to, selected, actions }: { contact: Contact; to: string; selected: boolean; actions?: ReactNode }) {
  const place = placeLabel(placeOf(contact));
  const contacted = contact.last_contacted_at ? `Contacted ${formatRelativeTime(contact.last_contacted_at)}` : 'Not contacted yet';
  return (
    <ListRow
      dataAttrs={{ 'data-contact': contact.id }}
      title={contact.name}
      href={to}
      selected={selected}
      leading={<Initials text={initials(contact.name)} />}
      meta={[contact.role_display, place, callsLabel(contact), contacted, contact.status === 'inactive' ? 'Inactive' : null].filter(Boolean).join(' · ')}
      actions={actions}
      trailing={<SentimentBadge value={contact.sentiment}>{SENTIMENT_LABEL[contact.sentiment]}</SentimentBadge>}
    />
  );
}

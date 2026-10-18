import { Ellipsis, Mail, Phone } from 'lucide-react';
import type { Contact } from '../../../features/customers/customersSlice';
import { capitalize, formatRelativeTime, initials } from '../../../features/customers/formatters';
import { mailtoHref, telHref } from '../../../lib/contactLinks';
import { ICON_BUTTON, Initials, ListRow, Menu, SentimentBadge } from '../../ui';
import { AccountTag, AccountText } from './ListParts';

/** One person (spec 2026-09-27 §2) as a list row: initials, the name that
 *  opens their profile on the Contacts page (spec 2026-09-28 §5), one meta
 *  line of role, status and when they were last contacted, the account tag
 *  and sentiment, and on hover how to reach them and ⋯ to edit or delete
 *  through the existing flows. Below sm the reach links hide (the profile shows
 *  them) so the name keeps its width; the account tag moves to the end of the meta line, which truncates. An address `mailtoHref` refuses gets no link
 *  here; the profile still shows it as text. */
export function PersonItem({ contact, onEdit, onDelete }: { contact: Contact; onEdit: () => void; onDelete: () => void }) {
  const contacted = contact.last_contacted_at ? `Contacted ${formatRelativeTime(contact.last_contacted_at)}` : 'Not contacted yet';
  const email = contact.email ? mailtoHref(contact.email) : null;
  const phone = contact.phone ? telHref(contact.phone) : null;
  return (
    <ListRow
      dataAttrs={{ 'data-person': contact.id }}
      title={contact.name}
      href={`/contacts/${contact.id}`}
      leading={<Initials text={initials(contact.name)} />}
      meta={
        <>
          {[contact.role_display, capitalize(contact.status), contacted].filter(Boolean).join(' · ')}
          <AccountText record={contact} />
        </>
      }
      trailing={
        <>
          <span className="max-sm:hidden sm:contents">
            <AccountTag record={contact} />
          </span>
          <SentimentBadge value={contact.sentiment}>{capitalize(contact.sentiment)} sentiment</SentimentBadge>
        </>
      }
      actions={
        <>
          {email ? (
            <a href={email} aria-label={`Email ${contact.name}`} title={contact.email ?? undefined} className={`${ICON_BUTTON} max-sm:hidden`}>
              <Mail className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
          {phone ? (
            <a href={phone} aria-label={`Call ${contact.name}`} title={contact.phone ?? undefined} className={`${ICON_BUTTON} max-sm:hidden`}>
              <Phone className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
          <Menu
            label={`Actions for ${contact.name}`}
            trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
            triggerClassName={ICON_BUTTON}
            items={[
              { key: 'edit', label: 'Edit', onSelect: onEdit },
              { key: 'delete', label: 'Delete', onSelect: onDelete, danger: true },
            ]}
          />
        </>
      }
    />
  );
}

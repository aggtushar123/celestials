import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import type { Contact } from '../../features/customers/customersSlice';
import { Sheet } from '../organizations/detail/Sheet';
import { MeetingForm } from './MeetingForm';

/** Schedule meeting from a contact's page: the organisation's contacts to
 *  invite, this person already ticked. */
export function ContactMeetingSheet({ contact, organisation, onClose }: { contact: Contact; organisation: { id: number; name: string }; onClose: () => void }) {
  const isSm = useMediaQuery(SM);
  const [contacts, setContacts] = useState<Contact[]>([contact]);
  useEffect(() => {
    let live = true;
    apiFetch<Contact[]>(`/customers/${organisation.id}/contacts/`).then(
      (rows) => {
        // This person first, whether or not the list carries them.
        if (live && Array.isArray(rows)) setContacts([contact, ...rows.filter((c) => c.id !== contact.id)]);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [contact, organisation.id]);

  return (
    <Sheet title="Schedule meeting" description={`With ${contact.name}, ${organisation.name}`} isSm={isSm} onClose={onClose}>
      <MeetingForm customerId={organisation.id} contacts={contacts} preselect={[contact.id]} />
    </Sheet>
  );
}

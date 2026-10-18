import { createContext, useContext, useEffect } from 'react';
import type { ContactsNames } from '../../../features/contacts/askContext';

/** Only the Contacts page knows the open person's name and place and the
 *  filtered organisation's and account's names, so it reports them here, and
 *  a live question's chip can name them before the server has. Null outside
 *  ContactsAskLayout. */
export const ContactsNamesContext = createContext<((names: ContactsNames) => void) | null>(null);

export function useReportContactsNames(names: ContactsNames): void {
  const report = useContext(ContactsNamesContext);
  useEffect(() => {
    report?.(names);
  }, [report, names]);
}

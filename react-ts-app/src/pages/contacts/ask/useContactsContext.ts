import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { contactsContextOf } from '../../../features/contacts/askContext';
import type { ContactsListContext, ContactsPersonContext } from '../../copilot/types';

/** Where the person is on Contacts, as the server needs it (spec §4.1): one
 *  person's id on /contacts/:id, else the page's set filters. Rebuilt only
 *  when the path or the query changes. Null on a bad id. */
export function useContactsContext(): ContactsListContext | ContactsPersonContext | null {
  const { pathname, search } = useLocation();
  return useMemo(() => contactsContextOf(pathname, search), [pathname, search]);
}

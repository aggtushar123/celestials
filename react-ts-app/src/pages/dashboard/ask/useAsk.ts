import { useContext } from 'react';
import { AskContext, type AskState } from './context';

/** The page's Ask rail, or null outside an Ask provider (DashboardFrame,
 *  OrganizationsAskLayout, ContactsAskLayout), e.g. a view or list rendered
 *  on its own in a test, where the entry points hide themselves. */
export function useAsk(): AskState | null {
  return useContext(AskContext);
}

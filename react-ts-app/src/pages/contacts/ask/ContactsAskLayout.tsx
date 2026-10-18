import { useCallback, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import type { ContactsNames } from '../../../features/contacts/askContext';
import { same } from '../../../lib/same';
import { CONTACTS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { ContactsFrame } from '../ContactsFrame';
import { ContactsNamesContext } from './contactsNames';
import { useContactsContext } from './useContactsContext';

/** The Contacts route's Ask (spec 2026-09-28 §4.4): one conversation above
 *  the list and every person, so it lasts through filters, people and back.
 *  The frame and its rail (with the pill) sit here, beside the Outlet, so a
 *  route change never remounts the rail; ContactsPage's own frame inside it
 *  passes its content straight through. */
export function ContactsAskLayout() {
  const context = useContactsContext();
  const [names, setNames] = useState<ContactsNames | null>(null);
  const report = useCallback((next: ContactsNames) => setNames((prev) => same(prev, next)), []);
  const chipLabel = useCallback(
    (asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { contacts: names }),
    [names],
  );
  const surface: AskSurface = useMemo(() => ({ name: 'contacts', context, chipLabel }), [context, chipLabel]);
  return (
    <ContactsNamesContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={CONTACTS_ASK_KEY}>
        <ContactsFrame rail={<AskRail />}>
          <Outlet />
        </ContactsFrame>
      </AskProvider>
    </ContactsNamesContext.Provider>
  );
}

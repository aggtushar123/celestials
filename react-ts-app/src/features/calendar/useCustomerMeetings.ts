import { useEffect, useState } from 'react';
import { fetchCustomerMeetings, type Meeting } from './calendarApi';

/** Google Calendar meetings on a customer, or on one of its accounts when
 *  `accountId` is given. A customer the reader can't open, or a backend
 *  without Calendar, reads as no meetings: the seeded events still show. */
export function useCustomerMeetings(customerId: number | undefined, accountId?: number): Meeting[] {
  const [loaded, setLoaded] = useState<{ customerId: number; meetings: Meeting[] } | null>(null);
  const known = customerId !== undefined && !Number.isNaN(customerId);

  useEffect(() => {
    if (!known) return;
    let live = true;
    fetchCustomerMeetings(customerId)
      .then((meetings) => live && setLoaded({ customerId, meetings }))
      .catch(() => live && setLoaded({ customerId, meetings: [] }));
    return () => {
      live = false;
    };
  }, [known, customerId]);

  // Only what was read for this customer: a stale answer for another never shows.
  if (!known || loaded?.customerId !== customerId) return [];
  return accountId === undefined ? loaded.meetings : loaded.meetings.filter((m) => m.account?.id === accountId);
}

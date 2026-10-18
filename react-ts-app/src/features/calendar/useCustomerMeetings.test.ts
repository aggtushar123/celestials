import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCustomerMeetings } from './useCustomerMeetings';

const row = (id: number, account: { id: number; name: string } | null) => ({ id, title: `M${id}`, starts_at: '2026-10-20T10:00:00Z', ends_at: '2026-10-20T11:00:00Z', all_day: false, status: 'confirmed', owner: null, organizer_email: '', attendee_count: 2, meet_url: '', customer: { id: 7, name: 'Twilio' }, account });

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body: unknown) {
  const spy = vi.fn((url: string) => Promise.resolve({ url, ok: status < 300, status, json: async () => body }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('useCustomerMeetings', () => {
  it("reads a customer's meetings, or only one account's", async () => {
    const spy = stub(200, { meetings: [row(1, null), row(2, { id: 30, name: 'APAC' })] });
    const customer = renderHook(() => useCustomerMeetings(7));
    await waitFor(() => expect(customer.result.current.map((m) => m.id)).toEqual([1, 2]));
    expect(String(spy.mock.calls[0][0])).toContain('/calendar/customers/7/meetings/');
    const account = renderHook(() => useCustomerMeetings(7, 30));
    await waitFor(() => expect(account.result.current.map((m) => m.id)).toEqual([2]));
  });

  it('a refusal or no customer reads as no meetings', async () => {
    const spy = stub(404, { detail: 'Not found.' });
    const refused = renderHook(() => useCustomerMeetings(7));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(refused.result.current).toEqual([]);
    spy.mockClear();
    const none = renderHook(() => useCustomerMeetings(undefined));
    expect(none.result.current).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

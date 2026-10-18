import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareToRevenact } from './ShareToRevenact';

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body: unknown) {
  const spy = vi.fn((url: string, init?: RequestInit) => Promise.resolve({ url, init, ok: status < 300, status, json: async () => body }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('Add to Revenact', () => {
  it('shares the conversation on the customer, then Remove takes it back', async () => {
    const spy = stub(200, { shared: true, email_id: 5 });
    render(<ShareToRevenact messageId={42} shared={false} customerName="Twilio" />);
    expect(screen.getByText('Only you can read this.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add to Revenact' }));
    expect(await screen.findByText('Shared on Twilio: anyone who can open it reads this conversation.')).toBeInTheDocument();
    expect(String(spy.mock.calls[0][0])).toContain('/mail/messages/42/share/');
    expect(spy.mock.calls[0][1]?.method).toBe('POST');
    spy.mockImplementation((url: string, init?: RequestInit) => Promise.resolve({ url, init, ok: true, status: 200, json: async () => ({ shared: false, email_id: 5 }) }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from Revenact' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to Revenact' })).toBeInTheDocument());
    expect(spy.mock.calls[1][1]?.method).toBe('DELETE');
  });

  it("shows the server's refusal", async () => {
    stub(400, { code: 'CUSTOMER_NOT_FOUND', detail: 'Nobody on this conversation belongs to a customer.' });
    render(<ShareToRevenact messageId={42} shared={false} customerName="Twilio" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to Revenact' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nobody on this conversation belongs to a customer.');
  });
});

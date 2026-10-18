import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingForm } from './MeetingForm';

const contacts = [
  { id: 11, name: 'Pat Lee', email: 'pat@twilio.com' },
  { id: 12, name: 'Kim Ray', email: 'kim@twilio.com' },
  { id: 13, name: 'No Email', email: '' },
];

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body: unknown) {
  const spy = vi.fn((url: string, init?: RequestInit) => Promise.resolve({ url, init, ok: status < 300, status, json: async () => body }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

async function fill() {
  await userEvent.type(screen.getByLabelText('Title'), 'Twilio renewal');
  await userEvent.type(screen.getByLabelText('Date'), '2026-10-20');
  await userEvent.type(screen.getByLabelText('Starts'), '15:00');
  await userEvent.click(screen.getByRole('checkbox', { name: /Pat Lee/ }));
}

describe('Schedule meeting', () => {
  it("books on my calendar with the chosen contacts, and says Google is sending invites", async () => {
    const spy = stub(201, { meeting: { id: 5, title: 'Twilio renewal', meet_url: 'https://meet.google.com/x' } });
    const onDone = vi.fn();
    render(<MeetingForm customerId={7} contacts={contacts as never} onDone={onDone} />);
    // Contacts without an address can't be invited.
    expect(screen.queryByRole('checkbox', { name: /No Email/ })).toBeNull();
    await fill();
    await userEvent.type(screen.getByLabelText('Note for invitees (optional)'), 'Renewal terms');
    await userEvent.click(screen.getByRole('button', { name: 'Book meeting' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Booked with a Meet link. Google is emailing the invites.');
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain('/calendar/meetings/');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ customer_id: 7, contact_ids: [11], title: 'Twilio renewal', description: 'Renewal terms' });
    // 30 minutes by default, in the reader's own zone.
    expect(new Date(body.ends_at).getTime() - new Date(body.starts_at).getTime()).toBe(30 * 60_000);
    expect(new Date(body.starts_at).getHours()).toBe(15);
    expect(body.request_id).toMatch(/.{8,}/);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('needs a title, a time and at least one contact before it books', async () => {
    const spy = stub(201, {});
    render(<MeetingForm customerId={7} contacts={contacts as never} />);
    expect(screen.getByRole('button', { name: 'Book meeting' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Title'), 'Twilio renewal');
    await userEvent.type(screen.getByLabelText('Date'), '2026-10-20');
    await userEvent.type(screen.getByLabelText('Starts'), '15:00');
    expect(screen.getByRole('button', { name: 'Book meeting' })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in its words, and a retry keeps the same request id", async () => {
    const spy = stub(400, { success: false, error: { code: 'CALENDAR_NOT_GRANTED', message: 'Add Calendar to your Google connection first.' } });
    render(<MeetingForm customerId={7} contacts={contacts as never} />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Book meeting' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add Calendar to your Google connection first.');
    await userEvent.click(screen.getByRole('button', { name: 'Book meeting' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const ids = spy.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).request_id);
    expect(ids[0]).toBe(ids[1]);
  });

  it('says there is nobody to invite when the customer has no contact with an email', () => {
    render(<MeetingForm customerId={7} contacts={[contacts[2]] as never} />);
    expect(screen.getByText('No contacts with an email address yet. Add one on the People tab first.')).toBeInTheDocument();
  });
});

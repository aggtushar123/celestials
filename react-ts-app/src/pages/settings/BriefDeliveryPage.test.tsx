import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';
import { BriefDeliveryPage } from './BriefDeliveryPage';

// Integration tier: the real page against the fetch boundary, responses
// shaped like the contract.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const nothing = { cadence: null, destination_hint: '', weekday: null, day: null, is_active: false, last_sent_at: null };
const weekly = { cadence: 'weekly', destination_hint: '…abcd', weekday: 1, day: 1, is_active: true, last_sent_at: '2026-09-22T08:00:00Z' };

function makeStore(role: 'admin' | 'csm' = 'admin') {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
}

function renderPage(role: 'admin' | 'csm' = 'admin') {
  render(
    <Provider store={makeStore(role)}>
      <BriefDeliveryPage />
    </Provider>
  );
}

describe('BriefDeliveryPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('tells a CSM to ask an admin and fetches nothing', () => {
    renderPage('csm');
    expect(screen.getByText(/ask an admin/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets up a weekly delivery', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, nothing))
      .mockResolvedValueOnce(jsonResponse(201, weekly));
    renderPage();
    expect(await screen.findByText(/Nothing is scheduled/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Slack webhook URL'), 'https://hooks.slack.com/services/T/B/abcd');
    await userEvent.selectOptions(screen.getByLabelText('Day'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Schedule it' }));
    expect(await screen.findByText(/Every Tuesday/)).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      destination: 'https://hooks.slack.com/services/T/B/abcd',
      cadence: 'weekly',
      weekday: 1,
    });
  });

  it('never shows the webhook back, only a hint', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, weekly));
    renderPage();
    expect(await screen.findByText(/…abcd/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/hooks.slack.com/)).not.toBeInTheDocument();
  });

  it('refuses a destination the backend rejects, without losing what is set', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockResolvedValueOnce(jsonResponse(400, { detail: 'That must be an https://hooks.slack.com/... webhook URL.' }));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Change the channel' }));
    await userEvent.type(screen.getByLabelText('Slack webhook URL'), 'https://example.com/hook');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/hooks.slack.com/);
    expect(screen.getByText(/Every Tuesday/)).toBeInTheDocument();
  });

  it('sends one now to prove it works', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockResolvedValueOnce(jsonResponse(200, { sent: true, detail: 'Sent.' }));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Send one now' }));
    expect(await within(screen.getByRole('region', { name: 'Schedule' })).findByRole('status')).toHaveTextContent(/Sent/);
  });

  it('says when there is no brief to send yet', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockResolvedValueOnce(jsonResponse(200, { sent: false, detail: 'No brief has been written yet.' }));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Send one now' }));
    expect(await within(screen.getByRole('region', { name: 'Schedule' })).findByRole('status')).toHaveTextContent(/No brief has been written yet/);
  });

  it('stops the delivery', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValueOnce(jsonResponse(200, nothing));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Stop sending' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Stop sending the brief?' })).getByRole('button', { name: 'Stop sending' }));
    expect(await screen.findByText(/Nothing is scheduled/)).toBeInTheDocument();
  });
});

describe('Briefs on the settings frame (UI foundations spec §6.3)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('heads the page with the nav label, Briefs, and puts the whole schedule in one section', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, weekly));
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Work' })).toHaveClass('text-[22px]');
    const schedule = await screen.findByRole('region', { name: 'Schedule' });
    expect(within(schedule).getByText(/Every Tuesday/)).toBeInTheDocument();
    expect(within(schedule).getByRole('button', { name: 'Stop sending' })).toHaveClass('text-danger-ink');
    expect(within(schedule).getByRole('button', { name: 'Save' })).toHaveClass('bg-accent');
  });

  it('keeps the send-now note in one status region that was there before the send', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, weekly)).mockResolvedValueOnce(jsonResponse(200, { sent: true, detail: 'Sent to Slack.' }));
    renderPage();
    const schedule = await screen.findByRole('region', { name: 'Schedule' });
    const region = within(schedule).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    await userEvent.click(within(schedule).getByRole('button', { name: 'Send one now' }));
    expect(await within(schedule).findByText('Sent to Slack.')).toBe(region);
  });

  it('tells a member once, with a lock and no box, and fetches nothing', () => {
    renderPage('csm');
    const note = screen.getByText(/ask an admin/i).closest('[data-part="settings-note"]')!;
    expect(note).not.toHaveClass('bg-warning-dim');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Briefs keep keyboard focus where it was', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('focuses the webhook field when Change the channel opens it, and the opener again on Cancel', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, weekly));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Change the channel' }));
    expect(screen.getByLabelText('Slack webhook URL')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Change the channel' })).toHaveFocus();
  });

  it('returns focus to Change the channel after a save, and keeps it on Send one now while sending', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockResolvedValueOnce(jsonResponse(201, weekly))
      .mockResolvedValueOnce(jsonResponse(200, { sent: true, detail: 'Sent.' }));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Change the channel' }));
    await userEvent.type(screen.getByLabelText('Slack webhook URL'), 'https://hooks.slack.com/services/T/B/abcd');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change the channel' })).toHaveFocus());
    const send = screen.getByRole('button', { name: 'Send one now' });
    await userEvent.click(send);
    await screen.findByText('Sent.');
    expect(send).toHaveFocus();
  });

  it('does not submit while the destination is missing, and says so to assistive tech', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, nothing));
    renderPage();
    await screen.findByText(/Nothing is scheduled/);
    const schedule = screen.getByRole('button', { name: 'Schedule it' });
    expect(schedule).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(schedule);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the webhook field when Stop sending takes its own button away', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValueOnce(jsonResponse(200, nothing));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Stop sending' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Stop sending the brief?' })).getByRole('button', { name: 'Stop sending' }));
    await screen.findByText(/Nothing is scheduled/);
    await waitFor(() => expect(screen.getByLabelText('Slack webhook URL')).toHaveFocus());
  });
});

describe('Briefs: Stop sending asks first', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  const deletes = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE');

  it('Cancel sends no DELETE and returns focus to Stop sending', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, weekly));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    const stop = screen.getByRole('button', { name: 'Stop sending' });
    await userEvent.click(stop);
    const dialog = screen.getByRole('dialog', { name: 'Stop sending the brief?' });
    expect(dialog).toHaveTextContent(/paste the webhook again/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deletes()).toHaveLength(0);
    expect(stop).toHaveFocus();
    expect(screen.getByText(/Every Tuesday/)).toBeInTheDocument();
  });

  it('Confirm sends the DELETE and focuses the webhook field', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValueOnce(jsonResponse(200, nothing));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Stop sending' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Stop sending the brief?' })).getByRole('button', { name: 'Stop sending' }));
    await screen.findByText(/Nothing is scheduled/);
    expect(deletes()).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('Slack webhook URL')).toHaveFocus());
  });

  it('a 500 keeps the dialog open with its alert, and the schedule as it was', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, weekly)).mockResolvedValueOnce(jsonResponse(500, { detail: 'Slack is down.' }));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Stop sending' }));
    const dialog = screen.getByRole('dialog', { name: 'Stop sending the brief?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop sending' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Slack is down.');
    expect(screen.getByRole('dialog', { name: 'Stop sending the brief?' })).toBe(dialog);
    expect(screen.getAllByText('Slack is down.')).toHaveLength(1);
    expect(screen.getByText(/Every Tuesday/)).toBeInTheDocument();
  });

  it('a double press on the dialog Stop sending sends one DELETE', async () => {
    let release: () => void = () => {};
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(jsonResponse(204, null)))))
      .mockResolvedValueOnce(jsonResponse(200, nothing));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    const stop = screen.getByRole('button', { name: 'Stop sending' });
    fireEvent.click(stop);
    fireEvent.click(stop);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop sending' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await act(async () => release());
    await screen.findByText(/Nothing is scheduled/);
    expect(deletes()).toHaveLength(1);
  });

  it('a double press on Send one now sends one request', async () => {
    let release: () => void = () => {};
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(jsonResponse(200, { sent: true, detail: 'Sent.' })))));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    const send = screen.getByRole('button', { name: 'Send one now' });
    fireEvent.click(send);
    fireEvent.click(send);
    await act(async () => release());
    await screen.findByText('Sent.');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('send'))).toHaveLength(1);
  });
});

describe('Briefs: the webhook field is a credential', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('keeps the browser from autofilling it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, nothing));
    renderPage();
    await screen.findByText(/Nothing is scheduled/);
    expect(screen.getByLabelText('Slack webhook URL')).toHaveAttribute('autocomplete', 'off');
  });

  it('marks it invalid, with the refusal under it, when the backend rejects the hook', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, weekly))
      .mockResolvedValueOnce(jsonResponse(400, { detail: 'That must be an https://hooks.slack.com/... webhook URL.' }));
    renderPage();
    await screen.findByText(/Every Tuesday/);
    await userEvent.click(screen.getByRole('button', { name: 'Change the channel' }));
    const hook = screen.getByLabelText('Slack webhook URL');
    expect(hook).toHaveAttribute('aria-invalid', 'false');
    await userEvent.type(hook, 'https://example.com/hook');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(hook).toHaveAttribute('aria-invalid', 'true');
    expect(hook.getAttribute('aria-describedby')?.split(' ')).toEqual(expect.arrayContaining(['brief-hook-hint', alert.id]));
  });
});

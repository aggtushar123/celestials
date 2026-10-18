import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubFeed } from '../../features/work/testFeed';
import { sent } from '../../features/work/testWork';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

// Owner, 2026-10-16: on a wide screen Work has a right pane, Add a to-do in
// its upper half and Ask Revenact in the rest. Narrower, the to-do box stays
// above the list and there is no pane.

afterEach(() => resetViewport());

describe('Work: the right pane', () => {
  it('holds Add a to-do above Ask Revenact from lg, and the list has no box of its own', async () => {
    stubFeed();
    renderWork('/work?queue=mine', { width: 1440 });
    const pane = await screen.findByRole('complementary', { name: 'Ask Revenact' });
    const add = within(pane).getByRole('form', { name: 'Quick add' });
    const ask = within(pane).getByRole('log', { name: 'Ask Revenact messages' });
    expect(add.compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const queue = document.querySelector('[data-part="queue"]') as HTMLElement;
    expect(within(queue).queryByRole('form', { name: 'Quick add' })).toBeNull();
    expect(screen.getAllByRole('form', { name: 'Quick add' })).toHaveLength(1);
  });

  it('a to-do added in the pane lands in the list, as from the box', async () => {
    const { spy } = stubFeed();
    renderWork('/work?queue=mine', { width: 1440 });
    const pane = await screen.findByRole('complementary', { name: 'Ask Revenact' });
    await userEvent.type(within(pane).getByRole('textbox', { name: 'Add a to-do' }), 'Call Twilio about SSO{Enter}');
    await waitFor(() => expect(sent(spy, 'POST', '/work/todos/')).toEqual([expect.objectContaining({ title: 'Call Twilio about SSO' })]));
    const queue = document.querySelector('[data-part="queue"]') as HTMLElement;
    expect(await within(queue).findByText('Call Twilio about SSO')).toBeInTheDocument();
  });

  it('keeps the pane on every queue, Team included', async () => {
    stubFeed({ offered: ['me', 'team'] });
    renderWork('/work?queue=team', { width: 1440 });
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
  });

  it('below lg there is no pane and the box sits above the list', async () => {
    stubFeed();
    renderWork('/work?queue=mine', { width: 900 });
    expect(await screen.findByLabelText('Add a to-do')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Ask Revenact' })).toBeNull();
  });
});

describe('Work: the Scheduled card', () => {
  it('lists my dated to-dos and tasks, overdue first, each opening its panel', async () => {
    stubFeed();
    renderWork('/work?queue=mine', { width: 1440 });
    const card = await screen.findByRole('region', { name: 'Scheduled' });
    const rows = await within(card).findAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(rows[0]).toHaveTextContent('Overdue');
    expect(within(card).getByText('Today')).toBeInTheDocument();
    expect(within(card).queryByText('Get the security review signed')).toBeNull();
    await userEvent.click(within(rows[0]).getByRole('link'));
    await waitFor(() => expect(window.location.search + where()).toMatch(/task=\d+/));
  });

  it('says Nothing scheduled when no to-do or task has a date', async () => {
    stubFeed({ tasks: [], todos: [] });
    renderWork('/work?queue=mine', { width: 1440 });
    const card = await screen.findByRole('region', { name: 'Scheduled' });
    expect(await within(card).findByText('Nothing scheduled.')).toBeInTheDocument();
  });

  it('lists my Google Calendar meetings first, with a Join link, the customer and the time', async () => {
    const soon = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const end = new Date(Date.now() + 2.5 * 3_600_000).toISOString();
    stubFeed({
      meetings: [
        { id: 1, title: 'Twilio QBR', starts_at: soon, ends_at: end, all_day: false, status: 'confirmed', owner: { id: 1, name: 'Alice' }, organizer_email: 'alice@acme.io', attendee_count: 3, meet_url: 'https://meet.google.com/abc-defg-hij', customer: { id: 7, name: 'Twilio' }, account: null },
      ],
    });
    renderWork('/work?queue=mine', { width: 1440 });
    const card = await screen.findByRole('region', { name: 'Scheduled' });
    const meetings = await within(card).findByRole('list', { name: 'Meetings' });
    const row = within(meetings).getByRole('listitem');
    expect(row).toHaveTextContent('Twilio QBR');
    expect(row).toHaveTextContent('Twilio');
    expect(within(row).getByRole('link', { name: 'Join Twilio QBR' })).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
    const tasks = within(card).getByRole('list', { name: 'Scheduled to-dos and tasks' });
    expect(meetings.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows tasks alone when calendar is unavailable', async () => {
    stubFeed();
    renderWork('/work?queue=mine', { width: 1440 });
    const card = await screen.findByRole('region', { name: 'Scheduled' });
    expect(await within(card).findByRole('list', { name: 'Scheduled to-dos and tasks' })).toBeInTheDocument();
    expect(within(card).queryByRole('list', { name: 'Meetings' })).toBeNull();
  });

  it('puts Scheduled, then Add a to-do, then Ask Revenact in the pane', async () => {
    stubFeed();
    renderWork('/work?queue=mine', { width: 1440 });
    const pane = await screen.findByRole('complementary', { name: 'Ask Revenact' });
    const scheduled = within(pane).getByRole('region', { name: 'Scheduled' });
    const add = within(pane).getByRole('region', { name: 'Add a to-do' });
    const ask = within(pane).getByRole('log', { name: 'Ask Revenact messages' });
    expect(scheduled.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(add).getByRole('textbox', { name: 'Add a to-do' })).toBeInTheDocument();
  });
});

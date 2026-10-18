import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizations } from '../testList';
import { stubOrganizationsAsk } from './testOrganizationsAsk';

const where = () => screen.getByTestId('where').textContent;
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });

// filters carry only the set keys, and group is sent only when it differs from
// the view's own default (backend ruling), and labels are server-built.
const listOrigin = { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] };
const boardOrigin = { surface: 'organizations', view: 'board', filters: { owner: '2', group: 'owner' }, labels: ['Owner: Carl CSM'] };
const dashOrigin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };
// An explicit "None": the stored empty value, never omitted (C1).
const noGroupOrigin = { surface: 'organizations', view: 'list', filters: { group: '' }, labels: [] };

function chat(id: number, title: string, origin: unknown, answer: string) {
  const summary = { id, title, created_at: '', updated_at: '', origin };
  const full = {
    ...summary,
    messages: [
      { id: 1, role: 'user', content: title, context: origin ? { ...(origin as object), focus: null } : null, sources: [], questions: [], created_at: '' },
      { id: 2, role: 'assistant', content: answer, sources: [], questions: [], created_at: '' },
    ],
  };
  return { summary, full };
}

const renews = chat(9, 'Who renews first?', listOrigin, 'Pizza Hut, and it is overdue.');
const byOwner = chat(10, 'Whose book is riskiest?', boardOrigin, 'Carl CSM, by ARR at risk.');
const atRisk = chat(4, 'Why is at-risk ARR up?', dashOrigin, 'Two renewals slipped.');
const elsewhere = chat(5, 'Pizza Hut mail', null, 'They replied.');
const noGroup = chat(11, 'How many accounts have no group?', noGroupOrigin, 'Three, all ungrouped.');

// A slice reader (only mentioned, never a participant) sees a conversation
// with no origin (the backend only builds one from the full first message,
// which they cannot read) even though the one message they see was asked
// with an Organizations context.
const sliceOrgSummary = { id: 12, title: 'Riskiest book, partial view', created_at: '', updated_at: '', origin: null };
const sliceOrg = {
  summary: sliceOrgSummary,
  full: {
    ...sliceOrgSummary,
    messages: [
      {
        id: 1,
        role: 'user',
        content: 'Riskiest book, partial view',
        context: { surface: 'organizations', view: 'board', filters: { owner: '2' }, focus: null, labels: ['Owner: Carl CSM'] },
        sources: [],
        questions: [],
        created_at: '',
      },
      { id: 2, role: 'assistant', content: 'Carl CSM.', sources: [], questions: [], created_at: '' },
    ],
  },
};

function stubHistory() {
  return stubOrganizationsAsk({
    copilot: {
      conversations: [renews.summary, byOwner.summary, atRisk.summary, elsewhere.summary, noGroup.summary, sliceOrg.summary],
      conversationById: { 9: renews.full, 10: byOwner.full, 4: atRisk.full, 5: elsewhere.full, 11: noGroup.full, 12: sliceOrg.full },
    },
  });
}

async function pick(title: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: 'History' }));
  const panel = screen.getByRole('dialog', { name: 'History' });
  const item = await within(panel).findByRole('button', { name: title });
  await userEvent.click(item);
}

describe('History on Organizations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("tags an Organizations conversation with the server's tag, and reopens it on its view with its filters", async () => {
    stubHistory();
    renderOrganizations('/organizations/board', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await within(screen.getByRole('dialog', { name: 'History' })).findByRole('button', { name: /Who renews first\?/ });
    expect(within(item).getByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.click(item);
    expect(await within(log()).findByText('Pizza Hut, and it is overdue.')).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/organizations/list?owner=2'));
    // The question's own chip, named from the list's options.
    expect(await within(log()).findByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
  });

  it('restores the board with its grouping', async () => {
    stubHistory();
    renderOrganizations('/organizations/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/Whose book is riskiest\?/);
    expect(await within(log()).findByText('Carl CSM, by ARR at risk.')).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/organizations/board?owner=2&group=owner'));
  });

  it('sends a dashboard conversation to the dashboard, whose rail shows it', async () => {
    stubHistory();
    renderOrganizations('/organizations/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/Why is at-risk ARR up\?/);
    await waitFor(() => expect(where()).toBe('/dashboard/revenue/forecast?owner=2'));
    expect(await within(log()).findByText('Two renewals slipped.')).toBeInTheDocument();
  });

  it('brings an Organizations conversation picked on the dashboard back to its view', async () => {
    stubHistory();
    renderOrganizations('/dashboard/overview', { ask: true });
    await pick(/Who renews first\?/);
    await waitFor(() => expect(where()).toBe('/organizations/list?owner=2'));
    expect(await within(log()).findByText('Pizza Hut, and it is overdue.')).toBeInTheDocument();
  });

  it("shows a past Organizations question's own labels on the Dashboard, where there are no Organizations filter options to name them from", async () => {
    stubHistory();
    renderOrganizations('/dashboard/overview', { ask: true });
    // No origin (a slice reader's view of it): opening it leaves you here.
    await pick(/Riskiest book, partial view/);
    expect(await within(log()).findByText('Carl CSM.')).toBeInTheDocument();
    // Without the server's stored `context.labels` this would read
    // "Owner: User 2" — the Dashboard has no Organizations portfolio options.
    expect(await within(log()).findByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
    expect(where()).toBe('/dashboard/overview');
  });

  it('restores the List ungrouped after asking with Group None', async () => {
    stubHistory();
    renderOrganizations('/organizations/list?group=owner', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/How many accounts have no group\?/);
    expect(await within(log()).findByText('Three, all ungrouped.')).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/organizations/list?group=none'));
    // The flat list's own heading only renders when nothing is grouped.
    expect(await screen.findByRole('heading', { name: 'Organizations list' })).toBeInTheDocument();
  });

  it('opens a conversation from elsewhere where you are', async () => {
    stubHistory();
    renderOrganizations('/organizations/board?owner=2', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/Pizza Hut mail/);
    expect(await within(log()).findByText('They replied.')).toBeInTheDocument();
    expect(where()).toBe('/organizations/board?owner=2');
  });

  it('shows the thread for an Organizations question a slice reader sees, though the conversation has no origin', async () => {
    stubHistory();
    renderOrganizations('/organizations/board?owner=2', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/Riskiest book, partial view/);
    // No origin to reopen elsewhere on: picking it on the Board stays put.
    expect(await within(log()).findByText('Carl CSM.')).toBeInTheDocument();
    expect(where()).toBe('/organizations/board?owner=2');
  });
});

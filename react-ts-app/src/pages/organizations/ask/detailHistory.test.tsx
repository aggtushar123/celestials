import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizationPage } from '../testDetail';
import { stubOrganizationPageAsk } from './testOrganizationsAsk';

// Integration tier: History on an organisation's page (spec §3). The tag is
// the server's label; restoring opens /organizations/{id}?account=….
const where = () => screen.getByTestId('where').textContent;
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });

const emeaOrigin = { surface: 'organizations', view: 'detail', organization: 7, account: 31, label: 'Pizza Hut · EMEA' };
const wholeOrigin = { surface: 'organizations', view: 'detail', organization: 7, account: null, label: 'Pizza Hut' };
const listOrigin = { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] };
// No organisation in the stub answers to id 999: the portfolio row comes
// back empty for it, as it would for one archived or moved out of reach
// since the conversation was left.
const goneOrigin = { surface: 'organizations', view: 'detail', organization: 999, account: null, label: 'Gone Co' };

function chat(id: number, title: string, origin: Record<string, unknown>, answer: string, focus: unknown = null) {
  const summary = { id, title, created_at: '', updated_at: '', origin };
  const full = {
    ...summary,
    messages: [
      { id: 1, role: 'user', content: title, context: { ...origin, focus }, sources: [], questions: [], created_at: '' },
      { id: 2, role: 'assistant', content: answer, sources: [], questions: [], created_at: '' },
    ],
  };
  return { summary, full };
}

const emea = chat(21, 'What changed in EMEA?', emeaOrigin, 'The admin left.', { kind: 'call', id: 12 });
const whole = chat(22, 'Is Pizza Hut healthy?', wholeOrigin, 'Mostly, but the renewal is close.');
const renews = chat(9, 'Who renews first?', listOrigin, 'Pizza Hut, and it is overdue.');
const gone = chat(23, 'Is Gone Co healthy?', goneOrigin, 'It used to be steady.');

function stubHistory() {
  return stubOrganizationPageAsk({
    copilot: {
      conversations: [emea.summary, whole.summary, renews.summary, gone.summary],
      conversationById: { 21: emea.full, 22: whole.full, 9: renews.full, 23: gone.full },
    },
  });
}

async function pick(title: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: 'History' }));
  const item = await within(screen.getByRole('dialog', { name: 'History' })).findByRole('button', { name: title });
  await userEvent.click(item);
}

describe("History on an organisation's page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("tags a conversation with the server's label", async () => {
    stubHistory();
    renderOrganizationPage('/organizations/list', { ask: true, list: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const panel = screen.getByRole('dialog', { name: 'History' });
    expect(within(await within(panel).findByRole('button', { name: /What changed in EMEA\?/ })).getByText('Pizza Hut · EMEA')).toBeInTheDocument();
    expect(within(within(panel).getByRole('button', { name: /Is Pizza Hut healthy\?/ })).getByText('Pizza Hut')).toBeInTheDocument();
  });

  it('reopens on the organisation with its account chip, from the List', async () => {
    stubHistory();
    renderOrganizationPage('/organizations/list', { ask: true, list: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/What changed in EMEA\?/);
    await waitFor(() => expect(where()).toBe('/organizations/7?account=31'));
    expect(await within(log()).findByText('The admin left.')).toBeInTheDocument();
    // The question's own chip: the server's label, then its focus.
    expect(within(log()).getByText('Pizza Hut · EMEA · This call')).toBeInTheDocument();
    const chips = await screen.findByRole('group', { name: 'Filter by account' });
    expect(await within(chips).findByRole('button', { name: /^EMEA/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reopens on the whole organisation, and a List conversation back on the List', async () => {
    stubHistory();
    renderOrganizationPage('/organizations/7?account=31', { ask: true, list: true });
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
    await pick(/Is Pizza Hut healthy\?/);
    await waitFor(() => expect(where()).toBe('/organizations/7'));
    expect(await within(log()).findByText('Mostly, but the renewal is close.')).toBeInTheDocument();
    await pick(/Who renews first\?/);
    await waitFor(() => expect(where()).toBe('/organizations/list?owner=2'));
    expect(await within(log()).findByText('Pizza Hut, and it is overdue.')).toBeInTheDocument();
  });

  it('brings a conversation picked on the dashboard back to the organisation', async () => {
    stubHistory();
    renderOrganizationPage('/dashboard/overview', { ask: true });
    await pick(/What changed in EMEA\?/);
    await waitFor(() => expect(where()).toBe('/organizations/7?account=31'));
    expect(await within(log()).findByText('The admin left.')).toBeInTheDocument();
  });

  it('shows the not-found state, without crashing, restoring a conversation whose organisation is no longer there', async () => {
    stubHistory();
    renderOrganizationPage('/organizations/list', { ask: true, list: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await pick(/Is Gone Co healthy\?/);
    await waitFor(() => expect(where()).toBe('/organizations/999'));
    expect(await screen.findByText('Organization not found')).toBeInTheDocument();
    expect(await within(log()).findByText('It used to be steady.')).toBeInTheDocument();
  });
});

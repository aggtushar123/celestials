import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport, resizeViewport } from '../../../test/viewport';
import { PIPELINES_ASK_KEY } from '../../dashboard/ask/askPreference';
import { renderPipelines } from '../testPages';
import { stubPipelinesAsk } from './testPipelinesAsk';

// Integration tier: the real Pipelines List and Board under
// PipelinesAskLayout, the real rail and pill, store and router; fetch
// answers the book and the Copilot in the backend's shapes
// (feat/pipelines-ask, #79). `filters` carry only the set keys; the kind is
// always sent; a focus only from "Ask about this". The stored label is the
// server's (stubPipelinesAsk builds it in the server's order, ruling F1a);
// the live chip is the toolbar's spelling and order.
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });
const views = () => screen.getByRole('navigation', { name: 'Pipelines views' });
const kinds = () => screen.getByRole('group', { name: 'Opportunities or risks' });
const pill = () => within(screen.getByTestId('nav-actions'));
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
async function findColumn(key: string): Promise<HTMLElement> {
  await waitFor(() => expect(column(key)).not.toBeNull());
  return column(key);
}

describe('Ask Revenact on the Pipelines List and Board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts the pill in the top bar and the glass rail beside the list, open from xl', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(rail()).toHaveClass('w-[320px]');
    expect(within(rail()!).getByRole('region', { name: 'Ask Revenact conversation' })).toHaveClass('rv-card-glass');
    expect(pill().getByRole('button', { name: 'New chat' })).toBeInTheDocument();
    expect(pill().getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(pill().getByRole('button', { name: 'Hide Copilot' })).toHaveAttribute('aria-pressed', 'true');
    // Glass is the rail's alone: the list card stays solid.
    expect(document.querySelector('[data-item-id="41"]')!.closest('.rounded-xl')).toHaveClass('bg-surface');
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
  });

  it("asks with the kind and the list's filters, names them in the chip, and keeps the server's label", async () => {
    const { copilot } = stubPipelinesAsk();
    renderPipelines('/pipelines/list?owner=2&organisation=7', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(await within(rail()!).findByText('Pipelines · Opportunities · Owner: Carl CSM · Organization: Pizza Hut')).toBeInTheDocument();
    await userEvent.type(composer(), 'What should I chase?{enter}');
    await screen.findByText('Answer to: What should I chase?');
    expect(postedBodies(copilot)[0]).toEqual({
      content: 'What should I chase?',
      context: { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2', organisation: '7' } },
    });
    // The asked question shows the server's words and order, not the client's.
    expect(within(log()).getByText('Pipelines · Opportunities · Organisation: Pizza Hut · Owner: Carl CSM')).toBeInTheDocument();
  });

  it('moves the chip with the filters', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list?owner=2&organisation=7', { ask: true });
    await within(rail()!).findByText('Pipelines · Opportunities · Owner: Carl CSM · Organization: Pizza Hut');
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Owner: Carl CSM' }));
    expect(await within(rail()!).findByText('Pipelines · Opportunities · Organization: Pizza Hut')).toBeInTheDocument();
  });

  it('keeps the conversation from the Board to the List and into the risks, each question with its own view and kind', async () => {
    const { copilot } = stubPipelinesAsk();
    renderPipelines('/pipelines/board?owner=2', { ask: true, nav: true });
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    await userEvent.type(composer(), 'What closes soon?{enter}');
    await screen.findByText('Answer to: What closes soon?');
    // stage is the Board's own default group, and no stage means every stage: neither is sent.
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'board', filters: { owner: '2' } });

    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(within(kinds()).getByRole('button', { name: 'Risks' }));
    await screen.findByRole('button', { name: 'Admin left' });
    expect(screen.getByText('Answer to: What closes soon?')).toBeInTheDocument();
    expect(await within(rail()!).findByText('Pipelines · Risks · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'And the risks?{enter}');
    await screen.findByText('Answer to: And the risks?');
    expect(postedBodies(copilot)[1].context).toEqual({ surface: 'pipelines', kind: 'risks', view: 'list', filters: { owner: '2' } });
  });

  it("narrows the board's columns while the rail is open", async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/board', { ask: true });
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    expect(column('negotiation')).toHaveClass('w-64');
    expect(column('closed_lost')).toHaveClass('w-44');
    await userEvent.click(pill().getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(column('negotiation')).toHaveClass('w-72'));
  });

  it('below xl the rail narrows the columns, and a card still opens its form with the rail open', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/board', { ask: true, width: 1100 });
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    // The rail is closed below xl by default.
    expect(rail()).not.toBeInTheDocument();
    expect(column('negotiation')).toHaveClass('w-72');
    await userEvent.click(pill().getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(column('negotiation')).toHaveClass('w-64');
    await userEvent.click(within(column('negotiation')).getByRole('button', { name: 'EMEA seats' }));
    expect(await screen.findByRole('heading', { name: 'Edit EMEA seats' })).toBeInTheDocument();
    expect(rail()).toBeInTheDocument();
  });

  it("keeps a card's open form when a resize opens the rail below xl", async () => {
    // The saved choice is open, so the rail opens once the window reaches sm.
    localStorage.setItem(PIPELINES_ASK_KEY, 'open');
    stubPipelinesAsk();
    renderPipelines('/pipelines/board', { ask: true, width: 375 });
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'EMEA seats' }));
    expect(await screen.findByRole('heading', { name: 'Edit EMEA seats' })).toBeInTheDocument();
    act(() => resizeViewport(1100));
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    // useBoardRail's closeCard is KEEP_FORM: the form, and any unsaved edits, stay.
    expect(screen.getByRole('heading', { name: 'Edit EMEA seats' })).toBeInTheDocument();
  });

  it.each([
    ['organisation', '/pipelines/list?organisation=7', { organisation: ['Not an organisation you can open.'] }],
    ['account', '/pipelines/list?account=12', { account: ['Not an account you can open.'] }],
  ])('refuses an %s filter the asker cannot open, with no Retry', async (_name, url, filters) => {
    const { copilot } = stubPipelinesAsk({ copilot: { refuse: { filters } } });
    renderPipelines(url, { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.type(composer(), 'What is at risk?{enter}');
    expect(await within(rail()!).findByRole('alert')).toHaveTextContent("You can't ask about this list. Clear the filters and ask again.");
    expect(within(rail()!).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(1);
  });

  it('is a full-screen sheet from the switch on a phone, never a rail', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true, width: 375 });
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(pill().getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('dialog', { name: 'Ask Revenact' })).toHaveAttribute('aria-modal', 'true');
    // The sheet is a visit, not a saved choice.
    expect(localStorage.getItem(PIPELINES_ASK_KEY)).toBeNull();
  });

  it("keeps Pipelines' own open/closed choice", async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(pill().getByRole('button', { name: 'Hide Copilot' }));
    expect(localStorage.getItem(PIPELINES_ASK_KEY)).toBe('closed');
    expect(localStorage.getItem('revenact_accounts_ask')).toBeNull();
  });

  it('mounts nothing outside the Ask layout', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(rail()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copilot$/ })).not.toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OPPORTUNITY_ROWS, buildPipelinePage, pipelineQueries, recordWrites, stubPipelines } from '../../features/pipelines/testPipelines';
import { resetViewport } from '../../test/viewport';
import { renderPipelines } from './testPages';

const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const columnKeys = () => [...document.querySelectorAll('[data-column]')].map((el) => el.getAttribute('data-column'));
/** A column once the frame has landed (before it, there are none). */
async function findColumn(key: string): Promise<HTMLElement> {
  await waitFor(() => expect(column(key)).not.toBeNull());
  return column(key);
}
const ALL = 'discovery,qualification,solution_validation,proposal_price_review,negotiation,closed_won,closed_lost';

describe('Pipelines board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
  });

  it('shows every stage as a column, reading every stage, with Closed Lost collapsed until shown', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board');
    expect(await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(await screen.findByText('5 opportunities')).toBeInTheDocument();
    expect(pipelineQueries(spy, 'opportunities')[0].get('stage')).toBe(ALL);
    expect(columnKeys()).toEqual(ALL.split(','));
    expect(within(column('closed_won')).getByRole('heading')).toHaveTextContent('Closed Won · 1 · $1.5K');
    expect(await within(column('closed_won')).findByRole('button', { name: 'Initech expansion' })).toBeInTheDocument();
    expect(within(column('closed_lost')).getByRole('heading')).toHaveTextContent('Closed Lost · 1 · $800');
    expect(within(column('closed_lost')).queryByRole('button', { name: 'Hooli pilot' })).toBeNull();
    // Collapsed, it reads nothing.
    expect(pipelineQueries(spy, 'opportunities').some((query) => query.get('group_value') === 'closed_lost')).toBe(false);
    await userEvent.click(within(column('closed_lost')).getByRole('button', { name: 'Show Closed Lost' }));
    expect(await within(column('closed_lost')).findByRole('button', { name: 'Hooli pilot' })).toBeInTheDocument();
    await userEvent.click(within(column('closed_lost')).getByRole('button', { name: 'Hide Closed Lost' }));
    expect(within(column('closed_lost')).queryByRole('button', { name: 'Hooli pilot' })).toBeNull();
  });

  it("says the Board's first read failed, with Try again reading it again", async () => {
    let failing = true;
    const spy = stubPipelines({
      pipeline: (kind, query) => (failing ? { status: 500, body: null } : buildPipelinePage(kind, query, OPPORTUNITY_ROWS)),
    });
    renderPipelines('/pipelines/board');
    const alert = await screen.findByRole('alert');
    expect(alert.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByText('Request failed (500)')).toBeInTheDocument();
    expect(columnKeys()).toEqual([]);
    const reads = pipelineQueries(spy, 'opportunities').length;
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(pipelineQueries(spy, 'opportunities').length).toBeGreaterThan(reads);
    expect(screen.queryByText('Request failed (500)')).toBeNull();
  });

  it('keeps Closed Lost out of the URL, and titles its Show and Hide buttons', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board');
    const lost = await findColumn('closed_lost');
    const show = within(lost).getByRole('button', { name: 'Show Closed Lost' });
    expect(show).toHaveAttribute('title', 'Show Closed Lost');
    await userEvent.click(show);
    expect(within(lost).getByRole('button', { name: 'Hide Closed Lost' })).toHaveAttribute('title', 'Hide Closed Lost');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/pipelines\/board$/);
  });

  it('leaves focus alone on load under StrictMode (the collapsed Show button is not focused)', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board', { strict: true });
    const lost = await findColumn('closed_lost');
    const show = within(lost).getByRole('button', { name: 'Show Closed Lost' });
    expect(document.activeElement).not.toBe(show);
  });

  it('moves focus to Hide after Show, and to Show after Hide (Show/Hide swap the focused node)', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board');
    const lost = await findColumn('closed_lost');
    await userEvent.click(within(lost).getByRole('button', { name: 'Show Closed Lost' }));
    const hideButton = within(lost).getByRole('button', { name: 'Hide Closed Lost' });
    expect(document.activeElement).toBe(hideButton);
    await userEvent.click(hideButton);
    expect(document.activeElement).toBe(within(lost).getByRole('button', { name: 'Show Closed Lost' }));
  });

  it('gives a collapsed column no "+", and a shown one its "+"', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board');
    const lost = await findColumn('closed_lost');
    expect(within(lost).queryByRole('button', { name: 'Add opportunity to Closed Lost' })).toBeNull();
    expect(within(column('negotiation')).getByRole('button', { name: 'Add opportunity to Negotiation' })).toBeInTheDocument();
    await userEvent.click(within(lost).getByRole('button', { name: 'Show Closed Lost' }));
    expect(within(lost).getByRole('button', { name: 'Add opportunity to Closed Lost' })).toBeInTheDocument();
  });

  it('narrows the columns to a stage filter, with the counts of the filtered book', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board?stage=negotiation,closed_won');
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    expect(columnKeys()).toEqual(['negotiation', 'closed_won']);
    expect(pipelineQueries(spy, 'opportunities')[0].get('stage')).toBe('negotiation,closed_won');
    expect(within(column('negotiation')).getByRole('heading')).toHaveTextContent('Negotiation · 1 · $2.0K');
  });

  it("shows a card as the list item without the stage tag: title, Part of, MRR, priority, department, date", async () => {
    stubPipelines();
    renderPipelines('/pipelines/board');
    const card = (await within(await findColumn('proposal_price_review')).findByRole('button', { name: 'Globex uplift' })).closest('li') as HTMLElement;
    expect(within(card).getByRole('link', { name: 'Globex' })).toHaveAttribute('href', '/organizations/1');
    expect(card.querySelector('[data-field="mrr"]')).toHaveTextContent('$5.0K');
    expect(card.querySelector('[data-field="priority"]')).toHaveTextContent(/^Low$/);
    expect(card).toHaveTextContent('Sales');
    expect(card.querySelector('[data-field="date"]')).toHaveTextContent('Overdue 5d');
    expect(card.querySelector('[data-field="stage"]')).toBeNull();
    const whole = (await within(column('discovery')).findByRole('button', { name: 'Analytics add-on' })).closest('li') as HTMLElement;
    expect(whole).toHaveTextContent('Whole company');
  });

  it('loads a column with pipeline-shaped placeholders, with no avatar', async () => {
    stubPipelines();
    const stubbed = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        new URL(String(input)).searchParams.get('group_value') === 'negotiation' ? new Promise<Response>(() => {}) : stubbed(input, init),
      ),
    );
    renderPipelines('/pipelines/board');
    const loading = await within(await findColumn('negotiation')).findByRole('status', { name: 'Loading Negotiation' });
    expect(loading.querySelectorAll('li')).toHaveLength(1);
    expect(loading.querySelector('.rounded-full')).toBeNull();
  });

  it('moves a card with Move to…, saving its stage and landing it in its new column', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board');
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(within(column('negotiation')).getByRole('button', { name: 'Move EMEA seats to…' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move EMEA seats to' })).getByRole('menuitem', { name: 'Closed Won' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'PATCH', path: '/opportunities/41/', body: { stage: 'closed_won' } }]));
    expect(await within(column('closed_won')).findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    await waitFor(() => expect(within(column('negotiation')).queryByRole('button', { name: 'EMEA seats' })).toBeNull());
    expect(screen.getByText('Moved EMEA seats to Closed Won.')).toBeInTheDocument();
    await waitFor(() => expect(within(column('closed_won')).getByRole('heading')).toHaveTextContent('Closed Won · 2 · $3.5K'));
  });

  it('puts a card back, with the reason, when its save fails', async () => {
    stubPipelines({ patch: () => ({ status: 400, body: { detail: 'Stage is locked.' } }) });
    renderPipelines('/pipelines/board');
    await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(within(column('negotiation')).getByRole('button', { name: 'Move EMEA seats to…' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move EMEA seats to' })).getByRole('menuitem', { name: 'Closed Won' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't move EMEA seats to Closed Won. Stage is locked.");
    expect(within(column('negotiation')).getByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(within(column('closed_won')).queryByRole('button', { name: 'EMEA seats' })).toBeNull();
  });

  it('drags a card onto another column on desktop', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board');
    const card = (await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' })).closest('li') as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(card);
    fireEvent.dragOver(column('discovery'));
    fireEvent.drop(column('discovery'));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'PATCH', path: '/opportunities/41/', body: { stage: 'discovery' } }]));
  });

  it('takes a drop on the collapsed Closed Lost, counting the card there without reading the column', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board');
    const card = (await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' })).closest('li') as HTMLElement;
    fireEvent.dragStart(card);
    fireEvent.dragOver(column('closed_lost'));
    fireEvent.drop(column('closed_lost'));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'PATCH', path: '/opportunities/41/', body: { stage: 'closed_lost' } }]));
    await waitFor(() => expect(within(column('closed_lost')).getByRole('heading')).toHaveTextContent('Closed Lost · 2 · $2.8K'));
    expect(within(column('closed_lost')).getByRole('button', { name: 'Show Closed Lost' })).toBeInTheDocument();
    expect(pipelineQueries(spy, 'opportunities').some((query) => query.get('group_value') === 'closed_lost')).toBe(false);
  });

  it('offers no moves when grouped by something else, and opens a card in its form', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board?group=priority');
    const high = await findColumn('high');
    await within(high).findByRole('button', { name: 'EMEA seats' });
    expect(within(high).queryByRole('button', { name: 'Move EMEA seats to…' })).toBeNull();
    await userEvent.click(within(high).getByRole('button', { name: 'EMEA seats' }));
    expect(screen.getByRole('heading', { name: 'Edit EMEA seats' })).toBeInTheDocument();
  });

  it("reads risks from ?kind=risks: the risk stages as columns, the risk tiles, and adds to a column's stage", async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/board?kind=risks');
    await within(await findColumn('mitigated')).findByRole('button', { name: 'Champion churned' });
    expect(columnKeys()).toEqual(['open', 'mitigated', 'realised', 'abandoned']);
    expect(pipelineQueries(spy, 'risks')[0].get('stage')).toBe('open,mitigated,realised,abandoned');
    expect(screen.getByText('MRR at risk')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add risk to Mitigated' }));
    expect(screen.getByRole('heading', { name: 'Add Risk' })).toBeInTheDocument();
    expect(screen.getByLabelText('Stage')).toHaveValue('mitigated');
  });

  it('switches kind from the top bar, staying on the Board', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board', { nav: true });
    await findColumn('negotiation');
    await userEvent.click(within(screen.getByRole('group', { name: 'Opportunities or risks' })).getByRole('button', { name: 'Risks' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/pipelines/board?kind=risks');
    await within(await findColumn('mitigated')).findByRole('button', { name: 'Champion churned' });
    expect(columnKeys()).toEqual(['open', 'mitigated', 'realised', 'abandoned']);
  });

  it('works on a phone: column tabs, and Move to… in place of a drag', async () => {
    stubPipelines();
    renderPipelines('/pipelines/board', { width: 375 });
    const tabs = await screen.findByRole('navigation', { name: 'Board columns' });
    expect(within(tabs).getAllByRole('button').map((tab) => tab.textContent)).toEqual([
      'Discovery 1',
      'Qualification 0',
      'Solution Validation 0',
      'Proposal / Price Review 1',
      'Negotiation 1',
      'Closed Won 1',
      'Closed Lost 1',
    ]);
    const card = (await within(await findColumn('negotiation')).findByRole('button', { name: 'EMEA seats' })).closest('li') as HTMLElement;
    expect(card).not.toHaveAttribute('draggable', 'true');
    expect(within(card).getByRole('button', { name: 'Move EMEA seats to…' })).toHaveClass('min-h-11');
    expect(within(screen.getByRole('group', { name: 'Opportunities or risks' })).getByRole('button', { name: 'Risks' })).toHaveClass('min-h-11');
  });
});

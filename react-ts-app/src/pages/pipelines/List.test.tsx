import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emeaSeats, pipelineBulkBodies, pipelineQueries, recordWrites, stubPipelines } from '../../features/pipelines/testPipelines';
import { resetViewport } from '../../test/viewport';
import { renderPipelines } from './testPages';

// Integration tier: the real page, store and router; fetch stubbed with the
// backend's shapes (features/pipelines/testPipelines.ts).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
type Spy = ReturnType<typeof stubPipelines>;
const searches = (spy: Spy) =>
  spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === '/api/v1/customers/' || url.pathname === '/api/v1/accounts/')
    .map((url) => `${url.pathname.replace('/api/v1', '')}?${url.searchParams.get('search') ?? ''}`);
const paths = (spy: Spy) => [...new Set(spy.mock.calls.map(([input]) => new URL(String(input)).pathname.replace(/^\/api\/v1/, '')))];

describe('Pipelines list', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
  });

  it('lists the open opportunities by stage under the tiles, reading only the book', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    expect(await screen.findByText('3 opportunities')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Open pipeline' })).toHaveTextContent('$7.3K MRR');
    // The section's heading (the tiles' stage strip has a Negotiation button too).
    expect(screen.getByRole('heading', { name: /^Negotiation/ })).toHaveTextContent('Negotiation · 1 · $2.0K');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Count' })).toBeNull();
    expect(paths(spy)).toEqual(['/pipelines/opportunities/']);
  });

  it('reads the risks with ?kind=risks', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list?kind=risks');
    expect(await screen.findByText('2 risks')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Admin left' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'MRR at risk' })).toBeInTheDocument();
    expect(pipelineQueries(spy, 'opportunities')).toEqual([]);
  });

  it('keeps the filters in the URL, with chips and "N of M"', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('combobox', { name: 'Owner' }), '3');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(where().searchParams.get('owner')).toBe('3'));
    expect(await screen.findByText('1 of 3 opportunities')).toBeInTheDocument();
    expect(pipelineQueries(spy, 'opportunities').some((query) => query.get('owner') === '3')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Owner: Priya' }));
    await waitFor(() => expect(where().searchParams.get('owner')).toBeNull());
  });

  it('filters from a tile, and clears it from the same tile', async () => {
    stubPipelines();
    renderPipelines('/pipelines/list');
    await userEvent.click(await screen.findByRole('button', { name: 'Overdue: 1' }));
    await waitFor(() => expect(where().searchParams.get('date')).toBe('overdue'));
    expect(await screen.findByRole('button', { name: 'Globex uplift' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'EMEA seats' })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Overdue: 1' }));
    await waitFor(() => expect(where().searchParams.get('date')).toBeNull());
  });

  it('opens an item in its form with its date, saves it and reads the book again', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await userEvent.click(await screen.findByRole('button', { name: 'EMEA seats' }));
    expect(screen.getByRole('heading', { name: 'Edit EMEA seats' })).toBeInTheDocument();
    const date = screen.getByLabelText('Expected close');
    expect(date).toHaveValue('2026-10-07');
    fireEvent.change(date, { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(recordWrites(spy)).toHaveLength(1));
    expect(recordWrites(spy)[0]).toMatchObject({ method: 'PATCH', path: '/opportunities/41/', body: { expected_close: '2026-11-01' } });
    await waitFor(() => expect([...document.querySelectorAll('[data-item-id="41"] [data-field="date"]')].some((d) => d.textContent === 'Closes in 32d')).toBe(true));
  });

  it('adds an opportunity on an organisation found by searching the server', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity' }));
    expect(screen.getByRole('heading', { name: 'Add Opportunity' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Seats');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Belongs to' }), 'glob');
    await waitFor(() => expect(searches(spy)).toContain('/customers/?glob'));
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Organizations' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Globex']));
    await userEvent.click(within(screen.getByRole('group', { name: 'Organizations' })).getByRole('button', { name: 'Globex' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Opportunity' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'POST', path: '/customers/1/opportunities/', body: expect.objectContaining({ title: 'Seats' }) }]));
    expect(await screen.findByRole('button', { name: 'Seats' })).toBeInTheDocument();
  });

  it('adds on one of the picked organisation\'s accounts from the optional Account choice', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Seats');
    await userEvent.click(await within(await screen.findByRole('group', { name: 'Organizations' })).findByRole('button', { name: 'Pizza Hut' }));
    const account = screen.getByLabelText('Account (optional)');
    await within(account).findByRole('option', { name: 'Pizza Hut EMEA' });
    await userEvent.selectOptions(account, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Add Opportunity' }));
    await waitFor(() =>
      expect(recordWrites(spy)).toEqual([{ method: 'POST', path: '/customers/7/accounts/12/opportunities/', body: expect.objectContaining({ title: 'Seats' }) }]),
    );
  });

  it('adds a risk on an account through the account\'s own route', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list?kind=risks');
    await screen.findByRole('button', { name: 'Admin left' });
    await userEvent.click(screen.getByRole('button', { name: 'Add risk' }));
    expect(screen.getByRole('heading', { name: 'Add Risk' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Seat cut');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Belongs to' }), 'emea');
    await waitFor(() => expect(searches(spy)).toContain('/accounts/?emea'));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Organizations' })).toBeNull());
    await userEvent.click(within(screen.getByRole('group', { name: 'Accounts' })).getByRole('button', { name: /^Pizza Hut EMEA/ }));
    expect(screen.getByText('Account · Part of Pizza Hut')).toBeInTheDocument();
    expect(screen.queryByLabelText('Account (optional)')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add Risk' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'POST', path: '/accounts/12/risks/', body: expect.objectContaining({ title: 'Seat cut' }) }]));
    expect(await screen.findByRole('button', { name: 'Seat cut' })).toBeInTheDocument();
  });

  it('will not add before a place is picked', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Seats');
    await userEvent.click(screen.getByRole('button', { name: 'Add Opportunity' }));
    expect(await screen.findByText('Pick where it belongs.')).toBeInTheDocument();
    expect(recordWrites(spy)).toEqual([]);
  });

  it('deletes from the form after a confirmation', async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list');
    await userEvent.click(await screen.findByRole('button', { name: 'Analytics add-on' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete Analytics add-on?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'DELETE', path: '/opportunities/42/', body: null }]));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Analytics add-on' })).toBeNull());
  });

  it('bulk-sets a stage, a department and a cleared date, naming what failed', async () => {
    const spy = stubPipelines({
      bulk: (_kind, body) => ({
        updated: body.ids.filter((id) => id !== 42),
        failed: body.ids.includes(42) ? [{ id: 42, reason: 'Not found.' }] : [],
      }),
    });
    renderPipelines('/pipelines/list?group=none');
    await userEvent.click(await screen.findByRole('button', { name: 'Select' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select EMEA seats' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Analytics add-on' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    await waitFor(() => expect(within(bar).getByRole('combobox', { name: 'Set stage' })).toBeEnabled());
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set stage' }), 'closed_lost');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')).toEqual([{ ids: [41, 42], action: 'set_stage', value: 'closed_lost' }]));
    expect(await within(bar).findByText('Updated 1 opportunity. 1 failed:')).toBeInTheDocument();
    expect(within(bar).getByText('Analytics add-on')).toBeInTheDocument();
    // The failure stays selected for a retry.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Analytics add-on' })).toBeChecked());
    await waitFor(() => expect(within(bar).getByRole('combobox', { name: 'Set department' })).toBeEnabled());
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set department' }), 'none');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 1' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')[1]).toEqual({ ids: [42], action: 'set_department', value: '' }));
    await waitFor(() => expect(within(bar).getByRole('button', { name: 'Clear date' })).toBeEnabled());
    await userEvent.click(within(bar).getByRole('button', { name: 'Clear date' }));
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 1' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')[2]).toEqual({ ids: [42], action: 'set_date', value: null }));
  });

  it("pages a section past its first 25 with Show more, sending the cursor the server gave", async () => {
    // 30 open deals in Negotiation, MRR 30..1 so the order is the ids' order.
    const deals = Array.from({ length: 30 }, (_, index) => ({ ...emeaSeats, id: 100 + index, title: `Deal ${index + 1}`, mrr: 30 - index }));
    const spy = stubPipelines({ opportunities: deals });
    renderPipelines('/pipelines/list');
    const section = (await screen.findByRole('heading', { name: /^Negotiation/ })).closest('section') as HTMLElement;
    expect(await within(section).findByRole('button', { name: 'Deal 25' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Deal 26' })).toBeNull();
    await userEvent.click(within(section).getByRole('button', { name: 'Show more Negotiation' }));
    expect(await within(section).findByRole('button', { name: 'Deal 30' })).toBeInTheDocument();
    expect(within(section).getAllByRole('button', { name: /^Deal \d+$/ })).toHaveLength(30);
    const more = pipelineQueries(spy, 'opportunities').filter((query) => query.has('cursor'));
    expect(more.map((query) => [query.get('group_value'), query.get('cursor'), query.get('limit')])).toEqual([['negotiation', '25', '25']]);
    // Every row has landed, so there is no further page to ask for.
    expect(within(section).queryByRole('button', { name: 'Show more Negotiation' })).toBeNull();
  });

  it('says a bulk request failed with a 500, keeping the selection for a retry', async () => {
    const spy = stubPipelines({ bulk: () => ({ status: 500, body: null }) });
    renderPipelines('/pipelines/list?group=none');
    await userEvent.click(await screen.findByRole('button', { name: 'Select' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select EMEA seats' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Analytics add-on' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    await waitFor(() => expect(within(bar).getByRole('combobox', { name: 'Set priority' })).toBeEnabled());
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set priority' }), 'low');
    const readsBefore = pipelineQueries(spy, 'opportunities').length;
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')).toEqual([{ ids: [41, 42], action: 'set_priority', value: 'low' }]));
    expect(await within(bar).findByText('Request failed (500)')).toHaveClass('text-danger-ink');
    // The book reads again after the failure; both stay selected.
    await waitFor(() => expect(pipelineQueries(spy, 'opportunities').length).toBeGreaterThan(readsBefore));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select EMEA seats' })).toBeEnabled());
    expect(within(bar).getByText('selected', { exact: false })).toHaveTextContent('2 selected');
    expect(screen.getByRole('checkbox', { name: 'Select EMEA seats' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Analytics add-on' })).toBeChecked();
  });

  it("says an export failed, in the server's words", async () => {
    stubPipelines({ exportCsv: () => ({ status: 503, body: { detail: 'Export is unavailable right now.' } }) });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPipelines('/pipelines/list?group=none');
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Export is unavailable right now.')).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
  });

  it('exports the view, and the selection by ids', async () => {
    const spy = stubPipelines();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPipelines('/pipelines/list?owner=2&group=none');
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }));
    const exports = () => spy.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname.endsWith('/pipelines/opportunities/export.csv'));
    await waitFor(() => expect(exports()).toHaveLength(1));
    expect(exports()[0].searchParams.get('owner')).toBe('2');
    // From sm too, the checkboxes show once Select is on.
    expect(screen.queryByRole('checkbox', { name: 'Select EMEA seats' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select EMEA seats' }));
    await userEvent.click(within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(exports()).toHaveLength(2));
    expect(exports()[1].search).toBe('?ids=41');
  });

  it('wears the framed bar: Pipelines, List | Board keeping the query, the kind switch, no avatar', async () => {
    stubPipelines();
    renderPipelines('/pipelines/list?owner=2&stage=negotiation', { nav: true });
    const header = document.querySelector('header');
    expect(header).toHaveClass('h-16');
    expect(screen.getByRole('heading', { name: 'Pipelines' })).toBeInTheDocument();
    const views = screen.getByRole('navigation', { name: 'Pipelines views' });
    expect(within(views).getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/pipelines/board?owner=2&stage=negotiation');
    const kinds = screen.getByRole('group', { name: 'Opportunities or risks' });
    expect(header).not.toContainElement(kinds);
    expect(within(kinds).getByRole('button', { name: 'Opportunities' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByAltText('Alice')).toBeNull();
    await userEvent.click(within(kinds).getByRole('button', { name: 'Risks' }));
    // Owner 2 stays; the stage (an opportunity's) goes.
    expect(await screen.findByText('1 of 2 risks')).toBeInTheDocument();
  });

  it('works on a phone: the kind switch leads the toolbar, targets are 44px', async () => {
    stubPipelines();
    renderPipelines('/pipelines/list', { width: 375 });
    const kinds = await screen.findByRole('group', { name: 'Opportunities or risks' });
    expect(within(kinds).getByRole('button', { name: 'Risks' })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveClass('min-h-11');
    expect((await screen.findByRole('button', { name: 'EMEA seats' })).closest('li')).toHaveClass('min-h-14');
    await userEvent.click(within(kinds).getByRole('button', { name: 'Risks' }));
    await waitFor(() => expect(where().searchParams.get('kind')).toBe('risks'));
  });
});

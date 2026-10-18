import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { CARL_GRAPH, EMPTY_GRAPH, HIDDEN_EMPTY_GRAPH, SEGMENT_ACTION_NODE, TEAM_GRAPH } from '../../features/brain/testCustomersFixtures';
import { CARL } from '../../features/brain/testDeskFixtures';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;

describe('Knowledge graph (customers spec §2.2, Decision 5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws owners neutral and edges visible on light, its filters on the shared select', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    const owner = (await screen.findAllByRole('button', { name: /^owner / }))[0];
    expect(owner.querySelector('circle')).toHaveAttribute('fill', 'var(--color-ink-muted)');
    expect(document.querySelector('svg path[data-kind]')).toHaveAttribute('stroke', 'var(--color-line-strong)');
    const select = screen.getByLabelText('Owner');
    expect(select.tagName).toBe('SELECT');
    expect(select.closest('.shrink-0')).not.toBeNull();
  });

  it('draws the scope’s nodes and relations, and opens a node into its figures and neighbours', async () => {
    const user = userEvent.setup();
    const { spy } = stubBrain();
    renderBrain('/brain/graph?scope=team');
    const pizzaHut = await screen.findByRole('button', { name: 'customer Pizza Hut' });
    expect(screen.getAllByRole('button', { name: /^(owner|customer|product|initiative|agent action) / })).toHaveLength(8);
    expect(document.querySelectorAll('path[data-kind]')).toHaveLength(8);
    expect(screen.getByText(/8 nodes, 8 relations/)).toBeInTheDocument();
    expect(requests(spy, 'GET', 'graph/')).toEqual(['/brain/graph/?scope=team']);

    await user.click(pizzaHut);
    const detail = screen.getByRole('complementary', { name: 'Details for Pizza Hut' });
    expect(within(detail).getByText('$69.6K')).toBeInTheDocument();
    expect(within(detail).getByText('overdue by 34 days')).toBeInTheDocument();
    expect(within(detail).getByText('Carl CSM')).toBeInTheDocument();
    expect(within(detail).getByText('Analytics Suite')).toBeInTheDocument();
    expect(within(detail).getByText('Save play on Pizza Hut')).toBeInTheDocument();
    expect(within(detail).queryByText('Fine')).not.toBeInTheDocument();
    expect(within(detail).getByRole('link', { name: /Open the organization/ })).toHaveAttribute('href', '/organizations/7');
    await user.click(within(detail).getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('complementary', { name: /^Details for/ })).not.toBeInTheDocument();
  });

  it('filters to the accounts carrying downside and everything they connect to', async () => {
    const user = userEvent.setup();
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    await screen.findByRole('button', { name: 'customer Pizza Hut' });
    await user.click(screen.getByLabelText('Only accounts carrying downside'));
    expect(screen.queryByRole('button', { name: 'customer Fine' })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 5 of 8 nodes and 4 of 8 relations/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText(/8 nodes, 8 relations/)).toBeInTheDocument();
  });

  it('opens to a member without view_all_accounts, on their own book', async () => {
    const { spy } = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, graphs: { me: CARL_GRAPH } });
    renderBrain('/brain/graph', { role: 'csm', user: CARL });
    await waitFor(() => expect(where()).toBe('/brain/graph?scope=me'));
    expect(await screen.findByText(/6 nodes, 6 relations/)).toBeInTheDocument();
    expect(screen.queryByText(/view-all-accounts/)).toBeNull();
    expect(requests(spy, 'GET', 'graph/')).toEqual(['/brain/graph/?scope=me']);
  });

  it('reads again on a switch and draws only the new scope', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    await screen.findByRole('button', { name: 'customer Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'Me' }));
    expect(await screen.findByText(/3 nodes, 2 relations/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'customer Pizza Hut' })).toBeNull();
  });

  it('starts on the owner a link names (What changed’s drivers), and ignores one not in this scope', async () => {
    stubBrain();
    const first = renderBrain('/brain/graph?scope=team&owner=owner%3A1');
    expect(await screen.findByText(/Showing 4 of 8 nodes and 3 of 8 relations/)).toBeInTheDocument();
    expect(screen.getByLabelText('Owner')).toHaveValue('owner:1');
    first.unmount();
    renderBrain('/brain/graph?scope=team&owner=owner%3A99');
    expect(await screen.findByText(/8 nodes, 8 relations/)).toBeInTheDocument();
    expect(screen.getByLabelText('Owner')).toHaveValue('');
  });

  it('counts the customers in this view the reader can’t open (Contract note 8)', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=company');
    expect(await screen.findByText("2 more customers in this view you can't open")).toBeInTheDocument();
  });

  it('shows the skeleton, then Try again on a failed read', async () => {
    stubBrain({ failGraph: 1 });
    renderBrain('/brain/graph?scope=team');
    expect(screen.getByText(SAY.GRAPH_LOADING)).toBeInTheDocument();
    expect(await screen.findByText(SAY.GRAPH_LOAD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/8 nodes, 8 relations/)).toBeInTheDocument();
  });

  it('says when the view has no customers', async () => {
    stubBrain({ graphs: { me: EMPTY_GRAPH } });
    renderBrain('/brain/graph?scope=me');
    expect(await screen.findByText(SAY.GRAPH_EMPTY)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Knowledge graph' })).toBeNull();
  });

  it('says honestly when every customer in this view is one the reader can’t open (final review #2)', async () => {
    stubBrain({ graphs: { company: HIDDEN_EMPTY_GRAPH } });
    renderBrain('/brain/graph?scope=company');
    expect(await screen.findByText(SAY.GRAPH_EMPTY_FILTERED)).toBeInTheDocument();
    expect(screen.queryByText(SAY.GRAPH_EMPTY)).toBeNull();
    expect(screen.getByText("3 more customers in this view you can't open")).toBeInTheDocument();
  });

  it('clears the selected node when the scope changes, even when the same id exists in the new scope (final review #1)', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    await userEvent.click(await screen.findByRole('button', { name: 'product Analytics Suite' }));
    expect(screen.getByRole('complementary', { name: 'Details for Analytics Suite' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Me' }));
    await screen.findByRole('button', { name: 'product Analytics Suite' });
    expect(screen.queryByRole('complementary', { name: /^Details for/ })).not.toBeInTheDocument();
  });

  it('keeps an owner filter across a scope switch when the node exists in both (parked #5)', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team&owner=owner%3A1');
    await screen.findByText(/Showing \d+ of \d+ nodes/);
    expect(screen.getByLabelText('Owner')).toHaveValue('owner:1');
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await waitFor(() => expect(screen.getByLabelText('Owner')).toHaveValue('owner:1'));
    expect(screen.getByText(/Showing \d+ of \d+ nodes/)).toBeInTheDocument();
  });

  it('carries ?scope= from Open initiatives, and opens an agent action in Activity (Agents delivery 3)', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    await userEvent.click(await screen.findByRole('button', { name: /initiative Halve/ }));
    const detail = screen.getByRole('complementary', { name: /Details for Halve/ });
    expect(within(detail).getByRole('link', { name: /Open initiatives/ })).toHaveAttribute('href', '/brain/doing?section=initiatives&scope=team');
    await userEvent.click(within(detail).getByRole('button', { name: 'Close details' }));
    await userEvent.click(screen.getByRole('button', { name: 'agent action Save play on Pizza Hut' }));
    const action = screen.getByRole('complementary', { name: 'Details for Save play on Pizza Hut' });
    expect(within(action).getByText('agent action')).toBeInTheDocument();
    expect(within(action).getByText('CS agent')).toBeInTheDocument();
    expect(within(action).getByText('Create a task')).toBeInTheDocument();
    expect(within(action).getByText('Pizza Hut')).toBeInTheDocument();
    // The graph draws waiting actions only, so the link opens Work, where the bundle waits.
    expect(within(action).getByRole('link', { name: /Open in Work/ })).toHaveAttribute('href', '/work/activity?action=5');
  });

  it('sits a builder action in Decisions with no relation, and drops it under a filter (Decision 6)', async () => {
    const user = userEvent.setup();
    stubBrain({ graphs: { team: { ...TEAM_GRAPH, nodes: [...TEAM_GRAPH.nodes, SEGMENT_ACTION_NODE] } } });
    renderBrain('/brain/graph?scope=team');
    const node = await screen.findByRole('button', { name: 'agent action Build a segment of poor health renewals' });
    expect(screen.getByText(/9 nodes, 8 relations/)).toBeInTheDocument();
    await user.click(node);
    const detail = screen.getByRole('complementary', { name: 'Details for Build a segment of poor health renewals' });
    expect(within(detail).getByText('Ops agent')).toBeInTheDocument();
    expect(within(detail).getByText('Build a segment')).toBeInTheDocument();
    expect(within(detail).queryByText('Connected to')).toBeNull();
    await user.click(screen.getByLabelText('Only accounts carrying downside'));
    expect(screen.queryByRole('button', { name: /^agent action Build a segment/ })).toBeNull();
    expect(screen.getByText(/Showing 5 of 9 nodes/)).toBeInTheDocument();
  });

  it('reads a target with no value as words, never an em dash (parked #6)', async () => {
    const noTarget = { ...CARL_GRAPH, nodes: CARL_GRAPH.nodes.map((n) => (n.kind === 'initiative' ? { ...n, target_value: null } : n)) };
    stubBrain({ reader: CARL, offered: ['me'], viewAll: false, graphs: { me: noTarget } });
    renderBrain('/brain/graph', { role: 'csm', user: CARL });
    await userEvent.click(await screen.findByRole('button', { name: /initiative Halve/ }));
    expect(screen.getByText(/not set by/)).toBeInTheDocument();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('sits in the Brain frame: back to What changed in the same scope, a 15px title, the switch in the bar', async () => {
    stubBrain();
    renderBrain('/brain/graph?scope=team');
    // The tab of the same name sits in the bar's nav; the way back is outside it.
    const back = await waitFor(() => {
      const link = screen.getAllByRole('link', { name: SAY.TITLE }).find((l) => !l.closest('nav'));
      if (!link) throw new Error('no way back yet');
      return link;
    });
    await waitFor(() => expect(back).toHaveAttribute('href', '/brain?scope=team'));
    expect(screen.getByRole('heading', { level: 2, name: 'Knowledge graph' })).toHaveClass('text-[15px]', 'font-semibold');
    // The only h1 is the Brain bar's (BrainAskLayout's PageHeader); the page draws none.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });

  describe('owner and product filters live in the URL (brain-polish item 3)', () => {
    const where = () => screen.getByTestId('where').textContent;

    it('writes ?owner= when an owner is chosen, and keeps ?scope=', async () => {
      stubBrain();
      renderBrain('/brain/graph?scope=team');
      await screen.findByRole('button', { name: 'customer Pizza Hut' });
      await userEvent.selectOptions(screen.getByLabelText('Owner'), 'owner:1');
      await waitFor(() => expect(where()).toBe('/brain/graph?scope=team&owner=owner%3A1'));
    });

    it('removes ?owner= and ?product= on Clear filters, keeping ?scope=', async () => {
      stubBrain();
      renderBrain('/brain/graph?scope=team&owner=owner%3A1');
      await screen.findByText(/Showing \d+ of \d+ nodes/);
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      await waitFor(() => expect(where()).toBe('/brain/graph?scope=team'));
      expect(screen.getByLabelText('Owner')).toHaveValue('');
    });

    it('loads already filtered from a URL naming ?product=', async () => {
      stubBrain();
      renderBrain('/brain/graph?scope=team&product=product%3A4');
      expect(await screen.findByText(/Showing \d+ of 8 nodes/)).toBeInTheDocument();
      expect(screen.getByLabelText('Product')).toHaveValue('product:4');
    });

    it('keeps the ?owner= filter in the URL across a scope switch when the node exists in both', async () => {
      stubBrain();
      renderBrain('/brain/graph?scope=team&owner=owner%3A1');
      await screen.findByText(/Showing \d+ of \d+ nodes/);
      await userEvent.click(screen.getByRole('button', { name: 'Company' }));
      await waitFor(() => expect(where()).toBe('/brain/graph?scope=company&owner=owner%3A1'));
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCOPE_STORAGE_KEY } from '../features/brain/brainScope';
import { SAY } from '../features/brain/brainText';
import { bodies, requests, stubBrain } from '../features/brain/testBrain';
import { COMPANY_EXPLANATION, ME_STALE_BRIEF } from '../features/brain/testBrainFixtures';
import { DO } from '../features/brain/doingText';
import { BOOK_BODY, doingWorld, FIRST_NEW_ID, TRACKABLE_METRICS } from '../features/brain/testDoingFixtures';
import { ALICE, CARL } from '../features/brain/testDeskFixtures';
import { CS } from '../features/brain/customersText';
import { CARL_CUSTOMERS, CARL_GRAPH, CARL_REQUEST_ROWS } from '../features/brain/testCustomersFixtures';
import { renderBrain } from '../pages/brain/testPages';
import { renderWork } from '../pages/work/testPages';
import { stubFeed } from '../features/work/testFeed';
import { REVIEW } from '../features/work/testFeedFixtures';
import { B_PIZZA } from '../features/agents/testBundleFixtures';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, BrainRoutes, the page
// and the router. Only fetch is stubbed, by a stateful stub in §4's and
// Waiting §3's shapes (spec §2.4: a manager switches Me → My team →
// Company, writes a brief, opens Why?; Waiting spec §2.3: a manager
// approves a report's agent action in My team, and a member without
// view_all_accounts lands from the old /brain/review link); Doing spec
// §2.3: a CSM starts an initiative on their own ARR at risk and their
// manager sees it in My team, and a manager lands from the old Initiatives
// link; customers spec §2.4: a CSM sees only their book's asks and scores
// and See all carries the scope; their manager sees the team's; a CSM
// opens the scoped graph; a manager follows a driver from What changed to
// the graph.
const where = () => screen.getByTestId('where').textContent;

describe('Brain: What changed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a manager switches Me → My team → Company, writes the company brief once, and opens Why?', { timeout: 30000 }, async () => {
    const { spy } = stubBrain({ briefs: { me: ME_STALE_BRIEF }, hidden: 2 });
    renderBrain('/brain?scope=me', { nav: true });

    // 1. Me: a baseline taken today, a stale brief, nothing material.
    expect(await screen.findByText('Since 5 Oct, when your view started')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
    expect(await screen.findByText(SAY.STALE_BRIEF)).toBeInTheDocument();
    expect(screen.getByText('Nothing moved materially since 5 Oct.')).toBeInTheDocument();

    // 2. My team: the month-end, a handover, and an explanation written once.
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=team'));
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
    expect(screen.getByText(/includes 2 customers handed to Dana CSM/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const teamWhy = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    await userEvent.dblClick(await within(teamWhy).findByRole('button', { name: SAY.EXPLAIN }));
    expect(await within(teamWhy).findByText("2 more organizations you can't open")).toBeInTheDocument();
    expect(requests(spy, 'POST', '/explanations/')).toEqual(['/brain/explanations/arr_at_risk/?scope=team']);

    // 3. Company: write the company brief (one request), then Why? shows the kept explanation.
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=company'));
    await userEvent.dblClick(await screen.findByRole('button', { name: SAY.WRITE_COMPANY }));
    expect(await screen.findByRole('heading', { name: 'A fresh brief for Company' })).toBeInTheDocument();
    expect(screen.getByText('Written 5 Oct by Alice Admin for Company')).toBeInTheDocument();
    expect(requests(spy, 'POST', '/brain/brief/')).toEqual(['/brain/brief/?scope=company']);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const companyWhy = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    expect(await within(companyWhy).findByText(COMPANY_EXPLANATION.text)).toBeInTheDocument();
    // Knowledge by function moved to What's being done (Doing Decision 6).
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();

    // 4. The last choice is remembered.
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('company');
  });
});

describe('Brain: Waiting on you moved to Work (work in one place §5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  // Agent bundles D1 frontend Decision 19: Waiting's agent actions are bundles now,
  // so /brain/waiting lands on Mine with no chip; /brain/review keeps Approvals
  // (rule reviews, contract D9).
  it('/brain/waiting?scope=me lands on Mine, with its bundles', { timeout: 30000 }, async () => {
    stubFeed();
    renderWork('/brain/waiting?scope=me', { brain: true, nav: true });
    await waitFor(() => expect(where()).toMatch(/^\/work\?/));
    const query = new URLSearchParams(where()?.split('?')[1]);
    expect(query.get('queue')).toBe('mine');
    expect(query.get('kind')).toBeNull();
    expect(await screen.findByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('link', { name: `Review & run ${B_PIZZA.title}` })).toBeInTheDocument();
  });

  it('/brain/review lands on Mine, Approvals', { timeout: 30000 }, async () => {
    stubFeed();
    renderWork('/brain/review', { brain: true, nav: true });
    await waitFor(() => expect(where()).toMatch(/^\/work\?/));
    const query = new URLSearchParams(where()?.split('?')[1]);
    expect(query.get('queue')).toBe('mine');
    expect(query.get('kind')).toBe('approval');
    expect(await screen.findByRole('button', { name: 'Approvals' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('article', { name: REVIEW.title })).toBeInTheDocument();
  });
});

describe("Brain: What's being done", () => {
  const findRow = (id: number) =>
    waitFor(() => {
      const found = document.querySelector(`[data-initiative="${id}"]`);
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a CSM starts an initiative on their own ARR at risk, and it shows in their manager’s My team', { timeout: 30000 }, async () => {
    const world = doingWorld();
    const carl = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, world });
    const first = renderBrain('/brain/doing', { role: 'csm', user: CARL, nav: true });

    // 1. Carl's Me: only the metrics the page's own `doing/` trackable list
    // offers; no cut, owner or whose book.
    await userEvent.click(await screen.findByRole('button', { name: DO.NEW }));
    const form = screen.getByRole('form', { name: DO.NEW });
    expect(within(within(form).getByLabelText(DO.FIELD_METRIC)).getAllByRole('option').map((o) => o.textContent)).toEqual(
      TRACKABLE_METRICS.map((m) => m.label),
    );
    expect(within(form).queryByLabelText(DO.FIELD_CUT)).toBeNull();
    expect(within(form).queryByLabelText(DO.FIELD_WHOSE_BOOK)).toBeNull();
    // The trackable list's own order (controller override, testDoingFixtures.ts)
    // puts Forecast ARR first, not ARR at risk: choose it explicitly.
    await userEvent.selectOptions(within(form).getByLabelText(DO.FIELD_METRIC), 'ARR at risk');
    await userEvent.type(within(form).getByLabelText(DO.FIELD_TITLE), BOOK_BODY.title);
    await userEvent.type(within(form).getByLabelText(DO.FIELD_TARGET), BOOK_BODY.target_value);
    fireEvent.change(within(form).getByLabelText(DO.FIELD_TARGET_BY), { target: { value: BOOK_BODY.target_by } });

    // 2. Saved once, on his own book, ARR at risk chosen above.
    await userEvent.dblClick(within(form).getByRole('button', { name: DO.SAVE_INITIATIVE }));
    const mine = await findRow(FIRST_NEW_ID);
    expect(mine.querySelector('[data-part="meta"]')).toHaveTextContent('ARR at risk · Your book · Active · Carl CSM');
    expect(screen.getByText(DO.STARTED)).toBeInTheDocument();
    expect(requests(carl.spy, 'POST', '/brain/initiatives/')).toEqual(['/brain/initiatives/?scope=me']);
    expect(bodies(carl.spy, 'POST', '/brain/initiatives/')).toEqual([{ ...BOOK_BODY, hypothesis: '' }]);
    expect(requests(carl.spy, 'GET', '/metrics/')).toEqual([]);
    first.unmount();
    vi.unstubAllGlobals();

    // 3. Alice, his manager, in My team: Carl's book, hers to edit through the chain.
    stubBrain({ reader: ALICE, offered: ['me', 'team'], viewAll: false, world });
    renderBrain('/brain/doing?scope=team', { role: 'csm', nav: true });
    const seen = await findRow(FIRST_NEW_ID);
    expect(seen.querySelector('[data-part="meta"]')).toHaveTextContent("ARR at risk · Carl CSM's book · Active · Carl CSM");
    expect(within(seen).getByRole('button', { name: DO.EDIT })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
  });

  it('a manager lands from the old Initiatives link, reads plans then → now, and finds Knowledge by function in Company only', { timeout: 30000 }, async () => {
    stubBrain();
    renderBrain('/brain/initiatives', { nav: true });
    await waitFor(() => expect(where()).toBe('/brain/doing?section=initiatives&scope=company'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.INITIATIVES })).toHaveFocus());
    // Health is 0-10, one decimal (fix e1f93d0): DANA_PLAN's then → now, not a 0-100 scale.
    expect(document.querySelector('[data-plan="10"] [data-part="figures"]')).toHaveTextContent('Health 6.2 → 7.1 · ARR $40K → $44K');
    expect(document.querySelector('[data-plan="9"] [data-part="figures"]')).toHaveTextContent(DO.BEFORE_FIGURES);
    expect(screen.getByText("2 more plans on records you can't open")).toBeInTheDocument();
    expect(screen.getByRole('region', { name: SAY.KNOWLEDGE })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Me' }));
    await waitFor(() => expect(where()).toBe('/brain/doing?section=initiatives&scope=me'));
    await findRow(1);
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
  });
});

describe('Brain: What customers are saying', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a CSM sees only their book’s asks and scores, See all carries the scope, and their manager sees the team’s', { timeout: 30000 }, async () => {
    const carl = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, customers: { me: CARL_CUSTOMERS }, requestRows: { me: CARL_REQUEST_ROWS } });
    const first = renderBrain('/brain/customers', { role: 'csm', user: CARL, nav: true });

    // 1. Carl's Me: his book's asks and scores only.
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=me'));
    const asks = await screen.findByRole('list', { name: CS.ASKS });
    expect(within(asks).getAllByRole('listitem').map((r) => r.querySelector('[title]')?.textContent)).toEqual(['SSO with Okta', 'Slack alerts']);
    expect(within(asks).getAllByRole('listitem')[0]).toHaveTextContent('Planned · $120.0K · 2 companies · 8 asks, up from 5');
    expect(screen.queryByText('CSV export')).toBeNull();
    expect(document.querySelector('[data-score="nps"] [data-part="figure"]')).toHaveTextContent('+10');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);

    // 2. See all opens Feature Requests on the same book.
    await userEvent.click(screen.getByRole('link', { name: CS.SEE_ALL_ASKS }));
    await waitFor(() => expect(where()).toBe('/brain/requests?scope=me'));
    expect(await screen.findByText('$120.0K')).toBeInTheDocument();
    expect(requests(carl.spy, 'GET', '/requests/')).toEqual(['/requests/?scope=me']);
    first.unmount();
    vi.unstubAllGlobals();

    // 3. Alice, his manager, in My team: the team's figures.
    stubBrain({ reader: ALICE, offered: ['me', 'team'], viewAll: false });
    renderBrain('/brain/customers?scope=team', { role: 'csm', nav: true });
    const team = await screen.findByRole('list', { name: CS.ASKS });
    expect(within(team).getAllByRole('listitem')[0]).toHaveTextContent('Planned · $182.0K · 3 companies · 12 asks, up from 7');
    expect(document.querySelector('[data-score="nps"] [data-part="change"]')).toHaveTextContent('down 7 pts from +25');
    expect(screen.getByRole('link', { name: CS.SEE_ALL_ASKS })).toHaveAttribute('href', '/brain/requests?scope=team');
  });

  it('a CSM opens the graph from the page, scoped to their book, and nothing reads the organisation-wide graph', { timeout: 30000 }, async () => {
    const { spy } = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, customers: { me: CARL_CUSTOMERS }, graphs: { me: CARL_GRAPH } });
    renderBrain('/brain/customers', { role: 'csm', user: CARL, nav: true });
    await userEvent.click(await screen.findByRole('link', { name: CS.GRAPH }));
    await waitFor(() => expect(where()).toBe('/brain/graph?scope=me'));
    expect(await screen.findByRole('button', { name: 'customer Pizza Hut' })).toBeInTheDocument();
    expect(requests(spy, 'GET', 'graph/')).toEqual(['/brain/graph/?scope=me']);
  });

  it('a manager follows a product driver from What changed to the graph, on that product', { timeout: 30000 }, async () => {
    stubBrain();
    renderBrain('/brain?scope=company', { nav: true });
    await userEvent.click(await screen.findByRole('link', { name: 'Analytics Suite on the knowledge graph' }));
    await waitFor(() => expect(where()).toBe('/brain/graph?scope=company&product=product%3A4'));
    await waitFor(() => expect(screen.getByLabelText('Product')).toHaveValue('product:4'));
    expect(screen.getByText(/Showing 10 of 10 nodes/)).toBeInTheDocument();
  });
});

describe('Brain: the frame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a manager moves between the questions on the bar’s tabs, keeping the scope, with the switch in the bar', { timeout: 30000 }, async () => {
    stubBrain();
    renderBrain('/brain?scope=team', { nav: true });
    const tabs = () => within(screen.getByRole('navigation', { name: 'Brain' }));
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
    expect(tabs().getByRole('link', { name: 'What changed' })).toHaveAttribute('aria-current', 'page');
    expect(within(screen.getByRole('banner')).getByRole('group', { name: 'View' })).toBeInTheDocument();

    await userEvent.click(tabs().getByRole('link', { name: "What's being done" }));
    await waitFor(() => expect(where()).toBe('/brain/doing?scope=team'));
    expect(tabs().getByRole('link', { name: "What's being done" })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(tabs().getByRole('link', { name: 'Customers' }));
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=team'));
    await userEvent.click(await screen.findByRole('link', { name: CS.SEE_ALL_ASKS }));
    await waitFor(() => expect(where()).toBe('/brain/requests?scope=team'));
    expect(tabs().getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
  });
});

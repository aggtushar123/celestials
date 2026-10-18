import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { CS } from '../../features/brain/customersText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { resetViewport } from '../../test/viewport';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const askTitles = () => within(screen.getByRole('list', { name: CS.ASKS })).getAllByRole('listitem').map((r) => r.querySelector('[title]')?.textContent);

describe('What customers are saying (spec §2.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the skeleton until the scope and the data land, then the four sections in order', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/customers?scope=team');
    expect(screen.getByText(CS.LOADING)).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: CS.ASKS })).toBeInTheDocument();
    expect(screen.queryByText(CS.LOADING)).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([CS.ASKS, CS.ANOMALIES, CS.SCORES, CS.SENTIMENT]);
    expect(requests(spy, 'GET', '/customers/')).toEqual(['/brain/customers/?scope=team']);
  });

  it('reads each section for the scope, with See all and See on the graph carrying it', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team');
    // Figured (Task 3) sets every figure in its own <span>, so a sentence
    // with a number in it is never one text node: RTL's getByText only ever
    // sees an element's *direct* text-node children (getNodeText), so a
    // plain-string match against the whole sentence can't find it even
    // though its full textContent is byte-identical. CustomerLists.test.tsx
    // and CustomerPanels.test.tsx hit the same thing and query by the row's
    // data-* attribute with toHaveTextContent (which reads the full
    // textContent) instead; this follows that same, already-established
    // pattern.
    await screen.findByText('SSO with Okta');
    expect(document.querySelector('[data-row="ask-2"]')).toHaveTextContent('Planned · $182.0K · 3 companies · 12 asks, up from 7');
    expect(screen.getByRole('link', { name: CS.SEE_ALL_ASKS })).toHaveAttribute('href', '/brain/requests?scope=team');
    expect(screen.getByRole('link', { name: CS.SEE_ALL_ANOMALIES })).toHaveAttribute('href', '/brain/anomalies?scope=team');
    expect(screen.getByRole('link', { name: CS.GRAPH })).toHaveAttribute('href', '/brain/graph?scope=team');
    expect(document.querySelector('[data-score="nps"]')).toHaveTextContent('down 7 pts from +25');
    expect(document.querySelector('[data-part="negative"]')).toHaveTextContent('4 contacts negative');
  });

  it('says Top 5 of 7 in Company', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=company');
    expect(await screen.findByText(/Top/)).toHaveTextContent('Top 5 of 7');
    expect(askTitles()).toHaveLength(5);
  });

  it('shows every section’s empty state on an empty book', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=me');
    expect(await screen.findByText('No asks from your customers yet.')).toBeInTheDocument();
    expect(screen.getByText(CS.NO_ANOMALIES)).toBeInTheDocument();
    // Fix wave item 16: pinned per surface, not page-wide: 2 on the tiles
    // (NPS, CSAT; the tiles have no CES tile), 3 in ScoresPanel (NPS, CSAT, CES).
    const nav = screen.getByRole('navigation', { name: CS.SECTIONS });
    expect(within(nav).getAllByText(CS.NOT_ENOUGH)).toHaveLength(2);
    const scores = screen.getByRole('region', { name: CS.SCORES });
    expect(within(scores).getAllByText(CS.NOT_ENOUGH)).toHaveLength(3);
    expect(screen.getByText(CS.NO_COMMENTS)).toBeInTheDocument();
    expect(screen.getByText(CS.NOBODY_TURNED)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: CS.SEE_ALL_ASKS })).toBeNull();
  });

  it('shows the skeleton, not the previous scope’s rows, while a switch is in flight', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/customers?scope=team');
    expect(await screen.findByRole('list', { name: CS.ASKS })).toBeInTheDocument();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const passOn = spy.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/customers/') && url.searchParams.get('scope') === 'company') await held;
        return passOn(input, init);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByText(CS.LOADING)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: CS.ASKS })).toBeNull();
    release();
    await waitFor(() => expect(askTitles()).toEqual(['SSO with Okta', 'CSV export', 'Audit log', 'Slack alerts', 'Dark mode']));
  });

  it('says it could not load, and reads again on Try again', async () => {
    stubBrain({ failCustomers: 1 });
    renderBrain('/brain/customers?scope=team');
    expect(await screen.findByText(CS.LOAD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: CS.ASKS })).toBeInTheDocument();
  });

  it('drops back to the default view with the notice on a 403', async () => {
    const { revoke } = stubBrain();
    renderBrain('/brain/customers?scope=team');
    revoke('team');
    const notice = await screen.findByText(SAY.LOST_ACCESS);
    await waitFor(() => expect(notice).toHaveFocus());
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=company'));
  });

  it('moves focus to the section the URL names once the data is in, and a section link keeps ?scope=', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team&section=scores');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: CS.SCORES })).toHaveFocus());
    await userEvent.click(within(screen.getByRole('navigation', { name: CS.SECTIONS })).getByRole('link', { name: /^Negative contacts/ }));
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=team&section=sentiment'));
  });

  it('is open to a member without view_all_accounts, with one scope as a label', async () => {
    stubBrain({ offered: ['me'], viewAll: false });
    renderBrain('/brain/customers', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=me'));
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });

  it('stacks at 375px with the switch as a segmented control and the tiles scrolling sideways', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team', { width: 375 });
    expect(within(await screen.findByRole('group', { name: 'View' })).getByRole('button', { name: 'My team' })).toHaveAttribute('aria-pressed', 'true');
    // The only h1 is the Brain bar's (BrainAskLayout's PageHeader); the page draws none.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
    expect(await screen.findByRole('navigation', { name: CS.SECTIONS })).toHaveClass('overflow-x-auto', 'snap-x');
  });

  it('opens with five tiles read from the payload, each jumping to its section and setting ?section=', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team');
    const nav = await screen.findByRole('navigation', { name: CS.SECTIONS });
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Asks: 2',
      'Anomalies: 1',
      'NPS: +18, down 7 pts from +25',
      'CSAT: 82.5%, up 2.5 pts from 80%',
      'Negative contacts: 4',
    ]);
    await userEvent.click(within(nav).getByRole('link', { name: /^CSAT/ }));
    await waitFor(() => expect(where()).toBe('/brain/customers?scope=team&section=scores'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: CS.SCORES })).toHaveFocus());
    // Fix wave item 16: NPS and CSAT both jump to Scores, so only the
    // first (NPS) is current, not both at once.
    expect(within(nav).getByRole('link', { name: /^NPS/ })).toHaveAttribute('aria-current', 'location');
    expect(within(nav).getByRole('link', { name: /^CSAT/ })).not.toHaveAttribute('aria-current');
  });

  it('says "Not enough answers" on a score tile under 5', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=me');
    const nav = await screen.findByRole('navigation', { name: CS.SECTIONS });
    expect(within(nav).getByRole('link', { name: `NPS: ${CS.NOT_ENOUGH}` })).toBeInTheDocument();
  });

  it('gives the Asks and Anomalies headers the same min height so the cards align (fix wave item 3)', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team');
    const asks = await screen.findByRole('heading', { level: 2, name: CS.ASKS });
    const anomalies = screen.getByRole('heading', { level: 2, name: CS.ANOMALIES });
    expect(asks.parentElement).toHaveClass('min-h-9');
    expect(anomalies.parentElement).toHaveClass('min-h-9');
  });

  it('puts Asks beside Anomalies, and Scores beside Sentiment, from lg', async () => {
    stubBrain();
    renderBrain('/brain/customers?scope=team');
    const asks = await screen.findByRole('region', { name: CS.ASKS });
    expect(asks.parentElement).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(asks.parentElement).toContainElement(screen.getByRole('region', { name: CS.ANOMALIES }));
    const scores = screen.getByRole('region', { name: CS.SCORES });
    expect(scores.parentElement).toHaveClass('lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(scores.parentElement).toContainElement(screen.getByRole('region', { name: CS.SENTIMENT }));
    expect(screen.getByRole('heading', { level: 2, name: CS.ASKS })).toHaveClass('text-[15px]', 'font-semibold');
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
  });
});

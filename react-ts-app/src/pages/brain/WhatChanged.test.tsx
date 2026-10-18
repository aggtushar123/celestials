import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCOPE_STORAGE_KEY } from '../../features/brain/brainScope';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { COMPANY_FIRST, COMPANY_TILES, ME_EMPTY, TEAM_RESET } from '../../features/brain/testBrainFixtures';
import { resetViewport } from '../../test/viewport';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;

describe('What changed: the scope (spec §2.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens on the server default, in the URL, with the switch pressed', async () => {
    stubBrain();
    renderBrain('/brain');
    await waitFor(() => expect(where()).toBe('/brain?scope=company'));
    // The title lives in the Brain bar (brain UI spec §1.5): no page h1, no display font.
    // The only h1 is the Brain bar's (BrainAskLayout's PageHeader); the page draws none.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
    expect(document.querySelector('.font-display')).toBeNull();
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Company' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches with one read per view and remembers the choice for next time', async () => {
    const { spy } = stubBrain();
    const first = renderBrain('/brain?scope=company');
    await screen.findByText('Since 30 Sep month-end');
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=team'));
    expect(await screen.findByText(/includes 2 customers handed to Dana CSM/)).toBeInTheDocument();
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('team');
    expect(requests(spy, 'GET', '/brain/changed/')).toEqual(['/brain/changed/?scope=company', '/brain/changed/?scope=team']);
    first.unmount();
    renderBrain('/brain');
    await waitFor(() => expect(where()).toBe('/brain?scope=team'));
  });

  it('is a segmented control on phones', async () => {
    stubBrain();
    renderBrain('/brain?scope=team', { width: 375 });
    const group = await screen.findByRole('group', { name: 'View' });
    await userEvent.click(within(group).getByRole('button', { name: 'Me' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=me'));
  });

  it('moves to the default and says so when a Brain call answers 403 SCOPE_NOT_ALLOWED', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'team');
    const { revoke } = stubBrain();
    renderBrain('/brain');
    await screen.findByText(/includes 2 customers handed to Dana CSM/);
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain?scope=company'));
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'My team' })).toBeNull();
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
  });

  it('moves focus to the lost-access notice after the 403 fallback (M3)', async () => {
    const { revoke } = stubBrain();
    renderBrain('/brain?scope=team');
    await screen.findByText(/includes 2 customers handed to Dana CSM/);
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const notice = await screen.findByText(SAY.LOST_ACCESS);
    await waitFor(() => expect(notice).toHaveFocus());
    expect(notice).toHaveAttribute('tabIndex', '-1');
  });
});

describe('What changed: states (spec §2.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows a skeleton matching the layout while loading', () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    expect(screen.getByText('Loading what changed')).toBeInTheDocument();
  });

  it('month-end: the brief, what moved and everything we measure; Company knowledge has moved to What’s being done', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: SAY.BRIEF })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: SAY.MOVED })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: SAY.MEASURE })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
  });

  it('baseline: since the view started, nothing moved, no Company knowledge', async () => {
    stubBrain();
    renderBrain('/brain?scope=me');
    expect(await screen.findByText('Since 5 Oct, when your view started')).toBeInTheDocument();
    expect(screen.getByText('Nothing moved materially since 5 Oct.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
  });

  it('team changed: moves start from the change', async () => {
    stubBrain({ changed: { team: TEAM_RESET } });
    renderBrain('/brain?scope=team');
    expect(await screen.findByText('Your team changed on 12 Oct; moves start from then')).toBeInTheDocument();
  });

  it('Company before its first month-end (Decision 8)', async () => {
    stubBrain({ changed: { company: COMPANY_FIRST } });
    renderBrain('/brain?scope=company');
    expect(await screen.findByText(SAY.NO_MONTH_END)).toBeInTheDocument();
    expect(screen.getByText(SAY.NOTHING_TO_COMPARE)).toBeInTheDocument();
  });

  it('an empty Me: the empty state, the switch still offering the other views, no brief read', async () => {
    const { spy } = stubBrain({ changed: { me: ME_EMPTY } });
    renderBrain('/brain?scope=me');
    expect(await screen.findByText("You don't own any customers yet")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My team' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Company' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: SAY.MOVED })).toBeNull();
    expect(requests(spy, 'GET', '/brain/brief/')).toEqual([]);
  });

  it('an error with Try again (Decision 6)', async () => {
    stubBrain({ failChanged: 1 });
    renderBrain('/brain?scope=company');
    expect(await screen.findByText(SAY.LOAD_CHANGED)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
  });

  it('a failed scopes read with Try again', async () => {
    stubBrain({ failScopes: 1 });
    renderBrain('/brain');
    expect(await screen.findByText(SAY.LOAD_SCOPES)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
  });

  it('is open to a member without view_all_accounts', async () => {
    stubBrain({ offered: ['me'] });
    renderBrain('/brain', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/brain?scope=me'));
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });

  it('links every member to the knowledge graph in the scope they are reading (customers Decision 5)', async () => {
    stubBrain({ offered: ['me'] });
    renderBrain('/brain', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/brain?scope=me'));
    expect(screen.getByRole('link', { name: SAY.KNOWLEDGE_GRAPH })).toHaveAttribute('href', '/brain/graph?scope=me');
  });
});

describe('What changed: the frame and tiles (brain UI spec 2026-10-06)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens with the tiles in registry order, skipping a metric the scope lacks; a withheld figure says so', async () => {
    stubBrain({ changed: { company: COMPANY_TILES } });
    renderBrain('/brain?scope=company');
    const row = await screen.findByRole('group', { name: SAY.TILES });
    const tiles = within(row).getAllByRole('group');
    ['ARR', 'Net revenue retention', 'ARR at risk', 'Book in good health'].forEach((name, i) => expect(tiles[i]).toHaveAccessibleName(name));
    expect(within(row).getByRole('group', { name: 'Net revenue retention' })).toHaveTextContent(SAY.NO_FIGURE);
    expect(within(row).getByRole('group', { name: 'ARR' }).querySelector('[data-part="change"]')).toHaveTextContent('down $13.4K, worse');
  });

  it('sits in BrainFrame, full width, with the scope switch in the bar’s slot', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    await screen.findByText('Since 30 Sep month-end');
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(document.querySelector('.max-w-4xl, .mx-auto')).toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });

  it('puts the brief and What moved side by side from lg, Everything we measure full width beneath', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    const brief = await screen.findByRole('region', { name: SAY.BRIEF });
    const pair = brief.parentElement as HTMLElement;
    expect(pair).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(within(pair).getByRole('heading', { name: SAY.MOVED })).toBeInTheDocument();
    expect(within(pair).queryByRole('heading', { name: SAY.MEASURE })).toBeNull();
  });

  it('titles its sections at 15px over one card each', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    for (const name of [SAY.BRIEF, SAY.MOVED, SAY.MEASURE]) {
      expect(await screen.findByRole('heading', { name })).toHaveClass('text-[15px]', 'font-semibold');
    }
  });

  it('gives the Brief and What moved title rows the same shape, so the two cards start level (fix wave follow-up a)', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    const brief = (await screen.findByRole('heading', { name: SAY.BRIEF })).parentElement as HTMLElement;
    const moved = screen.getByRole('heading', { name: SAY.MOVED }).parentElement as HTMLElement;
    expect(brief).toHaveClass('min-h-9', 'items-center');
    expect(moved).toHaveClass('min-h-9', 'items-center');
    expect(brief.className).toBe(moved.className);
  });

  it('shows the tiles’ skeleton with the page’s while loading, and no empty since-line (fix wave item 14)', () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    expect(screen.getByText('Loading headline figures')).toBeInTheDocument();
    expect(screen.getByText('Loading what changed')).toBeInTheDocument();
    expect(document.querySelector('[data-brain-frame] p.text-\\[13px\\].text-ink-muted')).toBeNull();
  });

  it('keeps the switch inline at the top of the page below sm', async () => {
    stubBrain();
    renderBrain('/brain?scope=team', { width: 375 });
    expect(await screen.findByRole('group', { name: 'View' })).toBeInTheDocument();
    expect(within(screen.getByTestId('nav-actions')).queryByRole('group', { name: 'View' })).toBeNull();
  });
});

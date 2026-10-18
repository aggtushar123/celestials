import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { readView, writeView } from '../../features/plans/planParams';
import { PIZZA_ONBOARDING_DRAFT, PLANS, stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { renderPlans } from '../../pages/plans/testPages';
import { resetViewport } from '../../test/viewport';

// Integration tier on /projects with the Board chosen.
const column = (label: string) => screen.getByRole('region', { name: new RegExp(`^${label}`) });
const cardIds = (label: string) => within(column(label)).queryAllByRole('listitem').map((item) => item.getAttribute('data-plan'));
const openBoard = async (url = '/projects', width = 1440) => {
  writeView('board');
  const view = renderPlans(url, { width });
  await waitFor(() => expect(cardIds('On track')).toEqual(['41']));
  return view;
};

describe('/projects: the board (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
    writeView('list');
  });

  it('opens on the remembered view, and switching remembers it', async () => {
    stubPlans();
    renderPlans('/projects');
    expect(await screen.findByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Board' }));
    expect(readView()).toBe('board');
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(cardIds('At risk')).toEqual(['42']));
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
  });

  it('shows four columns, each with its count in tabular figures, and Show cancelled adds a fifth', async () => {
    const { spy } = stubPlans();
    await openBoard();
    expect(cardIds('Not started')).toEqual(['47', '43']);
    expect(cardIds('At risk')).toEqual(['42']);
    expect(cardIds('Done')).toEqual(['44']);
    expect(within(column('Not started')).getByRole('heading').querySelector('.tabular-nums')).toHaveTextContent('2');
    expect(screen.queryByRole('region', { name: /^Cancelled/ })).toBeNull();
    expect(requestsOf(spy, 'GET', /^\/plans\/$/).map((read) => read.query.get('status')).sort()).toEqual(['at_risk', 'done', 'not_started', 'on_track']);
    await userEvent.click(screen.getByRole('button', { name: 'Show cancelled' }));
    await waitFor(() => expect(cardIds('Cancelled')).toEqual(['45']));
    expect(screen.getByTestId('where')).toHaveTextContent('/projects?cancelled=1');
  });

  it("moves a card with its status menu, says so, and reads every column again", async () => {
    const { spy } = stubPlans();
    await openBoard();
    const card = within(column('Not started')).getByRole('link', { name: 'QBR · Pizza Hut' }).closest('li') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Move QBR · Pizza Hut to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'On track' }));
    await waitFor(() => expect(cardIds('On track')).toEqual(['43', '41']));
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/$/)[0].body).toEqual({ status: 'on_track' });
    expect(document.querySelector('[data-part="board-notice"]')).toHaveTextContent('Moved QBR · Pizza Hut to On track.');
  });

  it('drags a card to another open column, and refuses Done and Not started before asking', async () => {
    const { spy } = stubPlans();
    await openBoard();
    const globex = within(column('On track')).getByRole('link', { name: 'Onboarding · Globex' }).closest('li') as HTMLElement;
    expect(globex).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(globex);
    fireEvent.dragOver(column('Done'));
    fireEvent.drop(column('Done'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mark every milestone done first.');
    fireEvent.dragStart(globex);
    fireEvent.drop(column('Not started'));
    expect(screen.getByRole('alert')).toHaveTextContent("A plan can't go back to Not started.");
    expect(requestsOf(spy, 'PATCH', /^\/plans\/41\/$/)).toHaveLength(0);
    fireEvent.dragStart(globex);
    fireEvent.dragOver(column('At risk'));
    fireEvent.drop(column('At risk'));
    await waitFor(() => expect(cardIds('At risk')).toEqual(['42', '41']));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("keeps the card where it was and shows the server's reason when it refuses", async () => {
    stubPlans({ patch: () => ({ status: 400, body: { status: ['Mark every milestone done first.'] } }) });
    await openBoard();
    const card = within(column('On track')).getByRole('link', { name: 'Onboarding · Globex' }).closest('li') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Move Onboarding · Globex to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'At risk' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not move Onboarding · Globex: Mark every milestone done first.');
    expect(cardIds('On track')).toEqual(['41']);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("gives a reader's card no status menu and no drag", async () => {
    stubPlans();
    await openBoard();
    const card = within(column('At risk')).getByRole('link', { name: 'Save plan · Initech APAC' }).closest('li') as HTMLElement;
    expect(within(card).queryByRole('button', { name: /^Move / })).toBeNull();
    expect(card).toHaveAttribute('draggable', 'false');
  });

  it('shows one column at a time below 768px, chosen by its name and count', async () => {
    stubPlans();
    writeView('board');
    renderPlans('/projects', { width: 375 });
    const picker = await screen.findByRole('combobox', { name: 'Column' });
    await waitFor(() => expect(within(picker).getByRole('option', { name: 'On track (1)' })).toBeInTheDocument());
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(picker).toHaveDisplayValue('Not started (2)');
    await userEvent.selectOptions(picker, 'at_risk');
    await waitFor(() => expect(cardIds('At risk')).toEqual(['42']));
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('says there are no plans yet when every column is empty', async () => {
    stubPlans({ plans: [] });
    writeView('board');
    renderPlans('/projects');
    expect(await screen.findByText('No plans yet')).toBeInTheDocument();
  });

  it('shows drafts only on Show drafts, first, undraggable, with no status menu', async () => {
    const { spy } = stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    await openBoard();
    expect(screen.queryByRole('region', { name: /^Draft/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show drafts' }));
    await waitFor(() => expect(cardIds('Draft')).toEqual(['48']));
    expect(screen.getByTestId('where')).toHaveTextContent('/projects?drafts=1');
    expect(document.querySelector('[data-column]')?.getAttribute('data-column')).toBe('draft');
    const card = within(column('Draft')).getByRole('listitem');
    expect(card).toHaveAttribute('draggable', 'false');
    expect(within(card).queryByRole('button', { name: /^Move / })).toBeNull();
    expect(card).toHaveTextContent('3 tasks to start');
    expect(requestsOf(spy, 'GET', /^\/plans\/$/).some((read) => read.query.get('status') === 'draft')).toBe(true);
    expect(screen.getByRole('button', { name: 'Show drafts' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows 0 for a count the server left out, such as draft', async () => {
    stubPlans({ list: () => ({ status: 200, body: { results: [], next: null, counts: { not_started: 1, on_track: 0, at_risk: 0, done: 0, cancelled: 0 } } }) });
    writeView('board');
    renderPlans('/projects?drafts=1');
    await waitFor(() => expect(column('Draft')).toHaveTextContent('Draft0'));
  });

  it('treats a board whose only plans are drafts as empty until Show drafts', async () => {
    stubPlans({ plans: [PIZZA_ONBOARDING_DRAFT] });
    writeView('board');
    renderPlans('/projects');
    expect(await screen.findByText('No plans yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Not started/ })).toBeNull();
  });
});

describe('the Plans board on the primitives (Impact PR)', () => {
  it('draws each plan as a card whose move is a Move to… menu, never a native select', async () => {
    stubPlans();
    await openBoard();
    const card = screen.getAllByRole('listitem').find((item) => item.hasAttribute('data-plan'))!;
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(within(card).queryByRole('combobox')).toBeNull();
    const move = within(card).getByRole('button', { name: /^Move .+ to…$/ });
    expect(move.closest('.sm\\:opacity-0')).toHaveClass('[@media(hover:none)]:opacity-100');
  });

  it('offers Done only when every milestone is done, and never Not started', async () => {
    stubPlans();
    await openBoard();
    const card = within(column('On track')).getByRole('link', { name: 'Onboarding · Globex' }).closest('li') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Move Onboarding · Globex to…' }));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).not.toContain('Not started');
    expect(items).not.toContain('On track');
    expect(items).toContain('At risk');
  });

  it('toggles drafts and cancelled with filter chips, and keeps its notice region mounted', async () => {
    stubPlans();
    await openBoard();
    // The Toolbar carries its own (count) status region; the board's notice has its own data-part.
    const notice = document.querySelector('[data-part="board-notice"]')!;
    expect(notice).toHaveAttribute('role', 'status');
    const drafts = screen.getByRole('button', { name: 'Show drafts' });
    expect(drafts).toHaveAttribute('aria-pressed', 'false');
    expect(drafts).toHaveClass('rounded-full');
    await userEvent.click(drafts);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show drafts' })).toHaveAttribute('aria-pressed', 'true'));
    expect(document.querySelector('[data-part="board-notice"]')).toBe(notice);
    expect(notice).toHaveClass('empty:sr-only');
    expect(notice.className).not.toMatch(/empty:hidden/);
  });
});

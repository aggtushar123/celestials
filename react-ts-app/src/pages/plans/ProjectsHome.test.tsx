import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { PIZZA_ONBOARDING_DRAFT, PLANS, stubPlans } from '../../features/plans/testPlans';
import { TEAM } from '../../features/segments/testSegments';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

// Integration tier: the real store and router, fetch stubbed in the
// contract's shapes (stubPlans).
const where = () => screen.getByTestId('where').textContent;
const ids = () => within(screen.getByRole('list', { name: 'Plans' })).getAllByRole('listitem').map((item) => item.getAttribute('data-plan'));
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('li') as HTMLElement;

describe('/projects: the list (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the header actions and, for someone with reports, every open plan they can see', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects');
    expect(await screen.findByRole('link', { name: 'New plan' })).toHaveAttribute('href', '/projects/new');
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('href', '/projects/templates');
    await waitFor(() => expect(ids()).toEqual(['47', '43', '42', '41']));
    expect(screen.getByRole('button', { name: 'All I can see' })).toHaveAttribute('aria-pressed', 'true');
    const reads = requestsOf(spy, 'GET', /^\/plans\/$/);
    expect(reads).toHaveLength(1);
    expect(reads[0].query.toString()).toBe('status=open');
    const qbr = rowOf('QBR · Pizza Hut');
    expect(within(qbr).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(qbr).toHaveTextContent('Not started');
    expect(qbr).toHaveTextContent('0/3');
    expect(qbr).toHaveTextContent('Next 6 Oct');
    expect(rowOf('Save plan · Initech APAC')).toHaveTextContent('Overdue · 15 Sep');
  });

  it('leads the phone meta line with the status and the date, so truncation never hides Overdue', async () => {
    stubPlans();
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toEqual(['47', '43', '42', '41']));
    const metaOf = (name: string) => rowOf(name).querySelector('[data-part="status-narrow"]')?.parentElement as HTMLElement;
    const qbr = metaOf('QBR · Pizza Hut').firstElementChild as HTMLElement;
    expect(qbr).toHaveAttribute('data-part', 'status-narrow');
    expect(qbr).toHaveClass('@min-[44rem]:hidden');
    expect(qbr).toHaveTextContent('Not started');
    expect(metaOf('Save plan · Initech APAC').firstElementChild).toHaveTextContent('Overdue');
  });

  it('opens on Mine for someone without reports, with no Owner filter', async () => {
    const { spy } = stubPlans({ members: TEAM });
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toEqual(['43', '41']));
    expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox', { name: 'Owner' })).toBeNull();
    expect(requestsOf(spy, 'GET', /^\/plans\/$/)[0].query.get('owner')).toBe('me');
  });

  it('keeps every filter in the URL, the search after a pause', async () => {
    stubPlans();
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toHaveLength(4));
    await userEvent.click(screen.getByRole('button', { name: 'Has my tasks' }));
    await waitFor(() => expect(where()).toBe('/projects?scope=tasks'));
    await waitFor(() => expect(ids()).toEqual(['42', '41']));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'save');
    await waitFor(() => expect(where()).toBe('/projects?scope=tasks&kind=save'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'all');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search plans by plan or record name' }), 'initech');
    await waitFor(() => expect(where()).toBe('/projects?scope=tasks&kind=save&status=all&q=initech'));
    await waitFor(() => expect(ids()).toEqual(['42']));
  });

  it('says when filters match nothing, and Clear filters goes back to open plans', async () => {
    stubPlans();
    renderPlans('/projects?status=done&q=zzz');
    expect(await screen.findByText('No plans match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(where()).toBe('/projects'));
    await waitFor(() => expect(ids()).toHaveLength(4));
  });

  it('says there are no plans yet, with a way to start one', async () => {
    stubPlans({ plans: [] });
    renderPlans('/projects');
    expect(await screen.findByText('No plans yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New plan' })).toHaveLength(1);
  });

  it('shows the error with Try again, then the list', async () => {
    let fail = true;
    stubPlans({ list: () => (fail ? { status: 500, body: { detail: 'Try later.' } } : undefined) });
    renderPlans('/projects');
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(ids()).toHaveLength(4));
  });

  it('shows more plans on the cursor', async () => {
    stubPlans({ pageSize: 2 });
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toEqual(['47', '43']));
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(ids()).toEqual(['47', '43', '42', '41']));
  });

  it('keeps a Draft out of Open and shows it under the Draft filter, with its pill and pending tasks', async () => {
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toHaveLength(4));
    expect(ids()).not.toContain('48');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'draft');
    await waitFor(() => expect(ids()).toEqual(['48']));
    const row = document.querySelector('[data-plan="48"]') as HTMLElement;
    expect(row.querySelector('[data-status="draft"]')).toHaveTextContent('Draft');
    expect(row).toHaveTextContent('3 tasks to start');
    expect(row).not.toHaveTextContent('Nothing left to do');
  });
});

describe('Plans on the primitives (Impact PR)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts List | Board in the bar as a tablist, and one toolbar on the page', async () => {
    stubPlans();
    renderPlans('/projects', { nav: true });
    const header = document.querySelector('header')!;
    const tabs = await within(header).findByRole('tablist', { name: 'Plans view' });
    expect(within(tabs).getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', within(tabs).getByRole('tab', { name: 'List' }).id);
    const scope = await screen.findByRole('group', { name: 'Scope' });
    expect(scope.closest('[data-part="toolbar-lead"]')).not.toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Search plans by plan or record name' })).toHaveAttribute('placeholder', 'Search plans');
    expect(screen.getByLabelText('Kind')).toHaveClass('appearance-none');
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveClass('border-line');
    expect(screen.getByRole('link', { name: 'New plan' })).toHaveClass('bg-accent');
  });

  it('lists the plans in one card on the plans grid, Show more inside it', async () => {
    stubPlans();
    renderPlans('/projects');
    const list = await screen.findByRole('list', { name: 'Plans' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line');
    expect(list.closest('.\\@container')).not.toBeNull();
    const row = list.querySelector('[data-plan]')!;
    expect(row.className).toContain('@min-[44rem]:grid-cols-[minmax(14rem,1fr)_8rem_8rem_7rem]');
    expect(row.querySelector('[data-status] .rounded-full')).not.toBeNull();
  });
});

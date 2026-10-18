import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { stubAccountPage } from '../../features/accounts/testAccountPage';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubOrganizationPage } from '../../features/organizations/testStory';
import type { PlanRow } from '../../features/plans/planTypes';
import { PIZZA_ONBOARDING_DRAFT, PLANS, stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { renderAccountPage } from '../../pages/accounts/testDetail';
import { renderOrganizationPage } from '../../pages/organizations/testDetail';
import { renderPlans } from '../../pages/plans/testPages';
import { resetViewport } from '../../test/viewport';
import { RecordPlans } from './RecordPlans';

const PIZZA_ROW: PlanRow = {
  id: 43, name: 'QBR · Pizza Hut', kind: 'qbr', status: 'not_started', record: { kind: 'organization', id: 7, name: 'Pizza Hut' },
  owner: { id: 1, name: 'Alice' }, start_date: '2026-10-06', target_date: '2026-10-20', milestones_done: 0, milestones_total: 3,
  tasks_done: 0, tasks_total: 5, next_due: '2026-10-06', is_overdue: false, can_edit: true,
  pending_tasks: 0, started_by_agent: null,
};
const section = () => document.querySelector('[data-part="plans"]') as HTMLElement;
const show = (record: { kind: 'organization' | 'account'; id: number }) =>
  render(
    <MemoryRouter>
      <RecordPlans record={record} />
    </MemoryRouter>,
  );

describe("a record's Plans section (spec §2.5)", () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists the open plans without the record, and Start a plan opens over the page', async () => {
    stubPlans();
    show({ kind: 'organization', id: 1 });
    const open = await screen.findByRole('list', { name: 'Plans' });
    expect(within(open).getByRole('link', { name: 'Onboarding · Globex' })).toHaveAttribute('href', '/projects/41');
    expect(within(open).queryByRole('link', { name: 'Globex' })).toBeNull();
    expect(within(section()).getByRole('link', { name: 'Start a plan' })).toHaveAttribute('href', '/organizations/1/plans/new');
  });

  it('leads the phone meta line with the status word', async () => {
    stubPlans();
    show({ kind: 'organization', id: 1 });
    const open = await screen.findByRole('list', { name: 'Plans' });
    const row = within(open).getByRole('link', { name: 'Onboarding · Globex' }).closest('li') as HTMLElement;
    const meta = row.querySelector('[data-part="status-narrow"]')?.parentElement as HTMLElement;
    expect(meta.firstElementChild).toHaveAttribute('data-part', 'status-narrow');
    expect(meta.firstElementChild).toHaveTextContent(/On track|At risk|Not started|Overdue/);
  });

  it('keeps finished plans behind Show finished (N)', async () => {
    stubPlans();
    show({ kind: 'organization', id: 2 });
    expect(await screen.findByText('No open plans.')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show finished (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(within(screen.getByRole('list', { name: 'Plans' })).getByRole('link', { name: 'Renewal prep · Initech' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide finished' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a skeleton while loading and the error with Try again', async () => {
    let fail = true;
    stubPlans({ recordPlans: () => (fail ? { status: 500, body: { detail: 'Try later.' } } : undefined) });
    show({ kind: 'account', id: 13 });
    expect(within(screen.getByRole('status')).getByText('Loading plans')).toBeInTheDocument();
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Show finished (1)' })).toBeInTheDocument();
  });

  it("sits on an organisation's page, under its header", async () => {
    stubOrganizationPage({ plans: [PIZZA_ROW] });
    renderOrganizationPage('/organizations/7');
    await waitFor(() => expect(within(section()).getByRole('link', { name: 'QBR · Pizza Hut' })).toBeInTheDocument());
    expect(within(section()).getByRole('link', { name: 'Start a plan' })).toHaveAttribute('href', '/organizations/7/plans/new');
  });

  it("sits on an account's page, and the page stays under its plans/new route", async () => {
    stubAccountPage();
    renderAccountPage('/accounts/12/plans/new');
    expect(await screen.findByText('Plan modal')).toBeInTheDocument();
    await waitFor(() => expect(within(section()).getByText('No open plans.')).toBeInTheDocument());
  });

  it("keeps an organisation's page under its plans/new route", async () => {
    stubOrganizationPage();
    renderOrganizationPage('/organizations/7/plans/new');
    expect(await screen.findByText('Plan modal')).toBeInTheDocument();
    await waitFor(() => expect(within(section()).getByText('No open plans.')).toBeInTheDocument());
  });

  it('lists a Draft as a row of the same list, not under finished', async () => {
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    show({ kind: 'organization', id: 7 });
    const list = await screen.findByRole('list', { name: 'Plans' });
    expect(await within(list).findByRole('link', { name: 'Onboarding · Pizza Hut' })).toHaveAttribute('href', '/projects/48');
    expect(list.querySelector('[data-plan="48"] [data-status="draft"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Show finished/ })).toBeNull();
  });
});

describe('Start a plan over a record (spec §2.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('locks the record it opened over, and starts the plan on it', async () => {
    const { spy } = stubPlans();
    renderPlans('/accounts/14/plans/new');
    const modal = await screen.findByRole('dialog', { name: 'New plan' });
    await waitFor(() => expect(modal.querySelector('[data-part="record"]')).toHaveTextContent('Initech APAC'));
    expect(within(modal).queryByRole('button', { name: 'Change' })).toBeNull();
    expect(within(modal).queryByRole('searchbox')).toBeNull();
    await userEvent.click(await within(modal).findByRole('radio', { name: /^QBR/ }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/projects/500'));
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)[0].body).toMatchObject({ template: 4, account: 14, name: 'QBR · Initech APAC' });
  });

  it("keeps the record page's tab under the modal and back on Cancel", async () => {
    stubPlans();
    renderPlans('/organizations/1/plans/new?tab=details');
    const modal = await screen.findByRole('dialog', { name: 'New plan' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/organizations/1?tab=details'));
  });

  it('carries the page\'s ?tab= into Start a plan', async () => {
    stubPlans();
    render(
      <MemoryRouter initialEntries={['/organizations/1?tab=details']}>
        <RecordPlans record={{ kind: 'organization', id: 1 }} />
      </MemoryRouter>,
    );
    await screen.findByRole('list', { name: 'Plans' });
    expect(within(section()).getByRole('link', { name: 'Start a plan' })).toHaveAttribute('href', '/organizations/1/plans/new?tab=details');
  });

  it('goes back to the record on Cancel', async () => {
    stubPlans();
    renderPlans('/organizations/1/plans/new');
    const modal = await screen.findByRole('dialog', { name: 'New plan' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/organizations/1'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe("a record's Plans card on the primitives (Impact PR)", () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('is one list card named Plans: heading and Start a plan in its header, finished rows join the same list', async () => {
    stubPlans();
    show({ kind: 'organization', id: 1 });
    const list = await screen.findByRole('list', { name: 'Plans' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line');
    const card = list.parentElement as HTMLElement;
    expect(within(card).getByRole('heading', { level: 2, name: 'Plans' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Start a plan' })).toBeInTheDocument();
    cleanup();
    show({ kind: 'account', id: 13 });
    const toggle = await screen.findByRole('button', { name: 'Show finished (1)' });
    const mine = toggle.closest('.rounded-xl') as HTMLElement;
    const before = within(mine).getAllByRole('listitem').length;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(within(mine).getAllByRole('listitem').length).toBe(before + 1);
    expect(within(mine).getByRole('button', { name: 'Hide finished' })).toHaveAttribute('aria-expanded', 'true');
  });
});

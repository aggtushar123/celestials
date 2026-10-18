import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { RENEWAL_WATCH, stubRules } from '../../features/rules/testRules';
import { resetViewport } from '../../test/viewport';
import { renderRules } from './testPages';

// Integration tier: the real store and router, fetch stubbed in the
// backend's contract shapes (stubRules).
const where = () => screen.getByTestId('where').textContent;
const rowOf = (list: HTMLElement, name: string) => within(list).getByRole('link', { name }).closest('li') as HTMLElement;

describe('/scenarios (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens on Rules: a row per rule with its sentence, last night, sharing and owner', async () => {
    stubRules();
    renderRules('/scenarios', { nav: true });
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'New rule' })).toHaveAttribute('href', '/scenarios/rules/new');
    const list = await screen.findByRole('list', { name: 'Rules' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    const watch = rowOf(list, 'Renewal watch');
    expect(within(watch).getByRole('link', { name: 'Renewal watch' })).toHaveAttribute('href', '/scenarios/rules/5');
    expect(watch).toHaveTextContent('Workspace');
    expect(watch).toHaveTextContent('When CSAT falls below 60 in Renewal risk → survey, notify me');
    expect(watch.querySelector('[data-part="last-run"]')).toHaveTextContent('4 Oct · fired 3 · waiting for review · You');
    expect(within(watch).getByRole('switch', { name: 'Run Renewal watch every night' })).toHaveAttribute('aria-checked', 'true');
    const carl = rowOf(list, 'EMEA renewals');
    expect(carl).toHaveTextContent('Shared');
    expect(carl).toHaveTextContent('Every Monday, for everyone in EMEA accounts → move to Renewal');
    expect(carl.querySelector('[data-part="last-run"]')).toHaveTextContent('Last ran 28 Sep · Carl CSM');
    expect(within(carl).queryByRole('switch')).toBeNull();
    expect(carl.querySelector('[data-part="status"]')).toHaveTextContent('On');
    const orphan = rowOf(list, 'Old churn watch');
    expect(orphan).toHaveTextContent('Paused');
    expect(orphan).toHaveTextContent('When a record leaves a deleted segment → notify me');
    expect(rowOf(list, 'Welcome tasks').querySelector('[data-part="last-run"]')).toHaveTextContent('Not run yet · You');
  });

  it('leads the phone meta line with the last night, so truncation never hides it', async () => {
    stubRules();
    renderRules('/scenarios');
    const watch = rowOf(await screen.findByRole('list', { name: 'Rules' }), 'Renewal watch');
    const meta = watch.querySelector('[data-part="last-run-narrow"]')?.parentElement as HTMLElement;
    const first = meta.firstElementChild as HTMLElement;
    expect(first).toHaveAttribute('data-part', 'last-run-narrow');
    expect(first).toHaveClass('@min-[44rem]:hidden');
    expect(first).toHaveTextContent('waiting for review');
    expect(first).toHaveTextContent('4 Oct');
    expect(meta.textContent?.indexOf('4 Oct')).toBeLessThan(meta.textContent?.indexOf('When CSAT') ?? 0);
  });

  it('sets the figures in tabular figures', async () => {
    stubRules();
    renderRules('/scenarios');
    const watch = rowOf(await screen.findByRole('list', { name: 'Rules' }), 'Renewal watch');
    // The sentence is the meta line's plain text; the figures left are the last night's (the grid cell and the phone copy).
    expect([...watch.querySelectorAll('.tabular-nums')].map((node) => node.textContent)).toEqual(['3', '3']);
  });

  it('turns a rule on from its row after the confirm', async () => {
    const { spy } = stubRules();
    renderRules('/scenarios');
    const row = rowOf(await screen.findByRole('list', { name: 'Rules' }), 'Welcome tasks');
    await userEvent.click(within(row).getByRole('switch', { name: 'Run Welcome tasks every night' }));
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(within(row).getByRole('switch', { name: 'Run Welcome tasks every night' })).toHaveAttribute('aria-checked', 'true'));
    expect(requestsOf(spy, 'PATCH', /^\/rules\/6\/$/)[0].body).toEqual({ is_active: true });
  });

  it('explains rules and offers New rule when there are none', async () => {
    stubRules({ rules: [] });
    renderRules('/scenarios', { nav: true });
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
    expect(screen.getByText(/A rule watches one of your segments every night/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New rule' }).map((link) => link.getAttribute('href'))).toEqual(['/scenarios/rules/new']);
  });

  it('shows a skeleton while loading, then the error with Try again, which reads again', async () => {
    let calls = 0;
    const { spy } = stubRules({
      list: () => {
        calls += 1;
        return calls === 1 ? { status: 500, body: { detail: 'Rules are down.' } } : { status: 200, body: [] };
      },
    });
    renderRules('/scenarios');
    expect(screen.getByRole('status')).toHaveTextContent('Loading rules');
    expect(await screen.findByText('Rules are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/rules\/$/)).toHaveLength(2);
  });

  it('switches to Canvas in the URL, showing the canvas list as it was, and back', async () => {
    stubRules();
    renderRules('/scenarios', { nav: true });
    await userEvent.click(await screen.findByRole('link', { name: 'Canvas' }));
    expect(where()).toBe('/scenarios?tab=canvas');
    expect(await screen.findByText('No scenarios yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create scenario' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New rule' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Rules' }));
    expect(where()).toBe('/scenarios');
  });

  it('opens the Canvas tab from the URL', async () => {
    stubRules();
    renderRules('/scenarios?tab=canvas', { nav: true });
    expect(screen.getByRole('link', { name: 'Canvas' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('No scenarios yet')).toBeInTheDocument();
  });

  it('heads the Canvas tab with the one "Scenarios" h1, from the bar', async () => {
    stubRules();
    renderRules('/scenarios?tab=canvas', { nav: true });
    expect(await screen.findByText('No scenarios yet')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual(['Scenarios']);
  });

  it('lays the rows out at phone width without a table', async () => {
    stubRules();
    renderRules('/scenarios', { width: 375 });
    const list = await screen.findByRole('list', { name: 'Rules' });
    expect(document.querySelector('table')).toBeNull();
    expect(rowOf(list, 'Renewal watch')).toHaveClass('flex');
  });
});

describe('Rules on the primitives (Impact PR)', () => {
  it('puts Rules | Canvas and New rule in the bar', async () => {
    stubRules();
    renderRules('/scenarios', { nav: true });
    const header = document.querySelector('header')!;
    const tabs = await within(header).findByRole('navigation', { name: 'Scenario views' });
    expect(within(tabs).getByRole('link', { name: 'Rules' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Canvas' })).toHaveAttribute('href', '/scenarios?tab=canvas');
    expect(within(header).getByRole('link', { name: 'New rule' })).toHaveClass('bg-accent');
  });

  it('lists the rules in one card on the rules grid: the sentence is the meta line, the switch the one control', async () => {
    stubRules();
    renderRules('/scenarios');
    const list = await screen.findByRole('list', { name: 'Rules' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line');
    const row = list.querySelector(`[data-rule="${RENEWAL_WATCH.id}"]`)!;
    expect(row.className).toContain('@min-[44rem]:grid-cols-[minmax(16rem,1fr)_14rem_10rem]');
    expect(within(row as HTMLElement).getByRole('link', { name: RENEWAL_WATCH.name })).toHaveAttribute('href', `/scenarios/rules/${RENEWAL_WATCH.id}`);
    expect(row.querySelector('p')!.className).toContain('truncate');
    expect(within(row as HTMLElement).getByRole('switch')).toBeInTheDocument();
  });
});

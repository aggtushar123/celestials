import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { B_PIZZA, TEAM_BUNDLE } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork, where } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, sidebar item,
// WorkRoutes, the task panel host and the router. Only fetch is stubbed,
// in the agent bundles D1 contract's shapes. Nothing is sent anywhere.
// Alice filters Mine to bundles, reviews one, edits it, unticks a step and
// runs it; the badge and the queue follow; she finds it in History and
// undoes its task; on My team she sees Carl's bundle "For Carl CSM".

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agent bundles: decide one in the inbox', () => {
  it('reviews, edits, runs, sees the result, then undoes it from History', { timeout: 30000 }, async () => {
    const { spy } = stubBundles({ recommendations: [] });
    renderWork('/work/mine', { nav: true, sidebarItem: true });
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    const before = await within(rail).findByRole('link', { name: /^Mine \d+$/ });
    const count = Number(before.textContent?.replace(/\D/g, ''));

    await userEvent.click(screen.getByRole('button', { name: 'Bundles' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine&kind=bundle'));
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    const title = await within(panel).findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Call Pizza Hut today');
    await userEvent.click(within(panel).getByRole('checkbox', { name: '2. File a note' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(panel).findByText('Done: all 1 step ran.')).toHaveFocus();
    expect(within(panel).getByRole('link', { name: 'Open task' })).toHaveAttribute('href', '/work/mine?task=990');
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine&kind=bundle'));
    expect(await screen.findByText('No bundles waiting.')).toBeInTheDocument();
    await waitFor(() => expect(within(rail).getByRole('link', { name: `Mine ${count - 1}` })).toBeInTheDocument());

    await userEvent.click(within(rail).getByRole('link', { name: 'History' }));
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` }));
    const done = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.click(within(done).getByRole('button', { name: 'Undo' }));
    expect(await within(done).findByText('Undone: Call Pizza Hut today.')).toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => String(url).includes('/agents/actions/41/undo/'))).toBe(true);
  });

  it('shows what waits on the team, for whom, with the people below', { timeout: 30000 }, async () => {
    stubBundles({ recommendations: [] });
    renderWork('/work?queue=team');
    const queue = await screen.findByRole('region', { name: 'Waiting on your team' });
    expect(within(queue).getByRole('heading', { name: TEAM_BUNDLE.title })).toBeInTheDocument();
    expect(within(queue).getByText('For Carl CSM')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument();
  });

  it('runs a bundle on a phone in a full-screen panel', { timeout: 30000 }, async () => {
    stubBundles({ recommendations: [] });
    renderWork('/work?queue=mine&bundle=12', { width: 390 });
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    expect(panel.className).toContain('h-full');
    await userEvent.click(await within(panel).findByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByText('Done: all 2 steps ran.')).toBeInTheDocument();
  });
});

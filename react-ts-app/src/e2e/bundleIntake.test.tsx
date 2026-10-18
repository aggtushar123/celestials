import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { BUNDLES, B_DEPT, B_MAIL, B_TICKET, MESSAGE_BUNDLES } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork, where } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, sidebar item,
// WorkRoutes and router. Only fetch is stubbed, in the agent bundles D2
// contract's shapes. Nothing is sent anywhere. A Zendesk ticket's bundle
// waits in Customer Success; Alice runs it and the badge and the queue
// count go down. A mail bundle she edited shows the newer-message banner;
// she refreshes it. Her saved edit survives closing and reopening.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

const toDecide = (link: HTMLElement) => Number(/(\d+) to decide/.exec(link.getAttribute('aria-label') ?? link.textContent ?? '')?.[1] ?? 0);

describe('Agent bundles D2: message intake', () => {
  it('runs a department bundle from its queue; the badge and the count follow', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }] });
    renderWork('/work?queue=mine', { nav: true, sidebarItem: true });
    const rail = await screen.findByRole('navigation', { name: 'Queues' });
    await userEvent.click(await within(rail).findByRole('link', { name: 'Customer Success 1' }));
    await waitFor(() => expect(where()).toBe('/work?queue=department%3Acs'));
    expect(await screen.findByRole('heading', { name: 'Waiting in Customer Success' })).toBeInTheDocument();
    const badge = await screen.findByRole('link', { name: /^Work, \d+ to decide/ });
    const before = toDecide(badge);
    await userEvent.click(await screen.findByRole('link', { name: `Review ${B_DEPT.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_DEPT.title });
    expect(within(panel).getByText('For Customer Success')).toBeInTheDocument();
    expect(within(panel).getByTestId('bundle-source').textContent).toContain('Zendesk ZD-1077 from ops@loose.io');
    expect(within(panel).getByRole('link', { name: 'Open in Zendesk (opens in a new tab)' })).toHaveAttribute('href', 'link' in B_DEPT.source ? B_DEPT.source.link : null);
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(panel).findByText('Done: all 1 step ran.')).toHaveFocus();
    await waitFor(() => expect(within(rail).getByRole('link', { name: 'Customer Success' })).toBeInTheDocument());
    expect(before).toBeGreaterThan(0);
    await waitFor(() => {
      const now = screen.getAllByRole('link', { name: /^Work/ }).find((l) => l.getAttribute('href') === '/work');
      expect(now && toDecide(now)).toBeLessThan(before);
    });
  });

  it('refreshes an edited mail bundle after a newer message', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    expect(within(panel).getByTestId('bundle-source').textContent).toContain('Email from ann@pizzahut.com');
    expect(within(panel).getByTestId('bundle-source').textContent).toContain('3 messages');
    expect(within(panel).getByText('New message since this was edited')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByText('Suggestions refreshed.')).toHaveFocus();
    expect(within(within(panel).getByTestId('step-211')).getByText('Edited')).toBeInTheDocument();
  });

  it('keeps a saved edit across closing and reopening', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES] });
    renderWork('/work?queue=mine');
    await userEvent.click(await screen.findByRole('link', { name: `Review & run ${B_TICKET.title}` }));
    let panel = await screen.findByRole('dialog', { name: B_TICKET.title });
    const title = within(within(panel).getByTestId('step-202')).getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Fix the login loop today');
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('link', { name: `Review & run ${B_TICKET.title}` }));
    panel = await screen.findByRole('dialog', { name: B_TICKET.title });
    expect(within(within(panel).getByTestId('step-202')).getByLabelText('Title')).toHaveValue('Fix the login loop today');
  });

  it('shows the banner and the source line on a phone', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`, { width: 390 });
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    expect(panel.className).toContain('h-full');
    expect(within(panel).getByTestId('newer-message')).toBeInTheDocument();
    expect(within(panel).getByTestId('bundle-source')).toBeInTheDocument();
  });
});

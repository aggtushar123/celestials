import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { stubBrainAsk } from '../pages/brain/ask/testBrainAsk';
import { renderBrain } from '../pages/brain/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, BrainRoutes under
// BrainAskLayout, the rail and its pill, the store and the router. Only fetch
// is stubbed (stubBrainAsk), in the backend's shapes (brain ask spec §1.1:
// context {surface:'brain', scope, tab}; the origin is that context).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const MY_TEAM_CHANGED = { surface: 'brain', scope: 'team', tab: 'changed' };

// The conversation as History lists it after the journey below.
const ASKED = { id: 21, title: 'Why did these numbers move?', created_at: '', updated_at: '', origin: MY_TEAM_CHANGED };

describe('Ask Revenact on the Brain, end to end (brain ask spec §2, §3)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('a manager switches to My team, asks on What changed from a starter, follows up, and finds it in History', { timeout: 30000 }, async () => {
    const { copilot } = stubBrainAsk({ copilot: { conversations: [ASKED] } });
    renderBrain('/brain?scope=company', { nav: true });
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();

    // 1. The bar: the scope switch first, then the Ask pill.
    const slot = document.querySelector('[data-nav-actions-slot]') as HTMLElement;
    expect(within(slot).getByRole('group', { name: 'View' }).closest('[data-page-actions="bar"]')).toHaveClass('order-first');
    expect(within(slot).getByRole('button', { name: 'Hide Copilot' })).toBeInTheDocument();

    // 2. My team: the chip follows the scope.
    await userEvent.click(within(slot).getByRole('button', { name: 'My team' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=team'));
    expect(await within(rail()).findByText('Brain · What changed · My team')).toBeInTheDocument();

    // 3. A starter: sent as the question, grounded in What changed and My team.
    const starters = within(rail()).getByRole('list', { name: 'Suggested questions' });
    await userEvent.click(within(starters).getByRole('button', { name: 'Why did these numbers move?' }));
    expect(await screen.findByText('Answer to: Why did these numbers move?')).toBeInTheDocument();
    expect(within(rail()).queryByRole('list', { name: 'Suggested questions' })).toBeNull();

    // 4. A typed follow-up in the same conversation and view.
    await userEvent.type(composer(), 'Which customers drove it?{Enter}');
    expect(await screen.findByText('Answer to: Which customers drove it?')).toBeInTheDocument();
    expect(postedBodies(copilot).map((body) => [body.content, body.context])).toEqual([
      ['Why did these numbers move?', MY_TEAM_CHANGED],
      ['Which customers drove it?', MY_TEAM_CHANGED],
    ]);

    // 5. History lists it, tagged with the tab and scope and the Brain icon.
    await userEvent.click(within(slot).getByRole('button', { name: 'History' }));
    const item = await screen.findByRole('button', { name: /Why did these numbers move\?\s*Started on/ });
    expect(item).toHaveAccessibleName(/Why did these numbers move\?\s*Started on Brain · What changed · My team/);
    expect(item.querySelector('svg.lucide-brain')).not.toBeNull();
  });
});

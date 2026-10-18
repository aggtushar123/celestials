import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { ASK_AFTER_SCOPE, ASK_FROM_A_TAB, VIEW_CHANGED } from '../../../features/brain/askContext';
import { resetViewport } from '../../../test/viewport';
import { renderBrain } from '../testPages';
import { stubBrainAsk } from './testBrainAsk';

// Integration tier: the rail's chip and states on the real Brain pages
// (brain ask spec §2.2, §2.4, §3). Only fetch is stubbed.
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;

describe('Ask on the Brain: the chip and the states', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('chips the next question with the tab title and the scope, following both', async () => {
    stubBrainAsk();
    renderBrain('/brain?scope=company', { nav: true });
    expect(await within(rail()).findByText('Brain · What changed · Company')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Me' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=me'));
    expect(await within(rail()).findByText('Brain · What changed · Me')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Brain' })).getByRole('link', { name: "What's being done" }));
    expect(await within(rail()).findByText("Brain · What's being done · Me")).toBeInTheDocument();
    // The screen itself is never removable from a question.
    expect(within(rail()).queryByRole('button', { name: 'Remove focus' })).toBeNull();
  });

  it.each(['/brain/requests?scope=team', '/brain/anomalies?scope=team', '/brain/graph?scope=team'])(
    'keeps the rail on %s but asks nothing there: "ask from a tab"',
    async (url) => {
      const { copilot } = stubBrainAsk();
      renderBrain(url);
      await screen.findByRole('group', { name: 'View' });
      expect(within(rail()).getByText(ASK_FROM_A_TAB)).toBeInTheDocument();
      expect(within(rail()).queryByText(ASK_AFTER_SCOPE)).toBeNull();
      await userEvent.type(composer(), 'Why?{Enter}');
      expect(postedBodies(copilot)).toEqual([]);
    },
  );

  it('says the view changed on a scope refusal, keeps the question, and offers no retry', async () => {
    stubBrainAsk({ copilot: { refuse: { scope: ["You can't ask about that view."] } } });
    renderBrain('/brain?scope=team');
    await within(rail()).findByText('Brain · What changed · My team');
    await userEvent.type(composer(), 'Why?{Enter}');
    expect(await within(rail()).findByText(VIEW_CHANGED)).toBeInTheDocument();
    expect(within(rail()).getByText('Why?')).toBeInTheDocument();
    expect(within(rail()).queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('blocks a resend in the same stale scope after a refusal, and allows it once the scope changes', async () => {
    const { copilot } = stubBrainAsk({ copilot: { refuse: { scope: ["You can't ask about that view."] } } });
    renderBrain('/brain?scope=team');
    await within(rail()).findByText('Brain · What changed · My team');
    await userEvent.type(composer(), 'Why?{Enter}');
    expect(await within(rail()).findByText(VIEW_CHANGED)).toBeInTheDocument();
    // Same scope: the composer does not go out again.
    await userEvent.type(composer(), 'Again?{Enter}');
    expect(postedBodies(copilot)).toHaveLength(1);
    expect(within(rail()).getByText(VIEW_CHANGED)).toBeInTheDocument();
    // The scope moves on: the refusal clears, and the next question sends.
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=company'));
    expect(within(rail()).queryByText(VIEW_CHANGED)).toBeNull();
    await userEvent.type(composer(), 'Now?{Enter}');
    expect(await screen.findByText('Answer to: Now?')).toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(2);
  });

  it('is a full-screen sheet at 375px, opened from the bar', async () => {
    stubBrainAsk();
    renderBrain('/brain?scope=team', { width: 375 });
    await screen.findByText('Since 30 Sep month-end');
    expect(screen.queryByRole('complementary', { name: 'Ask Revenact' })).toBeNull();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Show Copilot' }));
    const sheet = screen.getByRole('dialog', { name: 'Ask Revenact' });
    expect(sheet).toHaveClass('fixed', 'inset-0');
    expect(within(sheet).getByText('Brain · What changed · My team')).toBeInTheDocument();
  });
});

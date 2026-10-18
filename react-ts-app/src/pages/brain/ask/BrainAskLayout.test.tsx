import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { ASK_AFTER_SCOPE } from '../../../features/brain/askContext';
import { SAY } from '../../../features/brain/brainText';
import { resetViewport } from '../../../test/viewport';
import { renderBrain } from '../testPages';
import { stubBrainAsk } from './testBrainAsk';

// Integration tier: the real Brain pages under BrainAskLayout, the real
// store and router; only fetch is stubbed (stubBrainAsk).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const asked = (spy: Parameters<typeof postedBodies>[0]) => postedBodies(spy).map((body) => [body.content, body.context]);
const settled = () => waitFor(() => expect(within(rail()).queryByText(ASK_AFTER_SCOPE)).toBeNull());

describe('BrainAskLayout (brain ask spec §2.2)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('asks from the tab in the route and the scope the page settled on', async () => {
    const { copilot } = stubBrainAsk();
    renderBrain('/brain?scope=team');
    await screen.findByText('Since 30 Sep month-end');
    await settled();
    await userEvent.type(composer(), 'Why?{Enter}');
    expect(await screen.findByText('Answer to: Why?')).toBeInTheDocument();
    expect(asked(copilot)).toEqual([['Why?', { surface: 'brain', scope: 'team', tab: 'changed' }]]);
  });

  it('follows a tab change and a scope change in one rail and one conversation, never remounted', { timeout: 30000 }, async () => {
    const { copilot } = stubBrainAsk();
    renderBrain('/brain?scope=team', { nav: true });
    await screen.findByText('Since 30 Sep month-end');
    await settled();
    await userEvent.type(composer(), 'Why?{Enter}');
    await screen.findByText('Answer to: Why?');
    const before = rail();

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Brain' })).getByRole('link', { name: "What's being done" }));
    await waitFor(() => expect(where()).toBe('/brain/doing?scope=team'));
    await settled();
    await userEvent.type(composer(), 'What first?{Enter}');
    await screen.findByText('Answer to: What first?');

    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await waitFor(() => expect(where()).toBe('/brain/doing?scope=company'));
    await settled();
    await userEvent.type(composer(), 'And the company?{Enter}');
    await screen.findByText('Answer to: And the company?');

    expect(rail()).toBe(before);
    expect(screen.getByText('Answer to: Why?')).toBeInTheDocument();
    expect(asked(copilot)).toEqual([
      ['Why?', { surface: 'brain', scope: 'team', tab: 'changed' }],
      ['What first?', { surface: 'brain', scope: 'team', tab: 'doing' }],
      ['And the company?', { surface: 'brain', scope: 'company', tab: 'doing' }],
    ]);
  });

  it('carries the chip through a tab switch that keeps the same scope, with no "Ask opens once this view loads." flash (fix wave item 2)', async () => {
    stubBrainAsk();
    renderBrain('/brain?scope=team', { nav: true });
    await screen.findByText('Since 30 Sep month-end');
    await settled();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Brain' })).getByRole('link', { name: "What's being done" }));
    await waitFor(() => expect(where()).toBe('/brain/doing?scope=team'));
    // The moment the URL carries the new tab, the chip already reads it:
    // the new page's own scope read is still in flight, but the scope
    // itself hasn't changed, so there is no gap showing ASK_AFTER_SCOPE.
    expect(within(rail()).queryByText(ASK_AFTER_SCOPE)).toBeNull();
    expect(within(rail()).getByText("Brain · What's being done · My team")).toBeInTheDocument();
  });

  it('sends nothing before the scope settles, and the composer says so', async () => {
    const { copilot } = stubBrainAsk({ brain: { failScopes: 1 } });
    renderBrain('/brain');
    expect(await screen.findByText(SAY.LOAD_SCOPES)).toBeInTheDocument();
    expect(within(rail()).getByText(ASK_AFTER_SCOPE)).toBeInTheDocument();
    await userEvent.type(composer(), 'Why?{Enter}');
    expect(postedBodies(copilot)).toEqual([]);
  });

  it('draws one frame, with the rail beside its column', async () => {
    stubBrainAsk();
    renderBrain('/brain?scope=team');
    await screen.findByText('Since 30 Sep month-end');
    expect(document.querySelectorAll('[data-brain-frame]')).toHaveLength(1);
    expect(document.querySelector('[data-brain-frame]')!.nextElementSibling).toContainElement(rail());
  });
});

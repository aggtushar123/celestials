import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { SAY } from '../../../features/brain/brainText';
import { resetViewport } from '../../../test/viewport';
import { renderBrain } from '../testPages';
import { stubBrainAsk } from './testBrainAsk';

// Integration tier: the starters on the real Brain pages (brain ask spec §2.3).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const starters = () => within(rail()).queryByRole('list', { name: 'Suggested questions' });
const texts = (list: HTMLElement) => within(list).getAllByRole('button').map((button) => button.textContent);

describe('Ask on the Brain: the starters', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("offers What changed's three on an empty thread, sends the one pressed, and offers them again on New chat", async () => {
    const { copilot } = stubBrainAsk();
    renderBrain('/brain?scope=team');
    const list = await within(rail()).findByRole('list', { name: 'Suggested questions' });
    expect(texts(list)).toEqual(['Why did these numbers move?', 'Where is the ARR at risk concentrated?', 'What should I watch next?']);
    await userEvent.click(within(list).getByRole('button', { name: 'Where is the ARR at risk concentrated?' }));
    expect(await screen.findByText('Answer to: Where is the ARR at risk concentrated?')).toBeInTheDocument();
    expect(postedBodies(copilot).map((body) => [body.content, body.context])).toEqual([
      ['Where is the ARR at risk concentrated?', { surface: 'brain', scope: 'team', tab: 'changed' }],
    ]);
    expect(starters()).toBeNull();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'New chat' }));
    expect(starters()).not.toBeNull();
  });

  it.each([
    ['/brain/doing?scope=me', ['Which initiatives are off track?', 'Are the plans moving health and ARR?', 'What are the rules doing for this book?']],
    ['/brain/customers?scope=me', ['What are customers asking for most?', 'Who turned negative, and what do they have in common?', 'What do the latest comments say?']],
  ])('offers %s its own three', async (url, expected) => {
    stubBrainAsk();
    renderBrain(url);
    expect(texts(await within(rail()).findByRole('list', { name: 'Suggested questions' }))).toEqual(expected);
  });

  it('offers none before the scope settles, and none off the four tabs', async () => {
    stubBrainAsk({ brain: { failScopes: 1 } });
    const { unmount } = renderBrain('/brain');
    await screen.findByText(SAY.LOAD_SCOPES);
    expect(starters()).toBeNull();
    unmount();
    vi.unstubAllGlobals();
    stubBrainAsk();
    renderBrain('/brain/requests?scope=team');
    await screen.findByRole('group', { name: 'View' });
    expect(starters()).toBeNull();
  });
});

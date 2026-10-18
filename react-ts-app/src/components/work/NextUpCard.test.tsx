import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubFeed } from '../../features/work/testFeed';
import { stubBundles } from '../../features/agents/testBundles';
import { B_PIZZA } from '../../features/agents/testBundleFixtures';
import { QUESTION } from '../../features/work/testFeedFixtures';
import { renderPage } from '../../pages/work/testPages';
import { WORK, doneStatus } from '../../features/work/workText';
import { NextUpCard } from './NextUpCard';

const toast = () => document.querySelector('[data-part="work-toast"]') as HTMLElement;

describe('Next up (spec §5 Copilot; delivery 2 frontend Decision 7)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the first five of decide, overdue and today, with Open Work', async () => {
    const { spy } = stubFeed();
    renderPage(<NextUpCard />, '/copilot');
    const card = await screen.findByRole('region', { name: /Next up/ });
    const list = await within(card).findByRole('list', { name: 'Next up' });
    const rows = within(list).getAllByRole('listitem').filter((li) => li.hasAttribute('data-item'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(within(card).getByRole('link', { name: 'Open Work' })).toHaveAttribute('href', '/work');
    expect(spy.mock.calls.some(([url]) => String(url).includes('/work/feed/?kind=bundle%2Crule_review%2Cquestion%2Cdraft%2Ctask%2Ctodo'))).toBe(true);
  });

  it('lists a bundle first with Review, which opens it on Work', async () => {
    stubBundles();
    renderPage(<NextUpCard />, '/copilot');
    const review = await screen.findByRole('link', { name: `Review ${B_PIZZA.title}` });
    expect(review).toHaveAttribute('href', '/work?queue=mine&bundle=12');
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('data-item', 'bundle:12');
    expect(screen.getByRole('link', { name: 'Open Work' })).toHaveAttribute('href', '/work');
  });

  it('answers a question in place, and the row leaves', async () => {
    stubFeed();
    renderPage(<NextUpCard />, '/copilot');
    const card = await screen.findByRole('region', { name: /Next up/ });
    const row = (await within(card).findAllByRole('listitem')).find((li) => li.getAttribute('data-item')?.startsWith('question:')) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Answer' }));
    await userEvent.click(within(row).getByRole('button', { name: 'Send answer' }));
    expect(within(row).getByText('Write an answer.')).toBeInTheDocument();
    await userEvent.type(within(row).getByRole('textbox'), 'Legal signs off.');
    await userEvent.click(within(row).getByRole('button', { name: 'Send answer' }));
    await waitFor(() => expect(card.querySelector('[data-item^="question:"]')).toBeNull());
    // The toast takes focus, not the body (Chrome test B3).
    await waitFor(() => expect(within(toast()).getByText(/^Answered: /)).toHaveFocus());
    await userEvent.click(within(toast()).getByRole('button', { name: 'Close' }));
    expect(document.activeElement).not.toBe(document.body);
    expect(card.querySelector('li[data-item]')).toContainElement(document.activeElement as HTMLElement);
  });

  it('answers a question with a quiet link to its thread on the organisation', async () => {
    stubFeed({ decide: [QUESTION] });
    renderPage(<NextUpCard />, '/copilot');
    const row = await screen.findByRole('article', { name: QUESTION.title });
    expect(within(row).getByRole('link', { name: 'Open thread' })).toHaveAttribute('href', '/organizations/3?tab=knowledge');
  });

  it('puts focus in the answer box on open, and a second Send after success posts nothing more', async () => {
    const { spy } = stubFeed();
    renderPage(<NextUpCard />, '/copilot');
    const card = await screen.findByRole('region', { name: /Next up/ });
    const row = (await within(card).findAllByRole('listitem')).find((li) => li.getAttribute('data-item')?.startsWith('question:')) as HTMLElement;
    const open = within(row).getByRole('button', { name: 'Answer' });
    expect(open).not.toHaveAttribute('aria-expanded');
    expect(open).not.toHaveAttribute('aria-controls');
    await userEvent.click(open);
    const box = within(row).getByRole('textbox');
    await waitFor(() => expect(box).toHaveFocus());
    await userEvent.type(box, 'Legal signs off.');
    const send = within(row).getByRole('button', { name: 'Send answer' });
    await userEvent.click(send);
    await userEvent.click(send);
    await waitFor(() => expect(card.querySelector('[data-item^="question:"]')).toBeNull());
    const answers = spy.mock.calls.filter(([url, init]) => /\/answer\/?$/.test(String(url)) && (init as RequestInit | undefined)?.method === 'POST');
    expect(answers).toHaveLength(1);
  });

  it('marks a task done in place', async () => {
    stubFeed();
    renderPage(<NextUpCard />, '/copilot');
    const card = await screen.findByRole('region', { name: /Next up/ });
    const done = (await within(card).findAllByRole('button', { name: /^Mark .* done$/ }))[0];
    await userEvent.click(done);
    const title = /^Mark “(.*)” done$/.exec(done.getAttribute('aria-label') ?? '')?.[1] ?? '';
    expect(title).not.toBe('');
    await waitFor(() => expect(within(toast()).getByText(doneStatus(title))).toHaveFocus());
    await userEvent.click(within(toast()).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(toast()).toHaveTextContent(/^Reopened: /));
  });

  it('says the Done sentence My work uses when Done fails', async () => {
    stubFeed();
    renderPage(<NextUpCard />, '/copilot');
    const card = await screen.findByRole('region', { name: /Next up/ });
    const done = (await within(card).findAllByRole('button', { name: /^Mark .* done$/ }))[0];
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', (url: RequestInfo | URL, init?: RequestInit) => (init?.method === 'PATCH' ? Promise.reject(new TypeError('offline')) : real(url, init)));
    await userEvent.click(done);
    await waitFor(() => expect(toast()).toHaveTextContent(WORK.DONE_FAILED));
  });

  it('keeps its own Try again, and says when nothing waits', async () => {
    stubFeed({ failFeed: 1, decide: [], tasks: [], todos: [] });
    renderPage(<NextUpCard />, '/copilot');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing waiting on you.')).toBeInTheDocument();
  });
});

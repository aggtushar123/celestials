import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { taskItem } from '../../features/work/testFeedFixtures';
import { CALL_PIZZA, KICKOFF, QBR_DECK } from '../../features/work/testWorkFixtures';
import { stubFeed } from '../../features/work/testFeed';
import type { FeedGroupKey, FeedItem, FeedPayload } from '../../features/work/workTypes';
import { renderPage } from '../../pages/work/testPages';
import { FeedGroups } from './FeedGroups';

const NONE = () => undefined;
const payload = (items: FeedItem[], count: number, next: string | null): FeedPayload => ({
  groups: [{ key: 'week', count, items, next }],
  hidden: 0,
  failed: [],
});

function groups(data: FeedPayload, paging: Partial<Record<FeedGroupKey, 'busy' | string>>, onMore: () => void = NONE) {
  return (
    <FeedGroups
      data={data}
      slots={[]}
      paging={paging}
      isSm
      me={1}
      pending={new Set()}
      errors={{}}
      onMore={onMore}
      onRetry={NONE}
      handlers={{ onDone: NONE, onSettled: NONE, onGone: NONE, onLost: NONE, onAnswered: NONE }}
    />
  );
}

type Step = { data: FeedPayload; paging: Partial<Record<FeedGroupKey, 'busy' | string>> };
const driver: { advance: (step: Step) => void } = { advance: NONE };

/** The page's side of FeedGroups, driven step by step from the test. */
function Harness({ first, onMore }: { first: Step; onMore?: () => void }) {
  const [step, setStep] = useState(first);
  useEffect(() => {
    driver.advance = setStep;
  }, []);
  return groups(step.data, step.paging, onMore);
}
const mount = (first: Step, onMore = vi.fn()) => renderPage(<Harness first={first} onMore={onMore} />, '/work/mine');
const to = (step: Step) => act(() => driver.advance(step));

describe('FeedGroups: focus after Show more (Chrome test B3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lands on the first row the page brought, by key, even when a shown row left meanwhile', async () => {
    stubFeed();
    const [a, b, c] = [taskItem(CALL_PIZZA), taskItem(QBR_DECK), taskItem(KICKOFF)];
    const onMore = vi.fn();
    mount({ data: payload([a, b], 3, 'n1'), paging: {} }, onMore);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(onMore).toHaveBeenCalledWith('week', 'n1');
    // While the page reads, row a is done and leaves.
    to({ data: payload([b], 2, 'n1'), paging: { week: 'busy' } });
    // The page lands: c is new.
    to({ data: payload([b, c], 2, null), paging: {} });
    const rows = within(screen.getByRole('region', { name: /^This week/ })).getAllByRole('listitem');
    expect(rows[1]).toHaveAttribute('data-item', c.key);
    expect(rows[1]).toHaveFocus();
  });

  it('keeps focus on Show more when the page fails', async () => {
    stubFeed();
    const [a, b] = [taskItem(CALL_PIZZA), taskItem(QBR_DECK)];
    mount({ data: payload([a], 2, 'n1'), paging: {} });
    const more = screen.getByRole('button', { name: 'Show more' });
    await userEvent.click(more);
    to({ data: payload([a], 2, 'n1'), paging: { week: 'busy' } });
    to({ data: payload([a], 2, 'n1'), paging: { week: 'Could not load more. Try again.' } });
    expect(screen.getByRole('button', { name: 'Show more' })).toHaveFocus();
    expect(screen.queryByText(b.title)).toBeNull();
  });

  it('puts focus on the group heading when an empty page takes Show more away', async () => {
    stubFeed();
    const a = taskItem(CALL_PIZZA);
    mount({ data: payload([a], 1, 'n1'), paging: {} });
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    to({ data: payload([a], 1, 'n1'), paging: { week: 'busy' } });
    to({ data: payload([a], 1, null), paging: {} });
    expect(screen.getByRole('heading', { name: /^This week/ })).toHaveFocus();
  });
});

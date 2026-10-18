import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '../../lib/apiClient';
import type { SurfaceContext } from '../../pages/copilot/types';
import { stubCopilot } from './testCopilot';
import { refusalMessage, useCopilotThread } from './useCopilotThread';

const org = (organization: number): SurfaceContext => ({ surface: 'organizations', view: 'detail', organization, account: null, focus: null });
const board = (owner: string): SurfaceContext => ({ surface: 'organizations', view: 'board', filters: { owner }, focus: null });
const brain = (scope: 'me' | 'team' | 'company'): SurfaceContext => ({ surface: 'brain', scope, tab: 'changed' });

function renderThread(context: SurfaceContext) {
  return renderHook(({ context: current }) => useCopilotThread(null, () => {}, current), { initialProps: { context } });
}

describe('useCopilotThread across context changes', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('drops a refusal that lands after the person moved to another organisation', async () => {
    const { release } = stubCopilot({ hold: true, refuse: { organization: ['Not an organisation you can open.'] } });
    const { result, rerender } = renderThread(org(7));
    let sent!: Promise<void>;
    act(() => {
      sent = result.current.send({ text: 'What changed?', content: 'What changed?', context: org(7) });
    });
    expect(result.current.pending).not.toBeNull();
    // The 400 is still on its way when the page becomes organisation 9.
    rerender({ context: org(9) });
    release();
    await act(() => sent);
    expect(result.current.pending).toBeNull();
    expect(result.current.failed).toBeNull();
  });

  it('still shows a refusal that lands on the organisation it was asked on', async () => {
    const { release } = stubCopilot({ hold: true, refuse: { organization: ['Not an organisation you can open.'] } });
    const { result } = renderThread(org(7));
    let sent!: Promise<void>;
    act(() => {
      sent = result.current.send({ text: 'What changed?', content: 'What changed?', context: org(7) });
    });
    release();
    await act(() => sent);
    expect(result.current.failed).toMatchObject({ refused: true, message: 'You can no longer ask about this organization.' });
  });

  it('clears a refusal once the context changes', async () => {
    stubCopilot({ refuse: { organization: ['Not an organisation you can open.'] } });
    const { result, rerender } = renderThread(org(7));
    await act(() => result.current.send({ text: 'What changed?', content: 'What changed?', context: org(7) }));
    expect(result.current.failed?.refused).toBe(true);
    rerender({ context: org(9) });
    expect(result.current.failed).toBeNull();
  });

  it('keeps a retryable failure, its question and Retry, across a filter change', async () => {
    const { spy } = stubCopilot({ statuses: [502] });
    const { result, rerender } = renderThread(board('2'));
    await act(() => result.current.send({ text: 'Who renews first?', content: 'Who renews first?', context: board('2') }));
    expect(result.current.failed).toMatchObject({ text: 'Who renews first?', refused: false, budget: false });
    rerender({ context: board('3') });
    expect(result.current.failed).toMatchObject({ text: 'Who renews first?', refused: false });
    // Retry still resends the question as it was asked.
    await act(async () => result.current.retry());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it('keeps a retryable failure that lands after a filter change', async () => {
    const { release } = stubCopilot({ hold: true, statuses: [502] });
    const { result, rerender } = renderThread(board('2'));
    let sent!: Promise<void>;
    act(() => {
      sent = result.current.send({ text: 'Who renews first?', content: 'Who renews first?', context: board('2') });
    });
    rerender({ context: board('3') });
    release();
    await act(() => sent);
    expect(result.current.failed).toMatchObject({ text: 'Who renews first?', refused: false });
  });

  it('blocks a resend on a Brain scope refusal until the context changes, so it cannot ask the same refused view again', async () => {
    const { spy } = stubCopilot({ refuse: { scope: ["You can't ask about that view."] } });
    const { result, rerender } = renderThread(brain('team'));
    await act(() => result.current.send({ text: 'Why?', content: 'Why?', context: brain('team') }));
    expect(result.current.failed).toMatchObject({ refused: true, text: 'Why?' });
    // Same stale scope: blocked client-side, not sent again.
    await act(() => result.current.send({ text: 'Again?', content: 'Again?', context: brain('team') }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toMatchObject({ text: 'Why?' });
    // The page's own scope settles on something else: the block lifts.
    rerender({ context: brain('company') });
    expect(result.current.failed).toBeNull();
    await act(() => result.current.send({ text: 'Again?', content: 'Again?', context: brain('company') }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current.failed).toBeNull();
  });

  it("keeps the budget message across a filter change: the month's budget is spent on every page", async () => {
    stubCopilot({ statuses: [429] });
    const { result, rerender } = renderThread(board('2'));
    await act(() => result.current.send({ text: 'Who renews first?', content: 'Who renews first?', context: board('2') }));
    rerender({ context: board('3') });
    expect(result.current.failed?.budget).toBe(true);
  });
});

describe('refusalMessage', () => {
  it('reads a Contacts refusal', () => {
    expect(refusalMessage(new ApiError(400, { context: { contact: ['Not a person you can open.'] } }, 'Bad'))).toBe(
      "You can't ask about this person here.",
    );
    expect(refusalMessage(new ApiError(400, { context: { filters: { account: ['Not an account you can open.'] } } }, 'Bad'))).toBe(
      "You can't ask about this list. Clear the filters and ask again.",
    );
  });

  it('reads an Accounts refusal by the context it was asked in', () => {
    const page = { surface: 'accounts', view: 'detail', account: 12, focus: { kind: 'email', id: 141 } } as const;
    const list = { surface: 'accounts', view: 'list', filters: { organisation: '9' } } as const;
    const bad = (context: unknown) => new ApiError(400, { context }, 'Bad');
    expect(refusalMessage(bad({ account: ['Not an account you can open.'] }), page)).toBe('You can no longer ask about this account.');
    expect(refusalMessage(bad({ focus: ['Not a story item you can open.'] }), page)).toBe(
      'You can no longer ask about this item. Ask about the account instead.',
    );
    expect(refusalMessage(bad({ filters: { organisation: ['Not an organisation you can open.'] } }), list)).toBe(
      "You can't ask about this list. Clear the filters and ask again.",
    );
    expect(refusalMessage(new ApiError(500, {}, 'Oops'), page)).toBeNull();
  });

  it("keeps the organisation page's own account refusal, and a Dashboard focus 400 is no refusal", () => {
    const org = { surface: 'organizations', view: 'detail', organization: 7, account: 31, focus: null } as const;
    expect(refusalMessage(new ApiError(400, { context: { account: ['x'] } }, 'Bad'), org)).toBe(
      'You can no longer ask about this account. Choose All and ask again.',
    );
    expect(refusalMessage(new ApiError(400, { context: { account: ['x'] } }, 'Bad'))).toBe(
      'You can no longer ask about this account. Choose All and ask again.',
    );
    expect(refusalMessage(new ApiError(400, { context: { focus: { key: ['Not an item on your list.'] } } }, 'Bad'))).toBeNull();
  });

  it('reads a Pipelines refusal by the item or the list it was asked about', () => {
    const onRisk = { surface: 'pipelines', kind: 'risks', view: 'board', filters: {}, focus: { kind: 'risk', id: 71 } } as const;
    const onDeal = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {}, focus: { kind: 'opportunity', id: 41 } } as const;
    const filtered = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { account: '12' } } as const;
    const bad = (context: unknown) => new ApiError(400, { context }, 'Bad');
    const item = ['Not an opportunity or risk you can open.'];
    expect(refusalMessage(bad({ focus: item }), onRisk)).toBe('You can no longer ask about this risk.');
    expect(refusalMessage(bad({ focus: item }), onDeal)).toBe('You can no longer ask about this opportunity.');
    expect(refusalMessage(bad({ filters: { account: ['Not an account you can open.'] } }), filtered)).toBe(
      "You can't ask about this list. Clear the filters and ask again.",
    );
    expect(refusalMessage(bad({ filters: { organisation: ['Not an organisation you can open.'] } }), filtered)).toBe(
      "You can't ask about this list. Clear the filters and ask again.",
    );
    expect(refusalMessage(new ApiError(500, {}, 'Oops'), onRisk)).toBeNull();
  });

  it('reads a Brain scope refusal as the view having changed, and nothing else on the Brain as a refusal', () => {
    const brain = { surface: 'brain', scope: 'company', tab: 'changed' } as const;
    const bad = (context: unknown) => new ApiError(400, { context }, 'Bad');
    expect(refusalMessage(bad({ scope: ["You can't ask about that view."] }), brain)).toBe('That view changed; ask again.');
    expect(refusalMessage(bad({ tab: ['"nowhere" is not a valid choice.'] }), brain)).toBeNull();
    expect(refusalMessage(new ApiError(503, {}, 'Ask is not set up.'), brain)).toBeNull();
  });
});

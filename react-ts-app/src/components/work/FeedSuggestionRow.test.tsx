import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { suggestionItem } from '../../features/work/testFeedFixtures';
import { MONA, REC_AGENT_NO_RECORD, REC_RENEWAL, REC_TICKETS, refOf } from '../../features/work/testWorkFixtures';
import { sent } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { renderPage } from '../../pages/work/testPages';
import type { RecommendationRow } from '../../features/work/workTypes';
import { FeedRow, type FeedRowProps } from './FeedRow';

// The Assign and Dismiss forms on a suggestion row (spec §5; delivery 2
// Decisions 7, 8, 9), ported from the retired Recommended page's tests.
// The row hands its outcomes up: onSettled when decided, onGone with the
// server's sentence (409), onLost on a 404 or CANT_DECIDE (Decision 6).

const handlers = () => ({ onDone: vi.fn(), onSettled: vi.fn(), onGone: vi.fn(), onLost: vi.fn() });
type Props = FeedRowProps & ReturnType<typeof handlers>;

function renderRow(rec: RecommendationRow = REC_RENEWAL, isSm = true): Props {
  const props = { item: suggestionItem(rec), group: 'suggested', isSm, me: 1, busy: false, error: null, ...handlers() } as Props;
  renderPage(
    <ul>
      <FeedRow {...props} />
    </ul>,
    '/work/mine',
  );
  return props;
}

const row = () => screen.getByRole('article');

async function openAssign() {
  await userEvent.click(within(row()).getByRole('button', { name: 'Assign' }));
  const who = within(row()).getByLabelText('Who does it');
  await waitFor(() => expect(who).toBeEnabled());
  return who;
}

async function openDismiss() {
  await userEvent.click(within(row()).getByRole('button', { name: 'Dismiss' }));
  return within(row()).getByLabelText('Reason');
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetMembersCache();
});

describe('a suggestion row: Assign', () => {
  it('prefills the suggested person, the default due date and title; people who cannot open the record are disabled', async () => {
    stubFeed();
    renderRow();
    const who = await openAssign();
    expect(within(row()).getByRole('button', { name: 'Assign' })).toHaveAttribute('aria-expanded', 'true');
    expect(who).toHaveValue('3');
    expect(within(who).getByRole('option', { name: "Dana CSM · Can't open this organisation" })).toBeDisabled();
    expect(within(row()).getByLabelText('Due date')).toHaveValue('2026-10-09');
    expect(within(row()).getByLabelText('Task title')).toHaveValue("Prepare Pizza Hut's renewal");
  });

  it('does not prefill someone who can no longer open the record, and asks for a person before sending', async () => {
    const { spy } = stubFeed();
    renderRow(REC_TICKETS);
    const who = await openAssign();
    expect(who).toHaveValue('');
    await userEvent.click(within(row()).getByRole('button', { name: 'Assign task' }));
    expect(await within(row()).findByText('Choose who does it.')).toBeInTheDocument();
    expect(sent(spy, 'POST', '/assign/')).toEqual([]);
  });

  it('keeps ASSIGNEE_CANNOT_OPEN under Who does it; CANT_DECIDE stays on the form and the row is lost', async () => {
    stubFeed({ refuseNextDecision: { status: 400, body: { code: 'ASSIGNEE_CANNOT_OPEN', detail: "That person can't open this organisation." } } });
    const props = renderRow();
    await openAssign();
    await userEvent.click(within(row()).getByRole('button', { name: 'Assign task' }));
    expect(await within(row()).findByText("That person can't open this organisation.")).toBeInTheDocument();
    expect(within(row()).getByLabelText('Who does it')).toHaveAttribute('aria-invalid', 'true');
    expect(props.onLost).not.toHaveBeenCalled();
    expect(props.onSettled).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    stubFeed({ refuseNextDecision: { status: 403, body: { code: 'CANT_DECIDE', detail: "You can't decide this recommendation." } } });
    await userEvent.click(within(row()).getByRole('button', { name: 'Assign task' }));
    expect(await within(row()).findByRole('alert')).toHaveTextContent("You can't decide this recommendation.");
    expect(within(row()).getByRole('button', { name: 'Assign task' })).not.toHaveAttribute('aria-disabled');
    expect(props.onLost).toHaveBeenCalledWith(props.item, "You can't decide this any more.");
  });

  it('removes a row someone else decided first, with the server’s own sentence (409)', async () => {
    const { work } = stubFeed();
    const props = renderRow();
    await openAssign();
    const state = work.recommendations.get(5)!;
    state.decided = { ...state.decided, status: 'assigned', decided_by: refOf(MONA), decided_at: '2026-10-07T09:30:00.000000Z', task_id: 77 };
    await userEvent.click(within(row()).getByRole('button', { name: 'Assign task' }));
    await waitFor(() => expect(props.onGone).toHaveBeenCalledWith(props.item, 'Mona Manager already assigned this.'));
    expect(props.onSettled).not.toHaveBeenCalled();
  });

  it('offers Try again when the teammates do not load', async () => {
    stubFeed({ failAssignees: 1 });
    renderRow();
    await userEvent.click(within(row()).getByRole('button', { name: 'Assign' }));
    expect(await within(row()).findByText('Could not load teammates.')).toBeInTheDocument();
    await userEvent.click(within(row()).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(row()).getByLabelText('Who does it')).toHaveValue('3'));
  });

  it('closes on Cancel, focus back on the row’s Add to my work', async () => {
    stubFeed();
    renderRow();
    await openAssign();
    await userEvent.click(within(row()).getByRole('button', { name: 'Cancel' }));
    expect(within(row()).queryByLabelText('Who does it')).toBeNull();
    expect(within(row()).getByRole('button', { name: 'Add to my work' })).toHaveFocus();
  });

  it('does nothing on Cancel while the request is in flight; the outcome shown matches what was actually sent', async () => {
    const { spy } = stubFeed();
    const props = renderRow();
    const who = await openAssign();
    await userEvent.selectOptions(who, '1');
    const original = spy.getMockImplementation()!;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    spy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/work/recommendations/5/assign/') && (init?.method ?? 'GET') === 'POST') await gate;
      return original(input, init);
    });
    await userEvent.click(within(row()).getByRole('button', { name: 'Assign task' }));
    await within(row()).findByRole('button', { name: 'Assigning…' });
    await userEvent.click(within(row()).getByRole('button', { name: 'Cancel' }));
    expect(within(row()).getByLabelText('Who does it')).toBeInTheDocument();
    expect(within(row()).getByRole('button', { name: 'Assigning…' })).toBeInTheDocument();
    expect(props.onSettled).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(props.onSettled).toHaveBeenCalledTimes(1));
    expect(props.onSettled.mock.calls[0][1].text).toBe("Assigned to you: Prepare Pizza Hut's renewal.");
    expect(sent(spy, 'POST', '/work/recommendations/5/assign/')).toEqual([{ assignee_id: 1, due_date: '2026-10-09', title: "Prepare Pizza Hut's renewal" }]);
  });
});

describe('a suggestion row: Dismiss', () => {
  it('asks for a reason first, then dismisses once', async () => {
    const { spy } = stubFeed();
    const props = renderRow(REC_TICKETS);
    const reason = await openDismiss();
    expect(within(row()).getByRole('button', { name: 'Dismiss' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(reason).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a reason', 'Already handled', 'Not relevant', 'Wrong person', 'Other']);
    await userEvent.click(within(row()).getByRole('button', { name: 'Dismiss it' }));
    expect(await within(row()).findByText('Choose a reason.')).toBeInTheDocument();
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([]);
    await userEvent.selectOptions(reason, 'not_relevant');
    await userEvent.dblClick(within(row()).getByRole('button', { name: 'Dismiss it' }));
    await waitFor(() => expect(props.onSettled).toHaveBeenCalledWith(props.item, { text: "Dismissed: Get Uber EMEA's urgent tickets moving." }));
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'not_relevant' }]);
  });

  it('asks Other to say why, and sends the note', async () => {
    const { spy } = stubFeed();
    const props = renderRow(REC_TICKETS);
    const reason = await openDismiss();
    await userEvent.selectOptions(reason, 'other');
    await userEvent.click(within(row()).getByRole('button', { name: 'Dismiss it' }));
    expect(await within(row()).findByText('Say why.')).toBeInTheDocument();
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([]);
    await userEvent.type(within(row()).getByLabelText('Say why'), 'Handled by phone');
    await userEvent.click(within(row()).getByRole('button', { name: 'Dismiss it' }));
    await waitFor(() => expect(props.onSettled).toHaveBeenCalledTimes(1));
    expect(sent(spy, 'POST', '/dismiss/')).toEqual([{ reason: 'other', note: 'Handled by phone' }]);
  });

  it('keeps CANT_DECIDE on the form, and the row is lost', async () => {
    stubFeed({ refuseNextDecision: { status: 403, body: { code: 'CANT_DECIDE', detail: "You can't decide this recommendation." } } });
    const props = renderRow();
    const reason = await openDismiss();
    await userEvent.selectOptions(reason, 'not_relevant');
    await userEvent.click(within(row()).getByRole('button', { name: 'Dismiss it' }));
    expect(await within(row()).findByRole('alert')).toHaveTextContent("You can't decide this recommendation.");
    expect(props.onLost).toHaveBeenCalledWith(props.item, "You can't decide this any more.");
  });

  it('hands up a row that expired before the decision (409)', async () => {
    const { work } = stubFeed();
    const props = renderRow();
    const reason = await openDismiss();
    const state = work.recommendations.get(5)!;
    state.decided = { ...state.decided, status: 'expired', decided_at: '2026-10-07T09:30:00.000000Z' };
    await userEvent.selectOptions(reason, 'already_handled');
    await userEvent.click(within(row()).getByRole('button', { name: 'Dismiss it' }));
    await waitFor(() => expect(props.onGone).toHaveBeenCalledWith(props.item, 'This recommendation has expired.'));
  });

  it('opens one form at a time; Cancel puts focus back on the row’s Add to my work', async () => {
    stubFeed();
    renderRow();
    await openDismiss();
    await userEvent.click(within(row()).getByRole('button', { name: 'Assign' }));
    expect(within(row()).queryByLabelText('Reason')).toBeNull();
    expect(within(row()).getByLabelText('Who does it')).toBeInTheDocument();
    await userEvent.click(within(row()).getByRole('button', { name: 'Dismiss' }));
    expect(within(row()).queryByLabelText('Who does it')).toBeNull();
    await userEvent.click(within(row()).getByRole('button', { name: 'Cancel' }));
    expect(within(row()).queryByLabelText('Reason')).toBeNull();
    expect(within(row()).getByRole('button', { name: 'Add to my work' })).toHaveFocus();
  });
});

describe('a suggestion row: focus', () => {
  it('without Add to my work, Cancel puts focus back on the Dismiss that opened the form', async () => {
    stubFeed();
    renderRow(REC_AGENT_NO_RECORD);
    expect(within(row()).queryByRole('button', { name: 'Add to my work' })).toBeNull();
    await openDismiss();
    await userEvent.click(within(row()).getByRole('button', { name: 'Cancel' }));
    expect(within(row()).getByRole('button', { name: 'Dismiss' })).toHaveFocus();
  });

  it('on a phone without Add to my work, Cancel puts focus back on the row menu', async () => {
    stubFeed();
    renderRow(REC_AGENT_NO_RECORD, false);
    await userEvent.click(within(row()).getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Dismiss' }));
    await userEvent.click(within(row()).getByRole('button', { name: 'Cancel' }));
    expect(within(row()).getByRole('button', { name: 'More actions' })).toHaveFocus();
  });

  it('keeps Add to my work focusable and aria-disabled while it sends, sends once, and keeps focus on a refusal', async () => {
    const { spy } = stubFeed({ refuseNextDecision: { status: 400, body: { detail: 'Not now.' } } });
    const props = renderRow();
    const original = spy.getMockImplementation()!;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    spy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/assign/') && (init?.method ?? 'GET') === 'POST') await gate;
      return original(input, init);
    });
    const add = within(row()).getByRole('button', { name: 'Add to my work' });
    add.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(add).toHaveAttribute('aria-disabled', 'true'));
    expect(add).not.toBeDisabled();
    expect(add).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    release();
    expect(await within(row()).findByText('Not now.')).toBeInTheDocument();
    expect(add).toHaveFocus();
    expect(add).not.toHaveAttribute('aria-disabled');
    expect(spy.mock.calls.filter(([input, init]) => String(input).includes('/assign/') && init?.method === 'POST')).toHaveLength(1);
    expect(props.onSettled).not.toHaveBeenCalled();
  });
});


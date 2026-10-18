import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACT_APPLIED_AUTO, ACT_DRAFT_REPLY, ACT_SEGMENT_CREATE, BUILT_SEGMENT_ID } from '../../features/agents/testAgentsFixtures';
import { stubAgents } from '../../features/agents/testAgents';
import { UndoAction } from './UndoAction';
import { taskChanged } from '../work/taskChanges';

vi.mock('../work/taskChanges', () => ({ recommendationsChanged: vi.fn(), taskChanged: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(taskChanged).mockClear();
});

describe('UndoAction (Decision 11)', () => {
  it('undoes and hands up the answer', async () => {
    stubAgents();
    const onUndone = vi.fn();
    render(<UndoAction action={ACT_APPLIED_AUTO} onUndone={onUndone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(onUndone).toHaveBeenCalled());
    expect(onUndone.mock.calls[0][0].status).toBe('undone');
    expect(onUndone.mock.calls[0][1]).toBe(`Undone: ${ACT_APPLIED_AUTO.title}.`);
  });

  it('catches up when someone else undid it first (409 ALREADY_DECIDED with the action)', async () => {
    const undone = { ...ACT_APPLIED_AUTO, status: 'undone' as const, undo: null, undone_by: { id: 2, name: 'Mona Manager' } };
    stubAgents({ refuseNextDecision: { status: 409, body: { code: 'ALREADY_DECIDED', detail: 'Mona Manager already undid this.', action: undone } } });
    const onUndone = vi.fn();
    render(<UndoAction action={ACT_APPLIED_AUTO} onUndone={onUndone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith(undone, 'Mona Manager already undid this.'));
    expect(taskChanged).toHaveBeenCalled();
  });

  it('shows CHANGED_SINCE in the server words with both values in tabular figures', async () => {
    stubAgents({ changedSince: [ACT_APPLIED_AUTO.id] });
    render(<UndoAction action={ACT_APPLIED_AUTO} onUndone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Lifecycle stage has changed since: it is now Churn.');
    expect(alert).toHaveTextContent('Now: Churn · Agent set: Renewal');
    expect(alert.querySelectorAll('.tabular-nums')).toHaveLength(2);
  });

  it('shows the reason instead of the button when Undo is not allowed', () => {
    render(<UndoAction action={{ ...ACT_APPLIED_AUTO, undo: { allowed: false, until: '2026-10-15T00:42:00Z', reason: 'expired' } }} onUndone={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByText('Undo was available for 7 days.')).toBeInTheDocument();
  });

  it('shows nothing for an action that is not applied', () => {
    const { container } = render(<UndoAction action={{ ...ACT_APPLIED_AUTO, status: 'rejected', undo: null }} onUndone={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('UndoAction refusals stay on the row', () => {
  const refuse = async (status: number, body: unknown) => {
    stubAgents({ refuseNextDecision: { status, body } });
    const onUndone = vi.fn();
    render(<UndoAction action={ACT_APPLIED_AUTO} onUndone={onUndone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    return { onUndone, alert: await screen.findByRole('alert') };
  };

  it('410 UNDO_EXPIRED', async () => {
    const { onUndone, alert } = await refuse(410, { code: 'UNDO_EXPIRED', detail: 'Undo was available for 7 days.' });
    expect(alert).toHaveTextContent('Undo was available for 7 days.');
    expect(onUndone).not.toHaveBeenCalled();
  });

  it('409 NOT_APPLIED', async () => {
    const { onUndone, alert } = await refuse(409, { code: 'NOT_APPLIED', detail: 'Only an applied action can be undone.' });
    expect(alert).toHaveTextContent('Only an applied action can be undone.');
    expect(onUndone).not.toHaveBeenCalled();
  });

  it('403 CANT_DECIDE', async () => {
    const { onUndone, alert } = await refuse(403, { code: 'CANT_DECIDE', detail: "You can't decide this action." });
    expect(alert).toHaveTextContent("You can't decide this action.");
    expect(alert).toHaveFocus();
    expect(onUndone).not.toHaveBeenCalled();
  });

  it('409 ALREADY_DECIDED without an action stays on the row', async () => {
    const { onUndone, alert } = await refuse(409, { code: 'ALREADY_DECIDED', detail: 'Mona Manager already undid this.' });
    expect(alert).toHaveTextContent('Mona Manager already undid this.');
    expect(onUndone).not.toHaveBeenCalled();
  });

  it('renders nothing when Undo is not allowed and no reason is sent', () => {
    const { container } = render(<UndoAction action={{ ...ACT_APPLIED_AUTO, undo: { allowed: false, until: '2026-10-15T00:42:00Z', reason: null } }} onUndone={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a sent draft refusal as the server sentence alone', async () => {
    stubAgents({ actions: [ACT_DRAFT_REPLY], draftSent: () => true });
    render(<UndoAction action={ACT_DRAFT_REPLY} onUndone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^This draft has been sent\.$/);
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('shows a builder undo refusal as the server sentence alone (Agents delivery 3)', async () => {
    const applied = {
      ...ACT_SEGMENT_CREATE,
      status: 'applied' as const,
      decided_by: { id: 1, name: 'Alice' },
      applied_at: '2026-10-08T09:10:00Z',
      undo: { allowed: true, until: '2026-10-15T09:10:00Z', reason: null },
      result: { ...ACT_SEGMENT_CREATE.result, segment_id: BUILT_SEGMENT_ID },
    };
    stubAgents({
      actions: [applied],
      refuseNextDecision: { status: 409, body: { code: 'CHANGED_SINCE', detail: 'A scenario, campaign or survey uses this segment now.' } },
    });
    render(<UndoAction action={applied} onUndone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^A scenario, campaign or survey uses this segment now\.$/);
    await waitFor(() => expect(alert).toHaveFocus());
  });
});

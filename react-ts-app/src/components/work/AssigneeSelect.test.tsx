import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { assigneeOptions } from '../../features/work/assignees';
import { calls, stubWork } from '../../features/work/testWork';
import { ASSIGNEES } from '../../features/work/testWorkFixtures';
import { AssigneeSelect } from './AssigneeSelect';
import { useAssignees } from './useAssignees';

describe('useAssignees', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the picker for the record, and again for another one', async () => {
    const { spy } = stubWork();
    const { result, rerender } = renderHook(({ parent }) => useAssignees(parent), {
      initialProps: { parent: { kind: 'customer' as const, id: 7 } as { kind: 'customer' | 'account'; id: number } | null },
    });
    expect(result.current).toEqual({ people: null, error: null, retry: expect.any(Function) });
    await waitFor(() => expect(result.current.people).toEqual(ASSIGNEES));
    rerender({ parent: { kind: 'account', id: 9 } });
    expect(result.current.people).toBeNull();
    await waitFor(() => expect(result.current.people).toEqual(ASSIGNEES));
    expect(calls(spy, 'GET', '/work/assignees/')).toEqual(['/work/assignees/?customer=7', '/work/assignees/?account=9']);
  });

  it('reads nothing without a record, and says so when the read fails', async () => {
    const { spy } = stubWork({ failAssignees: 1 });
    const none = renderHook(() => useAssignees(null));
    expect(none.result.current).toEqual({ people: null, error: null, retry: expect.any(Function) });
    const { result } = renderHook(() => useAssignees({ kind: 'customer', id: 7 }));
    await waitFor(() => expect(result.current.error).toBe('Down.'));
    expect(calls(spy, 'GET', '/work/assignees/')).toHaveLength(1);
  });
});

describe('AssigneeSelect', () => {
  it('disables who can’t open the record, and answers a number', async () => {
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="who">Assignee</label>
        <AssigneeSelect id="who" value={1} options={assigneeOptions(ASSIGNEES, 'customer')} onChange={onChange} />
      </>,
    );
    const select = screen.getByLabelText('Assignee');
    expect(screen.getByRole('option', { name: "Dana CSM · Can't open this organisation" })).toBeDisabled();
    await userEvent.selectOptions(select, '3');
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('offers "Assign to me" on a New task form, answering null for it', async () => {
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="who">Assignee</label>
        <AssigneeSelect id="who" value={3} options={assigneeOptions(ASSIGNEES, 'customer')} onChange={onChange} meOption size="form" />
      </>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '');
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

import { describe, expect, it } from 'vitest';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlanRow } from '../../features/plans/planTypes';
import { NextDue, PendingTasks, ProgressBar, StatusPill } from './parts';
import { PlanRowItem } from './PlanRowItem';
import { useSubmitOnce } from './useSubmitOnce';

const ROW: PlanRow = {
  id: 42, name: 'Save plan · Initech APAC', kind: 'save', status: 'at_risk', record: { kind: 'account', id: 14, name: 'Initech APAC' },
  owner: { id: 5, name: 'Dana CSM' }, start_date: '2026-09-01', target_date: '2026-10-01', milestones_done: 1, milestones_total: 3,
  tasks_done: 1, tasks_total: 3, next_due: '2026-09-15', is_overdue: true, can_edit: false,
  pending_tasks: 0, started_by_agent: null,
};

describe('plan row parts', () => {
  it('shows a status as a word in a badge, toned only for on track and at risk', () => {
    const { container, rerender } = render(<StatusPill status="at_risk" />);
    const pill = container.querySelector('[data-status="at_risk"]') as HTMLElement;
    expect(pill).toHaveTextContent('At risk');
    expect(pill.querySelector('svg')).toBeNull();
    expect(pill.querySelector('.rounded-full')).toHaveClass('text-warning-ink');
    rerender(<StatusPill status="on_track" />);
    expect(container.querySelector('[data-status="on_track"] .rounded-full')).toHaveClass('text-success-ink');
    rerender(<StatusPill status="done" />);
    expect(container.querySelector('[data-status="done"] .rounded-full')).toHaveClass('text-ink-muted');
  });

  it('reads progress as figures in tabular figures, with words for screen readers', () => {
    const { container } = render(<ProgressBar done={3} total={5} label="milestones" />);
    expect(container.querySelector('.tabular-nums')).toHaveTextContent('3/5');
    expect(container).toHaveTextContent('3/5 milestones done');
  });

  it('marks an overdue date with the word, an icon and the danger colour', () => {
    const { container, rerender } = render(<NextDue date="2026-09-15" overdue />);
    const due = container.firstElementChild as HTMLElement;
    expect(due).toHaveTextContent('Overdue · 15 Sep');
    expect(due).toHaveClass('text-danger-ink');
    expect(due.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(due.querySelector('.tabular-nums')).toHaveTextContent('15 Sep');
    rerender(<NextDue date="2026-10-20" overdue={false} />);
    expect(container.firstElementChild).toHaveTextContent('Next 20 Oct');
    rerender(<NextDue date={null} overdue={false} />);
    expect(container.firstElementChild).toHaveTextContent('Nothing left to do');
  });

  it('lays a plan out as one row: its page, its record, kind, owner, progress, due and status', () => {
    render(
      <MemoryRouter>
        <ul>
          <PlanRowItem row={ROW} />
        </ul>
      </MemoryRouter>,
    );
    const row = document.querySelector('[data-plan="42"]') as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Save plan · Initech APAC' })).toHaveAttribute('href', '/projects/42');
    expect(within(row).getByRole('link', { name: 'Initech APAC' })).toHaveAttribute('href', '/accounts/14');
    expect(row).toHaveTextContent('Save');
    expect(row).toHaveTextContent('Dana CSM');
    expect(row).toHaveTextContent('1/3');
    expect(row).toHaveTextContent('Overdue');
    expect(row.querySelector('[data-status="at_risk"]')).not.toBeNull();
    expect(row.tagName).toBe('LI');
  });

  it('leaves the record out, when asked', () => {
    render(
      <MemoryRouter>
        <ul>
          <PlanRowItem row={ROW} showRecord={false} />
        </ul>
      </MemoryRouter>,
    );
    const row = document.querySelector('[data-plan="42"]') as HTMLElement;
    expect(within(row).queryByRole('link', { name: 'Initech APAC' })).toBeNull();
  });

  it('draws Draft as its own pill, and a Draft shows what Start plan will make', () => {
    render(<StatusPill status="draft" />);
    const pill = document.querySelector('[data-status="draft"]') as HTMLElement;
    expect(pill).toHaveTextContent('Draft');
    expect(pill.querySelector('svg')).toBeNull();
    expect(pill.querySelector('.rounded-full')).toHaveClass('text-ink-muted');
    render(<PendingTasks n={9} />);
    expect(screen.getByText('tasks to start')).toHaveTextContent('9 tasks to start');
    expect(screen.getByText('9')).toHaveClass('tabular-nums');
  });
});

describe('useSubmitOnce', () => {
  it('runs one write however often it is asked for while it runs', async () => {
    let calls = 0;
    let finish: (value: string) => void = () => {};
    const work = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    };
    const { result } = renderHook(() => useSubmitOnce());
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current.run(work);
      second = await result.current.run(work);
    });
    expect(second).toBeNull();
    expect(calls).toBe(1);
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish('done');
      await first;
    });
    expect(await first).toEqual({ ok: true, value: 'done' });
    expect(result.current.busy).toBe(false);
  });

  it('with holdOnSuccess, stays latched after a success until released', async () => {
    let calls = 0;
    const work = async () => {
      calls += 1;
      return 'made';
    };
    const { result } = renderHook(() => useSubmitOnce({ holdOnSuccess: true }));
    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = await result.current.run(work);
      // A second click landing after the first settled, before the page moved on.
      second = await result.current.run(work);
    });
    expect(first).toEqual({ ok: true, value: 'made' });
    expect(second).toBeNull();
    expect(calls).toBe(1);
    expect(result.current.busy).toBe(false);
    act(() => result.current.release());
    await act(async () => {
      await result.current.run(work);
    });
    expect(calls).toBe(2);
  });

  it('with holdOnSuccess, a refusal frees the latch for a retry', async () => {
    let calls = 0;
    const refuse = async () => {
      calls += 1;
      throw new Error('no');
    };
    const { result } = renderHook(() => useSubmitOnce({ holdOnSuccess: true }));
    let first: unknown;
    await act(async () => {
      first = await result.current.run(refuse);
      await result.current.run(refuse);
    });
    expect(first).toMatchObject({ ok: false });
    expect(calls).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import reducer, { addTask } from './tasksSlice';

describe('tasksSlice', () => {
  it('has seeded tasks in the initial state', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.tasks.length).toBeGreaterThan(0);
    expect(state.tasks.every((t) => t.id.startsWith('TASK-'))).toBe(true);
  });

  it('addTask appends a task with a generated TASK- id', () => {
    const initial = reducer(undefined, { type: '@@INIT' });
    const next = reducer(
      initial,
      addTask({
        title: 'Renewal call prep',
        org: 'Apple Inc',
        type: 'org',
        priority: 'High',
        status: 'Open',
        date: 'Mar 1, 2026',
      })
    );

    expect(next.tasks.length).toBe(initial.tasks.length + 1);
    const added = next.tasks[next.tasks.length - 1];
    expect(added.id).toMatch(/^TASK-\d+$/);
    expect(added.title).toBe('Renewal call prep');
    expect(added.status).toBe('Open');
  });
});

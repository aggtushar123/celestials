import { describe, expect, it } from 'vitest';
import { isOverdue } from './rows';
import type { TaskRow } from './workTypes';

const row = (id: number, over: Partial<TaskRow> = {}): TaskRow => ({
  id,
  title: `Task ${id}`,
  due_date: '2026-10-05',
  priority: 'medium',
  status: 'pending',
  blocked_reason: '',
  source: 'manual',
  parent: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  assignee: { id: 1, name: 'Alice', active: true },
  plan: null,
  private: false,
  ...over,
});

describe('rows', () => {
  it('is overdue when past due and not Blocked (backend Decision 8)', () => {
    expect(isOverdue(row(1), '2026-10-07')).toBe(true);
    expect(isOverdue(row(1, { due_date: '2026-10-07' }), '2026-10-07')).toBe(false);
    expect(isOverdue(row(1, { status: 'blocked' }), '2026-10-07')).toBe(false);
  });
});

it('never calls a dateless to-do overdue', () => {
  expect(isOverdue({ status: 'pending', due_date: null }, '2026-10-07')).toBe(false);
});

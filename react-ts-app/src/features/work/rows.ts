import type { TaskRow } from './workTypes';

/** Past due and not Blocked, as everywhere in Work (backend Decision 8). A dateless to-do is never overdue. */
export function isOverdue(row: Pick<TaskRow, 'status' | 'due_date'>, today: string): boolean {
  return row.status !== 'blocked' && row.due_date !== null && row.due_date < today;
}

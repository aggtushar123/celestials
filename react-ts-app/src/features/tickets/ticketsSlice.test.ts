import { describe, it, expect } from 'vitest';
import reducer, { fetchTicketStats } from './ticketsSlice';
import type { TicketStats } from './ticketsSlice';

// Unit tier: the reducer on synthetic thunk actions.
const stats = (total: number) => ({ kpis: { total } }) as unknown as TicketStats;

describe('ticketsSlice', () => {
  it('ignores an older response that lands after a newer request', () => {
    let state = reducer(undefined, fetchTicketStats.pending('old', 'owner=1'));
    state = reducer(state, fetchTicketStats.pending('new', 'owner=2'));
    state = reducer(state, fetchTicketStats.fulfilled(stats(2), 'new', 'owner=2'));
    state = reducer(state, fetchTicketStats.fulfilled(stats(1), 'old', 'owner=1'));
    expect(state.stats?.kpis.total).toBe(2);
    expect(state.statsQuery).toBe('owner=2');
    expect(state.statsLoading).toBe(false);
  });

  it('ignores a late failure from a superseded request', () => {
    let state = reducer(undefined, fetchTicketStats.pending('old', 'owner=1'));
    state = reducer(state, fetchTicketStats.pending('new', 'owner=2'));
    state = reducer(state, fetchTicketStats.rejected(null, 'old', 'owner=1', 'boom'));
    expect(state.statsError).toBeNull();
    expect(state.statsLoading).toBe(true);
  });
});

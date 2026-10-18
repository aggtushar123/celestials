import { describe, it, expect } from 'vitest';
import reducer, { fetchForecast } from './forecastSlice';
import type { ForecastStats } from './forecastSlice';

// Unit tier: the reducer on synthetic thunk actions.
const stats = (opening: number) => ({ bridge: { opening_arr: opening } }) as unknown as ForecastStats;

describe('forecastSlice', () => {
  it('ignores an older response that lands after a newer request', () => {
    let state = reducer(undefined, fetchForecast.pending('old', 'owner=1'));
    state = reducer(state, fetchForecast.pending('new', 'owner=2'));
    state = reducer(state, fetchForecast.fulfilled(stats(2), 'new', 'owner=2'));
    state = reducer(state, fetchForecast.fulfilled(stats(1), 'old', 'owner=1'));
    expect(state.stats?.bridge.opening_arr).toBe(2);
    expect(state.query).toBe('owner=2');
    expect(state.isLoading).toBe(false);
  });

  it('ignores a late failure from a superseded request', () => {
    let state = reducer(undefined, fetchForecast.pending('old', 'owner=1'));
    state = reducer(state, fetchForecast.pending('new', 'owner=2'));
    state = reducer(state, fetchForecast.rejected(null, 'old', 'owner=1', 'boom'));
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(true);
  });

  it('records the query its stats answer', () => {
    let state = reducer(undefined, fetchForecast.pending('a', undefined));
    state = reducer(state, fetchForecast.fulfilled(stats(5), 'a', undefined));
    expect(state.query).toBe('');
  });
});

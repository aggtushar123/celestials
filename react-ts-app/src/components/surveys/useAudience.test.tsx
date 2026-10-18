import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '../../lib/apiClient';
import * as api from '../../features/surveys/surveyApi';
import type { AudienceCounts, AudienceRequest } from '../../features/surveys/surveyTypes';
import { AUDIENCE_DEBOUNCE_MS, useAudience } from './useAudience';

vi.mock('../../features/surveys/surveyApi');

// For the unmount test only: React silently no-ops a setState call made on an
// already-unmounted function component (no warning, no re-render), so the
// only way to prove the hook never *calls* its setters once unmounted is to
// count calls to the setter itself, beneath React's own bailout. A thin
// passthrough wrapper around useState does that without changing behaviour
// (mirrors src/components/segments/usePreview.test.tsx).
const stateSetterCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <S,>(initial: S | (() => S)) => {
      const [state, setState] = actual.useState(initial);
      const counted = (value: S | ((prev: S) => S)) => {
        stateSetterCalls.count += 1;
        setState(value);
      };
      return [state, counted] as const;
    },
  };
});

const request = (roles: AudienceRequest['roles'], segment = 7): AudienceRequest => ({ segment, roles });
const counts = (audience: number): AudienceCounts => ({ audience, organisations: 1, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 });

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useAudience (spec §2.2: 400 ms after the last change, latest wins)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(api.fetchAudience).mockReset();
    stateSetterCalls.count = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('asks nothing until there is something to count', async () => {
    const { result } = renderHook(() => useAudience(null));
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS * 2);
    });
    expect(result.current).toEqual({ status: 'incomplete' });
    expect(api.fetchAudience).not.toHaveBeenCalled();
  });

  it('asks once, 400 ms after the last change, with the last roles', async () => {
    vi.mocked(api.fetchAudience).mockResolvedValue(counts(42));
    const { result, rerender } = renderHook(({ r }) => useAudience(r), { initialProps: { r: request(['champion']) } });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS - 1);
    });
    rerender({ r: request(['champion', 'decision_maker']) });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    expect(api.fetchAudience).toHaveBeenCalledTimes(1);
    expect(api.fetchAudience).toHaveBeenCalledWith(request(['champion', 'decision_maker']));
    expect(result.current).toEqual({ status: 'ready', data: counts(42) });
  });

  it('drops an answer a newer request superseded, keeping the last good count meanwhile', async () => {
    const stale = deferred<AudienceCounts>();
    const latest = deferred<AudienceCounts>();
    vi.mocked(api.fetchAudience).mockResolvedValueOnce(counts(10)).mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise);
    const { result, rerender } = renderHook(({ r }) => useAudience(r), { initialProps: { r: request(['champion']) } });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    expect(result.current).toEqual({ status: 'ready', data: counts(10) });
    rerender({ r: request(['decision_maker']) });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    rerender({ r: request(['influencer']) });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    await act(async () => {
      stale.resolve(counts(20));
    });
    expect(result.current).toEqual({ status: 'loading', last: counts(10) });
    await act(async () => {
      latest.resolve(counts(30));
    });
    expect(result.current).toEqual({ status: 'ready', data: counts(30) });
  });

  it("shows a refusal's own words", async () => {
    vi.mocked(api.fetchAudience).mockRejectedValue(new ApiError(403, { detail: 'You can only survey your own segments.' }, 'Refused'));
    const { result } = renderHook(() => useAudience(request(['champion'])));
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    expect(result.current).toEqual({ status: 'error', message: 'You can only survey your own segments.' });
  });

  it("drops a dimmed count from the segment just left, instead of showing it under the new segment's kind", async () => {
    const first = deferred<AudienceCounts>();
    vi.mocked(api.fetchAudience).mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(({ r }) => useAudience(r), { initialProps: { r: request(['champion'], 7) } });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    await act(async () => {
      first.resolve(counts(41));
    });
    expect(result.current).toEqual({ status: 'ready', data: counts(41) });
    const second = deferred<AudienceCounts>();
    vi.mocked(api.fetchAudience).mockReturnValueOnce(second.promise);
    // A different segment (its kind may differ: an account segment's "41"
    // above would be mislabelled "organisations" if shown dimmed here).
    rerender({ r: request(['champion'], 12) });
    expect(result.current).toEqual({ status: 'loading', last: null });
  });

  it('never sets state once unmounted, even if the in-flight request still resolves', async () => {
    const pending = deferred<AudienceCounts>();
    vi.mocked(api.fetchAudience).mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useAudience(request(['champion'])));
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    const callsBeforeUnmount = stateSetterCalls.count;
    unmount();
    pending.resolve(counts(41));
    await act(async () => {
      await Promise.resolve();
    });
    expect(stateSetterCalls.count).toBe(callsBeforeUnmount);
  });
});

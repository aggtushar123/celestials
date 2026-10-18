// One live pick list (agent bundles D3 contract §5.2; frontend Decision 3). A
// newer request wins: an older answer arriving late is dropped. No em dash.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStepOptions } from '../../features/agents/bundlesApi';
import { listFailed } from '../../features/agents/bundleText';
import type { PickListName, PickOption } from '../../features/agents/bundleTypes';
import { ApiError } from '../../lib/apiClient';

export type PickState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; options: PickOption[]; more: boolean; note: string | null }
  | { status: 'failed'; message: string };

type Settled = Exclude<PickState, { status: 'idle' } | { status: 'loading' }>;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The server's own sentence when it sent one (a 409's or 502's `detail`, a 400's first message). */
function failure(err: unknown, list: PickListName): string {
  if (err instanceof ApiError && isObject(err.body)) {
    if (typeof err.body.detail === 'string') return err.body.detail;
    for (const value of Object.values(err.body)) if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return listFailed(list);
}

export function usePickList({ bundleId, stepId, list, project = '', issueType = '', query = '', live = false, enabled }: { bundleId: number; stepId: number; list: PickListName; project?: string; issueType?: string; query?: string; live?: boolean; enabled: boolean }) {
  const [attempt, setAttempt] = useState(0);
  // The answer is stored with the request it answers; the state is derived, so
  // no setState runs synchronously in the effect (react-hooks lint).
  const key = JSON.stringify([bundleId, stepId, list, project, issueType, query, live, attempt]);
  const [settled, setSettled] = useState<{ key: string; result: Settled } | null>(null);
  const latest = useRef(key);
  useEffect(() => {
    latest.current = key;
    if (!enabled) return;
    let current = true;
    fetchStepOptions(bundleId, stepId, list, { project, issueType, query, live })
      .then((answer) => {
        if (current && latest.current === key) setSettled({ key, result: { status: 'ready', options: answer.options, more: answer.more, note: answer.note ?? null } });
      })
      .catch((err: unknown) => {
        if (current && latest.current === key) setSettled({ key, result: { status: 'failed', message: failure(err, list) } });
      });
    return () => {
      current = false;
    };
  }, [bundleId, stepId, list, project, issueType, query, live, enabled, key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: PickState = !enabled ? { status: 'idle' } : settled && settled.key === key ? settled.result : { status: 'loading' };
  return { state, retry };
}

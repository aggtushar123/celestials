import { useEffect, useState } from 'react';
import { useCapability } from '../../hooks';
import type { UserFunction } from '../../features/auth/authSlice';
import { fetchFunctionHeads, HEADS, setFunctionHead, type FunctionHeadRow } from '../../features/knowledge/functionHeads';
import type { Member } from '../../features/userManagement/userManagementSlice';
import { ApiError } from '../../lib/apiClient';
import { ErrorState, LoadingState, Select, SettingsRow, SettingsSection, useInstantSave } from '../../components/ui';

/** Settings › People & teams › Department heads (Slack escalations D2, spec
 *  §4.4): one head per function, chosen from that function's active
 *  members, saved on change with Undo. Changing needs manage_org_settings
 *  (the server checks it too); everyone who reaches the page reads it.
 *  No em dash. */
export function DepartmentHeadsSection({ members, membersLoading = false }: { members: Member[]; membersLoading?: boolean }) {
  const canEdit = useCapability('manage_org_settings');
  const instant = useInstantSave();
  const [rows, setRows] = useState<FunctionHeadRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<UserFunction, string>>>({});

  useEffect(() => {
    let alive = true;
    fetchFunctionHeads().then(
      (answer) => {
        if (alive) setRows(answer);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  function change(fn: UserFunction, value: string) {
    const current = rows?.find((row) => row.function === fn)?.user?.id ?? null;
    const next = value ? Number(value) : null;
    if (next === current) return;
    setErrors((now) => ({ ...now, [fn]: undefined }));
    void instant.run({
      key: fn,
      request: () => setFunctionHead(fn, next),
      onSaved: setRows,
      undo: () => setFunctionHead(fn, current),
      onUndone: setRows,
      onError: (err) => setErrors((now) => ({ ...now, [fn]: err instanceof ApiError ? err.message : HEADS.SAVE })),
    });
  }

  const state = failed ? (
    <ErrorState
      message={HEADS.LOAD}
      onRetry={() => {
        setFailed(false);
        setAttempt((n) => n + 1);
      }}
    />
  ) : rows === null || membersLoading ? (
    <LoadingState label={HEADS.LOADING} count={6} />
  ) : undefined;

  return (
    <SettingsSection look="card" title={HEADS.TITLE} description={canEdit ? HEADS.INTRO : `${HEADS.INTRO} ${HEADS.READ_ONLY}`} state={state}>
      {(rows ?? []).map((row) => {
        const id = `head-${row.function}`;
        const hintId = `${id}-hint`;
        const errorId = `${id}-error`;
        const people = members.filter((m) => m.is_active && m.function === row.function);
        const hint = people.length === 0 && !row.user ? HEADS.noMembers(row.function_display) : undefined;
        const error = errors[row.function];
        const options = [{ value: '', label: HEADS.NOBODY }, ...people.map((m) => ({ value: String(m.id), label: m.name }))];
        if (row.user && !people.some((m) => m.id === row.user?.id)) options.splice(1, 0, { value: String(row.user.id), label: row.user.name });
        return (
          <SettingsRow key={row.function} label={row.function_display} htmlFor={id} hint={hint} hintId={hint ? hintId : undefined} error={error} errorId={errorId}>
            <Select
              id={id}
              label={row.function_display}
              labelPosition="external"
              value={row.user ? String(row.user.id) : ''}
              disabled={!canEdit || (instant.busyKey !== null && instant.busyKey !== row.function)}
              invalid={Boolean(error)}
              describedBy={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
              onChange={(value) => change(row.function, value)}
              options={options}
              className="sm:w-64"
            />
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}

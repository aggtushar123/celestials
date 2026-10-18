import { useEffect, useId, useState } from 'react';
import { useAppDispatch, useAppSelector, useCapability } from '../../../hooks';
import { FUNCTION_LABELS, type UserFunction } from '../../../features/auth/authSlice';
import { fetchResponsible, setResponsible } from '../../../features/knowledge/knowledgeSlice';
import { fetchFunctionHeads, teamLine, TEAM, type FunctionHeadRow } from '../../../features/knowledge/functionHeads';
import { useMembers } from '../../../features/knowledge/useMembers';
import { Card, CardHeader, ErrorState, FIELD_ERROR, LoadingState, Select, TYPE } from '../../ui';

const FUNCTIONS = Object.keys(FUNCTION_LABELS) as UserFunction[];

/** The account team (Slack escalations D2, spec §4.4): who handles this
 *  customer in each department, Customer Success being the owner. An empty
 *  row says who takes it instead: the department head, or nobody. People
 *  with view-all-accounts change it here (the existing /responsible/ rule);
 *  the Knowledge tab keeps its own pickers on the same slice. No em dash. */
export function AccountTeamCard({ customerId, customerName }: { customerId: number; customerName: string }) {
  const headingId = useId();
  const dispatch = useAppDispatch();
  const canAssign = useCapability('view_all_accounts');
  const responsible = useAppSelector((s) => s.knowledge.responsible[customerId]);
  const owner = useAppSelector((s) => s.knowledge.accountOwner[customerId] ?? null);
  const members = useMembers();
  const [heads, setHeads] = useState<FunctionHeadRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<UserFunction | null>(null);
  const metaId = `${headingId}-meta`;
  const [errors, setErrors] = useState<Partial<Record<UserFunction, string>>>({});

  useEffect(() => {
    let alive = true;
    dispatch(fetchResponsible(customerId)).then((result) => {
      if (alive && fetchResponsible.rejected.match(result)) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [dispatch, customerId, attempt]);

  useEffect(() => {
    let alive = true;
    fetchFunctionHeads().then(
      (rows) => {
        if (alive) setHeads(rows);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  const personFor = (fn: UserFunction) =>
    fn === 'cs' ? (owner ? { id: owner.id, name: owner.name } : null) : (responsible?.find((r) => r.function === fn)?.user ?? null);
  const headFor = (fn: UserFunction) => (heads === null ? undefined : (heads.find((h) => h.function === fn)?.user ?? null));

  async function choose(fn: UserFunction, value: string) {
    if (busy !== null) return;
    setBusy(fn);
    setErrors((now) => ({ ...now, [fn]: undefined }));
    const result = await dispatch(setResponsible({ customerId, function: fn, user_id: value ? Number(value) : null }));
    if (setResponsible.rejected.match(result)) setErrors((now) => ({ ...now, [fn]: result.payload ?? TEAM.SAVE }));
    setBusy(null);
  }

  return (
    <Card as="section" pad="none" aria-labelledby={headingId} aria-describedby={metaId}>
      <CardHeader id={headingId} title={TEAM.TITLE} />
      <p id={metaId} className={`px-4 pb-3 ${TYPE.meta}`}>
        {TEAM.meta(customerName)}
      </p>
      {failed ? (
        <ErrorState
          message={TEAM.LOAD}
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : responsible === undefined ? (
        <LoadingState label={TEAM.LOADING} count={6} />
      ) : (
        <ul role="list" aria-label={TEAM.TITLE} className="divide-y divide-line-subtle border-t border-line-subtle">
          {FUNCTIONS.map((fn) => {
            const label = FUNCTION_LABELS[fn];
            const person = personFor(fn);
            const record = person ? members.find((m) => m.id === person.id) : undefined;
            const gone = record?.is_active === false;
            const moved = fn !== 'cs' && record !== undefined && record.function !== fn;
            const line = fn === 'cs' && person && !gone ? TEAM.OWNER : teamLine({ label, person, deactivated: gone, moved, head: headFor(fn) });
            const lineId = `${headingId}-${fn}-line`;
            const errorId = `${headingId}-${fn}-error`;
            const error = errors[fn];
            const choices = members.filter((m) => m.is_active && m.function === fn).map((m) => ({ value: String(m.id), label: m.name }));
            if (person && !choices.some((c) => c.value === String(person.id))) choices.unshift({ value: String(person.id), label: person.name });
            return (
              <li key={fn} data-team-row={fn} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={TYPE.label}>{label}</span>
                  {line ? (
                    <span id={lineId} className={TYPE.meta}>
                      {line}
                    </span>
                  ) : null}
                </div>
                <div className="flex w-full min-w-0 flex-col sm:w-64">
                  {canAssign ? (
                    <Select
                      label={TEAM.picker(label)}
                      labelPosition="hidden"
                      value={person ? String(person.id) : ''}
                      disabled={busy !== null && busy !== fn}
                      invalid={Boolean(error)}
                      describedBy={[line ? lineId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
                      onChange={(value) => void choose(fn, value)}
                      options={[{ value: '', label: TEAM.NOBODY_YET }, ...choices]}
                    />
                  ) : person ? (
                    <span className={`${TYPE.body} font-semibold`}>{person.name}</span>
                  ) : null}
                  {error ? (
                    <p id={errorId} role="alert" className={FIELD_ERROR}>
                      {error}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

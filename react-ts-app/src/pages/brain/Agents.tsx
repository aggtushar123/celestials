import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { fetchUsage, setBudget } from '../../features/agents/agentsSlice';
import type { ModelCallRow, PurposeUsage } from '../../features/agents/agentsSlice';
import { EmptyState, FORM_ALERT, INPUT, LoadingState, MetaParts, NUM, PRIMARY, QUIET, ROW_ACTIONS, SettingsFrame, SettingsNote, SettingsSection, TABLE, TD, TD_NUM, TH, TYPE, ScrollTable } from '../../components/ui';
import { settingsTitle } from '../settings/workspaceSettingsNav';
import { AnswerQuality } from './AnswerQuality';

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);

const OUTCOME: Record<ModelCallRow['outcome'], { label: string; className: string }> = {
  ok: { label: 'OK', className: 'text-ink-muted' },
  failed: { label: 'Failed', className: 'font-semibold text-danger-ink' },
  unconfigured: { label: 'Not configured', className: 'text-ink-muted' },
  over_budget: { label: 'Over budget', className: 'font-semibold text-danger-ink' },
};

function PurposeRow({ row, canManage }: { row: PurposeUsage; canManage: boolean }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.budget));
  const setBudgetRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const share = row.budget > 0 ? Math.min(100, (row.spent / row.budget) * 100) : 0;
  // The thresholds read the shown (rounded) figure, so the %, the bar and the
  // words agree. Status colour only for real status (spec §7).
  const shown = Math.round(share);
  const bar = shown >= 90 ? 'bg-danger' : shown >= 70 ? 'bg-warning' : 'bg-ink-muted';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) return;
    await dispatch(setBudget({ purpose: row.purpose, monthly_tokens: Math.round(n) }));
    close();
  }

  // The button that had focus unmounts with the form, so focus goes back to Set budget.
  function close() {
    returnFocus.current = true;
    setEditing(false);
  }

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      setBudgetRef.current?.focus();
    }
  }, [editing]);

  async function useDefault() {
    await dispatch(setBudget({ purpose: row.purpose, monthly_tokens: null }));
    setBudgetRef.current?.focus();
  }

  return (
    <li className="group relative flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={`${TYPE.body} font-semibold`}>{row.label}</h3>
        <div className="flex items-center gap-3">
          {canManage && !editing ? (
            <div className={ROW_ACTIONS}>
              <button
                ref={setBudgetRef}
                type="button"
                onClick={() => {
                  setDraft(String(row.budget));
                  setEditing(true);
                }}
                className={QUIET}
              >
                Set budget
              </button>
              {row.custom_budget ? (
                <button type="button" onClick={useDefault} className={QUIET}>
                  Use default
                </button>
              ) : null}
            </div>
          ) : null}
          <p className={TYPE.meta}>
            <MetaParts
              parts={[
                <>
                  <span className={NUM}>{row.calls}</span> {row.calls === 1 ? 'call' : 'calls'}
                </>,
                shown >= 70 ? (
                  <span className={`text-[11px] font-semibold leading-4 ${shown >= 90 ? 'text-danger-ink' : 'text-warning-ink'}`}>
                    {shown >= 90 ? '90% of the budget or more' : '70% of the budget or more'}
                  </span>
                ) : null,
                row.failed > 0 ? (
                  <span className="text-[11px] leading-4 text-danger-ink">
                    <span className={NUM}>{row.failed}</span> failed
                  </span>
                ) : null,
              ]}
            />
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
          <div data-part="spend" className={`h-full rounded-full ${bar}`} style={{ width: `${share}%` }} />
        </div>
        <span className={`${TYPE.body} ${NUM}`}>{shown}%</span>
      </div>
      <p className={TYPE.meta}>
        <MetaParts
          parts={[
            <>
              <span className={NUM}>{compact(row.spent)}</span> of <span className={NUM}>{compact(row.budget)}</span> tokens this month
            </>,
            <>
              <span className={NUM}>{compact(row.input_tokens)}</span> in
            </>,
            <>
              <span className={NUM}>{compact(row.output_tokens)}</span> out
            </>,
            row.custom_budget ? 'budget set for this organisation' : 'default budget',
          ]}
        />
      </p>
      {canManage && editing ? (
        <form onSubmit={submit} aria-label={`Budget for ${row.label}`} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`budget-${row.purpose}`} className={TYPE.label}>
              Tokens a month
            </label>
            <input id={`budget-${row.purpose}`} type="number" min={0} step={1000} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus className={`${INPUT} ${NUM} w-36`} />
          </div>
          <button type="button" onClick={close} className={QUIET}>
            Cancel
          </button>
          <button type="submit" className={PRIMARY}>
            Save
          </button>
        </form>
      ) : null}
    </li>
  );
}

/**
 * AI usage: what the brain spends, and what it may spend.
 *
 * Every model call the product makes (the Copilot, Headlines, the
 * classifier, the brief, the Ops agent) goes through one function, and
 * that function logs one row per call. This page is that log this month,
 * per purpose against its budget, and the last fifty calls with who asked
 * for them. Budgets stop a runaway agent; they are generous by default so
 * a busy team is never throttled by accident.
 */
export function AgentsPage() {
  const dispatch = useAppDispatch();
  const canSeeAll = useCapability('view_all_accounts');
  const canManage = useCapability('manage_org_settings');
  const { data, isLoading, error, saveError } = useAppSelector((s) => s.agents);

  useEffect(() => {
    if (canSeeAll) dispatch(fetchUsage());
  }, [dispatch, canSeeAll]);

  return (
    <SettingsFrame
      title={settingsTitle('/settings/ai/usage')}
      intro="Every model call the brain makes: what it spent this month, against what it may spend."
      note={canSeeAll ? undefined : <SettingsNote icon="lock">Model usage is organisation-wide, which needs the view-all-accounts capability.</SettingsNote>}
    >
      {error || saveError ? (
        <p role="alert" className={FORM_ALERT}>
          {error ?? saveError}
        </p>
      ) : null}
      {data ? (
        <>
          <SettingsSection
            title="This month"
            description={`From ${data.month_start}.${canManage ? '' : ' Budgets are set by organisation settings managers.'}`}
            list="Spend by purpose"
          >
            {data.purposes.map((row) => (
              <PurposeRow key={row.purpose} row={row} canManage={canManage} />
            ))}
          </SettingsSection>
          <AnswerQuality />
          <SettingsSection title="Recent calls" state={data.recent.length === 0 ? <EmptyState size="inline" title="No model calls yet." /> : undefined}>
            <ScrollTable>
              <table aria-label="Recent calls" className={`${TABLE} min-w-[640px]`}>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      When
                    </th>
                    <th scope="col" className={TH}>
                      Purpose
                    </th>
                    <th scope="col" className={TH}>
                      Asked by
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      In
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Out
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Latency
                    </th>
                    <th scope="col" className={TH}>
                      Outcome
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {data.recent.map((call) => (
                    <tr key={call.id}>
                      <td className={`${TD} whitespace-nowrap text-ink-muted ${NUM}`}>{call.created_at.slice(0, 16).replace('T', ' ')}</td>
                      <td className={TD}>{call.purpose_label}</td>
                      <td className={`${TD} text-ink-muted`}>{call.user ?? 'scheduled'}</td>
                      <td className={TD_NUM}>{call.input_tokens.toLocaleString()}</td>
                      <td className={TD_NUM}>{call.output_tokens.toLocaleString()}</td>
                      <td className={TD_NUM}>{(call.latency_ms / 1000).toFixed(1)}s</td>
                      <td className={TD} title={call.error}>
                        <span className={OUTCOME[call.outcome].className}>{OUTCOME[call.outcome].label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </SettingsSection>
        </>
      ) : isLoading ? (
        <SettingsSection title="This month" state={<LoadingState label="Loading AI usage" />} />
      ) : null}
    </SettingsFrame>
  );
}

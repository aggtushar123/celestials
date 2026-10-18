import { useEffect, useState } from 'react';
import { fetchRules } from '../../features/rules/ruleApi';
import type { Rule, RuleRow } from '../../features/rules/ruleTypes';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { RULE_GRID } from '../../components/rules/ruleGrid';
import { RuleListItem } from '../../components/rules/RuleListItem';
import { BUTTON, EmptyState, ErrorState, ListCard, ListHeaderRow, LoadingState } from '../../components/ui';

const EXPLAINER =
  'A rule watches one of your segments every night. When a record enters or leaves it, when a score crosses a line, or on a schedule, it can notify people, create tasks, change the lifecycle stage or send a survey. Surveys wait for your review first.';

type Answer = { key: number; rows: RuleRow[] | null; error: string | null };

/** The Rules tab (spec §2.1): every rule the reader may read, by name. It
 *  reads again when `reload` changes (the builder modal closed). A failed
 *  reload keeps the last list beside the error. */
export function RulesTab({ reload = 0 }: { reload?: number }) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [seen, setSeen] = useState(reload);
  if (seen !== reload) {
    setSeen(reload);
    setAttempt((n) => n + 1);
  }
  useEffect(() => {
    let alive = true;
    fetchRules().then(
      (rows) => {
        if (alive) setAnswer({ key: attempt, rows, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer((last) => ({ key: attempt, rows: last?.rows ?? null, error: errorMessage(err, 'Could not load rules.') }));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const rows = answer?.rows ?? null;
  const error = answer?.key === attempt ? answer.error : null;
  const loading = answer?.key !== attempt;
  const retry = () => setAttempt((n) => n + 1);
  // A switch saved on a row: its rule replaces the row in place.
  const replace = (rule: Rule) => setAnswer((last) => (last?.rows ? { ...last, rows: last.rows.map((row) => (row.id === rule.id ? rule : row)) } : last));

  const state =
    error && (!rows || rows.length === 0) ? (
      <ErrorState message={error} onRetry={retry} />
    ) : !rows || (loading && rows.length === 0) ? (
      <LoadingState label="Loading rules" count={4} />
    ) : rows.length === 0 ? (
      <EmptyState title="No rules yet" detail={EXPLAINER} />
    ) : undefined;
  return (
    <div className="flex flex-col gap-2">
      {error && rows && rows.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] leading-5 text-danger-ink">{error} Showing the last result.</p>
          <button type="button" onClick={retry} className={BUTTON}>
            Try again
          </button>
        </div>
      ) : null}
      <div className="@container">
        <ListCard
          label="Rules"
          busy={loading}
          state={state}
          header={state ? undefined : <ListHeaderRow columns={RULE_GRID.columns} labels={RULE_GRID.labels} align={RULE_GRID.aligns} show={RULE_GRID.headerShow} />}
        >
          {rows?.map((row) => <RuleListItem key={row.id} row={row} onChange={replace} />)}
        </ListCard>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { formatRelativeTime } from '../../features/customers/formatters';
import { ApiError } from '../../lib/apiClient';
import { Badge, EmptyState, ErrorState, ICON_BUTTON, IconChip, ListCard, ListHeaderRow, ListRow, LoadingState, NUM, TYPE } from '../../components/ui';
import { SCENARIO_GRID } from './scenarioGrid';
import { APPLY_TO_LABELS } from './types';
import { deleteScenario, fetchScenarios } from './scenarioApi';
import type { Scenario } from './types';

/** The canvas scenarios, under the framed bar that already reads
 *  "Scenarios" and carries the Create scenario primary. */
export function ScenariosList() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Scenario | null>(null);

  // Only the first read and Try again blank the list: after a delete the
  // rows stay put, so nothing under the dialog unmounts and the focus goes
  // back to a control that still exists.
  const intro = useRef<HTMLParagraphElement>(null);
  const hadTarget = useRef(false);

  async function refresh(blank = true) {
    if (blank) setIsLoading(true);
    setError(null);
    try {
      setScenarios(await fetchScenarios());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load scenarios.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // A deleted row takes its Delete button with it: when the dialog closes
  // and the focus has nowhere to return to, it lands on the intro line.
  useEffect(() => {
    if (deleteTarget) {
      hadTarget.current = true;
      return;
    }
    if (hadTarget.current) {
      hadTarget.current = false;
      const active = document.activeElement;
      if (!active || active === document.body) intro.current?.focus();
    }
  }, [deleteTarget]);

  const state = isLoading ? (
    <LoadingState label="Loading scenarios" count={3} />
  ) : error ? (
    <ErrorState message={error} onRetry={() => void refresh()} />
  ) : scenarios.length === 0 ? (
    <EmptyState title="No scenarios yet" detail="Build a flow with triggers, conditions and actions, then save it here." icon={GitBranch} />
  ) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <p ref={intro} tabIndex={-1} className={`${TYPE.bodyMuted} focus:outline-none`}>Build a flow with triggers, conditions and actions to automate your workflow.</p>
      <div className="@container">
        <ListCard
          label="Scenarios"
          state={state}
          header={state ? undefined : <ListHeaderRow columns={SCENARIO_GRID.columns} labels={SCENARIO_GRID.labels} align={SCENARIO_GRID.aligns} show={SCENARIO_GRID.headerShow} />}
        >
          {scenarios.map((scenario) => (
            <ListRow
              key={scenario.id}
              dataAttrs={{ 'data-scenario': scenario.id }}
              title={scenario.name}
              onSelect={() => navigate(`/scenarios/${scenario.id}`)}
              leading={<IconChip icon={GitBranch} />}
              columns={SCENARIO_GRID.columns}
              gridAt={SCENARIO_GRID.gridAt}
              meta={
                <span className={SCENARIO_GRID.narrowOnly}>
                  {APPLY_TO_LABELS[scenario.apply_to]} · {scenario.is_active ? 'Active' : 'Inactive'} · {formatRelativeTime(scenario.updated_at)}
                </span>
              }
              cells={[
                <span key="applies" className={`block ${TYPE.bodyMuted}`}>{APPLY_TO_LABELS[scenario.apply_to]}</span>,
                <span key="nodes" className={`block text-right ${TYPE.body} ${NUM}`}>{scenario.nodes.length}</span>,
                <span key="status" className="block"><Badge>{scenario.is_active ? 'Active' : 'Inactive'}</Badge></span>,
                <span key="updated" className={`block ${TYPE.bodyMuted}`}>{formatRelativeTime(scenario.updated_at)}</span>,
              ]}
              actions={
                <button type="button" onClick={() => setDeleteTarget(scenario)} aria-label={`Delete ${scenario.name}`} className={ICON_BUTTON}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              }
            />
          ))}
        </ListCard>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteScenario(deleteTarget.id);
            await refresh(false);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

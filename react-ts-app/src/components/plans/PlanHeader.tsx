import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Info, Pencil } from 'lucide-react';
import { deletePlan, updatePlan } from '../../features/plans/planApi';
import { AGENT_LABEL } from '../../features/agents/agentsText';
import { firstError, planErrors } from '../../features/plans/planErrors';
import { KIND_LABEL, STATUS_LABEL } from '../../features/plans/planOptions';
import { allMilestonesDone, dateRange, finishedNotice, isEditable, isOpen } from '../../features/plans/planText';
import type { Plan, SettableStatus } from '../../features/plans/planTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { DetailHeader, FOCUS, INLINE_TARGET, NUM, Select, TYPE } from '../ui';
import type { MenuItem } from '../ui/Menu';
import { OwnerName, RecordLink, StatusPill } from './parts';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';
import { useSubmitOnce } from './useSubmitOnce';

/** The plan's header (spec §2.3, Decision 9; Agents delivery 2: Edit on a Draft, Started by the agent). */
export function PlanHeader({ plan, editing, onEdit, onReplace }: { plan: Plan; editing: boolean; onEdit: (on: boolean) => void; onReplace: (plan: Plan) => void }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { busy, run } = useSubmitOnce();
  const open = isOpen(plan.status);
  const editable = isEditable(plan.status);
  const notice = finishedNotice(plan.status);

  async function setStatus(next: SettableStatus) {
    setStatusError(null);
    const outcome = await run(() => updatePlan(plan.id, { status: next }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setStatusError(firstError(planErrors(outcome.error, ['status'], 'Could not change the status.')));
  }

  const menu: MenuItem[] = plan.can_edit
    ? [
        { key: 'template', label: 'Save as template', onSelect: () => setSaving(true) },
        ...(open ? [{ key: 'cancel', label: 'Cancel plan', onSelect: () => setConfirm('cancel'), danger: true }] : []),
        ...(plan.can_delete ? [{ key: 'delete', label: 'Delete', onSelect: () => setConfirm('delete'), danger: true }] : []),
      ]
    : [];

  return (
    <>
      <DetailHeader
        title={plan.name}
        control={
          plan.can_edit && open ? (
            <Select<SettableStatus | 'not_started'>
              label="Status"
              labelPosition="hidden"
              value={plan.status as SettableStatus | 'not_started'}
              disabled={busy}
              onChange={(next) => void setStatus(next as SettableStatus)}
              options={[
                ...(plan.status === 'not_started' ? [{ value: 'not_started' as const, label: STATUS_LABEL.not_started, disabled: true }] : []),
                { value: 'on_track', label: STATUS_LABEL.on_track },
                { value: 'at_risk', label: STATUS_LABEL.at_risk },
                { value: 'done', label: STATUS_LABEL.done, disabled: !allMilestonesDone(plan) },
              ]}
            />
          ) : undefined
        }
        actions={
          plan.can_edit && editable
            ? [{ key: 'edit', label: editing ? 'Done editing' : 'Edit', icon: Pencil, onSelect: () => onEdit(!editing), pressed: editing }]
            : []
        }
        menu={menu}
        meta={
          <>
            {plan.can_edit && open ? null : (
              <span className="inline-flex items-center gap-1.5">
                <StatusPill status={plan.status} /> ·
              </span>
            )}
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <RecordLink record={plan.record} /> ·
            </span>
            <span>{KIND_LABEL[plan.kind]} ·</span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <OwnerName person={plan.owner} /> ·
            </span>
            <span>
              {dateRange(plan.start_date, plan.target_date)
                .split(' → ')
                .flatMap((date, at) => (at === 0 ? [<span key="from" className={NUM}>{date}</span>] : [' → ', <span key="to" className={NUM}>{date}</span>]))}
            </span>
          </>
        }
        status={
          notice ? (
            <p data-part="finished" className={`flex items-start gap-2 ${TYPE.bodyMuted}`}>
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {notice}
            </p>
          ) : null
        }
      >
        {plan.started_by_agent ? (
          <p data-part="started-by" className={TYPE.meta}>{`Started by the ${AGENT_LABEL[plan.started_by_agent]}`}</p>
        ) : plan.started_by_rule ? (
          <p data-part="started-by" className={TYPE.meta}>
            Started by{' '}
            {plan.started_by_rule.id !== null ? (
              <Link to={`/scenarios/rules/${plan.started_by_rule.id}`} className={`${INLINE_TARGET} font-semibold text-ink underline ${FOCUS}`}>
                {plan.started_by_rule.name}
              </Link>
            ) : (
              plan.started_by_rule.name
            )}
          </p>
        ) : null}
        {statusError ? (
          <p role="alert" className="text-[13px] leading-5 text-danger-ink">
            {statusError}
          </p>
        ) : null}
      </DetailHeader>
      {confirm === 'cancel' ? (
        <ConfirmDialog
          title={`Cancel ${plan.name}?`}
          message="Its open tasks stay on their owners' lists."
          confirmLabel="Cancel plan"
          danger
          onConfirm={async () => {
            try {
              onReplace(await updatePlan(plan.id, { status: 'cancelled' }));
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw firstError(planErrors(err, [], 'Could not cancel this plan.'));
            }
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'delete' ? (
        <ConfirmDialog
          title={`Delete ${plan.name}?`}
          message="Its milestones and tasks are deleted with it."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deletePlan(plan.id);
            } catch (err) {
              throw firstError(planErrors(err, [], 'Could not delete this plan.'));
            }
            // Replace: Back must not land on the deleted plan's "not found".
            navigate('/projects', { replace: true });
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
      {saving ? <SaveAsTemplateDialog plan={plan} onClose={() => setSaving(false)} /> : null}
    </>
  );
}

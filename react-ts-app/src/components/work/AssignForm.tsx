import { useId, useState, type FormEvent } from 'react';
import { assigneeOptions } from '../../features/work/assignees';
import { REC, cantDecide, decidedElsewhere, pickable, prefillAssignee, validateAssign } from '../../features/work/recommended';
import { NO_REFUSAL, assignRecommendation, readRefusal, type Refusal } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { AssignAnswer, RecordedRecommendation } from '../../features/work/workTypes';
import { CONTROL, FORM_ERROR, FORM_GRID } from '../organizations/activity/formStyles';
import { Field } from '../organizations/activity/FormField';
import { BUTTON, QUIET } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { AssigneeSelect } from './AssigneeSelect';
import { useAssignees } from './useAssignees';

// CONTROL is min-h-11 below sm (formStyles.ts); named INPUT here so the
// house rules' touch-target check knows it.
const INPUT = `${CONTROL}`;

/** Assign (spec §2.4; Decision 7): who does it, prefilled with the
 *  suggested person while they can still take it, the due date and the
 *  title from the row's defaults. Sent once. The server's refusals sit
 *  under their fields (ASSIGNEE_CANNOT_OPEN under Who does it) or on the
 *  form (CANT_DECIDE); a recommendation decided elsewhere (404, 409) hands
 *  its sentence up and the row leaves (Decision 9). */
export function AssignForm({
  rec,
  onAssigned,
  onGone,
  onRefused,
  onCancel,
}: {
  rec: RecordedRecommendation;
  onAssigned: (answer: AssignAnswer) => void;
  onGone: (text: string) => void;
  /** A 403 CANT_DECIDE: the sentence stays here; the page reads its list again. */
  onRefused: () => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const assignees = useAssignees(rec.record);
  const [chosen, setChosen] = useState<number | null>(() => prefillAssignee(rec));
  const [due, setDue] = useState(rec.defaults?.due_date ?? '');
  const [title, setTitle] = useState(rec.defaults?.title ?? rec.title);
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const options = assigneeOptions(assignees.people ?? [], rec.record.kind);
  const value = pickable(assignees.people, chosen);
  const hint = assignees.error ? WORK.LOAD_PEOPLE : assignees.people === null ? WORK.LOADING_PEOPLE : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local = validateAssign({ assignee: value, due, title });
    if (value === null || Object.keys(local).length > 0) {
      setRefusal({ field: local, form: null });
      return;
    }
    setRefusal(NO_REFUSAL);
    const outcome = await run(() => assignRecommendation(rec.id, { assignee_id: value, due_date: due, title: title.trim() }));
    if (!outcome) return;
    if (outcome.ok) {
      onAssigned(outcome.value);
      return;
    }
    const elsewhere = decidedElsewhere(outcome.error);
    if (elsewhere) {
      onGone(elsewhere);
      return;
    }
    setRefusal(readRefusal(outcome.error, REC.ASSIGN_FAILED));
    if (cantDecide(outcome.error)) onRefused();
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-label={`Assign “${rec.title}”`} className="@container flex flex-col gap-3">
      <div className={FORM_GRID}>
        <Field id={`${ids}-who`} label={REC.WHO} wide hint={hint} error={refusal.field.assignee_id}>
          <AssigneeSelect
            id={`${ids}-who`}
            value={value}
            options={options}
            onChange={setChosen}
            disabled={assignees.people === null}
            size="form"
            aria={{ 'aria-invalid': Boolean(refusal.field.assignee_id) }}
          />
          {assignees.error ? (
            <button type="button" onClick={assignees.retry} className={`${QUIET} self-start`}>
              {WORK.TRY_AGAIN}
            </button>
          ) : null}
        </Field>
        <Field id={`${ids}-due`} label={REC.DUE} error={refusal.field.due_date}>
          <input id={`${ids}-due`} type="date" value={due} onChange={(event) => setDue(event.target.value)} className={INPUT} />
        </Field>
        <Field id={`${ids}-title`} label={REC.TITLE} error={refusal.field.title}>
          <input id={`${ids}-title`} value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} className={INPUT} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* aria-disabled, not disabled (delivery 1 lesson): useSubmitOnce's
            ref already guards a second send; a disabled attribute stuck on
            this button when the row leaves right under a double click would
            leave it unfocusable to userEvent's next mousedown, which then
            blurs whatever has focus with nowhere to land it. */}
        <button type="submit" aria-disabled={busy || undefined} className={BUTTON}>
          {busy ? REC.ASSIGNING : REC.ASSIGN_TASK}
        </button>
        {/* A no-op while busy, not just visually disabled: the request is
            already sent (useSubmitOnce's ref), so letting Cancel unmount
            the form would show nothing while the answer is still coming, and
            the row would later vanish with no indication why. */}
        <button type="button" onClick={() => !busy && onCancel()} aria-disabled={busy || undefined} className={QUIET}>
          {REC.CANCEL}
        </button>
      </div>
      {refusal.form ? (
        <p role="alert" className={FORM_ERROR}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}

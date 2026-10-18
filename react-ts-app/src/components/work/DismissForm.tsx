import { useId, useState, type FormEvent } from 'react';
import { DISMISS_REASONS, REC, cantDecide, decidedElsewhere, validateDismiss } from '../../features/work/recommended';
import { NO_REFUSAL, dismissRecommendation, readRefusal, type Refusal } from '../../features/work/workApi';
import type { DismissBody, DismissReason, RecommendationRow } from '../../features/work/workTypes';
import { CONTROL, FORM_ERROR, FORM_GRID } from '../organizations/activity/formStyles';
import { Field } from '../organizations/activity/FormField';
import { BUTTON, QUIET } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';

// CONTROL is min-h-11 below sm (formStyles.ts); named INPUT here so the
// house rules' touch-target check knows it.
const INPUT = `${CONTROL}`;

/** Dismiss (spec §2.3; Decision 8): a reason, and with Other a note,
 *  refused in place in the server's words before anything is sent. Sent
 *  once; a recommendation decided elsewhere (404, 409) hands its sentence
 *  up and the row leaves. */
export function DismissForm({
  rec,
  onDismissed,
  onGone,
  onRefused,
  onCancel,
}: {
  rec: RecommendationRow;
  onDismissed: () => void;
  onGone: (text: string) => void;
  /** A 403 CANT_DECIDE: the sentence stays here; the page reads its list again. */
  onRefused: () => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [reason, setReason] = useState<DismissReason | ''>('');
  const [note, setNote] = useState('');
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local = validateDismiss(reason, note);
    if (reason === '' || Object.keys(local).length > 0) {
      setRefusal({ field: local, form: null });
      return;
    }
    setRefusal(NO_REFUSAL);
    const body: DismissBody = reason === 'other' ? { reason, note: note.trim() } : { reason };
    const outcome = await run(() => dismissRecommendation(rec.id, body));
    if (!outcome) return;
    if (outcome.ok) {
      onDismissed();
      return;
    }
    const elsewhere = decidedElsewhere(outcome.error);
    if (elsewhere) {
      onGone(elsewhere);
      return;
    }
    setRefusal(readRefusal(outcome.error, REC.DISMISS_FAILED));
    if (cantDecide(outcome.error)) onRefused();
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-label={`Dismiss “${rec.title}”`} className="@container flex flex-col gap-3">
      <div className={FORM_GRID}>
        <Field id={`${ids}-reason`} label={REC.REASON} error={refusal.field.reason}>
          <select
            id={`${ids}-reason`}
            value={reason}
            aria-invalid={Boolean(refusal.field.reason)}
            onChange={(event) => setReason(event.target.value as DismissReason | '')}
            className={INPUT}
          >
            <option value="" disabled>
              {REC.CHOOSE_REASON}
            </option>
            {DISMISS_REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        {reason === 'other' ? (
          <Field id={`${ids}-note`} label={REC.NOTE} error={refusal.field.note}>
            <input
              id={`${ids}-note`}
              value={note}
              maxLength={255}
              aria-invalid={Boolean(refusal.field.note)}
              onChange={(event) => setNote(event.target.value)}
              className={INPUT}
            />
          </Field>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {/* aria-disabled, not disabled (Task 5's lesson): useSubmitOnce's
            ref already guards a second send; a disabled attribute stuck on
            this button when the row leaves right under a double click would
            leave it unfocusable to userEvent's next mousedown, which then
            blurs whatever has focus with nowhere to land it. */}
        <button type="submit" aria-disabled={busy || undefined} className={BUTTON}>
          {busy ? REC.DISMISSING : REC.DISMISS_IT}
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

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { rejectBundle } from '../../features/agents/bundlesApi';
import { AGENTS } from '../../features/agents/agentsText';
import { BUNDLE, REJECT_REASONS, readRunRefusal, type RejectDraft } from '../../features/agents/bundleText';
import type { Bundle, RejectReason } from '../../features/agents/bundleTypes';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { DANGER, FIELD_ERROR, FORM_ALERT, INPUT, INVALID, QUIET, Select, TYPE } from '../ui';

/** Reject bundle (spec §6.7; frontend Decision 14): a reason (required) and
 *  an optional note, refused here first in the server's own words. Why takes
 *  focus when the form opens. */
export function BundleReject({
  bundle,
  value,
  onChange,
  onDone,
  onCancel,
}: {
  bundle: Bundle;
  value: RejectDraft;
  onChange: (next: RejectDraft) => void;
  onDone: (next: Bundle | null, line?: string | null) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const { reason, note } = value;
  const [errors, setErrors] = useState<{ reason?: string; note?: string; form?: string }>({});
  const reasonRef = useRef<HTMLDivElement>(null);
  const { busy, run } = useSubmitOnce();

  useEffect(() => {
    reasonRef.current?.querySelector('select')?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason) {
      setErrors({ reason: BUNDLE.CHOOSE_REASON });
      reasonRef.current?.querySelector('select')?.focus();
      return;
    }
    if (note.length > 255) {
      setErrors({ note: AGENTS.NOTE_TOO_LONG });
      return;
    }
    const outcome = await run(() => rejectBundle(bundle.id, reason, note));
    if (!outcome) return;
    if (outcome.ok) {
      onDone(outcome.value.bundle);
      return;
    }
    const read = readRunRefusal(outcome.error, BUNDLE.REJECT_FAILED);
    if (read.lost) onDone(null);
    else if (read.bundle) onDone(read.bundle, read.form);
    else setErrors({ reason: read.fields[0]?.reason, note: read.fields[0]?.note, form: read.form ?? undefined });
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-label={BUNDLE.REJECT} className="flex w-full flex-col gap-3">
      <div ref={reasonRef}>
        <Select
          id={`${id}-reason`}
          label={BUNDLE.WHY}
          labelPosition="above"
          value={reason}
          onChange={(next) => onChange({ ...value, reason: next as RejectReason | '' })}
          options={[{ value: '', label: BUNDLE.CHOOSE_REASON_OPTION }, ...REJECT_REASONS]}
          invalid={Boolean(errors.reason)}
          describedBy={errors.reason ? `${id}-reason-error` : undefined}
        />
        {errors.reason ? (
          <p id={`${id}-reason-error`} role="alert" className={FIELD_ERROR}>
            {errors.reason}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-note`} className={TYPE.label}>
          {BUNDLE.NOTE}
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
          aria-invalid={Boolean(errors.note)}
          aria-describedby={`${id}-note-hint${errors.note ? ` ${id}-note-error` : ''}`}
          className={`${INPUT} ${INVALID} min-h-20 py-2`}
        />
        <p id={`${id}-note-hint`} className={TYPE.meta}>
          {BUNDLE.NOTE_HINT}
        </p>
        {errors.note ? (
          <p id={`${id}-note-error`} role="alert" className={FIELD_ERROR}>
            {errors.note}
          </p>
        ) : null}
      </div>
      {errors.form ? (
        <p role="alert" className={FORM_ALERT}>
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={busy || undefined} className={DANGER}>
          {busy ? BUNDLE.REJECTING : BUNDLE.REJECT_IT}
        </button>
        <button type="button" onClick={onCancel} className={QUIET}>
          {BUNDLE.CANCEL}
        </button>
      </div>
    </form>
  );
}

import { useId, useState } from 'react';
import type { RecordRef } from '../../features/plans/planTypes';
import type { Refusal } from '../../features/work/workApi';
import { WORK, isDueDate } from '../../features/work/workText';
import type { TaskDetail, TaskPatch } from '../../features/work/workTypes';
import { BUTTON, MONO } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { RecordStep } from '../plans/RecordStep';
import { Field } from '../rules/Field';
import { TYPE } from '../ui';

/** Attach a record to a to-do (contract §1.2; Decision 10): pick an
 *  organisation or account, give a date if the to-do has none, Attach. One
 *  way: from then on it is a normal task. The server's refusals sit under
 *  the record and the date. While a write runs Attach is aria-disabled, not
 *  disabled, so focus stays; the panel's one-write guard drops a second
 *  click (R10). */
export function RecordEditor({ task, busy, refusal, save }: { task: TaskDetail; busy: boolean; refusal: Refusal; save: (patch: TaskPatch) => Promise<boolean> }) {
  const dueId = useId();
  const historyId = useId();
  const [record, setRecord] = useState<RecordRef | null>(null);
  const [due, setDue] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  const needsDate = task.due_date === null;

  async function attach() {
    if (!record || busy) return;
    if (needsDate && !isDueDate(due)) {
      setLocal(WORK.DATE_REQUIRED);
      return;
    }
    setLocal(null);
    const patch: TaskPatch = record.kind === 'organization' ? { customer_id: record.id } : { account_id: record.id };
    if (needsDate) patch.due_date = due;
    await save(patch);
  }

  const dueError = local ?? refusal.field.due_date;
  return (
    <section className="flex flex-col gap-2 border-t border-line-subtle pt-4">
      <RecordStep
        heading={WORK.ATTACH_RECORD}
        record={record}
        locked={false}
        loading={false}
        error={refusal.field.record ?? refusal.field.customer_id ?? refusal.field.account_id}
        onPick={setRecord}
        onClear={() => setRecord(null)}
      />
      <p id={historyId} data-part="attach-history" className={`max-w-[68ch] ${TYPE.meta}`}>
        {WORK.ATTACH_HISTORY}
      </p>
      {record && needsDate ? (
        <Field id={dueId} label={WORK.ATTACH_DUE} error={dueError}>
          {(aria) => (
            <input
              id={dueId}
              {...aria}
              type="date"
              value={due}
              readOnly={busy}
              aria-disabled={busy}
              onChange={(event) => setDue(event.target.value)}
              className={`${INPUT} ${MONO} ${dueError ? 'border-danger' : 'border-line'}`}
            />
          )}
        </Field>
      ) : null}
      {record ? (
        <button type="button" onClick={() => void attach()} aria-disabled={busy} aria-describedby={historyId} className={`${BUTTON} self-start`}>
          {WORK.ATTACH}
        </button>
      ) : null}
    </section>
  );
}

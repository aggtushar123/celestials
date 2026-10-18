import { useId, useState } from 'react';
import { formatDate } from '../../features/customers/formatters';
import { assigneeOptions } from '../../features/work/assignees';
import { NO_REFUSAL, isMissing, patchTask, readRefusal, type Refusal, type RefusalField } from '../../features/work/workApi';
import { PRIORITY_LABEL, STATUS_LABEL, WORK, isDueDate, personName } from '../../features/work/workText';
import {
  PRIORITIES,
  STATUSES,
  type EditableField,
  type TaskDetail,
  type TaskParent,
  type TaskPatch,
  type TaskPriority,
  type TaskStatus,
} from '../../features/work/workTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { BUTTON, MONO, QUIET } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Field } from '../rules/Field';
import { AssigneeSelect } from './AssigneeSelect';
import { RecordEditor } from './RecordEditor';
import { taskChanged } from './taskChanges';
import { TaskValue } from './TaskValue';
import { useAssignees } from './useAssignees';

type Save = (patch: TaskPatch) => Promise<boolean>;
type EditorProps = { task: TaskDetail; busy: boolean; refusal: Refusal; save: Save; dismiss: (field: RefusalField) => void };

/** Dimmed while a write runs: the control stays focusable (aria-disabled). */
const BUSY = 'aria-disabled:opacity-50';
const SELECT = `${FILTER_SELECT} w-full ${BUSY}`;
const edge = (error?: string | null) => (error ? 'border-danger' : 'border-line');

/** The task's fields (spec §1.5). Each saves on its own, one write at a
 *  time; the answer replaces the task, so the trail updates from the
 *  server. A field the reader may not change is text, not a control.
 *  While a write runs the control being edited is marked aria-disabled
 *  (and read-only where it can be), never `disabled`, so focus stays on
 *  it; the re-entry guard drops a second write. A 404 means the task has
 *  left the reader's reach (`onMissing`). */
export function TaskFields({ task, onReplace, onMissing }: { task: TaskDetail; onReplace: (task: TaskDetail) => void; onMissing: () => void }) {
  const { busy, run } = useSubmitOnce();
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const [saved, setSaved] = useState('');
  const can = (field: EditableField) => task.editable.includes(field);
  const save: Save = async (patch) => {
    const outcome = await run(() => {
      setRefusal(NO_REFUSAL);
      setSaved('');
      return patchTask(task.id, patch);
    });
    if (!outcome) return false;
    if (outcome.ok) {
      onReplace(outcome.value);
      taskChanged();
      setSaved(WORK.SAVED_FIELD);
      return true;
    }
    if (isMissing(outcome.error)) {
      onMissing();
      return false;
    }
    setRefusal(readRefusal(outcome.error, WORK.SAVE_FAILED));
    return false;
  };
  const dismiss = (field: RefusalField) =>
    setRefusal((current) => {
      const rest = { ...current.field };
      delete rest[field];
      return { ...current, field: rest };
    });
  const props: EditorProps = { task, busy, refusal, save, dismiss };
  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="text-[13px] text-ink-muted empty:sr-only">
        {saved}
      </p>
      {refusal.form ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {refusal.form}
        </p>
      ) : null}
      {can('title') ? <TitleEditor {...props} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {can('status') ? <StatusEditor {...props} /> : <TaskValue label="Status" value={STATUS_LABEL[task.status]} />}
        {can('assignee') && task.parent ? (
          <AssigneeEditor {...props} parent={task.parent} />
        ) : (
          <TaskValue label="Assignee" value={task.parent ? personName(task.assignee) : WORK.YOU} />
        )}
        {can('due_date') ? <DueEditor {...props} /> : <TaskValue label="Due" value={task.due_date ? formatDate(task.due_date) : WORK.NO_DATE} mono />}
        {can('priority') ? <PriorityEditor {...props} /> : <TaskValue label="Priority" value={PRIORITY_LABEL[task.priority]} />}
        {!can('status') && task.status === 'blocked' ? <TaskValue label={WORK.BLOCKED_ON} value={task.blocked_reason} wide /> : null}
      </div>
      {can('description') ? <DescriptionEditor {...props} /> : <TaskValue label="Description" value={task.description || WORK.NO_DESCRIPTION} />}
      {can('record') && task.parent === null ? <RecordEditor task={task} busy={busy} refusal={refusal} save={save} /> : null}
    </div>
  );
}

/** Saved on Enter or when the field loses focus; a blank title is refused here. */
function TitleEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(task.title);
  const [seen, setSeen] = useState(task.title);
  const [local, setLocal] = useState<string | null>(null);
  if (seen !== task.title) {
    setSeen(task.title);
    setDraft(task.title);
  }
  async function commit() {
    const next = draft.trim();
    if (next === task.title) return;
    if (!next) {
      setLocal(WORK.TITLE_REQUIRED);
      return;
    }
    setLocal(null);
    await save({ title: next });
  }
  const error = local ?? refusal.field.title;
  return (
    <Field id={id} label="Title" error={error}>
      {(aria) => (
        <input
          id={id}
          {...aria}
          value={draft}
          maxLength={255}
          readOnly={busy}
          aria-disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            }
          }}
          className={`${INPUT} ${BUSY} ${edge(error)}`}
        />
      )}
    </Field>
  );
}

/** Pending, In progress and Done save at once. Blocked first asks what it
 *  is blocked on (spec §1.5); a Blocked task's reason is edited in place. */
function StatusEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  const reasonId = useId();
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState(task.blocked_reason);
  const [local, setLocal] = useState<string | null>(null);
  const key = `${task.status}|${task.blocked_reason}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setReason(task.blocked_reason);
    setBlocking(false);
    setLocal(null);
  }
  const shown: TaskStatus = blocking ? 'blocked' : task.status;
  const changed = blocking || reason.trim() !== task.blocked_reason;

  async function choose(next: TaskStatus) {
    setLocal(null);
    if (next === 'blocked') {
      setBlocking(true);
      return;
    }
    setBlocking(false);
    setReason(task.blocked_reason);
    if (next !== task.status) await save({ status: next });
  }

  async function saveReason() {
    const text = reason.trim();
    if (!text) {
      setLocal(WORK.REASON_REQUIRED);
      return;
    }
    setLocal(null);
    await save(task.status === 'blocked' ? { blocked_reason: text } : { status: 'blocked', blocked_reason: text });
  }

  const reasonError = local ?? refusal.field.blocked_reason;
  return (
    <>
      <Field id={id} label="Status" error={refusal.field.status}>
        {(aria) => (
          <select id={id} {...aria} value={shown} aria-disabled={busy} onChange={(event) => void choose(event.target.value as TaskStatus)} className={SELECT}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {shown === 'blocked' ? (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Field id={reasonId} label={WORK.BLOCKED_ON} error={reasonError}>
            {(aria) => (
              <input
                id={reasonId}
                {...aria}
                value={reason}
                maxLength={255}
                readOnly={busy}
                aria-disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                className={`${INPUT} ${BUSY} ${edge(reasonError)}`}
              />
            )}
          </Field>
          {changed ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveReason()} aria-disabled={busy} className={BUTTON}>
                {task.status === 'blocked' ? WORK.SAVE_REASON : WORK.MARK_BLOCKED}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBlocking(false);
                  setReason(task.blocked_reason);
                  setLocal(null);
                }}
                className={QUIET}
              >
                {WORK.CANCEL}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Members who can open the record; the rest disabled, saying why. */
function AssigneeEditor({ task, busy, refusal, save, parent }: EditorProps & { parent: TaskParent }) {
  const id = useId();
  const { people, error } = useAssignees(parent);
  const options = assigneeOptions(people ?? [], parent.kind, task.assignee);
  const hint = error ?? (people === null ? WORK.LOADING_PEOPLE : undefined);
  return (
    <Field id={id} label="Assignee" hint={hint} error={refusal.field.assignee_id}>
      {(aria) => (
        <AssigneeSelect
          id={id}
          aria={aria}
          value={task.assignee?.id ?? null}
          options={options}
          disabled={people === null}
          busy={busy}
          onChange={(next) => {
            if (next !== null && next !== task.assignee?.id) void save({ assignee_id: next });
          }}
        />
      )}
    </Field>
  );
}

function DueEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(task.due_date ?? '');
  const [seen, setSeen] = useState(task.due_date);
  const [local, setLocal] = useState<string | null>(null);
  if (seen !== task.due_date) {
    setSeen(task.due_date);
    setDraft(task.due_date ?? '');
  }
  /** Kept locally while typed (a date input reports every segment, so the
   *  year "2" would read 0002-10-07), and sent on blur or Enter. */
  async function commit() {
    if (draft === (task.due_date ?? '')) {
      setLocal(null);
      return;
    }
    // A to-do may lose its date (contract §1.2); a task with a record may not.
    if (draft === '' && task.parent === null) {
      setLocal(null);
      await save({ due_date: null });
      return;
    }
    if (!isDueDate(draft)) {
      setLocal(WORK.DATE_REQUIRED);
      return;
    }
    setLocal(null);
    await save({ due_date: draft });
  }
  const error = local ?? refusal.field.due_date;
  return (
    <Field id={id} label="Due" error={error}>
      {(aria) => (
        <input
          id={id}
          {...aria}
          type="date"
          value={draft}
          readOnly={busy}
          aria-disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            }
          }}
          className={`${INPUT} ${MONO} ${BUSY} ${edge(error)}`}
        />
      )}
    </Field>
  );
}

function PriorityEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  return (
    <Field id={id} label="Priority" error={refusal.field.priority}>
      {(aria) => (
        <select
          id={id}
          {...aria}
          value={task.priority}
          aria-disabled={busy}
          onChange={(event) => {
            const next = event.target.value as TaskPriority;
            if (next !== task.priority) void save({ priority: next });
          }}
          className={SELECT}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABEL[priority]}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Saved from its own button, once it differs from what is kept. */
function DescriptionEditor({ task, busy, refusal, save, dismiss }: EditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(task.description);
  const [seen, setSeen] = useState(task.description);
  if (seen !== task.description) {
    setSeen(task.description);
    setDraft(task.description);
  }
  const error = refusal.field.description;
  return (
    <div className="flex flex-col gap-2">
      <Field id={id} label="Description" error={error}>
        {(aria) => (
          <textarea
            id={id}
            {...aria}
            rows={4}
            maxLength={10000}
            value={draft}
            readOnly={busy}
            aria-disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            className={`${INPUT} py-2 ${BUSY} ${edge(error)}`}
          />
        )}
      </Field>
      {draft !== task.description ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void save({ description: draft })} aria-disabled={busy} className={BUTTON}>
            {WORK.SAVE_DESCRIPTION}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(task.description);
              dismiss('description');
            }}
            className={QUIET}
          >
            {WORK.CANCEL}
          </button>
        </div>
      ) : null}
    </div>
  );
}

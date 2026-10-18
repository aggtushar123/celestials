import { useId, useRef, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { assigneeOptions } from '../../features/work/assignees';
import { FEED, moreSummary, todoBody, todoErrors, type TodoForm } from '../../features/work/feed';
import type { RecordRef } from '../../features/plans/planTypes';
import { NO_REFUSAL, createTodo, readRefusal, type Refusal } from '../../features/work/workApi';
import { PRIORITY_LABEL } from '../../features/work/workText';
import { PRIORITIES, type TaskPriority, type TodoAnswer } from '../../features/work/workTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { RecordStep } from '../plans/RecordStep';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Field } from '../rules/Field';
import { Card, INPUT, PRIMARY, QUIET, TYPE } from '../ui';
import { AssigneeSelect } from './AssigneeSelect';
import { feedChanged } from './taskChanges';
import { useAssignees } from './useAssignees';

const CHOICE_SELECT = `${FILTER_SELECT} w-full`;
const BLANK: TodoForm = { title: '', record: null, due: '', priority: 'medium', assignee: null };
const parentOf = (record: RecordRef) => ({ kind: record.kind === 'organization' ? ('customer' as const) : ('account' as const), id: record.id });

/** Quick-add (spec §5, §6): type a title, Enter adds a private to-do with no
 *  date. More gives a record, a due date, a priority and, once a record is
 *  picked, who does it. Sent once: Add is aria-disabled while it runs, not
 *  disabled, so a keyboard user's focus stays on it. A refusal keeps the text, shows under its
 *  field and leaves focus where it was; a success clears the form, focus
 *  stays in the box, the page places the answer itself (`onAdded`) and only
 *  the Work badge reads again (`feedChanged`, Decision 15). Closing More
 *  keeps what it holds, in a summary line with Clear, so a record task is
 *  never sent from a box that looks like a private to-do. */
/** `bare`: inside a card of its own (Work's right pane, the Next event
 *  template, owner 2026-10-16): no Card, the label for screen readers only,
 *  and the More fields stacked to fit the pane. */
export function QuickAdd({ onAdded, bare = false }: { onAdded: (answer: TodoAnswer) => void; bare?: boolean }) {
  const ids = useId();
  const boxRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<TodoForm>(BLANK);
  const [more, setMore] = useState(false);
  const [local, setLocal] = useState<Partial<Record<'title' | 'due_date', string>>>({});
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const { busy, run } = useSubmitOnce();
  const assignees = useAssignees(form.record ? parentOf(form.record) : null);
  const whoName = form.assignee === null ? null : (assignees.people?.find((person) => person.id === form.assignee)?.name ?? null);
  const summary = more ? null : moreSummary(form, whoName);
  const set = <K extends keyof TodoForm>(key: K, value: TodoForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  // An error answers what was sent: editing its field clears it (and the
  // form-wide refusal, which shows under the title).
  const forget = (field: 'title' | 'due_date') => {
    setLocal((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setRefusal((current) =>
      current.field[field] || (field === 'title' && current.form) ? { ...current, form: field === 'title' ? null : current.form, field: { ...current.field, [field]: undefined } } : current,
    );
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors = todoErrors(form);
    setLocal(errors);
    setRefusal(NO_REFUSAL);
    if (Object.keys(errors).length > 0) {
      if (errors.due_date) setMore(true);
      return;
    }
    const outcome = await run(() => createTodo(todoBody(form)));
    if (!outcome) return;
    if (outcome.ok) {
      setForm(BLANK);
      boxRef.current?.focus();
      onAdded(outcome.value);
      feedChanged();
      return;
    }
    const read = readRefusal(outcome.error, FEED.ADD_FAILED);
    setRefusal(read);
    if (read.field.due_date || read.field.record || read.field.customer_id || read.field.account_id || read.field.assignee || read.field.assignee_id) setMore(true);
  }

  const titleError = local.title ?? refusal.field.title ?? refusal.form ?? undefined;
  const dueError = local.due_date ?? refusal.field.due_date;
  const recordError = refusal.field.record ?? refusal.field.customer_id ?? refusal.field.account_id;
  const assigneeError = refusal.field.assignee ?? refusal.field.assignee_id;
  const body = (
      <form noValidate aria-label={FEED.QUICK_ADD_FORM} onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Field id={`${ids}-title`} label={FEED.QUICK_ADD} error={titleError} hideLabel={bare}>
          {(aria) => (
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <input
                ref={boxRef}
                id={`${ids}-title`}
                {...aria}
                value={form.title}
                maxLength={255}
                autoComplete="off"
                onChange={(event) => {
                  set('title', event.target.value);
                  forget('title');
                }}
                className={`${INPUT} min-w-0 flex-1 ${titleError ? 'border-danger' : ''}`}
              />
              <button type="submit" aria-disabled={busy || undefined} className={PRIMARY}>
                {busy ? FEED.ADDING : FEED.ADD}
              </button>
              <button type="button" aria-expanded={more} aria-controls={`${ids}-more`} onClick={() => setMore((open) => !open)} className={QUIET}>
                {FEED.MORE}
                <ChevronDown className={`h-4 w-4 ${more ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </div>
          )}
        </Field>
        {summary ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className={`min-w-0 flex-1 break-words ${TYPE.bodyMuted}`}>{summary}</p>
            <button
              type="button"
              onClick={() => {
                setForm((current) => ({ ...BLANK, title: current.title }));
                setRefusal(NO_REFUSAL);
                boxRef.current?.focus();
              }}
              className={QUIET}
            >
              {FEED.CLEAR_MORE}
            </button>
          </div>
        ) : null}
        {more ? (
          <div id={`${ids}-more`} className="flex flex-col gap-3 border-t border-line-subtle pt-3">
            <RecordStep
              heading={FEED.RECORD}
              record={form.record}
              locked={false}
              loading={false}
              error={recordError}
              onPick={(record) => {
                setForm((current) => ({ ...current, record, assignee: null }));
                forget('due_date');
              }}
              onClear={() => {
                setForm((current) => ({ ...current, record: null, assignee: null }));
                forget('due_date');
              }}
            />
            <div className={`grid grid-cols-1 gap-3 ${bare ? "" : "sm:grid-cols-3"}`}>
              <Field id={`${ids}-due`} label={FEED.DUE} error={dueError}>
                {(aria) => (
                  <input id={`${ids}-due`} {...aria} type="date" value={form.due} onChange={(event) => {
                      set('due', event.target.value);
                      forget('due_date');
                    }} className={`${INPUT} tabular-nums ${dueError ? 'border-danger' : ''}`} />
                )}
              </Field>
              <Field id={`${ids}-priority`} label={FEED.PRIORITY}>
                {(aria) => (
                  <select id={`${ids}-priority`} {...aria} value={form.priority} onChange={(event) => set('priority', event.target.value as TaskPriority)} className={CHOICE_SELECT}>
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PRIORITY_LABEL[priority]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {form.record ? (
                <Field id={`${ids}-who`} label={FEED.ASSIGNEE} error={assigneeError}>
                  {(aria) => (
                    <AssigneeSelect
                      id={`${ids}-who`}
                      aria={aria}
                      value={form.assignee}
                      options={assigneeOptions(assignees.people ?? [], parentOf(form.record as RecordRef).kind)}
                      onChange={(next) => set('assignee', next)}
                      meOption
                      size="form"
                    />
                  )}
                </Field>
              ) : null}
            </div>
            <p className={TYPE.meta}>Without a record, only you see it. With one, it is a normal task on that record.</p>
          </div>
        ) : null}
      </form>
  );
  return bare ? body : <Card>{body}</Card>;
}

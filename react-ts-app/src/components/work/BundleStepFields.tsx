import { useId } from 'react';
import { OUTSIDE_KINDS } from '../../features/agents/agentTypes';
import { BUNDLE } from '../../features/agents/bundleText';
import type { Bundle, BundleStep, StepFields, StepFieldValue } from '../../features/agents/bundleTypes';
import { CONTACT_ROLES } from '../../features/contacts/contactsParams';
import { assigneeOptions } from '../../features/work/assignees';
import { PRIORITY_LABEL } from '../../features/work/workText';
import type { TaskPriority } from '../../features/work/workTypes';
import { CHECKBOX, CHOICE, FIELD_ERROR, INPUT, INVALID, Select, Switch, TYPE } from '../ui';
import { AssigneeSelect } from './AssigneeSelect';
import { BundleOutsideFields } from './BundleOutsideFields';
import { useAssignees } from './useAssignees';

const AREA = `${INPUT} ${INVALID} min-h-24 py-2`;
const LINE = `${INPUT} ${INVALID}`;
const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];
const TIMINGS = [
  { value: 'now', label: BUNDLE.SEND_NOW },
  { value: 'after_jira', label: BUNDLE.AFTER_JIRA },
];
const SURVEY_TYPES = [
  { value: 'nps', label: 'NPS' },
  { value: 'csat', label: 'CSAT' },
  { value: 'ces', label: 'CES' },
];

function labelOf(step: BundleStep, key: string): string {
  if (key === 'title') return step.kind === 'note.create' ? BUNDLE.NOTE_TITLE : BUNDLE.TITLE;
  if (key === 'body') return step.kind === 'draft.reply' ? BUNDLE.REPLY : step.kind === 'note.create' ? BUNDLE.NOTE_BODY : BUNDLE.BODY;
  const labels: Record<string, string> = { name: BUNDLE.NAME, subject: BUNDLE.SUBJECT, intro: BUNDLE.INTRO, due_date: 'Due date', priority: 'Priority', assignee_id: 'Who does it', roles: BUNDLE.ROLES, survey_type: BUNDLE.SURVEY_TYPE, timing: BUNDLE.TIMING };
  return labels[key] ?? key;
}

type Props = { bundle: Bundle; step: BundleStep; fields: StepFields; errors: Record<string, string>; onField: (key: string, value: StepFieldValue) => void };

/** A step's editable fields (frontend Decision 8); the outside kinds have their own (D3 Decision 1). */
export function BundleStepFields(props: Props) {
  return OUTSIDE_KINDS.includes(props.step.kind) ? <BundleOutsideFields {...props} /> : <InsideFields {...props} />;
}

/** The inside kinds' fields, in the order the server lists them; a field
 *  holding a placeholder is left out (Decision 10). */
function InsideFields({ bundle, step, fields, errors, onField }: Props) {
  const base = useId();
  const record = bundle.record;
  // A reader who can't open the record can't list its assignees (the server refuses): read-only text instead.
  const locked = record?.can_open === false;
  const assignees = useAssignees(step.editable.includes('assignee_id') && record && !locked ? { kind: record.type, id: record.id } : null);
  const keys = step.editable.filter((key) => !step.placeholders.some((p) => p.field === key));
  return (
    <div className="flex flex-col gap-3">
      {keys.map((key) => {
        const id = `${base}-${key}`;
        const error = errors[key];
        const aria = { 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined };
        const value = fields[key];
        const label = labelOf(step, key);
        let control;
        if (key === 'draft_only') {
          control = (
            <Switch checked={value === true} onChange={(next) => onField(key, next)} label={BUNDLE.DRAFT_ONLY}>
              {BUNDLE.DRAFT_ONLY}
            </Switch>
          );
          return <div key={key}>{control}</div>;
        }
        if (key === 'roles') {
          const roles = Array.isArray(value) ? value : [];
          return (
            <fieldset key={key} className="flex flex-col gap-1">
              <legend className={TYPE.label}>{label}</legend>
              {CONTACT_ROLES.map((role) => (
                <label key={role.value} className={CHOICE}>
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    checked={roles.includes(role.value)}
                    onChange={(event) => onField(key, event.target.checked ? [...roles, role.value] : roles.filter((r) => r !== role.value))}
                  />
                  {role.label}
                </label>
              ))}
              {error ? <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>{error}</p> : null}
            </fieldset>
          );
        }
        if (key === 'priority') {
          control = <Select id={id} label={label} labelPosition="external" value={String(value ?? 'medium')} onChange={(next) => onField(key, next)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} invalid={Boolean(error)} describedBy={aria['aria-describedby']} />;
        } else if (key === 'survey_type') {
          control = <Select id={id} label={label} labelPosition="external" value={String(value ?? 'nps')} onChange={(next) => onField(key, next)} options={SURVEY_TYPES} invalid={Boolean(error)} describedBy={aria['aria-describedby']} />;
        } else if (key === 'timing') {
          control = <Select id={id} label={label} labelPosition="external" value={String(value ?? 'now')} onChange={(next) => onField(key, next)} options={TIMINGS} invalid={Boolean(error)} describedBy={aria['aria-describedby']} />;
        } else if (key === 'assignee_id') {
          if (!record) return null;
          if (locked) {
            return (
              <div key={key} className="flex flex-col gap-1">
                <span className={TYPE.label}>{label}</span>
                <p className={TYPE.body}>{step.preview.task?.assignee?.name ?? 'Unassigned'}</p>
              </div>
            );
          }
          control = <AssigneeSelect id={id} value={typeof value === 'number' ? value : null} options={assignees.people ? assigneeOptions(assignees.people, record.type) : []} busy={assignees.people === null} onChange={(next) => onField(key, next)} aria={aria} />;
        } else if (key === 'body' || key === 'intro') {
          control = <textarea id={id} {...aria} className={AREA} value={String(value ?? '')} onChange={(event) => onField(key, event.target.value)} />;
        } else {
          control = <input id={id} {...aria} type={key === 'due_date' ? 'date' : 'text'} className={LINE} value={String(value ?? '')} onChange={(event) => onField(key, event.target.value)} />;
        }
        return (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={id} className={TYPE.label}>
              {label}
            </label>
            {control}
            {error ? (
              <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

import { listLoading, OUTSIDE } from '../../features/agents/bundleText';
import type { PickListName, PickOption, PickValue } from '../../features/agents/bundleTypes';
import { BUTTON, FIELD_ERROR, FORM_ALERT, Select, TYPE } from '../ui';
import type { PickState } from './usePickList';

const NONE = '__none__';
/** Nothing stored and no none choice: the select starts here, so the first
 *  option is a real change (a native select fires none for the shown one). */
const CHOOSE = '';
/** A name-only stored value (id '': the model's pick, resolved by name when it
 *  runs) that matches no loaded option gets this value; it cannot collide with
 *  a Jira id. */
const BY_NAME = 'name:';

const optionText = (o: PickOption) => (o.detail && o.detail !== o.name ? `${o.name} (${o.detail})` : o.name);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A tool's list as a select (frontend Decision 3): the stored value shows
 *  before the list arrives; loading, error with Try again, and empty states.
 *  A name-only value (id '') shows as selected, never as the none choice. */
export function PickSelect({ id, label, list, state, retry, value, onChange, none, error, hint, emptyText = OUTSIDE.NOTHING, labelled = true, quiet = false }: { id: string; label: string; list: PickListName; state: PickState; retry: () => void; value: PickValue | null; onChange: (value: PickValue | null) => void; none?: string; error?: string; hint?: string; emptyText?: string; labelled?: boolean; quiet?: boolean }) {
  const options = state.status === 'ready' ? state.options : [];
  const nameOnly = value !== null && !value.id && value.name !== '';
  const named = nameOnly ? options.find((o) => sameName(o.name, value.name)) : undefined;
  const known: PickOption[] = [];
  if (value && value.id && !options.some((o) => o.id === value.id)) known.push({ id: value.id, name: value.name, detail: '' });
  if (nameOnly && !named) known.push({ id: BY_NAME + value.name, name: value.name, detail: '' });
  const rows = [...known, ...options];
  const selected = value?.id ? value.id : nameOnly ? (named ? named.id : BY_NAME + value.name) : none !== undefined ? NONE : CHOOSE;
  const lead = none !== undefined ? [{ value: NONE, label: none }] : selected === CHOOSE && rows.length > 0 ? [{ value: CHOOSE, label: OUTSIDE.CHOOSE }] : [];
  const choices = [...lead, ...rows.map((o) => ({ value: o.id, label: optionText(o) }))];
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      {choices.length > 0 ? (
        <Select
          id={id}
          label={label}
          labelPosition={labelled ? 'above' : 'external'}
          value={selected}
          onChange={(next) => {
            if (next === CHOOSE) return;
            if (next === NONE) return onChange(null);
            if (value && next === BY_NAME + value.name) return onChange(value);
            const row = rows.find((o) => o.id === next);
            onChange(row ? { id: row.id, name: row.name } : null);
          }}
          options={choices}
          invalid={Boolean(error)}
          describedBy={describedBy}
        />
      ) : labelled ? (
        <p className={TYPE.label}>{label}</p>
      ) : null}
      {state.status === 'loading' ? <p role="status" className={TYPE.meta}>{listLoading(list)}</p> : null}
      {state.status === 'ready' && state.options.length === 0 ? <p role="status" className={TYPE.meta}>{emptyText}</p> : null}
      {state.status === 'failed' && !quiet ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className={FORM_ALERT}>
            {state.message}
          </p>
          <button type="button" onClick={retry} className={BUTTON}>
            {OUTSIDE.TRY_AGAIN}
          </button>
        </div>
      ) : null}
      {hint && !error ? (
        <p id={`${id}-hint`} className={TYPE.meta}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

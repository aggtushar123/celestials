import { useState } from 'react';
import { shapeOf, type DraftCondition, type DraftValue } from '../../features/segments/ruleDraft';
import { HIDDEN_NAME } from '../../features/segments/ruleSentence';
import type { FieldDef } from '../../features/segments/segmentFields';
import type { PersonRef, RuleLabels, RuleScalar } from '../../features/segments/segmentTypes';
import { Check } from '../organizations/portfolio/filterParts';
import { INPUT, INVALID, NUM, Select, TYPE } from '../ui';
import { Chip } from './Chip';
import { RecordPicker } from './RecordPicker';

export interface ValueOptions {
  /** Active people in the workspace (the owner picker). */
  people: PersonRef[];
  products: PersonRef[];
  /** Names for ids: the segment's labels, Save as segment's look-up and the
   *  picker's own picks. */
  labels: RuleLabels;
  onNamed: (group: 'organisations' | 'accounts', id: number, name: string) => void;
}

type Scalar = RuleScalar | undefined;

/** The shared input, with a danger edge on an unfinished row. */
const BOX = `${INPUT} ${INVALID}`;
const SUFFIX = TYPE.bodyMuted;
/** The option standing for a record the reader can't open (a saved `null`). */
const HIDDEN_OPTION = '__hidden';
/** A date window's days: whole numbers the backend takes (ruling G15). */
const MAX_WINDOW_DAYS = 3650;

const hiddenName = (field: FieldDef) => HIDDEN_NAME[field.record || 'customer'];

/** A select's choices: a choice list, Unassigned + people, or products. */
function choicesOf(field: FieldDef, options: ValueOptions): { value: string; label: string }[] {
  if (field.type === 'owner') return [{ value: 'unassigned', label: 'Unassigned' }, ...options.people.map((p) => ({ value: String(p.id), label: p.name }))];
  if (field.record === 'product') return options.products.map((p) => ({ value: String(p.id), label: p.name }));
  return field.choices;
}

function decode(field: FieldDef, raw: string): Scalar {
  if (raw === '') return undefined;
  if (raw === HIDDEN_OPTION) return null;
  if (field.type === 'choice') return raw;
  if (field.type === 'owner' && raw === 'unassigned') return raw;
  return Number(raw);
}

/** A saved value no longer offered (a deactivated owner, a retired product). */
function savedName(field: FieldDef, value: string, labels: RuleLabels): string {
  if (field.type === 'owner') return labels.people[value] ?? hiddenName(field);
  if (field.record === 'product') return labels.products[value] ?? hiddenName(field);
  return value;
}

/** A date window's number of days: 1 to 3650, whole. Anything below 1 or
 *  not whole leaves the value unset; anything above is held at 3650. */
function WindowDays({ value, label, invalid, onChange }: { value: Scalar; label: string; invalid: boolean; onChange: (value: Scalar) => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid}
        min={1}
        max={MAX_WINDOW_DAYS}
        step={1}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => {
          const days = Number(event.target.value);
          if (event.target.value === '' || !Number.isInteger(days) || days < 1) onChange(undefined);
          else onChange(Math.min(days, MAX_WINDOW_DAYS));
        }}
        className={`${BOX} w-24 ${NUM}`}
      />
      <span className={SUFFIX}>days</span>
    </span>
  );
}

/** A number box's value. A days field takes whole numbers of 0 or more and
 *  nothing else (the backend refuses the rest), so those read as unset. */
function numberOf(field: FieldDef, raw: string): Scalar {
  if (raw === '') return undefined;
  const number = Number(raw);
  if (field.type === 'days' && (!Number.isInteger(number) || number < 0)) return undefined;
  return number;
}

function ScalarInput({ field, options, value, label, invalid, onChange }: {
  field: FieldDef;
  options: ValueOptions;
  value: Scalar;
  label: string;
  invalid: boolean;
  onChange: (value: Scalar) => void;
}) {
  if (field.type === 'number' || field.type === 'percent' || field.type === 'days') {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          inputMode={field.type === 'days' ? 'numeric' : 'decimal'}
          aria-label={label}
          aria-invalid={invalid}
          step={field.type === 'days' ? 1 : 'any'}
          min={field.type === 'number' ? undefined : 0}
          max={field.type === 'percent' ? 100 : undefined}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(numberOf(field, event.target.value))}
          className={`${BOX} w-24 ${NUM}`}
        />
        {field.type === 'percent' ? <span className={SUFFIX}>%</span> : field.type === 'days' ? <span className={SUFFIX}>days</span> : null}
      </span>
    );
  }
  if (field.type === 'date') {
    return (
      <input
        type="date"
        aria-label={label}
        aria-invalid={invalid}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={`${BOX} ${NUM}`}
      />
    );
  }
  if (field.type === 'text') {
    return (
      <input
        type="text"
        aria-label={label}
        aria-invalid={invalid}
        maxLength={100}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
        className={`${BOX} w-40`}
      />
    );
  }
  if (field.type === 'boolean') {
    return (
      <Select
        label={label}
        labelPosition="hidden"
        invalid={invalid}
        value={String(value ?? true)}
        onChange={(next) => onChange(next === 'true')}
        options={[
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ]}
      />
    );
  }
  const items = choicesOf(field, options);
  const encoded = value === null ? HIDDEN_OPTION : value === undefined ? '' : String(value);
  const saved = value !== null && value !== undefined && !items.some((item) => item.value === encoded);
  return (
    <Select
      label={label}
      labelPosition="hidden"
      invalid={invalid}
      value={encoded}
      onChange={(next) => onChange(decode(field, next))}
      className="max-w-[14rem]"
      options={[
        { value: '', label: 'Choose…' },
        ...items,
        ...(value === null ? [{ value: HIDDEN_OPTION, label: hiddenName(field) }] : []),
        ...(saved ? [{ value: encoded, label: savedName(field, encoded, options.labels) }] : []),
      ]}
    />
  );
}

/** Comma-separated text values, kept as typed until the next comma. */
function TextList({ values, label, invalid, onChange }: { values: Scalar[]; label: string; invalid: boolean; onChange: (value: DraftValue) => void }) {
  const [text, setText] = useState(values.filter((v) => typeof v === 'string').join(', '));
  return (
    <input
      type="text"
      aria-label={label}
      aria-invalid={invalid}
      placeholder="de, fr, es"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(event.target.value.split(',').map((part) => part.trim()).filter(Boolean));
      }}
      className={`${BOX} w-56`}
    />
  );
}

function ManyInput({ field, options, values, label, invalid, onChange }: {
  field: FieldDef;
  options: ValueOptions;
  values: Scalar[];
  label: string;
  invalid: boolean;
  onChange: (value: DraftValue) => void;
}) {
  if (field.type === 'choice') {
    return (
      <fieldset aria-label={label} aria-invalid={invalid} className={`flex flex-wrap gap-x-3 rounded-lg border border-transparent px-2 ${INVALID}`}>
        {field.choices.map((choice) => (
          <Check
            key={choice.value}
            label={choice.label}
            checked={values.includes(choice.value)}
            onChange={() => onChange(values.includes(choice.value) ? values.filter((v) => v !== choice.value) : [...values, choice.value])}
          />
        ))}
      </fieldset>
    );
  }
  if (field.type === 'text') return <TextList values={values} label={label} invalid={invalid} onChange={onChange} />;
  const items = choicesOf(field, options);
  const nameOf = (v: Scalar) => (v === null ? hiddenName(field) : (items.find((item) => item.value === String(v))?.label ?? savedName(field, String(v), options.labels)));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.length > 0 ? (
        <ul aria-label={label} className="flex flex-wrap gap-1.5">
          {values.map((v, index) => (
            <Chip key={`${String(v)}-${index}`} name={nameOf(v)} hidden={v === null} onRemove={() => onChange(values.filter((_, i) => i !== index))} />
          ))}
        </ul>
      ) : null}
      <Select
        label={`${label}: add`}
        labelPosition="hidden"
        invalid={invalid}
        value=""
        onChange={(raw) => {
          const next = decode(field, raw);
          if (next !== undefined) onChange([...values, next]);
        }}
        options={[{ value: '', label: 'Add…' }, ...items.filter((item) => !values.some((v) => String(v) === item.value))]}
      />
    </div>
  );
}

/** The right input for a condition's field and operator (plan Decision 2):
 *  nothing for is empty / is not empty; a days box for a date window; two
 *  boxes for between; checkboxes, chips or a comma list for "is any of";
 *  a server-searched picker for an organisation or an account. */
export function ValueInput({ field, condition, options, label, invalid, onChange }: {
  field: FieldDef;
  condition: DraftCondition;
  options: ValueOptions;
  label: string;
  invalid: boolean;
  onChange: (value: DraftValue) => void;
}) {
  const shape = shapeOf(condition.op);
  const value = condition.value;
  if (shape === 'none') return null;
  if (field.record === 'customer' || field.record === 'account') {
    return (
      <RecordPicker
        record={field.record}
        multiple={shape === 'many'}
        value={value}
        label={label}
        labels={options.labels}
        invalid={invalid}
        onNamed={options.onNamed}
        onChange={onChange}
      />
    );
  }
  if (shape === 'days') {
    return <WindowDays value={Array.isArray(value) ? undefined : value} label={label} invalid={invalid} onChange={onChange} />;
  }
  if (shape === 'many') {
    return <ManyInput field={field} options={options} values={Array.isArray(value) ? value : []} label={label} invalid={invalid} onChange={onChange} />;
  }
  if (shape === 'two') {
    const pair = Array.isArray(value) && value.length === 2 ? value : [undefined, undefined];
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <ScalarInput field={field} options={options} value={pair[0]} label={`${label} from`} invalid={invalid} onChange={(next) => onChange([next, pair[1]])} />
        <span className={SUFFIX}>and</span>
        <ScalarInput field={field} options={options} value={pair[1]} label={`${label} to`} invalid={invalid} onChange={(next) => onChange([pair[0], next])} />
      </span>
    );
  }
  return <ScalarInput field={field} options={options} value={Array.isArray(value) ? undefined : value} label={label} invalid={invalid} onChange={onChange} />;
}

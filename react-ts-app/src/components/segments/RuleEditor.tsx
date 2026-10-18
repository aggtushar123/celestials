import { useId } from 'react';
import { Info, Plus, Trash2, X } from 'lucide-react';
import {
  addCondition,
  addGroup,
  conditionCount,
  isDraftGroup,
  leaves,
  removeNode,
  setMatch,
  updateCondition,
  withField,
  withOp,
  type DraftCondition,
  type DraftRules,
} from '../../features/segments/ruleDraft';
import { opText } from '../../features/segments/ruleSentence';
import { MAX_CONDITIONS, operatorsOf, type FieldDef } from '../../features/segments/segmentFields';
import type { Match, Operator } from '../../features/segments/segmentTypes';
import { BUTTON, ICON_BUTTON, NUM, QUIET, SegmentedControl, Select, TYPE } from '../ui';
import { ValueInput, type ValueOptions } from './ValueInput';

const MATCHES: { value: Match; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'any', label: 'Any' },
];
/** The word before a row: "Where" first, then the list's own "and"/"or". */
const CONNECTIVE = `w-12 shrink-0 ${TYPE.bodyMuted}`;
/** The row's remove button: shown on hover or focus where there is a
 *  mouse, always on touch screens (no hover to reveal it). */
const REVEAL = '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100';
/** Lines the word up with the first row of 44px (36px from sm) controls. */
const LEAD_PAD = 'pt-3 sm:pt-2';
const connective = (index: number, match: Match) => (index === 0 ? 'Where' : match === 'all' ? 'and' : 'or');
const SECTIONS = [
  { key: 'own', label: 'Fields' },
  { key: 'parent', label: 'Their organisation or account' },
  { key: 'attribute', label: 'AI attributes' },
] as const;

export interface RuleEditorProps {
  draft: DraftRules;
  /** The kind's fields; the first is what + Add condition starts on. */
  fields: FieldDef[];
  /** Passed to every value input. The caller owns `labels` and should merge
   *  each `onNamed` pick into them, or a just-picked record's chip reads
   *  "an organisation you can't open". */
  options: ValueOptions;
  /** The condition Save found unfinished. */
  invalidUid: string | null;
  /** A save's or the preview's `rules` 400. */
  error: string | null;
  /** The kind's plural noun, for "Include organisations that match…". */
  noun?: string;
  /** Shown under the rows (the organisation kind's churned/archived default). */
  note?: string | null;
  onChange: (draft: DraftRules) => void;
}

function FieldSelect({ fields, value, label, invalid, onChange }: {
  fields: FieldDef[];
  value: string;
  label: string;
  invalid: boolean;
  onChange: (key: string) => void;
}) {
  const known = fields.some((field) => field.key === value);
  return (
    <Select
      label={label}
      labelPosition="hidden"
      value={value}
      invalid={invalid && !known}
      onChange={onChange}
      className="max-w-[16rem]"
      options={[
        ...(known ? [] : [{ value, label: value }]),
        ...SECTIONS.map((section) => ({
          label: section.label,
          options: fields.filter((field) => field.section === section.key).map((field) => ({ value: field.key, label: field.label })),
        })).filter((group) => group.options.length > 0),
      ]}
    />
  );
}

function ConditionRow({ condition, number, lead, fields, options, invalid, onChange, onRemove }: {
  condition: DraftCondition;
  /** "Where", "and" or "or". */
  lead: string;
  number: number;
  fields: FieldDef[];
  options: ValueOptions;
  invalid: boolean;
  onChange: (condition: DraftCondition) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === condition.field) ?? null;
  const name = `Condition ${number}`;
  return (
    <li
      data-condition={condition.uid}
      className={`group/row flex items-start gap-2 rounded-lg border px-2 py-1.5 hover:bg-subtle ${invalid ? 'border-danger' : 'border-transparent'}`}
    >
      <span aria-hidden="true" className={`${CONNECTIVE} ${LEAD_PAD}`}>
        {lead}
      </span>
      {/* The controls wrap within their own column, under the field. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <FieldSelect
          fields={fields}
          value={condition.field}
          label={`${name} field`}
          invalid={invalid}
          onChange={(key) => {
            const next = fields.find((f) => f.key === key);
            if (next) onChange(withField(condition, next));
          }}
        />
        <Select
          label={`${name} operator`}
          labelPosition="hidden"
          value={condition.op}
          disabled={!field}
          onChange={(op) => {
            if (field) onChange(withOp(condition, field, op as Operator));
          }}
          options={(field ? operatorsOf(field) : [condition.op]).map((op) => ({ value: op, label: opText(op, field) }))}
        />
        {field ? (
          <ValueInput field={field} condition={condition} options={options} label={`${name} value`} invalid={invalid} onChange={(value) => onChange({ ...condition, value })} />
        ) : null}
        {invalid ? (
          <p className="basis-full text-[11px] leading-4 text-danger-ink">
            {field ? 'Finish this condition, or remove it.' : 'This field no longer exists. Choose another, or remove it.'}
          </p>
        ) : null}
      </div>
      <button type="button" onClick={onRemove} aria-label={`Remove condition ${number}`} className={`${ICON_BUTTON} ${REVEAL}`}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/** The rules as readable rows (spec §3): an All/Any switch, conditions and
 *  one level of groups, + Add condition and + Add group, the right value
 *  input per field. */
export function RuleEditor({ draft, fields, options, invalidUid, error, noun = 'records', note = null, onChange }: RuleEditorProps) {
  const headingId = useId();
  const count = conditionCount(draft);
  const full = count >= MAX_CONDITIONS;
  const first = fields[0];
  const numbers = new Map(leaves(draft).map((condition, index) => [condition.uid, index + 1]));
  const groupNumbers = new Map(draft.conditions.filter(isDraftGroup).map((group, index) => [group.uid, index + 1]));

  const row = (condition: DraftCondition, lead: string) => (
    <ConditionRow
      key={condition.uid}
      condition={condition}
      number={numbers.get(condition.uid) ?? 0}
      lead={lead}
      fields={fields}
      options={options}
      invalid={condition.uid === invalidUid}
      onChange={(next) => onChange(updateCondition(draft, condition.uid, () => next))}
      onRemove={() => onChange(removeNode(draft, condition.uid))}
    />
  );

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 py-4">
      <h2 id={headingId} className={TYPE.title}>
        Rules
      </h2>
      <div className={`flex flex-wrap items-center gap-2 ${TYPE.body}`}>
        <span>Include {noun} that match</span>
        <SegmentedControl label="Match" options={MATCHES} value={draft.match} onChange={(match) => onChange(setMatch(draft, match))} />
        <span>of these conditions</span>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {error}
        </p>
      ) : null}
      {draft.conditions.length === 0 ? (
        <p className={`rounded-lg border border-dashed border-line px-3 py-4 text-center ${TYPE.bodyMuted}`}>
          No conditions yet. With none, only pinned records are members.
        </p>
      ) : (
        <ul aria-label="Conditions" className="-mx-2 flex flex-col gap-1">
          {draft.conditions.map((node, index) => {
            const lead = connective(index, draft.match);
            if (!isDraftGroup(node)) return row(node, lead);
            const n = groupNumbers.get(node.uid) ?? 0;
            return (
              <li key={node.uid} data-group={node.uid} className="flex items-start gap-2 px-2 py-1.5">
                <span aria-hidden="true" className={`${CONNECTIVE} ${LEAD_PAD}`}>
                  {lead}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 border-l-2 border-line pl-2">
                  <div className={`flex flex-wrap items-center gap-2 ${TYPE.body}`}>
                    <span>Match</span>
                    <SegmentedControl label={`Group ${n} match`} options={MATCHES} value={node.match} onChange={(match) => onChange(setMatch(draft, match, node.uid))} />
                    <span>of these</span>
                    <button type="button" onClick={() => onChange(removeNode(draft, node.uid))} aria-label={`Remove group ${n}`} className={`${ICON_BUTTON} ml-auto`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <ul aria-label={`Group ${n} conditions`} className="-ml-2 flex flex-col gap-1">
                    {node.conditions.map((condition, inner) => row(condition, connective(inner, node.match)))}
                  </ul>
                  <button type="button" disabled={full} onClick={() => onChange(addCondition(draft, first, node.uid))} className={`${QUIET} self-start`}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add condition to group
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={full} onClick={() => onChange(addCondition(draft, first))} className={BUTTON}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add condition
        </button>
        <button type="button" disabled={full} onClick={() => onChange(addGroup(draft, first))} className={QUIET}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add group
        </button>
        {full ? (
          <p className={`ml-auto ${TYPE.meta}`}>
            A segment can have at most <span className={NUM}>{MAX_CONDITIONS}</span> conditions.
          </p>
        ) : count > 0 ? (
          <p className={`ml-auto ${TYPE.meta}`}>
            <span className={NUM}>{count}</span> of <span className={NUM}>{MAX_CONDITIONS}</span> conditions
          </p>
        ) : null}
      </div>
      {note ? (
        <p className={`flex items-start gap-1.5 ${TYPE.meta}`}>
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {note}
        </p>
      ) : null}
    </section>
  );
}

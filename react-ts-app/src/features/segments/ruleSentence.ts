// A segment's rules as one sentence (spec §3: "the rules as one sentence"),
// built on the client (plan Decision 1): field and operator words from the
// registry mirror, record names only from the server's `labels`. An id with
// no label, or a null one, is a record the reader can't open and is never
// named.
import type { AIAttribute } from '../attributes/types';
import { formatDate } from '../customers/formatters';
import { findField, KIND_LABEL, KIND_NOUN, type FieldDef, type RecordKind } from './segmentFields';
import type { Condition, ConditionGroup, Match, Operator, RuleLabels, RuleScalar, Rules, SegmentKind } from './segmentTypes';

export interface SentencePart {
  text: string;
  role: 'kind' | 'field' | 'op' | 'value' | 'join' | 'hidden';
  /** Set when the part is a figure (a count, a percent, a score, a number
   *  of days): it renders in DM Mono. Decided here, when the part is built
   *  from the field's type and the operator — never guessed afterwards from
   *  the text, which would miss a negative NPS ("-5" has no leading digit)
   *  and wrongly catch a name that happens to start with one ("3M"). */
  numeric?: boolean;
}

export const HIDDEN_NAME: Record<RecordKind, string> = {
  customer: "an organisation you can't open",
  account: "an account you can't open",
  product: "a product you can't open",
  user: "an owner you can't open",
};

const LABEL_GROUP: Record<RecordKind, keyof RuleLabels> = {
  customer: 'organisations',
  account: 'accounts',
  product: 'products',
  user: 'people',
};

/** "2026-10-05" → "5 Oct 2026", read as a calendar day, whatever the time
 *  zone (shared with every other date-only reading in the app: `formatDate`
 *  parses the string, never a `Date`). */
export function dayText(iso: string): string {
  return formatDate(iso);
}

export function opText(op: Operator, field: FieldDef | null): string {
  const date = field?.type === 'date';
  switch (op) {
    case 'is':
      return 'is';
    case 'is_not':
      return 'is not';
    case 'in':
      return 'is any of';
    case 'gt':
      return date ? 'is after' : 'is more than';
    case 'lt':
      return date ? 'is before' : 'is less than';
    case 'between':
      return 'is between';
    case 'within_next':
      return 'is in the next';
    case 'within_last':
      return 'was in the last';
    case 'is_empty':
      // "Days since" with no date: never touched, never contacted.
      return field?.type === 'days' ? 'is never' : 'is empty';
    case 'is_not_empty':
      return 'is not empty';
  }
}

function valuePart(value: RuleScalar, field: FieldDef | null, op: Operator, labels: RuleLabels): SentencePart {
  if (field?.record) {
    if (field.type === 'owner' && value === 'unassigned') return { text: 'Unassigned', role: 'value' };
    const name = value === null ? undefined : labels[LABEL_GROUP[field.record]][String(value)];
    return name ? { text: name, role: 'value' } : { text: HIDDEN_NAME[field.record], role: 'hidden' };
  }
  if (field?.type === 'boolean') return { text: value ? 'yes' : 'no', role: 'value' };
  if (field?.type === 'choice') return { text: field.choices.find((c) => c.value === value)?.label ?? String(value), role: 'value' };
  if (op === 'within_next' || op === 'within_last' || field?.type === 'days') return { text: `${value} days`, role: 'value', numeric: true };
  if (field?.type === 'date') return { text: dayText(String(value)), role: 'value' };
  if (field?.type === 'text') return { text: `"${value}"`, role: 'value' };
  return { text: String(value), role: 'value', numeric: true };
}

/** One condition: "CSAT %", " is less than", " ", "60". A field the mirror
 *  does not know reads as its bare key. */
export function conditionParts(condition: Condition, field: FieldDef | null, labels: RuleLabels): SentencePart[] {
  const parts: SentencePart[] = [
    { text: field?.label ?? condition.field.replace(/^parent\./, '').replace(/^attr:/, ''), role: 'field' },
    { text: ` ${opText(condition.op, field)}`, role: 'op' },
  ];
  if (condition.op === 'is_empty' || condition.op === 'is_not_empty') return parts;
  const values = Array.isArray(condition.value) ? condition.value : [condition.value ?? null];
  const joiner = condition.op === 'between' ? ' and ' : ', ';
  values.forEach((value, index) => {
    parts.push({ text: index === 0 ? ' ' : joiner, role: 'join' });
    parts.push(valuePart(value, field, condition.op, labels));
  });
  return parts;
}

const isGroup = (condition: Condition | ConditionGroup): condition is ConditionGroup => 'group' in condition;

function joined(items: SentencePart[][], match: Match): SentencePart[] {
  return items.flatMap((item, index) => (index === 0 ? item : [{ text: match === 'all' ? ' and ' : ' or ', role: 'join' as const }, ...item]));
}

export function ruleSentence(rules: Rules, kind: SegmentKind, labels: RuleLabels, attributes: AIAttribute[]): SentencePart[] {
  if (rules.conditions.length === 0) {
    return [{ text: `No rules: only pinned ${KIND_NOUN[kind].many} are members`, role: 'join' }];
  }
  const leaf = (condition: Condition) => conditionParts(condition, findField(kind, condition.field, attributes), labels);
  const items = rules.conditions.map((condition) =>
    isGroup(condition)
      ? [{ text: '(', role: 'join' as const }, ...joined(condition.group.conditions.map(leaf), condition.group.match), { text: ')', role: 'join' as const }]
      : leaf(condition),
  );
  return [{ text: KIND_LABEL[kind], role: 'kind' }, { text: ' where ', role: 'join' }, ...joined(items, rules.match)];
}

export function sentenceText(parts: SentencePart[]): string {
  return parts.map((part) => part.text).join('');
}

/** A change's reason: the field keys that changed the match, or what
 *  happened to the record itself. Never a value. */
export function reasonText(keys: string[], direction: 'entered' | 'left', kind: SegmentKind, attributes: AIAttribute[]): string {
  return keys
    .map((key) => {
      if (key === 'pinned') return direction === 'entered' ? 'Pinned' : 'Unpinned';
      if (key === 'deleted') return 'Deleted';
      if (key === 'access') return "No longer in the owner's book";
      if (key === 'churned') return 'Churned';
      if (key === 'archived') return 'Archived';
      return findField(kind, key, attributes)?.label ?? key.replace(/^parent\./, '').replace(/^attr:/, '');
    })
    .join(', ');
}

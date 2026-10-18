// The builder's rules while they are being written: every condition and
// group carries a uid (React keys, the "unfinished" mark), a value may be
// missing, and the edits keep the backend's shape rules (one level of
// groups, no empty group). `toRules` strips the uids for the API.
import { operatorsOf, VALUELESS, type FieldDef } from './segmentFields';
import type { Condition, Match, Operator, RuleScalar, Rules } from './segmentTypes';

export type DraftValue = RuleScalar | undefined | (RuleScalar | undefined)[];

export interface DraftCondition {
  uid: string;
  field: string;
  op: Operator;
  value: DraftValue;
}

export interface DraftGroup {
  uid: string;
  match: Match;
  conditions: DraftCondition[];
}

export type DraftNode = DraftCondition | DraftGroup;

export interface DraftRules {
  match: Match;
  conditions: DraftNode[];
}

/** What value an operator takes: none, one, a range, a list, or a number of days. */
export type Shape = 'none' | 'one' | 'two' | 'many' | 'days';

let counter = 0;
const nextUid = () => `rule-${++counter}`;

export const isDraftGroup = (node: DraftNode): node is DraftGroup => 'match' in node;

export function fromRules(rules: Rules | null | undefined): DraftRules {
  const leaf = (condition: Condition): DraftCondition => ({ uid: nextUid(), field: condition.field, op: condition.op, value: condition.value });
  return {
    match: rules?.match ?? 'all',
    conditions: (rules?.conditions ?? []).map((condition) =>
      'group' in condition ? { uid: nextUid(), match: condition.group.match, conditions: condition.group.conditions.map(leaf) } : leaf(condition),
    ),
  };
}

export function toRules(draft: DraftRules): Rules {
  const leaf = ({ field, op, value }: DraftCondition): Condition =>
    value === undefined ? { field, op } : { field, op, value: value as Condition['value'] };
  return {
    match: draft.match,
    conditions: draft.conditions.map((node) => (isDraftGroup(node) ? { group: { match: node.match, conditions: node.conditions.map(leaf) } } : leaf(node))),
  };
}

export function shapeOf(op: Operator): Shape {
  if (VALUELESS.includes(op)) return 'none';
  if (op === 'between') return 'two';
  if (op === 'in') return 'many';
  if (op === 'within_next' || op === 'within_last') return 'days';
  return 'one';
}

export function initialValue(field: FieldDef, op: Operator): DraftValue {
  const shape = shapeOf(op);
  if (shape === 'two') return [undefined, undefined];
  if (shape === 'many') return [];
  if (shape === 'one' && field.type === 'boolean') return true;
  return undefined;
}

export function newCondition(field: FieldDef): DraftCondition {
  const op = operatorsOf(field)[0];
  return { uid: nextUid(), field: field.key, op, value: initialValue(field, op) };
}

export function withField(condition: DraftCondition, field: FieldDef): DraftCondition {
  const op = operatorsOf(field)[0];
  return { ...condition, field: field.key, op, value: initialValue(field, op) };
}

/** A new operator keeps the value where its shape allows (60 stays 60 from
 *  "more than" to "less than"; "is Live" becomes "is any of Live"). */
export function withOp(condition: DraftCondition, field: FieldDef, op: Operator): DraftCondition {
  const from = shapeOf(condition.op);
  const to = shapeOf(op);
  const value = condition.value;
  const first = Array.isArray(value) ? value[0] : value;
  let next: DraftValue;
  if (from === to) next = value;
  else if (from === 'one' && to === 'two') next = [first, undefined];
  else if ((from === 'two' || from === 'many') && to === 'one') next = first;
  else if (from === 'one' && to === 'many') next = first === undefined ? [] : [first];
  else next = initialValue(field, op);
  return { ...condition, op, value: next };
}

const filled = (value: RuleScalar | undefined) => value !== undefined && value !== '';

/** Whether the condition can be sent: a known field, an operator it takes,
 *  and every value that operator needs. A `null` (a record the reader can't
 *  open, kept from saved rules) counts as a value. */
export function isComplete(condition: DraftCondition, field: FieldDef | null): boolean {
  if (!field || !operatorsOf(field).includes(condition.op)) return false;
  const value = condition.value;
  switch (shapeOf(condition.op)) {
    case 'none':
      return true;
    case 'two':
      return Array.isArray(value) && value.length === 2 && value.every(filled);
    case 'many':
      return Array.isArray(value) && value.length > 0;
    default:
      return !Array.isArray(value) && filled(value);
  }
}

export function leaves(draft: DraftRules): DraftCondition[] {
  return draft.conditions.flatMap((node) => (isDraftGroup(node) ? node.conditions : [node]));
}

/** Counting each condition inside a group, as the 20 limit does. */
export function conditionCount(draft: DraftRules): number {
  return leaves(draft).length;
}

export function firstIncomplete(draft: DraftRules, fieldOf: (key: string) => FieldDef | null): string | null {
  return leaves(draft).find((condition) => !isComplete(condition, fieldOf(condition.field)))?.uid ?? null;
}

export function addCondition(draft: DraftRules, field: FieldDef, groupUid?: string): DraftRules {
  const condition = newCondition(field);
  if (!groupUid) return { ...draft, conditions: [...draft.conditions, condition] };
  return {
    ...draft,
    conditions: draft.conditions.map((node) => (isDraftGroup(node) && node.uid === groupUid ? { ...node, conditions: [...node.conditions, condition] } : node)),
  };
}

/** A group asks the other question: inside "all", a group of "any". */
export function addGroup(draft: DraftRules, field: FieldDef): DraftRules {
  const match: Match = draft.match === 'all' ? 'any' : 'all';
  return { ...draft, conditions: [...draft.conditions, { uid: nextUid(), match, conditions: [newCondition(field)] }] };
}

export function updateCondition(draft: DraftRules, uid: string, update: (condition: DraftCondition) => DraftCondition): DraftRules {
  const one = (condition: DraftCondition) => (condition.uid === uid ? update(condition) : condition);
  return { ...draft, conditions: draft.conditions.map((node) => (isDraftGroup(node) ? { ...node, conditions: node.conditions.map(one) } : one(node))) };
}

/** Removes a condition or a group. A group never stays empty (the backend
 *  refuses one), so removing its last condition removes it too. */
export function removeNode(draft: DraftRules, uid: string): DraftRules {
  const conditions: DraftNode[] = [];
  for (const node of draft.conditions) {
    if (node.uid === uid) continue;
    if (isDraftGroup(node)) {
      const inner = node.conditions.filter((condition) => condition.uid !== uid);
      if (inner.length > 0) conditions.push({ ...node, conditions: inner });
    } else {
      conditions.push(node);
    }
  }
  return { ...draft, conditions };
}

export function setMatch(draft: DraftRules, match: Match, groupUid?: string): DraftRules {
  if (!groupUid) return { ...draft, match };
  return { ...draft, conditions: draft.conditions.map((node) => (isDraftGroup(node) && node.uid === groupUid ? { ...node, match } : node)) };
}

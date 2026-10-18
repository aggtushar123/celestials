// Department heads (Slack escalations D2 contract §2) and the account
// team's line for a row nobody holds (spec §4.4). Kept free of React. No em dash.
import { apiFetch } from '../../lib/apiClient';
import type { UserFunction } from '../auth/authSlice';

export interface FunctionHeadRow {
  function: UserFunction;
  function_display: string;
  /** Null when nobody heads it, or the head left or moved (SE2-4). */
  user: { id: number; name: string } | null;
}

export const fetchFunctionHeads = () => apiFetch<FunctionHeadRow[]>('/function-heads/');

/** Both keys always: a missing user_id never clears a head (contract §2). */
export const setFunctionHead = (fn: UserFunction, userId: number | null) =>
  apiFetch<FunctionHeadRow[]>('/function-heads/', { method: 'PATCH', body: { function: fn, user_id: userId } });

export const HEADS = {
  TITLE: 'Department heads',
  INTRO: "When nobody on a customer's account team works in a department, its head takes the customer's escalations.",
  READ_ONLY: 'Only someone who manages organisation settings can change them.',
  LOADING: 'Loading department heads',
  LOAD: 'Could not load the department heads.',
  NOBODY: 'Nobody',
  SAVE: 'Could not save.',
  noMembers: (label: string) => `Nobody works in ${label} yet.`,
} as const;

export const TEAM = {
  TITLE: 'Account team',
  LOADING: 'Loading the account team',
  LOAD: 'Could not load the account team.',
  NOBODY_YET: 'Nobody yet',
  OWNER: 'Account owner',
  SAVE: 'Could not change who is responsible.',
  meta: (name: string) => `Who handles ${name} in each department`,
  picker: (label: string) => `${label} on the account team`,
} as const;

/** The line under an account-team row (Decision 3, SE2-4): '' when someone on
 *  duty has it. A person who is deactivated, or who no longer works in this
 *  function (`moved`), is off duty; deactivated wins when both. `head` is
 *  undefined while the heads are not known. */
export function teamLine({
  label,
  person,
  deactivated,
  moved,
  head,
}: {
  label: string;
  person: { id: number; name: string } | null;
  deactivated: boolean;
  moved: boolean;
  head: { id: number; name: string } | null | undefined;
}): string {
  if (person && !deactivated && !moved) return '';
  let start: string = TEAM.NOBODY_YET;
  if (person) start = deactivated ? `${person.name} is deactivated` : `${person.name} is no longer in ${label}`;
  if (head === undefined) return start;
  if (head === null) return `${start} · No ${label} head is set`;
  return `${start} · ${head.name} (${label} head) takes it`;
}

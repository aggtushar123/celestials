// Test-only: department heads, the account team and the workspace's people
// in the Slack escalations D2 contract's shapes (§2, §3), and a stub for
// /function-heads/, /customers/<id>/responsible/ and /auth/members/ that
// passes every other request on. Fake people. No em dash.
import { vi } from 'vitest';
import { FUNCTION_LABELS, type UserFunction } from '../auth/authSlice';
import type { FunctionHeadRow } from './functionHeads';

type Person = { id: number; name: string };
const FUNCTIONS = Object.keys(FUNCTION_LABELS) as UserFunction[];

export const headsWith = (named: Partial<Record<UserFunction, Person>>): FunctionHeadRow[] =>
  FUNCTIONS.map((fn) => ({ function: fn, function_display: FUNCTION_LABELS[fn], user: named[fn] ?? null }));

export const NO_HEADS = headsWith({});
export const HEADS_JESH = headsWith({ engineering: { id: 12, name: 'Jesh Sanghvi' } });

/** GET /auth/members/ (the fields the card reads). Ann has left. */
export const TEAM_MEMBERS: { id: number; name: string; function: UserFunction; is_active: boolean }[] = [
  { id: 2, name: 'Carl CSM', function: 'cs', is_active: true },
  { id: 11, name: 'Faiz Jamal', function: 'cs', is_active: true },
  { id: 12, name: 'Jesh Sanghvi', function: 'engineering', is_active: true },
  { id: 13, name: 'Erin Engineer', function: 'engineering', is_active: true },
  { id: 14, name: 'Ann Former', function: 'engineering', is_active: false },
  { id: 15, name: 'Sam Seller', function: 'sales', is_active: true },
];

export interface AccountTeamStub {
  /** The account team, Customer Success excluded (it is the owner). */
  team?: Partial<Record<UserFunction, Person>>;
  owner?: (Person & { function: UserFunction }) | null;
  heads?: FunctionHeadRow[];
  /** Fail this many reads of /responsible/ first. */
  failTeam?: number;
  /** Fail this many reads of /function-heads/ first. */
  failHeads?: number;
  refuseTeam?: { status: number; body: unknown };
  refuseHead?: { status: number; body: unknown };
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const bodyOf = (init?: RequestInit) => (init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {});

export function stubAccountTeam(stub: AccountTeamStub = {}) {
  const next = globalThis.fetch as unknown as Fetch;
  const team: Partial<Record<UserFunction, Person>> = { ...(stub.team ?? {}) };
  let owner = stub.owner ?? null;
  let heads = [...(stub.heads ?? NO_HEADS)];
  let teamFailures = stub.failTeam ?? 0;
  let headFailures = stub.failHeads ?? 0;
  const teamPatches: Record<string, unknown>[] = [];
  const headPatches: Record<string, unknown>[] = [];
  const person = (id: unknown) => TEAM_MEMBERS.find((m) => m.id === id) ?? null;
  const payload = (customerId: number) => ({
    customer_id: customerId,
    account_owner: owner,
    responsible: FUNCTIONS.map((fn) => ({
      function: fn,
      function_display: FUNCTION_LABELS[fn],
      user: fn === 'cs' ? (owner ? { id: owner.id, name: owner.name } : null) : (team[fn] ?? null),
    })),
  });

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    if (path === '/auth/members/' && method === 'GET') return json(200, TEAM_MEMBERS);
    if (path === '/function-heads/') {
      if (method === 'PATCH') {
        const body = bodyOf(init);
        headPatches.push(body);
        if (stub.refuseHead) return json(stub.refuseHead.status, stub.refuseHead.body);
        const member = person(body.user_id);
        heads = heads.map((row) => (row.function === body.function ? { ...row, user: member ? { id: member.id, name: member.name } : null } : row));
        return json(200, heads);
      }
      if (headFailures > 0) {
        headFailures -= 1;
        return json(500, { detail: 'Down.' });
      }
      return json(200, heads);
    }
    const responsible = /^\/customers\/(\d+)\/responsible\/$/.exec(path);
    if (responsible) {
      const id = Number(responsible[1]);
      if (method === 'PATCH') {
        const body = bodyOf(init);
        teamPatches.push(body);
        if (stub.refuseTeam) return json(stub.refuseTeam.status, stub.refuseTeam.body);
        const member = person(body.user_id);
        const fn = body.function as UserFunction;
        if (fn === 'cs') owner = member ? { id: member.id, name: member.name, function: member.function } : null;
        else if (member) team[fn] = { id: member.id, name: member.name };
        else delete team[fn];
        return json(200, payload(id));
      }
      if (teamFailures > 0) {
        teamFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      return json(200, payload(id));
    }
    return next(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, teamPatches, headPatches };
}

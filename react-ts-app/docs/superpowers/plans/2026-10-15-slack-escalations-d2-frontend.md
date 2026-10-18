# Slack escalations, delivery 2 (frontend): Account team and department heads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organisation's Details tab shows its **Account team**: one row per department (function), Customer Success showing the owner, each a person picker for people allowed to change it, and an empty row saying who takes it instead ("Nobody yet · Jesh Sanghvi (Engineering head) takes it"). Settings › People & teams gains **Department heads**: one row per function with a picker of that function's active members, saved the moment it changes with Undo, read-only for people who cannot manage organisation settings.

**Architecture:** One small API module, `features/knowledge/functionHeads.ts` (types, `fetchFunctionHeads`, `setFunctionHead`, the words, and `teamLine`, the empty row's sentence), shared by two components: `components/organizations/detail/AccountTeamCard.tsx` (reads and writes the account team through the existing knowledge slice's `fetchResponsible` / `setResponsible`, the people through `useMembers`, the heads through `fetchFunctionHeads`), rendered last on `DetailsTab`; and `pages/users/DepartmentHeadsSection.tsx` (local state, `useInstantSave`), rendered under Members on `UserManagement`. Fixtures in `features/knowledge/testHeads.ts`. No new route, no new slice.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Redux Toolkit (the existing `knowledge` slice only), Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react (no new icon needed).

**Spec:** `docs/superpowers/specs/2026-10-15-slack-escalations-design.md` §2 (decisions 3, 9), §4.4 (screens), §9 (the D2 row), §10, §11 step 2, on `main`. **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/slackd2-be/docs/superpowers/plans/2026-10-15-slack-escalations-d2-api.md` (backend branch `feat/slack-escalations-d2`). Read its "Decisions narrowing the spec" first (SE2-1 to SE2-11); §2 (`/function-heads/` shapes and refusals) and §3 (`/responsible/` unchanged) are the stubs' and types' source of truth. The D1 frontend plan and its merged code (#150) hold the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/slackd2-fe`, branch `feat/slack-escalations-d2` (cut from main `2ffebd25`: D1 #150 merged; its first commit holds this plan). Link `node_modules` once: `ln -s ../main-fe/node_modules node_modules` (never commit it). Always `git add <explicit paths>`, never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 4 uses 8018 and 5188).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Stubs answer exactly the contract's shapes and sentences; server refusals are shown verbatim.
- **Load `revenact-design` first** (the repo skill): Kinso look, tokens only (`src/test/houseRules.ts` `RAW`), monochrome primary, four type sizes through `TYPE.*`, `FIELD_ERROR`; weights 400 and 600 only; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`. **The UI ratchet** (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`: new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** a bordered quiet card (`Card`), flat `divide-y` rows, no card inside a card, one always-visible control per row (the picker), ` · ` between meta items, no badge needed. Neither surface has a primary button (both save on change). Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every control: `Select` (`SELECT`), `BUTTON` (the error state's Try again).
- **No em dash (`—`) anywhere** in the files this plan creates or changes (comments and tests included), and in no new copy.
- **Copy:** sentence case, plain words, word for word as this plan and the contract give them; server sentences shown verbatim.
- **States:** both surfaces have loading (`LoadingState`, `role="status"`), a read error (`ErrorState`, `role="alert"`, with Try again), and each row's refusal under its picker (`FIELD_ERROR`, `role="alert"`).
- **Motion:** none added.
- **Privacy:** the page shows only what the server sends; no email is shown anywhere new; the heads list names members of the reader's own workspace only (SE2-10).
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **Where the card sits.** Last on Details, after "Organization details" (Accounts, then details, then the team). Existing Details tests keep their order. Cost: trivial.
2. **The card's rows** are the six functions in `FUNCTION_LABELS` order, built from that list (not from the server's array), so an empty or partial `/responsible/` answer still draws six rows. Each row: the function (`TYPE.label`) and, under it, its line (`TYPE.meta`); on the right, the picker (people with `view_all_accounts`, the existing `/responsible/` PATCH rule) or the person's name (`TYPE.body font-semibold`) for everyone else. Cost: low.
3. **The line** (`teamLine`, spec §4.4): empty, a head known: "Nobody yet · Jesh Sanghvi (Engineering head) takes it"; empty, no head: "Nobody yet · No Engineering head is set"; empty, heads not known (still loading or the read failed): "Nobody yet"; the person is deactivated (from `/auth/members/` `is_active`): "Ann Former is deactivated · Jesh Sanghvi (Engineering head) takes it" (SE2-4: the backend skips them too); someone on duty: no line, except Customer Success, which reads "Account owner". A head is never a deactivated person (the server reads such a head as `null`). Cost: low.
4. **The pickers** offer "Nobody yet" and the **active** members of that function (`/auth/members/` filtered by `function` and `is_active`), plus the current person when they are not among them (so the picker always shows who it is). Customer Success is filtered the same way: the card names a Customer Success person, while the Knowledge tab's owner tile (any function, with a handover note) stays the place for an owner from another function. Choosing saves at once through `setResponsible`; while it saves, every picker on the card is disabled; a refusal (for example the server's "Only the current account owner, their management chain or an organisation-settings manager can reassign this account.") shows under that row. No toast: the Knowledge tab's pickers save the same way. Cost: low.
5. **Department heads** live on People & teams › Members, below the Members table, as a `SettingsSection` of six `SettingsRow`s ("Customer Success", "Engineering", ...), each with a `Select` ("Nobody" and that function's active members). A function with no active member shows the hint "Nobody works in Analytics yet.". Saved on change with `useInstantSave` ("Saved", Undo sends the previous head back). Cost: low.
6. **Who may change the heads.** The page needs `manage_users`; the PATCH needs `manage_org_settings` (SE2-5). Without `manage_org_settings` the section still shows who heads each department, its pickers are disabled, and the description adds "Only someone who manages organisation settings can change them." Cost: trivial (every built-in admin has both).
7. **No slice for heads.** The two surfaces are on different routes and each reads `/function-heads/` once when it mounts; a shared cache is not worth a slice. Cost: trivial (one extra request when both are visited).

## File Structure

**Create**
- `src/features/knowledge/functionHeads.ts` (+ `functionHeads.test.ts`): `FunctionHeadRow`, `fetchFunctionHeads()`, `setFunctionHead(fn, userId)`, `HEADS` and `TEAM` words, `teamLine(...)`.
- `src/features/knowledge/testHeads.ts`: `headsWith`, `NO_HEADS`, `HEADS_JESH`, `TEAM_MEMBERS`, `stubAccountTeam(stub)`.
- `src/components/organizations/detail/AccountTeamCard.tsx` (+ `.test.tsx`).
- `src/pages/users/DepartmentHeadsSection.tsx` (+ `.test.tsx`).
- `src/e2e/accountTeam.test.tsx`.

**Modify**
- `src/pages/organizations/testDetail.tsx` (`makeDetailStore(permissions = ALL_CAPABILITIES)`).
- `src/features/organizations/testStory.ts` (`stubOrganizationPage` answers `GET /function-heads/` with six empty rows).
- `src/components/organizations/detail/DetailsTab.tsx` (the card), `src/pages/users/UserManagement.tsx` (the section), `src/pages/users/UserManagement.test.tsx` (an `auth` slice in its store; `/function-heads/` in its stub).
- Docs (Task 4): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Types, words, the API and the fixtures

**Files:**
- Create: `src/features/knowledge/functionHeads.ts`, `src/features/knowledge/functionHeads.test.ts`, `src/features/knowledge/testHeads.ts`
- Modify: `src/pages/organizations/testDetail.tsx`, `src/features/organizations/testStory.ts`

**Interfaces:**
- Produces (`functionHeads.ts`): `FunctionHeadRow { function: UserFunction; function_display: string; user: { id: number; name: string } | null }`; `fetchFunctionHeads(): Promise<FunctionHeadRow[]>`; `setFunctionHead(fn: UserFunction, userId: number | null): Promise<FunctionHeadRow[]>`; `HEADS`, `TEAM` (words); `teamLine({ label, person, deactivated, head }): string` where `head` is `{ id; name } | null` (no head) or `undefined` (not known).
- Produces (`testHeads.ts`): `headsWith(named): FunctionHeadRow[]`, `NO_HEADS`, `HEADS_JESH` (Engineering: Jesh Sanghvi, id 12), `TEAM_MEMBERS` (fake people, ids 2 and 11 to 15), `stubAccountTeam(stub?) -> { spy, teamPatches, headPatches }`.
- Produces (`testDetail.tsx`): `makeDetailStore(permissions?: Capability[])`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/knowledge/functionHeads.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFunctionHeads, setFunctionHead, teamLine } from './functionHeads';
import { HEADS_JESH, NO_HEADS } from './testHeads';

afterEach(() => vi.unstubAllGlobals());

const JESH = { id: 12, name: 'Jesh Sanghvi' };

describe('department heads (Slack escalations D2 contract §2)', () => {
  it('reads the six rows', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => HEADS_JESH }));
    vi.stubGlobal('fetch', spy);
    expect(await fetchFunctionHeads()).toEqual(HEADS_JESH);
    expect(new URL(String((spy.mock.calls[0] as unknown[])[0])).pathname).toBe('/api/v1/function-heads/');
  });

  it('names or clears one head with both keys', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => NO_HEADS }));
    vi.stubGlobal('fetch', spy);
    await setFunctionHead('engineering', null);
    const init = (spy.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ function: 'engineering', user_id: null });
  });
});

describe('the account team line (spec §4.4, Decision 3)', () => {
  it('says who takes an empty row', () => {
    expect(teamLine({ label: 'Engineering', person: null, deactivated: false, head: JESH })).toBe('Nobody yet · Jesh Sanghvi (Engineering head) takes it');
    expect(teamLine({ label: 'Sales', person: null, deactivated: false, head: null })).toBe('Nobody yet · No Sales head is set');
    expect(teamLine({ label: 'Sales', person: null, deactivated: false, head: undefined })).toBe('Nobody yet');
  });

  it('says so when the person left', () => {
    expect(teamLine({ label: 'Engineering', person: { id: 14, name: 'Ann Former' }, deactivated: true, head: JESH })).toBe(
      'Ann Former is deactivated · Jesh Sanghvi (Engineering head) takes it',
    );
  });

  it('is empty when someone on duty has it', () => {
    expect(teamLine({ label: 'Engineering', person: { id: 13, name: 'Erin Engineer' }, deactivated: false, head: JESH })).toBe('');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/knowledge/functionHeads.test.ts --maxWorkers=2`
Expected: FAIL: cannot resolve `./functionHeads`.

- [ ] **Step 3: The module and the fixtures**

Create `src/features/knowledge/functionHeads.ts`:

```ts
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

/** The line under an account-team row (Decision 3): '' when someone on duty
 *  has it. `head` is undefined while the heads are not known. */
export function teamLine({
  label,
  person,
  deactivated,
  head,
}: {
  label: string;
  person: { id: number; name: string } | null;
  deactivated: boolean;
  head: { id: number; name: string } | null | undefined;
}): string {
  if (person && !deactivated) return '';
  const start = person ? `${person.name} is deactivated` : TEAM.NOBODY_YET;
  if (head === undefined) return start;
  if (head === null) return `${start} · No ${label} head is set`;
  return `${start} · ${head.name} (${label} head) takes it`;
}
```

Create `src/features/knowledge/testHeads.ts`:

```ts
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
  failHeads?: boolean;
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
      return stub.failHeads ? json(500, { detail: 'Down.' }) : json(200, heads);
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
```

`src/pages/organizations/testDetail.tsx`: `makeDetailStore()` becomes `makeDetailStore(permissions: Capability[] = ALL_CAPABILITIES)` with `permissions` in the preloaded user instead of `ALL_CAPABILITIES`; add `import type { Capability } from '../../features/auth/authSlice';`. Every existing caller is unchanged.

`src/features/organizations/testStory.ts`, in `stubOrganizationPage`'s `GET` branch beside the `responsible` line:

```ts
      if (path === '/function-heads/') return json(200, NO_HEADS);
```

with `import { NO_HEADS } from '../knowledge/testHeads';` at the top.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/features/knowledge src/components/organizations/detail --maxWorkers=2 && npx tsc -b`
Expected: PASS; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/knowledge/functionHeads.ts src/features/knowledge/functionHeads.test.ts src/features/knowledge/testHeads.ts src/pages/organizations/testDetail.tsx src/features/organizations/testStory.ts
git commit -m "feat(knowledge): department heads API, words and the account team line

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The Account team card on Details

**Files:**
- Create: `src/components/organizations/detail/AccountTeamCard.tsx`, `src/components/organizations/detail/AccountTeamCard.test.tsx`
- Modify: `src/components/organizations/detail/DetailsTab.tsx`

**Interfaces:**
- Consumes: `fetchFunctionHeads`, `teamLine`, `TEAM` (Task 1); `fetchResponsible`, `setResponsible` (`features/knowledge/knowledgeSlice.ts`, existing; `setResponsible({ customerId, function, user_id })`); `useMembers` (`features/knowledge/useMembers.ts`); `stubAccountTeam`, `HEADS_JESH`, `makeDetailStore(permissions)` (Task 1).
- Produces: `AccountTeamCard({ customerId, customerName })`, rendered last on `DetailsTab` with `customerName={row.name}`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/organizations/detail/AccountTeamCard.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { AccountTeamCard } from './AccountTeamCard';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { HEADS_JESH, stubAccountTeam } from '../../../features/knowledge/testHeads';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import type { Capability } from '../../../features/auth/authSlice';

afterEach(() => {
  vi.unstubAllGlobals();
  resetMembersCache();
});

const FAIZ = { id: 11, name: 'Faiz Jamal', function: 'cs' as const };

function show(permissions?: Capability[]) {
  render(
    <Provider store={makeDetailStore(permissions)}>
      <AccountTeamCard customerId={7} customerName="Globex (QA)" />
    </Provider>,
  );
}

const row = async (label: string) => {
  const list = await screen.findByRole('list', { name: 'Account team' });
  return within(list).getAllByRole('listitem').find((item) => item.getAttribute('data-team-row') === label) as HTMLElement;
};

describe('AccountTeamCard (Slack escalations D2, spec §4.4)', () => {
  it('shows the six departments, the owner, and who takes an empty row', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH });
    show();
    expect(screen.getByRole('region', { name: 'Account team' })).toBeInTheDocument();
    expect(screen.getByText('Who handles Globex (QA) in each department')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Account team' });
    expect(within(list).getAllByRole('listitem').map((item) => item.getAttribute('data-team-row'))).toEqual(['cs', 'engineering', 'sales', 'analytics', 'leadership', 'other']);
    expect(within(await row('cs')).getByText('Account owner')).toBeInTheDocument();
    expect(await within(await row('engineering')).findByText('Nobody yet · Jesh Sanghvi (Engineering head) takes it')).toBeInTheDocument();
    expect(within(await row('sales')).getByText('Nobody yet · No Sales head is set')).toBeInTheDocument();
  });

  it('offers only active people of the department and saves the choice', async () => {
    const { teamPatches } = stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH });
    show();
    const picker = await screen.findByRole('combobox', { name: 'Engineering on the account team' });
    await waitFor(() => expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nobody yet', 'Jesh Sanghvi', 'Erin Engineer']));
    await userEvent.selectOptions(picker, '13');
    await waitFor(() => expect(teamPatches).toEqual([{ function: 'engineering', user_id: 13 }]));
    await waitFor(() => expect(picker).toHaveValue('13'));
    expect(within(await row('engineering')).queryByText(/takes it/)).toBeNull();
  });

  it('says who takes it when the person on the team has left', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, team: { engineering: { id: 14, name: 'Ann Former' } } });
    show();
    expect(await within(await row('engineering')).findByText('Ann Former is deactivated · Jesh Sanghvi (Engineering head) takes it')).toBeInTheDocument();
    // The picker still shows who it is.
    expect(screen.getByRole('combobox', { name: 'Engineering on the account team' })).toHaveValue('14');
  });

  it('shows a refusal under its row', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, refuseTeam: { status: 403, body: { detail: 'Setting who is responsible needs view-all-accounts.' } } });
    show();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Engineering on the account team' }), '12');
    expect(await within(await row('engineering')).findByRole('alert')).toHaveTextContent('Setting who is responsible needs view-all-accounts.');
  });

  it('reads without pickers for someone who cannot change it', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, team: { engineering: { id: 13, name: 'Erin Engineer' } } });
    show([]);
    expect(within(await row('cs')).getByText('Faiz Jamal')).toBeInTheDocument();
    expect(within(await row('engineering')).getByText('Erin Engineer')).toBeInTheDocument();
    expect(await within(await row('sales')).findByText('Nobody yet · No Sales head is set')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('reads "Nobody yet" alone when the heads cannot be read', async () => {
    stubAccountTeam({ owner: FAIZ, failHeads: true });
    show();
    // The span, not the picker's "Nobody yet" option.
    expect(await within(await row('engineering')).findByText('Nobody yet', { selector: 'span' })).toBeInTheDocument();
  });

  it('offers Try again when the team cannot be read', async () => {
    stubAccountTeam({ owner: FAIZ, heads: HEADS_JESH, failTeam: 1 });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the account team.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Account team' })).toBeInTheDocument();
  });
});
```

Add to `src/components/organizations/detail/otherTabs.test.tsx`, inside `describe('the other tabs in delivery 1', ...)`:

```tsx
  it('Details ends with the Account team', async () => {
    const spy = stubOrganizationPage();
    renderWithStore(<DetailsTab row={pizzaHut} customerId={7} isSm accounts={NO_ACCOUNTS} {...CUSTOMER} />);
    const team = await screen.findByRole('region', { name: 'Account team' });
    expect(screen.getByRole('region', { name: 'AI attributes' }).compareDocumentPosition(team)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await waitFor(() => expect(requestPaths(spy)).toEqual(expect.arrayContaining(['GET /customers/7/responsible/', 'GET /function-heads/'])));
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/detail/AccountTeamCard.test.tsx src/components/organizations/detail/otherTabs.test.tsx --maxWorkers=2`
Expected: FAIL: cannot resolve `./AccountTeamCard`.

- [ ] **Step 3: The card**

Create `src/components/organizations/detail/AccountTeamCard.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { useAppDispatch, useAppSelector, useCapability } from '../../../hooks';
import { FUNCTION_LABELS, type UserFunction } from '../../../features/auth/authSlice';
import { fetchResponsible, setResponsible } from '../../../features/knowledge/knowledgeSlice';
import { fetchFunctionHeads, teamLine, TEAM, type FunctionHeadRow } from '../../../features/knowledge/functionHeads';
import { useMembers } from '../../../features/knowledge/useMembers';
import { Card, CardHeader, ErrorState, FIELD_ERROR, LoadingState, Select, TYPE } from '../../ui';

const FUNCTIONS = Object.keys(FUNCTION_LABELS) as UserFunction[];

/** The account team (Slack escalations D2, spec §4.4): who handles this
 *  customer in each department, Customer Success being the owner. An empty
 *  row says who takes it instead: the department head, or nobody. People
 *  with view-all-accounts change it here (the existing /responsible/ rule);
 *  the Knowledge tab keeps its own pickers on the same slice. No em dash. */
export function AccountTeamCard({ customerId, customerName }: { customerId: number; customerName: string }) {
  const headingId = useId();
  const dispatch = useAppDispatch();
  const canAssign = useCapability('view_all_accounts');
  const responsible = useAppSelector((s) => s.knowledge.responsible[customerId]);
  const owner = useAppSelector((s) => s.knowledge.accountOwner[customerId] ?? null);
  const members = useMembers();
  const [heads, setHeads] = useState<FunctionHeadRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<UserFunction, string>>>({});

  useEffect(() => {
    let alive = true;
    dispatch(fetchResponsible(customerId)).then((result) => {
      if (alive && fetchResponsible.rejected.match(result)) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [dispatch, customerId, attempt]);

  useEffect(() => {
    let alive = true;
    fetchFunctionHeads().then(
      (rows) => {
        if (alive) setHeads(rows);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  const personFor = (fn: UserFunction) =>
    fn === 'cs' ? (owner ? { id: owner.id, name: owner.name } : null) : (responsible?.find((r) => r.function === fn)?.user ?? null);
  const headFor = (fn: UserFunction) => (heads === null ? undefined : (heads.find((h) => h.function === fn)?.user ?? null));
  const left = (id: number) => members.find((m) => m.id === id)?.is_active === false;

  async function choose(fn: UserFunction, value: string) {
    setBusy(true);
    setErrors((now) => ({ ...now, [fn]: undefined }));
    const result = await dispatch(setResponsible({ customerId, function: fn, user_id: value ? Number(value) : null }));
    if (setResponsible.rejected.match(result)) setErrors((now) => ({ ...now, [fn]: result.payload ?? TEAM.SAVE }));
    setBusy(false);
  }

  return (
    <Card as="section" pad="none" aria-labelledby={headingId}>
      <CardHeader id={headingId} title={TEAM.TITLE} meta={TEAM.meta(customerName)} />
      {failed ? (
        <ErrorState
          message={TEAM.LOAD}
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : responsible === undefined ? (
        <LoadingState label={TEAM.LOADING} count={6} />
      ) : (
        <ul role="list" aria-label={TEAM.TITLE} className="divide-y divide-line-subtle border-t border-line-subtle">
          {FUNCTIONS.map((fn) => {
            const label = FUNCTION_LABELS[fn];
            const person = personFor(fn);
            const gone = person !== null && left(person.id);
            const line = fn === 'cs' && person && !gone ? TEAM.OWNER : teamLine({ label, person, deactivated: gone, head: headFor(fn) });
            const lineId = `${headingId}-${fn}-line`;
            const errorId = `${headingId}-${fn}-error`;
            const error = errors[fn];
            const choices = members.filter((m) => m.is_active && m.function === fn).map((m) => ({ value: String(m.id), label: m.name }));
            if (person && !choices.some((c) => c.value === String(person.id))) choices.unshift({ value: String(person.id), label: person.name });
            return (
              <li key={fn} data-team-row={fn} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={TYPE.label}>{label}</span>
                  {line ? (
                    <span id={lineId} className={TYPE.meta}>
                      {line}
                    </span>
                  ) : null}
                </div>
                <div className="flex w-full min-w-0 flex-col sm:w-64">
                  {canAssign ? (
                    <Select
                      label={TEAM.picker(label)}
                      labelPosition="hidden"
                      value={person ? String(person.id) : ''}
                      disabled={busy}
                      invalid={Boolean(error)}
                      describedBy={[line ? lineId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
                      onChange={(value) => void choose(fn, value)}
                      options={[{ value: '', label: TEAM.NOBODY_YET }, ...choices]}
                    />
                  ) : person ? (
                    <span className={`${TYPE.body} font-semibold`}>{person.name}</span>
                  ) : null}
                  {error ? (
                    <p id={errorId} role="alert" className={FIELD_ERROR}>
                      {error}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
```

`DetailsTab.tsx`: import `{ AccountTeamCard } from './AccountTeamCard'`, and after the "Organization details" `</Card>` (still inside the outer `div`):

```tsx
      <AccountTeamCard customerId={customerId} customerName={row.name} />
```

Add to the `DetailsTab` doc comment: "then the account team (Slack escalations D2)".

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/organizations src/pages/organizations --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet totals equal to `BASELINE`. If `alignment.test.tsx` or `fieldCoverage.test.tsx` lists the Details tab's regions or cards in order, add "Account team" as the last one there (the card is new content, not a moved one); change no other expectation.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/AccountTeamCard.tsx src/components/organizations/detail/AccountTeamCard.test.tsx src/components/organizations/detail/DetailsTab.tsx src/components/organizations/detail/otherTabs.test.tsx
git commit -m "feat(organizations): the account team card on Details, with the department head fallback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add `alignment.test.tsx` / `fieldCoverage.test.tsx` to the `git add` only if Step 4 changed them.)

---

### Task 3: Department heads in Settings › People & teams

**Files:**
- Create: `src/pages/users/DepartmentHeadsSection.tsx`, `src/pages/users/DepartmentHeadsSection.test.tsx`
- Modify: `src/pages/users/UserManagement.tsx`, `src/pages/users/UserManagement.test.tsx`

**Interfaces:**
- Consumes: `fetchFunctionHeads`, `setFunctionHead`, `HEADS`, `FunctionHeadRow` (Task 1); `Member` (`features/userManagement/userManagementSlice.ts`); `useInstantSave`, `SettingsSection`, `SettingsRow`, `Select`, `LoadingState`, `ErrorState` (`components/ui`); `stubAccountTeam`, `HEADS_JESH`, `NO_HEADS`, `TEAM_MEMBERS`, `makeDetailStore(permissions)` (Task 1).
- Produces: `DepartmentHeadsSection({ members }: { members: Member[] })`, rendered under the Members table.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/users/DepartmentHeadsSection.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { DepartmentHeadsSection } from './DepartmentHeadsSection';
import { ToastProvider } from '../../components/ui';
import { makeDetailStore } from '../organizations/testDetail';
import { HEADS_JESH, NO_HEADS, TEAM_MEMBERS, stubAccountTeam } from '../../features/knowledge/testHeads';
import type { Member } from '../../features/userManagement/userManagementSlice';
import type { Capability } from '../../features/auth/authSlice';

afterEach(() => vi.unstubAllGlobals());

// The People & teams list (/auth/users/) carries more fields; the section reads these.
const MEMBERS = TEAM_MEMBERS as unknown as Member[];

function show(permissions?: Capability[]) {
  render(
    <Provider store={makeDetailStore(permissions)}>
      <ToastProvider>
        <DepartmentHeadsSection members={MEMBERS} />
      </ToastProvider>
    </Provider>,
  );
}

const picker = (name: string) => screen.findByRole('combobox', { name });

describe('Department heads (Slack escalations D2, spec §4.4)', () => {
  it('lists each department with its active people', async () => {
    stubAccountTeam({ heads: HEADS_JESH });
    show();
    const section = screen.getByRole('region', { name: 'Department heads' });
    expect(within(section).getByText("When nobody on a customer's account team works in a department, its head takes the customer's escalations.")).toBeInTheDocument();
    const engineering = await picker('Engineering');
    expect(engineering).toHaveValue('12');
    expect(within(engineering).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nobody', 'Jesh Sanghvi', 'Erin Engineer']);
    expect(screen.getByText('Nobody works in Analytics yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(6);
  });

  it('saves a head at once and undoes it', async () => {
    const { headPatches } = stubAccountTeam({ heads: NO_HEADS });
    show();
    await userEvent.selectOptions(await picker('Engineering'), '12');
    await waitFor(() => expect(headPatches).toEqual([{ function: 'engineering', user_id: 12 }]));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(await picker('Engineering')).toHaveValue('12');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(headPatches).toEqual([{ function: 'engineering', user_id: 12 }, { function: 'engineering', user_id: null }]));
    await waitFor(async () => expect(await picker('Engineering')).toHaveValue(''));
  });

  it('shows the refusal under its row and keeps the old head', async () => {
    const refusal = 'Erin Engineer is deactivated. Pick an active member.';
    stubAccountTeam({ heads: HEADS_JESH, refuseHead: { status: 400, body: { user_id: [refusal] } } });
    show();
    await userEvent.selectOptions(await picker('Engineering'), '13');
    expect(await screen.findByRole('alert')).toHaveTextContent(refusal);
    expect(await picker('Engineering')).toHaveValue('12');
  });

  it('reads only, for someone who cannot manage organisation settings', async () => {
    stubAccountTeam({ heads: HEADS_JESH });
    show(['manage_users']);
    expect(await picker('Engineering')).toBeDisabled();
    expect(screen.getByText(/Only someone who manages organisation settings can change them\./)).toBeInTheDocument();
  });

  it('offers Try again when the heads cannot be read', async () => {
    stubAccountTeam({ failHeads: true });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the department heads.');
  });
});
```

In `src/pages/users/UserManagement.test.tsx`:
- imports: `import authReducer from '../../features/auth/authSlice';`, `import { makeDetailStore } from '../organizations/testDetail';`, `import { NO_HEADS } from '../../features/knowledge/testHeads';`.
- in `stubFetch`, before the `/auth/capabilities/` line: `if (url.includes('/function-heads/')) return Promise.resolve(jsonResponse(200, NO_HEADS));`
- `renderPage`'s store becomes `configureStore({ reducer: { userManagement: userManagementReducer, auth: authReducer }, preloadedState: { auth: makeDetailStore().getState().auth } })` (an admin with every capability: the section reads `manage_org_settings`).
- a new test:

```tsx
  it('shows the department heads under the members', async () => {
    stubFetch();
    renderPage();
    expect(await screen.findByRole('region', { name: 'Department heads' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Members' }).compareDocumentPosition(screen.getByRole('region', { name: 'Department heads' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/users --maxWorkers=2`
Expected: FAIL: cannot resolve `./DepartmentHeadsSection` (and the new UserManagement test finds no region).

- [ ] **Step 3: The section and its place**

Create `src/pages/users/DepartmentHeadsSection.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useCapability } from '../../hooks';
import type { UserFunction } from '../../features/auth/authSlice';
import { fetchFunctionHeads, HEADS, setFunctionHead, type FunctionHeadRow } from '../../features/knowledge/functionHeads';
import type { Member } from '../../features/userManagement/userManagementSlice';
import { ApiError } from '../../lib/apiClient';
import { ErrorState, LoadingState, Select, SettingsRow, SettingsSection, useInstantSave } from '../../components/ui';

/** Settings › People & teams › Department heads (Slack escalations D2, spec
 *  §4.4): one head per function, chosen from that function's active
 *  members, saved on change with Undo. Changing needs manage_org_settings
 *  (the server checks it too); everyone who reaches the page reads it.
 *  No em dash. */
export function DepartmentHeadsSection({ members }: { members: Member[] }) {
  const canEdit = useCapability('manage_org_settings');
  const instant = useInstantSave();
  const [rows, setRows] = useState<FunctionHeadRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<UserFunction, string>>>({});

  useEffect(() => {
    let alive = true;
    fetchFunctionHeads().then(
      (answer) => {
        if (alive) setRows(answer);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  function change(fn: UserFunction, value: string) {
    const current = rows?.find((row) => row.function === fn)?.user?.id ?? null;
    const next = value ? Number(value) : null;
    if (next === current) return;
    setErrors((now) => ({ ...now, [fn]: undefined }));
    void instant.run({
      key: fn,
      request: () => setFunctionHead(fn, next),
      onSaved: setRows,
      undo: () => setFunctionHead(fn, current),
      onUndone: setRows,
      onError: (err) => setErrors((now) => ({ ...now, [fn]: err instanceof ApiError ? err.message : HEADS.SAVE })),
    });
  }

  const state = failed ? (
    <ErrorState
      message={HEADS.LOAD}
      onRetry={() => {
        setFailed(false);
        setAttempt((n) => n + 1);
      }}
    />
  ) : rows === null ? (
    <LoadingState label={HEADS.LOADING} count={6} />
  ) : undefined;

  return (
    <SettingsSection title={HEADS.TITLE} description={canEdit ? HEADS.INTRO : `${HEADS.INTRO} ${HEADS.READ_ONLY}`} state={state}>
      {(rows ?? []).map((row) => {
        const id = `head-${row.function}`;
        const hintId = `${id}-hint`;
        const errorId = `${id}-error`;
        const people = members.filter((m) => m.is_active && m.function === row.function);
        const hint = people.length === 0 ? HEADS.noMembers(row.function_display) : undefined;
        const error = errors[row.function];
        return (
          <SettingsRow key={row.function} label={row.function_display} htmlFor={id} hint={hint} hintId={hint ? hintId : undefined} error={error} errorId={errorId}>
            <Select
              id={id}
              label={row.function_display}
              labelPosition="external"
              value={row.user ? String(row.user.id) : ''}
              disabled={!canEdit || instant.busyKey !== null}
              invalid={Boolean(error)}
              describedBy={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
              onChange={(value) => change(row.function, value)}
              options={[{ value: '', label: HEADS.NOBODY }, ...people.map((m) => ({ value: String(m.id), label: m.name }))]}
              className="sm:max-w-sm"
            />
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
```

`UserManagement.tsx`: import `{ DepartmentHeadsSection } from './DepartmentHeadsSection'`; the members line in the tab panel becomes

```tsx
        {tab === 'members' ? (
          <>
            <MembersTab members={members} roles={roles} isLoading={isLoading} onEdit={setEditingMember} onDeactivate={setDeactivating} />
            <DepartmentHeadsSection members={members} />
          </>
        ) : null}
```

and the file's top comment gains "Members also holds Department heads (DepartmentHeadsSection.tsx, Slack escalations D2)."

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/pages/users src/components/settings.houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS (the Settings house rules cover the new file through their `pages/users/*.tsx` glob); ratchet at `BASELINE`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/users/DepartmentHeadsSection.tsx src/pages/users/DepartmentHeadsSection.test.tsx src/pages/users/UserManagement.tsx src/pages/users/UserManagement.test.tsx
git commit -m "feat(settings): department heads on People & teams, saved on change with undo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The journeys, docs, the full check and by eye

**Files:**
- Create: `src/e2e/accountTeam.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: The journeys**

Create `src/e2e/accountTeam.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import authReducer, { FUNCTION_LABELS } from '../features/auth/authSlice';
import userManagementReducer from '../features/userManagement/userManagementSlice';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { NO_HEADS, TEAM_MEMBERS, stubAccountTeam } from '../features/knowledge/testHeads';
import { stubOrganizationPage } from '../features/organizations/testStory';
import { makeDetailStore, renderOrganizationPage } from '../pages/organizations/testDetail';
import { UserManagement } from '../pages/users/UserManagement';
import { ToastProvider } from '../components/ui';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom): the real pages and store; only fetch is stubbed,
// in the Slack escalations D2 contract's shapes. Fake people. No em dash.

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** People & teams' own reads (/auth/users/, roles, capabilities); everything else passes on. */
function stubPeoplePage() {
  const next = globalThis.fetch;
  const users = TEAM_MEMBERS.map((m) => ({
    ...m,
    email: `${m.name.split(' ')[0].toLowerCase()}@alfiee.example`,
    avatar: '',
    role: 'csm',
    role_id: 2,
    role_name: 'CSM',
    permissions: [],
    function_display: FUNCTION_LABELS[m.function],
    reports_to: null,
    organisation: { id: 1, name: 'Alfiee QA', slug: 'alfiee-qa' },
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
      if (path === '/auth/users/') return ok({ count: users.length, next: null, previous: null, results: users });
      if (path === '/auth/roles/') return ok([{ id: 2, name: 'CSM', slug: 'csm', permissions: [], is_system: true, users_count: users.length, created_at: '2026-09-07T00:00:00Z' }]);
      if (path === '/auth/capabilities/') return ok([]);
      return next(input, init);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('Account team and department heads, end to end', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('a head named in Settings takes an empty row on the organisation page', { timeout: 60000 }, async () => {
    stubOrganizationPage();
    stubPeoplePage();
    const { headPatches, teamPatches } = stubAccountTeam({ heads: NO_HEADS, owner: { id: 11, name: 'Faiz Jamal', function: 'cs' } });

    // 1. Settings › People & teams: Jesh heads Engineering.
    render(
      <Provider store={configureStore({ reducer: { userManagement: userManagementReducer, auth: authReducer }, preloadedState: { auth: makeDetailStore().getState().auth } })}>
        <ToastProvider>
          <UserManagement />
        </ToastProvider>
      </Provider>,
    );
    const heads = await screen.findByRole('region', { name: 'Department heads' });
    await userEvent.selectOptions(await within(heads).findByRole('combobox', { name: 'Engineering' }), '12');
    await waitFor(() => expect(headPatches).toEqual([{ function: 'engineering', user_id: 12 }]));
    cleanup();

    // 2. Globex's page, Details: the empty Engineering row names Jesh.
    renderOrganizationPage('/organizations/7');
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    const team = await screen.findByRole('region', { name: 'Account team' });
    expect(await within(team).findByText('Nobody yet · Jesh Sanghvi (Engineering head) takes it')).toBeInTheDocument();
    expect(within(team).getByText('Account owner')).toBeInTheDocument();

    // 3. Erin joins the account team: the row is hers; the Knowledge tab agrees.
    await userEvent.selectOptions(within(team).getByRole('combobox', { name: 'Engineering on the account team' }), '13');
    await waitFor(() => expect(teamPatches).toEqual([{ function: 'engineering', user_id: 13 }]));
    await waitFor(() => expect(within(team).queryByText(/takes it/)).toBeNull());
    await userEvent.click(screen.getByRole('tab', { name: 'Knowledge' }));
    expect(await screen.findByRole('combobox', { name: 'Engineering owner' })).toHaveValue('13');
  });
});
```

(The organisation stub's page is Pizza Hut, id 7; the account team stub answers for any customer id. If the page's tab is a button rather than a tab in this build, use `getByRole('button', { name: 'Details' })` as `useDetailParams.test.tsx` does.)

Run: `npx vitest run src/e2e/accountTeam.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 2: The docs**

- `docs/03-ui-ux-design.md`: the Account team card (Decisions 1 to 4: rows, the line, the pickers, read-only for others) and Department heads (Decisions 5, 6).
- `docs/04-app-flow.md`: naming a department head (People & teams › Members › Department heads, saved on change, Undo); setting a customer's account team from Details; who takes a customer's escalation (team, else head, else nobody), which the escalation bundle (D3) will use.
- `.agents/workflows/repo-architecture.md`: `features/knowledge/functionHeads.ts`, `testHeads.ts`, `components/organizations/detail/AccountTeamCard.tsx`, `pages/users/DepartmentHeadsSection.tsx`.

- [ ] **Step 3: The full check**

```bash
npx vitest run --maxWorkers=2
npx tsc -b
npm run lint
npm run build
npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2
grep -rn "—" src/features/knowledge/functionHeads.ts src/features/knowledge/testHeads.ts src/components/organizations/detail/AccountTeamCard.tsx src/pages/users/DepartmentHeadsSection.tsx src/e2e/accountTeam.test.tsx || echo "no em dash"
```

Expected: every test passes (write the count into the hand-off), `tsc` clean, lint clean (no new warning in the new files), build OK, ratchet totals equal to `BASELINE`, "no em dash".

- [ ] **Step 4: By eye, on a database copy, in the Alfee workspace**

Nothing real is sent and no model is called.

1. **Copy the dev database, read only:** `createdb revenact_slackd2 && pg_dump --no-owner revenact | psql -q revenact_slackd2` (`pg_dump` only reads `revenact`). Migrate the copy only, from the backend worktree `slackd2-be` at its head: `DATABASE_URL=postgres:///revenact_slackd2 venv/bin/python manage.py migrate`.
2. **Make it safe**, as the D1 plan's by-eye step did, in a `manage.py shell` against the copy: blank every `MailboxConnection` credential, fake every `Connector` credential, delete every `JiraLink`; run the backend with `HTTPS_PROXY=http://127.0.0.1:9` and no usable AI provider. Never run `sync_tickets` or `run_agent_signals` against the copy.
3. **Seed in the copy** (Alfee workspace, `tushar@alfee.io` admin; Faiz `faiz@alfee.io`, Jesh `jesh@alfee.io`): a QA password on the three users (copy only); Jesh's function Engineering, Faiz's Customer Success.
4. **Servers:** backend on :8018 (`slackd2-be`, `DATABASE_URL` the copy), Vite on :5188 (`VITE_API_URL=http://localhost:8018`).
5. **Check in Chrome** (playwright-cli), 1440x900 and 390x844, light and dark:
   - as **Tushar**: Settings › People & teams › Members › Department heads: Engineering Jesh, Customer Success Faiz (each shows "Saved" with Undo; Undo once and redo); Analytics reads "Nobody works in Analytics yet." if so;
   - Globex (QA) › Details › Account team: Customer Success Faiz "Account owner"; Engineering "Nobody yet · Jesh Sanghvi (Engineering head) takes it"; set Engineering to Jesh; Initech (QA) keeps "Nobody yet · Jesh Sanghvi (Engineering head) takes it" (LC-D2a); the Knowledge tab's "Engineering owner" agrees with the card;
   - as **Faiz** (no `view_all_accounts`, no `manage_org_settings` unless his role grants them): the card reads names with no pickers; People & teams is not in his nav unless he has `manage_users` (then Department heads reads but is disabled, LC-D2b);
   - phone width: each card row stacks (label and line above the picker), no horizontal scroll.
6. Write findings to the scratchpad (`slackd2-fe-byeye/findings.md`) with screenshots; fix should-fix items test first; stop the servers; leave `revenact_slackd2` for the owner to drop.

- [ ] **Step 5: Commit and push**

```bash
git add src/e2e/accountTeam.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): department heads and the account team journeys; docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/slack-escalations-d2
```

Hand-off (to the controller, not a PR): the head, the vitest count, the by-eye findings, and anything the backend's "Changes during the build" changed.

---

## Self-review

1. **Contract coverage.** §2 `/function-heads/` (six rows, PATCH with both keys, refusals shown verbatim under the row): Tasks 1, 3; §3 `/responsible/` unchanged (the card reads and writes it through the existing slice, view-all-accounts rule): Task 2; SE2-4 (a head who left reads `null`; a team person who left is skipped): Decision 3, Task 2's deactivated test; SE2-5 (`manage_org_settings` to change): Decision 6, Task 3's read-only test; SE2-10 (no email shown): the fixtures carry none to the screens; SE2-11 (the two surfaces and their reads): Tasks 2, 3; §8 owner set-up and LC-D2a/b: Task 4 by eye. Spec §4.4: the card on Details with one row per function, Customer Success the owner, pickers filtered to the function, the "Nobody yet · Jesh Sanghvi (Engineering head) takes it" row, the Knowledge tab keeping its pickers (untouched; the e2e checks they agree); Department heads in People & teams, one row per function, a picker of that function's members, admins only.
2. **Placeholders.** Each code step holds its code; the two conditional edits (Task 2 Step 4, existing order tests; Task 4 Step 1, a tab rendered as a button) name the file to compare with and the exact change.
3. **Type consistency.** `FunctionHeadRow` and `teamLine` (Task 1) are what `AccountTeamCard` (Task 2) and `DepartmentHeadsSection` (Task 3) read; `stubAccountTeam`'s `teamPatches` / `headPatches` and `TEAM_MEMBERS` ids (Faiz 11, Jesh 12, Erin 13, Ann 14) are the same in every test; `makeDetailStore(permissions)` (Task 1) is what Tasks 2, 3 and 4 call.

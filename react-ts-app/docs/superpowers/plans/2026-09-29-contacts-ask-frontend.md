# Ask Revenact on Contacts (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the ✦ Ask rail on `/contacts` and `/contacts/:id`: questions carry the list's filters or the open person, "Why this sentiment?" types a question in without sending it, the rail is a sheet on phones, and a conversation started on Contacts reopens there from History.

**Architecture:** Contacts becomes a third Ask surface beside the Dashboard and Organizations, reusing the shared pieces unchanged in behaviour:
- `AskProvider` holds the conversation, the rail's open state, the focus and the prefilled draft.
- `AskRail` / `AskSheet` draw the rail, `AskControls` draws the pill, and `CopilotRail` draws History.
- Pure modules in `src/features/contacts/askContext.ts` build the context, chip label and restore path.
- `ContactsAskLayout` wraps the Contacts route, as `OrganizationsAskLayout` wraps Organizations, and fills `ContactsFrame`'s existing `rail` slot.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit, react-router 7, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-28-contacts-redesign-design.md` §4 (Ask on Contacts, agreed 2026-09-28) and §7 (Testing, Frontend). The backend contract is backend PR #72 (`revenact-backend` branch `feat/contacts-ask`, `docs/API_CONTRACTS.md` "Asked from Contacts").

## Global Constraints

- **Backend contract** (backend #72). `POST /api/v1/copilot/messages/` takes one of two `context` shapes:
  - List view: `{"surface": "contacts", "view": "list", "filters": {q?, customer?, account?, sentiment?, role?}}`. Only the set keys are sent, as the page's URL carries them.
  - Person view: `{"surface": "contacts", "view": "person", "contact": <id>, "focus": "sentiment" | null}`.
  - The server ignores a client `label`. It stores its own on the context and the origin: "Sam Pizza · Pizza Hut" or "Contacts · Negative · Decision Maker". An origin is the context without `focus`.
  - Refusals:
    - `400 {"context": {"contact": ["Not a person you can open."]}}`
    - `400 {"context": {"filters": {"customer": [...]}}}`
    - `400 {"context": {"filters": {"account": [...]}}}`
  - Metered as purpose `contacts`.
- **Spec §4.4:**
  - `ContactsAskLayout` wraps the page in one `AskProvider` (`surface: contacts`) and fills `ContactsFrame`'s `rail` slot, so the conversation survives opening people, filtering and going back.
  - The top bar gets the same pill as Organizations (New chat, History, ✦).
  - When the rail is open beside the page, the list narrows and the profile stays.
  - Below `sm`, the rail opens as the existing `AskSheet`.
  - Changing person or filters moves the chip for the next question. Answers already given keep the chip they were asked under.
  - "Why this sentiment?" opens the rail with "Why is <first name>'s sentiment <word>?" typed in and not sent, with `focus: "sentiment"`.
  - History returns to `/contacts/:id` or `/contacts?<filters>`.
  - The empty rail matches the Dashboard and Organizations, with no suggestions.
  - A refused person reads "You can't ask about this person here." and keeps the draft.
- House rules (`.claude/skills/revenact-design/SKILL.md` §1, §4):
  - tokens only
  - type sizes 11/13/15/22 px
  - Lucide icons, `aria-hidden` beside text
  - glass only on the Ask rail
  - 44px targets below `sm` (`min-h-11 sm:min-h-9`)
  - sentence-case copy, both themes, no motion added
- Tests per the `testing` skill:
  - unit tests for the pure modules
  - integration through the real store and router, with `fetch` stubbed in contract shapes
  - a jsdom end-to-end test
  - the house-rules suite over new component files
- Run Vitest with `--maxWorkers=2`, one process at a time. No new dependencies.
- Work on `feat/contacts-ask` in `react-ts-app`. It is cut from `feat/contacts-redesign` (frontend #90); rebase onto `main` once #90 merges. Commits are conventional (`feat(contacts): …`, `test(contacts): …`, `docs(contacts): …`) and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Update the product documents in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

## Decisions this plan makes where the spec is silent

1. **Where the rail sits.** Contacts reuses the shared rule unchanged:
   - A rail beside the page from `sm`, open by default from `xl`, and the person's own open/closed choice wins (`AskProvider`).
   - A sheet below `sm`.
   - Its open/closed choice is Contacts' own (`CONTACTS_ASK_KEY`), as Organizations has its own.
2. **Two panes only when they fit.**
   - With the rail beside the page, the list and the profile sit side by side only from `xl`, with the list narrowed to 18rem.
   - Between `md` and `xl`, with the rail open, the page shows one pane, as it does on phones: the list, or the profile with "‹ Contacts".
   - With the rail closed, the delivery 1 rule holds: two panes from `md`.
3. **The sentiment focus** is a new `AskFocus` kind, `{kind: 'sentiment'}`. `withFocus` turns it into the person context's `focus: "sentiment"`, and every other surface ignores it. The chip adds " · Sentiment".
4. **A live chip before the server has labelled it** is built from what the page reports (`ContactsNames`):
   - For a person: the name and place ("Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA"), or "This person" until loaded.
   - For the list: "Contacts", then the organisation (or "Organisation"), the account (or "Account"), the sentiment and role labels, and `"q"`.
   - A stored context's `label` always wins.
5. **"Why this sentiment?"** is a quiet link under the profile's sentiment line. It shows only inside an Ask provider, for hand-set and computed sentiments alike.
6. **Refusals.**
   - `contact` reads "You can't ask about this person here."
   - `filters` reads "You can't ask about this list. Clear the filters and ask again."
   - Both keep the question, like the organisation page's refusals.
7. **History's tag** for a Contacts conversation is the server's `label`, with the `Users` icon and "Started on " for screen readers.

## File structure

| File | Responsibility |
|---|---|
| `src/pages/copilot/types.ts` | `SentimentFocus`, `ContactsFilters`, `ContactsListContext`, `ContactsPersonContext`, their origins; extended `AskFocus`, `SurfaceContext`, `SurfaceOrigin` |
| `src/features/contacts/askContext.ts` (new) | `contactsContextOf(pathname, search)`, `contactsIdOf`, `contactsLabel`, `contactsPath`, `whyQuestion`, `ContactsNames` |
| `src/components/copilot/surfaceLabels.ts`, `src/pages/dashboard/ask/originPath.ts`, `src/pages/dashboard/ask/context.ts` (`withFocus`), `src/components/copilot/useCopilotThread.ts` (`refusalMessage`), `src/components/copilot/CopilotRail.tsx` (History tag) | The contacts branch in each surface-keyed function |
| `src/pages/dashboard/ask/askPreference.ts` | `CONTACTS_ASK_KEY` |
| `src/pages/contacts/ask/ContactsAskLayout.tsx`, `contactsNames.ts`, `useContactsContext.ts` (new) | The layout, the names the page reports, the context from the route |
| `src/App.tsx` | The layout route around `contacts/:id?` |
| `src/pages/contacts/ContactsPage.tsx` | Reports names; two panes only when they fit beside the rail |
| `src/components/contacts/ContactProfile.tsx` | "Why this sentiment?" |
| `src/test/SlotHost.tsx` (new, test only) | The Navbar actions slot stand-in, moved out of `pages/organizations/testDetail.tsx` |
| `src/pages/contacts/testPage.tsx`, `src/pages/contacts/ask/testContactsAsk.ts` (new, test only) | `renderContactsPage(url, {width, ask})`; `stubContactsAsk` (Contacts API plus Copilot behind one fetch) |
| `src/e2e/contactsAsk.test.tsx` (new) | The end-to-end journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | The product documents |

---

### Task 1: The contract types and the pure Contacts Ask module

**Files:**
- Modify: `src/pages/copilot/types.ts`
- Create: `src/features/contacts/askContext.ts`
- Test: `src/features/contacts/askContext.test.ts`

**Interfaces:**
- Produces, in `types.ts`:

```ts
/** "Why this sentiment?" (spec 2026-09-28 §4.4): the next question is about
 *  the open person's sentiment. Sent as the person context's
 *  `focus: "sentiment"`; every other surface ignores it. */
export interface SentimentFocus {
  kind: 'sentiment';
}

/** The Contacts page's URL filters, only the set keys (as the page's own URL
 *  carries them), sent as they are: the server parses them with the list's
 *  own code. */
export interface ContactsFilters {
  q?: string;
  customer?: string;
  account?: string;
  sentiment?: string;
  role?: string;
}

/** A question asked on the Contacts list (backend #72). The server builds
 *  `label` ("Contacts · Negative · Decision Maker") and echoes it. */
export interface ContactsListContext {
  surface: 'contacts';
  view: 'list';
  filters: ContactsFilters;
  label?: string;
}

/** A question asked with one person open. `focus` is "sentiment" for
 *  "Why this sentiment?". The server builds `label` ("Sam Pizza · Pizza Hut"). */
export interface ContactsPersonContext {
  surface: 'contacts';
  view: 'person';
  contact: number;
  focus: 'sentiment' | null;
  label?: string;
}

export interface ContactsListOrigin {
  surface: 'contacts';
  view: 'list';
  filters: ContactsFilters;
  label: string;
}

export interface ContactsPersonOrigin {
  surface: 'contacts';
  view: 'person';
  contact: number;
  label: string;
}
```

  Also change the existing unions:
  - `AskFocus = DashboardFocus | StoryFocus | SentimentFocus`
  - `SurfaceContext = DashboardContext | OrganizationsContext | OrganizationDetailContext | ContactsListContext | ContactsPersonContext`
  - `SurfaceOrigin = DashboardOrigin | OrganizationsOrigin | OrganizationDetailOrigin | ContactsListOrigin | ContactsPersonOrigin`

  Update the doc comment on `AskFocus` to name the sentiment focus.

- Produces, in `askContext.ts`:
  - `ContactsNames`
  - `contactsIdOf(pathname) -> number | null`
  - `contactsContextOf(pathname, search) -> ContactsListContext | ContactsPersonContext | null`
  - `contactsLabel(context, names) -> string`
  - `contactsPath(origin) -> string`
  - `whyQuestion(name, sentiment) -> string`

  Exact code is below.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/contacts/askContext.test.ts
import { describe, expect, it } from 'vitest';
import { contactsContextOf, contactsIdOf, contactsLabel, contactsPath, whyQuestion, type ContactsNames } from './askContext';

const NAMES: ContactsNames = {
  person: { id: 41, name: 'Lukas Vermeer', place: 'Kraft Heinz › Kraft Heinz EMEA' },
  organisation: { id: 6, name: 'Kraft Heinz' },
  account: { id: 31, name: 'Kraft Heinz EMEA' },
};

describe('contactsIdOf', () => {
  it('reads a plain positive id from /contacts/:id and nothing else', () => {
    expect(contactsIdOf('/contacts/41')).toBe(41);
    for (const path of ['/contacts', '/contacts/', '/contacts/0', '/contacts/041', '/contacts/abc', '/contacts/41/x']) {
      expect(contactsIdOf(path)).toBeNull();
    }
  });
});

describe('contactsContextOf', () => {
  it('is the person view on /contacts/:id, whatever the filters', () => {
    expect(contactsContextOf('/contacts/41', '?sentiment=negative')).toEqual({
      surface: 'contacts',
      view: 'person',
      contact: 41,
      focus: null,
    });
  });

  it("is the list view with only the page's set filters on /contacts", () => {
    expect(contactsContextOf('/contacts', '?q=luk&customer=6&account=31&sentiment=neutral&role=champion')).toEqual({
      surface: 'contacts',
      view: 'list',
      filters: { q: 'luk', customer: '6', account: '31', sentiment: 'neutral', role: 'champion' },
    });
    expect(contactsContextOf('/contacts', '')).toEqual({ surface: 'contacts', view: 'list', filters: {} });
    // An account means nothing without its organisation, as on the page.
    expect(contactsContextOf('/contacts', '?account=31')).toEqual({ surface: 'contacts', view: 'list', filters: {} });
  });

  it('is null on a Contacts path that is neither (a bad id)', () => {
    expect(contactsContextOf('/contacts/abc', '')).toBeNull();
  });
});

describe('contactsLabel', () => {
  it("prefers the server's stored label", () => {
    expect(
      contactsLabel({ surface: 'contacts', view: 'person', contact: 41, focus: null, label: 'Lukas Vermeer · Kraft Heinz' }, NAMES),
    ).toBe('Lukas Vermeer · Kraft Heinz');
  });

  it('names a person from what the page reported, else "This person", and adds the sentiment focus', () => {
    expect(contactsLabel({ surface: 'contacts', view: 'person', contact: 41, focus: null }, NAMES)).toBe(
      'Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA',
    );
    expect(contactsLabel({ surface: 'contacts', view: 'person', contact: 42, focus: null }, NAMES)).toBe('This person');
    expect(contactsLabel({ surface: 'contacts', view: 'person', contact: 41, focus: 'sentiment' }, NAMES)).toBe(
      'Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA · Sentiment',
    );
  });

  it('names the list and each filter', () => {
    expect(contactsLabel({ surface: 'contacts', view: 'list', filters: {} }, null)).toBe('Contacts');
    expect(
      contactsLabel(
        { surface: 'contacts', view: 'list', filters: { q: 'luk', customer: '6', account: '31', sentiment: 'negative', role: 'decision_maker' } },
        NAMES,
      ),
    ).toBe('Contacts · Kraft Heinz › Kraft Heinz EMEA · Negative · Decision Maker · "luk"');
    expect(contactsLabel({ surface: 'contacts', view: 'list', filters: { customer: '9', account: '5' } }, NAMES)).toBe(
      'Contacts · Organisation › Account',
    );
  });
});

describe('contactsPath', () => {
  it('reopens the person, or the list with its filters in the URL order', () => {
    expect(contactsPath({ surface: 'contacts', view: 'person', contact: 41, label: 'x' })).toBe('/contacts/41');
    expect(contactsPath({ surface: 'contacts', view: 'list', filters: {}, label: 'Contacts' })).toBe('/contacts');
    expect(
      contactsPath({ surface: 'contacts', view: 'list', filters: { role: 'champion', sentiment: 'negative', q: 'a b' }, label: 'x' }),
    ).toBe('/contacts?q=a+b&sentiment=negative&role=champion');
  });
});

describe('whyQuestion', () => {
  it("asks about the first name's sentiment", () => {
    expect(whyQuestion('Lukas Vermeer', 'neutral')).toBe("Why is Lukas's sentiment neutral?");
    expect(whyQuestion('  Mira ', 'positive')).toBe("Why is Mira's sentiment positive?");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/contacts/askContext.test.ts --maxWorkers=2`
Expected: FAIL, "Failed to resolve import './askContext'".

- [ ] **Step 3: Implement.** Add the types above to `types.ts` and widen the unions. Then:

```ts
// src/features/contacts/askContext.ts
import type {
  ContactsFilters,
  ContactsListContext,
  ContactsListOrigin,
  ContactsPersonContext,
  ContactsPersonOrigin,
} from '../../pages/copilot/types';
import { CONTACT_ROLES, SENTIMENTS, parseContactsParams, toContactsSearch } from './contactsParams';

// Ask Revenact on Contacts (spec 2026-09-28 §4): the context a question
// carries, its chip, the History restore path and "Why this sentiment?".

const SEPARATOR = ' · ';

/** What the Contacts page reports so a live question's chip can name it
 *  before the server has: the open person, and the filtered organisation
 *  and account. */
export interface ContactsNames {
  person: { id: number; name: string; place: string } | null;
  organisation: { id: number; name: string } | null;
  account: { id: number; name: string } | null;
}

/** `/contacts/41` gives 41; any other path gives null. The page reads its
 *  `:id` with the same rule, so the two never disagree. */
export function contactsIdOf(pathname: string): number | null {
  const match = /^\/contacts\/([1-9]\d*)$/.exec(pathname);
  return match ? Number(match[1]) : null;
}

/** Where the person is on Contacts, as the server needs it (backend #72):
 *  one person's id, or the page's own set filters. Never names or figures. */
export function contactsContextOf(pathname: string, search: string): ContactsListContext | ContactsPersonContext | null {
  const contact = contactsIdOf(pathname);
  if (contact !== null) return { surface: 'contacts', view: 'person', contact, focus: null };
  if (pathname !== '/contacts' && pathname !== '/contacts/') return null;
  const filters: ContactsFilters = Object.fromEntries(toContactsSearch(parseContactsParams(new URLSearchParams(search))));
  return { surface: 'contacts', view: 'list', filters };
}

function listParts(filters: ContactsFilters, names: ContactsNames | null): string[] {
  const parts = ['Contacts'];
  if (filters.customer) {
    const organisation = names?.organisation?.id === Number(filters.customer) ? names.organisation.name : 'Organisation';
    const account = filters.account ? (names?.account?.id === Number(filters.account) ? names.account.name : 'Account') : null;
    parts.push(account ? `${organisation} › ${account}` : organisation);
  }
  const sentiment = SENTIMENTS.find((s) => s.value === filters.sentiment);
  if (sentiment) parts.push(sentiment.label);
  const role = CONTACT_ROLES.find((r) => r.value === filters.role);
  if (role) parts.push(role.label);
  if (filters.q) parts.push(`"${filters.q}"`);
  return parts;
}

/** The chip. A stored context's `label` is the server's and wins; a live one
 *  is named from what the page reported. The sentiment focus is never in
 *  `label`, so it is always named from `focus`. */
export function contactsLabel(context: ContactsListContext | ContactsPersonContext, names: ContactsNames | null = null): string {
  if (context.view === 'list') return context.label ?? listParts(context.filters, names).join(SEPARATOR);
  const person = names?.person?.id === context.contact ? names.person : null;
  const base = context.label ?? (person ? `${person.name}${SEPARATOR}${person.place}` : 'This person');
  return context.focus === 'sentiment' ? `${base}${SEPARATOR}Sentiment` : base;
}

/** Where a conversation started on Contacts reopens: the person, or the list
 *  with its filters, in the page's own URL order. */
export function contactsPath(origin: ContactsListOrigin | ContactsPersonOrigin): string {
  if (origin.view === 'person') return `/contacts/${origin.contact}`;
  const query = new URLSearchParams();
  for (const key of ['q', 'customer', 'account', 'sentiment', 'role'] as const) {
    const value = origin.filters[key];
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `/contacts?${text}` : '/contacts';
}

/** The question "Why this sentiment?" types in. The person can edit it. */
export function whyQuestion(name: string, sentiment: string): string {
  const first = name.trim().split(/\s+/)[0] || name.trim();
  return `Why is ${first}'s sentiment ${sentiment}?`;
}
```

  Check `toContactsSearch` against the list-view test before relying on it: it writes `q, customer, account, sentiment, role` in that order and drops an account without an organisation. If `Object.fromEntries(URLSearchParams)` doesn't type-check, map its entries into a `ContactsFilters` explicitly.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/features/contacts/askContext.test.ts --maxWorkers=2` → PASS.
Run: `npx tsc -b`. Expected: errors wherever a surface-keyed branch now meets a Contacts context, e.g. in `surfaceLabels.ts`, `originPath.ts`, `context.ts` (`withFocus`) and `CopilotRail.tsx`. **Task 2 fixes those, so do not fix them here.** To keep this commit green, temporarily land Task 1 and Task 2 together: carry straight on into Task 2's steps and commit once, as Task 2's Step 6 says.

- [ ] **Step 5:** (No separate commit; see Task 2 Step 6.)

---

### Task 2: The Contacts branch in every surface-keyed function

**Files:**
- Modify: `src/components/copilot/surfaceLabels.ts`, `src/pages/dashboard/ask/originPath.ts`, `src/pages/dashboard/ask/context.ts`, `src/components/copilot/useCopilotThread.ts`, `src/components/copilot/CopilotRail.tsx`, `src/pages/dashboard/ask/askPreference.ts`
- Test: extend `src/components/copilot/surfaceLabels.test.ts`, `src/pages/dashboard/ask/originPath.test.ts`, `src/pages/dashboard/ask/context.test.ts`, `src/components/copilot/useCopilotThread.test.tsx`, `src/components/copilot/CopilotRail.test.tsx`

**Interfaces:**
- Consumes: Task 1's types and `contactsLabel`, `contactsPath`, `ContactsNames`.
- Produces:
  - `SurfaceNames.contacts?: ContactsNames | null`
  - `CONTACTS_ASK_KEY = 'revenact_contacts_ask'`
  - `withFocus` handles contacts
  - `refusalMessage` handles `contact` and `filters`

- [ ] **Step 1: Write the failing tests** (add to the named files)

```ts
// surfaceLabels.test.ts
import { originTag, surfaceLabel } from './surfaceLabels';
it('labels a Contacts question and tags a Contacts conversation with the server label', () => {
  const names = { person: { id: 41, name: 'Lukas Vermeer', place: 'Kraft Heinz' }, organisation: null, account: null };
  expect(surfaceLabel({ surface: 'contacts', view: 'person', contact: 41, focus: 'sentiment' }, { contacts: names })).toBe(
    'Lukas Vermeer · Kraft Heinz · Sentiment',
  );
  expect(surfaceLabel({ surface: 'contacts', view: 'list', filters: { sentiment: 'negative' } })).toBe('Contacts · Negative');
  expect(originTag({ origin: { surface: 'contacts', view: 'person', contact: 41, label: 'Lukas Vermeer · Kraft Heinz' } })).toBe(
    'Lukas Vermeer · Kraft Heinz',
  );
  expect(originTag({ origin: { surface: 'contacts', view: 'list', filters: {}, label: 'Contacts' } })).toBe('Contacts');
});
```

```ts
// originPath.test.ts
it('reopens a Contacts conversation on its person or its filtered list', () => {
  expect(originPath({ surface: 'contacts', view: 'person', contact: 41, label: 'x' })).toBe('/contacts/41');
  expect(originPath({ surface: 'contacts', view: 'list', filters: { sentiment: 'negative' }, label: 'x' })).toBe('/contacts?sentiment=negative');
});
```

```ts
// context.test.ts
it('turns the sentiment focus into the person context, and ignores it everywhere else', () => {
  const person = { surface: 'contacts', view: 'person', contact: 41, focus: null } as const;
  expect(withFocus(person, { kind: 'sentiment' })).toEqual({ ...person, focus: 'sentiment' });
  expect(withFocus(person, { kind: 'companies', ids: [1] })).toEqual(person);
  const list = { surface: 'contacts', view: 'list', filters: {} } as const;
  expect(withFocus(list, { kind: 'sentiment' })).toEqual(list);
  const dashboard = { surface: 'dashboard', area: 'overview', view: null, filters: { owner: '', lifecycle: '', customer: '' }, focus: null } as const;
  expect(withFocus(dashboard as never, { kind: 'sentiment' })).toMatchObject({ focus: null });
});
```

  Match the existing dashboard fixture shape already in `context.test.ts` when writing the last case; don't invent a new one.

```ts
// useCopilotThread.test.tsx — beside the organisation refusal tests
import { refusalMessage } from './useCopilotThread';
import { ApiError } from '../../lib/api'; // the same ApiError the file already imports; use its real path
it('reads a Contacts refusal', () => {
  expect(refusalMessage(new ApiError(400, 'Bad', { context: { contact: ['Not a person you can open.'] } }))).toBe(
    "You can't ask about this person here.",
  );
  expect(refusalMessage(new ApiError(400, 'Bad', { context: { filters: { account: ['Not an account you can open.'] } } }))).toBe(
    "You can't ask about this list. Clear the filters and ask again.",
  );
});
```

  Construct `ApiError` exactly as the existing refusal tests in that file do (check its constructor argument order there).

```tsx
// CopilotRail.test.tsx — beside the existing History tag test
it("tags a conversation started on Contacts with the server's label", async () => {
  // Use the file's existing History-popover harness; give one conversation
  // origin { surface: 'contacts', view: 'person', contact: 41, label: 'Lukas Vermeer · Kraft Heinz' }.
  // Expect the tag text 'Lukas Vermeer · Kraft Heinz' and the screen-reader text 'Started on '.
});
```

  Write this last test with the same harness and assertions as the file's existing Organizations tag test. Copy that test and change the origin and the expected text.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/copilot src/pages/dashboard/ask --maxWorkers=2`
Expected: the new cases fail. Tasks 1–2 are uncommitted together, so `tsc` also fails.

- [ ] **Step 3: Implement**
  - `surfaceLabels.ts`:

```ts
import { contactsLabel, type ContactsNames } from '../../features/contacts/askContext';
// SurfaceNames gains:
  contacts?: ContactsNames | null;
// surfaceLabel, first line:
  if (context.surface === 'contacts') return contactsLabel(context, names.contacts ?? null);
// originTag, after the null check:
  if (origin.surface === 'contacts') return origin.label;
```

  - `originPath.ts`: add `if (origin.surface === 'contacts') return contactsPath(origin);` before the Organizations line, and name Contacts in the doc comment.
  - `context.ts` `withFocus`:

```ts
export function withFocus(context: SurfaceContext, focus: AskFocus | null): SurfaceContext {
  if (context.surface === 'contacts') {
    return context.view === 'person' ? { ...context, focus: focus?.kind === 'sentiment' ? 'sentiment' : null } : context;
  }
  if (context.surface === 'dashboard') {
    return { ...context, focus: focus && (focus.kind === 'companies' || focus.kind === 'attention') ? focus : null };
  }
  if (context.view === 'detail') return { ...context, focus: isStoryFocus(focus) ? focus : null };
  return { ...context, focus: focus?.kind === 'companies' ? focus : null };
}
```

  Update the doc comment: "Contacts' person view takes only the sentiment focus; its list takes none." The dashboard branch now names its two kinds instead of "not a story focus", so a sentiment focus can never reach it.
  - `useCopilotThread.ts` `refusalMessage`: before the `organization` check, add

```ts
  if ('contact' in context) return "You can't ask about this person here.";
  if ('filters' in context) return "You can't ask about this list. Clear the filters and ask again.";
```

  Update its doc comment to name both.
  - `CopilotRail.tsx` History tag: pick the icon and screen-reader words by surface:
    - `organizations` → `Network`, "Started on "
    - `contacts` → `Users`, "Started on "
    - otherwise `LayoutDashboard`, "Started on the dashboard: "

    Import `Users` from `lucide-react`.
  - `askPreference.ts`: add

```ts
/** Contacts' rail keeps its own choice too. */
export const CONTACTS_ASK_KEY = 'revenact_contacts_ask';
```

- [ ] **Step 4: Type check**

Run: `npx tsc -b`. Expected: exit 0. Any remaining error is another surface-keyed branch. Fix it the same way, with a `contacts` branch placed first, and list it in your report.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/features/contacts src/components/copilot src/pages/dashboard/ask src/pages/organizations/ask --maxWorkers=2` → all pass.

- [ ] **Step 6: Commit (Tasks 1 and 2 together)**

```bash
git add src/pages/copilot/types.ts src/features/contacts/askContext.ts src/features/contacts/askContext.test.ts src/components/copilot src/pages/dashboard/ask
git commit -m "feat(contacts): Contacts as an Ask surface — its context, chip, restore path and refusals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The layout, the route, the names the page reports, and the test harness

**Files:**
- Create: `src/pages/contacts/ask/useContactsContext.ts`, `src/pages/contacts/ask/contactsNames.ts`, `src/pages/contacts/ask/ContactsAskLayout.tsx`, `src/test/SlotHost.tsx`, `src/pages/contacts/ask/testContactsAsk.ts`
- Modify: `src/App.tsx`, `src/pages/contacts/ContactsPage.tsx` (report names), `src/pages/contacts/testPage.tsx` (`ask` option), `src/pages/organizations/testDetail.tsx` (import the moved `SlotHost`)
- Test: `src/pages/contacts/ask/contactsAsk.test.tsx` (new)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `ContactsAskLayout`
  - `useContactsContext()`
  - `ContactsNamesContext` and `useReportContactsNames(names)`
  - `renderContactsPage(url, {width, ask})`
  - `stubContactsAsk({copilot?, contacts?})`, which returns `{copilot, contacts}` spies

- [ ] **Step 1: Move `SlotHost` to `src/test/SlotHost.tsx`**
  - Cut the `SlotHost` function from `testDetail.tsx` unchanged (props `{bare, children}`, the `NavActionsSlotContext` provider, the bare `data-testid="nav-actions"` div).
  - Export it from the new file with its imports.
  - Import it in `testDetail.tsx`.
  - Run `npx vitest run src/pages/organizations --maxWorkers=2` and confirm it still passes. No commit yet.

- [ ] **Step 2: Write the failing integration tests**

```tsx
// src/pages/contacts/ask/contactsAsk.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { renderContactsPage } from '../testPage';
import { stubContactsAsk } from './testContactsAsk';

// Integration tier: the real Contacts page under ContactsAskLayout, the real
// rail and pill, store and router; fetch answers the Contacts API and the
// Copilot with contract-shaped bodies (backend #72).
const rail = () => screen.queryByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const pill = () => within(screen.getByTestId('nav-actions'));

describe('Ask Revenact on Contacts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts the glass rail beside the page from xl, in one frame, with the pill in the top bar', async () => {
    stubContactsAsk();
    renderContactsPage('/contacts', { ask: true });
    await screen.findByText('Lukas Vermeer');
    expect(rail()).toHaveClass('w-[320px]');
    expect(document.querySelectorAll('[data-frame="contacts"]')).toHaveLength(1);
    expect(document.querySelectorAll('.rv-card-glass')).toHaveLength(1);
    expect(pill().getByRole('button', { name: 'Hide Copilot' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(pill().getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(rail()).not.toBeInTheDocument());
  });

  it('asks about the filtered list, sending only the set filters', async () => {
    const { copilot } = stubContactsAsk();
    renderContactsPage('/contacts?sentiment=negative', { ask: true });
    expect(await within(rail()!).findByText('Contacts · Negative')).toBeInTheDocument();
    await userEvent.type(composer(), 'Who is unhappy?{Enter}');
    await waitFor(() => expect(postedBodies(copilot)).toHaveLength(1));
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'contacts', view: 'list', filters: { sentiment: 'negative' } });
  });

  it('asks about the open person, named from the page before the server labels it', async () => {
    const { copilot } = stubContactsAsk();
    renderContactsPage('/contacts/41', { ask: true });
    expect(await within(rail()!).findByText('Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA')).toBeInTheDocument();
    await userEvent.type(composer(), 'How is Lukas?{Enter}');
    await waitFor(() => expect(postedBodies(copilot)).toHaveLength(1));
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'contacts', view: 'person', contact: 41, focus: null });
  });

  it('moves the chip to the next person without re-labelling an answer already given', async () => {
    stubContactsAsk({ copilot: { label: (c) => (c.view === 'person' ? `Person ${c.contact}` : 'Contacts') } });
    renderContactsPage('/contacts/41', { ask: true });
    await within(rail()!).findByText('Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA');
    await userEvent.type(composer(), 'How is Lukas?{Enter}');
    expect(await within(rail()!).findByText('Person 41')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /Mira Patel/ }));
    expect(await within(rail()!).findByText('Mira Patel · Pizza Hut')).toBeInTheDocument();
    expect(within(rail()!).getByText('Person 41')).toBeInTheDocument();
  });

  it("refuses a person the asker can't open, keeping the question", async () => {
    stubContactsAsk({ copilot: { refuse: { contact: ['Not a person you can open.'] } } });
    renderContactsPage('/contacts/41', { ask: true });
    await within(rail()!).findByText('Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA');
    await userEvent.type(composer(), 'How is Lukas?{Enter}');
    expect(await within(rail()!).findByText("You can't ask about this person here.")).toBeInTheDocument();
    expect(within(rail()!).getByText('How is Lukas?')).toBeInTheDocument();
  });

  it('opens as a sheet below sm, from the pill', async () => {
    stubContactsAsk();
    renderContactsPage('/contacts', { ask: true, width: 375 });
    await screen.findByText('Lukas Vermeer');
    expect(rail()).not.toBeInTheDocument();
    await userEvent.click(pill().getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('dialog', { name: 'Ask Revenact' })).toBeInTheDocument();
  });
});
```

  Before relying on them, check these against the existing Organizations Ask tests and the rail:
  - The rail's accessible names ("Ask Revenact" complementary, the sheet's dialog name).
  - The composer placeholder.
  - How a failed or refused question is shown (the rail keeps the question text).
  - The exact link name of Mira's list item.

  Copy each assertion's form from the Organizations tests (`organizationsAsk.test.tsx`, `detailAsk.test.tsx`, `AskSheet.test.tsx`). Change only what the Contacts behaviour changes.

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/pages/contacts/ask --maxWorkers=2`
Expected: FAIL, missing modules (`testContactsAsk`, the `ask` option).

- [ ] **Step 4: Implement**

```ts
// src/pages/contacts/ask/useContactsContext.ts
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { contactsContextOf } from '../../../features/contacts/askContext';
import type { ContactsListContext, ContactsPersonContext } from '../../copilot/types';

/** Where the person is on Contacts, as the server needs it (spec §4.1): one
 *  person's id on /contacts/:id, else the page's set filters. Rebuilt only
 *  when the path or the query changes. Null on a bad id. */
export function useContactsContext(): ContactsListContext | ContactsPersonContext | null {
  const { pathname, search } = useLocation();
  return useMemo(() => contactsContextOf(pathname, search), [pathname, search]);
}
```

```ts
// src/pages/contacts/ask/contactsNames.ts
import { createContext, useContext, useEffect } from 'react';
import type { ContactsNames } from '../../../features/contacts/askContext';

/** Only the Contacts page knows the open person's name and place and the
 *  filtered organisation's and account's names, so it reports them here, and
 *  a live question's chip can name them before the server has. Null outside
 *  ContactsAskLayout. */
export const ContactsNamesContext = createContext<((names: ContactsNames) => void) | null>(null);

export function useReportContactsNames(names: ContactsNames): void {
  const report = useContext(ContactsNamesContext);
  useEffect(() => {
    report?.(names);
  }, [report, names]);
}
```

```tsx
// src/pages/contacts/ask/ContactsAskLayout.tsx
import { useCallback, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { surfaceLabel } from '../../../components/copilot/surfaceLabels';
import type { ContactsNames } from '../../../features/contacts/askContext';
import { CONTACTS_ASK_KEY } from '../../dashboard/ask/askPreference';
import { AskProvider } from '../../dashboard/ask/AskProvider';
import { AskRail } from '../../dashboard/ask/AskRail';
import type { AskSurface } from '../../dashboard/ask/context';
import { ContactsFrame } from '../ContactsFrame';
import { ContactsNamesContext } from './contactsNames';
import { useContactsContext } from './useContactsContext';

const same = <T,>(prev: T | null, next: T) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next);

/** The Contacts route's Ask (spec 2026-09-28 §4.4): one conversation above
 *  the list and every person, so it lasts through filters, people and back.
 *  The frame and its rail (with the pill) sit here, beside the Outlet, so a
 *  route change never remounts the rail; ContactsPage's own frame inside it
 *  passes its content straight through. */
export function ContactsAskLayout() {
  const context = useContactsContext();
  const [names, setNames] = useState<ContactsNames | null>(null);
  const report = useCallback((next: ContactsNames) => setNames((prev) => same(prev, next)), []);
  const chipLabel = useCallback(
    (asked: Parameters<AskSurface['chipLabel']>[0]) => surfaceLabel(asked, { contacts: names }),
    [names],
  );
  const surface: AskSurface = useMemo(() => ({ name: 'contacts', context, chipLabel }), [context, chipLabel]);
  return (
    <ContactsNamesContext.Provider value={report}>
      <AskProvider surface={surface} preferenceKey={CONTACTS_ASK_KEY}>
        <ContactsFrame rail={<AskRail />}>
          <Outlet />
        </ContactsFrame>
      </AskProvider>
    </ContactsNamesContext.Provider>
  );
}
```

  `App.tsx`: wrap only the page route (the old `/contacts/list` redirect stays outside), and import the layout.

```tsx
          <Route path="contacts/list" element={<ContactsListRedirect />} />
          {/* One Ask conversation above the list and every person (spec 2026-09-28 §4). */}
          <Route element={<ContactsAskLayout />}>
            <Route path="contacts/:id?" element={<ContactsPage />} />
          </Route>
```

  `ContactsPage.tsx`: report names. Read the open person from the store's `selectedContact` (as `ContactProfile` does) and use `placeOf`/`placeLabel` from `contactsFormat`. Memoise, so the report changes only when a name does:

```tsx
  const { selectedContact } = useAppSelector((state) => state.customers);
  const accountName = /* the account's name if the list's rows carry it: */
    allContacts.find((c) => c.account && String(c.account.id) === params.account)?.account?.name ?? null;
  const names = useMemo<ContactsNames>(
    () => ({
      person:
        selectedId !== null && selectedContact?.id === selectedId
          ? { id: selectedId, name: selectedContact.name, place: placeLabel(placeOf(selectedContact)) }
          : null,
      organisation: params.customer && organisationName ? { id: Number(params.customer), name: organisationName } : null,
      account: params.account && accountName ? { id: Number(params.account), name: accountName } : null,
    }),
    [selectedId, selectedContact, params.customer, params.account, organisationName, accountName],
  );
  useReportContactsNames(names);
```

  Fold `selectedContact` into the existing `useAppSelector` destructure rather than adding a second one if that reads cleaner.

  `testContactsAsk.ts`: Contacts API and Copilot behind one fetch, as `stubOrganizationsAsk` does.

```ts
// src/pages/contacts/ask/testContactsAsk.ts
import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { stubContactsApi, type ContactsStub } from '../../../features/contacts/testContacts';

/** Test-only. The Contacts page's endpoints (stubContactsApi) and the
 *  Copilot's (stubCopilot) behind one fetch, so the page and its rail both
 *  answer. `copilot` is the spy postedBodies reads; `contacts` the one
 *  `requested` reads. */
export function stubContactsAsk(options: { copilot?: Parameters<typeof stubCopilot>[0]; contacts?: ContactsStub } = {}) {
  const copilot = stubCopilot(options.copilot);
  const contacts = stubContactsApi(options.contacts);
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? copilot.spy(String(input), init) : contacts(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { copilot: copilot.spy, contacts, release: copilot.release };
}
```

  `testPage.tsx`: add `ask = false` to the options. With `ask`, render the routes inside `<SlotHost bare>` and put the page route under `<Route element={<ContactsAskLayout />}>`, as `renderOrganizationPage` does with `OrganizationsAskLayout`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/pages/contacts src/pages/organizations --maxWorkers=2` → all pass. Then run `npx tsc -b` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/pages/contacts src/test/SlotHost.tsx src/pages/organizations/testDetail.tsx
git commit -m "feat(contacts): the Ask rail on Contacts, one conversation across the list and every person

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Two panes only when they fit beside the rail

**Files:**
- Modify: `src/pages/contacts/ContactsPage.tsx`
- Test: `src/pages/contacts/ask/contactsAsk.test.tsx` (add a `describe('layout beside the rail')`)

**Interfaces:**
- Consumes: `useAsk()` (`src/pages/dashboard/ask/useAsk.ts`), `XL` and `SM` from `src/lib/useMediaQuery.ts`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('layout beside the rail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });
  const pane = (name: string) => document.querySelector(`[data-pane="${name}"]`);

  it('keeps two panes from xl with the rail open, the list narrowed', async () => {
    stubContactsAsk();
    renderContactsPage('/contacts/41', { ask: true, width: 1440 });
    await screen.findByRole('heading', { name: 'Lukas Vermeer' });
    expect(pane('list')).toHaveClass('w-[18rem]');
    expect(pane('profile')).toBeInTheDocument();
  });

  it('shows one pane between md and xl while the rail is open, and two once it is hidden', async () => {
    stubContactsAsk();
    localStorage.setItem('revenact_contacts_ask', 'open');
    renderContactsPage('/contacts/41', { ask: true, width: 1100 });
    await screen.findByRole('heading', { name: 'Lukas Vermeer' });
    expect(pane('list')).toBeNull();
    expect(screen.getByRole('link', { name: 'Contacts' })).toBeInTheDocument(); // the back link
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(pane('list')).toHaveClass('w-[22rem]'));
    expect(pane('profile')).toBeInTheDocument();
    localStorage.clear();
  });

  it('keeps the delivery 1 layout with no Ask provider', async () => {
    stubContactsAsk();
    renderContactsPage('/contacts/41', { width: 1100 });
    await screen.findByRole('heading', { name: 'Lukas Vermeer' });
    expect(pane('list')).toHaveClass('w-[22rem]');
  });
});
```

  Check how the existing tests reset `localStorage` (a test setup file may already clear it), and match that.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/contacts/ask --maxWorkers=2` → the new layout cases fail.

- [ ] **Step 3: Implement** in `ContactsPage.tsx`:

```tsx
  const ask = useAsk();
  const isXl = useMediaQuery(XL);
  // The rail beside the page takes 320px: two panes fit beside it only from
  // xl, the list narrowed (spec 2026-09-28 §4.4 "the list narrows and the
  // profile stays"). Below sm the rail is a sheet over the page.
  const railBeside = isSm && Boolean(ask?.open);
  const twoPanes = isMd && (!railBeside || isXl);
```

  Replace every `!isMd` in the body selection with `!twoPanes`. Give the list pane `className={`${railBeside ? 'w-[18rem]' : 'w-[22rem] lg:w-[26rem]'} shrink-0 overflow-y-auto`}`.

- [ ] **Step 4: Run the page's tests**

Run: `npx vitest run src/pages/contacts --maxWorkers=2` → all pass, including delivery 1's `ContactsPage.test.tsx` unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/pages/contacts
git commit -m "feat(contacts): two panes only when they fit beside the Ask rail

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: "Why this sentiment?"

**Files:**
- Modify: `src/components/contacts/ContactProfile.tsx`
- Test: `src/pages/contacts/ask/contactsAsk.test.tsx` (add cases); `src/components/contacts/ContactProfile.test.tsx` (hidden outside a provider)

**Interfaces:**
- Consumes: `AskDraftContext` (`src/pages/dashboard/ask/context.ts`), `whyQuestion` (Task 1).

- [ ] **Step 1: Write the failing tests**

```tsx
// contactsAsk.test.tsx
it('"Why this sentiment?" types the question in, names the focus, and sends nothing until asked', async () => {
  const { copilot } = stubContactsAsk();
  renderContactsPage('/contacts/41', { ask: true });
  await screen.findByRole('heading', { name: 'Lukas Vermeer' });
  await userEvent.click(screen.getByRole('button', { name: 'Why this sentiment?' }));
  expect(composer()).toHaveValue("Why is Lukas's sentiment neutral?");
  expect(within(rail()!).getByText('Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA · Sentiment')).toBeInTheDocument();
  expect(postedBodies(copilot)).toHaveLength(0);
  await userEvent.type(composer(), '{Enter}');
  await waitFor(() => expect(postedBodies(copilot)).toHaveLength(1));
  expect(postedBodies(copilot)[0]).toMatchObject({
    content: "Why is Lukas's sentiment neutral?",
    context: { surface: 'contacts', view: 'person', contact: 41, focus: 'sentiment' },
  });
});

it('opens the sheet with the question on phones', async () => {
  stubContactsAsk();
  renderContactsPage('/contacts/41', { ask: true, width: 375 });
  await screen.findByRole('heading', { name: 'Lukas Vermeer' });
  await userEvent.click(screen.getByRole('button', { name: 'Why this sentiment?' }));
  const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
  expect(within(sheet).getByPlaceholderText('Ask Revenact')).toHaveValue("Why is Lukas's sentiment neutral?");
});
```

```tsx
// ContactProfile.test.tsx
it('has no "Why this sentiment?" outside an Ask provider', async () => {
  // Render as the file's existing tests do (no provider).
  // After the profile loads: expect(screen.queryByRole('button', { name: 'Why this sentiment?' })).toBeNull();
});
```

  Write the last test with the file's own render helper and its existing load wait.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/contacts/ask src/components/contacts/ContactProfile.test.tsx --maxWorkers=2` → the new cases fail.

- [ ] **Step 3: Implement** in `ContactProfile.tsx`:
  - Remove the "arrives with Ask on Contacts (delivery 2, §4)" line from the component's doc comment.
  - Read `const draft = useContext(AskDraftContext);`.
  - In the sentiment section's text column, after the `META` line, add:

```tsx
          {draft ? (
            <button
              type="button"
              onClick={() => draft(whyQuestion(contact.name, history.sentiment), { kind: 'sentiment' })}
              className={`${QUIET} -ml-2 w-fit`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Why this sentiment?
            </button>
          ) : null}
```

  `QUIET` is the quiet-button class this file already uses for "Try again". Import `Sparkles` from `lucide-react`, and `AskDraftContext` and `whyQuestion`. Check that `QUIET` gives a 44px target below `sm`; if not, add `min-h-11 sm:min-h-9` as other quiet buttons in `components/contacts` do.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/pages/contacts src/components/contacts --maxWorkers=2` → all pass. This includes the house-rules suite over `components/contacts`.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactProfile.tsx src/components/contacts/ContactProfile.test.tsx src/pages/contacts/ask/contactsAsk.test.tsx
git commit -m "feat(contacts): \"Why this sentiment?\" types the question into the Ask rail

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: History reopens a Contacts conversation where it was asked

**Files:**
- Test: `src/pages/contacts/ask/historyRestore.test.tsx` (new). Change code only if a test fails.

**Interfaces:**
- Consumes: `AskProvider.openFromHistory`, which already navigates to `originPath(origin)` (Task 2 taught it Contacts), and `stubCopilot({conversations, conversationById})`.

- [ ] **Step 1: Write the tests**

```tsx
// src/pages/contacts/ask/historyRestore.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderContactsPage } from '../testPage';
import { stubContactsAsk } from './testContactsAsk';

const ON_LUKAS = {
  id: 9,
  title: 'How is Lukas?',
  created_at: '',
  updated_at: '',
  origin: { surface: 'contacts', view: 'person', contact: 41, label: 'Lukas Vermeer · Kraft Heinz' },
  messages: [
    { id: 1, role: 'user', content: 'How is Lukas?', context: { surface: 'contacts', view: 'person', contact: 41, focus: null, label: 'Lukas Vermeer · Kraft Heinz' }, sources: [], questions: [], created_at: '' },
    { id: 2, role: 'assistant', content: 'Lukas is steady.', sources: [], questions: [], created_at: '' },
  ],
};

describe('History on Contacts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("tags a Contacts conversation with the server's label and reopens it on its person", async () => {
    stubContactsAsk({ copilot: { conversations: [ON_LUKAS], conversationById: { 9: ON_LUKAS } } });
    renderContactsPage('/contacts?sentiment=negative', { ask: true });
    await screen.findByText('Owen Price');
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'History' }));
    const item = await screen.findByRole('button', { name: /How is Lukas\?/ });
    expect(within(item).getByText('Lukas Vermeer · Kraft Heinz')).toBeInTheDocument();
    await userEvent.click(item);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/contacts/41'));
    expect(await screen.findByText('Lukas is steady.')).toBeInTheDocument();
  });

  it('reopens a list conversation with its filters', async () => {
    const onList = { ...ON_LUKAS, id: 10, title: 'Who is unhappy?', origin: { surface: 'contacts', view: 'list', filters: { sentiment: 'negative' }, label: 'Contacts · Negative' } };
    stubContactsAsk({ copilot: { conversations: [onList], conversationById: { 10: onList } } });
    renderContactsPage('/contacts/41', { ask: true });
    await screen.findByRole('heading', { name: 'Lukas Vermeer' });
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: /Who is unhappy\?/ }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/contacts?sentiment=negative'));
  });
});
```

  Check the History item's accessible name and the `where` marker against `pages/organizations/ask/historyRestore.test.tsx`, and match them.

- [ ] **Step 2: Run them**

Run: `npx vitest run src/pages/contacts/ask/historyRestore.test.tsx --maxWorkers=2`.
Expected: PASS. If a test fails, the gap is in code (Task 2's branches or the layout), so fix the code, not the test. Say what it was in your report.

- [ ] **Step 3: Commit**

```bash
git add src/pages/contacts/ask/historyRestore.test.tsx
git commit -m "test(contacts): History reopens a Contacts conversation on its person or filtered list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: End to end in jsdom, and the product documents

**Files:**
- Create: `src/e2e/contactsAsk.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: Write the end-to-end journey.** Follow `src/e2e/contacts.test.tsx` (delivery 1's journey) for its render and fetch set-up, and use `stubContactsAsk`. The journey:
  1. Open `/contacts` at 1440px.
  2. Choose Sentiment "Negative". The chip reads "Contacts · Negative".
  3. Ask "Who is unhappy?". The posted context is the list view with `{sentiment: 'negative'}`.
  4. Open Lukas. The chip reads his name and place.
  5. Click "Why this sentiment?" and send. The posted context is the person view with `focus: 'sentiment'`.
  6. Open History. It lists the conversation with its tag.

  Assert each step with the same queries the integration tests use.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/contactsAsk.test.tsx --maxWorkers=2` → PASS.

- [ ] **Step 3: Update the product documents**
  - **`docs/03-ui-ux-design.md`**, the Contacts section:
    - The ✦ rail and pill, the same as Organizations.
    - Two panes beside the rail only from `xl`, with the list at 18rem.
    - One pane between `md` and `xl` while it is open.
    - The sheet below `sm`.
    - "Why this sentiment?" as a quiet link that types the question in.
    - The chip wording.
    - The refusal copy.
  - **`docs/04-app-flow.md`:**
    - The Contacts flow now includes Ask: list or person context, "Why this sentiment?", and History reopening on `/contacts/:id` or `/contacts?<filters>`.
    - The rail's open/closed choice is kept per surface (`revenact_contacts_ask`).
  - **`.agents/workflows/repo-architecture.md`:**
    - `src/pages/contacts/ask/` (`ContactsAskLayout`, `useContactsContext`, `contactsNames`).
    - `src/features/contacts/askContext.ts`.
    - Contacts as the third Ask surface in the shared `pages/dashboard/ask` machinery.

- [ ] **Step 4: Commit**

```bash
git add src/e2e/contactsAsk.test.tsx docs .agents
git commit -m "test(contacts): the Ask on Contacts journey end to end; docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** none changed unless a check fails.

- [ ] **Step 1:** `npx vitest run --maxWorkers=2`. Expected: every file passes.
- [ ] **Step 2:** `npx tsc -b`. Expected: exit 0.
- [ ] **Step 3:** `npm run lint`. Expected: 0 errors, and no warnings in files this plan touched (16 older ones stay).
- [ ] **Step 4:** `npm run build`. Expected: completes (the existing chunk-size warning is not new).
- [ ] **Step 5:** If anything fails, fix it with superpowers:systematic-debugging, commit as `fix(contacts): <what>`, and repeat Steps 1–4.

---

### Task 9: Controller browser check at 1440px, 1100px and 375px, both themes

Run by the controller, not a subagent. Before starting:
- Backend #72 must be running locally: `revenact-backend` on branch `feat/contacts-ask`, `runserver 8000`.
- `npm run dev` must be up.
- Use the claude-in-chrome tools. Where the window cannot be resized, load the app in a same-origin iframe of the target width, as delivery 1's check did.

- [ ] **1440px, light:**
  - The pill sits in the top bar and the rail is open beside two panes, with the list narrowed.
  - Ask a list question with a sentiment filter. The chip and History tag read the server's label.
  - Open a person and click "Why this sentiment?". The question is typed in and not sent; send it. The answer respects the strict rule: nothing about records the viewer cannot open.
- **1100px:** with the rail open the page shows one pane; hiding the rail brings back two.
- **375px:** the pill opens the sheet, and "Why this sentiment?" opens the sheet with the question.
- **Dark theme:** repeat at 1440px visually.
- **History:** from the Dashboard, pick the Contacts conversation. It opens on `/contacts/:id`.
- **Record:** note anything off as a follow-up, or fix it on this branch (with a test) before the PR.

---

## Self-review

**Spec coverage (§4.4, frontend):**
- The layout and rail slot → Task 3.
- The pill → Task 3 (the shared `AskRail`/`AskControls`).
- "List narrows, profile stays" → Task 4.
- The sheet below `sm` → Tasks 3 and 5.
- The chip follows the route, and past answers keep theirs → Task 3.
- "Why this sentiment?" typed in, not sent, focus "sentiment" → Tasks 1, 2 and 5.
- History handover → Tasks 2 and 6.
- Empty rail with no suggestions → the shared rail, unchanged.
- Refusal copy → Task 2, with a test in Task 3.

§7 frontend tests:
- unit → Tasks 1 and 2
- integration → Tasks 3–6
- jsdom end-to-end → Task 7
- house rules → Task 5 (the suite already covers `components/contacts`)

**Decisions the spec left open:** 1–7 above. Decision 2 (two panes only from `xl` with the rail open) is the one to check in the browser.

**Type consistency:**
- `ContactsNames` (`person`, `organisation`, `account`) is the same in Tasks 1, 2 and 3.
- The `ContactsListContext` / `ContactsPersonContext` fields match backend #72's shapes (`filters` keys `q`, `customer`, `account`, `sentiment`, `role`; `contact`; `focus: 'sentiment' | null`).
- `CONTACTS_ASK_KEY` is `'revenact_contacts_ask'` in Tasks 2 and 4.
- `stubContactsAsk` returns `{copilot, contacts, release}` in Tasks 3–7.

**Left for the implementer to confirm against the code** (each step names the file to copy from):
- the rail's accessible names
- the History item's accessible name
- `ApiError`'s constructor
- the History-tag test harness
- `localStorage` reset

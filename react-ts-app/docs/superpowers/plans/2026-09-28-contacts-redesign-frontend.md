# Contacts redesign, delivery 1 (frontend): the list, the profile and the organisation page ties — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Contacts table, stat cards and separate profile page with one page at `/contacts`: a summary line and URL filters over a list of people, and the chosen person's profile beside it (`/contacts/:id`), with their sentiment and why and their calls, emails and tickets; and tie it to the organisation page (a person's name opens their profile, and calls say "Not enough to analyse").

**Architecture:** Pure modules in `src/features/contacts/` hold the backend contract types, the URL state (`contactsParams.ts`) and the words and tones (`contactsFormat.ts`). The existing `customersSlice` keeps the list and the selected person and gains the summary, "Load more", stale-read guards and `fetchContactHistory` (`/contacts/<id>/interactions/` and `/contacts/stats/` are retired). New components in `src/components/contacts/` (toolbar, list, list item, profile, history rows) compose into `pages/contacts/ContactsPage.tsx`, inside a `ContactsFrame` that copies the Organizations frame and leaves a slot for the Ask rail (delivery 2). Phones render the list or the profile, never both.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit, react-router 7, lucide-react, Vitest 5 + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-28-contacts-redesign-design.md` — §3 "The Contacts page (frontend)", §5 "Ties to the organisation page" and §7 "Testing", Frontend, are binding. §4 (Ask on Contacts) is delivery 2 and is **not** in this plan. The backend contract is `revenact-backend/docs/superpowers/plans/2026-09-28-contacts-redesign-backend.md` ("Notes for the frontend plan" and the `docs/API_CONTRACTS.md` text in its Task 9). House rules: `.claude/skills/revenact-design/SKILL.md` §1 and §4.

## Global Constraints

- Owner's standing rules: app-ready, never spreadsheet-like, no information lost.
- **Layout** (spec §3): "The layout is a list and a profile panel (owner's choice A), like the Communications inbox." Solid surfaces only: glass stays on the Ask rail (house rule 4).
- **Header** (spec §3): "A summary line: "142 people · 38 decision makers · 61% positive · 12 negative"." "Search and filters for organisation, account, sentiment and role, all kept in the URL." "+ Add". The URL keys are `q`, `customer`, `account`, `sentiment`, `role`.
- **List item** (spec §3): "initials, name and role"; ""Organisation › Account", or the organisation alone"; "sentiment in words, with its colour, and "n calls" beside it"; "last contacted". "The list pages or loads more at the end. It has designed empty, loading and error states."
- **Profile** (spec §3): "Name, role, email and phone links (sanitised), and "Organisation › Account". Each links to `/organizations/:id`, and the account link opens that account's chip." "Sentiment and why." "Calls, newest first. Each shows date, title, sentiment or "Not enough to analyse", the summary (expandable), the AI classification, the host and the organisation and account tag. Then emails and tickets." "Edit and Delete, using the existing flows."
- **Phones** (spec §3): "The list is full width, and choosing a person opens the profile as its own screen with a back link. Layouts for phone and desktop are rendered conditionally."
- **Removed** (spec §3): "The table, the stat cards (their figures move to the summary line) and the separate profile page, whose route now opens the panel."
- **Ties** (spec §5): "On the People tab, a person's name opens `/contacts/:id`." "The Calls section shows every call's sentiment, or "Not enough to analyse"." "The contact profile links back to the organisation and, where relevant, to the account with its chip chosen."
- **Backend contract** (merged and deployed before this PR, spec §6):
  - `GET /contacts/?search&customer&account&sentiment&role&page` (`company` is an alias; send `customer`) returns `{count, next, previous, results, summary}`; `summary` is `{total, positive, neutral, negative, decision_makers}` over the whole filtered set; each row adds `organisation {id, name} | null` and `account {id, name} | null`. Page size 25.
  - `GET /contacts/<id>/history/` returns `{contact_id, sentiment, sentiment_source, sentiment_evidence, counts {calls, emails, tickets}, calls[], emails[], tickets[]}`, newest first, 100 per kind at most. A call is `{id, title, occurred_at, duration_minutes, host_name, summary, analysis, sentiment, classification {area, category, subcategory}, organisation, account, link {url}}`; an email `{id, subject, sent_at, sender_name, snippet, analysis, sentiment, classification, organisation, account, link {thread_id}}`; a ticket `{id, ticket_number, title, status, status_display, opened_at, analysis, sentiment, classification, organisation, account, link {url}}`. `analysis` is `pending | not_analysable | analysed`; `sentiment` is `null` unless `analysed`. A contact the viewer cannot open is a `404`.
  - The organisation page's calls (`GET /customers/<id>/calls/`) carry `analysis` too. Their `sentiment` is still the stored field, so a pending call reads `neutral` there: only `analysis` says whether it is a reading.
  - `fetchContactInteractions` (`/contacts/<id>/interactions/`) is retired in this PR; the backend removes that endpoint afterwards.
- House rules §4: tokens only (no hex, rgb or palette colours); type sizes 11/13/15/22 px only; numbers in DM Mono (`font-mono-brand tabular-nums`); Lucide icons only, `aria-hidden` beside text; no card inside a card; 44px targets below `sm` (`min-h-11 sm:min-h-9`); designed empty, loading (skeleton, not spinner) and error-with-retry states; sentence-case copy; both themes through tokens; no motion added.
- Tests per the `testing` skill: unit tests for the list item, the profile and the call row; integration through the real store and router with `fetch` stubbed in contract shapes; a jsdom end-to-end test; the house-rules suite over the new files.
- Run Vitest with `--maxWorkers=2`, one process at a time.
- No new dependencies.
- Work on `feat/contacts-redesign` in `react-ts-app` (its head is the spec commit). Commits are conventional (`feat(contacts): …`, `test(contacts): …`, `docs(contacts): …`) and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Update the product documents in the same PR (`docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`).

## Decisions this plan makes where the spec is silent

1. **"Why this sentiment?" is hidden, not disabled**, until Ask on Contacts (delivery 2) wires it. The profile has a comment where it goes.
2. **A pending call shows no reading**, neither "Analysing…" nor a sentiment, on both the organisation page and the profile. The nightly job can leave a call pending for a day, so "Analysing…" would promise more than is true. `readingOf()` is the one rule: `not_analysable` → "Not enough to analyse"; `pending` → nothing; otherwise the sentiment. A call with no `analysis` field (fixtures from before it) shows its sentiment as today.
3. **Routes.** One route, `contacts/:id?`, renders `ContactsPage`, so the page is not remounted when a person is chosen. `/contacts/list` (the old URL) redirects to `/contacts`. The profile's route is the panel (spec §3 "whose route now opens the panel").
4. **Split point.** Two panes from 768px (`MD`, new in `useMediaQuery.ts`); below it, the list or the profile as its own screen. The list pane is 22rem (26rem from `lg`); both panes scroll on their own.
5. **The organisation filter** lists the first page of `/customers/` (`fetchCustomers`, as `/surveys` does); an id not on it still shows as its own option, named from the list's rows when one carries it. **The account filter** waits for an organisation and reads `GET /customers/<id>/accounts/`, as the Add forms do; changing the organisation clears it.
6. **Search** waits 300 ms after the last key and replaces the history entry; the filters push one. Choosing a person keeps the filters in the URL, and the phone back link returns to them.
7. **"n calls"** is `sentiment_evidence.calls`; with none it reads "set by hand" for a hand-set sentiment, else "no calls".
8. **Sentiment and why** reads "Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep" (dates in UTC); with no evidence, "Positive, set by hand. Nothing of theirs has been analysed yet."
9. **Load more**, not page numbers, at the end of the list (as the Communications mailbox); a page lands only on the list it continues.
10. **A 404** on the person or their history reads "This person is not here. They may have been deleted, or they are on an account you cannot open." with Try again.
11. **After Delete** the page goes to `/contacts` with the same filters and reads the list again, so the summary is right. **After Add** it reads the list again. Edit patches the list and the profile through `updateContact`'s reducer, as today.
12. **The Navbar** titles `/contacts` and `/contacts/:id` "Contacts" in the framed bar (transparent, the actions slot where delivery 2's Ask pill goes, no avatar); the person's name is the page's. `DashboardLayout` drops its padding there, as for Organizations.
13. **Emails** have no link: the app has no page for a thread outside an organisation's Story. Tickets link to their `link.url` when it is http(s).
14. **Removed:** `pages/contacts/List.tsx`, `Details.tsx` and their tests; `components/contacts/ContactsTable.tsx`, `MetricsPanel.tsx`, `ActionBar.tsx`; `fetchContactStats`, `fetchContactInteractions` and their types and state. `ContactFormModal` and `ContactRowActionsPopover` stay (the account page's `ContactsTab` uses them). The role list moves to `contactsParams.ts` (`CONTACT_ROLES`) and the form reads it.

## File structure

| File | Responsibility |
|---|---|
| `src/features/contacts/contactsTypes.ts` (new) | The backend shapes: `Analysis`, `ContactsSummary`, `ContactsPage`, `HistoryCall`, `HistoryEmail`, `HistoryTicket`, `ContactHistory` |
| `src/features/contacts/contactsParams.ts` (new) | URL state: `parseContactsParams`, `toContactsSearch`, `contactsApiPath`, `withFilter`, `hasFilters`, `NO_FILTERS`, `SENTIMENTS`, `CONTACT_ROLES` |
| `src/features/contacts/contactsFormat.ts` (new) | Words and tones: `contactsSummaryParts`, `readingOf`, `sentimentWhy`, `callsLabel`, `placeOf`, `placeLabel`, `classificationLabel`, `dayMonth`, `dayLabel`, `safeUrl`, `SENTIMENT_*` |
| `src/features/contacts/testContacts.ts` (new, test only) | Fixtures (Lukas, Mira, Owen, Lukas's history) and `stubContactsApi`, a fetch stub that filters as the backend does |
| `src/features/customers/customersSlice.ts` | `Contact.organisation`/`.account`; summary, Load more, stale guards, `fetchContactHistory`, `CONTACT_NOT_FOUND`; stats and interactions retired |
| `src/features/calls/callsSlice.ts` | `Call.analysis` |
| `src/components/organizations/detail/CallItem.tsx`, `PersonItem.tsx` | "Not enough to analyse"; the name links to `/contacts/:id` |
| `src/components/contacts/ContactListItem.tsx`, `ContactList.tsx` (new) | One person; the list, its states and Load more |
| `src/components/contacts/ContactsToolbar.tsx` (new) | Summary line, search, the four filters, + Add |
| `src/components/contacts/HistoryItems.tsx` (new) | A call, an email and a ticket row on the profile |
| `src/components/contacts/ContactProfile.tsx` (new) | The chosen person: header, sentiment and why, calls, emails, tickets, Edit and Delete |
| `src/pages/contacts/ContactsFrame.tsx`, `ContactsPage.tsx` (new) | The frame with a rail slot; the page composing it all, by breakpoint |
| `src/pages/contacts/testPage.tsx` (new, test only) | `renderContactsPage(url, {width})` on the real store and router |
| `src/App.tsx`, `src/layouts/DashboardLayout.tsx`, `src/components/layout/Navbar.tsx`, `src/lib/useMediaQuery.ts` | Routes, the frame's padding, the title, `MD` |
| `src/components/contacts/houseRules.test.ts`, `src/e2e/contacts.test.tsx` (new) | House rules over the new files; the end-to-end journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | The product documents |

Shared pieces reused, not copied: `ListSearch`, `SummaryLine`, `ListSkeleton` (`components/organizations/detail/ListParts.tsx`); `LIST`, `META`, `ROW_ICON`, `TITLE_BUTTON`, `ITEM_LINK`, `SECTION_HEADING` (`detail/listStyles.ts`); `EmptyState`, `ErrorBlock`, `MoreButton` (`portfolio/PortfolioSections.tsx`); `FOCUS`, `QUIET`, `BUTTON`, `PRIMARY` (`portfolio/styles.ts`); `ErrorState` (`pages/dashboard/shared/DataState.tsx`); `mailtoHref`, `telHref` (`lib/contactLinks.ts`); `durationLabel` (`features/calls/callFormat.ts`); `ContactFormModal`, `ConfirmDialog`; `setViewport`/`resetViewport` (`test/viewport.ts`); `houseRuleSuite` (`test/houseRules.ts`).

---

### Task 1: The contract types, the URL state and the words (pure modules)

**Files:**
- Create: `src/features/contacts/contactsTypes.ts`
- Create: `src/features/contacts/contactsParams.ts`
- Test: `src/features/contacts/contactsParams.test.ts`
- Create: `src/features/contacts/contactsFormat.ts`
- Test: `src/features/contacts/contactsFormat.test.ts`
- Create: `src/features/contacts/testContacts.ts`
- Modify: `src/features/customers/customersSlice.ts`
- Modify: `src/components/contacts/ContactFormModal.tsx`

**Interfaces:**
- Consumes: `Contact`, `CompanyRef`, `ContactSentimentEvidence` (`customersSlice.ts`); `SummaryPart` (`features/organizations/listSummaries.ts`).
- Produces:
  - `contactsTypes.ts`: `Analysis = 'pending' | 'not_analysable' | 'analysed'`, `Reading = Contact['sentiment']`, `ContactsSummary {total, positive, neutral, negative, decision_makers}`, `ContactsPage {count, next, previous, results: Contact[], summary?}`, `Classification`, `HistoryCall`, `HistoryEmail`, `HistoryTicket`, `ContactHistory`.
  - `contactsParams.ts`: `ContactsParams {q, customer, account, sentiment, role}` (strings; `''` is all), `NO_FILTERS`, `SENTIMENTS`, `CONTACT_ROLES: {value: Contact['role']; label}[]`, `parseContactsParams(URLSearchParams): ContactsParams`, `toContactsSearch(ContactsParams): URLSearchParams`, `contactsApiPath(ContactsParams): string`, `withFilter(p, key, value): ContactsParams`, `hasFilters(p): boolean`.
  - `contactsFormat.ts`: `SENTIMENT_LABEL`, `SENTIMENT_PILL`, `SENTIMENT_TEXT`, `SENTIMENT_DOT` (records over `Reading`), `contactsSummaryParts(ContactsSummary): SummaryPart[]`, `readingOf({analysis?, sentiment}): {label, tone} | null`, `dayMonth(iso)`, `dayLabel(iso)`, `sentimentWhy(sentiment, source, evidence): string`, `callsLabel(Contact): string`, `classificationLabel(Classification): string`, `placeOf(Contact): {organisation, account}`, `placeLabel(place): string`, `safeUrl(url): string | null`.
  - `Contact.organisation?: CompanyRef | null` and `Contact.account?: CompanyRef | null`.
  - `testContacts.ts` (tests only): `LUKAS` (41, Kraft Heinz › Kraft Heinz EMEA, neutral from 6 calls and 2 emails), `MIRA` (42, Pizza Hut, positive by hand), `OWEN` (43, Pizza Hut, negative by hand), `PEOPLE`, `CUSTOMERS`, `ACCOUNTS`, `LUKAS_HISTORY` (an analysed call, a not-analysable call, a pending call, an email, a ticket), `emptyHistory`, `summaryOf`, `stubContactsApi(stub?: ContactsStub)` (returns the fetch spy; options `people`, `histories`, `pageSize`, `failList`, `failHistory`) and `requested(spy): string[]`.

- [ ] **Step 1: Write the failing tests**

The fixtures and fetch stub come first: every later task's tests use them. The stub serves `GET /contacts/` (filtering and paging as the backend does, with `summary`), `GET|PATCH|DELETE /contacts/<id>/`, `GET /contacts/<id>/history/`, `GET /customers/` and `GET /customers/<id>/accounts/`, in the contract's shapes; anything else is a 404 that names itself.

**Create** `src/features/contacts/contactsParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NO_FILTERS, contactsApiPath, hasFilters, parseContactsParams, toContactsSearch, withFilter } from './contactsParams';

const parse = (query: string) => parseContactsParams(new URLSearchParams(query));

describe('contactsParams (spec 2026-09-28 §3)', () => {
  it('reads the search and the four filters from the URL', () => {
    expect(parse('q=lukas&customer=6&account=31&sentiment=negative&role=champion')).toEqual({
      q: 'lukas',
      customer: '6',
      account: '31',
      sentiment: 'negative',
      role: 'champion',
    });
  });

  it('reads unknown values as all, and an account only inside an organisation', () => {
    expect(parse('customer=x&sentiment=furious&role=boss')).toEqual(NO_FILTERS);
    expect(parse('account=31')).toEqual(NO_FILTERS);
    expect(parse('customer=0')).toEqual(NO_FILTERS);
  });

  it('writes one URL for equal filters, empties left out', () => {
    const p = { ...NO_FILTERS, role: 'champion' as const, customer: '6', q: '  ' };
    expect(toContactsSearch(p).toString()).toBe('customer=6&role=champion');
    expect(toContactsSearch(parse('role=champion&customer=6')).toString()).toBe('customer=6&role=champion');
  });

  it('asks the API with `search` and `customer`', () => {
    expect(contactsApiPath(NO_FILTERS)).toBe('/contacts/');
    expect(contactsApiPath(parse('q=%20lukas%20&customer=6&account=31&sentiment=positive&role=other'))).toBe(
      '/contacts/?search=lukas&customer=6&account=31&sentiment=positive&role=other',
    );
  });

  it('a new organisation clears the account; other filters keep it', () => {
    const p = parse('customer=6&account=31');
    expect(withFilter(p, 'customer', '7')).toEqual({ ...NO_FILTERS, customer: '7' });
    expect(withFilter(p, 'sentiment', 'neutral')).toEqual({ ...p, sentiment: 'neutral' });
  });

  it('knows when anything narrows the list', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters(parse('q=%20'))).toBe(false);
    expect(hasFilters(parse('role=other'))).toBe(true);
  });
});
```

**Create** `src/features/contacts/contactsFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LUKAS, MIRA } from './testContacts';
import {
  callsLabel,
  classificationLabel,
  contactsSummaryParts,
  dayLabel,
  dayMonth,
  placeLabel,
  placeOf,
  readingOf,
  safeUrl,
  sentimentWhy,
} from './contactsFormat';

const EVIDENCE = { score: 0.1, calls: 6, emails: 2, tickets: 0, positive: 3, neutral: 2, negative: 1, latest_at: '2026-09-12T10:00:00Z' };

describe('contactsFormat (spec 2026-09-28 §3, §5)', () => {
  it('words the summary line', () => {
    expect(contactsSummaryParts({ total: 142, positive: 87, neutral: 43, negative: 12, decision_makers: 38 })).toEqual([
      { value: '142', label: 'people' },
      { value: '38', label: 'decision makers' },
      { value: '61%', label: 'positive' },
      { value: '12', label: 'negative' },
    ]);
    expect(contactsSummaryParts({ total: 1, positive: 0, neutral: 1, negative: 0, decision_makers: 1 }).map((p) => p.label)).toEqual([
      'person',
      'decision maker',
      'positive',
      'negative',
    ]);
    expect(contactsSummaryParts({ total: 0, positive: 0, neutral: 0, negative: 0, decision_makers: 0 })[2].value).toBe('0%');
  });

  it('reads a record: its sentiment, "Not enough to analyse", or nothing while pending', () => {
    expect(readingOf({ analysis: 'analysed', sentiment: 'negative' })).toEqual({ label: 'Negative', tone: 'bg-danger-dim text-danger' });
    expect(readingOf({ analysis: 'not_analysable', sentiment: null })).toEqual({
      label: 'Not enough to analyse',
      tone: 'bg-subtle text-ink-muted',
    });
    // The org page's calls still carry the model's default `neutral` while
    // pending: it is not a reading.
    expect(readingOf({ analysis: 'pending', sentiment: 'neutral' })).toBeNull();
    expect(readingOf({ sentiment: 'positive' })?.label).toBe('Positive');
    expect(readingOf({ sentiment: '' })).toBeNull();
  });

  it('dates in UTC', () => {
    expect(dayMonth('2026-09-12T23:30:00Z')).toBe('12 Sep');
    expect(dayLabel('2026-01-02T00:00:00Z')).toBe('2 Jan 2026');
  });

  it('says why a person reads as they do', () => {
    expect(sentimentWhy('neutral', 'computed', EVIDENCE)).toBe(
      'Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep',
    );
    expect(sentimentWhy('positive', 'computed', { ...EVIDENCE, calls: 1, emails: 1, tickets: 1, latest_at: null })).toBe(
      'Positive: 3 positive · 2 neutral · 1 negative across 1 call, 1 email and 1 ticket',
    );
    expect(sentimentWhy('negative', 'manual', {})).toBe('Negative, set by hand. Nothing of theirs has been analysed yet.');
    expect(sentimentWhy('neutral', 'computed', { ...EVIDENCE, calls: 0, emails: 0 })).toBe(
      'Neutral, set by hand. Nothing of theirs has been analysed yet.',
    );
  });

  it('counts calls beside the sentiment', () => {
    expect(callsLabel(LUKAS)).toBe('6 calls');
    expect(callsLabel({ ...LUKAS, sentiment_evidence: { ...EVIDENCE, calls: 1 } })).toBe('1 call');
    expect(callsLabel(MIRA)).toBe('set by hand');
    expect(callsLabel({ ...LUKAS, sentiment_evidence: { ...EVIDENCE, calls: 0 } })).toBe('no calls');
  });

  it('names a classification, blanks left out', () => {
    expect(classificationLabel({ area: 'Customer Success', category: 'Account Management', subcategory: '' })).toBe(
      'Customer Success › Account Management',
    );
    expect(classificationLabel({ area: '', category: '', subcategory: '' })).toBe('');
  });

  it('places a person: the served refs, or the older fields', () => {
    expect(placeLabel(placeOf(LUKAS))).toBe('Kraft Heinz › Kraft Heinz EMEA');
    expect(placeLabel(placeOf(MIRA))).toBe('Pizza Hut');
    const older = { ...LUKAS, organisation: undefined, account: undefined };
    expect(placeOf(older)).toEqual({ organisation: { id: 6, name: 'Kraft Heinz' }, account: { id: 31, name: 'Kraft Heinz EMEA' } });
  });

  it('links only http(s)', () => {
    expect(safeUrl('https://zoom.us/rec/1')).toBe('https://zoom.us/rec/1');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});
```

**Create** `src/features/contacts/testContacts.ts`:

```ts
// Test-only fixtures and a fetch stub for the Contacts page, in the backend's
// contract shapes (revenact-backend docs/API_CONTRACTS.md: GET /contacts/,
// GET /contacts/<id>/, GET /contacts/<id>/history/).
import { vi } from 'vitest';
import type { Contact } from '../customers/customersSlice';
import type { ContactHistory, ContactsSummary } from './contactsTypes';

const KRAFT = { id: 6, name: 'Kraft Heinz' };
const KRAFT_EMEA = { id: 31, name: 'Kraft Heinz EMEA' };
const PIZZA = { id: 7, name: 'Pizza Hut' };

function person(id: number, name: string, extra: Partial<Contact>): Contact {
  return {
    id,
    name,
    role: 'other',
    role_display: 'Other',
    email: '',
    phone: '',
    status: 'active',
    sentiment: 'neutral',
    sentiment_source: 'manual',
    sentiment_evidence: {},
    sentiment_computed_at: null,
    last_contacted_at: null,
    companies: [PIZZA],
    organisation: PIZZA,
    account_id: null,
    account_name: null,
    account: null,
    ...extra,
  };
}

/** On Kraft Heinz's EMEA account; neutral, read from six calls and two emails. */
export const LUKAS: Contact = person(41, 'Lukas Vermeer', {
  role: 'champion',
  role_display: 'Champion',
  email: 'lukas@kraftheinz.example',
  phone: '+44 20 7946 0001',
  sentiment: 'neutral',
  sentiment_source: 'computed',
  sentiment_evidence: { score: 0.1, calls: 6, emails: 2, tickets: 0, positive: 3, neutral: 2, negative: 1, latest_at: '2026-09-12T10:00:00Z' },
  sentiment_computed_at: '2026-09-12T11:00:00Z',
  last_contacted_at: '2026-09-12T10:00:00Z',
  companies: [KRAFT],
  organisation: KRAFT,
  account_id: 31,
  account_name: 'Kraft Heinz EMEA',
  account: KRAFT_EMEA,
});

/** On Pizza Hut itself; positive, set by hand. */
export const MIRA: Contact = person(42, 'Mira Patel', {
  role: 'decision_maker',
  role_display: 'Decision Maker',
  email: 'mira@pizzahut.example',
  sentiment: 'positive',
});

/** On Pizza Hut itself; negative, set by hand, never contacted. */
export const OWEN: Contact = person(43, 'Owen Price', {
  role: 'finance_manager',
  role_display: 'Finance Manager',
  sentiment: 'negative',
});

export const PEOPLE: Contact[] = [LUKAS, MIRA, OWEN];

export const CUSTOMERS = [
  { ...KRAFT, id: 6 },
  { ...PIZZA, id: 7 },
];

export const ACCOUNTS: Record<number, { id: number; name: string }[]> = {
  6: [KRAFT_EMEA, { id: 32, name: 'Kraft Heinz NA' }],
  7: [],
};

const NO_CLASS = { area: '', category: '', subcategory: '' };

/** Lukas's history: an analysed call, a call with nothing to read, one still
 *  pending, an email and a ticket. */
export const LUKAS_HISTORY: ContactHistory = {
  contact_id: 41,
  sentiment: 'neutral',
  sentiment_source: 'computed',
  sentiment_evidence: LUKAS.sentiment_evidence,
  counts: { calls: 3, emails: 1, tickets: 1 },
  calls: [
    {
      id: 71,
      title: 'Renewal readiness',
      occurred_at: '2026-09-12T10:00:00Z',
      duration_minutes: 45,
      host_name: 'Carl CSM',
      summary: 'They want the enterprise tier. Budget is agreed for Q4.',
      analysis: 'analysed',
      sentiment: 'positive',
      classification: { area: 'Customer Success', category: 'Account Management', subcategory: '' },
      organisation: KRAFT,
      account: KRAFT_EMEA,
      link: { url: 'https://zoom.us/rec/71' },
    },
    {
      id: 72,
      title: 'Call',
      occurred_at: '2026-09-10T10:00:00Z',
      duration_minutes: null,
      host_name: 'Carl CSM',
      summary: '',
      analysis: 'not_analysable',
      sentiment: null,
      classification: NO_CLASS,
      organisation: KRAFT,
      account: null,
      link: { url: null },
    },
    {
      id: 73,
      title: 'Kick-off',
      occurred_at: '2026-09-01T10:00:00Z',
      duration_minutes: 30,
      host_name: 'Rita Rep',
      summary: 'Plan agreed.',
      analysis: 'pending',
      sentiment: null,
      classification: NO_CLASS,
      organisation: KRAFT,
      account: KRAFT_EMEA,
      link: { url: 'javascript:alert(1)' },
    },
  ],
  emails: [
    {
      id: 88,
      subject: 'Thanks for the call',
      sent_at: '2026-09-11T08:00:00Z',
      sender_name: 'Lukas Vermeer',
      snippet: 'Thanks for walking us through the plan.',
      analysis: 'analysed',
      sentiment: 'positive',
      classification: NO_CLASS,
      organisation: KRAFT,
      account: null,
      link: { thread_id: 't-19' },
    },
  ],
  tickets: [
    {
      id: 7,
      ticket_number: 'ZD-1042',
      title: 'Export fails',
      status: 'open',
      status_display: 'Open',
      opened_at: '2026-09-10',
      analysis: 'pending',
      sentiment: null,
      classification: NO_CLASS,
      organisation: KRAFT,
      account: null,
      link: { url: 'https://kraft.zendesk.example/t/1042' },
    },
  ],
};

export function emptyHistory(contact: Contact): ContactHistory {
  return {
    contact_id: contact.id,
    sentiment: contact.sentiment,
    sentiment_source: contact.sentiment_source,
    sentiment_evidence: contact.sentiment_evidence,
    counts: { calls: 0, emails: 0, tickets: 0 },
    calls: [],
    emails: [],
    tickets: [],
  };
}

const DECISION = new Set(['executive_sponsor', 'decision_maker', 'economic_buyer']);

export function summaryOf(rows: Contact[]): ContactsSummary {
  return {
    total: rows.length,
    positive: rows.filter((r) => r.sentiment === 'positive').length,
    neutral: rows.filter((r) => r.sentiment === 'neutral').length,
    negative: rows.filter((r) => r.sentiment === 'negative').length,
    decision_makers: rows.filter((r) => DECISION.has(r.role)).length,
  };
}

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

export interface ContactsStub {
  people?: Contact[];
  histories?: Record<number, ContactHistory>;
  /** Rows per page (the backend's is 25). */
  pageSize?: number;
  /** How many list reads fail (500) before they succeed. */
  failList?: number;
  /** How many history reads fail (500) before they succeed. */
  failHistory?: number;
}

/** Stubs fetch with the Contacts page's endpoints, filtering as the backend
 *  does. Returns the spy; `paths(spy)` lists what was asked. */
export function stubContactsApi(stub: ContactsStub = {}) {
  let people = [...(stub.people ?? PEOPLE)];
  const histories: Record<number, ContactHistory> = { 41: LUKAS_HISTORY, ...stub.histories };
  const pageSize = stub.pageSize ?? 25;
  let listFailures = stub.failList ?? 0;
  let historyFailures = stub.failHistory ?? 0;

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const q = url.searchParams;

    if (path === '/contacts/' && method === 'GET') {
      if (listFailures > 0) {
        listFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      const search = (q.get('search') ?? '').toLowerCase();
      const customer = Number(q.get('customer') ?? q.get('company')) || null;
      const account = Number(q.get('account')) || null;
      const rows = people.filter(
        (p) =>
          (!search || `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(search)) &&
          (!customer || p.organisation?.id === customer) &&
          (!account || p.account?.id === account) &&
          (!q.get('sentiment') || p.sentiment === q.get('sentiment')) &&
          (!q.get('role') || p.role === q.get('role')),
      );
      const page = Number(q.get('page') ?? '1');
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);
      let next: string | null = null;
      if (page * pageSize < rows.length) {
        const nextUrl = new URL(url);
        nextUrl.searchParams.set('page', String(page + 1));
        next = nextUrl.toString();
      }
      return json(200, { count: rows.length, next, previous: null, results: slice, summary: summaryOf(rows) });
    }

    const one = /^\/contacts\/(\d+)\/$/.exec(path);
    if (one) {
      const id = Number(one[1]);
      const found = people.find((p) => p.id === id);
      if (!found) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        people = people.filter((p) => p.id !== id);
        return { ok: true, status: 204, json: async () => null };
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body ?? '{}')) as Partial<Contact>;
        const updated = { ...found, ...patch };
        people = people.map((p) => (p.id === id ? updated : p));
        return json(200, updated);
      }
      return json(200, found);
    }

    const history = /^\/contacts\/(\d+)\/history\/$/.exec(path);
    if (history) {
      const id = Number(history[1]);
      const found = people.find((p) => p.id === id);
      if (!found) return json(404, { detail: 'Not found.' });
      if (historyFailures > 0) {
        historyFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      return json(200, histories[id] ?? emptyHistory(found));
    }

    if (path === '/customers/') {
      return json(200, { count: CUSTOMERS.length, next: null, previous: null, results: CUSTOMERS });
    }

    const accounts = /^\/customers\/(\d+)\/accounts\/$/.exec(path);
    if (accounts) return json(200, ACCOUNTS[Number(accounts[1])] ?? []);

    return json(404, { detail: `No stub for ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** Every path and query the page asked for, in order. */
export function requested(spy: ReturnType<typeof vi.fn>): string[] {
  return spy.mock.calls.map(([input]) => {
    const url = new URL(String(input));
    return `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`;
  });
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/contacts/contactsParams.test.ts src/features/contacts/contactsFormat.test.ts src/components/contacts src/components/shared --maxWorkers=2`
Expected: FAIL — `Failed to resolve import "./contactsParams"` and `"./contactsFormat"` (the modules do not exist yet); `testContacts.ts` does not type-check yet either (`organisation` is not on `Contact`).

- [ ] **Step 3: Implement**

`CONTACT_ROLES` replaces `ContactFormModal`'s own copy of the role list (the form keeps its `ROLE_OPTIONS` name).

**Create** `src/features/contacts/contactsTypes.ts`:

```ts
import type { CompanyRef, Contact, ContactSentimentEvidence } from '../customers/customersSlice';

// The Contacts page's backend contract (revenact-backend
// docs/API_CONTRACTS.md: GET /api/v1/contacts/ and
// GET /api/v1/contacts/<id>/history/).

/** Whether a record has been read: `pending` (not yet), `not_analysable`
 *  (a call with nothing to judge) or `analysed`. */
export type Analysis = 'pending' | 'not_analysable' | 'analysed';

export type Reading = Contact['sentiment'];

/** Over the whole filtered set, not the page. */
export interface ContactsSummary {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  decision_makers: number;
}

export interface ContactsPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Contact[];
  /** Optional: a response from before the redesign has none. */
  summary?: ContactsSummary;
}

export interface Classification {
  area: string;
  category: string;
  subcategory: string;
}

interface HistoryRow {
  id: number;
  analysis: Analysis;
  /** Null unless `analysis` is `analysed`. */
  sentiment: Reading | null;
  classification: Classification;
  organisation: CompanyRef | null;
  account: CompanyRef | null;
}

export interface HistoryCall extends HistoryRow {
  title: string;
  occurred_at: string;
  duration_minutes: number | null;
  host_name: string;
  summary: string;
  link: { url: string | null };
}

export interface HistoryEmail extends HistoryRow {
  subject: string;
  sent_at: string;
  sender_name: string;
  snippet: string;
  link: { thread_id: string };
}

export interface HistoryTicket extends HistoryRow {
  ticket_number: string;
  title: string;
  status: string;
  status_display: string;
  opened_at: string;
  link: { url: string | null };
}

/** Newest first, the newest 100 of each kind; `counts` are the visible totals. */
export interface ContactHistory {
  contact_id: number;
  sentiment: Reading;
  sentiment_source: Contact['sentiment_source'];
  sentiment_evidence: ContactSentimentEvidence | Record<string, never>;
  counts: { calls: number; emails: number; tickets: number };
  calls: HistoryCall[];
  emails: HistoryEmail[];
  tickets: HistoryTicket[];
}
```

**Create** `src/features/contacts/contactsParams.ts`:

```ts
import type { Contact } from '../customers/customersSlice';

// The Contacts page's URL state (spec 2026-09-28 §3): the search and the
// four filters. Unknown values read as "all".

export const SENTIMENTS: { value: Contact['sentiment']; label: string }[] = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
];

/** Contact.Role on the backend, value for value. */
export const CONTACT_ROLES: { value: Contact['role']; label: string }[] = [
  { value: 'executive_sponsor', label: 'Executive Sponsor' },
  { value: 'champion', label: 'Champion' },
  { value: 'economic_buyer', label: 'Economic Buyer' },
  { value: 'technical_lead', label: 'Technical Lead' },
  { value: 'decision_maker', label: 'Decision Maker' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'finance_manager', label: 'Finance Manager' },
  { value: 'other', label: 'Other' },
];

export interface ContactsParams {
  q: string;
  /** An organisation (Customer) id, or '' for all. */
  customer: string;
  /** An account id inside that organisation, or ''. */
  account: string;
  sentiment: Contact['sentiment'] | '';
  role: Contact['role'] | '';
}

export const NO_FILTERS: ContactsParams = { q: '', customer: '', account: '', sentiment: '', role: '' };

const idValue = (raw: string | null) => (raw && /^[1-9]\d*$/.test(raw) ? raw : '');

export function parseContactsParams(search: URLSearchParams): ContactsParams {
  const customer = idValue(search.get('customer'));
  const sentiment = search.get('sentiment') ?? '';
  const role = search.get('role') ?? '';
  return {
    q: search.get('q') ?? '',
    customer,
    // An account means something only inside its organisation.
    account: customer ? idValue(search.get('account')) : '',
    sentiment: SENTIMENTS.some((s) => s.value === sentiment) ? (sentiment as Contact['sentiment']) : '',
    role: CONTACT_ROLES.some((r) => r.value === role) ? (role as Contact['role']) : '',
  };
}

/** In a fixed order, empty values left out, so equal filters make one URL. */
export function toContactsSearch(p: ContactsParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.q.trim()) out.set('q', p.q);
  if (p.customer) out.set('customer', p.customer);
  if (p.customer && p.account) out.set('account', p.account);
  if (p.sentiment) out.set('sentiment', p.sentiment);
  if (p.role) out.set('role', p.role);
  return out;
}

/** GET /contacts/ for these filters: `q` is the API's `search`. */
export function contactsApiPath(p: ContactsParams): string {
  const out = new URLSearchParams();
  if (p.q.trim()) out.set('search', p.q.trim());
  if (p.customer) out.set('customer', p.customer);
  if (p.customer && p.account) out.set('account', p.account);
  if (p.sentiment) out.set('sentiment', p.sentiment);
  if (p.role) out.set('role', p.role);
  const query = out.toString();
  return query ? `/contacts/?${query}` : '/contacts/';
}

/** One filter changed; a new organisation clears the account. */
export function withFilter<K extends keyof ContactsParams>(p: ContactsParams, key: K, value: ContactsParams[K]): ContactsParams {
  const next = { ...p, [key]: value };
  if (key === 'customer' && value !== p.customer) next.account = '';
  return next;
}

export function hasFilters(p: ContactsParams): boolean {
  return Boolean(p.q.trim() || p.customer || p.sentiment || p.role);
}
```

**Create** `src/features/contacts/contactsFormat.ts`:

```ts
import type { CompanyRef, Contact, ContactSentimentEvidence } from '../customers/customersSlice';
import type { SummaryPart } from '../organizations/listSummaries';
import type { Analysis, Classification, ContactsSummary, Reading } from './contactsTypes';

// The words and tones the Contacts page and the organisation page's calls
// use for people, sentiment and a record's reading (spec 2026-09-28 §3, §5).

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SENTIMENT_LABEL: Record<Reading, string> = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

/** A reading as a pill. */
export const SENTIMENT_PILL: Record<Reading, string> = {
  positive: 'bg-success-dim text-success',
  neutral: 'bg-subtle text-ink-muted',
  negative: 'bg-danger-dim text-danger',
};

/** A person's sentiment as a word in its colour, with a dot. */
export const SENTIMENT_TEXT: Record<Reading, string> = {
  positive: 'text-success',
  neutral: 'text-ink-muted',
  negative: 'text-danger',
};
export const SENTIMENT_DOT: Record<Reading, string> = {
  positive: 'bg-success',
  neutral: 'bg-line-strong',
  negative: 'bg-danger',
};

/** "142 people · 38 decision makers · 61% positive · 12 negative". */
export function contactsSummaryParts(s: ContactsSummary): SummaryPart[] {
  return [
    { value: String(s.total), label: plural(s.total, 'person', 'people') },
    { value: String(s.decision_makers), label: plural(s.decision_makers, 'decision maker', 'decision makers') },
    { value: `${s.total ? Math.round((s.positive / s.total) * 100) : 0}%`, label: 'positive' },
    { value: String(s.negative), label: 'negative' },
  ];
}

/** What a call, email or ticket reads as: its sentiment, "Not enough to
 *  analyse", or nothing while it waits to be read. A record from before
 *  `analysis` existed shows its sentiment, as it did. */
export function readingOf(record: { analysis?: Analysis; sentiment: string | null }): { label: string; tone: string } | null {
  if (record.analysis === 'not_analysable') return { label: 'Not enough to analyse', tone: 'bg-subtle text-ink-muted' };
  if (record.analysis === 'pending') return null;
  const sentiment = record.sentiment as Reading | null;
  if (!sentiment || !(sentiment in SENTIMENT_LABEL)) return null;
  return { label: SENTIMENT_LABEL[sentiment], tone: SENTIMENT_PILL[sentiment] };
}

/** "12 Sep", in UTC so a day never moves with the viewer's zone. */
export function dayMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "12 Sep 2026". */
export function dayLabel(iso: string): string {
  return `${dayMonth(iso)} ${new Date(iso).getUTCFullYear()}`;
}

function listJoin(parts: string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function hasEvidence(e: ContactSentimentEvidence | Record<string, never>): e is ContactSentimentEvidence {
  return 'calls' in e && (e.calls ?? 0) + (e.emails ?? 0) + (e.tickets ?? 0) > 0;
}

/** Why a person reads as they do: "Neutral: 3 positive · 2 neutral · 1
 *  negative across 6 calls and 2 emails, latest 12 Sep". */
export function sentimentWhy(
  sentiment: Reading,
  source: Contact['sentiment_source'],
  evidence: ContactSentimentEvidence | Record<string, never>,
): string {
  const label = SENTIMENT_LABEL[sentiment];
  if (source !== 'computed' || !hasEvidence(evidence)) {
    return `${label}, set by hand. Nothing of theirs has been analysed yet.`;
  }
  const kinds = listJoin(
    [
      evidence.calls ? `${evidence.calls} ${plural(evidence.calls, 'call', 'calls')}` : '',
      evidence.emails ? `${evidence.emails} ${plural(evidence.emails, 'email', 'emails')}` : '',
      evidence.tickets ? `${evidence.tickets} ${plural(evidence.tickets, 'ticket', 'tickets')}` : '',
    ].filter(Boolean),
  );
  const latest = evidence.latest_at ? `, latest ${dayMonth(evidence.latest_at)}` : '';
  return `${label}: ${evidence.positive} positive · ${evidence.neutral} neutral · ${evidence.negative} negative across ${kinds}${latest}`;
}

/** "n calls" beside a person's sentiment, or where it came from. */
export function callsLabel(contact: Contact): string {
  const calls = 'calls' in contact.sentiment_evidence ? (contact.sentiment_evidence.calls ?? 0) : 0;
  if (calls) return `${calls} ${plural(calls, 'call', 'calls')}`;
  return contact.sentiment_source === 'manual' ? 'set by hand' : 'no calls';
}

/** "Customer Success › Account Management", blank parts left out. */
export function classificationLabel(c: Classification): string {
  return [c.area, c.category, c.subcategory].filter(Boolean).join(' › ');
}

/** A person's organisation and account, from the refs the list serves, or
 *  from the older fields a record from before them carries. */
export function placeOf(contact: Contact): { organisation: CompanyRef | null; account: CompanyRef | null } {
  const organisation = contact.organisation !== undefined ? contact.organisation : (contact.companies[0] ?? null);
  const account =
    contact.account !== undefined
      ? contact.account
      : contact.account_id && contact.account_name
        ? { id: contact.account_id, name: contact.account_name }
        : null;
  return { organisation, account };
}

/** "Kraft Heinz › EMEA", or the organisation alone. */
export function placeLabel(place: { organisation: CompanyRef | null; account: CompanyRef | null }): string {
  return [place.organisation?.name, place.account?.name].filter(Boolean).join(' › ');
}

/** Only http(s) lands in an href. */
export function safeUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  account_id?: number | null;
}

export interface ContactSentimentEvidence {
```

**Replace with:**

```ts
  account_id?: number | null;
  /** The first parent organisation the viewer may open, and the account,
   *  as refs (the Contacts list, spec 2026-09-28 §2). Optional: older
   *  fixtures and nested lists read them from `companies`/`account_*`. */
  organisation?: CompanyRef | null;
  account?: CompanyRef | null;
}

export interface ContactSentimentEvidence {
```

**Find** in `src/components/contacts/ContactFormModal.tsx`:

```tsx
import { companyLabel } from '../../features/customers/formatters';
```

**Replace with:**

```tsx
import { companyLabel } from '../../features/customers/formatters';
import { CONTACT_ROLES } from '../../features/contacts/contactsParams';
```

**Find** in `src/components/contacts/ContactFormModal.tsx`:

```tsx
// Matches Contact.Role on the backend exactly (services/customers/
// models.py) — the serializer already sends a `role_display` for
// read-only rendering, but the form itself needs the value/label pairs
// to build its own <select>.
const ROLE_OPTIONS: { value: Contact['role']; label: string }[] = [
  { value: 'executive_sponsor', label: 'Executive Sponsor' },
  { value: 'champion', label: 'Champion' },
  { value: 'economic_buyer', label: 'Economic Buyer' },
  { value: 'technical_lead', label: 'Technical Lead' },
  { value: 'decision_maker', label: 'Decision Maker' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'finance_manager', label: 'Finance Manager' },
  { value: 'other', label: 'Other' },
];
```

**Replace with:**

```tsx
// Contact.Role on the backend, shared with the Contacts page's role filter.
const ROLE_OPTIONS = CONTACT_ROLES;
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/features/contacts/contactsParams.test.ts src/features/contacts/contactsFormat.test.ts src/components/contacts src/components/shared --maxWorkers=2`
Expected: PASS — every file under the paths given; `contactsParams` 6 tests, `contactsFormat` 8 tests; `ContactFormModal`'s users (`components/contacts`, `components/shared`) unchanged.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactFormModal.tsx src/features/contacts/contactsFormat.test.ts src/features/contacts/contactsFormat.ts src/features/contacts/contactsParams.test.ts src/features/contacts/contactsParams.ts src/features/contacts/contactsTypes.ts src/features/contacts/testContacts.ts src/features/customers/customersSlice.ts
git commit -m "feat(contacts): the contract types, URL state and words for the Contacts page" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The list's summary, Load more and stale guards; a person's history

**Files:**
- Test: `src/features/contacts/contactsState.test.ts`
- Modify: `src/features/customers/customersSlice.ts`
- Test: `src/components/layout/Navbar.test.tsx`
- Test: `src/pages/contacts/Details.test.tsx`

**Interfaces:**
- Consumes: `ContactsPage`, `ContactsSummary`, `ContactHistory` (Task 1); `stubContactsApi`, `LUKAS`, `LUKAS_HISTORY` (Task 1).
- Produces (all exported from `customersSlice.ts`):
  - State: `allContactsSummary: ContactsSummary | null`, `allContactsRequestId?`, `allContactsLoadingMore: boolean`, `allContactsMoreError: string | null`, `selectedContactRequestId?`, `selectedContactHistory: ContactHistory | null`, `selectedContactHistoryLoading: boolean`, `selectedContactHistoryError: string | null`, `selectedContactHistoryRequestId?`.
  - `fetchAllContacts(path: string | void)` — unchanged signature; now keeps `summary`, and an earlier, slower read never lands over a newer one.
  - `loadMoreContacts(next: string)` — appends the `next` page; dropped if a fresh read is on its way or replaced the list.
  - `fetchContactById(id: number)` — unchanged signature; a 404 rejects with `CONTACT_NOT_FOUND`.
  - `fetchContactHistory(id: number)` — `GET /contacts/<id>/history/`; a 404 rejects with `CONTACT_NOT_FOUND`.
  - `CONTACT_NOT_FOUND: string`.

The old stats and interactions thunks stay until Task 9 removes their only callers; this task only adds. Two existing tests need their fixtures kept in step: the Navbar test's preloaded `customers` state lists every field, and the old Details page's 404 test now sees the new message.

- [ ] **Step 1: Write the failing tests**

**Create** `src/features/contacts/contactsState.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer, {
  CONTACT_NOT_FOUND,
  fetchAllContacts,
  fetchContactById,
  fetchContactHistory,
  loadMoreContacts,
} from '../customers/customersSlice';
import { LUKAS, LUKAS_HISTORY, stubContactsApi } from './testContacts';

const makeStore = () => configureStore({ reducer: { customers: customersReducer } });

describe('the Contacts page state (spec 2026-09-28 §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the summary over the whole filtered set', async () => {
    stubContactsApi();
    const store = makeStore();
    await store.dispatch(fetchAllContacts('/contacts/?customer=7'));
    const state = store.getState().customers;
    expect(state.allContacts.map((c) => c.name)).toEqual(['Mira Patel', 'Owen Price']);
    expect(state.allContactsSummary).toEqual({ total: 2, positive: 1, neutral: 0, negative: 1, decision_makers: 1 });
  });

  it('never lets a slower, earlier read land over a newer one', async () => {
    let release: (value: unknown) => void = () => {};
    const slow = new Promise((resolve) => (release = resolve));
    const spy = stubContactsApi();
    const fast = spy.getMockImplementation()!;
    spy.mockImplementationOnce(async (...args) => {
      await slow;
      return fast(...args);
    });
    const store = makeStore();
    const first = store.dispatch(fetchAllContacts('/contacts/'));
    await store.dispatch(fetchAllContacts('/contacts/?sentiment=negative'));
    release(null);
    await first;
    expect(store.getState().customers.allContacts.map((c) => c.name)).toEqual(['Owen Price']);
  });

  it('appends the next page, and drops one that no longer continues the list', async () => {
    stubContactsApi({ pageSize: 2 });
    const store = makeStore();
    await store.dispatch(fetchAllContacts('/contacts/'));
    const next = store.getState().customers.allContactsNext!;
    expect(next).toContain('page=2');
    await store.dispatch(loadMoreContacts(next));
    expect(store.getState().customers.allContacts).toHaveLength(3);
    expect(store.getState().customers.allContactsNext).toBeNull();

    await store.dispatch(fetchAllContacts('/contacts/'));
    await store.dispatch(fetchAllContacts('/contacts/?role=other'));
    await store.dispatch(loadMoreContacts(next));
    expect(store.getState().customers.allContacts).toEqual([]);
  });

  it('reads a person and their history; a 404 says they cannot be opened', async () => {
    stubContactsApi();
    const store = makeStore();
    await store.dispatch(fetchContactById(41));
    await store.dispatch(fetchContactHistory(41));
    expect(store.getState().customers.selectedContact).toEqual(LUKAS);
    expect(store.getState().customers.selectedContactHistory).toEqual(LUKAS_HISTORY);

    await store.dispatch(fetchContactById(999));
    await store.dispatch(fetchContactHistory(999));
    expect(store.getState().customers.selectedContactError).toBe(CONTACT_NOT_FOUND);
    expect(store.getState().customers.selectedContactHistoryError).toBe(CONTACT_NOT_FOUND);
    expect(store.getState().customers.selectedContactHistory).toBeNull();
  });
});
```

**Find** in `src/components/layout/Navbar.test.tsx`:

```tsx
        allContactsError: null,
```

**Replace with:**

```tsx
        allContactsError: null,
        allContactsSummary: null,
        allContactsLoadingMore: false,
        allContactsMoreError: null,
```

**Find** in `src/components/layout/Navbar.test.tsx`:

```tsx
        selectedContactInteractionsLoading: false,
```

**Replace with:**

```tsx
        selectedContactInteractionsLoading: false,
        selectedContactHistory: null,
        selectedContactHistoryLoading: false,
        selectedContactHistoryError: null,
```

**Find** in `src/pages/contacts/Details.test.tsx`:

```tsx
    expect(await screen.findByText('Not found.')).toBeInTheDocument();
```

**Replace with:**

```tsx
    // A 404 now reads as "not here, or not yours to open" (CONTACT_NOT_FOUND).
    expect(await screen.findByText(/This person is not here/)).toBeInTheDocument();
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/contacts src/features/customers src/pages/contacts src/components/layout --maxWorkers=2`
Expected: FAIL — `contactsState.test.ts`: `loadMoreContacts`, `fetchContactHistory` and `CONTACT_NOT_FOUND` are not exported (`is not a function` / `undefined`); `Details.test.tsx`'s 404 case cannot find "This person is not here".

- [ ] **Step 3: Implement**

**Find** in `src/features/customers/customersSlice.ts`:

```ts
import type { User, CurrencyCode } from '../auth/authSlice';
```

**Replace with:**

```ts
import type { User, CurrencyCode } from '../auth/authSlice';
import type { ContactHistory, ContactsPage, ContactsSummary } from '../contacts/contactsTypes';
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  allContactsError: string | null;
```

**Replace with:**

```ts
  allContactsError: string | null;
  /** Over the whole filtered set; null until a read lands. */
  allContactsSummary: ContactsSummary | null;
  /** The last list read asked for: a slower, earlier one never lands. */
  allContactsRequestId?: string;
  allContactsLoadingMore: boolean;
  allContactsMoreError: string | null;
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  selectedContactInteractionsLoading: boolean;
```

**Replace with:**

```ts
  selectedContactInteractionsLoading: boolean;
  selectedContactRequestId?: string;
  /** Their calls, emails and tickets (GET /contacts/<id>/history/). */
  selectedContactHistory: ContactHistory | null;
  selectedContactHistoryLoading: boolean;
  selectedContactHistoryError: string | null;
  selectedContactHistoryRequestId?: string;
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  allContactsError: null,
```

**Replace with:**

```ts
  allContactsError: null,
  allContactsSummary: null,
  allContactsLoadingMore: false,
  allContactsMoreError: null,
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  selectedContactInteractionsLoading: false,
```

**Replace with:**

```ts
  selectedContactInteractionsLoading: false,
  selectedContactHistory: null,
  selectedContactHistoryLoading: false,
  selectedContactHistoryError: null,
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
interface ContactsPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Contact[];
}

// Powers the standalone /contacts/list page — spans every Customer/
// Account the tenant owns, unlike the two entity-scoped thunks above.
// Same "raw path in, paginated page out" shape as fetchCustomers: pass
// a full `/contacts/?search=...&company=...` path for a fresh
// filtered fetch, or one of the response's own next/previous links to
// page through it, same reasoning as fetchCustomers's own docstring.
export const fetchAllContacts
```

**Replace with:**

```ts
// Powers the Contacts page (/contacts) — spans every Customer/Account the
// viewer may open, unlike the two entity-scoped thunks above. Pass a full
// `/contacts/?search=...&customer=...` path (contactsApiPath) for a fresh
// filtered read; loadMoreContacts appends the response's `next` page.
export const fetchAllContacts
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
export const fetchContactById = createAsyncThunk<Contact, number, { rejectValue: string }>(
  'customers/fetchContactById',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<Contact>(`/contacts/${id}/`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load this contact.';
      return rejectWithValue(message);
    }
  }
);
```

**Replace with:**

```ts
/** The next page of the Contacts list (a response's own `next` link), appended. */
export const loadMoreContacts = createAsyncThunk<ContactsPage, string, { rejectValue: string }>(
  'customers/loadMoreContacts',
  async (next, { rejectWithValue }) => {
    try {
      return await apiFetch<ContactsPage>(next);
    } catch (err) {
      return rejectWithValue(err instanceof ApiError ? err.message : 'Could not load more people.');
    }
  }
);

/** What a 404 on a person means: they are gone, or on an account this
 *  viewer cannot open (the backend answers both the same way). */
export const CONTACT_NOT_FOUND = 'This person is not here. They may have been deleted, or they are on an account you cannot open.';

function contactReadError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 404) return CONTACT_NOT_FOUND;
  return err instanceof ApiError ? err.message : fallback;
}

// Powers the Contacts page's profile (/contacts/:id).
export const fetchContactById = createAsyncThunk<Contact, number, { rejectValue: string }>(
  'customers/fetchContactById',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<Contact>(`/contacts/${id}/`);
    } catch (err) {
      return rejectWithValue(contactReadError(err, 'Could not load this contact.'));
    }
  }
);

/** A person's calls, emails and tickets, each under its own record rule. */
export const fetchContactHistory = createAsyncThunk<ContactHistory, number, { rejectValue: string }>(
  'customers/fetchContactHistory',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<ContactHistory>(`/contacts/${id}/history/`);
    } catch (err) {
      return rejectWithValue(contactReadError(err, 'Could not load their calls, emails and tickets.'));
    }
  }
);
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
      .addCase(fetchAllContacts.pending, (state) => {
        state.allContactsLoading = true;
        state.allContactsError = null;
      })
      .addCase(fetchAllContacts.fulfilled, (state, action) => {
        state.allContactsLoading = false;
        state.allContacts = action.payload.results;
        state.allContactsCount = action.payload.count;
        state.allContactsNext = action.payload.next;
        state.allContactsPrevious = action.payload.previous;
      })
      .addCase(fetchAllContacts.rejected, (state, action) => {
        state.allContactsLoading = false;
        state.allContactsError = action.payload ?? 'Something went wrong.';
      })
```

**Replace with:**

```ts
      .addCase(fetchAllContacts.pending, (state, action) => {
        state.allContactsRequestId = action.meta.requestId;
        state.allContactsLoading = true;
        state.allContactsError = null;
        state.allContactsLoadingMore = false;
        state.allContactsMoreError = null;
      })
      .addCase(fetchAllContacts.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.allContactsRequestId) return;
        state.allContactsLoading = false;
        state.allContacts = action.payload.results;
        state.allContactsCount = action.payload.count;
        state.allContactsNext = action.payload.next;
        state.allContactsPrevious = action.payload.previous;
        state.allContactsSummary = action.payload.summary ?? null;
      })
      .addCase(fetchAllContacts.rejected, (state, action) => {
        if (action.meta.requestId !== state.allContactsRequestId) return;
        state.allContactsLoading = false;
        state.allContactsError = action.payload ?? 'Something went wrong.';
      })
      .addCase(loadMoreContacts.pending, (state) => {
        state.allContactsLoadingMore = true;
        state.allContactsMoreError = null;
      })
      // A page lands only on the list it continues: not while a fresh read
      // is on its way, and not after one replaced the list.
      .addCase(loadMoreContacts.fulfilled, (state, action) => {
        if (state.allContactsLoading || state.allContactsNext !== action.meta.arg) return;
        state.allContactsLoadingMore = false;
        const seen = new Set(state.allContacts.map((c) => c.id));
        state.allContacts.push(...action.payload.results.filter((c) => !seen.has(c.id)));
        state.allContactsCount = action.payload.count;
        state.allContactsNext = action.payload.next;
      })
      .addCase(loadMoreContacts.rejected, (state, action) => {
        if (state.allContactsNext !== action.meta.arg) return;
        state.allContactsLoadingMore = false;
        state.allContactsMoreError = action.payload ?? 'Could not load more people.';
      })
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
      .addCase(fetchContactById.pending, (state) => {
        state.selectedContactLoading = true;
        state.selectedContactError = null;
        // Cleared, not left stale — same reasoning as fetchCustomerById.
        state.selectedContact = null;
      })
      .addCase(fetchContactById.fulfilled, (state, action) => {
        state.selectedContactLoading = false;
        state.selectedContact = action.payload;
      })
      .addCase(fetchContactById.rejected, (state, action) => {
        state.selectedContactLoading = false;
        state.selectedContactError = action.payload ?? 'Could not load this contact.';
      })
```

**Replace with:**

```ts
      .addCase(fetchContactById.pending, (state, action) => {
        state.selectedContactRequestId = action.meta.requestId;
        state.selectedContactLoading = true;
        state.selectedContactError = null;
        // Cleared, not left stale — same reasoning as fetchCustomerById.
        state.selectedContact = null;
      })
      .addCase(fetchContactById.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.selectedContactRequestId) return;
        state.selectedContactLoading = false;
        state.selectedContact = action.payload;
      })
      .addCase(fetchContactById.rejected, (state, action) => {
        if (action.meta.requestId !== state.selectedContactRequestId) return;
        state.selectedContactLoading = false;
        state.selectedContactError = action.payload ?? 'Could not load this contact.';
      })
      .addCase(fetchContactHistory.pending, (state, action) => {
        state.selectedContactHistoryRequestId = action.meta.requestId;
        state.selectedContactHistoryLoading = true;
        state.selectedContactHistoryError = null;
        state.selectedContactHistory = null;
      })
      .addCase(fetchContactHistory.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.selectedContactHistoryRequestId) return;
        state.selectedContactHistoryLoading = false;
        state.selectedContactHistory = action.payload;
      })
      .addCase(fetchContactHistory.rejected, (state, action) => {
        if (action.meta.requestId !== state.selectedContactHistoryRequestId) return;
        state.selectedContactHistoryLoading = false;
        state.selectedContactHistoryError = action.payload ?? 'Could not load their calls, emails and tickets.';
      })
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/features/contacts src/features/customers src/pages/contacts src/components/layout --maxWorkers=2`
Expected: PASS — `contactsState.test.ts` 4 tests, and the existing `customersSlice`, `pages/contacts` and `components/layout` suites.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Navbar.test.tsx src/features/contacts/contactsState.test.ts src/features/customers/customersSlice.ts src/pages/contacts/Details.test.tsx
git commit -m "feat(contacts): list summary, load more, stale-read guards and a person's history in the store" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The organisation page: a person's name opens their profile; calls say "Not enough to analyse"

**Files:**
- Modify: `src/features/calls/callsSlice.ts`
- Modify: `src/components/organizations/detail/CallItem.tsx`
- Modify: `src/components/organizations/detail/PersonItem.tsx`
- Test: `src/components/organizations/detail/PersonItem.test.tsx`
- Test: `src/components/organizations/detail/CallItem.test.tsx`

**Interfaces:**
- Consumes: `readingOf` (Task 1), `Analysis` (Task 1), `TITLE_BUTTON` (`detail/listStyles.ts`).
- Produces: `Call.analysis?: Analysis` (`features/calls/callsSlice.ts`); `PersonItem`'s name is a `<Link to="/contacts/:id">` inside its `h3`; `CallItem` shows `readingOf(call)` in place of its own sentiment map.

Spec §5. `PersonItem` now renders a router `Link`, so its unit test renders inside a `MemoryRouter` (the People tab and the organisation page already render inside one). One existing assertion changes: a person with no email or phone now has exactly one link, their name.

- [ ] **Step 1: Write the failing tests**

**Find** in `src/components/organizations/detail/PersonItem.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event';
```

**Replace with:**

```tsx
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
```

**Find** in `src/components/organizations/detail/PersonItem.test.tsx`:

```tsx
  render(
    <ul>
      <PersonItem contact={{ ...CONTACTS[index], ...extra }} isSm={isSm} {...handlers} />
    </ul>,
  );
```

**Replace with:**

```tsx
  render(
    <MemoryRouter>
      <ul>
        <PersonItem contact={{ ...CONTACTS[index], ...extra }} isSm={isSm} {...handlers} />
      </ul>
    </MemoryRouter>,
  );
```

**Find** in `src/components/organizations/detail/PersonItem.test.tsx`:

```tsx
  it('tags a person on the organization itself
```

**Replace with:**

```tsx
  it('the name opens their profile on the Contacts page (spec 2026-09-28 §5)', () => {
    renderItem(0);
    const name = within(screen.getByRole('heading', { name: 'Dana Buyer' })).getByRole('link', { name: 'Dana Buyer' });
    expect(name).toHaveAttribute('href', '/contacts/51');
    expect(name).toHaveClass('min-h-11', 'sm:min-h-0');
  });

  it('tags a person on the organization itself
```

**Find** in `src/components/organizations/detail/PersonItem.test.tsx`:

```tsx
    expect(within(item).queryByRole('link')).not.toBeInTheDocument();
```

**Replace with:**

```tsx
    // No email or phone to link: the only link is their name.
    expect(within(item).getAllByRole('link').map((link) => link.textContent)).toEqual(['Pat Finance']);
```

**Find** in `src/components/organizations/detail/CallItem.test.tsx`:

```tsx
  it('opens the whole summary in place from its title',
```

**Replace with:**

```tsx
  it('says "Not enough to analyse" for a call with nothing to read, and nothing while one waits (spec 2026-09-28 §5)', () => {
    const empty = renderItem({ ...CALLS[1], analysis: 'not_analysable', sentiment: '' });
    expect(within(empty).getByText('Not enough to analyse')).toHaveClass('bg-subtle', 'text-ink-muted');
    document.body.innerHTML = '';
    // A pending call still carries the model's default "neutral": not a reading.
    const pending = renderItem({ ...CALLS[1], analysis: 'pending', sentiment: 'neutral' });
    for (const text of ['Neutral', 'Positive', 'Not enough to analyse']) expect(within(pending).queryByText(text)).toBeNull();
    document.body.innerHTML = '';
    expect(within(renderItem({ ...CALLS[1], analysis: 'analysed' })).getByText('Positive')).toHaveClass('bg-success-dim');
  });

  it('opens the whole summary in place from its title',
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations src/pages/organizations src/e2e/organizationDetail.test.tsx --maxWorkers=2`
Expected: FAIL — `PersonItem.test.tsx`: no link named "Dana Buyer"; `CallItem.test.tsx`: "Not enough to analyse" not found, and the pending call still shows "Neutral". (`analysis` is also not yet on `Call`, which `tsc -b` would report.)

- [ ] **Step 3: Implement**

**Find** in `src/features/calls/callsSlice.ts`:

```ts
import type { Attachment, FileParent } from '../files/filesSlice';
```

**Replace with:**

```ts
import type { Analysis } from '../contacts/contactsTypes';
import type { Attachment, FileParent } from '../files/filesSlice';
```

**Find** in `src/features/calls/callsSlice.ts`:

```ts
  summary: string;
  sentiment: Sentiment;
  ai_area: string;
```

**Replace with:**

```ts
  summary: string;
  sentiment: Sentiment;
  /** Whether the call has been read (spec 2026-09-28 §1): `sentiment` is a
   *  reading only when this is `analysed`. Optional: older fixtures have none. */
  analysis?: Analysis;
  ai_area: string;
```

**Find** in `src/components/organizations/detail/CallItem.tsx`:

```tsx
import type { Call } from '../../../features/calls/callsSlice';
```

**Replace with:**

```tsx
import type { Call } from '../../../features/calls/callsSlice';
import { readingOf } from '../../../features/contacts/contactsFormat';
```

**Find** in `src/components/organizations/detail/CallItem.tsx`:

```tsx
const SENTIMENT: Record<Exclude<Call['sentiment'], ''>, { label: string; tone: string }> = {
  positive: { label: 'Positive', tone: 'bg-success-dim text-success' },
  neutral: { label: 'Neutral', tone: 'bg-subtle text-ink-muted' },
  negative: { label: 'Negative', tone: 'bg-danger-dim text-danger' },
};
```

**Replace with:** nothing (delete it).

**Find** in `src/components/organizations/detail/CallItem.tsx`:

```tsx
 *  and time, a one-line summary its title opens in place, then the account
 *  tag, host, duration, where it came from (a recorder, or who logged it),
 *  sentiment and the AI's classification,
```

**Replace with:**

```tsx
 *  and time, a one-line summary its title opens in place, then the account
 *  tag, host, duration, where it came from (a recorder, or who logged it),
 *  sentiment or "Not enough to analyse" (nothing while it waits to be read,
 *  spec 2026-09-28 §5) and the AI's classification,
```

**Find** in `src/components/organizations/detail/CallItem.tsx`:

```tsx
  const sentiment = call.sentiment ? SENTIMENT[call.sentiment] : null;
```

**Replace with:**

```tsx
  const sentiment = readingOf(call);
```

**Find** in `src/components/organizations/detail/PersonItem.tsx`:

```tsx
import { Ellipsis, Mail, Phone } from 'lucide-react';
```

**Replace with:**

```tsx
import { Ellipsis, Mail, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
```

**Find** in `src/components/organizations/detail/PersonItem.tsx`:

```tsx
import { ITEM_LINK, META, ROW_ACTION, ROW_ICON } from './listStyles';
```

**Replace with:**

```tsx
import { ITEM_LINK, META, ROW_ACTION, ROW_ICON, TITLE_BUTTON } from './listStyles';
```

**Find** in `src/components/organizations/detail/PersonItem.tsx`:

```tsx
 *  contacted; ⋯ edits or deletes through the existing flows. Phones put the
 *  links on their own line, as 44px targets. */
```

**Replace with:**

```tsx
 *  contacted; ⋯ edits or deletes through the existing flows. Phones put the
 *  links on their own line, as 44px targets. The name opens their profile
 *  on the Contacts page (spec 2026-09-28 §5). */
```

**Find** in `src/components/organizations/detail/PersonItem.tsx`:

```tsx
          <h3 className="min-w-0 truncate text-[13px] font-semibold text-ink">{contact.name}</h3>
```

**Replace with:**

```tsx
          <h3 className="min-w-0 truncate text-[13px] font-semibold text-ink">
            <Link to={`/contacts/${contact.id}`} className={TITLE_BUTTON}>
              {contact.name}
            </Link>
          </h3>
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/components/organizations src/pages/organizations src/e2e/organizationDetail.test.tsx --maxWorkers=2`
Expected: PASS — every organisation page suite, including the People tab, the Files tab's calls and `e2e/organizationDetail.test.tsx`.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/CallItem.test.tsx src/components/organizations/detail/CallItem.tsx src/components/organizations/detail/PersonItem.test.tsx src/components/organizations/detail/PersonItem.tsx src/features/calls/callsSlice.ts
git commit -m "feat(organizations): people open their contact profile; calls say when there is not enough to analyse" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: One person as a list item, and the list with its states

**Files:**
- Create: `src/components/contacts/ContactListItem.tsx`
- Test: `src/components/contacts/ContactListItem.test.tsx`
- Create: `src/components/contacts/ContactList.tsx`
- Test: `src/components/contacts/ContactList.test.tsx`

**Interfaces:**
- Consumes: `placeOf`, `placeLabel`, `callsLabel`, `SENTIMENT_LABEL`, `SENTIMENT_TEXT`, `SENTIMENT_DOT` (Task 1); `ListSkeleton`, `LIST`, `META`, `ROW_ICON`, `EmptyState`, `ErrorBlock`, `MoreButton`, `QUIET`, `FOCUS`; `PEOPLE`, `LUKAS`, `MIRA`, `OWEN` (Task 1).
- Produces:
  - `ContactListItem({contact: Contact; to: To; selected: boolean})` — an `li` whose whole body is one `Link` (`aria-current="page"` when selected), `data-contact={id}`.
  - `ContactList({rows, count, loading, error, filtered, next, loadingMore, moreError, selectedId, linkFor: (id) => To, onRetry, onClear, onMore})` — `ul` named "People"; skeleton `status` "Loading people"; `ErrorBlock` with Try again; empty "No people yet" or "Nobody matches" with Clear filters; `MoreButton` "Load more (n of count)".

- [ ] **Step 1: Write the failing tests**

**Create** `src/components/contacts/ContactListItem.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Contact } from '../../features/customers/customersSlice';
import { LUKAS, MIRA, OWEN } from '../../features/contacts/testContacts';
import { ContactListItem } from './ContactListItem';

function renderItem(contact: Contact, selected = false) {
  render(
    <MemoryRouter>
      <ul>
        <ContactListItem contact={contact} to={{ pathname: `/contacts/${contact.id}`, search: '?role=champion' }} selected={selected} />
      </ul>
    </MemoryRouter>,
  );
  return screen.getByRole('listitem');
}

describe('ContactListItem (spec 2026-09-28 §3)', () => {
  it('shows initials, name and role, organisation › account, sentiment with n calls, and last contact', () => {
    const item = renderItem(LUKAS);
    expect(within(item).getByText('LV')).toHaveClass('font-mono-brand');
    for (const text of ['Lukas Vermeer', 'Champion', 'Kraft Heinz › Kraft Heinz EMEA', '6 calls']) {
      expect(within(item).getByText(text)).toBeInTheDocument();
    }
    expect(within(item).getByText('Neutral')).toHaveClass('text-ink-muted');
    expect(within(item).getByText(/^Contacted .+ ago$/)).toBeInTheDocument();
  });

  it('names the organisation alone when they are on it, says where a hand-set sentiment came from, and when nobody has been in touch', () => {
    const mira = renderItem(MIRA);
    expect(within(mira).getByText('Pizza Hut')).toBeInTheDocument();
    expect(within(mira).getByText('Positive')).toHaveClass('text-success');
    expect(within(mira).getByText('set by hand')).toBeInTheDocument();
    expect(within(mira).getByText('Not contacted yet')).toBeInTheDocument();
    document.body.innerHTML = '';
    expect(within(renderItem(OWEN)).getByText('Negative')).toHaveClass('text-danger');
  });

  it('opens their profile, keeping the filters, and marks the one open', () => {
    const item = renderItem(LUKAS, true);
    const link = within(item).getByRole('link');
    expect(link).toHaveAttribute('href', '/contacts/41?role=champion');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('min-h-11', 'bg-subtle');
    document.body.innerHTML = '';
    expect(within(renderItem(LUKAS)).getByRole('link')).not.toHaveAttribute('aria-current');
  });
});
```

**Create** `src/components/contacts/ContactList.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PEOPLE } from '../../features/contacts/testContacts';
import { ContactList } from './ContactList';

function renderList(props: Partial<Parameters<typeof ContactList>[0]> = {}) {
  const handlers = { onRetry: vi.fn(), onClear: vi.fn(), onMore: vi.fn() };
  render(
    <MemoryRouter>
      <ContactList
        rows={PEOPLE}
        count={5}
        loading={false}
        error={null}
        filtered={false}
        next={null}
        loadingMore={false}
        moreError={null}
        selectedId={42}
        linkFor={(id) => `/contacts/${id}`}
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  );
  return handlers;
}

describe('ContactList (spec 2026-09-28 §3)', () => {
  it('lists one item per person, the open one marked', () => {
    renderList();
    const items = within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[1]).getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('loads more at the end', async () => {
    const { onMore } = renderList({ next: 'http://x/api/v1/contacts/?page=2' });
    await userEvent.click(screen.getByRole('button', { name: 'Load more (3 of 5)' }));
    expect(onMore).toHaveBeenCalledOnce();
  });

  it('shows a skeleton while loading, not a spinner', () => {
    renderList({ loading: true });
    expect(screen.getByRole('status', { name: 'Loading people' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'People' })).toBeNull();
  });

  it('shows an error with Try again', async () => {
    const { onRetry } = renderList({ error: 'Try later.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('empty: says how people arrive, or offers to clear the filters', async () => {
    renderList({ rows: [], count: 0 });
    expect(screen.getByText('No people yet')).toBeInTheDocument();
    document.body.innerHTML = '';
    const { onClear } = renderList({ rows: [], count: 0, filtered: true });
    expect(screen.getByText('Nobody matches')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/contacts/ContactListItem.test.tsx src/components/contacts/ContactList.test.tsx --maxWorkers=2`
Expected: FAIL — `Failed to resolve import "./ContactListItem"` and `"./ContactList"`.

- [ ] **Step 3: Implement**

**Create** `src/components/contacts/ContactListItem.tsx`:

```tsx
import { Link, type To } from 'react-router-dom';
import {
  SENTIMENT_DOT,
  SENTIMENT_LABEL,
  SENTIMENT_TEXT,
  callsLabel,
  placeLabel,
  placeOf,
} from '../../features/contacts/contactsFormat';
import type { Contact } from '../../features/customers/customersSlice';
import { formatRelativeTime, initials } from '../../features/customers/formatters';
import { META, ROW_ICON } from '../organizations/detail/listStyles';
import { FOCUS } from '../organizations/portfolio/styles';

/** One person in the Contacts list (spec 2026-09-28 §3), never a table row:
 *  initials, name and role, "Organisation › Account", sentiment in words
 *  and its colour with "n calls" beside it, and when they were last
 *  contacted. The whole item opens their profile. */
export function ContactListItem({ contact, to, selected }: { contact: Contact; to: To; selected: boolean }) {
  const place = placeLabel(placeOf(contact));
  const contacted = contact.last_contacted_at ? `Contacted ${formatRelativeTime(contact.last_contacted_at)}` : 'Not contacted yet';
  return (
    <li data-contact={contact.id}>
      <Link
        to={to}
        aria-current={selected ? 'page' : undefined}
        className={`flex min-h-11 gap-3 px-3 py-2.5 hover:bg-subtle active:bg-line-subtle ${selected ? 'bg-subtle' : ''} ${FOCUS}`}
      >
        <span aria-hidden="true" className={`${ROW_ICON} font-mono-brand text-[11px] font-semibold text-ink`}>
          {initials(contact.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{contact.name}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{contact.role_display}</span>
          </span>
          {place ? <span className="block truncate text-[11px] text-ink-muted">{place}</span> : null}
          <span className={META}>
            <span data-sentiment={contact.sentiment} className={`inline-flex items-center gap-1 font-semibold ${SENTIMENT_TEXT[contact.sentiment]}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SENTIMENT_DOT[contact.sentiment]}`} />
              {SENTIMENT_LABEL[contact.sentiment]}
            </span>
            <span className="font-mono-brand tabular-nums">{callsLabel(contact)}</span>
            <span>{contacted}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}
```

**Create** `src/components/contacts/ContactList.tsx`:

```tsx
import type { To } from 'react-router-dom';
import type { Contact } from '../../features/customers/customersSlice';
import { ListSkeleton } from '../organizations/detail/ListParts';
import { LIST } from '../organizations/detail/listStyles';
import { EmptyState, ErrorBlock, MoreButton } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';
import { ContactListItem } from './ContactListItem';

/** The Contacts list (spec 2026-09-28 §3): an item per person, "Load more"
 *  at the end, and designed loading, error and empty states. */
export function ContactList({
  rows,
  count,
  loading,
  error,
  filtered,
  next,
  loadingMore,
  moreError,
  selectedId,
  linkFor,
  onRetry,
  onClear,
  onMore,
}: {
  rows: Contact[];
  count: number;
  loading: boolean;
  error: string | null;
  /** Whether a search or filter narrows the list (the empty state offers to clear them). */
  filtered: boolean;
  next: string | null;
  loadingMore: boolean;
  moreError: string | null;
  selectedId: number | null;
  linkFor: (id: number) => To;
  onRetry: () => void;
  onClear: () => void;
  onMore: () => void;
}) {
  if (error) return <ErrorBlock message={error} onRetry={onRetry} />;
  if (loading) return <ListSkeleton label="Loading people" rows={6} />;
  if (rows.length === 0) {
    return filtered ? (
      <EmptyState
        title="Nobody matches"
        detail="Try another word or filter, or clear them."
        action={
          <button type="button" onClick={onClear} className={`${QUIET} border border-line`}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState
        title="No people yet"
        detail="People appear here when they are added to an organisation or an account."
        action={null}
      />
    );
  }
  return (
    <div>
      <ul aria-label="People" className={LIST}>
        {rows.map((contact) => (
          <ContactListItem key={contact.id} contact={contact} to={linkFor(contact.id)} selected={contact.id === selectedId} />
        ))}
      </ul>
      <MoreButton next={next} loading={loadingMore} error={moreError} label={`Load more (${rows.length} of ${count})`} onClick={onMore} />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/components/contacts/ContactListItem.test.tsx src/components/contacts/ContactList.test.tsx --maxWorkers=2`
Expected: PASS — `ContactListItem` 3 tests, `ContactList` 5 tests.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactList.test.tsx src/components/contacts/ContactList.tsx src/components/contacts/ContactListItem.test.tsx src/components/contacts/ContactListItem.tsx
git commit -m "feat(contacts): a person as a list item, and the list with its states" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The header: summary line, search, the four filters and + Add

**Files:**
- Create: `src/components/contacts/ContactsToolbar.tsx`
- Test: `src/components/contacts/ContactsToolbar.test.tsx`

**Interfaces:**
- Consumes: `contactsSummaryParts` (Task 1), `CONTACT_ROLES`, `SENTIMENTS`, `withFilter`, `ContactsParams`, `NO_FILTERS` (Task 1); `ListSearch`, `SummaryLine`, `FOCUS`, `PRIMARY`; `apiFetch`; `stubContactsApi`, `CUSTOMERS` (Task 1).
- Produces: `ContactsToolbar({params, summary: ContactsSummary | null, organisations: {id, name}[], organisationName: string | null, isSm: boolean, onChange: (next: ContactsParams, replace?: boolean) => void, onAdd: () => void})`. Labelled controls: "Search people", "Organisation", "Account", "Sentiment", "Role"; the button "Add".

Every control writes through `onChange`, which the page turns into the URL (Task 8). The search box keeps its own text and writes after 300 ms, with `replace` set; when the URL's `q` changes from outside (Clear filters, Back) the box follows it. The account select is disabled until an organisation is chosen and lists that organisation's accounts; a chosen organisation or account missing from its list still shows as an option.

- [ ] **Step 1: Write the failing tests**

**Create** `src/components/contacts/ContactsToolbar.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NO_FILTERS, type ContactsParams } from '../../features/contacts/contactsParams';
import { CUSTOMERS, stubContactsApi } from '../../features/contacts/testContacts';
import { ContactsToolbar } from './ContactsToolbar';

const SUMMARY = { total: 142, positive: 87, neutral: 43, negative: 12, decision_makers: 38 };

function renderToolbar(params: ContactsParams = NO_FILTERS, extra: Partial<Parameters<typeof ContactsToolbar>[0]> = {}) {
  const handlers = { onChange: vi.fn(), onAdd: vi.fn() };
  const view = render(
    <ContactsToolbar params={params} summary={SUMMARY} organisations={CUSTOMERS} organisationName={null} isSm {...handlers} {...extra} />,
  );
  return { ...handlers, view };
}

describe('ContactsToolbar (spec 2026-09-28 §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leads with the summary line', () => {
    stubContactsApi();
    renderToolbar();
    expect(document.querySelector('[data-summary]')).toHaveTextContent('142 people · 38 decision makers · 61% positive · 12 negative');
  });

  it('an organisation filters and clears the account; the account waits for an organisation', async () => {
    stubContactsApi();
    const { onChange } = renderToolbar({ ...NO_FILTERS, sentiment: 'negative' });
    expect(screen.getByLabelText('Account')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Organisation'), 'Kraft Heinz');
    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, sentiment: 'negative', customer: '6' });
  });

  it("offers the chosen organisation's accounts", async () => {
    stubContactsApi();
    const { onChange } = renderToolbar({ ...NO_FILTERS, customer: '6' });
    const account = screen.getByLabelText('Account');
    expect(account).toBeEnabled();
    await within(account).findByRole('option', { name: 'Kraft Heinz EMEA' });
    await userEvent.selectOptions(account, 'Kraft Heinz EMEA');
    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, customer: '6', account: '31' });
  });

  it('keeps a chosen organisation that is not on the first page', () => {
    stubContactsApi();
    renderToolbar({ ...NO_FILTERS, customer: '99' }, { organisationName: 'Globex' });
    expect(screen.getByLabelText('Organisation')).toHaveDisplayValue('Globex');
  });

  it('filters by sentiment and role', async () => {
    stubContactsApi();
    const { onChange } = renderToolbar();
    await userEvent.selectOptions(screen.getByLabelText('Sentiment'), 'Negative');
    expect(onChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, sentiment: 'negative' });
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'Champion');
    expect(onChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, role: 'champion' });
  });

  it('searches once typing stops, replacing the history entry', async () => {
    stubContactsApi();
    const { onChange } = renderToolbar();
    await userEvent.type(screen.getByLabelText('Search people'), 'luk');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, q: 'luk' }, true));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('the search box follows the URL', () => {
    stubContactsApi();
    const { view, onChange, onAdd } = renderToolbar({ ...NO_FILTERS, q: 'luk' });
    view.rerender(
      <ContactsToolbar params={NO_FILTERS} summary={SUMMARY} organisations={CUSTOMERS} organisationName={null} isSm onChange={onChange} onAdd={onAdd} />,
    );
    expect(screen.getByLabelText('Search people')).toHaveValue('');
  });

  it('+ Add opens the form; every control is a 44px target on phones', async () => {
    stubContactsApi();
    const { onAdd } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledOnce();
    for (const name of ['Organisation', 'Account', 'Sentiment', 'Role']) expect(screen.getByLabelText(name)).toHaveClass('min-h-11', 'sm:min-h-9');
    expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('min-h-11');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/contacts/ContactsToolbar.test.tsx --maxWorkers=2`
Expected: FAIL — `Failed to resolve import "./ContactsToolbar"`.

- [ ] **Step 3: Implement**

**Create** `src/components/contacts/ContactsToolbar.tsx`:

```tsx
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { contactsSummaryParts } from '../../features/contacts/contactsFormat';
import { CONTACT_ROLES, SENTIMENTS, withFilter, type ContactsParams } from '../../features/contacts/contactsParams';
import type { ContactsSummary } from '../../features/contacts/contactsTypes';
import { apiFetch } from '../../lib/apiClient';
import { ListSearch, SummaryLine } from '../organizations/detail/ListParts';
import { FOCUS, PRIMARY } from '../organizations/portfolio/styles';

type Option = { id: number; name: string };

const SELECT = `min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-2 text-[15px] text-ink disabled:opacity-50 sm:min-h-9 sm:w-auto sm:max-w-[12rem] sm:text-[13px] ${FOCUS}`;

function Select({
  label,
  value,
  disabled = false,
  onChange,
  children,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={SELECT}>
        {children}
      </select>
    </div>
  );
}

/** The accounts of the chosen organisation, read when it changes. A failed
 *  read leaves only "All accounts". */
function useAccounts(customer: string): Option[] {
  const [loaded, setLoaded] = useState<{ for: string; rows: Option[] }>({ for: '', rows: [] });
  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    apiFetch<Option[]>(`/customers/${customer}/accounts/`)
      .then((rows) => {
        if (!cancelled) setLoaded({ for: customer, rows: Array.isArray(rows) ? rows : [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ for: customer, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);
  return loaded.for === customer ? loaded.rows : [];
}

/** The Contacts page's header (spec 2026-09-28 §3): the summary line, then
 *  search, the organisation, account, sentiment and role filters, and
 *  "+ Add". Every control writes the URL through `onChange`; the search
 *  waits 300 ms after the last key. */
export function ContactsToolbar({
  params,
  summary,
  organisations,
  organisationName,
  isSm,
  onChange,
  onAdd,
}: {
  params: ContactsParams;
  summary: ContactsSummary | null;
  /** The first page of /customers/ (fetchCustomers). */
  organisations: Option[];
  /** The chosen organisation's name when it is not on that page. */
  organisationName: string | null;
  isSm: boolean;
  /** `replace` for typing, so every key is not a history entry. */
  onChange: (next: ContactsParams, replace?: boolean) => void;
  onAdd: () => void;
}) {
  const [text, setText] = useState(params.q);
  const [lastQ, setLastQ] = useState(params.q);
  // The URL moved (Clear filters, Back): the box follows it.
  if (params.q !== lastQ) {
    setLastQ(params.q);
    setText(params.q);
  }
  useEffect(() => {
    if (text === params.q) return;
    const timer = setTimeout(() => onChange(withFilter(params, 'q', text), true), 300);
    return () => clearTimeout(timer);
  }, [text, params, onChange]);

  const accounts = useAccounts(params.customer);
  const customerId = Number(params.customer);
  const accountId = Number(params.account);
  const set = <K extends keyof ContactsParams>(key: K, value: ContactsParams[K]) => onChange(withFilter(params, key, value));

  return (
    <div className="flex flex-col gap-2">
      {summary ? <SummaryLine parts={contactsSummaryParts(summary)} /> : <p aria-hidden="true" className="h-5" />}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ListSearch label="Search people" value={text} onChange={setText} isSm={isSm} />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select label="Organisation" value={params.customer} onChange={(value) => set('customer', value)}>
            <option value="">All organisations</option>
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {params.customer && !organisations.some((o) => o.id === customerId) ? (
              <option value={params.customer}>{organisationName ?? `Organisation ${params.customer}`}</option>
            ) : null}
          </Select>
          <Select label="Account" value={params.account} disabled={!params.customer} onChange={(value) => set('account', value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {params.account && !accounts.some((a) => a.id === accountId) ? (
              <option value={params.account}>{`Account ${params.account}`}</option>
            ) : null}
          </Select>
          <Select label="Sentiment" value={params.sentiment} onChange={(value) => set('sentiment', value as ContactsParams['sentiment'])}>
            <option value="">Any sentiment</option>
            {SENTIMENTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select label="Role" value={params.role} onChange={(value) => set('role', value as ContactsParams['role'])}>
            <option value="">Any role</option>
            {CONTACT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <button type="button" onClick={onAdd} className={`${PRIMARY} justify-center sm:ml-auto`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/components/contacts/ContactsToolbar.test.tsx --maxWorkers=2`
Expected: PASS — `ContactsToolbar` 8 tests.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactsToolbar.test.tsx src/components/contacts/ContactsToolbar.tsx
git commit -m "feat(contacts): the Contacts header with its summary line and URL filters" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: A call, an email and a ticket on the profile

**Files:**
- Create: `src/components/contacts/HistoryItems.tsx`
- Test: `src/components/contacts/HistoryItems.test.tsx`

**Interfaces:**
- Consumes: `readingOf`, `classificationLabel`, `dayLabel`, `placeLabel`, `safeUrl` (Task 1); `HistoryCall`, `HistoryEmail`, `HistoryTicket`, `Classification` (Task 1); `durationLabel`; `ITEM_LINK`, `META`, `ROW_ICON`, `TITLE_BUTTON`; `LUKAS_HISTORY` (Task 1).
- Produces: `HistoryCallItem({call})`, `HistoryEmailItem({email})`, `HistoryTicketItem({ticket})`, each an `li` (`data-history-call|email|ticket`) with an `h4` title.

The call row follows the organisation page's `CallItem` (spec §3: date, title, sentiment or "Not enough to analyse", expandable summary, classification, host, organisation › account tag) but reads the history's shape, so it is its own component rather than a mode of `CallItem`.

- [ ] **Step 1: Write the failing tests**

**Create** `src/components/contacts/HistoryItems.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LUKAS_HISTORY } from '../../features/contacts/testContacts';
import { HistoryCallItem, HistoryEmailItem, HistoryTicketItem } from './HistoryItems';

const [ANALYSED, EMPTY, PENDING] = LUKAS_HISTORY.calls;

function inList(node: ReactNode) {
  render(<ul>{node}</ul>);
  return screen.getByRole('listitem');
}

describe('HistoryCallItem (spec 2026-09-28 §3)', () => {
  it('shows date, title, sentiment, summary, classification, host and length, place and recording', () => {
    const item = inList(<HistoryCallItem call={ANALYSED} />);
    expect(within(item).getByRole('heading', { name: 'Renewal readiness' })).toBeInTheDocument();
    expect(within(item).getByText('12 Sep 2026')).toHaveClass('font-mono-brand', 'tabular-nums');
    expect(within(item).getByText('Positive')).toHaveClass('bg-success-dim', 'text-success');
    expect(within(item).getByText('They want the enterprise tier. Budget is agreed for Q4.')).toHaveClass('truncate');
    for (const text of ['Customer Success › Account Management', 'Carl CSM · 45 min', 'Kraft Heinz › Kraft Heinz EMEA']) {
      expect(within(item).getByText(text)).toBeInTheDocument();
    }
    const recording = within(item).getByRole('link', { name: 'Recording' });
    expect(recording).toHaveAttribute('href', 'https://zoom.us/rec/71');
    expect(recording).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('opens the whole summary in place from its title', async () => {
    const item = inList(<HistoryCallItem call={ANALYSED} />);
    const title = within(item).getByRole('button', { name: 'Renewal readiness' });
    await userEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(within(item).getByText('They want the enterprise tier. Budget is agreed for Q4.')).toHaveClass('whitespace-pre-line');
  });

  it('says "Not enough to analyse" for a call with nothing to read', () => {
    const item = inList(<HistoryCallItem call={EMPTY} />);
    expect(within(item).getByText('Not enough to analyse')).toBeInTheDocument();
    expect(within(item).getByText('No summary.')).toBeInTheDocument();
    expect(within(item).getByText('Kraft Heinz')).toBeInTheDocument();
    expect(within(item).queryByRole('link')).toBeNull();
  });

  it('shows no reading while a call waits, and never links a non-http recording', () => {
    const item = inList(<HistoryCallItem call={PENDING} />);
    for (const text of ['Positive', 'Neutral', 'Negative', 'Not enough to analyse']) expect(within(item).queryByText(text)).toBeNull();
    expect(within(item).queryByRole('link')).toBeNull();
  });
});

describe('HistoryEmailItem and HistoryTicketItem', () => {
  it('an email: subject, date, sentiment, snippet, place and sender', () => {
    const item = inList(<HistoryEmailItem email={LUKAS_HISTORY.emails[0]} />);
    for (const text of ['Thanks for the call', '11 Sep 2026', 'Positive', 'Thanks for walking us through the plan.', 'Kraft Heinz', 'from Lukas Vermeer']) {
      expect(within(item).getByText(text)).toBeInTheDocument();
    }
  });

  it('a ticket: number in DM Mono, title, status, date and the ticket link', () => {
    const item = inList(<HistoryTicketItem ticket={LUKAS_HISTORY.tickets[0]} />);
    expect(within(item).getByText('ZD-1042')).toHaveClass('font-mono-brand');
    for (const text of ['Open', '10 Sep 2026', 'Kraft Heinz']) expect(within(item).getByText(text)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Open ticket' })).toHaveAttribute('href', 'https://kraft.zendesk.example/t/1042');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/contacts/HistoryItems.test.tsx --maxWorkers=2`
Expected: FAIL — `Failed to resolve import "./HistoryItems"`.

- [ ] **Step 3: Implement**

**Create** `src/components/contacts/HistoryItems.tsx`:

```tsx
import { useId, useState } from 'react';
import { ExternalLink, Mail, Phone, Sparkles, Ticket } from 'lucide-react';
import { durationLabel } from '../../features/calls/callFormat';
import { classificationLabel, dayLabel, placeLabel, readingOf, safeUrl } from '../../features/contacts/contactsFormat';
import type { Classification, HistoryCall, HistoryEmail, HistoryTicket } from '../../features/contacts/contactsTypes';
import type { CompanyRef } from '../../features/customers/customersSlice';
import { ITEM_LINK, META, ROW_ICON, TITLE_BUTTON } from '../organizations/detail/listStyles';

// A person's calls, emails and tickets on their profile (spec 2026-09-28
// §3): plain rows like the organisation page's, each with its reading
// (sentiment, "Not enough to analyse", or nothing while it waits), the AI's
// classification and the organisation › account it is on.

function Reading({ record }: { record: { analysis: HistoryCall['analysis']; sentiment: HistoryCall['sentiment'] } }) {
  const reading = readingOf(record);
  return reading ? <span className={`rounded-full px-2 py-0.5 ${reading.tone}`}>{reading.label}</span> : null;
}

function Place({ organisation, account }: { organisation: CompanyRef | null; account: CompanyRef | null }) {
  const label = placeLabel({ organisation, account });
  return label ? <span className="inline-block min-w-0 max-w-[16rem] truncate rounded-full bg-subtle px-2 py-0.5 text-ink">{label}</span> : null;
}

function Classified({ classification }: { classification: Classification }) {
  const label = classificationLabel(classification);
  if (!label) return null;
  return (
    <span data-ai="" className="inline-flex min-w-0 items-center gap-1">
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">AI classification: </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="shrink-0 font-mono-brand text-[11px] tabular-nums text-ink-muted">
      {dayLabel(iso)}
    </time>
  );
}

/** One call: date, title, reading, the summary its title opens in place,
 *  the classification, host and length, the organisation › account, and
 *  the recording. */
export function HistoryCallItem({ call }: { call: HistoryCall }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const recording = safeUrl(call.link.url);
  const who = [call.host_name, durationLabel(call.duration_minutes) || null].filter(Boolean).join(' · ');
  return (
    <li data-history-call={call.id} className="flex gap-3 py-2.5">
      <span aria-hidden="true" className={ROW_ICON}>
        <Phone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h4 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            {call.summary ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                onClick={() => setExpanded((value) => !value)}
                className={TITLE_BUTTON}
              >
                {call.title}
              </button>
            ) : (
              call.title
            )}
          </h4>
          <When iso={call.occurred_at} />
        </div>
        {!call.summary ? (
          <p className="text-[13px] text-ink-muted">No summary.</p>
        ) : expanded ? (
          <p id={detailId} className="whitespace-pre-line break-words text-[13px] text-ink-muted">
            {call.summary}
          </p>
        ) : (
          <p className="truncate text-[13px] text-ink-muted">{call.summary}</p>
        )}
        <p className={META}>
          <Reading record={call} />
          <Place organisation={call.organisation} account={call.account} />
          {who ? <span className="min-w-0 truncate">{who}</span> : null}
          <Classified classification={call.classification} />
          {recording ? (
            <a href={recording} target="_blank" rel="noopener noreferrer" className={`${ITEM_LINK} font-semibold underline`}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Recording
            </a>
          ) : null}
        </p>
      </div>
    </li>
  );
}

/** One email from them: subject, date, reading, snippet and where it is filed. */
export function HistoryEmailItem({ email }: { email: HistoryEmail }) {
  return (
    <li data-history-email={email.id} className="flex gap-3 py-2.5">
      <span aria-hidden="true" className={ROW_ICON}>
        <Mail className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h4 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{email.subject || '(no subject)'}</h4>
          <When iso={email.sent_at} />
        </div>
        {email.snippet ? <p className="truncate text-[13px] text-ink-muted">{email.snippet}</p> : null}
        <p className={META}>
          <Reading record={email} />
          <Place organisation={email.organisation} account={email.account} />
          {email.sender_name ? <span className="min-w-0 truncate">from {email.sender_name}</span> : null}
          <Classified classification={email.classification} />
        </p>
      </div>
    </li>
  );
}

/** One ticket they raised: number, title, status, reading and the ticket itself. */
export function HistoryTicketItem({ ticket }: { ticket: HistoryTicket }) {
  const url = safeUrl(ticket.link.url);
  return (
    <li data-history-ticket={ticket.id} className="flex gap-3 py-2.5">
      <span aria-hidden="true" className={ROW_ICON}>
        <Ticket className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h4 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            <span className="font-mono-brand tabular-nums text-ink-muted">{ticket.ticket_number}</span> {ticket.title}
          </h4>
          <When iso={ticket.opened_at} />
        </div>
        <p className={META}>
          <span>{ticket.status_display}</span>
          <Reading record={ticket} />
          <Place organisation={ticket.organisation} account={ticket.account} />
          <Classified classification={ticket.classification} />
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={`${ITEM_LINK} font-semibold underline`}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Open ticket
            </a>
          ) : null}
        </p>
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/components/contacts/HistoryItems.test.tsx --maxWorkers=2`
Expected: PASS — `HistoryItems` 6 tests.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/HistoryItems.test.tsx src/components/contacts/HistoryItems.tsx
git commit -m "feat(contacts): call, email and ticket rows for a person's history" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The profile: who they are, sentiment and why, their history, Edit and Delete

**Files:**
- Create: `src/components/contacts/ContactProfile.tsx`
- Test: `src/components/contacts/ContactProfile.test.tsx`

**Interfaces:**
- Consumes: `fetchContactById`, `fetchContactHistory`, `deleteContact` and the `selectedContact*` state (Task 2); `placeOf`, `sentimentWhy`, `SENTIMENT_DOT` (Task 1); `HistoryCallItem`, `HistoryEmailItem`, `HistoryTicketItem` (Task 6); `ContactFormModal`, `ConfirmDialog`, `ErrorState`, `ListSkeleton`, `mailtoHref`, `telHref`.
- Produces: `ContactProfile({id: number; onDeleted: () => void})` — reads the person and their history itself; an `article` named after the person; regions "Sentiment", "Calls n", "Emails n", "Tickets n"; `onDeleted` runs after a confirmed delete.

"Why this sentiment?" is not rendered (decision 1): it opens the Ask rail, which is delivery 2. The account link carries `?account=<id>`, the organisation page's chip parameter (`features/organizations/detailParams.ts`).

- [ ] **Step 1: Write the failing tests**

**Create** `src/components/contacts/ContactProfile.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import customersReducer from '../../features/customers/customersSlice';
import { MIRA, requested, stubContactsApi, type ContactsStub } from '../../features/contacts/testContacts';
import { ContactProfile } from './ContactProfile';

function renderProfile(id = 41, stub: ContactsStub = {}) {
  const spy = stubContactsApi(stub);
  const store = configureStore({ reducer: { customers: customersReducer } });
  const onDeleted = vi.fn();
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ContactProfile id={id} onDeleted={onDeleted} />
      </MemoryRouter>
    </Provider>,
  );
  return { spy, store, onDeleted };
}

describe('ContactProfile (spec 2026-09-28 §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a skeleton, then who they are, where they sit and how to reach them', async () => {
    renderProfile();
    expect(screen.getByRole('status', { name: 'Loading this person' })).toBeInTheDocument();
    const profile = await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(within(profile).getByRole('heading', { level: 2, name: 'Lukas Vermeer' })).toHaveClass('text-[22px]');
    expect(within(profile).getByText('Champion')).toBeInTheDocument();
    expect(within(profile).getByRole('link', { name: 'Kraft Heinz' })).toHaveAttribute('href', '/organizations/6');
    expect(within(profile).getByRole('link', { name: 'Kraft Heinz EMEA' })).toHaveAttribute('href', '/organizations/6?account=31');
    expect(within(profile).getByRole('link', { name: 'lukas@kraftheinz.example' })).toHaveAttribute('href', 'mailto:lukas@kraftheinz.example');
    expect(within(profile).getByRole('link', { name: '+44 20 7946 0001' })).toHaveAttribute('href', 'tel:+442079460001');
  });

  it('says what the sentiment rests on; "Why this sentiment?" waits for Ask (delivery 2)', async () => {
    renderProfile();
    const sentiment = await screen.findByRole('region', { name: 'Sentiment' });
    expect(sentiment).toHaveTextContent('Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep');
    expect(screen.queryByRole('button', { name: /why this sentiment/i })).toBeNull();
  });

  it('lists calls newest first with their reading, then emails and tickets', async () => {
    const { spy } = renderProfile();
    const calls = await screen.findByRole('region', { name: /^Calls/ });
    const items = within(calls).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual(['Renewal readiness', 'Call', 'Kick-off']);
    expect(within(items[0]).getByText('Positive')).toBeInTheDocument();
    expect(within(items[1]).getByText('Not enough to analyse')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /^Emails/ })).getByText('Thanks for the call')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /^Tickets/ })).getByText('ZD-1042')).toBeInTheDocument();
    expect(requested(spy)).toEqual(['/contacts/41/', '/contacts/41/history/']);
  });

  it('says when there is nothing yet, and when a hand-set sentiment rests on nothing', async () => {
    renderProfile(MIRA.id);
    await screen.findByRole('article', { name: 'Mira Patel' });
    expect(screen.getByText('Positive, set by hand. Nothing of theirs has been analysed yet.')).toBeInTheDocument();
    for (const text of ['No calls with them yet.', 'No emails from them you can see.', 'No tickets from them you can see.']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it('a person the viewer cannot open reads as not here', async () => {
    renderProfile(999);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open this person');
    expect(screen.getByRole('alert')).toHaveTextContent('on an account you cannot open');
  });

  it('a failed history read offers Try again', async () => {
    renderProfile(41, { failHistory: 1 });
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article', { name: 'Lukas Vermeer' })).toBeInTheDocument();
  });

  it('edits through the existing form', async () => {
    const { store } = renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Lukas V.');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Lukas V.' })).toBeInTheDocument();
    expect(store.getState().customers.selectedContact?.name).toBe('Lukas V.');
  });

  it('deletes after confirming, then hands back to the page', async () => {
    const { spy, onDeleted } = renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByText('Delete Lukas Vermeer?').closest('div')!.parentElement!;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(spy.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(true);
  });

  it('keeps 44px targets on phones', async () => {
    renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    for (const name of ['Edit', 'Delete']) expect(screen.getByRole('button', { name })).toHaveClass('min-h-11', 'sm:min-h-9');
    expect(screen.getByRole('link', { name: 'Kraft Heinz' })).toHaveClass('min-h-11');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/contacts/ContactProfile.test.tsx --maxWorkers=2`
Expected: FAIL — `Failed to resolve import "./ContactProfile"`.

- [ ] **Step 3: Implement**

**Create** `src/components/contacts/ContactProfile.tsx`:

```tsx
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { SENTIMENT_DOT, placeOf, sentimentWhy } from '../../features/contacts/contactsFormat';
import { deleteContact, fetchContactById, fetchContactHistory } from '../../features/customers/customersSlice';
import { initials } from '../../features/customers/formatters';
import { mailtoHref, telHref } from '../../lib/contactLinks';
import { ErrorState } from '../../pages/dashboard/shared/DataState';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { ListSkeleton } from '../organizations/detail/ListParts';
import { ITEM_LINK, SECTION_HEADING } from '../organizations/detail/listStyles';
import { BUTTON, QUIET } from '../organizations/portfolio/styles';
import { ContactFormModal } from './ContactFormModal';
import { HistoryCallItem, HistoryEmailItem, HistoryTicketItem } from './HistoryItems';

function Section({ title, count, shown, empty, children }: { title: string; count: number; shown: number; empty: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h3 id={id} className={`${SECTION_HEADING} flex items-baseline gap-2`}>
        {title}
        <span className="font-mono-brand tabular-nums">{count}</span>
      </h3>
      {shown === 0 ? (
        <p className="py-2 text-[13px] text-ink-muted">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-line-subtle">{children}</ul>
          {count > shown ? <p className="text-[11px] text-ink-muted">The newest {shown} of {count}.</p> : null}
        </>
      )}
    </section>
  );
}

/** The selected person (spec 2026-09-28 §3): who they are and how to reach
 *  them, where they sit (each linking to the organisation page, the account
 *  with its chip chosen), their sentiment and why, then their calls newest
 *  first, emails and tickets. Edit and Delete are the existing flows.
 *  "Why this sentiment?" arrives with Ask on Contacts (delivery 2, §4). */
export function ContactProfile({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const dispatch = useAppDispatch();
  const {
    selectedContact,
    selectedContactError,
    selectedContactHistory,
    selectedContactHistoryError,
  } = useAppSelector((state) => state.customers);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void dispatch(fetchContactById(id));
    void dispatch(fetchContactHistory(id));
  }, [dispatch, id, attempt]);

  const contact = selectedContact?.id === id ? selectedContact : null;
  const history = selectedContactHistory?.contact_id === id ? selectedContactHistory : null;
  const error = selectedContactError ?? selectedContactHistoryError;

  if (error) {
    return (
      <div className="rounded-xl bg-surface">
        <ErrorState message="Could not open this person" detail={error} />
        <div className="flex justify-center pb-6">
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!contact || !history) return <ListSkeleton label="Loading this person" rows={4} />;

  const { organisation, account } = placeOf(contact);
  const email = contact.email ? mailtoHref(contact.email) : null;
  const phone = contact.phone ? telHref(contact.phone) : null;

  return (
    <article aria-label={contact.name} className="flex flex-col gap-5 rounded-xl bg-surface p-4">
      <header className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle font-mono-brand text-[13px] font-semibold text-ink">
          {initials(contact.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[22px] font-semibold text-ink">{contact.name}</h2>
          <p className="text-[13px] text-ink-muted">{contact.role_display}</p>
          {organisation ? (
            <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-[13px]">
              <Link to={`/organizations/${organisation.id}`} className={ITEM_LINK}>
                {organisation.name}
              </Link>
              {account ? (
                <>
                  <span aria-hidden="true" className="text-ink-muted">
                    ›
                  </span>
                  <Link to={`/organizations/${organisation.id}?account=${account.id}`} className={ITEM_LINK}>
                    {account.name}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <p className="flex min-w-0 flex-col text-[13px] sm:flex-row sm:flex-wrap sm:gap-x-3">
            {contact.email && email ? (
              <a href={email} className={ITEM_LINK}>
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{contact.email}</span>
              </a>
            ) : contact.email ? (
              <span className="truncate">{contact.email}</span>
            ) : null}
            {contact.phone && phone ? (
              <a href={phone} className={ITEM_LINK}>
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="font-mono-brand tabular-nums">{contact.phone}</span>
              </a>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className={BUTTON}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
          <button type="button" onClick={() => setDeleting(true)} className={`${BUTTON} text-danger`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      </header>

      <section aria-label="Sentiment" className="flex items-start gap-2 text-[13px] text-ink">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SENTIMENT_DOT[history.sentiment]}`} />
        <p>{sentimentWhy(history.sentiment, history.sentiment_source, history.sentiment_evidence)}</p>
      </section>

      <Section title="Calls" count={history.counts.calls} shown={history.calls.length} empty="No calls with them yet.">
        {history.calls.map((call) => (
          <HistoryCallItem key={call.id} call={call} />
        ))}
      </Section>
      <Section title="Emails" count={history.counts.emails} shown={history.emails.length} empty="No emails from them you can see.">
        {history.emails.map((row) => (
          <HistoryEmailItem key={row.id} email={row} />
        ))}
      </Section>
      <Section title="Tickets" count={history.counts.tickets} shown={history.tickets.length} empty="No tickets from them you can see.">
        {history.tickets.map((row) => (
          <HistoryTicketItem key={row.id} ticket={row} />
        ))}
      </Section>

      {editing ? (
        <ContactFormModal
          contact={contact}
          onClose={() => setEditing(false)}
          // An edit patches every list the person is in (updateContact's reducer).
          onSaved={() => {}}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${contact.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await dispatch(deleteContact(contact.id)).unwrap();
            onDeleted();
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </article>
  );
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/components/contacts/ContactProfile.test.tsx --maxWorkers=2`
Expected: PASS — `ContactProfile` 9 tests.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactProfile.test.tsx src/components/contacts/ContactProfile.tsx
git commit -m "feat(contacts): the contact profile with sentiment and why and their history" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The page: frame, routes, layout by breakpoint, and the top bar

**Files:**
- Create: `src/pages/contacts/ContactsFrame.tsx`
- Create: `src/pages/contacts/ContactsPage.tsx`
- Create: `src/pages/contacts/testPage.tsx`
- Test: `src/pages/contacts/ContactsPage.test.tsx`
- Test: `src/components/contacts/houseRules.test.ts`
- Modify: `src/lib/useMediaQuery.ts`
- Modify: `src/App.tsx`
- Modify: `src/layouts/DashboardLayout.tsx`
- Modify: `src/components/layout/Navbar.tsx`
- Test: `src/components/layout/Navbar.test.tsx`

**Interfaces:**
- Consumes: everything above; `fetchCustomers`; `useMediaQuery`, `SM`; `setViewport` (tests).
- Produces:
  - `MD = '(min-width: 768px)'` (`lib/useMediaQuery.ts`).
  - `ContactsFrame({rail?: ReactNode; children})` — the Organizations frame's classes (`px-4 pb-4`, `gap-3`), `data-frame="contacts"`, a rail slot; inside another `ContactsFrame` it passes its content through (delivery 2's Ask layout).
  - `ContactsPage()` — routed at `contacts/:id?`; `/contacts/list` redirects to `/contacts`.
  - `renderContactsPage(url?, {width?})` (`pages/contacts/testPage.tsx`, tests only) — the page on the real store and router, with a `data-testid="where"` line showing the path and query, and `/organizations/:id` as a `where` marker.
  - Navbar: `/contacts` and `/contacts/:id` are framed, titled "Contacts"; the old contact breadcrumb is gone.

The old List and Details pages stay on disk until Task 9 but are no longer routed. The house-rules suite starts covering the new files here, once they all exist.

- [ ] **Step 1: Write the failing tests**

**Create** `src/pages/contacts/testPage.tsx`:

```tsx
// Test-only: the Contacts page on the real store and router, as App.tsx
// routes it. Only fetch is stubbed, by the caller (stubContactsApi).
/* eslint-disable react-refresh/only-export-components */
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import customersReducer from '../../features/customers/customersSlice';
import { setViewport } from '../../test/viewport';
import { ContactsPage } from './ContactsPage';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

export function renderContactsPage(url = '/contacts', { width = 1440 }: { width?: number } = {}) {
  setViewport(width);
  const store = configureStore({ reducer: { customers: customersReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/contacts/list" element={<Navigate to="/contacts" replace />} />
          <Route
            path="/contacts/:id?"
            element={
              <>
                <ContactsPage />
                <Where />
              </>
            }
          />
          <Route path="/organizations/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

**Create** `src/pages/contacts/ContactsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requested, stubContactsApi } from '../../features/contacts/testContacts';
import { resetViewport } from '../../test/viewport';
import { renderContactsPage } from './testPage';

const where = () => screen.getByTestId('where').textContent;
const listRequests = (spy: ReturnType<typeof stubContactsApi>) => requested(spy).filter((path) => path.startsWith('/contacts/?') || path === '/contacts/');
const people = () => within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem');

describe('Contacts page (spec 2026-09-28 §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('desktop: the summary line, the list and a prompt to choose a person', async () => {
    stubContactsApi();
    renderContactsPage();
    expect(await screen.findByRole('list', { name: 'People' })).toBeInTheDocument();
    expect(people()).toHaveLength(3);
    expect(document.querySelector('[data-summary]')).toHaveTextContent('3 people · 1 decision maker · 33% positive · 1 negative');
    expect(within(screen.getByRole('region', { name: 'Profile' })).getByText('Choose a person')).toBeInTheDocument();
  });

  it('reads the filters from the URL and asks the API with them', async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts?customer=6&role=champion&q=luk');
    await screen.findByRole('list', { name: 'People' });
    expect(listRequests(spy)).toEqual(['/contacts/?search=luk&customer=6&role=champion']);
    expect(screen.getByLabelText('Search people')).toHaveValue('luk');
    expect(screen.getByLabelText('Role')).toHaveDisplayValue('Champion');
  });

  it('/contacts/:id opens that person beside the list, marked in it', async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts/41?sentiment=neutral');
    const profile = within(screen.getByRole('region', { name: 'Profile' }));
    expect(await profile.findByRole('heading', { level: 2, name: 'Lukas Vermeer' })).toBeInTheDocument();
    await screen.findByRole('list', { name: 'People' });
    expect(within(people()[0]).getByRole('link')).toHaveAttribute('aria-current', 'page');
    expect(requested(spy)).toContain('/contacts/41/history/');
  });

  it('a filter writes the URL and reads again; choosing a person keeps the filters', async () => {
    const spy = stubContactsApi();
    renderContactsPage();
    await screen.findByRole('list', { name: 'People' });
    await userEvent.selectOptions(screen.getByLabelText('Sentiment'), 'Negative');
    await waitFor(() => expect(people()).toHaveLength(1));
    expect(where()).toBe('/contacts?sentiment=negative');
    expect(listRequests(spy)).toEqual(['/contacts/', '/contacts/?sentiment=negative']);
    await userEvent.click(within(people()[0]).getByRole('link'));
    expect(where()).toBe('/contacts/43?sentiment=negative');
    expect(await screen.findByRole('heading', { level: 2, name: 'Owen Price' })).toBeInTheDocument();
  });

  it('the organisation filter narrows to its people and offers its accounts', async () => {
    stubContactsApi();
    renderContactsPage();
    await screen.findByRole('list', { name: 'People' });
    await userEvent.selectOptions(await screen.findByLabelText('Organisation'), 'Kraft Heinz');
    await waitFor(() => expect(people()).toHaveLength(1));
    expect(where()).toBe('/contacts?customer=6');
    const account = screen.getByLabelText('Account');
    await within(account).findByRole('option', { name: 'Kraft Heinz NA' });
    await userEvent.selectOptions(account, 'Kraft Heinz NA');
    expect(await screen.findByText('Nobody matches')).toBeInTheDocument();
    expect(where()).toBe('/contacts?customer=6&account=32');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(people()).toHaveLength(3));
    expect(where()).toBe('/contacts');
  });

  it('loads more at the end', async () => {
    stubContactsApi({ pageSize: 2 });
    renderContactsPage();
    await screen.findByRole('list', { name: 'People' });
    expect(people()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Load more (2 of 3)' }));
    await waitFor(() => expect(people()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
  });

  it('a failed read offers Try again', async () => {
    stubContactsApi({ failList: 1 });
    renderContactsPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'People' })).toBeInTheDocument();
  });

  it('deleting the open person goes back to the list, read again without them', async () => {
    stubContactsApi();
    renderContactsPage('/contacts/41?role=champion');
    await screen.findByRole('heading', { level: 2, name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByText('Delete Lukas Vermeer?').closest('div')!.parentElement!;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/contacts?role=champion'));
    expect(await screen.findByText('Nobody matches')).toBeInTheDocument();
    expect(document.querySelector('[data-summary]')).toHaveTextContent('0 people');
  });

  it('+ Add opens the existing form with the organisations to choose from', async () => {
    stubContactsApi();
    renderContactsPage();
    await screen.findByRole('list', { name: 'People' });
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Add Contact', { selector: 'h2, h3' })).toBeInTheDocument();
  });

  it('desktop: the list and the profile each scroll in the frame; no table, no stat cards', async () => {
    stubContactsApi();
    renderContactsPage('/contacts/41');
    await screen.findByRole('heading', { level: 2, name: 'Lukas Vermeer' });
    expect(document.querySelector('[data-frame="contacts"]')).toHaveClass('px-4', 'pb-4');
    expect(document.querySelector('[data-pane="list"]')).toHaveClass('overflow-y-auto', 'shrink-0');
    expect(document.querySelector('[data-pane="profile"]')).toHaveClass('overflow-y-auto', 'flex-1');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/Total Contacts/i)).toBeNull();
  });

  it('the old /contacts/list lands on /contacts', async () => {
    stubContactsApi();
    renderContactsPage('/contacts/list');
    await screen.findByRole('list', { name: 'People' });
    expect(where()).toBe('/contacts');
  });
});

describe('Contacts page on phones (spec 2026-09-28 §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('the list is full width with no profile beside it', async () => {
    stubContactsApi();
    renderContactsPage('/contacts', { width: 375 });
    await screen.findByRole('list', { name: 'People' });
    expect(screen.queryByRole('region', { name: 'Profile' })).toBeNull();
    expect(screen.queryByText('Choose a person')).toBeNull();
  });

  it('a person opens as their own screen, with a back link that keeps the filters', async () => {
    stubContactsApi();
    renderContactsPage('/contacts?role=champion', { width: 375 });
    await screen.findByRole('list', { name: 'People' });
    await userEvent.click(within(people()[0]).getByRole('link'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Lukas Vermeer' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'People' })).toBeNull();
    const back = screen.getByRole('link', { name: 'Contacts' });
    expect(back).toHaveClass('min-h-11');
    await userEvent.click(back);
    expect(where()).toBe('/contacts?role=champion');
    expect(await screen.findByRole('list', { name: 'People' })).toBeInTheDocument();
  });
});
```

**Create** `src/components/contacts/houseRules.test.ts`:

```ts
import { houseRuleSuite } from '../../test/houseRules';

// .claude/skills/revenact-design/SKILL.md §4 over the Contacts page (spec
// 2026-09-28 §7). ContactFormModal and ContactRowActionsPopover are older
// shared forms the account page also uses; they are not this page's to
// restyle.
houseRuleSuite('Contacts page house rules', {
  ...(import.meta.glob(['./ContactList.tsx', './ContactListItem.tsx', './ContactsToolbar.tsx', './ContactProfile.tsx', './HistoryItems.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>),
  ...(import.meta.glob(['../../pages/contacts/ContactsPage.tsx', '../../pages/contacts/ContactsFrame.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>),
});
```

**Find** in `src/components/layout/Navbar.test.tsx`:

```tsx
describe('Navbar contact breadcrumb (/contacts/:id)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the real contact name once Details.tsx has loaded it into the store', () => {
    // Navbar doesn't fetch this itself — it reads the same
    // selectedContact that pages/contacts/Details.tsx's own
    // fetchContactById() populates (see customersSlice.ts).
    renderNavbar('/contacts/1', null, sarahChen);

    expect(screen.getByRole('heading', { name: 'Sarah Chen' })).toBeInTheDocument();
    expect(screen.getByText('Globex Corp')).toBeInTheDocument();
  });

  it('does not show a stale contact name for a different id than the one loaded', () => {
    renderNavbar('/contacts/2', null, sarahChen);

    expect(screen.queryByRole('heading', { name: 'Sarah Chen' })).not.toBeInTheDocument();
  });

  it('does not show a contact header on /contacts/list (not a numeric id)', () => {
    renderNavbar('/contacts/list', null, sarahChen);

    expect(screen.queryByRole('heading', { name: 'Sarah Chen' })).not.toBeInTheDocument();
  });
});
```

**Replace with:**

```tsx
describe('Navbar on Contacts (spec 2026-09-28 §3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/contacts', '/contacts/1'])('titles %s "Contacts" in the framed bar, with the actions slot and no avatar', (route) => {
    renderNavbar(route, null, sarahChen);
    expect(screen.getByRole('heading', { level: 1, name: 'Contacts' })).toBeInTheDocument();
    // The person's name is the page's to show, not the bar's.
    expect(screen.queryByRole('heading', { name: 'Sarah Chen' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-nav-actions-slot]')).not.toBeNull();
    expect(screen.queryByRole('img', { name: 'Alice Admin' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/contacts src/components/contacts src/components/layout src/layouts --maxWorkers=2`
Expected: FAIL — `Failed to resolve import "./testPage"` / `"./ContactsPage"` and `"./ContactsFrame"`; the Navbar test finds no "Contacts" heading on `/contacts`.

- [ ] **Step 3: Implement**

**Create** `src/pages/contacts/ContactsFrame.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';

/** Set inside a frame an Ask layout draws, so the page's own frame inside
 *  it renders just its content rather than a second frame. */
const InFrame = createContext(false);

/** The Contacts frame, class for class the Organizations one (px-4 pb-4,
 *  gap-3, no top padding under the transparent top bar), with a content
 *  column and a slot for the Ask rail beside it. Delivery 2 (spec
 *  2026-09-28 §4) draws it once in a ContactsAskLayout with the rail in the
 *  slot, and this page's own frame then passes its content straight
 *  through; on its own it draws the frame with no rail. */
export function ContactsFrame({ rail = null, children }: { rail?: ReactNode; children: ReactNode }) {
  const inFrame = useContext(InFrame);
  if (inFrame) return <>{children}</>;
  return (
    <InFrame.Provider value={true}>
      <div data-frame="contacts" className="relative flex-1 min-h-0 w-full flex gap-3 px-4 pb-4">
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col">{children}</div>
        {rail}
      </div>
    </InFrame.Provider>
  );
}
```

**Create** `src/pages/contacts/ContactsPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ContactFormModal } from '../../components/contacts/ContactFormModal';
import { ContactList } from '../../components/contacts/ContactList';
import { ContactProfile } from '../../components/contacts/ContactProfile';
import { ContactsToolbar } from '../../components/contacts/ContactsToolbar';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS } from '../../components/organizations/portfolio/styles';
import {
  NO_FILTERS,
  contactsApiPath,
  hasFilters,
  parseContactsParams,
  toContactsSearch,
  type ContactsParams,
} from '../../features/contacts/contactsParams';
import { fetchAllContacts, fetchCustomers, loadMoreContacts } from '../../features/customers/customersSlice';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { MD, SM, useMediaQuery } from '../../lib/useMediaQuery';
import { ContactsFrame } from './ContactsFrame';

const BACK = `-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle ${FOCUS}`;

/** The Contacts page (spec 2026-09-28 §3): the summary line and filters, a
 *  list of people on the left and the chosen person's profile on the right.
 *  `/contacts/:id` chooses them; the filters live in the URL (`q`,
 *  `customer`, `account`, `sentiment`, `role`). On phones the list is full
 *  width and a person opens as their own screen with a back link. */
export function ContactsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { id } = useParams();
  const selectedId = id && /^[1-9]\d*$/.test(id) ? Number(id) : null;
  const isMd = useMediaQuery(MD);
  const isSm = useMediaQuery(SM);
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseContactsParams(search), [search]);
  const query = toContactsSearch(params).toString();
  const apiPath = contactsApiPath(params);
  const [refresh, setRefresh] = useState(0);
  const [adding, setAdding] = useState(false);
  const {
    customers,
    allContacts,
    allContactsCount,
    allContactsNext,
    allContactsLoading,
    allContactsError,
    allContactsSummary,
    allContactsLoadingMore,
    allContactsMoreError,
  } = useAppSelector((state) => state.customers);

  useEffect(() => {
    void dispatch(fetchCustomers());
  }, [dispatch]);

  useEffect(() => {
    void dispatch(fetchAllContacts(apiPath));
  }, [dispatch, apiPath, refresh]);

  const organisations = useMemo(() => customers.map((c) => ({ id: c.id, name: c.name })), [customers]);
  const organisationName =
    allContacts.find((c) => c.organisation && String(c.organisation.id) === params.customer)?.organisation?.name ?? null;

  const change = useCallback(
    (next: ContactsParams, replace = false) => setSearch(toContactsSearch(next), { replace }),
    [setSearch],
  );
  const suffix = query ? `?${query}` : '';
  const listPath = { pathname: '/contacts', search: suffix };
  const linkFor = (personId: number) => ({ pathname: `/contacts/${personId}`, search: suffix });

  const toolbar = (
    <ContactsToolbar
      params={params}
      summary={allContactsSummary}
      organisations={organisations}
      organisationName={organisationName}
      isSm={isSm}
      onChange={change}
      onAdd={() => setAdding(true)}
    />
  );
  const list = (
    <ContactList
      rows={allContacts}
      count={allContactsCount}
      loading={allContactsLoading}
      error={allContactsError}
      filtered={hasFilters(params)}
      next={allContactsNext}
      loadingMore={allContactsLoadingMore}
      moreError={allContactsMoreError}
      selectedId={selectedId}
      linkFor={linkFor}
      onRetry={() => setRefresh((n) => n + 1)}
      onClear={() => change(NO_FILTERS)}
      onMore={() => {
        if (allContactsNext) void dispatch(loadMoreContacts(allContactsNext));
      }}
    />
  );
  const profile =
    selectedId !== null ? (
      <ContactProfile
        key={selectedId}
        id={selectedId}
        onDeleted={() => {
          navigate(listPath);
          setRefresh((n) => n + 1);
        }}
      />
    ) : (
      <EmptyState title="Choose a person" detail="Their sentiment and why, and their calls, emails and tickets, show here." action={null} />
    );

  let body;
  if (!isMd && selectedId !== null) {
    body = (
      <div className="flex flex-col gap-2 pb-4">
        <Link to={listPath} className={BACK}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Contacts
        </Link>
        {profile}
      </div>
    );
  } else if (!isMd) {
    body = (
      <div className="flex flex-col gap-3 pb-4">
        {toolbar}
        {list}
      </div>
    );
  } else {
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {toolbar}
        <div className="flex min-h-0 flex-1 gap-3">
          <div data-pane="list" className="w-[22rem] shrink-0 overflow-y-auto lg:w-[26rem]">
            {list}
          </div>
          <section aria-label="Profile" data-pane="profile" className="min-w-0 flex-1 overflow-y-auto">
            {profile}
          </section>
        </div>
      </div>
    );
  }

  return (
    <ContactsFrame>
      {body}
      {adding ? (
        <ContactFormModal companies={organisations} onClose={() => setAdding(false)} onSaved={() => setRefresh((n) => n + 1)} />
      ) : null}
    </ContactsFrame>
  );
}
```

**Find** in `src/lib/useMediaQuery.ts`:

```ts
export const SM = '(min-width: 640px)';
```

**Replace with:**

```ts
export const SM = '(min-width: 640px)';
export const MD = '(min-width: 768px)';
```

**Find** in `src/App.tsx`:

```tsx
import { List as ContactsList } from './pages/contacts/List';
import { ContactDetails } from './pages/contacts/Details';
```

**Replace with:**

```tsx
import { ContactsPage } from './pages/contacts/ContactsPage';
```

**Find** in `src/App.tsx`:

```tsx
          <Route path="contacts">
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<ContactsList />} />
            <Route path=":id" element={<ContactDetails />} />
          </Route>
```

**Replace with:**

```tsx
          {/* One page: /contacts lists, /contacts/:id also opens a person
              (spec 2026-09-28 §3). The old /contacts/list still lands. */}
          <Route path="contacts/list" element={<Navigate to="/contacts" replace />} />
          <Route path="contacts/:id?" element={<ContactsPage />} />
```

**Find** in `src/layouts/DashboardLayout.tsx`:

```tsx
    /^\/organizations\/\d+$/.test(location.pathname);
```

**Replace with:**

```tsx
    /^\/organizations\/\d+$/.test(location.pathname);
  // The Contacts frame (spec 2026-09-28 §3): the list, and a person on it.
  const isContacts = /^\/contacts(\/\d+)?$/.test(location.pathname);
```

**Find** in `src/layouts/DashboardLayout.tsx`:

```tsx
|| isDashboard || isOrgView) ? 'p-0'
```

**Replace with:**

```tsx
|| isDashboard || isOrgView || isContacts) ? 'p-0'
```

**Find** in `src/components/layout/Navbar.tsx`:

```tsx
import { companyLabel, formatRelativeTime } from '../../features/customers/formatters';
```

**Replace with:**

```tsx
import { formatRelativeTime } from '../../features/customers/formatters';
```

**Find** in `src/components/layout/Navbar.tsx`:

```tsx
  // Detect contact details path (/contacts/:id — not /contacts/list,
  // which \d+ already excludes). Same "read the same fetch the Details
  // page itself already made" reasoning as organization/account above —
  // pages/contacts/Details.tsx's own fetchContactById() populates this.
  const contactDetailMatch = location.pathname.match(/\/contacts\/(\d+)/);
  const contactId = contactDetailMatch ? parseInt(contactDetailMatch[1], 10) : null;
  const selectedContact = useAppSelector((state) => state.customers.selectedContact);
  const contact = contactId && selectedContact?.id === contactId ? selectedContact : null;
```

**Replace with:** nothing (delete it).

**Find** in `src/components/layout/Navbar.tsx`:

```tsx
  const isOrgDetail = /^\/organizations\/\d+$/.test(location.pathname);
  const isFramed = isDashboard || isOrgView || isOrgDetail;
```

**Replace with:**

```tsx
  const isOrgDetail = /^\/organizations\/\d+$/.test(location.pathname);
  // Contacts wears the same frame (spec 2026-09-28 §3): the list and the
  // person open on it share one page, titled here; the page draws the rest.
  const isContacts = /^\/contacts(\/\d+)?$/.test(location.pathname);
  const isFramed = isDashboard || isOrgView || isOrgDetail || isContacts;
```

**Find** in `src/components/layout/Navbar.tsx`:

```tsx
        ) : contact ? (
          <div className="flex items-center gap-4">
             <button
                onClick={() => navigate(-1)}
                className="p-1.5 hover:bg-subtle rounded-lg transition-colors text-ink-faint hover:text-accent border border-transparent hover:border-line-subtle"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3">
                 <EntityAvatar
                    name={contact.name}
                    className="w-[36px] h-[36px] rounded-full border border-line-subtle shadow-sm"
                 />
                 <div className="flex items-center gap-3">
                    <h1 className="text-[16px] font-bold text-ink tracking-tight uppercase whitespace-nowrap">{contact.name}</h1>
                    <div className="w-px h-3.5 bg-line" />
                    <span className="text-[13.5px] font-bold text-ink-faint tracking-widest uppercase truncate max-w-[140px]">{companyLabel(contact.companies)}</span>
                 </div>
              </div>
          </div>
        ) : isOrgDetail ? (
```

**Replace with:**

```tsx
        ) : isContacts ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Contacts</h1>
          </div>
        ) : isOrgDetail ? (
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/pages/contacts src/components/contacts src/components/layout src/layouts --maxWorkers=2`
Expected: PASS — `ContactsPage` 13 tests, the house-rules suite, every `components/contacts` suite, `Navbar` and `DashboardLayout`.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/contacts/houseRules.test.ts src/components/layout/Navbar.test.tsx src/components/layout/Navbar.tsx src/layouts/DashboardLayout.tsx src/lib/useMediaQuery.ts src/pages/contacts/ContactsFrame.tsx src/pages/contacts/ContactsPage.test.tsx src/pages/contacts/ContactsPage.tsx src/pages/contacts/testPage.tsx
git commit -m "feat(contacts): the Contacts page, a list and a profile panel, on /contacts and /contacts/:id" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Remove the table, the stat cards, the old profile page and the retired reads

**Files:**
- Modify: `src/features/customers/customersSlice.ts`
- Test: `src/components/layout/Navbar.test.tsx`
- Delete: `src/pages/contacts/List.tsx`
- Delete: `src/pages/contacts/List.test.tsx`
- Delete: `src/pages/contacts/Details.tsx`
- Delete: `src/pages/contacts/Details.test.tsx`
- Delete: `src/components/contacts/ContactsTable.tsx`
- Delete: `src/components/contacts/MetricsPanel.tsx`
- Delete: `src/components/contacts/ActionBar.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no `fetchContactStats`, `fetchContactInteractions`, `ContactStats`, `ContactInteraction(s)`, `contactStats*` or `selectedContactInteractions*` anywhere; no `ContactsTable`, `MetricsPanel` (contacts), `ActionBar`, `pages/contacts/List.tsx` or `Details.tsx`.

Nothing imports these any more (Task 8 unrouted the pages). `components/accounts/MetricsPanel.tsx` is a different file and stays; so do `ContactFormModal` and `ContactRowActionsPopover`, which `components/shared/ContactsTab.tsx` uses.

- [ ] **Step 1: Delete the dead code**

**Find** in `src/features/customers/customersSlice.ts`:

```ts
// GET /api/v1/contacts/<id>/interactions/ — what the sentiment rests on.
export interface ContactInteraction {
  kind: 'call' | 'email' | 'ticket';
  id: number;
  title: string;
  snippet: string;
  when: string;
  sentiment: 'positive' | 'neutral' | 'negative' | '';
  ai_category: string;
}

export interface ContactInteractions {
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  score: number;
  source: 'manual' | 'computed';
  evidence: ContactSentimentEvidence | Record<string, never>;
  interactions: ContactInteraction[];
}

// Mirrors revenact-backend's ContactStatsView response exactly — see
// docs/API_CONTRACTS.md -> GET /api/v1/contacts/stats/.
export interface ContactStats {
  total: number;
  active: number;
  sentiment: { positive: number; neutral: number; negative: number };
  sentiment_pct: { positive: number; neutral: number; negative: number };
  /** null (not 0) when there were no contacts yet 30 days ago — a
   * percentage change off a zero base is undefined, not zero. */
  growth_30d_pct: number | null;
}
```

**Replace with:** nothing (delete it).

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  /** The global, paginated, searchable/company-filterable contact list
   * for the standalone /contacts/list page — separate from `contacts`
   * above the same way `customers` (the Organizations list) is
   * separate from `selectedCustomer`: this page isn't scoped to one
   * Customer/Account at all. */
  allContacts: Contact[];
```

**Replace with:**

```ts
  /** The Contacts page's list (/contacts): every person the viewer may
   * open, filtered, paged by "Load more" — separate from `contacts`
   * above, which is one organisation's or account's people. */
  allContacts: Contact[];
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  /** Total/Active/Sentiment/Growth rollups for the standalone
   * /contacts/list page's MetricsPanel — null until the first fetch
   * resolves, same reasoning as `stats` (Customer's own). */
  contactStats: ContactStats | null;
  contactStatsLoading: boolean;
  contactStatsError: string | null;
  /** The single Contact the new /contacts/:id page is showing — same
   * "separate from the paginated/scoped lists" reasoning as
   * selectedCustomer vs. `customers`/`accountsForCustomer`. */
  selectedContact: Contact | null;
  selectedContactLoading: boolean;
  selectedContactError: string | null;
  selectedContactInteractions: ContactInteractions | null;
  selectedContactInteractionsLoading: boolean;
```

**Replace with:**

```ts
  /** The person the Contacts page's profile shows (/contacts/:id). */
  selectedContact: Contact | null;
  selectedContactLoading: boolean;
  selectedContactError: string | null;
```

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  contactStats: null,
  contactStatsLoading: false,
  contactStatsError: null,
```

**Replace with:** nothing (delete it).

**Find** in `src/features/customers/customersSlice.ts`:

```ts
  selectedContactInteractions: null,
  selectedContactInteractionsLoading: false,
```

**Replace with:** nothing (delete it).

**Find** in `src/features/customers/customersSlice.ts`:

```ts
export const fetchContactStats = createAsyncThunk<ContactStats, void, { rejectValue: string }>(
  'customers/fetchContactStats',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<ContactStats>('/contacts/stats/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load contact stats.';
      return rejectWithValue(message);
    }
  }
);

// Powers the new /contacts/:id page.
export const fetchContactInteractions = createAsyncThunk<ContactInteractions, number, { rejectValue: string }>(
  'customers/fetchContactInteractions',
  async (id, { rejectWithValue }) => {
    try {
      return await apiFetch<ContactInteractions>(`/contacts/${id}/interactions/`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load this contact\'s interactions.';
      return rejectWithValue(message);
    }
  }
);
```

**Replace with:** nothing (delete it).

**Find** in `src/features/customers/customersSlice.ts`:

```ts
      .addCase(fetchContactStats.pending, (state) => {
        state.contactStatsLoading = true;
        state.contactStatsError = null;
      })
      .addCase(fetchContactStats.fulfilled, (state, action) => {
        state.contactStatsLoading = false;
        state.contactStats = action.payload;
      })
      .addCase(fetchContactStats.rejected, (state, action) => {
        state.contactStatsLoading = false;
        state.contactStatsError = action.payload ?? 'Something went wrong.';
      })
      .addCase(fetchContactInteractions.pending, (state) => {
        state.selectedContactInteractionsLoading = true;
      })
      .addCase(fetchContactInteractions.fulfilled, (state, action) => {
        state.selectedContactInteractionsLoading = false;
        state.selectedContactInteractions = action.payload;
      })
      .addCase(fetchContactInteractions.rejected, (state) => {
        state.selectedContactInteractionsLoading = false;
        state.selectedContactInteractions = null;
      })
```

**Replace with:** nothing (delete it).

**Find** in `src/components/layout/Navbar.test.tsx`:

```tsx
        contactStats: null,
        contactStatsLoading: false,
        contactStatsError: null,
```

**Replace with:** nothing (delete it).

**Find** in `src/components/layout/Navbar.test.tsx`:

```tsx
        selectedContactInteractions: null,
        selectedContactInteractionsLoading: false,
```

**Replace with:** nothing (delete it).

Delete the files nothing imports any more:

```bash
git rm src/pages/contacts/List.tsx \
  src/pages/contacts/List.test.tsx \
  src/pages/contacts/Details.tsx \
  src/pages/contacts/Details.test.tsx \
  src/components/contacts/ContactsTable.tsx \
  src/components/contacts/MetricsPanel.tsx \
  src/components/contacts/ActionBar.tsx
```

- [ ] **Step 2: Run the tests and the type check**

Run: `npx vitest run src/features src/components/contacts src/components/layout src/pages/contacts --maxWorkers=2`
Expected: PASS — every suite under `src/features`, `components/contacts`, `components/layout` and `pages/contacts`.

Run: `npx tsc -b`
Expected: exit 0, no output.

Then confirm nothing refers to what was removed:

Run: `git grep -nE "fetchContactStats|fetchContactInteractions|ContactStats[^V]|ContactInteraction|contactStats|selectedContactInteractions|contacts/(ContactsTable|MetricsPanel|ActionBar)|pages/contacts/(List|Details)" -- src`
Expected: no output (exit 1). Two comments that name `ContactsTable` as a past convention (`AccountsTable.tsx`, `PipelinesPage.tsx`) do not match and can stay.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Navbar.test.tsx src/features/customers/customersSlice.ts
git commit -m "refactor(contacts): remove the table, stat cards, old profile page and retired reads" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: End to end in jsdom, and the product documents

**Files:**
- Test: `src/e2e/contacts.test.tsx`
- Modify: `docs/03-ui-ux-design.md`
- Modify: `docs/04-app-flow.md`
- Modify: `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: `renderContactsPage` (Task 8), `stubContactsApi`, `requested` (Task 1).
- Produces: `src/e2e/contacts.test.tsx`; the three product documents describe the page.

- [ ] **Step 1: Write the end-to-end test**

Spec §7: "filter by organisation, open a person, see their calls with sentiment, follow the link to the organisation".

**Create** `src/e2e/contacts.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requested, stubContactsApi } from '../features/contacts/testContacts';
import { renderContactsPage } from '../pages/contacts/testPage';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the Contacts page on the real store
// and router. Only fetch is stubbed, in the backend's contract shapes.
const where = () => screen.getByTestId('where').textContent;

describe('Contacts, end to end (spec 2026-09-28 §7)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('filters by organisation, opens a person, sees their calls with sentiment, and follows the link to the organisation', { timeout: 30000 }, async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts');

    // 1. Filter by Kraft Heinz: the URL, the request and the list follow.
    await screen.findByRole('list', { name: 'People' });
    await userEvent.selectOptions(await screen.findByLabelText('Organisation'), 'Kraft Heinz');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem')).toHaveLength(1));
    expect(where()).toBe('/contacts?customer=6');
    expect(requested(spy)).toContain('/contacts/?customer=6');
    expect(document.querySelector('[data-summary]')).toHaveTextContent('1 person · 0 decision makers · 0% positive · 0 negative');

    // 2. Open Lukas: his profile beside the list, the filter kept.
    await userEvent.click(screen.getByRole('link', { name: /Lukas Vermeer/ }));
    expect(where()).toBe('/contacts/41?customer=6');
    const profile = await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(within(profile).getByRole('region', { name: 'Sentiment' })).toHaveTextContent(
      'Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep',
    );

    // 3. His calls, newest first, each with its reading.
    const calls = within(within(profile).getByRole('region', { name: /^Calls/ })).getAllByRole('listitem');
    expect(within(calls[0]).getByText('Positive')).toBeInTheDocument();
    expect(within(calls[1]).getByText('Not enough to analyse')).toBeInTheDocument();

    // 4. The account link opens the organisation page with that account's chip chosen.
    await userEvent.click(within(profile).getByRole('link', { name: 'Kraft Heinz EMEA' }));
    expect(where()).toBe('/organizations/6?account=31');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/contacts.test.tsx --maxWorkers=2`
Expected: PASS already — every piece exists by now, so this test is a regression net rather than a driver. If it fails, the failure is a real bug in Tasks 4–8: fix it there (superpowers:systematic-debugging) before going on.

- [ ] **Step 3: Update the product documents**

Three documents describe the page (the backend PR updates `API_CONTRACTS.md`). Apply these edits exactly.

**Find** in `docs/03-ui-ux-design.md`:

```text
| `AccountsTable`, `ContactsTable` | Same shape, no bulk actions |
```

**Replace with:**

```text
| `AccountsTable` | Same shape, no bulk actions |
| Contacts list and profile (`components/contacts/`) | `/contacts`: `ContactsToolbar` (summary line, search, organisation, account, sentiment and role filters in the URL, + Add), `ContactList` of `ContactListItem`s (never a table row; Load more), `ContactProfile` (sentiment and why, then `HistoryItems`: calls newest first, emails, tickets). See "Contacts" below |
```

**Find** in `docs/03-ui-ux-design.md`:

```text
| `MetricsPanel` | Accounts and Contacts (each its own): count, health donut with COUNT/MRR/ARR toggle, NPS, lifecycle donut, renewal window |
```

**Replace with:**

```text
| `MetricsPanel` | Accounts: count, health donut with COUNT/MRR/ARR toggle, NPS, lifecycle donut, renewal window |
```

**Find** in `docs/03-ui-ux-design.md`:

```text
### Overlays
```

**Replace with:**

```text
### Contacts

Spec `docs/superpowers/specs/2026-09-28-contacts-redesign-design.md` §3 and §5.
A list and a profile panel, like the Communications inbox but solid (no
glass), in `ContactsFrame` (the Organizations frame's classes, with a slot
for the Ask rail that delivery 2 fills).

- **Header.** The summary line ("142 people · 38 decision makers · 61%
  positive · 12 negative", over the whole filtered set), then search and the
  organisation, account (waits for an organisation), sentiment and role
  filters, all in the URL (`q`, `customer`, `account`, `sentiment`, `role`),
  and + Add (the existing `ContactFormModal`).
- **List.** One item per person: initials, name and role, "Organisation ›
  Account" (or the organisation alone), sentiment in words in its colour with
  "n calls" beside it, and last contacted. Load more at the end; skeleton,
  error with Try again, and empty states (Clear filters when filtered).
- **Profile.** `/contacts/:id` chooses the person. Name (22px), role,
  "Organisation › Account" (the organisation links to its page, the account
  to it with `?account=` so its chip is chosen), email and phone links
  (sanitised). Their sentiment and why ("Neutral: 3 positive · 2 neutral · 1
  negative across 6 calls and 2 emails, latest 12 Sep"). Calls newest first:
  date, title, sentiment or "Not enough to analyse" (nothing while pending),
  the summary its title opens, the classification, host and length, the
  organisation › account tag and the recording. Then emails and tickets.
  Edit and Delete are the existing flows. "Why this sentiment?" arrives with
  Ask on Contacts (delivery 2).
- **Phones** (below 768px). The list is full width; a person opens as their
  own screen with a "‹ Contacts" back link that keeps the filters. Rendered
  conditionally, not hidden with CSS.
- **Organisation page ties.** A person's name on the People tab opens
  `/contacts/:id`; a call there with nothing to read says "Not enough to
  analyse" and a pending one shows no sentiment.

### Overlays
```

**Find** in `docs/04-app-flow.md`:

```text
| `/contacts/{list,:id}` | `ContactsList`, `ContactDetails` | auth |
```

**Replace with:**

```text
| `/contacts`, `/contacts/:id` | `ContactsPage`: the list with its summary line and filters (`q`, `customer`, `account`, `sentiment`, `role` in the URL), and the chosen person's profile beside it (`GET /contacts/`, `GET /contacts/<id>/`, `GET /contacts/<id>/history/`); on phones the person is its own screen with a back link. `/contacts/list` redirects to `/contacts` | auth |
```

**Find** in `.agents/workflows/repo-architecture.md`:

```text
│   │   ├── contacts/           ← ContactsTable, ActionBar, MetricsPanel
```

**Replace with:**

```text
│   │   ├── contacts/           ← ContactsToolbar, ContactList(Item), ContactProfile, HistoryItems, ContactFormModal
```

**Find** in `.agents/workflows/repo-architecture.md`:

```text
│       ├── contacts/           ← Contacts list
```

**Replace with:**

```text
│       ├── contacts/           ← ContactsPage (list + profile), ContactsFrame
```

**Find** in `.agents/workflows/repo-architecture.md`:

```text
├── contacts/
│   ├── (index)                → Redirects to /contacts/list
│   └── list                   → ContactsList
```

**Replace with:**

```text
├── contacts                   → ContactsPage (list + profile panel)
├── contacts/:id               → ContactsPage, that person chosen
├── contacts/list              → Redirects to /contacts
```

**Find** in `.agents/workflows/repo-architecture.md`:

```text
### 5. Contacts (`pages/contacts/List.tsx`)

Simple contacts list view.

**`components/contacts/`:**
- `ContactsTable.tsx` — contacts data grid
- `ActionBar.tsx` — search and filters
- `MetricsPanel.tsx` — contact count metrics
```

**Replace with:**

```text
### 5. Contacts (`pages/contacts/ContactsPage.tsx`)

A list and a profile panel (spec 2026-09-28 §3). `/contacts/:id` chooses a
person; the filters live in the URL (`features/contacts/contactsParams.ts`).
State is in `customersSlice` (`fetchAllContacts`, `loadMoreContacts`,
`fetchContactById`, `fetchContactHistory`); the backend shapes are in
`features/contacts/contactsTypes.ts` and the words and tones in
`features/contacts/contactsFormat.ts`. `ContactsFrame` leaves a slot for the
Ask rail (delivery 2).

**`components/contacts/`:**
- `ContactsToolbar.tsx` — summary line, search, organisation/account/sentiment/role filters, + Add
- `ContactList.tsx`, `ContactListItem.tsx` — the list, its states and Load more
- `ContactProfile.tsx`, `HistoryItems.tsx` — the chosen person, their sentiment and why, calls, emails and tickets
- `ContactFormModal.tsx`, `ContactRowActionsPopover.tsx` — shared with the account page
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run src/e2e/contacts.test.tsx --maxWorkers=2`
Expected: PASS — 1 test.

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add .agents/workflows/repo-architecture.md docs/03-ui-ux-design.md docs/04-app-flow.md src/e2e/contacts.test.tsx
git commit -m "test(contacts): the Contacts journey end to end; docs for the redesigned page" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Final verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Whole test suite, one process**

Run: `npx vitest run --maxWorkers=2`
Expected: every file passes, 0 failed (the dry run: 314 files, 2638 tests).

- [ ] **Step 2: Types**

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors, and no more warnings than on the spec commit (16, all `react-hooks/set-state-in-effect` in older files). None of the new files may appear in the output.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `tsc -b && vite build` completes and writes `dist/` (the existing chunk-size warning is not new).

- [ ] **Step 5: Other routes unchanged**

Run: `git diff 3d7e3e7 --stat -- src/components/shared src/pages/accounts src/components/accounts`
Expected: no changes listed. The account page's Contacts tab (`components/shared/ContactsTab.tsx`) and the Accounts pages are untouched; `ContactFormModal` changed only where its role list comes from (Task 1).

- [ ] **Step 6: If anything failed**

Fix with superpowers:systematic-debugging, commit the fix as `fix(contacts): <what>` with the Co-Authored-By line, and repeat Steps 1–5 until all pass. Use superpowers:verification-before-completion before reporting.

---

### Task 12: Controller browser check at 1440px and 375px, both themes

Run by the controller, not a subagent, after the backend delivery-1 PR is merged and running locally (`revenact-backend` on its usual port) and `npm run dev` is up. Use the claude-in-chrome tools, loaded in one ToolSearch call that includes `resize_window`. Take a screenshot at each checkpoint.

- [ ] **Step 1: Pick the data.** Sign in as an admin. Find an organisation with at least one account, a person on the account and one on the organisation, and a person with analysed calls, a call with nothing to read ("Call", no summary) and, if possible, an email and a ticket.

- [ ] **Step 2: 1440px, light theme, `/contacts`.**
  - The top bar reads "Contacts", transparent, with no avatar. There is no table and there are no stat cards.
  - The summary line reads "N people · N decision makers · N% positive · N negative", in DM Mono figures.
  - Search, Organisation, Account (disabled until an organisation is chosen), Sentiment, Role and + Add sit on one row.
  - Each list item shows initials, name and role, "Organisation › Account" (or the organisation alone), the sentiment word in its colour with "n calls", and last contacted.
  - "Choose a person" fills the right pane.
  - Scroll to the end: "Load more (25 of N)" appears when there are more than 25, and loads the next page.

- [ ] **Step 3: Filters and URL.** Choose an organisation, then one of its accounts, a sentiment and a role; type a search. The URL carries `customer`, `account`, `sentiment`, `role` and `q`, and the summary follows. Reload: everything is restored. Choose a different organisation: the account clears. With nobody matching, "Nobody matches" offers Clear filters, which empties the URL.

- [ ] **Step 4: The profile.** Click a person: the URL becomes `/contacts/<id>?<filters>`, the item is highlighted, and the list and profile scroll separately. The profile should show:
  - the name (22px) and role
  - "Organisation › Account" as links: the organisation opens `/organizations/<id>`, and the account opens it with that account's chip chosen
  - email and phone links
  - "Sentiment and why" in words, with no "Why this sentiment?" button
  - calls newest first, each with its date, sentiment or "Not enough to analyse" (and nothing for a pending call), a summary that expands from the title, the classification, host and length, the tag and the recording
  - then emails and tickets

  Edit changes the name in both the profile and the list. Delete, after confirming, returns to the list without the person, with the summary one lower.

- [ ] **Step 5: + Add.** Add a person to an organisation: the form is the existing one, and the list and summary include them afterwards.

- [ ] **Step 6: 1440px, dark theme.** Repeat Steps 2 and 4 visually. Every surface, pill, tag, dot and focus ring is legible, and there is no raw white or black.

- [ ] **Step 7: 375px, light and dark.**
  - The list is full width with no profile pane, and there is no horizontal scroll.
  - The filters sit in two columns under a full-width search, and every control is at least 44px.
  - Tapping a person opens their profile as its own screen with "‹ Contacts" at the top. The back link returns to the list with the filters kept.
  - Controls use 15px text on phones (13px from `sm`), as the organisation page's search does.

- [ ] **Step 8: The organisation page.** On `/organizations/<id>` People, a person's name links to `/contacts/<id>`, which opens their profile. On Files, a call with nothing to read says "Not enough to analyse", and a pending call shows no sentiment.

- [ ] **Step 9: Old links.** `/contacts/list` lands on `/contacts`. A person the viewer cannot open (for example, a user blind to an account visiting a person on it) reads "This person is not here…" with Try again.

- [ ] **Step 10: Record.** Note anything off as a follow-up, or fix it on this branch (with a test) before the PR.

---

## Self-review

**Spec coverage.**
- §3 layout, a list and a profile panel like the Communications inbox: Task 8 (`ContactsPage`, two panes from 768px, solid surfaces).
- §3 header: the summary line is in Task 1 (`contactsSummaryParts`) and Task 5 (`ContactsToolbar`); search and the four filters are in the URL (Task 1 `contactsParams`, Task 5, Task 8 `change`); "+ Add" is Task 5, and Task 8 opens `ContactFormModal`.
- §3 list: the item is Task 4 (initials, name, role, "Org › Account", sentiment word and colour, "n calls", last contacted); Load more is Task 2 (`loadMoreContacts`) and Task 4 (`MoreButton`); the empty, loading and error states are Task 4.
- §3 profile: Task 7 covers `/contacts/:id` (Task 8 routes), the name, role, sanitised email and phone links, the organisation and account links with `?account=`, and sentiment and why. "Why this sentiment?" is hidden (decision 1). Calls come newest first with date, title, reading, expandable summary, classification, host and tag (Task 6), then emails and tickets (Task 6). Edit and Delete use the existing flows (Task 7).
- §3 phones: the full-width list, the profile as its own screen with a back link, rendered conditionally (Task 8, with phone tests).
- §3 removed: the table, stat cards and old profile page (Task 9); the old route now opens the panel (Task 8, `contacts/:id?`, and the `/contacts/list` redirect).
- §5 ties: the People name link and "Not enough to analyse" on the Calls section (Task 3); the profile links back to the organisation and account chip (Task 7).
- §7 frontend tests:
  - unit tests for the list item (Task 4), the profile (Task 7) and the call row (Task 6, and `CallItem` in Task 3)
  - integration through the real store and router with contract-shaped `fetch` (Tasks 2, 7 and 8)
  - the jsdom end-to-end test (Task 10)
  - house rules over the new files (Task 8)
- Leaving room for the rail: `ContactsFrame` has a `rail` slot and the pass-through context (Task 8), and the Navbar's framed bar renders the actions slot where delivery 2's pill portals.
- Backend notes: `customer` rather than `company` is sent (Task 1 `contactsApiPath`); `fetchContactInteractions` is retired (Task 9); `analysis` is on the organisation page's calls (Task 3).

**Placeholder scan.** No TBD, TODO or "similar to Task N" remains. Every code step carries complete file contents or an exact find and replace, and every command gives its expected result.

**Type consistency.**
- `ContactsParams` keys (`q, customer, account, sentiment, role`) match across Tasks 1, 5 and 8.
- `readingOf({analysis?, sentiment})` has the same signature in Tasks 1, 3 and 6.
- `ContactList` props match in Tasks 4 and 8.
- `ContactsToolbar` props match in Tasks 5 and 8.
- `ContactProfile({id, onDeleted})` matches in Tasks 7 and 8.
- `fetchContactHistory(id: number)` and `loadMoreContacts(next: string)` match in Tasks 2, 7 and 8.
- `CONTACT_NOT_FOUND` is defined in Task 2 and asserted in Tasks 2 and 7.
- `stubContactsApi` options (`people, histories, pageSize, failList, failHistory`) match their uses in Tasks 2, 5, 7, 8 and 10.

**Dry run (2026-09-28).** Tasks 1–10 were applied verbatim, task by task, to a throwaway clone of `feat/contacts-redesign` at `3d7e3e7`. For each task, the tests were applied first and their failure recorded; then the implementation, with the task's tests and `npx tsc -b` passing. Task 11 then passed in full: `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint` (16 warnings, as before) and `npm run build`.

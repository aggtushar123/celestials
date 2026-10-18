# Two-way Gmail, delivery 1 ("sync engine"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the delivery 1 Gmail engine to people and staff:
- **Connections › Your mailbox** (`MailboxSection`): address, Two-way, Push, import progress, last synced, the paused reason, Sync now (queued for Google), Reconnect, Disconnect with the 30-day explanation, the kept-copies line after a disconnect, the pre-OAuth gates and every callback refusal;
- **Communications › mailbox** (`MailboxView`, `MailList`, `MailDetail`): Cc and Bcc, Gmail user labels as chips, attachment chips (metadata only), the HTML body in a sandboxed frame with remote images blocked until "Show images", the import and paused notices, and a clear `409 MAILBOX_PAUSED` on every send path;
- **Platform portal:** the per-workspace "Google two-way mail" switch with a required reason, and connected Google mailboxes against the 100 test-user cap, platform-wide and per workspace.

**Architecture:**
- **`features/mail`** gains the contract's fields on `mailSlice.ts` (connection, `disconnected`, provider gates, queued sync) and `mailboxSlice.ts` (cc, bcc, labels, attachments, HTML, summary progress); `mailText.ts` holds every sentence (no React); `useMailboxPolling.ts` reads the connection again while a queued sync or the import runs; `testMail.ts` is a stateful fetch stub shaped like the contract.
- **`components/integrations/MailboxSection.tsx`** is rebuilt on the UI primitives (`Card`, `TYPE`, `BUTTON`, `PRIMARY`, `DANGER`, `INPUT`) and reads the OAuth outcome through `useLocation`.
- **`pages/communications`** gains `MailLabels.tsx` (`LabelChips`), `MailAttachments.tsx`, `MailHtmlBody.tsx` with `mailHtml.ts` (the sandboxed document), and `MailboxNotice.tsx`; `MailList`, `MailDetail` and `MailboxView` use them.
- **Platform:** `platformSlice.ts` gains `gmail` blocks and `setGmailTwoWay`; a new `GmailTwoWayCard.tsx` on the organisation page; a tile on the overview; a column on the list.
- No new dependency. `GET mail/labels/` is **not** wired: nothing in D1's UI reads it (Decision 5).

**Tech Stack:**
- React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Vite 8;
- Redux Toolkit, react-router 7, Tailwind v4 tokens (`src/index.css`), lucide-react 1.46;
- Vitest 5 with Testing Library (jsdom) and `@testing-library/user-event` 14.

**Spec:** `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §1 (gates, connecting, disconnecting), §4 ("Communications › Mail" HTML/labels/attachments, "Settings › My mailbox", "Platform portal", phone width), §5 ("Deliveries 1", testing).

**API contract (binding; its "Decisions made in this contract" override the spec):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-be/docs/superpowers/plans/2026-10-10-gmail-sync-api.md`. It wins on shapes, field names, codes and sentences. Sections used: §1 (gates, callback, portal), §2 (scopes, `needs_reconnect`), §3 (my mailbox, sync, paused sends), §6 (read endpoints, HTML policy), §9 (Outlook and IMAP values), §11 (not in D1).

**House style and the code this plan extends:** `docs/superpowers/plans/2026-10-09-ui-ops.md` (the Communications shell on the primitives) and `docs/superpowers/plans/2026-10-08-agents-drafts-frontend.md` (refusals in the server's words, `DraftForm`).

Read the spec sections, the contract and this plan before starting.

## Global Constraints

- **Worktree and branch:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-fe`, branch `feat/gmail-two-way`. All paths below are relative to it. The D1 backend PR merges first; this PR follows it.
- **`node_modules`:** if the worktree has none, link the main checkout's: `ln -s ../../react-ts-app/node_modules node_modules` (it is gitignored). Never commit it.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees; make a WIP commit to set work aside). `git add` explicit paths only, never `-A` or `.`. Never push.
- **Commands:** one task: `npx vitest run <paths> --maxWorkers=2`; lint: `npm run lint`; types and bundle: `npm run build`; everything: `npx vitest run --maxWorkers=4`. Run them in the foreground.
- **Commits:** conventional (`feat(mail): ...`, `feat(comms): ...`, `feat(platform): ...`, `test(e2e): ...`, `docs: ...`), imperative, lowercase subject, and every message ends with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Field names exactly as the contract:** `two_way`, `needs_reconnect`, `granted_scopes`, `import` (`state`, `imported`, `total_estimate`, `done_at`), `push`, `paused_reason`, `disconnected` (`provider`, `address`, `disconnected_at`, `delete_after`), `providers[].gate`, `filed`, `queued`, `cc`, `bcc`, `labels` (`id`, `name`, `color` `{background, text}` or null), `has_attachments`, `html_body`, `attachments` (`id`, `filename`, `mime_type`, `size`, `is_inline`, `content_id`, `available`), portal `gmail` (`enabled`, `connected`, `paused`; overview `enabled_workspaces`, `connected`, `test_user_cap`).
- **Codes exactly as the contract:** gates `GMAIL_NOT_ENABLED`, `MEMBER_SUSPENDED`, `NO_SEAT`, `NO_VERIFIED_DOMAIN`; callback `WRONG_DOMAIN`, `SCOPES_MISSING`, `ADDRESS_IN_USE`, `GOOGLE_DENIED`; sends `MAILBOX_PAUSED` (409); paused reasons `no_seat`, `suspended`, `workspace_off`, `token_revoked`.
- **Contract sentences verbatim** where the contract gives them (gate and callback messages, the reconnect banners). The sentences this plan writes itself live in `src/features/mail/mailText.ts` and nowhere else.
- **Owner-only stays owner-only:** nothing here shows another person's mailbox, labels or attachments; the portal shows counts only, never an address beyond what it already lists, never mail content.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, no `rgb()`, no named Tailwind palette colour in any `.tsx`. Gmail's label colour is data from the API applied through `style`, never a literal in source (Decision 4).
- **Type and weight:** sizes 11/13/15/22 px only, through `TYPE` (`src/components/ui/type.ts`) where a role fits; `font-normal` and `font-semibold` only (no `font-bold`, no `font-medium`). Never append a colour after a `TYPE` string; write the size classes out instead (`text-[13px] leading-5 text-danger-ink`).
- **Figures:** `NUM` (`tabular-nums`, body font) around the figure only; a sentence with figures goes through `Figured` (`src/components/brain/Figured.tsx`). `font-mono-brand` never.
- **Kinso look:** warm canvas, monochrome primary (`PRIMARY`, one per form), bordered quiet cards (`Card`, no shadow, no card inside a card), `divide-y divide-line-subtle` lists, Lucide icons with `aria-hidden="true"`, no emoji, warnings are `text-ink` with an icon (never amber text). Inside the Communications glass shell everything stays flat.
- **Targets and states:** every button, link, select and input reaches 44px below `sm` (`BUTTON`, `QUIET`, `PRIMARY`, `DANGER`, `ICON_BUTTON`, `INPUT`, `SWITCH`); every list has loading, empty and error states; a `role="status"` region stays mounted between updates.
- **No em dash (U+2014)** in any line this plan adds (code, comments, tests, docs copy). Existing lines that hold one stay byte-identical.
- **Phone width (375px):** no horizontal scroll; action rows wrap (`flex-wrap`); the mailbox facts are a one-column `divide-y` list; the HTML frame is `w-full`; chips wrap; the list and the open message each fill the pane with Back between them (as today).
- **The UI ratchet** (`src/test/uiRatchet.test.ts`) holds every count **exactly** at its baseline. Task 2 lowers it (MailboxSection's offences go to zero); no other task may change any count.
- **Tests:** the repo's three tiers (`.claude/skills/testing/SKILL.md`): unit and integration with Vitest and Testing Library; **end-to-end is jsdom journeys in `src/e2e/`**, not Playwright (Decision 1). Fetch is stubbed only at the network boundary (`vi.stubGlobal('fetch', spy)`), with contract-shaped bodies; the store is real. Fake timers only as `vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })`, advanced inside `act` with `advanceTimersByTimeAsync` (the `DraftPanel.test.tsx` pattern).
- **Out of scope (contract §11):** the outbox and every write-back to Gmail, the thread view, the label sidebar and `?label=`, bulk actions, keyboard shortcuts, attachment download or preview, drafts both ways, threaded Reply all and Forward, CC/BCC on send, the signature, "Search older mail in Gmail", any Outlook or IMAP change, calendar.

## Decisions (where the brief, the spec or the contract leaves a choice)

1. **End-to-end tests are jsdom journeys, not Playwright.** The brief asked for Playwright; the repo's `testing` skill says the e2e tier is `src/e2e/<flow>.test.tsx` on jsdom ("Don't reach for Playwright/Cypress"), and `package.json` has no Playwright test runner (only `@playwright/cli` for screenshots). The journeys in Task 8 drive the real routes, store and components with `user-event`, and stub only `fetch`. The one real-Gmail live check the spec asks for before merge is an owner step, listed in Task 10.
2. **Remote images are blocked with a CSP `<meta>` in the frame's `srcdoc`, not by rewriting `img src`.** Why:
   - CSP is enforced by the browser on every way HTML can fetch: `<img src>`, `srcset`, `<picture>`, the legacy `background=` attribute, inline `style="background:url(...)"`, `<style>` blocks with `url()` and `@import`, fonts. A `src` rewrite misses most of these, and the contract keeps inline `style` and `<style>` blocks.
   - It is the contract's own design (§6): `img-src cid: data:` until "Show images", then `img-src https:`.
   - "Show images" only swaps one policy string; the sanitised HTML is never parsed or edited in the browser.
   - The policy before the click is `default-src 'none'; style-src 'unsafe-inline'; img-src cid: data:; font-src data:`, after it the same with `img-src https: cid: data:`. Scripts, frames, connections and remote fonts stay blocked either way. `http:` images never load (mixed content on the https app anyway) and do not raise the "Show images" line.
3. **The frame's sandbox is `allow-popups allow-popups-to-escape-sandbox`, never `allow-scripts` or `allow-same-origin`.** A link in mail opens in a new tab (`<base target="_blank">`, and the server adds `rel="noopener noreferrer"`); nothing in the mail runs or reaches the app's origin. Without same-origin the app cannot measure the document, so the frame fills the reading pane (`flex-1`, at least `min-h-80`) and scrolls inside. The document is painted on `Canvas`/`CanvasText` with `color-scheme: light` (system colours, no hex), so mail written for a white page stays readable in dark mode.
4. **Label chips are neutral pills with Gmail's colour as a dot.** The pill is tokens (`bg-subtle text-ink-muted`), so it reads in both themes; the dot carries the label's own Gmail background colour through `style`, as the person's own categorical key (the same reasoning as the mailbox's category dots). The colour is applied only when it matches `#rrggbb`; otherwise the dot is `bg-ink-faint`. A row shows at most two chips and "+N"; the open message shows all of them.
5. **`GET mail/labels/` is not wired in D1.** Every message already carries its resolved `labels`; the only reader of the list is the D2 sidebar. YAGNI.
6. **Callback refusals are shown in this app's words, keyed by `code`.** The words are the contract's sentences verbatim (`mailText.ts`). The URL's `detail` is used only for `WRONG_DOMAIN`, because only the server knows the verified domains, and only when it has the contract's shape (`Connect your <domain>[, <domain>| or <domain>]... account.`, up to three); anything else falls back to "Connect a Google account on your workspace's verified domain.", so a crafted link cannot put its own sentence on the page. `?mailbox=error&detail=` keeps today's behaviour.
7. **`MailboxSection` reads the outcome through `useLocation()`,** not `window.location`. `/integrations` redirects to `/settings/connections` with its query (`KeepLocation`), and the router's location is the one that redirect changes; tests drive it with `MemoryRouter`. `Integrations.test.tsx` gains a `MemoryRouter` because of it.
8. **Sync now for Google is queued (202), so the screen waits for the tick.** On `queued: true` the slice remembers `last_synced_at` and `useMailboxPolling` reads `GET mail/connection/` every 5 s until `last_synced_at` moves, the connection errors or pauses, or two minutes pass. The button reads "Syncing…" meanwhile. Outlook and IMAP stay inline (200), as today. While the import runs, the Connections card reads the connection every 15 s so "Importing mail: N of about M" moves; `done` is final and polling stops.
9. **`409 MAILBOX_PAUSED` shows the server's sentence plus the next step** ("Ask Revenact support to turn Gmail back on.", "Ask an admin.", "Ask an admin for a seat.", "Reconnect Google in Settings › Connections."), on every send path: compose (`sendEmail`), the mailbox reply, the queue reply and a draft's Send. The draft form also shows its existing "Open Connections" link for it. The contract gives the `workspace_off` sentence only; the others come from the server as they are.
10. **The portal switch is a card with a required reason,** not a bare toggle: the reason is required (contract §1), as on Suspend. "Turn on" is the card's `PRIMARY`, "Turn off" is `DANGER`. The card shows this workspace's connected and paused counts and the platform-wide "Google test users, all workspaces: N of 100" (from `GET platform/overview/`, read by the card). The overview gains a "Google mailboxes" tile; the organisations list gains a "Gmail" column ("Off", or the connected count with paused in brackets).
11. **Attachments are text chips** (Paperclip, name, extension, size), not controls, and inline parts are left out. No "Download comes soon" copy: nothing invites a click, so nothing needs explaining.
12. **The callback refusals for the pre-OAuth gates appear twice by design:** `providers[].gate` replaces the "Connect Google" button with the gate's sentence before anyone clicks, and a `403` from `POST mail/connect/google/` (the gate changed since the page loaded) shows the server's `detail` in the card's alert.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/features/mail/mailSlice.ts` | Modify | Connection types, `disconnected`, gates, queued sync state, `syncWaitExpired` |
| `src/features/mail/mailboxSlice.ts` | Modify | Message, label, attachment and summary types |
| `src/features/mail/mailText.ts` | Create | Every sentence for D1 mail (gates, refusals, paused, import, push, disconnect, paused sends) |
| `src/features/mail/useMailboxPolling.ts` | Create | Reads the connection again while a queued sync or the import runs |
| `src/features/mail/testMail.ts` | Create | Contract fixtures and the stateful `/mail/*` stub |
| `src/features/mail/mailSlice.test.ts` | Create | Reducer tests |
| `src/features/mail/mailText.test.ts` | Create | Word tests |
| `src/features/mail/pausedSend.test.ts` | Create | The three send thunks on 409 |
| `src/components/integrations/MailboxSection.tsx` | Rewrite | Connections › Your mailbox |
| `src/components/integrations/MailboxSection.test.tsx` | Rewrite | Its integration tests |
| `src/components/integrations/houseRules.test.ts` | Create | House and foundations rules for the section |
| `src/pages/integrations/Integrations.test.tsx` | Modify | Wrap in `MemoryRouter` |
| `src/test/uiRatchet.test.ts` | Modify | Lower the baseline |
| `src/pages/communications/MailLabels.tsx` | Create | `LabelChips` |
| `src/pages/communications/MailAttachments.tsx` | Create | Attachment chips |
| `src/pages/communications/mailHtml.ts` | Create | The frame's document and CSPs |
| `src/pages/communications/MailHtmlBody.tsx` | Create | The sandboxed frame and Show images |
| `src/pages/communications/MailboxNotice.tsx` | Create | Import and paused notice under the mailbox header |
| `src/pages/communications/mailWho.ts` | Modify | `people()` for Cc and Bcc |
| `src/pages/communications/MailList.tsx` | Modify | Label chips and the paperclip on rows |
| `src/pages/communications/MailDetail.tsx` | Modify | Cc, Bcc, labels, attachments, HTML |
| `src/pages/communications/MailboxView.tsx` | Modify | Notice, queued sync |
| `src/pages/communications/*.test.tsx` | Create/modify | Unit and integration tests |
| `src/features/communications/communicationsSlice.ts` | Modify | Paused reply words |
| `src/components/agents/DraftForm.tsx` | Modify | Paused send words and the Connections link |
| `src/features/platform/platformSlice.ts` | Modify | `gmail` blocks, `setGmailTwoWay` |
| `src/pages/platform/GmailTwoWayCard.tsx` | Create | The switch card |
| `src/pages/platform/PlatformOrganisationDetail.tsx` | Modify | Mount the card |
| `src/pages/platform/PlatformOverview.tsx` | Modify | The tile |
| `src/pages/platform/PlatformOrganisations.tsx` | Modify | The column |
| `src/pages/platform/houseRules.test.ts` | Create | Rules for the new card |
| `src/pages/platform/Platform.test.tsx` | Modify | Fixtures and tests |
| `src/e2e/gmail.test.tsx` | Create | The five journeys |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | Modify | Product and flow docs |

Task order: 1 first; 2 needs 1; 3 needs 1; 4 needs 3; 5 needs 1 and 2 (the hook); 6 needs 1; 7 is independent of 2 to 6; 8 needs all before it; 9 and 10 last.

---

### Task 1: Mail data: contract types, slice state, words and the stub

**Files:**
- Modify: `src/features/mail/mailSlice.ts`
- Modify: `src/features/mail/mailboxSlice.ts` (types only)
- Create: `src/features/mail/mailText.ts`
- Create: `src/features/mail/testMail.ts`
- Modify: `src/pages/communications/MailboxView.test.tsx` (the `invoice` fixture gains the new row fields so `draftRow: MailMessage` still type-checks)
- Test: `src/features/mail/mailSlice.test.ts`, `src/features/mail/mailText.test.ts`

**Interfaces:**
- Produces (from `mailSlice.ts`): `GmailGate`, `PausedReason`, `MailProviderOption` (+ `gate`), `MailImport`, `MailboxConnection` (+ `two_way`, `needs_reconnect`, `granted_scopes`, `import`, `push`, `paused_reason`), `DisconnectedMailbox`, `MailboxPayload`; state `disconnected`, `syncQueued`, `syncQueuedFrom`; action `syncWaitExpired()`; `syncMailbox` returns `MailboxConnection & { filed: number | null; queued?: boolean }`.
- Produces (from `mailboxSlice.ts`): `MailLabel`, `MailAttachmentMeta`; `MailMessage` (+ `cc`, `bcc`, `labels`, `has_attachments`); `MailMessageDetail` (+ `html_body`, `attachments`); `MailSummary` (+ `import`, `paused_reason`).
- Produces (from `mailText.ts`): `GATE_COPY`, `REFUSED_FALLBACK`, `WRONG_DOMAIN_FALLBACK`, `refusalCopy(code, detail)`, `pausedLine(reason)`, `pausedNotice(reason)`, `RECONNECT_TWO_WAY`, `RECONNECT_REVOKED`, `reconnectBanner(connection)`, `importLine(imp)`, `twoWayText(on)`, `pushText(on)`, `DISCONNECT_GOOGLE`, `DISCONNECT_OTHER`, `disconnectedLine(d)`, `PAUSED_SEND_FALLBACK`, `pausedSendMessage(err)`, `sendFailure(err, fallback)`.
- Produces (from `testMail.ts`): `GOOGLE`, `OUTLOOK`, `PROVIDERS`, `MAIL_DETAIL`, `MAIL_ROW`, `MAIL_SUMMARY`, `MailStubState`, `stubMail(initial?) => { state, spy }`.

- [ ] **Step 1: Write the failing reducer tests**

Create `src/features/mail/mailSlice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import reducer, { disconnectMailbox, fetchMailbox, syncMailbox, syncWaitExpired } from './mailSlice';
import { GOOGLE, OUTLOOK, PROVIDERS } from './testMail';

// Unit tier: the reducer alone, fed the thunks' own action creators with
// contract-shaped payloads (contract §3).

const base = reducer(undefined, { type: '@@init' });
const loaded = (connection = GOOGLE) => reducer(base, fetchMailbox.fulfilled({ connection, disconnected: null, providers: PROVIDERS }, 'r'));

describe('mailSlice: the connection', () => {
  it('keeps the disconnected block and the provider gates from GET mail/connection/', () => {
    const disconnected = { provider: 'google' as const, address: 'dana@doughco.com', disconnected_at: '2026-10-10T10:00:00Z', delete_after: '2026-11-09T10:00:00Z' };
    const gated = PROVIDERS.map((p) => (p.key === 'google' ? { ...p, gate: 'GMAIL_NOT_ENABLED' as const } : p));
    const state = reducer(base, fetchMailbox.fulfilled({ connection: null, disconnected, providers: gated }, 'r'));
    expect(state.connection).toBeNull();
    expect(state.disconnected).toEqual(disconnected);
    expect(state.providers[0].gate).toBe('GMAIL_NOT_ENABLED');
  });

  it('reads a missing disconnected block as null', () => {
    const state = reducer(base, fetchMailbox.fulfilled({ connection: GOOGLE, providers: PROVIDERS } as never, 'r'));
    expect(state.disconnected).toBeNull();
  });
});

describe('mailSlice: Sync now', () => {
  it('queues a Google sync and waits until last_synced_at moves', () => {
    let state = reducer(loaded(), syncMailbox.fulfilled({ ...GOOGLE, filed: null, queued: true }, 'r'));
    expect(state.syncQueued).toBe(true);
    expect(state.syncQueuedFrom).toBe(GOOGLE.last_synced_at);
    expect(state.connection).toEqual(GOOGLE);
    state = reducer(state, fetchMailbox.fulfilled({ connection: GOOGLE, disconnected: null, providers: PROVIDERS }, 'r'));
    expect(state.syncQueued).toBe(true);
    state = reducer(state, fetchMailbox.fulfilled({ connection: { ...GOOGLE, last_synced_at: '2026-10-10T09:20:00Z' }, disconnected: null, providers: PROVIDERS }, 'r'));
    expect(state.syncQueued).toBe(false);
    expect(state.syncQueuedFrom).toBeNull();
  });

  it('never queues an inline sync (Outlook, IMAP)', () => {
    const state = reducer(loaded(OUTLOOK), syncMailbox.fulfilled({ ...OUTLOOK, filed: 3 }, 'r'));
    expect(state.syncQueued).toBe(false);
    expect(state.connection).toEqual(OUTLOOK);
  });

  it('stops waiting when the connection pauses or errors', () => {
    const queued = reducer(loaded(), syncMailbox.fulfilled({ ...GOOGLE, filed: null, queued: true }, 'r'));
    const paused = reducer(queued, fetchMailbox.fulfilled({ connection: { ...GOOGLE, paused_reason: 'workspace_off' }, disconnected: null, providers: PROVIDERS }, 'r'));
    expect(paused.syncQueued).toBe(false);
    const errored = reducer(queued, fetchMailbox.fulfilled({ connection: { ...GOOGLE, status: 'error', error: 'Google access was revoked. Reconnect Google.' }, disconnected: null, providers: PROVIDERS }, 'r'));
    expect(errored.syncQueued).toBe(false);
  });

  it('gives up on syncWaitExpired, and a disconnect clears any wait', () => {
    const queued = reducer(loaded(), syncMailbox.fulfilled({ ...GOOGLE, filed: null, queued: true }, 'r'));
    expect(reducer(queued, syncWaitExpired()).syncQueued).toBe(false);
    const gone = reducer(queued, disconnectMailbox.fulfilled(undefined, 'r'));
    expect(gone.connection).toBeNull();
    expect(gone.syncQueued).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing word tests**

Create `src/features/mail/mailText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import {
  RECONNECT_REVOKED,
  RECONNECT_TWO_WAY,
  REFUSED_FALLBACK,
  WRONG_DOMAIN_FALLBACK,
  disconnectedLine,
  importLine,
  pausedLine,
  pausedNotice,
  pausedSendMessage,
  reconnectBanner,
  refusalCopy,
  sendFailure,
} from './mailText';

describe('refusalCopy (contract §1)', () => {
  it('says each callback refusal in the contract words', () => {
    expect(refusalCopy('GOOGLE_DENIED', null)).toBe("Google didn't grant access. Either you cancelled, or this Google account isn't on Revenact's test-user list yet: ask Revenact support.");
    expect(refusalCopy('SCOPES_MISSING', null)).toBe('Revenact needs all the Gmail permissions on the consent screen. Connect again and leave them all ticked.');
    expect(refusalCopy('ADDRESS_IN_USE', null)).toBe('This Google account is already connected by someone else in Revenact.');
    expect(refusalCopy('NO_SEAT', null)).toBe('You need a seat in this workspace to connect Gmail. Ask an admin.');
    expect(refusalCopy('GMAIL_NOT_ENABLED', null)).toBe("Your workspace isn't enabled for Gmail yet: ask Revenact support.");
  });

  it('shows the server WRONG_DOMAIN sentence only in its own shape', () => {
    expect(refusalCopy('WRONG_DOMAIN', 'Connect your pizzahut.com account.')).toBe('Connect your pizzahut.com account.');
    expect(refusalCopy('WRONG_DOMAIN', 'Connect your pizzahut.com or pizzahut.co.uk account.')).toBe('Connect your pizzahut.com or pizzahut.co.uk account.');
    expect(refusalCopy('WRONG_DOMAIN', 'Connect your a.com, b.com or c.com account.')).toBe('Connect your a.com, b.com or c.com account.');
    expect(refusalCopy('WRONG_DOMAIN', 'Call +1 555 0100 to unlock your account.')).toBe(WRONG_DOMAIN_FALLBACK);
    expect(refusalCopy('WRONG_DOMAIN', null)).toBe(WRONG_DOMAIN_FALLBACK);
  });

  it('falls back for an unknown or missing code', () => {
    expect(refusalCopy('SOMETHING_NEW', 'anything')).toBe(REFUSED_FALLBACK);
    expect(refusalCopy(null, null)).toBe(REFUSED_FALLBACK);
  });
});

describe('the connection words', () => {
  it('says why sync is paused, leaving token_revoked to the banner', () => {
    expect(pausedLine('workspace_off')).toBe("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.");
    expect(pausedLine('suspended')).toBe('Sync is paused: your access to this workspace is suspended. Ask an admin.');
    expect(pausedLine('no_seat')).toBe('Sync is paused: you no longer hold a seat in this workspace. Ask an admin.');
    expect(pausedLine('token_revoked')).toBeNull();
    expect(pausedLine(null)).toBeNull();
    expect(pausedNotice('token_revoked')).toBe('Google access was revoked. Reconnect it in Settings › Connections.');
    expect(pausedNotice('no_seat')).toBe(pausedLine('no_seat'));
  });

  it('picks the reconnect banner from paused_reason (contract §2)', () => {
    expect(reconnectBanner({ needs_reconnect: false, paused_reason: null })).toBeNull();
    expect(reconnectBanner({ needs_reconnect: true, paused_reason: null })).toBe(RECONNECT_TWO_WAY);
    expect(reconnectBanner({ needs_reconnect: true, paused_reason: 'token_revoked' })).toBe(RECONNECT_REVOKED);
    expect(RECONNECT_TWO_WAY).toBe('Reconnect to turn on two-way');
    expect(RECONNECT_REVOKED).toBe('Google access was revoked: reconnect');
  });

  it('says the import with "about", and done is final (contract decision 16)', () => {
    expect(importLine({ state: 'importing', imported: 4210, total_estimate: 18000, done_at: null })).toBe('Importing mail: 4,210 of about 18,000');
    expect(importLine({ state: 'importing', imported: 4210, total_estimate: null, done_at: null })).toBe('Importing mail: 4,210 so far');
    expect(importLine({ state: 'importing', imported: 19000, total_estimate: 18000, done_at: null })).toBe('Importing mail: 19,000 so far');
    expect(importLine({ state: 'done', imported: 9800, total_estimate: 18000, done_at: '2026-10-10T11:00:00Z' })).toBe('Mail from the last 12 months is imported.');
    expect(importLine(null)).toBeNull();
  });

  it('says what a Google disconnect keeps, with both dates', () => {
    expect(disconnectedLine({ provider: 'google', address: 'dana@doughco.com', disconnected_at: '2026-10-10T10:00:00Z', delete_after: '2026-11-09T10:00:00Z' })).toBe(
      'dana@doughco.com was disconnected on 10 Oct 2026. Your copies of its mail are kept until 9 Nov 2026: reconnect the same account before then to keep them.',
    );
  });
});

describe('pausedSendMessage (contract §3)', () => {
  const paused = (reason: string, detail = "Your Gmail connection is paused: your workspace isn't enabled for Gmail.") =>
    new ApiError(409, { code: 'MAILBOX_PAUSED', detail, paused_reason: reason }, detail);

  it('adds the next step to the server sentence', () => {
    expect(pausedSendMessage(paused('workspace_off'))).toBe("Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.");
    expect(pausedSendMessage(paused('token_revoked', 'Paused.'))).toBe('Paused. Reconnect Google in Settings › Connections.');
    expect(pausedSendMessage(paused('no_seat', 'Paused.'))).toBe('Paused. Ask an admin for a seat.');
    expect(pausedSendMessage(paused('suspended', 'Paused.'))).toBe('Paused. Ask an admin.');
  });

  it('is null for anything that is not MAILBOX_PAUSED', () => {
    expect(pausedSendMessage(new ApiError(409, { code: 'NO_MAILBOX', detail: 'Connect your mailbox to send this.' }, 'x'))).toBeNull();
    expect(pausedSendMessage(new Error('x'))).toBeNull();
    expect(sendFailure(new ApiError(502, { detail: 'Gmail is down.' }, 'Gmail is down.'), 'fallback')).toBe('Gmail is down.');
    expect(sendFailure(new Error('x'), 'Could not send.')).toBe('Could not send.');
    expect(sendFailure(paused('workspace_off'), 'x')).toContain('Ask Revenact support');
  });
});
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `npx vitest run src/features/mail/mailSlice.test.ts src/features/mail/mailText.test.ts --maxWorkers=2`
Expected: FAIL, "Failed to resolve import ./testMail" and "./mailText".

- [ ] **Step 4: Extend the message types in `mailboxSlice.ts`**

At the top of `src/features/mail/mailboxSlice.ts`, below the `apiClient` import, add:

```ts
import type { MailImport, PausedReason } from './mailSlice';
```

Add after `MailAccount`:

```ts
/** A Gmail user label, resolved by the server (contract §6). `id` is
 *  Revenact's MailLabel id; `color` is Gmail's pair, or null. */
export interface MailLabel {
  id: number;
  name: string;
  color: { background: string; text: string } | null;
}

/** One MIME part's details; the file itself arrives with delivery 2, so
 *  `available` is always false in D1. */
export interface MailAttachmentMeta {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
  is_inline: boolean;
  content_id: string;
  available: boolean;
}
```

In `MailMessage`, after `to: [string, string][];` add:

```ts
  /** Gmail rows from D1 on; `[]` for Outlook, IMAP and older Gmail rows (contract decision 14). */
  cc: [string, string][];
  bcc: [string, string][];
  labels: MailLabel[];
  has_attachments: boolean;
```

Replace `MailMessageDetail` with:

```ts
export interface MailMessageDetail extends MailMessage {
  body: string;
  /** Sanitised at store; "" when there is none or it was too large: show `body`. */
  html_body: string;
  attachments: MailAttachmentMeta[];
}
```

In `MailSummary`, after `last_synced_at: string | null;` add:

```ts
  /** null without a live Google mailbox. */
  import: MailImport | null;
  paused_reason: PausedReason | null;
```

- [ ] **Step 5: Extend `mailSlice.ts`**

Replace the type block from `export type MailProviderKey` down to the end of `interface MailboxConnection` with:

```ts
export type MailProviderKey = 'google' | 'microsoft' | 'imap';

/** The pre-OAuth gates, first failure first (contract §1). */
export type GmailGate = 'GMAIL_NOT_ENABLED' | 'MEMBER_SUSPENDED' | 'NO_SEAT' | 'NO_VERIFIED_DOMAIN';

/** Why a Google mailbox is not syncing (contract decision 23). */
export type PausedReason = 'no_seat' | 'suspended' | 'workspace_off' | 'token_revoked';

export interface MailProviderOption {
  key: MailProviderKey;
  label: string;
  uses_oauth: boolean;
  /** Google only: the first failing pre-OAuth gate, shown instead of Connect. */
  gate: GmailGate | null;
}

/** The 12-month import. `total_estimate` is Gmail's messagesTotal for the
 *  whole mailbox, so the screen says "about"; `done` is final. */
export interface MailImport {
  state: 'importing' | 'done';
  imported: number;
  total_estimate: number | null;
  done_at: string | null;
}

export interface MailboxConnection {
  id: number;
  provider: MailProviderKey;
  provider_display: string;
  address: string;
  display_name: string;
  status: 'connected' | 'error';
  error: string;
  last_synced_at: string | null;
  created_at: string;
  two_way: boolean;
  needs_reconnect: boolean;
  granted_scopes: string[];
  /** null for Outlook and IMAP. */
  import: MailImport | null;
  push: boolean;
  paused_reason: PausedReason | null;
}

/** A Google mailbox disconnected within the last 30 days: its personal
 *  copies are kept until `delete_after` (contract decision 9). */
export interface DisconnectedMailbox {
  provider: MailProviderKey;
  address: string;
  disconnected_at: string;
  delete_after: string;
}

export interface MailboxPayload {
  connection: MailboxConnection | null;
  disconnected: DisconnectedMailbox | null;
  providers: MailProviderOption[];
}

type SyncExtras = { filed?: number | null; queued?: boolean };
```

In `interface MailState`, after `connection: MailboxConnection | null;` add:

```ts
  disconnected: DisconnectedMailbox | null;
  /** A Google Sync now answered 202: waiting for the loop's tick. */
  syncQueued: boolean;
  /** `last_synced_at` when it was queued; the wait ends when it moves. */
  syncQueuedFrom: string | null;
```

In `initialState`, after `connection: null,` add:

```ts
  disconnected: null,
  syncQueued: false,
  syncQueuedFrom: null,
```

Replace the `fetchMailbox` thunk's generic `{ connection: MailboxConnection | null; providers: MailProviderOption[] }` with `MailboxPayload`.

Replace the `syncMailbox` thunk with:

```ts
/** Google answers 202 with `queued: true` (the loop runs the tick); Outlook
 *  and IMAP sync inline and answer 200 with `filed` (contract §3). */
export const syncMailbox = createAsyncThunk<MailboxConnection & { filed: number | null; queued?: boolean }, void, { rejectValue: string }>(
  'mail/sync',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch('/mail/sync/', { method: 'POST', body: {} });
    } catch (err) {
      return rejectWithValue(message(err, 'Sync failed.'));
    }
  },
);
```

Replace the slice's `reducers` with:

```ts
  reducers: {
    clearSendError(state) {
      state.sendError = null;
    },
    /** Two minutes without the tick landing: stop saying "Syncing…". */
    syncWaitExpired(state) {
      state.syncQueued = false;
      state.syncQueuedFrom = null;
    },
  },
```

Replace the `fetchMailbox.fulfilled` case with:

```ts
      .addCase(fetchMailbox.fulfilled, (state, action) => {
        state.connection = action.payload?.connection ?? null;
        state.disconnected = action.payload?.disconnected ?? null;
        state.providers = Array.isArray(action.payload?.providers) ? action.payload.providers : [];
        state.loaded = true;
        state.error = null;
        const c = state.connection;
        if (state.syncQueued && (!c || c.last_synced_at !== state.syncQueuedFrom || c.status === 'error' || Boolean(c.paused_reason))) {
          state.syncQueued = false;
          state.syncQueuedFrom = null;
        }
      })
```

Replace the `disconnectMailbox.fulfilled` case with:

```ts
      .addCase(disconnectMailbox.fulfilled, (state) => {
        state.connection = null;
        state.syncQueued = false;
        state.syncQueuedFrom = null;
      })
```

Replace the `syncMailbox.fulfilled` case with:

```ts
      .addCase(syncMailbox.fulfilled, (state, action) => {
        state.saving = false;
        const answer: MailboxConnection & SyncExtras = { ...action.payload };
        const queued = answer.queued === true;
        delete answer.filed;
        delete answer.queued;
        state.connection = answer;
        if (queued) {
          state.syncQueued = true;
          state.syncQueuedFrom = answer.last_synced_at;
        }
      })
```

Change the last export line to:

```ts
export const { clearSendError, syncWaitExpired } = mailSlice.actions;
```

- [ ] **Step 6: Write the words**

Create `src/features/mail/mailText.ts`:

```ts
// Every sentence of two-way Gmail, delivery 1 (contract revenact-backend
// docs/superpowers/plans/2026-10-10-gmail-sync-api.md). No React here.
// Where the contract gives a sentence it is copied verbatim.

import { ApiError } from '../../lib/apiClient';
import { formatDate } from '../customers/formatters';
import type { DisconnectedMailbox, GmailGate, MailboxConnection, MailImport, PausedReason } from './mailSlice';

/** The pre-OAuth gates (contract §1), shown instead of Connect Google. */
export const GATE_COPY: Record<GmailGate, string> = {
  GMAIL_NOT_ENABLED: "Your workspace isn't enabled for Gmail yet: ask Revenact support.",
  MEMBER_SUSPENDED: "Your access to this workspace is suspended, so Gmail can't be connected.",
  NO_SEAT: 'You need a seat in this workspace to connect Gmail. Ask an admin.',
  NO_VERIFIED_DOMAIN: 'Your workspace has no verified domain yet, so no Google account can connect. An admin can verify one in Settings.',
};

const CALLBACK_COPY: Record<string, string> = {
  ...GATE_COPY,
  SCOPES_MISSING: 'Revenact needs all the Gmail permissions on the consent screen. Connect again and leave them all ticked.',
  ADDRESS_IN_USE: 'This Google account is already connected by someone else in Revenact.',
  GOOGLE_DENIED: "Google didn't grant access. Either you cancelled, or this Google account isn't on Revenact's test-user list yet: ask Revenact support.",
};

export const REFUSED_FALLBACK = 'Google refused the connection.';
export const WRONG_DOMAIN_FALLBACK = "Connect a Google account on your workspace's verified domain.";

/** The server's WRONG_DOMAIN sentence names up to three verified domains. */
const WRONG_DOMAIN = /^Connect your [a-z0-9.-]+(?:(?:, | or )[a-z0-9.-]+){0,2} account\.$/;

/** `?mailbox=refused&code=&detail=` in this app's words (Decision 6). */
export function refusalCopy(code: string | null, detail: string | null): string {
  if (code === 'WRONG_DOMAIN') return detail && WRONG_DOMAIN.test(detail) ? detail : WRONG_DOMAIN_FALLBACK;
  return (code ? CALLBACK_COPY[code] : undefined) ?? REFUSED_FALLBACK;
}

const PAUSED_COPY: Record<Exclude<PausedReason, 'token_revoked'>, string> = {
  workspace_off: "Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.",
  suspended: 'Sync is paused: your access to this workspace is suspended. Ask an admin.',
  no_seat: 'Sync is paused: you no longer hold a seat in this workspace. Ask an admin.',
};

/** The Connections card's status line; token_revoked has the banner instead. */
export function pausedLine(reason: PausedReason | null): string | null {
  if (!reason || reason === 'token_revoked') return null;
  return PAUSED_COPY[reason];
}

/** The mailbox header's notice, where there is no banner. */
export function pausedNotice(reason: PausedReason): string {
  return reason === 'token_revoked' ? 'Google access was revoked. Reconnect it in Settings › Connections.' : PAUSED_COPY[reason];
}

export const RECONNECT_TWO_WAY = 'Reconnect to turn on two-way';
export const RECONNECT_REVOKED = 'Google access was revoked: reconnect';

/** Contract §2: the banner comes from paused_reason. */
export function reconnectBanner(connection: Pick<MailboxConnection, 'needs_reconnect' | 'paused_reason'>): string | null {
  if (!connection.needs_reconnect) return null;
  return connection.paused_reason === 'token_revoked' ? RECONNECT_REVOKED : RECONNECT_TWO_WAY;
}

const count = (n: number) => n.toLocaleString('en-GB');

/** The import line; "about" because the total is the whole mailbox. */
export function importLine(imp: MailImport | null): string | null {
  if (!imp) return null;
  if (imp.state === 'done') return 'Mail from the last 12 months is imported.';
  if (imp.total_estimate !== null && imp.total_estimate > imp.imported) {
    return `Importing mail: ${count(imp.imported)} of about ${count(imp.total_estimate)}`;
  }
  return `Importing mail: ${count(imp.imported)} so far`;
}

export const twoWayText = (on: boolean) => (on ? 'On' : 'Off: read-only');
export const pushText = (on: boolean) => (on ? 'On: new mail arrives within seconds' : 'Off: checked every minute');

export const DISCONNECT_GOOGLE =
  'Revenact stops syncing and gives up its access to this Google account. Mail already filed on customers stays. Your own copies of this mailbox are deleted after 30 days, unless you reconnect the same account before then.';
export const DISCONNECT_OTHER = 'Revenact stops syncing this mailbox and deletes your own copies of it now. Mail already filed on customers stays.';

export function disconnectedLine(d: DisconnectedMailbox): string {
  return `${d.address} was disconnected on ${formatDate(d.disconnected_at.slice(0, 10))}. Your copies of its mail are kept until ${formatDate(d.delete_after.slice(0, 10))}: reconnect the same account before then to keep them.`;
}

const PAUSED_NEXT: Record<PausedReason, string> = {
  workspace_off: 'Ask Revenact support to turn Gmail back on.',
  suspended: 'Ask an admin.',
  no_seat: 'Ask an admin for a seat.',
  token_revoked: 'Reconnect Google in Settings › Connections.',
};

export const PAUSED_SEND_FALLBACK = 'Your Gmail connection is paused, so nothing was sent.';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A 409 MAILBOX_PAUSED from a send: the server's sentence and the next
 *  step (Decision 9); null for any other error. */
export function pausedSendMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409 || !isRecord(err.body) || err.body.code !== 'MAILBOX_PAUSED') return null;
  const detail = typeof err.body.detail === 'string' && err.body.detail ? err.body.detail : PAUSED_SEND_FALLBACK;
  const reason = err.body.paused_reason;
  const next = typeof reason === 'string' && reason in PAUSED_NEXT ? PAUSED_NEXT[reason as PausedReason] : '';
  return next ? `${detail} ${next}` : detail;
}

/** Any send's failure: the paused words, else the server's, else `fallback`. */
export function sendFailure(err: unknown, fallback: string): string {
  return pausedSendMessage(err) ?? (err instanceof ApiError ? err.message : fallback);
}
```

- [ ] **Step 7: Write the stub**

Create `src/features/mail/testMail.ts`:

```ts
// Test-only: contract-shaped fixtures and a stateful stub of revenact-backend's
// /api/v1/mail/* for the two-way Gmail tests (contract
// docs/superpowers/plans/2026-10-10-gmail-sync-api.md). Tests change `state`
// between polls; every answer is a JSON copy. Anything else the pages ask for
// (Communications' queue and stats, connectors, the Copilot rail) gets an
// empty answer.

import { vi } from 'vitest';
import { GATE_COPY } from './mailText';
import type { DisconnectedMailbox, GmailGate, MailboxConnection, MailProviderOption, PausedReason } from './mailSlice';
import type { MailMessage, MailMessageDetail, MailSummary } from './mailboxSlice';

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const GOOGLE: MailboxConnection = {
  id: 12,
  provider: 'google',
  provider_display: 'Google Workspace / Gmail',
  address: 'dana@doughco.com',
  display_name: 'Dana Ruiz',
  status: 'connected',
  error: '',
  last_synced_at: '2026-10-10T09:14:05Z',
  created_at: '2026-10-10T08:01:44Z',
  two_way: true,
  needs_reconnect: false,
  granted_scopes: ['gmail.modify', 'gmail.send', 'gmail.compose'],
  import: { state: 'importing', imported: 4210, total_estimate: 18000, done_at: null },
  push: true,
  paused_reason: null,
};

/** Contract §9: Outlook and IMAP carry the new fields at their quiet values. */
export const OUTLOOK: MailboxConnection = {
  ...GOOGLE,
  id: 13,
  provider: 'microsoft',
  provider_display: 'Microsoft 365 / Outlook',
  two_way: false,
  needs_reconnect: false,
  granted_scopes: [],
  import: null,
  push: false,
  paused_reason: null,
};

export const PROVIDERS: MailProviderOption[] = [
  { key: 'google', label: 'Google Workspace / Gmail', uses_oauth: true, gate: null },
  { key: 'microsoft', label: 'Microsoft 365 / Outlook', uses_oauth: true, gate: null },
  { key: 'imap', label: 'IMAP / SMTP', uses_oauth: false, gate: null },
];

export const MAIL_DETAIL: MailMessageDetail = {
  id: 1,
  thread_id: 't1',
  direction: 'received',
  from_name: 'Ann Lee',
  from_address: 'ann@pizzahut.com',
  to: [['Dana Ruiz', 'dana@doughco.com']],
  cc: [['Sam Pizza', 'sam@pizzahut.com']],
  bcc: [],
  subject: 'Renewal quote',
  snippet: 'Quote attached.',
  sent_at: '2026-10-09T09:00:00Z',
  folder: 'inbox',
  category: 'general',
  state: 'open',
  is_read: false,
  is_starred: false,
  is_important: false,
  priority: false,
  account: { id: 3, name: 'Pizza Hut', type: 'customer' },
  labels: [
    { id: 7, name: 'Renewals', color: { background: '#16a766', text: '#ffffff' } },
    { id: 9, name: 'Vendors/Billing', color: null },
    { id: 11, name: 'Q4', color: null },
  ],
  has_attachments: true,
  body: 'Hi Dana,\nQuote attached.\nAnn',
  html_body: '<div style="font-family:Arial"><p>Hi Dana,</p><p>Quote attached.</p><img src="https://cdn.pizzahut.com/sig.png" alt="Pizza Hut"></div>',
  attachments: [
    { id: 31, filename: 'Renewal quote.pdf', mime_type: 'application/pdf', size: 182311, is_inline: false, content_id: '', available: false },
    { id: 32, filename: 'logo.png', mime_type: 'image/png', size: 2048, is_inline: true, content_id: 'logo@pizzahut', available: false },
  ],
};

function rowOf(detail: MailMessageDetail): MailMessage {
  const row: Partial<MailMessageDetail> = copy(detail);
  delete row.body;
  delete row.html_body;
  delete row.attachments;
  return row as MailMessage;
}

export const MAIL_ROW: MailMessage = rowOf(MAIL_DETAIL);

export const MAIL_SUMMARY: MailSummary = {
  has_mailbox: true,
  address: 'dana@doughco.com',
  last_synced_at: '2026-10-10T09:14:05Z',
  import: { state: 'importing', imported: 4210, total_estimate: 18000, done_at: null },
  paused_reason: null,
  folders: { inbox: 1, drafts: 0, sent: 0, done: 0, muted: 0 },
  unread: 1,
  categories: [],
};

export interface MailStubState {
  connection: MailboxConnection | null;
  disconnected: DisconnectedMailbox | null;
  providers: MailProviderOption[];
  /** A pre-OAuth refusal from POST mail/connect/google/ (403). */
  connectRefusal: GmailGate | null;
  messages: MailMessageDetail[];
  summary: MailSummary;
}

// The contract gives the workspace_off sentence; the others stand in for the server's.
const PAUSED_DETAIL: Record<PausedReason, string> = {
  workspace_off: "Your Gmail connection is paused: your workspace isn't enabled for Gmail.",
  suspended: 'Your Gmail connection is paused: your access to this workspace is suspended.',
  no_seat: 'Your Gmail connection is paused: you no longer hold a seat.',
  token_revoked: 'Your Gmail connection is paused: Google access was revoked.',
};

export function stubMail(initial: Partial<MailStubState> = {}) {
  const state: MailStubState = {
    connection: copy(GOOGLE),
    disconnected: null,
    providers: copy(PROVIDERS),
    connectRefusal: null,
    messages: [copy(MAIL_DETAIL)],
    summary: copy(MAIL_SUMMARY),
    ...initial,
  };
  const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => copy(body) });
  const paused = () => {
    const reason = state.connection?.paused_reason;
    return reason ? json(409, { code: 'MAILBOX_PAUSED', detail: PAUSED_DETAIL[reason], paused_reason: reason }) : null;
  };
  const spy = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    if (path === '/mail/connection/' && method === 'GET') {
      return json(200, { connection: state.connection, disconnected: state.disconnected, providers: state.providers });
    }
    if (path === '/mail/connection/' && method === 'DELETE') {
      const gone = state.connection;
      state.connection = null;
      state.disconnected =
        gone?.provider === 'google' ? { provider: 'google', address: gone.address, disconnected_at: '2026-10-10T10:00:00Z', delete_after: '2026-11-09T10:00:00Z' } : null;
      return Promise.resolve({ ok: true, status: 204, json: async () => null });
    }
    if (path === '/mail/connect/imap/' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { address: string };
      state.connection = { ...copy(OUTLOOK), id: 14, provider: 'imap', provider_display: 'IMAP / SMTP', address: body.address };
      return json(201, state.connection);
    }
    const connect = /^\/mail\/connect\/(google|microsoft)\/$/.exec(path);
    if (connect && method === 'POST') {
      if (connect[1] === 'google' && state.connectRefusal) return json(403, { code: state.connectRefusal, detail: GATE_COPY[state.connectRefusal] });
      return json(200, { authorize_url: `https://accounts.example/${connect[1]}?state=x` });
    }
    if (path === '/mail/sync/' && method === 'POST') {
      if (!state.connection) return json(400, { detail: 'No mailbox connected.' });
      if (state.connection.provider !== 'google') return json(200, { ...state.connection, filed: 0 });
      return paused() ?? json(202, { ...state.connection, filed: null, queued: true });
    }
    if (path === '/mail/messages/summary/') return json(200, state.summary);
    const reply = /^\/mail\/messages\/(\d+)\/reply\/$/.exec(path);
    if (reply && method === 'POST') {
      const original = state.messages.find((m) => m.id === Number(reply[1]));
      return paused() ?? json(201, { ...original, id: 99, direction: 'sent', folder: 'sent' });
    }
    const one = /^\/mail\/messages\/(\d+)\/$/.exec(path);
    if (one) {
      const message = state.messages.find((m) => m.id === Number(one[1]));
      if (!message) return json(404, { detail: 'Not found.' });
      if (method === 'PATCH') Object.assign(message, JSON.parse(String(init?.body ?? '{}')));
      return json(200, message);
    }
    if (path === '/mail/messages/') {
      const results = state.messages.map(rowOf);
      return json(200, { count: results.length, next: null, previous: null, results });
    }
    if (path === '/communications/stats/') {
      return json(200, { counts: { email: 0, question: 0, ticket: 0, call: 0 }, total: 0, oldest_waiting_days: null, stale_questions: 0, has_mailbox: true, scope: 'mine', ticket_scope_note: '' });
    }
    if (path.startsWith('/communications/')) return json(200, { count: 0, next: null, previous: null, results: [], truncated: false, mode: 'needs', scope: 'mine' });
    if (path.startsWith('/connectors/') || path.startsWith('/copilot/conversations/')) return json(200, []);
    return json(200, {});
  });
  vi.stubGlobal('fetch', spy);
  return { state, spy };
}
```

- [ ] **Step 8: Keep the existing mailbox fixture on the contract**

In `src/pages/communications/MailboxView.test.tsx`, in the `invoice` object, after the line `to: [['Dana', 'dana@acme.io']] as [string, string][],` add:

```ts
  cc: [] as [string, string][],
  bcc: [] as [string, string][],
  labels: [],
  has_attachments: false,
```

and in the `summary` object, after `last_synced_at: '2026-09-21T10:00:00Z',` add:

```ts
  import: null,
  paused_reason: null,
```

Every detail answer in its `mockApi` must carry the detail's new fields too, because `MailDetail` reads `message.attachments` and `message.html_body` from Task 3 on. Replace these four lines of `mockApi`:

```ts
    if (url.includes('/mail/messages/1/') && overrides.draft) return ok({ ...draftRow, body: 'Your plan renews on 1 October. Nothing to do.' });
    if (url.includes('/mail/messages/1/') && init?.method === 'PATCH') return ok({ ...invoice, ...JSON.parse(String(init.body)), body: 'Your plan renews on 1 October. Nothing to do.' });
    if (url.includes('/mail/messages/1/')) return ok({ ...invoice, body: 'Your plan renews on 1 October. Nothing to do.' });
    if (url.includes('/mail/messages/2/')) return ok({ ...pizza, body: 'Can we talk Thursday? Sam' });
```

with:

```ts
    if (url.includes('/mail/messages/1/') && overrides.draft) return ok({ ...draftRow, body: 'Your plan renews on 1 October. Nothing to do.', html_body: '', attachments: [] });
    if (url.includes('/mail/messages/1/') && init?.method === 'PATCH') return ok({ ...invoice, ...JSON.parse(String(init.body)), body: 'Your plan renews on 1 October. Nothing to do.', html_body: '', attachments: [] });
    if (url.includes('/mail/messages/1/')) return ok({ ...invoice, body: 'Your plan renews on 1 October. Nothing to do.', html_body: '', attachments: [] });
    if (url.includes('/mail/messages/2/')) return ok({ ...pizza, body: 'Can we talk Thursday? Sam', html_body: '', attachments: [] });
```

(They are not adjacent in the file; edit each where it stands. Leave the reply answer `ok({ ...pizza, id: 9, ... }, 201)` alone: a reply's answer never becomes the open message.)

- [ ] **Step 9: Run the tests to make sure they pass**

Run: `npx vitest run src/features/mail/mailSlice.test.ts src/features/mail/mailText.test.ts src/pages/communications/MailboxView.test.tsx --maxWorkers=2`
Expected: PASS.

Run: `npm run build`
Expected: exit 0 (every typed fixture still matches the widened types).

- [ ] **Step 10: Commit**

```bash
git add src/features/mail/mailSlice.ts src/features/mail/mailboxSlice.ts src/features/mail/mailText.ts src/features/mail/testMail.ts src/features/mail/mailSlice.test.ts src/features/mail/mailText.test.ts src/pages/communications/MailboxView.test.tsx
git commit -m "feat(mail): two-way gmail types, queued sync state and words

The D1 contract's connection, message and summary fields, the
disconnected block and provider gates, a queued Sync now that waits for
last_synced_at to move, every sentence in mailText.ts, and a stateful
/mail/* stub for the tests.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Connections › Your mailbox

**Files:**
- Create: `src/features/mail/useMailboxPolling.ts`
- Rewrite: `src/components/integrations/MailboxSection.tsx`
- Rewrite: `src/components/integrations/MailboxSection.test.tsx`
- Create: `src/components/integrations/houseRules.test.ts`
- Modify: `src/pages/integrations/Integrations.test.tsx` (MemoryRouter)
- Modify: `src/test/uiRatchet.test.ts` (baseline)

**Interfaces:**
- Consumes: everything Task 1 produces from `mailSlice.ts`, `mailText.ts`, `testMail.ts`; `calls` and `sent` from `src/features/agents/testAgents.ts`; `ConfirmDialog` (`src/components/organizations/ConfirmDialog.tsx`, `onConfirm` may throw a string); `Figured`.
- Produces: `useMailboxPolling({ whileImporting }: { whileImporting: boolean }): void`, `SYNC_POLL_MS = 5000`, `SYNC_POLL_LIMIT = 24`, `IMPORT_POLL_MS = 15000` (Task 5 uses the hook with `whileImporting: false`). `MailboxSection` keeps its name and takes no props.

- [ ] **Step 1: Write the failing integration tests**

Replace `src/components/integrations/MailboxSection.test.tsx` with:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import mailReducer from '../../features/mail/mailSlice';
import { calls, sent } from '../../features/agents/testAgents';
import { GOOGLE, OUTLOOK, PROVIDERS, stubMail } from '../../features/mail/testMail';
import { MailboxSection } from './MailboxSection';

// Integration tier: the real mail slice and the section, behind a router
// that carries the OAuth outcome; only fetch is stubbed (stubMail), shaped
// like contract §1 and §3.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderSection(url = '/settings/connections') {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  const store = configureStore({ reducer: { auth: authReducer, mail: mailReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <MailboxSection />
      </MemoryRouter>
    </Provider>,
  );
  return { store, assign };
}

/** The value beside a fact's name in the mailbox details. */
function fact(name: string): string | null {
  return screen.getByText(name, { selector: 'dt' }).nextElementSibling?.textContent ?? null;
}

const DONE = { state: 'done' as const, imported: 9800, total_estimate: 18000, done_at: '2026-10-10T08:30:00Z' };

describe('MailboxSection: a Google mailbox', () => {
  it('shows the address, two-way, push, the import and when it last synced', async () => {
    stubMail();
    renderSection();
    expect(await screen.findByText('dana@doughco.com')).toBeInTheDocument();
    await waitFor(() => expect(fact('Import')).toBe('Importing mail: 4,210 of about 18,000'));
    expect(fact('Status')).toBe('Connected');
    expect(fact('Two-way')).toBe('On');
    expect(fact('Push')).toBe('On: new mail arrives within seconds');
    expect(fact('Last synced')).toBe('10 Oct 2026');
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  it('reads the import again every 15 seconds until it is done, then stops', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { state, spy } = stubMail();
    renderSection();
    await waitFor(() => expect(fact('Import')).toBe('Importing mail: 4,210 of about 18,000'));
    state.connection!.import = { ...DONE };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    await waitFor(() => expect(fact('Import')).toBe('Mail from the last 12 months is imported.'));
    const reads = calls(spy, 'GET', '/mail/connection/').length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(calls(spy, 'GET', '/mail/connection/')).toHaveLength(reads);
  });

  it('queues Sync now, says Syncing… and asks every 5 seconds until the tick has run', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { state, spy } = stubMail({ connection: { ...GOOGLE, import: { ...DONE } } });
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Sync now' }));
    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled();
    state.connection!.last_synced_at = '2026-10-10T09:20:00Z';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled();
    expect(calls(spy, 'POST', '/mail/sync/')).toHaveLength(1);
    expect(calls(spy, 'GET', '/mail/connection/')).toHaveLength(3);
  });

  it('stops waiting after two minutes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { spy } = stubMail({ connection: { ...GOOGLE, import: { ...DONE } } });
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Sync now' }));
    await screen.findByRole('button', { name: 'Syncing…' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 5000);
    });
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled();
    expect(calls(spy, 'GET', '/mail/connection/')).toHaveLength(25);
  });

  it('says why sync is paused and offers no Sync now', async () => {
    stubMail({ connection: { ...GOOGLE, paused_reason: 'workspace_off' } });
    renderSection();
    await waitFor(() => expect(fact('Status')).toBe("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support."));
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });

  it('asks a read-only connection to reconnect for two-way, and Reconnect Google goes to Google', async () => {
    stubMail({ connection: { ...GOOGLE, two_way: false, needs_reconnect: true, granted_scopes: [] } });
    const { assign } = renderSection();
    expect(await screen.findByText('Reconnect to turn on two-way')).toBeInTheDocument();
    expect(fact('Two-way')).toBe('Off: read-only');
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect Google' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.example/google?state=x'));
  });

  it('says when Google access was revoked', async () => {
    stubMail({ connection: { ...GOOGLE, status: 'error', error: 'Google access was revoked. Reconnect Google.', needs_reconnect: true, paused_reason: 'token_revoked' } });
    renderSection();
    expect(await screen.findByText('Google access was revoked: reconnect')).toBeInTheDocument();
    expect(fact('Status')).toBe('Needs attention: Google access was revoked. Reconnect Google.');
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });

  it('explains the 30 days before disconnecting, then says what is kept', async () => {
    const { spy } = stubMail();
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = screen.getByRole('dialog', { name: 'Disconnect dana@doughco.com?' });
    expect(dialog).toHaveTextContent('deleted after 30 days');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    expect(
      await screen.findByText(
        'dana@doughco.com was disconnected on 10 Oct 2026. Your copies of its mail are kept until 9 Nov 2026: reconnect the same account before then to keep them.',
      ),
    ).toBeInTheDocument();
    expect(calls(spy, 'DELETE', '/mail/connection/')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Connect Google Workspace / Gmail' })).toBeInTheDocument();
  });
});

describe('MailboxSection: connecting', () => {
  it.each([
    ['WRONG_DOMAIN', 'Connect your pizzahut.com account.', 'Connect your pizzahut.com account.'],
    ['WRONG_DOMAIN', 'Call +1 555 0100 to unlock your account.', "Connect a Google account on your workspace's verified domain."],
    ['GOOGLE_DENIED', '', "Google didn't grant access. Either you cancelled, or this Google account isn't on Revenact's test-user list yet: ask Revenact support."],
    ['SCOPES_MISSING', '', 'Revenact needs all the Gmail permissions on the consent screen. Connect again and leave them all ticked.'],
    ['ADDRESS_IN_USE', '', 'This Google account is already connected by someone else in Revenact.'],
    ['NO_SEAT', '', 'You need a seat in this workspace to connect Gmail. Ask an admin.'],
  ])('says why Google refused (%s)', async (code, detail, words) => {
    stubMail({ connection: null });
    renderSection(`/settings/connections?mailbox=refused&code=${code}&detail=${encodeURIComponent(detail)}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(words);
  });

  it("keeps today's error outcome", async () => {
    stubMail({ connection: null });
    renderSection('/settings/connections?mailbox=error&detail=denied');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect: denied');
  });

  it('shows the gate instead of Connect Google, and still offers Outlook', async () => {
    stubMail({ connection: null, providers: PROVIDERS.map((p) => (p.key === 'google' ? { ...p, gate: 'GMAIL_NOT_ENABLED' as const } : p)) });
    renderSection();
    expect(await screen.findByText("Your workspace isn't enabled for Gmail yet: ask Revenact support.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Google Workspace / Gmail' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Connect Microsoft 365 / Outlook' })).toBeInTheDocument();
  });

  it('shows a refusal from Connect Google in the server words and stays here', async () => {
    stubMail({ connection: null, connectRefusal: 'NO_SEAT' });
    const { assign } = renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Connect Google Workspace / Gmail' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You need a seat in this workspace to connect Gmail. Ask an admin.');
    expect(assign).not.toHaveBeenCalled();
  });

  it('connects IMAP with labelled fields and shows the connection', async () => {
    const { spy } = stubMail({ connection: null, providers: [PROVIDERS[2]] });
    renderSection();
    expect(await screen.findByText(/Google and Microsoft sign-in are not set up/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect another mailbox (IMAP/SMTP)' }));
    await userEvent.type(screen.getByLabelText('Email address'), 'dana@acme.io');
    await userEvent.type(screen.getByLabelText('Password or app password'), 'app-pass');
    await userEvent.type(screen.getByLabelText('IMAP host'), 'imap.acme.io');
    await userEvent.type(screen.getByLabelText('SMTP host'), 'smtp.acme.io');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('dana@acme.io')).toBeInTheDocument();
    expect(sent(spy, 'POST', '/mail/connect/imap/')).toEqual([
      { address: 'dana@acme.io', password: 'app-pass', imap_host: 'imap.acme.io', imap_port: 993, smtp_host: 'smtp.acme.io', smtp_port: 587 },
    ]);
  });
});

describe('MailboxSection: Outlook and IMAP keep today', () => {
  it('shows no two-way, push or import, and Sync now runs inline', async () => {
    const { spy } = stubMail({ connection: { ...OUTLOOK } });
    renderSection();
    expect(await screen.findByText('Microsoft 365 / Outlook')).toBeInTheDocument();
    expect(screen.queryByText('Two-way', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText('Push', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText('Import', { selector: 'dt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(calls(spy, 'POST', '/mail/sync/')).toHaveLength(1));
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('explains that an Outlook disconnect deletes the copies now', async () => {
    stubMail({ connection: { ...OUTLOOK } });
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('deletes your own copies of it now');
  });
});
```

Create `src/components/integrations/houseRules.test.ts`:

```ts
import { houseRuleSuite, uiRuleSuite } from '../../test/houseRules';

// Connections › Your mailbox, rebuilt on the primitives for two-way Gmail D1:
// every house rule and every foundations rule. The rest of this folder
// (ConnectSourceForm) waits for its own round.
const files = import.meta.glob('./MailboxSection.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

houseRuleSuite('Connections › Your mailbox: house rules', files);
uiRuleSuite('Connections › Your mailbox: foundations rules', files);
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/components/integrations --maxWorkers=2`
Expected: FAIL (no "Import" fact, no "Reconnect", the house rules find `font-bold` and `text-[12px]`).

- [ ] **Step 3: Write the polling hook**

Create `src/features/mail/useMailboxPolling.ts`:

```ts
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchMailbox, syncWaitExpired } from './mailSlice';

/** How often a queued Sync now asks whether the tick has run. */
export const SYNC_POLL_MS = 5000;
/** Asks before giving up on a queued sync: two minutes. */
export const SYNC_POLL_LIMIT = 24;
/** How often a running import's progress is read again. */
export const IMPORT_POLL_MS = 15000;

/** Reads GET mail/connection/ again while a queued Sync now has not landed
 *  (every 5 s, at most two minutes) and, with `whileImporting`, while the
 *  12-month import runs (every 15 s). Nothing polls otherwise (Decision 8). */
export function useMailboxPolling({ whileImporting }: { whileImporting: boolean }) {
  const dispatch = useAppDispatch();
  const syncQueued = useAppSelector((state) => state.mail?.syncQueued ?? false);
  const importing = useAppSelector((state) => state.mail?.connection?.import?.state === 'importing');
  const watchImport = whileImporting && importing;

  useEffect(() => {
    if (!syncQueued && !watchImport) return;
    let asks = 0;
    const timer = setInterval(
      () => {
        asks += 1;
        void dispatch(fetchMailbox());
        if (syncQueued && asks >= SYNC_POLL_LIMIT) dispatch(syncWaitExpired());
      },
      syncQueued ? SYNC_POLL_MS : IMPORT_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [dispatch, syncQueued, watchImport]);
}
```

- [ ] **Step 4: Rebuild the section**

Replace `src/components/integrations/MailboxSection.tsx` with:

```tsx
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { CircleAlert, RefreshCw, Unplug } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import {
  connectImap,
  disconnectMailbox,
  fetchMailbox,
  startOAuth,
  syncMailbox,
  type MailboxConnection,
  type MailProviderKey,
} from '../../features/mail/mailSlice';
import {
  DISCONNECT_GOOGLE,
  DISCONNECT_OTHER,
  GATE_COPY,
  disconnectedLine,
  importLine,
  pausedLine,
  pushText,
  reconnectBanner,
  refusalCopy,
  twoWayText,
} from '../../features/mail/mailText';
import { useMailboxPolling } from '../../features/mail/useMailboxPolling';
import { formatDate } from '../../features/customers/formatters';
import { Figured } from '../brain/Figured';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { BUTTON, Card, CardHeader, DANGER, INPUT, LoadingState, PRIMARY, QUIET, TYPE } from '../ui';

const ALERT = 'text-[13px] leading-5 font-semibold text-danger-ink';
const FACT = 'flex items-baseline justify-between gap-3 py-2';
const VALUE = 'text-[13px] leading-5 text-right text-ink';
const DANGER_VALUE = 'text-[13px] leading-5 text-right text-danger-ink';

function statusOf(c: MailboxConnection): { text: string; danger: boolean } {
  if (c.status === 'error') return { text: `Needs attention: ${c.error}`, danger: true };
  const paused = pausedLine(c.paused_reason);
  if (paused) return { text: paused, danger: false };
  return { text: c.error || 'Connected', danger: false };
}

/**
 * "Your mailbox": the one connection that is personal rather than the
 * organisation's. Google and Microsoft go through OAuth (the backend bounces
 * back to /integrations?mailbox=connected|refused|error, which redirects
 * here with its query); anything else takes an IMAP/SMTP login. A Google
 * mailbox is two-way Gmail (contract 2026-10-10-gmail-sync-api.md): its
 * import, push, pauses and the 30 days its copies are kept after a
 * disconnect are shown here. Only its owner and their chain read it.
 */
export function MailboxSection() {
  const dispatch = useAppDispatch();
  const { connection, disconnected, providers, loaded, saving, error, syncQueued } = useAppSelector((s) => s.mail);
  const [showImap, setShowImap] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState({ address: '', password: '', imap_host: '', imap_port: '993', smtp_host: '', smtp_port: '587' });
  const ids = useId();
  const { search } = useLocation();
  useMailboxPolling({ whileImporting: true });

  useEffect(() => {
    dispatch(fetchMailbox());
  }, [dispatch]);

  const query = new URLSearchParams(search);
  const outcome = query.get('mailbox');

  async function connect(provider: MailProviderKey) {
    const result = await dispatch(startOAuth(provider));
    if (startOAuth.fulfilled.match(result)) window.location.assign(result.payload.authorize_url);
  }

  async function submitImap(e: FormEvent) {
    e.preventDefault();
    const result = await dispatch(
      connectImap({
        address: form.address.trim(),
        password: form.password,
        imap_host: form.imap_host.trim(),
        imap_port: Number(form.imap_port) || 993,
        smtp_host: form.smtp_host.trim(),
        smtp_port: Number(form.smtp_port) || 587,
      }),
    );
    if (connectImap.fulfilled.match(result)) {
      setShowImap(false);
      setForm((f) => ({ ...f, password: '' }));
    }
  }

  async function disconnect() {
    const result = await dispatch(disconnectMailbox());
    if (disconnectMailbox.rejected.match(result)) throw result.payload ?? 'Could not disconnect.';
    await dispatch(fetchMailbox());
  }

  const oauthProviders = providers.filter((p) => p.uses_oauth);
  const imapAvailable = providers.some((p) => p.key === 'imap');
  const google = connection?.provider === 'google';
  const banner = connection && google ? reconnectBanner(connection) : null;
  const status = connection ? statusOf(connection) : null;
  const busySync = saving || syncQueued;
  const field = (name: keyof typeof form) => `${ids}-${name}`;

  return (
    <div className="px-4 sm:px-8 pt-5 w-full max-w-7xl mx-auto shrink-0">
      <Card pad="none" aria-labelledby={`${ids}-title`}>
        <CardHeader id={`${ids}-title`} title="Your mailbox" />
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className={TYPE.bodyMuted}>Emails you send and receive with customers appear on their records. Only you and your management chain can read them.</p>

          {outcome === 'connected' ? (
            <p role="status" className="text-[13px] leading-5 font-semibold text-success-ink">
              Mailbox connected.
            </p>
          ) : null}
          {outcome === 'error' ? (
            <p role="alert" className={ALERT}>
              Could not connect: {query.get('detail') || 'the provider refused.'}
            </p>
          ) : null}
          {outcome === 'refused' ? (
            <p role="alert" className={ALERT}>
              {refusalCopy(query.get('code'), query.get('detail'))}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-[13px] leading-5 text-danger-ink">
              {error}
            </p>
          ) : null}

          {!loaded ? (
            <LoadingState label="Loading your mailbox" variant="block" />
          ) : connection && status ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className={`truncate ${TYPE.label}`}>{connection.address}</p>
                  <p className={TYPE.meta}>{connection.provider_display}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => dispatch(syncMailbox())} disabled={busySync || Boolean(connection.paused_reason)} className={BUTTON}>
                    <RefreshCw className={`h-4 w-4 ${busySync ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
                    {busySync ? 'Syncing…' : 'Sync now'}
                  </button>
                  {google && !banner ? (
                    <button type="button" onClick={() => connect('google')} className={BUTTON}>
                      Reconnect
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setConfirming(true)} className={DANGER}>
                    <Unplug className="h-4 w-4" aria-hidden="true" />
                    Disconnect
                  </button>
                </div>
              </div>

              {banner ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-dim px-3 py-2">
                  <CircleAlert className="h-4 w-4 shrink-0 text-ink" aria-hidden="true" />
                  <p className="flex-1 text-[13px] leading-5 font-semibold text-ink">{banner}</p>
                  <button type="button" onClick={() => connect('google')} className={PRIMARY}>
                    Reconnect Google
                  </button>
                </div>
              ) : null}

              <dl className="divide-y divide-line-subtle border-y border-line-subtle">
                <div className={FACT}>
                  <dt className={TYPE.bodyMuted}>Status</dt>
                  <dd className={status.danger ? DANGER_VALUE : VALUE}>{status.text}</dd>
                </div>
                {google ? (
                  <>
                    <div className={FACT}>
                      <dt className={TYPE.bodyMuted}>Two-way</dt>
                      <dd className={VALUE}>{twoWayText(connection.two_way)}</dd>
                    </div>
                    <div className={FACT}>
                      <dt className={TYPE.bodyMuted}>Push</dt>
                      <dd className={VALUE}>{pushText(connection.push)}</dd>
                    </div>
                  </>
                ) : null}
                {google && connection.import ? (
                  <div className={FACT}>
                    <dt className={TYPE.bodyMuted}>Import</dt>
                    <dd className={VALUE}>
                      <Figured text={importLine(connection.import) ?? ''} />
                    </dd>
                  </div>
                ) : null}
                <div className={FACT}>
                  <dt className={TYPE.bodyMuted}>Last synced</dt>
                  <dd className={VALUE}>{connection.last_synced_at ? <Figured text={formatDate(connection.last_synced_at.slice(0, 10))} /> : 'Not synced yet'}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {disconnected ? <p className={TYPE.body}>{disconnectedLine(disconnected)}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                {oauthProviders.map((p) =>
                  p.gate ? (
                    <p key={p.key} className={TYPE.bodyMuted}>
                      {GATE_COPY[p.gate]}
                    </p>
                  ) : (
                    <button key={p.key} type="button" onClick={() => connect(p.key)} className={BUTTON}>
                      Connect {p.label}
                    </button>
                  ),
                )}
                {imapAvailable ? (
                  <button type="button" onClick={() => setShowImap((v) => !v)} aria-expanded={showImap} className={QUIET}>
                    {showImap ? 'Cancel' : 'Connect another mailbox (IMAP/SMTP)'}
                  </button>
                ) : null}
              </div>
              {oauthProviders.length === 0 ? (
                <p className={TYPE.bodyMuted}>Google and Microsoft sign-in are not set up on this deployment yet; IMAP/SMTP works with an app password.</p>
              ) : null}
              {showImap ? (
                <form onSubmit={submitImap} className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['address', 'Email address', 'email', true],
                      ['password', 'Password or app password', 'password', true],
                      ['imap_host', 'IMAP host', 'text', true],
                      ['imap_port', 'IMAP port', 'text', false],
                      ['smtp_host', 'SMTP host', 'text', true],
                      ['smtp_port', 'SMTP port', 'text', false],
                    ] as const
                  ).map(([name, label, type, required]) => (
                    <div key={name} className="flex flex-col gap-1">
                      <label htmlFor={field(name)} className={TYPE.label}>
                        {label}
                      </label>
                      <input
                        id={field(name)}
                        type={type}
                        required={required}
                        inputMode={name.endsWith('_port') ? 'numeric' : undefined}
                        value={form[name]}
                        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                        className={INPUT}
                      />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <button type="submit" disabled={saving} className={PRIMARY}>
                      {saving ? 'Checking login…' : 'Connect'}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          )}
        </div>
      </Card>
      {confirming && connection ? (
        <ConfirmDialog
          title={`Disconnect ${connection.address}?`}
          message={google ? DISCONNECT_GOOGLE : DISCONNECT_OTHER}
          confirmLabel="Disconnect"
          danger
          onConfirm={disconnect}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
```

Note: the `Email address` input is `type="email"`, so `getByLabelText` still finds it; the old placeholders go (labels sit above every input, house rule 8).

- [ ] **Step 5: Give the Integrations page test a router**

In `src/pages/integrations/Integrations.test.tsx`, add `import { MemoryRouter } from 'react-router-dom';` below the `react-redux` import, and change the render to:

```tsx
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Integrations />
      </MemoryRouter>
    </Provider>
  );
```

- [ ] **Step 6: Run the section's tests**

Run: `npx vitest run src/components/integrations src/pages/integrations src/features/mail --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Lower the UI ratchet**

MailboxSection held 19 size, 7 card, 1 shadow, 2 disabled-opacity and 3 bold offences; it now holds none. In `src/test/uiRatchet.test.ts` set:

```ts
const BASELINE: Record<UiOffence, number> = {
  sizes: 965,
  cards: 170,
  shadows: 175,
  opacityDisabled: 86,
  mono: 38,
  bold: 583,
};
```

Run: `npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS. If `toEqual(BASELINE)` reports other numbers, the rebuilt section still holds an offence: fix the section, never the numbers.

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/features/mail/useMailboxPolling.ts src/components/integrations/MailboxSection.tsx src/components/integrations/MailboxSection.test.tsx src/components/integrations/houseRules.test.ts src/pages/integrations/Integrations.test.tsx src/test/uiRatchet.test.ts
git commit -m "feat(mail): your mailbox shows two-way gmail state and refusals

Two-way, push, the 12-month import, the paused reason and the reconnect
banner; Sync now waits for the queued tick; Disconnect explains the 30
days and the card says what is kept; every gate and callback refusal in
the contract's words. Rebuilt on the UI primitives, so the ratchet drops.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mail rows and the open message: Cc, Bcc, labels, attachments

**Files:**
- Create: `src/pages/communications/MailLabels.tsx`
- Create: `src/pages/communications/MailAttachments.tsx`
- Modify: `src/pages/communications/mailWho.ts`
- Modify: `src/pages/communications/MailList.tsx`
- Modify: `src/pages/communications/MailDetail.tsx`
- Test: `src/pages/communications/MailLabels.test.tsx`, `src/pages/communications/MailDetail.test.tsx`, `src/pages/communications/MailList.test.tsx`

**Interfaces:**
- Consumes: `MailLabel`, `MailAttachmentMeta`, `MailMessage`, `MailMessageDetail` (Task 1); `MAIL_DETAIL`, `MAIL_ROW` (Task 1); `formatSize` (`src/features/files/fileFormat.ts`).
- Produces: `LabelChips({ labels, max? }: { labels: MailLabel[]; max?: number })` (a `role="group"` named `Labels: <names>`, or nothing); `MailAttachments({ attachments }: { attachments: MailAttachmentMeta[] })` (a list named "Attachments", or nothing); `people(list: [string, string][]): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/communications/MailLabels.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LabelChips } from './MailLabels';
import { MAIL_DETAIL } from '../../features/mail/testMail';

describe('LabelChips (Decision 4)', () => {
  it('names every label, with Gmail colour as the dot', () => {
    render(<LabelChips labels={MAIL_DETAIL.labels} />);
    const group = screen.getByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' });
    const renewals = within(group).getByText('Renewals');
    expect(renewals.previousElementSibling).toHaveStyle({ backgroundColor: 'rgb(22, 167, 102)' });
    expect(within(group).getByText('Q4').previousElementSibling).toHaveClass('bg-ink-faint');
  });

  it('shows at most max chips and the rest as +N', () => {
    render(<LabelChips labels={MAIL_DETAIL.labels} max={2} />);
    const group = screen.getByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' });
    expect(within(group).queryByText('Q4')).toBeNull();
    expect(within(group).getByText('+1')).toBeInTheDocument();
  });

  it('ignores a colour that is not #rrggbb, and renders nothing without labels', () => {
    const { container } = render(<LabelChips labels={[{ id: 1, name: 'Odd', color: { background: 'red;position:fixed', text: '' } }]} />);
    expect(screen.getByText('Odd').previousElementSibling).not.toHaveAttribute('style');
    container.remove();
    const empty = render(<LabelChips labels={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
  });
});
```

Create `src/pages/communications/MailDetail.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MailDetail } from './MailDetail';
import { MAIL_DETAIL } from '../../features/mail/testMail';
import type { MailMessageDetail } from '../../features/mail/mailboxSlice';

// Unit tier: the open message alone, with the contract's detail (§6).

function renderDetail(message: MailMessageDetail) {
  render(
    <MemoryRouter>
      <MailDetail
        message={message}
        loading={false}
        error={null}
        updateError={null}
        replying={false}
        replyError={null}
        replied={false}
        onRetry={vi.fn()}
        onDismissUpdateError={vi.fn()}
        onUpdate={vi.fn()}
        onReply={vi.fn()}
      />
    </MemoryRouter>,
  );
  return screen.getByRole('region', { name: 'Message' });
}

describe('MailDetail: two-way Gmail D1', () => {
  it('shows Cc, every label and the attachments as text chips', () => {
    const message = renderDetail(MAIL_DETAIL);
    expect(within(message).getByText('Cc Sam Pizza')).toHaveAttribute('title', 'sam@pizzahut.com');
    expect(within(message).getByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' })).toBeInTheDocument();
    const files = within(message).getByRole('list', { name: 'Attachments' });
    expect(within(files).getAllByRole('listitem')).toHaveLength(1);
    expect(within(files).getByText('Renewal quote.pdf')).toBeInTheDocument();
    expect(within(files).getByText('178 KB')).toBeInTheDocument();
    expect(within(files).getByText(/PDF/)).toBeInTheDocument();
    expect(within(files).queryByRole('button')).toBeNull();
    expect(within(files).queryByRole('link')).toBeNull();
    expect(within(message).queryByText('logo.png')).toBeNull();
  });

  it('shows Bcc on your own sent mail', () => {
    const message = renderDetail({ ...MAIL_DETAIL, direction: 'sent', folder: 'sent', bcc: [['', 'boss@doughco.com']] });
    expect(within(message).getByText('Bcc boss@doughco.com')).toBeInTheDocument();
  });

  it('shows no Cc, labels or attachments for an Outlook message (contract §9)', () => {
    const message = renderDetail({ ...MAIL_DETAIL, cc: [], bcc: [], labels: [], has_attachments: false, attachments: [], html_body: '' });
    expect(within(message).queryByText(/^Cc /)).toBeNull();
    expect(within(message).queryByRole('group', { name: /^Labels/ })).toBeNull();
    expect(within(message).queryByRole('list', { name: 'Attachments' })).toBeNull();
  });
});
```

Create `src/pages/communications/MailList.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MailList } from './MailList';
import { MAIL_ROW } from '../../features/mail/testMail';

describe('MailList: labels and attachments on a row', () => {
  it('shows two label chips and +1, and says the row has attachments', () => {
    render(<MailList rows={[MAIL_ROW]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    // The wide cell and the narrow meta line each carry the chips; CSS shows one.
    const groups = screen.getAllByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' });
    expect(groups).toHaveLength(2);
    expect(screen.getAllByText('+1').length).toBeGreaterThan(0);
    expect(screen.getByText('Has attachments')).toHaveClass('sr-only');
  });

  it('shows neither for a row without labels or attachments', () => {
    render(<MailList rows={[{ ...MAIL_ROW, labels: [], has_attachments: false }]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    expect(screen.queryByRole('group', { name: /^Labels/ })).toBeNull();
    expect(screen.queryByText('Has attachments')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/communications/MailLabels.test.tsx src/pages/communications/MailDetail.test.tsx src/pages/communications/MailList.test.tsx --maxWorkers=2`
Expected: FAIL ("Failed to resolve import ./MailLabels", then no Cc line).

- [ ] **Step 3: Write `LabelChips`**

Create `src/pages/communications/MailLabels.tsx`:

```tsx
// Gmail's user labels on a mail row and the open message (contract §6).
// Each is a neutral pill in tokens, so it reads in both themes, with the
// label's own Gmail colour as its dot: the person's own key, kept from
// Gmail (Decision 4). System and category labels never arrive here.

import type { MailLabel } from '../../features/mail/mailboxSlice';
import { NUM, TYPE } from '../../components/ui';

const HEX6 = /^#[0-9a-f]{6}$/i;

export function LabelChips({ labels, max }: { labels: MailLabel[]; max?: number }) {
  if (labels.length === 0) return null;
  const shown = max === undefined ? labels : labels.slice(0, max);
  const more = labels.length - shown.length;
  return (
    <span role="group" aria-label={`Labels: ${labels.map((l) => l.name).join(', ')}`} className="inline-flex min-w-0 flex-wrap items-center gap-1 align-middle">
      {shown.map((label) => {
        const colour = label.color && HEX6.test(label.color.background) ? label.color.background : null;
        return (
          <span key={label.id} className="inline-flex max-w-[10rem] items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[11px] leading-4 text-ink-muted">
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${colour ? '' : 'bg-ink-faint'}`} style={colour ? { backgroundColor: colour } : undefined} />
            <span className="truncate">{label.name}</span>
          </span>
        );
      })}
      {more > 0 ? <span className={`${TYPE.meta} ${NUM}`}>+{more}</span> : null}
    </span>
  );
}
```

- [ ] **Step 4: Write `MailAttachments`**

Create `src/pages/communications/MailAttachments.tsx`:

```tsx
// The open message's attachments as chips (contract §6): name, type and
// size. Inline parts (images inside the HTML) are left out. Delivery 2 adds
// opening them, so a chip is text, not a control (Decision 11).

import { Paperclip } from 'lucide-react';
import type { MailAttachmentMeta } from '../../features/mail/mailboxSlice';
import { formatSize } from '../../features/files/fileFormat';
import { NUM, TYPE } from '../../components/ui';

function kindOf(file: MailAttachmentMeta): string {
  const dot = file.filename.lastIndexOf('.');
  return dot > 0 && dot < file.filename.length - 1 ? file.filename.slice(dot + 1).toUpperCase() : 'File';
}

export function MailAttachments({ attachments }: { attachments: MailAttachmentMeta[] }) {
  const files = attachments.filter((a) => !a.is_inline);
  if (files.length === 0) return null;
  return (
    <ul role="list" aria-label="Attachments" className="flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.id} title={`${file.filename} (${file.mime_type})`} className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
          <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <span className={`min-w-0 truncate ${TYPE.body}`}>{file.filename}</span>
          <span className={`shrink-0 ${TYPE.meta}`}>
            {kindOf(file)} · <span className={NUM}>{formatSize(file.size)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Add `people()`**

Append to `src/pages/communications/mailWho.ts`:

```ts

/** Cc or Bcc as names (the address when there is no name). */
export function people(list: [string, string][]): string {
  return list.map(([name, address]) => name || address).join(', ');
}
```

- [ ] **Step 6: Rows**

In `src/pages/communications/MailList.tsx`:
- add `import { Paperclip } from 'lucide-react';` at the top and `import { LabelChips } from './MailLabels';` beside the other local imports;
- replace the meta's narrow span

```tsx
                      <span className={QUEUE_NARROW_ONLY}>
                        {row.account ? ' · ' : null}
                        {row.subject}
                      </span>
```

with

```tsx
                      <span className={QUEUE_NARROW_ONLY}>
                        {row.account ? ' · ' : null}
                        {row.labels.length > 0 ? (
                          <>
                            <LabelChips labels={row.labels} max={1} />{' '}
                          </>
                        ) : null}
                        {row.subject}
                      </span>
```

- replace the subject cell

```tsx
                    <p key="subject" className={`truncate ${TYPE.body}`}>
                      {row.subject}
                      {row.snippet ? <span className="text-ink-muted">: {row.snippet}</span> : null}
                    </p>,
```

with

```tsx
                    <div key="subject" className="flex min-w-0 items-center gap-1.5">
                      {row.has_attachments ? (
                        <>
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                          <span className="sr-only">Has attachments</span>
                        </>
                      ) : null}
                      <LabelChips labels={row.labels} max={2} />
                      <p className={`min-w-0 truncate ${TYPE.body}`}>
                        {row.subject}
                        {row.snippet ? <span className="text-ink-muted">: {row.snippet}</span> : null}
                      </p>
                    </div>,
```

- [ ] **Step 7: The open message**

In `src/pages/communications/MailDetail.tsx`:
- change `import { who } from './mailWho';` to `import { people, who } from './mailWho';` and add `import { LabelChips } from './MailLabels';` and `import { MailAttachments } from './MailAttachments';`;
- after `<Badge>{CATEGORY_LABEL[message.category]}</Badge>` add `<LabelChips labels={message.labels} />`;
- after the closing `</div>` of that meta row (the `flex flex-wrap items-center gap-x-2 gap-y-1` div), still inside `grow min-w-0`, add:

```tsx
            {message.cc.length > 0 ? (
              <p className={`mt-1 truncate ${TYPE.meta}`} title={message.cc.map(([, address]) => address).join(', ')}>
                Cc {people(message.cc)}
              </p>
            ) : null}
            {message.bcc.length > 0 ? (
              <p className={`truncate ${TYPE.meta}`} title={message.bcc.map(([, address]) => address).join(', ')}>
                Bcc {people(message.bcc)}
              </p>
            ) : null}
            {message.attachments.length > 0 ? (
              <div className="mt-2">
                <MailAttachments attachments={message.attachments} />
              </div>
            ) : null}
```

- [ ] **Step 8: Run the tests to make sure they pass**

Run: `npx vitest run src/pages/communications src/components/ops.houseRules.test.ts --maxWorkers=2`
Expected: PASS (the Ops suite holds the new files to every house and foundations rule).

- [ ] **Step 9: Commit**

```bash
git add src/pages/communications/MailLabels.tsx src/pages/communications/MailAttachments.tsx src/pages/communications/mailWho.ts src/pages/communications/MailList.tsx src/pages/communications/MailDetail.tsx src/pages/communications/MailLabels.test.tsx src/pages/communications/MailDetail.test.tsx src/pages/communications/MailList.test.tsx
git commit -m "feat(comms): cc, bcc, gmail labels and attachment chips in the mailbox

Rows carry up to two label chips and a paperclip; the open message shows
Cc, Bcc (your own sent mail), every label and its attachments as text
chips. Labels are neutral pills with Gmail's colour as the dot.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: HTML mail in a sandboxed frame, images after "Show images"

**Files:**
- Create: `src/pages/communications/mailHtml.ts`
- Create: `src/pages/communications/MailHtmlBody.tsx`
- Modify: `src/pages/communications/MailDetail.tsx`
- Test: `src/pages/communications/mailHtml.test.ts`, `src/pages/communications/MailHtmlBody.test.tsx`, `src/pages/communications/MailDetail.test.tsx` (add)

**Interfaces:**
- Consumes: `MailMessageDetail.html_body` (Task 1); `MailDetail` as Task 3 left it.
- Produces: `CSP_BLOCKED: string`, `CSP_IMAGES: string`, `hasRemoteContent(html: string): boolean`, `mailSrcDoc(html: string, showImages: boolean): string`; `MailHtmlBody({ html, title }: { html: string; title: string })`, an iframe titled `Message: <title>`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/communications/mailHtml.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CSP_BLOCKED, CSP_IMAGES, hasRemoteContent, mailSrcDoc } from './mailHtml';

describe('mailHtml (Decision 2, contract §6)', () => {
  it('blocks every fetch until Show images, then lets https images in and nothing else', () => {
    expect(CSP_BLOCKED).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src cid: data:; font-src data:");
    expect(CSP_IMAGES).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src https: cid: data:; font-src data:");
    expect(CSP_BLOCKED).not.toMatch(/script-src|connect-src|frame-src/);
  });

  it('puts the policy first in the head and the mail in the body', () => {
    const doc = mailSrcDoc('<p>Hi</p>', false);
    expect(doc.indexOf(`content="${CSP_BLOCKED}"`)).toBeGreaterThan(-1);
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<body>'));
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain('<body><p>Hi</p></body>');
    expect(mailSrcDoc('<p>Hi</p>', true)).toContain(`content="${CSP_IMAGES}"`);
  });

  it('finds remote https images in img, background and CSS url()', () => {
    expect(hasRemoteContent('<img src="https://cdn.x.com/a.png">')).toBe(true);
    expect(hasRemoteContent('<td background="https://cdn.x.com/b.png">')).toBe(true);
    expect(hasRemoteContent('<div style="background:url(\'https://cdn.x.com/c.png\')">')).toBe(true);
    expect(hasRemoteContent('<img src="cid:logo@x">')).toBe(false);
    expect(hasRemoteContent('<img src="http://cdn.x.com/a.png">')).toBe(false);
    expect(hasRemoteContent('<p>No images</p>')).toBe(false);
  });
});
```

Create `src/pages/communications/MailHtmlBody.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MailHtmlBody } from './MailHtmlBody';
import { CSP_BLOCKED, CSP_IMAGES } from './mailHtml';
import { MAIL_DETAIL } from '../../features/mail/testMail';

describe('MailHtmlBody (Decisions 2 and 3)', () => {
  it('renders the mail in a frame that can run nothing and reach nothing', () => {
    render(<MailHtmlBody html={MAIL_DETAIL.html_body} title="Renewal quote" />);
    const frame = screen.getByTitle('Message: Renewal quote');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox');
    expect(frame.getAttribute('sandbox')).not.toMatch(/allow-scripts|allow-same-origin/);
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(frame.getAttribute('srcdoc')).toContain(CSP_BLOCKED);
  });

  it('lets remote images in after Show images, and says nothing more', async () => {
    render(<MailHtmlBody html={MAIL_DETAIL.html_body} title="Renewal quote" />);
    expect(screen.getByText("Images from the internet are hidden, so the sender can't tell you opened this.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show images' }));
    expect(screen.getByTitle('Message: Renewal quote').getAttribute('srcdoc')).toContain(CSP_IMAGES);
    expect(screen.queryByRole('button', { name: 'Show images' })).toBeNull();
  });

  it('offers no Show images when the mail has none', () => {
    render(<MailHtmlBody html="<p>Plain words</p>" title="Note" />);
    expect(screen.queryByRole('button', { name: 'Show images' })).toBeNull();
  });
});
```

Append to `src/pages/communications/MailDetail.test.tsx`, inside its `describe`:

```tsx
  it('shows the HTML body in the frame, and the text body when there is no HTML', () => {
    const html = renderDetail(MAIL_DETAIL);
    expect(within(html).getByTitle('Message: Renewal quote').tagName).toBe('IFRAME');
    expect(within(html).queryByText(/Quote attached\.\s+Ann/)).toBeNull();
    html.remove();
    const text = renderDetail({ ...MAIL_DETAIL, html_body: '' });
    expect(within(text).queryByTitle('Message: Renewal quote')).toBeNull();
    expect(within(text).getByText(/Quote attached\.\s+Ann/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/communications/mailHtml.test.ts src/pages/communications/MailHtmlBody.test.tsx src/pages/communications/MailDetail.test.tsx --maxWorkers=2`
Expected: FAIL ("Failed to resolve import ./mailHtml").

- [ ] **Step 3: Write the document builder**

Create `src/pages/communications/mailHtml.ts`:

```ts
// The sandboxed reader's document (contract §6, Decision 2). The server has
// already sanitised the HTML with nh3 at store; this decides only what the
// browser may fetch for it. A CSP <meta> covers every way HTML fetches
// (img, srcset, background=, style url(), @import, fonts), which a src
// rewrite would miss. "Show images" swaps the policy; nothing else changes.

/** Until Show images: inline styles only, no network at all. */
export const CSP_BLOCKED = "default-src 'none'; style-src 'unsafe-inline'; img-src cid: data:; font-src data:";

/** After Show images: https images too; still no scripts, frames, fonts or connections. */
export const CSP_IMAGES = "default-src 'none'; style-src 'unsafe-inline'; img-src https: cid: data:; font-src data:";

const REMOTE = /<img\b[^>]*\bsrc\s*=\s*["']?\s*https:|\bbackground\s*=\s*["']?\s*https:|url\(\s*["']?\s*https:/i;

/** Whether the mail asks for an https image, so "Show images" means something. */
export function hasRemoteContent(html: string): boolean {
  return REMOTE.test(html);
}

/** The frame's whole document. Painted on the system Canvas colours with a
 *  light colour scheme, so mail written for a white page reads in dark mode. */
export function mailSrcDoc(html: string, showImages: boolean): string {
  const csp = showImages ? CSP_IMAGES : CSP_BLOCKED;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="color-scheme" content="light">',
    '<base target="_blank">',
    '<style>:root{color-scheme:light}body{margin:0;padding:12px;background:Canvas;color:CanvasText;font:13px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style>',
    `</head><body>${html}</body></html>`,
  ].join('');
}
```

- [ ] **Step 4: Write the frame**

Create `src/pages/communications/MailHtmlBody.tsx`:

```tsx
// A message's HTML in a frame that runs nothing and reaches nothing
// (Decisions 2 and 3): no allow-scripts, no allow-same-origin; links open
// in a new tab. Remote images wait for "Show images", per message. The app
// cannot measure the document without same-origin, so the frame fills the
// reading pane and scrolls inside.

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { QUIET, TYPE } from '../../components/ui';
import { hasRemoteContent, mailSrcDoc } from './mailHtml';

export function MailHtmlBody({ html, title }: { html: string; title: string }) {
  const [showImages, setShowImages] = useState(false);
  const blocked = hasRemoteContent(html) && !showImages;
  return (
    <div className="flex h-full min-h-80 flex-col gap-2">
      {blocked ? (
        <div className="flex flex-wrap items-center gap-2">
          <ImageOff className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <p className={`flex-1 ${TYPE.bodyMuted}`}>Images from the internet are hidden, so the sender can't tell you opened this.</p>
          <button type="button" onClick={() => setShowImages(true)} className={QUIET}>
            Show images
          </button>
        </div>
      ) : null}
      <iframe
        title={`Message: ${title}`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={mailSrcDoc(html, showImages)}
        className="w-full min-h-0 flex-1 rounded-lg border border-line-subtle"
      />
    </div>
  );
}
```

- [ ] **Step 5: Use it in the open message**

In `src/pages/communications/MailDetail.tsx`, add `import { MailHtmlBody } from './MailHtmlBody';` and replace

```tsx
      <div className="grow overflow-y-auto custom-scrollbar px-4 py-3">
        <p className={`max-w-[68ch] whitespace-pre-line ${TYPE.body}`}>{message.body || message.snippet}</p>
      </div>
```

with

```tsx
      <div className="grow overflow-y-auto custom-scrollbar px-4 py-3">
        {message.html_body ? (
          <MailHtmlBody html={message.html_body} title={message.subject} />
        ) : (
          <p className={`max-w-[68ch] whitespace-pre-line ${TYPE.body}`}>{message.body || message.snippet}</p>
        )}
      </div>
```

`MailDetail` is keyed by message id in `MailboxView`, so "Show images" resets for every message.

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `npx vitest run src/pages/communications src/components/ops.houseRules.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/communications/mailHtml.ts src/pages/communications/MailHtmlBody.tsx src/pages/communications/MailDetail.tsx src/pages/communications/mailHtml.test.ts src/pages/communications/MailHtmlBody.test.tsx src/pages/communications/MailDetail.test.tsx
git commit -m "feat(comms): html mail in a sandboxed frame, images on request

The sanitised HTML renders in an iframe with no scripts and no
same-origin; a CSP meta blocks every fetch until Show images, then lets
https images in. Mail without HTML keeps the text body.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The mailbox header: import and paused notice, queued Sync now

**Files:**
- Create: `src/pages/communications/MailboxNotice.tsx`
- Modify: `src/pages/communications/MailboxView.tsx`
- Test: `src/pages/communications/MailboxNotice.test.tsx`, `src/pages/communications/MailboxView.test.tsx` (add a describe)

**Interfaces:**
- Consumes: `MailSummary.import` and `.paused_reason` (Task 1); `importLine`, `pausedNotice` (Task 1); `useMailboxPolling` (Task 2); `mail.syncQueued` (Task 1); `stubMail`, `MAIL_SUMMARY` (Task 1).
- Produces: `MailboxNotice({ summary }: { summary: MailSummary | null })`, an always-mounted `role="status"` region.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/communications/MailboxNotice.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MailboxNotice } from './MailboxNotice';
import { MAIL_SUMMARY } from '../../features/mail/testMail';

describe('MailboxNotice', () => {
  it('says the import is running, with "about"', () => {
    render(<MailboxNotice summary={MAIL_SUMMARY} />);
    expect(screen.getByRole('status')).toHaveTextContent('Importing mail: 4,210 of about 18,000');
  });

  it('says why the mailbox is paused', () => {
    render(<MailboxNotice summary={{ ...MAIL_SUMMARY, import: null, paused_reason: 'token_revoked' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Google access was revoked. Reconnect it in Settings › Connections.');
  });

  it('stays mounted and empty when there is nothing to say', () => {
    render(<MailboxNotice summary={{ ...MAIL_SUMMARY, import: { state: 'done', imported: 9800, total_estimate: 18000, done_at: '2026-10-10T11:00:00Z' } }} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
```

Append to `src/pages/communications/MailboxView.test.tsx` (add `act` to the `@testing-library/react` import, and `import { calls } from '../../features/agents/testAgents';` and `import { MAIL_SUMMARY, stubMail } from '../../features/mail/testMail';` at the top; add `afterEach` to the `vitest` import):

```tsx
describe('MailboxView: two-way Gmail D1', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // The list reads only: /mail/messages/ with or without a query, never the summary or one message.
  const lists = (spy: ReturnType<typeof stubMail>['spy']) => calls(spy, 'GET', '/mail/messages/').filter((c) => /^\/mail\/messages\/(\?|$)/.test(c)).length;

  it('says the import is running and why the mailbox is paused', { timeout: 15000 }, async () => {
    stubMail({ summary: { ...MAIL_SUMMARY, paused_reason: 'workspace_off' } });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const notice = await within(mailbox).findByText("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.");
    expect(notice.closest('[role="status"]')).toHaveTextContent('Importing mail: 4,210 of about 18,000');
  });

  it('a queued Sync now spins until the tick has run, then reads the list again', { timeout: 15000 }, async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { state, spy } = stubMail();
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('button', { name: 'Ann Lee' });
    const before = lists(spy);
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(calls(spy, 'POST', '/mail/sync/')).toHaveLength(1));
    await waitFor(() => expect(within(mailbox).getByRole('button', { name: 'Sync now' })).toBeDisabled());
    expect(lists(spy)).toBe(before);
    state.connection!.last_synced_at = '2026-10-10T09:20:00Z';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(within(mailbox).getByRole('button', { name: 'Sync now' })).toBeEnabled());
    await waitFor(() => expect(lists(spy)).toBe(before + 1));
  });
});
```

(`renderMailbox` preloads `mail` without `syncQueued`; the slice and the hook read it as `false`.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/communications/MailboxNotice.test.tsx src/pages/communications/MailboxView.test.tsx --maxWorkers=2`
Expected: FAIL ("Failed to resolve import ./MailboxNotice").

- [ ] **Step 3: Write the notice**

Create `src/pages/communications/MailboxNotice.tsx`:

```tsx
// Under the mailbox header: the 12-month import while it runs, and why a
// Google mailbox is paused (contract §6 summary). Always mounted, so a
// screen reader hears it change.

import { CirclePause } from 'lucide-react';
import type { MailSummary } from '../../features/mail/mailboxSlice';
import { importLine, pausedNotice } from '../../features/mail/mailText';
import { Figured } from '../../components/brain/Figured';
import { TYPE } from '../../components/ui';

export function MailboxNotice({ summary }: { summary: MailSummary | null }) {
  const paused = summary?.paused_reason ? pausedNotice(summary.paused_reason) : null;
  const importing = summary?.import?.state === 'importing' ? importLine(summary.import) : null;
  return (
    <div role="status" className={`flex flex-col gap-1 px-4 ${paused || importing ? 'pb-2' : ''}`.trim()}>
      {paused ? (
        <p className="flex items-center gap-2 text-[13px] leading-5 text-ink">
          <CirclePause className="h-4 w-4 shrink-0" aria-hidden="true" />
          {paused}
        </p>
      ) : null}
      {importing ? (
        <p className={TYPE.meta}>
          <Figured text={importing} />
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Wire it and the queued sync into `MailboxView`**

In `src/pages/communications/MailboxView.tsx`:
- change the React import to `import { useEffect, useRef } from 'react';`;
- add `import { useMailboxPolling } from '../../features/mail/useMailboxPolling';` and `import { MailboxNotice } from './MailboxNotice';`;
- below `const syncError = ...` add:

```tsx
  const syncQueued = useAppSelector((state) => state.mail?.syncQueued ?? false);
  const busySync = syncing || syncQueued;
  useMailboxPolling({ whileImporting: false });

  // A queued Google sync (202) lands later: when the wait ends, read again.
  const wasQueued = useRef(false);
  useEffect(() => {
    if (wasQueued.current && !syncQueued) {
      dispatch(fetchMailSummary());
      dispatch(fetchMailMessages({ folder, category, unread, priority }));
    }
    wasQueued.current = syncQueued;
  }, [dispatch, syncQueued, folder, category, unread, priority]);
```

- replace `sync()` with:

```tsx
  async function sync() {
    const result = await dispatch(syncMailbox());
    // Google answers 202 and the tick lands later (the effect above reads
    // again then); Outlook and IMAP synced inline.
    if (!syncMailbox.fulfilled.match(result) || result.payload.queued) return;
    dispatch(fetchMailSummary());
    dispatch(fetchMailMessages({ folder, category, unread, priority }));
  }
```

- in the Sync now button, replace `disabled={syncing}` with `disabled={busySync}` and `${syncing ? 'motion-safe:animate-spin' : ''}` with `${busySync ? 'motion-safe:animate-spin' : ''}`;
- directly after the header's closing `</div>` (the `h-14 shrink-0 ...` row), add `<MailboxNotice summary={summary} />`;
- update the file's top comment's last two lines to: `// flags, this product's own done/muted, a category decided at sync. In D1 a` / `// star or a read mark changed here stays here; Gmail's labels win on its next change.`

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run src/pages/communications src/components/ops.houseRules.test.ts --maxWorkers=2`
Expected: PASS (the existing MailboxView tests too: an inline 200 `{filed: 0}` sync still refreshes at once).

- [ ] **Step 6: Commit**

```bash
git add src/pages/communications/MailboxNotice.tsx src/pages/communications/MailboxView.tsx src/pages/communications/MailboxNotice.test.tsx src/pages/communications/MailboxView.test.tsx
git commit -m "feat(comms): mailbox says the import and pause, and waits for a queued sync

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: A paused Gmail says so on every send

**Files:**
- Modify: `src/features/mail/mailSlice.ts` (`sendEmail`)
- Modify: `src/features/mail/mailboxSlice.ts` (`replyToMailMessage`)
- Modify: `src/features/communications/communicationsSlice.ts` (`replyToEmail`)
- Modify: `src/components/agents/DraftForm.tsx`
- Test: `src/features/mail/pausedSend.test.ts`, `src/components/agents/DraftForm.test.tsx` (add)

**Interfaces:**
- Consumes: `sendFailure(err, fallback)`, `pausedSendMessage(err)` (Task 1).
- Produces: no new names; the three thunks reject with the paused words.

- [ ] **Step 1: Write the failing tests**

Create `src/features/mail/pausedSend.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import mailReducer, { sendEmail } from './mailSlice';
import mailboxReducer, { replyToMailMessage } from './mailboxSlice';
import communicationsReducer, { replyToEmail } from '../communications/communicationsSlice';

// Integration tier for the three send thunks: the real reducers, fetch
// answering contract §3's 409 MAILBOX_PAUSED.

const WORDS = "Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.";

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, json: async () => body })));
}

const paused = () => answer(409, { code: 'MAILBOX_PAUSED', detail: "Your Gmail connection is paused: your workspace isn't enabled for Gmail.", paused_reason: 'workspace_off' });

afterEach(() => vi.unstubAllGlobals());

describe('a paused Google mailbox refuses to send (contract §3)', () => {
  it('compose says why and what to do', async () => {
    paused();
    const store = configureStore({ reducer: { mail: mailReducer } });
    await store.dispatch(sendEmail({ customerId: 3, to: ['ann@pizzahut.com'], subject: 'Hi', body: 'Hello' }));
    expect(store.getState().mail.sendError).toBe(WORDS);
  });

  it('a mailbox reply says why and what to do', async () => {
    paused();
    const store = configureStore({ reducer: { mailbox: mailboxReducer } });
    await store.dispatch(replyToMailMessage({ id: 1, body: 'Thanks' }));
    expect(store.getState().mailbox.replyError).toBe(WORDS);
  });

  it('a queue reply says why and what to do', async () => {
    paused();
    const store = configureStore({ reducer: { communications: communicationsReducer } });
    await store.dispatch(replyToEmail({ rowId: 'email:412', body: 'Thanks' }));
    expect(store.getState().communications.replyError).toBe(WORDS);
  });

  it('other refusals keep their own words', async () => {
    answer(502, { detail: 'Gmail is down.' });
    const store = configureStore({ reducer: { mailbox: mailboxReducer } });
    await store.dispatch(replyToMailMessage({ id: 1, body: 'Thanks' }));
    expect(store.getState().mailbox.replyError).toBe('Gmail is down.');
  });
});
```

Append to `src/components/agents/DraftForm.test.tsx`, inside `describe('DraftForm: an email draft (Decisions 2 to 6)', ...)`:

```tsx
  it('says a paused Gmail in the server words with the next step and a way to Connections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ code: 'MAILBOX_PAUSED', detail: "Your Gmail connection is paused: your workspace isn't enabled for Gmail.", paused_reason: 'workspace_off' }),
      })),
    );
    mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.");
    expect(within(alert).getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/mail/pausedSend.test.ts src/components/agents/DraftForm.test.tsx --maxWorkers=2`
Expected: FAIL (the server sentence arrives without "Ask Revenact support to turn Gmail back on.").

- [ ] **Step 3: Use the paused words in the three thunks**

In `src/features/mail/mailSlice.ts` add `import { sendFailure } from './mailText';` and in `sendEmail` replace `return rejectWithValue(message(err, 'Could not send the email.'));` with `return rejectWithValue(sendFailure(err, 'Could not send the email.'));`.

In `src/features/mail/mailboxSlice.ts` add `import { sendFailure } from './mailText';` and in `replyToMailMessage` replace `return rejectWithValue(reason(err, 'Could not send the reply.'));` with `return rejectWithValue(sendFailure(err, 'Could not send the reply.'));`.

In `src/features/communications/communicationsSlice.ts` add `import { sendFailure } from '../mail/mailText';` and in `replyToEmail` replace `return rejectWithValue(err instanceof ApiError ? err.message : 'Could not send the reply.');` with `return rejectWithValue(sendFailure(err, 'Could not send the reply.'));`. Leave the `ApiError` import if other thunks still use it (they do: `fetchCommunicationsStats`).

- [ ] **Step 4: The draft form**

In `src/components/agents/DraftForm.tsx` add `import { pausedSendMessage } from '../../features/mail/mailText';` and in `refuse()` replace

```ts
    const text = refusalDetail(err) ?? errorMessage(err, fallback);
```

with

```ts
    const text = pausedSendMessage(err) ?? refusalDetail(err) ?? errorMessage(err, fallback);
```

and

```ts
    setAlert({ text, connect: code === 'NO_MAILBOX' });
```

with

```ts
    setAlert({ text, connect: code === 'NO_MAILBOX' || code === 'MAILBOX_PAUSED' });
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run src/features/mail src/features/communications src/components/agents src/pages/communications --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/mail/mailSlice.ts src/features/mail/mailboxSlice.ts src/features/communications/communicationsSlice.ts src/components/agents/DraftForm.tsx src/features/mail/pausedSend.test.ts src/components/agents/DraftForm.test.tsx
git commit -m "feat(mail): a paused gmail says why and what to do on every send

Compose, the mailbox reply, the queue reply and a draft's Send show the
server's MAILBOX_PAUSED sentence with the next step; the draft form also
links to Connections.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Platform portal: the Gmail switch and the test-user cap

**Files:**
- Modify: `src/features/platform/platformSlice.ts`
- Create: `src/pages/platform/GmailTwoWayCard.tsx`
- Modify: `src/pages/platform/PlatformOrganisationDetail.tsx`
- Modify: `src/pages/platform/PlatformOverview.tsx`
- Modify: `src/pages/platform/PlatformOrganisations.tsx`
- Create: `src/pages/platform/houseRules.test.ts`
- Test: `src/pages/platform/Platform.test.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1 to 6.
- Produces: `PlatformGmail { enabled: boolean; connected: number; paused: number }`; `PlatformOverview.gmail { enabled_workspaces: number; connected: number; test_user_cap: number }`; `PlatformOrganisationSummary.gmail: PlatformGmail`; `setGmailTwoWay({ id, enabled, reason }) => { id, gmail }`; `GmailTwoWayCard({ organisationId, gmail }: { organisationId: number; gmail: PlatformGmail })`, a region named "Google two-way mail".

- [ ] **Step 1: Write the failing tests**

In `src/pages/platform/Platform.test.tsx`:
- in `acme`, after `plan: null,` add `gmail: { enabled: false, connected: 0, paused: 0 },`;
- in `renderPortal`'s overview answer, add `gmail: { enabled_workspaces: 2, connected: 37, test_user_cap: 100 }` to the object after `staff: 1`.

Add these tests inside `describe('Platform portal', ...)`:

```tsx
  it('shows connected Google mailboxes against the test-user cap', async () => {
    renderPortal('/platform');
    expect(await screen.findByText('Google mailboxes')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
    expect(screen.getByText('of 100 test users · 2 workspaces on')).toBeInTheDocument();
  });

  it('lists whether each workspace has Gmail on', async () => {
    renderPortal('/platform/organisations');
    await screen.findByText('Acme Inc');
    expect(screen.getByRole('columnheader', { name: 'Gmail' })).toBeInTheDocument();
    const row = screen.getByRole('link', { name: 'Acme Inc' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('Off')).toBeInTheDocument();
  });

  it('turns Google two-way mail on with a reason, and shows both counts', async () => {
    const posts: unknown[] = [];
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/gmail/') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          posts.push(body);
          return jsonResponse(200, { gmail: { enabled: body.enabled, connected: 0, paused: 0 } });
        }
        return undefined;
      },
    });
    const card = await screen.findByRole('region', { name: 'Google two-way mail' });
    const turnOn = within(card).getByRole('button', { name: 'Turn on' });
    expect(turnOn).toBeDisabled();
    await userEvent.type(within(card).getByLabelText('Reason for turning it on'), 'Pilot approved: 6 users added in Google Cloud');
    await userEvent.click(turnOn);
    expect(await within(card).findByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    expect(posts).toEqual([{ enabled: true, reason: 'Pilot approved: 6 users added in Google Cloud' }]);
    expect(within(card).getByText('Connected here').nextElementSibling).toHaveTextContent('0');
    await waitFor(() => expect(within(card).getByText('Google test users, all workspaces').nextElementSibling).toHaveTextContent('37 of 100'));
    expect(within(card).getByLabelText('Reason for turning it off')).toHaveValue('');
  });

  it('shows the portal refusal on the card', async () => {
    renderPortal('/platform/organisations/1', {
      handler: (url, init) =>
        url.includes('/gmail/') && init?.method === 'POST' ? jsonResponse(400, { success: false, error: { code: 'REASON_REQUIRED', message: 'A reason is required.' } }) : undefined,
    });
    const card = await screen.findByRole('region', { name: 'Google two-way mail' });
    await userEvent.type(within(card).getByLabelText('Reason for turning it on'), 'x');
    await userEvent.click(within(card).getByRole('button', { name: 'Turn on' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('A reason is required.');
  });
```

Create `src/pages/platform/houseRules.test.ts`:

```ts
import { houseRuleSuite, uiRuleSuite } from '../../test/houseRules';

// The two-way Gmail card is the portal's first piece on the primitives; the
// rest of the portal keeps .rv-card until its own round.
const files = import.meta.glob('./GmailTwoWayCard.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

houseRuleSuite('Platform › Google two-way mail: house rules', files);
uiRuleSuite('Platform › Google two-way mail: foundations rules', files);
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/pages/platform --maxWorkers=2`
Expected: FAIL (no "Google mailboxes", no card, "Failed to resolve import ./GmailTwoWayCard").

- [ ] **Step 3: The slice**

In `src/features/platform/platformSlice.ts`:
- in `PlatformOverview`, after `staff: number;` add `gmail: { enabled_workspaces: number; connected: number; test_user_cap: number };`
- above `PlatformOrganisationSummary` add:

```ts
/** A workspace's two-way Gmail: the pilot switch, and its live Google
 *  connections (each holds a Google test-user slot) and how many are paused. */
export interface PlatformGmail {
  enabled: boolean;
  connected: number;
  paused: number;
}
```

- in `PlatformOrganisationSummary`, after `plan: PlatformBilling | null;` add `gmail: PlatformGmail;`
- after `archiveOrganisation` add:

```ts
export const setGmailTwoWay = createAsyncThunk<
  { id: number; gmail: PlatformGmail },
  { id: number; enabled: boolean; reason: string },
  { rejectValue: string }
>('platform/gmail', async ({ id, enabled, reason }, { rejectWithValue }) => {
  try {
    const data = await apiFetch<{ gmail: PlatformGmail }>(`/platform/organisations/${id}/gmail/`, { method: 'POST', body: { enabled, reason } });
    return { id, gmail: data.gmail };
  } catch (err) {
    return rejectWithValue(messageOf(err, 'Could not change Google two-way mail.'));
  }
});
```

- in `extraReducers`, after the `archiveOrganisation.rejected` case add (the card shows its own refusal, so there is no rejected case):

```ts
      .addCase(setGmailTwoWay.fulfilled, (state, action) => {
        if (state.organisation?.id === action.payload.id) state.organisation.gmail = action.payload.gmail;
        const row = state.organisations.find((o) => o.id === action.payload.id);
        if (row) row.gmail = action.payload.gmail;
      })
```

- [ ] **Step 4: The card**

Create `src/pages/platform/GmailTwoWayCard.tsx`:

```tsx
// The pilot switch for two-way Gmail (contract §1): staff turn it on for a
// workspace whose people are on the Google Cloud test-user list. A reason
// is required and lands on the tenant's own audit trail. Turning it off
// pauses every Google mailbox in the workspace within a minute; nothing is
// deleted. Counts only: no address, no mail.

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchOverview, setGmailTwoWay, type PlatformGmail } from '../../features/platform/platformSlice';
import { Card, CardHeader, DANGER, INPUT, NUM, PRIMARY, TYPE } from '../../components/ui';

const FACT = 'flex items-baseline justify-between gap-3 py-2';

export function GmailTwoWayCard({ organisationId, gmail }: { organisationId: number; gmail: PlatformGmail }) {
  const dispatch = useAppDispatch();
  const cap = useAppSelector((state) => state.platform.overview?.gmail ?? null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    dispatch(fetchOverview());
  }, [dispatch]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await dispatch(setGmailTwoWay({ id: organisationId, enabled: !gmail.enabled, reason: reason.trim() })).unwrap();
      setReason('');
      dispatch(fetchOverview());
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Could not change Google two-way mail.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card pad="none" aria-labelledby={`${ids}-title`}>
      <CardHeader id={`${ids}-title`} title="Google two-way mail" meta={gmail.enabled ? 'On' : 'Off'} />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className={TYPE.bodyMuted}>
          {gmail.enabled
            ? 'People here with a seat can connect a Google account on a verified domain. Turning it off pauses every Google mailbox in this workspace within a minute; nothing is deleted.'
            : "People here can't connect Gmail. Turn it on for an approved pilot, after adding each person as a test user in Google Cloud."}
        </p>
        <dl className="divide-y divide-line-subtle border-y border-line-subtle">
          <div className={FACT}>
            <dt className={TYPE.bodyMuted}>Connected here</dt>
            <dd className={TYPE.body}>
              <span className={NUM}>{gmail.connected}</span>
              {gmail.paused > 0 ? (
                <>
                  {' '}
                  (<span className={NUM}>{gmail.paused}</span> paused)
                </>
              ) : null}
            </dd>
          </div>
          {cap ? (
            <div className={FACT}>
              <dt className={TYPE.bodyMuted}>Google test users, all workspaces</dt>
              <dd className={TYPE.body}>
                <span className={NUM}>{cap.connected}</span> of <span className={NUM}>{cap.test_user_cap}</span>
              </dd>
            </div>
          ) : null}
        </dl>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor={`${ids}-reason`} className={TYPE.label}>
              Reason for turning it {gmail.enabled ? 'off' : 'on'}
            </label>
            <input
              id={`${ids}-reason`}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby={error ? `${ids}-error` : undefined}
              className={INPUT}
            />
          </div>
          <button type="submit" disabled={busy || !reason.trim()} className={gmail.enabled ? DANGER : PRIMARY}>
            {busy ? 'Saving…' : gmail.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </form>
        {error ? (
          <p id={`${ids}-error`} role="alert" className="text-[13px] leading-5 text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Mount it, add the tile and the column**

In `src/pages/platform/PlatformOrganisationDetail.tsx` add `import { GmailTwoWayCard } from './GmailTwoWayCard';` and replace

```tsx
      {billing && <BillingCard organisationId={organisation.id} billing={billing} onError={setActionError} />}
```

with

```tsx
      {organisation.gmail ? <GmailTwoWayCard organisationId={organisation.id} gmail={organisation.gmail} /> : null}

      {billing && <BillingCard organisationId={organisation.id} billing={billing} onError={setActionError} />}
```

In `src/pages/platform/PlatformOverview.tsx`, after the `Verified domains` tile entry add:

```tsx
        {
          label: 'Google mailboxes',
          value: overview.gmail.connected,
          hint: `of ${overview.gmail.test_user_cap} test users · ${overview.gmail.enabled_workspaces} workspaces on`,
        },
```

In `src/pages/platform/PlatformOrganisations.tsx`:
- after `<th className="px-4 py-2.5 font-semibold text-right">Waiting</th>` add `<th className="px-4 py-2.5 font-semibold text-right">Gmail</th>`;
- after `<td className="px-4 py-2.5 text-right tabular-nums text-ink">{org.pending_requests}</td>` add:

```tsx
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                  {org.gmail.enabled ? `${org.gmail.connected}${org.gmail.paused > 0 ? ` (${org.gmail.paused} paused)` : ''}` : 'Off'}
                </td>
```

- change `colSpan={6}` to `colSpan={7}`.

These three edits add no class strings outside the ones the files already use, so the ratchet does not move.

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `npx vitest run src/pages/platform src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/platform/platformSlice.ts src/pages/platform/GmailTwoWayCard.tsx src/pages/platform/PlatformOrganisationDetail.tsx src/pages/platform/PlatformOverview.tsx src/pages/platform/PlatformOrganisations.tsx src/pages/platform/houseRules.test.ts src/pages/platform/Platform.test.tsx
git commit -m "feat(platform): google two-way mail switch and test-user cap

Staff turn two-way Gmail on or off per workspace with a required reason;
the card shows this workspace's connected and paused mailboxes and the
platform-wide count against Google's test-user cap. The overview gains a
tile and the list a Gmail column.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The journeys

**Files:**
- Create: `src/e2e/gmail.test.tsx`

**Interfaces:**
- Consumes: everything above; `rootReducer` (`src/store.ts`); `KeepLocation` (`src/pages/settings/redirects.tsx`); `CommunicationsPage`; the platform pages, `RequirePlatform`, `PlatformLayout`.

- [ ] **Step 1: Write the journeys**

Create `src/e2e/gmail.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../store';
import authReducer, { type User } from '../features/auth/authSlice';
import platformReducer from '../features/platform/platformSlice';
import { KeepLocation } from '../pages/settings/redirects';
import { MailboxSection } from '../components/integrations/MailboxSection';
import CommunicationsPage from '../pages/communications/CommunicationsPage';
import { RequirePlatform } from '../components/auth/RequirePlatform';
import { PlatformLayout } from '../layouts/PlatformLayout';
import { PlatformOverview } from '../pages/platform/PlatformOverview';
import { PlatformOrganisations } from '../pages/platform/PlatformOrganisations';
import { PlatformOrganisationDetail } from '../pages/platform/PlatformOrganisationDetail';
import { calls } from '../features/agents/testAgents';
import { GOOGLE, MAIL_SUMMARY, stubMail } from '../features/mail/testMail';
import { CSP_BLOCKED, CSP_IMAGES } from '../pages/communications/mailHtml';

// End-to-end tier (jsdom, no browser; .claude/skills/testing): the real
// routes, store and pages for two-way Gmail delivery 1. Only fetch is
// stubbed, with the contract's shapes (stubMail; a small portal stub below).

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,stub' } }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function app(url: string, store = configureStore({ reducer: rootReducer })) {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/integrations" element={<KeepLocation to="/settings/connections" />} />
          <Route path="/settings/connections" element={<MailboxSection />} />
          <Route path="/communications" element={<CommunicationsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { assign, store };
}

const fact = (name: string) => screen.getByText(name, { selector: 'dt' }).nextElementSibling?.textContent ?? null;

describe('Two-way Gmail D1 journeys', () => {
  it('a refused connect says the domain is wrong, and Connect Google tries again', { timeout: 30000 }, async () => {
    stubMail({ connection: null });
    const { assign } = app(`/integrations?mailbox=refused&code=WRONG_DOMAIN&detail=${encodeURIComponent('Connect your pizzahut.com account.')}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connect your pizzahut.com account.');
    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Workspace / Gmail' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.example/google?state=x'));
  });

  it('after connecting, the import runs to done and Sync now waits for the tick', { timeout: 30000 }, async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { state, spy } = stubMail();
    app('/integrations?mailbox=connected');
    // By text: the loading skeleton is a status region too while the card loads.
    expect(await screen.findByText('Mailbox connected.')).toBeInTheDocument();
    await waitFor(() => expect(fact('Import')).toBe('Importing mail: 4,210 of about 18,000'));
    state.connection!.import = { state: 'done', imported: 9800, total_estimate: 18000, done_at: '2026-10-10T11:00:00Z' };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    await waitFor(() => expect(fact('Import')).toBe('Mail from the last 12 months is imported.'));
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeDisabled();
    state.connection!.last_synced_at = '2026-10-10T11:05:00Z';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled();
    expect(calls(spy, 'POST', '/mail/sync/')).toHaveLength(1);
  });

  it('a workspace switched off pauses the mailbox: Connections, the inbox and a reply all say why', { timeout: 30000 }, async () => {
    stubMail({ connection: { ...GOOGLE, paused_reason: 'workspace_off' }, summary: { ...MAIL_SUMMARY, paused_reason: 'workspace_off' } });
    const { store } = app('/settings/connections');
    await waitFor(() => expect(fact('Status')).toBe("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support."));
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();

    cleanup();
    app('/communications?source=mailbox:google', store);
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    expect(await within(mailbox).findByText("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.")).toBeInTheDocument();
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Ann Lee' }));
    const message = await within(mailbox).findByRole('region', { name: 'Message' });
    await userEvent.type(within(message).getByLabelText('Reply'), 'Thanks, Ann.');
    await userEvent.click(within(message).getByRole('button', { name: 'Send reply' }));
    expect(await within(message).findByRole('alert')).toHaveTextContent(
      "Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.",
    );
  });

  it('an HTML message opens with remote images blocked, and Show images lets them in', { timeout: 30000 }, async () => {
    stubMail();
    app('/communications?source=mailbox:google');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const list = await within(mailbox).findByRole('region', { name: 'Mail' });
    expect(within(list).getAllByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' }).length).toBeGreaterThan(0);
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Ann Lee' }));
    const message = await within(mailbox).findByRole('region', { name: 'Message' });
    const frame = await within(message).findByTitle('Message: Renewal quote');
    expect(frame.getAttribute('srcdoc')).toContain(CSP_BLOCKED);
    expect(within(message).getByText('Cc Sam Pizza')).toBeInTheDocument();
    expect(within(message).getByRole('list', { name: 'Attachments' })).toHaveTextContent('Renewal quote.pdf');
    await userEvent.click(within(message).getByRole('button', { name: 'Show images' }));
    expect(within(message).getByTitle('Message: Renewal quote').getAttribute('srcdoc')).toContain(CSP_IMAGES);
  });
});

// The portal journey: its own small stub, stateful on the one switch.

const staff = {
  id: 9, email: 'staff@revenact.io', name: 'Staff', avatar: '', role: '', role_id: null, role_name: '', permissions: [],
  function: 'other', function_display: 'Other', reports_to: null, organisation: null, is_active: true, is_superuser: true, mfa_enrolled: true,
} as unknown as User;

function stubPortal() {
  const gmail = { enabled: false, connected: 0, paused: 0 };
  const acme = {
    id: 1, name: 'Acme Inc', slug: 'acme-inc', status: 'active', created_at: '2026-09-01T00:00:00Z', owner: { id: 2, name: 'Owner', email: 'owner@acme.io' },
    // Waiting is 1, so the Gmail cell's 0 is the only 0 in the row.
    members_active: 2, pending_requests: 1, domains: [{ domain: 'acme.io', verification_status: 'verified' }], plan: null,
  };
  const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(body)) });
  const spy = vi.fn((input: string, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
    if (path === '/platform/overview/') {
      return json(200, {
        organisations: { total: 1, pending: 0, active: 1, suspended: 0, archived: 0 }, members_active: 2, pending_requests: 0, open_invitations: 0, verified_domains: 1, staff: 1,
        gmail: { enabled_workspaces: gmail.enabled ? 1 : 0, connected: 37, test_user_cap: 100 },
      });
    }
    if (path === '/platform/organisations/1/gmail/' && init?.method === 'POST') {
      gmail.enabled = JSON.parse(String(init.body)).enabled;
      return json(200, { gmail });
    }
    if (path === '/platform/organisations/1/billing/') return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'No billing.' } });
    if (path === '/platform/organisations/1/') return json(200, { ...acme, gmail, open_invitations: 0, memberships: [], domains: [{ id: 5, domain: 'acme.io', is_primary: true, verification_status: 'verified', verified_at: null }], recent_events: [] });
    if (path === '/platform/organisations/') return json(200, [{ ...acme, gmail }]);
    return json(200, {});
  });
  vi.stubGlobal('fetch', spy);
  return { spy };
}

describe('Platform portal journey', () => {
  it('staff see the cap, turn Gmail on for a workspace with a reason, and the list says so', { timeout: 30000 }, async () => {
    const { spy } = stubPortal();
    const store = configureStore({
      reducer: { auth: authReducer, platform: platformReducer },
      preloadedState: {
        auth: { user: staff, accessToken: 'a', refreshToken: 'r', isAuthenticated: true, isLoading: false, error: null, mfaChallenge: null, mfaVerified: true },
      },
    });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/platform']}>
          <Routes>
            <Route path="/platform" element={<RequirePlatform><PlatformLayout /></RequirePlatform>}>
              <Route index element={<PlatformOverview />} />
              <Route path="organisations" element={<PlatformOrganisations />} />
              <Route path="organisations/:id" element={<PlatformOrganisationDetail />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    expect(await screen.findByText('of 100 test users · 0 workspaces on')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Organisations' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Acme Inc' }));
    const card = await screen.findByRole('region', { name: 'Google two-way mail' });
    await userEvent.type(within(card).getByLabelText('Reason for turning it on'), 'Pilot approved');
    await userEvent.click(within(card).getByRole('button', { name: 'Turn on' }));
    expect(await within(card).findByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/gmail/')).toEqual(['/platform/organisations/1/gmail/']);
    await userEvent.click(screen.getAllByRole('link', { name: 'Organisations' })[0]);
    const row = (await screen.findByRole('link', { name: 'Acme Inc' })).closest('tr') as HTMLElement;
    expect(within(row).queryByText('Off')).toBeNull();
    expect(within(row).getByText('0')).toBeInTheDocument();
  });
});
```

Notes for this step:
- `PlatformLayout`'s nav link is labelled "Organisations" (`src/layouts/PlatformLayout.tsx`); on the organisation page its back link has the same name, hence `getAllByRole(...)[0]` (the nav comes first in the DOM).
- The stub answers billing with a 404, which today's page shows as its own alert above the cards; the card's alert is separate, so the journey is unaffected.

- [ ] **Step 2: Run the journeys**

Run: `npx vitest run src/e2e/gmail.test.tsx --maxWorkers=2`
Expected: PASS. A failure here is a wiring bug in Tasks 1 to 7 (a route, a selector, the store); fix the code, not the journey's expectations, unless the journey misreads a name the earlier tasks defined.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/gmail.test.tsx
git commit -m "test(e2e): two-way gmail journeys

A refused connect, the import and a queued Sync now, a paused workspace
across Connections and the inbox, an HTML message with Show images, and
staff turning the pilot on in the portal.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The UI/UX, App Flow and architecture documents

**Files:**
- Modify: `docs/03-ui-ux-design.md`
- Modify: `docs/04-app-flow.md`
- Modify: `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: UI/UX: add a section**

In `docs/03-ui-ux-design.md`, directly before the line `### Settings: the frame`, insert:

```markdown
### Two-way Gmail, delivery 1: Connections, the mailbox and the portal

Spec `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §4; contract
`revenact-backend docs/superpowers/plans/2026-10-10-gmail-sync-api.md`.

- **Connections › Your mailbox** (`components/integrations/MailboxSection`,
  on the primitives). One `Card`: the address (13px semibold) and provider,
  then the actions in a wrapping row: Sync now (`BUTTON`, "Syncing…" with a
  spinning icon while a queued Google sync waits, up to two minutes),
  Reconnect (`BUTTON`, Google only) and Disconnect (`DANGER`). Below, a
  `divide-y` facts list: Status ("Connected", the paused reason, the
  transient error, or "Needs attention: ..." in danger ink), and for Google
  Two-way ("On" or "Off: read-only"), Push ("On: new mail arrives within
  seconds" or "Off: checked every minute"), Import ("Importing mail: 4,210 of
  about 18,000", "... so far" without a total, then "Mail from the last 12
  months is imported."), and Last synced. Outlook and IMAP show Status and
  Last synced only.
- **The reconnect banner** (`bg-warning-dim`, `text-ink`, a Lucide icon):
  "Reconnect to turn on two-way", or "Google access was revoked: reconnect",
  with Reconnect Google as the card's one `PRIMARY`.
- **Disconnect** asks first (`ConfirmDialog`, danger): for Google, "Your own
  copies of this mailbox are deleted after 30 days, unless you reconnect the
  same account before then"; for Outlook and IMAP, "deletes your own copies
  of it now". After a Google disconnect the card says "<address> was
  disconnected on <date>. Your copies of its mail are kept until <date>:
  reconnect the same account before then to keep them." above the Connect
  buttons.
- **Refusals.** A failing pre-OAuth gate replaces Connect Google with its
  sentence (muted body). The callback's `?mailbox=refused&code=` shows the
  contract's sentence for the code as an alert; `WRONG_DOMAIN` shows the
  server's "Connect your <domain> account." only in that exact shape.
- **IMAP form.** Labels above every input (`INPUT`), two columns from `sm`,
  Connect as the form's primary.
- **Mailbox rows** carry up to two Gmail label chips and "+N" (neutral pills,
  the label's Gmail colour as a 6px dot) and a paperclip ("Has attachments"
  for screen readers). On a phone the meta line carries one chip.
- **The open message** adds Cc and Bcc lines (11px, addresses in the
  tooltip), every label chip, and attachment chips (Paperclip, name,
  extension and size in tabular figures; bordered, not clickable until
  delivery 2; inline parts hidden).
- **HTML mail** sits in a sandboxed frame (no scripts, no same-origin) that
  fills the reading pane and scrolls inside, painted on the light system
  canvas so mail written for white pages reads in dark mode. Remote images
  are blocked by a CSP until **Show images** (`QUIET`), next to "Images from
  the internet are hidden, so the sender can't tell you opened this." Mail
  without HTML keeps the text body.
- **The mailbox header** gains an always-mounted status line: the import
  progress (11px) and the paused reason (13px ink with `CirclePause`).
- **Sends through a paused Gmail** show the server's `MAILBOX_PAUSED` sentence
  and the next step in the existing alert; a draft also shows Open
  Connections.
- **Platform portal.** The organisation page gains a "Google two-way mail"
  `Card` (meta On or Off): what it allows, "Connected here" (with paused in
  brackets) and "Google test users, all workspaces: N of 100" as a
  `divide-y` list, then a reason field (label above) and Turn on (`PRIMARY`)
  or Turn off (`DANGER`). The overview gains a "Google mailboxes" tile ("of
  100 test users · N workspaces on"); the organisations list a Gmail column
  ("Off", or the connected count).
```

- [ ] **Step 2: App Flow**

In `docs/04-app-flow.md`:
- in the `/communications` route row, replace `the open message with star/done/mute and a reply that sends from the mailbox)` with `the open message with star/done/mute, Cc and Bcc, Gmail's user labels as chips, attachment chips (not opened until two-way Gmail delivery 2), HTML in a sandboxed frame with remote images blocked until Show images, and a reply that sends from the mailbox; the header says when the 12-month import is running or the mailbox is paused)`;
- in §4.9, replace the paragraph that starts `The page has two halves. **Your mailbox**:` with:

```markdown
The page has two halves. **Your mailbox**: connect Google or Microsoft through
OAuth, or IMAP through a form, then sync, reconnect or disconnect. Google is
two-way Gmail (spec 2026-10-10, delivery 1): connecting is gated (the
workspace switched on in the portal, an active membership, a seat, a verified
domain; `providers[].gate` shows the first failing gate instead of Connect
Google), and the callback lands on `/integrations?mailbox=connected|refused|error`
(`refused` carries `code`), which redirects here with its query. The card
reads `GET /mail/connection/` (every 15 s while the 12-month import runs) and
shows Two-way, Push, the import, Last synced and the paused reason. Sync now on
Google answers 202 and the card asks again every 5 s until `last_synced_at`
moves (two minutes at most); Outlook and IMAP sync inline. A Google disconnect
revokes access and keeps the person's copies for 30 days (the card says until
when); Outlook and IMAP delete at once. **Organisation connectors**: pick a
provider, the row expands into a setup form whose fields the backend
declares, then connect, enable, sync or disconnect. Webhook connectors mint a
secret shown once.
```

- after the §4.9 paragraph that ends `Connections link to this page.`, add:

```markdown
A Google mailbox that is paused (workspace off, member suspended, no seat, or
access revoked) refuses compose, the mailbox and queue replies and a draft's
Send with 409 `MAILBOX_PAUSED`; each shows the server's sentence and the next
step, and the draft form adds Open Connections.
```

- in §4.10a, after `plan, each with a mandatory reason);` insert ` the "Google two-way mail" switch (turn on or off with a mandatory reason, `POST /platform/organisations/<id>/gmail/`; turning it off pauses that workspace's Google mailboxes within a minute) with its connected and paused counts and the platform-wide count against Google's 100 test users; a Gmail column on the list and a Google mailboxes tile on the overview;`

- [ ] **Step 3: Architecture**

In `.agents/workflows/repo-architecture.md`, replace the §9 body line `Integration catalogue with cards for connecting external tools (HubSpot, Salesforce, Slack, etc.)` with:

```markdown
Integration catalogue with cards for connecting external tools (HubSpot, Salesforce, Slack, etc.).
Above it, `components/integrations/MailboxSection` is the person's own mailbox
(two-way Gmail delivery 1: `features/mail/mailSlice.ts` for the connection and
queued sync, `features/mail/mailText.ts` for every sentence,
`features/mail/useMailboxPolling.ts` for the import and Sync now waits,
`features/mail/testMail.ts` as the tests' stub). The mailbox view's labels,
attachments and sandboxed HTML live beside it in `pages/communications/`
(`MailLabels`, `MailAttachments`, `MailHtmlBody` with `mailHtml.ts`,
`MailboxNotice`).
```

- [ ] **Step 4: Check the docs**

Run: `git diff --unified=0 -- docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md | grep '^+' | LC_ALL=C grep -n $'\xe2\x80\x94' || echo "no em dash in the new lines"`
Expected: `no em dash in the new lines`.

- [ ] **Step 5: Commit**

```bash
git add docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "docs: two-way gmail delivery 1 in ui/ux, app flow and architecture

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The full check

**Files:** none new.

- [ ] **Step 1: Every test**

Run: `npx vitest run --maxWorkers=4`
Expected: every file passes, including `src/test/uiRatchet.test.ts`, `src/components/ops.houseRules.test.ts`, `src/components/integrations/houseRules.test.ts`, `src/pages/platform/houseRules.test.ts` and `src/e2e/gmail.test.tsx`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Types and bundle**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: No em dash, no raw colour in the added lines**

Run: `git diff origin/main --unified=0 -- src | grep '^+' | LC_ALL=C grep -n $'\xe2\x80\x94' || echo "no em dash added"`
Expected: `no em dash added`.

Run: `git diff origin/main --unified=0 -- 'src/*.tsx' ':(exclude)src/*.test.tsx' | grep '^+' | grep -n -E '#[0-9a-fA-F]{3,8}\b|rgba?\(' || echo "no raw colour added"`
Expected: `no raw colour added`.

- [ ] **Step 5: Phone width by eye (optional when no API is running)**

With the D1 backend running on `http://localhost:8000`, run `npm run dev`, sign in, and check at 375px and 1440px: Settings › Connections (connected Google, paused, disconnected), Communications › the mailbox (a labelled row, an HTML message before and after Show images), and the portal organisation page. No horizontal scroll; actions wrap; the frame fills the pane.

- [ ] **Step 6: Hand back**

Report the commits, the test counts and anything left for the owner. Owner steps that are not code (spec §5, contract §10): the Google Cloud prerequisites, the pilot users on the test-user list, turning the workspace on in the portal, and the **one live check on a real test Gmail account before merge**: connect, watch the import line move, send yourself an HTML mail with a remote image and use Show images, switch the workspace off in the portal and see Connections and a reply say it is paused.

---

## Self-review

**Spec and contract coverage:**
- Connections: address, Two-way, needs_reconnect banner, import with "about" and `done` final, last synced, Push, every `paused_reason`, status and error, Sync now (202 queued, 200 inline), Reconnect, Disconnect with 30 days, the `disconnected` block: Task 2 (words Task 1).
- Refusals: every gate code (pre-OAuth `gate` and the 403), `WRONG_DOMAIN` naming the domain, `SCOPES_MISSING`, `ADDRESS_IN_USE`, `GOOGLE_DENIED` (Google's not-a-test-user case): Tasks 1 and 2.
- Communications: cc/bcc, labels on rows and detail, attachment chips, sandboxed HTML with Show images, text fallback: Tasks 3 and 4; import and paused notice, queued sync: Task 5; `409 MAILBOX_PAUSED` on compose, reply, queue reply and draft send: Task 6.
- `GET mail/labels/`: deliberately not wired (Decision 5).
- Portal switch with reason, connected vs cap platform-wide and per workspace: Task 7.
- Types and client field names: Task 1 (Global Constraints list them).
- Phone width: Global Constraints and each component's classes (wrapping rows, one-column facts, `w-full` frame, wrapping chips); Task 10 Step 5 by eye.
- Tests: unit (slice, words, chips, frame, notice), integration (section, view, platform, send thunks), e2e (Task 8: refusal, import, paused, HTML show images, portal switch).
- Docs: Task 9.

**Placeholder scan:** none of "TBD", "TODO", "similar to", "add error handling". Task 8 Step 1's notes explain two stub choices (the nav label, the billing 404).

**Type consistency:** `MailboxPayload`, `DisconnectedMailbox`, `MailImport`, `PausedReason`, `GmailGate`, `MailLabel`, `MailAttachmentMeta`, `PlatformGmail` are defined in Task 1 or 7 and used with the same names after; `syncQueued`/`syncQueuedFrom`/`syncWaitExpired` (Task 1) are read by `useMailboxPolling` (Task 2) and `MailboxView` (Task 5); `importLine`, `pausedLine`, `pausedNotice`, `reconnectBanner`, `refusalCopy`, `sendFailure`, `pausedSendMessage` keep one signature throughout; `CSP_BLOCKED`/`CSP_IMAGES` (Task 4) are what Task 8 asserts.

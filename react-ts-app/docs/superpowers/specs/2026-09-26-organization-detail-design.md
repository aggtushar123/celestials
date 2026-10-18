# The organisation page (`/organizations/:id`): the organisation's story

Owner decisions of 2026-09-26. The analysis behind them is in `.superpowers/org-detail-analysis.md` (git-ignored scratch). House rules come from `.claude/skills/revenact-design/SKILL.md` §1 and §4, and the look follows the Organizations List and Board (`docs/superpowers/specs/2026-09-25-organizations-portfolio-design.md`).

## 0. Why

The page is the organisation's story: which accounts are connected to it, and everything going on across them. Today the page falls short in five ways:

- **It shows less than the List.** About 20 of the 34 fields appear, and there is no trend, runway, signal, last touch or risk.
- **Two pulses disagree.** The blended "Account Pulse" contradicts the List's "AI n · CSM n".
- **It shows fake data.** The Slack threads are fake, the pinned Pulse always draws five teal dots, and NPS counts are invented.
- **More than 25 controls do nothing.**
- **It breaks the house rules.** It uses glass, off-scale type, white-on-white buttons and card-in-card, its tables scroll sideways, and it breaks at 375px.

Getting there takes about 15 requests.

## 1. Page anatomy

Decisions, in the order they were made:

| Topic | Decision |
|---|---|
| Purpose | The organisation's story, led by the timeline. |
| Accounts | **One story for the whole organisation, filtered by account.** An account chip narrows Story, People and Deals & risks. **No account's details are lost** (the owner's decision, 2026-09-26): the chips stay on the Story tab as the filter, and Details lists every connected account (item 7). |
| Layout | Six tabs under the header: **Story** (default) · **Details** · **People** · **Deals & risks** · **Knowledge** · **Files**. |
| Not-yet-real parts | Removed now, with room kept for them. Success Plans, Custom Objects and Canvases become tabs when built. Slack, in-app Conversations and Revenact Support become story sources when real. See §6, Planned. |
| Pulse | The List's form everywhere: "AI n · CSM n", the history dots, and "pulses disagree", with the AI reason in Details. The blended "Account Pulse" is dropped. |
| Story | A pinned **Needs attention** block, then the stream. |
| Header | **B:** a name row, a strip of tiles, then the account chips. |
| Stream | **A:** a clean list grouped by day, with dividers, in the style of the Communications inbox. |
| Data | One new backend endpoint for the story (§2). |

Top to bottom:

1. **Frame.** The Organizations frame: a transparent top bar, `p-0`, and the ✦ Ask rail on the right (delivery 3).
2. **Name row.**
   - Initials avatar (no third-party logo), the organisation name, then `owner · lifecycle · Touched Nd ago`.
   - The signal tag.
   - Edit and ⋯ on the right. ⋯ holds Churn and Archive, each gated as on the List.
3. **Tiles.** Four tiles:
   - **Health:** ring, score and the 6-month trend. Tapping opens the health breakdown.
   - **ARR:** in the customer's currency.
   - **Renewal:** runway bar and "in Nd" or "Nd overdue".
   - **Pulse:** "AI n · CSM n", the dots, and "pulses disagree".

   A tile jumps to its Details panel. On phones the tiles become a snapping strip.
4. **Account chips.** `All · <Account> <n>`, where n is the number of story items for that account. An account does carry its own health, lifecycle stage, ARR, renewal, NPS and CSAT (`AccountSerializer` serves all of them; round-1 fix, 2026-09-27 corrected this section, which previously claimed otherwise) — the chips stay name plus count by design, and the per-account figures live on the Details tab's Accounts section (item 7) instead. A chip filters Story, People and Deals & risks, and it lives in the URL (`?account=`).
5. **Tabs.** A real tablist (`role="tablist"`, `aria-selected`). The active tab lives in the URL (`?tab=`), and the tabs scroll horizontally on phones.
6. **Story.**
   - **Needs attention**, shown only when something needs attention:
     - renewal overdue, or due within 30 days
     - open High or Critical tickets (count and oldest age)
     - overdue tasks
     - unanswered Knowledge questions
     - the latest anomaly (title withheld unless the viewer sees everything)
   - **Filters:** All · Conversations · Tickets · Tasks & notes · Feedback · Health & usage, plus a **Sources** picker (multi-select of exact types) and a **search** box.
   - **+ Add:** Log a call, New task, New note, Log survey. These are the existing create flows. "Log a call" stands in for "Log activity" (amended 2026-09-26): an Activity has no create endpoint, while a call does (`POST /customers/{id}/calls/` and the account's, which CallSense's "Log a call" uses), and a logged call joins the story with its summary.
   - **Stream:**
     - Items are grouped by day, newest first. Each item has an icon (Lucide), title, account tag ("Organisation" when an item has no account), a one-line summary, who, and time.
     - Calls carry their CallSense summary. Opening an email shows its thread; other items open their existing detail.
     - The next page loads at the end of the list.
7. **Details.**
   - **Accounts** first (the owner's decision, 2026-09-26, so that no account's details are lost with the old Accounts tab): one list item per connected account, not a table. Each item shows the name (a link to `/accounts/:id`), owner, domain, the pulse dots, the AI score with its label, the AI reason, and — round-1 fix, 2026-09-27, so nothing `AccountSerializer` serves is dropped — its health (score and category), lifecycle stage, ARR (the organisation's own currency), renewal ("in Nd"/"Nd overdue"), NPS and CSAT and its own Revenact ID, as a second meta line rather than more columns; every one of these shows "—" when blank. Above the list, a compact-text summary (accounts, health mix, total ARR, NPS, CSAT and a lifecycle-stage breakdown) replaces the old AccountsMetricsBanner's donuts with the same figures, no charts. Each item has Edit; the section has Add account (both also stay on the Story tab's chip row). Designed loading, error and empty states; at 375px each item wraps with no sideways scroll.
   - Then the List's six panels (`AccountDetails`, stacked on phones), with all 34 fields and Edit details.
   - Then what `GET /customers/{id}/` adds that no panel shows (§2): email, phone, industry and the CSAT response bands (`csat_breakdown`; the Voice panel has only the score).
8. **People, Deals & risks, Files.** Delivery 1 keeps their current content inside the new frame. Delivery 2 turns them into list items, filtered by account.
9. **Knowledge.** Today's Company View: the brief, who answers, and questions. Delivery 1 frames it; delivery 2 restyles it.
10. **Removed.**
    - The hard-coded Slack tab.
    - The fake pinned Pulse and the invented NPS counts.
    - The "coming soon" filters and the Success Plans placeholder.
    - The "Enable new 360 UI" toggle and every dead control.
    - Clearbit and pravatar images.
    - The pinned-attributes panel and the "All attributes" modal (Details replaces both), and the Overview sub-tab.
11. **Phones (< 640px).** Name row, tile strip, account chips, tabs, then full-width content. Ask opens as a sheet. Every layout that exists only on phones or only on desktop is rendered conditionally, never hidden with CSS alone.

### Where today's 13 feed filters go

| Today | Where |
|---|---|
| All | All |
| Activities (logged calls, meetings) | Conversations, with CallSense summaries on calls |
| Emails | Conversations (opening one shows the thread) |
| Calendar Events | Conversations |
| Conversations (placeholder) | Conversations, when in-app chat is real |
| Slack (fake) | Conversations, when the Slack connector feeds real messages |
| Tickets | Tickets |
| Revenact Support (placeholder) | Tickets, as its own source when real |
| Tasks | Tasks & notes |
| Notes | Tasks & notes |
| Surveys | Feedback |
| Pulse (placeholder) | Health & usage: pulse history where stored, plus health and lifecycle changes |
| Sessions (Copilot sessions in this browser) | The Ask rail's History for this organisation, not the story |

A source with no real data never appears, either as a filter or in Sources.

## 2. Data

- **Header.** It takes two requests:
  - `GET /organizations/portfolio/?ids={id}&include_churned=1` gives one row with everything the List shows (health, trend, renewal, ARR, risk, pulse, signal, last touch, `details`). `ids` names archived rows too, so archived and churned organisations still open.
  - `GET /customers/{id}/` adds `health_breakdown`, `csat_breakdown`, email, phone and industry.
- **Accounts.** `GET /customers/{id}/accounts/` gives the chips. Their counts come from the story's `counts.by_account`.
- **Story (new).** `GET /api/v1/organizations/{id}/story/`.
  - **Parameters:**
    - `group` ∈ {conversations, tickets, tasks, feedback, health}
    - `source` (comma list of exact kinds)
    - `account` (an account id, or `none` for "Organisation")
    - `q`
    - `cursor`
    - `limit` (default 30, max 100)

    Unknown values are dropped, never a 400.
  - **Response:** `{items, next_cursor, counts: {by_group, by_account}, attention}`.
    - Each item is `{id, kind, source, occurred_at, account: {id, name} | null, title, summary, actor: {id, name} | null, link}`.
    - `counts` and `attention` cover the whole filtered set, not the page.
  - **Sources:**
    - Activity (including calls with their summary)
    - Email
    - CalendarEvent
    - Ticket
    - Task
    - Note
    - Survey
    - health changes from HealthSnapshot
    - pulse history only where the model stores it

    Slack, in-app conversations and Revenact Support are added when real.
  - **Privacy (the twice-filter).**
    - The organisation must be in `visible_customers(user)`; otherwise the response is 404.
    - Each source then applies its own record rule: `visible_tickets` (departments), `visible_emails` (owner-only personal mail), `visible_notes`, activity gating, and the equivalents. Counts, attention and search obey the same rules.
    - The anomaly title in `attention` is withheld unless the viewer `sees_everything`, as on the Dashboard.
  - **Paging.** One keyset cursor over `(occurred_at, kind, id)` across all sources, bound to the filters (a stale cursor means page one). This rule is the same as the portfolio's.
  - **Performance.** A constant number of queries per page, pinned by a test at two book sizes.
  - **Links.** An account may belong to several organisations. The story only shows records linked to *this* organisation, and filtering by account keeps that restriction.
- **Existing endpoints stay.** The `/customers/{id}/…` endpoints still handle create and edit (+ Add, surveys, tasks, notes) and serve other pages. People, Deals & risks, Files and Knowledge keep their endpoints; delivery 2 adds an account filter only where one is missing.
- **Landing cost.** Three or four requests, down from about 15.

## 3. Ask Revenact on the page (delivery 3)

- **Entry points.**
  - The ✦ pill in the top bar and the glass rail beside the page, as on the List and Board. The page joins `OrganizationsAskLayout`, so one conversation lasts from the List into the organisation and back.
  - On phones, a sheet.
  - The old "Ask Copilot" link to `/copilot` is removed.
- **Context.** `{surface: "organizations", view: "detail", organization: id, account?: id, focus}`. The chip reads "Pizza Hut" or "Pizza Hut · EMEA".
- **Backend.**
  - The Organizations Ask surface (#66) accepts `view: "detail"` with the organisation id and an optional account. It re-checks visibility for both and meters under the `organizations` purpose.
  - Grounding is:
    - the portfolio digest for this one organisation
    - the `attention` block
    - recent story items (last 30 days, capped), fenced like the Dashboard's
    - records retrieved per question, each under its own rule
  - An account narrows the story items.
- **Focus that lasts one question.** "Ask about this" on a story item sets `{kind, id}`. The server re-checks that the viewer can see the item before grounding on it.
- **History.** The tag is "Pizza Hut" or "Pizza Hut · EMEA", from server-built labels. Restoring opens `/organizations/{id}?account=…`.
- **Shared sessions.** Unchanged. The reply snapshots the customer ids it was grounded on (#66), so a mentioned slice reader must see the organisation.

## 4. Delivery

Each delivery is a backend PR, then a frontend PR. The backend merges and deploys first.

1. **The new page and the Story.**
   - Backend: the story endpoint, with filters, counts, attention, search, privacy tests and a query-count pin.
   - Frontend:
     - the frame, name row, tiles, account chips and tabs
     - Story (attention, filters, Sources, search, + Add, stream)
     - Details, using the List's panels
     - every removal in §1.10

     People, Deals & risks, Knowledge and Files keep their current content inside the new frame.
2. **The other tabs.** People, Deals & risks and Files become list items with the account filter; Knowledge is restyled. Each gets accessibility, designed states and a phone layout. The backend changes only where an account filter is missing.
3. **Ask on the page.** Backend: `view: "detail"`, account scope, and story grounding. Frontend: the rail, the chip, History restore, and "Ask about this".

## 5. Testing

- **Backend.**
  - Story items equal the per-type endpoints' records for the same viewer.
  - Every filter, source, account and search, and the cursor followed to the end across sources without gaps or repeats.
  - Privacy: an invisible organisation returns 404. Records the viewer can't see never appear in items, counts, attention or search: other departments' tickets, other people's personal mail, private notes.
  - A pinned query count. Attention rules. Ask detail scope and its privacy (delivery 3).
- **Frontend.**
  - Unit tests for the tiles, chips, stream item, attention, filters and Sources.
  - Integration tests through the real store and router, with `fetch` mocked in §2 shapes.
  - A jsdom end-to-end test: open an organisation, filter by an account, open an email, add a task, and see it in the story.
  - A house-rules scan and the field-coverage test for Details.
  - The controller's browser check at desktop and 375px in both themes.

## 6. Planned (not in deliveries 1–3)

- **Success Plans, Custom Objects and Canvases** as tabs, once built.
- **Slack, in-app Conversations and Revenact Support** as story sources, once real.
- **The per-account page `/accounts/:id`**, which falls back to mock data on refresh today.
- **Follow-ups already logged:**
  - one "churned" rule shared with the Dashboard
  - the app-shell sidebar covering pages on phones
  - tiles pushing the board down at tablet width

# Pipelines: one book of opportunities and risks across organisations and accounts

Agreed with the owner on 2026-09-30.

## 0. Why

`/pipelines/list` and `/pipelines/board` are the one page the redesign has not reached. They show an Opportunities / Risks switch, an Overview banner with a Count/MRR toggle that only changes the banner, a title-only search, a client-side filter popover (department, priority, stage), an old `<table>` list and a stage kanban. The data is real, but:

- the page still looks like the pre-redesign app (table, stat cards), unlike Organizations, Accounts and the organisation and account pages' **Deals & risks** tabs, which already use list items;
- every total is computed in the browser from an unpaginated list, in more than one place;
- opportunities and risks carry **no date**, so nothing can say "closing this month" or "overdue", and the forecast cannot place pipeline on a timeline;
- opportunities have **no lost stage** (Discovery → … → Negotiation → Closed Won), so a lost deal has nowhere to go;
- opportunity and risk writes are not audited;
- an item's `companies` list is not trimmed to the organisations the viewer may open (the known gap in `docs/API_CONTRACTS.md`, "Known consequences #2");
- `components/shared/PipelinesTab.tsx` is an abandoned second copy of the Deals & risks tab that nothing routes to.

The owner chose (2026-09-30) **one book, both kinds**: one Pipelines page for every opportunity and risk the viewer may see, whether it belongs to an organisation or an account, in the portfolio design, followed by Ask. The owner's standing rules apply: app-ready (phones included), never spreadsheet-like, and no information lost.

## Decisions (agreed 2026-09-30)

| Topic | Decision |
|---|---|
| Shape | One book of opportunities or risks across organisations **and** accounts. Each item names its organisation or account. The Deals & risks tabs on the organisation and account pages stay as they are, gaining the date |
| Approach | Mirror the Organizations and Accounts portfolios: a server endpoint filters, groups, totals and pages; the frontend reuses the kind-agnostic portfolio components (`PortfolioKind`) |
| Dates | Opportunities gain an optional **expected close** (`expected_close`); risks gain an optional **due by** (`due_by`). Existing rows start empty and read "No date" |
| Lost | Opportunities gain a **Closed Lost** stage. *Open* = not Closed Won or Closed Lost. For risks, *open* = stage Open |
| Overdue | Open, with its date in the past |
| Owner | No owner field. The Owner filter and grouping use the owner of the item's organisation or account ("my pipeline" = deals on my book) |
| Audit | Create, edit, stage change and delete of an opportunity or risk are audited |
| Privacy | The department rule and the parent-visibility rule are applied once, in one place. The "Part of" name and `companies` list only organisations the viewer may open, everywhere opportunities and risks are served |
| Order | Two deliveries: (1) the list, Board, tiles and dates; (2) Ask on Pipelines. Each is a backend PR, then a frontend PR |

## 1. The list and Board (delivery 1)

### Frame
The Organizations frame, as on Accounts: a transparent top bar with **Pipelines**, the **List | Board** switch, an **Opportunities | Risks** switch, the (delivery 2) Ask button and the bell; the content column scrolls on its own; an empty rail slot for delivery 2. Routes stay `/pipelines/list` and `/pipelines/board`; the kind is `?kind=opportunities|risks` (default opportunities, omitted).

### Summary tiles (clickable filters)
- **Opportunities:** Open pipeline (count · MRR) · Closing in 30 / 90 days · Overdue · Won this quarter (count · MRR) · a stage strip (count per open stage).
- **Risks:** MRR at risk (open count · MRR) · Due in 30 / 90 days · Overdue · Mitigated this quarter · a stage strip.

"This quarter" uses the date the stage last changed (see §2). A tile sets its filter; tapping it again clears it. Totals cover every filtered row, not the page.

### Toolbar and URL state
- **Search:** title, and the organisation or account name.
- **Group:** stage (Board and List default), close month (`2026-10`, …, *Overdue*, *No date*), organisation or account, owner (with Unassigned), department, priority, or none.
- **Sort:** MRR, close date, priority, stage, title; missing values last.
- **Filters:** organisation, account, owner (with Unassigned), stage (open stages by default; closed stages opt-in), priority, department, closes or is due within 30/90/180 days, overdue, no date.
- **Export CSV**, **+ Add** and selection with bulk **Set stage / priority / department / date**, as on Accounts.
Everything lives in the URL.

### List items (never a table)
Each item, grouped by the chosen key:
- the title; beneath it **Part of** the organisation or account (a link, only when the viewer may open it; otherwise the row does not exist — see §2);
- MRR in the workspace currency, the stage tag, priority, department;
- the date: "Closes in 12d", "Overdue 5d", or "No date" (risks: "Due in …");
- a signal tag at most: *Overdue* first, then *High priority* on an open item.
Clicking an item opens it (the existing Opportunity / Risk form, with the new date and Closed Lost). Phones: one column, the item's facts wrap under the title, 44px targets.

### Board
Columns by stage (Closed Lost shown for opportunities, collapsed by default), the same item content as cards; dragging a card sets its stage. When the delivery 2 rail is open below xl, the card opens as a sheet and columns narrow, as on the Accounts Board (`useBoardRail`).

### Add
Pick where it belongs: an organisation or an account (only ones the viewer may open), then title, MRR, stage, priority, department and the date.

### Removed
The Count/MRR toggle, the stat-card banner, the page's `<table>` list views, the client-side filter popover and client totals, and the unused `components/shared/PipelinesTab.tsx` (with its tests).

### The organisation and account pages
Their **Deals & risks** tabs keep their layout; each item gains the date line and the Overdue signal; the forms gain the date and Closed Lost.

## 2. Backend (delivery 1)

- **Model:** `Opportunity.expected_close` and `Risk.due_by` (nullable dates); `Opportunity.Stage.CLOSED_LOST`; `stage_changed_at` (set on create and whenever the stage changes) for "this quarter" tiles. One migration; no data backfill beyond `stage_changed_at = created_at`.
- **Endpoints:** `GET /api/v1/pipelines/opportunities/` and `/risks/` — rows, groups, summary (tiles), filter options, cursor pages; the same response conventions as `/accounts/portfolio/` (unknown parameter values are ignored, never a 400; `ids` narrows, never widens). `…/export.csv` and `POST /api/v1/pipelines/{kind}/bulk/` (set stage, priority, department, date; each id re-read and checked like the single PATCH; one audited batch).
- **Privacy (twice filtered):** a row exists only if the viewer may open its organisation or account (`visible_children_q`) **and** may read it by department (`pipeline_visible_q`); filters only narrow. An organisation or account filter the viewer may not open narrows to nothing. The "Part of" name and every `companies` list served for opportunities and risks list only organisations the viewer may open (`visible_customer_ids`), closing "Known consequences #2" for these two models. Owner options come only from the viewer's own organisation, as on Accounts.
- **Existing endpoints** (`/opportunities/`, `/risks/`, the nested and flat account routes, the detail views) stay for the Deals & risks tabs and the forms, and accept the new fields.
- **Audit:** `opportunity.created|updated|deleted`, `risk.…`, and the bulk batch; no field values in the event beyond ids and the changed field names.
- **Query counts** pinned and flat as the book grows.

## 3. Ask Revenact on Pipelines (delivery 2)

The ✦ rail on the list and Board; one conversation across both kinds and views. Context `{surface: "pipelines", kind, view, filters}`; the server recomputes the viewer's filtered book with the delivery 1 code and answers from the tiles, the stage groups, the largest open items, what is overdue and what closes within 90 days. As on Accounts: server-built labels, a same-reading 400 for a filter the viewer cannot open, record text fenced as untrusted, and shared replies snapshotting every item and organisation or account covered, withheld from a reader who cannot see them all (failing closed). Its own `pipelines` surface and purpose with a `Skill`. "Ask about this" on an item focuses the question on it.

With no `stage` filter in `context.filters`, the two views default to a different set of stages, matching what each already shows without one: the List reads the open stages (its own default), the Board reads every stage (its own default, since the Board shows every stage's column). The server drops a `stage` filter equal to the asking view's own default before storing it, so the stored context (and the origin a History pick reopens) carries an explicit `stage` only when it narrows past that default.

**Withheld context.** For a mentioned reader whose reply is withheld (the shared-reply privacy rule above), the user turn that triggered it comes back with its Ask `context` stripped to `context: null`, and the conversation's `origin` is `null` rather than a context missing its focus. A turn with `context: null` shows no chip (the rail draws a chip only when a turn's `context` is set); a conversation with `origin: null` carries no History tag and a History pick opens it wherever the person already is, rather than navigating anywhere. This holds for every Ask surface, Pipelines included.

## 4. Delivery

1. Backend delivery 1 (model, migration, endpoints, privacy fix, audit, docs), then frontend delivery 1 (page, Deals & risks date line, forms, removals, docs). Backend merges and deploys first.
2. Backend delivery 2 (Ask), then frontend delivery 2.

## 5. Testing

- **Backend:** unit tests for the filters, grouping, dates, overdue and summary; integration tests through the endpoints; privacy tests (blind to one account, another tenant, department rule, an organisation filter the viewer cannot open, `companies` trimmed on every endpoint); the summary equals the rows it covers; pinned query counts; an e2e flow; the migration on existing rows.
- **Frontend:** unit tests for rows, tiles and params; integration through the real store and router with `fetch` stubbed in contract shapes; a jsdom journey per delivery; the house-rules suite over the new files; the Organizations, Accounts and Deals & risks tests still pass.

## Out of scope
- A people-level opportunity owner (the owner filter uses the organisation or account's owner).
- Weighted pipeline or probability per stage.
- Moving the dashboard forecast onto the new dates (a follow-up once dates are filled).
- Scenarios (deferred by the owner, 2026-09-29).

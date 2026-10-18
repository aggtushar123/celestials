# Ask Revenact on the Dashboard — design

Date: 2026-09-24. Project A of the dashboard redesign
(`2026-09-23-dashboard-redesign-design.md`). PRs 1–3 of that spec are merged.

## Goal

Put the Communications "Ask Revenact" rail, with its history, on the
Dashboard, so anyone can ask about what the dashboard shows and get answers
that agree with the numbers on screen and can explain them from the records
behind them.

## Decisions (agreed 2026-09-24)

| Question | Decision |
|---|---|
| What answers draw on | The screen and its records: the server recomputes the current tab's figures for the current filters and can cite the records behind them. |
| History | One history across Communications, Copilot and Dashboard; each dashboard conversation is tagged with where it started. |
| Tab or filter change mid-conversation | Follows the screen: each question is grounded in what is on screen when it is sent, and shows that as a chip. |
| Layout | Collapsible rail; the drill panel opens over it. |
| Entry points | Typing; "Ask about these" in the drill panel; "Why?" on attention rows; ~~three suggested questions per area~~ (see the amendment below). |
| Grounding approach | A: the client sends *where* it is; the server computes *what* is there. The client never sends figures. |

## 1. Contract

`POST /api/v1/copilot/messages/` gains an optional `context`. Absent, the
endpoint behaves exactly as today (Communications keeps its `[About: …]`
text prefix).

```json
{
  "conversation_id": 7,
  "content": "Why is at-risk ARR up?",
  "context": {
    "surface": "dashboard",
    "area": "revenue",
    "view": "forecast",
    "filters": {"owner": "2", "lifecycle": "customer", "customer": ""},
    "focus": null
  }
}
```

- `surface`: only `"dashboard"` for now.
- `area`: `overview | revenue | health | support`.
- `view`: must be one of that area's sub-views; the backend mirrors the
  frontend `areas.ts` catalogue in a small table (`DASHBOARD_VIEWS`). The
  Overview has no sub-view (`view: null`).
- `filters`: only the shared keys `owner`, `lifecycle`, `customer`. Unknown
  keys are dropped. Unknown values are ignored, as the dashboard endpoints
  already do.
- `focus`: `null`, or
  - `{"kind": "companies", "ids": [..]}`: at most 200 ids. They are
    intersected with the viewer's filtered, visible book, and ids outside it
    are silently dropped (no signal about other people's customers).
  - `{"kind": "attention", "key": "risk:12"}`: must be an item on the
    viewer's own attention list, the same check snoozing uses.
- Errors are a `400` with field errors for a wrong `surface`, `area`,
  `view`, `focus.kind`, an over-long `ids` or a key not on the list. An
  attention key that is not the viewer's returns the same error as a
  malformed one.

The response is unchanged, plus `context` echoed on the user message and
`origin` on the conversation.

## 2. Server grounding

New module `services/copilot/dashboard_grounding.py`:
`build_dashboard_grounding(user, context, question) -> Grounding`
(a digest and sources, the shape `SendMessageView` already feeds the model).

**First filter, always:** `forecast.filtered_customers(user, filters)`,
which starts from `live_customers(user)`. Nothing outside that set is read.

**Figures, one builder per area**, each calling the same service code as
the area's endpoint, so the digest equals the screen:

| Area | Digest |
|---|---|
| Overview | top 10 attention items (`attention.rules.build_items` + the viewer's snoozes via `snooze.visible_items`), and the three headline figures (ARR today and at-risk, book at Good and needs-action, open tickets and oldest) |
| Revenue | the forecast bridge (starting ARR, new, expansion, contraction, churn), at-risk ARR, the 10 largest movers |
| Health | the triage summary, the accounts needing action with their factors (`services/customers/triage.py`), counts by direction |
| Support | open count, oldest open, the priority × status split, the 10 accounts with the most open High/Critical tickets |

Money is converted to the organisation currency and labelled with it.

**Records.** The target accounts are the focus accounts, else any accounts
the question names (the existing company matching in `retrieval.py`,
limited to the filtered set). For them, the builder pulls through the
existing retrieval, which keeps its record-level rules: tickets
(`visible_tickets`), emails (`visible_emails`), renewal and health facts,
and contacts. For an attention focus of kind `anomaly`, evidence comes
through `visible_evidence`. The anomaly title follows the attention rule:
the stored title only for `sees_everything(user)`, otherwise "Similar
reports across N of your companies".

**Prompt.** A system prompt tells the model to answer only from the digest
and the sources, to say when the answer is not there, and to cite
sources. The digest is labelled with the area, view and filters it was
computed for.

**Metering.** A new purpose `dashboard` goes in `usage.PURPOSES` and
`skills.py` (surface `/dashboard`). The budget is checked before the call
and returns `429` when it is exhausted, like the other purposes.

## 3. Storage

- `Message.context`: JSON, nullable. The validated context each user
  message was asked on (after the focus intersection). It holds ids and
  filter values only, never record text.
- `Conversation.origin`: JSON, nullable. It is set once, from the first
  dashboard message's context without its focus, and is never overwritten.
- Classification: both are `internal`, holding ids and filter values only.
  Add rows to `docs/data-classification.md`.

## 4. Frontend

**Shared rail.** `CopilotRail` and `HistoryPopover` move from
`src/pages/communications/` to `src/components/copilot/`, and Communications
imports them from there. The rail's `context` prop becomes a union:

```ts
type RailContext =
  | { kind: 'label'; label: string; icon?: ReactNode }         // Communications: text prefix, as today
  | { kind: 'dashboard'; context: DashboardContext; label: string };
```

A `dashboard` context is sent as the structured `context` field with no text
prefix. `label` is the chip text, e.g. "Revenue › Forecast · Owner: Priya".

**Mounting.** `DashboardFrame` renders `[scrolling content][AskRail]`. The
rail persists across areas, so a conversation survives tab changes. The
drill panel is positioned over the rail (it no longer takes its own column
beside the content).

**`useDashboardContext()`** builds `DashboardContext` from the current route
(area and view via `areas.ts`) and `useDashboardFilters(SHARED_KEYS)`, and
builds its chip label from the filter option names. It is read at send time,
so each question carries the screen as it is at that moment. Each user
message shows its own chip, from `message.context`.

**Collapse.**
- It is open by default at `xl` and wider, and collapsed to a slim "Ask"
  tab below `xl`.
- The user's open or closed choice is remembered in `localStorage`, with
  every read and write wrapped in try/catch and falling back to the
  default.
- Below `sm`, a header "Ask" button opens the rail as a full-screen sheet
  with a close button. Focus moves into the sheet and returns on close.

**History.**
- `HistoryPopover` shows each conversation's `origin` tag.
- Reopening a dashboard-origin conversation from the dashboard navigates to
  its area and view with its filters, then shows the thread.
- From Communications or Copilot it opens as plain text, with the tag
  still shown.

**Entry points.**
- **Drill panel, "Ask about these":** opens the rail (expanding it if it is
  collapsed) with focus `{kind:'companies', ids}` and a prefilled, editable
  question "Why are these in <segment>?". It is not sent until the user
  sends it.
- **Attention row, "Why?":** a quiet button beside Done. It sends "Why is
  this on my list?" with focus `{kind:'attention', key}` immediately. Its
  accessible name is "Ask why <title> is on my list".
- ~~**Suggested questions:** when the conversation is empty, show three fixed
  questions for the current area from `components/copilot/suggestions.ts`
  (no model call). Clicking one sends it.~~ Amended 2026-09-24: suggestions
  removed at the user's request to match Communications. The empty rail
  shows Communications' line instead.

**States.**
- In flight: a "Thinking…" message skeleton. There is no streaming.
- `429`: "This month's AI budget is used up." with no retry.
- Other errors: an inline error with Retry, and the question is kept.
- Sources render as today.
- Every control has hover, focus-visible and disabled states and an
  accessible name, and focus returns to the input after sending.
- House rules apply: tokens only, sizes 11/13/15/22, no card-in-card.

## 5. Testing

**Backend.**
- The digest equals the endpoints: for each area, the digest's figures
  equal what that area's endpoint returns for the same user and filters.
- Visibility:
  - another CSM's customer never appears, including when its ids are passed
    as focus (they are dropped silently);
  - a ticket outside the viewer's department is never cited;
  - anomaly titles follow `sees_everything`;
  - an attention key not on the viewer's list returns the generic 400.
- Validation errors.
- `origin` is set once, from the first dashboard message.
- An exhausted budget returns 429.
- Communications sends without `context` behave exactly as before.
- The model call is stubbed, and tests assert on the prompt it receives.

**Frontend.**
- `useDashboardContext` for each route and filter combination.
- A send carries the context, and the chip matches it.
- A follow-up after a filter change carries the new filters.
- The history tag is shown, and reopening navigates to its view.
- The drill and "Why?" entry points send the right focus.
- ~~The suggestions for each area.~~ (removed with the suggestions, 2026-09-24)
- Collapse is remembered, and storage failure falls back safely.
- The phone sheet and its focus handling.
- The 429 message.
- A Communications regression test: it still sends the text prefix and no
  `context`.

**Browser check.**
1. Ask on the Overview.
2. Change a filter and ask a follow-up.
3. Open a drill and use "Ask about these".
4. Use "Why?" on an attention row.
5. Reopen the conversation from history, which should restore the view.

## 6. Delivery

Two PRs; the backend merges and deploys before the frontend.

1. **Backend:** `context` validation, `dashboard_grounding`,
   `Message.context` and `Conversation.origin` with their migration, the
   `dashboard` purpose, and docs (API_CONTRACTS, data-classification, PRD,
   schema).
2. **Frontend:** the shared rail, the dashboard mount with collapse and
   the phone sheet, the context hook and chips, the history tag and
   restore, the three entry points, and docs (app flow, UI/UX, repo
   architecture).

## Out of scope (follow-ups)

- Streaming answers.
- Tool-use grounding, where the model fetches data itself.
- `build_grounding` (Communications and Copilot) scopes its digest by the
  owned book rather than `live_customers`. It should move to the twice-filter
  rule.
- `/tickets/stats/` ignores `owner=unassigned`.
- A guard at the source for anomaly titles: reject model titles that name
  customers in `detect.py`, and apply the same check in `AnomalyListView`.

# Work, delivery 2 ("Recommended"): API contract

Backend plan: `docs/superpowers/plans/2026-10-07-work-recommended-backend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-07-work-round-design.md` §2. Every path is under `/api/v1/`,
every route is `IsAuthenticated`, every body is JSON. Dates are `YYYY-MM-DD`; timestamps are
ISO 8601 UTC as DRF writes them (`2026-10-07T09:30:00.123456Z`). "Today" is the server's date
(UTC) until delivery 3 moves it to the workspace timezone. Delivery 1's shapes (TaskRow, Event,
the task panel) are unchanged and referred to by name.

## What a recommendation is

Revenact reads the workspace once a day (and on "Run now") and recommends a task wherever a
signal triggers: a renewal due, a health drop, urgent tickets, overdue tasks, unanswered
questions, a live anomaly, or a task the AI agent proposed. Each lands in one person's queue (the
**recipient**) with a **suggested assignee**. There is at most one open recommendation per kind
and record (per proposal for the AI agent's); a recommendation is open, assigned, dismissed or
expired (its signal stopped). An AI agent's that expired (its source turned off, or nobody could
receive it) comes back as a fresh open recommendation while its proposal is still pending; one
assigned or dismissed never does.

## Who sees and decides one

- **Decides:** its recipient, anyone above its suggested assignee in the org chart, or a reader
  with `view_all_accounts`. Leadership without `view_all_accounts` has no extra right here.
- **Record rule:** only on an organisation or account the reader may open. A recommendation
  about anything else is counted in `hidden`, never named, and its routes answer 404.
- An AI-agent recommendation (`kind: "agent"`) is the same decision as the proposal in Brain ›
  Waiting on you: deciding it in either place settles both.

## Shared shapes

**RecommendationRow** (`GET /work/recommendations/` items):

```json
{
  "id": 5,
  "kind": "renewal_due",
  "title": "Prepare Dough Co's renewal",
  "why": {
    "facts": ["Renews in 30 days", "Renewal date 6 Nov"],
    "evidence": [{"label": "Dough Co", "link": "/organizations/2"}]
  },
  "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "suggested_assignee": {"id": 3, "name": "Carl CSM", "active": true, "can_open": true},
  "recipient": {"id": 2, "name": "Mona Manager"},
  "defaults": {"title": "Prepare Dough Co's renewal", "due_date": "2026-10-30", "priority": "high"},
  "proposal": null,
  "created_at": "2026-10-07T00:05:00.123456Z"
}
```

- `kind`: `renewal_due | health_drop | urgent_tickets | overdue_tasks | open_questions | anomaly |
  agent`.
- `why.facts`: plain sentences, shown as a short list. `why.evidence`: links inside the app
  (`/organizations/<id>`, `/accounts/<id>`, `/brain/anomalies`), each `{label, link}`.
- `record.kind`: `customer` (an organisation, `/organizations/<id>`) or `account`
  (`/accounts/<id>`).
- `suggested_assignee`: `null` when nobody could be suggested (the item went to a fallback
  recipient). `can_open: false` or `active: false` means that person can no longer take it: do
  not prefill them (the Assign picker is `GET /work/assignees/?customer=|account=`, delivery 1).
- `defaults`: what Assign prefills. `due_date` is the renewal date minus 7 days for
  `renewal_due` (never before today), the proposal's date for `agent` (never before today),
  otherwise today plus 3 working days (Monday to Friday). `priority` is `high` for
  `renewal_due`, `health_drop`, `urgent_tickets` and `anomaly`, `medium` for `overdue_tasks` and
  `open_questions`, the proposal's own for `agent`.
- `proposal`: the AI-agent proposal's id for `kind: "agent"`, else `null`.

Sentences `facts` take, by kind:

| kind | title | facts |
|---|---|---|
| `renewal_due` | "Prepare <name>'s renewal" | "Renews in 9 days" / "Renews in 1 day" / "Renews today" / "Renewal is 3 days overdue"; "Renewal date 6 Nov" |
| `health_drop` | "Find out why <name>'s health fell" | "Health fell 5.6 → 4.9 since 30 Sep" |
| `urgent_tickets` | "Get <name>'s urgent tickets moving" | "3 urgent tickets open"; "Oldest opened 6 days ago" |
| `overdue_tasks` | "Catch up on <name>'s overdue tasks" | "2 tasks overdue by 2 days or more"; "Oldest was due 12 Sep" |
| `open_questions` | "Get <name>'s open questions answered" | "2 questions open for 3 days or more"; "Oldest asked 4 days ago" |
| `anomaly` | "Check <name> against a live anomaly" | "Named in 1 live anomaly"; "Last seen 2 days ago" |
| `agent` | the proposed task's title | "Proposed by the AI agent"; "The agent suggested Carl CSM" (when it named someone) |

No fact ever names another record, a ticket's, task's or question's text, or an anomaly's
model-written title: only the record itself and counts.

**DecidedRecommendation** (the decision routes, and the 409):

```json
{
  "id": 5,
  "status": "assigned",
  "decided_by": {"id": 2, "name": "Mona Manager"},
  "decided_at": "2026-10-07T09:30:00.123456Z",
  "task_id": 41,
  "dismiss_reason": "",
  "dismiss_note": ""
}
```

- `status`: `open | assigned | dismissed | expired`. `decided_by` and `decided_at` are `null`
  while open; an expired one has `decided_by: null` and `decided_at` when it expired.
- `task_id`: the task it became (assigned only), else `null`.
- `dismiss_reason`: `already_handled | not_relevant | wrong_person | other`, or `""`.
  `dismiss_note`: the reader's text for `other`, else `""`. An AI-agent recommendation
  rejected in Brain reads `other` with the Brain note (or "Rejected in Brain").

## `GET /work/recommendations/?scope=me|team`

The open recommendations the caller may decide, newest first.

```json
{
  "scope": "team",
  "items": [RecommendationRow],
  "count": 3,
  "hidden": 1
}
```

- `me`: those in the caller's own queue (they are the recipient). `team`: everything the caller
  may decide (their queue, those suggesting anyone below them, and for a `view_all_accounts`
  caller every open one in the workspace).
- `scope` defaults to `team` for a caller with reports or `view_all_accounts`, else `me`.
- At most 100 `items`; `count` is the full total. `hidden`: open recommendations in the same set
  about records the caller cannot open ("N more about accounts you can't open"). Counted, never
  listed.
- The sidebar badge adds `count` (scope `team`) to Today's `counts.overdue`.
- Refusal: `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose me or team."}`.

## `POST /work/recommendations/<id>/assign/`

```json
{
  "assignee_id": 3,
  "due_date": "2026-10-30",
  "title": "Prepare Dough Co's renewal",
  "priority": "high"
}
```

- `assignee_id` is required; `due_date`, `title` and `priority` are optional and default to the
  row's `defaults`.
- `201`:

  ```json
  {"recommendation": DecidedRecommendation, "task": TaskRow}
  ```

- The task: on the recommendation's record, `source: "recommendation"` (`"agent"` for an
  AI-agent recommendation), `created_by` the caller, `description` built from the facts
  (`"Recommended by Revenact:\n- Renews in 30 days\n- Renewal date 6 Nov"`). Its trail starts
  with `created` (`data` carries `recommendation: <id>`, and `proposal: <id>` for an agent one)
  then `recommended` (`data: {facts: [...]}`). The assignee is told (`task_assigned`) unless they
  are the caller.
- An AI-agent recommendation approves its proposal (exactly one task, linked to both; the
  proposal reads approved in Brain). The caller's chosen person is used, not the agent's.
- Audited as `work.recommendation_assign` (`kind`, `decided_as`: `recipient`, `chain` or
  `company`, as held when the decision is made under its row lock, `task`).
- Refusals, in this order:
  - `404 {"detail": "No such recommendation."}`: another workspace, a record the caller
    cannot open, or a recommendation gone by the time it is locked;
  - `403 {"code": "CANT_DECIDE", "detail": "You can't decide this recommendation."}`, also when
    a refresh re-routed it away from the caller between the check and the decision;
  - `400` field errors: `{"assignee_id": ["Choose who does it."]}` (missing, `null`, not a
    number), `{"due_date": ["Choose a date."]}`, `{"title": ["Give the task a title."]}` or
    `{"title": ["Keep the title under 255 characters."]}`,
    `{"priority": ["Choose high, medium or low."]}`;
  - `409` when it is no longer open (someone decided first, or it expired):

    ```json
    {
      "code": "ALREADY_DECIDED",
      "detail": "Mona Manager already assigned this.",
      "recommendation": DecidedRecommendation
    }
    ```

    `detail` is "<name> already assigned this." / "<name> already dismissed this." /
    "This recommendation has expired.";
  - `400 {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."}`
    (or `"... this account."`): the assignee is not an active member who can open the record.

## `POST /work/recommendations/<id>/dismiss/`

```json
{"reason": "other", "note": "They are moving to annual billing"}
```

- `reason` is required: `already_handled | not_relevant | wrong_person | other`. `note` is
  required with `other` (non-blank, at most 255 characters after trimming) and ignored, at any
  length, otherwise.
- `200 {"recommendation": DecidedRecommendation}`.
- An AI-agent recommendation also rejects its proposal (its note is the reason's label, plus
  ": <note>" for `other`).
- A dismissed signal is not recommended again for the workspace's `dismiss_cooldown_days`
  unless it gets worse (a renewal becomes overdue; a health drop falls by another full `drop`;
  more tickets, tasks, questions or anomalies than when dismissed).
- Audited as `work.recommendation_dismiss` (`kind`, `decided_as`, `reason`).
- Refusals: as assign (404, 403, then 400, then 409), with the field errors
  `{"reason": ["Choose already handled, not relevant, wrong person or other."]}`,
  `{"note": ["Say why."]}`, `{"note": ["Keep the note under 255 characters."]}`.

## `POST /work/recommendations/refresh/`

"Run now" in Settings › Work. `manage_org_settings` only. No body.

```json
{"created": 2, "updated": 5, "expired": 1, "unrouted": 0, "notified": 2, "failed": []}
```

- `created`: new open recommendations; `updated`: open ones refreshed in place; `expired`: open
  ones whose signal stopped (or whose source was turned off); `unrouted`: signals nobody could
  receive (no active member able to open the record); `notified`: recipients told;
  `failed`: the sources that failed this run (each fails on its own; the others still ran),
  and `"recommendations_waiting"` when the notice failed (the recommendations stand).
- Audited as `work.recommendations_refresh`.
- Refusal: `403 {"detail": "You don't have permission to change organisation settings."}`.

## `GET /work/settings/`

Any member.

```json
{
  "recommend_to": "manager",
  "sources": {
    "renewal_due": {"enabled": true, "days": 30},
    "health_drop": {"enabled": true, "drop": 0.5, "window_days": 14},
    "urgent_tickets": {"enabled": true, "min": 1},
    "overdue_tasks": {"enabled": true, "days": 2},
    "open_questions": {"enabled": true, "days": 3},
    "anomaly": {"enabled": true},
    "agent": {"enabled": true}
  },
  "dismiss_cooldown_days": 14,
  "can_edit": false
}
```

- `recommend_to`: `manager` (the suggested person's manager receives it, when they have an
  active one who can open the record) or `owner` (the suggested person receives it).
- `sources`, per kind: `days` (renewal: within this many days, or overdue; overdue tasks: overdue
  by at least this many days; questions: open at least this many days), `drop` and
  `window_days` (health now at least `drop` below the latest reading from `window_days` ago or
  earlier), `min` (at least this many open critical or high tickets).
- `can_edit`: the caller holds `manage_org_settings`; everyone else sees the page read-only.
- Delivery 3 adds fields here (timezone, working days, escalation, digest, `email_ready`);
  clients ignore keys they do not know.

## `PATCH /work/settings/`

`manage_org_settings` only. Any of the `GET` fields but `can_edit`; inside `sources`, any kind
and any of its fields (the rest keep their values):

```json
{
  "recommend_to": "owner",
  "sources": {"renewal_due": {"days": 45}, "health_drop": {"enabled": false}},
  "dismiss_cooldown_days": 7
}
```

- `200` with the `GET` shape. Unknown top-level keys are ignored; a body that changes nothing
  writes nothing. Audited as `work.settings_update` (`fields`).
- Limits: `days` and `window_days` whole numbers 1–120; `min` a whole number 1–50; `drop` a
  number 0.1–5 (kept to one decimal place); `dismiss_cooldown_days` a whole number 0–120;
  `enabled` `true` or `false`.
- Refusals (`400`, nothing saved):
  - `{"recommend_to": ["Choose manager or owner."]}`;
  - `{"dismiss_cooldown_days": ["Choose a whole number from 0 to 120."]}`;
  - `{"sources": {"renewal_due": {"days": ["Choose a whole number from 1 to 120."]}}}` (and the
    same for `window_days`, `overdue_tasks.days`, `open_questions.days`);
  - `{"sources": {"urgent_tickets": {"min": ["Choose a whole number from 1 to 50."]}}}`;
  - `{"sources": {"health_drop": {"drop": ["Choose a number from 0.1 to 5."]}}}`;
  - `{"sources": {"<kind>": {"enabled": ["Choose on or off."]}}}`;
  - `{"sources": {"<kind>": {"<field>": ["Unknown setting."]}}}`;
  - `{"sources": {"<kind>": ["Unknown source."]}}`;
  - `{"sources": {"<kind>": ["Send each source's settings as one object."]}}`;
  - `{"sources": ["Send the sources as one object."]}`;
  - `{"non_field_errors": ["Send the fields as one object."]}`;
  - `403 {"detail": "You don't have permission to change organisation settings."}`.

## Changed existing routes

**`POST /metrics/proposals/<id>/approve/`** and **`.../reject/`** (Brain › Waiting on you) also
settle the proposal's open recommendation: approve marks it assigned (linked to the task it made,
`decided_by` the approver); reject marks it dismissed (`dismiss_reason: "other"`, the note or
"Rejected in Brain"). Their responses are unchanged.

**Event `created`** (delivery 1's trail) carries `recommendation: <id>` for a task made from a
recommendation.

## Notifications

New kind `recommendations_waiting` on `GET /notifications/`:

```json
{
  "id": 30,
  "kind": "recommendations_waiting",
  "message": "3 tasks recommended for your team.",
  "link": "/work/recommended",
  "actor": null,
  "is_read": false,
  "created_at": "2026-10-07T00:05:00.123456Z"
}
```

- After each run, every recipient with new open recommendations, or an open one re-routed to
  them, is told once, and at most once a day; never the person who clicked "Run now".
- One new item, to a recipient who may open its record: "Revenact recommends “Prepare Dough
  Co's renewal”." Otherwise counted: "N tasks recommended for you." when every new item suggests
  the recipient themselves, else "N tasks recommended for your team." Never names a record the
  recipient cannot open.
- Assigned, dismissed and expired recommendations are never notified about again.

# Segments: saved, rule-based groups of organisations, accounts or contacts

Agreed with the owner on 2026-10-03.

## 0. Why

The sidebar's tools group (Segments, Project Management, Scenarios, Surveys, Campaigns, Canvas) is to become one section that managers and individuals use to create impact. The owner chose to organise it as one loop:

- **Segments decide who.**
- **Scenarios decide when.** A scenario is triggered by a segment entry or exit, by a score crossing a line, or by a schedule.
- **Actions decide what:**
  - a survey;
  - a campaign;
  - a plan with tasks;
  - a notification.

  The results feed back into health and CSAT.

Segments come first because every later step needs them. Today `/segments` is a sidebar link to the "Under Construction" page. No saved segment, saved filter or membership history exists anywhere.

Section build order, agreed 2026-10-03:

0. Campaign recipient privacy fix
1. Segments (this spec)
2. Surveys (emailed link to a hosted form)
3. Scenarios v2
4. Plans (project management)
5. Campaigns
6. Canvas

## Decisions (agreed 2026-10-03)

| Topic | Decision |
|---|---|
| Who builds | Anyone. A segment only ever contains records its viewer may open, so a manager's segment covers their team's book through the existing visibility rules. |
| Kind | One kind per segment: organisations, accounts or contacts. |
| Membership | Rules, plus records the owner pins in or keeps out. A contacts segment may also use fields of the contact's organisation or account. |
| Sharing | Private, the workspace, or chosen teammates. Viewers see the same rules but only the members they may open, plus a count of the rest that names nobody. Only the owner edits or deletes. Others can duplicate a segment into their own. |
| Rule logic | Match all or any of a list of conditions. A condition may be one group with its own all/any, and groups do not nest further. |
| Changes | Membership is live whenever viewed. The nightly job records who entered and who left. Each segment has an optional daily in-app alert to its owner. Scenarios (delivery 3) act on these entry and exit records. |

## 1. Model and rules (backend, `services/segments`)

The existing `services/customers/segments.py` holds revenue brackets, also called "segments" in metrics (the "Size band" dimension). It is unrelated. The new app's names (`Segment`, `SegmentChange`) and URLs (`/segments/`) do not collide with it. The metrics dimension keeps its key, and its label stays "Size band".

### `Segment`

| Field | Meaning |
|---|---|
| `organisation` | The tenant. |
| `owner` | The person who owns the segment. |
| `name`, `description` | Free text. |
| `kind` | `customer`, `account` or `contact`. |
| `rules` | JSON. See the rule shape below. |
| `pinned_ids` | Ids of records kept in, whatever the rules say. |
| `excluded_ids` | Ids of records kept out, whatever the rules say. |
| `sharing` | `private`, `workspace` or `people`. |
| `shared_with` | The teammates chosen when sharing is `people`. |
| `alert_on_changes` | Whether the owner gets the daily alert. |
| `paused` | Set when the owner leaves. Nightly evaluation stops while it is set. |
| `last_members`, `last_evaluated_on` | The member ids and date of the last nightly evaluation, as the owner. These are what the next run compares against. |
| `created_at`, `updated_at` | Timestamps. |

### `SegmentChange`

One row per change: segment, record id, change (`entered` or `left`), date, and `reason`. The reason holds the field names that changed the match, never their values. A daily copy of every member is never stored.

### Rule shape

The same field/operator/value shape the scenario condition editor uses:

```json
{"match": "all", "conditions": [
  {"field": "csat_score", "op": "lt", "value": 60},
  {"group": {"match": "any", "conditions": [
    {"field": "renewal_date", "op": "within_next", "value": 90},
    {"field": "health_category", "op": "is", "value": "poor"}]}}]}
```

**Operators:**

- `is`, `is_not`, `in`
- `gt`, `lt`, `between`
- `within_next`, `within_last` (days)
- `is_empty`, `is_not_empty`

Each field accepts only the operators that make sense for its type.

**Fields** (a fixed registry; anything else is refused with a clear 400):

- **Organisations:**
  - Lifecycle stage.
  - Health score and health category (the `HEALTH_THRESHOLDS` bands).
  - CSAT %, NPS (score or band), CES %.
  - ARR, through the workspace's global-attribute mapping, converted to the workspace currency.
  - Renewal date (overdue counts as within).
  - Owner (an id or `unassigned`).
  - Product, seat use %.
  - Open tickets (unresolved), days since last touch.
  - AI pulse, CSM pulse.
  - Churned (the existing `CHURNED` test), archived.
  - Created date.
  - Any AI attribute that applies to organisations, using its latest value and its value type.
- **Accounts:** the same, wherever an account has the field. Accounts have no CES, churn or archive. ARR is the account's own `arr`.
- **Contacts:**
  - Role, sentiment, status, language, days since last contacted.
  - Any organisation or account field, prefixed `parent.` and applied to the contact's organisation or account.

**Defaults:** churned and archived organisations are left out unless a rule names `churned` or `archived`, as on the Organizations list.

**Out of scope for now:** custom-object fields, and per-message sentiment or topics.

**Compilation:**

- Rules compile to one `Q` over the visible queryset of the kind. They reuse the Organizations and Accounts portfolio helpers (`health_q`, `renewing_q`, `NPS_Q`, `CHURNED`), the health-input annotations (open tickets, last touch), contact last-contact annotations, and a latest-value subquery for AI attributes.
- After the rules: pins are added, exclusions are removed, and visibility is applied last.

**Limits:** each person may own up to 50 segments, and each segment may have up to 20 conditions.

## 2. Privacy, evaluation and history

### Twice filtered, always

Members are computed **for the viewer**. The rules run over `visible_customers`, `visible_accounts` or the visible contacts (`visible_children_q`) of the person looking.

- **Shared viewers** get the rules over their own book, plus `hidden_count`: the owner's members they cannot open. This is a count only and names nobody.
- **Pins:** a pinned record the viewer cannot open is neither shown nor named.
- **Rule values that name things:**
  - An organisation, account or owner the viewer cannot open reads "an organisation you can't open", and so on.
  - Owner names come only from the viewer's own workspace.
- **AI attributes:** a rule on an AI attribute never shows a value the viewer could not otherwise see.
- **Missing and hidden read the same:** a segment the viewer may not see reads the same as one that does not exist (404).

### Endpoints

- `GET /api/v1/segments/` lists Mine, Shared with me and All.
- `POST /api/v1/segments/` creates a segment.
- `GET`, `PATCH` and `DELETE /api/v1/segments/<id>/`. Writes are owner only.
- `POST /api/v1/segments/<id>/duplicate/`.
- `GET /api/v1/segments/<id>/members/` returns the members for the viewer, with the same rows, cursor paging, search and sort as the kind's portfolio endpoint. It also returns summary tiles: members, ARR covered, average health, average CSAT, and entered and left over the last 7 days.
- `GET /api/v1/segments/<id>/members/export.csv` returns the members the viewer may open, and is audited.
- `GET /api/v1/segments/<id>/changes/` returns the entry and exit history, filtered to records the viewer may open, plus a hidden count.
- `POST /api/v1/segments/preview/` evaluates unsaved rules for the builder's live preview. It returns a count, the first ten members and the totals.
- `PATCH /api/v1/segments/<id>/members/<record_id>/` pins or excludes a record. Owner only, and only a record the owner may open.

### Nightly step

A new step in `run_health_maintenance` runs after the health recalculation and the pulses.

- For each active segment, it evaluates the members **as the owner**. It compares them with `last_members`, writes `SegmentChange` rows, then updates `last_members` and `last_evaluated_on`. The 30-day size sparkline is rebuilt from the current count and the changes.
- If `alert_on_changes` is set, it sends one in-app notification per segment per day: "Renewal risk: 3 entered, 1 left", linking to the Changes tab. This needs a new `Notification.Kind`.
- A segment whose owner is inactive is paused.
- The step is idempotent: one run per date.
- A failure in one segment is logged and skipped, as the other steps do.

### Audit

These events are audited, with ids and changed field names only:

- `segment.created`
- `segment.updated`
- `segment.shared`
- `segment.duplicated`
- `segment.deleted`
- `segment.member_pinned`
- `segment.member_excluded`
- `segment.exported`

### Performance

- Query counts are pinned and stay flat as members grow.
- The preview is limited to the first ten members plus the totals.

## 3. Pages (frontend)

All pages use the Kinso look: tokens only, type at 11, 13, 15 and 22px, numbers in DM Mono, 44px touch targets on phones, and lists made of rows rather than tables. They work on phones.

### `/segments`

- Each row shows the name, kind, member count with today's change ("+3 / −1"), a 30-day size sparkline, the owner, and a shared badge.
- Mine, Shared with me and All tabs; a search box; and **+ New segment**.
- An empty state explains what a segment is and offers the shortcut below.

### Builder (`/segments/new`, `/segments/:id/edit`)

- **Basics:** name, kind and description.
- **Rules:** written as readable rows ("*CSAT %* is less than *60*"). There is an All/Any switch, **+ Add condition** and **+ Add group**. Each field gets the right value input: number, percent, date window, choice list, owner picker, or a server-searched organisation or account picker.
- **Live preview** beside the rules (stacked on phones): "41 organisations match", the first ten, and the totals.
- **Sharing** and **Alert me on changes**.

### `/segments/:id`

- **Header:** the name, and the rules as one sentence. The owner and sharing, then Edit, Duplicate, Delete and Export CSV. Edit and Delete are for the owner only.
- **Tiles:** members, ARR covered, average health, average CSAT, and entered and left in the last 7 days.
- **Members tab:** reuses the Organizations, Accounts or Contacts list rows, search, sort and grouping. Each row has **Pin** and **Keep out** in its menu (owner only).
- **Changes tab:** a day-by-day history of entries and exits, with the reason.
- **For a shared viewer:** "12 more members you can't open".

### Save as segment

The Organizations, Accounts and Contacts lists gain a **Save as segment** action beside Filters. It turns the current URL filters into a new segment's rules and opens the builder.

### Not in this delivery

- Ask Revenact on Segments.
- Segments as survey or campaign audiences (deliveries 2 and 5).
- Scenario triggers on entry and exit (delivery 3).

## 4. Delivery

1. **Backend PR:**
   - the app, model and migration;
   - the rule registry and compiler;
   - the endpoints and the nightly step;
   - the notification kind;
   - audit, tests and docs (API_CONTRACTS, audit-events, data-classification, PRD, TRD, schema).
2. **Frontend PR:**
   - the routes and pages;
   - the builder;
   - Save as segment;
   - tests and docs (03 UI/UX, 04 app flow, repo-architecture).

The backend PR merges and deploys first.

## 5. Testing

### Backend

- **Unit tests:**
  - every field and operator compiles correctly, for each kind;
  - groups;
  - pins and exclusions;
  - the churned and archived defaults;
  - ARR currency conversion;
  - AI attribute latest value;
  - contact `parent.` fields;
  - the registry refuses unknown fields and operators.
- **Privacy:**
  - blind to one account;
  - another tenant;
  - shared viewers see only their own members and a `hidden_count`;
  - rule values that name hidden records;
  - pins of hidden records;
  - non-owners cannot edit;
  - a hidden segment returns 404.
- **Nightly step:**
  - entries and exits;
  - idempotent per date;
  - the alert fires once per segment per day;
  - an inactive owner pauses the segment.
- **Other:**
  - pinned query counts;
  - the summary equals the members it covers;
  - an end-to-end flow.

### Frontend

- Unit tests for the rule rows and the sentence rendering.
- Integration tests through the real store and router, with fetch stubbed in contract shapes.
- A jsdom journey: build, preview, save, open, pin, Changes, Save as segment.
- The house-rules suite over the new files.
- The Organizations, Accounts and Contacts tests still pass.
- A browser check at 1440px (light and dark) and at 375px.

## Out of scope

- Custom-object fields.
- Per-message sentiment rules.
- Segment-based reporting dashboards.
- Real-time (on-save) entry detection.
- Ask on Segments, which comes in a later round.

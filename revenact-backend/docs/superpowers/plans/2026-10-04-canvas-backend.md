# Canvas: live stakeholder maps, backend (delivery 6 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `customers.Canvas` into a live stakeholder map: positions and labelled relationships are stored and checked on every save, each person's role, sentiment, last contact, latest survey answer and unsubscribed flag are worked out for the reader on every read, a new map can be built from the record's people, a stale save is refused, and only a map's creator or their managers may delete it.

**Architecture:**
- `Canvas` gains `created_by`, `updated_by` and `version`. No new tables.
- `services/customers/canvas.py` holds the map's rules: the stored shape read back in the contract's form (`stored_nodes`, `stored_edges`), the checks a save must pass (`clean_name`, `clean_nodes`, `clean_edges`) and the "from people" layout (`people_nodes`, `layout`).
- `services/customers/canvas_payloads.py` reads: `visible_canvases` (two `id IN` subqueries), the rows, and `canvas_payload`, which classifies every node (person, hidden, removed) and works out the facts of the people the reader may open in a fixed number of queries.
- `services/customers/canvas_views.py` holds the four views. PATCH locks the canvas row `FOR NO KEY UPDATE`, compares `version`, validates, saves and audits in one transaction.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL 16 in CI and production (`FOR NO KEY UPDATE`, `DISTINCT ON`, JSONB `@>`), `TestCase`/`APIClient`, `LiveServerTestCase` for e2e.

**Spec:** `react-ts-app/docs/superpowers/specs/2026-10-04-canvas-design.md` (frontend repo, branch `feat/canvas`), agreed with the owner on 2026-10-04. This plan covers its backend half: §0, §1 and §4 (the API contract, binding; no field is renamed). §2 is the frontend and is read here for context only.

**Branch:** `feat/canvas` (already checked out at `94585a4`, main with Campaigns #89). Stay on it and do not push.

**Merge order:** this backend PR merges and deploys **before** the frontend PR, and the two should merge back to back. This delivery **changes an existing API** (contract notes 4–7): the canvas lists stop being bare arrays, `POST canvases/` takes `customer`/`account` instead of `customer_id`/`account_id`, PATCH needs `version`, the nested routes stop taking POST, and DELETE can answer 403. The old `/canvas` pages stop working against the new backend until the frontend PR deploys.

## Contract notes

The frontend plan is reconciled against these. Each one either follows the real code where spec §4 disagrees with it, or settles something §4 leaves open.

1. **`role` is the stored slug, as on every contact payload.** `Contact.role` holds `decision_maker`, `economic_buyer`, `champion`, `influencer`, `executive_sponsor`, `technical_lead`, `finance_manager` or `other` (`Contact.Role`). The words ("Decision Maker", "Economic Buyer", "Champion", "Influencer") are only the choices' labels. `MapPerson.role` and `not_on_map[].role` carry the slug, exactly as `ContactSerializer.role` does. Both also gain **`role_display`** (the label, as `ContactSerializer.role_display`), an added field; nothing in §4 is renamed. The "from people" rows (§1.4) rank `decision_maker`+`economic_buyer`, then `champion`, then `influencer`, then everyone else.
2. **`sentiment` is the stored slug, never null in practice.** `Contact.sentiment` is `positive`, `neutral` or `negative`, non-null, default `neutral` (hand-set or computed by `contact_sentiment.recompute`). No contact payload has a `sentiment_label` today; `MapPerson.sentiment_label` is new here and is the choice's label (`Positive`, `Neutral`, `Negative`). The §4 type stays `string | null`.
3. **Stored nodes and edges are React Flow's own objects.** `CanvasEditor.tsx` and `seed_demo_canvases` store nodes as `{id, type: "contact", position, data: {contact_id}}`, sometimes with `width`, `height`, `selected`, `dragging`; edges as `{id, source, target, type: "relationship", label?}`, often with `sourceHandle`/`targetHandle`, and with `label` missing when none was picked. Every read now returns the contract's shapes only: nodes `{id, position: {x, y}, data: {contact_id}}`, edges `{id, source, target, label}` (a missing or unknown label reads as `""`). **The frontend must re-add `type: "contact"` / `type: "relationship"`** before handing them to React Flow. A stored node with no whole-number `contact_id` (none exist from the editor) is left out of the read, together with its edges; the next save drops it for good. On save, a missing `label` is taken as `""`.
4. **`GET canvases/` answers `{results: CanvasRow[], next}`** (was a bare array of the old `CanvasSerializer` shape with `companies`, `account_id`, `account_name`). `q` searches the map's, the organisation's and the account's names (cut to 120 characters). 50 a page, newest `updated_at` then id first; `next` is an opaque cursor; a malformed cursor reads as the first page.
5. **The record lists change shape to `{results: CanvasRow[]}`** (were bare arrays), at most 100, newest edit first. `GET customers/:id/canvases/` **keeps its roll-up**: the organisation's own maps plus those on its accounts that the reader may open (`customer_rollup_q`, as today); each row's `record` says which. The account list answers the same on all three of its routes: `customers/:id/accounts/:aid/canvases/` and the account page's flat `accounts/:aid/canvases/`. **POST on these routes is removed (405)**; maps are made only through `POST canvases/`.
6. **`POST canvases/` takes `customer` or `account`** (spec), no longer `customer_id`/`account_id`. Neither, both, or a value that is not a positive id: `400 {"non_field_errors": ["Choose an organisation or an account."]}`. A record the caller may not open (another tenant's, hidden, missing): `404`. `start` defaults to `"people"`; any other value than `people`/`blank`: `400 {"start": ["Choose people or blank."]}`. `name` is trimmed; blank or missing `400 {"name": ["Give the map a name."]}`, over 120 `400 {"name": ["Keep the name to 120 characters."]}`. Checked in that order: name, start, record. The new map's `updated_by` is its creator as well.
7. **`PATCH canvases/:id/` needs `version`** (a whole number ≥ 1): missing or anything else is `400 {"version": ["Send the version you loaded."]}`, checked before anything else. A stale one is `409 {"code": "CANVAS_CHANGED", "detail": "Someone else changed this map. Reload to see their changes."}` and is checked before any field (a stale save with bad fields is a 409). Every accepted PATCH bumps `version` by one, even when nothing changed. **`nodes` sent without `edges`**: the stored edges that touch a node no longer on the map are dropped, the rest kept. **People already on the stored map stay allowed** although the saver may not open them (hidden) or they were deleted (removed), so a reader can save a map that holds someone they can't see; any other contact must be one of the record's that the saver may open (`{"nodes": ["Add people from this organisation or account."]}`).
8. **Field refusals** (all `400 {field: [message]}`, the first failure only):
   - `nodes`: not a list or a node not of the shape `"Each person on the map needs an id, a position and a contact."`; over 60 `"A map holds at most 60 people."`; a repeated node id `"Each person on the map needs their own id."`; a repeated contact `"Someone is on the map twice."`; a contact not allowed (note 7) `"Add people from this organisation or account."` (spec's words). Coordinates are finite numbers within ±1,000,000; ids are strings of 1–64 characters.
   - `edges`: not a list or an edge not of the shape `"Each line needs an id, two people and a label."`; over 150 `"A map holds at most 150 lines."`; a label not among the four or `""` `"Choose Reports to, Introduced by, Blocks, Influences or no label."`; an end not on the map, or both ends the same `"A line must join two different people on the map."`; a repeated edge id `"Each line needs its own id."`; a second edge with the same source, target and label `"Two people can have each label only once."`
9. **`DELETE`**: `403 {"detail": "Only the map's creator or their managers can delete it."}` for anyone else who may open the record (an admin who is nobody's manager included: "above" is the org chart, `subtree_ids`, not a capability). A map with no creator (every map made before this delivery, or whose creator was deleted) may be deleted by anyone who may open its record. 404 when the record is not open to the caller.
10. **`last_contacted_at` counts calls and emails, not meetings.** `CalendarEvent` has no attendee or contact link, so no meeting can be tied to a person. It is the latest of: a call the contact is a participant on (`Call.participants`) on a record the reader may open; an email from the contact's address (`from_address`, any case) or to it (`to_addresses` holding the address as stored on the contact or in lower case) on a record the reader may open **and** under the mail rule (`visible_emails_q`: mailbox owner and their chain). Only rows dated up to now count (an upcoming call is not contact). The stored `Contact.last_contacted_at` is **not** used: it is not filtered by reader.
11. **Superseded by the final review (ruling I2) — see below.** ~~`latest_survey` is the contact's most recent answered `SurveyInvite` on a record the reader may open (`visible_children_q` on the invite's own `customer`/`account`), as `{type: send.survey_type, score, answered_at}`. The reader need not be able to read the survey send: an answer's score already lands on the record's own NPS/CSAT/CES figures (`surveys.scores.SCORE_FIELD`), which every reader of the record sees.~~ `latest_survey` is the contact's most recent answered `SurveyInvite` on a record the reader may open (`visible_children_q` on the invite's own `customer`/`account`) **from a send the reader may also read** (`services.surveys.access.readable_sends` — the same check the send's own views run before naming an answer: owner, workspace-shared or shared with them), as `{type: send.survey_type, score, answered_at}`. A reader who may open the record but not the send sees `null`, same as no answer at all. The comment is never returned.
12. **`hidden` and `removed` hold node ids**; `people_by_contact` holds only people the reader may open, keyed by `str(contact_id)`. A hidden node keeps its `data.contact_id` in `nodes` (an id, never a name). `people` on a row counts every node on the map, hidden and removed ones included.
13. **`open_plans`** are the map's own record's plans with an open status (`not_started`, `on_track`, `at_risk`), from `plans.access.visible_plans`, newest first, at most 50, as `plans.payloads.plan_rows` (task counts over visible tasks only). An organisation map lists the organisation's plans only, not its accounts', as `GET plans/?customer=<id>` does.
14. **`not_on_map`** is `[{id, name, role, role_display}]`: the record's contacts (an organisation's own and its accounts') the reader may open and that are not on the map, by name then id, at most 200.
15. **`created_by` and `updated_by`** are `{id, name}` or `null`: null on every map made before this delivery (`updated_by` until its first save) and when the person is deleted.

## Global Constraints

These are copied from the spec. Quoted text is verbatim.

- **Model (§1.1).** "`created_by` (FK user, SET_NULL, null): who may delete. Null on existing maps." "`updated_by` (FK user, SET_NULL, null)." "`version` (PositiveInteger, default 1): optimistic concurrency." "Migration: adds the three fields. Existing rows get `version=1` and a null creator."
- **Nodes (§1.1).** "At most 60. Each is `{id: str ≤64, position: {x: number, y: number}, data: {contact_id: int}}`." "Node ids are unique within the map." "`contact_id` must be a contact of the map's own record. For an organisation map that includes contacts of its accounts. A contact can appear at most once." "Anything else is refused: "Add people from this organisation or account."" "React Flow's extra keys (`type`, `width`, `height`, `selected`, `dragging`) are dropped on save."
- **Edges (§1.1).** "At most 150. Each is `{id: str ≤64, source, target, label}`." "`source` and `target` must be node ids on the map and must differ." "`label` is one of `Reports to`, `Introduced by`, `Blocks`, `Influences`, or empty." "There is at most one edge per source, target and label."
- **Name (§1.1).** "`name` is at most 120 characters and not blank: "Give the map a name."" "Refusals are `{field: [message]}`."
- **Who can do what (§1.2).** "anyone who can open the map's record, through `visible_customers`/`visible_accounts` as `id__in` subqueries. Never a join with `.distinct()`; the current detail queryset is replaced. A map on a record the reader can't open answers 404." "Delete: the creator, or anyone above the creator (`subtree_ids`)." "A map with no creator can be deleted by anyone who can open its record, as today." "Others get 403: "Only the map's creator or their managers can delete it.""
- **Live facts (§1.3).** "computed in batched queries so the query count stays the same whatever the number of nodes". "`last_contacted_at`: the latest of that contact's calls, emails and meetings that the reader can see. Each source uses its own record rule, as the Story does (`organizations.story.sources`). If none is visible, it is null." (meetings: contract note 10.) "`latest_survey`: `{type: "nps"|"csat"|"ces", score, answered_at}` from the contact's most recent answered `SurveyInvite`, or null." "`campaigns_unsubscribed`: true or false." Hidden: "the node is listed in `hidden`, and no name or facts are returned." "A deleted contact → the node is listed in `removed`." "`not_on_map` … at most 200." "`open_plans` lists the record's open plans as Plans' `PlanRow` payload, filtered exactly as `GET plans/` filters them".
- **New maps (§1.4).** "places the record's contacts the creator may open, in rows by role: 1. Decision Maker and Economic Buyer; 2. Champion; 3. Influencer; 4. everyone else." "Each row holds at most 6 people, with extra people spilling onto the next row." "Positions are on a 240 × 160 grid, rows left-aligned." "At most 60 people, ordered by role then name." "No edges." ""blank" has no nodes." "The new map gets `created_by` set and `version=1`."
- **API (§1.5, §4).** Every path and field in §4 is binding and not renamed. Gallery "newest edit first … Cursor pages of 50." PATCH "Runs under `select_for_update(no_key=True)` on the canvas row. A stale version answers 409 `{code: "CANVAS_CHANGED", detail: "Someone else changed this map. Reload to see their changes."}`. A good save bumps `version`, sets `updated_by` and returns the map." Record lists "(404 if the record is hidden). Newest edit first. Not paged; at most 100."
- **Audit, logs, docs (§1.6).** "`canvas.created` (`{start, nodes}`); `canvas.updated` (`{nodes, edges, renamed: bool}`); `canvas.deleted`." "Logs: ids only." "Docs: API_CONTRACTS, audit-events, schema, PRD and TRD."
- **Out of scope (§3).** "Real-time co-editing, automatic relationship detection, exporting a map as an image, maps spanning several organisations, and custom relationship labels."

House rules (every task):

- **Visibility is `id__in`/`pk__in` subqueries, never joins plus `.distinct()`.** CI and production run PostgreSQL 16, where the join-and-DISTINCT shape cost about a second a call (fixed in #86). Maps are `Q(customer_id__in=visible_customers(user).values("pk")) | Q(account_id__in=visible_accounts(user).values("pk"))`; contacts a reader may open are `Contact.objects.filter(visible_children_q(user))` (itself `customer__in`/`account__in` subqueries). The old detail queryset (`visible_children_q(...).distinct()`) and the old gallery's `.distinct()` go. Tests assert that no query touching `customers_canvas` contains `DISTINCT` (a `DISTINCT ON (contact_id)` on `surveys_surveyinvite` for the latest answer per person is allowed, as `rules.payloads.last_runs`).
- **Row locks.** PATCH runs `select_for_update(no_key=True, of=("self",))` on the canvas row inside `transaction.atomic()`, then compares `version`, validates, saves and audits in that transaction. DELETE takes `select_for_update(of=("self",))` inside `transaction.atomic()`. No other row is locked, so there is no lock order to keep against other features.
- **Batched facts.** `canvas_payload` runs the same number of queries for one person as for sixty. A test pins it: the count for a one-person map equals the count for a three-person map (with a hidden and a removed node), both after a warm-up read so the user's memoised chart walk (`subtree_ids`) is not counted once only.
- **Access checks carry `# SOC2:AUTH-02 <why>`**, and every `audit.record` call carries `# SOC2:LOG-01`. Audit `target_repr` is `"Canvas <id>"`: never a map's name or a person's. Metadata carries ids, codes, booleans and counts only.
- **Log lines carry ids only.** These views write none of their own; anything added later logs ids and exception class names only, never a map name, a contact's name or an address.
- Tests come in three tiers (skill `backend-testing`): unit (`SimpleTestCase`/`TestCase`), integration (`APIClient`), e2e (`LiveServerTestCase` in `e2e/`). The privacy world is `CanvasFixture` (Task 1): Carl (CSM) opens Pizza Hut, Pizza EMEA, Dough Co, and Taco Bell through his account Taco East, but not Taco West; Dana opens all of Taco Bell, not Pizza Hut; Mona is Carl's manager; Alice (admin) opens everything and is nobody's manager; Gus is another tenant.
- **The CI budget is tight** (about 27 minutes across four shards): each test class builds its data once with `setUpTestData`; nothing sleeps and no test starts threads; times are passed in (`now=`, `today=`); limits are tested by patching the module constant, never by making 60 contacts.
- Commands:
  - one module: `venv/bin/python manage.py test services.customers.tests.test_canvas_rules --noinput`;
  - the full suite: `venv/bin/python manage.py test --parallel --noinput` (serial runs hit the 30-minute CI timeout);
  - migrations: `venv/bin/python manage.py makemigrations --check --dry-run`;
  - the CI shard check: `venv/bin/python scripts/ci_shard_labels.py --check 4`;
  - lint: `venv/bin/ruff check .` and `venv/bin/ruff format --check .` (line length 100; rules E, F, I). Ruff also formats the Python fences inside Markdown, so run `venv/bin/ruff format <file.md>` on any doc you edit.
- Semgrep runs in CI. Return an opaque cursor string (`next`), never a built URL.
- Commits are conventional (`feat(canvas): …`, `test(e2e): …`, `docs(canvas): …`). Every commit message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.

## Decisions made while planning

The spec left these open. The owner may overrule any of them; each is applied in the tasks below.

1. **No data migration for the stored JSON.** Old maps are read through `stored_nodes`/`stored_edges` (contract note 3) and rewritten in the clean shape on their next save. The `name` column stays `max_length=255`; the 120 limit is checked on write only, so no stored name has to be cut.
2. **Node ids from "people" are `c<contact id>`** (the editor's own ids are `node_<n>`, so they never collide).
3. **The organisation list keeps its roll-up** (contract note 5): the organisation page already rolls account-level records up the same way (`customer_rollup_q`), and each row names its record.
4. **The nested POST routes go** (contract note 5) rather than gaining `start`: one create path, one set of checks and one audit call.
5. **Mail is matched by address the way `contact_sentiment` matches it, both ways.** "Contact" is ours with them, so emails to the address count as well as from it. `to_addresses` is a JSON list, matched with JSONB containment on the address as stored on the contact and in lower case (`mail.sync` lowercases one provider's recipients and keeps the other's as sent). All addresses are matched in **one** aggregate query with one `Max(..., filter=...)` per distinct address (at most 60).
6. **A survey answer's score is shown to anyone who may open its record** (contract note 11).
7. **Delete is not restricted for admins** beyond the spec: an admin is "above" nobody unless the org chart says so (contract note 9).
8. **The audit's `nodes`/`edges` are counts after the save**, and `renamed` is true only when the trimmed name differs from the stored one.
9. **`services.customers` imports from `services.plans`, `services.surveys`, `services.campaigns.paging` and `services.mail`** in the two canvas modules only (never from `customers.models`), so no import cycle forms: those apps already import `customers` the other way.

## Reuse map

Each helper below was read in the current code before this plan relied on it.

| Need | Source | Use |
|---|---|---|
| Records a reader may open | `customers.scoping.visible_customers`, `visible_accounts` (each `id IN` per way in), `get_visible_customer`, `get_url_account` (nested and flat account routes, 404) | `visible_canvases`, POST, record lists |
| Contacts a reader may open | `customers.scoping.visible_children_q(user)` | `clean_nodes`, `people_nodes`, `canvas_payload` |
| Organisation roll-up | `customers.scoping.customer_rollup_q(user, customer)` | `record_rows` |
| Org chart | `accounts.hierarchy.subtree_ids(user)` (memoised on the user instance) | `can_delete` |
| Mail rule | `mail.visibility.visible_emails_q(user)` (`chain_visible_q(user, "mailbox_owner")`) | `_last_contacted` |
| Call participants | `customers.models.Call.participants` (M2M `related_name="calls"`) | `_last_contacted` |
| Survey answers | `surveys.models.SurveyInvite` (`contact`, `customer`, `account`, `status="answered"`, `score`, `answered_at`, `send.survey_type`) | `_latest_surveys` |
| Plans | `plans.access.visible_plans`, `plans.models.OPEN`, `plans.payloads.plan_rows(plans, viewer, *, today)`, `plans.payloads.record_ref(obj)` (duck-typed on `customer_id`/`customer`/`account`) | `open_plans`, every row's `record` |
| Payload helpers | `organizations.rows.iso`, `person` | rows and payload |
| Cursor | `campaigns.paging.encode`, `decode_after`, `page` | `gallery_page` |
| Audit | `core.audit.record(action, *, request, actor, organisation, target, target_repr, metadata)` | `canvas_views.record_audit` |
| Test world | `plans.tests.fixtures.PlanFixture` (→ `RuleFixture` → `SurveyFixture` → `SegmentFixture`: `org`, `admin`, `csm`, `other`, `stranger`, `mona`, `pizza`, `taco`, `globex`, `emea`, `west`, `dough`, `today`, `now`, contacts `ann`, `ben`, `tia`, `tom`, `dot`; `make_account`, `make_send`, `answered`, `build_plan`), `surveys.tests.fixtures.contact` | `customers.tests.canvas_fixtures.CanvasFixture` |
| e2e HTTP | `e2e/http.py` `http_get`, `http_post`, `http_patch`, `http_delete` | Task 6 |

## File Structure

| File | Responsibility |
|---|---|
| `services/customers/models.py` (modify `Canvas`) | `created_by`, `updated_by`, `version`; docstring |
| `services/customers/migrations/0053_canvas_creator_version.py` (generated) | The three fields |
| `services/customers/admin.py` (modify `CanvasAdmin`) | Shows the new fields read-only |
| `services/customers/canvas.py` (new) | Limits, every refusal's copy, `record_contacts_q`, `stored_nodes`, `stored_edges`, `clean_name`, `clean_nodes`, `clean_edges`, `layout`, `people_nodes` |
| `services/customers/canvas_payloads.py` (new) | `visible_canvases`, `can_delete`, `canvas_row`, `gallery_page`, `record_rows`, `canvas_payload` and the batched facts |
| `services/customers/canvas_views.py` (new) | `CanvasListView`, `CanvasDetailView`, `CustomerCanvasListView`, `AccountCanvasListView`, `record_audit` |
| `services/customers/views.py`, `serializers.py` (modify) | The old four canvas views and `CanvasSerializer` removed |
| `config/urls.py`, `services/customers/urls.py`, `services/account_story/urls.py` (modify) | Routes point at `canvas_views` |
| `services/customers/tests/canvas_fixtures.py` (new) | `CanvasFixture` |
| `services/customers/tests/test_canvas_rules.py` (new) | Unit: shapes, checks, layout |
| `services/customers/tests/test_canvas_facts.py` (new) | Unit: payload, facts, hidden/removed, tray, plans, delete rule, query count |
| `services/customers/tests/test_canvas_lists.py` (new) | Integration: gallery, create, record lists |
| `services/customers/tests/test_canvas_detail.py` (new) | Integration: read, save, conflict, lock, delete |
| `services/customers/tests/test_views.py`, `test_account_routes.py`, `test_models.py` (modify) | Old canvas tests removed; the account-route sweep leaves canvases to Task 4; model defaults |
| `e2e/test_canvas_flow.py` (new) | Make from people, conflict, hidden person, delete |
| docs (modify) | `API_CONTRACTS.md`, `audit-events.md`, `product/01-prd.md`, `02-trd.md`, `05-backend-schema.md` |

---

### Task 1: Canvas creator, editor and version; the test world

**Files:**
- Modify: `services/customers/models.py:2527-2590` (`class Canvas`)
- Create: `services/customers/migrations/0053_canvas_creator_version.py` (generated)
- Modify: `services/customers/admin.py:207-211` (`CanvasAdmin`)
- Create: `services/customers/tests/canvas_fixtures.py`
- Modify: `services/customers/tests/test_models.py` (after `CanvasParentConstraintTests`, ~line 648)

**Interfaces:**
- Produces: `Canvas.created_by` (FK `User`, `SET_NULL`, null, `related_name="+"`), `Canvas.updated_by` (same), `Canvas.version` (`PositiveIntegerField(default=1)`).
- Produces: `CanvasFixture` with `cal` (economic buyer on Pizza Hut), `east` (Taco East, an account of Taco Bell owned by Carl), `eve` (influencer on Taco East); `node(person, x=0, y=0) -> dict`, `line(a, b, label="Reports to", id=None) -> dict`, `make_canvas(record=None, people=(), *, lines=(), extra=(), created_by=None, **fields) -> Canvas`, `mail(record, sent_at, **fields) -> Email`, `as_user(user) -> APIClient`.

- [ ] **Step 1: Write the fixture**

Create `services/customers/tests/canvas_fixtures.py`:

```python
"""The canvas tests' shared world, built once per test class
(`setUpTestData`): the plans fixture (Alice the admin opens everything and is
nobody's manager; Carl owns Pizza Hut, Pizza EMEA and Dough Co; Dana owns
Taco Bell and Taco West; Mona is Carl's manager; Gus is another tenant;
contacts Ann on Pizza Hut (champion), Ben on Pizza EMEA (decision maker), Tia
on Taco Bell, Tom on Taco West, Dot on Dough Co), plus Cal, an economic buyer
on Pizza Hut, and Taco East, an account of Taco Bell that Carl owns, with Eve
(influencer) on it. Carl may open Taco Bell through Taco East, and Tia and
Eve, but not Taco West or Tom. Dana may open all of Taco Bell, not Pizza Hut."""

from rest_framework.test import APIClient

from services.customers.models import Canvas, Contact, Customer, Email
from services.plans.tests.fixtures import PlanFixture
from services.surveys.tests.fixtures import contact


class CanvasFixture(PlanFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.cal = contact(cls.pizza, "Cal", Contact.Role.ECONOMIC_BUYER)
        cls.east = cls.make_account("Taco East", cls.taco, cls.csm)
        cls.eve = contact(cls.east, "Eve", Contact.Role.INFLUENCER)

    @staticmethod
    def node(person, x=0, y=0):
        return {
            "id": f"c{person.pk}",
            "position": {"x": x, "y": y},
            "data": {"contact_id": person.pk},
        }

    @staticmethod
    def line(a, b, label="Reports to", id=None):
        return {
            "id": id or f"e{a.pk}-{b.pk}-{label}",
            "source": f"c{a.pk}",
            "target": f"c{b.pk}",
            "label": label,
        }

    @classmethod
    def make_canvas(cls, record=None, people=(), *, lines=(), extra=(), created_by=None, **fields):
        """A map on Pizza Hut unless told otherwise: `people` in one row,
        then the raw `extra` nodes, then `lines`."""
        record = record or cls.pizza
        on = {"customer": record} if isinstance(record, Customer) else {"account": record}
        nodes = [cls.node(person, 240 * index) for index, person in enumerate(people)]
        return Canvas.objects.create(
            name=fields.pop("name", "Pizza map"),
            nodes=[*nodes, *extra],
            edges=list(lines),
            created_by=created_by,
            **on,
            **fields,
        )

    @classmethod
    def mail(cls, record, sent_at, **fields):
        on = {"customer": record} if isinstance(record, Customer) else {"account": record}
        return Email.objects.create(
            **on,
            subject="Hello",
            sender_name="Sam",
            recipient_name="Carl",
            body="x",
            sent_at=sent_at,
            **fields,
        )

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client
```

- [ ] **Step 2: Write the failing model test**

Append to `services/customers/tests/test_models.py`, after `CanvasParentConstraintTests`:

```python
class CanvasCreatorVersionTests(CanvasFixture):
    """A new map starts at version 1 with nobody named; deleting a person
    leaves the map and clears the name (SET_NULL)."""

    def test_defaults_and_set_null(self):
        pat = person("pat@acme.io", "Pat Passing", self.org)
        canvas = self.make_canvas(created_by=pat, updated_by=pat)
        fresh = self.make_canvas(name="Fresh")
        self.assertEqual((fresh.version, fresh.created_by, fresh.updated_by), (1, None, None))
        pat.delete()
        canvas.refresh_from_db()
        self.assertEqual((canvas.created_by_id, canvas.updated_by_id), (None, None))
```

and add `from services.customers.tests.canvas_fixtures import CanvasFixture` and `from services.segments.tests.fixtures import person` to that file's imports. (A fresh person, so nothing else refers to the deleted user.)

- [ ] **Step 3: Run it to see it fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_models.CanvasCreatorVersionTests --noinput`
Expected: ERROR, `TypeError: Canvas() got unexpected keyword arguments: 'created_by'`.

- [ ] **Step 4: Add the fields**

In `services/customers/models.py`, `class Canvas`: replace the docstring's second paragraph ("`nodes`/`edges` are stored verbatim … without a sync step.") with:

```
    `nodes`/`edges` hold positions and labelled relationships only, checked
    on every save (services/customers/canvas.py). A node's `data` holds only
    a `contact_id`: each person's role, sentiment, last contact, latest survey
    answer and unsubscribed flag are worked out for the reader on every read
    (canvas_payloads.py), never stored. `version` makes a save from an older
    copy fail (409) instead of overwriting someone else's.
```

and add after `edges = models.JSONField(...)`:

```python
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who made the map: they and anyone above them may delete it. Null on maps "
        "made before live maps, which anyone who may open the record may delete.",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who saved it last.",
    )
    version = models.PositiveIntegerField(
        default=1, help_text="Bumped on every save; a save from an older version is refused."
    )
```

In `services/customers/admin.py`, `CanvasAdmin`:

```python
@admin.register(Canvas)
class CanvasAdmin(admin.ModelAdmin):
    list_display = ["name", "customer", "account", "version", "updated_at"]
    search_fields = ["name", "customer__name", "account__name"]
    readonly_fields = ["created_by", "updated_by", "version", "created_at", "updated_at"]
```

- [ ] **Step 5: Generate the migration**

Run: `venv/bin/python manage.py makemigrations customers --name canvas_creator_version`
Expected: `services/customers/migrations/0053_canvas_creator_version.py` with three `AddField` operations (`created_by`, `updated_by`, `version` default 1). Existing rows take `version=1` and nulls from the defaults; no `RunPython`.

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_models --noinput && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: PASS; "No changes detected".

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check services/customers && venv/bin/ruff format services/customers
git add services/customers/models.py services/customers/admin.py services/customers/migrations/0053_canvas_creator_version.py services/customers/tests/canvas_fixtures.py services/customers/tests/test_models.py
git commit -m "feat(canvas): creator, editor and version on Canvas

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The map's rules (shapes, checks, layout)

**Files:**
- Create: `services/customers/canvas.py`
- Test: `services/customers/tests/test_canvas_rules.py`

**Interfaces:**
- Consumes: `CanvasFixture` (Task 1).
- Produces (all in `services.customers.canvas`):
  - constants `MAX_NODES = 60`, `MAX_EDGES = 150`, `MAX_NAME = 120`, `LABELS`, `ROW_SIZE = 6`, `GRID_X = 240`, `GRID_Y = 160`;
  - copy `NAME_NEEDED`, `NAME_TOO_LONG`, `BAD_NODE`, `TOO_MANY_PEOPLE`, `NODE_ID_TWICE`, `CONTACT_TWICE`, `NOT_ON_RECORD`, `BAD_EDGE`, `TOO_MANY_LINES`, `BAD_LABEL`, `EDGE_ENDS`, `EDGE_ID_TWICE`, `EDGE_TWICE`, `CHOOSE_RECORD`, `CHOOSE_START`, `VERSION_NEEDED`, `CANVAS_CHANGED`, `NOT_DELETER`;
  - `record_contacts_q(*, customer_id=None, account_id=None) -> Q`;
  - `stored_nodes(nodes) -> list[dict]`, `stored_edges(edges, nodes) -> list[dict]`;
  - `clean_name(value) -> str`, `clean_nodes(value, *, viewer, customer_id, account_id, kept_contact_ids) -> list[dict]`, `clean_edges(value, nodes) -> list[dict]` (each raises `rest_framework.exceptions.ValidationError({field: [message]})`);
  - `layout(people: list[tuple[int, int]]) -> list[dict]`, `people_nodes(viewer, *, customer_id=None, account_id=None) -> list[dict]`.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_canvas_rules.py`:

```python
"""The map's rules (spec §1.1, §1.4): what a save may hold, how a stored map
reads back, and how a map built from people is laid out."""

from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from services.customers.canvas import (
    BAD_EDGE,
    BAD_LABEL,
    BAD_NODE,
    CONTACT_TWICE,
    EDGE_ENDS,
    EDGE_ID_TWICE,
    EDGE_TWICE,
    NAME_NEEDED,
    NAME_TOO_LONG,
    NODE_ID_TWICE,
    NOT_ON_RECORD,
    TOO_MANY_LINES,
    TOO_MANY_PEOPLE,
    clean_edges,
    clean_name,
    clean_nodes,
    layout,
    people_nodes,
    stored_edges,
    stored_nodes,
)
from services.customers.models import Customer
from services.customers.tests.canvas_fixtures import CanvasFixture

NODES = [
    {"id": key, "position": {"x": 0, "y": 0}, "data": {"contact_id": pk}}
    for key, pk in (("a", 1), ("b", 2), ("c", 3))
]


def edge(id, source, target, label="Reports to"):
    return {"id": id, "source": source, "target": target, "label": label}


class StoredShapeTests(SimpleTestCase):
    def test_react_flow_keys_are_left_out_and_a_missing_label_reads_as_none(self):
        nodes = stored_nodes(
            [
                {
                    "id": "n1",
                    "type": "contact",
                    "width": 200,
                    "selected": True,
                    "position": {"x": 1, "y": 2.5},
                    "data": {"contact_id": 5, "name": "Ann"},
                },
                {
                    "id": "n2",
                    "type": "contact",
                    "position": {"x": 0, "y": 0},
                    "data": {"contact_id": 6},
                },
                {"id": "junk", "position": {"x": 0, "y": 0}, "data": {}},
            ]
        )
        self.assertEqual(
            nodes,
            [
                {"id": "n1", "position": {"x": 1, "y": 2.5}, "data": {"contact_id": 5}},
                {"id": "n2", "position": {"x": 0, "y": 0}, "data": {"contact_id": 6}},
            ],
        )
        edges = stored_edges(
            [
                {
                    "id": "e1",
                    "source": "n1",
                    "target": "n2",
                    "type": "relationship",
                    "sourceHandle": None,
                },
                {"id": "e2", "source": "n1", "target": "junk", "label": "Blocks"},
                {"id": "e3", "source": "n2", "target": "n1", "label": "Old label"},
            ],
            nodes,
        )
        self.assertEqual(
            edges,
            [
                {"id": "e1", "source": "n1", "target": "n2", "label": ""},
                {"id": "e3", "source": "n2", "target": "n1", "label": ""},
            ],
        )

    def test_anything_but_a_list_reads_as_empty(self):
        self.assertEqual(stored_nodes({"a": 1}), [])
        self.assertEqual(stored_edges(None, []), [])


class NameTests(SimpleTestCase):
    def test_trimmed_required_and_at_most_120(self):
        self.assertEqual(clean_name("  Renewal map "), "Renewal map")
        self.assertEqual(clean_name("x" * 120), "x" * 120)
        for bad, message in (
            ("", NAME_NEEDED),
            ("   ", NAME_NEEDED),
            (None, NAME_NEEDED),
            (7, NAME_NEEDED),
            ("x" * 121, NAME_TOO_LONG),
        ):
            with self.subTest(bad=bad), self.assertRaises(ValidationError) as caught:
                clean_name(bad)
            self.assertEqual(caught.exception.detail, {"name": [message]})


class EdgeRuleTests(SimpleTestCase):
    def refused(self, edges, message):
        with self.assertRaises(ValidationError) as caught:
            clean_edges(edges, NODES)
        self.assertEqual(caught.exception.detail, {"edges": [message]})

    def test_the_four_labels_and_none_and_extra_keys_dropped(self):
        edges = clean_edges(
            [
                {**edge("e1", "a", "b"), "type": "relationship", "animated": True},
                edge("e2", "b", "c", ""),
                edge("e3", "a", "c", "Influences"),
                {"id": "e4", "source": "c", "target": "a"},
            ],
            NODES,
        )
        self.assertEqual(
            edges,
            [
                edge("e1", "a", "b"),
                edge("e2", "b", "c", ""),
                edge("e3", "a", "c", "Influences"),
                edge("e4", "c", "a", ""),
            ],
        )

    def test_the_same_pair_may_carry_different_labels_and_both_directions(self):
        edges = [edge("e1", "a", "b"), edge("e2", "a", "b", "Blocks"), edge("e3", "b", "a")]
        self.assertEqual(len(clean_edges(edges, NODES)), 3)

    def test_refusals(self):
        cases = [
            ("not a list", "x", BAD_EDGE),
            ("no target", [{"id": "e1", "source": "a", "label": ""}], BAD_EDGE),
            ("a number as a label", [edge("e1", "a", "b", 3)], BAD_EDGE),
            ("unknown label", [edge("e1", "a", "b", "Likes")], BAD_LABEL),
            ("to nobody", [edge("e1", "a", "z")], EDGE_ENDS),
            ("to itself", [edge("e1", "a", "a")], EDGE_ENDS),
            ("same id", [edge("e1", "a", "b"), edge("e1", "b", "c")], EDGE_ID_TWICE),
            ("same link", [edge("e1", "a", "b"), edge("e2", "a", "b")], EDGE_TWICE),
        ]
        for label, edges, message in cases:
            with self.subTest(label):
                self.refused(edges, message)

    def test_at_most_150(self):
        with patch("services.customers.canvas.MAX_EDGES", 1):
            self.refused([edge("e1", "a", "b"), edge("e2", "b", "c")], TOO_MANY_LINES)


class LayoutTests(SimpleTestCase):
    def test_each_rank_starts_a_row_and_a_row_holds_six(self):
        people = [(100, 0), *[(pk, 1) for pk in range(1, 9)], (20, 3)]
        spots = [
            (n["data"]["contact_id"], n["position"]["x"], n["position"]["y"])
            for n in layout(people)
        ]
        self.assertEqual(spots[0], (100, 0, 0))
        self.assertEqual(spots[1:7], [(pk, 240 * (pk - 1), 160) for pk in range(1, 7)])
        self.assertEqual(spots[7:9], [(7, 0, 320), (8, 240, 320)])
        self.assertEqual(spots[9], (20, 0, 480))
        self.assertEqual(layout([(100, 0)])[0]["id"], "c100")

    def test_nobody_is_no_nodes(self):
        self.assertEqual(layout([]), [])


class NodeRuleTests(CanvasFixture):
    def clean(self, nodes, *, record=None, kept=(), viewer=None):
        record = record or self.pizza
        on = (
            {"customer_id": record.pk}
            if isinstance(record, Customer)
            else {"account_id": record.pk}
        )
        return clean_nodes(nodes, viewer=viewer or self.csm, kept_contact_ids=set(kept), **on)

    def refused(self, nodes, message, **kwargs):
        with self.assertRaises(ValidationError) as caught:
            self.clean(nodes, **kwargs)
        self.assertEqual(caught.exception.detail, {"nodes": [message]})

    def test_an_organisation_map_takes_its_own_and_its_accounts_people(self):
        sent = [
            self.node(self.ann),
            {**self.node(self.ben, 240), "type": "contact", "dragging": True},
        ]
        self.assertEqual(self.clean(sent), [self.node(self.ann), self.node(self.ben, 240)])

    def test_an_account_map_takes_only_its_own_people(self):
        self.assertEqual(len(self.clean([self.node(self.ben)], record=self.emea)), 1)
        self.refused([self.node(self.ann)], NOT_ON_RECORD, record=self.emea)

    def test_people_from_elsewhere_or_hidden_from_the_saver_are_refused(self):
        for person in (self.tia, self.dot):
            with self.subTest(person=person.name):
                self.refused([self.node(person)], NOT_ON_RECORD)
        self.refused([self.node(self.tom)], NOT_ON_RECORD, record=self.taco)
        self.assertEqual(
            len(self.clean([self.node(self.tom)], record=self.taco, viewer=self.other)), 1
        )

    def test_people_already_on_the_map_stay_though_hidden_or_deleted(self):
        gone = {"id": "gone", "position": {"x": 0, "y": 0}, "data": {"contact_id": 999_999}}
        nodes = self.clean(
            [self.node(self.tom), gone], record=self.taco, kept={self.tom.pk, 999_999}
        )
        self.assertEqual(len(nodes), 2)

    def test_shape_and_duplicates(self):
        ann = self.node(self.ann)
        cases = [
            ("not a list", {"a": 1}, BAD_NODE),
            ("no position", [{"id": "n1", "data": {"contact_id": self.ann.pk}}], BAD_NODE),
            ("text coordinate", [{**ann, "position": {"x": "1", "y": 0}}], BAD_NODE),
            ("far away", [{**ann, "position": {"x": 2_000_000, "y": 0}}], BAD_NODE),
            ("long id", [{**ann, "id": "x" * 65}], BAD_NODE),
            ("no contact", [{**ann, "data": {}}], BAD_NODE),
            ("true as a contact", [{**ann, "data": {"contact_id": True}}], BAD_NODE),
            ("same id", [ann, {**self.node(self.cal), "id": ann["id"]}], NODE_ID_TWICE),
            ("same person", [ann, {**ann, "id": "other"}], CONTACT_TWICE),
        ]
        for label, nodes, message in cases:
            with self.subTest(label):
                self.refused(nodes, message)

    def test_at_most_60(self):
        with patch("services.customers.canvas.MAX_NODES", 1):
            self.refused([self.node(self.ann), self.node(self.cal)], TOO_MANY_PEOPLE)


class PeopleNodesTests(CanvasFixture):
    def ids(self, nodes):
        return [node["data"]["contact_id"] for node in nodes]

    def test_the_records_people_in_rows_by_role_then_name(self):
        nodes = people_nodes(self.csm, customer_id=self.pizza.pk)
        self.assertEqual(
            nodes,
            [self.node(self.ben, 0, 0), self.node(self.cal, 240, 0), self.node(self.ann, 0, 160)],
        )

    def test_only_people_the_creator_may_open(self):
        self.assertEqual(
            self.ids(people_nodes(self.csm, customer_id=self.taco.pk)), [self.tia.pk, self.eve.pk]
        )
        self.assertEqual(
            self.ids(people_nodes(self.other, customer_id=self.taco.pk)),
            [self.tia.pk, self.tom.pk, self.eve.pk],
        )

    def test_an_account_holds_its_own_people(self):
        self.assertEqual(self.ids(people_nodes(self.csm, account_id=self.emea.pk)), [self.ben.pk])

    def test_at_most_60(self):
        with patch("services.customers.canvas.MAX_NODES", 2):
            self.assertEqual(
                self.ids(people_nodes(self.csm, customer_id=self.pizza.pk)),
                [self.ben.pk, self.cal.pk],
            )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_canvas_rules --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.customers.canvas'`.

- [ ] **Step 3: Write `services/customers/canvas.py`**

```python
"""A stakeholder map's rules (spec §1.1, §1.4): what a save may hold, how a
stored map reads back in the contract's shape, and how a map built from the
record's people is laid out. The views lock, save and audit."""

import math

from django.db.models import Case, IntegerField, Q, Value, When
from rest_framework.exceptions import ValidationError

from .models import Account, Contact
from .scoping import visible_children_q

MAX_NODES = 60
MAX_EDGES = 150
MAX_NAME = 120
MAX_ID = 64
MAX_COORDINATE = 1_000_000
LABELS = ("Reports to", "Introduced by", "Blocks", "Influences", "")
ROW_SIZE = 6
GRID_X = 240
GRID_Y = 160
#: The first rows of a map built from people; everyone else shares the last.
ROLE_ROWS = (
    (Contact.Role.DECISION_MAKER, Contact.Role.ECONOMIC_BUYER),
    (Contact.Role.CHAMPION,),
    (Contact.Role.INFLUENCER,),
)

NAME_NEEDED = "Give the map a name."
NAME_TOO_LONG = "Keep the name to 120 characters."
BAD_NODE = "Each person on the map needs an id, a position and a contact."
TOO_MANY_PEOPLE = "A map holds at most 60 people."
NODE_ID_TWICE = "Each person on the map needs their own id."
CONTACT_TWICE = "Someone is on the map twice."
NOT_ON_RECORD = "Add people from this organisation or account."
BAD_EDGE = "Each line needs an id, two people and a label."
TOO_MANY_LINES = "A map holds at most 150 lines."
BAD_LABEL = "Choose Reports to, Introduced by, Blocks, Influences or no label."
EDGE_ENDS = "A line must join two different people on the map."
EDGE_ID_TWICE = "Each line needs its own id."
EDGE_TWICE = "Two people can have each label only once."
CHOOSE_RECORD = "Choose an organisation or an account."
CHOOSE_START = "Choose people or blank."
VERSION_NEEDED = "Send the version you loaded."
CANVAS_CHANGED = "Someone else changed this map. Reload to see their changes."
NOT_DELETER = "Only the map's creator or their managers can delete it."


def record_contacts_q(*, customer_id=None, account_id=None):
    """The contacts of a map's record: an organisation's own and its
    accounts', or an account's own. `id IN` through the link table, no join."""
    if customer_id is not None:
        links = Account.customers.through.objects.filter(customer_id=customer_id)
        return Q(customer_id=customer_id) | Q(account_id__in=links.values("account_id"))
    return Q(account_id=account_id)


def _is_id(value):
    return isinstance(value, str) and 0 < len(value) <= MAX_ID


def _is_coordinate(value):
    return (
        isinstance(value, int | float)
        and not isinstance(value, bool)
        and math.isfinite(value)
        and abs(value) <= MAX_COORDINATE
    )


def _node(raw):
    """`raw` as the contract's node, or None when it is not one."""
    if not isinstance(raw, dict) or not _is_id(raw.get("id")):
        return None
    position, data = raw.get("position"), raw.get("data")
    if not isinstance(position, dict) or not isinstance(data, dict):
        return None
    x, y, contact_id = position.get("x"), position.get("y"), data.get("contact_id")
    if not (_is_coordinate(x) and _is_coordinate(y)):
        return None
    if isinstance(contact_id, bool) or not isinstance(contact_id, int) or contact_id < 1:
        return None
    return {"id": raw["id"], "position": {"x": x, "y": y}, "data": {"contact_id": contact_id}}


def _edge(raw):
    """`raw` as the contract's edge (a missing label is no label), or None."""
    if not isinstance(raw, dict) or not all(
        _is_id(raw.get(key)) for key in ("id", "source", "target")
    ):
        return None
    label = raw.get("label")
    label = "" if label is None else label
    if not isinstance(label, str):
        return None
    return {"id": raw["id"], "source": raw["source"], "target": raw["target"], "label": label}


def stored_nodes(nodes):
    """A stored map's nodes in the contract's shape, for reading. Maps saved
    before live maps hold React Flow's own keys, which are left out; a node
    that is not a person (no contact id) or repeats an id is skipped."""
    if not isinstance(nodes, list):
        return []
    found, seen = [], set()
    for raw in nodes:
        node = _node(raw)
        if node is not None and node["id"] not in seen:
            seen.add(node["id"])
            found.append(node)
    return found


def stored_edges(edges, nodes):
    """A stored map's edges between `nodes`; an unknown or missing label
    reads as no label."""
    if not isinstance(edges, list):
        return []
    ids = {node["id"] for node in nodes}
    found = []
    for raw in edges:
        edge = _edge(raw)
        if edge is None or edge["source"] == edge["target"]:
            continue
        if edge["source"] in ids and edge["target"] in ids:
            if edge["label"] not in LABELS:
                edge["label"] = ""
            found.append(edge)
    return found


def _refuse(field, message):
    raise ValidationError({field: [message]})


def clean_name(value):
    name = value.strip() if isinstance(value, str) else ""
    if not name:
        _refuse("name", NAME_NEEDED)
    if len(name) > MAX_NAME:
        _refuse("name", NAME_TOO_LONG)
    return name


def clean_nodes(value, *, viewer, customer_id, account_id, kept_contact_ids):
    """The nodes a save stores. `kept_contact_ids` are the people already on
    the stored map: they stay allowed although the saver may not open them or
    they were deleted. Anyone else must be one of the record's people that
    the saver may open."""
    if not isinstance(value, list):
        _refuse("nodes", BAD_NODE)
    if len(value) > MAX_NODES:
        _refuse("nodes", TOO_MANY_PEOPLE)
    nodes = [_node(raw) for raw in value]
    if any(node is None for node in nodes):
        _refuse("nodes", BAD_NODE)
    if len({node["id"] for node in nodes}) != len(nodes):
        _refuse("nodes", NODE_ID_TWICE)
    contact_ids = [node["data"]["contact_id"] for node in nodes]
    if len(set(contact_ids)) != len(contact_ids):
        _refuse("nodes", CONTACT_TWICE)
    added = set(contact_ids) - set(kept_contact_ids)
    if added:
        # SOC2:AUTH-02 a person is added only from the map's record, by someone who may open them
        allowed = (
            Contact.objects.filter(
                record_contacts_q(customer_id=customer_id, account_id=account_id)
            )
            .filter(visible_children_q(viewer))
            .filter(pk__in=added)
            .values_list("pk", flat=True)
        )
        if set(allowed) != added:
            _refuse("nodes", NOT_ON_RECORD)
    return nodes


def clean_edges(value, nodes):
    """The edges a save stores, between `nodes` (already cleaned)."""
    if not isinstance(value, list):
        _refuse("edges", BAD_EDGE)
    if len(value) > MAX_EDGES:
        _refuse("edges", TOO_MANY_LINES)
    ids = {node["id"] for node in nodes}
    edges, edge_ids, links = [], set(), set()
    for raw in value:
        edge = _edge(raw)
        if edge is None:
            _refuse("edges", BAD_EDGE)
        if edge["label"] not in LABELS:
            _refuse("edges", BAD_LABEL)
        ends = (edge["source"], edge["target"])
        if ends[0] == ends[1] or not set(ends) <= ids:
            _refuse("edges", EDGE_ENDS)
        if edge["id"] in edge_ids:
            _refuse("edges", EDGE_ID_TWICE)
        link = (*ends, edge["label"])
        if link in links:
            _refuse("edges", EDGE_TWICE)
        edge_ids.add(edge["id"])
        links.add(link)
        edges.append(edge)
    return edges


def layout(people):
    """`people` are (contact id, rank) in map order. Each rank starts a new
    row; a row holds six and the rest spill onto the next, left-aligned on a
    240 × 160 grid."""
    nodes, row, column, rank_now = [], -1, ROW_SIZE, None
    for contact_id, rank in people:
        if rank != rank_now or column == ROW_SIZE:
            row, column, rank_now = row + 1, 0, rank
        nodes.append(
            {
                "id": f"c{contact_id}",
                "position": {"x": column * GRID_X, "y": row * GRID_Y},
                "data": {"contact_id": contact_id},
            }
        )
        column += 1
    return nodes


def people_nodes(viewer, *, customer_id=None, account_id=None):
    """A new map's nodes: the record's people the creator may open, by role
    then name, at most 60 (spec §1.4)."""
    rank = Case(
        *(When(role__in=roles, then=Value(index)) for index, roles in enumerate(ROLE_ROWS)),
        default=Value(len(ROLE_ROWS)),
        output_field=IntegerField(),
    )
    # SOC2:AUTH-02 a new map holds only people its creator may open
    people = (
        Contact.objects.filter(record_contacts_q(customer_id=customer_id, account_id=account_id))
        .filter(visible_children_q(viewer))
        .annotate(rank=rank)
        .order_by("rank", "name", "pk")
        .values_list("pk", "rank")[:MAX_NODES]
    )
    return layout(list(people))
```

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_canvas_rules --noinput`
Expected: PASS (all classes).

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check services/customers && venv/bin/ruff format services/customers
git add services/customers/canvas.py services/customers/tests/test_canvas_rules.py
git commit -m "feat(canvas): map rules, stored shapes and the from-people layout

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Live person facts and the map payload

**Files:**
- Create: `services/customers/canvas_payloads.py`
- Test: `services/customers/tests/test_canvas_facts.py`

**Interfaces:**
- Consumes: `record_contacts_q`, `stored_nodes`, `stored_edges` (Task 2); `CanvasFixture` (Task 1).
- Produces (all in `services.customers.canvas_payloads`):
  - `GALLERY_PAGE = 50`, `RECORD_LIMIT = 100`, `NOT_ON_MAP_LIMIT = 200`, `OPEN_PLANS_LIMIT = 50`, `ROW_RELATED = ("customer", "account", "updated_by")`, `DETAIL_RELATED = ("customer", "account", "created_by", "updated_by")`;
  - `visible_canvases(user) -> QuerySet[Canvas]`;
  - `can_delete(user, canvas) -> bool`;
  - `canvas_row(canvas, nodes=None) -> dict` (`CanvasRow`; needs `ROW_RELATED` loaded);
  - `gallery_page(user, params) -> {"results", "next"}`;
  - `record_rows(user, *, customer=None, account=None) -> {"results"}`;
  - `canvas_payload(canvas, user, *, now=None, today=None) -> dict` (`Canvas`; needs `DETAIL_RELATED` loaded).

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_canvas_facts.py`:

```python
"""A map as the reader sees it (spec §1.3): each person's facts under the
reader's rules, hidden and removed people, the tray, the record's open plans
and the delete rule, in a query count that does not grow with the map."""

import json
from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.customers.canvas_payloads import DETAIL_RELATED, canvas_payload
from services.customers.models import Call, Canvas, Contact
from services.customers.tests.canvas_fixtures import CanvasFixture
from services.plans.models import Plan
from services.plans.payloads import plan_rows
from services.surveys.tests.fixtures import contact


class CanvasFactsFixture(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.called = cls.now - timedelta(days=12)
        for at, people in (
            (cls.called, [cls.ann]),
            (cls.now + timedelta(days=3), [cls.ann, cls.cal]),
        ):
            call = Call.objects.create(
                customer=cls.pizza, title="QBR", host_name="Carl", occurred_at=at
            )
            call.participants.add(*people)
        cls.mailed = cls.now - timedelta(days=2)
        cls.mail(
            cls.emea, cls.mailed, from_address="carl@acme.io", to_addresses=["ben@example.com"]
        )
        cls.mail(cls.globex, cls.now - timedelta(hours=1), from_address="ben@example.com")
        cls.carls_mail = cls.now - timedelta(days=1)
        cls.mail(cls.pizza, cls.carls_mail, from_address="CAL@example.com", mailbox_owner=cls.csm)
        Contact.objects.filter(pk=cls.cal.pk).update(campaigns_unsubscribed_at=cls.now)
        Contact.objects.filter(pk=cls.ben.pk).update(sentiment=Contact.Sentiment.POSITIVE)
        cls.answered(cls.make_send(survey_type="nps"), cls.ann, 9, days_ago=1)
        cls.answered(cls.make_send(survey_type="csat", name="CSAT"), cls.ann, 4, days_ago=5)
        gone = contact(cls.pizza, "Gone")
        cls.gone_id = gone.pk
        gone.delete()
        cls.removed = {
            "id": "gone",
            "position": {"x": 0, "y": 320},
            "data": {"contact_id": cls.gone_id},
        }
        cls.map = cls.make_canvas(
            people=[cls.ann, cls.ben, cls.cal],
            extra=[cls.removed],
            lines=[cls.line(cls.ben, cls.ann)],
            created_by=cls.csm,
        )
        cls.taco_map = cls.make_canvas(
            cls.taco, [cls.tia, cls.tom, cls.eve], name="Taco map", created_by=cls.other
        )

    def payload(self, user=None, canvas=None):
        canvas = Canvas.objects.select_related(*DETAIL_RELATED).get(pk=(canvas or self.map).pk)
        return canvas_payload(canvas, user or self.csm, now=self.now, today=self.today)


class PersonFactsTests(CanvasFactsFixture):
    def test_each_persons_facts(self):
        people = self.payload()["people_by_contact"]
        self.assertEqual(
            people[str(self.ann.pk)],
            {
                "name": "Ann",
                "role": "champion",
                "role_display": "Champion",
                "sentiment": "neutral",
                "sentiment_label": "Neutral",
                "last_contacted_at": self.called.isoformat(),
                "latest_survey": {
                    "type": "nps",
                    "score": 9,
                    "answered_at": (self.now - timedelta(days=1)).isoformat(),
                },
                "campaigns_unsubscribed": False,
            },
        )
        ben, cal = people[str(self.ben.pk)], people[str(self.cal.pk)]
        self.assertEqual(
            (
                ben["sentiment"],
                ben["sentiment_label"],
                ben["last_contacted_at"],
                ben["latest_survey"],
            ),
            ("positive", "Positive", self.mailed.isoformat(), None),
        )
        self.assertEqual(
            (
                cal["role"],
                cal["role_display"],
                cal["last_contacted_at"],
                cal["campaigns_unsubscribed"],
            ),
            ("economic_buyer", "Economic Buyer", self.carls_mail.isoformat(), True),
        )

    def test_mail_follows_its_mailbox_rule_and_upcoming_calls_do_not_count(self):
        people = self.payload(self.admin)["people_by_contact"]
        self.assertIsNone(people[str(self.cal.pk)]["last_contacted_at"])
        self.assertEqual(people[str(self.ann.pk)]["last_contacted_at"], self.called.isoformat())

    def test_a_deleted_person_is_removed(self):
        body = self.payload()
        self.assertEqual(body["removed"], ["gone"])
        self.assertNotIn(str(self.gone_id), body["people_by_contact"])
        self.assertEqual((body["people"], len(body["nodes"]), body["hidden"]), (4, 4, []))

    def test_a_person_the_reader_may_not_open_is_hidden_and_nameless(self):
        body = self.payload(self.csm, self.taco_map)
        self.assertEqual(body["hidden"], [f"c{self.tom.pk}"])
        self.assertEqual(set(body["people_by_contact"]), {str(self.tia.pk), str(self.eve.pk)})
        self.assertNotIn("Tom", json.dumps(body))
        self.assertEqual(self.payload(self.other, self.taco_map)["hidden"], [])


class MapPayloadTests(CanvasFactsFixture):
    def test_the_whole_map(self):
        body = self.payload()
        self.assertEqual(
            set(body),
            {
                "id",
                "name",
                "record",
                "people",
                "updated_at",
                "updated_by",
                "version",
                "nodes",
                "edges",
                "people_by_contact",
                "hidden",
                "removed",
                "not_on_map",
                "open_plans",
                "can_delete",
                "created_by",
            },
        )
        self.assertEqual(
            body["record"], {"kind": "organization", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(body["edges"], [self.line(self.ben, self.ann)])
        self.assertEqual(
            (body["version"], body["created_by"], body["updated_by"]),
            (1, {"id": self.csm.pk, "name": "Carl CSM"}, None),
        )

    def test_not_on_map_lists_the_records_people_the_reader_may_open(self):
        lone = self.make_canvas(people=[self.ann], name="Lone")
        self.assertEqual(
            self.payload(canvas=lone)["not_on_map"],
            [
                {
                    "id": self.ben.pk,
                    "name": "Ben",
                    "role": "decision_maker",
                    "role_display": "Decision Maker",
                },
                {
                    "id": self.cal.pk,
                    "name": "Cal",
                    "role": "economic_buyer",
                    "role_display": "Economic Buyer",
                },
            ],
        )
        empty = self.make_canvas(self.taco, name="Empty")
        self.assertEqual(
            [p["name"] for p in self.payload(canvas=empty)["not_on_map"]], ["Eve", "Tia"]
        )
        with patch("services.customers.canvas_payloads.NOT_ON_MAP_LIMIT", 1):
            self.assertEqual(len(self.payload(canvas=lone)["not_on_map"]), 1)

    def test_open_plans_are_the_records_own_open_plans(self):
        open_plan = self.build_plan(self.pizza)
        self.build_plan(self.pizza, status="done", name="Finished")
        account_plan = self.build_plan(self.emea, name="EMEA plan")
        expected = plan_rows(
            Plan.objects.filter(pk=open_plan.pk).select_related("customer", "account", "owner"),
            self.csm,
            today=self.today,
        )
        self.assertEqual(self.payload()["open_plans"], expected)
        emea_map = self.make_canvas(self.emea, [self.ben], name="EMEA map")
        self.assertEqual(
            [r["id"] for r in self.payload(canvas=emea_map)["open_plans"]], [account_plan.pk]
        )

    def test_the_creator_and_their_managers_may_delete(self):
        for user, allowed in ((self.csm, True), (self.mona, True), (self.admin, False)):
            with self.subTest(user=user.name):
                self.assertEqual(self.payload(user)["can_delete"], allowed)
        legacy = self.make_canvas(name="Old")
        self.assertTrue(self.payload(self.admin, legacy)["can_delete"])

    def test_the_queries_do_not_grow_with_the_people_on_the_map(self):
        small = self.make_canvas(people=[self.ann], name="Small", created_by=self.csm)
        self.payload(canvas=small)  # Carl's chart walk, memoised on the user
        with CaptureQueriesContext(connection) as one:
            self.payload(canvas=small)
        with CaptureQueriesContext(connection) as many:
            self.payload(canvas=self.map)
        self.assertEqual(len(one), len(many))
        canvas_sql = [q["sql"] for q in many.captured_queries if "customers_canvas" in q["sql"]]
        self.assertTrue(canvas_sql)
        self.assertFalse([sql for sql in canvas_sql if "DISTINCT" in sql.upper()])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_canvas_facts --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.customers.canvas_payloads'`.

- [ ] **Step 3: Write `services/customers/canvas_payloads.py`**

```python
"""Maps as the API returns them (spec §1.3, §4): rows for the lists, and the
whole map with each person's facts worked out now, for the reader. Every fact
is read under the reader's own rules, in a fixed number of queries whatever
the number of people on the map. Nothing here writes."""

from django.db.models import BooleanField, ExpressionWrapper, Max, Q
from django.utils import timezone

from services.accounts.hierarchy import subtree_ids
from services.campaigns.paging import decode_after, encode, page
from services.mail.visibility import visible_emails_q
from services.organizations.rows import iso, person
from services.plans.access import visible_plans
from services.plans.models import OPEN
from services.plans.payloads import plan_rows, record_ref
from services.surveys.models import SurveyInvite

from .canvas import record_contacts_q, stored_edges, stored_nodes
from .models import Call, Canvas, Contact, Email
from .scoping import customer_rollup_q, visible_accounts, visible_children_q, visible_customers

GALLERY_PAGE = 50
RECORD_LIMIT = 100
NOT_ON_MAP_LIMIT = 200
OPEN_PLANS_LIMIT = 50
#: A search is cut to this many characters.
MAX_QUERY = 120
ROW_RELATED = ("customer", "account", "updated_by")
DETAIL_RELATED = ("customer", "account", "created_by", "updated_by")
ROLE_LABELS = dict(Contact.Role.choices)
SENTIMENT_LABELS = dict(Contact.Sentiment.choices)


def visible_canvases(user):
    """Maps on records `user` may open. Two `id IN` subqueries: never joins
    de-duplicated with DISTINCT, which PostgreSQL 16 planned at about a
    second a call (#86)."""
    # SOC2:AUTH-02 a map is read and edited by whoever may open its record
    return Canvas.objects.filter(
        Q(customer_id__in=visible_customers(user).values("pk"))
        | Q(account_id__in=visible_accounts(user).values("pk"))
    )


def can_delete(user, canvas):
    """The creator and anyone above them; with no creator, anyone who may
    open the record (the caller already may)."""
    creator = canvas.created_by_id
    # SOC2:AUTH-02 deleting a map is its creator's and their management chain's
    return creator is None or creator == user.pk or creator in subtree_ids(user)


def canvas_row(canvas, nodes=None):
    """A `CanvasRow`. Needs `ROW_RELATED` loaded."""
    nodes = stored_nodes(canvas.nodes) if nodes is None else nodes
    return {
        "id": canvas.pk,
        "name": canvas.name,
        "record": record_ref(canvas),
        "people": len(nodes),
        "updated_at": iso(canvas.updated_at),
        "updated_by": person(canvas.updated_by),
    }


def gallery_page(user, params):
    """`GET canvases/`: newest edit first, 50 a page under an opaque cursor;
    a malformed one reads as the first page."""
    canvases = visible_canvases(user).select_related(*ROW_RELATED)
    q = (params.get("q") or "").strip()[:MAX_QUERY]
    if q:
        canvases = canvases.filter(
            Q(name__icontains=q) | Q(customer__name__icontains=q) | Q(account__name__icontains=q)
        )
    canvases = canvases.order_by("-updated_at", "-pk")
    after = decode_after(params.get("cursor"))
    if after is not None:
        at, pk = after
        canvases = canvases.filter(Q(updated_at__lt=at) | Q(updated_at=at, pk__lt=pk))
    rows, more = page(canvases, GALLERY_PAGE)
    cursor = encode(rows[-1].updated_at, rows[-1].pk) if more else None
    return {"results": [canvas_row(canvas) for canvas in rows], "next": cursor}


def record_rows(user, *, customer=None, account=None):
    """A record's maps, newest edit first, at most 100. An organisation's
    include those on its accounts the reader may open (`customer_rollup_q`).
    The caller has already resolved the record as one the reader may open."""
    where = customer_rollup_q(user, customer) if customer is not None else Q(account=account)
    canvases = (
        Canvas.objects.filter(where)
        .select_related(*ROW_RELATED)
        .order_by("-updated_at", "-pk")[:RECORD_LIMIT]
    )
    return {"results": [canvas_row(canvas) for canvas in canvases]}


def _last_contacted(user, people, now):
    """{contact id: the latest call they were on, or email from or to their
    address, that `user` may read, up to `now`}. Two queries however many
    people: one for calls, one aggregate for every address at once."""
    # SOC2:AUTH-02 calls on records the reader may open (a call has no rule of its own)
    calls = Call.objects.filter(visible_children_q(user), occurred_at__lte=now).values("pk")
    latest = dict(
        Call.participants.through.objects.filter(
            contact_id__in=[p["pk"] for p in people], call_id__in=calls
        )
        .order_by()
        .values("contact_id")
        .annotate(at=Max("call__occurred_at"))
        .values_list("contact_id", "at")
    )
    spellings = {}
    for p in people:
        if p["email"]:
            spellings.setdefault(p["email"].lower(), set()).update({p["email"], p["email"].lower()})
    if not spellings:
        return latest
    aliases = {address: f"a{index}" for index, address in enumerate(sorted(spellings))}
    wanted = {}
    for address, alias in aliases.items():
        match = Q(from_address__iexact=address)
        for spelling in sorted(spellings[address]):
            match |= Q(to_addresses__contains=[spelling])
        wanted[alias] = Max("sent_at", filter=match)
    # SOC2:AUTH-02 mail under its own rule (mailbox owner and chain) and its record's
    found = (
        Email.objects.filter(visible_children_q(user))
        .filter(visible_emails_q(user))
        .filter(sent_at__lte=now)
        .aggregate(**wanted)
    )
    for p in people:
        at = found[aliases[p["email"].lower()]] if p["email"] else None
        if at is not None and (latest.get(p["pk"]) is None or at > latest[p["pk"]]):
            latest[p["pk"]] = at
    return latest


def _latest_surveys(user, contact_ids):
    """{contact id: their latest answer} on records the reader may open: the
    type, score and time only, never the comment."""
    # SOC2:AUTH-02 an answer follows its record's visibility, as the record's own scores do
    rows = (
        SurveyInvite.objects.filter(contact_id__in=contact_ids, status=SurveyInvite.Status.ANSWERED)
        .filter(visible_children_q(user))
        .order_by("contact_id", "-answered_at", "-pk")
        .distinct("contact_id")
        .values_list("contact_id", "send__survey_type", "score", "answered_at")
    )
    return {
        contact_id: {"type": kind, "score": score, "answered_at": iso(at)}
        for contact_id, kind, score, at in rows
    }


def _person(row, contacted, surveys):
    return {
        "name": row["name"],
        "role": row["role"],
        "role_display": ROLE_LABELS.get(row["role"], ""),
        "sentiment": row["sentiment"] or None,
        "sentiment_label": SENTIMENT_LABELS.get(row["sentiment"]),
        "last_contacted_at": iso(contacted.get(row["pk"])),
        "latest_survey": surveys.get(row["pk"]),
        "campaigns_unsubscribed": row["campaigns_unsubscribed_at"] is not None,
    }


def _open_plans(user, canvas, today):
    on = (
        {"customer_id": canvas.customer_id}
        if canvas.customer_id is not None
        else {"account_id": canvas.account_id}
    )
    plans = (
        visible_plans(user)
        .filter(status__in=OPEN, **on)
        .select_related("customer", "account", "owner")
        .order_by("-created_at", "-pk")[:OPEN_PLANS_LIMIT]
    )
    return plan_rows(plans, user, today=today)


def canvas_payload(canvas, user, *, now=None, today=None):
    """The whole map for `user` (a `Canvas`). Needs `DETAIL_RELATED` loaded."""
    now = now or timezone.now()
    today = today or timezone.localdate()
    nodes = stored_nodes(canvas.nodes)
    edges = stored_edges(canvas.edges, nodes)
    on_map = {node["data"]["contact_id"] for node in nodes}
    seen = Q(pk__in=Contact.objects.filter(visible_children_q(user)).values("pk"))
    # SOC2:AUTH-02 a person the reader may not open is listed by node id only, never named
    rows = list(
        Contact.objects.filter(pk__in=on_map).values(
            "pk",
            "name",
            "role",
            "sentiment",
            "email",
            "campaigns_unsubscribed_at",
            seen=ExpressionWrapper(seen, output_field=BooleanField()),
        )
    )
    existing = {row["pk"]: row for row in rows}
    visible = [row for row in rows if row["seen"]]
    contacted = _last_contacted(user, visible, now) if visible else {}
    surveys = _latest_surveys(user, [row["pk"] for row in visible]) if visible else {}
    record = record_contacts_q(customer_id=canvas.customer_id, account_id=canvas.account_id)
    # SOC2:AUTH-02 the tray lists only people the reader may open
    tray = (
        Contact.objects.filter(record)
        .filter(visible_children_q(user))
        .exclude(pk__in=on_map)
        .order_by("name", "pk")
        .values("pk", "name", "role")[:NOT_ON_MAP_LIMIT]
    )
    return {
        **canvas_row(canvas, nodes),
        "version": canvas.version,
        "nodes": nodes,
        "edges": edges,
        "people_by_contact": {str(row["pk"]): _person(row, contacted, surveys) for row in visible},
        "hidden": [
            node["id"]
            for node in nodes
            if node["data"]["contact_id"] in existing
            and not existing[node["data"]["contact_id"]]["seen"]
        ],
        "removed": [node["id"] for node in nodes if node["data"]["contact_id"] not in existing],
        "not_on_map": [
            {
                "id": row["pk"],
                "name": row["name"],
                "role": row["role"],
                "role_display": ROLE_LABELS.get(row["role"], ""),
            }
            for row in tray
        ],
        "open_plans": _open_plans(user, canvas, today),
        "can_delete": can_delete(user, canvas),
        "created_by": person(canvas.created_by),
    }
```

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_canvas_facts --noinput`
Expected: PASS. If `test_the_queries_do_not_grow_with_the_people_on_the_map` fails, print both captured query lists and remove the per-person query; never loosen the assertion.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check services/customers && venv/bin/ruff format services/customers
git add services/customers/canvas_payloads.py services/customers/tests/test_canvas_facts.py
git commit -m "feat(canvas): live person facts, hidden and removed people, tray and open plans

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The gallery, making a map, and the record lists

**Files:**
- Create: `services/customers/canvas_views.py`
- Modify: `services/customers/views.py:2232-2314` (delete `CustomerCanvasListView`, `AccountCanvasListView`, `CanvasListView`; keep the old `CanvasDetailView` until Task 5)
- Modify: `config/urls.py:25-29,154-155`, `services/customers/urls.py:1-5,148-157`, `services/account_story/urls.py:10,57-61`
- Modify: `services/customers/tests/test_views.py:4320-4479` (delete `CustomerCanvasListTests`, `AccountCanvasListTests`, `CanvasListTests`)
- Modify: `services/customers/tests/test_account_routes.py` (canvases out of the generic sweep)
- Test: `services/customers/tests/test_canvas_lists.py`

**Interfaces:**
- Consumes: `clean_name`, `people_nodes`, `CHOOSE_RECORD`, `CHOOSE_START` (Task 2); `canvas_payload`, `gallery_page`, `record_rows` (Task 3).
- Produces: `services.customers.canvas_views.CanvasListView` (GET/POST `canvases/`), `CustomerCanvasListView` (GET, kwarg `customer_id`), `AccountCanvasListView` (GET, kwargs `customer_id?`, `account_id`), `record_audit(request, verb, canvas, **metadata)`, `_body(request)`, `_pk(value)`.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_canvas_lists.py`:

```python
"""GET/POST /api/v1/canvases/ and the record lists (spec §1.4, §1.5, §4)."""

from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.customers.models import Canvas
from services.customers.tests.canvas_fixtures import CanvasFixture

CARL = "Carl CSM"


class CanvasCreateTests(CanvasFixture):
    def post(self, user, body):
        return self.as_user(user).post("/api/v1/canvases/", body, format="json")

    def test_from_people_lays_out_the_records_people_by_role(self):
        response = self.post(
            self.csm, {"name": " Pizza map ", "customer": self.pizza.pk, "start": "people"}
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            response.data["nodes"],
            [self.node(self.ben, 0, 0), self.node(self.cal, 240, 0), self.node(self.ann, 0, 160)],
        )
        canvas = Canvas.objects.get(pk=response.data["id"])
        self.assertEqual(
            (canvas.name, canvas.version, canvas.created_by, canvas.updated_by, canvas.edges),
            ("Pizza map", 1, self.csm, self.csm, []),
        )
        self.assertEqual(
            (response.data["version"], response.data["can_delete"], response.data["created_by"]),
            (1, True, {"id": self.csm.pk, "name": CARL}),
        )
        event = AuditEvent.objects.get(action="canvas.created")
        self.assertEqual(
            (event.target_repr, event.metadata, event.actor),
            (f"Canvas {canvas.pk}", {"start": "people", "nodes": 3}, self.csm),
        )

    def test_people_is_the_default_and_leaves_out_people_the_creator_may_not_open(self):
        response = self.post(self.csm, {"name": "Taco map", "customer": self.taco.pk})
        self.assertEqual(
            [n["data"]["contact_id"] for n in response.data["nodes"]], [self.tia.pk, self.eve.pk]
        )

    def test_blank_and_on_an_account(self):
        response = self.post(self.csm, {"name": "EMEA", "account": self.emea.pk, "start": "blank"})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            (response.data["nodes"], response.data["record"]),
            ([], {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"}),
        )
        self.assertEqual(
            AuditEvent.objects.get(action="canvas.created").metadata, {"start": "blank", "nodes": 0}
        )

    def test_refusals(self):
        choose = {"non_field_errors": ["Choose an organisation or an account."]}
        cases = [
            ({"customer": self.pizza.pk}, {"name": ["Give the map a name."]}),
            (
                {"name": "x" * 121, "customer": self.pizza.pk},
                {"name": ["Keep the name to 120 characters."]},
            ),
            (
                {"name": "Map", "customer": self.pizza.pk, "start": "copy"},
                {"start": ["Choose people or blank."]},
            ),
            ({"name": "Map"}, choose),
            ({"name": "Map", "customer": self.pizza.pk, "account": self.emea.pk}, choose),
            ({"name": "Map", "customer_id": self.pizza.pk}, choose),
            ({"name": "Map", "customer": True}, choose),
        ]
        for body, errors in cases:
            with self.subTest(body=body):
                response = self.post(self.csm, body)
                self.assertEqual((response.status_code, response.data), (400, errors))
        self.assertFalse(Canvas.objects.exists())

    def test_a_record_the_creator_may_not_open_is_a_404(self):
        for body in (
            {"customer": self.globex.pk},
            {"account": self.west.pk},
            {"customer": 999_999},
        ):
            with self.subTest(body=body):
                self.assertEqual(self.post(self.csm, {"name": "Map", **body}).status_code, 404)
        self.assertFalse(Canvas.objects.exists())


class CanvasGalleryTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.pizza_map = cls.make_canvas(cls.pizza, [cls.ann, cls.ben], updated_by=cls.csm)
        cls.taco_map = cls.make_canvas(cls.taco, [cls.tia], name="Renewal", created_by=cls.other)
        cls.west_map = cls.make_canvas(cls.west, [cls.tom], name="West map")
        cls.globex_map = cls.make_canvas(cls.globex, name="Globex map")

    def get(self, user=None, **params):
        return self.as_user(user or self.csm).get("/api/v1/canvases/", params)

    def ids(self, response):
        return [row["id"] for row in response.data["results"]]

    def test_maps_on_records_the_reader_may_open_newest_edit_first(self):
        response = self.get()
        self.assertEqual(self.ids(response), [self.taco_map.pk, self.pizza_map.pk])
        self.assertIsNone(response.data["next"])
        self.pizza_map.refresh_from_db()
        self.assertEqual(
            response.data["results"][1],
            {
                "id": self.pizza_map.pk,
                "name": "Pizza map",
                "record": {"kind": "organization", "id": self.pizza.pk, "name": "Pizza Hut"},
                "people": 2,
                "updated_at": self.pizza_map.updated_at.isoformat(),
                "updated_by": {"id": self.csm.pk, "name": CARL},
            },
        )
        self.assertEqual(self.ids(self.get(self.other)), [self.west_map.pk, self.taco_map.pk])
        self.assertEqual(self.ids(self.get(self.stranger)), [self.globex_map.pk])

    def test_q_searches_map_and_record_names(self):
        self.assertEqual(self.ids(self.get(q="renewal")), [self.taco_map.pk])
        self.assertEqual(self.ids(self.get(q="TACO")), [self.taco_map.pk])
        self.assertEqual(self.ids(self.get(q="pizza")), [self.pizza_map.pk])

    def test_cursor_pages(self):
        with patch("services.customers.canvas_payloads.GALLERY_PAGE", 1):
            first = self.get()
            self.assertEqual(self.ids(first), [self.taco_map.pk])
            second = self.get(cursor=first.data["next"])
            self.assertEqual((self.ids(second), second.data["next"]), ([self.pizza_map.pk], None))
            self.assertEqual(self.ids(self.get(cursor="not-a-cursor")), [self.taco_map.pk])

    def test_no_distinct(self):
        with CaptureQueriesContext(connection) as ctx:
            self.get()
        canvas_sql = [q["sql"] for q in ctx.captured_queries if "customers_canvas" in q["sql"]]
        self.assertTrue(canvas_sql)
        self.assertFalse([sql for sql in canvas_sql if "DISTINCT" in sql.upper()])


class RecordCanvasListTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.taco_map = cls.make_canvas(cls.taco, name="Taco map")
        cls.east_map = cls.make_canvas(cls.east, [cls.eve], name="East map")
        cls.west_map = cls.make_canvas(cls.west, name="West map")

    def get(self, user, path):
        return self.as_user(user).get(f"/api/v1{path}")

    def ids(self, response):
        return [row["id"] for row in response.data["results"]]

    def test_an_organisation_lists_its_maps_and_those_on_accounts_the_reader_may_open(self):
        path = f"/customers/{self.taco.pk}/canvases/"
        self.assertEqual(self.ids(self.get(self.csm, path)), [self.east_map.pk, self.taco_map.pk])
        self.assertEqual(
            self.ids(self.get(self.other, path)),
            [self.west_map.pk, self.east_map.pk, self.taco_map.pk],
        )

    def test_an_account_reads_the_same_on_both_routes(self):
        nested = self.get(self.csm, f"/customers/{self.taco.pk}/accounts/{self.east.pk}/canvases/")
        flat = self.get(self.csm, f"/accounts/{self.east.pk}/canvases/")
        self.assertEqual(nested.status_code, 200)
        self.assertEqual(self.ids(nested), [self.east_map.pk])
        self.assertEqual(nested.data, flat.data)
        self.assertEqual(set(nested.data), {"results"})

    def test_a_record_the_reader_may_not_open_is_a_404(self):
        for path in (
            f"/customers/{self.globex.pk}/canvases/",
            f"/customers/{self.taco.pk}/accounts/{self.west.pk}/canvases/",
            f"/accounts/{self.west.pk}/canvases/",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.get(self.csm, path).status_code, 404)

    def test_at_most_100(self):
        with patch("services.customers.canvas_payloads.RECORD_LIMIT", 1):
            response = self.get(self.other, f"/customers/{self.taco.pk}/canvases/")
        self.assertEqual(self.ids(response), [self.west_map.pk])

    def test_maps_are_no_longer_made_here(self):
        client = self.as_user(self.csm)
        for path in (
            f"/api/v1/customers/{self.taco.pk}/canvases/",
            f"/api/v1/accounts/{self.east.pk}/canvases/",
        ):
            with self.subTest(path=path):
                self.assertEqual(client.post(path, {"name": "x"}, format="json").status_code, 405)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_canvas_lists --noinput`
Expected: FAIL (the old views answer bare arrays, take `customer_id`, and accept nested POSTs).

- [ ] **Step 3: Write `services/customers/canvas_views.py`**

```python
"""The map endpoints (spec §1.5, §4). Whoever may open a map's record reads
and edits it; its creator and anyone above them delete it. Every write is
audited with ids and counts only. See docs/API_CONTRACTS.md, `Canvas`."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit

from .canvas import CHOOSE_RECORD, CHOOSE_START, clean_name, people_nodes
from .canvas_payloads import canvas_payload, gallery_page, record_rows
from .models import Canvas
from .scoping import get_url_account, get_visible_customer, visible_accounts, visible_customers

STARTS = ("people", "blank")


def _body(request):
    return request.data if hasattr(request.data, "get") else {}


def _pk(value):
    """A positive id, or None (`True` is not an id)."""
    if isinstance(value, bool):
        return None
    try:
        pk = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return pk if pk > 0 else None


def record_audit(request, verb, canvas, **metadata):
    """`canvas.<verb>`, naming the map by id only, in the write's transaction."""
    audit.record(  # SOC2:LOG-01
        f"canvas.{verb}",
        request=request,
        target=canvas,
        target_repr=f"Canvas {canvas.pk}",
        metadata=metadata,
    )


class CanvasListView(APIView):
    """GET /api/v1/canvases/?q=&cursor=: maps on records the caller may open,
    newest edit first, 50 a page. POST makes one on an organisation or an
    account the caller may open, from its people (default) or blank."""

    # SOC2:AUTH-02 authentication here; `visible_canvases` scopes the gallery and
    # a map is made only on a record the caller may open
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(gallery_page(request.user, request.query_params))

    def post(self, request):
        body = _body(request)
        name = clean_name(body.get("name"))
        start = body.get("start", "people")
        if start not in STARTS:
            raise ValidationError({"start": [CHOOSE_START]})
        customer_id, account_id = _pk(body.get("customer")), _pk(body.get("account"))
        if (customer_id is None) == (account_id is None):
            raise ValidationError({"non_field_errors": [CHOOSE_RECORD]})
        # SOC2:AUTH-02 a record the caller may not open reads as missing (404)
        if customer_id is not None:
            on = {"customer": get_object_or_404(visible_customers(request.user), pk=customer_id)}
        else:
            on = {"account": get_object_or_404(visible_accounts(request.user), pk=account_id)}
        nodes = (
            people_nodes(request.user, customer_id=customer_id, account_id=account_id)
            if start == "people"
            else []
        )
        with transaction.atomic():
            canvas = Canvas.objects.create(
                name=name,
                nodes=nodes,
                edges=[],
                created_by=request.user,
                updated_by=request.user,
                **on,
            )
            record_audit(request, "created", canvas, start=start, nodes=len(nodes))
        return Response(canvas_payload(canvas, request.user), status=status.HTTP_201_CREATED)


class CustomerCanvasListView(APIView):
    """GET /api/v1/customers/<customer_id>/canvases/: the organisation's maps
    and those on its accounts the caller may open, newest edit first, at
    most 100."""

    # SOC2:AUTH-02 authentication here; the organisation must be one the caller may open (404)
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        customer = get_visible_customer(request, customer_id)
        return Response(record_rows(request.user, customer=customer))


class AccountCanvasListView(APIView):
    """GET /api/v1/customers/<customer_id>/accounts/<account_id>/canvases/ and
    /api/v1/accounts/<account_id>/canvases/: the account's maps, newest edit
    first, at most 100."""

    # SOC2:AUTH-02 authentication here; `get_url_account` 404s an account the caller may not open
    permission_classes = [IsAuthenticated]

    def get(self, request, **kwargs):
        return Response(record_rows(request.user, account=get_url_account(request, kwargs)))
```

- [ ] **Step 4: Point the routes at it and remove the old list views**

- `services/customers/views.py`: delete the classes `CustomerCanvasListView`, `AccountCanvasListView` and `CanvasListView` (lines 2232–2314). Keep `CanvasDetailView` for now.
- `services/customers/urls.py`: change `from . import views` to `from . import canvas_views, views`, and in the two canvas routes replace `views.CustomerCanvasListView` with `canvas_views.CustomerCanvasListView` and `views.AccountCanvasListView` with `canvas_views.AccountCanvasListView`.
- `services/account_story/urls.py`: add `from services.customers import canvas_views` next to `from services.customers import views as customers`, and use `canvas_views.AccountCanvasListView.as_view()` in the `<int:account_id>/canvases/` route.
- `config/urls.py`: remove `CanvasListView,` from the `from services.customers.views import (...)` block, add `from services.customers.canvas_views import CanvasListView`, and keep the two `path(...)` lines unchanged.
- Run `venv/bin/ruff check --fix services/customers/views.py config/urls.py` to drop imports that are now unused.

- [ ] **Step 5: Retire the old list tests**

- `services/customers/tests/test_views.py`: delete `CustomerCanvasListTests`, `AccountCanvasListTests` and `CanvasListTests` (lines 4320–4479). Keep `CanvasDetailTests` until Task 5.
- `services/customers/tests/test_account_routes.py`: remove `"canvases"` from `TABS`, its entries in `BODIES` and `MODELS`, the `Canvas.objects.create(...)` line in `fill`, and `Canvas` from the imports. The account's canvas routes are covered by `RecordCanvasListTests`.

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_canvas_lists services.customers.tests.test_account_routes services.customers.tests.test_views services.account_story --noinput`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format services config
git add services/customers/canvas_views.py services/customers/views.py services/customers/urls.py services/account_story/urls.py config/urls.py services/customers/tests/test_canvas_lists.py services/customers/tests/test_views.py services/customers/tests/test_account_routes.py
git commit -m "feat(canvas): gallery, maps from people or blank, record lists as rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Reading, saving and deleting a map

**Files:**
- Modify: `services/customers/canvas_views.py` (add `CanvasDetailView`)
- Modify: `services/customers/views.py` (delete the old `CanvasDetailView`), `services/customers/serializers.py:1459-1488` (delete `CanvasSerializer`), `config/urls.py`
- Modify: `services/customers/tests/test_views.py` (delete `CanvasDetailTests`)
- Test: `services/customers/tests/test_canvas_detail.py`

**Interfaces:**
- Consumes: `clean_name`, `clean_nodes`, `clean_edges`, `stored_nodes`, `stored_edges`, `VERSION_NEEDED`, `CANVAS_CHANGED`, `NOT_DELETER` (Task 2); `DETAIL_RELATED`, `visible_canvases`, `can_delete`, `canvas_payload` (Task 3); `_body`, `record_audit` (Task 4).
- Produces: `services.customers.canvas_views.CanvasDetailView` (GET/PATCH/DELETE `canvases/<int:pk>/`).

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_canvas_detail.py`:

```python
"""GET/PATCH/DELETE /api/v1/canvases/<id>/ (spec §1.2, §1.5, §4): reading,
saving under the row lock with the version, and the delete rule."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.customers.models import Canvas
from services.customers.tests.canvas_fixtures import CanvasFixture

CHANGED = {
    "code": "CANVAS_CHANGED",
    "detail": "Someone else changed this map. Reload to see their changes.",
}
NOT_DELETER = {"detail": "Only the map's creator or their managers can delete it."}


def url(canvas):
    return f"/api/v1/canvases/{canvas.pk}/"


class CanvasReadTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.map = cls.make_canvas(
            people=[cls.ann, cls.ben, cls.cal],
            extra=[{"id": "gone", "position": {"x": 0, "y": 0}, "data": {"contact_id": 999_999}}],
            created_by=cls.csm,
        )
        cls.small = cls.make_canvas(people=[cls.ann], name="Small", created_by=cls.csm)
        cls.legacy = cls.make_canvas(
            name="Legacy",
            extra=[
                {
                    "id": "node_10",
                    "type": "contact",
                    "width": 180,
                    "position": {"x": 5, "y": 6},
                    "data": {"contact_id": cls.ann.pk},
                }
            ],
            lines=[{"id": "x", "source": "node_10", "target": "node_10", "type": "relationship"}],
        )
        cls.west_map = cls.make_canvas(cls.west, name="West map")

    def test_the_map_in_the_contract_shape(self):
        response = self.as_user(self.csm).get(url(self.legacy))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["nodes"],
            [{"id": "node_10", "position": {"x": 5, "y": 6}, "data": {"contact_id": self.ann.pk}}],
        )
        self.assertEqual(response.data["edges"], [])

    def test_a_map_on_a_record_the_reader_may_not_open_is_a_404(self):
        self.assertEqual(self.as_user(self.csm).get(url(self.west_map)).status_code, 404)
        self.assertEqual(self.as_user(self.stranger).get(url(self.map)).status_code, 404)

    def test_the_queries_do_not_grow_with_the_people_on_the_map(self):
        client = self.as_user(self.csm)
        client.get(url(self.small))  # Carl's chart walk, memoised on the user
        with CaptureQueriesContext(connection) as one:
            client.get(url(self.small))
        with CaptureQueriesContext(connection) as many:
            client.get(url(self.map))
        self.assertEqual(len(one), len(many))
        self.assertLessEqual(len(many), 12)
        canvas_sql = [q["sql"] for q in many.captured_queries if "customers_canvas" in q["sql"]]
        self.assertFalse([sql for sql in canvas_sql if "DISTINCT" in sql.upper()])


class CanvasSaveTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.map = cls.make_canvas(
            people=[cls.ann, cls.cal], lines=[cls.line(cls.ann, cls.cal)], created_by=cls.csm
        )
        cls.taco_map = cls.make_canvas(
            cls.taco,
            [cls.tia, cls.tom],
            extra=[{"id": "gone", "position": {"x": 0, "y": 160}, "data": {"contact_id": 999_999}}],
            name="Taco map",
            created_by=cls.other,
        )
        cls.west_map = cls.make_canvas(cls.west, name="West map")

    def patch(self, user, body, canvas=None):
        return self.as_user(user).patch(url(canvas or self.map), body, format="json")

    def test_a_save_bumps_the_version_and_names_the_editor(self):
        body = {
            "name": "Renewal map",
            "version": 1,
            "nodes": [
                self.node(self.ann),
                {**self.node(self.ben, 240), "type": "contact", "selected": True},
                self.node(self.cal, 480),
            ],
            "edges": [
                self.line(self.ann, self.cal),
                {**self.line(self.ben, self.ann, "Influences"), "type": "relationship"},
            ],
        }
        response = self.patch(self.mona, body)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["version"], response.data["updated_by"], response.data["name"]),
            (2, {"id": self.mona.pk, "name": "Mona Manager"}, "Renewal map"),
        )
        self.map.refresh_from_db()
        self.assertEqual(
            self.map.nodes,
            [self.node(self.ann), self.node(self.ben, 240), self.node(self.cal, 480)],
        )
        self.assertEqual(
            self.map.edges,
            [self.line(self.ann, self.cal), self.line(self.ben, self.ann, "Influences")],
        )
        self.assertEqual((self.map.version, self.map.updated_by), (2, self.mona))
        event = AuditEvent.objects.get(action="canvas.updated")
        self.assertEqual(
            (event.target_repr, event.metadata, event.actor),
            (f"Canvas {self.map.pk}", {"nodes": 3, "edges": 2, "renamed": True}, self.mona),
        )

    def test_a_stale_version_is_refused_and_nothing_changes(self):
        self.assertEqual(self.patch(self.csm, {"name": "Mine", "version": 1}).status_code, 200)
        second = self.patch(self.mona, {"name": "Theirs", "version": 1, "nodes": "bad"})
        self.assertEqual((second.status_code, second.data), (409, CHANGED))
        self.map.refresh_from_db()
        self.assertEqual((self.map.name, self.map.version), ("Mine", 2))
        self.assertEqual(AuditEvent.objects.filter(action="canvas.updated").count(), 1)

    def test_the_version_is_required(self):
        for version in (None, "1", 0, True, 1.5):
            body = {"name": "x"} if version is None else {"name": "x", "version": version}
            with self.subTest(version=version):
                response = self.patch(self.csm, body)
                self.assertEqual(
                    (response.status_code, response.data),
                    (400, {"version": ["Send the version you loaded."]}),
                )

    def test_field_refusals_change_nothing(self):
        cases = [
            (
                {"nodes": [self.node(self.tia)]},
                {"nodes": ["Add people from this organisation or account."]},
            ),
            (
                {"edges": [self.line(self.ann, self.cal, "Likes")]},
                {"edges": ["Choose Reports to, Introduced by, Blocks, Influences or no label."]},
            ),
            ({"name": "  "}, {"name": ["Give the map a name."]}),
        ]
        for body, errors in cases:
            with self.subTest(body=body):
                response = self.patch(self.csm, {**body, "version": 1})
                self.assertEqual((response.status_code, response.data), (400, errors))
        self.map.refresh_from_db()
        self.assertEqual((self.map.version, self.map.name), (1, "Pizza map"))
        self.assertFalse(AuditEvent.objects.filter(action="canvas.updated").exists())

    def test_nodes_without_edges_drop_the_lines_of_people_taken_off(self):
        response = self.patch(self.csm, {"version": 1, "nodes": [self.node(self.ann)]})
        self.assertEqual((response.status_code, response.data["edges"]), (200, []))
        self.assertEqual(
            AuditEvent.objects.get(action="canvas.updated").metadata,
            {"nodes": 1, "edges": 0, "renamed": False},
        )

    def test_hidden_and_removed_people_stay_when_someone_else_saves(self):
        page = self.as_user(self.csm).get(url(self.taco_map)).data
        self.assertEqual((page["hidden"], page["removed"]), ([f"c{self.tom.pk}"], ["gone"]))
        response = self.patch(
            self.csm,
            {"version": 1, "nodes": page["nodes"], "edges": [self.line(self.tia, self.tom)]},
            self.taco_map,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.taco_map.refresh_from_db()
        self.assertEqual(
            [n["data"]["contact_id"] for n in self.taco_map.nodes],
            [self.tia.pk, self.tom.pk, 999_999],
        )
        blank = self.make_canvas(self.taco, name="Blank")
        response = self.patch(self.csm, {"version": 1, "nodes": [self.node(self.tom)]}, blank)
        self.assertEqual(response.status_code, 400)

    def test_the_save_holds_the_maps_row_lock(self):
        with CaptureQueriesContext(connection) as ctx:
            self.patch(self.csm, {"name": "Locked", "version": 1})
        self.assertTrue(
            [
                q["sql"]
                for q in ctx.captured_queries
                if '"customers_canvas"' in q["sql"] and "FOR NO KEY UPDATE" in q["sql"]
            ]
        )

    def test_a_map_on_a_record_the_reader_may_not_open_is_a_404(self):
        response = self.patch(self.csm, {"name": "x", "version": 1}, self.west_map)
        self.assertEqual(response.status_code, 404)


class CanvasDeleteTests(CanvasFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.carls = cls.make_canvas(people=[cls.ann], created_by=cls.csm)
        cls.danas = cls.make_canvas(cls.taco, [cls.tia], name="Taco map", created_by=cls.other)
        cls.legacy = cls.make_canvas(name="Old")

    def delete(self, user, canvas):
        return self.as_user(user).delete(url(canvas))

    def test_a_manager_of_the_creator_may_delete(self):
        self.assertEqual(self.delete(self.mona, self.carls).status_code, 204)
        self.assertFalse(Canvas.objects.filter(pk=self.carls.pk).exists())
        event = AuditEvent.objects.get(action="canvas.deleted")
        self.assertEqual((event.target_repr, event.actor), (f"Canvas {self.carls.pk}", self.mona))

    def test_the_creator_may_delete(self):
        self.assertEqual(self.delete(self.other, self.danas).status_code, 204)

    def test_anyone_else_is_refused(self):
        for user, canvas in ((self.admin, self.carls), (self.csm, self.danas)):
            with self.subTest(user=user.name):
                response = self.delete(user, canvas)
                self.assertEqual((response.status_code, response.data), (403, NOT_DELETER))
        self.assertEqual(Canvas.objects.filter(pk__in=[self.carls.pk, self.danas.pk]).count(), 2)
        self.assertFalse(AuditEvent.objects.filter(action="canvas.deleted").exists())

    def test_a_map_without_a_creator_is_anyones_who_may_open_its_record(self):
        self.assertEqual(self.delete(self.admin, self.legacy).status_code, 204)

    def test_a_map_on_a_record_the_reader_may_not_open_is_a_404(self):
        self.assertEqual(self.delete(self.other, self.carls).status_code, 404)
        self.assertTrue(Canvas.objects.filter(pk=self.carls.pk).exists())
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_canvas_detail --noinput`
Expected: FAIL (the old detail view answers the old shape, ignores `version`, and lets anyone delete).

The ceiling of 12 in `test_the_queries_do_not_grow_with_the_people_on_the_map` is the seven reads of Task 3 (the map, its contacts, calls, mail, surveys, the tray, open plans) plus headroom for authentication. If it is exceeded, print `many.captured_queries` and find the extra read; never raise the ceiling to fit.

- [ ] **Step 3: Add `CanvasDetailView` to `services/customers/canvas_views.py`**

Change the imports at the top to:

```python
from rest_framework.exceptions import PermissionDenied, ValidationError

from .canvas import (
    CANVAS_CHANGED,
    CHOOSE_RECORD,
    CHOOSE_START,
    NOT_DELETER,
    VERSION_NEEDED,
    clean_edges,
    clean_name,
    clean_nodes,
    people_nodes,
    stored_edges,
    stored_nodes,
)
from .canvas_payloads import (
    DETAIL_RELATED,
    can_delete,
    canvas_payload,
    gallery_page,
    record_rows,
    visible_canvases,
)
```

and append:

```python
def _version(body):
    version = body.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise ValidationError({"version": [VERSION_NEEDED]})
    return version


class CanvasDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/canvases/<id>/. Whoever may open the map's
    record reads and saves it (404 for anyone else); a save carries the
    version it was loaded at (409 when someone saved since). Its creator and
    anyone above them delete it (403 for other readers)."""

    # SOC2:AUTH-02 authentication here; `visible_canvases` scopes every read and write
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        canvases = visible_canvases(request.user).select_related(*DETAIL_RELATED)
        return Response(canvas_payload(get_object_or_404(canvases, pk=pk), request.user))

    def patch(self, request, pk):
        body = _body(request)
        version = _version(body)
        with transaction.atomic():
            locked = (
                visible_canvases(request.user)
                .select_for_update(no_key=True, of=("self",))
                .select_related(*DETAIL_RELATED)
            )
            canvas = get_object_or_404(locked, pk=pk)
            if canvas.version != version:
                return Response(
                    {"code": "CANVAS_CHANGED", "detail": CANVAS_CHANGED},
                    status=status.HTTP_409_CONFLICT,
                )
            renamed = False
            if "name" in body:
                name = clean_name(body["name"])
                renamed = name != canvas.name
                canvas.name = name
            nodes = stored_nodes(canvas.nodes)
            if "nodes" in body:
                nodes = clean_nodes(
                    body["nodes"],
                    viewer=request.user,
                    customer_id=canvas.customer_id,
                    account_id=canvas.account_id,
                    kept_contact_ids={node["data"]["contact_id"] for node in nodes},
                )
            if "edges" in body:
                edges = clean_edges(body["edges"], nodes)
            else:
                edges = stored_edges(canvas.edges, nodes)
            canvas.nodes, canvas.edges = nodes, edges
            canvas.version += 1
            canvas.updated_by = request.user
            canvas.save(
                update_fields=["name", "nodes", "edges", "version", "updated_by", "updated_at"]
            )
            record_audit(
                request, "updated", canvas, nodes=len(nodes), edges=len(edges), renamed=renamed
            )
        return Response(canvas_payload(canvas, request.user))

    def delete(self, request, pk):
        with transaction.atomic():
            locked = visible_canvases(request.user).select_for_update(of=("self",))
            canvas = get_object_or_404(locked, pk=pk)
            # SOC2:AUTH-02 only the creator and their management chain delete a map
            if not can_delete(request.user, canvas):
                raise PermissionDenied(NOT_DELETER)
            record_audit(request, "deleted", canvas)
            canvas.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Remove the old detail view and serializer**

- `services/customers/views.py`: delete the old `class CanvasDetailView` (the one with `visible_children_q(...).distinct()`).
- `services/customers/serializers.py`: delete `class CanvasSerializer` and `Canvas` from its model imports if nothing else there uses it.
- `config/urls.py`: remove `CanvasDetailView,` from the `services.customers.views` import block and import it with the list view: `from services.customers.canvas_views import CanvasDetailView, CanvasListView`.
- `services/customers/tests/test_views.py`: delete `CanvasDetailTests`; drop `Canvas` from the file's imports if `grep -n "Canvas" services/customers/tests/test_views.py` finds no other use.
- Run `venv/bin/ruff check --fix services/customers config` to drop imports that are now unused.

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.customers --noinput --parallel`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format services config
git add services/customers/canvas_views.py services/customers/views.py services/customers/serializers.py config/urls.py services/customers/tests/test_canvas_detail.py services/customers/tests/test_views.py
git commit -m "feat(canvas): live map read, versioned saves under the row lock, creator-only delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: End-to-end flow

**Files:**
- Create: `e2e/test_canvas_flow.py`

**Interfaces:**
- Consumes: every route from Tasks 4–5; `e2e.http`.

- [ ] **Step 1: Write the test**

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Alice (admin) signs the workspace up and adds Carl and Dana. Dana owns Taco
Bell with Tia on it, and its account Taco West with Tom; Alice gives Carl the
account Taco East, with Eve on it, so Carl may open Taco Bell but not Taco
West. Carl makes a map of Taco Bell from its people (Tia, then Eve; Tom is
not his to see). Dana adds Tom and a line and saves first; Carl's save from
the same version is refused with 409; he reloads, Tom's node is there but
nameless, and his save goes through. Dana may not delete Carl's map; Carl
may."""

import json

from django.test import LiveServerTestCase

from e2e.http import http_delete, http_get, http_patch, http_post


class CanvasFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def login(self, email, password):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def test_full_flow(self):
        # 1. The workspace, Carl and Dana.
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Acme Inc",
                "name": "Alice Admin",
                "email": "alice@acme.io",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        carl_id = self.created(
            "/auth/users/",
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            alice,
        )["id"]
        self.created(
            "/auth/users/",
            {"name": "Dana CSM", "email": "dana@acme.io", "password": "csmpassword2"},
            alice,
        )
        carl = self.login("carl@acme.io", "csmpassword1")
        dana = self.login("dana@acme.io", "csmpassword2")

        # 2. Dana's Taco Bell and Taco West; Alice gives Carl Taco East.
        taco = self.created("/customers/", {"name": "Taco Bell"}, dana)["id"]
        west = self.created(f"/customers/{taco}/accounts/", {"name": "Taco West"}, dana)["id"]
        east = self.created(
            f"/customers/{taco}/accounts/", {"name": "Taco East", "owner_id": carl_id}, alice
        )["id"]
        tia = self.created(
            f"/customers/{taco}/contacts/",
            {"name": "Tia", "email": "tia@taco.example", "role": "champion"},
            dana,
        )["id"]
        tom = self.created(
            f"/customers/{taco}/accounts/{west}/contacts/",
            {"name": "Tom", "email": "tom@taco.example", "role": "decision_maker"},
            dana,
        )["id"]
        eve = self.created(
            f"/customers/{taco}/accounts/{east}/contacts/",
            {"name": "Eve", "email": "eve@taco.example", "role": "influencer"},
            carl,
        )["id"]

        # 3. Carl's map of Taco Bell from its people: Tom is not his to see.
        canvas = self.created(
            "/canvases/", {"name": "Taco map", "customer": taco, "start": "people"}, carl
        )
        self.assertEqual([n["data"]["contact_id"] for n in canvas["nodes"]], [tia, eve])
        self.assertEqual(
            (canvas["version"], canvas["can_delete"], canvas["hidden"], canvas["not_on_map"]),
            (1, True, [], []),
        )
        path = f"/canvases/{canvas['id']}/"

        # 4. Dana adds Tom and a line, and saves first.
        status, theirs = http_get(self.api(path), token=dana)
        self.assertEqual([p["name"] for p in theirs["not_on_map"]], ["Tom"])
        tom_node = {"id": f"c{tom}", "position": {"x": 240, "y": 0}, "data": {"contact_id": tom}}
        reports = {"id": "e1", "source": f"c{tom}", "target": f"c{tia}", "label": "Reports to"}
        status, body = http_patch(
            self.api(path),
            {"version": 1, "nodes": [*theirs["nodes"], tom_node], "edges": [reports]},
            token=dana,
        )
        self.assertEqual((status, body["version"]), (200, 2), body)

        # 5. Carl's save from version 1 is refused; he reloads and saves again.
        influences = {"id": "e2", "source": f"c{eve}", "target": f"c{tia}", "label": "Influences"}
        status, body = http_patch(self.api(path), {"version": 1, "edges": [influences]}, token=carl)
        self.assertEqual((status, body["code"]), (409, "CANVAS_CHANGED"))
        status, page = http_get(self.api(path), token=carl)
        self.assertEqual((page["version"], page["hidden"]), (2, [f"c{tom}"]))
        self.assertNotIn(str(tom), page["people_by_contact"])
        self.assertNotIn("Tom", json.dumps(page))
        status, body = http_patch(
            self.api(path),
            {"version": 2, "nodes": page["nodes"], "edges": [*page["edges"], influences]},
            token=carl,
        )
        self.assertEqual((status, body["version"], len(body["edges"])), (200, 3, 2), body)

        # 6. The lists.
        status, gallery = http_get(self.api("/canvases/"), token=carl)
        self.assertEqual([(r["id"], r["people"]) for r in gallery["results"]], [(canvas["id"], 3)])
        status, rows = http_get(self.api(f"/customers/{taco}/canvases/"), token=dana)
        self.assertEqual(rows["results"][0]["updated_by"]["name"], "Carl CSM")

        # 7. Dana may not delete Carl's map; Carl may.
        status, body = http_delete(self.api(path), token=dana)
        self.assertEqual(
            (status, body["detail"]),
            (403, "Only the map's creator or their managers can delete it."),
        )
        status, _ = http_delete(self.api(path), token=carl)
        self.assertEqual(status, 204)
        status, _ = http_get(self.api(path), token=carl)
        self.assertEqual(status, 404)
```

- [ ] **Step 2: Run it**

Run: `venv/bin/python manage.py test e2e.test_canvas_flow --noinput`
Expected: PASS. If a setup call (users, accounts, contacts) is refused, read that route's own e2e test (`e2e/test_customers_flow.py`, `e2e/test_plans_flow.py`) for its body and fix the request, not the canvas code.

- [ ] **Step 3: Commit**

```bash
venv/bin/ruff check e2e && venv/bin/ruff format e2e
git add e2e/test_canvas_flow.py
git commit -m "test(e2e): canvas from people, a conflicting save, a hidden person, delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Docs and the full check

**Files:**
- Modify: `docs/API_CONTRACTS.md` (line ~64 account-page row, ~74 Canvas row, ~848 roll-up note, ~3159–3170 account routes, ~4009–4100 the Canvas sections)
- Modify: `docs/audit-events.md` (after the `campaign.*` rows)
- Modify: `docs/product/05-backend-schema.md:213`, `docs/product/01-prd.md:167` and its delivery log (after the 2026-10-04 Campaigns row), `docs/product/02-trd.md` §2.4 table (after the `services/campaigns/` row)

- [ ] **Step 1: API_CONTRACTS**

- Line ~64 (Account page row): `{contacts,…,notes,canvases}/` stays, and add after it: "(canvases: GET only)".
- Line ~74 (Canvas row): replace the description with: `🟢 Live maps — see below. Gallery (\`GET/POST /canvases/\`, cursor pages), the record lists (\`GET\` only, \`{results}\`), and the map (\`GET/PATCH/DELETE /canvases/<id>/\`) with each person's facts worked out for the reader. Saves carry a \`version\`; deleting is the creator's and their managers'.`
- Line ~848: replace "Survey and Canvas rows still carry theirs unfiltered — the known follow-up is giving those two the same treatment." with "Survey rows still carry theirs unfiltered — the known follow-up is giving them the same treatment. Canvas rows name only the map's own record (`record`), which the reader may open."
- Line ~3159 heading and ~3169 text: canvases are GET only on the account routes ("a create is always on this account" no longer applies to canvases; maps are made through `POST /canvases/`).
- Replace everything from `### Models — \`Canvas\`` down to (not including) `### Models — \`Headline\`` with:

````markdown
### Models — `Canvas`

A live stakeholder map on exactly one organisation (`customer`) or one account (`account`)
(`canvas_belongs_to_exactly_one_parent`). Stored: `name` (≤120 on write), `nodes` (`{id, position: {x, y},
data: {contact_id}}`, at most 60), `edges` (`{id, source, target, label}`, at most 150; label `Reports to`,
`Introduced by`, `Blocks`, `Influences` or `""`), `created_by`, `updated_by` (SET_NULL; null on maps made before
live maps), `version` (optimistic concurrency), `created_at`, `updated_at`. Nothing about a person is stored: their
facts are worked out for the reader on every read (`services/customers/canvas_payloads.py`). A map saved before
live maps holds React Flow's own keys (`type`, `width`, `sourceHandle`, …); reads leave them out and the next save
drops them. The frontend adds `type: "contact"`/`"relationship"` itself.

Who: anyone who may open the map's record reads and saves it (`visible_customers`/`visible_accounts` as `id IN`
subqueries; any other map is `404`). Deleting is the creator's and anyone above them in the org chart
(`subtree_ids`); a map with no creator is anyone's who may open its record; others get `403`.

Shared shapes:

```ts
type RelationshipLabel = 'Reports to' | 'Introduced by' | 'Blocks' | 'Influences' | '';
type PersonRef = { id: number; name: string };
type RecordRef = { kind: 'organization' | 'account'; id: number; name: string };
type CanvasNode = { id: string; position: { x: number; y: number }; data: { contact_id: number } };
type CanvasEdge = { id: string; source: string; target: string; label: RelationshipLabel };
type MapPerson = {
  name: string;
  role: string; // Contact.role slug, e.g. "decision_maker"
  role_display: string; // its label, e.g. "Decision Maker"
  sentiment: string | null; // "positive" | "neutral" | "negative"
  sentiment_label: string | null; // "Positive" | "Neutral" | "Negative"
  last_contacted_at: string | null;
  latest_survey: { type: 'nps' | 'csat' | 'ces'; score: number; answered_at: string } | null;
  campaigns_unsubscribed: boolean;
};
type CanvasRow = {
  id: number; name: string; record: RecordRef;
  people: number; // every node, hidden and removed ones included
  updated_at: string; updated_by: PersonRef | null;
};
type Canvas = CanvasRow & {
  version: number;
  nodes: CanvasNode[]; edges: CanvasEdge[];
  people_by_contact: Record<string, MapPerson>; // people the reader may open, by contact id
  hidden: string[]; // node ids whose contact the reader may not open
  removed: string[]; // node ids whose contact was deleted
  not_on_map: { id: number; name: string; role: string; role_display: string }[]; // ≤200
  open_plans: PlanRow[]; // the record's own open plans, as GET /plans/
  can_delete: boolean;
  created_by: PersonRef | null;
};
```

Live facts, each under the reader's own rules: `last_contacted_at` is the latest call the person was on
(`Call.participants`) or email from or to their address (record rule and the mailbox rule), up to now; meetings
are not linked to people and do not count. `latest_survey` is their latest answered survey invite on a record
the reader may open (type, score and time; never the comment). One read costs the same number of queries
whatever the number of people.

### `GET /api/v1/canvases/?q=&cursor=`

Auth: `IsAuthenticated`. Maps on records the caller may open, newest edit first, 50 a page. `q` searches the
map's, the organisation's and the account's names. **Response `200`** `{results: CanvasRow[], next: string |
null}`; `next` is an opaque cursor (a malformed one reads as the first page).

### `POST /api/v1/canvases/`

Body `{name, customer?: id, account?: id, start?: 'people' | 'blank'}` (exactly one of `customer`/`account`;
`start` defaults to `people`). `people` places the record's contacts the caller may open, in rows by role
(decision makers and economic buyers, champions, influencers, everyone else), six to a row on a 240 × 160 grid, at
most 60, node ids `c<contact id>`, no edges. **Response `201`** `Canvas`. `400` `{"name": ["Give the map a
name."]}` / `{"name": ["Keep the name to 120 characters."]}` / `{"start": ["Choose people or blank."]}` /
`{"non_field_errors": ["Choose an organisation or an account."]}`; `404` for a record the caller may not open.
Audited `canvas.created`.

### `GET/PATCH/DELETE /api/v1/canvases/<id>/`

GET: **`200`** `Canvas`. PATCH: body `{name?, nodes?, edges?, version}`, under the map's `FOR NO KEY UPDATE`
row lock. `version` missing or not a whole number ≥1: `400 {"version": ["Send the version you loaded."]}`. Not the
stored one: `409 {"code": "CANVAS_CHANGED", "detail": "Someone else changed this map. Reload to see their
changes."}`, before any field is checked. People already on the map stay allowed though hidden or removed; anyone
else must be one of the record's people the caller may open. `nodes` without `edges` drops the lines of people
taken off. Field refusals are `400 {field: [message]}` (the messages are `services/customers/canvas.py`'s).
A good save bumps `version`, sets `updated_by` and answers **`200`** `Canvas`; audited `canvas.updated`. DELETE:
**`204`**; `403 {"detail": "Only the map's creator or their managers can delete it."}`; audited `canvas.deleted`.
`404` throughout for a map on a record the caller may not open.

### `GET /api/v1/customers/<customer_id>/canvases/`, `GET /api/v1/customers/<customer_id>/accounts/<account_id>/canvases/`, `GET /api/v1/accounts/<account_id>/canvases/`

The record's maps, newest edit first, at most 100: **`200`** `{results: CanvasRow[]}`. The organisation's list
also holds the maps on its accounts that the caller may open. `404` for a record the caller may not open. POST is
`405`: maps are made through `POST /canvases/`.

See `seed_demo_canvases` for demo data (run after `seed_demo_accounts`).
````

- [ ] **Step 2: audit-events, schema, PRD, TRD**

- `docs/audit-events.md`, after the last `campaign.*` row:

```markdown
| `canvas.created` | `services.customers.canvas_views.CanvasListView.post` | user | Canvas ("Canvas <id>") | `start` (`people`/`blank`), `nodes` (count) |
| `canvas.updated` | `services.customers.canvas_views.CanvasDetailView.patch` | user | Canvas | `nodes`, `edges` (counts after the save), `renamed` (bool) |
| `canvas.deleted` | `services.customers.canvas_views.CanvasDetailView.delete` | user | Canvas | — |
```

- `docs/product/05-backend-schema.md:213`: `| \`Canvas\` | A live stakeholder map: \`name\`, \`nodes\` (positions and contact ids only) and \`edges\` (labelled relationships) JSON, \`created_by\`, \`updated_by\`, \`version\` (optimistic concurrency); each person's facts are read live, never stored |`
- `docs/product/01-prd.md:167`: `| Canvas (stakeholder map) | Built | A live map on an organisation or account: positions and labelled relationships are stored, and each person's role, sentiment, last contact, latest survey answer and unsubscribed flag are read live under the reader's rules (people they may not open stay on the map, nameless). Made from the record's people in rows by role, or blank; anyone who may open the record edits, a save from an older copy is refused; the creator and their managers delete; the record's open plans beside it |`. Delivery log, after the 2026-10-04 Campaigns row: `| 2026-10-04 | Canvas (backend): live stakeholder maps with person facts read for the reader, maps from people, versioned saves, creator-only delete, audited |`
- `docs/product/02-trd.md` §2.4 table, after the `services/campaigns/` row: `| \`services/customers/canvas.py\`, \`canvas_payloads.py\`, \`canvas_views.py\` | Canvas: \`canvas.py\` checks what a save may hold (people from the map's own record that the saver may open, plus anyone already on it) and lays out a map from people; \`canvas_payloads.py\` reads maps through two \`id IN\` subqueries and works out each person's facts (calls, mail under the mailbox rule, the latest survey answer, the unsubscribed flag) for the reader in a fixed number of queries; a save locks the map's row \`FOR NO KEY UPDATE\` and compares \`version\` (409 \`CANVAS_CHANGED\`); delete is the creator's and their chain's (\`subtree_ids\`) |`

- [ ] **Step 3: Format the docs**

Run: `venv/bin/ruff format docs/API_CONTRACTS.md docs/audit-events.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md`
Expected: files reformatted or left unchanged, no error.

- [ ] **Step 4: The full check**

Run each and read its output:

```bash
venv/bin/ruff check .
venv/bin/ruff format --check .
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python scripts/ci_shard_labels.py --check 4
venv/bin/python manage.py test --parallel --noinput
```

Expected: no lint or format findings; "No changes detected"; the shard check passes; the whole suite passes. Fix any failure at its cause before committing.

- [ ] **Step 5: Commit**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md
git commit -m "docs(canvas): live maps in the contracts, audit catalogue, schema, PRD and TRD

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec | Task |
|---|---|
| §1.1 fields, migration | 1 |
| §1.1 validation (nodes, edges, name, refusals) | 2 (rules), 5 (PATCH) |
| §1.2 read/edit by record, `id__in`, 404; delete rule, 403 | 3 (`visible_canvases`, `can_delete`), 4, 5 |
| §1.3 live facts, hidden, removed, `not_on_map`, `open_plans`, batched | 3 |
| §1.4 new maps (people/blank, rows, grid, 60, `created_by`, `version=1`) | 2 (`layout`, `people_nodes`), 4 |
| §1.5 gallery, create, detail, PATCH lock and 409, DELETE, record lists | 4, 5 |
| §1.6 audit, logs, docs | 4, 5 (audit), 7 (docs) |
| §4 contract | 3–5, contract notes |
| e2e journey (§2.4, backend half) | 6 |

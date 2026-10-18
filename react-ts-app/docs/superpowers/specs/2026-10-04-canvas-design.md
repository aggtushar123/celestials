# Canvas: live stakeholder maps

Agreed with the owner on 2026-10-04. Delivery 6 of the Impact section, and
the last item in its build order ("6 Canvas (+ org page tab)"). Segments
decide who, Rules decide when, and Surveys, Plans and Campaigns are the
"what". Canvas is where a customer success manager sees who matters on an
account and how they are doing, next to the account's plans.

## 0. Why, and what exists

- **`customers.Canvas`** is a stakeholder map on exactly one organisation
  (`customer`) or one account (`account`), enforced by a CheckConstraint.
  - Its fields are `name`, `nodes` and `edges` (React Flow JSON, stored as
    given), `created_at` and `updated_at`.
  - Each node's `data` holds only a `contact_id`.
  - A record can have several maps.
- **Routes**
  - `GET/POST /api/v1/canvases/`: `CanvasListView`.
  - `GET/PATCH/DELETE /api/v1/canvases/:id/`: `CanvasDetailView`. Its queryset
    is `visible_children_q(user)` plus `.distinct()`, the join-and-DISTINCT
    shape that was slow on Postgres 16 (#86).
  - The nested record lists `customers/:id/canvases/` and
    `customers/:id/accounts/:aid/canvases/`.
- **Frontend**
  - `src/pages/canvas` holds the `/canvas` gallery (`CanvasPage`), the editor
    (`CanvasEditor`, using `@xyflow/react`), `ContactNode`, `CanvasEdge` and
    `NewCanvasModal`.
  - The account page has a Canvases tab (`CanvasesTab`).
  - The organisation page has no maps tab since its redesign.
  - The relationship labels are `RELATIONSHIP_LABELS = ['Reports to',
    'Introduced by', 'Blocks', 'Influences']`.
- **Permissions:** anyone who can open the record can edit or delete any map.
  There is no creator, no audit and no protection against two people
  editing at once.
- **Live facts already exist elsewhere**
  - Contact `role` and computed sentiment.
  - Calls, emails and meetings filed on the contact's record.
  - `surveys.SurveyInvite` (`contact`, `score`, `answered_at`, through its
    send's survey type).
  - `Contact.campaigns_unsubscribed_at`.
  - Plans on the record (`services/plans`).

## Decisions (agreed 2026-10-04)

| Topic | Decision |
|---|---|
| Purpose | A live stakeholder map. Positions and relationships are stored; each person's facts are read live on every load. |
| Editing | Anyone who can open the record may edit a map, and every save is audited. Deleting a map is limited to its creator and anyone above them. |
| Node card | Role and sentiment, last contact, latest survey answer, and the campaign "Unsubscribed" flag. Plan tasks are assigned to teammates, not contacts, so the record's open plans appear in a strip above the board instead. |
| New map | Built from the record's people by default, in rows by role. A blank map stays an option. People added to the record later go to a "Not on the map" tray, never onto the map automatically. |
| Approach | Keep `customers.Canvas` and work out the live person facts on the server in batched queries. No new tables. |

## 1. Backend

### 1.1 Model changes (`customers.Canvas`)

- **New fields**
  - `created_by` (FK user, SET_NULL, null): who may delete. Null on existing
    maps.
  - `updated_by` (FK user, SET_NULL, null).
  - `version` (PositiveInteger, default 1): optimistic concurrency.
- **Validation on every write** (`services/customers/canvas.py`):
  - **Nodes**
    - At most 60. Each is `{id: str ≤64, position: {x: number, y: number},
      data: {contact_id: int}}`.
    - Node ids are unique within the map.
    - `contact_id` must be a contact of the map's own record. For an
      organisation map that includes contacts of its accounts. A contact
      can appear at most once.
    - Anything else is refused: "Add people from this organisation or
      account."
    - React Flow's extra keys (`type`, `width`, `height`, `selected`,
      `dragging`) are dropped on save.
  - **Edges**
    - At most 150. Each is `{id: str ≤64, source, target, label}`.
    - `source` and `target` must be node ids on the map and must differ.
    - `label` is one of `Reports to`, `Introduced by`, `Blocks`,
      `Influences`, or empty.
    - There is at most one edge per source, target and label.
  - `name` is at most 120 characters and not blank: "Give the map a name."
  - Refusals are `{field: [message]}`.
- **Migration:** adds the three fields. Existing rows get `version=1` and a
  null creator.

### 1.2 Who can do what (SOC2:AUTH-02)

- **Read and edit:** anyone who can open the map's record, through
  `visible_customers`/`visible_accounts` as `id__in` subqueries. Never a join
  with `.distinct()`; the current detail queryset is replaced. A map on a
  record the reader can't open answers 404.
- **Delete:** the creator, or anyone above the creator (`subtree_ids`).
  - A map with no creator can be deleted by anyone who can open its record,
    as today.
  - Others get 403: "Only the map's creator or their managers can delete
    it."

### 1.3 Live person facts (worked out when read, never stored)

Per node contact, computed in batched queries so the query count stays the
same whatever the number of nodes:

- `name`, `role`, `sentiment` and its word: the contact payload's existing
  fields.
- `last_contacted_at`: the latest of that contact's calls, emails and
  meetings that the reader can see. Each source uses its own record rule,
  as the Story does (`organizations.story.sources`). If none is visible, it
  is null.
- `latest_survey`: `{type: "nps"|"csat"|"ces", score, answered_at}` from the
  contact's most recent answered `SurveyInvite`, or null.
- `campaigns_unsubscribed`: true or false.

How each node is classified:

- A contact the reader may open → its facts appear in `people`.
- A contact that exists but that the reader may not open → the node is
  listed in `hidden`, and no name or facts are returned.
- A deleted contact → the node is listed in `removed`.

`not_on_map` lists the record's contacts the reader may open who are not on
the map yet (`{id, name, role}`), at most 200.

`open_plans` lists the record's open plans as Plans' `PlanRow` payload,
filtered exactly as `GET plans/` filters them (record visibility, and task
counts over visible tasks only).

### 1.4 New maps

`POST canvases/ {name, customer|account, start: "people"|"blank"}`:

- **"people"** places the record's contacts the creator may open, in rows by
  role:
  1. Decision Maker and Economic Buyer;
  2. Champion;
  3. Influencer;
  4. everyone else.
  - Each row holds at most 6 people, with extra people spilling onto the
    next row.
  - Positions are on a 240 × 160 grid, rows left-aligned.
  - At most 60 people, ordered by role then name.
  - No edges.
- **"blank"** has no nodes.
- The new map gets `created_by` set and `version=1`.

### 1.5 API (`/api/v1/`)

The binding shapes are in §4.

| Method & path | What |
|---|---|
| `GET canvases/` | Gallery: maps on records the reader may open, newest edit first. `q` searches map and record names. Cursor pages of 50. |
| `POST canvases/` | Create (§1.4). Returns 201 with the map. |
| `GET canvases/:id/` | The map with live facts (§1.3). |
| `PATCH canvases/:id/` | `{name?, nodes?, edges?, version}`. Runs under `select_for_update(no_key=True)` on the canvas row. A stale version answers 409 `{code: "CANVAS_CHANGED", detail: "Someone else changed this map. Reload to see their changes."}`. A good save bumps `version`, sets `updated_by` and returns the map. |
| `DELETE canvases/:id/` | Creator or anyone above them (§1.2). Returns 204. |
| `GET customers/:id/canvases/`, `GET customers/:id/accounts/:aid/canvases/` | The record's maps as rows (404 if the record is hidden). Newest edit first. Not paged; at most 100. |

### 1.6 Audit, logs, docs

- **Audit**, with ids and counts only:
  - `canvas.created` (`{start, nodes}`);
  - `canvas.updated` (`{nodes, edges, renamed: bool}`);
  - `canvas.deleted`.
- **Logs:** ids only.
- **Docs:** API_CONTRACTS, audit-events, schema, PRD and TRD.

## 2. Frontend

### 2.1 Maps tab on organisation and account pages

- **Tab:** a **Maps** tab next to People on the organisation page. The
  account page's Canvases tab is replaced by the same component, also
  named Maps.
- **Rows:** each shows the name, the number of people, and "Edited by
  <name> · <relative time>". A row links to `/canvas/:id`.
- **New map** opens a small dialog with:
  - the name (default "<Record> map");
  - "From this record's people" (default) or "Blank".

  It submits once, then opens the editor.
- **States:** skeleton rows while loading; "No maps yet" with New map;
  an error with Retry.

### 2.2 Map editor `/canvas/:id`

- **Header:** the name (editable inline), the record as a link, "Edited by …",
  **Save** (disabled until there are changes), and a ⋯ menu with Delete
  (only when `can_delete`).
  - "Unsaved changes" appears as text when there are unsaved edits.
  - Leaving with unsaved changes asks first.
- **Open plans strip** above the board: each plan's name, status pill and next
  due date (mono), linking to `/projects/:id`. If there are none, it says
  "No open plans" with Start a plan.
- **Board** (`@xyflow/react`)
  - **Node card**
    - Name and role.
    - Sentiment as a dot plus the word.
    - "Contacted 12 days ago", or "Not contacted in 60+ days" in warning
      tone with an icon and the words.
    - The latest survey, such as "NPS 9 · 3 Oct", in mono.
    - An "Unsubscribed" chip.
  - **Hidden and removed people**
    - Hidden nodes read "Someone you can't open", with no details. They
      can't be opened, but stay on the map.
    - Removed nodes read "Removed contact" with a Remove from map action.
  - **Lines**
    - Drawn by dragging from a node's handle.
    - A line's label is picked from a small menu with the four labels plus
      "No label".
    - A selected line can be removed.
  - **Keyboard and touch**
    - Each node has a **⋯ menu** (44px): Open person, Add a relationship to…
      (pick a person, then a label), Remove from map.
    - Every edit is possible without dragging.
    - Keyboard-driven changes never animate.
- **Person panel:** clicking a node opens the person's facts with Open contact
  (link).
- **"Not on the map" tray:** collapsible. Clicking or dragging a person
  adds them to the map at the next free grid spot.
- **Save**
  - `PATCH` with `version`, submitted once.
  - A 409 shows "Someone else changed this map. Reload to see their
    changes." with **Reload**, which discards local edits after a confirm.
  - Field refusals appear in a summary that takes focus.
- **Phones:** under 768px the map is read-only, with pan and zoom, and a
  **People** list view (people with their facts, then relationships as
  "A reports to B"). A note says "Edit maps on a larger screen."

### 2.3 `/canvas` gallery

- Your maps across the records you can open, with search, the record name, the
  number of people and the last edit.
- Show more on the cursor.
- Each row links to the editor.
- Empty, loading and error states.

### 2.4 House rules and tests

- `revenact-design` §4:
  - tokens only, both themes, Lucide icons;
  - 44px targets (the node ⋯ menu, not the drag handles);
  - type sizes 11/13/15/22, numbers in DM Mono;
  - no card inside a card, and no colour-only meaning (sentiment and
    warning carry an icon and words);
  - sentence case, and no em dashes in UI copy.
- Tests:
  - unit, page and house-rules tests;
  - one e2e-style journey: new map from people, add a relationship, save, a
    second editor's save gets 409 and reloads, and a hidden person stays
    nameless.

## 3. Out of scope

Real-time co-editing, automatic relationship detection, exporting a map as an
image, maps spanning several organisations, and custom relationship labels.

## 4. API contract (binding for both plans)

```ts
type RelationshipLabel = 'Reports to' | 'Introduced by' | 'Blocks' | 'Influences' | '';
type PersonRef = { id: number; name: string };
type RecordRef = { kind: 'organization' | 'account'; id: number; name: string };

type CanvasNode = { id: string; position: { x: number; y: number }; data: { contact_id: number } };
type CanvasEdge = { id: string; source: string; target: string; label: RelationshipLabel };

type MapPerson = {
  name: string; role: string;
  sentiment: string | null; sentiment_label: string | null;
  last_contacted_at: string | null;
  latest_survey: { type: 'nps' | 'csat' | 'ces'; score: number; answered_at: string } | null;
  campaigns_unsubscribed: boolean;
};

type CanvasRow = {
  id: number; name: string; record: RecordRef; people: number;   // node count
  updated_at: string; updated_by: PersonRef | null;
};

type Canvas = CanvasRow & {
  version: number;
  nodes: CanvasNode[]; edges: CanvasEdge[];
  people_by_contact: Record<string, MapPerson>;   // keyed by contact id (string)
  hidden: string[];        // node ids whose contact the reader can't open
  removed: string[];       // node ids whose contact no longer exists
  not_on_map: { id: number; name: string; role: string }[];
  open_plans: PlanRow[];   // Plans' row payload
  can_delete: boolean;
  created_by: PersonRef | null;
};
```

| Method & path | Request | Response |
|---|---|---|
| `GET canvases/` | `q`, `cursor` | `{results: CanvasRow[], next: string \| null}` |
| `POST canvases/` | `{name, customer?: id, account?: id, start: 'people' \| 'blank'}` (exactly one of customer/account) | 201 `Canvas` |
| `GET canvases/:id/` | | `Canvas` |
| `PATCH canvases/:id/` | `{name?, nodes?, edges?, version}` | `Canvas`; 409 `{code: 'CANVAS_CHANGED', detail}` |
| `DELETE canvases/:id/` | | 204; 403 `{detail: "Only the map's creator or their managers can delete it."}` |
| `GET customers/:id/canvases/`, `GET customers/:id/accounts/:aid/canvases/` | | `{results: CanvasRow[]}` |

Refusals: 400 `{field: [message]}` (`nodes`/`edges` messages as in §1.1;
`non_field_errors` when no field); 404 for maps on records the reader can't
open.

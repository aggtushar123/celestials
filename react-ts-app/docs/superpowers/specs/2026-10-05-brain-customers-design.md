# Brain, delivery 4: What customers are saying

Delivery 4, the last of the Brain rethink agreed with the owner on
2026-10-05 (see `2026-10-05-brain-what-changed-design.md` for the
decisions and scopes). Builds on deliveries 1–3.

The fourth question: **what are the customers in my scope asking for,
complaining about, scoring us, and feeling?**

## 0. What exists

- **Feature Requests** (`services/requests`): `FeatureRequest`
  (`title`, `summary`, `status` open/planned/shipped/declined, `owner`)
  and `RequestEvidence` (one filing per email/ticket/call, on one
  customer or account). The list (`/requests/`) is already per reader
  (`readable_q`, `visible_evidence`); rows are
  `{id, title, summary, status, owner, arr, companies, interactions,
  last_90_days, previous_90_days, …}`, ranked by ARR. Curation (status,
  merge, move, dismiss) is `view_all_accounts`. Page
  `/brain/requests`.
- **Anomalies** (`services/anomalies`): same shape (`status`
  live/acknowledged/resolved); titles and summaries are replaced for
  readers without `view_all_accounts` (`title_for`, `summary_for`).
  Detection and curation are `view_all_accounts`. Page
  `/brain/anomalies`.
- **Survey scores**: rolling 90-day `nps_score`, `csat_score` on
  `Customer` and `Account`, `ces_percentage` on `Customer` only.
  `services/surveys/scores.py` computes a figure over a list of scores
  (`figure(survey_type, scores)`). Answers and comments are on
  `surveys.SurveyInvite` (`score`, `comment`, answered time, the
  record); who may read a send is `surveys.access.readable_sends`.
- **Contact sentiment**: `Contact.sentiment` positive/neutral/negative,
  `sentiment_source` manual/computed, `sentiment_computed_at`. No record
  of the previous value.
- **Knowledge graph** (`services/metrics/graph.py` `build_graph`): owner,
  customer, product, initiative and proposal nodes, capped at 200
  customers by ARR, built as `SystemActor`. `/metrics/graph/` is
  `view_all_accounts`. Page `/brain/graph`, out of the sidebar since
  delivery 1.

## Decisions (made for this spec; for the owner's review)

1. One page with four sections, each for the scope's book: **Asks**
   (feature requests), **Anomalies**, **Scores**, **Sentiment**.
2. Asks and Anomalies show the top 5 here, ranked by the ARR **in the
   scope**, with **See all**, which opens the existing full page with the
   same scope. Curation stays on the full pages, for `view_all_accounts`.
3. **Scores**: NPS, CSAT and CES for the scope over the last 90 days,
   against the 90 days before, computed from the answers themselves
   (not by averaging each record's rolled-up score), plus the 5 latest
   comments the reader may read.
4. **Sentiment** keeps its previous value from now on, so the page can
   show **who turned negative** in the last 30 days, and the count of
   negative contacts in the scope. Before the first change after this
   ships, the section shows the negative contacts with "since we started
   tracking changes".
5. The **Knowledge graph** takes the scope too and opens to everyone.
   It is linked from What changed (a driver's product or owner) and from
   here ("See on the graph"). It stays out of the sidebar.
6. Feature Requests and Anomalies leave the sidebar. After this delivery
   the Brain group is the four questions.

## 1. Backend

### 1.1 Models

- `Contact.previous_sentiment` (CharField, choices as `sentiment`,
  blank) and `Contact.sentiment_changed_at` (DateTimeField, null). Set
  wherever `sentiment` changes value (computed recompute and manual
  edit), never on a recompute that leaves it the same.

### 1.2 Scope on the existing lists

- `/requests/` and `/anomalies/` (list and detail) accept `?scope=`
  (resolved through `brain.scope.resolve`). With a scope, evidence is
  narrowed to records in the scope's book before ARR, companies and
  counts are worked out; a request or anomaly with no evidence left is
  dropped. Without `scope` they behave exactly as today. Title gating
  is unchanged.

### 1.3 Collecting the section data (`services/brain/customers.py`)

`build(reader, scope, today) -> {asks, anomalies, scores, sentiment}`.

- **asks** / **anomalies**: the top 5 rows of the scoped lists above,
  plus `total`.
- **scores**: for `nps`, `csat`, `ces`: answered `SurveyInvite`s on
  records in the scope's book, from sends in `readable_sends(reader)`,
  answered in the last 90 days and in the 90 before; `figure()` over
  each window; `responses` counts. CES counts customers' answers only
  (accounts don't carry CES).
- **comments**: the 5 latest non-empty comments from those answers, with
  the score, the record (only if the reader can open it) and the date.
  Comments on records the reader can't open are left out and counted in
  `hidden`.
- **sentiment**: contacts on records in the scope's book that the reader
  can open: `negative` count, and the up to 10 contacts whose
  `sentiment_changed_at` is in the last 30 days and whose sentiment is
  now negative, newest first, with their previous value.
- No joins plus DISTINCT.

### 1.4 Scoped graph

- `build_graph(organisation, actor=None)`: with an actor, customers come
  from `forecast.filtered_customers(actor, {})`; the 200 cap stays.
- `GET /brain/graph/?scope=` for any member, through the resolver.
  Initiative and proposal nodes are those of the scope (deliveries 2 and
  3 rules). `/metrics/graph/` is unchanged.

### 1.5 API (`/api/v1/brain/`)

- `GET customers/?scope=`
- `GET graph/?scope=`
- `?scope=` on `/requests/`, `/requests/<id>/`, `/anomalies/`,
  `/anomalies/<id>/`

### 1.6 Audit, docs

- No new audit events (reads only; the sentiment fields change with the
  existing contact audit).
- Docs: API_CONTRACTS, schema (`Contact.previous_sentiment`,
  `sentiment_changed_at`), PRD, TRD.

## 2. Frontend

### 2.1 What customers are saying (`/brain/customers`, `src/pages/brain/Customers.tsx`)

- Header: `h1` "What customers are saying", the scope switch, section
  links (Asks · Anomalies · Scores · Sentiment).
- **Asks**: top 5 requests: title, status, ARR behind it in this scope,
  companies, the 90-day trend ("12 asks, up from 7"). **See all** →
  `/brain/requests?scope=`.
- **Anomalies**: top 5 the same way (gated titles as today). **See all**
  → `/brain/anomalies?scope=`.
- **Scores**: three figures (NPS, CSAT %, CES %) with the change against
  the 90 days before and the response counts; "Not enough answers" under
  5 responses. Below, the latest comments: score, text, record (linked),
  date. "N more comments on records you can't open".
- **Sentiment**: "N contacts negative" and the list of who turned
  negative in the last 30 days: name (linked), record, "was neutral",
  when. "See on the graph" in the header links to `/brain/graph?scope=`.
- Empty states per section; skeleton, error with Retry, 375px, house
  rules.

### 2.2 Existing pages

- `/brain/requests` and `/brain/anomalies` read `?scope=` and show the
  scope switch; curation controls unchanged.
- `/brain/graph` reads `?scope=`, shows the switch, and is open to every
  member.

### 2.3 Sidebar

- **What customers are saying** (`/brain/customers`, icon
  `MessagesSquare`). Feature Requests and Anomalies leave the sidebar.
  The Brain group is now: What changed · Waiting on you · What's being
  done · What customers are saying.

### 2.4 Tests

- Each section in each scope, scores against the previous window and the
  under-5 rule, comment gating and hidden count, turned-negative list and
  the "since we started tracking" state, See all carrying the scope, the
  graph scoped and open to a member, house rules, a contract stub and an
  e2e: a CSM sees only their book's asks and scores, their manager sees
  the team's.

## 3. API contract

### `GET customers/?scope=`

```json
{
  "scope": "me",
  "currency": "USD",
  "asks": {"total": 7, "top": [
    {"id": 2, "title": "SSO with Okta", "status": "planned", "arr": 182000,
     "companies": 3, "last_90_days": 12, "previous_90_days": 7}]},
  "anomalies": {"total": 1, "top": [
    {"id": 4, "title": "Similar reports across 2 of your companies",
     "status": "live", "arr": 90000, "companies": 2,
     "last_seen_at": "2026-10-04T10:00:00Z"}]},
  "scores": {
    "nps": {"now": 18, "then": 25, "responses": 22, "previous_responses": 19},
    "csat": {"now": 82.5, "then": 80.0, "responses": 40, "previous_responses": 31},
    "ces": {"now": null, "then": null, "responses": 3, "previous_responses": 0},
    "comments": [
      {"survey_type": "nps", "score": 4, "comment": "Support is slow lately.",
       "record": {"type": "customer", "id": 3, "name": "Uber"},
       "answered_at": "2026-10-03T08:00:00Z"}],
    "hidden": 0
  },
  "sentiment": {
    "negative": 4,
    "tracking_since": "2026-10-20",
    "turned_negative": [
      {"contact": {"id": 41, "name": "Olivia Park"},
       "record": {"type": "customer", "id": 6, "name": "Apple Inc"},
       "previous": "neutral", "changed_at": "2026-10-22T07:00:00Z"}]
  }
}
```

- A score's `now`/`then` is `null` under 5 responses in its window.
- `tracking_since` is when the first sentiment change was recorded, or
  `null` before any.

### `GET graph/?scope=`

The `/metrics/graph/` shape (`as_of`, `currency`, `nodes`, `edges`) for
the scope.

## 4. Out of scope

- Sentiment history beyond the previous value.
- Writing to requests or anomalies from this page.

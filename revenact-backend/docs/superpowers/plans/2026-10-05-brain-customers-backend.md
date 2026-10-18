# Brain delivery 4: What customers are saying (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One payload per Brain scope that answers "what are the customers in my scope asking for, complaining about, scoring us, and feeling?" (asks, anomalies, survey scores with comments, contact sentiment). Also `?scope=` on the feature-request and anomaly lists, and a scoped knowledge graph open to every member.

**Architecture:** `Contact` keeps the value its sentiment replaced (`previous_sentiment`, `sentiment_changed_at`), written by one helper, `contact_sentiment.note_change`, on the computed path and by the manual edit. `services/brain/book.py` writes a scope's book out as `id IN (subquery)` filters (the same book `ScopeActor` reads). The request and anomaly lists take an optional book filter: it narrows their evidence before revenue and counts are worked out, and naming stays by the reader's own rights. `services/brain/customers.py` builds the four sections from those lists, `SurveyInvite` answers and `Contact`. `services/metrics/graph.py` is split into parts so `services/brain/graph.py` can draw the scope's graph with the delivery 2 and 3 rules. Two new `BrainView` routes serve them: `GET customers/` and `GET graph/`.

**Tech Stack:** Django 5.2, DRF, PostgreSQL 16 (CI/prod), Django test runner with `--parallel`.

**Spec:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/react-ts-app/docs/superpowers/specs/2026-10-05-brain-customers-design.md`. This plan covers §0, Decisions, §1 and §3. §3 is the API contract shared with the frontend plan. Scope rules come from `react-ts-app/docs/superpowers/specs/2026-10-05-brain-what-changed-design.md` (delivery 1), `2026-10-05-brain-waiting-design.md` (delivery 2) and `2026-10-05-brain-doing-design.md` (delivery 3).

## Global Constraints

- Postgres 16: use `id__in` subqueries, never joins + `.distinct()`. A test checks every query `customers.build` runs for `DISTINCT`.
- Tests: `venv/bin/python manage.py test <labels> --parallel --noinput`.
- `venv/bin/ruff check .` and `venv/bin/ruff format --check .` (ruff also formats Markdown code blocks).
- `venv/bin/python manage.py makemigrations --check --dry-run` (after Task 1 it must report no changes).
- `venv/bin/python scripts/ci_shard_labels.py --check 4`.
- Never run two Django test runs at once.
- Every commit ends with exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- SOC2 markers: `# SOC2:AUTH-02` on every who-may-read rule. This delivery writes no audit rows, so there are no new `# SOC2:LOG-01` lines.
- Twice-filter: name only records the reader can open, and count the rest as `hidden`. Pass the plain reader to visibility helpers (`visible_customers`, `visible_accounts`, `visible_children_q`, `visible_tasks`, `readable_send_ids`, the lists' `visible_evidence`), never `scope.actor`. The scope only narrows, through `services/brain/book.py`.
- ARR and scores are computed only over records the reader may read: an ask's revenue counts the book's customers the reader may open, and a score counts answers on records the reader may open.
- Anomaly titles and summaries keep the existing `view_all_accounts` gate (`title_for`, `summary_for`), in a scope too.
- Query count stays constant as items grow: one test runs `customers.build` with 1 and with 6 of every kind and asserts the same number of queries.
- The migration must be safe on existing data: `Contact.previous_sentiment` blank (`default=""`), `Contact.sentiment_changed_at` null. Existing contacts read "no change recorded".
- Without `?scope=`, `/requests/` and `/anomalies/` (list and detail) behave exactly as today.
- Stay on branch `feat/brain-customers`; never push.

## Decisions (where the spec is silent)

1. **The book, written out.** `services/brain/book.py` is the scope's book as filters: Me and My team, customers owned by the desk, and accounts the desk owns or that sit under a desk customer. Company is `None` (the whole organisation, no filter). It is the same set `visible_customers(scope.actor)` / `visible_accounts(scope.actor)` return; a test checks they match. It is written out, as `doing.plans_in` is, so no list needs `scope.actor` to narrow.
2. **ARR in a scope.** Revenue counts the companies behind the evidence that are in the scope's book and that the reader may open. An account's ask counts its parent organisations only when they are in the book. Carl's Taco East ask is in his Me (he owns the account), but it adds no ARR there, because Taco Bell is Dana's. Company is unchanged.
3. **Asks and anomalies on the page** are the top 5 rows of the scoped lists, in the lists' own order (most ARR, then most interactions, then title), all statuses. `total` is the scoped list's length, so **See all** shows the same rows.
4. **Score windows** are day-aligned: "now" is answers since the start of `today − 90` days; "then" is the 90 days before that. `MIN_RESPONSES = 5` applies to each window on its own. NPS is an integer (`whole_figure`), CSAT and CES are floats to two decimals (`figure`). These are the same rules the records' own scores use.
5. **CES** counts answers on organisations only (`SurveyInvite.customer` set). An account contact's CES answer is left out, since accounts carry no CES.
6. **Comments** are the 5 newest non-empty comments from the "now" window, on records the reader may open. `hidden` counts the non-empty comments in that window, on the scope's book, from sends the reader may read, that sit on records the reader can't open. Old-window comments are neither shown nor counted.
7. **Turned negative.** A contact turned negative when their sentiment is now `negative` and `sentiment_changed_at` is on or after the start of `today − 30` days. List newest first, then id, at most 10, with `previous` = `previous_sentiment`. A contact who turned negative and then back is not listed.
8. **`tracking_since`** is the local date of the earliest `sentiment_changed_at` among contacts the reader may open anywhere in the organisation, whatever the scope. It answers "has tracking started?" and never dates a change the reader couldn't see. `null` before any.
9. **What counts as a sentiment change.** The computed recompute and the contact PATCH (`ContactSerializer.update`) both go through `note_change`. Creating a contact is not a change. The Django admin is an operator tool and does not record changes. The two new fields are not served on `/contacts/`.
10. **`?scope=` on the lists.** An empty `?scope=` is the same as none. A PATCH on `/requests/<id>/` or `/anomalies/<id>/` always answers with the unscoped detail, so a curator never gets a 404 for a write that succeeded.
11. **The scoped graph.**
    - Customers are the scope's live customers (`forecast.filtered_customers(scope.actor, {})`) that the reader may open, capped at 200 by ARR. Their figures are counted as the reader, as `brain/exposure.py` does.
    - `open_tasks` counts only tasks the reader may read (`visible_tasks`).
    - Initiative nodes are the scope's open ones (`doing.initiatives_in` ∩ planned/active). `member_label` and the `targets` edge appear only where delivery 3 shows the cut (`doing.figures_shown`).
    - Proposal nodes are the scope's readable waiting proposals (`desk.proposals(...).readable`). The session title follows delivery 2's whole-conversation rule (`NEUTRAL_TITLE` otherwise).
12. **No new index.** The turned-negative query first narrows contacts to the book.

## Contract notes (real code that forces a §3 / §1 detail)

1. **`arr` types.** On `customers/`, `asks.top[].arr` and `anomalies.top[].arr` are numbers, as §3 shows. `/requests/` and `/anomalies/` keep serving `arr` as a string, unchanged.
2. **ARR is not FX-converted.** The lists sum each customer's ARR column (the workspace's `arr` global-attribute mapping) as stored, without FX conversion, and so does `customers/`, so **See all** shows the same figure. `currency` at the top is the workspace's. Converting these lists is out of this delivery.
3. **Comment `record`** uses `{"type", "id", "name"}` as §3 says. `/surveys/<id>/answers/` keeps its own `kind` key.
4. **`readable_sends` uses DISTINCT** (a join through `shared_with`). Scores filter by a new `surveys.access.readable_send_ids(user)`, the same rule as `id IN` subqueries with no DISTINCT. `readable_sends` is unchanged.
5. **No contact-edit audit event exists today** (`ContactDetailView.perform_update` only audits a re-subscribe). As §1.6 says, there are no new events, so sentiment changes stay unaudited, exactly as before.
6. **`build_graph(organisation, actor=None)` (spec §1.4) is not the seam.** A single actor can't carry the twice-filter: customers named only if the reader may open them, scoped initiatives and proposals, a gated session title. So `services/metrics/graph.py` is split into `customer_part`, `initiative_part`, `proposal_part` and `payload`. `build_graph(organisation)` composes them exactly as today, and `services/brain/graph.py` composes them for a scope. `/metrics/graph/` output is unchanged.
7. **`GET graph/` adds `hidden`**: the scope's live customers the reader can't open. It is non-zero only in Company for a reader without `view_all_accounts`. This is additive; nothing in the `/metrics/graph/` shape is removed or renamed.
8. **`anomalies.top[].last_seen_at`** is the anomaly's `last_seen_at`, rendered by DRF as ISO 8601 (`"2026-10-04T10:00:00Z"`).

## File Structure

| File | Responsibility |
| --- | --- |
| `services/customers/models.py` (modify) | `Contact.previous_sentiment`, `Contact.sentiment_changed_at` |
| `services/customers/migrations/0054_contact_sentiment_change.py` (create, generated) | AddField ×2, blank / null |
| `services/customers/contact_sentiment.py` (modify) | `note_change()`; `recompute` uses it |
| `services/customers/serializers.py` (modify) | `ContactSerializer.update` records a hand change |
| `services/brain/book.py` (create) | the scope's book as `id IN` filters: `customers`, `accounts`, `q` |
| `services/brain/http.py` (create) | `ScopeRefusals` mixin and `optional_scope(request)`, shared with the lists |
| `services/brain/views.py` (modify) | `BrainView` uses `ScopeRefusals`; `CustomersView`, `GraphView` |
| `services/brain/urls.py` (modify) | `customers/`, `graph/` |
| `services/requests/gather.py` (modify) | `visible_evidence(..., book=)`, `Companies(..., within=)` |
| `services/requests/views.py` (modify) | `rows_for`, `detail_for`; `?scope=` |
| `services/anomalies/views.py` (modify) | `visible_evidence(..., book=)`, `Companies(..., within=)`, `rows_for`, `detail_for`; `?scope=` |
| `services/surveys/access.py` (modify) | `readable_send_ids(user)` |
| `services/brain/customers.py` (create) | `asks`, `anomalies`, `scores`, `sentiment`, `build` |
| `services/metrics/graph.py` (modify) | split into parts; `build_graph(organisation)` unchanged |
| `services/brain/graph.py` (create) | `build(reader, scope, today)` |
| `services/brain/tests/customers_fixtures.py` (create) | `CustomersFixture`: request/anomaly/survey/contact makers |
| `services/customers/tests/test_contact_sentiment_change.py` (create) | Task 1 |
| `services/brain/tests/test_book.py`, `services/requests/tests/test_scope.py` (create) | Task 2 |
| `services/anomalies/tests/test_scope.py` (create) | Task 3 |
| `services/surveys/tests/test_readable_send_ids.py`, `services/brain/tests/test_customers.py` (create) | Task 4 (Task 5 adds to `test_customers.py`) |
| `services/brain/tests/test_api_customers.py` (create) | Task 5 |
| `services/brain/tests/test_graph.py` (create) | Task 6 |
| `services/brain/tests/test_customers_e2e.py` (create) | Task 7 |
| `docs/API_CONTRACTS.md`, `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `docs/data-classification.md` (modify) | Task 7 |

The fixture world is `services/brain/tests/fixtures.py` `BrainFixture`:
- **People.** Alice is admin, with `view_all_accounts`. Lee has the Leadership function and no `view_all_accounts`, so in Company he can open only Loose Ltd. Mona manages Carl. Dana manages nobody. Gus is in another tenant.
- **Customers.** Pizza Hut (Carl, 300k), Dough Co (Carl, 100k), Soup Co (Mona, 50k), Taco Bell (Dana, 200k), Loose Ltd (nobody, 80k).
- **Accounts.** Pizza EMEA (Carl, under Pizza Hut), Taco East (Carl, under Taco Bell), Taco West (Dana, under Taco Bell).
- **Visibility without a scope.** Carl can open Pizza Hut, Dough Co, Taco Bell (through Taco East) and Loose Ltd, but not Soup Co.

---

### Task 1: Contacts keep their previous sentiment

**Files:**
- Modify: `services/customers/models.py` (`Contact`, after `sentiment_computed_at`)
- Create: `services/customers/migrations/0054_contact_sentiment_change.py` (generated)
- Modify: `services/customers/contact_sentiment.py` (`note_change`, `recompute`)
- Modify: `services/customers/serializers.py` (`ContactSerializer.update`)
- Test: `services/customers/tests/test_contact_sentiment_change.py`

**Interfaces:**
- Consumes: `services.customers.tests.test_contact_sentiment.Fixture` (Carl; Pizza Hut; account Pizza Hut UK; Sam on Pizza Hut, neutral; Uma on Pizza Hut UK, positive; `self.call(sentiment, days_ago=1, participants=())`).
- Produces:
  - `Contact.previous_sentiment` (`""` or a `Contact.Sentiment` value), `Contact.sentiment_changed_at` (aware datetime or `None`).
  - `services.customers.contact_sentiment.note_change(contact, value, now) -> list[str]`: sets `contact.sentiment = value`, and only when the value differs, `previous_sentiment` and `sentiment_changed_at`. Returns the fields to save.

- [ ] **Step 1: Write the failing tests**

`services/customers/tests/test_contact_sentiment_change.py`:

```python
"""A contact keeps the sentiment it replaced, and when (Brain delivery 4
spec §1.1): set wherever `sentiment` changes value, by a recompute or by
hand, and never on a recompute that leaves it the same."""

from django.utils import timezone

from services.customers import contact_sentiment
from services.customers.models import Contact
from services.customers.tests.test_contact_sentiment import Fixture


class SentimentChangeTests(Fixture):
    def kept(self, contact):
        contact.refresh_from_db()
        return contact.previous_sentiment, contact.sentiment_changed_at

    def test_a_recompute_that_changes_the_value_keeps_the_old_one(self):
        self.call("negative", participants=[self.sam])
        before = timezone.now()
        self.assertEqual(contact_sentiment.recompute(self.sam), "negative")
        previous, changed_at = self.kept(self.sam)
        self.assertEqual(previous, "neutral")
        self.assertGreaterEqual(changed_at, before)

    def test_a_recompute_that_leaves_it_the_same_records_nothing(self):
        self.call("neutral", participants=[self.sam])
        self.assertEqual(contact_sentiment.recompute(self.sam), "neutral")
        self.assertEqual(self.kept(self.sam), ("", None))

    def test_the_latest_change_wins_and_a_steady_recompute_keeps_its_time(self):
        self.call("negative", participants=[self.sam])
        contact_sentiment.recompute(self.sam)
        for _ in range(3):
            self.call("positive", participants=[self.sam])
        self.assertEqual(contact_sentiment.recompute(self.sam), "positive")
        previous, changed_at = self.kept(self.sam)
        self.assertEqual(previous, "negative")
        contact_sentiment.recompute(self.sam)
        self.assertEqual(self.kept(self.sam), ("negative", changed_at))

    def test_note_change_returns_only_what_to_save(self):
        now = timezone.now()
        self.assertEqual(contact_sentiment.note_change(self.sam, "neutral", now), ["sentiment"])
        self.assertEqual(self.sam.previous_sentiment, "")
        self.assertEqual(
            contact_sentiment.note_change(self.sam, "negative", now),
            ["sentiment", "previous_sentiment", "sentiment_changed_at"],
        )
        self.assertEqual(
            (self.sam.sentiment, self.sam.previous_sentiment, self.sam.sentiment_changed_at),
            ("negative", "neutral", now),
        )

    def test_a_hand_edit_that_changes_it_is_kept(self):
        self.client.force_authenticate(self.carl)
        response = self.client.patch(
            f"/api/v1/contacts/{self.uma.id}/", {"sentiment": "negative"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        previous, changed_at = self.kept(self.uma)
        self.assertEqual(previous, "positive")
        self.assertIsNotNone(changed_at)
        self.assertNotIn("previous_sentiment", response.data)

    def test_a_hand_edit_to_the_same_value_or_another_field_records_nothing(self):
        self.client.force_authenticate(self.carl)
        path = f"/api/v1/contacts/{self.uma.id}/"
        self.client.patch(path, {"sentiment": "positive"}, format="json")
        self.client.patch(path, {"name": "Uma H."}, format="json")
        self.assertEqual(self.kept(self.uma), ("", None))

    def test_a_new_contact_has_no_change(self):
        fresh = Contact.objects.create(
            customer=self.pizza, name="Nia New", email="nia@pizzahut.com", sentiment="negative"
        )
        self.assertEqual(self.kept(fresh), ("", None))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_contact_sentiment_change --parallel --noinput`
Expected: errors, `AttributeError: 'Contact' object has no attribute 'previous_sentiment'` / `module ... has no attribute 'note_change'`.

- [ ] **Step 3: Add the fields and generate the migration**

In `services/customers/models.py`, directly after `sentiment_computed_at = models.DateTimeField(null=True, blank=True)` in `Contact`:

```python
    #: The value `sentiment` held before its last change, and when it
    #: changed (`contact_sentiment.note_change`, from a recompute or a hand
    #: edit). Blank / null until the first change after Brain delivery 4:
    #: the Brain's "turned negative" list reads them.
    previous_sentiment = models.CharField(
        max_length=16, choices=Sentiment.choices, blank=True, default=""
    )
    sentiment_changed_at = models.DateTimeField(null=True, blank=True)
```

Run: `venv/bin/python manage.py makemigrations customers --name contact_sentiment_change`
Expected: `services/customers/migrations/0054_contact_sentiment_change.py` with two `AddField` operations. `previous_sentiment` has `default=""` and `blank=True`, and `sentiment_changed_at` has `null=True`. Existing rows read `""` / `NULL`.

- [ ] **Step 4: Write `note_change` and use it in `recompute`**

In `services/customers/contact_sentiment.py`, add above `def recompute`:

```python
def note_change(contact, value, now):
    """Set `contact.sentiment` to `value`. Only when that is a change, keep
    the value it replaces and when (`previous_sentiment`,
    `sentiment_changed_at`). Returns the fields to save. The one place a
    sentiment change is recorded: `recompute` and the contact edit both
    come here."""
    if value == contact.sentiment:
        contact.sentiment = value
        return ["sentiment"]
    contact.previous_sentiment = contact.sentiment
    contact.sentiment_changed_at = now
    contact.sentiment = value
    return ["sentiment", "previous_sentiment", "sentiment_changed_at"]
```

In `recompute`, replace the tail from `counts = tally(rows)` to the end of the function with:

```python
    counts = tally(rows)
    update += note_change(contact, label, now)
    contact.sentiment_source = Contact.SentimentSource.COMPUTED
    contact.sentiment_evidence = {
        "score": round(value, 3),
        **counts,
        "latest_at": latest.isoformat() if latest else None,
    }
    contact.sentiment_computed_at = now
    contact.save(
        update_fields=[
            *update,
            "sentiment_source",
            "sentiment_evidence",
            "sentiment_computed_at",
        ]
    )
    return label
```

- [ ] **Step 5: Record a hand change in the serializer**

In `services/customers/serializers.py`, `ContactSerializer.update`, replace the `if "sentiment" in validated_data:` block with:

```python
        if "sentiment" in validated_data:
            validated_data["sentiment_source"] = Contact.SentimentSource.MANUAL
            validated_data["sentiment_evidence"] = {}
            validated_data["sentiment_computed_at"] = None
            if validated_data["sentiment"] != instance.sentiment:
                # The Brain's "turned negative" reads the value it replaces
                # (contact_sentiment.note_change is the computed path's twin).
                validated_data["previous_sentiment"] = instance.sentiment
                validated_data["sentiment_changed_at"] = timezone.now()
```

(`timezone` is already imported at the top of the file.)

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_contact_sentiment_change services.customers.tests.test_contact_sentiment services.customers.tests.test_contact --parallel --noinput`
Expected: all PASS.

Run: `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/customers/models.py services/customers/migrations/0054_contact_sentiment_change.py \
  services/customers/contact_sentiment.py services/customers/serializers.py \
  services/customers/tests/test_contact_sentiment_change.py
git commit -m "$(cat <<'EOF'
feat(customers): contacts keep the sentiment they replaced and when

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The scope's book, and `?scope=` on feature requests

**Files:**
- Create: `services/brain/book.py`
- Create: `services/brain/http.py`
- Modify: `services/brain/views.py` (`BrainView` uses `ScopeRefusals`)
- Modify: `services/requests/gather.py` (`visible_evidence`, `Companies`)
- Modify: `services/requests/views.py` (`rows_for`, `detail_for`, list and detail views)
- Create: `services/brain/tests/customers_fixtures.py`
- Test: `services/brain/tests/test_book.py`, `services/requests/tests/test_scope.py`

**Interfaces:**
- Consumes: `services.brain.scope.resolve(reader, key) -> Scope` (`key`, `is_company`, `owner_ids`, `user`, `actor`), `ScopeUnknown` (`code`, `detail`), `ScopeNotAllowed`; Task 1's `Contact.previous_sentiment` / `sentiment_changed_at` (the fixture's `turned`).
- Produces:
  - `services.brain.book.customers(scope) -> QuerySet[values("id")] | None` (`None` for Company or `scope is None`)
  - `services.brain.book.accounts(scope) -> QuerySet[values("id")] | None`
  - `services.brain.book.q(scope, *, customer="customer_id", account="account_id") -> Q | None`
  - `services.brain.http.ScopeRefusals` (mixin: 400 `SCOPE_UNKNOWN`, 403 `SCOPE_NOT_ALLOWED`), `services.brain.http.optional_scope(request) -> Scope | None`
  - `services.requests.gather.visible_evidence(organisation, viewer, *, request=None, book=None)`, `Companies(rows, organisation, viewer, *, within=None)`
  - `services.requests.views.rows_for(reader, *, status=None, scope=None) -> list[dict]` (the list rows, `arr` a string)
  - `services.requests.views.detail_for(reader, feature, *, scope=None) -> dict | None`
  - `services.brain.tests.customers_fixtures.CustomersFixture` with `feature(title, *records, status="open")`, `ask(feature, record, *, days_ago=1, kind="call", **fields)`, `anomaly(title, *records, status="live")`, `report(anomaly, record, *, kind="call", **fields)`, `send(survey_type="nps", *, owner=None, sharing="workspace")`, `answer(send, record, score, *, days_ago=1, comment="")`, `answers(send, record, scores, *, days_ago=1)`, `contact(record, name, sentiment="neutral", **fields)`, `turned(contact, was, *, days_ago=1)`, `reader_and_scope(user, key)`

- [ ] **Step 1: Write the fixture**

`services/brain/tests/customers_fixtures.py`:

```python
"""What customers are saying: BrainFixture's people and book, plus makers
for feature requests and their asks, anomalies and their reports, survey
sends and answers, and contacts.

Carl (CSM) owns Pizza Hut, Dough Co, Pizza EMEA and Taco East (under Dana's
Taco Bell) and reports to Mona, who owns Soup Co. Dana owns Taco Bell and
Taco West. Loose Ltd is nobody's. Alice sees everything; Lee reads Company
through Leadership only, so the only customer he can open is Loose Ltd."""

from datetime import timedelta
from itertools import count

from django.utils import timezone

from services.accounts.models import User
from services.anomalies.models import Anomaly, AnomalyEvidence
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Account, Contact
from services.requests.models import FeatureRequest, RequestEvidence
from services.surveys.models import LINK_DAYS, SurveyInvite, SurveySend
from services.surveys.tokens import new_token

#: Source record ids: a filing is unique per (kind, record_id).
_ids = count(1)


def parent(record):
    return {"account": record} if isinstance(record, Account) else {"customer": record}


class CustomersFixture(BrainFixture):
    def reader_and_scope(self, user, key):
        """A fresh reader (no memoised org chart) and their scope."""
        reader = User.objects.get(pk=user.pk)
        return reader, resolve(reader, key)

    def feature(self, title, *records, status="open"):
        made = FeatureRequest.objects.create(
            organisation=self.org, title=title, summary="", status=status
        )
        for record in records:
            self.ask(made, record)
        return made

    def ask(self, feature, record, *, days_ago=1, kind="call", **fields):
        return RequestEvidence.objects.create(
            request=feature,
            organisation=self.org,
            kind=kind,
            record_id=next(_ids),
            snippet="We need this.",
            occurred_at=timezone.now() - timedelta(days=days_ago),
            **parent(record),
            **fields,
        )

    def anomaly(self, title, *records, status="live"):
        now = timezone.now()
        made = Anomaly.objects.create(
            organisation=self.org,
            title=title,
            summary="What the model wrote.",
            status=status,
            first_seen_at=now - timedelta(days=3),
            last_seen_at=now,
        )
        for record in records:
            self.report(made, record)
        return made

    def report(self, anomaly, record, *, kind="call", **fields):
        return AnomalyEvidence.objects.create(
            anomaly=anomaly,
            organisation=self.org,
            kind=kind,
            record_id=next(_ids),
            snippet="It broke.",
            occurred_at=timezone.now() - timedelta(days=1),
            **parent(record),
            **fields,
        )

    def send(self, survey_type="nps", *, owner=None, sharing="workspace"):
        return SurveySend.objects.create(
            organisation=self.org,
            owner=owner or self.admin,
            name="Pulse",
            survey_type=survey_type,
            subject="A quick question",
            status="sent",
            sharing=sharing,
        )

    def answer(self, send, record, score, *, days_ago=1, comment=""):
        now = timezone.now()
        return SurveyInvite.objects.create(
            send=send,
            email=f"person{next(_ids)}@example.com",
            token_hash=new_token()[1],
            expires_at=now + timedelta(days=LINK_DAYS),
            status="answered",
            score=score,
            comment=comment,
            answered_at=now - timedelta(days=days_ago),
            **parent(record),
        )

    def answers(self, send, record, scores, *, days_ago=1):
        return [self.answer(send, record, score, days_ago=days_ago) for score in scores]

    def contact(self, record, name, sentiment="neutral", **fields):
        return Contact.objects.create(
            name=name,
            email=f"{name.split()[0].lower()}{next(_ids)}@example.com",
            sentiment=sentiment,
            **parent(record),
            **fields,
        )

    def turned(self, contact, was, *, days_ago=1):
        """`contact` is now negative and was `was`, as of `days_ago`, set
        row by row (the change itself is Task 1's, tested there)."""
        Contact.objects.filter(pk=contact.pk).update(
            sentiment="negative",
            previous_sentiment=was,
            sentiment_changed_at=timezone.now() - timedelta(days=days_ago),
        )
```

- [ ] **Step 2: Write the failing tests**

`services/brain/tests/test_book.py`:

```python
"""A scope's book as `id IN` filters (Brain delivery 4 Decision 1): the
same customers and accounts `ScopeActor` reads, and nothing for Company."""

from services.brain import book
from services.brain.tests.customers_fixtures import CustomersFixture
from services.customers.models import Account, Customer
from services.customers.scoping import visible_accounts, visible_customers
from services.requests.models import RequestEvidence


def ids(rows):
    return set(rows.values_list("id", flat=True))


class BookTests(CustomersFixture):
    def test_me_is_the_readers_customers_and_accounts(self):
        _reader, scope = self.reader_and_scope(self.csm, "me")
        self.assertEqual(
            ids(Customer.objects.filter(id__in=book.customers(scope))),
            {self.pizza.id, self.dough.id},
        )
        self.assertEqual(
            ids(Account.objects.filter(id__in=book.accounts(scope))),
            {self.emea.id, self.east.id},
        )

    def test_the_book_is_the_one_scope_actor_reads(self):
        for user, key in ((self.csm, "me"), (self.mona, "team"), (self.mona, "me")):
            _reader, scope = self.reader_and_scope(user, key)
            with self.subTest(user=user.name, key=key):
                self.assertEqual(
                    ids(Customer.objects.filter(id__in=book.customers(scope))),
                    ids(visible_customers(scope.actor)),
                )
                self.assertEqual(
                    ids(Account.objects.filter(id__in=book.accounts(scope))),
                    ids(visible_accounts(scope.actor)),
                )

    def test_company_and_no_scope_are_the_whole_organisation(self):
        _reader, company = self.reader_and_scope(self.admin, "company")
        for scope in (company, None):
            self.assertIsNone(book.customers(scope))
            self.assertIsNone(book.accounts(scope))
            self.assertIsNone(book.q(scope))

    def test_the_filter_carries_no_distinct(self):
        _reader, scope = self.reader_and_scope(self.mona, "team")
        sql = str(RequestEvidence.objects.filter(book.q(scope)).query)
        self.assertNotIn("DISTINCT", sql.upper())
```

`services/requests/tests/test_scope.py`:

```python
"""?scope= on the feature-request list and detail (Brain delivery 4 spec
§1.2): the scope's book narrows the evidence before revenue and counts are
worked out; without it the routes behave exactly as before."""

from services.brain.tests.customers_fixtures import CustomersFixture

LIST = "/api/v1/requests/"


class RequestScopeTests(CustomersFixture):
    def setUp(self):
        self.sso = self.feature(
            "SSO with Okta", self.pizza, self.taco, self.east, self.soup, self.loose
        )
        self.export = self.feature("CSV export", self.taco)
        self.api = self.feature("Public API", self.dough)
        self.ask(self.api, self.dough, days_ago=120)

    def rows(self, user, query=""):
        response = self.as_user(user).get(f"{LIST}{query}")
        self.assertEqual(response.status_code, 200, response.json())
        return {row["title"]: row for row in response.json()}

    def test_without_a_scope_the_list_is_the_readers_as_before(self):
        rows = self.rows(self.csm)
        # Carl opens Taco Bell through his Taco East, and Loose Ltd (nobody's).
        self.assertEqual(set(rows), {"SSO with Okta", "CSV export", "Public API"})
        sso = rows["SSO with Okta"]
        self.assertEqual(float(sso["arr"]), 580000.0)
        self.assertEqual((sso["companies"], sso["interactions"]), (3, 4))

    def test_me_narrows_to_the_readers_book(self):
        rows = self.rows(self.csm, "?scope=me")
        self.assertEqual(list(rows), ["SSO with Okta", "Public API"])
        sso = rows["SSO with Okta"]
        # Pizza Hut and Taco East are Carl's; Taco East's Taco Bell is Dana's,
        # so it adds no revenue in Me.
        self.assertEqual(float(sso["arr"]), 300000.0)
        self.assertEqual((sso["companies"], sso["interactions"]), (1, 2))
        api = rows["Public API"]
        self.assertEqual((api["last_90_days"], api["previous_90_days"]), (1, 1))
        self.assertIsInstance(sso["arr"], str)

    def test_my_team_is_the_managers_and_their_reports_books(self):
        sso = self.rows(self.mona, "?scope=team")["SSO with Okta"]
        self.assertEqual(float(sso["arr"]), 350000.0)
        self.assertEqual((sso["companies"], sso["interactions"]), (2, 3))

    def test_company_is_the_unscoped_list(self):
        self.assertEqual(self.rows(self.admin, "?scope=company"), self.rows(self.admin))

    def test_in_company_a_leadership_reader_still_reads_only_what_they_may_open(self):
        rows = self.rows(self.lee, "?scope=company")
        self.assertEqual(list(rows), ["SSO with Okta"])
        self.assertEqual(float(rows["SSO with Okta"]["arr"]), 80000.0)

    def test_mail_the_reader_cant_read_stays_out_in_a_scope(self):
        self.ask(self.sso, self.pizza, kind="email", mailbox_owner=self.other)
        sso = self.rows(self.csm, "?scope=me")["SSO with Okta"]
        self.assertEqual(sso["interactions"], 2)

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        response = self.as_user(self.csm).get(f"{LIST}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        )
        response = self.as_user(self.csm).get(f"{LIST}?scope=everyone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "SCOPE_UNKNOWN")

    def test_an_empty_scope_is_no_scope(self):
        self.assertEqual(self.rows(self.csm, "?scope="), self.rows(self.csm))

    def test_the_detail_is_narrowed_and_404s_when_nothing_is_left(self):
        client = self.as_user(self.csm)
        gone = client.get(f"{LIST}{self.export.id}/?scope=me")
        self.assertEqual(gone.status_code, 404)
        self.assertEqual(client.get(f"{LIST}{self.export.id}/").status_code, 200)
        detail = client.get(f"{LIST}{self.sso.id}/?scope=me").json()
        self.assertEqual(
            detail["companies_asking"],
            [{"id": self.pizza.id, "name": "Pizza Hut", "arr": "300000.00"}],
        )
        self.assertEqual(len(detail["evidence"]), 2)

    def test_a_patch_answers_with_the_unscoped_detail(self):
        response = self.as_user(self.admin).patch(
            f"{LIST}{self.export.id}/?scope=me", {"status": "planned"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(response.json()["status"], "planned")
```

- [ ] **Step 3: Run them to see them fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_book services.requests.tests.test_scope --parallel --noinput`
Expected: `ModuleNotFoundError: No module named 'services.brain.book'`, then (after Step 4) scope assertions failing.

- [ ] **Step 4: Write `book.py` and `http.py`**

`services/brain/book.py`:

```python
"""A Brain scope's book as filters (spec: react-ts-app docs/superpowers/
specs/2026-10-05-brain-customers-design.md §1.2).

Me is the reader's customers, and the accounts they own or that sit under
those customers; My team the same for the reader and everyone below them;
Company the whole organisation, which needs no filter (None). It is the
book `ScopeActor` reads (a test checks they match), written out as
`id IN (subquery)` filters, never a join made unique with DISTINCT
(Postgres 16, services.customers.scoping). So a list can be narrowed to a
scope while everything in it is still named by the reader's own rights."""

from django.db.models import Q

from services.customers.models import Account, Customer


def _whole(scope):
    return scope is None or scope.is_company


def customers(scope):
    """The book's customer ids as a subquery, or None for the whole organisation."""
    if _whole(scope):
        return None
    return Customer.objects.filter(
        organisation_id=scope.user.organisation_id, owner_id__in=sorted(scope.owner_ids)
    ).values("id")


def accounts(scope):
    """The book's account ids as a subquery, or None for the whole organisation."""
    if _whole(scope):
        return None
    links = Account.customers.through.objects
    # An account belongs to an organisation through its customers.
    ours = links.filter(customer__organisation_id=scope.user.organisation_id).values("account_id")
    under = links.filter(customer_id__in=customers(scope)).values("account_id")
    return (
        Account.objects.filter(id__in=ours)
        .filter(Q(owner_id__in=sorted(scope.owner_ids)) | Q(id__in=under))
        .values("id")
    )


def q(scope, *, customer="customer_id", account="account_id"):
    """Rows on the book's customers or accounts, for any model that hangs
    off one of them; None for the whole organisation."""
    if _whole(scope):
        return None
    return Q(**{f"{customer}__in": customers(scope)}) | Q(**{f"{account}__in": accounts(scope)})
```

`services/brain/http.py`:

```python
"""Scope handling shared by the Brain's routes and the lists that take
`?scope=` (/requests/, /anomalies/): a scope the reader may not use is
refused the same way everywhere, before anything is read."""

from rest_framework import status
from rest_framework.response import Response

from .scope import ScopeNotAllowed, ScopeUnknown, resolve


class ScopeRefusals:
    """400 `SCOPE_UNKNOWN` for a key that isn't one, 403
    `SCOPE_NOT_ALLOWED` for a scope the reader may not use."""

    def handle_exception(self, exc):
        if isinstance(exc, ScopeUnknown):
            return Response(
                {"code": exc.code, "detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST
            )
        if isinstance(exc, ScopeNotAllowed):
            return Response(
                {"code": exc.code, "detail": exc.detail}, status=status.HTTP_403_FORBIDDEN
            )
        return super().handle_exception(exc)


def optional_scope(request):
    """The reader's `?scope=`, resolved; None when the request names none
    (an empty value included), so the route behaves as it did before."""
    key = request.query_params.get("scope")
    # SOC2:AUTH-02 a named scope is resolved, and refused, before anything is read
    return resolve(request.user, key) if key else None
```

In `services/brain/views.py`:
- Add `from .http import ScopeRefusals`.
- Change the scope import to `from .scope import LABELS, ScopeNotAllowed, available, default_key, resolve`. `ScopeUnknown` is no longer used here; `ScopeNotAllowed` is still used by `InitiativeCreateView`.
- Make `BrainView` the following, which removes its own `handle_exception`:

```python
class BrainView(ScopeRefusals, views.APIView):
    permission_classes = [IsAuthenticated]

    def scope(self, request):
        # SOC2:AUTH-02 every Brain read resolves the reader's own scope
        key = request.query_params.get("scope") or default_key(request.user)
        return resolve(request.user, key)
```

- [ ] **Step 5: Narrow the requests' evidence and revenue**

In `services/requests/gather.py`, replace `visible_evidence` and the start of `Companies.__init__`:

```python
def visible_evidence(organisation, viewer, *, request=None, book=None):
    """Every evidence row this person may read, as a queryset: on an
    organisation or account they may open, and a record they may read. An
    account is its own rule: one under an organisation they may open can
    still be closed to them. `book` (services.brain.book.q) narrows to a
    Brain scope's book; the reader's rights above still decide what is read."""
    customer_ids = set(visible_customers(viewer).values_list("id", flat=True))
    # SOC2:AUTH-02 accounts by their own rule, not by their organisation's
    account_ids = set(visible_accounts(viewer).values_list("id", flat=True))
    rows = RequestEvidence.objects.filter(organisation=organisation, dismissed=False)
    if request is not None:
        rows = rows.filter(request=request)
    rows = rows.filter(Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids)).filter(
        readable_q(viewer)
    )
    if book is not None:
        rows = rows.filter(book)
    return rows.select_related("customer", "account")


class Companies:
    """The companies behind a page of evidence, resolved once for the page.

    An account's ask counts for the parent organisations the reader may
    open, and only those: another parent's revenue is not theirs to see.
    `within` (services.brain.book.customers) keeps to a Brain scope's own
    customers, so a scope's revenue is its book's."""

    def __init__(self, rows, organisation, viewer, *, within=None):
        self.field = arr_field(organisation)
        openable = visible_customers(viewer)
        if within is not None:
            # SOC2:AUTH-02 in a scope, revenue counts the book's customers the reader may open
            openable = openable.filter(id__in=within)
        visible = {c.id: c for c in openable}
```

The rest of `Companies.__init__` (from `self.customers = {` on) is unchanged.

In `services/requests/views.py`, add the imports:

```python
from services.brain import book as brain_book
from services.brain.http import ScopeRefusals, optional_scope
```

Add these two functions after `_org_requests`:

```python
def rows_for(reader, *, status=None, scope=None):
    """The list's rows as `reader` reads them, most revenue first. With a
    Brain scope, evidence is narrowed to the scope's book before revenue
    and counts are worked out, and a request with none left is dropped."""
    organisation = reader.organisation
    features = FeatureRequest.objects.filter(organisation=organisation).select_related("owner")
    if status:
        features = features.filter(status=status)
    evidence = list(visible_evidence(organisation, reader, book=brain_book.q(scope)))
    companies = Companies(evidence, organisation, reader, within=brain_book.customers(scope))
    by_request = {}
    for row in evidence:
        by_request.setdefault(row.request_id, []).append(row)
    out = [
        request_row(feature, summarise(by_request[feature.id], companies))
        for feature in features
        if feature.id in by_request
    ]
    out.sort(key=lambda r: (-float(r["arr"]), -r["interactions"], r["title"]))
    return out


def detail_for(reader, feature, *, scope=None):
    """The detail body as `reader` reads it, or None when they have no
    evidence for it (in the scope, with one)."""
    organisation = reader.organisation
    rows = list(visible_evidence(organisation, reader, request=feature, book=brain_book.q(scope)))
    if not rows:
        return None
    companies = Companies(rows, organisation, reader, within=brain_book.customers(scope))
    summary = summarise(rows, companies)
    asking = sorted(
        (
            {"id": c.id, "name": c.name, "arr": str(companies.arr_of(c))}
            for c in summary["customers"].values()
        ),
        key=lambda c: -float(c["arr"]),
    )
    return {
        **request_row(feature, summary),
        # `companies` stays the count from request_row; the list is
        # its own field so one name never means two shapes.
        "companies_asking": asking,
        "evidence": [evidence_row(r) for r in rows],
    }
```

Replace `FeatureRequestListView` and the `get` of `FeatureRequestDetailView`, and the last line of its `patch`:

```python
class FeatureRequestListView(ScopeRefusals, APIView):
    """GET /api/v1/requests/?status=&scope= — every request the reader has
    evidence for, with the revenue and counts computed over the companies
    they may open, most revenue first. `?scope=me|team|company` narrows the
    evidence to that Brain scope's book first; without it, as before.

    A request whose evidence is all outside their book is left out entirely
    rather than shown with a zero: its title and summary were written from
    records they may not read."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = optional_scope(request)
        wanted = request.query_params.get("status")
        if wanted and wanted not in FeatureRequest.Status.values:
            return Response({"detail": f"Unknown status {wanted!r}."}, status=400)
        return Response(rows_for(request.user, status=wanted, scope=scope))


class FeatureRequestDetailView(ScopeRefusals, APIView):
    """GET /api/v1/requests/<id>/?scope= — the request with the evidence and
    the companies asking that this reader may see (in the scope's book,
    with one). A request they have no evidence for is a 404, the same "404,
    not an empty page" rule the customer-scoped views use.

    PATCH title, summary, status, owner — leadership only, audited; it
    answers with the unscoped detail."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        scope = optional_scope(request)
        feature = get_object_or_404(_org_requests(request), pk=pk)
        payload = detail_for(request.user, feature, scope=scope)
        if payload is None:
            raise Http404("No evidence you can read.")
        return Response(payload)
```

In `patch`, replace `return self.get(request, pk)` with:

```python
        payload = detail_for(request.user, feature)
        if payload is None:
            raise Http404("No evidence you can read.")
        return Response(payload)
```

Remove the now-unused `Companies`, `summarise` imports only if ruff reports them unused (they are still used by `rows_for`/`detail_for`).

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.brain.tests.test_book services.requests services.brain.tests.test_api_changed services.brain.tests.test_api_waiting services.brain.tests.test_api_doing services.mcp --parallel --noinput`
Expected: all PASS, with the existing requests, MCP and Brain API tests unchanged.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/brain/book.py services/brain/http.py services/brain/views.py \
  services/requests/gather.py services/requests/views.py \
  services/brain/tests/customers_fixtures.py services/brain/tests/test_book.py \
  services/requests/tests/test_scope.py
git commit -m "$(cat <<'EOF'
feat(brain): a scope's book as filters, and ?scope= on feature requests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `?scope=` on anomalies

**Files:**
- Modify: `services/anomalies/views.py` (`visible_evidence`, `Companies`, `rows_for`, `detail_for`, list and detail views)
- Test: `services/anomalies/tests/test_scope.py`

**Interfaces:**
- Consumes: `services.brain.book.q(scope)`, `services.brain.book.customers(scope)`, `services.brain.http.ScopeRefusals`, `optional_scope(request)` (Task 2); `CustomersFixture.anomaly(title, *records)` (Task 2).
- Produces:
  - `services.anomalies.views.visible_evidence(organisation, viewer, *, anomaly=None, book=None)`, `Companies(rows, organisation, viewer, *, within=None)`
  - `services.anomalies.views.rows_for(reader, *, status=None, scope=None) -> list[dict]` (list rows: `id, title, summary, status, arr (str), companies, interactions, first_seen_at, last_seen_at, acknowledged_by`)
  - `services.anomalies.views.detail_for(reader, anomaly, *, scope=None) -> dict | None`

- [ ] **Step 1: Write the failing tests**

`services/anomalies/tests/test_scope.py`:

```python
"""?scope= on the anomaly list and detail (Brain delivery 4 spec §1.2):
evidence narrowed to the scope's book before revenue and counts; titles
gated exactly as before; no scope, no change."""

from services.brain.tests.customers_fixtures import CustomersFixture

LIST = "/api/v1/anomalies/"
STORED = "Login fails for Pizza Hut and Taco Bell after the SSO change"


class AnomalyScopeTests(CustomersFixture):
    def setUp(self):
        self.outage = self.anomaly(STORED, self.pizza, self.taco, self.east, self.soup)
        self.billing = self.anomaly("Invoices doubled at Taco Bell", self.taco)

    def rows(self, user, query=""):
        response = self.as_user(user).get(f"{LIST}{query}")
        self.assertEqual(response.status_code, 200, response.json())
        return {row["id"]: row for row in response.json()}

    def test_without_a_scope_the_list_is_the_readers_as_before(self):
        rows = self.rows(self.csm)
        self.assertEqual(set(rows), {self.outage.id, self.billing.id})
        outage = rows[self.outage.id]
        self.assertEqual(outage["title"], "Similar reports across 2 of your companies")
        self.assertEqual(float(outage["arr"]), 500000.0)

    def test_me_narrows_to_the_readers_book_and_keeps_the_title_gate(self):
        rows = self.rows(self.csm, "?scope=me")
        self.assertEqual(list(rows), [self.outage.id])
        outage = rows[self.outage.id]
        self.assertEqual(outage["title"], "Similar reports across 1 of your companies")
        self.assertIsNone(outage["summary"])
        self.assertEqual(float(outage["arr"]), 300000.0)
        self.assertEqual((outage["companies"], outage["interactions"]), (1, 2))

    def test_my_team_is_the_managers_and_their_reports_books(self):
        outage = self.rows(self.mona, "?scope=team")[self.outage.id]
        self.assertEqual(float(outage["arr"]), 350000.0)
        self.assertEqual((outage["companies"], outage["interactions"]), (2, 3))

    def test_company_for_view_all_is_the_unscoped_list_with_stored_titles(self):
        company = self.rows(self.admin, "?scope=company")
        self.assertEqual(company, self.rows(self.admin))
        self.assertEqual(company[self.outage.id]["title"], STORED)

    def test_an_empty_book_lists_nothing(self):
        # Alice owns nothing, so her Me is empty.
        self.assertEqual(self.rows(self.admin, "?scope=me"), {})

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        response = self.as_user(self.csm).get(f"{LIST}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")

    def test_the_detail_is_narrowed_and_404s_when_nothing_is_left(self):
        client = self.as_user(self.csm)
        gone = client.get(f"{LIST}{self.billing.id}/?scope=me")
        self.assertEqual(gone.status_code, 404)
        self.assertEqual(gone.json(), {"detail": "No reports you can read."})
        detail = client.get(f"{LIST}{self.outage.id}/?scope=me").json()
        self.assertEqual([c["name"] for c in detail["companies_hit"]], ["Pizza Hut"])
        self.assertEqual(len(detail["evidence"]), 2)

    def test_a_patch_answers_with_the_unscoped_detail(self):
        response = self.as_user(self.admin).patch(
            f"{LIST}{self.billing.id}/?scope=me", {"status": "acknowledged"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(response.json()["status"], "acknowledged")
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.anomalies.tests.test_scope --parallel --noinput`
Expected: FAIL. `?scope=` is ignored today, so `test_me_narrows...` sees two rows, and `?scope=team` for Carl answers 200 instead of 403.

- [ ] **Step 3: Implement**

In `services/anomalies/views.py`, add the imports:

```python
from services.brain import book as brain_book
from services.brain.http import ScopeRefusals, optional_scope
```

Replace `visible_evidence` and the start of `Companies.__init__`:

```python
def visible_evidence(organisation, viewer, *, anomaly=None, book=None):
    """Evidence this person may read: on an organisation or account they
    may open, and a record they may read (the shared rule in
    services.customers.personal). An account is its own rule: one under an
    organisation they may open can still be closed to them. `book`
    (services.brain.book.q) narrows to a Brain scope's book."""
    customer_ids = set(visible_customers(viewer).values_list("id", flat=True))
    # SOC2:AUTH-02 accounts by their own rule, not by their organisation's
    account_ids = set(visible_accounts(viewer).values_list("id", flat=True))
    rows = AnomalyEvidence.objects.filter(organisation=organisation)
    if anomaly is not None:
        rows = rows.filter(anomaly=anomaly)
    rows = rows.filter(Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids)).filter(
        readable_evidence_q(
            viewer,
            email=AnomalyEvidence.Kind.EMAIL,
            ticket=AnomalyEvidence.Kind.TICKET,
            call=AnomalyEvidence.Kind.CALL,
        )
    )
    if book is not None:
        rows = rows.filter(book)
    return rows.select_related("customer", "account")
```

```python
class Companies:
    """The companies behind a page of evidence, resolved once. `within`
    (services.brain.book.customers) keeps to a Brain scope's own customers."""

    def __init__(self, rows, organisation, viewer, *, within=None):
        self.field = organisation.effective_global_attributes()["arr"]
        openable = visible_customers(viewer)
        if within is not None:
            # SOC2:AUTH-02 in a scope, revenue counts the book's customers the reader may open
            openable = openable.filter(id__in=within)
        visible = {c.id: c for c in openable}
```

The rest of `Companies.__init__` is unchanged.

Add after `_evidence_row`:

```python
def rows_for(reader, *, status=None, scope=None):
    """The list's rows as `reader` reads them, most revenue first; with a
    Brain scope, over that scope's book. Titles are gated by `title_for`
    either way."""
    organisation = reader.organisation
    anomalies = Anomaly.objects.filter(organisation=organisation).select_related("acknowledged_by")
    if status:
        anomalies = anomalies.filter(status=status)
    evidence = list(visible_evidence(organisation, reader, book=brain_book.q(scope)))
    companies = Companies(evidence, organisation, reader, within=brain_book.customers(scope))
    by_anomaly = defaultdict(list)
    for row in evidence:
        by_anomaly[row.anomaly_id].append(row)
    sees_all = sees_everything(reader)
    out = []
    for anomaly in anomalies:
        mine = by_anomaly.get(anomaly.id)
        if not mine:
            continue
        row = _row(anomaly, mine, companies, sees_all=sees_all)
        row.pop("_behind")
        out.append(row)
    out.sort(key=lambda r: (-float(r["arr"]), -r["interactions"], r["title"]))
    return out


def detail_for(reader, anomaly, *, scope=None):
    """The detail body as `reader` reads it, or None when they can read no
    report on it (in the scope, with one)."""
    organisation = reader.organisation
    rows = list(visible_evidence(organisation, reader, anomaly=anomaly, book=brain_book.q(scope)))
    if not rows:
        return None
    companies = Companies(rows, organisation, reader, within=brain_book.customers(scope))
    row = _row(anomaly, rows, companies, sees_all=sees_everything(reader))
    behind = row.pop("_behind")
    hit = sorted(
        ({"id": c.id, "name": c.name, "arr": str(companies.arr_of(c))} for c in behind.values()),
        key=lambda c: -float(c["arr"]),
    )
    return {**row, "companies_hit": hit, "evidence": [_evidence_row(r) for r in rows]}
```

Replace `AnomalyListView.get`, `AnomalyDetailView.get` and the last line of `AnomalyDetailView.patch`. Both classes become `(ScopeRefusals, APIView)`:

```python
class AnomalyListView(ScopeRefusals, APIView):
    """GET /api/v1/anomalies/?status=&scope= — what is going wrong at several
    companies at once, most revenue first. `?scope=me|team|company` narrows
    the evidence to that Brain scope's book first; without it, as before.

    Open to any member, but every figure is their own: the revenue, the
    counts and the evidence cover the companies they may open and the
    records they may read. A cluster they can see nothing of is left out
    rather than shown as a zero, since its title was written from reports
    they may not read."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = optional_scope(request)
        wanted = request.query_params.get("status")
        if wanted and wanted not in Anomaly.Status.values:
            return Response({"detail": f"Unknown status {wanted!r}."}, status=400)
        return Response(rows_for(request.user, status=wanted, scope=scope))


class AnomalyDetailView(ScopeRefusals, APIView):
    """GET /api/v1/anomalies/<id>/?scope= — the cluster with the companies
    hit and the reports, as this reader may see them (in the scope's book,
    with one). PATCH its status, which is a leadership decision because it
    speaks for the whole company; it answers with the unscoped detail."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        scope = optional_scope(request)
        anomaly = get_object_or_404(_org_anomalies(request), pk=pk)
        payload = detail_for(request.user, anomaly, scope=scope)
        if payload is None:
            return Response({"detail": "No reports you can read."}, status=404)
        return Response(payload)
```

In `patch`, replace `return self.get(request, pk)` with:

```python
        payload = detail_for(request.user, anomaly)
        if payload is None:
            return Response({"detail": "No reports you can read."}, status=404)
        return Response(payload)
```

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.anomalies services.attention services.copilot.tests services.mcp --parallel --noinput`
Expected: all PASS. `attention`, `copilot` and `mcp` import `visible_evidence`/`Companies` with the old arguments, which still work.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/anomalies/views.py services/anomalies/tests/test_scope.py
git commit -m "$(cat <<'EOF'
feat(anomalies): ?scope= narrows the list and detail to a Brain scope's book

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Asks, anomalies and scores for a scope

**Files:**
- Modify: `services/surveys/access.py` (`readable_send_ids`)
- Create: `services/brain/customers.py` (`asks`, `anomalies`, `scores` and helpers; Task 5 adds `sentiment` and `build`)
- Test: `services/surveys/tests/test_readable_send_ids.py`, `services/brain/tests/test_customers.py`

**Interfaces:**
- Consumes: `services.requests.views.rows_for(reader, *, scope=None)`, `services.anomalies.views.rows_for(reader, *, scope=None)`, `services.brain.book.q(scope)` (Tasks 2–3); `services.surveys.scores.figure(survey_type, scores) -> Decimal|None`, `whole_figure(...) -> int|None`; `services.surveys.models.WINDOW_DAYS` (90); `services.customers.scoping.visible_children_q(user)`; `CustomersFixture` makers.
- Produces:
  - `services.surveys.access.readable_send_ids(user) -> QuerySet[values("id")]`
  - `services.brain.customers.asks(reader, scope) -> {"total": int, "top": [{id, title, status, arr: float, companies, last_90_days, previous_90_days}]}`
  - `services.brain.customers.anomalies(reader, scope) -> {"total": int, "top": [{id, title, status, arr: float, companies, last_seen_at}]}`
  - `services.brain.customers.scores(reader, scope, today) -> {"nps"|"csat"|"ces": {now, then, responses, previous_responses}, "comments": [...], "hidden": int}`
  - `services.brain.customers.day_start(day)`, `record(row) -> {type, id, name}`, constants `TOP=5`, `COMMENTS=5`, `MIN_RESPONSES=5`

- [ ] **Step 1: Write the failing tests**

`services/surveys/tests/test_readable_send_ids.py`:

```python
"""`readable_send_ids` is `readable_sends` as `id IN` subqueries with no
DISTINCT (Brain delivery 4 Contract note 4)."""

from services.surveys.access import readable_send_ids, readable_sends
from services.surveys.models import SurveySend
from services.surveys.tests.fixtures import SurveyFixture


class ReadableSendIdsTests(SurveyFixture):
    def test_the_same_sends_as_readable_sends_without_distinct(self):
        self.make_send(owner=self.csm)
        self.make_send(owner=self.csm, sharing=SurveySend.Sharing.WORKSPACE)
        self.make_send(owner=self.other)
        shared = self.make_send(owner=self.other, sharing=SurveySend.Sharing.PEOPLE)
        shared.shared_with.add(self.csm)
        elsewhere = self.make_send(owner=self.other, sharing=SurveySend.Sharing.PEOPLE)
        elsewhere.shared_with.add(self.admin)
        for user in (self.csm, self.other, self.admin, self.stranger):
            with self.subTest(user=user.name):
                ids = set(
                    SurveySend.objects.filter(id__in=readable_send_ids(user)).values_list(
                        "id", flat=True
                    )
                )
                self.assertEqual(ids, set(readable_sends(user).values_list("id", flat=True)))
        sql = str(SurveySend.objects.filter(id__in=readable_send_ids(self.csm)).query)
        self.assertNotIn("DISTINCT", sql.upper())
```

`services/brain/tests/test_customers.py`:

```python
"""What customers are saying, section by section (Brain delivery 4 spec
§1.3): asks and anomalies are the top of the scoped lists; scores are
recomputed from the answers on the scope's book that the reader may open."""

from services.brain import customers
from services.brain.tests.customers_fixtures import CustomersFixture


class AsksAndAnomaliesTests(CustomersFixture):
    def setUp(self):
        self.sso = self.feature("SSO with Okta", self.pizza, self.east, self.soup)
        for i in range(6):
            self.feature(f"Ask {i}", self.dough)
        self.outage = self.anomaly("Login fails at Pizza Hut", self.pizza, self.soup)

    def test_asks_are_the_top_five_of_the_scoped_list_with_the_total(self):
        reader, scope = self.reader_and_scope(self.mona, "team")
        asks = customers.asks(reader, scope)
        self.assertEqual(asks["total"], 7)
        self.assertEqual(len(asks["top"]), 5)
        self.assertEqual(
            asks["top"][0],
            {
                "id": self.sso.id,
                "title": "SSO with Okta",
                "status": "open",
                "arr": 350000.0,
                "companies": 2,
                "last_90_days": 3,
                "previous_90_days": 0,
            },
        )

    def test_in_me_the_ask_counts_only_the_readers_book(self):
        reader, scope = self.reader_and_scope(self.csm, "me")
        top = customers.asks(reader, scope)["top"]
        sso = next(row for row in top if row["id"] == self.sso.id)
        self.assertEqual((sso["arr"], sso["companies"]), (300000.0, 1))

    def test_anomalies_keep_the_title_gate(self):
        reader, scope = self.reader_and_scope(self.mona, "team")
        anomalies = customers.anomalies(reader, scope)
        self.assertEqual(anomalies["total"], 1)
        (row,) = anomalies["top"]
        self.assertEqual(set(row), {"id", "title", "status", "arr", "companies", "last_seen_at"})
        self.assertEqual(row["title"], "Similar reports across 2 of your companies")
        self.assertEqual((row["arr"], row["status"]), (350000.0, "live"))
        reader, scope = self.reader_and_scope(self.admin, "company")
        (row,) = customers.anomalies(reader, scope)["top"]
        self.assertEqual(row["title"], "Login fails at Pizza Hut")

    def test_nothing_in_the_book_is_an_empty_section(self):
        reader, scope = self.reader_and_scope(self.other, "me")
        self.assertEqual(customers.asks(reader, scope), {"total": 0, "top": []})
        self.assertEqual(customers.anomalies(reader, scope), {"total": 0, "top": []})


class ScoresTests(CustomersFixture):
    def setUp(self):
        self.nps = self.send("nps")
        self.answers(self.nps, self.pizza, [10, 10, 9, 3])
        self.answer(self.nps, self.emea, 7)
        self.answers(self.nps, self.pizza, [10, 2, 2, 2], days_ago=120)
        self.answer(self.nps, self.taco, 0)  # Dana's: not in Carl's book
        self.csat = self.send("csat")
        self.answers(self.csat, self.dough, [5, 5, 4, 4, 2])
        self.answers(self.csat, self.dough, [5, 5, 1, 1, 1], days_ago=100)
        self.ces = self.send("ces")
        self.answer(self.ces, self.pizza, 6)
        self.answer(self.ces, self.emea, 7)  # an account's CES: not counted

    def scores(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return customers.scores(reader, scope, self.today)

    def test_figures_over_the_scope_now_and_then(self):
        scores = self.scores(self.csm, "me")
        # NPS now: 10, 10, 9, 3 on Pizza Hut and 7 on Pizza EMEA: 3 promoters,
        # 1 detractor in 5 = 40. Then: 4 answers, under 5, so no figure.
        self.assertEqual(
            scores["nps"], {"now": 40, "then": None, "responses": 5, "previous_responses": 4}
        )
        self.assertEqual(
            scores["csat"], {"now": 80.0, "then": 40.0, "responses": 5, "previous_responses": 5}
        )
        self.assertEqual(
            scores["ces"], {"now": None, "then": None, "responses": 1, "previous_responses": 0}
        )

    def test_my_team_adds_the_reports_book(self):
        self.answer(self.nps, self.soup, 10)
        # 4 promoters, 1 detractor in 6 = 50
        self.assertEqual(self.scores(self.mona, "team")["nps"]["now"], 50)
        self.assertEqual(self.scores(self.csm, "me")["nps"]["now"], 40)

    def test_a_send_the_reader_cant_read_is_not_counted(self):
        private = self.send("nps", owner=self.other, sharing="private")
        self.answers(private, self.pizza, [0, 0, 0, 0, 0])
        self.assertEqual(self.scores(self.csm, "me")["nps"]["responses"], 5)

    def test_comments_newest_first_at_most_five(self):
        for days in range(1, 8):
            self.answer(self.nps, self.pizza, 4, days_ago=days, comment=f"Day {days}")
        scores = self.scores(self.csm, "me")
        self.assertEqual(
            [c["comment"] for c in scores["comments"]],
            ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"],
        )
        first = scores["comments"][0]
        self.assertEqual(
            (first["survey_type"], first["score"], first["record"]),
            ("nps", 4, {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut"}),
        )
        self.assertIn("answered_at", first)
        self.assertEqual(scores["hidden"], 0)

    def test_comments_name_only_records_the_reader_may_open(self):
        self.answer(self.nps, self.pizza, 4, comment="Support is slow lately.", days_ago=2)
        self.answer(self.nps, self.loose, 9, comment="Lovely team.")
        self.answer(self.nps, self.pizza, 8, comment="Old news.", days_ago=120)
        scores = self.scores(self.lee, "company")
        self.assertEqual([c["comment"] for c in scores["comments"]], ["Lovely team."])
        self.assertEqual(
            scores["comments"][0]["record"],
            {"type": "customer", "id": self.loose.id, "name": "Loose Ltd"},
        )
        # Pizza Hut's comment is counted, never named; the old one is outside the window.
        self.assertEqual(scores["hidden"], 1)
        # Lee's figures count only answers on what he may open: Loose Ltd's.
        self.assertEqual(scores["nps"]["responses"], 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_readable_send_ids services.brain.tests.test_customers --parallel --noinput`
Expected: `ImportError: cannot import name 'readable_send_ids'` and `ImportError: cannot import name 'customers' from 'services.brain'`.

- [ ] **Step 3: Write `readable_send_ids`**

In `services/surveys/access.py`, after `readable_sends`:

```python
def readable_send_ids(user):
    """The ids of `readable_sends(user)` as a subquery for an `id IN`
    filter: one `id IN` per way in, so no DISTINCT (Postgres 16 plans the
    join-and-DISTINCT form badly; services.customers.scoping)."""
    # SOC2:AUTH-02 the same rule as readable_sends: owner, workspace, or shared by name
    shared = SurveySend.shared_with.through.objects.filter(user_id=user.pk).values("surveysend_id")
    return (
        SurveySend.objects.filter(organisation_id=user.organisation_id)
        .filter(
            Q(owner_id=user.pk)
            | Q(sharing=SurveySend.Sharing.WORKSPACE)
            | Q(sharing=SurveySend.Sharing.PEOPLE, id__in=shared)
        )
        .values("id")
    )
```

- [ ] **Step 4: Write `customers.py` (asks, anomalies, scores)**

`services/brain/customers.py`:

```python
"""What customers are saying: the asks, anomalies, survey scores and
contact sentiment in a scope's book (spec: react-ts-app docs/superpowers/
specs/2026-10-05-brain-customers-design.md §1.3).

Whose book: `services.brain.book` (Me, My team, or the whole organisation
for Company). Inside it everything is counted and named by the reader's own
rights, never the scope's: revenue and scores only over records the reader
may open, comments named only on those (the rest counted in `hidden`),
contacts only those the reader may open.

Each section is a fixed number of queries whatever its length, and every
filter is an `id IN (subquery)`, never a join made unique with DISTINCT
(Postgres 16, services.customers.scoping). A test checks every query
`build` runs for DISTINCT."""

from datetime import datetime, time, timedelta

from django.utils import timezone

from services.anomalies.views import rows_for as anomaly_rows
from services.customers.scoping import visible_children_q
from services.requests.views import rows_for as request_rows
from services.surveys.access import readable_send_ids
from services.surveys.models import WINDOW_DAYS, SurveyInvite
from services.surveys.questions import CES, CSAT, NPS
from services.surveys.scores import figure, whole_figure

from . import book

#: Rows the Asks and Anomalies sections carry; `total` is the full count.
TOP = 5
#: Latest comments shown.
COMMENTS = 5
#: Under this many answers in a window, its figure is not shown.
MIN_RESPONSES = 5
SURVEY_TYPES = (NPS, CSAT, CES)


def day_start(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def record(row):
    """`{type, id, name}` of the customer or account a row hangs off."""
    if row.account_id:
        return {"type": "account", "id": row.account_id, "name": row.account.name}
    return {"type": "customer", "id": row.customer_id, "name": row.customer.name}


# ── Asks and anomalies ───────────────────────────────────────────────────


def asks(reader, scope):
    """The top of `/requests/?scope=`: the same rows, in the same order."""
    rows = request_rows(reader, scope=scope)
    return {
        "total": len(rows),
        "top": [
            {
                "id": row["id"],
                "title": row["title"],
                "status": row["status"],
                "arr": float(row["arr"]),
                "companies": row["companies"],
                "last_90_days": row["last_90_days"],
                "previous_90_days": row["previous_90_days"],
            }
            for row in rows[:TOP]
        ],
    }


def anomalies(reader, scope):
    """The top of `/anomalies/?scope=`, titles gated as there (`title_for`)."""
    rows = anomaly_rows(reader, scope=scope)
    return {
        "total": len(rows),
        "top": [
            {
                "id": row["id"],
                "title": row["title"],
                "status": row["status"],
                "arr": float(row["arr"]),
                "companies": row["companies"],
                "last_seen_at": row["last_seen_at"],
            }
            for row in rows[:TOP]
        ],
    }


# ── Scores ───────────────────────────────────────────────────────────────


def _answers(reader, scope, since):
    """Answers on the scope's book, from sends the reader may read,
    answered since `since`: whoever's record they are on."""
    # SOC2:AUTH-02 an answer is read only from a send the reader may read
    answered = SurveyInvite.objects.filter(
        status=SurveyInvite.Status.ANSWERED,
        answered_at__gte=since,
        send_id__in=readable_send_ids(reader),
    )
    on_book = book.q(scope)
    return answered if on_book is None else answered.filter(on_book)


def _shown(survey_type, scores):
    """The window's figure, or None under MIN_RESPONSES answers."""
    if len(scores) < MIN_RESPONSES:
        return None
    if survey_type == NPS:
        return whole_figure(NPS, scores)
    return float(figure(survey_type, scores))


def scores(reader, scope, today):
    """NPS, CSAT and CES over the last 90 days against the 90 before, from
    the answers themselves, and the latest comments. Four queries."""
    current = day_start(today - timedelta(days=WINDOW_DAYS))
    previous = day_start(today - timedelta(days=2 * WINDOW_DAYS))
    in_scope = _answers(reader, scope, previous)
    # SOC2:AUTH-02 scores count only answers on records the reader may open
    readable = in_scope.filter(visible_children_q(reader))
    windows = {survey_type: ([], []) for survey_type in SURVEY_TYPES}
    for survey_type, score, answered_at, customer_id in readable.values_list(
        "send__survey_type", "score", "answered_at", "customer_id"
    ):
        if survey_type == CES and customer_id is None:
            continue  # accounts carry no CES
        now, then = windows[survey_type]
        (now if answered_at >= current else then).append(score)
    out = {
        survey_type: {
            "now": _shown(survey_type, now),
            "then": _shown(survey_type, then),
            "responses": len(now),
            "previous_responses": len(then),
        }
        for survey_type, (now, then) in windows.items()
    }
    commented = in_scope.filter(answered_at__gte=current).exclude(comment="")
    # SOC2:AUTH-02 a comment is named only on a record the reader may open;
    # the rest are counted in `hidden`
    named = commented.filter(visible_children_q(reader))
    latest = named.select_related("send", "customer", "account").order_by("-answered_at", "-id")[
        :COMMENTS
    ]
    out["comments"] = [
        {
            "survey_type": invite.send.survey_type,
            "score": invite.score,
            "comment": invite.comment,
            "record": record(invite),
            "answered_at": invite.answered_at,
        }
        for invite in latest
    ]
    out["hidden"] = commented.count() - named.count()
    return out
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.surveys services.brain.tests.test_customers --parallel --noinput`
Expected: all PASS.

- [ ] **Step 6: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/surveys/access.py services/surveys/tests/test_readable_send_ids.py \
  services/brain/customers.py services/brain/tests/test_customers.py
git commit -m "$(cat <<'EOF'
feat(brain): a scope's asks, anomalies and survey scores, as the reader may read them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Sentiment, `build`, and `GET customers/`

**Files:**
- Modify: `services/brain/customers.py` (`sentiment`, `build`)
- Modify: `services/brain/views.py` (`CustomersView`), `services/brain/urls.py`
- Test: `services/brain/tests/test_customers.py` (add `SentimentTests`, `BuildTests`), `services/brain/tests/test_api_customers.py`

**Interfaces:**
- Consumes: Task 1's `Contact.previous_sentiment` / `sentiment_changed_at`; Task 4's `asks`, `anomalies`, `scores`, `day_start`, `record`; `book.q(scope)`; `BrainView.scope(request)`; `CustomersFixture.contact`, `turned`.
- Produces:
  - `services.brain.customers.sentiment(reader, scope, today) -> {"negative": int, "tracking_since": "YYYY-MM-DD"|None, "turned_negative": [{contact: {id, name}, record: {type, id, name}, previous, changed_at}]}`
  - `services.brain.customers.build(reader, scope, today) -> {scope, currency, asks, anomalies, scores, sentiment}` (§3)
  - `GET /api/v1/brain/customers/?scope=` (`name="brain-customers"`)

- [ ] **Step 1: Write the failing tests**

Append to `services/brain/tests/test_customers.py`. Add these imports at the top: `from datetime import timedelta`, `from django.db import connection`, `from django.test.utils import CaptureQueriesContext`, `from django.utils import timezone`, `from services.customers.models import Contact`.

```python
class SentimentTests(CustomersFixture):
    def setUp(self):
        self.olivia = self.contact(self.pizza, "Olivia Park")
        self.ed = self.contact(self.emea, "Ed Emea")
        self.tia = self.contact(self.taco, "Tia Taco", "negative")
        self.sam = self.contact(self.soup, "Sam Soup", "negative")
        self.lou = self.contact(self.loose, "Lou Loose")

    def sentiment(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return customers.sentiment(reader, scope, self.today)

    def test_before_any_change(self):
        self.assertEqual(
            self.sentiment(self.csm, "me"),
            {"negative": 0, "tracking_since": None, "turned_negative": []},
        )
        self.assertEqual(self.sentiment(self.mona, "team")["negative"], 1)

    def test_who_turned_negative_in_the_last_30_days_newest_first(self):
        self.turned(self.olivia, "neutral", days_ago=2)
        self.turned(self.ed, "positive", days_ago=1)
        dot = self.contact(self.dough, "Dot Dough")
        self.turned(dot, "neutral", days_ago=40)
        sentiment = self.sentiment(self.csm, "me")
        self.assertEqual(sentiment["negative"], 3)
        turned = sentiment["turned_negative"]
        self.assertEqual([row["contact"]["name"] for row in turned], ["Ed Emea", "Olivia Park"])
        self.assertEqual(turned[0]["contact"], {"id": self.ed.id, "name": "Ed Emea"})
        self.assertEqual(
            turned[0]["record"], {"type": "account", "id": self.emea.id, "name": "Pizza EMEA"}
        )
        self.assertEqual(turned[0]["previous"], "positive")
        self.assertIn("changed_at", turned[0])
        self.assertEqual(
            sentiment["tracking_since"],
            timezone.localdate(timezone.now() - timedelta(days=40)).isoformat(),
        )

    def test_one_who_turned_back_is_not_listed(self):
        Contact.objects.filter(pk=self.olivia.pk).update(
            sentiment="positive",
            previous_sentiment="negative",
            sentiment_changed_at=timezone.now() - timedelta(days=1),
        )
        sentiment = self.sentiment(self.csm, "me")
        self.assertEqual((sentiment["negative"], sentiment["turned_negative"]), (0, []))
        self.assertIsNotNone(sentiment["tracking_since"])

    def test_in_company_only_contacts_the_reader_may_open(self):
        self.turned(self.olivia, "neutral", days_ago=5)
        self.turned(self.lou, "neutral", days_ago=1)
        sentiment = self.sentiment(self.lee, "company")
        # Tia, Sam and Olivia are negative too, on records Lee can't open.
        self.assertEqual(sentiment["negative"], 1)
        self.assertEqual(
            [row["contact"]["name"] for row in sentiment["turned_negative"]], ["Lou Loose"]
        )
        # tracking_since never dates a change Lee couldn't see.
        self.assertEqual(
            sentiment["tracking_since"],
            timezone.localdate(timezone.now() - timedelta(days=1)).isoformat(),
        )

    def test_at_most_ten(self):
        for i in range(12):
            self.turned(self.contact(self.pizza, f"Person {i}"), "neutral", days_ago=1)
        self.assertEqual(len(self.sentiment(self.csm, "me")["turned_negative"]), 10)


class BuildTests(CustomersFixture):
    def test_the_payload_carries_every_section(self):
        self.feature("SSO with Okta", self.pizza)
        reader, scope = self.reader_and_scope(self.csm, "me")
        payload = customers.build(reader, scope, self.today)
        self.assertEqual(
            set(payload), {"scope", "currency", "asks", "anomalies", "scores", "sentiment"}
        )
        self.assertEqual((payload["scope"], payload["currency"]), ("me", "USD"))
        self.assertEqual(payload["asks"]["total"], 1)
        self.assertEqual(set(payload["scores"]), {"nps", "csat", "ces", "comments", "hidden"})

    def fill(self, n):
        nps = self.send("nps")
        for i in range(n):
            self.feature(f"Ask {i}", self.pizza, self.emea)
            self.anomaly(f"Outage {i}", self.pizza, self.emea)
            self.answer(nps, self.pizza, 3, comment=f"Slow {i}")
            self.answer(nps, self.emea, 9, comment=f"Fine {i}")
            self.turned(self.contact(self.pizza, f"Person {i}"), "neutral")
            self.turned(self.contact(self.emea, f"Other {i}"), "positive")

    def queries(self):
        reader, scope = self.reader_and_scope(self.mona, "team")
        with CaptureQueriesContext(connection) as captured:
            customers.build(reader, scope, self.today)
        return captured.captured_queries

    def test_the_query_count_does_not_grow_and_no_query_is_distinct(self):
        self.fill(1)
        few = self.queries()
        self.fill(5)
        many = self.queries()
        self.assertEqual(len(few), len(many))
        for query in many:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
```

`services/brain/tests/test_api_customers.py`:

```python
"""GET /api/v1/brain/customers/?scope= over HTTP (Brain delivery 4 spec
§1.5, §3): any member, their own scope only, nothing of another tenant's."""

from services.brain.tests.customers_fixtures import CustomersFixture

CUSTOMERS = "/api/v1/brain/customers/"


class CustomersApiTests(CustomersFixture):
    def test_a_member_reads_their_me(self):
        self.feature("SSO with Okta", self.pizza)
        response = self.as_user(self.csm).get(f"{CUSTOMERS}?scope=me")
        self.assertEqual(response.status_code, 200, response.json())
        body = response.json()
        self.assertEqual(body["scope"], "me")
        self.assertEqual([row["title"] for row in body["asks"]["top"]], ["SSO with Okta"])
        self.assertEqual(body["asks"]["top"][0]["arr"], 300000.0)
        self.assertEqual(
            body["sentiment"], {"negative": 0, "tracking_since": None, "turned_negative": []}
        )

    def test_the_default_scope_is_the_widest(self):
        self.assertEqual(self.as_user(self.mona).get(CUSTOMERS).json()["scope"], "team")
        self.assertEqual(self.as_user(self.admin).get(CUSTOMERS).json()["scope"], "company")

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        response = self.as_user(self.csm).get(f"{CUSTOMERS}?scope=company")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")
        self.assertEqual(self.as_user(self.csm).get(f"{CUSTOMERS}?scope=x").status_code, 400)

    def test_signed_out_is_refused(self):
        self.assertEqual(self.client.get(CUSTOMERS).status_code, 401)

    def test_another_tenant_sees_nothing_of_ours(self):
        self.feature("SSO with Okta", self.pizza)
        self.answer(self.send("nps"), self.pizza, 10, comment="Great.")
        body = self.as_user(self.stranger).get(f"{CUSTOMERS}?scope=me").json()
        self.assertEqual(body["asks"], {"total": 0, "top": []})
        self.assertEqual((body["scores"]["comments"], body["scores"]["hidden"]), ([], 0))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_customers services.brain.tests.test_api_customers --parallel --noinput`
Expected: `AttributeError: module 'services.brain.customers' has no attribute 'sentiment'` / `'build'`, and 404 on `/api/v1/brain/customers/`.

- [ ] **Step 3: Write `sentiment` and `build`**

In `services/brain/customers.py`, add `from django.db.models import Min` and `from services.customers.models import Contact` to the imports, the constants below `SURVEY_TYPES`, and at the end of the file:

```python
#: Most contacts listed as turned negative, and how far back.
TURNED = 10
TURNED_DAYS = 30
```

```python
# ── Sentiment ────────────────────────────────────────────────────────────


def sentiment(reader, scope, today):
    """How many contacts on the scope's book the reader may open are
    negative, and who of them turned negative in the last TURNED_DAYS,
    newest first. Three queries."""
    # SOC2:AUTH-02 a contact is counted and named only on a record the reader may open
    readable = Contact.objects.filter(visible_children_q(reader))
    on_book = book.q(scope)
    contacts = readable if on_book is None else readable.filter(on_book)
    negative = Contact.Sentiment.NEGATIVE
    since = day_start(today - timedelta(days=TURNED_DAYS))
    turned = (
        contacts.filter(sentiment=negative, sentiment_changed_at__gte=since)
        .select_related("customer", "account")
        .order_by("-sentiment_changed_at", "-id")[:TURNED]
    )
    first = readable.aggregate(first=Min("sentiment_changed_at"))["first"]
    return {
        "negative": contacts.filter(sentiment=negative).count(),
        "tracking_since": timezone.localdate(first).isoformat() if first else None,
        "turned_negative": [
            {
                "contact": {"id": contact.id, "name": contact.name},
                "record": record(contact),
                "previous": contact.previous_sentiment,
                "changed_at": contact.sentiment_changed_at,
            }
            for contact in turned
        ],
    }


# ── The page ─────────────────────────────────────────────────────────────


def build(reader, scope, today):
    """`GET customers/`: the scope's asks, anomalies, scores and sentiment,
    each counted and named by the reader's own rights."""
    return {
        "scope": scope.key,
        "currency": reader.organisation.currency,
        "asks": asks(reader, scope),
        "anomalies": anomalies(reader, scope),
        "scores": scores(reader, scope, today),
        "sentiment": sentiment(reader, scope, today),
    }
```

- [ ] **Step 4: The route**

In `services/brain/views.py`, change the module import to `from . import briefs, changed, customers, doing, explanations, initiatives, waiting` and add after `WaitingCountView`:

```python
class CustomersView(BrainView):
    """GET /api/v1/brain/customers/?scope= — what the scope's customers are
    asking for, what is going wrong across them, how they score us and who
    turned negative: revenue and scores only over records the reader may
    open, comments on the rest counted in `hidden`."""

    def get(self, request):
        scope = self.scope(request)
        return Response(customers.build(request.user, scope, timezone.localdate()))
```

In `services/brain/urls.py`, add:

```text
    path("customers/", views.CustomersView.as_view(), name="brain-customers"),
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.brain --parallel --noinput`
Expected: all PASS.

- [ ] **Step 6: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/brain/customers.py services/brain/views.py services/brain/urls.py \
  services/brain/tests/test_customers.py services/brain/tests/test_api_customers.py
git commit -m "$(cat <<'EOF'
feat(brain): GET customers/ with who turned negative, one payload per scope

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The knowledge graph for a scope, open to every member

**Files:**
- Modify: `services/metrics/graph.py` (split into parts; `build_graph(organisation)` unchanged)
- Create: `services/brain/graph.py`
- Modify: `services/brain/views.py` (`GraphView`), `services/brain/urls.py`
- Test: `services/brain/tests/test_graph.py`

**Interfaces:**
- Consumes: `forecast.filtered_customers(user, params)`, `forecast.build_rows(customers, organisation, *, viewer, horizon)`; `visible_customers(reader)`; `services.customers.personal.visible_tasks(user, queryset)`; `services.brain.doing.initiatives_in(reader, scope, today)`, `OPEN_INITIATIVES`, `figures_shown(initiative, desk)`; `services.brain.desk.proposals(reader, scope, sessions).readable`, `desk.session_ids_seen_whole(reader)`; `services.copilot.views.NEUTRAL_TITLE`; `DoingFixture.initiative(owner, *, cut=None, ...)`.
- Produces:
  - `services.metrics.graph.customer_part(organisation, customers, viewer, *, tasks=None) -> (nodes, edges, products: dict, owners: dict, customer_ids: set)`
  - `services.metrics.graph.initiative_part(initiatives, products, owners, *, label_shown=None) -> (nodes, edges)`
  - `services.metrics.graph.proposal_part(proposals, customer_ids, initiative_ids, *, session_title=None) -> (nodes, edges)`
  - `services.metrics.graph.payload(organisation, nodes, edges) -> {as_of, currency, nodes, edges}`
  - `services.brain.graph.build(reader, scope, today) -> {as_of, currency, nodes, edges, hidden}`
  - `GET /api/v1/brain/graph/?scope=` (`name="brain-graph"`)

- [ ] **Step 1: Write the failing tests**

`services/brain/tests/test_graph.py`:

```python
"""The knowledge graph for a scope (Brain delivery 4 spec §1.4): the
scope's customers the reader may open, figures counted as the reader, the
scope's open initiatives and waiting proposals by the delivery 2 and 3
rules, for every member. /metrics/graph/ is unchanged."""

from datetime import timedelta
from decimal import Decimal

from services.brain.tests.doing_fixtures import DoingFixture
from services.customers.models import Task
from services.metrics.models import Initiative, Proposal

GRAPH = "/api/v1/brain/graph/"


class ScopedGraphTests(DoingFixture):
    def graph(self, user, key):
        response = self.as_user(user).get(f"{GRAPH}?scope={key}")
        self.assertEqual(response.status_code, 200, response.json())
        return response.json()

    def ids(self, payload, kind):
        return {n["id"] for n in payload["nodes"] if n["kind"] == kind}

    def proposal(self, customer, title):
        return Proposal.objects.create(
            organisation=self.org,
            batch="b1",
            kind="task",
            title=title,
            rationale="Because.",
            action={"customer_id": customer.id, "title": title},
        )

    def test_me_draws_the_readers_book(self):
        payload = self.graph(self.csm, "me")
        self.assertEqual(
            self.ids(payload, "customer"),
            {f"customer:{self.pizza.id}", f"customer:{self.dough.id}"},
        )
        self.assertEqual(self.ids(payload, "owner"), {f"owner:{self.csm.id}"})
        self.assertEqual(payload["hidden"], 0)
        self.assertEqual(set(payload), {"as_of", "currency", "nodes", "edges", "hidden"})

    def test_my_team_draws_the_managers_and_reports_books(self):
        payload = self.graph(self.mona, "team")
        self.assertEqual(
            self.ids(payload, "customer"),
            {f"customer:{c.id}" for c in (self.pizza, self.dough, self.soup)},
        )

    def test_in_company_a_leadership_reader_sees_only_what_they_may_open(self):
        payload = self.graph(self.lee, "company")
        self.assertEqual(self.ids(payload, "customer"), {f"customer:{self.loose.id}"})
        self.assertEqual(payload["hidden"], 4)
        everything = self.graph(self.admin, "company")
        self.assertEqual(len(self.ids(everything, "customer")), 5)
        self.assertEqual(everything["hidden"], 0)

    def test_open_tasks_count_only_tasks_the_reader_may_read(self):
        due = self.today + timedelta(days=3)
        Task.objects.create(
            customer=self.pizza,
            title="Call",
            assignee_name="Carl CSM",
            due_date=due,
            priority="high",
            assignee=self.csm,
        )
        Task.objects.create(
            customer=self.pizza,
            title="Dana's",
            assignee_name="Dana CSM",
            due_date=due,
            priority="high",
            assignee=self.other,
            created_by=self.other,
        )
        payload = self.graph(self.csm, "me")
        (pizza,) = [n for n in payload["nodes"] if n["id"] == f"customer:{self.pizza.id}"]
        self.assertEqual(pizza["open_tasks"], 1)

    def test_initiatives_and_proposals_are_the_scopes(self):
        mine = self.initiative(self.csm, cut=self.csm, title="Halve my ARR at risk")
        product = Initiative.objects.create(
            organisation=self.org,
            title="Fix Product B",
            metric="at_risk_arr",
            dimension="product",
            member="999",
            member_label="Product B",
            target_value=Decimal("0"),
            target_by=self.today + timedelta(days=60),
            owner=self.csm,
            baseline_as_of=self.today,
        )
        theirs = self.initiative(self.other, cut=self.other, title="Dana's")
        self.initiative(self.csm, cut=self.csm, status="done", closed_days_ago=2)
        on_pizza = self.proposal(self.pizza, "Save play on Pizza Hut")
        self.proposal(self.taco, "Save play on Taco Bell")
        payload = self.graph(self.csm, "me")
        by = {n["id"]: n for n in payload["nodes"]}
        edges = {(e["from"], e["to"], e["kind"]) for e in payload["edges"]}
        self.assertEqual(
            self.ids(payload, "initiative"),
            {f"initiative:{mine.id}", f"initiative:{product.id}"},
        )
        self.assertNotIn(f"initiative:{theirs.id}", by)
        self.assertEqual(by[f"initiative:{mine.id}"]["member_label"], "Carl CSM")
        self.assertIn((f"initiative:{mine.id}", f"owner:{self.csm.id}", "targets"), edges)
        # A product cut's label is delivery 3's Company figure: not for Carl.
        self.assertIsNone(by[f"initiative:{product.id}"]["member_label"])
        self.assertEqual(self.ids(payload, "proposal"), {f"proposal:{on_pizza.id}"})
        self.assertIn((f"proposal:{on_pizza.id}", f"customer:{self.pizza.id}", "acts_on"), edges)

    def test_open_to_every_member_while_metrics_graph_stays_gated(self):
        payload = self.graph(self.other, "me")
        self.assertEqual(self.ids(payload, "customer"), {f"customer:{self.taco.id}"})
        self.assertEqual(self.as_user(self.other).get("/api/v1/metrics/graph/").status_code, 403)
        self.assertEqual(self.as_user(self.admin).get("/api/v1/metrics/graph/").status_code, 200)

    def test_a_scope_the_reader_may_not_use_is_refused(self):
        response = self.as_user(self.csm).get(f"{GRAPH}?scope=company")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "SCOPE_NOT_ALLOWED")
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_graph --parallel --noinput`
Expected: 404s on `/api/v1/brain/graph/` (assertion `200 != 404`).

- [ ] **Step 3: Split `services/metrics/graph.py`**

Replace everything from `def build_graph(organisation):` to the end of the file with:

```python
def customer_part(organisation, customers, viewer, *, tasks=None):
    """Customer, product and owner nodes for `customers`, their figures the
    forecast's as `viewer` counts them, capped at CUSTOMER_LIMIT by ARR.
    `open_tasks` counts open tasks among `tasks` (default: every task).
    Returns `(nodes, edges, products, owners, customer_ids)`."""
    rows = forecast.build_rows(
        list(customers), organisation, viewer=viewer, horizon=forecast.horizon_days({})
    )
    rows.sort(key=lambda r: -r.arr)
    rows = rows[:CUSTOMER_LIMIT]
    tasks = Task.objects.all() if tasks is None else tasks
    open_tasks = {
        t["customer_id"]: t["n"]
        for t in tasks.filter(customer__in=[r.customer for r in rows])
        .exclude(status=Task.Status.COMPLETED)
        .values("customer_id")
        .annotate(n=Count("id"))
    }

    nodes, edges = [], []
    products, owners = {}, {}
    for row in rows:
        c = row.customer
        nodes.append(
            _node(
                "customer",
                c.id,
                c.name,
                arr=round(row.arr, 2),
                downside=round(row.downside, 2),
                risk=row.risk,
                health_category=c.health_category,
                health_score=number(c.health_score),
                days_to_renewal=row.days_to_renewal,
                open_tasks=open_tasks.get(c.id, 0),
            )
        )
        if c.primary_product_id:
            p = products.setdefault(
                c.primary_product_id,
                {"label": c.primary_product.name, "customers": 0, "arr": 0.0, "downside": 0.0},
            )
            p["customers"] += 1
            p["arr"] += row.arr
            p["downside"] += row.downside
            edges.append(_edge(f"customer:{c.id}", f"product:{c.primary_product_id}", "runs_on"))
        if c.owner_id:
            o = owners.setdefault(
                c.owner_id, {"label": c.owner.name, "customers": 0, "arr": 0.0, "downside": 0.0}
            )
            o["customers"] += 1
            o["arr"] += row.arr
            o["downside"] += row.downside
            edges.append(_edge(f"owner:{c.owner_id}", f"customer:{c.id}", "owns"))

    for pk, p in sorted(products.items(), key=lambda kv: -kv[1]["downside"]):
        nodes.append(
            _node(
                "product",
                pk,
                p["label"],
                customers=p["customers"],
                arr=round(p["arr"], 2),
                downside=round(p["downside"], 2),
            )
        )
    for pk, o in sorted(owners.items(), key=lambda kv: -kv[1]["downside"]):
        nodes.append(
            _node(
                "owner",
                pk,
                o["label"],
                customers=o["customers"],
                arr=round(o["arr"], 2),
                downside=round(o["downside"], 2),
            )
        )
    return nodes, edges, products, owners, {r.customer.id for r in rows}


def initiative_part(initiatives, products, owners, *, label_shown=None):
    """Initiative nodes and their `targets` edges. Where
    `label_shown(initiative)` is False, the cut's `member_label` is None and
    no edge names it (default: always shown)."""
    nodes, edges = [], []
    for i in initiatives:
        metric = BY_KEY.get(i.metric)
        shown = label_shown is None or label_shown(i)
        nodes.append(
            _node(
                "initiative",
                i.id,
                i.title,
                status=i.status,
                metric=i.metric,
                metric_label=metric.label if metric else i.metric,
                member_label=i.member_label if shown else None,
                target_value=number(i.target_value),
                target_by=i.target_by.isoformat(),
                owner=i.owner.name if i.owner_id else None,
            )
        )
        if not shown:
            continue
        if i.dimension == PRODUCT and i.member.isdigit() and int(i.member) in products:
            edges.append(_edge(f"initiative:{i.id}", f"product:{i.member}", "targets"))
        elif i.dimension == OWNER and i.member.isdigit() and int(i.member) in owners:
            edges.append(_edge(f"initiative:{i.id}", f"owner:{i.member}", "targets"))
    return nodes, edges


def proposal_part(proposals, customer_ids, initiative_ids, *, session_title=None):
    """Proposal nodes and their `acts_on` / `serves` edges.
    `session_title(proposal)` names the session a proposal came from
    (default: its conversation's title)."""
    nodes, edges = [], []
    for p in proposals:
        title = None
        if p.session_id:
            title = session_title(p) if session_title is not None else p.session.conversation.title
        nodes.append(_node("proposal", p.id, p.title, proposal_kind=p.kind, from_session=title))
        if p.kind == Proposal.Kind.TASK and p.action.get("customer_id") in customer_ids:
            edges.append(
                _edge(f"proposal:{p.id}", f"customer:{p.action['customer_id']}", "acts_on")
            )
        if p.initiative_id in initiative_ids:
            edges.append(_edge(f"proposal:{p.id}", f"initiative:{p.initiative_id}", "serves"))
    return nodes, edges


def payload(organisation, nodes, edges):
    return {
        "as_of": as_of().isoformat(),
        "currency": organisation.currency,
        "nodes": nodes,
        "edges": edges,
    }


def build_graph(organisation):
    """The whole organisation's graph, read as itself (`/metrics/graph/`)."""
    actor = SystemActor(organisation)
    nodes, edges, products, owners, customer_ids = customer_part(
        organisation, forecast.filtered_customers(actor, {}), actor
    )
    initiatives = list(
        Initiative.objects.filter(
            organisation=organisation,
            status__in=[Initiative.Status.PLANNED, Initiative.Status.ACTIVE],
        ).select_related("owner")
    )
    more, links = initiative_part(initiatives, products, owners)
    nodes, edges = nodes + more, edges + links
    proposals = Proposal.objects.filter(
        organisation=organisation, status=Proposal.Status.PROPOSED
    ).select_related("session__conversation")
    more, links = proposal_part(proposals, customer_ids, {i.id for i in initiatives})
    return payload(organisation, nodes + more, edges + links)
```

Run: `venv/bin/python manage.py test services.metrics.tests.test_graph --parallel --noinput`
Expected: PASS. `/metrics/graph/` output is unchanged.

- [ ] **Step 4: Write `services/brain/graph.py`**

```python
"""The knowledge graph for a Brain scope (spec: react-ts-app docs/
superpowers/specs/2026-10-05-brain-customers-design.md §1.4).

The scope's live customers the reader may open, capped at 200 by ARR,
with figures counted as the reader (as `brain/exposure.py` counts them),
never as the organisation; open tasks only those the reader may read. The
scope's open initiatives (delivery 3's `initiatives_in`), with the cut's
label only where delivery 3 shows it, and its waiting proposals the reader
may open (delivery 2's desk), the session title only to those who see the
conversation whole. `hidden` counts the scope's customers the reader can't
open. Figures reuse the forecast, whose own `.distinct()` over the
opportunity/risk-to-account M2M is a legitimate fan-out dedup, not a
visibility filter (see `doing.py`)."""

from services.accounts.hierarchy import subtree_ids
from services.copilot.views import NEUTRAL_TITLE
from services.customers import forecast
from services.customers.models import Task
from services.customers.personal import visible_tasks
from services.customers.scoping import visible_customers
from services.metrics.graph import customer_part, initiative_part, payload, proposal_part

from . import desk
from .doing import OPEN_INITIATIVES, figures_shown, initiatives_in
from .scope import COMPANY, available


def build(reader, scope, today):
    organisation = reader.organisation
    in_book = forecast.filtered_customers(scope.actor, {})
    # SOC2:AUTH-02 a customer is drawn only if the reader may open it, and
    # its figures are counted as the reader
    shown = in_book.filter(id__in=visible_customers(reader).values("id"))
    hidden = in_book.count() - shown.count()
    # SOC2:AUTH-02 open tasks counted only where the reader may read them
    tasks = visible_tasks(reader, Task.objects.all())
    nodes, edges, products, owners, customer_ids = customer_part(
        organisation, shown, reader, tasks=tasks
    )

    initiatives = list(
        initiatives_in(reader, scope, today)
        .filter(status__in=OPEN_INITIATIVES)
        .select_related("owner")
    )
    people = (
        None
        if COMPANY in available(reader)
        else {str(pk) for pk in {reader.pk, *subtree_ids(reader)}}
    )
    # SOC2:AUTH-02 a cut's label goes where delivery 3 shows it (`figures_shown`)
    more, links = initiative_part(
        initiatives, products, owners, label_shown=lambda i: figures_shown(i, people)
    )

    sessions = desk.session_ids_seen_whole(reader)
    proposals = desk.proposals(reader, scope, sessions).readable.select_related(
        "session__conversation"
    )
    # SOC2:AUTH-02 a conversation's title is for those who see it whole
    more_p, links_p = proposal_part(
        proposals,
        customer_ids,
        {i.id for i in initiatives},
        session_title=lambda p: (
            p.session.conversation.title if p.session_id in sessions else NEUTRAL_TITLE
        ),
    )
    out = payload(organisation, nodes + more + more_p, edges + links + links_p)
    out["hidden"] = hidden
    return out
```

- [ ] **Step 5: The route**

In `services/brain/views.py`, change the module import to `from . import briefs, changed, customers, doing, explanations, graph, initiatives, waiting` and add after `CustomersView`:

```python
class GraphView(BrainView):
    """GET /api/v1/brain/graph/?scope= — the knowledge graph for the scope,
    for every member: the scope's customers the reader may open (the rest
    counted in `hidden`), its open initiatives and waiting proposals. The
    whole-organisation /api/v1/metrics/graph/ stays view_all_accounts."""

    def get(self, request):
        scope = self.scope(request)
        return Response(graph.build(request.user, scope, timezone.localdate()))
```

In `services/brain/urls.py`, add:

```text
    path("graph/", views.GraphView.as_view(), name="brain-graph"),
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.brain services.metrics --parallel --noinput`
Expected: all PASS.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/metrics/graph.py services/brain/graph.py services/brain/views.py \
  services/brain/urls.py services/brain/tests/test_graph.py
git commit -m "$(cat <<'EOF'
feat(brain): the knowledge graph for a scope, open to every member

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: End-to-end journeys and docs

**Files:**
- Test: `services/brain/tests/test_customers_e2e.py`
- Modify: `docs/API_CONTRACTS.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/data-classification.md`

**Interfaces:**
- Consumes: every route above; `CustomersFixture`.
- Produces: nothing new in code.

- [ ] **Step 1: Write the journeys**

`services/brain/tests/test_customers_e2e.py`:

```python
"""End to end over HTTP: the journeys the plan names. A CSM sees only their
book's asks and scores and their manager sees the team's; comments on
records a reader can't open are counted, never named; a contact turned
negative by a hand edit shows up; the scoped graph is open to a member; and
?scope= on /requests/ and /anomalies/ narrows while no scope is unchanged."""

from django.utils import timezone

from services.brain.tests.customers_fixtures import CustomersFixture

CUSTOMERS = "/api/v1/brain/customers/"


class CustomersEndToEndTests(CustomersFixture):
    def page(self, user, key):
        response = self.as_user(user).get(f"{CUSTOMERS}?scope={key}")
        self.assertEqual(response.status_code, 200, response.json())
        return response.json()

    def test_a_csm_sees_their_books_asks_and_scores_and_their_manager_the_teams(self):
        self.feature("SSO with Okta", self.pizza, self.soup)
        self.feature("Soup recipes API", self.soup)
        self.feature("Taco export", self.taco)
        csat = self.send("csat")
        self.answers(csat, self.pizza, [5, 5, 5, 5, 5])
        self.answers(csat, self.soup, [1, 1, 1, 1, 1])

        carl = self.page(self.csm, "me")
        self.assertEqual([row["title"] for row in carl["asks"]["top"]], ["SSO with Okta"])
        self.assertEqual(carl["asks"]["top"][0]["arr"], 300000.0)
        self.assertEqual(carl["scores"]["csat"]["now"], 100.0)
        self.assertEqual(carl["scores"]["csat"]["responses"], 5)

        mona = self.page(self.mona, "team")
        self.assertEqual(
            [row["title"] for row in mona["asks"]["top"]], ["SSO with Okta", "Soup recipes API"]
        )
        self.assertEqual(mona["asks"]["top"][0]["arr"], 350000.0)
        self.assertEqual(mona["scores"]["csat"]["now"], 50.0)
        self.assertEqual(mona["scores"]["csat"]["responses"], 10)

    def test_comments_on_records_the_reader_cant_open_are_counted_not_named(self):
        nps = self.send("nps")
        self.answer(nps, self.pizza, 3, comment="Support is slow lately.")
        self.answer(nps, self.loose, 10, comment="Lovely team.")
        scores = self.page(self.lee, "company")["scores"]
        self.assertEqual([c["comment"] for c in scores["comments"]], ["Lovely team."])
        self.assertEqual(scores["hidden"], 1)
        everything = self.page(self.admin, "company")["scores"]
        self.assertEqual(len(everything["comments"]), 2)
        self.assertEqual(everything["hidden"], 0)

    def test_a_contact_turned_negative_by_hand_is_listed(self):
        olivia = self.contact(self.pizza, "Olivia Park")
        before = self.page(self.csm, "me")["sentiment"]
        self.assertEqual(before, {"negative": 0, "tracking_since": None, "turned_negative": []})
        response = self.as_user(self.csm).patch(
            f"/api/v1/contacts/{olivia.id}/", {"sentiment": "negative"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        after = self.page(self.csm, "me")["sentiment"]
        self.assertEqual(after["negative"], 1)
        self.assertEqual(after["tracking_since"], timezone.localdate().isoformat())
        (row,) = after["turned_negative"]
        self.assertEqual(row["contact"], {"id": olivia.id, "name": "Olivia Park"})
        self.assertEqual(
            row["record"], {"type": "customer", "id": self.pizza.id, "name": "Pizza Hut"}
        )
        self.assertEqual(row["previous"], "neutral")
        # Dana's Me holds none of it.
        self.assertEqual(self.page(self.other, "me")["sentiment"]["turned_negative"], [])

    def test_the_scoped_graph_is_open_to_a_member(self):
        response = self.as_user(self.other).get("/api/v1/brain/graph/?scope=me")
        self.assertEqual(response.status_code, 200, response.json())
        customers = {n["label"] for n in response.json()["nodes"] if n["kind"] == "customer"}
        self.assertEqual(customers, {"Taco Bell"})
        self.assertEqual(self.as_user(self.other).get("/api/v1/metrics/graph/").status_code, 403)

    def test_scope_narrows_requests_and_anomalies_while_no_scope_is_unchanged(self):
        self.feature("Taco export", self.taco, self.east)
        self.anomaly("Invoices doubled at Taco Bell", self.taco)
        client = self.as_user(self.csm)
        # Without a scope Carl reads Taco Bell through his Taco East.
        self.assertEqual(
            [r["title"] for r in client.get("/api/v1/requests/").json()], ["Taco export"]
        )
        self.assertEqual(len(client.get("/api/v1/anomalies/").json()), 1)
        (scoped,) = client.get("/api/v1/requests/?scope=me").json()
        self.assertEqual((scoped["interactions"], float(scoped["arr"])), (1, 0.0))
        self.assertEqual(client.get("/api/v1/anomalies/?scope=me").json(), [])
        page = self.page(self.csm, "me")
        self.assertEqual(page["asks"]["total"], 1)
        self.assertEqual(page["anomalies"], {"total": 0, "top": []})
```

- [ ] **Step 2: Run them**

Run: `venv/bin/python manage.py test services.brain.tests.test_customers_e2e --parallel --noinput`
Expected: PASS, since Tasks 1–6 are already in. If a journey fails, the defect is in the task that owns that behaviour. Fix it there, not by loosening the journey.

- [ ] **Step 3: API_CONTRACTS**

In `docs/API_CONTRACTS.md`:

- Rename the heading `## \`brain\` — Scopes, What changed, Waiting on you and What's being done (\`/brain\`)` to `## \`brain\` — Scopes, What changed, Waiting on you, What's being done and What customers are saying (\`/brain\`)`.
- Insert, directly before the `---` that ends the brain section (after `### \`PATCH /api/v1/brain/initiatives/<id>/\``):

````markdown
### `GET /api/v1/brain/customers/?scope=me|team|company`

Delivery 4 (spec: react-ts-app
`docs/superpowers/specs/2026-10-05-brain-customers-design.md` §1.3, §3).
Any member; the usual scope refusals. What the scope's customers are
asking for, what is going wrong across them, how they score us and who
turned negative. Everything is counted and named by the reader's own
rights:

- **`asks`, `anomalies`.** These are the top 5 rows of `/requests/?scope=` and `/anomalies/?scope=` (same order, all statuses), and `total` is the scoped list's length.
  - `arr` is a number here: the ARR column sum, not FX-converted, over the book's customers the reader may open. An account's ask counts only its parent organisations that are in the book.
  - Anomaly titles are gated as on `/anomalies/`.
- **`scores`.** Answered survey invites on the scope's book, from sends the reader may read (`readable_send_ids`), on records the reader may open.
  - `now` is answers since the start of `today − 90` days; `then` is the 90 days before.
  - `now`/`then` are `null` under 5 responses in their window. NPS is an integer, CSAT and CES are percentages.
  - CES counts organisation-level answers only.
- **`scores.comments`.** The 5 newest non-empty comments of the `now` window, on records the reader may open. `hidden` counts the window's other comments, on records they can't open.
- **`sentiment`.** Contacts on the book's records that the reader may open.
  - `negative` is how many of them are negative now.
  - `turned_negative` lists up to 10 whose sentiment is now negative and changed in the last 30 days, newest first, with the value it replaced.
  - `tracking_since` is the first recorded change among contacts the reader may open, or `null` before any.

```json
{"scope": "me", "currency": "USD",
 "asks": {"total": 7, "top": [{"id": 2, "title": "SSO with Okta", "status": "planned",
   "arr": 182000.0, "companies": 3, "last_90_days": 12, "previous_90_days": 7}]},
 "anomalies": {"total": 1, "top": [{"id": 4,
   "title": "Similar reports across 2 of your companies", "status": "live",
   "arr": 90000.0, "companies": 2, "last_seen_at": "2026-10-04T10:00:00Z"}]},
 "scores": {
   "nps": {"now": 18, "then": 25, "responses": 22, "previous_responses": 19},
   "csat": {"now": 82.5, "then": 80.0, "responses": 40, "previous_responses": 31},
   "ces": {"now": null, "then": null, "responses": 3, "previous_responses": 0},
   "comments": [{"survey_type": "nps", "score": 4, "comment": "Support is slow lately.",
     "record": {"type": "customer", "id": 3, "name": "Uber"},
     "answered_at": "2026-10-03T08:00:00Z"}],
   "hidden": 0},
 "sentiment": {"negative": 4, "tracking_since": "2026-10-20",
   "turned_negative": [{"contact": {"id": 41, "name": "Olivia Park"},
     "record": {"type": "customer", "id": 6, "name": "Apple Inc"},
     "previous": "neutral", "changed_at": "2026-10-22T07:00:00Z"}]}}
```

### `GET /api/v1/brain/graph/?scope=me|team|company`

Any member; the usual scope refusals. The `/metrics/graph/` shape (`as_of`,
`currency`, `nodes`, `edges`) for the scope, plus `hidden`:

- **Customers.** The scope's live customers the reader may open, capped at 200 by ARR, with figures counted as the reader. `open_tasks` counts only tasks the reader may read. `hidden` is the scope's customers the reader can't open; it is non-zero only in Company for a reader without `view_all_accounts`.
- **Initiatives.** The scope's open initiatives (owned by the desk or tracking a desk person's cut; Company: all). A cut's `member_label` and its `targets` edge appear only where `doing/` shows the cut.
- **Proposals.** The scope's waiting proposals the reader may open (`waiting/`'s rule). `from_session` is the conversation's title only for readers who see it whole, and "Shared conversation" (`NEUTRAL_TITLE`) otherwise.

`/api/v1/metrics/graph/` is unchanged and stays `view_all_accounts`.
````

- In `### \`GET /api/v1/requests/?status=<status>\``: change the heading to `### \`GET /api/v1/requests/?status=<status>&scope=<scope>\`` and add after "Unpaginated, most revenue first:":

```markdown
`?scope=me|team|company` (optional, resolved like the Brain's: 400
`SCOPE_UNKNOWN`, 403 `SCOPE_NOT_ALLOWED`) narrows the evidence to that
scope's book before `arr`, `companies` and the counts are worked out; `arr`
then counts only the book's customers the reader may open, and a request
with no evidence left is dropped. Without it (or empty), as before.
```

- In `### \`GET /api/v1/requests/<id>/\`` add: `` `?scope=` narrows the same way; a request with no evidence left in the scope is a 404. `PATCH` answers with the unscoped detail. ``
- Make the same two edits to `### \`GET /api/v1/anomalies/?status=<status>\`` (heading `...?status=<status>&scope=<scope>`, "an anomaly with no evidence left is dropped; titles are gated exactly as without a scope") and `### \`GET /api/v1/anomalies/<id>/\`` ("404 `{"detail": "No reports you can read."}` when none is left in the scope").
- In `### \`GET /api/v1/metrics/graph/\``, after "Frontend: `/brain/graph`." add: `` Every member reads the scoped graph at `/api/v1/brain/graph/?scope=`. ``

- [ ] **Step 4: Product docs and classification**

`docs/product/05-backend-schema.md`, the `Contact` row (line ~210): after `` `sentiment_computed_at`, `` insert `` `previous_sentiment` (the value the last change replaced; blank before any), `sentiment_changed_at` (when; null before any) — set by `contact_sentiment.note_change` on a recompute or a hand edit that changes the value, ``.

`docs/product/01-prd.md`:
- After the "Brain: What's being done" feature row (line ~186), add:
  `| Brain: What customers are saying (Me / My team / Company) | Built (backend) | The scope's top asks and anomalies (See all opens the full lists with the same scope), NPS / CSAT / CES over 90 days against the 90 before with the latest comments, and who turned negative in 30 days; revenue and scores only over records the reader may open, the rest counted. The knowledge graph takes the scope and is open to every member |`
- In the changelog after the delivery 3 line (line ~346), add:
  `| 2026-10-05 | Brain delivery 4: What customers are saying (backend); ?scope= on feature requests and anomalies; the knowledge graph scoped and open to every member; contacts keep their previous sentiment |`

`docs/product/02-trd.md`, after the `services/brain/initiatives.py` row (line ~125), add:

```markdown
| `services/brain/book.py` | A scope's book as `id IN` filters (`customers`, `accounts`, `q`), the set `ScopeActor` reads; narrows `/requests/` and `/anomalies/` on `?scope=` |
| `services/brain/http.py` | `ScopeRefusals` and `optional_scope`: the scope refusals shared by Brain routes and the lists that take `?scope=` |
| `services/brain/customers.py` | What customers are saying: a scope's asks, anomalies, survey scores (from the answers, per window) and who turned negative, each counted only over what the reader may open |
| `services/brain/graph.py` | The knowledge graph for a scope, composed from `metrics/graph.py`'s parts with the delivery 2 and 3 rules |
```

`docs/data-classification.md`, the `customers.Contact` row: append to its notes ``; `previous_sentiment` / `sentiment_changed_at` keep one previous value and its time (no history beyond it), read only on the Brain's "turned negative" list for contacts the reader may open``. `audit-events.md` is unchanged: no new events.

- [ ] **Step 5: Full verification**

Run, one at a time:

```bash
venv/bin/python manage.py test services --parallel --noinput
venv/bin/ruff check . && venv/bin/ruff format --check .
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python scripts/ci_shard_labels.py --check 4
```

Expected:
- The whole suite passes.
- Ruff is clean.
- `No changes detected`.
- The shard check passes, with the new test modules discovered.

- [ ] **Step 6: Commit**

```bash
git add services/brain/tests/test_customers_e2e.py docs/API_CONTRACTS.md docs/product/01-prd.md \
  docs/product/02-trd.md docs/product/05-backend-schema.md docs/data-classification.md
git commit -m "$(cat <<'EOF'
docs(brain): What customers are saying contracts, schema and journeys

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage.**
- §0 (what exists): read and reused. Requests, anomalies, surveys, contact sentiment and graph are all built on, not rewritten.
- Decision 1 (four sections) → Tasks 4–5.
- Decision 2 (top 5 ranked by scope ARR, See all with the same scope) → Tasks 2–4 and Decision 3.
- Decision 3 (scores from the answers, comments) → Task 4.
- Decision 4 (previous sentiment, turned negative, "since we started tracking") → Tasks 1 and 5 (`tracking_since`).
- Decision 5 (graph takes the scope, open to everyone) → Task 6.
- Decision 6 (sidebar) is frontend only.
- §1.1 → Task 1. §1.2 → Tasks 2–3. §1.3 → Tasks 4–5. §1.4 → Task 6 (Contract note 6). §1.5 → Tasks 2, 3, 5 and 6.
- §1.6: no audit events (Contract note 5); docs → Task 7.
- §3 shapes → Task 5 (`customers/`) and Task 6 (`graph/` + `hidden`, Contract note 7).
- The caller's e2e list → Task 7, five journeys.

**Placeholder scan.** Every code step carries the code. Doc edits give the exact text.

**Type consistency.**
- `book.q` / `book.customers` / `book.accounts` take a `Scope | None` everywhere.
- `rows_for(reader, *, status=None, scope=None)` has the same signature in requests and anomalies, and `detail_for(reader, obj, *, scope=None)` is the same in both.
- `customer_part` returns a 5-tuple and both callers unpack five.
- `CustomersFixture.reader_and_scope` matches `DoingFixture.reader_and_scope`.
- `turned(contact, was, *, days_ago=1)` is used with those arguments in Tasks 5 and 7.
- `record(row)` serves invites and contacts, both of which have `customer_id`/`account_id`.

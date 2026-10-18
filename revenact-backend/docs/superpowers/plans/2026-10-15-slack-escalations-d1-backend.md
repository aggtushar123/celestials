# Slack escalations, delivery 1 (backend): Slack as a conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Slack thread in a connected channel is stored as one `SlackConversation` (its top message and replies), filed on the customer the channel is set to or the one customer its message names, shown under the organisation's Conversations as a Slack thread and readable whole; nothing about Slack is a ticket any more. A thread naming no customer (or several) waits in "Needs a customer", colleagues' messages included, with the customers it mentions; matching it makes a conversation. Agents read a conversation's messages and answer with `slack.reply` in its thread. Existing Slack tickets are moved to conversations.

**Architecture:** One new model, `customers.SlackConversation` (`services/customers/models.py`), with its visibility rule beside `visible_tickets` (`personal.visible_conversations`). `SlackProvider.fetch_threads` replaces `fetch_tickets` for Slack (a 7-day re-read and replies for threads that moved); `sync.sync_connector` hands a Slack connector to the new `sync.sync_conversations` / `file_conversation`, which find the customer with the connection's scope or `connectors/naming.py`, else keep an `UnmatchedItem` with `candidates`. `SignalThread.conversation` and `threads.touch_conversation` feed the intake; `evidence._thread` gives a Slack thread its own lines and `ctx.thread_slack`, which `outside/offered.py` and `actions/slack_replies.py` read. The story gains source `slack`; `GET /api/v1/slack-conversations/<id>/` reads one thread. A data migration moves Slack tickets.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15), stdlib `urllib` for vendor calls (no SDKs). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-15-slack-escalations-design.md` §3 (D1) and §15 (revisions), on the frontend branch `feat/slack-escalations-d1`. **Binding contract:** `docs/superpowers/plans/2026-10-15-slack-escalations-d1-api.md` (this repo). Read its "What the merged code does today" and "Decisions narrowing the spec" (SE1-1 to SE1-21) before any task; every decision is a requirement here. The agent bundles contracts and their as-built record in `docs/API_CONTRACTS.md` still hold where D1 does not change them.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/slackd1-be` on branch `feat/slack-escalations-d1` (cut from main 13da87a: R2-D3 #120 merged; its first commit holds this plan and the contract). Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them).
- Python: the venv link exists (`venv -> ../main-be/venv`; the `venv/` ignore rule does not match a symlink: never `git add` it). Written `PY` below: `PY=venv/bin/python`. Ruff: `venv/bin/ruff`.
- `.env` points at the shared dev database `revenact`: **never migrate it, never write to it.** Tests use their own test database; read-only shell queries are fine.
- Run tests as `$PY manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially (it passes the 30-minute mark).
- **Mac hang workaround:** a `--parallel auto` run sometimes stalls on the Metal lock (no new output, CPU idle). If a run shows **no progress for about 10 minutes**, kill it (`pkill -f "manage.py test"`) and run the same command again. A second stall on the same labels is a real hang: run those labels with `--parallel 1` to find the test.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (`ruff format` also formats Python blocks inside Markdown; run `venv/bin/ruff format .` if the check fails, docs included).
- Every commit message is a conventional commit (`commit-messages` skill) and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths (`git add <paths>`, `git rm` for deletions); never `git add -A` or `git add .`. Never `git stash` (shared across worktrees).
- **CI is blocked by GitHub billing:** local checks are the gate. A task is done only when its tests pass locally; the last task runs the full suite (`--parallel auto`), `makemigrations --check`, `manage.py spectacular` and ruff.
- **Nothing real is ever sent.** Slack through `FakeSlackApi` (`use_slack`, `services/connectors/tests/slack_fake.py`), Jira through `FakeJiraApi`; no test opens a socket to Slack, Atlassian, Google or Microsoft; **no test calls a model** (`services.agents.intake.get_completion` and `services.customers.classification.get_completion` are always patched).
- **Postgres 16:** no visibility rule may be a join made unique with `DISTINCT`; use plain column filters or `id IN (subquery)`. Query counts are pinned (Task 12).
- Every visibility filter and gate carries `# SOC2:AUTH-02 ...`; every audited write `# SOC2:LOG-01`; minimisation `# SOC2:DATA-04`. **Never** message text, a title or an email in audit metadata or a log line (log the exception's class name only).
- **Twice-filter (SE1-21):** an agent reads only a filed conversation's own messages; an unmatched row is never read by a model.
- User-facing sentences are exactly the contract's. No em dash in any sentence a person reads.
- No new dependency, no new env var, no new Slack scope. Migrations: `customers.0062_slackconversation`, `connectors.0007_unmatched_candidates`, `agents.0007_signal_thread_conversation`, `agents.0008_slack_tickets_to_conversations` (names may differ by `makemigrations`; keep its numbering, and write the data migration by hand).
- **Product documents rule:** `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `.soc2/CONTROL_MAP.md` and the flow docs `.agents/workflows/agent-intake-flow.md` and `agent-outside-flow.md` are updated in this PR (Task 13).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/customers/models.py`, `migrations/0062_slackconversation.py` | modify/create | `SlackConversation` (contract §1.1) |
| `services/customers/personal.py` | modify | `visible_conversations` (SE1-15) |
| `services/connectors/providers/base.py` | modify | `RemoteThread` |
| `services/connectors/providers/slack.py` | modify | `fetch_threads`, replies, `ts_time`, connect's membership check; `fetch_tickets`, `DONE_REACTIONS`, `URGENT_WORDS`, `_ticket` go |
| `services/connectors/tests/slack_fake.py` | modify | parents carry `reply_count`/`latest_reply`; replies include the parent; `is_member`, `is_ext_shared`; per-user profiles |
| `services/connectors/naming.py` | create | name folding and matching (SE1-7) |
| `services/connectors/models.py`, `migrations/0007_unmatched_candidates.py` | modify/create | `UnmatchedItem.candidates` |
| `services/connectors/unmatched.py` | modify | Slack keeps colleagues, `#channel`, `candidates`, `mentioned`; match makes a conversation |
| `services/connectors/sync.py` | modify | `_scoped`, `sync_conversations`, `file_conversation` |
| `services/agents/models.py`, `migrations/0007_signal_thread_conversation.py` | modify/create | `SignalThread.conversation` |
| `services/agents/threads.py`, `fast_lane.py` | modify | `touch_conversation`, `for_conversation` |
| `services/agents/intake.py`, `evidence.py`, `outside/offered.py`, `actions/slack_replies.py`, `prompt.py` | modify | agents read conversations (SE1-13) |
| `services/agents/migrations/0008_slack_tickets_to_conversations.py` | create | the data migration (SE1-18) |
| `services/work/unmatched_views.py` | modify | the match answer (SE1-11) |
| `services/organizations/story/params.py`, `sources.py`, `items.py` | modify | story kind `slack` |
| `services/copilot/organization_detail_grounding.py` | modify | `KIND_LABELS["slack"]` |
| `services/customers/slack_views.py`, `config/urls.py` | create/modify | `GET /api/v1/slack-conversations/<id>/` |
| tests | create/modify | listed per task |
| `e2e/test_slack_conversations_flow.py` | create | the journey |
| docs | modify | Task 13 |

## Shared test fixtures (existing, extended here)

- `services/agents/tests/intake_fixtures.py` `IntakeFixture`: Carl (`self.csm`, CS, owns Pizza Hut `self.pizza`), Mona, Dana (`self.other`), Alice (`self.admin`, admin, view-all, Leadership), Lee (Leadership), Sam (Sales), Erin (`self.erin`, Engineering), `connector(provider, department)`, `ticket_thread(...)`, `message_bundle(thread, ...)`, `MODEL`, `QUIET_AGO`.
- `services/agents/tests/outside_fixtures.py` `OutsideFixture`: `slack_connector(...)`, `slack_thread(record, ...)` and `slack_payload(...)` (Task 7 moves both to conversations), `outside_bundle(thread, *steps)`.
- `services/connectors/tests/slack_fake.py` `FakeSlackApi` and `use_slack(testcase, fake=None)` (Task 2 extends it).
- `services/connectors/tests/unmatched_fixtures.py` `remote(**fields)`, `item(connector, **fields)`.
- `services/organizations/tests/story_fixtures.py` `StoryFixture` (`make(kind, parent)`, `base(kind, user)`, `story(user, **query)`; Task 9 adds the `slack` maker).
- New `services/customers/tests/slack_fixtures.py` (Task 1): `conversation(parent, connector=None, **fields)` and `msg(ts, name="Faiz", text="...", bot=False)`.

---

### Task 1: `SlackConversation` and who reads it

**Files:**
- Modify: `services/customers/models.py` (after `Ticket`), `services/customers/personal.py`
- Create: `services/customers/migrations/0062_slackconversation.py` (`makemigrations customers`), `services/customers/tests/slack_fixtures.py`, `services/customers/tests/test_slack_conversation_model.py`

**Interfaces:**
- Produces: `customers.models.SlackConversation` (fields per contract §1.1; `MatchedBy` choices `channel`, `name`, `person`, `earlier`; `record` property; constants `MAX_MESSAGES = 50`, `TEXT_CHARS = 3000`).
- Produces: `personal.visible_conversations(user, queryset)`.
- Produces (tests): `slack_fixtures.conversation(parent, connector=None, **fields) -> SlackConversation`, `slack_fixtures.msg(ts, name="Faiz Jamal", text="Exports fail.", bot=False) -> dict`.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/slack_fixtures.py`:

```python
"""Slack conversations for tests (Slack escalations D1): fake channels, fake
people, nothing read from Slack."""

from itertools import count

from django.utils import timezone

from services.customers.models import Account, SlackConversation

_n = count(1)


def msg(ts, name="Faiz Jamal", text="Exports fail since this morning.", bot=False):
    return {"ts": ts, "user_id": "" if bot else "U0FAIZ", "name": name, "text": text, "bot": bot}


def conversation(parent, connector=None, **fields):
    """A conversation filed on `parent` (a Customer or an Account)."""
    n = next(_n)
    ts = fields.pop("thread_ts", f"17920414{n:02d}.000100")
    values = {
        "connector": connector,
        "department": connector.department if connector is not None else "",
        "channel": "C0SUPPORT",
        "channel_name": "support",
        "thread_ts": ts,
        "title": "Exports fail since this morning.",
        "messages": [msg(ts)],
        "started_by_name": "Faiz Jamal",
        "started_by_email": "faiz@example.com",
        "url": f"https://slack.com/archives/C0SUPPORT/p{ts.replace('.', '')}",
        "last_message_at": timezone.now(),
        "matched_by": SlackConversation.MatchedBy.NAME,
    }
    values.update(fields)
    on = {"account": parent} if isinstance(parent, Account) else {"customer": parent}
    return SlackConversation.objects.create(**on, **values)
```

Create `services/customers/tests/test_slack_conversation_model.py`:

```python
"""Slack escalations D1 contract §1.1, SE1-2, SE1-15: one row per thread,
on exactly one record, read department-wise."""

from django.db import IntegrityError, transaction

from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import SlackConversation
from services.customers.personal import visible_conversations
from services.customers.tests.slack_fixtures import conversation


class SlackConversationModelTests(IntakeFixture):
    def test_one_row_per_thread_of_a_connection(self):
        slack = self.connector("slack", "cs")
        conversation(self.pizza, slack, thread_ts="1.1")
        with self.assertRaises(IntegrityError), transaction.atomic():
            conversation(self.pizza, slack, thread_ts="1.1")
        # A removed connection keeps its history: two rows with no connector may share a ts.
        conversation(self.pizza, None, thread_ts="2.1")
        conversation(self.pizza, None, thread_ts="2.1")

    def test_exactly_one_parent(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            SlackConversation.objects.create(
                channel="C1", thread_ts="3.1", title="x", last_message_at=self.pizza.created_at
            )

    def test_the_record_is_the_account_when_set(self):
        made = conversation(self.pizza)
        self.assertEqual(made.record, self.pizza)

    def test_read_by_its_department_and_leadership(self):
        cs = conversation(self.pizza, self.connector("slack", "cs"))
        engineering = conversation(self.pizza, self.connector("slack", "engineering"))
        everyone = conversation(self.pizza, self.connector("slack", ""))
        rows = SlackConversation.objects.all()
        self.assertEqual(set(visible_conversations(self.csm, rows)), {cs, everyone})  # Carl is CS
        self.assertEqual(set(visible_conversations(self.erin, rows)), {engineering, everyone})
        self.assertEqual(set(visible_conversations(self.admin, rows)), {cs, engineering, everyone})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.customers.tests.test_slack_conversation_model --parallel auto --noinput`
Expected: FAIL: `ImportError: cannot import name 'SlackConversation'`.

- [ ] **Step 3: The model and the rule**

In `services/customers/models.py`, after `class Ticket`:

```python
class SlackConversation(models.Model):
    """One Slack thread a tenant's colleagues had about a customer (Slack
    escalations D1, contract §1.1). Never a ticket: no number, no status, no
    priority. Not AIClassified: a colleague's words are not the customer's
    voice, so it feeds no sentiment, pulse or topic chart (SE1-2).

    `messages` keeps the top message and the newest 49 replies, oldest first,
    each {ts, user_id, name, text, bot}, text cut at 3,000 characters; no
    per-message email (SOC2:DATA-04 minimised, SE1-3). Read department-wise,
    like the tickets of its connection (personal.visible_conversations)."""

    MAX_MESSAGES = 50
    TEXT_CHARS = 3000

    class MatchedBy(models.TextChoices):
        CHANNEL = "channel", "The channel is set to it"
        NAME = "name", "The message names it"
        PERSON = "person", "Matched by hand"
        EARLIER = "earlier", "Filed before conversations"

    customer = models.ForeignKey(
        Customer,
        related_name="slack_conversations",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    account = models.ForeignKey(
        Account,
        related_name="slack_conversations",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    connector = models.ForeignKey(
        "connectors.Connector",
        related_name="slack_conversations",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="SET_NULL: removing a connection keeps its history.",
    )
    department = models.CharField(max_length=16, blank=True, default="")
    channel = models.CharField(max_length=32)
    channel_name = models.CharField(max_length=80, blank=True, default="")
    thread_ts = models.CharField(max_length=32)
    title = models.CharField(max_length=255)
    messages = models.JSONField(default=list, blank=True)
    latest_reply = models.CharField(max_length=32, blank=True, default="")
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    started_by_name = models.CharField(max_length=150, blank=True, default="")
    started_by_email = models.EmailField(blank=True, default="")
    url = models.URLField(max_length=500, blank=True, default="")
    last_message_at = models.DateTimeField()
    matched_by = models.CharField(max_length=8, choices=MatchedBy.choices)
    external_shared = models.BooleanField(default=False)
    synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_message_at", "-id"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(customer__isnull=False, account__isnull=True)
                    | models.Q(customer__isnull=True, account__isnull=False)
                ),
                name="slack_conversation_one_parent",
            ),
            models.UniqueConstraint(
                fields=["connector", "thread_ts"],
                condition=models.Q(connector__isnull=False),
                name="slack_conversation_once",
            ),
        ]
        indexes = [
            models.Index(fields=["customer", "last_message_at"], name="slack_conversation_story"),
            models.Index(
                fields=["account", "last_message_at"], name="slack_conversation_story_acct"
            ),
        ]

    def __str__(self):
        return f"Slack thread {self.pk}"  # never the title (it is message text)

    @property
    def record(self):
        return self.account if self.account_id is not None else self.customer
```

(`settings` is already imported in `services/customers/models.py`; check with `grep -n "^from django.conf import settings" services/customers/models.py`.)

In `services/customers/personal.py`, after `visible_tickets`:

```python
def visible_conversations(user, queryset):
    """Slack conversations are read like the tickets of their connection
    (Slack escalations D1, SE1-15): their department's people and Leadership;
    a conversation with no department is everyone's."""
    # SOC2:AUTH-02 object-level rule for departmental Slack conversations
    return visible_tickets(user, queryset)
```

Run: `$PY manage.py makemigrations customers --name slackconversation`

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.customers.tests.test_slack_conversation_model --parallel auto --noinput`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add services/customers/models.py services/customers/personal.py services/customers/migrations/0062_slackconversation.py services/customers/tests/slack_fixtures.py services/customers/tests/test_slack_conversation_model.py
git commit -m "feat(customers): Slack conversations, read department-wise

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The provider reads threads and replies

**Files:**
- Modify: `services/connectors/providers/base.py` (`RemoteThread`), `services/connectors/providers/slack.py`, `services/connectors/tests/slack_fake.py`
- Test: `services/connectors/tests/test_slack_threads.py` (create); `services/connectors/tests/test_tickets.py` (delete `test_slack_message_is_open_until_ticked_and_thread_replies_are_skipped`, which tested the ticket mapping that goes)

**Interfaces:**
- Produces: `providers.base.RemoteThread` (contract §2).
- Produces: `SlackProvider.fetch_threads(config, creds, *, known, now) -> (list[RemoteThread], newest_ts: str, external_shared: bool)`; `slack.ts_time(ts) -> datetime` (aware UTC); constants `WINDOW = timedelta(days=7)`, `MAX_REPLY_THREADS = 50`.
- Produces: `SlackProvider.connect` refuses a channel the bot is not in: `ProviderError("Invite the bot to #<name> first, then connect.")`; `config["external_shared"]`.
- Produces (fake): `FakeSlackApi.users` (user id -> profile), `FakeSlackApi.shared` (channel ids shared outside), `FakeSlackApi.say(channel, user, text, *, thread_ts=None) -> ts`.

- [ ] **Step 1: Extend the fake**

In `services/connectors/tests/slack_fake.py`:

1. In `__init__`, add:

```python
        #: user id -> users.info "user"; an unknown id answers Ann Lee (as before)
        self.users = {
            "U0ANN": {"real_name": "Ann Lee", "profile": {"email": "ann@pizzahut.com"}},
            "U0FAIZ": {"real_name": "Faiz Jamal", "profile": {"email": "faiz@acme.io"}},
        }
        #: channels shared outside the workspace (Slack Connect)
        self.shared = set()
```

2. Add a scripting helper under `posts`:

```python
    def say(self, channel, user, text, *, thread_ts=None):
        """A person's message (a top message, or a reply when `thread_ts`)."""
        self._ts += 1
        ts = f"{self._ts}.000200"
        message = {"ts": ts, "user": user, "text": text}
        if thread_ts:
            message["thread_ts"] = thread_ts
        self.channels[channel].append(message)
        return ts
```

3. `conversations.info` answers membership and sharing:

```python
            return {
                "ok": True,
                "channel": {
                    "id": channel,
                    "name": self.names[channel],
                    "is_member": channel in self.members,
                    "is_ext_shared": channel in self.shared,
                },
            }, {}
```

4. Replace the `conversations.replies` / `conversations.history` branch with one that follows Slack: a parent carries `thread_ts` equal to its own `ts`, `reply_count` and `latest_reply`; `conversations.replies` answers the parent first, then its replies:

```python
        if name in ("conversations.replies", "conversations.history"):
            channel = query.get("channel", "")
            oldest = float(query.get("oldest") or 0)
            thread = query.get("ts")
            every = self.channels.get(channel, [])

            def replies_of(ts):
                return [m for m in every if m.get("thread_ts") == ts and m["ts"] != ts]

            if thread:
                parent = [m for m in every if m["ts"] == thread]
                rows = parent + [m for m in replies_of(thread) if float(m["ts"]) >= oldest]
            else:
                rows = []
                for m in every:
                    if m.get("thread_ts") not in (None, m["ts"]) or float(m["ts"]) < oldest:
                        continue
                    found = replies_of(m["ts"])
                    if found:
                        m = {
                            **m,
                            "thread_ts": m["ts"],
                            "reply_count": len(found),
                            "latest_reply": max(r["ts"] for r in found),
                        }
                    rows.append(m)
            if query.get("include_all_metadata") != "true":
                rows = [{k: v for k, v in m.items() if k != "metadata"} for m in rows]
            offset = int(query.get("cursor") or 0)
            size = int(query.get("limit") or 100)
            more = offset + size < len(rows)
            answer = {"ok": True, "messages": rows[offset : offset + size], "has_more": more}
            if more:
                answer["response_metadata"] = {"next_cursor": str(offset + size)}
            return answer, {}
        if name == "users.info":
            user = self.users.get(
                query.get("user", ""),
                {"real_name": "Ann Lee", "profile": {"email": "ann@pizzahut.com"}},
            )
            return {"ok": True, "user": user}, {}
```

(The D3-11 Retry lookup, `find_message`, reads `conversations.replies` with `include_all_metadata`: the parent first is what Slack does too, and a parent carries no `revenact_step` metadata, so its lookups are unchanged. Run `services.agents.tests.test_slack_reply_kind` after this step to confirm.)

- [ ] **Step 2: Write the failing tests**

Create `services/connectors/tests/test_slack_threads.py`:

```python
"""Slack escalations D1 contract §2, SE1-4, SE1-17: the provider reads the
last 7 days of top messages, and a thread's replies only when it moved."""

from datetime import timedelta

from django.test import SimpleTestCase
from django.utils import timezone

from services.connectors.providers.base import ProviderError
from services.connectors.providers.slack import MAX_REPLY_THREADS, SlackProvider, ts_time
from services.connectors.tests.slack_fake import use_slack

CONFIG = {"channel": "C0SUPPORT", "channel_name": "support", "bot_name": "revenact"}
CREDS = {"bot_token": "xoxb-test-only"}


class FetchThreadsTests(SimpleTestCase):
    def setUp(self):
        self.slack = use_slack(self)
        self.now = timezone.now()

    def fetch(self, known=None):
        return SlackProvider().fetch_threads(CONFIG, CREDS, known=known or {}, now=self.now)

    def test_a_thread_with_its_replies_and_our_own_reply(self):
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Globex exports fail\nsince 9am")
        self.slack.say("C0SUPPORT", "U0ANN", "Same for me", thread_ts=top)
        self.slack.channels["C0SUPPORT"].append(
            {"ts": f"{top[:-7]}9.000900", "text": "On it.", "bot_id": "B0BOT", "thread_ts": top}
        )
        threads, newest, shared = self.fetch()
        (thread,) = threads
        self.assertEqual(
            (thread.thread_ts, thread.text, thread.user_name, thread.user_email),
            (top, "Globex exports fail\nsince 9am", "Faiz Jamal", "faiz@acme.io"),
        )
        self.assertEqual(
            [(r["name"], r["text"], r["bot"]) for r in thread.replies],
            [("Ann Lee", "Same for me", False), ("revenact", "On it.", True)],
        )
        self.assertEqual(thread.latest_reply, thread.replies[-1]["ts"])
        self.assertEqual(
            thread.url, f"https://slack.com/archives/C0SUPPORT/p{top.replace('.', '')}"
        )
        self.assertEqual((newest, shared), (top, False))

    def test_replies_are_fetched_only_when_the_thread_moved(self):
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Exports fail")
        reply = self.slack.say("C0SUPPORT", "U0ANN", "Same", thread_ts=top)
        (thread,), _, _ = self.fetch(known={top: reply})
        self.assertIsNone(thread.replies)  # unchanged: keep what is stored
        self.assertNotIn("conversations.replies", [c[0] for c in self.slack.calls])

    def test_a_thread_with_no_replies_has_none(self):
        self.slack.say("C0SUPPORT", "U0FAIZ", "Exports fail")
        (thread,), _, _ = self.fetch()
        self.assertEqual((thread.replies, thread.latest_reply), ([], ""))

    def test_only_the_last_seven_days_are_read(self):
        self.fetch()
        history = next(q for name, _b, q in self.slack.calls if name == "conversations.history")
        self.assertAlmostEqual(
            float(history["oldest"]), (self.now - timedelta(days=7)).timestamp(), places=0
        )

    def test_joins_bots_and_empty_messages_are_not_threads(self):
        channel = self.slack.channels["C0SUPPORT"]
        channel.append({"ts": "1792000001.000100", "subtype": "channel_join", "user": "U1"})
        channel.append({"ts": "1792000002.000100", "bot_id": "B0BOT", "text": "Brief"})
        channel.append({"ts": "1792000003.000100", "user": "U1", "text": ""})
        threads, _, _ = SlackProvider().fetch_threads(
            CONFIG, CREDS, known={}, now=ts_time("1792000004.000000")
        )
        self.assertEqual(threads, [])

    def test_at_most_fifty_threads_fetch_replies_a_pass(self):
        for _ in range(MAX_REPLY_THREADS + 2):
            top = self.slack.say("C0SUPPORT", "U0FAIZ", "Exports fail")
            self.slack.say("C0SUPPORT", "U0ANN", "Same", thread_ts=top)
        threads, _, _ = self.fetch()
        fetched = [t for t in threads if t.replies is not None]
        self.assertEqual(len(fetched), MAX_REPLY_THREADS)
        self.assertEqual([t.replies for t in threads[MAX_REPLY_THREADS:]], [None, None])

    def test_a_shared_channel_says_so(self):
        self.slack.shared.add("C0SUPPORT")
        self.assertTrue(self.fetch()[2])


class ConnectTests(SimpleTestCase):
    def setUp(self):
        self.slack = use_slack(self)

    def test_the_bot_must_be_in_the_channel(self):
        self.slack.members.discard("C0SUPPORT")
        with self.assertRaisesMessage(
            ProviderError, "Invite the bot to #support first, then connect."
        ):
            SlackProvider().connect({"channel": "C0SUPPORT", "bot_token": "xoxb-test-only"})

    def test_connect_stores_whether_the_channel_is_shared(self):
        self.slack.shared.add("C0SUPPORT")
        config, _ = SlackProvider().connect({"channel": "C0SUPPORT", "bot_token": "xoxb-test"})
        self.assertTrue(config["external_shared"])
        self.assertEqual(config["channel_name"], "support")
```

- [ ] **Step 3: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_threads --parallel auto --noinput`
Expected: FAIL: `ImportError: cannot import name 'MAX_REPLY_THREADS'`.

- [ ] **Step 4: `RemoteThread` and the provider**

In `services/connectors/providers/base.py`, under `RemoteTicket` (add `from datetime import datetime` to its `datetime` import if missing):

```python
@dataclass
class RemoteThread:
    """One Slack thread as the provider reads it (Slack escalations D1,
    contract §2). `replies` is None when they were not fetched this pass:
    keep what is stored."""

    thread_ts: str
    channel: str
    text: str
    user_id: str
    user_name: str
    user_email: str
    posted_at: datetime
    latest_reply: str
    replies: list | None
    url: str
```

In `services/connectors/providers/slack.py`:

1. Module docstring's first paragraph becomes: "Slack: every top-level message in one channel starts a conversation (Slack escalations D1). A pass reads the last 7 days of top messages and, for a thread whose latest reply moved, its replies. Connect with a bot token, or through OAuth when the deployment has a Slack app configured."
2. Imports: `from datetime import UTC, datetime, timedelta`; from `.base` import `RemoteThread` (and drop `RemoteTicket` if nothing else uses it there).
3. Remove `DONE_REACTIONS`, `URGENT_WORDS`, `fetch_tickets` and `_ticket`. Keep `"reactions:read"` in `SCOPES` (installed apps already hold it; dropping it would make every connection look under-granted; it is simply unused).
4. Add:

```python
#: Slack escalations D1 (SE1-4): each pass re-reads this window, so replies are seen.
WINDOW = timedelta(days=7)
MAX_REPLY_THREADS = 50
TEXT_CHARS = 3000


def ts_time(ts):
    """A Slack ts as an aware UTC datetime."""
    return datetime.fromtimestamp(float(ts), tz=UTC)
```

5. `help` becomes `"Invite the bot to the channel first. Leave the token blank to sign in with Slack when it is set up on this deployment."`
6. `connect` checks membership and stores sharing:

```python
    def connect(self, form, *, via="token"):
        channel = self._channel(form)
        token = (form.get("bot_token") or "").strip()
        if not token:
            raise ProviderError("A bot token is required unless you sign in with Slack.")
        creds = {"bot_token": token}
        me, scopes = self._auth_test(creds)
        found = self._call(creds, "conversations.info", channel=channel).get("channel") or {}
        name = found.get("name", "")
        if not found.get("is_member"):
            # SE1-17: the 2026-10-15 live test showed Connected while history said not_in_channel.
            raise ProviderError(f"Invite the bot to #{name or channel} first, then connect.")
        config = {
            "channel": channel,
            "channel_name": name,
            "team_id": me.get("team_id", ""),
            "bot_name": me.get("user", ""),
            "via": via,
            "scopes": scopes,
            "external_shared": bool(found.get("is_ext_shared")),
        }
        return config, creds
```

7. Add the reader:

```python
def _person(self, creds, user_id, people):
    """users.info's name and email for a poster, once per pass."""
    if user_id not in people:
        try:
            user = self._call(creds, "users.info", user=user_id).get("user", {})
        except ProviderError:
            user = {}
        profile = user.get("profile") or {}
        people[user_id] = {
            "name": user.get("real_name") or profile.get("real_name") or user.get("name", ""),
            "email": (profile.get("email") or "").lower(),
        }
    return people[user_id]


def _replies(self, creds, config, thread_ts, people):
    """A thread's replies, oldest first: people's and bots' (`bot`), never
    the parent, joins or empty text (SE1-4)."""
    out, cursor = [], None
    for _ in range(MAX_PAGES):
        page = self._call(
            creds,
            "conversations.replies",
            channel=config["channel"],
            ts=thread_ts,
            limit=PAGE,
            cursor=cursor,
        )
        for raw in page.get("messages", []):
            ts = str(raw.get("ts", ""))
            subtype = raw.get("subtype") or ""
            if ts == thread_ts or subtype not in ("", "bot_message") or not raw.get("text"):
                continue
            bot = bool(raw.get("bot_id")) or subtype == "bot_message"
            name = (
                config.get("bot_name") or "the Slack app"
                if bot
                else self._person(creds, raw.get("user", ""), people)["name"]
            )
            out.append(
                {
                    "ts": ts,
                    "user_id": "" if bot else str(raw.get("user", "")),
                    "name": name[:150],
                    "text": str(raw["text"])[:TEXT_CHARS],
                    "bot": bot,
                }
            )
        cursor = (page.get("response_metadata") or {}).get("next_cursor")
        if not page.get("has_more") or not cursor:
            break
    return sorted(out, key=lambda m: float(m["ts"]))


def fetch_threads(self, config, creds, *, known, now):
    """Contract §2: (threads oldest first, the newest top ts, whether the
    channel is shared outside). `known`: {thread_ts: latest_reply stored}."""
    channel = config["channel"]
    oldest = f"{(now - WINDOW).timestamp():.6f}"
    tops, cursor = [], None
    for _ in range(MAX_PAGES):
        page = self._call(
            creds,
            "conversations.history",
            channel=channel,
            oldest=oldest,
            limit=PAGE,
            cursor=cursor,
        )
        for raw in page.get("messages", []):
            ts = str(raw.get("ts", ""))
            if raw.get("subtype") or (raw.get("thread_ts") and raw["thread_ts"] != ts):
                continue
            # D3-26: a bot's post (Revenact's own, say) never starts a conversation.
            if raw.get("bot_id") or not raw.get("user") or not raw.get("text"):
                continue
            tops.append(raw)
        cursor = (page.get("response_metadata") or {}).get("next_cursor")
        if not page.get("has_more") or not cursor:
            break
    tops.sort(key=lambda raw: float(raw["ts"]))
    people, fetched, threads = {}, 0, []
    for raw in tops:
        ts = str(raw["ts"])
        latest = str(raw.get("latest_reply") or "")
        replies = [] if not latest else None
        if latest and latest != known.get(ts) and fetched < MAX_REPLY_THREADS:
            replies = self._replies(creds, config, ts, people)
            fetched += 1
        poster = self._person(creds, raw["user"], people)
        threads.append(
            RemoteThread(
                thread_ts=ts,
                channel=channel,
                text=str(raw["text"])[:TEXT_CHARS],
                user_id=str(raw["user"]),
                user_name=poster["name"][:150],
                user_email=poster["email"][:254],
                posted_at=ts_time(ts),
                latest_reply=latest if replies is not None else known.get(ts, ""),
                replies=replies,
                url=message_url(channel, ts),
            )
        )
    info = self._call(creds, "conversations.info", channel=channel).get("channel") or {}
    newest = threads[-1].thread_ts if threads else ""
    return threads, newest, bool(info.get("is_ext_shared"))
```

8. Delete `test_slack_message_is_open_until_ticked_and_thread_replies_are_skipped` from `services/connectors/tests/test_tickets.py` (and its now-unused `SlackProvider` import if nothing else there uses it).

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.connectors.tests.test_slack_threads services.connectors.tests.test_tickets services.agents.tests.test_slack_reply_kind services.agents.tests.test_slack_live_channels --parallel auto --noinput`
Expected: PASS. (`test_tickets` and the connect view tests may still build Slack tickets through `sync`: Task 6 moves the sync; any test here failing on `fetch_tickets` for Slack is rewritten in Task 6, not here. If one fails now, mark it with `@skip("Task 6 moves Slack to conversations")` and list it in the Task 6 hand-off; Task 6 removes every such skip.)

- [ ] **Step 6: Commit**

```bash
git add services/connectors/providers/base.py services/connectors/providers/slack.py services/connectors/tests/slack_fake.py services/connectors/tests/test_slack_threads.py services/connectors/tests/test_tickets.py
git commit -m "feat(connectors): Slack reads threads and their replies; connect checks the bot is in the channel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Finding the customer a message names

**Files:**
- Create: `services/connectors/naming.py`, `services/connectors/tests/test_naming.py`

**Interfaces:**
- Produces: `naming.fold(name) -> str`; `naming.Name` (frozen dataclass `folded: str`, `type: "customer" | "account"`, `id: int`, `label: str`, `parents: frozenset[int]`); `naming.covered_names(connector) -> list[Name]` (two queries); `naming.find(text, names) -> tuple[Name | None, list[Name]]` (the one match, or None and up to 5 candidates).

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_naming.py`:

```python
"""Slack escalations D1 SE1-7: which customer a colleague's message names."""

from django.test import SimpleTestCase

from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors.naming import Name, covered_names, find, fold
from services.customers.models import Account, Customer


def name(label, type_="customer", id_=1, parents=()):
    return Name(fold(label), type_, id_, label, frozenset(parents))


class FoldTests(SimpleTestCase):
    def test_suffixes_and_case(self):
        self.assertEqual(fold("Globex (QA)"), "globex")
        self.assertEqual(fold("Initech, Inc."), "initech")
        self.assertEqual(fold("Acme Ltd"), "acme")
        self.assertEqual(fold("  Big   Bank LLC "), "big bank")


class FindTests(SimpleTestCase):
    NAMES = [
        name("Globex (QA)", id_=29),
        name("Initech (QA)", id_=30),
        name("Globex", "account", 7, parents={29}),
        name("Al", id_=31),  # too short to match anything
    ]

    def test_one_customer_named(self):
        found, candidates = find("Globex's CSV exports are failing, urgent", self.NAMES)
        self.assertEqual((found.type, found.id), ("customer", 29))  # its own account dropped
        self.assertEqual(candidates, [])

    def test_whole_words_only(self):
        self.assertEqual(find("the globexian team", self.NAMES), (None, []))

    def test_two_named_are_candidates(self):
        found, candidates = find("Globex and Initech both fail", self.NAMES)
        self.assertIsNone(found)
        self.assertEqual([c.id for c in candidates], [29, 30])

    def test_none_named(self):
        self.assertEqual(find("Anyone for lunch?", self.NAMES), (None, []))

    def test_at_most_five_candidates_by_name(self):
        names = [name(f"Client {c}", id_=i) for i, c in enumerate("ABCDEFG")]
        _found, candidates = find(" ".join(f"Client {c}" for c in "GFEDCBA"), names)
        self.assertEqual([c.label for c in candidates], [f"Client {c}" for c in "ABCDE"])


class CoveredNamesTests(IntakeFixture):
    def test_a_workspace_wide_connection_covers_live_customers_and_accounts(self):
        archived = Customer.objects.create(organisation=self.org, name="Gone Co", is_archived=True)
        emea = Account.objects.create(name="Pizza Hut EMEA")
        emea.customers.add(self.pizza)
        slack = self.connector("slack", "")
        found = {(n.type, n.label) for n in covered_names(slack)}
        self.assertIn(("customer", "Pizza Hut"), found)
        self.assertIn(("account", "Pizza Hut EMEA"), found)
        self.assertNotIn(("customer", archived.name), found)

    def test_a_scoped_connection_covers_only_its_records(self):
        slack = self.connector("slack", "")
        slack.customers.add(self.pizza)
        self.assertEqual({n.label for n in covered_names(slack)}, {"Pizza Hut"})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_naming --parallel auto --noinput`
Expected: FAIL: `ModuleNotFoundError: No module named 'services.connectors.naming'`.

- [ ] **Step 3: `naming.py`**

Create `services/connectors/naming.py`:

```python
"""Which customer a colleague's Slack message names (Slack escalations D1,
SE1-7). Plain string work at sync time: no model reads the message (D2's
rule: no agent work at sync)."""

import re
from dataclasses import dataclass

from services.customers.models import Account, Customer

MIN_CHARS = 3
MAX_CANDIDATES = 5
_SUFFIX = re.compile(r"\s*\([^)]*\)\s*$")
_LEGAL = re.compile(r"[\s,]+(inc\.?|ltd\.?|llc)\s*$", re.IGNORECASE)


@dataclass(frozen=True)
class Name:
    folded: str
    type: str
    id: int
    label: str
    #: An account's parent customers (empty for a customer).
    parents: frozenset = frozenset()


def fold(name):
    """Lower case, without a trailing "(QA)"-style part or "Inc", "Ltd", "LLC"."""
    name = _SUFFIX.sub("", name or "")
    name = _LEGAL.sub("", name)
    return " ".join(name.lower().split())


def covered_names(connector):
    """The names of the records `connector` covers: the non-archived customers
    and the accounts it is linked to (with its customers' accounts), or every
    one in the workspace for a workspace-wide connection. Two queries."""
    organisation_id = connector.organisation_id
    customers = Customer.objects.filter(organisation_id=organisation_id, is_archived=False)
    accounts = Account.objects.filter(
        id__in=Account.objects.filter(customers__organisation_id=organisation_id).values("id")
    )
    if not connector.is_organisation_wide:
        linked = connector.customers.values("id")
        customers = customers.filter(id__in=linked)
        accounts = accounts.filter(id__in=connector.accounts.values("id")) | accounts.filter(
            id__in=Account.objects.filter(customers__in=linked).values("id")
        )
    names = [
        Name(fold(label), "customer", pk, label)
        for pk, label in customers.values_list("id", "name")
    ]
    parents = {}
    for account_id, customer_id in Account.customers.through.objects.filter(
        account_id__in=accounts.values("id")
    ).values_list("account_id", "customer_id"):
        parents.setdefault(account_id, set()).add(customer_id)
    names += [
        Name(fold(label), "account", pk, label, frozenset(parents.get(pk, ())))
        for pk, label in accounts.values_list("id", "name")
    ]
    return [n for n in names if len(n.folded) >= MIN_CHARS]


def _named(folded_name, text):
    return re.search(rf"(?<![\w]){re.escape(folded_name)}(?![\w])", text) is not None


def find(text, names):
    """(the one record named, []) or (None, up to five candidates by name)."""
    folded = " ".join((text or "").lower().split())
    hits = [n for n in names if _named(n.folded, folded)]
    customers = {n.id for n in hits if n.type == "customer"}
    # An account named like its own matched customer is that customer (SE1-7).
    hits = [n for n in hits if not (n.type == "account" and n.parents & customers)]
    if len(hits) == 1:
        return hits[0], []
    return None, sorted(hits, key=lambda n: (n.label.lower(), n.id))[:MAX_CANDIDATES]
```

Check the M2M through name: `grep -n "customers = models.ManyToManyField" -A3 services/customers/models.py` (if `Account.customers` declares a custom `through`, use that model instead of `Account.customers.through`).

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.connectors.tests.test_naming --parallel auto --noinput`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add services/connectors/naming.py services/connectors/tests/test_naming.py
git commit -m "feat(connectors): find the customer a Slack message names

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: "Needs a customer" keeps colleagues' Slack messages with their candidates

**Files:**
- Modify: `services/connectors/models.py` (`UnmatchedItem.candidates`), `services/connectors/unmatched.py` (`_keepable`, `keep`, `row_payload`, `page`)
- Create: `services/connectors/migrations/0007_unmatched_candidates.py` (`makemigrations connectors --name unmatched_candidates`)
- Test: `services/connectors/tests/test_unmatched_keep.py`, `services/work/tests/test_unmatched_list.py` (add)

**Interfaces:**
- Produces: `UnmatchedItem.candidates` (JSON list of `{"type", "id"}`, at most 5).
- Produces: `unmatched.keep(connector, remote, *, now=None, candidates=())`; list rows gain `mentioned` (SE1-12); Slack rows answer `can_add_contact: false`.

- [ ] **Step 1: Write the failing tests**

Append to `services/connectors/tests/test_unmatched_keep.py` (it already imports `IntakeFixture`-based fixtures, `remote`, `item`; read its header first and reuse its class's `setUp`):

```python
class SlackColleaguesTests(IntakeFixture):
    """SE1-9: a colleague's Slack message is the main case; Jira still drops it."""

    def setUp(self):
        super().setUp()
        self.slack = self.connector("slack", "cs")
        self.jira = self.connector("jira", "cs")

    def test_a_members_slack_message_is_kept_with_its_candidates(self):
        unmatched.keep(
            self.slack,
            remote(external_id="1792.1", number="#support", requester_email=self.csm.email),
            candidates=[{"type": "customer", "id": self.pizza.pk}],
        )
        row = UnmatchedItem.objects.get(connector=self.slack)
        self.assertEqual(row.candidates, [{"type": "customer", "id": self.pizza.pk}])
        self.assertEqual(row.number, "#support")

    def test_a_members_jira_issue_is_still_dropped(self):
        unmatched.keep(self.jira, remote(requester_email=self.csm.email))
        self.assertFalse(UnmatchedItem.objects.filter(connector=self.jira).exists())

    def test_a_later_pass_updates_the_candidates(self):
        unmatched.keep(self.slack, remote(external_id="1792.2"), candidates=[])
        unmatched.keep(
            self.slack,
            remote(external_id="1792.2"),
            candidates=[{"type": "customer", "id": self.pizza.pk}],
        )
        self.assertEqual(
            UnmatchedItem.objects.get(external_id="1792.2").candidates,
            [{"type": "customer", "id": self.pizza.pk}],
        )
```

(Add `from services.connectors import unmatched` and `from services.connectors.models import UnmatchedItem` to the imports if the file lacks them.)

Append to `services/work/tests/test_unmatched_list.py` (reuse its fixture class; read its `setUp` and its list helper, here written `self.list_for(user, queue)`):

```python
def test_mentioned_names_only_records_the_reader_may_open(self):
    slack = self.connector("slack", "cs")
    item(
        slack,
        number="#support",
        candidates=[
            {"type": "customer", "id": self.pizza.pk},
            {"type": "customer", "id": self.taco.pk},  # Dana's: Carl may not open it
        ],
    )
    self.assertFalse(can_open(self.csm, self.taco))
    row = next(
        r for r in self.list_for(self.csm, "department:cs")["items"] if r["source"] == "slack"
    )
    self.assertEqual(
        row["mentioned"], [{"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}]
    )
    self.assertFalse(row["can_add_contact"])


def test_a_jira_row_mentions_nobody(self):
    item(self.connector("jira", "cs"))
    row = self.list_for(self.csm, "department:cs")["items"][0]
    self.assertEqual(row["mentioned"], [])
```

(Import `services.customers.scoping.can_open` there; `self.taco` is the fixture's Taco Bell, owned by Dana. If the fixture class has no `list_for`, add one: `return self.client_for(user).get("/api/v1/work/unmatched/", {"queue": queue}).json()`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_unmatched_keep services.work.tests.test_unmatched_list --parallel auto --noinput`
Expected: FAIL: `TypeError: keep() got an unexpected keyword argument 'candidates'`; `KeyError: 'mentioned'`.

- [ ] **Step 3: The column and the changes**

In `services/connectors/models.py` `UnmatchedItem`, after `excerpt`:

```python
    #: Slack escalations D1 (SE1-9): the records the message names, when it
    #: names more than one: [{"type": "customer" | "account", "id": n}], at most 5.
    candidates = models.JSONField(default=list, blank=True)
```

Run: `$PY manage.py makemigrations connectors --name unmatched_candidates`

In `services/connectors/unmatched.py`:

```python
def _keepable(connector, remote, now):
    from services.agents.threads import source_on

    return (
        connector.is_enabled
        and connector.has_credentials
        and source_on(connector.organisation, connector.provider)
        and not (remote.extra or {}).get("made_here")
        and _last_activity(remote) >= now - FRESH
        # SE1-9: in Slack a colleague's message is the main case; Jira still drops members.
        and not (
            connector.provider == Connector.Provider.JIRA
            and _is_member(connector, remote.requester_email)
        )
    )
```

`keep(connector, remote, *, now=None, candidates=())`: compute `found = list(candidates)[:5]` once; the update for a waiting row becomes `.update(**text, candidates=found, last_seen_at=now)`; `UnmatchedItem.objects.create(...)` gains `candidates=found`.

`row_payload(row, known, zone, mentioned=())` returns, beside the existing keys:

```python
        "can_add_contact": row.provider != Connector.Provider.SLACK
        and bool(email)
        and email not in known,
        "mentioned": list(mentioned),
```

and `page` reads the names once for the shown rows:

```python
def _mentioned(reader, rows):
    """{row id: [{type, id, name}]}: each row's candidates the reader may open,
    in stored order (SE1-12). One query per record type, no join."""
    from services.customers.scoping import visible_accounts, visible_customers

    wanted = {"customer": set(), "account": set()}
    for row in rows:
        for c in row.candidates or []:
            if c.get("type") in wanted and isinstance(c.get("id"), int):
                wanted[c["type"]].add(c["id"])
    # SOC2:AUTH-02 never name a record the reader may not open
    names = (
        {
            ("customer", pk): label
            for pk, label in visible_customers(reader)
            .filter(pk__in=wanted["customer"])
            .values_list("id", "name")
        }
        if wanted["customer"]
        else {}
    )
    if wanted["account"]:
        names.update(
            {
                ("account", pk): label
                for pk, label in visible_accounts(reader)
                .filter(pk__in=wanted["account"])
                .values_list("id", "name")
            }
        )
    return {
        row.pk: [
            {"type": c["type"], "id": c["id"], "name": names[(c["type"], c["id"])]}
            for c in row.candidates or []
            if (c.get("type"), c.get("id")) in names
        ]
        for row in rows
    }
```

In `page`, after `zone = ...`: `mentioned = _mentioned(reader, shown)` and pass `mentioned.get(r.pk, ())` to `row_payload`.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.connectors.tests.test_unmatched_keep services.connectors.tests.test_unmatched_sync services.work.tests.test_unmatched_list --parallel auto --noinput`
Expected: PASS. (R2-D3's `UNMATCHED_LIST_QUERIES` pin may rise by at most 2 with a Slack row on the page; Task 12 re-pins it. If the pin test fails here, note the measured number for Task 12.)

- [ ] **Step 5: Commit**

```bash
git add services/connectors/models.py services/connectors/migrations/0007_unmatched_candidates.py services/connectors/unmatched.py services/connectors/tests/test_unmatched_keep.py services/work/tests/test_unmatched_list.py
git commit -m "feat(connectors): keep colleagues' Slack messages that need a customer, with the customers they mention

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Threads for conversations

**Files:**
- Modify: `services/agents/models.py` (`SignalThread.conversation`), `services/agents/threads.py`, `services/agents/fast_lane.py`
- Create: `services/agents/migrations/0007_signal_thread_conversation.py` (`makemigrations agents --name signal_thread_conversation`)
- Test: `services/agents/tests/test_conversation_threads.py` (create)

**Interfaces:**
- Consumes: `SlackConversation` (Task 1), `slack.ts_time` (Task 2).
- Produces: `SignalThread.conversation`; `threads.touch_conversation(conversation, now=None, *, at=None) -> SignalThread | None`; `fast_lane.for_conversation(conversation) -> str`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_conversation_threads.py`:

```python
"""Slack escalations D1 SE1-8, SE1-13, SE1-14: a conversation's thread follows
its newest human message; the bot's own reply never wakes it."""

from datetime import timedelta

from django.utils import timezone

from services.agents import threads
from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.tests.slack_fixtures import conversation, msg

T = SignalThread.Status


def ts_ago(delta):
    return f"{(timezone.now() - delta).timestamp():.6f}"


class TouchConversationTests(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.slack = self.connector("slack", "cs")

    def test_a_new_conversation_makes_its_thread(self):
        ts = ts_ago(timedelta(minutes=20))
        made = conversation(self.pizza, self.slack, thread_ts=ts, messages=[msg(ts)])
        thread = threads.touch_conversation(made)
        self.assertEqual(
            (thread.source_kind, thread.external_id, thread.conversation_id, thread.ticket_id),
            ("slack", f"{self.slack.pk}:{ts}", made.pk, None),
        )
        self.assertEqual(thread.status, T.NEW)
        self.assertEqual(thread.department, "cs")

    def test_its_time_is_the_newest_human_message(self):
        top, reply, ours = (ts_ago(timedelta(minutes=m)) for m in (40, 30, 20))
        made = conversation(
            self.pizza,
            self.slack,
            thread_ts=top,
            messages=[msg(top), msg(reply, "Ann"), msg(ours, "revenact", bot=True)],
        )
        thread = threads.touch_conversation(made)
        self.assertAlmostEqual(thread.last_message_at.timestamp(), float(reply), places=3)

    def test_an_old_thread_is_skipped_as_stale(self):
        ts = ts_ago(timedelta(days=8))
        made = conversation(self.pizza, self.slack, thread_ts=ts, messages=[msg(ts)])
        thread = threads.touch_conversation(made)
        self.assertEqual((thread.status, thread.skip_reason), (T.SKIPPED, "stale"))

    def test_a_match_touches_it_now_whatever_its_age(self):
        ts = ts_ago(timedelta(days=8))
        made = conversation(self.pizza, self.slack, thread_ts=ts, messages=[msg(ts)])
        now = timezone.now()
        thread = threads.touch_conversation(made, now, at=now)
        self.assertEqual(thread.status, T.NEW)

    def test_only_the_bot_spoke_is_no_thread(self):
        ts = ts_ago(timedelta(minutes=5))
        made = conversation(
            self.pizza, self.slack, thread_ts=ts, messages=[msg(ts, "revenact", bot=True)]
        )
        self.assertIsNone(threads.touch_conversation(made))

    def test_the_fast_lane_reads_the_slack_channel_rule(self):
        self.org.ai_fast_lane = {"on": True, "rules": {"slack_connectors": [self.slack.pk]}}
        self.org.save(update_fields=["ai_fast_lane"])
        ts = ts_ago(timedelta(minutes=5))
        made = conversation(self.pizza, self.slack, thread_ts=ts, messages=[msg(ts)])
        made.connector.organisation.refresh_from_db()
        self.assertEqual(threads.touch_conversation(made).urgent_rule, "slack_channel")
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_conversation_threads --parallel auto --noinput`
Expected: FAIL: `AttributeError: module 'services.agents.threads' has no attribute 'touch_conversation'`.

- [ ] **Step 3: The field, the touch and the rule**

In `services/agents/models.py` `SignalThread`, after `ticket`:

```python
    #: Slack escalations D1 (SE1-13): a Slack thread's conversation (a Slack
    #: thread has no ticket any more).
    conversation = models.ForeignKey(
        "customers.SlackConversation",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
    )
```

and in its docstring "one ticket of a connector" becomes "one ticket of a connector, or one Slack conversation". Run `$PY manage.py makemigrations agents --name signal_thread_conversation`.

In `services/agents/threads.py`, `TICKET_SOURCES` stays (connected sources and readable threads still treat Slack as a connector source). Add:

```python
def touch_conversation(conversation, now=None, *, at=None):
    """A filed Slack conversation with a new human message (Slack escalations
    D1, SE1-8): its thread moves to that message's time (never later than
    now). `at`: a person's match touches it now, whatever its age (R2D3-9).
    The bot's own reply never touches it; a conversation where only the bot
    spoke has no thread."""
    connector = conversation.connector
    if connector is None:
        return None
    from services.connectors.providers.slack import ts_time

    from . import fast_lane

    now = now or timezone.now()
    humans = [m for m in conversation.messages or [] if not m.get("bot")]
    if not humans:
        return None
    if at is None:
        at = min(ts_time(humans[-1]["ts"]), now)
    return _touch(
        organisation_id=connector.organisation_id,
        source_kind=K.SLACK,
        external_id=f"{connector.pk}:{conversation.thread_ts}",
        at=at,
        stale=at < now - STALE,
        fields={
            "customer_id": conversation.customer_id,
            "account_id": conversation.account_id,
            "department": conversation.department,
            "conversation_id": conversation.pk,
            "ticket_id": None,
        },
        newest={"urgent_rule": fast_lane.for_conversation(conversation)},
    )
```

In `services/agents/fast_lane.py`, after `for_ticket`:

```python
def for_conversation(conversation):
    """SE1-14: a Slack conversation's newest human message."""
    connector = conversation.connector
    lane = settings(connector.organisation)
    if not lane["on"]:
        return ""
    humans = [m for m in conversation.messages or [] if not m.get("bot")]
    newest = humans[-1]["text"] if humans else ""
    return rule_for(
        lane,
        source="slack",
        connector_id=connector.pk,
        priority="",
        sender=conversation.started_by_email,
        text=f"{conversation.title}\n{newest[:TEXT_CHARS]}",
        record=lambda: conversation.record,
    )
```

(`settings(organisation)` merges a partial `ai_fast_lane` over its defaults; check with `sed -n 49,80p services/agents/fast_lane.py` and, if it does not, set the test's `ai_fast_lane` to the full default shape from `fast_lane.DEFAULTS`.)

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_conversation_threads services.agents.tests.test_signal_thread_model services.agents.tests.test_fast_lane_rules --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/models.py services/agents/migrations/0007_signal_thread_conversation.py services/agents/threads.py services/agents/fast_lane.py services/agents/tests/test_conversation_threads.py
git commit -m "feat(agents): Slack conversations have threads; the fast lane reads them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The sync files conversations

**Files:**
- Modify: `services/connectors/sync.py`
- Test: `services/connectors/tests/test_slack_sync.py` (create); rewrite every Slack case in `services/connectors/tests/test_tickets.py`, `test_unmatched_sync.py`, `test_views.py` that expected a Slack `Ticket` (list them with `grep -n -i "slack" services/connectors/tests/test_tickets.py services/connectors/tests/test_unmatched_sync.py services/connectors/tests/test_views.py`), and remove any skip Task 2 added.

**Interfaces:**
- Consumes: `fetch_threads` (Task 2), `naming` (Task 3), `keep(..., candidates=)` (Task 4), `touch_conversation` (Task 5).
- Produces: `sync._scoped(connector) -> (customer, account)`; `sync.file_conversation(connector, remote, names, *, now) -> ("created" | "updated" | "unmatched", SlackConversation | None)`; `sync.sync_conversations(connector) -> counts`; `sync.sync_connector` hands Slack to it.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_slack_sync.py`:

```python
"""Slack escalations D1 SE1-4 to SE1-9: a pass files threads as conversations
on the channel's customer or the one the message names; anything unclear
waits in Needs a customer; replies land in the same conversation."""

from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import sync
from services.connectors.models import Connector, UnmatchedItem
from services.connectors.tests.slack_fake import use_slack
from services.customers.models import Customer, SlackConversation, Ticket


class SlackSyncTests(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        self.slack = self.connector("slack", "cs")
        self.slack.set_credentials({"bot_token": "xoxb-test-only"})
        self.slack.config = {
            "channel": "C0SUPPORT",
            "channel_name": "support",
            "bot_name": "revenact",
        }
        self.slack.status = Connector.Status.CONNECTED
        self.slack.save()
        self.shack = Customer.objects.create(organisation=self.org, name="Taco Shack")

    def run_pass(self):
        return sync.sync_connector(self.slack)

    def test_a_message_naming_one_customer_is_filed_there(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail, urgent")
        self.assertEqual(self.run_pass()["created"], 1)
        made = SlackConversation.objects.get()
        self.assertEqual((made.customer, made.matched_by), (self.pizza, "name"))
        self.assertEqual(made.started_by_name, "Faiz Jamal")
        self.assertFalse(Ticket.objects.filter(connector=self.slack).exists())
        thread = SignalThread.objects.get(conversation=made)
        self.assertEqual(thread.source_kind, "slack")

    def test_a_channel_set_to_one_customer_files_everything_there(self):
        self.slack.customers.add(self.shack)
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        made = SlackConversation.objects.get()
        self.assertEqual((made.customer, made.matched_by), (self.shack, "channel"))

    def test_the_posters_email_is_never_used(self):
        # Ann's Slack email is a Pizza Hut contact's domain; the message names nobody.
        self.slack_api.say("C0SUPPORT", "U0ANN", "Anyone seeing slow dashboards?")
        self.assertEqual(self.run_pass()["unmatched"], 1)
        self.assertFalse(SlackConversation.objects.exists())

    def test_a_colleagues_message_naming_two_waits_with_both(self):
        self.slack_api.users["U0CARL"] = {
            "real_name": "Carl",
            "profile": {"email": self.csm.email},
        }
        self.slack_api.say("C0SUPPORT", "U0CARL", "Pizza Hut and Taco Shack both fail")
        self.run_pass()
        row = UnmatchedItem.objects.get(connector=self.slack)
        self.assertEqual(
            sorted(c["id"] for c in row.candidates), sorted([self.pizza.pk, self.shack.pk])
        )
        self.assertEqual(row.number, "#support")

    def test_a_reply_lands_in_the_same_conversation_and_wakes_it(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        thread = SignalThread.objects.get()
        SignalThread.objects.filter(pk=thread.pk).update(status="processed")
        self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        self.assertEqual(self.run_pass()["updated"], 1)
        made = SlackConversation.objects.get()
        self.assertEqual(
            [m["text"] for m in made.messages], ["Pizza Hut exports fail", "Still failing"]
        )
        self.assertEqual(SignalThread.objects.get().status, "new")

    def test_our_own_reply_is_stored_but_wakes_nothing(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        SignalThread.objects.update(status="processed")
        self.slack_api.channels["C0SUPPORT"].append(
            {"ts": f"{float(top) + 5:.6f}", "text": "On it.", "bot_id": "B0BOT", "thread_ts": top}
        )
        self.run_pass()
        self.assertTrue(SlackConversation.objects.get().messages[-1]["bot"])
        self.assertEqual(SignalThread.objects.get().status, "processed")

    def test_a_member_starts_it(self):
        self.slack_api.users["U0CARL"] = {
            "real_name": "Carl",
            "profile": {"email": self.csm.email.upper()},
        }
        self.slack_api.say("C0SUPPORT", "U0CARL", "Pizza Hut exports fail")
        self.run_pass()
        self.assertEqual(SlackConversation.objects.get().started_by, self.csm)

    def test_the_pass_notes_what_it_did_and_whether_the_channel_is_shared(self):
        self.slack_api.shared.add("C0SUPPORT")
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Lunch?")
        self.run_pass()
        self.slack.refresh_from_db()
        self.assertEqual(
            self.slack.last_sync_note, "1 new, 0 updated, 1 without a matching account"
        )
        self.assertTrue(self.slack.config["external_shared"])
        self.assertTrue(SlackConversation.objects.get().external_shared)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_sync --parallel auto --noinput`
Expected: FAIL: `AttributeError: 'SlackProvider' object has no attribute 'fetch_tickets'` (or an assertion on `SlackConversation.objects.get()`).

- [ ] **Step 3: The sync**

In `services/connectors/sync.py`:

1. Docstring: append "Slack is not a ticket source (Slack escalations D1): a Slack connector's threads are filed as conversations (`sync_conversations`), on the customer the channel is set to or the one its message names."
2. Factor the scope rule out of `_parent_for`:

```python
def _scoped(connector):
    """The one customer or account a connector is set to, else (None, None)."""
    customers = list(connector.customers.all()[:2])
    accounts = list(connector.accounts.all()[:2])
    if len(customers) == 1 and not accounts:
        return customers[0], None
    if len(accounts) == 1 and not customers:
        return None, accounts[0]
    return None, None
```

and `_parent_for` uses it: `if customer is None and account is None: customer, account = _scoped(connector)`.

3. Add the conversation filing:

```python
def _member(organisation_id, email):
    from services.accounts.models import User

    if not email:
        return None
    return User.objects.filter(
        organisation_id=organisation_id, email__iexact=email, is_active=True
    ).first()


def _apply_thread(conversation, remote, now):
    """Fold one read into a conversation; True when a human message is new (SE1-8)."""
    from services.connectors.providers.base import first_line
    from services.connectors.providers.slack import ts_time

    top = {
        "ts": remote.thread_ts,
        "user_id": remote.user_id,
        "name": remote.user_name,
        "text": remote.text[: SlackConversation.TEXT_CHARS],
        "bot": False,
    }
    stored = conversation.messages or []
    replies = remote.replies if remote.replies is not None else stored[1:]
    messages = [top, *replies[-(SlackConversation.MAX_MESSAGES - 1) :]]
    before = {m.get("ts") for m in stored}
    conversation.messages = messages
    conversation.title = (first_line(remote.text) or "(empty message)")[:255]
    if remote.replies is not None:
        conversation.latest_reply = remote.latest_reply[:32]
    conversation.last_message_at = max(ts_time(m["ts"]) for m in messages)
    conversation.synced_at = now
    return any(not m["bot"] and m["ts"] not in before for m in messages)


def _as_unmatched(connector, remote):
    """The thread as R2-D3 keeps an unmatched item (SE1-9): the top message only."""
    from services.connectors.providers.base import RemoteTicket, first_line
    from services.connectors.providers.slack import ts_time

    latest = ts_time(remote.latest_reply) if remote.latest_reply else remote.posted_at
    return RemoteTicket(
        external_id=remote.thread_ts,
        number=f"#{(connector.config or {}).get('channel_name') or remote.channel}"[:32],
        title=first_line(remote.text) or "(empty message)",
        description=remote.text,
        requester_email=remote.user_email,
        requester_name=remote.user_name,
        url=remote.url,
        opened_at=remote.posted_at.date(),
        extra={"updated_at": max(latest, remote.posted_at).isoformat()},
    )


def file_conversation(connector, remote, names, *, now):
    """Contract §2 step 4: ("created" | "updated" | "unmatched", conversation)."""
    from services.agents.threads import touch_conversation

    from . import naming

    existing = SlackConversation.objects.filter(
        connector=connector, thread_ts=remote.thread_ts
    ).first()
    if existing is not None:
        fresh = _apply_thread(existing, remote, now)
        existing.save()
        unmatched.forget(connector, remote.thread_ts)
        if fresh:
            touch_conversation(existing, now)
        return "updated", existing
    customer, account = _scoped(connector)
    how, candidates = SlackConversation.MatchedBy.CHANNEL, []
    if customer is None and account is None:
        found, near = naming.find(remote.text, names)
        how = SlackConversation.MatchedBy.NAME
        if found is not None:
            customer, account = (
                (Customer.objects.get(pk=found.id), None)
                if found.type == "customer"
                else (None, Account.objects.get(pk=found.id))
            )
        candidates = [{"type": n.type, "id": n.id} for n in near]
    if customer is None and account is None:
        try:
            with transaction.atomic():  # a savepoint: one bad item never stops the batch
                unmatched.keep(connector, _as_unmatched(connector, remote), candidates=candidates)
        except Exception as exc:  # noqa: BLE001
            logger.warning("unmatched keep failed: %s", type(exc).__name__)
        return "unmatched", None
    config = connector.config or {}
    conversation = SlackConversation(
        customer=customer,
        account=account,
        connector=connector,
        department=connector.department,
        channel=remote.channel[:32],
        channel_name=str(config.get("channel_name", ""))[:80],
        thread_ts=remote.thread_ts[:32],
        started_by=_member(connector.organisation_id, remote.user_email),
        started_by_name=remote.user_name[:150],
        started_by_email=remote.user_email[:254],
        url=remote.url[:500],
        matched_by=how,
        external_shared=bool(config.get("external_shared")),
    )
    _apply_thread(conversation, remote, now)
    conversation.save()
    unmatched.forget(connector, remote.thread_ts)
    touch_conversation(conversation, now)
    return "created", conversation


def sync_conversations(connector):
    """One Slack pass (contract §2): files threads, never tickets."""
    from . import naming

    provider = get_provider(connector.provider)
    now = timezone.now()
    known = dict(
        SlackConversation.objects.filter(connector=connector).values_list(
            "thread_ts", "latest_reply"
        )
    )
    try:
        creds = connector.get_credentials()
        remotes, newest, shared = provider.fetch_threads(
            connector.config, creds, known=known, now=now
        )
    except (ProviderError, ValueError, KeyError) as exc:
        connector.status = Connector.Status.ERROR
        connector.error = str(exc)[:255]
        connector.save(update_fields=["status", "error"])
        logger.warning("connector %s: %s", connector, exc)
        return {"created": 0, "updated": 0, "unmatched": 0}
    connector.config = {**(connector.config or {}), "external_shared": shared}
    names = naming.covered_names(connector)
    counts = {"created": 0, "updated": 0, "unmatched": 0}
    with transaction.atomic():
        for remote in remotes:
            outcome, _made = file_conversation(connector, remote, names, now=now)
            counts[outcome] += 1
    connector.sync_cursor = (newest or connector.sync_cursor or "")[:512]
    connector.status = Connector.Status.CONNECTED
    connector.error = ""
    connector.last_synced_at = now
    connector.last_sync_note = summary_line(counts)
    connector.save()
    return counts
```

with `from services.customers.models import Account, Customer, SlackConversation, Ticket` at the top, and in `sync_connector`, after the credentials check:

```python
    if connector.provider == Connector.Provider.SLACK:
        return sync_conversations(connector)
```

(`file_conversation` reads a matched record with one `get`: the `naming` match is a pk from this workspace's two queries, never user input.)

4. Rewrite the old Slack-ticket tests found by the `grep` in **Files** to assert conversations (the same scenario, `SlackConversation` instead of `Ticket`), or delete those whose behaviour SE1 removes (✅ resolves, `SL-` numbers, priority words, poster-email matching for Slack); list each deletion in the commit message body.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: PASS (no skips left from Task 2: `grep -rn "Task 6 moves" services/` prints nothing).

- [ ] **Step 5: Commit**

```bash
git add services/connectors/sync.py services/connectors/tests/
git commit -m "feat(connectors): Slack threads are filed as conversations, never tickets

<list each deleted Slack-ticket test and why>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Agents read conversations and reply in their thread

**Files:**
- Modify: `services/agents/intake.py` (`answered`, the `select_related` in `pick` and the two other `select_related` calls), `services/agents/evidence.py` (`Context.thread_slack`, `slack_line`, `_thread`), `services/agents/outside/offered.py`, `services/agents/actions/slack_replies.py` (`validate`, `target`, `current`, module docstring), `services/agents/prompt.py` (`OUTSIDE_RULES["slack.reply"]`)
- Modify (fixtures): `services/agents/tests/outside_fixtures.py` (`slack_thread`, `slack_payload`)
- Test: `services/agents/tests/test_slack_conversation_intake.py` (create); then the suites that use the Slack fixtures (`grep -rln "slack_thread\|slack_payload" services e2e`)

**Interfaces:**
- Consumes: `SignalThread.conversation` (Task 5).
- Produces: `evidence.Context.thread_slack: dict | None` (`id`, `record`, `connector_id`, `channel`, `channel_name`, `thread_ts`, `usable`); `evidence.slack_line(message, n, bot="") -> str`; `slack.reply` payload `conversation_id`; `OutsideFixture.slack_thread(record, connector=None, ts=...) -> (SlackConversation, SignalThread)`; `OutsideFixture.slack_payload(conversation, connector, *, text=...)`.

- [ ] **Step 1: Move the fixtures**

In `services/agents/tests/outside_fixtures.py`:

```python
def slack_thread(self, record, connector=None, ts="1760339999.000100"):
    """A Slack conversation through `connector` on `record`, its thread
    touched QUIET_AGO (Slack escalations D1: Slack is never a ticket)."""
    from django.utils import timezone

    from services.agents import threads
    from services.customers.tests.slack_fixtures import conversation, msg

    connector = connector or self.slack_connector()
    made = conversation(
        record,
        connector,
        thread_ts=ts,
        channel=connector.config["channel"],
        channel_name=connector.config["channel_name"],
        title="Nobody can log in",
        messages=[msg(ts, "Ann Lee", "Nobody can log in since the password reset.")],
    )
    now = timezone.now()
    thread = threads.touch_conversation(made, now, at=now - QUIET_AGO)
    return made, thread


@staticmethod
def slack_payload(conversation, connector, *, text="We're on it: the fix ships Friday."):
    return {
        "conversation_id": conversation.pk,
        "source_connector_id": connector.pk,
        "connector_id": connector.pk,
        "channel": connector.config["channel"],
        "channel_name": connector.config["channel_name"],
        "thread_ts": conversation.thread_ts,
        "text": text,
    }
```

(Import `QUIET_AGO` from `intake_fixtures`; drop the now-unused `Ticket` import if nothing else in the file uses it.)

- [ ] **Step 2: Write the failing tests**

Create `services/agents/tests/test_slack_conversation_intake.py`:

```python
"""Slack escalations D1 SE1-13: a Slack thread's block is its messages, its
reply goes back into the thread, and our own reply makes it answered."""

import json
from unittest.mock import patch

from services.agents import intake
from services.agents.models import AgentBundle
from services.agents.tests.intake_fixtures import MODEL
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import SlackConversation
from services.customers.tests.slack_fixtures import msg


class SlackConversationIntakeTests(OutsideFixture):
    def answer(self, text="Thanks Ann, we're on it.", evidence=None):
        line = '    message 1: from "Ann Lee"'
        return json.dumps(
            {
                "actions": [
                    {
                        "kind": "slack.reply",
                        "record": "c1",
                        "title": "Answer Ann in Slack",
                        "rationale": "Ann is locked out.",
                        "evidence": evidence or [],
                        "payload": {"text": text},
                    }
                ],
                "bundle": {"title": "Pizza Hut: login", "reason": "Ann is locked out."},
            }
        ), line

    def test_the_block_is_the_threads_messages(self):
        conversation, thread = self.slack_thread(self.pizza)
        ctx = self.thread_ctx(thread)
        self.assertEqual(ctx.thread_channel, "slack")
        self.assertIn('message 1: from "Ann Lee"', ctx.thread_lines[0])
        self.assertEqual(ctx.thread_slack["id"], conversation.pk)
        self.assertIsNone(ctx.thread_ticket)

    def test_a_slack_reply_goes_into_the_thread(self):
        conversation, thread = self.slack_thread(self.pizza)
        raw, _ = self.answer()
        with patch(MODEL, return_value=raw):
            intake.run_all()
        step = AgentBundle.objects.get(thread=thread).steps.get()
        self.assertEqual(step.kind, "slack.reply")
        self.assertEqual(step.payload["conversation_id"], conversation.pk)
        self.assertEqual(step.payload["thread_ts"], conversation.thread_ts)
        self.assertNotIn("ticket_id", step.payload)
        self.assertEqual(step.target, f"draft:conversation:{conversation.pk}")
        self.assertEqual(step.before, "open")

    def test_our_reply_last_makes_it_answered(self):
        conversation, thread = self.slack_thread(self.pizza)
        SlackConversation.objects.filter(pk=conversation.pk).update(
            messages=[
                *conversation.messages,
                msg("1760340999.000100", "revenact", "On it.", bot=True),
            ]
        )
        self.assertEqual(intake.answered(thread), "answered")

    def test_no_draft_reply_on_a_conversation(self):
        _conversation, thread = self.slack_thread(self.pizza)
        ctx = self.thread_ctx(thread)
        self.assertEqual(ctx.tickets, {})
```

(Check `IntakeFixture.thread_ctx` builds through `evidence.build_for_thread` with the thread's route: `sed -n 133,150p services/agents/tests/intake_fixtures.py`. Check the model answer's exact shape against an existing intake test, for example `grep -n "\"actions\"" services/agents/tests/test_intake_run.py | head -3`, and copy that shape if it differs.)

- [ ] **Step 3: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_slack_conversation_intake --parallel auto --noinput`
Expected: FAIL: `AttributeError: 'Context' object has no attribute 'thread_slack'`.

- [ ] **Step 4: Read and answer conversations**

`services/agents/evidence.py`:

1. `Context` gains `thread_slack: dict | None = None` beside `thread_ticket`.
2. After `message_line`:

```python
def slack_line(message, n, bot=""):
    """One message of a Slack conversation, quoted as data (SE1-13)."""
    from services.connectors.providers.slack import ts_time

    who = (
        f"we wrote ({bot or 'the Slack app'})"
        if message.get("bot")
        else f"from {_q(message.get('name') or 'someone')}"
    )
    when = ts_time(message["ts"]).isoformat(timespec="minutes")
    return f"    message {n}: {who}, {when}: {_q(str(message.get('text', ''))[:MESSAGE_CHARS])}"
```

3. In `_thread`, before `ticket = thread.ticket`:

```python
    if thread.source_kind == SignalThread.SourceKind.SLACK:
        conversation = thread.conversation
        if conversation is None:
            return
        messages = conversation.messages or []
        shown = messages[-THREAD_MESSAGES:]
        first = len(messages) - len(shown) + 1
        connector = conversation.connector
        bot = (connector.config or {}).get("bot_name", "") if connector is not None else ""
        ctx.thread_lines = [slack_line(m, first + i, bot) for i, m in enumerate(shown)]
        ctx.thread_channel = "slack"
        ctx.thread_slack = {
            "id": conversation.pk,
            "record": row["ref"],
            "connector_id": conversation.connector_id,
            "channel": conversation.channel,
            "channel_name": conversation.channel_name,
            "thread_ts": conversation.thread_ts,
            # D3-18: a tool is offered only while it is connected
            "usable": connector is not None and _usable(connector),
        }
        return
```

`services/agents/outside/offered.py`: replace the Slack branch with

```python
    slack = ctx.thread_slack
    if slack is not None and slack["usable"]:
        kinds.add(K.SLACK_REPLY)
```

(drop the `Connector` import if unused.)

`services/agents/actions/slack_replies.py`:

```python
def validate(payload, row, ctx, evidence):
    slack = ctx.thread_slack
    if slack is None or slack["record"] != row["ref"]:
        raise Invalid("not this record's Slack thread")
    text = str(payload.get("text") or "").strip()
    if not text or len(text) > TEXT_LIMIT:
        raise Invalid("a Slack reply needs text under 3000 characters")
    thread = {line.strip() for line in ctx.thread_lines}
    if any(line not in thread for line in evidence):
        raise Invalid("a Slack reply cites only its thread")
    # D3-20: where it posts comes from the thread, never the model.
    return {
        "conversation_id": slack["id"],
        "source_connector_id": slack["connector_id"],
        "connector_id": slack["connector_id"],
        "channel": slack["channel"],
        "channel_name": slack["channel_name"],
        "channel_choice": str(slack["connector_id"]),
        "thread_ts": slack["thread_ts"],
        "text": text,
    }


def target(payload):
    # One reply per conversation (D3-18).
    return f"draft:conversation:{payload['conversation_id']}"


def current(action):
    """Always "open": nothing resolves a Slack conversation (SE1-13)."""
    return "open"
```

Remove the now-unused `Ticket` and `drafts` imports; the module docstring's "a reply in the customer's Slack thread" becomes "a reply in the conversation's Slack thread".

`services/agents/intake.py`:

```python
def answered(thread):
    """D2-15: our reply is the newest message (mail or Slack), or the ticket
    is resolved or closed."""
    if thread.source_kind == SignalThread.SourceKind.MAIL:
        ...  # unchanged
    if thread.source_kind == SignalThread.SourceKind.SLACK:
        messages = (
            SlackConversation.objects.filter(pk=thread.conversation_id)
            .values_list("messages", flat=True)
            .first()
        ) or []
        return "answered" if messages and messages[-1].get("bot") else None
    status = ...  # unchanged
```

and add `"conversation__connector"` to the three `select_related(...)` calls that name `"ticket__connector"` (import `SlackConversation` from `services.customers.models`).

`services/agents/prompt.py`: `OUTSIDE_RULES["slack.reply"]` becomes `"A slack.reply is posted in the conversation's Slack thread when a person runs it: it cites only the conversation."`

- [ ] **Step 5: Run them, then every suite that touches Slack steps**

Run: `$PY manage.py test services.agents.tests.test_slack_conversation_intake --parallel auto --noinput`
Expected: PASS.

Run: `$PY manage.py test services.agents services.connectors services.work --parallel auto --noinput`
Expected: PASS after fixing callers that read the old fixture's ticket (`ticket.external_id` becomes `conversation.thread_ts`, `ticket.pk` in a payload becomes `conversation.pk`, an assertion on `payload["ticket_id"]` becomes `payload["conversation_id"]`). Do not change what a test asserts beyond that rename; if one asserts ✅-resolve behaviour (`current` "resolved" for Slack), delete it and say so in the commit body. Query pins that move by the conversation's read are re-pinned in Task 12 (note the measured number now).

- [ ] **Step 6: Commit**

```bash
git add services/agents/ services/connectors/tests/ services/work/tests/
git commit -m "feat(agents): agents read Slack conversations and reply in their thread

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Matching a Slack row makes a conversation

**Files:**
- Modify: `services/connectors/unmatched.py` (`match`, a new `NO_SLACK_CONTACT`), `services/work/unmatched_views.py`
- Test: `services/work/tests/test_unmatched_match.py` (find the R2-D3 match tests: `grep -rln "unmatched/.*match" services/work/tests`; add to that file)

**Interfaces:**
- Consumes: `touch_conversation(..., at=now)` (Task 5), `SlackConversation` (Task 1).
- Produces: `unmatched.match(reader, pk, data, *, request=None) -> (Ticket | SlackConversation, contact_added)`; the answer of contract §6; audit `conversation.matched`.

- [ ] **Step 1: Write the failing tests**

Add to the R2-D3 match test file (its class already has `item(...)` and a client helper; reuse them):

```python
def test_matching_a_slack_row_makes_a_conversation(self):
    slack = self.connector("slack", "cs")
    slack.config = {"channel": "C0SUPPORT", "channel_name": "support", "bot_name": "revenact"}
    slack.save(update_fields=["config"])
    row = item(slack, external_id="1792041415.357099", number="#support", excerpt="Exports fail.")
    answer = self.client_for(self.csm).post(
        f"/api/v1/work/unmatched/{row.pk}/match/", {"customer_id": self.pizza.pk}, format="json"
    )
    self.assertEqual(answer.status_code, 200)
    body = answer.json()
    made = SlackConversation.objects.get()
    self.assertEqual(
        body,
        {
            "record": {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
            "ticket": None,
            "conversation": {"id": made.pk},
            "contact_added": False,
        },
    )
    self.assertEqual((made.matched_by, made.latest_reply), ("person", ""))
    self.assertEqual(made.messages[0]["text"], "Exports fail.")
    self.assertFalse(Ticket.objects.exists())
    self.assertEqual(SignalThread.objects.get(conversation=made).status, "new")
    event = AuditEvent.objects.get(action="conversation.matched")
    self.assertNotIn("Exports", json.dumps(event.metadata))


def test_a_slack_row_refuses_a_contact(self):
    row = item(self.connector("slack", "cs"), number="#support")
    answer = self.client_for(self.csm).post(
        f"/api/v1/work/unmatched/{row.pk}/match/",
        {"customer_id": self.pizza.pk, "add_contact": True},
        format="json",
    )
    self.assertEqual(
        (answer.status_code, answer.json()),
        (
            400,
            {
                "add_contact": [
                    "A Slack message is from a colleague. Match it without adding a contact."
                ]
            },
        ),
    )


def test_a_jira_match_also_answers_its_record(self):
    row = item(self.connector("jira", "cs"))
    body = (
        self.client_for(self.csm)
        .post(
            f"/api/v1/work/unmatched/{row.pk}/match/", {"customer_id": self.pizza.pk}, format="json"
        )
        .json()
    )
    self.assertEqual(body["record"], body["ticket"]["record"])
    self.assertIsNone(body["conversation"])
```

(Imports: `json`, `core.models.AuditEvent`, `SignalThread`, `SlackConversation`, `Ticket`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.work.tests.test_unmatched_match --parallel auto --noinput` (use the file's real name)
Expected: FAIL: a `Ticket` is made, `KeyError: 'record'`.

- [ ] **Step 3: The match**

In `services/connectors/unmatched.py`:

```python
NO_SLACK_CONTACT = "A Slack message is from a colleague. Match it without adding a contact."


def _conversation_from(row, parent, now):
    """SE1-10: the row's message as a conversation; its replies come next pass."""
    from services.connectors.providers.slack import message_url, ts_time
    from services.connectors.sync import _member
    from services.customers.models import SlackConversation

    config = row.connector.config or {}
    try:
        at = ts_time(row.external_id)
    except ValueError:
        at = row.first_seen_at
    return SlackConversation.objects.create(
        **parent,
        connector=row.connector,
        department=row.department,
        channel=str(config.get("channel", ""))[:32],
        channel_name=str(config.get("channel_name", ""))[:80],
        thread_ts=row.external_id[:32],
        title=row.title or row.number,
        messages=[
            {
                "ts": row.external_id,
                "user_id": "",
                "name": row.requester_name,
                "text": row.excerpt,
                "bot": False,
            }
        ],
        started_by=_member(row.organisation_id, row.requester_email),
        started_by_name=row.requester_name,
        started_by_email=row.requester_email,
        url=row.url or message_url(config.get("channel", ""), row.external_id),
        last_message_at=at,
        matched_by=SlackConversation.MatchedBy.PERSON,
        external_shared=bool(config.get("external_shared")),
        synced_at=now,
    )
```

In `match`, the new refusal sits after the record check (R2-D3 row 4) and before `NOT_COVERED` (row 5), as contract §6 orders it:

```python
    record = _record(reader, model, record_id)
    parent = ...
    slack = row.provider == Connector.Provider.SLACK
    if slack and add:
        raise Refused(400, {"add_contact": [NO_SLACK_CONTACT]})
    if not row.connector.covers(**parent):
        ...
```

Inside the locked block, the GONE check also refuses when `SlackConversation.objects.filter(connector_id=row.connector_id, thread_ts=row.external_id).exists()`; then:

```python
        if slack:
            made = _conversation_from(row, parent, now)
            added, action, target_repr = False, "conversation.matched", "Slack thread {}"
        else:
            made = ...  # today's Ticket.objects.create(...) inside its savepoint
            added = add and _add_contact(row, parent)
            action, target_repr = "ticket.matched", "Ticket {}"
        item_id, provider, connector_id = row.pk, row.provider, row.connector_id
        row.delete()
        audit.record(  # SOC2:LOG-01 who put an outside message on which record (R2D3-20, SE1-20)
            action,
            request=request,
            actor=reader,
            organisation=reader.organisation,
            target=made,
            target_repr=target_repr.format(made.pk),  # never the title
            metadata={
                "item": item_id,
                "provider": provider,
                "connector": connector_id,
                "record": {"type": next(iter(parent)), "id": record.pk},
                "contact_added": added,
            },
        )
        # R2D3-9: due at the next run, whatever the item's age; no model call here.
        if slack:
            touch_conversation(made, now, at=now)
        else:
            touch_ticket(made, now)
    return made, added
```

(Import `touch_conversation` beside `touch_ticket`.)

In `services/work/unmatched_views.py` `UnmatchedMatchView.post`:

```python
made, added = unmatched.match(request.user, pk, request.data, request=request)
...
record = made.customer or made.account
kind = "customer" if made.customer_id else "account"
ref = {"type": kind, "id": record.pk, "name": record.name}
is_ticket = isinstance(made, Ticket)
return Response(
    {
        "record": ref,
        "ticket": (
            {"id": made.pk, "number": made.ticket_number, "record": ref} if is_ticket else None
        ),
        "conversation": None if is_ticket else {"id": made.pk},
        "contact_added": added,
    }
)
```

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.work services.connectors --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/connectors/unmatched.py services/work/unmatched_views.py services/work/tests/
git commit -m "feat(work): matching a Slack message makes a conversation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Slack threads in the story

**Files:**
- Modify: `services/organizations/story/params.py` (`GROUP_KINDS`), `sources.py` (`SOURCES["slack"]`), `items.py` (`_slack`), `services/copilot/organization_detail_grounding.py` (`KIND_LABELS`), `services/organizations/tests/story_fixtures.py` (`slack` maker)
- Test: `services/organizations/tests/test_story_slack.py` (create)

**Interfaces:**
- Consumes: `SlackConversation`, `visible_conversations` (Task 1).
- Produces: story kind `slack` (contract §3); `StoryFixture.slack(parent, **fields)`.

- [ ] **Step 1: Write the failing tests**

In `services/organizations/tests/story_fixtures.py`, add a maker and register it in `make`:

```python
    def slack(self, parent, *, title="Exports fail since this morning.", **fields):
        from services.customers.tests.slack_fixtures import conversation

        return conversation(parent, title=title, **fields)
```

(`"slack": self.slack` in `make`'s dict.)

Create `services/organizations/tests/test_story_slack.py`:

```python
"""Slack escalations D1 contract §3, SE1-15, SE1-16: a Slack thread is a
conversation in the story, read department-wise."""

from django.utils import timezone

from services.customers.tests.slack_fixtures import msg

from .story_fixtures import StoryFixture


class StorySlackTests(StoryFixture):
    def test_it_is_a_conversation_with_its_channel_and_replies(self):
        made = self.slack(
            self.pizza,
            channel_name="all-alfiee",
            messages=[msg("1.1"), msg("1.2", "Ann"), msg("1.3", "revenact", bot=True)],
            last_message_at=timezone.now(),
        )
        body = self.story(group="conversations")
        item = next(i for i in body["items"] if i["kind"] == "slack")
        self.assertEqual(
            (item["id"], item["source"], item["summary"], item["replies"], item["all_day"]),
            (made.pk, "slack", "#all-alfiee · 2 replies", 2, False),
        )
        self.assertEqual(item["actor"], {"id": None, "name": "Faiz Jamal"})
        self.assertEqual(body["counts"]["by_kind"]["slack"], 1)
        self.assertEqual(body["counts"]["by_group"]["tickets"], 0)

    def test_department_wise(self):
        self.slack(self.pizza, department="engineering")
        self.assertEqual(self.story()["counts"]["by_kind"]["slack"], 0)  # Carl is CS
        self.assertEqual(self.story(self.engineer)["counts"]["by_kind"]["slack"], 1)

    def test_search_reads_the_title_poster_and_channel(self):
        self.slack(self.pizza, channel_name="escalations")
        self.assertEqual(self.story(q="escalations")["counts"]["by_kind"]["slack"], 1)
        self.assertEqual(self.story(q="nothing like it")["counts"]["by_kind"]["slack"], 0)

    def test_a_member_is_the_actor(self):
        self.slack(self.pizza, started_by=self.csm)
        item = self.story()["items"][0]
        self.assertEqual(item["actor"], {"id": self.csm.pk, "name": self.csm.name})
```

(If `StoryFixture.engineer`'s story cannot open Pizza Hut, give him view-all for that test the way `test_story_sources.py` does for departments: `grep -n "engineer" services/organizations/tests/test_story_sources.py | head`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.organizations.tests.test_story_slack --parallel auto --noinput`
Expected: FAIL: `KeyError: 'slack'`.

- [ ] **Step 3: The source and the item**

`params.py`: `"conversations": ("activity", "call", "email", "calendar_event", "slack"),` and the comment above `GROUP_KINDS` drops "Slack," from what is not real yet.

`sources.py`: import `SlackConversation` and `visible_conversations`; add

```python
    "slack": Source(
        kind="slack",
        model=SlackConversation,
        at=F("last_message_at"),
        all_day=False,
        rule=visible_conversations,
        text_fields=("title", "started_by_name", "channel_name"),
        related=("started_by",),
    ),
```

and the module docstring's rule list gains "Slack conversations their department's (as tickets)".

`items.py`:

```python
def _slack(row):
    replies = max(len(row.messages or []) - 1, 0)
    parts = [f"#{row.channel_name}" if row.channel_name else "Slack"]
    if replies:
        parts.append("1 reply" if replies == 1 else f"{replies} replies")
    return {
        "title": row.title,
        "summary": " · ".join(parts),
        "actor": person(row.started_by, row.started_by_name),
        "source": "slack",
        "url": row.url,
        "extra": {"replies": replies},
    }
```

and `"slack": _slack` in `_FIELDS`.

`services/copilot/organization_detail_grounding.py`: `KIND_LABELS["slack"] = "Slack thread"` (in the dict literal). `COUNTED_GROUP_KINDS` is unchanged (SE1-16).

- [ ] **Step 4: Run them, then the story and Copilot suites**

Run: `$PY manage.py test services.organizations services.account_story services.copilot --parallel auto --noinput`
Expected: PASS. A test iterating `KINDS` that asserts an exact list or count of kinds gains `slack`; update the expected list, nothing else. Story query pins rise by at most 2 (the slack page and count queries): note the numbers for Task 12.

- [ ] **Step 5: Commit**

```bash
git add services/organizations/ services/copilot/organization_detail_grounding.py services/account_story/
git commit -m "feat(organizations): Slack threads in the story's conversations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Reading one Slack thread

**Files:**
- Create: `services/customers/slack_views.py`, `services/customers/tests/test_slack_views.py`
- Modify: `config/urls.py`

**Interfaces:**
- Produces: `GET /api/v1/slack-conversations/<int:pk>/` (contract §4), view `SlackConversationView`, url name `slack-conversation`.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_slack_views.py`:

```python
"""Slack escalations D1 contract §4: one thread, under the story's two rules."""

from services.agents.tests.intake_fixtures import IntakeFixture
from services.customers.models import Customer
from services.customers.tests.slack_fixtures import conversation, msg

URL = "/api/v1/slack-conversations/{}/"


class SlackConversationViewTests(IntakeFixture):
    def test_the_thread_oldest_first(self):
        made = conversation(
            self.pizza,
            self.connector("slack", "cs"),
            channel_name="all-alfiee",
            messages=[
                msg("1792041415.357099"),
                msg("1792041500.000100", "revenact", "On it.", bot=True),
            ],
        )
        body = self.client_for(self.csm).get(URL.format(made.pk)).json()
        self.assertEqual(
            body["record"], {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(body["channel"], "#all-alfiee")
        self.assertEqual([m["bot"] for m in body["messages"]], [False, True])
        self.assertEqual(body["messages"][1]["at"], "2026-10-15T05:18:20Z")
        self.assertNotIn("started_by_email", body)
        self.assertEqual(body["matched_by"], "name")

    def test_another_department_reads_it_as_missing(self):
        made = conversation(self.pizza, self.connector("slack", "engineering"))
        self.assertEqual(self.client_for(self.csm).get(URL.format(made.pk)).status_code, 404)

    def test_a_record_the_reader_cannot_open_reads_as_missing(self):
        made = conversation(self.taco, self.connector("slack", "cs"))  # Dana's Taco Bell
        self.assertEqual(self.client_for(self.csm).get(URL.format(made.pk)).status_code, 404)
        self.assertEqual(self.client_for(self.other).get(URL.format(made.pk)).status_code, 200)

    def test_another_workspace_reads_as_missing(self):
        from services.accounts.models import Organisation

        elsewhere = Customer.objects.create(
            organisation=Organisation.objects.create(name="Elsewhere"), name="Theirs"
        )
        made = conversation(elsewhere)
        self.assertEqual(self.client_for(self.admin).get(URL.format(made.pk)).status_code, 404)
```

(`"2026-10-15T05:18:20Z"` is `1792041500` in UTC; if the fixture's DRF renders `+00:00`, render with `.isoformat().replace("+00:00", "Z")` in the view, as the contract shows `Z`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.customers.tests.test_slack_views --parallel auto --noinput`
Expected: FAIL: 404 on the first test (no route).

- [ ] **Step 3: The view and the route**

Create `services/customers/slack_views.py`:

```python
"""GET /api/v1/slack-conversations/<id>/ (Slack escalations D1, contract §4):
one Slack thread, read under the story's two rules: the record the reader may
open, then its department (personal.visible_conversations)."""

from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services.connectors.providers.slack import ts_time

from .models import Account, SlackConversation
from .personal import visible_conversations
from .scoping import can_open

NOT_FOUND = {"detail": "Not found."}


def _at(ts):
    return ts_time(ts).isoformat().replace("+00:00", "Z")


class SlackConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        mine = Q(customer__organisation_id=user.organisation_id) | Q(
            account_id__in=Account.objects.filter(
                customers__organisation_id=user.organisation_id
            ).values("id")
        )
        # SOC2:AUTH-02 the workspace, then the department, then the record: any refusal is a 404
        row = (
            visible_conversations(user, SlackConversation.objects.filter(mine, pk=pk))
            .select_related("customer", "account", "started_by")
            .first()
        )
        if row is None or not can_open(user, row.record):
            return Response(NOT_FOUND, status=404)
        record = row.record
        return Response(
            {
                "id": row.pk,
                "record": {
                    "type": "account" if row.account_id else "customer",
                    "id": record.pk,
                    "name": record.name,
                },
                "channel": f"#{row.channel_name}" if row.channel_name else "",
                "url": row.url,
                "title": row.title,
                "started_by": {
                    "id": row.started_by_id,
                    "name": row.started_by.name if row.started_by else row.started_by_name,
                },
                "matched_by": row.matched_by,
                "messages": [
                    {
                        "ts": m["ts"],
                        "name": m.get("name", ""),
                        "at": _at(m["ts"]),
                        "text": m.get("text", ""),
                        "bot": bool(m.get("bot")),
                    }
                    for m in row.messages or []
                ],
            }
        )
```

In `config/urls.py`, import `from services.customers.slack_views import SlackConversationView` and add near the other `api/v1/` record routes:

```python
(
    path(
        "api/v1/slack-conversations/<int:pk>/",
        SlackConversationView.as_view(),
        name="slack-conversation",
    ),
)
```

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.customers.tests.test_slack_views --parallel auto --noinput && $PY manage.py spectacular --file /tmp/schema.yml --validate`
Expected: PASS; schema builds (add `@extend_schema(responses=...)` only if `spectacular` warns, as neighbouring views do).

- [ ] **Step 5: Commit**

```bash
git add services/customers/slack_views.py services/customers/tests/test_slack_views.py config/urls.py
git commit -m "feat(customers): read one Slack thread

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Move Slack tickets to conversations

**Files:**
- Create: `services/agents/migrations/0008_slack_tickets_to_conversations.py`, `services/agents/tests/test_slack_conversations_migration.py`

**Interfaces:**
- Consumes: the schema of Tasks 1, 4, 5.
- Produces: the data migration of SE1-18.

- [ ] **Step 1: Write the failing test**

Create `services/agents/tests/test_slack_conversations_migration.py`, mirroring `test_bundles_migration.py`'s `migrate` / `tearDown`:

```python
"""agents.0008_slack_tickets_to_conversations (SE1-18): a Slack ticket becomes
a conversation; its thread and its Slack reply steps follow; other tickets stay."""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

BEFORE = [("agents", "0007_signal_thread_conversation")]
AFTER = [("agents", "0008_slack_tickets_to_conversations")]


class SlackTicketsMigrationTests(TransactionTestCase):
    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        self.migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_a_slack_ticket_becomes_a_conversation(self):
        apps = self.migrate(BEFORE)
        Organisation = apps.get_model("accounts", "Organisation")
        User = apps.get_model("accounts", "User")
        Customer = apps.get_model("customers", "Customer")
        Connector = apps.get_model("connectors", "Connector")
        Ticket = apps.get_model("customers", "Ticket")
        Thread = apps.get_model("agents", "SignalThread")
        Bundle = apps.get_model("agents", "AgentBundle")
        Action = apps.get_model("metrics", "AgentAction")
        org = Organisation.objects.create(name="Alfiee", currency="USD")
        faiz = User.objects.create(email="faiz@alfee.io", name="Faiz", organisation=org)
        globex = Customer.objects.create(organisation=org, name="Globex (QA)", owner=faiz)
        slack = Connector.objects.create(
            organisation=org,
            provider="slack",
            name="Slack",
            config={"channel": "C0CA7PPRP7A", "channel_name": "all-alfiee"},
        )
        zendesk = Connector.objects.create(organisation=org, provider="zendesk", name="ZD")
        common = {
            "customer": globex,
            "assignee_name": "Unassigned",
            "priority": "high",
            "opened_at": timezone.localdate(),
        }
        ticket = Ticket.objects.create(
            **common,
            connector=slack,
            external_id="1792041415.357099",
            ticket_number="SL-15357099",
            title="CSV exports failing",
            description="Hi team, our CSV exports have been failing since this morning, urgent.",
            requester_name="Mohd faiz",
            requester_email="FAIZ@alfee.io",
            external_url="https://slack.com/archives/C0CA7PPRP7A/p1792041415357099",
            department="",
        )
        other = Ticket.objects.create(
            **common, connector=zendesk, external_id="9", ticket_number="ZD-9", title="Kept"
        )
        thread = Thread.objects.create(
            organisation=org,
            source_kind="slack",
            external_id=f"{slack.pk}:1792041415.357099",
            customer=globex,
            ticket=ticket,
            last_message_at=timezone.now(),
        )
        bundle = Bundle.objects.create(
            organisation=org, agent="cs", title="Globex", source="thread", thread=thread
        )
        step = Action.objects.create(
            organisation=org,
            agent="cs",
            batch="b",
            kind="slack.reply",
            customer=globex,
            target=f"draft:ticket:{ticket.pk}",
            title="Answer",
            rationale="Why.",
            payload={"ticket_id": ticket.pk, "connector_id": slack.pk, "text": "On it."},
            status="proposed",
            before="resolved",
            bundle=bundle,
            position=1,
        )

        apps = self.migrate(AFTER)
        Conversation = apps.get_model("customers", "SlackConversation")
        Ticket = apps.get_model("customers", "Ticket")
        Thread = apps.get_model("agents", "SignalThread")
        Action = apps.get_model("metrics", "AgentAction")
        made = Conversation.objects.get()
        self.assertEqual(
            (made.customer_id, made.connector_id, made.thread_ts, made.matched_by),
            (globex.pk, slack.pk, "1792041415.357099", "earlier"),
        )
        self.assertEqual((made.channel, made.channel_name), ("C0CA7PPRP7A", "all-alfiee"))
        self.assertEqual(made.messages[0]["name"], "Mohd faiz")
        self.assertEqual(made.started_by_id, faiz.pk)  # email matched case-insensitively
        self.assertEqual(made.last_message_at.timestamp(), 1792041415.357099)
        self.assertEqual(list(Ticket.objects.values_list("pk", flat=True)), [other.pk])
        moved = Thread.objects.get(pk=thread.pk)
        self.assertEqual((moved.conversation_id, moved.ticket_id), (made.pk, None))
        step = Action.objects.get(pk=step.pk)
        self.assertEqual(step.payload["conversation_id"], made.pk)
        self.assertNotIn("ticket_id", step.payload)
        self.assertEqual((step.target, step.before), (f"draft:conversation:{made.pk}", "open"))
```

(Match the real required fields of `AgentBundle` and `AgentAction` against their models: `grep -n "= models\." services/agents/models.py | sed -n 1,60p`, `services/metrics/models.py`; add any required field the model has with a plain value. If `migrate(BEFORE)` fails because a later migration in another app depends on `agents.0007`, add that app's previous migration to `BEFORE` as `test_bundles_migration.py` does.)

- [ ] **Step 2: Run it to see it fail**

Run: `$PY manage.py test services.agents.tests.test_slack_conversations_migration --parallel 1 --noinput`
Expected: FAIL: `NodeNotFoundError` for `0008_slack_tickets_to_conversations`.

- [ ] **Step 3: The migration**

Create `services/agents/migrations/0008_slack_tickets_to_conversations.py` (check the latest `metrics` and `connectors` migration names: `ls services/metrics/migrations services/connectors/migrations | tail`):

```python
"""Slack escalations D1 (SE1-18): every Slack ticket becomes a Slack
conversation; its thread and its Slack reply steps follow; the ticket goes
(its reply drafts with it). Forwards only."""

from datetime import UTC, datetime, time

from django.db import migrations


def _at(ticket):
    try:
        return datetime.fromtimestamp(float(ticket.external_id), tz=UTC)
    except (TypeError, ValueError):
        return datetime.combine(ticket.opened_at, time.min, tzinfo=UTC)


def forwards(apps, schema_editor):
    Ticket = apps.get_model("customers", "Ticket")
    Conversation = apps.get_model("customers", "SlackConversation")
    Thread = apps.get_model("agents", "SignalThread")
    Action = apps.get_model("metrics", "AgentAction")
    User = apps.get_model("accounts", "User")
    for ticket in Ticket.objects.filter(connector__provider="slack").select_related("connector"):
        connector = ticket.connector
        config = connector.config or {}
        ts = (ticket.external_id or str(ticket.pk))[:32]
        email = (ticket.requester_email or "").lower()
        member = (
            User.objects.filter(
                organisation_id=connector.organisation_id, email__iexact=email, is_active=True
            ).first()
            if email
            else None
        )
        conversation, _ = Conversation.objects.get_or_create(
            connector=connector,
            thread_ts=ts,
            defaults={
                "customer_id": ticket.customer_id,
                "account_id": ticket.account_id,
                "department": ticket.department,
                "channel": str(config.get("channel", ""))[:32],
                "channel_name": str(config.get("channel_name", ""))[:80],
                "title": ticket.title[:255],
                "messages": [
                    {
                        "ts": ts,
                        "user_id": "",
                        "name": ticket.requester_name,
                        "text": (ticket.description or "")[:3000],
                        "bot": False,
                    }
                ],
                "started_by": member,
                "started_by_name": ticket.requester_name,
                "started_by_email": email,
                "url": ticket.external_url or "",
                "last_message_at": _at(ticket),
                "matched_by": "earlier",
                "external_shared": bool(config.get("external_shared")),
            },
        )
        Thread.objects.filter(ticket_id=ticket.pk).update(
            conversation_id=conversation.pk, ticket_id=None
        )
        for step in Action.objects.filter(kind="slack.reply", payload__ticket_id=ticket.pk):
            payload = {k: v for k, v in step.payload.items() if k != "ticket_id"}
            payload["conversation_id"] = conversation.pk
            step.payload = payload
            step.target = f"draft:conversation:{conversation.pk}"
            fields = ["payload", "target"]
            if step.status == "proposed":
                step.before = "open"  # nothing resolves a conversation (SE1-13)
                fields.append("before")
            step.save(update_fields=fields)
        ticket.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0007_signal_thread_conversation"),
        ("customers", "0062_slackconversation"),
        ("connectors", "0007_unmatched_candidates"),
        ("metrics", "0018_agent_action_jira_comment"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
```

- [ ] **Step 4: Run it to see it pass**

Run: `$PY manage.py test services.agents.tests.test_slack_conversations_migration --parallel 1 --noinput && $PY manage.py makemigrations --check --dry-run`
Expected: PASS; "No changes detected".

- [ ] **Step 5: Commit**

```bash
git add services/agents/migrations/0008_slack_tickets_to_conversations.py services/agents/tests/test_slack_conversations_migration.py
git commit -m "feat(agents): move Slack tickets to conversations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Query ceilings and the journey

**Files:**
- Create: `services/customers/tests/test_slack_queries.py`, `e2e/test_slack_conversations_flow.py`
- Modify: the pinned ceilings that moved (Tasks 4, 7, 9 noted them): `grep -rn "UNMATCHED_LIST_QUERIES\|THREAD_RUN_QUERIES\|STORY_QUERIES\|QUERIES =" services/*/tests | head -30`

**Interfaces:**
- Produces: `SLACK_CONVERSATION_QUERIES`, `SLACK_SYNC_QUERIES` (SE1-19).

- [ ] **Step 1: The pins**

Create `services/customers/tests/test_slack_queries.py`:

```python
"""SE1-19: the Slack conversation route and a Slack pass cost a fixed number
of queries, whatever the thread's length."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import sync
from services.connectors.models import Connector
from services.connectors.tests.slack_fake import use_slack
from services.customers.tests.slack_fixtures import conversation, msg

SLACK_CONVERSATION_QUERIES = 0  # measured in Step 2
SLACK_SYNC_QUERIES = 0  # measured in Step 2


class SlackQueryTests(IntakeFixture):
    def test_the_route_is_constant_in_messages(self):
        client = self.client_for(self.csm)
        for n in (1, 40):
            made = conversation(
                self.pizza,
                self.connector("slack", "cs"),
                messages=[msg(f"17920414{i:02d}.000100") for i in range(n)],
            )
            with CaptureQueriesContext(connection) as seen:
                self.assertEqual(
                    client.get(f"/api/v1/slack-conversations/{made.pk}/").status_code, 200
                )
            self.assertEqual(len(seen), SLACK_CONVERSATION_QUERIES, [q["sql"] for q in seen])

    def test_a_pass_of_three_threads(self):
        api = use_slack(self)
        slack = self.connector("slack", "cs")
        slack.set_credentials({"bot_token": "xoxb-test-only"})
        slack.config = {"channel": "C0SUPPORT", "channel_name": "support"}
        slack.status = Connector.Status.CONNECTED
        slack.save()
        for text in ("Pizza Hut exports fail", "Pizza Hut login loops", "Lunch?"):
            api.say("C0SUPPORT", "U0FAIZ", text)
        with CaptureQueriesContext(connection) as seen:
            sync.sync_connector(slack)
        self.assertEqual(len(seen), SLACK_SYNC_QUERIES, [q["sql"] for q in seen])
```

- [ ] **Step 2: Measure, then pin**

Run: `$PY manage.py test services.customers.tests.test_slack_queries --parallel 1 --noinput`, read the measured counts from the failure messages, set both constants, run again (PASS). Re-pin every ceiling Tasks 4, 7 and 9 noted, each within the contract's allowance (SE1-19): if one exceeds it, fix the extra query (a `select_related`, a preload) instead of raising the pin. `grep -rn "DISTINCT\|\.distinct()" services/customers/slack_views.py services/connectors/naming.py services/connectors/sync.py services/connectors/unmatched.py` prints nothing.

- [ ] **Step 3: The journey**

Create `e2e/test_slack_conversations_flow.py` on the pattern of `e2e/test_agent_round2_intake_flow.py` (a `LiveServerTestCase` with `e2e/http.py`; read it first: `sed -n 1,80p e2e/test_agent_round2_intake_flow.py`). With `FakeSlackApi` patched and the model patched to a fixed answer:

1. An admin connects a Slack connection through `POST /api/v1/connectors/<id>/connect/` with a fake token while the bot is not a member: 400 "Invite the bot to #support first, then connect."; adds the bot (`fake.members.add`), connects: 201.
2. A colleague posts "Pizza Hut exports fail" and a reply; `sync_tickets` runs (the management command); `GET /api/v1/organizations/<pizza>/story/?group=conversations` lists one `slack` item with "1 reply"; `?group=tickets` lists none; `GET /api/v1/slack-conversations/<id>/` returns both messages.
3. A message naming no customer appears under `GET /api/v1/work/unmatched/?queue=department:cs` with `mentioned: []`; matching it to Pizza Hut answers `conversation` and the story then shows two Slack items.
4. `run_agent_signals --organisation <id>` (with the quiet window passed by moving `last_message_at` back as the D2 journey does) proposes a bundle whose `slack.reply` step's payload names the conversation; running it posts into the thread (`fake.posts("C0SUPPORT")` has one bot message with `thread_ts` set); the next sync stores our reply and the thread reads `answered`.

Run: `$PY manage.py test e2e.test_slack_conversations_flow --parallel 1 --noinput`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/customers/tests/test_slack_queries.py e2e/test_slack_conversations_flow.py <each re-pinned test file>
git commit -m "test: Slack conversation ceilings and the journey

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Docs and the full check

**Files:**
- Modify: `docs/API_CONTRACTS.md` (a new section "Slack escalations, delivery 1: Slack as a conversation (2026-10-15)", from the contract, with the measured ceilings), `docs/audit-events.md` (`conversation.matched`), `docs/data-classification.md` (`SlackConversation`: colleague message text, Confidential, minimised, deleted with its record; `UnmatchedItem.candidates`: ids only), `.soc2/CONTROL_MAP.md` (AUTH-02 `visible_conversations`; DATA-04 minimisation), `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, `.agents/workflows/agent-intake-flow.md`, `.agents/workflows/agent-outside-flow.md`, this repo's copy of the contract's "Changes during the build".

- [ ] **Step 1: The docs**

Follow the `api-contracts` skill for `docs/API_CONTRACTS.md`. In each product document, say: Slack threads are conversations (never tickets), how the customer is found (channel, name, Needs a customer), what is kept (SE1-3), who reads them (SE1-15), the new route, the migration. In the flow docs: the Slack pass (§2) and the Slack thread block and reply (SE1-13). Record in the contract's "Changes during the build" every deviation and the measured ceilings, and send the same list to the frontend controller.

- [ ] **Step 2: The full check**

```bash
$PY manage.py test --parallel auto --noinput
$PY manage.py makemigrations --check --dry-run
$PY manage.py spectacular --file /tmp/schema.yml --validate
venv/bin/ruff check . && venv/bin/ruff format --check .
grep -rn "fetch_tickets" services/connectors/providers/slack.py || echo "slack fetch_tickets gone"
grep -rn "DONE_REACTIONS\|URGENT_WORDS" services/ || echo "ticket-only Slack rules gone"
```

Expected: every test passes (write the count into the hand-off), no migration missing, schema valid, ruff clean, both greps print their "gone" line.

- [ ] **Step 3: Commit and push**

```bash
git add docs/ .soc2/CONTROL_MAP.md .agents/workflows/agent-intake-flow.md .agents/workflows/agent-outside-flow.md
git commit -m "docs: Slack conversations (Slack escalations D1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/slack-escalations-d1
```

Hand-off (to the controller, not a PR): the head, the test count, the measured ceilings, "Changes during the build", and the owner's set-up and live checks (contract §12).

---

## Self-review

1. **Spec coverage (§3, §15).** §3.1 model: Task 1. §3.2 sync, replies, 7 days, connect membership, `URGENT_WORDS`/✅ gone: Tasks 2, 6. §3.3 channel, name, unsure: Tasks 3, 6 (the channel setting's control is the frontend's; the backend's `PATCH` already exists). §3.4 Needs a customer for Slack (colleagues kept, candidates, match makes a conversation, no contact box): Tasks 4, 8. §3.5 agents read conversations, `touch_conversation`, fast lane: Tasks 5, 7. §3.6 visibility: Tasks 1, 9, 10. §3.7 story: Task 9; the thread read: Task 10. §3.8 migration: Task 11. §9 D1 tests: across Tasks 1 to 12 (stored whole and capped: Task 6 `_apply_thread` and Task 2; bot never wakes: Tasks 5, 6; ✅ changes nothing: Task 2 removes it; channel scope, one/none/two names: Tasks 3, 6; members kept: Tasks 4, 6; match: Task 8; migration of waiting and done Slack steps: Task 11 (status-agnostic payload rewrite); department visibility: Tasks 1, 9, 10; story counts and search: Task 9; connect refusal: Task 2).
2. **Placeholders.** Each code step holds its code. Where a step depends on a file this plan has not quoted (an existing test class's helper, a model's required fields), it names the `grep` / `sed` that shows it and what to copy.
3. **Type consistency.** `RemoteThread` (Task 2) is what `file_conversation` (Task 6) reads; `naming.Name` / `find` / `covered_names` (Task 3) are what Task 6 calls; `keep(..., candidates=)` (Task 4) is what Task 6 passes; `touch_conversation(conversation, now, *, at=)` (Task 5) is what Tasks 6, 7 (fixtures) and 8 call; `ctx.thread_slack` (Task 7) is what `offered` and `slack_replies.validate` read; `SlackConversation.MatchedBy` values (Task 1) are what Tasks 6, 8, 11 write; the match answer (Task 8) is contract §6's.

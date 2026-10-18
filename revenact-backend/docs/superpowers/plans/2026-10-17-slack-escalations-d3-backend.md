# Slack escalations, delivery 3 (backend): every public channel syncs, pushed by Slack's Events API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Slack connection covers every public channel of its Slack workspace: Slack pushes each message to a new public Events endpoint, which files it at once (by the channel's own customer or the name it carries); the bot joins new public channels itself (`channels:join`, on `channel_created` and each pass); an admin can exclude a channel or set it to one customer; a slow catch-up (one history call and one replies call a pass, at least 60 seconds apart, 15 objects each) reads what events missed; today's single-channel connections (connection 7, `#all-alfiee`) keep working through a data migration; Slack Connect channels are listed but excluded by default.

**Architecture:** A new model `connectors.SlackChannel` (one row per channel: included, joined, shared, its record, the catch-up's watermark and walk, missed threads, the last event). `SlackProvider` loses the 7-day multi-page `fetch_threads` and gains small reads that fit Slack's 2025 limits (`read_page`, `read_thread`), shared per-message rules (`is_top`, `reply_of`, `thread_of`), `list_channels` and `join_channel`. `services/connectors/slack_channels.py` lists, defaults, joins and picks; `slack_catchup.py` is the slow poll; `slack_events.py` + `slack_events_views.py` are the push path, reusing #139's signature check. Both paths file through `sync.file_conversation`, whose replies now merge. Two routes for Settings › Connections and the reply's "move to another channel" list learn many channels per connection.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15). Tests: `django.test`, `rest_framework.test`, `TransactionTestCase` + `MigrationExecutor` for the data migration, `LiveServerTestCase` + `e2e/http.py`; Slack is the in-memory fake (`services/connectors/tests/slack_fake.py`); events are signed with a per-run secret.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-15-slack-escalations-design.md` **§16.1** and **§16.4** (Events API, 2026-10-17), §3 (D1), §10 (D3 row), §11 (LC-D3a to d). **Binding contract:** `docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md` (this repo). Read its survey table and "Decisions narrowing the spec" (SC3-1 to SC3-31) before any task; every decision is a requirement here.

This plan replaces the polling D3 backend plan written earlier on 2026-10-17 (up to 10 channels read a pass). Tasks 1, 5, 7 and 8 are that plan's Tasks 1, 5, 6 and 7 with small changes; Tasks 2 to 4 are rewritten for Slack's 2025 limits; Tasks 6 (the Events endpoint) and 10 (the rebase onto D4) are new.

## The survey (condensed from the contract)

| Piece | State | Here |
|---|---|---|
| One channel per connection (`config["channel"]`): setup field, `connect`, `_replies`, `fetch_threads`, OAuth form | partial | Task 2 |
| The workspace's public channels, membership, Slack Connect | missing | Task 2 (`list_channels`), Task 3 |
| Joining | missing | Task 2 (`join_channel`, the scope), Task 3, Task 6 (`channel_created`) |
| Reading 7 days, 5 pages, 50 threads a pass | partial, too big for 1 call a minute | Task 2 (`read_page`, `read_thread`), Task 4 (the catch-up) |
| Messages pushed to us | missing | Task 6 (`POST /connectors/slack/events/`) |
| Slack's v0 signature, team to connections, per-IP throttle | exists (#139) | reused in Task 6 |
| Customer by the connection's single record, else the name | partial | the channel's record, else the name (Task 4) |
| Keys: conversation, agent thread, unmatched | partial | with the channel (Tasks 1, 4, 5) |
| Shared flag per connection | partial | per channel (Tasks 3, 4) |
| "Move the reply to another channel" | partial | per channel (Task 8) |
| Connection payload, rights, audit | exists | `slack_channels` block with `events_at`, two routes, `slack_channel.update` (Task 7) |

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-backend-slackd3` on branch `feat/slack-escalations-d3`. **The build starts from current `origin/main`**: `git fetch origin && git rebase origin/main` before Task 1 (the branch holds only this plan and the contract). Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them), never touch `revenact-backend/`, `revenact-backend-main/`, or the D4 worktrees `revenact-backend-slackd4/` and `react-ts-app-slackd4/`.
- **D4 is being built now** on `feat/slack-escalations-d4` (it owns `customers.0063_escalation_links`). D3 generates its `customers` migration on main's numbering (`0063_slackconversation_channel_once`). Task 10, before the PR: if D4 has merged, rebase onto it, renumber to `0064` and port D4's provider and sync behaviours; if not, the PR body states the expected renumber (contract "Migrations, D4 and the rebase").
- Python: link the venv once, `ln -s ../revenact-backend-main/venv venv` (never `git add` it). Written `PY` below: `PY=venv/bin/python`. Ruff: `venv/bin/ruff`.
- `.env` (copy `../revenact-backend-main/.env` if absent; never commit it) points at the shared dev database `revenact`: **never migrate it, never write to it.** Tests use their own test database.
- Run tests as `$PY manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially. Mac hang workaround: after about 10 minutes with no progress, `pkill -f "manage.py test"` and run again; a second stall: `--parallel 1` on those labels.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (`ruff format` also formats Python blocks inside Markdown; run `venv/bin/ruff format .` if the check fails, docs included).
- Every commit message is a conventional commit (`commit-messages` skill) and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths; never `git add -A` or `git add .`. Never `git stash`.
- **CI is blocked by GitHub billing:** local checks are the gate. Task 9 runs the full suite (`--parallel auto`), `makemigrations --check`, `manage.py spectacular` and ruff.
- **Nothing real is sent**: Slack is `use_slack` (`FakeSlackApi`) in every test; agent tests use `OutsideFixture`; signed events use a per-run secret (`secrets.token_hex(16)`), never a real one.
- **Postgres 16:** no `DISTINCT`, no join made unique; filter by column (`id IN` subqueries); counts by subquery annotations. Query counts are pinned exactly (contract §6): "measured" means pin the measured number after checking every query is one of the kinds the step lists, and record it in the contract's "Changes during the build".
- **Slack's limits are law here** (contract SC3-6): no code path calls `conversations.history` or `conversations.replies` more than once per connection per pass, or with `limit` above 15, except `find_message` (unchanged, SC3-31).
- Every capability or visibility gate carries `# SOC2:AUTH-02 ...`; every audited write `# SOC2:LOG-01 ...`; the public endpoint's signature check `# SOC2:API-11 ...` and its throttle `# SOC2:API-04 ...`. Audit metadata and log lines hold ids, counts and codes, never a channel name, a Slack user id or message text.
- User-facing sentences are exactly the contract's. No em dash in any sentence a person reads, nor in new code comments.
- No new dependency. One new setting with a default: `THROTTLE_SLACK_EVENTS` (default `1200/min`). Three migrations: `connectors.0009_slackchannel`, `customers.0063_slackconversation_channel_once` (both from `makemigrations connectors customers`), `connectors.0010_slack_channels_from_config` (hand-written data migration).
- **Product documents rule:** `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `.soc2/CONTROL_MAP.md`, `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, and the flow doc under `.agents/workflows/` for the Slack sync and events, updated in this PR (Task 9).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/connectors/models.py`, `migrations/0009_slackchannel.py` | modify/create | `SlackChannel` (contract §1.1) |
| `services/customers/models.py`, `migrations/0063_slackconversation_channel_once.py` | modify/create | the conversation's key with its channel (§1.2) |
| `services/connectors/migrations/0010_slack_channels_from_config.py` | create | SC3-11 |
| `services/agents/threads.py` | modify | `touch_conversation`'s key with the channel |
| `services/connectors/providers/slack.py` | modify | scopes, setup, `connect`, `list_channels`, `join_channel`, `Budget`, `is_top`, `is_ours`, `reply_of`, `thread_of`, `read_page`, `read_thread`; `fetch_threads` and `_replies*` go |
| `services/connectors/views.py` | modify | OAuth keeps `chat:write`; consent without a channel; `with_ingested` channel counts |
| `services/connectors/slack_channels.py` | create | SC3-3 to SC3-5; the catch-up's picks; missed threads |
| `services/connectors/slack_catchup.py` | create | SC3-6, SC3-26 |
| `services/connectors/sync.py` | modify | the pass; `file_conversation(channel=...)`; merged replies; `stored_remote`, `edit_message`, `delete_message`; unmatched keys |
| `services/connectors/unmatched.py` | modify | `slack_key`, `split_slack_key`; a match in the right channel |
| `services/connectors/slack_events.py`, `slack_events_views.py` | create | SC3-7, SC3-23 to SC3-30 |
| `core/throttling.py`, `config/settings.py` | modify | `SlackEventsThrottle`, `THROTTLE_SLACK_EVENTS` |
| `services/connectors/slack_channel_views.py`, `urls.py`, `serializers.py` | create/modify | SC3-15 to SC3-17, SC3-30 |
| `services/agents/outside/slack_channels.py`, `actions/slack_replies.py`, `outside/gates.py` | modify | SC3-18 |
| `services/connectors/tests/slack_fake.py`, `tests/slack_events_fixtures.py` | modify/create | `conversations.list`, `.join`, history newest first with `latest`; signed events |
| tests (each task), `e2e/test_slack_channels_flow.py` | create/modify | |

---

### Task 1: The channel table, keys with the channel, and the migration

**Files:**
- Modify: `services/connectors/models.py` (`SlackChannel`), `services/customers/models.py` (`SlackConversation.Meta`), `services/agents/threads.py:139`
- Create: `services/connectors/migrations/0009_slackchannel.py`, `services/customers/migrations/0063_slackconversation_channel_once.py` (both `makemigrations connectors customers`), `services/connectors/migrations/0010_slack_channels_from_config.py`, `services/connectors/tests/test_slack_channel_model.py`, `services/connectors/tests/test_slack_channels_migration.py`

**Interfaces:**
- Produces: `connectors.SlackChannel` (contract §1.1; `related_name="slack_channels"` on the connector, `record` property, `MAX_MISSED = 50`); `SlackConversation` unique on (`connector`, `channel`, `thread_ts`); a Slack thread's key `"<connector id>:<channel>:<ts>"`.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_slack_channel_model.py`:

```python
"""Slack escalations D3, contract §1, SC3-2, SC3-10: a connection's channels,
one row each, at most one record; two channels may hold the same ts; an
agent thread's key carries its channel."""

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.agents import threads
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import SlackChannel
from services.customers.models import Account
from services.customers.tests.slack_fixtures import conversation


class SlackChannelModelTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()

    def test_one_row_per_channel_of_a_connection(self):
        SlackChannel.objects.create(connector=self.support, channel_id="C0SUPPORT", name="support")
        with self.assertRaises(IntegrityError), transaction.atomic():
            SlackChannel.objects.create(
                connector=self.support, channel_id="C0SUPPORT", name="again"
            )
        self.assertEqual(self.support.slack_channels.count(), 1)

    def test_defaults_and_its_record(self):
        row = SlackChannel.objects.create(connector=self.support, channel_id="C0NEW", name="new")
        self.assertEqual(
            (
                row.included,
                row.is_member,
                row.external_shared,
                row.is_archived,
                row.record,
                row.missed,
                row.walk_before,
                row.read_at,
                row.event_at,
            ),
            (True, False, False, False, None, [], "", None, None),
        )
        row.customer = self.pizza
        row.save()
        self.assertEqual(row.record, self.pizza)

    def test_never_both_a_customer_and_an_account(self):
        account = Account.objects.create(name="Pizza EMEA")
        account.customers.add(self.pizza)
        with self.assertRaises(IntegrityError), transaction.atomic():
            SlackChannel.objects.create(
                connector=self.support,
                channel_id="C0BOTH",
                name="both",
                customer=self.pizza,
                account=account,
            )

    def test_two_channels_may_hold_the_same_ts(self):
        conversation(self.pizza, self.support, thread_ts="1792041400.000100", channel="C0SUPPORT")
        conversation(self.pizza, self.support, thread_ts="1792041400.000100", channel="C0OTHER")
        with self.assertRaises(IntegrityError), transaction.atomic():
            conversation(
                self.pizza, self.support, thread_ts="1792041400.000100", channel="C0SUPPORT"
            )

    def test_an_agent_thread_s_key_carries_its_channel(self):
        made = conversation(
            self.pizza, self.support, thread_ts="1792041400.000100", channel="C0SUPPORT"
        )
        thread = threads.touch_conversation(made, timezone.now())
        self.assertEqual(thread.external_id, f"{self.support.pk}:C0SUPPORT:1792041400.000100")
```

(If `Account.objects.create` needs more fields, copy them from how `SegmentFixture` makes Pizza EMEA.)

Create `services/connectors/tests/test_slack_channels_migration.py`:

```python
"""connectors.0010_slack_channels_from_config (SC3-11): a one-channel Slack
connection becomes a connection with that channel, caught up as of the
migration; its single record moves onto the channel; its agent threads and
waiting rows take the new keys."""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

BEFORE = [("connectors", "0009_slackchannel")]
AFTER = [("connectors", "0010_slack_channels_from_config")]


class SlackChannelsMigrationTests(TransactionTestCase):
    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        self.migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def world(self, apps, **config):
        Organisation = apps.get_model("accounts", "Organisation")
        Customer = apps.get_model("customers", "Customer")
        Connector = apps.get_model("connectors", "Connector")
        org = Organisation.objects.create(name="Alfiee", currency="USD")
        globex = Customer.objects.create(organisation=org, name="Globex (QA)")
        slack = Connector.objects.create(
            organisation=org,
            provider="slack",
            name="Slack",
            config={"channel": "C0CA7PPRP7A", "channel_name": "all-alfiee", **config},
        )
        return org, globex, slack

    def test_connection_7_keeps_its_channel_threads_and_waiting_rows(self):
        apps = self.migrate(BEFORE)
        org, globex, slack = self.world(apps)
        Conversation = apps.get_model("customers", "SlackConversation")
        Thread = apps.get_model("agents", "SignalThread")
        Unmatched = apps.get_model("connectors", "UnmatchedItem")
        made = Conversation.objects.create(
            customer=globex,
            connector=slack,
            channel="C0CA7PPRP7A",
            channel_name="all-alfiee",
            thread_ts="1792041415.357099",
            title="CSV exports failing",
            last_message_at=timezone.now(),
            matched_by="earlier",
        )
        thread = Thread.objects.create(
            organisation=org,
            source_kind="slack",
            external_id=f"{slack.pk}:1792041415.357099",
            customer=globex,
            conversation=made,
            last_message_at=timezone.now(),
        )
        waiting = Unmatched.objects.create(
            organisation=org,
            connector=slack,
            provider="slack",
            external_id="1792041500.000100",
            number="#all-alfiee",
            opened_on=timezone.localdate(),
            first_seen_at=timezone.now(),
            last_seen_at=timezone.now(),
        )
        before = timezone.now()
        apps = self.migrate(AFTER)
        Channel = apps.get_model("connectors", "SlackChannel")
        row = Channel.objects.get(connector_id=slack.pk)
        self.assertEqual(
            (
                row.channel_id,
                row.name,
                row.included,
                row.is_member,
                row.is_private,
                row.customer_id,
            ),
            ("C0CA7PPRP7A", "all-alfiee", True, True, False, None),
        )
        # SC3-11: the poll already read these 7 days; the catch-up starts from now
        self.assertGreaterEqual(row.read_at, before)
        Thread = apps.get_model("agents", "SignalThread")
        Unmatched = apps.get_model("connectors", "UnmatchedItem")
        self.assertEqual(
            Thread.objects.get(pk=thread.pk).external_id,
            f"{slack.pk}:C0CA7PPRP7A:1792041415.357099",
        )
        self.assertEqual(
            Unmatched.objects.get(pk=waiting.pk).external_id, "C0CA7PPRP7A:1792041500.000100"
        )

    def test_a_connection_set_to_one_customer_hands_it_to_its_channel(self):
        apps = self.migrate(BEFORE)
        org, globex, slack = self.world(apps, external_shared=True)
        slack.customers.add(globex)
        apps = self.migrate(AFTER)
        Channel = apps.get_model("connectors", "SlackChannel")
        Connector = apps.get_model("connectors", "Connector")
        row = Channel.objects.get(connector_id=slack.pk)
        self.assertEqual((row.customer_id, row.external_shared), (globex.pk, True))
        self.assertFalse(Connector.objects.get(pk=slack.pk).customers.exists())

    def test_a_private_channel_stays_and_a_connection_without_one_is_left(self):
        apps = self.migrate(BEFORE)
        org, _, slack = self.world(apps, channel="G0PRIVATE", channel_name="secret")
        Connector = apps.get_model("connectors", "Connector")
        bare = Connector.objects.create(organisation=org, provider="slack", name="New")
        apps = self.migrate(AFTER)
        Channel = apps.get_model("connectors", "SlackChannel")
        self.assertTrue(Channel.objects.get(connector_id=slack.pk).is_private)
        self.assertFalse(Channel.objects.filter(connector_id=bare.pk).exists())
```

(If `Organisation.objects.create` needs more fields, copy them from `services/agents/tests/test_slack_conversations_migration.py`, which makes the same world.)

- [ ] **Step 2: Run them to verify they fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_channel_model services.connectors.tests.test_slack_channels_migration --parallel auto --noinput`
Expected: FAIL (`ImportError: cannot import name 'SlackChannel'`; the migration nodes don't exist).

- [ ] **Step 3: The model and the conversation's key**

In `services/connectors/models.py`, after `SlackLink`:

```python
class SlackChannel(models.Model):
    """One channel of a Slack connection (Slack escalations D3, contract
    §1.1, SC3-2): every public channel of the connection's Slack workspace,
    made by the listing, a channel_created event or the first message event
    from it, plus a connection's earlier private channel. An admin includes
    or excludes it and may set it to one customer or account (SC3-8). The
    catch-up's watermark and walk (SC3-6), the threads events missed (SC3-26)
    and the last event (SC3-30) live here. No message text is stored here."""

    MAX_MISSED = 50

    connector = models.ForeignKey(
        Connector, related_name="slack_channels", on_delete=models.CASCADE
    )
    channel_id = models.CharField(max_length=32)
    name = models.CharField(max_length=80, blank=True, default="")
    is_private = models.BooleanField(default=False)
    external_shared = models.BooleanField(default=False)
    is_member = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    included = models.BooleanField(default=True)
    chosen_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    chosen_at = models.DateTimeField(null=True, blank=True)
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    account = models.ForeignKey(
        "customers.Account", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    join_error = models.CharField(max_length=64, blank=True, default="")
    read_error = models.CharField(max_length=64, blank=True, default="")
    last_message_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    walk_before = models.CharField(max_length=32, blank=True, default="")
    walk_from = models.DateTimeField(null=True, blank=True)
    asked_at = models.DateTimeField(null=True, blank=True)
    missed = models.JSONField(default=list, blank=True)
    event_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["connector", "channel_id"], name="slack_channel_once"),
            models.CheckConstraint(
                check=models.Q(customer__isnull=True) | models.Q(account__isnull=True),
                name="slack_channel_one_record",
            ),
        ]

    def __str__(self):
        return f"Slack channel {self.pk}"  # never the name in an audit row

    @property
    def record(self):
        return self.account if self.account_id is not None else self.customer
```

In `services/customers/models.py` `SlackConversation.Meta.constraints`, the unique constraint becomes:

```python
models.UniqueConstraint(
    # Slack escalations D3 (SC3-10): a ts is unique only within its channel
    fields=["connector", "channel", "thread_ts"],
    condition=models.Q(connector__isnull=False),
    name="slack_conversation_once",
)
```

In `services/agents/threads.py` `touch_conversation`, the `external_id` argument becomes:

```python
external_id = f"{connector.pk}:{conversation.channel}:{conversation.thread_ts}"
```

with the comment `# Slack escalations D3 (SC3-10): one connection reads many channels` above it.

Run: `$PY manage.py makemigrations connectors customers` and rename the files to `0009_slackchannel.py` and `0063_slackconversation_channel_once.py` (fix the `dependencies` line of any file that names the old generated name).

- [ ] **Step 4: The data migration**

Create `services/connectors/migrations/0010_slack_channels_from_config.py`:

```python
"""Slack escalations D3 (SC3-11): a one-channel Slack connection becomes a
connection with that channel, caught up as of now (the poll read its last 7
days). Its single record (D1's "Choose its customer") moves onto the
channel; its agent threads and its waiting Needs-a-customer rows take keys
with the channel. `config["channel"]` stays, unused. Forwards only."""

from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    Connector = apps.get_model("connectors", "Connector")
    Channel = apps.get_model("connectors", "SlackChannel")
    Unmatched = apps.get_model("connectors", "UnmatchedItem")
    Thread = apps.get_model("agents", "SignalThread")
    now = timezone.now()
    for connector in Connector.objects.filter(provider="slack"):
        config = connector.config or {}
        channel = str(config.get("channel") or "").strip()[:32]
        if not channel:
            continue
        customers = list(connector.customers.all()[:2])
        accounts = list(connector.accounts.all()[:2])
        customer = customers[0] if len(customers) == 1 and not accounts else None
        account = accounts[0] if len(accounts) == 1 and not customers else None
        Channel.objects.get_or_create(
            connector=connector,
            channel_id=channel,
            defaults={
                "name": str(config.get("channel_name") or "")[:80],
                "is_private": channel.startswith("G"),
                "external_shared": bool(config.get("external_shared")),
                "is_member": True,
                "included": True,
                "customer": customer,
                "account": account,
                "read_at": now,
            },
        )
        if customer is not None or account is not None:
            connector.customers.clear()
            connector.accounts.clear()
        for row in Unmatched.objects.filter(connector=connector, provider="slack"):
            if ":" not in row.external_id:
                row.external_id = f"{channel}:{row.external_id}"[:128]
                row.save(update_fields=["external_id"])
        prefix = f"{connector.pk}:"
        rows = Thread.objects.filter(
            source_kind="slack", external_id__startswith=prefix
        ).select_related("conversation")
        for thread in rows:
            ts = thread.external_id[len(prefix) :]
            if ":" in ts:
                continue
            own = thread.conversation.channel if thread.conversation_id else ""
            thread.external_id = f"{connector.pk}:{own or channel}:{ts}"
            thread.save(update_fields=["external_id"])


class Migration(migrations.Migration):
    dependencies = [
        ("connectors", "0009_slackchannel"),
        ("customers", "0063_slackconversation_channel_once"),
        ("agents", "0008_slack_tickets_to_conversations"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
```

- [ ] **Step 5: Run the tests to verify they pass, with the neighbours**

Run: `$PY manage.py test services.connectors.tests.test_slack_channel_model services.connectors.tests.test_slack_channels_migration services.agents.tests.test_slack_conversations_migration services.agents.tests.test_slack_conversation_intake --parallel auto --noinput`
Expected: PASS. A test that reads a Slack thread's `external_id` as `"<pk>:<ts>"` now reads `"<pk>:<channel>:<ts>"`: update its expectation, nothing else.

- [ ] **Step 6: Commit**

```bash
git add services/connectors/models.py services/connectors/migrations/0009_slackchannel.py services/connectors/migrations/0010_slack_channels_from_config.py services/customers/models.py services/customers/migrations/0063_slackconversation_channel_once.py services/agents/threads.py services/connectors/tests/test_slack_channel_model.py services/connectors/tests/test_slack_channels_migration.py
git commit -m "feat(connectors): a slack connection's channels, keys with the channel, and the migration

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add any neighbour test whose key expectation Step 5 updated.)

---

### Task 2: The provider: small reads that fit Slack's limits, shared message rules, list and join

**Files:**
- Modify: `services/connectors/providers/slack.py`, `services/connectors/views.py` (`ConnectorConnectView.post`, `ConnectorAgentsView._slack`, `KEPT_ON_GRANT`), `services/connectors/tests/slack_fake.py`, `services/connectors/tests/test_slack_threads.py`, `services/connectors/tests/test_views.py` (the Slack connect cases)
- Create: `services/connectors/tests/test_slack_channels_provider.py`

**Interfaces:**
- Produces (module `providers.slack`): `SCOPES` with `channels:join`; `CATCHUP_LIMIT = 15`; `EVENT_TIMEOUT = 2`; `Budget(replies=1, stopped=False)`; `is_top(raw) -> bool`; `is_ours(raw, config, app_id="") -> bool`.
- Produces (`SlackProvider`): `list_channels(creds) -> [{"id", "name", "member", "shared"}]`; `join_channel(creds, channel, *, timeout=30)` (raises `ProviderError` with Slack's code); `reply_of(creds, config, raw, people, *, timeout=30) -> dict | None` (the stored reply shape `{"ts", "user_id", "name", "text", "bot", "ours"}`); `thread_of(creds, config, channel, raw, *, replies=None, latest="", people=None, timeout=30) -> RemoteThread`; `read_page(config, creds, *, channel, oldest, latest="") -> (tops oldest first, has_more, lowest ts)`; `read_thread(config, creds, *, channel, thread_ts, since="", people=None) -> (parent raw | None, replies oldest first)`; `connect(form)` needs no channel. `fetch_threads`, `_replies`, `_replies_of` are deleted.
- Produces (fake): `FakeSlackApi` answers `conversations.list` (public channels: `is_member`, `is_ext_shared`) and `conversations.join` (adds the bot; `cant_join` refuses with `method_not_supported_for_channel_type`); `conversations.history` answers newest first and honours `latest`, as Slack does.

- [ ] **Step 1: Teach the fake**

In `services/connectors/tests/slack_fake.py`: add `"channels:join"` to `BASE_SCOPES`; in `FakeSlackApi.__init__`, `self.cant_join = set()`; in `_route`, before `users.info`:

```python
        if name == "conversations.list":
            wanted = set(query.get("types", "public_channel").split(","))
            ids = sorted(
                c
                for c in self.channels
                if ("private_channel" if c in self.private else "public_channel") in wanted
            )
            offset = int(query.get("cursor") or 0)
            size = int(query.get("limit") or 100)
            page = [
                {
                    "id": c,
                    "name": self.names.get(c, c.lower()),
                    "is_private": c in self.private,
                    "is_member": c in self.members,
                    "is_ext_shared": c in self.shared,
                    "is_archived": False,
                }
                for c in ids[offset : offset + size]
            ]
            more = offset + size < len(ids)
            return {
                "ok": True,
                "channels": page,
                "response_metadata": {"next_cursor": str(offset + size) if more else ""},
            }, {}
        if name == "conversations.join":
            channel = body.get("channel", "")
            if channel not in self.channels:
                return {"ok": False, "error": "channel_not_found"}, {}
            if channel in self.cant_join:
                return {"ok": False, "error": "method_not_supported_for_channel_type"}, {}
            self.members.add(channel)
            return {"ok": True, "channel": {"id": channel, "name": self.names.get(channel, "")}}, {}
```

In the `conversations.history` branch (the `else` of `if thread:`), skip messages at or after `latest` and answer newest first, as Slack does:

```python
            else:
                latest = float(query.get("latest") or "inf")
                rows = []
                for m in every:
                    if m.get("thread_ts") not in (None, m["ts"]) or float(m["ts"]) < oldest:
                        continue
                    if float(m["ts"]) >= latest:
                        continue
                    found = replies_of(m["ts"])
                    if found:
                        m = {
                            **m,
                            "thread_ts": m["ts"],
                            "reply_count": len(found),
                            "latest_reply": max((r["ts"] for r in found), key=float),
                        }
                    rows.append(m)
                # Slack's conversations.history answers newest first
                rows.sort(key=lambda m: float(m["ts"]), reverse=True)
```

- [ ] **Step 2: Write the failing tests**

Create `services/connectors/tests/test_slack_channels_provider.py`:

```python
"""Slack escalations D3, SC3-3, SC3-5, SC3-6, SC3-13, SC3-24, SC3-28: the
provider connects without a channel, lists the public channels, joins one,
and reads within Slack's 2025 limits: one history page of 15, one replies
page of 15 after what is stored. One set of message rules serves the
catch-up and the events. Slack is a fake."""

from django.test import SimpleTestCase

from services.connectors.providers.base import ProviderError
from services.connectors.providers.slack import (
    CATCHUP_LIMIT,
    SCOPES,
    SlackProvider,
    is_ours,
    is_top,
)
from services.connectors.tests.slack_fake import use_slack

CONFIG = {"bot_name": "revenact", "bot_id": "B0BOT", "bot_user_id": "U0BOT"}
CREDS = {"bot_token": "xoxb-test-only"}


class ProviderChannelTests(SimpleTestCase):
    def setUp(self):
        self.slack = use_slack(self)
        self.provider = SlackProvider()

    def test_it_asks_for_channels_join(self):
        self.assertIn("channels:join", SCOPES.split(","))

    def test_connect_needs_only_the_token(self):
        config, creds = self.provider.connect({"bot_token": "xoxb-test-only"})
        self.assertNotIn("channel", config)
        self.assertEqual((config["team_id"], creds), ("T0ACME", CREDS))
        self.assertEqual([f.name for f in self.provider.fields], ["bot_token"])

    def test_it_lists_the_public_channels(self):
        self.slack.channels["C0RANDOM"] = []
        self.slack.names["C0RANDOM"] = "random"
        self.slack.shared.add("C0ESCALATE")
        self.slack.private.add("G0SECRET")
        self.slack.channels["G0SECRET"] = []
        self.assertEqual(
            self.provider.list_channels(CREDS),
            [
                {"id": "C0ESCALATE", "name": "escalations", "member": True, "shared": True},
                {"id": "C0RANDOM", "name": "random", "member": False, "shared": False},
                {"id": "C0SUPPORT", "name": "support", "member": True, "shared": False},
            ],
        )

    def test_it_joins_and_a_refusal_carries_slack_s_code(self):
        self.slack.channels["C0RANDOM"] = []
        self.provider.join_channel(CREDS, "C0RANDOM", timeout=2)
        self.assertIn("C0RANDOM", self.slack.members)
        self.assertIn(("conversations.join", 2), self.slack.timeouts)
        self.slack.channels["C0ODD"] = []
        self.slack.cant_join.add("C0ODD")
        with self.assertRaises(ProviderError) as caught:
            self.provider.join_channel(CREDS, "C0ODD")
        self.assertEqual(caught.exception.code, "method_not_supported_for_channel_type")

    def test_one_history_page_of_fifteen_newest_first_then_below_it(self):
        made = [self.slack.say("C0SUPPORT", "U0FAIZ", f"Pizza Hut issue {n}") for n in range(20)]
        tops, more, lowest = self.provider.read_page(CONFIG, CREDS, channel="C0SUPPORT", oldest="0")
        self.assertEqual(len(tops), CATCHUP_LIMIT)
        self.assertTrue(more)
        self.assertEqual([t["ts"] for t in tops], made[5:])  # oldest first, the newest 15
        self.assertEqual(lowest, made[5])
        rest, more, _ = self.provider.read_page(
            CONFIG, CREDS, channel="C0SUPPORT", oldest="0", latest=lowest
        )
        self.assertEqual(([t["ts"] for t in rest], more), (made[:5], False))
        [call] = [q for name, _b, q in self.slack.calls[-1:] if name == "conversations.history"]
        self.assertEqual(call["limit"], "15")

    def test_a_page_keeps_only_people_s_top_messages(self):
        self.slack.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack.channels["C0SUPPORT"].append(
            {"ts": "1999999998.000100", "bot_id": "B0OTHER", "text": "A bot"}
        )
        self.slack.channels["C0SUPPORT"].append(
            {"ts": "1999999999.000100", "user": "U0ANN", "text": "", "subtype": "channel_join"}
        )
        self.slack.channels["C0SUPPORT"].append(
            {
                "ts": "1999999999.000200",
                "user": "U0FAIZ",
                "text": "Logged as KAN-2.",
                "metadata": {"event_type": "revenact_step", "event_payload": {"key": "k"}},
            }
        )
        tops, _, _ = self.provider.read_page(CONFIG, CREDS, channel="C0SUPPORT", oldest="0")
        self.assertEqual([t["text"] for t in tops], ["Pizza Hut exports fail"])

    def test_a_thread_read_brings_its_parent_and_replies_after_since(self):
        top = self.slack.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        first = self.slack.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        second = self.slack.say("C0SUPPORT", "U0FAIZ", "Jesh, can you take this?", thread_ts=top)
        parent, replies = self.provider.read_thread(
            CONFIG, CREDS, channel="C0SUPPORT", thread_ts=top, since=first
        )
        self.assertEqual(parent["ts"], top)
        self.assertEqual([r["ts"] for r in replies], [first, second])  # since is inclusive here
        _, replies = self.provider.read_thread(CONFIG, CREDS, channel="C0SUPPORT", thread_ts=top)
        self.assertEqual(
            [(r["name"], r["text"], r["bot"]) for r in replies],
            [
                ("Ann Lee", "Still failing", False),
                ("Faiz Jamal", "Jesh, can you take this?", False),
            ],
        )

    def test_rules_for_tops_replies_and_ours(self):
        self.assertTrue(is_top({"ts": "1.1", "user": "U0FAIZ", "text": "Hi"}))
        self.assertTrue(is_top({"ts": "1.1", "thread_ts": "1.1", "user": "U0FAIZ", "text": "Hi"}))
        self.assertFalse(is_top({"ts": "1.2", "thread_ts": "1.1", "user": "U0FAIZ", "text": "Hi"}))
        self.assertFalse(is_top({"ts": "1.1", "user": "U0FAIZ", "text": "Hi", "bot_id": "B0X"}))
        self.assertFalse(
            is_top({"ts": "1.1", "user": "U0FAIZ", "text": "x", "subtype": "file_share"})
        )
        self.assertTrue(is_ours({"bot_id": "B0BOT"}, CONFIG))
        self.assertTrue(is_ours({"user": "U0BOT"}, CONFIG))
        self.assertTrue(
            is_ours({"user": "U0FAIZ", "metadata": {"event_type": "revenact_step"}}, CONFIG)
        )
        self.assertTrue(is_ours({"user": "U0FAIZ", "app_id": "A0OURS"}, CONFIG, app_id="A0OURS"))
        self.assertFalse(is_ours({"user": "U0FAIZ", "app_id": "A0OTHER"}, CONFIG, app_id="A0OURS"))
        self.assertFalse(is_ours({"user": "U0FAIZ"}, CONFIG))
        reply = {"ts": "1.2", "thread_ts": "1.1", "user": "U0ANN", "text": "Still failing"}
        self.assertEqual(
            self.provider.reply_of(CREDS, CONFIG, reply, {}),
            {
                "ts": "1.2",
                "user_id": "U0ANN",
                "name": "Ann Lee",
                "text": "Still failing",
                "bot": False,
                "ours": False,
            },
        )
        mine = {"ts": "1.3", "thread_ts": "1.1", "bot_id": "B0BOT", "text": "Logged as KAN-2."}
        self.assertEqual((self.provider.reply_of(CREDS, CONFIG, mine, {})["ours"]), True)
        made_as_a_person = {**reply, "ts": "1.4", "metadata": {"event_type": "revenact_step"}}
        self.assertTrue(self.provider.reply_of(CREDS, CONFIG, made_as_a_person, {})["via_app"])
        self.assertIsNone(
            self.provider.reply_of(CREDS, CONFIG, {**reply, "subtype": "channel_join"}, {})
        )
        self.assertIsNone(self.provider.reply_of(CREDS, CONFIG, {**reply, "thread_ts": "1.2"}, {}))

    def test_a_known_person_is_not_looked_up_and_a_lookup_has_a_timeout(self):
        reply = {"ts": "1.2", "thread_ts": "1.1", "user": "U0ANN", "text": "Still failing"}
        people = {"U0ANN": {"name": "Ann Lee", "email": ""}}
        self.provider.reply_of(CREDS, CONFIG, reply, people, timeout=2)
        self.assertNotIn("users.info", [c[0] for c in self.slack.calls])
        self.provider.thread_of(
            CREDS, CONFIG, "C0SUPPORT", {"ts": "1.1", "user": "U0FAIZ", "text": "Hi"}, timeout=2
        )
        self.assertIn(("users.info", 2), self.slack.timeouts)
```

Replace the helper at the top of `services/connectors/tests/test_slack_threads.py` (the D1 rules for what is a thread and a reply, which the new reads keep) and every direct `fetch_threads(...)` call in that file with this adapter, which reads the way the catch-up reads:

```python
def fetch(config, creds, known=None):
    """D1's cases through D3's reads: one history page, then each moved
    thread's replies (the catch-up reads one a pass; a test reads them all)."""
    provider = SlackProvider()
    channel = config["channel"]
    known = known or {}
    tops, _more, _lowest = provider.read_page(config, creds, channel=channel, oldest="0")
    threads, people = [], {}
    for raw in tops:
        ts, latest = str(raw["ts"]), str(raw.get("latest_reply") or "")
        replies = None
        if latest and latest != known.get(ts):
            _parent, replies = provider.read_thread(
                config, creds, channel=channel, thread_ts=ts, people=people
            )
        threads.append(
            provider.thread_of(
                creds,
                config,
                channel,
                raw,
                replies=replies,
                latest=latest if replies is not None else known.get(ts, ""),
                people=people,
            )
        )
    return threads, (threads[-1].thread_ts if threads else ""), False
```

A case there that checks more than 15 top messages, `MAX_PAGES` paging, `MAX_REPLY_THREADS`, the 7-day window or the trailing `conversations.info` is deleted (those limits are gone, contract SC3-6); every other case keeps its assertion. In `test_views.py`, a Slack connect case that sends `channel` keeps passing (the field is ignored); one that expects "Invite the bot to #... first, then connect." or "Channel ID should look like C0123ABCD." is deleted (SC3-13).

- [ ] **Step 3: Run them to verify they fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_channels_provider --parallel auto --noinput`
Expected: FAIL (`ImportError: cannot import name 'CATCHUP_LIMIT'`).

- [ ] **Step 4: Implement the provider**

In `services/connectors/providers/slack.py` (`from dataclasses import dataclass`); the module docstring's first sentence becomes "Slack: every top-level message in a connection's channels starts a conversation (Slack escalations D1, D3). Messages arrive by Slack's Events API (`services/connectors/slack_events.py`); these reads are the slow catch-up, sized for Slack's 2025 limits on unlisted apps."

```python
SCOPES = ",".join(
    [
        "channels:history",
        "channels:read",
        # Slack escalations D3 (SC3-5): the bot joins public channels itself
        "channels:join",
        "groups:history",
        "groups:read",
        "users:read",
        "users:read.email",
        "reactions:read",
    ]
)
```

Delete `MAX_REPLY_THREADS`; keep `PAGE`, `MAX_PAGES`, `WINDOW`, `TEXT_CHARS`, `REPLY_SUBTYPES`; add after them:

```python
#: Slack, 2025-05-29: an unlisted app's conversations.history and .replies
#: answer 1 call a minute and at most 15 objects (contract SC3-6).
CATCHUP_LIMIT = 15
#: A lookup made while Slack waits for its 3-second answer (SC3-23).
EVENT_TIMEOUT = 2


@dataclass
class Budget:
    """One catch-up's replies call (SC3-6)."""

    replies: int = 1
    stopped: bool = False


def is_top(raw):
    """A message that starts a conversation (D1's rules, D3-26): no subtype,
    not a reply, a person's, with text."""
    ts = str(raw.get("ts", ""))
    if raw.get("subtype") or (raw.get("thread_ts") and str(raw["thread_ts"]) != ts):
        return False
    return bool(raw.get("user")) and bool(raw.get("text")) and not raw.get("bot_id")


def is_ours(raw, config, app_id=""):
    """SC3-28: our bot's post, a post carrying our step key, or a person's post
    made through our app (`app_id` is the event envelope's api_app_id)."""
    identity = _identity(config)
    if raw.get("bot_id") in identity or (raw.get("user") and raw.get("user") in identity):
        return True
    if (raw.get("metadata") or {}).get("event_type") == METADATA_TYPE:
        return True
    return bool(app_id) and raw.get("app_id") == app_id and not raw.get("bot_id")
```

In `SlackProvider`:

```python
    fields = [
        SetupField("bot_token", "Bot token", secret=True, placeholder="xoxb-…", required=False),
    ]
    help = (
        "Revenact reads every public channel and joins new ones itself. Leave the token blank "
        "to sign in with Slack when it is set up on this deployment."
    )
```

Delete `_channel`; `connect` becomes:

```python
    def connect(self, form, *, via="token"):
        """SC3-13: the token alone; the first pass lists the channels."""
        token = (form.get("bot_token") or "").strip()
        if not token:
            raise ProviderError("A bot token is required unless you sign in with Slack.")
        creds = {"bot_token": token}
        me, scopes = self._auth_test(creds)
        config = {
            "team_id": me.get("team_id", ""),
            "bot_name": me.get("user", ""),
            # I3: whose posts are ours (a bot token's auth.test names its bot)
            "bot_id": me.get("bot_id", ""),
            "bot_user_id": me.get("user_id", ""),
            "via": via,
            "scopes": scopes,
        }
        return config, creds
```

`exchange_code` calls `self.connect({"bot_token": data["access_token"]}, via="oauth")`.

`_person` gains a timeout:

```python
    def _person(self, creds, user_id, people, *, timeout=30):
        """users.info's name and email for a poster, once per read (`people`);
        nobody is asked about an empty id; a failed lookup is a blank name."""
        if not user_id:
            return {"name": "", "email": ""}
        if user_id not in people:
            try:
                user = self._call(creds, "users.info", timeout=timeout, user=user_id).get("user", {})
            except ProviderError:
                user = {}
            profile = user.get("profile") or {}
            people[user_id] = {
                "name": user.get("real_name") or profile.get("real_name") or user.get("name", ""),
                "email": (profile.get("email") or "").lower(),
            }
        return people[user_id]
```

Delete `_replies`, `_replies_of` and `fetch_threads`; add:

```python
def list_channels(self, creds):
    """SC3-3: the workspace's public channels, unarchived, at most
    MAX_PAGES pages (Tier 2): [{"id", "name", "member", "shared"}]."""
    out, cursor = [], None
    for _ in range(MAX_PAGES):
        page = self._call(
            creds,
            "conversations.list",
            types="public_channel",
            exclude_archived="true",
            limit=PAGE,
            cursor=cursor,
        )
        for raw in page.get("channels", []):
            out.append(
                {
                    "id": str(raw.get("id", "")),
                    "name": str(raw.get("name") or "")[:80],
                    "member": bool(raw.get("is_member")),
                    "shared": bool(raw.get("is_ext_shared")),
                }
            )
        cursor = (page.get("response_metadata") or {}).get("next_cursor")
        if not cursor:
            break
    return out


def join_channel(self, creds, channel, *, timeout=30):
    """SC3-5: the bot joins a public channel (Tier 3). ProviderError with Slack's code."""
    self._checked(
        http_json(
            "POST",
            f"{API}/conversations.join",
            headers=self._headers(creds),
            form={"channel": channel},
            timeout=timeout,
            write=True,
        )
    )


def reply_of(self, creds, config, raw, people, *, timeout=30, app_id=""):
    """One reply as stored (SE1-4, I3): people's and bots' (`bot`), our
    bot's marked `ours`, a person's post made through our app marked
    `via_app` (SC3-28; D4 reads it); None for a parent, a join, a topic
    change or an empty text. Shared by the catch-up and the events (SC3-24)."""
    ts = str(raw.get("ts", ""))
    thread = str(raw.get("thread_ts") or "")
    subtype = raw.get("subtype") or ""
    if not thread or ts == thread or subtype not in REPLY_SUBTYPES or not raw.get("text"):
        return None
    identity = _identity(config)
    bot = bool(raw.get("bot_id")) or subtype == "bot_message"
    user_id = str(raw.get("user", ""))
    mine = bot and (not identity or raw.get("bot_id") in identity or user_id in identity)
    if mine:
        name = config.get("bot_name") or "the Slack app"
    elif bot:
        name = (raw.get("bot_profile") or {}).get("name") or raw.get("username") or "a Slack app"
    else:
        name = self._person(creds, user_id, people, timeout=timeout)["name"]
    out = {
        "ts": ts,
        "user_id": user_id,
        "name": str(name)[:150],
        "text": str(raw["text"])[:TEXT_CHARS],
        "bot": bot,
        "ours": mine,
    }
    if not bot and is_ours(raw, config, app_id):
        out["via_app"] = True
    return out


def thread_of(
    self, creds, config, channel, raw, *, replies=None, latest="", people=None, timeout=30
):
    """A top message as a RemoteThread. `replies` None: keep what is stored."""
    people = {} if people is None else people
    ts = str(raw["ts"])
    user_id = str(raw.get("user", ""))
    poster = self._person(creds, user_id, people, timeout=timeout)
    return RemoteThread(
        thread_ts=ts,
        channel=channel,
        text=str(raw.get("text") or "")[:TEXT_CHARS],
        user_id=user_id,
        user_name=poster["name"][:150],
        user_email=poster["email"][:254],
        posted_at=ts_time(ts),
        latest_reply=latest,
        replies=replies,
        url=message_url(channel, ts),
    )


def read_page(self, config, creds, *, channel, oldest, latest=""):
    """SC3-6: ONE conversations.history call of CATCHUP_LIMIT messages
    between `oldest` and `latest` (blank: now), newest first as Slack
    sends them: (the top messages oldest first, has_more, the lowest ts on
    the page, where a walk continues)."""
    page = self._call(
        creds,
        "conversations.history",
        channel=channel,
        oldest=oldest,
        latest=latest or None,
        limit=CATCHUP_LIMIT,
        # our step key (D3-11): a person's post made through our app is ours
        include_all_metadata="true",
    )
    raws = page.get("messages", [])
    lowest = min((str(raw.get("ts", "")) for raw in raws), key=float, default="")
    mine = [raw for raw in raws if is_top(raw) and not is_ours(raw, config)]
    tops = sorted(mine, key=lambda raw: float(raw["ts"]))
    return tops, bool(page.get("has_more")), lowest


def read_thread(self, config, creds, *, channel, thread_ts, since="", people=None):
    """SC3-6: ONE conversations.replies call of CATCHUP_LIMIT messages:
    (the parent as Slack sent it, or None when the page lacks it; the
    replies after `since`, oldest first)."""
    people = {} if people is None else people
    page = self._call(
        creds,
        "conversations.replies",
        channel=channel,
        ts=thread_ts,
        oldest=since or None,
        limit=CATCHUP_LIMIT,
        include_all_metadata="true",
    )
    raws = page.get("messages", [])
    parent = next((raw for raw in raws if str(raw.get("ts", "")) == thread_ts), None)
    replies = [m for m in (self.reply_of(creds, config, raw, people) for raw in raws) if m]
    return parent, sorted(replies, key=lambda m: float(m["ts"]))
```

`sync.sync_conversations` still calls `fetch_threads` until Task 4: run only this task's labels below (Task 4 runs `test_slack_sync`).

- [ ] **Step 5: OAuth keeps posting, and the consent carries no channel**

In `services/connectors/views.py` `ConnectorConnectView.post`, the OAuth branch:

```python
        if form.get("oauth"):
            # SC3-13: approving the app again (channels:join) never drops chat:write
            act = connector.provider == Connector.Provider.SLACK and agent_access.granted(connector)
            return start_oauth(
                request,
                connector,
                provider,
                {k: v for k, v in form.items() if k != "oauth" and isinstance(v, str)},
                purpose="connect",
                act=act,
            )
```

(keep the lines the branch has today before its `return`; only `act` is new). In `ConnectorAgentsView._slack`: `return start_oauth(request, connector, provider, {}, purpose="agents", act=True)`. `KEPT_ON_GRANT` drops `"channel_name"`.

- [ ] **Step 6: Run the tests, with the neighbours**

Run: `$PY manage.py test services.connectors.tests.test_slack_channels_provider services.connectors.tests.test_slack_threads services.connectors.tests.test_views services.connectors.tests.test_agents_route services.connectors.tests.test_oauth_browser services.connectors.tests.test_slack_actions services.connectors.tests.test_slack_interactivity --parallel auto --noinput`
Expected: PASS. A neighbour that fails only because `connect` no longer reads a channel, or because the history fake now answers newest first, is updated as Step 2 says; anything else is a bug.

- [ ] **Step 7: Commit**

```bash
git add services/connectors/providers/slack.py services/connectors/views.py services/connectors/tests/slack_fake.py services/connectors/tests/test_slack_channels_provider.py services/connectors/tests/test_slack_threads.py services/connectors/tests/test_views.py
git commit -m "feat(connectors): slack reads one page of 15 at a time, lists and joins public channels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A connection's channels: listed, defaulted, joined, picked for the catch-up

**Files:**
- Create: `services/connectors/slack_channels.py`, `services/connectors/tests/test_slack_channel_rows.py`

**Interfaces:**
- Produces: `slack_channels.can_join(connector) -> bool`; `refresh(connector, provider, creds, *, now) -> list[SlackChannel]` (rows not archived); `join_missing(connector, provider, creds, rows, *, timeout=30) -> int`; `history_due(connector, now) -> bool`; `pick(rows) -> SlackChannel | None`; `remember_missed(row, ts)`; `next_missed(rows) -> (SlackChannel, ts) | None`; `forget_missed(row, ts)`; `MAX_JOINS = 5`, `RATE_GAP = timedelta(seconds=60)`, `OVERLAP = timedelta(minutes=2)`, `REMOVED = "removed"`.
- Consumes: `SlackProvider.list_channels`, `join_channel` (Task 2); `SlackChannel` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_slack_channel_rows.py`:

```python
"""Slack escalations D3, SC3-3 to SC3-6, SC3-26: each pass lists the
channels (new ones included, Slack Connect ones not; a bot someone removed
stays out), joins up to five with the scope, and the catch-up picks one
channel at most once a minute: a walk first, then never read, then the
longest since read. Missed threads queue per channel. Slack is a fake."""

from datetime import timedelta

from django.utils import timezone

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import slack_channels
from services.connectors.models import SlackChannel
from services.connectors.providers.slack import SlackProvider
from services.connectors.tests.slack_fake import use_slack

CREDS = {"bot_token": "xoxb-test-only"}


class ChannelRowsTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        self.support = self.slack_connector()
        self.provider = SlackProvider()
        self.now = timezone.now()

    def refresh(self):
        return slack_channels.refresh(self.support, self.provider, CREDS, now=self.now)

    def add_channel(self, channel, name, *, member=False, shared=False):
        self.slack_api.channels[channel] = []
        self.slack_api.names[channel] = name
        if member:
            self.slack_api.members.add(channel)
        if shared:
            self.slack_api.shared.add(channel)

    def test_new_channels_are_rows_and_shared_ones_start_excluded(self):
        self.add_channel("C0RANDOM", "random")
        self.add_channel("C0GLOBEX", "globex-shared", shared=True)
        rows = {r.channel_id: r for r in self.refresh()}
        self.assertEqual(set(rows), {"C0SUPPORT", "C0ESCALATE", "C0RANDOM", "C0GLOBEX"})
        self.assertEqual((rows["C0RANDOM"].included, rows["C0RANDOM"].is_member), (True, False))
        self.assertEqual(
            (rows["C0GLOBEX"].included, rows["C0GLOBEX"].external_shared), (False, True)
        )

    def test_a_row_follows_slack_and_one_slack_no_longer_lists_is_archived(self):
        self.refresh()
        self.slack_api.names["C0SUPPORT"] = "support-desk"
        del self.slack_api.channels["C0ESCALATE"]
        self.slack_api.members.discard("C0ESCALATE")
        self.refresh()
        self.assertEqual(SlackChannel.objects.get(channel_id="C0SUPPORT").name, "support-desk")
        self.assertTrue(SlackChannel.objects.get(channel_id="C0ESCALATE").is_archived)

    def test_a_channel_that_becomes_shared_is_excluded_unless_an_admin_chose_it(self):
        self.refresh()
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(
            chosen_at=self.now, chosen_by=self.admin
        )
        self.slack_api.shared.update({"C0SUPPORT", "C0ESCALATE"})
        self.refresh()
        self.assertTrue(SlackChannel.objects.get(channel_id="C0SUPPORT").included)
        self.assertFalse(SlackChannel.objects.get(channel_id="C0ESCALATE").included)

    def test_a_bot_someone_removed_is_not_joined_again(self):
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        self.refresh()
        self.slack_api.members.discard("C0ESCALATE")
        rows = self.refresh()
        row = SlackChannel.objects.get(channel_id="C0ESCALATE")
        self.assertEqual((row.is_member, row.join_error), (False, slack_channels.REMOVED))
        self.assertEqual(slack_channels.join_missing(self.support, self.provider, CREDS, rows), 0)

    def test_a_failed_listing_keeps_the_rows(self):
        self.refresh()
        self.slack_api.refuse_next("conversations.list", "internal_error")
        self.assertEqual(len(self.refresh()), 2)

    def test_joining_needs_the_scope_and_stops_at_five(self):
        for n in range(7):
            self.add_channel(f"C0NEW{n}", f"new-{n}")
        rows = self.refresh()
        self.assertEqual(slack_channels.join_missing(self.support, self.provider, CREDS, rows), 0)
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        self.assertEqual(slack_channels.join_missing(self.support, self.provider, CREDS, rows), 5)
        self.assertEqual(SlackChannel.objects.filter(is_member=True).count(), 2 + 5)

    def test_a_refused_join_is_kept_and_not_tried_again(self):
        self.add_channel("C0ODD", "odd")
        self.slack_api.cant_join.add("C0ODD")
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        rows = self.refresh()
        slack_channels.join_missing(self.support, self.provider, CREDS, rows)
        row = SlackChannel.objects.get(channel_id="C0ODD")
        self.assertEqual(row.join_error, "method_not_supported_for_channel_type")
        calls = len(self.slack_api.calls)
        slack_channels.join_missing(self.support, self.provider, CREDS, self.refresh())
        self.assertNotIn("conversations.join", [c[0] for c in self.slack_api.calls[calls:]])

    def test_an_excluded_or_shared_channel_is_never_joined(self):
        self.add_channel("C0OFF", "off")
        self.add_channel("C0GLOBEX", "globex-shared", shared=True)
        rows = self.refresh()
        SlackChannel.objects.filter(channel_id="C0OFF").update(included=False)
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        slack_channels.join_missing(self.support, self.provider, CREDS, self.refresh())
        self.assertFalse(SlackChannel.objects.get(channel_id="C0OFF").is_member)
        self.assertFalse(SlackChannel.objects.get(channel_id="C0GLOBEX").is_member)
        self.assertEqual(len(rows), 4)

    def row(self, channel_id, **fields):
        return SlackChannel.objects.create(
            connector=self.support,
            channel_id=channel_id,
            name=channel_id.lower(),
            **{
                "is_member": True,
                **fields,
            },
        )

    def test_the_catch_up_picks_a_walk_then_never_read_then_the_longest_since_read(self):
        old = self.row("C0OLD", read_at=self.now - timedelta(hours=3))
        older = self.row("C0OLDER", read_at=self.now - timedelta(hours=5))
        never = self.row("C0NEVER")
        walking = self.row("C0WALK", read_at=self.now, walk_before="1792041400.000100")
        off = self.row("C0OFF", included=False)
        rows = [old, older, never, walking, off]
        self.assertEqual(slack_channels.pick(rows), walking)
        walking.walk_before = ""
        self.assertEqual(slack_channels.pick(rows), never)
        never.read_at = self.now
        self.assertEqual(slack_channels.pick(rows), older)
        self.assertIsNone(slack_channels.pick([off]))

    def test_at_most_one_catch_up_a_minute(self):
        row = self.row("C0ONE")
        self.assertTrue(slack_channels.history_due(self.support, self.now))
        SlackChannel.objects.filter(pk=row.pk).update(asked_at=self.now - timedelta(seconds=30))
        self.assertFalse(slack_channels.history_due(self.support, self.now))
        SlackChannel.objects.filter(pk=row.pk).update(asked_at=self.now - timedelta(seconds=61))
        self.assertTrue(slack_channels.history_due(self.support, self.now))

    def test_missed_threads_queue_once_each_and_at_most_fifty(self):
        row = self.row("C0ONE")
        slack_channels.remember_missed(row, "1792041400.000100")
        slack_channels.remember_missed(row, "1792041400.000100")
        for n in range(SlackChannel.MAX_MISSED + 1):
            slack_channels.remember_missed(row, f"17920415{n:02d}.000100")
        row.refresh_from_db()
        self.assertEqual(len(row.missed), SlackChannel.MAX_MISSED)
        self.assertNotIn("1792041400.000100", row.missed)  # the oldest went first
        self.assertEqual(slack_channels.next_missed([row]), (row, row.missed[0]))
        slack_channels.forget_missed(row, row.missed[0])
        row.refresh_from_db()
        self.assertEqual(len(row.missed), SlackChannel.MAX_MISSED - 1)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_channel_rows --parallel auto --noinput`
Expected: FAIL (`ImportError: cannot import name 'slack_channels'`).

- [ ] **Step 3: Implement**

Create `services/connectors/slack_channels.py`:

```python
"""A Slack connection's channels (Slack escalations D3, contract SC3-2 to
SC3-6, SC3-12, SC3-26). Each pass lists the workspace's public channels
(new ones become rows: included, unless Slack Connect), joins up to
MAX_JOINS the bot isn't in yet (only with channels:join), and, at most once
a minute, the catch-up picks one channel to read. Threads that events could
not file wait in a row's `missed` list. Names and ids only: no message text."""

import logging
from datetime import timedelta

from django.db import transaction

from .models import SlackChannel
from .providers.base import ProviderError

logger = logging.getLogger(__name__)

MAX_JOINS = 5
RATE_GAP = timedelta(seconds=60)
OVERLAP = timedelta(minutes=2)
JOIN_SCOPE = "channels:join"
#: SC3-3: somebody removed the bot; it is not joined again until an admin says so.
REMOVED = "removed"
_FIELDS = (
    "name",
    "external_shared",
    "is_member",
    "is_archived",
    "included",
    "join_error",
    "updated_at",
)


def can_join(connector):
    return JOIN_SCOPE in (connector.granted_scopes or [])


def _rate_limited(exc):
    return exc.code == "ratelimited" or exc.status == 429


def refresh(connector, provider, creds, *, now):
    """SC3-3, SC3-4: the connection's rows (not archived) after this pass's
    listing. A failed listing keeps the rows as they are; a revoked token raises."""
    rows = {row.channel_id: row for row in SlackChannel.objects.filter(connector=connector)}
    try:
        listed = provider.list_channels(creds)
    except ProviderError as exc:
        if exc.reauth:
            raise
        logger.warning("slack channel list skipped: %s", type(exc).__name__)
        return [row for row in rows.values() if not row.is_archived]
    new, changed, seen = [], [], set()
    for found in listed:
        if not found["id"]:
            continue
        seen.add(found["id"])
        row = rows.get(found["id"])
        if row is None:
            new.append(
                SlackChannel(
                    connector=connector,
                    channel_id=found["id"][:32],
                    name=found["name"],
                    external_shared=found["shared"],
                    is_member=found["member"],
                    # SC3-12: Slack Connect starts excluded
                    included=not found["shared"],
                )
            )
            continue
        before = [getattr(row, field) for field in _FIELDS[:-1]]
        became_shared = found["shared"] and not row.external_shared
        if row.is_member and not found["member"] and not row.is_archived:
            row.join_error = REMOVED  # SC3-3: somebody took the bot out
        row.name, row.external_shared = found["name"], found["shared"]
        row.is_member, row.is_archived = found["member"], False
        if became_shared and row.chosen_at is None:
            # SC3-4: a channel nobody chose that turns shared stops syncing
            row.included = False
        if [getattr(row, field) for field in _FIELDS[:-1]] != before:
            row.updated_at = now
            changed.append(row)
    for row in rows.values():
        # a private channel is never listed: it stays as the migration made it
        if row.channel_id not in seen and not row.is_private and not row.is_archived:
            row.is_archived, row.updated_at = True, now
            changed.append(row)
    made = SlackChannel.objects.bulk_create(new)
    if changed:
        SlackChannel.objects.bulk_update(changed, list(_FIELDS))
    return [row for row in [*rows.values(), *made] if not row.is_archived]


def join_missing(connector, provider, creds, rows, *, timeout=30):
    """SC3-5: join up to MAX_JOINS included public channels the bot isn't in;
    how many it joined."""
    if not can_join(connector):
        return 0
    wanted = [
        row
        for row in rows
        if row.included
        and not row.is_member
        and not row.is_private
        and not row.is_archived
        and not row.join_error
        and (not row.external_shared or row.chosen_at is not None)
    ]
    wanted.sort(key=lambda row: row.pk)
    joined = 0
    for row in wanted[:MAX_JOINS]:
        try:
            provider.join_channel(creds, row.channel_id, timeout=timeout)
        except ProviderError as exc:
            if exc.reauth:
                raise
            if _rate_limited(exc):
                break
            row.join_error = (exc.code or "refused")[:64]
            row.save(update_fields=["join_error", "updated_at"])
            continue
        row.is_member, row.join_error = True, ""
        row.save(update_fields=["is_member", "join_error", "updated_at"])
        joined += 1
    return joined


def history_due(connector, now):
    """SC3-6: no catch-up call on this connection in the last minute."""
    return not SlackChannel.objects.filter(
        connector=connector, asked_at__gt=now - RATE_GAP
    ).exists()


def _ready(row):
    return row.included and row.is_member and not row.is_archived


def pick(rows):
    """SC3-6: the channel the catch-up reads: a walk in progress, then never
    caught up (oldest row first), then the longest since `read_at`."""
    ready = [row for row in rows if _ready(row)]
    if not ready:
        return None
    return min(
        ready,
        key=lambda row: (
            not row.walk_before,
            row.read_at is not None,
            row.read_at.timestamp() if row.read_at else 0,
            row.pk,
        ),
    )


def remember_missed(row, ts):
    """SC3-26: a thread an event could not file, read by a later catch-up."""
    if not ts:
        return
    with transaction.atomic():
        locked = SlackChannel.objects.select_for_update().get(pk=row.pk)
        if ts in locked.missed:
            return
        locked.missed = [*locked.missed, str(ts)[:32]][-SlackChannel.MAX_MISSED :]
        locked.save(update_fields=["missed", "updated_at"])
    row.missed = locked.missed


def forget_missed(row, ts):
    with transaction.atomic():
        locked = SlackChannel.objects.select_for_update().get(pk=row.pk)
        locked.missed = [one for one in locked.missed if one != ts]
        locked.save(update_fields=["missed", "updated_at"])
    row.missed = locked.missed


def next_missed(rows):
    """SC3-6 step 2: the oldest missed thread of a ready row (rows by pk)."""
    for row in sorted(rows, key=lambda row: row.pk):
        if _ready(row) and row.missed:
            return row, row.missed[0]
    return None
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$PY manage.py test services.connectors.tests.test_slack_channel_rows --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/connectors/slack_channels.py services/connectors/tests/test_slack_channel_rows.py
git commit -m "feat(connectors): list a slack workspace's channels, join new ones, pick one to catch up

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Filing per channel, merged replies, and the slow catch-up

**Files:**
- Modify: `services/connectors/sync.py` (`_apply_thread`, `_READ_FIELDS`, `_as_unmatched`, `file_conversation`, `sync_conversations`; new `stored_remote`, `edit_message`, `delete_message`, `DELETED`), `services/connectors/unmatched.py` (`slack_key`), `services/connectors/tests/test_slack_sync.py`
- Create: `services/connectors/slack_catchup.py`, `services/connectors/tests/test_slack_catchup.py`

**Interfaces:**
- Produces: `sync.file_conversation(connector, remote, names, *, now, channel=None, linked=None)` (the `scope` argument is gone); `sync.stored_remote(conversation, replies) -> RemoteThread`; `sync.edit_message(conversation, ts, text) -> bool`; `sync.delete_message(conversation, ts) -> bool`; `sync.DELETED = "This message was deleted."`; `unmatched.slack_key(channel, ts)`; `slack_catchup.run(connector, provider, creds, rows, *, now, counts, names, linked)`; Slack `UnmatchedItem.external_id` `"<channel>:<ts>"`, `number` `#<name>`.
- Consumes: Tasks 1 to 3.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_slack_catchup.py`:

```python
"""Slack escalations D3, SC3-6 to SC3-12, SC3-26, SC3-27: a pass lists and
joins, then catches up at most one history page and one thread, never more
than once a minute; each thread is filed by its channel's own record or the
name it carries; replies merge; a ts per channel stays apart; excluded
channels are never read."""

from datetime import timedelta

from django.utils import timezone

from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import sync
from services.connectors.models import Connector, SlackChannel, UnmatchedItem
from services.connectors.tests.slack_fake import use_slack
from services.customers.models import Customer, SlackConversation


class CatchUpTests(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        self.slack = self.connector("slack", "cs")
        self.slack.set_credentials({"bot_token": "xoxb-test-only"})
        self.slack.config = {"team_id": "T0ACME", "bot_name": "revenact"}
        self.slack.status = Connector.Status.CONNECTED
        self.slack.save()
        self.shack = Customer.objects.create(organisation=self.org, name="Taco Shack")

    def run_pass(self, *, fresh=True):
        if fresh:  # the 60-second guard: each pass in a test is a minute later
            SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
        return sync.sync_connector(self.slack)

    def history_calls(self, since=0):
        return [
            query.get("channel")
            for name, _b, query in self.slack_api.calls[since:]
            if name == "conversations.history"
        ]

    def test_one_channel_a_pass_and_never_twice_a_minute(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Taco Shack login broken")
        self.assertEqual(self.run_pass()["created"], 1)
        self.assertEqual(len(self.history_calls()), 1)
        before = len(self.slack_api.calls)
        self.run_pass(fresh=False)  # within the minute: no history, no replies
        self.assertEqual(self.history_calls(before), [])
        self.assertEqual(self.run_pass()["created"], 1)
        self.assertEqual(
            sorted(SlackConversation.objects.values_list("channel", "channel_name")),
            [("C0ESCALATE", "escalations"), ("C0SUPPORT", "support")],
        )
        self.assertEqual(SignalThread.objects.count(), 2)

    def test_a_page_with_more_walks_down_then_sets_the_watermark(self):
        for n in range(20):
            self.slack_api.say("C0SUPPORT", "U0FAIZ", f"Pizza Hut issue {n}")
        SlackChannel.objects.create(
            connector=self.slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        SlackChannel.objects.create(
            connector=self.slack,
            channel_id="C0ESCALATE",
            name="escalations",
            is_member=True,
            read_at=timezone.now(),
        )
        self.run_pass()
        row = SlackChannel.objects.get(channel_id="C0SUPPORT")
        self.assertTrue(row.walk_before)
        self.assertIsNone(row.read_at)
        self.assertEqual(SlackConversation.objects.count(), 15)
        self.run_pass()  # the walk continues before any other channel
        row.refresh_from_db()
        self.assertEqual((row.walk_before, row.walk_from), ("", None))
        self.assertIsNotNone(row.read_at)
        self.assertEqual(SlackConversation.objects.count(), 20)

    def test_a_channel_set_to_a_customer_files_everything_there(self):
        self.run_pass()
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(
            customer=self.shack, read_at=None
        )
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=timezone.now())
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        made = SlackConversation.objects.get()
        self.assertEqual((made.customer, made.matched_by), (self.shack, "channel"))

    def test_a_record_the_connection_no_longer_covers_is_not_used(self):
        self.run_pass()
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(
            customer=self.shack, read_at=None
        )
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=timezone.now())
        self.slack.customers.set([self.pizza])
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        self.assertEqual(SlackConversation.objects.get().customer, self.pizza)

    def test_an_excluded_channel_is_never_read(self):
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(included=False)
        before = len(self.slack_api.calls)
        for _ in range(3):
            self.run_pass()
        self.assertNotIn("C0ESCALATE", self.history_calls(before))

    def test_the_same_ts_in_two_channels_is_two_conversations(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.channels["C0ESCALATE"].append(
            {"ts": top, "user": "U0FAIZ", "text": "Pizza Hut login broken"}
        )
        self.run_pass()
        self.run_pass()
        self.assertEqual(SlackConversation.objects.filter(thread_ts=top).count(), 2)

    def test_a_shared_channel_s_conversation_says_so(self):
        self.slack_api.shared.add("C0ESCALATE")
        self.run_pass()
        SlackChannel.objects.filter(channel_id="C0ESCALATE").update(
            included=True, chosen_at=self.slack.created_at, read_at=None
        )
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=timezone.now())
        self.slack_api.say("C0ESCALATE", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        self.assertTrue(SlackConversation.objects.get().external_shared)
        self.slack.refresh_from_db()
        self.assertNotIn("external_shared", self.slack.config)

    def test_a_rate_limit_ends_the_catch_up_and_marks_only_that_it_asked(self):
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.refuse_next("conversations.history", "ratelimited")
        counts = self.run_pass()
        self.assertEqual(counts["created"], 0)
        self.assertEqual(SlackChannel.objects.exclude(asked_at=None).count(), 1)
        self.assertFalse(SlackChannel.objects.exclude(read_error="").exists())
        self.assertFalse(SlackChannel.objects.exclude(read_at=None).exists())
        self.slack.refresh_from_db()
        self.assertEqual(self.slack.status, Connector.Status.CONNECTED)

    def test_a_channel_the_bot_was_removed_from_is_marked(self):
        self.slack_api.refuse_next("conversations.history", "not_in_channel")
        self.run_pass()
        marked = SlackChannel.objects.filter(read_error="not_in_channel")
        self.assertEqual(marked.count(), 1)
        self.assertFalse(marked.get().is_member)

    def test_a_missed_thread_is_read_first_with_its_parent(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        self.run_pass()  # lists the channels and catches up #escalations (the first row)
        row = SlackChannel.objects.get(channel_id="C0SUPPORT")
        row.missed = [top]
        row.save(update_fields=["missed"])
        self.run_pass()
        made = SlackConversation.objects.get(channel="C0SUPPORT", thread_ts=top)
        self.assertEqual(
            [m["text"] for m in made.messages], ["Pizza Hut exports fail", "Still failing"]
        )
        row.refresh_from_db()
        self.assertEqual(row.missed, [])

    def test_a_moved_thread_s_new_replies_merge_with_the_stored_ones(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        first = self.slack_api.say("C0SUPPORT", "U0ANN", "Still failing", thread_ts=top)
        SlackChannel.objects.create(
            connector=self.slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        SlackChannel.objects.create(
            connector=self.slack,
            channel_id="C0ESCALATE",
            name="escalations",
            is_member=True,
            read_at=timezone.now(),
        )
        self.run_pass()  # files the top; the thread call reads its first reply
        made = SlackConversation.objects.get()
        self.assertEqual(made.latest_reply, first)
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Jesh, can you take this?", thread_ts=top)
        SlackChannel.objects.filter(channel_id="C0SUPPORT").update(read_at=None)
        self.run_pass()
        made.refresh_from_db()
        self.assertEqual(
            [m["text"] for m in made.messages],
            ["Pizza Hut exports fail", "Still failing", "Jesh, can you take this?"],
        )
        replies = [q for n, _b, q in self.slack_api.calls if n == "conversations.replies"]
        self.assertEqual(replies[-1]["oldest"], first)  # only what is new

    def test_a_thread_naming_no_one_waits_with_its_channel_in_its_key(self):
        top = self.slack_api.say("C0SUPPORT", "U0FAIZ", "Anyone seeing slow dashboards?")
        self.run_pass()
        self.run_pass()
        row = UnmatchedItem.objects.get(connector=self.slack)
        self.assertEqual((row.external_id, row.number), (f"C0SUPPORT:{top}", "#support"))
```

(`C0SUPPORT` and `C0ESCALATE` are the fake's channels; rows made by the listing take pks in the listing's sorted order, `C0ESCALATE` first. A test that needs one channel caught up first sets the other's `read_at`, as above.)

In `services/connectors/tests/test_slack_sync.py`: the class gains `run_pass` as above (with the 60-second guard reset); `test_a_channel_set_to_one_customer_files_everything_there` becomes:

```python
    def test_a_channel_set_to_one_customer_files_everything_there(self):
        self.run_pass()
        SlackChannel.objects.filter(connector=self.slack, channel_id="C0SUPPORT").update(
            customer=self.shack, read_at=None
        )
        SlackChannel.objects.filter(connector=self.slack).exclude(channel_id="C0SUPPORT").update(
            read_at=timezone.now()
        )
        self.slack_api.say("C0SUPPORT", "U0FAIZ", "Pizza Hut exports fail")
        self.run_pass()
        made = SlackConversation.objects.get()
        self.assertEqual((made.customer, made.matched_by), (self.shack, "channel"))
```

(import `SlackChannel`, `timezone`); every `UnmatchedItem` lookup by `external_id=<ts>` there reads `external_id=f"C0SUPPORT:{ts}"`; a case that read replies of several threads in one pass reads them over as many passes (one thread a pass); a case that relied on a deleted reply vanishing on a re-read is deleted (SC3-27: deletes come by event, Task 6 tests them); `test_slack_sync.py:129`'s direct `fetch_threads` call uses `read_page` + `thread_of` as Task 2's adapter does.

- [ ] **Step 2: Run them to verify they fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_catchup --parallel auto --noinput`
Expected: FAIL (`AttributeError: 'SlackProvider' object has no attribute 'fetch_threads'` from the old pass; then the assertions).

- [ ] **Step 3: Filing per channel, with merged replies**

In `services/connectors/sync.py`:

```python
def _synced(connector, counts, *, cursor, now):
    """A pass went through: its cursor, a clean status and its summary."""
    connector.sync_cursor = (cursor or "")[:512]
    connector.status = Connector.Status.CONNECTED
    connector.error = ""
    connector.last_synced_at = now
    connector.last_sync_note = summary_line(counts)[:255]
    connector.save()
```

(keep `_synced`'s body as it is today if it already matches; only the slice is new.)

`_apply_thread` merges (SC3-27):

```python
def _apply_thread(conversation, remote, now):
    """Fold one read into a conversation; True when a human message is new
    (SE1-8). Replies merge by ts with the stored ones (D3, SC3-27): a read
    brings only what is new, and an edit replaces its own message."""
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
    merged = {m["ts"]: m for m in stored[1:]}
    merged.update({m["ts"]: m for m in remote.replies or []})
    replies = sorted(merged.values(), key=lambda m: float(m["ts"]))
    messages = [top, *replies[-(SlackConversation.MAX_MESSAGES - 1) :]]
    before = {m.get("ts") for m in stored}
    conversation.messages = messages
    conversation.title = (first_line(remote.text) or "(empty message)")[:255]
    if remote.replies is not None and remote.latest_reply:
        mark = conversation.latest_reply or "0"
        if float(remote.latest_reply) > float(mark):
            conversation.latest_reply = remote.latest_reply[:32]
    conversation.last_message_at = max(ts_time(m["ts"]) for m in messages)
    conversation.synced_at = now
    return any(not m["bot"] and m["ts"] not in before for m in messages)
```

`_READ_FIELDS = ("messages", "title", "latest_reply", "last_message_at", "external_shared", "channel_name")`.

`_as_unmatched(connector, remote, name)`: `external_id=unmatched.slack_key(remote.channel, remote.thread_ts)`, `number=f"#{name or remote.channel}"[:32]` (the rest unchanged).

Then, replacing `file_conversation`:

```python
def _channel_row(connector, channel_id):
    """A lone call's channel row (a pass and an event hand it in), or None."""
    from .models import SlackChannel

    return SlackChannel.objects.filter(connector=connector, channel_id=channel_id).first()


def _pinned(connector, channel):
    """SC3-8, SC3-9: the channel's own record, while the connection covers it."""
    if channel is None or (channel.customer_id is None and channel.account_id is None):
        return None, None
    customer, account = channel.customer, channel.account
    # SOC2:AUTH-02 only a record the connection covers (Ticket.clean's rule)
    if not connector.covers(customer=customer, account=account):
        return None, None
    return customer, account


def file_conversation(connector, remote, names, *, now, channel=None, linked=None):
    """Contract §2 step 4 (D1), per channel (D3): ("created" | "updated" |
    "unchanged" | "unmatched", the conversation or None). `channel` is the
    SlackChannel row of `remote.channel`; a lone call reads it. `linked`
    returns `linked_members`, read once a pass."""
    from services.agents.threads import touch_conversation

    from . import naming

    if channel is None:
        channel = _channel_row(connector, remote.channel)
    name = channel.name if channel is not None else ""
    shared = bool(channel.external_shared) if channel is not None else False
    key = unmatched.slack_key(remote.channel, remote.thread_ts)
    existing = SlackConversation.objects.filter(
        connector=connector, channel=remote.channel, thread_ts=remote.thread_ts
    ).first()
    if existing is not None:
        before = [getattr(existing, field) for field in _READ_FIELDS]
        # SC3-12: the channel's flag and name, as now known
        existing.external_shared = shared
        existing.channel_name = name or existing.channel_name
        fresh = _apply_thread(existing, remote, now)
        if [getattr(existing, field) for field in _READ_FIELDS] == before:
            return "unchanged", existing
        existing.save()
        unmatched.forget(connector, key)
        if fresh:
            touch_conversation(existing, now)
        return "updated", existing
    customer, account = _pinned(connector, channel)
    how, candidates = SlackConversation.MatchedBy.CHANNEL, []
    if customer is None and account is None:
        found, near = naming.find(remote.text, names)
        how = SlackConversation.MatchedBy.NAME
        if found is not None:
            # The match is a pk from this workspace's own covered names, never user input.
            customer, account = (
                (Customer.objects.get(pk=found.id), None)
                if found.type == "customer"
                else (None, Account.objects.get(pk=found.id))
            )
        candidates = [{"type": n.type, "id": n.id} for n in near]
    if customer is None and account is None:
        try:
            with transaction.atomic():  # a savepoint: one bad item never stops the batch
                unmatched.keep(
                    connector, _as_unmatched(connector, remote, name), candidates=candidates
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("unmatched keep failed: %s", type(exc).__name__)
        return "unmatched", None
    conversation = SlackConversation(
        customer=customer,
        account=account,
        connector=connector,
        department=connector.department,
        channel=remote.channel[:32],
        channel_name=name[:80],
        thread_ts=remote.thread_ts[:32],
        started_by=_started_by(connector, remote, linked),
        started_by_name=remote.user_name[:150],
        started_by_email=remote.user_email[:254],
        url=remote.url[:500],
        matched_by=how,
        external_shared=shared,
    )
    _apply_thread(conversation, remote, now)
    conversation.save()
    unmatched.forget(connector, key)
    touch_conversation(conversation, now)
    return "created", conversation


def stored_remote(conversation, replies):
    """A stored conversation as a RemoteThread carrying `replies` (new ones,
    or an edited one): the events' and the catch-up's way to add to a thread
    whose top they don't re-read (SC3-24, SC3-27)."""
    from services.connectors.providers.base import RemoteThread
    from services.connectors.providers.slack import ts_time

    top = (conversation.messages or [{}])[0]
    marks = [conversation.latest_reply or "0", *(m["ts"] for m in replies or [])]
    latest = max(marks, key=float)
    return RemoteThread(
        thread_ts=conversation.thread_ts,
        channel=conversation.channel,
        text=top.get("text", ""),
        user_id=top.get("user_id", ""),
        user_name=top.get("name", ""),
        user_email=conversation.started_by_email,
        posted_at=ts_time(conversation.thread_ts),
        latest_reply="" if latest == "0" else latest,
        replies=replies,
        url=conversation.url,
    )


#: SC3-25: what a deleted top message reads as (Slack's own words).
DELETED = "This message was deleted."


def edit_message(conversation, ts, text):
    """SC3-25: a stored message takes its edited text; the agent is not woken."""
    from services.connectors.providers.base import first_line

    changed = False
    for message in conversation.messages or []:
        if message.get("ts") == ts and message.get("text") != text:
            message["text"], changed = text[: SlackConversation.TEXT_CHARS], True
    if not changed:
        return False
    if ts == conversation.thread_ts:
        conversation.title = (first_line(text) or "(empty message)")[:255]
    conversation.save(update_fields=["messages", "title"])
    return True


def delete_message(conversation, ts):
    """SC3-25: a deleted reply goes; a deleted top keeps its place as DELETED."""
    messages = conversation.messages or []
    if ts == conversation.thread_ts:
        if not messages or messages[0].get("text") == DELETED:
            return False
        messages[0]["text"] = DELETED
        conversation.title = DELETED
    else:
        kept = [m for m in messages if m.get("ts") != ts]
        if len(kept) == len(messages):
            return False
        conversation.messages = kept
    conversation.save(update_fields=["messages", "title"])
    return True
```

In `services/connectors/unmatched.py`, beside `forget`:

```python
def slack_key(channel, ts):
    """Slack escalations D3 (SC3-10): a Slack row's key carries its channel."""
    return f"{channel}:{ts}"[:128]
```

- [ ] **Step 4: The pass and the catch-up**

Create `services/connectors/slack_catchup.py`:

```python
"""The slow catch-up (Slack escalations D3, contract SC3-6, SC3-26): what
Slack's events missed, read within an unlisted app's limits. Per connection
and pass, never within a minute of the last: ONE conversations.history page
(15) of one channel, and at most ONE conversations.replies page (15): a
thread an event could not file, else a stored thread whose replies moved.
No message text is logged."""

import logging

from django.db import transaction

from services.customers.models import SlackConversation

from . import slack_channels
from .providers.base import ProviderError
from .providers.slack import WINDOW, Budget, is_top, ts_time

logger = logging.getLogger(__name__)


def _posted(raw):
    return ts_time(str(raw["ts"]))


def _limited(exc):
    return exc.code == "ratelimited" or exc.status == 429


def _refused(row, exc):
    """A read Slack refused (not a rate limit): the row says why (SC3-6)."""
    row.read_error = (exc.code or "refused")[:64]
    row.is_member = row.is_member and exc.code != "not_in_channel"
    row.save(update_fields=["read_error", "is_member", "updated_at"])


def _file(connector, remote, names, *, now, row, linked, counts):
    from .sync import file_conversation

    with transaction.atomic():
        outcome, _ = file_conversation(
            connector, remote, names, now=now, channel=row, linked=linked
        )
    if outcome in counts:  # "unchanged" is not news
        counts[outcome] += 1


def _page(connector, provider, creds, row, *, now, names, linked, counts):
    """SC3-6 (1): one history page of `row`; the moved stored threads, or
    None when Slack refused (a rate limit raises nothing and ends the run)."""
    if row.walk_from is None:
        row.walk_from = now
    floor = now - WINDOW
    if row.read_at is not None:
        floor = max(floor, row.read_at - slack_channels.OVERLAP)
    try:
        tops, more, lowest = provider.read_page(
            connector.config,
            creds,
            channel=row.channel_id,
            oldest=f"{floor.timestamp():.6f}",
            latest=row.walk_before,
        )
    except ProviderError as exc:
        if exc.reauth:
            raise
        if _limited(exc):
            return None
        _refused(row, exc)
        return None
    people = {}
    for raw in tops:
        remote = provider.thread_of(creds, connector.config, row.channel_id, raw, people=people)
        _file(connector, remote, names, now=now, row=row, linked=linked, counts=counts)
    if more and lowest:
        row.walk_before = lowest
    else:
        row.read_at, row.walk_before, row.walk_from = row.walk_from, "", None
    row.read_error = ""
    if tops:
        newest = max(_posted(raw) for raw in tops)
        row.last_message_at = max(row.last_message_at or newest, newest)
    row.save(
        update_fields=[
            "walk_before",
            "walk_from",
            "read_at",
            "read_error",
            "last_message_at",
            "updated_at",
        ]
    )
    stored = dict(
        SlackConversation.objects.filter(
            connector=connector,
            channel=row.channel_id,
            thread_ts__in=[str(raw["ts"]) for raw in tops],
        ).values_list("thread_ts", "latest_reply")
    )
    return [
        str(raw["ts"])
        for raw in tops
        if str(raw["ts"]) in stored
        and raw.get("latest_reply")
        and str(raw["latest_reply"]) != stored[str(raw["ts"])]
    ]


def _thread(connector, provider, creds, row, ts, *, now, names, linked, counts, missed):
    """SC3-6 (2), SC3-26: one replies page of one thread, merged and filed."""
    from .sync import stored_remote

    existing = SlackConversation.objects.filter(
        connector=connector, channel=row.channel_id, thread_ts=ts
    ).first()
    since = existing.latest_reply if existing is not None else ""
    try:
        parent, replies = provider.read_thread(
            connector.config, creds, channel=row.channel_id, thread_ts=ts, since=since
        )
    except ProviderError as exc:
        if exc.reauth:
            raise
        if missed and exc.code in ("thread_not_found", "channel_not_found"):
            slack_channels.forget_missed(row, ts)
        return
    if existing is not None:
        remote = stored_remote(existing, replies)
    elif parent is not None and is_top(parent):
        latest = max((m["ts"] for m in replies), key=float, default="")
        remote = provider.thread_of(
            creds, connector.config, row.channel_id, parent, replies=replies, latest=latest
        )
    else:
        remote = None  # not a conversation's thread (a bot's post, a join)
    if remote is not None:
        _file(connector, remote, names, now=now, row=row, linked=linked, counts=counts)
    if missed:
        slack_channels.forget_missed(row, ts)


def run(connector, provider, creds, rows, *, now, counts, names, linked):
    """One catch-up (SC3-6), when slack_channels.history_due said so."""
    budget = Budget()
    row = slack_channels.pick(rows)
    moved = []
    if row is not None:
        row.asked_at = now
        row.save(update_fields=["asked_at", "updated_at"])
        moved = _page(
            connector, provider, creds, row, now=now, names=names, linked=linked, counts=counts
        )
        if moved is None:
            return
    waiting = slack_channels.next_missed(rows)
    if waiting is not None and budget.replies > 0:
        budget.replies -= 1
        missed_row, ts = waiting
        _thread(
            connector,
            provider,
            creds,
            missed_row,
            ts,
            now=now,
            names=names,
            linked=linked,
            counts=counts,
            missed=True,
        )
    elif moved and budget.replies > 0:
        budget.replies -= 1
        _thread(
            connector,
            provider,
            creds,
            row,
            moved[0],
            now=now,
            names=names,
            linked=linked,
            counts=counts,
            missed=False,
        )
```

In `services/connectors/sync.py`, `sync_conversations` becomes:

```python
def sync_conversations(connector):
    """One Slack pass (D3 contract §4): list the channels, join new ones and,
    at most once a minute, catch up one page and one thread. Events file the
    rest as they happen (slack_events.py)."""
    from . import naming, slack_catchup, slack_channels

    provider = get_provider(connector.provider)
    now = timezone.now()
    counts = _nothing()
    try:
        creds = connector.get_credentials()
        rows = slack_channels.refresh(connector, provider, creds, now=now)
        slack_channels.join_missing(connector, provider, creds, rows)
        if slack_channels.history_due(connector, now):
            names = naming.covered_names(connector)
            linked = functools.cache(lambda: linked_members(connector))
            slack_catchup.run(
                connector,
                provider,
                creds,
                rows,
                now=now,
                counts=counts,
                names=names,
                linked=linked,
            )
    except (ProviderError, ValueError, KeyError) as exc:
        return _failed(connector, exc)
    _synced(connector, counts, cursor=connector.sync_cursor, now=now)
    return counts
```

(The connection's `config["external_shared"]` is no longer written: SC3-12. `_scoped` stays: tickets still use it.)

- [ ] **Step 5: Run the tests to verify they pass, with the neighbours**

Run: `$PY manage.py test services.connectors.tests.test_slack_catchup services.connectors.tests.test_slack_sync services.connectors.tests.test_unmatched_sync services.connectors.tests.test_unmatched_keep services.agents.tests.test_slack_conversation_intake services.agents.tests.test_fast_lane_run --parallel auto --noinput`
Expected: PASS. A D1 test that counted Slack API calls now sees `conversations.list` once a pass and no `conversations.info`: update the count with a comment "D3: the listing replaces conversations.info; one history call a pass".

- [ ] **Step 6: Commit**

```bash
git add services/connectors/sync.py services/connectors/unmatched.py services/connectors/slack_catchup.py services/connectors/tests/test_slack_catchup.py services/connectors/tests/test_slack_sync.py
git commit -m "feat(connectors): file slack threads per channel with merged replies; a once-a-minute catch-up

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: Needs a customer, matched into the right channel

**Files:**
- Modify: `services/connectors/unmatched.py` (`split_slack_key`, `_conversation_from`, `match`), `services/connectors/tests/unmatched_fixtures.py` (Slack rows' keys)
- Create: `services/connectors/tests/test_unmatched_channels.py`

**Interfaces:**
- Produces: `unmatched.split_slack_key(row) -> (channel, ts)` (a row kept before D3 reads its connection's old channel).
- Consumes: `slack_key` (Task 4), `SlackChannel` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_unmatched_channels.py`:

```python
"""Slack escalations D3, SC3-10: matching a waiting Slack row makes its
conversation in the row's own channel, named and flagged as that channel."""

from django.utils import timezone

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors import unmatched
from services.connectors.models import SlackChannel, UnmatchedItem
from services.customers.models import SlackConversation

MATCH = "/api/v1/work/unmatched/{}/match/"


class UnmatchedChannelTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        SlackChannel.objects.create(
            connector=self.support,
            channel_id="C0ESCALATE",
            name="escalations",
            is_member=True,
            external_shared=True,
        )

    def row(self, external_id):
        now = timezone.now()
        return UnmatchedItem.objects.create(
            organisation=self.org,
            connector=self.support,
            provider="slack",
            department=self.support.department,
            external_id=external_id,
            number="#escalations",
            title="Exports fail",
            excerpt="Exports fail",
            requester_name="Faiz Jamal",
            opened_on=now.date(),
            first_seen_at=now,
            last_seen_at=now,
        )

    def test_the_key_says_which_channel(self):
        self.assertEqual(
            unmatched.split_slack_key(self.row("C0ESCALATE:1792041400.000100")),
            ("C0ESCALATE", "1792041400.000100"),
        )
        # a row kept before D3: its connection's one channel
        self.assertEqual(
            unmatched.split_slack_key(self.row("1792041401.000100")),
            ("C0SUPPORT", "1792041401.000100"),
        )

    def test_a_match_makes_the_conversation_in_that_channel(self):
        row = self.row("C0ESCALATE:1792041400.000100")
        answer = self.client_for(self.csm).post(
            MATCH.format(row.pk), {"customer_id": self.pizza.pk}, format="json"
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        made = SlackConversation.objects.get()
        self.assertEqual(
            (made.channel, made.channel_name, made.thread_ts, made.external_shared),
            ("C0ESCALATE", "escalations", "1792041400.000100", True),
        )
        self.assertIn("/archives/C0ESCALATE/", made.url)
```

(The match route and body are R2-D3's: copy them from `services/connectors/tests/test_unmatched_sync.py` or `services/work/tests` if they differ.) In `unmatched_fixtures.py`, a Slack row's `external_id` becomes `f"C0SUPPORT:{ts}"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `$PY manage.py test services.connectors.tests.test_unmatched_channels --parallel auto --noinput`
Expected: FAIL (`AttributeError: ... 'split_slack_key'`).

- [ ] **Step 3: Implement**

In `services/connectors/unmatched.py`:

```python
def split_slack_key(row):
    """(channel, ts) of a Slack row; a row kept before D3 is its connection's
    one channel (SC3-11 rewrote those, this reads any it missed)."""
    channel, sep, ts = row.external_id.partition(":")
    if sep:
        return channel, ts
    return str((row.connector.config or {}).get("channel", "")), row.external_id
```

`_conversation_from(row, parent, now)` becomes:

```python
def _conversation_from(row, parent, now):
    """A matched Slack row as a conversation in its own channel (SC3-10)."""
    from services.connectors.providers.slack import message_url, ts_time

    from .models import SlackChannel

    channel, ts = split_slack_key(row)
    found = SlackChannel.objects.filter(connector=row.connector, channel_id=channel).first()
    try:
        at = ts_time(ts)
    except ValueError:
        at = row.first_seen_at
    starter = member_for_email(row.organisation_id, row.requester_email)
    return SlackConversation.objects.create(
        **parent,
        connector=row.connector,
        department=row.department,
        channel=channel[:32],
        channel_name=(found.name if found else row.number.lstrip("#"))[:80],
        thread_ts=ts[:32],
        title=row.title or row.number,
        messages=[
            {"ts": ts, "user_id": "", "name": row.requester_name, "text": row.excerpt, "bot": False}
        ],
        started_by=starter,
        started_by_name=row.requester_name,
        started_by_email=row.requester_email,
        url=row.url or message_url(channel, ts),
        last_message_at=at,
        matched_by=SlackConversation.MatchedBy.PERSON,
        external_shared=bool(found.external_shared) if found else False,
        synced_at=now,
    )
```

(keep the function's existing name and arguments if they differ; only its body's channel, name, ts and shared flag change), and in `match`, the Slack existence check:

```python
if slack:
    channel, ts = split_slack_key(row)
    already = SlackConversation.objects.filter(
        connector_id=row.connector_id, channel=channel, thread_ts=ts[:32]
    )
else:
    already = Ticket.objects.filter(connector_id=row.connector_id, external_id=row.external_id)
```

- [ ] **Step 4: Run the tests, with the neighbours**

Run: `$PY manage.py test services.connectors.tests.test_unmatched_channels services.connectors.tests.test_unmatched_sync services.connectors.tests.test_unmatched_keep services.connectors.tests.test_unmatched_purge services.work --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/connectors/unmatched.py services/connectors/tests/test_unmatched_channels.py services/connectors/tests/unmatched_fixtures.py
git commit -m "fix(connectors): a matched slack message becomes a conversation in its own channel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The Events endpoint: Slack pushes, we file before we answer

**Files:**
- Create: `services/connectors/slack_events.py`, `services/connectors/slack_events_views.py`, `services/connectors/tests/slack_events_fixtures.py`, `services/connectors/tests/test_slack_events.py`
- Modify: `services/connectors/urls.py`, `core/throttling.py` (`SlackEventsThrottle`), `config/settings.py` (`slack_events` rate)

**Interfaces:**
- Produces: `POST /api/v1/connectors/slack/events/` (contract §3.3); `slack_events.handle(envelope, *, now=None) -> list[str]` (one outcome per Slack connection of the team: `"filed"`, `"unchanged"`, `"waiting"`, `"missed"`, `"ignored"`, `"excluded"`, `"edited"`, `"deleted"`, `"listed"`, `"joined"`); `SlackEventsThrottle` (scope `slack_events`).
- Consumes: `slack_interactivity.verified`, `slack_interactivity._team_connectors` (#139); `is_top`, `is_ours`, `reply_of`, `thread_of`, `EVENT_TIMEOUT` (Task 2); `slack_channels.remember_missed`, `join_missing` (Task 3); `sync.file_conversation`, `stored_remote`, `edit_message`, `delete_message` (Task 4); `unmatched.slack_key` (Task 4).

- [ ] **Step 1: The signed-event fixtures**

Create `services/connectors/tests/slack_events_fixtures.py`:

```python
"""Signed Slack Events API deliveries for tests (Slack escalations D3,
contract §3.3). A fresh signing secret per run, never a real one; fake
teams, channels and people. Nothing leaves the process."""

import hashlib
import hmac
import itertools
import json
import secrets
import time

URL = "/api/v1/connectors/slack/events/"
#: A fresh signing secret per run: never a real one.
SIGNING = secrets.token_hex(16)
APP = "A0OURS"
_ids = itertools.count(1)


def sign(body, *, secret=SIGNING, at=None):
    stamp = str(int(at if at is not None else time.time()))
    digest = hmac.new(secret.encode(), f"v0:{stamp}:".encode() + body, hashlib.sha256)
    return stamp, "v0=" + digest.hexdigest()


def message(channel, ts, text, *, user="U0FAIZ", thread_ts=None, **extra):
    event = {
        "type": "message",
        "channel": channel,
        "channel_type": "channel",
        "user": user,
        "text": text,
        "ts": ts,
        "event_ts": ts,
        **extra,
    }
    if thread_ts:
        event["thread_ts"] = thread_ts
    return event


def envelope(event, *, team="T0ACME", shared=False):
    return {
        "token": "unused",
        "team_id": team,
        "api_app_id": APP,
        "event": event,
        "type": "event_callback",
        "event_id": f"Ev{next(_ids):08d}",
        "event_time": int(time.time()),
        "is_ext_shared_channel": shared,
        "authorizations": [{"team_id": team, "user_id": "U0BOT", "is_bot": True}],
    }


def headers_for(body, *, retry=None, secret=SIGNING, at=None):
    stamp, signature = sign(body, secret=secret, at=at)
    out = {"X-Slack-Request-Timestamp": stamp, "X-Slack-Signature": signature}
    if retry:
        out.update({"X-Slack-Retry-Num": str(retry), "X-Slack-Retry-Reason": "http_timeout"})
    return out


def post(client, payload, *, retry=None, secret=SIGNING, at=None, raw=None):
    """POST one signed delivery through Django's test client."""
    body = raw if raw is not None else json.dumps(payload).encode()
    extra = {
        f"HTTP_{k.upper().replace('-', '_')}": v
        for k, v in headers_for(body, retry=retry, secret=secret, at=at).items()
    }
    return client.post(URL, data=body, content_type="application/json", **extra)
```

- [ ] **Step 2: Write the failing tests**

Create `services/connectors/tests/test_slack_events.py`:

```python
"""Slack escalations D3, contract §3.3, SC3-7, SC3-22 to SC3-30: Slack's
signed Events API deliveries. url_verification; a forged, stale or unsigned
request is refused; every verified delivery answers 200; a message in an
included channel is filed before the answer (the agent's thread touched for
its tick), once however often Slack retries; replies merge; our own posts
never wake the agent; edits and deletes are honoured quietly; an excluded
channel stores nothing; what can't be filed waits for the catch-up; a new
channel is joined at once. Slack is a fake; the secret is per run."""

import json
from unittest.mock import patch

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.agents.models import SignalThread
from services.agents.tests.intake_fixtures import IntakeFixture
from services.connectors import sync
from services.connectors.models import Connector, SlackChannel, UnmatchedItem
from services.connectors.tests.slack_events_fixtures import (
    SIGNING,
    envelope,
    message,
    post,
)
from services.connectors.tests.slack_fake import use_slack
from services.customers.models import SlackConversation

TOP = "1792041400.000100"
#: Contract §6: measured in Step 6 and written into "Changes during the build".
SLACK_EVENT_REPLY_QUERIES = None


@override_settings(SLACK_SIGNING_SECRET=SIGNING)
class SlackEventsTests(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.slack_api = use_slack(self)
        self.slack = self.connector("slack", "cs")
        self.slack.set_credentials({"bot_token": "xoxb-test-only"})
        self.slack.config = {
            "team_id": "T0ACME",
            "bot_name": "revenact",
            "bot_id": "B0BOT",
            "bot_user_id": "U0BOT",
        }
        self.slack.status = Connector.Status.CONNECTED
        self.slack.granted_scopes = ["channels:history", "channels:read"]
        self.slack.save()
        self.support = SlackChannel.objects.create(
            connector=self.slack, channel_id="C0SUPPORT", name="support", is_member=True
        )
        self.client = APIClient()

    def send(self, event, **kwargs):
        answer = post(self.client, envelope(event, shared=kwargs.pop("shared", False)), **kwargs)
        self.assertEqual(answer.status_code, 200, answer.content)
        return answer

    def filed(self, ts=TOP, channel="C0SUPPORT"):
        return SlackConversation.objects.get(connector=self.slack, channel=channel, thread_ts=ts)

    def thread_of(self, conversation):
        return SignalThread.objects.get(
            external_id=f"{self.slack.pk}:{conversation.channel}:{conversation.thread_ts}"
        )

    def test_url_verification_answers_the_challenge(self):
        answer = post(
            self.client, {"type": "url_verification", "challenge": "3eZbrw1aBm2rZgRNFdxV"}
        )
        self.assertEqual(
            (answer.status_code, answer.json()), (200, {"challenge": "3eZbrw1aBm2rZgRNFdxV"})
        )

    def test_a_forged_stale_or_unsigned_delivery_is_refused_and_files_nothing(self):
        event = envelope(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.assertEqual(post(self.client, event, secret="not-the-secret").status_code, 401)
        self.assertEqual(post(self.client, event, at=0).status_code, 401)
        unsigned = self.client.post(
            "/api/v1/connectors/slack/events/",
            data=json.dumps(event),
            content_type="application/json",
        )
        self.assertEqual(unsigned.status_code, 401)
        with override_settings(SLACK_SIGNING_SECRET=""):
            self.assertEqual(post(self.client, event).status_code, 401)
        self.assertFalse(SlackConversation.objects.exists())

    def test_a_body_that_is_not_an_object_is_refused(self):
        self.assertEqual(post(self.client, None, raw=b"not json").status_code, 400)
        self.assertEqual(post(self.client, None, raw=b"[1, 2]").status_code, 400)

    def test_a_top_message_is_filed_before_the_answer_and_its_thread_touched(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        made = self.filed()
        self.assertEqual(
            (made.customer, made.channel_name, made.started_by_name, made.matched_by),
            (self.pizza, "support", "Faiz Jamal", "name"),
        )
        self.assertTrue(self.thread_of(made))
        self.support.refresh_from_db()
        self.assertIsNotNone(self.support.event_at)

    def test_slack_s_retries_file_once(self):
        event = message("C0SUPPORT", TOP, "Pizza Hut exports fail")
        self.send(event)
        self.send(event, retry=1)
        self.send(event, retry=2)
        self.assertEqual(SlackConversation.objects.count(), 1)
        self.assertEqual(len(self.filed().messages), 1)

    def test_a_reply_is_merged_once_and_wakes_the_thread(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        before = self.thread_of(self.filed()).last_message_at
        reply = message("C0SUPPORT", "1792041460.000100", "Jesh, can you take this?", thread_ts=TOP)
        self.send(reply)
        self.send(reply, retry=1)
        made = self.filed()
        self.assertEqual(
            [m["text"] for m in made.messages],
            ["Pizza Hut exports fail", "Jesh, can you take this?"],
        )
        self.assertEqual(made.latest_reply, "1792041460.000100")
        self.assertGreater(self.thread_of(made).last_message_at, before)

    def test_our_bot_s_reply_is_kept_but_never_wakes_the_agent(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        before = self.thread_of(self.filed()).last_message_at
        mine = message(
            "C0SUPPORT",
            "1792041470.000100",
            "Logged as KAN-2.",
            user="",
            thread_ts=TOP,
            bot_id="B0BOT",
        )
        self.send(mine)
        made = self.filed()
        self.assertEqual((made.messages[-1]["bot"], made.messages[-1]["ours"]), (True, True))
        self.assertEqual(self.thread_of(made).last_message_at, before)

    def test_a_person_s_post_made_through_our_app_is_marked(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.send(
            message(
                "C0SUPPORT", "1792041480.000100", "Logged as KAN-2.", thread_ts=TOP, app_id="A0OURS"
            )
        )
        self.assertTrue(self.filed().messages[-1]["via_app"])
        # and a top message made through our app never starts a conversation
        self.send(message("C0SUPPORT", "1792041490.000100", "Pizza Hut: logged.", app_id="A0OURS"))
        self.assertEqual(SlackConversation.objects.count(), 1)

    def test_bots_joins_and_file_shares_never_start_a_conversation(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut bot alert", user="", bot_id="B0OTHER"))
        self.send(message("C0SUPPORT", "1792041401.000100", "joined", subtype="channel_join"))
        self.send(message("C0SUPPORT", "1792041402.000100", "Pizza Hut", subtype="file_share"))
        self.assertFalse(SlackConversation.objects.exists())

    def test_a_reply_to_an_unknown_thread_waits_for_the_catch_up(self):
        self.send(message("C0SUPPORT", "1792041460.000100", "Still failing", thread_ts=TOP))
        self.support.refresh_from_db()
        self.assertEqual(self.support.missed, [TOP])

    def test_a_reply_to_a_waiting_thread_is_left_to_the_catch_up(self):
        self.send(message("C0SUPPORT", TOP, "Anyone seeing slow dashboards?"))
        self.assertTrue(UnmatchedItem.objects.filter(external_id=f"C0SUPPORT:{TOP}").exists())
        self.send(message("C0SUPPORT", "1792041460.000100", "Yes, me too", thread_ts=TOP))
        self.support.refresh_from_db()
        self.assertEqual(self.support.missed, [])

    def test_an_excluded_channel_stores_nothing(self):
        SlackChannel.objects.filter(pk=self.support.pk).update(included=False)
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.assertFalse(SlackConversation.objects.exists())
        self.support.refresh_from_db()
        self.assertIsNone(self.support.event_at)

    def test_an_unknown_public_channel_becomes_a_row_and_a_shared_one_starts_excluded(self):
        self.send(message("C0NEW", TOP, "Pizza Hut exports fail"))
        self.assertTrue(SlackChannel.objects.get(channel_id="C0NEW").included)
        self.assertEqual(self.filed(channel="C0NEW").customer, self.pizza)
        self.send(message("C0GLOBEX", TOP, "Pizza Hut exports fail"), shared=True)
        row = SlackChannel.objects.get(channel_id="C0GLOBEX")
        self.assertEqual((row.included, row.external_shared), (False, True))
        self.assertFalse(SlackConversation.objects.filter(channel="C0GLOBEX").exists())

    def test_an_unknown_team_or_event_kind_answers_200_and_stores_nothing(self):
        answer = post(self.client, envelope(message("C0SUPPORT", TOP, "Pizza Hut"), team="T0OTHER"))
        self.assertEqual(answer.status_code, 200)
        reaction = {"type": "reaction_added", "user": "U0FAIZ", "reaction": "eyes"}
        self.assertEqual(post(self.client, envelope(reaction)).status_code, 200)
        limited = {"type": "app_rate_limited", "team_id": "T0ACME", "minute_rate_limited": 1}
        self.assertEqual(post(self.client, limited).status_code, 200)
        self.assertFalse(SlackConversation.objects.exists())

    def test_an_edit_changes_the_text_quietly(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        reply_ts = "1792041460.000100"
        self.send(message("C0SUPPORT", reply_ts, "Jesh can take this", thread_ts=TOP))
        before = self.thread_of(self.filed()).last_message_at
        edited = {
            "type": "message",
            "subtype": "message_changed",
            "channel": "C0SUPPORT",
            "channel_type": "channel",
            "hidden": True,
            "ts": "1792041500.000100",
            "message": {
                "user": "U0FAIZ",
                "text": "Faiz can take this",
                "ts": reply_ts,
                "thread_ts": TOP,
                "edited": {"user": "U0FAIZ", "ts": "1792041500.000000"},
            },
        }
        self.send(edited)
        made = self.filed()
        self.assertEqual(made.messages[-1]["text"], "Faiz can take this")
        self.assertEqual(self.thread_of(made).last_message_at, before)

    def test_deletes_remove_a_reply_mark_a_top_and_forget_a_waiting_one(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        reply_ts = "1792041460.000100"
        self.send(message("C0SUPPORT", reply_ts, "Still failing", thread_ts=TOP))

        def deleted(ts, thread=None):
            return {
                "type": "message",
                "subtype": "message_deleted",
                "channel": "C0SUPPORT",
                "channel_type": "channel",
                "hidden": True,
                "ts": "1792041600.000100",
                "deleted_ts": ts,
                "previous_message": {"ts": ts, "thread_ts": thread or ts, "user": "U0FAIZ"},
            }

        self.send(deleted(reply_ts, TOP))
        self.assertEqual(len(self.filed().messages), 1)
        self.send(deleted(TOP))
        self.assertEqual(self.filed().messages[0]["text"], sync.DELETED)
        waiting = "1792041700.000100"
        self.send(message("C0SUPPORT", waiting, "Anyone seeing slow dashboards?"))
        self.send(deleted(waiting))
        self.assertFalse(UnmatchedItem.objects.filter(external_id=f"C0SUPPORT:{waiting}").exists())

    def test_a_new_channel_is_joined_at_once_with_the_scope(self):
        self.slack_api.channels["C0FRESH"] = []
        self.slack_api.names["C0FRESH"] = "alfiee-escalations"
        created = {
            "type": "channel_created",
            "channel": {"id": "C0FRESH", "name": "alfiee-escalations", "creator": "U0FAIZ"},
        }
        self.send(created)
        row = SlackChannel.objects.get(channel_id="C0FRESH")
        self.assertEqual((row.name, row.is_member), ("alfiee-escalations", False))
        self.slack.granted_scopes = [*self.slack.granted_scopes, "channels:join"]
        self.slack.save(update_fields=["granted_scopes"])
        self.slack_api.channels["C0FRESH2"] = []
        self.send({**created, "channel": {"id": "C0FRESH2", "name": "fresh-two"}})
        self.assertTrue(SlackChannel.objects.get(channel_id="C0FRESH2").is_member)
        self.assertIn(("conversations.join", 2), self.slack_api.timeouts)

    def test_a_failure_while_filing_answers_200_and_queues_the_thread(self):
        with patch.object(sync, "file_conversation", side_effect=RuntimeError("boom")):
            self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.support.refresh_from_db()
        self.assertEqual(self.support.missed, [TOP])

    def test_a_reply_event_costs_a_fixed_number_of_queries(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        reply = message("C0SUPPORT", "1792041460.000100", "Still failing", thread_ts=TOP)
        with CaptureQueriesContext(connection) as queries:
            self.send(reply)
        self.assertEqual(len(queries), SLACK_EVENT_REPLY_QUERIES)
```

- [ ] **Step 3: Run them to verify they fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_events --parallel auto --noinput`
Expected: FAIL (404 for the route).

- [ ] **Step 4: The handler**

Create `services/connectors/slack_events.py`:

```python
"""Slack's Events API (Slack escalations D3, contract §3.3, SC3-7, SC3-22 to
SC3-30). Slack pushes each message of the channels the bot is in; we file it
before we answer, through the same message rules and the same filing as the
catch-up. The agent is not run here: filing touches its thread, and the
`agents` tick runs it (SC3-23: no task queue, and Cloud Run gives a request
CPU only until it answers). The envelope is data, never instructions.
Nothing here logs message text, a channel name or a Slack user id."""

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from services.customers.models import SlackConversation

from . import naming, slack_channels, sync, unmatched
from .models import SlackChannel, UnmatchedItem
from .providers import get_provider
from .providers.base import ProviderError
from .providers.slack import EVENT_TIMEOUT, TEXT_CHARS, is_ours, is_top
from .slack_interactivity import _team_connectors

logger = logging.getLogger(__name__)

FILED = "filed"
UNCHANGED = "unchanged"
WAITING = "waiting"
MISSED = "missed"
IGNORED = "ignored"
EXCLUDED = "excluded"
EDITED = "edited"
DELETED = "deleted"
LISTED = "listed"
JOINED = "joined"


def _dict(value):
    return value if isinstance(value, dict) else {}


def handle(envelope, *, now=None):
    """One event_callback: an outcome per Slack connection of its team."""
    now = now or timezone.now()
    event = _dict(envelope.get("event"))
    kind = event.get("type")
    if kind not in ("message", "channel_created"):
        return []
    outcomes = []
    for connector in _team_connectors(str(envelope.get("team_id") or "")):
        if kind == "channel_created":
            outcomes.append(_channel_created(connector, event, now))
        else:
            outcomes.append(_message(connector, event, envelope, now))
    return outcomes


def _row(connector, event, envelope, now):
    """The included row the event belongs to, or None (SC3-22, SC3-24)."""
    channel = str(event.get("channel") or "")[:32]
    kind = event.get("channel_type")
    if not channel or kind not in ("channel", "group"):
        return None
    row = SlackChannel.objects.filter(connector=connector, channel_id=channel).first()
    if row is None:
        if kind != "channel":
            return None  # SC3-2: a private channel syncs only when the migration made its row
        shared = bool(envelope.get("is_ext_shared_channel"))
        row, _ = SlackChannel.objects.get_or_create(
            connector=connector,
            channel_id=channel,
            # SC3-12: Slack Connect starts excluded
            defaults={"is_member": True, "external_shared": shared, "included": not shared},
        )
    if not row.included or row.is_archived:
        return None
    # SC3-30: events arrive; Slack only sends them for channels the bot is in
    SlackChannel.objects.filter(pk=row.pk).update(event_at=now, is_member=True)
    row.event_at, row.is_member = now, True
    return row


def _thread_ts(event):
    inner = _dict(event.get("message")) or _dict(event.get("previous_message")) or event
    return str(inner.get("thread_ts") or inner.get("ts") or event.get("deleted_ts") or "")


def _message(connector, event, envelope, now):
    row = _row(connector, event, envelope, now)
    if row is None:
        return EXCLUDED
    subtype = event.get("subtype") or ""
    try:
        if subtype == "message_changed":
            return _edited(connector, row, event)
        if subtype == "message_deleted":
            return _deleted(connector, row, event)
        return _posted(connector, row, event, envelope, now)
    except Exception as exc:  # noqa: BLE001 - Slack gets its 200; the catch-up reads it (SC3-26)
        logger.warning("slack event not filed: %s", type(exc).__name__)
        slack_channels.remember_missed(row, _thread_ts(event))
        return MISSED


def _posted(connector, row, event, envelope, now):
    """SC3-24: a new top message, or a reply to a stored thread."""
    config = connector.config or {}
    app = str(envelope.get("api_app_id") or "")
    ts = str(event.get("ts") or "")
    thread = str(event.get("thread_ts") or "")
    provider = get_provider(connector.provider)
    creds = connector.get_credentials()
    if not thread or thread == ts:
        if not is_top(event) or is_ours(event, config, app):
            return IGNORED
        remote = provider.thread_of(creds, config, row.channel_id, event, timeout=EVENT_TIMEOUT)
        names = naming.covered_names(connector)
        try:
            with transaction.atomic():
                outcome, _ = sync.file_conversation(connector, remote, names, now=now, channel=row)
        except IntegrityError:
            return UNCHANGED  # SC3-7: a delivery of the same event filed it a moment ago
        return {"created": FILED, "updated": FILED, "unmatched": WAITING}.get(outcome, UNCHANGED)
    stored = SlackConversation.objects.filter(
        connector=connector, channel=row.channel_id, thread_ts=thread
    ).first()
    if stored is None:
        key = unmatched.slack_key(row.channel_id, thread)
        if UnmatchedItem.objects.filter(connector=connector, external_id=key).exists():
            return WAITING  # the catch-up re-reads its top message
        slack_channels.remember_missed(row, thread)
        return MISSED
    people = {
        m["user_id"]: {"name": m.get("name", ""), "email": ""}
        for m in stored.messages or []
        if m.get("user_id") and not m.get("bot")
    }
    reply = provider.reply_of(creds, config, event, people, timeout=EVENT_TIMEOUT, app_id=app)
    if reply is None:
        return IGNORED
    with transaction.atomic():
        # SC3-7: two replies of one thread arriving at once never overwrite each other
        locked = SlackConversation.objects.select_for_update().get(pk=stored.pk)
        outcome, _ = sync.file_conversation(
            connector, sync.stored_remote(locked, [reply]), [], now=now, channel=row
        )
    return FILED if outcome == "updated" else UNCHANGED


def _locked(connector, row, thread):
    return (
        SlackConversation.objects.select_for_update()
        .filter(connector=connector, channel=row.channel_id, thread_ts=thread)
        .first()
    )


def _edited(connector, row, event):
    """SC3-25: the new text, quietly."""
    message = _dict(event.get("message"))
    ts = str(message.get("ts") or "")
    text = str(message.get("text") or "")[:TEXT_CHARS]
    if not ts or not text:
        return IGNORED
    with transaction.atomic():
        stored = _locked(connector, row, str(message.get("thread_ts") or ts))
        if stored is None:
            return IGNORED
        return EDITED if sync.edit_message(stored, ts, text) else UNCHANGED


def _deleted(connector, row, event):
    """SC3-25: a reply goes, a top reads as deleted, a waiting top is forgotten."""
    ts = str(event.get("deleted_ts") or "")
    if not ts:
        return IGNORED
    thread = str(_dict(event.get("previous_message")).get("thread_ts") or ts)
    with transaction.atomic():
        stored = _locked(connector, row, thread)
        if stored is None:
            if thread == ts:
                unmatched.forget(connector, unmatched.slack_key(row.channel_id, ts))
            return DELETED
        return DELETED if sync.delete_message(stored, ts) else UNCHANGED


def _channel_created(connector, event, now):
    """SC3-5 (a): a new public channel becomes a row and is joined at once."""
    raw = _dict(event.get("channel"))
    channel = str(raw.get("id") or "")[:32]
    if not channel:
        return IGNORED
    row, made = SlackChannel.objects.get_or_create(
        connector=connector,
        channel_id=channel,
        defaults={"name": str(raw.get("name") or "")[:80], "event_at": now},
    )
    if not made:
        return UNCHANGED
    provider = get_provider(connector.provider)
    try:
        joined = slack_channels.join_missing(
            connector, provider, connector.get_credentials(), [row], timeout=EVENT_TIMEOUT
        )
    except ProviderError as exc:  # the next pass joins it
        logger.warning("slack join on create skipped: %s", type(exc).__name__)
        return LISTED
    return JOINED if joined else LISTED
```

- [ ] **Step 5: The view, its route and its throttle**

Create `services/connectors/slack_events_views.py`:

```python
"""POST /api/v1/connectors/slack/events/ (Slack escalations D3, contract
§3.3): Slack's Events API request URL. Public by necessity: who is calling
is proved by Slack's request signature alone, checked against the raw body
(#139's verifier) before anything in it is read. Every verified delivery
answers 200, so our own failures never turn Slack's subscription off; what
could not be filed waits for the catch-up (SC3-26)."""

import json
import logging

from django.http import HttpResponse, JsonResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from core.throttling import SlackEventsThrottle

from . import slack_events, slack_interactivity

logger = logging.getLogger(__name__)


class SlackEventsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    # SOC2:API-04 a public URL: per source IP
    throttle_classes = [SlackEventsThrottle]

    def post(self, request):
        body = request.body  # the raw bytes Slack signed; request.data is never read
        # SOC2:API-11 Slack's v0 signature and timestamp, constant-time; no secret: refused
        if not slack_interactivity.verified(
            body,
            request.headers.get("X-Slack-Request-Timestamp", ""),
            request.headers.get("X-Slack-Signature", ""),
        ):
            return HttpResponse(status=401)
        try:
            envelope = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return HttpResponse(status=400)
        if not isinstance(envelope, dict):
            return HttpResponse(status=400)
        if envelope.get("type") == "url_verification":
            return JsonResponse({"challenge": str(envelope.get("challenge") or "")[:200]})
        if envelope.get("type") == "app_rate_limited":
            logger.warning("slack events rate limited for a minute")
            return HttpResponse(status=200)
        if envelope.get("type") != "event_callback":
            return HttpResponse(status=200)
        retry = request.headers.get("X-Slack-Retry-Num", "")
        if retry:
            # SC3-7: a retry is filed like a first delivery (idempotent); numbers and Slack's word only
            reason = request.headers.get("X-Slack-Retry-Reason", "")[:32]
            logger.info("slack event retry %s: %s", retry[:2], reason)
        try:
            slack_events.handle(envelope)
        except Exception as exc:  # noqa: BLE001 - Slack gets its 200; the type is logged
            logger.warning("slack event failed: %s", type(exc).__name__)
        return HttpResponse(status=200)
```

In `services/connectors/urls.py`: import `slack_events_views` and, after the interactivity route:

```python
(
    path(
        "slack/events/",
        slack_events_views.SlackEventsView.as_view(),
        name="slack-events",
    ),
)
```

In `core/throttling.py`, after `SlackInteractivityThrottle`:

```python
class SlackEventsThrottle(_PerIPThrottle):
    """Slack's Events API deliveries (services/connectors/slack_events_views.py),
    per source IP: Slack sends every workspace's events from few addresses, so
    the rate is high (up to 30,000 an hour per workspace); a forged flood
    still stops here, after a constant-time signature check."""

    scope = "slack_events"
```

In `config/settings.py`, after the `slack_interactivity` rate:

```python
# Per source IP on Slack's public Events API URL (Slack escalations D3, SC3-29).
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["slack_events"] = (
    None if TESTING else env("THROTTLE_SLACK_EVENTS", default="1200/min")
)
```

- [ ] **Step 6: Run, measure and pin**

Run: `$PY manage.py test services.connectors.tests.test_slack_events --parallel auto --noinput`
Expected: every case PASS but the query pin (`None != N`). Check each captured query is one of: the team's connections, the channel row, its `event_at` update, the stored conversation, the agent thread lookup and touch, the lock, the read inside `file_conversation`, the save, the unmatched `forget`. Pin `SLACK_EVENT_REPLY_QUERIES = N` (about 10) and record it in the contract's "Changes during the build".

Run: `$PY manage.py test services.connectors services.agents.tests.test_slack_conversation_intake --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/connectors/slack_events.py services/connectors/slack_events_views.py services/connectors/urls.py core/throttling.py config/settings.py services/connectors/tests/slack_events_fixtures.py services/connectors/tests/test_slack_events.py
git commit -m "feat(connectors): slack's events api files each message before it answers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The channel list and the channel PATCH; the connection's channel counts and events

**Files:**
- Create: `services/connectors/slack_channel_views.py`, `services/connectors/tests/test_slack_channel_views.py`
- Modify: `services/connectors/urls.py`, `services/connectors/views.py` (`with_ingested`), `services/connectors/serializers.py` (`slack_channels`)

**Interfaces:**
- Produces: `GET /connectors/<id>/slack-channels/`, `PATCH /connectors/<id>/slack-channels/<channel id>/` (contract §3.1, §3.2); `slack_channel_views.channel_payload(row, conversations)`; Connector `slack_channels` (contract §2.1, with `events_at`); audit `slack_channel.update`.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_slack_channel_views.py`:

```python
"""Slack escalations D3 contract §2.1, §3, §5, SC3-9, SC3-15 to SC3-17,
SC3-30: an admin reads a Slack connection's channels and includes, excludes
or sets one to a customer; every refusal in order; one audited change; the
connection says how many it syncs and when the last event arrived."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import SlackChannel
from services.customers.tests.slack_fixtures import conversation

LIST = "/api/v1/connectors/{}/slack-channels/"
ONE = "/api/v1/connectors/{}/slack-channels/{}/"
#: Contract §6: measured in Step 5 and written into "Changes during the build".
SLACK_CHANNELS_QUERIES = None


class ChannelViewTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        self.support.granted_scopes = [*self.support.granted_scopes, "channels:join"]
        self.support.save(update_fields=["granted_scopes"])
        self.all = SlackChannel.objects.create(
            connector=self.support, channel_id="C0SUPPORT", name="support", is_member=True
        )
        self.random = SlackChannel.objects.create(
            connector=self.support, channel_id="C0RANDOM", name="random"
        )
        SlackChannel.objects.create(
            connector=self.support, channel_id="C0GONE", name="gone", is_archived=True
        )
        conversation(self.pizza, self.support, channel="C0SUPPORT")

    def admin_client(self):
        return self.client_for(self.admin)

    def test_the_list(self):
        body = self.admin_client().get(LIST.format(self.support.pk)).json()
        self.assertEqual(
            (body["can_join"], body["synced"], body["total"], body["events_at"]),
            (True, 2, 2, None),
        )
        self.assertEqual(
            body["channels"][0],
            {
                "id": "C0RANDOM",
                "name": "random",
                "included": True,
                "member": False,
                "shared": False,
                "private": False,
                "record": None,
                "conversations": 0,
                "join_error": "",
                "read_at": None,
                "chosen_by": None,
            },
        )
        self.assertEqual(body["channels"][1]["conversations"], 1)

    def test_refusals(self):
        self.assertEqual(
            self.client_for(self.csm).get(LIST.format(self.support.pk)).status_code, 403
        )
        board = self.jira_connector()
        answer = self.admin_client().get(LIST.format(board.pk))
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "NOT_SLACK"))
        client = self.admin_client()
        cases = [
            (
                ONE.format(self.support.pk, "C0GONE"),
                {"included": False},
                404,
                {"code": "NO_SUCH_CHANNEL", "detail": "No such channel."},
            ),
            (
                ONE.format(self.support.pk, "C0RANDOM"),
                {},
                400,
                {"detail": "Change whether it syncs, or its customer."},
            ),
            (
                ONE.format(self.support.pk, "C0RANDOM"),
                {"included": "no"},
                400,
                {"included": ["Choose on or off."]},
            ),
            (
                ONE.format(self.support.pk, "C0RANDOM"),
                {"record": {"type": "deal", "id": 1}},
                400,
                {"record": ["Choose an organisation or an account."]},
            ),
            (
                ONE.format(self.support.pk, "C0RANDOM"),
                {"record": {"type": "customer", "id": 999999}},
                400,
                {"record": ["No such organisation."]},
            ),
        ]
        for url, body, status, expected in cases:
            with self.subTest(body=body):
                answer = client.patch(url, body, format="json")
                self.assertEqual((answer.status_code, answer.json()), (status, expected))

    def test_a_record_the_connection_does_not_cover(self):
        self.support.customers.set([self.taco])
        answer = self.admin_client().patch(
            ONE.format(self.support.pk, "C0RANDOM"),
            {"record": {"type": "customer", "id": self.pizza.pk}},
            format="json",
        )
        self.assertEqual(
            answer.json(),
            {"record": [f"{self.pizza.name} isn't covered by this Slack connection."]},
        )

    def test_exclude_and_set_a_customer_audited_once_each(self):
        self.random.join_error = "removed"
        self.random.save(update_fields=["join_error"])
        client = self.admin_client()
        answer = client.patch(
            ONE.format(self.support.pk, "C0RANDOM"),
            {"included": False, "record": {"type": "customer", "id": self.pizza.pk}},
            format="json",
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(
            (answer.json()["included"], answer.json()["record"], answer.json()["join_error"]),
            (False, {"type": "customer", "id": self.pizza.pk, "name": self.pizza.name}, ""),
        )
        self.random.refresh_from_db()
        self.assertEqual(
            (self.random.chosen_by_id, self.random.customer_id), (self.admin.pk, self.pizza.pk)
        )
        event = AuditEvent.objects.get(action="slack_channel.update")
        self.assertEqual(
            event.metadata,
            {
                "channel": self.random.pk,
                "changes": {
                    "included": {"old": True, "new": False},
                    "record": {"old": None, "new": f"customer:{self.pizza.pk}"},
                },
            },
        )
        client.patch(ONE.format(self.support.pk, "C0RANDOM"), {"included": False}, format="json")
        self.assertEqual(AuditEvent.objects.filter(action="slack_channel.update").count(), 1)

    def test_the_connection_counts_its_channels_and_its_last_event(self):
        body = self.admin_client().get(f"/api/v1/connectors/{self.support.pk}/").json()
        self.assertEqual(
            body["slack_channels"],
            {"synced": 2, "total": 2, "can_join": True, "events_at": None},
        )
        at = timezone.now()
        SlackChannel.objects.filter(pk=self.random.pk).update(event_at=at)
        body = self.admin_client().get(f"/api/v1/connectors/{self.support.pk}/").json()
        self.assertTrue(body["slack_channels"]["events_at"].startswith(at.strftime("%Y-%m-%dT")))
        listed = self.admin_client().get(LIST.format(self.support.pk)).json()
        self.assertEqual(listed["events_at"], body["slack_channels"]["events_at"])
        board = self.jira_connector()
        self.assertIsNone(
            self.admin_client().get(f"/api/v1/connectors/{board.pk}/").json()["slack_channels"]
        )

    def test_the_list_costs_the_same_for_three_or_eight_channels(self):
        def count():
            with CaptureQueriesContext(connection) as queries:
                self.admin_client().get(LIST.format(self.support.pk))
            return len(queries)

        few = count()
        for n in range(5):
            SlackChannel.objects.create(connector=self.support, channel_id=f"C0M{n}", name=f"m-{n}")
        self.assertEqual(count(), few)
        self.assertEqual(few, SLACK_CHANNELS_QUERIES)
```

(`self.taco` is Dana's Taco Bell; use the fixture's name for it if different.)

- [ ] **Step 2: Run them to verify they fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_channel_views --parallel auto --noinput`
Expected: FAIL (404 for the routes; no `slack_channels` key).

- [ ] **Step 3: The routes**

Create `services/connectors/slack_channel_views.py`:

```python
"""A Slack connection's channels in Settings › Connections (Slack
escalations D3, contract §3, SC3-15): the list, and including, excluding or
setting one channel to a customer or account. An integrations manager only,
as every connection setting."""

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from services.accounts.permissions import CanManageIntegrations
from services.customers.models import Account, Customer, SlackConversation
from services.customers.task_changes import person

from . import slack_channels
from .models import Connector, SlackChannel
from .views import _own_connector

NOT_SLACK = "Only a Slack connection has channels."
NO_SUCH_CHANNEL = "No such channel."
NOTHING = "Change whether it syncs, or its customer."
ON_OR_OFF = "Choose on or off."
CHOOSE_RECORD = "Choose an organisation or an account."
_stamp = serializers.DateTimeField().to_representation


def _record_ref(row):
    record = row.record
    if record is None:
        return None
    kind = "account" if row.account_id else "customer"
    return {"type": kind, "id": record.pk, "name": record.name}


def channel_payload(row, conversations):
    """Contract §2.2."""
    return {
        "id": row.channel_id,
        "name": row.name,
        "included": row.included,
        "member": row.is_member,
        "shared": row.external_shared,
        "private": row.is_private,
        "record": _record_ref(row),
        "conversations": conversations,
        "join_error": row.join_error,
        "read_at": _stamp(row.read_at) if row.read_at else None,
        "chosen_by": person(row.chosen_by),
    }


def _slack(request, pk):
    connector = _own_connector(request, pk)
    if connector.provider != Connector.Provider.SLACK:
        return connector, Response(
            {"code": "NOT_SLACK", "detail": NOT_SLACK}, status=status.HTTP_409_CONFLICT
        )
    return connector, None


def _counts(connector):
    return dict(
        SlackConversation.objects.filter(connector=connector)
        .values("channel")
        .annotate(n=Count("id"))
        .values_list("channel", "n")
    )


class SlackChannelListView(APIView):
    """GET /api/v1/connectors/<id>/slack-channels/ (contract §3.1)."""

    # SOC2:AUTH-02 a connection's settings are an integrations manager's
    permission_classes = [CanManageIntegrations]

    def get(self, request, pk):
        connector, refused = _slack(request, pk)
        if refused is not None:
            return refused
        rows = list(
            SlackChannel.objects.filter(connector=connector, is_archived=False)
            .select_related("customer", "account", "chosen_by")
            .order_by("name", "channel_id")
        )
        counts = _counts(connector)
        events_at = max((row.event_at for row in rows if row.event_at), default=None)
        return Response(
            {
                "channels": [channel_payload(row, counts.get(row.channel_id, 0)) for row in rows],
                "can_join": slack_channels.can_join(connector),
                "synced": sum(1 for row in rows if row.included),
                "total": len(rows),
                "events_at": _stamp(events_at) if events_at else None,
            }
        )


class _Refused(Exception):
    def __init__(self, body):
        super().__init__(body)
        self.body = body


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _record(connector, data):
    """(customer, account) for the PATCH's `record`, or _Refused (contract §3.2)."""
    if data is None:
        return None, None
    if not isinstance(data, dict) or data.get("type") not in ("customer", "account"):
        raise _Refused({"record": [CHOOSE_RECORD]})
    if not _whole(data.get("id")):
        raise _Refused({"record": [CHOOSE_RECORD]})
    org = connector.organisation_id
    if data["type"] == "customer":
        # SOC2:AUTH-02 only a record of this workspace
        found = Customer.objects.filter(pk=data["id"], organisation_id=org).first()
        if found is None:
            raise _Refused({"record": ["No such organisation."]})
        customer, account = found, None
    else:
        inside = Account.customers.through.objects.filter(customer__organisation_id=org).values(
            "account_id"
        )
        found = Account.objects.filter(pk=data["id"], id__in=inside).first()
        if found is None:
            raise _Refused({"record": ["No such account."]})
        customer, account = None, found
    # SOC2:AUTH-02 SC3-9: only a record the connection covers
    if not connector.covers(customer=customer, account=account):
        raise _Refused({"record": [f"{found.name} isn't covered by this Slack connection."]})
    return customer, account


def _ref(customer_id, account_id):
    if account_id:
        return f"account:{account_id}"
    return f"customer:{customer_id}" if customer_id else None


class SlackChannelDetailView(APIView):
    """PATCH /api/v1/connectors/<id>/slack-channels/<channel id>/ (contract §3.2)."""

    # SOC2:AUTH-02 a connection's settings are an integrations manager's
    permission_classes = [CanManageIntegrations]

    def patch(self, request, pk, channel_id):
        connector, refused = _slack(request, pk)
        if refused is not None:
            return refused
        row = (
            SlackChannel.objects.filter(
                connector=connector, channel_id=channel_id, is_archived=False
            )
            .select_related("customer", "account", "chosen_by")
            .first()
        )
        if row is None:
            return Response(
                {"code": "NO_SUCH_CHANNEL", "detail": NO_SUCH_CHANNEL},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = request.data if isinstance(request.data, dict) else {}
        try:
            if "included" not in data and "record" not in data:
                raise _Refused({"detail": NOTHING})
            if "included" in data and not isinstance(data["included"], bool):
                raise _Refused({"included": [ON_OR_OFF]})
            record = _record(connector, data["record"]) if "record" in data else None
        except _Refused as exc:
            return Response(exc.body, status=status.HTTP_400_BAD_REQUEST)
        changes = {}
        if "included" in data and data["included"] != row.included:
            changes["included"] = {"old": row.included, "new": data["included"]}
            row.included = data["included"]
        if record is not None:
            customer, account = record
            old = _ref(row.customer_id, row.account_id)
            new = _ref(customer.pk if customer else None, account.pk if account else None)
            if old != new:
                changes["record"] = {"old": old, "new": new}
                row.customer, row.account = customer, account
        if changes:
            with transaction.atomic():  # the change and its audit row land together
                row.chosen_by, row.chosen_at = request.user, timezone.now()
                row.join_error = row.read_error = ""
                row.save()
                audit.record(  # SOC2:LOG-01 ids and codes only, never a channel name
                    "slack_channel.update",
                    request=request,
                    organisation=connector.organisation,
                    target=connector,
                    metadata={"channel": row.pk, "changes": changes},
                )
        return Response(channel_payload(row, _counts(connector).get(row.channel_id, 0)))
```

In `services/connectors/urls.py` (import `slack_channel_views`), beside the other `<int:pk>/...` routes:

```python
(
    path(
        "<int:pk>/slack-channels/",
        slack_channel_views.SlackChannelListView.as_view(),
        name="connector-slack-channels",
    ),
)
(
    path(
        "<int:pk>/slack-channels/<str:channel_id>/",
        slack_channel_views.SlackChannelDetailView.as_view(),
        name="connector-slack-channel",
    ),
)
```

- [ ] **Step 4: The connection's counts and its last event**

In `services/connectors/views.py` `with_ingested` (imports `OuterRef, Subquery, IntegerField, DateTimeField` from `django.db.models`, `Coalesce` from `django.db.models.functions`, `SlackChannel` from `.models`), add three annotations to the queryset it returns, beside the existing ones:

```python
live = (
    SlackChannel.objects.filter(connector=OuterRef("pk"), is_archived=False)
    .order_by()
    .values("connector")
)


def count(rows):
    return Coalesce(
        Subquery(rows.annotate(n=Count("id")).values("n")[:1], output_field=IntegerField()),
        0,
    )


last_event = (
    SlackChannel.objects.filter(connector=OuterRef("pk"), event_at__isnull=False)
    .order_by("-event_at")
    .values("event_at")[:1]
)
# Slack escalations D3 (SC3-17, SC3-30): subqueries, so no join multiplies the counts
queryset = queryset.annotate(
    channels_total=count(live),
    channels_synced=count(live.filter(included=True)),
    channels_events_at=Subquery(last_event, output_field=DateTimeField()),
)
```

(placed before the function's final `return`, on the queryset it returns.)

In `services/connectors/serializers.py`: `slack_channels = serializers.SerializerMethodField()` (add `"slack_channels"` to `fields` and `read_only_fields`) and:

```python
    def get_slack_channels(self, obj):
        """Slack escalations D3 contract §2.1: how many channels it syncs, and
        when Slack's last event arrived."""
        from .slack_channels import can_join

        if obj.provider != Connector.Provider.SLACK:
            return None
        at = getattr(obj, "channels_events_at", None)
        return {
            "synced": getattr(obj, "channels_synced", 0) or 0,
            "total": getattr(obj, "channels_total", 0) or 0,
            "can_join": can_join(obj),
            "events_at": serializers.DateTimeField().to_representation(at) if at else None,
        }
```

- [ ] **Step 5: Measure, pin and run with the neighbours**

Run: `$PY manage.py test services.connectors.tests.test_slack_channel_views --parallel auto --noinput`; read the count from the failure (`None != N`), check each query is one of: the user's own load, the capability read, the connection, the rows with their records and `chosen_by`, the conversation counts; pin `SLACK_CHANNELS_QUERIES = N` (about 4) and record it.

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: PASS; the connector list and detail pins don't move (the annotations are subqueries of the page's one query). A test that compares a whole connector payload gains `"slack_channels"` (null for non-Slack).

- [ ] **Step 6: Commit**

```bash
git add services/connectors/slack_channel_views.py services/connectors/urls.py services/connectors/views.py services/connectors/serializers.py services/connectors/tests/test_slack_channel_views.py
git commit -m "feat(connectors): an admin's slack channel list: sync on or off, each channel's customer, the last event

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Moving a reply to another channel, with many channels per connection

**Files:**
- Modify: `services/agents/outside/slack_channels.py` (`synced_ids`, `synced_rows`), `services/agents/actions/slack_replies.py` (`validate`, `_in_thread`, `_label`, `_synced` renamed `_home_payload`, `_choose`), `services/agents/outside/gates.py` (`blocked`'s sentence)
- Create: `services/agents/tests/test_reply_channels_many.py`

**Interfaces:**
- Produces: a `slack.reply` payload gains `source_channel` and `source_channel_name` (set at validate); option ids `"<connection>"` (this thread) and `"<connection>:<channel>"` (any other channel, synced or not) (SC3-18).
- Consumes: `SlackChannel` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_reply_channels_many.py`:

```python
"""Slack escalations D3, SC3-18: a reply's channel list offers its own thread
and every included channel of the Slack connections the reader may post
through; choosing one posts a new message there; choosing the thread again
posts in the thread. Slack is a fake."""

from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import SlackChannel

OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/slack-channels/"
STEP = "/api/v1/agents/bundles/{}/steps/{}/"


class ManyChannelsTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        for channel, name in (("C0SUPPORT", "support"), ("C0ESCALATE", "escalations")):
            SlackChannel.objects.create(
                connector=self.support, channel_id=channel, name=name, is_member=True
            )
        SlackChannel.objects.create(
            connector=self.support, channel_id="C0OFF", name="off", is_member=True, included=False
        )
        self.conversation, self.thread = self.slack_thread(self.pizza, self.support)
        payload = {
            **self.slack_payload(self.conversation, self.support),
            "source_channel": "C0SUPPORT",
            "source_channel_name": "support",
        }
        self.bundle = self.outside_bundle(self.thread, ("slack.reply", payload))
        self.step = self.bundle.steps.get()

    def options(self):
        answer = self.client_for(self.csm).get(OPTIONS.format(self.bundle.pk, self.step.pk))
        self.assertEqual(answer.status_code, 200, answer.content)
        return [(o["id"], o["name"], o["detail"]) for o in answer.json()["options"]]

    def test_the_thread_then_every_included_channel(self):
        options = self.options()
        self.assertEqual(options[0], (str(self.support.pk), "#support", "This thread"))
        self.assertIn((f"{self.support.pk}:C0ESCALATE", "#escalations", "A new message"), options)
        self.assertNotIn(f"{self.support.pk}:C0SUPPORT", [o[0] for o in options])

    def test_choosing_another_channel_posts_a_new_message_there(self):
        answer = self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"channel_choice": f"{self.support.pk}:C0ESCALATE"}},
            format="json",
        )
        self.assertEqual(answer.status_code, 200, answer.content)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.payload["channel"], self.step.payload["unsynced"]), ("C0ESCALATE", False)
        )
        self.run_all_steps(self.csm, self.bundle)
        [post] = self.slack.posts
        self.assertEqual((post["channel"], post.get("thread_ts")), ("C0ESCALATE", None))

    def test_choosing_the_thread_again_posts_in_the_thread(self):
        client = self.client_for(self.csm)
        url = STEP.format(self.bundle.pk, self.step.pk)
        client.patch(
            url, {"fields": {"channel_choice": f"{self.support.pk}:C0ESCALATE"}}, format="json"
        )
        client.patch(url, {"fields": {"channel_choice": str(self.support.pk)}}, format="json")
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.payload["channel"], self.step.payload["channel_name"]),
            ("C0SUPPORT", "support"),
        )
        self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(self.slack.posts[0]["thread_ts"], self.conversation.thread_ts)

    def test_an_excluded_channel_is_offered_as_not_synced_only(self):
        self.assertNotIn((f"{self.support.pk}:C0OFF", "#off", "A new message"), self.options())
```

(The options route and the `FakeSlack.posts` shape are round 2 D2's; read `services/agents/tests/test_slack_channel_choice.py` for both and match them. `self.slack` here is `OutsideFixture`'s `FakeSlack`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `$PY manage.py test services.agents.tests.test_reply_channels_many --parallel auto --noinput`
Expected: FAIL (one synced row per connection; `#escalations` is not offered).

- [ ] **Step 3: Implement**

`services/agents/outside/slack_channels.py`:

```python
def synced_ids(organisation_id):
    """Every channel a Slack connection of the workspace includes (Slack
    escalations D3, SC3-18): those are offered as synced, never as live."""
    from services.connectors.models import SlackChannel

    slack = Connector.objects.filter(
        organisation_id=organisation_id, provider=Connector.Provider.SLACK
    ).values("id")
    return set(
        SlackChannel.objects.filter(
            connector_id__in=slack, included=True, is_archived=False
        ).values_list("channel_id", flat=True)
    )


def _home(payload):
    """The thread's own channel (and name): set at validate since D3."""
    return payload.get("source_channel") or "", payload.get("source_channel_name") or ""


def synced_rows(step, usable):
    """This thread, then every included channel the bot is in of the Slack
    connections `usable` (SC3-18): one query."""
    from services.connectors.models import SlackChannel

    payload = step.payload or {}
    source = payload.get("source_connector_id")
    home, home_name = _home(payload)
    by_pk = {c.pk: c for c in usable}
    rows = []
    if source in by_pk:
        name = f"#{home_name}" if home_name else gates.channel_name(by_pk[source])
        rows.append({"id": str(source), "name": name, "detail": "This thread"})
    channels = SlackChannel.objects.filter(
        connector_id__in=list(by_pk), included=True, is_member=True, is_archived=False
    ).order_by("name", "channel_id")
    for ch in channels:
        if ch.connector_id == source and ch.channel_id == home:
            continue
        rows.append(
            {
                "id": f"{ch.connector_id}:{ch.channel_id}",
                "name": f"#{ch.name}",
                "detail": "A new message",
            }
        )
    return rows
```

`services/agents/actions/slack_replies.py`:

- `validate` adds `"source_channel": slack["channel"], "source_channel_name": slack["channel_name"],` to the returned payload.
- `_in_thread`:

```python
def _in_thread(payload):
    # R2D2-18: an unsynced channel is always a new top-level message; D3 (SC3-18):
    # so is another channel of the same connection.
    home = payload.get("source_channel") or payload.get("channel")
    return (
        payload.get("connector_id") == payload.get("source_connector_id")
        and not payload.get("unsynced")
        and payload.get("channel") == home
    )
```

- `_label`: `name = payload.get("channel_name") if channel == payload.get("channel") else ""` then `return f"#{name}" if name else gates.channel_name(connector)` (a refusal names the channel the step holds).
- `_synced(chosen)` becomes `_home_payload(action, chosen)` (and its callers pass `action`):

```python
def _home_payload(action, chosen):
    """Back to the thread's own channel (SC3-18)."""
    payload = action.payload or {}
    home = payload.get("source_channel") or payload.get("channel", "")
    name = payload.get("source_channel_name") or payload.get("channel_name", "")
    return {
        "connector_id": chosen.pk,
        "channel": home,
        "channel_name": name,
        "channel_choice": str(chosen.pk),
        "unsynced": False,
        "channel_private": False,
    }
```

- `_choose`, after it finds `chosen` (the lines before stay):

```python
    chosen = next((c for c in channels(action, runner) if c.pk == pk), None)
    if chosen is None:
        raise refuse(NOT_A_CHANNEL)
    source = (action.payload or {}).get("source_connector_id")
    if not channel:
        # "<connection>" alone is the thread's own row (SC3-18)
        if pk != source:
            raise refuse(FROM_LIST)
        return _home_payload(action, chosen)
    from services.connectors.models import SlackChannel

    synced = SlackChannel.objects.filter(
        connector=chosen, channel_id=channel, included=True, is_member=True, is_archived=False
    ).first()
    if synced is not None:
        if pk == source and channel == (action.payload or {}).get("source_channel"):
            return _home_payload(action, chosen)
        return {
            "connector_id": chosen.pk,
            "channel": channel,
            "channel_name": synced.name,
            "channel_choice": f"{chosen.pk}:{channel}",
            "unsynced": False,
            "channel_private": synced.is_private,
        }
```

followed by the function's existing live path (the `member_channels` lookup, the `synced_ids` check and the private rule), unchanged.

`services/agents/outside/gates.py` `blocked`, the Slack read check (move the `payload = ...` line above it):

```python
    if slack and not may_read(reader, connector):
        name = payload_name(step)
        return Blocked(f"You can't post in {name or channel_name(connector)}.")
```

with, beside `channel_name`:

```python
def payload_name(step):
    """The channel a Slack step holds, as people read it (SC3-18)."""
    name = (step.payload or {}).get("channel_name")
    return f"#{name}" if name else ""
```

- [ ] **Step 4: Run the tests, with the neighbours**

Run: `$PY manage.py test services.agents.tests.test_reply_channels_many services.agents.tests.test_slack_channel_choice services.agents.tests.test_slack_reply_kind services.agents.tests.test_outside_queries services.agents.tests.test_outside_gates --parallel auto --noinput`
Expected: PASS. A round 2 D2 test whose connector has no `SlackChannel` rows (made before D3) now offers only "This thread" among synced rows: add the connector's channel row in that test's set-up (`SlackChannel.objects.create(connector=..., channel_id=<its config channel>, name=<its name>, is_member=True)`), as the migration does for real connections. `OUTSIDE_DETAIL_QUERIES` and `OUTSIDE_HISTORY_QUERIES` don't move; if a pin on the options route exists, it rises by the one `SlackChannel` read: pin it and record it.

- [ ] **Step 5: Commit**

```bash
git add services/agents/outside/slack_channels.py services/agents/actions/slack_replies.py services/agents/outside/gates.py services/agents/tests/test_reply_channels_many.py
git commit -m "feat(agents): a slack reply can move to any included channel of the connection

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add every test file Step 4 changed to the `git add`.)

---

### Task 9: The journey end to end, the documents, the full check

**Files:**
- Create: `e2e/test_slack_channels_flow.py`
- Modify: `e2e/agent_round2_world.py` (`connect_slack_and_jira` sends no channel), `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `.soc2/CONTROL_MAP.md`, `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, `.agents/workflows/agent-intake-flow.md` (the Slack intake section), `docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md` ("Changes during the build")

- [ ] **Step 1: The journey**

Create `e2e/test_slack_channels_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB; Slack is the fake
(its API in memory) and its events are signed with a per-run secret.
Nothing leaves the process.

Journey (Slack escalations D3, LC-D3a to LC-D3d): Alice connects Slack with a
token that can't join channels yet: the pass lists every public channel;
an event from #support naming Pizza Hut is filed at once and Settings says
events arrive. She approves the app again (channels:join): Slack announces
#globex-escalations and it is joined at once; an event there naming Globex
is filed under Globex. She excludes #random and sets #globex-escalations to
Globex: an event naming no one there is filed under Globex; #random stores
nothing. A message whose event never came is filed by the catch-up."""

import json
import urllib.request
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone

from e2e.agent_round2_world import Round2World
from e2e.http import http_get, http_patch, http_post
from services.connectors.models import SlackChannel
from services.connectors.tests.slack_events_fixtures import (
    SIGNING,
    URL,
    envelope,
    headers_for,
    message,
)
from services.customers.models import Customer, SlackConversation


@override_settings(SLACK_SIGNING_SECRET=SIGNING)
class SlackChannelsFlowTests(Round2World, LiveServerTestCase):
    def setUp(self):
        self.use_world_fakes()

    def push(self, event):
        """Slack's delivery: the signed body over real HTTP, no token."""
        body = json.dumps(envelope(event)).encode()
        request = urllib.request.Request(
            self.live_server_url + URL,
            data=body,
            headers={"Content-Type": "application/json", **headers_for(body)},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as answer:  # noqa: S310 - the test server
            self.assertEqual(answer.status, 200)

    def sync(self):
        SlackChannel.objects.update(asked_at=timezone.now() - timedelta(minutes=2))
        call_command("sync_tickets", stdout=StringIO(), stderr=StringIO())

    def channels(self, alice, connector_id):
        status, body = http_get(self.api(f"/connectors/{connector_id}/slack-channels/"), alice)
        self.assertEqual(status, 200, body)
        return body, {c["name"]: c for c in body["channels"]}

    def test_the_whole_journey(self):
        alice, carl, pizza = self.workspace()
        globex = Customer.objects.create(organisation=carl.organisation, name="Globex (QA)")
        for channel, name in (("C0RANDOM", "random"), ("C0GLOBEX", "globex-escalations")):
            self.slack.channels[channel] = []
            self.slack.names[channel] = name
        self.slack.scopes.remove("channels:join")
        slack, _jira, _ = self.connect_slack_and_jira(alice)

        # 1. Listed, not joined; an event is filed at once (LC-D3a, LC-D3b).
        self.sync()
        body, rows = self.channels(alice, slack["id"])
        self.assertFalse(body["can_join"])
        self.assertIsNone(body["events_at"])
        self.assertEqual(sorted(rows), ["escalations", "globex-escalations", "random", "support"])
        self.push(message("C0SUPPORT", "1792041400.000100", "Pizza Hut exports fail"))
        self.assertEqual(SlackConversation.objects.get().customer, pizza)
        body, _ = self.channels(alice, slack["id"])
        self.assertIsNotNone(body["events_at"])

        # 2. Approved again: a new channel is joined at once (LC-D3c).
        self.slack.scopes.append("channels:join")
        status, answer = http_post(
            self.api(f"/connectors/{slack['id']}/connect/"),
            {"bot_token": "xoxb-e2e-2"},
            token=alice,
        )
        self.assertEqual(status, 201, answer)
        self.push(
            {"type": "channel_created", "channel": {"id": "C0GLOBEX", "name": "globex-escalations"}}
        )
        self.sync()  # the listing knows it already; joining the rest happens here
        body, rows = self.channels(alice, slack["id"])
        self.assertTrue(body["can_join"])
        self.assertTrue(rows["globex-escalations"]["member"])
        self.push(message("C0GLOBEX", "1792041500.000100", "Globex (QA) invoices look off"))
        self.assertEqual(SlackConversation.objects.get(channel="C0GLOBEX").customer, globex)

        # 3. Exclude #random; set #globex-escalations to Globex (LC-D3d).
        for channel, change in (
            ("C0RANDOM", {"included": False}),
            ("C0GLOBEX", {"record": {"type": "customer", "id": globex.pk}}),
        ):
            status, row = http_patch(
                self.api(f"/connectors/{slack['id']}/slack-channels/{channel}/"),
                change,
                token=alice,
            )
            self.assertEqual(status, 200, row)
        self.push(message("C0GLOBEX", "1792041600.000100", "Can someone look at the exports?"))
        self.push(message("C0RANDOM", "1792041700.000100", "Pizza Hut lunch is here"))
        made = SlackConversation.objects.get(channel="C0GLOBEX", thread_ts="1792041600.000100")
        self.assertEqual((made.customer, made.matched_by), (globex, "channel"))
        self.assertFalse(SlackConversation.objects.filter(channel="C0RANDOM").exists())

        # 4. A message whose event never came: the catch-up files it.
        missed = self.slack.say("C0ESCALATE", "U0FAIZ", "Pizza Hut SSO is down")
        for _ in range(4):
            self.sync()
        self.assertTrue(
            SlackConversation.objects.filter(channel="C0ESCALATE", thread_ts=missed).exists()
        )
```

In `e2e/agent_round2_world.py`, `connect_slack_and_jira` stops sending `"channel"` (its connect body is `{"bot_token": "xoxb-e2e"}`). If an existing e2e journey relied on the one-pass read of `C0SUPPORT`, make it call `sync_tickets` as this file's `sync` does (reset `asked_at`, one channel a pass) until its thread is filed, with a comment "D3: one channel a pass".

Run: `$PY manage.py test e2e.test_slack_channels_flow e2e --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 2: The documents**

- `docs/API_CONTRACTS.md`: a section "Slack escalations, delivery 3: every public channel syncs, pushed by Slack (2026-10-17)" after the D2 one, with the contract's §1 to §6 (the channel table, the connection's `slack_channels`, the two routes with every refusal, **the Events endpoint** with its refusals and `url_verification`, the catch-up rules SC3-6 and the event rules SC3-24 to SC3-28, the ceilings as measured); in the D1 section, mark "one channel per connection", the connect channel check and the 7-day multi-page read as replaced.
- `docs/audit-events.md`: `slack_channel.update` (§5).
- `docs/data-classification.md`: `SlackChannel` (channel ids and names: Internal; no message text; `missed` holds message timestamps only), the Slack keys with their channel; the Events endpoint receives Confidential message text and stores it only as a conversation (as the poll did).
- `.soc2/CONTROL_MAP.md`: AUTH-02 rows for the channel routes (`CanManageIntegrations`), a channel's record (same workspace, covered: SC3-9), `_pinned` at filing; API-11 for the Events endpoint's signature (`slack_interactivity.verified`); API-04 for `SlackEventsThrottle`; LOG-01 for `slack_channel.update`.
- `docs/product/01-prd.md` (every public channel syncs, messages arrive as they are posted, admins exclude and set customers, Slack Connect excluded by default), `02-trd.md` (`slack_channels.py`, `slack_catchup.py`, `slack_events.py`, the 2025 limits and why polling is only a catch-up, `THROTTLE_SLACK_EVENTS`, the owner's Slack app set-up from contract §8), `05-backend-schema.md` (`SlackChannel`, the conversation's key), `06-implementation-plan.md` (D3 done).
- `.agents/workflows/agent-intake-flow.md` (`flow-docs` skill): how a Slack message reaches the agent: the event, filing, the thread touch, the `agents` tick; the catch-up as the fallback.
- The contract's "Changes during the build": every change, with `SLACK_CHANNELS_QUERIES`, `SLACK_EVENT_REPLY_QUERIES` and any other pin as measured, each with "Frontend impact".

- [ ] **Step 3: The full check**

```bash
$PY manage.py makemigrations --check --dry-run
$PY manage.py spectacular --file /tmp/claude-d3-schema.yml --validate
$PY manage.py test --parallel auto --noinput
venv/bin/ruff check . && venv/bin/ruff format --check .
grep -rn "—" services/connectors/slack_channels.py services/connectors/slack_catchup.py services/connectors/slack_events.py services/connectors/slack_events_views.py services/connectors/slack_channel_views.py services/connectors/migrations/0010_slack_channels_from_config.py e2e/test_slack_channels_flow.py || echo "no em dash"
grep -rn "conversations.history\|conversations.replies" services --include=*.py | grep -v tests
```

Expected: no missing migration; the schema validates (add `extend_schema` to the three views if spectacular warns); every test passes (write the count into the hand-off); ruff clean; "no em dash"; the last grep lists only `read_page`, `read_thread` and `find_message` (the global constraint on Slack's limits).

- [ ] **Step 4: Commit and push**

```bash
git add e2e/test_slack_channels_flow.py e2e/agent_round2_world.py docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md .soc2/CONTROL_MAP.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md .agents/workflows/agent-intake-flow.md docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md
git commit -m "test(e2e): every public slack channel syncs by events with a catch-up; docs for delivery 3

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/slack-escalations-d3
```

---

### Task 10: Before the PR: rebase onto D4 when it has merged

**Files:**
- Modify (only if D4 merged): `services/customers/migrations/0063_slackconversation_channel_once.py` (renamed `0064_...`), `services/connectors/migrations/0010_slack_channels_from_config.py`, `services/connectors/providers/slack.py`, `services/connectors/sync.py`, `services/connectors/slack_catchup.py`, `services/connectors/slack_events.py`, D4's tests that call the deleted `fetch_threads`

**Interfaces:**
- Consumes (D4, as built on main): `customers.0063_escalation_links`; `RemoteThread.people`; `providers.slack.mentions(text)`, `MAX_PEOPLE`, `SlackProvider._people_of(creds, thread, people, looked)`; `sync._people(connector, remote, linked, stored)`; `_READ_FIELDS` with `"people"`; `via_app` on stored messages; D4's `_apply_thread` rule that a `via_app` message is no new human text. Read D4's contract "Changes during the build" for any renamed name before using it.

- [ ] **Step 1: Has D4 merged?**

```bash
git fetch origin
git ls-tree -r --name-only origin/main services/customers/migrations | grep -c "0063_escalation_links" || true
```

`0`: D4 has not merged. Skip to Step 6 and use its second line.

- [ ] **Step 2: Rebase and renumber**

```bash
git rebase origin/main
```

Resolve each conflict keeping both behaviours, then:

```bash
git mv services/customers/migrations/0063_slackconversation_channel_once.py services/customers/migrations/0064_slackconversation_channel_once.py
```

In `0064_slackconversation_channel_once.py`, the `customers` dependency becomes `("customers", "0063_escalation_links")`. In `connectors/migrations/0010_slack_channels_from_config.py`, `("customers", "0063_slackconversation_channel_once")` becomes `("customers", "0064_slackconversation_channel_once")`. Check: `$PY manage.py makemigrations --check --dry-run` says no changes.

- [ ] **Step 3: Port D4's provider and sync behaviours into D3's reads**

D3 deleted `fetch_threads` and `_replies`; D4 changed them. Keep each D4 behaviour in its D3 place:

1. **Metadata and `via_app`:** D3's `read_page`, `read_thread` and `reply_of` already ask for `include_all_metadata` and mark `via_app`; drop D4's copies of those lines in the deleted functions.
2. **A top message carrying our key is never a thread:** D3's `read_page` filter (`not is_ours(raw, config)`) and the event path (`is_ours(event, config, app)`) already do it.
3. **The thread's people** (D4 SE4-24): in `slack_catchup._page`, after the filing loop's `remote = provider.thread_of(...)`, and in `slack_catchup._thread`, after `remote` is built, set the people before filing:

```python
        remote.people = provider._people_of(creds, remote, people, set())
```

(`people` is the read's lookup cache already passed to `thread_of`; `set()` is D4's per-pass `looked` set: one per catch-up, made at the top of `run` and passed down if D4's signature asks for it.) In `slack_events._posted`, set the people before filing, with at most 3 lookups of mentioned people within Slack's 3 seconds:

```python
EVENT_LOOKUPS = 3  # module constant, beside the outcomes


def _event_people(provider, creds, texts, people):
    """D4's people for one event: the poster or replier, plus at most
    EVENT_LOOKUPS mentioned people not seen before (SC3-23's time budget)."""
    from .providers.slack import mentions

    asked = 0
    for user_id in [uid for text in texts for uid in mentions(text)]:
        if user_id in people or asked >= EVENT_LOOKUPS:
            continue
        provider._person(creds, user_id, people, timeout=EVENT_TIMEOUT)
        asked += 1
    return people
```

For a top message: `lookups = {}` passed to `thread_of(..., people=lookups)`, then `remote.people = _event_people(provider, creds, [remote.text], lookups)`. For a reply: the `people` dict `_posted` builds from the stored messages, passed to `reply_of`, then `remote = sync.stored_remote(locked, [reply])` and `remote.people = _event_people(provider, creds, [reply["text"]], people)`. D4's `sync._people` merges them with the stored `people` and drops emails, as it does for the poll.
4. **The shared flag:** D4's `file_conversation` read `connector.config["external_shared"]`; keep D3's line (`existing.external_shared = shared`, the channel row's flag) and drop D4's.
5. **`_READ_FIELDS`** is `("messages", "title", "latest_reply", "last_message_at", "external_shared", "channel_name", "people")`.
6. **`_apply_thread`:** keep D3's merge and D4's `via_app` rule together: the `return` line is `any(not m["bot"] and not m.get("via_app") and m["ts"] not in before for m in messages)` (or D4's form of the same rule).
7. **Keys:** `grep -rn 'pk}:{' services/agents services/connectors | grep -i "thread_ts\|\.ts"`: any Slack key D4 builds as `"<pk>:<ts>"` gains the channel (`"<pk>:<channel>:<ts>"`, SC3-10).

- [ ] **Step 4: Port D4's tests**

D4's `services/connectors/tests/test_slack_via_app.py` and `test_slack_people.py` call `SlackProvider().fetch_threads(CONFIG, CREDS, known=..., now=...)`: replace each call with Task 2's adapter (`from services.connectors.tests.test_slack_threads import fetch`, then `fetch(CONFIG, CREDS)`). D4's `test_a_stored_conversation_follows_its_channel_s_shared_flag` sets the connection's `config["external_shared"]`: it sets the channel row's instead (`SlackChannel.objects.create(connector=connector, channel_id="C0SUPPORT", name="support", is_member=True, external_shared=True)`). Add one event test to `test_slack_events.py`:

```python
    def test_a_mentioned_person_is_looked_up_for_the_thread_s_people(self):
        self.send(message("C0SUPPORT", TOP, "Pizza Hut exports fail"))
        self.send(
            message("C0SUPPORT", "1792041460.000100", "<@U0CARL> can you take this?", thread_ts=TOP)
        )
        self.assertEqual(self.filed().people["U0CARL"]["name"], "Carl Lee")
```

- [ ] **Step 5: The full check again, and push**

Run Task 9 Step 3's commands. Then:

```bash
git add services/connectors/providers/slack.py services/connectors/sync.py services/connectors/slack_catchup.py services/connectors/slack_events.py services/connectors/migrations/0010_slack_channels_from_config.py services/customers/migrations/0064_slackconversation_channel_once.py services/connectors/tests/test_slack_events.py services/connectors/tests/test_slack_via_app.py services/connectors/tests/test_slack_people.py
git commit -m "fix(connectors): slack channels on top of delivery 4: migration 0064, the thread's people from events and the catch-up

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push --force-with-lease origin feat/slack-escalations-d3
```

- [ ] **Step 6: The hand-off**

Hand-off (to the controller, not a PR): the head, the test count, the measured pins, every "Changes during the build" entry with its frontend impact, and **one of these lines for the PR body**:
- D4 merged first: "Rebased onto D4: `customers.0064_slackconversation_channel_once` depends on `0063_escalation_links`; D4's thread people and `via_app` work on events and the catch-up."
- D4 not merged: "When D4 (`customers.0063_escalation_links`) merges first, this PR's `customers.0063_slackconversation_channel_once` becomes `0064` and depends on it; `providers/slack.py` and `sync.py` take D4's people and `via_app` as Task 10 of the D3 backend plan says."


---

## Self-review

1. **Spec coverage (§16.1, §16.4).** Item 1 every public channel: SC3-2, SC3-3, Tasks 1, 3, 6. Item 2 the bot joins, `channels:join`, re-approval, the joined ones meanwhile: SC3-5, SC3-13, SC3-14, Tasks 2, 3, 6 (`channel_created`), 7 (`can_join`). Item 3 new channels picked up: `channel_created` (Task 6) and the listing each pass (Task 3). Item 4 exclude, default included: SC3-4, Tasks 3, 6 (events drop excluded), 7. Item 5 per-channel customer, else the name check: SC3-8, SC3-9, Tasks 4, 7. Item 6 rate limits: replaced by §16.4: events (Task 6) and the catch-up within Tier 1 (SC3-6, Tasks 2 to 4; the global constraint and Task 9's grep). Item 7 migration, connection 7 keeps working: SC3-11, Task 1. Item 8 Slack Connect: SC3-12, Tasks 3, 4, 6. Item 9 private channels: SC3-2, Tasks 1, 3, 6. §16.4: the endpoint, `url_verification`, signature reuse, 200 and retries (SC3-7, Task 6); inline filing with the agent on its tick (SC3-23); bots, `via_app`, edits and deletes (SC3-24, SC3-25, SC3-28); missed events (SC3-26, Tasks 3, 4, 6); events health (SC3-30, Task 7); owner set-up (contract §8). The reply's channel list: SC3-18, Task 8. D4: Task 10.
2. **Placeholders.** Each code step holds its code. The two measured pins (Tasks 6, 7) start as `None` with the exact measuring step and the queries allowed. Notes name an exact alternative only where the codebase may name a fixture or route differently, or where D4's names are not yet built (Task 10, against D4's plan).
3. **Type consistency.** `SlackChannel` (Task 1) with `walk_before`, `walk_from`, `asked_at`, `missed`, `event_at` is what `slack_channels` (Task 3), `slack_catchup` (Task 4), `slack_events` (Task 6) and the routes (Task 7) read and write. `read_page(...) -> (tops, has_more, lowest)`, `read_thread(...) -> (parent, replies)`, `thread_of`, `reply_of(..., app_id=)`, `is_top`, `is_ours` (Task 2) are what Tasks 4 and 6 call. `file_conversation(connector, remote, names, *, now, channel=None, linked=None)`, `stored_remote`, `edit_message`, `delete_message`, `DELETED` (Task 4) are what Task 6 calls. `unmatched.slack_key` (Task 4) and `split_slack_key` (Task 5) agree on `"<channel>:<ts>"`, which the migration writes (Task 1). `can_join` (Task 3) feeds the routes, the serializer (Task 7) and `channel_created` (Task 6).

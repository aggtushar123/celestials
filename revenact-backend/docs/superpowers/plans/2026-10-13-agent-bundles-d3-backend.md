# Agent bundles, delivery 3 (backend): outside actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundles act outside Revenact when a person presses Run: `mail.send_reply` sends a reply from the runner's own mailbox, `slack.reply` posts in the source thread (or a connected channel), `jira.create` opens an issue and `jira.assign` assigns one; each tool is "Read only" or "Can act" per connection (Slack consent, Jira permission check), every outside step carries an idempotency key and every Retry looks for an earlier write before writing again, every call is audited, a failed step tells its runner, and the agents may propose the new kinds under the twice-filter.

**Architecture:** One small facade, `services/agents/outside/tools.py`, stands between the kinds and the vendors (`services/mail/agent_send.py` for Gmail and Outlook, the Slack and Jira connector providers); tests swap it for in-memory fakes. Each new kind lives in `services/agents/actions/` like every other and does its checks, its reads, then its one write last, inside D1's per-step transaction (`bundle_run.run_step`). `outside/keys.py` makes the key and the look-back window, `outside/gates.py` decides whether a tool may be used (the step's disabled state, the run's refusal, the pick lists' 409), `outside/trail.py` writes `agent_outside.call`, `outside/sentences.py` turns vendor refusals into the contract's sentences, `outside/options.py` serves the live pick lists. Connectors gain `granted_scopes` and the `agents_can_act` switch (`services/connectors/agent_access.py`) and their OAuth becomes browser-bound (`core/oauth_browser.py`).

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15), stdlib `urllib` for every vendor call (no SDKs). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` (§6.6 to §6.9, §7.3, §7.4, §8.3, §9; the D3 row of §11). **Binding contract:** `docs/superpowers/plans/2026-10-13-agent-bundles-d3-api.md` (this repo). Read its "Decisions narrowing the spec" table (D3-1 to D3-28) before any task; every decision is a requirement here. The D1 and D2 contracts and their as-built record in `docs/API_CONTRACTS.md` still hold where D3 does not change them.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles3-be` on branch `feat/agent-bundles-d3` (cut from main 7ee72bb: D1 #114 and D2 #115 merged). Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them).
- Python: the worktree's `venv` (a symlink), written `PY` below: `PY=venv/bin/python`. Ruff: `venv/bin/ruff`.
- `.env` points at the shared dev database `revenact`: **never migrate it, never write to it.** Tests use their own test database; read-only shell queries are fine.
- Run tests as `$PY manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (`ruff format` also formats Python blocks inside Markdown; run `venv/bin/ruff format .` if the check fails, including on this plan and the docs).
- Every commit message is a conventional commit (`commit-messages` skill) and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths (`git add <paths>`, `git rm` for deletions); never `git add -A` or `git add .`. Never `git stash` (shared across worktrees).
- **CI is blocked by GitHub billing:** local checks are the gate. A task is done only when its tests pass locally; the last task runs the full suite (`--parallel auto`), `makemigrations --check`, `manage.py spectacular` and ruff.
- **Nothing real is ever sent.** Every test that runs an outside step goes through the fakes in `services/agents/tests/outside_fakes.py` (installed by `OutsideFixture`); every test of a real tool class patches its transport with a fake client (`FakeGmail`, `FakeGraph`, `FakeSlackApi`, `FakeJiraApi`). No test opens a socket to Google, Microsoft, Slack or Atlassian, and none calls a model (`get_completion` is always patched).
- **Postgres 16:** no visibility rule may be a join made unique with `DISTINCT`; use `id IN (subquery)`. Every new read in a page (step payloads, History, the options route) is covered by a DISTINCT-free assertion (Task 18). Query counts are pinned in tests.
- Every visibility filter and gate carries a `# SOC2:AUTH-02 ...` comment in the house style; every audited write `# SOC2:LOG-01`; the browser binding `# SOC2:AUTH-01`; the idempotency key `# SOC2:API-08`; tokens stay in `Connector.credentials` / `MailboxConnection.credentials` (Fernet, `# SOC2:DATA-02` already there): no new secret store.
- **Twice-filter (spec §4.4, contract §8):** unchanged on the way in; on the way out, text that leaves Revenact passes `internal_mentions` (D3-19); a person's Run is the only thing that writes outside.
- **Outside steps are always Ask** (D1 D21, `Kind.outside=True`); the nightly pass, the intake and any Auto path never call a tool.
- User-facing sentences are exactly the contract's (§2, §5, §6, §7). Reused sentences keep their existing constants (`edits.NO_REPLY`, `edits.LONG_REPLY`, `surveys.NOT_THE_RUNNER`, `draft_send.ADD_SOMEONE`).
- No new dependency. New migrations: `metrics.0017_agent_action_outside_kinds`, `connectors.0004_connector_agent_access`, `notifications.0015_agent_step_failed`.
- **Product documents rule:** the canonical docs (`docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`) are updated in this PR (Task 20), with `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `.soc2/CONTROL_MAP.md`, `.soc2/config.yml` and the flow docs (`flow-docs` skill: a new `.agents/workflows/agent-outside-flow.md`, `repo-architecture.md`).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/metrics/models.py`, `migrations/0017_agent_action_outside_kinds.py` | modify/create | the four kinds' choices |
| `services/agents/placeholders.py`, `services/agents/bundle_run.py` | modify | text outputs, the new chip nouns, `fill(skip=)` for customer-facing fields; `run_step` keeps an outside step's attempt; `finish(ran=)` tells the runner |
| `services/connectors/models.py`, `migrations/0004_connector_agent_access.py` | modify/create | `granted_scopes`, `agents_can_act`, `agents_allowed_by`, `agents_allowed_at` |
| `services/connectors/agent_access.py` | create | `KINDS`, `kinds`, `granted`, `usable`, `can_act`, `needs`, `block` |
| `services/connectors/serializers.py`, `views.py`, `urls.py` | modify | the `agents` block; `POST /connectors/<id>/agents/`; browser-bound OAuth; the consent callback |
| `core/oauth_browser.py` | create | `digest`, `cookie_for`, `bind`, `same_browser`, `forget` |
| `services/connectors/providers/base.py` | modify | `http_call` (headers), `NoAnswer`, `ProviderError.status/code/body` |
| `services/connectors/providers/slack.py` | modify | scopes, team, bot name, `via`; `post_message`, `find_message`, `message_url`; bots never become tickets |
| `services/connectors/providers/jira.py` | modify | `account_name`; permissions, lists, `create_issue`, `find_issue`, `issue_assignee`, `assign_issue`, `user_by_email`, `adf`, `issue_url`, `LABEL_PREFIX`; labels synced |
| `services/connectors/sync.py` | modify | an issue Revenact made never touches a thread (D3-26) |
| `services/mail/mime.py`, `providers/google.py`, `providers/microsoft.py`, `sync.py` | modify | extra headers; cc, html and headers on send; `MicrosoftProvider.find_sent` |
| `services/mail/agent_send.py` | create | `blocked`, `send`, `find`, `SentReply`, the mail sentences |
| `services/agents/outside/__init__.py`, `keys.py`, `tools.py`, `sentences.py`, `trail.py`, `gates.py`, `options.py`, `offered.py` | create | the facade and its rules |
| `services/agents/actions/mail_replies.py`, `slack_replies.py`, `jira_issues.py` | create | `mail.send_reply`, `slack.reply`, `jira.create`, `jira.assign` |
| `services/agents/registry.py` | modify | the four kinds |
| `services/agents/bulk.py`, `bundle_payloads.py` | modify | connectors and mailboxes read once a page; `disabled_link`, `links`, `can_reject` by rights |
| `services/agents/outside_views.py`, `urls.py` | create/modify | `GET .../options/<list>/` |
| `services/agents/failure_notice.py`, `bundles.py` | create/modify | `agent_step_failed`; a settled stuck run tells its runner |
| `services/notifications/models.py`, `migrations/0015_agent_step_failed.py` | modify/create | the kind |
| `services/agents/evidence.py`, `prompt.py`, `run.py`, `intake.py` | modify | thread email/ticket/channel, the Jira connector; payloads and rules; `offered`; the out-check |
| `config/settings.py`, `.env.example` | modify | `AGENT_TOOL_TIMEOUT_SECONDS` |
| tests | create/modify | listed per task |
| `e2e/test_agent_outside_flow.py` | create | the journey |
| docs | modify | Task 20 |

## Shared test fixtures

- `services/connectors/tests/slack_fake.py` (Task 5) and `services/connectors/tests/jira_fake.py` (Task 6): the Slack Web API and the Jira REST API in memory, standing in for the providers' `http_json`/`http_call`.
- `services/mail/tests/graph_fake.py` (Task 8): Microsoft Graph's mail routes in memory. Gmail uses the existing `services/mail/tests/gmail_fake.py` (`GmailFixture.use_gmail`).
- `services/agents/tests/outside_fakes.py` (Task 9): `FakeMail`, `FakeSlack`, `FakeJira` implementing the facade, and `use_fakes(testcase)`.
- `services/agents/tests/outside_fixtures.py` (Task 9): `OutsideFixture(IntakeFixture)`, the world every outside test uses: BrainFixture's people (`self.admin` is Alice the admin with view-all and Leadership, `self.csm` is Carl who owns Pizza Hut and reports to `self.mona`, `self.other` is Dana, `self.lee` is Leadership), IntakeFixture's `self.erin` (Engineering), plus `slack_connector()`, `jira_connector()`, `gmail_for(user)`, `slack_thread()`, `jira_thread()`, `run_all_steps()` and the installed fakes `self.mail`, `self.slack`, `self.jira`.

---

### Task 1: The four kinds' choices, text outputs and customer-facing fields left unfilled

**Files:**
- Modify: `services/metrics/models.py` (`AgentAction.Kind`, after `CAMPAIGN_SEND`)
- Create: `services/metrics/migrations/0017_agent_action_outside_kinds.py` (generated)
- Modify: `services/agents/placeholders.py`
- Modify: `services/agents/bundle_run.py` (`run_step`, one line)
- Test: `services/agents/tests/test_placeholders.py` (append), `services/agents/tests/test_outside_placeholders.py` (create)

**Interfaces:**
- Produces: `AgentAction.Kind.MAIL_SEND_REPLY`, `SLACK_REPLY`, `JIRA_CREATE`, `JIRA_ASSIGN` (values `mail.send_reply`, `slack.reply`, `jira.create`, `jira.assign`); `placeholders.TEXTS = ("ticket_key", "ticket_url", "slack_ts", "slack_url")`; `placeholders.outputs_for(result)` also keeps non-empty strings under `TEXTS` and whole-number `email_id`; `placeholders.fill(payload, outputs_by_position, skip=())` leaves the fields named in `skip` as written; `placeholders.label(1, "ticket_key") == "Jira ticket from step 1"`.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_placeholders.py` (a `SimpleTestCase` module; add the class at the end):

```python
class OutsidePlaceholderTests(SimpleTestCase):
    """Agent bundles D3 contract D3-17: outside outputs are text, chips name
    them, and a customer-facing field is never filled."""

    def test_outside_outputs_are_kept_as_text(self):
        result = {
            "ticket_key": "SUP-123",
            "ticket_url": "https://acme.atlassian.net/browse/SUP-123",
            "slack_ts": "1760340000.000200",
            "slack_url": "https://slack.com/archives/C0SUPPORT/p1760340000000200",
            "email_id": 88,
            "attempted_by": 3,
            "ticket_title": "",
        }
        self.assertEqual(
            placeholders.outputs_for(result),
            {
                "email_id": 88,
                "ticket_key": "SUP-123",
                "ticket_url": "https://acme.atlassian.net/browse/SUP-123",
                "slack_ts": "1760340000.000200",
                "slack_url": "https://slack.com/archives/C0SUPPORT/p1760340000000200",
            },
        )

    def test_chips_name_a_jira_ticket_and_a_slack_message(self):
        self.assertEqual(placeholders.label(1, "ticket_key"), "Jira ticket from step 1")
        self.assertEqual(placeholders.label(2, "ticket_url"), "Jira ticket link from step 2")
        self.assertEqual(placeholders.label(1, "slack_url"), "Slack message link from step 1")

    def test_a_skipped_field_is_left_as_written(self):
        payload = {"body": "See {{step 1.ticket_key}}", "title": "Fix {{step 1.ticket_key}}"}
        filled = placeholders.fill(payload, {1: {"ticket_key": "SUP-9"}}, skip=("body",))
        self.assertEqual(filled, {"body": "See {{step 1.ticket_key}}", "title": "Fix SUP-9"})

    def test_a_skipped_field_never_needs_its_step(self):
        payload = {"body": "See {{step 1.ticket_key}}"}
        self.assertEqual(placeholders.fill(payload, {}, skip=("body",)), payload)
```

(The module already imports `placeholders` and `SimpleTestCase`; keep its imports.)

Create `services/agents/tests/test_outside_placeholders.py`:

```python
"""A run never fills a placeholder into text a customer reads (agent bundles
D3 contract D3-17): a test kind stands in for a customer-facing one, since
the real ones talk to tools."""

import dataclasses
from unittest.mock import patch

from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BundleFixture, run_one
from services.customers.models import Note

FACING = dataclasses.replace(REGISTRY["note.create"], key="test.facing", customer_facing=("body",))


class CustomerFacingFillTests(BundleFixture):
    def setUp(self):
        patcher = patch.dict(REGISTRY, {"test.facing": FACING})
        patcher.start()
        self.addCleanup(patcher.stop)
        credits = patch("services.agents.policy.plan_credits", return_value=3000)
        credits.start()
        self.addCleanup(credits.stop)

    def test_a_customer_facing_field_runs_as_written(self):
        bundle = self.bundle_of(self.pizza)
        step = self.step(
            self.pizza,
            kind="test.facing",
            payload={"title": "For Ann", "body": "Logged as {{step 1.ticket_key}}"},
            bundle=bundle,
        )
        response = run_one(self.client_for(self.csm), step)
        self.assertEqual(response.status_code, 200, response.content)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied")
        note = Note.objects.get(pk=step.result["note_id"])
        self.assertEqual(note.body, "Logged as {{step 1.ticket_key}}")
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_placeholders services.agents.tests.test_outside_placeholders --parallel auto --noinput`
Expected: FAIL: `outputs_for` drops the strings and `email_id`; `label(1, "ticket_key")` is "Ticket from step 1"; `fill()` takes no `skip`; the note's body is a failed step's (`Needs step 1, which didn't run.`).

- [ ] **Step 3: The kinds' choices**

In `services/metrics/models.py`, inside `AgentAction.Kind`, after `CAMPAIGN_SEND = "campaign.send", "Send a campaign"`:

```python
        # Agent bundles D3: outside actions, always Ask, never undone.
        MAIL_SEND_REPLY = "mail.send_reply", "Send an email reply"
        SLACK_REPLY = "slack.reply", "Reply in Slack"
        JIRA_CREATE = "jira.create", "Create a Jira issue"
        JIRA_ASSIGN = "jira.assign", "Assign a Jira issue"
```

Generate the migration (it only alters `kind`'s choices):

Run: `$PY manage.py makemigrations metrics --name agent_action_outside_kinds`
Expected: `services/metrics/migrations/0017_agent_action_outside_kinds.py` with one `AlterField` on `agentaction.kind` (the 23 choices), depending on `0016_agent_action_edited_at`.

- [ ] **Step 4: Text outputs, chip nouns, `skip`**

In `services/agents/placeholders.py`:

```python
THINGS = {
    "task": "Task",
    "note": "Note",
    "draft": "Draft",
    "campaign": "Campaign",
    "survey": "Survey",
    "segment": "Segment",
    "rule": "Scenario",
    "canvas": "Map",
    "plan": "Plan",
    "template": "Template",
    "initiative": "Initiative",
    "send": "Send",
    # Agent bundles D3 (contract D3-17).
    "ticket": "Jira ticket",
    "slack": "Slack message",
    "email": "Email",
}
```

Replace the `IDS` line and `outputs_for`:

```python
IDS = (
    "note_id",
    "draft_id",
    "plan_id",
    "template_id",
    "initiative_id",
    "send_id",
    "email_id",
    *LINKS,
)
#: Outside results (contract D3-17): text, not ids. Their links are the
#: tool's own https pages, kept as the tool gave them.
TEXTS = ("ticket_key", "ticket_url", "slack_ts", "slack_url")


def outputs_for(result):
    """A step's `outputs` from its `result`: its ids, a link per id with a
    page, and an outside step's keys and links."""
    out = {}
    for key in IDS:
        value = (result or {}).get(key)
        if _whole(value):
            out[key] = value
            if key in LINKS:
                link_key, pattern = LINKS[key]
                out[link_key] = pattern.format(value)
    for key in TEXTS:
        value = (result or {}).get(key)
        if isinstance(value, str) and value:
            out[key] = value
    return out
```

Replace `fill`:

```python
def fill(payload, outputs_by_position, skip=()):
    """`payload` with every placeholder replaced; NeedsStep for the first
    producing step that did not run or lacks the key (contract §6.3). The
    fields in `skip` (a kind's customer-facing ones) are left as written: a
    customer never reads a step's output (D3-17)."""

    def replace(match):
        n, key = int(match.group(1)), match.group(2)
        outputs = outputs_by_position.get(n) or {}
        if key not in outputs:
            raise NeedsStep(n)
        return str(outputs[key])

    if not isinstance(payload, dict):
        return payload
    return {
        field: PATTERN.sub(replace, value)
        if isinstance(value, str) and field not in skip
        else value
        for field, value in payload.items()
    }
```

- [ ] **Step 5: The run skips them**

In `services/agents/bundle_run.py`, `run_step`, replace the fill line:

```python
            try:
                payload = placeholders.fill(
                    step.payload, outputs, skip=REGISTRY[step.kind].customer_facing
                )
```

- [ ] **Step 6: Run the tests and the run's own**

Run: `$PY manage.py test services.agents.tests.test_placeholders services.agents.tests.test_outside_placeholders services.agents.tests.test_bundle_run --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/metrics/models.py services/metrics/migrations/0017_agent_action_outside_kinds.py services/agents/placeholders.py services/agents/bundle_run.py services/agents/tests/test_placeholders.py services/agents/tests/test_outside_placeholders.py
git commit -m "feat(agents): outside kinds' choices, text outputs, customer text never filled

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: What agents may do through a connector

**Files:**
- Modify: `services/connectors/models.py` (`Connector`, after `last_sync_note`)
- Create: `services/connectors/migrations/0004_connector_agent_access.py` (generated)
- Create: `services/connectors/agent_access.py`
- Modify: `services/connectors/serializers.py` (`ConnectorSerializer`), `services/connectors/views.py` (both `get_queryset`)
- Test: `services/connectors/tests/test_agent_access.py` (create)

**Interfaces:**
- Produces: `Connector.granted_scopes` (list), `agents_can_act` (bool), `agents_allowed_by` (User or None), `agents_allowed_at`; `agent_access.KINDS`, `SLACK_NEEDS = "chat:write"`, `JIRA_NEEDS = ("CREATE_ISSUES", "ASSIGN_ISSUES")`, `JIRA_CHECKED = ("CREATE_ISSUES", "ASSIGN_ISSUES", "BROWSE_PROJECTS")`, `kinds(connector) -> tuple[str, ...]`, `granted(connector) -> bool`, `usable(connector) -> bool`, `can_act(connector) -> bool`, `needs(connector) -> str | None`, `block(connector) -> dict` (contract §4.3).

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_agent_access.py`:

```python
"""Each connector says what agents may do through it (agent bundles D3
contract §1.1, §4.3, D3-9)."""

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from services.accounts.models import Organisation, User
from services.connectors import agent_access
from services.connectors.models import Connector
from services.segments.tests.fixtures import person

CONNECTORS = "/api/v1/connectors/"


class AgentAccessTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.admin = person(
            "alice@acme.io",
            "Alice Admin",
            cls.org,
            role=User.Role.ADMIN,
            function=User.Function.LEADERSHIP,
        )

    def connector(self, provider, *, scopes=(), can_act=False, via="token", **fields):
        made = Connector.objects.create(
            organisation=self.org,
            provider=provider,
            name=f"{provider} {Connector.objects.count()}",
            status=Connector.Status.CONNECTED,
            config={"via": via} if provider == "slack" else {"host": "acme.atlassian.net"},
            granted_scopes=list(scopes),
            agents_can_act=can_act,
            **fields,
        )
        made.set_credentials({"bot_token": "xoxb-test"})
        made.save(update_fields=["credentials"])
        return made

    def test_slack_needs_chat_write_and_the_switch(self):
        slack = self.connector("slack", scopes=["channels:history"], can_act=True)
        self.assertEqual(agent_access.kinds(slack), ("slack.reply",))
        self.assertFalse(agent_access.can_act(slack))
        self.assertEqual(agent_access.needs(slack), "token")
        slack.granted_scopes = ["channels:history", "chat:write"]
        self.assertTrue(agent_access.can_act(slack))
        self.assertIsNone(agent_access.needs(slack))
        slack.agents_can_act = False
        self.assertFalse(agent_access.can_act(slack))

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_slack_through_sign_in_asks_for_consent(self):
        slack = self.connector("slack", via="oauth")
        self.assertEqual(agent_access.needs(slack), "consent")

    def test_jira_needs_create_and_assign(self):
        jira = self.connector("jira", scopes=["CREATE_ISSUES"], can_act=True)
        self.assertEqual(agent_access.kinds(jira), ("jira.create", "jira.assign"))
        self.assertEqual(agent_access.needs(jira), "permission")
        jira.granted_scopes = ["CREATE_ISSUES", "ASSIGN_ISSUES"]
        self.assertTrue(agent_access.can_act(jira))

    def test_a_disabled_or_failing_connector_cant_act(self):
        jira = self.connector(
            "jira", scopes=["CREATE_ISSUES", "ASSIGN_ISSUES"], can_act=True, is_enabled=False
        )
        self.assertFalse(agent_access.can_act(jira))
        jira.is_enabled, jira.status = True, Connector.Status.ERROR
        self.assertFalse(agent_access.can_act(jira))

    def test_zendesk_is_read_only_in_round_one(self):
        zendesk = self.connector("zendesk", can_act=True)
        self.assertEqual(agent_access.kinds(zendesk), ())
        self.assertFalse(agent_access.can_act(zendesk))
        self.assertIsNone(agent_access.needs(zendesk))

    def test_the_list_carries_the_agents_block(self):
        self.connector("zendesk")
        slack = self.connector(
            "slack",
            scopes=["chat:write"],
            can_act=True,
            agents_allowed_by=self.admin,
            agents_allowed_at=timezone.now(),
        )
        self.client.force_authenticate(self.admin)
        rows = {row["id"]: row for row in self.client.get(CONNECTORS).json()}
        block = rows[slack.pk]["agents"]
        self.assertEqual(
            {k: block[k] for k in ("kinds", "can_act", "needs", "allowed_by")},
            {
                "kinds": ["slack.reply"],
                "can_act": True,
                "needs": None,
                "allowed_by": {"id": self.admin.pk, "name": "Alice Admin"},
            },
        )
        self.assertIsNotNone(block["allowed_at"])
        self.assertNotIn("granted_scopes", rows[slack.pk])
```

(`person()` is `services/segments/tests/fixtures.py`'s; an `ADMIN` role holds `manage_integrations`, as BrainFixture's Alice does.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_agent_access --parallel auto --noinput`
Expected: ERROR: `Connector() got unexpected keyword arguments: 'granted_scopes', 'agents_can_act'`; `No module named 'services.connectors.agent_access'`.

- [ ] **Step 3: The fields**

In `services/connectors/models.py`, after `last_sync_note`:

```python
    #: What the tool says Revenact may do (agent bundles D3 §1.1): Slack's bot
    #: scopes, Jira's project permissions found by the last check.
    granted_scopes = models.JSONField(default=list, blank=True)
    #: "Allow agents to act" (D3-9): an admin's switch; Can act also needs the grant.
    agents_can_act = models.BooleanField(default=False)
    agents_allowed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    agents_allowed_at = models.DateTimeField(null=True, blank=True)
```

Run: `$PY manage.py makemigrations connectors --name connector_agent_access`
Expected: `services/connectors/migrations/0004_connector_agent_access.py` adding the four fields, depending on `0003_ticket_sources`.

- [ ] **Step 4: The rules**

Create `services/connectors/agent_access.py`:

```python
"""What agents may do through a connector (agent bundles D3 contract §1.1,
§4.3, D3-9). Round 1: Slack posts and Jira issues; every other tool is read
only. Can act needs the admin's switch, the tool's grant (Slack's
`chat:write`, Jira's create and assign permissions) and a working
connection."""

from django.conf import settings
from rest_framework import serializers

from services.customers.task_changes import person

from .models import Connector

P = Connector.Provider
KINDS = {P.SLACK: ("slack.reply",), P.JIRA: ("jira.create", "jira.assign")}
SLACK_NEEDS = "chat:write"
JIRA_NEEDS = ("CREATE_ISSUES", "ASSIGN_ISSUES")
#: What the Jira check asks for (BROWSE_PROJECTS is stored, not required).
JIRA_CHECKED = ("CREATE_ISSUES", "ASSIGN_ISSUES", "BROWSE_PROJECTS")
_stamp = serializers.DateTimeField().to_representation


def kinds(connector):
    return KINDS.get(connector.provider, ())


def granted(connector):
    held = set(connector.granted_scopes or [])
    if connector.provider == P.SLACK:
        return SLACK_NEEDS in held
    if connector.provider == P.JIRA:
        return set(JIRA_NEEDS) <= held
    return False


def usable(connector):
    """The tool can be called at all: enabled, credentials held, not failing."""
    return (
        connector.is_enabled
        and connector.has_credentials
        and connector.status != Connector.Status.ERROR
    )


def can_act(connector):
    # SOC2:AUTH-02 an agent step acts only through a tool an admin allowed and the tool granted
    return (
        bool(kinds(connector))
        and connector.agents_can_act
        and granted(connector)
        and (usable(connector))
    )


def _slack_sign_in():
    return bool(settings.SLACK_OAUTH_CLIENT_ID and settings.SLACK_OAUTH_CLIENT_SECRET)


def needs(connector):
    """What "Allow agents to act" will do: consent, a token with the scope,
    or a Jira permission; None when it can act or never could."""
    if not kinds(connector) or can_act(connector):
        return None
    if connector.provider == P.JIRA:
        return "permission"
    if (connector.config or {}).get("via") == "oauth" and _slack_sign_in():
        return "consent"
    return "token"


def block(connector):
    """The contract's `agents` block (§4.3)."""
    on = connector.agents_can_act
    return {
        "kinds": list(kinds(connector)),
        "can_act": can_act(connector),
        "needs": needs(connector),
        "allowed_by": person(connector.agents_allowed_by) if on else None,
        "allowed_at": _stamp(connector.agents_allowed_at)
        if on and connector.agents_allowed_at
        else None,
    }
```

- [ ] **Step 5: The serializer and the querysets**

In `services/connectors/serializers.py`, `ConnectorSerializer`: add the field next to `setup`:

```python
    #: Agent bundles D3 §4.3: what agents may do through it.
    agents = serializers.SerializerMethodField()
```

add `"agents"` to `Meta.fields` (after `"setup"`) and to `read_only_fields`, and the method:

```python
    def get_agents(self, obj):
        from .agent_access import block

        return block(obj)
```

In `services/connectors/views.py`, both `ConnectorListCreateView.get_queryset` and `ConnectorDetailView.get_queryset` chain `.select_related("agents_allowed_by")` after `.filter(...)`, so the block reads no row per connector.

- [ ] **Step 6: Run the tests and the connectors' own**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/models.py services/connectors/migrations/0004_connector_agent_access.py services/connectors/agent_access.py services/connectors/serializers.py services/connectors/views.py services/connectors/tests/test_agent_access.py
git commit -m "feat(connectors): what agents may do through each connector

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Connector OAuth finishes only in the browser that started it

**Files:**
- Create: `core/oauth_browser.py`
- Modify: `services/connectors/views.py` (`ConnectorConnectView.post`'s OAuth branch, `ConnectorOAuthCallbackView`)
- Modify: `.soc2/config.yml` (`public_routes`)
- Test: `services/connectors/tests/test_oauth_browser.py` (create)

**Interfaces:**
- Produces: `core.oauth_browser.digest(nonce) -> str`; `cookie_for(request, name, path) -> (cookie name, path)`; `bind(response, request, *, name, path, max_age) -> str` (sets the cookie, returns the nonce's digest); `same_browser(request, state, *, name, path) -> bool`; `forget(response, request, *, name, path)`. In `services/connectors/views.py`: `COOKIE = "revenact_connector_oauth"`, `COOKIE_PATH = "/api/v1/connectors/oauth/"`, `OTHER_BROWSER = "Open the link in the browser that started it."`, `start_oauth(request, connector, provider, form, *, purpose, act=False) -> Response` (used by Task 7). The state carries `purpose` (`"connect"` or `"agents"`) and `browser`.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_oauth_browser.py`:

```python
"""A connector's OAuth link finishes only in the browser that started it
(agent bundles D3 contract §5.4, D3-22): a forwarded link connects nothing."""

from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.test import override_settings
from rest_framework.test import APITestCase

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.connectors.models import Connector
from services.connectors.providers.slack import SlackProvider
from services.segments.tests.fixtures import person

START = "/api/v1/connectors/{}/connect/"
CALLBACK = "/api/v1/connectors/oauth/slack/callback/"
COOKIE = "revenact_connector_oauth"


@override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
class ConnectorOAuthBrowserTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.admin = person(
            "alice@acme.io",
            "Alice Admin",
            cls.org,
            role=User.Role.ADMIN,
            function=User.Function.LEADERSHIP,
        )
        cls.slack = Connector.objects.create(
            organisation=cls.org, provider="slack", name="Slack", department="cs"
        )

    def start(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            START.format(self.slack.pk), {"oauth": True, "channel": "C0SUPPORT"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        state = parse_qs(urlsplit(response.json()["authorize_url"]).query)["state"][0]
        self.client.force_authenticate(None)
        return response, state

    def test_the_start_sets_an_http_only_cookie(self):
        response, _ = self.start()
        cookie = response.cookies[COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/v1/connectors/oauth/")
        self.assertEqual(cookie["samesite"], "Lax")

    def test_the_same_browser_connects(self):
        _, state = self.start()
        with patch.object(
            SlackProvider,
            "exchange_code",
            return_value=({"channel": "C0SUPPORT", "channel_name": "support"}, {"bot_token": "x"}),
        ) as exchange:
            answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertEqual(answer.status_code, 302)
        self.assertIn("connector=connected", answer["Location"])
        exchange.assert_called_once()
        self.assertEqual(answer.cookies[COOKIE].value, "")

    def test_a_forwarded_link_is_refused_before_any_exchange(self):
        _, state = self.start()
        self.client.cookies.clear()
        with patch.object(SlackProvider, "exchange_code") as exchange:
            answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        exchange.assert_not_called()
        self.assertIn("connector=error", answer["Location"])
        self.assertIn("Open+the+link+in+the+browser+that+started+it.", answer["Location"])
        event = AuditEvent.objects.get(action="connector.oauth_refused")
        self.assertEqual(event.metadata, {"provider": "slack", "reason": "other_browser"})
        self.slack.refresh_from_db()
        self.assertFalse(self.slack.has_credentials)

    def test_another_browsers_cookie_is_refused(self):
        _, state = self.start()
        self.client.cookies[COOKIE] = "someone-elses-nonce"
        with patch.object(SlackProvider, "exchange_code") as exchange:
            answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        exchange.assert_not_called()
        self.assertIn("connector=error", answer["Location"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_oauth_browser --parallel auto --noinput`
Expected: FAIL: no cookie is set (`KeyError: 'revenact_connector_oauth'`); the forwarded link connects.

- [ ] **Step 3: The browser binding**

Create `core/oauth_browser.py`:

```python
"""Binding an OAuth round trip to the browser that started it (agent
bundles D3 contract §5.4, D3-22; the mail callback's rule, Gmail D1
decision 33). The start sets an HttpOnly cookie holding a random nonce and
puts its SHA-256 in the signed state; the callback is trusted only when
the cookie's hash matches, so a forwarded link connects nothing. Over
https the `__Host-` name (Secure, Path=/, no Domain: a sibling subdomain
cannot plant one); plain-http development keeps the unprefixed name,
scoped to the callback's path."""

import hashlib
import hmac
import secrets


def digest(nonce):
    """What the state carries: a hash, so the authorize URL never holds the cookie."""
    return hashlib.sha256(nonce.encode()).hexdigest()


def cookie_for(request, name, path):
    """(cookie name, path) for this request's scheme."""
    if request.is_secure():
        return f"__Host-{name}", "/"
    return name, path


def bind(response, request, *, name, path, max_age):
    """Set a fresh nonce on `response`; return the digest the state must carry."""
    nonce = secrets.token_urlsafe(32)
    cookie, cookie_path = cookie_for(request, name, path)
    # SOC2:AUTH-01 the callback finishes only in this browser
    response.set_cookie(
        cookie,
        nonce,
        max_age=max_age,
        path=cookie_path,
        secure=request.is_secure(),
        httponly=True,
        samesite="Lax",
    )
    return digest(nonce)


def same_browser(request, state, *, name, path):
    cookie, _ = cookie_for(request, name, path)
    nonce = request.COOKIES.get(cookie, "")
    expected = state.get("browser") if isinstance(state, dict) else None
    if not nonce or not isinstance(expected, str):
        return False
    return hmac.compare_digest(digest(nonce), expected)


def forget(response, request, *, name, path):
    cookie, cookie_path = cookie_for(request, name, path)
    response.delete_cookie(cookie, path=cookie_path, samesite="Lax")
```

- [ ] **Step 4: The start**

In `services/connectors/views.py`, add the imports `from core import oauth_browser` and, near the constants:

```python
COOKIE = "revenact_connector_oauth"
COOKIE_PATH = "/api/v1/connectors/oauth/"
OTHER_BROWSER = "Open the link in the browser that started it."


def start_oauth(request, connector, provider, form, *, purpose, act=False):
    """`{authorize_url}` with the browser cookie set (D3-22). `purpose`:
    "connect" (today's sign-in) or "agents" (the consent for chat:write)."""
    response = Response()
    browser = oauth_browser.bind(
        response, request, name=COOKIE, path=COOKIE_PATH, max_age=STATE_MAX_AGE
    )
    state = signing.dumps(
        {
            "connector": connector.id,
            "user": request.user.id,
            "form": form,
            "purpose": purpose,
            "browser": browser,
        },
        salt=STATE_SALT,
    )
    redirect_uri = _redirect_uri(request, provider.key)
    url = (
        provider.authorize_url(state, redirect_uri, act=True)
        if act
        else provider.authorize_url(state, redirect_uri)
    )
    response.data = {"authorize_url": url}
    return response
```

and replace the body of `ConnectorConnectView.post`'s `if form.get("oauth"):` branch after its "not set up" refusal with:

```python
            return start_oauth(
                request,
                connector,
                provider,
                {k: v for k, v in form.items() if k != "oauth" and isinstance(v, str)},
                purpose="connect",
            )
```

- [ ] **Step 5: The callback**

Replace `ConnectorOAuthCallbackView` with:

```python
class ConnectorOAuthCallbackView(APIView):
    """GET /api/v1/connectors/oauth/<provider>/callback/?code=&state= —
    public by necessity (the provider's redirect carries no bearer token);
    the signed state is trusted only alongside the starting browser's
    cookie, which every answer clears (D3-22)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, provider_key):
        response = self._finish(request, provider_key)
        oauth_browser.forget(response, request, name=COOKIE, path=COOKIE_PATH)
        return response

    def _finish(self, request, provider_key):
        from services.accounts.models import User

        if request.query_params.get("error"):
            return _back_to_integrations(
                "error", request.query_params.get("error_description", "denied")
            )
        try:
            state = signing.loads(
                request.query_params.get("state", ""), salt=STATE_SALT, max_age=STATE_MAX_AGE
            )
        except signing.BadSignature:
            return _back_to_integrations("error", "This connection link is invalid or has expired.")
        user = User.objects.filter(pk=state.get("user"), is_active=True).first()
        connector = Connector.objects.filter(
            pk=state.get("connector"), provider=provider_key
        ).first()
        if user is None or connector is None or connector.organisation_id != user.organisation_id:
            return _back_to_integrations("error", "Unknown connector.")
        # SOC2:AUTH-01 before the code exchange: no token is issued for whoever opened a forwarded link
        if not oauth_browser.same_browser(request, state, name=COOKIE, path=COOKIE_PATH):
            audit.record(  # SOC2:LOG-01 a refused OAuth finish
                "connector.oauth_refused",
                request=request,
                actor=user,
                target=connector,
                outcome="failure",
                metadata={"provider": connector.provider, "reason": "other_browser"},
            )
            return _back_to_integrations("error", OTHER_BROWSER)
        provider = _ticket_provider(connector)
        try:
            config, creds = provider.exchange_code(
                request.query_params.get("code", ""),
                _redirect_uri(request, provider_key),
                state.get("form") or {},
            )
        except ProviderError as exc:
            return _back_to_integrations("error", str(exc))
        if state.get("purpose") == "agents":
            return agents_consented(request, user, connector, config, creds)
        _store(connector, config, creds)
        audit.record(  # SOC2:LOG-01 a credential was added
            "connector.connect",
            request=request,
            actor=user,
            target=connector,
            metadata={"provider": connector.provider, "department": connector.department},
        )
        return _back_to_integrations("connected")
```

`agents_consented` is Task 7's; until then add a stub right above the class so this task's tests run:

```python
def agents_consented(request, user, connector, config, creds):
    """Task 7 replaces this: the agents consent's return."""
    return _back_to_integrations("error", "Unknown connector.")
```

`_back_to_integrations` returns an `HttpResponseRedirect`; `oauth_browser.forget` works on it (it is an `HttpResponse`).

- [ ] **Step 6: The public routes**

In `.soc2/config.yml`, `public_routes`, after `"GET /api/v1/mail/oauth/<provider>/callback/"`:

```yaml
  - "GET /api/v1/connectors/oauth/<provider>/callback/"
  - "POST /api/v1/connectors/<id>/inbound/"
```

(Both were already `AllowAny` and missing from the list; the inbound webhook is authenticated by its own secret, API-11.)

- [ ] **Step 7: Run the tests and the connectors' own**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: PASS (no existing test drives the callback; `test_tickets.py` only checks that Slack sign-in is off in tests).

- [ ] **Step 8: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add core/oauth_browser.py services/connectors/views.py .soc2/config.yml services/connectors/tests/test_oauth_browser.py
git commit -m "fix(connectors): an OAuth link finishes only in the browser that started it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ticket sources' HTTP: answer headers, writes that got no answer, refusal details

**Files:**
- Modify: `services/connectors/providers/base.py`
- Test: `services/connectors/tests/test_http_call.py` (create)

**Interfaces:**
- Produces: `ProviderError(message, *, reauth=False, status=None, code="", body=None)` (`status`: HTTP status or None, `code`: a vendor's error code, `body`: the parsed JSON body of a refusal or None); `NoAnswer(ProviderError)`: a write went out and no answer came back; `http_call(method, url, *, headers=None, data=None, form=None, timeout=30, write=False) -> (dict, dict)` (body, lower-cased response headers); `http_json(...)` keeps its signature plus `write=False` and returns the body.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_http_call.py`:

```python
"""The ticket sources' one HTTP helper (agent bundles D3 §3, D3-13): answer
headers come back, a write with no answer is NoAnswer, a refusal keeps its
status and body. Nothing leaves the process: urlopen is patched."""

import io
import json
import urllib.error
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.connectors.providers.base import NoAnswer, ProviderError, http_call, http_json

URL = "https://slack.com/api/auth.test"


def answering(body, headers=None):
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = json.dumps(body).encode()
    response.headers.items.return_value = list((headers or {}).items())
    return response


class HttpCallTests(SimpleTestCase):
    def test_headers_come_back_lower_cased(self):
        with patch(
            "urllib.request.urlopen",
            return_value=answering({"ok": True}, {"X-OAuth-Scopes": "chat:write"}),
        ):
            body, headers = http_call("GET", URL)
        self.assertEqual((body, headers["x-oauth-scopes"]), ({"ok": True}, "chat:write"))

    def test_a_write_without_an_answer_is_no_answer(self):
        with patch("urllib.request.urlopen", side_effect=TimeoutError("read timed out")):
            with self.assertRaises(NoAnswer):
                http_json("POST", URL, data={}, write=True)

    def test_a_read_without_an_answer_is_a_plain_failure(self):
        with patch("urllib.request.urlopen", side_effect=TimeoutError("read timed out")):
            with self.assertRaises(ProviderError) as caught:
                http_json("GET", URL)
        self.assertNotIsInstance(caught.exception, NoAnswer)

    def test_a_request_that_never_left_is_a_plain_failure(self):
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("refused")):
            with self.assertRaises(ProviderError) as caught:
                http_json("POST", URL, data={}, write=True)
        self.assertNotIsInstance(caught.exception, NoAnswer)
        self.assertIsNone(caught.exception.status)

    def test_a_refusal_keeps_its_status_and_body(self):
        refusal = urllib.error.HTTPError(
            "https://acme.atlassian.net/rest/api/3/issue",
            400,
            "Bad Request",
            {},
            io.BytesIO(json.dumps({"errors": {"components": "Component/s is required."}}).encode()),
        )
        with patch("urllib.request.urlopen", side_effect=refusal):
            with self.assertRaises(ProviderError) as caught:
                http_json(
                    "POST", "https://acme.atlassian.net/rest/api/3/issue", data={}, write=True
                )
        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(
            caught.exception.body, {"errors": {"components": "Component/s is required."}}
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_http_call --parallel auto --noinput`
Expected: ERROR: `cannot import name 'NoAnswer'` / `'http_call'`.

- [ ] **Step 3: The helper**

In `services/connectors/providers/base.py`, add `import http.client` with the imports and replace `ProviderError` and `http_json`:

```python
class ProviderError(Exception):
    """The provider refused or failed; `reauth` says whether the admin
    must reconnect (revoked token) rather than retry. `status` is the HTTP
    status (None: no answer), `code` a vendor's own error code (Slack's
    `not_in_channel`), `body` a refusal's parsed JSON body."""

    def __init__(self, message, *, reauth=False, status=None, code="", body=None):
        super().__init__(message)
        self.reauth = reauth
        self.status = status
        self.code = code
        self.body = body


class NoAnswer(ProviderError):
    """A write went out and no answer came back: it may have happened
    (agent bundles D3-13). Never retried on its own; the next Retry looks first."""


def http_call(method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
    """One JSON round-trip: (body, lower-cased response headers). Raises
    ProviderError with the body's message; for a `write`, a timeout or a
    dropped connection after the request went out raises NoAnswer."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or not _host_allowed(parts.hostname):
        raise ProviderError(f"refusing to call {parts.hostname or url!r}: not a ticket source host")
    body = None
    headers = dict(headers or {})
    if form is not None:
        body = urllib.parse.urlencode(form).encode()
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif data is not None:
        body = json.dumps(data).encode()
        headers.setdefault("Content-Type", "application/json")
    headers.setdefault("Accept", "application/json")
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        # https only, host allow-listed above (semgrep: dynamic-urllib-use)
        with urllib.request.urlopen(request, timeout=timeout) as response:  # nosemgrep
            raw = response.read()
            answered = {str(k).lower(): v for k, v in response.headers.items()}
            return (json.loads(raw) if raw else {}), answered
    except urllib.error.HTTPError as exc:
        text = exc.read().decode(errors="replace")
        try:
            parsed = json.loads(text) if text else None
        except ValueError:
            parsed = None
        raise ProviderError(
            f"{exc.code} from {parts.netloc}: {text[:300]}",
            reauth=exc.code in (401, 403),
            status=exc.code,
            body=parsed if isinstance(parsed, dict) else None,
        ) from exc
    except urllib.error.URLError as exc:
        # Raised before the request was sent (no route, refused, DNS): nothing happened.
        raise ProviderError(f"could not reach {parts.netloc}: {exc.reason}") from exc
    except (TimeoutError, ConnectionError, http.client.HTTPException) as exc:
        if write:
            raise NoAnswer(f"{parts.netloc} did not answer: {type(exc).__name__}") from exc
        raise ProviderError(f"{parts.netloc} did not answer: {type(exc).__name__}") from exc
    except json.JSONDecodeError as exc:
        raise ProviderError(f"{parts.netloc} did not answer with JSON") from exc


def http_json(method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
    """One JSON round-trip; the body only (see http_call)."""
    return http_call(
        method, url, headers=headers, data=data, form=form, timeout=timeout, write=write
    )[0]
```

(`urllib.request.urlopen` wraps a failure while sending in `URLError`; a timeout while waiting for the answer reaches here as `TimeoutError`: that is the line between "nothing happened" and "maybe".)

- [ ] **Step 4: Run the tests and the connectors' own**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/providers/base.py services/connectors/tests/test_http_call.py
git commit -m "feat(connectors): answer headers, unanswered writes and refusal details

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: Slack: what the token may do, posting, finding a post

**Files:**
- Modify: `services/connectors/providers/slack.py`
- Modify: `services/connectors/views.py` (`_store`)
- Modify: `config/settings.py` (after `SLACK_OAUTH_CLIENT_SECRET`), `.env.example`
- Create: `services/connectors/tests/slack_fake.py`
- Test: `services/connectors/tests/test_slack_actions.py` (create)

**Interfaces:**
- Consumes: Task 4's `http_call`, `NoAnswer`, `ProviderError(status=, code=)`.
- Produces: `slack.ACT_SCOPES` (today's scopes plus `chat:write`); `slack.METADATA_TYPE = "revenact_step"`; `SlackProvider.connect(form, *, via="token") -> (config, creds)` whose config holds `channel`, `channel_name`, `team_id`, `bot_name`, `via`, `scopes` (list); `SlackProvider.authorize_url(state, redirect_uri, *, act=False)`; `SlackProvider.exchange_code(...)` (config `via="oauth"`, `scopes` from Slack's `scope`); `SlackProvider.granted_scopes(creds) -> list[str]`; `SlackProvider.post_message(creds, *, channel, text, thread_ts="", key) -> str` (the new message's `ts`; raises `ProviderError(code=<slack error>)` or `NoAnswer`); `SlackProvider.find_message(creds, *, channel, key, thread_ts="", oldest="") -> str | None`; `slack.message_url(channel, ts, thread_ts="") -> str`; `settings.AGENT_TOOL_TIMEOUT_SECONDS` (default 15). `views._store` moves `config["scopes"]` into `connector.granted_scopes`. Test side: `slack_fake.FakeSlackApi`, `slack_fake.use_slack(testcase, fake=None) -> FakeSlackApi`.

- [ ] **Step 1: The fake Slack**

Create `services/connectors/tests/slack_fake.py`:

```python
"""The Slack Web API in memory (agent bundles D3), standing in for the Slack
provider's `http_json` and `http_call`. It answers auth.test (with
X-OAuth-Scopes), conversations.info, oauth.v2.access, chat.postMessage,
conversations.replies, conversations.history and users.info, keeps every
post with its metadata, and can refuse or drop the next call to a method.
Nothing leaves the process."""

import json
import time
from urllib.parse import parse_qs, urlsplit

from services.connectors.providers.base import NoAnswer, ProviderError

BASE_SCOPES = (
    "channels:history",
    "channels:read",
    "groups:history",
    "groups:read",
    "users:read",
    "users:read.email",
    "reactions:read",
)


class FakeSlackApi:
    def __init__(self, *, scopes=BASE_SCOPES, team="T0ACME", bot="revenact"):
        self.scopes = list(scopes)
        self.team = team
        self.bot = bot
        #: channel id -> [message dicts], oldest first
        self.channels = {"C0SUPPORT": [], "C0ESCALATE": []}
        self.names = {"C0SUPPORT": "support", "C0ESCALATE": "escalations"}
        self.calls = []
        self._refuse = {}
        self._drop = set()
        # Posts are stamped from now, so a Retry's look-back window (D3-11) finds them.
        self._ts = int(time.time())

    # --- what a test scripts -------------------------------------------
    def refuse_next(self, method, error):
        """The next call to `method` answers {"ok": false, "error": error}."""
        self._refuse[method] = error

    def drop_next(self, method):
        """The next call to `method` is done, then its answer is lost (NoAnswer)."""
        self._drop.add(method)

    def posts(self, channel="C0SUPPORT"):
        return [m for m in self.channels.get(channel, []) if m.get("bot_id")]

    # --- the transports ---------------------------------------------------
    def __call__(self, method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
        return self.call(method, url, headers=headers, data=data, form=form, write=write)[0]

    def call(self, method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
        parts = urlsplit(url)
        name = parts.path.rsplit("/", 1)[-1]
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        body = data if data is not None else (form or {})
        self.calls.append((name, json.loads(json.dumps(body)), query))
        if name in self._refuse:
            return {"ok": False, "error": self._refuse.pop(name)}, {}
        answer, answered = self._route(name, query, body)
        if name in self._drop:
            self._drop.discard(name)
            raise NoAnswer(f"slack.com did not answer {name}")
        return answer, answered

    def _route(self, name, query, body):
        if name == "auth.test":
            return (
                {"ok": True, "team_id": self.team, "user": self.bot, "user_id": "U0BOT"},
                {"x-oauth-scopes": ",".join(self.scopes)},
            )
        if name == "conversations.info":
            channel = query.get("channel", "")
            if channel not in self.channels:
                return {"ok": False, "error": "channel_not_found"}, {}
            return {"ok": True, "channel": {"id": channel, "name": self.names[channel]}}, {}
        if name == "oauth.v2.access":
            return {
                "ok": True,
                "access_token": "xoxb-granted",
                "scope": ",".join(self.scopes),
                "team": {"id": self.team},
            }, {}
        if name == "chat.postMessage":
            channel = body["channel"]
            if channel not in self.channels:
                return {"ok": False, "error": "channel_not_found"}, {}
            self._ts += 1
            ts = f"{self._ts}.000100"
            message = {
                "ts": ts,
                "text": body["text"],
                "bot_id": "B0BOT",
                "metadata": body.get("metadata"),
            }
            if body.get("thread_ts"):
                message["thread_ts"] = body["thread_ts"]
            self.channels[channel].append(message)
            return {"ok": True, "channel": channel, "ts": ts}, {}
        if name in ("conversations.replies", "conversations.history"):
            channel = query.get("channel", "")
            oldest = float(query.get("oldest") or 0)
            thread = query.get("ts")
            rows = [
                m
                for m in self.channels.get(channel, [])
                if float(m["ts"]) >= oldest
                and (m.get("thread_ts") == thread if thread else not m.get("thread_ts"))
            ]
            if query.get("include_all_metadata") != "true":
                rows = [{k: v for k, v in m.items() if k != "metadata"} for m in rows]
            return {"ok": True, "messages": rows, "has_more": False}, {}
        if name == "users.info":
            return {
                "ok": True,
                "user": {"real_name": "Ann Lee", "profile": {"email": "ann@pizzahut.com"}},
            }, {}
        raise ProviderError(f"FakeSlackApi has no route for {name}")


def use_slack(testcase, fake=None):
    """`fake` (or a new FakeSlackApi) stands in for Slack for the rest of the test."""
    from unittest.mock import patch

    fake = fake or FakeSlackApi()
    for target, stand_in in (
        ("services.connectors.providers.slack.http_json", fake),
        ("services.connectors.providers.slack.http_call", fake.call),
    ):
        patcher = patch(target, stand_in)
        patcher.start()
        testcase.addCleanup(patcher.stop)
    return fake
```

- [ ] **Step 2: Write the failing tests**

Create `services/connectors/tests/test_slack_actions.py`:

```python
"""Slack for agent bundles D3 (contract §2.2, §5.3, D3-4, D3-11, D3-26):
what a token may do, a post with its key, finding it again. Slack is a fake."""

from django.test import SimpleTestCase, override_settings

from services.connectors.providers.base import NoAnswer, ProviderError
from services.connectors.providers.slack import (
    ACT_SCOPES,
    SlackProvider,
    message_url,
)
from services.connectors.tests.slack_fake import BASE_SCOPES, FakeSlackApi, use_slack

CREDS = {"bot_token": "xoxb-test"}


class SlackActionTests(SimpleTestCase):
    def setUp(self):
        self.api = use_slack(self, FakeSlackApi(scopes=[*BASE_SCOPES, "chat:write"]))
        self.slack = SlackProvider()

    def test_connect_records_the_team_the_bot_and_its_scopes(self):
        config, creds = self.slack.connect({"channel": "C0SUPPORT", "bot_token": "xoxb-test"})
        self.assertEqual(
            config,
            {
                "channel": "C0SUPPORT",
                "channel_name": "support",
                "team_id": "T0ACME",
                "bot_name": "revenact",
                "via": "token",
                "scopes": [*BASE_SCOPES, "chat:write"],
            },
        )
        self.assertEqual(creds, CREDS)

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_sign_in_records_what_slack_granted(self):
        config, _ = self.slack.exchange_code("code", "https://x/cb", {"channel": "C0SUPPORT"})
        self.assertEqual((config["via"], "chat:write" in config["scopes"]), ("oauth", True))
        url = self.slack.authorize_url("state", "https://x/cb", act=True)
        self.assertIn("chat%3Awrite", url)
        self.assertNotIn("chat%3Awrite", self.slack.authorize_url("state", "https://x/cb"))
        self.assertTrue(ACT_SCOPES.endswith(",chat:write"))

    def test_a_post_carries_its_key_and_is_found_again(self):
        ts = self.slack.post_message(
            CREDS,
            channel="C0SUPPORT",
            text="We're on it.",
            thread_ts="1760339999.000100",
            key="b12-s41",
        )
        sent = self.api.channels["C0SUPPORT"][-1]
        self.assertEqual(sent["thread_ts"], "1760339999.000100")
        self.assertEqual(
            sent["metadata"], {"event_type": "revenact_step", "event_payload": {"key": "b12-s41"}}
        )
        name, body, _ = next(c for c in self.api.calls if c[0] == "chat.postMessage")
        self.assertEqual((body["unfurl_links"], body["unfurl_media"]), (False, False))
        found = self.slack.find_message(
            CREDS,
            channel="C0SUPPORT",
            key="b12-s41",
            thread_ts="1760339999.000100",
            oldest="1760300000",
        )
        self.assertEqual(found, ts)
        self.assertIsNone(
            self.slack.find_message(
                CREDS, channel="C0SUPPORT", key="b12-s99", thread_ts="1760339999.000100"
            )
        )

    def test_a_top_level_post_is_found_in_the_channel(self):
        ts = self.slack.post_message(CREDS, channel="C0ESCALATE", text="Heads up.", key="b12-s42")
        self.assertEqual(self.slack.find_message(CREDS, channel="C0ESCALATE", key="b12-s42"), ts)

    def test_slacks_refusal_keeps_its_code(self):
        self.api.refuse_next("chat.postMessage", "not_in_channel")
        with self.assertRaises(ProviderError) as caught:
            self.slack.post_message(CREDS, channel="C0SUPPORT", text="Hi", key="k")
        self.assertEqual(caught.exception.code, "not_in_channel")
        self.assertFalse(caught.exception.reauth)
        self.api.refuse_next("chat.postMessage", "token_revoked")
        with self.assertRaises(ProviderError) as caught:
            self.slack.post_message(CREDS, channel="C0SUPPORT", text="Hi", key="k")
        self.assertTrue(caught.exception.reauth)

    def test_a_lost_answer_is_no_answer_and_the_post_happened(self):
        self.api.drop_next("chat.postMessage")
        with self.assertRaises(NoAnswer):
            self.slack.post_message(CREDS, channel="C0SUPPORT", text="Hi", key="b1-s2")
        self.assertIsNotNone(self.slack.find_message(CREDS, channel="C0SUPPORT", key="b1-s2"))

    def test_the_tokens_scopes_are_read_live(self):
        self.assertIn("chat:write", self.slack.granted_scopes(CREDS))

    def test_links(self):
        self.assertEqual(
            message_url("C0SUPPORT", "1760340001.000100"),
            "https://slack.com/archives/C0SUPPORT/p1760340001000100",
        )
        self.assertEqual(
            message_url("C0SUPPORT", "1760340001.000100", "1760339999.000100"),
            "https://slack.com/archives/C0SUPPORT/p1760340001000100"
            "?thread_ts=1760339999.000100&cid=C0SUPPORT",
        )

    def test_a_bots_message_is_never_a_ticket(self):
        self.api.channels["C0SUPPORT"] = [
            {"ts": "1760340001.000100", "user": "U1", "text": "Login is broken"},
            {"ts": "1760340002.000100", "user": "U0BOT", "bot_id": "B0BOT", "text": "On it"},
        ]
        tickets, _, _ = self.slack.fetch_tickets({"channel": "C0SUPPORT"}, CREDS, "")
        self.assertEqual([t.external_id for t in tickets], ["1760340001.000100"])
```

- [ ] **Step 3: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_actions --parallel auto --noinput`
Expected: ERROR: `cannot import name 'ACT_SCOPES'`.

- [ ] **Step 4: The provider**

In `config/settings.py`, after `SLACK_OAUTH_CLIENT_SECRET`:

```python
#: Agent bundles D3 (D3-21): how long a Slack or Jira call by an agent step waits.
AGENT_TOOL_TIMEOUT_SECONDS = env.int("AGENT_TOOL_TIMEOUT_SECONDS", default=15)
```

and in `.env.example`, next to the Slack keys: `AGENT_TOOL_TIMEOUT_SECONDS=15`.

In `services/connectors/providers/slack.py`: import `NoAnswer` and `http_call` from `.base` with the others, and after `SCOPES`:

```python
#: Agent bundles D3: what "Allow agents to act" asks Slack for (D3-9).
ACT_SCOPES = SCOPES + ",chat:write"
#: The metadata a post carries its idempotency key in (D3-11).
METADATA_TYPE = "revenact_step"
REAUTH_ERRORS = ("invalid_auth", "token_revoked", "account_inactive", "not_authed")


def message_url(channel, ts, thread_ts=""):
    """A message's page in Slack (the ticket URL's form)."""
    url = f"https://slack.com/archives/{channel}/p{ts.replace('.', '')}"
    return f"{url}?thread_ts={thread_ts}&cid={channel}" if thread_ts else url
```

Change `_call` to keep Slack's error code:

```python
    def _call(self, creds, method, **params):
        query = urlencode({k: v for k, v in params.items() if v not in (None, "")})
        data = http_json("GET", f"{API}/{method}?{query}", headers=self._headers(creds))
        if not data.get("ok"):
            error = data.get("error", "unknown_error")
            raise ProviderError(f"Slack: {error}", reauth=error in REAUTH_ERRORS, code=error)
        return data
```

Replace `connect`, `authorize_url`, `exchange_code` and add the new methods:

```python
def _auth_test(self, creds):
    """auth.test's answer and the token's scopes (Slack's X-OAuth-Scopes header)."""
    data, answered = http_call("GET", f"{API}/auth.test", headers=self._headers(creds))
    if not data.get("ok"):
        error = data.get("error", "unknown_error")
        raise ProviderError(f"Slack: {error}", reauth=error in REAUTH_ERRORS, code=error)
    scopes = [s.strip() for s in answered.get("x-oauth-scopes", "").split(",") if s.strip()]
    return data, scopes


def connect(self, form, *, via="token"):
    channel = self._channel(form)
    token = (form.get("bot_token") or "").strip()
    if not token:
        raise ProviderError("A bot token is required unless you sign in with Slack.")
    creds = {"bot_token": token}
    me, scopes = self._auth_test(creds)
    info = self._call(creds, "conversations.info", channel=channel)
    name = (info.get("channel") or {}).get("name", "")
    config = {
        "channel": channel,
        "channel_name": name,
        "team_id": me.get("team_id", ""),
        "bot_name": me.get("user", ""),
        "via": via,
        "scopes": scopes,
    }
    return config, creds


def authorize_url(self, state, redirect_uri, *, act=False):
    return "https://slack.com/oauth/v2/authorize?" + urlencode(
        {
            "client_id": settings.SLACK_OAUTH_CLIENT_ID,
            "scope": ACT_SCOPES if act else SCOPES,
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )


def exchange_code(self, code, redirect_uri, form):
    data = http_json(
        "POST",
        f"{API}/oauth.v2.access",
        form={
            "code": code,
            "client_id": settings.SLACK_OAUTH_CLIENT_ID,
            "client_secret": settings.SLACK_OAUTH_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
        },
    )
    if not data.get("ok") or not data.get("access_token"):
        raise ProviderError(f"Slack: {data.get('error', 'no token returned')}")
    config, creds = self.connect(
        {"channel": form.get("channel", ""), "bot_token": data["access_token"]}, via="oauth"
    )
    granted = [s.strip() for s in str(data.get("scope", "")).split(",") if s.strip()]
    if granted:
        config["scopes"] = granted
    return config, creds


def granted_scopes(self, creds):
    return self._auth_test(creds)[1]


def post_message(self, creds, *, channel, text, thread_ts="", key):
    """Post as the connector's bot, the step's key in the message's
    metadata (D3-11). The new message's ts; ProviderError with Slack's
    code; NoAnswer when the request went out and nothing came back."""
    body = {
        "channel": channel,
        "text": text,
        "unfurl_links": False,
        "unfurl_media": False,
        "metadata": {"event_type": METADATA_TYPE, "event_payload": {"key": key}},
    }
    if thread_ts:
        body["thread_ts"] = thread_ts
    data = http_json(
        "POST",
        f"{API}/chat.postMessage",
        headers={**self._headers(creds), "Content-Type": "application/json; charset=utf-8"},
        data=body,
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        write=True,
    )
    if not data.get("ok"):
        error = data.get("error", "unknown_error")
        raise ProviderError(f"Slack: {error}", reauth=error in REAUTH_ERRORS, code=error)
    return str(data["ts"])


def find_message(self, creds, *, channel, key, thread_ts="", oldest=""):
    """The ts of the message carrying `key` (the thread's replies, else the
    channel's top level) since `oldest`, or None (D3-11)."""
    method = "conversations.replies" if thread_ts else "conversations.history"
    page = self._call(
        creds,
        method,
        channel=channel,
        ts=thread_ts or None,
        oldest=oldest or None,
        include_all_metadata="true",
        limit=200,
    )
    for raw in page.get("messages", []):
        meta = raw.get("metadata") or {}
        if (
            meta.get("event_type") == METADATA_TYPE
            and (meta.get("event_payload") or {}).get("key") == key
        ):
            return str(raw.get("ts"))
    return None
```

In `fetch_tickets`, the skip line becomes:

```python
                if raw.get("subtype") or (raw.get("thread_ts") and raw["thread_ts"] != ts):
                    continue
                # D3-26: a bot's post (Revenact's own, say) is never a ticket.
                if raw.get("bot_id") or not raw.get("user") or not raw.get("text"):
                    continue
```

(and delete the old `if not raw.get("user") or not raw.get("text"):` line).

In `services/connectors/views.py`, `_store` keeps the scopes on the row, not in `config`:

```python
def _store(connector, config, creds):
    config = dict(config)
    connector.granted_scopes = list(config.pop("scopes", []))
    connector.config = config
    connector.set_credentials(creds)
    connector.status = Connector.Status.CONNECTED
    connector.error = ""
    connector.sync_cursor = ""
    connector.last_sync_note = ""
    connector.save()
```

- [ ] **Step 5: Run the tests and the connectors' own**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: PASS. (An existing Slack sync test that patches `http_json` with a stand-in for `auth.test` must now also stand in for `http_call`: point it at `slack_fake.use_slack` if it breaks.)

- [ ] **Step 6: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add config/settings.py .env.example services/connectors/providers/slack.py services/connectors/views.py services/connectors/tests/slack_fake.py services/connectors/tests/test_slack_actions.py
git commit -m "feat(connectors): Slack scopes, posting with a key, finding a post again

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Jira: permissions, pick lists, creating, finding and assigning an issue

**Files:**
- Modify: `services/connectors/providers/jira.py`
- Modify: `services/connectors/sync.py` (`file_ticket`)
- Create: `services/connectors/tests/jira_fake.py`
- Test: `services/connectors/tests/test_jira_actions.py` (create)

**Interfaces:**
- Consumes: Task 4's `http_json(write=)`, `NoAnswer`, `ProviderError(status=, body=)`; `settings.AGENT_TOOL_TIMEOUT_SECONDS`.
- Produces: `jira.LABEL_PREFIX = "revenact-"`; `JiraProvider.connect` config gains `account_name`; on `JiraProvider`: `my_permissions(config, creds, names) -> set[str]`, `projects(config, creds, query="") -> (list[dict], bool)`, `issue_types(config, creds, project) -> list[dict]` (sub-tasks left out), `priorities(config, creds) -> list[dict]`, `assignable(config, creds, *, project="", issue="", query="") -> list[dict]`, `user_by_email(config, creds, email) -> dict | None`, `myself(config, creds) -> dict`, `create_issue(config, creds, *, fields) -> str` (the key), `find_issue(config, creds, *, label) -> str | None`, `issue_assignee(config, creds, issue) -> str | None`, `assign_issue(config, creds, issue, account_id) -> None`; module functions `issue_url(config, key)`, `adf(text, footer="") -> dict`. Each list row is `{"id", "name", "detail"}` (contract §5.2). A synced issue with a `revenact-` label has `extra["made_here"] = True`. Test side: `jira_fake.FakeJiraApi`, `jira_fake.use_jira(testcase, fake=None)`.

- [ ] **Step 1: The fake Jira**

Create `services/connectors/tests/jira_fake.py`:

```python
"""Jira Cloud's REST API v3 in memory (agent bundles D3), standing in for the
Jira provider's `http_json`. It answers myself, mypermissions, project
search, create-meta issue types, priority search, assignable and user search,
issue create, JQL search (by label), issue read and assign, and can refuse
or drop the next call matching a path. Nothing leaves the process."""

import json
import re
from urllib.parse import parse_qs, unquote, urlsplit

from services.connectors.providers.base import NoAnswer, ProviderError


class FakeJiraApi:
    def __init__(self, host="acme.atlassian.net"):
        self.host = host
        self.permissions = {"CREATE_ISSUES", "ASSIGN_ISSUES", "BROWSE_PROJECTS"}
        self.projects = {"SUP": "Support", "ENG": "Engineering"}
        self.types = {
            "SUP": [
                {"id": "10001", "name": "Task", "subtask": False},
                {"id": "10002", "name": "Bug", "subtask": False},
                {"id": "10003", "name": "Sub-task", "subtask": True},
            ],
            "ENG": [{"id": "10002", "name": "Bug", "subtask": False}],
        }
        self.priority_list = [
            {"id": "2", "name": "High"},
            {"id": "3", "name": "Medium"},
            {"id": "4", "name": "Low"},
        ]
        self.users = [
            {
                "accountId": "acc-priya",
                "displayName": "Priya Shah",
                "emailAddress": "priya@acme.io",
                "active": True,
            },
            {
                "accountId": "acc-erin",
                "displayName": "Erin Eng",
                "emailAddress": "erin@acme.io",
                "active": True,
            },
            {
                "accountId": "acc-gone",
                "displayName": "Old Hand",
                "emailAddress": "",
                "active": False,
            },
        ]
        #: key -> {"fields": ..., "assignee": accountId or None}
        self.issues = {"SUP-12": {"fields": {"labels": []}, "assignee": None}}
        self.created = []
        self.assigned = []
        self.calls = []
        self._refuse = []
        self._drop = []
        self._next = 100

    def refuse_next(self, pattern, status, body=None):
        self._refuse.append((re.compile(pattern), status, body or {}))

    def drop_next(self, pattern):
        """The next call matching `pattern` is done, then its answer is lost."""
        self._drop.append(re.compile(pattern))

    def __call__(self, method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
        parts = urlsplit(url)
        path = parts.path
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        self.calls.append((method, path, query, json.loads(json.dumps(data)) if data else None))
        for n, (pattern, status, body) in enumerate(self._refuse):
            if pattern.search(f"{method} {path}"):
                self._refuse.pop(n)
                raise ProviderError(
                    f"{status} from {self.host}",
                    reauth=status in (401, 403),
                    status=status,
                    body=body,
                )
        answer = self._route(method, path, query, data or {})
        for n, pattern in enumerate(self._drop):
            if pattern.search(f"{method} {path}"):
                self._drop.pop(n)
                raise NoAnswer(f"{self.host} did not answer")
        return answer

    def _not_found(self):
        return ProviderError(
            f"404 from {self.host}", status=404, body={"errorMessages": ["Not found"]}
        )

    def _route(self, method, path, query, data):
        api = "/rest/api/3"
        if path == f"{api}/myself":
            return {
                "accountId": "acc-bot",
                "displayName": "Jira Bot",
                "emailAddress": "bot@acme.io",
            }
        if path == f"{api}/mypermissions":
            asked = query.get("permissions", "").split(",")
            return {"permissions": {p: {"havePermission": p in self.permissions} for p in asked}}
        if path == f"{api}/project/search":
            words = query.get("query", "").lower()
            rows = [
                {"id": str(n), "key": k, "name": v}
                for n, (k, v) in enumerate(self.projects.items())
                if words in v.lower() or words in k.lower()
            ]
            return {"values": rows, "isLast": True}
        found = re.fullmatch(rf"{api}/issue/createmeta/([A-Z0-9_]+)/issuetypes", path)
        if found:
            if found.group(1) not in self.types:
                raise self._not_found()
            return {"issueTypes": self.types[found.group(1)], "isLast": True}
        if path == f"{api}/priority/search":
            return {"values": self.priority_list, "isLast": True}
        if path == f"{api}/user/assignable/search":
            words = query.get("query", "").lower()
            return [
                u
                for u in self.users
                if words in u["displayName"].lower() or words in u["emailAddress"]
            ]
        if path == f"{api}/user/search":
            wanted = query.get("query", "").lower()
            return [u for u in self.users if u["emailAddress"] == wanted]
        if path == f"{api}/issue" and method == "POST":
            fields = data["fields"]
            if fields["project"]["key"] not in self.projects:
                raise ProviderError(
                    "400", status=400, body={"errors": {"project": "valid project is required"}}
                )
            self._next += 1
            key = f"{fields['project']['key']}-{self._next}"
            self.issues[key] = {
                "fields": fields,
                "assignee": (fields.get("assignee") or {}).get("accountId"),
            }
            self.created.append(key)
            return {
                "id": str(self._next),
                "key": key,
                "self": f"https://{self.host}{api}/issue/{key}",
            }
        if path == f"{api}/search/jql":
            label = re.fullmatch(r'labels = "([^"]+)"', data.get("jql", ""))
            keys = [
                k
                for k, v in self.issues.items()
                if label and label.group(1) in v["fields"].get("labels", [])
            ]
            return {"issues": [{"key": k} for k in keys], "isLast": True}
        assignee = re.fullmatch(rf"{api}/issue/([A-Z0-9_]+-\d+)/assignee", path)
        if assignee and method == "PUT":
            key = assignee.group(1)
            if key not in self.issues:
                raise self._not_found()
            self.issues[key]["assignee"] = data.get("accountId")
            self.assigned.append((key, data.get("accountId")))
            return {}
        issue = re.fullmatch(rf"{api}/issue/([A-Z0-9_]+-\d+)", path)
        if issue and method == "GET":
            key = unquote(issue.group(1))
            if key not in self.issues:
                raise self._not_found()
            who = self.issues[key]["assignee"]
            return {"key": key, "fields": {"assignee": {"accountId": who} if who else None}}
        raise AssertionError(f"FakeJiraApi has no route for {method} {path}")


def use_jira(testcase, fake=None):
    """`fake` (or a new FakeJiraApi) stands in for Jira for the rest of the test."""
    from unittest.mock import patch

    fake = fake or FakeJiraApi()
    patcher = patch("services.connectors.providers.jira.http_json", fake)
    patcher.start()
    testcase.addCleanup(patcher.stop)
    return fake
```

- [ ] **Step 2: Write the failing tests**

Create `services/connectors/tests/test_jira_actions.py`:

```python
"""Jira for agent bundles D3 (contract §2.3, §2.4, §5.2, §5.3, D3-5 to
D3-7, D3-11, D3-26). Jira is a fake."""

from django.test import SimpleTestCase

from services.connectors.providers.base import NoAnswer, ProviderError
from services.connectors.providers.jira import LABEL_PREFIX, JiraProvider, adf, issue_url
from services.connectors.tests.jira_fake import use_jira

CONFIG = {"host": "acme.atlassian.net", "project": "SUP"}
CREDS = {"email": "bot@acme.io", "api_token": "t"}


class JiraActionTests(SimpleTestCase):
    def setUp(self):
        self.api = use_jira(self)
        self.jira = JiraProvider()

    def test_connect_names_the_account(self):
        config, _ = self.jira.connect(
            {"site": "acme", "email": "bot@acme.io", "api_token": "t", "project": "sup"}
        )
        self.assertEqual(
            config, {"host": "acme.atlassian.net", "project": "SUP", "account_name": "Jira Bot"}
        )

    def test_permissions_are_checked_on_the_project(self):
        self.api.permissions = {"CREATE_ISSUES"}
        held = self.jira.my_permissions(CONFIG, CREDS, ("CREATE_ISSUES", "ASSIGN_ISSUES"))
        self.assertEqual(held, {"CREATE_ISSUES"})
        method, path, query, _ = self.api.calls[-1]
        self.assertEqual(query["projectKey"], "SUP")

    def test_the_pick_lists(self):
        projects, more = self.jira.projects(CONFIG, CREDS, "sup")
        self.assertEqual(
            (projects, more), ([{"id": "SUP", "name": "Support", "detail": "SUP"}], False)
        )
        self.assertEqual(
            self.jira.issue_types(CONFIG, CREDS, "SUP"),
            [
                {"id": "10001", "name": "Task", "detail": ""},
                {"id": "10002", "name": "Bug", "detail": ""},
            ],
        )
        self.assertEqual(
            self.jira.priorities(CONFIG, CREDS)[0], {"id": "2", "name": "High", "detail": ""}
        )
        self.assertEqual(
            self.jira.assignable(CONFIG, CREDS, project="SUP", query="p"),
            [{"id": "acc-priya", "name": "Priya Shah", "detail": "priya@acme.io"}],
        )
        self.assertEqual(
            self.jira.user_by_email(CONFIG, CREDS, "erin@acme.io")["accountId"], "acc-erin"
        )
        self.assertIsNone(self.jira.user_by_email(CONFIG, CREDS, "nobody@acme.io"))

    def test_create_find_and_assign(self):
        key = self.jira.create_issue(
            CONFIG,
            CREDS,
            fields={
                "project": {"key": "SUP"},
                "issuetype": {"id": "10002"},
                "summary": "Login loop after reset",
                "description": adf("Since Monday.", "Created by Carl CSM from Revenact."),
                "labels": [f"{LABEL_PREFIX}b12-s41"],
            },
        )
        self.assertEqual(self.jira.find_issue(CONFIG, CREDS, label=f"{LABEL_PREFIX}b12-s41"), key)
        self.assertIsNone(self.jira.find_issue(CONFIG, CREDS, label=f"{LABEL_PREFIX}b12-s99"))
        self.assertIsNone(self.jira.issue_assignee(CONFIG, CREDS, key))
        self.jira.assign_issue(CONFIG, CREDS, key, "acc-priya")
        self.assertEqual(self.jira.issue_assignee(CONFIG, CREDS, key), "acc-priya")
        self.assertEqual(issue_url(CONFIG, key), f"https://acme.atlassian.net/browse/{key}")

    def test_a_lost_create_is_no_answer_and_the_issue_exists(self):
        self.api.drop_next(r"POST /rest/api/3/issue$")
        with self.assertRaises(NoAnswer):
            self.jira.create_issue(
                CONFIG,
                CREDS,
                fields={
                    "project": {"key": "SUP"},
                    "issuetype": {"id": "10001"},
                    "summary": "S",
                    "labels": ["revenact-b1-s2"],
                },
            )
        self.assertIsNotNone(self.jira.find_issue(CONFIG, CREDS, label="revenact-b1-s2"))

    def test_a_refusal_keeps_jiras_errors(self):
        self.api.refuse_next(
            r"POST /rest/api/3/issue$", 400, {"errors": {"components": "Component/s is required."}}
        )
        with self.assertRaises(ProviderError) as caught:
            self.jira.create_issue(CONFIG, CREDS, fields={"project": {"key": "SUP"}})
        self.assertEqual(
            (caught.exception.status, caught.exception.body["errors"]),
            (400, {"components": "Component/s is required."}),
        )

    def test_adf_paragraphs_line_breaks_and_the_footer(self):
        self.assertEqual(
            adf("First line\nsecond line\n\nNew paragraph", "Created by Carl CSM from Revenact."),
            {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {"type": "text", "text": "First line"},
                            {"type": "hardBreak"},
                            {"type": "text", "text": "second line"},
                        ],
                    },
                    {"type": "paragraph", "content": [{"type": "text", "text": "New paragraph"}]},
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "Created by Carl CSM from Revenact."}],
                    },
                ],
            },
        )

    def test_an_issue_revenact_made_is_marked(self):
        made = self.jira._ticket(
            "acme.atlassian.net",
            {"key": "SUP-7", "fields": {"summary": "S", "labels": ["revenact-b1-s2"]}},
        )
        other = self.jira._ticket(
            "acme.atlassian.net",
            {"key": "SUP-8", "fields": {"summary": "S", "labels": ["customer"]}},
        )
        self.assertEqual((made.extra.get("made_here"), other.extra.get("made_here")), (True, None))
```

Add to `services/connectors/tests/test_tickets.py`, class `SyncTests` (its `Fixture` holds the CS Zendesk connector `self.zendesk`, Pizza Hut matched by `sam@pizzahut.com`, and `remote()` builds a `RemoteTicket`), the D3-26 test:

```python
    def test_an_issue_revenact_made_wakes_no_agent(self):
        from services.agents.models import SignalThread

        FakeProvider.queued = [remote(extra={"made_here": True})]
        self.assertEqual(self.run_sync(), {"created": 1, "updated": 0, "unmatched": 0})
        self.assertEqual(Ticket.objects.get().customer, self.pizza)
        self.assertFalse(SignalThread.objects.exists())
        FakeProvider.queued = [remote(extra={"made_here": True}, description="Changed words.")]
        self.run_sync()
        self.assertFalse(SignalThread.objects.exists())
```

- [ ] **Step 3: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_jira_actions services.connectors.tests.test_tickets --parallel auto --noinput`
Expected: ERROR: `cannot import name 'LABEL_PREFIX'`; the made-here ticket touches a thread.

- [ ] **Step 4: The provider**

In `services/connectors/providers/jira.py`: `from django.conf import settings`, import `quote, urlencode` from `urllib.parse`, add `"labels"` to `FIELDS` (`FIELDS = "summary,status,priority,assignee,reporter,created,updated,resolutiondate,description,labels"`), and:

```python
#: An issue an agent step made carries its key as a label (D3-11): `revenact-b12-s41`.
LABEL_PREFIX = "revenact-"
API = "/rest/api/3"


def issue_url(config, key):
    return f"https://{config['host']}/browse/{key}"


def adf(text, footer=""):
    """Plain text as Atlassian Document Format: a paragraph per blank-line
    block, a hard break per line, the footer as its own paragraph."""
    blocks = [b for b in (text or "").replace("\r\n", "\n").split("\n\n") if b.strip()]
    if footer:
        blocks.append(footer)
    content = []
    for block in blocks:
        parts = []
        for n, line in enumerate(block.strip().split("\n")):
            if n:
                parts.append({"type": "hardBreak"})
            if line:
                parts.append({"type": "text", "text": line})
        content.append({"type": "paragraph", "content": parts})
    return {"type": "doc", "version": 1, "content": content}


def _row(id_, name, detail=""):
    return {"id": str(id_), "name": str(name or "")[:255], "detail": str(detail or "")}
```

In `JiraProvider.connect`, return `{"host": host, "project": project, "account_name": (me.get("displayName") or "")[:150]}, creds`.

Add the methods (all reads through `self._read`, every write `write=True`):

```python
def _url(self, config, path, params=None):
    query = f"?{urlencode(params)}" if params else ""
    return f"https://{config['host']}{API}{path}{query}"


def _read(self, config, creds, path, params=None):
    return http_json(
        "GET",
        self._url(config, path, params),
        headers=self._headers(creds),
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
    )


def myself(self, config, creds):
    return self._read(config, creds, "/myself")


def my_permissions(self, config, creds, names):
    params = {"permissions": ",".join(names)}
    if config.get("project"):
        params["projectKey"] = config["project"]
    page = self._read(config, creds, "/mypermissions", params)
    held = page.get("permissions") or {}
    return {name for name in names if (held.get(name) or {}).get("havePermission")}


def projects(self, config, creds, query=""):
    page = self._read(config, creds, "/project/search", {"maxResults": 50, "query": query})
    rows = [_row(p["key"], p.get("name"), p["key"]) for p in page.get("values", [])]
    return rows, not page.get("isLast", True)


def issue_types(self, config, creds, project):
    page = self._read(
        config, creds, f"/issue/createmeta/{quote(project, safe='')}/issuetypes", {"maxResults": 50}
    )
    types = page.get("issueTypes") or page.get("values") or []
    return [_row(t["id"], t.get("name")) for t in types if not t.get("subtask")]


def priorities(self, config, creds):
    page = self._read(config, creds, "/priority/search", {"maxResults": 50})
    return [_row(p["id"], p.get("name")) for p in page.get("values", [])]


def assignable(self, config, creds, *, project="", issue="", query=""):
    params = {"maxResults": 20, "query": query}
    params.update({"issueKey": issue} if issue else {"project": project})
    users = self._read(config, creds, "/user/assignable/search", params)
    return [
        _row(u["accountId"], u.get("displayName"), u.get("emailAddress") or "")
        for u in users
        if u.get("active", True)
    ]


def user_by_email(self, config, creds, email):
    users = self._read(config, creds, "/user/search", {"query": email})
    wanted = (email or "").lower()
    return next(
        (
            u
            for u in users
            if (u.get("emailAddress") or "").lower() == wanted and u.get("active", True)
        ),
        None,
    )


def create_issue(self, config, creds, *, fields):
    """The new issue's key; NoAnswer when the request went out and nothing came back."""
    made = http_json(
        "POST",
        self._url(config, "/issue"),
        headers=self._headers(creds),
        data={"fields": fields},
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        write=True,
    )
    return str(made["key"])


def find_issue(self, config, creds, *, label):
    page = http_json(
        "POST",
        self._url(config, "/search/jql"),
        headers=self._headers(creds),
        data={"jql": f'labels = "{label}"', "fields": ["summary"], "maxResults": 1},
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
    )
    issues = page.get("issues") or []
    return str(issues[0]["key"]) if issues else None


def issue_assignee(self, config, creds, issue):
    found = self._read(config, creds, f"/issue/{quote(issue, safe='')}", {"fields": "assignee"})
    return ((found.get("fields") or {}).get("assignee") or {}).get("accountId")


def assign_issue(self, config, creds, issue, account_id):
    http_json(
        "PUT",
        self._url(config, f"/issue/{quote(issue, safe='')}/assignee"),
        headers=self._headers(creds),
        data={"accountId": account_id},
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        write=True,
    )
```

In `_ticket`, after reading `f`, mark Revenact's own issues and pass it on:

```python
        labels = f.get("labels") or []
        extra = {"made_here": True} if any(str(l).startswith(LABEL_PREFIX) for l in labels) else {}
```

and add `extra=extra` to the `RemoteTicket(...)` call.

- [ ] **Step 5: The sync leaves them alone**

In `services/connectors/sync.py`, `file_ticket`: the update branch's `if _new_words(before, existing):` becomes `if _new_words(before, existing) and not remote.extra.get("made_here"):`, and the create branch's `touch_ticket(ticket, first_seen=True)` becomes:

```python
    # D3-26: an issue an agent step made is filed but never wakes an agent.
    if not remote.extra.get("made_here"):
        touch_ticket(ticket, first_seen=True)
```

- [ ] **Step 6: Run the tests and the connectors' own**

Run: `$PY manage.py test services.connectors services.agents.tests.test_intake_run --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/providers/jira.py services/connectors/sync.py services/connectors/tests/jira_fake.py services/connectors/tests/test_jira_actions.py services/connectors/tests/test_tickets.py
git commit -m "feat(connectors): Jira permissions, pick lists, issues made, found and assigned

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: "Allow agents to act": the switch, Slack consent, the Jira check

**Files:**
- Modify: `services/connectors/views.py` (new `ConnectorAgentsView`, `agents_consented`, `_store_grant`)
- Modify: `services/connectors/urls.py`
- Test: `services/connectors/tests/test_agents_route.py` (create)

**Interfaces:**
- Consumes: Task 2's `agent_access`; Task 3's `start_oauth`, `OTHER_BROWSER`; Task 5's `SlackProvider.granted_scopes`, `authorize_url(act=True)`; Task 6's `JiraProvider.my_permissions`.
- Produces: `POST /api/v1/connectors/<id>/agents/` (contract §5.3), the consent's return (contract §5.4); audit `connector.agent_access`; `views.set_agents(request_or_user, connector, on) -> Connector`.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_agents_route.py`:

```python
"""Allow agents to act (agent bundles D3 contract §5.3, §5.4, D3-9, D3-22).
Slack and Jira are fakes."""

from urllib.parse import parse_qs, urlsplit

from django.test import override_settings
from rest_framework.test import APITestCase

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.connectors.models import Connector
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import BASE_SCOPES, FakeSlackApi, use_slack
from services.segments.tests.fixtures import person

AGENTS = "/api/v1/connectors/{}/agents/"
CALLBACK = "/api/v1/connectors/oauth/slack/callback/"


class AgentsRouteTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.admin = person(
            "alice@acme.io",
            "Alice Admin",
            cls.org,
            role=User.Role.ADMIN,
            function=User.Function.LEADERSHIP,
        )
        cls.csm = person("carl@acme.io", "Carl CSM", cls.org)

    def make(self, provider, *, via="token", config=None, **fields):
        made = Connector.objects.create(
            organisation=self.org,
            provider=provider,
            name=f"{provider} {Connector.objects.count()}",
            status=Connector.Status.CONNECTED,
            config=config
            or (
                {"channel": "C0SUPPORT", "channel_name": "support", "team_id": "T0ACME", "via": via}
                if provider == "slack"
                else {"host": "acme.atlassian.net", "project": "SUP", "account_name": "Jira Bot"}
            ),
            **fields,
        )
        made.set_credentials(
            {"bot_token": "xoxb-test"}
            if provider == "slack"
            else {"email": "bot@acme.io", "api_token": "t"}
        )
        made.save(update_fields=["credentials"])
        return made

    def post(self, connector, body, user=None):
        self.client.force_authenticate(user or self.admin)
        return self.client.post(AGENTS.format(connector.pk), body, format="json")

    def test_only_integration_managers_may_switch(self):
        slack = self.make("slack")
        self.assertEqual(self.post(slack, {"can_act": True}, self.csm).status_code, 403)

    def test_refusals(self):
        slack = self.make("slack")
        self.assertEqual(
            self.post(slack, {"can_act": "yes"}).json(), {"can_act": ["Choose on or off."]}
        )
        zendesk = self.make("zendesk", config={})
        self.assertEqual(
            self.post(zendesk, {"can_act": True}).json(),
            {"code": "NO_AGENT_KINDS", "detail": "Agents can't act in Zendesk yet."},
        )
        off = self.make("slack", is_enabled=False)
        self.assertEqual(
            self.post(off, {"can_act": True}).json(),
            {"code": "NOT_CONNECTED", "detail": "Connect Slack first."},
        )

    def test_a_token_that_can_post_switches_on(self):
        use_slack(self, FakeSlackApi(scopes=[*BASE_SCOPES, "chat:write"]))
        slack = self.make("slack")
        response = self.post(slack, {"can_act": True})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["agents"]["can_act"])
        event = AuditEvent.objects.get(action="connector.agent_access")
        self.assertEqual(
            {k: event.metadata[k] for k in ("provider", "can_act", "was")},
            {"provider": "slack", "can_act": True, "was": False},
        )

    def test_a_token_that_cant_post_is_told_what_to_do(self):
        use_slack(self)
        slack = self.make("slack")
        response = self.post(slack, {"can_act": True})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json(),
            {
                "code": "SLACK_SCOPE_MISSING",
                "detail": "This Slack token can't post. Add chat:write to the Slack app, "
                "reinstall it, then reconnect with the new token.",
            },
        )
        slack.refresh_from_db()
        self.assertFalse(slack.agents_can_act)

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_sign_in_asks_slack_for_consent_and_its_return_switches_on(self):
        api = use_slack(self)
        slack = self.make("slack", via="oauth")
        response = self.post(slack, {"can_act": True})
        self.assertEqual(response.status_code, 200, response.content)
        url = response.json()["authorize_url"]
        self.assertIn("chat%3Awrite", url)
        state = parse_qs(urlsplit(url).query)["state"][0]
        api.scopes = [*BASE_SCOPES, "chat:write"]
        self.client.force_authenticate(None)
        answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertIn("connector=agents_on", answer["Location"])
        slack.refresh_from_db()
        self.assertTrue(slack.agents_can_act)
        self.assertIn("chat:write", slack.granted_scopes)
        self.assertEqual(slack.agents_allowed_by, self.admin)

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_consent_from_another_slack_workspace_is_refused(self):
        api = use_slack(self)
        slack = self.make("slack", via="oauth")
        state = parse_qs(
            urlsplit(self.post(slack, {"can_act": True}).json()["authorize_url"]).query
        )["state"][0]
        api.team, api.scopes = "T0OTHER", [*BASE_SCOPES, "chat:write"]
        self.client.force_authenticate(None)
        answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertIn("connector=error", answer["Location"])
        self.assertIn("different+Slack+workspace", answer["Location"])
        slack.refresh_from_db()
        self.assertFalse(slack.agents_can_act)
        self.assertEqual(slack.get_credentials(), {"bot_token": "xoxb-test"})

    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_consent_without_chat_write_switches_nothing(self):
        use_slack(self)
        slack = self.make("slack", via="oauth")
        state = parse_qs(
            urlsplit(self.post(slack, {"can_act": True}).json()["authorize_url"]).query
        )["state"][0]
        self.client.force_authenticate(None)
        answer = self.client.get(CALLBACK, {"code": "c", "state": state})
        self.assertIn("didn%27t+grant+permission+to+post", answer["Location"])

    def test_jira_switches_on_with_create_and_assign(self):
        use_jira(self)
        jira = self.make("jira")
        response = self.post(jira, {"can_act": True})
        self.assertEqual(response.status_code, 200, response.content)
        jira.refresh_from_db()
        self.assertEqual(
            sorted(jira.granted_scopes), ["ASSIGN_ISSUES", "BROWSE_PROJECTS", "CREATE_ISSUES"]
        )

    def test_jira_without_permission_is_refused(self):
        api = use_jira(self)
        api.permissions = {"BROWSE_PROJECTS"}
        jira = self.make("jira")
        self.assertEqual(
            self.post(jira, {"can_act": True}).json(),
            {
                "code": "JIRA_CANT_ACT",
                "detail": "This Jira account can't create and assign issues in SUP. "
                "Give it those permissions in Jira, then try again.",
            },
        )

    def test_jira_refusing_the_login(self):
        api = use_jira(self)
        api.refuse_next(r"mypermissions", 401)
        jira = self.make("jira")
        self.assertEqual(
            self.post(jira, {"can_act": True}).json(),
            {
                "code": "RECONNECT",
                "detail": "Jira refused the login. Reconnect Jira, then try again.",
            },
        )

    def test_read_only_switches_off(self):
        slack = self.make(
            "slack",
            agents_can_act=True,
            granted_scopes=["chat:write"],
            agents_allowed_by=self.admin,
        )
        response = self.post(slack, {"can_act": False})
        self.assertEqual(response.status_code, 200)
        slack.refresh_from_db()
        self.assertEqual((slack.agents_can_act, slack.agents_allowed_by), (False, None))
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_agents_route --parallel auto --noinput`
Expected: FAIL: 404 on `/connectors/<id>/agents/`.

- [ ] **Step 3: The route**

In `services/connectors/views.py` add `from django.db import transaction`, `from django.utils import timezone`, `from . import agent_access` and:

```python
SCOPE_MISSING = (
    "This Slack token can't post. Add chat:write to the Slack app, reinstall it, then "
    "reconnect with the new token."
)
SLACK_RECONNECT = "Slack refused the token. Reconnect Slack, then try again."
JIRA_RECONNECT = "Jira refused the login. Reconnect Jira, then try again."
OTHER_WORKSPACE = "That's a different Slack workspace. Sign in to the one this connection reads."
NOT_GRANTED = "Slack didn't grant permission to post."


def _refusal(code, detail, status_code):
    return Response({"code": code, "detail": detail}, status=status_code)


def set_agents(actor, connector, on):
    """The switch, audited when it changes (D3-9). Returns the connector."""
    with transaction.atomic():
        fresh = Connector.objects.select_for_update().get(pk=connector.pk)
        was = fresh.agents_can_act
        fresh.agents_can_act = on
        fresh.agents_allowed_by = actor if on else None
        fresh.agents_allowed_at = timezone.now() if on else None
        fresh.granted_scopes = connector.granted_scopes
        fresh.save(
            update_fields=[
                "agents_can_act",
                "agents_allowed_by",
                "agents_allowed_at",
                "granted_scopes",
            ]
        )
        audit.record(  # SOC2:LOG-01 who let agents act through an outside tool
            "connector.agent_access",
            actor=actor,
            organisation=fresh.organisation,
            target=fresh,
            metadata={
                "provider": fresh.provider,
                "can_act": on,
                "was": was,
                "scopes": list(fresh.granted_scopes or []),
            },
        )
    return fresh


class ConnectorAgentsView(APIView):
    """POST /api/v1/connectors/<id>/agents/ {"can_act": bool} (agent bundles
    D3 contract §5.3): Read only, or Can act after the tool's grant is
    checked (Slack's chat:write, Jira's create and assign permissions)."""

    # SOC2:AUTH-02 an integration manager decides what agents may do outside
    permission_classes = [CanManageIntegrations]

    def post(self, request, pk):
        connector = _own_connector(request, pk)
        value = request.data.get("can_act") if isinstance(request.data, dict) else None
        if not isinstance(value, bool):
            return Response({"can_act": ["Choose on or off."]}, status=status.HTTP_400_BAD_REQUEST)
        label = connector.get_provider_display().replace(" Software", "")
        if not agent_access.kinds(connector):
            return _refusal("NO_AGENT_KINDS", f"Agents can't act in {label} yet.", 400)
        if not value:
            return self._answer(request, set_agents(request.user, connector, False))
        if not agent_access.usable(connector):
            return _refusal("NOT_CONNECTED", f"Connect {label} first.", 409)
        provider = _ticket_provider(connector)
        if connector.provider == Connector.Provider.SLACK:
            return self._slack(request, connector, provider)
        return self._jira(request, connector, provider)

    def _answer(self, request, connector):
        connector = with_ingested(
            Connector.objects.filter(pk=connector.pk).select_related("agents_allowed_by")
        ).get()
        return Response(ConnectorSerializer(connector, context={"request": request}).data)

    def _slack(self, request, connector, provider):
        try:
            connector.granted_scopes = provider.granted_scopes(connector.get_credentials())
        except ProviderError as exc:
            if exc.reauth or exc.status in (401, 403):
                return _refusal("RECONNECT", SLACK_RECONNECT, 409)
            return _refusal("TOOL_UNREACHABLE", "Couldn't reach Slack. Try again.", 502)
        if agent_access.SLACK_NEEDS in connector.granted_scopes:
            return self._answer(request, set_agents(request.user, connector, True))
        Connector.objects.filter(pk=connector.pk).update(granted_scopes=connector.granted_scopes)
        if agent_access.needs(connector) == "consent":
            form = {"channel": (connector.config or {}).get("channel", "")}
            return start_oauth(request, connector, provider, form, purpose="agents", act=True)
        return _refusal("SLACK_SCOPE_MISSING", SCOPE_MISSING, 409)

    def _jira(self, request, connector, provider):
        try:
            held = provider.my_permissions(
                connector.config, connector.get_credentials(), agent_access.JIRA_CHECKED
            )
        except ProviderError as exc:
            if exc.status in (401, 403):
                return _refusal("RECONNECT", JIRA_RECONNECT, 409)
            return _refusal("TOOL_UNREACHABLE", "Couldn't reach Jira. Try again.", 502)
        connector.granted_scopes = sorted(held)
        if set(agent_access.JIRA_NEEDS) <= held:
            return self._answer(request, set_agents(request.user, connector, True))
        Connector.objects.filter(pk=connector.pk).update(granted_scopes=connector.granted_scopes)
        where = (connector.config or {}).get("project") or "your projects"
        return _refusal(
            "JIRA_CANT_ACT",
            f"This Jira account can't create and assign issues in {where}. "
            "Give it those permissions in Jira, then try again.",
            409,
        )
```

Replace Task 3's stub `agents_consented` with:

```python
def _store_grant(connector, config, creds):
    """The consent's token and what Slack granted; the sync cursor is kept
    (a consent is not a new connection)."""
    config = dict(config)
    connector.granted_scopes = list(config.pop("scopes", []))
    kept = dict(connector.config or {})
    kept.update(
        {k: config[k] for k in ("team_id", "bot_name", "via", "channel_name") if k in config}
    )
    connector.config = kept
    connector.set_credentials(creds)
    connector.status = Connector.Status.CONNECTED
    connector.error = ""
    connector.save(update_fields=["config", "credentials", "granted_scopes", "status", "error"])


def agents_consented(request, user, connector, config, creds):
    """The agents consent came back (D3-22): the same Slack workspace, with
    chat:write, switches the connector on."""
    stored_team = (connector.config or {}).get("team_id")
    if stored_team and config.get("team_id") != stored_team:
        return _back_to_integrations("error", OTHER_WORKSPACE)
    if agent_access.SLACK_NEEDS not in (config.get("scopes") or []):
        return _back_to_integrations("error", NOT_GRANTED)
    _store_grant(connector, config, creds)
    set_agents(user, connector, True)
    return _back_to_integrations("agents_on")
```

In `services/connectors/urls.py`, after the `connect/` route:

```python
(path("<int:pk>/agents/", views.ConnectorAgentsView.as_view(), name="connector-agents"),)
```

- [ ] **Step 4: Run the tests and the connectors' own**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/views.py services/connectors/urls.py services/connectors/tests/test_agents_route.py
git commit -m "feat(connectors): allow agents to act, with Slack consent and the Jira check

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: A reply from the runner's own mailbox, and finding it again

**Files:**
- Modify: `services/mail/mime.py` (`Outgoing.headers`, `build`)
- Modify: `services/mail/providers/google.py` (`GoogleProvider.send`), `services/mail/providers/microsoft.py` (`send`, new `find_sent`)
- Modify: `services/mail/sync.py` (`send_email`: `cc`, `html`, `headers`)
- Modify: `services/mail/tests/gmail_fake.py` (`_store_raw` keeps `X-Revenact-Step`)
- Create: `services/mail/agent_send.py`
- Create: `services/mail/tests/graph_fake.py`
- Test: `services/mail/tests/test_agent_send.py` (create)

**Interfaces:**
- Produces: `mime.Outgoing.headers: dict` (extra headers written as given); `GoogleProvider.send(..., cc=(), html="", headers=None)`; `MicrosoftProvider.send(..., cc=(), headers=None)`; `MicrosoftProvider.find_sent(creds, *, header, value, since) -> (str | None, Credentials)`; `sync.send_email(connection, *, to, subject, body, cc=(), html="", headers=None, customer=None, account=None, answering=None)`; in `services/mail/agent_send.py`: `MARKER = "X-Revenact-Step"`, the sentences `CONNECT`, `RECONNECT`, `IMAP`, `GMAIL_EXPIRED`, `OUTLOOK_EXPIRED`, `REFUSED`, `BUSY`, `UNCONFIRMED`; `class Refused(Exception)` and `class Unconfirmed(Exception)` (each with `.sentence`); `SentReply(email_id, message_id, provider_id, threaded, address, provider)`; `blocked(connection) -> str | None`; `send(connection, *, source, to, cc, subject, body, key) -> SentReply`; `find(connection, *, key, since) -> SentReply | None`. Test side: `graph_fake.FakeGraph`, `graph_fake.use_graph(testcase, fake=None)`, `graph_fake.outlook_connection(user)`.

- [ ] **Step 1: The fakes**

In `services/mail/tests/gmail_fake.py`, `_store_raw`, after `full = gmail_message(...)` and before `self.add(full)`:

```python
        # Agent bundles D3: an agent reply's key header is kept, as Gmail keeps it.
        if parsed["X-Revenact-Step"]:
            full["payload"]["headers"].append(
                {"name": "X-Revenact-Step", "value": str(parsed["X-Revenact-Step"])}
            )
```

Create `services/mail/tests/graph_fake.py`:

```python
"""Microsoft Graph's mail routes in memory (agent bundles D3), standing in
for the Microsoft provider's `http_json`: sendMail (kept with its cc and
internetMessageHeaders) and Sent Items listed since a time. A test can
refuse or drop the next send. Nothing leaves the process."""

import time
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

from services.mail.models import MailboxConnection
from services.mail.providers.base import ProviderError, SendUnconfirmed

#: Far from expiry, so no test refreshes a token.
CREDENTIALS = {
    "access_token": "graph-token",
    "refresh_token": "r",
    "expires_at": time.time() + 10**8,
}


class FakeGraph:
    def __init__(self):
        self.sent = []
        self.calls = []
        self._refuse = None
        self._drop = False

    def refuse_next(self, status, *, reauth=False):
        self._refuse = (status, reauth)

    def drop_next(self):
        self._drop = True

    def __call__(
        self, method, url, *, headers=None, data=None, form=None, timeout=30, allowed_hosts=None
    ):
        parts = urlsplit(url)
        self.calls.append((method, parts.path))
        if parts.path.endswith("/me/sendMail"):
            if self._refuse:
                status, reauth = self._refuse
                self._refuse = None
                raise ProviderError(
                    f"{status} from graph.microsoft.com", reauth=reauth, status=status
                )
            message = data["message"]
            self.sent.append(
                {
                    "id": f"graph-{len(self.sent) + 1}",
                    "to": [r["emailAddress"]["address"] for r in message["toRecipients"]],
                    "cc": [r["emailAddress"]["address"] for r in message.get("ccRecipients", [])],
                    "subject": message["subject"],
                    "body": message["body"]["content"],
                    "internetMessageHeaders": message.get("internetMessageHeaders", []),
                    "sentDateTime": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )
            if self._drop:
                self._drop = False
                raise SendUnconfirmed("Graph did not answer")
            return {}
        if parts.path.endswith("/me/mailFolders/sentitems/messages"):
            query = {k: v[0] for k, v in parse_qs(parts.query).items()}
            since = query["$filter"].split(" ge ")[1]
            rows = [m for m in self.sent if m["sentDateTime"] >= since]
            return {
                "value": [
                    {"id": m["id"], "internetMessageHeaders": m["internetMessageHeaders"]}
                    for m in rows
                ]
            }
        raise AssertionError(f"FakeGraph has no route for {method} {parts.path}")


def use_graph(testcase, fake=None):
    from unittest.mock import patch

    fake = fake or FakeGraph()
    patcher = patch("services.mail.providers.microsoft.http_json", fake)
    patcher.start()
    testcase.addCleanup(patcher.stop)
    return fake


def outlook_connection(user):
    connection = MailboxConnection.objects.create(
        organisation=user.organisation,
        user=user,
        provider=MailboxConnection.Provider.MICROSOFT,
        address=user.email,
        display_name=user.name,
        credentials="",
    )
    connection.set_credentials(dict(CREDENTIALS))
    connection.save(update_fields=["credentials"])
    return connection
```

- [ ] **Step 2: Write the failing tests**

Create `services/mail/tests/test_agent_send.py`:

```python
"""An agent step's reply (agent bundles D3 contract §2.1, D3-1 to D3-3,
D3-11, D3-13): sent from the runner's own mailbox with the step's key,
threaded and signed where Gmail allows, and found again. Gmail and Graph
are fakes."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Email
from services.mail import agent_send
from services.mail.models import MailboxConnection, MailMessage
from services.mail.tests.gmail_fixtures import GmailFixture
from services.mail.tests.graph_fake import outlook_connection, use_graph


class AgentSendTests(GmailFixture):
    def source(self, connection, **fields):
        """A customer's email filed on Pizza Hut in `connection`'s mailbox."""
        values = {
            "customer": self.pizza,
            "subject": "Login loop",
            "sender_name": "Ann Lee",
            "recipient_name": connection.user.name,
            "body": "We can't log in.",
            "sent_at": timezone.now() - timedelta(hours=1),
            "mailbox": connection,
            "mailbox_owner": connection.user,
            "direction": Email.Direction.RECEIVED,
            "from_address": "ann@pizzahut.com",
            "to_addresses": [connection.address],
            "thread_id": "thread-1",
            "provider_message_id": "<m1@pizzahut.com>",
        }
        values.update(fields)
        return Email.objects.create(**values)

    def test_gmail_sends_with_the_key_the_signature_and_the_answering_headers(self):
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        connection.signature_html = "<div>Carl CSM<br>Acme</div>"
        connection.save(update_fields=["signature_html"])
        source = self.source(connection)
        sent = agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=["ops@pizzahut.com"],
            subject="Re: Login loop",
            body="We're on it.",
            key="b12-s41",
        )
        method, route, metadata, message = gmail.uploads[-1]
        self.assertEqual(message["X-Revenact-Step"], "b12-s41")
        self.assertEqual(message["In-Reply-To"], "<m1@pizzahut.com>")
        self.assertEqual(message["Cc"], "ops@pizzahut.com")
        html = message.get_body(("html",)).get_content()
        self.assertIn("Carl CSM<br>Acme", html)
        self.assertIn("We're on it.", message.get_body(("plain",)).get_content())
        # No mailbox copy of the source here: threaded for Ann by In-Reply-To, not by Gmail's threadId.
        self.assertEqual(
            (sent.address, sent.provider, sent.threaded), ("carl@acme.io", "google", False)
        )
        filed = Email.objects.get(pk=sent.email_id)
        self.assertEqual(
            (filed.direction, filed.customer_id), (Email.Direction.SENT, self.pizza.pk)
        )
        self.assertTrue(MailMessage.objects.filter(pk=sent.message_id, owner=self.carl).exists())

    def test_gmail_finds_a_reply_by_its_key(self):
        self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        source = self.source(connection)
        since = timezone.now() - timedelta(minutes=10)
        sent = agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=[],
            subject="Re: Login loop",
            body="Hi",
            key="b12-s41",
        )
        found = agent_send.find(connection, key="b12-s41", since=since)
        self.assertEqual(found.provider_id, sent.provider_id)
        self.assertIsNone(agent_send.find(connection, key="b12-s99", since=since))

    def test_outlook_sends_with_the_key_header_and_cc(self):
        graph = use_graph(self)
        connection = outlook_connection(self.carl)
        source = self.source(connection)
        since = timezone.now() - timedelta(minutes=10)
        sent = agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=["ops@pizzahut.com"],
            subject="Re: Login loop",
            body="Hi",
            key="b12-s41",
        )
        self.assertEqual(graph.sent[-1]["cc"], ["ops@pizzahut.com"])
        self.assertEqual(
            graph.sent[-1]["internetMessageHeaders"],
            [{"name": "x-revenact-step", "value": "b12-s41"}],
        )
        self.assertEqual((sent.provider, sent.threaded), ("microsoft", False))
        found = agent_send.find(connection, key="b12-s41", since=since)
        self.assertEqual(found.provider_id, "graph-1")

    def test_a_lost_answer_is_unconfirmed(self):
        graph = use_graph(self)
        connection = outlook_connection(self.carl)
        graph.drop_next()
        with self.assertRaises(agent_send.Unconfirmed) as caught:
            agent_send.send(
                connection,
                source=self.source(connection),
                to=["ann@pizzahut.com"],
                cc=[],
                subject="Re: x",
                body="Hi",
                key="k",
            )
        self.assertEqual(caught.exception.sentence, agent_send.UNCONFIRMED)

    def test_outlook_refusing_the_token_marks_the_mailbox(self):
        graph = use_graph(self)
        connection = outlook_connection(self.carl)
        graph.refuse_next(401, reauth=True)
        with self.assertRaises(agent_send.Refused) as caught:
            agent_send.send(
                connection,
                source=self.source(connection),
                to=["ann@pizzahut.com"],
                cc=[],
                subject="Re: x",
                body="Hi",
                key="k",
            )
        self.assertEqual(caught.exception.sentence, agent_send.OUTLOOK_EXPIRED)
        connection.refresh_from_db()
        self.assertEqual(connection.status, MailboxConnection.Status.ERROR)

    def test_gmail_losing_its_grant_pauses_the_mailbox(self):
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl)
        gmail.fail(r"/messages/send", 401, "invalid_grant", times=2)
        with self.assertRaises(agent_send.Refused) as caught:
            agent_send.send(
                connection,
                source=self.source(connection),
                to=["ann@pizzahut.com"],
                cc=[],
                subject="Re: x",
                body="Hi",
                key="k",
            )
        self.assertEqual(caught.exception.sentence, agent_send.GMAIL_EXPIRED)
        connection.refresh_from_db()
        self.assertEqual(connection.paused_reason, MailboxConnection.PausedReason.TOKEN_REVOKED)

    def test_who_cannot_send(self):
        self.assertEqual(agent_send.blocked(None), agent_send.CONNECT)
        imap = MailboxConnection(
            provider=MailboxConnection.Provider.IMAP, status=MailboxConnection.Status.CONNECTED
        )
        self.assertEqual(agent_send.blocked(imap), agent_send.IMAP)
        google = self.google(self.carl)
        self.assertIsNone(agent_send.blocked(google))
        google.granted_scopes = ["https://www.googleapis.com/auth/gmail.modify"]
        self.assertEqual(agent_send.blocked(google), agent_send.RECONNECT)
        google.status = MailboxConnection.Status.DISCONNECTED
        self.assertEqual(agent_send.blocked(google), agent_send.CONNECT)
```

(`GmailFixture` is `services/mail/tests/gmail_fixtures.py`'s, on `test_mail.Fixture`'s world: `self.carl` (carl@acme.io), `self.pizza` (pizzahut.com). `FakeGmail.fail(pattern, status, reason, times=)` fails the send and the refresh's retry alike.)

- [ ] **Step 3: Run them to see them fail**

Run: `$PY manage.py test services.mail.tests.test_agent_send --parallel auto --noinput`
Expected: ERROR: `No module named 'services.mail.agent_send'`.

- [ ] **Step 4: Headers, cc and HTML on the providers**

In `services/mail/mime.py`, add to `Outgoing` after `related`:

```python
    #: Extra headers written as given (agent bundles D3: X-Revenact-Step).
    headers: dict = field(default_factory=dict)
```

and in `build`, after `message["Date"] = ...`:

```python
    for name, value in (out.headers or {}).items():
        message[name] = value
```

In `services/mail/providers/google.py`, `GoogleProvider.send` gains `cc=(), html="", headers=None` (after `from_name=""`), and the `Outgoing(...)` it builds gains `cc=[["", address] for address in cc]`, `html=html`, `headers=dict(headers or {})`.

In `services/mail/providers/microsoft.py`, `send` becomes `def send(self, creds, *, to, subject, body, in_reply_to="", cc=(), headers=None):` and its `message` dict gains:

```python
                    "ccRecipients": [{"emailAddress": {"address": a}} for a in cc],
                    "internetMessageHeaders": [
                        {"name": name, "value": value} for name, value in (headers or {}).items()
                    ],
```

and add after `send`:

```python
    def find_sent(self, creds, *, header, value, since):
        """(Graph id of the Sent Items message carrying `header: value` since
        `since`, the credentials as refreshed). Agent bundles D3-11."""
        creds = self._fresh(creds)
        stamp = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        params = urlencode(
            {
                "$filter": f"sentDateTime ge {stamp}",
                "$select": "id,internetMessageHeaders",
                "$top": "25",
            }
        )
        page = http_json(
            "GET", f"{GRAPH}/me/mailFolders/sentitems/messages?{params}", headers=self._auth(creds)
        )
        for item in page.get("value", []):
            for pair in item.get("internetMessageHeaders") or []:
                if str(pair.get("name", "")).lower() == header and pair.get("value") == value:
                    return item.get("id"), creds
        return None, creds
```

In `services/mail/sync.py`, `send_email` becomes:

```python
def send_email(
    connection,
    *,
    to,
    subject,
    body,
    cc=(),
    html="",
    headers=None,
    customer=None,
    account=None,
    answering=None,
):
```

and the provider call becomes:

```python
    extra = send_kwargs(connection, in_reply_to, references, thread_id)
    if cc:
        extra["cc"] = list(cc)
    if html and connection.is_google:
        extra["html"] = html
    if headers:
        extra["headers"] = dict(headers)
    message = provider.send(creds, to=to, subject=subject, body=body, **extra)
```

and the `Email.objects.create(...)` line `to_addresses=[a.lower() for a in to][:50]` becomes `to_addresses=[a.lower() for a in [*to, *cc]][:50]`.

- [ ] **Step 5: The agent's send**

Create `services/mail/agent_send.py`:

```python
"""An agent step's reply, sent from the runner's own mailbox (agent bundles
D3 contract §2.1, D3-1 to D3-3, D3-11, D3-13).

Today's send path (`sync.send_email`: Gmail's MIME builder and threading
from Gmail D3, Graph's sendMail) carries the step's key in an
`X-Revenact-Step` header, the Gmail send-as signature, cc and the answering
headers. `find` looks the key up in the mailbox's sent mail since a time, so
a Retry never sends twice. IMAP can't be looked up reliably and never sends
for an agent. Every refusal is a plain sentence; no log line names a
recipient or a subject."""

import http.client
import logging
from dataclasses import dataclass

from . import gmail_sync, send_as
from . import html as html_mod
from .models import MailboxConnection, MailMessage
from .providers.base import RATE_LIMIT_REASONS, ProviderError, SendUnconfirmed
from .providers.microsoft import MicrosoftProvider
from .sync import _credentials, _store, answering_headers, send_email

logger = logging.getLogger(__name__)
C = MailboxConnection
MARKER = "X-Revenact-Step"
#: How many recent sent messages a Gmail lookup reads the headers of.
LOOK_LIMIT = 20

CONNECT = "Connect your mailbox to send this."
RECONNECT = "Reconnect your mailbox to send this."
IMAP = "Replies can't be sent from an IMAP mailbox yet."
GMAIL_EXPIRED = "Your Gmail connection expired. Reconnect it, then Retry."
OUTLOOK_EXPIRED = "Your Outlook connection expired. Reconnect it, then Retry."
REFUSED = "Your mailbox didn't accept the message. Retry it."
BUSY = "Your mailbox is busy. Retry in a minute."
UNCONFIRMED = "We couldn't confirm the email went out. Retry checks your Sent mail first."


class Refused(Exception):
    """Nothing was sent; `sentence` says why."""

    def __init__(self, sentence):
        super().__init__(sentence)
        self.sentence = sentence


class Unconfirmed(Exception):
    """It may have been sent: the next Retry looks first."""

    def __init__(self, sentence=UNCONFIRMED):
        super().__init__(sentence)
        self.sentence = sentence


@dataclass(frozen=True)
class SentReply:
    email_id: int | None
    message_id: int | None
    provider_id: str
    threaded: bool
    address: str
    provider: str


def blocked(connection):
    """Why this mailbox can't send an agent's reply, or None (contract §5.1)."""
    if connection is None or connection.status == C.Status.DISCONNECTED:
        return CONNECT
    if connection.provider == C.Provider.IMAP:
        return IMAP
    if connection.is_google and (not connection.two_way or connection.paused_reason):
        return RECONNECT
    if connection.status != C.Status.CONNECTED:
        return RECONNECT
    return None


def _bodies(connection, body):
    """(html, text): Gmail's send-as signature under the body (D3-3)."""
    if not connection.is_google:
        return "", body
    markup = html_mod.paragraphs(body)
    text = body
    if connection.signature_html:
        markup += send_as.signature_block(connection)
        signed = html_mod.to_text(connection.signature_html).strip()
        if signed:
            text = f"{body}\n\n-- \n{signed}"
    return markup, text


def _sentence(connection, exc):
    if connection.is_google:
        if gmail_sync.classify_failure(exc) != "backoff":
            gmail_sync.pause_revoked(connection, exc)
            return GMAIL_EXPIRED
        if exc.status == 429 or (exc.status == 403 and exc.reason in RATE_LIMIT_REASONS):
            return BUSY
        return REFUSED
    if exc.reauth:
        connection.status = C.Status.ERROR
        connection.error = str(exc)[:255]
        connection.save(update_fields=["status", "error", "updated_at"])
        return OUTLOOK_EXPIRED
    if exc.status == 429:
        return BUSY
    return REFUSED


def _reply(connection, email, provider_id):
    """A reply found again (D3-11): its filed copy and the owner's own copy, when held."""
    message = (
        MailMessage.objects.filter(connection=connection, provider_message_id=provider_id)
        .values_list("pk", flat=True)
        .first()
    )
    return SentReply(
        email_id=email.pk if email is not None else None,
        message_id=message,
        provider_id=provider_id,
        threaded=False,
        address=connection.address,
        provider=connection.provider,
    )


def send(connection, *, source, to, cc, subject, body, key):
    """Send `body` from `connection` answering `source` (a filed Email).
    Raises Refused or Unconfirmed."""
    markup, text = _bodies(connection, body)
    name = MARKER if connection.is_google else MARKER.lower()
    # Gmail threads it in place only when this mailbox holds the source (D3-3).
    threaded = bool(answering_headers(connection, email=source)[2])
    try:
        email = send_email(
            connection,
            to=list(to),
            cc=list(cc),
            subject=subject,
            body=text,
            html=markup,
            # SOC2:API-08 the step's idempotency key travels with the message
            headers={name: key},
            customer=source.customer,
            account=source.account,
            answering=source,
        )
    except (SendUnconfirmed, TimeoutError, ConnectionError, http.client.HTTPException):
        logger.warning("agent reply unconfirmed for connection %s", connection.pk)
        raise Unconfirmed() from None
    except ProviderError as exc:
        logger.warning("agent reply refused for connection %s: %s", connection.pk, exc.status)
        raise Refused(_sentence(connection, exc)) from None
    message = MailMessage.objects.filter(email=email).values_list("pk", flat=True).first()
    return SentReply(
        email_id=email.pk,
        message_id=message,
        provider_id=email.provider_message_id,
        threaded=threaded,
        address=connection.address,
        provider=connection.provider,
    )


def _marked(meta, key):
    headers = ((meta or {}).get("payload") or {}).get("headers") or []
    return any(
        str(h.get("name", "")).lower() == MARKER.lower() and h.get("value") == key for h in headers
    )


def find(connection, *, key, since):
    """The reply carrying `key` sent since `since`, or None (D3-11). Raises
    Refused when the mailbox can't be read."""
    from services.customers.models import Email

    if connection.is_google:
        session = gmail_sync.session_for(connection)
        try:
            page = session.list_messages(
                f"in:sent after:{int(since.timestamp())}", max_results=LOOK_LIMIT
            )
            for stub in page.get("messages") or []:
                if _marked(session.metadata(stub["id"], [MARKER]), key):
                    email = Email.objects.filter(
                        mailbox=connection, provider_message_id=stub["id"]
                    ).first()
                    return _reply(connection, email, stub["id"])
        except ProviderError as exc:
            raise Refused(_sentence(connection, exc)) from None
        finally:
            gmail_sync.keep_credentials(connection, session)
        return None
    creds = _credentials(connection)
    try:
        found, creds = MicrosoftProvider().find_sent(
            creds, header=MARKER.lower(), value=key, since=since
        )
    except ProviderError as exc:
        raise Refused(_sentence(connection, exc)) from None
    _store(connection, creds)
    connection.save(update_fields=["credentials", "address", "updated_at"])
    if found is None:
        return None
    email = Email.objects.filter(mailbox=connection, provider_message_id=found).first()
    return _reply(connection, email, found)
```

(Outlook's sent copy is filed by `send_email` under a `sent:<uuid>` id, so a found Graph id may file nothing yet: `email_id` is then None and the step's outputs simply lack it.)

- [ ] **Step 6: Run the tests and the mail app's own**

Run: `$PY manage.py test services.mail services.customers.tests --parallel auto --noinput`
Expected: PASS (today's send routes call `send_email` without the new keywords, unchanged).

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/mail/mime.py services/mail/providers/google.py services/mail/providers/microsoft.py services/mail/sync.py services/mail/agent_send.py services/mail/tests/gmail_fake.py services/mail/tests/graph_fake.py services/mail/tests/test_agent_send.py
git commit -m "feat(mail): an agent's reply from the runner's mailbox, with its key, found again

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: The outside facade, its fakes, keys and trail; a broken outside step keeps its attempt

**Files:**
- Create: `services/agents/outside/__init__.py`, `keys.py`, `tools.py`, `sentences.py`, `trail.py`, `offered.py`
- Modify: `services/agents/bundle_run.py` (`run_step`'s generic failure)
- Modify: `services/agents/evidence.py` (`Context`: four fields, defaults only)
- Modify: `services/agents/run.py` (`skip_reason`, the allowed kinds), `services/agents/intake.py` (`allowed_kinds`)
- Create: `services/agents/tests/outside_fakes.py`, `services/agents/tests/outside_fixtures.py`
- Test: `services/agents/tests/test_outside_tools.py` (create)

**Interfaces:**
- Consumes: Task 5's `SlackProvider.post_message`, `find_message`, `message_url`; Task 6's Jira methods, `issue_url`, `LABEL_PREFIX`; Task 8's `agent_send`.
- Produces (`services/agents/outside/tools.py`): `Refused(sentence)`, `Unconfirmed(sentence)`, `ListFailed(code, detail, status)`; `Mailed(email_id, message_id, provider_id, threaded, address, provider)`, `Posted(ts, url, channel)`, `Issue(key, url)`; `MailTool.send(connection, *, source, to, cc, subject, body, key) -> Mailed`, `MailTool.find(connection, *, key, since) -> Mailed | None`; `SlackTool.post(connector, *, channel, channel_name, text, thread_ts, key) -> Posted`, `SlackTool.find(connector, *, channel, channel_name, key, thread_ts, since) -> Posted | None`; `JiraTool.create(connector, *, fields, project) -> Issue`, `find(connector, *, label, project) -> Issue | None`, `assign(connector, *, issue, account_id, assignee_name) -> Issue`, `assignee(connector, *, issue) -> str | None`, `account_for(connector, *, email) -> dict | None` (`{"id", "name"}`), `issue_types(connector, project) -> list[dict]`, `priorities(connector) -> list[dict]`, `options(connector, name, *, project="", issue="", query="") -> (list[dict], bool)`; `Tools(mail, slack, jira)`, `current() -> Tools`, `using(tools)` (a context manager).
- Produces (`keys.py`): `LOOKBACK = timedelta(minutes=10)`, `key_for(step) -> "b<bundle>-s<step>"`, `jira_label(key) -> "revenact-<key>"`, `attempt(step, runner, now=None) -> {"attempted_at", "attempted_by"}` (the first attempt's kept), `since(step) -> datetime`, `retrying(step) -> bool`.
- Produces (`sentences.py`): the contract §6 sentences as constants and `slack(exc, channel) -> str`, `jira(exc, *, project="", issue="", assignee="") -> str`, `no_user(email)`, `no_types(project)`.
- Produces (`trail.py`): `call(step, actor, *, tool, op, outcome, where="", returned="")` writing `agent_outside.call`.
- Produces (`offered.py`): `offered(ctx) -> set[str]` (this task: always empty, so no outside kind reaches a model until Task 17).
- Produces (`evidence.Context`): `thread_email: dict | None`, `thread_ticket: dict | None`, `thread_channel: str | None`, `jira_connector: dict | None` (all None until Task 17 fills them).
- Produces (tests): `outside_fakes.FakeMail`, `FakeSlack`, `FakeJira`, `use_fakes(testcase) -> Tools`; `outside_fixtures.OutsideFixture` with `self.mail`, `self.slack`, `self.jira`, `slack_connector(...)`, `jira_connector(...)`, `gmail_for(user)`, `slack_thread(record, connector=None, ts=...)`, `jira_thread(record, connector=None, key="SUP-12")`, `outside_bundle(thread, *steps)`, `mail_payload(email, ...)`, `slack_payload(ticket, connector, ...)`, `jira_payload(connector, ...)`, `assign_payload(connector, issue, ...)`, `run_all_steps(user, bundle, fields=None)`, `retry(user, step, fields=None)`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_outside_tools.py`:

```python
"""The outside facade (agent bundles D3 contract §3, §6, D3-11, D3-14):
real tool classes against fake vendors, the contract's sentences, the key,
the look-back window and the trail. Nothing leaves the process."""

from datetime import datetime, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase
from django.utils import timezone

from core.models import AuditEvent
from services.agents.outside import keys, sentences, tools, trail
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.providers.base import ProviderError
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import BASE_SCOPES, FakeSlackApi, use_slack


class SentenceTests(SimpleTestCase):
    def test_slack(self):
        cases = {
            "not_in_channel": "Slack refused the post: the app isn't in #support.",
            "channel_not_found": "Slack can't find #support any more.",
            "is_archived": "Slack refused the post: #support is archived.",
            "missing_scope": "Allow Revenact to post in Slack, then Retry.",
            "token_revoked": "Your Slack connection expired. Reconnect it, then Retry.",
            "ratelimited": "Slack is busy. Retry in a minute.",
            "msg_too_long": "Slack refused the post: the message is too long.",
            "fatal_error": "Slack refused the post. Retry it.",
        }
        for code, sentence in cases.items():
            with self.subTest(code=code):
                self.assertEqual(
                    sentences.slack(ProviderError("x", code=code, status=200), "#support"), sentence
                )
        self.assertEqual(
            sentences.slack(ProviderError("x"), "#support"), "Couldn't reach Slack. Retry it."
        )

    def test_jira(self):
        def refused(status, body=None):
            return ProviderError("x", status=status, body=body)

        self.assertEqual(
            sentences.jira(refused(401), project="SUP"),
            "Jira refused the login. Reconnect Jira, then Retry.",
        )
        self.assertEqual(
            sentences.jira(refused(403), issue="SUP-12"),
            "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry.",
        )
        self.assertEqual(
            sentences.jira(refused(404), project="SUP"), "Jira can't find the project SUP."
        )
        self.assertEqual(sentences.jira(refused(404), issue="SUP-12"), "Jira can't find SUP-12.")
        self.assertEqual(
            sentences.jira(
                refused(400, {"errors": {"components": "Component/s is required."}}), project="SUP"
            ),
            "Jira says the project SUP needs a component.",
        )
        self.assertEqual(
            sentences.jira(
                refused(400, {"errors": {"customfield_10010": "Team is required."}}), project="SUP"
            ),
            "Jira says the project SUP needs another field.",
        )
        self.assertEqual(
            sentences.jira(
                refused(400, {"errors": {"assignee": "User cannot be assigned."}}),
                issue="SUP-12",
                assignee="Priya Shah",
            ),
            "Jira won't assign SUP-12 to Priya Shah.",
        )
        self.assertEqual(
            sentences.jira(
                refused(400, {"errorMessages": ["The summary is too long."]}), project="SUP"
            ),
            "Jira refused this: The summary is too long.",
        )
        self.assertEqual(
            sentences.jira(refused(None), project="SUP"), "Couldn't reach Jira. Retry it."
        )
        self.assertEqual(
            sentences.no_user("priya@acme.io"),
            "Jira has no user with priya@acme.io. Choose the assignee from Jira's list, then Retry.",
        )


class RealToolTests(OutsideFixture):
    def test_slack_tool_posts_finds_and_words_a_refusal(self):
        api = use_slack(self, FakeSlackApi(scopes=[*BASE_SCOPES, "chat:write"]))
        connector = self.slack_connector()
        tool = tools.SlackTool()
        posted = tool.post(
            connector,
            channel="C0SUPPORT",
            channel_name="#support",
            text="On it",
            thread_ts="1760339999.000100",
            key="b1-s2",
        )
        self.assertTrue(posted.url.startswith("https://slack.com/archives/C0SUPPORT/p"))
        since = timezone.now() - timedelta(hours=1)
        found = tool.find(
            connector,
            channel="C0SUPPORT",
            channel_name="#support",
            key="b1-s2",
            thread_ts="1760339999.000100",
            since=since,
        )
        self.assertEqual(found.ts, posted.ts)
        api.refuse_next("chat.postMessage", "not_in_channel")
        with self.assertRaises(tools.Refused) as caught:
            tool.post(
                connector,
                channel="C0SUPPORT",
                channel_name="#support",
                text="On it",
                thread_ts="",
                key="b1-s3",
            )
        self.assertEqual(
            caught.exception.sentence, "Slack refused the post: the app isn't in #support."
        )
        api.drop_next("chat.postMessage")
        with self.assertRaises(tools.Unconfirmed) as caught:
            tool.post(
                connector,
                channel="C0SUPPORT",
                channel_name="#support",
                text="On it",
                thread_ts="",
                key="b1-s4",
            )
        self.assertEqual(caught.exception.sentence, sentences.SLACK_UNCONFIRMED)

    def test_jira_tool_creates_finds_assigns_and_lists(self):
        api = use_jira(self)
        connector = self.jira_connector()
        tool = tools.JiraTool()
        issue = tool.create(
            connector,
            fields={
                "project": {"key": "SUP"},
                "issuetype": {"id": "10001"},
                "summary": "S",
                "labels": ["revenact-b1-s2"],
            },
            project="SUP",
        )
        self.assertEqual(issue.url, f"https://acme.atlassian.net/browse/{issue.key}")
        self.assertEqual(tool.find(connector, label="revenact-b1-s2", project="SUP").key, issue.key)
        self.assertEqual(
            tool.account_for(connector, email="priya@acme.io"),
            {"id": "acc-priya", "name": "Priya Shah"},
        )
        tool.assign(connector, issue=issue.key, account_id="acc-priya", assignee_name="Priya Shah")
        self.assertEqual(tool.assignee(connector, issue=issue.key), "acc-priya")
        rows, more = tool.options(connector, "jira_projects", query="")
        self.assertEqual(([r["id"] for r in rows], more), (["SUP", "ENG"], False))
        api.refuse_next(r"project/search", 401)
        with self.assertRaises(tools.ListFailed) as caught:
            tool.options(connector, "jira_projects")
        self.assertEqual(
            (caught.exception.code, caught.exception.detail, caught.exception.status),
            ("TOOL_REFUSED", "Jira refused the login. Reconnect Jira, then try again.", 409),
        )
        api.drop_next(r"POST /rest/api/3/issue$")
        with self.assertRaises(tools.Unconfirmed):
            tool.create(
                connector,
                fields={
                    "project": {"key": "SUP"},
                    "issuetype": {"id": "10001"},
                    "summary": "S",
                    "labels": [],
                },
                project="SUP",
            )


class KeyAndTrailTests(OutsideFixture):
    def test_the_key_the_window_and_the_attempt(self):
        _, thread = self.slack_thread(self.pizza)
        bundle = self.outside_bundle(thread, ("note.create", {"title": "T", "body": "B"}))
        step = bundle.steps.get()
        self.assertEqual(keys.key_for(step), f"b{bundle.pk}-s{step.pk}")
        self.assertEqual(keys.jira_label(keys.key_for(step)), f"revenact-b{bundle.pk}-s{step.pk}")
        first = keys.attempt(step, self.csm)
        step.result = first
        later = keys.attempt(step, self.admin)
        self.assertEqual(later, first)
        self.assertEqual(
            keys.since(step), datetime.fromisoformat(first["attempted_at"]) - keys.LOOKBACK
        )

    def test_the_trail_names_no_text(self):
        _, thread = self.slack_thread(self.pizza)
        bundle = self.outside_bundle(thread, ("note.create", {"title": "T", "body": "B"}))
        step = bundle.steps.get()
        trail.call(
            step,
            self.csm,
            tool="slack",
            op="post",
            outcome="ok",
            where="C0SUPPORT",
            returned="1760340001.000100",
        )
        event = AuditEvent.objects.get(action="agent_outside.call")
        self.assertEqual(
            event.metadata,
            {
                "kind": "note.create",
                "bundle": bundle.pk,
                "tool": "slack",
                "op": "post",
                "outcome": "ok",
                "where": "C0SUPPORT",
                "returned": "1760340001.000100",
                "key": f"b{bundle.pk}-s{step.pk}",
            },
        )
        self.assertEqual(event.actor, self.csm)


class AttemptKeptTests(OutsideFixture):
    def test_an_outside_step_that_breaks_keeps_its_attempt(self):
        import dataclasses

        from services.agents.registry import REGISTRY

        def explode(action, actor, **_):
            raise RuntimeError("boom")

        broken = dataclasses.replace(
            REGISTRY["note.create"], key="test.out", outside=True, irreversible=True, apply=explode
        )
        _, thread = self.slack_thread(self.pizza)
        with patch.dict(REGISTRY, {"test.out": broken}):
            bundle = self.outside_bundle(thread, ("test.out", {"title": "T", "body": "B"}))
            step = bundle.steps.get()
            self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "failed")
        self.assertEqual(step.error, "Something went wrong running this step. Retry it.")
        self.assertEqual(step.result["attempted_by"], self.csm.pk)
        self.assertIn("attempted_at", step.result)

    def test_nothing_outside_is_offered_yet(self):
        from services.agents.outside.offered import offered

        ctx, _ = self.thread_ctx(self.slack_thread(self.pizza)[1])
        self.assertEqual(offered(ctx), set())

    def test_every_other_kind_on_never_still_switches_an_agent_off(self):
        from services.agents.models import AgentPolicy
        from services.agents.policy import policy_for, profiles_for
        from services.agents.registry import REGISTRY, kinds_for
        from services.agents.run import skip_reason

        AgentPolicy.objects.update_or_create(
            organisation=self.org,
            defaults={
                "levels": {"cs": {k: "never" for k in kinds_for("cs") if not REGISTRY[k].outside}}
            },
        )
        profile = profiles_for(self.org)["cs"]
        self.assertEqual(
            skip_reason(self.org, profile, policy_for(self.org), self.today), "no_actions"
        )
```

(The last test passes today and must still pass once Task 11 registers an outside kind: it pins D3-28.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_outside_tools --parallel auto --noinput`
Expected: ERROR: `No module named 'services.agents.outside'`.

- [ ] **Step 3: Keys, sentences, trail, offered**

Create `services/agents/outside/__init__.py`:

```python
"""Agent steps that act outside Revenact (agent bundles delivery 3)."""
```

Create `services/agents/outside/keys.py`:

```python
"""An outside step's idempotency key and look-back window (agent bundles D3
contract D3-11). The key is the bundle and the step; a Retry looks for a
write carrying it since the step's first attempt, less a margin."""

from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from services.metrics.models import AgentAction

LOOKBACK = timedelta(minutes=10)


def key_for(step):
    # SOC2:API-08 one key per step, the same on every Retry
    return f"b{step.bundle_id}-s{step.pk}"


def jira_label(key):
    from services.connectors.providers.jira import LABEL_PREFIX

    return f"{LABEL_PREFIX}{key}"


def attempt(step, runner, now=None):
    """When the step was first tried and by whom; a later attempt keeps the first's."""
    result = step.result if isinstance(step.result, dict) else {}
    return {
        "attempted_at": result.get("attempted_at") or (now or timezone.now()).isoformat(),
        "attempted_by": result.get("attempted_by") or (runner.pk if runner is not None else None),
    }


def since(step):
    result = step.result if isinstance(step.result, dict) else {}
    first = parse_datetime(str(result.get("attempted_at") or ""))
    base = first or step.bundle.run_started_at or step.created_at
    return base - LOOKBACK


def retrying(step):
    """The step failed before: this run is a Retry, and it looks first."""
    return step.status == AgentAction.Status.FAILED
```

Create `services/agents/outside/sentences.py`:

```python
"""Vendor refusals as the contract's plain sentences (agent bundles D3
contract §6; spec §9): never a code, never a vendor's raw message except
Jira's own first sentence about a field."""

from services.mail.agent_send import UNCONFIRMED as MAIL_UNCONFIRMED  # noqa: F401 - one home per sentence

SLACK_EXPIRED = "Your Slack connection expired. Reconnect it, then Retry."
SLACK_ALLOW_RETRY = "Allow Revenact to post in Slack, then Retry."
SLACK_BUSY = "Slack is busy. Retry in a minute."
SLACK_OTHER = "Slack refused the post. Retry it."
SLACK_UNREACHABLE = "Couldn't reach Slack. Retry it."
SLACK_UNCONFIRMED = "We couldn't confirm the Slack post. Retry checks the channel first."
SLACK_BY_CODE = {
    "not_in_channel": "Slack refused the post: the app isn't in {channel}.",
    "channel_not_found": "Slack can't find {channel} any more.",
    "is_archived": "Slack refused the post: {channel} is archived.",
    "missing_scope": SLACK_ALLOW_RETRY,
    "not_allowed_token_type": SLACK_ALLOW_RETRY,
    "invalid_auth": SLACK_EXPIRED,
    "token_revoked": SLACK_EXPIRED,
    "account_inactive": SLACK_EXPIRED,
    "not_authed": SLACK_EXPIRED,
    "ratelimited": SLACK_BUSY,
    "msg_too_long": "Slack refused the post: the message is too long.",
}

JIRA_LOGIN = "Jira refused the login. Reconnect Jira, then Retry."
JIRA_BUSY = "Jira is busy. Retry in a minute."
JIRA_UNREACHABLE = "Couldn't reach Jira. Retry it."
JIRA_CREATE_UNCONFIRMED = "We couldn't confirm Jira made the issue. Retry checks Jira first."
JIRA_ASSIGN_UNCONFIRMED = "We couldn't confirm Jira assigned the issue. Retry checks Jira first."
JIRA_NO_PROJECT = "Choose a Jira project, then Retry."
JIRA_FIELDS = {
    "components": "a component",
    "duedate": "a due date",
    "fixVersions": "a fix version",
    "versions": "an affected version",
    "labels": "a label",
    "environment": "an environment",
    "reporter": "a reporter",
}
LIST_REFUSED = "Jira refused the login. Reconnect Jira, then try again."
LIST_UNREACHABLE = "Couldn't reach Jira. Try again."


def slack(exc, channel):
    """`exc` (a connectors ProviderError) for the channel named `channel` ("#support")."""
    if exc.status == 429:
        return SLACK_BUSY
    template = SLACK_BY_CODE.get(exc.code)
    if template:
        return template.format(channel=channel)
    if exc.status is None and not exc.code:
        return SLACK_UNREACHABLE
    return SLACK_OTHER


def jira(exc, *, project="", issue="", assignee=""):
    status = exc.status
    if status == 401:
        return JIRA_LOGIN
    if status == 403:
        return f"The Jira account can't do this in {issue or project}. Give it permission in Jira, then Retry."
    if status == 404:
        return f"Jira can't find {issue}." if issue else f"Jira can't find the project {project}."
    if status == 429:
        return JIRA_BUSY
    if status is None:
        return JIRA_UNREACHABLE
    body = exc.body if isinstance(exc.body, dict) else {}
    errors = body.get("errors") if isinstance(body.get("errors"), dict) else {}
    if "assignee" in errors and assignee:
        return f"Jira won't assign {issue or 'the issue'} to {assignee}."
    for field, message in errors.items():
        if "required" in str(message).lower():
            return (
                f"Jira says the project {project} needs {JIRA_FIELDS.get(field, 'another field')}."
            )
    first = next(iter(errors.values()), None) or next(iter(body.get("errorMessages") or []), "")
    if first:
        return f"Jira refused this: {str(first).strip().rstrip('.')[:200]}."
    return "Jira refused this. Retry it."


def no_user(email):
    return f"Jira has no user with {email}. Choose the assignee from Jira's list, then Retry."


def no_types(project):
    return f"Jira has no issue types to use in {project}."
```

Create `services/agents/outside/trail.py`:

```python
"""`agent_outside.call` (agent bundles D3 contract D3-14): who called which
tool for which step, where, what came back. Never text, names or recipients."""

from core import audit

from .keys import key_for


def call(step, actor, *, tool, op, outcome, where="", returned=""):
    audit.record(  # SOC2:LOG-01 an agent step's call to a tool outside Revenact
        "agent_outside.call",
        actor=actor,
        organisation=step.organisation,
        target=step,
        target_repr=f"Action {step.pk}",
        metadata={
            "kind": step.kind,
            "bundle": step.bundle_id,
            "tool": tool,
            "op": op,
            "outcome": outcome,
            "where": where,
            "returned": returned,
            "key": key_for(step),
        },
    )
```

Create `services/agents/outside/offered.py`:

```python
"""Which outside kinds a context may offer the model (agent bundles D3
contract D3-18). Until Task 17 of the D3 plan fills the context's thread and
Jira fields, nothing outside is offered."""


def offered(ctx):
    return set()
```

- [ ] **Step 4: The facade**

Create `services/agents/outside/tools.py`:

```python
"""The outside tools a step talks to (agent bundles D3 contract §3): one
small surface over the runner's mailbox (`services.mail.agent_send`), Slack
and Jira (the ticket connectors' providers), so the kinds never know a
vendor and tests swap in fakes (`services/agents/tests/outside_fakes.py`).
Every write either answers, or raises Refused (nothing happened; a plain
sentence) or Unconfirmed (it may have happened: the next Retry looks
first). The pick lists raise ListFailed with the route's code and status."""

from contextlib import contextmanager
from dataclasses import asdict, dataclass

from services.connectors.providers.base import NoAnswer, ProviderError

from . import sentences


class Refused(Exception):
    def __init__(self, sentence):
        super().__init__(sentence)
        self.sentence = sentence


class Unconfirmed(Exception):
    def __init__(self, sentence):
        super().__init__(sentence)
        self.sentence = sentence


class ListFailed(Exception):
    def __init__(self, code, detail, status):
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


@dataclass(frozen=True)
class Mailed:
    email_id: int | None
    message_id: int | None
    provider_id: str
    threaded: bool
    address: str
    provider: str


@dataclass(frozen=True)
class Posted:
    ts: str
    url: str
    channel: str


@dataclass(frozen=True)
class Issue:
    key: str
    url: str


class MailTool:
    def send(self, connection, *, source, to, cc, subject, body, key):
        from services.mail import agent_send

        try:
            sent = agent_send.send(
                connection, source=source, to=to, cc=cc, subject=subject, body=body, key=key
            )
        except agent_send.Unconfirmed as exc:
            raise Unconfirmed(exc.sentence) from None
        except agent_send.Refused as exc:
            raise Refused(exc.sentence) from None
        return Mailed(**asdict(sent))

    def find(self, connection, *, key, since):
        from services.mail import agent_send

        try:
            found = agent_send.find(connection, key=key, since=since)
        except agent_send.Refused as exc:
            raise Refused(exc.sentence) from None
        return None if found is None else Mailed(**asdict(found))


class SlackTool:
    def post(self, connector, *, channel, channel_name, text, thread_ts, key):
        from services.connectors.providers.slack import SlackProvider, message_url

        try:
            ts = SlackProvider().post_message(
                connector.get_credentials(),
                channel=channel,
                text=text,
                thread_ts=thread_ts,
                key=key,
            )
        except NoAnswer:
            raise Unconfirmed(sentences.SLACK_UNCONFIRMED) from None
        except ProviderError as exc:
            raise Refused(sentences.slack(exc, channel_name)) from None
        return Posted(ts=ts, url=message_url(channel, ts, thread_ts), channel=channel)

    def find(self, connector, *, channel, channel_name, key, thread_ts, since):
        from services.connectors.providers.slack import SlackProvider, message_url

        try:
            ts = SlackProvider().find_message(
                connector.get_credentials(),
                channel=channel,
                key=key,
                thread_ts=thread_ts,
                oldest=f"{since.timestamp():.6f}",
            )
        except ProviderError as exc:
            raise Refused(sentences.slack(exc, channel_name)) from None
        return (
            None
            if ts is None
            else Posted(ts=ts, url=message_url(channel, ts, thread_ts), channel=channel)
        )


class JiraTool:
    @staticmethod
    def _jira():
        from services.connectors.providers.jira import JiraProvider

        return JiraProvider()

    def create(self, connector, *, fields, project):
        from services.connectors.providers.jira import issue_url

        try:
            key = self._jira().create_issue(
                connector.config, connector.get_credentials(), fields=fields
            )
        except NoAnswer:
            raise Unconfirmed(sentences.JIRA_CREATE_UNCONFIRMED) from None
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, project=project)) from None
        return Issue(key=key, url=issue_url(connector.config, key))

    def find(self, connector, *, label, project):
        from services.connectors.providers.jira import issue_url

        try:
            key = self._jira().find_issue(
                connector.config, connector.get_credentials(), label=label
            )
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, project=project)) from None
        return None if key is None else Issue(key=key, url=issue_url(connector.config, key))

    def assign(self, connector, *, issue, account_id, assignee_name):
        from services.connectors.providers.jira import issue_url

        try:
            self._jira().assign_issue(
                connector.config, connector.get_credentials(), issue, account_id
            )
        except NoAnswer:
            raise Unconfirmed(sentences.JIRA_ASSIGN_UNCONFIRMED) from None
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, issue=issue, assignee=assignee_name)) from None
        return Issue(key=issue, url=issue_url(connector.config, issue))

    def assignee(self, connector, *, issue):
        try:
            return self._jira().issue_assignee(connector.config, connector.get_credentials(), issue)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, issue=issue)) from None

    def account_for(self, connector, *, email):
        try:
            user = self._jira().user_by_email(connector.config, connector.get_credentials(), email)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc)) from None
        return (
            None if user is None else {"id": user["accountId"], "name": user.get("displayName", "")}
        )

    def issue_types(self, connector, project):
        try:
            return self._jira().issue_types(connector.config, connector.get_credentials(), project)
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, project=project)) from None

    def priorities(self, connector):
        try:
            return self._jira().priorities(connector.config, connector.get_credentials())
        except ProviderError as exc:
            raise Refused(sentences.jira(exc)) from None

    def options(self, connector, name, *, project="", issue="", query=""):
        """A pick list (contract §5.2): (rows, more). Raises ListFailed."""
        jira, config, creds = self._jira(), connector.config, connector.get_credentials()
        try:
            if name == "jira_projects":
                return jira.projects(config, creds, query)
            if name == "jira_issue_types":
                return jira.issue_types(config, creds, project), False
            if name == "jira_priorities":
                return jira.priorities(config, creds), False
            return jira.assignable(config, creds, project=project, issue=issue, query=query), False
        except ProviderError as exc:
            if exc.status in (401, 403):
                raise ListFailed("TOOL_REFUSED", sentences.LIST_REFUSED, 409) from None
            raise ListFailed("TOOL_UNREACHABLE", sentences.LIST_UNREACHABLE, 502) from None


@dataclass
class Tools:
    mail: object
    slack: object
    jira: object


_current = Tools(MailTool(), SlackTool(), JiraTool())


def current():
    return _current


@contextmanager
def using(tools):
    """`tools` stand in for the real ones until the block ends (tests, the e2e journey)."""
    global _current
    was, _current = _current, tools
    try:
        yield tools
    finally:
        _current = was
```

- [ ] **Step 5: A broken outside step keeps its attempt; the context's fields; nothing offered yet**

In `services/agents/bundle_run.py`, add after `_fail`:

```python
def _attempt_of(step_id, runner):
    """D3-12: an outside step that broke anywhere keeps when it was first
    tried and by whom, so the next Retry looks back far enough."""
    from .outside.keys import attempt

    step = AgentAction.objects.filter(pk=step_id).only("kind", "result").first()
    spec = REGISTRY.get(step.kind) if step is not None else None
    if spec is None or not spec.outside:
        return None
    return attempt(step, runner)
```

and in `run_step`, the generic branch becomes:

```python
    except Exception as exc:  # noqa: BLE001 - one step never stops the others (§5.1)
        return _fail(
            step_id,
            runner,
            _sentence(exc),
            error_class=type(exc).__name__,
            result=_attempt_of(step_id, runner),
        )
```

In `services/agents/evidence.py`, `Context`, after `thread_id`:

```python
    #: Agent bundles D3 (contract D3-18), filled by Task 17 of the D3 plan:
    #: the thread's newest customer email a reply answers, its ticket (Slack,
    #: Jira), its own channel ("email" or "ticket"), and the workspace's Jira
    #: connector ({"id", "project"}) a Jira step goes through.
    thread_email: dict | None = None
    thread_ticket: dict | None = None
    thread_channel: str | None = None
    jira_connector: dict | None = None
```

In `services/agents/run.py`: `skip_reason`'s Never test leaves outside kinds out (they are always Ask, D3-28):

```python
    inside = [kind for kind in kinds_for(profile.kind) if not REGISTRY[kind].outside]
    if all(level(prefs, profile.kind, kind) == NEVER for kind in inside):
        return "no_actions"
```

and in `run()`, the allowed kinds are worked out after the context, keeping only the outside kinds it offers:

```python
        ctx = evidence_.build(organisation, agent, today=today)
        can = offered(ctx)
        allowed = [
            kind
            for kind in kinds_for(agent)
            if level(prefs, agent, kind) != NEVER and (not REGISTRY[kind].outside or kind in can)
        ]
```

(delete the old `allowed = ...` line above `ctx = ...`; import `from .outside.offered import offered`).

In `services/agents/intake.py`, `allowed_kinds`:

```python
def allowed_kinds(prefs, agent, ctx):
    """The agent's record-level kinds not on Never; a draft reply only where
    the context has a source it may answer (D2-14); an outside kind only
    where the context offers it (D3-18)."""
    from .outside.offered import offered

    can = offered(ctx)
    allowed = []
    for kind in kinds_for(agent):
        spec = REGISTRY[kind]
        if spec.workspace_level or level(prefs, agent, kind) == NEVER:
            continue
        if spec.outside and kind not in can:
            continue
        if kind == AgentAction.Kind.DRAFT_REPLY and not (ctx.emails or ctx.tickets):
            continue
        allowed.append(kind)
    # D3-28: outside kinds are always Ask; an agent with every other kind on Never is off.
    return allowed if any(not REGISTRY[kind].outside for kind in allowed) else []
```

- [ ] **Step 6: The fakes and the fixture**

Create `services/agents/tests/outside_fakes.py`:

```python
"""In-memory stand-ins for the outside facade (agent bundles D3): the
runner's mailbox, Slack and Jira. Each keeps what it was asked to do, can
refuse or lose the answer of its next write, and finds a write by its key.
`use_fakes(testcase)` installs them for the rest of the test. Nothing is
ever sent."""

from services.agents.outside import sentences, tools


class FakeMail:
    def __init__(self):
        self.sent, self.lookups = [], []
        self._refuse, self._drop = None, False

    def refuse_next(self, sentence):
        self._refuse = sentence

    def drop_next(self):
        self._drop = True

    def _made(self, connection, n, threaded=False):
        return tools.Mailed(
            email_id=None,
            message_id=900 + n,
            provider_id=f"fake-{n}",
            threaded=threaded,
            address=connection.address,
            provider=connection.provider,
        )

    def send(self, connection, *, source, to, cc, subject, body, key):
        if self._refuse:
            sentence, self._refuse = self._refuse, None
            raise tools.Refused(sentence)
        self.sent.append(
            {
                "mailbox": connection.pk,
                "source": source.pk,
                "to": list(to),
                "cc": list(cc),
                "subject": subject,
                "body": body,
                "key": key,
            }
        )
        made = self._made(connection, len(self.sent), threaded=source.mailbox_id == connection.pk)
        if self._drop:
            self._drop = False
            raise tools.Unconfirmed(sentences.MAIL_UNCONFIRMED)
        return made

    def find(self, connection, *, key, since):
        self.lookups.append(key)
        for n, row in enumerate(self.sent, start=1):
            if row["key"] == key and row["mailbox"] == connection.pk:
                return self._made(connection, n)
        return None


class FakeSlack:
    def __init__(self):
        self.posts, self.lookups = [], []
        self._refuse, self._drop = None, False

    def refuse_next(self, sentence):
        self._refuse = sentence

    def drop_next(self):
        self._drop = True

    def post(self, connector, *, channel, channel_name, text, thread_ts, key):
        if self._refuse:
            sentence, self._refuse = self._refuse, None
            raise tools.Refused(sentence)
        ts = f"{1760340000 + len(self.posts) + 1}.000100"
        self.posts.append(
            {
                "connector": connector.pk,
                "channel": channel,
                "text": text,
                "thread_ts": thread_ts,
                "key": key,
                "ts": ts,
            }
        )
        posted = tools.Posted(
            ts=ts,
            url=f"https://slack.com/archives/{channel}/p{ts.replace('.', '')}",
            channel=channel,
        )
        if self._drop:
            self._drop = False
            raise tools.Unconfirmed(sentences.SLACK_UNCONFIRMED)
        return posted

    def find(self, connector, *, channel, channel_name, key, thread_ts, since):
        self.lookups.append(key)
        for row in self.posts:
            if row["key"] == key and row["channel"] == channel:
                return tools.Posted(
                    ts=row["ts"],
                    url=f"https://slack.com/archives/{channel}/p{row['ts'].replace('.', '')}",
                    channel=channel,
                )
        return None


class FakeJira:
    def __init__(self):
        self.issues = {"SUP-12": {"fields": {}, "assignee": None}}
        self.created, self.assigned, self.lookups = [], [], []
        self.users = {
            "priya@acme.io": {"id": "acc-priya", "name": "Priya Shah"},
            "erin@acme.io": {"id": "acc-erin", "name": "Erin Eng"},
        }
        self.types = {
            "SUP": [
                {"id": "10001", "name": "Task", "detail": ""},
                {"id": "10002", "name": "Bug", "detail": ""},
            ]
        }
        self.priority_rows = [
            {"id": "2", "name": "High", "detail": ""},
            {"id": "3", "name": "Medium", "detail": ""},
            {"id": "4", "name": "Low", "detail": ""},
        ]
        self._refuse, self._drop, self._lists = {}, set(), None
        self._next = 100

    def refuse_next(self, op, sentence):
        """The next `op` ("create", "assign", "assignee", "find") is refused."""
        self._refuse[op] = sentence

    def drop_next(self, op):
        self._drop.add(op)

    def fail_lists(self, code, detail, status):
        self._lists = tools.ListFailed(code, detail, status)

    def _refused(self, op):
        if op in self._refuse:
            raise tools.Refused(self._refuse.pop(op))

    def _url(self, connector, key):
        return f"https://{connector.config['host']}/browse/{key}"

    def create(self, connector, *, fields, project):
        self._refused("create")
        self._next += 1
        key = f"{project}-{self._next}"
        self.issues[key] = {
            "fields": fields,
            "assignee": (fields.get("assignee") or {}).get("accountId"),
        }
        self.created.append(key)
        if "create" in self._drop:
            self._drop.discard("create")
            raise tools.Unconfirmed(sentences.JIRA_CREATE_UNCONFIRMED)
        return tools.Issue(key=key, url=self._url(connector, key))

    def find(self, connector, *, label, project):
        self._refused("find")
        self.lookups.append(label)
        for key, issue in self.issues.items():
            if label in issue["fields"].get("labels", []):
                return tools.Issue(key=key, url=self._url(connector, key))
        return None

    def assign(self, connector, *, issue, account_id, assignee_name):
        self._refused("assign")
        self.issues.setdefault(issue, {"fields": {}, "assignee": None})["assignee"] = account_id
        self.assigned.append((issue, account_id))
        if "assign" in self._drop:
            self._drop.discard("assign")
            raise tools.Unconfirmed(sentences.JIRA_ASSIGN_UNCONFIRMED)
        return tools.Issue(key=issue, url=self._url(connector, issue))

    def assignee(self, connector, *, issue):
        self._refused("assignee")
        return (self.issues.get(issue) or {}).get("assignee")

    def account_for(self, connector, *, email):
        return self.users.get(email)

    def issue_types(self, connector, project):
        return list(self.types.get(project, []))

    def priorities(self, connector):
        return list(self.priority_rows)

    def options(self, connector, name, *, project="", issue="", query=""):
        if self._lists is not None:
            failed, self._lists = self._lists, None
            raise failed
        if name == "jira_projects":
            return [
                {"id": "SUP", "name": "Support", "detail": "SUP"},
                {"id": "ENG", "name": "Engineering", "detail": "ENG"},
            ], False
        if name == "jira_issue_types":
            return self.issue_types(connector, project), False
        if name == "jira_priorities":
            return self.priorities(connector), False
        words = query.lower()
        rows = [
            {"id": u["id"], "name": u["name"], "detail": email}
            for email, u in self.users.items()
            if words in u["name"].lower()
        ]
        return rows, False


def use_fakes(testcase):
    """FakeMail, FakeSlack and FakeJira stand in for the tools for the rest of the test."""
    fakes = tools.Tools(FakeMail(), FakeSlack(), FakeJira())
    block = tools.using(fakes)
    block.__enter__()
    testcase.addCleanup(block.__exit__, None, None, None)
    return fakes
```

Create `services/agents/tests/outside_fixtures.py`:

```python
"""Outside steps' tests' world (agent bundles D3): IntakeFixture's people and
book (Carl `self.csm` owns Pizza Hut and reports to Mona; Alice `self.admin`
is an admin with view-all and Leadership; Dana `self.other`; Erin
`self.erin` in Engineering), with the outside tools replaced by fakes,
Slack and Jira connectors that can (or can't) act, Gmail mailboxes, Slack
and Jira threads, and bundles holding outside steps. Nothing is ever sent."""

from unittest.mock import patch

from services.agents.registry import REGISTRY
from services.agents.tests.intake_fixtures import IntakeFixture
from services.agents.tests.outside_fakes import use_fakes
from services.connectors.models import Connector
from services.customers.models import Ticket
from services.mail.models import MailboxConnection

RUN = "/api/v1/agents/bundles/{}/run/"
RETRY = "/api/v1/agents/bundles/{}/steps/{}/retry/"


class OutsideFixture(IntakeFixture):
    def setUp(self):
        super().setUp()
        self.fakes = use_fakes(self)
        self.mail, self.slack, self.jira = self.fakes.mail, self.fakes.slack, self.fakes.jira
        credits = patch("services.agents.policy.plan_credits", return_value=3000)
        credits.start()
        self.addCleanup(credits.stop)

    def slack_connector(
        self, *, department="cs", channel="C0SUPPORT", name="support", can_act=True
    ):
        made = self.connector("slack", department=department)
        made.config = {
            "channel": channel,
            "channel_name": name,
            "team_id": "T0ACME",
            "bot_name": "revenact",
            "via": "token",
        }
        made.status = Connector.Status.CONNECTED
        made.granted_scopes = (
            ["channels:history", "chat:write"] if can_act else ["channels:history"]
        )
        made.agents_can_act = can_act
        made.save()
        return made

    def jira_connector(self, *, department="engineering", project="SUP", can_act=True):
        made = self.connector("jira", department=department)
        made.config = {"host": "acme.atlassian.net", "project": project, "account_name": "Jira Bot"}
        made.status = Connector.Status.CONNECTED
        made.granted_scopes = ["CREATE_ISSUES", "ASSIGN_ISSUES"] if can_act else []
        made.agents_can_act = can_act
        made.save()
        return made

    def gmail_for(self, user):
        """`user`'s own two-way Gmail, replacing any mailbox they had."""
        from services.mail.tests.gmail_fixtures import google_connection

        MailboxConnection.objects.filter(user=user).delete()
        return google_connection(user)

    def slack_thread(self, record, connector=None, ts="1760339999.000100"):
        connector = connector or self.slack_connector()
        ticket, thread = self.ticket_thread(
            record,
            connector=connector,
            number=f"SL-{ts.replace('.', '')[-8:]}",
            title="Nobody can log in",
            description="Nobody can log in since the password reset.",
        )
        Ticket.objects.filter(pk=ticket.pk).update(external_id=ts)
        ticket.refresh_from_db()
        return ticket, thread

    def jira_thread(self, record, connector=None, key="SUP-12"):
        connector = connector or self.jira_connector()
        return self.ticket_thread(
            record,
            connector=connector,
            number=key,
            title="Export fails",
            description="Large exports time out.",
        )

    def outside_bundle(self, thread, *steps):
        """A waiting message bundle on `thread` holding (kind, payload) steps,
        each with `before` as its kind reads it now."""
        bundle = self.message_bundle(thread)
        for kind, payload in steps:
            step = self.step(thread.record, kind=kind, payload=payload, bundle=bundle)
            step.before = REGISTRY[kind].current(step)
            step.save(update_fields=["before"])
        return bundle

    @staticmethod
    def mail_payload(email, *, body="We're on it: the fix ships Friday.", to=None, cc=()):
        return {
            "email_id": email.pk,
            "mailbox_id": email.mailbox_id,
            "to": list(to or [email.from_address]),
            "cc": list(cc),
            "subject": f"Re: {email.subject}",
            "body": body,
        }

    @staticmethod
    def slack_payload(ticket, connector, *, text="We're on it: the fix ships Friday."):
        return {
            "ticket_id": ticket.pk,
            "source_connector_id": connector.pk,
            "connector_id": connector.pk,
            "channel": connector.config["channel"],
            "channel_name": connector.config["channel_name"],
            "thread_ts": ticket.external_id,
            "text": text,
        }

    @staticmethod
    def jira_payload(
        connector, *, summary="Login loop after password reset", member=None, project="SUP"
    ):
        return {
            "connector_id": connector.pk,
            "project": project,
            "issue_type": {"id": "", "name": "Task"},
            "summary": summary,
            "description": "Since Monday nobody can log in after a reset.",
            "priority": {"id": "", "name": "High"},
            "assignee": None,
            "assignee_member_id": member,
        }

    @staticmethod
    def assign_payload(connector, issue, *, member=None, account=None):
        return {
            "connector_id": connector.pk,
            "issue": issue,
            "assignee": account,
            "assignee_member_id": member,
        }

    def run_all_steps(self, user, bundle, fields=None):
        rows = []
        for step in bundle.steps.filter(status="proposed").order_by("position"):
            row = {"id": step.pk, "selected": True}
            if fields and step.pk in fields:
                row["fields"] = fields[step.pk]
            rows.append(row)
        return self.client_for(user).post(RUN.format(bundle.pk), {"steps": rows}, format="json")

    def retry(self, user, step, fields=None):
        return self.client_for(user).post(
            RETRY.format(step.bundle_id, step.pk),
            {"fields": fields} if fields else {},
            format="json",
        )
```

- [ ] **Step 7: Run the tests and the agents' own**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 8: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside services/agents/bundle_run.py services/agents/evidence.py services/agents/run.py services/agents/intake.py services/agents/tests/outside_fakes.py services/agents/tests/outside_fixtures.py services/agents/tests/test_outside_tools.py
git commit -m "feat(agents): the outside tools' facade, its fakes, keys and audit trail

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: A blocked step says why and links to the setting; result links; reject by rights

**Files:**
- Create: `services/agents/outside/gates.py`
- Modify: `services/agents/bulk.py` (`Bulk.__init__`: connectors, member names; `mailbox`)
- Modify: `services/agents/bundle_payloads.py` (`_disabled`, `step_payload`, `_one`, new `links_for`)
- Test: `services/agents/tests/test_outside_gates.py` (create)

**Interfaces:**
- Consumes: Task 2's `agent_access`; Task 8's `agent_send.blocked`; Task 9's fixture.
- Produces: `gates.LINK = "/settings/connections"`, the §5.1 sentences as constants (`SLACK_GONE`, `SLACK_RECONNECT`, `SLACK_ALLOW`, `SLACK_ASK`, `JIRA_GONE`, `JIRA_RECONNECT`, `JIRA_ALLOW`, `JIRA_ASK`), `Blocked(sentence, link=LINK)`, `mailbox_of(user)`, `connector_of(step, key="connector_id")`, `channel_name(connector) -> "#support"`, `may_read(user, connector) -> bool`, `blocked(step, reader) -> Blocked | None`; `bulk.Bulk.connectors` ({id: Connector}), `Bulk.mailbox(user)`; `bundle_payloads.links_for(step, reader) -> list[dict]`; the step payload's `disabled_link` and `links`; `can_reject` by rights (contract §4.1, §4.2, D3-10, D3-16).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_outside_gates.py`:

```python
"""A step whose tool can't be used shows why, links to Settings ›
Connections, and doesn't stop a reject (agent bundles D3 contract §4,
§5.1, D3-10, D3-16). The kinds here are test stand-ins until Tasks 11-14."""

import dataclasses
from unittest.mock import patch

from services.agents import bulk
from services.agents.bundle_payloads import bundle_payload, links_for
from services.agents.outside import gates
from services.agents.registry import REGISTRY
from services.agents.tests.outside_fixtures import OutsideFixture
from services.mail.models import MailboxConnection

SLACKISH = dataclasses.replace(
    REGISTRY["note.create"], key="slack.reply", outside=True, irreversible=True
)
JIRAISH = dataclasses.replace(
    REGISTRY["note.create"], key="jira.create", outside=True, irreversible=True
)
MAILISH = dataclasses.replace(
    REGISTRY["note.create"], key="mail.send_reply", outside=True, irreversible=True
)


class GateTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        patcher = patch.dict(
            REGISTRY, {"slack.reply": SLACKISH, "jira.create": JIRAISH, "mail.send_reply": MAILISH}
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def bundle_with(self, kind, payload):
        _, thread = self.slack_thread(self.pizza)
        return self.outside_bundle(thread, (kind, {"title": "T", "body": "B", **payload}))

    def step_of(self, bundle, reader):
        return bundle_payload(bundle, reader)["steps"][0]

    def test_slack_read_only_asks_an_admin(self):
        connector = self.slack_connector(can_act=False)
        bundle = self.bundle_with("slack.reply", {"connector_id": connector.pk})
        carl = self.step_of(bundle, self.csm)
        self.assertEqual(
            (carl["can_run"], carl["disabled_reason"], carl["disabled_link"]),
            (False, "Ask an admin to allow Revenact to post in Slack.", "/settings/connections"),
        )
        alice = self.step_of(bundle, self.admin)
        self.assertEqual(alice["disabled_reason"], "Allow Revenact to post in Slack.")

    def test_a_blocked_step_still_lets_its_owner_reject(self):
        connector = self.slack_connector(can_act=False)
        bundle = self.bundle_with("slack.reply", {"connector_id": connector.pk})
        payload = bundle_payload(bundle, self.csm)
        self.assertEqual((payload["can_run"], payload["can_reject"]), (False, True))

    def test_jira_gone_disconnected_and_allowed(self):
        connector = self.jira_connector()
        bundle = self.bundle_with("jira.create", {"connector_id": connector.pk})
        self.assertIsNone(self.step_of(bundle, self.csm)["disabled_reason"])
        connector.status = "error"
        connector.save(update_fields=["status"])
        self.assertEqual(
            self.step_of(bundle, self.csm)["disabled_reason"], "Reconnect Jira to do this."
        )
        connector.delete()
        self.assertEqual(
            self.step_of(bundle, self.csm)["disabled_reason"],
            "The Jira connection this uses is gone.",
        )

    def test_mail_needs_the_readers_own_mailbox(self):
        bundle = self.bundle_with("mail.send_reply", {})
        MailboxConnection.objects.filter(user=self.csm).delete()
        self.assertEqual(
            self.step_of(bundle, self.csm)["disabled_reason"], "Connect your mailbox to send this."
        )
        self.gmail_for(self.csm)
        self.assertIsNone(self.step_of(bundle, self.csm)["disabled_reason"])

    def test_a_moved_slack_step_needs_its_channels_department(self):
        engineering = self.slack_connector(
            department="engineering", channel="C0ESCALATE", name="escalations"
        )
        bundle = self.bundle_with("slack.reply", {"connector_id": engineering.pk})
        self.assertEqual(
            self.step_of(bundle, self.csm)["disabled_reason"], "You can't post in #escalations."
        )

    def test_links_are_the_servers(self):
        _, thread = self.slack_thread(self.pizza)
        bundle = self.outside_bundle(thread, ("note.create", {"title": "T", "body": "B"}))
        step = bundle.steps.get()
        step.status = "applied"
        step.kind = "jira.create"
        step.outputs = {
            "ticket_key": "SUP-123",
            "ticket_url": "https://acme.atlassian.net/browse/SUP-123",
        }
        self.assertEqual(
            links_for(step, self.csm),
            [
                {
                    "label": "Open SUP-123 in Jira",
                    "url": "https://acme.atlassian.net/browse/SUP-123",
                    "external": True,
                }
            ],
        )
        step.kind = "task.create"
        step.outputs = {"task_id": 7, "task_url": "/work/mine?task=7"}
        self.assertEqual(
            links_for(step, self.csm),
            [{"label": "Open task", "url": "/work/mine?task=7", "external": False}],
        )
        step.kind = "mail.send_reply"
        step.outputs, step.result = (
            {},
            {"message_id": 41, "provider": "google", "sent_by": self.csm.pk},
        )
        self.assertEqual(
            links_for(step, self.csm),
            [
                {
                    "label": "Open the sent email",
                    "url": "/communications?source=mailbox:google&message=41",
                    "external": False,
                }
            ],
        )
        self.assertEqual(links_for(step, self.mona), [])
        step.kind, step.outputs = "slack.reply", {"slack_url": "https://evil.example/x"}
        self.assertEqual(links_for(step, self.csm), [])

    def test_a_page_reads_its_connectors_once(self):
        connector = self.slack_connector()
        bundles = [
            self.bundle_with("slack.reply", {"connector_id": connector.pk}) for _ in range(3)
        ]
        steps = [b.steps.get() for b in bundles]
        with bulk.using(steps):
            page = bulk.active()
            self.assertEqual(set(page.connectors), {connector.pk})
            with self.assertNumQueries(0):
                gates.connector_of(steps[0])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_outside_gates --parallel auto --noinput`
Expected: ERROR: `cannot import name 'links_for'`; `No module named 'services.agents.outside.gates'`.

- [ ] **Step 3: The gate**

Create `services/agents/outside/gates.py`:

```python
"""Whether an outside step's tool may be used now, for one person (agent
bundles D3 contract §5.1, D3-10): the step payload's disabled state, the
run's refusal and the pick lists' 409 all ask this. Rights come first
(deciding.may_decide); this is only the tool."""

from dataclasses import dataclass

from services.accounts.capabilities import Capability
from services.connectors import agent_access
from services.connectors.models import Connector
from services.customers.personal import ticket_departments_readable
from services.mail import agent_send
from services.mail.models import MailboxConnection
from services.metrics.models import AgentAction

from .. import bulk

K = AgentAction.Kind
LINK = "/settings/connections"
SLACK_GONE = "The Slack connection this posts through is gone."
SLACK_RECONNECT = "Reconnect Slack to post this."
SLACK_ALLOW = "Allow Revenact to post in Slack."
SLACK_ASK = "Ask an admin to allow Revenact to post in Slack."
JIRA_GONE = "The Jira connection this uses is gone."
JIRA_RECONNECT = "Reconnect Jira to do this."
JIRA_ALLOW = "Allow agents to act in Jira."
JIRA_ASK = "Ask an admin to allow agents to act in Jira."
TOOLS = (K.SLACK_REPLY, K.JIRA_CREATE, K.JIRA_ASSIGN)


@dataclass(frozen=True)
class Blocked:
    sentence: str
    link: str = LINK


def mailbox_of(user):
    page = bulk.active()
    if page is not None:
        return page.mailbox(user)
    return MailboxConnection.objects.filter(user=user).first()


def connector_of(step, key="connector_id"):
    pk = (step.payload or {}).get(key) if isinstance(step.payload, dict) else None
    if not isinstance(pk, int) or isinstance(pk, bool):
        return None
    page = bulk.active()
    if page is not None and step.pk in page.outside_ids:
        return page.connectors.get(pk)
    # SOC2:AUTH-02 only this workspace's connector, never another tenant's
    return Connector.objects.filter(pk=pk, organisation_id=step.organisation_id).first()


def channel_name(connector):
    name = (connector.config or {}).get("channel_name") if connector else ""
    return f"#{name}" if name else "the channel"


def may_read(user, connector):
    # SOC2:AUTH-02 a Slack channel's messages are its connector's department's (visible_tickets)
    return ticket_departments_readable(user, [connector.department])


def blocked(step, reader):
    if step.kind == K.MAIL_SEND_REPLY:
        sentence = agent_send.blocked(mailbox_of(reader))
        return Blocked(sentence) if sentence else None
    if step.kind not in TOOLS:
        return None
    slack = step.kind == K.SLACK_REPLY
    connector = connector_of(step)
    if connector is None or not connector.is_enabled:
        return Blocked(SLACK_GONE if slack else JIRA_GONE)
    if not agent_access.usable(connector):
        return Blocked(SLACK_RECONNECT if slack else JIRA_RECONNECT)
    if not agent_access.can_act(connector):
        admin = reader.has_capability(Capability.MANAGE_INTEGRATIONS)
        if slack:
            return Blocked(SLACK_ALLOW if admin else SLACK_ASK)
        return Blocked(JIRA_ALLOW if admin else JIRA_ASK)
    if slack and not may_read(reader, connector):
        return Blocked(f"You can't post in {channel_name(connector)}.")
    return None
```

- [ ] **Step 4: The page reads connectors and mailboxes once**

In `services/agents/bulk.py`, `Bulk.__init__`, inside the per-action loop add:

```python
            if action.kind in ("jira.create", "jira.assign"):
                user_ids.add(payload.get("assignee_member_id"))
```

and after the loop (before the tasks read):

```python
# Agent bundles D3: the page's outside steps' connectors, one query.
from services.connectors.models import Connector

self.outside_ids = {
    a.pk for a in actions if a.kind in ("slack.reply", "jira.create", "jira.assign")
}
wanted = set()
for action in actions:
    if action.pk in self.outside_ids and isinstance(action.payload, dict):
        wanted |= _ids(
            [action.payload.get("connector_id"), action.payload.get("source_connector_id")]
        )
self.connectors = (
    {c.pk: c for c in Connector.objects.filter(pk__in=wanted, organisation_id__in=organisation_ids)}
    if wanted
    else {}
)
self._mailboxes = {}
```

and the method:

```python
    def mailbox(self, user):
        """`user`'s own mailbox, one query per reader (D3: a reply's gate and preview)."""
        if user.pk not in self._mailboxes:
            from services.mail.models import MailboxConnection

            self._mailboxes[user.pk] = MailboxConnection.objects.filter(user=user).first()
        return self._mailboxes[user.pk]
```

- [ ] **Step 5: The step payload**

In `services/agents/bundle_payloads.py`, import `from .outside import gates` and replace `_disabled` and add `links_for`:

```python
def _disabled(step, reader):
    """(sentence, link) for a waiting step `reader` can't run now; (None,
    None) when they can. Rights first (D1), then the tool (D3-10): only a
    tool's sentence carries a link."""
    if not may_read_source(reader, step):
        noun = "email" if "email_id" in (step.payload or {}) else "ticket"
        return SOURCE_ONLY.format(noun=noun), None
    if not may_decide(reader, step):
        return CANT_RUN_STEP, None
    stop = gates.blocked(step, reader)
    if stop is not None:
        return stop.sentence, stop.link
    return None, None


#: D1 kinds' app links (contract §6.2), in the frontend's order.
APP_LINKS = (
    ("task_url", "Open task"),
    ("campaign_url", "Open campaign"),
    ("survey_url", "Open survey"),
    ("segment_url", "Open segment"),
    ("rule_url", "Open scenario"),
    ("canvas_url", "Open map"),
)
OUTSIDE_HOSTS = ("https://slack.com/",)


def _jira_url(url):
    from urllib.parse import urlsplit

    parts = urlsplit(url)
    return parts.scheme == "https" and (parts.hostname or "").endswith(".atlassian.net")


def links_for(step, reader):
    """The step's result links for `reader` (contract §4.1, D3-16): app
    paths, and the tool's own https pages for an outside step. A sent
    reply's link is its runner's own mailbox copy."""
    if step.status != S.APPLIED:
        return []
    out = step.outputs or {}
    links = [
        {"label": label, "url": out[key], "external": False}
        for key, label in APP_LINKS
        if isinstance(out.get(key), str) and out[key].startswith("/")
    ]
    ticket = out.get("ticket_url")
    if isinstance(ticket, str) and _jira_url(ticket):
        links.append(
            {
                "label": f"Open {out.get('ticket_key', 'the issue')} in Jira",
                "url": ticket,
                "external": True,
            }
        )
    posted = out.get("slack_url")
    if isinstance(posted, str) and posted.startswith(OUTSIDE_HOSTS):
        links.append({"label": "Open the Slack message", "url": posted, "external": True})
    result = step.result if isinstance(step.result, dict) else {}
    # SOC2:AUTH-02 the sent copy is in the runner's own mailbox: only they get its link
    if (
        step.kind == "mail.send_reply"
        and result.get("message_id")
        and result.get("sent_by") == reader.pk
    ):
        provider = result.get("provider") or "google"
        links.append(
            {
                "label": "Open the sent email",
                "url": f"/communications?source=mailbox:{provider}&message={result['message_id']}",
                "external": False,
            }
        )
    return links
```

In `step_payload`, replace `reason = _disabled(step, reader) if proposed else None` with:

```python
    reason, link = _disabled(step, reader) if proposed else (None, None)
```

replace `"disabled_reason": reason,` with:

```python
        "disabled_reason": reason,
        "disabled_link": link,
        "links": links_for(step, reader),
        # Popped by `_one`: rights alone (a tool block leaves Reject open, D3-10).
        "_rights": proposed and (reason is None or link is not None),
```

In `_one`, after `rows = [step_payload(step, reader) for step in steps]`:

```python
    rights = [row.pop("_rights") for row in rows]
    deciders = [r for row, r in zip(rows, rights, strict=True) if row["status"] == S.PROPOSED]
```

and `"can_reject": waiting and bool(runnable) and all(runnable),` becomes:

```python
        "can_reject": waiting and bool(deciders) and all(deciders),
```

- [ ] **Step 6: Run the tests and the bundles' own**

Run: `$PY manage.py test services.agents services.work --parallel auto --noinput`
Expected: PASS (D1/D2 bundles answer `disabled_link: null` and `links` from their outputs; their query ceilings hold: connectors and mailboxes are read only for a page holding outside steps).

- [ ] **Step 7: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside/gates.py services/agents/bulk.py services/agents/bundle_payloads.py services/agents/tests/test_outside_gates.py
git commit -m "feat(agents): blocked outside steps link to Connections; result links; reject by rights

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: `mail.send_reply`

**Files:**
- Create: `services/agents/actions/mail_replies.py`
- Modify: `services/agents/registry.py`
- Modify: `services/agents/tests/outside_fixtures.py` (`gmail_for` converts in place)
- Modify: `services/agents/tests/test_outside_kinds.py` (the D1-only assertion becomes the D3 rule)
- Test: `services/agents/tests/test_mail_reply_kind.py` (create)

**Interfaces:**
- Consumes: Task 9's `keys`, `tools.current().mail`, `trail.call`, `Context.thread_email` (`{"id", "record", "line", "address", "subject", "mailbox_id"}`, filled by Task 17); Task 10's `gates.mailbox_of`; Task 8's `agent_send.blocked`.
- Produces: `mail_replies.SEND_REPLY` (`Kind`, contract §2.1) registered as `mail.send_reply`; `mail_replies.TO_CUSTOMER = "This goes to a customer, so it can't use another step's result."` (Task 12 reuses it); the stored payload `{"email_id", "mailbox_id", "to", "cc", "subject", "body"}`; `result` on success `{"attempted_at", "attempted_by", "sent_by", "from", "provider", "provider_id", "threaded", "email_id"?, "message_id"?}`.

- [ ] **Step 1: Write the failing tests**

First make `OutsideFixture.gmail_for` convert a mailbox in place (a mail thread's `SignalThread.mailbox` cascades: deleting the IMAP mailbox `mail_thread()` made would delete the thread). Replace it in `services/agents/tests/outside_fixtures.py`:

```python
    def gmail_for(self, user):
        """`user`'s mailbox as a connected two-way Gmail, changed in place
        (threads keep their mailbox); made when they have none."""
        from services.mail.tests.gmail_fixtures import CREDENTIALS, GRANTED, google_connection

        connection = MailboxConnection.objects.filter(user=user).first()
        if connection is None:
            return google_connection(user)
        connection.provider = MailboxConnection.Provider.GOOGLE
        connection.granted_scopes = list(GRANTED)
        connection.status = MailboxConnection.Status.CONNECTED
        connection.paused_reason = ""
        connection.set_credentials(dict(CREDENTIALS))
        connection.save()
        return connection
```

Create `services/agents/tests/test_mail_reply_kind.py`:

```python
"""mail.send_reply (agent bundles D3 contract §2.1, §3, §6, D3-1 to D3-3,
D3-11 to D3-14, D3-24). The mailbox is a fake: nothing is sent."""

from core.models import AuditEvent
from services.agents.actions import mail_replies
from services.agents.evidence import Context
from services.agents.kinds import FieldErrors, Invalid
from services.agents.tests.outside_fixtures import OutsideFixture
from services.mail.models import MailboxConnection

STEP = "/api/v1/agents/bundles/{}/steps/{}/"
DETAIL = "/api/v1/agents/bundles/{}/"


class MailReplyTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.email, self.thread = self.mail_thread(self.pizza, self.csm)
        self.connection = self.gmail_for(self.csm)
        self.bundle = self.outside_bundle(
            self.thread, ("mail.send_reply", self.mail_payload(self.email))
        )
        self.step = self.bundle.steps.get()

    def source_ctx(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.thread_email = {
            "id": self.email.pk,
            "record": f"customer:{self.pizza.pk}",
            "line": '    email 1: from Ann, unanswered: "help"',
            "address": "ann@x.com",
            "subject": "Re: Login loop",
            "mailbox_id": self.email.mailbox_id,
        }
        return ctx

    def test_the_model_writes_the_body_only(self):
        ctx = self.source_ctx()
        row = {"ref": f"customer:{self.pizza.pk}"}
        line = ctx.thread_email["line"].strip()
        clean = mail_replies.validate({"body": " Hi Ann ", "to": ["evil@x.com"]}, row, ctx, [line])
        self.assertEqual(
            clean,
            {
                "email_id": self.email.pk,
                "mailbox_id": self.email.mailbox_id,
                "to": ["ann@x.com"],
                "cc": [],
                "subject": "Re: Login loop",
                "body": "Hi Ann",
            },
        )
        for payload, evidence, record in (
            ({"body": ""}, [line], row),
            ({"body": "x" * 4001}, [line], row),
            ({"body": "Hi"}, ["another line"], row),
            ({"body": "Hi"}, [line], {"ref": "customer:999"}),
        ):
            with self.subTest(payload=payload, evidence=evidence):
                with self.assertRaises(Invalid):
                    mail_replies.validate(payload, record, ctx, evidence)

    def test_it_shows_who_it_goes_from_and_cant_be_undone(self):
        step = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(
            (step["label"], step["outside"], step["irreversible"], step["can_run"]),
            ("Send an email reply", True, True, True),
        )
        self.assertEqual(step["preview"]["mail"]["from"], "carl@acme.io")
        self.assertTrue(step["preview"]["mail"]["threaded"])
        self.assertEqual(step["editable"], ["to", "cc", "subject", "body"])
        mona = self.client_for(self.mona).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(
            (mona["preview"]["mail"]["from"], mona["disabled_reason"], mona["disabled_link"]),
            (None, "Connect your mailbox to send this.", "/settings/connections"),
        )

    def test_a_run_sends_from_the_runners_mailbox_with_the_key(self):
        response = self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            self.mail.sent,
            [
                {
                    "mailbox": self.connection.pk,
                    "source": self.email.pk,
                    "to": [self.email.from_address],
                    "cc": [],
                    "subject": f"Re: {self.email.subject}",
                    "body": "We're on it: the fix ships Friday.",
                    "key": f"b{self.bundle.pk}-s{self.step.pk}",
                }
            ],
        )
        self.step.refresh_from_db()
        self.assertEqual((self.step.status, self.step.irreversible), ("applied", True))
        self.assertEqual(
            (self.step.result["sent_by"], self.step.result["from"]), (self.csm.pk, "carl@acme.io")
        )
        call = AuditEvent.objects.get(action="agent_outside.call")
        self.assertEqual(
            {k: call.metadata[k] for k in ("tool", "op", "outcome", "returned")},
            {"tool": "mail", "op": "send", "outcome": "ok", "returned": "fake-1"},
        )
        reply = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual(reply.metadata["to"], [self.email.from_address])
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{self.step.pk}/undo/")
        self.assertEqual(
            (undo.status_code, undo.json()["detail"]), (409, "This email has been sent.")
        )

    def test_a_refusal_fails_with_its_sentence_and_retry_sends(self):
        self.mail.refuse_next("Your mailbox didn't accept the message. Retry it.")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Your mailbox didn't accept the message. Retry it."),
        )
        self.assertEqual(self.step.result["attempted_by"], self.csm.pk)
        self.assertEqual(self.retry(self.csm, self.step).status_code, 200)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied")
        self.assertEqual(
            (len(self.mail.sent), self.mail.lookups), (1, [f"b{self.bundle.pk}-s{self.step.pk}"])
        )

    def test_a_lost_answer_is_found_on_retry_and_never_sent_twice(self):
        self.mail.drop_next()
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            self.step.error,
            "We couldn't confirm the email went out. Retry checks your Sent mail first.",
        )
        self.retry(self.csm, self.step)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied")
        self.assertEqual(len(self.mail.sent), 1)
        lookup = AuditEvent.objects.filter(action="agent_outside.call", metadata__op="lookup").get()
        self.assertEqual(lookup.metadata["outcome"], "found")

    def test_only_the_runner_retries_a_reply(self):
        self.mail.refuse_next("Your mailbox didn't accept the message. Retry it.")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.retry(self.mona, self.step)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Only the person who ran this step can retry it."),
        )
        self.assertEqual(self.mail.sent, [])

    def test_a_runner_without_a_mailbox_that_can_send_fails_the_step(self):
        MailboxConnection.objects.filter(pk=self.connection.pk).update(provider="imap")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Replies can't be sent from an IMAP mailbox yet."),
        )
        self.assertEqual(self.mail.sent, [])

    def test_edits(self):
        url = STEP.format(self.bundle.pk, self.step.pk)
        client = self.client_for(self.csm)
        bad = client.patch(
            url,
            {"fields": {"to": ["not-an-address"], "body": "Logged as {{step 1.ticket_key}}"}},
            format="json",
        )
        self.assertEqual(
            bad.json(),
            {
                "steps": {
                    str(self.step.pk): {
                        "to": ["Enter email addresses like ann@example.com."],
                        "body": ["This goes to a customer, so it can't use another step's result."],
                    }
                }
            },
        )
        empty = client.patch(url, {"fields": {"to": [], "subject": ""}}, format="json")
        self.assertEqual(
            empty.json()["steps"][str(self.step.pk)],
            {"to": ["Add someone to send it to."], "subject": ["Write a subject."]},
        )
        many = client.patch(
            url, {"fields": {"cc": [f"p{n}@x.com" for n in range(11)]}}, format="json"
        )
        self.assertEqual(
            many.json()["steps"][str(self.step.pk)], {"cc": ["Send to at most 10 people."]}
        )
        good = client.patch(url, {"fields": {"cc": ["Ops@PizzaHut.com"]}}, format="json")
        self.assertEqual(good.status_code, 200)
        self.step.refresh_from_db()
        self.assertEqual(self.step.payload["cc"], ["ops@pizzahut.com"])

    def test_the_edit_function_refuses_a_placeholder_in_the_subject(self):
        with self.assertRaises(FieldErrors) as caught:
            mail_replies.edit(self.step, {"subject": "Re: {{step 1.ticket_key}}"}, self.csm)
        self.assertEqual(caught.exception.errors, {"subject": [mail_replies.TO_CUSTOMER]})
```

In `services/agents/tests/test_outside_kinds.py`, replace `test_every_d1_kind_is_inside_and_only_the_sends_are_irreversible` with:

```python
    def test_every_outside_kind_asks_and_cant_be_undone(self):
        for key, spec in REGISTRY.items():
            if spec.outside:
                with self.subTest(kind=key):
                    self.assertTrue(spec.irreversible)
                    self.assertEqual(spec.max_level, "ask")
                    self.assertTrue(spec.cant_undo)
        inside = sorted(k for k, s in REGISTRY.items() if s.irreversible and not s.outside)
        self.assertEqual(inside, ["campaign.send", "survey.send"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_mail_reply_kind services.agents.tests.test_outside_kinds --parallel auto --noinput`
Expected: ERROR: `cannot import name 'mail_replies'`.

- [ ] **Step 3: The kind**

Create `services/agents/actions/mail_replies.py`:

```python
"""mail.send_reply (agent bundles D3 contract §2.1): a reply to the thread's
newest customer email, sent from the runner's own mailbox when they press
Run (D3-1 to D3-3). The model writes only the body; who it goes to comes
from the thread (D3-2). The step's key travels as a header and every Retry
looks first (D3-11); a Retry is the runner's only. Can't be undone."""

import logging
import re

from django.db import transaction
from rest_framework import serializers

from core import audit
from services.customers.models import Email
from services.mail import agent_send
from services.mail.draft_send import ADD_SOMEONE
from services.mail.models import MailboxConnection
from services.metrics.models import AgentAction

from .. import placeholders
from ..edits import LONG_REPLY, NO_REPLY, checked, text_field
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, FieldErrors, Invalid, Kind, Stale, StepFailed
from ..outside import gates, keys, tools, trail
from . import drafts
from .surveys import NOT_THE_RUNNER

logger = logging.getLogger(__name__)
S = AgentAction.Status
BODY_LIMIT = 4000
SUBJECT_LIMIT = 255
EXCERPT = 280
MOST = 10
BAD_ADDRESS = "Enter email addresses like ann@example.com."
TOO_MANY = "Send to at most 10 people."
NO_SUBJECT = "Write a subject."
LONG_SUBJECT = "Keep the subject under 255 characters."
TO_CUSTOMER = "This goes to a customer, so it can't use another step's result."
SENT = "This email has been sent."
ADDRESS = re.compile(r"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$")


def validate(payload, row, ctx, evidence):
    source = ctx.thread_email
    if source is None or source["record"] != row["ref"]:
        raise Invalid("not this thread's customer email")
    body = str(payload.get("body") or "").strip()
    if not body or len(body) > BODY_LIMIT:
        raise Invalid("a reply needs a body under 4000 characters")
    # It cites its own email's line, and only that.
    if any(line != source["line"].strip() for line in evidence):
        raise Invalid("a reply cites only its own email")
    # D3-2: who it goes to and its subject come from the thread, never the model.
    return {
        "email_id": source["id"],
        "mailbox_id": source["mailbox_id"],
        "to": [source["address"]],
        "cc": [],
        "subject": source["subject"],
        "body": body,
    }


def target(payload):
    # Shared with draft.reply: one reply per email (D3-18).
    return f"draft:email:{payload['email_id']}"


def current(action):
    """The thread's head: someone answering, or the customer writing again, expires it."""
    return drafts._head(action.payload["email_id"])


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    result = action.result if isinstance(action.result, dict) else {}
    if action.status in (S.APPLIED, S.UNDONE):
        sender, threaded = result.get("from"), bool(result.get("threaded"))
    else:
        connection = gates.mailbox_of(reader)
        able = connection is not None and agent_send.blocked(connection) is None
        sender = connection.address if able else None
        threaded = able and connection.is_google and connection.pk == payload.get("mailbox_id")
    return {
        "mail": {
            "from": sender,
            "to": list(payload.get("to") or []),
            "cc": list(payload.get("cc") or []),
            "subject": payload.get("subject", ""),
            "excerpt": str(payload.get("body", ""))[:EXCERPT],
            "threaded": bool(threaded),
        }
    }


def _addresses(value, *, required):
    if not isinstance(value, list) or not all(isinstance(a, str) for a in value):
        raise ValueError(BAD_ADDRESS)
    clean = list(dict.fromkeys(a.strip().lower() for a in value if a.strip()))
    if required and not clean:
        raise ValueError(ADD_SOMEONE)
    if len(clean) > MOST:
        raise ValueError(TOO_MANY)
    if any(not ADDRESS.match(a) for a in clean):
        raise ValueError(BAD_ADDRESS)
    return clean


class _Text(serializers.Serializer):
    subject = serializers.CharField(
        required=False,
        max_length=SUBJECT_LIMIT,
        error_messages={
            "blank": NO_SUBJECT,
            "null": NO_SUBJECT,
            "invalid": NO_SUBJECT,
            "max_length": LONG_SUBJECT,
        },
    )
    body = text_field(BODY_LIMIT, NO_REPLY, LONG_REPLY)


def edit(action, fields, runner):
    errors, clean = {}, {}
    for key in ("to", "cc"):
        if key in fields:
            try:
                clean[key] = _addresses(fields[key], required=key == "to")
            except ValueError as exc:
                errors[key] = [str(exc)]
    try:
        clean.update(checked(_Text, {k: fields[k] for k in ("subject", "body") if k in fields}))
    except FieldErrors as exc:
        errors.update(exc.errors)
    for key in ("subject", "body"):
        # D3-17: a customer never reads another step's output.
        if key in clean and placeholders.find({key: clean[key]}):
            errors[key] = [TO_CUSTOMER]
    if errors:
        raise FieldErrors(errors)
    return {**action.payload, **clean}


def _audit_reply(action, actor, source, payload):
    """`mailbox.reply` (the standing "mail left through a held credential"
    event), best effort: its failure never fails a sent step (D3-12)."""
    try:
        with transaction.atomic():
            audit.record(  # SOC2:LOG-01 mail left the building through a credential we hold
                "mailbox.reply",
                actor=actor,
                organisation=action.organisation,
                target=source,
                metadata={
                    "to": list(payload["to"]),
                    "cc": list(payload.get("cc") or []),
                    "bcc_count": 0,
                    "subject": payload["subject"],
                    "attachments": 0,
                    "bytes": len(payload["body"].encode()),
                    "agent_step": action.pk,
                },
            )
    except Exception as exc:  # noqa: BLE001 - the send happened; the step stands
        logger.warning(
            "agent reply %s: mailbox.reply not written: %s", action.pk, type(exc).__name__
        )


def _done(actor, sent, attempt):
    result = {
        **attempt,
        "sent_by": actor.pk,
        "from": sent.address,
        "provider": sent.provider,
        "provider_id": sent.provider_id,
        "threaded": sent.threaded,
    }
    if sent.email_id:
        result["email_id"] = sent.email_id
    if sent.message_id:
        result["message_id"] = sent.message_id
    return {"sent": sent.provider_id}, result


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person sends a reply")
    payload = action.payload
    attempted_by = (action.result or {}).get("attempted_by")
    # SOC2:AUTH-02 a reply's Retry is its runner's: the lookup reads their mailbox (D3-1)
    if keys.retrying(action) and attempted_by not in (None, actor.pk):
        raise StepFailed(NOT_THE_RUNNER)
    source = (
        Email.objects.filter(
            pk=payload["email_id"], customer_id=action.customer_id, account_id=action.account_id
        )
        .select_related("customer", "account")
        .first()
    )
    if source is None:
        raise Stale("the email is gone")
    connection = MailboxConnection.objects.filter(user=actor).first()
    stop = agent_send.blocked(connection)
    if stop:
        raise StepFailed(stop)
    tool, key = tools.current().mail, keys.key_for(action)
    where = f"mailbox {connection.pk}"
    attempt = keys.attempt(action, actor)
    if keys.retrying(action):
        try:
            found = tool.find(connection, key=key, since=keys.since(action))
        except tools.Refused as exc:
            raise StepFailed(exc.sentence) from None
        trail.call(
            action,
            actor,
            tool="mail",
            op="lookup",
            outcome="found" if found else "not_found",
            where=where,
            returned=found.provider_id if found else "",
        )
        if found is not None:
            return _done(actor, found, attempt)
    try:
        sent = tool.send(
            connection,
            source=source,
            to=payload["to"],
            cc=payload.get("cc") or [],
            subject=payload["subject"],
            body=payload["body"],
            key=key,
        )
    except tools.Unconfirmed as exc:
        trail.call(action, actor, tool="mail", op="send", outcome="unconfirmed", where=where)
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        trail.call(action, actor, tool="mail", op="send", outcome="refused", where=where)
        raise StepFailed(exc.sentence, result=attempt) from None
    trail.call(
        action, actor, tool="mail", op="send", outcome="ok", where=where, returned=sent.provider_id
    )
    _audit_reply(action, actor, source, payload)
    return _done(actor, sent, attempt)


def undo(action, actor):
    raise ChangedSince(SENT)


SEND_REPLY = Kind(
    key=AgentAction.Kind.MAIL_SEND_REPLY,
    label="Send an email reply",
    example="Reply to Ann Lee that the login fix ships on Friday",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: target(a) == target(b),
    current=current,
    preview=preview,
    apply=apply,
    undo=undo,
    per_reader=True,
    texts=lambda payload: [payload.get("subject"), payload.get("body")],
    irreversible=True,
    outside=True,
    editable=("to", "cc", "subject", "body"),
    edit=edit,
    outputs=("email_id",),
    customer_facing=("subject", "body"),
    cant_undo=SENT,
)
```

In `services/agents/registry.py`, import `mail_replies` with the other actions and add `mail_replies.SEND_REPLY,` after `campaign_sends.SEND,`.

- [ ] **Step 4: Run the tests and the agents' own**

Run: `$PY manage.py test services.agents services.work --parallel auto --noinput`
Expected: PASS. Nothing offers the kind to a model yet (`offered()` is empty until Task 17), so the nightly and intake tests are unchanged; Settings › Agents lists it locked to Ask.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/actions/mail_replies.py services/agents/registry.py services/agents/tests/outside_fixtures.py services/agents/tests/test_outside_kinds.py services/agents/tests/test_mail_reply_kind.py
git commit -m "feat(agents): mail.send_reply sends from the runner's mailbox, once

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `slack.reply`

**Files:**
- Create: `services/agents/actions/slack_replies.py`
- Modify: `services/agents/registry.py`
- Test: `services/agents/tests/test_slack_reply_kind.py` (create)

**Interfaces:**
- Consumes: Task 9's facade, keys, trail, `Context.thread_ticket` (`{"id", "record", "line", "provider", "connector_id", "external_id", "number", "config"}`, filled by Task 17); Task 10's `gates`; Task 11's `TO_CUSTOMER`; `drafts._ticket_status`.
- Produces: `slack_replies.REPLY` registered as `slack.reply` (contract §2.2); `slack_replies.channels(action, reader) -> list[Connector]` (the `slack_channels` list, Task 15 serves it); the stored payload `{"ticket_id", "source_connector_id", "connector_id", "channel", "channel_name", "thread_ts", "text"}` where `thread_ts` is always the source's and is used only while `connector_id == source_connector_id`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_slack_reply_kind.py`:

```python
"""slack.reply (agent bundles D3 contract §2.2, §3, §6, D3-4, D3-10, D3-11,
D3-24). Slack is a fake: nothing is posted."""

from core.models import AuditEvent
from services.agents.actions import slack_replies
from services.agents.evidence import Context
from services.agents.kinds import Invalid
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import Ticket

STEP = "/api/v1/agents/bundles/{}/steps/{}/"
DETAIL = "/api/v1/agents/bundles/{}/"


class SlackReplyTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.support = self.slack_connector()
        self.ticket, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.ticket, self.support))
        )
        self.step = self.bundle.steps.get()

    def test_the_model_writes_the_text_only(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.thread_lines = ['    ticket 1 "SL-1": Nobody can log in']
        ctx.thread_ticket = {
            "id": self.ticket.pk,
            "record": f"customer:{self.pizza.pk}",
            "line": ctx.thread_lines[0],
            "provider": "slack",
            "connector_id": self.support.pk,
            "external_id": self.ticket.external_id,
            "number": self.ticket.ticket_number,
            "config": self.support.config,
        }
        row = {"ref": f"customer:{self.pizza.pk}"}
        clean = slack_replies.validate(
            {"text": " On it ", "channel": "C0EVIL"}, row, ctx, [ctx.thread_lines[0].strip()]
        )
        self.assertEqual(clean, self.slack_payload(self.ticket, self.support, text="On it"))
        ctx.thread_ticket["provider"] = "zendesk"
        with self.assertRaises(Invalid):
            slack_replies.validate({"text": "On it"}, row, ctx, [])

    def test_a_run_posts_in_the_thread_as_the_app(self):
        step = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(
            step["preview"]["slack"],
            {
                "channel": "#support",
                "in_thread": True,
                "as": "revenact",
                "excerpt": "We're on it: the fix ships Friday.",
            },
        )
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        self.assertEqual(
            [(p["channel"], p["thread_ts"], p["key"]) for p in self.slack.posts],
            [("C0SUPPORT", self.ticket.external_id, f"b{self.bundle.pk}-s{self.step.pk}")],
        )
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied")
        self.assertEqual(set(self.step.outputs), {"slack_ts", "slack_url"})
        links = (
            self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]["links"]
        )
        self.assertEqual(
            [(l["label"], l["external"]) for l in links], [("Open the Slack message", True)]
        )

    def test_moving_it_to_another_channel_posts_at_the_top_level(self):
        escalations = self.slack_connector(channel="C0ESCALATE", name="escalations")
        url = STEP.format(self.bundle.pk, self.step.pk)
        moved = self.client_for(self.csm).patch(
            url, {"fields": {"connector_id": escalations.pk}}, format="json"
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.assertEqual(moved.json()["bundle"]["steps"][0]["preview"]["slack"]["in_thread"], False)
        self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(
            [(p["channel"], p["thread_ts"]) for p in self.slack.posts], [("C0ESCALATE", "")]
        )

    def test_a_channel_the_runner_cant_read_is_refused(self):
        engineering = self.slack_connector(department="engineering", channel="C0ENG", name="eng")
        bad = self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"connector_id": engineering.pk}},
            format="json",
        )
        self.assertEqual(
            bad.json(),
            {
                "steps": {
                    str(self.step.pk): {"connector_id": ["Choose a Slack channel Revenact reads."]}
                }
            },
        )
        placeholder = self.client_for(self.csm).patch(
            STEP.format(self.bundle.pk, self.step.pk),
            {"fields": {"text": "See {{step 1.ticket_url}}"}},
            format="json",
        )
        self.assertEqual(
            placeholder.json()["steps"][str(self.step.pk)],
            {"text": ["This goes to a customer, so it can't use another step's result."]},
        )

    def test_a_read_only_slack_fails_the_step_with_the_gate(self):
        self.support.agents_can_act = False
        self.support.save(update_fields=["agents_can_act"])
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            (self.step.status, self.step.error),
            ("failed", "Ask an admin to allow Revenact to post in Slack."),
        )
        self.assertEqual(self.slack.posts, [])

    def test_a_resolved_thread_expires_it(self):
        Ticket.objects.filter(pk=self.ticket.pk).update(status=Ticket.Status.RESOLVED)
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual((self.step.status, self.step.expired_reason), ("expired", "changed"))

    def test_a_lost_answer_is_found_on_retry(self):
        self.slack.drop_next()
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            self.step.error, "We couldn't confirm the Slack post. Retry checks the channel first."
        )
        self.retry(self.mona, self.step)
        self.step.refresh_from_db()
        self.assertEqual((self.step.status, len(self.slack.posts)), ("applied", 1))
        self.assertTrue(
            AuditEvent.objects.filter(
                action="agent_outside.call", metadata__outcome="found"
            ).exists()
        )

    def test_it_cant_be_undone(self):
        self.run_all_steps(self.csm, self.bundle)
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{self.step.pk}/undo/")
        self.assertEqual(undo.json()["detail"], "This Slack message has been posted.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_slack_reply_kind --parallel auto --noinput`
Expected: ERROR: `cannot import name 'slack_replies'`.

- [ ] **Step 3: The kind**

Create `services/agents/actions/slack_replies.py`:

```python
"""slack.reply (agent bundles D3 contract §2.2): a reply in the customer's
Slack thread, posted with the connector's bot token when a person presses
Run (D3-4). A person may move it to another Slack channel Revenact reads,
where it is a new top-level message. The key travels in the message's
metadata; every Retry looks first (D3-11). Can't be undone."""

from rest_framework import serializers

from services.connectors import agent_access
from services.connectors.models import Connector
from services.customers.models import Ticket
from services.metrics.models import AgentAction

from .. import placeholders
from ..edits import checked, text_field
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, FieldErrors, Invalid, Kind, Stale, StepFailed
from ..outside import gates, keys, tools, trail
from . import drafts
from .mail_replies import TO_CUSTOMER

TEXT_LIMIT = 3000
EXCERPT = 280
NO_TEXT = "Write the message."
LONG_TEXT = "Keep the message under 3000 characters."
NOT_A_CHANNEL = "Choose a Slack channel Revenact reads."
POSTED = "This Slack message has been posted."


def validate(payload, row, ctx, evidence):
    ticket = ctx.thread_ticket
    if ticket is None or ticket["provider"] != "slack" or ticket["record"] != row["ref"]:
        raise Invalid("not this record's Slack thread")
    text = str(payload.get("text") or "").strip()
    if not text or len(text) > TEXT_LIMIT:
        raise Invalid("a Slack reply needs text under 3000 characters")
    thread = {line.strip() for line in ctx.thread_lines}
    if any(line not in thread for line in evidence):
        raise Invalid("a Slack reply cites only its thread")
    config = ticket["config"] or {}
    # D3-20: where it posts comes from the thread, never the model.
    return {
        "ticket_id": ticket["id"],
        "source_connector_id": ticket["connector_id"],
        "connector_id": ticket["connector_id"],
        "channel": config.get("channel", ""),
        "channel_name": config.get("channel_name", ""),
        "thread_ts": ticket["external_id"],
        "text": text,
    }


def target(payload):
    # Shared with draft.reply: one reply per conversation (D3-18).
    return f"draft:ticket:{payload['ticket_id']}"


def current(action):
    """ "open" or "resolved": a ✅ on the thread resolves it and expires the step."""
    status = drafts._ticket_status(action.payload["ticket_id"])
    if status is None:
        return None
    return "resolved" if status in Ticket.RESOLVED_STATUSES else "open"


def _in_thread(payload):
    return payload.get("connector_id") == payload.get("source_connector_id")


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    connector = gates.connector_of(action)
    bot = (connector.config or {}).get("bot_name") if connector else ""
    name = payload.get("channel_name")
    return {
        "slack": {
            "channel": f"#{name}" if name else "Slack",
            "in_thread": _in_thread(payload),
            "as": bot or "the Slack app",
            "excerpt": str(payload.get("text", ""))[:EXCERPT],
        }
    }


def channels(action, reader):
    """The Slack connectors this step may post through for `reader`
    (contract §5.2 `slack_channels`): enabled, able to act and readable
    by them; the source first."""
    rows = Connector.objects.filter(
        organisation_id=action.organisation_id, provider=Connector.Provider.SLACK, is_enabled=True
    ).order_by("pk")
    source = (action.payload or {}).get("source_connector_id")
    found = [c for c in rows if agent_access.can_act(c) and gates.may_read(reader, c)]
    return sorted(found, key=lambda c: c.pk != source)


class _Text(serializers.Serializer):
    text = text_field(TEXT_LIMIT, NO_TEXT, LONG_TEXT)


def edit(action, fields, runner):
    errors, clean = {}, {}
    if "connector_id" in fields:
        pk = fields["connector_id"]
        whole = isinstance(pk, int) and not isinstance(pk, bool)
        chosen = next((c for c in channels(action, runner) if c.pk == pk), None) if whole else None
        if chosen is None:
            errors["connector_id"] = [NOT_A_CHANNEL]
        else:
            config = chosen.config or {}
            clean.update(
                {
                    "connector_id": chosen.pk,
                    "channel": config.get("channel", ""),
                    "channel_name": config.get("channel_name", ""),
                }
            )
    try:
        clean.update(checked(_Text, {"text": fields["text"]} if "text" in fields else {}))
    except FieldErrors as exc:
        errors.update(exc.errors)
    if "text" in clean and placeholders.find({"text": clean["text"]}):
        errors["text"] = [TO_CUSTOMER]
    if errors:
        raise FieldErrors(errors)
    return {**action.payload, **clean}


def _done(posted, attempt):
    return {"posted": posted.ts}, {
        **attempt,
        "slack_ts": posted.ts,
        "slack_url": posted.url,
        "channel": posted.channel,
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person posts in Slack")
    # SOC2:AUTH-02 the tool's gate again at run: the switch, the grant, the channel's department
    stop = gates.blocked(action, actor)
    if stop is not None:
        raise StepFailed(stop.sentence)
    payload = action.payload
    connector = gates.connector_of(action)
    thread_ts = payload.get("thread_ts", "") if _in_thread(payload) else ""
    channel, label = payload["channel"], gates.channel_name(connector)
    tool, key = tools.current().slack, keys.key_for(action)
    attempt = keys.attempt(action, actor)
    if keys.retrying(action):
        try:
            found = tool.find(
                connector,
                channel=channel,
                channel_name=label,
                key=key,
                thread_ts=thread_ts,
                since=keys.since(action),
            )
        except tools.Refused as exc:
            raise StepFailed(exc.sentence) from None
        trail.call(
            action,
            actor,
            tool="slack",
            op="lookup",
            outcome="found" if found else "not_found",
            where=channel,
            returned=found.ts if found else "",
        )
        if found is not None:
            return _done(found, attempt)
    try:
        posted = tool.post(
            connector,
            channel=channel,
            channel_name=label,
            text=payload["text"],
            thread_ts=thread_ts,
            key=key,
        )
    except tools.Unconfirmed as exc:
        trail.call(action, actor, tool="slack", op="post", outcome="unconfirmed", where=channel)
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        trail.call(action, actor, tool="slack", op="post", outcome="refused", where=channel)
        raise StepFailed(exc.sentence, result=attempt) from None
    trail.call(
        action, actor, tool="slack", op="post", outcome="ok", where=channel, returned=posted.ts
    )
    return _done(posted, attempt)


def undo(action, actor):
    raise ChangedSince(POSTED)


REPLY = Kind(
    key=AgentAction.Kind.SLACK_REPLY,
    label="Reply in Slack",
    example="Reply in the Slack thread that the fix ships on Friday",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: target(a) == target(b),
    current=current,
    preview=preview,
    apply=apply,
    undo=undo,
    texts=lambda payload: [payload.get("text")],
    irreversible=True,
    outside=True,
    editable=("connector_id", "text"),
    edit=edit,
    outputs=("slack_ts", "slack_url"),
    customer_facing=("text",),
    cant_undo=POSTED,
)
```

In `services/agents/registry.py`, import `slack_replies` and add `slack_replies.REPLY,` after `mail_replies.SEND_REPLY,`.

- [ ] **Step 4: Run the tests and the agents' own**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/actions/slack_replies.py services/agents/registry.py services/agents/tests/test_slack_reply_kind.py
git commit -m "feat(agents): slack.reply posts in the thread, or a channel Revenact reads

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `jira.create`

**Files:**
- Create: `services/agents/actions/jira_issues.py` (`CREATE` and the helpers Task 14 shares)
- Modify: `services/agents/registry.py`
- Test: `services/agents/tests/test_jira_create_kind.py` (create)

**Interfaces:**
- Consumes: Task 9's facade (`tools.current().jira`), keys, trail, `sentences`, `Context.jira_connector` (`{"id", "project"}`, filled by Task 17); Task 10's `gates`; Task 6's `adf`, `issue_url`.
- Produces: `jira_issues.CREATE` registered as `jira.create` (contract §2.3); helpers `jira_issues.account(tool, connector, payload) -> str | None`, `assignee_preview(payload) -> dict | None`, `assignee_name(payload) -> str`, `pick(value, *, nullable) -> dict | None`, `DEFAULT_TYPE = "Task"`, `FROM_LIST = "Choose from Jira's list."`; the stored payload `{"connector_id", "project", "issue_type", "summary", "description", "priority", "assignee", "assignee_member_id"}`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_jira_create_kind.py`:

```python
"""jira.create (agent bundles D3 contract §2.3, §3, §6, D3-5, D3-6, D3-11,
D3-24). Jira is a fake: nothing is created."""

from services.agents.actions import jira_issues
from services.agents.evidence import Context
from services.agents.kinds import FieldErrors, Invalid
from services.agents.tests.outside_fixtures import OutsideFixture

STEP = "/api/v1/agents/bundles/{}/steps/{}/"
DETAIL = "/api/v1/agents/bundles/{}/"


class JiraCreateTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        _, self.thread = self.slack_thread(self.pizza)
        self.bundle = self.outside_bundle(
            self.thread, ("jira.create", self.jira_payload(self.board, member=self.erin.pk))
        )
        self.step = self.bundle.steps.get()

    def test_the_model_proposes_words_and_a_member_never_a_project(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.jira_connector = {"id": self.board.pk, "project": "SUP"}
        ctx.members = {self.erin.pk: {"id": self.erin.pk, "name": "Erin Eng"}}
        row = {"ref": f"customer:{self.pizza.pk}"}
        clean = jira_issues.validate(
            {
                "summary": "Login loop",
                "description": "Since Monday.",
                "priority": "high",
                "assignee_id": self.erin.pk,
                "project": "ENG",
            },
            row,
            ctx,
            [],
        )
        self.assertEqual(
            clean,
            {
                "connector_id": self.board.pk,
                "project": "SUP",
                "issue_type": {"id": "", "name": "Task"},
                "summary": "Login loop",
                "description": "Since Monday.",
                "priority": {"id": "", "name": "High"},
                "assignee": None,
                "assignee_member_id": self.erin.pk,
            },
        )
        for bad in (
            {"summary": ""},
            {"summary": "x" * 201},
            {"summary": "S", "priority": "urgent"},
            {"summary": "S", "assignee_id": 999999},
        ):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                jira_issues.validate(bad, row, ctx, [])
        ctx.jira_connector = None
        with self.assertRaises(Invalid):
            jira_issues.validate({"summary": "S"}, row, ctx, [])

    def test_the_preview_names_the_account_it_acts_as(self):
        step = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(
            step["preview"]["jira"],
            {
                "site": "acme.atlassian.net",
                "project": "SUP",
                "issue_type": "Task",
                "summary": "Login loop after password reset",
                "excerpt": "Since Monday nobody can log in after a reset.",
                "priority": "High",
                "assignee": {"name": "Erin Eng", "matched_later": True},
                "as": "Jira Bot",
            },
        )

    def test_a_run_resolves_names_then_creates_once_with_its_label(self):
        self.assertEqual(self.run_all_steps(self.csm, self.bundle).status_code, 200)
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied", self.step.error)
        [key] = self.jira.created
        fields = self.jira.issues[key]["fields"]
        self.assertEqual(fields["project"], {"key": "SUP"})
        self.assertEqual(fields["issuetype"], {"id": "10001"})
        self.assertEqual(fields["priority"], {"id": "2"})
        self.assertEqual(fields["assignee"], {"accountId": "acc-erin"})
        self.assertEqual(fields["labels"], [f"revenact-b{self.bundle.pk}-s{self.step.pk}"])
        self.assertEqual(
            fields["description"]["content"][-1],
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Created by Carl CSM from Revenact."}],
            },
        )
        self.assertEqual(
            self.step.outputs,
            {"ticket_key": key, "ticket_url": f"https://acme.atlassian.net/browse/{key}"},
        )

    def test_a_member_jira_doesnt_know_fails_and_a_picked_assignee_retries(self):
        self.step.payload = {**self.step.payload, "assignee_member_id": self.other.pk}
        self.step.save(update_fields=["payload"])
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            self.step.error,
            "Jira has no user with dana@acme.io. Choose the assignee from Jira's list, then Retry.",
        )
        self.assertEqual(self.jira.created, [])
        self.retry(self.csm, self.step, {"assignee": {"id": "acc-priya", "name": "Priya Shah"}})
        self.step.refresh_from_db()
        self.assertEqual(self.step.status, "applied")
        self.assertEqual(self.jira.issues[self.jira.created[0]]["assignee"], "acc-priya")

    def test_no_project_fails_before_any_call(self):
        self.step.payload = {**self.step.payload, "project": ""}
        self.step.save(update_fields=["payload"])
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(self.step.error, "Choose a Jira project, then Retry.")

    def test_jiras_refusal_is_a_sentence(self):
        self.jira.refuse_next("create", "Jira says the project SUP needs a component.")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(self.step.error, "Jira says the project SUP needs a component.")

    def test_a_lost_answer_is_found_by_its_label_on_retry(self):
        self.jira.drop_next("create")
        self.run_all_steps(self.csm, self.bundle)
        self.step.refresh_from_db()
        self.assertEqual(
            self.step.error, "We couldn't confirm Jira made the issue. Retry checks Jira first."
        )
        self.retry(self.csm, self.step)
        self.step.refresh_from_db()
        self.assertEqual((self.step.status, len(self.jira.created)), ("applied", 1))
        self.assertEqual(self.jira.lookups, [f"revenact-b{self.bundle.pk}-s{self.step.pk}"])

    def test_edits(self):
        url = STEP.format(self.bundle.pk, self.step.pk)
        client = self.client_for(self.csm)
        bad = client.patch(
            url, {"fields": {"project": "sup", "priority": {"id": 2}}}, format="json"
        )
        self.assertEqual(
            bad.json()["steps"][str(self.step.pk)],
            {"project": ["Choose a Jira project."], "priority": ["Choose from Jira's list."]},
        )
        self.step.payload = {**self.step.payload, "issue_type": {"id": "10002", "name": "Bug"}}
        self.step.save(update_fields=["payload"])
        moved = client.patch(
            url,
            {"fields": {"project": "ENG", "assignee": {"id": "acc-priya", "name": "Priya Shah"}}},
            format="json",
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.step.refresh_from_db()
        self.assertEqual(self.step.payload["issue_type"], {"id": "", "name": "Bug"})
        self.assertEqual(
            (self.step.payload["assignee"]["id"], self.step.payload["assignee_member_id"]),
            ("acc-priya", None),
        )
        with self.assertRaises(FieldErrors) as caught:
            jira_issues.edit(self.step, {"summary": "", "description": "x" * 10_001}, self.csm)
        self.assertEqual(
            caught.exception.errors,
            {
                "summary": ["Write a summary."],
                "description": ["Keep the description under 10,000 characters."],
            },
        )

    def test_read_only_jira_disables_it(self):
        self.board.agents_can_act = False
        self.board.save(update_fields=["agents_can_act"])
        step = self.client_for(self.csm).get(DETAIL.format(self.bundle.pk)).json()["steps"][0]
        self.assertEqual(step["disabled_reason"], "Ask an admin to allow agents to act in Jira.")

    def test_it_cant_be_undone(self):
        self.run_all_steps(self.csm, self.bundle)
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{self.step.pk}/undo/")
        self.assertEqual(undo.json()["detail"], "This Jira issue has been created.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_jira_create_kind --parallel auto --noinput`
Expected: ERROR: `cannot import name 'jira_issues'`.

- [ ] **Step 3: The kind**

Create `services/agents/actions/jira_issues.py`:

```python
"""jira.create and jira.assign (agent bundles D3 contract §2.3, §2.4): an
issue opened, or an issue assigned, in Jira as the connection's account
(D3-5) when a person presses Run. The model proposes words and a member;
the project, type, priority and assignee are Jira's, resolved by name when
it runs or picked from Jira's own lists (D3-6, D3-8). A created issue
carries its step's key as a label, so a Retry finds it (D3-11); assigning
reads the assignee first and is idempotent (D3-7). Can't be undone."""

import re

from rest_framework import serializers

from services.accounts.models import User
from services.connectors.providers.jira import adf, issue_url
from services.metrics.models import AgentAction

from .. import bulk, placeholders
from ..edits import checked, text_field
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, FieldErrors, Invalid, Kind, Stale, StepFailed
from ..outside import gates, keys, sentences, tools, trail

DEFAULT_TYPE = "Task"
MODEL_SUMMARY = 200
MODEL_DESCRIPTION = 4000
SUMMARY_LIMIT = 255
DESCRIPTION_LIMIT = 10_000
EXCERPT = 280
PRIORITIES = {"high": "High", "medium": "Medium", "low": "Low"}
PROJECT = re.compile(r"^[A-Z][A-Z0-9_]{0,19}$")
STEP_KEY = re.compile(r"^\{\{\s*step\s+\d{1,2}\.ticket_key\s*\}\}$")
CHOOSE_PROJECT = "Choose a Jira project."
FROM_LIST = "Choose from Jira's list."
NO_SUMMARY = "Write a summary."
LONG_SUMMARY = "Keep the summary under 255 characters."
LONG_DESCRIPTION = "Keep the description under 10,000 characters."
CHOOSE_ASSIGNEE = "Choose who to assign it to, then Retry."
CREATED = "This Jira issue has been created."
ASSIGNED = "This Jira issue has been assigned."


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _member_ok(ctx, member):
    return _whole(member) and member in ctx.members


def validate(payload, row, ctx, evidence):
    connector = ctx.jira_connector
    if connector is None:
        raise Invalid("no Jira connection")
    summary = str(payload.get("summary") or "").strip()
    if not summary or len(summary) > MODEL_SUMMARY:
        raise Invalid("a Jira issue needs a summary under 200 characters")
    description = str(payload.get("description") or "").strip()
    if len(description) > MODEL_DESCRIPTION:
        raise Invalid("a Jira description under 4000 characters")
    priority = payload.get("priority") or ""
    if priority not in ("", *PRIORITIES):
        raise Invalid("priority is high, medium or low")
    member = payload.get("assignee_id")
    if member is not None and not _member_ok(ctx, member):
        raise Invalid("the assignee is not a member")
    # D3-20: the project and type come from the connector, never the model.
    return {
        "connector_id": connector["id"],
        "project": connector["project"] or "",
        "issue_type": {"id": "", "name": DEFAULT_TYPE},
        "summary": summary,
        "description": description,
        "priority": {"id": "", "name": PRIORITIES[priority]} if priority else None,
        "assignee": None,
        "assignee_member_id": member,
    }


def target(payload):
    return f"jira:create:{payload['summary'].casefold()[:80]}"


def _member_name(pk):
    page = bulk.active()
    if page is not None and pk in page.names:
        return page.names[pk]
    return User.objects.filter(pk=pk).values_list("name", flat=True).first()


def assignee_preview(payload):
    chosen = payload.get("assignee")
    if isinstance(chosen, dict) and chosen.get("name"):
        return {"name": chosen["name"], "matched_later": False}
    member = payload.get("assignee_member_id")
    name = _member_name(member) if _whole(member) else None
    return {"name": name, "matched_later": True} if name else None


def assignee_name(payload):
    shown = assignee_preview(payload)
    return shown["name"] if shown else "the assignee"


def _as(connector):
    if connector is None:
        return {"site": "", "as": "Jira"}
    config = connector.config or {}
    return {"site": config.get("host", ""), "as": config.get("account_name") or connector.name}


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    where = _as(gates.connector_of(action))
    return {
        "jira": {
            "site": where["site"],
            "project": payload.get("project", ""),
            "issue_type": (payload.get("issue_type") or {}).get("name") or DEFAULT_TYPE,
            "summary": payload.get("summary", ""),
            "excerpt": str(payload.get("description", ""))[:EXCERPT],
            "priority": (payload.get("priority") or {}).get("name") or None,
            "assignee": assignee_preview(payload),
            "as": where["as"],
        }
    }


def pick(value, *, nullable):
    """A pick-list value `{"id", "name"}` (contract §2.3), or None where allowed."""
    if value is None and nullable:
        return None
    if not isinstance(value, dict):
        raise ValueError(FROM_LIST)
    id_, name = value.get("id"), value.get("name")
    if not isinstance(id_, str) or len(id_) > 128 or not isinstance(name, str):
        raise ValueError(FROM_LIST)
    if not name.strip() or len(name) > 255:
        raise ValueError(FROM_LIST)
    return {"id": id_, "name": name.strip()}


class _Text(serializers.Serializer):
    summary = text_field(SUMMARY_LIMIT, NO_SUMMARY, LONG_SUMMARY)
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=DESCRIPTION_LIMIT,
        error_messages={"max_length": LONG_DESCRIPTION},
    )


def edit(action, fields, runner):
    errors, clean = {}, {}
    if "project" in fields:
        value = fields["project"]
        if not isinstance(value, str) or not PROJECT.match(value):
            errors["project"] = [CHOOSE_PROJECT]
        else:
            clean["project"] = value
            if value != action.payload.get("project"):
                # Another project: its type is resolved again by name (D3-6).
                kept = action.payload.get("issue_type") or {}
                clean["issue_type"] = {"id": "", "name": kept.get("name") or DEFAULT_TYPE}
    for key, nullable in (("issue_type", False), ("priority", True), ("assignee", True)):
        if key in fields:
            try:
                clean[key] = pick(fields[key], nullable=nullable)
            except ValueError as exc:
                errors[key] = [str(exc)]
    if "assignee" in clean:
        clean["assignee_member_id"] = None
    text = {k: fields[k] for k in ("summary", "description") if k in fields}
    try:
        clean.update(checked(_Text, text))
    except FieldErrors as exc:
        errors.update(exc.errors)
    if errors:
        raise FieldErrors(errors)
    return {**action.payload, **clean}


def account(tool, connector, payload):
    """The Jira accountId to assign: the one picked, else the model's member
    matched by email (D3-6); None for no assignee. Raises tools.Refused."""
    chosen = payload.get("assignee")
    if isinstance(chosen, dict) and chosen.get("id"):
        return chosen["id"]
    member = payload.get("assignee_member_id")
    if not _whole(member):
        return None
    email = (
        User.objects.filter(pk=member, organisation_id=connector.organisation_id)
        .values_list("email", flat=True)
        .first()
    )
    if not email:
        return None
    found = tool.account_for(connector, email=email)
    if found is None:
        raise tools.Refused(sentences.no_user(email))
    return found["id"]


def _by_name(rows, name):
    if not name:
        return None
    wanted = name.casefold()
    return next((r["id"] for r in rows if r["name"].casefold() == wanted), None)


def _fields(tool, connector, payload, project, actor, label):
    """What Jira is sent (reads first: the type, the priority, the assignee)."""
    issue_type = payload.get("issue_type") or {}
    type_id = issue_type.get("id")
    if not type_id:
        types = tool.issue_types(connector, project)
        type_id = _by_name(types, issue_type.get("name") or DEFAULT_TYPE) or (
            types[0]["id"] if types else None
        )
    if not type_id:
        raise tools.Refused(sentences.no_types(project))
    fields = {
        "project": {"key": project},
        "issuetype": {"id": type_id},
        "summary": payload["summary"],
        # D3-5: Jira readers see who ran it.
        "description": adf(
            payload.get("description", ""), f"Created by {actor.name} from Revenact."
        ),
        "labels": [label],
    }
    priority = payload.get("priority") or {}
    priority_id = priority.get("id") or _by_name(tool.priorities(connector), priority.get("name"))
    if priority_id:
        fields["priority"] = {"id": priority_id}
    assignee = account(tool, connector, payload)
    if assignee:
        fields["assignee"] = {"accountId": assignee}
    return fields


def _made(issue, attempt):
    return {"issue": issue.key}, {**attempt, "ticket_key": issue.key, "ticket_url": issue.url}


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person creates a Jira issue")
    # SOC2:AUTH-02 the tool's gate again at run: the switch and the grant
    stop = gates.blocked(action, actor)
    if stop is not None:
        raise StepFailed(stop.sentence)
    connector = gates.connector_of(action)
    payload = action.payload
    project = payload.get("project") or ""
    if not project:
        raise StepFailed(sentences.JIRA_NO_PROJECT)
    tool, key = tools.current().jira, keys.key_for(action)
    label = keys.jira_label(key)
    attempt = keys.attempt(action, actor)
    if keys.retrying(action):
        try:
            found = tool.find(connector, label=label, project=project)
        except tools.Refused as exc:
            raise StepFailed(exc.sentence) from None
        trail.call(
            action,
            actor,
            tool="jira",
            op="lookup",
            outcome="found" if found else "not_found",
            where=project,
            returned=found.key if found else "",
        )
        if found is not None:
            return _made(found, attempt)
    try:
        fields = _fields(tool, connector, payload, project, actor, label)
    except tools.Refused as exc:
        raise StepFailed(exc.sentence) from None
    try:
        issue = tool.create(connector, fields=fields, project=project)
    except tools.Unconfirmed as exc:
        trail.call(action, actor, tool="jira", op="create", outcome="unconfirmed", where=project)
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        trail.call(action, actor, tool="jira", op="create", outcome="refused", where=project)
        raise StepFailed(exc.sentence, result=attempt) from None
    trail.call(
        action, actor, tool="jira", op="create", outcome="ok", where=project, returned=issue.key
    )
    return _made(issue, attempt)


def undo_created(action, actor):
    raise ChangedSince(CREATED)


CREATE = Kind(
    key=AgentAction.Kind.JIRA_CREATE,
    label="Create a Jira issue",
    example="Log the login loop in Jira for engineering",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=target,
    same=lambda a, b: a.get("summary", "").casefold() == b.get("summary", "").casefold(),
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo_created,
    texts=lambda payload: [payload.get("summary"), payload.get("description")],
    irreversible=True,
    outside=True,
    editable=("project", "issue_type", "summary", "description", "priority", "assignee"),
    edit=edit,
    outputs=("ticket_key", "ticket_url"),
    cant_undo=CREATED,
)
```

(`placeholders` and `issue_url` are imported for Task 14, which adds `jira.assign` to this module.)

In `services/agents/registry.py`, import `jira_issues` and add `jira_issues.CREATE,` after `slack_replies.REPLY,`.

- [ ] **Step 4: Run the tests and the agents' own**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: PASS. (Until Task 14 uses them, ruff flags `placeholders` and `issue_url` as unused: add `# noqa: F401` to those two imports in this commit and drop it in Task 14.)

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/actions/jira_issues.py services/agents/registry.py services/agents/tests/test_jira_create_kind.py
git commit -m "feat(agents): jira.create opens an issue as the connection's account, once

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: `jira.assign`

**Files:**
- Modify: `services/agents/actions/jira_issues.py` (`ASSIGN`)
- Modify: `services/agents/registry.py`
- Test: `services/agents/tests/test_jira_assign_kind.py` (create)

**Interfaces:**
- Consumes: Task 13's helpers; `Context.thread_ticket` and `jira_connector` (Task 17); placeholders (D1 §6).
- Produces: `jira_issues.ASSIGN` registered as `jira.assign` (contract §2.4); the stored payload `{"connector_id", "issue", "assignee", "assignee_member_id"}`; outputs `ticket_key`, `ticket_url`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_jira_assign_kind.py`:

```python
"""jira.assign (agent bundles D3 contract §2.4, D3-7, D3-17). Jira is a fake."""

from core.models import AuditEvent
from services.agents.actions import jira_issues
from services.agents.evidence import Context
from services.agents.kinds import Invalid
from services.agents.tests.outside_fixtures import OutsideFixture

DETAIL = "/api/v1/agents/bundles/{}/"


class JiraAssignTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        # Customer Success's Jira: Carl reads its tickets, so he reads and runs the bundle.
        self.board = self.jira_connector(department="cs")
        self.ticket, self.thread = self.jira_thread(self.pizza, self.board, key="SUP-12")

    def ctx(self):
        ctx = Context(self.org, "cs", self.today)
        ctx.jira_connector = {"id": self.board.pk, "project": "SUP"}
        ctx.members = {self.erin.pk: {"id": self.erin.pk, "name": "Erin Eng"}}
        ctx.thread_ticket = {
            "id": self.ticket.pk,
            "record": f"customer:{self.pizza.pk}",
            "line": "",
            "provider": "jira",
            "connector_id": self.board.pk,
            "external_id": "SUP-12",
            "number": "SUP-12",
            "config": self.board.config,
        }
        return ctx

    def test_the_source_issue_or_an_earlier_steps(self):
        row = {"ref": f"customer:{self.pizza.pk}"}
        self.assertEqual(
            jira_issues.validate_assign(
                {"issue": "source", "assignee_id": self.erin.pk}, row, self.ctx(), []
            ),
            {
                "connector_id": self.board.pk,
                "issue": "SUP-12",
                "assignee": None,
                "assignee_member_id": self.erin.pk,
            },
        )
        self.assertEqual(
            jira_issues.validate_assign(
                {"issue": "{{step 1.ticket_key}}", "assignee_id": self.erin.pk}, row, self.ctx(), []
            )["issue"],
            "{{step 1.ticket_key}}",
        )
        for bad in (
            {"issue": "ENG-9", "assignee_id": self.erin.pk},
            {"issue": "source", "assignee_id": None},
        ):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                jira_issues.validate_assign(bad, row, self.ctx(), [])

    def test_a_run_assigns_the_source_issue(self):
        bundle = self.outside_bundle(
            self.thread,
            ("jira.assign", self.assign_payload(self.board, "SUP-12", member=self.erin.pk)),
        )
        step = bundle.steps.get()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied", step.error)
        self.assertEqual(self.jira.assigned, [("SUP-12", "acc-erin")])
        self.assertEqual(
            step.outputs,
            {"ticket_key": "SUP-12", "ticket_url": "https://acme.atlassian.net/browse/SUP-12"},
        )

    def test_already_assigned_calls_nothing(self):
        self.jira.issues["SUP-12"]["assignee"] = "acc-erin"
        bundle = self.outside_bundle(
            self.thread,
            ("jira.assign", self.assign_payload(self.board, "SUP-12", member=self.erin.pk)),
        )
        self.run_all_steps(self.csm, bundle)
        self.assertEqual(self.jira.assigned, [])
        self.assertEqual(bundle.steps.get().status, "applied")
        lookup = AuditEvent.objects.get(action="agent_outside.call")
        self.assertEqual((lookup.metadata["op"], lookup.metadata["outcome"]), ("lookup", "found"))

    def test_it_assigns_the_issue_an_earlier_step_made(self):
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
            ),
        )
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(detail["steps"][1]["placeholders"][0]["label"], "Jira ticket from step 1")
        self.run_all_steps(self.csm, bundle)
        [made] = self.jira.created
        self.assertEqual(self.jira.assigned, [(made, "acc-erin")])

    def test_it_needs_its_issue_to_have_been_made(self):
        self.jira.refuse_next("create", "Jira says the project SUP needs a component.")
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
            ),
        )
        self.run_all_steps(self.csm, bundle)
        assign = bundle.steps.get(position=2)
        self.assertEqual(
            (assign.status, assign.error), ("failed", "Needs step 1, which didn't run.")
        )

    def test_it_cant_be_undone(self):
        bundle = self.outside_bundle(
            self.thread,
            ("jira.assign", self.assign_payload(self.board, "SUP-12", member=self.erin.pk)),
        )
        self.run_all_steps(self.csm, bundle)
        undo = self.client_for(self.csm).post(
            f"/api/v1/agents/actions/{bundle.steps.get().pk}/undo/"
        )
        self.assertEqual(undo.json()["detail"], "This Jira issue has been assigned.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_jira_assign_kind --parallel auto --noinput`
Expected: ERROR: `module 'services.agents.actions.jira_issues' has no attribute 'validate_assign'`.

- [ ] **Step 3: The kind**

Append to `services/agents/actions/jira_issues.py` (and drop Task 13's `# noqa: F401` on `placeholders` and `issue_url`):

```python
def validate_assign(payload, row, ctx, evidence):
    issue = str(payload.get("issue") or "").strip()
    ticket = ctx.thread_ticket
    if issue == "source":
        if ticket is None or ticket["provider"] != "jira" or ticket["record"] != row["ref"]:
            raise Invalid("this conversation has no Jira issue")
        issue, connector_id = ticket["external_id"], ticket["connector_id"]
    elif STEP_KEY.match(issue):
        if ctx.jira_connector is None:
            raise Invalid("no Jira connection")
        connector_id = ctx.jira_connector["id"]
    else:
        raise Invalid("an issue is the conversation's own or an earlier step's")
    member = payload.get("assignee_id")
    if not _member_ok(ctx, member):
        raise Invalid("the assignee is not a member")
    return {
        "connector_id": connector_id,
        "issue": issue,
        "assignee": None,
        "assignee_member_id": member,
    }


def preview_assign(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    where = _as(gates.connector_of(action))
    return {
        "jira_assign": {
            "site": where["site"],
            "issue": payload.get("issue", ""),
            "assignee": assignee_preview(payload),
            "as": where["as"],
        }
    }


def edit_assign(action, fields, runner):
    try:
        chosen = pick(fields.get("assignee"), nullable=False)
    except ValueError as exc:
        raise FieldErrors({"assignee": [str(exc)]}) from None
    return {**action.payload, "assignee": chosen, "assignee_member_id": None}


def apply_assign(action, actor, **_):
    if actor is None:
        raise Stale("a person assigns a Jira issue")
    # SOC2:AUTH-02 the tool's gate again at run: the switch and the grant
    stop = gates.blocked(action, actor)
    if stop is not None:
        raise StepFailed(stop.sentence)
    connector = gates.connector_of(action)
    payload = action.payload
    issue = payload["issue"]
    if placeholders.find({"issue": issue}):
        # run_step fills it first; an unfilled one never reaches Jira.
        raise StepFailed(placeholders.needs_sentence(placeholders.find({"issue": issue})[0][1]))
    tool = tools.current().jira
    try:
        wanted = account(tool, connector, payload)
        if wanted is None:
            raise StepFailed(CHOOSE_ASSIGNEE)
        now = tool.assignee(connector, issue=issue)
    except tools.Refused as exc:
        raise StepFailed(exc.sentence) from None
    done = now == wanted
    # D3-7: assigning reads first; already done is done.
    trail.call(
        action,
        actor,
        tool="jira",
        op="lookup",
        outcome="found" if done else "not_found",
        where=issue,
        returned=issue if done else "",
    )
    attempt = keys.attempt(action, actor)
    if not done:
        try:
            tool.assign(
                connector, issue=issue, account_id=wanted, assignee_name=assignee_name(payload)
            )
        except tools.Unconfirmed as exc:
            trail.call(action, actor, tool="jira", op="assign", outcome="unconfirmed", where=issue)
            raise StepFailed(exc.sentence, result=attempt) from None
        except tools.Refused as exc:
            trail.call(action, actor, tool="jira", op="assign", outcome="refused", where=issue)
            raise StepFailed(exc.sentence, result=attempt) from None
        trail.call(
            action, actor, tool="jira", op="assign", outcome="ok", where=issue, returned=issue
        )
    url = issue_url(connector.config, issue)
    return {"assignee": wanted}, {**attempt, "ticket_key": issue, "ticket_url": url}


def undo_assigned(action, actor):
    raise ChangedSince(ASSIGNED)


ASSIGN = Kind(
    key=AgentAction.Kind.JIRA_ASSIGN,
    label="Assign a Jira issue",
    example="Assign SUP-12 to Erin in engineering",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate_assign,
    target=lambda payload: f"jira:assign:{payload['issue']}"[:160],
    current=lambda action: None,
    preview=preview_assign,
    apply=apply_assign,
    undo=undo_assigned,
    texts=lambda payload: [],
    irreversible=True,
    outside=True,
    editable=("assignee",),
    edit=edit_assign,
    outputs=("ticket_key", "ticket_url"),
    cant_undo=ASSIGNED,
)
```

In `services/agents/registry.py` add `jira_issues.ASSIGN,` after `jira_issues.CREATE,`.

- [ ] **Step 4: Run the tests and the agents' own**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/actions/jira_issues.py services/agents/registry.py services/agents/tests/test_jira_assign_kind.py
git commit -m "feat(agents): jira.assign assigns the source issue or one a step made

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 15: Pick lists read live (`GET .../steps/<step_id>/options/<list>/`)

**Files:**
- Create: `services/agents/outside/options.py`, `services/agents/outside_views.py`
- Modify: `services/agents/urls.py`
- Test: `services/agents/tests/test_step_options.py` (create)

**Interfaces:**
- Consumes: Task 9's `tools.current().jira.options`, `ListFailed`; Task 10's `gates`; Task 12's `slack_replies.channels`; `bundle_run.cant_run_step`, `STEP_NOT_WAITING`; `bundle_payloads.bundle_for`, `no_such_bundle`.
- Produces: `options.LISTS`, `options.Refusal(status, body)`, `options.options(step, reader, name, *, project="", query="") -> {"options", "more"}`; the route (contract §5.2).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_step_options.py`:

```python
"""The live pick lists (agent bundles D3 contract §5.2, D3-8). Jira is a fake."""

from services.agents.tests.outside_fixtures import OutsideFixture

OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/{}/"


class StepOptionsTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.support = self.slack_connector()
        self.ticket, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
            ),
            ("slack.reply", self.slack_payload(self.ticket, self.support)),
        )
        self.create, self.assign, self.reply = self.bundle.steps.order_by("position")

    def get(self, step, name, user=None, **query):
        return self.client_for(user or self.csm).get(
            OPTIONS.format(self.bundle.pk, step.pk, name), query
        )

    def test_jiras_lists(self):
        self.assertEqual(
            self.get(self.create, "jira_projects").json(),
            {
                "options": [
                    {"id": "SUP", "name": "Support", "detail": "SUP"},
                    {"id": "ENG", "name": "Engineering", "detail": "ENG"},
                ],
                "more": False,
            },
        )
        self.assertEqual(
            self.get(self.create, "jira_issue_types").json(),
            {"project": ["Choose a project first."]},
        )
        types = self.get(self.create, "jira_issue_types", project="SUP").json()["options"]
        self.assertEqual([t["name"] for t in types], ["Task", "Bug"])
        self.assertEqual(
            [p["name"] for p in self.get(self.create, "jira_priorities").json()["options"]],
            ["High", "Medium", "Low"],
        )
        people = self.get(self.create, "jira_assignees", query="pri").json()["options"]
        self.assertEqual(
            people, [{"id": "acc-priya", "name": "Priya Shah", "detail": "priya@acme.io"}]
        )

    def test_an_assign_step_lists_by_its_producers_project(self):
        people = self.get(self.assign, "jira_assignees", query="erin").json()["options"]
        self.assertEqual([p["id"] for p in people], ["acc-erin"])

    def test_slack_channels_are_the_ones_revenact_reads(self):
        self.slack_connector(channel="C0ESCALATE", name="escalations")
        self.slack_connector(department="engineering", channel="C0ENG", name="eng")
        rows = self.get(self.reply, "slack_channels").json()["options"]
        self.assertEqual(
            [(r["name"], r["detail"]) for r in rows],
            [("#support", "This thread"), ("#escalations", "A new message")],
        )

    def test_refusals(self):
        self.assertEqual(
            self.get(self.create, "slack_channels").json(),
            {"list": ["This step has no such list."]},
        )
        self.assertEqual(
            self.get(self.create, "jira_projects", query="x" * 101).json(),
            {"query": ["Keep the search under 100 characters."]},
        )
        self.assertEqual(self.get(self.create, "jira_projects", user=self.other).status_code, 404)
        self.jira.fail_lists("TOOL_UNREACHABLE", "Couldn't reach Jira. Try again.", 502)
        unreachable = self.get(self.create, "jira_projects")
        self.assertEqual(
            (unreachable.status_code, unreachable.json()),
            (502, {"code": "TOOL_UNREACHABLE", "detail": "Couldn't reach Jira. Try again."}),
        )
        self.board.status = "error"
        self.board.save(update_fields=["status"])
        blocked = self.get(self.create, "jira_projects")
        self.assertEqual(
            (blocked.status_code, blocked.json()),
            (409, {"code": "TOOL_BLOCKED", "detail": "Reconnect Jira to do this."}),
        )

    def test_a_read_only_jira_still_lists(self):
        self.board.agents_can_act = False
        self.board.save(update_fields=["agents_can_act"])
        self.assertEqual(self.get(self.create, "jira_projects").status_code, 200)

    def test_only_a_waiting_or_failed_step_lists(self):
        self.create.status = "applied"
        self.create.save(update_fields=["status"])
        answer = self.get(self.create, "jira_projects")
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "STEP_NOT_WAITING"))
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_step_options --parallel auto --noinput`
Expected: FAIL: 404 on the route.

- [ ] **Step 3: The lists**

Create `services/agents/outside/options.py`:

```python
"""The live pick lists (agent bundles D3 contract §5.2, D3-8): Jira's
projects, issue types, priorities and assignable people, read through
Revenact for a person who may run the step; Slack's channels are the Slack
connectors Revenact reads (D3-4)."""

from services.connectors import agent_access
from services.metrics.models import AgentAction

from .. import placeholders
from . import gates, tools

K = AgentAction.Kind
LISTS = {
    K.JIRA_CREATE: ("jira_projects", "jira_issue_types", "jira_priorities", "jira_assignees"),
    K.JIRA_ASSIGN: ("jira_assignees",),
    K.SLACK_REPLY: ("slack_channels",),
}
QUERY_LIMIT = 100
NO_SUCH_LIST = "This step has no such list."
LONG_QUERY = "Keep the search under 100 characters."
PROJECT_FIRST = "Choose a project first."


class Refusal(Exception):
    def __init__(self, status, body):
        super().__init__(status)
        self.status, self.body = status, body


def _producer_project(step):
    """A placeholder issue's project: the producing step's (D3-7)."""
    named = placeholders.find({"issue": (step.payload or {}).get("issue", "")})
    if not named:
        return ""
    payload = (
        AgentAction.objects.filter(bundle_id=step.bundle_id, position=named[0][1])
        .values_list("payload", flat=True)
        .first()
    )
    return (payload or {}).get("project", "") if isinstance(payload, dict) else ""


def options(step, reader, name, *, project="", query=""):
    if name not in LISTS.get(step.kind, ()):
        raise Refusal(400, {"list": [NO_SUCH_LIST]})
    if len(query) > QUERY_LIMIT:
        raise Refusal(400, {"query": [LONG_QUERY]})
    if name == "slack_channels":
        from ..actions.slack_replies import channels

        source = (step.payload or {}).get("source_connector_id")
        rows = [
            {
                "id": str(c.pk),
                "name": gates.channel_name(c),
                "detail": "This thread" if c.pk == source else "A new message",
            }
            for c in channels(step, reader)
        ]
        return {"options": rows, "more": False}
    connector = gates.connector_of(step)
    # A read-only connector still lists: reading is not acting (D3-8).
    if connector is None or not connector.is_enabled or not agent_access.usable(connector):
        stop = gates.blocked(step, reader)
        detail = stop.sentence if stop is not None else gates.JIRA_GONE
        raise Refusal(409, {"code": "TOOL_BLOCKED", "detail": detail})
    payload = step.payload or {}
    issue = ""
    if name == "jira_issue_types" and not project:
        raise Refusal(400, {"project": [PROJECT_FIRST]})
    if name == "jira_assignees":
        if step.kind == K.JIRA_ASSIGN:
            raw = payload.get("issue", "")
            if placeholders.find({"issue": raw}):
                project = project or _producer_project(step)
            else:
                issue = raw
        else:
            project = project or payload.get("project", "")
        if not issue and not project:
            raise Refusal(400, {"project": [PROJECT_FIRST]})
    try:
        rows, more = tools.current().jira.options(
            connector, name, project=project, issue=issue, query=query
        )
    except tools.ListFailed as exc:
        raise Refusal(exc.status, {"code": exc.code, "detail": exc.detail}) from None
    return {"options": rows, "more": more}
```

Create `services/agents/outside_views.py`:

```python
"""GET /api/v1/agents/bundles/<id>/steps/<step_id>/options/<list>/ (agent
bundles D3 contract §5.2): 404 for a bundle the reader may not read, 403
for a step they may not run, 409 unless the step can still be edited."""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services.metrics.models import AgentAction

from .bundle_payloads import bundle_for, no_such_bundle
from .bundle_run import STEP_NOT_WAITING, cant_run_step
from .bundles import settle_stuck
from .deciding import may_decide
from .models import AgentBundle
from .outside import options

S = AgentAction.Status


class StepOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, step_pk, name):
        bundle = settle_stuck(bundle_for(request.user, pk))
        step = (
            bundle.steps.select_related("organisation", "customer", "account", "bundle")
            .filter(pk=step_pk)
            .first()
        )
        if step is None:
            raise no_such_bundle()
        # SOC2:AUTH-02 only a reader who may run the step reads the tool's lists for it
        if not may_decide(request.user, step):
            refused = cant_run_step(step)
            return Response(refused.body, status=refused.status)
        editable = step.status == S.PROPOSED or (
            step.status == S.FAILED and bundle.status != AgentBundle.Status.RUNNING
        )
        if not editable:
            return Response({"code": "STEP_NOT_WAITING", "detail": STEP_NOT_WAITING}, status=409)
        try:
            body = options.options(
                step,
                request.user,
                name,
                project=request.query_params.get("project", ""),
                query=request.query_params.get("query", ""),
            )
        except options.Refusal as refused:
            return Response(refused.body, status=refused.status)
        return Response(body)
```

In `services/agents/urls.py`, import `outside_views` and add after the retry route:

```python
(
    path(
        "bundles/<int:pk>/steps/<int:step_pk>/options/<str:name>/",
        outside_views.StepOptionsView.as_view(),
        name="agent-bundle-step-options",
    ),
)
```

- [ ] **Step 4: Run the tests and the agents' own**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside/options.py services/agents/outside_views.py services/agents/urls.py services/agents/tests/test_step_options.py
git commit -m "feat(agents): live Jira pick lists and Slack channels for a step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: A failed step tells its runner

**Files:**
- Modify: `services/notifications/models.py` (`Notification.Kind`)
- Create: `services/notifications/migrations/0015_agent_step_failed.py` (generated)
- Create: `services/agents/failure_notice.py`
- Modify: `services/agents/bundle_run.py` (`finish(ran=)`, `run_bundle`, `retry_step`), `services/agents/bundles.py` (`settle_stuck`)
- Test: `services/agents/tests/test_failure_notice.py` (create)

**Interfaces:**
- Produces: `Notification.Kind.AGENT_STEP_FAILED = "agent_step_failed"` ("Agent step failed"); `failure_notice.tell(bundle_id, runner_id, step_ids) -> Notification | None`; `bundle_run.finish(bundle_id, reader, *, event=..., ran=())`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_failure_notice.py`:

```python
"""A failed step tells its runner (agent bundles D3 contract §7, D3-15;
spec §8.3). Jira is a fake."""

from datetime import timedelta

from django.utils import timezone

from services.agents.bundles import settle_stuck
from services.agents.models import AgentBundle
from services.agents.tests.outside_fixtures import OutsideFixture
from services.notifications.models import Notification

KIND = Notification.Kind.AGENT_STEP_FAILED


class FailureNoticeTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        _, self.thread = self.slack_thread(self.pizza)

    def test_one_failed_step(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        self.jira.refuse_next("create", "Jira says the project SUP needs a component.")
        self.run_all_steps(self.csm, bundle)
        notice = Notification.objects.get(kind=KIND)
        self.assertEqual(notice.recipient, self.csm)
        self.assertIsNone(notice.actor)
        self.assertEqual(
            notice.message,
            "Step 1 failed in “Pizza Hut: login loop”: Jira says the project SUP needs a component.",
        )
        self.assertEqual(notice.link, f"/work?queue=history&bundle={bundle.pk}")

    def test_several_failed_steps_are_one_notice(self):
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.assign",
                self.assign_payload(self.board, "{{step 1.ticket_key}}", member=self.erin.pk),
            ),
        )
        self.jira.refuse_next("create", "Jira says the project SUP needs a component.")
        self.run_all_steps(self.csm, bundle)
        self.assertEqual(
            list(Notification.objects.filter(kind=KIND).values_list("message", flat=True)),
            ["2 steps failed in “Pizza Hut: login loop”."],
        )

    def test_a_retry_that_fails_again_tells_again_and_success_tells_nothing(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        self.jira.refuse_next("create", "Jira is busy. Retry in a minute.")
        self.run_all_steps(self.csm, bundle)
        step = bundle.steps.get()
        self.jira.refuse_next("create", "Jira is busy. Retry in a minute.")
        self.retry(self.csm, step)
        self.assertEqual(Notification.objects.filter(kind=KIND).count(), 2)
        self.retry(self.csm, step)
        self.assertEqual(Notification.objects.filter(kind=KIND).count(), 2)

    def test_a_settled_stuck_run_tells_its_runner(self):
        bundle = self.outside_bundle(self.thread, ("jira.create", self.jira_payload(self.board)))
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status=AgentBundle.Status.RUNNING,
            run_by=self.csm,
            run_started_at=timezone.now() - timedelta(minutes=20),
        )
        settle_stuck(AgentBundle.objects.get(pk=bundle.pk))
        self.assertEqual(
            Notification.objects.get(kind=KIND).message,
            "Step 1 failed in “Pizza Hut: login loop”: This step didn't finish. Retry it.",
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_failure_notice --parallel auto --noinput`
Expected: ERROR: `type object 'Kind' has no attribute 'AGENT_STEP_FAILED'`.

- [ ] **Step 3: The kind and the notice**

In `services/notifications/models.py`, `Notification.Kind`, after `AGENT_PROPOSAL_WAITING`:

```python
        AGENT_STEP_FAILED = "agent_step_failed", "Agent step failed"
```

Run: `$PY manage.py makemigrations notifications --name agent_step_failed`
Expected: `services/notifications/migrations/0015_agent_step_failed.py`, one `AlterField` on `notification.kind`.

Create `services/agents/failure_notice.py`:

```python
"""`agent_step_failed` (agent bundles D3 contract §7, D3-15): once per run,
retry or settled stuck run that left any of its steps failed, to its
runner, linking the bundle in History. A failure here is logged and never
undoes the run."""

import logging

from services.accounts.models import User
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.notifications.realtime import notify

from .models import AgentBundle

logger = logging.getLogger(__name__)
TITLE_LIMIT = 120


def tell(bundle_id, runner_id, step_ids):
    if runner_id is None or not step_ids:
        return None
    try:
        failed = list(
            AgentAction.objects.filter(
                pk__in=list(step_ids), bundle_id=bundle_id, status=AgentAction.Status.FAILED
            )
            .order_by("position")
            .values("position", "error")
        )
        if not failed:
            return None
        runner = User.objects.filter(pk=runner_id, is_active=True).first()
        title = AgentBundle.objects.filter(pk=bundle_id).values_list("title", flat=True).first()
        if runner is None or title is None:
            return None
        title = title[:TITLE_LIMIT]
        if len(failed) == 1:
            message = f"Step {failed[0]['position']} failed in “{title}”: {failed[0]['error']}"
        else:
            message = f"{len(failed)} steps failed in “{title}”."
        return notify(
            recipient=runner,
            actor=None,
            kind=Notification.Kind.AGENT_STEP_FAILED,
            message=message[:500],
            link=f"/work?queue=history&bundle={bundle_id}",
            push_on_commit=True,
        )
    except Exception as exc:  # noqa: BLE001 - a notice never undoes a run
        logger.warning(
            "agents: the failed-step notice for bundle %s failed: %s", bundle_id, type(exc).__name__
        )
        return None
```

- [ ] **Step 4: Who ran what**

In `services/agents/bundle_run.py`:

`finish` gains `ran=()` and tells the runner after its transaction:

```python
def finish(bundle_id, reader, *, event="agent_bundle.run_finished", ran=()):
    with transaction.atomic():
        ...  # unchanged
    from .failure_notice import tell

    tell(bundle.pk, reader.pk if reader is not None else None, ran)
    return bundle
```

`run_bundle`'s loop keeps what it ran:

```python
    outputs, ran = {}, []
    for step in bundle.steps.filter(selected=True, status=S.PROPOSED).order_by("position"):
        done = run_step(step.pk, reader, outputs)
        ran.append(done.pk)
        if done.status == S.APPLIED:
            outputs[done.position] = done.outputs
    return finish(bundle.pk, reader, ran=ran)
```

and `retry_step`'s last line becomes `return finish(bundle.pk, reader, event="agent_bundle.run_finished", ran=[step.pk])`.

In `services/agents/bundles.py`, `settle_stuck`: collect the stuck steps' ids inside the transaction (`failed_ids = []`, `failed_ids.append(step.pk)` in the loop), and after the `with transaction.atomic():` block, before `return fresh`:

```python
    from .failure_notice import tell

    tell(fresh.pk, fresh.run_by_id, failed_ids)
```

- [ ] **Step 5: Run the tests and the agents' and notifications' own**

Run: `$PY manage.py test services.agents services.notifications --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/notifications/models.py services/notifications/migrations/0015_agent_step_failed.py services/agents/failure_notice.py services/agents/bundle_run.py services/agents/bundles.py services/agents/tests/test_failure_notice.py
git commit -m "feat(agents): a failed step tells the person who ran it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: The agents may propose outside steps, under the twice-filter

**Files:**
- Modify: `services/agents/evidence.py` (`_thread` fills the thread fields; `_jira`; `build` and `build_for_thread` call it)
- Modify: `services/agents/outside/offered.py`
- Modify: `services/agents/prompt.py` (`PAYLOADS`, `OUTSIDE_RULES`, `outside_rules`, `{outside}` in both prompts)
- Modify: `services/agents/run.py` (`_consider`'s out-check)
- Test: `services/agents/tests/test_outside_proposals.py` (create)

**Interfaces:**
- Consumes: Tasks 11 to 14's kinds; Task 9's `Context` fields.
- Produces: `evidence._jira(ctx)`; `Context.thread_email` `{"id", "record", "line", "address", "subject", "mailbox_id"}`, `thread_ticket` `{"id", "record", "line", "provider", "connector_id", "external_id", "number", "config"}`, `thread_channel` (`"email"`/`"ticket"`), `jira_connector` `{"id", "project"}`; `offered(ctx)` (contract D3-18); `prompt.outside_rules(allowed) -> str`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_outside_proposals.py`:

```python
"""What the agents may propose outside (agent bundles D3 contract D3-18 to
D3-20, D3-28; spec §4.4): offered only where the thread or the workspace
allows, written from the conversation, checked on the way out. The model is
a fake."""

import json
from unittest.mock import patch

from services.agents import evidence, run
from services.agents.models import AgentPolicy
from services.agents.outside.offered import offered
from services.agents.tests.outside_fixtures import OutsideFixture
from services.customers.models import Task
from services.metrics.models import AgentAction
from services.work.clock import today_for

NIGHTLY = "services.agents.run.get_completion"


class OutsideProposalTests(OutsideFixture):
    def test_what_each_context_offers(self):
        self.jira_connector()
        _, mail = self.mail_thread(self.pizza, self.csm)
        _, slack = self.slack_thread(self.pizza)
        mail_ctx, _ = self.thread_ctx(mail)
        slack_ctx, _ = self.thread_ctx(slack)
        self.assertEqual(offered(mail_ctx), {"mail.send_reply", "jira.create", "jira.assign"})
        self.assertEqual(offered(slack_ctx), {"slack.reply", "jira.create", "jira.assign"})
        self.assertEqual(mail_ctx.thread_email["address"], "ann@x.com")
        self.assertEqual(
            (slack_ctx.thread_ticket["provider"], slack_ctx.thread_channel), ("slack", "ticket")
        )
        nightly = evidence.build(self.org, "cs", today=self.today)
        self.assertEqual(offered(nightly), {"jira.create", "jira.assign"})

    def test_no_jira_no_jira_kinds_in_the_prompt(self):
        _, slack = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(slack)
        self.assertEqual(offered(ctx), {"slack.reply"})
        _, model = self.run_intake(self.answer())
        system = model.call_args.kwargs["system"]
        self.assertIn("slack.reply", system)
        self.assertNotIn("jira.create", system)
        self.assertIn("never {{step N.key}} in a reply", system)

    def test_a_slack_thread_becomes_a_reply_an_issue_and_an_assignment(self):
        board = self.jira_connector()
        support = self.slack_connector()
        ticket, thread = self.slack_thread(self.pizza, support)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "ticket ")
        ref = ctx.thread_ref
        raw = self.answer(
            {
                "kind": "slack.reply",
                "record": ref,
                "title": "Tell Ann we're on it",
                "rationale": "She is locked out.",
                "evidence": [line],
                "payload": {"text": "Thanks Ann, we're on it.", "channel": "C0EVIL"},
            },
            {
                "kind": "jira.create",
                "record": ref,
                "title": "Log the login loop",
                "rationale": "Engineering must fix it.",
                "evidence": [line],
                "payload": {
                    "summary": "Login loop after password reset",
                    "description": "Nobody can log in.",
                    "priority": "high",
                    "assignee_id": None,
                },
            },
            {
                "kind": "jira.assign",
                "record": ref,
                "title": "Give it to Erin",
                "rationale": "She owns login.",
                "evidence": [line],
                "payload": {"issue": "{{step 2.ticket_key}}", "assignee_id": self.erin.pk},
            },
        )
        result, _ = self.run_intake(raw)
        self.assertEqual(result.made, 1)
        steps = list(AgentAction.objects.filter(bundle__thread=thread).order_by("position"))
        self.assertEqual([s.kind for s in steps], ["slack.reply", "jira.create", "jira.assign"])
        self.assertEqual(
            (steps[0].payload["channel"], steps[0].payload["thread_ts"]),
            ("C0SUPPORT", ticket.external_id),
        )
        self.assertEqual(
            (steps[1].payload["connector_id"], steps[1].payload["project"]), (board.pk, "SUP")
        )
        self.assertEqual(steps[2].payload["issue"], "{{step 2.ticket_key}}")
        self.assertTrue(all(s.status == "proposed" for s in steps))

    def test_one_reply_per_email(self):
        email, thread = self.mail_thread(self.pizza, self.csm)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "email ")
        reply = {
            "kind": "mail.send_reply",
            "record": ctx.thread_ref,
            "title": "Answer Ann",
            "rationale": "She asked.",
            "evidence": [line],
            "payload": {"body": "We're on it."},
        }
        draft = {
            **reply,
            "kind": "draft.reply",
            "payload": {"email_id": email.pk, "body": "We're on it."},
        }
        self.run_intake(self.answer(reply, draft))
        self.assertEqual(
            list(AgentAction.objects.filter(bundle__thread=thread).values_list("kind", flat=True)),
            ["mail.send_reply"],
        )
        stored = AgentAction.objects.get(kind="mail.send_reply").payload
        self.assertEqual((stored["to"], stored["cc"]), (["ann@x.com"], []))

    def test_text_that_leaves_names_nothing_internal(self):
        Task.objects.create(
            customer=self.pizza,
            title="Escalate the billing dispute",
            assignee=self.csm,
            assignee_name=self.csm.name,
            created_by=self.csm,
            due_date=self.today,
        )
        _, thread = self.slack_thread(self.pizza)
        ctx, _ = self.thread_ctx(thread)
        line = self.thread_line(ctx, "ticket ")
        leak = {
            "kind": "slack.reply",
            "record": ctx.thread_ref,
            "title": "Reply",
            "rationale": "Why.",
            "evidence": [line],
            "payload": {"text": "We will Escalate the billing dispute today."},
        }
        result, _ = self.run_intake(self.answer(leak))
        self.assertFalse(AgentAction.objects.filter(kind="slack.reply").exists())

    def test_a_reply_cites_only_its_own_email(self):
        _, thread = self.mail_thread(self.pizza, self.csm)
        ctx, _ = self.thread_ctx(thread)
        other = self.thread_line(ctx, "- ")
        item = {
            "kind": "mail.send_reply",
            "record": ctx.thread_ref,
            "title": "Answer",
            "rationale": "Why.",
            "evidence": [other],
            "payload": {"body": "Hi"},
        }
        self.run_intake(self.answer(item))
        self.assertFalse(AgentAction.objects.filter(kind="mail.send_reply").exists())

    def test_the_nightly_pass_may_open_a_jira_issue_and_never_reply(self):
        self.jira_connector()
        ctx = evidence.build(self.org, "cs", today=today_for(self.org))
        ref = f"customer:{self.pizza.pk}"
        line = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))
        items = [
            {
                "kind": "jira.create",
                "record": ref,
                "title": "Log the renewal blocker",
                "rationale": "Renews soon.",
                "evidence": [line],
                "payload": {
                    "summary": "Renewal blocker",
                    "description": "Check it.",
                    "priority": "medium",
                    "assignee_id": None,
                },
            },
            {
                "kind": "mail.send_reply",
                "record": ref,
                "title": "Email them",
                "rationale": "Why.",
                "evidence": [line],
                "payload": {"body": "Hi"},
            },
        ]
        with patch(NIGHTLY, return_value=json.dumps(items)) as model:
            run.run(self.org, "cs")
        self.assertEqual(list(AgentAction.objects.values_list("kind", flat=True)), ["jira.create"])
        self.assertNotIn("mail.send_reply", model.call_args.kwargs["system"])

    def test_every_other_kind_on_never_leaves_the_agent_off(self):
        self.jira_connector()
        _, thread = self.slack_thread(self.pizza)
        from services.agents.registry import REGISTRY, kinds_for

        AgentPolicy.objects.update_or_create(
            organisation=self.org,
            defaults={
                "levels": {"cs": {k: "never" for k in kinds_for("cs") if not REGISTRY[k].outside}}
            },
        )
        _, model = self.run_intake(self.answer())
        model.assert_not_called()
        thread.refresh_from_db()
        self.assertEqual((thread.status, thread.skip_reason), ("skipped", "agent_off"))
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_outside_proposals --parallel auto --noinput`
Expected: FAIL: `offered()` is empty; nothing outside is proposed.

- [ ] **Step 3: What the context knows**

In `services/agents/evidence.py`, `_thread`, mail branch: after the `ctx.thread_lines.append(...)` line add:

```python
        ctx.thread_channel = "email"
        if newest.direction == Email.Direction.RECEIVED and newest.from_address:
            # D3-18: the email a reply answers, whoever's mailbox it went to.
            ctx.thread_email = {
                "id": newest.pk,
                "record": row["ref"],
                "line": ctx.thread_lines[-1],
                "address": newest.from_address,
                "subject": _reply_subject(newest.subject),
                "mailbox_id": newest.mailbox_id,
            }
```

ticket branch: after `ctx.thread_lines = [line]`:

```python
    ctx.thread_channel = "ticket"
    connector = ticket.connector
    ctx.thread_ticket = {
        "id": ticket.pk,
        "record": row["ref"],
        "line": line,
        "provider": connector.provider if connector is not None else "",
        "connector_id": ticket.connector_id,
        "external_id": ticket.external_id,
        "number": ticket.ticket_number,
        "config": dict(connector.config or {}) if connector is not None else {},
    }
```

Add after `_thread`:

```python
def _jira(ctx):
    """D3-18: the Jira connector a Jira step goes through: the thread's own
    when it came from Jira, else the workspace's oldest enabled one with
    credentials and not in error. None without one."""
    from services.connectors.models import Connector

    ticket = ctx.thread_ticket
    if ticket is not None and ticket["provider"] == Connector.Provider.JIRA:
        ctx.jira_connector = {
            "id": ticket["connector_id"],
            "project": (ticket["config"] or {}).get("project", ""),
        }
        return
    row = (
        Connector.objects.filter(
            organisation=ctx.organisation, provider=Connector.Provider.JIRA, is_enabled=True
        )
        .exclude(credentials="")
        .exclude(status=Connector.Status.ERROR)
        .order_by("pk")
        .values("pk", "config")
        .first()
    )
    ctx.jira_connector = (
        {"id": row["pk"], "project": (row["config"] or {}).get("project", "")} if row else None
    )
```

Call it: in `build`, inside `if agent in FUNCTION:` after `_open_plans(...)`, add `_jira(ctx)`; in `build_for_thread`, after `_thread(ctx, thread, row, route)`, add `_jira(ctx)`.

- [ ] **Step 4: What is offered**

Replace `services/agents/outside/offered.py`:

```python
"""Which outside kinds a context may offer the model (agent bundles D3
contract D3-18): a reply where the thread has a customer's email, a Slack
reply on a Slack thread, Jira wherever the workspace has a Jira connector.
Read only or not: a proposal for a read-only tool shows disabled (spec §7.4)."""

from services.metrics.models import AgentAction

K = AgentAction.Kind


def offered(ctx):
    kinds = set()
    if ctx.thread_email is not None:
        kinds.add(K.MAIL_SEND_REPLY)
    ticket = ctx.thread_ticket
    if ticket is not None and ticket["provider"] == "slack":
        kinds.add(K.SLACK_REPLY)
    if ctx.jira_connector is not None:
        kinds |= {K.JIRA_CREATE, K.JIRA_ASSIGN}
    return kinds
```

- [ ] **Step 5: The prompt**

In `services/agents/prompt.py`, add to `PAYLOADS`:

```python
    "mail.send_reply": '{"body": <the reply to the newest customer email, plain text, at most '
    "4000 characters>}",
    "slack.reply": '{"text": <the reply in the Slack thread, plain text, at most 3000 '
    "characters>}",
    "jira.create": '{"summary": <at most 200 characters>, "description": <what needs doing, '
    'plain text, at most 4000 characters>, "priority": "high"|"medium"|"low", "assignee_id": '
    "<member id or null>}",
    "jira.assign": '{"issue": "source" (this conversation\'s own Jira issue) or "{{step '
    'N.ticket_key}}" (an issue an earlier jira.create makes), "assignee_id": <member id>}',
```

and after `steps_rule`:

```python
#: Agent bundles D3 (contract D3-18, D3-19): one line per offered outside kind.
OUTSIDE_RULES = {
    "mail.send_reply": "A mail.send_reply is emailed to the customer when a person runs it: "
    "it answers the newest customer email only and cites only that email's line.",
    "slack.reply": "A slack.reply is posted in the customer's Slack thread when a person runs "
    "it: it cites only the conversation.",
    "jira.create": "A jira.create opens a Jira issue for the team that fixes things: describe "
    "the problem plainly.",
    "jira.assign": 'A jira.assign gives a Jira issue to a member: "source" is this '
    "conversation's own Jira issue.",
}
OUTSIDE_COMMON = (
    "Text that leaves Revenact (a reply, a Slack message, a Jira issue) is written from the "
    "conversation or the record's lines alone: never a task, a note, a plan, another record or "
    "a figure from the record's block, and never {{step N.key}} in a reply.",
    "Answer a conversation with at most one of draft.reply, mail.send_reply and slack.reply.",
)


REPLIES = {"mail.send_reply", "slack.reply"}


def outside_rules(allowed):
    """The rule lines for the outside kinds `allowed` offers; "" for none.
    The one-reply rule only where a reply kind is offered."""
    rules = [OUTSIDE_RULES[kind] for kind in allowed if kind in OUTSIDE_RULES]
    if not rules:
        return ""
    common = [OUTSIDE_COMMON[0], *(OUTSIDE_COMMON[1:] if REPLIES & set(allowed) else ())]
    return "".join(f"\n- {rule}" for rule in [*rules, *common])
```

In `SYSTEM`, the line `- The actions for one record are run together, in the order you write them.{steps}` becomes `...in the order you write them.{steps}{outside}`; in `THREAD_SYSTEM`, `- At most one action per record and field.{steps}` becomes `- At most one action per record and field.{steps}{outside}`. Both `system()` and `thread_system()` pass `outside=outside_rules(allowed)` to `.format(...)`.

- [ ] **Step 6: The out-check**

In `services/agents/run.py`, `_consider`, replace the block from `if draft:` through the `elif not threaded and evidence_.source_mentions(...)` raise with:

```python
    if draft or spec.outside:
        if draft:
            channel = "email" if "email_id" in payload else "ticket"
        else:
            # A message bundle's step may name its own source (D2-12); nothing else.
            channel = ctx.thread_channel if threaded else None
        # SOC2:AUTH-02 text that leaves Revenact (a draft reply, a sent reply, a Slack
        # message, a Jira issue) names no task, note, plan or other source (D3-19)
        if evidence_.internal_mentions(ctx, ref, texts, channel):
            raise Invalid("text that leaves Revenact names something internal")
    # SOC2:AUTH-02 and no other action names its record's mail or tickets
    # (a message bundle's steps may: D2-12)
    elif not threaded and evidence_.source_mentions(ctx, ref, texts):
        raise Invalid("names an email or ticket on its record")
```

- [ ] **Step 7: Run the tests and the agents' own**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: PASS. A D1/D2 test that pins the whole system prompt text gains nothing (no outside kind is offered there: no thread email, no Slack ticket, no Jira connector), so it still matches; if one pins the prompt for a mail thread, add the reply's two rule lines to its expectation (that is D3-18, not a regression).

- [ ] **Step 8: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/evidence.py services/agents/outside/offered.py services/agents/prompt.py services/agents/run.py services/agents/tests/test_outside_proposals.py
git commit -m "feat(agents): the agents propose replies, Slack posts and Jira steps, filtered

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Query ceilings and no DISTINCT

**Files:**
- Test: `services/agents/tests/test_outside_queries.py` (create)
- Modify: `services/agents/tests/test_intake_queries.py` (`THREAD_RUN_QUERIES`, re-measured)

**Interfaces:**
- Consumes: everything above. Produces: the measured `OUTSIDE_DETAIL_QUERIES`, `OUTSIDE_HISTORY_QUERIES`, `OPTIONS_QUERIES` and the re-measured `THREAD_RUN_QUERIES`, written into the contract's "Changes during the build" and `docs/API_CONTRACTS.md` (Task 20).

- [ ] **Step 1: Write the tests**

Create `services/agents/tests/test_outside_queries.py`:

```python
"""Outside steps cost the same however many there are (agent bundles D3
contract §9): a waiting bundle's detail with 1 or 8 outside steps, a
History page of bundles whose outside steps ran, and the options route.
No query uses DISTINCT (Postgres 16)."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.models import AgentBundle
from services.agents.tests.outside_fixtures import OutsideFixture
from services.agents.tests.test_bundle_queries import BUNDLE_DETAIL_CEILING, HISTORY_CEILING
from services.agents.tests.test_intake_queries import no_distinct

DETAIL = "/api/v1/agents/bundles/{}/"
HISTORY = "/api/v1/agents/bundles/history/"
OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/jira_projects/"


class OutsideQueryTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.support = self.slack_connector()
        self.gmail_for(self.csm)

    def bundle_of(self, steps):
        email, mail = self.mail_thread(
            self.pizza, self.csm, thread=f"t{AgentBundle.objects.count()}"
        )
        ticket, _ = self.slack_thread(self.pizza, self.support)
        kinds = [
            ("mail.send_reply", self.mail_payload(email)),
            ("slack.reply", self.slack_payload(ticket, self.support)),
            ("jira.create", self.jira_payload(self.board, member=self.erin.pk)),
            ("jira.assign", self.assign_payload(self.board, "SUP-12", member=self.erin.pk)),
        ]
        return self.outside_bundle(mail, *[kinds[n % 4] for n in range(steps)])

    def measure(self, url):
        client = self.client_for(self.csm)
        client.get(url)
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(url).status_code, 200)
        no_distinct(self, queries)
        return len(queries)

    def test_a_bundles_detail_is_constant_in_its_outside_steps(self):
        one = self.measure(DETAIL.format(self.bundle_of(1).pk))
        eight = self.measure(DETAIL.format(self.bundle_of(8).pk))
        self.assertEqual(one, eight)
        self.assertLessEqual(eight, BUNDLE_DETAIL_CEILING + 2)

    def test_a_history_page_is_constant_in_its_rows(self):
        def ran():
            bundle = self.bundle_of(4)
            self.run_all_steps(self.csm, bundle)

        ran()
        small = self.measure(HISTORY)
        for _ in range(3):
            ran()
        self.assertEqual(self.measure(HISTORY), small)
        self.assertLessEqual(small, HISTORY_CEILING + 1)

    def test_the_options_route_is_constant(self):
        bundle = self.bundle_of(3)
        step = bundle.steps.get(position=3)
        first = self.measure(OPTIONS.format(bundle.pk, step.pk))
        self.bundle_of(8)
        self.assertEqual(self.measure(OPTIONS.format(bundle.pk, step.pk)), first)
```

(The `mail_thread` helper takes `thread=`: each bundle's mail thread is its own.)

- [ ] **Step 2: Run them; measure; pin**

Run: `$PY manage.py test services.agents.tests.test_outside_queries services.agents.tests.test_intake_queries --parallel auto --noinput`
Expected: PASS for the three new tests. `test_intake_queries`' `THREAD_RUN_QUERIES` may now fail by one or two (Task 17 reads the thread's connector and the workspace's Jira connector): re-measure it by printing `len(queries)` in that test once, set the constant to the new number with a comment ("+1 the thread's connector, +1 the workspace's Jira connector: agent bundles D3"), and record it. Print the three new counts the same way (one throwaway `print`) and write them, with the new `THREAD_RUN_QUERIES`, into the contract's "Changes during the build" as `OUTSIDE_DETAIL_QUERIES`, `OUTSIDE_HISTORY_QUERIES`, `OPTIONS_QUERIES`; then remove the prints.

- [ ] **Step 3: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/tests/test_outside_queries.py services/agents/tests/test_intake_queries.py docs/superpowers/plans/2026-10-13-agent-bundles-d3-api.md
git commit -m "test(agents): outside steps' query ceilings, no DISTINCT

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: The end-to-end journey

**Files:**
- Create: `e2e/test_agent_outside_flow.py`

**Interfaces:**
- Consumes: every route above, over real HTTP; the real tools with the fake vendors (`FakeSlackApi`, `FakeJiraApi`) patched in, so the whole path below the facade runs too.

- [ ] **Step 1: Write the journey**

Create `e2e/test_agent_outside_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB; Slack and Jira are
fakes (their APIs in memory), the model is a fake. Nothing leaves the process.

Alice connects Slack (a pasted bot token) and Jira for Customer Success. A
customer's Slack message is synced; twenty minutes later run_agent_signals
reads it: Carl, who owns Pizza Hut, finds a bundle of a Slack reply, a Jira
issue and its assignment, all disabled until an admin lets agents act. Alice
allows both (Slack needs chat:write first). Carl runs it: the post goes out,
Jira's answer to the create is lost, so the create fails "couldn't confirm"
and the assignment waits on it, and Carl is told. His Retry finds the issue
by its label and makes no second; the assignment then runs. History shows
the links; every call is in the audit log."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from core.models import AuditEvent
from e2e.http import http_get, http_post
from services.accounts.models import Organisation, User
from services.agents import evidence, routing
from services.agents.models import AgentBundle, SignalThread
from services.billing.models import BillingAccount
from services.connectors.models import Connector
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import FakeSlackApi, use_slack
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer
from services.notifications.models import Notification
from services.work.clock import today_for


class AgentOutsideFlowTests(LiveServerTestCase):
    def setUp(self):
        no_model = patch(
            "services.customers.classification.get_completion",
            side_effect=CopilotNotConfigured("no model in tests"),
        )
        no_model.start()
        self.addCleanup(no_model.stop)
        self.slack = use_slack(self, FakeSlackApi())
        # An hour ago: a first import older than 7 days would be skipped as stale (D2-22).
        self.ts = f"{int(timezone.now().timestamp()) - 3600}.000100"
        self.slack.channels["C0SUPPORT"] = [
            {"ts": self.ts, "user": "U1", "text": "Nobody can log in since the reset."}
        ]
        self.jira = use_jira(self)

    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def test_full_flow(self):
        # 1. Alice's workspace; Carl (CS) owns Pizza Hut; Priya is in Engineering.
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
        BillingAccount.objects.filter(organisation__name="Acme Inc").update(seats_limit=10)
        people = {}
        for name, email in (("Carl CSM", "carl@acme.io"), ("Priya Shah", "priya@acme.io")):
            status, body = http_post(
                self.api("/auth/users/"),
                {"name": name, "email": email, "password": "memberpass12"},
                token=alice,
            )
            self.assertEqual(status, 201, body)
            people[email] = User.objects.get(pk=body["id"])
        carl, priya = people["carl@acme.io"], people["priya@acme.io"]
        User.objects.filter(pk=carl.pk).update(function=User.Function.CS)
        org = carl.organisation
        pizza = Customer.objects.create(
            organisation=org,
            name="Pizza Hut",
            owner=carl,
            domain="pizzahut.com",
            arr_billed_at_account=Decimal(300_000),
        )

        # 2. Alice connects Slack with a pasted token and Jira with an API token.
        status, slack = http_post(
            self.api("/connectors/"),
            {"provider": "slack", "name": "Support Slack", "department": "cs"},
            token=alice,
        )
        self.assertEqual(status, 201, slack)
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/connect/"),
            {"channel": "C0SUPPORT", "bot_token": "xoxb-e2e"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        status, jira = http_post(
            self.api("/connectors/"),
            {"provider": "jira", "name": "Jira", "department": "engineering"},
            token=alice,
        )
        self.assertEqual(status, 201, jira)
        status, body = http_post(
            self.api(f"/connectors/{jira['id']}/connect/"),
            {"site": "acme", "email": "bot@acme.io", "api_token": "t", "project": "SUP"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        self.assertEqual(
            body["agents"],
            {
                "kinds": ["jira.create", "jira.assign"],
                "can_act": False,
                "needs": "permission",
                "allowed_by": None,
                "allowed_at": None,
            },
        )

        # 3. The Slack message is synced; quiet for 20 minutes; the agents read it.
        status, _ = http_post(self.api(f"/connectors/{slack['id']}/sync/"), {}, token=alice)
        self.assertEqual(status, 200)
        thread = SignalThread.objects.get()
        SignalThread.objects.update(last_message_at=timezone.now() - timedelta(minutes=20))
        Organisation.objects.update(ai_signals_ran_at=None)
        route, _ = routing.route(thread)
        ctx = evidence.build_for_thread(org, "cs", thread, route, today=today_for(org))
        line = next(
            x for x in sorted(evidence.record_lines(ctx, ctx.thread_ref)) if x.startswith("ticket ")
        )
        ref = ctx.thread_ref
        answer = {
            "title": "Pizza Hut: login loop",
            "reason": "Ann can't log in since the reset.",
            "actions": [
                {
                    "kind": "slack.reply",
                    "record": ref,
                    "title": "Tell Ann we're on it",
                    "rationale": "She is locked out.",
                    "evidence": [line],
                    "payload": {"text": "Thanks Ann, we're on it."},
                },
                {
                    "kind": "jira.create",
                    "record": ref,
                    "title": "Log the login loop",
                    "rationale": "Engineering must fix it.",
                    "evidence": [line],
                    "payload": {
                        "summary": "Login loop after password reset",
                        "description": "Nobody can log in since the reset.",
                        "priority": "high",
                        "assignee_id": None,
                    },
                },
                {
                    "kind": "jira.assign",
                    "record": ref,
                    "title": "Give it to Priya",
                    "rationale": "She owns login.",
                    "evidence": [line],
                    "payload": {"issue": "{{step 2.ticket_key}}", "assignee_id": priya.pk},
                },
            ],
        }
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.intake.get_completion", return_value=json.dumps(answer)),
        ):
            call_command("run_agent_signals")
        bundle = AgentBundle.objects.get(thread=thread)
        carl_token = self.login("carl@acme.io")

        # 4. Carl sees every step disabled until an admin lets agents act.
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl_token)
        self.assertEqual(status, 200, detail)
        self.assertEqual(
            [
                (s["kind"], s["can_run"], s["disabled_reason"], s["disabled_link"])
                for s in detail["steps"]
            ],
            [
                (
                    "slack.reply",
                    False,
                    "Ask an admin to allow Revenact to post in Slack.",
                    "/settings/connections",
                ),
                (
                    "jira.create",
                    False,
                    "Ask an admin to allow agents to act in Jira.",
                    "/settings/connections",
                ),
                (
                    "jira.assign",
                    False,
                    "Ask an admin to allow agents to act in Jira.",
                    "/settings/connections",
                ),
            ],
        )
        self.assertTrue(detail["can_reject"])

        # 5. Alice allows Jira; Slack needs chat:write on the token first.
        status, body = http_post(
            self.api(f"/connectors/{jira['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["agents"]["can_act"]), (200, True))
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["code"]), (409, "SLACK_SCOPE_MISSING"))
        self.slack.scopes.append("chat:write")
        status, body = http_post(
            self.api(f"/connectors/{slack['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["agents"]["can_act"]), (200, True))

        # 6. Carl runs it; Jira's answer to the create is lost.
        self.jira.drop_next(r"POST /rest/api/3/issue$")
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl_token)
        self.assertTrue(all(s["can_run"] for s in detail["steps"]))
        rows = [{"id": s["id"], "selected": True} for s in detail["steps"]]
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"), {"steps": rows}, token=carl_token
        )
        self.assertEqual(status, 200, body)
        steps = body["bundle"]["steps"]
        self.assertEqual(
            [(s["status"], s["error"]) for s in steps],
            [
                ("applied", ""),
                ("failed", "We couldn't confirm Jira made the issue. Retry checks Jira first."),
                ("failed", "Needs step 2, which didn't run."),
            ],
        )
        self.assertEqual(body["bundle"]["status"], "partly_done")
        self.assertEqual(len(self.slack.posts()), 1)
        self.assertEqual(self.slack.posts()[0]["thread_ts"], self.ts)
        self.assertEqual(len(self.jira.created), 1)
        notice = Notification.objects.get(recipient=carl, kind=Notification.Kind.AGENT_STEP_FAILED)
        self.assertEqual(notice.message, "2 steps failed in “Pizza Hut: login loop”.")

        # 7. Retry finds the issue by its label: no second; then the assignment runs.
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/steps/{steps[1]['id']}/retry/"),
            {},
            token=carl_token,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(len(self.jira.created), 1)
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/steps/{steps[2]['id']}/retry/"),
            {},
            token=carl_token,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["bundle"]["status"], "done")
        [key] = self.jira.created
        self.assertEqual(self.jira.assigned, [(key, "acc-priya")])

        # 8. History shows the result links; the audit log has every call.
        status, history = http_get(self.api("/agents/bundles/history/"), carl_token)
        self.assertEqual(status, 200)
        links = [link["label"] for step in history["results"][0]["steps"] for link in step["links"]]
        self.assertEqual(
            links, ["Open the Slack message", f"Open {key} in Jira", f"Open {key} in Jira"]
        )
        calls = list(
            AuditEvent.objects.filter(action="agent_outside.call").values_list(
                "metadata__op", "metadata__outcome"
            )
        )
        self.assertIn(("create", "unconfirmed"), calls)
        self.assertIn(("lookup", "found"), calls)
        self.assertIn(("post", "ok"), calls)
        self.assertTrue(AuditEvent.objects.filter(action="connector.agent_access").count() >= 2)
        self.assertFalse(
            Connector.objects.filter(
                organisation=org, agents_can_act=False, provider__in=["slack", "jira"]
            ).exists()
        )
        self.assertEqual(pizza.pk, thread.customer_id)
```

- [ ] **Step 2: Run it**

Run: `$PY manage.py test e2e.test_agent_outside_flow --noinput`
Expected: PASS. If the Slack sync files the message as unmatched, check that `users.info` in `FakeSlackApi` answers `ann@pizzahut.com` (Pizza Hut's domain) and that the connector covers the whole organisation (no linked customers).

- [ ] **Step 3: Lint and commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add e2e/test_agent_outside_flow.py
git commit -m "test(e2e): a Slack message to a reply, a Jira issue and its assignment

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: SOC 2, the docs, the full suite and the hand-off

**Files:**
- Modify: `.soc2/CONTROL_MAP.md`, `docs/audit-events.md`, `docs/data-classification.md`, `docs/API_CONTRACTS.md`
- Modify: `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`
- Create: `.agents/workflows/agent-outside-flow.md`; Modify: `.agents/workflows/repo-architecture.md`, `.agents/workflows/agent-intake-flow.md`
- Modify: `docs/superpowers/plans/2026-10-13-agent-bundles-d3-api.md` ("Changes during the build")

**Interfaces:** none (docs and checks).

- [ ] **Step 1: SOC 2 (the `soc2-dev` skill, write mode)**

Load `.claude/skills/soc2-dev/SKILL.md` and its `references/api-endpoint-checklist.md`, `auth-and-access.md`, `logging-and-audit.md`, `secrets-and-config.md`, `data-handling.md`. This change touches: new routes (API-01..10, AUTH-01, AUTH-02, LOG-01), an OAuth flow (AUTH-01, LOG-01, LOG-02), third-party writes (SEC-01, DATA-03, DATA-06), idempotency (API-08). Check each against the code, then update `.soc2/CONTROL_MAP.md` (keep each row's format; date 2026-10-13 or the build's date):

- **AUTH-01**: add "connector OAuth bound to the starting browser (`core/oauth_browser.py`, `services/connectors/views.py:start_oauth`, `ConnectorOAuthCallbackView._finish`; refusal audited `connector.oauth_refused`); `.soc2/config.yml` `public_routes` lists the connectors' OAuth callback and inbound webhook". Evidence: `services/connectors/tests/test_oauth_browser.py`.
- **AUTH-02**: add "agent outside steps act only through a tool an admin allowed and the tool granted (`services/connectors/agent_access.py:can_act`), re-checked at run (`services/agents/outside/gates.py:blocked`), a reply only from the runner's own mailbox and retried only by them (`services/agents/actions/mail_replies.py:apply`), a Slack post only into a channel whose department the runner may read (`gates.may_read`), pick lists only for a reader who may run the step (`services/agents/outside_views.py`), a sent reply's link only to its runner (`bundle_payloads.links_for`); the switch needs `manage_integrations` (`ConnectorAgentsView`)".
- **API-08**: status stays `partial` for the app, text gains "agent outside steps carry an idempotency key (`services/agents/outside/keys.py:key_for`: mail header `X-Revenact-Step`, Slack message metadata, Jira label) and every Retry looks for an earlier write before writing (`mail_replies`, `slack_replies`, `jira_issues` `apply`); each step is its own transaction with its one outside write last (`bundle_run.run_step`)". Evidence: `services/agents/tests/test_*_kind.py` "found on retry" tests, `e2e/test_agent_outside_flow.py`.
- **LOG-01**: add `agent_outside.call` (every write and lookup by a run or retry), `connector.agent_access`, `connector.oauth_refused`, and `mailbox.reply` for an agent's sent reply.
- **LOG-03**: add "agent_outside.call and connector.agent_access carry ids, outcomes and keys only; no message text, summary, recipient name or token".
- **DATA-03**: add "outside calls only over https to allow-listed hosts (`services/connectors/providers/base.py:http_call`, `services/mail/providers/base.py`)".
- **DATA-06**: add "a Jira issue's description carries the runner's name and the step's text only; recipients and subjects of an agent's reply live in the existing `mailbox.reply` audit row only".
- **SEC-01**: add "the Slack token with `chat:write` and the Jira API token stay in `Connector.credentials` (Fernet); no new secret store".

The PR summary block (paste into the hand-off):

```
SOC 2 controls in this change
- Implemented: AUTH-01 (connector OAuth browser binding), AUTH-02 (tool gate, runner-only reply retry, channel department, pick-list access), API-08 (idempotency key + lookup-before-retry for outside steps), LOG-01 (agent_outside.call, connector.agent_access, connector.oauth_refused), DATA-03 (allow-listed https only)
- Reused existing: core.audit.record (LOG-01), Connector/MailboxConnection Fernet credentials (DATA-02, SEC-01), deciding.may_decide (AUTH-02), http_call host allow-list (DATA-03)
- Skipped: API-09 (no versioned route change), DATA-12 (no new consent capture beyond the admin's switch, which is audited)
- Exceptions applied: none
- CONTROL_MAP.md rows updated: AUTH-01, AUTH-02, API-08, LOG-01, LOG-03, DATA-03, DATA-06, SEC-01
- Reviewer attention: outside writes happen inside a step's DB transaction (row locks held during one vendor call, D3-21); the audit row of a write followed by a crash is lost and recreated by the next Retry's lookup (D3-14)
```

- [ ] **Step 2: The audit catalogue and data classification**

`docs/audit-events.md`, rows in the table's style:

- `agent_outside.call` | `services.agents.actions.mail_replies`, `slack_replies`, `jira_issues` (a run or retry of an outside step) | user (the runner) | AgentAction ("Action <id>") | `kind`, `bundle`, `tool` (`mail`, `slack`, `jira`), `op` (`send`, `post`, `create`, `assign`, `lookup`), `outcome` (`ok`, `refused`, `unconfirmed`, `found`, `not_found`), `where` (`mailbox <id>`, a Slack channel id, a Jira project or issue key), `returned` (the provider's id or key), `key`.
- `connector.agent_access` | `services.connectors.views.ConnectorAgentsView`, the agents consent's return | user (an integration manager; the consenting admin) | Connector | `provider`, `can_act`, `was`, `scopes`.
- `connector.oauth_refused` | `ConnectorOAuthCallbackView` | user named by the state | Connector | `provider`, `reason: "other_browser"`; outcome `failure`.
- `mailbox.reply` gains: "also written for an agent's `mail.send_reply` (`agent_step` = the step id)".

`docs/data-classification.md`: `Connector.granted_scopes` (Internal: a tool's grant names), `Connector.agents_can_act`/`agents_allowed_by`/`agents_allowed_at` (Internal), `Connector.config.team_id`/`bot_name`/`via`/`account_name` (Internal), `AgentAction.outputs` `ticket_key`/`ticket_url`/`slack_ts`/`slack_url`/`email_id` and `result.attempted_at`/`attempted_by`/`sent_by`/`from` (Confidential: as a step's other outputs), `Notification` `agent_step_failed` message (Confidential: names a bundle title and a step's error).

- [ ] **Step 3: `docs/API_CONTRACTS.md` (`api-contracts` skill)**

Under "Agent bundles" add "Delivery 3: outside actions (contract `docs/superpowers/plans/2026-10-13-agent-bundles-d3-api.md`)" with: the decisions table D3-1 to D3-28 (copy from the contract); the four kinds (payload, editable, outputs, preview, undo sentence); §3's step order; the step shape's `disabled_link` and `links`; `can_reject` by rights; the Connector `agents` block; `GET /agents/bundles/<id>/steps/<step_id>/options/<list>/` with every refusal; `POST /connectors/<id>/agents/` with every refusal; the OAuth cookie and callback changes; §6's sentences; `agent_step_failed`; the measured ceilings (`OUTSIDE_DETAIL_QUERIES`, `OUTSIDE_HISTORY_QUERIES`, `OPTIONS_QUERIES`, `THREAD_RUN_QUERIES`). In the Connectors section, note the `agents` block and the browser-bound OAuth. In the Notifications section, add `agent_step_failed`.

- [ ] **Step 4: The canonical product docs**

- `docs/product/01-prd.md`: a row "Agent bundles, delivery 3: outside actions (backend) | Built | A bundle's steps may send an email reply from the runner's own mailbox, reply in Slack (the thread, or a channel Revenact reads), open a Jira issue and assign one; each tool is Read only or Can act per connection (Slack consent or token, Jira permission check), outside steps are always Ask and can't be undone, every Retry looks for an earlier write first, every call is audited, a failed step tells its runner; the agents propose them under the twice-filter", and a dated line in the log ("2026-10-13 | Agent bundles delivery 3 (backend): outside actions").
- `docs/product/02-trd.md`: under Agents, "Agent bundles D3 (2026-10-13): `services/agents/outside/` (`tools.py` the facade over `services/mail/agent_send.py` and the Slack/Jira providers; `keys.py` the key and look-back; `gates.py` the tool gate; `trail.py` `agent_outside.call`; `sentences.py`; `options.py` the pick lists; `offered.py`), the kinds `actions/mail_replies.py`, `slack_replies.py`, `jira_issues.py`, `failure_notice.py`; connectors gain `agent_access.py` and browser-bound OAuth (`core/oauth_browser.py`). One outside write per step, last in its transaction; a Retry looks first; nothing outside on Auto, a nightly pass or the intake."
- `docs/product/05-backend-schema.md`: `Connector` gains `granted_scopes`, `agents_can_act`, `agents_allowed_by`, `agents_allowed_at` (and the config keys); `AgentAction` kinds gain the four (23 in all); `Notification.kind` gains `agent_step_failed`; the D3 migrations (`metrics.0017`, `connectors.0004`, `notifications.0015`).
- `docs/product/06-implementation-plan.md`: "Agent bundles, delivery 3 (2026-10-13, backend): outside actions (mail reply, Slack reply, Jira create and assign), tool permissions, idempotency and lookup, audit, the failed-step notice; the connectors' OAuth flaw fixed. Next: the frontend D3 PR; then round 2 (Zendesk/Freshdesk replies and status, Jira comments, per-person Jira, the fast lane) and storing unmatched items (D3-25)."

- [ ] **Step 5: The flow docs (`flow-docs` skill)**

Create `.agents/workflows/agent-outside-flow.md`:

```markdown
---
description: How an agent bundle's outside step (email reply, Slack reply, Jira create and assign) runs, once, and how a tool is allowed to act.
---

# Agent outside actions flow

## Overview

A bundle's outside step writes to a tool outside Revenact only when a person presses Run (always Ask). Each tool is Read only or Can act per connection; each step carries an idempotency key, makes its one write last in its own transaction, and every Retry looks for an earlier write first.

## The flow

1. An admin allows a tool: `POST /api/v1/connectors/<id>/agents/` (`services/connectors/views.py:ConnectorAgentsView`). Slack: the token's scopes are read (`SlackProvider.granted_scopes`); with `chat:write` the switch turns on; else Slack sign-in asks for it (`start_oauth(..., purpose="agents")`, the callback's `agents_consented`), or the admin pastes a token that holds it. Jira: `JiraProvider.my_permissions` must hold `CREATE_ISSUES` and `ASSIGN_ISSUES`. Audited `connector.agent_access`.
2. The agents propose outside steps (`services/agents/outside/offered.py` decides which; `evidence._thread` and `evidence._jira` fill the context; `prompt.outside_rules`), checked on the way out (`run._consider`: `internal_mentions` for text that leaves Revenact).
3. The panel shows each step's tool gate (`services/agents/outside/gates.py:blocked`): a disabled reason and a link to Settings › Connections; Jira pick lists come from `GET .../steps/<id>/options/<list>/` (`outside_views.py`, `outside/options.py`).
4. Run (`bundle_run.run_step`, per step, own transaction): rights, placeholders (never into customer text), staleness; the kind's `apply` checks the gate, on a Retry looks first (`tools.current().<tool>.find` with `keys.key_for` since `keys.since`), does its reads, then its one write (`tools.current().<tool>.send|post|create|assign`), audits `agent_outside.call` (`outside/trail.py`), and returns its result (`outputs`: `ticket_key`, `ticket_url`, `slack_ts`, `slack_url`, `email_id`).
5. A refusal fails the step with a plain sentence (`outside/sentences.py`, `services/mail/agent_send.py`); no answer fails it "couldn't confirm"; both keep `attempted_at`/`attempted_by`, so the Retry looks back far enough.
6. The run's end tells the runner when any step failed (`failure_notice.tell`, `agent_step_failed`); a stuck run's settle does too.

## Key Files

| File | Purpose |
|---|---|
| `services/agents/outside/tools.py` | The facade: `MailTool`, `SlackTool`, `JiraTool`, `Tools`, `current()`, `using()` |
| `services/agents/outside/keys.py` | The key `b<bundle>-s<step>`, the Jira label, the look-back window |
| `services/agents/outside/gates.py` | Whether a tool may be used now, for one person |
| `services/agents/outside/options.py` | Live pick lists |
| `services/agents/outside/trail.py` | `agent_outside.call` |
| `services/agents/actions/mail_replies.py` | `mail.send_reply` |
| `services/agents/actions/slack_replies.py` | `slack.reply` |
| `services/agents/actions/jira_issues.py` | `jira.create`, `jira.assign` |
| `services/mail/agent_send.py` | A reply from the runner's own Gmail or Outlook, found again by its header |
| `services/connectors/agent_access.py` | Can act: the switch, the grant, a working connection |
| `services/connectors/providers/slack.py`, `jira.py` | The vendor calls |
| `core/oauth_browser.py` | OAuth bound to the starting browser |
| `services/agents/failure_notice.py` | `agent_step_failed` |
```

In `.agents/workflows/repo-architecture.md`, the agents app's subsection gains `outside/` and the three action modules, `outside_views.py`, `failure_notice.py`; connectors gains `agent_access.py`, the `agents/` route and browser-bound OAuth; `core/` gains `oauth_browser.py`; the URL map gains `/api/v1/agents/bundles/<id>/steps/<step_id>/options/<list>/` and `/api/v1/connectors/<id>/agents/`. In `.agents/workflows/agent-intake-flow.md`, step "one model call per thread" notes "the context also says which outside kinds the thread offers (`outside/offered.py`, D3)".

- [ ] **Step 6: The full suite and the checks**

Run: `$PY manage.py test --parallel auto --noinput`
Expected: OK (every test). Then:

Run: `$PY manage.py makemigrations --check --dry-run` → "No changes detected".
Run: `$PY manage.py spectacular --file /private/tmp/claude-501/-Users-tusharaggarwal-Desktop-Projects-Revenact/12149f77-43a2-43eb-9c53-e9c1cb7f8b07/scratchpad/d3-schema.yml` → exits 0, and the file holds `/api/v1/agents/bundles/{id}/steps/{step_pk}/options/{name}/` and `/api/v1/connectors/{id}/agents/`.
Run: `venv/bin/ruff check . && venv/bin/ruff format --check .` → clean.
Run: `grep -rn "SOC2:API-08\|SOC2:AUTH-01" services core | wc -l` → at least 3 (the key, the cookie, the callback).

A failure in a test this plan did not touch means a reader of a changed shape was missed (the step payload's new keys, `can_reject`, `send_email`'s new keywords, `_store`'s scopes): find it with `systematic-debugging`; never loosen the test.

- [ ] **Step 7: Commit the docs**

```bash
git add .soc2/CONTROL_MAP.md docs/audit-events.md docs/data-classification.md docs/API_CONTRACTS.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md .agents/workflows/agent-outside-flow.md .agents/workflows/repo-architecture.md .agents/workflows/agent-intake-flow.md docs/superpowers/plans/2026-10-13-agent-bundles-d3-api.md
git commit -m "docs: outside actions, tool permissions and the connectors' OAuth binding (agent bundles delivery 3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Hand-off**

Report the branch head, the test count, the measured ceilings, every "Changes during the build" entry (relayed to the frontend controller), the SOC 2 summary block, and the follow-ups: live checks once real accounts are connected (Gmail keeps `X-Revenact-Step`; Slack returns message metadata with `include_all_metadata`; Jira's `createmeta/<project>/issuetypes` answer key; Graph's `internetMessageHeaders` round trip), the Slack app's `chat:write` scope in its configuration, and the infra follow-ups (`AGENT_TOOL_TIMEOUT_SECONDS` in the production env; the `agentsignals` service from D2). Do not open a PR or merge: the owner decides (merge order: this backend PR, then the frontend PR).

---

## Self-review

**Spec coverage** (spec §11 D3 row, §6.6 to §6.9, §7.3, §7.4, §8.3, §9; the brief):
- `mail.send_reply` from the runner's mailbox, in the thread, with their signature, reusing Gmail D3's path: Task 8 (`agent_send` over `send_email`, `mime`, `answering_headers`, `send_as.signature_block`), Task 11 (the kind). Outlook: Task 8 (Graph `sendMail` + `find_sent`).
- `slack.reply` as the Revenact app, in the thread or a chosen channel, needs `chat:write`: Task 5 (provider), Task 7 (consent), Task 12 (kind), Task 15 (`slack_channels`).
- `jira.create` with live pick lists, as the runner where possible: Task 6 (provider), Task 13 (kind), Task 15 (lists); D3-5 records why it is the connection's account.
- `jira.assign` on the source ticket or a step's issue: Task 14.
- Tool permissions per connection, "Allow agents to act" starting consent, disabled steps with a link: Tasks 2, 7, 10.
- Idempotency keys and lookup before acting again: Tasks 5, 6, 8 (find), 9 (keys), 11 to 14 (every Retry looks first).
- Audit of every run, step result and outside call: D1's run/step events stand; Task 9 (`trail`), Tasks 11 to 14 (every call), Task 7 (switch), Task 3 (refused OAuth).
- Failed-step notifications to the runner, linking the bundle: Task 16.
- Plain-sentence errors: Tasks 8, 9 (`sentences`), 11 to 14; contract §6.
- Always Ask, can't be undone, "Can't be undone" before Run, result links in History: D1's `irreversible_now`/`policy.level` (outside), Tasks 11 to 14 (`cant_undo`), Task 10 (`links`), Task 19 (History).
- Each step its own transaction, the outside call last, output recorded after success: D3-12; Tasks 11 to 14's `apply` order; Task 9 (`_attempt_of` for a crash).
- Model proposals in intake and nightly with the twice-filter; placeholders refused in customer-facing text: Task 17 (offered, prompt, out-check), Tasks 1, 11, 12 (fill skip, edit refusal).
- Query ceilings: Task 18. SOC 2: Task 20 step 1. Canonical docs and `API_CONTRACTS.md`: Task 20.
- The connectors' forwarded-link flaw: Task 3 (D3-22), because Task 7's consent goes through it.

**Placeholder scan:** every code step carries its code; the two "print once, then pin" instructions in Task 18 are measurements, not missing code (the tests assert relations that hold whatever the number is, and the number is recorded in the contract).

**Type consistency:** `tools.Mailed`/`Posted`/`Issue` (Task 9) are what the fakes return and the kinds read (`provider_id`, `ts`, `url`, `key`); `keys.attempt` returns the `attempted_at`/`attempted_by` the gate in Task 11 reads; `gates.connector_of`/`mailbox_of` (Task 10) are what the previews and `apply` use; `Context.thread_email`/`thread_ticket`/`jira_connector` (Task 9, filled in Task 17) match the shapes the validators read in Tasks 11 to 14; the stored payloads in the fixture helpers (Task 9) match the validators' outputs; `options.Refusal` and `ListFailed` carry the contract §5.2 codes.

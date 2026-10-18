# Agent bundles, round 2 delivery 2 (backend): act as the person Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person may link their own Atlassian account so the Jira steps they run act as them (falling back to the connection's account, named in the panel; a lost link blocks with a clear sentence); a Slack step may move to any channel the bot is in, from a live, searchable, cached list (private unsynced channels for admins only); and an Outlook mailbox with no credentials can't send an agent's reply (N1).

**Architecture:** One new model, `connectors.JiraLink`, and one new module, `services/connectors/jira_links.py` (Atlassian's OAuth client, site matching, the `Seat`, refresh under a row lock, `warm`, `lose`). `JiraProvider` learns two things only: a `Seat`'s `api_base` and its Bearer token. The outside facade (`JiraTool`) takes `seat=` on every call; the Jira kinds resolve the seat once per step through `services/agents/outside/seats.py` (bulk-aware link read, the sentences, `warm` before step transactions). The live Slack list is `services/agents/outside/slack_channels.py` over a new `SlackProvider.member_channels` (Slack's `users.conversations`) and Django's cache; `slack.reply` gains the editable `channel_choice`. Routes for the link live in `services/connectors/link_views.py`.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15), stdlib `urllib` for every vendor call (no SDKs), Django's cache (LocMem in tests, Redis in prod). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (items B and C as revised on the frontend branch `feat/agent-bundles-r2d2`). **Binding contract:** `docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-api.md` (this repo). Read its "Decisions narrowing the spec" (R2D2-1 to R2D2-22) before any task; every decision is a requirement here. The D1, D2, D3 and R2-D1 contracts and their as-built record in `docs/API_CONTRACTS.md` still hold where R2-D2 does not change them.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/r2d2-be` on branch `feat/agent-bundles-r2d2` (cut from main 57f09de: R2-D1 #117 merged; its first commit holds this plan). Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them).
- Python: make the venv link once, `ln -s ../gmail-be/venv venv` (the `venv/` ignore rule does not match a symlink: never `git add` it). Written `PY` below: `PY=venv/bin/python`. Ruff: `venv/bin/ruff`.
- `.env` points at the shared dev database `revenact`: **never migrate it, never write to it.** Tests use their own test database; read-only shell queries are fine.
- Run tests as `$PY manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (`ruff format` also formats Python blocks inside Markdown; run `venv/bin/ruff format .` if the check fails, docs included).
- Every commit message is a conventional commit (`commit-messages` skill) and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths (`git add <paths>`, `git rm` for deletions); never `git add -A` or `git add .`. Never `git stash` (shared across worktrees).
- **CI is blocked by GitHub billing:** local checks are the gate. A task is done only when its tests pass locally; the last task runs the full suite (`--parallel auto`), `makemigrations --check`, `manage.py spectacular` and ruff.
- **Nothing real is ever sent.** Jira goes through `FakeJiraApi` (`use_jira`), Atlassian's auth and resources through `FakeAtlassian` (`use_atlassian`, Task 2), Slack through `FakeSlackApi` (`use_slack`); the facade's fakes (`outside_fakes.py`) stand in for whole tools. No test opens a socket to Atlassian, Slack, Google or Microsoft; none calls a model (`get_completion` is always patched).
- **Postgres 16:** no visibility rule may be a join made unique with `DISTINCT`; use `id IN (subquery)`. Query counts are pinned in tests (Task 11).
- Every visibility filter and gate carries `# SOC2:AUTH-02 ...`; every audited write `# SOC2:LOG-01`; tokens at rest `# SOC2:DATA-02`; the OAuth browser binding `# SOC2:AUTH-01`. Tokens live only in `JiraLink.credentials` (Fernet, `services.mail.crypto`): never serialised, never logged, never in audit metadata.
- **Twice-filter (spec §4.4, §13.4):** nothing new reaches a model; a Slack post to an unsynced channel passes the outside out-check (D3-19) like every Slack post.
- **Outside steps are always Ask** (D1 D21). **Scope ruling (R2D2-1):** Jira and Slack only, plus the N1 mail gate; no other connector's tools.
- User-facing sentences are exactly the contract's. No em dash in any sentence a person reads.
- No new dependency. One migration: `connectors.0005_jira_link`.
- **Product documents rule:** `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `.soc2/CONTROL_MAP.md`, `.env.example` and the flow doc `.agents/workflows/agent-outside-flow.md` are updated in this PR (Task 13).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/mail/agent_send.py` | modify | N1: blank credentials can't send (R2D2-19) |
| `config/settings.py`, `.env.example` | modify | `ATLASSIAN_OAUTH_CLIENT_ID`, `ATLASSIAN_OAUTH_CLIENT_SECRET` |
| `services/connectors/providers/base.py` | modify | `auth.atlassian.com` on the host allow-list |
| `services/connectors/models.py`, `migrations/0005_jira_link.py` | modify/create | `JiraLink` (contract §1.1) |
| `services/connectors/jira_links.py` | create | Atlassian OAuth, sites, `Seat`, `seat_for`, `fresh_token`, `warm`, `lose`, `preview_for` |
| `services/connectors/providers/jira.py` | modify | `_url` honours `api_base`; `_headers` sends Bearer |
| `services/connectors/link_views.py`, `urls.py` | create/modify | `GET/POST/DELETE /connectors/jira-link/`, the callback |
| `services/agents/outside/seats.py` | create | the bulk-aware link read, the step's seat, sentences, `warm` |
| `services/agents/outside/tools.py`, `sentences.py`, `trail.py` | modify | `seat=` on every Jira call; person sentences; `as` in the trail |
| `services/agents/actions/jira_issues.py`, `jira_comments.py` | modify | seat per step, `acted_as`, per-reader previews |
| `services/agents/outside/gates.py`, `options.py`, `bulk.py`, `bundle_run.py` | modify | the lost-link gate; lists as the reader; one link read per reader; `warm` before runs |
| `services/connectors/providers/slack.py` | modify | `member_channels` (`users.conversations`) |
| `services/agents/outside/slack_channels.py` | create | the live list: cache, rows, notes, resolving a choice |
| `services/agents/actions/slack_replies.py` | modify | `channel_choice`, unsynced posts, `synced` preview, the private gate |
| tests | create/modify | listed per task |
| `e2e/test_agent_round2_act_flow.py` | create | the journey |
| docs | modify | Task 13 |

## Shared test fixtures (existing, extended here)

- `services/connectors/tests/jira_fake.py` `FakeJiraApi` (Task 3: answers under `/ex/jira/<cloud>/` too and records who called: `self.callers`, `"basic"` or the Bearer token).
- `services/connectors/tests/atlassian_fake.py` `FakeAtlassian` (Task 2, new): Atlassian's token endpoint and `accessible-resources`.
- `services/connectors/tests/slack_fake.py` `FakeSlackApi` (Task 8: `users.conversations`, paged).
- `services/agents/tests/outside_fakes.py` `FakeJira` (Task 5: every method takes `seat=None` and records it in `self.seats`).
- `services/agents/tests/outside_fixtures.py` `OutsideFixture`: `self.csm` (Carl, owns Pizza Hut), `self.admin` (Alice, admin), `self.other` (Dana), `self.erin` (Engineering), `jira_connector()`, `slack_connector()`, `jira_thread()`, `slack_thread()`, `outside_bundle()`, `jira_payload()`, `assign_payload()`, `slack_payload()`, `run_all_steps()`, `retry()`, `client_for()`; Task 4 adds `link_for(user, *, host="acme.atlassian.net", status="linked", expires_in=3600)`.

---

### Task 1: N1: a mailbox with no credentials can't send an agent's reply

**Files:**
- Modify: `services/mail/agent_send.py` (`blocked`)
- Test: `services/mail/tests/test_agent_send.py` (append to the class holding `test_who_cannot_send`)

**Interfaces:**
- Produces: `agent_send.blocked(connection)` answers `RECONNECT` for a non-IMAP row with blank `credentials` (contract §5).

- [ ] **Step 1: Write the failing test**

Append next to `test_who_cannot_send`:

```python
    def test_a_mailbox_with_no_credentials_cannot_send(self):
        # Round 2 D2 contract R2D2-19 (N1): Outlook was let through with blank credentials.
        from services.mail.tests.graph_fake import outlook_connection

        outlook = outlook_connection(self.carl)
        self.assertIsNone(agent_send.blocked(outlook))
        outlook.credentials = ""
        self.assertEqual(agent_send.blocked(outlook), agent_send.RECONNECT)
        google = self.google(self.dana)
        google.credentials = ""
        self.assertEqual(agent_send.blocked(google), agent_send.RECONNECT)
```

(If the class has no `self.dana`, use any second member it builds; check with `grep -n "self\.\w* = " services/mail/tests/test_agent_send.py | head`.)

- [ ] **Step 2: Run it to see it fail**

Run: `$PY manage.py test services.mail.tests.test_agent_send --parallel auto --noinput`
Expected: FAIL: `None != 'Reconnect your mailbox to send this.'` on the Outlook line.

- [ ] **Step 3: The check**

In `services/mail/agent_send.py`, `blocked`:

```python
def blocked(connection):
    """Why this mailbox can't send an agent's reply, or None (contract §5.1;
    round 2 D2 R2D2-19: no credentials, no send, whichever provider)."""
    if connection is None or connection.status == C.Status.DISCONNECTED:
        return CONNECT
    if connection.provider == C.Provider.IMAP:
        return IMAP
    if not connection.credentials:
        return RECONNECT
    if connection.is_google and (not connection.two_way or connection.paused_reason):
        return RECONNECT
    if connection.status != C.Status.CONNECTED:
        return RECONNECT
    return None
```

- [ ] **Step 4: Run it to see it pass**

Run: `$PY manage.py test services.mail.tests.test_agent_send services.agents.tests.test_outside_gates --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/mail/agent_send.py services/mail/tests/test_agent_send.py
git commit -m "fix(mail): a mailbox with no credentials can't send an agent's reply

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The link's storage and Atlassian's OAuth client

**Files:**
- Modify: `config/settings.py` (after `SLACK_OAUTH_CLIENT_SECRET`), `.env.example`, `services/connectors/providers/base.py` (`ALLOWED_HOSTS`), `services/connectors/models.py`
- Create: `services/connectors/migrations/0005_jira_link.py` (by `makemigrations`), `services/connectors/jira_links.py`, `services/connectors/tests/atlassian_fake.py`
- Test: `services/connectors/tests/test_jira_links.py` (create)

**Interfaces:**
- Produces (`models.py`): `JiraLink` (contract §1.1) with `Status.LINKED = "linked"`, `Status.LOST = "lost"`, `set_credentials(dict)`, `get_credentials() -> dict`.
- Produces (`jira_links.py`): `SCOPES`, `configured() -> bool`, `authorize_url(state, redirect_uri) -> str`, `exchange(code, redirect_uri) -> dict` (tokens with `expires_at`), `resources(access_token) -> list[dict]` (`{cloud_id, url, name}`, Jira only), `myself(access_token, cloud_id) -> dict`, `host_of(url) -> str`, `site_for(link, connector) -> dict | None`, `jira_connectors(organisation_id) -> QuerySet`, `class LinkLost(Exception)`, `class LinkUnreachable(Exception)`, `Seat(config, creds, person, name, link_id)`, `connection_seat(connector) -> Seat`, `seat_for(connector, link) -> Seat`, `fresh_token(link, *, within=EXPIRY_MARGIN) -> str`, `warm(link)`, `lose(link, reason)`, `preview_for(connector, link) -> dict`.
- Produces (`atlassian_fake.py`): `FakeAtlassian` (`.tokens_issued`, `.refreshes`, `.resources`, `.refuse_refresh()`, `.drop_refresh()`), `use_atlassian(testcase, fake=None)` patching `services.connectors.jira_links.http_json`.

- [ ] **Step 1: The fake**

Create `services/connectors/tests/atlassian_fake.py`:

```python
"""Atlassian's OAuth 2.0 (3LO) token endpoint and accessible-resources in
memory (agent bundles round 2 D2), standing in for `jira_links.http_json`.
Refresh tokens rotate as Atlassian's do: each use issues a new one and the
used one stops working. Nothing leaves the process."""

import json
from urllib.parse import urlsplit

from services.connectors.providers.base import ProviderError

CLOUD = "11223344-a1b2-3b33-c444-def123456789"


class FakeAtlassian:
    def __init__(self):
        self.resources = [
            {
                "id": CLOUD,
                "url": "https://acme.atlassian.net",
                "name": "acme",
                "scopes": ["read:jira-work", "write:jira-work", "read:jira-user"],
            },
            {
                "id": "conf-1",
                "url": "https://acme.atlassian.net",
                "name": "acme",
                "scopes": ["read:confluence-content.all"],
            },
        ]
        self.me = {
            "accountId": "acc-carl",
            "displayName": "Carl Lee",
            "emailAddress": "carl@acme.io",
        }
        self.live_refresh = set()
        self.tokens_issued = 0
        self.refreshes = []
        self.calls = []
        self._refuse_refresh = False
        self._drop_refresh = False
        self.give_refresh_token = True

    def refuse_refresh(self):
        self._refuse_refresh = True

    def drop_refresh(self):
        self._drop_refresh = True

    def _pair(self):
        self.tokens_issued += 1
        n = self.tokens_issued
        pair = {
            "access_token": f"at-{n}",
            "expires_in": 3600,
            "scope": "read:jira-work write:jira-work read:jira-user offline_access",
            "token_type": "Bearer",
        }
        if self.give_refresh_token:
            pair["refresh_token"] = f"rt-{n}"
            self.live_refresh.add(f"rt-{n}")
        return pair

    def __call__(self, method, url, *, headers=None, data=None, form=None, timeout=30, write=False):
        parts = urlsplit(url)
        self.calls.append(
            (method, parts.netloc + parts.path, json.loads(json.dumps(data)) if data else None)
        )
        if parts.netloc == "auth.atlassian.com" and parts.path == "/oauth/token":
            if data["grant_type"] == "authorization_code":
                if data["code"] != "good-code":
                    raise ProviderError(
                        "403 from auth.atlassian.com", status=403, body={"error": "invalid_grant"}
                    )
                return self._pair()
            self.refreshes.append(data["refresh_token"])
            if self._drop_refresh:
                self._drop_refresh = False
                raise ProviderError("auth.atlassian.com did not answer: TimeoutError")
            if self._refuse_refresh or data["refresh_token"] not in self.live_refresh:
                self._refuse_refresh = False
                raise ProviderError(
                    "403 from auth.atlassian.com",
                    status=403,
                    body={
                        "error": "invalid_grant",
                        "error_description": "Unknown or invalid refresh token.",
                    },
                )
            self.live_refresh.discard(data["refresh_token"])
            return self._pair()
        if parts.path == "/oauth/token/accessible-resources":
            return list(self.resources)
        if parts.path.endswith("/rest/api/3/myself"):
            return dict(self.me)
        raise AssertionError(f"FakeAtlassian has no route for {method} {url}")


def use_atlassian(testcase, fake=None):
    """`fake` (or a new FakeAtlassian) stands in for Atlassian for the rest of the test."""
    from unittest.mock import patch

    fake = fake or FakeAtlassian()
    patcher = patch("services.connectors.jira_links.http_json", fake)
    patcher.start()
    testcase.addCleanup(patcher.stop)
    return fake
```

- [ ] **Step 2: Write the failing tests**

Create `services/connectors/tests/test_jira_links.py`:

```python
"""A person's Jira link (agent bundles round 2 D2 contract §1 to §3): storage,
sites, the seat, refresh with rotation, warm and lose. Atlassian is a fake."""

import time

from django.test import TestCase, override_settings

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.connectors import jira_links
from services.connectors.models import Connector, JiraLink
from services.connectors.tests.atlassian_fake import CLOUD, use_atlassian

ON = {"ATLASSIAN_OAUTH_CLIENT_ID": "cid", "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret"}


@override_settings(**ON)
class JiraLinkTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Acme")
        self.carl = User.objects.create_user(
            email="carl@acme.io", password="x" * 12, name="Carl Lee", organisation=self.org
        )
        self.jira = Connector.objects.create(
            organisation=self.org,
            provider="jira",
            name="Jira",
            config={"host": "acme.atlassian.net", "project": "SUP", "account_name": "Jira Bot"},
        )
        self.jira.set_credentials({"email": "bot@acme.io", "api_token": "t"})
        self.jira.status = Connector.Status.CONNECTED
        self.jira.save()
        self.atlassian = use_atlassian(self)

    def link(self, *, expires_in=3600, refresh="rt-0", status=JiraLink.Status.LINKED):
        self.atlassian.live_refresh.add(refresh)
        link = JiraLink(
            organisation=self.org,
            user=self.carl,
            account_id="acc-carl",
            name="Carl Lee",
            sites=[{"cloud_id": CLOUD, "url": "https://acme.atlassian.net", "name": "acme"}],
            status=status,
        )
        link.set_credentials(
            {
                "access_token": "at-0",
                "refresh_token": refresh,
                "expires_at": time.time() + expires_in,
            }
        )
        link.save()
        return link

    def test_tokens_are_encrypted_at_rest(self):
        link = self.link()
        self.assertNotIn("at-0", link.credentials)
        self.assertEqual(JiraLink.objects.get().get_credentials()["refresh_token"], "rt-0")

    def test_the_authorize_url_asks_for_the_four_scopes_and_consent(self):
        url = jira_links.authorize_url(
            "s1", "http://localhost:8000/api/v1/connectors/jira-link/callback/"
        )
        self.assertTrue(url.startswith("https://auth.atlassian.com/authorize?"))
        for part in (
            "audience=api.atlassian.com",
            "client_id=cid",
            "prompt=consent",
            "response_type=code",
            "state=s1",
            "read%3Ajira-work+write%3Ajira-work+read%3Ajira-user+offline_access",
        ):
            self.assertIn(part, url)

    def test_only_jira_resources_count_and_sites_match_by_host(self):
        rows = jira_links.resources("at-1")
        self.assertEqual(
            rows, [{"cloud_id": CLOUD, "url": "https://acme.atlassian.net", "name": "acme"}]
        )
        link = self.link()
        self.assertEqual(jira_links.site_for(link, self.jira)["cloud_id"], CLOUD)
        self.jira.config = {**self.jira.config, "host": "other.atlassian.net"}
        self.assertIsNone(jira_links.site_for(link, self.jira))

    def test_a_covering_link_seats_the_person_else_the_connection(self):
        link = self.link()
        seat = jira_links.seat_for(self.jira, link)
        self.assertEqual(
            (seat.person, seat.name, seat.creds), (True, "Carl Lee", {"access_token": "at-0"})
        )
        self.assertEqual(seat.config["api_base"], f"https://api.atlassian.com/ex/jira/{CLOUD}")
        bot = jira_links.seat_for(self.jira, None)
        self.assertEqual((bot.person, bot.name, bot.creds["api_token"]), (False, "Jira Bot", "t"))

    def test_a_lost_link_raises(self):
        link = self.link(status=JiraLink.Status.LOST)
        with self.assertRaises(jira_links.LinkLost):
            jira_links.seat_for(self.jira, link)

    def test_an_expiring_token_is_refreshed_and_the_new_refresh_token_kept(self):
        link = self.link(expires_in=30)
        self.assertEqual(jira_links.fresh_token(link), "at-1")
        link.refresh_from_db()
        self.assertEqual(link.get_credentials()["refresh_token"], "rt-1")
        self.assertIsNotNone(link.refreshed_at)
        self.assertEqual(self.atlassian.refreshes, ["rt-0"])

    def test_warm_refreshes_within_fifteen_minutes_only(self):
        link = self.link(expires_in=20 * 60)
        jira_links.warm(link)
        self.assertEqual(self.atlassian.refreshes, [])
        link = JiraLink.objects.get()
        JiraLink.objects.filter(pk=link.pk).delete()
        link = self.link(expires_in=10 * 60)
        jira_links.warm(link)
        self.assertEqual(self.atlassian.refreshes, ["rt-0"])

    def test_a_refused_refresh_loses_the_link_and_audits_it(self):
        link = self.link(expires_in=0)
        self.atlassian.refuse_refresh()
        with self.assertRaises(jira_links.LinkLost):
            jira_links.fresh_token(link)
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LOST)
        event = AuditEvent.objects.get(action="jira.link_lost")
        self.assertEqual((event.metadata, event.outcome), ({"reason": "invalid_grant"}, "failure"))
        self.assertNotIn("rt-0", str(event.metadata))

    def test_no_answer_while_refreshing_is_not_lost(self):
        link = self.link(expires_in=0)
        self.atlassian.drop_refresh()
        with self.assertRaises(jira_links.LinkUnreachable):
            jira_links.fresh_token(link)
        link.refresh_from_db()
        self.assertEqual(link.status, JiraLink.Status.LINKED)

    def test_the_preview_names_who_acts(self):
        self.assertEqual(
            jira_links.preview_for(self.jira, None),
            {"as": "Jira Bot", "as_you": False, "link": "none"},
        )
        self.assertEqual(
            jira_links.preview_for(self.jira, self.link()),
            {"as": "Carl Lee", "as_you": True, "link": None},
        )
        self.jira.config = {**self.jira.config, "host": "other.atlassian.net"}
        self.assertEqual(
            jira_links.preview_for(self.jira, JiraLink.objects.get())["link"], "other_site"
        )
        with override_settings(ATLASSIAN_OAUTH_CLIENT_ID=""):
            self.assertEqual(jira_links.preview_for(self.jira, None)["link"], "off")

    def test_one_atlassian_account_per_workspace(self):
        self.link()
        dana = User.objects.create_user(
            email="dana@acme.io", password="x" * 12, name="Dana", organisation=self.org
        )
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError), transaction.atomic():
            JiraLink.objects.create(
                organisation=self.org, user=dana, account_id="acc-carl", name="x", credentials="x"
            )
```

(Match `User.objects.create_user`'s real arguments: `grep -n "def create_user" services/accounts/models.py`. If `Organisation` needs more fields, copy how `services/connectors/tests/test_agent_access.py` builds its world.)

- [ ] **Step 3: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_jira_links --parallel auto --noinput`
Expected: ImportError: cannot import name `JiraLink`.

- [ ] **Step 4: Settings and the allow-list**

`config/settings.py`, after `SLACK_OAUTH_CLIENT_SECRET`:

```python
# Atlassian OAuth 2.0 (3LO) app: a person links their own Jira account so the
# Jira steps they run act as them (agent bundles round 2 D2). Both empty: off.
ATLASSIAN_OAUTH_CLIENT_ID = env("ATLASSIAN_OAUTH_CLIENT_ID", default="")
ATLASSIAN_OAUTH_CLIENT_SECRET = env("ATLASSIAN_OAUTH_CLIENT_SECRET", default="")
```

`.env.example`, after the Slack lines:

```bash
# Atlassian OAuth 2.0 (3LO) app for per-person Jira links (developer.atlassian.com).
# Callback: <MAIL_OAUTH_REDIRECT_BASE or http://localhost:8000>/api/v1/connectors/jira-link/callback/
# ATLASSIAN_OAUTH_CLIENT_ID=
# ATLASSIAN_OAUTH_CLIENT_SECRET=
```

`services/connectors/providers/base.py`: `ALLOWED_HOSTS = {"slack.com", "api.atlassian.com", "auth.atlassian.com"}`.

- [ ] **Step 5: The model**

Append to `services/connectors/models.py`:

```python
class JiraLink(models.Model):
    """A person's own Atlassian account (agent bundles round 2 D2 contract
    §1.1): the Jira steps they run act as them on the sites it covers. One
    per person; one person per Atlassian account in a workspace (R2D2-3).
    Its tokens are theirs, encrypted at rest; only they read the link."""

    class Status(models.TextChoices):
        LINKED = "linked", "Linked"
        LOST = "lost", "Stopped working"

    organisation = models.ForeignKey(
        Organisation, related_name="jira_links", on_delete=models.CASCADE
    )
    user = models.OneToOneField(User, related_name="jira_link", on_delete=models.CASCADE)
    account_id = models.CharField(max_length=128)
    name = models.CharField(max_length=150)
    email = models.CharField(max_length=254, blank=True, default="")
    #: Fernet-encrypted JSON {access_token, refresh_token, expires_at}. Restricted.
    credentials = models.TextField()
    #: Jira-scoped accessible resources: [{cloud_id, url, name}].
    sites = models.JSONField(default=list, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.LINKED)
    linked_at = models.DateTimeField(auto_now_add=True)
    refreshed_at = models.DateTimeField(null=True, blank=True)
    lost_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "account_id"],
                name="unique_jira_account_per_organisation",
            )
        ]

    def __str__(self):
        return f"{self.name} (Jira link)"

    def set_credentials(self, data: dict):
        import json

        # SOC2:DATA-02 a person's Atlassian tokens encrypted at rest
        self.credentials = crypto.encrypt(json.dumps(data))

    def get_credentials(self) -> dict:
        import json

        return json.loads(crypto.decrypt(self.credentials)) if self.credentials else {}
```

Run: `$PY manage.py makemigrations connectors -n jira_link`
Expected: `services/connectors/migrations/0005_jira_link.py` with `CreateModel JiraLink` and the constraint.

- [ ] **Step 6: `jira_links.py`**

Create `services/connectors/jira_links.py`:

```python
"""A person's own Jira (agent bundles round 2 D2 contract §1 to §3,
R2D2-2 to R2D2-14). Atlassian's OAuth 2.0 (3LO) client, which of the
workspace's Jira connectors a link covers (by host), the `Seat` a call acts
from (the person, or the connection's account), and the access token kept
fresh. Atlassian rotates refresh tokens: every refresh stores the new pair
under a row lock, in its own transaction where it can (R2D2-8)."""

import time
from dataclasses import dataclass
from urllib.parse import quote, urlencode, urlsplit

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core import audit

from .models import Connector, JiraLink
from .providers.base import ProviderError, http_json

AUTH = "https://auth.atlassian.com"
API = "https://api.atlassian.com"
SCOPES = ("read:jira-work", "write:jira-work", "read:jira-user", "offline_access")
#: A resource is a Jira site when one of its scopes is a Jira one.
JIRA_SCOPE = (":jira-", ":jira.")
EXPIRY_MARGIN = 60
#: run_bundle and retry_step refresh a token expiring within this (R2D2-8).
WARM_SECONDS = 15 * 60


class LinkLost(Exception):
    """Atlassian refused the refresh token: the person must link again."""


class LinkUnreachable(Exception):
    """Atlassian didn't answer the refresh; the link is kept."""


@dataclass(frozen=True)
class Seat:
    config: dict
    creds: dict
    person: bool
    name: str
    link_id: int | None = None


def configured():
    return bool(settings.ATLASSIAN_OAUTH_CLIENT_ID and settings.ATLASSIAN_OAUTH_CLIENT_SECRET)


def authorize_url(state, redirect_uri):
    return f"{AUTH}/authorize?" + urlencode(
        {
            "audience": "api.atlassian.com",
            "client_id": settings.ATLASSIAN_OAUTH_CLIENT_ID,
            "scope": " ".join(SCOPES),
            "redirect_uri": redirect_uri,
            "state": state,
            "response_type": "code",
            "prompt": "consent",
        }
    )


def _with_expiry(tokens):
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_at": time.time() + int(tokens.get("expires_in", 3600)),
    }


def exchange(code, redirect_uri):
    """The first token pair, with `scope` kept. Raises ProviderError."""
    tokens = http_json(
        "POST",
        f"{AUTH}/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": settings.ATLASSIAN_OAUTH_CLIENT_ID,
            "client_secret": settings.ATLASSIAN_OAUTH_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
    )
    return {**_with_expiry(tokens), "scope": str(tokens.get("scope", ""))}


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def resources(access_token):
    rows = http_json(
        "GET",
        f"{API}/oauth/token/accessible-resources",
        headers=_bearer(access_token),
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
    )
    return [
        {
            "cloud_id": str(r["id"]),
            "url": str(r.get("url", "")),
            "name": str(r.get("name", ""))[:150],
        }
        for r in rows or []
        if any(any(mark in str(s) for mark in JIRA_SCOPE) for s in r.get("scopes") or [])
    ]


def api_base(cloud_id):
    return f"{API}/ex/jira/{quote(cloud_id, safe='')}"


def myself(access_token, cloud_id):
    return http_json(
        "GET",
        f"{api_base(cloud_id)}/rest/api/3/myself",
        headers=_bearer(access_token),
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
    )


def host_of(url):
    return (urlsplit(url or "").hostname or "").lower()


def site_for(link, connector):
    """The link's site for `connector` (R2D2-4), or None."""
    host = str((connector.config or {}).get("host", "")).lower()
    if link is None or not host:
        return None
    return next((s for s in link.sites or [] if host_of(s.get("url")) == host), None)


def jira_connectors(organisation_id):
    """The workspace's Jira connections a link can cover: enabled, connected."""
    return (
        Connector.objects.filter(
            organisation_id=organisation_id, provider=Connector.Provider.JIRA, is_enabled=True
        )
        .exclude(credentials="")
        .order_by("pk")
    )


def connection_name(connector):
    return (connector.config or {}).get("account_name") or connector.name


def connection_seat(connector):
    return Seat(
        config=connector.config or {},
        creds=connector.get_credentials(),
        person=False,
        name=connection_name(connector),
    )


def seat_for(connector, link):
    """Who a call through `connector` acts as for the person whose link is
    `link` (None: no link). Raises LinkLost, LinkUnreachable."""
    if link is None:
        return connection_seat(connector)
    if link.status == JiraLink.Status.LOST:
        raise LinkLost()
    site = site_for(link, connector)
    if site is None:
        return connection_seat(connector)
    return Seat(
        config={**(connector.config or {}), "api_base": api_base(site["cloud_id"])},
        creds={"access_token": fresh_token(link)},
        person=True,
        name=link.name,
        link_id=link.pk,
    )


def lose(link, reason):
    JiraLink.objects.filter(pk=link.pk).update(status=JiraLink.Status.LOST, lost_at=timezone.now())
    link.status = JiraLink.Status.LOST
    audit.record(  # SOC2:LOG-01 a person's Jira link stopped working
        "jira.link_lost",
        actor=link.user,
        organisation=link.organisation,
        target=link,
        target_repr=f"Jira link {link.pk}",
        outcome="failure",
        metadata={"reason": reason},
    )


def fresh_token(link, *, within=EXPIRY_MARGIN):
    """An access token good for `within` seconds more; refreshed under the
    row's lock when not (two runs never spend one refresh token). Raises
    LinkLost (refused: the link is marked lost and audited) or
    LinkUnreachable (no answer: the link is kept)."""
    creds = link.get_credentials()
    if creds.get("expires_at", 0) > time.time() + within:
        return creds["access_token"]
    refused = False
    with transaction.atomic():
        locked = JiraLink.objects.select_for_update().get(pk=link.pk)
        if locked.status == JiraLink.Status.LOST:
            raise LinkLost()
        creds = locked.get_credentials()
        if creds.get("expires_at", 0) > time.time() + within:
            # Another run refreshed it while this one waited for the lock.
            link.credentials = locked.credentials
            return creds["access_token"]
        try:
            tokens = http_json(
                "POST",
                f"{AUTH}/oauth/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": settings.ATLASSIAN_OAUTH_CLIENT_ID,
                    "client_secret": settings.ATLASSIAN_OAUTH_CLIENT_SECRET,
                    "refresh_token": creds.get("refresh_token", ""),
                },
                timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
            )
        except ProviderError as exc:
            if exc.status not in (400, 401, 403):
                raise LinkUnreachable() from None
            refused = True
        else:
            fresh = _with_expiry(tokens)
            fresh["refresh_token"] = fresh["refresh_token"] or creds.get("refresh_token", "")
            locked.set_credentials(fresh)
            locked.refreshed_at = timezone.now()
            locked.save(update_fields=["credentials", "refreshed_at"])
            link.credentials = locked.credentials
            return fresh["access_token"]
    # Outside the lock's transaction, so the mark survives (R2D2-9).
    if refused:
        lose(link, "invalid_grant")
    raise LinkLost()


def warm(link):
    """Refresh a token expiring within WARM_SECONDS, before any step's
    transaction opens (R2D2-8). A failure is left for the step to say."""
    if link is None or link.status != JiraLink.Status.LINKED:
        return
    try:
        fresh_token(link, within=WARM_SECONDS)
    except (LinkLost, LinkUnreachable):
        pass


def preview_for(connector, link):
    """Who a reader's Jira step would act as (R2D2-10), read only: no call."""
    bot = connection_name(connector)
    if link is not None and link.status == JiraLink.Status.LINKED and site_for(link, connector):
        return {"as": link.name, "as_you": True, "link": None}
    if link is not None and link.status == JiraLink.Status.LOST:
        return {"as": bot, "as_you": False, "link": None}
    if link is not None:
        return {"as": bot, "as_you": False, "link": "other_site"}
    return {"as": bot, "as_you": False, "link": "none" if configured() else "off"}
```

Note on `fresh_token`: inside a step's transaction (an expired token in a run longer than 15 minutes) the `with transaction.atomic()` is a savepoint and `lose` runs in the step's transaction; `StepFailed` keeps the savepoint (`run_step`), so the mark is kept. The 10-minute reuse interval covers a rollback of the stored pair (R2D2-8).

- [ ] **Step 7: Run them to see them pass**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: OK.

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add config/settings.py .env.example services/connectors/providers/base.py services/connectors/models.py services/connectors/migrations/0005_jira_link.py services/connectors/jira_links.py services/connectors/tests/atlassian_fake.py services/connectors/tests/test_jira_links.py
git commit -m "feat(connectors): a person's Jira link: encrypted rotating tokens, sites and seats

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Jira answers a seat: the person's base URL and Bearer token

**Files:**
- Modify: `services/connectors/providers/jira.py` (`_headers`, `_url`), `services/connectors/tests/jira_fake.py`
- Test: `services/connectors/tests/test_jira_actions.py` (append)

**Interfaces:**
- Consumes: `jira_links.Seat`, `jira_links.api_base` (Task 2).
- Produces: every `JiraProvider` method called with `config` holding `api_base` goes to `<api_base>/rest/api/3/...` with `Authorization: Bearer <creds["access_token"]>`; without it, today's host and Basic auth. `FakeJiraApi.callers`: a list of `"basic"` or the Bearer token, one per call; it answers under `/ex/jira/<cloud>/rest/api/3/...` as under `/rest/api/3/...`.

- [ ] **Step 1: Write the failing test**

Append to `services/connectors/tests/test_jira_actions.py` (it already uses `use_jira`; follow its setUp for `self.config` / `self.creds` names, check with `grep -n "def setUp" -A12 services/connectors/tests/test_jira_actions.py`):

```python
class JiraSeatTests(SimpleTestCase):
    """Round 2 D2 contract R2D2-5: a person's seat calls api.atlassian.com
    with their Bearer token; the connection's stays on the site with Basic."""

    def setUp(self):
        self.jira = use_jira(self)

    def test_the_person_seat_calls_through_api_atlassian_com(self):
        from services.connectors.jira_links import api_base

        config = {"host": "acme.atlassian.net", "project": "SUP", "api_base": api_base("cloud-1")}
        key = JiraProvider().create_issue(
            config,
            {"access_token": "at-7"},
            fields={
                "project": {"key": "SUP"},
                "issuetype": {"id": "10001"},
                "summary": "x",
                "labels": [],
            },
        )
        self.assertEqual(self.jira.callers, ["Bearer at-7"])
        self.assertEqual(
            self.jira.urls[-1], "https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/issue"
        )
        self.assertEqual(issue_url(config, key), f"https://acme.atlassian.net/browse/{key}")

    def test_the_connection_seat_keeps_basic_auth_on_the_site(self):
        JiraProvider().priorities(
            {"host": "acme.atlassian.net"}, {"email": "b@acme.io", "api_token": "t"}
        )
        self.assertEqual(self.jira.callers, ["basic"])
        self.assertTrue(
            self.jira.urls[-1].startswith("https://acme.atlassian.net/rest/api/3/priority/search")
        )
```

(Import `SimpleTestCase`, `JiraProvider`, `issue_url`, `use_jira` at the top if the file doesn't.)

- [ ] **Step 2: Run it to see it fail**

Run: `$PY manage.py test services.connectors.tests.test_jira_actions --parallel auto --noinput`
Expected: FAIL: `KeyError: 'email'` from `_headers` (and `FakeJiraApi` has no `callers`).

- [ ] **Step 3: The fake learns the seat**

In `FakeJiraApi.__init__` add `self.callers = []` and `self.urls = []`. At the top of `__call__`:

```python
        auth = (headers or {}).get("Authorization", "")
        self.callers.append(auth if auth.startswith("Bearer ") else "basic")
        self.urls.append(url)
        parts = urlsplit(url)
        # A person's seat (round 2 D2): https://api.atlassian.com/ex/jira/<cloud>/rest/api/3/...
        path = re.sub(r"^/ex/jira/[^/]+", "", parts.path)
```

and use this `path` in place of `parts.path` below it.

- [ ] **Step 4: The provider**

In `services/connectors/providers/jira.py`:

```python
def _headers(self, creds):
    # Round 2 D2 (R2D2-5): a person's seat carries their OAuth access token.
    if creds.get("access_token"):
        return {"Authorization": f"Bearer {creds['access_token']}"}
    return basic_auth(creds["email"], creds["api_token"])


def _url(self, config, path, params=None):
    query = f"?{urlencode(params)}" if params else ""
    base = config.get("api_base") or f"https://{config['host']}"
    return f"{base}{API}{path}{query}"
```

`connect` and `fetch_tickets` keep their own host URLs (they always act as the connection).

- [ ] **Step 5: Run it to see it pass**

Run: `$PY manage.py test services.connectors services.agents.tests.test_jira_create_kind services.agents.tests.test_jira_comment_kind --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/providers/jira.py services/connectors/tests/jira_fake.py services/connectors/tests/test_jira_actions.py
git commit -m "feat(connectors): Jira calls can act from a person's seat

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Link, see and unlink your Jira account

**Files:**
- Create: `services/connectors/link_views.py`
- Modify: `services/connectors/urls.py`
- Test: `services/connectors/tests/test_link_views.py` (create); `services/agents/tests/outside_fixtures.py` (`link_for`)

**Interfaces:**
- Consumes: `jira_links.*` (Task 2).
- Produces: routes of contract §2: `GET/POST/DELETE /api/v1/connectors/jira-link/`, `GET /api/v1/connectors/jira-link/callback/`; `link_views.JIRA_LINK_QUERIES` pinned in its test. `OutsideFixture.link_for(user, *, host="acme.atlassian.net", status="linked", expires_in=3600) -> JiraLink`.

- [ ] **Step 1: Write the failing tests**

Create `services/connectors/tests/test_link_views.py`:

```python
"""The Jira link routes (agent bundles round 2 D2 contract §2). Atlassian is
a fake; the OAuth round trip is bound to the starting browser."""

from urllib.parse import parse_qs, urlsplit

from django.test import override_settings
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import JiraLink
from services.connectors.tests.atlassian_fake import use_atlassian

LINK = "/api/v1/connectors/jira-link/"
CALLBACK = "/api/v1/connectors/jira-link/callback/"
ON = {
    "ATLASSIAN_OAUTH_CLIENT_ID": "cid",
    "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret",
    "FRONTEND_URL": "https://app.test",
}
#: GET /connectors/jira-link/ (contract §8), measured.
JIRA_LINK_QUERIES = 4


@override_settings(**ON)
class JiraLinkRouteTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.atlassian = use_atlassian(self)

    def start(self, user):
        client = self.client_for(user)
        answer = client.post(LINK)
        self.assertEqual(answer.status_code, 200, answer.content)
        state = parse_qs(urlsplit(answer.json()["authorize_url"]).query)["state"][0]
        return client, state

    def finish(self, client, state, code="good-code"):
        answer = client.get(CALLBACK, {"code": code, "state": state})
        self.assertEqual(answer.status_code, 302)
        return {k: v[0] for k, v in parse_qs(urlsplit(answer["Location"]).query).items()}

    def test_link_see_and_unlink(self):
        client, state = self.start(self.csm)
        self.assertEqual(self.finish(client, state), {"jira_link": "linked"})
        link = JiraLink.objects.get(user=self.csm)
        self.assertEqual(
            (link.account_id, link.name, link.status), ("acc-carl", "Carl Lee", "linked")
        )
        body = self.client_for(self.csm).get(LINK).json()
        self.assertEqual(body["configured"], True)
        self.assertEqual(
            body["connectors"],
            [{"id": self.board.pk, "name": self.board.name, "host": "acme.atlassian.net"}],
        )
        self.assertEqual(body["link"]["covers"], [self.board.pk])
        self.assertNotIn("credentials", str(body))
        event = AuditEvent.objects.get(action="jira.link")
        self.assertEqual(event.metadata["account_id"], "acc-carl")
        self.assertEqual(self.client_for(self.csm).delete(LINK).status_code, 204)
        self.assertFalse(JiraLink.objects.exists())
        self.assertEqual(
            AuditEvent.objects.get(action="jira.unlink").metadata, {"reason": "person"}
        )

    def test_only_your_own_link_is_ever_shown(self):
        self.link_for(self.csm)
        self.assertIsNone(self.client_for(self.other).get(LINK).json()["link"])
        self.assertIsNone(self.client_for(self.admin).get(LINK).json()["link"])

    def test_refusals_before_the_round_trip(self):
        with override_settings(ATLASSIAN_OAUTH_CLIENT_ID=""):
            answer = self.client_for(self.csm).post(LINK)
        self.assertEqual((answer.status_code, answer.json()["code"]), (409, "JIRA_LINK_OFF"))
        self.board.is_enabled = False
        self.board.save()
        answer = self.client_for(self.csm).post(LINK)
        self.assertEqual(
            answer.json(),
            {"code": "NO_JIRA", "detail": "This workspace has no Jira connection yet."},
        )

    def test_another_browser_gets_nothing(self):
        _, state = self.start(self.csm)
        landed = self.finish(APIClient(), state)
        self.assertEqual(landed["detail"], "Open the link in the browser that started it.")
        self.assertFalse(JiraLink.objects.exists())
        self.assertEqual(self.atlassian.tokens_issued, 0)
        self.assertEqual(
            AuditEvent.objects.get(action="jira.link_refused").metadata["reason"], "other_browser"
        )

    def test_an_account_without_the_site_is_refused_and_keeps_no_token(self):
        self.atlassian.resources = [
            {
                "id": "c2",
                "url": "https://other.atlassian.net",
                "name": "other",
                "scopes": ["read:jira-work"],
            }
        ]
        client, state = self.start(self.csm)
        landed = self.finish(client, state)
        self.assertEqual(
            landed["detail"],
            "Your Atlassian account can't open acme.atlassian.net, the site Revenact's Jira connection uses.",
        )
        self.assertFalse(JiraLink.objects.exists())

    def test_one_account_one_person(self):
        self.link_for(self.other, account_id="acc-carl")
        client, state = self.start(self.csm)
        self.assertEqual(
            self.finish(client, state)["detail"],
            "Someone else here has linked that Atlassian account.",
        )
        self.assertEqual(
            AuditEvent.objects.get(action="jira.link_refused").metadata["reason"], "taken"
        )

    def test_no_refresh_token_no_link(self):
        self.atlassian.give_refresh_token = False
        client, state = self.start(self.csm)
        self.assertEqual(
            self.finish(client, state)["detail"],
            "Atlassian didn't allow Revenact to stay linked. Try again.",
        )

    def test_a_refused_code_and_a_denied_consent(self):
        client, state = self.start(self.csm)
        self.assertEqual(
            self.finish(client, state, code="bad")["detail"],
            "Atlassian didn't accept the sign-in. Try again.",
        )
        answer = self.client_for(self.csm).get(CALLBACK, {"error": "access_denied"})
        self.assertIn("didn%27t+allow+Revenact", answer["Location"])

    def test_relinking_replaces_the_link(self):
        self.link_for(self.csm, account_id="acc-old")
        client, state = self.start(self.csm)
        self.finish(client, state)
        self.assertEqual(JiraLink.objects.get().account_id, "acc-carl")
        self.assertEqual(AuditEvent.objects.get(action="jira.link").metadata["replaced"], True)

    def test_reading_the_link_costs_the_same(self):
        self.link_for(self.csm)
        client = self.client_for(self.csm)
        client.get(LINK)
        with self.assertNumQueries(JIRA_LINK_QUERIES):
            self.assertEqual(client.get(LINK).status_code, 200)
```

Add to `OutsideFixture` (`services/agents/tests/outside_fixtures.py`):

```python
def link_for(
    self, user, *, host="acme.atlassian.net", status="linked", expires_in=3600, account_id=None
):
    """A Jira link for `user` covering `host` (round 2 D2), with fake tokens."""
    import time

    from services.connectors.models import JiraLink

    link = JiraLink(
        organisation=user.organisation,
        user=user,
        account_id=account_id or f"acc-{user.pk}",
        name=user.name,
        sites=[{"cloud_id": "cloud-1", "url": f"https://{host}", "name": host.split(".")[0]}],
        status=status,
    )
    link.set_credentials(
        {
            "access_token": f"at-{user.pk}",
            "refresh_token": "rt-0",
            "expires_at": time.time() + expires_in,
        }
    )
    link.save()
    return link
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_link_views --parallel auto --noinput`
Expected: 404s (no route).

- [ ] **Step 3: The views**

Create `services/connectors/link_views.py`:

```python
"""A person links their own Atlassian account (agent bundles round 2 D2
contract §2, R2D2-2 to R2D2-14). The round trip is bound to the starting
browser (core.oauth_browser); the callback is public, trusts its signed
state only alongside that browser's cookie, and keeps no token unless the
account covers one of the workspace's Jira sites."""

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.http import HttpResponseRedirect
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit, oauth_browser

from . import jira_links
from .models import JiraLink
from .providers.base import ProviderError

STATE_SALT = "connectors.jira_link"
STATE_MAX_AGE = 15 * 60
COOKIE = "revenact_jira_link"
COOKIE_PATH = "/api/v1/connectors/jira-link/"
LINK_OFF = "Linking a Jira account isn't set up on this deployment."
NO_JIRA = "This workspace has no Jira connection yet."
DENIED = "You didn't allow Revenact to use your Jira account."
EXPIRED = "This link is invalid or has expired. Try again."
OTHER_BROWSER = "Open the link in the browser that started it."
EXCHANGE = "Atlassian didn't accept the sign-in. Try again."
NO_REFRESH = "Atlassian didn't allow Revenact to stay linked. Try again."
TAKEN = "Someone else here has linked that Atlassian account."
_stamp = serializers.DateTimeField().to_representation


def _redirect_uri(request):
    base = settings.MAIL_OAUTH_REDIRECT_BASE or request.build_absolute_uri("/").rstrip("/")
    # A URL for Atlassian, not an HTTP response body (semgrep's Flask rule misreads it).
    return f"{base}/api/v1/connectors/jira-link/callback/"  # nosemgrep


def _back(outcome, detail=""):
    from urllib.parse import urlencode

    query = {"jira_link": outcome}
    if detail:
        query["detail"] = detail[:200]
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/integrations?{urlencode(query)}")


def no_site(host):
    return f"Your Atlassian account can't open {host}, the site Revenact's Jira connection uses."


def _link_payload(link, connectors):
    if link is None:
        return None
    return {
        "name": link.name,
        "email": link.email,
        "status": link.status,
        "sites": [{"url": s.get("url", ""), "name": s.get("name", "")} for s in link.sites or []],
        "covers": [c.pk for c in connectors if jira_links.site_for(link, c)],
        "linked_at": _stamp(link.linked_at),
    }


def _refused(request, user, reason, sentence):
    audit.record(  # SOC2:LOG-01 a refused Jira link
        "jira.link_refused",
        request=request,
        actor=user,
        organisation=user.organisation,
        outcome="failure",
        metadata={"reason": reason},
    )
    return _back("error", sentence)


class JiraLinkView(APIView):
    """GET (my link), POST (start linking), DELETE (unlink): the caller's own only."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        connectors = list(jira_links.jira_connectors(request.user.organisation_id))
        # SOC2:AUTH-02 a person's link is theirs alone: never anyone else's (R2D2-11)
        link = JiraLink.objects.filter(user=request.user).first()
        return Response(
            {
                "configured": jira_links.configured(),
                "connectors": [
                    {"id": c.pk, "name": c.name, "host": (c.config or {}).get("host", "")}
                    for c in connectors
                ],
                "link": _link_payload(link, connectors),
            }
        )

    def post(self, request):
        if not jira_links.configured():
            return Response({"code": "JIRA_LINK_OFF", "detail": LINK_OFF}, status=409)
        if not jira_links.jira_connectors(request.user.organisation_id).exists():
            return Response({"code": "NO_JIRA", "detail": NO_JIRA}, status=409)
        response = Response()
        # SOC2:AUTH-01 the callback finishes only in this browser
        browser = oauth_browser.bind(
            response, request, name=COOKIE, path=COOKIE_PATH, max_age=STATE_MAX_AGE
        )
        state = signing.dumps({"user": request.user.id, "browser": browser}, salt=STATE_SALT)
        response.data = {"authorize_url": jira_links.authorize_url(state, _redirect_uri(request))}
        return response

    def delete(self, request):
        link = JiraLink.objects.filter(user=request.user).first()
        if link is not None:
            with transaction.atomic():
                audit.record(  # SOC2:LOG-01 a person's Jira tokens are removed
                    "jira.unlink",
                    request=request,
                    target=link,
                    target_repr=f"Jira link {link.pk}",
                    metadata={"reason": "person"},
                )
                link.delete()
        return Response(status=204)


class JiraLinkCallbackView(APIView):
    """GET /connectors/jira-link/callback/?code=&state= (contract §2.3)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        response = self._finish(request)
        oauth_browser.forget(response, request, name=COOKIE, path=COOKIE_PATH)
        return response

    def _finish(self, request):
        from services.accounts.models import User

        if request.query_params.get("error"):
            return _back("error", DENIED)
        try:
            state = signing.loads(
                request.query_params.get("state", ""), salt=STATE_SALT, max_age=STATE_MAX_AGE
            )
        except signing.BadSignature:
            return _back("error", EXPIRED)
        user = User.objects.filter(pk=state.get("user"), is_active=True).first()
        if user is None:
            return _back("error", EXPIRED)
        # SOC2:AUTH-01 before the code exchange: a forwarded link gets no token
        if not oauth_browser.same_browser(request, state, name=COOKIE, path=COOKIE_PATH):
            return _refused(request, user, "other_browser", OTHER_BROWSER)
        try:
            tokens = jira_links.exchange(
                request.query_params.get("code", ""), _redirect_uri(request)
            )
            if not tokens["refresh_token"]:
                return _refused(request, user, "no_refresh", NO_REFRESH)
            sites = jira_links.resources(tokens["access_token"])
            connectors = list(jira_links.jira_connectors(user.organisation_id))
            probe = JiraLink(sites=sites)
            covering = next(
                (
                    jira_links.site_for(probe, c)
                    for c in connectors
                    if jira_links.site_for(probe, c)
                ),
                None,
            )
            if covering is None:
                host = (
                    (connectors[0].config or {}).get("host", "your Jira site")
                    if connectors
                    else "your Jira site"
                )
                return _refused(request, user, "no_site", no_site(host))
            me = jira_links.myself(tokens["access_token"], covering["cloud_id"])
        except ProviderError:
            return _refused(request, user, "exchange", EXCHANGE)
        return self._store(request, user, tokens, sites, me)

    def _store(self, request, user, tokens, sites, me):
        account = str(me.get("accountId") or "")
        try:
            with transaction.atomic():
                replaced = JiraLink.objects.filter(user=user).exists()
                JiraLink.objects.filter(user=user).delete()
                link = JiraLink(
                    organisation=user.organisation,
                    user=user,
                    account_id=account,
                    name=str(me.get("displayName") or user.name)[:150],
                    email=str(me.get("emailAddress") or "")[:254],
                    sites=sites,
                    scopes=tokens["scope"].split(),
                )
                link.set_credentials(
                    {k: tokens[k] for k in ("access_token", "refresh_token", "expires_at")}
                )
                link.save()
                audit.record(  # SOC2:LOG-01 a person linked their Atlassian account
                    "jira.link",
                    request=request,
                    actor=user,
                    organisation=user.organisation,
                    target=link,
                    target_repr=f"Jira link {link.pk}",
                    metadata={
                        "account_id": account,
                        "sites": len(sites),
                        "scopes": link.scopes,
                        "replaced": replaced,
                    },
                )
        except IntegrityError:
            return _refused(request, user, "taken", TAKEN)
        return _back("linked")
```

`services/connectors/urls.py`, before `"<int:pk>/"`:

```python
(path("jira-link/", link_views.JiraLinkView.as_view(), name="jira-link"),)
(
    path(
        "jira-link/callback/",
        link_views.JiraLinkCallbackView.as_view(),
        name="jira-link-callback",
    ),
)
```

(and `from . import link_views, views`).

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: OK. If `JIRA_LINK_QUERIES` differs, the failure prints the measured count: pin it when it is constant (it reads the connectors and the link, plus auth); record it in the contract's "Changes during the build".

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/link_views.py services/connectors/urls.py services/connectors/tests/test_link_views.py services/agents/tests/outside_fixtures.py
git commit -m "feat(connectors): link, see and unlink your own Jira account

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The facade takes a seat; the step's seat and its sentences

**Files:**
- Create: `services/agents/outside/seats.py`
- Modify: `services/agents/outside/tools.py` (`JiraTool`), `sentences.py`, `trail.py`, `services/agents/bulk.py`, `services/agents/tests/outside_fakes.py` (`FakeJira`)
- Test: `services/agents/tests/test_outside_seats.py` (create)

**Interfaces:**
- Consumes: `jira_links.seat_for`, `connection_seat`, `warm`, `preview_for`, `LinkLost`, `LinkUnreachable` (Task 2).
- Produces (`seats.py`): `JIRA_KINDS`, `link_of(user) -> JiraLink | None` (bulk-aware), `lost_sentence(connector) -> str`, `for_step(connector, actor, attempt=None) -> Seat` (raises `StepFailed`), `acted(seat) -> dict`, `as_of(seat) -> str`, `warm(user)`.
- Produces (`tools.py`): every `JiraTool` method gains `seat=None`; `None` means `jira_links.connection_seat(connector)`.
- Produces (`sentences.py`): `JIRA_LINK_REFUSED`, `LIST_LINK_REFUSED`, `ATLASSIAN_UNREACHABLE`, `LIST_ATLASSIAN_UNREACHABLE`; `jira(exc, ..., person=False)`; `list_failure(exc, ..., person=False)`.
- Produces (`trail.py`): `call(..., as_="")` writes `metadata["as"]` when given.
- Produces (`bulk.py`): `Bulk.jira_link(user)`, one query per reader.
- Produces (`FakeJira`): every method takes `seat=None` and appends it to `self.seats`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_outside_seats.py`:

```python
"""Who a Jira step acts as (agent bundles round 2 D2 contract §3): the
runner's link when it covers the site, else the connection's account; a
lost link fails the step with the contract's sentence."""

from services.agents.kinds import StepFailed
from services.agents.outside import seats, sentences
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.providers.base import ProviderError


class SeatTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()

    def test_the_runner_acts_as_themselves_when_linked(self):
        self.link_for(self.csm)
        seat = seats.for_step(self.board, self.csm)
        self.assertEqual((seat.person, seat.name), (True, self.csm.name))
        self.assertEqual(seats.acted(seat), {"acted_as": "person", "jira_account": self.csm.name})
        self.assertEqual(seats.as_of(seat), "person")

    def test_no_link_or_another_site_acts_as_the_connection(self):
        self.assertEqual(seats.for_step(self.board, self.csm).name, "Jira Bot")
        self.link_for(self.other, host="other.atlassian.net")
        self.assertFalse(seats.for_step(self.board, self.other).person)

    def test_a_lost_link_fails_the_step(self):
        self.link_for(self.csm, status="lost")
        with self.assertRaises(StepFailed) as caught:
            seats.for_step(self.board, self.csm, {"attempted_at": "x"})
        self.assertEqual(
            caught.exception.detail,
            "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot.",
        )
        self.assertEqual(caught.exception.result, {"attempted_at": "x"})

    def test_person_sentences(self):
        refused = ProviderError("401", status=401)
        self.assertEqual(
            sentences.jira(refused, person=True),
            "Jira refused your Jira link. Link Jira again, then Retry.",
        )
        forbidden = ProviderError("403", status=403)
        self.assertEqual(
            sentences.jira(forbidden, issue="SUP-12", person=True),
            "Your Jira account can't do this in SUP-12. Ask a Jira admin for permission, then Retry.",
        )
        self.assertEqual(
            sentences.jira(forbidden, issue="SUP-12"),
            "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry.",
        )
        self.assertEqual(
            sentences.list_failure(refused, person=True),
            ("TOOL_REFUSED", "Jira refused your Jira link. Link Jira again, then try again.", 409),
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_outside_seats --parallel auto --noinput`
Expected: ImportError: cannot import name `seats`.

- [ ] **Step 3: Sentences and the trail**

`services/agents/outside/sentences.py`, add:

```python
JIRA_LINK_REFUSED = "Jira refused your Jira link. Link Jira again, then Retry."
LIST_LINK_REFUSED = "Jira refused your Jira link. Link Jira again, then try again."
ATLASSIAN_UNREACHABLE = "Couldn't reach Atlassian to use your Jira link. Retry it."
LIST_ATLASSIAN_UNREACHABLE = "Couldn't reach Atlassian. Try again."
```

`list_failure(exc, *, project="", issue="", person=False)`: first line becomes

```python
    if exc.status in (401, 403):
        return "TOOL_REFUSED", LIST_LINK_REFUSED if person else LIST_REFUSED, 409
```

`jira(exc, *, project="", issue="", assignee="", person=False)`: the 401 and 403 branches become

```python
    if status == 401:
        return JIRA_LINK_REFUSED if person else JIRA_LOGIN
    if status == 403:
        if person:
            return (
                f"Your Jira account can't do this in {issue or project}. "
                "Ask a Jira admin for permission, then Retry."
            )
        return (
            f"The Jira account can't do this in {issue or project}. "
            "Give it permission in Jira, then Retry."
        )
```

`services/agents/outside/trail.py`: `def call(step, actor, *, tool, op, outcome, where="", returned="", as_=""):` and, after building `metadata`, `if as_: metadata["as"] = as_` (build the dict in a variable first).

- [ ] **Step 4: The bulk read**

In `services/agents/bulk.py` `Bulk.__init__`, next to `self._mailboxes = {}`: `self._jira_links = {}`; add the method after `mailbox`:

```python
    def jira_link(self, user):
        """`user`'s own Jira link or None, one query per reader (round 2 D2)."""
        if user.pk not in self._jira_links:
            from services.connectors.models import JiraLink

            self._jira_links[user.pk] = JiraLink.objects.filter(user=user).first()
        return self._jira_links[user.pk]
```

- [ ] **Step 5: `seats.py`**

Create `services/agents/outside/seats.py`:

```python
"""Who an agent's Jira step acts as (agent bundles round 2 D2 contract §3,
R2D2-2, R2D2-8 to R2D2-11): the runner's own Jira link when it covers the
step's site, else the connection's account. Read through the page's one
link read per reader; refreshed before any step's transaction opens."""

from services.connectors import jira_links
from services.connectors.models import JiraLink
from services.metrics.models import AgentAction

from .. import bulk
from ..kinds import StepFailed
from . import sentences

K = AgentAction.Kind
JIRA_KINDS = (K.JIRA_CREATE, K.JIRA_ASSIGN, K.JIRA_COMMENT)


def link_of(user):
    if user is None:
        return None
    page = bulk.active()
    if page is not None:
        return page.jira_link(user)
    # SOC2:AUTH-02 a person acts only through their own link
    return JiraLink.objects.filter(user=user).first()


def lost_sentence(connector):
    name = jira_links.connection_name(connector) if connector is not None else "the Jira connection"
    return f"Your Jira link stopped working. Link Jira again, or remove the link to act as {name}."


def for_step(connector, actor, attempt=None):
    """The step's seat. Raises StepFailed with the contract's sentence."""
    try:
        return jira_links.seat_for(connector, link_of(actor))
    except jira_links.LinkLost:
        raise StepFailed(lost_sentence(connector), result=attempt) from None
    except jira_links.LinkUnreachable:
        raise StepFailed(sentences.ATLASSIAN_UNREACHABLE, result=attempt) from None


def acted(seat):
    return {"acted_as": as_of(seat), "jira_account": seat.name}


def as_of(seat):
    return "person" if seat.person else "connection"


def warm(user):
    """Before step transactions open (run_bundle, retry_step): R2D2-8."""
    jira_links.warm(JiraLink.objects.filter(user=user).first())
```

(`StepFailed(detail, result=...)`: check its signature with `grep -n "class StepFailed" -A8 services/agents/kinds.py`.)

- [ ] **Step 6: The facade**

In `services/agents/outside/tools.py` `JiraTool`, add:

```python
    @staticmethod
    def _seat(connector, seat):
        from services.connectors.jira_links import connection_seat

        return seat or connection_seat(connector)
```

and rewrite every method to take `seat=None` and call the provider with `s.config, s.creds`, passing `person=s.person` to `sentences.jira` / `list_failure`. `create`, for instance:

```python
    def create(self, connector, *, fields, project, seat=None):
        from services.connectors.providers.jira import issue_url

        s = self._seat(connector, seat)
        try:
            key = self._jira().create_issue(s.config, s.creds, fields=fields)
        except NoAnswer:
            raise Unconfirmed(sentences.JIRA_CREATE_UNCONFIRMED) from None
        except ProviderError as exc:
            raise Refused(sentences.jira(exc, project=project, person=s.person)) from None
        return Issue(key=key, url=issue_url(connector.config, key))
```

The same shape for `find`, `assign`, `comment`, `find_comment`, `assignee`, `account_for`, `issue_types`, `priorities` and `options` (whose `ListFailed` gets `list_failure(exc, project=project, issue=issue, person=s.person)`). Links (`issue_url`, `_comment`) keep `connector.config` (the site's host).

In `services/agents/tests/outside_fakes.py` `FakeJira`: `self.seats = []` in `__init__`, and every method gains `seat=None` with `self.seats.append(seat)` as its first line.

- [ ] **Step 7: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_outside_seats services.agents.tests.test_jira_create_kind services.agents.tests.test_jira_assign_kind services.agents.tests.test_jira_comment_kind services.agents.tests.test_step_options services.connectors --parallel auto --noinput`
Expected: OK (the kinds don't pass a seat yet: the connection's, as before).

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside/seats.py services/agents/outside/tools.py services/agents/outside/sentences.py services/agents/outside/trail.py services/agents/bulk.py services/agents/tests/outside_fakes.py services/agents/tests/test_outside_seats.py
git commit -m "feat(agents): Jira calls take a seat; the person's sentences

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Jira steps act as their runner, say so before Run, and block on a lost link

**Files:**
- Modify: `services/agents/actions/jira_issues.py` (`_as`, `preview`, `preview_assign`, `apply`, `apply_assign`, `CREATE`, `ASSIGN`), `services/agents/actions/jira_comments.py` (`preview`, `apply`, `COMMENT`), `services/agents/outside/gates.py` (`blocked`), `services/agents/bundle_run.py` (`run_bundle`, `retry_step`)
- Test: `services/agents/tests/test_jira_as_person.py` (create)

**Interfaces:**
- Consumes: `seats.*` (Task 5), `jira_links.preview_for` (Task 2), `FakeJira.seats` (Task 5).
- Produces: per-reader previews with `as`, `as_you`, `link` (contract §3.4); `result.acted_as`, `result.jira_account`; `agent_outside.call` `as`; the lost-link `Blocked` (contract §3.2); `warm` before step transactions.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_jira_as_person.py`:

```python
"""Jira steps act as the person who runs them (agent bundles round 2 D2
contract §3, R2D2-2, R2D2-9, R2D2-10). Jira is a fake."""

from django.test import override_settings

from core.models import AuditEvent
from services.agents.tests.outside_fixtures import OutsideFixture
from services.connectors.models import Connector

DETAIL = "/api/v1/agents/bundles/{}/"
ON = {"ATLASSIAN_OAUTH_CLIENT_ID": "cid", "ATLASSIAN_OAUTH_CLIENT_SECRET": "secret"}
LOST = "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot."


@override_settings(**ON)
class JiraAsPersonTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        self.board = self.jira_connector()
        self.ticket, self.thread = self.jira_thread(self.pizza, self.board)
        self.bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.comment",
                {"connector_id": self.board.pk, "issue": "SUP-12", "body": "Seen on Safari too."},
            ),
        )
        self.create, self.comment = self.bundle.steps.order_by("position")

    def steps(self, user):
        return self.client_for(user).get(DETAIL.format(self.bundle.pk)).json()["steps"]

    def test_the_panel_names_who_acts_for_each_reader(self):
        self.link_for(self.csm)
        carl = self.steps(self.csm)
        self.assertEqual(
            {k: carl[0]["preview"]["jira"][k] for k in ("as", "as_you", "link")},
            {"as": self.csm.name, "as_you": True, "link": None},
        )
        self.assertEqual(carl[1]["preview"]["jira_comment"]["as_you"], True)
        alice = self.steps(self.admin)
        self.assertEqual(
            {k: alice[0]["preview"]["jira"][k] for k in ("as", "as_you", "link")},
            {"as": "Jira Bot", "as_you": False, "link": "none"},
        )

    def test_a_linked_runner_creates_and_comments_as_themselves(self):
        self.link_for(self.csm)
        self.run_all_steps(self.csm, self.bundle)
        used = [s for s in self.jira.seats if s is not None]
        self.assertTrue(used)
        self.assertTrue(all(s.person and s.config.get("api_base") for s in used))
        self.create.refresh_from_db()
        self.assertEqual(
            (self.create.result["acted_as"], self.create.result["jira_account"]),
            ("person", self.csm.name),
        )
        rows = AuditEvent.objects.filter(action="agent_outside.call").values_list(
            "metadata__as", flat=True
        )
        self.assertEqual(set(rows), {"person"})

    def test_an_unlinked_runner_acts_as_the_connection(self):
        self.run_all_steps(self.csm, self.bundle)
        self.create.refresh_from_db()
        self.assertEqual(self.create.result["acted_as"], "connection")
        self.assertTrue(all(s is None or not s.person for s in self.jira.seats))

    def test_a_lost_link_blocks_and_never_falls_back(self):
        self.link_for(self.csm, status="lost")
        step = self.steps(self.csm)[0]
        self.assertEqual(
            (step["can_run"], step["disabled_reason"], step["disabled_link"]),
            (False, LOST, "/settings/connections"),
        )
        self.assertEqual(self.jira.created, [])

    def test_the_switch_still_gates_a_linked_runner(self):
        self.link_for(self.csm)
        Connector.objects.filter(pk=self.board.pk).update(agents_can_act=False)
        step = self.steps(self.csm)[0]
        self.assertEqual(step["disabled_reason"], "Ask an admin to allow agents to act in Jira.")

    def test_a_run_refreshes_an_expiring_token_before_the_steps(self):
        from services.connectors.tests.atlassian_fake import use_atlassian

        atlassian = use_atlassian(self)
        atlassian.live_refresh.add("rt-0")
        self.link_for(self.csm, expires_in=5 * 60)
        self.run_all_steps(self.csm, self.bundle)
        self.assertEqual(atlassian.refreshes, ["rt-0"])
```

(The `run_all_steps` helper posts the run as the given user; check its body in `outside_fixtures.py`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_jira_as_person --parallel auto --noinput`
Expected: FAIL: `KeyError: 'as_you'`, `acted_as` missing.

- [ ] **Step 3: Per-reader previews**

`services/agents/actions/jira_issues.py`:

```python
def _as(connector, reader=None):
    """Where it acts and as whom, for `reader` (round 2 D2 contract §3.4)."""
    if connector is None:
        return {"site": "", "as": "Jira", "as_you": False, "link": None}
    from services.connectors.jira_links import preview_for

    from ..outside.seats import link_of

    config = connector.config or {}
    return {
        "site": config.get("host", ""),
        **preview_for(connector, link_of(reader) if reader else None),
    }
```

`preview(action, reader)` and `preview_assign(action, reader)` take the reader, call `_as(gates.connector_of(action), reader)`, and add `"as_you": where["as_you"], "link": where["link"]` beside `"as"`. `jira_comments.preview(action, reader)` likewise. Each of `CREATE`, `ASSIGN`, `COMMENT` gains `per_reader=True`.

Check nothing else calls these previews without a reader:

```bash
grep -rn "preview_assign(\|jira_issues.preview(\|jira_comments.preview(\|_as(" services/agents --include=*.py
```

Expected: only `payloads.preview_for` (through the registry) and the kinds themselves.

- [ ] **Step 4: The gate**

In `services/agents/outside/gates.py` `blocked`, after the `can_act` block and before the Slack read check:

```python
    if not slack:
        from .seats import link_of, lost_sentence

        link = link_of(reader)
        # SOC2:AUTH-02 a lost link never falls back to the connection's account (R2D2-9)
        if link is not None and link.status == "lost":
            return Blocked(lost_sentence(connector))
```

- [ ] **Step 5: The runs**

In `jira_issues.apply`, after `connector = gates.connector_of(action)` and the project check:

```python
    attempt = keys.attempt(action, actor)
    seat = seats.for_step(connector, actor, attempt)
    attempt.update(seats.acted(seat))
    as_ = seats.as_of(seat)
```

(remove the later `attempt = keys.attempt(action, actor)` line), and pass `seat=seat` to every `tool.*` call (`tool.find`, `tool.create`; `_fields(...)` gains a `seat` parameter it passes to `tool.issue_types`, `tool.priorities` and `account(tool, connector, payload, seat)`, which passes it to `tool.account_for`), and `as_=as_` to every `trail.call`. `apply_assign` and `jira_comments.apply` the same: resolve the seat once after the placeholder check, put `acted` into `attempt`, pass `seat=` to `tool.assignee`, `tool.assign`, `account(...)`, `tool.find_comment`, `tool.comment`, and `as_=` to every `trail.call`. Import `seats` with `from ..outside import gates, keys, seats, sentences, tools, trail`.

Check every call got it:

```bash
grep -n "tool\.\(create\|find\|assign\|assignee\|account_for\|issue_types\|priorities\|comment\|find_comment\)(" services/agents/actions/jira_issues.py services/agents/actions/jira_comments.py
grep -n "trail.call(" services/agents/actions/jira_issues.py services/agents/actions/jira_comments.py
```

Expected: every match has `seat=seat` (first) / `as_=as_` (second) within its call.

In `services/agents/bundle_run.py`: in `run_bundle`, just before `bundle, refused = _claim(...)`:

```python
    from .outside.seats import JIRA_KINDS, warm

    if any(s.kind in JIRA_KINDS for s in steps):
        warm(reader)  # R2D2-8: refreshed before any step's transaction opens
```

and in `retry_step`, just before `with transaction.atomic():`:

```python
    from .outside.seats import JIRA_KINDS, warm

    if step.kind in JIRA_KINDS:
        warm(reader)
```

- [ ] **Step 6: Run them to see them pass**

Run: `$PY manage.py test services.agents services.connectors --parallel auto --noinput`
Expected: OK. Existing D3 and R2-D1 tests that compare a whole `preview.jira` dict or a whole `agent_outside.call` metadata now see `as_you`, `link` and `as`: update those expectations (the new keys only), never the old values.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/actions/jira_issues.py services/agents/actions/jira_comments.py services/agents/outside/gates.py services/agents/bundle_run.py services/agents/tests/test_jira_as_person.py
git add $(git diff --name-only -- services/agents/tests)
git commit -m "feat(agents): Jira steps act as the person who runs them, named before Run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The Jira pick lists read as the reader

**Files:**
- Modify: `services/agents/outside/options.py` (the Jira branch)
- Test: `services/agents/tests/test_step_options.py` (append)

**Interfaces:**
- Consumes: `jira_links.seat_for`, `seats.link_of`, `seats.lost_sentence` (Tasks 2, 5); `JiraTool.options(..., seat=)` (Task 5).
- Produces: contract §3.6's list answers for a person's seat.

- [ ] **Step 1: Write the failing tests**

Append to `StepOptionsTests`:

```python
def test_lists_read_as_a_linked_reader(self):
    self.link_for(self.csm)
    self.get(self.create, "jira_projects")
    self.assertTrue(self.jira.seats[-1].person)


def test_a_lost_link_blocks_the_lists(self):
    self.link_for(self.csm, status="lost")
    answer = self.get(self.create, "jira_projects")
    self.assertEqual(
        (answer.status_code, answer.json()),
        (
            409,
            {
                "code": "TOOL_BLOCKED",
                "detail": "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot.",
            },
        ),
    )


def test_atlassian_unreachable_is_a_502(self):
    from services.connectors.tests.atlassian_fake import use_atlassian

    atlassian = use_atlassian(self)
    atlassian.drop_refresh()
    self.link_for(self.csm, expires_in=0)
    answer = self.get(self.create, "jira_projects")
    self.assertEqual(
        (answer.status_code, answer.json()["detail"]), (502, "Couldn't reach Atlassian. Try again.")
    )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_step_options --parallel auto --noinput`
Expected: FAIL (the lists act as the connection; no 409 for a lost link).

- [ ] **Step 3: The lists' seat**

In `options.py`, replace the `try: rows, more = tools.current().jira.options(...)` block:

```python
    from services.connectors import jira_links

    from .seats import link_of, lost_sentence

    try:
        # SOC2:AUTH-02 a person's lists are what their own Jira account may pick (R2D2-5)
        seat = jira_links.seat_for(connector, link_of(reader))
    except jira_links.LinkLost:
        raise Refusal(409, {"code": "TOOL_BLOCKED", "detail": lost_sentence(connector)}) from None
    except jira_links.LinkUnreachable:
        raise Refusal(
            502, {"code": "TOOL_UNREACHABLE", "detail": sentences.LIST_ATLASSIAN_UNREACHABLE}
        ) from None
    try:
        rows, more = tools.current().jira.options(
            connector, name, project=project, issue=issue, query=query, seat=seat
        )
    except tools.ListFailed as exc:
        raise Refusal(exc.status, {"code": exc.code, "detail": exc.detail}) from None
```

(`from . import gates, sentences, tools`.)

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_step_options --parallel auto --noinput`
Expected: OK. `OPTIONS_QUERIES` may move by one (the link read): re-pin only that test's constant to the printed number and record it.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside/options.py services/agents/tests/test_step_options.py
git commit -m "feat(agents): Jira pick lists read as the reader's own Jira account

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Slack lists the bot's member channels

**Files:**
- Modify: `services/connectors/providers/slack.py`, `services/connectors/tests/slack_fake.py`
- Test: `services/connectors/tests/test_slack_actions.py` (append)

**Interfaces:**
- Produces: `SlackProvider.member_channels(creds, *, private) -> list[{"id", "name", "private"}]` (contract R2D2-16: `users.conversations`, `types`, `exclude_archived=true`, `limit=200`, at most 5 pages). Raises `ProviderError` with Slack's `code`. `FakeSlackApi.members` (set of channel ids the bot is in), `FakeSlackApi.private` (set of private ids); `users.conversations` paged like `conversations.history`.

- [ ] **Step 1: Write the failing test**

Append to `services/connectors/tests/test_slack_actions.py` (it builds a `FakeSlackApi` with `use_slack`; follow its setUp):

```python
class MemberChannelTests(SimpleTestCase):
    def setUp(self):
        self.slack = use_slack(self)

    def test_member_channels_pages_and_respects_private(self):
        for n in range(450):
            self.slack.names[f"C{n:04d}"] = f"room-{n}"
            self.slack.channels[f"C{n:04d}"] = []
            self.slack.members.add(f"C{n:04d}")
        self.slack.names["G0LEADS"] = "leads"
        self.slack.channels["G0LEADS"] = []
        self.slack.members.add("G0LEADS")
        self.slack.private.add("G0LEADS")
        rows = SlackProvider().member_channels({"bot_token": "xoxb"}, private=False)
        self.assertEqual(len(rows), 450)
        self.assertNotIn("G0LEADS", {r["id"] for r in rows})
        calls = [q for name, _, q in self.slack.calls if name == "users.conversations"]
        self.assertEqual(len(calls), 3)
        self.assertEqual(
            (calls[0]["types"], calls[0]["exclude_archived"], calls[0]["limit"]),
            ("public_channel", "true", "200"),
        )
        rows = SlackProvider().member_channels({"bot_token": "xoxb"}, private=True)
        self.assertIn({"id": "G0LEADS", "name": "leads", "private": True}, rows)

    def test_at_most_a_thousand(self):
        for n in range(1200):
            self.slack.names[f"C{n:04d}"] = f"r{n}"
            self.slack.channels[f"C{n:04d}"] = []
            self.slack.members.add(f"C{n:04d}")
        self.assertEqual(
            len(SlackProvider().member_channels({"bot_token": "x"}, private=False)), 1000
        )
```

- [ ] **Step 2: Run it to see it fail**

Run: `$PY manage.py test services.connectors.tests.test_slack_actions --parallel auto --noinput`
Expected: FAIL: no `members` / no `member_channels`.

- [ ] **Step 3: The fake**

`FakeSlackApi.__init__`: `self.members = {"C0SUPPORT", "C0ESCALATE"}` and `self.private = set()`. In `_route`, before the final raise:

```python
if name == "users.conversations":
    wanted = set(query.get("types", "public_channel").split(","))
    ids = sorted(
        c
        for c in self.members
        if ("private_channel" if c in self.private else "public_channel") in wanted
    )
    offset = int(query.get("cursor") or 0)
    size = int(query.get("limit") or 100)
    page = [
        {
            "id": c,
            "name": self.names.get(c, c.lower()),
            "is_private": c in self.private,
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
```

- [ ] **Step 4: The provider**

In `services/connectors/providers/slack.py`, after `find_message`:

```python
    def member_channels(self, creds, *, private):
        """Channels this bot is a member of (round 2 D2 contract R2D2-15,
        R2D2-16): Slack's users.conversations, unarchived, public (and
        private when the token holds groups:read), at most MAX_PAGES pages."""
        types = "public_channel,private_channel" if private else "public_channel"
        out, cursor = [], None
        for _ in range(MAX_PAGES):
            page = self._call(
                creds,
                "users.conversations",
                timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
                types=types,
                exclude_archived="true",
                limit=PAGE,
                cursor=cursor,
            )
            for raw in page.get("channels", []):
                out.append(
                    {
                        "id": str(raw.get("id", "")),
                        "name": str(raw.get("name") or "")[:80],
                        "private": bool(raw.get("is_private")),
                    }
                )
            cursor = (page.get("response_metadata") or {}).get("next_cursor")
            if not cursor:
                break
        return out
```

- [ ] **Step 5: Run it to see it pass**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/providers/slack.py services/connectors/tests/slack_fake.py services/connectors/tests/test_slack_actions.py
git commit -m "feat(connectors): read the channels a Slack bot is in

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The live channel list: cached, searchable, never empty

**Files:**
- Create: `services/agents/outside/slack_channels.py`
- Modify: `services/agents/outside/options.py` (`slack_channels` branch), `services/agents/outside_views.py` (pass `live`)
- Test: `services/agents/tests/test_slack_live_channels.py` (create)

**Interfaces:**
- Consumes: `SlackProvider.member_channels` (Task 8); `slack_replies.channels(step, reader)` (existing).
- Produces (`slack_channels.py`): `CACHE`, `TTL = 300`, `LIMIT = 100`, `NOTE_BUSY`, `NOTE_SCOPE`, `member_channels(connector) -> list` (cached; raises `ProviderError`), `synced_ids(organisation_id) -> set[tuple[str, str]]` (`(team_id, channel)`), `rows(step, reader, *, query) -> (list, bool, str | None)`, `parse(choice) -> (int, str)` (raises `ValueError`), `admin(user) -> bool`. `options.options(..., live=False)`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_slack_live_channels.py`:

```python
"""The live Slack channel list (agent bundles round 2 D2 contract §4.1,
R2D2-15 to R2D2-17). Slack is a fake; the cache is LocMem."""

from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.tests.outside_fixtures import OutsideFixture
from services.agents.tests.test_intake_queries import no_distinct
from services.connectors.tests.slack_fake import use_slack

OPTIONS = "/api/v1/agents/bundles/{}/steps/{}/options/slack_channels/"
#: The live list, warm or cold cache (contract §8), measured.
SLACK_OPTIONS_QUERIES = 9


class LiveChannelTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.api = use_slack(self)
        self.api.names.update({"C0RANDOM": "random", "G0LEADS": "leads"})
        self.api.channels.update({"C0RANDOM": [], "G0LEADS": []})
        self.api.members |= {"C0RANDOM", "G0LEADS"}
        self.api.private.add("G0LEADS")
        self.api.scopes = [*self.api.scopes, "chat:write"]
        self.support = self.slack_connector()
        self.support.granted_scopes = ["channels:read", "groups:read", "chat:write"]
        self.support.save()
        self.ticket, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.ticket, self.support))
        )
        self.step = self.bundle.steps.get()

    def get(self, user, **query):
        return self.client_for(user).get(OPTIONS.format(self.bundle.pk, self.step.pk), query)

    def test_without_live_the_answer_is_todays(self):
        self.assertEqual(
            self.get(self.csm).json(),
            {
                "options": [
                    {"id": str(self.support.pk), "name": "#support", "detail": "This thread"}
                ],
                "more": False,
            },
        )

    def test_live_adds_member_channels_nobody_syncs(self):
        body = self.get(self.csm, live="1").json()
        pk = self.support.pk
        self.assertEqual(
            body,
            {
                "options": [
                    {"id": str(pk), "name": "#support", "detail": "This thread"},
                    {"id": f"{pk}:C0ESCALATE", "name": "#escalations", "detail": "Not synced"},
                    {"id": f"{pk}:C0RANDOM", "name": "#random", "detail": "Not synced"},
                ],
                "more": False,
                "note": None,
            },
        )

    def test_private_unsynced_channels_are_for_admins_only(self):
        ids = [o["id"] for o in self.get(self.admin, live="1").json()["options"]]
        self.assertIn(f"{self.support.pk}:G0LEADS", ids)
        rows = self.get(self.admin, live="1").json()["options"]
        self.assertIn(
            {"id": f"{self.support.pk}:G0LEADS", "name": "#leads", "detail": "Not synced, private"},
            rows,
        )

    def test_no_groups_read_means_public_only(self):
        self.support.granted_scopes = ["channels:read", "chat:write"]
        self.support.save()
        self.get(self.admin, live="1")
        [query] = [q for name, _, q in self.api.calls if name == "users.conversations"]
        self.assertEqual(query["types"], "public_channel")

    def test_query_filters_and_caps(self):
        body = self.get(self.csm, live="1", query="ESC").json()
        self.assertEqual([o["name"] for o in body["options"]], ["#escalations"])
        for n in range(150):
            self.api.names[f"C{n:04d}"] = f"room-{n:03d}"
            self.api.channels[f"C{n:04d}"] = []
            self.api.members.add(f"C{n:04d}")
        cache.clear()
        body = self.get(self.csm, live="1", query="room").json()
        self.assertEqual((len(body["options"]), body["more"]), (100, True))

    def test_the_list_is_cached_for_five_minutes(self):
        self.get(self.csm, live="1")
        self.get(self.csm, live="1")
        self.assertEqual(len([n for n, _, _ in self.api.calls if n == "users.conversations"]), 1)

    def test_a_failed_live_read_keeps_the_synced_rows(self):
        self.api.refuse_next("users.conversations", "ratelimited")
        body = self.get(self.csm, live="1").json()
        self.assertEqual([o["name"] for o in body["options"]], ["#support"])
        self.assertEqual(
            body["note"], "Slack didn't list its other channels. Try again in a minute."
        )
        cache.clear()
        self.api.refuse_next("users.conversations", "missing_scope")
        self.assertEqual(
            self.get(self.csm, live="1").json()["note"],
            "Add channels:read to the Slack app to choose other channels.",
        )

    def test_a_synced_channel_the_reader_cannot_read_never_appears(self):
        self.slack_connector(department="engineering", channel="C0RANDOM", name="random")
        names = [o["name"] for o in self.get(self.csm, live="1").json()["options"]]
        self.assertNotIn("#random", names)

    def test_queries_do_not_grow_with_channels(self):
        client = self.client_for(self.csm)
        url = OPTIONS.format(self.bundle.pk, self.step.pk)
        client.get(url, {"live": "1"})
        with CaptureQueriesContext(connection) as queries:
            client.get(url, {"live": "1"})
        no_distinct(self, queries)
        self.assertEqual(len(queries), SLACK_OPTIONS_QUERIES)
        cache.clear()
        with CaptureQueriesContext(connection) as cold:
            client.get(url, {"live": "1"})
        self.assertEqual(len(cold), SLACK_OPTIONS_QUERIES)
```

Note: `outside_fixtures.use_fakes` replaces the facade's `SlackTool`, not the provider: the list calls `SlackProvider` directly, so `use_slack` serves it.

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_slack_live_channels --parallel auto --noinput`
Expected: FAIL: `live` ignored, no `note`.

- [ ] **Step 3: `slack_channels.py`**

Create `services/agents/outside/slack_channels.py`:

```python
"""The live Slack channel list for a Slack step (agent bundles round 2 D2
contract §4.1, R2D2-15 to R2D2-18): the channels a usable connector's bot
is a member of that no Slack connector in the workspace syncs, read through
one connector per Slack workspace, cached five minutes (names only, never
message text). Private ones are admins' alone."""

from django.core.cache import cache

from services.accounts.capabilities import Capability
from services.connectors.models import Connector
from services.connectors.providers.base import ProviderError

from . import gates

CACHE = "agents:slack-channels:{}"
TTL = 300
LIMIT = 100
NOTE_BUSY = "Slack didn't list its other channels. Try again in a minute."
NOTE_SCOPE = "Add channels:read to the Slack app to choose other channels."
NOT_SYNCED = "Not synced"
NOT_SYNCED_PRIVATE = "Not synced, private"


def admin(user):
    return user.has_capability(Capability.MANAGE_INTEGRATIONS)


def member_channels(connector):
    """[{id, name, private}] for `connector`'s bot, cached. Raises ProviderError."""
    from services.connectors.providers.slack import SlackProvider

    key = CACHE.format(connector.pk)
    rows = cache.get(key)
    if rows is None:
        private = "groups:read" in (connector.granted_scopes or [])
        rows = SlackProvider().member_channels(connector.get_credentials(), private=private)
        cache.set(key, rows, TTL)
    return rows


def synced_ids(organisation_id):
    """(team, channel) of every Slack connector in the workspace, enabled or
    not: a synced channel is its connector's department's (R2D2-15)."""
    return {
        (str((c or {}).get("team_id", "")), str((c or {}).get("channel", "")))
        for c in Connector.objects.filter(
            organisation_id=organisation_id, provider=Connector.Provider.SLACK
        ).values_list("config", flat=True)
    }


def _teams(usable, source):
    """One connector per Slack workspace: the source's first, else the lowest id."""
    chosen = {}
    for c in sorted(usable, key=lambda c: (c.pk != source, c.pk)):
        chosen.setdefault((c.config or {}).get("team_id", ""), c)
    return list(chosen.values())


def parse(choice):
    """ "6" -> (6, ""); "6:C0ESC" -> (6, "C0ESC"). Raises ValueError."""
    if not isinstance(choice, str):
        raise ValueError(choice)
    pk, _, channel = choice.partition(":")
    if not pk.isdigit() or (channel and not channel.isalnum()):
        raise ValueError(choice)
    return int(pk), channel.upper()


def rows(step, reader, *, query):
    """(options, more, note) for `reader` (contract §4.1)."""
    from ..actions.slack_replies import channels

    usable = channels(step, reader)
    source = (step.payload or {}).get("source_connector_id")
    needle = query.strip().casefold()
    synced = [
        {
            "id": str(c.pk),
            "name": gates.channel_name(c),
            "detail": "This thread" if c.pk == source else "A new message",
        }
        for c in usable
    ]
    found = [r for r in synced if needle in r["name"].casefold()]
    taken = synced_ids(step.organisation_id)
    live, note, may_private = [], None, admin(reader)
    for connector in _teams(usable, source):
        team = str((connector.config or {}).get("team_id", ""))
        try:
            members = member_channels(connector)
        except ProviderError as exc:
            note = NOTE_SCOPE if exc.code == "missing_scope" else NOTE_BUSY
            continue
        for ch in members:
            # SOC2:AUTH-02 a private channel Revenact doesn't read is an admin's choice (R2D2-15)
            if (team, ch["id"]) in taken or (ch["private"] and not may_private):
                continue
            name = f"#{ch['name']}"
            if needle in name.casefold():
                live.append(
                    {
                        "id": f"{connector.pk}:{ch['id']}",
                        "name": name,
                        "detail": NOT_SYNCED_PRIVATE if ch["private"] else NOT_SYNCED,
                    }
                )
    live.sort(key=lambda r: r["name"].casefold())
    every = found + live
    return every[:LIMIT], len(every) > LIMIT, note
```

- [ ] **Step 4: The route**

`options.options(step, reader, name, *, project="", query="", live=False)`; its `slack_channels` branch:

```python
    if name == "slack_channels":
        from ..actions.slack_replies import channels

        if live:
            from . import slack_channels

            found, more, note = slack_channels.rows(step, reader, query=query)
            return {"options": found, "more": more, "note": note}
        source = payload.get("source_connector_id")
        rows = [
            {
                "id": str(c.pk),
                "name": gates.channel_name(c),
                "detail": "This thread" if c.pk == source else "A new message",
            }
            for c in channels(step, reader)
        ]
        return {"options": rows, "more": False}
```

`outside_views.StepOptionsView.get` passes `live=request.query_params.get("live") == "1"`.

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_slack_live_channels services.agents.tests.test_step_options --parallel auto --noinput`
Expected: OK. Pin `SLACK_OPTIONS_QUERIES` to the printed count if it differs, as long as the warm and cold counts are equal; record it.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside/slack_channels.py services/agents/outside/options.py services/agents/outside_views.py services/agents/tests/test_slack_live_channels.py
git commit -m "feat(agents): a live, searchable list of the Slack channels the bot is in

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: A Slack step can move to an unsynced channel

**Files:**
- Modify: `services/agents/actions/slack_replies.py` (`validate`, `preview`, `_in_thread`, `edit`, `REPLY.editable`), `services/agents/outside/gates.py` (Slack private rule)
- Test: `services/agents/tests/test_slack_reply_kind.py` (append)

**Interfaces:**
- Consumes: `slack_channels.parse`, `member_channels`, `synced_ids`, `admin` (Task 9).
- Produces: editable `channel_choice` (contract §4.2), payload keys `channel_choice`, `unsynced`, `channel_private`; `preview.slack.synced`; the private gate (contract §4.3).

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_slack_reply_kind.py` (its class builds `self.support`, a thread and a bundle; add `use_slack` and `cache.clear()` in a new class so the real list is read):

```python
class UnsyncedChannelTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        from django.core.cache import cache

        from services.connectors.tests.slack_fake import use_slack

        cache.clear()
        self.api = use_slack(self)
        self.api.names.update({"G0LEADS": "leads"})
        self.api.channels.update({"G0LEADS": []})
        self.api.members.add("G0LEADS")
        self.api.private.add("G0LEADS")
        self.support = self.slack_connector()
        self.support.granted_scopes = ["channels:read", "groups:read", "chat:write"]
        self.support.save()
        self.ticket, self.thread = self.slack_thread(self.pizza, self.support)
        self.bundle = self.outside_bundle(
            self.thread, ("slack.reply", self.slack_payload(self.ticket, self.support))
        )
        self.step = self.bundle.steps.get()

    def save(self, user, choice):
        return self.client_for(user).patch(
            f"/api/v1/agents/bundles/{self.bundle.pk}/steps/{self.step.pk}/",
            {"fields": {"channel_choice": choice}},
            format="json",
        )

    def test_moving_to_an_unsynced_channel_posts_a_new_message_there(self):
        answer = self.save(self.csm, f"{self.support.pk}:C0ESCALATE")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.step.refresh_from_db()
        self.assertEqual(
            {
                k: self.step.payload[k]
                for k in (
                    "connector_id",
                    "channel",
                    "channel_name",
                    "unsynced",
                    "channel_private",
                    "channel_choice",
                )
            },
            {
                "connector_id": self.support.pk,
                "channel": "C0ESCALATE",
                "channel_name": "escalations",
                "unsynced": True,
                "channel_private": False,
                "channel_choice": f"{self.support.pk}:C0ESCALATE",
            },
        )
        step = (
            self.client_for(self.csm)
            .get(f"/api/v1/agents/bundles/{self.bundle.pk}/")
            .json()["steps"][0]
        )
        self.assertEqual(
            (step["preview"]["slack"]["in_thread"], step["preview"]["slack"]["synced"]),
            (False, False),
        )
        self.run_all_steps(self.csm, self.bundle)
        [post] = self.slack.posts
        self.assertEqual((post["channel"], post["thread_ts"]), ("C0ESCALATE", ""))

    def test_refusals(self):
        pk = self.support.pk
        self.assertEqual(
            self.save(self.csm, "nonsense").json(),
            {
                "steps": {
                    str(self.step.pk): {"channel_choice": ["Choose a Slack channel from the list."]}
                }
            },
        )
        self.assertEqual(
            self.save(self.csm, f"{pk}:C0NOPE").json()["steps"][str(self.step.pk)][
                "channel_choice"
            ],
            ["Choose a channel the Revenact app is in."],
        )
        self.assertEqual(
            self.save(self.csm, f"{pk}:G0LEADS").json()["steps"][str(self.step.pk)][
                "channel_choice"
            ],
            ["Only an admin can choose a private channel Revenact doesn't read."],
        )
        self.assertEqual(self.save(self.admin, f"{pk}:G0LEADS").status_code, 200)

    def test_a_private_unsynced_step_is_blocked_for_a_non_admin(self):
        self.save(self.admin, f"{self.support.pk}:G0LEADS")
        step = (
            self.client_for(self.csm)
            .get(f"/api/v1/agents/bundles/{self.bundle.pk}/")
            .json()["steps"][0]
        )
        self.assertEqual(
            step["disabled_reason"],
            "Only an admin can post in #leads, a private channel Revenact doesn't read.",
        )

    def test_the_old_panel_still_moves_by_connector_id(self):
        answer = self.client_for(self.csm).patch(
            f"/api/v1/agents/bundles/{self.bundle.pk}/steps/{self.step.pk}/",
            {"fields": {"connector_id": self.support.pk}},
            format="json",
        )
        self.assertEqual(answer.status_code, 200)
```

(The step `PATCH` route and the `FakeSlack.posts` field names: check `grep -n "steps/<int:step_pk>/" services/agents/urls.py` and `grep -n "self.posts" services/agents/tests/outside_fakes.py`; use the names found.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_slack_reply_kind --parallel auto --noinput`
Expected: FAIL: `channel_choice` is not editable ("You can't change this.").

- [ ] **Step 3: The kind**

In `slack_replies.py`:

```python
FROM_LIST = "Choose a Slack channel from the list."
NOT_A_MEMBER = "Choose a channel the Revenact app is in."
PRIVATE_ADMIN = "Only an admin can choose a private channel Revenact doesn't read."
CANT_CHECK = "Couldn't check Slack's channels. Try again."
```

`validate` adds `"channel_choice": str(ticket["connector_id"])` to the stored payload.

```python
def _in_thread(payload):
    # R2D2-18: an unsynced channel is always a new top-level message.
    return payload.get("connector_id") == payload.get("source_connector_id") and not payload.get(
        "unsynced"
    )
```

`preview` adds `"synced": not payload.get("unsynced")`.

`edit` gains, before the text block:

```python
    if "channel_choice" in fields:
        try:
            clean.update(_choose(action, fields["channel_choice"], runner))
        except FieldErrors as exc:
            errors.update(exc.errors)
```

and the `connector_id` block, when it succeeds, also sets `"channel_choice": str(chosen.pk), "unsynced": False, "channel_private": False`. Add:

```python
def _choose(action, choice, runner):
    """The payload for an option id (contract §4.2). Raises FieldErrors."""
    from ..outside import slack_channels

    def refuse(sentence):
        return FieldErrors({"channel_choice": [sentence]})

    try:
        pk, channel = slack_channels.parse(choice)
    except ValueError:
        raise refuse(FROM_LIST) from None
    chosen = next((c for c in channels(action, runner) if c.pk == pk), None)
    if chosen is None:
        raise refuse(NOT_A_CHANNEL)
    config = chosen.config or {}
    if not channel:
        return {
            "connector_id": chosen.pk,
            "channel": config.get("channel", ""),
            "channel_name": config.get("channel_name", ""),
            "channel_choice": str(chosen.pk),
            "unsynced": False,
            "channel_private": False,
        }
    try:
        members = slack_channels.member_channels(chosen)
    except ProviderError:
        raise refuse(CANT_CHECK) from None
    found = next((m for m in members if m["id"] == channel), None)
    team = str(config.get("team_id", ""))
    if found is None or (team, channel) in slack_channels.synced_ids(action.organisation_id):
        raise refuse(NOT_A_MEMBER)
    # SOC2:AUTH-02 a private channel Revenact doesn't read is an admin's choice (R2D2-15)
    if found["private"] and not slack_channels.admin(runner):
        raise refuse(PRIVATE_ADMIN)
    return {
        "connector_id": chosen.pk,
        "channel": channel,
        "channel_name": found["name"],
        "channel_choice": f"{chosen.pk}:{channel}",
        "unsynced": True,
        "channel_private": found["private"],
    }
```

(`from services.connectors.providers.base import ProviderError`.) `REPLY.editable` becomes `("connector_id", "channel_choice", "text")`.

In `gates.blocked`, the Slack read rule becomes:

```python
    if slack and not may_read(reader, connector):
        return Blocked(f"You can't post in {channel_name(connector)}.")
    payload = step.payload if isinstance(step.payload, dict) else {}
    if slack and payload.get("unsynced") and payload.get("channel_private"):
        # SOC2:AUTH-02 only an admin posts in a private channel Revenact doesn't read
        if not reader.has_capability(Capability.MANAGE_INTEGRATIONS):
            name = f"#{payload.get('channel_name')}" if payload.get("channel_name") else "the channel"
            return Blocked(
                f"Only an admin can post in {name}, a private channel Revenact doesn't read.",
                link=None,
            )
```

(`Blocked.link` is typed `str`; make it `str | None = LINK`. A step blocked with `link=None` keeps Reject open the same way a rights block does: check `_rights` in `bundle_payloads.step_payload` and confirm the test above still sees Reject for Carl; if `_rights` needs the link, keep `link=LINK` and record the choice in "Changes during the build".)

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: OK. Existing tests comparing a whole `slack.reply` `editable` list or payload see `channel_choice`: update those expectations only.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/actions/slack_replies.py services/agents/outside/gates.py services/agents/tests/test_slack_reply_kind.py
git add $(git diff --name-only -- services/agents/tests)
git commit -m "feat(agents): a Slack step can move to a channel Revenact doesn't sync

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Query ceilings with a linked reader

**Files:**
- Modify: `services/agents/tests/test_outside_queries.py`
- Test: the same

**Interfaces:**
- Produces: `OUTSIDE_DETAIL_QUERIES`, `OUTSIDE_HISTORY_QUERIES` measured for a reader with a Jira link (contract R2D2-21).

- [ ] **Step 1: A linked reader**

In `OutsideQueryTests.setUp` add `self.link_for(self.csm)` (the measured reader). The page now reads Carl's link once (`Bulk.jira_link`).

- [ ] **Step 2: Run them**

Run: `$PY manage.py test services.agents.tests.test_outside_queries --parallel auto --noinput`
Expected: either PASS, or a failure printing the new count. Re-pin only when it is at most one more than before (`OUTSIDE_DETAIL_QUERIES = 9`, `OUTSIDE_HISTORY_QUERIES = 8` at most) and equal at 5 and 10 steps / 1 and 4 bundles. A count growing with rows is a bug: every link read goes through `seats.link_of`, which uses the page.

- [ ] **Step 3: Record and commit**

Add to the contract's "Changes during the build": "Measured ceilings (Task 11): `OUTSIDE_DETAIL_QUERIES = <n>`, `OUTSIDE_HISTORY_QUERIES = <n>` (a linked reader), `OPTIONS_QUERIES = <n>`, `SLACK_OPTIONS_QUERIES = <n>`, `JIRA_LINK_QUERIES = <n>`. No query uses DISTINCT."

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/tests/test_outside_queries.py docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-api.md
git commit -m "test(agents): measure outside ceilings for a reader with a Jira link

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The end-to-end journey

**Files:**
- Create: `e2e/test_agent_round2_act_flow.py`

**Interfaces:**
- Consumes: everything above, over real HTTP.

- [ ] **Step 1: Write the journey**

Create `e2e/test_agent_round2_act_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB; Atlassian, Jira
and Slack are fakes (their APIs in memory), the model is a fake. Nothing
leaves the process.

Journey (round 2 D2): Alice connects Jira and Slack and lets agents act in
both. Carl links his Atlassian account (the OAuth round trip in his
browser), sees "as you" on a Jira step, and runs it: the issue is created
with his Bearer token through api.atlassian.com. He moves the Slack step to
#escalations, which no connector syncs, from the live list; it posts there
as a new message. Atlassian then refuses his refresh token: his next Jira
step is blocked with the lost-link sentence, never run as the bot. He
unlinks, and the same step runs as Jira Bot."""

import json
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlsplit

from django.core.cache import cache
from django.test import LiveServerTestCase, override_settings

from core.models import AuditEvent
from e2e.http import http_delete, http_get, http_patch, http_post
from services.accounts.models import User
from services.agents.models import AgentBundle, SignalThread
from services.billing.models import BillingAccount
from services.connectors.models import JiraLink
from services.connectors.tests.atlassian_fake import use_atlassian
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import FakeSlackApi, use_slack


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


@override_settings(
    ATLASSIAN_OAUTH_CLIENT_ID="cid",
    ATLASSIAN_OAUTH_CLIENT_SECRET="secret",
    FRONTEND_URL="https://app.test",
)
class AgentActAsPersonFlowTests(LiveServerTestCase):
    def setUp(self):
        cache.clear()
        self.slack = use_slack(
            self,
            FakeSlackApi(scopes=("channels:read", "groups:read", "channels:history", "chat:write")),
        )
        self.jira = use_jira(self)
        self.atlassian = use_atlassian(self)

    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def start_link(self, token):
        request = urllib.request.Request(
            self.api("/connectors/jira-link/"),
            data=b"{}",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            body = json.loads(response.read())
            cookie = response.headers["Set-Cookie"].split(";", 1)[0]
        state = parse_qs(urlsplit(body["authorize_url"]).query)["state"][0]
        return state, cookie

    def landing(self, url, cookie):
        opener = urllib.request.build_opener(_NoRedirect)
        opener.addheaders.append(("Cookie", cookie))
        try:
            opener.open(url)
        except urllib.error.HTTPError as redirect:
            self.assertEqual(redirect.code, 302)
            return {
                k: v[0] for k, v in parse_qs(urlsplit(redirect.headers["Location"]).query).items()
            }
        self.fail("the callback did not redirect")

    def test_carl_acts_as_himself_then_his_lost_link_blocks(self):
        # Workspace, connectors and a waiting bundle: build them exactly as
        # e2e/test_agent_round2_flow.py's `workspace()` and its Slack/Jira
        # connect calls do (copy those helpers), then let agents act in both:
        #   http_post(self.api(f"/connectors/{jira['id']}/agents/"), {"can_act": True}, token=alice)
        #   http_post(self.api(f"/connectors/{slack['id']}/agents/"), {"can_act": True}, token=alice)
        # and make the bundle with a slack.reply and a jira.create step through
        # run_agent_signals with a patched get_completion, as that file does.
        alice, carl_user, bundle = self.world()
        carl = self.login("carl@acme.io")

        state, cookie = self.start_link(carl)
        landed = self.landing(
            self.api(f"/connectors/jira-link/callback/?code=good-code&state={state}"), cookie
        )
        self.assertEqual(landed, {"jira_link": "linked"})
        status, body = http_get(self.api("/connectors/jira-link/"), carl)
        self.assertEqual(body["link"]["name"], "Carl Lee")

        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl)
        reply, create = detail["steps"]
        self.assertEqual(
            (create["preview"]["jira"]["as"], create["preview"]["jira"]["as_you"]),
            ("Carl Lee", True),
        )

        status, body = http_get(
            self.api(
                f"/agents/bundles/{bundle.pk}/steps/{reply['id']}/options/slack_channels/?live=1&query=esc"
            ),
            carl,
        )
        [escalations] = body["options"]
        self.assertEqual(escalations["detail"], "Not synced")
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"),
            {
                "steps": [
                    {
                        "id": reply["id"],
                        "selected": True,
                        "fields": {"channel_choice": escalations["id"]},
                    },
                    {"id": create["id"], "selected": True},
                ]
            },
            token=carl,
        )
        self.assertEqual(status, 200, body)
        self.assertEqual([s["status"] for s in body["bundle"]["steps"]], ["applied", "applied"])
        self.assertEqual(self.slack.posts("C0ESCALATE")[0].get("thread_ts"), None)
        self.assertIn("Bearer at-1", self.jira.callers)
        self.assertTrue(
            any(u.startswith("https://api.atlassian.com/ex/jira/") for u in self.jira.urls)
        )
        self.assertEqual(
            set(
                AuditEvent.objects.filter(
                    action="agent_outside.call", metadata__tool="jira"
                ).values_list("metadata__as", flat=True)
            ),
            {"person"},
        )

        # Atlassian refuses the refresh: the next Jira step is blocked, never the bot's.
        link = JiraLink.objects.get()
        creds = link.get_credentials()
        link.set_credentials({**creds, "expires_at": time.time() - 1})
        link.save()
        self.atlassian.refuse_refresh()
        second = self.another_jira_bundle(carl_user)
        status, body = http_post(
            self.api(f"/agents/bundles/{second.pk}/run/"),
            {"steps": [{"id": second.steps.get().pk, "selected": True}]},
            token=carl,
        )
        self.assertEqual(
            body["bundle"]["steps"][0]["error"],
            "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot.",
        )
        self.assertEqual(JiraLink.objects.get().status, "lost")
        self.assertTrue(AuditEvent.objects.filter(action="jira.link_lost").exists())

        # Unlinked, the retry acts as the connection.
        self.assertEqual(http_delete(self.api("/connectors/jira-link/"), carl)[0], 204)
        status, body = http_post(
            self.api(f"/agents/bundles/{second.pk}/steps/{second.steps.get().pk}/retry/"),
            {},
            token=carl,
        )
        self.assertEqual(body["bundle"]["steps"][0]["status"], "applied")
        self.assertEqual(self.jira.callers[-1], "basic")
```

Write `world()` and `another_jira_bundle(user)` in the class by copying the workspace, connector and intake steps of `e2e/test_agent_round2_flow.py` (`workspace()`, the two `/connectors/` posts and connects, the `run_agent_signals` call with a patched `get_completion` answering a `slack.reply` and a `jira.create`); `another_jira_bundle` builds a second Slack thread and a bundle with one `jira.create` the same way. Note: a step is blocked at the panel when the link is already `lost`; here it is still `linked` when Run is pressed, so the step itself discovers the refusal while refreshing (contract §3.6, first row) and fails with the same sentence.

- [ ] **Step 2: Run it**

Run: `$PY manage.py test e2e.test_agent_round2_act_flow e2e.test_agent_round2_flow e2e.test_agent_outside_flow --parallel auto --noinput`
Expected: OK. A failure shows a real gap in Tasks 1 to 11: fix it there (test first), not in the journey.

- [ ] **Step 3: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add e2e/test_agent_round2_act_flow.py
git commit -m "test(e2e): round 2 D2 journey: act as yourself in Jira, post to an unsynced channel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: SOC 2, the docs, the full suite and the hand-off

**Files:**
- Modify: `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`, `.soc2/CONTROL_MAP.md`, `.agents/workflows/agent-outside-flow.md`, `docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-api.md` ("Changes during the build")

- [ ] **Step 1: `API_CONTRACTS.md`** (the `api-contracts` skill): in the `connectors` section, the four `jira-link` routes (contract §2, every answer and sentence); in the `agents` section, the Jira previews' `as_you` / `link` (§3.4), the run's `acted_as` / `jira_account`, the new step errors (§3.6), the options route's `live=1`, `note`, the unsynced rows (§4.1), `channel_choice` and its refusals (§4.2), the private Slack gate (§4.3), N1 (§5), the measured ceilings.

- [ ] **Step 2: Audit, SOC 2, product docs, flow doc**

- `docs/audit-events.md`: `jira.link`, `jira.unlink`, `jira.link_lost`, `jira.link_refused` (with each `reason`); `agent_outside.call` `metadata.as`.
- `.soc2/CONTROL_MAP.md`: DATA-02 (`JiraLink.credentials`), AUTH-01 (the link's browser binding), AUTH-02 (own link only; private unsynced Slack channels for admins; the lost-link gate), LOG-01 (the four events), API-08 unchanged.
- `docs/product/01-prd.md`: "Link your Jira account" and what a person sees; the live Slack list and its admin rule; round 2 D2 done. `02-trd.md`: `jira_links.py` (seat, refresh under lock, warm), `seats.py`, `slack_channels.py`, the cache. `05-backend-schema.md`: `connectors.0005_jira_link`. `06-implementation-plan.md`: R2-D2 done, R2-D3 next.
- `.agents/workflows/agent-outside-flow.md` (`flow-docs` skill): who a Jira step acts as (the seat, its fallback, the lost-link block), when a token is refreshed (before the run; inline only past 15 minutes), and the Slack list (members, cache, private rule, `channel_choice`).
- `.env.example` (done in Task 2: check it is there).

- [ ] **Step 3: The full gate**

```bash
$PY manage.py test --parallel auto --noinput
$PY manage.py makemigrations --check --dry-run
$PY manage.py spectacular --file /tmp/r2d2-schema.yml --validate
venv/bin/ruff check . && venv/bin/ruff format --check .
```

Expected: every test OK (write the count into the hand-off), "No changes detected", the schema written without errors, ruff clean.

- [ ] **Step 4: Commit and push**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md .soc2/CONTROL_MAP.md .agents/workflows/agent-outside-flow.md docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-api.md
git commit -m "docs: round 2 delivery 2 in the contracts, audit events, SOC 2 map and product docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/agent-bundles-r2d2
```

Hand-off (to the controller, not a PR): the head, the suite count, the migration (`connectors.0005`), the measured ceilings, every "Changes during the build" entry, and the owner set-up and live checks (spec §13.8).

---

## Self-review

1. **Contract coverage.** R2D2-1 Global Constraints; R2D2-2 Tasks 5, 6 (seat fallback; the switch test); R2D2-3 Tasks 2 (constraint), 4 (`taken`); R2D2-4 Tasks 2 (`site_for`), 4 (`no_site`); R2D2-5 Tasks 3, 5, 7; R2D2-6 Task 2 (`SCOPES`, authorize URL test); R2D2-7 Task 2 (encryption test); R2D2-8 Tasks 2 (`fresh_token`, `warm`), 6 (`warm` in the runs); R2D2-9 Tasks 2 (`lose`), 5 (`for_step`), 6 (gate), 12; R2D2-10 Task 6 (previews, `acted_as`); R2D2-11 Task 4 (own link only), Task 6 (the runner, not the routed person: `for_step(connector, actor)`); R2D2-12 Task 4 (delete), the model's CASCADE; R2D2-13 Task 4; R2D2-14 Tasks 2, 4, 5, 6; R2D2-15 to R2D2-17 Tasks 8, 9; R2D2-18 Task 10; R2D2-19 Task 1; R2D2-20 frontend only; R2D2-21 Tasks 4, 7, 9, 11; R2D2-22 unchanged code paths (the Slack text still passes `edit`'s out-check). Contract §2 Task 4; §3 Tasks 5 to 7; §4 Tasks 8 to 10; §5 Task 1; §6 Tasks 2, 4, 5; §8 Task 11.
2. **Placeholders.** Code steps hold their code. Notes that ask the implementer to look up an existing helper's real name (`create_user`'s arguments, the step `PATCH` route, `FakeSlack`'s post fields, `StepFailed`'s signature, the e2e world helpers to copy from `e2e/test_agent_round2_flow.py`) each name the `grep` or the file to copy from.
3. **Type consistency.** `Seat(config, creds, person, name, link_id)` (Task 2) is what `JiraTool._seat` (Task 5), `seats.acted` (Task 5) and `FakeJira.seats` read. `jira_links.seat_for(connector, link)` (Task 2) is called by `seats.for_step` (Task 5) and `options.options` (Task 7) with `seats.link_of(user)`. `preview_for(connector, link) -> {as, as_you, link}` (Task 2) is what `_as` merges (Task 6). `slack_channels.parse` / `member_channels` / `synced_ids` / `admin` (Task 9) are what `slack_replies._choose` uses (Task 10). `trail.call(..., as_=)` (Task 5) is what Task 6 passes.

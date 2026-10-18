# Agent bundles, round 2 delivery 1 (backend): finish the four tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Gmail, Outlook, Jira and Slack as agent tools: a new `jira.comment` step (internal, found again by its ref on Retry); Outlook replies threaded through Graph's reply and signed with a signature the person writes in Revenact; the Gmail signature kept whole in edited drafts and added to sends that skip a draft; and every D3 leftover (the pick lists' 404, an unreadable refusal body, the assign lookup's outcome, `needs: "reconnect"`, a demoted admin's OAuth refusal audited, a found reply's `threaded`, the `API_CONTRACTS.md` comment).

**Architecture:** No new app. The new kind lives in `services/agents/actions/jira_comments.py` like its siblings and talks to Jira only through the outside facade (`services/agents/outside/tools.py` gains `JiraTool.comment` / `find_comment`), which calls two new `JiraProvider` methods. Outlook threading is inside `MicrosoftProvider.send` (a Message-ID lookup, then Graph's `reply`, falling back to `sendMail`), switched on by `sync.send_via_provider`. Signatures have one home, `services/mail/signing.py`, used by the agent reply, every send that skips a draft, and the mailbox's new `PATCH`. The Gmail draft fix is one function in `services/mail/html.py` called from `drafts.clean`.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15), stdlib `urllib` for every vendor call (no SDKs). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (round 2 addendum). **Binding contract:** `docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-api.md` (this repo). Read its "Decisions narrowing the spec" (R2D1-1 to R2D1-20) before any task; every decision is a requirement here. The D1, D2 and D3 contracts and their as-built record in `docs/API_CONTRACTS.md` still hold where R2-D1 does not change them.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/round2-be` on branch `feat/agent-bundles-r2d1` (cut from main 558c287: D1 #114, D2 #115, D3 #116 merged). Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them).
- Python: make the venv link once, `ln -s ../gmail-be/venv venv` (the `venv/` ignore rule does not match a symlink: never `git add` it). Written `PY` below: `PY=venv/bin/python`. Ruff: `venv/bin/ruff`.
- `.env` points at the shared dev database `revenact`: **never migrate it, never write to it.** Tests use their own test database; read-only shell queries are fine.
- Run tests as `$PY manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially.
- Lint before each commit: `venv/bin/ruff check . && venv/bin/ruff format --check .` (`ruff format` also formats Python blocks inside Markdown; run `venv/bin/ruff format .` if the check fails, including on the docs).
- Every commit message is a conventional commit (`commit-messages` skill) and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths (`git add <paths>`, `git rm` for deletions); never `git add -A` or `git add .`. Never `git stash` (shared across worktrees).
- **CI is blocked by GitHub billing:** local checks are the gate. A task is done only when its tests pass locally; the last task runs the full suite (`--parallel auto`), `makemigrations --check`, `manage.py spectacular` and ruff.
- **Nothing real is ever sent.** Outside steps go through `services/agents/tests/outside_fakes.py` (`OutsideFixture` installs them); real tool classes are tested with their transport patched (`FakeJiraApi` via `use_jira`, `FakeGraph` via `use_graph`, `FakeGmail` via `use_gmail`). No test opens a socket to Google, Microsoft, Slack or Atlassian; none calls a model (`get_completion` is always patched).
- **Postgres 16:** no visibility rule may be a join made unique with `DISTINCT`; use `id IN (subquery)`. Query counts are pinned in tests (Task 13).
- Every visibility filter and gate carries `# SOC2:AUTH-02 ...`; every audited write `# SOC2:LOG-01`; the idempotency key `# SOC2:API-08`. Tokens stay in `Connector.credentials` / `MailboxConnection.credentials` (Fernet): no new secret store.
- **Twice-filter (spec §4.4, §13.4):** `jira.comment`'s body passes the outside out-check (`internal_mentions`, D3-19); the model sees nothing new.
- **Outside steps are always Ask** (D1 D21); the nightly pass never proposes `jira.comment` (R2D1-2).
- User-facing sentences are exactly the contract's. No em dash in any sentence a person reads.
- No new dependency. One migration: `metrics.0018_agent_action_jira_comment`.
- **Scope ruling (R2D1-1):** no code path for Zendesk, Freshdesk, the webhook or any other connector's tools.
- **Product documents rule:** `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `.soc2/CONTROL_MAP.md` and the flow doc `.agents/workflows/agent-outside-flow.md` are updated in this PR (Task 15).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/connectors/providers/base.py`, `services/mail/providers/base.py` | modify | an unreadable refusal body is still a refusal (R2D1-8) |
| `services/agents/outside/sentences.py`, `tools.py` | modify | `list_failure` (R2D1-7); `Comment`, `JiraTool.comment`, `JiraTool.find_comment`, the comment sentence |
| `services/agents/actions/jira_issues.py` | modify | the assign lookup's `elsewhere` (R2D1-9) |
| `services/connectors/agent_access.py` | modify | `needs: "reconnect"` (R2D1-10); `jira.comment` in Jira's kinds; `ADD_COMMENTS` read (R2D1-5) |
| `services/connectors/views.py` | modify | the demoted admin's refusal audited (R2D1-11) |
| `services/connectors/providers/jira.py` | modify | `COMMENT_PROPERTY`, `comment_url`, `add_comment`, `find_comment` |
| `services/metrics/models.py`, `migrations/0018_agent_action_jira_comment.py` | modify/create | the kind's choice |
| `services/agents/actions/jira_comments.py` | create | `jira.comment` (contract §2, §3) |
| `services/agents/registry.py`, `placeholders.py`, `bulk.py`, `bundle_payloads.py`, `outside/gates.py`, `outside/offered.py`, `prompt.py` | modify | register, chips, the page's connector read, the link, the gate, the offer, the prompt |
| `services/mail/agent_send.py`, `services/mail/providers/microsoft.py`, `services/mail/providers/google.py`, `services/mail/providers/base.py` (`Message.threaded`), `services/mail/sync.py` | modify | a found reply's thread (R2D1-12); Outlook's reply (R2D1-13, R2D1-14) |
| `services/mail/signing.py` | create | `text`, `signed`, `stored`, the limits (R2D1-15, R2D1-17) |
| `services/mail/views.py`, `serializers.py` | modify | `PATCH /mail/connection/`, `connection.signature` |
| `services/mail/html.py`, `services/mail/drafts.py` | modify | `restore_signature` (R2D1-16) |
| `services/agents/actions/mail_replies.py` | modify | Outlook's `threaded` preview; the lookup gets its source |
| tests | create/modify | listed per task |
| `e2e/test_agent_round2_flow.py` | create | the journey |
| docs | modify | Task 15 |

## Shared test fixtures (existing, extended here)

- `services/connectors/tests/jira_fake.py` `FakeJiraApi` (Task 4 adds the comment routes and `ADD_COMMENTS`).
- `services/agents/tests/outside_fakes.py` `FakeJira` (Task 5 adds `comment`, `find_comment`, `comments`, `comment_lookups`); `FakeMail.find` gains `source` (Task 8).
- `services/mail/tests/graph_fake.py` `FakeGraph` (Task 9 adds the Message-ID lookup and `reply`; Sent Items rows carry `conversationId`).
- `services/agents/tests/outside_fixtures.py` `OutsideFixture`: `self.csm` (Carl, owns Pizza Hut), `self.admin` (Alice), `self.other` (Dana), `self.erin` (Engineering), `jira_connector()`, `jira_thread()`, `slack_thread()`, `mail_thread()`, `outside_bundle()`, `jira_payload()`, `run_all_steps()`, `retry()`, `client_for()`.

---

### Task 1: An unreadable refusal body is still a refusal

**Files:**
- Modify: `services/connectors/providers/base.py` (`http_call`, the `HTTPError` branch)
- Modify: `services/mail/providers/base.py` (`_open`, the `HTTPError` branch)
- Test: `services/connectors/tests/test_http_call.py` (append), `services/mail/tests/test_http_refusals.py` (create)

**Interfaces:**
- Produces: `http_call`/`http_json` (connectors) raise `ProviderError(status=<code>, body=None)` when the error body can't be read; `_open` (mail) raises `ProviderError(status=<code>)` likewise. Never `NoAnswer`, never a raw `TimeoutError` from the body read.

- [ ] **Step 1: Write the failing tests**

Append to `services/connectors/tests/test_http_call.py`, inside `HttpCallTests`:

```python
    def test_a_refusal_whose_body_times_out_is_still_a_refusal(self):
        # Round 2 D1 contract R2D1-8: the tool answered with a status; only its
        # body was lost. Nothing was done, so it is a refusal, never NoAnswer.
        error = urllib.error.HTTPError(URL, 400, "Bad Request", {}, None)
        error.read = MagicMock(side_effect=TimeoutError("read timed out"))
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                http_json("POST", URL, data={}, write=True)
        self.assertNotIsInstance(caught.exception, NoAnswer)
        self.assertEqual((caught.exception.status, caught.exception.body), (400, None))
```

Create `services/mail/tests/test_http_refusals.py`:

```python
"""A mail provider's refusal whose body can't be read is still a refusal
(agent bundles round 2 D1 contract R2D1-8). Nothing leaves the process."""

import urllib.error
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.mail.providers.base import ProviderError, http_json

URL = "https://graph.microsoft.com/v1.0/me/sendMail"


class MailRefusalTests(SimpleTestCase):
    def test_a_refusal_whose_body_times_out_keeps_its_status(self):
        error = urllib.error.HTTPError(URL, 403, "Forbidden", {}, None)
        error.read = MagicMock(side_effect=TimeoutError("read timed out"))
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                http_json("POST", URL, data={})
        self.assertEqual(caught.exception.status, 403)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_http_call services.mail.tests.test_http_refusals --parallel auto --noinput`
Expected: 2 errors, `TimeoutError: read timed out` raised from inside the `except urllib.error.HTTPError` blocks.

- [ ] **Step 3: Catch the body read**

In `services/connectors/providers/base.py`, replace the first line of the `except urllib.error.HTTPError as exc:` branch of `http_call`:

```python
    except urllib.error.HTTPError as exc:
        try:
            text = exc.read().decode(errors="replace")
        except (OSError, http.client.HTTPException, ValueError):
            # The tool answered with a status; only its body was lost (R2D1-8).
            text = ""
```

(`http.client` is already imported there.) In `services/mail/providers/base.py`, `_open`:

```python
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read().decode(errors="replace")
        except (OSError, http.client.HTTPException, ValueError):
            # The provider answered with a status; only its body was lost (R2D1-8).
            raw = ""
```

and add `import http.client` to that module's imports if it is not there (`grep -n "^import" services/mail/providers/base.py`).

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.connectors.tests.test_http_call services.mail.tests.test_http_refusals services.mail.tests.test_agent_send --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/providers/base.py services/mail/providers/base.py services/connectors/tests/test_http_call.py services/mail/tests/test_http_refusals.py
git commit -m "fix(connectors): read an unreadable refusal body as a refusal

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The pick lists read Jira like a Run (N1)

**Files:**
- Modify: `services/agents/outside/sentences.py`, `services/agents/outside/tools.py` (`JiraTool.options`)
- Test: `services/agents/tests/test_outside_tools.py` (append), `services/agents/tests/test_step_options.py` (append)

**Interfaces:**
- Produces: `sentences.list_failure(exc, *, project="", issue="") -> tuple[str, str, int]` (code, detail, status); `sentences.LIST_BUSY`, `sentences.LIST_NO_SITE`. `JiraTool.options` raises `ListFailed` built from it.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_outside_tools.py`, in `SentenceTests` (a `SimpleTestCase`; `ProviderError` is imported there, else add `from services.connectors.providers.base import ProviderError`):

```python
def test_a_pick_list_reads_jira_as_a_run_does(self):
    def failure(status, **where):
        return sentences.list_failure(ProviderError("x", status=status), **where)

    self.assertEqual(
        failure(401),
        ("TOOL_REFUSED", "Jira refused the login. Reconnect Jira, then try again.", 409),
    )
    self.assertEqual(
        failure(404, issue="SUP-12"), ("TOOL_NOT_FOUND", "Jira can't find SUP-12.", 409)
    )
    self.assertEqual(
        failure(404, project="SUP"),
        ("TOOL_NOT_FOUND", "Jira can't find the project SUP.", 409),
    )
    self.assertEqual(
        failure(404),
        ("TOOL_NOT_FOUND", "Jira can't find this site. Check the Jira connection.", 409),
    )
    self.assertEqual(failure(429), ("TOOL_BUSY", "Jira is busy. Try again in a minute.", 409))
    self.assertEqual(failure(None), ("TOOL_UNREACHABLE", "Couldn't reach Jira. Try again.", 502))
    self.assertEqual(failure(500), ("TOOL_UNREACHABLE", "Couldn't reach Jira. Try again.", 502))
```

Append to `RealToolTests` in the same file:

```python
    def test_a_missing_jira_site_or_project_is_not_found(self):
        api = use_jira(self)
        connector = self.jira_connector()
        tool = tools.JiraTool()
        api.refuse_next(r"project/search", 404)
        with self.assertRaises(tools.ListFailed) as caught:
            tool.options(connector, "jira_projects")
        self.assertEqual(
            (caught.exception.code, caught.exception.detail, caught.exception.status),
            ("TOOL_NOT_FOUND", "Jira can't find this site. Check the Jira connection.", 409),
        )
        with self.assertRaises(tools.ListFailed) as caught:
            tool.options(connector, "jira_issue_types", project="NOPE")
        self.assertEqual(caught.exception.detail, "Jira can't find the project NOPE.")
```

(`FakeJiraApi` answers an unknown project's create-meta with 404 already.) Append to `StepOptionsTests` in `services/agents/tests/test_step_options.py`:

```python
    def test_a_jira_refusal_is_passed_on_with_its_code(self):
        self.jira.fail_lists("TOOL_NOT_FOUND", "Jira can't find the project SUP.", 409)
        answer = self.get(self.create, "jira_issue_types", project="SUP")
        self.assertEqual(
            (answer.status_code, answer.json()),
            (409, {"code": "TOOL_NOT_FOUND", "detail": "Jira can't find the project SUP."}),
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_outside_tools services.agents.tests.test_step_options --parallel auto --noinput`
Expected: FAIL: `sentences` has no `list_failure`; the real tool answers `TOOL_UNREACHABLE` 502 for the 404s. (The route test already passes: the route passes any `ListFailed` on; it pins the shape.)

- [ ] **Step 3: Read the failure once**

In `services/agents/outside/sentences.py`, after `LIST_UNREACHABLE`:

```python
LIST_BUSY = "Jira is busy. Try again in a minute."
LIST_NO_SITE = "Jira can't find this site. Check the Jira connection."


def list_failure(exc, *, project="", issue=""):
    """(code, detail, status) for a pick list Jira refused (round 2 D1
    contract R2D1-7): read as a Run reads it, never "unreachable" for a 404."""
    if exc.status in (401, 403):
        return "TOOL_REFUSED", LIST_REFUSED, 409
    if exc.status == 404:
        if issue:
            return "TOOL_NOT_FOUND", f"Jira can't find {issue}.", 409
        if project:
            return "TOOL_NOT_FOUND", f"Jira can't find the project {project}.", 409
        return "TOOL_NOT_FOUND", LIST_NO_SITE, 409
    if exc.status == 429:
        return "TOOL_BUSY", LIST_BUSY, 409
    return "TOOL_UNREACHABLE", LIST_UNREACHABLE, 502
```

In `services/agents/outside/tools.py`, `JiraTool.options`, replace the `except ProviderError` block:

```python
        except ProviderError as exc:
            raise ListFailed(
                *sentences.list_failure(exc, project=project, issue=issue)
            ) from None
```

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_outside_tools services.agents.tests.test_step_options --parallel auto --noinput`
Expected: OK (the existing `test_jira_tool_creates_finds_assigns_and_lists` still gets `TOOL_REFUSED` for a 401).

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside/sentences.py services/agents/outside/tools.py services/agents/tests/test_outside_tools.py services/agents/tests/test_step_options.py
git commit -m "fix(agents): pick lists read a Jira 404 or 429 as a Run does

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Three small truths: the assign lookup, `needs: "reconnect"`, the demoted admin's refusal

**Files:**
- Modify: `services/agents/actions/jira_issues.py` (`apply_assign`), `services/connectors/agent_access.py` (`needs`), `services/connectors/views.py` (`ConnectorOAuthCallbackView._finish`)
- Test: `services/agents/tests/test_jira_assign_kind.py` (append), `services/connectors/tests/test_agent_access.py` (append), `services/connectors/tests/test_agents_route.py` (append)

**Interfaces:**
- Produces: `agent_outside.call` lookups for `jira.assign` with `outcome` in `found`/`not_found`/`elsewhere`; `agent_access.needs(connector)` may return `"reconnect"`; `connector.oauth_refused` with `metadata.reason == "not_allowed"`.

- [ ] **Step 1: Write the failing tests**

Append to `JiraAssignTests` in `services/agents/tests/test_jira_assign_kind.py`:

```python
def test_an_issue_someone_else_holds_is_looked_up_as_elsewhere(self):
    # Round 2 D1 contract R2D1-9.
    self.jira.issues["SUP-12"]["assignee"] = "acc-priya"
    bundle, _ = self.one_step()
    self.run_all_steps(self.csm, bundle)
    lookup = AuditEvent.objects.get(action="agent_outside.call", metadata__op="lookup")
    self.assertEqual((lookup.metadata["outcome"], lookup.metadata["returned"]), ("elsewhere", ""))
    self.assertEqual(self.jira.assigned, [("SUP-12", "acc-erin")])


def test_an_unassigned_issue_is_looked_up_as_not_found(self):
    bundle, _ = self.one_step()
    self.run_all_steps(self.csm, bundle)
    lookup = AuditEvent.objects.get(action="agent_outside.call", metadata__op="lookup")
    self.assertEqual(lookup.metadata["outcome"], "not_found")
```

Append to `AgentAccessTests` in `services/connectors/tests/test_agent_access.py`:

```python
    @override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
    def test_a_connector_that_cant_be_used_needs_a_reconnect_first(self):
        # Round 2 D1 contract R2D1-10: before consent, token or permission.
        slack = self.connector("slack", via="oauth", is_enabled=False)
        self.assertEqual(agent_access.needs(slack), "reconnect")
        slack.is_enabled, slack.status = True, Connector.Status.ERROR
        self.assertEqual(agent_access.needs(slack), "reconnect")
        jira = self.connector("jira", scopes=["CREATE_ISSUES"])
        jira.status = Connector.Status.ERROR
        self.assertEqual(agent_access.needs(jira), "reconnect")
        jira.status = Connector.Status.CONNECTED
        self.assertEqual(agent_access.needs(jira), "permission")
```

(The helper creates with `status=CONNECTED` and passes `**fields` on, so the error status is set on the instance afterwards; `needs` reads the instance.)

Append to `AgentsRouteTests` in `services/connectors/tests/test_agents_route.py`, after `test_a_consent_finished_after_losing_manage_integrations_is_refused`:

```python
@override_settings(SLACK_OAUTH_CLIENT_ID="id", SLACK_OAUTH_CLIENT_SECRET="secret")
def test_a_demoted_admins_refused_callback_is_audited(self):
    # Round 2 D1 contract R2D1-11.
    use_slack(self)
    slack = self.make("slack", via="oauth")
    state = parse_qs(urlsplit(self.post(slack, {"can_act": True}).json()["authorize_url"]).query)[
        "state"
    ][0]
    self.admin.role = self.org.roles.get(slug=User.Role.CSM)
    self.admin.save(update_fields=["role"])
    self.sign_out_keeping_cookies()
    self.client.get(CALLBACK, {"code": "c", "state": state})
    refused = AuditEvent.objects.get(action="connector.oauth_refused")
    self.assertEqual(
        (refused.actor_id, refused.metadata, refused.outcome),
        (self.admin.pk, {"provider": "slack", "reason": "not_allowed"}, "failure"),
    )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_jira_assign_kind services.connectors.tests.test_agent_access services.connectors.tests.test_agents_route --parallel auto --noinput`
Expected: FAIL: outcome `not_found` for the issue Priya holds; `needs` is `consent` / `permission` for the unusable ones; no `connector.oauth_refused` row.

- [ ] **Step 3: The three fixes**

`services/agents/actions/jira_issues.py`, `apply_assign`, replace the lookup's trail call:

```python
    done = now == wanted
    # D3-7: assigning reads first; already done is done. R2D1-9: say what was found.
    outcome = "found" if done else ("elsewhere" if now else "not_found")
    trail.call(
        action,
        actor,
        tool="jira",
        op="lookup",
        outcome=outcome,
        where=issue,
        returned=issue if done else "",
    )
```

`services/connectors/agent_access.py`, `needs`:

```python
def needs(connector):
    """What "Allow agents to act" will do: a reconnect first, consent, a
    token with the scope, or a Jira permission; None when it can act or never
    could (round 2 D1 contract R2D1-10)."""
    if not kinds(connector) or can_act(connector):
        return None
    if not usable(connector):
        return "reconnect"
    if connector.provider == P.JIRA:
        return "permission"
    if (connector.config or {}).get("via") == "oauth" and _slack_sign_in():
        return "consent"
    return "token"
```

`services/connectors/views.py`, `ConnectorOAuthCallbackView._finish`, replace the capability check:

```python
        # SOC2:AUTH-02 still an integration manager when the link comes back
        if not user.has_capability(Capability.MANAGE_INTEGRATIONS):
            audit.record(  # SOC2:LOG-01 a refused OAuth finish (R2D1-11)
                "connector.oauth_refused",
                request=request,
                actor=user,
                target=connector,
                outcome="failure",
                metadata={"provider": connector.provider, "reason": "not_allowed"},
            )
            return _back_to_integrations("error", "Unknown connector.")
```

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_jira_assign_kind services.connectors --parallel auto --noinput`
Expected: OK. (`test_a_consent_finished_after_losing_manage_integrations_is_refused` asserts no `connector.agent_access` row; it is untouched.)

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/actions/jira_issues.py services/connectors/agent_access.py services/connectors/views.py services/agents/tests/test_jira_assign_kind.py services/connectors/tests/test_agent_access.py services/connectors/tests/test_agents_route.py
git commit -m "fix(agents): truthful assign lookups, needs reconnect, audit a demoted consent

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Jira can post and find a comment

**Files:**
- Modify: `services/connectors/providers/jira.py`, `services/connectors/agent_access.py` (`JIRA_CHECKED`), `services/connectors/tests/jira_fake.py`
- Test: `services/connectors/tests/test_jira_actions.py` (append), `services/connectors/tests/test_agents_route.py` (`test_jira_switches_on_with_create_and_assign`)

**Interfaces:**
- Produces: `jira.COMMENT_PROPERTY == {"key": "sd.public.comment", "value": {"internal": True}}`; `jira.LOOK_COMMENTS == 100`; `jira.comment_url(config, key, comment_id) -> str`; `JiraProvider.add_comment(config, creds, issue, *, body) -> str` (the comment id; `NoAnswer` when the answer was lost); `JiraProvider.find_comment(config, creds, issue, *, marker) -> str | None`; `agent_access.JIRA_CHECKED` gains `"ADD_COMMENTS"`. `FakeJiraApi.comments` (issue key → list of `{"id", "body", "properties"}`).

- [ ] **Step 1: Write the failing tests**

Append to `JiraActionTests` in `services/connectors/tests/test_jira_actions.py` (add `comment_url` to the `jira` import):

```python
def test_a_comment_is_internal_and_found_by_its_marker(self):
    # Round 2 D1 contract §2, R2D1-3, R2D1-4.
    body = adf("Seen on Chrome too.", "Posted by Carl CSM from Revenact · ref b12-s41.")
    comment = self.jira.add_comment(CONFIG, CREDS, "SUP-12", body=body)
    method, path, _, sent = self.api.calls[-1]
    self.assertEqual((method, path), ("POST", "/rest/api/3/issue/SUP-12/comment"))
    self.assertEqual(
        sent["properties"], [{"key": "sd.public.comment", "value": {"internal": True}}]
    )
    self.assertEqual(self.jira.find_comment(CONFIG, CREDS, "SUP-12", marker="ref b12-s41"), comment)
    self.assertIsNone(self.jira.find_comment(CONFIG, CREDS, "SUP-12", marker="ref b12-s99"))
    _, path, query, _ = self.api.calls[-1]
    self.assertEqual(
        (path, query["orderBy"], query["maxResults"]),
        ("/rest/api/3/issue/SUP-12/comment", "-created", "100"),
    )
    self.assertEqual(
        comment_url(CONFIG, "SUP-12", comment),
        f"https://acme.atlassian.net/browse/SUP-12?focusedCommentId={comment}",
    )


def test_a_lost_comment_is_no_answer_and_exists(self):
    self.api.drop_next(r"POST /rest/api/3/issue/SUP-12/comment$")
    with self.assertRaises(NoAnswer):
        self.jira.add_comment(CONFIG, CREDS, "SUP-12", body=adf("Hi", "ref b1-s2"))
    self.assertIsNotNone(self.jira.find_comment(CONFIG, CREDS, "SUP-12", marker="ref b1-s2"))


def test_a_comment_on_a_missing_issue_is_a_404(self):
    with self.assertRaises(ProviderError) as caught:
        self.jira.add_comment(CONFIG, CREDS, "SUP-999", body=adf("Hi"))
    self.assertEqual(caught.exception.status, 404)
```

In `services/connectors/tests/test_agents_route.py`, `test_jira_switches_on_with_create_and_assign`, change the expected list to
`["ADD_COMMENTS", "ASSIGN_ISSUES", "BROWSE_PROJECTS", "CREATE_ISSUES"]`.

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.connectors.tests.test_jira_actions services.connectors.tests.test_agents_route --parallel auto --noinput`
Expected: FAIL: `JiraProvider` has no `add_comment`; the fake has no comment route; the stored scopes lack `ADD_COMMENTS`.

- [ ] **Step 3: The fake learns comments**

In `services/connectors/tests/jira_fake.py`, `FakeJiraApi.__init__`: change the permissions line to
`self.permissions = {"CREATE_ISSUES", "ASSIGN_ISSUES", "BROWSE_PROJECTS", "ADD_COMMENTS"}` and add
`self.comments = {}` (and `self._comment_id = 10030`). In `_route`, before the `assignee = re.fullmatch(...)` line:

```python
        comment = re.fullmatch(rf"{api}/issue/([A-Z0-9_]+-\d+)/comment", path)
        if comment:
            key = comment.group(1)
            if key not in self.issues:
                raise self._not_found()
            rows = self.comments.setdefault(key, [])
            if method == "POST":
                self._comment_id += 1
                rows.append(
                    {
                        "id": str(self._comment_id),
                        "body": data["body"],
                        "properties": data.get("properties", []),
                    }
                )
                return {"id": str(self._comment_id), "body": data["body"]}
            newest = list(reversed(rows)) if query.get("orderBy") == "-created" else list(rows)
            page = newest[: int(query.get("maxResults", 50))]
            return {"comments": page, "total": len(rows), "maxResults": len(page)}
```

Update the module docstring's list of routes ("... issue read and assign, comments posted and listed, ...").

- [ ] **Step 4: The provider posts and finds**

In `services/connectors/providers/jira.py`, after `LABEL_PREFIX`/`API`:

```python
#: Round 2 D1 (R2D1-3): every agent comment is internal in Jira Service
#: Management; a Jira Software project ignores the property.
COMMENT_PROPERTY = {"key": "sd.public.comment", "value": {"internal": True}}
#: How many of an issue's newest comments a Retry reads for its ref (R2D1-4).
LOOK_COMMENTS = 100


def comment_url(config, key, comment_id):
    return f"https://{config['host']}/browse/{key}?focusedCommentId={comment_id}"
```

In `JiraProvider`, after `assign_issue`:

```python
def add_comment(self, config, creds, issue, *, body):
    """The new comment's id (`body` is ADF); NoAnswer when the request went
    out and nothing came back."""
    made = http_json(
        "POST",
        self._url(config, f"/issue/{quote(issue, safe='')}/comment"),
        headers=self._headers(creds),
        data={"body": body, "properties": [COMMENT_PROPERTY]},
        timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        write=True,
    )
    return str(made["id"])


def find_comment(self, config, creds, issue, *, marker):
    """The id of the newest of the issue's last 100 comments whose text
    holds `marker` ("ref b12-s41"), or None."""
    page = self._read(
        config,
        creds,
        f"/issue/{quote(issue, safe='')}/comment",
        {"orderBy": "-created", "maxResults": LOOK_COMMENTS},
    )
    for comment in page.get("comments") or []:
        if marker in adf_text(comment.get("body")):
            return str(comment["id"])
    return None
```

In `services/connectors/agent_access.py`:

```python
#: What the Jira check asks for. Create and assign are required; browsing and
#: commenting are stored, not required (round 2 D1 contract R2D1-5).
JIRA_CHECKED = ("CREATE_ISSUES", "ASSIGN_ISSUES", "BROWSE_PROJECTS", "ADD_COMMENTS")
```

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.connectors --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/connectors/providers/jira.py services/connectors/agent_access.py services/connectors/tests/jira_fake.py services/connectors/tests/test_jira_actions.py services/connectors/tests/test_agents_route.py
git commit -m "feat(connectors): post an internal Jira comment and find it by its ref

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The facade comments; its fake does too

**Files:**
- Modify: `services/agents/outside/tools.py`, `services/agents/outside/sentences.py`, `services/agents/tests/outside_fakes.py`
- Test: `services/agents/tests/test_outside_tools.py` (append)

**Interfaces:**
- Consumes: `JiraProvider.add_comment`, `find_comment`, `comment_url`, `issue_url` (Task 4).
- Produces: `tools.Comment(id: str, key: str, url: str, issue_url: str)`; `JiraTool.comment(connector, *, issue, body) -> Comment` (raises `Unconfirmed(sentences.JIRA_COMMENT_UNCONFIRMED)` or `Refused(sentences.jira(exc, issue=issue))`); `JiraTool.find_comment(connector, *, issue, marker) -> Comment | None` (raises `Refused`); `sentences.JIRA_COMMENT_UNCONFIRMED`. `FakeJira.comment`, `FakeJira.find_comment`, `FakeJira.comments` (list of `{"issue", "id", "text"}`), `FakeJira.comment_lookups` (list of `(issue, marker)`); `refuse_next("comment" | "find_comment", sentence)`, `drop_next("comment")`.

- [ ] **Step 1: Write the failing test**

Append to `RealToolTests` in `services/agents/tests/test_outside_tools.py` (add `from services.connectors.providers.jira import adf` to the imports):

```python
    def test_jira_tool_comments_and_finds_a_comment(self):
        api = use_jira(self)
        connector = self.jira_connector()
        tool = tools.JiraTool()
        made = tool.comment(connector, issue="SUP-12", body=adf("Seen again.", "ref b3-s9"))
        self.assertEqual(
            (made.key, made.issue_url, made.url),
            (
                "SUP-12",
                "https://acme.atlassian.net/browse/SUP-12",
                f"https://acme.atlassian.net/browse/SUP-12?focusedCommentId={made.id}",
            ),
        )
        self.assertEqual(tool.find_comment(connector, issue="SUP-12", marker="ref b3-s9"), made)
        api.refuse_next(r"comment$", 403)
        with self.assertRaises(tools.Refused) as caught:
            tool.comment(connector, issue="SUP-12", body=adf("x"))
        self.assertEqual(
            caught.exception.sentence,
            "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry.",
        )
        api.drop_next(r"POST /rest/api/3/issue/SUP-12/comment$")
        with self.assertRaises(tools.Unconfirmed) as caught:
            tool.comment(connector, issue="SUP-12", body=adf("x"))
        self.assertEqual(
            caught.exception.sentence,
            "We couldn't confirm Jira added the comment. Retry checks Jira first.",
        )
```

- [ ] **Step 2: Run it to see it fail**

Run: `$PY manage.py test services.agents.tests.test_outside_tools --parallel auto --noinput`
Expected: ERROR: `JiraTool` has no `comment`.

- [ ] **Step 3: The facade**

`services/agents/outside/sentences.py`, after `JIRA_ASSIGN_UNCONFIRMED`:

```python
JIRA_COMMENT_UNCONFIRMED = "We couldn't confirm Jira added the comment. Retry checks Jira first."
```

`services/agents/outside/tools.py`, after `class Issue`:

```python
@dataclass(frozen=True)
class Comment:
    id: str
    key: str
    url: str
    issue_url: str
```

and in `JiraTool`, after `assign`:

```python
def _comment(self, connector, issue, comment_id):
    from services.connectors.providers.jira import comment_url, issue_url

    return Comment(
        id=comment_id,
        key=issue,
        url=comment_url(connector.config, issue, comment_id),
        issue_url=issue_url(connector.config, issue),
    )


def comment(self, connector, *, issue, body):
    try:
        comment_id = self._jira().add_comment(
            connector.config, connector.get_credentials(), issue, body=body
        )
    except NoAnswer:
        raise Unconfirmed(sentences.JIRA_COMMENT_UNCONFIRMED) from None
    except ProviderError as exc:
        raise Refused(sentences.jira(exc, issue=issue)) from None
    return self._comment(connector, issue, comment_id)


def find_comment(self, connector, *, issue, marker):
    try:
        comment_id = self._jira().find_comment(
            connector.config, connector.get_credentials(), issue, marker=marker
        )
    except ProviderError as exc:
        raise Refused(sentences.jira(exc, issue=issue)) from None
    return None if comment_id is None else self._comment(connector, issue, comment_id)
```

- [ ] **Step 4: The fake**

In `services/agents/tests/outside_fakes.py`, `FakeJira.__init__` add `self.comments, self.comment_lookups = [], []` and `self._comment_id = 20000`; add to `FakeJira` (import `adf_text` at the top: `from services.connectors.providers.jira import adf_text`):

```python
def _comment_of(self, connector, issue, comment_id):
    return tools.Comment(
        id=comment_id,
        key=issue,
        url=f"{self._url(connector, issue)}?focusedCommentId={comment_id}",
        issue_url=self._url(connector, issue),
    )


def comment(self, connector, *, issue, body):
    self._refused("comment")
    self._comment_id += 1
    comment_id = str(self._comment_id)
    self.comments.append({"issue": issue, "id": comment_id, "text": adf_text(body)})
    if "comment" in self._drop:
        self._drop.discard("comment")
        raise tools.Unconfirmed(sentences.JIRA_COMMENT_UNCONFIRMED)
    return self._comment_of(connector, issue, comment_id)


def find_comment(self, connector, *, issue, marker):
    self._refused("find_comment")
    self.comment_lookups.append((issue, marker))
    for row in reversed(self.comments):
        if row["issue"] == issue and marker in row["text"]:
            return self._comment_of(connector, issue, row["id"])
    return None
```

Update `refuse_next`'s docstring to list `"comment"` and `"find_comment"`.

- [ ] **Step 5: Run it to see it pass**

Run: `$PY manage.py test services.agents.tests.test_outside_tools --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside/tools.py services/agents/outside/sentences.py services/agents/tests/outside_fakes.py services/agents/tests/test_outside_tools.py
git commit -m "feat(agents): the outside facade posts and finds a Jira comment

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `jira.comment`

**Files:**
- Modify: `services/metrics/models.py` (`AgentAction.Kind`, after `JIRA_ASSIGN`)
- Create: `services/metrics/migrations/0018_agent_action_jira_comment.py` (generated)
- Create: `services/agents/actions/jira_comments.py`
- Modify: `services/agents/registry.py`, `services/agents/placeholders.py`, `services/agents/bulk.py`, `services/agents/bundle_payloads.py` (`links_for`), `services/agents/outside/gates.py` (`TOOLS`), `services/connectors/agent_access.py` (`KINDS`)
- Modify tests that pin the kinds: `services/agents/tests/test_policy.py`, `services/agents/tests/test_builder_framework.py`, `services/connectors/tests/test_agent_access.py` (`test_jira_needs_create_and_assign`), `e2e/test_agent_outside_flow.py` (the `agents` block after the Jira connect)
- Test: `services/agents/tests/test_jira_comment_kind.py` (create)

**Interfaces:**
- Consumes: `tools.Comment`, `JiraTool.comment` / `find_comment` (Task 5); `jira_issues.STEP_KEY`, `jira_issues._as` (existing).
- Produces: `AgentAction.Kind.JIRA_COMMENT` (`"jira.comment"`); `jira_comments.COMMENT` (the `Kind`); `jira_comments.marker(step) -> "ref b<bundle>-s<step>"`; `jira_comments.POSTED`; `placeholders.TEXTS` gains `"comment_url"`, `placeholders.label(1, "comment_url") == "Jira comment link from step 1"`; `agent_access.KINDS[JIRA] == ("jira.create", "jira.assign", "jira.comment")`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_jira_comment_kind.py`:

```python
"""jira.comment (agent bundles round 2 D1 contract §2, §3, R2D1-2 to R2D1-6).
Jira is a fake; nothing is posted."""

from core.models import AuditEvent
from services.agents import placeholders
from services.agents.actions import jira_comments
from services.agents.evidence import Context
from services.agents.kinds import Invalid
from services.agents.tests.outside_fixtures import OutsideFixture

DETAIL = "/api/v1/agents/bundles/{}/"
STEP = "/api/v1/agents/bundles/{}/steps/{}/"
BODY = "Customer confirms the loop on Chrome too."


class JiraCommentTests(OutsideFixture):
    def setUp(self):
        super().setUp()
        # Customer Success's Jira: Carl reads its tickets, so he reads and runs the bundle.
        self.board = self.jira_connector(department="cs")
        self.ticket, self.thread = self.jira_thread(self.pizza, self.board, key="SUP-12")

    @staticmethod
    def comment_payload(connector, issue="SUP-12", body=BODY):
        return {"connector_id": connector.pk, "issue": issue, "body": body}

    def one_step(self, **kw):
        bundle = self.outside_bundle(
            self.thread, ("jira.comment", self.comment_payload(self.board, **kw))
        )
        return bundle, bundle.steps.get()

    def ctx(self, thread_id=1):
        ctx = Context(self.org, "cs", self.today)
        ctx.thread_id = thread_id
        ctx.jira_connector = {"id": self.board.pk, "project": "SUP"}
        ctx.thread_ticket = {
            "id": self.ticket.pk,
            "record": f"customer:{self.pizza.pk}",
            "line": "",
            "provider": "jira",
            "connector_id": self.board.pk,
            "external_id": "SUP-12",
            "number": "SUP-12",
            "config": self.board.config,
            "usable": True,
        }
        return ctx

    def test_the_source_issue_or_an_earlier_steps_never_at_night(self):
        row = {"ref": f"customer:{self.pizza.pk}"}
        self.assertEqual(
            jira_comments.validate({"issue": "source", "body": BODY}, row, self.ctx(), []),
            {"connector_id": self.board.pk, "issue": "SUP-12", "body": BODY},
        )
        self.assertEqual(
            jira_comments.validate(
                {"issue": "{{step 1.ticket_key}}", "body": BODY}, row, self.ctx(), []
            )["issue"],
            "{{step 1.ticket_key}}",
        )
        for bad, ctx in (
            ({"issue": "ENG-9", "body": BODY}, self.ctx()),
            ({"issue": "source", "body": ""}, self.ctx()),
            ({"issue": "source", "body": "x" * 2001}, self.ctx()),
            ({"issue": "source", "body": BODY}, self.ctx(thread_id=None)),
        ):
            with self.subTest(bad=bad, thread=ctx.thread_id), self.assertRaises(Invalid):
                jira_comments.validate(bad, row, ctx, [])

    def test_a_run_posts_the_body_and_its_ref(self):
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(step.status, "applied", step.error)
        [comment] = self.jira.comments
        self.assertEqual(comment["issue"], "SUP-12")
        self.assertIn(BODY, comment["text"])
        self.assertIn(
            f"Posted by {self.csm.name} from Revenact · ref b{bundle.pk}-s{step.pk}.",
            comment["text"],
        )
        url = f"https://acme.atlassian.net/browse/SUP-12?focusedCommentId={comment['id']}"
        self.assertEqual(
            step.outputs,
            {
                "ticket_key": "SUP-12",
                "ticket_url": "https://acme.atlassian.net/browse/SUP-12",
                "comment_url": url,
            },
        )
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(
            detail["steps"][0]["links"],
            [{"label": "Open the comment on SUP-12 in Jira", "url": url, "external": True}],
        )

    def test_the_preview_says_where_and_as_whom(self):
        bundle, _ = self.one_step()
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(
            detail["steps"][0]["preview"],
            {
                "jira_comment": {
                    "site": "acme.atlassian.net",
                    "issue": "SUP-12",
                    "excerpt": BODY,
                    "as": "Jira Bot",
                    "internal": True,
                }
            },
        )
        self.assertEqual(detail["steps"][0]["editable"], ["body"])

    def test_a_lost_answer_is_found_on_retry_and_never_posted_twice(self):
        self.jira.drop_next("comment")
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual(
            (step.status, step.error),
            ("failed", "We couldn't confirm Jira added the comment. Retry checks Jira first."),
        )
        self.retry(self.csm, step)
        step.refresh_from_db()
        self.assertEqual((step.status, len(self.jira.comments)), ("applied", 1))
        self.assertEqual(self.jira.comment_lookups, [("SUP-12", f"ref b{bundle.pk}-s{step.pk}")])
        calls = list(
            AuditEvent.objects.filter(action="agent_outside.call").values_list(
                "metadata__op", "metadata__outcome", "metadata__where"
            )
        )
        self.assertEqual(
            calls, [("comment", "unconfirmed", "SUP-12"), ("lookup", "found", "SUP-12")]
        )

    def test_the_trail_holds_ids_only(self):
        bundle, _ = self.one_step()
        self.run_all_steps(self.csm, bundle)
        [row] = AuditEvent.objects.filter(action="agent_outside.call", metadata__op="comment")
        self.assertEqual(
            (row.metadata["where"], row.metadata["returned"]),
            ("SUP-12", self.jira.comments[0]["id"]),
        )
        self.assertNotIn("Chrome", str(row.metadata))

    def test_a_refusal_is_the_steps_sentence(self):
        sentence = (
            "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry."
        )
        self.jira.refuse_next("comment", sentence)
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        step.refresh_from_db()
        self.assertEqual((step.status, step.error), ("failed", sentence))

    def test_it_comments_on_the_issue_an_earlier_step_made(self):
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            (
                "jira.comment",
                self.comment_payload(
                    self.board,
                    issue="{{step 1.ticket_key}}",
                    body="Tracked at {{step 1.ticket_url}}",
                ),
            ),
        )
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        self.assertEqual(detail["steps"][1]["placeholders"][0]["label"], "Jira ticket from step 1")
        self.run_all_steps(self.csm, bundle)
        [made] = self.jira.created
        [comment] = self.jira.comments
        self.assertEqual(comment["issue"], made)
        self.assertIn(f"Tracked at https://acme.atlassian.net/browse/{made}", comment["text"])

    def test_it_needs_its_issue_to_have_been_made(self):
        self.jira.refuse_next("create", "Jira says the project SUP needs a component.")
        bundle = self.outside_bundle(
            self.thread,
            ("jira.create", self.jira_payload(self.board)),
            ("jira.comment", self.comment_payload(self.board, issue="{{step 1.ticket_key}}")),
        )
        self.run_all_steps(self.csm, bundle)
        step = bundle.steps.get(position=2)
        self.assertEqual((step.status, step.error), ("failed", "Needs step 1, which didn't run."))
        self.assertEqual(self.jira.comments, [])

    def test_edits(self):
        bundle, step = self.one_step()
        url = STEP.format(bundle.pk, step.pk)
        client = self.client_for(self.csm)
        blank = client.patch(url, {"fields": {"body": ""}}, format="json")
        self.assertEqual(blank.json()["steps"][str(step.pk)], {"body": ["Write the comment."]})
        long = client.patch(url, {"fields": {"body": "x" * 4001}}, format="json")
        self.assertEqual(
            long.json()["steps"][str(step.pk)],
            {"body": ["Keep the comment under 4000 characters."]},
        )
        done = client.patch(url, {"fields": {"body": "Seen on Safari."}}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        step.refresh_from_db()
        self.assertEqual(step.payload["body"], "Seen on Safari.")

    def test_a_read_only_jira_disables_it(self):
        self.board.agents_can_act = False
        self.board.save(update_fields=["agents_can_act"])
        bundle, _ = self.one_step()
        detail = self.client_for(self.csm).get(DETAIL.format(bundle.pk)).json()
        step = detail["steps"][0]
        self.assertEqual(
            (step["can_run"], step["disabled_reason"], step["disabled_link"]),
            (False, "Ask an admin to allow agents to act in Jira.", "/settings/connections"),
        )

    def test_it_cant_be_undone(self):
        bundle, step = self.one_step()
        self.run_all_steps(self.csm, bundle)
        undo = self.client_for(self.csm).post(f"/api/v1/agents/actions/{step.pk}/undo/")
        self.assertEqual(undo.json()["detail"], "This Jira comment has been posted.")

    def test_its_link_chip(self):
        self.assertEqual(placeholders.label(1, "comment_url"), "Jira comment link from step 1")
        self.assertEqual(
            placeholders.outputs_for(
                {"comment_url": "https://acme.atlassian.net/browse/SUP-1?focusedCommentId=9"}
            ),
            {"comment_url": "https://acme.atlassian.net/browse/SUP-1?focusedCommentId=9"},
        )
```

In the tests that pin the kinds, add `jira.comment` after `jira.assign`: `test_policy.py` (`("jira.comment", "ask", ("cs", "sales")),`), `test_builder_framework.py` (`"jira.comment",` in `builders`, because the kind sets `texts`), `test_agent_access.py` (`("jira.create", "jira.assign", "jira.comment")`), `e2e/test_agent_outside_flow.py` (`"kinds": ["jira.create", "jira.assign", "jira.comment"]`).

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_jira_comment_kind services.agents.tests.test_policy services.agents.tests.test_builder_framework services.connectors.tests.test_agent_access --parallel auto --noinput`
Expected: ERROR: `cannot import name 'jira_comments'`; the pins fail.

- [ ] **Step 3: The choice and its migration**

`services/metrics/models.py`, in `AgentAction.Kind` after `JIRA_ASSIGN`:

```python
        # Agent bundles round 2 D1: an internal Jira comment, always Ask.
        JIRA_COMMENT = "jira.comment", "Comment on a Jira issue"
```

Run: `$PY manage.py makemigrations metrics --name agent_action_jira_comment`
Expected: `services/metrics/migrations/0018_agent_action_jira_comment.py`, one `AlterField` on `agentaction.kind` (24 choices), depending on `0017_agent_action_outside_kinds`.

- [ ] **Step 4: The kind**

Create `services/agents/actions/jira_comments.py`:

```python
"""jira.comment (agent bundles round 2 D1 contract §2, §3, R2D1-2 to
R2D1-6): an internal comment on the conversation's own Jira issue, or on the
issue an earlier step made, as the connection's account (D3-5), when a
person presses Run. The model writes the body; the comment ends with who ran
it and the step's ref, which a Retry looks for first. Can't be undone."""

from rest_framework import serializers

from services.connectors.providers.jira import adf
from services.metrics.models import AgentAction

from .. import placeholders
from ..edits import checked, text_field
from ..kinds import ASK, RECORD_AGENTS, ChangedSince, Invalid, Kind, Stale, StepFailed
from ..outside import gates, keys, tools, trail
from .jira_issues import STEP_KEY, _as

MODEL_BODY = 2000
BODY_LIMIT = 4000
EXCERPT = 280
NO_BODY = "Write the comment."
LONG_BODY = "Keep the comment under 4000 characters."
POSTED = "This Jira comment has been posted."


def marker(step):
    # SOC2:API-08 the step's key, written into the comment so a Retry finds it
    return f"ref {keys.key_for(step)}"


def validate(payload, row, ctx, evidence):
    if ctx.thread_id is None:
        # R2D1-2: the nightly pass never comments.
        raise Invalid("a comment answers a conversation")
    issue = str(payload.get("issue") or "").strip()
    ticket = ctx.thread_ticket
    if issue == "source":
        if ticket is None or ticket["provider"] != "jira" or ticket["record"] != row["ref"]:
            raise Invalid("this conversation has no Jira issue")
        if not ticket.get("usable"):
            raise Invalid("this conversation's Jira connection is off")
        issue, connector_id = ticket["external_id"], ticket["connector_id"]
    elif STEP_KEY.match(issue):
        if ctx.jira_connector is None:
            raise Invalid("no Jira connection")
        connector_id = ctx.jira_connector["id"]
    else:
        raise Invalid("an issue is the conversation's own or an earlier step's")
    body = str(payload.get("body") or "").strip()
    if not body or len(body) > MODEL_BODY:
        raise Invalid("a comment needs a body under 2000 characters")
    return {"connector_id": connector_id, "issue": issue, "body": body}


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    where = _as(gates.connector_of(action))
    return {
        "jira_comment": {
            "site": where["site"],
            "issue": payload.get("issue", ""),
            "excerpt": str(payload.get("body", ""))[:EXCERPT],
            "as": where["as"],
            "internal": True,
        }
    }


class _Text(serializers.Serializer):
    body = text_field(BODY_LIMIT, NO_BODY, LONG_BODY)


def edit(action, fields, runner):
    return {**action.payload, **checked(_Text, {k: fields[k] for k in ("body",) if k in fields})}


def _done(comment, attempt):
    return {"comment": comment.id}, {
        **attempt,
        "comment_id": comment.id,
        "ticket_key": comment.key,
        "ticket_url": comment.issue_url,
        "comment_url": comment.url,
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person comments on a Jira issue")
    # SOC2:AUTH-02 the tool's gate again at run: the switch and the grant
    stop = gates.blocked(action, actor)
    if stop is not None:
        raise StepFailed(stop.sentence)
    connector = gates.connector_of(action)
    payload = action.payload
    issue = payload["issue"]
    named = placeholders.find({"issue": issue})
    if named:
        # run_step fills it first; an unfilled one never reaches Jira.
        raise StepFailed(placeholders.needs_sentence(named[0][1]))
    tool, attempt = tools.current().jira, keys.attempt(action, actor)
    if keys.retrying(action):
        try:
            found = tool.find_comment(connector, issue=issue, marker=marker(action))
        except tools.Refused as exc:
            trail.call(action, actor, tool="jira", op="lookup", outcome="refused", where=issue)
            raise StepFailed(exc.sentence, result=attempt) from None
        trail.call(
            action,
            actor,
            tool="jira",
            op="lookup",
            outcome="found" if found else "not_found",
            where=issue,
            returned=found.id if found else "",
        )
        if found is not None:
            return _done(found, attempt)
    body = adf(payload["body"], f"Posted by {actor.name} from Revenact · {marker(action)}.")
    try:
        made = tool.comment(connector, issue=issue, body=body)
    except tools.Unconfirmed as exc:
        trail.call(action, actor, tool="jira", op="comment", outcome="unconfirmed", where=issue)
        raise StepFailed(exc.sentence, result=attempt) from None
    except tools.Refused as exc:
        trail.call(action, actor, tool="jira", op="comment", outcome="refused", where=issue)
        raise StepFailed(exc.sentence, result=attempt) from None
    trail.call(
        action, actor, tool="jira", op="comment", outcome="ok", where=issue, returned=made.id
    )
    return _done(made, attempt)


def undo(action, actor):
    raise ChangedSince(POSTED)


COMMENT = Kind(
    key=AgentAction.Kind.JIRA_COMMENT,
    label="Comment on a Jira issue",
    example="Add the customer's new detail to SUP-12",
    max_level=ASK,
    agents=RECORD_AGENTS,
    validate=validate,
    target=lambda payload: f"jira:comment:{payload['issue']}"[:160],
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    texts=lambda payload: [payload.get("body")],
    irreversible=True,
    outside=True,
    editable=("body",),
    edit=edit,
    outputs=("ticket_key", "ticket_url", "comment_url"),
    cant_undo=POSTED,
)
```

- [ ] **Step 5: Wire it in**

- `services/agents/registry.py`: import `jira_comments` (alphabetical, after `initiatives`) and add `jira_comments.COMMENT,` after `jira_issues.ASSIGN,`.
- `services/agents/placeholders.py`: `THINGS` gains `"comment": "Jira comment",`; `TEXTS = ("ticket_key", "ticket_url", "slack_ts", "slack_url", "comment_url")`.
- `services/agents/bulk.py`: the `outside_ids` set comprehension's tuple becomes `("slack.reply", "jira.create", "jira.assign", "jira.comment")`.
- `services/agents/outside/gates.py`: `TOOLS = (K.SLACK_REPLY, K.JIRA_CREATE, K.JIRA_ASSIGN, K.JIRA_COMMENT)`.
- `services/connectors/agent_access.py`: `KINDS = {P.SLACK: ("slack.reply",), P.JIRA: ("jira.create", "jira.assign", "jira.comment")}`.
- `services/agents/bundle_payloads.py`, `links_for`, replace the `ticket = out.get("ticket_url")` block:

```python
    comment = out.get("comment_url")
    ticket = out.get("ticket_url")
    if isinstance(comment, str) and _jira_url(comment):
        # R2D1-6: a comment links to itself, in place of its issue.
        links.append(
            {
                "label": f"Open the comment on {out.get('ticket_key', 'the issue')} in Jira",
                "url": comment,
                "external": True,
            }
        )
    elif isinstance(ticket, str) and _jira_url(ticket):
        links.append(
            {
                "label": f"Open {out.get('ticket_key', 'the issue')} in Jira",
                "url": ticket,
                "external": True,
            }
        )
```

- [ ] **Step 6: Run them to see them pass**

Run: `$PY manage.py test services.agents services.connectors --parallel auto --noinput`
Expected: OK. If `test_outside_queries` moves, leave it for Task 13 only if it still passes; it must pass here.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/metrics/models.py services/metrics/migrations/0018_agent_action_jira_comment.py services/agents/actions/jira_comments.py services/agents/registry.py services/agents/placeholders.py services/agents/bulk.py services/agents/bundle_payloads.py services/agents/outside/gates.py services/connectors/agent_access.py services/agents/tests/test_jira_comment_kind.py services/agents/tests/test_policy.py services/agents/tests/test_builder_framework.py services/connectors/tests/test_agent_access.py e2e/test_agent_outside_flow.py
git commit -m "feat(agents): jira.comment, an internal comment found again by its ref

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The agents may propose a Jira comment

**Files:**
- Modify: `services/agents/outside/offered.py`, `services/agents/prompt.py` (`PAYLOADS`, `OUTSIDE_RULES`, `OUTSIDE_COMMON`)
- Modify: `services/agents/tests/test_outside_proposals.py` (`test_what_each_context_offers`), `services/agents/tests/test_outside_tools.py` (`test_each_thread_offers_its_own_outside_kinds`)
- Test: `services/agents/tests/test_outside_proposals.py` (append)

**Interfaces:**
- Consumes: `jira_comments.COMMENT` (Task 6).
- Produces: `offered(ctx)` holds `"jira.comment"` when `ctx.jira_connector` is set and `ctx.thread_id` is not None.

- [ ] **Step 1: Write the failing tests**

In `test_what_each_context_offers`, the two thread contexts now offer the comment and the nightly one doesn't:

```python
self.assertEqual(
    offered(mail_ctx), {"mail.send_reply", "jira.create", "jira.assign", "jira.comment"}
)
self.assertEqual(offered(slack_ctx), {"slack.reply", "jira.create", "jira.assign", "jira.comment"})
...
self.assertEqual(offered(nightly), {"jira.create", "jira.assign"})
```

In `test_outside_tools.py` `test_each_thread_offers_its_own_outside_kinds`: `self.assertEqual(offered(jira_ctx), {"jira.create", "jira.assign", "jira.comment"})`.

Append to `OutsideProposalTests` in `test_outside_proposals.py`:

```python
def jira_comment(self, ctx, body, issue="source"):
    return {
        "kind": "jira.comment",
        "record": ctx.thread_ref,
        "title": "Tell engineering",
        "rationale": "There is a new detail.",
        "evidence": [self.thread_line(ctx, "ticket ")],
        "payload": {"issue": issue, "body": body},
    }


def test_a_jira_thread_gets_a_comment_on_its_own_issue(self):
    board = self.jira_connector(department="cs")
    _, thread = self.jira_thread(self.pizza, board, key="SUP-12")
    ctx, _ = self.thread_ctx(thread)
    _, model = self.run_intake(self.answer(self.jira_comment(ctx, "Seen on Chrome too.")))
    self.assertIn("A jira.comment adds an internal comment", model.call_args.kwargs["system"])
    stored = AgentAction.objects.get(kind="jira.comment")
    self.assertEqual(
        stored.payload, {"connector_id": board.pk, "issue": "SUP-12", "body": "Seen on Chrome too."}
    )


def test_a_comment_naming_something_internal_is_dropped(self):
    self.task("Escalate the billing dispute")
    board = self.jira_connector(department="cs")
    _, thread = self.jira_thread(self.pizza, board, key="SUP-12")
    ctx, _ = self.thread_ctx(thread)
    self.run_intake(self.answer(self.jira_comment(ctx, "We will Escalate the billing dispute.")))
    self.assertFalse(AgentAction.objects.filter(kind="jira.comment").exists())


def test_the_same_comment_without_the_task_is_kept(self):
    # The positive twin of the test above: the same world, a clean body.
    self.task("Escalate the billing dispute")
    board = self.jira_connector(department="cs")
    _, thread = self.jira_thread(self.pizza, board, key="SUP-12")
    ctx, _ = self.thread_ctx(thread)
    self.run_intake(self.answer(self.jira_comment(ctx, "Seen again today.")))
    self.assertTrue(AgentAction.objects.filter(kind="jira.comment").exists())
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_outside_proposals services.agents.tests.test_outside_tools --parallel auto --noinput`
Expected: FAIL: `jira.comment` is not offered, so the model's comment is dropped.

- [ ] **Step 3: Offer and explain it**

`services/agents/outside/offered.py`:

```python
    if ctx.jira_connector is not None:
        kinds |= {K.JIRA_CREATE, K.JIRA_ASSIGN}
        if ctx.thread_id is not None:
            # R2D1-2: a comment answers a conversation, never the nightly pass.
            kinds.add(K.JIRA_COMMENT)
    return kinds
```

(and the docstring: "... Jira wherever the workspace has a Jira connector, a Jira comment only on a conversation.")

`services/agents/prompt.py`: in `PAYLOADS`, after `"jira.assign"`:

```python
    "jira.comment": '{"issue": "source" (this conversation\'s own Jira issue) or "{{step '
    'N.ticket_key}}" (an issue an earlier jira.create makes), "body": <the comment, plain '
    "text, at most 2000 characters>}",
```

In `OUTSIDE_RULES`, after `"jira.assign"`:

```python
    "jira.comment": "A jira.comment adds an internal comment to a Jira issue for the team "
    'that fixes things: "source" is this conversation\'s own Jira issue; say only what is new.',
```

In `OUTSIDE_COMMON`, the first line's "(a reply, a Slack message, a Jira issue)" becomes "(a reply, a Slack message, a Jira issue or comment)".

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: OK (`test_intake_queries`' `THREAD_RUN_QUERIES` unchanged: offering reads nothing new).

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/outside/offered.py services/agents/prompt.py services/agents/tests/test_outside_proposals.py services/agents/tests/test_outside_tools.py
git commit -m "feat(agents): the intake may propose a Jira comment on a conversation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: A reply found again says truly whether it threaded

**Files:**
- Modify: `services/mail/agent_send.py` (`_reply`, `find`), `services/mail/providers/microsoft.py` (`find_sent`), `services/agents/outside/tools.py` (`MailTool.find`), `services/agents/actions/mail_replies.py` (`apply`), `services/agents/tests/outside_fakes.py` (`FakeMail.find`), `services/mail/tests/graph_fake.py` (Sent Items rows)
- Test: `services/mail/tests/test_agent_send.py` (append)

**Interfaces:**
- Produces: `agent_send.find(connection, *, key, since, source=None) -> SentReply | None` with `threaded` true when the found message's thread equals the thread of `connection`'s copy of `source`; `MicrosoftProvider.find_sent(...) -> (dict | None, creds)` (the item `{"id", "conversationId"}`); `MailTool.find(connection, *, key, since, source=None)`.

- [ ] **Step 1: Write the failing tests**

Append to `AgentSendTests` in `services/mail/tests/test_agent_send.py`:

```python
def held_copy(self, connection, source, thread_id):
    """`connection`'s own copy of the filed `source`, in `thread_id`."""
    return MailMessage.objects.create(
        connection=connection,
        owner=connection.user,
        organisation=connection.organisation,
        provider_message_id=f"copy-{source.pk}",
        direction=MailMessage.Direction.RECEIVED,
        from_address=source.from_address,
        subject=source.subject,
        sent_at=source.sent_at,
        rfc_message_id=source.provider_message_id,
        thread_id=thread_id,
        email=source,
    )


def test_a_gmail_reply_found_again_in_its_thread_says_so(self):
    # Round 2 D1 contract R2D1-12.
    self.use_gmail("carl@acme.io")
    connection = self.google(self.carl)
    source = self.source(connection)
    self.held_copy(connection, source, "thread-1")
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
    self.assertTrue(sent.threaded)
    found = agent_send.find(connection, key="b12-s41", since=since, source=source)
    self.assertTrue(found.threaded)
    unheld = agent_send.find(connection, key="b12-s41", since=since)
    self.assertFalse(unheld.threaded)


def test_an_outlook_reply_found_again_reads_its_conversation(self):
    graph = use_graph(self)
    connection = outlook_connection(self.carl)
    source = self.source(connection)
    self.held_copy(connection, source, "conv-1")
    since = timezone.now() - timedelta(minutes=10)
    agent_send.send(
        connection,
        source=source,
        to=["ann@pizzahut.com"],
        cc=[],
        subject="Re: Login loop",
        body="Hi",
        key="b12-s41",
    )
    graph.sent[-1]["conversationId"] = "conv-1"
    found = agent_send.find(connection, key="b12-s41", since=since, source=source)
    self.assertTrue(found.threaded)
    graph.sent[-1]["conversationId"] = "conv-other"
    self.assertFalse(
        agent_send.find(connection, key="b12-s41", since=since, source=source).threaded
    )
```

(The Gmail fake files a sent message in the `threadId` it was sent with; `agent_send.send` sends with the held copy's `thread-1` because `answering_headers` returns it for a copy in this very mailbox.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.mail.tests.test_agent_send --parallel auto --noinput`
Expected: FAIL/ERROR: `find()` takes no `source`; `found.threaded` is False.

- [ ] **Step 3: The lookups return their thread**

`services/mail/tests/graph_fake.py`: in the `sendMail` branch's `self.sent.append({...})` add `"conversationId": ""`; in the Sent Items branch return `{"value": [{"id": m["id"], "conversationId": m.get("conversationId", "")} for m in rows]}`.

`services/mail/providers/microsoft.py`, `find_sent`: `"$select": "id,conversationId",` and

```python
        for item in page.get("value", []):
            return item, creds
        return None, creds
```

with the docstring's first line "(the Sent Items item `{"id", "conversationId"}` stamped ...".

`services/mail/agent_send.py`: replace `_reply` and update `find`:

```python
def _home_thread(connection, source):
    """The thread of `connection`'s own copy of `source`, or ""."""
    if source is None:
        return ""
    return (
        MailMessage.objects.filter(connection=connection, email=source)
        .values_list("thread_id", flat=True)
        .first()
        or ""
    )


def _reply(connection, email, provider_id, thread_id="", source=None):
    """A reply found again (D3-11): its filed copy, the owner's own copy, and
    whether it sits in the source's thread in this mailbox (R2D1-12)."""
    message = (
        MailMessage.objects.filter(connection=connection, provider_message_id=provider_id)
        .values_list("pk", flat=True)
        .first()
    )
    home = _home_thread(connection, source)
    return SentReply(
        email_id=email.pk if email is not None else None,
        message_id=message,
        provider_id=provider_id,
        threaded=bool(thread_id) and thread_id == home,
        address=connection.address,
        provider=connection.provider,
    )
```

`find(connection, *, key, since, source=None)`: the Gmail branch returns `_reply(connection, email, stub["id"], stub.get("threadId", ""), source)`; the Outlook branch:

```python
    if found is None:
        return None
    email = Email.objects.filter(mailbox=connection, provider_message_id=found["id"]).first()
    return _reply(connection, email, found["id"], found.get("conversationId", ""), source)
```

`services/agents/outside/tools.py`, `MailTool.find(self, connection, *, key, since, source=None)` passes `source=source` on. `services/agents/tests/outside_fakes.py`, `FakeMail.find(self, connection, *, key, since, source=None)` (unchanged otherwise). `services/agents/actions/mail_replies.py`, `apply`: `found = tool.find(connection, key=key, since=keys.since(action), source=source)`.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.mail services.agents.tests.test_mail_reply_kind --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/mail/agent_send.py services/mail/providers/microsoft.py services/mail/tests/graph_fake.py services/agents/outside/tools.py services/agents/actions/mail_replies.py services/agents/tests/outside_fakes.py services/mail/tests/test_agent_send.py
git commit -m "fix(mail): a reply found again records whether it threaded

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Outlook replies thread through Graph's reply

**Files:**
- Modify: `services/mail/providers/base.py` (`Message.threaded`), `services/mail/providers/google.py` (`send` sets it), `services/mail/providers/microsoft.py` (`held`, `_reply`, `send`), `services/mail/sync.py` (`send_via_provider`, `reply_to`), `services/mail/agent_send.py` (`send`), `services/agents/actions/mail_replies.py` (`preview`), `services/mail/tests/graph_fake.py`
- Test: `services/mail/tests/test_outlook_threading.py` (create)

**Interfaces:**
- Produces: `Message.threaded: bool = False` (the provider placed it in the original's conversation); `MicrosoftProvider.held(creds, internet_message_id) -> tuple[str, str] | None`; `MicrosoftProvider.send(..., in_thread=False)`, which `sync.send_via_provider` and `sync.reply_to` switch on for an Outlook reply to the original's sender (Step 4). `FakeGraph.held` (rfc id → `(graph id, conversationId)`), `FakeGraph.replies` (`{"id", "message"}` per reply), `FakeGraph.reply_gone`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_outlook_threading.py`:

```python
"""Outlook replies thread (agent bundles round 2 D1 contract R2D1-13,
R2D1-14): when the mailbox holds the source and the reply goes to its
sender, Graph's reply is used (In-Reply-To and the conversation set by
Graph), carrying the step's stamp; otherwise sendMail, as before. Graph is
a fake."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Email
from services.mail import agent_send, sync
from services.mail.models import MailMessage
from services.mail.providers.microsoft import STAMP_GUID
from services.mail.tests.gmail_fixtures import GmailFixture
from services.mail.tests.graph_fake import outlook_connection, use_graph

STAMP = f"String {{{STAMP_GUID}}} Name x-revenact-step"


class OutlookThreadingTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.graph = use_graph(self)
        self.connection = outlook_connection(self.carl)
        self.source = Email.objects.create(
            customer=self.pizza,
            subject="Login loop",
            sender_name="Ann Lee",
            recipient_name=self.carl.name,
            body="We can't log in.",
            sent_at=timezone.now() - timedelta(hours=1),
            mailbox=self.connection,
            mailbox_owner=self.carl,
            direction=Email.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            to_addresses=[self.connection.address],
            thread_id="conv-1",
            provider_message_id="graph-orig",
        )

    def hold(self):
        MailMessage.objects.create(
            connection=self.connection,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="graph-orig",
            direction=MailMessage.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            subject="Login loop",
            sent_at=self.source.sent_at,
            rfc_message_id="<m1@pizzahut.com>",
            thread_id="conv-1",
            email=self.source,
        )
        self.graph.held["<m1@pizzahut.com>"] = ("graph-orig", "conv-1")

    def send(self, to=("ann@pizzahut.com",), cc=()):
        return agent_send.send(
            self.connection,
            source=self.source,
            to=list(to),
            cc=list(cc),
            subject="Re: Login loop",
            body="We're on it.",
            key="b12-s41",
        )

    def test_a_held_source_answered_to_its_sender_is_a_graph_reply(self):
        self.hold()
        sent = self.send(cc=["ops@pizzahut.com"])
        [reply] = self.graph.replies
        self.assertEqual(reply["id"], "graph-orig")
        message = reply["message"]
        self.assertNotIn("toRecipients", message)
        self.assertEqual(
            (message["subject"], message["body"], message["ccRecipients"]),
            (
                "Re: Login loop",
                {"contentType": "Text", "content": "We're on it."},
                [{"emailAddress": {"address": "ops@pizzahut.com"}}],
            ),
        )
        self.assertEqual(
            message["singleValueExtendedProperties"], [{"id": STAMP, "value": "b12-s41"}]
        )
        self.assertNotIn("internetMessageHeaders", message)
        self.assertEqual(self.graph.posted, [])  # no sendMail
        self.assertTrue(sent.threaded)
        since = timezone.now() - timedelta(minutes=10)
        found = agent_send.find(self.connection, key="b12-s41", since=since, source=self.source)
        self.assertTrue(found.threaded)

    def test_an_edited_to_keeps_send_mail(self):
        self.hold()
        sent = self.send(to=["boss@pizzahut.com"])
        self.assertEqual((self.graph.replies, len(self.graph.posted)), ([], 1))
        self.assertFalse(sent.threaded)

    def test_a_source_the_mailbox_doesnt_hold_keeps_send_mail(self):
        sent = self.send()
        self.assertEqual((self.graph.replies, len(self.graph.posted)), ([], 1))
        self.assertFalse(sent.threaded)

    def test_a_copy_gone_since_the_lookup_falls_back_to_send_mail(self):
        self.hold()
        self.graph.reply_gone = True
        self.send()
        self.assertEqual((self.graph.replies, len(self.graph.posted)), ([], 1))

    def test_a_persons_own_reply_threads_too(self):
        self.hold()
        sync.send_email(
            self.connection,
            to=["ann@pizzahut.com"],
            subject="Re: Login loop",
            body="Thanks Ann.",
            customer=self.pizza,
            answering=self.source,
        )
        [reply] = self.graph.replies
        self.assertNotIn("singleValueExtendedProperties", reply["message"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.mail.tests.test_outlook_threading --parallel auto --noinput`
Expected: ERROR: `FakeGraph` has no `held`.

- [ ] **Step 3: The fake learns the lookup and the reply**

`services/mail/tests/graph_fake.py`, `FakeGraph.__init__`: `self.held = {}`, `self.replies = []`, `self.reply_gone = False`. In `__call__`, before the `sendMail` branch:

```python
if parts.path.endswith("/me/messages") and method == "GET":
    query = {k: v[0] for k, v in parse_qs(parts.query).items()}
    wanted = re.search(r"internetMessageId eq '((?:[^']|'')*)'", query["$filter"])
    rfc = wanted.group(1).replace("''", "'") if wanted else ""
    found = self.held.get(rfc)
    return {"value": [{"id": found[0], "conversationId": found[1]}] if found else []}
replying = re.search(r"/me/messages/([^/]+)/reply$", parts.path)
if replying and method == "POST":
    target = unquote(replying.group(1))
    if self.reply_gone or target not in {gid for gid, _ in self.held.values()}:
        raise ProviderError("404 from graph.microsoft.com", status=404)
    if self._refuse:
        status, reauth = self._refuse
        self._refuse = None
        raise ProviderError(f"{status} from graph.microsoft.com", reauth=reauth, status=status)
    message = data["message"]
    self.replies.append({"id": target, "message": message})
    conversation = next(c for gid, c in self.held.values() if gid == target)
    self.sent.append(
        {
            "id": f"graph-{len(self.sent) + 1}",
            "to": [],
            "cc": [r["emailAddress"]["address"] for r in message.get("ccRecipients", [])],
            "subject": message["subject"],
            "body": message["body"]["content"],
            "internetMessageHeaders": [],
            "properties": {
                p["id"]: p["value"] for p in message.get("singleValueExtendedProperties", [])
            },
            "sentDateTime": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "conversationId": conversation,
        }
    )
    if self._drop:
        self._drop = False
        raise SendUnconfirmed("Graph did not answer")
    return {}
```

(add `unquote` to the `urllib.parse` import; update the docstring: "the Message-ID lookup and reply, ...").

- [ ] **Step 4: Graph's reply, used when it threads**

`services/mail/providers/base.py`, `Message`: add after `label_ids`:

```python
    #: The provider placed it in the original's own conversation (Gmail's
    #: threadId; Graph's reply). Round 2 D1 R2D1-12, R2D1-13.
    threaded: bool = False
```

`services/mail/providers/google.py`, `send`: the returned `Message(...)` gains `threaded=bool(thread_id),`.

`services/mail/providers/microsoft.py`: add `import http.client` (already) and `from urllib.parse import quote, urlencode`; in `MicrosoftProvider`:

```python
def held(self, creds, internet_message_id):
    """(Graph id, conversationId) of this mailbox's copy of the message
    with that Message-ID, or None (R2D1-13). Only a lost grant is raised:
    anything else reads as not held, and the send falls back to sendMail."""
    quoted = internet_message_id.replace("'", "''")
    params = urlencode(
        {
            "$filter": f"internetMessageId eq '{quoted}'",
            "$select": "id,conversationId",
            "$top": "1",
        }
    )
    try:
        page = http_json(
            "GET",
            f"{GRAPH}/me/messages?{params}",
            headers=self._auth(creds),
            timeout=settings.AGENT_TOOL_TIMEOUT_SECONDS,
        )
    except ProviderError as exc:
        if exc.reauth:
            raise
        return None
    except (OSError, http.client.HTTPException):
        return None
    for item in page.get("value", []):
        if item.get("id"):
            return item["id"], item.get("conversationId", "")
    return None


def _reply(self, creds, held, *, to, subject, body, cc, headers):
    """Graph's reply to the held copy; None when it is gone (404: nothing sent)."""
    graph_id, conversation = held
    message = {"subject": subject, "body": {"contentType": "Text", "content": body}}
    if cc:
        message["ccRecipients"] = [{"emailAddress": {"address": a}} for a in cc]
    if headers:
        # The stamp only (R2D1-14): a Retry's Sent Items lookup reads it.
        message["singleValueExtendedProperties"] = [
            {"id": _stamp_id(name), "value": value} for name, value in headers.items()
        ]
    try:
        http_json(
            "POST",
            f"{GRAPH}/me/messages/{quote(graph_id, safe='')}/reply",
            headers=self._auth(creds),
            data={"message": message},
        )
    except ProviderError as exc:
        if exc.status == 404:
            return None
        raise
    return Message(
        provider_id="",
        thread_id=conversation,
        subject=subject,
        from_address=creds.address,
        from_name=creds.display_name,
        to=[("", a.lower()) for a in to],
        date=datetime.now(timezone.utc),
        body=body,
        threaded=True,
    )
```

`send` gains `in_thread=False` and, right after `creds = self._fresh(creds)`:

```python
        # R2D1-13: In-Reply-To through Graph's reply when this mailbox holds
        # the original and the reply goes to its sender (Graph adds recipients
        # to a reply's own, so To is never passed).
        if in_thread and in_reply_to:
            held = self.held(creds, in_reply_to)
            if held is not None:
                replied = self._reply(
                    creds, held, to=to, subject=subject, body=body, cc=cc, headers=headers
                )
                if replied is not None:
                    return replied
```

(and the comment "Graph's sendMail sets only "x-" headers: In-Reply-To can't be sent." stays above the sendMail code.)

`services/mail/sync.py`, `send_via_provider`, after `extra = send_kwargs(...)`:

```python
    sender = (getattr(answering, "from_address", "") or "").lower()
    if (
        connection.provider == MailboxConnection.Provider.MICROSOFT
        and in_reply_to
        and sender
        and [a.lower() for a in to] == [sender]
    ):
        extra["in_thread"] = True
```

`reply_to`, the unfiled path, after `in_reply_to, references, thread_id = answering_headers(...)`:

```python
    extra = send_kwargs(connection, in_reply_to, references, thread_id)
    if (
        connection.provider == MailboxConnection.Provider.MICROSOFT
        and in_reply_to
        and to == [original.from_address]
    ):
        extra["in_thread"] = True
    message = provider.send(creds, to=to, subject=subject, body=body, **extra)
```

(check `MailboxConnection` is imported in `sync.py`; it is used there already.)

`services/mail/agent_send.py`, `send`: remove the `threaded = bool(answering_headers(...)[2])` line and its comment, and in the returned `SentReply` use `threaded=message.threaded`. Drop `answering_headers` from the import when nothing else uses it.

`services/agents/actions/mail_replies.py`, `preview`, the waiting branch:

```python
threaded = (
    able
    and connection.provider
    in (MailboxConnection.Provider.GOOGLE, MailboxConnection.Provider.MICROSOFT)
    and connection.pk == payload.get("mailbox_id")
)
```

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.mail services.agents.tests.test_mail_reply_kind --parallel auto --noinput`
Expected: OK. `test_a_persons_outlook_send_posts_only_what_it_did_before` still passes (no held copy there: sendMail).

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/mail/providers/base.py services/mail/providers/google.py services/mail/providers/microsoft.py services/mail/sync.py services/mail/agent_send.py services/agents/actions/mail_replies.py services/mail/tests/graph_fake.py services/mail/tests/test_outlook_threading.py
git commit -m "feat(mail): Outlook replies thread through Graph's reply

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: One home for signatures; Outlook and every send that skips a draft are signed

**Files:**
- Create: `services/mail/signing.py`
- Modify: `services/mail/agent_send.py` (`_bodies`), `services/mail/sync.py` (`send_via_provider`, `send_email`, `reply_to`)
- Test: `services/mail/tests/test_signing.py` (create)

**Interfaces:**
- Produces: `signing.LIMIT = 1000`, `signing.LINES = 10`; `signing.text(connection) -> str` (the signature as text, `""` when none); `signing.stored(text) -> str` (HTML paragraphs for `signature_html`); `signing.signed(connection, body, markup="") -> tuple[str, str]` (html, text); `sync.send_via_provider(..., sign=False)`; `sync.send_email` always signs and files what was sent.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_signing.py`:

```python
"""Signatures (agent bundles round 2 D1 contract R2D1-15, R2D1-17): Gmail's
send-as signature in HTML and text, an Outlook signature written in Revenact
in text, nothing for IMAP, nothing twice. Gmail and Graph are fakes."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Email
from services.mail import agent_send, send_as, signing, sync
from services.mail.models import MailboxConnection, MailMessage
from services.mail.tests.gmail_fixtures import GmailFixture
from services.mail.tests.graph_fake import outlook_connection, use_graph

GMAIL_SIGNATURE = '<div>Carl CSM<br><img src="https://acme.io/logo.png" alt="Acme"></div>'


class SignedTests(GmailFixture):
    def outlook(self, text="Carl CSM\nAcme"):
        connection = outlook_connection(self.carl)
        connection.signature_html = signing.stored(text)
        connection.save(update_fields=["signature_html"])
        return connection

    def test_gmail_signs_in_html_and_text(self):
        connection = self.google(self.carl, signature_html=GMAIL_SIGNATURE)
        markup, text = signing.signed(connection, "Thanks Ann.")
        self.assertEqual(markup, "<p>Thanks Ann.</p>" + send_as.signature_block(connection))
        self.assertEqual(text, "Thanks Ann.\n\n-- \nCarl CSM")

    def test_outlook_signs_in_text(self):
        connection = self.outlook()
        self.assertEqual(signing.text(connection), "Carl CSM\nAcme")
        self.assertEqual(signing.signed(connection, "Hi"), ("", "Hi\n\n-- \nCarl CSM\nAcme"))

    def test_nothing_without_a_signature_or_twice_or_for_imap(self):
        bare = outlook_connection(self.carl)
        self.assertEqual(signing.signed(bare, "Hi"), ("", "Hi"))
        signed = self.outlook()
        self.assertEqual(signing.signed(signed, "Hi\n\n-- \nOld"), ("", "Hi\n\n-- \nOld"))
        signed.provider = MailboxConnection.Provider.IMAP
        self.assertEqual(signing.signed(signed, "Hi"), ("", "Hi"))

    def test_an_agents_outlook_reply_is_signed(self):
        graph = use_graph(self)
        connection = self.outlook()
        source = Email.objects.create(
            customer=self.pizza,
            subject="Login loop",
            sender_name="Ann Lee",
            body="We can't log in.",
            sent_at=timezone.now() - timedelta(hours=1),
            mailbox=connection,
            mailbox_owner=self.carl,
            direction=Email.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            to_addresses=[connection.address],
            thread_id="conv-1",
            provider_message_id="graph-orig",
        )
        agent_send.send(
            connection,
            source=source,
            to=["ann@pizzahut.com"],
            cc=[],
            subject="Re: Login loop",
            body="We're on it.",
            key="b12-s41",
        )
        self.assertEqual(graph.posted[-1]["body"]["content"], "We're on it.\n\n-- \nCarl CSM\nAcme")

    def test_a_persons_gmail_send_without_a_draft_is_signed_and_filed_as_sent(self):
        gmail = self.use_gmail("carl@acme.io")
        connection = self.google(self.carl, signature_html=GMAIL_SIGNATURE)
        email = sync.send_email(
            connection,
            to=["ann@pizzahut.com"],
            subject="Hello",
            body="Thanks Ann.",
            customer=self.pizza,
        )
        message = gmail.uploads[-1][3]
        html = message.get_body(("html",)).get_content()
        self.assertIn("data-revenact-signature", html)
        self.assertIn('src="https://acme.io/logo.png"', html)
        self.assertTrue(message.get_body(("plain",)).get_content().rstrip().endswith("Carl CSM"))
        self.assertEqual(email.body, "Thanks Ann.\n\n-- \nCarl CSM")

    def test_a_persons_outlook_reply_from_the_inbox_is_signed(self):
        graph = use_graph(self)
        connection = self.outlook()
        original = MailMessage.objects.create(
            connection=connection,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="graph-x",
            direction=MailMessage.Direction.RECEIVED,
            from_address="sam@unknown.io",
            subject="Hello",
            sent_at=timezone.now(),
        )
        sync.reply_to(original, "Thanks Sam.")
        self.assertEqual(graph.posted[-1]["body"]["content"], "Thanks Sam.\n\n-- \nCarl CSM\nAcme")
```

(`google_connection` takes extra model fields as keyword arguments, as `DraftFixture` does with `signature_html=`.)

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.mail.tests.test_signing --parallel auto --noinput`
Expected: ERROR: `cannot import name 'signing'`.

- [ ] **Step 3: The helper**

Create `services/mail/signing.py`:

```python
"""A person's signature on a send (agent bundles round 2 D1 contract R2D1-15
to R2D1-17). Gmail's is read from Gmail (send_as) and goes out in HTML and
text; an Outlook mailbox's is written by its owner in Revenact (Graph has no
signature API) and goes out in text; IMAP has none in round 2. A text that
already carries a "-- " signature (a mirrored draft) is never signed twice.
A draft carries its own signature block from when it was made (Gmail D3
decision 17): only sends that skip a draft come through here."""

from . import html, send_as
from .models import MailboxConnection

LIMIT = 1000
LINES = 10
SEPARATOR = "\n-- \n"


def text(connection):
    """The signature as text, "" when there is none."""
    return html.to_text(connection.signature_html).strip() if connection.signature_html else ""


def stored(value):
    """An Outlook signature's text as the HTML kept in `signature_html`."""
    return html.paragraphs(value)


def _already(body):
    return body.startswith("-- \n") or SEPARATOR in body


def signed(connection, body, markup=""):
    """(html, text) for sending `body` from `connection`. `markup` is the
    HTML the caller already built ("" for a text-only send)."""
    if not connection.signature_html or _already(body):
        return markup, body
    signature = text(connection)
    plain = f"{body}\n\n-- \n{signature}" if signature else body
    if connection.is_google:
        return (markup or html.paragraphs(body)) + send_as.signature_block(connection), plain
    if connection.provider == MailboxConnection.Provider.MICROSOFT:
        return markup, plain
    return markup, body
```

- [ ] **Step 4: Every send goes through it**

`services/mail/agent_send.py`: import `signing`; `_bodies` becomes

```python
def _bodies(connection, body):
    """(html, text): the runner's signature under the body (D3-3, R2D1-15)."""
    markup = html_mod.paragraphs(body) if connection.is_google else ""
    return signing.signed(connection, body, markup)
```

(drop the `send_as` import if nothing else in the module uses it).

`services/mail/sync.py`: `from . import signing` (check for a cycle: `signing` imports `html`, `send_as`, `models` only; `send_as` imports `gmail_sync`, which does not import `sync`). `send_via_provider` gains `sign=False` and, first thing in its body:

```python
    if sign:
        # R2D1-17: a send that skips a draft carries the person's signature.
        html, body = signing.signed(connection, body, html)
```

`send_email`: pass `sign=True` to `send_via_provider`, and file what went out: `body=message.body or body` in the `file_sent(...)` call. `reply_to`'s unfiled path, before `provider.send(...)`:

```python
    markup, body = signing.signed(connection, body)
    if markup and connection.is_google:
        extra["html"] = markup
```

(with `extra` as built in Task 9; its filed path goes through `send_email`, which signs).

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.mail services.customers services.agents.tests.test_mail_reply_kind --parallel auto --noinput`
Expected: OK. A test that pinned an unsigned body for a mailbox that has a signature is a real behaviour change (R2D1-17): fix the test's expectation only when the fixture's mailbox has `signature_html` set, and note each such test in the commit body.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/mail/signing.py services/mail/agent_send.py services/mail/sync.py services/mail/tests/test_signing.py
git commit -m "feat(mail): one signing rule for agent replies and sends without a draft

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: A person writes their Outlook signature (`PATCH /mail/connection/`)

**Files:**
- Modify: `services/mail/views.py` (`MyMailboxView.patch`), `services/mail/serializers.py` (`connection_payload`)
- Modify: `services/mail/tests/test_my_mailbox.py` (`CONNECTION_KEYS` gains `"signature"`)
- Test: `services/mail/tests/test_mailbox_signature.py` (create)

**Interfaces:**
- Consumes: `signing.text`, `signing.stored`, `signing.LIMIT`, `signing.LINES` (Task 10).
- Produces: `connection.signature` (`{"text", "editable", "source"}` or null); `PATCH /api/v1/mail/connection/` (contract §4.3).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_mailbox_signature.py`:

```python
"""The mailbox's signature (agent bundles round 2 D1 contract §4.3,
R2D1-15): an Outlook mailbox's owner writes it; Gmail's is read from Gmail;
IMAP has none. Only the caller's own mailbox."""

from django.test import override_settings

from services.mail import signing
from services.mail.models import MailboxConnection
from services.mail.tests.gmail_fixtures import GmailFixture
from services.mail.tests.graph_fake import outlook_connection

URL = "/api/v1/mail/connection/"


@override_settings(GOOGLE_OAUTH_CLIENT_ID="cid", GOOGLE_OAUTH_CLIENT_SECRET="sec")
class MailboxSignatureTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.carl)

    def patch(self, value):
        return self.client.patch(URL, {"signature": value}, format="json")

    def test_outlook_writes_reads_and_clears_it(self):
        connection = outlook_connection(self.carl)
        self.assertEqual(
            self.client.get(URL).data["connection"]["signature"],
            {"text": "", "editable": True, "source": "revenact"},
        )
        answer = self.patch("Carl CSM  \nAcme\n\n")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(answer.json()["connection"]["signature"]["text"], "Carl CSM\nAcme")
        connection.refresh_from_db()
        self.assertEqual(connection.signature_html, signing.stored("Carl CSM\nAcme"))
        self.assertEqual(self.patch("").json()["connection"]["signature"]["text"], "")

    def test_refusals_in_order(self):
        self.assertEqual(
            (self.patch("Hi").status_code, self.patch("Hi").json()),
            (404, {"detail": "Connect your mailbox first."}),
        )
        outlook_connection(self.carl)
        self.assertEqual(
            self.client.patch(URL, {"signature": 3}, format="json").json(),
            {"signature": ["Write a signature, or leave it empty."]},
        )
        self.assertEqual(
            self.patch("x" * 1001).json(),
            {"signature": ["Keep the signature under 1000 characters."]},
        )
        self.assertEqual(
            self.patch("\n".join(["line"] * 11)).json(),
            {"signature": ["Keep the signature to 10 lines."]},
        )

    def test_gmail_is_read_only_here(self):
        self.google(self.carl, signature_html="<div>Carl from Gmail</div>")
        self.assertEqual(
            self.client.get(URL).data["connection"]["signature"],
            {"text": "Carl from Gmail", "editable": False, "source": "gmail"},
        )
        answer = self.patch("Mine")
        self.assertEqual(
            (answer.status_code, answer.json()),
            (
                409,
                {
                    "code": "SIGNATURE_IN_GMAIL",
                    "detail": "Change your signature in Gmail. Revenact uses it from there.",
                },
            ),
        )

    def test_imap_has_none(self):
        connection = outlook_connection(self.carl)
        MailboxConnection.objects.filter(pk=connection.pk).update(
            provider=MailboxConnection.Provider.IMAP
        )
        self.assertIsNone(self.client.get(URL).data["connection"]["signature"])
        self.assertEqual(self.patch("Mine").json()["code"], "NO_SIGNATURE")
```

In `services/mail/tests/test_my_mailbox.py` add `"signature",` to `CONNECTION_KEYS`.

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.mail.tests.test_mailbox_signature services.mail.tests.test_my_mailbox --parallel auto --noinput`
Expected: FAIL: no `signature` key; PATCH 405.

- [ ] **Step 3: The payload and the route**

`services/mail/serializers.py`: `from . import gates, outbox, scopes, signing`; in `connection_payload`'s `data.update({...})` add `"signature": signature_payload(connection),` and add:

```python
def signature_payload(connection):
    """The mailbox's signature (round 2 D1 contract §4.3): Gmail's, read only;
    an Outlook one its owner writes; none for IMAP."""
    if connection.is_google:
        return {"text": signing.text(connection), "editable": False, "source": "gmail"}
    if connection.provider == MailboxConnection.Provider.MICROSOFT:
        return {"text": signing.text(connection), "editable": True, "source": "revenact"}
    return None
```

`services/mail/views.py`, `MyMailboxView` (import `signing` with the module's other `from . import ...`), after `get`:

```python
NO_MAILBOX = "Connect your mailbox first."
WRITE_ONE = "Write a signature, or leave it empty."
TOO_LONG = "Keep the signature under 1000 characters."
TOO_MANY_LINES = "Keep the signature to 10 lines."


def patch(self, request):
    """PATCH /api/v1/mail/connection/ {signature}: an Outlook mailbox's
    signature, written by its owner (round 2 D1 contract §4.3)."""
    # SOC2:AUTH-02 only the caller's own mailbox
    connection = gates.live_mailbox(request.user)
    if connection is None:
        return Response({"detail": self.NO_MAILBOX}, status=status.HTTP_404_NOT_FOUND)
    value = request.data.get("signature") if isinstance(request.data, dict) else None
    if not isinstance(value, str):
        return Response({"signature": [self.WRITE_ONE]}, status=status.HTTP_400_BAD_REQUEST)
    lines = [line.rstrip() for line in value.replace("\r\n", "\n").strip().split("\n")]
    text = "\n".join(lines)
    if len(text) > signing.LIMIT:
        return Response({"signature": [self.TOO_LONG]}, status=status.HTTP_400_BAD_REQUEST)
    if len(lines) > signing.LINES:
        return Response({"signature": [self.TOO_MANY_LINES]}, status=status.HTTP_400_BAD_REQUEST)
    if connection.is_google:
        return Response(
            {
                "code": "SIGNATURE_IN_GMAIL",
                "detail": "Change your signature in Gmail. Revenact uses it from there.",
            },
            status=status.HTTP_409_CONFLICT,
        )
    if connection.provider != MailboxConnection.Provider.MICROSOFT:
        return Response(
            {"code": "NO_SIGNATURE", "detail": "Signatures are for Outlook mailboxes here."},
            status=status.HTTP_409_CONFLICT,
        )
    connection.signature_html = signing.stored(text) if text else ""
    connection.save(update_fields=["signature_html", "updated_at"])
    return Response({"connection": connection_payload(connection)})
```

(`connection_payload` and `MailboxConnection` are imported in `views.py` already; check with grep and add what's missing.) Add the route's shape to the class docstring ("PATCH writes an Outlook mailbox's signature").

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/mail/views.py services/mail/serializers.py services/mail/tests/test_mailbox_signature.py services/mail/tests/test_my_mailbox.py
git commit -m "feat(mail): an Outlook mailbox's owner writes its signature

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The Gmail signature stays whole in an edited draft

**Files:**
- Modify: `services/mail/html.py` (`restore_signature`), `services/mail/drafts.py` (`clean`, `create_from_request`, `edit`)
- Test: `services/mail/tests/test_html.py` (append), `services/mail/tests/test_draft_signature.py` (create)

**Interfaces:**
- Produces: `html.restore_signature(markup, block) -> str`; `drafts.clean(data, *, user, kind, source_id, base, linked=False, connection=None)`.

- [ ] **Step 1: Write the failing tests**

Append to `services/mail/tests/test_html.py` (a `SimpleTestCase` module; add the class at the end, `from services.mail import html` is its import already, else add it):

```python
class RestoreSignatureTests(SimpleTestCase):
    """Round 2 D1 contract R2D1-16."""

    BLOCK = '<div data-revenact-signature=""><div>Dana<br><img src="https://dough.co/l.png"></div></div>'

    def test_the_block_is_replaced_nested_divs_and_all(self):
        edited = '<p>Hi</p><div data-revenact-signature="">Dana<div>x</div></div><p>after</p>'
        self.assertEqual(
            html.restore_signature(edited, self.BLOCK), f"<p>Hi</p>{self.BLOCK}<p>after</p>"
        )

    def test_no_block_stays_none(self):
        self.assertEqual(html.restore_signature("<p>Hi</p>", self.BLOCK), "<p>Hi</p>")

    def test_an_empty_signature_removes_the_block(self):
        edited = '<p>Hi</p><div data-revenact-signature="">Dana</div>'
        self.assertEqual(html.restore_signature(edited, ""), "<p>Hi</p>")
```

Create `services/mail/tests/test_draft_signature.py`:

```python
"""A Gmail draft edited in Revenact keeps its signature whole (agent bundles
round 2 D1 contract R2D1-16): the block the editor reduced to text is put
back from the mailbox's Gmail signature. Gmail is a fake."""

from services.mail import send_as
from services.mail.models import MailDraft

from .draft_fixtures import DraftFixture

RICH = '<div>Dana Ruiz<br><img src="https://dough.co/logo.png" alt="Dough Co"></div>'


class DraftSignatureTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.mailbox.signature_html = RICH
        self.mailbox.save(update_fields=["signature_html"])

    def test_an_edit_keeps_the_gmail_signature_whole(self):
        draft = self.new_draft()
        answer = self.patch_draft(
            draft["id"],
            {
                "html": '<p>Two years.</p><div data-revenact-signature="">Dana Ruiz</div>',
                "revision": draft["revision"],
            },
        )
        self.assertEqual(answer.status_code, 200, answer.data)
        stored = MailDraft.objects.get(pk=draft["id"]).html
        self.assertEqual(stored, "<p>Two years.</p>" + send_as.signature_block(self.mailbox))
        self.assertIn('src="https://dough.co/logo.png"', stored)

    def test_a_deleted_signature_stays_deleted(self):
        draft = self.new_draft()
        self.patch_draft(
            draft["id"], {"html": "<p>No signature.</p>", "revision": draft["revision"]}
        )
        self.assertEqual(MailDraft.objects.get(pk=draft["id"]).html, "<p>No signature.</p>")

    def test_a_new_draft_with_the_editors_block_is_whole_too(self):
        draft = self.new_draft(html='<p>Hi</p><div data-revenact-signature="">Dana Ruiz</div>')
        self.assertIn("dough.co/logo.png", MailDraft.objects.get(pk=draft["id"]).html)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.mail.tests.test_html services.mail.tests.test_draft_signature --parallel auto --noinput`
Expected: ERROR/FAIL: no `restore_signature`; the stored draft holds the reduced block.

- [ ] **Step 3: Put the block back**

`services/mail/html.py`, after `SIGNATURE_ATTR`'s neighbours (anywhere after `clean`):

```python
_SIGNATURE_OPEN = re.compile(rf"<div\b[^>]*\b{SIGNATURE_ATTR}\b[^>]*>", re.IGNORECASE)
_DIV = re.compile(r"<div\b[^>]*>|</div\s*>", re.IGNORECASE)


def restore_signature(markup, block):
    """`markup` (already sanitised) with its signature block, nested divs and
    all, replaced by `block`: the mailbox's signature as it is now (round 2
    D1 R2D1-16). No block, nothing to put back."""
    start = _SIGNATURE_OPEN.search(markup or "")
    if start is None:
        return markup
    depth, end = 0, len(markup)
    for tag in _DIV.finditer(markup, start.start()):
        depth += -1 if tag.group(0).startswith("</") else 1
        if depth == 0:
            end = tag.end()
            break
    return markup[: start.start()] + block + markup[end:]
```

`services/mail/drafts.py`: `clean(..., linked=False, connection=None)`; in its `if "html" in valid:` branch:

```python
    if "html" in valid:
        safe = html.clean(valid["html"])
        if connection is not None and connection.is_google:
            # R2D1-16: the editor keeps the block's place; Gmail's signature fills it.
            safe = html.restore_signature(safe, signature_block(connection))
        if len(safe.encode()) > settings.MAIL_HTML_MAX_BYTES:
            errors["html"] = [TOO_LONG]
        valid["html"] = safe
```

`create_from_request` passes `connection=connection` to `clean(...)`; `edit` passes `connection=draft.connection`.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/mail/html.py services/mail/drafts.py services/mail/tests/test_html.py services/mail/tests/test_draft_signature.py
git commit -m "fix(mail): an edited Gmail draft keeps its signature whole

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Query ceilings with a comment in the mix

**Files:**
- Modify: `services/agents/tests/test_outside_queries.py`
- Test: the same

**Interfaces:**
- Produces: `OUTSIDE_DETAIL_QUERIES`, `OUTSIDE_HISTORY_QUERIES` measured over all five outside kinds; the measured values recorded in the contract's "Changes during the build".

- [ ] **Step 1: Put the comment in the measured pages**

In `test_outside_queries.py`: `KINDS` gains `"jira.comment"`; in `outside_of`, add to `kinds`:

```python
(("jira.comment", {"connector_id": self.board.pk, "issue": "SUP-12", "body": "Seen again."}),)
```

and use `kinds[i % 5]`; the detail test compares `outside_of(5)` with `outside_of(10)` (`len(...) == 10`); the history test's `ran()` builds `outside_of(5)`; the options test keeps `outside_of(3)` (position 3 is still `jira.create`).

- [ ] **Step 2: Run them**

Run: `$PY manage.py test services.agents.tests.test_outside_queries --parallel auto --noinput`
Expected: PASS when the counts are unchanged (the comment step reads its connector through the page's one connectors query, R2D1-20). If a count moved, the test prints the measured number: re-pin `OUTSIDE_DETAIL_QUERIES` / `OUTSIDE_HISTORY_QUERIES` only if still within `BUNDLE_DETAIL_CEILING + 2` / `HISTORY_CEILING + 1` and constant in rows; a count that grows with rows is a bug to fix in `bulk.py`, not a pin to raise.

- [ ] **Step 3: Record and commit**

Add to the contract's "Changes during the build" (`docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-api.md`): "Measured ceilings (Task 13): `OUTSIDE_DETAIL_QUERIES = <n>`, `OUTSIDE_HISTORY_QUERIES = <n>`, `OPTIONS_QUERIES = <n>`, `THREAD_RUN_QUERIES = <n>` with all five outside kinds. No query uses DISTINCT." with the numbers the tests pin.

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add services/agents/tests/test_outside_queries.py docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-api.md
git commit -m "test(agents): measure outside ceilings with a Jira comment in the mix

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The end-to-end journey

**Files:**
- Create: `e2e/test_agent_round2_flow.py`

**Interfaces:**
- Consumes: everything above, over real HTTP.

- [ ] **Step 1: Write the journey**

Create `e2e/test_agent_round2_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB; Slack, Jira and
Graph are fakes (their APIs in memory), the model is a fake. Nothing leaves
the process.

Journey 1 (round 2 D1, jira.comment and N1): Alice connects Slack and Jira.
A customer's Slack message is synced and read by the agents, who propose a
Slack reply, a Jira issue and an internal comment on it. Jira's project list
answers 404 for a moment: the pick list says Jira can't find the site, not
that it is unreachable. Alice lets agents act in Jira. Carl runs the Jira
steps only; Jira's answer to the comment is lost, the step fails "couldn't
confirm", and his Retry finds the comment by its ref and posts nothing more.
History links to the issue and the comment.

Journey 2 (Outlook): Carl's mailbox is Outlook. He writes a signature in
Revenact and answers a customer from Communications: the reply goes through
Graph's reply (threaded) and ends with his signature."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.management import call_command
from django.test import LiveServerTestCase
from django.utils import timezone

from core.models import AuditEvent
from e2e.http import http_get, http_patch, http_post
from services.accounts.models import Organisation, User
from services.agents import evidence, routing
from services.agents.models import AgentBundle, SignalThread
from services.billing.models import BillingAccount
from services.connectors.tests.jira_fake import use_jira
from services.connectors.tests.slack_fake import FakeSlackApi, use_slack
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer, Email
from services.mail.models import MailMessage
from services.mail.tests.graph_fake import outlook_connection, use_graph
from services.work.clock import today_for


class AgentRound2FlowTests(LiveServerTestCase):
    def setUp(self):
        no_model = patch(
            "services.customers.classification.get_completion",
            side_effect=CopilotNotConfigured("no model in tests"),
        )
        no_model.start()
        self.addCleanup(no_model.stop)
        self.slack = use_slack(self, FakeSlackApi())
        self.ts = f"{int(timezone.now().timestamp()) - 3600}.000100"
        self.slack.channels["C0SUPPORT"] = [
            {"ts": self.ts, "user": "U1", "text": "Nobody can log in since the reset."}
        ]
        self.jira = use_jira(self)
        self.graph = use_graph(self)

    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def workspace(self):
        """Alice's workspace; Carl (CS) owns Pizza Hut. (alice token, carl, pizza)"""
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
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "memberpass12"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        carl = User.objects.get(pk=body["id"])
        User.objects.filter(pk=carl.pk).update(function=User.Function.CS)
        pizza = Customer.objects.create(
            organisation=carl.organisation,
            name="Pizza Hut",
            owner=carl,
            domain="pizzahut.com",
            arr_billed_at_account=Decimal(300_000),
        )
        return alice, carl, pizza

    def test_a_jira_comment_is_found_again_and_a_404_is_not_found(self):
        alice, carl, pizza = self.workspace()
        org = carl.organisation
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
        status, body = http_post(
            self.api(f"/connectors/{jira['id']}/connect/"),
            {"site": "acme", "email": "bot@acme.io", "api_token": "t", "project": "SUP"},
            token=alice,
        )
        self.assertEqual(status, 201, body)
        self.assertEqual(body["agents"]["kinds"], ["jira.create", "jira.assign", "jira.comment"])

        # The Slack message is synced and read: a reply, an issue, a comment on it.
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
                    "kind": "jira.comment",
                    "record": ref,
                    "title": "Note where it came from",
                    "rationale": "Engineering should know it came from Slack.",
                    "evidence": [line],
                    "payload": {
                        "issue": "{{step 2.ticket_key}}",
                        "body": "Reported in the customer's Slack support channel.",
                    },
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
        status, detail = http_get(self.api(f"/agents/bundles/{bundle.pk}/"), carl_token)
        self.assertEqual(
            [s["kind"] for s in detail["steps"]], ["slack.reply", "jira.create", "jira.comment"]
        )
        create, comment = detail["steps"][1], detail["steps"][2]
        self.assertEqual(comment["preview"]["jira_comment"]["internal"], True)

        # Jira's project list answers 404: the list says so, not "couldn't reach".
        self.jira.refuse_next(r"GET /rest/api/3/project/search", 404)
        status, body = http_get(
            self.api(f"/agents/bundles/{bundle.pk}/steps/{create['id']}/options/jira_projects/"),
            carl_token,
        )
        self.assertEqual(
            (status, body),
            (
                409,
                {
                    "code": "TOOL_NOT_FOUND",
                    "detail": "Jira can't find this site. Check the Jira connection.",
                },
            ),
        )

        # Alice lets agents act in Jira; Carl runs the Jira steps; the comment's answer is lost.
        status, body = http_post(
            self.api(f"/connectors/{jira['id']}/agents/"), {"can_act": True}, token=alice
        )
        self.assertEqual((status, body["agents"]["can_act"]), (200, True))
        self.jira.drop_next(r"POST /rest/api/3/issue/[A-Z0-9_]+-\d+/comment$")
        rows = [{"id": s["id"], "selected": s["kind"] != "slack.reply"} for s in detail["steps"]]
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/run/"), {"steps": rows}, token=carl_token
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(
            [(s["status"], s["error"]) for s in body["bundle"]["steps"]],
            [
                ("skipped", ""),
                ("applied", ""),
                ("failed", "We couldn't confirm Jira added the comment. Retry checks Jira first."),
            ],
        )
        [key] = self.jira.created

        # Retry finds the comment by its ref: none posted twice.
        status, body = http_post(
            self.api(f"/agents/bundles/{bundle.pk}/steps/{comment['id']}/retry/"),
            {},
            token=carl_token,
        )
        self.assertEqual(status, 200, body)
        # The Slack step was left out (skipped): every selected step ran.
        self.assertEqual(body["bundle"]["status"], "done")
        [posted] = self.jira.comments[key]
        self.assertEqual(
            posted["properties"], [{"key": "sd.public.comment", "value": {"internal": True}}]
        )

        # History links to the issue and to the comment; the calls are audited.
        status, history = http_get(self.api("/agents/bundles/history/"), carl_token)
        links = [link["label"] for step in history["results"][0]["steps"] for link in step["links"]]
        self.assertEqual(links, [f"Open {key} in Jira", f"Open the comment on {key} in Jira"])
        calls = list(
            AuditEvent.objects.filter(action="agent_outside.call").values_list(
                "metadata__op", "metadata__outcome"
            )
        )
        self.assertIn(("comment", "unconfirmed"), calls)
        self.assertIn(("lookup", "found"), calls)
        self.assertEqual(pizza.pk, thread.customer_id)

    def test_an_outlook_reply_is_signed_and_threaded(self):
        _, carl, pizza = self.workspace()
        connection = outlook_connection(carl)
        email = Email.objects.create(
            customer=pizza,
            subject="Login loop",
            sender_name="Ann Lee",
            recipient_name=carl.name,
            body="We can't log in.",
            sent_at=timezone.now() - timedelta(hours=1),
            mailbox=connection,
            mailbox_owner=carl,
            direction=Email.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            to_addresses=[connection.address],
            thread_id="conv-1",
            provider_message_id="graph-orig",
        )
        MailMessage.objects.create(
            connection=connection,
            owner=carl,
            organisation=carl.organisation,
            provider_message_id="graph-orig",
            direction=MailMessage.Direction.RECEIVED,
            from_address="ann@pizzahut.com",
            subject="Login loop",
            sent_at=email.sent_at,
            rfc_message_id="<m1@pizzahut.com>",
            thread_id="conv-1",
            email=email,
        )
        self.graph.held["<m1@pizzahut.com>"] = ("graph-orig", "conv-1")
        token = self.login("carl@acme.io")
        status, body = http_patch(
            self.api("/mail/connection/"), {"signature": "Carl CSM\nAcme"}, token
        )
        self.assertEqual((status, body["connection"]["signature"]["text"]), (200, "Carl CSM\nAcme"))
        status, body = http_post(
            self.api(f"/communications/emails/{email.pk}/reply/"),
            {"body": "Thanks Ann."},
            token=token,
        )
        self.assertEqual(status, 201, body)
        [reply] = self.graph.replies
        self.assertEqual(reply["id"], "graph-orig")
        self.assertEqual(reply["message"]["body"]["content"], "Thanks Ann.\n\n-- \nCarl CSM\nAcme")
        self.assertEqual(self.graph.posted, [])
```

(`http_patch(url, payload, token=None)` takes the token positionally or by name; check `e2e/http.py` and match its signature.)

- [ ] **Step 2: Run it**

Run: `$PY manage.py test e2e.test_agent_round2_flow e2e.test_agent_outside_flow --parallel auto --noinput`
Expected: OK. If a step fails, it shows a real gap in Tasks 1 to 12: fix it there (test first), not in the journey.

- [ ] **Step 3: Commit**

```bash
venv/bin/ruff check . && venv/bin/ruff format --check .
git add e2e/test_agent_round2_flow.py
git commit -m "test(e2e): round 2 journeys: a Jira comment found again, a signed Outlook reply

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: SOC 2, the docs, the full suite and the hand-off

**Files:**
- Modify: `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`, `.soc2/CONTROL_MAP.md`, `.agents/workflows/agent-outside-flow.md`, `docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-api.md` ("Changes during the build")

- [ ] **Step 1: Close the `API_CONTRACTS.md` comment (R2D1-18)**

Delete the two lines at the top of the hidden block (`<!--` and `Template for each new feature section below:`, about line 7,728) and put them back just above the template at the end of the file, so the template is the only thing inside the comment:

```bash
grep -n "^<!--$\|^-->$\|^Template for each new feature section below:$" docs/API_CONTRACTS.md
```

Expected after the edit: `<!--` then `Template for each new feature section below:` immediately before `## \`<app_name>\` — <Frontend feature name>` near the end, `-->` as the last line, and no other `<!--`/`-->` pair around `## \`metrics\``. Check by eye that `## \`metrics\`` through `## \`agents\`` are outside any comment.

- [ ] **Step 2: Record the delivery in `API_CONTRACTS.md`** (the `api-contracts` skill): in the `agents` section, the `jira.comment` kind (contract §2, §3, its errors), the options route's `TOOL_NOT_FOUND` / `TOOL_BUSY`, `agents.kinds` and `needs: "reconnect"` in the connectors section, `PATCH /mail/connection/` and `connection.signature` in the `mail` section, Outlook's reply threading in the mail send notes, the measured ceilings.

- [ ] **Step 3: Audit, SOC 2, product docs, flow doc**

- `docs/audit-events.md`: `agent_outside.call` gains `op: "comment"` and lookup `outcome: "elsewhere"`; `connector.oauth_refused` gains `reason: "not_allowed"`.
- `.soc2/CONTROL_MAP.md`: AUTH-02 (the mailbox PATCH acts on the caller's own mailbox; the comment's gate), LOG-01 (the demoted admin's refusal), API-08 (the comment's ref).
- `docs/product/01-prd.md`: Jira comments, Outlook threading and signature, the Gmail signature kept, the round 2 scope ruling. `02-trd.md`: `services/mail/signing.py`, Graph's reply, `restore_signature`. `05-backend-schema.md`: `metrics.0018` (the kind's choice); `MailboxConnection.signature_html` now also holds an Outlook signature. `06-implementation-plan.md`: round 2 D1 done; D2 and D3 next.
- `.agents/workflows/agent-outside-flow.md` (`flow-docs` skill): a `jira.comment` paragraph (gate, look first by ref, write last), Outlook's reply path and its fallback, where a signature is added (one helper) and where it is not (a draft carries its own).

- [ ] **Step 4: The full gate**

```bash
$PY manage.py test --parallel auto --noinput
$PY manage.py makemigrations --check --dry-run
$PY manage.py spectacular --file /tmp/r2d1-schema.yml --validate
venv/bin/ruff check . && venv/bin/ruff format --check .
```

Expected: every test OK (write the count into the hand-off), "No changes detected", the schema written without errors, ruff clean.

- [ ] **Step 5: Commit and push**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md .soc2/CONTROL_MAP.md .agents/workflows/agent-outside-flow.md docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-api.md
git commit -m "docs: round 2 delivery 1 in the contracts, audit events, SOC 2 map and product docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/agent-bundles-r2d1
```

Hand-off (to the controller, not a PR): the head, the suite count, the migration (`metrics.0018`), the measured ceilings, every "Changes during the build" entry, and the owner live checks (contract R2D1-3, R2D1-4, R2D1-13, R2D1-14; spec §13.8).

---

## Self-review

1. **Contract coverage.** R2D1-1 (Global Constraints, no other connector touched); R2D1-2 Tasks 6, 7; R2D1-3 Task 4 (`COMMENT_PROPERTY`), Task 6 (not customer-facing, placeholder test); R2D1-4 Tasks 4 to 6; R2D1-5 Task 4; R2D1-6 Task 6 (outputs, link, chip); R2D1-7 Task 2; R2D1-8 Task 1; R2D1-9, R2D1-10, R2D1-11 Task 3; R2D1-12 Task 8; R2D1-13, R2D1-14 Task 9; R2D1-15 Tasks 10, 11; R2D1-16 Task 12; R2D1-17 Task 10; R2D1-18 Task 15; R2D1-19 Task 7 (out-check test with its positive twin); R2D1-20 Task 13. Contract §4.2 (`kinds`, `needs` order) Tasks 3, 6; §4.3 Task 11; §4.4 Task 2; §4.5 Task 3; §5 Tasks 5, 6; §6 Tasks 3, 6, 15.
2. **Placeholders.** None: every code step holds its code. The two "check with grep" notes (Task 1 `http.client`, Task 11 imports) are verifications, not missing code.
3. **Type consistency.** `tools.Comment(id, key, url, issue_url)` (Task 5) is what `jira_comments._done` reads (Task 6) and what `FakeJira._comment_of` builds. `JiraProvider.add_comment(config, creds, issue, *, body)` / `find_comment(config, creds, issue, *, marker)` (Task 4) are what `JiraTool` calls (Task 5). `agent_send.find(..., source=None)` (Task 8) is what `MailTool.find` and `FakeMail.find` take. `Message.threaded` (Task 9) is what `agent_send.send` reads. `signing.signed(connection, body, markup="")` (Task 10) is what `agent_send._bodies`, `send_via_provider` and `reply_to` call. `html.restore_signature(markup, block)` (Task 12) is what `drafts.clean` calls.

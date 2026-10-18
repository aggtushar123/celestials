# Meeting-triggered sales report (2026-10-18)

Owner brief (demo video "Example 2"): a daily check finds tomorrow's meetings
whose title matches "sales review", makes a proposal for the organiser and
raises a priority notification (in-app; no web push). The organiser opens it
and the agent asks "You have Sales review tomorrow at 10:00. Should I prepare
the sales report?" [Yes] [Not now]. Yes produces a report over the last 30
days (deals won and lost, what closes in the next 30 days, stage movement)
from the Pipelines book, with a short written summary, and a one-page
printable report to download.

## 1. Reused, not reinvented

- **Guided agent** (`services/agents/guided.py`, #163): the bundle is guided
  (`guided: true`, `next_step`, `can_stop`, per-step `question`), run through
  `POST /agents/bundles/<id>/steps/<step_id>/run/` and stopped with
  `POST /agents/bundles/<id>/stop/` (Not now). A bundle is guided when it
  holds a guided lead step: `record.diagnose` or the new `report.sales`.
- **Priority notice**: `guided.notify_priority` (`agent_bundle_priority`,
  in-app + live WebSocket push; never web push), link
  `/work?queue=mine&kind=bundle&bundle=<id>`.
- **Personal bundles**: Slack bundles' "only the person it's for" rule
  (`RoutedTo.PERSON`, `routed_user`) is widened from `slack_message` to a
  `PERSONAL_SOURCES` tuple (`slack_message`, `meeting`). Others get 404, the
  bundle is never counted as hidden for them (view-all included), and only
  the routed person decides it (`deciding.decided_as` → `organiser`).
- **Pipelines book**: `services/pipelines_portfolio/book.scope(user,
  OPPORTUNITIES)`, the twice filter (record openable + department-wise
  `pipeline_visible_q`), read as the organiser at run time.
- **Model client**: `services.copilot.anthropic_client.get_completion` with a
  new purpose `sales_report` (flash tier, registered in settings, usage
  labels and skills), schema-enforced, as the brief writer uses it.
- **Workspace timezone**: `services/work/clock.zone_for`.

## 2. The daily check

`services/agents/sales_review.check_meetings(now)` runs on the per-minute
`deliver_pending` tick (Cloud Scheduler `deliver`, the one that already runs
on prod; not the nightly job, so a meeting synced during the day is still
caught the day before). It is idempotent, so running every minute is the
same as running once a day: each meeting is acted on once.

- Candidates: synced `calendar.Meeting` rows, not all-day, whose title
  contains "sales review" (case-insensitive), starting within the next 48
  hours; kept when the meeting's start falls on **tomorrow** in its
  workspace's timezone.
- One bundle per meeting: the key is `sha1(ical_uid or google_event_id,
  starts_at)`; several attendees' calendars holding the same event make one
  bundle. A step with that `target` in any status means "done already".
  The `agent_action_one_open` constraint guards the race.
- The organiser is the workspace member whose email is the meeting's
  `organizer_email` (else the calendar owner when no organiser is given).
  Skipped: no such member, a member not active for work (`working_ids`),
  workspace AI agents off (`ai_agent_enabled`), the Sales agent's profile
  off, or `report.sales` set to Never.
- Workspace-configurable title pattern: not built (YAGNI); the phrase is a
  constant.

## 3. The bundle

`AgentBundle(source="meeting", routed_to="person", routed_user=organiser,
agent="sales", priority="high", title="Prepare the sales report for <meeting
title>")`, no record, one step `report.sales`. Told at once
(`notify_priority`).

## 4. `report.sales` ("Prepare the sales report")

Workspace-level, Sales agent, Ask at most, never offered by the nightly pass
or a message's read. Not irreversible; Undo discards the stored report (the
download is then 404).

Payload (set by the check): `meeting_key`, `meeting_id`, `title`,
`starts_at`, `ends_at`, `days` (30).

Question: "You have <title> tomorrow at 10:00. Should I prepare the sales
report?" ("today" once the day has come; time in the workspace timezone,
24-hour).

Preview before it runs: `{"sales_report": {"meeting": {title, starts_at},
"period": {from, to}, "counts": {won, lost, closing, open}, "report": null}}`
(counts of what it will read, as the reader may read them). After it ran: the
same with `"report"` the stored snapshot for the person it is for.

Apply (as the runner, who is the organiser): reads every opportunity the
runner may see and stores on the step's `result.report`:

```
{period: {from, to}, currency, generated_at,
 won:  [{name, record: {type, id, name}, amount, closed_on}],
 lost: [...same...],
 closing: [{name, record, amount, stage, stage_label, closes_on}],
 stages: [{stage, label, count, amount, moved_in, moved_out}],
 totals: {won_count, won_amount, lost_count, lost_amount, closing_count,
          closing_amount, open_count, open_amount, win_rate},
 summary, stage_history: false}
```

- Won / lost: stage Closed Won / Closed Lost whose close date falls in the
  last 30 days. **There is no stage history table**: the close date is
  `stage_changed_at` (the moment the stage last changed, kept by
  `StageClockMixin`), in the workspace timezone.
- Closing: open stages, `expected_close` in [today, today + 30].
- Stages: every stage's current count and amount (`mrr`); `moved_in` counts
  deals now in that stage whose stage changed in the period; `moved_out` is
  `null` (not recorded), and `stage_history: false` says so.
- Amounts are `mrr` in the workspace currency (no FX), as Pipelines shows.
- Summary: one model call (purpose `sales_report`, schema `{summary}`,
  ≤ 120 words, cut server-side), from the figures and deal names only (quoted
  as data). A model failure (or no credits) leaves the summary empty and the
  report still stands: the figures are the platform's, not the model's.
- Audit: `sales_report.prepared` (ids and counts only).

## 5. Download

`GET /api/v1/agents/bundles/<id>/steps/<step_id>/report/`: a server-rendered
one-page printable HTML (Django template, autoescape on, inline CSS, light
theme): workspace name, meeting, period, the four sections, summary,
generated-at. `Content-Disposition: inline; filename="sales-report-YYYY-MM-DD.html"`
(the report's `to` date), `Content-Security-Policy: default-src 'none';
style-src 'unsafe-inline'`, `Cache-Control: no-store`. Only the bundle's
person may fetch it; anyone else, a step that isn't an applied
`report.sales`, or a discarded report is 404. Audit `report.downloaded`
(bundle and step ids only).

## 6. Demo data

`seed_demo_sales_review` (Alfred only: anchored on
`tushar@tryalfred.onworkspace.com`'s organisation, refused unless it is named
`Alfred`; dry-run by default, `--apply` writes): a meeting "Sales review"
tomorrow 10:00–10:30 workspace time on Tushar's connected calendar
(`google_event_id` `revenact-demo-sales-review-<date>`, a local/demo row; it
needs his mailbox connection, and is refused without one), and fictional
opportunities on existing Alfred customers: won and lost in the last 30 days,
open across stages, some closing in the next 30 days. Idempotent (titles are
the key); a summary goes to stdout and stderr. Then it runs the check, so the
proposal appears at once.

## 7. Not in this round

- Real stage history (moved out of a stage).
- A workspace-configurable title pattern.
- PDF rendering on the server (the browser's Print / Save as PDF does it).
- Frontend (separate PR): Download link and Print / Save as PDF.

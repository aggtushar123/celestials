# Guided agent: diagnose, write, send (2026-10-18)

Owner request (2026-10-18), for the demo video: a Slack message ("Hey Tushar,
I heard Twilio is unhappy with our services, could you diagnose and get it
fixed?") becomes a priority item on Tushar's phone (the web app at phone
width; there is no native app). He opens it and the CSM agent asks one
question at a time: "Should I diagnose?" Yes → findings with sources. "Should
I write an email to save this client?" Yes → a tailored draft built from
tickets, call transcripts, emails and Slack. "Should I send it?" Yes → sent
from his Gmail. Owner chose to build this ("B") and skip a Slack-DM phone ping.

## 1. What exists and is reused

- Synced Slack channel messages become `AgentBundle(source=thread)` through
  `services/agents/intake.py` (interval + fast lane), routed to the account
  team (Slack escalations D1–D4). The fast lane already picks urgent threads.
- Step kinds are `services/agents/kinds.Kind` entries (validate / preview /
  apply / undo / outputs / irreversible / editable) in `registry.py`;
  `placeholders.py` lets a later step use an earlier step's outputs
  (`{{step N.key}}`); `bundle_run.py` runs the selected steps in order.
- Evidence gathering helpers: `services/agents/evidence.py` (email_line,
  ticket_line, slack_line, people_line, Context), CallSense transcripts and
  summaries on `customers.Call`, the health breakdown (health rubric),
  contact sentiment, open tickets.
- Mail: the person's own mailbox (`services/mail`) with drafts (`MailDraft`)
  and sending through Gmail (`outbox`); `mail.send_reply` kind replies in a
  thread. Private-mail rule: only the reader's own mail or mail shared to
  Revenact (`services/mail/visibility.py`).

## 2. New step kinds

All three are message-bundle kinds (offered for thread and slack_message
bundles only, not by the nightly pass), customer/account scoped, decided by
the bundle's decider.

### 2.1 `record.diagnose` ("Diagnose")
- Read-only: `apply` changes nothing in the book; reversible trivially (no
  undo shown). Not irreversible.
- `apply` gathers, for the bundle's record, only what the **decider** may
  read: health score and its five components with the latest change (from
  HealthSnapshot), open tickets (newest 10: number, title, age, status),
  calls with CallSense summaries/transcript excerpts (last 90 days, newest 5),
  emails visible to the decider (`visible_emails_q`; never another person's
  private mail) (last 30 days, newest 10), the bundle's Slack thread, contact
  sentiment, the main contact's last reply date. One model call (purpose
  `agent_diagnose`, Gemini Flash, enforced `response_schema`):
  `{summary: str ≤ 400, findings: [{text ≤ 200, source: {kind: ticket|call|email|slack|health|contact, ref: id}}] (2–5)}`.
  Each finding's `ref` must be one of the ids gathered (validated server
  side; unknown refs are dropped; zero findings left → step fails with a
  plain sentence). Data in the prompt is quoted as data, never instructions.
- Outputs (for placeholders and the panel): `summary`, `findings` (each with
  `text`, `source {kind, label, url}` where url is an app path or the
  ticket's/Slack permalink, only if the decider may open it).
- Preview (before it runs): `{"diagnose": {"record": "Twilio", "reads": ["health", "tickets", "calls", "emails", "slack"], "counts": {"tickets": 3, "calls": 1, "emails": 4}}}` (counts of what it will read).

### 2.2 `mail.compose` ("Write an email")
- `apply` writes a new email (not a reply) to the record's main contact (the
  champion / primary contact; the model may not choose an address: the
  server picks `to` from the record's contacts the decider may see), from
  the decider's own connected mailbox, using step 1's findings
  (`{{step N.summary}}` / findings) plus the same gathered context. One model
  call (purpose `agent_compose`, Gemini Flash, schema `{subject ≤ 150, body ≤ 4000}`),
  in the workspace's tone (`ai_agent_tone`). It saves the text as a
  `MailDraft` in the decider's mailbox (so it also shows in Communications /
  Gmail drafts) and outputs `draft_id`, `to`, `subject`, `body`.
- Needs a connected mailbox: without one the step is disabled with the
  existing "connect Gmail" reason and link.
- Undo deletes the draft (if still a draft).

### 2.3 `mail.send_draft` ("Send it")
- Sends the draft from step 2 (`draft_id` placeholder) through the existing
  outbox. Editable before it runs: `to` (one of the record's contacts),
  `subject`, `body` — an edit updates the MailDraft first.
- Irreversible ("Can't be undone"), unless the outbox already supports a
  delayed send; if it does, use it and offer Undo during the delay.
- On success the sent message is filed on the record (existing filing) and
  **shared to Revenact** (it is a customer email the agent wrote on the
  record's behalf: `services/mail/sharing.set_shared`), so it shows on the
  record's timeline.

## 3. Guided runs (one step at a time)

The phone conversation needs a bundle that stays open between answers.
- `POST /api/v1/agents/bundles/<id>/steps/<step_id>/run/` (or extend the
  existing run body with `guided: true` — implementer's choice, documented in
  API_CONTRACTS) runs **that one step** if it is the next proposed step in
  order and every earlier step is applied (or skipped by the reader). The
  bundle stays `open` while proposed steps remain; it finishes when the last
  one runs or the reader says Not now.
- `POST /api/v1/agents/bundles/<id>/stop/` ("Not now"): marks the remaining
  proposed steps skipped (reason "Stopped by <name>") and finishes the bundle.
- Same rights as today's run (`may_decide`), same audit events, same
  conflict handling (two tabs).
- The bundle payload gains `guided: true` for bundles whose steps include
  `record.diagnose` (so the frontend shows the conversation), and each step
  a `question` string written by the server: "Twilio's health dropped from
  7.8 to 6.1. Should I diagnose?", "Should I write an email to save Twilio?",
  "Should I send it to Dana Smith?" (names from the record; no model text).

## 4. Proposing it

The thread intake prompt and kind list gain the three kinds. When a message
asks the reader to look into or fix an unhappy/at-risk customer, the
proposer should propose exactly `record.diagnose → mail.compose →
mail.send_draft` in that order (validated: if any of the three is proposed
the trio must be whole and ordered, else drop all three). The bundle's
priority is high when the message asks for it urgently or the record's
health is poor; high-priority bundles are marked `priority: "high"` in the
feed item (`detail.priority`) and raise the in-app notification
(`agent_bundle_ready`, existing kind or a new `priority` flag) immediately
(fast lane), not in the daily digest.

## 5. Privacy and safety (unchanged rules, restated)

- Everything is read as the decider; private mail of others never enters a
  prompt; the twice-filter rule applies to model output (findings refs are
  re-checked against what the decider can open before showing).
- Nothing is sent without the decider running `mail.send_draft`.
- Audit: `agent_bundle.step_ran` etc. already exist; add
  `agent_diagnose.ran` and `mail.agent_sent` with counts/ids only.
- Credits: each model call bills AI credits as other agent calls do.

## 6. Demo data (Alfred workspace, prod)

A management command `seed_demo_twilio` (idempotent, Alfred only, refuses
other orgs): Twilio gets 3 open latency tickets (2, 5 and 9 days old), one
call 6 days ago with a CallSense summary flagging renewal concerns, a health
drop 7.8 → 6.1 over two weeks (HealthSnapshots), a champion contact whose
last reply is 14 days old. The owner sends the Slack message live.

## 7. Frontend (separate PR)

- Phone: a guided bundle opens as a conversation (agent bubbles = step
  `question` then result: diagnose summary + finding list with source links;
  the draft as an editable card; "Sent from tushar@…" with links), with
  **Yes** / **Not now** per question. Desktop keeps the checklist but the
  conversation is available as well (decision: conversation on every width
  for guided bundles).
- Feed: `detail.priority === "high"` shows a "Priority" badge and sorts first
  in Ready to run; an in-app banner appears when a priority item arrives
  while Work is open.

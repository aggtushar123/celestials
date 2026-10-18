# Agents, delivery 2 ("drafts and plans"): API contract

**Sources:**
- Backend plan: `docs/superpowers/plans/2026-10-08-agents-drafts-backend.md`.
- Frontend plan: react-ts-app `docs/superpowers/plans/2026-10-08-agents-drafts-frontend.md`.
- Spec: react-ts-app `docs/superpowers/specs/2026-10-08-agents-round-design.md`, §2, as amended on 2026-10-08 by the owner decisions below.
- Delivery 1 contract: `docs/superpowers/plans/2026-10-08-agents-actions-api.md`. Everything there still holds unless this file changes it.

**Conventions** are delivery 1's:
- Every path is under `/api/v1/`.
- Every route is `IsAuthenticated`.
- Bodies are JSON.
- Timestamps are ISO 8601 UTC.
- "Today" is the workspace's day (`WorkSettings.timezone`).

## Owner decisions (2026-10-08)

These replace the spec's first draft of §2:

1. **Drafts live in Revenact.**
   - No provider can hold a draft. Gmail is connected read and send only, Microsoft `Mail.Read`/`Mail.Send`, IMAP has no APPEND, and no ticket connector writes back.
   - So a draft is a Revenact row (`ReplyDraft`). Mail drafts are listed in Communications' Drafts, with Edit, Send and Discard. Send uses today's send path.
   - A ticket draft is shown on its ticket. A person copies it into the source system and marks it sent.
   - A later "two-way connectors" round will sync drafts into the real mailbox and send ticket replies.
2. **Only source readers see a draft reply.**
   - A `draft.reply` action is listed, previewed and decided only by readers who may read its source email or ticket.
   - Everyone else gets it counted in `hidden` and never named.
3. **Undoing an agent-started plan returns it to Draft.**
   - Its tasks are deleted (only while none is done). The plan stays on the record with its history and can be edited.
   - Starting a Draft recreates its tasks.

## New action kinds

They are added to `kinds` after `note.create` and before `initiative.create`:

| `kind` | `label` | `max_level` | `agents` | `example` |
|---|---|---|---|---|
| `draft.reply` | Draft a reply | auto | cs, sales | "Draft a reply to Ann Lee's email about the renewal" |
| `plan.start` | Start a plan | ask | cs, sales | "Start the Onboarding plan on Dough Co" |

Every other delivery 1 kind is unchanged. A fresh workspace is still all `"ask"`.

### `draft.reply`

**What the model writes.** The payload is `{"email_id": 812, "body": "..."}` or `{"ticket_id": 55, "body": "..."}`. It has exactly one source, and `body` is 1 to 4,000 characters.

**What the model sees (CS and Sales books only):**
- **Email.** At most one email per record: its newest unanswered customer email. That is the newest **received** `customers.Email` on the record whose `mailbox_owner` is the record owner and whose `thread_id` is not blank, with no newer email in the same thread for that mailbox owner.
  - It is shown only when the record owner is active and has a **connected** mailbox.
  - The line is quoted as data (`json.dumps`):

    ```
        email 812: from "Ann Lee <ann@x.com>", subject "Renewal terms", 2026-10-06, unanswered: "<first 300 characters of the body>"
    ```
- **Ticket.** At most one ticket per record: its newest open ticket that the record owner may read (`visible_tickets(owner)`):

  ```
      ticket 55 "TKT-1042": "Export fails", open since 2026-10-01, from "Ann Lee": "<first 300 characters of the description>"
  ```

**What is dropped at generation,** in addition to delivery 1's rules:
- An email or ticket that isn't the one shown for the action's own record.
- An email draft when the owner has no connected mailbox.
- A `draft.reply` whose cited evidence is not its own source's line.
- Any **other** kind that cites an email or ticket line.
- Any other kind whose title or rationale names an email's subject or a ticket's title on its record. A title counts when it is 12 characters or more and two words or more, the delivery 1 rule.
- A `draft.reply` whose title, rationale or body names a task or note title from any record, or the other source on its record. A draft goes to a customer, and internal titles never do.

**The kind's members:**
- **`target`** is `draft:email:<id>` or `draft:ticket:<id>`. A re-proposed draft for the same source is the same proposal: `same` compares the source only, not the body.
- **`current`, mail:** the id of the newest email in that thread for the mailbox owner, sent or received. It is captured when the action is proposed. When it changes (someone replied, or the customer wrote again), the action expires with reason `changed`.
- **`current`, ticket:** `"open"` while the ticket's status is open, in progress or on hold, and `"resolved"` once it is resolved or closed. Only resolving or closing it expires the action; moving between open statuses does not.
- **One open draft per source.** The evidence leaves out an email or ticket that already has an open draft, and a constraint keeps one open draft per source. It also leaves out a source a draft reply already answered (an applied `draft.reply` action for it): an email for good, since a new customer email is a new source, and a ticket for 7 days after the action was applied (`evidence.TICKET_REDRAFT_DAYS`). An apply that meets one expires the action (`changed`), as does an email whose mailbox owner is no longer the record owner.
- **Naming a source.** Any other kind whose title, rationale or payload `title`/`body`/`reason` names an email's subject or a ticket's title on its record is dropped.
- **The feedback log** records a `draft.reply` decision as "A draft reply", without its title, payload or rationale.
- **`preview`:**

  ```json
  {"draft": {"channel": "email", "to": "Ann Lee <ann@x.com>", "subject": "Re: Renewal terms", "excerpt": "<first 280 characters of the body>"}}
  {"draft": {"channel": "ticket", "ticket": "TKT-1042", "subject": "Export fails", "excerpt": "..."}}
  ```

- **Apply** creates a `ReplyDraft` owned by the **record owner**, whatever the decider.
  - `result` gains `"draft_id": <id>`.
  - Apply refuses (the action expires, reason `changed`) when:
    - the source moved on;
    - the email owner's mailbox is no longer connected;
    - the owner is inactive;
    - the ticket was resolved.
- **Undo** deletes the draft.
  - "This draft has been sent." (`CHANGED_SINCE`) when it was sent or marked sent.
  - "This draft has been edited since." when its body or subject changed.
  - "This draft was discarded." when it no longer exists.
- **Who may read the action.** All three must hold:
  1. the reader may open the record;
  2. the reader may read the source: for an email, `visible_emails(reader)`, the mailbox owner's chain; for a ticket, `visible_tickets(reader)`;
  3. for deciding, delivery 1's rule as well: the record owner, anyone above them, or view-all.

  A view-all reader outside the mailbox chain neither sees nor decides an email draft. This applies to Activity (and its `hidden`), `GET /agents/actions/<id>/` (404), approve, reject and undo (404), Work › Recommended, and Brain › Waiting.

### `plan.start`

**What the model writes.** The payload is `{"template_id": 4}`.

**What the model sees (CS and Sales books only):**
- One workspace block lists the templates every member may read: built-ins and the workspace's `sharing="workspace"` templates, at most 20, by name:

  ```
  Plan templates:
    template 4: "Onboarding" (onboarding), 3 milestones, 9 tasks
  ```

- Each record lists its open plans: `    plan 31: "Onboarding", on track, from template 4`.

**What is dropped at generation:**
- A template that isn't listed.
- A template that already has an open plan on the record.

**The kind's members:**
- **`target`** is `plan:<template_id>`.
- **`current`** is `None`, because the kind makes a thing.
- **`preview`:** `{"plan": {"template": "Onboarding", "milestones": 3, "tasks": 9}}`.
- **Apply** (Ask only, so a person is always the actor):
  - It calls `start_plan(template, record, owner=owner_for(record, actor), start_date=<today>, actor=actor)`.
  - `PlanOpen` or `TemplateGone` expire the action (reason `changed`).
  - `result` gains `"plan_id": <id>`.
  - The plan records which agent action started it (`Plan.agent_action`).
- **Undo:**
  - It locks the plan and refuses with `CHANGED_SINCE` when:
    - the plan isn't open: "This plan has been finished or cancelled.";
    - a task is done: "Work on this plan has been done: it can't go back to draft.";
    - the plan is gone: "This plan has been deleted.".
  - Otherwise the plan **returns to Draft**:
    - its tasks are snapshotted into the plan and deleted;
    - its status becomes `draft`;
    - it is audited as `plan.returned_to_draft {tasks: n, agent_action}`.

### `result`

`result` is now `{task_id, note_id, initiative_id, draft_id, plan_id}`. Each key is null unless that kind made it.

## Delivery 1 follow-ups

- **`preview.task.id` is `null`** for a task the reader may not read (title "A task you can't see") and for a removed task (title "A removed task"). The UI links a task only when its id is a number.
- **The legacy routes are removed:**
  - `GET /metrics/proposals/`, `POST /metrics/proposals/generate/` and `POST /metrics/proposals/<id>/<decision>/` now answer 404.
  - Copilot's `GET/POST /copilot/conversations/<id>/session/decisions/` and session close keep their `proposals` shape unchanged.
- **The Ops agent's figures read without `DISTINCT`.** The forecast's counted opportunities and risks, activity tracking's inbound and tasks, and the support count use `id IN` subqueries, with query-shape tests. There is no API change.
- **A reply threads on its original.**
  - When Revenact sends a reply (the Communications reply and a draft's Send), the filed sent email takes the original's `thread_id` when the provider returns none. Microsoft and IMAP both return none.
  - So the reply clears the original from the queue's "replies owed".
  - It is also sent with `In-Reply-To` and `References` headers when the original's `provider_message_id` looks like a Message-ID (IMAP).

## Reply drafts: `/communications/drafts/`

**ReplyDraft:**

```json
{
  "id": 7,
  "channel": "email",
  "status": "open",
  "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "source": {
    "kind": "email", "id": 812, "subject": "Renewal terms",
    "from": {"name": "Ann Lee", "address": "ann@x.com"}, "sent_at": "..."
  },
  "to": [["Ann Lee", "ann@x.com"]],
  "subject": "Re: Renewal terms",
  "body": "Hi Ann, ...",
  "agent": "cs",
  "agent_action_id": 91,
  "owner": {"id": 3, "name": "Carl CSM"},
  "edited": false,
  "created_at": "...",
  "updated_at": "...",
  "sent_at": null,
  "sent_by": null,
  "can_edit": true
}
```

**Fields:**
- **`channel`** is `email` or `ticket`.
- **`status`** is `open` or `sent`. A discarded draft no longer exists.
- **`source` for a ticket:** `{"kind": "ticket", "id": 55, "number": "TKT-1042", "title": "Export fails", "external_url": "https://...", "source_name": "Zendesk"}`. `external_url` and `source_name` are `null` for a ticket raised in Revenact.
- **`to` and `subject`** are `null` on a ticket draft.
- **`edited`** is true once the body or subject differs from what the agent wrote.
- **`can_edit`** is true only for the draft's owner while it is open. Every write below is owner-only.
- **`sent_by`** is `{id, name}` once sent or marked sent, else `null`.
- **Recipients are fixed:** `to` is the source email's sender and can't be changed in this delivery. PATCH and send take only `body` and `subject`.
- **`record.kind`** is `customer` or `account`, as in delivery 1.

**Who may read a draft:** its owner, and anyone who may open the record **and** read the source. Anyone else gets 404.

### `GET /communications/drafts/` (any member)

- Returns the reader's **own** drafts, newest first, at most 100, with no paging: `{"results": [ReplyDraft, ...]}`.
- **Parameters:** `channel` (`email` or `ticket`) and `status` (`open` by default, or `sent`). A bad value is a 400: `{"channel": ["Choose email or ticket."]}` or `{"status": ["Choose open or sent."]}`.

### `GET /communications/drafts/<id>/`

Returns one ReplyDraft. It is a 404 unless the reader may read it.

### `PATCH /communications/drafts/<id>/` (the owner)

- **Body:** `{"body": "...", "subject": "..."}`. Send either one. `subject` applies to email drafts only.
- **Errors:**
  - `404`;
  - `403 {"code": "NOT_YOURS", "detail": "Only Carl CSM can change this draft."}`;
  - `409 {"code": "ALREADY_SENT", "detail": "This draft has been sent."}`;
  - `400`, field errors:

    | Field | Refused with |
    |---|---|
    | `body` empty | "Write the reply." |
    | `body` over 20,000 characters | "Keep the reply under 20,000 characters." |
    | `subject` over 255 characters | "Keep the subject under 255 characters." |
    | `subject` on a ticket draft | "A ticket reply has no subject." |
- Returns the ReplyDraft. Audited as `reply_draft.edited`.

### `POST /communications/drafts/<id>/send/` (the owner, email only)

- **Body (optional):** `{"body": "...", "subject": "..."}`. It is saved first, with the PATCH rules.
- Sends from the reader's connected mailbox to `to`, filed on the draft's record, threaded on the source.
- **Errors, in order:**
  1. `404`;
  2. `403 NOT_YOURS` ("Only Carl CSM can send this draft.");
  3. `400 {"code": "WRONG_CHANNEL", "detail": "Copy a ticket reply into its source and mark it sent."}`;
  4. `409 ALREADY_SENT`;
  5. `400`, field errors;
  6. `409 {"code": "NO_MAILBOX", "detail": "Connect your mailbox to send this."}` when there is no mailbox, or it needs attention (`error`);
  7. `502 {"detail": "Your mailbox didn't accept the message. Try again."}` on a provider error. A reauthorisation error sets the connection to `error`, as compose does.
- **Returns** `200 {"draft": ReplyDraft, "email": {"id", "subject", "sent_at", "thread_id"}}`. The draft's `status` becomes `sent`.
- Audited as `reply_draft.sent` and `mailbox.reply`, which compose already writes.

### `POST /communications/drafts/<id>/mark-sent/` (the owner, ticket only)

- **Errors:**
  - `404`;
  - `403 NOT_YOURS`;
  - `400 {"code": "WRONG_CHANNEL", "detail": "Send an email draft instead."}`;
  - `409 ALREADY_SENT`.
- Returns the ReplyDraft with `status: "sent"`. Audited as `reply_draft.marked_sent`.

### `DELETE /communications/drafts/<id>/` (the owner)

- **Errors:** `404`, `403 NOT_YOURS`, `409 ALREADY_SENT`.
- On success: `204`. Audited as `reply_draft.discarded`.
- `NOT_YOURS` on mark-sent and DELETE reads "Only Carl CSM can change this draft.".

### The Communications queue

- `GET /communications/` email rows and ticket rows gain `"draft": {"id": 7, "agent": "cs", "created_at": "..."}` or `null`.
- It is set only when the reader owns an **open** draft for that email or ticket.

## Notifications

- **New kind `agent_draft_ready`**, sent to a draft's owner when a `draft.reply` applies. It is not sent when the owner approved it themselves.
  - It links to `/communications?draft=<id>`.
  - The message is "The CS agent drafted a reply to Ann Lee on Dough Co.", or "...to a ticket on Dough Co.".
- **`agent_action_undone`** is unchanged. Its noun for the new kinds is "draft reply" and "plan".

## Plans

- **New status `draft`** (label "Draft").
  - It is not open: it is not counted as open anywhere, and it doesn't block another plan from the same template.
  - Every plan payload (`GET /plans/` rows, `/plans/<id>/` and a record's plans) carries `pending_tasks: <n>`. For a Draft that is the number of tasks its start will create; for any other status it is `0`.
  - Where `GET /plans/` returns per-status `counts`, they gain a `draft` key.
- **The plan payload** (`GET /plans/`, `/plans/<id>/`, a record's plans) gains `"started_by_agent": "cs" | "sales" | null`.
- **`status` filters** accept `draft`.
- **`PATCH /plans/<id>/`** works on a Draft for the fields it already allows (name, owner, dates, milestones). It may not set or leave `draft` by hand: "Start a draft plan with Start plan."
- **`DELETE /plans/<id>/`** works on a Draft.
- **A Draft's milestones and tasks don't move:** marking a milestone done or changing a plan task on a Draft answers 400 "Start a draft plan with Start plan.".
- **New `POST /plans/<id>/start/`** (a plan editor), for a Draft only. It recreates the snapshotted tasks:
  - Each due date moves by `(today - start_date)`, and `start_date` becomes today.
  - Each task keeps its assignee while they are active and may open the record. Otherwise it goes to the record owner, then to the plan owner.
  - The status becomes `not_started`.
  - Assignees are told, as for a fresh start. Audited as `plan.started_from_draft {tasks: n}`.
  - **Errors:**
    - `404`;
    - `403`, not an editor;
    - `409 {"code": "NOT_DRAFT", "detail": "Only a draft plan can be started."}`;
    - `409 {"code": "PLAN_OPEN", "plan_id": 12, "detail": "This record already has an open plan from this template."}`.
  - Returns the plan.

## Audit events (new)

| Event | Metadata |
|---|---|
| `reply_draft.created` | `{channel, agent_action}` |
| `reply_draft.edited` | `{fields}` |
| `reply_draft.sent` | `{email}` |
| `reply_draft.marked_sent` | `{}` |
| `reply_draft.discarded` | `{}` |
| `plan.returned_to_draft` | `{tasks, agent_action}` |
| `plan.started_from_draft` | `{tasks}` |

## Out of scope (still)

- Syncing drafts into a provider's Drafts folder, and sending ticket replies: the two-way connectors round.
- Agent actions on the Brain graph: delivery 3.
- Moving Copilot session decisions onto the AgentAction shape.

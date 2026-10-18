# Private mail, Add to Revenact, and the email agent (design, 2026-10-17)

Owner request: "Faiz sends Jesh an email: Twilio's health is going down, we need
to discuss this with Tushar, urgent. The agent should ask Tushar about
scheduling the meeting. Tushar tells Faiz by email this work is assigned to Jesh
tonight, done first thing in the morning: the agent should assign the task to
Jesh." And, firmly: "one person should not be able to read the messages of
another person, nor query another person's mail. A conversation with a customer
(Twilio) the user should be able to add to Revenact for future reference."

## Owner decisions (2026-10-17)

1. **Mail is owner-only.** Each person's mail is readable and searchable only by them, everywhere: inbox, Communications, timelines, Copilot, search, the API. The management chain loses access.
2. **Customer mail reaches the shared record only by Add to Revenact.** Mail with a customer's people is still matched to that customer, but stays private until its owner adds it. Added mail is readable by anyone who can open the customer, and **Remove from Revenact** takes it back. Mail filed before this change starts private.
3. **Tasks from email are created at once.** "Assign this to Jesh, first thing tomorrow" creates a task for Jesh, due 09:00 the next working morning in Jesh's time zone, linked to the customer. Jesh and the person who asked are notified, and either can undo. This happens only when the asker may assign to Jesh (the existing Work assignee rules).
4. **Meetings from email are proposed.** The person asked for (Tushar, who isn't on the mail) gets a Work item; if nobody else is named, the sender gets it. It carries a proposed slot: the earliest free 30 minutes for everyone in working hours, from their synced Revenact calendars, sooner when urgent. The approver can change the time, and one click books it with Meet and invites.
5. **Agent reach.** Someone who wasn't on the email sees only a one-line topic the agent writes, who asked, the customer and the proposed time. Never the email text, and never a link to it.

## 1. Privacy (delivery 1)

### Rule

`services/mail/visibility.py`:

- `visible_emails_q(user)` = `mailbox_owner == user` OR (`shared_at` set AND the customer or account is visible to `user`) OR `mailbox_owner is NULL` (seeded or logged rows, unchanged).
- `Email` gains `shared_at`, `shared_by`. Migration: every row with a mailbox owner starts unshared.
- **Aggregates** whose output others see (contact sentiment, headlines, anomalies, attributes, metrics, scenarios, AI summaries) read only *shared* mail: `shareable_emails_q()` = shared or ownerless. One person's private mail never shapes what a colleague sees.
- `MailMessage` (the whole mailbox) is already owner-only. Agents that read a person's mail act for that person, except for decision 5.

Every reader classified (audit 2026-10-17) is listed in §4.

### Add to Revenact

- `POST /api/v1/communications/emails/<id>/share/` and `DELETE …/share/`: owner only, whole thread (every filed message of the thread in the owner's mailbox). Audited `email.shared` / `email.unshared` with the count, no content.
- A mailbox message with a customer's people but not yet filed can be added too: `POST /api/v1/mail/messages/<id>/share/` files it on its matched customer and shares it (`CUSTOMER_NOT_FOUND` when no customer matches).

### Tests

The cross-path privacy test gains private-mail canaries. Another user's unshared mail, even their report's, never reaches the timeline, Communications, Copilot grounding, search, the MCP tools, aggregates or the API. Shared mail reaches exactly those who can open the customer.

## 2. The email agent (delivery 2)

Runs on the mail tick over newly synced **internal** messages: sender and every recipient are members of the workspace. One Gemini Flash-Lite call per message, with an enforced JSON schema: `{intent: none|meeting|task, topic, customer_name?, urgency: normal|urgent, meeting: {asked_for: [emails], length_minutes}, task: {assignee_email, title, due: tonight|tomorrow_morning|date|none, due_date?}}`. Each message is read once (rfc822 Message-ID, de-duplicated across the copies in both mailboxes), and the call is metered under purpose `email_agent`.

- **Task.** The assignee must be a member, and the asker (the sender) must be allowed to assign to them (`services/work/assignees`). Creates a `Task` with a source of `email_agent`, a due date and time, and the customer from the matcher or `customer_name`. It notifies both people and is undoable for 24 hours. A refusal (asker may not assign) becomes a suggestion to the asker instead.
- **Meeting.** The approver is decided as in decision 4. Creates a `MeetingProposal`: approver, requester, attendees (members), topic, customer, urgency, proposed slot, status. Work shows it with **Book** (as proposed, or edited) and **Dismiss**. Book uses `services/calendar/booking` on the approver's calendar, with the members invited by address.
- **Time zone.** Revenact has one time zone and set of working days per workspace (Work settings), not per person. "09:00 tomorrow" and working hours use the workspace's.
- **Free slot.** From `Meeting` rows of every attendee who has Calendar connected: the next 5 working days, 09:00–18:00 in the approver's time zone, the earliest 30 free minutes. "Urgent" looks from now. Attendees without Calendar are treated as free, and the item says so.

## 3. Frontend (delivery 3)

- Communications and timelines: **Add to Revenact** / **Remove from Revenact** on a customer conversation the reader owns, and a "Shared" mark. Others' shared mail shows whose it is.
- Work: the meeting proposal card (topic, who asked, attendees, proposed time with an edit control, Book, Dismiss), and email-born tasks with "From an email by Tushar" and Undo.

## 4. Email readers (audit)

Audit of every `Email` reader, 2026-10-17. All paths are under `services/`.

**Leaks today** (email content reaches non-owners even under the chain rule). These are fixed first in delivery 1:

1. `customers/headline_generation.py:127` sends every email on the record (subject, body) to the LLM. Headlines are read by anyone who opens the record. The fix is to read shared mail only.
2. `metrics/views.py:455` + `metrics/feedback.py:22,141`: anyone who can see the customer can PATCH an email's classification and get its labels and subject back (the feedback ledger, `views.py:401`). The fix is owner-only for email feedback, with the subject kept out of the ledger unless the email is shared.
3. `requests/gather.py:136-146,260`: feature-request names are written by the LLM from every email and shown to all. The fix is to read shared mail only.

**Rule copies** that must all switch to owner-or-shared:
- `customers/personal.py:118` (`readable_evidence_q`)
- `agents/threads.py:163-184` (`readable_threads`, `may_read_source`)
- `customers/communications.py:77,94` (the Team scope of replies owed becomes the reader's own only for mail)
- `copilot/views.py:118`

**Per-person reads through `visible_emails(_q)`** get the new rule by changing the one helper:
- customer and account email lists
- Communications detail
- contact history
- canvas last-contacted
- reply drafts
- interactions
- dashboard counts
- story sources
- translation
- MCP `recent_interactions`
- attachments
- Copilot retrieval and citations
- the reply draft view

**Aggregates seen by others** read shared (or ownerless) mail only, through `shareable_emails_q()`:
- headlines
- feature requests
- anomalies' `is_shared` (accepts shared mail, not just ownerless)
- attributes' `_SHARED`
- the knowledge brief, attributes and scenarios, which currently retrieve "as the record owner" and become shared-only
- contact sentiment (`contact_sentiment.py:77-90`, `models.py` rollups)

Last-contact dates and counts (`customers/contact.py`, `activity_tracking` for `SystemActor`) stay over all mail. They carry no content, and health needs them. The same goes, in delivery 1, for the health pulse's positive and negative conversation counts (`models.py` `SENTIMENT_SOURCES` rollups). That's a judgement call raised with the owner: they are counts, not content, and moving them changes every health score.

**Agents.** `agents/evidence.py` `_thread` and unanswered emails read the record owner's own mailbox. A bundle built from private mail is routed only to that mailbox's owner (today it is the owner's chain). `mail_replies.py:201` keeps the bundle gate and adds a mailbox-owner check.

**Owner actions** (sync, send, draft send, agent send, campaigns) are unchanged.

The stored embedding vectors (`copilot/embeddings.py`) are keyed by text hash and never returned as text, so they are unchanged.

## Out of scope

Customer-facing intents (a customer asking for a meeting), mail from people outside the workspace, Slack-born meetings, recurring meetings.

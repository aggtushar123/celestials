# Slack escalations, delivery 4 ("The thread decides"): API contract

Backend plan: `docs/superpowers/plans/2026-10-17-slack-escalations-d4-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-17-slack-escalations-d4-frontend.md` (branch
`feat/slack-escalations-d4`). Spec: react-ts-app `docs/superpowers/specs/2026-10-15-slack-escalations-design.md`
§2 (decisions 4 to 6, 10, 11), §5 (rewritten 2026-10-17 for D4), §6, §7, §8, §9 (the D4 row), §10, §11
(LC-D4a to LC-D4d), §14 Q2 and Q3, §15 and **§16.2** (on branch `feat/slack-escalations-d3` until it merges;
commit cbd3b5e5). The D1 and D2 contracts (`2026-10-15-slack-escalations-d1-api.md`, `-d2-api.md`, as built in
`docs/API_CONTRACTS.md`) and the agent bundles contracts still hold except where this file changes them.
Every path is under `/api/v1/`, every route is `IsAuthenticated` (401 without a token), every body is JSON.

This delivery replaces the D3 plans written earlier on 2026-10-17 from the old spec §5 (the platform picked
the person from the account team). Their survey, fixes and building blocks are carried over here: decisions
SE4-1 to SE4-21 are the old SE3-1 to SE3-21, renumbered, with the changes marked **(changed)**; SE4-22 onwards
are new. D4 needs nothing from D3 (all public channels): it works on today's one-channel Slack connection.

Merge order: this delivery's backend PR, then its frontend PR. What an old frontend sees between the two
merges: a Slack escalation bundle whose reply step is listed last (position order, as today) and whose
reply text holds placeholders it shows as chips (it already draws `placeholders`); a skipped Jira assign
step reads "Not run"; a participant who can't open the customer sees an empty reason and empty rationales and
a record link that opens a page they can't read (the page says so); the new keys (`escalation`, `note`,
`participant_view`, the story items' link keys, the Slack thread's `tickets`) are ignored. Nothing breaks.

**Migrations and D3.** D3 (all public channels) is planned on `feat/slack-escalations-d3` and also adds a
`customers.0063` and an `agents.0009` migration. Whichever of D3 and D4 merges second renames its migrations to
the next free numbers and points their dependencies at the first's (`makemigrations --check` fails until it
does); D3 also edits `providers/slack.py` `_replies` and `sync.file_conversation`, so the second to merge
rebases those hunks (both keep every behaviour).

## What the merged code does today (backend main ccc5d8a; frontend main f44f679f)

The survey (carried over from the replaced D3 contract, re-checked against the same heads, rows 29 to 34
new). **exists** = reuse as it is; **partial** = reuse and extend; **missing** = build. Line numbers are main's.

| # | Piece D4 needs | State | Evidence |
|---|---|---|---|
| 1 | A bundle runs its steps in position order, each in its own transaction, and passes each applied step's outputs to later steps (`{{step N.key}}`) | **exists** | `agents/bundle_run.py:395-401` (`run_bundle` loop, `outputs[done.position] = done.outputs`), `:229-234` (`placeholders.fill` before apply, `NeedsStep` -> "Needs step N, which didn't run."), `placeholders.py:81-96` (`outputs_for`: `ticket_key`, `ticket_url` are `TEXTS`) |
| 2 | ... into a reply's text | **partial** | `bundle_run.py:230-232` fills with `skip=REGISTRY[kind].customer_facing`; `slack_replies.py:340` `customer_facing=("text",)`, so a reply is never filled; `placeholders.check` refuses any placeholder in a customer-facing field at proposal (`placeholders.py:106-108`); `slack_replies.edit` refuses one on edit with `TO_CUSTOMER` (`:193-194`); `bundle_payloads.editable_keys` drops any field holding one (`:153-156`) |
| 3 | `jira.create` in the connection's default project | **exists** | `actions/jira_issues.py:50-76` (`validate`: project from `ctx.jira_connector`, D3-20), `:258-321` (`apply`: label per step, Retry looks it up first), `CHOOSE_PROJECT` / `sentences.JIRA_NO_PROJECT`; `evidence._jira:568-593` picks the thread's own Jira connection, else the workspace's **oldest enabled** one (`order_by("pk")`): the owner's answer, kept |
| 4 | ... whose description ends with the Slack link | **missing** | `jira_issues._fields:234-237` writes only "Created by <name> from Revenact." |
| 5 | ... filed at once on the organisation as a `Ticket` | **missing** | `apply` returns only `{ticket_key, ticket_url}` (`:254-255`); the sync files by reporter email (`connectors/sync.py:45-56`), and a made issue (`made_here`, `providers/jira.py:331-335`) never wakes an agent and is never kept for matching, so KAN-1 / SUP-1 never reached an organisation (spec §1) |
| 6 | ... with a Jira remote link back to the thread | **missing** | `JiraProvider` has create, find, assign, comment only (`providers/jira.py:229-293`) |
| 7 | `jira.assign` of `{{step N.ticket_key}}` to a member by email | **exists** | `jira_issues.py:31` (`STEP_KEY`), `:352-369`, `:372-382`, `:189-208` (`account`: member's login email -> `tool.account_for`) |
| 8 | ... skipped, not failed, when the member has no Jira user (`if_found`) | **missing** | `account` raises `Refused(sentences.no_user(...))` (`:206-207`), so the step fails; no run outcome "skipped" exists (`kinds.py:61-69` has only `StepFailed`; `Status.SKIPPED` means "not ticked", `bundles.py:69-77`) |
| 9 | ... proposed with nobody yet | **missing** | `validate_assign` refuses a missing member (`:374-376`) |
| 10 | A reply in the thread | **exists** | `actions/slack_replies.py:34-54` (posts where the thread is, D3-20; one reply per conversation, `target` `draft:conversation:N`), `:267-313` (`apply`, Retry finds the post by its metadata key) |
| 11 | Who the reply posts as: the person who runs the bundle when they linked Slack, else the bot | **exists, exactly** | `outside/tools.py:96-140` `SlackTool.post(..., actor)`: the runner's own `SlackLink` token in the same Slack team (`slack_links.person_token`), falling back to the bot when the person can't post there (`PERSON_CANT_POST`) or their token was revoked (the link is marked lost); `slack_replies.apply` passes `actor=actor` (`:293-301`) and records `slack_as` (`:207`). **Reused unchanged**: a participant who accepts posts as themselves. |
| 12 | The panel says who it posts as | **partial** | `slack_replies.preview:93-106` always names the bot ("Posts as alfiee") even when the reader will post as themselves |
| 13 | A Work to-do for a person, linked to the customer | **exists** | `actions/tasks.py:155-235` (`task.create`: `create_validate` drops an assignee who can't open the record; `_assignee` at run: the member if they can open it, else the record's owner, else the runner): the owner's answer "the to-do goes to the owner" is this rule |
| 14 | `handler_for(record, function, organisation_id=...)` | **exists** | `knowledge/ownership.py:81-131` (D2, SE2-7); no caller yet: the fallback (SE4-4) |
| 15 | `SlackConversation`, its poster as a member | **exists** | `customers/models.py:1803-1883`; `started_by` is the member who linked that Slack user (#139), else the member with the poster's email (`connectors/sync.py:248-254`, `linked_members:233-245`) |
| 16 | ... `external_shared` kept current | **partial** | the connection's `config["external_shared"]` is refreshed each pass (`sync.py:342`) but the conversation's own flag is written only when it is created (`sync.py:315`) |
| 17 | The agent's Slack thread signals | **exists** | `SignalThread.conversation` (`agents/models.py`), `intake.answered` (`intake.py:146-155`), `evidence._thread` Slack branch (`evidence.py:501-523`) |
| 18 | ... the thread's facts the bundle needs (shared, poster, link, people) | **partial** | `ctx.thread_slack` carries id, record, connector, channel, channel_name, thread_ts, usable (`evidence.py:515-523`); no `external_shared`, poster, url or people |
| 19 | Our reply posted **as a person** reads as ours | **missing (a gap since #139)** | a person-token post is a human message to the sync: `_replies` reads no metadata (`providers/slack.py:295-343`), `_apply_thread` counts it as new human text (`sync.py:207`) and wakes the agent, `answered` counts only our bot (`intake.py:154-155`). With posting as the accepter, every escalation reply would wake the agent again |
| 20 | Escalation or not, which department, **the decision** | **missing** | `prompt.THREAD_SYSTEM:187-223` and `ThreadAnswer:243-247` know no "function" and no "decision"; the reply is optional (`OUTSIDE_COMMON:150-156`) |
| 21 | One bundle with the four steps, the reply last, the template | **missing** | `intake_bundles.place:140-264` places the model's items in its order, nothing more |
| 22 | The prompt's Slack rules | **partial** | `OUTSIDE_RULES["slack.reply"]` says "the conversation's Slack thread" (`prompt.py:141-142`); `OUTSIDE_COMMON[0]` forbids `{{step N.key}}` in every reply (`:150-154`) |
| 23 | Who may accept: the thread's participants | **missing (changed: was "route to the escalating colleague", deferred)** | deciding needs the record's owner, their chain, view-all or a queue's role (`deciding.decided_as:83-105`), and only after `may_read_source` (`:86-87`); the read rule is the record's readers and the sources' readers (`bundles.readable:204-220`); Mine lists bundles by the steps on the reader's Me desk (`work/feed_decide.py:165-173`, `waiting_bundles:109-122`) |
| 24 | `Ticket.conversation` and both-way links | **missing** | `Ticket` (`customers/models.py:1640-1801`) has no link; story items `_slack` / `_ticket` (`organizations/story/items.py:150-171`) and `GET /slack-conversations/<id>/` (`customers/slack_views.py`) show none |
| 25 | Send to Revenact (#139, #140; frontend #161): a person's own Slack message to Work, its Jira issue and reply | **exists, separate flow; one gap** | `work/models.py:161-221` (`SlackSuggestion`), `work/slack_actions.py` (`create_issue`, `send_reply` with `{issue}`). It files no Ticket and assigns nobody, so D4 does not build on it. **But `send_reply` posts the Jira key and link into any channel, Slack Connect included: owner decision 11 ("never") is broken there.** SE4-19 closes it. |
| 26 | Frontend: the bundle panel | **partial** | `components/work/BundlePanel.tsx:396-456` (reason at `:396`, the record link at `:407-411`, steps by position); `PlaceholderText.tsx` draws chips read-only; `BundleOutsideFields.tsx` (slack.reply) a plain textarea; `bundleText.stepStateText:232-239` "Not run" for every skipped step; no handler, decision or Change |
| 27 | Frontend: Send to Revenact row | **exists, unchanged** | `components/work/SlackMessageRow.tsx` shows a refusal's `detail` verbatim, so SE4-19's sentence needs no frontend change |
| 28 | Frontend: the organisation story, Tickets, the thread sheet | **partial** | `StoryItemRow.tsx` (no link lines), `SlackThread.tsx` (no tickets), `features/organizations/slackApi.ts` |
| 29 | The model reads the whole thread | **partial** | `evidence._thread` shows the newest `THREAD_MESSAGES = 8` messages (`evidence.py:389`, `:509-513`), 600 characters each: a decision 9 or more messages back is never seen |
| 30 | Who a Slack mention is | **missing** | a stored message keeps `user_id`, `name`, `text` (`sync._apply_thread:190-199`); `<@U0FAIZ>` in a text is never resolved; `SlackLink` (`connectors/models.py:252-300`) and `linked_members` resolve posters only |
| 31 | A member by a plain name | **exists** | `metrics/proposals.match_member:374-385` (the one active member with that exact name, else that name ignoring case): reused for full names; first names are new (SE4-24) |
| 32 | A bundle's decider list for one bundle only | **missing** | rights are by record and source, never by bundle (`deciding.decided_as`) |
| 33 | Hiding a bundle's reason and rationales for a reader | **missing** | `_one` always sends `reason` (`bundle_payloads.py:347`), `step_payload` always sends `rationale` (`:279`); evidence is already view-all only (`:304-307`) |
| 34 | Frontend: a Work row's record link | **exists** | `components/work/FeedRowParts.tsx:49` links `item.record` always |

## Decisions narrowing the spec

| # | Decision | Cost if wrong |
|---|---|---|
| SE4-1 | **Scope (changed).** The escalation bundle (SE4-2 to SE4-6), the person from the thread's decision (SE4-22 to SE4-24) with `handler_for` as the fallback (SE4-4), the reply's Jira key and link (SE4-6, SE4-7), the issue filed at once, linked and remote-linked (SE4-8), the Jira assignment that skips (SE4-9, SE4-10), the person's block and its Change route (SE4-12, SE4-13), participants who may accept with the participant view (SE4-25, SE4-26), "posts as you" (SE4-15), our person-posted replies never waking an agent (SE4-16), both-way links (SE4-17), the prompt (SE4-18), and the Slack Connect rule closed in Send to Revenact (SE4-19). | Low. |
| SE4-2 | **What an escalation is (changed).** A message bundle answering a **Slack conversation** whose answer (a) has at least one action and (b) has a `jira.create`, **or** names a valid `function`, **or** carries a decision that passes SE4-22. Anything else (another channel, `"actions": []`, a reply-only answer with no function and no decision) is placed exactly as today. Small talk answered `"actions": []` makes no bundle (spec §5.1, LC-D4d). | Low. |
| SE4-3 | **The steps and their order** (positions are run order; spec §5.5). (1) the model's **first** `jira.create`, its `assignee_member_id` cleared (the platform assigns in step 2); (2) `jira.assign` of `{{step 1.ticket_key}}` to **the escalation's person** (SE4-4), `if_found` (SE4-9); (3) `task.create` for them: title `"<record name>: <issue summary>"`, due in 3 days, priority the issue's (`high`/`medium`/`low`, else `medium`); then the model's other steps, at most 4 (`prompt.MAX_ACTIONS` minus the four); then (last) `slack.reply` (SE4-5). Steps 2 and 3 are added **only when step 1 was placed**. The model's own `jira.assign` and `task.create`, and any second `jira.create` or `slack.reply`, are dropped (counted in `dropped`). Every added step goes through the same checks as the model's (`run._consider`: the kind's level, Never drops it; evidence; the twice-filter; one open twin), citing the thread's first line. | Low. |
| SE4-4 | **The escalation's person (changed).** First the thread's decision (SE4-22 to SE4-24): `via` `"thread"` when it resolves to an active member, `"unresolved"` when the thread named someone no member matches (nobody yet, the panel offers Change). With no decision: the answer's `"function"` (one of `User.Function`, else null) and `knowledge.ownership.handler_for(record, function, organisation_id=<the workspace>)`, kept only when they are an active member of the workspace: `via` `"team"`, `"head"` or `"nobody"`. Stored on the bundle (`AgentBundle.escalation`, §1.2). The to-do's assignee is the person only when they may open the record (`task.create`'s own rule); otherwise its preview names nobody and the run gives it to the record's owner (owner answer, accepted). | Low: a decided person who can't open the customer is assigned in Jira, and the to-do goes to the owner. |
| SE4-5 | **The reply is always there** (spec §5.5). The model's `slack.reply` is kept when it passes every check and, where an issue was placed in a channel not shared outside, carries `{{step N.ticket_key}}` (its numbers rewritten to the issue's step); otherwise the platform writes the **template** (§3). A reply is left out only when `slack.reply` is on Never or its checks drop even the template. | Low. |
| SE4-6 | **The reply may carry the Jira key and link** (spec §5.8): `{{step N.ticket_key}}` and `{{step N.ticket_url}}` only, N an **earlier `jira.create` or `jira.assign`** of the same bundle, only in an escalation's reply (`payload.escalation` set by the server, never the model) in a channel **not shared outside**. Checked at proposal (`placeholders.check`), on every edit (`slack_replies.edit`, against the channel's state now) and at run (`run_step` fills only these keys; SE4-7). Any other placeholder in a reply is refused as today (`TO_CUSTOMER`); in an escalation reply whose channel is not shared a wrong one reads "A reply can carry only the Jira key and link of an earlier step." The reply's `text` stays **editable** with its placeholders (an exception to D12 for this one field). Labels change everywhere: `ticket_key` -> "Jira key from step N", `ticket_url` -> "Jira link from step N". | Low. |
| SE4-7 | **Shared (Slack Connect) channels never carry the key or link** (owner decision 11). "Shared" is the conversation's `external_shared` **or** its connection's `config["external_shared"]`; each sync now also refreshes the conversation's own flag. Shared when proposed: the template has no key or link and no placeholder is accepted. Shared **after** the proposal: the run leaves the placeholders unfilled and the reply fails with "This channel is now shared outside your company, so the reply can't carry the Jira link. Take it out, then Retry." | None. |
| SE4-8 | **The issue from a conversation** (spec §6). A `jira.create` proposed on a Slack conversation's record carries `conversation_id`, `slack_url` and `slack_channel`. Its Jira description is the text, then "From Slack: <thread url>", then the usual footer. When it is made (or found again by a Retry) the run **files a Ticket at once** on the step's record (`connector` the Jira connection, `external_id` and `ticket_number` the key, `title` the summary, `status` open, `priority` the step's, `assignee_name` "Unassigned", `department` the connection's (blank for connection 6, owner answer), `external_url` the issue's, `description` the text, `requester_name` the runner, `opened_at` the workspace's today, `conversation` set), unless the connection doesn't cover that record; a Ticket already there for that key only gains its `conversation`; later syncs update it (`file_ticket`'s existing branch); and **adds a remote link** (`POST /rest/api/3/issue/{key}/remotelink`, `globalId` `revenact-slack-<conversation id>`, title "Slack: #<channel> thread"). A refused or unanswered remote link is the step's **note** "Couldn't add the Slack link in Jira. The description has it.", never a failure. Filing never fails the step (logged). | Low: an issue moved to a project the connection doesn't sync is not updated after filing. |
| SE4-9 | **`jira.assign` in an escalation** (spec §5.7). Proposed with the person as `assignee_member_id`, or with nobody (allowed only in an escalation), `if_found: true`. At run: a person picked from Jira's list wins; else the member by login email; **no Jira user with that email** -> **skipped** with the note "<First name> has no account in Jira, so the issue is unassigned. Their to-do is in Work."; nobody at all -> fails with today's "Choose who to assign it to, then Retry.". Any other Jira refusal fails as today. Steps without `if_found` are unchanged. A successful assign also writes the person's name on the filed Ticket's `assignee_name`. | Low. |
| SE4-10 | **A step can end skipped at run.** New kind outcome `kinds.Skipped(note, result=None)`: status `skipped` with `result.note`, `decided_by` the runner, nothing applied, no outputs, audited `agent_action.skipped`. Not a failure: the bundle ends `done` when every other chosen step applied (`bundles.outcome` already leaves skipped steps out). It can't be retried. | Low. |
| SE4-11 | **A step's `note`** (§2.1): `result.note`, else `""`. Today only SE4-8 and SE4-9 write one. | None. |
| SE4-12 | **A bundle's `escalation` block (changed)** (§2.2), null for every other bundle: the person (no email), `via`, the decision's author and quote, the department, `can_change`. | None. |
| SE4-13 | **`PATCH /agents/bundles/<id>/handler/` (changed)** (§4): the panel's Change (spec §5.5). `{"user_id": n}` picks **any active member** of the workspace (`via` `"chosen"`; no department or record check: a person who can't open the record gets the Jira assignment and the to-do goes to the owner, SE4-4); `{"user_id": null, "function": f}` asks `handler_for` again. It rewrites the waiting steps 2 and 3 together (a person picked from Jira's list on step 2 is cleared) and, while the reply is still the template the platform wrote, the reply's text too; it is an edit (`edited_at`). The decision (author, quote) stays on the block, so the panel can still say where the work was first assigned. | Low. |
| SE4-14 | **Routing is unchanged (changed: no longer deferred).** `routing.route` (owner, department, admins) stays. The replaced plan's "route to the escalating colleague" is not needed: the thread's participants reach the bundle as deciders (SE4-25). | None. |
| SE4-15 | **Who the reply posts as** is `SlackTool.post`'s rule, unchanged (row 11): the accepter's Slack link in the connection's team, else the bot. The preview says so per reader: `as_you` true and `as` the reader's name when they have a usable Slack link in the connection's team; else the bot's name. One query per page for the reader's link (`bulk`). | None. |
| SE4-16 | **Our replies never wake an agent, whoever they post as.** The sync reads replies with their metadata; a reply carrying our step key (`metadata.event_type == "revenact_step"`) that is not a bot post is stored with `"via_app": true`. Such a message is not new human text (no `touch_conversation`), answers the thread (`intake.answered`), reads in the agent's lines as "we wrote (as Tushar Aggarwal)", and is never a decision or a participant's message (SE4-22, SE4-25). A top-level message carrying our key never starts a conversation. | None. |
| SE4-17 | **Linked both ways** (spec §6). `Ticket.conversation` (FK `SlackConversation`, SET_NULL, `related_name="tickets"`). The story's Slack item carries its tickets; a ticket item carries its thread; `GET /slack-conversations/<id>/` carries its tickets (§2.3 to §2.5). **Twice-filter:** a linked side is named only when the reader may read it on its own: its department (`visible_tickets` / `visible_conversations`' rule) and the same record as the side they are reading; otherwise counted in `hidden_links`, never named. | None. |
| SE4-18 | **Prompt (changed)** (spec §7, §5.2): §5. | Low. |
| SE4-19 | **Send to Revenact keeps the key and link out of shared channels** (owner decision 11, row 25; the owner accepted fail-closed). `POST /work/slack-messages/<id>/reply/` with text carrying the row's Jira key, link or `{issue}` asks Slack (`conversations.info`, as the person when linked, else the bot) whether the channel is shared outside; shared, or Slack can't say: 400 `{"detail": "This conversation is shared outside your company, so the reply can't carry the Jira link. Take it out, then send."}` (shared) or `{"detail": "Couldn't check whether this conversation is shared outside your company, so the reply can't carry the Jira link. Take it out, or try again."}`. Text without the key is posted as today, with no check. | Low: a direct message whose check fails can't carry the link until Slack answers. |
| SE4-20 | **Ceilings** (§6): pinned by tests, measured during the build, recorded in "Changes during the build". | Low. |
| SE4-21 | **Privacy.** No email is added to any answer or stored: a Slack email resolves a member at sync and is dropped (SE4-24). The person's name reaches the bundle's readers and the reply's channel. Audit metadata holds ids and codes only, never text. The reply's text and the decision's quote are never logged. | None. |
| SE4-22 | **The decision** (spec §5.2). The answer may carry `"decision": {"message": <n>, "quote": "<the words that decide>", "assignee": "<the person as written: a Slack mention like <@U0FAIZ>, or a name>"}` or null. The platform keeps it only when: `message` is the number of a message in the thread's lines (absolute, 1-based, as the lines number them); that message is a person's (not `bot`, not `via_app`); its author resolves to an active member (SE4-24 rules 1 and 2); the quote, whitespace folded and case ignored, is in that message's text (it is stored as people read it, each `<@U...>` shown as "@<their Slack name>", at most 200 characters); the quote is not a bare mention (SE4-23); `assignee` is not empty. A decision that fails any check is dropped (logged as a code, never the text) and the fallback applies. The newest decision wins: the model is told so; the platform keeps the one it gives. | Medium: a colleague whose Slack resolves to no member (no Slack link, a Slack email unlike their login) can't make a decision; the fallback assigns instead. Owner question 1. |
| SE4-23 | **A bare mention is no decision** (owner default). The quote with every `<@U...>` mention, every name typed with "@" ("@Faiz") and every punctuation mark removed, split into words, and the words `cc`, `fyi`, `ping`, `fwiw`, `see`, `also`, `heads`, `up`, `+1` removed: **no word left** is a bare mention. "<@U0FAIZ>", "cc <@U0FAIZ>", "<@U0FAIZ> fyi", "+1 <@U0FAIZ>", "heads up <@U0FAIZ>", "@Faiz" are bare; "<@U0FAIZ> can you take this?", "<@U0FAIZ> will handle it", "let's give this to Faiz", "Faiz is on it" are not. The prompt states the same rule in words (§5); the platform's check is the backstop. | Low: an odd phrasing ("@Faiz pls") counts as a decision; a person reviews before Run. |
| SE4-24 | **Who the named person is** (spec §5.3). (1) `assignee` is a mention `<@U...>`: that Slack user's member in the conversation's `people` map, which the sync fills (§1.3): the member who **linked** that Slack user in the connection's team (`SlackLink`, #139), else the active member whose login email is that **Slack user's email** (`users.info`, read at sync, used and dropped); (2) a **plain name**: among the thread's `people` (posters and mentioned users), the one whose name or first name equals it (case ignored), resolved as in (1); else the one active member of the workspace with that full name (`match_member`), else the one active member with that first name; (3) **nobody**: `via` `"unresolved"`, the panel shows "The thread named Faiz, but no member matches. Choose who handles this." and Change. The sync resolves at most 30 people a pass (`users.info`, Tier 4); a mention it didn't resolve yet is nobody until the next pass. | Low: two members with the same first name and no mention: nobody, Change. |
| SE4-25 | **Participants may accept** (spec §5.6; a rights change the owner approved). A **participant** is a member found in the conversation's `people` map for the author of a message in the thread that is not a bot's and not `via_app`. When a bundle is made from a Slack conversation, its participants are stored as `BundleParticipant` rows (§1.4); they are fixed for that bundle (a refresh makes a new bundle with its own). A participant may **decide** every step of that bundle (new role `participant`, after the existing roles, in `deciding.decided_as`, and **instead of** the source-read rule `may_read_source`: they wrote in that thread), **read** it (`bundles.readable` adds `id IN` the reader's participant bundles), and finds it in **Work › Mine** while it waits (the feed's bundle source adds them, routing ignored). Change (SE4-13) is open to them. Nothing else changes: other bundles, records, threads and tickets keep today's rules. | Medium: a participant who would not otherwise read the Slack connection's department now runs that bundle. They wrote in the thread, so they already read it in Slack. |
| SE4-26 | **The participant view** (spec §5.6 privacy rule). A reader who may read the bundle **only** as a participant (not by today's read rule) gets `participant_view: true`, `reason: ""`, every step's `rationale: ""`, `evidence: []` (already view-all only), the record as `{type, id, name, can_open: false}`, and the Work row's `record` with `can_open: false` and `detail.reason: ""`. They still get the source block (the thread they wrote in), the escalation block (the decision and its quote), every step's `fields` and `preview` (exactly what Jira, Slack and the to-do will receive; free text that leaves Revenact never carries internal titles, D3-19 `internal_mentions`). Every other reader is unchanged (`participant_view: false`, `can_open: true`). | Low: a participant sees less context than an owner; they have the thread. |
| SE4-27 | **The template's words name the person's own department.** `<handler> (<Function>)` uses the person's `User.function` label (blank function: the name alone). For a head or an account-team person that is the asked department, as before. | None. |
| SE4-28 | **The model reads the whole stored thread for Slack.** `evidence._thread`'s Slack branch shows every stored message (at most 50, `SlackConversation.MAX_MESSAGES`), 600 characters each, numbered as today; mail and tickets keep `THREAD_MESSAGES = 8`. The thread's people follow its lines (`"    slack people: <@U0FAIZ> is Faiz Jamal; <@U0JESH> is Jesh Sanghvi"`, names only). | Low: a long Slack thread costs about 8,000 more input tokens a read. |

## 1. Data

### 1.1 `Ticket.conversation` (`customers.0063_escalation_links`)

| Field | Type | Notes |
|---|---|---|
| `conversation` | FK `customers.SlackConversation`, SET_NULL, null, `related_name="tickets"` | the Slack thread the issue was made from (SE4-17) |

### 1.2 `AgentBundle.escalation` (`agents.0009_escalation_participants`)

JSON, default `{}` (not an escalation). For an escalation:

```json
{"function": "engineering", "user_id": 11, "via": "thread", "issue": 1, "shared": false,
 "first": "Tushar",
 "decision": {"by": "Jesh Sanghvi", "by_id": 12, "quote": "Faiz, can you take this?", "named": "Faiz", "ts": "1792041450.000100"},
 "reply": "Thanks Tushar. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}) with Faiz Jamal (Customer Success)."}
```

`function` `""` when the model named none; `user_id` null for nobody; `via` `thread`, `unresolved`, `team`,
`head`, `nobody` or `chosen` (SE4-13); `issue` the `jira.create` step's position or null; `shared` the channel's
state at proposal; `first` the first name of the person who started the thread ("" when unknown); `decision`
null when the thread decided nothing (SE4-22); `reply` the template text the platform stored, `""` when the
model's reply was kept.

### 1.3 Slack conversations (`customers.0063_escalation_links`)

`SlackConversation.people` (JSON, default `{}`): `{slack user id: {"name": str, "member": int | null}}` for the
thread's posters and the users its messages mention, filled by the sync (SE4-24). Names only; never an email.
A message entry in `messages` may carry `"via_app": true` (SE4-16), present only when true.

### 1.4 `BundleParticipant` (`agents.0009_escalation_participants`)

| Field | Type | Notes |
|---|---|---|
| `bundle` | FK `AgentBundle`, CASCADE, `related_name="participants"` | |
| `user` | FK `User`, CASCADE, `related_name="+"` | an active member when stored |

Unique on (`bundle`, `user`). Index on (`user`, `bundle`).

## 2. Shapes

### 2.1 Step (agent bundles contract §4.1), one new key

| Key | Type | Notes |
|---|---|---|
| `note` | string | SE4-11: "" when none |

`preview.slack` gains `as_you` (boolean): `as` is then the reader's own name (SE4-15). In the participant view
(SE4-26) `rationale` is `""`.

### 2.2 Bundle (contract §4), new keys

```json
"participant_view": false,
"record": {"type": "customer", "id": 29, "name": "Globex (QA)", "can_open": true},
"escalation": {
  "function": "engineering",
  "function_label": "Engineering",
  "handler": {"id": 11, "name": "Faiz Jamal", "function_label": "Customer Success"},
  "via": "thread",
  "decision": {"by": "Jesh Sanghvi", "quote": "Faiz, can you take this?", "named": "Faiz"},
  "can_change": true
}
```

`record.can_open` false only in the participant view. `escalation` is `null` for any other bundle;
`function` and `function_label` `""` when none was named; `handler` null for nobody (`via` `unresolved` or
`nobody`); `decision` null when the thread decided nothing (it stays after a Change); `can_change` is true while
the bundle waits and the reader may decide every waiting step 2 or 3.

The Work feed row (contract §4.3): `record` gains `can_open` (false only in the participant view) and
`detail` gains `participant_view`; `detail.reason` is `""` in the participant view.

### 2.3 Story item, kind `slack` (`GET /organizations/<id>/story/`, `GET /accounts/<id>/story/`), two new keys

```json
"tickets": [
  {"id": 812, "number": "KAN-2", "status": "in-progress", "assignee": "Faiz Jamal",
   "url": "https://alfiee.atlassian.net/browse/KAN-2"}
],
"hidden_links": 0
```

Oldest first. `assignee` null when the ticket says "Unassigned" or nothing; `url` only https, else null.
`hidden_links`: linked tickets the reader may not read (SE4-17).

### 2.4 Story item, kind `ticket`, two new keys

```json
"from_slack": {"id": 41, "channel": "#all-alfiee", "started_by": "Tushar Aggarwal"},
"hidden_links": 0
```

`from_slack` null when the ticket has no conversation, or the reader may not read it (then `hidden_links` is 1).

### 2.5 `GET /slack-conversations/<id>/`, two new keys

`tickets` and `hidden_links` as §2.3.

## 3. The reply template (SE4-5, SE4-27)

`<first>` is the first name of the person who started the thread (the member's name when `started_by` is set,
else the Slack name's first word); `<person>` the escalation's person and `<Function>` their own department's
label; `<k>` the issue's step.

| Case | Text |
|---|---|
| issue, not shared, person | `Thanks <first>. Logged as {{step <k>.ticket_key}} ({{step <k>.ticket_url}}) with <person> (<Function>).` |
| issue, not shared, nobody | `Thanks <first>. Logged as {{step <k>.ticket_key}} ({{step <k>.ticket_url}}).` |
| issue, shared, person | `Thanks <first>. We've logged this with <person> (<Function>).` |
| issue, shared, nobody | `Thanks <first>. We've logged this.` |
| no issue, person | `Thanks <first>. <person> (<Function>) has this.` |
| no issue, nobody | `Thanks <first>. We're looking into it.` |

With no first name, "Thanks." begins it; a person with no department reads as the name alone. The reply's
title is "Reply to <first> in Slack" ("Reply in Slack" with no name).

## 4. `PATCH /agents/bundles/<id>/handler/` (SE4-13)

Body `{"user_id": 13}` or `{"user_id": null, "function": "engineering"}`. `200 {"bundle": Bundle}`.
Refusals, in this order:

| # | Case | Status | Body |
|---|---|---|---|
| 1 | no token | 401 | DRF's |
| 2 | the reader may not read the bundle | 404 | `{"code": "NO_SUCH_BUNDLE", "detail": "No such bundle."}` |
| 3 | not an escalation | 409 | `{"code": "NOT_AN_ESCALATION", "detail": "Only an escalation has someone who handles it."}` |
| 4 | the reader may not decide a waiting step 2 or 3 | 403 | `{"code": "CANT_RUN_STEP", "detail": "You can't run step 2.", "step": <id>}` |
| 5 | the bundle is running, ran, rejected, expired or superseded | 409 | the bundle contract §9.2 body, with `bundle` |
| 6 | neither step 2 nor 3 waits | 409 | `{"code": "STEP_NOT_WAITING", "detail": "Only a waiting step can be changed.", "bundle": ...}` |
| 7 | `user_id` key missing | 400 | `{"user_id": ["This field is required."]}` |
| 8 | `user_id` null and `function` missing or not one of the six | 400 | `{"function": ["Choose a department."]}` |
| 9 | not a member of the bundle's workspace | 400 | `{"user_id": ["No such member."]}` |
| 10 | deactivated | 400 | `{"user_id": ["Faiz Jamal is deactivated. Pick an active member."]}` |

A refusal changes nothing. A change writes `agent_bundle.handler_changed` (§7).

## 5. Prompt (spec §7, §5.2, SE4-18)

For a Slack conversation, `THREAD_SYSTEM`:

- opens "A colleague raised this in your company's Slack, about the record <ref>: the thread's messages, oldest
  first, are under the record." (other channels keep "A customer conversation arrived on the record ...");
- asks for `"function"`: "the department that must act on it: one of cs, engineering, sales, analytics,
  leadership, other; null when nothing is needed.";
- asks for `"decision"`: "the newest message in the thread that gives the work to a named person, as
  {"message": <its number>, "quote": "<its exact words that give the work>", "assignee": "<the person exactly as
  written: a Slack mention like <@U0ABC> or a name>"}; null when no message does.";
- adds the rule: "Decide whether someone on the team must act on it (an escalation): a problem, a request,
  something broken. If so, propose a jira.create for the problem and name the department in "function"; the
  platform adds the assignment, the to-do and the reply in the thread, so propose no jira.assign and no
  task.create. Small talk, thanks or "done" need nothing: "actions": [], "function": null and "decision": null."
  (without Jira offered: "If so, name the department in "function"; the platform adds the reply in the
  thread.");
- adds the decision rule: "A decision gives the work to a named person: a request ("Faiz, can you take this?"),
  a statement ("<@U0FAIZ> will handle it", "Faiz is on it") or a proposal ("let's give this to Faiz"); someone
  offering themselves ("I'll take it") names themselves. A bare mention is not a decision: "<@U0FAIZ>", "cc
  <@U0FAIZ>", "<@U0FAIZ> fyi", or asking about someone ("has Faiz seen this?"). When the thread gives the work
  more than once, the newest wins. Never guess a person the thread does not name.";
- in a shared channel adds "This Slack channel is shared with people outside your company: a slack.reply never
  carries a Jira key or link.".

`OUTSIDE_RULES["slack.reply"]` is "A slack.reply answers the colleague in their thread: say what was done and who
has it." `OUTSIDE_COMMON[0]`'s "never {{step N.key}} in a reply" gains, for a Slack conversation not shared with
Jira offered only, ", except that a slack.reply may carry {{step N.ticket_key}} and {{step N.ticket_url}} of an
earlier jira.create". The one-reply rule and D3-20 stay.

## 6. Query ceilings (SE4-20)

| Pin | Before | Expected | Why |
|---|---|---|---|
| `THREAD_RUN_QUERIES` (a ticket thread; a Slack thread answered with a note) | 33 | 33 | not an escalation |
| `ESCALATION_RUN_QUERIES` (new: a Slack thread answered with an issue, a function and a decision) | | measured (about 57) | four steps' twin, refused, lock and insert reads; the decision's member read (1); `handler_for` only without a decision; the to-do's assignee check; the escalation's store (1); the participants' insert (1) |
| `MESSAGE_DETAIL_QUERIES` / `MESSAGE_HISTORY_QUERIES` | 9 / 9 | 10 / 10 | the reader's participant bundles, once per page (`bulk.participating`) |
| `OUTSIDE_DETAIL_QUERIES` / `OUTSIDE_HISTORY_QUERIES` | 9 / 8 | 11 / 10 | the reader's Slack link, and their participant bundles, once per page each |
| `StoryQueryCountTests.EXPECTED` | 30 | 30 | the book has no Slack item; a ticket's thread is joined |
| `STORY_SLACK_LINKS_QUERIES` (new: a page with Slack items) | | 30 + 1 | one read of their tickets, whatever their number |
| `SLACK_CONVERSATION_QUERIES` | 6 | 7 | its tickets |
| The Work feed's pins (`services/work/tests`) | as today | measured, + at most 1 | the participant bundles' `id IN` subquery rides on the existing counts; any extra is one read |

`PATCH .../handler/` is a write and is not pinned. No `DISTINCT`, no join made unique.

## 7. Audit

| Event | Actor | Target | Metadata |
|---|---|---|---|
| `agent_action.skipped` | the runner | the step | `kind`, `agent`, `before`, `after`, `bundle` (SE4-10) |
| `agent_bundle.handler_changed` | the reader | the bundle | `function`, `from`, `to` (user ids or null), `via` |
| `agent_action.approved` / `rejected` (existing) | the reader | the step | `decided_as` may now be `participant` (SE4-25) |

## 8. Not in this delivery

Every public channel (D3); escalations from email, Zendesk or Freshdesk; posting Jira status changes back to
Slack; a per-person Jira account setting (§14 Q2); an in-app ticket view (the Slack item's ticket line opens
Jira); participant rights on anything but the bundle made from their thread.

## 9. Owner set-up and live checks (Alfiee, dev DB org 4; spec §11)

Set-up: Jira connection 6 default project KAN, its department blank (owner answer: everyone who should see a
filed KAN ticket can); Jesh Engineering, Faiz Customer Success; Engineering head Jesh; Globex (QA)'s account
team Engineering Jesh (the fallback); **Tushar, Jesh and Faiz link their Slack** (Settings › Connections › Your
accounts), so their messages and mentions resolve to them and the reply posts as the accepter; the fast lane
on with Slack connection 7; Faiz invited to alfiee.atlassian.net with his login email (else step 2 is skipped
with its note).

- **LC-D4a** In `#all-alfiee` Tushar posts "Globex's CSV exports are failing since this morning"; Jesh replies in
  the thread "@Faiz can you take this?" (a Slack mention). One bundle: "Reply in Slack" first ("Runs last, once
  the Jira issue exists"), then Create a Jira issue (KAN), Assign it to Faiz Jamal, A to-do for Faiz Jamal;
  `Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"`. It is in Tushar's and Jesh's Work › Mine.
- **LC-D4b** Tushar presses Run: KAN-n with "From Slack: <link>" and a Slack remote link, assigned to Faiz in
  Jira (or skipped: "Faiz has no account in Jira, so the issue is unassigned. Their to-do is in Work."); Globex
  (QA) › Tickets shows it at once with "From Slack: Tushar Aggarwal in #all-alfiee"; Conversations shows
  "KAN-n · Open · Faiz Jamal"; Faiz has the to-do in Work; the thread gets the reply with the real key and link,
  **posted as Tushar**, once; the next sync does not wake the agent.
- **LC-D4c** A new thread where Jesh only writes "cc @Faiz": the bundle says "No one was named in the thread, so
  it goes to Jesh Sanghvi (on Globex (QA)'s account team)".
- **LC-D4d** "Thanks, all good now" makes no bundle.

## Changes during the build

The build records here every change to this contract (with the measured ceilings), and relays each to the
frontend controller.

1. **CC-1, participants only on an escalation bundle (SE4-25).** `BundleParticipant` rows are stored only for an escalation bundle (spec §5.6); a non-escalation bundle from a Slack thread (a reply-only answer, say) keeps today's rights: no participants, no participant view. **Frontend impact:** none beyond not expecting `participant_view: true` on non-escalation bundles.
2. **CC-2, a refresh keeps the bundle and replaces its participants (SE4-25).** The code refreshes the waiting bundle in place (it is not a new bundle); its `BundleParticipant` rows are replaced by the refreshed thread's participants (one delete, one insert). A refresh that is no longer an escalation resets `escalation` to `{}` and leaves no rows. **Frontend impact:** none (the id may stay the same across a refresh, as today).
3. **CC-3, the prompt quotes names (§5, SE4-16, SE4-28).** The people line reads `slack people: <@U0FAIZ> is "Faiz Jamal"; ...` and a reply we posted as a person reads `we wrote (as "Tushar Aggarwal")`. Model-facing only. **Frontend impact:** none.
4. **CC-4 and CC-7, the run pin split in two (§6).** `ESCALATION_RUN_QUERIES = 63` (a Slack thread answered with an issue and a function, no decision) and `DECISION_RUN_QUERIES = 65` (the same with a decision), in `services/agents/tests/test_escalation_bundle.py`. Without a decision: the Slack thread answered with a note costs 37 (the ticket thread's `THREAD_RUN_QUERIES` stays 33); + `handler_for`'s account-team read (1); + three more steps' savepoint, twin, recently refused, bundle lock, insert, release (18); + the to-do's assignee check `can_open` (organisation, membership, role, reports, record: 5; its member read is saved, `escalation.read` seeds the context's member cache with the user `handler_for` loaded); + the stored reply's read and the escalation's store (2). With a decision: no `handler_for` (-1), the decision's author and person reads (+2), the to-do's member then cached (-1), the participants' insert (+1). A refresh of an escalation adds the participants' delete (1). The contract's estimate (about 57) started from 33 and counted `can_open` as one query. No `DISTINCT`. **Frontend impact:** none.
5. **CC-5, the sync pin and people resolved once (§1.3, SE4-24).** `SLACK_SYNC_QUERIES` 36 -> 38: each filed conversation with new people adds one query (active members of the workspace by lower-cased login email). The pass reads each stored conversation's `people` with its existing query; a Slack user already stored with a member is neither asked about (`users.info`) as a mention nor resolved again (its stored entry is kept); one stored with `member: null` is resolved again each pass. Posters are still read for their names every pass, as before. `THREAD_RUN_QUERIES` stays 33. **Frontend impact:** none.
6. **CC-6, "posts as you" pins (SE4-15).** `OUTSIDE_DETAIL_QUERIES` 9 -> 10 and `OUTSIDE_HISTORY_QUERIES` 8 -> 9 for the reader's Slack link, once per page (`Bulk.slack_link`); with CC-10 they end at 11 / 10, as §6 expected. **Frontend impact:** read `preview.slack.as_you` to say "Posts as you".
7. **CC-8 and CC-11, what a Change stores (§4, SE4-13).** `{"user_id": n}` stores `via: "chosen"` and `function` the body's when it is one of the six, else the stored one; `{"user_id": null, "function": f}` stores what `handler_for` returns (`"team"`, `"head"` or `"nobody"`) and `function: f`. Both store `"changed": true` (never in the API block), so a later Refresh keeps `user_id`, `via` and `function` (a kept person no longer an active member reads `via: "nobody"`). `escalation.reply` becomes `""` after a Change when the reply was no longer the template (someone wrote it), so later Changes leave it alone too. A Refresh that replaced or ended steps 2 and 3 between Change's check and its lock answers 409 `STEP_NOT_WAITING` and changes nothing. The block's person (name, department) is read with the page's people (`Bulk.names` now keeps `functions`): no query of its own; `MESSAGE_DETAIL_QUERIES` / `MESSAGE_HISTORY_QUERIES` stay 10 / 10. **Frontend impact:** after a department Change read `via` as `team`/`head`/`nobody` (not `chosen`).
8. **CC-9, `/work/assignees/` stays closed to participant-only readers.** A participant who can't open the customer still gets 404 there; they change who handles it through Change. **Frontend impact:** none.
9. **CC-10, participant pins, the reply gate, Team, the owner edge (SE4-25, SE4-26).** Each +1 is the reader's participation (`SELECT bundle_id FROM agents_bundleparticipant WHERE user_id = .. AND bundle_id IN (..)`), once per page: `MESSAGE_DETAIL_QUERIES` 9 -> 10, `MESSAGE_HISTORY_QUERIES` 9 -> 10, `OUTSIDE_DETAIL_QUERIES` 10 -> 11, `OUTSIDE_HISTORY_QUERIES` 9 -> 10; `BUNDLE_DETAIL_CEILING` 10 -> 11, `HISTORY_CEILING` 8 -> 9, `DETAIL_QUERIES` {notes 9, drafts_alice 10, drafts_carl 11}, `AUDIENCE_BASE_QUERIES` {11, 11}, `HISTORY_QUERIES` 8 -> 9, `DEPARTMENT_QUEUE_CEILING` 11 -> 12; Work `FEED_CEILING` 61 -> 62, `TEAM_CEILING` 46 -> 47, `PROPOSAL_NOTICE_CEILING` 41 -> 42 (there the +1 is `decided_as` asking a reader no record right holds for their participation, once per pass, constant in rows). `QUEUE_QUERIES`, `ROUTED_QUEUE_QUERIES` unchanged. No `DISTINCT`. The tool gate no longer refuses a participant's `slack.reply` ("You can't post in #x.") while the reply still goes to its own thread (same connection, synced); moved to another channel, that channel's department rule applies. A waiting bundle the reader took part in is on Mine and left out of My team and Rest of company. Participants are not sent the new-proposal notice. `participant_view` follows today's whole read rule, so an owner who can open the customer but does not read the Slack connection's department, and took part, gets the participant view with `record.can_open: false` (before D4 they could not read the bundle at all). **Frontend impact:** read `record.can_open` and `participant_view` as contracted; no new keys.
10. **CC-12, both-way link pins (§6, SE4-17).** `STORY_SLACK_LINKS_QUERIES = 31` (the story's 30 plus one `customers_ticket ... WHERE conversation_id IN (..)` read, constant over 1 or 7 linked threads); `SLACK_CONVERSATION_QUERIES` 6 -> 7; `StoryQueryCountTests.EXPECTED` stays 30 (a ticket's thread is a LEFT OUTER JOIN on its FK; its `messages` are deferred). `from_slack.started_by` is the linked member's name, else the Slack name. **Frontend impact:** none.
11. **Send to Revenact's check (SE4-19), as built.** The key is matched ignoring case, any "<jira host>/browse/" link counts, and a channel pending a Slack Connect invitation (`is_pending_ext_shared`) is shared; a `conversations.info` answer with no channel object is "can't say" (the second sentence). Sentences unchanged. **Frontend impact:** none.
12. **A skipped assign's note without a name** reads "They has no account in Jira, ..." only when the step names nobody it can read a first name from (not reachable from a decided or chosen person; kept as is). **Frontend impact:** none.
13. **Task 14.** The journey `e2e/test_slack_escalation_flow.py` reuses `Round2World.read_thread` with a new `extra=` argument (keys added to the model's answer). The pre-existing date-rot failure `test_notes_personal.NoteVisibilityTests.test_the_copilot_and_headlines_follow_the_rule` now dates its notes relative to today, and `services/mail/tests/test_mail.py` `SentimentOnSyncTests` dates its synced email inside the pulse's 30-day window (commit 9572b0b). **Frontend impact:** none.
14. **CC-13, final review fixes.** (a) SE4-6: an escalation reply's `text` stays in `editable` whatever its channel: once moved or shared, its Jira key and link are no longer open, and the person must be able to take them out after "This channel is now shared outside your company, ..." (a Retry with the new text posts). The edit still refuses adding them there (`TO_CUSTOMER`, `ONLY_JIRA` as before). (b) A Refresh keeps the person's kept `jira.create` as the escalation's issue first; the model's issue, however worded, is dropped, so a Refresh never leaves two `jira.create` steps. (c) SE4-8: any failure adding the remote link (not only a refusal) is the step's note, and filing's own lookups never fail the step. (d) SE4-9: the filed Ticket's `assignee_name` is written only with a real name (a picked Jira user without a name leaves it). (e) SE4-24: a Slack lookup that answers no name keeps the name stored before. **Frontend impact:** (a) only: a moved or shared escalation reply's text is editable (it was locked).
15. **CC-14, mentions read by name; the to-do names the record once.** `GET /slack-conversations/<id>/` `title` and `messages[].text`, the story's Slack item `title`, and the agents' Slack thread lines (so the evidence people read) show each `<@U...>` as "@<name>" from the conversation's `people`; one with no known name stays `<@U...>`. Stored text is unchanged; the people line the model reads is unchanged. The decision's quote is read back ("@<name>" of a known person to `<@U...>`) before it is checked against the stored text, so the quote and bare-mention checks are as before. The escalation's to-do title is the summary alone when it already starts with the record name (any case), else "<record name>: <summary>". **Frontend impact:** Slack text arrives with "@Name"; a raw `<@U...>` only when the person is unknown.

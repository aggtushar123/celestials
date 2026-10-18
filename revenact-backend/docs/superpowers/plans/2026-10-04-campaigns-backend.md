# Campaigns, backend (delivery 5 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `services/campaigns` in place: an owned, shared-like-segments campaign that emails, in plain text, the people one of its owner's segments reaches (Surveys' audience rules), records every send and every person on it, carries a one-click unsubscribe link, keeps a contact to one email per campaign and one campaign email every 3 days, and can be sent by a sixth rule action, "Send a campaign", through the Review Queue.

**Architecture:**
- `Campaign` gains an owner, sharing, a segment and roles; each send is a `CampaignSend` (subject and body frozen, counts frozen) with one `CampaignDelivery` per person checked. Hand-picked `recipients` stay as read-only history for migrated drafts. `Contact.campaigns_unsubscribed_at` is the opt-out.
- Who a campaign reaches is `services.surveys.audience.candidates` (split out of `resolve`, so both features agree), read as the campaign's owner; `campaigns.audience.build` then applies the five skips in order and Surveys' three-per-record cap.
- One service sends (`campaigns.sending`): `claim` locks the workspace `Organisation` then the campaign (`FOR NO KEY UPDATE`), builds the audience and writes the send and every delivery in one transaction; `deliver` emails each queued person outside any transaction, claiming each row with a conditional `UPDATE` so a resumed or concurrent delivery never emails anyone twice; `finish` freezes the counts. The API, the Review Queue's approve, a rule night "without review" and the nightly catch-up all call it.
- Rules gain the `campaign` action. `RuleReview` gains `kind` and its `run` becomes a foreign key unique on `(run, kind)`, so one night can hold a survey review and a campaign review.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL 16 in CI and production (partial unique constraints, `FOR NO KEY UPDATE`), `TestCase`/`APIClient`, `LiveServerTestCase` for e2e.

**Spec:** `react-ts-app/docs/superpowers/specs/2026-10-04-campaigns-design.md` (frontend repo, branch `feat/campaigns`), agreed with the owner on 2026-10-04. This plan covers its backend half: §0, §1 and §4 (the API contract, binding; no field is renamed). §2 is the frontend and is read here for context only.

**Branch:** `feat/campaigns` (already checked out at `f0a245d`, main with Plans #88). Stay on it and do not push.

**Merge order:** this backend PR merges and deploys **before** the frontend PR, and the two should merge back to back. Unlike Plans, this delivery **changes an existing API**: `campaigns/` responses lose `recipients`, `send_log`, `sent_count`, `skipped_count` and `sent_at`, and `POST campaigns/:id/send/` is removed (404). The old `/campaigns` pages stop working against the new backend until the frontend PR deploys. Every other change only adds: `RuleReview` payloads gain `kind`, a rule night's row gains `reviews`, the contact payload gains `campaigns_unsubscribed_at`, `Notification.kind` gains a choice, `Rule.Paused` gains a choice, a rule's `actions` gains a sixth type, and `POST rules/test/` gains an optional `campaigns` key.

## Contract notes

The frontend plan is reconciled against these. Each one either follows the real code where spec §4 disagrees with it, or settles something §4 leaves open.

1. **Re-subscribing goes through the existing `PATCH /api/v1/contacts/<id>/`** (`ContactDetailView`, `ContactSerializer`), as §4 says. It answers 200 with the **whole contact payload** (`ContactSerializer`'s fields), which gains `campaigns_unsubscribed_at: string | null` on every contact read (lists included). `campaigns_unsubscribed: false` clears it (a no-op, not audited, when it is already clear). `campaigns_unsubscribed: true` is refused: `400 {"campaigns_unsubscribed": ["Only the person can unsubscribe, with the link in a campaign email."]}`. Anyone who may open the contact may re-subscribe it (the route's own 404 scope).
2. **`SegmentRef.id` is `null` for a reader who may not read the segment**, as Surveys and Rules already do (`segment_ref`): `{id: number | null; name: string; kind}`. A shared reader of a campaign usually cannot read its owner's private segment.
3. **`POST campaigns/:id/preview/` also takes optional `subject` and `body`** (`{contact?, subject?, body?}`): the unsaved text the editor shows, checked as a save would check it (lengths, merge fields: `400 {"subject": [...]}` / `{"body": [...]}`). Missing ones use what is stored. It needs a saved campaign, so the `/campaigns/new` editor saves the draft before its first preview. Refusals: no segment `400 {"detail": "Choose a segment first."}`; nobody to email `400 {"detail": "Nobody in this segment can be emailed right now."}`; a `contact` the campaign would not email now `400 {"contact": ["Choose someone this campaign would email."]}`. The footer's link is `<FRONTEND_URL>/u/preview`.
4. **Send refusals are all `400 {"detail": <message>}`**, checked in this order: `EMAIL_NOT_SET_UP`, "This campaign is archived.", "Choose a segment first." (no segment, or its segment was deleted), **"Write a subject and a body first."** (not in §4; an empty subject or body), then, under the claim, "Nobody in this segment can be emailed right now.". Nothing is written for any of them.
5. **`Audience.reach` is how many would be emailed now; `Counts.reached` is everyone checked** (`sent + Σ skipped`, which at the claim is queued plus skipped). People beyond Surveys' three-per-record cap are neither reached nor skipped: as in Surveys, the skips are applied first and the cap then applies to who is left, so a record still gets up to three emails when its first champion has unsubscribed.
6. **`Audience.skipped` and every `Counts.skipped` carry all six reasons**, zeros included. `failed` is always 0 in `Audience` and in a review's counts.
7. **The public route is `/api/v1/campaigns/unsubscribe/<token>/`** as §4 says (Surveys' link lives under `/api/v1/public/`). Every bad link (unknown, malformed, older than 365 days) is `404 {"detail": "This link has expired."}`. A throttled request is DRF's `429 {"detail": "Request was throttled. Expected available in N seconds."}` with `Retry-After`. GET answers `{"workspace": "<organisation name>"}` for a valid link even when the contact is already unsubscribed; POST answers 204 either way.
8. **`GET campaigns/`**: `tab` defaults to `mine` (an unknown value reads as `mine`); `archived=1` **adds** archived campaigns to the tab (without it they are left out); newest `updated_at` first, then id; 50 a page; `next` is an opaque cursor string, and a malformed one reads as the first page.
9. **The 51st campaign** answers `400 {"non_field_errors": ["You can own at most 50 campaigns."]}` (segments and plans answer 400 for their limits).
10. **A segment the caller may not read, or does not own,** is `400 {"segment": ["Choose one of your own segments."]}` on create and PATCH (Surveys answers 404/403 there; a field refusal matches §4's `{field: [message]}` rule and says nothing about whether it exists).
11. **`PATCH campaigns/:id/ {status}`** accepts only `archived` and `active`; anything else is `400 {"status": ["Choose archived or active."]}`. `active` on an archived campaign makes it `active` if it has sends, else `draft`; on any other campaign it changes nothing. An archived campaign may still be edited; only sending refuses it.
12. **`name` is required on create** (`400 {"name": ["Give it a name."]}`); `subject` and `body` may be blank until sending. `roles` default to Champion and Decision Maker; for a contact segment they are stored as `[]`; for an organisation or account segment at least one is needed (`400 {"roles": ["Choose at least one role."]}`, Surveys' copy).
13. **`CampaignSend.rule`** is `null` when the send was not from a rule or the rule was deleted; `{id: null, name: "a rule"}` for a reader who may not read the rule (a rule's name is its owner's words, as Plans ruled for `started_by_rule`).
14. **Deliveries** are listed in send order (ascending id), 50 a page; `hidden` counts the deliveries under the same `status`/`reason` filters whose contact the reader may not open now. An unknown `status` or `reason` value is ignored. `record` is the contact's organisation (`kind: "organization"`) or account.
15. **Sends** are listed newest first, 20 a page, to anyone who may read the campaign. `counts` are always whole (numbers only, §1.7).
16. **A rule's `campaign` action is read back as `{action: "campaign", campaign: {id, name} | null, without_review}`**: `null` once the campaign is deleted; an archived one is still named (the rule is paused by then). It is **accepted on write either as `campaign: <id>` or as `campaign: {id, ...}`**, so the builder can send back what it read (as the `plan` action).
17. **A rule night's campaign result:**
    - with review: `{"action": "campaign", "status": "queued", "detail": "waiting for your review"}`;
    - without review: `{"action": "campaign", "status": "done", "detail": "emailed"}` once the night has **claimed** the send (everyone queued); the emails go out after the night's transactions commit, and a person whose email then fails shows on the send's deliveries as `skipped`/`failed`, not on the night;
    - `{"action": "campaign", "status": "skipped", "detail": "nobody it could reach"}`;
    - `{"action": "campaign", "status": "failed", "detail": <the refusal's own words>}`, e.g. the `EMAIL_NOT_SET_UP` message, or `"its campaign can't be used"` when the campaign has no segment or its segment's kind no longer matches the rule's, or `"<ExceptionClass>: could not be done"`.
18. **`RuleReview`**: every review payload gains `kind: "survey" | "campaign"`. A campaign review carries `campaign: {id, name} | null`, `counts: {reach, skipped}` (all six reasons), and its `action` is the frozen action `{action: "campaign", campaign: <id>, without_review: false}`. Approving one answers `200 {"campaign_send_id": <id>}`; its refusals are stored in `result.error` and answered `400 {"detail": ...}` as a survey's are. Reviews made before this delivery are all `survey`.
19. **A rule's nights** (`GET rules/:id/runs/`): each row keeps `review` (the night's survey review, else its campaign review, `{id, status}` or `null`) and gains `reviews: [{id, kind, status}]` (survey first). `last_run.waiting` is true when any of the night's reviews waits.
20. **The owner's one review notice per night** covers both kinds: "A survey from your rules is waiting for your review." / "N surveys …" when all are surveys; "A campaign from your rules is waiting for your review." / "N campaigns from your rules are waiting for your review." when all are campaigns; "N emails from your rules are waiting for your review." when mixed. Link unchanged (`/brain/review`).
21. **`campaign_sent`** says "Win-back emailed 42 people · 6 skipped." ("1 person" when one; "· N skipped" left out when none), links to `/campaigns/<id>`, and goes to the owner only for a rule's send without review.
22. **The `Email` row a send files** on the contact's organisation or account carries the rendered subject and the rendered body **without the footer** (the footer holds the unsubscribe token, which is never stored), `sender_name` = the campaign owner's name and `campaign` = the campaign.

## Global Constraints

These are copied from the spec. Quoted text is verbatim.

- **Ownership (§1.1, §1.7).** `owner` "(FK, PROTECT)". "`sharing` (`private`/`people`/`workspace`) and `shared_with` (many-to-many to users), as on `segments.Segment`." "**Reading a campaign:** its owner, and the people it is shared with." "**Owner only:** edit, preview, audience, send, archive and delete. Anyone else who can read the campaign gets 403 "Only the campaign's owner can change it." Anyone who can't read it gets 404."
- **Fields and limits (§1.1).** "`name` (≤120), `subject` (≤150) and `body` (≤5000)." "`status`: `draft`, `active` or `archived`. A campaign becomes `active` on its first send. It can be sent again later, and it stays editable." "`recipients` is kept read-only." "an owner may own at most 50 campaigns. Archived campaigns count." `roles`: "The choices and defaults match Surveys' `RoleFields`: Champion and Decision Maker are ticked by default."
- **`CampaignSend` (§1.1).** `campaign`, `kind` (`manual`/`rule`), `rule` and `review` (SET_NULL), `sent_by` ("null for a send without review"), `status` (`sending`/`sent`), `started_at`, `finished_at`, frozen `subject`, `body` and `counts` `{reached, sent, skipped: {unsubscribed, already_received, recent_campaign, no_email, failed, over_limit}}`, `migrated`.
- **`CampaignDelivery` (§1.1).** `send`, `contact` (CASCADE), `status` (`queued`/`sent`/`skipped`), `reason`, `email` (SET_NULL), `token_hash` ("the hash of the unsubscribe token only; the token itself is never stored"), `sent_at`. "Constraint: unique (`send`, `contact`)." "Index: (`contact`, `sent_at`) for the 3-day gap."
- **`Contact.campaigns_unsubscribed_at`** "(DateTime, null), in a migration on `customers`."
- **Migration (§1.2).** Owner = "the `identity.OrganizationMembership` with `is_owner=True`; failing that, its first active admin". "`sharing` becomes `private`." A sent campaign "becomes `active` and gets one `CampaignSend` (`kind=manual`, `migrated=True`, `sent_by=null`)", each `send_log` entry a delivery "`sent` or `skipped` and reason `failed`, linked to the `Email` row (`Email.campaign`, matched by contact) where one exists"; "the old free-text `detail` is dropped". "A draft stays `draft` with `segment=null`. Its `recipients` are kept". "A campaign stuck at `sending` becomes `active`, with a send marked `sent` from whatever log it has." "The migration can be reversed (the reverse is a no-op for sends). A second migration drops `send_log` and `sent_at`." It must be safe on production's real rows: sent campaigns with logs, one stuck at `sending`, drafts with hand-picked recipients, names and subjects longer than the new limits.
- **Audience (§1.3).** "`audience.resolve(campaign.segment, campaign.roles, viewer=owner, today=…, records=…)`. It runs as the campaign's owner". "`records` is passed only for a rule send." Skips, first match wins: "1. `unsubscribed` … 2. `no_email` … 3. `already_received` … 4. `recent_campaign`: … any campaign of the workspace in the last 3 days. 5. `over_limit`: the send already has 500 people queued."
- **Sending (§1.4).** "With no SMTP configured, the send is refused with "Email isn't set up for this workspace yet, so campaigns can't be sent." (`EMAIL_NOT_SET_UP` in `validation.py`). Nothing is written." Claim: "Lock the workspace `Organisation` with `no_key`, as in Surveys' `claim`, then lock the campaign with `no_key`", resolve, write the send and deliveries, freeze `counts`/`subject`/`body`, set `active`. Delivery "outside any transaction, one queued delivery at a time": token, render, `send_campaign_email`, then "in one short transaction, create the `Email` row … and mark the delivery `sent`". "A failure marks that delivery `skipped`, reason `failed`; the log keeps only the exception class." "A crash leaves the send at `sending`. Its queued people stay queued and are never claimed by another send. `deliver(send)` is safe to run again". "The nightly rules step and the admin finish a `sending` send older than 10 minutes."
- **Rendering (§1.5).** `{first_name}` "the first word of the contact's name, or "there" when the name is empty"; `{organisation}` "the name of the contact's organisation, or of its account"; `{sender_name}` "the name of the campaign's owner". Any other field is refused: "Use {first_name}, {organisation} or {sender_name}." "Plain text and nothing is escaped into HTML." Footer: `—\n{sender_name}, {workspace name}\nUnsubscribe from these emails: {link}`, link `<FRONTEND_URL>/u/<token>`.
- **Unsubscribe (§1.6).** "public and throttled, like Surveys' public routes". GET `{workspace}`, 404 for any bad link. POST sets `campaigns_unsubscribed_at` "if it isn't already set", "idempotent and returns 204", "audited as `contact.campaigns_unsubscribed`, with `actor=null, via="link"`". "A token works for 365 days." Re-subscribe: `PATCH contacts/:id/ {campaigns_unsubscribed: false}`, "audited as `contact.campaigns_resubscribed`". Surveys are unaffected.
- **Visibility (§1.7).** "Sharing works as for segments: `pk__in` over the through table, never a join with `.distinct()`." "**Delete** is allowed only when the campaign has no sends; otherwise it is 409 "Archive it instead: it has been sent."" "**Deliveries** are filtered twice: a reader sees only the deliveries for contacts they may open, plus `hidden` …; `counts` stay whole".
- **Rules (§1.8).** Action `{action: "campaign", campaign: id, without_review: bool}`; the campaign "must be one the rule's owner owns, not archived, and have a segment of the same record kind as the rule's segment. Otherwise the refusal is "Choose one of your active campaigns for these records."" "A rule still has 1–3 actions, each type at most once." With review: "a `RuleReview` with `kind="campaign"`" holding the fired records and dry-claim counts; approving "claims and sends to those records through §1.4, at approval time"; "A Surveys-style refusal is stored on the review, which stays waiting." "Approve refuses when the campaign's record kind no longer matches." Expiry "after 7 days, or when the rule's segment or trigger changes". Without review: "the night claims and delivers at once. There is one send per rule per night. A re-run of the night finishes a send that was cut off." Nobody: "no review and no send". `campaign_gone`: "Its campaign was archived or deleted." "checked where `segment_gone` and `template_gone` are". Dry run adds `campaigns: {would_email, skipped}`. `RuleReview`: "Add `kind`: `survey` or `campaign`. Existing rows become `survey`." "Change `run` from one-to-one to a foreign key, unique on (`run`, `kind`)". "The owner gets one review notice per night, covering both kinds."
- **API (§1.9, §4).** Every path and field in §4 is binding and not renamed. "The old `campaigns/:id/send/` is removed."
- **Notifications, audit, logs, classification (§1.10).** Kind `campaign_sent` to the owner "when a send without review finishes". Audit, ids and counts only: `campaign.created|updated|shared|archived|deleted`, `campaign.send_started` (`{send, kind, counts}`), `campaign.send_finished`, `contact.campaigns_unsubscribed`, `contact.campaigns_resubscribed`; `rule.review_*` gains `kind`. "Logs carry ids and exception class names only, never addresses or bodies." Classification: subject and body are business content; unsubscribe tokens are secrets (hash only); `campaigns_unsubscribed_at` is contact preference data.
- **Docs (§1.10).** "API_CONTRACTS, audit-events, data-classification, PRD, TRD, schema and plan."
- **Out of scope (§3).** "HTML email, open and click tracking, scheduled sends, A/B tests, attachments, emailing people who aren't contacts, per-campaign footers, and reminders."

House rules (every task):

- **Visibility is `id__in`/`pk__in` subqueries, never joins plus `.distinct()`.** CI and production run PostgreSQL 16, where the join-and-DISTINCT shape cost about a second a call (fixed in #86). Campaigns shared by name are `pk__in=Campaign.shared_with.through.objects.filter(user_id=…).values("campaign_id")`; contacts a reader may open are `contact_id__in=Contact.objects.filter(visible_children_q(user)).values("pk")`. Tests assert that no read of `campaigns_campaign` or `campaigns_campaigndelivery` starts with `SELECT DISTINCT` (a `DISTINCT ON` for the last send per campaign is allowed, as `rules.payloads.last_runs`).
- **Row locks.** Every `select_for_update` runs inside `transaction.atomic()`. Locks for non-key updates are `select_for_update(no_key=True)` (`of=("self",)` when the query joins); deleting a campaign takes a plain `select_for_update(of=("self",))`. The order is fixed and never inverted against Surveys' `claim` (workspace → owner `User` → survey send), Plans' `start_plan` (workspace → record → template → plan) or a rule's night (rule → workspace → …):
  - a manual send: workspace `Organisation` → `Campaign`;
  - a rule's night: `Rule` → workspace (taken up front when the rule has a `plan` or `campaign` action) → record locks of the lifecycle action → Plans' locks → `Campaign`;
  - approving a campaign review: `Rule` (`no_key`) → `RuleReview` → workspace → `Campaign`. The rule lock comes first because the send's insert takes `FOR KEY SHARE` on the rule's row, and a rule edit holds the rule (`FOR UPDATE`) while it expires that rule's reviews;
  - editing, archiving or deleting a campaign takes the campaign's lock only.
- **Access checks carry `# SOC2:AUTH-02 <why>`**, and every `audit.record` call carries `# SOC2:LOG-01`. Audit `target_repr` is `"Campaign <id>"`, `"Campaign send <id>"`, `"Contact <id>"`: never a name, a subject or an address. Metadata carries ids, field names, codes and counts only.
- **Log lines carry ids and exception class names only**, never `str(exc)`, a name, a subject, a body or an address (an SMTP refusal spells out the recipient's address).
- **Tokens are stored as SHA-256 hashes only** (`services.surveys.tokens.new_token`/`hash_token`); the token exists in memory and in the email, nowhere else (not in the `Email` row, not in a log, not in audit metadata).
- **Public routes are throttled** (`core.throttling`, per source IP, rate in `AUTH_THROTTLE_RATES`, `None` under test unless patched) and carry `# SOC2:AUTH-02` and `# SOC2:AUTH-06`.
- Tests come in three tiers (skill `backend-testing`): unit (`TestCase`), integration (`APIClient`), e2e (`LiveServerTestCase` in `e2e/`). The privacy world is the rules fixture's: Carl (CSM) can open Pizza Hut, Pizza EMEA and Dough Co but not Taco Bell or Taco West; Dana is the reverse; Alice (admin) opens everything; Gus is another tenant.
- **The CI budget is tight** (about 27 minutes across four shards): each test class builds its data once with `setUpTestData`; nothing sleeps and no test starts threads; dates are passed in (`today=`, `now=`); limits are tested by patching the constant or by `bulk_create`, never by 50 API calls.
- Commands:
  - one module: `venv/bin/python manage.py test services.campaigns.tests.test_<area> --noinput`;
  - an app: `venv/bin/python manage.py test services.campaigns --noinput`;
  - the full suite: `venv/bin/python manage.py test --parallel --noinput` (serial runs hit the 30-minute CI timeout);
  - migrations: `venv/bin/python manage.py makemigrations --check --dry-run`;
  - the CI shard check: `venv/bin/python scripts/ci_shard_labels.py --check 4`;
  - lint: `venv/bin/ruff check .` and `venv/bin/ruff format --check .` (line length 100; rules E, F, I). Ruff also formats the Python fences inside Markdown, so run `venv/bin/ruff format <file.md>` on any doc you edit.
- Read endpoints pin their query counts: a test asserts that the count with one row equals the count with several, so an N+1 fails.
- Semgrep runs in CI. Return an opaque cursor string (`next`), never a built URL.
- Commits are conventional (`feat(campaigns): …`, `feat(rules): …`, `feat(contacts): …`, `test(e2e): …`, `docs(campaigns): …`). Every commit message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.

## Decisions made while planning

The spec left these open. The owner may overrule any of them; each is applied in the tasks below.

1. **The migration's owner fallback chain:** the organisation's `is_owner` membership's user; else its first active admin (`User.is_active`, role slug `admin`, by `date_joined` then id); else its first active member; else its first member. An organisation with no user at all cannot have anyone read its campaigns; its campaigns are deleted by the migration, which prints how many. Production has none (every workspace is created by a sign-up).
2. **Names and subjects longer than the new limits** are cut by the data migration (name to 120, subject to 150) before `0005` shrinks the columns; the frozen copy on a migrated send keeps the full original subject (its column is 255). Bodies are not cut (the column stays `TEXT`); an old body over 5000 characters is refused only when the owner next saves it.
3. **The per-record cap** (three per organisation or account) applies after the skips, to who is left, as in Surveys (contract note 5).
4. **"Already received" counts a `queued` delivery as well as a `sent` one, and so does "recent campaign".** A send cut off mid-delivery keeps its people queued (§1.4); counting them stops a second send, or another campaign, from claiming them before the first finishes.
5. **At most once per person, even on a crash.** `deliver` claims each queued delivery by writing its token hash in a conditional `UPDATE … WHERE status = 'queued' AND token_hash = ''`; only the worker whose update matched emails that person. A delivery still `queued` with a hash set was being emailed when its worker died: the stale catch-up (sends `sending` for 10 minutes or more) marks it `skipped`/`failed` rather than emailing it again.
6. **Without review, the night claims inside the rule's own transaction** (so "one send per rule per night" holds with the night's `RuleRun` uniqueness) and the emails go out from `_finish_night`, after every rule has committed, through the same catch-up (`deliver_pending`) that finishes stale sends. A send "without review" is a rule send with no review (`kind="rule"`, `review=None`); `deliver_pending` takes those at once and every other `sending` send only once it is 10 minutes old, so it never races a live request.
7. **The `Email` row's body omits the footer**, which carries the unsubscribe token (contract note 22); its `sender_name` is the owner's name (the old send used the workspace's name).
8. **Preview takes unsaved text** (contract note 3) because §2.2's preview "updates 400 ms after typing stops", which the stored campaign alone cannot do.
9. **Delivery rows for every skipped person**, `over_limit` included, are written at the claim (§1.4 step 3), in batches of 1,000, so the deliveries list explains every count.
10. **Lifecycle of statuses on PATCH** (contract note 11): archiving writes `campaign.archived`; un-archiving is `campaign.updated` with `fields: ["status"]`.
11. **The old tests are replaced, not kept.** `test_views.py`, `test_send_claim.py`, `test_concurrency.py` and `test_privacy.py` test routes and fields this delivery removes. Delivery 0's privacy rule (hand-picked recipients named only to readers who may open them) carries over to `legacy_recipients`/`legacy_hidden` and is re-tested there. The old two-thread race test (`test_concurrency.py`, which slept) is replaced by a lock-order test on captured SQL and a sequential test that a second claim sees the first one's queued people; the workspace lock is what serialises claims, as in Surveys.
12. **The data migration is tested the way `customers/tests/test_churn_reason_migration.py` tests 0028**: the migration module keeps its logic in importable functions that take the model classes as arguments (`owner_for(models, organisation_id)`, `move_campaign(models, row)`), its `forwards` only reads the legacy columns through the historical models and hands plain values over, and a `TestCase` imports the module with `import_module` and calls those functions with today's models and literal legacy values. No `TransactionTestCase`, no `MigrationExecutor`.
13. **`seed_demo_campaigns`** is rewritten for the new shape: one draft on a contact segment of Apple Inc's contacts, owned by the `--org-email` user, and one active campaign with one `migrated=False` manual send built from rows (no email is sent while seeding).
14. **The admin** lists campaigns and sends, and offers one action on sends, "Finish the selected sends", which calls `sending.resume` (§1.4: "the admin finish a `sending` send").
15. **The night's `run_rule` gains `now=None`** (defaulting to `timezone.now()`), passed down by `evaluate_rules`, so the campaign action's 3-day gap and its claim use the night's `now` in tests.

## Reuse map

Each helper below was read in the current code before this plan relied on it.

| Need | Source | Use |
|---|---|---|
| Who a segment reaches | `surveys.audience.resolve` → `_candidates` (`members_queryset` / `visible_records`, `_pool`, role rank, `visible_children_q(viewer)`), `surveys.models.PER_RECORD_CAP` | split out as `surveys.audience.candidates`; `campaigns.audience.build` |
| A segment the caller owns | `segments.access.get_readable`, `surveys.access.owned_segment` | `campaigns.access.owned_segment` (400, not 404/403; contract note 10) |
| Roles | `surveys.serializers.roles_field`, `clean_roles`, `NO_ROLES` | `campaigns.serializers` |
| Sharing like rules | `rules.access.readable_rules` (`pk__in` over the through table), `surveys.serializers.SendWriteSerializer.validate` (sharing checks), `surveys.views._changed`, `_record_shared` | `campaigns.access`, `serializers`, `audit` |
| Owner row lock for a limit | `rules.views._limit_reached` | `campaigns.views._limit_reached` |
| Workspace lock | `surveys.sending.claim` (`Organisation.objects.select_for_update(no_key=True).filter(...).values_list`) | `campaigns.sending.claim` |
| Email set up | `surveys.sending.email_is_set_up`, `Refusal`, `_reconnect`; `django.core.mail.get_connection` | `campaigns.sending` |
| Tokens | `surveys.tokens.new_token`, `hash_token`; `surveys.public_views.MAX_TOKEN_LENGTH`, `EXPIRED` | `campaigns.sending.deliver`, `campaigns.public_views` |
| Public throttle | `core.throttling._PerIPThrottle`, `SurveyLinkThrottle`; `AUTH_THROTTLE_RATES` in `config/settings.py` | `CampaignUnsubscribeThrottle` |
| Payload helpers | `organizations.rows.iso`, `person`; `surveys.payloads.readable_segment_ids`, `segment_ref` | `campaigns.payloads` |
| Contacts a reader may open | `customers.scoping.visible_children_q(user)` (`customer__in`/`account__in` subqueries) | payloads, deliveries |
| Cursor | `plans.listing.encode_cursor`/`decode_cursor` (base64 JSON; malformed or naive reads as the first page) | `campaigns.paging` |
| Notifications | `notifications.realtime.notify(*, recipient, actor, kind, message, link, push_on_commit)` | `campaigns.sending.finish` |
| Audit | `core.audit.record(action, *, request, actor, organisation, target, target_repr, metadata)` | everywhere |
| Rules plumbing | `rules.validation.CLEANERS`, `clean_actions`, `_integer`; `rules.actions.result`, `failed`, `QUEUED`, `DONE`, `SKIPPED`, `FAILED`, `NOBODY_TO_SURVEY`; `rules.nightly.pause_reason`, `_act`, `run_rule`, `_finish_night`, `_tell_owners`, `waiting_message`, `_unsent`; `rules.reviews._locked`, `_expire`, `_changed_since`, `_refused`, `Answer`, `Decided`, `send_review`, `skip_review`; `rules.payloads.template_names`, `action_refs`, `_row`, `review_of`, `last_runs`, `last_run_ref`, `runs_page`, `review_payload`, `plan_preview`; `rules.views.RuleTestView`, `ReviewListView`, `ReviewSkipView` | Tasks 10–12 |
| Test world | `rules.tests.fixtures.RuleFixture` (→ `SurveyFixture` → `SegmentFixture`: `org`, `admin`, `csm`, `other`, `stranger`, `pizza`, `taco`, `emea`, `west`, `dough`, `book`, `today`, `now`, contacts `ann`, `ben`, `tia`, `tom`, `dot`; `pinned`, `make_rule`, `changed`), `surveys.tests.fixtures.contact`, `segments.tests.fixtures.person` | `campaigns.tests.fixtures.CampaignFixture` |
| e2e HTTP | `e2e/http.py` `http_get`, `http_post`, `http_patch`, `http_delete` | Task 13 |

## File Structure

| File | Responsibility |
|---|---|
| `services/campaigns/models.py` (rewrite) | `Campaign` (owner, sharing, segment, roles, statuses), `CampaignSend`, `CampaignDelivery`, `SkipReason`; limits |
| `services/campaigns/migrations/0003_owner_sends.py` (generated), `0004_migrate_campaigns.py` (new, `RunPython`), `0005_drop_legacy.py` (generated) | New columns and tables; existing rows moved; legacy columns dropped, owner required, lengths shrunk |
| `services/customers/models.py`, `migrations/0052_contact_campaigns_unsubscribed_at.py` (generated) | `Contact.campaigns_unsubscribed_at` |
| `services/customers/serializers.py`, `views.py` (modify) | `ContactSerializer` reads `campaigns_unsubscribed_at`, takes `campaigns_unsubscribed: false`; `ContactDetailView.perform_update` audits it |
| `services/notifications/models.py`, `migrations/0006_campaign_sent.py` (generated) | `campaign_sent` |
| `services/campaigns/validation.py` (new) | Every refusal's UI copy; `merge_field_errors` |
| `services/campaigns/rendering.py` (new) | Merge fields, footer, link, `render`, `compose` |
| `services/surveys/audience.py` (modify) | `candidates` split out of `resolve` (behaviour unchanged) |
| `services/campaigns/audience.py` (new) | `Reach`, `valid_email`, `build` (skips, cap, limit) |
| `services/campaigns/access.py` (new) | `readable_campaigns`, `get_readable`, `get_owned`, `owned_segment` |
| `services/campaigns/paging.py` (new) | Opaque cursors |
| `services/campaigns/payloads.py` (new) | `campaign_rows`, `campaign_payload`, `send_payload`, `send_rows`, `deliveries_page` |
| `services/campaigns/serializers.py` (rewrite) | `CampaignWriteSerializer`, `PreviewSerializer` |
| `services/campaigns/audit.py` (rewrite) | `record`, `changed_fields` |
| `services/campaigns/sending.py` (new) | `before_claim`, `claim`, `deliver`, `finish`, `tally`, `resume`, `deliver_pending`, `sent_message` |
| `services/campaigns/views.py`, `urls.py` (rewrite) | Every authenticated route |
| `services/campaigns/public_views.py` (new) | `UnsubscribeView` |
| `services/campaigns/admin.py` (rewrite) | Campaigns, sends, "Finish the selected sends" |
| `services/campaigns/management/commands/seed_demo_campaigns.py` (rewrite) | Demo rows in the new shape |
| `services/email.py` (modify) | `send_campaign_email(address, subject, body, *, connection=None)` |
| `core/throttling.py`, `config/settings.py`, `core/logging.py` (modify) | `CampaignUnsubscribeThrottle`, rate `campaign_unsubscribe`; the unsubscribe token redacted from logged paths |
| `services/rules/models.py`, `migrations/0004_review_kind.py`, `0005_campaign_gone.py` (generated) | `RuleReview.kind`, `run` FK + unique `(run, kind)`; `Rule.Paused.CAMPAIGN_GONE` |
| `services/rules/validation.py`, `payloads.py`, `views.py`, `actions.py`, `reviews.py`, `nightly.py` (modify) | The `campaign` action end to end |
| `services/campaigns/tests/` (replace) | `fixtures.py`, `test_models.py`, `test_rendering.py`, `test_audience.py`, `test_reading.py`, `test_writing.py`, `test_sending.py`, `test_send_views.py`, `test_unsubscribe.py`, `test_migration.py`, `test_admin_seed.py` |
| `services/customers/tests/test_contact_campaigns.py` (new) | Re-subscribe and the payload field |
| `services/rules/tests/test_review_kinds.py`, `test_campaign_action.py` (new) | The review change; the rule action |
| `e2e/test_campaigns_flow.py` (new) | Build, preview, send, read, unsubscribe, send again |
| docs (modify) | `API_CONTRACTS.md`, `audit-events.md`, `data-classification.md`, `product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md` |

---

### Task 1: The new shape: owner, sharing, segment, sends, deliveries, the opt-out and the notice kind

Spec §1.1, §1.10 (kind). Legacy columns (`send_log`, `sent_at`) and the legacy statuses (`sending`, `sent`) stay until Task 9 moves the rows off them, so every commit in between keeps the suite green.

**Files:**
- Modify:
  - `services/campaigns/models.py` (rewrite)
  - `services/customers/models.py` (`Contact.campaigns_unsubscribed_at`)
  - `services/notifications/models.py` (`Notification.Kind.CAMPAIGN_SENT`)
- Create:
  - `services/campaigns/migrations/0003_owner_sends.py` (generated)
  - `services/customers/migrations/0052_contact_campaigns_unsubscribed_at.py` (generated)
  - `services/notifications/migrations/0006_campaign_sent.py` (generated)
- Test:
  - `services/campaigns/tests/fixtures.py` (new)
  - `services/campaigns/tests/test_models.py` (replace the old file entirely)

**Interfaces:**
- Consumes: `rules.tests.fixtures.RuleFixture` (reuse map).
- Produces:
  - `services.campaigns.models`: `MAX_OWNED = 50`, `MAX_SHARED = 50`, `MAX_NAME = 120`, `MAX_SUBJECT = 150`, `MAX_BODY = 5000`, `GAP_DAYS = 3`, `MAX_PEOPLE = 500`, `LINK_DAYS = 365`, `STALE_MINUTES = 10`, `DEFAULT_ROLES = ("champion", "decision_maker")`; `SkipReason` (`UNSUBSCRIBED`, `NO_EMAIL`, `ALREADY_RECEIVED`, `RECENT_CAMPAIGN`, `OVER_LIMIT`, `FAILED`); `default_roles() -> list`, `empty_counts() -> dict`;
  - `Campaign` with `Status` (`DRAFT`, `ACTIVE`, `ARCHIVED`, legacy `SENDING`, `SENT`) and `Sharing` (`PRIVATE`, `WORKSPACE`, `PEOPLE`); fields `organisation, owner (null until Task 9), name, subject, body, status, segment, roles, sharing, shared_with, recipients, send_log, sent_at, created_at, updated_at`; related names `sends` (from `CampaignSend`), `User.campaigns`, `User.shared_campaigns`, `Segment.campaigns`; `str() == f"Campaign {pk}"`;
  - `CampaignSend` with `Kind` (`MANUAL`, `RULE`) and `Status` (`SENDING`, `SENT`); fields `campaign, kind, rule, review, sent_by, status, started_at, finished_at, subject, body, counts, migrated`; related name `deliveries`; `str() == f"Campaign send {pk}"`;
  - `CampaignDelivery` with `Status` (`QUEUED`, `SENT`, `SKIPPED`); fields `send, contact, status, reason, email, token_hash, sent_at`; `Contact.campaign_deliveries`; `str() == f"Campaign delivery {pk}"`;
  - `Contact.campaigns_unsubscribed_at`; `Notification.Kind.CAMPAIGN_SENT = "campaign_sent"` ("Campaign sent").
  - Test helpers in `services/campaigns/tests/fixtures.py`: `CampaignFixture(RuleFixture)` adds `cls.people` (Carl's contact segment "Champions" pinning Ann and Dot); classmethods `make_campaign(*, owner=None, segment=None, **fields) -> Campaign` and `make_send(campaign, people=(), *, at=None, status="sent", kind="manual", **fields) -> CampaignSend` (one `sent` delivery per person); `api(user)`, `events(action)`, `notes(kind)`, `mail_to()` (the `To` address of each message in `mail.outbox`).

- [ ] **Step 1: Write the fixture and the failing tests**

Create `services/campaigns/tests/fixtures.py`:

```python
"""The campaigns tests' shared world, built once per test class
(`setUpTestData`): the rules fixture (Alice the admin opens everything;
Carl owns Pizza Hut, Pizza EMEA and Dough Co, Dana owns Taco Bell and Taco
West, and neither CSM can open the other's; Gus is another tenant; Ann is
Pizza Hut's champion, Ben Pizza EMEA's decision maker, Dot Dough Co's
champion, Tia and Tom Dana's champions; Carl's segment "My book" pins Pizza
Hut and Dough Co), plus Carl's contact segment "Champions" pinning Ann and
Dot."""

from django.core import mail
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.accounts.models import User
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend
from services.notifications.models import Notification
from services.rules.tests.fixtures import RuleFixture

SUBJECT = "Hello {first_name}"
BODY = "We miss you at {organisation}.\n{sender_name}"


class CampaignFixture(RuleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.people = cls.pinned("contact", [cls.ann, cls.dot], name="Champions")

    @classmethod
    def make_campaign(cls, *, owner=None, segment=None, **fields):
        """Carl's draft "Win-back" with a subject and body, on no segment
        unless told otherwise."""
        values = {"name": "Win-back", "subject": SUBJECT, "body": BODY, **fields}
        return Campaign.objects.create(
            organisation=cls.org, owner=owner or cls.csm, segment=segment, **values
        )

    @classmethod
    def make_send(cls, campaign, people=(), *, at=None, status="sent", kind="manual", **fields):
        """A send of `campaign` with one `sent` delivery per person, as if it
        went out at `at` (default: the fixture's `now`)."""
        at = at or cls.now
        send = CampaignSend.objects.create(
            campaign=campaign,
            kind=kind,
            status=status,
            started_at=at,
            finished_at=at if status == "sent" else None,
            subject=campaign.subject,
            body=campaign.body,
            **fields,
        )
        CampaignDelivery.objects.bulk_create(
            [CampaignDelivery(send=send, contact=p, status="sent", sent_at=at) for p in people]
        )
        return send

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client

    def events(self, action):
        rows = AuditEvent.objects.filter(action=action).order_by("pk")
        return list(rows.values_list("target_id", "metadata"))

    def notes(self, kind):
        rows = Notification.objects.filter(kind=kind).order_by("pk")
        return list(rows.values_list("recipient_id", "message", "link"))

    def mail_to(self):
        return [message.to[0] for message in mail.outbox]
```

Replace `services/campaigns/tests/test_models.py` entirely:

```python
"""Unit tier: the tables, their defaults and constraints, and the two
fields other apps gain. No HTTP."""

from django.db import IntegrityError, transaction

from services.campaigns.models import (
    DEFAULT_ROLES,
    Campaign,
    CampaignDelivery,
    CampaignSend,
    SkipReason,
    empty_counts,
)
from services.campaigns.tests.fixtures import CampaignFixture
from services.notifications.models import Notification


class CampaignModelTests(CampaignFixture):
    def test_a_new_campaign_is_a_private_draft_with_the_default_roles(self):
        campaign = self.make_campaign()
        self.assertEqual(
            (campaign.status, campaign.sharing, campaign.roles, campaign.segment),
            ("draft", "private", list(DEFAULT_ROLES), None),
        )
        self.assertEqual(DEFAULT_ROLES, ("champion", "decision_maker"))

    def test_strings_name_the_row_by_id_only(self):
        campaign = self.make_campaign(name="Secret plan")
        send = self.make_send(campaign, [self.ann])
        delivery = send.deliveries.get()
        self.assertEqual(str(campaign), f"Campaign {campaign.pk}")
        self.assertEqual(str(send), f"Campaign send {send.pk}")
        self.assertEqual(str(delivery), f"Campaign delivery {delivery.pk}")

    def test_the_related_names(self):
        campaign = self.make_campaign(segment=self.people)
        send = self.make_send(campaign, [self.ann])
        self.assertEqual(list(self.csm.campaigns.all()), [campaign])
        self.assertEqual(list(self.people.campaigns.all()), [campaign])
        self.assertEqual(list(campaign.sends.all()), [send])
        self.assertEqual(self.ann.campaign_deliveries.get().send, send)

    def test_counts_start_empty_with_all_six_reasons(self):
        self.assertEqual(
            empty_counts(),
            {
                "reached": 0,
                "sent": 0,
                "skipped": {
                    "unsubscribed": 0,
                    "no_email": 0,
                    "already_received": 0,
                    "recent_campaign": 0,
                    "over_limit": 0,
                    "failed": 0,
                },
            },
        )
        send = CampaignSend.objects.create(
            campaign=self.make_campaign(), kind="manual", started_at=self.now
        )
        self.assertEqual(
            (send.status, send.counts, send.migrated), ("sending", empty_counts(), False)
        )
        self.assertEqual(len(SkipReason.values), 6)

    def test_one_delivery_per_send_and_contact(self):
        send = self.make_send(self.make_campaign(), [self.ann])
        with self.assertRaises(IntegrityError), transaction.atomic():
            CampaignDelivery.objects.create(send=send, contact=self.ann)

    def test_a_token_hash_is_unique_but_many_may_be_blank(self):
        send = self.make_send(self.make_campaign())
        CampaignDelivery.objects.create(send=send, contact=self.ann)
        CampaignDelivery.objects.create(send=send, contact=self.dot)
        CampaignDelivery.objects.filter(contact=self.ann).update(token_hash="a" * 64)
        with self.assertRaises(IntegrityError), transaction.atomic():
            CampaignDelivery.objects.filter(contact=self.dot).update(token_hash="a" * 64)

    def test_a_reason_only_on_a_skipped_delivery(self):
        send = self.make_send(self.make_campaign())
        CampaignDelivery.objects.create(
            send=send, contact=self.ann, status="skipped", reason="no_email"
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            CampaignDelivery.objects.create(
                send=send, contact=self.dot, status="sent", reason="failed"
            )

    def test_deleting_a_contact_deletes_its_deliveries_not_the_send(self):
        send = self.make_send(self.make_campaign(), [self.ann, self.dot])
        self.ann.delete()
        self.assertEqual(list(send.deliveries.values_list("contact", flat=True)), [self.dot.pk])

    def test_a_contact_starts_subscribed(self):
        self.ann.refresh_from_db()
        self.assertIsNone(self.ann.campaigns_unsubscribed_at)

    def test_the_new_notification_kind(self):
        self.assertEqual(Notification.Kind.CAMPAIGN_SENT, "campaign_sent")
        self.assertEqual(Notification.Kind.CAMPAIGN_SENT.label, "Campaign sent")

    def test_newest_edit_first(self):
        older = self.make_campaign(name="Older")
        newer = self.make_campaign(name="Newer")
        self.assertEqual(list(Campaign.objects.filter(pk__in=[older.pk, newer.pk])), [newer, older])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_models --noinput`
Expected: ERROR, `ImportError: cannot import name 'DEFAULT_ROLES' from 'services.campaigns.models'`.

- [ ] **Step 3: Write the models**

Replace `services/campaigns/models.py` entirely:

```python
"""Campaigns: one owner's plain-text email to the people one of their
segments reaches.

Spec: react-ts-app docs/superpowers/specs/2026-10-04-campaigns-design.md. A
`Campaign` is reusable and owned, shared like a segment. Each send is a
`CampaignSend` with its subject, body and counts frozen, and one
`CampaignDelivery` per person checked: queued, sent, or skipped with its
reason. Only the hash of a delivery's unsubscribe token is stored. There is
no task queue: a send is claimed in one short transaction and delivered in
the request (`sending.py`).

`recipients`, `send_log` and `sent_at` are the hand-picked shape from before
segments: `recipients` stays as read-only history for migrated drafts;
`send_log` and `sent_at` are dropped by migration 0005 once 0004 has moved
them into sends."""

from django.conf import settings
from django.db import models
from django.db.models import Q

#: One owner may own at most this many campaigns, archived ones included.
MAX_OWNED = 50
#: A campaign is shared by name with at most this many teammates.
MAX_SHARED = 50
MAX_NAME, MAX_SUBJECT, MAX_BODY = 120, 150, 5000
#: A contact gets at most one campaign email from the workspace in this many days.
GAP_DAYS = 3
#: One send queues at most this many people; the rest are skipped `over_limit`.
MAX_PEOPLE = 500
#: An unsubscribe link works for this many days after its email went out.
LINK_DAYS = 365
#: A send still `sending` this long after it started is finished by the night or the admin.
STALE_MINUTES = 10
#: Ticked for organisation and account segments unless the owner says otherwise.
DEFAULT_ROLES = ("champion", "decision_maker")


class SkipReason(models.TextChoices):
    UNSUBSCRIBED = "unsubscribed", "Unsubscribed"
    NO_EMAIL = "no_email", "No email address"
    ALREADY_RECEIVED = "already_received", "Already received it"
    RECENT_CAMPAIGN = "recent_campaign", "Emailed in the last 3 days"
    OVER_LIMIT = "over_limit", "Over the 500-person limit"
    FAILED = "failed", "The email could not be sent"


def default_roles():
    return list(DEFAULT_ROLES)


def empty_counts():
    return {"reached": 0, "sent": 0, "skipped": {reason: 0 for reason in SkipReason.values}}


class Campaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"
        # Before segments only: migration 0004 moves every row off these two,
        # and 0005 removes them.
        SENDING = "sending", "Sending (before segments)"
        SENT = "sent", "Sent (before segments)"

    class Sharing(models.TextChoices):
        PRIVATE = "private", "Only me"
        WORKSPACE = "workspace", "Everyone in the workspace"
        PEOPLE = "people", "Chosen teammates"

    organisation = models.ForeignKey(
        "accounts.Organisation", related_name="campaigns", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="campaigns",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Null only until migration 0004 fills it; 0005 makes it required.",
    )
    name = models.CharField(max_length=255, default="Untitled Campaign")
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    segment = models.ForeignKey(
        "segments.Segment",
        related_name="campaigns",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who it goes to: one of the owner's own segments.",
    )
    roles = models.JSONField(
        default=default_roles,
        blank=True,
        help_text="Contact.Role values, in the order ticked. Empty for a contact segment.",
    )
    sharing = models.CharField(max_length=16, choices=Sharing.choices, default=Sharing.PRIVATE)
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="shared_campaigns", blank=True
    )
    recipients = models.ManyToManyField(
        "customers.Contact",
        related_name="campaigns",
        blank=True,
        help_text="Hand-picked before segments. Read-only history; nothing writes to it.",
    )
    send_log = models.JSONField(default=list, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["organisation", "sharing"]),
            models.Index(fields=["owner", "status"]),
        ]

    def __str__(self):
        # The name is the owner's own words; an audit row carries the id only.
        return f"Campaign {self.pk}"


class CampaignSend(models.Model):
    """One send of a campaign, with what went out frozen."""

    class Kind(models.TextChoices):
        MANUAL = "manual", "Sent by hand"
        RULE = "rule", "From a rule"

    class Status(models.TextChoices):
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"

    campaign = models.ForeignKey(Campaign, related_name="sends", on_delete=models.CASCADE)
    kind = models.CharField(max_length=8, choices=Kind.choices)
    rule = models.ForeignKey(
        "rules.Rule",
        related_name="campaign_sends",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    review = models.ForeignKey(
        "rules.RuleReview",
        related_name="campaign_sends",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who pressed Send now or approved the review; null for a send without review.",
    )
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.SENDING)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)
    # 255, not MAX_SUBJECT: a send migrated from before segments keeps its full subject.
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    counts = models.JSONField(
        default=empty_counts,
        blank=True,
        help_text="{reached, sent, skipped: {<reason>: n}}, frozen at the claim and the finish.",
    )
    migrated = models.BooleanField(
        default=False, help_text="Built by migration 0004 from a send before segments."
    )

    class Meta:
        ordering = ["-started_at", "-id"]
        indexes = [
            models.Index(fields=["campaign", "started_at"]),
            models.Index(fields=["status", "started_at"]),
        ]

    def __str__(self):
        return f"Campaign send {self.pk}"


class CampaignDelivery(models.Model):
    """One person on one send: queued, sent, or skipped with its reason."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        SKIPPED = "skipped", "Skipped"

    send = models.ForeignKey(CampaignSend, related_name="deliveries", on_delete=models.CASCADE)
    contact = models.ForeignKey(
        "customers.Contact", related_name="campaign_deliveries", on_delete=models.CASCADE
    )
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.QUEUED)
    reason = models.CharField(max_length=16, choices=SkipReason.choices, blank=True, default="")
    email = models.ForeignKey(
        "customers.Email", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    token_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="SHA-256 of the unsubscribe token; the token itself is never stored.",
    )
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["send", "contact"], name="one_campaign_delivery_per_contact"
            ),
            models.UniqueConstraint(
                fields=["token_hash"],
                condition=~Q(token_hash=""),
                name="campaign_delivery_token_unique",
            ),
            models.CheckConstraint(
                condition=Q(status="skipped") | Q(reason=""),
                name="campaign_delivery_reason_only_when_skipped",
            ),
        ]
        indexes = [
            models.Index(fields=["contact", "sent_at"]),
            models.Index(fields=["send", "status"]),
        ]

    def __str__(self):
        return f"Campaign delivery {self.pk}"
```

In `services/customers/models.py`, add to `Contact`, directly after `last_contacted_at`:

```python
    campaigns_unsubscribed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set by the unsubscribe link in a campaign email; cleared only by a "
        "person re-subscribing them. Surveys ignore it.",
    )
```

In `services/notifications/models.py`, add to `Notification.Kind` after `PLAN_TASK_ASSIGNED`:

```python
        CAMPAIGN_SENT = "campaign_sent", "Campaign sent"
```

- [ ] **Step 4: Generate the migrations**

Run:
```bash
venv/bin/python manage.py makemigrations customers --name contact_campaigns_unsubscribed_at
venv/bin/python manage.py makemigrations notifications --name campaign_sent
venv/bin/python manage.py makemigrations campaigns --name owner_sends
```
Expected: `customers/migrations/0052_contact_campaigns_unsubscribed_at.py` (one `AddField`), `notifications/migrations/0006_campaign_sent.py` (one `AlterField` of `kind`), `campaigns/migrations/0003_owner_sends.py` with `AddField` for `owner`, `segment`, `roles`, `sharing`, `shared_with`, `AlterField` for `status` (max 16, five choices) and `recipients` (help text), `AlterModelOptions` (ordering), two `AddIndex`, and `CreateModel` for `CampaignSend` and `CampaignDelivery` with their constraints and indexes. Open `0003_owner_sends.py` and check that its dependencies include `("customers", "0052_contact_campaigns_unsubscribed_at")`, `("rules", "0003_template_gone")` and `("segments", "0001_initial")`; add any that `makemigrations` left out. No existing row needs a value: `owner` and `segment` are nullable, and `roles`, `sharing`, `counts` have defaults.

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns services.customers.tests services.notifications --parallel --noinput`
Expected: PASS. The old campaign view tests still pass: they create campaigns without an owner (still nullable) and use `send_log`, `sent_at`, `sending` and `sent`, which all still exist.

Run: `venv/bin/python manage.py makemigrations --check --dry-run && venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: `No changes detected`; ruff clean.

- [ ] **Step 6: Commit**

```bash
git add services/campaigns/models.py services/campaigns/migrations/0003_owner_sends.py \
  services/campaigns/tests/fixtures.py services/campaigns/tests/test_models.py \
  services/customers/models.py services/customers/migrations/0052_contact_campaigns_unsubscribed_at.py \
  services/notifications/models.py services/notifications/migrations/0006_campaign_sent.py
git commit -m "feat(campaigns): owner, sharing, segment, sends and deliveries; contact opt-out

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Who a campaign reaches, and why the rest are skipped

Spec §1.3, the "Approach" decision ("call `services.surveys.audience.resolve` rather than copying it"). Contract notes 5 and 6. Decisions 3, 4 and 9.

**Files:**
- Modify: `services/surveys/audience.py` (split `candidates` out of `resolve`; behaviour unchanged)
- Create: `services/campaigns/audience.py`
- Test: `services/campaigns/tests/test_audience.py`

**Interfaces:**
- Consumes: `CampaignFixture`, `make_campaign`, `make_send` (Task 1); `surveys.audience._candidates`, `members_queryset`, `visible_records`; `surveys.models.PER_RECORD_CAP`.
- Produces:
  - `services.surveys.audience.candidates(segment, roles, viewer, *, today, records=None) -> (people: list[Contact], hidden: int, capped: bool)`; `resolve` now calls it.
  - `services.campaigns.audience`:
    - `HELD = ("queued", "sent")` (delivery statuses that count as "has it");
    - `valid_email(value) -> bool`;
    - `Reach` dataclass: `queued: list[Contact]`, `skipped: list[tuple[Contact, str]]`; `tally() -> dict` (all six reasons), `reach -> int` (property), `counts() -> dict` (`{reached, sent: 0, skipped}`), `payload(sample=20) -> dict` (`{reach, skipped, sample: [{id, name}]}`);
    - `build(campaign, *, today, now, records=None) -> Reach` (reads as `campaign.owner`; `campaign.segment` must not be None).

- [ ] **Step 1: Write the failing tests**

Create `services/campaigns/tests/test_audience.py`:

```python
"""Who a campaign reaches (spec §1.3): Surveys' audience as the campaign's
owner, then the five skips in order, then Surveys' cap of three per record,
then the 500 limit. Nothing is written."""

from datetime import timedelta
from unittest import mock

from services.campaigns.audience import Reach, build, valid_email
from services.campaigns.models import CampaignDelivery
from services.campaigns.tests.fixtures import CampaignFixture
from services.surveys.audience import candidates, resolve
from services.surveys.tests.fixtures import contact

ALL_ZERO = {
    "unsubscribed": 0,
    "no_email": 0,
    "already_received": 0,
    "recent_campaign": 0,
    "over_limit": 0,
    "failed": 0,
}


class AudienceTests(CampaignFixture):
    def reach(self, campaign, **kwargs):
        return build(campaign, today=self.today, now=self.now, **kwargs)

    def names(self, people):
        return [person.name for person in people]

    def test_a_contact_segment_reaches_its_people_by_name(self):
        reach = self.reach(self.make_campaign(segment=self.people))
        self.assertEqual(self.names(reach.queued), ["Ann", "Dot"])
        self.assertEqual(reach.tally(), ALL_ZERO)

    def test_an_organisation_segment_reaches_ticked_roles_on_its_records_and_their_accounts(self):
        reach = self.reach(self.make_campaign(segment=self.book))
        # champions first, then decision makers; Ben is Pizza EMEA's, an account of Pizza Hut
        self.assertEqual(self.names(reach.queued), ["Ann", "Dot", "Ben"])
        only_champions = self.make_campaign(segment=self.book, roles=["champion"])
        self.assertEqual(self.names(self.reach(only_champions).queued), ["Ann", "Dot"])

    def test_it_reads_as_the_owner_never_wider(self):
        everything = self.pinned("customer", [self.pizza, self.taco], owner=self.csm)
        reach = self.reach(self.make_campaign(segment=everything))
        self.assertNotIn("Tia", self.names(reach.queued))  # Taco Bell is Dana's

    def test_records_replace_the_members_and_still_read_as_the_owner(self):
        campaign = self.make_campaign(segment=self.book)
        reach = self.reach(campaign, records=[self.dough.pk, self.taco.pk])
        self.assertEqual(self.names(reach.queued), ["Dot"])

    def test_the_skips_in_order_first_match_wins(self):
        campaign = self.make_campaign(segment=self.people)
        nell = contact(self.pizza, "Nell", email="", campaigns_unsubscribed_at=self.now)
        noel = contact(self.pizza, "Noel", email="  ")
        rae = contact(self.dough, "Rae")
        other = self.make_campaign(name="Other", segment=self.people)
        self.make_send(campaign, [self.ann], at=self.now - timedelta(days=30))
        self.make_send(other, [rae], at=self.now - timedelta(days=2))
        self.people.pinned_ids = [p.pk for p in (self.ann, self.dot, nell, noel, rae)]
        self.people.save(update_fields=["pinned_ids"])
        reach = self.reach(campaign)
        self.assertEqual(self.names(reach.queued), ["Dot"])
        self.assertEqual(
            [(person.name, reason) for person, reason in reach.skipped],
            [
                ("Ann", "already_received"),
                ("Nell", "unsubscribed"),  # unsubscribed comes before no email
                ("Noel", "no_email"),
                ("Rae", "recent_campaign"),
            ],
        )

    def test_the_gap_is_three_days_from_now(self):
        other = self.make_campaign(name="Other", segment=self.people)
        self.make_send(other, [self.ann], at=self.now - timedelta(days=3, seconds=1))
        reach = self.reach(self.make_campaign(segment=self.people))
        self.assertEqual(self.names(reach.queued), ["Ann", "Dot"])

    def test_a_queued_person_counts_as_received_and_recent(self):
        campaign = self.make_campaign(segment=self.people)
        cut_off = self.make_send(campaign, status="sending")
        CampaignDelivery.objects.create(send=cut_off, contact=self.ann)
        self.assertEqual(
            [(p.name, r) for p, r in self.reach(campaign).skipped], [("Ann", "already_received")]
        )
        other = self.make_campaign(name="Other", segment=self.people)
        self.assertEqual(
            [(p.name, r) for p, r in self.reach(other).skipped], [("Ann", "recent_campaign")]
        )

    def test_a_skipped_or_failed_delivery_never_counts(self):
        campaign = self.make_campaign(segment=self.people)
        send = self.make_send(campaign)
        CampaignDelivery.objects.create(
            send=send, contact=self.ann, status="skipped", reason="failed"
        )
        self.assertEqual(self.names(self.reach(campaign).queued), ["Ann", "Dot"])

    def test_another_workspaces_campaigns_never_count(self):
        theirs = self.make_campaign(segment=self.people, name="Theirs")
        theirs.organisation = self.other_org
        theirs.save(update_fields=["organisation"])
        self.make_send(theirs, [self.ann], at=self.now)
        self.assertEqual(
            self.names(self.reach(self.make_campaign(segment=self.people)).queued), ["Ann", "Dot"]
        )

    def test_three_per_record_after_the_skips(self):
        """Abe ranks first but is unsubscribed: he is counted, and Cy still
        gets the third place (a cap before the skips would have dropped Cy)."""
        extra = [contact(self.pizza, name) for name in ("Abe", "Bea", "Cy")]
        extra[0].campaigns_unsubscribed_at = self.now
        extra[0].save(update_fields=["campaigns_unsubscribed_at"])
        reach = self.reach(self.make_campaign(segment=self.book, roles=["champion"]))
        # Pizza Hut's champions by name: Abe (unsubscribed, counted), Ann, Bea, Cy; three reach
        self.assertEqual(self.names(reach.queued), ["Ann", "Bea", "Cy", "Dot"])
        self.assertEqual([(p.name, r) for p, r in reach.skipped], [("Abe", "unsubscribed")])

    def test_over_the_limit_is_skipped_and_counted(self):
        with mock.patch("services.campaigns.audience.MAX_PEOPLE", 1):
            reach = self.reach(self.make_campaign(segment=self.people))
        self.assertEqual(self.names(reach.queued), ["Ann"])
        self.assertEqual([(p.name, r) for p, r in reach.skipped], [("Dot", "over_limit")])

    def test_the_shapes(self):
        reach = Reach(queued=[self.ann, self.dot], skipped=[(self.ben, "no_email")])
        self.assertEqual(reach.reach, 2)
        self.assertEqual(reach.tally(), {**ALL_ZERO, "no_email": 1})
        self.assertEqual(
            reach.counts(), {"reached": 3, "sent": 0, "skipped": {**ALL_ZERO, "no_email": 1}}
        )
        self.assertEqual(
            reach.payload(sample=1),
            {
                "reach": 2,
                "skipped": {**ALL_ZERO, "no_email": 1},
                "sample": [{"id": self.ann.pk, "name": "Ann"}],
            },
        )

    def test_valid_email(self):
        self.assertTrue(valid_email("ann@example.com"))
        self.assertTrue(valid_email(" ann@example.com "))
        for bad in ("", "   ", "ann", "ann@", None):
            self.assertFalse(valid_email(bad), bad)


class SurveysUnchangedTests(CampaignFixture):
    def test_candidates_is_what_resolve_reads(self):
        people, hidden, capped = candidates(self.book, ["champion"], self.csm, today=self.today)
        self.assertEqual(([p.name for p in people], hidden, capped), (["Ann", "Dot"], 0, True))
        audience = resolve(self.book, ["champion"], self.csm, today=self.today)
        self.assertEqual([p.name for p in audience.people], ["Ann", "Dot"])

    def test_campaign_opt_out_does_not_touch_surveys(self):
        self.ann.campaigns_unsubscribed_at = self.now
        self.ann.save(update_fields=["campaigns_unsubscribed_at"])
        audience = resolve(self.people, [], self.csm, today=self.today)
        self.assertEqual([p.name for p in audience.people], ["Ann", "Dot"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_audience --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.campaigns.audience'`.

- [ ] **Step 3: Split `candidates` out of Surveys' `resolve`**

In `services/surveys/audience.py`, add above `resolve`:

```python
def candidates(segment, roles, viewer, *, today, records=None):
    """(people in send order, how many the viewer cannot open, whether the
    per-record cap applies): the segment's members as `viewer` sees them,
    or `records` (ids of the segment's kind) in their place, turned into
    people. Shared with Campaigns, so both features agree on who a segment
    reaches."""
    if records is None:
        members = members_queryset(segment, viewer, today=today)
    else:
        # SOC2:AUTH-02 a rule's fired records, read through the viewer's own visibility
        members = visible_records(segment.kind, viewer).filter(pk__in=list(records))
    return _candidates(segment, roles, viewer, members)
```

and replace the top of `resolve`'s body (the `now = …` line through `candidates, hidden, capped = _candidates(...)`) with:

```python
    now = now or timezone.now()
    people, hidden, capped = candidates(segment, roles, viewer, today=today, records=records)
```

then rename the loop's two uses of the local `candidates` to `people` (`contact_id__in=[person.pk for person in people]` and `for person in people:`). Nothing else changes.

- [ ] **Step 4: Write `services/campaigns/audience.py`**

```python
"""Who a campaign reaches and why the rest are skipped (spec §1.3).

The people are Surveys' (`surveys.audience.candidates`), read as the
campaign's owner, so a campaign reaches only people its owner may open.
Each is then checked in order, first match wins: unsubscribed, no email,
already received this campaign, any campaign email in the last 3 days, and
the 500 limit. As in Surveys, the cap of three per organisation or account
applies after the skips, to who is left; people beyond it are not reached.

A `queued` delivery counts as "has it" as well as a `sent` one: a send cut
off mid-delivery keeps its people queued, and nobody else may claim them.
The claim calls `build` under the workspace lock, so two sends cannot both
pass these checks. Nothing here writes."""

from collections import Counter
from dataclasses import dataclass, field
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db.models import Q

from services.surveys.audience import candidates
from services.surveys.models import PER_RECORD_CAP

from .models import GAP_DAYS, MAX_PEOPLE, CampaignDelivery, SkipReason

#: Delivery statuses that mean the person has it, or is about to.
HELD = (CampaignDelivery.Status.QUEUED, CampaignDelivery.Status.SENT)
#: How many people the audience endpoint names.
SAMPLE = 20


def valid_email(value):
    value = (value or "").strip()
    if not value:
        return False
    try:
        validate_email(value)
    except ValidationError:
        return False
    return True


@dataclass
class Reach:
    """Who a send would queue, in send order, and who it would skip and why."""

    queued: list = field(default_factory=list)
    skipped: list = field(default_factory=list)

    @property
    def reach(self):
        return len(self.queued)

    def tally(self):
        found = Counter(reason for _person, reason in self.skipped)
        return {reason: found[reason] for reason in SkipReason.values}

    def counts(self):
        return {"reached": len(self.queued) + len(self.skipped), "sent": 0, "skipped": self.tally()}

    def payload(self, sample=SAMPLE):
        return {
            "reach": self.reach,
            "skipped": self.tally(),
            "sample": [{"id": person.pk, "name": person.name} for person in self.queued[:sample]],
        }


def _received(campaign, ids):
    return set(
        CampaignDelivery.objects.filter(
            send__campaign_id=campaign.pk, contact_id__in=ids, status__in=HELD
        ).values_list("contact_id", flat=True)
    )


def _recent(campaign, ids, now):
    sent_lately = Q(
        status=CampaignDelivery.Status.SENT, sent_at__gte=now - timedelta(days=GAP_DAYS)
    )
    return set(
        CampaignDelivery.objects.filter(
            send__campaign__organisation_id=campaign.organisation_id, contact_id__in=ids
        )
        .filter(sent_lately | Q(status=CampaignDelivery.Status.QUEUED))
        .values_list("contact_id", flat=True)
    )


def _reason(person, received, recent):
    if person.campaigns_unsubscribed_at is not None:
        return SkipReason.UNSUBSCRIBED
    if not valid_email(person.email):
        return SkipReason.NO_EMAIL
    if person.pk in received:
        return SkipReason.ALREADY_RECEIVED
    if person.pk in recent:
        return SkipReason.RECENT_CAMPAIGN
    return None


def build(campaign, *, today, now, records=None):
    """The campaign's reach now, as its owner sees it. `records` (a rule's
    fired records, ids of the segment's kind) replace the segment's members."""
    # SOC2:AUTH-02 read as the campaign's owner: only people they may open are reached
    people, _hidden, capped = candidates(
        campaign.segment, campaign.roles, campaign.owner, today=today, records=records
    )
    ids = [person.pk for person in people]
    received, recent = _received(campaign, ids), _recent(campaign, ids, now)
    reach, per_record = Reach(), Counter()
    for person in people:
        reason = _reason(person, received, recent)
        if reason is not None:
            reach.skipped.append((person, reason))
            continue
        record = (person.customer_id, person.account_id)
        if capped and per_record[record] >= PER_RECORD_CAP:
            continue
        if len(reach.queued) >= MAX_PEOPLE:
            reach.skipped.append((person, SkipReason.OVER_LIMIT))
            continue
        per_record[record] += 1
        reach.queued.append(person)
    return reach
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_audience services.surveys --parallel --noinput`
Expected: PASS (every Surveys test unchanged).

- [ ] **Step 6: Commit**

```bash
git add services/surveys/audience.py services/campaigns/audience.py \
  services/campaigns/tests/test_audience.py
git commit -m "feat(campaigns): reach a segment through Surveys' audience, with the five skips

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Merge fields, the footer and the refusals' words

Spec §1.5, §1.4 (`EMAIL_NOT_SET_UP` in `validation.py`). Contract notes 3, 4, 22.

**Files:**
- Create: `services/campaigns/validation.py`, `services/campaigns/rendering.py`
- Test: `services/campaigns/tests/test_rendering.py`

**Interfaces:**
- Consumes: `CampaignFixture` (Task 1).
- Produces:
  - `services.campaigns.validation`: `NOT_OWNER`, `NO_NAME`, `LONG_NAME`, `LONG_SUBJECT`, `LONG_BODY`, `MERGE_FIELDS_ONLY`, `OWN_SEGMENT`, `NO_TEAMMATES`, `TOO_MANY_SHARED`, `LIMIT_REACHED`, `CHOOSE_STATUS`, `CAMPAIGN_SENT`, `EMAIL_NOT_SET_UP`, `ARCHIVED`, `CHOOSE_SEGMENT`, `NEEDS_WORDS`, `NOBODY`, `NOT_IN_AUDIENCE`, `ONLY_THE_PERSON`, `EXPIRED` (a dict), `CHOOSE_CAMPAIGN`, `MERGE_FIELDS = ("first_name", "organisation", "sender_name")`, `FIELD_PATTERN`; `merge_field_errors(text) -> list[str]` (the unknown `{…}` names, in order).
  - `services.campaigns.rendering`: `first_name(name) -> str`, `organisation_name(contact) -> str`, `link(token) -> str`, `PREVIEW_TOKEN = "preview"`, `footer(sender_name, workspace, url) -> str`, `render(source, contact, *, sender_name) -> tuple[str, str]` (subject, body without footer), `compose(source, contact, *, sender_name, workspace, url) -> tuple[str, str]` (subject, body with footer). `source` is anything with `.subject` and `.body` (a `Campaign`, a `CampaignSend`, or a `SimpleNamespace`). `contact` needs `customer`/`account` loaded.

- [ ] **Step 1: Write the failing tests**

Create `services/campaigns/tests/test_rendering.py`:

```python
"""Plain-text rendering (spec §1.5): three merge fields, filled by plain
replacement (never `str.format`), nothing escaped into HTML, a one-line
subject, and the fixed footer with the unsubscribe link."""

from types import SimpleNamespace

from django.conf import settings
from django.test import SimpleTestCase

from services.campaigns import validation as say
from services.campaigns.rendering import (
    compose,
    first_name,
    footer,
    link,
    organisation_name,
    render,
)
from services.campaigns.tests.fixtures import CampaignFixture
from services.surveys.tests.fixtures import contact


class MergeFieldTests(SimpleTestCase):
    def test_only_the_three_fields_pass(self):
        self.assertEqual(
            say.merge_field_errors("Hi {first_name} at {organisation}, {sender_name}"), []
        )
        self.assertEqual(say.merge_field_errors("Hi {name} {first_name} {0} {}"), ["name", "0", ""])
        self.assertEqual(say.merge_field_errors("No fields, {{ nor braces"), [])

    def test_the_words(self):
        self.assertEqual(
            say.MERGE_FIELDS_ONLY, "Use {first_name}, {organisation} or {sender_name}."
        )
        self.assertEqual(
            say.EMAIL_NOT_SET_UP,
            "Email isn't set up for this workspace yet, so campaigns can't be sent.",
        )
        self.assertEqual(say.NOT_OWNER, "Only the campaign's owner can change it.")
        self.assertEqual(say.CAMPAIGN_SENT, "Archive it instead: it has been sent.")
        self.assertEqual(say.NOBODY, "Nobody in this segment can be emailed right now.")
        self.assertEqual(
            say.CHOOSE_CAMPAIGN, "Choose one of your active campaigns for these records."
        )

    def test_first_name(self):
        self.assertEqual(first_name("Ann Lee"), "Ann")
        self.assertEqual(first_name("  Ann  "), "Ann")
        self.assertEqual(first_name(""), "there")
        self.assertEqual(first_name("   "), "there")

    def test_the_link_and_the_footer(self):
        self.assertEqual(link("abc"), f"{settings.FRONTEND_URL}/u/abc")
        self.assertEqual(
            footer("Carl CSM", "Acme Inc", "https://x/u/abc"),
            "—\nCarl CSM, Acme Inc\nUnsubscribe from these emails: https://x/u/abc",
        )


class RenderTests(CampaignFixture):
    def source(self, subject, body):
        return SimpleNamespace(subject=subject, body=body)

    def test_each_field_is_filled(self):
        subject, body = render(
            self.source("Hi {first_name}", "{organisation} misses {sender_name}"),
            self.ann,
            sender_name="Carl CSM",
        )
        self.assertEqual((subject, body), ("Hi Ann", "Pizza Hut misses Carl CSM"))

    def test_an_account_contact_names_its_account(self):
        self.assertEqual(organisation_name(self.ben), "Pizza EMEA")
        self.assertEqual(organisation_name(self.ann), "Pizza Hut")

    def test_nothing_is_escaped_or_formatted(self):
        odd = contact(self.pizza, "<b>{sender_name}</b>")
        subject, body = render(
            self.source("{first_name}", "{first_name} & {x}"), odd, sender_name="Carl"
        )
        # the contact's own braces are text, not a second round of fields
        self.assertEqual(subject, "<b>{sender_name}</b>")
        self.assertEqual(body, "<b>{sender_name}</b> & {x}")

    def test_the_subject_is_one_line(self):
        subject, _body = render(self.source("A\r\nB {first_name}", ""), self.ann, sender_name="C")
        self.assertEqual(subject, "A B Ann")

    def test_compose_appends_the_footer(self):
        subject, body = compose(
            self.source("Hi", "Body"),
            self.ann,
            sender_name="Carl CSM",
            workspace="Acme Inc",
            url="https://x/u/t",
        )
        self.assertEqual(
            (subject, body),
            ("Hi", "Body\n\n—\nCarl CSM, Acme Inc\nUnsubscribe from these emails: https://x/u/t"),
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_rendering --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.campaigns.validation'`.

- [ ] **Step 3: Write `services/campaigns/validation.py`**

```python
"""What a campaign may say, and every refusal's words. These are UI copy:
the frontend shows them as they are."""

import re

from .models import MAX_BODY, MAX_NAME, MAX_OWNED, MAX_SHARED, MAX_SUBJECT

NOT_OWNER = "Only the campaign's owner can change it."
NO_NAME = "Give it a name."
LONG_NAME = f"Keep the name to {MAX_NAME} characters."
LONG_SUBJECT = f"Keep the subject to {MAX_SUBJECT} characters."
LONG_BODY = f"Keep the body to {MAX_BODY} characters."
MERGE_FIELDS_ONLY = "Use {first_name}, {organisation} or {sender_name}."
OWN_SEGMENT = "Choose one of your own segments."
NO_TEAMMATES = "Choose at least one teammate."
TOO_MANY_SHARED = f"Share with at most {MAX_SHARED} teammates."
LIMIT_REACHED = f"You can own at most {MAX_OWNED} campaigns."
CHOOSE_STATUS = "Choose archived or active."
CAMPAIGN_SENT = "Archive it instead: it has been sent."
EMAIL_NOT_SET_UP = "Email isn't set up for this workspace yet, so campaigns can't be sent."
ARCHIVED = "This campaign is archived."
CHOOSE_SEGMENT = "Choose a segment first."
NEEDS_WORDS = "Write a subject and a body first."
NOBODY = "Nobody in this segment can be emailed right now."
NOT_IN_AUDIENCE = "Choose someone this campaign would email."
ONLY_THE_PERSON = "Only the person can unsubscribe, with the link in a campaign email."
EXPIRED = {"detail": "This link has expired."}
#: A rule's `campaign` action, when the campaign is not one it may use.
CHOOSE_CAMPAIGN = "Choose one of your active campaigns for these records."

MERGE_FIELDS = ("first_name", "organisation", "sender_name")
#: A `{…}` in the owner's text: a merge field, or a refusal.
FIELD_PATTERN = re.compile(r"\{([^{}]*)\}")


def merge_field_errors(text):
    """The `{…}` names in `text` that are not merge fields, in order."""
    return [name for name in FIELD_PATTERN.findall(text or "") if name not in MERGE_FIELDS]
```

- [ ] **Step 4: Write `services/campaigns/rendering.py`**

```python
"""A campaign email as one person reads it (spec §1.5). Plain text: the
merge fields are filled in one pass over the owner's own text (never
`str.format`), so a contact's name holding braces is never read as a field,
and nothing is escaped into HTML. The subject is kept to one line
(an email header cannot hold a line break)."""

from django.conf import settings

from .validation import FIELD_PATTERN

#: What a preview's footer links to: never a working token.
PREVIEW_TOKEN = "preview"


def first_name(name):
    words = (name or "").split()
    return words[0] if words else "there"


def organisation_name(contact):
    parent = contact.customer if contact.customer_id else contact.account
    return parent.name if parent is not None else ""


def link(token):
    return f"{settings.FRONTEND_URL}/u/{token}"


def footer(sender_name, workspace, url):
    return f"—\n{sender_name}, {workspace}\nUnsubscribe from these emails: {url}"


def _fill(text, values):
    """One pass over the owner's own text: a value put in is never read
    again, so a contact named "{sender_name}" stays that text."""
    return FIELD_PATTERN.sub(lambda match: values.get(match.group(1), match.group(0)), text or "")


def render(source, contact, *, sender_name):
    """(subject, body) for `contact`, without the footer."""
    values = {
        "first_name": first_name(contact.name),
        "organisation": organisation_name(contact),
        "sender_name": sender_name,
    }
    subject = " ".join(_fill(source.subject, values).split())
    return subject, _fill(source.body, values)


def compose(source, contact, *, sender_name, workspace, url):
    """(subject, body) as the email carries them: the body and the footer."""
    subject, body = render(source, contact, sender_name=sender_name)
    return subject, f"{body}\n\n{footer(sender_name, workspace, url)}"
```

Note on `render`'s subject: `" ".join(text.split())` turns `"A\r\nB Ann"` into `"A B Ann"` and also collapses runs of spaces, which a subject never needs.

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_rendering --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/campaigns/validation.py services/campaigns/rendering.py \
  services/campaigns/tests/test_rendering.py
git commit -m "feat(campaigns): plain-text merge fields, footer and refusal copy

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Reading campaigns, their sends and their deliveries

Spec §1.7, §1.9, §4 (`CampaignRow`, `Campaign`, `CampaignSend`, `Delivery`, the four GET routes). Contract notes 2, 8, 13, 14, 15. Decision 11 (the old tests and views go).

**Files:**
- Create: `services/campaigns/access.py`, `services/campaigns/paging.py`, `services/campaigns/payloads.py`
- Modify (rewrite): `services/campaigns/views.py`, `services/campaigns/urls.py`
- Delete: `services/campaigns/serializers.py` (Task 5 writes a new one), `services/campaigns/tests/test_views.py`, `test_send_claim.py`, `test_concurrency.py`, `test_privacy.py`
- Test: `services/campaigns/tests/test_reading.py`

**Interfaces:**
- Consumes: Task 1's models and fixture; `validation.NOT_OWNER` (Task 3); `rules.access.readable_rules`; `organizations.rows.iso`, `person`; `customers.scoping.visible_children_q`.
- Produces:
  - `services.campaigns.access`: `readable_campaigns(user) -> QuerySet`, `get_readable(user, pk) -> Campaign` (404), `get_owned(user, pk) -> Campaign` (404, then 403 `NOT_OWNER`), `owned_segment(user, segment_id) -> Segment | None` (None for a missing segment and for anyone else's; the serializer turns it into the field refusal `OWN_SEGMENT`).
  - `services.campaigns.paging`: `encode(*values) -> str`, `decode_after(cursor) -> (datetime, int) | None`, `decode_id(cursor) -> int | None`, `page(queryset, size) -> (list, bool)`.
  - `services.campaigns.payloads`: `PAGE_SIZE = 50`, `SEND_PAGE = 20`, `DELIVERY_PAGE = 50`; `annotated(queryset, viewer) -> QuerySet` (adds `has_legacy`, `has_sends`, prefetches `teammates`); `campaign_rows(campaigns, viewer) -> list`; `campaign_payload(campaign, viewer) -> dict`; `send_payload(send, viewer, readable_rules=None) -> dict`; `sends_page(campaign, viewer, params) -> dict`; `deliveries_page(send, viewer, params) -> dict`; `list_page(viewer, params) -> dict`.
  - Views `CampaignListCreateView`, `CampaignDetailView`, `CampaignSendsView`, `CampaignSendDetailView`, `CampaignDeliveriesView` (GET only in this task); URL names `campaign-list`, `campaign-detail`, `campaign-sends`, `campaign-send-detail`, `campaign-send-deliveries`. `POST campaigns/:id/send/` is gone (404).

- [ ] **Step 1: Delete what this delivery replaces**

```bash
git rm services/campaigns/serializers.py services/campaigns/tests/test_views.py \
  services/campaigns/tests/test_send_claim.py services/campaigns/tests/test_concurrency.py \
  services/campaigns/tests/test_privacy.py
```

- [ ] **Step 2: Write the failing tests**

Create `services/campaigns/tests/test_reading.py`:

```python
"""Reading campaigns (spec §1.7, §4): the owner and whoever it is shared with
read; anyone else gets a 404 that reads like a missing campaign. Sharing by
name is a `pk__in` over the through table. Hand-picked recipients, sends'
rules and deliveries are filtered twice: named only to a reader who may open
them, the rest counted."""

from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from services.campaigns.models import Campaign, CampaignDelivery, empty_counts
from services.campaigns.tests.fixtures import BODY, SUBJECT, CampaignFixture

URL = "/api/v1/campaigns/"


class ReadingFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.mine = cls.make_campaign(segment=cls.book)
        cls.shared = cls.make_campaign(name="Shared", segment=cls.book, sharing="workspace")
        cls.named = cls.make_campaign(name="Named", sharing="people")
        cls.named.shared_with.add(cls.other)
        cls.danas = cls.make_campaign(owner=cls.other, name="Dana's")
        cls.old = cls.make_campaign(name="Old", status="archived")
        cls.theirs = Campaign.objects.create(
            organisation=cls.other_org, owner=cls.stranger, name="Theirs"
        )

    def get(self, user, path="", **params):
        return self.api(user).get(f"{URL}{path}", params)


class ListTests(ReadingFixture):
    def names(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        return [row["name"] for row in response.data["results"]]

    def test_mine_is_the_default_tab_newest_first_without_archived(self):
        self.assertEqual(self.names(self.get(self.csm)), ["Named", "Shared", "Win-back"])
        self.assertEqual(
            self.names(self.get(self.csm, tab="nonsense")), ["Named", "Shared", "Win-back"]
        )

    def test_archived_are_added_on_request(self):
        self.assertEqual(
            self.names(self.get(self.csm, archived="1")), ["Old", "Named", "Shared", "Win-back"]
        )

    def test_shared_with_me_is_the_workspace_and_by_name(self):
        self.assertEqual(self.names(self.get(self.other, tab="shared")), ["Named", "Shared"])
        self.assertEqual(self.names(self.get(self.other, tab="mine")), ["Dana's"])
        self.assertEqual(self.names(self.get(self.admin, tab="shared")), ["Shared"])

    def test_another_workspace_sees_none_of_it(self):
        self.assertEqual(self.names(self.get(self.stranger)), ["Theirs"])
        self.assertEqual(self.names(self.get(self.stranger, tab="shared")), [])

    def test_a_row(self):
        send = self.make_send(self.mine, [self.ann])
        row = next(r for r in self.get(self.csm).data["results"] if r["id"] == self.mine.pk)
        self.mine.refresh_from_db()
        self.assertEqual(
            row,
            {
                "id": self.mine.pk,
                "name": "Win-back",
                "status": "draft",
                "segment": {"id": self.book.pk, "name": "My book", "kind": "customer"},
                "roles": ["champion", "decision_maker"],
                "owner": {"id": self.csm.pk, "name": "Carl CSM"},
                "is_owner": True,
                "sharing": "private",
                "shared_with": [],
                "last_send": {
                    "id": send.pk,
                    "finished_at": self.now.isoformat(),
                    "status": "sent",
                    "counts": empty_counts(),
                },
                "needs_segment": False,
                "updated_at": self.mine.updated_at.isoformat(),
            },
        )

    def test_a_shared_reader_sees_the_segment_by_name_only_and_the_teammates(self):
        row = next(
            r for r in self.get(self.other, tab="shared").data["results"] if r["name"] == "Named"
        )
        self.assertEqual((row["is_owner"], row["segment"]), (False, None))
        self.assertEqual(row["shared_with"], [{"id": self.other.pk, "name": "Dana CSM"}])
        row = next(
            r for r in self.get(self.other, tab="shared").data["results"] if r["name"] == "Shared"
        )
        self.assertEqual(row["segment"], {"id": None, "name": "My book", "kind": "customer"})

    def test_a_migrated_draft_needs_a_segment(self):
        legacy = self.make_campaign(name="Legacy")
        legacy.recipients.add(self.ann)
        row = next(r for r in self.get(self.csm).data["results"] if r["name"] == "Legacy")
        self.assertTrue(row["needs_segment"])
        self.assertFalse(
            next(r for r in self.get(self.csm).data["results"] if r["name"] == "Named")[
                "needs_segment"
            ]
        )

    def test_paging(self):
        with mock.patch("services.campaigns.payloads.PAGE_SIZE", 2):
            first = self.get(self.csm).data
            self.assertEqual([r["name"] for r in first["results"]], ["Named", "Shared"])
            second = self.get(self.csm, cursor=first["next"]).data
        self.assertEqual(
            ([r["name"] for r in second["results"]], second["next"]), (["Win-back"], None)
        )
        self.assertIsInstance(first["next"], str)
        for bad in ("x", "e30=", "WzEsMl0=", "WyIyMDI2LTAxLTAxVDAwOjAwOjAwIiwgMV0="):
            self.assertEqual(
                self.names(self.get(self.csm, cursor=bad)), ["Named", "Shared", "Win-back"]
            )

    def test_a_fixed_number_of_queries_and_no_distinct(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.get(self.csm)
            return ctx.captured_queries

        one = len(count())
        for name in ("A", "B", "C"):
            campaign = self.make_campaign(name=name, segment=self.people, sharing="people")
            campaign.shared_with.add(self.other)
            campaign.recipients.add(self.ann)
            self.make_send(campaign, [self.ann])
        queries = count()
        self.assertEqual(len(queries), one)
        for query in queries:
            sql = query["sql"]
            # DISTINCT ON (the last send per campaign) is fine; a de-duplicated join is not
            self.assertFalse(
                sql.startswith("SELECT DISTINCT ") and not sql.startswith("SELECT DISTINCT ON"), sql
            )

    def test_signed_out_is_401(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)


class DetailTests(ReadingFixture):
    def test_the_owner_reads_the_whole_campaign(self):
        data = self.get(self.csm, f"{self.mine.pk}/").data
        self.assertEqual(
            (data["subject"], data["body"], data["legacy_recipients"], data["legacy_hidden"]),
            (SUBJECT, BODY, [], 0),
        )
        self.assertTrue(data["can_delete"])
        self.make_send(self.mine)
        self.assertFalse(self.get(self.csm, f"{self.mine.pk}/").data["can_delete"])

    def test_a_shared_reader_reads_it_but_may_not_delete(self):
        data = self.get(self.other, f"{self.shared.pk}/").data
        self.assertEqual((data["is_owner"], data["can_delete"]), (False, False))

    def test_anyone_else_gets_404(self):
        for user in (self.other, self.stranger):
            self.assertEqual(self.get(user, f"{self.mine.pk}/").status_code, 404)
        self.assertEqual(self.get(self.csm, "999999/").status_code, 404)

    def test_hand_picked_recipients_are_named_only_to_who_may_open_them(self):
        self.shared.recipients.add(self.ann, self.tia)
        carl = self.get(self.csm, f"{self.shared.pk}/").data
        dana = self.get(self.other, f"{self.shared.pk}/").data
        self.assertEqual(
            (carl["legacy_recipients"], carl["legacy_hidden"]),
            ([{"id": self.ann.pk, "name": "Ann"}], 1),
        )
        self.assertEqual(
            (dana["legacy_recipients"], dana["legacy_hidden"]),
            ([{"id": self.tia.pk, "name": "Tia"}], 1),
        )
        self.assertNotIn("ann@example.com", str(dana))

    def test_the_old_send_route_is_gone(self):
        response = self.api(self.csm).post(f"{URL}{self.mine.pk}/send/")
        self.assertEqual(response.status_code, 404)


class SendReadingTests(ReadingFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.rule = cls.make_rule()
        cls.send = cls.make_send(
            cls.shared, [cls.ann, cls.ben, cls.tia], kind="rule", rule=cls.rule, sent_by=None
        )
        CampaignDelivery.objects.filter(send=cls.send, contact=cls.ben).update(
            status="skipped", reason="no_email", sent_at=None
        )

    def test_the_sends_newest_first(self):
        manual = self.make_send(self.shared, sent_by=self.csm)
        data = self.get(self.csm, f"{self.shared.pk}/sends/").data
        self.assertEqual([row["id"] for row in data["results"]], [manual.pk, self.send.pk])
        self.assertEqual(data["next"], None)
        row = data["results"][1]
        self.assertEqual(
            row,
            {
                "id": self.send.pk,
                "kind": "rule",
                "status": "sent",
                "migrated": False,
                "sent_by": None,
                "rule": {"id": self.rule.pk, "name": "Renewal watch"},
                "started_at": self.now.isoformat(),
                "finished_at": self.now.isoformat(),
                "subject": SUBJECT,
                "body": BODY,
                "counts": empty_counts(),
            },
        )
        self.assertEqual(data["results"][0]["sent_by"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_a_rule_the_reader_may_not_read_is_a_rule(self):
        data = self.get(self.other, f"{self.shared.pk}/sends/{self.send.pk}/").data
        self.assertEqual(data["rule"], {"id": None, "name": "a rule"})

    def test_a_deleted_rule_is_none(self):
        send = self.make_send(self.shared, kind="rule")
        self.assertIsNone(self.get(self.csm, f"{self.shared.pk}/sends/{send.pk}/").data["rule"])

    def test_a_send_of_another_campaign_is_404(self):
        self.assertEqual(
            self.get(self.csm, f"{self.mine.pk}/sends/{self.send.pk}/").status_code, 404
        )
        self.assertEqual(self.get(self.stranger, f"{self.shared.pk}/sends/").status_code, 404)

    def test_deliveries_are_filtered_twice(self):
        path = f"{self.shared.pk}/sends/{self.send.pk}/deliveries/"
        carl = self.get(self.csm, path).data
        self.assertEqual(
            carl["results"],
            [
                {
                    "id": self.send.deliveries.get(contact=self.ann).pk,
                    "status": "sent",
                    "reason": "",
                    "contact": {"id": self.ann.pk, "name": "Ann"},
                    "record": {"kind": "organization", "id": self.pizza.pk, "name": "Pizza Hut"},
                    "sent_at": self.now.isoformat(),
                },
                {
                    "id": self.send.deliveries.get(contact=self.ben).pk,
                    "status": "skipped",
                    "reason": "no_email",
                    "contact": {"id": self.ben.pk, "name": "Ben"},
                    "record": {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"},
                    "sent_at": None,
                },
            ],
        )
        self.assertEqual((carl["hidden"], carl["next"]), (1, None))
        dana = self.get(self.other, path).data
        self.assertEqual(
            ([r["contact"]["name"] for r in dana["results"]], dana["hidden"]), (["Tia"], 2)
        )

    def test_deliveries_filter_by_status_and_reason(self):
        path = f"{self.shared.pk}/sends/{self.send.pk}/deliveries/"
        sent = self.get(self.csm, path, status="sent").data
        self.assertEqual(
            ([r["contact"]["name"] for r in sent["results"]], sent["hidden"]), (["Ann"], 1)
        )
        skipped = self.get(self.csm, path, status="skipped", reason="no_email").data
        self.assertEqual([r["contact"]["name"] for r in skipped["results"]], ["Ben"])
        self.assertEqual(skipped["hidden"], 0)
        ignored = self.get(self.csm, path, status="bogus", reason="bogus").data
        self.assertEqual(len(ignored["results"]), 2)

    def test_deliveries_page(self):
        path = f"{self.shared.pk}/sends/{self.send.pk}/deliveries/"
        with mock.patch("services.campaigns.payloads.DELIVERY_PAGE", 1):
            first = self.get(self.csm, path).data
            second = self.get(self.csm, path, cursor=first["next"]).data
        self.assertEqual(
            ([r["contact"]["name"] for r in first["results"] + second["results"]], second["next"]),
            (["Ann", "Ben"], None),
        )

    def test_reading_deliveries_takes_a_fixed_number_of_queries(self):
        path = f"{self.shared.pk}/sends/{self.send.pk}/deliveries/"

        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.get(self.csm, path)
            return len(ctx.captured_queries)

        one = count()
        CampaignDelivery.objects.create(
            send=self.send, contact=self.dot, status="sent", sent_at=self.now
        )
        self.assertEqual(count(), one)
```

- [ ] **Step 3: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_reading --noinput`
Expected: FAIL/ERROR (the old views import the deleted serializers module: `ModuleNotFoundError: No module named 'services.campaigns.serializers'` at URL loading).

- [ ] **Step 4: Write `services/campaigns/access.py`**

```python
"""Who may read a campaign and who may change it (spec §1.7). Sharing works
as segments' does; sharing by name is a `pk__in` over the through table,
never a `.distinct()` over a join (PostgreSQL 16 planned that at about a
second a call, #86)."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from services.segments.models import Segment

from .models import Campaign
from .validation import NOT_OWNER


def readable_campaigns(user):
    """Campaigns `user` may read: their own, those shared with the
    workspace, and those shared with them by name. Inside their own
    workspace only."""
    named = Campaign.shared_with.through.objects.filter(user_id=user.pk).values("campaign_id")
    # SOC2:AUTH-02 a campaign is read by its owner and whoever it is shared with
    return Campaign.objects.filter(organisation_id=user.organisation_id).filter(
        Q(owner=user)
        | Q(sharing=Campaign.Sharing.WORKSPACE)
        | Q(sharing=Campaign.Sharing.PEOPLE, pk__in=named)
    )


def get_readable(user, pk):
    """The campaign, or a 404 that reads the same for a missing campaign and
    one `user` may not read."""
    campaigns = readable_campaigns(user).select_related("owner", "segment", "organisation")
    return get_object_or_404(campaigns, pk=pk)


def get_owned(user, pk):
    campaign = get_readable(user, pk)
    # SOC2:AUTH-02 only the owner edits, previews, counts, sends, archives or deletes
    if campaign.owner_id != user.pk:
        raise PermissionDenied(NOT_OWNER)
    return campaign


def owned_segment(user, segment_id):
    """The segment a campaign goes to: one of `user`'s own, or None. A
    missing segment and someone else's read the same, so the refusal never
    says whether it exists."""
    # SOC2:AUTH-02 a campaign goes only to its owner's own segment
    return Segment.objects.filter(
        pk=segment_id, owner=user, organisation_id=user.organisation_id
    ).first()
```

- [ ] **Step 5: Write `services/campaigns/paging.py`**

```python
"""Opaque cursors: base64 of a JSON list. A malformed, tampered or naive one
reads as the first page (as `plans.listing`)."""

import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime


def encode(*values):
    raw = json.dumps([v.isoformat() if isinstance(v, datetime) else v for v in values])
    return urlsafe_b64encode(raw.encode()).decode()


def _load(cursor):
    return json.loads(urlsafe_b64decode(cursor.encode()))


def decode_after(cursor):
    """(an aware datetime, an id) after which the next page starts, or None."""
    if not cursor:
        return None
    try:
        at, pk = _load(cursor)
        at, pk = datetime.fromisoformat(at), int(pk)
    except (OverflowError, ValueError, TypeError):
        return None
    if at.tzinfo is None:
        return None
    return at, pk


def decode_id(cursor):
    """The id after which the next page starts, or None."""
    if not cursor:
        return None
    try:
        (pk,) = _load(cursor)
        return int(pk)
    except (OverflowError, ValueError, TypeError):
        return None


def page(queryset, size):
    """(the first `size` rows, whether there are more)."""
    rows = list(queryset[: size + 1])
    return rows[:size], len(rows) > size
```

- [ ] **Step 6: Write `services/campaigns/payloads.py`**

```python
"""A campaign, a send and a delivery as the API returns them (spec §4).

Twice filtered: hand-picked recipients and deliveries are named only to a
reader who may open the contact (`visible_children_q`, as `id IN`
subqueries), the rest counted; a send's rule is named only to a reader who
may read it. A send's `counts` are numbers only and stay whole."""

from django.db.models import Exists, OuterRef, Prefetch, Q

from services.accounts.models import User
from services.customers.models import Contact
from services.customers.scoping import visible_children_q
from services.organizations.rows import iso, person
from services.rules.access import readable_rules
from services.segments.models import Segment

from . import paging
from .access import readable_campaigns
from .models import Campaign, CampaignDelivery, CampaignSend, SkipReason

PAGE_SIZE = 50
SEND_PAGE = 20
DELIVERY_PAGE = 50
#: What a reader who may not read a send's rule sees in its place.
A_RULE = "a rule"


def readable_segment_ids(viewer, segment_ids):
    """Which of `segment_ids` `viewer` may read; no query for none."""
    ids = {pk for pk in segment_ids if pk is not None}
    if not ids:
        return set()
    named = Segment.shared_with.through.objects.filter(user_id=viewer.pk).values("segment_id")
    # SOC2:AUTH-02 a segment's id is given only to a reader who may open it
    rows = Segment.objects.filter(pk__in=ids, organisation_id=viewer.organisation_id).filter(
        Q(owner=viewer)
        | Q(sharing=Segment.Sharing.WORKSPACE)
        | Q(sharing=Segment.Sharing.PEOPLE, pk__in=named)
    )
    return set(rows.values_list("pk", flat=True))


def segment_ref(campaign, readable):
    segment = campaign.segment
    if segment is None:
        return None
    return {
        "id": segment.pk if segment.pk in readable else None,
        "name": segment.name,
        "kind": segment.kind,
    }


def annotated(queryset, viewer):
    """What a row needs, in a fixed number of queries: whether it has
    hand-picked recipients or sends, and the teammates it is shared with
    (from the viewer's own workspace only)."""
    through = Campaign.recipients.through.objects.filter(campaign_id=OuterRef("pk"))
    # SOC2:AUTH-02 teammates are named only from the viewer's own workspace
    teammates = User.objects.filter(organisation_id=viewer.organisation_id).order_by("name", "pk")
    return queryset.annotate(
        has_legacy=Exists(through),
        has_sends=Exists(CampaignSend.objects.filter(campaign_id=OuterRef("pk"))),
    ).prefetch_related(Prefetch("shared_with", queryset=teammates, to_attr="teammates"))


def last_sends(campaign_ids):
    """`{campaign_id: its latest send}` in one query (none for no ids)."""
    if not campaign_ids:
        return {}
    sends = (
        CampaignSend.objects.filter(campaign_id__in=campaign_ids)
        .order_by("campaign_id", "-started_at", "-pk")
        .distinct("campaign_id")
    )
    return {send.campaign_id: send for send in sends}


def _last_send_ref(send):
    if send is None:
        return None
    return {
        "id": send.pk,
        "finished_at": iso(send.finished_at),
        "status": send.status,
        "counts": send.counts,
    }


def _row(campaign, viewer, readable, last):
    return {
        "id": campaign.pk,
        "name": campaign.name,
        "status": campaign.status,
        "segment": segment_ref(campaign, readable),
        "roles": campaign.roles,
        "owner": person(campaign.owner),
        "is_owner": campaign.owner_id == viewer.pk,
        "sharing": campaign.sharing,
        "shared_with": [{"id": user.pk, "name": user.name} for user in campaign.teammates],
        "last_send": _last_send_ref(last),
        "needs_segment": (
            campaign.segment_id is None
            and campaign.status == Campaign.Status.DRAFT
            and campaign.has_legacy
        ),
        "updated_at": iso(campaign.updated_at),
    }


def campaign_rows(campaigns, viewer):
    """The list's rows: five queries whatever their number (the campaigns,
    their teammates, the readable segments, the last sends; the annotations
    ride on the first)."""
    campaigns = list(campaigns)
    readable = readable_segment_ids(viewer, [c.segment_id for c in campaigns])
    last = last_sends([c.pk for c in campaigns])
    return [_row(c, viewer, readable, last.get(c.pk)) for c in campaigns]


def list_page(viewer, params):
    """`GET campaigns/?tab=mine|shared&archived=1&cursor=`."""
    campaigns = readable_campaigns(viewer)
    if params.get("tab") == "shared":
        campaigns = campaigns.exclude(owner=viewer)
    else:
        campaigns = campaigns.filter(owner=viewer)
    if params.get("archived") != "1":
        campaigns = campaigns.exclude(status=Campaign.Status.ARCHIVED)
    after = paging.decode_after(params.get("cursor"))
    if after is not None:
        at, pk = after
        campaigns = campaigns.filter(Q(updated_at__lt=at) | Q(updated_at=at, pk__lt=pk))
    ordered = annotated(campaigns, viewer).select_related("owner", "segment")
    rows, more = paging.page(ordered.order_by("-updated_at", "-pk"), PAGE_SIZE)
    return {
        "results": campaign_rows(rows, viewer),
        "next": paging.encode(rows[-1].updated_at, rows[-1].pk) if more else None,
    }


def _visible_contacts(viewer):
    # SOC2:AUTH-02 a contact is named only to someone who may open it
    return Contact.objects.filter(visible_children_q(viewer)).values("pk")


def campaign_payload(campaign, viewer):
    """The whole campaign, re-read with its annotations (after a write too)."""
    campaign = (
        annotated(Campaign.objects.filter(pk=campaign.pk), viewer)
        .select_related("owner", "segment")
        .get()
    )
    body = campaign_rows([campaign], viewer)[0]
    legacy = campaign.recipients.order_by("name", "pk")
    seen = list(legacy.filter(pk__in=_visible_contacts(viewer)).values_list("pk", "name"))
    body.update(
        {
            "subject": campaign.subject,
            "body": campaign.body,
            "legacy_recipients": [{"id": pk, "name": name} for pk, name in seen],
            "legacy_hidden": legacy.count() - len(seen),
            "can_delete": campaign.owner_id == viewer.pk and not campaign.has_sends,
        }
    )
    return body


def readable_rule_ids(viewer, rule_ids):
    ids = {pk for pk in rule_ids if pk is not None}
    if not ids:
        return set()
    return set(readable_rules(viewer).filter(pk__in=ids).values_list("pk", flat=True))


def _rule_ref(send, readable):
    if send.rule_id is None:
        return None
    if send.rule_id in readable:
        return {"id": send.rule_id, "name": send.rule.name}
    return {"id": None, "name": A_RULE}


def send_payload(send, viewer, readable=None):
    if readable is None:
        readable = readable_rule_ids(viewer, [send.rule_id])
    return {
        "id": send.pk,
        "kind": send.kind,
        "status": send.status,
        "migrated": send.migrated,
        "sent_by": person(send.sent_by),
        "rule": _rule_ref(send, readable),
        "started_at": iso(send.started_at),
        "finished_at": iso(send.finished_at),
        "subject": send.subject,
        "body": send.body,
        "counts": send.counts,
    }


def sends_page(campaign, viewer, params):
    """`GET campaigns/:id/sends/?cursor=`, newest first."""
    sends = campaign.sends.select_related("sent_by", "rule")
    after = paging.decode_after(params.get("cursor"))
    if after is not None:
        at, pk = after
        sends = sends.filter(Q(started_at__lt=at) | Q(started_at=at, pk__lt=pk))
    rows, more = paging.page(sends.order_by("-started_at", "-pk"), SEND_PAGE)
    readable = readable_rule_ids(viewer, [send.rule_id for send in rows])
    return {
        "results": [send_payload(send, viewer, readable) for send in rows],
        "next": paging.encode(rows[-1].started_at, rows[-1].pk) if more else None,
    }


def _record(contact):
    if contact.customer_id:
        return {"kind": "organization", "id": contact.customer_id, "name": contact.customer.name}
    return {"kind": "account", "id": contact.account_id, "name": contact.account.name}


def _delivery_row(delivery):
    contact = delivery.contact
    return {
        "id": delivery.pk,
        "status": delivery.status,
        "reason": delivery.reason,
        "contact": {"id": contact.pk, "name": contact.name},
        "record": _record(contact),
        "sent_at": iso(delivery.sent_at),
    }


def deliveries_page(send, viewer, params):
    """`GET …/deliveries/?status=&reason=&cursor=`: the deliveries whose
    contact the reader may open, in send order, and how many others match."""
    rows = send.deliveries.all()
    if params.get("status") in CampaignDelivery.Status.values:
        rows = rows.filter(status=params["status"])
    if params.get("reason") in SkipReason.values:
        rows = rows.filter(reason=params["reason"])
    seen = _visible_contacts(viewer)
    hidden = rows.exclude(contact_id__in=seen).count()
    visible = rows.filter(contact_id__in=seen).select_related(
        "contact__customer", "contact__account"
    )
    after = paging.decode_id(params.get("cursor"))
    if after is not None:
        visible = visible.filter(pk__gt=after)
    page, more = paging.page(visible.order_by("pk"), DELIVERY_PAGE)
    return {
        "results": [_delivery_row(delivery) for delivery in page],
        "next": paging.encode(page[-1].pk) if more else None,
        "hidden": hidden,
    }
```

Note: `annotated` runs `select_related("owner", "segment")` on the same query, so `campaign.owner` and `campaign.segment` cost nothing.

- [ ] **Step 7: Rewrite `services/campaigns/views.py` (the read side)**

```python
"""The campaign endpoints (spec §4). Readers read; only the owner writes,
previews, counts and sends. Every read is filtered by what the reader may
open. See docs/API_CONTRACTS.md, `campaigns`."""

from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .access import get_readable
from .payloads import campaign_payload, deliveries_page, list_page, send_payload, sends_page


class CampaignListCreateView(APIView):
    """GET /api/v1/campaigns/?tab=mine|shared&archived=1&cursor=."""

    # SOC2:AUTH-02 authentication here; `readable_campaigns` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(list_page(request.user, request.query_params))


class CampaignDetailView(APIView):
    """GET /api/v1/campaigns/<id>/: readers read (404 for anyone else)."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the campaign
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(campaign_payload(get_readable(request.user, pk), request.user))


class CampaignSendsView(APIView):
    """GET /api/v1/campaigns/<id>/sends/?cursor=, newest first."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the campaign
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        campaign = get_readable(request.user, pk)
        return Response(sends_page(campaign, request.user, request.query_params))


def _send(request, pk, send_id):
    campaign = get_readable(request.user, pk)
    return get_object_or_404(campaign.sends.select_related("sent_by", "rule"), pk=send_id)


class CampaignSendDetailView(APIView):
    """GET /api/v1/campaigns/<id>/sends/<send_id>/."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the campaign
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, send_id):
        return Response(send_payload(_send(request, pk, send_id), request.user))


class CampaignDeliveriesView(APIView):
    """GET /api/v1/campaigns/<id>/sends/<send_id>/deliveries/?status=&reason=&cursor=."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the campaign, the page each row
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, send_id):
        send = _send(request, pk, send_id)
        return Response(deliveries_page(send, request.user, request.query_params))
```

Replace `services/campaigns/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.CampaignListCreateView.as_view(), name="campaign-list"),
    path("<int:pk>/", views.CampaignDetailView.as_view(), name="campaign-detail"),
    path("<int:pk>/sends/", views.CampaignSendsView.as_view(), name="campaign-sends"),
    path(
        "<int:pk>/sends/<int:send_id>/",
        views.CampaignSendDetailView.as_view(),
        name="campaign-send-detail",
    ),
    path(
        "<int:pk>/sends/<int:send_id>/deliveries/",
        views.CampaignDeliveriesView.as_view(),
        name="campaign-send-deliveries",
    ),
]
```

`services/campaigns/audit.py` is left as it is until Task 5 rewrites it; nothing imports it now.

- [ ] **Step 8: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns --parallel --noinput`
Expected: PASS.

Run: `venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add -A services/campaigns
git commit -m "feat(campaigns): read campaigns, sends and deliveries, owned and shared

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Writing campaigns: create, edit, share, archive, delete

Spec §1.1 (fields, limit), §1.5 (merge-field refusal at save), §1.7 (owner only, delete 409), §1.10 (audit), §4 (`POST campaigns/`, `PATCH/DELETE campaigns/:id/`). Contract notes 9, 10, 11, 12. Decision 10.

**Files:**
- Create: `services/campaigns/serializers.py` (new content; Task 4 deleted the old one)
- Modify: `services/campaigns/audit.py` (rewrite), `services/campaigns/views.py` (`post`, `patch`, `delete`)
- Test: `services/campaigns/tests/test_writing.py`

**Interfaces:**
- Consumes: `access.get_owned`, `owned_segment`; `payloads.campaign_payload` (Task 4); `validation` (Task 3); `surveys.serializers.roles_field`, `clean_roles`, `NO_ROLES`.
- Produces:
  - `services.campaigns.serializers`: `subject_field() -> CharField`, `body_field() -> CharField`, `check_merge_fields(value) -> str`, `CampaignWriteSerializer` (fields `name, subject, body, segment, roles, status, sharing, shared_with`), `PreviewSerializer` (fields `contact, subject, body`).
  - `services.campaigns.audit`: `record(verb, campaign, *, request=None, actor=None, metadata=None)` (writes `campaign.<verb>`, `target_repr="Campaign <id>"`, `organisation=campaign.organisation`), `record_shared(request, campaign)`, `changed_fields(campaign, data) -> list[str]`.
  - `views._limit_reached(user) -> bool`; `SHARING_FIELDS = frozenset({"sharing", "shared_with"})`.

- [ ] **Step 1: Write the failing tests**

Create `services/campaigns/tests/test_writing.py`:

```python
"""Writing campaigns (spec §1.1, §1.7, §4): only the owner writes (403 for
another reader, 404 for anyone else); every refusal is the UI's own words;
writes are audited by id and field name only."""

from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.campaigns import validation as say
from services.campaigns.models import Campaign
from services.campaigns.tests.fixtures import CampaignFixture

URL = "/api/v1/campaigns/"


class CreateTests(CampaignFixture):
    def create(self, user=None, **body):
        return self.api(user or self.csm).post(URL, body, format="json")

    def test_a_name_is_enough(self):
        response = self.create(name="Win-back")
        self.assertEqual(response.status_code, 201, response.content)
        campaign = Campaign.objects.get(pk=response.data["id"])
        self.assertEqual(
            (campaign.owner, campaign.organisation, campaign.status, campaign.sharing),
            (self.csm, self.org, "draft", "private"),
        )
        self.assertEqual(
            (campaign.subject, campaign.body, campaign.roles),
            ("", "", ["champion", "decision_maker"]),
        )
        self.assertEqual(response.data["is_owner"], True)
        self.assertEqual(self.events("campaign.created"), [(str(campaign.pk), {"segment": None})])
        self.assertEqual(self.events("campaign.shared"), [])

    def test_the_whole_body(self):
        response = self.create(
            name="Win-back",
            segment=self.book.pk,
            roles=["decision_maker", "champion", "champion"],
            subject="Hi {first_name}",
            body="From {sender_name} at {organisation}",
            sharing="people",
            shared_with=[self.other.pk],
            status="archived",
        )
        self.assertEqual(response.status_code, 201, response.content)
        campaign = Campaign.objects.get(pk=response.data["id"])
        self.assertEqual(
            (campaign.segment, campaign.roles, campaign.status),
            (self.book, ["decision_maker", "champion"], "draft"),  # status is ignored on create
        )
        self.assertEqual(list(campaign.shared_with.all()), [self.other])
        self.assertEqual(
            self.events("campaign.shared"),
            [(str(campaign.pk), {"sharing": "people", "shared_with": [self.other.pk]})],
        )

    def test_roles_follow_the_segments_kind(self):
        contacts = self.create(name="A", segment=self.people.pk, roles=["champion"])
        self.assertEqual(Campaign.objects.get(pk=contacts.data["id"]).roles, [])
        self.assertEqual(
            self.create(name="B", segment=self.book.pk, roles=[]).data,
            {"roles": ["Choose at least one role."]},
        )

    def test_field_refusals(self):
        cases = [
            ({}, {"name": [say.NO_NAME]}),
            ({"name": ""}, {"name": [say.NO_NAME]}),
            ({"name": "x" * 121}, {"name": [say.LONG_NAME]}),
            ({"name": "A", "subject": "x" * 151}, {"subject": [say.LONG_SUBJECT]}),
            ({"name": "A", "body": "x" * 5001}, {"body": [say.LONG_BODY]}),
            ({"name": "A", "subject": "Hi {name}"}, {"subject": [say.MERGE_FIELDS_ONLY]}),
            ({"name": "A", "body": "{first_name} {First_Name}"}, {"body": [say.MERGE_FIELDS_ONLY]}),
            ({"name": "A", "sharing": "people"}, {"shared_with": [say.NO_TEAMMATES]}),
        ]
        for body, refusal in cases:
            response = self.create(**body)
            self.assertEqual((response.status_code, response.data), (400, refusal), body)
        self.assertFalse(Campaign.objects.exists())

    def test_only_your_own_segment(self):
        danas = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        for segment in (danas.pk, 999999):
            response = self.create(name="A", segment=segment)
            self.assertEqual(response.data, {"segment": [say.OWN_SEGMENT]}, segment)

    def test_only_active_teammates_in_the_workspace(self):
        response = self.create(name="A", sharing="people", shared_with=[self.stranger.pk])
        self.assertEqual((response.status_code, list(response.data)), (400, ["shared_with"]))

    def test_at_most_fifty_owned_archived_included(self):
        self.make_campaign(status="archived")
        with mock.patch("services.campaigns.views.MAX_OWNED", 1):
            response = self.create(name="Second")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"non_field_errors": ["You can own at most 50 campaigns."]}),
        )
        self.assertEqual(self.create(user=self.other, name="Dana's").status_code, 201)


class EditFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.campaign = cls.make_campaign(segment=cls.book, sharing="workspace")

    def patch(self, user=None, **body):
        return self.api(user or self.csm).patch(f"{URL}{self.campaign.pk}/", body, format="json")


class EditTests(EditFixture):
    def test_the_owner_edits_and_only_changed_field_names_are_audited(self):
        response = self.patch(name="Win-back", subject="New {first_name}", roles=["champion"])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            (response.data["subject"], response.data["roles"]), ("New {first_name}", ["champion"])
        )
        self.assertEqual(
            self.events("campaign.updated"),
            [(str(self.campaign.pk), {"fields": ["roles", "subject"]})],
        )

    def test_nothing_changed_is_not_audited(self):
        self.assertEqual(self.patch(name="Win-back").status_code, 200)
        self.assertEqual(self.events("campaign.updated"), [])

    def test_another_reader_is_403_anyone_else_404(self):
        self.assertEqual(
            (
                self.patch(self.other, name="Mine now").status_code,
                self.patch(self.other, name="x").data,
            ),
            (403, {"detail": say.NOT_OWNER}),
        )
        self.assertEqual(self.patch(self.stranger, name="x").status_code, 404)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.name, "Win-back")

    def test_a_contact_segment_clears_the_roles_and_back_restores_the_defaults(self):
        self.assertEqual(self.patch(segment=self.people.pk).data["roles"], [])
        self.assertEqual(
            self.patch(segment=self.book.pk).data["roles"], ["champion", "decision_maker"]
        )

    def test_sharing_changes_are_audited_as_shared(self):
        self.patch(sharing="private")
        self.assertEqual(
            self.events("campaign.shared"),
            [(str(self.campaign.pk), {"sharing": "private", "shared_with": []})],
        )

    def test_the_edit_waits_for_the_campaigns_row_lock(self):
        with CaptureQueriesContext(connection) as ctx:
            self.patch(name="Locked")
        locks = [
            q["sql"]
            for q in ctx.captured_queries
            if q["sql"].endswith('FOR NO KEY UPDATE OF "campaigns_campaign"')
        ]
        self.assertEqual(len(locks), 1)


class StatusTests(EditFixture):
    def test_archive_and_unarchive(self):
        response = self.patch(status="archived")
        self.assertEqual(response.data["status"], "archived")
        self.assertEqual(self.events("campaign.archived"), [(str(self.campaign.pk), {})])
        self.assertEqual(self.events("campaign.updated"), [])
        self.assertEqual(self.patch(status="active").data["status"], "draft")  # never sent
        self.patch(status="archived")
        self.make_send(self.campaign)
        self.assertEqual(self.patch(status="active").data["status"], "active")
        self.assertEqual(
            self.events("campaign.updated"),
            [(str(self.campaign.pk), {"fields": ["status"]})] * 2,
        )

    def test_active_on_a_live_campaign_changes_nothing(self):
        self.assertEqual(self.patch(status="active").data["status"], "draft")
        self.assertEqual(self.events("campaign.updated"), [])

    def test_other_statuses_are_refused(self):
        for value in ("draft", "sent", "sending", ""):
            response = self.patch(status=value)
            self.assertEqual(
                (response.status_code, response.data), (400, {"status": [say.CHOOSE_STATUS]}), value
            )

    def test_an_archived_campaign_is_still_editable(self):
        self.patch(status="archived")
        self.assertEqual(self.patch(subject="Still {first_name}").status_code, 200)


class DeleteTests(EditFixture):
    def delete(self, user=None):
        return self.api(user or self.csm).delete(f"{URL}{self.campaign.pk}/")

    def test_a_campaign_never_sent_is_deleted_and_audited(self):
        self.assertEqual(self.delete().status_code, 204)
        self.assertFalse(Campaign.objects.filter(pk=self.campaign.pk).exists())
        self.assertEqual(self.events("campaign.deleted"), [(str(self.campaign.pk), {})])

    def test_a_sent_campaign_is_409(self):
        self.make_send(self.campaign, [self.ann])
        response = self.delete()
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "CAMPAIGN_SENT", "detail": "Archive it instead: it has been sent."}),
        )
        self.assertTrue(Campaign.objects.filter(pk=self.campaign.pk).exists())

    def test_only_the_owner(self):
        self.assertEqual(self.delete(self.other).status_code, 403)
        self.assertEqual(self.delete(self.stranger).status_code, 404)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_writing --noinput`
Expected: FAIL, `405 != 201` (no `post` yet).

- [ ] **Step 3: Write `services/campaigns/serializers.py`**

```python
"""What a campaign's owner writes. The owner and workspace come from the
request, never the body. A segment must be one of the caller's own
(`access.owned_segment`); anything else is the same field refusal."""

from rest_framework import serializers

from services.accounts.models import User
from services.surveys.serializers import clean_roles, roles_field

from . import validation as say
from .access import owned_segment
from .models import MAX_BODY, MAX_NAME, MAX_SHARED, MAX_SUBJECT, Campaign, default_roles

#: The two values a PATCH's `status` may take (contract note 11).
STATUSES = ("archived", "active")


def check_merge_fields(value):
    if say.merge_field_errors(value):
        raise serializers.ValidationError(say.MERGE_FIELDS_ONLY)
    return value


def subject_field():
    return serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_SUBJECT,
        error_messages={"max_length": say.LONG_SUBJECT},
    )


def body_field():
    return serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
        max_length=MAX_BODY,
        error_messages={"max_length": say.LONG_BODY},
    )


class CampaignWriteSerializer(serializers.ModelSerializer):
    name = serializers.CharField(
        max_length=MAX_NAME,
        error_messages={
            "required": say.NO_NAME,
            "blank": say.NO_NAME,
            "null": say.NO_NAME,
            "max_length": say.LONG_NAME,
        },
    )
    subject = subject_field()
    body = body_field()
    segment = serializers.IntegerField(required=False, allow_null=True)
    roles = roles_field(required=False)
    status = serializers.CharField(required=False, allow_blank=True)
    shared_with = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.none(), required=False
    )

    class Meta:
        model = Campaign
        fields = ["name", "subject", "body", "segment", "roles", "status", "sharing", "shared_with"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context["request"].user
        # SOC2:AUTH-02 shared only with active teammates in the owner's workspace
        self.fields["shared_with"].child_relation.queryset = User.objects.filter(
            organisation_id=user.organisation_id, is_active=True
        ).exclude(pk=user.pk)

    def validate_subject(self, value):
        return check_merge_fields(value)

    def validate_body(self, value):
        return check_merge_fields(value)

    def validate_segment(self, value):
        if value is None:
            return None
        segment = owned_segment(self.context["request"].user, value)
        if segment is None:
            raise serializers.ValidationError(say.OWN_SEGMENT)
        return segment

    def validate_status(self, value):
        if value not in STATUSES:
            raise serializers.ValidationError(say.CHOOSE_STATUS)
        return value

    def _current(self, attrs, name, default):
        if name in attrs:
            return attrs[name]
        return getattr(self.instance, name) if self.instance is not None else default

    def validate(self, attrs):
        instance = self.instance
        if instance is None or "segment" in attrs or "roles" in attrs:
            segment = self._current(attrs, "segment", None)
            roles = attrs.get("roles") if "roles" in attrs else None
            if roles is None:
                # unsent: keep what is stored, or tick the defaults again after a contact segment
                roles = (instance.roles if instance is not None else None) or default_roles()
            attrs["roles"] = clean_roles(segment, roles)
        self._status(attrs)
        self._sharing(attrs)
        return attrs

    def _status(self, attrs):
        """`archived` archives; `active` un-archives, to `active` when it has
        sends and `draft` otherwise. Ignored on create."""
        wanted = attrs.pop("status", None)
        instance = self.instance
        if wanted is None or instance is None:
            return
        if wanted == "archived" and instance.status != Campaign.Status.ARCHIVED:
            attrs["status"] = Campaign.Status.ARCHIVED
        elif wanted == "active" and instance.status == Campaign.Status.ARCHIVED:
            has_sends = instance.sends.exists()
            attrs["status"] = Campaign.Status.ACTIVE if has_sends else Campaign.Status.DRAFT

    def _sharing(self, attrs):
        instance = self.instance
        default = instance.sharing if instance is not None else Campaign.Sharing.PRIVATE
        if attrs.get("sharing", default) == Campaign.Sharing.PEOPLE:
            if "shared_with" in attrs:
                people = attrs["shared_with"]
            else:
                people = list(instance.shared_with.all()) if instance is not None else []
            if not people:
                raise serializers.ValidationError({"shared_with": [say.NO_TEAMMATES]})
            if len(people) > MAX_SHARED:
                raise serializers.ValidationError({"shared_with": [say.TOO_MANY_SHARED]})
        elif "sharing" in attrs or "shared_with" in attrs:
            attrs["shared_with"] = []

    def update(self, instance, validated_data):
        """Writes only the fields the request names (and `updated_at`)."""
        people = validated_data.pop("shared_with", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        if people is not None:
            instance.shared_with.set(people)
        return instance


class PreviewSerializer(serializers.Serializer):
    """`POST campaigns/:id/preview/`: optional unsaved subject and body (what
    the editor shows), checked as a save checks them, and optionally who."""

    contact = serializers.IntegerField(required=False, allow_null=True)
    subject = subject_field()
    body = body_field()

    def validate_subject(self, value):
        return check_merge_fields(value)

    def validate_body(self, value):
        return check_merge_fields(value)
```

- [ ] **Step 4: Rewrite `services/campaigns/audit.py`**

```python
"""Campaign writes, audited (SOC2:LOG-01): `campaign.<verb>`. An event names
the campaign by id only (`target_repr` "Campaign <id>"), never its name,
subject or body; metadata holds ids, field names, kinds and counts. Each
event lands in the same transaction as its write."""

from core import audit


def record(verb, campaign, *, request=None, actor=None, metadata=None):
    audit.record(  # SOC2:LOG-01
        f"campaign.{verb}",
        request=request,
        actor=actor,
        organisation=campaign.organisation,
        target=campaign,
        target_repr=f"Campaign {campaign.pk}",
        metadata=metadata or {},
    )


def record_shared(request, campaign):
    record(
        "shared",
        campaign,
        request=request,
        metadata={
            "sharing": campaign.sharing,
            "shared_with": sorted(campaign.shared_with.values_list("pk", flat=True)),
        },
    )


def changed_fields(campaign, data):
    """The names of the fields `data` would change, never their values."""
    changed = []
    for name, value in data.items():
        if name == "shared_with":
            before = set(campaign.shared_with.values_list("pk", flat=True))
            if {user.pk for user in value} != before:
                changed.append(name)
        elif getattr(campaign, name) != value:
            changed.append(name)
    return sorted(changed)
```

- [ ] **Step 5: Add the writes to `services/campaigns/views.py`**

Add these imports at the top (keep the existing ones):

```python
from django.db import transaction
from rest_framework import status

from services.accounts.models import User

from . import audit
from .access import get_owned
from .models import MAX_OWNED, Campaign
from .serializers import CampaignWriteSerializer
from .validation import CAMPAIGN_SENT, LIMIT_REACHED
```

Add above `CampaignListCreateView`:

```python
SHARING_FIELDS = frozenset({"sharing", "shared_with"})


def _limit_reached(user):
    """Whether `user` already owns the most campaigns allowed, archived ones
    included. Call inside the transaction that creates the new one: the
    owner's row is locked first, so two creates at once queue."""
    list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))
    return Campaign.objects.filter(owner=user).count() >= MAX_OWNED
```

Add to `CampaignListCreateView` (and extend its docstring with "POST creates a draft owned by the caller."):

```python
def post(self, request):
    serializer = CampaignWriteSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        if _limit_reached(request.user):
            return Response(
                {"non_field_errors": [LIMIT_REACHED]}, status=status.HTTP_400_BAD_REQUEST
            )
        campaign = serializer.save(owner=request.user, organisation_id=request.user.organisation_id)
        audit.record(
            "created", campaign, request=request, metadata={"segment": campaign.segment_id}
        )
        if campaign.sharing != Campaign.Sharing.PRIVATE:
            audit.record_shared(request, campaign)
    return Response(campaign_payload(campaign, request.user), status=status.HTTP_201_CREATED)
```

Add to `CampaignDetailView` (docstring: "GET/PATCH/DELETE … Readers read; only the owner writes (403 for another reader, 404 for anyone else). DELETE is 409 once it has been sent."):

```python
def patch(self, request, pk):
    campaign = get_owned(request.user, pk)
    with transaction.atomic():
        # The row lock a send's claim takes, so an edit never lands mid-claim.
        campaign = (
            Campaign.objects.select_for_update(no_key=True, of=("self",))
            .select_related("owner", "segment", "organisation")
            .get(pk=campaign.pk)
        )
        serializer = CampaignWriteSerializer(
            campaign, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        changed = audit.changed_fields(campaign, serializer.validated_data)
        campaign = serializer.save()
        if "status" in changed and campaign.status == Campaign.Status.ARCHIVED:
            changed.remove("status")
            audit.record("archived", campaign, request=request)
        fields = [name for name in changed if name not in SHARING_FIELDS]
        if fields:
            audit.record("updated", campaign, request=request, metadata={"fields": fields})
        if SHARING_FIELDS & set(changed):
            audit.record_shared(request, campaign)
    return Response(campaign_payload(campaign, request.user))


def delete(self, request, pk):
    campaign = get_owned(request.user, pk)
    with transaction.atomic():
        # A send's claim holds this row; a delete waits for it, then sees the send.
        campaign = (
            Campaign.objects.select_for_update(of=("self",))
            .select_related("organisation")
            .get(pk=campaign.pk)
        )
        if campaign.sends.exists():
            return Response(
                {"code": "CAMPAIGN_SENT", "detail": CAMPAIGN_SENT},
                status=status.HTTP_409_CONFLICT,
            )
        audit.record("deleted", campaign, request=request)
        campaign.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
```

A sharing-only edit writes `campaign.shared` and no `campaign.updated` (`test_sharing_changes_are_audited_as_shared`).

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns --parallel --noinput`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/campaigns/serializers.py services/campaigns/audit.py services/campaigns/views.py \
  services/campaigns/tests/test_writing.py
git commit -m "feat(campaigns): owner-only create, edit, share, archive and delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The send: claim, deliver, finish, resume

Spec §1.4, §1.5 (the link), §1.10 (`campaign_sent`, `send_started`, `send_finished`, logs). Contract notes 4, 21, 22. Decisions 4, 5, 6, 7, 9.

**Files:**
- Create: `services/campaigns/sending.py`
- Modify: `services/email.py` (`send_campaign_email`)
- Test: `services/campaigns/tests/test_sending.py`

**Interfaces:**
- Consumes: `audience.build`, `Reach` (Task 2); `rendering.compose`, `render`, `link` (Task 3); `audit.record` (Task 5); `surveys.sending.Refusal`, `email_is_set_up`; `surveys.tokens.new_token`, `hash_token`.
- Produces (`services.campaigns.sending`):
  - `Refusal` (re-exported from Surveys: `.status`, `.body`);
  - `before_claim(campaign) -> dict | None` (the `{"detail": …}` a send meets before anything is locked: email set up, archived, segment, subject and body);
  - `claim(campaign_id, *, kind, by, rule=None, review=None, records=None, today, now, request=None) -> CampaignSend` (raises `Refusal`; opens its own `transaction.atomic()`, a savepoint when nested);
  - `deliver(send) -> CampaignSend` (outside any transaction; finishes the send when nothing is left);
  - `finish(send, *, now) -> CampaignSend`; `tally(send) -> dict`;
  - `resume(send, *, now) -> CampaignSend`; `deliver_pending(organisation=None, *, now) -> tuple[int, int]` (finished, failed);
  - `sent_message(campaign, counts) -> str`.
  - `services.email.send_campaign_email(address, subject, body, *, connection=None)`.

- [ ] **Step 1: Write the failing tests**

Create `services/campaigns/tests/test_sending.py`:

```python
"""The send (spec §1.4): the claim locks the workspace then the campaign,
resolves the audience and writes every delivery; delivery emails each
queued person at most once, outside any transaction; the finish freezes the
counts. Tokens are stored as hashes only; logs carry ids and class names."""

import re
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.campaigns import sending
from services.campaigns import validation as say
from services.campaigns.models import CampaignSend
from services.campaigns.sending import (
    Refusal,
    before_claim,
    claim,
    deliver,
    deliver_pending,
    resume,
    sent_message,
)
from services.campaigns.tests.fixtures import CampaignFixture
from services.customers.models import Email
from services.surveys.tokens import hash_token

CONSOLE = "django.core.mail.backends.console.EmailBackend"
LINK = re.compile(r"/u/([A-Za-z0-9_-]{43})$")


class SendFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.campaign = cls.make_campaign(segment=cls.people)

    def claim(self, campaign=None, **kwargs):
        values = {"kind": "manual", "by": self.csm, "today": self.today, "now": self.now, **kwargs}
        return claim((campaign or self.campaign).pk, **values)

    def statuses(self, send):
        rows = send.deliveries.order_by("pk").values_list("contact__name", "status", "reason")
        return list(rows)


class ClaimTests(SendFixture):
    def test_the_claim_writes_the_send_and_everyone_on_it(self):
        self.ben.campaigns_unsubscribed_at = self.now
        self.ben.save(update_fields=["campaigns_unsubscribed_at"])
        self.people.pinned_ids = [self.ann.pk, self.dot.pk, self.ben.pk]
        self.people.save(update_fields=["pinned_ids"])
        send = self.claim()
        self.assertEqual(
            (send.kind, send.status, send.sent_by, send.started_at, send.finished_at),
            ("manual", "sending", self.csm, self.now, None),
        )
        self.assertEqual((send.subject, send.body), (self.campaign.subject, self.campaign.body))
        self.assertEqual(
            self.statuses(send),
            [("Ann", "queued", ""), ("Dot", "queued", ""), ("Ben", "skipped", "unsubscribed")],
        )
        self.assertEqual(send.counts["reached"], 3)
        self.assertEqual(send.counts["skipped"]["unsubscribed"], 1)
        self.assertEqual(send.deliveries.exclude(token_hash="").count(), 0)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, "active")
        self.assertEqual(
            self.events("campaign.send_started"),
            [(str(self.campaign.pk), {"send": send.pk, "kind": "manual", "counts": send.counts})],
        )
        self.assertEqual(mail.outbox, [])

    def refused(self, detail, campaign=None):
        with self.assertRaises(Refusal) as caught:
            self.claim(campaign)
        self.assertEqual(
            (caught.exception.status, caught.exception.body), (400, {"detail": detail})
        )
        self.assertFalse(CampaignSend.objects.exists())

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_email_not_set_up_writes_nothing(self):
        self.refused(say.EMAIL_NOT_SET_UP)
        self.assertEqual(before_claim(self.campaign), {"detail": say.EMAIL_NOT_SET_UP})

    def test_the_other_refusals(self):
        self.refused(say.ARCHIVED, self.make_campaign(segment=self.people, status="archived"))
        self.refused(say.CHOOSE_SEGMENT, self.make_campaign())
        self.refused(say.NEEDS_WORDS, self.make_campaign(segment=self.people, subject=" "))
        self.refused(say.NEEDS_WORDS, self.make_campaign(segment=self.people, body=""))
        gone = self.pinned("contact", [self.ann])
        orphan = self.make_campaign(segment=gone)
        gone.delete()
        self.refused(say.CHOOSE_SEGMENT, orphan)

    def test_nobody_to_email_writes_nothing(self):
        for person in (self.ann, self.dot):
            person.campaigns_unsubscribed_at = self.now
            person.save(update_fields=["campaigns_unsubscribed_at"])
        self.refused(say.NOBODY)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, "draft")

    def test_a_second_claim_sees_the_first_ones_queued_people(self):
        self.claim()
        self.refused_after_first()

    def refused_after_first(self):
        with self.assertRaises(Refusal) as caught:
            self.claim()
        self.assertEqual(caught.exception.body, {"detail": say.NOBODY})
        other = self.make_campaign(name="Other", segment=self.people)
        with self.assertRaises(Refusal):
            self.claim(other)  # both are queued on a send: the 3-day gap holds too

    def test_lock_order_workspace_then_campaign_then_the_insert(self):
        with CaptureQueriesContext(connection) as ctx:
            self.claim()
        sqls = [query["sql"] for query in ctx.captured_queries]
        workspace = next(
            i
            for i, s in enumerate(sqls)
            if 'FROM "accounts_organisation"' in s and s.endswith("FOR NO KEY UPDATE")
        )
        campaign = next(
            i
            for i, s in enumerate(sqls)
            if 'FROM "campaigns_campaign"' in s and "FOR NO KEY UPDATE" in s
        )
        insert = next(
            i for i, s in enumerate(sqls) if s.startswith('INSERT INTO "campaigns_campaignsend"')
        )
        self.assertLess(workspace, campaign, sqls)
        self.assertLess(campaign, insert, sqls)

    def test_records_limit_a_rule_send(self):
        campaign = self.make_campaign(segment=self.book)
        send = self.claim(campaign, kind="rule", by=None, records=[self.dough.pk])
        self.assertEqual(self.statuses(send), [("Dot", "queued", "")])

    def test_over_the_limit_gets_rows_too(self):
        with mock.patch("services.campaigns.audience.MAX_PEOPLE", 1):
            send = self.claim()
        self.assertEqual(
            self.statuses(send), [("Ann", "queued", ""), ("Dot", "skipped", "over_limit")]
        )


class DeliverTests(SendFixture):
    def test_each_person_is_emailed_once_and_filed_on_their_record(self):
        send = deliver(self.claim())
        self.assertEqual(self.mail_to(), ["ann@example.com", "dot@example.com"])
        first = mail.outbox[0]
        self.assertEqual(first.subject, "Hello Ann")
        self.assertTrue(
            first.body.startswith("We miss you at Pizza Hut.\nCarl CSM\n\n—\nCarl CSM, Acme Inc\n")
        )
        token = LINK.search(first.body).group(1)
        delivery = send.deliveries.get(contact=self.ann)
        self.assertEqual(delivery.token_hash, hash_token(token))
        email = delivery.email
        self.assertEqual(
            (
                email.customer,
                email.campaign,
                email.subject,
                email.sender_name,
                email.recipient_name,
            ),
            (self.pizza, self.campaign, "Hello Ann", "Carl CSM", "Ann"),
        )
        self.assertEqual(email.body, "We miss you at Pizza Hut.\nCarl CSM")  # no footer, no token
        self.assertEqual(self.statuses(send), [("Ann", "sent", ""), ("Dot", "sent", "")])
        self.assertEqual((send.status, send.counts["sent"], send.counts["reached"]), ("sent", 2, 2))
        self.assertIsNotNone(send.finished_at)
        self.assertEqual(
            self.events("campaign.send_finished"),
            [(str(self.campaign.pk), {"send": send.pk, "counts": send.counts})],
        )

    def test_the_token_is_stored_nowhere(self):
        deliver(self.claim())
        token = LINK.search(mail.outbox[0].body).group(1)
        self.assertFalse(Email.objects.filter(body__contains=token).exists())
        self.assertNotIn(token, str(list(AuditEvent.objects.values_list("metadata", flat=True))))

    def test_one_failure_is_skipped_failed_and_the_rest_go_on(self):
        real = sending.send_campaign_email

        def flaky(address, *args, **kwargs):
            if address == "ann@example.com":
                raise ConnectionError("550 ann@example.com rejected")
            return real(address, *args, **kwargs)

        with (
            mock.patch("services.campaigns.sending.send_campaign_email", flaky),
            self.assertLogs("services.campaigns.sending", "WARNING") as logs,
        ):
            send = deliver(self.claim())
        self.assertEqual(self.statuses(send), [("Ann", "skipped", "failed"), ("Dot", "sent", "")])
        self.assertEqual(send.counts["skipped"]["failed"], 1)
        self.assertEqual(self.mail_to(), ["dot@example.com"])
        self.assertNotIn("ann@example.com", "\n".join(logs.output))
        self.assertIn("ConnectionError", "\n".join(logs.output))

    def test_delivering_again_emails_nobody_twice(self):
        send = self.claim()
        deliver(send)
        deliver(send)
        self.assertEqual(len(mail.outbox), 2)

    def test_a_person_another_worker_took_is_left_to_it(self):
        send = self.claim()
        send.deliveries.filter(contact=self.ann).update(token_hash="t" * 64)
        send = deliver(send)
        self.assertEqual(self.mail_to(), ["dot@example.com"])
        self.assertEqual(send.status, "sending")  # Ann is still someone's to finish


class ResumeTests(SendFixture):
    def cut_off(self, started):
        send = self.claim(now=started)
        send.deliveries.filter(contact=self.ann).update(token_hash="t" * 64)
        return send

    def test_a_stale_send_fails_the_person_it_was_emailing_and_sends_the_rest(self):
        send = resume(self.cut_off(self.now - timedelta(minutes=10)), now=self.now)
        self.assertEqual(self.statuses(send), [("Ann", "skipped", "failed"), ("Dot", "sent", "")])
        self.assertEqual((send.status, self.mail_to()), ("sent", ["dot@example.com"]))

    def test_a_young_send_leaves_the_taken_person_alone(self):
        send = resume(self.cut_off(self.now - timedelta(minutes=9)), now=self.now)
        self.assertEqual(self.statuses(send), [("Ann", "queued", ""), ("Dot", "sent", "")])
        self.assertEqual(send.status, "sending")

    def test_deliver_pending_takes_rule_sends_without_review_at_once_and_others_when_stale(self):
        rule = self.make_rule()
        now_rule = self.claim(kind="rule", by=None, rule=rule)
        young = self.claim(self.make_campaign(name="Young", segment=self.book), now=self.now)
        self.assertEqual(deliver_pending(now=self.now), (1, 0))
        now_rule.refresh_from_db()
        young.refresh_from_db()
        self.assertEqual((now_rule.status, young.status), ("sent", "sending"))
        self.assertEqual(deliver_pending(now=self.now + timedelta(minutes=10)), (1, 0))
        young.refresh_from_db()
        self.assertEqual(young.status, "sent")

    def test_deliver_pending_one_workspace_and_failures_counted(self):
        send = self.claim(kind="rule", by=None)
        self.assertEqual(deliver_pending(self.other_org, now=self.now), (0, 0))
        with mock.patch("services.campaigns.sending.resume", side_effect=RuntimeError("x")):
            self.assertEqual(deliver_pending(self.org, now=self.now), (0, 1))
        send.refresh_from_db()
        self.assertEqual(send.status, "sending")


class NoticeTests(SendFixture):
    def test_a_rule_send_without_review_tells_the_owner(self):
        deliver(self.claim(kind="rule", by=None))
        self.assertEqual(
            self.notes("campaign_sent"),
            [(self.csm.pk, "Win-back emailed 2 people.", f"/campaigns/{self.campaign.pk}")],
        )

    def test_a_manual_send_tells_nobody(self):
        deliver(self.claim())
        self.assertEqual(self.notes("campaign_sent"), [])

    def test_the_words(self):
        counts = {"sent": 1, "skipped": {"no_email": 2, "failed": 4}}
        self.assertEqual(
            sent_message(self.campaign, counts), "Win-back emailed 1 person · 6 skipped."
        )
        self.assertEqual(
            sent_message(self.campaign, {"sent": 42, "skipped": {"failed": 0}}),
            "Win-back emailed 42 people.",
        )
```

Note on `test_lock_order…`: Django renders `select_for_update(no_key=True, of=("self",))` as `… FOR NO KEY UPDATE OF "campaigns_campaign"`, hence `in` rather than `endswith` for the campaign's lock.

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_sending --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.campaigns.sending'`.

- [ ] **Step 3: Change `send_campaign_email`**

In `services/email.py`, replace `send_campaign_email` entirely:

```python
def send_campaign_email(address, subject, body, *, connection=None):
    """One campaign email to one address, plain text: the subject and body
    are the owner's words with the merge fields filled and the footer added
    (services.campaigns.rendering), never rendered as HTML. `connection` is
    the send's one mail connection (None opens one). Raises on failure;
    services.campaigns.sending marks that delivery skipped `failed`."""

    if not address:
        raise ValueError("no address")
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[address],
        connection=connection,
    )
```

Fix the two comments that mention it by its old shape: `services/copilot/anthropic_client.py:22` ("send_campaign_email's own single outbound call") still reads true and stays; nothing else calls it.

- [ ] **Step 4: Write `services/campaigns/sending.py`**

```python
"""A campaign's send (spec §1.4): claim, deliver, finish.

1. Before anything is locked: email must be set up (else nothing is
   written), and the campaign not archived, with a segment, a subject and a
   body (`before_claim`).
2. The claim is one short transaction. The workspace's row is locked first
   (`FOR NO KEY UPDATE`, as Surveys' claim), then the campaign's, so every
   claim in the workspace queues behind any other: that is what makes the
   3-day gap and "once per campaign" hold. The audience is built again here
   as the owner (`audience.build`); the send and one delivery per person
   checked, queued or skipped, are written; the campaign becomes `active`.
3. Delivery runs outside any transaction, one person at a time over one
   mail connection. Each queued person is taken by one conditional UPDATE
   that writes their token's hash, so a resumed or concurrent delivery
   never emails anyone twice. The token lives only in memory and in the
   email. A failure marks that delivery skipped `failed` and carries on.
4. The finish freezes the counts once nobody is left queued.

A crash leaves the send `sending` with its people queued; `resume` (the
nightly rules step via `deliver_pending`, or the admin) finishes it.
There is no task queue: the request is the send. Log lines carry ids and
exception class names only, never an address, a subject or a body."""

import logging
from contextlib import suppress
from datetime import timedelta

from django.core.mail import get_connection
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from services.accounts.models import Organisation
from services.customers.models import Email
from services.email import send_campaign_email
from services.notifications.models import Notification
from services.notifications.realtime import notify
from services.surveys.sending import Refusal, email_is_set_up
from services.surveys.tokens import new_token

from . import audit
from .audience import build
from .models import (
    STALE_MINUTES,
    Campaign,
    CampaignDelivery,
    CampaignSend,
    SkipReason,
    empty_counts,
)
from .rendering import compose, link, render
from .validation import ARCHIVED, CHOOSE_SEGMENT, EMAIL_NOT_SET_UP, NEEDS_WORDS, NOBODY

logger = logging.getLogger(__name__)

__all__ = ["Refusal", "before_claim", "claim", "deliver", "finish", "resume", "deliver_pending"]

#: Deliveries written per statement at the claim.
BATCH = 1000
QUEUED = CampaignDelivery.Status.QUEUED
SENT = CampaignDelivery.Status.SENT
SKIPPED = CampaignDelivery.Status.SKIPPED


def _refusal(campaign):
    if campaign.status == Campaign.Status.ARCHIVED:
        return {"detail": ARCHIVED}
    if campaign.segment_id is None:
        return {"detail": CHOOSE_SEGMENT}
    if not campaign.subject.strip() or not campaign.body.strip():
        return {"detail": NEEDS_WORDS}
    return None


def before_claim(campaign):
    """The refusal a send meets before anything is locked or written, or None."""
    if not email_is_set_up():
        return {"detail": EMAIL_NOT_SET_UP}
    return _refusal(campaign)


def _lock(campaign_id):
    """The workspace, then the campaign, both `FOR NO KEY UPDATE`. None when
    the campaign is gone. Call inside a transaction."""
    organisation_id = (
        Campaign.objects.filter(pk=campaign_id).values_list("organisation_id", flat=True).first()
    )
    if organisation_id is None:
        return None
    list(
        Organisation.objects.select_for_update(no_key=True)
        .filter(pk=organisation_id)
        .values_list("pk", flat=True)
    )
    return (
        Campaign.objects.select_for_update(no_key=True, of=("self",))
        .select_related("owner", "segment", "organisation")
        .filter(pk=campaign_id)
        .first()
    )


def claim(campaign_id, *, kind, by, rule=None, review=None, records=None, today, now, request=None):
    """Locks, checks, builds the audience as the owner and writes the send
    and its deliveries. Raises `Refusal` (nothing written); returns the send,
    `sending`. `records` (a rule's fired records) limit the audience."""
    if not email_is_set_up():
        raise Refusal(400, {"detail": EMAIL_NOT_SET_UP})
    with transaction.atomic():
        campaign = _lock(campaign_id)
        if campaign is None:
            raise Refusal(404, {"detail": "Not found."})
        refusal = _refusal(campaign)
        if refusal:
            raise Refusal(400, refusal)
        # SOC2:AUTH-02 built as the campaign's owner, from their own segment
        reach = build(campaign, today=today, now=now, records=records)
        if not reach.queued:
            raise Refusal(400, {"detail": NOBODY})
        send = CampaignSend.objects.create(
            campaign=campaign,
            kind=kind,
            rule=rule,
            review=review,
            sent_by=by,
            started_at=now,
            subject=campaign.subject,
            body=campaign.body,
            counts=reach.counts(),
        )
        CampaignDelivery.objects.bulk_create(
            [CampaignDelivery(send=send, contact=person) for person in reach.queued]
            + [
                CampaignDelivery(send=send, contact=person, status=SKIPPED, reason=reason)
                for person, reason in reach.skipped
            ],
            batch_size=BATCH,
        )
        if campaign.status != Campaign.Status.ACTIVE:
            campaign.status = Campaign.Status.ACTIVE
            campaign.save(update_fields=["status", "updated_at"])
        audit.record(
            "send_started",
            campaign,
            request=request,
            actor=by,
            metadata={"send": send.pk, "kind": kind, "counts": send.counts},
        )
    return send


def _reconnect(connection):
    """After a failure the SMTP session may be dead; start a fresh one so the
    people after it are not failed with it."""
    with suppress(Exception):
        connection.close()
        connection.open()


def _deliver_one(send, delivery, sender, workspace, connection):
    token, token_hash = new_token()
    taken = CampaignDelivery.objects.filter(pk=delivery.pk, status=QUEUED, token_hash="").update(
        token_hash=token_hash
    )
    if not taken:
        return  # another delivery took this person
    mine = CampaignDelivery.objects.filter(pk=delivery.pk, token_hash=token_hash)
    contact = delivery.contact
    subject, body = compose(send, contact, sender_name=sender, workspace=workspace, url=link(token))
    try:
        send_campaign_email(contact.email.strip(), subject, body, connection=connection)
    except Exception as exc:  # noqa: BLE001 - one failure never stops the send
        # never str(exc): an SMTP refusal spells out the recipient's address
        logger.warning("campaign delivery %s not sent: %s", delivery.pk, type(exc).__name__)
        mine.update(status=SKIPPED, reason=SkipReason.FAILED)
        _reconnect(connection)
        return
    now = timezone.now()
    _subject, plain = render(send, contact, sender_name=sender)
    with transaction.atomic():
        email = Email.objects.create(
            customer_id=contact.customer_id,
            account_id=contact.account_id,
            subject=subject[:255],
            body=plain,
            sender_name=sender[:150],
            recipient_name=contact.name[:150],
            sent_at=now,
            campaign_id=send.campaign_id,
        )
        mine.update(status=SENT, reason="", sent_at=now, email=email)


def deliver(send):
    """Emails every queued person on `send` nobody has taken, then finishes
    it if nobody is left. Outside any transaction. Safe to run again."""
    send = CampaignSend.objects.select_related("campaign__owner", "campaign__organisation").get(
        pk=send.pk
    )
    campaign = send.campaign
    waiting = (
        send.deliveries.filter(status=QUEUED, token_hash="")
        .select_related("contact__customer", "contact__account")
        .order_by("pk")
    )
    with get_connection() as connection:
        for delivery in list(waiting):
            _deliver_one(
                send, delivery, campaign.owner.name, campaign.organisation.name, connection
            )
    return finish(send, now=timezone.now())


def tally(send):
    """The send's counts from its deliveries now."""
    counts = empty_counts()
    rows = send.deliveries.order_by().values("status", "reason").annotate(n=Count("id"))
    for row in rows:
        counts["reached"] += row["n"]
        if row["status"] == SENT:
            counts["sent"] += row["n"]
        elif row["status"] == SKIPPED:
            counts["skipped"][row["reason"]] += row["n"]
    return counts


def sent_message(campaign, counts):
    """ "Win-back emailed 42 people · 6 skipped." """
    sent, skipped = counts["sent"], sum(counts["skipped"].values())
    people = "1 person" if sent == 1 else f"{sent} people"
    text = f"{campaign.name} emailed {people}"
    return f"{text} · {skipped} skipped." if skipped else f"{text}."


def finish(send, *, now):
    """Marks the send `sent` with its counts frozen, once nobody on it is
    still queued; otherwise leaves it `sending` for whoever holds them."""
    with transaction.atomic():
        send = (
            CampaignSend.objects.select_for_update(no_key=True, of=("self",))
            .select_related("campaign__owner", "campaign__organisation")
            .get(pk=send.pk)
        )
        if (
            send.status == CampaignSend.Status.SENT
            or send.deliveries.filter(status=QUEUED).exists()
        ):
            return send
        send.counts = tally(send)
        send.status, send.finished_at = CampaignSend.Status.SENT, now
        send.save(update_fields=["counts", "status", "finished_at"])
        campaign = send.campaign
        audit.record("send_finished", campaign, metadata={"send": send.pk, "counts": send.counts})
        if send.kind == CampaignSend.Kind.RULE and send.review_id is None:
            notify(
                recipient=campaign.owner,
                actor=None,
                kind=Notification.Kind.CAMPAIGN_SENT,
                message=sent_message(campaign, send.counts),
                link=f"/campaigns/{campaign.pk}",
                push_on_commit=True,
            )
    return send


def resume(send, *, now):
    """Finishes a send cut off mid-delivery. Once it is `STALE_MINUTES` old,
    anyone it was emailing when it stopped (taken, never marked) is skipped
    `failed` rather than emailed again; then the rest are delivered."""
    if send.started_at <= now - timedelta(minutes=STALE_MINUTES):
        send.deliveries.filter(status=QUEUED).exclude(token_hash="").update(
            status=SKIPPED, reason=SkipReason.FAILED
        )
    return deliver(send)


def deliver_pending(organisation=None, *, now):
    """Every `sending` send nobody is delivering: a rule's send without
    review at once (the night claimed it), any other once it is
    `STALE_MINUTES` old, so a send still going out in a request is left
    alone. Each on its own; a failure is logged by id and class and counted.
    Returns (finished, failed)."""
    stale = now - timedelta(minutes=STALE_MINUTES)
    due = CampaignSend.objects.filter(status=CampaignSend.Status.SENDING).filter(
        Q(kind=CampaignSend.Kind.RULE, review__isnull=True) | Q(started_at__lte=stale)
    )
    if organisation is not None:
        due = due.filter(campaign__organisation=organisation)
    finished = failed = 0
    for send in list(due.order_by("pk")):
        try:
            send = resume(send, now=now)
        except Exception as exc:  # noqa: BLE001 - one send's failure never stops the rest
            logger.error("campaign send %s: finishing failed: %s", send.pk, type(exc).__name__)
            failed += 1
            continue
        finished += send.status == CampaignSend.Status.SENT
    return finished, failed
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_sending --noinput`
Expected: PASS.

Run: `venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add services/campaigns/sending.py services/email.py services/campaigns/tests/test_sending.py
git commit -m "feat(campaigns): claim under the workspace lock, deliver at most once, finish

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The audience count, the preview and Send now

Spec §1.4, §1.5 (`preview/`), §1.7 (owner only; counts as the owner), §4 (`GET audience/`, `POST preview/`, `POST sends/`). Contract notes 3, 4, 5, 6. Decision 8.

**Files:**
- Modify: `services/campaigns/views.py` (`CampaignAudienceView`, `CampaignPreviewView`, `CampaignSendsView.post`), `services/campaigns/urls.py`
- Test: `services/campaigns/tests/test_send_views.py`

**Interfaces:**
- Consumes: `access.get_owned` (Task 4); `serializers.PreviewSerializer` (Task 5); `audience.build`, `Reach.payload` (Task 2); `rendering.compose`, `link`, `PREVIEW_TOKEN` (Task 3); `sending.before_claim`, `claim`, `deliver`, `Refusal` (Task 6); `payloads.send_payload` (Task 4).
- Produces: views `CampaignAudienceView` (GET), `CampaignPreviewView` (POST), `CampaignSendsView.post`; URL names `campaign-audience`, `campaign-preview`.

- [ ] **Step 1: Write the failing tests**

Create `services/campaigns/tests/test_send_views.py`:

```python
"""The owner's three send-side routes (spec §4): the audience count, the
preview, and Send now. Only the owner calls them (403 for another reader,
404 for anyone else); the first two write nothing."""

from django.conf import settings
from django.core import mail
from django.test import override_settings

from services.campaigns import validation as say
from services.campaigns.models import CampaignSend
from services.campaigns.tests.fixtures import CampaignFixture
from services.surveys.tests.fixtures import contact

URL = "/api/v1/campaigns/"
CONSOLE = "django.core.mail.backends.console.EmailBackend"
ZERO = {
    "unsubscribed": 0,
    "no_email": 0,
    "already_received": 0,
    "recent_campaign": 0,
    "over_limit": 0,
    "failed": 0,
}


class SendViewFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.campaign = cls.make_campaign(segment=cls.people, sharing="workspace")

    def call(self, verb, path, user=None, body=None):
        client = self.api(user or self.csm)
        return getattr(client, verb)(f"{URL}{self.campaign.pk}/{path}", body or {}, format="json")


class AudienceViewTests(SendViewFixture):
    def test_the_owner_gets_the_counts_and_a_sample(self):
        self.dot.campaigns_unsubscribed_at = self.now
        self.dot.save(update_fields=["campaigns_unsubscribed_at"])
        response = self.call("get", "audience/")
        self.assertEqual(
            response.data,
            {
                "reach": 1,
                "skipped": {**ZERO, "unsubscribed": 1},
                "sample": [{"id": self.ann.pk, "name": "Ann"}],
            },
        )
        self.assertFalse(CampaignSend.objects.exists())

    def test_only_the_owner(self):
        self.assertEqual(self.call("get", "audience/", self.other).data, {"detail": say.NOT_OWNER})
        self.assertEqual(self.call("get", "audience/", self.stranger).status_code, 404)

    def test_no_segment(self):
        self.campaign.segment = None
        self.campaign.save(update_fields=["segment"])
        response = self.call("get", "audience/")
        self.assertEqual(
            (response.status_code, response.data), (400, {"detail": say.CHOOSE_SEGMENT})
        )


class PreviewTests(SendViewFixture):
    def test_the_first_person_by_default_with_a_placeholder_link(self):
        response = self.call("post", "preview/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.data,
            {
                "subject": "Hello Ann",
                "body": "We miss you at Pizza Hut.\nCarl CSM\n\n—\nCarl CSM, Acme Inc\n"
                f"Unsubscribe from these emails: {settings.FRONTEND_URL}/u/preview",
            },
        )
        self.assertEqual((mail.outbox, CampaignSend.objects.exists()), ([], False))

    def test_a_chosen_person_and_unsaved_words(self):
        response = self.call(
            "post",
            "preview/",
            body={"contact": self.dot.pk, "subject": "Yo {first_name}", "body": "{organisation}"},
        )
        self.assertEqual(response.data["subject"], "Yo Dot")
        self.assertTrue(response.data["body"].startswith("Dough Co\n\n—\n"))
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.subject, "Hello {first_name}")  # nothing saved

    def test_refusals(self):
        cases = [
            ({"contact": self.tia.pk}, {"contact": [say.NOT_IN_AUDIENCE]}),
            ({"contact": 999999}, {"contact": [say.NOT_IN_AUDIENCE]}),
            ({"subject": "{oops}"}, {"subject": [say.MERGE_FIELDS_ONLY]}),
            ({"body": "x" * 5001}, {"body": [say.LONG_BODY]}),
        ]
        for body, refusal in cases:
            response = self.call("post", "preview/", body=body)
            self.assertEqual((response.status_code, response.data), (400, refusal), body)

    def test_nobody_and_no_segment(self):
        for person in (self.ann, self.dot):
            person.campaigns_unsubscribed_at = self.now
            person.save(update_fields=["campaigns_unsubscribed_at"])
        self.assertEqual(self.call("post", "preview/").data, {"detail": say.NOBODY})
        self.campaign.segment = None
        self.campaign.save(update_fields=["segment"])
        self.assertEqual(self.call("post", "preview/").data, {"detail": say.CHOOSE_SEGMENT})

    def test_only_the_owner(self):
        self.assertEqual(self.call("post", "preview/", self.other).status_code, 403)
        self.assertEqual(self.call("post", "preview/", self.stranger).status_code, 404)


class SendNowTests(SendViewFixture):
    def test_send_now_emails_the_segment_and_answers_the_send(self):
        response = self.call("post", "sends/")
        self.assertEqual(response.status_code, 201, response.content)
        send = CampaignSend.objects.get()
        self.assertEqual(
            (response.data["id"], response.data["kind"], response.data["status"]),
            (send.pk, "manual", "sent"),
        )
        self.assertEqual(response.data["sent_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(response.data["counts"], {"reached": 2, "sent": 2, "skipped": ZERO})
        self.assertEqual(self.mail_to(), ["ann@example.com", "dot@example.com"])
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, "active")

    def test_sending_again_reaches_only_who_is_new(self):
        self.call("post", "sends/")
        again = self.call("post", "sends/")
        self.assertEqual((again.status_code, again.data), (400, {"detail": say.NOBODY}))
        newcomer = contact(self.pizza, "Nia")
        self.people.pinned_ids = [self.ann.pk, self.dot.pk, newcomer.pk]
        self.people.save(update_fields=["pinned_ids"])
        mail.outbox.clear()
        third = self.call("post", "sends/")
        self.assertEqual(third.status_code, 201, third.content)
        self.assertEqual(self.mail_to(), ["nia@example.com"])
        self.assertEqual(third.data["counts"]["skipped"]["already_received"], 2)

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_email_not_set_up_keeps_the_campaign(self):
        response = self.call("post", "sends/")
        self.assertEqual(
            (response.status_code, response.data), (400, {"detail": say.EMAIL_NOT_SET_UP})
        )
        self.campaign.refresh_from_db()
        self.assertEqual((self.campaign.status, CampaignSend.objects.exists()), ("draft", False))

    def test_the_other_refusals_write_nothing(self):
        self.campaign.status = "archived"
        self.campaign.save(update_fields=["status"])
        self.assertEqual(self.call("post", "sends/").data, {"detail": say.ARCHIVED})
        self.assertFalse(CampaignSend.objects.exists())

    def test_only_the_owner(self):
        self.assertEqual(self.call("post", "sends/", self.other).data, {"detail": say.NOT_OWNER})
        self.assertEqual(self.call("post", "sends/", self.stranger).status_code, 404)
        self.assertEqual(mail.outbox, [])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_send_views --noinput`
Expected: FAIL (`404 != 200` for `audience/`, 405 for `POST sends/`).

- [ ] **Step 3: Add the views**

In `services/campaigns/views.py`, extend the imports:

```python
from types import SimpleNamespace

from django.utils import timezone

from .audience import build
from .models import MAX_OWNED, Campaign, CampaignSend
from .rendering import PREVIEW_TOKEN, compose, link
from .sending import Refusal, before_claim, claim, deliver
from .serializers import CampaignWriteSerializer, PreviewSerializer
from .validation import CAMPAIGN_SENT, CHOOSE_SEGMENT, LIMIT_REACHED, NOBODY, NOT_IN_AUDIENCE
```

Add, below `CampaignDetailView`:

```python
def _no_segment():
    return Response({"detail": CHOOSE_SEGMENT}, status=status.HTTP_400_BAD_REQUEST)


class CampaignAudienceView(APIView):
    """GET /api/v1/campaigns/<id>/audience/: who a send would email now and
    who it would skip, counted as the owner (the only caller). Nothing is
    written."""

    # SOC2:AUTH-02 authentication here; `get_owned` is the owner check, `build` reads as them
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        campaign = get_owned(request.user, pk)
        if campaign.segment_id is None:
            return _no_segment()
        reach = build(campaign, today=timezone.localdate(), now=timezone.now())
        return Response(reach.payload())


class CampaignPreviewView(APIView):
    """POST /api/v1/campaigns/<id>/preview/ with `{contact?, subject?,
    body?}`: the email as one person in the audience would read it, the
    stored words unless unsaved ones are sent, and a placeholder link.
    Nothing is written."""

    # SOC2:AUTH-02 authentication here; `get_owned` is the owner check, `build` reads as them
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        campaign = get_owned(request.user, pk)
        serializer = PreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if campaign.segment_id is None:
            return _no_segment()
        queued = build(campaign, today=timezone.localdate(), now=timezone.now()).queued
        wanted = data.get("contact")
        if wanted is not None:
            # SOC2:AUTH-02 only someone the owner's send would email, never any contact by id
            person = next((p for p in queued if p.pk == wanted), None)
            if person is None:
                return Response({"contact": [NOT_IN_AUDIENCE]}, status=status.HTTP_400_BAD_REQUEST)
        elif queued:
            person = queued[0]
        else:
            return Response({"detail": NOBODY}, status=status.HTTP_400_BAD_REQUEST)
        source = SimpleNamespace(
            subject=data.get("subject", campaign.subject), body=data.get("body", campaign.body)
        )
        subject, body = compose(
            source,
            person,
            sender_name=campaign.owner.name,
            workspace=campaign.organisation.name,
            url=link(PREVIEW_TOKEN),
        )
        return Response({"subject": subject, "body": body})
```

Add to `CampaignSendsView` (docstring: "GET … newest first. POST sends now, owner only, and answers the finished send (201).")

```python
    def post(self, request, pk):
        campaign = get_owned(request.user, pk)
        refusal = before_claim(campaign)
        if refusal:
            return Response(refusal, status=status.HTTP_400_BAD_REQUEST)
        try:
            send = claim(
                campaign.pk,
                kind=CampaignSend.Kind.MANUAL,
                by=request.user,
                today=timezone.localdate(),
                now=timezone.now(),
                request=request,
            )
        except Refusal as refused:
            return Response(refused.body, status=refused.status)
        deliver(send)
        send = CampaignSend.objects.select_related("sent_by", "rule").get(pk=send.pk)
        return Response(send_payload(send, request.user), status=status.HTTP_201_CREATED)
```

In `services/campaigns/urls.py`, add before the `sends/` routes:

```python
(path("<int:pk>/audience/", views.CampaignAudienceView.as_view(), name="campaign-audience"),)
(path("<int:pk>/preview/", views.CampaignPreviewView.as_view(), name="campaign-preview"),)
```

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns --parallel --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/campaigns/views.py services/campaigns/urls.py \
  services/campaigns/tests/test_send_views.py
git commit -m "feat(campaigns): audience count, live preview and Send now

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Unsubscribe by link, re-subscribe by hand

Spec §1.6, §1.10 (audit), §4 (`campaigns/unsubscribe/:token/`, `PATCH contacts/:id/`). Contract notes 1 and 7.

**Files:**
- Create: `services/campaigns/public_views.py`
- Modify:
  - `services/campaigns/urls.py` (the public route)
  - `core/throttling.py` (`CampaignUnsubscribeThrottle`)
  - `core/logging.py` (redact the unsubscribe token from logged paths)
  - `core/tests/test_observability.py` (its test)
  - `config/settings.py` (`AUTH_THROTTLE_RATES["campaign_unsubscribe"]`)
  - `services/customers/serializers.py` (`ContactSerializer`)
  - `services/customers/views.py` (`ContactDetailView.perform_update`)
- Test:
  - `services/campaigns/tests/test_unsubscribe.py`
  - `services/customers/tests/test_contact_campaigns.py`

**Interfaces:**
- Consumes: `CampaignDelivery.token_hash`, `sent_at`; `models.LINK_DAYS` (Task 1); `validation.EXPIRED`, `ONLY_THE_PERSON` (Task 3); `surveys.tokens.hash_token`, `surveys.public_views.MAX_TOKEN_LENGTH`.
- Produces: `UnsubscribeView` (GET/POST, URL name `campaign-unsubscribe`, path `unsubscribe/<str:token>/` under `api/v1/campaigns/`); `core.throttling.CampaignUnsubscribeThrottle` (scope `campaign_unsubscribe`, default `30/min` per IP, env `THROTTLE_CAMPAIGN_UNSUBSCRIBE`); `ContactSerializer` reads `campaigns_unsubscribed_at` and writes `campaigns_unsubscribed` (false only).

- [ ] **Step 1: Write the failing tests**

Create `services/campaigns/tests/test_unsubscribe.py`:

```python
"""The unsubscribe link (spec §1.6): no sign-in; the token is the
credential, looked up by its hash; every bad link reads the same 404; a
press, not a page load, unsubscribes; idempotent; audited without an actor
or the token; throttled per IP. Surveys are unaffected."""

from datetime import timedelta
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from rest_framework.test import APIClient

from core.models import AuditEvent
from core.throttling import CampaignUnsubscribeThrottle
from services.campaigns.tests.fixtures import CampaignFixture
from services.surveys.tokens import hash_token, new_token

URL = "/api/v1/campaigns/unsubscribe/{}/"
EXPIRED = {"detail": "This link has expired."}


class UnsubscribeFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.token, token_hash = new_token()
        send = cls.make_send(cls.make_campaign(segment=cls.people), [cls.ann])
        send.deliveries.update(token_hash=token_hash)
        cls.delivery = send.deliveries.get()

    def get(self, token, **extra):
        return APIClient().get(URL.format(token), **extra)

    def post(self, token, **extra):
        return APIClient().post(URL.format(token), {}, format="json", **extra)


class LinkTests(UnsubscribeFixture):
    def test_a_good_link_names_the_workspace_and_nothing_else(self):
        response = self.get(self.token)
        self.assertEqual((response.status_code, response.data), (200, {"workspace": "Acme Inc"}))
        self.ann.refresh_from_db()
        self.assertIsNone(self.ann.campaigns_unsubscribed_at)  # reading never unsubscribes

    def test_the_press_unsubscribes_once_and_is_audited_without_an_actor(self):
        self.assertEqual(self.post(self.token).status_code, 204)
        self.ann.refresh_from_db()
        when = self.ann.campaigns_unsubscribed_at
        self.assertIsNotNone(when)
        self.assertEqual(self.post(self.token).status_code, 204)
        self.ann.refresh_from_db()
        self.assertEqual(self.ann.campaigns_unsubscribed_at, when)
        event = AuditEvent.objects.get(action="contact.campaigns_unsubscribed")
        self.assertEqual(
            (event.actor, event.target_id, event.target_repr, event.organisation, event.metadata),
            (
                None,
                str(self.ann.pk),
                f"Contact {self.ann.pk}",
                self.org,
                {"via": "link", "send": self.delivery.send_id},
            ),
        )
        self.assertNotIn(self.token, str(event.metadata))
        self.assertEqual(self.get(self.token).data, {"workspace": "Acme Inc"})

    def test_every_bad_link_reads_the_same(self):
        stale = self.make_send(
            self.make_campaign(name="Old", segment=self.people),
            [self.dot],
            at=self.now - timedelta(days=366),
        )
        old_token, old_hash = new_token()
        stale.deliveries.update(token_hash=old_hash)
        queued_token, queued_hash = new_token()
        queued = self.make_send(self.make_campaign(name="Q", segment=self.people), status="sending")
        queued.deliveries.create(contact=self.dot, token_hash=queued_hash)
        for token in ("nope", "x" * 101, old_token, queued_token, hash_token(self.token)):
            self.assertEqual(
                (self.get(token).status_code, self.get(token).data), (404, EXPIRED), token[:10]
            )
            self.assertEqual(self.post(token).status_code, 404)
        self.dot.refresh_from_db()
        self.assertIsNone(self.dot.campaigns_unsubscribed_at)

    def test_a_signed_in_caller_is_treated_the_same(self):
        client = self.api(self.stranger)
        self.assertEqual(client.get(URL.format(self.token)).data, {"workspace": "Acme Inc"})


class ThrottleTests(UnsubscribeFixture):
    def setUp(self):
        cache.clear()

    @mock.patch.object(CampaignUnsubscribeThrottle, "rate", "2/min")
    def test_reads_and_presses_share_one_limit_per_ip(self):
        ip = {"REMOTE_ADDR": "203.0.113.9"}
        self.assertEqual(self.get("nope", **ip).status_code, 404)
        self.assertEqual(self.post("nope", **ip).status_code, 404)
        blocked = self.get(self.token, **ip)
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked)
        self.assertEqual(self.get(self.token, REMOTE_ADDR="198.51.100.1").status_code, 200)

    def test_the_rate_is_30_a_minute(self):
        self.assertEqual(settings.AUTH_THROTTLE_RATES["campaign_unsubscribe"], "30/min")
```

Create `services/customers/tests/test_contact_campaigns.py`:

```python
"""A contact's campaign opt-out on the existing contact routes (campaigns
spec §1.6, contract note 1): every contact payload carries
`campaigns_unsubscribed_at`; `PATCH contacts/:id/ {campaigns_unsubscribed:
false}` re-subscribes, audited; only the person may unsubscribe."""

from core.models import AuditEvent
from services.campaigns import validation as say
from services.campaigns.tests.fixtures import CampaignFixture


class ContactOptOutTests(CampaignFixture):
    def setUp(self):
        self.ann.campaigns_unsubscribed_at = self.now
        self.ann.save(update_fields=["campaigns_unsubscribed_at"])

    def patch(self, user, **body):
        return self.api(user).patch(f"/api/v1/contacts/{self.ann.pk}/", body, format="json")

    def test_every_contact_payload_carries_it(self):
        detail = self.api(self.csm).get(f"/api/v1/contacts/{self.ann.pk}/").data
        # DRF writes UTC as "Z" (TIME_ZONE is UTC)
        self.assertEqual(
            detail["campaigns_unsubscribed_at"], self.now.isoformat().replace("+00:00", "Z")
        )
        rows = self.api(self.csm).get(f"/api/v1/customers/{self.pizza.pk}/contacts/").data
        self.assertIn("campaigns_unsubscribed_at", rows[0])
        self.assertNotIn("campaigns_unsubscribed", rows[0])

    def test_anyone_who_may_open_it_re_subscribes_and_it_is_audited(self):
        response = self.patch(self.admin, campaigns_unsubscribed=False)
        self.assertEqual(
            (response.status_code, response.data["campaigns_unsubscribed_at"]), (200, None)
        )
        self.ann.refresh_from_db()
        self.assertIsNone(self.ann.campaigns_unsubscribed_at)
        self.assertEqual(self.events("contact.campaigns_resubscribed"), [(str(self.ann.pk), {})])
        self.assertEqual(
            AuditEvent.objects.get(action="contact.campaigns_resubscribed").target_repr,
            f"Contact {self.ann.pk}",
        )

    def test_re_subscribing_a_subscribed_contact_is_not_audited(self):
        self.patch(self.csm, campaigns_unsubscribed=False)
        self.patch(self.csm, campaigns_unsubscribed=False)
        self.assertEqual(len(self.events("contact.campaigns_resubscribed")), 1)

    def test_only_the_person_unsubscribes(self):
        response = self.patch(self.csm, campaigns_unsubscribed=True)
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"campaigns_unsubscribed": [say.ONLY_THE_PERSON]}),
        )

    def test_someone_who_may_not_open_it_gets_404(self):
        self.assertEqual(self.patch(self.other, campaigns_unsubscribed=False).status_code, 404)
        self.ann.refresh_from_db()
        self.assertIsNotNone(self.ann.campaigns_unsubscribed_at)

    def test_other_edits_leave_it_alone(self):
        self.patch(self.csm, phone="123")
        self.ann.refresh_from_db()
        self.assertIsNotNone(self.ann.campaigns_unsubscribed_at)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_unsubscribe services.customers.tests.test_contact_campaigns --noinput`
Expected: ERROR, `ImportError: cannot import name 'CampaignUnsubscribeThrottle' from 'core.throttling'`.

- [ ] **Step 3: The throttle and its rate**

In `core/throttling.py`, add after `SurveyLinkThrottle`:

```python
class CampaignUnsubscribeThrottle(_PerIPThrottle):
    """The public unsubscribe link (services/campaigns/public_views.py):
    reads and presses together, per source IP. The token is a 32-byte
    secret, so this is about load and noise rather than guessing."""

    scope = "campaign_unsubscribe"
```

In `config/settings.py`, add to `AUTH_THROTTLE_RATES` after `survey_link`:

```python
    # per source IP: the public campaign unsubscribe link, reads and presses together
    "campaign_unsubscribe": env("THROTTLE_CAMPAIGN_UNSUBSCRIBE", default="30/min"),
```

Then redact the token from logged request paths, as Surveys' is. In `core/logging.py`, below `_SURVEY_LINK`:

```python
# The same for a campaign email's unsubscribe link
# (services/campaigns/public_views.py): its token is the opt-out credential.
_UNSUBSCRIBE_LINK = re.compile(r"(?i)(/campaigns/unsubscribe/)[^/\s]+")
```

and in `redact`, after the `_SURVEY_LINK` line:

```python
    text = _UNSUBSCRIBE_LINK.sub(lambda m: f"{m.group(1)}{REDACTED}", text)
```

In `core/tests/test_observability.py`, add below `test_the_survey_links_token_is_scrubbed_from_a_logged_path`:

```python
    def test_the_unsubscribe_links_token_is_scrubbed_from_a_logged_path(self):
        cases = {
            "Not Found: /api/v1/campaigns/unsubscribe/XVz1Bta3olQ0FX6U4_eP6WvEnTd/": (
                "Not Found: /api/v1/campaigns/unsubscribe/[REDACTED]/"
            ),
            "POST /api/v1/campaigns/unsubscribe/abc-123/ HTTP/1.1": (
                "POST /api/v1/campaigns/unsubscribe/[REDACTED]/ HTTP/1.1"
            ),
            "GET /api/v1/campaigns/12/sends/ HTTP/1.1": "GET /api/v1/campaigns/12/sends/ HTTP/1.1",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(redact(raw), expected)
```

- [ ] **Step 4: Write `services/campaigns/public_views.py`**

```python
"""The unsubscribe link a campaign email carries (spec §1.6): no sign-in.
The link's secret is the credential: it is looked up by its SHA-256 only,
and every bad link (unknown, malformed, older than 365 days, never sent)
reads the same 404. GET only names the workspace, so a link scanner that
follows it unsubscribes nobody; POST unsubscribes, once."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from core.throttling import CampaignUnsubscribeThrottle
from services.customers.models import Contact
from services.surveys.public_views import MAX_TOKEN_LENGTH
from services.surveys.tokens import hash_token

from .models import LINK_DAYS, CampaignDelivery
from .validation import EXPIRED


def _live(token, now):
    """The sent delivery whose token this is, within 365 days, or None."""
    if len(token) > MAX_TOKEN_LENGTH:
        return None
    return (
        CampaignDelivery.objects.filter(
            token_hash=hash_token(token),
            status=CampaignDelivery.Status.SENT,
            sent_at__gt=now - timedelta(days=LINK_DAYS),
        )
        .select_related("send__campaign__organisation")
        .first()
    )


class UnsubscribeView(APIView):
    """GET/POST /api/v1/campaigns/unsubscribe/<token>/. GET returns
    `{workspace}`; POST answers 204, idempotent."""

    # SOC2:AUTH-02 public by design: the link's secret is the credential, looked up by
    # hash only, 365 days, one 404 body for every bad link
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [CampaignUnsubscribeThrottle]  # SOC2:AUTH-06

    def get(self, request, token):
        delivery = _live(token, timezone.now())
        if delivery is None:
            return Response(EXPIRED, status=status.HTTP_404_NOT_FOUND)
        return Response({"workspace": delivery.send.campaign.organisation.name})

    def post(self, request, token):
        now = timezone.now()
        delivery = _live(token, now)
        if delivery is None:
            return Response(EXPIRED, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            # Re-read under the row lock, so two presses at once record one opt-out.
            contact = (
                Contact.objects.select_for_update(no_key=True)
                .only("pk", "campaigns_unsubscribed_at")
                .get(pk=delivery.contact_id)
            )
            if contact.campaigns_unsubscribed_at is None:
                contact.campaigns_unsubscribed_at = now
                contact.save(update_fields=["campaigns_unsubscribed_at"])
                audit.record(  # SOC2:LOG-01
                    "contact.campaigns_unsubscribed",
                    request=request,
                    actor=None,
                    organisation=delivery.send.campaign.organisation,
                    target=contact,
                    target_repr=f"Contact {contact.pk}",
                    metadata={"via": "link", "send": delivery.send_id},
                )
        return Response(status=status.HTTP_204_NO_CONTENT)
```

In `services/campaigns/urls.py`, add as the first route, with `from . import public_views, views`:

```python
(
    path(
        "unsubscribe/<str:token>/",
        public_views.UnsubscribeView.as_view(),
        name="campaign-unsubscribe",
    ),
)
```

- [ ] **Step 5: Re-subscribe on the contact routes**

In `services/customers/serializers.py`, add `from services.campaigns.validation import ONLY_THE_PERSON` to the imports, and in `ContactSerializer`:

- add the field below `calls`:

```python
    campaigns_unsubscribed = serializers.BooleanField(write_only=True, required=False)
```

- add `"campaigns_unsubscribed_at"` and `"campaigns_unsubscribed"` to the end of `Meta.fields`, and `"campaigns_unsubscribed_at"` to `Meta.read_only_fields`;
- add above `update`:

```python
def validate_campaigns_unsubscribed(self, value):
    # Only the person, from the link in a campaign email, may opt out.
    if value:
        raise serializers.ValidationError(ONLY_THE_PERSON)
    return value


def create(self, validated_data):
    validated_data.pop("campaigns_unsubscribed", None)
    return super().create(validated_data)
```

- and make the first lines of `update`:

```python
    def update(self, instance, validated_data):
        if validated_data.pop("campaigns_unsubscribed", None) is False:
            validated_data["campaigns_unsubscribed_at"] = None
```

(the existing sentiment lines follow unchanged).

In `services/customers/views.py`, add `from core import audit` to the imports if it is not there, and to `ContactDetailView`:

```python
    def perform_update(self, serializer):
        was = serializer.instance.campaigns_unsubscribed_at
        with transaction.atomic():
            contact = serializer.save()
            if was is not None and contact.campaigns_unsubscribed_at is None:
                audit.record(  # SOC2:LOG-01
                    "contact.campaigns_resubscribed",
                    request=self.request,
                    target=contact,
                    target_repr=f"Contact {contact.pk}",
                    metadata={},
                )
```

Add to its docstring: "PATCH `{campaigns_unsubscribed: false}` re-subscribes the contact to campaigns, audited; `true` is refused (only the person opts out, by the link)."

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns services.customers core --parallel --noinput`
Expected: PASS (every existing contact test too: the payload only gained a key).

Run: `venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add services/campaigns/public_views.py services/campaigns/urls.py core/throttling.py \
  core/logging.py core/tests/test_observability.py config/settings.py services/customers/serializers.py services/customers/views.py \
  services/campaigns/tests/test_unsubscribe.py services/customers/tests/test_contact_campaigns.py
git commit -m "feat(campaigns): one-click unsubscribe link; re-subscribe on the contact

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Existing campaigns move over; the legacy columns go; the admin and the seed

Spec §1.2; §1.4 ("the admin finish a `sending` send"). Decisions 1, 2, 12, 13, 14. Safe on production's rows: sent campaigns with logs, one stuck at `sending`, drafts with hand-picked recipients, names and subjects over the new limits.

**Files:**
- Create:
  - `services/campaigns/migrations/0004_migrate_campaigns.py` (hand-written)
  - `services/campaigns/migrations/0005_drop_legacy.py` (generated)
- Modify:
  - `services/campaigns/models.py` (owner required; `name` 120, `subject` 150; two statuses and two columns removed)
  - `services/campaigns/admin.py` (rewrite)
  - `services/campaigns/management/commands/seed_demo_campaigns.py` (rewrite)
  - `services/customers/models.py` (`Email`'s docstring names the new sender)
- Test:
  - `services/campaigns/tests/test_migration.py`
  - `services/campaigns/tests/test_admin_seed.py`

**Interfaces:**
- Consumes: Task 1's models; `sending.resume` (Task 6); `CampaignFixture` (Task 1).
- Produces:
  - in `0004_migrate_campaigns` (importable, as `customers/migrations/0028`): `REASONS`, `NAME = 120`, `SUBJECT = 150`, `trim(text, limit) -> str`, `entries(send_log, known_ids) -> list[(contact_id, "sent" | "skipped")]`, `counts(rows) -> dict`, `owner_for(models, organisation_id) -> int | None`, `move_campaign(models, row) -> "draft" | "sent" | "deleted"`, `forwards`, `backwards`. `models` is any object with attributes `Campaign`, `CampaignSend`, `CampaignDelivery`, `Contact`, `Email`, `User`, `Membership`; `row` has `pk, organisation_id, status, name, subject, body, send_log, sent_at, updated_at`.
  - `Campaign.Status` is `DRAFT`, `ACTIVE`, `ARCHIVED` only; `Campaign.owner` is required; `Campaign.send_log` and `Campaign.sent_at` no longer exist.
  - `CampaignSendAdmin.finish_selected` (admin action "Finish the selected sends").

- [ ] **Step 1: Write the failing tests**

Create `services/campaigns/tests/test_migration.py`:

```python
"""The data migration (spec §1.2), tested as customers' 0028 is: its logic
is importable and takes the model classes, so it runs here against today's
tables with literal pre-segments values. It must be safe on production's
real rows."""

from datetime import timedelta
from importlib import import_module
from types import SimpleNamespace

from services.accounts.models import Organisation, User
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend
from services.campaigns.tests.fixtures import CampaignFixture
from services.customers.models import Contact, Email
from services.identity.models import OrganizationMembership

# A migration module's name isn't an identifier, so it can't be imported with `from … import`.
migration = import_module("services.campaigns.migrations.0004_migrate_campaigns")

#: Today's tables stand in for the historical ones: every column the migration writes exists in both.
MODELS = SimpleNamespace(
    Campaign=Campaign,
    CampaignSend=CampaignSend,
    CampaignDelivery=CampaignDelivery,
    Contact=Contact,
    Email=Email,
    User=User,
    Membership=OrganizationMembership,
)


def models():
    return MODELS


class PureTests(CampaignFixture):
    def test_entries_one_per_known_contact_in_log_order_detail_dropped(self):
        log = [
            {
                "contact_id": 2,
                "contact_name": "B",
                "status": "skipped",
                "detail": "ValueError: b@x",
            },
            {"contact_id": 1, "status": "sent", "detail": "Emailed a@x"},
            {"contact_id": 2, "status": "sent"},
            {"contact_id": 9, "status": "sent"},
            "garbage",
            {"status": "sent"},
        ]
        self.assertEqual(migration.entries(log, {1, 2}), [(2, "skipped"), (1, "sent")])
        self.assertEqual(migration.entries(None, {1}), [])

    def test_counts(self):
        self.assertEqual(
            migration.counts([(1, "sent"), (2, "skipped"), (3, "sent")]),
            {
                "reached": 3,
                "sent": 2,
                "skipped": {
                    "unsubscribed": 0,
                    "no_email": 0,
                    "already_received": 0,
                    "recent_campaign": 0,
                    "over_limit": 0,
                    "failed": 1,
                },
            },
        )

    def test_trim(self):
        self.assertEqual((migration.trim("x" * 200, 120), migration.trim(None, 5)), ("x" * 120, ""))


class OwnerTests(CampaignFixture):
    def test_the_workspace_owner_first(self):
        OrganizationMembership.objects.filter(user=self.other).update(is_owner=True)
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.other.pk)

    def test_then_the_first_active_admin_then_any_active_then_anyone(self):
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.admin.pk)
        self.admin.is_active = False
        self.admin.save(update_fields=["is_active"])
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.csm.pk)
        User.objects.filter(organisation=self.org).update(is_active=False)
        self.assertEqual(migration.owner_for(models(), self.org.pk), self.admin.pk)

    def test_nobody_at_all(self):
        empty = Organisation.objects.create(name="Empty", currency="USD")
        self.assertIsNone(migration.owner_for(models(), empty.pk))


class MoveTests(CampaignFixture):
    def row(self, campaign, **values):
        base = {
            "pk": campaign.pk,
            "organisation_id": campaign.organisation_id,
            "status": "draft",
            "name": campaign.name,
            "subject": campaign.subject,
            "body": campaign.body,
            "send_log": [],
            "sent_at": None,
            "updated_at": campaign.updated_at,
        }
        return SimpleNamespace(**{**base, **values})

    def test_a_sent_campaign_becomes_active_with_one_migrated_send(self):
        campaign = self.make_campaign(owner=self.other, subject="Hi")
        sent_at = self.now - timedelta(days=40)
        filed = Email.objects.create(
            customer=self.pizza,
            campaign=campaign,
            subject="Hi",
            body="Body",
            sender_name="Acme Inc",
            recipient_name="Ann",
            sent_at=sent_at,
        )
        log = [
            {
                "contact_id": self.ann.pk,
                "contact_name": "Ann",
                "status": "sent",
                "detail": "Emailed ann@example.com",
            },
            {
                "contact_id": self.ben.pk,
                "contact_name": "Ben",
                "status": "skipped",
                "detail": "SMTP 550 ben@example.com",
            },
            {"contact_id": 999999, "status": "sent"},
        ]
        long_subject = "S" * 200
        result = migration.move_campaign(
            models(),
            self.row(
                campaign,
                status="sent",
                send_log=log,
                sent_at=sent_at,
                name="N" * 130,
                subject=long_subject,
            ),
        )
        self.assertEqual(result, "sent")
        campaign.refresh_from_db()
        self.assertEqual(
            (
                campaign.status,
                campaign.owner,
                campaign.sharing,
                campaign.segment,
                campaign.name,
                campaign.subject,
            ),
            ("active", self.admin, "private", None, "N" * 120, "S" * 150),
        )
        send = campaign.sends.get()
        self.assertEqual(
            (
                send.kind,
                send.status,
                send.migrated,
                send.sent_by,
                send.started_at,
                send.finished_at,
                send.subject,
            ),
            ("manual", "sent", True, None, sent_at, sent_at, long_subject),
        )
        self.assertEqual(send.counts["reached"], 2)
        self.assertEqual((send.counts["sent"], send.counts["skipped"]["failed"]), (1, 1))
        rows = list(
            send.deliveries.order_by("pk").values_list(
                "contact", "status", "reason", "email", "sent_at"
            )
        )
        self.assertEqual(
            rows,
            [
                (self.ann.pk, "sent", "", filed.pk, sent_at),
                (self.ben.pk, "skipped", "failed", None, None),
            ],
        )
        self.assertNotIn("ben@example.com", str(list(CampaignSend.objects.values())))

    def test_a_campaign_stuck_sending_becomes_active_with_a_sent_send(self):
        campaign = self.make_campaign()
        result = migration.move_campaign(
            models(), self.row(campaign, status="sending", send_log=[])
        )
        self.assertEqual(result, "sent")
        campaign.refresh_from_db()
        send = campaign.sends.get()
        self.assertEqual(
            (campaign.status, send.status, send.deliveries.count()), ("active", "sent", 0)
        )
        self.assertEqual(
            (send.started_at, send.finished_at), (campaign.updated_at, campaign.updated_at)
        )

    def test_a_draft_keeps_its_recipients_and_waits_for_a_segment(self):
        campaign = self.make_campaign(owner=self.other)
        campaign.recipients.set([self.ann, self.tia])
        before = campaign.updated_at
        self.assertEqual(migration.move_campaign(models(), self.row(campaign)), "draft")
        campaign.refresh_from_db()
        self.assertEqual(
            (campaign.status, campaign.segment, campaign.owner, campaign.updated_at),
            ("draft", None, self.admin, before),
        )
        self.assertEqual(
            set(campaign.recipients.values_list("pk", flat=True)), {self.ann.pk, self.tia.pk}
        )
        self.assertFalse(campaign.sends.exists())

    def test_a_workspace_with_nobody_loses_its_campaigns(self):
        empty = Organisation.objects.create(name="Empty", currency="USD")
        campaign = Campaign.objects.create(organisation=empty, owner=self.csm, name="Orphan")
        self.assertEqual(migration.move_campaign(models(), self.row(campaign)), "deleted")
        self.assertFalse(Campaign.objects.filter(pk=campaign.pk).exists())
```

Create `services/campaigns/tests/test_admin_seed.py`:

```python
"""The admin's "Finish the selected sends" and the demo seed in the new shape."""

from datetime import timedelta
from unittest import mock

from django.contrib import admin
from django.core import mail
from django.core.management import call_command
from django.test import RequestFactory

from services.campaigns.admin import CampaignSendAdmin
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend
from services.campaigns.tests.fixtures import CampaignFixture
from services.customers.models import Customer
from services.surveys.tests.fixtures import contact


class AdminTests(CampaignFixture):
    def test_finishing_a_cut_off_send(self):
        campaign = self.make_campaign(segment=self.people)
        send = self.make_send(campaign, status="sending", at=self.now - timedelta(hours=1))
        CampaignDelivery.objects.create(send=send, contact=self.ann)
        CampaignDelivery.objects.create(send=send, contact=self.dot, token_hash="t" * 64)
        model_admin = CampaignSendAdmin(CampaignSend, admin.site)
        request = RequestFactory().post("/")
        with mock.patch.object(model_admin, "message_user") as told:
            model_admin.finish_selected(request, CampaignSend.objects.filter(pk=send.pk))
        send.refresh_from_db()
        self.assertEqual(send.status, "sent")
        self.assertEqual(
            self.mail_to(), ["ann@example.com"]
        )  # Dot was mid-send: failed, not re-sent
        self.assertEqual(
            list(send.deliveries.order_by("pk").values_list("status", "reason")),
            [("sent", ""), ("skipped", "failed")],
        )
        told.assert_called_once_with(request, "1 send(s) finished.")


class SeedTests(CampaignFixture):
    def test_the_seed_builds_a_draft_and_a_sent_campaign_without_emailing(self):
        apple = Customer.objects.create(organisation=self.org, name="Apple Inc", owner=self.admin)
        for name in ("Tim", "Jony"):
            contact(apple, name)
        call_command("seed_demo_campaigns", "--org-email", self.admin.email, stdout=mock.Mock())
        call_command("seed_demo_campaigns", "--org-email", self.admin.email, stdout=mock.Mock())
        draft = Campaign.objects.get(name="Q4 Renewal Outreach")
        active = Campaign.objects.get(name="Product Update — September")
        self.assertEqual(
            (draft.status, draft.owner, draft.segment.kind), ("draft", self.admin, "contact")
        )
        self.assertEqual((active.status, active.sends.count()), ("active", 1))
        self.assertEqual(active.sends.get().deliveries.filter(status="sent").count(), 2)
        self.assertEqual(mail.outbox, [])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.campaigns.tests.test_migration services.campaigns.tests.test_admin_seed --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.campaigns.migrations.0004_migrate_campaigns'`.

- [ ] **Step 3: Write `services/campaigns/migrations/0004_migrate_campaigns.py`**

```python
"""Move every campaign from before segments onto the new shape (campaigns
spec §1.2), workspace by workspace:

- the owner is the workspace's owner (`OrganizationMembership.is_owner`),
  else its first active admin, else its first active member, else its first
  member; a workspace with no user at all loses its campaigns (nobody could
  read them);
- sharing is `private`; the name is cut to 120 and the subject to 150, before
  0005 shrinks those columns;
- a campaign that was sent, or is stuck at `sending`, becomes `active` with
  one `CampaignSend` (`manual`, `migrated`, nobody's, `sent`, at its
  `sent_at`), and each `send_log` entry becomes a delivery, `sent` (linked to
  the Email row it filed, matched by contact) or `skipped`/`failed`. The old
  free-text `detail` is dropped: it could hold an address or an exception's
  text. Entries for contacts deleted since are dropped too;
- a draft stays a draft with no segment; its hand-picked recipients stay as
  read-only history.

Rows are written with `.update()`, so `updated_at` (the list's order) does
not move. The logic is importable so it can be tested; it is frozen here,
not imported from the app, so this migration always does the same thing.
Reverse: statuses go back to `sent`/`draft`; sends, deliveries and owners
stay (a no-op for sends)."""

from collections import Counter
from types import SimpleNamespace

from django.db import migrations

NAME, SUBJECT = 120, 150
LEGACY = ("sending", "sent")
REASONS = (
    "unsubscribed",
    "no_email",
    "already_received",
    "recent_campaign",
    "over_limit",
    "failed",
)


def trim(text, limit):
    return (text or "")[:limit]


def entries(send_log, known):
    """[(contact_id, "sent" | "skipped")], one per contact still in `known`,
    in log order. Everything else in an entry is dropped."""
    seen, rows = set(), []
    for entry in send_log or []:
        if not isinstance(entry, dict):
            continue
        contact_id = entry.get("contact_id")
        if contact_id not in known or contact_id in seen:
            continue
        seen.add(contact_id)
        rows.append((contact_id, "sent" if entry.get("status") == "sent" else "skipped"))
    return rows


def counts(rows):
    sent = sum(1 for _contact, status in rows if status == "sent")
    skipped = dict.fromkeys(REASONS, 0)
    skipped["failed"] = len(rows) - sent
    return {"reached": len(rows), "sent": sent, "skipped": skipped}


def owner_for(models, organisation_id):
    owner = (
        models.Membership.objects.filter(organisation_id=organisation_id, is_owner=True)
        .values_list("user_id", flat=True)
        .first()
    )
    if owner is not None:
        return owner
    users = models.User.objects.filter(organisation_id=organisation_id).order_by(
        "date_joined", "pk"
    )
    for chosen in (
        users.filter(is_active=True, role__slug="admin"),
        users.filter(is_active=True),
        users,
    ):
        pk = chosen.values_list("pk", flat=True).first()
        if pk is not None:
            return pk
    return None


def _emails(models, campaign_id):
    """{(recipient name, customer id, account id): the first Email row the old send filed}."""
    found = {}
    rows = (
        models.Email.objects.filter(campaign_id=campaign_id)
        .order_by("pk")
        .values_list("pk", "recipient_name", "customer_id", "account_id")
    )
    for pk, name, customer_id, account_id in rows:
        found.setdefault((name, customer_id, account_id), pk)
    return found


def move_campaign(models, row):
    owner_id = owner_for(models, row.organisation_id)
    campaigns = models.Campaign.objects.filter(pk=row.pk)
    if owner_id is None:
        campaigns.delete()
        return "deleted"
    changes = {
        "owner_id": owner_id,
        "sharing": "private",
        "name": trim(row.name, NAME) or "Untitled Campaign",
        "subject": trim(row.subject, SUBJECT),
    }
    if row.status not in LEGACY:
        campaigns.update(**changes)
        return "draft"
    at = row.sent_at or row.updated_at
    log = row.send_log or []
    ids = [entry.get("contact_id") for entry in log if isinstance(entry, dict)]
    contacts = {
        c["pk"]: c
        for c in models.Contact.objects.filter(
            pk__in=[i for i in ids if isinstance(i, int)]
        ).values("pk", "name", "customer_id", "account_id")
    }
    rows = entries(log, set(contacts))
    send = models.CampaignSend.objects.create(
        campaign_id=row.pk,
        kind="manual",
        status="sent",
        started_at=at,
        finished_at=at,
        subject=row.subject or "",
        body=row.body or "",
        counts=counts(rows),
        migrated=True,
    )
    emails = _emails(models, row.pk)
    deliveries = []
    for contact_id, status in rows:
        contact = contacts[contact_id]
        key = (contact["name"][:150], contact["customer_id"], contact["account_id"])
        sent = status == "sent"
        deliveries.append(
            models.CampaignDelivery(
                send_id=send.pk,
                contact_id=contact_id,
                status=status,
                reason="" if sent else "failed",
                email_id=emails.get(key) if sent else None,
                sent_at=at if sent else None,
            )
        )
    models.CampaignDelivery.objects.bulk_create(deliveries, batch_size=1000)
    campaigns.update(**changes, status="active")
    return "sent"


def _models(apps):
    return SimpleNamespace(
        Campaign=apps.get_model("campaigns", "Campaign"),
        CampaignSend=apps.get_model("campaigns", "CampaignSend"),
        CampaignDelivery=apps.get_model("campaigns", "CampaignDelivery"),
        Contact=apps.get_model("customers", "Contact"),
        Email=apps.get_model("customers", "Email"),
        User=apps.get_model("accounts", "User"),
        Membership=apps.get_model("identity", "OrganizationMembership"),
    )


def forwards(apps, schema_editor):
    models = _models(apps)
    fields = (
        "pk",
        "organisation_id",
        "status",
        "name",
        "subject",
        "body",
        "send_log",
        "sent_at",
        "updated_at",
    )
    done = Counter()
    for values in models.Campaign.objects.order_by("organisation_id", "pk").values(*fields):
        done[move_campaign(models, SimpleNamespace(**values))] += 1
    if done["deleted"]:
        print(f"\n  campaigns: deleted {done['deleted']} in workspaces with nobody to own them")


def backwards(apps, schema_editor):
    Campaign = apps.get_model("campaigns", "Campaign")
    sent = apps.get_model("campaigns", "CampaignSend").objects.values("campaign_id")
    Campaign.objects.filter(pk__in=sent).update(status="sent")
    Campaign.objects.exclude(pk__in=sent).update(status="draft")


class Migration(migrations.Migration):
    dependencies = [
        ("campaigns", "0003_owner_sends"),
        ("accounts", "0013_totp_device"),
        ("customers", "0052_contact_campaigns_unsubscribed_at"),
        ("identity", "0006_membership_owner"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
```

`values("pk", …)` returns the key `pk`, which `SimpleNamespace(**values)` keeps as `row.pk`.

- [ ] **Step 4: Shrink the model, then generate 0005**

In `services/campaigns/models.py`:
- `Campaign.Status`: delete the `SENDING` and `SENT` lines and their comment;
- `owner`: remove `null=True, blank=True` and the `help_text`;
- `name = models.CharField(max_length=MAX_NAME, default="Untitled Campaign")`;
- `subject = models.CharField(max_length=MAX_SUBJECT, blank=True)`;
- delete `send_log` and `sent_at`;
- in the module docstring replace the last paragraph with: "`recipients` is the hand-picked list from before segments, kept as read-only history for migrated drafts (migration 0004)."

Run: `venv/bin/python manage.py makemigrations campaigns --name drop_legacy`
When asked how to handle the now non-nullable `owner`, choose **2) Ignore for now** (0004 has given every row an owner, or deleted it). Expected: `0005_drop_legacy.py` with `RemoveField` ×2 (`send_log`, `sent_at`) and `AlterField` for `owner`, `name`, `subject`, `status`. Check its dependencies are `[("campaigns", "0004_migrate_campaigns"), …]`.

Then apply both forwards and back and forwards again on your local database, to prove they reverse:

```bash
venv/bin/python manage.py migrate campaigns 0003_owner_sends
venv/bin/python manage.py migrate campaigns
```
Expected: both run without error.

In `services/customers/models.py`, in `Email`'s docstring, replace the paragraph starting "`campaign` is nullable — set only for a row CampaignSendView itself created" with: "`campaign` is nullable: set only on a row a campaign send filed (services.campaigns.sending), whose body is the rendered email without its footer. Every other Email row has it as None."

- [ ] **Step 5: Rewrite the admin**

Replace `services/campaigns/admin.py`:

```python
from django.contrib import admin
from django.utils import timezone

from .models import Campaign, CampaignSend
from .sending import resume


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ["id", "organisation", "owner", "status", "sharing", "updated_at"]
    list_filter = ["status", "sharing"]
    raw_id_fields = ["owner", "segment", "shared_with", "recipients"]


@admin.register(CampaignSend)
class CampaignSendAdmin(admin.ModelAdmin):
    """A send stuck at `sending` (the process died mid-delivery) is finished
    here: anyone it was emailing when it stopped is skipped `failed`, once it
    is 10 minutes old, and the rest are emailed."""

    list_display = ["id", "campaign", "kind", "status", "started_at", "finished_at", "migrated"]
    list_filter = ["status", "kind", "migrated"]
    raw_id_fields = ["campaign", "rule", "review", "sent_by"]
    readonly_fields = ["counts", "subject", "body"]
    actions = ["finish_selected"]

    @admin.action(description="Finish the selected sends")
    def finish_selected(self, request, queryset):
        now, finished = timezone.now(), 0
        for send in queryset.filter(status=CampaignSend.Status.SENDING).order_by("pk"):
            finished += resume(send, now=now).status == CampaignSend.Status.SENT
        self.message_user(request, f"{finished} send(s) finished.")
```

- [ ] **Step 6: Rewrite the seed**

Replace the body of `seed_demo_campaigns.py`'s `handle` after the `contacts` check (keep the module docstring's usage line, and replace its middle paragraph with: "One draft on a contact segment of Apple Inc's contacts, and one active campaign with one manual send built from rows — "seed the state, not the side effect": nothing is emailed."):

```python
        segment, _ = Segment.objects.update_or_create(
            organisation=org,
            owner=caller,
            name="Apple Inc contacts",
            defaults={"kind": "contact", "pinned_ids": [c.pk for c in contacts]},
        )
        common = {"owner": caller, "segment": segment, "roles": []}
        draft, was_created = Campaign.objects.update_or_create(
            organisation=org,
            name="Q4 Renewal Outreach",
            defaults={
                **common,
                "subject": "Your Q4 renewal, {first_name}",
                "body": (
                    "Hi {first_name},\n\nAs we head into Q4, I wanted to check in ahead of "
                    "{organisation}'s renewal and see how things are going.\n\n{sender_name}"
                ),
                "status": Campaign.Status.DRAFT,
            },
        )
        created += was_created
        updated += not was_created

        sent, was_created = Campaign.objects.update_or_create(
            organisation=org,
            name="Product Update — September",
            defaults={
                **common,
                "subject": "What's new this month",
                "body": "Hi {first_name},\n\nA quick rundown of what shipped this month.\n\n{sender_name}",
                "status": Campaign.Status.ACTIVE,
            },
        )
        created += was_created
        updated += not was_created
        if not sent.sends.exists():
            at = timezone.now() - timezone.timedelta(days=5)
            send = CampaignSend.objects.create(
                campaign=sent,
                kind=CampaignSend.Kind.MANUAL,
                status=CampaignSend.Status.SENT,
                sent_by=caller,
                started_at=at,
                finished_at=at,
                subject=sent.subject,
                body=sent.body,
                counts={**empty_counts(), "reached": len(contacts), "sent": len(contacts)},
            )
            CampaignDelivery.objects.bulk_create(
                [
                    CampaignDelivery(send=send, contact=c, status=CampaignDelivery.Status.SENT, sent_at=at)
                    for c in contacts
                ]
            )
```

with these imports (replacing the old `Campaign` import):

```python
from services.campaigns.models import Campaign, CampaignDelivery, CampaignSend, empty_counts
from services.segments.models import Segment
```

The final `self.stdout.write(...)` stays.

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.campaigns services.customers --parallel --noinput`
Expected: PASS.

Run: `venv/bin/python manage.py makemigrations --check --dry-run && venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: `No changes detected`; ruff clean.

- [ ] **Step 8: Commit**

```bash
git add services/campaigns/migrations/0004_migrate_campaigns.py \
  services/campaigns/migrations/0005_drop_legacy.py services/campaigns/models.py \
  services/campaigns/admin.py services/campaigns/management/commands/seed_demo_campaigns.py \
  services/customers/models.py services/campaigns/tests/test_migration.py \
  services/campaigns/tests/test_admin_seed.py
git commit -m "feat(campaigns): move existing campaigns to owned sends; drop the send log

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Rule reviews gain a kind; a night may hold one of each

Spec §1.8 "`RuleReview` change", §1.10 (`rule.review_*` gains `kind`). Contract notes 18, 19, 20.

**Files:**
- Modify:
  - `services/rules/models.py` (`RuleReview.Kind`, `kind`, `run` as a foreign key, the unique constraint, help texts)
  - `services/rules/reviews.py` (`kind` in every `rule.review_*` event)
  - `services/rules/nightly.py` (`_unsent` surveys only; `waiting_message`, `_tell_owners` across kinds)
  - `services/rules/payloads.py` (`reviews_of`, `review_of`, `last_runs`, `last_run_ref`, `runs_page`, `review_payload`)
  - existing tests that read the old shape: `services/rules/tests/test_models.py`, `test_nightly.py`, `test_reviews.py`, `test_views.py`, `test_reading.py`
- Create: `services/rules/migrations/0004_review_kind.py` (generated)
- Test: `services/rules/tests/test_review_kinds.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (the campaign review rows here are built by hand).
- Produces:
  - `RuleReview.Kind` (`SURVEY = "survey"`, `CAMPAIGN = "campaign"`); `RuleReview.kind`; `RuleRun.reviews` (reverse of the new foreign key; `RuleRun.review` no longer exists); constraint `one_rule_review_per_run_and_kind`.
  - `rules.payloads.KIND_ORDER`, `reviews_of(run) -> list[RuleReview]` (survey first; reads the prefetch), `review_of(run) -> RuleReview | None` (the first of them); runs rows gain `reviews: [{id, kind, status}]` (owner only; `[]` for others); `review_payload(review, campaigns=None)` gains `kind` (Task 12 adds the campaign's name).
  - `rules.nightly.waiting_message(surveys, campaigns=0) -> str`.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_review_kinds.py`:

```python
"""A rule night may hold one review of each kind (campaigns spec §1.8):
`RuleReview.kind` and `run` as a foreign key unique on (run, kind). Reads,
audit and the owner's one notice per night cover both kinds."""

from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from services.accounts.models import User
from services.notifications.models import Notification
from services.rules import nightly
from services.rules.models import RuleReview, RuleRun
from services.rules.tests.fixtures import SURVEY, RuleFixture

CAMPAIGN = {"action": "campaign", "campaign": 1, "without_review": False}
URL = "/api/v1/rules/"


class KindFixture(RuleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.rule = cls.make_rule()
        cls.run = RuleRun.objects.create(rule=cls.rule, run_on=cls.today, started_at=cls.now)

    def review(self, kind="survey", **fields):
        action = SURVEY if kind == "survey" else CAMPAIGN
        return RuleReview.objects.create(
            rule=self.rule, run=self.run, kind=kind, action=action, records=[], **fields
        )

    def api(self, user):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=user.pk))
        return client


class KindModelTests(KindFixture):
    def test_old_reviews_are_surveys_and_a_night_holds_one_of_each(self):
        survey = RuleReview.objects.create(rule=self.rule, run=self.run, action=SURVEY, records=[])
        self.assertEqual(survey.kind, "survey")
        campaign = self.review("campaign")
        self.assertEqual(set(self.run.reviews.all()), {survey, campaign})
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.review("campaign")


class KindReadingTests(KindFixture):
    def test_a_nights_row_names_both_reviews_survey_first(self):
        campaign = self.review("campaign")
        survey = self.review("survey", status="skipped")
        (row,) = self.api(self.csm).get(f"{URL}{self.rule.pk}/runs/").data["results"]
        self.assertEqual(row["review"], {"id": survey.pk, "status": "skipped"})
        self.assertEqual(
            row["reviews"],
            [
                {"id": survey.pk, "kind": "survey", "status": "skipped"},
                {"id": campaign.pk, "kind": "campaign", "status": "waiting"},
            ],
        )

    def test_another_reader_sees_neither(self):
        self.rule.sharing = "workspace"
        self.rule.save(update_fields=["sharing"])
        self.review("campaign")
        (row,) = self.api(self.other).get(f"{URL}{self.rule.pk}/runs/").data["results"]
        self.assertEqual((row["review"], row["reviews"]), (None, []))

    def test_the_last_night_waits_when_any_review_waits(self):
        self.review("survey", status="skipped")
        self.review("campaign")
        data = self.api(self.csm).get(f"{URL}{self.rule.pk}/").data
        self.assertTrue(data["last_run"]["waiting"])

    def test_the_review_list_says_which_kind(self):
        self.review("campaign")
        (item,) = self.api(self.csm).get(f"{URL}reviews/").data
        self.assertEqual(item["kind"], "campaign")


class KindNoticeTests(KindFixture):
    def test_the_words(self):
        say = nightly.waiting_message
        self.assertEqual(say(1), "A survey from your rules is waiting for your review.")
        self.assertEqual(say(2), "2 surveys from your rules are waiting for your review.")
        self.assertEqual(say(0, 1), "A campaign from your rules is waiting for your review.")
        self.assertEqual(say(0, 3), "3 campaigns from your rules are waiting for your review.")
        self.assertEqual(say(1, 1), "2 emails from your rules are waiting for your review.")

    def test_one_notice_per_owner_covering_both_kinds(self):
        self.review("survey")
        self.review("campaign")
        self.assertEqual(nightly._tell_owners(None, now=self.now), 0)
        self.assertEqual(
            self.notes(),
            [
                (
                    self.csm.pk,
                    "2 emails from your rules are waiting for your review.",
                    "/brain/review",
                )
            ],
        )

    def notes(self):
        rows = Notification.objects.filter(kind="rule_review").order_by("pk")
        return list(rows.values_list("recipient_id", "message", "link"))

    def test_campaign_reviews_are_never_sent_as_surveys(self):
        self.review("campaign", action={**CAMPAIGN, "without_review": True})
        self.assertEqual(nightly._unsent(None, today=self.today), [])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_review_kinds --noinput`
Expected: ERROR, `TypeError: RuleReview() got unexpected keyword arguments: 'kind'`.

- [ ] **Step 3: The model and its migration**

In `services/rules/models.py`, change the module docstring's last `RuleReview` sentence to "`RuleReview` is one night's survey or campaign waiting for the owner, or sent at once "without review"; a night holds at most one of each kind." and replace `RuleReview`'s head with:

```python
class RuleReview(models.Model):
    """One night's customer-facing email waiting for the rule's owner: a
    survey (sent through services.surveys) or a campaign (through
    services.campaigns). Approving sends it to the fired records
    (`reviews.py`). A night holds at most one review of each kind."""

    class Kind(models.TextChoices):
        SURVEY = "survey", "Survey"
        CAMPAIGN = "campaign", "Campaign"

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        APPROVED = "approved", "Approved"
        SKIPPED = "skipped", "Skipped"
        EXPIRED = "expired", "Expired"

    rule = models.ForeignKey(Rule, related_name="reviews", on_delete=models.CASCADE)
    run = models.ForeignKey(RuleRun, related_name="reviews", on_delete=models.CASCADE)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.SURVEY)
    action = models.JSONField(help_text="The survey or campaign action's settings, frozen.")
    records = models.JSONField(default=list, help_text="The fired records: [{kind, id}].")
    counts = models.JSONField(
        default=dict,
        blank=True,
        help_text="A survey's {people, records}; a campaign's {reach, skipped}, when made.",
    )
```

(`status`, `decided_by`, `decided_at` unchanged), change `result`'s help text to `'{"survey_send_id"}, {"campaign_send_id"} or {"error": <the refusal>}.'`, and add to its `Meta`:

```python
        constraints = [
            models.UniqueConstraint(fields=["run", "kind"], name="one_rule_review_per_run_and_kind")
        ]
```

Run: `venv/bin/python manage.py makemigrations rules --name review_kind`
Expected: `0004_review_kind.py` with `AddField kind` (existing rows become `survey` through the default), `AlterField run` (one-to-one → foreign key), `AlterField` for the help texts, and `AddConstraint`. Its reverse turns `run` back into a one-to-one, which works only while no night holds two reviews; say so in a comment at the top of the generated file:

```python
# Reversible while no rule night holds both a survey and a campaign review:
# reversing makes `run` one-to-one again.
```

- [ ] **Step 4: Audit, the surveys-only catch-up and the notice**

In `services/rules/reviews.py`:
- `_expire`: `metadata = {"rule": review.rule_id, "kind": review.kind}`;
- `send_review`'s `rule.review_approved`: add `"kind": review.kind` to its metadata;
- `skip_review`'s `rule.review_skipped`: `metadata={"rule": review.rule_id, "kind": review.kind}`.

In `services/rules/nightly.py`, in `_unsent` add `kind=RuleReview.Kind.SURVEY,` to the filter, and replace `waiting_message` and the top of `_tell_owners`:

```python
def waiting_message(surveys, campaigns=0):
    count = surveys + campaigns
    if not campaigns:
        one, many = "A survey", "surveys"
    elif not surveys:
        one, many = "A campaign", "campaigns"
    else:
        one, many = "An email", "emails"
    if count == 1:
        return f"{one} from your rules is waiting for your review."
    return f"{count} {many} from your rules are waiting for your review."
```

```python
    by_owner = {}
    for pk, owner_id, kind in untold.order_by("pk").values_list("pk", "rule__owner_id", "kind"):
        by_owner.setdefault(owner_id, []).append((pk, kind))
    lost = 0
    for owner_id, found in sorted(by_owner.items()):
        ids = [pk for pk, _kind in found]
        campaigns = sum(1 for _pk, kind in found if kind == RuleReview.Kind.CAMPAIGN)
        try:
            with transaction.atomic():
                notify(
                    recipient=User.objects.get(pk=owner_id),
                    actor=None,
                    kind=Notification.Kind.RULE_REVIEW,
                    message=waiting_message(len(ids) - campaigns, campaigns),
                    link="/brain/review",
                    push_on_commit=True,
                )
                RuleReview.objects.filter(pk__in=ids).update(notified_at=now)
```

(the `except` branch is unchanged).

- [ ] **Step 5: Reads**

In `services/rules/payloads.py`, replace `review_of` and `last_runs`, and change `last_run_ref`, `runs_page` and `review_payload`:

```python
#: A night's reviews are listed survey first.
KIND_ORDER = {RuleReview.Kind.SURVEY: 0, RuleReview.Kind.CAMPAIGN: 1}


def reviews_of(run):
    """The night's reviews, survey first. Reads the `prefetch_related` cache."""
    return sorted(run.reviews.all(), key=lambda review: (KIND_ORDER[review.kind], review.pk))


def review_of(run):
    """The night's first review (its survey's, else its campaign's), or None."""
    found = reviews_of(run)
    return found[0] if found else None


def last_runs(rule_ids):
    """`{rule_id: its latest night}`, two queries (none for no ids)."""
    if not rule_ids:
        return {}
    runs = (
        RuleRun.objects.filter(rule_id__in=rule_ids)
        .prefetch_related("reviews")
        .order_by("rule_id", "-run_on", "-pk")
        .distinct("rule_id")
    )
    return {run.rule_id: run for run in runs}


def last_run_ref(run, is_owner):
    if run is None:
        return None
    reviews = reviews_of(run) if is_owner else []
    return {
        "run_on": iso(run.run_on),
        "fired": run.fired if is_owner else None,
        "waiting": any(review.status == RuleReview.Status.WAITING for review in reviews),
    }
```

In `runs_page`: `runs = rule.runs.prefetch_related("reviews").order_by("-run_on", "-pk")`, and in the loop:

```python
reviews = reviews_of(run) if is_owner else []
first = reviews[0] if reviews else None
results.append(
    {
        "id": run.pk,
        "run_on": iso(run.run_on),
        "matched": run.matched if is_owner else None,
        "fired": run.fired if is_owner else tally["seen_fired"],
        "skipped": run.skipped if is_owner else None,
        "review": None if first is None else {"id": first.pk, "status": first.status},
        "reviews": [
            {"id": review.pk, "kind": review.kind, "status": review.status} for review in reviews
        ],
        "hidden_count": tally["total"] - tally["seen"],
        "started_at": iso(run.started_at),
        "finished_at": iso(run.finished_at),
    }
)
```

`review_payload(review, campaigns=None)`: add `"kind": review.kind,` directly after `"id": review.pk,` (the `campaigns` argument is used from Task 12).

- [ ] **Step 6: Bring the existing tests up to the new shape**

These assert the old one-to-one or the old event metadata, and change exactly as follows:
- `services/rules/tests/test_models.py`, `test_one_review_per_run_waiting_seven_days`: `self.assertEqual(run.review, review)` → `self.assertEqual(list(run.reviews.all()), [review])`; rename the test `test_one_review_per_run_and_kind_waiting_seven_days`.
- `services/rules/tests/test_nightly.py` (about line 386): `RuleRun.objects.get(rule=first).review` → `RuleRun.objects.get(rule=first).reviews.get()`.
- `services/rules/tests/test_reviews.py`: add `"kind": "survey"` to each expected metadata of `rule.review_approved` (about line 100), `rule.review_expired` (about lines 176 and 276) and `rule.review_skipped` (about line 253).
- `services/rules/tests/test_views.py` (about line 264): add `"kind": "survey"` to the expected `rule.review_expired` metadata.
- `services/rules/tests/test_reading.py`: in `test_the_owner_reads_each_nights_own_counts`, add `"reviews": [],` after `"review": None,`; in `test_the_owner_lists_their_waiting_reviews`, add `"kind": "survey",` after `"id": self.review.pk,`.

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.rules services.plans --parallel --noinput`
Expected: PASS.

Run: `venv/bin/python manage.py makemigrations --check --dry-run && venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: `No changes detected`; ruff clean.

- [ ] **Step 8: Commit**

```bash
git add services/rules/models.py services/rules/migrations/0004_review_kind.py \
  services/rules/reviews.py services/rules/nightly.py services/rules/payloads.py \
  services/rules/tests/
git commit -m "feat(rules): a review has a kind; one survey and one campaign review per night

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The "Send a campaign" action: what it may say, how it reads, when it pauses, the dry run

Spec §1.8 (action, validation, `campaign_gone`, dry run), §4 "Rules additions". Contract note 16.

**Files:**
- Modify:
  - `services/rules/models.py` (`Rule.Paused.CAMPAIGN_GONE`)
  - `services/rules/validation.py` (`_campaign`, `CLEANERS`)
  - `services/rules/nightly.py` (`pause_reason`)
  - `services/rules/payloads.py` (`campaign_names`, `action_refs`, `_row`, `rule_payload`, `list_rows`, `campaign_preview`)
  - `services/rules/views.py` (`RuleTestView`)
- Create: `services/rules/migrations/0005_campaign_gone.py` (generated)
- Test: `services/rules/tests/test_campaign_action.py` (this task writes its first three classes; Task 12 adds the rest)

**Interfaces:**
- Consumes: `campaigns.models.Campaign`; `campaigns.validation.CHOOSE_CAMPAIGN`; `campaigns.audience.build` (Task 2); `campaigns.tests.fixtures.CampaignFixture` (Task 1).
- Produces:
  - `Rule.Paused.CAMPAIGN_GONE = "campaign_gone"` ("Its campaign was archived or deleted.");
  - `rules.validation.CHOOSE_CAMPAIGN`; `CLEANERS["campaign"]` normalises to `{"action": "campaign", "campaign": <id>, "without_review": <bool>}`;
  - `rules.payloads.campaign_names(rules) -> dict`, `action_refs(actions, names, campaigns=None) -> list`, `campaign_preview(rule, selection, *, today, now) -> dict | None`;
  - a rule's payload shows the action as `{"action": "campaign", "campaign": {"id", "name"} | None, "without_review"}`; `POST rules/test/` adds `campaigns: {would_email, skipped}`.
  - Test helpers in `test_campaign_action.py`: `CampaignActionFixture(CampaignFixture)` with `cls.win_back` (Carl's campaign on "My book"), `action(campaign=None, without_review=False) -> dict`, `night(days=0)`, `records(rule)`.

- [ ] **Step 1: Write the failing tests**

Create `services/rules/tests/test_campaign_action.py`:

```python
"""The sixth rule action, "Send a campaign" (campaigns spec §1.8): what it
may say, how the rule reads it back, the pause when its campaign is archived
or deleted, the dry run, and (Task 12) the night and the Review Queue."""

from datetime import timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.exceptions import ValidationError

from services.campaigns.models import Campaign
from services.campaigns.tests.fixtures import CampaignFixture
from services.rules import validation as say
from services.rules.models import Rule, RuleRunRecord
from services.rules.nightly import evaluate_rules
from services.rules.tests.fixtures import NOTIFY_ME, SURVEY, TASK

RULES = "/api/v1/rules/"


class CampaignActionFixture(CampaignFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.win_back = cls.make_campaign(segment=cls.book)

    def action(self, campaign=None, without_review=False):
        return {
            "action": "campaign",
            "campaign": (campaign or self.win_back).pk,
            "without_review": without_review,
        }

    def night(self, days=0):
        return evaluate_rules(today=self.today + timedelta(days=days), now=self.now)

    def records(self, rule):
        rows = RuleRunRecord.objects.filter(run__rule=rule).order_by("record_id")
        return [(row.record_id, row.outcome, row.reason, row.actions) for row in rows]


class CampaignValidationTests(CampaignActionFixture):
    def refused(self, actions, kind="customer"):
        with self.assertRaises(ValidationError) as caught:
            say.clean_actions(actions, kind, self.csm)
        return caught.exception.detail

    def test_a_campaign_action_is_normalised(self):
        cleaned = say.clean_actions([{**self.action(), "x": 1}], "customer", self.csm)
        self.assertEqual(cleaned, [self.action()])
        sent_back = {"action": "campaign", "campaign": {"id": self.win_back.pk, "name": "Win-back"}}
        self.assertEqual(say.clean_actions([sent_back], "customer", self.csm), [self.action()])

    def test_only_the_owners_active_campaigns_for_these_records(self):
        refusal = {"actions": [{"campaign": [say.CHOOSE_CAMPAIGN]}]}
        danas = self.make_campaign(
            owner=self.other, segment=self.pinned("customer", [self.taco], owner=self.other)
        )
        archived = self.make_campaign(segment=self.book, status="archived")
        unsegmented = self.make_campaign()
        contacts = self.make_campaign(segment=self.people)
        for campaign in (
            danas.pk,
            archived.pk,
            unsegmented.pk,
            contacts.pk,
            999999,
            None,
            "x",
            True,
        ):
            item = {"action": "campaign", "campaign": campaign}
            self.assertEqual(self.refused([item]), refusal, campaign)
        self.assertEqual(
            say.clean_actions([self.action(contacts)], "contact", self.csm), [self.action(contacts)]
        )

    def test_without_review_is_true_or_false(self):
        self.assertEqual(
            self.refused([{**self.action(), "without_review": "yes"}]),
            {"actions": [{"without_review": [say.YES_OR_NO]}]},
        )

    def test_still_one_to_three_actions_each_once(self):
        self.assertEqual(
            self.refused([NOTIFY_ME, TASK, SURVEY, self.action()]), {"actions": [say.ACTION_COUNT]}
        )
        self.assertEqual(
            self.refused([self.action(), self.action()]),
            {"actions": [{}, {"action": [say.ONE_OF_EACH]}]},
        )
        self.assertEqual(len(say.clean_actions([SURVEY, self.action()], "customer", self.csm)), 2)


class CampaignPayloadTests(CampaignActionFixture):
    def create(self, actions):
        body = {
            "name": "Win them back",
            "segment": self.book.pk,
            "trigger": "entered",
            "actions": actions,
        }
        return self.api(self.csm).post(RULES, body, format="json")

    def test_the_rule_reads_its_campaign_by_name(self):
        response = self.create([self.action(without_review=True)])
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(
            response.data["actions"],
            [
                {
                    "action": "campaign",
                    "campaign": {"id": self.win_back.pk, "name": "Win-back"},
                    "without_review": True,
                }
            ],
        )

    def test_a_deleted_campaign_reads_as_none_and_the_rule_cannot_be_turned_on(self):
        doomed = self.make_campaign(name="Doomed", segment=self.book)
        rule = self.make_rule(actions=[self.action(doomed)], is_active=False)
        doomed.delete()
        data = self.api(self.csm).get(f"{RULES}{rule.pk}/").data
        self.assertEqual(
            data["actions"], [{"action": "campaign", "campaign": None, "without_review": False}]
        )
        response = self.api(self.csm).patch(
            f"{RULES}{rule.pk}/", {"is_active": True}, format="json"
        )
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"actions": [{"campaign": [say.CHOOSE_CAMPAIGN]}]}),
        )

    def test_the_list_reads_in_a_fixed_number_of_queries(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api(self.csm).get(RULES)
            return len(ctx.captured_queries)

        self.make_rule(name="A", actions=[self.action()])
        one = count()
        for name in ("B", "C"):
            campaign = self.make_campaign(name=name, segment=self.book)
            self.make_rule(name=name, actions=[self.action(campaign)])
        self.assertEqual(count(), one)

    def test_the_dry_run_counts_who_it_would_email(self):
        self.dot.campaigns_unsubscribed_at = self.now
        self.dot.save(update_fields=["campaigns_unsubscribed_at"])
        self.changed(self.book, [self.pizza, self.dough])
        body = {"segment": self.book.pk, "trigger": "entered", "actions": [self.action()]}
        data = self.api(self.csm).post(f"{RULES}test/", body, format="json").data
        # Pizza Hut reaches Ann and Ben (Pizza EMEA's); Dough Co's Dot has unsubscribed
        self.assertEqual(data["campaigns"], {"would_email": 2, "skipped": 1})
        no_campaign = {"segment": self.book.pk, "trigger": "entered", "actions": [NOTIFY_ME]}
        self.assertNotIn(
            "campaigns", self.api(self.csm).post(f"{RULES}test/", no_campaign, format="json").data
        )


class CampaignGoneTests(CampaignActionFixture):
    def test_an_archived_or_deleted_campaign_pauses_the_rule(self):
        for gone in ("archived", "deleted"):
            campaign = self.make_campaign(name=gone, segment=self.book)
            rule = self.make_rule(name=gone, actions=[self.action(campaign)])
            if gone == "archived":
                Campaign.objects.filter(pk=campaign.pk).update(status="archived")
            else:
                campaign.delete()
        result = self.night()
        self.assertEqual(result.paused, 2)
        for rule in Rule.objects.filter(name__in=["archived", "deleted"]):
            self.assertEqual((rule.is_active, rule.paused_reason), (False, "campaign_gone"))
        self.assertEqual(
            Rule.Paused("campaign_gone").label, "Its campaign was archived or deleted."
        )
        notes = self.notes("rule_fired")
        self.assertIn("was switched off: Its campaign was archived or deleted.", notes[0][1])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_campaign_action --noinput`
Expected: FAIL/ERROR (`AttributeError: module 'services.rules.validation' has no attribute 'CHOOSE_CAMPAIGN'`).

- [ ] **Step 3: The paused reason**

In `services/rules/models.py`, add to `Rule.Paused` after `TEMPLATE_GONE`:

```python
        CAMPAIGN_GONE = "campaign_gone", "Its campaign was archived or deleted."
```

Run: `venv/bin/python manage.py makemigrations rules --name campaign_gone`
Expected: `0005_campaign_gone.py`, one `AlterField` of `paused_reason`.

- [ ] **Step 4: Validation**

In `services/rules/validation.py`, import `from services.campaigns.models import Campaign` and `from services.campaigns.validation import CHOOSE_CAMPAIGN`, and add above `CLEANERS`:

```python
def _campaign(item, kind, owner):
    """`{"action": "campaign", "campaign": <id>, "without_review": <bool>}`.
    The campaign may be sent as an id or as the `{id, name}` the rule's
    payload shows. It must be the owner's own, not archived, with a segment
    of the rule's kind (any kind while the rule has no segment)."""
    campaign = item.get("campaign")
    if isinstance(campaign, dict):
        campaign = campaign.get("id")
    usable = False
    if _integer(campaign):
        # SOC2:AUTH-02 a rule sends only its owner's own campaigns
        found = Campaign.objects.filter(
            pk=campaign,
            owner=owner,
            organisation_id=owner.organisation_id,
            segment__isnull=False,
        ).exclude(status=Campaign.Status.ARCHIVED)
        if kind is not None:
            found = found.filter(segment__kind=kind)
        usable = found.exists()
    if not usable:
        raise ValidationError({"campaign": [CHOOSE_CAMPAIGN]})
    without_review = item.get("without_review", False)
    if not isinstance(without_review, bool):
        raise ValidationError({"without_review": [YES_OR_NO]})
    return {"action": "campaign", "campaign": campaign, "without_review": without_review}
```

and add `"campaign": _campaign,` to `CLEANERS`.

- [ ] **Step 5: The pause**

In `services/rules/nightly.py`, import `from services.campaigns.models import Campaign` and add to `pause_reason`, after the template check:

```python
    campaigns = [action["campaign"] for action in rule.actions if action["action"] == "campaign"]
    live = Campaign.objects.filter(pk__in=campaigns).exclude(status=Campaign.Status.ARCHIVED)
    if campaigns and not live.exists():
        return Rule.Paused.CAMPAIGN_GONE
```

- [ ] **Step 6: Reads and the dry run**

In `services/rules/payloads.py`, import `from services.campaigns.audience import build` and `from services.campaigns.models import Campaign`, then:

```python
def campaign_names(rules):
    """`{campaign_id: name}` for every `campaign` action of `rules`, in one
    query (none when no rule sends a campaign)."""
    ids = {a["campaign"] for rule in rules for a in rule.actions if a["action"] == "campaign"}
    if not ids:
        return {}
    return dict(Campaign.objects.filter(pk__in=ids).values_list("pk", "name"))


def action_refs(actions, names, campaigns=None):
    """A rule's actions as the API reads them: a `plan` action's template and
    a `campaign` action's campaign as `{id, name}`, or None once deleted."""
    campaigns = campaigns or {}
    shown = []
    for action in actions:
        if action["action"] == "plan":
            pk = action["template"]
            action = {**action, "template": {"id": pk, "name": names[pk]} if pk in names else None}
        elif action["action"] == "campaign":
            pk = action["campaign"]
            ref = {"id": pk, "name": campaigns[pk]} if pk in campaigns else None
            action = {**action, "campaign": ref}
        shown.append(action)
    return shown
```

Give `_row` a `campaigns` parameter (`def _row(rule, viewer, readable, run, names, campaigns):`) and use `"actions": action_refs(rule.actions, names, campaigns),`. In `rule_payload` pass `campaign_names([rule])` as the new last argument; in `list_rows` compute `campaigns = campaign_names(rules)` next to `names` and pass it; update `list_rows`' docstring to "five queries whatever their number (… and the campaigns when any rule sends one)".

Add below `plan_preview`:

```python
def campaign_preview(rule, selection, *, today, now):
    """The builder's test for a `campaign` action: how many tonight's records
    would email and how many they would skip, as the owner (the caller).
    None for a rule without a `campaign` action."""
    action = next((a for a in rule.actions if a["action"] == "campaign"), None)
    if action is None:
        return None
    campaign = (
        Campaign.objects.select_related("segment", "owner").filter(pk=action["campaign"]).first()
    )
    if campaign is None or campaign.segment is None or not selection.fire:
        return {"would_email": 0, "skipped": 0}
    # SOC2:AUTH-02 counted as the campaign's owner, who is the rule's owner and the caller
    reach = build(campaign, today=today, now=now, records=selection.fire)
    return {"would_email": reach.reach, "skipped": len(reach.skipped)}
```

In `services/rules/views.py`, import `campaign_preview` and add to `RuleTestView.post` after the `plans` lines:

```python
campaigns = campaign_preview(rule, selection, today=timezone.localdate(), now=timezone.now())
if campaigns is not None:
    body["campaigns"] = campaigns
```

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.rules services.campaigns --parallel --noinput`
Expected: PASS.

Run: `venv/bin/python manage.py makemigrations --check --dry-run && venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: `No changes detected`; ruff clean.

- [ ] **Step 8: Commit**

```bash
git add services/rules/models.py services/rules/migrations/0005_campaign_gone.py \
  services/rules/validation.py services/rules/nightly.py services/rules/payloads.py \
  services/rules/views.py services/rules/tests/test_campaign_action.py
git commit -m "feat(rules): Send a campaign action: validation, reads, campaign_gone, dry run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The campaign action at night and in the Review Queue

Spec §1.8 (night records, with review, without review, nobody, night results), §1.4 (the nightly step finishes stale sends), §1.10 (`campaign_sent`). Contract notes 17, 18, 21. Decisions 6 and 15.

**Files:**
- Modify:
  - `services/rules/actions.py` (`EMAILED`, `WAITING`, `CAMPAIGN_UNUSABLE`, `campaign_statuses`)
  - `services/rules/reviews.py` (`create_campaign_review`, `send_review` dispatch, `send_campaign_review`, module docstring's lock order)
  - `services/rules/nightly.py` (`Outcome.reviews`, `RulesResult.campaign_sends`, `_act`, `run_rule(…, now=None)`, `_finish_night`, the workspace lock, the docstring)
  - `services/rules/payloads.py` (`review_payload`'s campaign)
  - `services/rules/views.py` (`ReviewListView`, `ReviewSkipView` pass campaign names)
- Test: `services/rules/tests/test_campaign_action.py` (add the classes below)

**Interfaces:**
- Consumes: `campaigns.sending.claim`, `deliver`, `deliver_pending`, `before_claim`, `Refusal` (Task 6); `campaigns.audience.build` (Task 2); `campaigns.validation.NOBODY`, `CHOOSE_CAMPAIGN`; `CampaignActionFixture` (Task 11); `RuleReview.Kind` (Task 10).
- Produces:
  - `rules.actions.campaign_statuses(action, rule, run, records, kind, *, today, now) -> dict[int, dict]`;
  - `rules.reviews.create_campaign_review(rule, run, record_ids, action, reach) -> RuleReview`, `send_campaign_review(review_id, *, actor, today, now, request=None) -> Answer`; `send_review` dispatches on `kind`;
  - `rules.nightly.run_rule(rule_id, *, today, now=None)`; `Outcome.reviews: int` (replaces `review_id`); `RulesResult.campaign_sends: int`;
  - `review_payload(review, campaigns=None)` adds `campaign: {id, name} | None` on a campaign review.

- [ ] **Step 1: Write the failing tests**

Append to `services/rules/tests/test_campaign_action.py` (and add to its imports: `from unittest import mock`, `from django.core import mail`, `from django.test import override_settings`, `from services.campaigns import validation as campaign_say`, `from services.campaigns.models import CampaignSend`, `from services.rules.models import RuleReview`, `from services.rules.reviews import Answer, send_review`):

```python
CONSOLE = "django.core.mail.backends.console.EmailBackend"
QUEUED = {"action": "campaign", "status": "queued", "detail": "waiting for your review"}
EMAILED = {"action": "campaign", "status": "done", "detail": "emailed"}
NOBODY = {"action": "campaign", "status": "skipped", "detail": "nobody it could reach"}


class CampaignNightTests(CampaignActionFixture):
    def test_with_review_the_night_waits_for_the_owner(self):
        rule = self.make_rule(actions=[self.action()])
        self.changed(self.book, [self.dough])
        result = self.night()
        self.assertEqual((result.ran, result.fired, result.reviews), (1, 1, 1))
        self.assertEqual(self.records(rule), [(self.dough.pk, "fired", "", [QUEUED])])
        review = RuleReview.objects.get()
        self.assertEqual(
            (review.kind, review.action, review.records),
            ("campaign", self.action(), [{"kind": "customer", "id": self.dough.pk}]),
        )
        self.assertEqual(review.counts["reach"], 1)
        self.assertEqual(review.counts["skipped"]["unsubscribed"], 0)
        self.assertFalse(CampaignSend.objects.exists())
        self.assertEqual(mail.outbox, [])
        self.assertEqual(
            self.notes("rule_review"),
            [
                (
                    self.csm.pk,
                    "A campaign from your rules is waiting for your review.",
                    "/brain/review",
                )
            ],
        )

    def test_a_survey_and_a_campaign_make_two_reviews_and_one_notice(self):
        self.make_rule(actions=[SURVEY, self.action()])
        self.changed(self.book, [self.dough])
        self.assertEqual(self.night().reviews, 2)
        self.assertEqual(
            sorted(RuleReview.objects.values_list("kind", flat=True)), ["campaign", "survey"]
        )
        self.assertEqual(
            [note[1] for note in self.notes("rule_review")],
            ["2 emails from your rules are waiting for your review."],
        )

    def test_without_review_the_night_emails_after_it_commits(self):
        rule = self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        result = self.night()
        self.assertEqual((result.fired, result.reviews, result.campaign_sends), (1, 0, 1))
        self.assertEqual(self.records(rule), [(self.pizza.pk, "fired", "", [EMAILED])])
        send = CampaignSend.objects.get()
        self.assertEqual(
            (send.kind, send.rule, send.review, send.sent_by, send.status),
            ("rule", rule, None, None, "sent"),
        )
        self.assertEqual(sorted(self.mail_to()), ["ann@example.com", "ben@example.com"])
        self.assertEqual(
            self.notes("campaign_sent"),
            [(self.csm.pk, "Win-back emailed 2 people.", f"/campaigns/{self.win_back.pk}")],
        )

    def test_a_rerun_finishes_a_send_cut_off_and_never_sends_twice(self):
        self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        with mock.patch("services.rules.nightly.deliver_pending", return_value=(0, 0)):
            self.night()
        self.assertEqual((CampaignSend.objects.get().status, mail.outbox), ("sending", []))
        again = self.night()
        self.assertEqual((again.ran, again.campaign_sends), (0, 1))
        self.assertEqual(CampaignSend.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 2)
        self.night()
        self.assertEqual(len(mail.outbox), 2)

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_without_review_and_no_email_set_up_fails_in_the_owners_words(self):
        rule = self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        self.night()
        failed = {"action": "campaign", "status": "failed", "detail": campaign_say.EMAIL_NOT_SET_UP}
        self.assertEqual(self.records(rule), [(self.pizza.pk, "skipped", "failed", [failed])])
        self.assertFalse(CampaignSend.objects.exists())

    def nobody(self, without_review):
        rule = self.make_rule(actions=[self.action(without_review=without_review)])
        self.dot.campaigns_unsubscribed_at = self.now
        self.dot.save(update_fields=["campaigns_unsubscribed_at"])
        self.changed(self.book, [self.dough])
        self.night()
        self.assertEqual(self.records(rule), [(self.dough.pk, "skipped", "nobody", [NOBODY])])
        self.assertFalse(RuleReview.objects.exists())
        self.assertFalse(CampaignSend.objects.exists())

    def test_nobody_to_email_makes_no_review(self):
        self.nobody(without_review=False)

    def test_nobody_to_email_makes_no_send(self):
        self.nobody(without_review=True)

    def test_a_campaign_without_a_segment_fails_its_records(self):
        rule = self.make_rule(actions=[NOTIFY_ME, self.action()])
        Campaign.objects.filter(pk=self.win_back.pk).update(segment=None)
        self.changed(self.book, [self.dough])
        self.night()
        (row,) = self.records(rule)
        self.assertEqual(
            row[3][1],
            {"action": "campaign", "status": "failed", "detail": "its campaign can't be used"},
        )

    def test_the_night_takes_the_workspace_lock_before_the_campaigns(self):
        self.make_rule(actions=[self.action(without_review=True)])
        self.changed(self.book, [self.pizza])
        with (
            mock.patch("services.rules.nightly.deliver_pending", return_value=(0, 0)),
            CaptureQueriesContext(connection) as ctx,
        ):
            self.night()
        sqls = [q["sql"] for q in ctx.captured_queries]
        rule_lock = next(
            i for i, s in enumerate(sqls) if 'FROM "rules_rule"' in s and "FOR UPDATE" in s
        )
        workspace = next(
            i
            for i, s in enumerate(sqls)
            if 'FROM "accounts_organisation"' in s and s.endswith("FOR NO KEY UPDATE")
        )
        campaign = next(
            i
            for i, s in enumerate(sqls)
            if 'FROM "campaigns_campaign"' in s and "FOR NO KEY UPDATE" in s
        )
        self.assertLess(rule_lock, workspace, sqls)
        self.assertLess(workspace, campaign, sqls)


class CampaignReviewTests(CampaignActionFixture):
    def setUp(self):
        self.rule = self.make_rule(actions=[self.action()])
        self.changed(self.book, [self.pizza])
        self.night()
        self.review = RuleReview.objects.get()

    def approve(self, actor="owner"):
        return send_review(
            self.review.pk,
            actor=self.csm if actor == "owner" else actor,
            today=self.today,
            now=self.now,
        )

    def test_approving_sends_to_the_fired_records_as_the_owner(self):
        answer = self.approve()
        send = CampaignSend.objects.get()
        self.assertEqual(answer, Answer(200, {"campaign_send_id": send.pk}))
        self.assertEqual(
            (send.kind, send.rule, send.review, send.sent_by, send.status),
            ("rule", self.rule, self.review, self.csm, "sent"),
        )
        self.assertEqual(sorted(self.mail_to()), ["ann@example.com", "ben@example.com"])
        self.review.refresh_from_db()
        self.assertEqual(
            (self.review.status, self.review.decided_by, self.review.result),
            ("approved", self.csm, {"campaign_send_id": send.pk}),
        )
        self.assertEqual(
            self.events("rule.review_approved"),
            [
                (
                    str(self.review.pk),
                    {
                        "rule": self.rule.pk,
                        "kind": "campaign",
                        "campaign_send": send.pk,
                        "without_review": False,
                    },
                )
            ],
        )
        self.assertEqual(self.notes("campaign_sent"), [])

    def assert_refused(self, detail):
        answer = self.approve()
        self.assertEqual(answer, Answer(400, {"detail": detail}))
        self.review.refresh_from_db()
        self.assertEqual(
            (self.review.status, self.review.result), ("waiting", {"error": {"detail": detail}})
        )
        self.assertFalse(CampaignSend.objects.exists())

    @override_settings(EMAIL_BACKEND=CONSOLE, DEBUG=False)
    def test_email_not_set_up_is_stored_and_the_review_waits(self):
        self.assert_refused(campaign_say.EMAIL_NOT_SET_UP)

    def test_an_archived_campaign_is_refused(self):
        Campaign.objects.filter(pk=self.win_back.pk).update(status="archived")
        self.assert_refused("Its campaign was archived or deleted.")

    def test_a_campaign_now_on_another_kind_is_refused(self):
        Campaign.objects.filter(pk=self.win_back.pk).update(segment=self.people)
        self.assert_refused(campaign_say.CHOOSE_CAMPAIGN)

    def test_nobody_left_is_refused(self):
        for person in (self.ann, self.ben):
            person.campaigns_unsubscribed_at = self.now
            person.save(update_fields=["campaigns_unsubscribed_at"])
        self.assert_refused(campaign_say.NOBODY)

    def test_the_lock_order_is_rule_review_workspace_campaign(self):
        with CaptureQueriesContext(connection) as ctx:
            self.approve()
        sqls = [q["sql"] for q in ctx.captured_queries]

        def first(table, mode):
            return next(i for i, s in enumerate(sqls) if f'FROM "{table}"' in s and mode in s)

        rule, review = (
            first("rules_rule", "FOR NO KEY UPDATE"),
            first("rules_rulereview", "FOR UPDATE"),
        )
        workspace, campaign = (
            first("accounts_organisation", "FOR NO KEY UPDATE"),
            first("campaigns_campaign", "FOR NO KEY UPDATE"),
        )
        insert = next(
            i for i, s in enumerate(sqls) if s.startswith('INSERT INTO "campaigns_campaignsend"')
        )
        self.assertEqual(
            sorted([rule, review, workspace, campaign, insert]),
            [rule, review, workspace, campaign, insert],
        )

    def test_the_review_list_names_the_campaign(self):
        (item,) = self.api(self.csm).get(f"{RULES}reviews/").data
        self.assertEqual(
            (item["kind"], item["campaign"], item["counts"]["reach"]),
            ("campaign", {"id": self.win_back.pk, "name": "Win-back"}, 2),
        )
        self.win_back.delete()
        (item,) = self.api(self.csm).get(f"{RULES}reviews/").data
        self.assertIsNone(item["campaign"])

    def test_the_api_approves_and_skips(self):
        response = self.api(self.csm).post(f"{RULES}reviews/{self.review.pk}/approve/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(set(response.data), {"campaign_send_id"})
        again = self.api(self.csm).post(f"{RULES}reviews/{self.review.pk}/skip/")
        self.assertEqual(again.status_code, 409)
```

Note: `CampaignFixture.events` returns `(target_id, metadata)`; the rule review's target is the review, hence `str(self.review.pk)`.

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.rules.tests.test_campaign_action --noinput`
Expected: FAIL (the night writes no campaign status; `result.campaign_sends` does not exist).

- [ ] **Step 3: The action**

In `services/rules/actions.py`, add to the imports:

```python
from services.campaigns.audience import build as build_reach
from services.campaigns.models import Campaign, CampaignSend
from services.campaigns.sending import Refusal, claim
from services.campaigns.validation import NOBODY as NOBODY_TO_EMAIL

from .reviews import create_campaign_review
```

(`reviews.py` imports nothing from `actions.py`, so this is not circular.)

add the constants next to `NOBODY_TO_SURVEY`:

```python
#: A campaign action's statuses (campaigns spec §4 "Rules additions").
WAITING = "waiting for your review"
EMAILED = "emailed"
CAMPAIGN_UNUSABLE = "its campaign can't be used"
```

and below `start_plan_action`:

```python
def campaign_statuses(action, rule, run, records, kind, *, today, now):
    """The night's campaign, once for all its records: `{record_id: status}`.
    The campaign must still be the owner's, with a segment of the rule's
    kind. With review, the night's reach is counted (nothing written) and a
    review waits; without review, the night claims the send here, inside
    the rule's transaction (rule, workspace, campaign), and the emails go out
    once every rule has committed (`nightly._finish_night`). Reaching nobody
    makes neither. Call inside a savepoint."""
    ids = [record.pk for record in records]
    campaign = (
        Campaign.objects.select_related("segment", "owner", "organisation")
        .filter(pk=action["campaign"])
        .first()
    )
    usable = (
        campaign is not None
        and campaign.owner_id == rule.owner_id
        and campaign.segment is not None
        and campaign.segment.kind == kind
    )
    if not usable:
        status = result("campaign", FAILED, CAMPAIGN_UNUSABLE)
    elif action["without_review"]:
        try:
            # SOC2:AUTH-02 the claim builds the audience as the campaign's owner, the rule's owner
            claim(
                campaign.pk,
                kind=CampaignSend.Kind.RULE,
                by=None,
                rule=rule,
                records=ids,
                today=today,
                now=now,
            )
            status = result("campaign", DONE, EMAILED)
        except Refusal as refused:
            detail = str(refused.body.get("detail", ""))
            if detail == NOBODY_TO_EMAIL:
                status = result("campaign", SKIPPED, NOBODY_TO_SURVEY)
            else:
                status = result("campaign", FAILED, detail[:200])
    else:
        # SOC2:AUTH-02 counted as the owner, from the fired records they may open
        reach = build_reach(campaign, today=today, now=now, records=ids)
        if not reach.queued:
            status = result("campaign", SKIPPED, NOBODY_TO_SURVEY)
        else:
            create_campaign_review(rule, run, ids, action, reach)
            status = result("campaign", QUEUED, WAITING)
    return {pk: status for pk in ids}
```

- [ ] **Step 4: The review: made, approved, refused**

In `services/rules/reviews.py`, add to the imports:

```python
from services.campaigns.models import Campaign, CampaignSend
from services.campaigns.sending import before_claim
from services.campaigns.sending import claim as claim_campaign
from services.campaigns.sending import deliver as deliver_campaign
from services.campaigns.validation import CHOOSE_CAMPAIGN

from .models import REVIEW_DAYS, Rule, RuleReview
```

and replace the module docstring's lock-order paragraph with:

```
Lock order. A survey's approval: the review's row, then the workspace,
then the owner, then the send — the order `surveys.sending.claim` takes,
taken again explicitly before the draft is inserted (`_lock_sender`). A
campaign's approval: the rule's row (`FOR NO KEY UPDATE`), then the
review's, then the workspace, then the campaign (`campaigns.sending.claim`).
The rule comes first there because the campaign send's insert takes
`FOR KEY SHARE` on the rule's row, and a rule edit holds that row while it
expires the rule's reviews (`expire_for_rule`): rule before review, as the
edit takes them.
```

Add:

```python
GONE = "Its campaign was archived or deleted."


def create_campaign_review(rule, run, record_ids, action, reach):
    """The night's campaign, waiting: the action frozen, the fired records,
    and who they would reach and skip now, as the owner sees them."""
    return RuleReview.objects.create(
        rule=rule,
        run=run,
        kind=RuleReview.Kind.CAMPAIGN,
        action=dict(action),
        records=[{"kind": rule.segment.kind, "id": pk} for pk in record_ids],
        counts={"reach": reach.reach, "skipped": reach.tally()},
    )


def send_campaign_review(review_id, *, actor, today, now, request=None):
    """Approves a waiting campaign review and sends the campaign to the
    review's records, as the rule's owner, through `campaigns.sending`.
    Returns `Answer(200, {"campaign_send_id"})` or `Answer(400, <refusal>)`,
    which is stored on the review while it stays waiting. Raises `Decided`
    once it is no longer waiting. The emails go out after the commit."""
    rule_id = RuleReview.objects.filter(pk=review_id).values_list("rule_id", flat=True).get()
    with transaction.atomic():
        # Lock order: rule, review, workspace, campaign (see the module docstring).
        list(
            Rule.objects.select_for_update(no_key=True)
            .filter(pk=rule_id)
            .values_list("pk", flat=True)
        )
        review = _locked(review_id)
        rule, action = review.rule, review.action
        if _changed_since(review):
            _expire(review, now=now, reason=CHANGED_REASON, actor=actor, request=request)
            return Answer(400, {"detail": RULE_CHANGED})
        campaign = Campaign.objects.select_related("segment").filter(pk=action["campaign"]).first()
        if campaign is None or campaign.status == Campaign.Status.ARCHIVED:
            return _refused(review, Refusal(400, {"detail": GONE}))
        if campaign.segment is None or any(
            item["kind"] != campaign.segment.kind for item in review.records
        ):
            return _refused(review, Refusal(400, {"detail": CHOOSE_CAMPAIGN}))
        refusal = before_claim(campaign)
        if refusal:
            return _refused(review, Refusal(400, refusal))
        try:
            with transaction.atomic():
                # SOC2:AUTH-02 the claim builds the audience as the campaign's owner,
                # from the fired records they may still open
                send = claim_campaign(
                    campaign.pk,
                    kind=CampaignSend.Kind.RULE,
                    by=actor,
                    rule=rule,
                    review=review,
                    records=[item["id"] for item in review.records],
                    today=today,
                    now=now,
                    request=request,
                )
        except Refusal as refusal:
            return _refused(review, refusal)
        review.status = RuleReview.Status.APPROVED
        review.decided_by, review.decided_at = actor, now
        review.result = {"campaign_send_id": send.pk}
        review.save(update_fields=["status", "decided_by", "decided_at", "result"])
        audit.record(  # SOC2:LOG-01
            "rule.review_approved",
            request=request,
            actor=actor,
            organisation=rule.organisation,
            target=review,
            metadata={
                "rule": rule.pk,
                "kind": review.kind,
                "campaign_send": send.pk,
                "without_review": False,
            },
        )
    deliver_campaign(send)
    return Answer(200, {"campaign_send_id": send.pk})
```

At the very top of `send_review`'s body add:

```python
kind = RuleReview.objects.filter(pk=review_id).values_list("kind", flat=True).first()
if kind == RuleReview.Kind.CAMPAIGN:
    return send_campaign_review(review_id, actor=actor, today=today, now=now, request=request)
```

`Refusal` here is Surveys' class, which `campaigns.sending` re-exports, so the existing `from services.surveys.sending import (… Refusal …)` import serves both.

- [ ] **Step 5: The night**

In `services/rules/nightly.py`:
- import `campaign_statuses` from `.actions` and `from services.campaigns.sending import deliver_pending`;
- `RulesResult` gains `campaign_sends: int = 0`;
- `Outcome`: replace `review_id: int | None = None` with `reviews: int = 0`;
- `_act(rule, run, records, kind, *, today, now)`: in the second loop add

```python
        elif action["action"] == "campaign" and records:
            try:
                with transaction.atomic():
                    found = campaign_statuses(
                        action, rule, run, records, kind, today=today, now=now
                    )
            except Exception as exc:  # noqa: BLE001 - the campaign's failure never stops the rest
                logger.warning("rule %s: campaign failed: %s", rule.pk, type(exc).__name__)
                found = {record.pk: failed("campaign", exc) for record in records}
            for pk, status in found.items():
                statuses[pk][index] = status
```

- `run_rule(rule_id, *, today, now=None)`: first line `now = now or timezone.now()`; change the lock condition to `if any(action["action"] in ("plan", "campaign") for action in rule.actions):` and its comment to "Lock order: rule, workspace, then the record locks of the lifecycle action, Plans' locks, and the campaign's. `start_plan` and `campaigns.sending.claim` take the workspace lock too; taking it here first keeps a record lock from coming before it."; pass `now=now` to `_act`; replace the `return Outcome(...)` with

```python
    made = RuleReview.objects.filter(run=run).count()
    return Outcome(ran=True, fired=run.fired, reviews=made)
```

- `evaluate_rules`: `outcome = run_rule(rule_id, today=today, now=now)` and `result.reviews += outcome.reviews`;
- `_finish_night`: after the `_unsent` loop add

```python
    finished, lost = deliver_pending(organisation, now=now)
    result.campaign_sends += finished
    result.failed += lost
```

- in the module docstring, step 4 becomes "run the internal actions … send the digests, make the survey's review, and the campaign's review or (without review) its claim;" and the paragraph after it gains: "Then every campaign send still `sending` that nobody is delivering is finished (`campaigns.sending.deliver_pending`): tonight's sends without review at once, and any other once it is 10 minutes old."

- [ ] **Step 6: The review's campaign in the Review Queue**

In `services/rules/payloads.py`, add `review_campaign_names` and replace `review_payload` entirely:

```python
def review_campaign_names(reviews):
    """`{campaign_id: name}` for the campaign reviews among `reviews`, one query."""
    ids = {r.action.get("campaign") for r in reviews if r.kind == RuleReview.Kind.CAMPAIGN}
    if not ids:
        return {}
    return dict(Campaign.objects.filter(pk__in=ids).values_list("pk", "name"))


def review_payload(review, campaigns=None):
    """A review as its owner reads it: the rule's sentence, the night, the
    frozen survey or campaign action, how many it reaches, and the
    workspace's name for the survey's preview. A campaign review also names
    its campaign (None once deleted). Records are counted, never named.
    Needs `rule__segment`, `rule__organisation` and `run` loaded."""
    rule, segment = review.rule, review.rule.segment
    body = {
        "id": review.pk,
        "kind": review.kind,
        "rule": {
            "id": rule.pk,
            "name": rule.name,
            "trigger": rule.trigger,
            "score": rule.score,
            "direction": rule.direction,
            "threshold": number(rule.threshold),
            "cadence": rule.cadence,
            "weekday": rule.weekday,
            "segment": None
            if segment is None
            else {"id": segment.pk, "name": segment.name, "kind": segment.kind},
        },
        "run_on": iso(review.run.run_on),
        "action": review.action,
        "counts": review.counts,
        "organisation_name": rule.organisation.name,
        "status": review.status,
        "result": review.result,
        "created_at": iso(review.created_at),
        "expires_at": iso(review.expires_at),
        "decided_at": iso(review.decided_at),
    }
    if review.kind == RuleReview.Kind.CAMPAIGN:
        names = review_campaign_names([review]) if campaigns is None else campaigns
        pk = review.action.get("campaign")
        body["campaign"] = {"id": pk, "name": names[pk]} if pk in names else None
    return body
```

In `services/rules/views.py`, `ReviewListView.get`:

```python
        reviews = list(reviews)
        names = review_campaign_names(reviews)
        return Response([review_payload(review, names) for review in reviews])
```

(import `review_campaign_names`). `ReviewSkipView` keeps `review_payload(review)`, which looks the name up itself.

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.rules services.campaigns services.surveys services.plans --parallel --noinput`
Expected: PASS.

Run: `venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add services/rules/actions.py services/rules/reviews.py services/rules/nightly.py \
  services/rules/payloads.py services/rules/views.py services/rules/tests/test_campaign_action.py
git commit -m "feat(rules): send a campaign at night, through the Review Queue or without review

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: End to end

Spec §2.6's journey, backend half: "build a campaign on a segment, preview it, send it, read the deliveries, unsubscribe through `/u/:token`, then send again and see that contact skipped as `unsubscribed`."

**Files:**
- Test: `e2e/test_campaigns_flow.py`

**Interfaces:**
- Consumes: every campaigns route from Tasks 4–8; `/auth/signup/`, `/auth/users/`, `/auth/login/`; `/customers/`, `/customers/<id>/contacts/`; `/segments/`, `/segments/<id>/members/<id>/`; `/contacts/<id>/`.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `e2e/test_campaigns_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Carl builds a campaign on his segment of one organisation, counts who it
reaches, previews it and sends it. Sam unsubscribes on the public link with
no sign-in. A new champion joins; the second send emails only her and shows
Sam skipped as unsubscribed. A sent campaign cannot be deleted. Alice
re-subscribes Sam on his contact page."""

import re

from django.core import mail
from django.test import LiveServerTestCase

from e2e.http import http_delete, http_get, http_patch, http_post

LINK = re.compile(r"/u/([A-Za-z0-9_-]+)$")


class CampaignsFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def test_full_flow(self):
        # 1. A workspace signs up; its admin adds Carl.
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
        self.created(
            "/auth/users/",
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            alice,
        )
        status, body = http_post(
            self.api("/auth/login/"), {"email": "carl@acme.io", "password": "csmpassword1"}
        )
        carl = body["access"]

        # 2. Carl's organisation, its champion and its finance manager, and a segment of it.
        pizza = self.created("/customers/", {"name": "Pizza Hut"}, carl)["id"]
        sam = self.created(
            f"/customers/{pizza}/contacts/",
            {"name": "Sam Pizza", "role": "champion", "email": "sam@pizza.io"},
            carl,
        )["id"]
        self.created(
            f"/customers/{pizza}/contacts/",
            {"name": "Fin Pizza", "role": "finance_manager", "email": "fin@pizza.io"},
            carl,
        )
        segment = self.created("/segments/", {"name": "Pizza", "kind": "customer"}, carl)["id"]
        status, body = http_patch(
            self.api(f"/segments/{segment}/members/{pizza}/"), {"state": "pinned"}, token=carl
        )
        self.assertEqual(status, 200, body)

        # 3. The campaign: champions and decision makers by default, so Sam.
        campaign = self.created(
            "/campaigns/",
            {
                "name": "Win-back",
                "segment": segment,
                "subject": "Hi {first_name}",
                "body": "We miss you at {organisation}. {sender_name}",
            },
            carl,
        )
        self.assertEqual(
            (campaign["status"], campaign["roles"]), ("draft", ["champion", "decision_maker"])
        )
        path = f"/campaigns/{campaign['id']}"
        status, body = http_get(self.api(f"{path}/audience/"), token=carl)
        self.assertEqual(
            (status, body["reach"], body["sample"]), (200, 1, [{"id": sam, "name": "Sam Pizza"}])
        )

        # 4. The preview, with a placeholder link; nothing is sent.
        status, body = http_post(self.api(f"{path}/preview/"), {}, token=carl)
        self.assertEqual((status, body["subject"]), (200, "Hi Sam"))
        self.assertTrue(
            body["body"].startswith("We miss you at Pizza Hut. Carl CSM\n\n—\nCarl CSM, Acme Inc\n")
        )
        self.assertTrue(body["body"].endswith("/u/preview"))
        self.assertEqual(mail.outbox, [])

        # 5. Send now; the send and its deliveries.
        status, first = http_post(self.api(f"{path}/sends/"), {}, token=carl)
        self.assertEqual(
            (status, first["status"], first["counts"]["sent"]), (201, "sent", 1), first
        )
        (message,) = mail.outbox
        self.assertEqual((message.to, message.subject), (["sam@pizza.io"], "Hi Sam"))
        status, body = http_get(self.api(f"{path}/sends/{first['id']}/deliveries/"), token=carl)
        self.assertEqual(
            [(row["contact"]["name"], row["status"]) for row in body["results"]],
            [("Sam Pizza", "sent")],
        )

        # 6. Sam unsubscribes on the public link, no sign-in.
        token = LINK.search(message.body).group(1)
        status, body = http_get(self.api(f"/campaigns/unsubscribe/{token}/"))
        self.assertEqual((status, body), (200, {"workspace": "Acme Inc"}))
        status, _ = http_post(self.api(f"/campaigns/unsubscribe/{token}/"), {})
        self.assertEqual(status, 204)
        status, body = http_get(self.api("/campaigns/unsubscribe/not-a-token/"))
        self.assertEqual((status, body), (404, {"detail": "This link has expired."}))

        # 7. A new champion; the second send emails only her, Sam is skipped as unsubscribed.
        self.created(
            f"/customers/{pizza}/contacts/",
            {"name": "Dee Pizza", "role": "champion", "email": "dee@pizza.io"},
            carl,
        )
        status, second = http_post(self.api(f"{path}/sends/"), {}, token=carl)
        self.assertEqual(status, 201, second)
        self.assertEqual([m.to for m in mail.outbox[1:]], [["dee@pizza.io"]])
        self.assertEqual(second["counts"]["skipped"]["unsubscribed"], 1)
        status, body = http_get(
            self.api(f"{path}/sends/{second['id']}/deliveries/?status=skipped"), token=carl
        )
        self.assertEqual(
            [(row["contact"]["name"], row["reason"]) for row in body["results"]],
            [("Sam Pizza", "unsubscribed")],
        )
        status, body = http_get(self.api(f"{path}/sends/"), token=carl)
        self.assertEqual([row["id"] for row in body["results"]], [second["id"], first["id"]])

        # 8. A sent campaign is archived, not deleted.
        status, body = http_delete(self.api(f"{path}/"), token=carl)
        self.assertEqual((status, body["code"]), (409, "CAMPAIGN_SENT"))
        status, body = http_patch(self.api(f"{path}/"), {"status": "archived"}, token=carl)
        self.assertEqual((status, body["status"]), (200, "archived"))

        # 9. Alice re-subscribes Sam on his contact page.
        status, body = http_get(self.api(f"/contacts/{sam}/"), token=alice)
        self.assertIsNotNone(body["campaigns_unsubscribed_at"])
        status, body = http_patch(
            self.api(f"/contacts/{sam}/"), {"campaigns_unsubscribed": False}, token=alice
        )
        self.assertEqual((status, body["campaigns_unsubscribed_at"]), (200, None))
```

- [ ] **Step 2: Run it**

Run: `venv/bin/python manage.py test e2e.test_campaigns_flow --noinput`
Expected: PASS.

- [ ] **Step 3: Run everything CI runs**

```bash
venv/bin/python manage.py test --parallel --noinput
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python scripts/ci_shard_labels.py --check 4
venv/bin/ruff check . && venv/bin/ruff format --check .
```
Expected:
- every test passes;
- `No changes detected`;
- the shard check prints four shards whose union is the full suite;
- ruff is clean.

- [ ] **Step 4: Commit**

```bash
git add e2e/test_campaigns_flow.py
git commit -m "test(e2e): build, preview and send a campaign, unsubscribe, send again

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The docs

Spec §1.10; skill `api-contracts`; the house rule that the product documents change in the same PR.

**Files:**
- Modify:
  - `docs/API_CONTRACTS.md`
  - `docs/audit-events.md`
  - `docs/data-classification.md`
  - `docs/product/01-prd.md`
  - `docs/product/02-trd.md`
  - `docs/product/05-backend-schema.md`
  - `docs/product/06-implementation-plan.md`

**Interfaces:**
- Consumes: the routes, bodies, events and models from Tasks 1–12, exactly as named there.
- Produces: nothing in code.

- [ ] **Step 1: `docs/API_CONTRACTS.md`**

1. In the status table, replace the `Campaigns (/campaigns)` row's last cell with: "🟢 Owned and shared like segments; sent to one of the owner's segments through Surveys' audience rules, plain text with three merge fields and a one-click unsubscribe link; once per campaign per person and one campaign email per person every 3 days; every send kept with its deliveries; and a rule's "Send a campaign", through the Review Queue unless without review. Synchronous (no task queue); no HTML, tracking or scheduling. See below."
2. In "Who sees what" point 4 (starts "**A Campaign and a Scenario are themselves tenant-wide**"), replace the whole point with: "4. **A Scenario is tenant-wide**, visible to every member: it has no owner field, so what is scoped is which customers it may act on. A Campaign has an owner and is shared like a segment (see `campaigns` below)."
3. Replace the whole `## \`campaigns\` — …` section, from its heading down to the line before `## \`copilot\``, with:

````markdown
## `campaigns` — Campaigns (`/campaigns`, the unsubscribe page `/u/:token`)

Rebuilt for the Impact section's fifth delivery (spec: react-ts-app `docs/superpowers/specs/2026-10-04-campaigns-design.md` §1, §4). A campaign is an owner's plain-text email to the people one of their own segments reaches, sent as often as they like, each send kept with what went out and who was emailed or skipped.

**Models.**
- `Campaign`: `owner`, `name` (≤ 120), `subject` (≤ 150), `body` (≤ 5000), `status` (`draft`/`active`/`archived`; `active` from the first send), `segment` (one of the owner's own; SET_NULL), `roles` (Champion and Decision Maker by default; `[]` for a contact segment), `sharing` with `shared_with` (≤ 50). At most 50 per owner, archived ones included. `recipients` is read-only history: the hand-picked contacts of a draft from before segments.
- `CampaignSend`: `kind` (`manual`/`rule`), `rule`, `review`, `sent_by` (null for a rule's send without review), `status` (`sending`/`sent`), `started_at`, `finished_at`, frozen `subject`, `body` and `counts` (`{reached, sent, skipped: {unsubscribed, no_email, already_received, recent_campaign, over_limit, failed}}`), `migrated` (built from a send before segments).
- `CampaignDelivery`: one person on one send: `status` (`queued`/`sent`/`skipped`), `reason`, `email` (the `customers.Email` row it filed), `token_hash` (SHA-256 of the unsubscribe token; the token is never stored), `sent_at`.
- `customers.Contact.campaigns_unsubscribed_at`; `customers.Email.campaign` (set on the row each delivery files on the contact's organisation or account, whose body is the email without its footer).

**Who it reaches.** Surveys' audience (`surveys.audience.candidates`), read as the campaign's owner: a contact segment's contacts, or an organisation or account segment's contacts with a ticked role. Each person is checked in order, first match wins: `unsubscribed`, `no_email`, `already_received` (queued or sent on any send of this campaign), `recent_campaign` (queued, or sent in the last 3 days, by any campaign of the workspace), `over_limit` (500 already queued). Then at most three per organisation or account, among those left; people past that are not reached.

**The send.** Refused before anything is written, `400 {"detail": …}`: "Email isn't set up for this workspace yet, so campaigns can't be sent.", "This campaign is archived.", "Choose a segment first.", "Write a subject and a body first.", then "Nobody in this segment can be emailed right now.". The claim locks the workspace, then the campaign, and writes the send and every delivery; each email then goes out on its own, with the merge fields filled (`{first_name}`, `{organisation}`, `{sender_name}`) and the footer `—\n<owner>, <workspace>\nUnsubscribe from these emails: <FRONTEND_URL>/u/<token>`. A failed email is `skipped`/`failed` and the rest go on. A send cut off mid-way stays `sending`; the nightly rules step and the admin's "Finish the selected sends" finish it 10 minutes on, never emailing anyone twice.

**Access.** Read by the owner and whoever it is shared with (anyone else gets a 404 identical to a missing campaign). Edit, preview, audience, send, archive and delete are the owner's: another reader gets `403 {"detail": "Only the campaign's owner can change it."}`. Hand-picked recipients and deliveries name only contacts the reader may open; the rest are `legacy_hidden` / `hidden`. A send's rule is named only to a reader of the rule (`{"id": null, "name": "a rule"}` otherwise). Counts are whole.

**Refusals.** `400 {field: [message]}` (`non_field_errors` for none): "Give it a name.", "Keep the name to 120 characters.", "Keep the subject to 150 characters.", "Keep the body to 5000 characters.", "Use {first_name}, {organisation} or {sender_name}.", "Choose one of your own segments.", "Choose at least one role.", "Choose at least one teammate.", "Share with at most 50 teammates.", "Choose archived or active.", "You can own at most 50 campaigns.".

### `GET /api/v1/campaigns/?tab=mine|shared&archived=1&cursor=`

`mine` by default; `archived=1` adds archived campaigns. Newest edit first, 50 a page; `next` is an opaque cursor.

```json
{"results": [{"id": 4, "name": "Win-back", "status": "active",
  "segment": {"id": 2, "name": "My book", "kind": "customer"},
  "roles": ["champion", "decision_maker"], "owner": {"id": 7, "name": "Carl CSM"},
  "is_owner": true, "sharing": "people", "shared_with": [{"id": 8, "name": "Dana CSM"}],
  "last_send": {"id": 9, "finished_at": "2026-10-04T10:00:00Z", "status": "sent",
                "counts": {"reached": 48, "sent": 42, "skipped": {"unsubscribed": 2, "no_email": 1,
                  "already_received": 0, "recent_campaign": 3, "over_limit": 0, "failed": 0}}},
  "needs_segment": false, "updated_at": "2026-10-04T10:00:00Z"}],
 "next": null}
```

`segment.id` is `null` for a reader who may not read the segment. `needs_segment` marks a draft from before segments that has hand-picked recipients and no segment.

### `POST /api/v1/campaigns/`

`{name, segment?, roles?, subject?, body?, sharing?, shared_with?}` → `201` with the campaign (below). Audited `campaign.created` (`{segment}`), and `campaign.shared` when not private.

### `GET/PATCH/DELETE /api/v1/campaigns/<id>/`

The row's fields plus `subject`, `body`, `legacy_recipients` (`[{id, name}]`, those the reader may open), `legacy_hidden` and `can_delete` (the owner, and never sent). PATCH takes the create fields and `status`: `archived` archives (`campaign.archived`); `active` un-archives, to `active` if it has sends, else `draft`. The edit is audited `campaign.updated` (`{fields}`), sharing `campaign.shared`. DELETE: `204` (`campaign.deleted`), or once sent `409 {"code": "CAMPAIGN_SENT", "detail": "Archive it instead: it has been sent."}`.

### `GET /api/v1/campaigns/<id>/audience/` (owner)

```json
{"reach": 212, "skipped": {"unsubscribed": 14, "no_email": 0, "already_received": 3,
  "recent_campaign": 9, "over_limit": 0, "failed": 0},
 "sample": [{"id": 31, "name": "Ann Lee"}]}
```

`sample` is the first 20 who would be emailed. `400 {"detail": "Choose a segment first."}` without a segment. Nothing is written.

### `POST /api/v1/campaigns/<id>/preview/` (owner)

`{contact?, subject?, body?}` → `{subject, body}`: the email as `contact` (default: the first who would be emailed) would read it, with unsaved `subject`/`body` when given (checked as a save), and the footer's link `<FRONTEND_URL>/u/preview`. `400 {"contact": ["Choose someone this campaign would email."]}`; `400 {"detail": …}` with no segment or nobody to email. Nothing is written.

### `GET/POST /api/v1/campaigns/<id>/sends/`

GET, any reader: newest first, 20 a page, `{results, next}`:

```json
{"id": 9, "kind": "rule", "status": "sent", "migrated": false, "sent_by": null,
 "rule": {"id": 3, "name": "Renewal watch"}, "started_at": "…", "finished_at": "…",
 "subject": "Hello {first_name}", "body": "…", "counts": {"reached": 48, "sent": 42, "skipped": {…}}}
```

POST, owner, no body: sends now and answers `201` with the finished send, or the refusals above. Audited `campaign.send_started` (`{send, kind, counts}`) and `campaign.send_finished` (`{send, counts}`).

### `GET /api/v1/campaigns/<id>/sends/<send_id>/`

One send, as above.

### `GET /api/v1/campaigns/<id>/sends/<send_id>/deliveries/?status=&reason=&cursor=`

The deliveries whose contact the reader may open, in send order, 50 a page:

```json
{"results": [{"id": 1, "status": "skipped", "reason": "unsubscribed",
  "contact": {"id": 31, "name": "Ann Lee"},
  "record": {"kind": "organization", "id": 5, "name": "Pizza Hut"}, "sent_at": null}],
 "next": null, "hidden": 2}
```

### `GET/POST /api/v1/campaigns/unsubscribe/<token>/` (public)

No sign-in; the token is the credential, looked up by its SHA-256, good for 365 days after its email. GET: `{"workspace": "Acme Inc"}`. POST: `204`; sets `Contact.campaigns_unsubscribed_at` once, audited `contact.campaigns_unsubscribed` (`{via: "link", send}`, no actor, never the token). Every bad link: `404 {"detail": "This link has expired."}`. Throttled per IP (`THROTTLE_CAMPAIGN_UNSUBSCRIBE`, default 30/min): `429`.
````

4. In the contacts section, under `### \`GET/PATCH/DELETE /api/v1/contacts/<id>/\``, add: "Every contact payload carries `campaigns_unsubscribed_at` (set by a campaign email's unsubscribe link). PATCH `{\"campaigns_unsubscribed\": false}` re-subscribes the contact, audited `contact.campaigns_resubscribed`; `true` is `400 {\"campaigns_unsubscribed\": [\"Only the person can unsubscribe, with the link in a campaign email.\"]}`."
5. In the `rules` section:
   - in the `RuleReview` model line, replace "one night's survey waiting for the owner." with "one night's survey or campaign waiting for the owner, `kind` `survey`/`campaign`, at most one of each per night." and its `counts`/`result` with "`counts` (`{people, records}` for a survey, `{reach, skipped}` for a campaign) … `result` (`{survey_send_id}`, `{campaign_send_id}` or `{error}`)";
   - add a row to the actions table after `plan`: "| `campaign` | `{\"action\": \"campaign\", \"campaign\": <id>, \"without_review\": false}`; one of the owner's own campaigns, not archived, whose segment is of the rule's kind (\"Choose one of your active campaigns for these records.\"); read back as `{\"campaign\": {\"id\", \"name\"} \| null}` and accepted either way | Once for the night's records, as the owner. With review: one campaign review (`queued` \"waiting for your review\"); approving claims and sends then, through every campaign rule. Without review: claimed in the night (`done` \"emailed\") and emailed once every rule has committed; the owner gets `campaign_sent`. Reaching nobody: `skipped` \"nobody it could reach\", no review, no send. A refusal: `failed` with its words, or \"its campaign can't be used\" |";
   - add `campaign_gone` ("Its campaign was archived or deleted.") to the `paused_reason` list;
   - in `POST /api/v1/rules/test/`, add: "and `campaigns: {would_email, skipped}` when the rule has a `campaign` action";
   - in `GET /api/v1/rules/<id>/runs/`, add `"reviews": [{"id": 2, "kind": "survey", "status": "waiting"}]` to the example and: "`review` is the night's survey review, else its campaign review; `reviews` lists both (`[]` for anyone but the owner)";
   - in `GET /api/v1/rules/reviews/`, add `"kind": "survey"` to the example and: "A campaign review carries `kind: \"campaign\"`, `campaign: {id, name} | null`, and `counts: {reach, skipped}`. Approving it answers `{\"campaign_send_id\"}`";
   - in the night's steps, after the line about surveys without review, add: "then every campaign send still `sending` that nobody is delivering is finished: tonight's sends without review at once, any other 10 minutes after it started. The owner's one `rule_review` notice per night covers both kinds (\"2 emails from your rules are waiting for your review.\")."

Run `venv/bin/ruff format docs/API_CONTRACTS.md` and check the diff is only your own lines.

- [ ] **Step 2: `docs/audit-events.md`**

Replace the four `campaign.*` rows with:

```markdown
| `campaign.created` | `services.campaigns.views.CampaignListCreateView.post` | user | Campaign ("Campaign <id>") | `segment` |
| `campaign.updated` | `services.campaigns.views.CampaignDetailView.patch` | user | Campaign | `fields`: changed field names, never values (`status` when un-archived); nothing when nothing changed |
| `campaign.shared` | `CampaignListCreateView.post`, `CampaignDetailView.patch` | user | Campaign | `sharing`, `shared_with` (user ids) |
| `campaign.archived` | `CampaignDetailView.patch` (`status: "archived"`) | user | Campaign | — |
| `campaign.deleted` | `CampaignDetailView.delete` (never sent only) | user | Campaign | — |
| `campaign.send_started` | `services.campaigns.sending.claim` (Send now, an approved review, a rule without review) | the sender or approver; — for a rule without review | Campaign | `send`, `kind`, `counts`; never an address |
| `campaign.send_finished` | `services.campaigns.sending.finish` | — | Campaign | `send`, `counts` |
| `contact.campaigns_unsubscribed` | `services.campaigns.public_views.UnsubscribeView` (POST) | — (public link; organisation is the campaign's) | Contact ("Contact <id>") | `via: "link"`, `send`; never the token |
| `contact.campaigns_resubscribed` | `services.customers.views.ContactDetailView.perform_update` | user | Contact ("Contact <id>") | — |
```

and add `kind` to the metadata of `rule.review_approved` (with `campaign_send` for a campaign review), `rule.review_skipped` and `rule.review_expired`.

- [ ] **Step 3: `docs/data-classification.md`**

Replace the `campaigns.Campaign` row with:

```markdown
| `campaigns.Campaign`, `campaigns.CampaignSend`, `campaigns.CampaignDelivery` | confidential | deliveries name contacts; `recipients` (hand-picked before segments) | subject and body are business content the owner writes, frozen per send; who was emailed or skipped and why, per contact, read per reader over who they may open (AUTH-02), the rest a count; `CampaignDelivery.token_hash` is a SHA-256 of an unsubscribe secret (**restricted**), and the secret itself is never stored, logged or audited |
| `customers.Contact.campaigns_unsubscribed_at` | confidential | the contact | contact preference data: set only by the person's own unsubscribe link, cleared only by a person, both audited |
```

and add to the external-flows table, after the public survey link row:

```markdown
| Public unsubscribe link (`GET/POST /api/v1/campaigns/unsubscribe/<token>/`) ← the contact's browser | out: the workspace's name; in: nothing | confidential | no sign-in; looked up by hash; 365 days; one 404 body for every bad link; 30 requests a minute per IP (AUTH-06); audited `contact.campaigns_unsubscribed` without the token |
| Campaign email (`services.email.send_campaign_email`) → a contact | the owner's subject and body with merge fields, the owner's and workspace's names, an unsubscribe link | confidential | plain text, one per person, logged by delivery id and exception class only |
```

In the log-store row (starts "Container stdout → log store"), after the sentence about the survey link's token, add: "It scrubs a campaign unsubscribe link's token the same way (`/campaigns/unsubscribe/<token>/` → `/campaigns/unsubscribe/[REDACTED]/`)."

- [ ] **Step 4: Product documents**

- `docs/product/01-prd.md`, the Campaigns row: "| Campaigns | Built (backend) | An owner's plain-text email to one of their segments (Surveys' audience: roles ticked, three per organisation or account, only people the owner may open), with `{first_name}`, `{organisation}`, `{sender_name}`, a fixed footer and a one-click unsubscribe; a person gets a campaign once and at most one campaign email every 3 days; every send kept with who was emailed or skipped and why; shared like segments, owner-only to change or send; a rule's "Send a campaign" waits in the Review Queue unless sent without review. No HTML, tracking, scheduling or A/B tests |". In the Rules row, add "send a campaign" to the actions and "campaigns" next to "surveys wait in the owner's review".
- `docs/product/02-trd.md`, the synchronous-work paragraph: "… and survey and campaign sends all execute synchronously in the request; a campaign send cut off mid-way is finished by the nightly rules step 10 minutes on (`campaigns.sending.deliver_pending`), never emailing anyone twice."
- `docs/product/05-backend-schema.md`, section 9: replace the `Campaign` row with three rows: "`Campaign` | An owner's plain-text email to one of their segments: subject, body, segment, roles, sharing; draft, active or archived; `recipients` is read-only history" / "`CampaignSend` | One send: manual or from a rule (and its review), who sent it, frozen subject, body and counts" / "`CampaignDelivery` | One person on one send: queued, sent or skipped with a reason, the Email row it filed, the hash of its unsubscribe token"; and in the `customers` section's `Contact` row add "`campaigns_unsubscribed_at`"; in the `rules` section's `RuleReview` row add "`kind` (survey or campaign), one of each per night".
- `docs/product/06-implementation-plan.md`, after C10:

```markdown
### C11. Campaigns

Rebuilt 2026-10-04 (backend, `services/campaigns`; spec: react-ts-app
`docs/superpowers/specs/2026-10-04-campaigns-design.md`): owned and shared
campaigns on a segment, sends with deliveries, the unsubscribe link,
existing campaigns migrated, and the rules' "Send a campaign" through the
Review Queue. Production still has no SMTP credentials, so sends there are
refused until `EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` are set. The
`/campaigns` pages, `/u/:token` and the rule builder's card are the
frontend PR.
```

Run `venv/bin/ruff format docs/` and `venv/bin/ruff format --check .`.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(campaigns): contracts, audit events, classification and product docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage** (backend scope: §0, §1, §4):

| Spec | Where |
|---|---|
| §1.1 `Campaign` fields (owner, sharing, segment, roles, statuses, limits), `recipients` read-only | Task 1 (model), Task 5 (writes, limit), Task 9 (owner required, lengths) |
| §1.1 `CampaignSend`, `CampaignDelivery`, constraint, index | Task 1 |
| §1.1 `Contact.campaigns_unsubscribed_at` | Task 1 |
| §1.2 migration of existing campaigns, reversible, second migration drops `send_log`/`sent_at` | Task 9 |
| §1.3 audience as the owner, `records`, the five skips in order | Task 2 |
| §1.4 refusals before the claim (`EMAIL_NOT_SET_UP` in `validation.py`, archived, no segment) | Task 3 (copy), Task 6 (`before_claim`, `claim`) |
| §1.4 claim: workspace then campaign `no_key`, deliveries, frozen counts, `active` | Task 6 |
| §1.4 delivery outside transactions, token hash, Email row, failure → `failed`, class name only | Task 6 |
| §1.4 crash: stays `sending`, `deliver` re-runnable, night and admin finish after 10 minutes | Task 6 (`resume`, `deliver_pending`), Task 9 (admin), Task 12 (night) |
| §1.5 merge fields, refusal at save, plain text, footer, link, preview | Task 3, Task 5 (save), Task 7 (preview) |
| §1.6 unsubscribe GET/POST, idempotent, audited, 365 days, throttled; re-subscribe on PATCH contacts | Task 8 |
| §1.7 read/owner-only/403/404, `pk__in` sharing, delete 409, deliveries twice filtered, counts whole | Tasks 4, 5, 7 |
| §1.8 action, validation, night records, with/without review, nobody, `campaign_gone`, results, dry run | Tasks 11, 12 |
| §1.8 `RuleReview.kind`, `run` FK unique `(run, kind)`, Review Queue both kinds, one notice | Task 10 (model, reads, notice), Task 12 (campaign reviews) |
| §1.9/§4 every route and shape; old `send/` removed | Tasks 4, 5, 7, 8; contract notes for every deviation |
| §1.10 `campaign_sent`; audit events; logs; data classification; docs | Task 1 (kind), Task 6 (notice), Tasks 5, 6, 8, 10, 12 (audit), Task 14 |
| §2.6 the journey (backend half) | Task 13 |

**Placeholder scan:** no "TBD", "TODO", "similar to", or code steps without code. Every test and implementation is written out; doc text is given verbatim except the anchored one-line edits in Task 14, whose words are given.

**Type consistency, checked across tasks:**
- `build(campaign, *, today, now, records=None) -> Reach` (Task 2) is called by `claim` (Task 6), the audience and preview views (Task 7), `campaign_preview` (Task 11) and `campaign_statuses` (Task 12); `Reach.queued`, `.skipped`, `.reach`, `.tally()`, `.counts()`, `.payload()` are used with those names.
- `claim(campaign_id, *, kind, by, rule=None, review=None, records=None, today, now, request=None)` (Task 6) is called by `CampaignSendsView.post` (Task 7), `campaign_statuses` and `send_campaign_review` (Task 12); `Refusal(status, body)` is Surveys' class throughout.
- `deliver(send)`, `finish(send, *, now)`, `resume(send, *, now)`, `deliver_pending(organisation=None, *, now) -> (finished, failed)` (Task 6) are used by Tasks 7, 9 and 12 with those keywords.
- `compose(source, contact, *, sender_name, workspace, url)`, `render(source, contact, *, sender_name)`, `link(token)`, `PREVIEW_TOKEN` (Task 3) are used by Tasks 6 and 7.
- `get_readable`, `get_owned`, `owned_segment -> Segment | None` (Task 4) are used by Tasks 5 and 7.
- `campaign_payload`, `send_payload(send, viewer, readable=None)`, `list_page`, `sends_page`, `deliveries_page` (Task 4) back every campaigns response.
- `audit.record(verb, campaign, *, request=None, actor=None, metadata=None)` (Task 5) is used by Tasks 5 and 6.
- `RuleReview.Kind`, `reviews_of`, `review_of`, `waiting_message(surveys, campaigns=0)` (Task 10) are used by Task 12; `review_payload(review, campaigns=None)` gains `kind` in Task 10 and `campaign` in Task 12.
- URL names: `campaign-list`, `campaign-detail`, `campaign-audience`, `campaign-preview`, `campaign-sends`, `campaign-send-detail`, `campaign-send-deliveries`, `campaign-unsubscribe`.
- Test helpers `make_campaign(*, owner=None, segment=None, **fields)`, `make_send(campaign, people=(), *, at=None, status="sent", kind="manual", **fields)`, `api`, `events`, `notes`, `mail_to` (Task 1) are used with those names throughout; `CampaignActionFixture.action(campaign=None, without_review=False)`, `night`, `records` (Task 11) by Task 12.

## Spec gaps and conflicts found while planning

1. **`audience.resolve` cannot be called as it is.** It applies Surveys' own 30-day quiet period (any `SurveyInvite`), which the spec says campaigns must not share ("Surveys keep their own 30-day rule"). This plan splits Surveys' candidate step out as `surveys.audience.candidates` (no behaviour change for Surveys) and both features call it (Task 2).
2. **Cap before or after the skips.** §1.3 lists the skips after "reachable" people, while Surveys (whose rules the spec adopts "exactly") applies the three-per-record cap after its skips. This plan follows Surveys (decision 3, contract note 5).
3. **The spec's `claim(campaign, …)` takes a campaign; the real Surveys `claim` takes an id and re-reads it under the lock.** This plan takes `campaign_id` (Task 6), so the row is always read under its lock.
4. **Approving a campaign review needs the rule's lock first.** The send's foreign key to `rules.Rule` takes `FOR KEY SHARE` on the rule's row, while a rule edit holds that row and then expires its reviews; approving review-first would deadlock against it. This plan locks rule → review → workspace → campaign (Global Constraints).
5. **Live preview needs unsaved text** that §4's `{contact?}` body does not carry (contract note 3).
6. **The `Email` row would have held the unsubscribe token** if it stored the emailed body, against §1.6's "the token itself is never stored". It stores the body without the footer (contract note 22).
7. **"Queued" people and the two frequency rules.** §1.3 speaks of `sent` deliveries; §1.4 says queued people "are never claimed by another send". This plan counts `queued` as "has it" for both rules (decision 4).
8. **`RuleReview.run` as a foreign key breaks `run.review`**, which the rules payloads read; the runs row keeps `review` and gains `reviews` (contract note 19). Reversing the migration works only while no night holds two reviews.
9. **The night's result for a send without review** is decided when the night claims, before any email goes out (contract note 17); per-person failures show on the deliveries.
10. **No owner for a workspace with no users** (decision 1): its campaigns are deleted by the migration.
11. **The contact PATCH answers the whole contact payload**, not a dedicated shape (contract note 1); `true` is refused.
12. **The unsubscribe token in request logs.** The spec says tokens are secrets; Surveys' token path is redacted by `RedactFilter`, so this plan redacts `/campaigns/unsubscribe/<token>/` the same way (Task 8).

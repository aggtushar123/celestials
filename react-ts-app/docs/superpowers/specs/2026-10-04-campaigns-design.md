# Campaigns: owned, segment-targeted email

Agreed with the owner on 2026-10-04. This is delivery 5 of the Impact section; see
`2026-10-03-segments-design.md` §0 for the who → when → what loop. Segments
decide who and rules decide when. Surveys were the first customer-facing
"what" and plans the internal one. Campaigns are the second customer-facing
"what".

## 0. Why, and what exists

- `services/campaigns`:
  - `Campaign` belongs to the whole workspace, with no owner or creator, so
    any member can edit or send any campaign.
  - Its fields are `name`, `subject`, `body`, `status`
    (`draft`/`sending`/`sent`), `recipients` (a many-to-many to `Contact`),
    `send_log` (JSON), `sent_at`, `created_at` and `updated_at`.
  - Recipients are contacts picked by hand. Since delivery 0 (#81/#99), only
    contacts the editor may open can be added.
  - `POST campaigns/:id/send/` sends synchronously, inside the request, one
    recipient at a time, through `send_campaign_email`. It files an `Email`
    row (`campaign` FK) on the contact's organisation or account.
  - A claim (`draft → sending → sent`) stops a double send.
  - A sent campaign is locked.
- Frontend:
  - `src/pages/campaigns` (`CampaignsList`, `CampaignEditor`,
    `RecipientPicker`, `campaignApi.ts`, `types.ts`).
- Nothing in the app has unsubscribe or opt-out.
- Surveys (`services/surveys`) already provide the pieces campaigns reuse:
  - `audience.resolve(segment, roles, viewer, *, today, now=None,
    records=None)` turns a segment into reachable people: contacts for
    contact segments, and contacts by ticked role (at most 3 per record) for
    organisation and account segments.
  - The send claim under the workspace lock.
  - The `EMAIL_NOT_SET_UP` refusal when SMTP is missing.
  - The hosted, token-only public page pattern (`/s/:token`).
- Rules (`services/rules`) has a survey action that waits in the Review
  Queue (`RuleReview`). `RuleReview.run` is a one-to-one, so a rule night can
  hold only one review today.
- Production has no SMTP credentials yet. Sends there are refused with the
  same message as Surveys until `EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` are
  set.

## Decisions (agreed 2026-10-04)

| Topic | Decision |
|---|---|
| Audience | One of the owner's segments, using the Surveys audience rules exactly: contact segments email those contacts; organisation and account segments reach their contacts by ticked roles, at most 3 per record. Picking recipients by hand is removed. |
| Opt-out | Every campaign email carries a one-click unsubscribe link to a token-only public page. The contact is marked unsubscribed from campaigns, and later sends skip them and say so. Only a person can re-subscribe a contact, by hand, and that is audited. Surveys are unaffected. |
| Existing campaigns | Each one's owner becomes its workspace's owner, or the first active admin. Sent campaigns stay as history. Drafts keep their hand-picked recipients as read-only history and can't be sent until the owner picks a segment. |
| Content | Plain-text subject and body, with the merge fields `{first_name}`, `{organisation}` and `{sender_name}`. A fixed footer is added with the sender, the workspace and the unsubscribe line. The editor shows a live preview for a real recipient. No HTML and no tracking. |
| Rules | Campaigns can be reused. Each send is its own record. A manual Send now sends to the whole segment. The rule action "Send a campaign" sends to the records the rule fired on, and waits in the Review Queue unless the rule says "send without review". |
| Frequency | A contact gets a given campaign at most once, ever. A contact gets at most one campaign email from the workspace every 3 days. People skipped for either reason are counted and their reason is shown. Surveys keep their own 30-day rule. |
| Approach | Rebuild `services/campaigns` in place and call `services.surveys.audience.resolve` rather than copying it, so the two agree on who a segment reaches. |

## 1. Backend

### 1.1 Models (`services/campaigns`)

**`Campaign`** (changed)

- Added fields:
  - `owner` (FK, PROTECT).
  - `sharing` (`private`/`people`/`workspace`) and `shared_with`
    (many-to-many to users), as on `segments.Segment`.
  - `segment` (FK `segments.Segment`, SET_NULL, null).
  - `roles`: a JSON list of contact roles, used for organisation and
    account segments. The choices and defaults match Surveys' `RoleFields`:
    Champion and Decision Maker are ticked by default.
- Changed fields:
  - `name` (≤120), `subject` (≤150) and `body` (≤5000).
  - `status`: `draft`, `active` or `archived`. A campaign becomes `active`
    on its first send. It can be sent again later, and it stays editable.
  - The old `sending` and `sent` statuses move to `CampaignSend` (§1.2).
- Removed after the migration: `send_log` and `sent_at`.
- `recipients` is kept read-only. It holds the hand-picked contacts of
  migrated drafts, shown as history. Nothing writes to it.
- `created_at` and `updated_at` are unchanged.
- Limit: an owner may own at most 50 campaigns. Archived campaigns count.

**`CampaignSend`** (new)

- `campaign` (FK, CASCADE) and `kind` (`manual` or `rule`).
- `rule` (FK `rules.Rule`, SET_NULL, null) and `review` (FK
  `rules.RuleReview`, SET_NULL, null).
- `sent_by`: the person who pressed Send now or approved the review; null
  for a send without review.
- `status`: `sending` or `sent`.
- `started_at` and `finished_at`.
- `subject` and `body`: frozen copies, so the history shows what went out.
- `counts` (JSON), frozen:
  `{reached, sent, skipped: {unsubscribed, already_received, recent_campaign, no_email, failed, over_limit}}`.
- `migrated` (bool). It marks a send built from an old `send_log`.

**`CampaignDelivery`** (new)

- `send` (FK, CASCADE) and `contact` (FK `customers.Contact`, CASCADE).
- `status`: `queued`, `sent` or `skipped`.
- `reason`: one of the skip reasons above, blank when sent.
- `email` (FK `customers.Email`, SET_NULL, null).
- `token_hash` (char 64, blank). It holds the hash of the unsubscribe token
  only; the token itself is never stored.
- `sent_at`.
- Constraint: unique (`send`, `contact`).
- Index: (`contact`, `sent_at`) for the 3-day gap.
- "Once per campaign" means there is no earlier `sent` delivery for that
  contact on any send of that campaign.

**`Contact.campaigns_unsubscribed_at`** (DateTime, null), in a migration on
`customers`.

### 1.2 Migration of existing campaigns

The data migration runs per workspace:

- Every existing campaign's `owner` becomes the workspace's owner
  (the `identity.OrganizationMembership` with `is_owner=True`); failing
  that, its first active admin.
- `sharing` becomes `private`.
- A campaign that was sent becomes `active` and gets one `CampaignSend`
  (`kind=manual`, `migrated=True`, `sent_by=null`):
  - its frozen `subject` and `body` come from the campaign;
  - `started_at` and `finished_at` come from `sent_at`;
  - each `send_log` entry becomes a `CampaignDelivery`, with `sent` or
    `skipped` and reason `failed`, linked to the `Email` row
    (`Email.campaign`, matched by contact) where one exists;
  - the old free-text `detail` is dropped. It could hold exception text.
- A draft stays `draft` with `segment=null`. Its `recipients` are kept as
  read-only history.
- A campaign stuck at `sending` becomes `active`, with a send marked `sent`
  from whatever log it has.
- The migration can be reversed (the reverse is a no-op for sends). A second
  migration drops `send_log` and `sent_at`.

### 1.3 Audience and skips

Before a send:

- The audience is `audience.resolve(campaign.segment, campaign.roles, viewer=owner, today=…, records=…)`.
- It runs as the campaign's owner, so a campaign reaches only people its
  owner may open.
- `records` is passed only for a rule send.

Each reachable person is then checked in this order, and the first rule
that matches skips them with its reason:

1. `unsubscribed`: `campaigns_unsubscribed_at` is set.
2. `no_email`: the contact has no valid email.
3. `already_received`: they have a `sent` delivery on any send of this
   campaign.
4. `recent_campaign`: they have a `sent` delivery from any campaign of the
   workspace in the last 3 days.
5. `over_limit`: the send already has 500 people queued.

Everyone left is queued.

### 1.4 Sending

`services/campaigns/sending.py` exposes `claim(campaign, *, kind, by, rule=None, review=None, records=None, now, today)` and
`deliver(send)`.

- **Before the claim**:
  - With no SMTP configured, the send is refused with "Email isn't set up
    for this workspace yet, so campaigns can't be sent." (`EMAIL_NOT_SET_UP`
    in `validation.py`). Nothing is written.
  - Also refused: an archived campaign ("This campaign is archived."), a
    campaign without a segment ("Choose a segment first."), and a segment
    that no longer exists. The same refusals block a rule's approve.
- **The claim** takes one transaction:
  1. Lock the workspace `Organisation` with `no_key`, as in Surveys'
     `claim`, then lock the campaign with `no_key`.
  2. Resolve the audience and apply the skips (§1.3).
  3. Create the `CampaignSend` (`sending`) and its `CampaignDelivery` rows,
     queued or skipped.
  4. Freeze `counts`, `subject` and `body`, and set the campaign to
     `active`.

  The workspace lock makes the 3-day gap and "once per campaign" hold under
  concurrent sends.
- **Delivery** happens outside any transaction, one queued delivery at a
  time:
  1. Make a token and store its hash.
  2. Render the message (§1.5) and send it with `send_campaign_email`.
  3. In one short transaction, create the `Email` row (`campaign` FK, filed
     on the contact's organisation or account) and mark the delivery `sent`.

  A failure marks that delivery `skipped`, reason `failed`; the log keeps
  only the exception class. Other deliveries carry on.
- **The finish** sets `sent` and `finished_at` and recomputes `counts`.
- **A crash** leaves the send at `sending`. Its queued people stay queued and
  are never claimed by another send. `deliver(send)` is safe to run again:
  it carries on with the queued rows. The nightly rules step and the admin
  finish a `sending` send older than 10 minutes.

### 1.5 Message rendering

- `render(campaign_or_send, contact, sender)` fills in the merge fields:
  - `{first_name}`: the first word of the contact's name, or "there" when
    the name is empty.
  - `{organisation}`: the name of the contact's organisation, or of its
    account.
  - `{sender_name}`: the name of the campaign's owner.
- A field that isn't one of these three is refused when saving. On
  `subject` or `body` the refusal is "Use {first_name}, {organisation} or
  {sender_name}."
- The rendered message is plain text and nothing is escaped into HTML. The
  footer is appended:

  `—\n{sender_name}, {workspace name}\nUnsubscribe from these emails: {link}`

- The link is `<FRONTEND_URL>/u/<token>`.
- `POST campaigns/:id/preview/ {contact?}` returns `{subject, body}` for
  one person in the audience. The default is the first queued person. The
  footer link is a placeholder, and nothing is written.

### 1.6 Unsubscribe

- `GET campaigns/unsubscribe/<token>/` is public and throttled, like
  Surveys' public routes. It returns `{workspace}` for a link that is valid,
  and 404 for any bad link.
- `POST` on the same path records the opt-out:
  - it sets `campaigns_unsubscribed_at` if it isn't already set;
  - it is idempotent and returns 204;
  - it is audited as `contact.campaigns_unsubscribed`, with
    `actor=null, via="link"`.
- A token works for 365 days. An already-unsubscribed contact gets 204.
- Re-subscribing is `PATCH contacts/:id/ {campaigns_unsubscribed: false}`:
  - allowed for anyone who can open the contact;
  - audited as `contact.campaigns_resubscribed`;
  - the contact payload gains `campaigns_unsubscribed_at`.

### 1.7 Permissions and visibility (SOC2:AUTH-02)

- **Reading a campaign:** its owner, and the people it is shared with.
  Sharing works as for segments: `pk__in` over the through table, never a
  join with `.distinct()`.
- **Owner only:** edit, preview, audience, send, archive and delete. Anyone
  else who can read the campaign gets 403 "Only the campaign's owner can
  change it." Anyone who can't read it gets 404.
- **Delete** is allowed only when the campaign has no sends; otherwise it
  is 409 "Archive it instead: it has been sent."
- **Deliveries** are filtered twice:
  - a reader sees only the deliveries for contacts they may open, plus
    `hidden` (the count of the rest);
  - `counts` stay whole, because they are numbers only.
- **Audience preview counts** are computed as the owner, who is the only
  one allowed to call it.

### 1.8 Rules: the "Send a campaign" action

- **The action** is `{action: "campaign", campaign: id, without_review: bool}`.
- **Validation:** the campaign must be one the rule's owner owns, not
  archived, and have a segment of the same record kind as the rule's
  segment. Otherwise the refusal is "Choose one of your active campaigns for
  these records." A rule still has 1–3 actions, each type at most once.
- **Night records:** the rule's fired records, translated into the
  campaign's audience through `records=`. Contacts come from the records
  themselves, or from their roles for organisation and account rules.
- **With review** (the default):
  - The night creates a `RuleReview` with `kind="campaign"`. It holds the
    fired records and the counts from a dry claim: reachable people and
    skips, with nothing written.
  - Approving it claims and sends to those records through §1.4, at
    approval time. Every skip rule applies then.
  - A Surveys-style refusal is stored on the review, which stays waiting.
  - Approve refuses when the campaign's record kind no longer matches.
  - The review expires after 7 days, or when the rule's segment or trigger
    changes.
- **Without review:** the night claims and delivers at once. There is one
  send per rule per night. A re-run of the night finishes a send that was
  cut off.
- **Reaching nobody:** a night that reaches nobody makes no review and no
  send. Each record's campaign result is `skipped`, "nobody it could reach",
  as Surveys does.
- **Campaign gone:** if the campaign is deleted or archived, the rule
  pauses with the new `campaign_gone` reason, "Its campaign was archived or
  deleted." This is checked where `segment_gone` and `template_gone` are.
- **Night results** for the campaign action:
  - `queued` with "waiting for your review";
  - `done` with "emailed";
  - `skipped` with "nobody it could reach";
  - `failed`.
- **Dry run:** `rules/test/` adds `campaigns: {would_email, skipped}` when
  the rule has this action.
- **`RuleReview` change** (a migration in `rules`):
  - Add `kind`: `survey` or `campaign`. Existing rows become `survey`.
  - Change `run` from one-to-one to a foreign key, unique on
    (`run`, `kind`), so a rule with both a survey and a campaign action can
    hold one review of each per night.
  - The Review Queue lists both kinds.
  - The owner gets one review notice per night, covering both kinds.

### 1.9 API (`/api/v1/`)

The binding shapes are in §4. Summary:

- `campaigns/`: list (tabs `mine` and `shared`, cursor) and create.
- `campaigns/:id/`: read, update and delete.
- `campaigns/:id/audience/` (GET).
- `campaigns/:id/preview/` (POST).
- `campaigns/:id/sends/`: GET lists the sends, POST sends now.
- `campaigns/:id/sends/:sid/` (GET).
- `campaigns/:id/sends/:sid/deliveries/` (GET; filter by `status` and
  `reason`; cursor).
- `campaigns/unsubscribe/<token>/` (GET and POST, public).
- `contacts/:id/`: `campaigns_unsubscribed_at` on reads, and
  `campaigns_unsubscribed: false` on writes.
- The old `campaigns/:id/send/` is removed. The frontend in this delivery
  stops using it.

### 1.10 Notifications, audit, docs

- **Notifications:**
  - New kind `campaign_sent`. It goes to the owner when a send without
    review finishes, with "Win-back emailed 42 people · 6 skipped."
  - Campaign reviews use the existing rule review notice.
- **Audit**, ids and counts only:
  - `campaign.created`, `campaign.updated`, `campaign.shared`,
    `campaign.archived`, `campaign.deleted`;
  - `campaign.send_started` (`{send, kind, counts}`) and
    `campaign.send_finished`;
  - `contact.campaigns_unsubscribed` and `contact.campaigns_resubscribed`;
  - `rule.review_*`, which gains `kind`.
- **Logs** carry ids and exception class names only, never addresses or
  bodies.
- **Data classification:**
  - campaign subject and body are business content written by the owner;
  - unsubscribe tokens are secrets, with only the hash stored;
  - `campaigns_unsubscribed_at` is contact preference data.
- **Docs:** API_CONTRACTS, audit-events, data-classification, PRD, TRD,
  schema and plan.

## 2. Frontend

### 2.1 `/campaigns`

- Tabs **Mine** and **Shared with me**, plus **New campaign**.
- Each row shows:
  - the name;
  - the segment, with its kind icon;
  - the owner;
  - a status pill: Draft, Active or Archived;
  - the last send: date, sent and skipped counts in mono, "Never sent", or
    for a migrated draft "Choose a segment to send".
- A **Show archived** toggle.
- States:
  - a skeleton while loading;
  - "No campaigns yet" with New campaign;
  - an error with Retry.
- Cursor paging with Show more.

### 2.2 Campaign editor modal

- **Routes:** `/campaigns/new` over the list and `/campaigns/:id/edit` over
  the campaign page. It uses `BuilderDialog`, and a scrim click keeps the
  draft.
- **Fields:**
  - the name;
  - a segment picker of your own segments, grouped by kind;
  - `RoleFields` for organisation and account segments (shared from Surveys);
  - the subject;
  - the body, with three merge-field chips that insert at the cursor;
  - sharing.

  The counters `0 of 150` and `0 of 5000` are in mono.
- **Preview pane:**
  - It shows the rendered email from `preview/` for one person, with a
    person picker drawn from the audience's first 20.
  - It updates 400 ms after typing stops, and only the latest answer wins.
  - It shows the footer and the unsubscribe line.
  - On phones it sits below the form.
- **Actions:**
  - **Save**.
  - **Send now…** opens a confirm step with a fresh server count from
    `audience/`, for example "Emails 212 people · Skips 14 unsubscribed ·
    9 emailed in the last 3 days · 3 already received it". It then posts to
    `sends/`.
- **Refusals:**
  - field refusals appear at their fields;
  - `EMAIL_NOT_SET_UP` appears at the Send button and keeps the campaign;
  - a refusal that belongs to no field takes focus.
- **Submitting** happens once.

### 2.3 Campaign page `/campaigns/:id`

- **Header:**
  - the name, segment, roles, owner and sharing;
  - for the owner: Edit, Send now…, Archive and Delete. Delete appears only
    when the campaign has never been sent.
  - Archived campaigns show a notice.
- **Sends list:**
  - one row per send: the date, "Sent by <name>" or "From rule <name>"
    (unlinked when the rule isn't readable), and the sent and skipped counts;
  - "Migrated" sends are marked;
  - a `sending` send shows "Sending…" and refreshes until it finishes.
- **Opening a send** shows its subject and body as sent, and its
  deliveries:
  - filters All / Sent / Skipped, with a reason select;
  - each row shows the contact (linked when the reader can open it), its
    organisation or account, the status and the reason in words;
  - "N more people you can't open" when some are hidden.
- **Migrated drafts** show their old recipients as read-only "Picked by
  hand before segments", and a "Choose a segment to send" call to action.

### 2.4 Unsubscribe page `/u/:token`

- Public, outside the signed-in guard and the app frame. It reads no store
  or session, and it is always light.
- A valid link shows "Stop emails from <workspace>?" with an **Unsubscribe**
  button. A button rather than an action on load means link scanners don't
  unsubscribe people.
- After the click it shows "You're unsubscribed. You won't get more of these
  emails."
- Every bad link gets one expired page. A throttled request gets its own
  copy.

### 2.5 Changes to existing pages

- **Contact page:** "Unsubscribed from campaigns on <date>" plus a
  **Re-subscribe** button with a confirm. It is shown to anyone who can
  open the contact.
- **Rules builder:**
  - A Send a campaign Then card. Its picker lists your active campaigns
    whose segment kind matches the rule's.
  - A **Send without review** switch.
  - The sentence reads "…then email <Campaign>" and adds "without review"
    when the switch is on.
- **Rule nights:** "Campaign: waiting for your review", "Campaign: emailed",
  "Campaign: nobody it could reach", "Campaign: failed (…)".
- **Paused notice:** handles `campaign_gone`.
- **Review Queue, From your rules:** reviews of kind `campaign` show the
  campaign name, "Would email N · M skipped", and the records, with Approve
  and Skip. Approve shows a stored refusal at its control.
- **Notifications:** `campaign_sent`, with an icon, linking to the campaign.
- **Removed:** `RecipientPicker`, and hand-picking recipients.

### 2.6 House rules and tests

- `revenact-design` §4 throughout:
  - tokens only, both themes, Lucide icons;
  - 44px touch targets and the 375/768/1024/1440 layouts;
  - type sizes 11/13/15/22;
  - numbers in DM Mono;
  - no card inside a card, and no colour-only meaning;
  - no em dashes in UI copy.
- Tests:
  - a Campaigns house-rules suite;
  - unit and page tests;
  - one e2e-style journey: build a campaign on a segment, preview it, send
    it, read the deliveries, unsubscribe through `/u/:token`, then send
    again and see that contact skipped as `unsubscribed`.

## 3. Out of scope

HTML email, open and click tracking, scheduled sends, A/B tests,
attachments, emailing people who aren't contacts, per-campaign footers, and
reminders.

## 4. API contract (binding for both plans)

```ts
type Sharing = 'private' | 'people' | 'workspace';
type CampaignStatus = 'draft' | 'active' | 'archived';
type SkipReason = 'unsubscribed' | 'no_email' | 'already_received' | 'recent_campaign' | 'over_limit' | 'failed';
type PersonRef = { id: number; name: string };
type SegmentRef = { id: number; name: string; kind: 'contact' | 'organization' | 'account' } | null;

type Counts = { reached: number; sent: number; skipped: Record<SkipReason, number> };

type CampaignRow = {
  id: number; name: string; status: CampaignStatus;
  segment: SegmentRef; roles: string[];
  owner: PersonRef; is_owner: boolean;
  sharing: Sharing; shared_with: PersonRef[];
  last_send: { id: number; finished_at: string | null; status: 'sending' | 'sent'; counts: Counts } | null;
  needs_segment: boolean;                 // migrated draft with no segment
  updated_at: string;
};
type Campaign = CampaignRow & {
  subject: string; body: string;
  legacy_recipients: { id: number; name: string }[];   // migrated drafts only; visible contacts only
  legacy_hidden: number;
  can_delete: boolean;                    // is_owner && no sends
};

type CampaignSend = {
  id: number; kind: 'manual' | 'rule'; status: 'sending' | 'sent'; migrated: boolean;
  sent_by: PersonRef | null;
  rule: { id: number | null; name: string } | null;   // id null when the reader can't read the rule ("a rule")
  started_at: string; finished_at: string | null;
  subject: string; body: string; counts: Counts;
};
type Delivery = {
  id: number; status: 'queued' | 'sent' | 'skipped'; reason: SkipReason | '';
  contact: { id: number; name: string };
  record: { kind: 'organization' | 'account'; id: number; name: string } | null;
  sent_at: string | null;
};
type Audience = { reach: number; skipped: Record<SkipReason, number>; sample: { id: number; name: string }[] };  // sample = first 20 reachable
```

| Method & path | Request | Response |
|---|---|---|
| `GET campaigns/` | `tab=mine\|shared`, `archived=1`, `cursor` | `{results: CampaignRow[], next: string \| null}` |
| `POST campaigns/` | `{name, segment?, roles?, subject?, body?, sharing?, shared_with?}` | 201 `Campaign` |
| `GET/PATCH/DELETE campaigns/:id/` | PATCH: same fields + `status: 'archived'\|'active'` (unarchive only back to active if it has sends, else draft) | `Campaign` / 204; DELETE with sends → 409 `{code: 'CAMPAIGN_SENT', detail: "Archive it instead: it has been sent."}` |
| `GET campaigns/:id/audience/` | owner only | `Audience` |
| `POST campaigns/:id/preview/` | `{contact?: id}` owner only | `{subject, body}` |
| `GET campaigns/:id/sends/` | `cursor` | `{results: CampaignSend[], next}` |
| `POST campaigns/:id/sends/` | none, owner only | 201 `CampaignSend`; 400 `{detail}` for EMAIL_NOT_SET_UP / archived / no segment / nobody reachable ("Nobody in this segment can be emailed right now.") |
| `GET campaigns/:id/sends/:sid/` | | `CampaignSend` |
| `GET campaigns/:id/sends/:sid/deliveries/` | `status`, `reason`, `cursor` | `{results: Delivery[], next, hidden: number}` |
| `GET campaigns/unsubscribe/:token/` | public | `{workspace: string}`; 404 bad link; 429 throttled |
| `POST campaigns/unsubscribe/:token/` | public | 204; 404; 429 |
| `PATCH contacts/:id/` | `{campaigns_unsubscribed: false}` | contact payload incl. `campaigns_unsubscribed_at: string \| null` |

Refusals: 400 `{field: [message]}` (`non_field_errors` when no field), 403
`{detail: "Only the campaign's owner can change it."}`, 404 for campaigns
the reader can't read.

Rules additions:
- **Action** written as `{action: 'campaign', campaign: id, without_review: boolean}`
  and read as `{action: 'campaign', campaign: {id, name} | null, without_review}`.
- **Paused reason** `campaign_gone`: "Its campaign was archived or deleted."
- **Night result** for `campaign`, one of:
  - `queued` "waiting for your review";
  - `done` "emailed";
  - `skipped` "nobody it could reach";
  - `failed` "<detail>".
- **Dry run** adds `campaigns: {would_email: number, skipped: number}`.
- **`RuleReview` payloads** gain `kind: 'survey' | 'campaign'`. A campaign
  review carries `campaign: {id, name} | null` and
  `counts: {reach, skipped: Record<SkipReason, number>}`.

Notifications: kind `campaign_sent`, `link` = `/campaigns/<id>`.

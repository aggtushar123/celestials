# Contacts: every call analysed, sentiment you can explain, and Ask

Owner decisions of 2026-09-28. House rules: `.claude/skills/revenact-design/SKILL.md` §1 and §4. The owner's standing rules apply: pages must be app-ready, must never look like a spreadsheet, and must not lose information. The twice-filter privacy rule (#67, #68 and #70) applies to every read.

## 0. Why

The owner wants every call on any organisation or account to carry a sentiment, each contact's sentiment to follow from the calls they were on, and the Contacts page to be tied to organisations and accounts. Today:

- A call is analysed only when it is hand-logged on the page (`calls.classify_call`), and only from its title and summary. Calls from connectors and older calls are analysed only by `classify_interactions`, which is not scheduled on the server, so many calls have no sentiment.
- A contact's sentiment (`contact_sentiment.recompute`) already comes from their analysed calls, emails and tickets. Calls count most, and recent ones count more. The weights are call 1.0, ticket 0.8 and email 0.6.
- The Contacts page is a paginated table with stat cards and a company filter, and there is a separate, minimal profile page.

## 1. Every call gets a sentiment (backend)

- **When a call is analysed.** A call is classified when it is created: hand-logged, logged from "+ Add", or synced by a connector. Every path that creates a call calls one shared helper. A failure never blocks the call being saved.
- **What the analysis reads.** In order: the transcript text (capped as today), then the summary, then the title. The classifier input for a call is built from the best text available.
- **Nothing to read.** A call whose only text is a generic title, and which has no summary or transcript, is marked as not analysable: `ai_classified_at` is set and sentiment stays empty, with a flag or state the UI can read as "Not enough to analyse". It is never guessed.
- **Nightly catch-up.** `classify_interactions` runs nightly on the server, with a per-run limit and scoped to calls, emails and tickets. It is added to the deploy's schedule in `revenact-infra`, next to `run_health_maintenance`. Spend is metered against the workspace's AI credits as today, and stops cleanly when the budget runs out.
- **Contact sentiment follows immediately.** Classifying a call recomputes everyone on it (`recompute_for_records`), which already happens.

## 2. Contact sentiment (backend)

- **The mix stays as it is** (owner decision): calls, then tickets, then emails, weighted by recency, with the same thresholds.
- **The breakdown.** `sentiment_evidence` already stores the score, the counts by kind and by label, and `latest_at`. It is served on the contact.
- **A person's history.** `GET /api/v1/contacts/<id>/history/` returns their calls newest first. Each call has sentiment or "not analysable", summary, AI classification, duration, host, organisation and account (id and name), and a link. The response also has their emails and tickets, with sentiment where analysed.
  - Every row follows its own record rule: `visible_emails` (the owner-only mail rule), ticket departments, and account visibility.
  - A contact the viewer cannot open is a 404.
  - This replaces or extends today's contact interactions endpoint. The plan confirms which.
- **The contacts list.** The existing list endpoint gains these filters: organisation (`customer`), `account`, `sentiment` and `role`, plus search. Each row carries its organisation and account (id and name), its sentiment, its evidence counts and `last_contacted_at`. A summary (counts by sentiment and decision makers) covers the whole filtered set. The query count is pinned.

## 3. The Contacts page (frontend)

The layout is a list and a profile panel (owner's choice A), like the Communications inbox.

- **Header:**
  - A summary line: "142 people · 38 decision makers · 120 active · 61% positive · 12 negative · +12.5% growth (30d)" (active and growth from backend PR #71's `summary.active` / `summary.growth_30d_pct`; growth left out when null).
  - Search and filters for organisation, account, sentiment and role, all kept in the URL.
  - "+ Add".
- **The list, on the left.** One item per person, never a table row. Each item shows:
  - initials, name and role
  - "Organisation › Account", or the organisation alone
  - sentiment in words, with its colour, and "n calls" beside it
  - last contacted

  The list pages or loads more at the end. It has designed empty, loading and error states.
- **The profile, on the right, for the selected person** (`/contacts/:id` selects them):
  - Name, role, email and phone links (sanitised), and "Organisation › Account". Each links to `/organizations/:id`, and the account link opens that account's chip.
  - **Sentiment and why.** For example: "Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep". There is a "Why this sentiment?" button (§4).
  - **Calls, newest first.** Each shows date, title, sentiment or "Not enough to analyse", the summary (expandable), the AI classification, the host and the organisation and account tag. Then emails and tickets.
  - Edit and Delete, using the existing flows.
- **Phones.** The list is full width, and choosing a person opens the profile as its own screen with a back link. Layouts for phone and desktop are rendered conditionally.
- **Removed.** The table, the stat cards (their figures move to the summary line) and the separate profile page, whose route now opens the panel.

## 4. Ask Revenact on Contacts (delivery 2)

Agreed with the owner on 2026-09-28. It is a new `contacts` Ask surface with two views, `list` and `person`: one row in `services/copilot/ask.py`, a `contacts` purpose in `usage.PURPOSES` and a `Skill` in `skills.py`. It is not a view of the `organizations` surface. A list question ("which negative decision makers haven't we spoken to in a month?") does not belong to one organisation, and the privacy tests stay the surface's own.

### 4.1 Context

The client sends ids and filter values only, never a name or any text.

- **List view:** `{surface: "contacts", view: "list", filters: {q, customer, account, sentiment, role}}`. The filters are parsed by the list endpoint's own code. An organisation or account the asker cannot open is a 400, worded the same whether it exists or not.
- **Person view:** `{surface: "contacts", view: "person", contact: <id>, focus?: "sentiment"}`. The contact is read again through `visible_children_q(asker)`. One the asker cannot open is a 400, worded the same whether it exists or not.
- **The chip** is always built by the server:
  - "Lukas Vermeer · Kraft Heinz" for a person (the organisation, or "Organisation › Account").
  - "Contacts" for the list, followed by each active filter's label ("Contacts · Negative · Decision Maker").
  - The same label tags the conversation in History.

### 4.2 Grounding

- **List view:**
  - The summary line (people, decision makers, active, % positive, negative), computed for the asker with the filters.
  - Then up to **50** people, in the list's own order: name, role, organisation › account, sentiment, n calls, last contacted, status.
  - The digest says "50 of N", so the model never claims to know a longer list whole.
  - Person rows come from the same queryset as the list endpoint, so a person on a hidden account never appears.
- **Person view:**
  - The profile: name, role, status, organisation › account, sentiment and last contacted.
  - Then their history from `build_history(contact, asker)`, each record under its own rule: mail by its mailbox's owner and their management chain (`visible_emails`), tickets by department (`visible_tickets`), calls by account.
  - The newest **20** of each kind go in, with summaries clipped as on the organisation page.
  - The digest says how many of each there are.
- **"Why this sentiment?"** follows the strict rule chosen for Copilot on 2026-09-27:
  - The stored sentiment is computed from all of the person's interactions, and the asker may not be able to read some of them.
  - The answer explains the sentiment only from the records the asker can read.
  - When the stored reading also draws on records they cannot read, it says so ("partly from records you can't open"). It never gives their count, dates or content.
  - `focus: "sentiment"` adds the per-record weights (kind × recency, `contact_sentiment.score`) for the readable records only.
- **Fencing:** all record text (subjects, summaries, ticket titles, names) is fenced as untrusted data, exactly like every Ask digest (`dashboard_system_prompt`).

### 4.3 Shared sessions

- A reply snapshots `customer_ids`. For the list view it also snapshots the account refs of every person in the digest. For the person view it snapshots `grounded_records`: the contact's organisation or account, and every call, email and ticket quoted.
- A mentioned-only reader sees the reply only if every snapshotted reference passes their own rules (`views._reply_readable_by`). Otherwise it is withheld, and a malformed snapshot is withheld too (fail closed, as in #70).

### 4.4 Frontend

- **Layout:**
  - `ContactsAskLayout` wraps the page in one `AskProvider` (`surface: contacts`) and fills `ContactsFrame`'s `rail` slot. The conversation survives opening people, filtering and going back.
  - The top bar gets the same pills as Organizations: New chat, History and ✦.
  - From `sm` up, the rail sits beside the page. It opens by default from `xl`; below that the person's own open or closed choice wins. With it open, two panes still fit beside it — the list narrowed to 18rem, and the profile — only from `xl`; between `md` and `xl` it collapses to one pane while the rail stays open.
  - Below `sm`, it opens as the existing `AskSheet`.
- **What the rail asks about** comes from the route:
  - `/contacts/:id` is the person view.
  - Otherwise it is the list view with the URL filters.
  - Changing person or filters moves the chip for the next question. Answers already given keep the chip they were asked under.
- **"Why this sentiment?":**
  - A quiet link under the profile's sentiment line (delivery 1 hid it).
  - It opens the rail with "Why is <first name>'s sentiment <word>?" typed in and not sent, with `focus: "sentiment"`.
  - The person presses send, so a click alone never spends credits.
- **History:** a conversation started on Contacts carries its server-built tag. Choosing it from History on another page returns to `/contacts/:id` (or `/contacts?<filters>`) with the conversation open, as the organisation page's handover does.
- **Empty rail:** the same empty state as the Dashboard and Organizations, with no suggested questions.
- **Errors:**
  - A person who cannot be opened (the 400) reads "You can't ask about this person here" and keeps the draft.
  - The credit budget uses its existing message.
  - A withheld shared reply shows as withheld.

### 4.5 Delivery

1. **A backend PR:**
   - the surface, the context serializer and the grounding
   - the snapshots
   - the purpose and the `Skill`
   - `docs/API_CONTRACTS.md` and the product documents
2. **A frontend PR** after it: the layout, the context from the route, "Why this sentiment?", History handover and the product documents.

Both are cut from `main` once delivery 1 (frontend #90) is merged.

## 5. Ties to the organisation page

- On the People tab, a person's name opens `/contacts/:id`.
- The Calls section shows every call's sentiment, or "Not enough to analyse".
- The contact profile links back to the organisation and, where relevant, to the account with its chip chosen.

## 6. Delivery

1. **Every call analysed, and the Contacts page.** A backend PR (§1, §2, and the schedule in `revenact-infra`), then a frontend PR (§3, §5).
2. **Ask on Contacts.** A backend PR, then a frontend PR (§4).

Each goes through subagent-driven development with a review per task, a final review, a controller browser check at 1440px and 375px in both themes, and the owner's go-ahead before merging. The backend merges and deploys before its frontend.

## 7. Testing

- **Backend.**
  - Classification on every create path, including connector sync, with the classifier stubbed.
  - Choosing the text: transcript, then summary, then title.
  - The "not analysable" state.
  - The nightly command's limit and budget stop.
  - Recompute on classify.
  - The history endpoint's privacy, using the "blind to one account" setup, the owner-only mail rule and ticket departments.
  - The list filters and summary, with a pinned query count.
  - Ask on Contacts (delivery 2):
    - The context serializer: the 400 reads the same for an existing and a missing id, and filters are parsed as the list endpoint parses them.
    - The list grounding: the 50-row cap and "50 of N", with people on hidden accounts absent.
    - The person grounding: the mail owner and chain rule, ticket departments, and "why" never counting a hidden record.
    - `grounded_records` snapshots, and fail-closed for mentioned-only readers.
    - An end-to-end send, reply and shared-reader flow, and a pinned query count.
- **Frontend.**
  - Unit tests for the list item, the profile and the call row.
  - Integration tests through the real store and router, with `fetch` stubbed in contract shapes.
  - A jsdom end-to-end test: filter by organisation, open a person, see their calls with sentiment, follow the link to the organisation.
  - The house-rules suite over the new files.
  - Ask on Contacts (delivery 2):
    - The layout below `sm` (the sheet), between `md` and `xl` (one pane while the rail is open), and at `xl` and up (two panes, the list narrowed to 18rem).
    - The context follows the route, between the list and a person.
    - "Why this sentiment?" types the question in without sending it.
    - History handover.
    - A jsdom end-to-end test of asking about a person.

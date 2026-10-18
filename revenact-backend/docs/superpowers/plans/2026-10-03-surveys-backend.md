# Surveys, backend (delivery 2 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `services/surveys` app that emails one scored question (NPS, CSAT or CES) to the people at a segment's organisations, accounts or contacts. Each person gets a one-time link to a public form. Their answer feeds the record's rolling 90-day score and one `customers.Survey` log row per send and record.

**Architecture:**
- `SurveySend` is one survey sent to one audience. `SurveyInvite` is one person asked once. Only the SHA-256 of a link's token is stored (`tokens.py`).
- `audience.resolve` is the one function behind the builder's count and the send itself. It reads the owner's segment members through `segments.evaluate.members_queryset`, then the contacts with a ticked role that the viewer may open, then the skips.
- The send follows `CampaignSendView`'s shape (`sending.py`):
  - a short claim transaction under `select_for_update` (`draft` → `sending`);
  - the delivery outside any transaction, one invite and one email per person, each failure isolated;
  - a short finish that freezes the counts.
- The public link (`public_views.py`) is `AllowAny` with no authentication and throttled per IP. It looks invites up by hash only and answers every bad link with one 404 body.
- An answer runs `scores.record_answer` in the same transaction. It recomputes the record's 90-day figure and upserts the log row. `run_health_maintenance` gains one step that refreshes records whose answers have just aged out.
- Reading (`summary.py`, `payloads.py`, `answers.py`) follows the twice-filtered rule. Rows name only people on records the reader may open. A shared reader's figures cover only those people.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL, `secrets`/`hashlib`, `django.core.mail` (locmem under test), `TestCase`/`APITestCase`/`APIClient`, `LiveServerTestCase` for e2e.

**Spec:** `react-ts-app/docs/superpowers/specs/2026-10-03-surveys-design.md`, agreed with the owner on 2026-10-03. This plan covers its backend half: §1 (the app), §3 (privacy), §4 "Backend" (testing) and §5 item 1 (the backend PR). §2 and §5 item 2 belong to the frontend plan.

**Branch:** `feat/surveys` (already checked out). Stay on it and do not push. **Merge order:** this backend PR merges and deploys **before** the frontend PR. Nothing here removes or changes a field in an existing response. `SurveySerializer` only gains a read-only `send_id`, and `/api/v1/surveys/<id>/` refuses edits and deletes only on rows a send wrote, which do not exist before this PR.

## Global Constraints

These are copied from the spec. Quoted text is verbatim.

- **Content.** "One scored question, chosen by type, plus an optional "Anything to add?" comment. NPS 0–10, CSAT 1–5, CES 1–7. The wording is the standard one for the type, with the organisation's name in it; the builder writes only the email subject and an optional intro line."
- **Audience.** "Any of the builder's segments. A contact segment sends to its contacts. An organisation or account segment sends to the contacts at each member, filtered by the roles the builder ticks, at most 3 per organisation or account."
- **Ordering.** People are "ordered by role in the order ticked, then name". Each person is "filtered through the viewer's own contact visibility (`visible_children_q`)".
- **Skips** are "counted and never named":
  - no email;
  - surveyed in the last **30 days**, meaning "a `SurveyInvite` for the contact created in the last 30 days, any status but `failed`";
  - over the per-record cap.
- **Review.** "A send started by hand is confirmed in the modal". There is no approval queue in this delivery.
- **Scores.** "An organisation's (and account's) score becomes a rolling 90-day figure over all live answers: NPS = % promoters (9–10) − % detractors (0–6); CSAT = % answering 4–5; CES = % answering 5–7."
  - NPS is stored as "round(% promoters − % detractors)".
  - The figure is computed "over `answered` invites with `answered_at` in the last 90 days".
  - "A record with no live answers keeps its current score."
  - "CES: the organisation only, as `Account` has no CES field; an account contact's CES answer scores its organisation."
- **Log rows.** "Upserts one `customers.Survey` log row per (send, record): `status = responded`, `score` = that send's figure for that record so far, `sent_at` / `responded_at`." They are linked by "a nullable FK `Survey.send` (migration in `customers`)".
  - The log keeps its existing ranges: NPS −100..100 and CSAT/CES 0..100.
- **Fatigue and expiry.** "A link works for 14 days and takes one answer. Anyone surveyed in the last 30 days, by any survey, is skipped. No reminder emails in this delivery."
- **Who builds.** "Anyone, on their own book: their own segments, and only people they may open. Sends are private or shared like segments."
- **Model limits.**
  - `name` ≤ 120, required. `subject` ≤ 120, required. `intro` ≤ 500, optional, plain text.
  - `comment` ≤ 2000. `failure` ≤ 200.
  - `shared_with` ≤ 50 active teammates.
  - `roles` must have at least 1 for organisation and account segments, and is ignored for contact segments.
  - `segment` is `SET_NULL`. `contact` is `SET_NULL` ("a deleted contact keeps the answer, unnamed").
- **Indexes.** "`(contact, created_at)` for the 30-day quiet period; `(customer, answered_at)` and `(account, answered_at)` for the 90-day figure."
- **Token.** "a fresh `secrets.token_urlsafe(32)`". "`token_hash` SHA-256 hex of the token, unique. The token itself is never stored." `expires_at` is "`sent_at + 14 days`" (see Decision 7).
- **Send.**
  - "Claim under `select_for_update`: `draft` → `sending` (a second request gets 409)."
  - "400 if it is empty or over **500 people**."
  - "one failure never stops the batch".
  - "Audit `survey.sent` with counts."
  - "Limit: 20 sends per owner per day (429 with a message)."
  - The link is `{FRONTEND_URL}/s/<token>`, sent through "a new `send_survey_email(invite, token)` in `services/email.py`".
  - `counts` is "`{audience, sent, failed, skipped_recent, skipped_no_email, skipped_cap}` frozen at send time".
- **Public link.**
  - `GET` returns `{survey_type, question, intro, organisation_name}`.
  - It answers with "**one** 404 body `{"detail": "This link has expired."}` for unknown, expired, answered or failed alike (no oracle)".
  - `POST {score, comment?}` returns 204.
  - "A second answer (race included, `select_for_update` on the invite) gets the same 404."
  - It is "`AllowAny`, `authentication_classes = []`, a new `SurveyLinkThrottle` (per IP, 30 requests a minute, built like `PasswordResetThrottle`)".
  - "Look-ups by `token_hash` only. Nothing about the person or other answers is returned. Audit `survey.answered` (invite id, never the token)."
- **Reading.**
  - Answers are "**only for contacts the viewer may open**, plus `hidden_count`".
  - The summary is "for the owner … every invite"; for anyone else, "only the invites whose contact the viewer may open".
  - "a send the viewer neither owns nor has shared with them is 404; a non-owner writing is 403".
  - "a sent send accepts only `name` and sharing".
- **Errors (§1.7).**

  | Case | Answer |
  |---|---|
  | Empty audience | 400 `{"segment": ["Nobody to send to."]}` |
  | > 500 people | 400 with the count |
  | Segment not the owner's | 403; unreadable 404 |
  | Organisation/account segment, no roles | 400 `{"roles": [...]}` |
  | Two sends at once | 409 |
  | 21st send today | 429 |
  | Email failure | invite `failed`, batch continues, `counts.failed` |

- **Privacy (§3).**
  - "The audience is resolved on the server from the owner's own view, at preview and again at send."
  - "Answers are read through the viewer's visibility; the rest are a count."
  - "The public link reveals the organisation's name and the question only."
  - "The comment is stored and shown as plain text (React escapes; the email is plain text)."
- **Nightly.** "The nightly `run_health_maintenance` also refreshes figures for records whose oldest live answer just aged past 90 days."
- **SOC 2 markers.** "Checks marked `# SOC2:AUTH-02`, audit calls `# SOC2:LOG-01`". The throttle is marked `# SOC2:AUTH-06`, as the auth throttles are.
- **Out of scope (§6):**
  - the approval queue and "send without review";
  - automatic sends;
  - reminder emails;
  - custom questions;
  - sending from a personal mailbox;
  - translations.

House rules (every task):

- Tests come in three tiers (skill `backend-testing`):
  - unit (`SimpleTestCase`/`TestCase`);
  - integration (`APIClient`);
  - e2e (`LiveServerTestCase` in `e2e/`).

  For privacy, use the segments fixture's Carl/Dana split and `blind_to_one_account` from `services/customers/tests/test_views.py`.
- Commands:
  - one module: `venv/bin/python manage.py test services.surveys.tests.test_<area> --noinput`;
  - the app: `venv/bin/python manage.py test services.surveys --noinput`;
  - the full suite: `venv/bin/python manage.py test --parallel --noinput`;
  - migrations: `venv/bin/python manage.py makemigrations --check --dry-run`;
  - the CI shard check: `venv/bin/python scripts/ci_shard_labels.py --check 4`.

  A new app's tests are found by Django's own discovery, so the shards pick them up with no change, provided `services/surveys/tests/__init__.py` exists.
- **The CI budget is tight** (about 27 minutes). Each new test class builds its data once with `setUpTestData`, uses a handful of rows, and never sleeps. Times are passed in (`now=`, `today=`), never waited for.
- `venv/bin/ruff check .` and `venv/bin/ruff format --check .` must pass (line length 100; rules E, F, I). Ruff also formats the Python fences inside Markdown, so run `venv/bin/ruff format <file.md>` on any doc you edit.
- Put `# SOC2:AUTH-02 <why>` on every access check and `# SOC2:LOG-01` on every `audit.record` call.
- Semgrep runs in CI. Return an opaque cursor string, never a built URL.
- `docs/API_CONTRACTS.md` changes in the same PR (skill `api-contracts`). So do these, all in Task 11:
  - the product docs (`docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`);
  - `docs/audit-events.md`;
  - `docs/data-classification.md`.
- Commits are conventional (`feat(surveys): …`, `test(e2e): …`, `docs(surveys): …`). Each ends with a blank line and `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.

## Decisions made while planning

The spec left these open. The owner may overrule any of them, and each is applied in the tasks below.

1. **`resolve`'s signature** is `resolve(segment, roles, viewer, *, today, now=None) -> Audience`, not `resolve(send, viewer, today)`. The builder's audience count (`POST /sends/audience/`) has no send yet. The send calls it with `send.segment, send.roles`.
2. **Who an organisation or account segment reaches.**
   - An organisation's people are its own contacts *and* the contacts on its accounts. Accounts are found through `Account.customers`, as a subquery, so there is no fan-out.
   - An account's people are its own contacts.
   - A contact segment's people are its members.
   - Every kind is narrowed to `visible_children_q(viewer)`, and a person is asked at most once per send.
3. **The cap** is "3 per record": each organisation and each account counts separately, keyed on the contact's own `customer`/`account`. It applies *after* the no-email and quiet-period skips, so a recently surveyed champion lets the next person in. Contact segments have no cap, because the builder chose those people one by one.
4. **Inactive contacts** (`Contact.Status.INACTIVE`) are left out of every kind. They are not counted as a skip; they are not people to ask.
5. **`hidden_count`** is the number of active contacts with a ticked role, on the member organisations' accounts, that the viewer may not open. It is 0 for account and contact segments. The spec's "segment members the viewer cannot open, as Segments" is always 0 here, because the builder must own the segment (see the spec gaps).
6. **`organisations`** in the audience count is the number of distinct records reached. Each organisation and each account counts once.
7. **`SurveySend.started_at`** is a new field. The claim sets it.
   - The daily limit counts the owner's sends with `started_at` since midnight UTC (the server's time zone); 20 or more gives 429.
   - Invites expire at `started_at + 14 days`. `sent_at` is set when the batch finishes, as the spec says. The link's life starts when it is mailed, not when the last email of the batch leaves.
8. **Order of the send's checks:**
   - owner (403/404);
   - then, inside the claim transaction, `sent`/`sending` (409);
   - daily limit (429);
   - no segment (400 `{"segment": ["Choose a segment."]}`);
   - segment not the sender's (403);
   - no roles (400);
   - empty or over 500 (400).

   A refusal rolls the claim back, so the send stays a draft. The owner's `User` row is locked first, so two sends at once queue for the daily count, as `segments.views._limit_reached` does.
9. **`organisation_name`** is the tenant workspace's name (`Organisation.name`): the company asking, not the customer being asked. The wording is fixed in `questions.py`:
   - NPS: "How likely are you to recommend {name} to a friend or colleague?"
   - CSAT: "How satisfied are you with {name}?"
   - CES: "How easy is it to get what you need from {name}?"
10. **Bands.**
    - NPS: detractors 0–6, passives 7–8, promoters 9–10.
    - CSAT: low 1–2, mid 3, high 4–5.
    - CES: low 1–3, mid 4, high 5–7.

    The answers filter `detractors` means the low band for every type.
11. **Rounding** is always half up (`Decimal.quantize`, `ROUND_HALF_UP`):
    - record CSAT/CES keep two decimals (their `DecimalField(5, 2)`);
    - record NPS is an integer;
    - the log row's `score` is an integer;
    - the tiles' `figure` and `rate` are integers.
12. **Organisation figures include their accounts' answers**, for all three types. An answer from an account contact scores the account (NPS, CSAT) and *every* organisation the account belongs to (`Account.customers` is many-to-many). The log row is upserted for each of those records.
13. **The log row's dates.** `sent_at` is the local date of the send's `sent_at`, or of `started_at` while it is still sending. `responded_at` is the local date of the latest answer.
14. **The nightly step** looks back 7 days past the 90-day edge (`AGED_LOOKBACK_DAYS = 7`), so a missed night is caught up; recomputing is idempotent. It runs after the pulse dots and before the segments step, because segment rules read `nps_score`/`csat_score`/`ces_percentage`. `--dry-run` skips it.
15. **Only a draft can be deleted.** Anything else is `409 {"detail": "Only a draft can be deleted; a sent survey's answers feed the scores."}`.
16. **After the claim**, PATCH accepts only `name`, `sharing` and `shared_with`. Any other field sent is `400 {"<field>": ["A sent survey can only be renamed or re-shared."]}`.
17. **Roles** are checked whenever a send has an organisation or account segment, at draft save too (`{"roles": ["Choose at least one role."]}`). They are de-duplicated in the order ticked, and cleared to `[]` for a contact segment. A draft may be saved with no segment.
18. **The segment in a payload** is `{"id", "name", "kind"}`. `id` is `null` for a reader who may not read the segment, so the frontend links to it only when it can open. `null` means the segment was deleted.
19. **The frozen `counts`** go to the owner only (`null` for anyone else). The audience was resolved from the owner's book. `summary` follows the spec's owner-versus-shared rule.
20. **Answers paging:**
    - 50 a page, newest first by `(answered_at, id)`;
    - an opaque base64 cursor; a malformed one reads as the first page;
    - an unknown `filter` reads as `all`.

    `/pending/` is unpaginated (a send has at most 500 people). It reports `status` as `pending`, `expired` (derived) or `failed`, and never the email address.
21. **An invite's visibility** is its own `customer`/`account`, copied from the contact at send time, through `visible_children_q`. That is the contact's own rule, and it still holds after the contact is deleted.
22. **Audit events** beyond the spec's `survey.sent` and `survey.answered`: `survey.created`, `survey.updated`, `survey.shared` and `survey.deleted`, mirroring segments (LOG-01 on every write). `survey.answered` has no actor. Its organisation is the send's workspace, and its metadata is `{"send": <id>}`.
23. **The throttle rate** lives in `AUTH_THROTTLE_RATES["survey_link"]`: env `THROTTLE_SURVEY_LINK`, default `30/min`, and `None` under test like the others. A token longer than 100 characters is a 404 without hashing.
24. **Email failures** keep `str(exc)[:200]` (or the exception's class name) on the invite. The log line carries the invite id and the exception class, never the address.
25. **`SurveySerializer`** gains a read-only `send_id`, so the "Logged scores" tab can mark rows a send wrote.
26. **The comment** is trimmed. Blank is allowed and stored as `""`.
27. **Deleting a user** deletes the sends they own (`CASCADE`), as segments do. Users are normally deactivated. The log rows survive (`Survey.send` is `SET_NULL`).
28. **Send-written log rows are read-only** (coordinator ruling on spec gap 5). A `customers.Survey` row with `send_id` set is read through the existing API but never edited or deleted there: PATCH/PUT on `/api/v1/surveys/<id>/` returns `400 {"detail": "This score comes from a sent survey and updates itself."}` and DELETE returns 409 with the same detail. Rows without a send are unchanged. Applied in Task 6.

## Reuse map

Each helper below was read in the current code before this plan relied on it.

| Need | Source | Use |
|---|---|---|
| Segment members for a viewer | `segments.evaluate.members_queryset(segment, user, *, today)` | `audience.resolve` |
| Segment read access | `segments.access.get_readable(user, pk)` (404), `readable_segments(user)` | `access.owned_segment`, `payloads.readable_segment_ids` |
| Contact/record visibility | `customers.scoping.visible_children_q(user, prefix="")` | audience, summary, list tallies, answers, pending |
| Hidden-account fixture | `customers.tests.test_views.blind_to_one_account(customer)` | audience tests |
| Segment test world | `segments.tests.fixtures.SegmentFixture` (Carl: Pizza Hut and Pizza EMEA; Dana: Taco Bell and Taco West; Alice the admin; Globex) | `surveys.tests.fixtures.SurveyFixture` |
| Survey types | `customers.models.Survey.SurveyType` (`nps`/`csat`/`ces`) | `SurveySend.survey_type` |
| Score fields | `Customer.nps_score` (int), `csat_score`, `ces_percentage` (`Decimal(5,2)`); `Account.nps_score`, `csat_score` (no CES) | `scores.SCORE_FIELD` |
| Claim pattern | `campaigns.views.CampaignSendView` (claim, deliver outside a transaction, finish) | `sending.py` |
| Owner row lock | `segments.views._limit_reached` | `sending.claim` |
| Email | `services/email.py` `send_mail`, `settings.FRONTEND_URL`, `DEFAULT_FROM_EMAIL` | `send_survey_email` |
| Throttle | `core.throttling._PerIPThrottle`, `PasswordResetThrottle`; `AUTH_THROTTLE_RATES` in `config/settings.py` | `SurveyLinkThrottle` |
| Throttle tests | `core/tests/test_throttling.py` (`mock.patch.object(<Throttle>, "rate", …)`, `cache.clear()`) | public tests |
| Audit | `core.audit.record(action, *, request, organisation, target, metadata)` | views, public view |
| Payload helpers | `organizations.rows.person`, `iso` | payloads, answers |
| Nightly pattern | `run_health_maintenance`'s `if not options["dry_run"]: try … except Exception: WARNING` steps | Task 9 |
| e2e HTTP | `e2e/http.py` `http_get`, `http_post`, `http_patch` | Task 10 |

## File Structure

| File | Responsibility |
|---|---|
| `services/surveys/__init__.py`, `apps.py` (new) | App config (`SurveysConfig`) |
| `services/surveys/models.py` (new) | `SurveySend`, `SurveyInvite`, and the limits `LINK_DAYS`, `QUIET_DAYS`, `WINDOW_DAYS`, `PER_RECORD_CAP`, `MAX_PEOPLE`, `DAILY_SENDS`, `MAX_SHARED` |
| `services/surveys/migrations/0001_initial.py` (new, generated) | The two tables |
| `services/customers/models.py` (modify), `migrations/0050_survey_send.py` (new, generated) | `Survey.send` and one log row per (send, record) |
| `services/surveys/tokens.py` (new) | `new_token`, `hash_token` |
| `services/surveys/questions.py` (new) | `NPS`/`CSAT`/`CES`, `SCALES`, `QUESTIONS`, `question_for`, `BANDS`, `LOW`, `HIGH`, `band_of` |
| `services/surveys/scores.py` (new) | Maths (`percent`, `whole`, `figure`, `bands`), then the writes (`SCORE_FIELD`, `records_for`, `answers_for`, `refresh`, `upsert_log`, `record_answer`) and `refresh_aged` |
| `services/surveys/audience.py` (new) | `Audience`, `resolve` |
| `services/surveys/access.py` (new) | `readable_sends`, `get_readable`, `get_owned`, `owned_segment`, `NOT_OWNER`, `NOT_SEGMENT_OWNER` |
| `services/surveys/serializers.py` (new) | `SendWriteSerializer`, `AudienceSerializer`, `AnswerSerializer`, `clean_roles`, messages |
| `services/surveys/summary.py` (new) | `rate`, `summary_invites`, `send_summary` |
| `services/surveys/payloads.py` (new) | `readable_segment_ids`, `segment_ref`, `invite_tallies`, `send_payload`, `list_rows` |
| `services/surveys/sending.py` (new) | `Refusal`, `claim`, `deliver`, `finish`, messages |
| `services/surveys/answers.py` (new) | `answers_page`, `pending_rows`, `encode_cursor`, `decode_cursor`, `PAGE_SIZE` |
| `services/surveys/views.py`, `urls.py` (new) | `/api/v1/surveys/sends/…` |
| `services/surveys/public_views.py`, `public_urls.py` (new) | `/api/v1/public/surveys/<token>/` |
| `services/email.py` (modify) | `send_survey_email` |
| `services/customers/serializers.py` (modify) | `SurveySerializer.send_id` |
| `services/customers/views.py` (modify) | `SurveyDetailView`: send-written log rows are read-only |
| `core/throttling.py`, `config/settings.py`, `config/urls.py`, `.soc2/config.yml` (modify) | Throttle, app registration, two mounts, public routes |
| `services/customers/management/commands/run_health_maintenance.py` (modify) | The nightly refresh step |
| `services/surveys/tests/` (new) | `__init__.py`, `fixtures.py`, `test_models.py`, `test_questions.py`, `test_audience.py`, `test_views.py`, `test_sending.py`, `test_scores.py`, `test_public.py`, `test_reading.py`, `test_nightly.py` |
| `e2e/test_surveys_flow.py` (new) | Build, send, answer on the public link, then the send page and the score |
| docs (modify) | `API_CONTRACTS.md`, `audit-events.md`, `data-classification.md`, `product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md` |

---

### Task 1: The app, `SurveySend`, `SurveyInvite`, tokens and `Survey.send`

Spec §1.1, §1.4 (tokens) and §1.5 step 3 (the FK).

**Files:**
- Create:
  - `services/surveys/__init__.py` (empty)
  - `services/surveys/apps.py`
  - `services/surveys/models.py`
  - `services/surveys/tokens.py`
  - `services/surveys/migrations/__init__.py` (empty)
  - `services/surveys/migrations/0001_initial.py` (generated)
- Modify:
  - `services/customers/models.py` (`Survey`: the `send` field and two constraints)
  - create `services/customers/migrations/0050_survey_send.py` (generated)
  - `config/settings.py` (`INSTALLED_APPS`)
- Test:
  - `services/surveys/tests/__init__.py` (empty)
  - `services/surveys/tests/fixtures.py`
  - `services/surveys/tests/test_models.py`

**Interfaces:**
- Consumes:
  - `segments.models.Segment`;
  - `segments.tests.fixtures.SegmentFixture` (`cls.org`, `admin`, `csm`, `other`, `stranger`, `other_org`, `pizza`, `taco`, `globex`, `emea`, `west`, `today`).
- Produces:
  - `SurveySend`:
    - `Status` (`DRAFT`, `SENDING`, `SENT`) and `Sharing` (`PRIVATE`, `WORKSPACE`, `PEOPLE`);
    - fields `organisation, owner, name, survey_type, subject, intro, segment, roles, status, sharing, shared_with, started_at, sent_at, counts, created_at, updated_at`;
    - related names `invites` and `log_rows`;
    - `str(send) == f"Survey send {pk}"`.
  - `SurveyInvite`:
    - `Status` (`PENDING`, `FAILED`, `ANSWERED`);
    - fields `send, contact, customer, account, email, token_hash, expires_at, status, failure, score, comment, answered_at, created_at`;
    - `str(invite) == f"Survey invite {pk}"`.
  - Constants: `LINK_DAYS = 14`, `QUIET_DAYS = 30`, `WINDOW_DAYS = 90`, `PER_RECORD_CAP = 3`, `MAX_PEOPLE = 500`, `DAILY_SENDS = 20`, `MAX_SHARED = 50`.
  - `tokens.new_token() -> tuple[str, str]` (token, hash) and `tokens.hash_token(token: str) -> str`.
  - `customers.models.Survey.send` (FK `surveys.SurveySend`, `SET_NULL`, `related_name="log_rows"`).
  - Test helpers:
    - `fixtures.contact(parent, name, role=CHAMPION, **fields) -> Contact`;
    - `CHAMPION`, `DECISION_MAKER`;
    - `SurveyFixture` (adds `cls.now` and the contacts `cls.ann` on Pizza Hut (champion), `cls.ben` on Pizza EMEA (decision maker), `cls.tia` on Taco Bell (champion) and `cls.tom` on Taco West (champion));
    - classmethods `pinned(kind, records, *, owner=None, **fields) -> Segment`, `make_send(*, owner=None, segment=None, **fields) -> SurveySend`, `make_invite(send, person, *, token=None, created_at=None, **fields) -> SurveyInvite` (sets `invite.token`) and `answered(send, person, score, *, days_ago=1, comment="") -> SurveyInvite`.

- [ ] **Step 1: Write the fixture and the failing tests**

Create `services/surveys/tests/__init__.py` (empty) and `services/surveys/tests/fixtures.py`:

```python
"""The surveys tests' shared world, built once per test class
(`setUpTestData`): the segments fixture's people and records, one contact on
each record, and helpers for segments, sends and invites."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Account, Contact
from services.segments.models import Segment
from services.segments.tests.fixtures import SegmentFixture
from services.surveys.models import LINK_DAYS, SurveyInvite, SurveySend
from services.surveys.tokens import hash_token, new_token

CHAMPION = Contact.Role.CHAMPION
DECISION_MAKER = Contact.Role.DECISION_MAKER


def contact(parent, name, role=CHAMPION, **fields):
    """A contact on an organisation or an account, `<name>@example.com`."""
    key = "account" if isinstance(parent, Account) else "customer"
    values = {"email": f"{name.lower()}@example.com", **fields}
    return Contact.objects.create(**{key: parent}, name=name, role=role, **values)


class SurveyFixture(SegmentFixture):
    """SegmentFixture's world: Alice (admin) sees everything; Carl owns Pizza
    Hut and Pizza EMEA; Dana owns Taco Bell and Taco West; neither CSM can
    open the other's. Plus one contact on each record: Ann (Pizza Hut,
    champion), Ben (Pizza EMEA, decision maker), Tia (Taco Bell, champion),
    Tom (Taco West, champion)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.now = timezone.now()
        cls.ann = contact(cls.pizza, "Ann")
        cls.ben = contact(cls.emea, "Ben", DECISION_MAKER)
        cls.tia = contact(cls.taco, "Tia")
        cls.tom = contact(cls.west, "Tom")

    @classmethod
    def pinned(cls, kind, records, *, owner=None, **fields):
        """A segment of exactly `records` (pins, no rules), owned by Carl
        unless `owner` says otherwise."""
        return Segment.objects.create(
            organisation=cls.org,
            owner=owner or cls.csm,
            name=fields.pop("name", "Renewal risk"),
            kind=kind,
            pinned_ids=[record.pk for record in records],
            **fields,
        )

    @classmethod
    def make_send(cls, *, owner=None, segment=None, **fields):
        values = {
            "name": "Q3 NPS",
            "survey_type": "nps",
            "subject": "A quick question",
            "roles": ["champion", "decision_maker"],
            **fields,
        }
        return SurveySend.objects.create(
            organisation=cls.org, owner=owner or cls.csm, segment=segment, **values
        )

    @classmethod
    def make_invite(cls, send, person, *, token=None, created_at=None, **fields):
        """An invite for `person` on their own record. `invite.token` holds
        the secret for the public-link tests; only its hash is stored."""
        token = token or new_token()[0]
        values = {"expires_at": cls.now + timedelta(days=LINK_DAYS), **fields}
        invite = SurveyInvite.objects.create(
            send=send,
            contact=person,
            customer_id=person.customer_id,
            account_id=person.account_id,
            email=person.email,
            token_hash=hash_token(token),
            **values,
        )
        if created_at is not None:
            SurveyInvite.objects.filter(pk=invite.pk).update(created_at=created_at)
            invite.created_at = created_at
        invite.token = token
        return invite

    @classmethod
    def answered(cls, send, person, score, *, days_ago=1, comment=""):
        return cls.make_invite(
            send,
            person,
            status=SurveyInvite.Status.ANSWERED,
            score=score,
            comment=comment,
            answered_at=cls.now - timedelta(days=days_ago),
        )
```

Create `services/surveys/tests/test_models.py`:

```python
"""The two survey tables, their constraints, the link token and the log
row's link back to its send."""

import hashlib

from django.db import IntegrityError, transaction
from django.test import SimpleTestCase

from services.customers.models import Survey
from services.surveys import models as limits
from services.surveys.models import SurveyInvite
from services.surveys.tests.fixtures import SurveyFixture
from services.surveys.tokens import hash_token, new_token


class SendModelTests(SurveyFixture):
    def test_a_new_send_is_a_private_draft(self):
        send = self.make_send()
        self.assertEqual(
            (send.status, send.sharing, send.counts, send.started_at, send.sent_at),
            ("draft", "private", {}, None, None),
        )
        self.assertEqual(str(send), f"Survey send {send.pk}")

    def test_the_limits_are_the_specs(self):
        self.assertEqual(
            (
                limits.LINK_DAYS,
                limits.QUIET_DAYS,
                limits.WINDOW_DAYS,
                limits.PER_RECORD_CAP,
                limits.MAX_PEOPLE,
                limits.DAILY_SENDS,
                limits.MAX_SHARED,
            ),
            (14, 30, 90, 3, 500, 20, 50),
        )

    def test_deleting_the_segment_keeps_the_send(self):
        segment = self.pinned("customer", [self.pizza])
        send = self.make_send(segment=segment)
        segment.delete()
        send.refresh_from_db()
        self.assertIsNone(send.segment)

    def test_deleting_a_send_deletes_its_invites(self):
        send = self.make_send()
        self.make_invite(send, self.ann)
        send.delete()
        self.assertFalse(SurveyInvite.objects.exists())


class InviteModelTests(SurveyFixture):
    def test_an_invite_belongs_to_exactly_one_record(self):
        send = self.make_send()
        for parents in ({}, {"customer": self.pizza, "account": self.emea}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                SurveyInvite.objects.create(
                    send=send,
                    email="x@example.com",
                    token_hash=hash_token(str(parents)),
                    expires_at=self.now,
                    **parents,
                )

    def test_the_token_hash_is_unique(self):
        send = self.make_send()
        self.make_invite(send, self.ann, token="same")
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_invite(send, self.ben, token="same")

    def test_a_score_is_0_to_10(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_invite(self.make_send(), self.ann, score=11)

    def test_an_answer_has_a_score_and_a_time(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_invite(self.make_send(), self.ann, status="answered")

    def test_a_deleted_contact_keeps_the_answer_unnamed(self):
        invite = self.answered(self.make_send(), self.ann, 9)
        self.ann.delete()
        invite.refresh_from_db()
        self.assertEqual((invite.contact, invite.customer, invite.score), (None, self.pizza, 9))
        self.assertEqual(str(invite), f"Survey invite {invite.pk}")


class SurveyLogLinkTests(SurveyFixture):
    def log_row(self, send, **parent):
        return Survey.objects.create(
            survey_type="nps", status="responded", score=40, sent_at=self.today, send=send, **parent
        )

    def test_a_log_row_keeps_its_score_when_its_send_goes(self):
        send = self.make_send()
        row = self.log_row(send, customer=self.pizza)
        send.delete()
        row.refresh_from_db()
        self.assertEqual((row.send, row.score), (None, 40))

    def test_one_log_row_per_send_and_record(self):
        send = self.make_send()
        self.log_row(send, customer=self.pizza)
        self.log_row(send, account=self.emea)
        self.log_row(send, customer=self.taco)
        for parent in ({"customer": self.pizza}, {"account": self.emea}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                self.log_row(send, **parent)

    def test_rows_logged_by_hand_are_not_limited(self):
        self.log_row(None, customer=self.pizza)
        self.log_row(None, customer=self.pizza)
        self.assertEqual(Survey.objects.filter(customer=self.pizza).count(), 2)


class TokenTests(SimpleTestCase):
    def test_a_token_is_32_random_bytes_url_safe_and_only_its_hash_is_kept(self):
        token, token_hash = new_token()
        self.assertGreaterEqual(len(token), 43)
        self.assertRegex(token, r"^[A-Za-z0-9_-]+$")
        self.assertEqual(token_hash, hashlib.sha256(token.encode()).hexdigest())
        self.assertEqual(len(token_hash), 64)

    def test_every_token_is_new(self):
        self.assertEqual(len({new_token()[0] for _ in range(20)}), 20)

    def test_the_hash_is_stable(self):
        self.assertEqual(hash_token("abc"), hashlib.sha256(b"abc").hexdigest())
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_models --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.surveys.models'`.

- [ ] **Step 3: Write the app, the tokens and the models**

`services/surveys/apps.py`:

```python
from django.apps import AppConfig


class SurveysConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.surveys"
    verbose_name = "Surveys"
```

`services/surveys/tokens.py`:

```python
"""The one-time link's secret: 32 random bytes, URL-safe. Only its SHA-256
is stored (`SurveyInvite.token_hash`) and links are looked up by that hash,
so the database never holds a working link (spec §1.1, §3)."""

import hashlib
import secrets


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_token():
    """(token, its hash). The token goes in the email and nowhere else."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)
```

`services/surveys/models.py`:

```python
"""Surveys: one scored question emailed to the people at a segment's
records, answered once through a one-time link.

Spec: react-ts-app docs/superpowers/specs/2026-10-03-surveys-design.md.
`SurveySend` is one survey sent to one audience; `SurveyInvite` is one
person asked once. The token in the link is never stored, only its SHA-256
(`tokens.py`). Answers feed the organisation's and account's NPS, CSAT and
CES as a rolling 90-day figure, and one `customers.Survey` log row per send
and record (`scores.py`).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation
from services.customers.models import Account, Contact, Customer, Survey

#: A link works for this many days after the send starts, and takes one answer.
LINK_DAYS = 14
#: Anyone asked in this many days, by any survey, is skipped.
QUIET_DAYS = 30
#: A record's score is the figure over its answers in this many days.
WINDOW_DAYS = 90
#: An organisation or account segment asks at most this many people per record.
PER_RECORD_CAP = 3
#: One send reaches at most this many people.
MAX_PEOPLE = 500
#: One owner may start at most this many sends a day.
DAILY_SENDS = 20
#: A send is shared by name with at most this many teammates.
MAX_SHARED = 50


class SurveySend(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"

    class Sharing(models.TextChoices):
        PRIVATE = "private", "Only me"
        WORKSPACE = "workspace", "Everyone in the workspace"
        PEOPLE = "people", "Chosen teammates"

    organisation = models.ForeignKey(
        Organisation, related_name="survey_sends", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="survey_sends", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=120)
    survey_type = models.CharField(max_length=8, choices=Survey.SurveyType.choices)
    subject = models.CharField(max_length=120)
    intro = models.CharField(max_length=500, blank=True, default="")
    segment = models.ForeignKey(
        "segments.Segment",
        related_name="survey_sends",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who it goes to. The send keeps its invites if the segment is deleted.",
    )
    roles = models.JSONField(
        default=list,
        blank=True,
        help_text="Contact.Role values, in the order ticked. Empty for a contact segment.",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    sharing = models.CharField(max_length=16, choices=Sharing.choices, default=Sharing.PRIVATE)
    shared_with = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="shared_survey_sends", blank=True
    )
    started_at = models.DateTimeField(
        null=True, blank=True, help_text="When the send was claimed; links expire from here."
    )
    sent_at = models.DateTimeField(null=True, blank=True, help_text="When the batch finished.")
    counts = models.JSONField(
        default=dict,
        blank=True,
        help_text="{audience, sent, failed, skipped_recent, skipped_no_email, skipped_cap}, "
        "frozen when the batch finishes.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["organisation", "sharing"]),
            models.Index(fields=["owner", "started_at"]),
        ]

    def __str__(self):
        # The name is the owner's own words; an audit row carries the id only.
        return f"Survey send {self.pk}"


class SurveyInvite(models.Model):
    """One person asked once. "Expired" is derived from `expires_at`, never
    stored. `customer`/`account` are copied from the contact at send time:
    the record the answer scores, and the record whose visibility rule the
    answer follows, even after the contact is deleted."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        FAILED = "failed", "Failed"
        ANSWERED = "answered", "Answered"

    send = models.ForeignKey(SurveySend, related_name="invites", on_delete=models.CASCADE)
    contact = models.ForeignKey(
        Contact, related_name="survey_invites", on_delete=models.SET_NULL, null=True, blank=True
    )
    customer = models.ForeignKey(
        Customer, related_name="survey_invites", on_delete=models.CASCADE, null=True, blank=True
    )
    account = models.ForeignKey(
        Account, related_name="survey_invites", on_delete=models.CASCADE, null=True, blank=True
    )
    email = models.EmailField()
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    failure = models.CharField(max_length=200, blank=True, default="")
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    comment = models.TextField(max_length=2000, blank=True, default="")
    answered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(customer__isnull=False, account__isnull=True)
                | Q(customer__isnull=True, account__isnull=False),
                name="survey_invite_belongs_to_exactly_one_parent",
            ),
            models.CheckConstraint(
                condition=Q(score__isnull=True) | Q(score__gte=0, score__lte=10),
                name="survey_invite_score_0_to_10",
            ),
            models.CheckConstraint(
                condition=~Q(status="answered") | Q(score__isnull=False, answered_at__isnull=False),
                name="survey_invite_answer_has_score_and_time",
            ),
        ]
        indexes = [
            models.Index(fields=["contact", "created_at"]),
            models.Index(fields=["customer", "answered_at"]),
            models.Index(fields=["account", "answered_at"]),
        ]

    def __str__(self):
        return f"Survey invite {self.pk}"
```

In `services/customers/models.py`, inside `class Survey`, add the field right after `responded_at = models.DateField(null=True, blank=True)`:

```python
    send = models.ForeignKey(
        "surveys.SurveySend",
        related_name="log_rows",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The survey send whose answers this row aggregates: one row per send and "
        "record, upserted as answers arrive (services/surveys/scores.py). Null for a row "
        "logged by hand.",
    )
```

In the same class's `Meta.constraints`, after the `survey_belongs_to_exactly_one_parent` constraint, add:

```python
(
    models.UniqueConstraint(
        fields=["send", "customer"],
        condition=models.Q(send__isnull=False, customer__isnull=False),
        name="one_survey_log_row_per_send_and_customer",
    ),
)
(
    models.UniqueConstraint(
        fields=["send", "account"],
        condition=models.Q(send__isnull=False, account__isnull=False),
        name="one_survey_log_row_per_send_and_account",
    ),
)
```

In `config/settings.py`'s `INSTALLED_APPS`, add `"services.surveys",` on the line after `"services.segments",`.

- [ ] **Step 4: Generate the migrations**

Run:
```bash
venv/bin/python manage.py makemigrations surveys
venv/bin/python manage.py makemigrations customers --name survey_send
venv/bin/python manage.py makemigrations --check --dry-run
```
Expected:
- `services/surveys/migrations/0001_initial.py`: the two models, the M2M, three check constraints and five indexes. It depends on `customers` 0049, `segments` 0001 and the user model.
- `services/customers/migrations/0050_survey_send.py`: `AddField` `send` and two `AddConstraint`. It depends on `surveys` 0001.
- The last command prints `No changes detected`.

Read both migration files before going on.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_models --noinput`
Expected: PASS (15 tests).

- [ ] **Step 6: Commit**

```bash
git add services/surveys config/settings.py services/customers/models.py services/customers/migrations/0050_survey_send.py
git commit -m "feat(surveys): SurveySend and SurveyInvite models, link tokens, Survey.send

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The questions, bands and figure maths

Spec Decisions ("Content", "Scores") and §1.4 (the question), §1.6 (bands).

**Files:**
- Create: `services/surveys/questions.py`, `services/surveys/scores.py` (the maths only; Task 6 adds the writes)
- Test: `services/surveys/tests/test_questions.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `questions`:
    - `NPS = "nps"`, `CSAT = "csat"`, `CES = "ces"`;
    - `SCALES: dict[str, tuple[int, int]]` (`{"nps": (0, 10), "csat": (1, 5), "ces": (1, 7)}`);
    - `question_for(survey_type, organisation_name) -> str`;
    - `BANDS: dict[str, tuple[str, str, str]]`;
    - `LOW: dict[str, int]` (the top of the low band: 6/2/3) and `HIGH: dict[str, int]` (the bottom of the high band: 9/4/5);
    - `band_of(survey_type, score) -> str`.
  - `scores`:
    - `percent(part, total) -> Decimal` (two places, half up);
    - `whole(value: Decimal) -> int` (half up);
    - `figure(survey_type, scores) -> Decimal | None`;
    - `bands(survey_type, scores) -> dict[str, int]`.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_questions.py`:

```python
"""The one question per type, its scale, its bands, and the figures the
scores are made of."""

from decimal import Decimal

from django.test import SimpleTestCase

from services.surveys.questions import SCALES, band_of, question_for
from services.surveys.scores import bands, figure, percent, whole


class QuestionTests(SimpleTestCase):
    def test_each_type_asks_its_standard_question_with_the_workspace_name(self):
        self.assertEqual(
            question_for("nps", "Acme Inc"),
            "How likely are you to recommend Acme Inc to a friend or colleague?",
        )
        self.assertEqual(question_for("csat", "Acme Inc"), "How satisfied are you with Acme Inc?")
        self.assertEqual(
            question_for("ces", "Acme Inc"), "How easy is it to get what you need from Acme Inc?"
        )

    def test_a_name_with_braces_is_only_text(self):
        self.assertEqual(question_for("csat", "{x}"), "How satisfied are you with {x}?")

    def test_the_scales(self):
        self.assertEqual(SCALES, {"nps": (0, 10), "csat": (1, 5), "ces": (1, 7)})

    def test_the_band_edges(self):
        nps = [band_of("nps", score) for score in (0, 6, 7, 8, 9, 10)]
        self.assertEqual(
            nps, ["detractors", "detractors", "passives", "passives", "promoters", "promoters"]
        )
        self.assertEqual(
            [band_of("csat", s) for s in (1, 2, 3, 4, 5)], ["low"] * 2 + ["mid"] + ["high"] * 2
        )
        self.assertEqual(
            [band_of("ces", s) for s in (1, 3, 4, 5, 7)], ["low", "low", "mid", "high", "high"]
        )


class FigureTests(SimpleTestCase):
    def test_nps_is_promoters_minus_detractors(self):
        self.assertEqual(figure("nps", [10, 9, 8, 0]), Decimal("25.00"))
        self.assertEqual(figure("nps", [9, 9, 6]), Decimal("33.33"))
        self.assertEqual(figure("nps", [0, 3]), Decimal("-100.00"))

    def test_csat_is_the_share_answering_4_or_5(self):
        self.assertEqual(figure("csat", [5, 4, 3, 1]), Decimal("50.00"))
        self.assertEqual(figure("csat", [5, 4, 1]), Decimal("66.67"))

    def test_ces_is_the_share_answering_5_to_7(self):
        self.assertEqual(figure("ces", [7, 5, 4, 1]), Decimal("50.00"))
        self.assertEqual(figure("ces", [5, 6, 7]), Decimal("100.00"))

    def test_no_answers_is_no_figure(self):
        self.assertIsNone(figure("nps", []))

    def test_rounding_is_half_up(self):
        self.assertEqual(percent(2, 3), Decimal("66.67"))
        self.assertEqual(
            [whole(Decimal(v)) for v in ("33.33", "66.67", "0.50", "-0.50", "-33.33")],
            [33, 67, 1, -1, -33],
        )

    def test_bands_count_every_answer(self):
        self.assertEqual(
            bands("nps", [10, 7, 0, 6]), {"detractors": 2, "passives": 1, "promoters": 1}
        )
        self.assertEqual(bands("ces", []), {"low": 0, "mid": 0, "high": 0})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_questions --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.surveys.questions'`.

- [ ] **Step 3: Write the questions and the maths**

`services/surveys/questions.py`:

```python
"""The one question each survey type asks, its scale, and its bands.

The wording is the standard one for the type, with the asking workspace's
name in it; the builder writes only the subject and an intro line (spec
Decisions, "Content")."""

NPS, CSAT, CES = "nps", "csat", "ces"

SCALES = {NPS: (0, 10), CSAT: (1, 5), CES: (1, 7)}

QUESTIONS = {
    NPS: "How likely are you to recommend {name} to a friend or colleague?",
    CSAT: "How satisfied are you with {name}?",
    CES: "How easy is it to get what you need from {name}?",
}

#: Low, middle and high band names, per type.
BANDS = {
    NPS: ("detractors", "passives", "promoters"),
    CSAT: ("low", "mid", "high"),
    CES: ("low", "mid", "high"),
}
#: The highest score in the low band (an NPS detractor).
LOW = {NPS: 6, CSAT: 2, CES: 3}
#: The lowest score in the high band (what the figure counts as a yes).
HIGH = {NPS: 9, CSAT: 4, CES: 5}


def question_for(survey_type, organisation_name):
    return QUESTIONS[survey_type].format(name=organisation_name)


def band_of(survey_type, score):
    low, middle, high = BANDS[survey_type]
    if score <= LOW[survey_type]:
        return low
    if score >= HIGH[survey_type]:
        return high
    return middle
```

`services/surveys/scores.py`:

```python
"""Survey figures (spec Decisions, "Scores"; §1.5).

NPS = % promoters (9–10) − % detractors (0–6); CSAT = % answering 4–5;
CES = % answering 5–7. Percentages keep two decimals; `whole` rounds to an
integer where a field or a tile wants one. Both round half up.
"""

from decimal import ROUND_HALF_UP, Decimal

from .questions import BANDS, HIGH, LOW, NPS, band_of


def percent(part, total):
    return (Decimal(100) * part / total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def whole(value):
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def figure(survey_type, scores):
    """The type's figure over `scores`, or None when there are none."""
    scores = list(scores)
    if not scores:
        return None
    high = sum(1 for score in scores if score >= HIGH[survey_type])
    if survey_type == NPS:
        low = sum(1 for score in scores if score <= LOW[survey_type])
        return percent(high - low, len(scores))
    return percent(high, len(scores))


def bands(survey_type, scores):
    counts = dict.fromkeys(BANDS[survey_type], 0)
    for score in scores:
        counts[band_of(survey_type, score)] += 1
    return counts
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_questions --noinput`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add services/surveys/questions.py services/surveys/scores.py services/surveys/tests/test_questions.py
git commit -m "feat(surveys): the question per type, its bands and the NPS/CSAT/CES figures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Audience resolution

Spec §1.2 and §3, first bullet. Decisions 1–6.

**Files:**
- Create: `services/surveys/audience.py`
- Test: `services/surveys/tests/test_audience.py`

**Interfaces:**
- Consumes:
  - `segments.evaluate.members_queryset(segment, user, *, today)`;
  - `customers.scoping.visible_children_q(user)`;
  - `models.PER_RECORD_CAP`, `QUIET_DAYS`, `SurveyInvite`;
  - fixture helpers `contact`, `pinned`, `make_send`, `make_invite`, `answered`.
- Produces:
  - `Audience`, a dataclass:
    - `people: list[Contact]` (send order);
    - `skipped_recent: int`, `skipped_no_email: int`, `skipped_cap: int`, `hidden_count: int`;
    - property `organisations -> int`;
    - `counts() -> dict` with keys `audience, organisations, skipped_recent, skipped_no_email, skipped_cap, hidden_count`.
  - `resolve(segment, roles, viewer, *, today, now=None) -> Audience`.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_audience.py`:

```python
"""Who a survey reaches: the segment's members as the builder sees them,
the contacts with a ticked role (at most three per organisation or
account), and the skips, counted and never named."""

from datetime import timedelta

from services.customers.models import Contact, Customer
from services.customers.tests.test_views import blind_to_one_account
from services.surveys.audience import resolve
from services.surveys.tests.fixtures import DECISION_MAKER, SurveyFixture, contact

BOTH = ["champion", "decision_maker"]


def names(audience):
    return [person.name for person in audience.people]


class AudienceTests(SurveyFixture):
    def reach(self, kind, records, roles=BOTH, viewer=None):
        viewer = viewer or self.csm
        segment = self.pinned(kind, records, owner=viewer)
        return resolve(segment, roles, viewer, today=self.today, now=self.now)

    def test_an_organisation_reaches_its_own_and_its_accounts_people(self):
        audience = self.reach("customer", [self.pizza])
        self.assertEqual(names(audience), ["Ann", "Ben"])
        self.assertEqual(audience.organisations, 2)

    def test_only_the_ticked_roles(self):
        self.assertEqual(names(self.reach("customer", [self.pizza], ["decision_maker"])), ["Ben"])

    def test_an_account_reaches_only_its_own_people(self):
        self.assertEqual(names(self.reach("account", [self.emea])), ["Ben"])

    def test_a_contact_segment_is_its_people_whatever_their_role(self):
        oli = contact(self.pizza, "Oli", Contact.Role.OTHER)
        self.assertEqual(names(self.reach("contact", [self.ann, oli], roles=[])), ["Ann", "Oli"])

    def test_only_records_the_builder_may_open(self):
        # Carl's segments pin Taco Bell and Tia too, but he cannot open them.
        self.assertEqual(names(self.reach("customer", [self.pizza, self.taco])), ["Ann", "Ben"])
        self.assertEqual(names(self.reach("contact", [self.ann, self.tia], roles=[])), ["Ann"])
        everyone = self.reach("customer", [self.pizza, self.taco], viewer=self.admin)
        self.assertEqual(names(everyone), ["Ann", "Tia", "Tom", "Ben"])

    def test_at_most_three_per_record_in_the_order_ticked_then_by_name(self):
        for name in ("Dan", "Cat", "Fay"):
            contact(self.pizza, name)
        contact(self.pizza, "Zed", DECISION_MAKER)
        audience = self.reach("customer", [self.pizza], ["decision_maker", "champion"])
        # Decision makers first (Ben on Pizza EMEA, Zed on Pizza Hut), then the
        # champions by name until Pizza Hut has three: Zed, Ann, Cat.
        self.assertEqual(names(audience), ["Ben", "Zed", "Ann", "Cat"])
        self.assertEqual(audience.skipped_cap, 2)

    def test_the_cap_does_not_apply_to_a_contact_segment(self):
        extra = [contact(self.pizza, name) for name in ("Cat", "Dan", "Fay")]
        audience = self.reach("contact", [self.ann, *extra], roles=[])
        self.assertEqual((len(audience.people), audience.skipped_cap), (4, 0))

    def test_anyone_asked_in_the_last_30_days_is_skipped(self):
        earlier = self.make_send(owner=self.admin)
        self.make_invite(earlier, self.ann, created_at=self.now - timedelta(days=29))
        self.make_invite(earlier, self.ben, created_at=self.now - timedelta(days=31))
        audience = self.reach("customer", [self.pizza])
        self.assertEqual((names(audience), audience.skipped_recent), (["Ben"], 1))

    def test_an_answered_invite_counts_as_asked(self):
        self.answered(self.make_send(owner=self.admin), self.ann, 9, days_ago=5)
        self.assertEqual(names(self.reach("customer", [self.pizza])), ["Ben"])

    def test_a_failed_invite_does_not_count_as_asked(self):
        earlier = self.make_send(owner=self.admin)
        self.make_invite(
            earlier,
            self.ann,
            status="failed",
            failure="bounced",
            created_at=self.now - timedelta(days=2),
        )
        self.assertEqual(names(self.reach("customer", [self.pizza])), ["Ann", "Ben"])

    def test_no_email_is_skipped_and_counted(self):
        contact(self.pizza, "Nia", email="")
        contact(self.pizza, "Noe", email="   ")
        audience = self.reach("customer", [self.pizza])
        self.assertEqual((names(audience), audience.skipped_no_email), (["Ann", "Ben"], 2))

    def test_inactive_people_are_left_out_and_not_counted(self):
        contact(self.pizza, "Ivy", status=Contact.Status.INACTIVE)
        self.assertEqual(
            self.reach("customer", [self.pizza]).counts(),
            {
                "audience": 2,
                "organisations": 2,
                "skipped_recent": 0,
                "skipped_no_email": 0,
                "skipped_cap": 0,
                "hidden_count": 0,
            },
        )

    def test_skips_come_before_the_cap(self):
        for name in ("Cat", "Dan", "Fay"):
            contact(self.pizza, name)
        self.make_invite(
            self.make_send(owner=self.admin), self.ann, created_at=self.now - timedelta(days=1)
        )
        audience = self.reach("customer", [self.pizza], ["champion"])
        self.assertEqual(names(audience), ["Cat", "Dan", "Fay"])
        self.assertEqual((audience.skipped_recent, audience.skipped_cap), (1, 0))

    def test_a_person_on_an_account_of_two_members_is_asked_once(self):
        self.emea.customers.add(self.taco)
        audience = self.reach("customer", [self.pizza, self.taco], viewer=self.admin)
        self.assertEqual(names(audience).count("Ben"), 1)

    def test_an_empty_segment_reaches_nobody(self):
        audience = self.reach("customer", [])
        self.assertEqual((audience.people, audience.organisations), ([], 0))


class HiddenPeopleTests(SurveyFixture):
    """Burger Barn: the builder opens it through the account they own
    (Seen); a colleague owns it and its other account (Hidden)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.burger = Customer.objects.create(organisation=cls.org, name="Burger Barn")
        cls.viewer, cls.seen, cls.hidden = blind_to_one_account(cls.burger)
        contact(cls.burger, "Olga")
        contact(cls.seen, "Sid")
        contact(cls.hidden, "Hal")
        contact(cls.hidden, "Hil", Contact.Role.OTHER)

    def test_people_the_builder_cannot_open_are_a_count(self):
        segment = self.pinned("customer", [self.burger], owner=self.viewer)
        audience = resolve(segment, ["champion"], self.viewer, today=self.today, now=self.now)
        self.assertEqual(names(audience), ["Olga", "Sid"])
        # Hal is hidden; Hil is hidden too but has no ticked role, so is not counted.
        self.assertEqual(audience.hidden_count, 1)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_audience --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.surveys.audience'`.

- [ ] **Step 3: Write `audience.py`**

```python
"""Who a survey reaches (spec §1.2).

`resolve` is the one function behind the builder's audience count and the
send itself; the send calls it again under its claim and never trusts a
list from the client. Everything is read from the viewer's own view: the
segment's members as they may see them, then only contacts they may open.
Skips are counted, never named.
"""

from collections import Counter
from dataclasses import dataclass, field
from datetime import timedelta

from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone

from services.customers.models import Account, Contact
from services.customers.scoping import visible_children_q
from services.segments.evaluate import members_queryset

from .models import PER_RECORD_CAP, QUIET_DAYS, SurveyInvite


@dataclass
class Audience:
    """The people a send reaches, in send order, and what was left out."""

    people: list = field(default_factory=list)
    skipped_recent: int = 0
    skipped_no_email: int = 0
    skipped_cap: int = 0
    hidden_count: int = 0

    @property
    def organisations(self):
        """Distinct records reached: each organisation and each account once."""
        return len({(person.customer_id, person.account_id) for person in self.people})

    def counts(self):
        return {
            "audience": len(self.people),
            "organisations": self.organisations,
            "skipped_recent": self.skipped_recent,
            "skipped_no_email": self.skipped_no_email,
            "skipped_cap": self.skipped_cap,
            "hidden_count": self.hidden_count,
        }


def _pool(segment, roles, members):
    """Active contacts with a ticked role on the segment's members: an
    organisation's own and its accounts' contacts, or an account's own.
    Subqueries, not joins, so nobody is listed twice."""
    ids = members.order_by().values("pk")
    if segment.kind == "customer":
        accounts = Account.objects.filter(customers__in=ids).values("pk")
        reach = Q(customer__in=ids) | Q(account__in=accounts)
    else:
        reach = Q(account__in=ids)
    return Contact.objects.filter(reach, status=Contact.Status.ACTIVE, role__in=roles)


def _candidates(segment, roles, viewer, members):
    """(candidates in send order, how many the viewer cannot open, whether
    the per-record cap applies)."""
    if segment.kind == "contact":
        people = members.filter(status=Contact.Status.ACTIVE).order_by("name", "pk")
        return list(people), 0, False
    pool = _pool(segment, roles, members)
    # SOC2:AUTH-02 only people the viewer may open; the rest are a count that names nobody
    seen = pool.filter(visible_children_q(viewer))
    hidden = pool.exclude(pk__in=seen.values("pk")).count()
    rank = Case(
        *(When(role=role, then=Value(index)) for index, role in enumerate(roles)),
        output_field=IntegerField(),
    )
    people = seen.annotate(role_rank=rank).order_by("role_rank", "name", "pk")
    return list(people), hidden, True


def resolve(segment, roles, viewer, *, today, now=None):
    """The people `segment` reaches for `viewer` with `roles` ticked. The
    no-email and 30-day skips come first; the cap of three per record then
    applies to who is left."""
    now = now or timezone.now()
    members = members_queryset(segment, viewer, today=today)
    candidates, hidden, capped = _candidates(segment, roles, viewer, members)
    recent = set(
        SurveyInvite.objects.filter(
            contact_id__in=[person.pk for person in candidates],
            created_at__gte=now - timedelta(days=QUIET_DAYS),
        )
        .exclude(status=SurveyInvite.Status.FAILED)
        .values_list("contact_id", flat=True)
    )
    audience = Audience(hidden_count=hidden)
    per_record = Counter()
    for person in candidates:
        if not person.email.strip():
            audience.skipped_no_email += 1
            continue
        if person.pk in recent:
            audience.skipped_recent += 1
            continue
        record = (person.customer_id, person.account_id)
        if capped and per_record[record] >= PER_RECORD_CAP:
            audience.skipped_cap += 1
            continue
        per_record[record] += 1
        audience.people.append(person)
    return audience
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_audience --noinput`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add services/surveys/audience.py services/surveys/tests/test_audience.py
git commit -m "feat(surveys): resolve a segment's audience with roles, cap, quiet period and visibility

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Access, the builder's endpoints and the audience count

Spec §1.6 (routes, summary, visibility), §1.7 (403/404/roles), §3. Decisions 15–19 and 22.

**Files:**
- Create:
  - `services/surveys/access.py`
  - `services/surveys/serializers.py` (`SendWriteSerializer`, `AudienceSerializer`)
  - `services/surveys/summary.py`
  - `services/surveys/payloads.py`
  - `services/surveys/views.py`
  - `services/surveys/urls.py`
- Modify: `config/urls.py` (mount `api/v1/surveys/sends/`)
- Test: `services/surveys/tests/test_views.py`

**Interfaces:**
- Consumes:
  - `audience.resolve`, `Audience.counts()`;
  - `scores.figure`, `bands`, `percent`, `whole`;
  - `segments.access.get_readable` and `readable_segments`;
  - `models.MAX_PEOPLE`, `MAX_SHARED`.
- Produces:
  - `access`:
    - `readable_sends(user) -> QuerySet[SurveySend]`;
    - `get_readable(user, pk) -> SurveySend` (404);
    - `get_owned(user, pk) -> SurveySend` (403 `NOT_OWNER`);
    - `owned_segment(user, segment_id) -> Segment` (404, or 403 `NOT_SEGMENT_OWNER`);
    - `NOT_OWNER = "Only the survey's owner can change it."`;
    - `NOT_SEGMENT_OWNER = "You can only survey your own segments."`.
  - `serializers`:
    - `NO_ROLES = "Choose at least one role."`, `NO_TEAMMATES`, `LOCKED`, `AFTER_SEND`;
    - `clean_roles(segment, roles) -> list[str]`;
    - `SendWriteSerializer`, `AudienceSerializer`.
  - `summary`:
    - `rate(answered, sent) -> int | None`;
    - `summary_invites(send, viewer) -> QuerySet`;
    - `send_summary(send, viewer) -> dict` with keys `sent, answered, rate, figure, bands`.
  - `payloads`:
    - `readable_segment_ids(viewer, ids) -> set[int]`;
    - `segment_ref(send, readable) -> dict | None`;
    - `invite_tallies(send_ids, viewer) -> dict[int, dict]`;
    - `send_payload(send, viewer) -> dict`;
    - `list_rows(sends, viewer) -> list[dict]`.
  - Routes:
    - `GET/POST /api/v1/surveys/sends/`;
    - `GET/PATCH/DELETE /api/v1/surveys/sends/<id>/`;
    - `POST /api/v1/surveys/sends/audience/`.
  - `views.CANNOT_DELETE`.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_views.py`:

```python
"""The builder's endpoints: list, create, read, edit and delete a send, and
the audience count. Missing and hidden read the same; only the owner
writes; a shared reader's figures cover only people they may open."""

from rest_framework.test import APIClient

from core.models import AuditEvent
from services.surveys.models import SurveyInvite, SurveySend
from services.surveys.tests.fixtures import SurveyFixture

URL = "/api/v1/surveys/sends/"
AUDIENCE = URL + "audience/"
NOT_OWNER = {"detail": "Only the survey's owner can change it."}
NOT_SEGMENT_OWNER = {"detail": "You can only survey your own segments."}
LOCKED = "A sent survey can only be renamed or re-shared."
DETAIL_KEYS = {
    "id", "name", "survey_type", "subject", "intro", "segment", "roles", "status", "sharing",
    "shared_with", "owner", "is_owner", "started_at", "sent_at", "counts", "summary",
    "created_at", "updated_at",
}  # fmt: skip
ROW_KEYS = {
    "id", "name", "survey_type", "status", "segment", "owner", "is_owner", "sharing",
    "sent_at", "sent", "answered", "rate", "updated_at",
}  # fmt: skip
SENT_COUNTS = {
    "audience": 4, "sent": 3, "failed": 1, "skipped_recent": 0, "skipped_no_email": 0,
    "skipped_cap": 0,
}  # fmt: skip


class Endpoint(SurveyFixture):
    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def events(self, action):
        rows = AuditEvent.objects.filter(action=action).order_by("pk")
        return list(rows.values_list("target_id", "metadata"))


class CreateTests(Endpoint):
    def post(self, user, **body):
        payload = {"name": "Q3 NPS", "survey_type": "nps", "subject": "A quick question", **body}
        return self.api(user).post(URL, payload, format="json")

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get(URL).status_code, 401)
        self.assertEqual(APIClient().post(AUDIENCE, {}, format="json").status_code, 401)

    def test_a_draft_is_created_for_its_owner(self):
        segment = self.pinned("customer", [self.pizza])
        response = self.post(
            self.csm,
            segment=segment.pk,
            roles=["champion", "champion", "decision_maker"],
            intro="Two minutes, promise.",
        )
        self.assertEqual(response.status_code, 201, response.content)
        send = SurveySend.objects.get(pk=response.data["id"])
        self.assertEqual(
            (send.owner, send.organisation, send.status, send.segment),
            (self.csm, self.org, "draft", segment),
        )
        self.assertEqual(send.roles, ["champion", "decision_maker"])
        self.assertEqual(set(response.data), DETAIL_KEYS)
        self.assertEqual(
            response.data["segment"], {"id": segment.pk, "name": "Renewal risk", "kind": "customer"}
        )
        self.assertEqual(self.events("survey.created"), [(str(send.pk), {"survey_type": "nps"})])
        self.assertEqual(self.events("survey.shared"), [])

    def test_a_draft_may_wait_for_its_segment(self):
        response = self.post(self.csm)
        self.assertEqual(
            (response.status_code, response.data["segment"], response.data["roles"]),
            (201, None, []),
        )

    def test_an_organisation_segment_needs_a_role(self):
        segment = self.pinned("customer", [self.pizza])
        response = self.post(self.csm, segment=segment.pk)
        self.assertEqual(
            (response.status_code, response.data), (400, {"roles": ["Choose at least one role."]})
        )

    def test_a_contact_segment_ignores_roles(self):
        segment = self.pinned("contact", [self.ann])
        response = self.post(self.csm, segment=segment.pk, roles=["champion"])
        self.assertEqual((response.status_code, response.data["roles"]), (201, []))

    def test_someone_elses_segment_is_403_and_an_unreadable_one_404(self):
        shared = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        hidden = self.pinned("customer", [self.taco], owner=self.other)
        response = self.post(self.csm, segment=shared.pk, roles=["champion"])
        self.assertEqual((response.status_code, response.data), (403, NOT_SEGMENT_OWNER))
        self.assertEqual(
            self.post(self.csm, segment=hidden.pk, roles=["champion"]).status_code, 404
        )
        self.assertEqual(self.post(self.csm, segment=999999, roles=["champion"]).status_code, 404)
        self.assertFalse(SurveySend.objects.exists())

    def test_limits_on_the_builders_words(self):
        response = self.post(self.csm, name="x" * 121, subject="y" * 121, intro="z" * 501)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data), {"name", "subject", "intro"})

    def test_an_unknown_type_or_role_is_refused(self):
        response = self.post(self.csm, survey_type="nps2", roles=["boss"])
        self.assertEqual(
            (response.status_code, set(response.data)), (400, {"survey_type", "roles"})
        )

    def test_sharing_with_people_needs_teammates_in_the_workspace(self):
        response = self.post(self.csm, sharing="people")
        self.assertEqual(response.data, {"shared_with": ["Choose at least one teammate."]})
        response = self.post(self.csm, sharing="people", shared_with=[self.stranger.pk])
        self.assertEqual((response.status_code, set(response.data)), (400, {"shared_with"}))
        response = self.post(self.csm, sharing="people", shared_with=[self.other.pk])
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["shared_with"], [{"id": self.other.pk, "name": "Dana CSM"}])
        self.assertEqual(
            self.events("survey.shared"),
            [(str(response.data["id"]), {"sharing": "people", "shared_with": [self.other.pk]})],
        )


class ReadTests(Endpoint):
    """Carl's private draft, and Alice's workspace CSAT send to Pizza Hut and
    Taco Bell: Ann answered 5, Tia 1, Ben is pending and Tom's email failed."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.private = cls.make_send(name="Carl's draft")
        cls.team_segment = cls.pinned("customer", [cls.pizza, cls.taco], owner=cls.admin)
        cls.team = cls.make_send(
            owner=cls.admin,
            name="Team CSAT",
            survey_type="csat",
            segment=cls.team_segment,
            sharing="workspace",
            status="sent",
            started_at=cls.now,
            sent_at=cls.now,
            counts=SENT_COUNTS,
        )
        cls.answered(cls.team, cls.ann, 5)
        cls.answered(cls.team, cls.tia, 1)
        cls.make_invite(cls.team, cls.ben)
        cls.make_invite(cls.team, cls.tom, status="failed", failure="bounced")

    def names(self, user, **query):
        return [row["name"] for row in self.api(user).get(URL, query).data]

    def test_the_list_is_mine_and_what_is_shared_with_me(self):
        self.assertEqual(self.names(self.csm), ["Team CSAT", "Carl's draft"])
        self.assertEqual(self.names(self.other), ["Team CSAT"])
        self.assertEqual(self.names(self.csm, scope="mine"), ["Carl's draft"])
        self.assertEqual(self.names(self.csm, scope="shared"), ["Team CSAT"])
        self.assertEqual(set(self.api(self.csm).get(URL).data[0]), ROW_KEYS)

    def test_a_shared_reader_counts_only_people_they_may_open(self):
        path = f"{URL}{self.team.pk}/"
        self.assertEqual(
            self.api(self.admin).get(path).data["summary"],
            {
                "sent": 3,
                "answered": 2,
                "rate": 67,
                "figure": 50,
                "bands": {"low": 1, "mid": 0, "high": 1},
            },
        )
        self.assertEqual(
            self.api(self.csm).get(path).data["summary"],
            {
                "sent": 2,
                "answered": 1,
                "rate": 50,
                "figure": 100,
                "bands": {"low": 0, "mid": 0, "high": 1},
            },
        )
        for user, expected in ((self.admin, (3, 2, 67)), (self.csm, (2, 1, 50))):
            rows = {row["id"]: row for row in self.api(user).get(URL).data}
            row = rows[self.team.pk]
            self.assertEqual((row["sent"], row["answered"], row["rate"]), expected)

    def test_a_shared_reader_gets_no_counts_and_no_link_to_a_segment_they_cannot_read(self):
        body = self.api(self.csm).get(f"{URL}{self.team.pk}/").data
        self.assertEqual(set(body), DETAIL_KEYS)
        self.assertEqual(
            (body["is_owner"], body["counts"], body["segment"]),
            (False, None, {"id": None, "name": "Renewal risk", "kind": "customer"}),
        )
        body = self.api(self.admin).get(f"{URL}{self.team.pk}/").data
        self.assertEqual(
            (body["counts"], body["segment"]["id"]), (SENT_COUNTS, self.team_segment.pk)
        )

    def test_a_send_the_reader_may_not_see_reads_like_a_missing_one(self):
        self.assertEqual(self.api(self.other).get(f"{URL}{self.private.pk}/").status_code, 404)
        self.assertEqual(self.api(self.other).get(f"{URL}999999/").status_code, 404)


class WriteTests(Endpoint):
    def patch(self, user, send, **body):
        return self.api(user).patch(f"{URL}{send.pk}/", body, format="json")

    def test_only_the_owner_writes(self):
        team = self.make_send(owner=self.admin, sharing="workspace")
        response = self.patch(self.csm, team, name="Mine now")
        self.assertEqual((response.status_code, response.data), (403, NOT_OWNER))
        self.assertEqual(self.api(self.csm).delete(f"{URL}{team.pk}/").status_code, 403)
        private = self.make_send(owner=self.admin)
        self.assertEqual(self.patch(self.csm, private, name="x").status_code, 404)

    def test_a_draft_edit_is_audited_by_field_name(self):
        send = self.make_send()
        response = self.patch(self.csm, send, name="Renamed", subject="A quick question")
        self.assertEqual((response.status_code, response.data["name"]), (200, "Renamed"))
        self.assertEqual(self.events("survey.updated"), [(str(send.pk), {"fields": ["name"]})])

    def test_after_sending_only_the_name_and_sharing_change(self):
        send = self.make_send(status="sent", started_at=self.now, sent_at=self.now)
        response = self.patch(self.csm, send, subject="New", intro="x")
        self.assertEqual(
            (response.status_code, response.data), (400, {"intro": [LOCKED], "subject": [LOCKED]})
        )
        response = self.patch(self.csm, send, name="Renamed", sharing="workspace")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            self.events("survey.shared"),
            [(str(send.pk), {"sharing": "workspace", "shared_with": []})],
        )

    def test_a_draft_is_deleted_and_audited(self):
        send = self.make_send()
        self.assertEqual(self.api(self.csm).delete(f"{URL}{send.pk}/").status_code, 204)
        self.assertFalse(SurveySend.objects.filter(pk=send.pk).exists())
        self.assertEqual(self.events("survey.deleted"), [(str(send.pk), {"survey_type": "nps"})])

    def test_a_sent_survey_cannot_be_deleted(self):
        send = self.make_send(status="sent", started_at=self.now, sent_at=self.now)
        response = self.api(self.csm).delete(f"{URL}{send.pk}/")
        self.assertEqual(
            (response.status_code, response.data),
            (
                409,
                {"detail": "Only a draft can be deleted; a sent survey's answers feed the scores."},
            ),
        )


class AudienceEndpointTests(Endpoint):
    def count(self, user, **body):
        return self.api(user).post(AUDIENCE, body, format="json")

    def test_the_count_for_the_modal_creates_nothing(self):
        segment = self.pinned("customer", [self.pizza, self.taco])
        response = self.count(self.csm, segment=segment.pk, roles=["champion", "decision_maker"])
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.data,
            {
                "audience": 2,
                "organisations": 2,
                "skipped_recent": 0,
                "skipped_no_email": 0,
                "skipped_cap": 0,
                "hidden_count": 0,
                "limit": 500,
            },
        )
        self.assertFalse(SurveySend.objects.exists())
        self.assertFalse(SurveyInvite.objects.exists())

    def test_the_segment_must_be_the_callers_own(self):
        shared = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        hidden = self.pinned("customer", [self.taco], owner=self.other)
        response = self.count(self.csm, segment=shared.pk, roles=["champion"])
        self.assertEqual((response.status_code, response.data), (403, NOT_SEGMENT_OWNER))
        self.assertEqual(
            self.count(self.csm, segment=hidden.pk, roles=["champion"]).status_code, 404
        )

    def test_an_organisation_segment_needs_a_role(self):
        segment = self.pinned("customer", [self.pizza])
        response = self.count(self.csm, segment=segment.pk, roles=[])
        self.assertEqual(
            (response.status_code, response.data), (400, {"roles": ["Choose at least one role."]})
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_views --noinput`
Expected: FAIL. Every request answers 404, because no route is mounted yet. `test_requires_authentication` fails with `404 != 401`.

- [ ] **Step 3: Write access, serializers, summary, payloads, views and routes**

`services/surveys/access.py`:

```python
"""Who may read a send, who may change it, and which segment a survey may
go to."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from services.segments.access import get_readable as get_readable_segment

from .models import SurveySend

NOT_OWNER = "Only the survey's owner can change it."
NOT_SEGMENT_OWNER = "You can only survey your own segments."


def readable_sends(user):
    """Sends `user` may read: their own, those shared with the workspace,
    and those shared with them by name. Inside their own workspace only."""
    # SOC2:AUTH-02 a send is read by its owner and whoever it is shared with
    return (
        SurveySend.objects.filter(organisation_id=user.organisation_id)
        .filter(
            Q(owner=user)
            | Q(sharing=SurveySend.Sharing.WORKSPACE)
            | Q(sharing=SurveySend.Sharing.PEOPLE, shared_with=user)
        )
        .distinct()
    )


def get_readable(user, pk):
    """The send, or a 404 that reads the same for a missing send and one
    `user` may not read."""
    return get_object_or_404(readable_sends(user).select_related("owner", "segment"), pk=pk)


def get_owned(user, pk):
    send = get_readable(user, pk)
    # SOC2:AUTH-02 only the owner edits, sends or deletes
    if send.owner_id != user.pk:
        raise PermissionDenied(NOT_OWNER)
    return send


def owned_segment(user, segment_id):
    """The segment a survey goes to: one `user` may read (404 otherwise)
    and owns (403 otherwise), so the audience is always their own book."""
    segment = get_readable_segment(user, segment_id)
    # SOC2:AUTH-02 a survey goes only to the builder's own segment
    if segment.owner_id != user.pk:
        raise PermissionDenied(NOT_SEGMENT_OWNER)
    return segment
```

`services/surveys/serializers.py`:

```python
"""What a builder writes. The owner and workspace come from the request,
never the body; a segment is resolved through `owned_segment`, so a
segment the caller cannot read is a 404 and someone else's a 403."""

from rest_framework import serializers

from services.accounts.models import User
from services.customers.models import Contact

from .access import owned_segment
from .models import MAX_SHARED, SurveySend

NO_ROLES = "Choose at least one role."
NO_TEAMMATES = "Choose at least one teammate."
LOCKED = "A sent survey can only be renamed or re-shared."
#: What a send that has been claimed may still change.
AFTER_SEND = frozenset({"name", "sharing", "shared_with"})


def roles_field(**kwargs):
    return serializers.ListField(
        child=serializers.ChoiceField(choices=Contact.Role.choices),
        max_length=len(Contact.Role.choices),
        **kwargs,
    )


def clean_roles(segment, roles):
    """Each role once, in the order ticked. None for a contact segment (it
    sends to its own people); at least one for an organisation or account
    segment."""
    roles = list(dict.fromkeys(roles))
    if segment is None:
        return roles
    if segment.kind == "contact":
        return []
    if not roles:
        raise serializers.ValidationError({"roles": [NO_ROLES]})
    return roles


class SendWriteSerializer(serializers.ModelSerializer):
    segment = serializers.IntegerField(required=False, allow_null=True)
    roles = roles_field(required=False)
    shared_with = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.none(), required=False
    )

    class Meta:
        model = SurveySend
        fields = [
            "name",
            "survey_type",
            "subject",
            "intro",
            "segment",
            "roles",
            "sharing",
            "shared_with",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = self.context["request"].user
        # SOC2:AUTH-02 shared only with active teammates in the owner's workspace
        self.fields["shared_with"].child_relation.queryset = User.objects.filter(
            organisation_id=user.organisation_id, is_active=True
        ).exclude(pk=user.pk)

    def validate_segment(self, value):
        if value is None:
            return None
        return owned_segment(self.context["request"].user, value)

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and instance.status != SurveySend.Status.DRAFT:
            locked = sorted(set(self.initial_data) & (set(self.fields) - AFTER_SEND))
            if locked:
                raise serializers.ValidationError({name: [LOCKED] for name in locked})
        elif instance is None or "segment" in attrs or "roles" in attrs:
            segment = attrs["segment"] if "segment" in attrs else getattr(instance, "segment", None)
            roles = attrs.get("roles", getattr(instance, "roles", []))
            attrs["roles"] = clean_roles(segment, roles)
        default_sharing = instance.sharing if instance is not None else SurveySend.Sharing.PRIVATE
        if attrs.get("sharing", default_sharing) == SurveySend.Sharing.PEOPLE:
            if "shared_with" in attrs:
                people = attrs["shared_with"]
            else:
                people = list(instance.shared_with.all()) if instance is not None else []
            if not people:
                raise serializers.ValidationError({"shared_with": [NO_TEAMMATES]})
            if len(people) > MAX_SHARED:
                raise serializers.ValidationError(
                    {"shared_with": [f"Share with at most {MAX_SHARED} teammates."]}
                )
        elif "sharing" in attrs or "shared_with" in attrs:
            attrs["shared_with"] = []
        return attrs

    def update(self, instance, validated_data):
        """Writes only the fields the request names (and `updated_at`), so an
        edit never writes back the send's status, times or counts."""
        people = validated_data.pop("shared_with", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.save(update_fields=[*validated_data, "updated_at"])
        if people is not None:
            instance.shared_with.set(people)
        return instance


class AudienceSerializer(serializers.Serializer):
    """The builder's audience count: a segment of the caller's own and the
    roles ticked. Nothing is saved."""

    segment = serializers.IntegerField()
    roles = roles_field(required=False, default=list)

    def validate_segment(self, value):
        return owned_segment(self.context["request"].user, value)

    def validate(self, attrs):
        attrs["roles"] = clean_roles(attrs["segment"], attrs["roles"])
        return attrs
```

`services/surveys/summary.py`:

```python
"""The figures on a send: sent, answered, rate, the type's figure and its
bands (spec §1.6). The owner's cover every invite, since the audience was
resolved from their own view. Anyone else's cover only the people they may
open, so a shared send never leaks a figure about people the reader cannot
see. A failed invite was never sent and is not counted."""

from services.customers.scoping import visible_children_q

from .models import SurveyInvite
from .scores import bands, figure, percent, whole


def rate(answered, sent):
    return whole(percent(answered, sent)) if sent else None


def summary_invites(send, viewer):
    invites = send.invites.exclude(status=SurveyInvite.Status.FAILED)
    if send.owner_id == viewer.pk:
        return invites
    # SOC2:AUTH-02 a shared reader's figures cover only people they may open
    return invites.filter(visible_children_q(viewer))


def send_summary(send, viewer):
    rows = list(summary_invites(send, viewer).values_list("status", "score"))
    scores = [score for status, score in rows if status == SurveyInvite.Status.ANSWERED]
    value = figure(send.survey_type, scores)
    return {
        "sent": len(rows),
        "answered": len(scores),
        "rate": rate(len(scores), len(rows)),
        "figure": None if value is None else whole(value),
        "bands": bands(send.survey_type, scores),
    }
```

`services/surveys/payloads.py`:

```python
"""A send as the API returns it: the full record and the list's row."""

from django.db.models import Count, Q

from services.customers.scoping import visible_children_q
from services.organizations.rows import iso, person
from services.segments.access import readable_segments

from .models import SurveyInvite
from .summary import rate, send_summary


def readable_segment_ids(viewer, segment_ids):
    """Which of `segment_ids` `viewer` may read; no query for none."""
    ids = {pk for pk in segment_ids if pk is not None}
    if not ids:
        return set()
    return set(readable_segments(viewer).filter(pk__in=ids).values_list("pk", flat=True))


def segment_ref(send, readable):
    """The send's segment by name and kind; its id only for a reader who
    may open it. None once the segment is deleted."""
    segment = send.segment
    if segment is None:
        return None
    return {
        "id": segment.pk if segment.pk in readable else None,
        "name": segment.name,
        "kind": segment.kind,
    }


def invite_tallies(send_ids, viewer):
    """`{send_id: {sent, answered, seen_sent, seen_answered}}` in one query.
    `seen_*` count only people `viewer` may open."""
    if not send_ids:
        return {}
    # SOC2:AUTH-02 a shared reader's counts cover only people they may open
    seen = visible_children_q(viewer)
    answered = Q(status=SurveyInvite.Status.ANSWERED)
    rows = (
        SurveyInvite.objects.filter(send_id__in=send_ids)
        .exclude(status=SurveyInvite.Status.FAILED)
        .order_by()
        .values("send_id")
        .annotate(
            sent=Count("id"),
            answered=Count("id", filter=answered),
            seen_sent=Count("id", filter=seen),
            seen_answered=Count("id", filter=seen & answered),
        )
    )
    return {row["send_id"]: row for row in rows}


def send_payload(send, viewer):
    is_owner = send.owner_id == viewer.pk
    # SOC2:AUTH-02 teammates are named only from the viewer's own workspace
    teammates = (
        send.shared_with.filter(organisation_id=viewer.organisation_id)
        .order_by("name", "pk")
        .values_list("pk", "name")
    )
    return {
        "id": send.pk,
        "name": send.name,
        "survey_type": send.survey_type,
        "subject": send.subject,
        "intro": send.intro,
        "segment": segment_ref(send, readable_segment_ids(viewer, [send.segment_id])),
        "roles": send.roles,
        "status": send.status,
        "sharing": send.sharing,
        "shared_with": [{"id": pk, "name": name} for pk, name in teammates],
        "owner": person(send.owner),
        "is_owner": is_owner,
        "started_at": iso(send.started_at),
        "sent_at": iso(send.sent_at),
        # Frozen from the owner's own audience: the owner's to read.
        "counts": send.counts if is_owner and send.counts else None,
        "summary": send_summary(send, viewer),
        "created_at": iso(send.created_at),
        "updated_at": iso(send.updated_at),
    }


def list_rows(sends, viewer):
    sends = list(sends)
    readable = readable_segment_ids(viewer, [send.segment_id for send in sends])
    tallies = invite_tallies([send.pk for send in sends], viewer)
    rows = []
    for send in sends:
        tally = tallies.get(send.pk, {})
        is_owner = send.owner_id == viewer.pk
        prefix = "" if is_owner else "seen_"
        sent, answered = tally.get(f"{prefix}sent", 0), tally.get(f"{prefix}answered", 0)
        rows.append(
            {
                "id": send.pk,
                "name": send.name,
                "survey_type": send.survey_type,
                "status": send.status,
                "segment": segment_ref(send, readable),
                "owner": person(send.owner),
                "is_owner": is_owner,
                "sharing": send.sharing,
                "sent_at": iso(send.sent_at),
                "sent": sent,
                "answered": answered,
                "rate": rate(answered, sent),
                "updated_at": iso(send.updated_at),
            }
        )
    return rows
```

`services/surveys/views.py`:

```python
"""The survey builder's endpoints. Only the owner writes; every read is
filtered by what the reader may open. See docs/API_CONTRACTS.md,
`surveys`."""

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit

from .access import get_owned, get_readable, readable_sends
from .audience import resolve
from .models import MAX_PEOPLE, SurveySend
from .payloads import list_rows, send_payload
from .serializers import AudienceSerializer, SendWriteSerializer

CANNOT_DELETE = "Only a draft can be deleted; a sent survey's answers feed the scores."
SHARING_FIELDS = frozenset({"sharing", "shared_with"})


def _changed(send, data):
    """The names of the fields `data` would change, never their values."""
    changed = []
    for name, value in data.items():
        if name == "shared_with":
            before = set(send.shared_with.values_list("pk", flat=True))
            if {user.pk for user in value} != before:
                changed.append(name)
        elif getattr(send, name) != value:
            changed.append(name)
    return sorted(changed)


def _record_shared(request, send):
    audit.record(  # SOC2:LOG-01
        "survey.shared",
        request=request,
        target=send,
        metadata={
            "sharing": send.sharing,
            "shared_with": sorted(send.shared_with.values_list("pk", flat=True)),
        },
    )


class SendListCreateView(APIView):
    """GET /api/v1/surveys/sends/?scope=mine|shared|all, the sends the
    caller may read, newest first. POST creates a draft owned by the caller."""

    # SOC2:AUTH-02 authentication here; `readable_sends` scopes every read
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sends = readable_sends(request.user)
        scope = request.query_params.get("scope")
        if scope == "mine":
            sends = sends.filter(owner=request.user)
        elif scope == "shared":
            sends = sends.exclude(owner=request.user)
        sends = sends.select_related("owner", "segment").order_by("-created_at", "-pk")
        return Response(list_rows(sends, request.user))

    def post(self, request):
        serializer = SendWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            send = serializer.save(owner=request.user, organisation_id=request.user.organisation_id)
            audit.record(  # SOC2:LOG-01
                "survey.created",
                request=request,
                target=send,
                metadata={"survey_type": send.survey_type},
            )
            if send.sharing != SurveySend.Sharing.PRIVATE:
                _record_shared(request, send)
        return Response(send_payload(send, request.user), status=status.HTTP_201_CREATED)


class SendDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/surveys/sends/<id>/. Readers read. Only the
    owner writes (403 for another reader, 404 for anyone who may not read
    it). After the claim, PATCH accepts only the name and sharing. Only a
    draft can be deleted."""

    # SOC2:AUTH-02 authentication here; `get_readable`/`get_owned` check the send
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(send_payload(get_readable(request.user, pk), request.user))

    def patch(self, request, pk):
        send = get_owned(request.user, pk)
        with transaction.atomic():
            # Under the row lock the send's claim takes, so an edit never
            # races a send that is starting.
            send = (
                SurveySend.objects.select_for_update(of=("self",))
                .select_related("owner", "segment")
                .get(pk=send.pk)
            )
            serializer = SendWriteSerializer(
                send, data=request.data, partial=True, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            changed = _changed(send, serializer.validated_data)
            send = serializer.save()
            if changed:
                audit.record(  # SOC2:LOG-01
                    "survey.updated", request=request, target=send, metadata={"fields": changed}
                )
            if SHARING_FIELDS & set(changed):
                _record_shared(request, send)
        return Response(send_payload(send, request.user))

    def delete(self, request, pk):
        send = get_owned(request.user, pk)
        with transaction.atomic():
            send = SurveySend.objects.select_for_update().get(pk=send.pk)
            if send.status != SurveySend.Status.DRAFT:
                return Response({"detail": CANNOT_DELETE}, status=status.HTTP_409_CONFLICT)
            audit.record(  # SOC2:LOG-01
                "survey.deleted",
                request=request,
                target=send,
                metadata={"survey_type": send.survey_type},
            )
            send.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SendAudienceView(APIView):
    """POST /api/v1/surveys/sends/audience/ with `{segment, roles}`. Returns
    the counts the builder's modal shows, resolved on the server from the
    caller's own view. Nothing is created."""

    # SOC2:AUTH-02 authentication here; `owned_segment` and `resolve` check the rest
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AudienceSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        audience = resolve(data["segment"], data["roles"], request.user, today=timezone.localdate())
        return Response({**audience.counts(), "limit": MAX_PEOPLE})
```

`services/surveys/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("", views.SendListCreateView.as_view(), name="survey-send-list"),
    path("audience/", views.SendAudienceView.as_view(), name="survey-send-audience"),
    path("<int:pk>/", views.SendDetailView.as_view(), name="survey-send-detail"),
]
```

In `config/urls.py`, add this line directly above `path("api/v1/surveys/<int:pk>/", SurveyDetailView.as_view(), name="survey-detail"),`:

```python
# Survey sends (services/surveys): emailed one-time links to a hosted form.
# "sends" is not an int, so the logged-survey routes below are unaffected.
(path("api/v1/surveys/sends/", include("services.surveys.urls")),)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_views --noinput`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add services/surveys config/urls.py
git commit -m "feat(surveys): send list, create, read, edit, delete and the audience count

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The send and its email

Spec §1.3, §1.7 (409, 400, 429, email failure). Decisions 7, 8 and 24.

**Files:**
- Create: `services/surveys/sending.py`
- Modify:
  - `services/email.py` (`send_survey_email`)
  - `services/surveys/views.py` (add `SendNowView`)
  - `services/surveys/urls.py` (add `<int:pk>/send/`)
- Test: `services/surveys/tests/test_sending.py`

**Interfaces:**
- Consumes:
  - `audience.resolve`, `Audience`;
  - `access.get_owned`, `NOT_SEGMENT_OWNER`;
  - `serializers.NO_ROLES`;
  - `tokens.new_token`;
  - `payloads.send_payload`;
  - `models.DAILY_SENDS`, `LINK_DAYS`, `MAX_PEOPLE`.
- Produces:
  - `email.send_survey_email(invite, token) -> None`, which raises on failure.
  - `sending`:
    - `Refusal(status: int, body: dict)`;
    - `claim(pk, user, *, today, now) -> tuple[SurveySend, Audience]`;
    - `deliver(send, audience, *, now) -> tuple[int, int]` (sent, failed);
    - `finish(send, audience, *, sent, failed, now) -> None`;
    - `too_many(count) -> str`;
    - messages `ALREADY_SENT`, `BEING_SENT`, `DAILY_LIMIT`, `CHOOSE_SEGMENT`, `NOBODY`.
  - Route: `POST /api/v1/surveys/sends/<id>/send/`, which returns `send_payload`.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_sending.py`:

```python
"""The send: claimed once under row locks, the audience resolved again on
the server, one emailed link per person, a failure isolated to its invite,
the counts frozen and the send audited."""

import hashlib
import re
from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.core import mail
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from services.email import send_survey_email
from services.surveys.models import SurveyInvite, SurveySend
from services.surveys.tests.fixtures import SurveyFixture

LINK = re.compile(r"/s/([A-Za-z0-9_-]+)")
FULL = {
    "audience": 2, "sent": 2, "failed": 0, "skipped_recent": 0, "skipped_no_email": 0,
    "skipped_cap": 0,
}  # fmt: skip


class SendFixture(SurveyFixture):
    def send_now(self, send, user=None):
        client = APIClient()
        client.force_authenticate(user or send.owner)
        return client.post(f"/api/v1/surveys/sends/{send.pk}/send/", format="json")

    def ready(self, **fields):
        """Carl's draft to Pizza Hut's champions and decision makers: Ann and Ben."""
        return self.make_send(segment=self.pinned("customer", [self.pizza]), **fields)


class SendTests(SendFixture):
    def test_each_person_gets_their_own_link_and_only_its_hash_is_kept(self):
        send = self.ready(intro="Two minutes, promise.")
        response = self.send_now(send)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            sorted(message.to[0] for message in mail.outbox),
            ["ann@example.com", "ben@example.com"],
        )
        for message in mail.outbox:
            token = LINK.search(message.body).group(1)
            invite = SurveyInvite.objects.get(email=message.to[0])
            self.assertGreaterEqual(len(token), 43)
            self.assertEqual(invite.token_hash, hashlib.sha256(token.encode()).hexdigest())
            stored = SurveyInvite.objects.filter(pk=invite.pk).values().first()
            self.assertNotIn(token, str(stored))
        send.refresh_from_db()
        self.assertEqual((send.status, send.counts), ("sent", FULL))
        self.assertIsNotNone(send.sent_at)
        ben = SurveyInvite.objects.get(contact=self.ben)
        self.assertEqual(
            (ben.status, ben.customer_id, ben.account_id), ("pending", None, self.emea.pk)
        )
        self.assertEqual(ben.expires_at, send.started_at + timedelta(days=14))
        self.assertEqual(response.data["status"], "sent")

    def test_the_send_is_audited_with_counts_only(self):
        send = self.ready()
        self.send_now(send)
        event = AuditEvent.objects.get(action="survey.sent")
        self.assertEqual((event.target_id, event.metadata), (str(send.pk), FULL))

    def test_one_failure_never_stops_the_batch(self):
        send = self.ready()
        with patch(
            "services.surveys.sending.send_survey_email",
            side_effect=[OSError("mailbox unavailable"), None],
        ) as email:
            response = self.send_now(send)
        self.assertEqual((response.status_code, email.call_count), (200, 2))
        ann = SurveyInvite.objects.get(contact=self.ann)
        self.assertEqual((ann.status, ann.failure), ("failed", "mailbox unavailable"))
        self.assertEqual(SurveyInvite.objects.get(contact=self.ben).status, "pending")
        send.refresh_from_db()
        self.assertEqual((send.status, send.counts["sent"], send.counts["failed"]), ("sent", 1, 1))

    def test_a_second_send_is_409(self):
        send = self.ready()
        self.assertEqual(self.send_now(send).status_code, 200)
        response = self.send_now(send)
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"detail": "This survey has already been sent."}),
        )
        self.assertEqual(len(mail.outbox), 2)

    def test_a_send_already_under_way_is_409(self):
        response = self.send_now(self.ready(status="sending"))
        self.assertEqual(
            (response.status_code, response.data), (409, {"detail": "This survey is being sent."})
        )
        self.assertEqual(mail.outbox, [])

    def test_the_claim_locks_the_owner_and_the_send(self):
        send = self.ready()
        with CaptureQueriesContext(connection) as ctx:
            self.send_now(send)
        locks = [query["sql"] for query in ctx.captured_queries if "FOR UPDATE" in query["sql"]]
        self.assertTrue(any('"accounts_user"' in sql for sql in locks), locks)
        self.assertTrue(any('"surveys_surveysend"' in sql for sql in locks), locks)

    def test_only_the_owner_sends(self):
        shared = self.ready(sharing="workspace")
        response = self.send_now(shared, user=self.other)
        self.assertEqual(
            (response.status_code, response.data),
            (403, {"detail": "Only the survey's owner can change it."}),
        )
        self.assertEqual(self.send_now(self.ready(), user=self.other).status_code, 404)


class RefusalTests(SendFixture):
    def assertRefused(self, send, status, body):
        response = self.send_now(send)
        self.assertEqual((response.status_code, response.data), (status, body))
        send.refresh_from_db()
        self.assertEqual((send.status, send.started_at), ("draft", None))
        self.assertFalse(SurveyInvite.objects.exists())
        self.assertEqual(mail.outbox, [])

    def test_no_segment(self):
        self.assertRefused(self.make_send(), 400, {"segment": ["Choose a segment."]})

    def test_nobody_to_send_to(self):
        # Carl's segment pins only Taco Bell, which he cannot open.
        send = self.make_send(segment=self.pinned("customer", [self.taco]))
        self.assertRefused(send, 400, {"segment": ["Nobody to send to."]})

    def test_no_roles(self):
        self.assertRefused(self.ready(roles=[]), 400, {"roles": ["Choose at least one role."]})

    def test_more_than_500_people(self):
        with patch("services.surveys.sending.MAX_PEOPLE", 1):
            self.assertRefused(
                self.ready(), 400, {"segment": ["This survey would reach 2 people; the most is 1."]}
            )

    def test_someone_elses_segment(self):
        theirs = self.pinned("customer", [self.taco], owner=self.other, sharing="workspace")
        self.assertRefused(
            self.make_send(segment=theirs),
            403,
            {"detail": "You can only survey your own segments."},
        )

    def test_the_21st_send_of_the_day_is_429(self):
        SurveySend.objects.bulk_create(
            SurveySend(
                organisation=self.org,
                owner=self.csm,
                name=f"S{i}",
                survey_type="nps",
                subject="s",
                status="sent",
                started_at=self.now,
            )
            for i in range(20)
        )
        self.assertRefused(
            self.ready(),
            429,
            {"detail": "You can send at most 20 surveys a day. Try again tomorrow."},
        )

    def test_earlier_days_do_not_count(self):
        SurveySend.objects.bulk_create(
            SurveySend(
                organisation=self.org,
                owner=self.csm,
                name=f"S{i}",
                survey_type="nps",
                subject="s",
                status="sent",
                started_at=self.now - timedelta(days=2),
            )
            for i in range(20)
        )
        self.assertEqual(self.send_now(self.ready()).status_code, 200)


class SurveyEmailTests(SurveyFixture):
    def test_the_email_is_plain_text_with_the_question_and_the_link(self):
        send = self.make_send(subject="How are we doing?", intro="Two minutes, promise.")
        invite = self.make_invite(send, self.ann)
        send_survey_email(invite, "tok_123")
        (message,) = mail.outbox
        self.assertEqual(
            (message.subject, message.to, message.from_email),
            ("How are we doing?", ["ann@example.com"], settings.DEFAULT_FROM_EMAIL),
        )
        self.assertIn("Two minutes, promise.", message.body)
        self.assertIn(
            "How likely are you to recommend Acme Inc to a friend or colleague?", message.body
        )
        self.assertIn(f"{settings.FRONTEND_URL}/s/tok_123", message.body)
        self.assertIn("14 days", message.body)
        self.assertEqual(message.alternatives, [])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_sending --noinput`
Expected: ERROR, `ImportError: cannot import name 'send_survey_email' from 'services.email'`.

- [ ] **Step 3: Write the email, the send and its route**

Append to `services/email.py`:

```python
def send_survey_email(invite, token):
    """Emails one person their one-time survey link,
    {FRONTEND_URL}/s/<token>. Plain text: the intro is the builder's own
    words and is never rendered as HTML. The token exists only here and in
    the link; the invite stores its hash. Raises on failure;
    surveys.sending marks that invite failed and carries on with the batch."""

    from services.surveys.models import LINK_DAYS
    from services.surveys.questions import question_for

    send = invite.send
    intro = [send.intro, ""] if send.intro else []
    send_mail(
        subject=send.subject,
        message="\n".join(
            [
                *intro,
                question_for(send.survey_type, send.organisation.name),
                "",
                "Answer here, it takes a few seconds:",
                f"{settings.FRONTEND_URL}/s/{token}",
                "",
                f"The link works for {LINK_DAYS} days and takes one answer.",
            ]
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invite.email],
    )
```

`services/surveys/sending.py`:

```python
"""The send (spec §1.3): claim, deliver, finish.

1. The claim is one short transaction. The owner's row is locked first, so
   two sends at once queue for the daily count; then the send's row is
   locked, and anything but a draft is a 409. The audience is resolved again
   here, on the server, from the owner's own view. A refusal rolls back and
   leaves the draft as it was.
2. The delivery runs outside any transaction: one invite and one email per
   person. A failed email marks its own invite and the batch carries on.
3. The finish sets `sent`, `sent_at` and the frozen counts.

There is no task queue here (see CampaignSendView): the request is the send.
If the process dies during step 2 the send stays `sending`, never `draft`,
so nobody sends it twice by accident.
"""

import logging
from datetime import datetime, time, timedelta

from django.db import transaction
from django.utils import timezone

from services.accounts.models import User
from services.email import send_survey_email

from .access import NOT_SEGMENT_OWNER
from .audience import resolve
from .models import DAILY_SENDS, LINK_DAYS, MAX_PEOPLE, SurveyInvite, SurveySend
from .serializers import NO_ROLES
from .tokens import new_token

logger = logging.getLogger(__name__)

ALREADY_SENT = "This survey has already been sent."
BEING_SENT = "This survey is being sent."
DAILY_LIMIT = f"You can send at most {DAILY_SENDS} surveys a day. Try again tomorrow."
CHOOSE_SEGMENT = "Choose a segment."
NOBODY = "Nobody to send to."


class Refusal(Exception):
    """A send that may not go: the response's status and body."""

    def __init__(self, status, body):
        super().__init__(status)
        self.status = status
        self.body = body


def too_many(count):
    return f"This survey would reach {count} people; the most is {MAX_PEOPLE}."


def _start_of(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def claim(pk, user, *, today, now):
    """Locks, checks, resolves the audience and marks the send `sending`.
    Raises `Refusal`; returns `(send, audience)`."""
    with transaction.atomic():
        list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))
        send = (
            SurveySend.objects.select_for_update(of=("self",))
            .select_related("segment", "organisation")
            .get(pk=pk)
        )
        if send.status == SurveySend.Status.SENT:
            raise Refusal(409, {"detail": ALREADY_SENT})
        if send.status == SurveySend.Status.SENDING:
            raise Refusal(409, {"detail": BEING_SENT})
        started = SurveySend.objects.filter(owner=user, started_at__gte=_start_of(today)).count()
        if started >= DAILY_SENDS:
            raise Refusal(429, {"detail": DAILY_LIMIT})
        segment = send.segment
        if segment is None:
            raise Refusal(400, {"segment": [CHOOSE_SEGMENT]})
        # SOC2:AUTH-02 a survey goes only to the sender's own segment
        if segment.owner_id != user.pk:
            raise Refusal(403, {"detail": NOT_SEGMENT_OWNER})
        if segment.kind != "contact" and not send.roles:
            raise Refusal(400, {"roles": [NO_ROLES]})
        audience = resolve(segment, send.roles, user, today=today, now=now)
        if not audience.people:
            raise Refusal(400, {"segment": [NOBODY]})
        if len(audience.people) > MAX_PEOPLE:
            raise Refusal(400, {"segment": [too_many(len(audience.people))]})
        send.status = SurveySend.Status.SENDING
        send.started_at = now
        send.save(update_fields=["status", "started_at", "updated_at"])
    return send, audience


def deliver(send, audience, *, now):
    """One invite and one email per person; `(sent, failed)`."""
    expires_at = now + timedelta(days=LINK_DAYS)
    sent = failed = 0
    for person in audience.people:
        token, token_hash = new_token()
        invite = SurveyInvite.objects.create(
            send=send,
            contact=person,
            customer_id=person.customer_id,
            account_id=person.account_id,
            email=person.email.strip(),
            token_hash=token_hash,
            expires_at=expires_at,
        )
        try:
            send_survey_email(invite, token)
        except Exception as exc:  # noqa: BLE001 - one person's failure never stops the batch
            logger.warning("survey invite %s not sent: %s", invite.pk, type(exc).__name__)
            invite.status = SurveyInvite.Status.FAILED
            invite.failure = (str(exc) or type(exc).__name__)[:200]
            invite.save(update_fields=["status", "failure"])
            failed += 1
        else:
            sent += 1
    return sent, failed


def finish(send, audience, *, sent, failed, now):
    send.status = SurveySend.Status.SENT
    send.sent_at = now
    send.counts = {
        "audience": len(audience.people),
        "sent": sent,
        "failed": failed,
        "skipped_recent": audience.skipped_recent,
        "skipped_no_email": audience.skipped_no_email,
        "skipped_cap": audience.skipped_cap,
    }
    send.save(update_fields=["status", "sent_at", "counts", "updated_at"])
```

Append to `services/surveys/views.py`. Add `from .sending import Refusal, claim, deliver, finish` to its imports, then:

```python
class SendNowView(APIView):
    """POST /api/v1/surveys/sends/<id>/send/, the real send, owner only. It
    claims the draft (409 if already sent or sending, 429 past the daily
    limit), resolves the audience again on the server (400 if empty or over
    500), emails each person their link and freezes the counts. Returns the
    send."""

    # SOC2:AUTH-02 authentication here; `get_owned` and `claim` check the send and its segment
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        get_owned(request.user, pk)
        now = timezone.now()
        try:
            send, audience = claim(pk, request.user, today=timezone.localdate(), now=now)
        except Refusal as refusal:
            return Response(refusal.body, status=refusal.status)
        sent, failed = deliver(send, audience, now=now)
        finish(send, audience, sent=sent, failed=failed, now=timezone.now())
        audit.record(  # SOC2:LOG-01
            "survey.sent", request=request, target=send, metadata=dict(send.counts)
        )
        return Response(send_payload(send, request.user))
```

In `services/surveys/urls.py`, add after the `<int:pk>/` route:

```python
(path("<int:pk>/send/", views.SendNowView.as_view(), name="survey-send-now"),)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_sending services.surveys.tests.test_views --noinput`
Expected: PASS (15 + 21 tests).

- [ ] **Step 5: Commit**

```bash
git add services/email.py services/surveys
git commit -m "feat(surveys): send a survey: claim, one emailed link per person, frozen counts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Scores on each answer

Spec §1.5 steps 1–3. Decisions 11–13, 25 and 28.

**Files:**
- Modify:
  - `services/surveys/scores.py` (add the writes)
  - `services/customers/serializers.py` (`SurveySerializer.send_id`)
  - `services/customers/views.py` (`SENT_ROW`; `SurveyDetailView.update` and `destroy`)
- Test: `services/surveys/tests/test_scores.py`

**Interfaces:**
- Consumes:
  - `figure`, `whole` (Task 2);
  - `models.WINDOW_DAYS`, `SurveyInvite`;
  - `customers.models.Account`, `Survey`.
- Produces:
  - `SCORE_FIELD: dict[str, str]`;
  - `records_for(invite, survey_type) -> list[Customer | Account]`;
  - `answers_for(record, survey_type) -> QuerySet[SurveyInvite]`;
  - `refresh(record, survey_type, *, now) -> bool` (False when there are no live answers);
  - `upsert_log(send, record, *, now) -> Survey | None`;
  - `record_answer(invite, score, comment, *, now) -> None` (call it inside the caller's transaction, with the invite locked).
  - `SurveySerializer` rows gain `send_id`.
  - `customers.views.SENT_ROW = "This score comes from a sent survey and updates itself."`: PATCH/PUT on `/api/v1/surveys/<id>/` for a row with `send_id` set is 400 with that detail, DELETE is 409 with it; rows without a send are unchanged.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_scores.py`:

```python
"""What an answer does to the scores: the record's rolling 90-day figure
(an organisation's includes its accounts'; CES lands on the organisation
only) and one log row per send and record."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient

from services.customers.models import Survey
from services.surveys.scores import record_answer, refresh
from services.surveys.tests.fixtures import SurveyFixture, contact


class RefreshTests(SurveyFixture):
    def test_nps_is_promoters_minus_detractors_over_live_answers(self):
        send = self.make_send()
        for name, score in (("Pat", 10), ("Pia", 9), ("Dee", 3)):
            self.answered(send, contact(self.pizza, name), score)
        self.assertTrue(refresh(self.pizza, "nps", now=self.now))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 33)

    def test_csat_and_ces_keep_two_decimals(self):
        csat = self.make_send(survey_type="csat")
        for name, score in (("Al", 5), ("Bo", 4), ("Cy", 1)):
            self.answered(csat, contact(self.pizza, name), score)
        ces = self.make_send(survey_type="ces")
        for name, score in (("Di", 7), ("Ed", 4), ("Fi", 2)):
            self.answered(ces, contact(self.pizza, name), score)
        refresh(self.pizza, "csat", now=self.now)
        refresh(self.pizza, "ces", now=self.now)
        self.pizza.refresh_from_db()
        self.assertEqual(
            (self.pizza.csat_score, self.pizza.ces_percentage), (Decimal("66.67"), Decimal("33.33"))
        )

    def test_only_answers_from_the_last_90_days_count(self):
        send = self.make_send()
        self.answered(send, self.ann, 0, days_ago=91)
        self.answered(send, contact(self.pizza, "Pia"), 10, days_ago=89)
        refresh(self.pizza, "nps", now=self.now)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)

    def test_a_record_with_no_live_answers_keeps_its_score(self):
        self.pizza.nps_score = 40
        self.pizza.save(update_fields=["nps_score"])
        self.answered(self.make_send(), self.ann, 0, days_ago=120)
        self.assertFalse(refresh(self.pizza, "nps", now=self.now))
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 40)

    def test_pending_failed_and_other_types_do_not_count(self):
        send = self.make_send()
        self.answered(send, self.ann, 10)
        self.make_invite(send, contact(self.pizza, "Pia"))
        self.make_invite(send, contact(self.pizza, "Fay"), status="failed", failure="x")
        self.answered(self.make_send(survey_type="csat"), contact(self.pizza, "Cy"), 1)
        refresh(self.pizza, "nps", now=self.now)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)

    def test_an_organisation_counts_its_accounts_answers_and_an_account_only_its_own(self):
        send = self.make_send()
        self.answered(send, self.ann, 10)
        self.answered(send, self.ben, 0)
        refresh(self.pizza, "nps", now=self.now)
        refresh(self.emea, "nps", now=self.now)
        self.pizza.refresh_from_db()
        self.emea.refresh_from_db()
        self.assertEqual((self.pizza.nps_score, self.emea.nps_score), (0, -100))


class RecordAnswerTests(SurveyFixture):
    def answer(self, send, person, score, comment=""):
        invite = self.make_invite(send, person)
        record_answer(invite, score, comment, now=self.now)
        return invite

    def log_rows(self, send):
        return set(
            Survey.objects.filter(send=send).values_list("customer_id", "account_id", "score")
        )

    def test_an_answer_moves_the_organisation_and_writes_its_log_row(self):
        send = self.make_send(started_at=self.now, sent_at=self.now)
        invite = self.answer(send, self.ann, 9, "Great")
        invite.refresh_from_db()
        self.assertEqual(
            (invite.status, invite.score, invite.comment, invite.answered_at),
            ("answered", 9, "Great", self.now),
        )
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)
        row = Survey.objects.get(send=send)
        today = timezone.localdate(self.now)
        self.assertEqual(
            (row.customer_id, row.account_id, row.survey_type, row.status, row.score),
            (self.pizza.pk, None, "nps", "responded", 100),
        )
        self.assertEqual((row.sent_at, row.responded_at), (today, today))

    def test_an_account_contacts_answer_moves_the_account_and_its_organisation(self):
        send = self.make_send(sent_at=self.now)
        self.answer(send, self.ben, 0)
        self.pizza.refresh_from_db()
        self.emea.refresh_from_db()
        self.assertEqual((self.pizza.nps_score, self.emea.nps_score), (-100, -100))
        self.assertEqual(
            self.log_rows(send), {(self.pizza.pk, None, -100), (None, self.emea.pk, -100)}
        )

    def test_an_account_contacts_ces_answer_scores_only_its_organisation(self):
        send = self.make_send(survey_type="ces", sent_at=self.now)
        self.answer(send, self.ben, 6)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.ces_percentage, Decimal("100.00"))
        self.assertEqual(self.log_rows(send), {(self.pizza.pk, None, 100)})

    def test_an_account_on_two_organisations_scores_both(self):
        self.emea.customers.add(self.taco)
        send = self.make_send(sent_at=self.now)
        self.answer(send, self.ben, 10)
        self.taco.refresh_from_db()
        self.assertEqual(self.taco.nps_score, 100)
        self.assertEqual(len(self.log_rows(send)), 3)

    def test_the_log_row_is_upserted_as_answers_arrive(self):
        send = self.make_send(sent_at=self.now)
        self.answer(send, self.ann, 10)
        self.answer(send, contact(self.pizza, "Pia"), 0)
        self.assertEqual(self.log_rows(send), {(self.pizza.pk, None, 0)})

    def test_the_log_row_is_this_sends_figure_and_the_record_the_90_day_one(self):
        self.answered(self.make_send(), contact(self.pizza, "Old"), 0, days_ago=10)
        send = self.make_send(sent_at=self.now)
        self.answer(send, self.ann, 10)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 0)
        self.assertEqual(self.log_rows(send), {(self.pizza.pk, None, 100)})

    def test_a_send_still_sending_logs_with_its_start_date(self):
        started = self.now - timedelta(days=1)
        send = self.make_send(status="sending", started_at=started)
        self.answer(send, self.ann, 10)
        self.assertEqual(Survey.objects.get(send=send).sent_at, timezone.localdate(started))


class LogRowApiTests(SurveyFixture):
    def test_the_logged_list_names_the_send_behind_a_row(self):
        send = self.make_send(sent_at=self.now)
        record_answer(self.make_invite(send, self.ann), 9, "", now=self.now)
        by_hand = Survey.objects.create(
            customer=self.pizza, survey_type="csat", status="sent", sent_at=self.today
        )
        client = APIClient()
        client.force_authenticate(self.admin)
        rows = {row["id"]: row for row in client.get("/api/v1/surveys/").data}
        self.assertEqual(rows[Survey.objects.get(send=send).pk]["send_id"], send.pk)
        self.assertIsNone(rows[by_hand.pk]["send_id"])


class SendWrittenRowTests(SurveyFixture):
    """A log row a send wrote updates itself from the answers: the existing
    Surveys API reads it but neither edits nor deletes it. Rows logged by
    hand are unchanged."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        send = cls.make_send(sent_at=cls.now)
        record_answer(cls.make_invite(send, cls.ann), 9, "", now=cls.now)
        cls.from_send = Survey.objects.get(send=send)
        cls.by_hand = Survey.objects.create(
            customer=cls.pizza, survey_type="nps", status="sent", sent_at=cls.today
        )

    def api(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        return client

    def test_a_send_written_row_cannot_be_edited(self):
        url = f"/api/v1/surveys/{self.from_send.pk}/"
        full = {"survey_type": "nps", "status": "responded", "score": -50, "sent_at": "2026-10-01"}
        for response in (
            self.api().patch(url, {"score": -50}, format="json"),
            self.api().put(url, full, format="json"),
        ):
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"detail": "This score comes from a sent survey and updates itself."}),
            )
        self.from_send.refresh_from_db()
        self.pizza.refresh_from_db()
        self.assertEqual((self.from_send.score, self.pizza.nps_score), (100, 100))

    def test_a_send_written_row_cannot_be_deleted(self):
        response = self.api().delete(f"/api/v1/surveys/{self.from_send.pk}/")
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"detail": "This score comes from a sent survey and updates itself."}),
        )
        self.assertTrue(Survey.objects.filter(pk=self.from_send.pk).exists())

    def test_a_send_written_row_can_still_be_read(self):
        response = self.api().get(f"/api/v1/surveys/{self.from_send.pk}/")
        self.assertEqual((response.status_code, response.data["score"]), (200, 100))

    def test_rows_logged_by_hand_are_unchanged(self):
        url = f"/api/v1/surveys/{self.by_hand.pk}/"
        response = self.api().patch(url, {"status": "responded", "score": 40}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 40)
        self.assertEqual(self.api().delete(url).status_code, 204)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_scores --noinput`
Expected: ERROR, `ImportError: cannot import name 'record_answer' from 'services.surveys.scores'`.

- [ ] **Step 3: Write the score writes, `send_id` and the read-only rule**

In `services/surveys/scores.py`, replace the import block with:

```python
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Q
from django.utils import timezone

from services.customers.models import Account, Survey

from .models import WINDOW_DAYS, SurveyInvite
from .questions import BANDS, CES, HIGH, LOW, NPS, band_of
```

Then append to the module:

```python
#: The record field each type's figure is written to. `Account` has no CES field.
SCORE_FIELD = {"nps": "nps_score", "csat": "csat_score", "ces": "ces_percentage"}


def records_for(invite, survey_type):
    """The records one answer scores. An organisation contact's answer
    scores that organisation. An account contact's answer scores the
    account (NPS, CSAT) and every organisation the account belongs to,
    which is also where its CES goes."""
    if invite.customer_id:
        return [invite.customer]
    account = invite.account
    organisations = list(account.customers.all())
    return organisations if survey_type == CES else [account, *organisations]


def answers_for(record, survey_type):
    """Answered invites of `survey_type` that score `record`: an account's
    own, or an organisation's own and its accounts'. Subqueries, so no
    answer is counted twice."""
    answered = SurveyInvite.objects.filter(
        status=SurveyInvite.Status.ANSWERED, send__survey_type=survey_type
    )
    if isinstance(record, Account):
        return answered.filter(account=record)
    accounts = Account.objects.filter(customers=record).values("pk")
    return answered.filter(Q(customer=record) | Q(account__in=accounts))


def refresh(record, survey_type, *, now):
    """Writes the 90-day figure onto the record. False, and the score left
    as it is, when no answer is live."""
    since = now - timedelta(days=WINDOW_DAYS)
    scores = answers_for(record, survey_type).filter(answered_at__gte=since)
    value = figure(survey_type, scores.values_list("score", flat=True))
    if value is None:
        return False
    field = SCORE_FIELD[survey_type]
    setattr(record, field, whole(value) if survey_type == NPS else value)
    record.save(update_fields=[field])
    return True


def upsert_log(send, record, *, now):
    """The send's own log row for `record`: this send's figure for it so
    far, every answer, with no 90-day window."""
    scores = answers_for(record, send.survey_type).filter(send=send)
    value = figure(send.survey_type, scores.values_list("score", flat=True))
    if value is None:
        return None
    parent = {"account": record} if isinstance(record, Account) else {"customer": record}
    row, _created = Survey.objects.update_or_create(
        send=send,
        **parent,
        defaults={
            "survey_type": send.survey_type,
            "status": Survey.Status.RESPONDED,
            "score": whole(value),
            "sent_at": timezone.localdate(send.sent_at or send.started_at or now),
            "responded_at": timezone.localdate(now),
        },
    )
    return row


def record_answer(invite, score, comment, *, now):
    """The invite becomes answered; each record it scores gets its 90-day
    figure again and its log row for this send. Run it inside the caller's
    transaction, with the invite locked."""
    invite.status = SurveyInvite.Status.ANSWERED
    invite.score = score
    invite.comment = comment
    invite.answered_at = now
    invite.save(update_fields=["status", "score", "comment", "answered_at"])
    send = invite.send
    for record in records_for(invite, send.survey_type):
        refresh(record, send.survey_type, now=now)
        upsert_log(send, record, now=now)
```

`BANDS`, `HIGH`, `LOW` and `band_of` stay imported for the Task 2 functions. `CES` is new.

In `services/customers/serializers.py`'s `SurveySerializer.Meta`, add `"send_id"` to `fields` after `"account_name"`. Change `read_only_fields` to `["created_at", "account_id", "send_id"]`.

In `services/customers/views.py`, add this constant directly above `class SurveyDetailView`:

```python
#: A log row a survey send wrote (`Survey.send` set) is the send's own
#: figure, upserted on every answer (services/surveys/scores.py): a hand
#: edit would be overwritten by the next answer, so it is read-only here.
SENT_ROW = "This score comes from a sent survey and updates itself."
```

and add these two methods to `SurveyDetailView`, above its `perform_update`. `update` serves both PUT and PATCH (`partial_update` calls it). `get_object` runs first, so a row the caller may not open is still a 404:

```python
def update(self, request, *args, **kwargs):
    if self.get_object().send_id is not None:
        return Response({"detail": SENT_ROW}, status=status.HTTP_400_BAD_REQUEST)
    return super().update(request, *args, **kwargs)


def destroy(self, request, *args, **kwargs):
    if self.get_object().send_id is not None:
        return Response({"detail": SENT_ROW}, status=status.HTTP_409_CONFLICT)
    return super().destroy(request, *args, **kwargs)
```

`Response` and `status` are already imported in that module.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_scores services.customers.tests --noinput`
Expected: PASS. The survey tests in `services.customers.tests` only gain a field, and their rows have no send, so the read-only rule never touches them.

- [ ] **Step 5: Commit**

```bash
git add services/surveys/scores.py services/surveys/tests/test_scores.py services/customers/serializers.py services/customers/views.py
git commit -m "feat(surveys): an answer refreshes the 90-day NPS/CSAT/CES and upserts its log row; send-written rows are read-only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The public link

Spec §1.4 and §3. Decisions 9, 22, 23 and 26.

**Files:**
- Create:
  - `services/surveys/public_views.py`
  - `services/surveys/public_urls.py`
- Modify:
  - `services/surveys/serializers.py` (add `AnswerSerializer`)
  - `core/throttling.py` (`SurveyLinkThrottle`)
  - `config/settings.py` (`AUTH_THROTTLE_RATES["survey_link"]`)
  - `config/urls.py` (mount `api/v1/public/surveys/`)
  - `.soc2/config.yml` (`public_routes`)
- Test: `services/surveys/tests/test_public.py`

**Interfaces:**
- Consumes:
  - `tokens.hash_token`;
  - `questions.question_for`, `SCALES`;
  - `scores.record_answer`;
  - `core.audit.record`;
  - `core.throttling._PerIPThrottle`.
- Produces:
  - `core.throttling.SurveyLinkThrottle` (scope `survey_link`);
  - `serializers.AnswerSerializer` (context `survey_type`);
  - `public_views.EXPIRED = {"detail": "This link has expired."}`, `MAX_TOKEN_LENGTH = 100`, `SurveyLinkView`;
  - route `GET/POST /api/v1/public/surveys/<token>/`.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_public.py`:

```python
"""The public link: no sign-in, the question and the workspace's name
only, one 404 body for every bad link, one answer, range-checked, locked
against a double submit, audited without the token, rate limited per IP."""

import json
from datetime import timedelta
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import AuditEvent
from core.throttling import SurveyLinkThrottle
from services.customers.models import Survey
from services.surveys.tests.fixtures import SurveyFixture, contact

URL = "/api/v1/public/surveys/{}/"
EXPIRED = {"detail": "This link has expired."}


class LinkFixture(SurveyFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.send = cls.make_send(
            intro="Two minutes, promise.", status="sent", started_at=cls.now, sent_at=cls.now
        )
        cls.live = cls.make_invite(cls.send, cls.ann)

    def get(self, token, **extra):
        return APIClient().get(URL.format(token), **extra)

    def post(self, token, body, **extra):
        return APIClient().post(URL.format(token), body, format="json", **extra)


class ReadLinkTests(LinkFixture):
    def test_a_live_link_shows_the_question_and_nothing_about_the_person(self):
        response = self.get(self.live.token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "survey_type": "nps",
                "question": "How likely are you to recommend Acme Inc to a friend or colleague?",
                "intro": "Two minutes, promise.",
                "organisation_name": "Acme Inc",
            },
        )

    def test_no_sign_in_is_needed_or_read(self):
        response = self.get(self.live.token, HTTP_AUTHORIZATION="Bearer not-a-jwt")
        self.assertEqual(response.status_code, 200)

    def test_every_bad_link_reads_the_same(self):
        expired = self.make_invite(self.send, self.ben, expires_at=self.now - timedelta(seconds=1))
        answered = self.answered(self.send, self.tia, 9)
        failed = self.make_invite(self.send, self.tom, status="failed", failure="bounced")
        for token in (expired.token, answered.token, failed.token, "not-a-token", "x" * 500):
            response = self.get(token)
            self.assertEqual((response.status_code, response.json()), (404, EXPIRED), token[:20])


class AnswerLinkTests(LinkFixture):
    def test_an_answer_is_recorded_once_and_moves_the_score(self):
        response = self.post(self.live.token, {"score": 10, "comment": "  Great service  "})
        self.assertEqual(response.status_code, 204, response.content)
        self.live.refresh_from_db()
        self.assertEqual(
            (self.live.status, self.live.score, self.live.comment),
            ("answered", 10, "Great service"),
        )
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)
        self.assertTrue(Survey.objects.filter(send=self.send, customer=self.pizza).exists())
        second = self.post(self.live.token, {"score": 0})
        self.assertEqual((second.status_code, second.json()), (404, EXPIRED))
        self.live.refresh_from_db()
        self.assertEqual(self.live.score, 10)

    def test_the_answer_is_audited_without_the_token(self):
        self.post(self.live.token, {"score": 7})
        event = AuditEvent.objects.get(action="survey.answered")
        self.assertEqual(
            (event.target_id, event.actor, event.organisation, event.metadata),
            (str(self.live.pk), None, self.org, {"send": self.send.pk}),
        )
        self.assertNotIn(self.live.token, json.dumps(event.metadata) + event.target_repr)

    def test_the_score_must_fit_the_type(self):
        for survey_type, bad, low, high in (
            ("nps", 11, 0, 10),
            ("csat", 0, 1, 5),
            ("ces", 8, 1, 7),
        ):
            send = self.make_send(survey_type=survey_type)
            invite = self.make_invite(send, contact(self.pizza, f"P{survey_type}"))
            response = self.post(invite.token, {"score": bad})
            self.assertEqual(
                (response.status_code, response.json()),
                (400, {"score": [f"Choose a score from {low} to {high}."]}),
            )
            invite.refresh_from_db()
            self.assertEqual(invite.status, "pending")

    def test_a_score_is_a_whole_number(self):
        for bad in ("high", 7.5, None, True):
            response = self.post(self.live.token, {"score": bad})
            self.assertEqual((response.status_code, set(response.json())), (400, {"score"}), bad)

    def test_a_comment_is_at_most_2000_characters(self):
        response = self.post(self.live.token, {"score": 9, "comment": "x" * 2001})
        self.assertEqual((response.status_code, set(response.json())), (400, {"comment"}))
        self.assertEqual(
            self.post(self.live.token, {"score": 9, "comment": "x" * 2000}).status_code, 204
        )

    def test_an_expired_link_takes_no_answer(self):
        expired = self.make_invite(self.send, self.ben, expires_at=self.now - timedelta(seconds=1))
        response = self.post(expired.token, {"score": 9})
        self.assertEqual((response.status_code, response.json()), (404, EXPIRED))
        expired.refresh_from_db()
        self.assertEqual(expired.status, "pending")

    def test_the_answer_locks_the_invite(self):
        with CaptureQueriesContext(connection) as ctx:
            self.post(self.live.token, {"score": 8})
        self.assertTrue(
            any(
                "FOR UPDATE" in query["sql"] and '"surveys_surveyinvite"' in query["sql"]
                for query in ctx.captured_queries
            )
        )


class LinkThrottleTests(LinkFixture):
    def setUp(self):
        cache.clear()

    @mock.patch.object(SurveyLinkThrottle, "rate", "2/min")
    def test_reads_and_answers_share_one_limit_per_ip(self):
        ip = {"REMOTE_ADDR": "203.0.113.9"}
        self.assertEqual(self.get("nope", **ip).status_code, 404)
        self.assertEqual(self.post("nope", {"score": 1}, **ip).status_code, 404)
        blocked = self.get(self.live.token, **ip)
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked)
        self.assertEqual(self.get(self.live.token, REMOTE_ADDR="198.51.100.1").status_code, 200)

    def test_the_rate_is_30_a_minute(self):
        self.assertEqual(settings.AUTH_THROTTLE_RATES["survey_link"], "30/min")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_public --noinput`
Expected: ERROR, `ImportError: cannot import name 'SurveyLinkThrottle' from 'core.throttling'`.

- [ ] **Step 3: Write the throttle, the serializer, the view and the route**

Append to `core/throttling.py`:

```python
class SurveyLinkThrottle(_PerIPThrottle):
    """The public survey link (services/surveys/public_views.py): reads and
    answers together, per source IP. The token is a 32-byte secret, so this
    is about load and noise rather than guessing."""

    scope = "survey_link"
```

In `config/settings.py`'s `AUTH_THROTTLE_RATES`, add after the `token_refresh` line:

```python
    # per source IP: the public survey link, reads and answers together
    "survey_link": env("THROTTLE_SURVEY_LINK", default="30/min"),
```

Append to `services/surveys/serializers.py`. Add `from .questions import SCALES` to its imports, then:

```python
class AnswerSerializer(serializers.Serializer):
    """One answer from the public form: a whole-number score in the type's
    range (context `survey_type`) and an optional plain-text comment."""

    score = serializers.IntegerField()
    comment = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)

    def validate_score(self, value):
        low, high = SCALES[self.context["survey_type"]]
        if not low <= value <= high:
            raise serializers.ValidationError(f"Choose a score from {low} to {high}.")
        return value
```

`services/surveys/public_views.py`:

```python
"""The one-time survey link (spec §1.4): no sign-in. The link's secret is
the credential: it is looked up by its SHA-256 only, and every bad link
(unknown, expired, answered, failed) reads the same 404. Nothing about the
person or any other answer is returned."""

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from core.throttling import SurveyLinkThrottle

from .models import SurveyInvite
from .questions import question_for
from .scores import record_answer
from .serializers import AnswerSerializer
from .tokens import hash_token

EXPIRED = {"detail": "This link has expired."}
#: A real token is 43 characters; anything far longer is not worth hashing.
MAX_TOKEN_LENGTH = 100


def _live(invites, token, now):
    """The pending, unexpired invite whose token this is, or None."""
    if len(token) > MAX_TOKEN_LENGTH:
        return None
    return invites.filter(
        token_hash=hash_token(token), status=SurveyInvite.Status.PENDING, expires_at__gt=now
    ).first()


class SurveyLinkView(APIView):
    """GET/POST /api/v1/public/surveys/<token>/. GET returns `{survey_type,
    question, intro, organisation_name}`. POST takes `{score, comment?}` and
    answers 204."""

    # SOC2:AUTH-02 public by design: the link's secret is the credential, looked up by
    # hash only, one answer, 14 days, one 404 body for every bad link
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [SurveyLinkThrottle]  # SOC2:AUTH-06

    def get(self, request, token):
        invites = SurveyInvite.objects.select_related("send__organisation")
        invite = _live(invites, token, timezone.now())
        if invite is None:
            return Response(EXPIRED, status=status.HTTP_404_NOT_FOUND)
        send = invite.send
        return Response(
            {
                "survey_type": send.survey_type,
                "question": question_for(send.survey_type, send.organisation.name),
                "intro": send.intro,
                "organisation_name": send.organisation.name,
            }
        )

    def post(self, request, token):
        now = timezone.now()
        with transaction.atomic():
            # Locked, and re-read as pending under the lock: a second answer,
            # even one racing this one, finds nothing and gets the same 404.
            invites = SurveyInvite.objects.select_for_update(of=("self",)).select_related(
                "send__organisation"
            )
            invite = _live(invites, token, now)
            if invite is None:
                return Response(EXPIRED, status=status.HTTP_404_NOT_FOUND)
            serializer = AnswerSerializer(
                data=request.data, context={"survey_type": invite.send.survey_type}
            )
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            record_answer(invite, data["score"], data["comment"], now=now)
            audit.record(  # SOC2:LOG-01
                "survey.answered",
                request=request,
                organisation=invite.send.organisation,
                target=invite,
                metadata={"send": invite.send_id},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
```

`services/surveys/public_urls.py`:

```python
from django.urls import path

from .public_views import SurveyLinkView

urlpatterns = [
    path("<str:token>/", SurveyLinkView.as_view(), name="survey-link"),
]
```

In `config/urls.py`, add directly below the `api/v1/surveys/sends/` line from Task 4:

```python
# The one-time survey link the email carries: public, no sign-in, throttled.
(path("api/v1/public/surveys/", include("services.surveys.public_urls")),)
```

In `.soc2/config.yml`'s `public_routes`, add after `- "POST /api/v1/auth/password-reset/confirm/"`:

```yaml
  - "GET /api/v1/public/surveys/<token>/"
  - "POST /api/v1/public/surveys/<token>/"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_public core.tests.test_throttling --noinput`
Expected: PASS. The existing throttle tests are unaffected.

- [ ] **Step 5: Commit**

```bash
git add core/throttling.py config/settings.py config/urls.py .soc2/config.yml services/surveys
git commit -m "feat(surveys): the public one-time link: question, one answer, one 404, throttled

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Answers and who has not answered

Spec §1.6 (answers, pending, `hidden_count`) and §3. Decisions 10, 20 and 21.

**Files:**
- Create: `services/surveys/answers.py`
- Modify:
  - `services/surveys/views.py` (add `SendAnswersView`, `SendPendingView`)
  - `services/surveys/urls.py`
- Test: `services/surveys/tests/test_reading.py`

**Interfaces:**
- Consumes:
  - `access.get_readable`;
  - `questions.LOW`, `band_of`;
  - `customers.scoping.visible_children_q`;
  - `organizations.rows.iso`.
- Produces:
  - `answers`:
    - `PAGE_SIZE = 50`, `FILTERS = ("all", "detractors", "comments")`;
    - `encode_cursor(invite) -> str`, `decode_cursor(cursor) -> tuple[datetime, int] | None`;
    - `answers_page(send, viewer, params) -> {"filter", "results", "next_cursor", "hidden_count"}`;
    - `pending_rows(send, viewer, *, now) -> {"results", "hidden_count"}`.
  - Routes: `GET /api/v1/surveys/sends/<id>/answers/` and `GET /api/v1/surveys/sends/<id>/pending/`.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_reading.py`:

```python
"""Reading a send's answers and who has not answered: rows only for people
the reader may open, a count for the rest, filters, a keyset cursor, and
the same 404 for a send the reader may not see."""

from datetime import timedelta
from unittest.mock import patch

from rest_framework.test import APIClient

from services.surveys.tests.fixtures import SurveyFixture, contact

URL = "/api/v1/surveys/sends/{}/{}/"


class ReadingFixture(SurveyFixture):
    """Alice's workspace NPS send: Ben answered 3 a day ago, Ann 10 ("Love
    it") two days ago, Tia 0 ("Slow") three days ago. Tom's link expired
    unanswered; Una's email (Pizza Hut) failed. Carl may open Ann, Ben and
    Una; Tia and Tom are Dana's."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.send = cls.make_send(
            owner=cls.admin, sharing="workspace", status="sent", started_at=cls.now, sent_at=cls.now
        )
        cls.ben_answer = cls.answered(cls.send, cls.ben, 3, days_ago=1)
        cls.ann_answer = cls.answered(cls.send, cls.ann, 10, days_ago=2, comment="Love it")
        cls.tia_answer = cls.answered(cls.send, cls.tia, 0, days_ago=3, comment="Slow")
        cls.tom_invite = cls.make_invite(cls.send, cls.tom, expires_at=cls.now - timedelta(days=1))
        cls.una = contact(cls.pizza, "Una")
        cls.una_invite = cls.make_invite(cls.send, cls.una, status="failed", failure="mailbox full")
        cls.private = cls.make_send(owner=cls.admin)

    def read(self, user, what, send=None, **query):
        client = APIClient()
        client.force_authenticate(user)
        return client.get(URL.format((send or self.send).pk, what), query)

    def names(self, body):
        return [row["contact"]["name"] if row["contact"] else None for row in body["results"]]


class AnswersTests(ReadingFixture):
    def test_the_owner_reads_every_answer_newest_first(self):
        body = self.read(self.admin, "answers").data
        self.assertEqual(
            (self.names(body), body["hidden_count"], body["filter"]),
            (["Ben", "Ann", "Tia"], 0, "all"),
        )
        self.assertEqual(
            body["results"][0],
            {
                "id": self.ben_answer.pk,
                "contact": {"id": self.ben.pk, "name": "Ben"},
                "record": {"kind": "account", "id": self.emea.pk, "name": "Pizza EMEA"},
                "score": 3,
                "band": "detractors",
                "comment": "",
                "answered_at": self.ben_answer.answered_at.isoformat(),
            },
        )

    def test_a_shared_reader_reads_only_people_they_may_open(self):
        body = self.read(self.csm, "answers").data
        self.assertEqual((self.names(body), body["hidden_count"]), (["Ben", "Ann"], 1))

    def test_the_filters(self):
        detractors = self.read(self.admin, "answers", filter="detractors").data
        self.assertEqual(self.names(detractors), ["Ben", "Tia"])
        comments = self.read(self.csm, "answers", filter="comments").data
        self.assertEqual((self.names(comments), comments["hidden_count"]), (["Ann"], 1))
        unknown = self.read(self.admin, "answers", filter="everything").data
        self.assertEqual((unknown["filter"], len(unknown["results"])), ("all", 3))

    def test_an_answer_whose_contact_was_deleted_stays_unnamed(self):
        self.ann.delete()
        body = self.read(self.csm, "answers").data
        self.assertEqual(self.names(body), ["Ben", None])
        self.assertEqual(
            body["results"][1]["record"],
            {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"},
        )

    def test_pages_follow_an_opaque_cursor(self):
        with patch("services.surveys.answers.PAGE_SIZE", 2):
            first = self.read(self.admin, "answers").data
            second = self.read(self.admin, "answers", cursor=first["next_cursor"]).data
            broken = self.read(self.admin, "answers", cursor="not!base64").data
        self.assertEqual((self.names(first), self.names(second)), (["Ben", "Ann"], ["Tia"]))
        self.assertIsNone(second["next_cursor"])
        self.assertNotIn("/", first["next_cursor"])
        self.assertEqual(self.names(broken), ["Ben", "Ann"])


class PendingTests(ReadingFixture):
    def test_the_owner_sees_who_has_not_answered_and_why(self):
        body = self.read(self.admin, "pending").data
        self.assertEqual(body["hidden_count"], 0)
        rows = {row["contact"]["name"]: row for row in body["results"]}
        self.assertEqual(set(rows), {"Tom", "Una"})
        self.assertEqual(
            rows["Tom"],
            {
                "id": self.tom_invite.pk,
                "contact": {"id": self.tom.pk, "name": "Tom"},
                "record": {"kind": "account", "id": self.west.pk, "name": "Taco West"},
                "status": "expired",
                "expires_at": self.tom_invite.expires_at.isoformat(),
                "failure": None,
            },
        )
        self.assertEqual(
            (rows["Una"]["status"], rows["Una"]["failure"]), ("failed", "mailbox full")
        )
        self.assertNotIn("email", rows["Una"])

    def test_a_shared_reader_sees_only_people_they_may_open(self):
        body = self.read(self.csm, "pending").data
        self.assertEqual(
            ([row["contact"]["name"] for row in body["results"]], body["hidden_count"]),
            (["Una"], 1),
        )


class ReadingAccessTests(ReadingFixture):
    def test_a_send_the_reader_may_not_see_is_404(self):
        for what in ("answers", "pending"):
            self.assertEqual(self.read(self.csm, what, send=self.private).status_code, 404)
            self.assertEqual(APIClient().get(URL.format(self.send.pk, what)).status_code, 401)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_reading --noinput`
Expected: FAIL. The routes are missing, so the reads return 404 and `.data` has no `results`.

- [ ] **Step 3: Write `answers.py`, the views and the routes**

`services/surveys/answers.py`:

```python
"""Who answered and who has not, as the reader may see them (spec §1.6).

Rows name only people on records the reader may open; the rest are a count
that names nobody. An invite's own record (its organisation or account,
copied from the contact at send time) carries the rule, so an answer whose
contact was deleted still follows it."""

import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime

from django.db.models import Q

from services.customers.scoping import visible_children_q
from services.organizations.rows import iso

from .models import SurveyInvite
from .questions import LOW, band_of

PAGE_SIZE = 50
FILTERS = ("all", "detractors", "comments")


def encode_cursor(invite):
    raw = json.dumps([invite.answered_at.isoformat(), invite.pk])
    return urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor):
    """(answered_at, id) after which the next page starts, or None (the
    first page) for a missing, malformed or tampered cursor."""
    if not cursor:
        return None
    try:
        when, pk = json.loads(urlsafe_b64decode(cursor.encode()))
        when = datetime.fromisoformat(when)
        pk = int(pk)
    except (ValueError, TypeError):
        return None
    return (when, pk) if when.tzinfo is not None else None


def _contact(invite):
    return (
        None if invite.contact is None else {"id": invite.contact.pk, "name": invite.contact.name}
    )


def _record(invite):
    if invite.account_id:
        return {"kind": "account", "id": invite.account_id, "name": invite.account.name}
    return {"kind": "customer", "id": invite.customer_id, "name": invite.customer.name}


def answers_page(send, viewer, params):
    """`?filter=all|detractors|comments&cursor=`: newest first, PAGE_SIZE a
    page."""
    choice = params.get("filter") if params.get("filter") in FILTERS else "all"
    answers = send.invites.filter(status=SurveyInvite.Status.ANSWERED)
    if choice == "detractors":
        answers = answers.filter(score__lte=LOW[send.survey_type])
    elif choice == "comments":
        answers = answers.exclude(comment="")
    # SOC2:AUTH-02 answers are named only for people the reader may open; the rest are a count
    seen = answers.filter(visible_children_q(viewer))
    hidden_count = answers.count() - seen.count()
    rows = seen.select_related("contact", "customer", "account").order_by("-answered_at", "-pk")
    after = decode_cursor(params.get("cursor"))
    if after is not None:
        when, pk = after
        rows = rows.filter(Q(answered_at__lt=when) | Q(answered_at=when, pk__lt=pk))
    page = list(rows[: PAGE_SIZE + 1])
    more = len(page) > PAGE_SIZE
    page = page[:PAGE_SIZE]
    return {
        "filter": choice,
        "results": [
            {
                "id": invite.pk,
                "contact": _contact(invite),
                "record": _record(invite),
                "score": invite.score,
                "band": band_of(send.survey_type, invite.score),
                "comment": invite.comment,
                "answered_at": iso(invite.answered_at),
            }
            for invite in page
        ],
        "next_cursor": encode_cursor(page[-1]) if more else None,
        "hidden_count": hidden_count,
    }


def pending_rows(send, viewer, *, now):
    """Everyone not answered (pending, expired or failed), by name. A send
    has at most 500 people, so there is no paging. The email address is
    never returned."""
    waiting = send.invites.exclude(status=SurveyInvite.Status.ANSWERED)
    # SOC2:AUTH-02 named only for people the reader may open; the rest are a count
    seen = (
        waiting.filter(visible_children_q(viewer))
        .select_related("contact", "customer", "account")
        .order_by("contact__name", "pk")
    )
    rows = []
    for invite in seen:
        state = invite.status
        if state == SurveyInvite.Status.PENDING and invite.expires_at <= now:
            state = "expired"
        rows.append(
            {
                "id": invite.pk,
                "contact": _contact(invite),
                "record": _record(invite),
                "status": state,
                "expires_at": iso(invite.expires_at),
                "failure": invite.failure or None,
            }
        )
    return {"results": rows, "hidden_count": waiting.count() - len(rows)}
```

Append to `services/surveys/views.py`. Add `from .answers import answers_page, pending_rows` to its imports, then:

```python
class SendAnswersView(APIView):
    """GET /api/v1/surveys/sends/<id>/answers/?filter=&cursor=, the answers
    of people the caller may open, newest first, plus `hidden_count`."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the send, `answers_page` each row
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        send = get_readable(request.user, pk)
        return Response(answers_page(send, request.user, request.query_params))


class SendPendingView(APIView):
    """GET /api/v1/surveys/sends/<id>/pending/, the people the caller may
    open who have not answered (pending, expired or failed), plus
    `hidden_count`."""

    # SOC2:AUTH-02 authentication here; `get_readable` checks the send, `pending_rows` each row
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        send = get_readable(request.user, pk)
        return Response(pending_rows(send, request.user, now=timezone.now()))
```

In `services/surveys/urls.py`, add:

```python
(path("<int:pk>/answers/", views.SendAnswersView.as_view(), name="survey-send-answers"),)
(path("<int:pk>/pending/", views.SendPendingView.as_view(), name="survey-send-pending"),)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_reading --noinput`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add services/surveys
git commit -m "feat(surveys): read a send's answers and who has not answered, twice filtered

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The nightly refresh

Spec §1.5, last paragraph. Decision 14.

**Files:**
- Modify:
  - `services/surveys/scores.py` (add `refresh_aged`)
  - `services/customers/management/commands/run_health_maintenance.py`
- Test: `services/surveys/tests/test_nightly.py`

**Interfaces:**
- Consumes: `records_for`, `refresh`, `SurveyInvite`, `WINDOW_DAYS`.
- Produces:
  - `scores.AGED_LOOKBACK_DAYS = 7`;
  - `scores.refresh_aged(organisation=None, *, now) -> int` (records re-read);
  - the command line `refreshed survey scores on N record(s)`, or `survey scores skipped: <error>` as a WARNING.

- [ ] **Step 1: Write the failing tests**

Create `services/surveys/tests/test_nightly.py`:

```python
"""The nightly refresh: a record whose answers have just aged past 90 days
gets its rolling figure again, from a run_health_maintenance step that
never stops the job."""

from io import StringIO
from unittest.mock import patch

from django.core.management import call_command

from services.surveys import scores
from services.surveys.models import SurveySend
from services.surveys.scores import refresh_aged
from services.surveys.tests.fixtures import SurveyFixture, contact


class RefreshAgedTests(SurveyFixture):
    def test_an_answer_that_just_aged_out_no_longer_counts(self):
        send = self.make_send()
        self.answered(send, self.ann, 0, days_ago=92)
        self.answered(send, contact(self.pizza, "Pia"), 10, days_ago=10)
        self.pizza.nps_score = 0  # what both answers made it while both were live
        self.pizza.save(update_fields=["nps_score"])
        self.assertEqual(refresh_aged(now=self.now), 1)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 100)

    def test_answers_long_gone_are_not_looked_at_again(self):
        self.answered(self.make_send(), self.ann, 0, days_ago=120)
        self.assertEqual(refresh_aged(now=self.now), 0)

    def test_a_record_with_nothing_live_keeps_its_score(self):
        self.pizza.nps_score = 40
        self.pizza.save(update_fields=["nps_score"])
        self.answered(self.make_send(), self.ann, 0, days_ago=92)
        self.assertEqual(refresh_aged(now=self.now), 1)
        self.pizza.refresh_from_db()
        self.assertEqual(self.pizza.nps_score, 40)

    def test_an_account_answer_refreshes_the_account_and_its_organisation(self):
        send = self.make_send()
        self.answered(send, self.ben, 0, days_ago=92)
        self.answered(send, contact(self.emea, "Eli"), 10, days_ago=5)
        self.assertEqual(refresh_aged(now=self.now), 2)
        self.pizza.refresh_from_db()
        self.emea.refresh_from_db()
        self.assertEqual((self.pizza.nps_score, self.emea.nps_score), (100, 100))

    def test_one_workspace_at_a_time(self):
        theirs = SurveySend.objects.create(
            organisation=self.other_org,
            owner=self.stranger,
            name="Globex NPS",
            survey_type="nps",
            subject="s",
        )
        self.answered(theirs, contact(self.globex, "Gil"), 0, days_ago=92)
        self.answered(self.make_send(), self.ann, 0, days_ago=92)
        self.assertEqual(refresh_aged(self.org, now=self.now), 1)


class MaintenanceStepTests(SurveyFixture):
    def run_job(self, *args):
        out = StringIO()
        call_command("run_health_maintenance", *args, org_email="alice@acme.io", stdout=out)
        return out.getvalue()

    def test_the_nightly_job_runs_the_refresh_for_its_workspace(self):
        with patch.object(scores, "refresh_aged", return_value=3) as step:
            output = self.run_job()
        self.assertEqual(step.call_args.args, (self.org,))
        self.assertIn("refreshed survey scores on 3 record(s)", output)

    def test_a_dry_run_skips_it(self):
        with patch.object(scores, "refresh_aged") as step:
            self.run_job("--dry-run")
        step.assert_not_called()

    def test_a_failure_is_reported_and_the_job_goes_on(self):
        with patch.object(scores, "refresh_aged", side_effect=RuntimeError("boom")):
            output = self.run_job()
        self.assertIn("survey scores skipped: boom", output)
        self.assertIn("segment(s)", output)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.surveys.tests.test_nightly --noinput`
Expected: ERROR, `ImportError: cannot import name 'refresh_aged' from 'services.surveys.scores'`.

- [ ] **Step 3: Write `refresh_aged` and the step**

Append to `services/surveys/scores.py`:

```python
#: How far past the 90-day edge the nightly step looks, so a missed night
#: or two is caught up. Re-reading a record is idempotent.
AGED_LOOKBACK_DAYS = 7


def refresh_aged(organisation=None, *, now):
    """Re-reads the figure of every record with an answer that has just
    aged past the 90-day window, so the score stops counting it. Returns
    how many records were re-read. A record with no live answer left keeps
    its score, as `refresh` does."""
    edge = now - timedelta(days=WINDOW_DAYS)
    aged = SurveyInvite.objects.filter(
        status=SurveyInvite.Status.ANSWERED,
        answered_at__lt=edge,
        answered_at__gte=edge - timedelta(days=AGED_LOOKBACK_DAYS),
    ).select_related("send", "customer", "account")
    if organisation is not None:
        aged = aged.filter(send__organisation=organisation)
    done = set()
    for invite in aged:
        survey_type = invite.send.survey_type
        for record in records_for(invite, survey_type):
            key = (type(record).__name__, record.pk, survey_type)
            if key not in done:
                done.add(key)
                refresh(record, survey_type, now=now)
    return len(done)
```

In `services/customers/management/commands/run_health_maintenance.py`, insert this block directly above the comment line `# Segments: who entered and who left, as each owner sees their book,`:

```python
# Survey scores: a record whose answers have just aged past 90 days
# gets its rolling NPS/CSAT/CES again, before the segments that read
# those scores (services.surveys.scores.refresh_aged).
if not options["dry_run"]:
    from services.surveys.scores import refresh_aged

    try:
        refreshed = refresh_aged(organisation, now=timezone.now())
        self.stdout.write(self.style.SUCCESS(f"refreshed survey scores on {refreshed} record(s)"))
    except Exception as exc:  # noqa: BLE001 - reported, never fatal
        self.stdout.write(self.style.WARNING(f"survey scores skipped: {exc}"))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.surveys.tests.test_nightly services.customers.tests.test_health_maintenance services.segments.tests.test_nightly --noinput`
Expected: PASS. The existing maintenance and segments nightly tests are unaffected.

- [ ] **Step 5: Commit**

```bash
git add services/surveys/scores.py services/surveys/tests/test_nightly.py services/customers/management/commands/run_health_maintenance.py
git commit -m "feat(surveys): nightly refresh of scores whose answers aged past 90 days

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: End to end

Spec §4 ("one e2e: build → send → answer on the hosted form → the send page and the organisation's score move"), backend half.

**Files:**
- Test: `e2e/test_surveys_flow.py`

**Interfaces:**
- Consumes:
  - every route from Tasks 4–8;
  - `/auth/signup/`, `/auth/users/`, `/auth/login/`;
  - `/customers/`, `/customers/<id>/contacts/`;
  - `/segments/`, `/segments/<id>/members/<id>/`;
  - `/customers/<id>/` and `/surveys/?customer=`.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `e2e/test_surveys_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Carl builds a survey for his segment of one organisation, checks who it
reaches, and sends it. Sam answers on the public link with no sign-in; a
second answer reads like an expired link. Carl's send page, the
organisation's NPS and the surveys log all move."""

import re

from django.core import mail
from django.test import LiveServerTestCase

from e2e.http import http_get, http_patch, http_post

LINK = re.compile(r"/s/([A-Za-z0-9_-]+)")


class SurveysFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def test_full_flow(self):
        # 1. An organisation signs up; its admin adds Carl.
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
        admin = body["access"]
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        status, body = http_post(
            self.api("/auth/login/"), {"email": "carl@acme.io", "password": "csmpassword1"}
        )
        carl = body["access"]

        # 2. Carl's organisation, a champion and a finance manager.
        pizza = self.created("/customers/", {"name": "Pizza Hut"}, carl)["id"]
        for name, role in (("Sam Pizza", "champion"), ("Fin Pizza", "finance_manager")):
            email = f"{name.split()[0].lower()}@pizza.io"
            self.created(
                f"/customers/{pizza}/contacts/", {"name": name, "role": role, "email": email}, carl
            )

        # 3. A segment of that one organisation.
        segment = self.created("/segments/", {"name": "Pizza", "kind": "customer"}, carl)["id"]
        status, body = http_patch(
            self.api(f"/segments/{segment}/members/{pizza}/"), {"state": "pinned"}, token=carl
        )
        self.assertEqual(status, 200, body)

        # 4. Who it reaches: champions only, so Sam.
        status, body = http_post(
            self.api("/surveys/sends/audience/"),
            {"segment": segment, "roles": ["champion"]},
            token=carl,
        )
        self.assertEqual(
            (status, body["audience"], body["organisations"], body["limit"]), (200, 1, 1, 500)
        )

        # 5. A draft, then the send; a second send is refused.
        send = self.created(
            "/surveys/sends/",
            {
                "name": "Q3 NPS",
                "survey_type": "nps",
                "subject": "A quick question",
                "segment": segment,
                "roles": ["champion"],
            },
            carl,
        )
        status, body = http_post(self.api(f"/surveys/sends/{send['id']}/send/"), {}, token=carl)
        self.assertEqual((status, body["status"], body["counts"]["sent"]), (200, "sent", 1), body)
        status, body = http_post(self.api(f"/surveys/sends/{send['id']}/send/"), {}, token=carl)
        self.assertEqual(status, 409, body)

        # 6. Sam's email, and the public form with no sign-in.
        (message,) = mail.outbox
        self.assertEqual(message.to, ["sam@pizza.io"])
        token = LINK.search(message.body).group(1)
        status, body = http_get(self.api(f"/public/surveys/{token}/"))
        self.assertEqual((status, body["organisation_name"]), (200, "Acme Inc"))
        status, body = http_post(
            self.api(f"/public/surveys/{token}/"), {"score": 10, "comment": "Great"}
        )
        self.assertEqual(status, 204, body)
        status, body = http_post(self.api(f"/public/surveys/{token}/"), {"score": 0})
        self.assertEqual((status, body), (404, {"detail": "This link has expired."}))

        # 7. The send page, the organisation's score and the surveys log.
        status, body = http_get(self.api(f"/surveys/sends/{send['id']}/"), token=carl)
        self.assertEqual(
            {key: body["summary"][key] for key in ("sent", "answered", "rate", "figure")},
            {"sent": 1, "answered": 1, "rate": 100, "figure": 100},
        )
        status, body = http_get(self.api(f"/surveys/sends/{send['id']}/answers/"), token=carl)
        self.assertEqual(
            [(row["contact"]["name"], row["score"], row["comment"]) for row in body["results"]],
            [("Sam Pizza", 10, "Great")],
        )
        status, body = http_get(self.api(f"/customers/{pizza}/"), token=carl)
        self.assertEqual(body["nps_score"], 100)
        status, body = http_get(self.api(f"/surveys/?customer={pizza}"), token=carl)
        self.assertEqual(
            [(row["score"], row["status"], row["send_id"]) for row in body],
            [(100, "responded", send["id"])],
        )
```

- [ ] **Step 2: Run it**

Run: `venv/bin/python manage.py test e2e.test_surveys_flow --noinput`
Expected: PASS. Tasks 1–9 already built everything it reaches. If it fails, the failure is a real integration bug: fix it in the task's own module, not here.

- [ ] **Step 3: Run the app's suite and the shard check**

Run:
```bash
venv/bin/python manage.py test services.surveys e2e.test_surveys_flow --noinput
venv/bin/python scripts/ci_shard_labels.py --check 4
venv/bin/ruff check . && venv/bin/ruff format --check .
```
Expected:
- every surveys test passes;
- the shard check prints four shards whose union is the full suite;
- ruff is clean.

- [ ] **Step 4: Commit**

```bash
git add e2e/test_surveys_flow.py
git commit -m "test(e2e): build, send and answer a survey; the send page and NPS move

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The docs

Skill `api-contracts`; the house rule that the six product documents change in the same PR.

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
- Consumes: the routes, bodies, events and models from Tasks 1–9, exactly as named there.
- Produces: nothing in code.

- [ ] **Step 1: `docs/API_CONTRACTS.md`**

In the `### Models — \`Survey\`` section, add this paragraph after "**CES is Customer-only** …":

```markdown
**Rows written by a send.** `send_id` (read-only, `null` for a row logged by hand) names the survey send (`surveys` below) whose answers a row aggregates. A send keeps one row per record it scores, upserted on each answer: `status` `responded`, `score` that send's figure for the record so far, `sent_at` the send's date and `responded_at` the latest answer's. Logging by hand is unchanged. A row with `send_id` set is read-only: PATCH or PUT on `/api/v1/surveys/<id>/` returns `400 {"detail": "This score comes from a sent survey and updates itself."}` and DELETE returns `409` with the same detail.
```

Insert this whole section directly above `## \`scenarios\` — Automation builder`:

````markdown
## `surveys` — Survey sends (`/surveys`, the hosted form `/s/:token`)

Built for the Impact section's second delivery (spec: react-ts-app
`docs/superpowers/specs/2026-10-03-surveys-design.md` §1, §3). A send asks one scored question by email of the people at a segment's records. Each person gets a one-time link to a hosted form, and the answer feeds the record's NPS, CSAT or CES.

**Models.**
- `SurveySend`: `owner`, `name` (≤ 120), `survey_type` (`nps`/`csat`/`ces`), `subject` (≤ 120), `intro` (≤ 500, plain text), `segment` (null once the segment is deleted), `roles` (contact roles, in the order ticked), `status` (`draft`/`sending`/`sent`), `sharing` (`private`/`workspace`/`people`) with `shared_with` (≤ 50), `started_at`, `sent_at`, `counts`.
- `SurveyInvite`: one person asked once.
  - `contact` (null once deleted), and the `customer` or `account` the answer scores, copied from the contact at send time.
  - `email`, and `token_hash` (SHA-256; the token itself is never stored).
  - `expires_at` (`started_at` + 14 days) and `status` (`pending`/`failed`/`answered`; expired is derived).
  - `failure` (≤ 200), `score`, `comment` (≤ 2000, plain text), `answered_at`.

**The question.** There is one per type, with the workspace's name.

| Type | Scale | Question | Bands |
|---|---|---|---|
| `nps` | 0–10 | How likely are you to recommend {workspace} to a friend or colleague? | detractors 0–6, passives 7–8, promoters 9–10 |
| `csat` | 1–5 | How satisfied are you with {workspace}? | low 1–2, mid 3, high 4–5 |
| `ces` | 1–7 | How easy is it to get what you need from {workspace}? | low 1–3, mid 4, high 5–7 |

**Audience.** It is resolved on the server from the sender's own view, for the count and again at the send.
- Who is reached:
  - for a contact segment, its active contacts;
  - for an organisation segment, the active contacts of the organisation and of its accounts whose role was ticked;
  - for an account segment, the account's own contacts whose role was ticked.
- Only contacts the sender may open are included. Those they cannot open are `hidden_count`.
- People are ordered by role in the order ticked, then by name.
- These are skipped and counted, never named:
  - no email (`skipped_no_email`);
  - anyone with an invite in the last 30 days that did not fail (`skipped_recent`);
  - more than 3 per organisation or account, counted after the other skips (`skipped_cap`).

**Scores.** On each answer, in the same transaction:
- The organisation's figure becomes the rolling 90-day figure over its own and its accounts' answers. The account's figure is the same over its own answers (NPS and CSAT only; `Account` has no CES).
  - NPS is round(% promoters − % detractors).
  - CSAT is the % answering 4–5, and CES the % answering 5–7, both with two decimals.
  - A record with no answer in 90 days keeps its score.
- One `Survey` log row per send and record is upserted (see `Survey` above).
- `run_health_maintenance` re-reads records whose answers have just aged past 90 days.

**Access.**
- A send is read by its owner, by the workspace (`workspace`), or by the chosen teammates (`people`).
- Anyone else gets a 404 identical to a missing send.
- Writes and the send are owner only: another reader gets `403 {"detail": "Only the survey's owner can change it."}`.
- The segment must be the caller's own: `403 {"detail": "You can only survey your own segments."}`, or 404 if they cannot read it.

### `GET/POST /api/v1/surveys/sends/`

Auth: `IsAuthenticated`. GET takes `scope=mine|shared|all` (default all) and returns an unpaginated list, newest first:

```json
[
  {
    "id": 3, "name": "Q3 NPS", "survey_type": "nps", "status": "sent",
    "segment": {"id": 7, "name": "Renewal risk", "kind": "customer"},
    "owner": {"id": 4, "name": "Carl CSM"}, "is_owner": true, "sharing": "private",
    "sent_at": "2026-10-03T09:12:00+00:00", "sent": 42, "answered": 31, "rate": 74,
    "updated_at": "2026-10-03T09:12:00+00:00"
  }
]
```

- `segment.id` is `null` for a reader who may not read the segment. `segment` itself is `null` once it is deleted.
- `sent`, `answered` and `rate` cover every invite for the owner, and only people the reader may open for anyone else.

POST `{name, survey_type, subject, intro?, segment?, roles?, sharing?, shared_with?}` creates a draft and returns 201 with the detail body.
- `roles` needs at least one value for an organisation or account segment (`{"roles": ["Choose at least one role."]}`). It is cleared for a contact segment.
- `sharing: "people"` needs 1–50 active teammates (`{"shared_with": ["Choose at least one teammate."]}`).

### `GET/PATCH/DELETE /api/v1/surveys/sends/<id>/`

GET returns:

```json
{
  "id": 3, "name": "Q3 NPS", "survey_type": "nps", "subject": "A quick question",
  "intro": "", "segment": {"id": 7, "name": "Renewal risk", "kind": "customer"},
  "roles": ["champion", "decision_maker"], "status": "sent", "sharing": "private",
  "shared_with": [], "owner": {"id": 4, "name": "Carl CSM"}, "is_owner": true,
  "started_at": "…", "sent_at": "…",
  "counts": {"audience": 42, "sent": 41, "failed": 1, "skipped_recent": 6,
             "skipped_no_email": 2, "skipped_cap": 0},
  "summary": {"sent": 41, "answered": 31, "rate": 76, "figure": 32,
              "bands": {"detractors": 5, "passives": 11, "promoters": 15}},
  "created_at": "…", "updated_at": "…"
}
```

- `counts` (frozen at send time) goes to the owner only, and is `null` for anyone else.
- `summary` covers every invite for the owner, and only people the reader may open for anyone else.
- `figure` is the type's figure over this send's answers, as an integer. `bands` uses `low`/`mid`/`high` for CSAT and CES.

PATCH: owner only. On a draft, every field is editable. After the send starts, only `name`, `sharing` and `shared_with`; any other field is `400 {"<field>": ["A sent survey can only be renamed or re-shared."]}`.

DELETE: owner only, and drafts only. Otherwise `409 {"detail": "Only a draft can be deleted; a sent survey's answers feed the scores."}`.

### `POST /api/v1/surveys/sends/audience/`

Body `{segment, roles}`, checked as a save is. It returns the counts for the builder's modal and creates nothing:

```json
{"audience": 42, "organisations": 18, "skipped_recent": 6, "skipped_no_email": 2,
 "skipped_cap": 0, "hidden_count": 3, "limit": 500}
```

`organisations` counts the distinct records reached: each organisation and each account once.

### `POST /api/v1/surveys/sends/<id>/send/`

Owner only, no body. It claims the draft under a row lock, resolves the audience again, emails each person their link (`{FRONTEND_URL}/s/<token>`, plain text) and returns the detail body.

| Case | Answer |
|---|---|
| Already sent, or being sent | 409 `{"detail": "This survey has already been sent."}` / `{"detail": "This survey is being sent."}` |
| 21st send today (per owner, since midnight UTC, the server's time zone) | 429 `{"detail": "You can send at most 20 surveys a day. Try again tomorrow."}` |
| No segment | 400 `{"segment": ["Choose a segment."]}` |
| Segment not the owner's | 403 `{"detail": "You can only survey your own segments."}` |
| Organisation/account segment, no roles | 400 `{"roles": ["Choose at least one role."]}` |
| Nobody to send to | 400 `{"segment": ["Nobody to send to."]}` |
| More than 500 people | 400 `{"segment": ["This survey would reach 612 people; the most is 500."]}` |
| One email fails | that invite is `failed` with the reason; the batch continues; `counts.failed` |

A refusal leaves the draft untouched.

### `GET /api/v1/surveys/sends/<id>/answers/`

Query: `filter=all|detractors|comments` (an unknown value reads as `all`; `detractors` means the low band) and `cursor=`.

```json
{
  "filter": "all",
  "results": [
    {"id": 91, "contact": {"id": 12, "name": "Sam Pizza"},
     "record": {"kind": "customer", "id": 5, "name": "Pizza Hut"},
     "score": 10, "band": "promoters", "comment": "Great", "answered_at": "…"}
  ],
  "next_cursor": "WyIyMDI2LTEwLTAzVDA5OjEyOjAwKzAwOjAwIiwgOTFd",
  "hidden_count": 4
}
```

- Rows are newest first, 50 a page.
- Only people on records the reader may open are listed. `contact` is `null` once the contact is deleted.
- `hidden_count` counts the rest, with the same filter applied.

### `GET /api/v1/surveys/sends/<id>/pending/`

Everyone the reader may open who has not answered, by name, unpaginated, plus `hidden_count`:

```json
{"results": [{"id": 92, "contact": {"id": 13, "name": "Tom"},
              "record": {"kind": "account", "id": 8, "name": "Taco West"},
              "status": "expired", "expires_at": "…", "failure": null}],
 "hidden_count": 0}
```

`status` is `pending`, `expired` or `failed` (with `failure`). The email address is never returned.

### `GET/POST /api/v1/public/surveys/<token>/`

Public: `AllowAny`, no authentication, throttled to 30 requests a minute per IP (`survey_link`).
- GET returns `{"survey_type", "question", "intro", "organisation_name"}`, where `organisation_name` is the asking workspace's name.
- POST `{"score", "comment"?}` returns 204.
  - `score` must be a whole number in the type's scale, else `400 {"score": ["Choose a score from 0 to 10."]}` (or `1 to 5`, `1 to 7`).
  - `comment` is at most 2000 characters, trimmed.
- An unknown, expired, answered or failed link reads the same for both methods: `404 {"detail": "This link has expired."}`. A second answer, including two at once, gets that same 404.
- Nothing about the person or other answers is returned.
````

- [ ] **Step 2: `docs/audit-events.md`**

Add these rows after the `segment.exported` row:

```markdown
| `survey.created` | `services.surveys.views.SendListCreateView` | user | SurveySend (`target_repr` is "Survey send <id>", never the name) | `survey_type` |
| `survey.updated` | `services.surveys.views.SendDetailView` (PATCH) | user | SurveySend | `fields`: the changed field names only; a PATCH that changes nothing records nothing |
| `survey.shared` | `SendListCreateView` (a non-private create) and `SendDetailView` (PATCH changing `sharing` or `shared_with`) | user | SurveySend | `sharing`, `shared_with` (user ids) |
| `survey.deleted` | `services.surveys.views.SendDetailView` (DELETE, drafts only) | user | SurveySend | `survey_type` |
| `survey.sent` | `services.surveys.views.SendNowView` | user | SurveySend | the frozen counts: `audience`, `sent`, `failed`, `skipped_recent`, `skipped_no_email`, `skipped_cap` |
| `survey.answered` | `services.surveys.public_views.SurveyLinkView` (POST) | — (public link; organisation is the send's) | SurveyInvite ("Survey invite <id>") | `send`: the send's id. Never the token, the score or the comment |
```

- [ ] **Step 3: `docs/data-classification.md`**

Add this row to the models table after the `segments.Segment` row:

```markdown
| `surveys.SurveySend`, `surveys.SurveyInvite` | confidential | `SurveyInvite.email` (a contact's address); `SurveyInvite.comment` (a customer's own words) | a send's name, subject and intro (the owner's words), segment and roles; per person the record scored, score, comment and times; `SurveyInvite.token_hash` is a SHA-256 of a one-time link secret, and the secret itself is never stored. Answers and pending people are read per reader over what they may open (AUTH-02), the rest a count; writes owner-only and audited (LOG-01) |
```

Add these rows to "Flows that leave the tenant boundary", after the segment alert row:

```markdown
| Survey email (`services/email.py: send_survey_email`) → the contact's inbox | the subject and intro the owner wrote, the question with the workspace's name, a one-time link | confidential | plain text; one link per person, 32 random bytes, stored hashed, 14 days, one answer; audited `survey.sent` with counts only |
| Public survey link (`GET/POST /public/surveys/<token>/`) ← the contact's browser | out: the question, intro and workspace name; in: a score and an optional comment | confidential | no sign-in; looked up by hash; one 404 body for every bad link; 30 requests a minute per IP (AUTH-06); audited `survey.answered` without the token |
```

- [ ] **Step 4: The product documents**

`docs/product/01-prd.md`:
- Replace the `| Surveys (NPS, CSAT, CES) | Partial | … |` row with:

```markdown
| Surveys (NPS, CSAT, CES) | Built (backend) | Logged and scored by hand, or sent: one standard question by type, emailed to a segment's people (roles ticked, at most 3 per organisation or account, nobody surveyed in 30 days, at most 500 a send, 20 sends a day) as a one-time link to a public form (14 days, one answer). Answers set the organisation's and account's rolling 90-day NPS, CSAT and CES and write one log row per send and record. Sends are private or shared; readers see answers only from people they may open, plus a count. No reminders, approval queue or custom questions yet |
```

- Replace open item 4 ("**Survey delivery.** …") with:

```markdown
4. **Survey reminders and automatic sends.** Sends are started by hand and confirmed
   in the modal; reminders, the approval queue and scenario-triggered sends are
   later deliveries.
```

- Add to the change log after the 2026-10-03 Segments row:

```markdown
| 2026-10-03 | Surveys (backend): sends to a segment, one-time links and the public form, 90-day NPS/CSAT/CES from answers, nightly refresh |
```

`docs/product/02-trd.md`:
- Add after the `services/segments/` row:

```markdown
| `services/surveys/` | Survey sends. `audience.py` resolves a segment's people from the sender's own view (roles, cap 3 per record, 30-day quiet period, visibility); `sending.py` claims a draft under row locks, emails one link per person (`services/email.py: send_survey_email`) and freezes the counts; `tokens.py` makes 32-byte links stored as SHA-256; `public_views.py` is the no-sign-in form (`AllowAny`, `SurveyLinkThrottle`, one 404 body); `scores.py` turns answers into the rolling 90-day NPS/CSAT/CES and one `customers.Survey` log row per send and record, and its `refresh_aged` runs in `run_health_maintenance` |
```

- Replace the bullet "- Surveys have no per-respondent or multi-question model." with:

```markdown
- Surveys ask one standard question per send; no custom or multi-question surveys, no reminders.
```

`docs/product/05-backend-schema.md`:
- Replace the `| \`Survey\` | … |` row with:

```markdown
| `Survey` | `survey_type` (nps, csat, ces), `status`, `score`, `sent_at`, `responded_at`, `send` (nullable FK to `surveys.SurveySend`; one row per send and organisation or account, upserted on each answer). CES is customer-only, enforced in views |
```

- Add this section after the `### \`segments\`` table (before its `---`):

```markdown
### `surveys`

| Model | Purpose |
|---|---|
| `SurveySend` | One survey sent to one audience: `owner`, `name`, `survey_type`, `subject`, `intro`, `segment` (SET_NULL), `roles`, `status` (`draft`, `sending`, `sent`), `sharing` with `shared_with`, `started_at` (the claim; links expire 14 days after), `sent_at`, `counts` (frozen). At most 20 started per owner per day and 500 people per send |
| `SurveyInvite` | One person asked once: `contact` (SET_NULL), exactly one of `customer`/`account` (the record scored), `email`, `token_hash` (SHA-256, unique; the token is never stored), `expires_at`, `status` (`pending`, `failed`, `answered`; expired is derived), `failure`, `score` (0–10, required once answered), `comment`, `answered_at`. Indexed on (contact, created_at) for the 30-day quiet period and (customer\|account, answered_at) for the 90-day figure |
```

- Add after the `| Segments | … |` row of "11. Visibility rules":

```markdown
| Survey sends | Read by the owner, the workspace or chosen teammates; written and sent by the owner only. The audience is the owner's own segment over the contacts they may open. Answers and pending people are listed only on records the reader may open (`visible_children_q` on the invite's own record), the rest a count; a shared reader's figures cover only those people | `services/surveys/access.py`, `audience.py`, `summary.py`, `answers.py` |
```

`docs/product/06-implementation-plan.md`: replace the body of `### C5. Survey delivery` (the paragraph under it) with:

```markdown
Built 2026-10-03 (backend, `services/surveys`): sends to a segment, one-time links,
the public form, 90-day scores and the nightly refresh. Spec: react-ts-app
`docs/superpowers/specs/2026-10-03-surveys-design.md`. The frontend (the Sends tab,
the builder modal, the send page and `/s/:token`) is the next PR; reminders, the
approval queue and automatic sends follow with Scenarios v2.
```

- [ ] **Step 5: Format and check**

Run:
```bash
venv/bin/ruff format docs/API_CONTRACTS.md docs/product/*.md docs/audit-events.md docs/data-classification.md
venv/bin/ruff check . && venv/bin/ruff format --check .
venv/bin/python manage.py test --parallel --noinput
```
Expected: ruff is clean and the full suite passes.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs(surveys): API contracts, audit events, data classification, product docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.**

| Spec | Task |
|---|---|
| §1.1 `SurveySend` fields, sharing, counts | 1 (model), 4 (write rules), 5 (counts) |
| §1.1 `SurveyInvite` fields, hash-only token, derived expiry, indexes | 1, 8 (expired derived) |
| §1.1 `Survey.send` migration in `customers` | 1 |
| §1.2 members for the viewer; own segment 403/404 | 3, 4 (`owned_segment`) |
| §1.2 active contacts, roles, cap 3, order, `visible_children_q` | 3 |
| §1.2 skips: no email, 30 days (not failed), cap; counted only | 3 |
| §1.2 `organisations`, `hidden_count` | 3 (Decisions 5, 6) |
| §1.3 claim under `select_for_update`, 409 | 5 |
| §1.3 400 empty or over 500 | 5 |
| §1.3 `secrets.token_urlsafe(32)`, `send_survey_email`, `{FRONTEND_URL}/s/<token>` | 1, 5 |
| §1.3 failure isolation, `sent`, `sent_at`, frozen counts, audit `survey.sent` | 5 |
| §1.3 20 a day, 429 | 5 |
| §1.4 GET body, one 404 body, POST 204, range, comment ≤ 2000 | 7 |
| §1.4 double submit, `select_for_update` | 7 |
| §1.4 AllowAny, no authentication, `SurveyLinkThrottle` 30/min per IP | 7 |
| §1.4 look-up by hash only; audit `survey.answered` without the token | 7 |
| §1.5 answered, 90-day NPS/CSAT/CES, account and its organisation, CES to the organisation | 6 |
| §1.5 the log row upsert | 6 |
| Ruling on gap 5: send-written log rows read-only (400 edit, 409 delete) | 6 |
| §1.5 nightly ageing | 9 |
| §1.6 routes (list, create, detail, patch, delete, audience, send) | 4, 5 |
| §1.6 answers with filters, cursor, `hidden_count`; pending | 8 |
| §1.6 summary, owner versus shared | 4 |
| §1.6 404/403; SOC2 markers | 4, 5, 7, 8 |
| §1.7 the limits and errors table | 4, 5, 7 |
| §3 privacy | 3, 4, 7, 8 |
| §4 Backend: models and constraints | 1 |
| §4 Backend: audience | 3 |
| §4 Backend: send | 5 |
| §4 Backend: public views | 7 |
| §4 Backend: scores | 6, 9 |
| §4 Backend: reading | 4, 8 |
| §4 the e2e (backend half) | 10 |
| §5.1 docs | 11 |

§2 and §5.2 are the frontend plan's. §6 is out of scope by design.

**Placeholder scan.** Every code step carries its code and every test step its test; no step says "TBD", "similar to" or "add validation". Every identifier is defined in the task that introduces it (checked: `SCALES`, `LOW`, `band_of`, `NO_ROLES`, `NOT_SEGMENT_OWNER`, `send_payload`, `refresh_aged`, `AGED_LOOKBACK_DAYS`).

**Type consistency.** These names are used as defined across tasks:
- `resolve(segment, roles, viewer, *, today, now=None)` (3, 4, 5);
- `Audience.counts()` (3, 4) and the frozen counts built in `finish` (5);
- `record_answer(invite, score, comment, *, now)` (6, 7);
- `refresh(record, survey_type, *, now)` (6, 9);
- `records_for(invite, survey_type)` (6, 9);
- `send_payload(send, viewer)` (4, 5);
- `NOT_SEGMENT_OWNER` (4, 5) and `NO_ROLES` (4, 5);
- `PAGE_SIZE` (8, patched in its test);
- `MAX_PEOPLE` (patched as `services.surveys.sending.MAX_PEOPLE`, which `sending.py` imports by name);
- the fixture's `make_invite(...).token` (1, 7).

## Spec gaps and conflicts found while planning

1. **`hidden_count` "as Segments" is always 0.** §1.2 requires the segment to be the viewer's own, and segments' `hidden_count` is 0 for the owner. Decision 5 redefines it as the ticked-role contacts on member organisations' accounts the sender cannot open. The modal line "N in the segment you can't open aren't included" will show only then.
2. **`resolve(send, viewer, today)`** cannot serve the audience count, which has no send yet. The signature is changed (Decision 1).
3. **`Account.customers` is many-to-many.** "The invite's organisation" for an account contact can be several organisations. All of them are scored (Decision 12).
4. **The daily limit needs a start time.** The model table has none; `started_at` is added (Decision 7). §1.1's `expires_at = sent_at + 14 days` uses `started_at` instead, because `sent_at` is set only when the batch finishes.
5. **Hand edits to a send's log row.** The existing `PATCH /api/v1/surveys/<id>/` would overwrite the record's score from a row a send wrote. Resolved by the coordinator's ruling: such rows are read-only (Decision 28, Task 6).
6. **Delete of a sent send** is unspecified. Only drafts are deletable (Decision 15).
7. **The quiet period is not locked across owners.** Two different owners sending in the same instant could both ask one person. Locking every contact row was judged not worth it for a rare double-ask; the per-owner lock covers the common case.
8. **Unspecified:** the order of the send's refusals (409/429/400/403), and whether the public 400 can reveal liveness. A 400 comes only after a live look-up, so it reveals no more than GET already does (Decision 8).

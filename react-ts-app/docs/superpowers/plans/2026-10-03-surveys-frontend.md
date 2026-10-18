# Surveys (frontend, delivery 2 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/surveys` into two tabs (Sends, Logged scores), add the New survey modal (`/surveys/new`, `/surveys/:id/edit`), the send page (`/surveys/:id`), the public hosted form (`/s/:token`) and **Survey these** on a segment's page, all on the backend's `/api/v1/surveys/sends/` and `/api/v1/public/surveys/<token>/` endpoints.

**Architecture:**
- **`src/features/surveys/` (new, pure, unit-tested):** the contract types (`surveyTypes.ts`), the API (`surveyApi.ts`, with the public calls sent with no session), the question/scale/band mirror of the backend's `questions.py` (`questions.ts`), the display text (`surveyText.ts`), the 400 mapping (`surveyErrors.ts`), the URL state (`surveyParams.ts`) and a stateful contract-shaped fetch stub (`testSurveys.ts`) that every test runs against. No Redux slice: like Segments, pages read through small hooks.
- **`src/components/surveys/` (new):** the score buttons (shared by the builder's preview and the hosted form), the audience fields and their debounced count, the email-and-form preview, the send row, the send page's header, tiles, Answers and Not answered.
- **`src/pages/surveys/` (new files beside today's `SurveysPage.tsx`):** `SurveysHome` (the tabs, `OrganizationsFrame`, framed Navbar bar), `SendsTab`, `SurveyBuilder` (the modal routes, reusing Segments' `BuilderDialog`, `RadioTile` and `SharingFields`), `SendPage`, and `HostedForm` (outside the app frame and the signed-in guard, light only, no store).
- Today's `SurveysPage` becomes the Logged scores tab with one optional prop (`embedded`), and rows a send wrote turn read-only.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7, lucide-react, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-surveys-design.md`. This plan covers §2 (frontend), §3 (privacy, as it shows in the UI), §4 "Frontend" (testing) and §5 item 2 (the frontend PR).

**The API contract** is the backend plan, `revenact-backend/docs/superpowers/plans/2026-10-03-surveys-backend.md` (its Task 11 `docs/API_CONTRACTS.md` section `surveys`, Decisions 1–28). The backend PR merges and deploys **before** this one. The frontend is built in parallel, so every test here runs against `stubSurveys` (Task 2), which mirrors that contract, never a live server.

**Branch:** `feat/surveys` in `react-ts-app` (already checked out, holding the spec). Stay on it. Do not push.

## Global Constraints

Quoted text is verbatim from the spec or the backend plan.

- **Content (spec Decisions).** "One scored question, chosen by type, plus an optional "Anything to add?" comment. NPS 0–10, CSAT 1–5, CES 1–7. The wording is the standard one for the type, with the organisation's name in it; the builder writes only the email subject and an optional intro line."
- **The wording (backend Decision 9)**, where `{name}` is the workspace's own name (`Organisation.name`):
  - NPS: "How likely are you to recommend {name} to a friend or colleague?"
  - CSAT: "How satisfied are you with {name}?"
  - CES: "How easy is it to get what you need from {name}?"
- **Bands (backend Decision 10).** NPS: detractors 0–6, passives 7–8, promoters 9–10. CSAT: low 1–2, mid 3, high 4–5. CES: low 1–3, mid 4, high 5–7. "The answers filter `detractors` means the low band for every type."
- **Audience (spec Decisions).** "Any of the builder's segments. A contact segment sends to its contacts. An organisation or account segment sends to the contacts at each member, filtered by the roles the builder ticks, at most 3 per organisation or account."
- **Review (spec Decisions).** "A send started by hand is confirmed in the modal (who it reaches, the preview, then Send). The approval queue and "send without review" arrive with Scenarios v2".
- **Scores (spec Decisions).** "NPS = % promoters (9–10) − % detractors (0–6); CSAT = % answering 4–5; CES = % answering 5–7." The tiles' `figure` and `rate` are integers (backend Decision 11).
- **Fatigue and expiry (spec Decisions).** "A link works for 14 days and takes one answer. Anyone surveyed in the last 30 days, by any survey, is skipped. No reminder emails in this delivery."
- **Who builds (spec Decisions).** "Anyone, on their own book: their own segments, and only people they may open. Sends are private or shared like segments."
- **Limits:** `name` ≤ 120, `subject` ≤ 120, `intro` ≤ 500 (plain text), `comment` ≤ 2000, `shared_with` ≤ 50 active teammates, at most **500 people** a send, **20 sends** per owner per day, **3 per organisation or account**.
- **Roles.** Champion and Decision Maker ticked by default (spec §2.2). `roles` "must have at least 1 for organisation and account segments, and is ignored for contact segments"; the backend keeps them "in the order ticked".
- **Audience count (spec §2.2).** From `POST /sends/audience/` "400 ms after the last change, latest wins". The line reads "42 people at 18 organisations · 6 skipped (surveyed in the last 30 days) · 2 without an email", and "N in the segment you can't open aren't included".
- **Footer (spec §2.2).** "Cancel, Save draft, **Send to 42 people…** → a confirm step repeating the count from the server, then send. 0 people disables Send with the reason. Server errors show at their fields."
- **Editing.** `/surveys/:id/edit` is for drafts; after the send "only `name`, `sharing` and `shared_with`" (backend Decision 16). Only a draft can be deleted (Decision 15).
- **Sends tab (spec §2.1).** "rows (not a table) of name, type chip, segment, sent date, and "31 of 42 answered · 74%" in DM Mono; drafts marked Draft. **New survey** opens the modal (`/surveys/new`, a child route as the segment builder). Empty state explains a survey and offers New survey." "**Logged scores**: today's page unchanged (Log Survey, charts, list)."
- **Send page (spec §2.3).** "Header (name, type, segment, sent date, sender; for the owner, Edit opens the modal with only the name and sharing editable, as the server allows); tiles (sent, answered, response rate, the figure, the bands); **Answers** (person, organisation, score chip, comment, date, newest first; All / Detractors / With comments) with "N more answers from people you can't open"; **Not answered** (collapsed; expiry; failed with reason)."
- **Answers paging (backend Decision 20).** 50 a page, newest first, an opaque `next_cursor` (never parsed); an unknown filter reads as `all`. `/pending/` is unpaginated and never returns an email address.
- **Hosted form (spec §2.4).** "A route outside the app frame and outside the signed-in guard in `App.tsx` (it never reads the session): Revenact mark, the question with the organisation's name, the score buttons in one row (44px targets, wrapping on phones; NPS labelled "Not likely" … "Very likely"), "Anything to add?" (optional), Submit. Then "Thanks, your answer was recorded." The expired page reads the same for every bad link. Light mode only; tokens only."
- **Public link (backend).** `GET` returns `{survey_type, question, intro, organisation_name}`; `POST {score, comment?}` returns 204; every bad link, and a second answer, is "`404 {"detail": "This link has expired."}`"; a bad score is `400 {"score": ["Choose a score from 0 to 10."]}` (or `1 to 5`, `1 to 7`); throttled at 30 requests a minute per IP (429).
- **From a segment (spec §2.5).** "A segment's page gets **Survey these** beside Export; it opens the New survey modal with that segment chosen (owner only, as the send needs their segment)."
- **Privacy (spec §3).** "The audience is resolved on the server from the owner's own view, at preview and again at send." "Answers are read through the viewer's visibility; the rest are a count." "The public link reveals the organisation's name and the question only." "The comment is stored and shown as plain text (React escapes; the email is plain text)." So: never `dangerouslySetInnerHTML`; `counts` (owner only, `null` otherwise) render only when present; a `segment.id` of `null` is never linked.
- **Logged scores.** A row with `send_id` set "is read-only: PATCH or PUT on `/api/v1/surveys/<id>/` returns `400 {"detail": "This score comes from a sent survey and updates itself."}` and DELETE returns `409`" (backend Decision 28). The tab offers no Edit, Delete or Mark Expired on such a row.
- **Error bodies the UI maps (backend contract):**

  | Where | Status | Body | Shown at |
  |---|---|---|---|
  | any write | 400 | `{"name": [...]}`, `{"subject": [...]}`, `{"intro": [...]}`, `{"survey_type": [...]}` | that field |
  | save, audience, send | 400 | `{"roles": ["Choose at least one role."]}` | the roles |
  | save | 400 | `{"shared_with": ["Choose at least one teammate."]}` | sharing |
  | send | 400 | `{"segment": ["Choose a segment."]}`, `{"segment": ["Nobody to send to."]}`, `{"segment": ["This survey would reach 612 people; the most is 500."]}` | the segment |
  | after the send | 400 | `{"<field>": ["A sent survey can only be renamed or re-shared."]}` | that field |
  | segment not yours | 403 | `{"detail": "You can only survey your own segments."}` | the form |
  | not the owner | 403 | `{"detail": "Only the survey's owner can change it."}` | the form |
  | delete a sent send | 409 | `{"detail": "Only a draft can be deleted; a sent survey's answers feed the scores."}` | the confirm |
  | send twice | 409 | `{"detail": "This survey has already been sent."}` / `{"detail": "This survey is being sent."}` | the form |
  | 21st send today | 429 | `{"detail": "You can send at most 20 surveys a day. Try again tomorrow."}` | the form |
  | unreadable send | 404 | identical to a missing one | "Survey not found" |
- **House rules (as Segments).** Tokens only (no hex, `rgb()` or palette class); type at `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]` only; figures in `font-mono-brand tabular-nums` (`MONO`); a 44px target below `sm` on every control (`min-h-11 sm:min-h-9`, or the shared `BUTTON`/`PRIMARY`/`QUIET`/`FILTER_SELECT`); Lucide icons with `aria-hidden="true"`; rows, never `<table>`; no card inside a card; no glass; no `h-screen` (`min-h-[100dvh]`); both themes, except the hosted form (light only); designed empty, loading and error states; sentence-case copy; no added motion.
- **Tests** follow the `testing` skill: unit tests; integration tests on the real store and router with `fetch` stubbed by `stubSurveys`; one jsdom journey in `src/e2e/`; the house-rules suite over the new folders. Run Vitest as `npx vitest run --maxWorkers=2 <paths>`, one process at a time, only the files a task touches until Task 16. Every test must be able to fail, and its title claims only what it asserts.
- **Commits** are conventional (`feat(surveys): …`, `test(e2e): …`, `docs(surveys): …`, `refactor(test): …`) and end with a blank line and `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.
- **Product documents** change in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 15).

## Decisions made while planning (the owner may overrule any)

1. **Survey these is a child route over the segment's page, `/segments/:id/survey`** (`SurveySegmentRoute`), like the builder's `/segments/:id/edit`. Cancel returns to the segment; saving or sending opens the send. A non-owner who types the address sees "Only {owner} can survey this segment".
2. **The confirm step lives inside the modal**, not in a second dialog: the body becomes the confirm text and the footer becomes Back / Send now. Pressing **Send to N people…** first saves the draft (POST, or a PATCH of what changed), then asks `POST /sends/audience/` once more, undebounced, and the confirm repeats that answer. Send now is disabled if that answer is 0 or over the limit.
3. **Save draft opens the send page.** A draft's page shows its header and "Not sent yet" with **Edit and send** (owner) and **Delete** (owner, drafts only, through the shared `ConfirmDialog`). No tiles, Answers or Not answered for a draft.
4. **`?tab=` and `?customer=`.** `/surveys` opens Sends; `?tab=logged` opens Logged scores; `?customer=<id>` with no `tab` opens Logged scores, so the organisation page's "Manage surveys" (`/surveys?customer=<id>`) still lands on its scores. Inside the tabs the organisation picker keeps `tab=logged`. The account page's "Manage surveys" changes from `/surveys` to `/surveys?tab=logged`.
5. **Light only is decided by the path.** `ThemeSynchronizer` in `App.tsx` asks `themeIsDark(theme, prefersDark, pathname)` (`src/lib/theme.ts`), which is always false under `/s/`. The hosted form uses the same tokens; they resolve to their light values.
6. **The hosted form never touches the session.** It reads no Redux store (its tests render it with no `Provider`, so a store read throws), and its two calls go through `apiFetch` with `accessToken: null` and `skipAuthRetry: true`: no `Authorization` header, and a 401 never triggers a token refresh or a sign-out.
7. **The subject starts filled**, "A quick question from {workspace}", and stays editable (required, ≤ 120). The name starts empty.
8. **Scale end labels for CSAT and CES** (the spec names NPS's only): CSAT "Very unsatisfied" … "Very satisfied", CES "Very difficult" … "Very easy". They describe the lowest and highest radio (`aria-describedby`).
9. **The low filter's label is "Detractors" for NPS and "Low scores" for CSAT and CES** (the backend's `detractors` filter is the low band for every type). The filter lives in the URL as `?answers=detractors|comments` (absent for All), so it survives a reload.
10. **Figures.** NPS shows signed ("+32", "−5", "0"); CSAT and CES show "76%"; no figure is "—". The bands tile names each band (Detractors/Passives/Promoters, or Low/Middle/High).
11. **The Sends tab has no scope switch or search** (the spec lists none). It reads `GET /sends/` once (the backend returns every readable send, unpaginated, newest first).
12. **Not answered is a disclosure button** (`aria-expanded`), closed by default, and reads `/pending/` only when opened, so a send page costs one request less until someone looks.
13. **The count's noun.** "people at N organisations" for organisation and contact segments, "people at N accounts" for account segments (the backend's `organisations` counts each organisation and each account once; see Contract gap 1).
14. **Send is disabled until the count is in**, with the reason beside it (`aria-describedby`): "Choose a segment to send.", "Choose at least one role to send.", "Counting who it reaches…", the count's own error, "Nobody to send to.", or "This survey would reach N people; the most is 500." (the backend's own sentences).
15. **`SharingFields` gains an optional `note`** so the survey's sharing explains answers, not members. Without it, Segments reads exactly as before.
16. **`Survey.send_id` is typed optional** (`send_id?: number | null`) in `customersSlice`: the contract always sends it, but the existing tests' fixtures omit it.
17. **A throttled link (429)** reads "Too many tries from this network. Wait a minute, then try again." The body's wait is not parsed.
18. **The hosted form shows the intro above the question**, which is its `h1`; the radios sit in a `fieldset` named by that heading.
19. **The Segments-only house-rule checks move to `src/test/houseRules.ts`** as `rowsIconsTargetsSuite`, so Segments and Surveys share them (Segments' test then calls it). `SurveysPage.tsx` and `SurveyTrendChart.tsx` stay out of the new suite: the spec keeps them unchanged.
20. **No polling.** A send in `sending` reads "Sending now" until the page is reloaded; `POST /send/` itself returns only when the batch is done.

## Contract gaps found while planning

1. **`organisations` in the audience count** counts each organisation *and* each account once (backend Decision 6), while the spec's line reads "42 people at 18 organisations". The UI keeps the spec's word for organisation and contact segments (an organisation segment that reaches accounts counts them in it) and says "accounts" for account segments (Decision 13). A split (`organisations`, `accounts`) would let the line be exact.
2. **The audience endpoint never refuses an empty or oversized audience**; it returns the counts plus `limit` (500), and only `POST /send/` answers 400. The frontend therefore derives "Nobody to send to." and "This survey would reach N people; the most is 500." itself, copying the backend's sentences.
3. **The workspace name for the preview** comes from the signed-in user's `organisation.name`; the contract assumes it equals the `Organisation.name` the backend puts in the question. Nothing returns the rendered question before a send exists.
4. **Scale end labels** for CSAT and CES are in neither the spec nor the public payload (Decision 8). If the backend later sends labels, the hosted form should take them from there.
5. **A 429 from the public link** carries DRF's default throttle text; the frontend shows its own sentence (Decision 17).
6. **`POST /sends/<id>/send/` is synchronous** (up to 500 emails before the 200). The button reads "Sending…" for as long as it takes; there is no timeout, progress or retry contract. A 202 plus a status read would suit a slow mail server better.
7. **A send in `sending`** has no way to be watched (Decision 20).
8. **`hidden_count` in the audience count** is non-zero only for organisation segments (backend gap 1), so "N in the segment you can't open aren't included" will rarely show.
9. **Pending rows** carry `expires_at` for `failed` invites too; the UI shows only the failure there.
10. **`send_id` on `/api/v1/surveys/` rows** is always present per the contract but typed optional here (Decision 16).
11. **The Sends list is unpaginated** and has no limit; fine at today's volumes (20 sends a day per owner), worth a cursor later.
12. **Blank `name`/`subject`** answer with DRF's "This field may not be blank."; the modal checks first with its own words, so that text shows only if the client check is bypassed.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/surveys/surveyTypes.ts` (new) | The contract's types, field for field |
| `src/features/surveys/questions.ts` (new) | Labels, scales, end labels, questions, bands, figure formatting, limits, `DEFAULT_ROLES` |
| `src/features/surveys/surveyText.ts` (new) | Display text: `reach`, `skipLines`, `hiddenLine`, `sendBlocker`, `sendLabel`, `countsLines`, `segmentLabel`, `dayLabel`, `recordPath` |
| `src/features/surveys/surveyApi.ts` (new) | `apiFetch` wrappers; the public pair sent with no session |
| `src/features/surveys/surveyErrors.ts` (new) | 400 bodies to fields (`surveyErrors`), the hosted form's (`answerErrors`) |
| `src/features/surveys/surveyParams.ts` (new) | `?tab=` and `?answers=` |
| `src/features/surveys/testSurveys.ts` (new, test-only) | Fixtures and `stubSurveys`, a stateful fetch stub in contract shapes; `requestsOf` |
| `src/lib/theme.ts` (new) | `themeIsDark`: light only under `/s/` |
| `src/components/surveys/ScaleButtons.tsx` (new) | The score buttons (radios), or their picture in the preview |
| `src/components/surveys/Lines.tsx` (new) | "6 skipped · 2 without an email", figures in DM Mono |
| `src/components/surveys/TypeChip.tsx` (new) | "NPS" / "CSAT" / "CES" chip |
| `src/components/surveys/useAudience.ts` (new) | The debounced, latest-wins audience count |
| `src/components/surveys/AudienceSummary.tsx` (new) | "Who it reaches" and `ReachLines` |
| `src/components/surveys/useMySegments.ts` (new) | `GET /segments/?scope=mine` for the select |
| `src/components/surveys/AudienceFields.tsx` (new) | The segment select grouped by kind, the role checkboxes |
| `src/components/surveys/SurveyPreview.tsx` (new) | The email and the hosted form as the customer sees them |
| `src/components/surveys/SendRow.tsx` (new) | One send in the Sends tab |
| `src/components/surveys/useSend.ts` (new) | One send: loading, missing (404), failed, ready |
| `src/components/surveys/SendStates.tsx` (new) | Loading, "Survey not found", error |
| `src/components/surveys/SendHeader.tsx` (new) | Name, type, segment, date, sender, sharing, Edit, Delete (drafts) |
| `src/components/surveys/SendTiles.tsx` (new) | Sent, Answered, Response rate, the figure, Bands |
| `src/components/surveys/AnswersSection.tsx` (new) | Filters, rows, Show more, the hidden count |
| `src/components/surveys/NotAnswered.tsx` (new) | The collapsed list of who has not answered |
| `src/components/surveys/houseRules.test.ts` (new) | The house rules over the new components and pages |
| `src/pages/surveys/SurveysHome.tsx` (new) | `/surveys`: tabs, New survey, the modal's Outlet |
| `src/pages/surveys/SendsTab.tsx` (new) | Rows, empty, loading, error |
| `src/pages/surveys/SendPage.tsx` (new) | `/surveys/:id`, `SendOutlet` |
| `src/pages/surveys/SurveyBuilder.tsx` (new) | `NewSurveyModal`, `NewSurveyRoute`, `EditSurveyRoute`, `SurveySegmentRoute`, the form, the confirm, the rename form |
| `src/pages/surveys/HostedForm.tsx` (new) | `/s/:token` |
| `src/pages/surveys/testPages.tsx` (new, test-only) | `renderHosted`, `renderSurveys` |
| `src/pages/surveys/SurveysPage.tsx` (modify) | `embedded`; send-written rows read-only |
| `src/features/customers/customersSlice.ts` (modify) | `Survey.send_id` |
| `src/components/segments/SharingFields.tsx` (modify) | Optional `note` |
| `src/components/segments/SegmentHeader.tsx` (modify) | **Survey these** (owner) |
| `src/components/segments/houseRules.test.ts` (modify), `src/test/houseRules.ts` (modify) | The shared extra checks |
| `src/components/organizations/detail/StoryTab.tsx` (modify) | The account's "Manage surveys" → `?tab=logged` |
| `src/components/layout/Navbar.tsx` (modify) | The framed bar on `/surveys…`; `/segments/:id/survey` |
| `src/App.tsx` (modify) | `/s/:token` (public), the `/surveys` routes, `/segments/:id/survey`, `ThemeSynchronizer` |
| `src/e2e/surveys.test.tsx` (new) | Build → send → answer → the send page and Logged scores move |
| docs (modify) | `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` |

---

### Task 1: The contract types, the questions and the display text

Spec §2 (copy), backend Decisions 9, 10, 11, 18, 19, 20.

**Files:**
- Create: `src/features/surveys/surveyTypes.ts`, `src/features/surveys/questions.ts`, `src/features/surveys/surveyText.ts`
- Test: `src/features/surveys/questions.test.ts`, `src/features/surveys/surveyText.test.ts`

**Interfaces:**
- Consumes: `Contact` (`features/customers/customersSlice`), `PersonRef`, `SegmentKind`, `Sharing` (`features/segments/segmentTypes`), `formatDate` (`features/customers/formatters`), `localDay` (`features/organizations/storyDays`).
- Produces:
  - types `SurveyType`, `SendStatus`, `ContactRole`, `BandName`, `AnswersFilter`, `SegmentRef`, `SendCounts`, `SendSummary`, `SurveySend`, `SendListRow`, `SendWrite`, `AudienceRequest`, `AudienceCounts`, `RecordRef`, `ContactRef`, `AnswerRow`, `AnswersPage`, `PendingStatus`, `PendingRow`, `PendingPage`, `PublicSurvey`, `PublicAnswer`;
  - `questions.ts`: `TYPE_LABEL`, `TYPE_HINT`, `SCALES`, `SCALE_ENDS`, `BANDS`, `BAND_LABEL`, `FIGURE_HINT`, `NAME_MAX = 120`, `SUBJECT_MAX = 120`, `INTRO_MAX = 500`, `COMMENT_MAX = 2000`, `LINK_DAYS = 14`, `PER_RECORD_CAP = 3`, `DEFAULT_ROLES`, `questionFor(type, workspace): string`, `scaleOf(type): number[]`, `bandTone(band): 'low' | 'mid' | 'high'`, `lowFilterLabel(type): string`, `formatFigure(type, figure: number | null): string`;
  - `surveyText.ts`: `Line {n, text}`, `Reach {people, peopleNoun, records, recordNoun}`, `reach(counts, kind)`, `skipLines(counts): Line[]`, `hiddenLine(counts): Line | null`, `sendBlocker(counts): string | null`, `sendLabel(people): string`, `countsLines(counts): Line[]`, `segmentLabel(segment): string`, `dayLabel(iso): string`, `recordPath(record): string`.

- [ ] **Step 1: Write the failing tests**

`src/features/surveys/questions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BANDS, bandTone, formatFigure, lowFilterLabel, questionFor, SCALE_ENDS, scaleOf } from './questions';

describe('the question per type (backend Decision 9)', () => {
  it('words each type exactly as the backend does, with the workspace name', () => {
    expect(questionFor('nps', 'Acme Inc')).toBe('How likely are you to recommend Acme Inc to a friend or colleague?');
    expect(questionFor('csat', 'Acme Inc')).toBe('How satisfied are you with Acme Inc?');
    expect(questionFor('ces', 'Acme Inc')).toBe('How easy is it to get what you need from Acme Inc?');
  });

  it('lists each scale from end to end: NPS 0–10, CSAT 1–5, CES 1–7', () => {
    expect(scaleOf('nps')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(scaleOf('csat')).toEqual([1, 2, 3, 4, 5]);
    expect(scaleOf('ces')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('labels the NPS ends "Not likely" and "Very likely" (spec §2.4)', () => {
    expect(SCALE_ENDS.nps).toEqual(['Not likely', 'Very likely']);
  });
});

describe('bands and figures (backend Decisions 10, 11)', () => {
  it('names the bands low first, per type', () => {
    expect(BANDS.nps).toEqual(['detractors', 'passives', 'promoters']);
    expect(BANDS.csat).toEqual(['low', 'mid', 'high']);
    expect(BANDS.ces).toEqual(['low', 'mid', 'high']);
  });

  it('tones detractors and low scores as low, promoters and high as high', () => {
    expect([bandTone('detractors'), bandTone('low'), bandTone('passives'), bandTone('mid'), bandTone('promoters'), bandTone('high')]).toEqual([
      'low',
      'low',
      'mid',
      'mid',
      'high',
      'high',
    ]);
  });

  it('signs NPS, puts CSAT and CES in percent, and shows no figure as a dash', () => {
    expect(formatFigure('nps', 32)).toBe('+32');
    expect(formatFigure('nps', -5)).toBe('−5');
    expect(formatFigure('nps', 0)).toBe('0');
    expect(formatFigure('csat', 76)).toBe('76%');
    expect(formatFigure('ces', null)).toBe('—');
  });

  it('calls the low filter Detractors for NPS and Low scores otherwise (plan Decision 9)', () => {
    expect(lowFilterLabel('nps')).toBe('Detractors');
    expect(lowFilterLabel('csat')).toBe('Low scores');
    expect(lowFilterLabel('ces')).toBe('Low scores');
  });
});
```

`src/features/surveys/surveyText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countsLines, dayLabel, hiddenLine, reach, recordPath, segmentLabel, sendBlocker, sendLabel, skipLines } from './surveyText';
import type { AudienceCounts } from './surveyTypes';

const COUNTS: AudienceCounts = { audience: 42, organisations: 18, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0, hidden_count: 3, limit: 500 };

describe('who a survey reaches, in words (spec §2.2)', () => {
  it('says people at organisations, or accounts for an account segment, singular when one', () => {
    expect(reach(COUNTS, 'customer')).toEqual({ people: 42, peopleNoun: 'people', records: 18, recordNoun: 'organisations' });
    expect(reach(COUNTS, 'contact')).toMatchObject({ recordNoun: 'organisations' });
    expect(reach({ audience: 1, organisations: 1 }, 'account')).toEqual({ people: 1, peopleNoun: 'person', records: 1, recordNoun: 'account' });
  });

  it('counts each skip that happened, never one that did not', () => {
    expect(skipLines(COUNTS)).toEqual([
      { n: 6, text: 'skipped (surveyed in the last 30 days)' },
      { n: 2, text: 'without an email' },
    ]);
    expect(skipLines({ skipped_recent: 0, skipped_no_email: 0, skipped_cap: 4 })).toEqual([{ n: 4, text: 'over the limit of 3 per organisation or account' }]);
  });

  it("says how many in the segment the builder can't open, and nothing when none", () => {
    expect(hiddenLine(COUNTS)).toEqual({ n: 3, text: "in the segment you can't open aren't included" });
    expect(hiddenLine({ hidden_count: 1 })).toEqual({ n: 1, text: "in the segment you can't open isn't included" });
    expect(hiddenLine({ hidden_count: 0 })).toBeNull();
  });

  it("blocks a send to nobody or to more than the limit, in the backend's own words", () => {
    expect(sendBlocker({ audience: 0, limit: 500 })).toBe('Nobody to send to.');
    expect(sendBlocker({ audience: 612, limit: 500 })).toBe('This survey would reach 612 people; the most is 500.');
    expect(sendBlocker({ audience: 500, limit: 500 })).toBeNull();
  });

  it('labels the send button with the count', () => {
    expect(sendLabel(42)).toBe('Send to 42 people…');
    expect(sendLabel(1)).toBe('Send to 1 person…');
  });

  it("reads a send's frozen counts: people, sent, not delivered, then the skips", () => {
    expect(countsLines({ audience: 6, sent: 5, failed: 1, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0 })).toEqual([
      { n: 6, text: 'people' },
      { n: 5, text: 'sent' },
      { n: 1, text: 'not delivered' },
      { n: 6, text: 'skipped (surveyed in the last 30 days)' },
      { n: 2, text: 'without an email' },
    ]);
  });
});

describe('small labels', () => {
  it('names a deleted segment', () => {
    expect(segmentLabel(null)).toBe('Deleted segment');
    expect(segmentLabel({ id: null, name: 'EMEA accounts', kind: 'account' })).toBe('EMEA accounts');
  });

  it("dates a timestamp on the reader's own calendar day", () => {
    expect(dayLabel('2026-10-03T12:00:00Z')).toBe('3 Oct 2026');
  });

  it("links a record to its own page", () => {
    expect(recordPath({ kind: 'customer', id: 7, name: 'Pizza Hut' })).toBe('/organizations/7');
    expect(recordPath({ kind: 'account', id: 14, name: 'Pizza EMEA' })).toBe('/accounts/14');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/surveys/questions.test.ts src/features/surveys/surveyText.test.ts`
Expected: FAIL, "Failed to resolve import "./questions"" and "./surveyText".

- [ ] **Step 3: Write the types, the questions and the text**

`src/features/surveys/surveyTypes.ts`:

```ts
// The Surveys contract (revenact-backend feat/surveys, docs/API_CONTRACTS.md
// `surveys`; backend plan 2026-10-03-surveys-backend.md), field for field.
// Every read is computed for the reader over what they may open.
import type { Contact } from '../customers/customersSlice';
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';

export type SurveyType = 'nps' | 'csat' | 'ces';
export type SendStatus = 'draft' | 'sending' | 'sent';
/** `Contact.Role` on the backend, value for value. */
export type ContactRole = Contact['role'];
export type BandName = 'detractors' | 'passives' | 'promoters' | 'low' | 'mid' | 'high';
export type AnswersFilter = 'all' | 'detractors' | 'comments';

/** A send's segment (backend Decision 18). `id` is null for a reader who may
 *  not read the segment, so it is linked only when it can be opened; the
 *  whole ref is null once the segment is deleted. */
export interface SegmentRef {
  id: number | null;
  name: string;
  kind: SegmentKind;
}

/** Frozen when the send finished. The owner's only: null for anyone else
 *  (backend Decision 19). */
export interface SendCounts {
  audience: number;
  sent: number;
  failed: number;
  skipped_recent: number;
  skipped_no_email: number;
  skipped_cap: number;
}

/** Every invite for the owner; only the people the reader may open for
 *  anyone else. A failed invite was never sent and is not counted. */
export interface SendSummary {
  sent: number;
  answered: number;
  rate: number | null;
  figure: number | null;
  bands: Partial<Record<BandName, number>>;
}

/** GET/PATCH /surveys/sends/<id>/, and POST's 201. */
export interface SurveySend {
  id: number;
  name: string;
  survey_type: SurveyType;
  subject: string;
  intro: string;
  segment: SegmentRef | null;
  roles: ContactRole[];
  status: SendStatus;
  sharing: Sharing;
  shared_with: PersonRef[];
  owner: PersonRef;
  is_owner: boolean;
  started_at: string | null;
  sent_at: string | null;
  counts: SendCounts | null;
  summary: SendSummary;
  created_at: string;
  updated_at: string;
}

/** GET /surveys/sends/: unpaginated, newest first. */
export interface SendListRow {
  id: number;
  name: string;
  survey_type: SurveyType;
  status: SendStatus;
  segment: SegmentRef | null;
  owner: PersonRef;
  is_owner: boolean;
  sharing: Sharing;
  sent_at: string | null;
  sent: number;
  answered: number;
  rate: number | null;
  updated_at: string;
}

/** POST /surveys/sends/ (and PATCH, partially). `shared_with` only with
 *  `sharing: "people"`. */
export interface SendWrite {
  name: string;
  survey_type: SurveyType;
  subject: string;
  intro: string;
  segment: number | null;
  roles: ContactRole[];
  sharing: Sharing;
  shared_with?: number[];
}

export interface AudienceRequest {
  segment: number;
  roles: ContactRole[];
}

/** POST /surveys/sends/audience/. `organisations` counts each organisation
 *  and each account reached once (backend Decision 6). */
export interface AudienceCounts {
  audience: number;
  organisations: number;
  skipped_recent: number;
  skipped_no_email: number;
  skipped_cap: number;
  hidden_count: number;
  limit: number;
}

/** The record an answer scores. `customer` is an organisation. */
export interface RecordRef {
  kind: 'customer' | 'account';
  id: number;
  name: string;
}

/** Null once the contact is deleted (the answer stays, unnamed). */
export interface ContactRef {
  id: number;
  name: string;
}

export interface AnswerRow {
  id: number;
  contact: ContactRef | null;
  record: RecordRef;
  score: number;
  band: BandName;
  comment: string;
  answered_at: string;
}

/** GET /surveys/sends/<id>/answers/?filter=&cursor=: 50 a page, newest
 *  first; `next_cursor` is opaque. */
export interface AnswersPage {
  filter: AnswersFilter;
  results: AnswerRow[];
  next_cursor: string | null;
  hidden_count: number;
}

export type PendingStatus = 'pending' | 'expired' | 'failed';

export interface PendingRow {
  id: number;
  contact: ContactRef | null;
  record: RecordRef;
  status: PendingStatus;
  expires_at: string;
  failure: string | null;
}

/** GET /surveys/sends/<id>/pending/: unpaginated; never an email address. */
export interface PendingPage {
  results: PendingRow[];
  hidden_count: number;
}

/** GET /public/surveys/<token>/: the question and the workspace's name only. */
export interface PublicSurvey {
  survey_type: SurveyType;
  question: string;
  intro: string;
  organisation_name: string;
}

export interface PublicAnswer {
  score: number;
  comment?: string;
}
```

`src/features/surveys/questions.ts`:

```ts
// The question per type, its scale and its bands, mirrored from the
// backend's services/surveys/questions.py (backend plan Decisions 9, 10).
import type { BandName, ContactRole, SurveyType } from './surveyTypes';

export const TYPE_LABEL: Record<SurveyType, string> = { nps: 'NPS', csat: 'CSAT', ces: 'CES' };

/** Under each type's tile in the builder. */
export const TYPE_HINT: Record<SurveyType, string> = {
  nps: 'Would they recommend you? 0 to 10',
  csat: 'How satisfied are they? 1 to 5',
  ces: 'How easy are you to work with? 1 to 7',
};

export const SCALES: Record<SurveyType, readonly [number, number]> = { nps: [0, 10], csat: [1, 5], ces: [1, 7] };

/** The words under the lowest and the highest score: NPS's from spec §2.4,
 *  CSAT's and CES's from plan Decision 8. */
export const SCALE_ENDS: Record<SurveyType, readonly [string, string]> = {
  nps: ['Not likely', 'Very likely'],
  csat: ['Very unsatisfied', 'Very satisfied'],
  ces: ['Very difficult', 'Very easy'],
};

const QUESTIONS: Record<SurveyType, string> = {
  nps: 'How likely are you to recommend {name} to a friend or colleague?',
  csat: 'How satisfied are you with {name}?',
  ces: 'How easy is it to get what you need from {name}?',
};

/** Low, middle and high, per type. */
export const BANDS: Record<SurveyType, readonly [BandName, BandName, BandName]> = {
  nps: ['detractors', 'passives', 'promoters'],
  csat: ['low', 'mid', 'high'],
  ces: ['low', 'mid', 'high'],
};

export const BAND_LABEL: Record<BandName, string> = {
  detractors: 'Detractors',
  passives: 'Passives',
  promoters: 'Promoters',
  low: 'Low',
  mid: 'Middle',
  high: 'High',
};

/** What each figure counts (spec Decisions, "Scores"). */
export const FIGURE_HINT: Record<SurveyType, string> = {
  nps: 'Promoters minus detractors',
  csat: 'Answering 4 or 5',
  ces: 'Answering 5 to 7',
};

export const NAME_MAX = 120;
export const SUBJECT_MAX = 120;
export const INTRO_MAX = 500;
export const COMMENT_MAX = 2000;
export const LINK_DAYS = 14;
export const PER_RECORD_CAP = 3;
/** Ticked when an organisation or account segment is chosen (spec §2.2). */
export const DEFAULT_ROLES: ContactRole[] = ['champion', 'decision_maker'];

export function questionFor(type: SurveyType, workspace: string): string {
  return QUESTIONS[type].replace('{name}', workspace);
}

export function scaleOf(type: SurveyType): number[] {
  const [low, high] = SCALES[type];
  return Array.from({ length: high - low + 1 }, (_, i) => low + i);
}

export function bandTone(band: BandName): 'low' | 'mid' | 'high' {
  if (band === 'detractors' || band === 'low') return 'low';
  if (band === 'promoters' || band === 'high') return 'high';
  return 'mid';
}

/** The `detractors` filter is the low band for every type (backend
 *  Decision 10); only NPS calls them detractors. */
export function lowFilterLabel(type: SurveyType): string {
  return type === 'nps' ? 'Detractors' : 'Low scores';
}

export function formatFigure(type: SurveyType, figure: number | null): string {
  if (figure === null) return '—';
  if (type !== 'nps') return `${figure}%`;
  if (figure > 0) return `+${figure}`;
  if (figure < 0) return `−${Math.abs(figure)}`;
  return '0';
}
```

`src/features/surveys/surveyText.ts`:

```ts
// The Surveys pages' sentences, as data: each figure apart from its words so
// the page can set it in DM Mono.
import { formatDate } from '../customers/formatters';
import { localDay } from '../organizations/storyDays';
import type { SegmentKind } from '../segments/segmentTypes';
import { PER_RECORD_CAP } from './questions';
import type { AudienceCounts, RecordRef, SegmentRef, SendCounts } from './surveyTypes';

/** One figure and the words after it: "6" "skipped (…)". */
export interface Line {
  n: number;
  text: string;
}

export interface Reach {
  people: number;
  peopleNoun: string;
  records: number;
  recordNoun: string;
}

type Skips = Pick<AudienceCounts, 'skipped_recent' | 'skipped_no_email' | 'skipped_cap'>;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "42 people at 18 organisations" (plan Decision 13: accounts for an
 *  account segment). */
export function reach(counts: Pick<AudienceCounts, 'audience' | 'organisations'>, kind: SegmentKind | null): Reach {
  const records = counts.organisations;
  return {
    people: counts.audience,
    peopleNoun: plural(counts.audience, 'person', 'people'),
    records,
    recordNoun: kind === 'account' ? plural(records, 'account', 'accounts') : plural(records, 'organisation', 'organisations'),
  };
}

/** The skips, counted and never named (spec §1.2). */
export function skipLines(counts: Skips): Line[] {
  const lines: Line[] = [];
  if (counts.skipped_recent > 0) lines.push({ n: counts.skipped_recent, text: 'skipped (surveyed in the last 30 days)' });
  if (counts.skipped_no_email > 0) lines.push({ n: counts.skipped_no_email, text: 'without an email' });
  if (counts.skipped_cap > 0) lines.push({ n: counts.skipped_cap, text: `over the limit of ${PER_RECORD_CAP} per organisation or account` });
  return lines;
}

export function hiddenLine(counts: Pick<AudienceCounts, 'hidden_count'>): Line | null {
  const n = counts.hidden_count;
  if (n === 0) return null;
  return { n, text: `in the segment you can't open ${n === 1 ? "isn't" : "aren't"} included` };
}

/** Why Send is off, in the backend's own words (contract gap 2), or null. */
export function sendBlocker(counts: Pick<AudienceCounts, 'audience' | 'limit'>): string | null {
  if (counts.audience === 0) return 'Nobody to send to.';
  if (counts.audience > counts.limit) return `This survey would reach ${counts.audience} people; the most is ${counts.limit}.`;
  return null;
}

export function sendLabel(people: number): string {
  return `Send to ${people} ${plural(people, 'person', 'people')}…`;
}

/** A sent survey's frozen counts, for its owner. */
export function countsLines(counts: SendCounts): Line[] {
  return [
    { n: counts.audience, text: plural(counts.audience, 'person', 'people') },
    { n: counts.sent, text: 'sent' },
    ...(counts.failed > 0 ? [{ n: counts.failed, text: 'not delivered' }] : []),
    ...skipLines(counts),
  ];
}

export function segmentLabel(segment: SegmentRef | null): string {
  return segment === null ? 'Deleted segment' : segment.name;
}

/** "3 Oct 2026", on the reader's own calendar. */
export function dayLabel(iso: string): string {
  return formatDate(localDay(new Date(iso)));
}

export function recordPath(record: RecordRef): string {
  return record.kind === 'account' ? `/accounts/${record.id}` : `/organizations/${record.id}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/surveys/questions.test.ts src/features/surveys/surveyText.test.ts`
Expected: PASS (7 + 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/surveys/surveyTypes.ts src/features/surveys/questions.ts src/features/surveys/surveyText.ts src/features/surveys/questions.test.ts src/features/surveys/surveyText.test.ts
git commit -m "feat(surveys): the contract types, the question per type and the display text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The API and the contract stub

Backend Task 11's contract section; plan Decision 6.

**Files:**
- Create: `src/features/surveys/surveyApi.ts`, `src/features/surveys/testSurveys.ts`
- Test: `src/features/surveys/surveyApi.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `setAuthHooks` (`lib/apiClient`); Task 1's types and `BANDS`, `SCALES`, `questionFor`, `TYPE_LABEL`; `stubSegments`, `SEGMENTS`, `TEAM`, `ME`, `CARL`, `DANA`, `SegmentsStub` (`features/segments/testSegments`); `Survey` (`features/customers/customersSlice`).
- Produces:
  - `surveyApi.ts`: `SENDS_PATH = '/surveys/sends/'`, `fetchSends(): Promise<SendListRow[]>`, `fetchSend(id)`, `createSend(body: SendWrite)`, `updateSend(id, body: Partial<SendWrite>)`, `deleteSend(id): Promise<null>`, `fetchAudience(body: AudienceRequest): Promise<AudienceCounts>`, `sendNow(id): Promise<SurveySend>`, `fetchAnswers(id, filter: AnswersFilter, cursor: string | null): Promise<AnswersPage>`, `fetchPending(id): Promise<PendingPage>`, `fetchPublicSurvey(token): Promise<PublicSurvey>`, `answerPublicSurvey(token, body: PublicAnswer): Promise<null>`.
  - `testSurveys.ts`:
    - fixtures `NOW`, `EXPIRED`, `StoredSend`, `StubInvite`, `Q3_NPS` (id 3, mine, sent, NPS, segment Renewal risk 7, shared with the workspace), `CARL_CSAT` (id 4, Carl's, shared with me by name, CSAT, segment EMEA accounts 8), `DRAFT_CES` (id 5, mine, draft, CES, segment Champions 9), `DANA_SEND` (id 6, Dana's, private: a 404), `SENDS`, `INVITES`, `LIVE_TOKEN` (`'live-token-34'`), `AUDIENCES` (7 and 9), `LOGGED`;
    - `sendPayload(send, invites?): SurveySend`, `bandOf(type, score)`, `figureOf(type, scores)`;
    - `stubSurveys(stub?: SurveysStub): { spy, tokensOf(sendId): string[] }`, `SurveysSpy`, `requestsOf(spy, method, pattern)`.

- [ ] **Step 1: Write the failing test**

`src/features/surveys/surveyApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuthHooks } from '../../lib/apiClient';
import {
  answerPublicSurvey,
  createSend,
  deleteSend,
  fetchAnswers,
  fetchAudience,
  fetchPending,
  fetchPublicSurvey,
  fetchSend,
  fetchSends,
  sendNow,
  updateSend,
} from './surveyApi';
import { LIVE_TOKEN, requestsOf, stubSurveys } from './testSurveys';

// Unit tier over the contract stub (backend plan Task 11). The stub keeps
// state, so a send makes links and an answer moves the figures.
describe('surveyApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the sends the viewer may read, newest first: the owner sees every invite, a shared reader only theirs', async () => {
    stubSurveys();
    const rows = await fetchSends();
    expect(rows.map((row) => row.name)).toEqual(['Onboarding effort', 'Q3 NPS', 'Support CSAT']);
    expect(rows.find((row) => row.id === 3)).toMatchObject({ sent: 5, answered: 3, rate: 60, is_owner: true });
    expect(rows.find((row) => row.id === 4)).toMatchObject({ sent: 1, answered: 1, rate: 100, is_owner: false });
  });

  it("reads a send: frozen counts for the owner only, and a 404 for one that isn't shared", async () => {
    stubSurveys();
    const mine = await fetchSend(3);
    expect(mine.counts).toEqual({ audience: 6, sent: 5, failed: 1, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0 });
    expect(mine.summary).toEqual({ sent: 5, answered: 3, rate: 60, figure: 33, bands: { detractors: 1, passives: 0, promoters: 2 } });
    expect((await fetchSend(4)).counts).toBeNull();
    await expect(fetchSend(6)).rejects.toMatchObject({ status: 404 });
  });

  it('creates, edits and deletes a draft with the bodies the contract names', async () => {
    const { spy } = stubSurveys();
    const created = await createSend({ name: 'Renewal NPS', survey_type: 'nps', subject: 'Hi', intro: '', segment: 7, roles: ['champion'], sharing: 'private' });
    expect(created).toMatchObject({ id: 100, status: 'draft', segment: { id: 7, name: 'Renewal risk', kind: 'customer' }, roles: ['champion'] });
    await updateSend(100, { name: 'Renewal NPS 2' });
    expect(requestsOf(spy, 'PATCH', /^\/surveys\/sends\/100\/$/).map((r) => r.body)).toEqual([{ name: 'Renewal NPS 2' }]);
    await deleteSend(100);
    await expect(fetchSend(100)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses what the backend refuses: no roles, someone else segment, a sent survey', async () => {
    stubSurveys();
    await expect(fetchAudience({ segment: 7, roles: [] })).rejects.toMatchObject({ status: 400, body: { roles: ['Choose at least one role.'] } });
    await expect(fetchAudience({ segment: 8, roles: ['champion'] })).rejects.toMatchObject({ status: 403, body: { detail: 'You can only survey your own segments.' } });
    await expect(updateSend(3, { subject: 'New' })).rejects.toMatchObject({ status: 400, body: { subject: ['A sent survey can only be renamed or re-shared.'] } });
    await expect(deleteSend(3)).rejects.toMatchObject({ status: 409 });
    await expect(sendNow(3)).rejects.toMatchObject({ status: 409, body: { detail: 'This survey has already been sent.' } });
  });

  it('counts a contact segment with no roles', async () => {
    stubSurveys();
    expect(await fetchAudience({ segment: 9, roles: [] })).toEqual({ audience: 2, organisations: 2, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 });
  });

  it('sends a draft: one live link per person, and an answer moves the summary and closes the link', async () => {
    const { tokensOf } = stubSurveys();
    expect(await sendNow(5)).toMatchObject({ status: 'sent', summary: { sent: 2, answered: 0 } });
    const [token] = tokensOf(5);
    expect(await fetchPublicSurvey(token)).toEqual({
      survey_type: 'ces',
      question: 'How easy is it to get what you need from Acme Inc?',
      intro: '',
      organisation_name: 'Acme Inc',
    });
    expect(await answerPublicSurvey(token, { score: 6, comment: '  Easy  ' })).toBeNull();
    expect((await fetchSend(5)).summary).toMatchObject({ answered: 1, rate: 50, figure: 100 });
    await expect(fetchPublicSurvey(token)).rejects.toMatchObject({ status: 404, body: { detail: 'This link has expired.' } });
  });

  it("pages answers newest first with the count of those the reader can't open, and lists who hasn't answered", async () => {
    stubSurveys({ pageSize: 1 });
    const first = await fetchAnswers(3, 'all', null);
    expect(first.results.map((row) => row.contact?.name)).toEqual(['Lee Wong']);
    expect(first.hidden_count).toBe(1);
    const second = await fetchAnswers(3, 'all', first.next_cursor);
    expect(second.results.map((row) => row.contact?.name)).toEqual(['Sam Patel']);
    expect(second.next_cursor).toBeNull();
    expect((await fetchAnswers(3, 'detractors', null)).results.map((row) => row.score)).toEqual([4]);
    const pending = await fetchPending(3);
    expect(pending.results.map((row) => [row.contact?.name ?? null, row.status])).toEqual([
      ['Ann Lee', 'failed'],
      ['Tom Reyes', 'pending'],
      [null, 'expired'],
    ]);
  });

  it('calls the public link with no session: no Authorization header, and a 401 refreshes nothing', async () => {
    const refresh = vi.fn(async () => 'fresh');
    setAuthHooks({ getAccessToken: () => 'secret', refreshAccessToken: refresh, onAuthFailure: vi.fn() });
    const { spy } = stubSurveys({ publicLink: (token) => (token === 'locked' ? { status: 401, body: { detail: 'No.' } } : undefined) });
    await fetchSend(3);
    await fetchPublicSurvey(LIVE_TOKEN);
    const headers = spy.mock.calls.map(([, init]) => (init?.headers ?? {}) as Record<string, string>);
    expect(headers[0].Authorization).toBe('Bearer secret');
    expect(headers[1].Authorization).toBeUndefined();
    await expect(fetchPublicSurvey('locked')).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/surveys/surveyApi.test.ts`
Expected: FAIL, "Failed to resolve import "./surveyApi"".

- [ ] **Step 3: Write the API**

`src/features/surveys/surveyApi.ts`:

```ts
// Thin apiFetch wrappers over revenact-backend's /api/v1/surveys/sends/ and
// the public /api/v1/public/surveys/<token>/ (backend plan Task 11).
import { apiFetch } from '../../lib/apiClient';
import type {
  AnswersFilter,
  AnswersPage,
  AudienceCounts,
  AudienceRequest,
  PendingPage,
  PublicAnswer,
  PublicSurvey,
  SendListRow,
  SendWrite,
  SurveySend,
} from './surveyTypes';

export const SENDS_PATH = '/surveys/sends/';
const one = (id: number) => `${SENDS_PATH}${id}/`;

/** Every send the reader may read, newest first, unpaginated. */
export function fetchSends(): Promise<SendListRow[]> {
  return apiFetch<SendListRow[]>(SENDS_PATH);
}

export function fetchSend(id: number): Promise<SurveySend> {
  return apiFetch<SurveySend>(one(id));
}

/** A draft owned by the caller (201). */
export function createSend(body: SendWrite): Promise<SurveySend> {
  return apiFetch<SurveySend>(SENDS_PATH, { method: 'POST', body });
}

/** Owner only. After the send, only name, sharing and shared_with. */
export function updateSend(id: number, body: Partial<SendWrite>): Promise<SurveySend> {
  return apiFetch<SurveySend>(one(id), { method: 'PATCH', body });
}

/** Owner only, drafts only (409 otherwise). */
export function deleteSend(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

/** Who `{segment, roles}` reaches, resolved on the server from the caller's
 *  own view. Nothing is created. */
export function fetchAudience(body: AudienceRequest): Promise<AudienceCounts> {
  return apiFetch<AudienceCounts>(`${SENDS_PATH}audience/`, { method: 'POST', body });
}

/** The real send: resolves the audience again on the server and emails
 *  each person their link. Returns the sent survey. */
export function sendNow(id: number): Promise<SurveySend> {
  return apiFetch<SurveySend>(`${one(id)}send/`, { method: 'POST' });
}

/** `filter` is sent only when not `all`; `cursor` is passed through as the
 *  server gave it. */
export function fetchAnswers(id: number, filter: AnswersFilter, cursor: string | null): Promise<AnswersPage> {
  const query = new URLSearchParams();
  if (filter !== 'all') query.set('filter', filter);
  if (cursor) query.set('cursor', cursor);
  const text = query.toString();
  return apiFetch<AnswersPage>(text ? `${one(id)}answers/?${text}` : `${one(id)}answers/`);
}

export function fetchPending(id: number): Promise<PendingPage> {
  return apiFetch<PendingPage>(`${one(id)}pending/`);
}

/** The public link carries no session (plan Decision 6): no token is
 *  attached, and a 401 never refreshes or signs anyone out. */
const NO_SESSION = { accessToken: null, skipAuthRetry: true } as const;
const link = (token: string) => `/public/surveys/${encodeURIComponent(token)}/`;

export function fetchPublicSurvey(token: string): Promise<PublicSurvey> {
  return apiFetch<PublicSurvey>(link(token), NO_SESSION);
}

/** 204 on success; every bad link is a 404 "This link has expired." */
export function answerPublicSurvey(token: string, body: PublicAnswer): Promise<null> {
  return apiFetch<null>(link(token), { ...NO_SESSION, method: 'POST', body });
}
```

- [ ] **Step 4: Write the stub**

`src/features/surveys/testSurveys.ts`:

```ts
// Test-only: survey sends in the backend's contract shapes (revenact-backend
// feat/surveys, docs/API_CONTRACTS.md `surveys`) and one fetch stub for every
// endpoint the Surveys pages and the hosted form read. It keeps state: a send
// makes links, an answer on a link moves the send's figures and upserts the
// send's logged score. Paths it does not own (segments, teammates,
// organisations, products) fall through to stubSegments. The viewer is ME
// (Alice, id 1) in the workspace "Acme Inc", as pages/segments/testPages.tsx.
import { vi } from 'vitest';
import type { Survey } from '../customers/customersSlice';
import type { PersonRef } from '../segments/segmentTypes';
import { CARL, DANA, ME, SEGMENTS, stubSegments, TEAM, type SegmentsStub } from '../segments/testSegments';
import { BANDS, questionFor, SCALES, TYPE_LABEL } from './questions';
import type {
  AudienceCounts,
  AudienceRequest,
  BandName,
  ContactRef,
  PendingStatus,
  RecordRef,
  SegmentRef,
  SendCounts,
  SendListRow,
  SurveySend,
  SurveyType,
} from './surveyTypes';

type Answer = { status: number; body: unknown };

/** A send as the stub keeps it; its summary is computed on every read. */
export type StoredSend = Omit<SurveySend, 'summary'>;

/** One invite. `state` is what the backend reports (expired is derived
 *  there, stored here); `visible` says whether ME may open its record. The
 *  real backend never stores `token`; the stub keeps it so a test can open
 *  the hosted form. */
export interface StubInvite {
  id: number;
  send: number;
  token: string;
  contact: ContactRef | null;
  record: RecordRef;
  state: 'pending' | 'expired' | 'failed' | 'answered';
  score: number | null;
  comment: string;
  answered_at: string | null;
  expires_at: string;
  failure: string | null;
  visible: boolean;
}

/** The time of every write the stub makes (sends and answers). */
export const NOW = '2026-10-04T14:00:00Z';
const WORKSPACE = 'Acme Inc';
export const EXPIRED = { detail: 'This link has expired.' };

const PIZZA: RecordRef = { kind: 'customer', id: 7, name: 'Pizza Hut' };
const INITECH: RecordRef = { kind: 'customer', id: 2, name: 'Initech' };
const GLOBEX: RecordRef = { kind: 'customer', id: 1, name: 'Globex' };
const PIZZA_EMEA: RecordRef = { kind: 'account', id: 14, name: 'Pizza EMEA' };
const TACO_WEST: RecordRef = { kind: 'account', id: 21, name: 'Taco West' };

const BASE = {
  intro: '',
  shared_with: [] as PersonRef[],
  started_at: null as string | null,
  sent_at: null as string | null,
  counts: null as SendCounts | null,
  updated_at: '2026-10-03T12:00:00Z',
};

/** Mine, sent, shared with the workspace. Five invites went out and one
 *  failed; three answered, one of them on a record I can't open. */
export const Q3_NPS: StoredSend = {
  ...BASE,
  id: 3,
  name: 'Q3 NPS',
  survey_type: 'nps',
  subject: 'A quick question from Acme Inc',
  intro: 'Two minutes, promise.',
  segment: { id: 7, name: 'Renewal risk', kind: 'customer' },
  roles: ['champion', 'decision_maker'],
  status: 'sent',
  sharing: 'workspace',
  owner: ME,
  is_owner: true,
  started_at: '2026-10-03T11:55:00Z',
  sent_at: '2026-10-03T12:00:00Z',
  counts: { audience: 6, sent: 5, failed: 1, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0 },
  created_at: '2026-10-03T08:00:00Z',
};

/** Carl's, shared with me by name. Two answered; I can open one. */
export const CARL_CSAT: StoredSend = {
  ...BASE,
  id: 4,
  name: 'Support CSAT',
  survey_type: 'csat',
  subject: 'How did we do?',
  segment: { id: 8, name: 'EMEA accounts', kind: 'account' },
  roles: ['champion'],
  status: 'sent',
  sharing: 'people',
  shared_with: [ME],
  owner: CARL,
  is_owner: false,
  started_at: '2026-10-01T11:55:00Z',
  sent_at: '2026-10-01T12:00:00Z',
  counts: { audience: 2, sent: 2, failed: 0, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0 },
  created_at: '2026-10-01T08:00:00Z',
};

/** Mine, a draft to the Champions contact segment. */
export const DRAFT_CES: StoredSend = {
  ...BASE,
  id: 5,
  name: 'Onboarding effort',
  survey_type: 'ces',
  subject: 'A quick question from Acme Inc',
  segment: { id: 9, name: 'Champions', kind: 'contact' },
  roles: [],
  status: 'draft',
  sharing: 'private',
  owner: ME,
  is_owner: true,
  created_at: '2026-10-04T08:00:00Z',
};

/** Dana's, private: unreadable to me, so a 404 like a missing id. */
export const DANA_SEND: StoredSend = {
  ...BASE,
  id: 6,
  name: "Dana's NPS",
  survey_type: 'nps',
  subject: 'Hi',
  segment: null,
  roles: [],
  status: 'sent',
  sharing: 'private',
  owner: DANA,
  is_owner: false,
  sent_at: '2026-10-02T12:00:00Z',
  created_at: '2026-10-02T08:00:00Z',
};

export const SENDS: StoredSend[] = [Q3_NPS, CARL_CSAT, DRAFT_CES, DANA_SEND];

export const LIVE_TOKEN = 'live-token-34';

const INVITE = { comment: '', score: null, answered_at: null, expires_at: '2026-10-17T12:00:00Z', failure: null, visible: true };

export const INVITES: StubInvite[] = [
  { ...INVITE, id: 31, send: 3, token: 'answered-31', contact: { id: 51, name: 'Sam Patel' }, record: PIZZA, state: 'answered', score: 10, comment: 'Great support', answered_at: '2026-10-03T12:00:00Z' },
  { ...INVITE, id: 32, send: 3, token: 'answered-32', contact: { id: 52, name: 'Lee Wong' }, record: INITECH, state: 'answered', score: 4, answered_at: '2026-10-03T13:00:00Z' },
  { ...INVITE, id: 33, send: 3, token: 'answered-33', contact: { id: 53, name: 'Kim Ross' }, record: GLOBEX, state: 'answered', score: 9, comment: 'Quick answers', answered_at: '2026-10-04T12:00:00Z', visible: false },
  { ...INVITE, id: 34, send: 3, token: LIVE_TOKEN, contact: { id: 54, name: 'Tom Reyes' }, record: TACO_WEST, state: 'pending' },
  { ...INVITE, id: 35, send: 3, token: 'failed-35', contact: { id: 55, name: 'Ann Lee' }, record: PIZZA_EMEA, state: 'failed', failure: 'Mailbox unavailable' },
  { ...INVITE, id: 36, send: 3, token: 'expired-36', contact: null, record: PIZZA, state: 'expired', expires_at: '2026-10-03T12:00:00Z' },
  { ...INVITE, id: 41, send: 4, token: 'csat-41', contact: { id: 56, name: 'Raj Iyer' }, record: PIZZA_EMEA, state: 'answered', score: 5, answered_at: '2026-10-02T12:00:00Z' },
  { ...INVITE, id: 42, send: 4, token: 'csat-42', contact: { id: 57, name: 'Uma Shah' }, record: TACO_WEST, state: 'answered', score: 2, comment: 'Slow', answered_at: '2026-10-02T13:00:00Z', visible: false },
];

/** What POST /sends/audience/ answers for each of my segments (7 Renewal
 *  risk, organisations; 9 Champions, contacts). */
export const AUDIENCES: Record<number, AudienceCounts> = {
  7: { audience: 3, organisations: 3, skipped_recent: 1, skipped_no_email: 1, skipped_cap: 0, hidden_count: 2, limit: 500 },
  9: { audience: 2, organisations: 2, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 },
};

/** The people a send to each segment asks (as many as AUDIENCES counts). */
const PEOPLE: Record<number, { contact: ContactRef; record: RecordRef }[]> = {
  7: [
    { contact: { id: 61, name: 'Ada Byrne' }, record: PIZZA },
    { contact: { id: 62, name: 'Bo Chen' }, record: INITECH },
    { contact: { id: 63, name: 'Cy Diaz' }, record: GLOBEX },
  ],
  9: [
    { contact: { id: 64, name: 'Dee Evans' }, record: PIZZA },
    { contact: { id: 65, name: 'Eli Fox' }, record: TACO_WEST },
  ],
};

/** GET /surveys/ (Logged scores): one logged by hand, one a send wrote. */
export const LOGGED: Survey[] = [
  { id: 1, survey_type: 'nps', survey_type_display: 'NPS', status: 'responded', status_display: 'Responded', score: 40, sent_at: '2026-09-20', responded_at: '2026-09-22', companies: [{ id: 6, name: 'Shopify' }], account_id: null, account_name: null, created_at: '2026-09-20T12:00:00Z', send_id: null },
  { id: 2, survey_type: 'nps', survey_type_display: 'NPS', status: 'responded', status_display: 'Responded', score: 33, sent_at: '2026-10-03', responded_at: '2026-10-04', companies: [{ id: 7, name: 'Pizza Hut' }], account_id: null, account_name: null, created_at: '2026-10-03T12:00:00Z', send_id: 3 },
];

const LOW: Record<SurveyType, number> = { nps: 6, csat: 2, ces: 3 };
const HIGH: Record<SurveyType, number> = { nps: 9, csat: 4, ces: 5 };
const NOT_OWNER = { detail: "Only the survey's owner can change it." };
const NOT_SEGMENT_OWNER = { detail: 'You can only survey your own segments.' };
const LOCKED = 'A sent survey can only be renamed or re-shared.';
const AFTER_SEND = ['name', 'sharing', 'shared_with'];
const WRITABLE = ['name', 'survey_type', 'subject', 'intro', 'roles', 'sharing'] as const;

/** Half away from zero, as the backend's ROUND_HALF_UP. */
const whole = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

export function bandOf(type: SurveyType, score: number): BandName {
  const [low, mid, high] = BANDS[type];
  if (score <= LOW[type]) return low;
  if (score >= HIGH[type]) return high;
  return mid;
}

/** The type's figure over `scores` (spec Decisions, "Scores"), or null. */
export function figureOf(type: SurveyType, scores: number[]): number | null {
  if (scores.length === 0) return null;
  const high = scores.filter((score) => score >= HIGH[type]).length;
  const low = type === 'nps' ? scores.filter((score) => score <= LOW[type]).length : 0;
  return whole(((high - low) * 100) / scores.length);
}

/** The summary as the backend's `send_summary`: every non-failed invite for
 *  the owner, only visible ones for anyone else. */
function summaryOf(send: StoredSend, invites: StubInvite[]) {
  const pool = invites.filter((invite) => invite.send === send.id && invite.state !== 'failed' && (send.is_owner || invite.visible));
  const scores = pool.filter((invite) => invite.state === 'answered').map((invite) => invite.score as number);
  const bands: Partial<Record<BandName, number>> = Object.fromEntries(BANDS[send.survey_type].map((band) => [band, 0]));
  for (const score of scores) {
    const band = bandOf(send.survey_type, score);
    bands[band] = (bands[band] ?? 0) + 1;
  }
  return {
    sent: pool.length,
    answered: scores.length,
    rate: pool.length > 0 ? whole((scores.length * 100) / pool.length) : null,
    figure: figureOf(send.survey_type, scores),
    bands,
  };
}

/** A send as GET /surveys/sends/<id>/ returns it to ME. */
export function sendPayload(send: StoredSend, invites: StubInvite[] = INVITES): SurveySend {
  return { ...send, counts: send.is_owner ? send.counts : null, summary: summaryOf(send, invites) };
}

/** Readable to ME, as the backend's `readable_sends`. */
const readable = (send: StoredSend) => send.is_owner || send.sharing === 'workspace' || (send.sharing === 'people' && send.shared_with.some((person) => person.id === ME.id));

const teammates = (ids: unknown): PersonRef[] =>
  ((ids as number[] | undefined) ?? []).flatMap((id) => TEAM.filter((person) => person.id === id).map(({ id: pk, name }) => ({ id: pk, name })));

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
}

export interface SurveysStub {
  sends?: StoredSend[];
  invites?: StubInvite[];
  logged?: Survey[];
  /** Answers a page holds (default 50, the backend's PAGE_SIZE). */
  pageSize?: number;
  list?: () => Answer;
  /** GET /surveys/sends/<id>/: an answer overrides the default; undefined falls through. */
  read?: (id: number) => Answer | undefined;
  /** DELETE /surveys/sends/<id>/ (default: the owner's delete of a draft). */
  remove?: (id: number) => Answer;
  create?: (body: Record<string, unknown>) => Answer;
  patch?: (id: number, body: Record<string, unknown>) => Answer;
  audience?: (body: AudienceRequest) => Answer;
  sendNow?: (id: number) => Answer;
  /** GET answers/: an answer overrides the default; undefined falls through. */
  answers?: (id: number, query: URLSearchParams) => Answer | undefined;
  pending?: (id: number) => Answer;
  /** GET/POST /public/surveys/<token>/: undefined falls through. */
  publicLink?: (token: string, method: string, body: Record<string, unknown>) => Answer | undefined;
  /** Passed to stubSegments for everything this stub does not own. */
  segments?: SegmentsStub;
}

export function stubSurveys(stub: SurveysStub = {}) {
  const sends: StoredSend[] = (stub.sends ?? SENDS).map((send) => ({ ...send }));
  const invites: StubInvite[] = (stub.invites ?? INVITES).map((invite) => ({ ...invite }));
  const logged: Survey[] = (stub.logged ?? LOGGED).map((row) => ({ ...row }));
  const pageSize = stub.pageSize ?? 50;
  const segmentsFetch = stubSegments(stub.segments);
  let nextId = 100;
  let nextInvite = 500;

  const payload = (send: StoredSend) => sendPayload(send, invites);
  const row = (send: StoredSend): SendListRow => {
    const summary = summaryOf(send, invites);
    return {
      id: send.id,
      name: send.name,
      survey_type: send.survey_type,
      status: send.status,
      segment: send.segment,
      owner: send.owner,
      is_owner: send.is_owner,
      sharing: send.sharing,
      sent_at: send.sent_at,
      sent: summary.sent,
      answered: summary.answered,
      rate: summary.rate,
      updated_at: send.updated_at,
    };
  };

  /** `owned_segment` and `clean_roles`: 404 for a segment ME can't read,
   *  403 for one ME doesn't own, roles for an organisation or account one. */
  const checkSegment = (segmentId: unknown, roles: unknown): Answer | SegmentRef => {
    const segment = SEGMENTS.find((candidate) => candidate.id === segmentId);
    if (!segment) return { status: 404, body: { detail: 'Not found.' } };
    if (!segment.is_owner) return { status: 403, body: NOT_SEGMENT_OWNER };
    if (segment.kind !== 'contact' && (!Array.isArray(roles) || roles.length === 0)) return { status: 400, body: { roles: ['Choose at least one role.'] } };
    return { id: segment.id, name: segment.name, kind: segment.kind };
  };
  const refused = (value: Answer | SegmentRef): value is Answer => 'status' in value;

  /** A create or PATCH body, as the backend's SendWriteSerializer: segment
   *  and roles checked together; people only with "people". */
  const write = (send: StoredSend, data: Record<string, unknown>): Answer | null => {
    for (const key of ['name', 'subject']) {
      if (key in data && !String(data[key] ?? '').trim()) return { status: 400, body: { [key]: ['This field may not be blank.'] } };
    }
    let segment = send.segment;
    let roles = 'roles' in data ? data.roles : send.roles;
    if ('segment' in data || 'roles' in data) {
      const segmentId = 'segment' in data ? data.segment : (send.segment?.id ?? null);
      if (segmentId === null || segmentId === undefined) {
        segment = null;
      } else {
        const checked = checkSegment(segmentId, roles);
        if (refused(checked)) return checked;
        segment = checked;
        if (checked.kind === 'contact') roles = [];
      }
    }
    const sharing = (data.sharing ?? send.sharing) as StoredSend['sharing'];
    const people = 'shared_with' in data ? teammates(data.shared_with) : send.shared_with;
    if (sharing === 'people' && people.length === 0) return { status: 400, body: { shared_with: ['Choose at least one teammate.'] } };
    const target = send as unknown as Record<string, unknown>;
    for (const key of WRITABLE) if (key in data) target[key] = data[key];
    send.roles = roles as StoredSend['roles'];
    send.segment = segment;
    send.shared_with = sharing === 'people' ? people : [];
    send.updated_at = NOW;
    return null;
  };

  /** One log row per (send, record), its score the send's figure there. */
  const upsertLog = (send: StoredSend, record: RecordRef) => {
    const scores = invites
      .filter((i) => i.send === send.id && i.state === 'answered' && i.record.kind === record.kind && i.record.id === record.id)
      .map((i) => i.score as number);
    const account = record.kind === 'account';
    const fields = { score: figureOf(send.survey_type, scores), responded_at: NOW.slice(0, 10) };
    const existing = logged.find(
      (r) => r.send_id === send.id && (account ? r.account_id === record.id : r.account_id === null && r.companies.some((c) => c.id === record.id)),
    );
    if (existing) {
      Object.assign(existing, fields);
      return;
    }
    logged.push({
      id: 900 + logged.length,
      survey_type: send.survey_type,
      survey_type_display: TYPE_LABEL[send.survey_type],
      status: 'responded',
      status_display: 'Responded',
      sent_at: (send.sent_at ?? NOW).slice(0, 10),
      companies: account ? [] : [{ id: record.id, name: record.name }],
      account_id: account ? record.id : null,
      account_name: account ? record.name : null,
      created_at: NOW,
      send_id: send.id,
      ...fields,
    });
  };

  const byName = (a: StubInvite, b: StubInvite) => {
    if (a.contact && b.contact) return a.contact.name.localeCompare(b.contact.name) || a.id - b.id;
    if (a.contact) return -1;
    if (b.contact) return 1;
    return a.id - b.id;
  };

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    const link = /^\/public\/surveys\/([^/]+)\/$/.exec(path);
    if (link) {
      const token = decodeURIComponent(link[1]);
      const override = stub.publicLink?.(token, method, body);
      if (override) return reply(override);
      const invite = invites.find((candidate) => candidate.token === token && candidate.state === 'pending');
      if (!invite) return json(404, EXPIRED);
      const send = sends.find((candidate) => candidate.id === invite.send) as StoredSend;
      if (method === 'GET') {
        return json(200, { survey_type: send.survey_type, question: questionFor(send.survey_type, WORKSPACE), intro: send.intro, organisation_name: WORKSPACE });
      }
      const [low, high] = SCALES[send.survey_type];
      const score = body.score;
      if (typeof score !== 'number' || !Number.isInteger(score) || score < low || score > high) {
        return json(400, { score: [`Choose a score from ${low} to ${high}.`] });
      }
      const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
      if (comment.length > 2000) return json(400, { comment: ['Ensure this field has no more than 2000 characters.'] });
      Object.assign(invite, { state: 'answered', score, comment, answered_at: NOW });
      upsertLog(send, invite.record);
      return json(204, null);
    }

    if (path === '/surveys/sends/' && method === 'GET') {
      if (stub.list) return reply(stub.list());
      const rows = sends
        .filter(readable)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .map(row);
      return json(200, rows);
    }
    if (path === '/surveys/sends/' && method === 'POST') {
      if (stub.create) return reply(stub.create(body));
      const draft: StoredSend = { ...BASE, id: 0, name: '', survey_type: 'nps', subject: '', segment: null, roles: [], status: 'draft', sharing: 'private', owner: ME, is_owner: true, created_at: NOW, updated_at: NOW };
      const refusal = write(draft, { name: '', subject: '', ...body });
      if (refusal) return reply(refusal);
      draft.id = nextId++;
      sends.push(draft);
      return json(201, payload(draft));
    }
    if (path === '/surveys/sends/audience/' && method === 'POST') {
      if (stub.audience) return reply(stub.audience(body as unknown as AudienceRequest));
      const checked = checkSegment(body.segment, body.roles);
      if (refused(checked)) return reply(checked);
      const empty: AudienceCounts = { audience: 0, organisations: 0, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 };
      return json(200, AUDIENCES[checked.id as number] ?? empty);
    }

    const found = /^\/surveys\/sends\/(\d+)\/(.*)$/.exec(path);
    if (found) {
      const id = Number(found[1]);
      const rest = found[2];
      const send = sends.find((candidate) => candidate.id === id);
      // Unreadable reads the same as missing, on every sub-path.
      if (!send || !readable(send)) return json(404, { detail: 'Not found.' });
      if (rest === '' && method === 'GET') {
        const override = stub.read?.(id);
        return override ? reply(override) : json(200, payload(send));
      }
      if (rest === '' && method === 'PATCH') {
        if (stub.patch) return reply(stub.patch(id, body));
        if (!send.is_owner) return json(403, NOT_OWNER);
        if (send.status !== 'draft') {
          const locked = Object.keys(body).filter((key) => !AFTER_SEND.includes(key)).sort();
          if (locked.length > 0) return json(400, Object.fromEntries(locked.map((key) => [key, [LOCKED]])));
        }
        const refusal = write(send, body);
        return refusal ? reply(refusal) : json(200, payload(send));
      }
      if (rest === '' && method === 'DELETE') {
        if (stub.remove) return reply(stub.remove(id));
        if (!send.is_owner) return json(403, NOT_OWNER);
        if (send.status !== 'draft') return json(409, { detail: "Only a draft can be deleted; a sent survey's answers feed the scores." });
        sends.splice(sends.indexOf(send), 1);
        return json(204, null);
      }
      if (rest === 'send/' && method === 'POST') {
        if (stub.sendNow) return reply(stub.sendNow(id));
        if (!send.is_owner) return json(403, NOT_OWNER);
        if (send.status === 'sent') return json(409, { detail: 'This survey has already been sent.' });
        if (send.status === 'sending') return json(409, { detail: 'This survey is being sent.' });
        if (send.segment === null) return json(400, { segment: ['Choose a segment.'] });
        const checked = checkSegment(send.segment.id, send.roles);
        if (refused(checked)) return reply(checked);
        const people = PEOPLE[checked.id as number] ?? [];
        if (people.length === 0) return json(400, { segment: ['Nobody to send to.'] });
        people.forEach((person, n) => {
          invites.push({ ...INVITE, id: nextInvite++, send: id, token: `tok-${id}-${n}`, contact: person.contact, record: person.record, state: 'pending', expires_at: '2026-10-18T14:00:00Z' });
        });
        const counted = AUDIENCES[checked.id as number];
        Object.assign(send, {
          status: 'sent',
          started_at: NOW,
          sent_at: NOW,
          updated_at: NOW,
          counts: { audience: people.length, sent: people.length, failed: 0, skipped_recent: counted?.skipped_recent ?? 0, skipped_no_email: counted?.skipped_no_email ?? 0, skipped_cap: counted?.skipped_cap ?? 0 },
        });
        return json(200, payload(send));
      }
      if (rest === 'answers/' && method === 'GET') {
        const override = stub.answers?.(id, url.searchParams);
        if (override) return reply(override);
        const asked = url.searchParams.get('filter') ?? '';
        const filter = ['all', 'detractors', 'comments'].includes(asked) ? asked : 'all';
        const matching = invites
          .filter((i) => i.send === id && i.state === 'answered')
          .filter((i) => filter !== 'detractors' || (i.score as number) <= LOW[send.survey_type])
          .filter((i) => filter !== 'comments' || i.comment !== '')
          .sort((a, b) => (b.answered_at as string).localeCompare(a.answered_at as string) || b.id - a.id);
        const seen = matching.filter((i) => i.visible);
        const start = Number(url.searchParams.get('cursor') ?? 0) || 0;
        const page = seen.slice(start, start + pageSize);
        return json(200, {
          filter,
          results: page.map((i) => ({ id: i.id, contact: i.contact, record: i.record, score: i.score, band: bandOf(send.survey_type, i.score as number), comment: i.comment, answered_at: i.answered_at })),
          next_cursor: start + pageSize < seen.length ? String(start + pageSize) : null,
          hidden_count: matching.length - seen.length,
        });
      }
      if (rest === 'pending/' && method === 'GET') {
        if (stub.pending) return reply(stub.pending(id));
        const waiting = invites.filter((i) => i.send === id && i.state !== 'answered');
        const seen = waiting.filter((i) => i.visible).sort(byName);
        return json(200, {
          results: seen.map((i) => ({ id: i.id, contact: i.contact, record: i.record, status: i.state as PendingStatus, expires_at: i.expires_at, failure: i.failure })),
          hidden_count: waiting.length - seen.length,
        });
      }
    }

    if (path === '/surveys/' && method === 'GET') {
      const customer = Number(url.searchParams.get('customer'));
      return json(200, customer ? logged.filter((r) => r.companies.some((c) => c.id === customer)) : logged);
    }
    return segmentsFetch(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, tokensOf: (sendId: number) => invites.filter((invite) => invite.send === sendId).map((invite) => invite.token) };
}

export type SurveysSpy = ReturnType<typeof stubSurveys>['spy'];

/** Every `method` request whose path (without /api/v1) matches `pattern`,
 *  oldest first, with its query and JSON body. */
export function requestsOf(spy: { mock: { calls: [RequestInfo | URL, RequestInit?][] } }, method: string, pattern: RegExp) {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), init }))
    .filter(({ url, init }) => (init?.method ?? 'GET') === method && pattern.test(url.pathname.replace(/^\/api\/v1/, '')))
    .map(({ url, init }) => ({
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    }));
}
```

`LOGGED` sets `send_id`, which `Survey` gains in Task 13. Until then TypeScript flags it; to keep this task independent, add the field now. In `src/features/customers/customersSlice.ts`, inside `export interface Survey`, after `account_name: string | null;`, add:

```ts
  /** The survey send whose answers this row aggregates, or null for a row
   * logged by hand (backend Decision 25). Such a row is read-only: the
   * backend refuses edits (400) and deletes (409), and updates it itself.
   * Optional because older fixtures omit it; the contract always sends it. */
  send_id?: number | null;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/features/surveys/surveyApi.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/surveys/surveyApi.ts src/features/surveys/testSurveys.ts src/features/surveys/surveyApi.test.ts src/features/customers/customersSlice.ts
git commit -m "feat(surveys): the sends API, the session-free public calls and the contract stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Errors at their fields, and the URL state

Spec §2.2 ("Server errors show at their fields"); plan Decisions 4, 9, 17.

**Files:**
- Create: `src/features/surveys/surveyErrors.ts`, `src/features/surveys/surveyParams.ts`
- Test: `src/features/surveys/surveyErrors.test.ts`, `src/features/surveys/surveyParams.test.ts`

**Interfaces:**
- Consumes: `ApiError` (`lib/apiClient`); `AnswersFilter` (Task 1).
- Produces:
  - `SurveyField` (`'name' | 'survey_type' | 'subject' | 'intro' | 'segment' | 'roles' | 'sharing' | 'shared_with'`), `SurveyErrors`, `surveyErrors(err, fallback?): SurveyErrors`;
  - `AnswerErrors` (`score`, `comment`, `form`), `answerErrors(err): AnswerErrors | 'expired'`, `THROTTLED`;
  - `SurveysTab` (`'sends' | 'logged'`), `surveysTab(search): SurveysTab`, `answersFilter(search): AnswersFilter`, `withAnswersFilter(search, filter): URLSearchParams`.

- [ ] **Step 1: Write the failing tests**

`src/features/surveys/surveyErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { answerErrors, surveyErrors, THROTTLED } from './surveyErrors';

const refusal = (status: number, body: unknown) => new ApiError(status, body, 'Refused');

describe('surveyErrors: a write refusal at its field (spec §2.2)', () => {
  it('puts each field the server names at that field', () => {
    expect(surveyErrors(refusal(400, { roles: ['Choose at least one role.'], subject: ['A sent survey can only be renamed or re-shared.'] }))).toEqual({
      roles: 'Choose at least one role.',
      subject: 'A sent survey can only be renamed or re-shared.',
    });
    expect(surveyErrors(refusal(400, { segment: ['Nobody to send to.'] }))).toEqual({ segment: 'Nobody to send to.' });
  });

  it('puts a detail (403, 409, 429) and an unknown key at the form', () => {
    expect(surveyErrors(refusal(429, { detail: 'You can send at most 20 surveys a day. Try again tomorrow.' }))).toEqual({
      form: 'You can send at most 20 surveys a day. Try again tomorrow.',
    });
    expect(surveyErrors(refusal(400, { non_field_errors: ['Odd.'] }))).toEqual({ form: 'Odd.' });
  });

  it('falls back for anything that is not an ApiError', () => {
    expect(surveyErrors(new Error('offline'))).toEqual({ form: 'Could not save this survey. Try again.' });
    expect(surveyErrors(new Error('offline'), 'Could not send this survey. Try again.')).toEqual({ form: 'Could not send this survey. Try again.' });
  });
});

describe('answerErrors: the hosted form', () => {
  it('reads every 404 as the one expired page', () => {
    expect(answerErrors(refusal(404, { detail: 'This link has expired.' }))).toBe('expired');
  });

  it('puts a bad score or comment at its field', () => {
    expect(answerErrors(refusal(400, { score: ['Choose a score from 0 to 10.'] }))).toEqual({ score: 'Choose a score from 0 to 10.' });
    expect(answerErrors(refusal(400, { comment: ['Ensure this field has no more than 2000 characters.'] }))).toEqual({
      comment: 'Ensure this field has no more than 2000 characters.',
    });
  });

  it('says to wait on a 429, and to try again on anything else', () => {
    expect(answerErrors(refusal(429, { detail: 'Request was throttled.' }))).toEqual({ form: THROTTLED });
    expect(answerErrors(new TypeError('Failed to fetch'))).toEqual({ form: 'Could not send your answer. Check your connection and try again.' });
  });
});
```

`src/features/surveys/surveyParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { answersFilter, surveysTab, withAnswersFilter } from './surveyParams';

const params = (text: string) => new URLSearchParams(text);

describe('surveysTab (plan Decision 4)', () => {
  it('opens Sends by default and Logged scores on ?tab=logged', () => {
    expect(surveysTab(params(''))).toBe('sends');
    expect(surveysTab(params('tab=logged'))).toBe('logged');
    expect(surveysTab(params('tab=nonsense'))).toBe('sends');
  });

  it("opens Logged scores for the organisation page's ?customer= link, unless a tab says otherwise", () => {
    expect(surveysTab(params('customer=7'))).toBe('logged');
    expect(surveysTab(params('tab=sends&customer=7'))).toBe('sends');
  });
});

describe('the answers filter in the URL (plan Decision 9)', () => {
  it('reads all, detractors or comments, and anything else as all', () => {
    expect(answersFilter(params(''))).toBe('all');
    expect(answersFilter(params('answers=detractors'))).toBe('detractors');
    expect(answersFilter(params('answers=comments'))).toBe('comments');
    expect(answersFilter(params('answers=everything'))).toBe('all');
  });

  it('writes the filter beside the other parameters, and drops it for all', () => {
    expect(withAnswersFilter(params('x=1'), 'comments').toString()).toBe('x=1&answers=comments');
    expect(withAnswersFilter(params('x=1&answers=comments'), 'all').toString()).toBe('x=1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/surveys/surveyErrors.test.ts src/features/surveys/surveyParams.test.ts`
Expected: FAIL, "Failed to resolve import "./surveyErrors"" and "./surveyParams".

- [ ] **Step 3: Write the two modules**

`src/features/surveys/surveyErrors.ts`:

```ts
// A refusal, put where its key points (spec §2.2: "Server errors show at
// their fields"). A `detail` (403, 409, 429) or a key no field owns goes to
// the form.
import { ApiError } from '../../lib/apiClient';

const SURVEY_FIELDS = ['name', 'survey_type', 'subject', 'intro', 'segment', 'roles', 'sharing', 'shared_with'] as const;
const ANSWER_FIELDS = ['score', 'comment'] as const;

export type SurveyField = (typeof SURVEY_FIELDS)[number];
export type SurveyErrors = Partial<Record<SurveyField | 'form', string>>;
export type AnswerErrors = Partial<Record<(typeof ANSWER_FIELDS)[number] | 'form', string>>;

/** Plan Decision 17. */
export const THROTTLED = 'Too many tries from this network. Wait a minute, then try again.';

function fieldErrors<F extends string>(err: unknown, fields: readonly F[], fallback: string): Partial<Record<F | 'form', string>> {
  if (!(err instanceof ApiError)) return { form: fallback } as Partial<Record<F | 'form', string>>;
  const out: Partial<Record<F | 'form', string>> = {};
  const body = err.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
      if ((fields as readonly string[]).includes(key)) out[key as F] = value[0];
      else out.form ??= value[0];
    }
    if (typeof record.detail === 'string') out.form = record.detail;
  }
  return Object.keys(out).length > 0 ? out : ({ form: err.message } as Partial<Record<F | 'form', string>>);
}

export function surveyErrors(err: unknown, fallback = 'Could not save this survey. Try again.'): SurveyErrors {
  return fieldErrors(err, SURVEY_FIELDS, fallback);
}

/** The hosted form's refusal. Every 404 is the one expired page (no
 *  oracle: unknown, expired, answered and failed read the same). */
export function answerErrors(err: unknown): AnswerErrors | 'expired' {
  if (err instanceof ApiError && err.status === 404) return 'expired';
  if (err instanceof ApiError && err.status === 429) return { form: THROTTLED };
  if (!(err instanceof ApiError)) return { form: 'Could not send your answer. Check your connection and try again.' };
  return fieldErrors(err, ANSWER_FIELDS, 'Could not send your answer. Try again.');
}
```

`src/features/surveys/surveyParams.ts`:

```ts
// The Surveys pages' URL state: which tab (/surveys?tab=) and which answers
// (/surveys/:id?answers=).
import type { AnswersFilter } from './surveyTypes';

export type SurveysTab = 'sends' | 'logged';
const FILTERS: readonly AnswersFilter[] = ['all', 'detractors', 'comments'];

/** Sends unless `?tab=logged`, or unless `?customer=` (the organisation
 *  page's "Manage surveys") arrives with no tab (plan Decision 4). */
export function surveysTab(search: URLSearchParams): SurveysTab {
  const tab = search.get('tab');
  if (tab === 'logged') return 'logged';
  if (tab === 'sends') return 'sends';
  return search.has('customer') ? 'logged' : 'sends';
}

export function answersFilter(search: URLSearchParams): AnswersFilter {
  const value = search.get('answers');
  return FILTERS.find((filter) => filter === value) ?? 'all';
}

export function withAnswersFilter(search: URLSearchParams, filter: AnswersFilter): URLSearchParams {
  const next = new URLSearchParams(search);
  if (filter === 'all') next.delete('answers');
  else next.set('answers', filter);
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/surveys/surveyErrors.test.ts src/features/surveys/surveyParams.test.ts`
Expected: PASS (6 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/surveys/surveyErrors.ts src/features/surveys/surveyParams.ts src/features/surveys/surveyErrors.test.ts src/features/surveys/surveyParams.test.ts
git commit -m "feat(surveys): refusals at their fields, the tab and the answers filter in the URL

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The score buttons

Spec §2.4 ("the score buttons in one row (44px targets, wrapping on phones; NPS labelled "Not likely" … "Very likely")"); plan Decision 8.

**Files:**
- Create: `src/components/surveys/ScaleButtons.tsx`
- Test: `src/components/surveys/ScaleButtons.test.tsx`

**Interfaces:**
- Consumes: `scaleOf`, `SCALE_ENDS` (Task 1); `MONO` (`components/organizations/portfolio/styles`).
- Produces: `ScaleButtons({ type: SurveyType; value: number | null; onChange?: (score: number) => void; preview?: boolean })`. Live: one native radio per score inside a 44px label tile, the end labels describing the first and last radio. `preview`: the same row as a picture (`aria-hidden`), with one sr-only sentence "Scores {low} to {high}, from {low label} to {high label}".

- [ ] **Step 1: Write the failing test**

`src/components/surveys/ScaleButtons.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScaleButtons } from './ScaleButtons';

describe('ScaleButtons', () => {
  it('draws one radio per NPS score, 0 to 10, the ends described as Not likely and Very likely', () => {
    render(<ScaleButtons type="nps" value={null} onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(screen.getByRole('radio', { name: '0' })).toHaveAccessibleDescription('Not likely');
    expect(screen.getByRole('radio', { name: '10' })).toHaveAccessibleDescription('Very likely');
    expect(screen.getByRole('radio', { name: '5' })).not.toHaveAccessibleDescription();
  });

  it('reports the chosen score and shows it checked', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ScaleButtons type="csat" value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(onChange).toHaveBeenCalledWith(4);
    rerender(<ScaleButtons type="csat" value={4} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: '4' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '4' }).closest('label')).toHaveClass('bg-accent', 'text-on-accent');
  });

  it('gives every score a 44px target in a row that wraps on phones', () => {
    render(<ScaleButtons type="nps" value={null} onChange={vi.fn()} />);
    for (const radio of screen.getAllByRole('radio')) expect(radio.closest('label')).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByRole('radio', { name: '0' }).closest('label')?.parentElement).toHaveClass('flex', 'flex-wrap');
  });

  it('draws a picture, not a control, in the preview', () => {
    render(<ScaleButtons type="ces" value={null} preview />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('Scores 1 to 7, from Very difficult to Very easy')).toHaveClass('sr-only');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/ScaleButtons.test.tsx`
Expected: FAIL, "Failed to resolve import "./ScaleButtons"".

- [ ] **Step 3: Write the component**

`src/components/surveys/ScaleButtons.tsx`:

```tsx
import { useId } from 'react';
import { SCALE_ENDS, scaleOf } from '../../features/surveys/questions';
import type { SurveyType } from '../../features/surveys/surveyTypes';
import { MONO } from '../organizations/portfolio/styles';

const TILE = `${MONO} inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-2 text-[15px] font-semibold`;

/** The type's scores in one row, 44px each, wrapping on phones (spec §2.4).
 *  Native radios underneath, so arrow keys move between scores and a screen
 *  reader hears "9, radio, 10 of 11"; the end labels describe the lowest and
 *  the highest. `preview` draws the same row as a picture for the builder,
 *  with no control in it. */
export function ScaleButtons({
  type,
  value,
  onChange,
  preview = false,
}: {
  type: SurveyType;
  value: number | null;
  onChange?: (score: number) => void;
  preview?: boolean;
}) {
  const name = useId();
  const lowId = useId();
  const highId = useId();
  const scores = scaleOf(type);
  const [lowLabel, highLabel] = SCALE_ENDS[type];
  const first = scores[0];
  const last = scores[scores.length - 1];
  return (
    <div className="flex flex-col gap-1.5">
      {preview ? (
        <>
          <p className="sr-only">
            Scores {first} to {last}, from {lowLabel} to {highLabel}
          </p>
          <div aria-hidden="true" className="flex flex-wrap gap-1.5">
            {scores.map((score) => (
              <span key={score} className={`${TILE} border-line bg-surface text-ink`}>
                {score}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {scores.map((score) => {
            const checked = value === score;
            return (
              <label
                key={score}
                className={`${TILE} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                  checked ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink hover:border-line-strong'
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  value={score}
                  checked={checked}
                  onChange={() => onChange?.(score)}
                  aria-describedby={score === first ? lowId : score === last ? highId : undefined}
                  className="sr-only"
                />
                {score}
              </label>
            );
          })}
        </div>
      )}
      <div aria-hidden={preview ? 'true' : undefined} className="flex justify-between gap-3 text-[11px] text-ink-muted">
        <span id={lowId}>{lowLabel}</span>
        <span id={highId}>{highLabel}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/ScaleButtons.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/surveys/ScaleButtons.tsx src/components/surveys/ScaleButtons.test.tsx
git commit -m "feat(surveys): the score buttons, 44px radios that wrap, and their preview picture

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The hosted form at `/s/:token`, public and light only

Spec §2.4, §3 ("The public link reveals the organisation's name and the question only"); plan Decisions 5, 6, 17, 18.

**Files:**
- Create: `src/lib/theme.ts`, `src/pages/surveys/HostedForm.tsx`, `src/pages/surveys/testPages.tsx`
- Modify: `src/App.tsx` (the public route, `ThemeSynchronizer`)
- Test: `src/lib/theme.test.ts`, `src/pages/surveys/HostedForm.test.tsx`

**Interfaces:**
- Consumes: `fetchPublicSurvey`, `answerPublicSurvey` (Task 2); `answerErrors`, `THROTTLED`, `AnswerErrors` (Task 3); `COMMENT_MAX`, `LINK_DAYS`, `SCALES` (Task 1); `ScaleButtons` (Task 4); `RevenactMark` (`components/shared/RevenactMark`); `stubSurveys`, `requestsOf`, `LIVE_TOKEN` (Task 2).
- Produces:
  - `themeIsDark(theme: 'light' | 'dark' | 'system', prefersDark: boolean, pathname: string): boolean`, `LIGHT_ONLY` (`/^\/s\//`);
  - `HostedForm()` (route element for `/s/:token`);
  - `testPages.tsx`: `renderHosted(token: string, { width?: number }): { unmount }` (no store at all).

- [ ] **Step 1: Write the failing tests**

`src/lib/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { themeIsDark } from './theme';

describe('themeIsDark (surveys plan Decision 5)', () => {
  it('follows the setting, and the system preference for "system"', () => {
    expect(themeIsDark('dark', false, '/dashboard')).toBe(true);
    expect(themeIsDark('light', true, '/dashboard')).toBe(false);
    expect(themeIsDark('system', true, '/dashboard')).toBe(true);
    expect(themeIsDark('system', false, '/dashboard')).toBe(false);
  });

  it('is always light on the hosted survey form, and only there', () => {
    expect(themeIsDark('dark', true, '/s/abc')).toBe(false);
    expect(themeIsDark('system', true, '/s/abc')).toBe(false);
    expect(themeIsDark('dark', true, '/surveys')).toBe(true);
    expect(themeIsDark('dark', true, '/settings')).toBe(true);
  });
});
```

`src/pages/surveys/HostedForm.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { THROTTLED } from '../../features/surveys/surveyErrors';
import { EXPIRED, LIVE_TOKEN, requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderHosted } from './testPages';

// Integration tier: the form on a router with NO store (a store read would
// throw: it never reads the session), fetch stubbed in the public link's
// contract shapes. Phone width, where a customer opens the email.
const QUESTION = 'How likely are you to recommend Acme Inc to a friend or colleague?';
const getAs = (survey_type: 'csat' | 'ces', question: string) => (_token: string, method: string) =>
  method === 'GET' ? { status: 200, body: { survey_type, question, intro: '', organisation_name: 'Acme Inc' } } : undefined;

describe('the hosted form (/s/:token)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('asks the question with the workspace name under the intro, NPS 0 to 10 with its end labels, and records an answer', async () => {
    const { spy } = stubSurveys();
    renderHosted(LIVE_TOKEN);
    expect(await screen.findByRole('heading', { level: 1, name: QUESTION })).toBeInTheDocument();
    expect(screen.getByText('Two minutes, promise.')).toBeInTheDocument();
    const scale = screen.getByRole('group', { name: QUESTION });
    expect(within(scale).getAllByRole('radio')).toHaveLength(11);
    expect(screen.getByRole('radio', { name: '0' })).toHaveAccessibleDescription('Not likely');
    expect(screen.getByRole('radio', { name: '10' })).toHaveAccessibleDescription('Very likely');

    await userEvent.click(screen.getByRole('radio', { name: '9' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Anything to add/ }), '  Quick and kind  ');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Thanks, your answer was recorded.' })).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/public\/surveys\//).map((r) => r.body)).toEqual([{ score: 9, comment: 'Quick and kind' }]);
  });

  it('sends no session: no Authorization header on either call', async () => {
    const { spy } = stubSurveys();
    renderHosted(LIVE_TOKEN);
    await userEvent.click(await screen.findByRole('radio', { name: '7' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('heading', { name: 'Thanks, your answer was recorded.' });
    const headers = spy.mock.calls.map(([, init]) => (init?.headers ?? {}) as Record<string, string>);
    expect(headers).toHaveLength(2);
    expect(headers.every((header) => header.Authorization === undefined)).toBe(true);
  });

  it.each([
    ['csat' as const, 'How satisfied are you with Acme Inc?', ['1', '2', '3', '4', '5'], 'Very unsatisfied', 'Very satisfied'],
    ['ces' as const, 'How easy is it to get what you need from Acme Inc?', ['1', '2', '3', '4', '5', '6', '7'], 'Very difficult', 'Very easy'],
  ])('draws the %s scale with its end labels', async (type, question, values, low, high) => {
    stubSurveys({ publicLink: getAs(type, question) });
    renderHosted('another-token');
    expect(await screen.findByRole('heading', { level: 1, name: question })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual(values);
    expect(radios[0]).toHaveAccessibleDescription(low);
    expect(radios[radios.length - 1]).toHaveAccessibleDescription(high);
  });

  it('asks for a score before sending anything', async () => {
    const { spy } = stubSurveys();
    renderHosted(LIVE_TOKEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a score from 0 to 10.');
    expect(requestsOf(spy, 'POST', /^\/public\/surveys\//)).toEqual([]);
  });

  it("shows the server's range refusal at the score, and keeps the form", async () => {
    stubSurveys({ publicLink: (_token, method) => (method === 'POST' ? { status: 400, body: { score: ['Choose a score from 0 to 10.'] } } : undefined) });
    renderHosted(LIVE_TOKEN);
    await userEvent.click(await screen.findByRole('radio', { name: '3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a score from 0 to 10.');
    expect(screen.getByRole('radio', { name: '3' })).toBeChecked();
  });

  it('caps the comment at 2000 characters and counts them', async () => {
    stubSurveys();
    renderHosted(LIVE_TOKEN);
    const comment = await screen.findByRole('textbox', { name: /Anything to add/ });
    expect(comment).toHaveAttribute('maxlength', '2000');
    await userEvent.type(comment, 'Hello');
    expect(comment).toHaveAccessibleDescription('5 of 2000');
  });

  it.each(['no-such-token', 'answered-31', 'failed-35', 'expired-36'])('reads the one expired page for %s', async (token) => {
    stubSurveys();
    renderHosted(token);
    expect(await screen.findByRole('heading', { level: 1, name: 'This link has expired.' })).toBeInTheDocument();
    expect(screen.getByText('Survey links work for 14 days and take one answer.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('turns a second answer (a 404 on submit) into the expired page', async () => {
    stubSurveys({ publicLink: (_token, method) => (method === 'POST' ? { status: 404, body: EXPIRED } : undefined) });
    renderHosted(LIVE_TOKEN);
    await userEvent.click(await screen.findByRole('radio', { name: '9' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'This link has expired.' })).toBeInTheDocument();
  });

  it('says to wait when the link is throttled, and Try again reads it again', async () => {
    let calls = 0;
    const { spy } = stubSurveys({
      publicLink: (_token, method) => {
        if (method !== 'GET') return undefined;
        calls += 1;
        return calls === 1 ? { status: 429, body: { detail: 'Request was throttled.' } } : undefined;
      },
    });
    renderHosted(LIVE_TOKEN);
    expect(await screen.findByText(THROTTLED)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: QUESTION })).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/public\/surveys\//)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/lib/theme.test.ts src/pages/surveys/HostedForm.test.tsx`
Expected: FAIL, "Failed to resolve import "./theme"" and "./testPages".

- [ ] **Step 3: Write the theme rule**

`src/lib/theme.ts`:

```ts
// Which theme the document wears. One exception to the setting: the hosted
// survey form a customer opens from an email is light only (surveys spec
// §2.4), whatever the device or a signed-in teammate's setting says.
export type ThemeSetting = 'light' | 'dark' | 'system';

/** Pages that are always light. */
export const LIGHT_ONLY = /^\/s\//;

export function themeIsDark(theme: ThemeSetting, prefersDark: boolean, pathname: string): boolean {
  if (LIGHT_ONLY.test(pathname)) return false;
  return theme === 'dark' || (theme === 'system' && prefersDark);
}
```

- [ ] **Step 4: Write the hosted form and its test helper**

`src/pages/surveys/HostedForm.tsx`:

```tsx
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { FOCUS, MONO, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { RevenactMark } from '../../components/shared/RevenactMark';
import { ScaleButtons } from '../../components/surveys/ScaleButtons';
import { ApiError } from '../../lib/apiClient';
import { COMMENT_MAX, LINK_DAYS, SCALES } from '../../features/surveys/questions';
import { answerPublicSurvey, fetchPublicSurvey } from '../../features/surveys/surveyApi';
import { answerErrors, THROTTLED, type AnswerErrors } from '../../features/surveys/surveyErrors';
import type { PublicSurvey } from '../../features/surveys/surveyTypes';

type View =
  | { status: 'loading' }
  | { status: 'live'; survey: PublicSurvey }
  | { status: 'thanks' }
  | { status: 'expired' }
  | { status: 'failed'; message: string };

/** /s/:token (spec §2.4): the customer's one-time form, outside the app
 *  frame and the signed-in guard. It reads no store and sends no session
 *  (plan Decision 6); App's ThemeSynchronizer keeps it light (Decision 5).
 *  Every bad link reads the same expired page. */
export function HostedForm() {
  const { token = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${token}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; view: View } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPublicSurvey(token).then(
      (survey) => {
        if (alive) setAnswer({ key, view: { status: 'live', survey } });
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) setAnswer({ key, view: { status: 'expired' } });
        else {
          const message = err instanceof ApiError && err.status === 429 ? THROTTLED : 'Could not open this survey. Check your connection and try again.';
          setAnswer({ key, view: { status: 'failed', message } });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [key, token]);

  const view: View = answer?.key === key ? answer.view : { status: 'loading' };
  return (
    <main className="flex min-h-[100dvh] w-full justify-center bg-base px-4 py-10 text-ink">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <RevenactMark withWordmark size="sm" />
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          {view.status === 'loading' ? (
            <div role="status" aria-label="Loading the survey" className="flex flex-col gap-3">
              <span className="block h-6 w-3/4 animate-pulse rounded bg-subtle" />
              <span className="block h-11 w-full animate-pulse rounded bg-subtle" />
            </div>
          ) : null}
          {view.status === 'live' ? <AnswerForm token={token} survey={view.survey} onDone={(next) => setAnswer({ key, view: next })} /> : null}
          {view.status === 'thanks' ? <Message title="Thanks, your answer was recorded." detail="You can close this page." /> : null}
          {view.status === 'expired' ? <Message title="This link has expired." detail={`Survey links work for ${LINK_DAYS} days and take one answer.`} /> : null}
          {view.status === 'failed' ? (
            <Message
              title="This survey didn't open"
              detail={view.message}
              action={
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} self-start border border-line`}>
                  Try again
                </button>
              }
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Message({ title, detail, action = null }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[22px] font-semibold text-ink">{title}</h1>
      <p className="text-[13px] text-ink-muted">{detail}</p>
      {action}
    </div>
  );
}

function AnswerForm({ token, survey, onDone }: { token: string; survey: PublicSurvey; onDone: (view: View) => void }) {
  const questionId = useId();
  const commentId = useId();
  const scoreErrorId = useId();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<AnswerErrors>({});
  const [sending, setSending] = useState(false);
  const [low, high] = SCALES[survey.survey_type];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (score === null) {
      setErrors({ score: `Choose a score from ${low} to ${high}.` });
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const text = comment.trim();
      await answerPublicSurvey(token, text ? { score, comment: text } : { score });
      onDone({ status: 'thanks' });
    } catch (err) {
      const found = answerErrors(err);
      if (found === 'expired') {
        onDone({ status: 'expired' });
        return;
      }
      setErrors(found);
      setSending(false);
    }
  }

  const describedBy = [`${commentId}-count`, errors.comment ? `${commentId}-error` : null].filter(Boolean).join(' ');
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
      {survey.intro ? <p className="whitespace-pre-line break-words text-[13px] text-ink-muted">{survey.intro}</p> : null}
      <fieldset aria-labelledby={questionId} aria-describedby={errors.score ? scoreErrorId : undefined} className="flex flex-col gap-3">
        <h1 id={questionId} className="text-[22px] font-semibold text-ink">
          {survey.question}
        </h1>
        <ScaleButtons
          type={survey.survey_type}
          value={score}
          onChange={(next) => {
            setScore(next);
            setErrors((current) => ({ ...current, score: undefined }));
          }}
        />
        {errors.score ? (
          <p id={scoreErrorId} role="alert" className="text-[13px] text-danger">
            {errors.score}
          </p>
        ) : null}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={commentId} className="text-[13px] font-semibold text-ink">
          Anything to add? <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea
          id={commentId}
          rows={4}
          value={comment}
          maxLength={COMMENT_MAX}
          onChange={(event) => setComment(event.target.value)}
          aria-invalid={Boolean(errors.comment)}
          aria-describedby={describedBy}
          className={`min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-[15px] text-ink ${errors.comment ? 'border-danger' : 'border-line'} ${FOCUS}`}
        />
        <p id={`${commentId}-count`} className="text-right text-[11px] text-ink-muted">
          <span className={MONO}>{comment.length}</span> of <span className={MONO}>{COMMENT_MAX}</span>
        </p>
        {errors.comment ? (
          <p id={`${commentId}-error`} role="alert" className="text-[13px] text-danger">
            {errors.comment}
          </p>
        ) : null}
      </div>
      {errors.form ? (
        <p role="alert" className="text-[13px] text-danger">
          {errors.form}
        </p>
      ) : null}
      <button type="submit" disabled={sending} className={`${PRIMARY} self-start px-5`}>
        {sending ? 'Sending…' : 'Submit'}
      </button>
    </form>
  );
}
```

`src/pages/surveys/testPages.tsx`:

```tsx
// Test-only helpers, never hot-reloaded.
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setViewport } from '../../test/viewport';
import { HostedForm } from './HostedForm';

/** The hosted form at /s/<token> with no store at all: it must never read
 *  the session, so any store read would throw here. Phone width by default. */
export function renderHosted(token: string, { width = 375 }: { width?: number } = {}) {
  setViewport(width);
  const view = render(
    <MemoryRouter initialEntries={[`/s/${encodeURIComponent(token)}`]}>
      <Routes>
        <Route path="/s/:token" element={<HostedForm />} />
      </Routes>
    </MemoryRouter>,
  );
  return { unmount: view.unmount };
}
```

- [ ] **Step 5: Route it in `App.tsx`, outside the guard, and keep it light**

In `src/App.tsx`:

1. Change the router import to add `useLocation`:

```tsx
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
```

2. Add beside the other page imports:

```tsx
import { themeIsDark } from './lib/theme';
import { HostedForm } from './pages/surveys/HostedForm';
```

3. In `ThemeSynchronizer`, replace

```tsx
  const theme = useAppSelector((state) => state.settings.theme);

  useEffect(() => {
    const updateTheme = () => {
      const isDark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
```

with

```tsx
  const theme = useAppSelector((state) => state.settings.theme);
  // The hosted survey form (/s/:token) is light only (surveys spec §2.4).
  const { pathname } = useLocation();

  useEffect(() => {
    const updateTheme = () => {
      const isDark = themeIsDark(theme, window.matchMedia('(prefers-color-scheme: dark)').matches, pathname);
```

and its dependency list `  }, [theme]);` (the only one in the file) with `  }, [theme, pathname]);`.

4. Directly below `<Route path="/reset-password" element={<ResetPassword />} />`, add:

```tsx
        {/* The one-time survey link a customer opens from their email
            (surveys spec §2.4): no shell, no session, light only. */}
        <Route path="/s/:token" element={<HostedForm />} />
```

- [ ] **Step 6: Run the tests to verify they pass, then type-check**

Run: `npx vitest run --maxWorkers=2 src/lib/theme.test.ts src/pages/surveys/HostedForm.test.tsx`
Expected: PASS (2 + 13 tests).

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts src/pages/surveys/HostedForm.tsx src/pages/surveys/HostedForm.test.tsx src/pages/surveys/testPages.tsx src/App.tsx
git commit -m "feat(surveys): the hosted form at /s/:token, public, session-free and light only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The audience count, debounced, latest wins

Spec §2.2 ("400 ms after the last change, latest wins", the reach line, the skips, "N in the segment you can't open aren't included", "0 people disables Send with the reason"); plan Decisions 13, 14.

**Files:**
- Create: `src/components/surveys/useAudience.ts`, `src/components/surveys/Lines.tsx`, `src/components/surveys/AudienceSummary.tsx`
- Test: `src/components/surveys/useAudience.test.tsx`, `src/components/surveys/AudienceSummary.test.tsx`

**Interfaces:**
- Consumes: `fetchAudience` (Task 2); `surveyErrors` (Task 3); `reach`, `skipLines`, `hiddenLine`, `sendBlocker`, `Line` (Task 1); `ItemSkeleton` (`components/organizations/portfolio/PortfolioSections`), `MONO`.
- Produces:
  - `AUDIENCE_DEBOUNCE_MS = 400`; `AudienceState = { status: 'incomplete' } | { status: 'loading'; last: AudienceCounts | null } | { status: 'ready'; data: AudienceCounts } | { status: 'error'; message: string }`; `useAudience(request: AudienceRequest | null): AudienceState`;
  - `Lines({ lines: Line[] })` (figures in DM Mono, joined by " · ");
  - `ReachLines({ counts: AudienceCounts; kind: SegmentKind | null })` (`data-part` `reach`, `skips`, `hidden`, `blocker`);
  - `AudienceSummary({ state: AudienceState; kind: SegmentKind | null })`, a region named "Who it reaches".

- [ ] **Step 1: Write the failing tests**

`src/components/surveys/useAudience.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '../../lib/apiClient';
import * as api from '../../features/surveys/surveyApi';
import type { AudienceCounts, AudienceRequest } from '../../features/surveys/surveyTypes';
import { AUDIENCE_DEBOUNCE_MS, useAudience } from './useAudience';

vi.mock('../../features/surveys/surveyApi');

const request = (roles: AudienceRequest['roles']): AudienceRequest => ({ segment: 7, roles });
const counts = (audience: number): AudienceCounts => ({ audience, organisations: 1, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 });

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useAudience (spec §2.2: 400 ms after the last change, latest wins)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(api.fetchAudience).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('asks nothing until there is something to count', async () => {
    const { result } = renderHook(() => useAudience(null));
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS * 2);
    });
    expect(result.current).toEqual({ status: 'incomplete' });
    expect(api.fetchAudience).not.toHaveBeenCalled();
  });

  it('asks once, 400 ms after the last change, with the last roles', async () => {
    vi.mocked(api.fetchAudience).mockResolvedValue(counts(42));
    const { result, rerender } = renderHook(({ r }) => useAudience(r), { initialProps: { r: request(['champion']) } });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS - 1);
    });
    rerender({ r: request(['champion', 'decision_maker']) });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    expect(api.fetchAudience).toHaveBeenCalledTimes(1);
    expect(api.fetchAudience).toHaveBeenCalledWith(request(['champion', 'decision_maker']));
    expect(result.current).toEqual({ status: 'ready', data: counts(42) });
  });

  it('drops an answer a newer request superseded, keeping the last good count meanwhile', async () => {
    const stale = deferred<AudienceCounts>();
    const latest = deferred<AudienceCounts>();
    vi.mocked(api.fetchAudience).mockResolvedValueOnce(counts(10)).mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise);
    const { result, rerender } = renderHook(({ r }) => useAudience(r), { initialProps: { r: request(['champion']) } });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    expect(result.current).toEqual({ status: 'ready', data: counts(10) });
    rerender({ r: request(['decision_maker']) });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    rerender({ r: request(['influencer']) });
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    await act(async () => {
      stale.resolve(counts(20));
    });
    expect(result.current).toEqual({ status: 'loading', last: counts(10) });
    await act(async () => {
      latest.resolve(counts(30));
    });
    expect(result.current).toEqual({ status: 'ready', data: counts(30) });
  });

  it("shows a refusal's own words", async () => {
    vi.mocked(api.fetchAudience).mockRejectedValue(new ApiError(403, { detail: 'You can only survey your own segments.' }, 'Refused'));
    const { result } = renderHook(() => useAudience(request(['champion'])));
    await act(async () => {
      vi.advanceTimersByTime(AUDIENCE_DEBOUNCE_MS);
    });
    expect(result.current).toEqual({ status: 'error', message: 'You can only survey your own segments.' });
  });
});
```

`src/components/surveys/AudienceSummary.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AudienceCounts } from '../../features/surveys/surveyTypes';
import { AudienceSummary } from './AudienceSummary';

const COUNTS: AudienceCounts = { audience: 42, organisations: 18, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0, hidden_count: 3, limit: 500 };

describe('AudienceSummary (spec §2.2)', () => {
  it("reads who it reaches, the skips and those the builder can't open, figures in DM Mono", () => {
    const { container } = render(<AudienceSummary state={{ status: 'ready', data: COUNTS }} kind="customer" />);
    const region = screen.getByRole('region', { name: 'Who it reaches' });
    expect(region.querySelector('[data-part="reach"]')).toHaveTextContent('42 people at 18 organisations');
    expect(region.querySelector('[data-part="skips"]')).toHaveTextContent('6 skipped (surveyed in the last 30 days) · 2 without an email');
    expect(region.querySelector('[data-part="hidden"]')).toHaveTextContent("3 in the segment you can't open aren't included");
    expect(region.querySelector('[data-part="blocker"]')).toBeNull();
    expect([...container.querySelectorAll('.font-mono-brand')].map((node) => node.textContent)).toEqual(['42', '18', '6', '2', '3']);
  });

  it('says accounts for an account segment', () => {
    render(<AudienceSummary state={{ status: 'ready', data: { ...COUNTS, organisations: 1 } }} kind="account" />);
    expect(document.querySelector('[data-part="reach"]')).toHaveTextContent('42 people at 1 account');
  });

  it('says why nobody, or too many, can be sent to', () => {
    const { rerender } = render(<AudienceSummary state={{ status: 'ready', data: { ...COUNTS, audience: 0 } }} kind="contact" />);
    expect(document.querySelector('[data-part="blocker"]')).toHaveTextContent('Nobody to send to.');
    rerender(<AudienceSummary state={{ status: 'ready', data: { ...COUNTS, audience: 612 } }} kind="contact" />);
    expect(document.querySelector('[data-part="blocker"]')).toHaveTextContent('This survey would reach 612 people; the most is 500.');
  });

  it('asks for a segment first, dims the last count while a new one loads, and shows a refusal', () => {
    const { rerender } = render(<AudienceSummary state={{ status: 'incomplete' }} kind={null} />);
    expect(screen.getByText('Choose a segment, and who to ask at each organisation, to see who it reaches.')).toBeInTheDocument();
    rerender(<AudienceSummary state={{ status: 'loading', last: null }} kind="customer" />);
    expect(screen.getByRole('status', { name: 'Counting who it reaches' })).toBeInTheDocument();
    rerender(<AudienceSummary state={{ status: 'loading', last: COUNTS }} kind="customer" />);
    expect(screen.getByRole('region', { name: 'Who it reaches' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-part="reach"]')?.closest('.opacity-60')).not.toBeNull();
    rerender(<AudienceSummary state={{ status: 'error', message: 'Choose at least one role.' }} kind="customer" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one role.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/useAudience.test.tsx src/components/surveys/AudienceSummary.test.tsx`
Expected: FAIL, "Failed to resolve import "./useAudience"" and "./AudienceSummary".

- [ ] **Step 3: Write the hook and the two components**

`src/components/surveys/useAudience.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { fetchAudience } from '../../features/surveys/surveyApi';
import { surveyErrors } from '../../features/surveys/surveyErrors';
import type { AudienceCounts, AudienceRequest } from '../../features/surveys/surveyTypes';

export const AUDIENCE_DEBOUNCE_MS = 400;

export type AudienceState =
  | { status: 'incomplete' }
  | { status: 'loading'; last: AudienceCounts | null }
  | { status: 'ready'; data: AudienceCounts }
  | { status: 'error'; message: string };

type Answer = { key: string; data: AudienceCounts } | { key: string; error: string };
const FALLBACK = 'Could not count who this reaches.';

/** The builder's audience count (spec §2.2), as Segments' usePreview:
 *  POST /sends/audience/ 400 ms after the last change, never while nothing
 *  is chosen (`request` null). Each request is keyed by its body and an
 *  answer counts only while its key is the latest; the last good count
 *  stays (dimmed) while a newer one loads. */
export function useAudience(request: AudienceRequest | null): AudienceState {
  const key = request ? JSON.stringify(request) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [last, setLast] = useState<AudienceCounts | null>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    latest.current = key;
    if (!key) return;
    let cancelled = false;
    const body = JSON.parse(key) as AudienceRequest;
    const timer = window.setTimeout(() => {
      fetchAudience(body).then(
        (data) => {
          if (cancelled || latest.current !== key) return;
          setAnswer({ key, data });
          setLast(data);
        },
        (err: unknown) => {
          if (cancelled || latest.current !== key) return;
          const errors = surveyErrors(err, FALLBACK);
          setAnswer({ key, error: errors.roles ?? errors.segment ?? errors.form ?? FALLBACK });
        },
      );
    }, AUDIENCE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  if (!key) return { status: 'incomplete' };
  if (answer?.key === key) return 'data' in answer ? { status: 'ready', data: answer.data } : { status: 'error', message: answer.error };
  return { status: 'loading', last };
}
```

`src/components/surveys/Lines.tsx`:

```tsx
import type { Line } from '../../features/surveys/surveyText';
import { MONO } from '../organizations/portfolio/styles';

/** "6 skipped (…) · 2 without an email": each figure in DM Mono. */
export function Lines({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <span key={line.text}>
          {index > 0 ? ' · ' : ''}
          <span className={MONO}>{line.n}</span> {line.text}
        </span>
      ))}
    </>
  );
}
```

`src/components/surveys/AudienceSummary.tsx`:

```tsx
import { useId } from 'react';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { hiddenLine, reach, sendBlocker, skipLines } from '../../features/surveys/surveyText';
import type { AudienceCounts } from '../../features/surveys/surveyTypes';
import { ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { MONO } from '../organizations/portfolio/styles';
import { Lines } from './Lines';
import type { AudienceState } from './useAudience';

const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

/** "42 people at 18 organisations", the skips, those the builder can't
 *  open, and why a send can't go. Shared by the summary and the confirm. */
export function ReachLines({ counts, kind }: { counts: AudienceCounts; kind: SegmentKind | null }) {
  const line = reach(counts, kind);
  const skips = skipLines(counts);
  const hidden = hiddenLine(counts);
  const blocker = sendBlocker(counts);
  return (
    <div className="flex flex-col gap-1">
      <p data-part="reach" className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-ink-muted">
        <span className={`${MONO} text-[22px] font-semibold text-ink`}>{line.people}</span> {line.peopleNoun} at <span className={MONO}>{line.records}</span>{' '}
        {line.recordNoun}
      </p>
      {skips.length > 0 ? (
        <p data-part="skips" className="text-[11px] text-ink-muted">
          <Lines lines={skips} />
        </p>
      ) : null}
      {hidden ? (
        <p data-part="hidden" className="text-[11px] text-ink-muted">
          <span className={MONO}>{hidden.n}</span> {hidden.text}
        </p>
      ) : null}
      {blocker ? (
        <p data-part="blocker" className="text-[13px] text-danger">
          {blocker}
        </p>
      ) : null}
    </div>
  );
}

/** Under the preview (spec §2.2): who the survey reaches, counted on the
 *  server from the builder's own view. */
export function AudienceSummary({ state, kind }: { state: AudienceState; kind: SegmentKind | null }) {
  const headingId = useId();
  const data = state.status === 'ready' ? state.data : state.status === 'loading' ? state.last : null;
  let body;
  if (state.status === 'incomplete') {
    body = <p className="text-[13px] text-ink-muted">Choose a segment, and who to ask at each organisation, to see who it reaches.</p>;
  } else if (state.status === 'error') {
    body = (
      <p role="alert" className="text-[13px] text-danger">
        {state.message}
      </p>
    );
  } else if (!data) {
    body = <ItemSkeleton count={1} label="Counting who it reaches" avatar={false} />;
  } else {
    body = (
      <div className={state.status === 'loading' ? 'opacity-60' : ''}>
        <ReachLines counts={data} kind={kind} />
      </div>
    );
  }
  return (
    <section aria-labelledby={headingId} aria-busy={state.status === 'loading'} className="flex flex-col gap-2 rounded-xl bg-subtle p-3">
      <h3 id={headingId} className={LABEL}>
        Who it reaches
      </h3>
      {body}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/useAudience.test.tsx src/components/surveys/AudienceSummary.test.tsx`
Expected: PASS (4 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/surveys/useAudience.ts src/components/surveys/useAudience.test.tsx src/components/surveys/Lines.tsx src/components/surveys/AudienceSummary.tsx src/components/surveys/AudienceSummary.test.tsx
git commit -m "feat(surveys): the audience count, debounced and latest-wins, with its skip lines

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The audience fields: my segments by kind, and the roles

Spec §2.2 ("the owner's segments in a select grouped by kind, and, for organisation and account segments, role checkboxes (Champion and Decision Maker ticked by default) with "up to 3 people per organisation"").

**Files:**
- Create: `src/components/surveys/useMySegments.ts`, `src/components/surveys/AudienceFields.tsx`
- Test: `src/components/surveys/useMySegments.test.tsx`, `src/components/surveys/AudienceFields.test.tsx`

**Interfaces:**
- Consumes: `fetchSegments` (`features/segments/segmentApi`), `KIND_LABEL` (`features/segments/segmentFields`), `CONTACT_ROLES` (`features/contacts/contactsParams`), `SegmentListRow`, `SegmentKind`; `SegmentRef`, `ContactRole` (Task 1); `FILTER_SELECT` (`components/organizations/portfolio/filterParts`), `FOCUS`; `errorMessage` (`components/organizations/portfolio/usePagedRead`).
- Produces:
  - `useMySegments(): { rows: SegmentListRow[] | null; error: string | null }` (`GET /segments/?scope=mine`; `rows` null while loading, `[]` on failure);
  - `AudienceFields({ segments, segmentsError, segmentId, fallback, roles, kind, errors: { segment?: string; roles?: string }, onSegment(id: number | null), onRoles(roles: ContactRole[]) })`, a region named "Audience" with a combobox named "Segment" and, for `customer`/`account`, a group named "Who to ask at each organisation" / "Who to ask at each account".

- [ ] **Step 1: Write the failing tests**

`src/components/surveys/useMySegments.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { stubSegments } from '../../features/segments/testSegments';
import { useMySegments } from './useMySegments';

describe('useMySegments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads only the caller's own segments", async () => {
    const spy = stubSegments();
    const { result } = renderHook(() => useMySegments());
    expect(result.current).toEqual({ rows: null, error: null });
    await waitFor(() => expect(result.current.rows?.map((row) => row.name)).toEqual(['Champions', 'Renewal risk']));
    expect(String(spy.mock.calls[0][0])).toContain('/segments/?scope=mine');
  });

  it('says when they could not be read', async () => {
    stubSegments({ list: () => ({ status: 500, body: { detail: 'Segments are down.' } }) });
    const { result } = renderHook(() => useMySegments());
    await waitFor(() => expect(result.current).toEqual({ rows: [], error: 'Segments are down.' }));
  });
});
```

`src/components/surveys/AudienceFields.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CHAMPIONS, EMEA_ACCOUNTS, listRow, RENEWAL_RISK } from '../../features/segments/testSegments';
import { DEFAULT_ROLES } from '../../features/surveys/questions';
import { AudienceFields } from './AudienceFields';

const MINE = [listRow(RENEWAL_RISK), { ...listRow(EMEA_ACCOUNTS), is_owner: true }, listRow(CHAMPIONS)];

function renderFields(props: Partial<Parameters<typeof AudienceFields>[0]> = {}) {
  const onSegment = vi.fn();
  const onRoles = vi.fn();
  render(
    <MemoryRouter>
      <AudienceFields
        segments={MINE}
        segmentsError={null}
        segmentId={null}
        fallback={null}
        roles={DEFAULT_ROLES}
        kind={null}
        errors={{}}
        onSegment={onSegment}
        onRoles={onRoles}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onSegment, onRoles };
}

describe('AudienceFields (spec §2.2)', () => {
  it('offers my segments grouped by kind, and reports the one chosen', async () => {
    const { onSegment } = renderFields();
    const select = screen.getByRole('combobox', { name: 'Segment' });
    expect(select.querySelector('optgroup[label="Organisations"]')).toHaveTextContent('Renewal risk');
    expect(select.querySelector('optgroup[label="Accounts"]')).toHaveTextContent('EMEA accounts');
    expect(select.querySelector('optgroup[label="Contacts"]')).toHaveTextContent('Champions');
    await userEvent.selectOptions(select, '7');
    expect(onSegment).toHaveBeenCalledWith(7);
  });

  it('shows the roles for an organisation segment, Champion and Decision Maker ticked, adding in the order ticked', async () => {
    const { onRoles } = renderFields({ segmentId: 7, kind: 'customer' });
    const roles = screen.getByRole('group', { name: 'Who to ask at each organisation' });
    expect(within(roles).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Decision Maker' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Influencer' })).not.toBeChecked();
    expect(roles).toHaveAccessibleDescription('Up to 3 people per organisation or account, in the order you tick the roles.');
    await userEvent.click(within(roles).getByRole('checkbox', { name: 'Influencer' }));
    expect(onRoles).toHaveBeenLastCalledWith(['champion', 'decision_maker', 'influencer']);
    await userEvent.click(within(roles).getByRole('checkbox', { name: 'Champion' }));
    expect(onRoles).toHaveBeenLastCalledWith(['decision_maker']);
  });

  it('asks at each account for an account segment', () => {
    renderFields({ segmentId: 8, kind: 'account' });
    expect(screen.getByRole('group', { name: 'Who to ask at each account' })).toBeInTheDocument();
  });

  it('shows no roles for a contact segment', () => {
    renderFields({ segmentId: 9, kind: 'contact' });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('says when I have no segments yet, and links to a new one', () => {
    renderFields({ segments: [] });
    expect(screen.getByText(/You have no segments yet\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Make one' })).toHaveAttribute('href', '/segments/new');
  });

  it('waits for the segments, and says when they could not be read', () => {
    renderFields({ segments: null });
    expect(screen.getByRole('combobox', { name: 'Segment' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Loading your segments…');
  });

  it('shows a load failure and errors at the segment and the roles', () => {
    renderFields({ segments: [], segmentsError: 'Segments are down.', segmentId: 7, kind: 'customer', roles: [], errors: { segment: 'Nobody to send to.', roles: 'Choose at least one role.' } });
    expect(screen.getByRole('combobox', { name: 'Segment' })).toHaveAccessibleDescription(/Nobody to send to\./);
    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent);
    expect(alerts).toEqual(['Nobody to send to.', 'Segments are down.', 'Choose at least one role.']);
  });

  it("keeps a draft's own segment as an option when it is not among mine", () => {
    renderFields({ segments: [], segmentId: 12, fallback: { id: 12, name: 'Old list', kind: 'contact' }, kind: 'contact' });
    expect(screen.getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Old list');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/useMySegments.test.tsx src/components/surveys/AudienceFields.test.tsx`
Expected: FAIL, "Failed to resolve import "./useMySegments"" and "./AudienceFields".

- [ ] **Step 3: Write the hook and the fields**

`src/components/surveys/useMySegments.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchSegments } from '../../features/segments/segmentApi';
import type { SegmentListRow } from '../../features/segments/segmentTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** The caller's own segments (GET /segments/?scope=mine): a survey goes
 *  only to the sender's own segment (spec Decisions, "Who builds"). */
export function useMySegments(): { rows: SegmentListRow[] | null; error: string | null } {
  const [state, setState] = useState<{ rows: SegmentListRow[] | null; error: string | null }>({ rows: null, error: null });
  useEffect(() => {
    let alive = true;
    fetchSegments('mine', '').then(
      (rows) => {
        if (alive) setState({ rows, error: null });
      },
      (err: unknown) => {
        if (alive) setState({ rows: [], error: errorMessage(err, 'Could not load your segments.') });
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
```

`src/components/surveys/AudienceFields.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { CONTACT_ROLES } from '../../features/contacts/contactsParams';
import { KIND_LABEL } from '../../features/segments/segmentFields';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { ContactRole, SegmentRef } from '../../features/surveys/surveyTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS } from '../organizations/portfolio/styles';

const KIND_ORDER: readonly SegmentKind[] = ['customer', 'account', 'contact'];
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

/** Who the survey asks (spec §2.2): one of the caller's own segments,
 *  grouped by kind, and for an organisation or account segment the roles
 *  to ask there, in the order ticked (the backend asks in that order, at
 *  most 3 per record). */
export function AudienceFields({
  segments,
  segmentsError,
  segmentId,
  fallback,
  roles,
  kind,
  errors,
  onSegment,
  onRoles,
}: {
  /** null while loading. */
  segments: SegmentListRow[] | null;
  segmentsError: string | null;
  segmentId: number | null;
  /** The send's own segment, kept as an option when it is not among the
   *  caller's (a draft's segment, say). */
  fallback: SegmentRef | null;
  roles: ContactRole[];
  kind: SegmentKind | null;
  errors: { segment?: string; roles?: string };
  onSegment: (id: number | null) => void;
  onRoles: (roles: ContactRole[]) => void;
}) {
  const selectId = useId();
  const rolesId = useId();
  const listed = segments ?? [];
  const extra = fallback && fallback.id !== null && !listed.some((row) => row.id === fallback.id) ? fallback : null;
  const needsRoles = kind === 'customer' || kind === 'account';
  const describedBy = [`${selectId}-hint`, errors.segment ? `${selectId}-error` : null].filter(Boolean).join(' ');
  const toggle = (role: ContactRole, on: boolean) => onRoles(on ? [...roles, role] : roles.filter((ticked) => ticked !== role));

  return (
    <section aria-label="Audience" className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-ink">Audience</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className={LABEL}>
          Segment
        </label>
        <select
          id={selectId}
          value={segmentId === null ? '' : String(segmentId)}
          disabled={segments === null}
          onChange={(event) => onSegment(event.target.value ? Number(event.target.value) : null)}
          aria-invalid={Boolean(errors.segment)}
          aria-describedby={describedBy}
          className={`${FILTER_SELECT} w-full ${errors.segment ? 'border-danger' : ''}`}
        >
          <option value="">{segments === null ? 'Loading your segments…' : 'Choose a segment…'}</option>
          {extra ? <option value={String(extra.id)}>{extra.name}</option> : null}
          {KIND_ORDER.map((group) => {
            const rows = listed.filter((row) => row.kind === group);
            return rows.length > 0 ? (
              <optgroup key={group} label={KIND_LABEL[group]}>
                {rows.map((row) => (
                  <option key={row.id} value={String(row.id)}>
                    {row.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
        {errors.segment ? (
          <p id={`${selectId}-error`} role="alert" className="text-[11px] text-danger">
            {errors.segment}
          </p>
        ) : null}
        {segmentsError ? (
          <p role="alert" className="text-[11px] text-danger">
            {segmentsError}
          </p>
        ) : null}
        {segments !== null && listed.length === 0 && !segmentsError ? (
          <p className="text-[11px] text-ink-muted">
            You have no segments yet.{' '}
            <Link to="/segments/new" className={`inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`}>
              Make one
            </Link>
            , then survey it.
          </p>
        ) : null}
        <p id={`${selectId}-hint`} className="text-[11px] text-ink-muted">
          Only your own segments, and only people you can open.
        </p>
      </div>
      {needsRoles ? (
        <fieldset aria-describedby={`${rolesId}-hint`} className="flex flex-col gap-1">
          <legend className={`${LABEL} mb-1`}>Who to ask at each {kind === 'account' ? 'account' : 'organisation'}</legend>
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            {CONTACT_ROLES.map((role) => (
              <label key={role.value} className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-ink sm:min-h-9">
                <input type="checkbox" checked={roles.includes(role.value)} onChange={(event) => toggle(role.value, event.target.checked)} className="h-4 w-4 accent-accent" />
                {role.label}
              </label>
            ))}
          </div>
          <p id={`${rolesId}-hint`} className="text-[11px] text-ink-muted">
            Up to 3 people per organisation or account, in the order you tick the roles.
          </p>
          {errors.roles ? (
            <p role="alert" className="text-[11px] text-danger">
              {errors.roles}
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/useMySegments.test.tsx src/components/surveys/AudienceFields.test.tsx`
Expected: PASS (2 + 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/surveys/useMySegments.ts src/components/surveys/useMySegments.test.tsx src/components/surveys/AudienceFields.tsx src/components/surveys/AudienceFields.test.tsx
git commit -m "feat(surveys): the audience fields, my segments by kind and the roles to ask

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The preview of the email and the form

Spec §2.2 ("a preview of the email and of the hosted form as the customer will see them"), §3 (plain text); backend `send_survey_email`'s body.

**Files:**
- Create: `src/components/surveys/SurveyPreview.tsx`
- Test: `src/components/surveys/SurveyPreview.test.tsx`

**Interfaces:**
- Consumes: `questionFor`, `LINK_DAYS` (Task 1); `ScaleButtons` (Task 4); `RevenactMark`; `MONO`.
- Produces: `SurveyPreview({ type: SurveyType; subject: string; intro: string; workspace: string })`: a region "Preview" holding the regions "The email" and "The form".

The email's body is the backend's, line for line: the intro (if any), the question, "Answer here, it takes a few seconds:", the link, "The link works for 14 days and takes one answer."

- [ ] **Step 1: Write the failing test**

`src/components/surveys/SurveyPreview.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SurveyPreview } from './SurveyPreview';

describe('SurveyPreview (spec §2.2)', () => {
  it('shows the email: subject, intro, the question with the workspace name, the link and its 14 days', () => {
    render(<SurveyPreview type="nps" subject="A quick question" intro="Two minutes." workspace="Acme Inc" />);
    const email = screen.getByRole('region', { name: 'The email' });
    expect(email).toHaveTextContent('Subject: A quick question');
    expect(email).toHaveTextContent('Two minutes.');
    expect(email).toHaveTextContent('How likely are you to recommend Acme Inc to a friend or colleague?');
    expect(email).toHaveTextContent('Answer here, it takes a few seconds:');
    expect(email).toHaveTextContent('The link works for 14 days and takes one answer.');
  });

  it('shows the form as the customer sees it, its scale a picture rather than a control', () => {
    render(<SurveyPreview type="ces" subject="Hi" intro="" workspace="Acme Inc" />);
    const form = screen.getByRole('region', { name: 'The form' });
    expect(within(form).getByText('How easy is it to get what you need from Acme Inc?')).toBeInTheDocument();
    expect(within(form).getByText('Scores 1 to 7, from Very difficult to Very easy')).toBeInTheDocument();
    expect(within(form).queryByRole('radio')).toBeNull();
    expect(form).toHaveTextContent('Anything to add? (optional)');
  });

  it('says when there is no subject yet, and leaves a blank intro out', () => {
    render(<SurveyPreview type="csat" subject="  " intro="   " workspace="Acme Inc" />);
    const email = screen.getByRole('region', { name: 'The email' });
    expect(email).toHaveTextContent('Subject: No subject yet');
    expect(email.querySelector('[data-part="intro"]')).toBeNull();
  });

  it('shows the intro as plain text, never as markup', () => {
    const { container } = render(<SurveyPreview type="nps" subject="Hi" intro="<b>Hello</b>" workspace="Acme Inc" />);
    expect(screen.getByText('<b>Hello</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/SurveyPreview.test.tsx`
Expected: FAIL, "Failed to resolve import "./SurveyPreview"".

- [ ] **Step 3: Write the preview**

`src/components/surveys/SurveyPreview.tsx`:

```tsx
import { useId } from 'react';
import { LINK_DAYS, questionFor } from '../../features/surveys/questions';
import type { SurveyType } from '../../features/surveys/surveyTypes';
import { MONO } from '../organizations/portfolio/styles';
import { RevenactMark } from '../shared/RevenactMark';
import { ScaleButtons } from './ScaleButtons';

const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

/** The email and the hosted form as the customer will see them (spec
 *  §2.2). The email's lines are the backend's `send_survey_email`, line for
 *  line; everything is plain text, as the email is (spec §3). */
export function SurveyPreview({ type, subject, intro, workspace }: { type: SurveyType; subject: string; intro: string; workspace: string }) {
  const emailId = useId();
  const formId = useId();
  const question = questionFor(type, workspace);
  const text = intro.trim();
  return (
    <section aria-label="Preview" className="flex flex-col divide-y divide-line-subtle rounded-xl bg-subtle">
      <section aria-labelledby={emailId} className="flex flex-col gap-2 p-3">
        <h3 id={emailId} className={LABEL}>
          The email
        </h3>
        <p className="break-words text-[13px] text-ink">
          <span className="text-ink-muted">Subject: </span>
          <span className="font-semibold">{subject.trim() || 'No subject yet'}</span>
        </p>
        <div className="flex flex-col gap-2 break-words text-[13px] text-ink">
          {text ? (
            <p data-part="intro" className="whitespace-pre-line">
              {text}
            </p>
          ) : null}
          <p>{question}</p>
          <p>
            Answer here, it takes a few seconds:
            <br />
            <span className="text-ink-muted">their own one-time link</span>
          </p>
          <p className="text-ink-muted">
            The link works for <span className={MONO}>{LINK_DAYS}</span> days and takes one answer.
          </p>
        </div>
      </section>
      <section aria-labelledby={formId} className="flex flex-col gap-3 p-3">
        <h3 id={formId} className={LABEL}>
          The form
        </h3>
        <RevenactMark size="sm" />
        <p className="text-[15px] font-semibold text-ink">{question}</p>
        <ScaleButtons type={type} value={null} preview />
        <p className="text-[13px] text-ink-muted">Anything to add? (optional)</p>
      </section>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/SurveyPreview.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/surveys/SurveyPreview.tsx src/components/surveys/SurveyPreview.test.tsx
git commit -m "feat(surveys): preview the email and the hosted form as the customer sees them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `/surveys`: the tabs and the Sends rows

Spec §2.1; plan Decisions 4, 11.

**Files:**
- Create: `src/components/surveys/TypeChip.tsx`, `src/components/surveys/SendRow.tsx`, `src/pages/surveys/SendsTab.tsx`, `src/pages/surveys/SurveysHome.tsx`
- Modify: `src/pages/surveys/testPages.tsx` (add `renderSurveys`)
- Test: `src/pages/surveys/SurveysHome.test.tsx`

**Interfaces:**
- Consumes: `fetchSends` (Task 2); `surveysTab`, `SurveysTab` (Task 3); `TYPE_LABEL` (Task 1); `segmentLabel`, `dayLabel` (Task 1); `stubSurveys`, `requestsOf` (Task 2); `DetailTabs` (`components/organizations/detail/DetailTabs`), `detailPanelId`, `detailTabId` (`features/organizations/detailParams`); `EmptyState`, `ErrorBlock`, `ItemSkeleton`; `PRIMARY`, `QUIET`, `FOCUS`, `MONO`; `errorMessage`; `OrganizationsFrame`; today's `SurveysPage`; `makeSegmentsStore` (`pages/segments/testPages`), `Navbar`, `SlotHost`, `Where`.
- Produces:
  - `TypeChip({ type: SurveyType })`;
  - `SendRow({ row: SendListRow })` (`li[data-send]`, `[data-part="answered"]`);
  - `SendsTab()` (a list named "Survey sends");
  - `SurveysHome()` (tabs "Sends" / "Logged scores", **New survey** on Sends, an `<Outlet />` for `/surveys/new`);
  - `renderSurveys(url, { width?, nav? }): { store, unmount }`.

- [ ] **Step 1: Add `renderSurveys` to the test helpers**

Replace `src/pages/surveys/testPages.tsx` with:

```tsx
// Test-only helpers, never hot-reloaded.
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeSegmentsStore } from '../segments/testPages';
import { HostedForm } from './HostedForm';
import { SurveysHome } from './SurveysHome';

/** The hosted form at /s/<token> with no store at all: it must never read
 *  the session, so any store read would throw here. Phone width by default. */
export function renderHosted(token: string, { width = 375 }: { width?: number } = {}) {
  setViewport(width);
  const view = render(
    <MemoryRouter initialEntries={[`/s/${encodeURIComponent(token)}`]}>
      <Routes>
        <Route path="/s/:token" element={<HostedForm />} />
      </Routes>
    </MemoryRouter>,
  );
  return { unmount: view.unmount };
}

/** The Surveys routes on the real store and router, as App.tsx routes them.
 *  Only fetch is stubbed, by the caller (stubSurveys). The signed-in user is
 *  Alice (id 1) of "Acme Inc"; `nav` adds the real Navbar. */
export function renderSurveys(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeSegmentsStore();
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              element={
                <>
                  <SurveysHome />
                  <Where />
                </>
              }
            >
              <Route path="/surveys" element={null} />
            </Route>
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}
```

- [ ] **Step 2: Write the failing test**

`src/pages/surveys/SurveysHome.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderSurveys } from './testPages';

// Integration tier: the real store and router, fetch stubbed in the
// backend's contract shapes (stubSurveys).
const where = () => screen.getByTestId('where').textContent;

describe('/surveys (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens on Sends: a row per send with its type, segment, date, sender and "N of M answered · R%"', async () => {
    stubSurveys();
    renderSurveys('/surveys');
    expect(screen.getByRole('tab', { name: 'Sends' })).toHaveAttribute('aria-selected', 'true');
    const list = await screen.findByRole('list', { name: 'Survey sends' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const q3 = within(list).getByRole('link', { name: 'Q3 NPS' }).closest('li') as HTMLElement;
    expect(within(q3).getByRole('link', { name: 'Q3 NPS' })).toHaveAttribute('href', '/surveys/3');
    expect(q3).toHaveTextContent('NPS');
    expect(q3).toHaveTextContent('Workspace');
    expect(q3).toHaveTextContent('Renewal risk · Sent 3 Oct 2026 · You');
    expect(q3.querySelector('[data-part="answered"]')).toHaveTextContent('3 of 5 answered · 60%');
    const draft = within(list).getByRole('link', { name: 'Onboarding effort' }).closest('li') as HTMLElement;
    expect(draft).toHaveTextContent('Draft');
    expect(draft.querySelector('[data-part="answered"]')).toHaveTextContent('Not sent');
    const carl = within(list).getByRole('link', { name: 'Support CSAT' }).closest('li') as HTMLElement;
    expect(carl).toHaveTextContent('EMEA accounts · Sent 1 Oct 2026 · Carl CSM');
    expect(carl.querySelector('[data-part="answered"]')).toHaveTextContent('1 of 1 answered · 100%');
  });

  it('sets the answered figures in DM Mono', async () => {
    stubSurveys();
    renderSurveys('/surveys');
    const list = await screen.findByRole('list', { name: 'Survey sends' });
    const q3 = within(list).getByRole('link', { name: 'Q3 NPS' }).closest('li') as HTMLElement;
    expect([...q3.querySelectorAll('[data-part="answered"] .font-mono-brand')].map((node) => node.textContent)).toEqual(['3', '5', '60%']);
  });

  it('explains a survey and offers New survey when there are none', async () => {
    stubSurveys({ sends: [] });
    renderSurveys('/surveys');
    expect(await screen.findByText('No surveys yet')).toBeInTheDocument();
    expect(screen.getByText(/A survey emails one standard question/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New survey' }).map((link) => link.getAttribute('href'))).toEqual(['/surveys/new', '/surveys/new']);
  });

  it('shows a skeleton while loading, then the error with Try again, which reads again', async () => {
    let calls = 0;
    const { spy } = stubSurveys({
      list: () => {
        calls += 1;
        return calls === 1 ? { status: 500, body: { detail: 'Surveys are down.' } } : { status: 200, body: [] };
      },
    });
    renderSurveys('/surveys');
    expect(screen.getByRole('status', { name: 'Loading surveys' })).toBeInTheDocument();
    expect(await screen.findByText('Surveys are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No surveys yet')).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/$/)).toHaveLength(2);
  });

  it('switches to Logged scores and back in the URL', async () => {
    stubSurveys();
    renderSurveys('/surveys');
    await userEvent.click(screen.getByRole('tab', { name: 'Logged scores' }));
    expect(where()).toBe('/surveys?tab=logged');
    expect(await screen.findByRole('button', { name: /Log Survey/ })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Survey sends' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'New survey' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Sends' }));
    expect(where()).toBe('/surveys');
  });

  it("opens Logged scores for the organisation page's ?customer= link", () => {
    stubSurveys();
    renderSurveys('/surveys?customer=6');
    expect(screen.getByRole('tab', { name: 'Logged scores' })).toHaveAttribute('aria-selected', 'true');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/surveys/SurveysHome.test.tsx`
Expected: FAIL, "Failed to resolve import "./SurveysHome"".

- [ ] **Step 4: Write the chip, the row, the tab and the page**

`src/components/surveys/TypeChip.tsx`:

```tsx
import { TYPE_LABEL } from '../../features/surveys/questions';
import type { SurveyType } from '../../features/surveys/surveyTypes';
import { MONO } from '../organizations/portfolio/styles';

export function TypeChip({ type }: { type: SurveyType }) {
  return <span className={`${MONO} shrink-0 rounded-full bg-subtle px-1.5 text-[11px] font-semibold text-ink-muted`}>{TYPE_LABEL[type]}</span>;
}
```

`src/components/surveys/SendRow.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { dayLabel, segmentLabel } from '../../features/surveys/surveyText';
import type { SendListRow } from '../../features/surveys/surveyTypes';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { TypeChip } from './TypeChip';

const BADGE = 'shrink-0 rounded-full bg-subtle px-1.5 text-[11px] font-semibold text-ink-muted';
const SHARING_BADGE = { private: null, workspace: 'Workspace', people: 'Shared' } as const;

/** One send (spec §2.1), a rounded row, never a table row: the name with
 *  its type, Draft and sharing badges; segment, date and sender under it;
 *  then "31 of 42 answered · 74%" in DM Mono. Phones wrap the figure under
 *  the name. */
export function SendRow({ row }: { row: SendListRow }) {
  const badge = SHARING_BADGE[row.sharing];
  const draft = row.status === 'draft';
  const when = draft ? `Edited ${dayLabel(row.updated_at)}` : row.sent_at ? `Sent ${dayLabel(row.sent_at)}` : 'Sending now';
  return (
    <li data-send={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-56">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link to={`/surveys/${row.id}`} className={`flex min-h-11 min-w-0 items-center rounded-sm text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
            <span className="truncate">{row.name}</span>
          </Link>
          <TypeChip type={row.survey_type} />
          {draft ? <span className={BADGE}>Draft</span> : null}
          {badge ? <span className={BADGE}>{badge}</span> : null}
        </span>
        <p className="truncate text-[11px] text-ink-muted">
          {segmentLabel(row.segment)} · {when} · {row.is_owner ? 'You' : row.owner.name}
        </p>
      </div>
      <p data-part="answered" className="text-[13px] text-ink-muted">
        {draft ? (
          'Not sent'
        ) : (
          <>
            <span className={`${MONO} text-ink`}>{row.answered}</span> of <span className={`${MONO} text-ink`}>{row.sent}</span> answered ·{' '}
            <span className={`${MONO} text-ink`}>{row.rate === null ? '—' : `${row.rate}%`}</span>
          </>
        )}
      </p>
    </li>
  );
}
```

`src/pages/surveys/SendsTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchSends } from '../../features/surveys/surveyApi';
import type { SendListRow } from '../../features/surveys/surveyTypes';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../../components/organizations/portfolio/PortfolioSections';
import { PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { SendRow } from '../../components/surveys/SendRow';

const EXPLAINER =
  "A survey emails one standard question, NPS, CSAT or CES, to the people at a segment's organisations, accounts or contacts. Each person gets a one-time link, and their answers update the scores you already read.";

type Answer = { key: number; rows: SendListRow[] | null; error: string | null };

/** The Sends tab (spec §2.1): every send the reader may read, newest first.
 *  A failed reload keeps the last list on screen beside the error. */
export function SendsTab() {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSends().then(
      (rows) => {
        if (alive) setAnswer({ key: attempt, rows, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer((last) => ({ key: attempt, rows: last?.rows ?? null, error: errorMessage(err, 'Could not load surveys.') }));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const rows = answer?.rows ?? null;
  const error = answer?.key === attempt ? answer.error : null;
  const loading = answer?.key !== attempt;
  const retry = () => setAttempt((n) => n + 1);

  if (error && (!rows || rows.length === 0)) return <ErrorBlock message={error} onRetry={retry} />;
  if (!rows || (loading && rows.length === 0)) return <ItemSkeleton count={4} label="Loading surveys" avatar={false} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No surveys yet"
        detail={EXPLAINER}
        action={
          <Link to="/surveys/new" className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New survey
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{error} Showing the last result.</span>
          <button type="button" onClick={retry} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : null}
      <ul aria-label="Survey sends" aria-busy={loading} className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <SendRow key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}
```

`src/pages/surveys/SurveysHome.tsx`:

```tsx
import { useId } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { detailPanelId, detailTabId } from '../../features/organizations/detailParams';
import { surveysTab, type SurveysTab } from '../../features/surveys/surveyParams';
import { DetailTabs } from '../../components/organizations/detail/DetailTabs';
import { PRIMARY } from '../../components/organizations/portfolio/styles';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { SendsTab } from './SendsTab';
import { SurveysPage } from './SurveysPage';

const TABS: readonly { key: SurveysTab; label: string }[] = [
  { key: 'sends', label: 'Sends' },
  { key: 'logged', label: 'Logged scores' },
];

/** /surveys (spec §2.1): Sends first, then Logged scores (`?tab=`, plan
 *  Decision 4), under the framed bar titled "Surveys". New survey
 *  (/surveys/new) opens its modal over this page through the Outlet. */
export function SurveysHome() {
  const [search, setSearch] = useSearchParams();
  const tab = surveysTab(search);
  const idBase = useId();
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <DetailTabs
            idBase={idBase}
            active={tab}
            tabs={TABS}
            label="Survey views"
            onChange={(next) => setSearch(next === 'sends' ? {} : { tab: next }, { replace: true })}
          />
          {tab === 'sends' ? (
            <Link to="/surveys/new" className={`${PRIMARY} sm:ml-auto`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New survey
            </Link>
          ) : null}
        </div>
        <div role="tabpanel" id={detailPanelId(idBase, tab)} aria-labelledby={detailTabId(idBase, tab)}>
          {tab === 'sends' ? <SendsTab /> : <SurveysPage />}
        </div>
      </div>
      {/* /surveys/new: the New survey modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/pages/surveys/SurveysHome.test.tsx src/pages/surveys/HostedForm.test.tsx`
Expected: PASS (6 + 13 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/surveys/TypeChip.tsx src/components/surveys/SendRow.tsx src/pages/surveys/SendsTab.tsx src/pages/surveys/SurveysHome.tsx src/pages/surveys/SurveysHome.test.tsx src/pages/surveys/testPages.tsx
git commit -m "feat(surveys): /surveys as Sends and Logged scores tabs, a row per send

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The send page: header, tiles and a draft's own state

Spec §2.3 (header, tiles); §3 (counts for the owner only, an unreadable segment unlinked); backend Decisions 15, 18, 19; plan Decisions 3, 10.

**Files:**
- Create: `src/components/surveys/useSend.ts`, `src/components/surveys/SendStates.tsx`, `src/components/surveys/SendHeader.tsx`, `src/components/surveys/SendTiles.tsx`, `src/pages/surveys/SendPage.tsx`
- Modify: `src/pages/surveys/testPages.tsx` (route `/surveys/:id`)
- Test: `src/pages/surveys/SendPage.test.tsx`

**Interfaces:**
- Consumes: `fetchSend`, `deleteSend` (Task 2); `BANDS`, `BAND_LABEL`, `FIGURE_HINT`, `TYPE_LABEL`, `formatFigure` (Task 1); `countsLines`, `dayLabel` (Task 1); `Lines` (Task 6); `TypeChip` (Task 9); `Tile` (`components/organizations/portfolio/tileParts`); `ConfirmDialog` (`components/organizations/ConfirmDialog`); `EmptyState`, `ErrorBlock`, `ItemSkeleton`; `BUTTON`, `PRIMARY`, `QUIET`, `FOCUS`, `MONO`; `errorMessage`; `ApiError`; `OrganizationsFrame`.
- Produces:
  - `SendLoad`, `useSend(id): [SendLoad, (send: SurveySend) => void, () => void]`;
  - `SendLoading()`, `SendMissing()`, `SendFailed({ message, onRetry })`;
  - `SendHeader({ send: SurveySend })` (`header[data-part="send-header"]`);
  - `SendTiles({ send: SurveySend })` (tiles "Sent", "Answered", "Response rate", `TYPE_LABEL[type]`, "Bands");
  - `SendPage()`; `SendOutlet { send: SurveySend; onReplace: (send: SurveySend) => void }` (the `edit` child route's context, used by Task 12).

- [ ] **Step 1: Route `/surveys/:id` in the test helper**

In `src/pages/surveys/testPages.tsx`, add `import { SendPage } from './SendPage';` and, directly above `<Route path="*" element={<Where />} />`, add:

```tsx
            <Route
              path="/surveys/:id"
              element={
                <>
                  <SendPage />
                  <Where />
                </>
              }
            />
```

- [ ] **Step 2: Write the failing test**

`src/pages/surveys/SendPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { CARL_CSAT, requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderSurveys } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const header = async () => {
  await screen.findByRole('heading', { level: 1 });
  return document.querySelector('[data-part="send-header"]') as HTMLElement;
};

describe('/surveys/:id (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('heads my send: name, type, segment link, date, sender and sharing, with Edit', async () => {
    stubSurveys();
    renderSurveys('/surveys/3');
    expect(await screen.findByRole('heading', { level: 1, name: 'Q3 NPS' })).toBeInTheDocument();
    const head = await header();
    expect(within(head).getByText('NPS')).toBeInTheDocument();
    expect(within(head).getByRole('link', { name: 'Renewal risk' })).toHaveAttribute('href', '/segments/7');
    expect(head).toHaveTextContent('Sent 3 Oct 2026 · By you · Shared with the workspace');
    expect(within(head).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/surveys/3/edit');
    expect(within(head).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it("shows the tiles, the figure signed, the bands named, and the owner's frozen counts", async () => {
    stubSurveys();
    renderSurveys('/surveys/3');
    expect(within(await screen.findByRole('group', { name: 'Sent' })).getByText('5')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Answered' })).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Response rate' })).getByText('60%')).toBeInTheDocument();
    const nps = screen.getByRole('group', { name: 'NPS' });
    expect(nps).toHaveTextContent('+33');
    expect(nps).toHaveTextContent('Promoters minus detractors');
    const bands = screen.getByRole('group', { name: 'Bands' });
    expect([...bands.querySelectorAll('dt')].map((node) => node.textContent)).toEqual(['Detractors', 'Passives', 'Promoters']);
    expect([...bands.querySelectorAll('dd')].map((node) => node.textContent)).toEqual(['1', '0', '2']);
    expect(document.querySelector('[data-part="counts"]')).toHaveTextContent(
      'At the send: 6 people · 5 sent · 1 not delivered · 6 skipped (surveyed in the last 30 days) · 2 without an email',
    );
  });

  it('shows a shared reader the figures over people they may open, and no Edit or frozen counts', async () => {
    stubSurveys();
    renderSurveys('/surveys/4');
    const head = await header();
    expect(head).toHaveTextContent('Sent 1 Oct 2026 · By Carl CSM · Shared with Alice');
    expect(within(head).queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('group', { name: 'CSAT' })).toHaveTextContent('100%');
    expect(within(screen.getByRole('group', { name: 'Sent' })).getByText('1')).toBeInTheDocument();
    expect(document.querySelector('[data-part="counts"]')).toBeNull();
  });

  it('names a segment the reader cannot open without linking it', async () => {
    stubSurveys({ sends: [{ ...CARL_CSAT, segment: { id: null, name: 'EMEA accounts', kind: 'account' } }] });
    renderSurveys('/surveys/4');
    const head = await header();
    expect(within(head).getByText('EMEA accounts')).toBeInTheDocument();
    expect(within(head).queryByRole('link', { name: 'EMEA accounts' })).toBeNull();
  });

  it('shows a draft as not sent yet, with Edit and send, and deletes it after confirming', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/5');
    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit and send' })).toHaveAttribute('href', '/surveys/5/edit');
    expect(screen.queryByRole('group', { name: 'Sent' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete Onboarding effort?')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1) as HTMLElement);
    await waitFor(() => expect(where()).toBe('/surveys'));
    expect(requestsOf(spy, 'DELETE', /^\/surveys\/sends\/5\/$/)).toHaveLength(1);
  });

  it('keeps the confirm open with the refusal when the delete fails', async () => {
    stubSurveys({ remove: () => ({ status: 409, body: { detail: "Only a draft can be deleted; a sent survey's answers feed the scores." } }) });
    renderSurveys('/surveys/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1) as HTMLElement);
    expect(await screen.findByText("Only a draft can be deleted; a sent survey's answers feed the scores.")).toBeInTheDocument();
    expect(where()).toBe('/surveys/5');
  });

  it.each(['/surveys/6', '/surveys/999', '/surveys/abc'])('reads "Survey not found" for %s', async (url) => {
    stubSurveys();
    renderSurveys(url);
    expect(await screen.findByText('Survey not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All surveys' })).toHaveAttribute('href', '/surveys');
  });

  it('says when the send could not be read, and Try again reads it again', async () => {
    let reads = 0;
    stubSurveys({ read: () => (++reads === 1 ? { status: 500, body: { detail: 'Surveys are down.' } } : undefined) });
    renderSurveys('/surveys/3');
    expect(await screen.findByText('Surveys are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Q3 NPS' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/surveys/SendPage.test.tsx`
Expected: FAIL, "Failed to resolve import "./SendPage"".

- [ ] **Step 4: Write the hook, the states, the header, the tiles and the page**

`src/components/surveys/useSend.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchSend } from '../../features/surveys/surveyApi';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type SendLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; send: SurveySend };

/** One send, read for the reader: `missing` for a 404, which is the same
 *  for a send that does not exist and one not shared with them. `replace`
 *  swaps in a newer copy (after an edit); `retry` reads again. */
export function useSend(id: number): [SendLoad, (send: SurveySend) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: SendLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSend(id).then(
      (send) => {
        if (alive) setAnswer({ key, load: { status: 'ready', send } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this survey.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((send: SurveySend) => setAnswer({ key, load: { status: 'ready', send } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}
```

`src/components/surveys/SendStates.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';

export function SendLoading() {
  return <ItemSkeleton count={3} label="Loading survey" avatar={false} />;
}

/** A 404: missing and not shared read the same (backend Access rule). */
export function SendMissing() {
  return (
    <EmptyState
      title="Survey not found"
      detail="It may have been deleted, or it isn't shared with you."
      action={
        <Link to="/surveys" className={`${QUIET} border border-line`}>
          All surveys
        </Link>
      }
    />
  );
}

export function SendFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorBlock message={message} onRetry={onRetry} />;
}
```

`src/components/surveys/SendHeader.tsx`:

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteSend } from '../../features/surveys/surveyApi';
import { dayLabel } from '../../features/surveys/surveyText';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { BUTTON, FOCUS } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { TypeChip } from './TypeChip';

const BADGE = 'shrink-0 rounded-full bg-subtle px-1.5 text-[11px] font-semibold text-ink-muted';

function sharingLabel(send: SurveySend): string {
  if (send.sharing === 'private') return 'Private';
  if (send.sharing === 'workspace') return 'Shared with the workspace';
  const names = send.shared_with.map((person) => person.name);
  if (names.length === 0) return 'Shared with chosen teammates';
  if (names.length <= 2) return `Shared with ${names.join(' and ')}`;
  return `Shared with ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

function whenLabel(send: SurveySend): string {
  if (send.status === 'draft') return 'Not sent';
  if (send.status === 'sending' || !send.sent_at) return 'Sending now';
  return `Sent ${dayLabel(send.sent_at)}`;
}

/** The send's header (spec §2.3): name, type, segment, date, sender and
 *  sharing; Edit for the owner (the modal allows only name and sharing
 *  once sent); Delete for the owner of a draft (backend Decision 15). A
 *  segment the reader can't open is named, never linked. */
export function SendHeader({ send }: { send: SurveySend }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const segment = send.segment;
  return (
    <header data-part="send-header" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-[22px] font-semibold text-ink">{send.name}</h1>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-muted">
            <TypeChip type={send.survey_type} />
            {send.status === 'draft' ? <span className={BADGE}>Draft</span> : null}
            <span>to</span>
            {segment === null ? (
              <span>a deleted segment</span>
            ) : segment.id === null ? (
              <span className="text-ink">{segment.name}</span>
            ) : (
              <Link to={`/segments/${segment.id}`} className={`inline-flex min-h-11 items-center rounded-sm text-ink underline sm:min-h-0 ${FOCUS}`}>
                {segment.name}
              </Link>
            )}
          </p>
        </div>
        {send.is_owner ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/surveys/${send.id}/edit`} className={BUTTON}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Link>
            {send.status === 'draft' ? (
              <button type="button" onClick={() => setDeleting(true)} className={`${BUTTON} text-danger`}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-ink-muted">
        {whenLabel(send)} · {send.is_owner ? 'By you' : `By ${send.owner.name}`} · {sharingLabel(send)}
      </p>
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${send.name}?`}
          message="This draft is deleted. Nothing was sent."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteSend(send.id);
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw errorMessage(err, 'Could not delete this survey.');
            }
            navigate('/surveys');
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </header>
  );
}
```

`src/components/surveys/SendTiles.tsx`:

```tsx
import { BAND_LABEL, BANDS, FIGURE_HINT, formatFigure, TYPE_LABEL } from '../../features/surveys/questions';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { Tile } from '../organizations/portfolio/tileParts';
import { MONO } from '../organizations/portfolio/styles';

const FIGURE = `${MONO} text-[22px] font-semibold text-ink`;

/** The tiles (spec §2.3): sent, answered, response rate, the type's
 *  figure and its bands. For the owner they cover every invite; for anyone
 *  else only the people they may open (the server decides). Phones swipe
 *  the strip sideways inside itself. */
export function SendTiles({ send }: { send: SurveySend }) {
  const { summary, survey_type: type } = send;
  return (
    <div className="flex snap-x gap-2 overflow-x-auto [&>*]:flex-1">
      <Tile title="Sent">
        <p className={FIGURE}>{summary.sent}</p>
      </Tile>
      <Tile title="Answered">
        <p className={FIGURE}>{summary.answered}</p>
      </Tile>
      <Tile title="Response rate">
        <p className={FIGURE}>{summary.rate === null ? '—' : `${summary.rate}%`}</p>
      </Tile>
      <Tile title={TYPE_LABEL[type]}>
        <p className={FIGURE}>{formatFigure(type, summary.figure)}</p>
        <p className="text-[11px] text-ink-muted">{FIGURE_HINT[type]}</p>
      </Tile>
      <Tile title="Bands">
        <dl className="flex gap-4">
          {BANDS[type].map((band) => (
            <div key={band}>
              <dt className="text-[11px] text-ink-muted">{BAND_LABEL[band]}</dt>
              <dd className={`${MONO} text-[15px] font-semibold text-ink`}>{summary.bands[band] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </Tile>
    </div>
  );
}
```

`src/pages/surveys/SendPage.tsx`:

```tsx
import { Link, Outlet, useParams } from 'react-router-dom';
import { countsLines } from '../../features/surveys/surveyText';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { PRIMARY } from '../../components/organizations/portfolio/styles';
import { Lines } from '../../components/surveys/Lines';
import { SendHeader } from '../../components/surveys/SendHeader';
import { SendFailed, SendLoading, SendMissing } from '../../components/surveys/SendStates';
import { SendTiles } from '../../components/surveys/SendTiles';
import { useSend } from '../../components/surveys/useSend';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

/** What the send page hands its `edit` child route: the send it has read,
 *  and how to swap in the saved copy. */
export interface SendOutlet {
  send: SurveySend;
  onReplace: (send: SurveySend) => void;
}

/** /surveys/:id (spec §2.3). */
export function SendPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <SendMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedSend key={id} id={Number(id)} />;
}

function LoadedSend({ id }: { id: number }) {
  const [load, replace, retry] = useSend(id);
  if (load.status === 'ready') return <SendView send={load.send} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      {load.status === 'loading' ? <SendLoading /> : null}
      {load.status === 'missing' ? <SendMissing /> : null}
      {load.status === 'failed' ? <SendFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

function SendView({ send, onReplace }: { send: SurveySend; onReplace: (send: SurveySend) => void }) {
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <SendHeader send={send} />
        {send.status === 'draft' ? (
          <EmptyState
            title="Not sent yet"
            detail={send.is_owner ? 'Edit it to choose who it reaches, check the preview, then send.' : 'Its owner has not sent it yet.'}
            action={
              send.is_owner ? (
                <Link to={`/surveys/${send.id}/edit`} className={PRIMARY}>
                  Edit and send
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <div className="@container">
              <SendTiles send={send} />
            </div>
            {send.counts ? (
              <p data-part="counts" className="text-[13px] text-ink-muted">
                At the send: <Lines lines={countsLines(send.counts)} />
              </p>
            ) : null}
          </>
        )}
      </div>
      {/* /surveys/:id/edit: the modal over this page. */}
      <Outlet context={{ send, onReplace } satisfies SendOutlet} />
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/pages/surveys/SendPage.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/surveys/useSend.ts src/components/surveys/SendStates.tsx src/components/surveys/SendHeader.tsx src/components/surveys/SendTiles.tsx src/pages/surveys/SendPage.tsx src/pages/surveys/SendPage.test.tsx src/pages/surveys/testPages.tsx
git commit -m "feat(surveys): the send page: header, tiles, frozen counts, and a draft's own state

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Answers and Not answered

Spec §2.3 ("**Answers** (person, organisation, score chip, comment, date, newest first; All / Detractors / With comments) with "N more answers from people you can't open"; **Not answered** (collapsed; expiry; failed with reason)"), §3; backend Decision 20; plan Decisions 9, 12.

**Files:**
- Create: `src/components/surveys/AnswersSection.tsx`, `src/components/surveys/NotAnswered.tsx`
- Modify: `src/pages/surveys/SendPage.tsx` (render both on a sent survey)
- Test: `src/components/surveys/AnswersSection.test.tsx`, `src/components/surveys/NotAnswered.test.tsx`, `src/pages/surveys/SendPage.test.tsx` (one more case)

**Interfaces:**
- Consumes: `fetchAnswers`, `fetchPending` (Task 2); `answersFilter`, `withAnswersFilter` (Task 3); `BAND_LABEL`, `bandTone`, `lowFilterLabel`, `LINK_DAYS` (Task 1); `dayLabel`, `recordPath` (Task 1); `Switch` (`components/organizations/portfolio/tileParts`); `EmptyState`, `ErrorBlock`, `ItemSkeleton`; `BUTTON`, `QUIET`, `FOCUS`, `MONO`; `errorMessage`; `renderInApp` (`pages/segments/testPages`); `sendPayload`, `Q3_NPS`, `CARL_CSAT`, `stubSurveys`, `requestsOf` (Task 2).
- Produces:
  - `ScoreChip({ score: number; band: BandName })` (`[data-part="score"]`, the band in sr-only text);
  - `AnswersSection({ send: SurveySend })` (a list named "Answers", the filter `?answers=` in the URL, **Show more answers**, `[data-part="hidden-answers"]`);
  - `NotAnswered({ send: SurveySend })` (a disclosure button named "Not answered", a list named "Not answered", `[data-part="hidden-pending"]`).

- [ ] **Step 1: Write the failing tests**

`src/components/surveys/AnswersSection.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CARL_CSAT, Q3_NPS, requestsOf, sendPayload, stubSurveys } from '../../features/surveys/testSurveys';
import { renderInApp } from '../../pages/segments/testPages';
import { resetViewport } from '../../test/viewport';
import { AnswersSection } from './AnswersSection';

const where = () => screen.getByTestId('where').textContent;
const shown = () => within(screen.getByRole('list', { name: 'Answers' })).getAllByRole('listitem').map((row) => row.getAttribute('data-answer'));

describe('Answers (spec §2.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("lists answers newest first, each with its score chip, person, record, comment and date, and counts those the reader can't open", async () => {
    stubSurveys();
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    expect(shown()).toEqual(['32', '31']);
    const [lee, sam] = within(screen.getByRole('list', { name: 'Answers' })).getAllByRole('listitem');
    expect(within(sam).getByRole('link', { name: 'Sam Patel' })).toHaveAttribute('href', '/contacts/51');
    expect(within(sam).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(sam).toHaveTextContent('Great support');
    expect(sam).toHaveTextContent('3 Oct 2026');
    expect(sam.querySelector('[data-part="score"]')).toHaveTextContent('10, Promoters');
    expect(sam.querySelector('[data-part="score"]')).toHaveClass('bg-success-dim', 'font-mono-brand');
    expect(lee.querySelector('[data-part="score"]')).toHaveClass('bg-danger-dim');
    expect(document.querySelector('[data-part="hidden-answers"]')).toHaveTextContent("1 more answer from people you can't open.");
  });

  it('filters to detractors and to answers with a comment, keeping the filter in the URL', async () => {
    const { spy } = stubSurveys();
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    await userEvent.click(screen.getByRole('button', { name: 'Detractors' }));
    expect(where()).toBe('/surveys/3?answers=detractors');
    await waitFor(() => expect(shown()).toEqual(['32']));
    expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/3\/answers\/$/).at(-1)?.query.get('filter')).toBe('detractors');
    expect(document.querySelector('[data-part="hidden-answers"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'With comments' }));
    await waitFor(() => expect(shown()).toEqual(['31']));
    expect(document.querySelector('[data-part="hidden-answers"]')).toHaveTextContent("1 more answer from people you can't open.");
  });

  it('calls the low filter Low scores on a CSAT survey', async () => {
    stubSurveys();
    renderInApp(<AnswersSection send={sendPayload(CARL_CSAT)} />, { url: '/surveys/4' });
    expect(await screen.findByRole('button', { name: 'Low scores' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detractors' })).toBeNull();
  });

  it("pages with the server's cursor: Show more adds the next page, then goes", async () => {
    const { spy } = stubSurveys({ pageSize: 1 });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    await userEvent.click(screen.getByRole('button', { name: 'Show more answers' }));
    await waitFor(() => expect(shown()).toEqual(['32', '31']));
    expect(requestsOf(spy, 'GET', /answers\/$/).map((r) => r.query.get('cursor'))).toEqual([null, '1']);
    expect(screen.queryByRole('button', { name: 'Show more answers' })).toBeNull();
  });

  it('says when there are no answers yet, or none for a filter', async () => {
    stubSurveys({ answers: () => ({ status: 200, body: { filter: 'all', results: [], next_cursor: null, hidden_count: 0 } }) });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    expect(await screen.findByText('No answers yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'With comments' }));
    expect(await screen.findByText('No answers with a comment')).toBeInTheDocument();
  });

  it('names a deleted contact as such, and links an account answer to the account', async () => {
    const row = { id: 9, contact: null, record: { kind: 'account', id: 14, name: 'Pizza EMEA' }, score: 2, band: 'detractors', comment: '', answered_at: '2026-10-03T12:00:00Z' };
    stubSurveys({ answers: () => ({ status: 200, body: { filter: 'all', results: [row], next_cursor: null, hidden_count: 0 } }) });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    expect(await screen.findByText('A deleted contact')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pizza EMEA' })).toHaveAttribute('href', '/accounts/14');
  });

  it('shows a failure with Try again', async () => {
    let calls = 0;
    stubSurveys({ answers: () => (++calls === 1 ? { status: 500, body: { detail: 'Answers are down.' } } : undefined) });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    expect(await screen.findByText('Answers are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Answers' })).toBeInTheDocument();
  });
});
```

`src/components/surveys/NotAnswered.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Q3_NPS, requestsOf, sendPayload, stubSurveys } from '../../features/surveys/testSurveys';
import { renderInApp } from '../../pages/segments/testPages';
import { resetViewport } from '../../test/viewport';
import { NotAnswered } from './NotAnswered';

describe('Not answered (spec §2.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('is collapsed and reads nothing until opened, then lists failures with their reason, expiry and expired links', async () => {
    const { spy } = stubSurveys();
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    const toggle = screen.getByRole('button', { name: 'Not answered' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(requestsOf(spy, 'GET', /pending\/$/)).toEqual([]);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const rows = within(await screen.findByRole('list', { name: 'Not answered' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Ann Lee');
    expect(rows[0]).toHaveTextContent('Pizza EMEA');
    expect(rows[0]).toHaveTextContent('Not delivered: Mailbox unavailable');
    expect(rows[1]).toHaveTextContent('Tom Reyes');
    expect(rows[1]).toHaveTextContent('Link expires 17 Oct 2026');
    expect(rows[2]).toHaveTextContent('A deleted contact');
    expect(rows[2]).toHaveTextContent('Link expired');
    expect(requestsOf(spy, 'GET', /pending\/$/)).toHaveLength(1);
  });

  it("says when everyone the reader can open has answered, and counts the rest", async () => {
    stubSurveys({ pending: () => ({ status: 200, body: { results: [], hidden_count: 2 } }) });
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await userEvent.click(screen.getByRole('button', { name: 'Not answered' }));
    expect(await screen.findByText('Everyone you can open has answered.')).toBeInTheDocument();
    expect(document.querySelector('[data-part="hidden-pending"]')).toHaveTextContent("2 more you can't open.");
  });

  it('shows a failure with Try again', async () => {
    let calls = 0;
    stubSurveys({ pending: () => (++calls === 1 ? { status: 500, body: { detail: 'Pending is down.' } } : { status: 200, body: { results: [], hidden_count: 0 } }) });
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await userEvent.click(screen.getByRole('button', { name: 'Not answered' }));
    expect(await screen.findByText('Pending is down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Everyone you can open has answered.')).toBeInTheDocument();
  });
});
```

Add to `src/pages/surveys/SendPage.test.tsx`, inside the `describe`:

```tsx
  it('shows Answers and a closed Not answered on a sent survey, and neither on a draft', async () => {
    stubSurveys();
    const first = renderSurveys('/surveys/3');
    expect(await screen.findByRole('list', { name: 'Answers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not answered' })).toHaveAttribute('aria-expanded', 'false');
    first.unmount();
    renderSurveys('/surveys/5');
    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Answers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not answered' })).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/AnswersSection.test.tsx src/components/surveys/NotAnswered.test.tsx src/pages/surveys/SendPage.test.tsx`
Expected: FAIL, "Failed to resolve import "./AnswersSection"" and "./NotAnswered"; the new SendPage case fails on the missing "Answers" list.

- [ ] **Step 3: Write the two sections**

`src/components/surveys/AnswersSection.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BAND_LABEL, bandTone, LINK_DAYS, lowFilterLabel } from '../../features/surveys/questions';
import { fetchAnswers } from '../../features/surveys/surveyApi';
import { answersFilter, withAnswersFilter } from '../../features/surveys/surveyParams';
import { dayLabel, recordPath } from '../../features/surveys/surveyText';
import type { AnswerRow, AnswersFilter, BandName, SurveySend } from '../../features/surveys/surveyTypes';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { BUTTON, FOCUS, MONO } from '../organizations/portfolio/styles';
import { Switch } from '../organizations/portfolio/tileParts';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** Semantic colour for meaning only: a low score, the middle, a high one. */
const TONE = { low: 'bg-danger-dim text-danger', mid: 'bg-subtle text-ink', high: 'bg-success-dim text-success' } as const;
const LINK = `inline-flex min-h-11 items-center rounded-sm hover:underline sm:min-h-0 ${FOCUS}`;

type Page = { key: string; rows: AnswerRow[]; next: string | null; hidden: number };

function emptyText(filter: AnswersFilter, send: SurveySend): { title: string; detail: string } {
  if (filter === 'detractors') {
    return { title: send.survey_type === 'nps' ? 'No detractors' : 'No low scores', detail: 'Nobody you can open answered in the low band.' };
  }
  if (filter === 'comments') return { title: 'No answers with a comment', detail: 'A comment is optional on the form.' };
  return { title: 'No answers yet', detail: `Answers appear here as people reply. A link works for ${LINK_DAYS} days.` };
}

/** The score in DM Mono, tinted by its band, the band named for screen
 *  readers so colour never carries the meaning alone. */
export function ScoreChip({ score, band }: { score: number; band: BandName }) {
  return (
    <span data-part="score" className={`${MONO} inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-semibold ${TONE[bandTone(band)]}`}>
      {score}
      <span className="sr-only">, {BAND_LABEL[band]}</span>
    </span>
  );
}

/** One answer, a row: chip, person and record, date, then the comment as
 *  plain text (React escapes it; spec §3). */
function AnswerItem({ row }: { row: AnswerRow }) {
  return (
    <li data-answer={row.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl bg-surface px-3 py-2.5">
      <ScoreChip score={row.score} band={row.band} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-[13px] font-semibold text-ink">
          {row.contact ? (
            <Link to={`/contacts/${row.contact.id}`} className={LINK}>
              {row.contact.name}
            </Link>
          ) : (
            <em className="font-normal text-ink-muted">A deleted contact</em>
          )}
        </p>
        <p className="truncate text-[11px] text-ink-muted">
          <Link to={recordPath(row.record)} className={LINK}>
            {row.record.name}
          </Link>
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-ink-muted">{dayLabel(row.answered_at)}</span>
      {row.comment ? <p className="basis-full whitespace-pre-line break-words text-[13px] text-ink">{row.comment}</p> : null}
    </li>
  );
}

/** Answers (spec §2.3): only people the reader may open, newest first, 50
 *  a page by the server's opaque cursor; the rest a count. The filter lives
 *  in the URL (`?answers=`, plan Decision 9). */
export function AnswersSection({ send }: { send: SurveySend }) {
  const headingId = useId();
  const [search, setSearch] = useSearchParams();
  const filter = answersFilter(search);
  const [attempt, setAttempt] = useState(0);
  const key = `${send.id}#${filter}#${attempt}`;
  const [page, setPage] = useState<Page | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [more, setMore] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  useEffect(() => {
    let alive = true;
    fetchAnswers(send.id, filter, null).then(
      (data) => {
        if (alive) setPage({ key, rows: data.results, next: data.next_cursor, hidden: data.hidden_count });
      },
      (err: unknown) => {
        if (alive) setFailure({ key, message: errorMessage(err, 'Could not load the answers.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, send.id, filter]);

  const current = page?.key === key ? page : null;
  const failed = !current && failure?.key === key ? failure.message : null;

  const showMore = async () => {
    if (!current?.next) return;
    const from = current;
    setMore({ loading: true, error: null });
    try {
      const data = await fetchAnswers(send.id, filter, from.next);
      // Added only to the page it continues: a filter changed meanwhile drops it.
      setPage((latest) =>
        latest && latest.key === from.key ? { ...latest, rows: [...latest.rows, ...data.results], next: data.next_cursor, hidden: data.hidden_count } : latest,
      );
      setMore({ loading: false, error: null });
    } catch (err) {
      setMore({ loading: false, error: errorMessage(err, 'Could not load more answers.') });
    }
  };

  const options = [
    { value: 'all' as const, label: 'All' },
    { value: 'detractors' as const, label: lowFilterLabel(send.survey_type) },
    { value: 'comments' as const, label: 'With comments' },
  ];

  let body;
  if (failed) {
    body = <ErrorBlock message={failed} onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (!current) {
    body = <ItemSkeleton count={3} label="Loading answers" avatar={false} />;
  } else if (current.rows.length === 0) {
    const empty = emptyText(filter, send);
    body = <EmptyState title={empty.title} detail={empty.detail} action={null} />;
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <ul aria-label="Answers" className="flex flex-col gap-1.5">
          {current.rows.map((row) => (
            <AnswerItem key={row.id} row={row} />
          ))}
        </ul>
        {current.next ? (
          <button type="button" onClick={() => void showMore()} disabled={more.loading} className={`${BUTTON} self-start`}>
            {more.loading ? 'Loading…' : 'Show more answers'}
          </button>
        ) : null}
        {more.error ? (
          <p role="alert" className="text-[13px] text-danger">
            {more.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-[15px] font-semibold text-ink">
          Answers
        </h2>
        <Switch label="Show answers" options={options} value={filter} onChange={(next) => setSearch(withAnswersFilter(search, next), { replace: true })} />
      </div>
      {body}
      {current && current.hidden > 0 ? (
        <p data-part="hidden-answers" className="text-[13px] text-ink-muted">
          <span className={MONO}>{current.hidden}</span> more {current.hidden === 1 ? 'answer' : 'answers'} from people you can't open.
        </p>
      ) : null}
    </section>
  );
}
```

`src/components/surveys/NotAnswered.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fetchPending } from '../../features/surveys/surveyApi';
import { dayLabel } from '../../features/surveys/surveyText';
import type { PendingPage, PendingRow, SurveySend } from '../../features/surveys/surveyTypes';
import { ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

function statusText(row: PendingRow): string {
  if (row.status === 'failed') return `Not delivered: ${row.failure ?? 'no reason given'}`;
  if (row.status === 'expired') return 'Link expired';
  return `Link expires ${dayLabel(row.expires_at)}`;
}

function PendingItem({ row }: { row: PendingRow }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
      <span className="min-w-0">
        <span className="text-[13px] font-semibold text-ink">{row.contact ? row.contact.name : <em className="font-normal text-ink-muted">A deleted contact</em>}</span>
        <span className="text-[11px] text-ink-muted"> · {row.record.name}</span>
      </span>
      <span className={`text-[11px] ${row.status === 'failed' ? 'text-danger' : 'text-ink-muted'}`}>{statusText(row)}</span>
    </li>
  );
}

/** Not answered (spec §2.3): closed by default, and read only when opened
 *  (plan Decision 12). Pending links with their expiry, expired ones, and
 *  failed sends with the reason; people the reader can't open are a count.
 *  Never an email address (the server sends none). */
export function NotAnswered({ send }: { send: SurveySend }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = `${send.id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; page: PendingPage | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchPending(send.id).then(
      (page) => {
        if (alive) setAnswer({ key, page, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, page: null, error: errorMessage(err, 'Could not load who has not answered.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [open, key, send.id]);

  const current = answer?.key === key ? answer : null;
  let body;
  if (!current) {
    body = <ItemSkeleton count={2} label="Loading who has not answered" avatar={false} />;
  } else if (current.error || !current.page) {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
        <span>{current.error}</span>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
          Try again
        </button>
      </div>
    );
  } else {
    const { results, hidden_count: hidden } = current.page;
    body = (
      <>
        {results.length > 0 ? (
          <ul aria-label="Not answered" className="flex flex-col divide-y divide-line-subtle">
            {results.map((row) => (
              <PendingItem key={row.id} row={row} />
            ))}
          </ul>
        ) : (
          <p className="py-2 text-[13px] text-ink-muted">Everyone you can open has answered.</p>
        )}
        {hidden > 0 ? (
          <p data-part="hidden-pending" className="text-[13px] text-ink-muted">
            <span className={MONO}>{hidden}</span> more you can't open.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section className="flex flex-col rounded-xl bg-surface">
      <h2 className="text-[15px]">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-[15px] font-semibold text-ink hover:bg-subtle ${FOCUS}`}
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          Not answered
          {current?.page ? (
            <>
              {' '}
              <span className={`${MONO} text-[13px] font-normal text-ink-muted`}>{current.page.results.length}</span>
            </>
          ) : null}
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="border-t border-line-subtle px-3 pb-3 pt-1">
          {body}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Put both on the send page**

In `src/pages/surveys/SendPage.tsx`, add the imports:

```tsx
import { AnswersSection } from '../../components/surveys/AnswersSection';
import { NotAnswered } from '../../components/surveys/NotAnswered';
```

and replace

```tsx
            {send.counts ? (
              <p data-part="counts" className="text-[13px] text-ink-muted">
                At the send: <Lines lines={countsLines(send.counts)} />
              </p>
            ) : null}
          </>
```

with

```tsx
            {send.counts ? (
              <p data-part="counts" className="text-[13px] text-ink-muted">
                At the send: <Lines lines={countsLines(send.counts)} />
              </p>
            ) : null}
            <AnswersSection send={send} />
            <NotAnswered send={send} />
          </>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/AnswersSection.test.tsx src/components/surveys/NotAnswered.test.tsx src/pages/surveys/SendPage.test.tsx`
Expected: PASS (7 + 3 + 11 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/surveys/AnswersSection.tsx src/components/surveys/AnswersSection.test.tsx src/components/surveys/NotAnswered.tsx src/components/surveys/NotAnswered.test.tsx src/pages/surveys/SendPage.tsx src/pages/surveys/SendPage.test.tsx
git commit -m "feat(surveys): a send's answers, filtered and paged, and who has not answered

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The New survey modal: build, save a draft, confirm and send; edit

Spec §2.2 (all of it), §2.3 ("for the owner, Edit opens the modal with only the name and sharing editable, as the server allows"); backend Decisions 15–17; plan Decisions 2, 3, 7, 14, 15.

**Files:**
- Create: `src/pages/surveys/SurveyBuilder.tsx`
- Modify: `src/components/segments/SharingFields.tsx` (optional `note`), `src/pages/surveys/testPages.tsx` (routes `new`, `:id/edit`)
- Test: `src/pages/surveys/SurveyBuilder.test.tsx`

**Interfaces:**
- Consumes: `createSend`, `updateSend`, `fetchAudience`, `sendNow` (Task 2); `surveyErrors`, `SurveyErrors` (Task 3); `DEFAULT_ROLES`, `INTRO_MAX`, `NAME_MAX`, `SUBJECT_MAX`, `TYPE_HINT`, `TYPE_LABEL` (Task 1); `dayLabel`, `segmentLabel`, `sendBlocker`, `sendLabel` (Task 1); `useAudience` (Task 6), `AudienceSummary`, `ReachLines` (Task 6); `AudienceFields`, `useMySegments` (Task 7); `SurveyPreview` (Task 8); `SendOutlet` (Task 10); `BuilderDialog`, `RadioTile`, `SharingFields` (`components/segments`); `useMembers` (`features/knowledge/useMembers`); `useAppSelector`; `EmptyState`; `FOCUS`, `MONO`, `PRIMARY`, `QUIET`.
- Produces:
  - `NewSurveyModal({ segmentId?: number | null; onClose: () => void })` (Task 14's Survey these uses it);
  - `NewSurveyRoute()` (`/surveys/new`), `EditSurveyRoute()` (`/surveys/:id/edit`, reads `SendOutlet`);
  - `SharingFields` gains `note?: string` (default: the segment's sentence, unchanged).

- [ ] **Step 1: Let `SharingFields` take its note**

In `src/components/segments/SharingFields.tsx`:

1. Below `const MAX_SHARED = 50;`, add:

```tsx
/** What a segment's sharing shows teammates. A survey passes its own. */
const SEGMENT_NOTE = 'Teammates see the same rules, but only the members they may open, and a count of the rest. Only you can change it.';
```

2. Replace the signature

```tsx
export function SharingFields({ sharing, sharedWith, teammates, error, onChange }: {
  sharing: Sharing;
  sharedWith: PersonRef[];
  /** Active people in the workspace, the owner left out. */
  teammates: PersonRef[];
  error: string | null;
  onChange: (sharing: Sharing, sharedWith: PersonRef[]) => void;
}) {
```

with

```tsx
export function SharingFields({ sharing, sharedWith, teammates, error, onChange, note = SEGMENT_NOTE }: {
  sharing: Sharing;
  sharedWith: PersonRef[];
  /** Active people in the workspace, the owner left out. */
  teammates: PersonRef[];
  error: string | null;
  onChange: (sharing: Sharing, sharedWith: PersonRef[]) => void;
  /** What sharing shows teammates (default: a segment's). */
  note?: string;
}) {
```

3. Replace

```tsx
      <p className="text-[11px] text-ink-muted">Teammates see the same rules, but only the members they may open, and a count of the rest. Only you can change it.</p>
```

with

```tsx
      <p className="text-[11px] text-ink-muted">{note}</p>
```

- [ ] **Step 2: Route the modal in the test helper**

In `src/pages/surveys/testPages.tsx`, add `import { EditSurveyRoute, NewSurveyRoute } from './SurveyBuilder';` and replace

```tsx
              <Route path="/surveys" element={null} />
            </Route>
            <Route
              path="/surveys/:id"
              element={
                <>
                  <SendPage />
                  <Where />
                </>
              }
            />
```

with

```tsx
              <Route path="/surveys" element={null} />
              <Route path="/surveys/new" element={<NewSurveyRoute />} />
            </Route>
            <Route
              path="/surveys/:id"
              element={
                <>
                  <SendPage />
                  <Where />
                </>
              }
            >
              <Route path="edit" element={<EditSurveyRoute />} />
            </Route>
```

- [ ] **Step 3: Write the failing test**

`src/pages/surveys/SurveyBuilder.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderSurveys } from './testPages';

// Integration tier: the modal routes on the real store and router, over the
// pages that open them; fetch stubbed in the backend's contract shapes.
const where = () => screen.getByTestId('where').textContent;
const dialog = (name = 'New survey') => screen.findByRole('dialog', { name });

/** Picks a segment once the caller's own segments have loaded. */
async function chooseSegment(modal: HTMLElement, value: string) {
  const select = within(modal).getByRole('combobox', { name: 'Segment' });
  await waitFor(() => expect(select).toBeEnabled());
  await userEvent.selectOptions(select, value);
}

describe('the New survey modal (spec §2.2)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens over the Sends list with NPS chosen, the subject filled and the preview asking the question', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    expect(where()).toBe('/surveys/new');
    expect(await screen.findByRole('list', { name: 'Survey sends' })).toBeInTheDocument();
    expect(within(modal).getByRole('radio', { name: 'NPS' })).toBeChecked();
    expect(within(modal).getByRole('textbox', { name: 'Email subject' })).toHaveValue('A quick question from Acme Inc');
    expect(within(modal).getByRole('region', { name: 'The email' })).toHaveTextContent('How likely are you to recommend Acme Inc to a friend or colleague?');
    await userEvent.click(within(modal).getByRole('radio', { name: 'CES' }));
    expect(within(modal).getByRole('region', { name: 'The form' })).toHaveTextContent('How easy is it to get what you need from Acme Inc?');
    expect(within(modal).getByRole('button', { name: 'Send…' })).toHaveAccessibleDescription('Choose a segment to send.');
    expect(modal).toHaveTextContent('Teammates see the answers only from people they may open');
  });

  it('shows the roles for an organisation segment, Champion and Decision Maker ticked, and none for a contact segment', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await chooseSegment(modal, '7');
    const roles = within(modal).getByRole('group', { name: 'Who to ask at each organisation' });
    expect(within(roles).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Decision Maker' })).toBeChecked();
    await chooseSegment(modal, '9');
    expect(within(modal).queryByRole('group', { name: /Who to ask/ })).toBeNull();
  });

  it('counts who it reaches 400 ms after the last change, with the skips and the hidden count, and again when a role changes', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await chooseSegment(modal, '7');
    await waitFor(() => expect(modal.querySelector('[data-part="reach"]')).toHaveTextContent('3 people at 3 organisations'));
    expect(modal.querySelector('[data-part="skips"]')).toHaveTextContent('1 skipped (surveyed in the last 30 days) · 1 without an email');
    expect(modal.querySelector('[data-part="hidden"]')).toHaveTextContent("2 in the segment you can't open aren't included");
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/audience\/$/).map((r) => r.body)).toEqual([{ segment: 7, roles: ['champion', 'decision_maker'] }]);
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Decision Maker' }));
    await waitFor(() =>
      expect(requestsOf(spy, 'POST', /audience\/$/).map((r) => r.body)).toEqual([
        { segment: 7, roles: ['champion', 'decision_maker'] },
        { segment: 7, roles: ['champion'] },
      ]),
    );
    expect(await within(modal).findByRole('button', { name: 'Send to 3 people…' })).toBeEnabled();
  });

  it('disables Send with the reason when nobody is reached, and when no role is ticked', async () => {
    stubSurveys({ audience: () => ({ status: 200, body: { audience: 0, organisations: 0, skipped_recent: 4, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await chooseSegment(modal, '7');
    const send = await within(modal).findByRole('button', { name: 'Send to 0 people…' });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription('Nobody to send to.');
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Champion' }));
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Decision Maker' }));
    expect(within(modal).getByRole('button', { name: 'Send…' })).toHaveAccessibleDescription('Choose at least one role to send.');
  });

  it('saves a draft with the contract body, then opens its page', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Q4 CSAT');
    await userEvent.click(within(modal).getByRole('radio', { name: 'CSAT' }));
    await userEvent.type(within(modal).getByRole('textbox', { name: /Intro line/ }), 'Thanks for a good quarter.');
    await chooseSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/).map((r) => r.body)).toEqual([
      { name: 'Q4 CSAT', survey_type: 'csat', subject: 'A quick question from Acme Inc', intro: 'Thanks for a good quarter.', segment: 7, roles: ['champion', 'decision_maker'], sharing: 'private' },
    ]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Q4 CSAT' })).toBeInTheDocument();
  });

  it('caps the intro at 500 characters and counts them', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const intro = within(await dialog()).getByRole('textbox', { name: /Intro line/ });
    expect(intro).toHaveAttribute('maxlength', '500');
    await userEvent.type(intro, 'Hi');
    expect(intro).toHaveAccessibleDescription('2 of 500');
  });

  it('checks the name and the subject before saving anything', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.clear(within(modal).getByRole('textbox', { name: 'Email subject' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription('Give the survey a name.');
    expect(within(modal).getByRole('textbox', { name: 'Email subject' })).toHaveAccessibleDescription('Write a subject line.');
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/)).toEqual([]);
  });

  it('sends after a confirm step that repeats the count from the server', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion CES');
    await userEvent.click(within(modal).getByRole('radio', { name: 'CES' }));
    await chooseSegment(modal, '9');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    const heading = await within(modal).findByRole('heading', { name: 'Send Champion CES now?' });
    expect(heading).toHaveFocus();
    expect(modal.querySelector('[data-part="confirm"] [data-part="reach"]')).toHaveTextContent('2 people at 2 organisations');
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/).map((r) => r.body)).toEqual([expect.objectContaining({ segment: 9, roles: [], survey_type: 'ces' })]);
    expect(requestsOf(spy, 'POST', /audience\/$/)).toHaveLength(2);
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/100\/send\/$/)).toHaveLength(1);
    expect(within(await screen.findByRole('group', { name: 'Sent' })).getByText('2')).toBeInTheDocument();
  });

  it('goes Back from the confirm keeping the form, and never saves a second draft', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion NPS');
    await chooseSegment(modal, '9');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Back' }));
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Champion NPS');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send to 2 people…' }));
    await within(modal).findByRole('button', { name: 'Send now' });
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/)).toHaveLength(1);
    expect(requestsOf(spy, 'PATCH', /^\/surveys\/sends\/100\/$/)).toEqual([]);
  });

  it("puts a roles refusal at the roles", async () => {
    stubSurveys({ create: () => ({ status: 400, body: { roles: ['Choose at least one role.'] } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Q4 NPS');
    await chooseSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    const roles = within(modal).getByRole('group', { name: 'Who to ask at each organisation' });
    expect(await within(roles).findByRole('alert')).toHaveTextContent('Choose at least one role.');
    expect(where()).toBe('/surveys/new');
  });

  it('puts the daily limit at the form and returns to it', async () => {
    stubSurveys({ sendNow: () => ({ status: 429, body: { detail: 'You can send at most 20 surveys a day. Try again tomorrow.' } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion NPS');
    await chooseSegment(modal, '9');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now' }));
    expect(await within(modal).findByText('You can send at most 20 surveys a day. Try again tomorrow.')).toBeInTheDocument();
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Champion NPS');
  });

  it('closes on Cancel back to the list', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/surveys'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('editing a survey (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('edits a draft over its page, every field open; PATCH carries only what changed', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/5/edit');
    const modal = await dialog('Edit Onboarding effort');
    expect(within(modal).getByRole('radio', { name: 'CES' })).toBeChecked();
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Champions'));
    const subject = within(modal).getByRole('textbox', { name: 'Email subject' });
    await userEvent.clear(subject);
    await userEvent.type(subject, 'How easy were we?');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(where()).toBe('/surveys/5'));
    expect(requestsOf(spy, 'PATCH', /^\/surveys\/sends\/5\/$/).map((r) => r.body)).toEqual([{ subject: 'How easy were we?' }]);
  });

  it('lets the owner only rename and re-share a sent survey', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/3/edit');
    const modal = await dialog('Edit Q3 NPS');
    expect(within(modal).queryByRole('textbox', { name: 'Email subject' })).toBeNull();
    expect(within(modal).queryByRole('combobox', { name: 'Segment' })).toBeNull();
    expect(modal.querySelector('[data-part="locked"]')).toHaveTextContent('NPS to Renewal risk, sent 3 Oct 2026. A sent survey can only be renamed or re-shared.');
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Q3 NPS final');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(where()).toBe('/surveys/3'));
    expect(requestsOf(spy, 'PATCH', /^\/surveys\/sends\/3\/$/).map((r) => r.body)).toEqual([{ name: 'Q3 NPS final' }]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Q3 NPS final' })).toBeInTheDocument();
  });

  it('tells a reader who is not the owner that only the owner edits', async () => {
    stubSurveys();
    renderSurveys('/surveys/4/edit');
    const modal = await dialog('Edit Support CSAT');
    expect(within(modal).getByText('Only Carl CSM can edit this survey')).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: 'Open survey' })).toHaveAttribute('href', '/surveys/4');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/surveys/SurveyBuilder.test.tsx`
Expected: FAIL, "Failed to resolve import "./SurveyBuilder"".

- [ ] **Step 5: Write the builder**

`src/pages/surveys/SurveyBuilder.tsx`:

```tsx
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Gauge, Smile, ThumbsUp } from 'lucide-react';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import type { PersonRef, SegmentKind, Sharing } from '../../features/segments/segmentTypes';
import { DEFAULT_ROLES, INTRO_MAX, LINK_DAYS, NAME_MAX, SUBJECT_MAX, TYPE_HINT, TYPE_LABEL } from '../../features/surveys/questions';
import { createSend, fetchAudience, sendNow, updateSend } from '../../features/surveys/surveyApi';
import { surveyErrors, type SurveyErrors } from '../../features/surveys/surveyErrors';
import { dayLabel, segmentLabel, sendBlocker, sendLabel } from '../../features/surveys/surveyText';
import type { AudienceCounts, ContactRole, SendWrite, SurveySend, SurveyType } from '../../features/surveys/surveyTypes';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { RadioTile } from '../../components/segments/RadioTile';
import { SharingFields } from '../../components/segments/SharingFields';
import { AudienceFields } from '../../components/surveys/AudienceFields';
import { AudienceSummary, ReachLines } from '../../components/surveys/AudienceSummary';
import { SurveyPreview } from '../../components/surveys/SurveyPreview';
import { useAudience } from '../../components/surveys/useAudience';
import { useMySegments } from '../../components/surveys/useMySegments';
import type { SendOutlet } from './SendPage';

const TYPES = [
  { value: 'nps', icon: ThumbsUp },
  { value: 'csat', icon: Smile },
  { value: 'ces', icon: Gauge },
] as const satisfies readonly { value: SurveyType; icon: unknown }[];
const INPUT = `min-h-11 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';
const SHARING_NOTE = 'Teammates see the answers only from people they may open, and a count of the rest. Only you can change it or send it.';

const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Sharing and its people travel together, so the server checks them
 *  together; nothing when neither changed. */
function sharingPatch(sharing: Sharing, people: number[] | undefined, send: SurveySend): Partial<SendWrite> {
  const before = send.sharing === 'people' ? send.shared_with.map((person) => person.id) : [];
  if (sharing === send.sharing && sameIds(people ?? [], before)) return {};
  return people ? { sharing, shared_with: people } : { sharing };
}

/** A draft's PATCH: only what differs from the copy the server last
 *  returned. Segment and roles travel together. */
function changedFields(body: SendWrite, send: SurveySend): Partial<SendWrite> {
  const patch: Partial<SendWrite> = {};
  if (body.name !== send.name) patch.name = body.name;
  if (body.survey_type !== send.survey_type) patch.survey_type = body.survey_type;
  if (body.subject !== send.subject) patch.subject = body.subject;
  if (body.intro !== send.intro) patch.intro = body.intro;
  if (body.segment !== (send.segment?.id ?? null) || body.roles.join() !== send.roles.join()) {
    patch.segment = body.segment;
    patch.roles = body.roles;
  }
  return { ...patch, ...sharingPatch(body.sharing, body.shared_with, send) };
}

/** Sharing as Segments do it: active teammates only, the owner left out;
 *  someone deactivated since is dropped once the members load. */
function useSharing(send: SurveySend | null) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const [sharing, setSharing] = useState<Sharing>(send?.sharing ?? 'private');
  const [sharedWith, setSharedWith] = useState<PersonRef[]>(send?.shared_with ?? []);
  const teammates = useMemo(() => members.filter((m) => m.is_active && m.id !== me).map((m) => ({ id: m.id, name: m.name })), [members, me]);
  const loaded = members.length > 0;
  const shared = useMemo(() => (loaded ? sharedWith.filter((person) => teammates.some((t) => t.id === person.id)) : sharedWith), [loaded, sharedWith, teammates]);
  const people = sharing === 'people' ? shared.map((person) => person.id) : undefined;
  const onChange = (next: Sharing, chosen: PersonRef[]) => {
    setSharing(next);
    setSharedWith(chosen);
  };
  return { sharing, shared, people, teammates, onChange };
}

function NameField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        Name
      </label>
      <input
        id={id}
        value={value}
        maxLength={NAME_MAX}
        placeholder="Q4 NPS"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${INPUT} ${error ? 'border-danger' : 'border-line'}`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-[13px] text-danger">
      {message}
    </p>
  ) : null;
}

/** The confirm step (plan Decision 2): the count the server gave just now. */
function ConfirmSend({ name, counts, kind, headingRef }: { name: string; counts: AudienceCounts; kind: SegmentKind | null; headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <section aria-label="Confirm the send" data-part="confirm" className="flex max-w-xl flex-col gap-3">
      <h3 ref={headingRef} tabIndex={-1} className={`text-[15px] font-semibold text-ink ${FOCUS}`}>
        Send {name} now?
      </h3>
      <p className="text-[13px] text-ink-muted">
        Each person gets their own link by email. A link works for <span className={MONO}>{LINK_DAYS}</span> days and takes one answer.
      </p>
      <ReachLines counts={counts} kind={kind} />
      {sendBlocker(counts) ? null : <p className="text-[13px] text-ink-muted">Once it is sent, only its name and sharing can change.</p>}
    </section>
  );
}

/** The builder (spec §2.2) for a new survey or a draft. */
function SurveyForm({
  initial,
  segmentId: firstSegment,
  onClose,
  onDone,
}: {
  initial: SurveySend | null;
  segmentId: number | null;
  onClose: () => void;
  onDone: (send: SurveySend) => void;
}) {
  const workspace = useAppSelector((state) => state.auth.user?.organisation?.name ?? 'your company');
  const typeName = useId();
  const subjectId = useId();
  const introId = useId();
  const reasonId = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<SurveyType>(initial?.survey_type ?? 'nps');
  const [subject, setSubject] = useState(initial?.subject ?? `A quick question from ${workspace}`);
  const [intro, setIntro] = useState(initial?.intro ?? '');
  const [segmentId, setSegmentId] = useState<number | null>(initial ? (initial.segment?.id ?? null) : firstSegment);
  const [roles, setRoles] = useState<ContactRole[]>(initial && initial.roles.length > 0 ? initial.roles : DEFAULT_ROLES);
  const sharing = useSharing(initial);
  const segments = useMySegments();
  const [saved, setSaved] = useState<SurveySend | null>(initial);
  const [errors, setErrors] = useState<SurveyErrors>({});
  const [busy, setBusy] = useState<'draft' | 'confirm' | 'send' | null>(null);
  const [confirm, setConfirm] = useState<AudienceCounts | null>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);

  const kind: SegmentKind | null =
    segments.rows?.find((row) => row.id === segmentId)?.kind ?? (initial?.segment && initial.segment.id === segmentId ? initial.segment.kind : null);
  const needsRoles = kind === 'customer' || kind === 'account';
  const request = useMemo(
    () => (segmentId !== null && kind !== null && (!needsRoles || roles.length > 0) ? { segment: segmentId, roles: needsRoles ? roles : [] } : null),
    [segmentId, kind, needsRoles, roles],
  );
  const audience = useAudience(request);
  const counted = audience.status === 'ready' ? audience.data : null;

  // Why Send is off (plan Decision 14), or null when it can go.
  let reason: string | null;
  if (segmentId === null) reason = 'Choose a segment to send.';
  else if (needsRoles && roles.length === 0) reason = 'Choose at least one role to send.';
  else if (audience.status === 'error') reason = audience.message;
  else if (!counted) reason = 'Counting who it reaches…';
  else reason = sendBlocker(counted);

  const body = (): SendWrite => ({
    name: name.trim(),
    survey_type: type,
    subject: subject.trim(),
    intro: intro.trim(),
    segment: segmentId,
    roles: needsRoles ? roles : [],
    sharing: sharing.sharing,
    ...(sharing.people ? { shared_with: sharing.people } : {}),
  });

  function check(forSend: boolean): SurveyErrors {
    const found: SurveyErrors = {};
    if (!name.trim()) found.name = 'Give the survey a name.';
    if (!subject.trim()) found.subject = 'Write a subject line.';
    if (forSend && segmentId === null) found.segment = 'Choose a segment.';
    if (segmentId !== null && needsRoles && roles.length === 0) found.roles = 'Choose at least one role.';
    if (sharing.sharing === 'people' && sharing.shared.length === 0) found.shared_with = 'Choose at least one teammate.';
    return found;
  }

  /** POST the first time, then PATCH only what changed (never a second draft). */
  async function persist(): Promise<SurveySend> {
    const next = body();
    if (!saved) {
      const created = await createSend(next);
      setSaved(created);
      return created;
    }
    const patch = changedFields(next, saved);
    if (Object.keys(patch).length === 0) return saved;
    const updated = await updateSend(saved.id, patch);
    setSaved(updated);
    return updated;
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    const found = check(false);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy('draft');
    try {
      onDone(await persist());
    } catch (err) {
      setErrors(surveyErrors(err));
      setBusy(null);
    }
  }

  /** Save, then ask the server once more who it reaches, then confirm. */
  async function startSend() {
    const found = check(true);
    setErrors(found);
    if (Object.keys(found).length > 0 || segmentId === null) return;
    setBusy('confirm');
    try {
      const draft = await persist();
      setConfirm(await fetchAudience({ segment: segmentId, roles: draft.roles }));
    } catch (err) {
      setErrors(surveyErrors(err));
    }
    setBusy(null);
  }

  async function sendIt() {
    if (!saved) return;
    setBusy('send');
    try {
      onDone(await sendNow(saved.id));
    } catch (err) {
      setConfirm(null);
      setErrors(surveyErrors(err, 'Could not send this survey. Try again.'));
      setBusy(null);
    }
  }

  const introDescribedBy = [`${introId}-count`, errors.intro ? `${introId}-error` : null].filter(Boolean).join(' ');
  return (
    <BuilderDialog title={initial ? `Edit ${initial.name}` : 'New survey'} onClose={onClose}>
      <form onSubmit={(event) => void saveDraft(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <FormError message={errors.form} />
          {confirm ? (
            <ConfirmSend name={name.trim()} counts={confirm} kind={kind} headingRef={confirmRef} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <div className="flex min-w-0 flex-col divide-y divide-line-subtle">
                <section aria-label="Question" className="flex flex-col gap-4 pb-4">
                  <NameField value={name} onChange={setName} error={errors.name} />
                  <fieldset aria-describedby={`${typeName}-hint`} className="flex flex-col gap-2">
                    <legend className={`${LABEL} mb-2`}>Type</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {TYPES.map((option) => (
                        <RadioTile
                          key={option.value}
                          name={typeName}
                          label={TYPE_LABEL[option.value]}
                          icon={option.icon}
                          checked={type === option.value}
                          onChange={() => setType(option.value)}
                        />
                      ))}
                    </div>
                    <p id={`${typeName}-hint`} className="text-[11px] text-ink-muted">
                      {TYPE_HINT[type]}
                    </p>
                    {errors.survey_type ? (
                      <p role="alert" className="text-[11px] text-danger">
                        {errors.survey_type}
                      </p>
                    ) : null}
                  </fieldset>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={subjectId} className={LABEL}>
                      Email subject
                    </label>
                    <input
                      id={subjectId}
                      value={subject}
                      maxLength={SUBJECT_MAX}
                      onChange={(event) => setSubject(event.target.value)}
                      aria-invalid={Boolean(errors.subject)}
                      aria-describedby={errors.subject ? `${subjectId}-error` : undefined}
                      className={`${INPUT} ${errors.subject ? 'border-danger' : 'border-line'}`}
                    />
                    {errors.subject ? (
                      <p id={`${subjectId}-error`} role="alert" className="text-[11px] text-danger">
                        {errors.subject}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={introId} className={LABEL}>
                      Intro line <span className="font-normal normal-case tracking-normal">(optional)</span>
                    </label>
                    <textarea
                      id={introId}
                      rows={2}
                      value={intro}
                      maxLength={INTRO_MAX}
                      placeholder="A line above the question, in your own words"
                      onChange={(event) => setIntro(event.target.value)}
                      aria-invalid={Boolean(errors.intro)}
                      aria-describedby={introDescribedBy}
                      className={`${INPUT} resize-none py-2.5 ${errors.intro ? 'border-danger' : 'border-line'}`}
                    />
                    <p id={`${introId}-count`} className="text-right text-[11px] text-ink-muted">
                      <span className={MONO}>{intro.length}</span> of <span className={MONO}>{INTRO_MAX}</span>
                    </p>
                    {errors.intro ? (
                      <p id={`${introId}-error`} role="alert" className="text-[11px] text-danger">
                        {errors.intro}
                      </p>
                    ) : null}
                  </div>
                </section>
                <div className="py-4">
                  <AudienceFields
                    segments={segments.rows}
                    segmentsError={segments.error}
                    segmentId={segmentId}
                    fallback={initial?.segment ?? null}
                    roles={roles}
                    kind={kind}
                    errors={{ segment: errors.segment, roles: errors.roles }}
                    onSegment={(id) => {
                      setSegmentId(id);
                      setErrors((current) => ({ ...current, segment: undefined, roles: undefined }));
                    }}
                    onRoles={(next) => {
                      setRoles(next);
                      setErrors((current) => ({ ...current, roles: undefined }));
                    }}
                  />
                </div>
                <div className="pt-4">
                  <SharingFields
                    sharing={sharing.sharing}
                    sharedWith={sharing.shared}
                    teammates={sharing.teammates}
                    error={errors.shared_with ?? errors.sharing ?? null}
                    onChange={sharing.onChange}
                    note={SHARING_NOTE}
                  />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0">
                <SurveyPreview type={type} subject={subject} intro={intro} workspace={workspace} />
                <AudienceSummary state={audience} kind={kind} />
              </div>
            </div>
          )}
        </div>
        <div data-part="builder-footer" className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          {confirm ? (
            <>
              <button type="button" onClick={() => setConfirm(null)} disabled={busy === 'send'} className={QUIET}>
                Back
              </button>
              <button type="button" onClick={() => void sendIt()} disabled={busy === 'send' || sendBlocker(confirm) !== null} className={PRIMARY}>
                {busy === 'send' ? 'Sending…' : 'Send now'}
              </button>
            </>
          ) : (
            <>
              {reason ? (
                <p id={reasonId} className="mr-auto text-[11px] text-ink-muted">
                  {reason}
                </p>
              ) : null}
              <button type="button" onClick={onClose} className={QUIET}>
                Cancel
              </button>
              <button type="submit" disabled={busy !== null} className={`${QUIET} border border-line`}>
                {busy === 'draft' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={() => void startSend()}
                disabled={busy !== null || reason !== null}
                aria-describedby={reason ? reasonId : undefined}
                className={PRIMARY}
              >
                {busy === 'confirm' ? 'Checking…' : counted ? sendLabel(counted.audience) : 'Send…'}
              </button>
            </>
          )}
        </div>
      </form>
    </BuilderDialog>
  );
}

/** After the send: only the name and sharing (backend Decision 16). */
function RenameForm({ initial, onClose, onSaved }: { initial: SurveySend; onClose: () => void; onSaved: (send: SurveySend) => void }) {
  const [name, setName] = useState(initial.name);
  const sharing = useSharing(initial);
  const [errors, setErrors] = useState<SurveyErrors>({});
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const found: SurveyErrors = {};
    if (!name.trim()) found.name = 'Give the survey a name.';
    if (sharing.sharing === 'people' && sharing.shared.length === 0) found.shared_with = 'Choose at least one teammate.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const patch: Partial<SendWrite> = { ...(name.trim() !== initial.name ? { name: name.trim() } : {}), ...sharingPatch(sharing.sharing, sharing.people, initial) };
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      onSaved(await updateSend(initial.id, patch));
    } catch (err) {
      setErrors(surveyErrors(err));
      setSaving(false);
    }
  }

  const when = initial.sent_at ? `sent ${dayLabel(initial.sent_at)}` : 'being sent';
  return (
    <BuilderDialog title={`Edit ${initial.name}`} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <FormError message={errors.form} />
          <NameField value={name} onChange={setName} error={errors.name} />
          <p data-part="locked" className="text-[13px] text-ink-muted">
            {TYPE_LABEL[initial.survey_type]} to {segmentLabel(initial.segment)}, {when}. A sent survey can only be renamed or re-shared.
          </p>
          <SharingFields
            sharing={sharing.sharing}
            sharedWith={sharing.shared}
            teammates={sharing.teammates}
            error={errors.shared_with ?? errors.sharing ?? null}
            onChange={sharing.onChange}
            note={SHARING_NOTE}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={PRIMARY}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

/** A new survey over whatever page opened it (the Sends list, or a
 *  segment's Survey these with `segmentId`). Saving or sending opens it. */
export function NewSurveyModal({ segmentId = null, onClose }: { segmentId?: number | null; onClose: () => void }) {
  const navigate = useNavigate();
  return <SurveyForm initial={null} segmentId={segmentId} onClose={onClose} onDone={(saved) => navigate(`/surveys/${saved.id}`)} />;
}

/** /surveys/new: the modal over the Sends list (spec §2.1). */
export function NewSurveyRoute() {
  const navigate = useNavigate();
  return <NewSurveyModal onClose={() => navigate('/surveys')} />;
}

/** /surveys/:id/edit: the modal over the send's own page, which has read
 *  the send. A draft opens whole; a sent survey only its name and sharing;
 *  anyone but the owner reads a notice. */
export function EditSurveyRoute() {
  const navigate = useNavigate();
  const { send, onReplace } = useOutletContext<SendOutlet>();
  const close = () => navigate(`/surveys/${send.id}`);
  const done = (saved: SurveySend) => {
    onReplace(saved);
    close();
  };
  if (!send.is_owner) {
    return (
      <BuilderDialog title={`Edit ${send.name}`} onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${send.owner.name} can edit this survey`}
            detail="Ask them to rename it or change who it is shared with."
            action={
              <Link to={`/surveys/${send.id}`} className={`${QUIET} border border-line`}>
                Open survey
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  if (send.status !== 'draft') return <RenameForm initial={send} onClose={close} onSaved={done} />;
  return <SurveyForm initial={send} segmentId={send.segment?.id ?? null} onClose={close} onDone={done} />;
}
```

- [ ] **Step 6: Run the tests to verify they pass, Segments' sharing included**

Run: `npx vitest run --maxWorkers=2 src/pages/surveys/SurveyBuilder.test.tsx src/pages/surveys/SendPage.test.tsx src/pages/segments/Builder.test.tsx`
Expected: PASS (15 + 11 tests, and Segments' builder suite unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/pages/surveys/SurveyBuilder.tsx src/pages/surveys/SurveyBuilder.test.tsx src/pages/surveys/testPages.tsx src/components/segments/SharingFields.tsx
git commit -m "feat(surveys): the New survey modal: build, preview, count, save a draft, confirm and send

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Logged scores, with send-written rows read-only

Spec §2.1 ("**Logged scores**: today's page unchanged"); backend Decisions 25, 28; plan Decision 4.

**Files:**
- Modify: `src/pages/surveys/SurveysPage.tsx`, `src/pages/surveys/SurveysHome.tsx`, `src/components/organizations/detail/StoryTab.tsx`, `src/components/accounts/detail/storyParts.test.tsx`
- Test: `src/pages/surveys/SurveysPage.test.tsx`, `src/pages/surveys/SurveysHome.test.tsx` (one more case each)

**Interfaces:**
- Consumes: `Survey.send_id` (added in Task 2); `stubSurveys` (its `LOGGED` row 2 has `send_id: 3`).
- Produces: `SurveysPage({ embedded?: boolean })`. Standalone (the default) it renders exactly as today, so its existing tests stand. Embedded it drops its own `h1` and outer padding, and its organisation picker keeps `tab=logged`.

- [ ] **Step 1: Write the failing tests**

Add to `src/pages/surveys/SurveysPage.test.tsx`, inside `describe('SurveysPage (/surveys)', …)`:

```tsx
  it('keeps a score a sent survey wrote read-only: no Mark Expired, Edit or Delete, a link to its send instead', async () => {
    const fromSend = { ...sentNps, id: 3, send_id: 12, companies: [{ id: 7, name: 'Pizza Hut' }] };
    vi.stubGlobal('fetch', makeFetchMock({ surveys: [respondedCsat, fromSend] }));
    renderPage();
    const link = await screen.findByRole('link', { name: 'From a sent survey' });
    expect(link).toHaveAttribute('href', '/surveys/12');
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).queryByTitle('Mark Expired')).toBeNull();
    expect(within(row).queryByTitle('Edit')).toBeNull();
    expect(within(row).queryByTitle('Delete')).toBeNull();
    const byHand = screen.getAllByRole('row').find((candidate) => candidate.textContent?.includes('WeWork')) as HTMLElement;
    expect(within(byHand).getByTitle('Edit')).toBeInTheDocument();
    expect(within(byHand).getByTitle('Delete')).toBeInTheDocument();
  });
```

Add to `src/pages/surveys/SurveysHome.test.tsx`, inside its `describe`:

```tsx
  it('shows Logged scores without a second heading, keeps the tab when the organisation filter clears, and links sent rows to their send', async () => {
    stubSurveys();
    renderSurveys('/surveys?customer=6');
    await screen.findByRole('button', { name: /Log Survey/ });
    expect(screen.queryByRole('heading', { level: 1, name: 'Surveys' })).toBeNull();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Organization' }), '');
    expect(where()).toBe('/surveys?tab=logged');
    expect(screen.getByRole('tab', { name: 'Logged scores' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: 'From a sent survey' })).toHaveAttribute('href', '/surveys/3');
  });
```

In `src/components/accounts/detail/storyParts.test.tsx`, replace

```tsx
  it('Feedback links to the Surveys page, unfiltered', async () => {
```

with

```tsx
  it('Feedback links to the Logged scores tab, unfiltered', async () => {
```

and in that test replace `toHaveAttribute('href', '/surveys')` with `toHaveAttribute('href', '/surveys?tab=logged')`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/surveys/SurveysPage.test.tsx src/pages/surveys/SurveysHome.test.tsx src/components/accounts/detail/storyParts.test.tsx`
Expected: FAIL: no "From a sent survey" link; the embedded page still has its `h1`; the organisation picker drops `tab`; the account's link is still `/surveys`.

- [ ] **Step 3: Change the page, the tab and the link**

In `src/pages/surveys/SurveysPage.tsx`:

1. Replace `import { useNavigate, useSearchParams } from 'react-router-dom';` with:

```tsx
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
```

2. Replace `export function SurveysPage() {` with:

```tsx
/** `embedded`: the Logged scores tab of /surveys (surveys spec §2.1), which
 *  draws the page's heading and padding itself, and whose `?tab=logged`
 *  the organisation picker keeps. */
export function SurveysPage({ embedded = false }: { embedded?: boolean } = {}) {
```

3. Replace

```tsx
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-ink tracking-tight">Surveys</h1>
```

with

```tsx
    <div className={embedded ? 'flex flex-col w-full gap-6' : 'flex flex-col h-full w-full overflow-y-auto p-6 gap-6'}>
      <div className="flex items-center justify-between">
        <div>
          {embedded ? null : <h1 className="text-[20px] font-bold text-ink tracking-tight">Surveys</h1>}
```

4. Replace

```tsx
          onChange={(e) => setSearch(e.target.value ? { customer: e.target.value } : {})}
```

with

```tsx
          onChange={(e) => {
            // Inside the tabs the filter stays on Logged scores.
            const tab: Record<string, string> = embedded ? { tab: 'logged' } : {};
            setSearch(e.target.value ? { ...tab, customer: e.target.value } : tab);
          }}
```

5. Replace

```tsx
                      <div className="flex items-center justify-end gap-1">
                        {survey.status === 'sent' && (
```

with

```tsx
                      <div className="flex items-center justify-end gap-1">
                        {survey.send_id ? (
                          // A sent survey's score updates itself; the backend
                          // refuses edits and deletes (backend Decision 28).
                          <Link
                            to={`/surveys/${survey.send_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex min-h-11 items-center rounded-md px-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            From a sent survey
                          </Link>
                        ) : (
                        <>
                        {survey.status === 'sent' && (
```

and replace

```tsx
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
```

with

```tsx
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        </>
                        )}
                      </div>
```

(Re-indent the three buttons between `<>` and `</>` by two spaces so the block reads cleanly; the repo has no formatter.)

In `src/pages/surveys/SurveysHome.tsx`, replace `{tab === 'sends' ? <SendsTab /> : <SurveysPage />}` with:

```tsx
          {tab === 'sends' ? <SendsTab /> : <SurveysPage embedded />}
```

In `src/components/organizations/detail/StoryTab.tsx`, replace

```tsx
          <Link to={scope.kind === 'organization' ? `/surveys?customer=${scope.id}` : '/surveys'} className={`${QUIET} border border-line`}>
```

with

```tsx
          <Link to={scope.kind === 'organization' ? `/surveys?customer=${scope.id}` : '/surveys?tab=logged'} className={`${QUIET} border border-line`}>
```

(`/surveys?customer=` already opens Logged scores, plan Decision 4.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/surveys/SurveysPage.test.tsx src/pages/surveys/SurveysHome.test.tsx src/components/accounts/detail/storyParts.test.tsx src/pages/organizations/Details.test.tsx`
Expected: PASS (every existing SurveysPage, story and organisation-page case still passes; `/surveys?customer=7` is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/pages/surveys/SurveysPage.tsx src/pages/surveys/SurveysPage.test.tsx src/pages/surveys/SurveysHome.tsx src/pages/surveys/SurveysHome.test.tsx src/components/organizations/detail/StoryTab.tsx src/components/accounts/detail/storyParts.test.tsx
git commit -m "feat(surveys): Logged scores as a tab; a sent survey's scores are read-only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Routes, the framed bar, and Survey these

Spec §2.1 ("a child route as the segment builder"), §2.4 (outside the guard: done in Task 5), §2.5; plan Decision 1.

**Files:**
- Modify: `src/App.tsx`, `src/components/layout/Navbar.tsx`, `src/components/segments/SegmentHeader.tsx`, `src/pages/surveys/SurveyBuilder.tsx` (add `SurveySegmentRoute`), `src/pages/surveys/testPages.tsx` (the segment routes)
- Test: `src/components/layout/Navbar.test.tsx` (one more `describe`), `src/pages/surveys/surveyThese.test.tsx`

**Interfaces:**
- Consumes: `NewSurveyModal` (Task 12); `SegmentOutlet` (`pages/segments/Builder`); `SegmentPage`, `EditSegmentRoute`; `SurveysHome` (Task 9), `SendPage` (Task 10), `NewSurveyRoute`, `EditSurveyRoute` (Task 12).
- Produces: `SurveySegmentRoute()` (`/segments/:id/survey`); routes `/surveys`, `/surveys/new`, `/surveys/:id`, `/surveys/:id/edit`, `/segments/:id/survey` in `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/layout/Navbar.test.tsx`, after the `describe('Navbar on Segments …')` block:

```tsx
describe('Navbar on Surveys (surveys spec 2026-10-03 §2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('wears the framed bar on /surveys: "Surveys", the actions slot, no avatar', () => {
    const setSlot = vi.fn();
    renderNavbar('/surveys', null, null, [], setSlot);
    expect(document.querySelector('header')).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    expect(screen.getByRole('heading', { name: 'Surveys' })).toBeInTheDocument();
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });

  it.each(['/surveys/new', '/surveys/3', '/surveys/3/edit'])('leads back to Surveys from %s, in the same frame', (url) => {
    renderNavbar(url);
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Surveys' });
    expect(back).toHaveAttribute('href', '/surveys');
    expect(document.querySelector('header')).toHaveClass('h-16', 'px-4');
  });

  it("leads back to Segments from a segment's Survey these", () => {
    renderNavbar('/segments/7/survey');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Segments' })).toHaveAttribute('href', '/segments');
  });
});
```

`src/pages/surveys/surveyThese.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderSurveys } from './testPages';

const where = () => screen.getByTestId('where').textContent;

describe('Survey these (spec §2.5)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("sits beside Export CSV on the owner's segment, and not on someone else's", async () => {
    stubSurveys();
    const first = renderSurveys('/segments/7');
    const link = await screen.findByRole('link', { name: 'Survey these' });
    expect(link).toHaveAttribute('href', '/segments/7/survey');
    expect(screen.getByRole('button', { name: 'Export CSV' }).compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    first.unmount();
    renderSurveys('/segments/8');
    expect(await screen.findByRole('heading', { level: 1, name: 'EMEA accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Survey these' })).toBeNull();
  });

  it('opens the New survey modal over the segment with that segment chosen, counts it, and Cancel returns to it', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/segments/7');
    await userEvent.click(await screen.findByRole('link', { name: 'Survey these' }));
    const modal = await screen.findByRole('dialog', { name: 'New survey' });
    expect(where()).toBe('/segments/7/survey');
    expect(screen.getByRole('heading', { level: 1, name: 'Renewal risk' })).toBeInTheDocument();
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Renewal risk'));
    expect(within(modal).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    await waitFor(() => expect(modal.querySelector('[data-part="reach"]')).toHaveTextContent('3 people at 3 organisations'));
    expect(requestsOf(spy, 'POST', /audience\/$/)[0].body).toEqual({ segment: 7, roles: ['champion', 'decision_maker'] });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/segments/7'));
  });

  it("tells a reader who doesn't own the segment that only its owner can survey it", async () => {
    stubSurveys();
    renderSurveys('/segments/8/survey');
    const modal = await screen.findByRole('dialog', { name: 'New survey' });
    expect(within(modal).getByText('Only Carl CSM can survey this segment')).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: 'Open segment' })).toHaveAttribute('href', '/segments/8');
  });
});
```

- [ ] **Step 2: Route the segment page in the test helper**

In `src/pages/surveys/testPages.tsx`, add the imports

```tsx
import { EditSegmentRoute } from '../segments/Builder';
import { SegmentPage } from '../segments/SegmentPage';
```

change `import { EditSurveyRoute, NewSurveyRoute } from './SurveyBuilder';` to `import { EditSurveyRoute, NewSurveyRoute, SurveySegmentRoute } from './SurveyBuilder';`, and directly above `<Route path="*" element={<Where />} />` add:

```tsx
            <Route
              path="/segments/:id"
              element={
                <>
                  <SegmentPage />
                  <Where />
                </>
              }
            >
              <Route path="edit" element={<EditSegmentRoute />} />
              <Route path="survey" element={<SurveySegmentRoute />} />
            </Route>
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/layout/Navbar.test.tsx src/pages/surveys/surveyThese.test.tsx`
Expected: FAIL: "SurveySegmentRoute" is not exported; the bar on `/surveys` is the plain one; there is no "Survey these" link.

- [ ] **Step 4: Write Survey these and its route**

Append to `src/pages/surveys/SurveyBuilder.tsx`, adding `import type { SegmentOutlet } from '../segments/Builder';` to its imports:

```tsx
/** /segments/:id/survey (spec §2.5, plan Decision 1): Survey these, the
 *  New survey modal over the segment's page with that segment chosen. The
 *  owner's only, as a survey goes to the sender's own segment. */
export function SurveySegmentRoute() {
  const navigate = useNavigate();
  const { segment } = useOutletContext<SegmentOutlet>();
  const close = () => navigate(`/segments/${segment.id}`);
  if (!segment.is_owner) {
    return (
      <BuilderDialog title="New survey" onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${segment.owner.name} can survey this segment`}
            detail="A survey goes to the sender's own segment. Duplicate it to survey your own copy."
            action={
              <Link to={`/segments/${segment.id}`} className={`${QUIET} border border-line`}>
                Open segment
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  return <NewSurveyModal segmentId={segment.id} onClose={close} />;
}
```

In `src/components/segments/SegmentHeader.tsx`, change the Lucide import to

```tsx
import { Copy, Download, Pencil, Send, Trash2 } from 'lucide-react';
```

and directly after the Export CSV `</button>` (before `{segment.is_owner ? (` that holds Delete), add:

```tsx
          {segment.is_owner ? (
            // Surveys spec §2.5: a survey goes to the sender's own segment.
            <Link to={`/segments/${segment.id}/survey`} className={BUTTON}>
              <Send className="h-4 w-4" aria-hidden="true" />
              Survey these
            </Link>
          ) : null}
```

- [ ] **Step 5: Frame the bar**

In `src/components/layout/Navbar.tsx`, replace

```tsx
  const isSegments = /^\/segments\/?$/.test(location.pathname);
  const isSegmentPage = /^\/segments\/[^/]+(\/edit)?\/?$/.test(location.pathname);
  const isFramed = isDashboard || isOrgView || isOrgDetail || isContacts || isAccountsView || isAccountDetail || isPipelinesView || isSegments || isSegmentPage;
```

with

```tsx
  const isSegments = /^\/segments\/?$/.test(location.pathname);
  // Survey these opens the survey modal over the segment (/segments/:id/survey).
  const isSegmentPage = /^\/segments\/[^/]+(\/edit|\/survey)?\/?$/.test(location.pathname);
  // Surveys wear the same frame (surveys spec 2026-10-03 §2): "Surveys" on
  // the tabs page; on a send, its edit modal and a new one, the bar leads back.
  const isSurveys = /^\/surveys\/?$/.test(location.pathname);
  const isSurveyPage = /^\/surveys\/(new|\d+)(\/edit)?\/?$/.test(location.pathname);
  const isFramed =
    isDashboard || isOrgView || isOrgDetail || isContacts || isAccountsView || isAccountDetail || isPipelinesView || isSegments || isSegmentPage || isSurveys || isSurveyPage;
```

and replace the line `        {isSegmentPage ? (` with

```tsx
        {isSurveyPage ? (
          <nav aria-label="Breadcrumb" className="flex items-center h-full">
            <Link
              to="/surveys"
              className="-ml-2 inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Surveys
            </Link>
          </nav>
        ) : isSurveys ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Surveys</h1>
          </div>
        ) : isSegmentPage ? (
```

- [ ] **Step 6: Route it all in `App.tsx`**

In `src/App.tsx`:

1. Replace `import { SurveysPage } from './pages/surveys/SurveysPage';` with:

```tsx
import { SendPage } from './pages/surveys/SendPage';
import { EditSurveyRoute, NewSurveyRoute, SurveySegmentRoute } from './pages/surveys/SurveyBuilder';
import { SurveysHome } from './pages/surveys/SurveysHome';
```

2. Replace

```tsx
            <Route path=":id" element={<SegmentPage />}>
              <Route path="edit" element={<EditSegmentRoute />} />
            </Route>
```

with

```tsx
            <Route path=":id" element={<SegmentPage />}>
              <Route path="edit" element={<EditSegmentRoute />} />
              {/* Survey these (surveys spec §2.5): the survey modal over the segment. */}
              <Route path="survey" element={<SurveySegmentRoute />} />
            </Route>
```

3. Replace `          <Route path="surveys" element={<SurveysPage />} />` with:

```tsx
          {/* Surveys (spec 2026-10-03 §2): Sends and Logged scores, the New
              survey modal over the list, a send's page with its edit modal. */}
          <Route path="surveys">
            <Route element={<SurveysHome />}>
              <Route index element={null} />
              <Route path="new" element={<NewSurveyRoute />} />
            </Route>
            <Route path=":id" element={<SendPage />}>
              <Route path="edit" element={<EditSurveyRoute />} />
            </Route>
          </Route>
```

- [ ] **Step 7: Run the tests to verify they pass, then type-check**

Run: `npx vitest run --maxWorkers=2 src/components/layout/Navbar.test.tsx src/pages/surveys/surveyThese.test.tsx src/pages/segments/SegmentPage.test.tsx`
Expected: PASS (the Segments page cases unchanged; "Survey these" is a link, so their button lists stand).

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/components/segments/SegmentHeader.tsx src/pages/surveys/SurveyBuilder.tsx src/pages/surveys/surveyThese.test.tsx src/pages/surveys/testPages.tsx
git commit -m "feat(surveys): the routes, the framed bar, and Survey these on a segment

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The house rules, the journey, and the product documents

Spec §4 "Frontend" ("house rules; one e2e: build → send → answer on the hosted form → the send page and the organisation's score move"), §5.2 (docs); plan Decision 19.

**Files:**
- Modify: `src/test/houseRules.ts` (add `rowsIconsTargetsSuite`), `src/components/segments/houseRules.test.ts` (use it)
- Create: `src/components/surveys/houseRules.test.ts`, `src/e2e/surveys.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: everything above; `houseRuleSuite` (`src/test/houseRules.ts`).
- Produces: `rowsIconsTargetsSuite(title: string, files: Record<string, string>): void` (rows not tables, Lucide icons `aria-hidden`, a 44px target on every button, link, select and text control).

- [ ] **Step 1: Share Segments' extra checks**

Append to `src/test/houseRules.ts` (moved, unchanged, from `src/components/segments/houseRules.test.ts`):

```ts
// Style constants already proven 44px-compliant by the folders that define
// them (components/organizations/portfolio/styles.ts, filterParts.tsx), and
// already covered by their own house-rule suites. A file reaching for one of
// these needs no touch-target class of its own.
const KNOWN_COMPLIANT = ['BUTTON', 'PRIMARY', 'QUIET', 'COLUMN_ICON_BUTTON', 'FILTER_SELECT'];
const TARGET = /\bmin-h-11\b|\bmin-w-11\b|\bh-11\b[^`'"]*\bw-11\b|\bw-11\b[^`'"]*\bh-11\b/;
const CONST = /\bconst ([A-Z][A-Z0-9_]*)\s*=\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
const CONTROL_START = /<(button|select|textarea|input|Link)\b/g;

/** Every control tag's name and attribute text, scanning braces (not just
 *  the next `>`) so an `onClick={() => …}` arrow's own `>` does not end the
 *  tag early. */
function controlTags(source: string): { tag: string; attrs: string }[] {
  const tags: { tag: string; attrs: string }[] = [];
  for (const match of source.matchAll(CONTROL_START)) {
    const tag = match[1];
    const attrsStart = match.index + match[0].length;
    let depth = 0;
    let i = attrsStart;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
      i++;
    }
    tags.push({ tag, attrs: source.slice(attrsStart, i) });
  }
  return tags;
}

/** The expression inside a tag's `className={...}`, balancing the braces a
 *  template literal's `${…}` opens (a plain regex stops at the first `}`).
 *  `null` when the tag has no className at all. */
function classExpression(attrs: string): string | null {
  const plain = /className="([^"]*)"/.exec(attrs);
  if (plain) return plain[1];
  const start = attrs.indexOf('className={');
  if (start === -1) return null;
  let depth = 1;
  let i = start + 'className={'.length;
  let out = '';
  while (i < attrs.length && depth > 0) {
    const ch = attrs[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Every ALL_CAPS identifier referenced in an expression (a style constant
 *  or a `${…}` interpolation), ignoring the Tailwind classes around it. */
function identifiersIn(expression: string): string[] {
  return [...expression.matchAll(/\b[A-Z][A-Z0-9_]*\b/g)].map((match) => match[0]);
}

/** A file's own style constants that resolve to a 44px target, directly or
 *  by referencing an already-compliant one (fixed point: `SELECT` references
 *  `FILTER_SELECT`, so it is compliant without repeating the class). */
function localCompliance(source: string): Set<string> {
  const consts = [...source.matchAll(CONST)].map(([, name, value]) => [name, value] as const);
  const compliant = new Set(KNOWN_COMPLIANT);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, value] of consts) {
      if (compliant.has(name)) continue;
      if (TARGET.test(value) || identifiersIn(value).some((id) => compliant.has(id))) {
        compliant.add(name);
        grew = true;
      }
    }
  }
  return compliant;
}

/** Every button, link, select and text control in `source` that reaches no
 *  44px touch target on phones, directly or through a compliant constant. A
 *  checkbox or radio's target is its wrapping label, not the box itself. */
function controlsMissingTarget(source: string): string[] {
  const compliant = localCompliance(source);
  const offenders: string[] = [];
  for (const { tag, attrs } of controlTags(source)) {
    if (tag === 'input' && /\btype=["'](checkbox|radio|hidden)["']/.test(attrs)) continue;
    const expression = classExpression(attrs);
    const compliesDirectly = expression !== null && (TARGET.test(expression) || identifiersIn(expression).some((id) => compliant.has(id)));
    if (!compliesDirectly) offenders.push(`<${tag} ${attrs.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
  }
  return offenders;
}

/** Rows not tables, Lucide icons hidden from screen readers, and a 44px
 *  target on every button, link, select and text control (Ruling G18).
 *  First written for Segments; Surveys runs it too. */
export function rowsIconsTargetsSuite(title: string, files: Record<string, string>): void {
  const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));

  describe(title, () => {
    it('lays every list out as rows, never a table or grid', () => {
      expect(sources.filter(([, source]) => /<table|role="(table|grid)"/.test(source)).map(([file]) => file)).toEqual([]);
    });

    it('hides every Lucide icon from screen readers', () => {
      const offenders: string[] = [];
      for (const [file, source] of sources) {
        const icons = [...source.matchAll(/import \{([^}]+)\} from 'lucide-react'/g)].flatMap((m) => m[1].split(',').map((name) => name.trim()).filter(Boolean));
        for (const icon of icons) {
          for (const use of source.matchAll(new RegExp(`<${icon}\\b[^>]*>`, 'g'))) {
            if (!use[0].includes('aria-hidden')) offenders.push(`${file}: ${use[0]}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('gives every button, link, select and text control a 44px touch target on phones', () => {
      const offenders: string[] = [];
      for (const [file, source] of sources) {
        for (const bad of controlsMissingTarget(source)) offenders.push(`${file}: ${bad}`);
      }
      expect(offenders).toEqual([]);
    });
  });
}
```

Replace `src/components/segments/houseRules.test.ts` with:

```ts
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// Spec §3's house rules over the Segments components and pages.
const files = {
  ...(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../pages/segments/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
};

houseRuleSuite('segments house rules', files);
rowsIconsTargetsSuite('segments house rules beyond the shared suite', files);
```

Run: `npx vitest run --maxWorkers=2 src/components/segments/houseRules.test.ts src/test/houseRules.test.ts`
Expected: PASS, the same Segments checks as before under the same titles.

- [ ] **Step 2: Write the Surveys house rules**

`src/components/surveys/houseRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over the Surveys components and pages. Today's Logged
// scores page and its chart are kept as they were (spec §2.1), with their
// older habits, so they stay out.
const PRE_EXISTING = ['/SurveysPage.tsx', '/SurveyTrendChart.tsx'];
const all = {
  ...(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../pages/surveys/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
};
const files = Object.fromEntries(Object.entries(all).filter(([file]) => !PRE_EXISTING.some((name) => file.endsWith(name))));
const HOSTED = '../../pages/surveys/HostedForm.tsx';

houseRuleSuite('surveys house rules', files);
rowsIconsTargetsSuite('surveys house rules beyond the shared suite', files);

describe('the hosted form (spec §2.4)', () => {
  it('is light only: no dark: variant', () => {
    expect(files[HOSTED]).toBeDefined();
    expect(files[HOSTED]).not.toMatch(/\bdark:/);
  });

  it('never reads the session: no store hook, no auth slice', () => {
    expect(files[HOSTED]).not.toMatch(/useAppSelector|useAppDispatch|useSelector|authSlice/);
  });

  it('never renders markup from the server (spec §3: plain text)', () => {
    expect(Object.entries(files).filter(([, source]) => source.includes('dangerouslySetInnerHTML')).map(([file]) => file)).toEqual([]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/surveys/houseRules.test.ts`
Expected: PASS. If a check names a file, fix that file (the class, the icon's `aria-hidden`, the target), never the rule.

- [ ] **Step 3: Write the journey**

`src/e2e/surveys.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { requestsOf, stubSurveys } from '../features/surveys/testSurveys';
import { renderHosted, renderSurveys } from '../pages/surveys/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the segment's page,
// the Surveys pages, the hosted form, the store and the router. Only fetch is
// stubbed, by a stateful stub in the backend's contract shapes (spec §4:
// build → send → answer on the hosted form → the send page and the
// organisation's score move).
const where = () => screen.getByTestId('where').textContent;

describe('Surveys', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('surveys a segment, sends it, takes an answer on the hosted form, and the send page and the logged score move', { timeout: 30000 }, async () => {
    const { spy, tokensOf } = stubSurveys();

    // 1. Survey these on the owner's contact segment: the modal opens over it.
    const team = renderSurveys('/segments/9', { nav: true });
    await userEvent.click(await screen.findByRole('link', { name: 'Survey these' }));
    const modal = await screen.findByRole('dialog', { name: 'New survey' });
    expect(where()).toBe('/segments/9/survey');
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Champions'));

    // 2. Build: a name, NPS as chosen; who it reaches comes from the server.
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion NPS');
    await waitFor(() => expect(modal.querySelector('[data-part="reach"]')).toHaveTextContent('2 people at 2 organisations'));

    // 3. Send, confirming the server's count; the send's page opens.
    await userEvent.click(within(modal).getByRole('button', { name: 'Send to 2 people…' }));
    expect(await within(modal).findByRole('heading', { name: 'Send Champion NPS now?' })).toBeInTheDocument();
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(within(await screen.findByRole('group', { name: 'Answered' })).getByText('0')).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/100\/send\/$/)).toHaveLength(1);
    team.unmount();

    // 4. A customer opens their link: no app frame, no session.
    const [token] = tokensOf(100);
    const customer = renderHosted(token);
    expect(await screen.findByRole('heading', { level: 1, name: 'How likely are you to recommend Acme Inc to a friend or colleague?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '9' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Anything to add/ }), 'Always quick to help');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Thanks, your answer was recorded.' })).toBeInTheDocument();
    customer.unmount();

    // 5. The send's page moved: one answer of two, a promoter, the comment.
    renderSurveys('/surveys/100', { nav: true });
    expect(within(await screen.findByRole('group', { name: 'Answered' })).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Response rate' })).getByText('50%')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'NPS' })).getByText('+100')).toBeInTheDocument();
    expect(await screen.findByText('Always quick to help')).toBeInTheDocument();

    // 6. Back through the bar: the send leads the list, and Logged scores
    // carry its row for the organisation, read-only.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Surveys' }));
    await waitFor(() => expect(where()).toBe('/surveys'));
    expect(await screen.findByRole('link', { name: 'Champion NPS' })).toHaveAttribute('href', '/surveys/100');
    await userEvent.click(screen.getByRole('tab', { name: 'Logged scores' }));
    const links = await screen.findAllByRole('link', { name: 'From a sent survey' });
    const row = links.find((link) => link.getAttribute('href') === '/surveys/100')?.closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('Pizza Hut');
    expect(row).toHaveTextContent('100');
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/e2e/surveys.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 4: Update the product documents**

`docs/03-ui-ux-design.md`: insert directly above `### Overlays`:

```markdown
### Surveys

Spec `docs/superpowers/specs/2026-10-03-surveys-design.md` §2 (plan
`docs/superpowers/plans/2026-10-03-surveys-frontend.md`). The pages sit in
`OrganizationsFrame` under the framed bar ("Surveys", or "‹ Surveys" on a
send, its edit modal and a new one).

- **`/surveys`, two tabs** (`DetailTabs`, `?tab=sends|logged`; `?customer=`
  alone opens Logged scores).
  - **Sends:** **New survey**, then one rounded row per send (`SendRow`): the
    name with its type chip (`TypeChip`, DM Mono), Draft and Workspace/Shared
    badges; the segment, date and sender under it; "31 of 42 answered · 74%"
    in DM Mono, or "Not sent" for a draft. The empty state explains a survey
    and offers New survey; a failed reload keeps the last list beside the
    error.
  - **Logged scores:** the page as it was (Log Survey, the rollups, the trend
    chart, the table), without its own heading inside the tabs. A row a sent
    survey wrote shows "From a sent survey", a link to the send, instead of
    Mark Expired, Edit and Delete.
- **New survey: the segment builder's modal** (`BuilderDialog`) over the Sends
  list (`/surveys/new`), over a send's page (`/surveys/:id/edit`) or over a
  segment's page (`/segments/:id/survey`, Survey these).
  - **Left, split by dividers:** Name; Type as three icon tiles (`RadioTile`:
    NPS, CSAT, CES) with a hint; Email subject (filled with "A quick question
    from {workspace}"); Intro line (optional, a DM Mono count of 500);
    **Audience** (`AudienceFields`): the caller's own segments in a select
    grouped by kind and, for organisations and accounts, role checkboxes
    (Champion and Decision Maker ticked) with "Up to 3 people per organisation
    or account, in the order you tick the roles."; **Sharing**
    (`SharingFields`, with the survey's own note).
  - **Right, pinned from `lg`:** the preview (`SurveyPreview`, a muted block):
    the email line for line, then the form with the mark, the question and the
    score row as a picture. Under it **Who it reaches** (`AudienceSummary`):
    "42 people at 18 organisations" (the count at 22px), the skips, "N in the
    segment you can't open aren't included", and why it can't be sent.
  - **Footer:** the reason Send is off, then Cancel, Save draft and **Send to N
    people…**. Send saves the draft, asks for the count again and swaps the
    body for the confirm ("Send {name} now?", the count, the 14-day link) with
    Back and Send now. Refusals show at their fields; a limit or a 403 above
    the form.
  - After the send the modal holds only Name and Sharing, with a line saying
    why. Anyone but the owner reads "Only {owner} can edit this survey".
- **Send (`/surveys/:id`).**
  - **Header** (`SendHeader`): the name at 22px; the type chip, Draft, and "to
    {segment}" (a link only when the reader may open it); then "Sent 3 Oct
    2026 · By you · Shared with the workspace". Edit for the owner; Delete for
    the owner of a draft (`ConfirmDialog`).
  - **Tiles** (`SendTiles`): Sent, Answered, Response rate, the figure (NPS
    signed, CSAT and CES in percent, with what it counts) and Bands. The owner
    also reads the frozen counts in a line under them.
  - **Answers** (`AnswersSection`): All / Detractors (Low scores for CSAT and
    CES) / With comments as a switch (`?answers=`); rows of a score chip
    (tinted by band, the band named for screen readers), the person and the
    record as links, the date and the comment as plain text; Show more
    answers; "N more answers from people you can't open".
  - **Not answered** (`NotAnswered`): a closed disclosure; opened, rows of who,
    where, and "Link expires 17 Oct 2026", "Link expired" or "Not delivered:
    {reason}" in the danger colour.
  - A draft shows "Not sent yet" with Edit and send instead.
- **Hosted form (`/s/:token`).** No app frame, light only whatever the
  setting (`lib/theme.ts`). The mark with the wordmark, then one bordered
  panel: the intro, the question as the page's heading, the score buttons
  (`ScaleButtons`: 44px radios that wrap on phones, the end labels under the
  first and last), "Anything to add? (optional)" with a count of 2000, and
  Submit. Then "Thanks, your answer was recorded." Every bad link reads "This
  link has expired."; a throttled one says to wait a minute.
- **Survey these** sits on a segment's page beside Export CSV, for its owner.
```

`docs/04-app-flow.md`:

1. In the route tree, replace `├── /login, /auth/callback, /forgot-password, /reset-password   (public, no shell)` with `├── /login, /auth/callback, /forgot-password, /reset-password, /s/:token   (public, no shell)`.
2. In the routes table, add below the `/auth/callback` row:

```markdown
| `/s/:token` | `HostedForm`: the one-time survey form from a customer's email. No shell, no session (no `Authorization` header, no token refresh), light only. `GET`/`POST /public/surveys/<token>/`; every 404 reads "This link has expired." | public |
```

3. Replace the `| \`/surveys\` (…) | \`SurveysPage\` | auth |` row with:

```markdown
| `/surveys`, `/surveys/new`, `/surveys/:id`, `/surveys/:id/edit`, `/segments/:id/survey` | `SurveysHome` (Sends; Logged scores is `SurveysPage`, `?tab=logged`, or `?customer=<id>` alone), the modal (`NewSurveyRoute`, `EditSurveyRoute`, `SurveySegmentRoute` in `SurveyBuilder.tsx`), `SendPage` (`pages/surveys/`). See 4.5i | auth |
```

4. Insert directly above `### 4.6 Copilot and multiplayer sessions`:

```markdown
### 4.5i Surveys

Spec `docs/superpowers/specs/2026-10-03-surveys-design.md`. A send asks one
standard question (NPS, CSAT or CES) of the people at the builder's own
segment, by email, as a one-time link to `/s/<token>`.

1. **List.** `/surveys` → `GET /surveys/sends/` (unpaginated, newest first).
   `?tab=logged`, or `?customer=<id>` alone, shows Logged scores: `GET
   /surveys/` as before. A row with `send_id` links to its send and offers no
   edit or delete (the backend refuses them: 400 and 409).
2. **Build.** `/surveys/new` (over the list), `/surveys/<id>/edit` (over the
   send) or `/segments/<id>/survey` (Survey these, over the segment, with it
   chosen).
   - The segments offered are the caller's own (`GET /segments/?scope=mine`).
   - Who it reaches: `POST /surveys/sends/audience/ {segment, roles}` 400 ms
     after the last change, latest wins. Roles go only with organisation and
     account segments; Champion and Decision Maker are ticked by default.
   - **Save draft:** `POST /surveys/sends/`, later `PATCH
     /surveys/sends/<id>/` with only what changed; opens `/surveys/<id>`.
   - **Send:** saves the draft, asks the count again, shows the confirm, then
     `POST /surveys/sends/<id>/send/` and opens `/surveys/<id>`. A 400 lands at
     its field; 403, 409 and 429 above the form.
   - After the send, Edit offers only the name and sharing.
3. **Read a send.** `/surveys/<id>` → `GET /surveys/sends/<id>/` (a 404 for
   one not shared reads "Survey not found"), then `GET
   …/answers/?filter=&cursor=` (the page keeps `?answers=`; Show more passes
   the server's cursor) and, once Not answered is opened, `GET …/pending/`.
   A draft's owner can delete it (`DELETE /surveys/sends/<id>/`).
4. **Answer.** `/s/<token>`: `GET /public/surveys/<token>/`, then `POST
   {score, comment?}` (204) and "Thanks, your answer was recorded." Every 404,
   on either call, is the one expired page; a 429 says to wait.
```

`.agents/workflows/repo-architecture.md`:

1. Below the `│   │   ├── segments/           ← Segments: types, API, …` line under `features/`, add:

```
│   │   ├── surveys/            ← Surveys: types, API (the public pair sent without a session), the question per type and its bands, display text, refusals at fields, URL state; testSurveys.ts (stubSurveys)
```

2. Below the `│   │   ├── segments/           ← the rule editor and value inputs, …` line under `components/`, add:

```
│   │   ├── surveys/            ← score buttons, audience fields and count, preview, send row, header, tiles, Answers, Not answered
```

3. Below the `│       ├── segments/           ← SegmentsList, Builder, SegmentPage` line under `pages/`, add:

```
│       ├── surveys/            ← SurveysHome (Sends, and Logged scores = SurveysPage), SurveyBuilder, SendPage, HostedForm (/s/:token, public)
```

4. In the route tree, replace

```
└── segments/
    ├── (layout: SegmentsList — GET /segments/, scope and search in the URL)
    │   ├── (index)
    │   └── new                → NewSegmentRoute (the builder modal over the list)
    └── :id                    → SegmentPage (?tab=members|changes)
        └── edit               → EditSegmentRoute (the builder modal over the page; owner,
                                 a read-only notice for anyone else)
```

with

```
├── segments/
│   ├── (layout: SegmentsList — GET /segments/, scope and search in the URL)
│   │   ├── (index)
│   │   └── new                → NewSegmentRoute (the builder modal over the list)
│   └── :id                    → SegmentPage (?tab=members|changes)
│       ├── edit               → EditSegmentRoute (the builder modal over the page; owner,
│       │                        a read-only notice for anyone else)
│       └── survey             → SurveySegmentRoute (Survey these: the survey modal, the segment chosen)
└── surveys/
    ├── (layout: SurveysHome — ?tab=sends|logged; Logged scores is SurveysPage)
    │   ├── (index)
    │   └── new                → NewSurveyRoute (the survey modal over the list)
    └── :id                    → SendPage (?answers=detractors|comments)
        └── edit               → EditSurveyRoute (a draft whole; after the send name and sharing;
                                 a notice for anyone but the owner)

Outside the guard and the shell: /s/:token → HostedForm (public, no session, light only).
```

5. After the `### 11. Segments (pages/segments/)` section (before its `---`), add:

```markdown
### 12. Surveys (`pages/surveys/`)

One standard question (NPS, CSAT or CES) emailed to the people at the
builder's own segment, each with a one-time link to the public form at
`/s/:token` (spec `docs/superpowers/specs/2026-10-03-surveys-design.md`), on
backend `services/surveys`. `/surveys` holds Sends and Logged scores (today's
`SurveysPage`, embedded; rows a send wrote are read-only); the builder is the
segment builder's modal (`BuilderDialog`, `RadioTile`, `SharingFields` with its
new `note`); the send page has tiles, Answers and Not answered; Survey these
sits on a segment's page. The hosted form reads no store and calls the API
with `accessToken: null, skipAuthRetry: true`; `lib/theme.ts` keeps it light.
See `docs/03-ui-ux-design.md` "Surveys".
```

6. In "Known Stubs / Not Yet Implemented", replace `| \`/projects\`, \`/surveys\`, \`/campaigns\`, \`/canvas\` | No route defined |` with `| \`/projects\`, \`/campaigns\`, \`/canvas\` | No route defined |`.

- [ ] **Step 5: Commit**

```bash
git add src/test/houseRules.ts src/components/segments/houseRules.test.ts src/components/surveys/houseRules.test.ts src/e2e/surveys.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): build, send and answer a survey; house rules and docs for Surveys

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Final verification, the browser check, and finishing the branch

Spec §5.2 ("Browser check in both themes (the hosted form in light), at 1440 and 375px"). Skills: `verification-before-completion`, then `finishing-a-development-branch`.

**Files:** none new; fixes only where a check fails.

- [ ] **Step 1: Everything Surveys touched, then the whole suite**

Run, one at a time:

```bash
npx vitest run --maxWorkers=2 src/features/surveys src/components/surveys src/pages/surveys src/e2e/surveys.test.tsx src/lib/theme.test.ts
npx vitest run --maxWorkers=2 src/components/segments src/pages/segments src/e2e/segments.test.tsx src/components/layout src/components/accounts/detail/storyParts.test.tsx src/pages/organizations/Details.test.tsx src/test
npx vitest run --maxWorkers=2
```

Expected: every file passes. A failure is fixed in its own task's files (TDD: reproduce it in a test first) and committed as `fix(surveys): …`.

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: no lint errors; `tsc -b` and `vite build` succeed.

- [ ] **Step 3: The browser check (needs the backend PR merged and running)**

Run the backend (`revenact-backend` `feat/surveys`, migrated and seeded) and `npm run dev`. With a signed-in owner of at least one organisation and one contact segment, check at 1440px in light, 1440px in dark and 375px in light:
- `/surveys`: the tabs, the rows, the empty state (a user with none), Logged scores with a send-written row read-only.
- New survey: the type tiles, the caps' counts, the segment select grouped by kind, the roles for an organisation segment only, the preview, the count within about half a second of each change, Send disabled with its reason for 0 people, the confirm, the send.
- `/surveys/:id`: the header, tiles, Answers (filters, Show more with more than 50), Not answered; a teammate's view of a shared send (no counts line, the hidden count).
- The emailed link (from the backend's console email backend) at 375px in a signed-out private window **and** in a window signed in with dark mode on: light both times, the buttons wrapping onto two rows for NPS, Submit, Thanks; the link again: "This link has expired."
- A segment's page: Survey these beside Export CSV (owner), the modal with the segment chosen.

Fix anything found in its task's files, with a test, and commit as `fix(surveys): …`.

- [ ] **Step 4: Finish the branch**

Use `finishing-a-development-branch`. Do not push from this plan: the owner merges the backend PR first (spec §5), then opens this one.

---

## Self-review

**Spec coverage.**

| Spec | Task |
|---|---|
| §2.1 two tabs `?tab=sends|logged`, Sends first | 9 (tabs), 3 (`surveysTab`), 13 (`?customer=` and the picker) |
| §2.1 rows: name, type chip, segment, sent date, "31 of 42 answered · 74%" in DM Mono, Draft | 9 (`SendRow`) |
| §2.1 New survey → `/surveys/new`, a child route as the segment builder | 9 (Outlet), 12 (`NewSurveyRoute`), 14 (`App.tsx`) |
| §2.1 empty state explains a survey, offers New survey | 9 |
| §2.1 Logged scores unchanged | 13 (embedded only; send rows read-only per backend Decision 28) |
| §2.2 `BuilderDialog`; name; type as three `RadioTile`s; subject; intro | 12 |
| §2.2 the owner's segments grouped by kind; roles for organisation/account with Champion and Decision Maker ticked; "up to 3 people per organisation" | 7, 12 |
| §2.2 Sharing (`SharingFields`) | 12 (with `note`) |
| §2.2 preview of the email and the form | 8, 4 (the scale picture) |
| §2.2 the audience 400 ms after the last change, latest wins; reach, skips, hidden | 6, 12 |
| §2.2 Cancel, Save draft, Send to N people…, confirm with the server's count, 0 people disabled with the reason, errors at fields | 12, 3, 1 (`sendBlocker`) |
| §2.2 `/surveys/:id/edit` for drafts | 12 |
| §2.3 header (name, type, segment, sent date, sender; owner Edit, name and sharing only after the send) | 10, 12 (`RenameForm`) |
| §2.3 tiles (sent, answered, rate, figure, bands) | 10 |
| §2.3 Answers: person, organisation, score chip, comment, date, newest first; All / Detractors / With comments; hidden count | 11 |
| §2.3 Not answered: collapsed, expiry, failed with reason | 11 |
| §2.4 public route outside the frame and the guard; never reads the session | 5 (route, `NO_SESSION`), 15 (house rule) |
| §2.4 mark, question with the name, one row of 44px buttons wrapping on phones, NPS end labels, comment, Submit, Thanks, one expired page, light only, tokens only | 4, 5, 15 |
| §2.5 Survey these beside Export, owner only, the segment chosen | 14 |
| §3 audience from the server at preview and send; answers through visibility plus a count; public reveals the name and question only; comment as plain text | 6/12 (server counts only), 11 (hidden counts), 5 (public payload only), 8/11/15 (plain text, no `dangerouslySetInnerHTML`) |
| §4 Frontend: tabs; modal (type, counts, roles, confirm, errors, 0 people); send page (tiles, filters, hidden, not answered); hosted form (each type, validation, thanks, expired); Survey these; house rules; one e2e | 9; 12; 10, 11; 5; 14; 15; 15 |
| §5.2 docs, browser check both themes (hosted form light) at 1440 and 375 | 15, 16 |

**Placeholder scan.** Every code step has its code and every test step its test; no "TBD", "similar to Task N" or "add validation". Every helper a task uses is defined in the task named in its Interfaces block (checked: `stubSurveys`'s `read`/`remove`/`answers`/`pending`/`publicLink`/`audience`/`create`/`sendNow`/`list`/`pageSize`, `sendPayload`, `requestsOf`, `renderSurveys`, `renderHosted`, `SendOutlet`, `NewSurveyModal`, `ReachLines`, `Lines`, `rowsIconsTargetsSuite`).

**Type consistency.** Names as defined, across tasks:
- `SurveySend`, `SendListRow`, `SendWrite`, `AudienceCounts`, `AnswersPage`, `PendingPage`, `PublicSurvey` (Task 1) in 2, 5, 6, 9–12;
- `useAudience(request: AudienceRequest | null): AudienceState` (6) in 12;
- `AudienceFields` props `segments, segmentsError, segmentId, fallback, roles, kind, errors, onSegment, onRoles` (7) in 12;
- `SurveyPreview({ type, subject, intro, workspace })` (8) in 12;
- `ScaleButtons({ type, value, onChange?, preview? })` (4) in 5, 8;
- `SendOutlet { send, onReplace }` (10) in 12;
- `NewSurveyModal({ segmentId?, onClose })` (12) in 14;
- `surveyErrors(err, fallback?)`, `answerErrors(err)`, `THROTTLED` (3) in 5, 6, 12;
- `answersFilter`, `withAnswersFilter`, `surveysTab` (3) in 9, 11;
- fixture ids: sends 3 (mine, sent), 4 (Carl's, shared), 5 (my draft), 6 (Dana's, 404); segments 7 (mine, organisations), 8 (Carl's, accounts), 9 (mine, contacts); the first created send is 100 and its links `tok-100-0`, `tok-100-1`.

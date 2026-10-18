# Scenarios v2: rules (frontend, delivery 3 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/scenarios` into two tabs (Rules, Canvas), add the rule builder modal (`/scenarios/rules/new`, `/scenarios/rules/:id/edit`, `/segments/:id/rule`), the rule page (`/scenarios/rules/:id`), the Review Queue's **From your rules** section (opened to every signed-in user) and **Automate** on a segment's page, all on the backend's `/api/v1/rules/…` endpoints.

**Architecture:**
- **`src/features/rules/` (new, pure, unit-tested):** the contract types (`ruleTypes.ts`), the choices, limits and the backend's own sentences (`ruleOptions.ts`), the rule as a sentence and every other line of display text (`ruleText.ts`), the builder's draft and its client checks (`ruleDraft.ts`), 400 bodies mapped to fields and to each action (`ruleErrors.ts`), the URL state (`ruleParams.ts`), the API (`ruleApi.ts`) and a stateful contract-shaped fetch stub (`testRules.ts`) that falls through to `stubSurveys`, then `stubSegments`. No Redux slice: like Segments and Surveys, pages read through small hooks.
- **`src/components/rules/` (new):** switches (a saved rule's `RuleSwitch` with the shared `ConfirmDialog`; the builder's `ConfirmedSwitch` with an in-place `InlineConfirm`), the list row, the builder's sections (`TriggerFields`, `ActionCards`/`ActionFields`, `TestPanel`), the rule page's header and nights, and the Review Queue's `RuleReviews`.
- **`src/pages/rules/` (new):** `RulesTab`, `RuleBuilder` (the modal routes, reusing Segments' `BuilderDialog`, `RadioTile`, `SharingFields`, `RuleSentence` and Surveys' `SurveyPreview`, `useMySegments`, and the `RoleFields`/`SegmentOptions` this plan extracts from `AudienceFields`), `RulePage`, test helpers. **`src/pages/scenarios/ScenariosHome.tsx` (new):** the tabs page; the Canvas tab renders today's `ScenariosList` unchanged.
- **`/brain/review` is opened to everyone** through a new `BrainRoutes` (descendant routes): only `review` sits outside the `view_all_accounts` gate, and the page shows the AI proposals only to that capability.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7, lucide-react, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-rules-design.md`. This plan covers §2 (frontend), §3 (privacy and safety, as it shows in the UI), §4 "Frontend" (testing) and §5 (the frontend PR, and the browser check against the local backend).

**The API contract** is the backend plan, `revenact-backend/docs/superpowers/plans/2026-10-04-rules-backend.md`: its Task 12 `docs/API_CONTRACTS.md` section `rules`, its Decisions 1–30, its validation sentences (Task 3) and its payload code (Tasks 4, 6, 10). The backend PR merges and deploys **before** this one. The frontend is built in parallel, so every test here runs against `stubRules` (Task 3), which mirrors that contract, never a live server.

**Branch:** `feat/rules` in `react-ts-app`, already checked out. It was cut before Surveys merged (PR #101), so while planning it was rebased onto `origin/main` (`aaaf672`): the spec commit now sits on top of Surveys, whose code this plan reuses. Stay on it. Do not push.

## Global Constraints

Quoted text is verbatim from the spec or the backend plan.

- **Shape (spec Decisions).** "Simple rules: one trigger, one to three actions. The canvas stays as it is, untouched; nothing is migrated." `ScenariosList`, `CreateScenario` and the rest of `src/pages/scenarios/` keep their code and their tests.
- **Timing.** "Nightly, in `run_health_maintenance`, after survey scores and segment changes are fresh." The schedule runs "in the server's time zone (UTC)" (backend contract).
- **Approvals.** "Customer-facing actions (send a survey) become items in the existing Review Queue, unless the rule says "send without review". Internal actions run automatically."
- **Actions.** "Send a survey, notify people, create a task, change a field (lifecycle stage only)." "Each action type may appear at most once per rule" (backend Decision 8).
- **Triggers.** "Entered or left one of my segments; a score crossed a line (CSAT, NPS, CES, health) for a record in one of my segments; on a schedule (weekly on a day, or monthly on the 1st) for everyone in one of my segments." "a contact segment is not allowed for `crossed`"; accounts have no CES ("Contacts have no scores; choose an organisation or account segment.", "Accounts have no CES; choose another score.").
- **Who builds.** "Anyone, on their own segments; a rule runs as its owner and touches only records its owner may open. Rules are shared like segments."
- **Limits (backend Task 1):** `name` ≤ 120; 1–3 actions; `cooldown_days` "1–365, default 30"; "up to 200 records a night" (`NIGHTLY_CAP = 200`); notify `message` ≤ 280 and `people` 1–50 active teammates; task `title` ≤ 200, `due_in_days` 0–90 (default 7), `assignee` `record_owner` (default) or `me`; survey `subject` ≤ 120 and `intro` ≤ 500; `shared_with` ≤ 50; "Limit: 50 rules per owner."; "Waiting reviews expire after 7 days."
- **Score ranges.** "CSAT and CES 0–100, NPS −100–100, health 0–10". `below` means strictly less, `above` strictly more (backend Decision 2).
- **Weekday.** "`weekday` 0–6, Monday = 0"; monthly runs "the 1st".
- **The action objects (backend Decision 8), sent and read exactly so:**
  - `{"action": "notify", "to": "me" | "record_owner" | "people", "people": [ids], "message": ""}` (`people` is `[]` unless `to` is `people`);
  - `{"action": "task", "title", "assignee": "record_owner" | "me", "due_in_days"}`;
  - `{"action": "lifecycle", "stage"}`;
  - `{"action": "survey", "survey_type", "subject", "intro", "roles", "without_review"}` (`roles` is `[]` for a contact segment and holds at least one role otherwise).
- **Rules start off.** "`is_active` Default `False`". "Rules are saved off; turning on (here or on the row) and ticking "Send without review" each confirm first." "Turning a rule on clears `paused_reason`."
- **Rules list (spec §2.1).** "a row per rule: its sentence ("When CSAT falls below 60 in *My book* → survey, notify me"), an on/off switch (owner only), the last run ("4 Oct · fired 3"), sharing. New rule. Empty state explains rules." `last_run` is `null` before the first night; "Its `fired` is `null`, and `waiting` false, for anyone but the owner."
- **Builder (spec §2.2).** "**When** [entered / left / score crosses / on a schedule] **in** [one of my segments]; then the score, direction and value, or the weekday / monthly." "**Then** one to three action cards: Notify (who, message), Create task (title, assignee, due in N days), Change lifecycle (stage), Send survey (type, roles, subject, intro, **Send without review** switch, off by default, with a warning)." "**Limits**: once per record every N days (default 30); up to 200 records a night." "**Test this rule**: the server's dry run ("4 organisations would match tonight: Pizza Hut, Initech…", hidden count, cooldown skips)." "**Sharing**; Save."
- **Test this rule (backend Decision 19, gap 5).** "`POST /api/v1/rules/test/` (rule body, no save)" with `name` optional and an optional `rule` id that "lends its stored scores and cooldowns"; it answers `{count, records: first 10 {kind, id, name}, hidden_count, skipped: {cooldown, cap, not_visible}}`, and "Nothing is written." The builder's copy says "would match if tonight's run happened now".
- **Rule page (spec §2.3).** "Header sentence, on/off, Edit, a paused notice when it switched itself off; nightly runs as rows ("4 Oct · fired 3 · skipped 2 · 1 waiting for review"), each opening its records (name, what each action did, why skipped), hidden count for shared viewers; cursor Show more." Nights are "20 a page, newest first", under an opaque `next` cursor.
- **Pause codes (backend Decision 20).** `segment_gone`: "Its segment was deleted."; `segment_not_owned`: "Its segment is no longer the owner's."; `owner_inactive`: "Its owner is no longer active.". The page reads `paused_message` from the server.
- **Review Queue (spec §2.4).** "A **From your rules** section above the AI proposals: each waiting review shows the rule, the trigger sentence, "6 people at 4 organisations" (the server's count), the survey preview (`SurveyPreview`), and Approve / Skip. Approve opens the new survey; a refusal shows on the item." Approve "returns `200 {"survey_send_id": 31}`"; a refusal is "400 with Surveys' own body, which is also stored on `result`" and "The review then stays waiting"; a decided review is "`409 {"detail": "This review has already been decided."}`"; anyone but the owner gets 404.
- **Surveys' 500-person limit (controller ruling, backend gap 4).** The survey action card says a night reaching more than 500 people is refused by Surveys and waits in the queue; the review item shows the refusal ("This survey would reach 612 people; the most is 500.").
- **Review Queue access (controller ruling, backend gap 1).** Only `/brain/review` opens to every signed-in user. Its **From your rules** section shows the viewer's own waiting reviews; the AI proposals, Ask the agent and every other `/brain` route stay behind `view_all_accounts` exactly as now.
- **From a segment (spec §2.5).** "A segment's page gets **Automate** beside Survey these (owner only), opening the rule builder with that segment chosen (`/segments/:id/rule`)."
- **Notifications.** New kinds `rule_fired` (linked to `/scenarios/rules/<id>?run=<run_id>` for a recipient who may read the rule, otherwise no link; also the "switched itself off" notice) and `rule_review` (linked to `/brain/review`).
- **Privacy (spec §3).** "Shared viewers see runs only for records they may open, plus a count. Only the owner decides reviews." A segment ref's `id` of `null` is never linked; a reader's night shows `fired` and `hidden_count` only (`matched`, `skipped`, `review` are `null`). Nothing renders server text as markup: never `dangerouslySetInnerHTML`.
- **Error bodies the UI maps (backend contract):**

  | Where | Status | Body | Shown at |
  |---|---|---|---|
  | save, test | 400 | `{"name": [...]}`, `{"segment": ["Choose a segment."]}`, `{"trigger": [...]}`, `{"score": [...]}`, `{"direction": [...]}`, `{"threshold": ["Choose a value from 0 to 100."]}`, `{"cadence": [...]}`, `{"weekday": [...]}`, `{"cooldown_days": [...]}`, `{"shared_with": ["Choose at least one teammate."]}` | that field |
  | save, test | 400 | `{"actions": ["Choose 1 to 3 actions."]}` or `["Each action can be used once per rule."]` | the actions list |
  | save, test | 400 | `{"actions": [{}, {"title": ["Give the task a title."]}]}` (aligned with `actions`; keys `action`, `to`, `people`, `message`, `title`, `assignee`, `due_in_days`, `stage`, `survey_type`, `subject`, `intro`, `roles`, `without_review`) | that action's field |
  | save, test | 403 | `{"detail": "A rule can only use your own segments."}` | the segment |
  | write | 403 | `{"detail": "Only the rule's owner can change it."}` | the form |
  | turn on | 400 | `{"segment": ["Choose a segment."]}` | under the switch |
  | 51st rule | 429 | `{"detail": "You can own at most 50 rules."}` | the form |
  | approve | 400 | Surveys' body, e.g. `{"segment": ["This survey would reach 612 people; the most is 500."]}`, `{"detail": "Email isn't set up for this workspace yet, so surveys can't be sent."}` | the review item |
  | approve, skip | 409 | `{"detail": "This review has already been decided."}` | the section's status line |
  | unreadable rule | 404 | identical to a missing one | "Rule not found" |
- **House rules (as Segments and Surveys).** Tokens only (no hex, `rgb()` or palette class); type at `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]` only; figures in `font-mono-brand tabular-nums` (`MONO`); a 44px target below `sm` on every control (`min-h-11 sm:min-h-9`, `h-11 w-11`, or the shared `BUTTON`/`PRIMARY`/`QUIET`/`FILTER_SELECT`, or a style constant defined in the same file); Lucide icons with `aria-hidden="true"`; rows, never `<table>`; no card inside a card; no glass; no `h-screen`; both themes; designed empty, loading and error states; labels above inputs and errors below; sentence-case copy; no added motion; layouts hold at 375px.
- **Tests** follow the `testing` skill: unit tests; integration tests on the real store and router with `fetch` stubbed by `stubRules`; one jsdom journey in `src/e2e/`; the house-rules suite over the new folders. Run Vitest as `npx vitest run --maxWorkers=2 <paths>`, one process at a time, only the files a task touches until Task 16. Every test must be able to fail, and its title claims only what it asserts.
- **Commits** are conventional (`feat(rules): …`, `refactor(surveys): …`, `test(e2e): …`, `docs(rules): …`) and end with a blank line and `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push.
- **Product documents** change in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 15).

## Decisions made while planning (the owner may overrule any)

1. **Folders.** The rule pages live in a new `src/pages/rules/`, not in `src/pages/scenarios/`. That folder holds the canvas, which the spec keeps unchanged with its older habits (a `<table>`, unhidden icons); a separate folder lets the house-rules suite glob the new pages whole without exempting canvas files one by one. The tabs page, `ScenariosHome`, belongs to `/scenarios` itself and sits in `src/pages/scenarios/`; the suite names it explicitly.
2. **Tabs.** `/scenarios` opens Rules; `?tab=canvas` opens Canvas; any other value reads as Rules. The Canvas tab renders `ScenariosList` exactly as it is (its own heading and Create Scenario). The canvas builder routes (`/scenarios/create`, `/scenarios/:id`) keep the full-canvas, no-Navbar treatment.
3. **No scope switch or search on the Rules tab** (the spec lists none). It reads `GET /rules/` once (every readable rule, by name).
4. **The sentence is built on the client** (`ruleText.ts`) from the trigger fields, as Segments' `RuleSentence` parts (figures in DM Mono, a deleted segment in italics):
   - entered/left: "When an organisation enters Renewal risk" ("an account", "a contact"; "a record" with no segment);
   - crossed: "When CSAT falls below 60 in Renewal risk" (a negative NPS with a true minus: "−20");
   - schedule: "Every Monday, for everyone in Renewal risk", "On the 1st of each month, for everyone in Renewal risk";
   - then " → " and the actions: "notify me", "notify each record's owner", "notify 2 teammates", "create a task", "move to Renewal", "survey", "survey without review".
5. **Two kinds of confirm.** On the list row and the rule page, turning on uses the shared `ConfirmDialog` (as Segments' Delete). Inside the builder, "Run every night" and "Send without review" ask in place (`InlineConfirm`), because a dialog over `BuilderDialog` would fight its Escape handler and focus trap. Escape inside the question cancels it, not the builder. Turning off never asks.
6. **Edits PATCH the whole rule.** The builder sends every field on save; the server compares values (`_changed`), so an unchanged field resets nothing.
7. **Test this rule runs on click only**, never debounced (a dry run reads the segment). The answer shows only while the rule is unchanged since it was asked; a late answer for an older rule is dropped. The edit route lends its own id (`rule`). The copy: "3 organisations would match if tonight's run happened now: Globex, Initech, Pizza Hut." Then "1 skipped (acted on in the last 30 days)", "N over the nightly limit of 200", "N in the segment you can't open isn't included". A `crossed` rule adds: "A score rule never acts on its first night after it is turned on or changed: that night it notes each score, and acts from the next."
8. **Client checks first, in the backend's own sentences** (`SAY` in `ruleOptions.ts`); a server 400 lands at its field, per action. The 403 "A rule can only use your own segments." lands at the segment. The client's own words cover what DRF would word: "Give the rule a name." and "Choose 1 to 365 days.".
9. **Notify's people are ids in the draft**, as in the contract; chips are named from the members list once it loads ("Teammate 6" before).
10. **Lifecycle starts with no stage** ("Choose a stage…"): no default that would change customer data. Choosing Churn says it "sets the stage only; it does not record a churn date" (backend Decision 10).
11. **Survey action defaults** are Surveys': NPS, "A quick question from {workspace}", Champion and Decision Maker ticked (none for a contact segment; back to the defaults when the segment changes to an organisation or account one). Its preview (`SurveyPreview`) sits in the builder's right column under the test.
12. **The 500 note** reads "A night that reaches more than 500 people is refused by Surveys and waits in your review queue with the reason." (controller ruling).
13. **The cooldown hint** (backend gap 3): a weekly rule waiting more than 7 days reads "A weekly rule that waits 30 days reaches each record about every 5 weeks."; a monthly one over 28 days reads "Some months are shorter than 30 days, so a monthly rule can miss a record for a month."
14. **Delete on the rule page** (owner, `ConfirmDialog`), though the spec lists only Edit: the 50-rule limit needs a way out.
15. **`?run=<id>` opens that night** on the rule page's first load (the `rule_fired` link). A night's records load when its row is opened (a disclosure, `aria-expanded`).
16. **The Review Queue** route moves into `pages/brain/BrainRoutes.tsx` (descendant routes under `brain/*`): `review` outside the gate, every other path inside it, exactly as before. The Sidebar shows **Review Queue** to everyone: in the Brain group as now for `view_all_accounts`, and alone (with its separator) for everyone else. Its badge stays the AI proposals' count; the `rule_review` notification announces rule reviews.
17. **Approve opens `/surveys/<survey_send_id>`.** A 400 keeps the item with "Surveys refused it: {first message} Fix it, then approve again, or skip it." A 409 (or 404) removes the item with "That review was already decided." Skip removes it with "Skipped the survey from {rule} for {day}." The item reads "From the night of 4 Oct 2026 · waits until 11 Oct 2026".
18. **Automate is a child route, `/segments/:id/rule`** (`RuleSegmentRoute`), like Survey these. Cancel returns to the segment; saving opens the new rule's page. A non-owner who types the address reads "Only {owner} can automate this segment".
19. **Framing.** `/scenarios` wears the framed bar titled "Scenarios"; a rule, its edit modal and a new one read "‹ Scenarios". `DashboardLayout` hides the Navbar only on the canvas builder now, and gives `/scenarios` and the rule routes the framed `p-0`. `/segments/:id/rule` and `/segments/:id/survey` join the segments' `p-0` frame (Survey these had been missing from it).
20. **Switch names.** A saved rule's switch is named "Run {name} every night" (it shows On or Off); the builder's are "Run every night" and "Send without review".
21. **Days.** Rows and the last run read "4 Oct" (`shortDay`); headers and reviews read "4 Oct 2026".
22. **The paused notice** reads "It switched itself off. {paused_message}" plus, for the owner, "Choose another of your segments in Edit, then turn it on." (`segment_gone`), "Choose one of your own segments in Edit, then turn it on." (`segment_not_owned`) or "It stays off until its owner is active again." (`owner_inactive`).
23. **`stubSurveys` gains `addSend`**, so the rules stub's approval creates a survey send the send page can read; nothing else in the Surveys stub changes.

## Contract gaps found while planning

1. **Review Queue access** (backend gap 1): resolved by the controller ruling, Decision 16.
2. **No count of waiting rule reviews** outside the list itself; the Sidebar badge does not include them (Decision 16). A `waiting` count on `/auth/me/` or the proposals endpoint would let one badge cover both.
3. **The test endpoint names contacts** in `records` for a contact segment. They are the owner's own contacts, so the UI shows them, but the backend's wording elsewhere (digests) avoids contact names.
4. **A night record's `name`** can be `null` (a record deleted since, if it is still listed); typed nullable, shown as "A deleted record", never linked.
5. **Approve returns only `{survey_send_id}`**, not the decided review; the UI navigates away, so nothing needs it today.
6. **Surveys' refusal bodies vary** (`{"segment": [...]}`, `{"roles": [...]}`, `{"detail": ...}`); the item shows the first message.
7. **The segment-ownership 403 is a `detail`**, not a field error; the UI places that exact sentence at the segment (Decision 8). A field-keyed 400 would be simpler.
8. **A 404 on save or test** is the same body for an unreadable segment and a rule deleted meanwhile; the UI says "This rule or its segment is no longer there."
9. **`last_run.waiting` is a boolean**, not a count; the row reads "waiting for review".
10. **`threshold` is a decimal (2 places) returned as a float**; the input takes any step and the server rounds.
11. **The 500-person limit is only known at approval** (backend gap 4); the card warns ahead (Decision 12).
12. **Weekly cooldown** (backend gap 3): handled by the hint (Decision 13); a per-trigger default would be better.
13. **The builder's preview** names the workspace from the signed-in user's organisation (as Surveys' gap 3); the review item uses the server's `organisation_name`.
14. **A reader's night** carries no `skipped` or `review`; the row shows only what they may count, plus "N you can't open".
15. **`owner_inactive`** is only ever read by a teammate (an inactive owner cannot sign in).
16. **The list is unpaginated** (≤ 50 owned plus shared); fine at today's limits.
17. **"Tonight" is UTC** on the server; the builder's schedule hints say "overnight (UTC)".

## File Structure

| File | Responsibility |
|---|---|
| `src/features/rules/ruleTypes.ts` (new) | The contract's types, field for field |
| `src/features/rules/ruleOptions.ts` (new) | Limits, score ranges, labels, choices by segment kind, the backend's sentences (`SAY`) |
| `src/features/rules/ruleText.ts` (new) | The rule sentence, last run, night line, action results, skip reasons, paused notice, turn-on text, test lines, cooldown hint, refusal text |
| `src/features/rules/ruleDraft.ts` (new) | The builder's draft: new and from a rule, actions, kind changes, to the write and test bodies, client checks |
| `src/features/rules/ruleErrors.ts` (new) | 400/403/404/429 bodies to fields, per action and the form |
| `src/features/rules/ruleParams.ts` (new) | `?tab=` on `/scenarios`, `?run=` on a rule |
| `src/features/rules/ruleApi.ts` (new) | `apiFetch` wrappers for `/rules/…` |
| `src/features/rules/testRules.ts` (new, test-only) | Fixtures and `stubRules` (with `runNight`), falling through to `stubSurveys` |
| `src/features/surveys/testSurveys.ts` (modify) | `addSend` |
| `src/features/notifications/types.ts` (modify) | `rule_fired`, `rule_review` |
| `src/components/surveys/RoleFields.tsx`, `SegmentOptions.tsx` (new), `AudienceFields.tsx` (modify) | The roles fieldset and the grouped segment options, shared with rules |
| `src/components/rules/switchParts.tsx` (new) | `SWITCH`, `Track` |
| `src/components/rules/InlineConfirm.tsx`, `ConfirmedSwitch.tsx` (new) | The builder's in-place confirm |
| `src/components/rules/RuleSwitch.tsx` (new) | A saved rule's on/off, with `ConfirmDialog` |
| `src/components/rules/Parts.tsx` (new) | Inline words and DM Mono figures |
| `src/components/rules/RuleListItem.tsx` (new) | One rule row |
| `src/components/rules/Field.tsx` (new) | Label above, hint and error below |
| `src/components/rules/TriggerFields.tsx` (new) | When: trigger, segment, score line, schedule |
| `src/components/rules/ActionFields.tsx`, `ActionCards.tsx` (new) | Then: the four action cards, add and remove |
| `src/components/rules/useRuleTest.ts`, `TestPanel.tsx` (new) | Test this rule |
| `src/components/rules/useRule.ts`, `RuleStates.tsx`, `RuleHeader.tsx`, `NightsSection.tsx` (new) | The rule page's parts |
| `src/components/rules/RuleReviews.tsx` (new) | The Review Queue's From your rules |
| `src/components/rules/houseRules.test.ts` (new) | The house rules over the new components and pages |
| `src/pages/scenarios/ScenariosHome.tsx` (new) | `/scenarios`: Rules and Canvas tabs, New rule, the modal's Outlet |
| `src/pages/rules/RulesTab.tsx`, `RuleBuilder.tsx`, `RulePage.tsx`, `testPages.tsx` (new) | The Rules tab; `NewRuleRoute`, `EditRuleRoute`, `RuleSegmentRoute`; `/scenarios/rules/:id`; test rendering |
| `src/pages/brain/BrainRoutes.tsx` (new), `Review.tsx` (modify) | `/brain/*` with `review` open to all; From your rules above the proposals |
| `src/components/layout/Sidebar.tsx`, `Navbar.tsx` (modify), `src/layouts/DashboardLayout.tsx` (modify) | Review Queue for everyone; the framed bar; the frame and Navbar on rule routes |
| `src/components/segments/SegmentHeader.tsx` (modify) | **Automate** (owner) |
| `src/App.tsx` (modify) | The `/scenarios` routes, `/segments/:id/rule`, `brain/*` |
| `src/e2e/rules.test.tsx` (new) | Build → test → turn on → the night → review → approve → a survey |
| docs (modify) | `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` |

---
### Task 1: The contract types, the choices and the rule as a sentence

Spec §2.1–§2.4 (copy), backend Decisions 2, 7, 8, 20 and the validation sentences of backend Task 3.

**Files:**
- Create: `src/features/rules/ruleTypes.ts`, `src/features/rules/ruleOptions.ts`, `src/features/rules/ruleText.ts`
- Test: `src/features/rules/ruleOptions.test.ts`, `src/features/rules/ruleText.test.ts`

**Interfaces:**
- Consumes: `SegmentKind`, `Sharing`, `PersonRef` (`features/segments/segmentTypes`); `SentencePart` (`features/segments/ruleSentence`); `SegmentRef`, `ContactRole`, `SurveyType` (`features/surveys/surveyTypes`); `Line` (`features/surveys/surveyText`); `LifecycleValue` (`features/organizations/portfolioTypes`); `formatDate`, `LIFECYCLE_LABELS` (`features/customers/formatters`).
- Produces:
  - `ruleTypes.ts`: `Trigger`, `Score`, `Direction`, `Cadence`, `PausedReason`, `LifecycleStage`, `NotifyTo`, `Assignee`, `NotifyAction`, `TaskAction`, `LifecycleAction`, `SurveyAction`, `RuleAction`, `ActionType`, `TriggerFields`, `LastRun`, `RuleRow`, `Rule`, `RuleWrite`, `RuleTestRequest`, `NamedRecord`, `TestSkips`, `RuleTestResult`, `RunSkips`, `ReviewStatus`, `RunRow`, `RunsPage`, `ActionStatus`, `ActionResult`, `RunRecord`, `RunDetail`, `ReviewRule`, `ReviewResult`, `RuleReview`, `ApproveAnswer`, `RuleScope`.
  - `ruleOptions.ts`: `NAME_MAX`, `MIN_ACTIONS`, `MAX_ACTIONS`, `COOLDOWN_MIN`, `COOLDOWN_MAX`, `COOLDOWN_DEFAULT`, `NIGHTLY_CAP`, `MESSAGE_MAX`, `TITLE_MAX`, `DUE_MAX`, `DUE_DEFAULT`, `PEOPLE_MAX`, `SURVEY_PEOPLE_MAX`, `REVIEW_DAYS`, `OWNED_MAX`, `SCORE_RANGES`, `SCORE_LABEL`, `DIRECTION_LABEL`, `CADENCE_LABEL`, `WEEKDAYS`, `NOTIFY_TO_LABEL`, `ASSIGNEE_LABEL`, `ACTION_LABEL`, `ACTION_ORDER`, `STAGES`, `SAY`, `NAME_NEEDED`, `COOLDOWN_RANGE`, `thresholdRange(score)`, `triggerOption(trigger, kind)`, `scoresFor(kind)`, `actionsFor(kind)`.
  - `ruleText.ts`: `SegmentLike`, `recordNoun(n, kind)`, `thresholdText(n)`, `shortDay(iso)`, `rangeHint(score)`, `triggerParts(fields, segment)`, `thenText(actions)`, `ruleParts(rule, segment)`, `lastRunParts(last)`, `runParts(run)`, `actionResultText(result)`, `skipReasonText(record, cooldownDays)`, `pausedText(reason, message, isOwner)`, `turnOnText(actions, segment)`, `sharingText(sharing, people)`, `testSummary(result, kind)`, `testLines(result, cooldownDays)`, `cooldownHint(trigger, cadence, days)`, `refusalText(error)`, `SURVEY_LIMIT_NOTE`, `CROSSED_NOTE`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/rules/ruleOptions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { actionsFor, SAY, scoresFor, STAGES, thresholdRange, triggerOption, WEEKDAYS } from './ruleOptions';

describe('rule options (backend validation, mirrored)', () => {
  it('offers every score to organisations, no CES to accounts and none to contacts', () => {
    expect(scoresFor('customer')).toEqual(['csat', 'nps', 'ces', 'health']);
    expect(scoresFor('account')).toEqual(['csat', 'nps', 'health']);
    expect(scoresFor('contact')).toEqual([]);
    expect(scoresFor(null)).toEqual(['csat', 'nps', 'ces', 'health']);
  });

  it('offers no lifecycle action to a contact segment', () => {
    expect(actionsFor('customer')).toEqual(['notify', 'task', 'lifecycle', 'survey']);
    expect(actionsFor('contact')).toEqual(['notify', 'task', 'survey']);
  });

  it("words the trigger for the segment's kind", () => {
    expect(triggerOption('entered', 'customer')).toBe('An organisation enters');
    expect(triggerOption('left', 'account')).toBe('An account leaves');
    expect(triggerOption('entered', 'contact')).toBe('A contact enters');
    expect(triggerOption('left', null)).toBe('A record leaves');
    expect(triggerOption('crossed', 'customer')).toBe('A score crosses a line');
    expect(triggerOption('schedule', null)).toBe('On a schedule');
  });

  it("keeps the backend's sentences, the range one per score", () => {
    expect(thresholdRange('nps')).toBe('Choose a value from -100 to 100.');
    expect(thresholdRange('health')).toBe('Choose a value from 0 to 10.');
    expect(SAY.LIMIT_REACHED).toBe('You can own at most 50 rules.');
    expect(SAY.NOT_SEGMENT_OWNER).toBe('A rule can only use your own segments.');
  });

  it('counts weekdays from Monday and lists the lifecycle stages in order', () => {
    expect(WEEKDAYS[0]).toBe('Monday');
    expect(WEEKDAYS[6]).toBe('Sunday');
    expect(STAGES.map((stage) => stage.value)).toEqual(['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other']);
    expect(STAGES[4].label).toBe('Renewal');
  });
});
```

Create `src/features/rules/ruleText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sentenceText } from '../segments/ruleSentence';
import {
  actionResultText,
  cooldownHint,
  lastRunParts,
  pausedText,
  rangeHint,
  recordNoun,
  refusalText,
  ruleParts,
  runParts,
  sharingText,
  shortDay,
  skipReasonText,
  testLines,
  testSummary,
  thresholdText,
  triggerParts,
  turnOnText,
} from './ruleText';
import type { NotifyAction, RunRow, SurveyAction, TriggerFields } from './ruleTypes';

const BLANK: TriggerFields = { trigger: 'entered', score: '', direction: '', threshold: null, cadence: '', weekday: null };
const RISK = { name: 'Renewal risk', kind: 'customer' as const };
const NOTIFY_ME: NotifyAction = { action: 'notify', to: 'me', people: [], message: '' };
const SURVEY: SurveyAction = { action: 'survey', survey_type: 'nps', subject: 'Hi', intro: '', roles: ['champion'], without_review: false };
const RUN: RunRow = {
  id: 9, run_on: '2026-10-04', matched: 5, fired: 3,
  skipped: { cooldown: 1, cap: 0, not_visible: 1, failed: 0 }, review: { id: 2, status: 'waiting' },
  hidden_count: 0, started_at: null, finished_at: null,
};
const text = sentenceText;

describe('the rule as a sentence (spec §2.1)', () => {
  it('reads a crossing rule as the spec does, the figure in DM Mono', () => {
    const parts = ruleParts({ ...BLANK, trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60, actions: [SURVEY, NOTIFY_ME] }, { name: 'My book', kind: 'customer' });
    expect(text(parts)).toBe('When CSAT falls below 60 in My book → survey, notify me');
    expect(parts.filter((part) => part.numeric).map((part) => part.text)).toEqual(['60']);
  });

  it('reads entries and exits by kind, and a deleted segment in italics', () => {
    expect(text(triggerParts(BLANK, RISK))).toBe('When an organisation enters Renewal risk');
    expect(text(triggerParts({ ...BLANK, trigger: 'left' }, { name: 'EMEA', kind: 'account' }))).toBe('When an account leaves EMEA');
    const gone = triggerParts({ ...BLANK, trigger: 'left' }, null);
    expect(text(gone)).toBe('When a record leaves a deleted segment');
    expect(gone.at(-1)).toEqual({ text: 'a deleted segment', role: 'hidden' });
  });

  it('reads a rising NPS with a true minus, and an unfinished line plainly', () => {
    expect(text(triggerParts({ ...BLANK, trigger: 'crossed', score: 'nps', direction: 'above', threshold: -20 }, RISK))).toBe('When NPS rises above −20 in Renewal risk');
    expect(text(triggerParts({ ...BLANK, trigger: 'crossed', score: '', direction: 'below', threshold: null }, RISK))).toBe('When a score crosses a line in Renewal risk');
  });

  it('reads weekly and monthly schedules', () => {
    expect(text(triggerParts({ ...BLANK, trigger: 'schedule', cadence: 'weekly', weekday: 0 }, RISK))).toBe('Every Monday, for everyone in Renewal risk');
    expect(text(triggerParts({ ...BLANK, trigger: 'schedule', cadence: 'monthly', weekday: null }, RISK))).toBe('On the 1st of each month, for everyone in Renewal risk');
  });

  it('names every action, without review included', () => {
    const parts = ruleParts(
      {
        ...BLANK,
        actions: [
          { action: 'notify', to: 'people', people: [4, 5], message: '' },
          { action: 'task', title: 'Call', assignee: 'me', due_in_days: 3 },
          { action: 'lifecycle', stage: 'renewal' },
          { ...SURVEY, without_review: true },
        ],
      },
      RISK,
    );
    expect(text(parts)).toBe('When an organisation enters Renewal risk → notify 2 teammates, create a task, move to Renewal, survey without review');
    expect(text(ruleParts({ ...BLANK, actions: [{ ...NOTIFY_ME, to: 'record_owner' }] }, RISK))).toMatch(/→ notify each record's owner$/);
  });
});

describe('nights and last runs (spec §2.1, §2.3)', () => {
  it('reads the last night for the owner, a reader, and none yet', () => {
    expect(text(lastRunParts({ run_on: '2026-10-04', fired: 3, waiting: false }))).toBe('4 Oct · fired 3');
    expect(text(lastRunParts({ run_on: '2026-10-04', fired: 3, waiting: true }))).toBe('4 Oct · fired 3 · waiting for review');
    expect(text(lastRunParts({ run_on: '2026-10-04', fired: null, waiting: false }))).toBe('Last ran 4 Oct');
    expect(text(lastRunParts(null))).toBe('Not run yet');
  });

  it('reads a night as the spec does, its figures in DM Mono', () => {
    const parts = runParts(RUN);
    expect(text(parts)).toBe('4 Oct · fired 3 · skipped 2 · 1 waiting for review');
    expect(parts.filter((part) => part.numeric).map((part) => part.text)).toEqual(['3', '2', '1']);
  });

  it("reads a decided review, and a reader's night with what they can't open", () => {
    expect(text(runParts({ ...RUN, review: { id: 2, status: 'approved' } }))).toBe('4 Oct · fired 3 · skipped 2 · survey approved');
    expect(text(runParts({ ...RUN, matched: null, skipped: null, review: null, fired: 1, hidden_count: 2 }))).toBe("4 Oct · fired 1 · 2 you can't open");
  });

  it('says what each action did and why a record was skipped', () => {
    expect(actionResultText({ action: 'lifecycle', status: 'done', detail: 'live → renewal' })).toBe('Lifecycle: done (live → renewal)');
    expect(actionResultText({ action: 'survey', status: 'queued', detail: '' })).toBe('Survey: waiting for review');
    expect(actionResultText({ action: 'notify', status: 'skipped', detail: 'nobody to notify may open it' })).toBe('Notify: skipped (nobody to notify may open it)');
    const record = { kind: 'customer' as const, id: 6, name: 'Shopify', outcome: 'skipped' as const, actions: [] };
    expect(skipReasonText({ ...record, reason: 'cooldown' }, 30)).toBe('Skipped: acted on in the last 30 days');
    expect(skipReasonText({ ...record, reason: 'failed' }, 30)).toBe('Skipped: every action failed; it is tried again next time');
  });

  it('shortens a day to "4 Oct"', () => {
    expect(shortDay('2026-10-04')).toBe('4 Oct');
  });
});

describe('the rest of the copy', () => {
  it('words the paused notice by code, with the fix for the owner only', () => {
    expect(pausedText('', '', true)).toBeNull();
    expect(pausedText('segment_gone', 'Its segment was deleted.', true)).toBe('It switched itself off. Its segment was deleted. Choose another of your segments in Edit, then turn it on.');
    expect(pausedText('segment_gone', 'Its segment was deleted.', false)).toBe('It switched itself off. Its segment was deleted.');
    expect(pausedText('owner_inactive', 'Its owner is no longer active.', true)).toMatch(/It stays off until its owner is active again\.$/);
  });

  it('says what turning on will do, and whether surveys wait', () => {
    expect(turnOnText([SURVEY, NOTIFY_ME], RISK)).toBe('From tonight it runs once a night on Renewal risk and will survey, notify me. Its surveys wait for your review first.');
    expect(turnOnText([{ ...SURVEY, without_review: true }], RISK)).toMatch(/Its surveys go out without your review\.$/);
    expect(turnOnText([NOTIFY_ME], null)).toBe('From tonight it runs once a night on its segment and will notify me.');
  });

  it('words sharing as Segments do', () => {
    expect(sharingText('private', [])).toBe('Private');
    expect(sharingText('workspace', [])).toBe('Shared with the workspace');
    expect(sharingText('people', [{ id: 1, name: 'Alice' }, { id: 4, name: 'Carl CSM' }, { id: 5, name: 'Dana CSM' }])).toBe('Shared with Alice, Carl CSM and 1 more');
  });

  it("sums up a test as an estimate, naming the first records and counting the rest", () => {
    const result = { count: 12, records: [{ kind: 'customer' as const, id: 1, name: 'Globex' }, { kind: 'customer' as const, id: 2, name: 'Initech' }], hidden_count: 1, skipped: { cooldown: 1, cap: 3, not_visible: 1 } };
    expect(testSummary(result, 'customer')).toEqual({ n: 12, text: "organisations would match if tonight's run happened now: Globex, Initech and 10 more." });
    expect(testSummary({ ...result, count: 0, records: [] }, 'contact')).toEqual({ n: 0, text: "contacts would match if tonight's run happened now." });
    expect(testLines(result, 30)).toEqual([
      { n: 1, text: 'skipped (acted on in the last 30 days)' },
      { n: 3, text: 'over the nightly limit of 200' },
      { n: 1, text: "in the segment you can't open isn't included" },
    ]);
  });

  it('warns when a schedule waits longer than its own rhythm (backend gap 3)', () => {
    expect(cooldownHint('schedule', 'weekly', 30)).toBe('A weekly rule that waits 30 days reaches each record about every 5 weeks.');
    expect(cooldownHint('schedule', 'weekly', 7)).toBeNull();
    expect(cooldownHint('schedule', 'monthly', 30)).toBe('Some months are shorter than 30 days, so a monthly rule can miss a record for a month.');
    expect(cooldownHint('entered', 'weekly', 30)).toBeNull();
  });

  it("reads a Surveys refusal's first message, whatever its key", () => {
    expect(refusalText({ segment: ['This survey would reach 612 people; the most is 500.'] })).toBe('This survey would reach 612 people; the most is 500.');
    expect(refusalText({ detail: "Email isn't set up for this workspace yet, so surveys can't be sent." })).toMatch(/^Email isn't set up/);
    expect(refusalText(undefined)).toBeNull();
  });

  it('counts records by kind, and words a range with a true minus', () => {
    expect(recordNoun(1, 'customer')).toBe('organisation');
    expect(recordNoun(2, 'account')).toBe('accounts');
    expect(recordNoun(2, null)).toBe('records');
    expect(thresholdText(-5)).toBe('−5');
    expect(rangeHint('nps')).toBe('NPS runs from −100 to 100.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/rules/ruleOptions.test.ts src/features/rules/ruleText.test.ts`
Expected: FAIL, "Failed to resolve import "./ruleOptions"" (and "./ruleText").

- [ ] **Step 3: Write the types**

Create `src/features/rules/ruleTypes.ts`:

```ts
// The Rules contract (revenact-backend feat/rules, docs/API_CONTRACTS.md
// `rules`; backend plan 2026-10-04-rules-backend.md), field for field.
// Every read is computed for the reader over what they may open now.
import type { LifecycleValue } from '../organizations/portfolioTypes';
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';
import type { ContactRole, SegmentRef, SurveyType } from '../surveys/surveyTypes';

export type Trigger = 'entered' | 'left' | 'crossed' | 'schedule';
export type Score = 'csat' | 'nps' | 'ces' | 'health';
export type Direction = 'below' | 'above';
export type Cadence = 'weekly' | 'monthly';
export type PausedReason = '' | 'segment_gone' | 'segment_not_owned' | 'owner_inactive';
export type LifecycleStage = LifecycleValue;
export type NotifyTo = 'me' | 'record_owner' | 'people';
export type Assignee = 'record_owner' | 'me';
export type RuleScope = 'all' | 'mine' | 'shared';

/** Backend Decision 8: `people` is `[]` unless `to` is `people`. */
export interface NotifyAction {
  action: 'notify';
  to: NotifyTo;
  people: number[];
  message: string;
}

export interface TaskAction {
  action: 'task';
  title: string;
  assignee: Assignee;
  due_in_days: number;
}

export interface LifecycleAction {
  action: 'lifecycle';
  stage: LifecycleStage;
}

/** Surveys' fields; `roles` is `[]` for a contact segment. */
export interface SurveyAction {
  action: 'survey';
  survey_type: SurveyType;
  subject: string;
  intro: string;
  roles: ContactRole[];
  without_review: boolean;
}

export type RuleAction = NotifyAction | TaskAction | LifecycleAction | SurveyAction;
export type ActionType = RuleAction['action'];

/** The six trigger fields; the ones the trigger does not use are blank. */
export interface TriggerFields {
  trigger: Trigger;
  score: Score | '';
  direction: Direction | '';
  threshold: number | null;
  cadence: Cadence | '';
  weekday: number | null;
}

/** `null` before the first night. `fired` is null and `waiting` false for
 *  anyone but the owner (backend Decision 28). */
export interface LastRun {
  run_on: string;
  fired: number | null;
  waiting: boolean;
}

/** GET /rules/: a row. `segment.id` is null for a reader who may not read
 *  the segment; `segment` is null once it is deleted. */
export interface RuleRow extends TriggerFields {
  id: number;
  name: string;
  is_active: boolean;
  paused_reason: PausedReason;
  paused_message: string;
  segment: SegmentRef | null;
  actions: RuleAction[];
  cooldown_days: number;
  sharing: Sharing;
  owner: PersonRef;
  is_owner: boolean;
  last_run: LastRun | null;
  updated_at: string;
}

/** GET/PATCH /rules/<id>/ and POST's 201. */
export interface Rule extends RuleRow {
  shared_with: PersonRef[];
  created_at: string;
}

/** POST /rules/ and PATCH (the builder sends it whole, plan Decision 6). */
export interface RuleWrite extends TriggerFields {
  name: string;
  segment: number | null;
  actions: RuleAction[];
  cooldown_days: number;
  is_active: boolean;
  sharing: Sharing;
  shared_with?: number[];
}

/** POST /rules/test/: a rule body (`name` optional), plus a rule the
 *  caller owns that lends its stored scores and cooldowns. */
export interface RuleTestRequest extends TriggerFields {
  name?: string;
  segment: number | null;
  actions: RuleAction[];
  cooldown_days: number;
  rule?: number;
}

export interface NamedRecord {
  kind: SegmentKind;
  id: number;
  name: string;
}

export interface TestSkips {
  cooldown: number;
  cap: number;
  not_visible: number;
}

export interface RuleTestResult {
  count: number;
  records: NamedRecord[];
  hidden_count: number;
  skipped: TestSkips;
}

export interface RunSkips extends TestSkips {
  failed: number;
}

export type ReviewStatus = 'waiting' | 'approved' | 'skipped' | 'expired';

/** GET /rules/<id>/runs/: for anyone but the owner, `matched`, `skipped`
 *  and `review` are null and `fired` counts only what they may open now. */
export interface RunRow {
  id: number;
  run_on: string;
  matched: number | null;
  fired: number;
  skipped: RunSkips | null;
  review: { id: number; status: ReviewStatus } | null;
  hidden_count: number;
  started_at: string | null;
  finished_at: string | null;
}

/** 20 a page, newest first; `next` is opaque. */
export interface RunsPage {
  results: RunRow[];
  next: string | null;
}

export type ActionStatus = 'done' | 'unchanged' | 'queued' | 'skipped' | 'failed';

/** `detail` never holds personal data (backend contract). */
export interface ActionResult {
  action: ActionType;
  status: ActionStatus;
  detail: string;
}

/** `name` is null for a record gone since (contract gap 4). */
export interface RunRecord {
  kind: SegmentKind;
  id: number;
  name: string | null;
  outcome: 'fired' | 'skipped';
  reason: '' | 'cooldown' | 'failed';
  actions: ActionResult[];
}

/** GET /rules/<id>/runs/<run_id>/: only the records the reader may open
 *  now, fired first, unpaginated (at most 400); the rest a count. */
export interface RunDetail {
  id: number;
  run_on: string;
  hidden_count: number;
  records: RunRecord[];
}

export interface ReviewRule extends TriggerFields {
  id: number;
  name: string;
  segment: { id: number; name: string; kind: SegmentKind } | null;
}

/** `{}` while waiting; `{survey_send_id}` once approved; `{error}` after a
 *  refused approval (the review stays waiting). */
export interface ReviewResult {
  survey_send_id?: number;
  error?: Record<string, unknown>;
}

/** GET /rules/reviews/: the caller's own, newest first, at most 100. */
export interface RuleReview {
  id: number;
  rule: ReviewRule;
  run_on: string;
  action: SurveyAction;
  counts: { people: number; records: number };
  organisation_name: string;
  status: ReviewStatus;
  result: ReviewResult;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
}

export interface ApproveAnswer {
  survey_send_id: number;
}
```

- [ ] **Step 4: Write the options**

Create `src/features/rules/ruleOptions.ts`:

```ts
// The rules' choices, labels and limits, and the backend's own sentences,
// mirrored from services/rules/models.py and validation.py (backend plan
// Tasks 1 and 3), so a client check and a server refusal read the same.
import { LIFECYCLE_LABELS } from '../customers/formatters';
import type { SegmentKind } from '../segments/segmentTypes';
import type { ActionType, Assignee, Cadence, Direction, LifecycleStage, NotifyTo, Score, Trigger } from './ruleTypes';

export const NAME_MAX = 120;
export const MIN_ACTIONS = 1;
export const MAX_ACTIONS = 3;
export const COOLDOWN_MIN = 1;
export const COOLDOWN_MAX = 365;
export const COOLDOWN_DEFAULT = 30;
export const NIGHTLY_CAP = 200;
export const MESSAGE_MAX = 280;
export const TITLE_MAX = 200;
export const DUE_MAX = 90;
export const DUE_DEFAULT = 7;
/** Notify's chosen teammates, and a rule's sharing (backend MAX_SHARED). */
export const PEOPLE_MAX = 50;
/** Surveys refuses a send that reaches more people (surveys MAX_PEOPLE). */
export const SURVEY_PEOPLE_MAX = 500;
export const REVIEW_DAYS = 7;
export const OWNED_MAX = 50;

export const SCORE_RANGES: Record<Score, readonly [number, number]> = {
  csat: [0, 100],
  nps: [-100, 100],
  ces: [0, 100],
  health: [0, 10],
};
export const SCORE_LABEL: Record<Score, string> = { csat: 'CSAT', nps: 'NPS', ces: 'CES', health: 'Health' };
export const DIRECTION_LABEL: Record<Direction, string> = { below: 'Falls below', above: 'Rises above' };
export const CADENCE_LABEL: Record<Cadence, string> = { weekly: 'Weekly', monthly: 'Monthly, on the 1st' };
/** Monday = 0, as the backend's `weekday`. */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const NOTIFY_TO_LABEL: Record<NotifyTo, string> = { me: 'Me', record_owner: "Each record's owner", people: 'Chosen teammates' };
export const ASSIGNEE_LABEL: Record<Assignee, string> = { record_owner: "The record's owner", me: 'Me' };
export const ACTION_LABEL: Record<ActionType, string> = {
  notify: 'Notify',
  task: 'Create a task',
  lifecycle: 'Change lifecycle',
  survey: 'Send a survey',
};
export const ACTION_ORDER: readonly ActionType[] = ['notify', 'task', 'lifecycle', 'survey'];
export const STAGES = (Object.keys(LIFECYCLE_LABELS) as LifecycleStage[]).map((value) => ({ value, label: LIFECYCLE_LABELS[value] }));

/** The backend's sentences (services/rules/validation.py, views.py,
 *  reviews.py; surveys' NO_ROLES). */
export const SAY = {
  CHOOSE_SEGMENT: 'Choose a segment.',
  CHOOSE_TRIGGER: 'Choose when the rule runs.',
  CHOOSE_SCORE: 'Choose a score.',
  CHOOSE_DIRECTION: 'Choose below or above.',
  CHOOSE_THRESHOLD: 'Choose a value.',
  CHOOSE_CADENCE: 'Choose weekly or monthly.',
  CHOOSE_WEEKDAY: 'Choose a day of the week.',
  NO_CONTACT_SCORES: 'Contacts have no scores; choose an organisation or account segment.',
  NO_ACCOUNT_CES: 'Accounts have no CES; choose another score.',
  ACTION_COUNT: 'Choose 1 to 3 actions.',
  ONE_OF_EACH: 'Each action can be used once per rule.',
  NO_PEOPLE: 'Choose at least one teammate.',
  LONG_MESSAGE: 'Keep the message to 280 characters.',
  NO_TITLE: 'Give the task a title.',
  LONG_TITLE: 'Keep the title to 200 characters.',
  DUE_RANGE: 'Choose 0 to 90 days.',
  NO_CONTACT_LIFECYCLE: 'Contacts have no lifecycle stage; choose an organisation or account segment.',
  CHOOSE_STAGE: 'Choose a lifecycle stage.',
  NO_SUBJECT: 'Write a subject.',
  NO_ROLES: 'Choose at least one role.',
  NOT_SEGMENT_OWNER: 'A rule can only use your own segments.',
  NOT_OWNER: "Only the rule's owner can change it.",
  LIMIT_REACHED: 'You can own at most 50 rules.',
  ALREADY_DECIDED: 'This review has already been decided.',
} as const;

/** The client's own words where DRF would word it (plan Decision 8). */
export const NAME_NEEDED = 'Give the rule a name.';
export const COOLDOWN_RANGE = 'Choose 1 to 365 days.';

/** The backend's `threshold_range(score)`, character for character. */
export function thresholdRange(score: Score): string {
  const [low, high] = SCORE_RANGES[score];
  return `Choose a value from ${low} to ${high}.`;
}

const NOUN: Record<SegmentKind, string> = { customer: 'An organisation', account: 'An account', contact: 'A contact' };

/** The Trigger select's words for the segment's kind. */
export function triggerOption(trigger: Trigger, kind: SegmentKind | null): string {
  const noun = kind ? NOUN[kind] : 'A record';
  if (trigger === 'entered') return `${noun} enters`;
  if (trigger === 'left') return `${noun} leaves`;
  if (trigger === 'crossed') return 'A score crosses a line';
  return 'On a schedule';
}

/** Contacts have no scores; accounts have no CES. */
export function scoresFor(kind: SegmentKind | null): Score[] {
  if (kind === 'contact') return [];
  if (kind === 'account') return ['csat', 'nps', 'health'];
  return ['csat', 'nps', 'ces', 'health'];
}

/** Contacts have no lifecycle stage. */
export function actionsFor(kind: SegmentKind | null): ActionType[] {
  return ACTION_ORDER.filter((type) => !(kind === 'contact' && type === 'lifecycle'));
}
```

- [ ] **Step 5: Write the text**

Create `src/features/rules/ruleText.ts`:

```ts
// The rules' sentences, as data. A rule reads as Segments' SentencePart
// list (figures marked numeric for DM Mono, a deleted segment as `hidden`),
// so Segments' RuleSentence draws it; every other line keeps its figures
// apart from its words for the same reason.
import { formatDate, LIFECYCLE_LABELS } from '../customers/formatters';
import type { SentencePart } from '../segments/ruleSentence';
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';
import type { Line } from '../surveys/surveyText';
import { NIGHTLY_CAP, SCORE_LABEL, SCORE_RANGES, SURVEY_PEOPLE_MAX, WEEKDAYS } from './ruleOptions';
import type {
  ActionResult,
  ActionStatus,
  ActionType,
  Cadence,
  LastRun,
  PausedReason,
  ReviewStatus,
  RuleAction,
  RuleTestResult,
  RunRecord,
  RunRow,
  Score,
  SurveyAction,
  Trigger,
  TriggerFields,
} from './ruleTypes';

/** A segment as a sentence needs it; null once deleted. */
export type SegmentLike = { name: string; kind: SegmentKind } | null;

/** Under the survey card (controller ruling, backend gap 4). */
export const SURVEY_LIMIT_NOTE = `A night that reaches more than ${SURVEY_PEOPLE_MAX} people is refused by Surveys and waits in your review queue with the reason.`;
/** Under a crossing rule's test (backend Decision 19). */
export const CROSSED_NOTE = 'A score rule never acts on its first night after it is turned on or changed: that night it notes each score, and acts from the next.';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const NOUNS: Record<SegmentKind, readonly [string, string]> = {
  customer: ['organisation', 'organisations'],
  account: ['account', 'accounts'],
  contact: ['contact', 'contacts'],
};
const ARTICLE: Record<SegmentKind, string> = { customer: 'an organisation', account: 'an account', contact: 'a contact' };

export function recordNoun(n: number, kind: SegmentKind | null): string {
  const [one, many] = kind ? NOUNS[kind] : ['record', 'records'];
  return plural(n, one, many);
}

/** A true minus for a negative NPS. */
export function thresholdText(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/** "2026-10-04" → "4 Oct" (rows; headers keep the year). */
export function shortDay(iso: string): string {
  return formatDate(iso).replace(/ \d{4}$/, '');
}

/** Under the Value field: "CSAT runs from 0 to 100." */
export function rangeHint(score: Score): string {
  const [low, high] = SCORE_RANGES[score];
  return `${SCORE_LABEL[score]} runs from ${thresholdText(low)} to ${thresholdText(high)}.`;
}

/** The trigger half (plan Decision 4). */
export function triggerParts(rule: TriggerFields, segment: SegmentLike): SentencePart[] {
  const where: SentencePart = segment ? { text: segment.name, role: 'kind' } : { text: 'a deleted segment', role: 'hidden' };
  if (rule.trigger === 'crossed') {
    if (!rule.score || rule.threshold === null) {
      return [{ text: 'When ', role: 'join' }, { text: 'a score', role: 'field' }, { text: ' crosses a line in ', role: 'op' }, where];
    }
    return [
      { text: 'When ', role: 'join' },
      { text: SCORE_LABEL[rule.score], role: 'field' },
      { text: rule.direction === 'above' ? ' rises above ' : ' falls below ', role: 'op' },
      { text: thresholdText(rule.threshold), role: 'value', numeric: true },
      { text: ' in ', role: 'join' },
      where,
    ];
  }
  if (rule.trigger === 'schedule') {
    const when: SentencePart[] =
      rule.cadence === 'monthly'
        ? [{ text: 'On the ', role: 'join' }, { text: '1st', role: 'value', numeric: true }, { text: ' of each month', role: 'join' }]
        : [{ text: 'Every ', role: 'join' }, { text: WEEKDAYS[rule.weekday ?? 0], role: 'value' }];
    return [...when, { text: ', for everyone in ', role: 'join' }, where];
  }
  return [
    { text: 'When ', role: 'join' },
    { text: segment ? ARTICLE[segment.kind] : 'a record', role: 'field' },
    { text: rule.trigger === 'left' ? ' leaves ' : ' enters ', role: 'op' },
    where,
  ];
}

function actionWords(action: RuleAction): string {
  switch (action.action) {
    case 'notify':
      if (action.to === 'me') return 'notify me';
      if (action.to === 'record_owner') return "notify each record's owner";
      return `notify ${action.people.length} ${plural(action.people.length, 'teammate', 'teammates')}`;
    case 'task':
      return 'create a task';
    case 'lifecycle':
      return action.stage ? `move to ${LIFECYCLE_LABELS[action.stage]}` : 'change lifecycle';
    case 'survey':
      return action.without_review ? 'survey without review' : 'survey';
  }
}

export function thenText(actions: readonly RuleAction[]): string {
  return actions.map(actionWords).join(', ');
}

/** "When CSAT falls below 60 in My book → survey, notify me" (spec §2.1). */
export function ruleParts(rule: TriggerFields & { actions: readonly RuleAction[] }, segment: SegmentLike): SentencePart[] {
  return [...triggerParts(rule, segment), { text: ' → ', role: 'join' }, { text: thenText(rule.actions), role: 'value' }];
}

/** The list row's last night (spec §2.1). */
export function lastRunParts(last: LastRun | null): SentencePart[] {
  if (!last) return [{ text: 'Not run yet', role: 'join' }];
  if (last.fired === null) return [{ text: `Last ran ${shortDay(last.run_on)}`, role: 'join' }];
  return [
    { text: `${shortDay(last.run_on)} · fired `, role: 'join' },
    { text: String(last.fired), role: 'value', numeric: true },
    ...(last.waiting ? [{ text: ' · waiting for review', role: 'join' as const }] : []),
  ];
}

const REVIEW_WORDS: Record<Exclude<ReviewStatus, 'waiting'>, string> = {
  approved: 'survey approved',
  skipped: 'survey skipped',
  expired: 'review expired',
};

/** "4 Oct · fired 3 · skipped 2 · 1 waiting for review" (spec §2.3). A
 *  reader's figures cover only what they may open; the rest is a count. */
export function runParts(run: RunRow): SentencePart[] {
  const parts: SentencePart[] = [
    { text: `${shortDay(run.run_on)} · fired `, role: 'join' },
    { text: String(run.fired), role: 'value', numeric: true },
  ];
  const skipped = run.skipped ? run.skipped.cooldown + run.skipped.cap + run.skipped.not_visible + run.skipped.failed : 0;
  if (skipped > 0) parts.push({ text: ' · skipped ', role: 'join' }, { text: String(skipped), role: 'value', numeric: true });
  if (run.review?.status === 'waiting') {
    parts.push({ text: ' · ', role: 'join' }, { text: '1', role: 'value', numeric: true }, { text: ' waiting for review', role: 'join' });
  } else if (run.review) {
    parts.push({ text: ` · ${REVIEW_WORDS[run.review.status]}`, role: 'join' });
  }
  if (run.hidden_count > 0) {
    parts.push({ text: ' · ', role: 'join' }, { text: String(run.hidden_count), role: 'value', numeric: true }, { text: " you can't open", role: 'join' });
  }
  return parts;
}

const SHORT: Record<ActionType, string> = { notify: 'Notify', task: 'Task', lifecycle: 'Lifecycle', survey: 'Survey' };
const STATUS_WORDS: Record<ActionStatus, string> = {
  done: 'done',
  unchanged: 'already set',
  queued: 'waiting for review',
  skipped: 'skipped',
  failed: 'failed',
};

/** "Lifecycle: done (live → renewal)". `detail` is a fixed phrase or stage
 *  values, never personal data (backend contract). */
export function actionResultText(result: ActionResult): string {
  return `${SHORT[result.action]}: ${STATUS_WORDS[result.status]}${result.detail ? ` (${result.detail})` : ''}`;
}

export function skipReasonText(record: Pick<RunRecord, 'reason'>, cooldownDays: number): string {
  if (record.reason === 'cooldown') return `Skipped: acted on in the last ${cooldownDays} days`;
  if (record.reason === 'failed') return 'Skipped: every action failed; it is tried again next time';
  return 'Skipped';
}

const PAUSE_FIX: Record<Exclude<PausedReason, ''>, string> = {
  segment_gone: 'Choose another of your segments in Edit, then turn it on.',
  segment_not_owned: 'Choose one of your own segments in Edit, then turn it on.',
  owner_inactive: 'It stays off until its owner is active again.',
};

/** The paused notice (spec §2.3, plan Decision 22), or null. */
export function pausedText(reason: PausedReason, message: string, isOwner: boolean): string | null {
  if (!reason) return null;
  return isOwner ? `It switched itself off. ${message} ${PAUSE_FIX[reason]}` : `It switched itself off. ${message}`;
}

/** What the confirm says before a rule is turned on (spec §2.2). */
export function turnOnText(actions: readonly RuleAction[], segment: SegmentLike): string {
  const survey = actions.find((action): action is SurveyAction => action.action === 'survey');
  const tail = !survey ? '' : survey.without_review ? ' Its surveys go out without your review.' : ' Its surveys wait for your review first.';
  return `From tonight it runs once a night on ${segment ? segment.name : 'its segment'} and will ${thenText(actions)}.${tail}`;
}

/** As a segment's header words it. */
export function sharingText(sharing: Sharing, people: PersonRef[]): string {
  if (sharing === 'private') return 'Private';
  if (sharing === 'workspace') return 'Shared with the workspace';
  if (people.length <= 2) return `Shared with ${people.map((person) => person.name).join(' and ')}`;
  return `Shared with ${people[0].name}, ${people[1].name} and ${people.length - 2} more`;
}

/** Test this rule's answer, as an estimate (plan Decision 7, backend gap 5):
 *  the figure apart, then its words. */
export function testSummary(result: RuleTestResult, kind: SegmentKind | null): { n: number; text: string } {
  const lead = `${recordNoun(result.count, kind)} would match if tonight's run happened now`;
  if (result.records.length === 0) return { n: result.count, text: `${lead}.` };
  const more = result.count - result.records.length;
  return { n: result.count, text: `${lead}: ${result.records.map((record) => record.name).join(', ')}${more > 0 ? ` and ${more} more` : ''}.` };
}

/** The skips under a test, counted and never named. */
export function testLines(result: RuleTestResult, cooldownDays: number): Line[] {
  const lines: Line[] = [];
  if (result.skipped.cooldown > 0) lines.push({ n: result.skipped.cooldown, text: `skipped (acted on in the last ${cooldownDays} days)` });
  if (result.skipped.cap > 0) lines.push({ n: result.skipped.cap, text: `over the nightly limit of ${NIGHTLY_CAP}` });
  if (result.hidden_count > 0) {
    lines.push({ n: result.hidden_count, text: `in the segment you can't open ${result.hidden_count === 1 ? "isn't" : "aren't"} included` });
  }
  return lines;
}

/** A schedule that waits longer than its own rhythm (plan Decision 13). */
export function cooldownHint(trigger: Trigger, cadence: Cadence | '', days: number): string | null {
  if (trigger !== 'schedule' || !Number.isInteger(days)) return null;
  if (cadence === 'weekly' && days > 7) return `A weekly rule that waits ${days} days reaches each record about every ${Math.ceil(days / 7)} weeks.`;
  if (cadence === 'monthly' && days > 28) return `Some months are shorter than ${days} days, so a monthly rule can miss a record for a month.`;
  return null;
}

/** The first message of a Surveys refusal stored on a review (contract gap 6). */
export function refusalText(error: Record<string, unknown> | undefined): string | null {
  if (!error) return null;
  if (typeof error.detail === 'string') return error.detail;
  for (const value of Object.values(error)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return null;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/rules/ruleOptions.test.ts src/features/rules/ruleText.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 7: Commit**

```bash
git add src/features/rules/ruleTypes.ts src/features/rules/ruleOptions.ts src/features/rules/ruleText.ts src/features/rules/ruleOptions.test.ts src/features/rules/ruleText.test.ts
git commit -m "feat(rules): the contract types, the choices and the rule as a sentence

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The builder's draft, its checks, and refusals at their fields

Spec §2.2, backend Decisions 8, 26, 27 and the error table in Global Constraints.

**Files:**
- Create: `src/features/rules/ruleDraft.ts`, `src/features/rules/ruleErrors.ts`, `src/features/rules/ruleParams.ts`
- Test: `src/features/rules/ruleDraft.test.ts`, `src/features/rules/ruleErrors.test.ts`, `src/features/rules/ruleParams.test.ts`

**Interfaces:**
- Consumes: Task 1's types and `ruleOptions` (`SAY`, limits, `actionsFor`, `thresholdRange`, `NAME_NEEDED`, `COOLDOWN_RANGE`); `DEFAULT_ROLES` (`features/surveys/questions`); `ApiError` (`lib/apiClient`).
- Produces:
  - `ruleDraft.ts`: `LifecycleDraft`, `ActionDraft`, `RuleDraft` (`name`, `segment`, `trigger`, `score`, `direction`, `threshold: string`, `cadence`, `weekday: number`, `actions`, `cooldown: string`, `isActive`, `sharing`, `sharedWith: PersonRef[]`), `NOTIFY_ME`, `emptyDraft(segment)`, `fromRule(rule)`, `newAction(type, kind, workspace)`, `availableActions(actions, kind)`, `withKind(actions, kind)`, `toTrigger(draft)`, `toActions(draft, kind)`, `toWrite(draft, kind)`, `toTestBody(draft, kind, ruleId)`, `checkDraft(draft, kind, { forTest? })`.
  - `ruleErrors.ts`: `RULE_FIELDS`, `RuleField`, `ActionErrors`, `RuleErrors` (`{ form?, field, action }`), `NO_ERRORS`, `hasErrors(errors)`, `ruleErrors(err, fallback?)`, `firstError(errors)`.
  - `ruleParams.ts`: `ScenariosTab`, `scenariosTab(search)`, `openRun(search)`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/rules/ruleDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasErrors } from './ruleErrors';
import { availableActions, checkDraft, emptyDraft, fromRule, newAction, NOTIFY_ME, toTestBody, toTrigger, toWrite, withKind, type RuleDraft } from './ruleDraft';
import type { Rule } from './ruleTypes';

const draft = (patch: Partial<RuleDraft> = {}): RuleDraft => ({ ...emptyDraft(7), name: 'Watch', ...patch });

describe('the rule draft (spec §2.2)', () => {
  it('starts off, on entered, notifying me, waiting 30 days, private', () => {
    expect(emptyDraft(7)).toEqual({
      name: '', segment: 7, trigger: 'entered', score: '', direction: 'below', threshold: '', cadence: 'weekly', weekday: 0,
      actions: [NOTIFY_ME], cooldown: '30', isActive: false, sharing: 'private', sharedWith: [],
    });
  });

  it('sends only the fields the trigger uses (the server clears the rest too)', () => {
    expect(toTrigger(draft({ trigger: 'crossed', score: 'nps', direction: 'above', threshold: '-20' }))).toEqual({ trigger: 'crossed', score: 'nps', direction: 'above', threshold: -20, cadence: '', weekday: null });
    expect(toTrigger(draft({ trigger: 'schedule', cadence: 'weekly', weekday: 2 }))).toEqual({ trigger: 'schedule', score: '', direction: '', threshold: null, cadence: 'weekly', weekday: 2 });
    expect(toTrigger(draft({ trigger: 'schedule', cadence: 'monthly', weekday: 2 }))).toEqual({ trigger: 'schedule', score: '', direction: '', threshold: null, cadence: 'monthly', weekday: null });
    expect(toTrigger(draft({ score: 'csat', threshold: '60' }))).toEqual({ trigger: 'entered', score: '', direction: '', threshold: null, cadence: '', weekday: null });
  });

  it('writes the whole rule: trimmed text, numbers, people only when chosen', () => {
    const body = toWrite(
      draft({
        name: '  Watch ',
        actions: [{ action: 'notify', to: 'me', people: [4], message: ' hi ' }, { action: 'task', title: ' Call ', assignee: 'me', due_in_days: 3 }],
        cooldown: '14',
        sharing: 'people',
        sharedWith: [{ id: 4, name: 'Carl CSM' }],
      }),
      'customer',
    );
    expect(body).toEqual({
      name: 'Watch', segment: 7, trigger: 'entered', score: '', direction: '', threshold: null, cadence: '', weekday: null,
      actions: [{ action: 'notify', to: 'me', people: [], message: 'hi' }, { action: 'task', title: 'Call', assignee: 'me', due_in_days: 3 }],
      cooldown_days: 14, is_active: false, sharing: 'people', shared_with: [4],
    });
    expect(toWrite(draft(), 'customer')).not.toHaveProperty('shared_with');
  });

  it('tests without a name, lending the rule being edited', () => {
    expect(toTestBody(draft({ name: '' }), 'customer', null)).toEqual({ segment: 7, trigger: 'entered', score: '', direction: '', threshold: null, cadence: '', weekday: null, actions: [NOTIFY_ME], cooldown_days: 30 });
    expect(toTestBody(draft(), 'customer', 5)).toMatchObject({ name: 'Watch', rule: 5 });
  });

  it('makes each new action with its defaults, the survey with Surveys own', () => {
    expect(newAction('task', 'customer', 'Acme Inc')).toEqual({ action: 'task', title: '', assignee: 'record_owner', due_in_days: 7 });
    expect(newAction('lifecycle', 'customer', 'Acme Inc')).toEqual({ action: 'lifecycle', stage: '' });
    expect(newAction('survey', 'customer', 'Acme Inc')).toEqual({ action: 'survey', survey_type: 'nps', subject: 'A quick question from Acme Inc', intro: '', roles: ['champion', 'decision_maker'], without_review: false });
    expect(newAction('survey', 'contact', 'Acme Inc')).toMatchObject({ roles: [] });
  });

  it('offers each unused action once, none past three, no lifecycle for contacts', () => {
    expect(availableActions([NOTIFY_ME], 'customer')).toEqual(['task', 'lifecycle', 'survey']);
    expect(availableActions([NOTIFY_ME], 'contact')).toEqual(['task', 'survey']);
    const three = [NOTIFY_ME, newAction('task', 'customer', 'A'), newAction('survey', 'customer', 'A')];
    expect(availableActions(three, 'customer')).toEqual([]);
  });

  it("follows the segment's kind with a survey's roles", () => {
    const survey = newAction('survey', 'customer', 'A');
    expect(withKind([survey], 'contact')).toEqual([{ ...survey, roles: [] }]);
    expect(withKind([{ ...survey, roles: [] }], 'account')).toEqual([{ ...survey, roles: ['champion', 'decision_maker'] }]);
    expect(withKind([{ ...survey, roles: ['economic_buyer'] }], 'customer')).toEqual([{ ...survey, roles: ['economic_buyer'] }]);
  });

  it('reads a saved rule back into the form', () => {
    const rule = {
      id: 5, name: 'Renewal watch', is_active: true, paused_reason: '', paused_message: '', segment: { id: 7, name: 'Renewal risk', kind: 'customer' },
      trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60, cadence: '', weekday: null, actions: [NOTIFY_ME], cooldown_days: 14,
      sharing: 'people', shared_with: [{ id: 4, name: 'Carl CSM' }], owner: { id: 1, name: 'Alice' }, is_owner: true, last_run: null,
      updated_at: '', created_at: '',
    } satisfies Rule;
    expect(fromRule(rule)).toEqual({
      name: 'Renewal watch', segment: 7, trigger: 'crossed', score: 'csat', direction: 'below', threshold: '60', cadence: 'weekly', weekday: 0,
      actions: [NOTIFY_ME], cooldown: '14', isActive: true, sharing: 'people', sharedWith: [{ id: 4, name: 'Carl CSM' }],
    });
  });
});

describe('client checks, in the backend sentences', () => {
  it('passes a complete rule', () => {
    expect(hasErrors(checkDraft(draft(), 'customer'))).toBe(false);
  });

  it('needs a name to save but not to test, and a segment for both', () => {
    expect(checkDraft(draft({ name: ' ', segment: null }), null).field).toEqual({ name: 'Give the rule a name.', segment: 'Choose a segment.' });
    expect(checkDraft(draft({ name: '' }), 'customer', { forTest: true }).field).toEqual({});
  });

  it('checks the line: score, value, its range, contacts and accounts', () => {
    expect(checkDraft(draft({ trigger: 'crossed' }), 'customer').field).toEqual({ score: 'Choose a score.', threshold: 'Choose a value.' });
    expect(checkDraft(draft({ trigger: 'crossed', score: 'health', threshold: '11' }), 'customer').field).toEqual({ threshold: 'Choose a value from 0 to 10.' });
    expect(checkDraft(draft({ trigger: 'crossed', score: 'ces', threshold: '50' }), 'account').field).toEqual({ score: 'Accounts have no CES; choose another score.' });
    expect(checkDraft(draft({ trigger: 'crossed', score: 'csat', threshold: '50' }), 'contact').field).toEqual({ trigger: 'Contacts have no scores; choose an organisation or account segment.' });
  });

  it('checks the wait between runs and the sharing', () => {
    expect(checkDraft(draft({ cooldown: '0' }), 'customer').field).toEqual({ cooldown_days: 'Choose 1 to 365 days.' });
    expect(checkDraft(draft({ cooldown: '2.5' }), 'customer').field).toEqual({ cooldown_days: 'Choose 1 to 365 days.' });
    expect(checkDraft(draft({ sharing: 'people' }), 'customer').field).toEqual({ shared_with: 'Choose at least one teammate.' });
  });

  it('checks each action at its own fields, aligned with the list', () => {
    const found = checkDraft(
      draft({
        actions: [
          { action: 'notify', to: 'people', people: [], message: '' },
          { action: 'task', title: ' ', assignee: 'me', due_in_days: 91 },
          { action: 'survey', survey_type: 'nps', subject: '', intro: '', roles: [], without_review: false },
        ],
      }),
      'customer',
    );
    expect(found.action).toEqual([
      { people: 'Choose at least one teammate.' },
      { title: 'Give the task a title.', due_in_days: 'Choose 0 to 90 days.' },
      { subject: 'Write a subject.', roles: 'Choose at least one role.' },
    ]);
    expect(checkDraft(draft({ actions: [{ action: 'lifecycle', stage: '' }] }), 'customer').action).toEqual([{ stage: 'Choose a lifecycle stage.' }]);
    expect(checkDraft(draft({ actions: [{ action: 'lifecycle', stage: 'live' }] }), 'contact').action).toEqual([{ action: 'Contacts have no lifecycle stage; choose an organisation or account segment.' }]);
    expect(checkDraft(draft({ actions: [] }), 'customer').field).toEqual({ actions: 'Choose 1 to 3 actions.' });
  });
});
```

Create `src/features/rules/ruleErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { firstError, hasErrors, NO_ERRORS, ruleErrors } from './ruleErrors';

const refused = (status: number, body: unknown) => new ApiError(status, body, 'Request failed');

describe('refusals at their fields (backend contract)', () => {
  it('puts each field message at its field and an unknown key on the form', () => {
    expect(ruleErrors(refused(400, { name: ['This field may not be blank.'], threshold: ['Choose a value from 0 to 100.'], rule: ['Nope.'] }))).toEqual({
      form: 'Nope.',
      field: { name: 'This field may not be blank.', threshold: 'Choose a value from 0 to 100.' },
      action: [],
    });
  });

  it('reads the actions list both ways: one message, or one per action', () => {
    expect(ruleErrors(refused(400, { actions: ['Each action can be used once per rule.'] }))).toEqual({ field: { actions: 'Each action can be used once per rule.' }, action: [] });
    expect(ruleErrors(refused(400, { actions: [{}, { title: ['Give the task a title.'] }] }))).toEqual({ field: {}, action: [{}, { title: 'Give the task a title.' }] });
  });

  it('puts the segment ownership 403 at the segment, other details on the form', () => {
    expect(ruleErrors(refused(403, { detail: 'A rule can only use your own segments.' }))).toEqual({ field: { segment: 'A rule can only use your own segments.' }, action: [] });
    expect(ruleErrors(refused(429, { detail: 'You can own at most 50 rules.' }))).toEqual({ form: 'You can own at most 50 rules.', field: {}, action: [] });
  });

  it('reads a 404 as gone, and anything else as the fallback', () => {
    expect(ruleErrors(refused(404, { detail: 'Not found.' })).form).toBe('This rule or its segment is no longer there.');
    expect(ruleErrors(new Error('offline')).form).toBe('Could not save this rule. Try again.');
    expect(ruleErrors(new Error('offline'), 'Could not test this rule.').form).toBe('Could not test this rule.');
  });

  it('tells whether anything is wrong, and gives one line for a place with no fields', () => {
    expect(hasErrors(NO_ERRORS)).toBe(false);
    expect(hasErrors({ field: {}, action: [{}, {}] })).toBe(false);
    expect(hasErrors({ field: {}, action: [{}, { title: 'x' }] })).toBe(true);
    expect(firstError({ field: { segment: 'Choose a segment.' }, action: [] })).toBe('Choose a segment.');
    expect(firstError({ form: 'Nope.', field: { segment: 'x' }, action: [] })).toBe('Nope.');
  });
});
```

Create `src/features/rules/ruleParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { openRun, scenariosTab } from './ruleParams';

describe('the rules URL state', () => {
  it('opens Rules unless the tab is canvas (plan Decision 2)', () => {
    expect(scenariosTab(new URLSearchParams(''))).toBe('rules');
    expect(scenariosTab(new URLSearchParams('tab=canvas'))).toBe('canvas');
    expect(scenariosTab(new URLSearchParams('tab=nonsense'))).toBe('rules');
  });

  it('reads ?run= as a night id, or nothing', () => {
    expect(openRun(new URLSearchParams('run=9'))).toBe(9);
    expect(openRun(new URLSearchParams('run=x'))).toBeNull();
    expect(openRun(new URLSearchParams(''))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/rules/ruleDraft.test.ts src/features/rules/ruleErrors.test.ts src/features/rules/ruleParams.test.ts`
Expected: FAIL, "Failed to resolve import "./ruleDraft"" (and the other two).

- [ ] **Step 3: Write the errors**

Create `src/features/rules/ruleErrors.ts`:

```ts
// A refusal, put where its key points (spec §2.2, "Save"; backend: "400 at
// the fields named", the actions as a list aligned with them). A `detail`
// goes to the form, except the segment-ownership 403, which belongs at the
// segment (contract gap 7).
import { ApiError } from '../../lib/apiClient';
import { SAY } from './ruleOptions';

export const RULE_FIELDS = [
  'name', 'segment', 'trigger', 'score', 'direction', 'threshold', 'cadence', 'weekday',
  'actions', 'cooldown_days', 'is_active', 'sharing', 'shared_with',
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];
/** One action's errors by its own keys (`title`, `stage`, `roles`, …). */
export type ActionErrors = Record<string, string>;
export interface RuleErrors {
  form?: string;
  field: Partial<Record<RuleField, string>>;
  action: ActionErrors[];
}

export const NO_ERRORS: RuleErrors = { field: {}, action: [] };
const GONE = 'This rule or its segment is no longer there.';

export function hasErrors(errors: RuleErrors): boolean {
  return Boolean(errors.form) || Object.keys(errors.field).length > 0 || errors.action.some((one) => Object.keys(one).length > 0);
}

const first = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

export function ruleErrors(err: unknown, fallback = 'Could not save this rule. Try again.'): RuleErrors {
  if (!(err instanceof ApiError)) return { form: fallback, field: {}, action: [] };
  if (err.status === 404) return { form: GONE, field: {}, action: [] };
  const out: RuleErrors = { field: {}, action: [] };
  const body = err.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key === 'detail' && typeof value === 'string') {
        if (value === SAY.NOT_SEGMENT_OWNER) out.field.segment = value;
        else out.form = value;
        continue;
      }
      if (key === 'actions' && Array.isArray(value) && value.some((item) => item !== null && typeof item === 'object')) {
        out.action = value.map((item) =>
          Object.fromEntries(
            Object.entries((item ?? {}) as Record<string, unknown>).flatMap(([name, messages]) => {
              const message = first(messages);
              return message ? [[name, message]] : [];
            }),
          ),
        );
        continue;
      }
      const message = first(value);
      if (!message) continue;
      if ((RULE_FIELDS as readonly string[]).includes(key)) out.field[key as RuleField] = message;
      else out.form ??= message;
    }
  }
  return hasErrors(out) ? out : { form: fallback, field: {}, action: [] };
}

/** One line, for a place that has no fields (the on/off switch). */
export function firstError(errors: RuleErrors): string {
  return errors.form ?? Object.values(errors.field)[0] ?? errors.action.flatMap((one) => Object.values(one))[0] ?? 'Something went wrong.';
}
```

- [ ] **Step 4: Write the draft**

Create `src/features/rules/ruleDraft.ts`:

```ts
// The rule builder's state, as plain data: made new or from a saved rule,
// turned into the write and test bodies, and checked before it is sent in
// the backend's own sentences (plan Decision 8).
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';
import { DEFAULT_ROLES } from '../surveys/questions';
import type { RuleErrors } from './ruleErrors';
import {
  actionsFor,
  COOLDOWN_DEFAULT,
  COOLDOWN_MAX,
  COOLDOWN_MIN,
  COOLDOWN_RANGE,
  DUE_DEFAULT,
  DUE_MAX,
  MAX_ACTIONS,
  MESSAGE_MAX,
  MIN_ACTIONS,
  NAME_NEEDED,
  SAY,
  SCORE_RANGES,
  thresholdRange,
  TITLE_MAX,
} from './ruleOptions';
import type {
  ActionType,
  Cadence,
  Direction,
  LifecycleAction,
  LifecycleStage,
  NotifyAction,
  Rule,
  RuleAction,
  RuleTestRequest,
  RuleWrite,
  Score,
  SurveyAction,
  TaskAction,
  Trigger,
  TriggerFields,
} from './ruleTypes';

/** A lifecycle action before its stage is chosen (plan Decision 10). */
export type LifecycleDraft = Omit<LifecycleAction, 'stage'> & { stage: LifecycleStage | '' };
export type ActionDraft = NotifyAction | TaskAction | LifecycleDraft | SurveyAction;

export interface RuleDraft {
  name: string;
  segment: number | null;
  trigger: Trigger;
  score: Score | '';
  direction: Direction;
  /** As typed: an empty or partial number is the user's to finish. */
  threshold: string;
  cadence: Cadence;
  weekday: number;
  actions: ActionDraft[];
  cooldown: string;
  isActive: boolean;
  sharing: Sharing;
  sharedWith: PersonRef[];
}

export const NOTIFY_ME: NotifyAction = { action: 'notify', to: 'me', people: [], message: '' };

/** Off, on entries, notifying me, every 30 days, private (spec §2.2). */
export function emptyDraft(segment: number | null): RuleDraft {
  return {
    name: '',
    segment,
    trigger: 'entered',
    score: '',
    direction: 'below',
    threshold: '',
    cadence: 'weekly',
    weekday: 0,
    actions: [{ ...NOTIFY_ME }],
    cooldown: String(COOLDOWN_DEFAULT),
    isActive: false,
    sharing: 'private',
    sharedWith: [],
  };
}

export function fromRule(rule: Rule): RuleDraft {
  return {
    name: rule.name,
    segment: rule.segment?.id ?? null,
    trigger: rule.trigger,
    score: rule.score,
    direction: rule.direction || 'below',
    threshold: rule.threshold === null ? '' : String(rule.threshold),
    cadence: rule.cadence || 'weekly',
    weekday: rule.weekday ?? 0,
    actions: rule.actions.map((action) => ({ ...action })),
    cooldown: String(rule.cooldown_days),
    isActive: rule.is_active,
    sharing: rule.sharing,
    sharedWith: rule.shared_with,
  };
}

/** Each action's defaults; the survey's are Surveys' own (plan Decision 11). */
export function newAction(type: ActionType, kind: SegmentKind | null, workspace: string): ActionDraft {
  switch (type) {
    case 'notify':
      return { ...NOTIFY_ME };
    case 'task':
      return { action: 'task', title: '', assignee: 'record_owner', due_in_days: DUE_DEFAULT };
    case 'lifecycle':
      return { action: 'lifecycle', stage: '' };
    case 'survey':
      return {
        action: 'survey',
        survey_type: 'nps',
        subject: `A quick question from ${workspace}`,
        intro: '',
        roles: kind === 'contact' ? [] : [...DEFAULT_ROLES],
        without_review: false,
      };
  }
}

/** The types still to add: each once, at most three, no lifecycle for contacts. */
export function availableActions(actions: readonly ActionDraft[], kind: SegmentKind | null): ActionType[] {
  if (actions.length >= MAX_ACTIONS) return [];
  return actionsFor(kind).filter((type) => !actions.some((action) => action.action === type));
}

/** A survey's roles follow the segment: none for contacts, Surveys'
 *  defaults back from contacts, a choice kept otherwise. */
export function withKind(actions: readonly ActionDraft[], kind: SegmentKind | null): ActionDraft[] {
  return actions.map((action) => {
    if (action.action !== 'survey') return action;
    if (kind === 'contact') return { ...action, roles: [] };
    if (action.roles.length === 0) return { ...action, roles: [...DEFAULT_ROLES] };
    return action;
  });
}

export function toTrigger(draft: RuleDraft): TriggerFields {
  const blank: TriggerFields = { trigger: draft.trigger, score: '', direction: '', threshold: null, cadence: '', weekday: null };
  if (draft.trigger === 'crossed') {
    const typed = draft.threshold.trim();
    const value = Number(typed);
    return { ...blank, score: draft.score, direction: draft.direction, threshold: typed === '' || Number.isNaN(value) ? null : value };
  }
  if (draft.trigger === 'schedule') return { ...blank, cadence: draft.cadence, weekday: draft.cadence === 'weekly' ? draft.weekday : null };
  return blank;
}

/** The actions as sent: trimmed, people only for "Chosen teammates", no
 *  roles for a contact segment. An unchosen stage goes as "" and the server
 *  answers at the field (the client check stops it first). */
export function toActions(draft: RuleDraft, kind: SegmentKind | null): RuleAction[] {
  return draft.actions.map((action) => {
    if (action.action === 'notify') return { ...action, people: action.to === 'people' ? action.people : [], message: action.message.trim() };
    if (action.action === 'task') return { ...action, title: action.title.trim() };
    if (action.action === 'survey') return { ...action, subject: action.subject.trim(), intro: action.intro.trim(), roles: kind === 'contact' ? [] : action.roles };
    return action as LifecycleAction;
  });
}

export function toWrite(draft: RuleDraft, kind: SegmentKind | null): RuleWrite {
  return {
    name: draft.name.trim(),
    segment: draft.segment,
    ...toTrigger(draft),
    actions: toActions(draft, kind),
    cooldown_days: Number(draft.cooldown),
    is_active: draft.isActive,
    sharing: draft.sharing,
    ...(draft.sharing === 'people' ? { shared_with: draft.sharedWith.map((person) => person.id) } : {}),
  };
}

export function toTestBody(draft: RuleDraft, kind: SegmentKind | null, ruleId: number | null): RuleTestRequest {
  const name = draft.name.trim();
  return {
    ...(name ? { name } : {}),
    segment: draft.segment,
    ...toTrigger(draft),
    actions: toActions(draft, kind),
    cooldown_days: Number(draft.cooldown),
    ...(ruleId !== null ? { rule: ruleId } : {}),
  };
}

function checkAction(action: ActionDraft, kind: SegmentKind | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (action.action === 'notify') {
    if (action.to === 'people' && action.people.length === 0) out.people = SAY.NO_PEOPLE;
    if (action.message.trim().length > MESSAGE_MAX) out.message = SAY.LONG_MESSAGE;
  } else if (action.action === 'task') {
    const title = action.title.trim();
    if (!title) out.title = SAY.NO_TITLE;
    else if (title.length > TITLE_MAX) out.title = SAY.LONG_TITLE;
    if (!Number.isInteger(action.due_in_days) || action.due_in_days < 0 || action.due_in_days > DUE_MAX) out.due_in_days = SAY.DUE_RANGE;
  } else if (action.action === 'lifecycle') {
    if (kind === 'contact') out.action = SAY.NO_CONTACT_LIFECYCLE;
    else if (!action.stage) out.stage = SAY.CHOOSE_STAGE;
  } else {
    if (!action.subject.trim()) out.subject = SAY.NO_SUBJECT;
    if (kind !== null && kind !== 'contact' && action.roles.length === 0) out.roles = SAY.NO_ROLES;
  }
  return out;
}

/** What the server would refuse, said first. A test needs no name and no
 *  sharing (the test endpoint saves nothing). */
export function checkDraft(draft: RuleDraft, kind: SegmentKind | null, { forTest = false }: { forTest?: boolean } = {}): RuleErrors {
  const field: RuleErrors['field'] = {};
  if (!forTest && !draft.name.trim()) field.name = NAME_NEEDED;
  if (draft.segment === null) field.segment = SAY.CHOOSE_SEGMENT;
  if (draft.trigger === 'crossed') {
    if (kind === 'contact') {
      field.trigger = SAY.NO_CONTACT_SCORES;
    } else {
      if (!draft.score) field.score = SAY.CHOOSE_SCORE;
      else if (kind === 'account' && draft.score === 'ces') field.score = SAY.NO_ACCOUNT_CES;
      const typed = draft.threshold.trim();
      const value = Number(typed);
      if (typed === '' || Number.isNaN(value)) {
        field.threshold = SAY.CHOOSE_THRESHOLD;
      } else if (draft.score) {
        const [low, high] = SCORE_RANGES[draft.score];
        if (value < low || value > high) field.threshold = thresholdRange(draft.score);
      }
    }
  }
  const cooldown = Number(draft.cooldown);
  if (draft.cooldown.trim() === '' || !Number.isInteger(cooldown) || cooldown < COOLDOWN_MIN || cooldown > COOLDOWN_MAX) field.cooldown_days = COOLDOWN_RANGE;
  if (!forTest && draft.sharing === 'people' && draft.sharedWith.length === 0) field.shared_with = SAY.NO_PEOPLE;
  if (draft.actions.length < MIN_ACTIONS || draft.actions.length > MAX_ACTIONS) field.actions = SAY.ACTION_COUNT;
  return { field, action: draft.actions.map((action) => checkAction(action, kind)) };
}
```

- [ ] **Step 5: Write the URL state**

Create `src/features/rules/ruleParams.ts`:

```ts
// The Scenarios pages' URL state: which tab (/scenarios?tab=) and which
// night is open on a rule (/scenarios/rules/:id?run=, the rule_fired link).
export type ScenariosTab = 'rules' | 'canvas';

/** Rules unless `?tab=canvas` (plan Decision 2). */
export function scenariosTab(search: URLSearchParams): ScenariosTab {
  return search.get('tab') === 'canvas' ? 'canvas' : 'rules';
}

export function openRun(search: URLSearchParams): number | null {
  const value = search.get('run');
  return value && /^\d+$/.test(value) ? Number(value) : null;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/rules/ruleDraft.test.ts src/features/rules/ruleErrors.test.ts src/features/rules/ruleParams.test.ts`
Expected: PASS (20 tests).

- [ ] **Step 7: Commit**

```bash
git add src/features/rules/ruleDraft.ts src/features/rules/ruleErrors.ts src/features/rules/ruleParams.ts src/features/rules/ruleDraft.test.ts src/features/rules/ruleErrors.test.ts src/features/rules/ruleParams.test.ts
git commit -m "feat(rules): the builder's draft, its checks, refusals at their fields

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: The API and the contract stub, with the stub's nightly run

Spec §1.5 (as the backend serves it), §4 "Frontend" (every UI test runs on the stub), backend Decisions 13, 14, 15, 19, 23–28 and its contract section.

**Files:**
- Create: `src/features/rules/ruleApi.ts`, `src/features/rules/testRules.ts`
- Modify: `src/features/surveys/testSurveys.ts` (`addSend` in the returned object)
- Test: `src/features/rules/ruleApi.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `SAY`, `SCORE_RANGES`, `thresholdRange`; `apiFetch`, `ApiError` (`lib/apiClient`); `stubSurveys`, `StoredSend`, `SurveysStub`, `NOW`, `requestsOf` (`features/surveys/testSurveys`); `ME`, `CARL`, `DANA`, `SEGMENTS`, `TEAM` (`features/segments/testSegments`); `formatDate`.
- Produces:
  - `ruleApi.ts`: `RULES_PATH`, `fetchRules(scope?)`, `fetchRule(id)`, `createRule(body)`, `updateRule(id, body)`, `deleteRule(id)`, `testRule(body)`, `fetchRuns(id, cursor)`, `fetchRun(id, runId)`, `fetchReviews(status?)`, `approveReview(id)`, `skipReview(id)`.
  - `testRules.ts`: `StoredRule`, `StubRun`, `NOTIFY_ME_ACTION`, `SURVEY_NPS`, `RENEWAL_WATCH` (id 5, mine, on, crossed CSAT below 60 on Renewal risk, survey + notify me, workspace), `WELCOME_TASKS` (id 6, mine, off, entered Champions, a task), `ORPHAN` (id 7, mine, off, paused `segment_gone`, no segment), `CARL_RULE` (id 8, Carl's, on, weekly Monday on EMEA accounts, lifecycle Renewal, shared with me), `DANA_RULE` (id 9, Dana's, private: a 404), `RULES`, `RUNS` (9 and 8 for rule 5; 12 for rule 8), `RUN_RECORDS`, `TOO_MANY`, `WAITING` (review 2), `REFUSED` (review 3, refused over 500 people), `REVIEWS`, `TESTS`, `NIGHT_DAY = '2026-10-05'`, `RulesStub`, `stubRules(stub?) → { spy, runNight(ruleId), tokensOf }`.
  - `testSurveys.ts`: `stubSurveys(...)` also returns `addSend(send: StoredSend)`.

- [ ] **Step 1: Write the failing test**

Create `src/features/rules/ruleApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { fetchSend } from '../surveys/surveyApi';
import { requestsOf } from '../surveys/testSurveys';
import {
  approveReview,
  createRule,
  deleteRule,
  fetchReviews,
  fetchRule,
  fetchRules,
  fetchRun,
  fetchRuns,
  skipReview,
  testRule,
  updateRule,
} from './ruleApi';
import { NOTIFY_ME_ACTION, RENEWAL_WATCH, stubRules, SURVEY_NPS, TOO_MANY } from './testRules';
import type { RuleWrite } from './ruleTypes';

const BODY: RuleWrite = {
  name: 'Unhappy renewals', segment: 7, trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60, cadence: '', weekday: null,
  actions: [NOTIFY_ME_ACTION], cooldown_days: 30, is_active: false, sharing: 'private',
};
const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err instanceof ApiError ? { status: err.status, body: err.body } : err;
  }
  throw new Error('expected a refusal');
};

describe('the rules API on the contract stub', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists readable rules by name, the last night the owner\'s alone', async () => {
    stubRules();
    const rows = await fetchRules();
    expect(rows.map((row) => row.name)).toEqual(['EMEA renewals', 'Old churn watch', 'Renewal watch', 'Welcome tasks']);
    expect(rows.find((row) => row.id === 5)?.last_run).toEqual({ run_on: '2026-10-04', fired: 3, waiting: true });
    expect(rows.find((row) => row.id === 8)?.last_run).toEqual({ run_on: '2026-09-28', fired: null, waiting: false });
    expect(rows.find((row) => row.id === 6)?.last_run).toBeNull();
    expect(rows[0]).not.toHaveProperty('shared_with');
  });

  it("reads one rule with its sharing, and Dana's private one as missing", async () => {
    stubRules();
    expect((await fetchRule(8)).shared_with).toEqual([{ id: 1, name: 'Alice' }]);
    expect(await refusal(fetchRule(9))).toEqual({ status: 404, body: { detail: 'Not found.' } });
  });

  it('creates a rule owned by me, off, and refuses the 51st', async () => {
    const { spy } = stubRules({ limit: 4 });
    const made = await createRule(BODY);
    expect(made).toMatchObject({ id: 100, name: 'Unhappy renewals', is_active: false, is_owner: true, segment: { id: 7, name: 'Renewal risk', kind: 'customer' } });
    expect(requestsOf(spy, 'POST', /^\/rules\/$/)[0].body).toEqual(BODY);
    expect(await refusal(createRule(BODY))).toEqual({ status: 429, body: { detail: 'You can own at most 50 rules.' } });
  });

  it('refuses at the fields the backend names', async () => {
    stubRules();
    expect(await refusal(createRule({ ...BODY, segment: 8 }))).toEqual({ status: 403, body: { detail: 'A rule can only use your own segments.' } });
    expect(await refusal(createRule({ ...BODY, segment: 9 }))).toEqual({ status: 400, body: { trigger: ['Contacts have no scores; choose an organisation or account segment.'] } });
    expect(await refusal(createRule({ ...BODY, threshold: 120 }))).toEqual({ status: 400, body: { threshold: ['Choose a value from 0 to 100.'] } });
    expect(await refusal(createRule({ ...BODY, actions: [NOTIFY_ME_ACTION, { action: 'task', title: '', assignee: 'me', due_in_days: 1 }] }))).toEqual({
      status: 400,
      body: { actions: [{}, { title: ['Give the task a title.'] }] },
    });
  });

  it("switches a rule on, refuses one with no segment or someone else's, and deletes", async () => {
    const { spy } = stubRules();
    expect((await updateRule(6, { is_active: true })).is_active).toBe(true);
    expect(requestsOf(spy, 'PATCH', /^\/rules\/6\/$/)[0].body).toEqual({ is_active: true });
    expect(await refusal(updateRule(7, { is_active: true }))).toEqual({ status: 400, body: { segment: ['Choose a segment.'] } });
    expect(await refusal(updateRule(8, { is_active: false }))).toEqual({ status: 403, body: { detail: "Only the rule's owner can change it." } });
    await deleteRule(6);
    expect(await refusal(fetchRule(6))).toMatchObject({ status: 404 });
  });

  it('tests a rule without saving it', async () => {
    const { spy } = stubRules();
    const result = await testRule({ ...BODY, rule: 5 });
    expect(result).toEqual({
      count: 3,
      records: [
        { kind: 'customer', id: 1, name: 'Globex' },
        { kind: 'customer', id: 2, name: 'Initech' },
        { kind: 'customer', id: 7, name: 'Pizza Hut' },
      ],
      hidden_count: 1,
      skipped: { cooldown: 1, cap: 0, not_visible: 1 },
    });
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)[0].body).toMatchObject({ rule: 5 });
    expect((await fetchRules()).length).toBe(4);
  });

  it('pages the nights under an opaque cursor, and reads a night twice filtered', async () => {
    const { spy } = stubRules({ pageSize: 1 });
    const first = await fetchRuns(5, null);
    expect(first.results.map((run) => run.id)).toEqual([9]);
    expect(first.next).toEqual(expect.any(String));
    const second = await fetchRuns(5, first.next);
    expect(second).toMatchObject({ results: [{ id: 8 }], next: null });
    expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/$/)[1].query.get('cursor')).toBe(first.next);
    const reader = await fetchRuns(8, null);
    expect(reader.results[0]).toMatchObject({ matched: null, skipped: null, review: null, fired: 1, hidden_count: 2 });
    expect(await fetchRun(8, 12)).toMatchObject({ hidden_count: 2, records: [{ name: 'Pizza EMEA', outcome: 'fired' }] });
  });

  it('lists my waiting reviews, approves one into a survey, and refuses a decided one', async () => {
    stubRules();
    expect((await fetchReviews()).map((review) => review.id)).toEqual([2, 3]);
    expect(await approveReview(2)).toEqual({ survey_send_id: 31 });
    expect(await fetchSend(31)).toMatchObject({ name: 'Renewal watch · 4 Oct 2026', survey_type: 'nps', status: 'sent', segment: { id: 7 } });
    expect((await fetchReviews()).map((review) => review.id)).toEqual([3]);
    expect(await refusal(approveReview(2))).toEqual({ status: 409, body: { detail: 'This review has already been decided.' } });
    expect((await skipReview(3)).status).toBe('skipped');
    expect(await fetchReviews()).toEqual([]);
  });

  it('keeps a refused approval waiting with its reason', async () => {
    stubRules({ refuse: TOO_MANY });
    expect(await refusal(approveReview(2))).toEqual({ status: 400, body: TOO_MANY });
    expect((await fetchReviews()).find((review) => review.id === 2)?.result).toEqual({ error: TOO_MANY });
  });

  it("runs a rule's night: records fired, a review waiting, the last run moved", async () => {
    const { runNight } = stubRules();
    const made = await createRule({ ...BODY, actions: [NOTIFY_ME_ACTION, SURVEY_NPS] });
    expect(runNight(made.id)).toBeNull(); // off: nothing runs
    await updateRule(made.id, { is_active: true });
    const run = runNight(made.id);
    expect(run).toMatchObject({ run_on: '2026-10-05', matched: 2, fired: 2, review: { status: 'waiting' } });
    expect((await fetchRule(made.id)).last_run).toEqual({ run_on: '2026-10-05', fired: 2, waiting: true });
    const reviews = await fetchReviews();
    expect(reviews[0]).toMatchObject({ rule: { id: made.id, name: 'Unhappy renewals' }, counts: { people: 3, records: 2 }, run_on: '2026-10-05' });
    expect((await fetchRun(made.id, run!.id)).records.map((record) => record.name)).toEqual(['Globex', 'Pizza Hut']);
    expect(RENEWAL_WATCH.actions).toEqual([SURVEY_NPS, NOTIFY_ME_ACTION]); // fixtures are copied, never mutated
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/rules/ruleApi.test.ts`
Expected: FAIL, "Failed to resolve import "./ruleApi"".

- [ ] **Step 3: Write the API**

Create `src/features/rules/ruleApi.ts`:

```ts
// Thin apiFetch wrappers over revenact-backend's /api/v1/rules/ (backend
// plan Task 12, docs/API_CONTRACTS.md `rules`).
import { apiFetch } from '../../lib/apiClient';
import type {
  ApproveAnswer,
  Rule,
  RuleReview,
  RuleRow,
  RuleScope,
  RuleTestRequest,
  RuleTestResult,
  RuleWrite,
  RunDetail,
  RunsPage,
  ReviewStatus,
} from './ruleTypes';

export const RULES_PATH = '/rules/';
const one = (id: number) => `${RULES_PATH}${id}/`;

/** Every rule the reader may read, by name, unpaginated. */
export function fetchRules(scope: RuleScope = 'all'): Promise<RuleRow[]> {
  return apiFetch<RuleRow[]>(scope === 'all' ? RULES_PATH : `${RULES_PATH}?scope=${scope}`);
}

export function fetchRule(id: number): Promise<Rule> {
  return apiFetch<Rule>(one(id));
}

/** A rule owned by the caller (201); 429 past 50. */
export function createRule(body: RuleWrite): Promise<Rule> {
  return apiFetch<Rule>(RULES_PATH, { method: 'POST', body });
}

/** Owner only. The builder sends the whole rule; the switch sends `is_active`. */
export function updateRule(id: number, body: Partial<RuleWrite>): Promise<Rule> {
  return apiFetch<Rule>(one(id), { method: 'PATCH', body });
}

export function deleteRule(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

/** Who the rule would act on tonight, checked as a save; nothing is written. */
export function testRule(body: RuleTestRequest): Promise<RuleTestResult> {
  return apiFetch<RuleTestResult>(`${RULES_PATH}test/`, { method: 'POST', body });
}

/** The rule's nights, newest first; `cursor` is passed through as given. */
export function fetchRuns(id: number, cursor: string | null): Promise<RunsPage> {
  return apiFetch<RunsPage>(cursor ? `${one(id)}runs/?cursor=${encodeURIComponent(cursor)}` : `${one(id)}runs/`);
}

export function fetchRun(id: number, runId: number): Promise<RunDetail> {
  return apiFetch<RunDetail>(`${one(id)}runs/${runId}/`);
}

/** The caller's own reviews (owner only). */
export function fetchReviews(status: ReviewStatus = 'waiting'): Promise<RuleReview[]> {
  return apiFetch<RuleReview[]>(`${RULES_PATH}reviews/?status=${status}`);
}

/** Sends the survey as the rule's owner. A Surveys refusal is a 400 with
 *  Surveys' own body; a decided review is a 409. */
export function approveReview(id: number): Promise<ApproveAnswer> {
  return apiFetch<ApproveAnswer>(`${RULES_PATH}reviews/${id}/approve/`, { method: 'POST' });
}

export function skipReview(id: number): Promise<RuleReview> {
  return apiFetch<RuleReview>(`${RULES_PATH}reviews/${id}/skip/`, { method: 'POST' });
}
```

- [ ] **Step 4: Let the Surveys stub take a send from outside**

In `src/features/surveys/testSurveys.ts`, replace the stub's last two lines:

```ts
  vi.stubGlobal('fetch', spy);
  return { spy, tokensOf: (sendId: number) => invites.filter((invite) => invite.send === sendId).map((invite) => invite.token) };
```

with:

```ts
  vi.stubGlobal('fetch', spy);
  return {
    spy,
    tokensOf: (sendId: number) => invites.filter((invite) => invite.send === sendId).map((invite) => invite.token),
    /** A send made elsewhere (a rule's approved survey, testRules.ts). */
    addSend: (send: StoredSend) => {
      sends.push({ ...send });
    },
  };
```

- [ ] **Step 5: Write the stub**

Create `src/features/rules/testRules.ts`:

```ts
// Test-only: rules in the backend's contract shapes (revenact-backend
// feat/rules, docs/API_CONTRACTS.md `rules`) and one fetch stub for every
// endpoint the Rules pages and the Review Queue's From your rules read. It
// keeps state: saves, switches, the nightly run (`runNight`), and an
// approval that creates a survey send in the Surveys stub. Paths it does
// not own fall through to stubSurveys, then stubSegments. The viewer is ME
// (Alice, id 1) of "Acme Inc".
import { vi } from 'vitest';
import { formatDate } from '../customers/formatters';
import type { PersonRef } from '../segments/segmentTypes';
import { CARL, DANA, ME, SEGMENTS, TEAM } from '../segments/testSegments';
import { NOW, stubSurveys, type StoredSend, type SurveysStub } from '../surveys/testSurveys';
import { SAY, SCORE_RANGES, thresholdRange } from './ruleOptions';
import type {
  NamedRecord,
  NotifyAction,
  ReviewRule,
  Rule,
  RuleAction,
  RuleReview,
  RuleRow,
  RuleTestResult,
  RunDetail,
  RunRow,
  Score,
  SurveyAction,
} from './ruleTypes';

type Answer = { status: number; body: unknown };

/** A rule as the stub keeps it; `last_run` is computed on every read. */
export type StoredRule = Omit<Rule, 'last_run'>;
/** A night with the owner's own figures and what a reader may count. */
export interface StubRun extends RunRow {
  rule: number;
  reader_fired: number;
}

export const NOTIFY_ME_ACTION: NotifyAction = { action: 'notify', to: 'me', people: [], message: '' };
export const SURVEY_NPS: SurveyAction = {
  action: 'survey',
  survey_type: 'nps',
  subject: 'A quick question from Acme Inc',
  intro: '',
  roles: ['champion', 'decision_maker'],
  without_review: false,
};

const RENEWAL_RISK = { id: 7, name: 'Renewal risk', kind: 'customer' as const };
const CHAMPIONS = { id: 9, name: 'Champions', kind: 'contact' as const };
const EMEA = { id: 8, name: 'EMEA accounts', kind: 'account' as const };
const BASE = {
  paused_reason: '' as const,
  paused_message: '',
  score: '' as const,
  direction: '' as const,
  threshold: null,
  cadence: '' as const,
  weekday: null,
  cooldown_days: 30,
  shared_with: [] as PersonRef[],
  created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-10-03T09:00:00Z',
};

/** Mine, on, shared with the workspace. */
export const RENEWAL_WATCH: StoredRule = {
  ...BASE, id: 5, name: 'Renewal watch', is_active: true, segment: RENEWAL_RISK, trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60,
  actions: [SURVEY_NPS, NOTIFY_ME_ACTION], sharing: 'workspace', owner: ME, is_owner: true,
};
/** Mine, off, never run. */
export const WELCOME_TASKS: StoredRule = {
  ...BASE, id: 6, name: 'Welcome tasks', is_active: false, segment: CHAMPIONS, trigger: 'entered',
  actions: [{ action: 'task', title: 'Say hello', assignee: 'record_owner', due_in_days: 3 }], sharing: 'private', owner: ME, is_owner: true,
};
/** Mine: it switched itself off when its segment was deleted. */
export const ORPHAN: StoredRule = {
  ...BASE, id: 7, name: 'Old churn watch', is_active: false, paused_reason: 'segment_gone', paused_message: 'Its segment was deleted.', segment: null,
  trigger: 'left', actions: [NOTIFY_ME_ACTION], sharing: 'private', owner: ME, is_owner: true,
};
/** Carl's, on, shared with me by name. */
export const CARL_RULE: StoredRule = {
  ...BASE, id: 8, name: 'EMEA renewals', is_active: true, segment: EMEA, trigger: 'schedule', cadence: 'weekly', weekday: 0,
  actions: [{ action: 'lifecycle', stage: 'renewal' }], sharing: 'people', shared_with: [ME], owner: CARL, is_owner: false,
};
/** Dana's, private: unreadable, so a 404 like a missing id. */
export const DANA_RULE: StoredRule = {
  ...BASE, id: 9, name: "Dana's rule", is_active: true, segment: null, trigger: 'entered', actions: [NOTIFY_ME_ACTION], sharing: 'private', owner: DANA, is_owner: false,
};
export const RULES: StoredRule[] = [RENEWAL_WATCH, WELCOME_TASKS, ORPHAN, CARL_RULE, DANA_RULE];

const NO_SKIPS = { cooldown: 0, cap: 0, not_visible: 0, failed: 0 };
const at = (day: string) => ({ started_at: `${day}T02:00:00Z`, finished_at: `${day}T02:00:05Z` });
export const RUNS: StubRun[] = [
  { id: 9, rule: 5, run_on: '2026-10-04', matched: 5, fired: 3, skipped: { cooldown: 1, cap: 0, not_visible: 1, failed: 0 }, review: { id: 2, status: 'waiting' }, hidden_count: 0, reader_fired: 3, ...at('2026-10-04') },
  { id: 8, rule: 5, run_on: '2026-10-03', matched: 1, fired: 1, skipped: NO_SKIPS, review: { id: 3, status: 'waiting' }, hidden_count: 0, reader_fired: 1, ...at('2026-10-03') },
  { id: 12, rule: 8, run_on: '2026-09-28', matched: 4, fired: 3, skipped: NO_SKIPS, review: null, hidden_count: 2, reader_fired: 1, ...at('2026-09-28') },
];

const QUEUED = { action: 'survey' as const, status: 'queued' as const, detail: '' };
const NOTIFIED = { action: 'notify' as const, status: 'done' as const, detail: '' };
const fired = (id: number, name: string) => ({ kind: 'customer' as const, id, name, outcome: 'fired' as const, reason: '' as const, actions: [QUEUED, NOTIFIED] });
export const RUN_RECORDS: Record<number, RunDetail> = {
  9: {
    id: 9, run_on: '2026-10-04', hidden_count: 0,
    records: [fired(1, 'Globex'), fired(2, 'Initech'), fired(7, 'Pizza Hut'), { kind: 'customer', id: 6, name: 'Shopify', outcome: 'skipped', reason: 'cooldown', actions: [] }],
  },
  8: { id: 8, run_on: '2026-10-03', hidden_count: 0, records: [fired(7, 'Pizza Hut')] },
  12: {
    id: 12, run_on: '2026-09-28', hidden_count: 2,
    records: [{ kind: 'account', id: 14, name: 'Pizza EMEA', outcome: 'fired', reason: '', actions: [{ action: 'lifecycle', status: 'done', detail: 'live → renewal' }] }],
  },
};

/** Surveys' refusal over 500 people, as stored on a review. */
export const TOO_MANY = { segment: ['This survey would reach 612 people; the most is 500.'] };

function reviewRule(rule: StoredRule): ReviewRule {
  const segment = rule.segment && rule.segment.id !== null ? { id: rule.segment.id, name: rule.segment.name, kind: rule.segment.kind } : null;
  return { id: rule.id, name: rule.name, trigger: rule.trigger, score: rule.score, direction: rule.direction, threshold: rule.threshold, cadence: rule.cadence, weekday: rule.weekday, segment };
}

/** Night 9's survey, waiting. */
export const WAITING: RuleReview = {
  id: 2, rule: reviewRule(RENEWAL_WATCH), run_on: '2026-10-04', action: SURVEY_NPS, counts: { people: 6, records: 4 }, organisation_name: 'Acme Inc',
  status: 'waiting', result: {}, created_at: '2026-10-04T02:00:05Z', expires_at: '2026-10-11T12:00:05Z', decided_at: null,
};
/** Night 8's survey: approved once, refused by Surveys, still waiting. */
export const REFUSED: RuleReview = {
  ...WAITING, id: 3, run_on: '2026-10-03', counts: { people: 612, records: 204 }, result: { error: TOO_MANY },
  created_at: '2026-10-03T02:00:05Z', expires_at: '2026-10-10T12:00:05Z',
};
export const REVIEWS: RuleReview[] = [WAITING, REFUSED];

/** POST /rules/test/ for each of my segments (7 Renewal risk, 9 Champions). */
export const TESTS: Record<number, RuleTestResult> = {
  7: {
    count: 3,
    records: [{ kind: 'customer', id: 1, name: 'Globex' }, { kind: 'customer', id: 2, name: 'Initech' }, { kind: 'customer', id: 7, name: 'Pizza Hut' }],
    hidden_count: 1,
    skipped: { cooldown: 1, cap: 0, not_visible: 1 },
  },
  9: { count: 2, records: [{ kind: 'contact', id: 51, name: 'Sam Patel' }, { kind: 'contact', id: 52, name: 'Lee Wong' }], hidden_count: 0, skipped: { cooldown: 0, cap: 0, not_visible: 0 } },
};

/** The night `runNight` runs, and whom it fires for each segment. */
export const NIGHT_DAY = '2026-10-05';
const NIGHT: Record<number, NamedRecord[]> = {
  7: [{ kind: 'customer', id: 1, name: 'Globex' }, { kind: 'customer', id: 7, name: 'Pizza Hut' }],
  9: [{ kind: 'contact', id: 51, name: 'Sam Patel' }],
};

const NOT_FOUND = { status: 404, body: { detail: 'Not found.' } };
const bad = (body: unknown): Answer => ({ status: 400, body });
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) });
const readable = (rule: StoredRule) => rule.is_owner || rule.sharing === 'workspace' || (rule.sharing === 'people' && rule.shared_with.some((person) => person.id === ME.id));
const teammates = (ids: unknown): PersonRef[] =>
  ((ids as number[] | undefined) ?? []).flatMap((id) => TEAM.filter((person) => person.id === id && person.is_active).map(({ id: pk, name }) => ({ id: pk, name })));

export interface RulesStub {
  rules?: StoredRule[];
  nights?: StubRun[];
  records?: Record<number, RunDetail>;
  reviews?: RuleReview[];
  /** 429 once ME owns this many (default 50, the backend's MAX_OWNED). */
  limit?: number;
  /** Nights a page holds (default 20, the backend's PAGE_SIZE). */
  pageSize?: number;
  list?: () => Answer;
  /** GET /rules/<id>/: an answer overrides the default; undefined falls through. */
  read?: (id: number) => Answer | undefined;
  create?: (body: Record<string, unknown>) => Answer;
  patch?: (id: number, body: Record<string, unknown>) => Answer;
  test?: (body: Record<string, unknown>) => Answer;
  /** GET runs/: undefined falls through. */
  runsPage?: (id: number, cursor: string | null) => Answer | undefined;
  /** GET runs/<run_id>/: undefined falls through. */
  run?: (id: number, runId: number) => Answer | undefined;
  reviewList?: () => Answer;
  /** POST approve/: undefined falls through. */
  approve?: (id: number) => Answer | undefined;
  /** Every approval is refused with this Surveys body (400), stored on the review. */
  refuse?: Record<string, unknown>;
  /** Passed to stubSurveys for everything this stub does not own. */
  surveys?: SurveysStub;
}

export function stubRules(stub: RulesStub = {}) {
  const rules: StoredRule[] = (stub.rules ?? RULES).map((rule) => ({ ...rule, actions: rule.actions.map((action) => ({ ...action })) }));
  const runs: StubRun[] = (stub.nights ?? RUNS).map((run) => ({ ...run }));
  const records: Record<number, RunDetail> = { ...(stub.records ?? RUN_RECORDS) };
  const reviews: RuleReview[] = (stub.reviews ?? REVIEWS).map((review) => ({ ...review, result: { ...review.result } }));
  const limit = stub.limit ?? 50;
  const pageSize = stub.pageSize ?? 20;
  const surveys = stubSurveys(stub.surveys);
  let nextRule = 100;
  let nextRun = 200;
  let nextReview = 300;
  let nextSend = 31;

  const lastRun = (rule: StoredRule) => {
    const latest = runs.filter((run) => run.rule === rule.id).sort((a, b) => b.run_on.localeCompare(a.run_on) || b.id - a.id)[0];
    if (!latest) return null;
    if (!rule.is_owner) return { run_on: latest.run_on, fired: null, waiting: false };
    return { run_on: latest.run_on, fired: latest.fired, waiting: latest.review?.status === 'waiting' };
  };
  const detail = (rule: StoredRule): Rule => ({ ...rule, shared_with: rule.sharing === 'people' ? rule.shared_with : [], last_run: lastRun(rule) });
  const row = (rule: StoredRule): RuleRow => {
    const full = detail(rule);
    return {
      id: full.id, name: full.name, is_active: full.is_active, paused_reason: full.paused_reason, paused_message: full.paused_message, segment: full.segment,
      trigger: full.trigger, score: full.score, direction: full.direction, threshold: full.threshold, cadence: full.cadence, weekday: full.weekday,
      actions: full.actions, cooldown_days: full.cooldown_days, sharing: full.sharing, owner: full.owner, is_owner: full.is_owner, last_run: full.last_run,
      updated_at: full.updated_at,
    };
  };

  /** RuleWriteSerializer, in brief: the merged rule checked against its
   *  segment's kind, 400 at the field named. Returns the fields to store. */
  const check = (data: Record<string, unknown>, current: StoredRule | null): Answer | Partial<StoredRule> => {
    const merged = { ...(current ?? { cooldown_days: 30, is_active: false, sharing: 'private' }), ...data } as Record<string, unknown>;
    if ((!current || 'name' in data) && !String(data.name ?? '').trim()) return bad({ name: ['This field may not be blank.'] });
    let segment = current?.segment ?? null;
    if ('segment' in data) {
      if (data.segment === null || data.segment === undefined) {
        segment = null;
      } else {
        const found = SEGMENTS.find((candidate) => candidate.id === data.segment);
        if (!found) return NOT_FOUND;
        if (!found.is_owner) return { status: 403, body: { detail: SAY.NOT_SEGMENT_OWNER } };
        segment = { id: found.id, name: found.name, kind: found.kind };
      }
    }
    if (segment === null && (!current || 'segment' in data || merged.is_active === true)) return bad({ segment: [SAY.CHOOSE_SEGMENT] });
    const kind = segment?.kind ?? null;
    if (merged.trigger === 'crossed') {
      if (kind === 'contact') return bad({ trigger: [SAY.NO_CONTACT_SCORES] });
      const score = merged.score as Score | '';
      if (!score) return bad({ score: [SAY.CHOOSE_SCORE] });
      if (kind === 'account' && score === 'ces') return bad({ score: [SAY.NO_ACCOUNT_CES] });
      const threshold = merged.threshold as number | null;
      if (threshold === null || threshold === undefined) return bad({ threshold: [SAY.CHOOSE_THRESHOLD] });
      const [low, high] = SCORE_RANGES[score];
      if (threshold < low || threshold > high) return bad({ threshold: [thresholdRange(score)] });
    }
    const actions = merged.actions as RuleAction[];
    if (!Array.isArray(actions) || actions.length < 1 || actions.length > 3) return bad({ actions: [SAY.ACTION_COUNT] });
    if (new Set(actions.map((action) => action.action)).size !== actions.length) return bad({ actions: [SAY.ONE_OF_EACH] });
    const errors = actions.map((action): Record<string, string[]> => {
      if (action.action === 'task' && !action.title.trim()) return { title: [SAY.NO_TITLE] };
      if (action.action === 'lifecycle' && kind === 'contact') return { action: [SAY.NO_CONTACT_LIFECYCLE] };
      if (action.action === 'lifecycle' && !action.stage) return { stage: [SAY.CHOOSE_STAGE] };
      if (action.action === 'survey' && kind !== 'contact' && action.roles.length === 0) return { roles: [SAY.NO_ROLES] };
      if (action.action === 'notify' && action.to === 'people' && action.people.length === 0) return { people: [SAY.NO_PEOPLE] };
      return {};
    });
    if (errors.some((one) => Object.keys(one).length > 0)) return bad({ actions: errors });
    const cooldown = merged.cooldown_days as number;
    if (!Number.isInteger(cooldown) || cooldown < 1) return bad({ cooldown_days: ['Ensure this value is greater than or equal to 1.'] });
    if (cooldown > 365) return bad({ cooldown_days: ['Ensure this value is less than or equal to 365.'] });
    const people = 'shared_with' in data ? teammates(data.shared_with) : (current?.shared_with ?? []);
    if (merged.sharing === 'people' && people.length === 0) return bad({ shared_with: [SAY.NO_PEOPLE] });
    const blank = { score: '' as const, direction: '' as const, threshold: null, cadence: '' as const, weekday: null };
    const trigger =
      merged.trigger === 'crossed'
        ? { ...blank, score: merged.score as Score, direction: merged.direction as 'below' | 'above', threshold: merged.threshold as number }
        : merged.trigger === 'schedule'
          ? { ...blank, cadence: merged.cadence as 'weekly' | 'monthly', weekday: merged.cadence === 'weekly' ? (merged.weekday as number) : null }
          : blank;
    return {
      name: String(merged.name).trim(),
      segment,
      trigger: merged.trigger as StoredRule['trigger'],
      ...trigger,
      actions,
      cooldown_days: cooldown,
      is_active: Boolean(merged.is_active),
      sharing: merged.sharing as StoredRule['sharing'],
      shared_with: merged.sharing === 'people' ? people : [],
    };
  };
  const refused = (value: Answer | Partial<StoredRule>): value is Answer => 'status' in value && 'body' in value;

  /** reviews.send_review: a survey send named "{rule} · 4 Oct 2026", owned
   *  by the rule's owner, in the Surveys stub. */
  const approve = (review: RuleReview): Answer => {
    if (stub.refuse) {
      review.result = { error: stub.refuse };
      return { status: 400, body: stub.refuse };
    }
    const id = nextSend++;
    const send: StoredSend = {
      id, name: `${review.rule.name} · ${formatDate(review.run_on)}`, survey_type: review.action.survey_type, subject: review.action.subject,
      intro: review.action.intro, segment: review.rule.segment, roles: review.action.roles, status: 'sent', sharing: 'private', shared_with: [],
      owner: ME, is_owner: true, started_at: NOW, sent_at: NOW,
      counts: { audience: review.counts.people, sent: review.counts.people, failed: 0, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0 },
      created_at: NOW, updated_at: NOW,
    };
    surveys.addSend(send);
    Object.assign(review, { status: 'approved', result: { survey_send_id: id }, decided_at: NOW });
    const run = runs.find((candidate) => candidate.review?.id === review.id);
    if (run) run.review = { id: review.id, status: 'approved' };
    return { status: 200, body: { survey_send_id: id } };
  };

  /** One night of an active rule (nightly.run_rule, in brief): the
   *  segment's NIGHT records fire, a survey becomes a waiting review (or is
   *  approved at once without review). Returns the night, or null when
   *  nothing runs. */
  const runNight = (ruleId: number): StubRun | null => {
    const rule = rules.find((candidate) => candidate.id === ruleId);
    if (!rule || !rule.is_active || !rule.segment || rule.segment.id === null) return null;
    const hits = NIGHT[rule.segment.id] ?? [];
    const run: StubRun = {
      id: nextRun++, rule: rule.id, run_on: NIGHT_DAY, matched: hits.length, fired: hits.length, skipped: { ...NO_SKIPS }, review: null,
      hidden_count: 0, reader_fired: hits.length, ...at(NIGHT_DAY),
    };
    records[run.id] = {
      id: run.id, run_on: NIGHT_DAY, hidden_count: 0,
      records: hits.map((hit) => ({ ...hit, outcome: 'fired', reason: '', actions: rule.actions.map((action) => ({ action: action.action, status: action.action === 'survey' ? 'queued' : 'done', detail: '' })) })),
    };
    const survey = rule.actions.find((action): action is SurveyAction => action.action === 'survey');
    runs.unshift(run);
    if (survey && hits.length > 0) {
      const review: RuleReview = {
        id: nextReview++, rule: reviewRule(rule), run_on: NIGHT_DAY, action: { ...survey }, counts: { people: hits.length + 1, records: hits.length },
        organisation_name: 'Acme Inc', status: 'waiting', result: {}, created_at: `${NIGHT_DAY}T02:00:05Z`, expires_at: '2026-10-12T12:00:05Z', decided_at: null,
      };
      reviews.unshift(review);
      run.review = { id: review.id, status: 'waiting' };
      if (survey.without_review) approve(review);
    }
    return run;
  };

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    if (path === '/rules/' && method === 'GET') {
      if (stub.list) return reply(stub.list());
      const scope = url.searchParams.get('scope');
      const rows = rules
        .filter(readable)
        .filter((rule) => (scope === 'mine' ? rule.is_owner : scope === 'shared' ? !rule.is_owner : true))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
        .map(row);
      return json(200, rows);
    }
    if (path === '/rules/' && method === 'POST') {
      if (stub.create) return reply(stub.create(body));
      const checked = check(body, null);
      if (refused(checked)) return reply(checked);
      if (rules.filter((rule) => rule.is_owner).length >= limit) return json(429, { detail: SAY.LIMIT_REACHED });
      const made = { ...BASE, ...checked, id: nextRule++, owner: ME, is_owner: true, created_at: NOW, updated_at: NOW } as StoredRule;
      rules.push(made);
      return json(201, detail(made));
    }
    if (path === '/rules/test/' && method === 'POST') {
      if (stub.test) return reply(stub.test(body));
      const { rule: lent, ...rest } = body;
      const checked = check({ name: 'Test', ...rest }, null);
      if (refused(checked)) return reply(checked);
      void lent;
      const segmentId = (checked.segment as { id: number }).id;
      return json(200, TESTS[segmentId] ?? { count: 0, records: [], hidden_count: 0, skipped: { cooldown: 0, cap: 0, not_visible: 0 } });
    }
    if (path === '/rules/reviews/' && method === 'GET') {
      if (stub.reviewList) return reply(stub.reviewList());
      const wanted = url.searchParams.get('status') ?? 'waiting';
      const mine = reviews.filter((review) => review.status === wanted && rules.some((rule) => rule.id === review.rule.id && rule.is_owner));
      return json(200, mine);
    }
    const decide = /^\/rules\/reviews\/(\d+)\/(approve|skip)\/$/.exec(path);
    if (decide && method === 'POST') {
      const id = Number(decide[1]);
      if (decide[2] === 'approve') {
        const override = stub.approve?.(id);
        if (override) return reply(override);
      }
      const review = reviews.find((candidate) => candidate.id === id && rules.some((rule) => rule.id === candidate.rule.id && rule.is_owner));
      if (!review) return reply(NOT_FOUND);
      if (review.status !== 'waiting') return json(409, { detail: SAY.ALREADY_DECIDED });
      if (decide[2] === 'approve') return reply(approve(review));
      Object.assign(review, { status: 'skipped', decided_at: NOW });
      const run = runs.find((candidate) => candidate.review?.id === review.id);
      if (run) run.review = { id: review.id, status: 'skipped' };
      return json(200, review);
    }

    const found = /^\/rules\/(\d+)\/(.*)$/.exec(path);
    if (found) {
      const id = Number(found[1]);
      const rest = found[2];
      const rule = rules.find((candidate) => candidate.id === id);
      // Unreadable reads the same as missing, on every sub-path.
      if (!rule || !readable(rule)) return reply(NOT_FOUND);
      if (rest === '' && method === 'GET') {
        const override = stub.read?.(id);
        return override ? reply(override) : json(200, detail(rule));
      }
      if (rest === '' && method === 'PATCH') {
        if (stub.patch) return reply(stub.patch(id, body));
        if (!rule.is_owner) return json(403, { detail: SAY.NOT_OWNER });
        const checked = check(body, rule);
        if (refused(checked)) return reply(checked);
        const turnedOn = checked.is_active === true && !rule.is_active;
        Object.assign(rule, checked, { updated_at: NOW });
        if (turnedOn) Object.assign(rule, { paused_reason: '', paused_message: '' });
        return json(200, detail(rule));
      }
      if (rest === '' && method === 'DELETE') {
        if (!rule.is_owner) return json(403, { detail: SAY.NOT_OWNER });
        rules.splice(rules.indexOf(rule), 1);
        return json(204, null);
      }
      if (rest === 'runs/' && method === 'GET') {
        const cursor = url.searchParams.get('cursor');
        const override = stub.runsPage?.(id, cursor);
        if (override) return reply(override);
        const nights = runs.filter((run) => run.rule === id).sort((a, b) => b.run_on.localeCompare(a.run_on) || b.id - a.id);
        // An opaque cursor: the stub's is base64 of the start index.
        const start = cursor ? Number(atob(cursor)) || 0 : 0;
        const page = nights.slice(start, start + pageSize).map(({ rule: owner, reader_fired: readerFired, ...run }) => {
          void owner;
          return rule.is_owner ? run : { ...run, matched: null, skipped: null, review: null, fired: readerFired };
        });
        return json(200, { results: page, next: start + pageSize < nights.length ? btoa(String(start + pageSize)) : null });
      }
      const night = /^runs\/(\d+)\/$/.exec(rest);
      if (night && method === 'GET') {
        const runId = Number(night[1]);
        const override = stub.run?.(id, runId);
        if (override) return reply(override);
        const run = runs.find((candidate) => candidate.id === runId && candidate.rule === id);
        return run && records[runId] ? json(200, records[runId]) : reply(NOT_FOUND);
      }
    }

    if (path === '/scenarios/' && method === 'GET') return json(200, []);
    if (path === '/metrics/proposals/' && method === 'GET') return json(200, { pending: 0, proposals: [] });
    return surveys.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, runNight, tokensOf: surveys.tokensOf };
}

export type RulesSpy = ReturnType<typeof stubRules>['spy'];
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/features/rules/ruleApi.test.ts src/features/surveys/surveyApi.test.ts`
Expected: PASS (10 rules tests; the Surveys API tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/features/rules/ruleApi.ts src/features/rules/testRules.ts src/features/rules/ruleApi.test.ts src/features/surveys/testSurveys.ts
git commit -m "feat(rules): the rules API and a contract stub with its nightly run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Share the roles fieldset and the segment options with rules

Spec §2.2 ("Send survey (type, roles, subject, intro, …)" and "**in** [one of my segments]"). DRY: the survey builder's `AudienceFields` already draws both; this task lifts them out unchanged so a rule's survey card and its trigger reuse them. No behaviour changes in Surveys.

**Files:**
- Create: `src/components/surveys/RoleFields.tsx`, `src/components/surveys/SegmentOptions.tsx`
- Modify: `src/components/surveys/AudienceFields.tsx`
- Test: `src/components/surveys/RoleFields.test.tsx`, `src/components/surveys/SegmentOptions.test.tsx` (and the existing `AudienceFields.test.tsx`, `src/pages/surveys/SurveyBuilder.test.tsx` must still pass)

**Interfaces:**
- Consumes: `CONTACT_ROLES` (`features/contacts/contactsParams`), `KIND_LABEL` (`features/segments/segmentFields`).
- Produces:
  - `RoleFields({ kind, roles, error?, onRoles })`: nothing for a contact segment or none; otherwise the "Who to ask at each organisation|account" fieldset of role checkboxes, in the order ticked, with its hint and error.
  - `SegmentOptions({ rows, fallback })`: a select's `<option>`s: "Loading your segments…" or "Choose a segment…", the fallback segment when it is not among `rows`, then `rows` grouped by kind in `<optgroup>`s labelled Organisations, Accounts, Contacts.

- [ ] **Step 1: Write the failing tests**

Create `src/components/surveys/RoleFields.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoleFields } from './RoleFields';

describe('RoleFields (shared by Surveys and rules)', () => {
  it('asks nothing of a contact segment, or before a segment is chosen', () => {
    const { container, rerender } = render(<RoleFields kind="contact" roles={[]} onRoles={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RoleFields kind={null} roles={[]} onRoles={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks who at each account, keeping roles in the order ticked', async () => {
    const onRoles = vi.fn();
    render(<RoleFields kind="account" roles={['decision_maker']} onRoles={onRoles} />);
    expect(screen.getByRole('group', { name: 'Who to ask at each account' })).toBeInTheDocument();
    expect(screen.getByText('Up to 3 people per account, in the order you tick the roles.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Champion' }));
    expect(onRoles).toHaveBeenLastCalledWith(['decision_maker', 'champion']);
  });

  it('shows its error under the boxes', () => {
    render(<RoleFields kind="customer" roles={[]} error="Choose at least one role." onRoles={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Who to ask at each organisation' })).toHaveTextContent('Choose at least one role.');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one role.');
  });
});
```

Create `src/components/surveys/SegmentOptions.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CHAMPIONS, listRow, RENEWAL_RISK } from '../../features/segments/testSegments';
import { SegmentOptions } from './SegmentOptions';

const pick = (props: Parameters<typeof SegmentOptions>[0]) =>
  render(
    <select aria-label="Segment" defaultValue="">
      <SegmentOptions {...props} />
    </select>,
  );

describe('SegmentOptions (shared by Surveys and rules)', () => {
  it('groups my segments by kind under a prompt', () => {
    pick({ rows: [listRow(RENEWAL_RISK), listRow(CHAMPIONS)], fallback: null });
    const select = screen.getByRole('combobox', { name: 'Segment' });
    expect(select.querySelector('option')).toHaveTextContent('Choose a segment…');
    expect(select.querySelector('optgroup[label="Organisations"]')).toHaveTextContent('Renewal risk');
    expect(select.querySelector('optgroup[label="Contacts"]')).toHaveTextContent('Champions');
    expect(select.querySelector('optgroup[label="Accounts"]')).toBeNull();
  });

  it('says it is loading, and keeps a saved segment that is not among mine', () => {
    pick({ rows: null, fallback: { id: 40, name: 'Old list', kind: 'customer' } });
    const options = [...screen.getByRole('combobox', { name: 'Segment' }).querySelectorAll('option')].map((option) => option.textContent);
    expect(options).toEqual(['Loading your segments…', 'Old list']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/surveys/RoleFields.test.tsx src/components/surveys/SegmentOptions.test.tsx`
Expected: FAIL, "Failed to resolve import "./RoleFields"" (and "./SegmentOptions").

- [ ] **Step 3: Write the two parts**

Create `src/components/surveys/RoleFields.tsx`:

```tsx
import { useId } from 'react';
import { CONTACT_ROLES } from '../../features/contacts/contactsParams';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import type { ContactRole } from '../../features/surveys/surveyTypes';

const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

/** Which roles to ask at each organisation or account, in the order ticked
 *  (Surveys spec §2.2; the backend asks in that order, at most 3 per
 *  record). Shared by the survey builder and a rule's Send a survey card.
 *  Nothing for a contact segment, or before a segment is chosen. */
export function RoleFields({ kind, roles, error, onRoles }: { kind: SegmentKind | null; roles: ContactRole[]; error?: string; onRoles: (roles: ContactRole[]) => void }) {
  const rolesId = useId();
  if (kind !== 'customer' && kind !== 'account') return null;
  const place = kind === 'account' ? 'account' : 'organisation';
  const toggle = (role: ContactRole, on: boolean) => onRoles(on ? [...roles, role] : roles.filter((ticked) => ticked !== role));
  return (
    <fieldset aria-describedby={`${rolesId}-hint`} className="flex flex-col gap-1">
      <legend className={`${LABEL} mb-1`}>Who to ask at each {place}</legend>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        {CONTACT_ROLES.map((role) => (
          <label key={role.value} className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-ink sm:min-h-9">
            <input type="checkbox" checked={roles.includes(role.value)} onChange={(event) => toggle(role.value, event.target.checked)} className="h-4 w-4 accent-accent" />
            {role.label}
          </label>
        ))}
      </div>
      <p id={`${rolesId}-hint`} className="text-[11px] text-ink-muted">
        Up to 3 people per {place}, in the order you tick the roles.
      </p>
      {error ? (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
```

Create `src/components/surveys/SegmentOptions.tsx`:

```tsx
import { KIND_LABEL } from '../../features/segments/segmentFields';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { SegmentRef } from '../../features/surveys/surveyTypes';

const KIND_ORDER: readonly SegmentKind[] = ['customer', 'account', 'contact'];

/** A segment select's options: the caller's own segments (null while
 *  loading) grouped by kind, and the saved one kept when it is not among
 *  them. Shared by the survey builder and a rule's trigger. */
export function SegmentOptions({ rows, fallback }: { rows: SegmentListRow[] | null; fallback: SegmentRef | null }) {
  const listed = rows ?? [];
  const extra = fallback && fallback.id !== null && !listed.some((row) => row.id === fallback.id) ? fallback : null;
  return (
    <>
      <option value="">{rows === null ? 'Loading your segments…' : 'Choose a segment…'}</option>
      {extra ? <option value={String(extra.id)}>{extra.name}</option> : null}
      {KIND_ORDER.map((group) => {
        const grouped = listed.filter((row) => row.kind === group);
        return grouped.length > 0 ? (
          <optgroup key={group} label={KIND_LABEL[group]}>
            {grouped.map((row) => (
              <option key={row.id} value={String(row.id)}>
                {row.name}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </>
  );
}
```

- [ ] **Step 4: Use them in `AudienceFields`**

Replace `src/components/surveys/AudienceFields.tsx` with (the same props, markup and copy; the options and the roles now come from the two parts):

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { ContactRole, SegmentRef } from '../../features/surveys/surveyTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS } from '../organizations/portfolio/styles';
import { RoleFields } from './RoleFields';
import { SegmentOptions } from './SegmentOptions';

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
  const listed = segments ?? [];
  const describedBy = [`${selectId}-hint`, errors.segment ? `${selectId}-error` : null].filter(Boolean).join(' ');

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
          <SegmentOptions rows={segments} fallback={fallback} />
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
      <RoleFields kind={kind} roles={roles} error={errors.roles} onRoles={onRoles} />
    </section>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/surveys src/pages/surveys/SurveyBuilder.test.tsx src/pages/surveys/surveyThese.test.tsx`
Expected: PASS (the five new tests, and every Surveys test unchanged, the house-rules suite included).

- [ ] **Step 6: Commit**

```bash
git add src/components/surveys/RoleFields.tsx src/components/surveys/SegmentOptions.tsx src/components/surveys/AudienceFields.tsx src/components/surveys/RoleFields.test.tsx src/components/surveys/SegmentOptions.test.tsx
git commit -m "refactor(surveys): share the roles fieldset and the segment options

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The switches: on/off with a confirm, in a dialog or in place

Spec §2.1 ("an on/off switch (owner only)"), §2.2 ("turning on (here or on the row) and ticking "Send without review" each confirm first"), §2.3; plan Decisions 5 and 20.

**Files:**
- Create: `src/components/rules/switchParts.tsx`, `src/components/rules/InlineConfirm.tsx`, `src/components/rules/ConfirmedSwitch.tsx`, `src/components/rules/RuleSwitch.tsx`
- Test: `src/components/rules/ConfirmedSwitch.test.tsx`, `src/components/rules/RuleSwitch.test.tsx`

**Interfaces:**
- Consumes: `updateRule` (Task 3), `ruleErrors`, `firstError` (Task 2), `turnOnText` (Task 1), `ConfirmDialog` (`components/organizations/ConfirmDialog`), `FOCUS`, `PRIMARY`, `QUIET`; the stub's `RENEWAL_WATCH`, `WELCOME_TASKS`, `ORPHAN`.
- Produces:
  - `SWITCH` (class string), `Track({ on })`.
  - `InlineConfirm({ title, message, confirmLabel, onConfirm, onCancel })`: a `role="group"` named by its title; focuses the title on mount; Escape cancels it (and is not seen by the builder).
  - `ConfirmedSwitch({ label, checked, onChange, confirm: { title, message, confirmLabel }, describedBy? })`: `role="switch"` named `label`; on asks in place, off does not; focus returns to the switch.
  - `RuleSwitch({ rule: RuleRow, onChange: (rule: Rule) => void })`: `role="switch"` named "Run {name} every night", showing On or Off; on asks in `ConfirmDialog` ("Turn on {name}?", `turnOnText`, "Turn on"), off saves at once; PATCH `{is_active}`; a refusal under it.

- [ ] **Step 1: Write the failing tests**

Create `src/components/rules/ConfirmedSwitch.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmedSwitch } from './ConfirmedSwitch';

const CONFIRM = { title: 'Send without review?', message: 'Surveys go out at night.', confirmLabel: 'Send without review' };

function Harness({ onEscape = vi.fn() }: { onEscape?: () => void }) {
  const [on, setOn] = useState(false);
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) onEscape();
      }}
    >
      <ConfirmedSwitch label="Send without review" checked={on} onChange={setOn} confirm={CONFIRM} />
    </div>
  );
}

describe('ConfirmedSwitch (spec §2.2)', () => {
  it('asks in place before turning on, and turns on when answered', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Send without review' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    const question = screen.getByRole('group', { name: 'Send without review?' });
    expect(question).toHaveTextContent('Surveys go out at night.');
    expect(within(question).getByText('Send without review?')).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(within(question).getByRole('button', { name: 'Send without review' }));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('group', { name: 'Send without review?' })).toBeNull();
    expect(toggle).toHaveFocus();
  });

  it('stays off on Cancel or Escape, with focus back on the switch, and Escape goes no further', async () => {
    const onEscape = vi.fn();
    render(<Harness onEscape={onEscape} />);
    const toggle = screen.getByRole('switch', { name: 'Send without review' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveFocus();
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Send without review?' })).toBeNull();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('turns off without asking', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Send without review' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Send without review' }));
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('group')).toBeNull();
  });
});
```

Create `src/components/rules/RuleSwitch.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestsOf } from '../../features/surveys/testSurveys';
import { ORPHAN, RENEWAL_WATCH, stubRules, WELCOME_TASKS, type StoredRule } from '../../features/rules/testRules';
import type { RuleRow } from '../../features/rules/ruleTypes';
import { RuleSwitch } from './RuleSwitch';

const asRow = (rule: StoredRule): RuleRow => ({ ...rule, last_run: null });

function Harness({ start }: { start: RuleRow }) {
  const [rule, setRule] = useState(start);
  return <RuleSwitch rule={rule} onChange={setRule} />;
}

describe('RuleSwitch (spec §2.1, §2.3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks before turning a rule on, saying what it will do, then saves it on', async () => {
    const { spy } = stubRules();
    render(<Harness start={asRow(WELCOME_TASKS)} />);
    const toggle = screen.getByRole('switch', { name: 'Run Welcome tasks every night' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveTextContent('Off');
    await userEvent.click(toggle);
    expect(screen.getByRole('heading', { name: 'Turn on Welcome tasks?' })).toBeInTheDocument();
    expect(screen.getByText('From tonight it runs once a night on Champions and will create a task.')).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/rules\/6\/$/)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(toggle).toHaveTextContent('On');
    expect(requestsOf(spy, 'PATCH', /^\/rules\/6\/$/)[0].body).toEqual({ is_active: true });
  });

  it('turns a rule off at once, without asking', async () => {
    const { spy } = stubRules();
    render(<Harness start={asRow(RENEWAL_WATCH)} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Run Renewal watch every night' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Run Renewal watch every night' })).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByRole('heading', { name: /Turn on/ })).toBeNull();
    expect(requestsOf(spy, 'PATCH', /^\/rules\/5\/$/)[0].body).toEqual({ is_active: false });
  });

  it("shows the server's refusal inside the confirm, and the rule stays off", async () => {
    stubRules();
    render(<Harness start={asRow(ORPHAN)} />);
    const toggle = screen.getByRole('switch', { name: 'Run Old churn watch every night' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('Choose a segment.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('shows a failed switch-off under the switch', async () => {
    stubRules({ patch: () => ({ status: 500, body: {} }) });
    render(<Harness start={asRow(RENEWAL_WATCH)} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Run Renewal watch every night' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not switch this rule. Try again.');
    expect(screen.getByRole('switch', { name: 'Run Renewal watch every night' })).toHaveAttribute('aria-checked', 'true');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/rules/ConfirmedSwitch.test.tsx src/components/rules/RuleSwitch.test.tsx`
Expected: FAIL, "Failed to resolve import "./ConfirmedSwitch"" (and "./RuleSwitch").

- [ ] **Step 3: Write the parts**

Create `src/components/rules/switchParts.tsx`:

```tsx
import { FOCUS } from '../organizations/portfolio/styles';

/** A switch's button: the words beside the track. */
/** Every use adds `min-h-11 sm:min-h-9` in its own className, where the
 *  house-rules check (src/test/houseRules.ts) can see the 44px target. */
export const SWITCH = `inline-flex items-center gap-2 rounded-lg px-1 text-[13px] font-semibold text-ink hover:bg-subtle disabled:opacity-50 ${FOCUS}`;

/** The track and knob, for sight only (the button carries the role and state). */
export function Track({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex h-5 w-9 shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-line-strong'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  );
}
```

Create `src/components/rules/InlineConfirm.tsx`:

```tsx
import { useEffect, useId, useRef } from 'react';
import { FOCUS, PRIMARY, QUIET } from '../organizations/portfolio/styles';

/** A question asked in place, inside the builder (plan Decision 5): a
 *  second dialog over BuilderDialog would fight its Escape and its focus
 *  trap. It takes focus; Escape cancels it and stops there, so the builder
 *  stays open. */
export function InlineConfirm({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-part="confirm"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
      className="flex flex-col gap-2 rounded-lg border border-line p-3"
    >
      <p id={titleId} ref={titleRef} tabIndex={-1} className={`text-[13px] font-semibold text-ink ${FOCUS}`}>
        {title}
      </p>
      <p className="text-[13px] text-ink-muted">{message}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={QUIET}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={PRIMARY}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
```

Create `src/components/rules/ConfirmedSwitch.tsx`:

```tsx
import { useRef, useState } from 'react';
import { InlineConfirm } from './InlineConfirm';
import { SWITCH, Track } from './switchParts';

/** A builder switch whose "on" asks first, in place (spec §2.2: turning a
 *  rule on, and Send without review). Off needs no question. Focus goes
 *  back to the switch either way. */
export function ConfirmedSwitch({ label, checked, onChange, confirm, describedBy }: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  confirm: { title: string; message: string; confirmLabel: string };
  describedBy?: string;
}) {
  const [asking, setAsking] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const settle = (on: boolean) => {
    setAsking(false);
    if (on) onChange(true);
    ref.current?.focus();
  };
  return (
    <div className="flex flex-col gap-2">
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        onClick={() => {
          if (asking) return;
          if (checked) onChange(false);
          else setAsking(true);
        }}
        className={`${SWITCH} min-h-11 self-start sm:min-h-9`}
      >
        <Track on={checked} />
        {label}
      </button>
      {asking ? <InlineConfirm {...confirm} onConfirm={() => settle(true)} onCancel={() => settle(false)} /> : null}
    </div>
  );
}
```

Create `src/components/rules/RuleSwitch.tsx`:

```tsx
import { useId, useState } from 'react';
import { updateRule } from '../../features/rules/ruleApi';
import { firstError, ruleErrors } from '../../features/rules/ruleErrors';
import { turnOnText } from '../../features/rules/ruleText';
import type { Rule, RuleRow } from '../../features/rules/ruleTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { SWITCH, Track } from './switchParts';

const FAILED = 'Could not switch this rule. Try again.';

/** A saved rule's on/off, its owner's only (spec §2.1, §2.3). Turning on
 *  asks first in the shared ConfirmDialog (the row and the page are not
 *  inside a modal); turning off saves at once. A refusal (a rule with no
 *  segment can't be on) shows in the confirm, or under the switch. */
export function RuleSwitch({ rule, onChange }: { rule: RuleRow; onChange: (rule: Rule) => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      onChange(await updateRule(rule.id, { is_active: false }));
    } catch (err) {
      setError(firstError(ruleErrors(err, FAILED)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={rule.is_active}
        aria-label={`Run ${rule.name} every night`}
        aria-describedby={error ? errorId : undefined}
        disabled={busy}
        onClick={() => (rule.is_active ? void turnOff() : setAsking(true))}
        className={`${SWITCH} min-h-11 sm:min-h-9`}
      >
        <Track on={rule.is_active} />
        <span aria-hidden="true">{rule.is_active ? 'On' : 'Off'}</span>
      </button>
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
      {asking ? (
        <ConfirmDialog
          title={`Turn on ${rule.name}?`}
          message={turnOnText(rule.actions, rule.segment)}
          confirmLabel="Turn on"
          onConfirm={async () => {
            try {
              onChange(await updateRule(rule.id, { is_active: true }));
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw firstError(ruleErrors(err, FAILED));
            }
          }}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/rules/ConfirmedSwitch.test.tsx src/components/rules/RuleSwitch.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/rules/switchParts.tsx src/components/rules/InlineConfirm.tsx src/components/rules/ConfirmedSwitch.tsx src/components/rules/RuleSwitch.tsx src/components/rules/ConfirmedSwitch.test.tsx src/components/rules/RuleSwitch.test.tsx
git commit -m "feat(rules): on/off switches that confirm before turning on

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: `/scenarios`: the Rules and Canvas tabs, and the rule rows

Spec §2.1; plan Decisions 2, 3, 4, 21.

**Files:**
- Create: `src/components/rules/Parts.tsx`, `src/components/rules/RuleListItem.tsx`, `src/pages/rules/RulesTab.tsx`, `src/pages/scenarios/ScenariosHome.tsx`, `src/pages/rules/testPages.tsx`
- Test: `src/pages/rules/RulesTab.test.tsx`

**Interfaces:**
- Consumes: `fetchRules` (Task 3); `ruleParts`, `lastRunParts` (Task 1); `RuleSwitch` (Task 5); `scenariosTab` (Task 2); Segments' `RuleSentence`; `DetailTabs`, `detailPanelId`, `detailTabId`; `OrganizationsFrame`; `EmptyState`, `ErrorBlock`, `ItemSkeleton`; `PRIMARY`, `QUIET`, `FOCUS`, `MONO`; `errorMessage`; `ScenariosList` (unchanged); `Where`, `SlotHost`, `setViewport`, `capabilitiesForRole`.
- Produces:
  - `Parts({ parts })`: inline spans, a numeric part in DM Mono.
  - `RuleListItem({ row, onChange })`: `<li data-rule>`; `[data-part="last-run"]`, `[data-part="status"]` (a reader's On/Off).
  - `RulesTab({ reload? })`: `<ul aria-label="Rules">`; "Loading rules"; "No rules yet"; a failed reload keeps the last list.
  - `ScenariosHome()`: tablist "Scenario views" (Rules, Canvas), **New rule** (`/scenarios/rules/new`) on Rules, the Outlet for the builder modal.
  - `testPages.tsx`: `Role = 'admin' | 'csm'`, `makeRulesStore(role?)`, `renderRules(url, { width?, nav?, role? }) → { store, unmount }` (routes grow in Tasks 10–12).

- [ ] **Step 1: Write the failing test**

Create `src/pages/rules/RulesTab.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { stubRules } from '../../features/rules/testRules';
import { resetViewport } from '../../test/viewport';
import { renderRules } from './testPages';

// Integration tier: the real store and router, fetch stubbed in the
// backend's contract shapes (stubRules).
const where = () => screen.getByTestId('where').textContent;
const rowOf = (list: HTMLElement, name: string) => within(list).getByRole('link', { name }).closest('li') as HTMLElement;

describe('/scenarios (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens on Rules: a row per rule with its sentence, last night, sharing and owner', async () => {
    stubRules();
    renderRules('/scenarios');
    expect(screen.getByRole('tab', { name: 'Rules' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'New rule' })).toHaveAttribute('href', '/scenarios/rules/new');
    const list = await screen.findByRole('list', { name: 'Rules' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    const watch = rowOf(list, 'Renewal watch');
    expect(within(watch).getByRole('link', { name: 'Renewal watch' })).toHaveAttribute('href', '/scenarios/rules/5');
    expect(watch).toHaveTextContent('Workspace');
    expect(watch).toHaveTextContent('When CSAT falls below 60 in Renewal risk → survey, notify me');
    expect(watch.querySelector('[data-part="last-run"]')).toHaveTextContent('4 Oct · fired 3 · waiting for review · You');
    expect(within(watch).getByRole('switch', { name: 'Run Renewal watch every night' })).toHaveAttribute('aria-checked', 'true');
    const carl = rowOf(list, 'EMEA renewals');
    expect(carl).toHaveTextContent('Shared');
    expect(carl).toHaveTextContent('Every Monday, for everyone in EMEA accounts → move to Renewal');
    expect(carl.querySelector('[data-part="last-run"]')).toHaveTextContent('Last ran 28 Sep · Carl CSM');
    expect(within(carl).queryByRole('switch')).toBeNull();
    expect(carl.querySelector('[data-part="status"]')).toHaveTextContent('On');
    const orphan = rowOf(list, 'Old churn watch');
    expect(orphan).toHaveTextContent('Paused');
    expect(orphan).toHaveTextContent('When a record leaves a deleted segment → notify me');
    expect(rowOf(list, 'Welcome tasks').querySelector('[data-part="last-run"]')).toHaveTextContent('Not run yet · You');
  });

  it('sets the figures in DM Mono', async () => {
    stubRules();
    renderRules('/scenarios');
    const watch = rowOf(await screen.findByRole('list', { name: 'Rules' }), 'Renewal watch');
    expect([...watch.querySelectorAll('.font-mono-brand')].map((node) => node.textContent)).toEqual(['60', '3']);
  });

  it('turns a rule on from its row after the confirm', async () => {
    const { spy } = stubRules();
    renderRules('/scenarios');
    const row = rowOf(await screen.findByRole('list', { name: 'Rules' }), 'Welcome tasks');
    await userEvent.click(within(row).getByRole('switch', { name: 'Run Welcome tasks every night' }));
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(within(row).getByRole('switch', { name: 'Run Welcome tasks every night' })).toHaveAttribute('aria-checked', 'true'));
    expect(requestsOf(spy, 'PATCH', /^\/rules\/6\/$/)[0].body).toEqual({ is_active: true });
  });

  it('explains rules and offers New rule when there are none', async () => {
    stubRules({ rules: [] });
    renderRules('/scenarios');
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
    expect(screen.getByText(/A rule watches one of your segments every night/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New rule' }).map((link) => link.getAttribute('href'))).toEqual(['/scenarios/rules/new', '/scenarios/rules/new']);
  });

  it('shows a skeleton while loading, then the error with Try again, which reads again', async () => {
    let calls = 0;
    const { spy } = stubRules({
      list: () => {
        calls += 1;
        return calls === 1 ? { status: 500, body: { detail: 'Rules are down.' } } : { status: 200, body: [] };
      },
    });
    renderRules('/scenarios');
    expect(screen.getByRole('status', { name: 'Loading rules' })).toBeInTheDocument();
    expect(await screen.findByText('Rules are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/rules\/$/)).toHaveLength(2);
  });

  it('switches to Canvas in the URL, showing the canvas list as it was, and back', async () => {
    stubRules();
    renderRules('/scenarios');
    await userEvent.click(screen.getByRole('tab', { name: 'Canvas' }));
    expect(where()).toBe('/scenarios?tab=canvas');
    expect(await screen.findByText('No scenarios yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Scenario/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New rule' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Rules' }));
    expect(where()).toBe('/scenarios');
  });

  it('opens the Canvas tab from the URL', async () => {
    stubRules();
    renderRules('/scenarios?tab=canvas');
    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('No scenarios yet.')).toBeInTheDocument();
  });

  it('lays the rows out at phone width without a table', async () => {
    stubRules();
    renderRules('/scenarios', { width: 375 });
    const list = await screen.findByRole('list', { name: 'Rules' });
    expect(document.querySelector('table')).toBeNull();
    expect(rowOf(list, 'Renewal watch')).toHaveClass('flex-wrap');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/rules/RulesTab.test.tsx`
Expected: FAIL, "Failed to resolve import "./testPages"".

- [ ] **Step 3: Write the row**

Create `src/components/rules/Parts.tsx`:

```tsx
import type { SentencePart } from '../../features/segments/ruleSentence';
import { MONO } from '../organizations/portfolio/styles';

/** Words and figures inline: a numeric part in DM Mono. */
export function Parts({ parts }: { parts: SentencePart[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <span key={index} className={part.numeric ? MONO : undefined}>
          {part.text}
        </span>
      ))}
    </>
  );
}
```

Create `src/components/rules/RuleListItem.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { lastRunParts, ruleParts } from '../../features/rules/ruleText';
import type { Rule, RuleRow } from '../../features/rules/ruleTypes';
import { FOCUS } from '../organizations/portfolio/styles';
import { RuleSentence } from '../segments/RuleSentence';
import { Parts } from './Parts';
import { RuleSwitch } from './RuleSwitch';

const BADGE = 'shrink-0 rounded-full bg-subtle px-1.5 text-[11px] font-semibold text-ink-muted';
const SHARING_BADGE = { private: null, workspace: 'Workspace', people: 'Shared' } as const;

/** One rule (spec §2.1), a rounded row, never a table row: its name with
 *  Paused and sharing badges, the rule as a sentence, the last night and
 *  whose it is; the owner's switch on the right, a reader's On or Off. */
export function RuleListItem({ row, onChange }: { row: RuleRow; onChange: (rule: Rule) => void }) {
  const badge = SHARING_BADGE[row.sharing];
  return (
    <li data-rule={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-surface px-3 py-2.5">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link to={`/scenarios/rules/${row.id}`} className={`flex min-h-11 min-w-0 items-center rounded-sm text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
            <span className="truncate">{row.name}</span>
          </Link>
          {row.paused_reason ? <span className={BADGE}>Paused</span> : null}
          {badge ? <span className={BADGE}>{badge}</span> : null}
        </span>
        <RuleSentence parts={ruleParts(row, row.segment)} />
        <p data-part="last-run" className="text-[11px] text-ink-muted">
          <Parts parts={lastRunParts(row.last_run)} /> · {row.is_owner ? 'You' : row.owner.name}
        </p>
      </div>
      {row.is_owner ? (
        <RuleSwitch rule={row} onChange={onChange} />
      ) : (
        <p data-part="status" className="text-[13px] text-ink-muted">
          {row.is_active ? 'On' : 'Off'}
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Write the tab and the tabs page**

Create `src/pages/rules/RulesTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchRules } from '../../features/rules/ruleApi';
import type { Rule, RuleRow } from '../../features/rules/ruleTypes';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../../components/organizations/portfolio/PortfolioSections';
import { PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { RuleListItem } from '../../components/rules/RuleListItem';

const EXPLAINER =
  'A rule watches one of your segments every night. When a record enters or leaves it, when a score crosses a line, or on a schedule, it can notify people, create tasks, change the lifecycle stage or send a survey. Surveys wait for your review first.';

type Answer = { key: number; rows: RuleRow[] | null; error: string | null };

/** The Rules tab (spec §2.1): every rule the reader may read, by name. It
 *  reads again when `reload` changes (the builder modal closed). A failed
 *  reload keeps the last list beside the error. */
export function RulesTab({ reload = 0 }: { reload?: number }) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [seen, setSeen] = useState(reload);
  if (seen !== reload) {
    setSeen(reload);
    setAttempt((n) => n + 1);
  }
  useEffect(() => {
    let alive = true;
    fetchRules().then(
      (rows) => {
        if (alive) setAnswer({ key: attempt, rows, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer((last) => ({ key: attempt, rows: last?.rows ?? null, error: errorMessage(err, 'Could not load rules.') }));
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
  // A switch saved on a row: its rule replaces the row in place.
  const replace = (rule: Rule) => setAnswer((last) => (last?.rows ? { ...last, rows: last.rows.map((row) => (row.id === rule.id ? rule : row)) } : last));

  if (error && (!rows || rows.length === 0)) return <ErrorBlock message={error} onRetry={retry} />;
  if (!rows || (loading && rows.length === 0)) return <ItemSkeleton count={4} label="Loading rules" avatar={false} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No rules yet"
        detail={EXPLAINER}
        action={
          <Link to="/scenarios/rules/new" className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New rule
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
      <ul aria-label="Rules" aria-busy={loading} className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <RuleListItem key={row.id} row={row} onChange={replace} />
        ))}
      </ul>
    </div>
  );
}
```

Create `src/pages/scenarios/ScenariosHome.tsx`:

```tsx
import { useId, useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { detailPanelId, detailTabId } from '../../features/organizations/detailParams';
import { scenariosTab, type ScenariosTab } from '../../features/rules/ruleParams';
import { DetailTabs } from '../../components/organizations/detail/DetailTabs';
import { PRIMARY } from '../../components/organizations/portfolio/styles';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { RulesTab } from '../rules/RulesTab';
import { ScenariosList } from './ScenariosList';

const TABS: readonly { key: ScenariosTab; label: string }[] = [
  { key: 'rules', label: 'Rules' },
  { key: 'canvas', label: 'Canvas' },
];

/** /scenarios (rules spec §2.1): Rules first, then the Canvas as it was
 *  (`?tab=`, plan Decision 2), under the framed bar titled "Scenarios". New
 *  rule (/scenarios/rules/new) opens its modal over this page through the
 *  Outlet. */
export function ScenariosHome() {
  const [search, setSearch] = useSearchParams();
  const tab = scenariosTab(search);
  const idBase = useId();
  // Each time the modal route closes back to /scenarios, the Rules list
  // reads again: a rule may have been saved under it.
  const modalOpen = useLocation().pathname.replace(/\/$/, '') !== '/scenarios';
  const [wasOpen, setWasOpen] = useState(modalOpen);
  const [reload, setReload] = useState(0);
  if (wasOpen !== modalOpen) {
    setWasOpen(modalOpen);
    if (!modalOpen) setReload((n) => n + 1);
  }
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <DetailTabs
            idBase={idBase}
            active={tab}
            tabs={TABS}
            label="Scenario views"
            onChange={(next) => setSearch(next === 'rules' ? {} : { tab: next }, { replace: true })}
          />
          {tab === 'rules' ? (
            <Link to="/scenarios/rules/new" className={`${PRIMARY} sm:ml-auto`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New rule
            </Link>
          ) : null}
        </div>
        <div role="tabpanel" id={detailPanelId(idBase, tab)} aria-labelledby={detailTabId(idBase, tab)}>
          {tab === 'rules' ? <RulesTab reload={reload} /> : <ScenariosList />}
        </div>
      </div>
      {/* /scenarios/rules/new: the rule builder modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 5: Write the test helpers**

Create `src/pages/rules/testPages.tsx`:

```tsx
// Test-only helpers, never hot-reloaded.
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import callsReducer from '../../features/calls/callsSlice';
import customersReducer from '../../features/customers/customersSlice';
import filesReducer from '../../features/files/filesSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import proposalsReducer from '../../features/proposals/proposalsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { capabilitiesForRole } from '../../test/capabilities';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { ScenariosHome } from '../scenarios/ScenariosHome';

export type Role = 'admin' | 'csm';

/** The real slices the Rules pages, a segment's page and the Review Queue
 *  read. The signed-in user is Alice (id 1, testSegments' ME) of "Acme
 *  Inc"; as a CSM she holds no capability. */
export function makeRulesStore(role: Role = 'admin') {
  return configureStore({
    reducer: {
      auth: authReducer,
      customers: customersReducer,
      notifications: notificationsReducer,
      files: filesReducer,
      calls: callsReducer,
      proposals: proposalsReducer,
    },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role,
          role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM',
          permissions: capabilitiesForRole(role),
          function: 'cs' as const,
          function_display: 'Customer Success',
          reports_to: null,
          organisation: {
            id: 1,
            name: 'Acme Inc',
            slug: 'acme-inc',
            currency: 'USD' as const,
            currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '',
            ai_agent_enabled: true,
            ai_agent_tone: 'professional' as const,
            ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token',
        refreshToken: 'refresh',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    },
  });
}

/** The Rules routes on the real store and router, as App.tsx routes them.
 *  Only fetch is stubbed, by the caller (stubRules). `nav` adds the real
 *  Navbar. */
export function renderRules(url: string, { width = 1440, nav = false, role = 'admin' }: { width?: number; nav?: boolean; role?: Role } = {}) {
  setViewport(width);
  const store = makeRulesStore(role);
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              element={
                <>
                  <ScenariosHome />
                  <Where />
                </>
              }
            >
              <Route path="/scenarios" element={null} />
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

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/pages/rules/RulesTab.test.tsx src/pages/scenarios/ScenariosList.test.tsx`
Expected: PASS (8 new tests; ScenariosList's own tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/components/rules/Parts.tsx src/components/rules/RuleListItem.tsx src/pages/rules/RulesTab.tsx src/pages/scenarios/ScenariosHome.tsx src/pages/rules/testPages.tsx src/pages/rules/RulesTab.test.tsx
git commit -m "feat(rules): Scenarios as Rules and Canvas tabs, a row per rule

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: When: the trigger, the segment, the line, the schedule

Spec §2.2 ("**When** [entered / left / score crosses / on a schedule] **in** [one of my segments]; then the score, direction and value, or the weekday / monthly"); backend Decisions 2, 3 and the trigger validation; plan Decision 8.

**Files:**
- Create: `src/components/rules/Field.tsx`, `src/components/rules/TriggerFields.tsx`
- Test: `src/components/rules/TriggerFields.test.tsx`

**Interfaces:**
- Consumes: `RuleDraft` (Task 2), `RuleErrors` (Task 2), `triggerOption`, `scoresFor`, `SCORE_LABEL`, `SCORE_RANGES`, `DIRECTION_LABEL`, `CADENCE_LABEL`, `WEEKDAYS` (Task 1), `rangeHint` (Task 1), `SegmentOptions` (Task 4), `FILTER_SELECT`, `FOCUS`, `MONO`; `listRow`, `RENEWAL_RISK`, `CHAMPIONS`, `EMEA_ACCOUNTS` (testSegments).
- Produces:
  - `Field({ id, label, hint?, error?, children: (aria) => ReactNode })`: the label above, the hint and the error (`role="alert"`) below; `aria` carries `aria-describedby` and `aria-invalid` for the control.
  - `TriggerFields({ draft, kind, segments, segmentsError, fallback, errors, onChange })`: a section headed "When" with comboboxes named Trigger, Segment, and for `crossed` Score, Direction and a spinbutton Value, for `schedule` Repeat and (weekly) Day. `onChange(patch: Partial<RuleDraft>)`.

- [ ] **Step 1: Write the failing test**

Create `src/components/rules/TriggerFields.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { emptyDraft, type RuleDraft } from '../../features/rules/ruleDraft';
import type { RuleErrors } from '../../features/rules/ruleErrors';
import { CHAMPIONS, EMEA_ACCOUNTS, listRow, RENEWAL_RISK } from '../../features/segments/testSegments';
import { TriggerFields } from './TriggerFields';

const MINE = [listRow(RENEWAL_RISK), { ...listRow(EMEA_ACCOUNTS), is_owner: true }, listRow(CHAMPIONS)];

function Harness({ start = emptyDraft(7), errors = {} }: { start?: RuleDraft; errors?: RuleErrors['field'] }) {
  const [draft, setDraft] = useState(start);
  const kind = MINE.find((row) => row.id === draft.segment)?.kind ?? null;
  return (
    <MemoryRouter>
      <TriggerFields draft={draft} kind={kind} segments={MINE} segmentsError={null} fallback={null} errors={errors} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </MemoryRouter>
  );
}
const draftNow = () => JSON.parse(screen.getByTestId('draft').textContent as string) as RuleDraft;

describe('TriggerFields (spec §2.2, When)', () => {
  it("words the triggers for the segment's kind, and offers my segments by kind", async () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'When' })).toBeInTheDocument();
    const trigger = screen.getByRole('combobox', { name: 'Trigger' });
    expect([...trigger.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['An organisation enters', 'An organisation leaves', 'A score crosses a line', 'On a schedule']);
    const segment = screen.getByRole('combobox', { name: 'Segment' });
    expect(segment).toHaveDisplayValue('Renewal risk');
    expect(segment.querySelector('optgroup[label="Contacts"]')).toHaveTextContent('Champions');
    await userEvent.selectOptions(segment, '9');
    expect(draftNow().segment).toBe(9);
    expect(within(trigger).getByRole('option', { name: 'A contact enters' })).toBeInTheDocument();
  });

  it('keeps a score line out of reach for a contact segment, and says why', () => {
    render(<Harness start={{ ...emptyDraft(9) }} />);
    expect(screen.getByRole('option', { name: 'A score crosses a line' })).toBeDisabled();
    expect(screen.getByText('Contacts have no scores, so a score rule needs an organisation or account segment.')).toBeInTheDocument();
  });

  it('asks for the score, its direction and a value within its range', async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Trigger' }), 'crossed');
    const score = screen.getByRole('combobox', { name: 'Score' });
    expect([...score.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Choose a score…', 'CSAT', 'NPS', 'CES', 'Health']);
    await userEvent.selectOptions(score, 'nps');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), 'above');
    const value = screen.getByRole('spinbutton', { name: 'Value' });
    expect(value).toHaveAttribute('min', '-100');
    expect(value).toHaveAttribute('max', '100');
    expect(screen.getByText('NPS runs from −100 to 100.')).toBeInTheDocument();
    await userEvent.type(value, '45');
    expect(draftNow()).toMatchObject({ trigger: 'crossed', score: 'nps', direction: 'above', threshold: '45' });
  });

  it('offers no CES for an account segment', async () => {
    render(<Harness start={{ ...emptyDraft(8), trigger: 'crossed' }} />);
    expect([...screen.getByRole('combobox', { name: 'Score' }).querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Choose a score…', 'CSAT', 'NPS', 'Health']);
  });

  it('asks for the day of a weekly schedule, and not of a monthly one', async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Trigger' }), 'schedule');
    const day = screen.getByRole('combobox', { name: 'Day' });
    expect(day).toHaveDisplayValue('Monday');
    await userEvent.selectOptions(day, '4');
    expect(draftNow()).toMatchObject({ trigger: 'schedule', cadence: 'weekly', weekday: 4 });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Repeat' }), 'monthly');
    expect(screen.queryByRole('combobox', { name: 'Day' })).toBeNull();
    expect(screen.getByText('On the 1st of each month, overnight (UTC).')).toBeInTheDocument();
  });

  it('shows errors under their fields and marks the fields invalid', () => {
    render(<Harness start={{ ...emptyDraft(7), trigger: 'crossed' }} errors={{ segment: 'A rule can only use your own segments.', threshold: 'Choose a value.' }} />);
    const segment = screen.getByRole('combobox', { name: 'Segment' });
    expect(segment).toHaveAttribute('aria-invalid', 'true');
    expect(segment).toHaveAccessibleDescription(/A rule can only use your own segments\./);
    expect(screen.getByRole('spinbutton', { name: 'Value' })).toHaveAccessibleDescription('Choose a value.');
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual(['A rule can only use your own segments.', 'Choose a value.']);
  });

  it('offers to make a segment when I have none', () => {
    render(
      <MemoryRouter>
        <TriggerFields draft={emptyDraft(null)} kind={null} segments={[]} segmentsError={null} fallback={null} errors={{}} onChange={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Make one' })).toHaveAttribute('href', '/segments/new');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/rules/TriggerFields.test.tsx`
Expected: FAIL, "Failed to resolve import "./TriggerFields"".

- [ ] **Step 3: Write the field frame**

Create `src/components/rules/Field.tsx`:

```tsx
import type { ReactNode } from 'react';

type Aria = { 'aria-describedby'?: string; 'aria-invalid': boolean };

/** One field: its label above, then the control, then the hint and the
 *  error below (house rule). The control takes `aria` for its description
 *  and its invalid state. */
export function Field({ id, label, hint, error, children }: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (aria: Aria) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </label>
      {children({ 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}
      {hint ? (
        <p id={`${id}-hint`} className="text-[11px] text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Write the When section**

Create `src/components/rules/TriggerFields.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { RuleDraft } from '../../features/rules/ruleDraft';
import type { RuleErrors } from '../../features/rules/ruleErrors';
import { CADENCE_LABEL, DIRECTION_LABEL, SCORE_LABEL, SCORE_RANGES, scoresFor, triggerOption, WEEKDAYS } from '../../features/rules/ruleOptions';
import { rangeHint } from '../../features/rules/ruleText';
import type { Cadence, Direction, Score, Trigger } from '../../features/rules/ruleTypes';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { SegmentRef } from '../../features/surveys/surveyTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { SegmentOptions } from '../surveys/SegmentOptions';
import { Field } from './Field';

const TRIGGERS: readonly Trigger[] = ['entered', 'left', 'crossed', 'schedule'];
const DIRECTIONS: readonly Direction[] = ['below', 'above'];
const CADENCES: readonly Cadence[] = ['weekly', 'monthly'];
const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink hover:border-line-strong focus:border-line-strong ${MONO} ${FOCUS}`;

/** When the rule acts (spec §2.2): the trigger, worded for the segment's
 *  kind, and one of the caller's own segments; then the score, direction
 *  and value of a line, or the day of a schedule. Contacts have no scores
 *  and accounts no CES, so those choices are not offered. */
export function TriggerFields({ draft, kind, segments, segmentsError, fallback, errors, onChange }: {
  draft: RuleDraft;
  kind: SegmentKind | null;
  /** The caller's own segments; null while loading. */
  segments: SegmentListRow[] | null;
  segmentsError: string | null;
  fallback: SegmentRef | null;
  errors: RuleErrors['field'];
  onChange: (patch: Partial<RuleDraft>) => void;
}) {
  const headingId = useId();
  const triggerId = useId();
  const segmentId = useId();
  const scoreId = useId();
  const directionId = useId();
  const valueId = useId();
  const cadenceId = useId();
  const dayId = useId();
  const scores = scoresFor(kind);
  const score: Score | '' = draft.score && scores.includes(draft.score) ? draft.score : '';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        When
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={triggerId}
          label="Trigger"
          hint={kind === 'contact' ? 'Contacts have no scores, so a score rule needs an organisation or account segment.' : null}
          error={errors.trigger}
        >
          {(aria) => (
            <select id={triggerId} {...aria} value={draft.trigger} onChange={(event) => onChange({ trigger: event.target.value as Trigger })} className={`${FILTER_SELECT} w-full ${errors.trigger ? 'border-danger' : ''}`}>
              {TRIGGERS.map((trigger) => (
                <option key={trigger} value={trigger} disabled={trigger === 'crossed' && kind === 'contact'}>
                  {triggerOption(trigger, kind)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={segmentId} label="Segment" hint="Only your own segments: a rule runs as you, on records you can open." error={errors.segment}>
          {(aria) => (
            <select
              id={segmentId}
              {...aria}
              value={draft.segment === null ? '' : String(draft.segment)}
              disabled={segments === null}
              onChange={(event) => onChange({ segment: event.target.value ? Number(event.target.value) : null })}
              className={`${FILTER_SELECT} w-full ${errors.segment ? 'border-danger' : ''}`}
            >
              <SegmentOptions rows={segments} fallback={fallback} />
            </select>
          )}
        </Field>
      </div>
      {segmentsError ? (
        <p role="alert" className="text-[11px] text-danger">
          {segmentsError}
        </p>
      ) : null}
      {segments !== null && segments.length === 0 && !segmentsError ? (
        <p className="text-[11px] text-ink-muted">
          You have no segments yet.{' '}
          <Link to="/segments/new" className={`inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`}>
            Make one
          </Link>
          , then automate it.
        </p>
      ) : null}
      {draft.trigger === 'crossed' && kind !== 'contact' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id={scoreId} label="Score" error={errors.score}>
            {(aria) => (
              <select id={scoreId} {...aria} value={score} onChange={(event) => onChange({ score: event.target.value as Score | '' })} className={`${FILTER_SELECT} w-full ${errors.score ? 'border-danger' : ''}`}>
                <option value="">Choose a score…</option>
                {scores.map((option) => (
                  <option key={option} value={option}>
                    {SCORE_LABEL[option]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={directionId} label="Direction" error={errors.direction}>
            {(aria) => (
              <select id={directionId} {...aria} value={draft.direction} onChange={(event) => onChange({ direction: event.target.value as Direction })} className={`${FILTER_SELECT} w-full ${errors.direction ? 'border-danger' : ''}`}>
                {DIRECTIONS.map((direction) => (
                  <option key={direction} value={direction}>
                    {DIRECTION_LABEL[direction]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={valueId} label="Value" hint={score ? rangeHint(score) : null} error={errors.threshold}>
            {(aria) => (
              <input
                id={valueId}
                {...aria}
                type="number"
                inputMode="decimal"
                step="any"
                min={score ? SCORE_RANGES[score][0] : undefined}
                max={score ? SCORE_RANGES[score][1] : undefined}
                value={draft.threshold}
                onChange={(event) => onChange({ threshold: event.target.value })}
                className={`${INPUT} ${errors.threshold ? 'border-danger' : 'border-line'}`}
              />
            )}
          </Field>
        </div>
      ) : null}
      {draft.trigger === 'schedule' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id={cadenceId}
            label="Repeat"
            hint={draft.cadence === 'monthly' ? 'On the 1st of each month, overnight (UTC).' : 'Overnight (UTC) on the day you choose.'}
            error={errors.cadence}
          >
            {(aria) => (
              <select id={cadenceId} {...aria} value={draft.cadence} onChange={(event) => onChange({ cadence: event.target.value as Cadence })} className={`${FILTER_SELECT} w-full ${errors.cadence ? 'border-danger' : ''}`}>
                {CADENCES.map((cadence) => (
                  <option key={cadence} value={cadence}>
                    {CADENCE_LABEL[cadence]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {draft.cadence === 'weekly' ? (
            <Field id={dayId} label="Day" error={errors.weekday}>
              {(aria) => (
                <select id={dayId} {...aria} value={String(draft.weekday)} onChange={(event) => onChange({ weekday: Number(event.target.value) })} className={`${FILTER_SELECT} w-full ${errors.weekday ? 'border-danger' : ''}`}>
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={String(index)}>
                      {day}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/rules/TriggerFields.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/rules/Field.tsx src/components/rules/TriggerFields.tsx src/components/rules/TriggerFields.test.tsx
git commit -m "feat(rules): the builder's When: trigger, segment, line and schedule

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: Then: the action cards

Spec §2.2 ("**Then** one to three action cards: Notify (who, message), Create task (title, assignee, due in N days), Change lifecycle (stage), Send survey (type, roles, subject, intro, **Send without review** switch, off by default, with a warning)"); backend Decisions 8, 9, 10; the controller's 500-person ruling; plan Decisions 9, 10, 11, 12.

**Files:**
- Create: `src/components/rules/ActionFields.tsx`, `src/components/rules/ActionCards.tsx`
- Test: `src/components/rules/ActionCards.test.tsx`

**Interfaces:**
- Consumes: `ActionDraft`, `LifecycleDraft`, `NOTIFY_ME`, `newAction`, `availableActions` (Task 2); `ActionErrors` (Task 2); `ACTION_LABEL`, `NOTIFY_TO_LABEL`, `ASSIGNEE_LABEL`, `STAGES`, `MESSAGE_MAX`, `TITLE_MAX`, `DUE_MAX`, `PEOPLE_MAX` (Task 1); `SURVEY_LIMIT_NOTE` (Task 1); `ConfirmedSwitch` (Task 5); `Field` (Task 7); `RoleFields` (Task 4); Segments' `Chip`, `RadioTile`; Surveys' `TYPE_LABEL`, `TYPE_HINT`, `SUBJECT_MAX`, `INTRO_MAX`; `BUTTON`, `FILTER_SELECT`, `FOCUS`, `MONO`.
- Produces:
  - `NotifyFields`, `TaskFields`, `LifecycleFields`, `SurveyFields` (each `{ action, errors, onChange, … }`).
  - `ActionCards({ actions, kind, workspace, teammates, errors, listError?, onChange })`: a section headed "Then"; `<ul aria-label="Actions">` of `<li data-action="notify|task|lifecycle|survey">` cards; add buttons named by `ACTION_LABEL`; "Remove {label}" when more than one.

- [ ] **Step 1: Write the failing test**

Create `src/components/rules/ActionCards.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NOTIFY_ME, type ActionDraft } from '../../features/rules/ruleDraft';
import type { ActionErrors } from '../../features/rules/ruleErrors';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { ActionCards } from './ActionCards';

const TEAMMATES = [{ id: 4, name: 'Carl CSM' }, { id: 5, name: 'Dana CSM' }];

function Harness({ start = [{ ...NOTIFY_ME }], kind = 'customer', errors = [], listError }: { start?: ActionDraft[]; kind?: SegmentKind | null; errors?: ActionErrors[]; listError?: string }) {
  const [actions, setActions] = useState<ActionDraft[]>(start);
  return (
    <>
      <ActionCards actions={actions} kind={kind} workspace="Acme Inc" teammates={TEAMMATES} errors={errors} listError={listError} onChange={setActions} />
      <output data-testid="actions">{JSON.stringify(actions)}</output>
    </>
  );
}
const actionsNow = () => JSON.parse(screen.getByTestId('actions').textContent as string) as ActionDraft[];
const card = (type: string) => document.querySelector(`[data-action="${type}"]`) as HTMLElement;

describe('ActionCards (spec §2.2, Then)', () => {
  it('adds each unused action once, at most three, and removes one', async () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Then' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Actions' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Remove Notify' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Create a task' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send a survey' }));
    expect(actionsNow().map((action) => action.action)).toEqual(['notify', 'task', 'survey']);
    expect(screen.queryByRole('button', { name: 'Change lifecycle' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Create a task' }));
    expect(actionsNow().map((action) => action.action)).toEqual(['notify', 'survey']);
    expect(screen.getByRole('button', { name: 'Create a task' })).toBeInTheDocument();
  });

  it('offers no lifecycle action for a contact segment', () => {
    render(<Harness kind="contact" />);
    expect(screen.getByRole('button', { name: 'Create a task' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change lifecycle' })).toBeNull();
  });

  it('notifies me, each owner or chosen teammates, with an optional note counted to 280', async () => {
    render(<Harness />);
    const who = within(card('notify')).getByRole('combobox', { name: 'Who' });
    expect([...who.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Me', "Each record's owner", 'Chosen teammates']);
    await userEvent.selectOptions(who, 'people');
    await userEvent.selectOptions(within(card('notify')).getByRole('combobox', { name: 'Teammates' }), '4');
    expect(within(card('notify')).getByRole('list', { name: 'Teammates to notify' })).toHaveTextContent('Carl CSM');
    await userEvent.type(within(card('notify')).getByRole('textbox', { name: 'Message (optional)' }), 'Call them');
    expect(card('notify')).toHaveTextContent('9 of 280');
    expect(actionsNow()[0]).toEqual({ action: 'notify', to: 'people', people: [4], message: 'Call them' });
    await userEvent.selectOptions(who, 'me');
    expect(actionsNow()[0]).toMatchObject({ to: 'me', people: [] });
  });

  it('creates a task with a title, an assignee and days until due', async () => {
    render(<Harness start={[{ action: 'task', title: '', assignee: 'record_owner', due_in_days: 7 }]} />);
    const task = card('task');
    await userEvent.type(within(task).getByRole('textbox', { name: 'Task title' }), 'Check in');
    expect([...within(task).getByRole('combobox', { name: 'Assign to' }).querySelectorAll('option')].map((option) => option.textContent)).toEqual(["The record's owner", 'Me']);
    const due = within(task).getByRole('spinbutton', { name: 'Due in (days)' });
    expect(due).toHaveValue(7);
    await userEvent.clear(due);
    await userEvent.type(due, '3');
    expect(actionsNow()[0]).toEqual({ action: 'task', title: 'Check in', assignee: 'record_owner', due_in_days: 3 });
  });

  it('changes the lifecycle stage, chosen first, saying Churn sets the stage only', async () => {
    render(<Harness start={[{ action: 'lifecycle', stage: '' }]} />);
    const stage = within(card('lifecycle')).getByRole('combobox', { name: 'Stage' });
    expect(stage).toHaveDisplayValue('Choose a stage…');
    await userEvent.selectOptions(stage, 'churn');
    expect(card('lifecycle')).toHaveTextContent('Churn sets the stage only; it does not record a churn date.');
    expect(actionsNow()[0]).toEqual({ action: 'lifecycle', stage: 'churn' });
  });

  it("sends a survey with Surveys' fields, the 500 note, and asks before Send without review", async () => {
    render(<Harness start={[{ action: 'survey', survey_type: 'nps', subject: 'A quick question from Acme Inc', intro: '', roles: ['champion', 'decision_maker'], without_review: false }]} />);
    const survey = card('survey');
    expect(within(survey).getByRole('radio', { name: 'NPS' })).toBeChecked();
    await userEvent.click(within(survey).getByRole('radio', { name: 'CSAT' }));
    expect(within(survey).getByRole('textbox', { name: 'Email subject' })).toHaveValue('A quick question from Acme Inc');
    expect(within(survey).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(survey).toHaveTextContent('A night that reaches more than 500 people is refused by Surveys and waits in your review queue with the reason.');
    const toggle = within(survey).getByRole('switch', { name: 'Send without review' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    const question = within(survey).getByRole('group', { name: 'Send without review?' });
    await userEvent.click(within(question).getByRole('button', { name: 'Send without review' }));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleDescription('Surveys go out at night without you seeing them first.');
    expect(actionsNow()[0]).toMatchObject({ survey_type: 'csat', without_review: true });
  });

  it("shows each action's errors at its own fields, and the list's above the add buttons", () => {
    render(
      <Harness
        start={[{ ...NOTIFY_ME }, { action: 'task', title: '', assignee: 'me', due_in_days: 7 }]}
        errors={[{}, { title: 'Give the task a title.' }]}
        listError="Each action can be used once per rule."
      />,
    );
    const title = within(card('task')).getByRole('textbox', { name: 'Task title' });
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('Give the task a title.');
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual(['Give the task a title.', 'Each action can be used once per rule.']);
  });

  it('shows a lifecycle refusal for a contact segment on its card', () => {
    render(<Harness kind="contact" start={[{ action: 'lifecycle', stage: 'live' }]} errors={[{ action: 'Contacts have no lifecycle stage; choose an organisation or account segment.' }]} />);
    expect(within(card('lifecycle')).getByRole('alert')).toHaveTextContent('Contacts have no lifecycle stage');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/rules/ActionCards.test.tsx`
Expected: FAIL, "Failed to resolve import "./ActionCards"".

- [ ] **Step 3: Write each action's fields**

Create `src/components/rules/ActionFields.tsx`:

```tsx
import { useId } from 'react';
import { Gauge, Smile, ThumbsUp } from 'lucide-react';
import type { LifecycleDraft } from '../../features/rules/ruleDraft';
import type { ActionErrors } from '../../features/rules/ruleErrors';
import { ASSIGNEE_LABEL, DUE_MAX, MESSAGE_MAX, NOTIFY_TO_LABEL, PEOPLE_MAX, STAGES, TITLE_MAX } from '../../features/rules/ruleOptions';
import { SURVEY_LIMIT_NOTE } from '../../features/rules/ruleText';
import type { Assignee, LifecycleStage, NotifyAction, NotifyTo, SurveyAction, TaskAction } from '../../features/rules/ruleTypes';
import type { PersonRef, SegmentKind } from '../../features/segments/segmentTypes';
import { INTRO_MAX, SUBJECT_MAX, TYPE_HINT, TYPE_LABEL } from '../../features/surveys/questions';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { Chip } from '../segments/Chip';
import { RadioTile } from '../segments/RadioTile';
import { RoleFields } from '../surveys/RoleFields';
import { ConfirmedSwitch } from './ConfirmedSwitch';
import { Field } from './Field';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const border = (error?: string) => (error ? 'border-danger' : 'border-line');
const NOTIFY_TO: readonly NotifyTo[] = ['me', 'record_owner', 'people'];
const ASSIGNEES: readonly Assignee[] = ['record_owner', 'me'];
const TYPES = [
  { value: 'nps', icon: ThumbsUp },
  { value: 'csat', icon: Smile },
  { value: 'ces', icon: Gauge },
] as const;

function Count({ n, max }: { n: number; max: number }) {
  return (
    <>
      <span className={MONO}>{n}</span> of <span className={MONO}>{max}</span>
    </>
  );
}

/** Notify (backend Decision 8): me, each record's owner, or chosen
 *  teammates (1–50), with an optional note. Each person is told only
 *  about the records they may open (spec §3). */
export function NotifyFields({ action, teammates, errors, onChange }: { action: NotifyAction; teammates: PersonRef[]; errors: ActionErrors; onChange: (next: NotifyAction) => void }) {
  const toId = useId();
  const pickId = useId();
  const messageId = useId();
  const nameOf = (id: number) => teammates.find((person) => person.id === id)?.name ?? `Teammate ${id}`;
  const rest = teammates.filter((person) => !action.people.includes(person.id));
  return (
    <div className="flex flex-col gap-3">
      <Field id={toId} label="Who" error={errors.to}>
        {(aria) => (
          <select
            id={toId}
            {...aria}
            value={action.to}
            onChange={(event) => {
              const to = event.target.value as NotifyTo;
              onChange({ ...action, to, people: to === 'people' ? action.people : [] });
            }}
            className={`${FILTER_SELECT} w-full ${errors.to ? 'border-danger' : ''}`}
          >
            {NOTIFY_TO.map((to) => (
              <option key={to} value={to}>
                {NOTIFY_TO_LABEL[to]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {action.to === 'people' ? (
        <Field id={pickId} label="Teammates" hint="Each is told only about the records they may open." error={errors.people}>
          {(aria) => (
            <div className="flex flex-col gap-2">
              {action.people.length > 0 ? (
                <ul aria-label="Teammates to notify" className="flex flex-wrap gap-1.5">
                  {action.people.map((id) => (
                    <Chip key={id} name={nameOf(id)} onRemove={() => onChange({ ...action, people: action.people.filter((chosen) => chosen !== id) })} />
                  ))}
                </ul>
              ) : null}
              <select
                id={pickId}
                {...aria}
                value=""
                disabled={action.people.length >= PEOPLE_MAX}
                onChange={(event) => {
                  const id = Number(event.target.value);
                  if (id) onChange({ ...action, people: [...action.people, id] });
                }}
                className={`${FILTER_SELECT} self-start ${errors.people ? 'border-danger' : ''}`}
              >
                <option value="">Add a teammate…</option>
                {rest.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Field>
      ) : null}
      <Field id={messageId} label="Message (optional)" hint={<Count n={action.message.length} max={MESSAGE_MAX} />} error={errors.message}>
        {(aria) => (
          <textarea
            id={messageId}
            {...aria}
            rows={2}
            maxLength={MESSAGE_MAX}
            value={action.message}
            placeholder="A note under the digest"
            onChange={(event) => onChange({ ...action, message: event.target.value })}
            className={`${INPUT} resize-none py-2 ${border(errors.message)}`}
          />
        )}
      </Field>
    </div>
  );
}

/** Create a task (backend Decision 9): one per organisation or account a
 *  night, priority medium, due N days after the night. */
export function TaskFields({ action, errors, onChange }: { action: TaskAction; errors: ActionErrors; onChange: (next: TaskAction) => void }) {
  const titleId = useId();
  const assigneeId = useId();
  const dueId = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_8rem]">
      <Field id={titleId} label="Task title" error={errors.title}>
        {(aria) => (
          <input
            id={titleId}
            {...aria}
            value={action.title}
            maxLength={TITLE_MAX}
            placeholder="Call to check in"
            onChange={(event) => onChange({ ...action, title: event.target.value })}
            className={`${INPUT} ${border(errors.title)}`}
          />
        )}
      </Field>
      <Field id={assigneeId} label="Assign to" error={errors.assignee}>
        {(aria) => (
          <select id={assigneeId} {...aria} value={action.assignee} onChange={(event) => onChange({ ...action, assignee: event.target.value as Assignee })} className={`${FILTER_SELECT} w-full ${errors.assignee ? 'border-danger' : ''}`}>
            {ASSIGNEES.map((assignee) => (
              <option key={assignee} value={assignee}>
                {ASSIGNEE_LABEL[assignee]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id={dueId} label="Due in (days)" error={errors.due_in_days}>
        {(aria) => (
          <input
            id={dueId}
            {...aria}
            type="number"
            inputMode="numeric"
            min={0}
            max={DUE_MAX}
            step={1}
            value={Number.isNaN(action.due_in_days) ? '' : action.due_in_days}
            onChange={(event) => onChange({ ...action, due_in_days: event.target.value === '' ? Number.NaN : Number(event.target.value) })}
            className={`${INPUT} ${MONO} ${border(errors.due_in_days)}`}
          />
        )}
      </Field>
    </div>
  );
}

/** Change lifecycle (backend Decision 10): the stage only, chosen first
 *  (plan Decision 10). */
export function LifecycleFields({ action, errors, onChange }: { action: LifecycleDraft; errors: ActionErrors; onChange: (next: LifecycleDraft) => void }) {
  const stageId = useId();
  return (
    <Field id={stageId} label="Stage" hint={action.stage === 'churn' ? 'Churn sets the stage only; it does not record a churn date.' : null} error={errors.stage}>
      {(aria) => (
        <select id={stageId} {...aria} value={action.stage} onChange={(event) => onChange({ ...action, stage: event.target.value as LifecycleStage | '' })} className={`${FILTER_SELECT} w-full ${errors.stage ? 'border-danger' : ''}`}>
          <option value="">Choose a stage…</option>
          {STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Send a survey (spec §2.2): Surveys' type, subject, intro and roles; the
 *  500-person note; Send without review, off by default, asked first. */
export function SurveyFields({ action, kind, errors, onChange }: { action: SurveyAction; kind: SegmentKind | null; errors: ActionErrors; onChange: (next: SurveyAction) => void }) {
  const typeName = useId();
  const subjectId = useId();
  const introId = useId();
  const reviewId = useId();
  return (
    <div className="flex flex-col gap-3">
      <fieldset aria-describedby={`${typeName}-hint`} className="flex flex-col gap-2">
        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Survey type</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TYPES.map((option) => (
            <RadioTile
              key={option.value}
              name={typeName}
              label={TYPE_LABEL[option.value]}
              icon={option.icon}
              checked={action.survey_type === option.value}
              onChange={() => onChange({ ...action, survey_type: option.value })}
            />
          ))}
        </div>
        <p id={`${typeName}-hint`} className="text-[11px] text-ink-muted">
          {TYPE_HINT[action.survey_type]}
        </p>
      </fieldset>
      <Field id={subjectId} label="Email subject" error={errors.subject}>
        {(aria) => (
          <input id={subjectId} {...aria} value={action.subject} maxLength={SUBJECT_MAX} onChange={(event) => onChange({ ...action, subject: event.target.value })} className={`${INPUT} ${border(errors.subject)}`} />
        )}
      </Field>
      <Field id={introId} label="Intro line (optional)" hint={<Count n={action.intro.length} max={INTRO_MAX} />} error={errors.intro}>
        {(aria) => (
          <textarea
            id={introId}
            {...aria}
            rows={2}
            maxLength={INTRO_MAX}
            value={action.intro}
            placeholder="A line above the question, in your own words"
            onChange={(event) => onChange({ ...action, intro: event.target.value })}
            className={`${INPUT} resize-none py-2 ${border(errors.intro)}`}
          />
        )}
      </Field>
      <RoleFields kind={kind} roles={action.roles} error={errors.roles} onRoles={(roles) => onChange({ ...action, roles })} />
      <p data-part="survey-limit" className="text-[11px] text-ink-muted">
        {SURVEY_LIMIT_NOTE}
      </p>
      <ConfirmedSwitch
        label="Send without review"
        checked={action.without_review}
        onChange={(on) => onChange({ ...action, without_review: on })}
        describedBy={reviewId}
        confirm={{
          title: 'Send without review?',
          message: "Each night's survey goes to the matched people at once instead of waiting in your review queue. Every Surveys rule still holds.",
          confirmLabel: 'Send without review',
        }}
      />
      <p id={reviewId} className={`text-[11px] ${action.without_review ? 'text-warning' : 'text-ink-muted'}`}>
        {action.without_review ? 'Surveys go out at night without you seeing them first.' : "Off: each night's survey waits in your review queue until you approve it."}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Write the cards**

Create `src/components/rules/ActionCards.tsx`:

```tsx
import { useId } from 'react';
import { Plus, X } from 'lucide-react';
import { availableActions, newAction, type ActionDraft } from '../../features/rules/ruleDraft';
import type { ActionErrors } from '../../features/rules/ruleErrors';
import { ACTION_LABEL } from '../../features/rules/ruleOptions';
import type { ActionType } from '../../features/rules/ruleTypes';
import type { PersonRef, SegmentKind } from '../../features/segments/segmentTypes';
import { BUTTON, FOCUS } from '../organizations/portfolio/styles';
import { LifecycleFields, NotifyFields, SurveyFields, TaskFields } from './ActionFields';

/** Then (spec §2.2): one to three action cards, each type once. Internal
 *  actions run on their own; a survey waits for review unless told
 *  otherwise. Errors show at each card's own fields (backend: a list
 *  aligned with the actions). */
export function ActionCards({ actions, kind, workspace, teammates, errors, listError, onChange }: {
  actions: ActionDraft[];
  kind: SegmentKind | null;
  workspace: string;
  teammates: PersonRef[];
  errors: ActionErrors[];
  listError?: string;
  onChange: (actions: ActionDraft[]) => void;
}) {
  const headingId = useId();
  const replace = (index: number, next: ActionDraft) => onChange(actions.map((action, at) => (at === index ? next : action)));
  const remove = (index: number) => onChange(actions.filter((_, at) => at !== index));
  const add = (type: ActionType) => onChange([...actions, newAction(type, kind, workspace)]);
  const addable = availableActions(actions, kind);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        Then
      </h3>
      <p className="text-[11px] text-ink-muted">One to three actions, each once. Notify, tasks and lifecycle run on their own; a survey waits for your review unless you say otherwise.</p>
      <ul aria-label="Actions" className="flex flex-col gap-3">
        {actions.map((action, index) => {
          const own = errors[index] ?? {};
          return (
            <li key={action.action} data-action={action.action} className="flex flex-col gap-3 rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <h4 className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{ACTION_LABEL[action.action]}</h4>
                {actions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${ACTION_LABEL[action.action]}`}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink sm:h-9 sm:w-9 ${FOCUS}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              {action.action === 'notify' ? <NotifyFields action={action} teammates={teammates} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {action.action === 'task' ? <TaskFields action={action} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {action.action === 'lifecycle' ? <LifecycleFields action={action} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {action.action === 'survey' ? <SurveyFields action={action} kind={kind} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {own.action ? (
                <p role="alert" className="text-[11px] text-danger">
                  {own.action}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {listError ? (
        <p role="alert" className="text-[11px] text-danger">
          {listError}
        </p>
      ) : null}
      {addable.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {addable.map((type) => (
            <button key={type} type="button" onClick={() => add(type)} className={BUTTON}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {ACTION_LABEL[type]}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/rules/ActionCards.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/rules/ActionFields.tsx src/components/rules/ActionCards.tsx src/components/rules/ActionCards.test.tsx
git commit -m "feat(rules): the builder's Then: notify, task, lifecycle and survey cards

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Test this rule

Spec §2.2 ("**Test this rule**: the server's dry run ("4 organisations would match tonight: Pizza Hut, Initech…", hidden count, cooldown skips)"); backend Decision 19 and gap 5; plan Decision 7.

**Files:**
- Create: `src/components/rules/useRuleTest.ts`, `src/components/rules/TestPanel.tsx`
- Test: `src/components/rules/TestPanel.test.tsx`

**Interfaces:**
- Consumes: `testRule` (Task 3), `ruleErrors`, `RuleErrors` (Task 2), `testSummary`, `testLines`, `CROSSED_NOTE` (Task 1), Surveys' `Lines`, `ApiError`, `errorMessage`, `QUIET`, `MONO`; the stub's `TESTS`.
- Produces:
  - `TestState` (`idle` | `loading` | `done` with `result` | `error` with `message`), `useRuleTest(request) → { state, run(): Promise<RuleErrors | null> }`: on click only; an answer shows only while the request is unchanged; a 4xx (not 429) comes back as field errors.
  - `TestPanel({ request, blocker, kind, cooldownDays, crossed, onCheck, onRefused })`: a section named "Test this rule"; the button "Test this rule" ("Testing…"), off with `blocker` beside it; the answer in `[data-part="test-result"]` (`[data-part="matches"]`, the skip lines, the crossing note).

- [ ] **Step 1: Write the failing test**

Create `src/components/rules/TestPanel.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestsOf } from '../../features/surveys/testSurveys';
import type { RuleErrors } from '../../features/rules/ruleErrors';
import { NOTIFY_ME_ACTION, stubRules } from '../../features/rules/testRules';
import type { RuleTestRequest } from '../../features/rules/ruleTypes';
import { TestPanel } from './TestPanel';

const REQUEST: RuleTestRequest = { segment: 7, trigger: 'entered', score: '', direction: '', threshold: null, cadence: '', weekday: null, actions: [NOTIFY_ME_ACTION], cooldown_days: 30 };

function Harness({ check = () => true, onRefused = vi.fn(), crossed = false }: { check?: () => boolean; onRefused?: (errors: RuleErrors) => void; crossed?: boolean }) {
  const [request, setRequest] = useState<RuleTestRequest | null>(REQUEST);
  return (
    <>
      <TestPanel request={request} blocker={request ? null : 'Choose a segment to test.'} kind="customer" cooldownDays={30} crossed={crossed} onCheck={check} onRefused={onRefused} />
      <button type="button" onClick={() => setRequest({ ...REQUEST, cooldown_days: 14 })}>
        Change the rule
      </button>
      <button type="button" onClick={() => setRequest(null)}>
        Clear the segment
      </button>
    </>
  );
}

describe('TestPanel (spec §2.2, Test this rule)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server's dry run on click only, and words the answer as an estimate", async () => {
    const { spy } = stubRules();
    render(<Harness />);
    expect(screen.getByText('Who it would act on, from your segment as it is now. Nothing is changed.')).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    const matches = await screen.findByText(/would match if tonight's run happened now/);
    expect(matches.closest('[data-part="matches"]')).toHaveTextContent("3 organisations would match if tonight's run happened now: Globex, Initech, Pizza Hut.");
    expect(document.querySelector('[data-part="matches"] .font-mono-brand')).toHaveTextContent('3');
    expect(screen.getByText(/skipped \(acted on in the last 30 days\)/)).toBeInTheDocument();
    expect(screen.getByText(/in the segment you can't open isn't included/)).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)[0].body).toEqual(REQUEST);
  });

  it('adds the first-night note for a crossing rule', async () => {
    stubRules();
    render(<Harness crossed />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    expect(await screen.findByText(/A score rule never acts on its first night/)).toBeInTheDocument();
  });

  it('drops the answer once the rule changes', async () => {
    stubRules();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    await screen.findByText(/would match/);
    await userEvent.click(screen.getByRole('button', { name: 'Change the rule' }));
    expect(screen.queryByText(/would match/)).toBeNull();
  });

  it('does not ask when the client check fails, and is off with its reason without a segment', async () => {
    const { spy } = stubRules();
    render(<Harness check={() => false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Clear the segment' }));
    expect(screen.getByRole('button', { name: 'Test this rule' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Test this rule' })).toHaveAccessibleDescription('Choose a segment to test.');
  });

  it("hands a 400 back as field errors, and shows anything else as the panel's error", async () => {
    const onRefused = vi.fn();
    let calls = 0;
    stubRules({
      test: () => {
        calls += 1;
        return calls === 1 ? { status: 400, body: { threshold: ['Choose a value from 0 to 100.'] } } : { status: 500, body: { detail: 'Tests are down.' } };
      },
    });
    render(<Harness onRefused={onRefused} />);
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    await waitFor(() => expect(onRefused).toHaveBeenCalledWith({ field: { threshold: 'Choose a value from 0 to 100.' }, action: [] }));
    await userEvent.click(screen.getByRole('button', { name: 'Test this rule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tests are down.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/rules/TestPanel.test.tsx`
Expected: FAIL, "Failed to resolve import "./TestPanel"".

- [ ] **Step 3: Write the hook**

Create `src/components/rules/useRuleTest.ts`:

```ts
import { useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { testRule } from '../../features/rules/ruleApi';
import { ruleErrors, type RuleErrors } from '../../features/rules/ruleErrors';
import type { RuleTestRequest, RuleTestResult } from '../../features/rules/ruleTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type TestState =
  | { status: 'idle' }
  | { status: 'loading'; key: string }
  | { status: 'done'; key: string; result: RuleTestResult }
  | { status: 'error'; key: string; message: string };

/** Test this rule (spec §2.2, plan Decision 7): the server's dry run, on
 *  click only. An answer shows only while the rule is as it was tested, so
 *  a late answer for an older rule is dropped. A refusal of the body (400,
 *  403, 404) comes back as field errors; anything else is the panel's. */
export function useRuleTest(request: RuleTestRequest | null): { state: TestState; run: () => Promise<RuleErrors | null> } {
  const key = JSON.stringify(request);
  const [state, setState] = useState<TestState>({ status: 'idle' });

  async function run(): Promise<RuleErrors | null> {
    if (!request) return null;
    const asked = key;
    setState({ status: 'loading', key: asked });
    try {
      const result = await testRule(request);
      setState({ status: 'done', key: asked, result });
      return null;
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        setState({ status: 'idle' });
        return ruleErrors(err, 'Could not test this rule.');
      }
      setState({ status: 'error', key: asked, message: errorMessage(err, 'Could not test this rule. Try again.') });
      return null;
    }
  }

  return { state: state.status !== 'idle' && state.key === key ? state : { status: 'idle' }, run };
}
```

- [ ] **Step 4: Write the panel**

Create `src/components/rules/TestPanel.tsx`:

```tsx
import { useId } from 'react';
import type { RuleErrors } from '../../features/rules/ruleErrors';
import { CROSSED_NOTE, testLines, testSummary } from '../../features/rules/ruleText';
import type { RuleTestRequest, RuleTestResult } from '../../features/rules/ruleTypes';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { MONO, QUIET } from '../organizations/portfolio/styles';
import { Lines } from '../surveys/Lines';
import { useRuleTest } from './useRuleTest';

function TestResult({ result, kind, cooldownDays, crossed }: { result: RuleTestResult; kind: SegmentKind | null; cooldownDays: number; crossed: boolean }) {
  const summary = testSummary(result, kind);
  const lines = testLines(result, cooldownDays);
  return (
    <div data-part="test-result" className="flex flex-col gap-1">
      <p data-part="matches" className="text-[13px] text-ink">
        <span className={`${MONO} text-[22px] font-semibold`}>{summary.n}</span> {summary.text}
      </p>
      {lines.length > 0 ? (
        <p className="text-[13px] text-ink-muted">
          <Lines lines={lines} />
        </p>
      ) : null}
      {crossed ? <p className="text-[11px] text-ink-muted">{CROSSED_NOTE}</p> : null}
    </div>
  );
}

/** Test this rule (spec §2.2): asks only when the form's own check passes
 *  (`onCheck`); a refused body goes back to the form's fields (`onRefused`). */
export function TestPanel({ request, blocker, kind, cooldownDays, crossed, onCheck, onRefused }: {
  request: RuleTestRequest | null;
  /** Why it can't be tested yet, or null. */
  blocker: string | null;
  kind: SegmentKind | null;
  cooldownDays: number;
  crossed: boolean;
  onCheck: () => boolean;
  onRefused: (errors: RuleErrors) => void;
}) {
  const { state, run } = useRuleTest(request);
  const reasonId = useId();

  async function test() {
    if (!onCheck()) return;
    const refused = await run();
    if (refused) onRefused(refused);
  }

  return (
    <section aria-label="Test this rule" className="flex flex-col gap-2 rounded-xl bg-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void test()}
          disabled={blocker !== null || state.status === 'loading'}
          aria-describedby={blocker ? reasonId : undefined}
          className={`${QUIET} border border-line bg-surface`}
        >
          {state.status === 'loading' ? 'Testing…' : 'Test this rule'}
        </button>
        {blocker ? (
          <p id={reasonId} className="text-[11px] text-ink-muted">
            {blocker}
          </p>
        ) : null}
      </div>
      <div aria-live="polite">
        {state.status === 'done' ? <TestResult result={state.result} kind={kind} cooldownDays={cooldownDays} crossed={crossed} /> : null}
        {state.status === 'error' ? (
          <p role="alert" className="text-[13px] text-danger">
            {state.message}
          </p>
        ) : null}
        {state.status === 'idle' ? <p className="text-[11px] text-ink-muted">Who it would act on, from your segment as it is now. Nothing is changed.</p> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/rules/TestPanel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/rules/useRuleTest.ts src/components/rules/TestPanel.tsx src/components/rules/TestPanel.test.tsx
git commit -m "feat(rules): Test this rule on the server's dry run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 10: The rule builder modal, and Automate on a segment

Spec §2.2 (the whole builder: "**Sharing**; Save. Rules are saved off; turning on (here or on the row) and ticking "Send without review" each confirm first"), §2.5; backend Decisions 26, 27 and the error table; plan Decisions 5–8, 11, 13, 18.

**Files:**
- Create: `src/pages/rules/RuleBuilder.tsx`
- Modify: `src/components/segments/SegmentHeader.tsx` (Automate), `src/pages/rules/testPages.tsx` (routes)
- Test: `src/pages/rules/RuleBuilder.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–9 (`checkDraft`, `emptyDraft`, `fromRule`, `toActions`, `toTestBody`, `toTrigger`, `toWrite`, `withKind`, `RuleDraft`; `hasErrors`, `NO_ERRORS`, `ruleErrors`, `RuleErrors`; `NAME_MAX`, `NIGHTLY_CAP`, `COOLDOWN_MIN`, `COOLDOWN_MAX`, `scoresFor`; `cooldownHint`, `ruleParts`, `turnOnText`, `SegmentLike`; `createRule`, `updateRule`; `TriggerFields`, `ActionCards`, `TestPanel`, `ConfirmedSwitch`, `Field`); Segments' `BuilderDialog`, `RuleSentence`, `SharingFields`, `SegmentOutlet`, `SegmentPage`; Surveys' `SurveyPreview`, `useMySegments`; `useMembers`; `useAppSelector`; `EmptyState`.
- Produces:
  - `RuleForm` (module-private): `{ initial: Rule | null; segmentId: number | null; onClose; onDone(rule) }`.
  - `NewRuleModal({ segmentId?, onClose })`, `NewRuleRoute()` (`/scenarios/rules/new`, closes to `/scenarios`), `RuleSegmentRoute()` (`/segments/:id/rule`, closes to the segment; a notice for a non-owner). Saving a new rule opens `/scenarios/rules/<id>`.
  - The dialog is named "New rule" (or "Edit {name}"); the form has a textbox "Name", the When section, the Then section, "Once per record every (days)", Sharing, the switch "Run every night", the "Test this rule" section, the survey Preview, and Cancel / "Save rule".

- [ ] **Step 1: Route the builder in the test helpers**

In `src/pages/rules/testPages.tsx`, add the imports:

```tsx
import { SegmentPage } from '../segments/SegmentPage';
import { NewRuleRoute, RuleSegmentRoute } from './RuleBuilder';
```

and replace the `<Routes>…</Routes>` block with:

```tsx
          <Routes>
            <Route
              element={
                <>
                  <ScenariosHome />
                  <Where />
                </>
              }
            >
              <Route path="/scenarios" element={null} />
              <Route path="/scenarios/rules/new" element={<NewRuleRoute />} />
            </Route>
            <Route
              path="/segments/:id"
              element={
                <>
                  <SegmentPage />
                  <Where />
                </>
              }
            >
              <Route path="rule" element={<RuleSegmentRoute />} />
            </Route>
            <Route path="*" element={<Where />} />
          </Routes>
```

- [ ] **Step 2: Write the failing test**

Create `src/pages/rules/RuleBuilder.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { NOTIFY_ME_ACTION, stubRules } from '../../features/rules/testRules';
import { resetViewport } from '../../test/viewport';
import { renderRules } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const segmentsLoaded = async (modal: HTMLElement) => waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).not.toBeDisabled());

async function openNew() {
  renderRules('/scenarios/rules/new');
  const modal = await screen.findByRole('dialog', { name: 'New rule' });
  await segmentsLoaded(modal);
  return modal;
}

describe('the rule builder (spec §2.2)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens over the list, reads the rule as one sentence, and saves it off', async () => {
    const { spy } = stubRules();
    const modal = await openNew();
    expect(screen.getByRole('tab', { name: 'Rules' })).toBeInTheDocument();
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('Choose a segment, and the rule reads here as one sentence.');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '7');
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('When an organisation enters Renewal risk → notify me');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Renewal entries');
    expect(within(modal).getByRole('switch', { name: 'Run every night' })).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    expect(requestsOf(spy, 'POST', /^\/rules\/$/)[0].body).toEqual({
      name: 'Renewal entries', segment: 7, trigger: 'entered', score: '', direction: '', threshold: null, cadence: '', weekday: null,
      actions: [NOTIFY_ME_ACTION], cooldown_days: 30, is_active: false, sharing: 'private',
    });
  });

  it('checks first: errors at their fields, focus on the first, nothing sent', async () => {
    const { spy } = stubRules();
    const modal = await openNew();
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Give the rule a name.');
    expect(name).toHaveFocus();
    expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveAccessibleDescription(/Choose a segment\./);
    expect(requestsOf(spy, 'POST', /^\/rules\/$/)).toHaveLength(0);
  });

  it('builds a score line with a survey, tests it, turns it on after the confirm, and saves it on', async () => {
    const { spy } = stubRules();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Unhappy renewals');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '7');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'crossed');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Score' }), 'csat');
    await userEvent.type(within(modal).getByRole('spinbutton', { name: 'Value' }), '60');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send a survey' }));
    expect(within(modal).getByRole('region', { name: 'Preview' })).toHaveTextContent('How likely are you to recommend Acme Inc to a friend or colleague?');
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('When CSAT falls below 60 in Renewal risk → notify me, survey');

    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    expect(await within(modal).findByText(/would match if tonight's run happened now: Globex, Initech, Pizza Hut\./)).toBeInTheDocument();
    expect(within(modal).getByText(/A score rule never acts on its first night/)).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)[0].body).toMatchObject({ name: 'Unhappy renewals', segment: 7, trigger: 'crossed', score: 'csat', threshold: 60 });

    await userEvent.click(within(modal).getByRole('switch', { name: 'Run every night' }));
    const question = within(modal).getByRole('group', { name: 'Turn on Unhappy renewals?' });
    expect(question).toHaveTextContent('From tonight it runs once a night on Renewal risk and will notify me, survey. Its surveys wait for your review first.');
    await userEvent.click(within(question).getByRole('button', { name: 'Turn on' }));
    expect(within(modal).getByRole('switch', { name: 'Run every night' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    expect(requestsOf(spy, 'POST', /^\/rules\/$/)[0].body).toEqual({
      name: 'Unhappy renewals', segment: 7, trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60, cadence: '', weekday: null,
      actions: [NOTIFY_ME_ACTION, { action: 'survey', survey_type: 'nps', subject: 'A quick question from Acme Inc', intro: '', roles: ['champion', 'decision_maker'], without_review: false }],
      cooldown_days: 30, is_active: true, sharing: 'private',
    });
  });

  it("puts a server refusal at its action's field, with focus there", async () => {
    stubRules({ create: () => ({ status: 400, body: { actions: [{ to: ['Choose who to notify.'] }] } }) });
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Watch');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const who = within(modal).getByRole('combobox', { name: 'Who' });
    await waitFor(() => expect(who).toHaveAccessibleDescription('Choose who to notify.'));
    expect(who).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(who).toHaveFocus());
    expect(where()).toBe('/scenarios/rules/new');
  });

  it('puts the segment ownership refusal at the segment', async () => {
    stubRules({ create: () => ({ status: 403, body: { detail: 'A rule can only use your own segments.' } }) });
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Watch');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveAccessibleDescription(/A rule can only use your own segments\./));
  });

  it('says the 50-rule limit above the form, focused', async () => {
    stubRules({ limit: 3 });
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Watch');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const alert = await within(modal).findByText('You can own at most 50 rules.');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('warns when a weekly rule waits longer than a week, and checks the wait', async () => {
    stubRules();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Weekly');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '7');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'schedule');
    const wait = within(modal).getByRole('spinbutton', { name: 'Once per record every (days)' });
    expect(wait).toHaveValue(30);
    expect(wait).toHaveAccessibleDescription(/A weekly rule that waits 30 days reaches each record about every 5 weeks\./);
    expect(wait).toHaveAccessibleDescription(/At most 200 records a night/);
    await userEvent.clear(wait);
    await userEvent.type(wait, '400');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    expect(wait).toHaveAccessibleDescription(/Choose 1 to 365 days\./);
    expect(wait).toHaveFocus();
  });

  it('Cancel returns to the list, which reads again', async () => {
    const { spy } = stubRules();
    const modal = await openNew();
    await screen.findByRole('list', { name: 'Rules' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/scenarios'));
    await waitFor(() => expect(requestsOf(spy, 'GET', /^\/rules\/$/)).toHaveLength(2));
  });
});

describe('Automate (spec §2.5)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("sits beside Survey these on the owner's segment, and not on someone else's", async () => {
    stubRules();
    const first = renderRules('/segments/7');
    const link = await screen.findByRole('link', { name: 'Automate' });
    expect(link).toHaveAttribute('href', '/segments/7/rule');
    expect(screen.getByRole('link', { name: 'Survey these' }).compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    first.unmount();
    renderRules('/segments/8');
    expect(await screen.findByRole('heading', { level: 1, name: 'EMEA accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Automate' })).toBeNull();
  });

  it('opens the builder over the segment with it chosen; saving opens the new rule', async () => {
    stubRules();
    renderRules('/segments/7');
    await userEvent.click(await screen.findByRole('link', { name: 'Automate' }));
    const modal = await screen.findByRole('dialog', { name: 'New rule' });
    expect(where()).toBe('/segments/7/rule');
    expect(screen.getByRole('heading', { level: 1, name: 'Renewal risk' })).toBeInTheDocument();
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Renewal risk'));
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Risk entries');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
  });

  it('Cancel returns to the segment', async () => {
    stubRules();
    renderRules('/segments/7/rule');
    const modal = await screen.findByRole('dialog', { name: 'New rule' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/segments/7'));
  });

  it('tells anyone but the owner who typed the address that it is not theirs to automate', async () => {
    stubRules();
    renderRules('/segments/8/rule');
    const modal = await screen.findByRole('dialog', { name: 'New rule' });
    expect(within(modal).getByText('Only Carl CSM can automate this segment')).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: 'Open segment' })).toHaveAttribute('href', '/segments/8');
    expect(within(modal).queryByRole('button', { name: 'Save rule' })).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/rules/RuleBuilder.test.tsx`
Expected: FAIL, "Failed to resolve import "./RuleBuilder"".

- [ ] **Step 4: Write the builder**

Create `src/pages/rules/RuleBuilder.tsx`:

```tsx
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import { createRule, updateRule } from '../../features/rules/ruleApi';
import { checkDraft, emptyDraft, fromRule, toActions, toTestBody, toTrigger, toWrite, withKind, type RuleDraft } from '../../features/rules/ruleDraft';
import { hasErrors, NO_ERRORS, ruleErrors, type RuleErrors } from '../../features/rules/ruleErrors';
import { COOLDOWN_MAX, COOLDOWN_MIN, NAME_MAX, NIGHTLY_CAP, scoresFor } from '../../features/rules/ruleOptions';
import { cooldownHint, ruleParts, turnOnText, type SegmentLike } from '../../features/rules/ruleText';
import type { Rule, SurveyAction } from '../../features/rules/ruleTypes';
import type { PersonRef, SegmentKind, Sharing } from '../../features/segments/segmentTypes';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { ActionCards } from '../../components/rules/ActionCards';
import { ConfirmedSwitch } from '../../components/rules/ConfirmedSwitch';
import { Field } from '../../components/rules/Field';
import { TestPanel } from '../../components/rules/TestPanel';
import { TriggerFields } from '../../components/rules/TriggerFields';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { RuleSentence } from '../../components/segments/RuleSentence';
import { SharingFields } from '../../components/segments/SharingFields';
import { SurveyPreview } from '../../components/surveys/SurveyPreview';
import { useMySegments } from '../../components/surveys/useMySegments';
import type { SegmentOutlet } from '../segments/Builder';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const SHARING_NOTE = 'Teammates see the rule and its nights, only for records they may open, and a count of the rest. Only you can change it.';

/** The rule builder (spec §2.2) for a new rule or the owner's own. */
function RuleForm({ initial, segmentId, onClose, onDone }: {
  initial: Rule | null;
  segmentId: number | null;
  onClose: () => void;
  onDone: (rule: Rule) => void;
}) {
  const workspace = useAppSelector((state) => state.auth.user?.organisation?.name ?? 'your company');
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const teammates = useMemo<PersonRef[]>(
    () => members.filter((member) => member.is_active && member.id !== me).map((member) => ({ id: member.id, name: member.name })),
    [members, me],
  );
  const segments = useMySegments();
  const [draft, setDraft] = useState<RuleDraft>(() => (initial ? fromRule(initial) : emptyDraft(segmentId)));
  const [errors, setErrors] = useState<RuleErrors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const nameId = useId();
  const cooldownId = useId();
  const limitsId = useId();
  const statusId = useId();
  const statusHeadingId = useId();
  const reasonId = useId();

  // After a refusal, focus goes to the first field in error, else the form's alert.
  useEffect(() => {
    if (focusTick === 0) return;
    (bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? alertRef.current)?.focus();
  }, [focusTick]);
  const refuse = (found: RuleErrors) => {
    setErrors(found);
    setFocusTick((n) => n + 1);
  };

  const rowOf = (id: number | null) => segments.rows?.find((row) => row.id === id) ?? null;
  const kindOf = (id: number | null): SegmentKind | null => rowOf(id)?.kind ?? (initial?.segment && initial.segment.id === id ? initial.segment.kind : null);
  const kind = kindOf(draft.segment);
  const segmentName = rowOf(draft.segment)?.name ?? (initial?.segment && initial.segment.id === draft.segment ? initial.segment.name : null);
  const segment: SegmentLike = kind && segmentName ? { name: segmentName, kind } : null;
  // A new rule waits for my segments: until then a segment's kind is unknown.
  const loading = !initial && segments.rows === null;

  /** A change; a new segment carries its kind into the actions and the line. */
  const change = (patch: Partial<RuleDraft>) =>
    setDraft((current) => {
      const next = { ...current, ...patch };
      if ('segment' in patch) {
        const nextKind = kindOf(next.segment);
        next.actions = withKind(next.actions, nextKind);
        if (next.score && !scoresFor(nextKind).includes(next.score)) next.score = '';
      }
      return next;
    });

  // Sharing as Segments do it: someone deactivated since is dropped once the members load.
  const shared = members.length > 0 ? draft.sharedWith.filter((person) => teammates.some((mate) => mate.id === person.id)) : draft.sharedWith;
  const ready: RuleDraft = { ...draft, sharedWith: shared };
  const actions = toActions(draft, kind);
  const survey = draft.actions.find((action): action is SurveyAction => action.action === 'survey');
  const cooldown = Number(draft.cooldown);
  const hint = cooldownHint(draft.trigger, draft.cadence, cooldown);

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = checkDraft(ready, kind);
    if (hasErrors(found)) {
      refuse(found);
      return;
    }
    setErrors(NO_ERRORS);
    setSaving(true);
    try {
      const body = toWrite(ready, kind);
      onDone(initial ? await updateRule(initial.id, body) : await createRule(body));
    } catch (err) {
      setSaving(false);
      refuse(ruleErrors(err));
    }
  }

  return (
    <BuilderDialog title={initial ? `Edit ${initial.name}` : 'New rule'} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {errors.form ? (
            <p ref={alertRef} role="alert" tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
              {errors.form}
            </p>
          ) : null}
          <div data-part="rule-sentence" className="rounded-lg bg-subtle px-3 py-2">
            {draft.segment === null ? (
              <p className="text-[13px] text-ink-muted">Choose a segment, and the rule reads here as one sentence.</p>
            ) : segment === null ? (
              <p className="text-[13px] text-ink-muted">Loading your segments…</p>
            ) : (
              <RuleSentence parts={ruleParts({ ...toTrigger(draft), actions }, segment)} />
            )}
          </div>
          <div data-part="builder-columns" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="flex min-w-0 flex-col divide-y divide-line-subtle">
              <div className="pb-4">
                <Field id={nameId} label="Name" error={errors.field.name}>
                  {(aria) => (
                    <input
                      id={nameId}
                      {...aria}
                      value={draft.name}
                      maxLength={NAME_MAX}
                      placeholder="Unhappy renewals"
                      onChange={(event) => change({ name: event.target.value })}
                      className={`${INPUT} ${errors.field.name ? 'border-danger' : 'border-line'}`}
                    />
                  )}
                </Field>
              </div>
              <div className="py-4">
                <TriggerFields
                  draft={draft}
                  kind={kind}
                  segments={segments.rows}
                  segmentsError={segments.error}
                  fallback={initial?.segment ?? null}
                  errors={errors.field}
                  onChange={change}
                />
              </div>
              <div className="py-4">
                <ActionCards
                  actions={draft.actions}
                  kind={kind}
                  workspace={workspace}
                  teammates={teammates}
                  errors={errors.action}
                  listError={errors.field.actions}
                  onChange={(next) => change({ actions: next })}
                />
              </div>
              <section aria-labelledby={limitsId} className="flex flex-col gap-2 py-4">
                <h3 id={limitsId} className="text-[15px] font-semibold text-ink">
                  Limits
                </h3>
                <Field
                  id={cooldownId}
                  label="Once per record every (days)"
                  hint={
                    <>
                      At most <span className={MONO}>{NIGHTLY_CAP}</span> records a night; any more that night are counted, not acted on.{hint ? ` ${hint}` : ''}
                    </>
                  }
                  error={errors.field.cooldown_days}
                >
                  {(aria) => (
                    <input
                      id={cooldownId}
                      {...aria}
                      type="number"
                      inputMode="numeric"
                      min={COOLDOWN_MIN}
                      max={COOLDOWN_MAX}
                      step={1}
                      value={draft.cooldown}
                      onChange={(event) => change({ cooldown: event.target.value })}
                      className={`${INPUT} ${MONO} sm:w-32 ${errors.field.cooldown_days ? 'border-danger' : 'border-line'}`}
                    />
                  )}
                </Field>
              </section>
              <div className="py-4">
                <SharingFields
                  sharing={draft.sharing}
                  sharedWith={shared}
                  teammates={teammates}
                  error={errors.field.shared_with ?? errors.field.sharing ?? null}
                  onChange={(sharing: Sharing, sharedWith: PersonRef[]) => change({ sharing, sharedWith })}
                  note={SHARING_NOTE}
                />
              </div>
              <section aria-labelledby={statusHeadingId} className="flex flex-col gap-2 pt-4">
                <h3 id={statusHeadingId} className="text-[15px] font-semibold text-ink">
                  Status
                </h3>
                <ConfirmedSwitch
                  label="Run every night"
                  checked={draft.isActive}
                  onChange={(on) => change({ isActive: on })}
                  describedBy={statusId}
                  confirm={{ title: `Turn on ${draft.name.trim() || 'this rule'}?`, message: turnOnText(actions, segment), confirmLabel: 'Turn on' }}
                />
                <p id={statusId} className="text-[11px] text-ink-muted">
                  {draft.isActive ? 'It runs tonight once saved.' : 'Rules are saved off. Turn it on once the test looks right.'}
                </p>
                {errors.field.is_active ? (
                  <p role="alert" className="text-[11px] text-danger">
                    {errors.field.is_active}
                  </p>
                ) : null}
              </section>
            </div>
            <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0">
              <TestPanel
                request={draft.segment === null || loading ? null : toTestBody(draft, kind, initial?.id ?? null)}
                blocker={loading ? 'Loading your segments…' : draft.segment === null ? 'Choose a segment to test.' : null}
                kind={kind}
                cooldownDays={cooldown}
                crossed={draft.trigger === 'crossed'}
                onCheck={() => {
                  const found = checkDraft(draft, kind, { forTest: true });
                  if (hasErrors(found)) {
                    refuse(found);
                    return false;
                  }
                  setErrors(NO_ERRORS);
                  return true;
                }}
                onRefused={refuse}
              />
              {survey ? <SurveyPreview type={survey.survey_type} subject={survey.subject} intro={survey.intro} workspace={workspace} /> : null}
            </div>
          </div>
        </div>
        <div data-part="builder-footer" className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          {loading ? (
            <p id={reasonId} className="basis-full text-[11px] text-ink-muted sm:mr-auto sm:basis-auto">
              Loading your segments…
            </p>
          ) : null}
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={saving || loading} aria-describedby={loading ? reasonId : undefined} className={PRIMARY}>
            {saving ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

/** A new rule over whatever page opened it (the Rules list, or a segment's
 *  Automate with `segmentId`). Saving opens it. */
export function NewRuleModal({ segmentId = null, onClose }: { segmentId?: number | null; onClose: () => void }) {
  const navigate = useNavigate();
  return <RuleForm initial={null} segmentId={segmentId} onClose={onClose} onDone={(rule) => navigate(`/scenarios/rules/${rule.id}`)} />;
}

/** /scenarios/rules/new: the modal over the Rules list (spec §2.1). */
export function NewRuleRoute() {
  const navigate = useNavigate();
  return <NewRuleModal onClose={() => navigate('/scenarios')} />;
}

/** /segments/:id/rule (spec §2.5, plan Decision 18): Automate, the builder
 *  over the segment's page with that segment chosen. The owner's only, as
 *  a rule runs on its owner's own segment. */
export function RuleSegmentRoute() {
  const navigate = useNavigate();
  const { segment } = useOutletContext<SegmentOutlet>();
  const close = () => navigate(`/segments/${segment.id}`);
  if (!segment.is_owner) {
    return (
      <BuilderDialog title="New rule" onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${segment.owner.name} can automate this segment`}
            detail="A rule runs on its owner's own segment. Duplicate it to automate your own copy."
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
  return <NewRuleModal segmentId={segment.id} onClose={close} />;
}
```

- [ ] **Step 5: Put Automate on the segment's page**

In `src/components/segments/SegmentHeader.tsx`, change the lucide import to:

```tsx
import { Copy, Download, Pencil, Send, Trash2, Zap } from 'lucide-react';
```

and directly after the Survey these block (`… Survey these\n            </Link>\n          ) : null}`), add:

```tsx
          {segment.is_owner ? (
            // Rules spec §2.5: a rule runs on its owner's own segment.
            <Link to={`/segments/${segment.id}/rule`} className={BUTTON}>
              <Zap className="h-4 w-4" aria-hidden="true" />
              Automate
            </Link>
          ) : null}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/rules/RuleBuilder.test.tsx src/pages/surveys/surveyThese.test.tsx src/components/segments`
Expected: PASS (12 new tests; Survey these and the Segments components unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/pages/rules/RuleBuilder.tsx src/pages/rules/RuleBuilder.test.tsx src/pages/rules/testPages.tsx src/components/segments/SegmentHeader.tsx
git commit -m "feat(rules): the rule builder modal, and Automate on a segment

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: The rule page: header, nights and their records; Edit

Spec §2.3 ("Header sentence, on/off, Edit, a paused notice when it switched itself off; nightly runs as rows ("4 Oct · fired 3 · skipped 2 · 1 waiting for review"), each opening its records (name, what each action did, why skipped), hidden count for shared viewers; cursor Show more"), §3 (twice-filtered reads); backend Decisions 20, 23, 24; plan Decisions 6, 14, 15, 21, 22.

**Files:**
- Create: `src/components/rules/useRule.ts`, `src/components/rules/RuleStates.tsx`, `src/components/rules/RuleHeader.tsx`, `src/components/rules/NightsSection.tsx`, `src/pages/rules/RulePage.tsx`
- Modify: `src/pages/rules/RuleBuilder.tsx` (`EditRuleRoute`), `src/pages/rules/testPages.tsx` (routes)
- Test: `src/pages/rules/RulePage.test.tsx`

**Interfaces:**
- Consumes: `fetchRule`, `fetchRuns`, `fetchRun`, `deleteRule` (Task 3); `openRun` (Task 2); `ruleParts`, `runParts`, `actionResultText`, `skipReasonText`, `pausedText`, `sharingText` (Task 1); `RuleSwitch`, `Parts` (Tasks 5–6); `RuleForm` (Task 10, module-private); Segments' `RuleSentence`, `recordHref`, `dayText`; `ConfirmDialog`; `EmptyState`, `ErrorBlock`, `ItemSkeleton`, `MoreButton`; `BUTTON`, `QUIET`, `FOCUS`, `MONO`; `errorMessage`; `ApiError`; `OrganizationsFrame`.
- Produces:
  - `RuleLoad`, `useRule(id) → [load, replace, retry]` (`missing` for a 404).
  - `RuleLoading`, `RuleMissing` ("Rule not found", link "All rules" to `/scenarios`), `RuleFailed`.
  - `RuleHeader({ rule, onReplace })`: `h1`, `[data-part="sentence"]`, `[data-part="meta"]`, `[data-part="paused"]` (`role="status"`), the owner's switch, Edit (`/scenarios/rules/:id/edit`) and Delete; a reader's `[data-part="status"]`.
  - `NightsSection({ rule, openRun })`: a section headed "Nights"; `<ul aria-label="Nights">` of `<li data-run>` rows whose button (`aria-expanded`) is named by the night line; "Review it" (owner, waiting); the records list "Records on {day}" with `[data-part="hidden"]`; "Show more nights".
  - `RuleOutlet { rule; onReplace }`, `RulePage()` (`/scenarios/rules/:id`), `EditRuleRoute()` (`/scenarios/rules/:id/edit`).

- [ ] **Step 1: Route the page in the test helpers**

In `src/pages/rules/testPages.tsx`, change the builder import and add the page's:

```tsx
import { EditRuleRoute, NewRuleRoute, RuleSegmentRoute } from './RuleBuilder';
import { RulePage } from './RulePage';
```

and add, right after the `ScenariosHome` layout route:

```tsx
            <Route
              path="/scenarios/rules/:id"
              element={
                <>
                  <RulePage />
                  <Where />
                </>
              }
            >
              <Route path="edit" element={<EditRuleRoute />} />
            </Route>
```

- [ ] **Step 2: Write the failing test**

Create `src/pages/rules/RulePage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { stubRules } from '../../features/rules/testRules';
import { resetViewport } from '../../test/viewport';
import { renderRules } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const nights = () => screen.findByRole('list', { name: 'Nights' });

describe('a rule (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("heads the owner's rule with its sentence, sharing, wait, switch, Edit and Delete", async () => {
    stubRules();
    renderRules('/scenarios/rules/5');
    expect(await screen.findByRole('heading', { level: 1, name: 'Renewal watch' })).toBeInTheDocument();
    expect(document.querySelector('[data-part="sentence"]')).toHaveTextContent('When CSAT falls below 60 in Renewal risk → survey, notify me');
    expect(document.querySelector('[data-part="meta"]')).toHaveTextContent('Yours · Shared with the workspace · Once per record every 30 days');
    expect(screen.getByRole('switch', { name: 'Run Renewal watch every night' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/scenarios/rules/5/edit');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('lists the nights as the spec words them, newest first, with Review it while one waits', async () => {
    stubRules();
    renderRules('/scenarios/rules/5');
    const list = await nights();
    expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '4 Oct · fired 3 · skipped 2 · 1 waiting for review',
      '3 Oct · fired 1 · 1 waiting for review',
    ]);
    expect(within(list).getAllByRole('link', { name: 'Review it' }).map((link) => link.getAttribute('href'))).toEqual(['/brain/review', '/brain/review']);
  });

  it("opens a night's records: what each action did, and why one was skipped", async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/5');
    const night = within(await nights()).getByRole('button', { name: /^4 Oct/ });
    expect(night).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(night);
    expect(night).toHaveAttribute('aria-expanded', 'true');
    const records = await screen.findByRole('list', { name: 'Records on 4 Oct 2026' });
    const globex = within(records).getByRole('link', { name: 'Globex' });
    expect(globex).toHaveAttribute('href', '/organizations/1');
    expect(globex.closest('li')).toHaveTextContent('Survey: waiting for review · Notify: done');
    expect(within(records).getByRole('link', { name: 'Shopify' }).closest('li')).toHaveTextContent('Skipped: acted on in the last 30 days');
    expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/9\/$/)).toHaveLength(1);
  });

  it('opens the night the notification links to', async () => {
    stubRules();
    renderRules('/scenarios/rules/5?run=8');
    expect(await screen.findByRole('list', { name: 'Records on 3 Oct 2026' })).toBeInTheDocument();
    expect(within(await nights()).getByRole('button', { name: /^3 Oct/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('pages the nights with Show more under the cursor', async () => {
    const { spy } = stubRules({ pageSize: 1 });
    renderRules('/scenarios/rules/5');
    expect(within(await nights()).getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Show more nights' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Nights' })).getAllByRole('listitem')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Show more nights' })).toBeNull();
    expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/$/)[1].query.get('cursor')).toEqual(expect.any(String));
  });

  it("shows a reader only what they may open, and counts the rest; no switch, Edit or Delete", async () => {
    stubRules();
    renderRules('/scenarios/rules/8');
    expect(await screen.findByRole('heading', { level: 1, name: 'EMEA renewals' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(document.querySelector('[data-part="status"]')).toHaveTextContent('On');
    expect(document.querySelector('[data-part="meta"]')).toHaveTextContent('Owned by Carl CSM · Shared with Alice · Once per record every 30 days');
    const night = within(await nights()).getByRole('button', { name: "28 Sep · fired 1 · 2 you can't open" });
    await userEvent.click(night);
    const records = await screen.findByRole('list', { name: 'Records on 28 Sep 2026' });
    expect(within(records).getAllByRole('listitem')).toHaveLength(1);
    expect(within(records).getByRole('link', { name: 'Pizza EMEA' }).closest('li')).toHaveTextContent('Lifecycle: done (live → renewal)');
    expect(document.querySelector('[data-part="hidden"]')).toHaveTextContent("2 more records you can't open.");
    expect(screen.queryByRole('link', { name: 'Review it' })).toBeNull();
  });

  it('explains a rule that switched itself off, and has no nights yet', async () => {
    stubRules();
    renderRules('/scenarios/rules/7');
    expect(await screen.findByText(/^It switched itself off\./)).toHaveTextContent('It switched itself off. Its segment was deleted. Choose another of your segments in Edit, then turn it on.');
    expect(document.querySelector('[data-part="paused"]')).toHaveAttribute('role', 'status');
    expect(document.querySelector('[data-part="sentence"]')).toHaveTextContent('When a record leaves a deleted segment → notify me');
    expect(await screen.findByText('No nights yet')).toBeInTheDocument();
    expect(screen.getByText('Turn it on and it runs tonight, after the scores and segments update.')).toBeInTheDocument();
  });

  it('shows the error with Try again when the nights fail, and reads them again', async () => {
    let calls = 0;
    const { spy } = stubRules({
      runsPage: () => {
        calls += 1;
        return calls === 1 ? { status: 500, body: { detail: 'Nights are down.' } } : undefined;
      },
    });
    renderRules('/scenarios/rules/5');
    expect(await screen.findByText('Nights are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await nights()).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/$/)).toHaveLength(2);
  });

  it('reads "Rule not found" for a rule that is missing or not shared', async () => {
    stubRules();
    const first = renderRules('/scenarios/rules/9');
    expect(await screen.findByText('Rule not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All rules' })).toHaveAttribute('href', '/scenarios');
    first.unmount();
    renderRules('/scenarios/rules/abc');
    expect(await screen.findByText('Rule not found')).toBeInTheDocument();
  });

  it('deletes after the confirm and returns to the list', async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete Renewal watch?' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1) as HTMLElement);
    await waitFor(() => expect(where()).toBe('/scenarios'));
    expect(requestsOf(spy, 'DELETE', /^\/rules\/5\/$/)).toHaveLength(1);
  });
});

describe('Edit (spec §2.2, over the rule)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("opens the owner's rule filled in, tests it with its own state, saves it whole and updates the page", async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/5');
    await userEvent.click(await screen.findByRole('link', { name: 'Edit' }));
    const modal = await screen.findByRole('dialog', { name: 'Edit Renewal watch' });
    expect(where()).toBe('/scenarios/rules/5/edit');
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Renewal watch');
    expect(within(modal).getByRole('combobox', { name: 'Score' })).toHaveDisplayValue('CSAT');
    expect(within(modal).getByRole('spinbutton', { name: 'Value' })).toHaveValue(60);
    expect(within(modal).getByRole('switch', { name: 'Run every night' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Renewal risk'));
    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    await within(modal).findByText(/would match/);
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)[0].body).toMatchObject({ rule: 5 });
    await userEvent.clear(within(modal).getByRole('textbox', { name: 'Name' }));
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Renewal watch 2');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/5'));
    expect(screen.getByRole('heading', { level: 1, name: 'Renewal watch 2' })).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/rules\/5\/$/)[0].body).toEqual({
      name: 'Renewal watch 2', segment: 7, trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60, cadence: '', weekday: null,
      actions: [
        { action: 'survey', survey_type: 'nps', subject: 'A quick question from Acme Inc', intro: '', roles: ['champion', 'decision_maker'], without_review: false },
        { action: 'notify', to: 'me', people: [], message: '' },
      ],
      cooldown_days: 30, is_active: true, sharing: 'workspace',
    });
  });

  it('tells anyone but the owner that only the owner can edit it', async () => {
    stubRules();
    renderRules('/scenarios/rules/8/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit EMEA renewals' });
    expect(within(modal).getByText('Only Carl CSM can edit this rule')).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: 'Open rule' })).toHaveAttribute('href', '/scenarios/rules/8');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/rules/RulePage.test.tsx`
Expected: FAIL, "Failed to resolve import "./RulePage"".

- [ ] **Step 4: Write the load and its states**

Create `src/components/rules/useRule.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchRule } from '../../features/rules/ruleApi';
import type { Rule } from '../../features/rules/ruleTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type RuleLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; rule: Rule };

/** One rule, read for the reader: `missing` for a 404, the same for a rule
 *  that does not exist and one not shared with them. `replace` swaps in a
 *  newer copy (an edit, a switch); `retry` reads again. */
export function useRule(id: number): [RuleLoad, (rule: Rule) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: RuleLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRule(id).then(
      (rule) => {
        if (alive) setAnswer({ key, load: { status: 'ready', rule } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this rule.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((rule: Rule) => setAnswer({ key, load: { status: 'ready', rule } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}
```

Create `src/components/rules/RuleStates.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';

export function RuleLoading() {
  return <ItemSkeleton count={3} label="Loading rule" avatar={false} />;
}

/** A 404: missing and not shared read the same (backend Access rule). */
export function RuleMissing() {
  return (
    <EmptyState
      title="Rule not found"
      detail="It may have been deleted, or it isn't shared with you."
      action={
        <Link to="/scenarios" className={`${QUIET} border border-line`}>
          All rules
        </Link>
      }
    />
  );
}

export function RuleFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorBlock message={message} onRetry={onRetry} />;
}
```

- [ ] **Step 5: Write the header**

Create `src/components/rules/RuleHeader.tsx`:

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { deleteRule } from '../../features/rules/ruleApi';
import { pausedText, ruleParts, sharingText } from '../../features/rules/ruleText';
import type { Rule } from '../../features/rules/ruleTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { BUTTON, MONO } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { RuleSentence } from '../segments/RuleSentence';
import { RuleSwitch } from './RuleSwitch';

/** The rule's header (spec §2.3): its name, the rule as a sentence, whose
 *  it is, its sharing and its wait; the owner's switch, Edit and Delete
 *  (plan Decision 14); a paused notice when it switched itself off. */
export function RuleHeader({ rule, onReplace }: { rule: Rule; onReplace: (rule: Rule) => void }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const paused = pausedText(rule.paused_reason, rule.paused_message, rule.is_owner);
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 break-words text-[22px] font-semibold text-ink">{rule.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {rule.is_owner ? (
            <>
              <RuleSwitch rule={rule} onChange={onReplace} />
              <Link to={`/scenarios/rules/${rule.id}/edit`} className={BUTTON}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Link>
              <button type="button" onClick={() => setDeleting(true)} className={`${BUTTON} text-danger`}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            </>
          ) : (
            <p data-part="status" className="text-[13px] text-ink-muted">
              {rule.is_active ? 'On' : 'Off'}
            </p>
          )}
        </div>
      </div>
      <div data-part="sentence">
        <RuleSentence parts={ruleParts(rule, rule.segment)} />
      </div>
      <p data-part="meta" className="text-[11px] text-ink-muted">
        {rule.is_owner ? 'Yours' : `Owned by ${rule.owner.name}`} · {sharingText(rule.sharing, rule.shared_with)} · Once per record every{' '}
        <span className={MONO}>{rule.cooldown_days}</span> days
      </p>
      {paused ? (
        <p role="status" data-part="paused" className="flex items-start gap-2 rounded-lg bg-warning-dim px-3 py-2 text-[13px] text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {paused}
        </p>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${rule.name}?`}
          message="Its nights and any surveys waiting for your review are deleted. Nothing it has already done is undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteRule(rule.id);
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw errorMessage(err, 'Could not delete this rule.');
            }
            navigate('/scenarios');
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </header>
  );
}
```

- [ ] **Step 6: Write the nights**

Create `src/components/rules/NightsSection.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { fetchRun, fetchRuns } from '../../features/rules/ruleApi';
import { actionResultText, runParts, skipReasonText } from '../../features/rules/ruleText';
import type { Rule, RunDetail, RunRow } from '../../features/rules/ruleTypes';
import { dayText } from '../../features/segments/ruleSentence';
import { recordHref } from '../../features/segments/segmentFields';
import { EmptyState, ErrorBlock, ItemSkeleton, MoreButton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Parts } from './Parts';

type Records = { key: number; detail: RunDetail | null; error: string | null };

/** One night's records, read when the night is opened: only those the
 *  reader may open now, fired first; the rest a count (spec §3). */
function RunRecords({ id, rule, runId }: { id: string; rule: Rule; runId: number }) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Records | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRun(rule.id, runId).then(
      (detail) => {
        if (alive) setLoad({ key: attempt, detail, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key: attempt, detail: null, error: errorMessage(err, 'Could not load its records.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [rule.id, runId, attempt]);
  const current = load?.key === attempt ? load : null;

  return (
    <div id={id} className="flex flex-col gap-1 border-t border-line-subtle px-3 py-2">
      {!current ? <p className="text-[13px] text-ink-muted">Loading its records…</p> : null}
      {current?.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{current.error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : null}
      {current?.detail ? (
        <>
          {current.detail.records.length > 0 ? (
            <ul aria-label={`Records on ${dayText(current.detail.run_on)}`} className="flex flex-col divide-y divide-line-subtle">
              {current.detail.records.map((record) => (
                <li key={`${record.kind}-${record.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-[13px]">
                  {record.name ? (
                    <Link to={recordHref(record.kind, record.id)} className={`inline-flex min-h-11 items-center font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
                      {record.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink-muted">A deleted record</span>
                  )}
                  <span className="text-ink-muted">
                    {record.outcome === 'fired' ? record.actions.map(actionResultText).join(' · ') : skipReasonText(record, rule.cooldown_days)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-muted">No records you can open.</p>
          )}
          {current.detail.hidden_count > 0 ? (
            <p data-part="hidden" className="text-[11px] text-ink-muted">
              <span className={MONO}>{current.detail.hidden_count}</span> more {current.detail.hidden_count === 1 ? 'record' : 'records'} you can't open.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function NightRow({ rule, run, startOpen }: { rule: Rule; run: RunRow; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const panelId = useId();
  return (
    <li data-run={run.id} className="flex flex-col rounded-xl bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((now) => !now)}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-[13px] text-ink sm:min-h-9 ${FOCUS}`}
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          <span>
            <Parts parts={runParts(run)} />
          </span>
        </button>
        {rule.is_owner && run.review?.status === 'waiting' ? (
          <Link to="/brain/review" className={QUIET}>
            Review it
          </Link>
        ) : null}
      </div>
      {open ? <RunRecords id={panelId} rule={rule} runId={run.id} /> : null}
    </li>
  );
}

type Nights = { key: number; rows: RunRow[] | null; next: string | null; error: string | null };

/** The rule's nights (spec §2.3): rows, newest first, 20 a page under the
 *  server's cursor; each opens its records. `openRun` starts one open (the
 *  rule_fired link, plan Decision 15). */
export function NightsSection({ rule, openRun }: { rule: Rule; openRun: number | null }) {
  const headingId = useId();
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Nights | null>(null);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  useEffect(() => {
    let alive = true;
    fetchRuns(rule.id, null).then(
      (page) => {
        if (alive) setLoad({ key: attempt, rows: page.results, next: page.next, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key: attempt, rows: null, next: null, error: errorMessage(err, 'Could not load its nights.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [rule.id, attempt]);
  const current = load?.key === attempt ? load : null;

  async function showMore() {
    if (!current?.next || !current.rows) return;
    setMore({ busy: true, error: null });
    try {
      const page = await fetchRuns(rule.id, current.next);
      setLoad({ ...current, rows: [...current.rows, ...page.results], next: page.next });
      setMore({ busy: false, error: null });
    } catch (err) {
      setMore({ busy: false, error: errorMessage(err, 'Could not load more nights.') });
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-[15px] font-semibold text-ink">
        Nights
      </h2>
      {!current ? <ItemSkeleton count={3} label="Loading its nights" avatar={false} /> : null}
      {current?.error ? <ErrorBlock message={current.error} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {current?.rows && current.rows.length === 0 ? (
        <EmptyState
          title="No nights yet"
          detail={rule.is_active ? 'It runs tonight, after the scores and segments update.' : 'Turn it on and it runs tonight, after the scores and segments update.'}
          action={null}
        />
      ) : null}
      {current?.rows && current.rows.length > 0 ? (
        <>
          <ul aria-label="Nights" className="flex flex-col gap-1.5">
            {current.rows.map((run) => (
              <NightRow key={run.id} rule={rule} run={run} startOpen={run.id === openRun} />
            ))}
          </ul>
          <MoreButton next={current.next} loading={more.busy} error={more.error} label="Show more nights" onClick={() => void showMore()} />
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 7: Write the page and the edit route**

Create `src/pages/rules/RulePage.tsx`:

```tsx
import { useState } from 'react';
import { Outlet, useParams, useSearchParams } from 'react-router-dom';
import { openRun } from '../../features/rules/ruleParams';
import type { Rule } from '../../features/rules/ruleTypes';
import { NightsSection } from '../../components/rules/NightsSection';
import { RuleHeader } from '../../components/rules/RuleHeader';
import { RuleFailed, RuleLoading, RuleMissing } from '../../components/rules/RuleStates';
import { useRule } from '../../components/rules/useRule';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

/** What the rule page hands its `edit` child route: the rule it has read,
 *  and how to swap in the saved copy. */
export interface RuleOutlet {
  rule: Rule;
  onReplace: (rule: Rule) => void;
}

/** /scenarios/rules/:id (spec §2.3). */
export function RulePage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <RuleMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedRule key={id} id={Number(id)} />;
}

function LoadedRule({ id }: { id: number }) {
  const [load, replace, retry] = useRule(id);
  if (load.status === 'ready') return <RuleView rule={load.rule} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      {load.status === 'loading' ? <RuleLoading /> : null}
      {load.status === 'missing' ? <RuleMissing /> : null}
      {load.status === 'failed' ? <RuleFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

function RuleView({ rule, onReplace }: { rule: Rule; onReplace: (rule: Rule) => void }) {
  const [search] = useSearchParams();
  // Only the first load opens the linked night; later URL changes do not.
  const [firstRun] = useState(() => openRun(search));
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <RuleHeader rule={rule} onReplace={onReplace} />
        <NightsSection rule={rule} openRun={firstRun} />
      </div>
      {/* /scenarios/rules/:id/edit: the builder modal over this page. */}
      <Outlet context={{ rule, onReplace } satisfies RuleOutlet} />
    </OrganizationsFrame>
  );
}
```

In `src/pages/rules/RuleBuilder.tsx`, add to the imports:

```tsx
import type { RuleOutlet } from './RulePage';
```

and append:

```tsx
/** /scenarios/rules/:id/edit: the builder over the rule's own page, which
 *  has read the rule. Anyone but the owner reads a notice. */
export function EditRuleRoute() {
  const navigate = useNavigate();
  const { rule, onReplace } = useOutletContext<RuleOutlet>();
  const close = () => navigate(`/scenarios/rules/${rule.id}`);
  if (!rule.is_owner) {
    return (
      <BuilderDialog title={`Edit ${rule.name}`} onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${rule.owner.name} can edit this rule`}
            detail="Ask them to change it, or build your own rule on one of your segments."
            action={
              <Link to={`/scenarios/rules/${rule.id}`} className={`${QUIET} border border-line`}>
                Open rule
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  return (
    <RuleForm
      initial={rule}
      segmentId={rule.segment?.id ?? null}
      onClose={close}
      onDone={(saved) => {
        onReplace(saved);
        close();
      }}
    />
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/pages/rules/RulePage.test.tsx src/pages/rules/RuleBuilder.test.tsx`
Expected: PASS (12 new tests, and the builder's still passing).

- [ ] **Step 9: Commit**

```bash
git add src/components/rules/useRule.ts src/components/rules/RuleStates.tsx src/components/rules/RuleHeader.tsx src/components/rules/NightsSection.tsx src/pages/rules/RulePage.tsx src/pages/rules/RuleBuilder.tsx src/pages/rules/testPages.tsx src/pages/rules/RulePage.test.tsx
git commit -m "feat(rules): a rule's page: its sentence, switch, nights and their records; Edit

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: The Review Queue's From your rules

Spec §2.4 ("A **From your rules** section above the AI proposals: each waiting review shows the rule, the trigger sentence, "6 people at 4 organisations" (the server's count), the survey preview (`SurveyPreview`), and Approve / Skip. Approve opens the new survey; a refusal shows on the item."); backend Decisions 13, 15, 25 and the contract's approve/skip; the controller's Review Queue ruling; plan Decisions 16, 17.

**Files:**
- Create: `src/components/rules/RuleReviews.tsx`
- Modify: `src/pages/brain/Review.tsx`, `src/pages/brain/Review.test.tsx`, `src/pages/rules/testPages.tsx` (routes)
- Test: `src/components/rules/RuleReviews.test.tsx`

**Interfaces:**
- Consumes: `fetchReviews`, `approveReview`, `skipReview` (Task 3); `triggerParts`, `refusalText` (Task 1); Surveys' `reach`, `dayLabel`, `SurveyPreview`, `SendPage`; Segments' `RuleSentence`, `dayText`; `ApiError`; `ErrorBlock`, `ItemSkeleton`; `PRIMARY`, `QUIET`, `FOCUS`, `MONO`; `errorMessage`; `ReviewQueuePage`.
- Produces: `RuleReviews()`: a section headed "From your rules" (`[data-part="rule-reviews"]`), `[data-part="review-status"]`, `<ul aria-label="Surveys from your rules">` of `<li data-review>` items with `[data-part="reach"]`, the Preview, `[data-part="refusal"]`, Approve and Skip; `[data-part="none"]` when nothing waits. `ReviewQueuePage` renders it above the AI proposals for everyone, and the proposals only for `view_all_accounts`.

- [ ] **Step 1: Route the Review Queue and a send in the test helpers**

In `src/pages/rules/testPages.tsx`, add the imports:

```tsx
import { ReviewQueuePage } from '../brain/Review';
import { SendPage } from '../surveys/SendPage';
```

and add, before the catch-all `<Route path="*" …>`:

```tsx
            <Route
              path="/brain/review"
              element={
                <>
                  <ReviewQueuePage />
                  <Where />
                </>
              }
            />
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

- [ ] **Step 2: Write the failing tests**

Create `src/components/rules/RuleReviews.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { stubRules } from '../../features/rules/testRules';
import { renderRules } from '../../pages/rules/testPages';
import { resetViewport } from '../../test/viewport';

const where = () => screen.getByTestId('where').textContent;
const items = () => screen.findByRole('list', { name: 'Surveys from your rules' });
const item = (id: number) => document.querySelector(`[data-review="${id}"]`) as HTMLElement;

describe("the Review Queue's From your rules (spec §2.4)", () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows each waiting review: the rule, its trigger, the count, the survey, Approve and Skip, above the AI proposals', async () => {
    stubRules();
    renderRules('/brain/review');
    const list = await items();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const first = item(2);
    expect(within(first).getByRole('link', { name: 'Renewal watch' })).toHaveAttribute('href', '/scenarios/rules/5');
    expect(first).toHaveTextContent('When CSAT falls below 60 in Renewal risk');
    expect(first.querySelector('[data-part="reach"]')).toHaveTextContent('6 people at 4 organisations');
    expect([...first.querySelectorAll('[data-part="reach"] .font-mono-brand')].map((node) => node.textContent)).toEqual(['6', '4']);
    expect(first).toHaveTextContent('From the night of 4 Oct 2026 · waits until 11 Oct 2026');
    expect(within(first).getByRole('region', { name: 'Preview' })).toHaveTextContent('How likely are you to recommend Acme Inc to a friend or colleague?');
    expect(within(first).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    const section = document.querySelector('[data-part="rule-reviews"]') as HTMLElement;
    const proposals = await screen.findByText(/Nothing waiting for a decision/);
    expect(section.compareDocumentPosition(proposals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a refused review with the reason Surveys gave', async () => {
    stubRules();
    renderRules('/brain/review');
    await items();
    expect(item(3).querySelector('[data-part="reach"]')).toHaveTextContent('612 people at 204 organisations');
    expect(item(3).querySelector('[data-part="refusal"]')).toHaveTextContent(
      'Surveys refused it: This survey would reach 612 people; the most is 500. Fix it, then approve again, or skip it.',
    );
  });

  it('approves into the new survey, which opens', async () => {
    const { spy } = stubRules();
    renderRules('/brain/review');
    await items();
    await userEvent.click(within(item(2)).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(where()).toBe('/surveys/31'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Renewal watch · 4 Oct 2026' })).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/reviews\/2\/approve\/$/)).toHaveLength(1);
  });

  it('keeps a review Surveys refuses, with the reason, and stays on the queue', async () => {
    stubRules({ refuse: { detail: "Email isn't set up for this workspace yet, so surveys can't be sent." } });
    renderRules('/brain/review');
    await items();
    await userEvent.click(within(item(2)).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(item(2).querySelector('[data-part="refusal"]')).toHaveTextContent("Surveys refused it: Email isn't set up for this workspace yet, so surveys can't be sent."),
    );
    expect(where()).toBe('/brain/review');
    expect(within(item(2)).getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('skips a review: it leaves the list, and says so', async () => {
    stubRules();
    renderRules('/brain/review');
    await items();
    await userEvent.click(within(item(2)).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(item(2)).toBeNull());
    expect(document.querySelector('[data-part="review-status"]')).toHaveTextContent('Skipped the survey from Renewal watch for 4 Oct 2026.');
  });

  it('removes a review decided elsewhere (409), and says so', async () => {
    stubRules({ approve: () => ({ status: 409, body: { detail: 'This review has already been decided.' } }) });
    renderRules('/brain/review');
    await items();
    await userEvent.click(within(item(2)).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(item(2)).toBeNull());
    expect(document.querySelector('[data-part="review-status"]')).toHaveTextContent('That review was already decided.');
  });

  it('says when nothing from my rules is waiting', async () => {
    stubRules({ reviews: [] });
    renderRules('/brain/review');
    expect(await screen.findByText(/Nothing from your rules is waiting\./)).toBeInTheDocument();
  });

  it('shows a skeleton while loading, then the error with Try again', async () => {
    let calls = 0;
    const { spy } = stubRules({
      reviewList: () => {
        calls += 1;
        return calls === 1 ? { status: 500, body: { detail: 'Reviews are down.' } } : { status: 200, body: [] };
      },
    });
    renderRules('/brain/review');
    expect(screen.getByRole('status', { name: 'Loading surveys from your rules' })).toBeInTheDocument();
    expect(await screen.findByText('Reviews are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Nothing from your rules is waiting\./)).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/rules\/reviews\/$/)).toHaveLength(2);
  });

  it('gives someone without view_all_accounts their own reviews and nothing else of the queue', async () => {
    const { spy } = stubRules();
    renderRules('/brain/review', { role: 'csm' });
    await items();
    expect(screen.queryByRole('button', { name: 'Ask the agent' })).toBeNull();
    expect(screen.queryByText(/Nothing waiting for a decision/)).toBeNull();
    expect(screen.queryByText(/view-all-accounts capability/)).toBeNull();
    expect(screen.getByText('Surveys your rules made wait here for you. Nothing is sent until you approve it.')).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/metrics\//)).toHaveLength(0);
  });
});
```

In `src/pages/brain/Review.test.tsx`:

1. In `mockApi`, add as the spy's first line after `const ok = …`:

```ts
    if (url.includes('/rules/reviews/')) return ok([]);
```

2. Replace the test `'explains the gate to someone without view-all-accounts'` with:

```tsx
  it('shows someone without view-all-accounts only their rule reviews, never the AI proposals', async () => {
    const spy = mockApi();
    renderPage('csm');

    expect(await screen.findByRole('heading', { name: 'From your rules' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask the agent' })).toBeNull();
    expect(screen.queryByText(/need the view-all-accounts capability/)).toBeNull();
    expect(spy.mock.calls.filter(([url]) => url.includes('/metrics/'))).toEqual([]);
    expect(spy.mock.calls.some(([url]) => url.includes('/rules/reviews/'))).toBe(true);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/rules/RuleReviews.test.tsx src/pages/brain/Review.test.tsx`
Expected: FAIL: the From your rules tests with "Unable to find role="list" and name "Surveys from your rules"", and the rewritten Review test with "Unable to find role="heading" and name "From your rules"" (the page does not render the section yet).

- [ ] **Step 4: Write the section**

Create `src/components/rules/RuleReviews.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/apiClient';
import { approveReview, fetchReviews, skipReview } from '../../features/rules/ruleApi';
import { refusalText, triggerParts } from '../../features/rules/ruleText';
import type { RuleReview } from '../../features/rules/ruleTypes';
import { dayText } from '../../features/segments/ruleSentence';
import { dayLabel, reach } from '../../features/surveys/surveyText';
import { ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { RuleSentence } from '../segments/RuleSentence';
import { SurveyPreview } from '../surveys/SurveyPreview';

const DECIDED = 'That review was already decided.';

/** One night's survey from one of my rules (spec §2.4): the rule and its
 *  trigger, whom it reaches (the server's count), the survey as the
 *  customer sees it, Surveys' refusal if an approval was refused, then
 *  Approve (opens the new survey) or Skip. */
function ReviewItem({ review, onDecided, onRefused }: {
  review: RuleReview;
  onDecided: (id: number, message: string) => void;
  onRefused: (review: RuleReview) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'approve' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const people = reach({ audience: review.counts.people, organisations: review.counts.records }, review.rule.segment?.kind ?? null);
  const refusal = refusalText(review.result.error);
  const decidedElsewhere = (err: unknown) => err instanceof ApiError && (err.status === 409 || err.status === 404);

  async function approve() {
    setBusy('approve');
    setError(null);
    try {
      const answer = await approveReview(review.id);
      navigate(`/surveys/${answer.survey_send_id}`);
    } catch (err) {
      setBusy(null);
      if (decidedElsewhere(err)) onDecided(review.id, DECIDED);
      else if (err instanceof ApiError && err.status === 400 && err.body !== null && typeof err.body === 'object') {
        // Surveys' refusal: stored on the review by the server, shown here.
        onRefused({ ...review, result: { error: err.body as Record<string, unknown> } });
      } else setError(errorMessage(err, 'Could not approve it. Try again.'));
    }
  }

  async function skip() {
    setBusy('skip');
    setError(null);
    try {
      await skipReview(review.id);
      onDecided(review.id, `Skipped the survey from ${review.rule.name} for ${dayText(review.run_on)}.`);
    } catch (err) {
      setBusy(null);
      if (decidedElsewhere(err)) onDecided(review.id, DECIDED);
      else setError(errorMessage(err, 'Could not skip it. Try again.'));
    }
  }

  return (
    <li data-review={review.id} className="flex flex-col gap-3 rounded-xl bg-surface p-3">
      <div className="flex flex-col gap-0.5">
        <Link to={`/scenarios/rules/${review.rule.id}`} className={`inline-flex min-h-11 items-center self-start text-[15px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
          {review.rule.name}
        </Link>
        <RuleSentence parts={triggerParts(review.rule, review.rule.segment)} />
        <p data-part="reach" className="text-[13px] text-ink">
          <span className={MONO}>{people.people}</span> {people.peopleNoun} at <span className={MONO}>{people.records}</span> {people.recordNoun}
        </p>
        <p className="text-[11px] text-ink-muted">
          From the night of {dayText(review.run_on)} · waits until {dayLabel(review.expires_at)}
        </p>
      </div>
      <SurveyPreview type={review.action.survey_type} subject={review.action.subject} intro={review.action.intro} workspace={review.organisation_name} />
      {refusal ? (
        <p data-part="refusal" role="alert" className="text-[13px] text-danger">
          Surveys refused it: {refusal} Fix it, then approve again, or skip it.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void approve()} disabled={busy !== null} className={PRIMARY}>
          {busy === 'approve' ? 'Sending…' : 'Approve'}
        </button>
        <button type="button" onClick={() => void skip()} disabled={busy !== null} className={`${QUIET} border border-line`}>
          {busy === 'skip' ? 'Skipping…' : 'Skip'}
        </button>
      </div>
    </li>
  );
}

type Load = { key: number; items: RuleReview[] | null; error: string | null };

/** The Review Queue's From your rules (spec §2.4): the caller's own waiting
 *  reviews (the endpoint is owner-only), for every signed-in user. */
export function RuleReviews() {
  const headingId = useId();
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    let alive = true;
    fetchReviews('waiting').then(
      (items) => {
        if (alive) setLoad({ key: attempt, items, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key: attempt, items: null, error: errorMessage(err, 'Could not load the surveys from your rules.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const current = load?.key === attempt ? load : null;
  const drop = (id: number, message: string) => {
    setLoad((last) => (last?.items ? { ...last, items: last.items.filter((one) => one.id !== id) } : last));
    setStatus(message);
  };
  const refused = (review: RuleReview) => setLoad((last) => (last?.items ? { ...last, items: last.items.map((one) => (one.id === review.id ? review : one)) } : last));

  return (
    <section aria-labelledby={headingId} data-part="rule-reviews" className="flex flex-col gap-2">
      <h2 id={headingId} className="text-[15px] font-semibold text-ink">
        From your rules
      </h2>
      <p role="status" data-part="review-status" className="text-[13px] text-ink-muted empty:hidden">
        {status}
      </p>
      {!current ? <ItemSkeleton count={2} label="Loading surveys from your rules" avatar={false} /> : null}
      {current?.error ? <ErrorBlock message={current.error} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {current?.items && current.items.length === 0 ? (
        <p data-part="none" className="rounded-xl bg-surface px-4 py-3 text-[13px] text-ink-muted">
          Nothing from your rules is waiting. When a rule's survey is ready, it waits here until you approve or skip it.
        </p>
      ) : null}
      {current?.items && current.items.length > 0 ? (
        <ul aria-label="Surveys from your rules" className="flex flex-col gap-2">
          {current.items.map((review) => (
            <ReviewItem key={review.id} review={review} onDecided={drop} onRefused={refused} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Put it in the Review Queue, for everyone**

In `src/pages/brain/Review.tsx`:

1. The capability warning goes (step 3), so its icon does: change the lucide import to

```tsx
import { CheckSquare, Sparkles } from 'lucide-react';
```

and add the import after the `formatDate` import:

```tsx
import { RuleReviews } from '../../components/rules/RuleReviews';
```

2. Replace the subtitle paragraph

```tsx
          <p className="text-[13px] text-ink-faint font-medium mt-0.5">
            What the Ops agent proposes from the figures, and what your sessions decided. Nothing runs until you approve it.
          </p>
```

with

```tsx
          <p className="text-[13px] text-ink-faint font-medium mt-0.5">
            {canSeeAll
              ? 'What your rules and the Ops agent propose, and what your sessions decided. Nothing runs until you approve it.'
              : 'Surveys your rules made wait here for you. Nothing is sent until you approve it.'}
          </p>
```

3. Replace the whole `{!canSeeAll && ( <div …> … capability. </div> )}` block with:

```tsx
      {/* Rules spec §2.4: everyone's own rule reviews, above the AI proposals
          (which, like the rest of the Brain, need view_all_accounts). */}
      <RuleReviews />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/rules/RuleReviews.test.tsx src/pages/brain/Review.test.tsx`
Expected: PASS (9 new tests; the Review Queue's own five, one rewritten).

- [ ] **Step 7: Commit**

```bash
git add src/components/rules/RuleReviews.tsx src/components/rules/RuleReviews.test.tsx src/pages/brain/Review.tsx src/pages/brain/Review.test.tsx src/pages/rules/testPages.tsx
git commit -m "feat(rules): From your rules in the Review Queue: approve into a survey, or skip

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Open `/brain/review` to everyone, and only it

The controller's ruling on backend gap 1: "Open ONLY `/brain/review` to every signed-in user … the AI proposals section and the rest of /brain stay capability-gated exactly as now." The gate lives in `App.tsx` (`<Route path="brain" element={<RequireCapability capability="view_all_accounts">…}>`) and in `Sidebar.tsx` (the Knowledge Brain group, shown only to `view_all_accounts`). Plan Decision 16.

**Files:**
- Create: `src/pages/brain/BrainRoutes.tsx`
- Modify: `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Sidebar.test.tsx`
- Test: `src/pages/brain/BrainRoutes.test.tsx`

**Interfaces:**
- Consumes: `RequireCapability`; the Brain pages (`BrainDashboard`, `InitiativesPage`, `ReviewQueuePage`, `FeedbackLogPage`, `AgentsPage`, `SkillsPage`, `GraphPage`, `FeatureRequestsPage`, `AnomaliesPage`); `capabilitiesForRole`.
- Produces: `BrainRoutes()`: descendant routes for `/brain/*`: `review` open; `index` → `dashboard`, every other path and `*` behind `view_all_accounts` (a refusal goes to `/dashboard`, as `RequireCapability` does today). The Sidebar's **Review Queue** link for everyone.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/brain/BrainRoutes.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';
import { Where } from '../organizations/testList';
import { BrainRoutes } from './BrainRoutes';

// The pages themselves have their own tests; this one is about the gate.
vi.mock('./Dashboard', () => ({ BrainDashboard: () => <h1>Brain dashboard</h1> }));
vi.mock('./Initiatives', () => ({ InitiativesPage: () => <h1>Initiatives</h1> }));
vi.mock('./Review', () => ({ ReviewQueuePage: () => <h1>Review queue</h1> }));
vi.mock('./Feedback', () => ({ FeedbackLogPage: () => <h1>Feedback log</h1> }));
vi.mock('./Agents', () => ({ AgentsPage: () => <h1>Agents</h1> }));
vi.mock('./Skills', () => ({ SkillsPage: () => <h1>Skills</h1> }));
vi.mock('./Graph', () => ({ GraphPage: () => <h1>Knowledge graph</h1> }));
vi.mock('./FeatureRequests', () => ({ FeatureRequestsPage: () => <h1>Feature requests</h1> }));
vi.mock('./Anomalies', () => ({ AnomaliesPage: () => <h1>Anomalies</h1> }));

function renderAt(url: string, role: 'admin' | 'csm') {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1, role_name: role === 'admin' ? 'Admin' : 'CSM',
          permissions: capabilitiesForRole(role), function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)', default_lifecycle_stage: '',
            ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/brain/*" element={<BrainRoutes />} />
          <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </Provider>,
  );
}
const where = () => screen.getByTestId('where').textContent;

describe('/brain (rules spec §2.4, controller ruling on backend gap 1)', () => {
  it('opens the Review Queue to someone without view_all_accounts', () => {
    renderAt('/brain/review', 'csm');
    expect(screen.getByRole('heading', { name: 'Review queue' })).toBeInTheDocument();
    expect(where()).toBe('/brain/review');
  });

  it.each(['/brain', '/brain/dashboard', '/brain/graph', '/brain/initiatives', '/brain/requests', '/brain/anomalies', '/brain/feedback', '/brain/agents', '/brain/skills', '/brain/nowhere'])(
    'keeps %s behind view_all_accounts',
    (url) => {
      renderAt(url, 'csm');
      expect(where()).toBe('/dashboard');
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    },
  );

  it.each([
    ['/brain', 'Brain dashboard', '/brain/dashboard'],
    ['/brain/graph', 'Knowledge graph', '/brain/graph'],
    ['/brain/requests', 'Feature requests', '/brain/requests'],
    ['/brain/review', 'Review queue', '/brain/review'],
    ['/brain/nowhere', 'Brain dashboard', '/brain/dashboard'],
  ])('routes %s for view_all_accounts as before', (url, heading, path) => {
    renderAt(url, 'admin');
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(where()).toBe(path);
  });
});
```

In `src/components/layout/Sidebar.test.tsx`, replace the test `'hides the Knowledge Brain group from a role that cannot load it'` with:

```tsx
  it('hides the Knowledge Brain group from a role that cannot load it, but not the Review Queue', async () => {
    renderSidebar('csm');
    expect(await screen.findByRole('link', { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Brain Overview/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Knowledge Graph/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Queue' })).toHaveAttribute('href', '/brain/review');
    expect(screen.queryByRole('link', { name: /Users/ })).not.toBeInTheDocument();
  });
```

and add to `'shows it to a role that can'`:

```tsx
    expect(screen.getAllByRole('link', { name: 'Review Queue' })).toHaveLength(1);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/BrainRoutes.test.tsx src/components/layout/Sidebar.test.tsx`
Expected: FAIL, "Failed to resolve import "./BrainRoutes"", and the Sidebar's CSM test (no Review Queue link).

- [ ] **Step 3: Write the routes**

Create `src/pages/brain/BrainRoutes.tsx`:

```tsx
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { RequireCapability } from '../../components/auth/RequireCapability';
import { AgentsPage } from './Agents';
import { AnomaliesPage } from './Anomalies';
import { BrainDashboard } from './Dashboard';
import { FeatureRequestsPage } from './FeatureRequests';
import { FeedbackLogPage } from './Feedback';
import { GraphPage } from './Graph';
import { InitiativesPage } from './Initiatives';
import { ReviewQueuePage } from './Review';
import { SkillsPage } from './Skills';

/** /brain/*: the Company Brain. Organisation-wide figures need
 *  view_all_accounts, as before. The Review Queue alone is open to every
 *  signed-in user (rules spec §2.4): their own rule reviews wait there, and
 *  the page shows the AI proposals only to view_all_accounts. */
export function BrainRoutes() {
  return (
    <Routes>
      <Route path="review" element={<ReviewQueuePage />} />
      <Route
        element={
          <RequireCapability capability="view_all_accounts">
            <Outlet />
          </RequireCapability>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<BrainDashboard />} />
        <Route path="initiatives" element={<InitiativesPage />} />
        <Route path="feedback" element={<FeedbackLogPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="requests" element={<FeatureRequestsPage />} />
        <Route path="anomalies" element={<AnomaliesPage />} />
        <Route path="*" element={<Navigate to="/brain/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
```

In `src/App.tsx`:

1. Replace the nine Brain page imports (from `// Company Brain pages` through `import { AnomaliesPage } from './pages/brain/Anomalies';`) with:

```tsx
// Company Brain pages (rules spec §2.4: /brain/review is open to everyone)
import { BrainRoutes } from './pages/brain/BrainRoutes';
```

2. Replace the whole `<Route path="brain" element={<RequireCapability capability="view_all_accounts"><Outlet /></RequireCapability>}> … </Route>` block with:

```tsx
          {/* Company Brain: one real page now (the metric layer). The mock
              knowledge-graph pages that lived under here were removed. Every
              page needs view_all_accounts except the Review Queue, where each
              person's own rule reviews wait (rules spec §2.4). */}
          <Route path="brain/*" element={<BrainRoutes />} />
```

3. `Outlet` was used only by that block: change the router import to

```tsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
```

- [ ] **Step 4: Show the Review Queue to everyone in the Sidebar**

In `src/components/layout/Sidebar.tsx`, replace the group's opening and closing

```tsx
        {canSeeAll && (
          <>
```

… through its closing

```tsx
          </>
        )}
```

so that the block reads:

```tsx
        {canSeeAll ? (
          <>
          {/* KNOWLEDGE BRAIN Section */}
          <div className="h-px bg-line my-2 w-8" role="separator"></div>

          <NavItem to="/brain/dashboard" icon={<Brain className="w-5 h-5" />} label="Brain Overview" />
          <NavItem to="/brain/graph" icon={<Network className="w-5 h-5" />} label="Knowledge Graph" />
          <NavItem to="/brain/initiatives" icon={<Flag className="w-5 h-5" />} label="Initiatives" />
          <NavItem to="/brain/requests" icon={<Lightbulb className="w-5 h-5" />} label="Feature Requests" />
          <NavItem to="/brain/anomalies" icon={<Radar className="w-5 h-5" />} label="Anomalies" />
          <NavItem to="/brain/review" icon={<CheckSquare className="w-5 h-5" />} label="Review Queue" badge={pendingProposals} />
          <NavItem to="/brain/feedback" icon={<MessageSquareWarning className="w-5 h-5" />} label="Feedback Log" />
          <NavItem to="/brain/agents" icon={<Bot className="w-5 h-5" />} label="Agents" />
          <NavItem to="/brain/skills" icon={<Wand2 className="w-5 h-5" />} label="Skills" />

          </>
        ) : (
          <>
            {/* Everyone's own rule reviews wait in the Review Queue (rules
                spec §2.4); the rest of the Brain needs view_all_accounts. */}
            <div className="h-px bg-line my-2 w-8" role="separator"></div>
            <NavItem to="/brain/review" icon={<CheckSquare className="w-5 h-5" />} label="Review Queue" />
          </>
        )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/brain src/components/layout/Sidebar.test.tsx`
Expected: PASS (the gate's 16 cases, every Brain page's own tests, the Sidebar's).

- [ ] **Step 6: Commit**

```bash
git add src/pages/brain/BrainRoutes.tsx src/pages/brain/BrainRoutes.test.tsx src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx
git commit -m "feat(rules): open the Review Queue to everyone; the rest of the Brain stays gated

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 14: Wire the routes, the frame, the bar, and the two notification kinds

Spec §2.1–§2.5 (the routes), §1.3/§1.4 (`rule_fired`, `rule_review`); backend Decisions 11, 20, 21; plan Decisions 2, 15, 18, 19.

**Files:**
- Modify: `src/App.tsx`, `src/layouts/DashboardLayout.tsx`, `src/layouts/DashboardLayout.test.tsx`, `src/components/layout/Navbar.tsx`, `src/components/layout/Navbar.test.tsx`, `src/features/notifications/types.ts`

**Interfaces:**
- Consumes: `ScenariosHome` (Task 6), `NewRuleRoute`, `EditRuleRoute`, `RuleSegmentRoute` (Tasks 10–11), `RulePage` (Task 11).
- Produces: the app's routes `/scenarios` (tabs, with `rules/new` as its child), `/scenarios/rules/:id` (with `edit`), `/segments/:id/rule`; the canvas builder still at `/scenarios/create` and `/scenarios/:id`; `NotificationKind` gains `rule_fired` and `rule_review`.

- [ ] **Step 1: Write the failing tests**

In `src/layouts/DashboardLayout.test.tsx`, add to the `it.each([...])('adds no padding around %s')` list, after `'/segments/7/edit',`:

```ts
    // Survey these and Automate open their modals over the segment.
    '/segments/7/survey',
    '/segments/7/rule',
    // Scenarios and the rule pages wear the same frame (rules spec 2026-10-04 §2).
    '/scenarios',
    '/scenarios/rules/new',
    '/scenarios/rules/5',
    '/scenarios/rules/5/edit',
```

and add at the end of the `describe`:

```tsx
  it.each(['/scenarios', '/scenarios/rules/new', '/scenarios/rules/5', '/scenarios/rules/5/edit'])('keeps the Navbar on %s', (url) => {
    renderAt(url);
    expect(screen.getByText('Navbar stub')).toBeInTheDocument();
  });

  it.each(['/scenarios/create', '/scenarios/12'])('gives the canvas builder at %s the full canvas: no Navbar, no padding', (url) => {
    const main = renderAt(url);
    expect(screen.queryByText('Navbar stub')).toBeNull();
    expect(main).toHaveClass('p-0');
  });
```

In `src/components/layout/Navbar.test.tsx`:

1. In `renderNavbar`'s `<Routes>`, after the `/segments/:id` route, add:

```tsx
          <Route path="/scenarios/rules/:id" element={<SegmentMarker />} />
          <Route path="/brain/review" element={<SegmentMarker />} />
```

2. After the `describe('Navbar on Surveys …')` block, add:

```tsx
describe('Navbar on Scenarios (rules spec 2026-10-04 §2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('wears the framed bar on /scenarios: "Scenarios", the actions slot, no avatar', () => {
    const setSlot = vi.fn();
    renderNavbar('/scenarios', null, null, [], setSlot);
    expect(document.querySelector('header')).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    expect(screen.getByRole('heading', { name: 'Scenarios' })).toBeInTheDocument();
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });

  it.each(['/scenarios/rules/new', '/scenarios/rules/5', '/scenarios/rules/5/edit'])('leads back to Scenarios from %s, in the same frame', (url) => {
    renderNavbar(url);
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Scenarios' });
    expect(back).toHaveAttribute('href', '/scenarios');
    expect(document.querySelector('header')).toHaveClass('h-16', 'px-4');
  });

  it("leads back to Segments from a segment's Automate", () => {
    renderNavbar('/segments/7/rule');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Segments' })).toHaveAttribute('href', '/segments');
  });
});
```

3. After the `segmentAlert` fixture, add:

```ts
// Rules backend Decisions 11 and 21: a night's digest, linked to the night
// for someone who may read the rule, and the owner's review notice.
const ruleDigest: Notification = {
  id: 4,
  kind: 'rule_fired',
  message: 'Renewal watch: Globex, Initech and Pizza Hut fell below 60',
  link: '/scenarios/rules/5?run=9',
  actor: null,
  is_read: false,
  created_at: '2026-10-04T02:00:06Z',
};
const ruleReview: Notification = {
  id: 5,
  kind: 'rule_review',
  message: 'A survey from your rules is waiting for your review.',
  link: '/brain/review',
  actor: null,
  is_read: false,
  created_at: '2026-10-04T02:00:07Z',
};
```

4. At the end of `describe('Navbar notification bell', …)`, add:

```tsx
  it("opens a rule's night from its digest, and the Review Queue from a rule review", async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [ruleDigest, ruleReview]);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Renewal watch: Globex, Initech and Pizza Hut fell below 60'));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(4);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/scenarios/rules/5?run=9');

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('A survey from your rules is waiting for your review.'));
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/brain/review');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.test.tsx`
Expected: FAIL: the new padding and Navbar cases (`/scenarios/rules/5` hides the Navbar today), the Scenarios bar tests (no "Scenarios" heading), and a type error on `kind: 'rule_fired'`.

- [ ] **Step 3: The notification kinds**

In `src/features/notifications/types.ts`, replace

```ts
  | 'segment_changes';
```

with

```ts
  | 'segment_changes'
  // A rule's nightly digest, or its "switched itself off" notice, linking to
  // /scenarios/rules/<id>?run=<run_id> for someone who may read the rule
  // (rules backend Decisions 11, 20).
  | 'rule_fired'
  // The owner's once-a-night "N surveys from your rules are waiting",
  // linking to /brain/review (rules backend Decision 21).
  | 'rule_review';
```

- [ ] **Step 4: The frame**

In `src/layouts/DashboardLayout.tsx`, replace

```ts
  // Only the builder (/scenarios/create, /scenarios/:id) wants the
  // full-canvas, no-Navbar treatment — /scenarios itself is a plain
  // list page like any other, with the shared Navbar above it.
  const isScenarios = location.pathname.startsWith('/scenarios/');
```

with

```ts
  // Only the canvas builder (/scenarios/create, /scenarios/:id) wants the
  // full-canvas, no-Navbar treatment. /scenarios and the rule pages
  // (/scenarios/rules/…) are framed pages under the shared Navbar (rules
  // spec 2026-10-04 §2).
  const isScenarios = /^\/scenarios\/(?!rules(?:\/|$))[^/]+\/?$/.test(location.pathname);
  // /scenarios and the rule pages wear the Organizations frame, which gutters them.
  const isRules = /^\/scenarios(\/rules\/[^/]+(\/edit)?)?\/?$/.test(location.pathname);
```

replace

```ts
  const isSegments = /^\/segments(\/[^/]+(\/edit)?)?\/?$/.test(location.pathname);
```

with

```ts
  // Survey these and Automate open their modals over the segment (/survey, /rule).
  const isSegments = /^\/segments(\/[^/]+(\/edit|\/survey|\/rule)?)?\/?$/.test(location.pathname);
```

and in `<main>`'s class list replace `|| isSegments)` with `|| isSegments || isRules)`.

- [ ] **Step 5: The bar**

In `src/components/layout/Navbar.tsx`:

1. Replace

```ts
  const isSegmentPage = /^\/segments\/[^/]+(\/edit|\/survey)?\/?$/.test(location.pathname);
```

with

```ts
  // Automate opens the rule builder over the segment (/segments/:id/rule).
  const isSegmentPage = /^\/segments\/[^/]+(\/edit|\/survey|\/rule)?\/?$/.test(location.pathname);
```

2. After the `isSurveyPage` line, add:

```ts
  // Scenarios wear the same frame (rules spec 2026-10-04 §2.1): "Scenarios"
  // on the tabs page; on a rule, its edit modal and a new one, the bar leads
  // back. The canvas builder keeps no Navbar (DashboardLayout).
  const isScenarios = /^\/scenarios\/?$/.test(location.pathname);
  const isRulePage = /^\/scenarios\/rules\/(new|\d+)(\/edit)?\/?$/.test(location.pathname);
```

3. Add `|| isScenarios || isRulePage` to the end of `isFramed`'s expression.

4. Replace the line

```tsx
        {isSurveyPage ? (
```

with

```tsx
        {isRulePage ? (
          <nav aria-label="Breadcrumb" className="flex items-center h-full">
            <Link
              to="/scenarios"
              className="-ml-2 inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Scenarios
            </Link>
          </nav>
        ) : isScenarios ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Scenarios</h1>
          </div>
        ) : isSurveyPage ? (
```

- [ ] **Step 6: The routes**

In `src/App.tsx`:

1. Replace

```tsx
import { ScenariosList } from './pages/scenarios/ScenariosList';
```

with

```tsx
import { ScenariosHome } from './pages/scenarios/ScenariosHome';
import { EditRuleRoute, NewRuleRoute, RuleSegmentRoute } from './pages/rules/RuleBuilder';
import { RulePage } from './pages/rules/RulePage';
```

2. Replace the `scenarios` block

```tsx
          <Route path="scenarios">
            <Route index element={<ScenariosList />} />
            <Route path="create" element={<CreateScenario />} />
            <Route path=":id" element={<CreateScenario />} />
          </Route>
```

with

```tsx
          {/* Scenarios v2 (rules spec 2026-10-04 §2): Rules and the Canvas as
              tabs, the rule builder modal over the list, a rule's page with
              its edit modal. The canvas builder's routes are unchanged. */}
          <Route path="scenarios">
            <Route element={<ScenariosHome />}>
              <Route index element={null} />
              <Route path="rules/new" element={<NewRuleRoute />} />
            </Route>
            <Route path="rules/:id" element={<RulePage />}>
              <Route path="edit" element={<EditRuleRoute />} />
            </Route>
            <Route path="create" element={<CreateScenario />} />
            <Route path=":id" element={<CreateScenario />} />
          </Route>
```

3. In the `segments` block, after `<Route path="survey" element={<SurveySegmentRoute />} />`, add:

```tsx
              {/* Automate (rules spec §2.5): the rule builder over the segment. */}
              <Route path="rule" element={<RuleSegmentRoute />} />
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx vitest run --maxWorkers=2 src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.test.tsx src/pages/scenarios`
Expected: PASS.

Run: `npx tsc -b` (the type check `npm run build` runs first)
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/features/notifications/types.ts
git commit -m "feat(rules): the routes, the framed bar, and the rule notification kinds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The house rules, the journey, and the product documents

Spec §4 ("house rules; one e2e (build a rule → the stub's nightly run → a review → approve → a survey is created)"), §5; Global Constraints "House rules" and "Product documents".

**Files:**
- Create: `src/components/rules/houseRules.test.ts`, `src/e2e/rules.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: `houseRuleSuite`, `rowsIconsTargetsSuite` (`src/test/houseRules.ts`); `stubRules` with `runNight`; `renderRules`; everything built in Tasks 1–14.
- Produces: nothing in code.

- [ ] **Step 1: Write the house-rules suite**

Create `src/components/rules/houseRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over the Rules components and pages (plan Decision 1):
// both new folders whole, the Scenarios tabs page and the Brain routes. The
// canvas files beside ScenariosHome keep their older habits (spec: "The
// canvas stays as it is, untouched"), so only ScenariosHome is named.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/rules/*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/scenarios/ScenariosHome.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/BrainRoutes.tsx', { query: '?raw', eager: true, import: 'default' })),
};

houseRuleSuite('rules house rules', files);
rowsIconsTargetsSuite('rules house rules beyond the shared suite', files);

describe('rules: what the suite covers, and markup from the server (spec §3)', () => {
  it('covers the new pages and the Review Queue section', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/rules/RuleBuilder.tsx',
        '../../pages/rules/RulePage.tsx',
        '../../pages/rules/RulesTab.tsx',
        '../../pages/scenarios/ScenariosHome.tsx',
        './RuleReviews.tsx',
        './NightsSection.tsx',
      ]),
    );
  });

  it('never renders markup from the server', () => {
    expect(Object.entries(files).filter(([, source]) => source.includes('dangerouslySetInnerHTML')).map(([file]) => file)).toEqual([]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/rules/houseRules.test.ts`
Expected: PASS. If a control is reported without a 44px target, give it `min-h-11 sm:min-h-9` (or `h-11 w-11`) in its own `className`, or a style constant defined in the same file; if a Lucide icon is reported, add `aria-hidden="true"`. Do not weaken the suite.

- [ ] **Step 2: Write the journey**

Create `src/e2e/rules.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { stubRules } from '../features/rules/testRules';
import { requestsOf } from '../features/surveys/testSurveys';
import { renderRules } from '../pages/rules/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the segment's page,
// the Rules pages, the Review Queue, the send page, the store and the
// router. Only fetch is stubbed, by a stateful stub in the backend's
// contract shapes; its `runNight` stands in for run_health_maintenance
// (spec §4: build a rule → the stub's nightly run → a review → approve → a
// survey is created).
const where = () => screen.getByTestId('where').textContent;

describe('Rules', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('builds a rule from a segment, tests it, turns it on; the night makes a review; approving creates the survey', { timeout: 30000 }, async () => {
    const { spy, runNight } = stubRules();

    // 1. Automate on the owner's segment: the builder opens over it, the segment chosen.
    const team = renderRules('/segments/7', { nav: true });
    await userEvent.click(await screen.findByRole('link', { name: 'Automate' }));
    const modal = await screen.findByRole('dialog', { name: 'New rule' });
    expect(where()).toBe('/segments/7/rule');
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Renewal risk'));

    // 2. Build: CSAT below 60 → notify me, and a survey that waits for review.
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Unhappy renewals');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'crossed');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Score' }), 'csat');
    await userEvent.type(within(modal).getByRole('spinbutton', { name: 'Value' }), '60');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send a survey' }));
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('When CSAT falls below 60 in Renewal risk → notify me, survey');

    // 3. Test: the server's dry run, worded as an estimate.
    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    expect(await within(modal).findByText(/would match if tonight's run happened now: Globex, Initech, Pizza Hut\./)).toBeInTheDocument();

    // 4. Save (off); the rule's page opens under "‹ Scenarios", with no nights yet.
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Unhappy renewals' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Scenarios' })).toHaveAttribute('href', '/scenarios');
    expect(await screen.findByText('No nights yet')).toBeInTheDocument();

    // 5. Turn it on, after the confirm.
    await userEvent.click(screen.getByRole('switch', { name: 'Run Unhappy renewals every night' }));
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Run Unhappy renewals every night' })).toHaveAttribute('aria-checked', 'true'));
    team.unmount();

    // 6. The night runs: two organisations fire, and the survey waits for review.
    expect(runNight(100)).toMatchObject({ fired: 2, review: { status: 'waiting' } });

    // 7. The Review Queue holds it, with the server's count and the survey.
    renderRules('/brain/review', { nav: true });
    await screen.findByRole('list', { name: 'Surveys from your rules' });
    const review = document.querySelector('[data-review="300"]') as HTMLElement;
    expect(within(review).getByRole('link', { name: 'Unhappy renewals' })).toHaveAttribute('href', '/scenarios/rules/100');
    expect(review).toHaveTextContent('When CSAT falls below 60 in Renewal risk');
    expect(review.querySelector('[data-part="reach"]')).toHaveTextContent('3 people at 2 organisations');

    // 8. Approve: the survey is created and its page opens.
    await userEvent.click(within(review).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(where()).toBe('/surveys/31'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Unhappy renewals · 5 Oct 2026' })).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/reviews\/300\/approve\/$/)).toHaveLength(1);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/e2e/rules.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 3: `docs/03-ui-ux-design.md`**

Insert directly after the Surveys section (before `### Overlays`):

```markdown
### Rules (Scenarios)

Spec `docs/superpowers/specs/2026-10-04-rules-design.md` §2 (plan
`docs/superpowers/plans/2026-10-04-rules-frontend.md`). The pages sit in
`OrganizationsFrame` under the framed bar ("Scenarios", or "‹ Scenarios" on a
rule, its edit modal and a new one). The canvas builder keeps its full-canvas,
no-Navbar page.

- **`/scenarios`, two tabs** (`DetailTabs`, `?tab=rules|canvas`).
  - **Rules:** **New rule**, then one rounded row per rule (`RuleListItem`):
    the name with Paused and Workspace/Shared badges; the rule as one
    sentence (Segments' `RuleSentence`: "When CSAT falls below 60 in Renewal
    risk → survey, notify me", figures in DM Mono, a deleted segment in
    italics); the last night ("4 Oct · fired 3 · waiting for review", or
    "Last ran 28 Sep" for a reader, or "Not run yet") and whose it is. The
    owner's switch (`RuleSwitch`, "Run {name} every night") sits on the
    right; turning on asks first in `ConfirmDialog`; a reader reads On or
    Off. The empty state explains rules and offers New rule.
  - **Canvas:** `ScenariosList` as it was.
- **The rule builder: the segment builder's modal** (`BuilderDialog`) over
  the Rules list (`/scenarios/rules/new`), over a rule (`/scenarios/rules/:id/edit`)
  or over a segment (`/segments/:id/rule`, Automate).
  - **Top:** the rule as one sentence, as it is being built.
  - **Left, split by dividers:** Name; **When** (`TriggerFields`: Trigger,
    worded by the segment's kind; Segment, the caller's own grouped by kind;
    for a score line Score, Direction and Value with its range; for a
    schedule Repeat and Day); **Then** (`ActionCards`: one to three bordered
    cards, each type once, with add buttons and Remove: Notify (Who,
    Teammates as chips, Message with a DM Mono count), Create a task (Task
    title, Assign to, Due in days), Change lifecycle (Stage, chosen first),
    Send a survey (Surveys' type tiles, subject, intro, roles, the
    500-person note, and **Send without review**, a switch that asks in
    place and then reads in the warning colour)); **Limits** (Once per
    record every N days, the nightly 200, and a hint when a weekly or
    monthly rule waits longer than its rhythm); **Sharing**; **Status**
    ("Run every night", asking in place).
  - **Right, pinned from `lg`:** **Test this rule** (`TestPanel`, on click:
    "3 organisations would match if tonight's run happened now: …" with the
    count at 22px, the skips, and for a score line the first-night note),
    then the survey's preview (`SurveyPreview`) when there is one.
  - **Footer:** Cancel and **Save rule**. Client checks speak the backend's
    sentences; refusals land at their fields, an action's at its own card,
    focus on the first; the 50-rule limit above the form, focused. Anyone
    but the owner reads "Only {owner} can edit this rule" (or "… can
    automate this segment").
- **A rule (`/scenarios/rules/:id`).** The name at 22px, the sentence, "Yours
  · Shared with the workspace · Once per record every 30 days"; the owner's
  switch, Edit and Delete (`ConfirmDialog`); a warning-tinted notice when it
  switched itself off, saying why and, for the owner, what to do. **Nights**:
  rows whose button reads "4 Oct · fired 3 · skipped 2 · 1 waiting for
  review" (a reader: "28 Sep · fired 1 · 2 you can't open"), with Review it
  while one waits; opening a night lists its records (name as a link, what
  each action did or why it was skipped) and "N more records you can't
  open"; Show more nights. `?run=` opens one night.
- **Review Queue (`/brain/review`): From your rules**, above the AI proposals,
  for everyone. Each item: the rule (a link), its trigger sentence, "6 people
  at 4 organisations" in DM Mono, the night and the expiry, the survey's
  preview, a refusal in the danger colour ("Surveys refused it: …"), then
  Approve (opens the new survey) and Skip. A status line says what was
  skipped or decided elsewhere.
- **Automate** sits on a segment's page beside Survey these, for its owner.
```

- [ ] **Step 4: `docs/04-app-flow.md`**

1. In the shell diagram, replace `hidden on /scenarios/* and on /copilot (the home page)` with `hidden on the canvas builder (/scenarios/create, /scenarios/:id) and on /copilot (the home page)`.
2. Replace the route row `| \`/scenarios\`, \`/scenarios/create\`, \`/scenarios/:id\` | \`ScenariosList\`, \`CreateScenario\` | auth |` with:

```markdown
| `/scenarios`, `/scenarios/rules/new`, `/scenarios/rules/:id`, `/scenarios/rules/:id/edit`, `/segments/:id/rule` | `ScenariosHome` (Rules; Canvas is `ScenariosList`, `?tab=canvas`), the rule builder modal (`NewRuleRoute`, `EditRuleRoute`, `RuleSegmentRoute` in `pages/rules/RuleBuilder.tsx`), `RulePage`. See 4.5j | auth |
| `/scenarios/create`, `/scenarios/:id` | `CreateScenario` (the canvas builder, unchanged) | auth |
```

3. Replace the route row `| \`/brain/{dashboard,graph,initiatives,review,feedback,agents,skills}\` | one page each | \`view_all_accounts\` |` with:

```markdown
| `/brain/review` | `ReviewQueuePage`: From your rules for everyone; the AI proposals for `view_all_accounts` only | auth |
| `/brain/{dashboard,graph,initiatives,requests,anomalies,feedback,agents,skills}` | one page each (`pages/brain/BrainRoutes.tsx`) | `view_all_accounts` |
```

4. In "Navigation surfaces", replace `KNOWLEDGE BRAIN (seven items, whole section hidden without \`view_all_accounts\`, with a live pending-proposal badge on Review Queue)` with `KNOWLEDGE BRAIN (the Brain's items for \`view_all_accounts\`, with a live pending-proposal badge on Review Queue; everyone else sees Review Queue alone, where their own rule reviews wait)`.
5. Insert after section 4.5i (before `### 4.6 Copilot and multiplayer sessions`):

```markdown
### 4.5j Rules

Spec `docs/superpowers/specs/2026-10-04-rules-design.md`. A rule is "when →
then" on one of the owner's own segments, run nightly as the owner by the
backend's `run_health_maintenance`.

1. **List.** `/scenarios` → `GET /rules/` (every readable rule, by name;
   unpaginated). `?tab=canvas` shows the canvas list as before. A row's
   switch is `PATCH /rules/<id>/ {is_active}`, turning on only after the
   confirm; a 400 (no segment) shows under it.
2. **Build.** `/scenarios/rules/new` (over the list), `/scenarios/rules/<id>/edit`
   (over the rule) or `/segments/<id>/rule` (Automate, over the segment, with
   it chosen).
   - The segments offered are the caller's own (`GET /segments/?scope=mine`).
   - **Test this rule:** `POST /rules/test/` with the rule's body (`name`
     optional, and `rule: <id>` when editing); nothing is written. The answer
     shows while the rule is unchanged.
   - **Save rule:** `POST /rules/` (201, then `/scenarios/rules/<id>`), or
     `PATCH /rules/<id>/` with the whole rule. 400s land at their fields
     (`actions` per card); the segment-ownership 403 at the segment; 429 (50
     rules) above the form.
3. **Read a rule.** `/scenarios/rules/<id>` → `GET /rules/<id>/` (a 404 for
   one not shared reads "Rule not found"), then `GET /rules/<id>/runs/`
   (Show more passes the server's `next`), and, when a night is opened, `GET
   /rules/<id>/runs/<run_id>/`. `?run=<id>` (the `rule_fired` link) opens
   that night. The owner can delete it (`DELETE /rules/<id>/`).
4. **Review.** `/brain/review`, open to every signed-in user: `GET
   /rules/reviews/?status=waiting` (the caller's own). Approve is `POST
   /rules/reviews/<id>/approve/` and opens `/surveys/<survey_send_id>`; a 400
   is Surveys' refusal, shown on the item, which stays; Skip is `POST
   …/skip/`; a 409 removes the item ("That review was already decided.").
   The AI proposals (`/metrics/proposals/`) load only for
   `view_all_accounts`.
5. **Notifications.** `rule_fired` links to `/scenarios/rules/<id>?run=<run_id>`
   (or nowhere, for someone who may not read the rule); `rule_review` links to
   `/brain/review`.
```

- [ ] **Step 5: `.agents/workflows/repo-architecture.md`**

1. In the tree, after the `surveys/` line under `features/`, add:

```
│   │   ├── rules/              ← Rules: types, API, choices and the backend's sentences, the rule as a sentence, the draft and its checks, refusals at fields, URL state; testRules.ts (stubRules, runNight)
```

   after the `surveys/` line under `components/`, add:

```
│   │   ├── rules/              ← switches (dialog and in-place confirm), rule row, When and Then fields, Test this rule, the rule's header and nights, the Review Queue's From your rules
```

   and replace the `pages/scenarios/` line, then add `pages/rules/` after it:

```
│       ├── scenarios/          ← ScenariosHome (Rules and Canvas tabs); the visual scenario builder (React Flow)
│       ├── rules/              ← RulesTab, RuleBuilder (the modal routes), RulePage
```

2. In the Component Dependency Graph, replace `├── scenarios/create           → Visual scenario flow builder` with:

```
├── scenarios/
│   ├── (layout: ScenariosHome — ?tab=rules|canvas; Canvas is ScenariosList)
│   │   ├── (index)
│   │   └── rules/new          → NewRuleRoute (the rule builder modal over the list)
│   ├── rules/:id              → RulePage (?run=<id> opens a night)
│   │   └── edit               → EditRuleRoute (the owner's; a notice for anyone else)
│   ├── create                 → the canvas builder (unchanged)
│   └── :id                    → the canvas builder (unchanged)
├── brain/*                    → BrainRoutes (review open to all; the rest needs view_all_accounts)
```

   and under `segments/ … :id`, after the `survey` line, add:

```
│       └── rule               → RuleSegmentRoute (Automate: the rule builder, the segment chosen)
```

   (turn the `survey` line's `└──` into `├──`).
3. Replace the note `> Note: The \`DashboardLayout\` hides the \`<Navbar />\` and removes padding on the \`/scenarios\` route to give the builder a full-canvas feel.` with `> Note: The \`DashboardLayout\` hides the \`<Navbar />\` and removes padding on the canvas builder (\`/scenarios/create\`, \`/scenarios/:id\`) to give it a full-canvas feel; \`/scenarios\` and the rule pages are framed pages under the Navbar.`, and the shell line `← hidden on /scenarios route` with `← hidden on the canvas builder`.
4. After "### 12. Surveys (`pages/surveys/`)" and its paragraph, add:

```markdown
### 13. Rules (`pages/rules/`, `pages/scenarios/ScenariosHome.tsx`)

Simple "when → then" rules on the owner's own segments (spec
`docs/superpowers/specs/2026-10-04-rules-design.md`), on backend
`services/rules`, run nightly as the owner. `/scenarios` holds Rules and the
Canvas (today's `ScenariosList`, unchanged); the builder is the segment
builder's modal (`BuilderDialog`, `RadioTile`, `SharingFields`, `RuleSentence`,
and Surveys' `SurveyPreview`, `useMySegments`, `RoleFields`, `SegmentOptions`);
a rule's page lists its nights, twice-filtered; the Review Queue's From your
rules (`components/rules/RuleReviews.tsx`) is open to everyone through
`pages/brain/BrainRoutes.tsx`; Automate sits on a segment's page. See
`docs/03-ui-ux-design.md` "Rules (Scenarios)".
```

- [ ] **Step 6: Commit**

```bash
git add src/components/rules/houseRules.test.ts src/e2e/rules.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): build, run and approve a rule; house rules and docs for Rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Final verification, the browser check, and finishing the branch

Spec §5 ("Browser check against the local backend with a forced nightly run"); skills `verification-before-completion`, `finishing-a-development-branch`.

**Files:** none new; fixes only where a check fails.

- [ ] **Step 1: The whole suite, lint and build**

Run, one at a time:

```bash
npx vitest run --maxWorkers=2
npm run lint
npm run build
```

Expected: every test passes (the Segments, Surveys, Scenarios and Brain suites included); lint and build are clean. Fix what fails in the task that owns it, with its own commit.

- [ ] **Step 2: The browser check against the local backend**

With `revenact-backend` on `feat/rules` running locally (`venv/bin/python manage.py runserver`) and this app on `npm run dev`:

1. Sign in as a CSM (no `view_all_accounts`). Open a segment of yours, **Automate**, build "CSAT below 60 → notify me + survey", **Test this rule**, Save, turn it on (confirm).
2. Force the night: `venv/bin/python manage.py run_health_maintenance` (not `--dry-run`).
3. Reload the rule: a night row with what fired; open it. The bell shows the `rule_review` notice; it opens `/brain/review`, which the CSM can reach, showing From your rules and no AI proposals; `/brain/dashboard` still sends the CSM to `/dashboard`.
4. Approve: the new survey's page opens (or, with email not set up, the refusal shows on the item and it stays).
5. Check `/scenarios` at 375px and 1440px, in light and dark: rows wrap, no sideways scroll, every control at least 44px tall on the phone.

Write what was seen (and any fix) in the PR description.

- [ ] **Step 3: Finish the branch**

Use `superpowers:finishing-a-development-branch`. Do not push from this plan; the backend PR merges and deploys first (Global Constraints, "The API contract").

---

## Self-review

**Spec coverage** (frontend scope: §2, §3 as it shows in the UI, §4 frontend, §5):

| Spec | Where |
|---|---|
| §2.1 `/scenarios` tabs `?tab=rules|canvas`, Rules first, Canvas unchanged | Task 2 (`scenariosTab`), Task 6 (`ScenariosHome`), Task 14 (routes, frame, bar) |
| §2.1 a row per rule: sentence, owner's switch, last run, sharing; New rule; empty state | Task 1 (sentence, last run), Task 5 (switch with confirm), Task 6 (rows, states) |
| §2.2 builder modal at `/scenarios/rules/new` and `/:id/edit` | Task 10 (new), Task 11 (edit) |
| §2.2 When: trigger, my segments by kind, score/direction/value with per-score ranges, weekly weekday / monthly | Task 7 |
| §2.2 Then: 1–3 cards, each once; notify, task, lifecycle (not contacts), survey with Surveys' fields and Send without review (off, warning, confirm) | Task 8 (with Task 4's shared roles), Task 5 (in-place confirm) |
| §2.2 Limits: cooldown 1–365 default 30; 200 a night | Task 2 (checks), Task 10 (field and hint) |
| §2.2 Test this rule on the dry run, estimate wording, hidden count, cooldown skips | Task 9, Task 10 (wired; edit lends `rule`) |
| §2.2 Sharing; Save; rules saved off; turning on confirms | Task 10 (Status switch), Task 5/6 (row), Task 11 (page) |
| §2.2 errors at fields, per action, 429 | Task 2 (`ruleErrors`), Task 10 (tests) |
| §2.3 rule page: sentence header, on/off, Edit, paused notice by code, nights with cursor, records twice-filtered with hidden count | Task 1 (texts), Task 11 |
| §2.4 Review Queue From your rules: rule, trigger, server count, SurveyPreview, Approve/Skip, refusal, 409; access ruling | Task 12, Task 13 |
| §2.5 Automate (owner) at `/segments/:id/rule` | Task 10, Task 14 (route) |
| §1.3/§1.4 notification kinds and links | Task 14 |
| §3 privacy in the UI: twice-filtered nights, owner-only switch/edit/decisions, no server markup | Tasks 6, 11, 12, 15 |
| Controller: 500-person note and refusal shown | Task 8 (note), Task 12 (refusal) |
| §4 tests: tabs, builder, actions, limits, test, confirms, rule page, Review Queue, Automate, house rules, one e2e | Tasks 1–15 |
| §5 frontend PR and browser check | Task 16 |

**Placeholder scan:** no "TBD", "TODO", "similar to", or steps without code; every test and implementation is written out, and the doc text is given verbatim.

**Type consistency, checked across tasks:**
- `RuleDraft` (Task 2) is what `TriggerFields` (Task 7), `ActionCards` (Task 8) and `RuleForm` (Task 10) read and patch; `ActionDraft`/`LifecycleDraft` are the cards' types.
- `RuleErrors` `{ form?, field, action }` (Task 2) is read as `errors.field.*` by `TriggerFields`, `errors.action[i]` by `ActionCards`, and returned by `useRuleTest().run()` (Task 9).
- `ruleParts(rule, segment)`, `triggerParts(fields, segment)` take a `SegmentLike` (`{name, kind} | null`); `SegmentRef` and `ReviewRule.segment` both fit it (Tasks 6, 11, 12).
- `RuleSwitch({ rule: RuleRow, onChange(rule: Rule) })` (Task 5) is used by `RuleListItem` (Task 6) and `RuleHeader` (Task 11).
- `stubRules()` returns `{ spy, runNight, tokensOf }` (Task 3); `runNight(id)` returns a `StubRun | null`; review ids start at 300 and send ids at 31 (Tasks 3, 15).
- `renderRules(url, { width?, nav?, role? })` (Task 6) gains routes in Tasks 10, 11, 12, always ending in the `*` catch-all.
- Route names are consistent: `NewRuleRoute`, `EditRuleRoute`, `RuleSegmentRoute` (`RuleBuilder.tsx`), `RulePage`, `ScenariosHome`, `BrainRoutes` (Tasks 6, 10, 11, 13, 14).

# Campaigns: owned, segment-targeted email (frontend, delivery 5 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/campaigns` on the backend's new contract: a list with Mine / Shared with me tabs, the campaign editor modal (`/campaigns/new`, `/campaigns/:id/edit`) on one of the owner's segments with merge-field chips, a live preview and a Send now… confirm on a fresh server count, a campaign's page (`/campaigns/:id`) with its sends and their deliveries, the public unsubscribe page (`/u/:token`), Re-subscribe on a contact, a sixth rule action **Send a campaign** with its Review Queue item, and the `campaign_sent` notification. Hand-picked recipients (`RecipientPicker`) are removed.

**Architecture:**
- **`src/features/campaigns/` (new, pure, unit-tested):** the §4 contract types (`campaignTypes.ts`), limits, labels and the backend's sentences (`campaignOptions.ts`), display text with figures kept apart for DM Mono (`campaignText.ts`), the editor's draft, merge-field check and write bodies (`campaignDraft.ts`), refusals mapped to fields or to the Send button (`campaignErrors.ts`), URL state (`campaignParams.ts`), the API (`campaignApi.ts`), fixtures shared with the Rules stub (`testCampaignFixtures.ts`) and a stateful contract stub (`testCampaigns.ts`, `stubCampaigns`) that falls through to `stubPlans` → `stubRules` → `stubSurveys` → `stubSegments`. No Redux slice: as Segments, Surveys, Rules and Plans, pages read through small hooks.
- **`src/components/campaigns/` (new):** the row parts (`parts.tsx`), `CampaignRowItem`, the list hook, the page's `CampaignHeader` and states, `LegacyRecipients`, the editor's `CampaignAudienceFields`, `MessageFields` (subject, body, merge chips), `PreviewPane` with `usePreview` and `useCampaignAudience`, `SendStep` and `SendDialog`, `SendsSection` with `useSendPoll`, `Deliveries`, `useMyCampaigns`, `useCampaign`.
- **`src/pages/campaigns/` (rebuilt):** `CampaignsHome` (`/campaigns`, its `Outlet` holds the modal), `CampaignBuilder.tsx` (`CampaignForm`, `NewCampaignRoute`, `EditCampaignRoute`), `CampaignPage`, `Unsubscribe` (`/u/:token`), `testPages.tsx`. The old `CampaignsList.tsx`, `CampaignEditor.tsx`, `RecipientPicker.tsx`, `campaignApi.ts`, `types.ts` and their tests are deleted in Task 14.
- **Elsewhere (modify):** Rules (`campaign` action, `campaign_gone`, dry run's `campaigns`, campaign reviews), `ContactProfile` (unsubscribe line and Re-subscribe), `lib/theme.ts` (`/u/` light only), Navbar, DashboardLayout, App routes, notifications.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7, lucide-react, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-campaigns-design.md`. This plan covers §0 (context), §2 (frontend) and §4 (the API contract, binding; field names used exactly). §1 is the backend, read for behaviour the stub must mirror (skips and their order §1.3, sending §1.4, rendering §1.5, unsubscribe §1.6, permissions §1.7, rules §1.8).

**The API contract** is spec §4. The backend is planned in parallel against the same section, so every test here runs against `stubCampaigns` (Task 2), never a live server. Where §4 is silent or does not fit the real frontend, the assumption is written in **Contract notes** below, to be reconciled with the backend plan.

**Branch:** `feat/campaigns` in `react-ts-app`, already checked out (spec commit `040b06d` on `main`). It will be rebased onto `main` once the Plans frontend (#103) merges, so this plan is written against `main` **plus the Plans code**: `src/features/plans/`, `src/components/plans/` (`useSubmitOnce`, `useRefusalFocus`, `styles.ts`'s `INPUT`), `BuilderDialog`'s `size="narrow"`, the rules' `plan` action (`PlanAction`, `RuleActionWrite`, `template_gone`, `planTestParts`), `NotificationKindIcon`, and `KNOWN_COMPLIANT` including `INPUT`. **Do not start Task 1 until the rebase is done** (`git log --oneline | grep -i plans` shows the Plans merge). Stay on the branch. Never push. Do not touch `revenact-backend`.

## Contract notes (assumptions to reconcile with the backend plan)

1. **Segment kind and id.** §4 types `SegmentRef.kind` as `'organization' | 'account' | 'contact'`, but `segments.Segment.Kind` stores `customer` and every other contract here (segments, surveys, rules) sends `customer`. `CampaignSegmentKind` accepts both `'organization'` and `'customer'`; `segmentKindOf()` maps to the frontend's `SegmentKind` (`customer`) before anything compares or labels a kind. The stub sends `'organization'`, as §4 says. **Backend plan (binding):** `SegmentRef.id` is `null` when the reader can't read the segment, as in Surveys and Rules; the type is `id: number | null` and a segment is never linked (it is shown by name and kind only).
2. **`roles`** is §4's `string[]`; this plan types it `ContactRole[]` (the same values, Surveys' `RoleFields`).
3. **Preview of unsaved text.** **Backend plan (binding):** `POST campaigns/:id/preview/` accepts `{contact?, subject?, body?}`, so the pane renders the draft's text while typing (nothing written); an unknown merge field in them is refused at its field. It needs a saved campaign: this plan picks **"Save to preview"** over autosaving (Decision 5, Contract note 4).
4. **Audience and preview need a saved campaign.** Both are per campaign (`campaigns/:id/…`) and resolve its **saved** segment and roles. A new campaign has no id, so until its first Save its preview pane draws the typed text locally, merge fields as written, with the footer, and says "Save the draft to see it for a real person." (no autosave). The person picker reads `GET audience/` after each save. Send now… always saves first, then reads `audience/` again (the "fresh server count"). `Audience.reach` is who would be emailed now; a send's `Counts.reached` is everyone checked; every skipped map carries all six reasons, zeros included (backend plan, binding).
5. **List paging.** `GET campaigns/?tab=&archived=1&cursor=` answers `{results, next}`, newest `updated_at` first; `tab` defaults to `mine` (this app always sends it); `archived=1` **adds** archived campaigns to the tab (it does not show only them). Page sizes (backend plan, binding): campaigns 50, sends 20, deliveries 50; the stub uses the same.
6. **Deliveries `hidden`** counts the deliveries under the same `status`/`reason` filter that the reader may not open (the stub does so); the page reads it as "N more people you can't open" either way.
7. **`POST campaigns/:id/sends/`** delivers inside the request (the project has no task queue), so its 201 is normally `status: 'sent'`. A `sending` send (a crash, or a slow request seen from another tab) is polled with `GET sends/:sid/` every 3 s until `sent`.
8. **Send refusals.** **Backend plan (binding):** every refusal of `POST sends/` is `400 {detail}`: EMAIL_NOT_SET_UP, archived, no segment, nobody reachable, and "Write a subject and a body first." (`SAY.NO_CONTENT`). Each is shown **at the Send button** and the campaign stays saved. `sendRefusal` still sends a field-keyed 400 back to the form, so a change of shape cannot lose the message.
9. **The 51st campaign and someone else's segment** answer 400 with field errors (backend plan, binding); a field the form owns (`segment`) shows at it, anything else (the stub's `non_field_errors: ["You can own at most 50 campaigns."]`) above the form, as does any 403/429 `detail`. `PATCH status` accepts only `'archived'` or `'active'`.
10. **An unreadable rule on a send** reads `rule: {id: null, name: "a rule"}` (as Plans' `started_by_rule`); the row says "From a rule", unlinked.
11. **Rule reviews.** Every `RuleReview` gains `kind` (backend plan, binding); a payload without one is read as a survey review. A campaign review carries `campaign: {id, name} | null` and `counts: {reach, skipped}`, and (assumed, still to reconcile) `records: {kind, id, name}[]` (the fired records the reader may open, `kind` the segment kind as rules send it) with an optional `hidden_count`; without `records` the item shows the counts alone. Approving answers `{campaign_send_id}`; `result` gains `campaign_send_id`. A Campaigns refusal is stored on the review as `result.error`, as Surveys' is.
12. **Night rows** keep `review` and gain `reviews: [{id, kind, status}]` (backend plan, binding), so a night can hold a survey review and a campaign review. `RunRow.reviews` is typed optional; `waitingReviews(run)` counts the waiting ones from `reviews` (falling back to `review`) for "N waiting for review" and the night's Review it link (Task 13). Night results for the action: `queued` "waiting for your review", `done` "emailed", `skipped` "nobody it could reach", `failed` with the refusal's words.
13. **Contacts** (backend plan, binding): every contact read carries `campaigns_unsubscribed_at: string | null`; it is typed optional (absent reads as subscribed) until the backend ships. Re-subscribe is the existing `PATCH contacts/:id/ {campaigns_unsubscribed: false}`, which answers the whole contact; sending `true` is a 400, and this app never sends it.
14. **`campaign_sent`** carries `link: "/campaigns/<id>"`; the bell already navigates to `link`.
15. **Old links and fields.** `/campaigns/create` redirects to `/campaigns/new`. The old `POST campaigns/:id/send/` now answers 404 and the old response fields (`recipients`, `send_log`, `sent_count`, `hidden_recipients`, `status_display`, …) are gone (backend plan, binding): Task 14 deletes every reader of them and greps that none is left.
16. **Merge fields.** The client refuses `{…}` holding anything but the three names, with the backend's sentence; a lone `{` or `}` is plain text. The server stays the judge.
17. **The rule's campaign picker** reads `GET campaigns/?tab=mine` (following `next`) and offers the owner's non-archived campaigns whose segment kind matches the rule's segment (drafts with a segment included, as §1.8's validation allows).

## Global Constraints

Quoted text is verbatim from the spec or `.claude/skills/revenact-design/SKILL.md` §1 and §4.

- **Commands.** Never run prettier (the repo has no config). Type-check with `npx tsc -b --noEmit`; lint changed files with `npx eslint <changed files>`; `npm run lint` must end with **16 pre-existing warnings, 0 errors**; `npm run build` must pass. Run focused tests with `npx vitest run --maxWorkers=2 <paths>`, one process at a time; run the full `npx vitest run --maxWorkers=2` before finishing (Task 15).
- **Commits** are conventional (`feat(campaigns): …`, `feat(rules): …`, `feat(contacts): …`, `test(e2e): …`, `docs(campaigns): …`) and every message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.
- **Tokens only.** "Zero raw hex, rgb, or named colours in `src/**/*.tsx`; tokens only." Use `bg-surface`, `bg-subtle`, `text-ink`, `text-ink-muted`, `border-line`, `bg-accent`, `text-on-accent`, and the semantic `success`/`warning`/`danger`/`info` with their `-dim` tints. "Semantic colours carry meaning only (status, trend, severity), never decoration."
- **Both themes.** "Every colour is a token with a light value in `@theme` and a dark override". This plan adds no colour. The one exception is `/u/:token`, which is light only (spec §2.4) through `lib/theme.ts`.
- **Lucide only.** "Lucide React exclusively. 16px inline, 20px standalone action, 24px section header." Every icon carries `aria-hidden="true"`; an icon-only button has an `aria-label`. "No emoji as icons."
- **Touch targets.** "a 44px touch target or `min-h-9` on desktop-only dense controls": every button, link, select and text input gets `min-h-11 sm:min-h-9` (or `h-11 w-11`), directly or through `BUTTON`, `PRIMARY`, `QUIET`, `FILTER_SELECT`, `INPUT`, or a style constant in the same file. Checkboxes take their target from their label.
- **Layouts at 375 / 768 / 1024 / 1440.** "no horizontal scroll; `min-h-[100dvh]` never `h-screen`." The editor's preview pane sits beside the form from `lg` and below it on phones (spec §2.2).
- **Type.** "at most four sizes per surface": `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]` only. "numbers and IDs in DM Mono with `tabular-nums`": counts, the `0 of 150` / `0 of 5000` counters and dates in rows use `MONO` (`font-mono-brand tabular-nums`).
- **No card inside a card.** "Group with `border-line`, `divide-y`, or whitespace." Rows inside a `bg-surface` section are flat (`divide-y`). No glass, no gradients.
- **No colour-only meaning.** A status (Draft, Active, Archived; Sent, Skipped, Waiting) is a word and an icon as well as a tint; Unsubscribed is a word and an icon.
- **Copy.** "Labels above inputs, errors below inputs, no placeholder-as-label, sentence-case UI copy, no filler verbs". **No em dashes in UI copy** (use a colon, a comma or " · "). Server text (a preview's footer) is shown as it comes.
- **A refusal with no field takes focus** (spec §2.2): the form-level alert, the Send button's refusal, a review's stored refusal and a dialog's error are focusable (`tabIndex={-1}`, `data-error`) and receive focus once, when they arrive.
- **Submit once** (spec §2.2): every new write started from a button in the Campaigns folders goes through `useSubmitOnce` (`components/plans/useSubmitOnce.ts`), so Enter twice or a double click sends one request; the tests double-click Save, Send now and Unsubscribe.
- **States.** "Every list/table/chart has designed empty, loading (skeleton matching layout, not spinner), and error states." "Every interactive element has default, hover, focus-visible, active, disabled, loading states".
- **Motion.** No new animation. The only motion is the existing skeleton pulse.
- **Rows, never tables.** No `<table>`, no `role="table"`/`"grid"` (the house-rules suite checks it).
- **Plain text only** (spec §3: no HTML). Subject, body and previews render as text with `whitespace-pre-wrap break-words`; `dangerouslySetInnerHTML` is banned in the new folders.
- **Visibility (spec §1.7).** Deliveries list only people the reader may open, plus "N more people you can't open"; `counts` stay whole. Edit, Send now…, Archive and Delete are offered only when `is_owner`; Delete only when `can_delete`. A campaign the reader can't read is "Campaign not found".
- **Limits (spec §1.1):** name ≤ 120, subject ≤ 150, body ≤ 5000; 50 campaigns per owner; 500 people per send; one campaign email per contact every 3 days; a campaign reaches a contact once, ever.
- **Exact copy from the spec:** "Mine", "Shared with me", "New campaign", "Show archived", "Draft", "Active", "Archived", "Never sent", "Choose a segment to send", "No campaigns yet", "Send now…", "Emails 212 people · Skips 14 unsubscribed · 9 emailed in the last 3 days · 3 already received it", "Sent by <name>", "From rule <name>", "Migrated", "Sending…", "All", "Sent", "Skipped", "N more people you can't open", "Picked by hand before segments", "Stop emails from <workspace>?", "Unsubscribe", "You're unsubscribed. You won't get more of these emails.", "Unsubscribed from campaigns on <date>", "Re-subscribe", "Send a campaign", "Send without review", "…then email <Campaign>" (+ "without review"), "Campaign: waiting for your review", "Campaign: emailed", "Campaign: nobody it could reach", "Campaign: failed (…)", "Its campaign was archived or deleted.", "Would email N people · M skipped" (Decision 17), "Use {first_name}, {organisation} or {sender_name}.", "Only the campaign's owner can change it.", "Archive it instead: it has been sent.", "Email isn't set up for this workspace yet, so campaigns can't be sent.", "This campaign is archived.", "Choose a segment first.", "Nobody in this segment can be emailed right now.", "Write a subject and a body first.", "Choose one of your active campaigns for these records.", counters `0 of 150` and `0 of 5000`.
- **Tests** follow the `testing` skill: unit tests per module and component; page tests on the real store and router with `fetch` stubbed by `stubCampaigns`; one jsdom journey in `src/e2e/campaigns.test.tsx`; a Campaigns house-rules suite reusing `houseRuleSuite` and `rowsIconsTargetsSuite`. Every test must be able to fail, and its title claims only what it asserts. Fixture times are midday UTC (`…T12:00:00Z`) so day labels do not move with the runner's time zone.
- **Product documents** change in the same branch: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 15).

## Decisions made while planning (the owner may overrule any)

1. **Folders.** `src/features/campaigns/`, `src/components/campaigns/`, `src/pages/campaigns/` (rebuilt), so the house-rules suite can glob them whole. The new editor lives in `CampaignBuilder.tsx` (as `SurveyBuilder.tsx`), so the old `CampaignEditor.tsx` keeps compiling until Task 14 deletes it.
2. **Title and frame.** As Surveys: `/campaigns` wears the framed Navbar titled "Campaigns"; `/campaigns/new`, `/campaigns/:id` and `/campaigns/:id/edit` read "‹ Campaigns" back to the list. Pages sit in `OrganizationsFrame`; `DashboardLayout` gives `/campaigns…` the `p-0` frame.
3. **Tabs** are `DetailTabs` (Mine, Shared with me) in the URL as `?tab=shared` (absent = Mine). **Show archived** is a labelled checkbox, `?archived=1`.
4. **Saving.** The editor's Save closes it: a new campaign opens its page, an edited one returns to its page with the saved copy. Name is the only field Save requires; Send now… requires a segment, its roles, a subject and a body.
5. **Preview.** Before the first save it is drawn locally (Contract note 4). Once saved with a segment, a **Preview for** select lists the audience's sample (first 20, first chosen), and the pane shows the server's `{subject, body}` 400 ms after the last keystroke, only the latest answer counting, the last good one dimmed while a newer one loads.
6. **Send now…** in the editor saves, reads `audience/` again, and swaps the form for a confirm step in the same dialog (Back, Send now). On the campaign page the same step opens in a narrow `BuilderDialog` ("Send <name>"). A sent campaign opens at `/campaigns/:id?send=<sid>`, that send open.
7. **Sends** are disclosure rows (as a rule's nights): `?send=<id>` opens one; opening one reads its deliveries. A `sending` send shows "Sending…" and polls every 3000 ms until `sent`, then the campaign is read again.
8. **Deliveries' filters** are a "Show" group of three buttons (`aria-pressed`: All, Sent, Skipped) and, with Skipped, a **Reason** select ("All reasons" and the six). They are local state, not in the URL.
9. **Archive / Unarchive / Delete** ask first in `ConfirmDialog`. Unarchive is offered on an archived campaign (§4 allows `status: 'active'`). Delete shows only when `can_delete`; its 409 reads the server's `detail` inside the dialog.
10. **Merge-field chips** ("Insert first name", "Insert organisation", "Insert sender name", showing `{first_name}` etc.) insert into the body at its caret (or at the end when the body has never been focused) and put the caret after the token.
11. **Unsubscribe page** is `pages/campaigns/Unsubscribe.tsx`, outside the guard and the shell, reading no store, sending no session (`accessToken: null, skipAuthRetry: true`), light only. Every 404 shows one page: "This link has expired." / "Unsubscribe links work for 365 days.". A 429 shows Surveys' `THROTTLED` sentence beside the button.
12. **Re-subscribe** sits in a "Campaign emails" line under the contact's header, for anyone who can open the contact, behind a `ConfirmDialog` ("Re-subscribe <name>?" / "They will get campaign emails again from the next send. Only do this if they asked.").
13. **Rules.** The sixth action card **Send a campaign** has a Campaign select (Contract note 17) and a **Send without review** `ConfirmedSwitch` (off by default). The sentence reads "email Win-back" / "email Win-back without review"; with nothing chosen, "email a campaign". Turning a rule on adds "Its campaign emails wait for your review first." or "Its campaign emails go out without your review."
14. **Review Queue.** A campaign review shows the rule and its trigger, the campaign (linked), "Would email N · M skipped", the records (linked, then "N more you can't open"), and Approve / Skip. Approve opens `/campaigns/<id>?send=<sid>`. A stored refusal reads "Campaigns refused it: … Fix it, then approve again, or skip it.", is the Approve button's description, and takes focus when it arrives. The list's name becomes "Reviews from your rules".
15. **Notification icon:** `Megaphone` for `campaign_sent` through `NotificationKindIcon`.
16. **Dates.** Headers, sends and the contact line read "4 Oct 2026" (Surveys' `dayLabel`); list rows read "4 Oct" (`shortLabel`).
17. **"Would email N · M skipped"** (spec §2.5) reads "Would email 2 people · 1 skipped", the noun added after the figure, in the Review Queue and in Test this rule (the dry run's `campaigns`).

## File Structure

| File | Responsibility |
|---|---|
| `src/features/campaigns/campaignTypes.ts` (new) | §4's types, field for field, and the write bodies |
| `src/features/campaigns/campaignOptions.ts` (new) | Limits, labels, skip order and words, the backend's sentences (`SAY`), the client's own check words (`CHECK`) |
| `src/features/campaigns/campaignText.ts` (new) | Kind mapping, skip lines, the audience sentence, last-send and count parts, who sent, roles, reasons, hidden people, footer lines, day labels |
| `src/features/campaigns/campaignDraft.ts` (new) | The editor's draft, merge-field check, client checks, write and PATCH bodies, inserting a merge field |
| `src/features/campaigns/campaignErrors.ts` (new) | 400/403/404/409 bodies to fields or the form; a send's refusal to the button or the form |
| `src/features/campaigns/campaignParams.ts` (new) | `/campaigns` tab and archived, `?send=`, the list and deliveries queries |
| `src/features/campaigns/campaignApi.ts` (new) | `apiFetch` wrappers for every §4 endpoint; the public pair without a session; every page of mine |
| `src/features/campaigns/testCampaignFixtures.ts` (new, test-only) | Campaigns, sends, deliveries, people per segment; `campaignRef`, `campaignUsable` for the Rules stub |
| `src/features/campaigns/testCampaigns.ts` (new, test-only) | `stubCampaigns` (stateful: skips in §1.3's order, tokens, unsubscribes), falling through to `stubPlans` |
| `src/components/campaigns/parts.tsx` (new) | `StatusPill`, `SegmentName`, `DeliveryStatus` |
| `src/components/campaigns/CampaignRowItem.tsx`, `useCampaignList.ts` (new) | One list row; the list's read and paging |
| `src/components/campaigns/useCampaign.ts`, `CampaignStates.tsx`, `CampaignHeader.tsx`, `LegacyRecipients.tsx` (new) | A campaign's read and its states; the header with the owner's actions; a migrated draft's old recipients |
| `src/components/campaigns/CampaignAudienceFields.tsx`, `MessageFields.tsx` (new) | The editor's segment and roles; subject, body, chips, counters |
| `src/components/campaigns/useCampaignAudience.ts`, `usePreview.ts`, `PreviewPane.tsx` (new) | The audience read, the debounced preview, the pane |
| `src/components/campaigns/SendStep.tsx`, `SendDialog.tsx` (new) | The confirm step and the Send button with its refusal; the page's dialog |
| `src/components/campaigns/SendsSection.tsx`, `useSendPoll.ts`, `Deliveries.tsx` (new) | Sends as disclosure rows, polling, a send's deliveries |
| `src/components/campaigns/useMyCampaigns.ts`, `houseRules.test.ts` (new) | The rule picker's campaigns; the house rules |
| `src/pages/campaigns/CampaignsHome.tsx`, `CampaignBuilder.tsx`, `CampaignPage.tsx`, `Unsubscribe.tsx`, `testPages.tsx` (new) | The routes' pages and the test render |
| `src/pages/campaigns/CampaignsList.tsx`, `CampaignEditor.tsx`, `RecipientPicker.tsx`, `campaignApi.ts`, `types.ts` and their two tests (delete, Task 14) | The old hand-picked campaigns |
| `src/features/rules/ruleTypes.ts`, `ruleOptions.ts`, `ruleDraft.ts`, `ruleText.ts`, `testRules.ts` (modify) | The `campaign` action, `campaign_gone`, the dry run's `campaigns`, campaign reviews |
| `src/components/rules/ActionFields.tsx`, `ActionCards.tsx`, `TestPanel.tsx`, `RuleReviews.tsx` (modify) | The Send a campaign card, the dry-run line, the review item |
| `src/features/customers/customersSlice.ts`, `src/features/contacts/testContacts.ts`, `src/components/contacts/ContactProfile.tsx` (modify) | `campaigns_unsubscribed_at`, Re-subscribe |
| `src/lib/theme.ts` (modify) | `/u/` light only |
| `src/features/notifications/types.ts`, `src/components/layout/NotificationKindIcon.tsx`, `src/components/layout/Navbar.tsx`, `src/layouts/DashboardLayout.tsx`, `src/App.tsx` (modify) | `campaign_sent`, the bar, the frame, the routes |
| `src/pages/copilot/copilotApi.ts`, `src/pages/copilot/cockpitApi.ts` (modify, comments only) | Their header comments point at the deleted `campaignApi.ts` |

---

### Task 1: The contract types, the options and the display text

Spec §4 (types), §1.3 (skip reasons and their order), §1.5 (footer), §2.1 (row text), §2.2 (confirm sentence), §2.3 (send rows, reasons); Contract notes 1, 2, 10; Decision 16.

**Files:**
- Create: `src/features/campaigns/campaignTypes.ts`, `src/features/campaigns/campaignOptions.ts`, `src/features/campaigns/campaignText.ts`
- Test: `src/features/campaigns/campaignText.test.ts`

**Interfaces:**
- Consumes: `PersonRef`, `Sharing`, `SegmentKind` (`features/segments/segmentTypes`); `ContactRole` (`features/surveys/surveyTypes`); `SentencePart` (`features/segments/ruleSentence`); `Line`, `dayLabel` (`features/surveys/surveyText`); `CONTACT_ROLES` (`features/contacts/contactsParams`).
- Produces:
  - `campaignTypes.ts`: `CampaignStatus`, `SendStatus`, `SkipReason`, `Skipped = Record<SkipReason, number>`, `CampaignSegmentKind`, `SegmentRef`, `Counts`, `LastSend`, `CampaignRow`, `Campaign`, `CampaignSend`, `DeliveryStatus`, `DeliveryRecord`, `Delivery`, `Audience`, `Page<T>`, `DeliveriesPage`, `CampaignTab`, `CampaignWrite`, `CampaignPatch`, `PreviewRequest`, `Preview`, `PublicUnsubscribe`, `RuleRef`.
  - `campaignOptions.ts`: `NAME_MAX` 120, `SUBJECT_MAX` 150, `BODY_MAX` 5000, `OWNED_MAX` 50, `PEOPLE_MAX` 500, `GAP_DAYS` 3, `LINK_DAYS` 365, `PREVIEW_DEBOUNCE_MS` 400, `SENDING_POLL_MS` 3000, `SAMPLE_MAX` 20, `MERGE_FIELDS`, `MergeField`, `MERGE_LABEL`, `STATUS_LABEL`, `SKIP_ORDER`, `SKIP_WORDS`, `REASON_LABEL`, `SAY`, `CHECK`, `SHARING_NOTE`, `EXPLAINER`.
  - `campaignText.ts`: `NO_SKIPS`, `segmentKindOf(kind) → SegmentKind`, `skippedTotal(skipped) → number`, `skipLines(skipped) → Line[]`, `audienceParts(audience) → SentencePart[]`, `countsParts(counts) → SentencePart[]`, `lastSendParts(row) → SentencePart[]`, `sendByText(send) → string`, `sendDay(send) → string`, `shortLabel(iso) → string`, `rolesText(roles) → string`, `reasonText(reason) → string`, `hiddenPeople(n) → Line | null`, `footerLines(sender, workspace) → string[]`, `campaignPath(id, send?) → string`, `recordPath(record) → string`.

- [ ] **Step 1: Write the failing test**

Create `src/features/campaigns/campaignText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SentencePart } from '../segments/ruleSentence';
import {
  audienceParts,
  countsParts,
  footerLines,
  hiddenPeople,
  lastSendParts,
  NO_SKIPS,
  reasonText,
  recordPath,
  rolesText,
  segmentKindOf,
  sendByText,
  sendDay,
  shortLabel,
  skipLines,
  skippedTotal,
} from './campaignText';
import type { CampaignSend, Counts } from './campaignTypes';

const text = (parts: SentencePart[]) => parts.map((part) => part.text).join('');
const figures = (parts: SentencePart[]) => parts.filter((part) => part.numeric).map((part) => part.text);
const counts = (sent: number, skipped: Partial<Counts['skipped']>): Counts => {
  const all = { ...NO_SKIPS, ...skipped };
  return { reached: sent + skippedTotal(all), sent, skipped: all };
};
const SEND: CampaignSend = {
  id: 41,
  kind: 'manual',
  status: 'sent',
  migrated: false,
  sent_by: { id: 1, name: 'Alice' },
  rule: null,
  started_at: '2026-10-02T12:00:00Z',
  finished_at: '2026-10-02T12:01:00Z',
  subject: 'Hi',
  body: 'Hello',
  counts: counts(2, { unsubscribed: 1, failed: 1 }),
};

describe('campaign text (spec §2)', () => {
  it("reads §4's organisation kind and the segments contract's customer as the same kind", () => {
    expect(segmentKindOf('organization')).toBe('customer');
    expect(segmentKindOf('customer')).toBe('customer');
    expect(segmentKindOf('account')).toBe('account');
    expect(segmentKindOf('contact')).toBe('contact');
  });

  it('says whom a send emails and why the rest are skipped, the figures apart (spec §2.2)', () => {
    const parts = audienceParts({ reach: 212, skipped: { ...NO_SKIPS, unsubscribed: 14, recent_campaign: 9, already_received: 3 }, sample: [] });
    expect(text(parts)).toBe('Emails 212 people · Skips 14 unsubscribed · 9 emailed in the last 3 days · 3 already received it');
    expect(figures(parts)).toEqual(['212', '14', '9', '3']);
    expect(text(audienceParts({ reach: 1, skipped: NO_SKIPS, sample: [] }))).toBe('Emails 1 person');
    expect(text(audienceParts({ reach: 0, skipped: { ...NO_SKIPS, no_email: 2, over_limit: 1, failed: 0 }, sample: [] }))).toBe(
      'Emails 0 people · Skips 2 without an email · 1 over the limit of 500',
    );
  });

  it('lists the skips in the order the backend checks them, leaving out the zeros', () => {
    expect(skipLines({ ...NO_SKIPS, failed: 1, unsubscribed: 2 })).toEqual([
      { n: 2, text: 'unsubscribed' },
      { n: 1, text: "couldn't be delivered" },
    ]);
  });

  it("reads a row's last send: a migrated draft, never sent, sending, or its day and counts (spec §2.1)", () => {
    expect(text(lastSendParts({ needs_segment: true, last_send: null }))).toBe('Choose a segment to send');
    expect(text(lastSendParts({ needs_segment: false, last_send: null }))).toBe('Never sent');
    expect(text(lastSendParts({ needs_segment: false, last_send: { id: 45, finished_at: null, status: 'sending', counts: counts(0, {}) } }))).toBe('Sending…');
    const sent = lastSendParts({ needs_segment: false, last_send: { id: 41, finished_at: '2026-10-02T12:01:00Z', status: 'sent', counts: SEND.counts } });
    expect(text(sent)).toBe('2 Oct · 2 sent · 2 skipped');
    expect(figures(sent)).toEqual(['2', '2']);
    expect(text(countsParts(counts(6, {})))).toBe('6 sent · 0 skipped');
  });

  it('says who sent it: a person, a readable rule, an unreadable rule, or a migrated send (spec §2.3)', () => {
    expect(sendByText(SEND)).toBe('Sent by Alice');
    expect(sendByText({ ...SEND, sent_by: null, migrated: true })).toBe('Sent');
    expect(sendByText({ ...SEND, kind: 'rule', sent_by: null, rule: { id: 8, name: 'EMEA renewals' } })).toBe('From rule EMEA renewals');
    expect(sendByText({ ...SEND, kind: 'rule', sent_by: null, rule: { id: null, name: 'a rule' } })).toBe('From a rule');
    expect(sendDay(SEND)).toBe('2 Oct 2026');
    expect(sendDay({ ...SEND, finished_at: null })).toBe('2 Oct 2026');
    expect(shortLabel('2026-10-02T12:01:00Z')).toBe('2 Oct');
  });

  it('words roles, reasons, the hidden people and the footer', () => {
    expect(rolesText(['champion', 'decision_maker'])).toBe('Champion, Decision Maker');
    expect(reasonText('no_email')).toBe('No email address');
    expect(reasonText('recent_campaign')).toBe('Emailed in the last 3 days');
    expect(reasonText('')).toBe('');
    expect(hiddenPeople(0)).toBeNull();
    expect(hiddenPeople(1)).toEqual({ n: 1, text: "more person you can't open" });
    expect(hiddenPeople(3)).toEqual({ n: 3, text: "more people you can't open" });
    expect(footerLines('Alice', 'Acme Inc')).toEqual(['Alice, Acme Inc', 'Unsubscribe from these emails: link']);
    expect(recordPath({ kind: 'organization', id: 7, name: 'Pizza Hut' })).toBe('/organizations/7');
    expect(recordPath({ kind: 'account', id: 14, name: 'Pizza EMEA' })).toBe('/accounts/14');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 src/features/campaigns/campaignText.test.ts`
Expected: FAIL with "Failed to resolve import './campaignText'".

- [ ] **Step 3: Write the types**

Create `src/features/campaigns/campaignTypes.ts`:

```ts
// The Campaigns contract (spec 2026-10-04-campaigns-design.md §4), field for
// field. Every read is computed for the reader over what they may open.
import type { PersonRef, Sharing } from '../segments/segmentTypes';
import type { ContactRole } from '../surveys/surveyTypes';

export type { PersonRef, Sharing };
export type CampaignStatus = 'draft' | 'active' | 'archived';
export type SendStatus = 'sending' | 'sent';
export type SkipReason = 'unsubscribed' | 'no_email' | 'already_received' | 'recent_campaign' | 'over_limit' | 'failed';
export type Skipped = Record<SkipReason, number>;
/** §4 says `organization`; the segments contract stores `customer`. Both are
 *  read, and `segmentKindOf` maps them (Contract note 1). */
export type CampaignSegmentKind = 'organization' | 'customer' | 'account' | 'contact';
/** `id` is null for a reader who may not read the segment (Contract note 1). */
export type SegmentRef = { id: number | null; name: string; kind: CampaignSegmentKind } | null;

/** Frozen on a send. `reached` is everyone the segment reached, sent or skipped. */
export interface Counts {
  reached: number;
  sent: number;
  skipped: Skipped;
}

export interface LastSend {
  id: number;
  finished_at: string | null;
  status: SendStatus;
  counts: Counts;
}

/** GET /campaigns/: a row. `needs_segment` marks a migrated draft with no segment. */
export interface CampaignRow {
  id: number;
  name: string;
  status: CampaignStatus;
  segment: SegmentRef;
  roles: ContactRole[];
  owner: PersonRef;
  is_owner: boolean;
  sharing: Sharing;
  shared_with: PersonRef[];
  last_send: LastSend | null;
  needs_segment: boolean;
  updated_at: string;
}

/** GET/PATCH /campaigns/<id>/ and POST's 201. `legacy_recipients` are a
 *  migrated draft's hand-picked contacts the reader may open; the rest are
 *  `legacy_hidden`. `can_delete` is `is_owner` and no sends. */
export interface Campaign extends CampaignRow {
  subject: string;
  body: string;
  legacy_recipients: { id: number; name: string }[];
  legacy_hidden: number;
  can_delete: boolean;
}

/** A send's rule: `id` is null when the reader can't read it ("a rule"). */
export interface RuleRef {
  id: number | null;
  name: string;
}

/** One send, its subject and body frozen as they went out. */
export interface CampaignSend {
  id: number;
  kind: 'manual' | 'rule';
  status: SendStatus;
  migrated: boolean;
  sent_by: PersonRef | null;
  rule: RuleRef | null;
  started_at: string;
  finished_at: string | null;
  subject: string;
  body: string;
  counts: Counts;
}

export type DeliveryStatus = 'queued' | 'sent' | 'skipped';
export interface DeliveryRecord {
  kind: 'organization' | 'account';
  id: number;
  name: string;
}

/** Only for contacts the reader may open (spec §1.7). */
export interface Delivery {
  id: number;
  status: DeliveryStatus;
  reason: SkipReason | '';
  contact: { id: number; name: string };
  record: DeliveryRecord | null;
  sent_at: string | null;
}

/** GET /campaigns/<id>/audience/ (owner only): `sample` is the first 20 reachable. */
export interface Audience {
  reach: number;
  skipped: Skipped;
  sample: { id: number; name: string }[];
}

export interface Page<T> {
  results: T[];
  next: string | null;
}

export interface DeliveriesPage extends Page<Delivery> {
  hidden: number;
}

export type CampaignTab = 'mine' | 'shared';

/** POST /campaigns/ (and PATCH, partially). `shared_with` only with "people". */
export interface CampaignWrite {
  name: string;
  segment: number | null;
  roles: ContactRole[];
  subject: string;
  body: string;
  sharing: Sharing;
  shared_with?: number[];
}

/** PATCH: the write's fields, and archiving or unarchiving. */
export type CampaignPatch = Partial<CampaignWrite> & { status?: 'archived' | 'active' };

/** POST /campaigns/<id>/preview/: the draft's text travels too (Contract note 3). */
export interface PreviewRequest {
  contact?: number;
  subject?: string;
  body?: string;
}

export interface Preview {
  subject: string;
  body: string;
}

/** GET /campaigns/unsubscribe/<token>/. */
export interface PublicUnsubscribe {
  workspace: string;
}
```

- [ ] **Step 4: Write the options**

Create `src/features/campaigns/campaignOptions.ts`:

```ts
// Campaigns' limits, labels and the backend's own sentences (spec §1), so a
// client check and a server refusal read the same.
import type { CampaignStatus, SkipReason } from './campaignTypes';

export const NAME_MAX = 120;
export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
export const OWNED_MAX = 50;
export const PEOPLE_MAX = 500;
export const GAP_DAYS = 3;
export const LINK_DAYS = 365;
export const PREVIEW_DEBOUNCE_MS = 400;
export const SENDING_POLL_MS = 3000;
export const SAMPLE_MAX = 20;

export const MERGE_FIELDS = ['first_name', 'organisation', 'sender_name'] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export const MERGE_LABEL: Record<MergeField, string> = { first_name: 'first name', organisation: 'organisation', sender_name: 'sender name' };

export const STATUS_LABEL: Record<CampaignStatus, string> = { draft: 'Draft', active: 'Active', archived: 'Archived' };

/** The order a count of skips is read in (spec §2.2's example: unsubscribed,
 *  the 3-day gap, already received); `failed` happens later, at delivery. */
export const SKIP_ORDER: readonly SkipReason[] = ['unsubscribed', 'recent_campaign', 'already_received', 'no_email', 'over_limit', 'failed'];
/** After a figure: "14 unsubscribed". */
export const SKIP_WORDS: Record<SkipReason, string> = {
  unsubscribed: 'unsubscribed',
  recent_campaign: `emailed in the last ${GAP_DAYS} days`,
  already_received: 'already received it',
  no_email: 'without an email',
  over_limit: `over the limit of ${PEOPLE_MAX}`,
  failed: "couldn't be delivered",
};
/** On a delivery row, and the Reason select. */
export const REASON_LABEL: Record<SkipReason, string> = {
  unsubscribed: 'Unsubscribed',
  recent_campaign: `Emailed in the last ${GAP_DAYS} days`,
  already_received: 'Already received it',
  no_email: 'No email address',
  over_limit: `Over the limit of ${PEOPLE_MAX}`,
  failed: "Couldn't be delivered",
};

/** The backend's sentences (spec §1.4, §1.5, §1.7, §4). */
export const SAY = {
  MERGE: 'Use {first_name}, {organisation} or {sender_name}.',
  NOT_OWNER: "Only the campaign's owner can change it.",
  CAMPAIGN_SENT: 'Archive it instead: it has been sent.',
  EMAIL_NOT_SET_UP: "Email isn't set up for this workspace yet, so campaigns can't be sent.",
  ARCHIVED: 'This campaign is archived.',
  CHOOSE_SEGMENT: 'Choose a segment first.',
  NOBODY: 'Nobody in this segment can be emailed right now.',
  NO_CONTENT: 'Write a subject and a body first.',
  LIMIT: 'You can own at most 50 campaigns.',
} as const;

/** The client's own words where DRF would word it. */
export const CHECK = {
  NAME: 'Give the campaign a name.',
  SUBJECT: 'Write a subject line.',
  SUBJECT_LONG: `Keep the subject to ${SUBJECT_MAX} characters.`,
  BODY: 'Write the email.',
  BODY_LONG: `Keep the email to ${BODY_MAX} characters.`,
  ROLES: 'Choose at least one role.',
  PEOPLE: 'Choose at least one teammate.',
} as const;

export const SHARING_NOTE = 'Teammates see its sends, the people in them they may open, and a count of the rest. Only you can change it or send it.';
export const EXPLAINER =
  'A campaign emails your own words to the people in one of your segments. Every email carries an unsubscribe link, and nobody gets more than one campaign email every 3 days.';
```

- [ ] **Step 5: Write the text**

Create `src/features/campaigns/campaignText.ts`:

```ts
// Campaigns' sentences, as data: each figure apart from its words so the
// page can set it in DM Mono (Parts, Lines).
import { CONTACT_ROLES } from '../contacts/contactsParams';
import type { SentencePart } from '../segments/ruleSentence';
import type { SegmentKind } from '../segments/segmentTypes';
import type { ContactRole } from '../surveys/surveyTypes';
import { dayLabel, type Line } from '../surveys/surveyText';
import { REASON_LABEL, SKIP_ORDER, SKIP_WORDS } from './campaignOptions';
import type { CampaignRow, CampaignSegmentKind, CampaignSend, Counts, DeliveryRecord, Skipped, SkipReason } from './campaignTypes';

export const NO_SKIPS: Skipped = { unsubscribed: 0, no_email: 0, already_received: 0, recent_campaign: 0, over_limit: 0, failed: 0 };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const join = (text: string): SentencePart => ({ text, role: 'join' });
const figure = (n: number): SentencePart => ({ text: String(n), role: 'value', numeric: true });

/** Contract note 1. */
export function segmentKindOf(kind: CampaignSegmentKind): SegmentKind {
  return kind === 'organization' ? 'customer' : kind;
}

export function skippedTotal(skipped: Skipped): number {
  return SKIP_ORDER.reduce((sum, reason) => sum + (skipped[reason] ?? 0), 0);
}

/** The skips, counted and never named, in the backend's order. */
export function skipLines(skipped: Skipped): Line[] {
  return SKIP_ORDER.filter((reason) => (skipped[reason] ?? 0) > 0).map((reason) => ({ n: skipped[reason], text: SKIP_WORDS[reason] }));
}

/** "Emails 212 people · Skips 14 unsubscribed · 9 emailed in the last 3 days" (spec §2.2). */
export function audienceParts(audience: { reach: number; skipped: Skipped }): SentencePart[] {
  const parts: SentencePart[] = [join('Emails '), figure(audience.reach), join(` ${plural(audience.reach, 'person', 'people')}`)];
  skipLines(audience.skipped).forEach((line, index) => {
    parts.push(join(index === 0 ? ' · Skips ' : ' · '), figure(line.n), join(` ${line.text}`));
  });
  return parts;
}

/** "6 sent · 2 skipped". */
export function countsParts(counts: Counts): SentencePart[] {
  return [figure(counts.sent), join(' sent · '), figure(skippedTotal(counts.skipped)), join(' skipped')];
}

/** "2 Oct" (rows; headers keep the year). */
export function shortLabel(iso: string): string {
  return dayLabel(iso).replace(/ \d{4}$/, '');
}

/** A list row's last send (spec §2.1). */
export function lastSendParts(row: Pick<CampaignRow, 'needs_segment' | 'last_send'>): SentencePart[] {
  if (row.needs_segment) return [join('Choose a segment to send')];
  const last = row.last_send;
  if (!last) return [join('Never sent')];
  if (last.status === 'sending') return [join('Sending…')];
  return [...(last.finished_at ? [join(`${shortLabel(last.finished_at)} · `)] : []), ...countsParts(last.counts)];
}

/** "Sent by Alice", "From rule EMEA renewals", "From a rule" (Contract note 10). */
export function sendByText(send: Pick<CampaignSend, 'kind' | 'sent_by' | 'rule'>): string {
  if (send.kind === 'rule') {
    if (!send.rule || send.rule.id === null) return `From ${send.rule?.name ?? 'a rule'}`;
    return `From rule ${send.rule.name}`;
  }
  return send.sent_by ? `Sent by ${send.sent_by.name}` : 'Sent';
}

/** "2 Oct 2026": when it finished, or began while it is still sending. */
export function sendDay(send: Pick<CampaignSend, 'started_at' | 'finished_at'>): string {
  return dayLabel(send.finished_at ?? send.started_at);
}

export function rolesText(roles: readonly ContactRole[]): string {
  return roles.map((role) => CONTACT_ROLES.find((option) => option.value === role)?.label ?? role).join(', ');
}

export function reasonText(reason: SkipReason | ''): string {
  return reason ? REASON_LABEL[reason] : '';
}

/** "3 more people you can't open", or nothing. */
export function hiddenPeople(n: number): Line | null {
  if (n <= 0) return null;
  return { n, text: `more ${plural(n, 'person', 'people')} you can't open` };
}

/** The footer every email carries (spec §1.5), for the local preview; the
 *  dash line is drawn as a rule, not typed. */
export function footerLines(sender: string, workspace: string): string[] {
  return [`${sender}, ${workspace}`, 'Unsubscribe from these emails: link'];
}

export function campaignPath(id: number, send?: number): string {
  return send ? `/campaigns/${id}?send=${send}` : `/campaigns/${id}`;
}

export function recordPath(record: DeliveryRecord): string {
  return record.kind === 'account' ? `/accounts/${record.id}` : `/organizations/${record.id}`;
}
```

- [ ] **Step 6: Run the test to see it pass**

Run: `npx vitest run --maxWorkers=2 src/features/campaigns/campaignText.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/campaigns`
Expected: no output.

```bash
git add src/features/campaigns/campaignTypes.ts src/features/campaigns/campaignOptions.ts src/features/campaigns/campaignText.ts src/features/campaigns/campaignText.test.ts
git commit -m "$(cat <<'EOF'
feat(campaigns): contract types, options and display text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The API, refusals, URL state, and the contract stub

Spec §4 (every endpoint), §1.3 (who is skipped, in order), §1.4 (refusals before the claim), §1.5 (rendering), §1.6 (unsubscribe), §1.7 (owner only, 404 for unreadable, twice-filtered deliveries); Contract notes 3, 5–9.

**Files:**
- Create: `src/features/campaigns/campaignErrors.ts`, `src/features/campaigns/campaignParams.ts`, `src/features/campaigns/campaignApi.ts`, `src/features/campaigns/testCampaignFixtures.ts`, `src/features/campaigns/testCampaigns.ts`
- Test: `src/features/campaigns/campaignErrors.test.ts`, `src/features/campaigns/campaignParams.test.ts`, `src/features/campaigns/campaignApi.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `SAY`, `NO_SKIPS`, `skippedTotal`, `segmentKindOf`; `apiFetch`, `ApiError` (`lib/apiClient`); `THROTTLED` (`features/surveys/surveyErrors`); `ME`, `CARL`, `DANA`, `TEAM`, `SEGMENTS` (`features/segments/testSegments`); `stubPlans`, `PlansStub` (`features/plans/testPlans`); `RulesStub` (`features/rules/testRules`); `requestsOf` (`features/surveys/testSurveys`).
- Produces:
  - `campaignErrors.ts`: `CAMPAIGN_FIELDS`, `CampaignField`, `CampaignErrors = Partial<Record<CampaignField | 'form', string>>`, `MISSING`, `campaignErrors(err, fallback?) → CampaignErrors`, `hasErrors(errors) → boolean`, `SendRefusal = { at: 'send'; message: string } | { at: 'form'; errors: CampaignErrors }`, `sendRefusal(err) → SendRefusal`.
  - `campaignParams.ts`: `campaignsTab(search) → CampaignTab`, `withTab(search, tab)`, `showArchived(search) → boolean`, `withArchived(search, on)`, `openSendOf(search) → number | null`, `withOpenSend(search, id | null)`, `DeliveryShow = 'all' | 'sent' | 'skipped'`, `listQuery(tab, archived, cursor) → string`, `deliveryQuery(show, reason, cursor) → string`.
  - `campaignApi.ts`: `CAMPAIGNS_PATH`, `fetchCampaigns(tab, archived, cursor)`, `fetchAllMine()`, `fetchCampaign(id)`, `createCampaign(body)`, `updateCampaign(id, patch)`, `deleteCampaign(id)`, `fetchAudience(id)`, `previewCampaign(id, body)`, `fetchSends(id, cursor)`, `sendCampaign(id)`, `fetchCampaignSend(id, sendId)`, `fetchDeliveries(id, sendId, show, reason, cursor)`, `fetchUnsubscribe(token)`, `confirmUnsubscribe(token)`.
  - `testCampaignFixtures.ts`: `NOW`, `WORKSPACE`, segment refs `RENEWAL_REF` (7), `EMEA_REF` (8), `CHAMPIONS_REF` (9); `StoredCampaign`, `StoredSend`, `StoredDelivery`, `Person`; campaigns `WIN_BACK` (11, mine, active, workspace), `CHAMPION_NEWS` (12, mine, draft, contacts), `OLD_DRAFT` (13, "Spring offer", migrated draft, no segment), `CARL_NEWS` (14, "EMEA newsletter", Carl's, shared with me), `DANA_CAMPAIGN` (15, unreadable), `OLD_PROMO` (16, mine, archived), `CAMPAIGNS`; sends `WIN_BACK_SEND` (41), `CARL_RULE_SEND` (42), `CARL_MIGRATED_SEND` (43), `OLD_PROMO_SEND` (44), `SENDS`, `SENDING_SEND` (45, not in `SENDS`); `DELIVERIES`; `SEGMENT_PEOPLE`; `UNSUBSCRIBED`; `counts(sent, skipped)`; `campaignRef(id)`, `campaignUsable(id, kind)`.
  - `testCampaigns.ts`: `stubCampaigns(stub?: CampaignsStub) → { spy, tokensOf(sendId) → { contact: number; token: string }[], addPerson(segmentId, person), runNight(ruleId) }`; new campaigns are 100+, sends 500+, deliveries 5000+.

- [ ] **Step 1: Write the failing tests**

Create `src/features/campaigns/campaignErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { campaignErrors, MISSING, sendRefusal } from './campaignErrors';

const refused = (status: number, body: unknown) => new ApiError(status, body, 'Request failed');

describe('campaign refusals (spec §2.2)', () => {
  it('puts a field refusal at its field and anything else above the form', () => {
    expect(campaignErrors(refused(400, { body: ['Use {first_name}, {organisation} or {sender_name}.'], name: ['This field may not be blank.'] }))).toEqual({
      body: 'Use {first_name}, {organisation} or {sender_name}.',
      name: 'This field may not be blank.',
    });
    expect(campaignErrors(refused(400, { non_field_errors: ['You can own at most 50 campaigns.'] }))).toEqual({ form: 'You can own at most 50 campaigns.' });
    expect(campaignErrors(refused(403, { detail: "Only the campaign's owner can change it." }))).toEqual({ form: "Only the campaign's owner can change it." });
    expect(campaignErrors(refused(404, { detail: 'Not found.' }))).toEqual({ form: MISSING });
    expect(campaignErrors(new Error('offline'))).toEqual({ form: 'Could not save this campaign. Try again.' });
  });

  it("keeps a send's form-less refusal at the Send button and a field's at the form (Contract note 8)", () => {
    expect(sendRefusal(refused(400, { detail: "Email isn't set up for this workspace yet, so campaigns can't be sent." }))).toEqual({
      at: 'send',
      message: "Email isn't set up for this workspace yet, so campaigns can't be sent.",
    });
    expect(sendRefusal(refused(400, { roles: ['Choose at least one role.'] }))).toEqual({ at: 'form', errors: { roles: 'Choose at least one role.' } });
    expect(sendRefusal(new Error('offline'))).toEqual({ at: 'send', message: 'Could not send it. Try again.' });
  });
});
```

Create `src/features/campaigns/campaignParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { campaignsTab, deliveryQuery, listQuery, openSendOf, showArchived, withArchived, withOpenSend, withTab } from './campaignParams';

const at = (query: string) => new URLSearchParams(query);

describe('campaign URL state (Decisions 3, 7, 8)', () => {
  it('reads Mine unless ?tab=shared, and archived only as 1', () => {
    expect(campaignsTab(at(''))).toBe('mine');
    expect(campaignsTab(at('tab=shared'))).toBe('shared');
    expect(campaignsTab(at('tab=nonsense'))).toBe('mine');
    expect(showArchived(at('archived=1'))).toBe(true);
    expect(showArchived(at('archived=yes'))).toBe(false);
    expect(withTab(at('tab=shared&archived=1'), 'mine').toString()).toBe('archived=1');
    expect(withArchived(at('tab=shared'), true).toString()).toBe('tab=shared&archived=1');
    expect(withArchived(at('archived=1'), false).toString()).toBe('');
  });

  it('reads and writes the open send', () => {
    expect(openSendOf(at('send=41'))).toBe(41);
    expect(openSendOf(at('send=x'))).toBeNull();
    expect(withOpenSend(at(''), 41).toString()).toBe('send=41');
    expect(withOpenSend(at('send=41'), null).toString()).toBe('');
  });

  it('builds the list and deliveries queries, a reason only with Skipped', () => {
    expect(listQuery('mine', false, null)).toBe('tab=mine');
    expect(listQuery('shared', true, 'abc')).toBe('tab=shared&archived=1&cursor=abc');
    expect(deliveryQuery('all', 'unsubscribed', null)).toBe('');
    expect(deliveryQuery('sent', 'unsubscribed', null)).toBe('status=sent');
    expect(deliveryQuery('skipped', 'unsubscribed', 'c2')).toBe('status=skipped&reason=unsubscribed&cursor=c2');
  });
});
```

Create `src/features/campaigns/campaignApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { requestsOf } from '../surveys/testSurveys';
import {
  confirmUnsubscribe,
  createCampaign,
  deleteCampaign,
  fetchAllMine,
  fetchAudience,
  fetchCampaign,
  fetchCampaigns,
  fetchDeliveries,
  fetchSends,
  fetchUnsubscribe,
  previewCampaign,
  sendCampaign,
  updateCampaign,
} from './campaignApi';
import { SAY } from './campaignOptions';
import { stubCampaigns } from './testCampaigns';

const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('expected a refusal');
};

describe('the campaigns API against the contract stub (spec §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists Mine and Shared with me, newest first, archived only when asked', async () => {
    stubCampaigns();
    expect((await fetchCampaigns('mine', false, null)).results.map((row) => row.name)).toEqual(['Champion news', 'Win-back', 'Spring offer']);
    expect((await fetchCampaigns('mine', true, null)).results.map((row) => row.name)).toEqual(['Champion news', 'Win-back', 'Spring offer', 'Old promo']);
    expect((await fetchCampaigns('shared', false, null)).results.map((row) => row.name)).toEqual(['EMEA newsletter']);
    expect((await fetchAllMine()).map((row) => row.id)).toEqual([12, 11, 13]);
  });

  it('reads one campaign, and 404s one the reader may not read', async () => {
    stubCampaigns();
    const migrated = await fetchCampaign(13);
    expect(migrated).toMatchObject({ needs_segment: true, legacy_recipients: [{ id: 41, name: 'Lukas Vermeer' }], legacy_hidden: 1, can_delete: true });
    expect((await refusal(fetchCampaign(15))).status).toBe(404);
  });

  it('creates, refuses an unknown merge field at its field, archives, and refuses to delete a sent campaign', async () => {
    const { spy } = stubCampaigns();
    const made = await createCampaign({ name: 'Hello', segment: 9, roles: [], subject: 'Hi {first_name}', body: 'Hello', sharing: 'private' });
    expect(made).toMatchObject({ id: 100, status: 'draft', segment: { id: 9, kind: 'contact' }, is_owner: true });
    expect((await refusal(updateCampaign(100, { body: 'Hi {nickname}' }))).body).toEqual({ body: [SAY.MERGE] });
    expect((await updateCampaign(11, { status: 'archived' })).status).toBe('archived');
    const sent = await refusal(deleteCampaign(11));
    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({ code: 'CAMPAIGN_SENT', detail: SAY.CAMPAIGN_SENT });
    expect(await deleteCampaign(12)).toBeNull();
    expect(requestsOf(spy, 'DELETE', /^\/campaigns\/12\/$/)).toHaveLength(1);
  });

  it("answers audience and preview for the owner only, the draft's text rendered for one person", async () => {
    stubCampaigns();
    const audience = await fetchAudience(12);
    expect(audience).toEqual({ reach: 3, skipped: expect.objectContaining({ no_email: 1 }), sample: [{ id: 61, name: 'Rosa Diaz' }, { id: 62, name: 'Tom Hale' }] });
    const preview = await previewCampaign(12, { contact: 62, subject: 'For {first_name}', body: 'Hello {first_name} at {organisation}' });
    expect(preview.subject).toBe('For Tom');
    expect(preview.body).toContain('Hello Tom at Initech');
    expect(preview.body).toContain('Unsubscribe from these emails:');
    expect((await refusal(fetchAudience(14))).body).toEqual({ detail: SAY.NOT_OWNER });
  });

  it('sends to the segment, skipping in order, and lists only the deliveries the reader may open', async () => {
    stubCampaigns();
    const send = await sendCampaign(12);
    expect(send).toMatchObject({ id: 500, kind: 'manual', status: 'sent', counts: { reached: 4, sent: 3, skipped: expect.objectContaining({ no_email: 1 }) } });
    expect((await fetchSends(12, null)).results.map((row) => row.id)).toEqual([500]);
    const page = await fetchDeliveries(12, 500, 'all', '', null);
    expect(page.results.map((row) => [row.contact.name, row.status, row.reason])).toEqual([
      ['Rosa Diaz', 'sent', ''],
      ['Tom Hale', 'sent', ''],
      ['Ivy Chen', 'skipped', 'no_email'],
    ]);
    expect(page.hidden).toBe(1);
    expect((await fetchDeliveries(12, 500, 'skipped', 'no_email', null)).results.map((row) => row.contact.name)).toEqual(['Ivy Chen']);
  });

  it('refuses a send without email set up, an archived one, an empty one, and one that reaches nobody, each as a detail', async () => {
    stubCampaigns({ noEmail: true });
    expect((await refusal(sendCampaign(12))).body).toEqual({ detail: SAY.EMAIL_NOT_SET_UP });
    vi.unstubAllGlobals();
    stubCampaigns();
    expect((await refusal(sendCampaign(16))).body).toEqual({ detail: SAY.ARCHIVED });
    const blank = await createCampaign({ name: 'Blank', segment: 9, roles: [], subject: '', body: '', sharing: 'private' });
    expect((await refusal(sendCampaign(blank.id))).body).toEqual({ detail: SAY.NO_CONTENT });
    await sendCampaign(12);
    expect((await refusal(sendCampaign(12))).body).toEqual({ detail: SAY.NOBODY });
  });

  it('opens an unsubscribe link without a session, records the opt-out once, and 404s a bad link', async () => {
    const { spy, tokensOf } = stubCampaigns();
    const send = await sendCampaign(12);
    const token = tokensOf(send.id).find((one) => one.contact === 61)?.token as string;
    expect(await fetchUnsubscribe(token)).toEqual({ workspace: 'Acme Inc' });
    expect(await confirmUnsubscribe(token)).toBeNull();
    expect(await confirmUnsubscribe(token)).toBeNull();
    const [read] = requestsOf(spy, 'GET', /^\/campaigns\/unsubscribe\//);
    expect(read).toBeDefined();
    const headers = (spy.mock.calls.find(([input]) => String(input).includes('/unsubscribe/'))?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect((await refusal(fetchUnsubscribe('nope'))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 src/features/campaigns/campaignErrors.test.ts src/features/campaigns/campaignParams.test.ts src/features/campaigns/campaignApi.test.ts`
Expected: FAIL with "Failed to resolve import" for each module.

- [ ] **Step 3: Write the refusals and the URL state**

Create `src/features/campaigns/campaignErrors.ts`:

```ts
// A refusal, put where its key points (spec §2.2: "field refusals appear at
// their fields"; "a refusal that belongs to no field takes focus").
import { ApiError } from '../../lib/apiClient';
import { THROTTLED } from '../surveys/surveyErrors';

export const CAMPAIGN_FIELDS = ['name', 'segment', 'roles', 'subject', 'body', 'sharing', 'shared_with', 'status'] as const;
export type CampaignField = (typeof CAMPAIGN_FIELDS)[number];
export type CampaignErrors = Partial<Record<CampaignField | 'form', string>>;

/** A 404: missing and not shared read the same (spec §1.7). */
export const MISSING = "This campaign doesn't exist or isn't shared with you.";
const SEND_FALLBACK = 'Could not send it. Try again.';

export function hasErrors(errors: CampaignErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function campaignErrors(err: unknown, fallback = 'Could not save this campaign. Try again.'): CampaignErrors {
  if (!(err instanceof ApiError)) return { form: fallback };
  if (err.status === 404) return { form: MISSING };
  const out: CampaignErrors = {};
  const body = err.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key === 'detail' && typeof value === 'string') {
        out.form = value;
        continue;
      }
      if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
      if ((CAMPAIGN_FIELDS as readonly string[]).includes(key)) out[key as CampaignField] = value[0];
      else out.form ??= value[0];
    }
  }
  if (!hasErrors(out) && err.status === 429) return { form: THROTTLED };
  return hasErrors(out) ? out : { form: fallback };
}

export type SendRefusal = { at: 'send'; message: string } | { at: 'form'; errors: CampaignErrors };

/** Contract note 8: a field goes back to the form; everything else stays at Send. */
export function sendRefusal(err: unknown): SendRefusal {
  const errors = campaignErrors(err, SEND_FALLBACK);
  const fields = Object.keys(errors).filter((key) => key !== 'form');
  return fields.length > 0 ? { at: 'form', errors } : { at: 'send', message: errors.form ?? SEND_FALLBACK };
}
```

Create `src/features/campaigns/campaignParams.ts`:

```ts
// The Campaigns pages' URL state (Decisions 3 and 7) and the queries they send.
import type { CampaignTab, SkipReason } from './campaignTypes';

export type DeliveryShow = 'all' | 'sent' | 'skipped';

export function campaignsTab(search: URLSearchParams): CampaignTab {
  return search.get('tab') === 'shared' ? 'shared' : 'mine';
}

export function withTab(search: URLSearchParams, tab: CampaignTab): URLSearchParams {
  const next = new URLSearchParams(search);
  if (tab === 'mine') next.delete('tab');
  else next.set('tab', tab);
  return next;
}

export function showArchived(search: URLSearchParams): boolean {
  return search.get('archived') === '1';
}

export function withArchived(search: URLSearchParams, on: boolean): URLSearchParams {
  const next = new URLSearchParams(search);
  if (on) next.set('archived', '1');
  else next.delete('archived');
  return next;
}

export function openSendOf(search: URLSearchParams): number | null {
  const value = search.get('send') ?? '';
  return /^\d+$/.test(value) ? Number(value) : null;
}

export function withOpenSend(search: URLSearchParams, id: number | null): URLSearchParams {
  const next = new URLSearchParams(search);
  if (id === null) next.delete('send');
  else next.set('send', String(id));
  return next;
}

export function listQuery(tab: CampaignTab, archived: boolean, cursor: string | null): string {
  const query = new URLSearchParams({ tab });
  if (archived) query.set('archived', '1');
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}

/** A reason travels only with Skipped (Decision 8). */
export function deliveryQuery(show: DeliveryShow, reason: SkipReason | '', cursor: string | null): string {
  const query = new URLSearchParams();
  if (show !== 'all') query.set('status', show);
  if (show === 'skipped' && reason) query.set('reason', reason);
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}
```

- [ ] **Step 4: Write the API**

Create `src/features/campaigns/campaignApi.ts`:

```ts
// Thin apiFetch wrappers over revenact-backend's /api/v1/campaigns/ (spec §4)
// and the public unsubscribe pair, sent without a session.
import { apiFetch } from '../../lib/apiClient';
import { deliveryQuery, listQuery, type DeliveryShow } from './campaignParams';
import type {
  Audience,
  Campaign,
  CampaignPatch,
  CampaignRow,
  CampaignSend,
  CampaignTab,
  CampaignWrite,
  DeliveriesPage,
  Page,
  Preview,
  PreviewRequest,
  PublicUnsubscribe,
  SkipReason,
} from './campaignTypes';

export const CAMPAIGNS_PATH = '/campaigns/';
const one = (id: number) => `${CAMPAIGNS_PATH}${id}/`;
const withQuery = (path: string, query: string) => (query ? `${path}?${query}` : path);

export function fetchCampaigns(tab: CampaignTab, archived: boolean, cursor: string | null): Promise<Page<CampaignRow>> {
  return apiFetch<Page<CampaignRow>>(withQuery(CAMPAIGNS_PATH, listQuery(tab, archived, cursor)));
}

/** Every page of mine, archived left out: the rule picker's campaigns (Contract note 17). */
export async function fetchAllMine(): Promise<CampaignRow[]> {
  const rows: CampaignRow[] = [];
  let cursor: string | null = null;
  do {
    const page: Page<CampaignRow> = await fetchCampaigns('mine', false, cursor);
    rows.push(...page.results);
    cursor = page.next;
  } while (cursor);
  return rows;
}

export function fetchCampaign(id: number): Promise<Campaign> {
  return apiFetch<Campaign>(one(id));
}

export function createCampaign(body: CampaignWrite): Promise<Campaign> {
  return apiFetch<Campaign>(CAMPAIGNS_PATH, { method: 'POST', body });
}

/** Owner only. `status: 'archived'` archives; `'active'` unarchives. */
export function updateCampaign(id: number, body: CampaignPatch): Promise<Campaign> {
  return apiFetch<Campaign>(one(id), { method: 'PATCH', body });
}

/** Owner only; 409 CAMPAIGN_SENT once it has sends. */
export function deleteCampaign(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

export function fetchAudience(id: number): Promise<Audience> {
  return apiFetch<Audience>(`${one(id)}audience/`);
}

export function previewCampaign(id: number, body: PreviewRequest): Promise<Preview> {
  return apiFetch<Preview>(`${one(id)}preview/`, { method: 'POST', body });
}

export function fetchSends(id: number, cursor: string | null): Promise<Page<CampaignSend>> {
  return apiFetch<Page<CampaignSend>>(withQuery(`${one(id)}sends/`, cursor ? new URLSearchParams({ cursor }).toString() : ''));
}

/** Send now: the whole segment, as the owner (201). */
export function sendCampaign(id: number): Promise<CampaignSend> {
  return apiFetch<CampaignSend>(`${one(id)}sends/`, { method: 'POST' });
}

export function fetchCampaignSend(id: number, sendId: number): Promise<CampaignSend> {
  return apiFetch<CampaignSend>(`${one(id)}sends/${sendId}/`);
}

export function fetchDeliveries(id: number, sendId: number, show: DeliveryShow, reason: SkipReason | '', cursor: string | null): Promise<DeliveriesPage> {
  return apiFetch<DeliveriesPage>(withQuery(`${one(id)}sends/${sendId}/deliveries/`, deliveryQuery(show, reason, cursor)));
}

/** The public link carries no session: no token, and a 401 never signs anyone out. */
const NO_SESSION = { accessToken: null, skipAuthRetry: true } as const;
const link = (token: string) => `${CAMPAIGNS_PATH}unsubscribe/${encodeURIComponent(token)}/`;

export function fetchUnsubscribe(token: string): Promise<PublicUnsubscribe> {
  return apiFetch<PublicUnsubscribe>(link(token), NO_SESSION);
}

/** 204, also for someone already unsubscribed; 404 for any bad link. */
export function confirmUnsubscribe(token: string): Promise<null> {
  return apiFetch<null>(link(token), { ...NO_SESSION, method: 'POST' });
}
```

- [ ] **Step 5: Write the fixtures**

Create `src/features/campaigns/testCampaignFixtures.ts`:

```ts
// Test-only: campaigns, sends, deliveries and the people each segment
// reaches, in the contract's shapes (spec §4). Kept apart from the stub so
// the Rules stub can read campaign refs without importing stubCampaigns
// (which wraps it). The viewer is ME (Alice, id 1) of "Acme Inc".
import type { SegmentKind } from '../segments/segmentTypes';
import { CARL, DANA, ME } from '../segments/testSegments';
import { NO_SKIPS, segmentKindOf, skippedTotal } from './campaignText';
import type { Campaign, CampaignSend, Counts, Delivery, Skipped } from './campaignTypes';

export const NOW = '2026-10-04T12:00:00Z';
export const WORKSPACE = 'Acme Inc';
export const RENEWAL_REF = { id: 7, name: 'Renewal risk', kind: 'organization' as const };
export const EMEA_REF = { id: 8, name: 'EMEA accounts', kind: 'account' as const };
export const CHAMPIONS_REF = { id: 9, name: 'Champions', kind: 'contact' as const };

/** A campaign as the stub keeps it; the row fields are computed per read. */
export interface StoredCampaign extends Omit<Campaign, 'last_send' | 'needs_segment' | 'legacy_recipients' | 'legacy_hidden' | 'can_delete'> {
  legacy: { id: number; name: string; visible: boolean }[];
}
export interface StoredSend extends CampaignSend {
  campaign: number;
}
/** `visible`: ME may open the contact. The backend stores only a token's
 *  hash; the stub keeps the token so a test can open /u/:token. */
export interface StoredDelivery extends Delivery {
  send: number;
  visible: boolean;
  token: string | null;
}
export interface Person {
  contact: { id: number; name: string };
  record: Delivery['record'];
  email: boolean;
  visible: boolean;
}

export function counts(sent: number, skipped: Partial<Skipped>): Counts {
  const all = { ...NO_SKIPS, ...skipped };
  return { reached: sent + skippedTotal(all), sent, skipped: all };
}

const BASE: Pick<StoredCampaign, 'roles' | 'shared_with' | 'legacy' | 'subject' | 'body' | 'updated_at'> = {
  roles: [],
  shared_with: [],
  legacy: [],
  subject: '',
  body: '',
  updated_at: '2026-10-03T12:00:00Z',
};

/** Mine, active, shared with the workspace; sent once on 2 Oct. */
export const WIN_BACK: StoredCampaign = {
  ...BASE,
  id: 11,
  name: 'Win-back',
  status: 'active',
  segment: RENEWAL_REF,
  roles: ['champion', 'decision_maker'],
  owner: ME,
  is_owner: true,
  sharing: 'workspace',
  shared_with: [],
  legacy: [],
  subject: 'Checking in, {first_name}',
  body: 'Hi {first_name},\n\nCould we find 20 minutes with {organisation} next week?\n\n{sender_name}',
  updated_at: '2026-10-02T12:05:00Z',
};
/** Mine, a draft to the Champions contact segment. */
export const CHAMPION_NEWS: StoredCampaign = {
  ...BASE,
  id: 12,
  name: 'Champion news',
  status: 'draft',
  segment: CHAMPIONS_REF,
  owner: ME,
  is_owner: true,
  sharing: 'private',
  shared_with: [],
  roles: [],
  legacy: [],
  subject: 'News for {first_name}',
  body: 'Hello {first_name}, we have news.',
};
/** Mine, migrated: hand-picked recipients, no segment yet (spec §2.3). */
export const OLD_DRAFT: StoredCampaign = {
  ...BASE,
  id: 13,
  name: 'Spring offer',
  status: 'draft',
  segment: null,
  owner: ME,
  is_owner: true,
  sharing: 'private',
  shared_with: [],
  roles: [],
  legacy: [
    { id: 41, name: 'Lukas Vermeer', visible: true },
    { id: 99, name: 'Hidden Person', visible: false },
  ],
  subject: 'Spring offer',
  body: 'Hello',
  updated_at: '2026-09-20T12:00:00Z',
};
/** Carl's, shared with me by name: a rule send and a migrated one. */
export const CARL_NEWS: StoredCampaign = {
  ...BASE,
  id: 14,
  name: 'EMEA newsletter',
  status: 'active',
  segment: EMEA_REF,
  roles: ['champion'],
  owner: CARL,
  is_owner: false,
  sharing: 'people',
  shared_with: [ME],
  legacy: [],
  subject: 'EMEA news',
  body: 'Hello {first_name}',
};
/** Dana's, private: unreadable, so a 404 like a missing id. */
export const DANA_CAMPAIGN: StoredCampaign = { ...BASE, id: 15, name: "Dana's campaign", status: 'draft', segment: null, owner: DANA, is_owner: false, sharing: 'private', shared_with: [], roles: [], legacy: [] };
/** Mine, archived, sent once. */
export const OLD_PROMO: StoredCampaign = {
  ...BASE,
  id: 16,
  name: 'Old promo',
  status: 'archived',
  segment: RENEWAL_REF,
  roles: ['champion'],
  owner: ME,
  is_owner: true,
  sharing: 'private',
  shared_with: [],
  legacy: [],
  subject: 'Promo',
  body: 'Hello',
  updated_at: '2026-09-16T12:00:00Z',
};
export const CAMPAIGNS: StoredCampaign[] = [WIN_BACK, CHAMPION_NEWS, OLD_DRAFT, CARL_NEWS, DANA_CAMPAIGN, OLD_PROMO];

const sendBase = { kind: 'manual' as const, status: 'sent' as const, migrated: false, rule: null, subject: 'Hi', body: 'Hello' };
export const WIN_BACK_SEND: StoredSend = {
  ...sendBase,
  id: 41,
  campaign: 11,
  sent_by: ME,
  started_at: '2026-10-02T12:00:00Z',
  finished_at: '2026-10-02T12:01:00Z',
  subject: WIN_BACK.subject,
  body: WIN_BACK.body,
  counts: counts(2, { unsubscribed: 1, failed: 1 }),
};
export const CARL_RULE_SEND: StoredSend = {
  ...sendBase,
  id: 42,
  campaign: 14,
  kind: 'rule',
  sent_by: null,
  rule: { id: 8, name: 'EMEA renewals' },
  started_at: '2026-09-28T12:00:00Z',
  finished_at: '2026-09-28T12:01:00Z',
  counts: counts(2, { recent_campaign: 1 }),
};
export const CARL_MIGRATED_SEND: StoredSend = {
  ...sendBase,
  id: 43,
  campaign: 14,
  migrated: true,
  sent_by: null,
  started_at: '2026-09-01T12:00:00Z',
  finished_at: '2026-09-01T12:00:00Z',
  counts: counts(5, { failed: 1 }),
};
export const OLD_PROMO_SEND: StoredSend = { ...sendBase, id: 44, campaign: 16, sent_by: ME, started_at: '2026-09-15T12:00:00Z', finished_at: '2026-09-15T12:01:00Z', counts: counts(4, {}) };
export const SENDS: StoredSend[] = [WIN_BACK_SEND, CARL_RULE_SEND, CARL_MIGRATED_SEND, OLD_PROMO_SEND];
/** Win-back, still going out (not in SENDS; pass it in to test polling). */
export const SENDING_SEND: StoredSend = { ...sendBase, id: 45, campaign: 11, status: 'sending', sent_by: ME, started_at: NOW, finished_at: null, counts: counts(1, {}) };

const GLOBEX = { kind: 'organization' as const, id: 1, name: 'Globex' };
const INITECH = { kind: 'organization' as const, id: 2, name: 'Initech' };
const PIZZA = { kind: 'organization' as const, id: 7, name: 'Pizza Hut' };
const PIZZA_EMEA = { kind: 'account' as const, id: 14, name: 'Pizza EMEA' };
const person = (id: number, name: string, record: Person['record'], extra: Partial<Person> = {}): Person => ({ contact: { id, name }, record, email: true, visible: true, ...extra });

/** Whom each segment reaches, before the skips (spec §1.3). */
export const SEGMENT_PEOPLE: Record<number, Person[]> = {
  7: [person(51, 'Sam Patel', GLOBEX), person(52, 'Lee Wong', INITECH), person(53, 'Kim Lee', PIZZA), person(54, 'Ana Ruiz', GLOBEX)],
  8: [person(71, 'Pia Holm', PIZZA_EMEA), person(72, 'Ola Berg', PIZZA_EMEA, { visible: false })],
  9: [person(61, 'Rosa Diaz', PIZZA), person(62, 'Tom Hale', INITECH), person(63, 'Ivy Chen', GLOBEX, { email: false }), person(64, 'Ben Ode', INITECH, { visible: false })],
};
/** Contacts already unsubscribed from campaigns. */
export const UNSUBSCRIBED: number[] = [54];

const delivery = (id: number, send: number, who: Person, status: Delivery['status'], reason: Delivery['reason'], sentAt: string | null, token: string | null = null): StoredDelivery => ({
  id,
  send,
  status,
  reason,
  contact: who.contact,
  record: who.record,
  sent_at: sentAt,
  visible: who.visible,
  token,
});
const [SAM, LEE, KIM, ANA] = SEGMENT_PEOPLE[7];
const [PIA, OLA] = SEGMENT_PEOPLE[8];
export const DELIVERIES: StoredDelivery[] = [
  delivery(401, 41, SAM, 'sent', '', '2026-10-02T12:00:30Z', 'tok-41-51'),
  delivery(402, 41, LEE, 'sent', '', '2026-10-02T12:00:40Z', 'tok-41-52'),
  delivery(403, 41, KIM, 'skipped', 'failed', null),
  delivery(404, 41, ANA, 'skipped', 'unsubscribed', null),
  delivery(405, 42, PIA, 'sent', '', '2026-09-28T12:00:30Z', 'tok-42-71'),
  delivery(406, 42, OLA, 'sent', '', '2026-09-28T12:00:40Z', 'tok-42-72'),
  delivery(407, 42, person(73, 'Eva Lind', PIZZA_EMEA), 'skipped', 'recent_campaign', null),
];

/** For the Rules stub: a campaign ref, or null. */
export function campaignRef(id: number): { id: number; name: string } | null {
  const found = CAMPAIGNS.find((campaign) => campaign.id === id);
  return found ? { id: found.id, name: found.name } : null;
}

/** §1.8's validation: mine, not archived, a segment of the rule's kind. */
export function campaignUsable(id: number, kind: SegmentKind | null): boolean {
  const found = CAMPAIGNS.find((campaign) => campaign.id === id);
  return Boolean(found && found.is_owner && found.status !== 'archived' && found.segment && segmentKindOf(found.segment.kind) === kind);
}
```

- [ ] **Step 6: Write the stub**

Create `src/features/campaigns/testCampaigns.ts`:

```ts
// Test-only: one fetch stub for every endpoint the Campaigns pages, the
// unsubscribe page and a rule's campaign read (spec §4). It keeps state: a
// send resolves the segment, skips in §1.3's order and makes tokens; an
// unsubscribe marks the contact. Paths it does not own fall through to
// stubPlans (then stubRules, stubSurveys, stubSegments).
import { vi } from 'vitest';
import { stubPlans, type PlansStub } from '../plans/testPlans';
import type { RulesStub } from '../rules/testRules';
import type { PersonRef } from '../segments/segmentTypes';
import { ME, SEGMENTS, TEAM } from '../segments/testSegments';
import { GAP_DAYS, MERGE_FIELDS, NAME_MAX, PEOPLE_MAX, SAY } from './campaignOptions';
import { NO_SKIPS, skippedTotal } from './campaignText';
import type { Audience, Campaign, CampaignRow, CampaignSend, Delivery, SegmentRef, SkipReason } from './campaignTypes';
import {
  CAMPAIGNS,
  DELIVERIES,
  NOW,
  SEGMENT_PEOPLE,
  SENDS,
  UNSUBSCRIBED,
  WORKSPACE,
  type Person,
  type StoredCampaign,
  type StoredDelivery,
  type StoredSend,
} from './testCampaignFixtures';

type Answer = { status: number; body: unknown };

export interface CampaignsStub {
  campaigns?: StoredCampaign[];
  sends?: StoredSend[];
  deliveries?: StoredDelivery[];
  people?: Record<number, Person[]>;
  unsubscribed?: number[];
  /** Rows a page holds: campaigns and deliveries default to 50, sends to 20 (Contract note 5). */
  pageSize?: number;
  /** How many list reads fail (500) before they succeed. */
  failList?: number;
  /** POST sends/ refuses with EMAIL_NOT_SET_UP, as a workspace without SMTP does. */
  noEmail?: boolean;
  /** GET reads of a `sending` send before it reads `sent`. */
  stillSending?: number;
  /** 400 once ME owns this many (default 50). */
  limit?: number;
  /** The public pair answers 429. */
  throttle?: boolean;
  /** POST preview/: an answer overrides the default; undefined falls through. */
  preview?: (id: number, body: Record<string, unknown>) => Answer | undefined;
  rules?: RulesStub;
  plans?: PlansStub;
}

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) });
const NOT_FOUND: Answer = { status: 404, body: { detail: 'Not found.' } };
const TOKEN = /\{([^{}]*)\}/g;
const unknownField = (text: string) => [...text.matchAll(TOKEN)].some((match) => !(MERGE_FIELDS as readonly string[]).includes(match[1]));
const teammates = (ids: unknown): PersonRef[] =>
  ((ids as number[] | undefined) ?? []).flatMap((id) => TEAM.filter((one) => one.id === id && one.is_active).map(({ id: pk, name }) => ({ id: pk, name })));
const daysBefore = (iso: string, days: number) => new Date(new Date(iso).getTime() - days * 86400000).toISOString();

export function stubCampaigns(stub: CampaignsStub = {}) {
  const campaigns = (stub.campaigns ?? CAMPAIGNS).map((one) => ({ ...one, legacy: [...one.legacy], shared_with: [...one.shared_with] }));
  const sends = (stub.sends ?? SENDS).map((one) => ({ ...one }));
  const deliveries = (stub.deliveries ?? DELIVERIES).map((one) => ({ ...one }));
  const people: Record<number, Person[]> = Object.fromEntries(Object.entries(stub.people ?? SEGMENT_PEOPLE).map(([id, list]) => [id, [...list]]));
  const unsubscribed = new Set(stub.unsubscribed ?? UNSUBSCRIBED);
  const pageSize = stub.pageSize ?? 50;
  const sendsPageSize = stub.pageSize ?? 20;
  const limit = stub.limit ?? 50;
  let listFailures = stub.failList ?? 0;
  const stillSending = new Map<number, number>();
  let nextCampaign = 100;
  let nextSend = 500;
  let nextDelivery = 5000;

  const readable = (one: StoredCampaign) => one.is_owner || one.sharing === 'workspace' || (one.sharing === 'people' && one.shared_with.some((p) => p.id === ME.id));
  const sendsOf = (id: number) => sends.filter((one) => one.campaign === id).sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id - a.id);
  const row = (one: StoredCampaign): CampaignRow => {
    const last = sendsOf(one.id)[0];
    return {
      id: one.id,
      name: one.name,
      status: one.status,
      segment: one.segment,
      roles: one.roles,
      owner: one.owner,
      is_owner: one.is_owner,
      sharing: one.sharing,
      shared_with: one.sharing === 'people' ? one.shared_with : [],
      last_send: last ? { id: last.id, finished_at: last.finished_at, status: last.status, counts: last.counts } : null,
      needs_segment: one.status === 'draft' && one.segment === null && one.legacy.length > 0,
      updated_at: one.updated_at,
    };
  };
  const payload = (one: StoredCampaign): Campaign => ({
    ...row(one),
    subject: one.subject,
    body: one.body,
    legacy_recipients: one.legacy.filter((p) => p.visible).map(({ id, name }) => ({ id, name })),
    legacy_hidden: one.legacy.filter((p) => !p.visible).length,
    can_delete: one.is_owner && sendsOf(one.id).length === 0,
  });
  const sendOut = ({ campaign: owner, ...rest }: StoredSend): CampaignSend => {
    void owner;
    return rest;
  };
  /** A cursor is base64 of the start index. */
  const paged = <T,>(items: T[], cursor: string | null, size = pageSize) => {
    const start = cursor ? Number(atob(cursor)) || 0 : 0;
    const next = start + size < items.length ? btoa(String(start + size)) : null;
    return { results: items.slice(start, start + size), next };
  };

  /** The segment as §4's ref: only ME's own (the backend's owned_segment). */
  const segmentRef = (id: unknown): SegmentRef | Answer => {
    const found = SEGMENTS.find((segment) => segment.id === id);
    if (!found) return NOT_FOUND;
    if (!found.is_owner) return { status: 400, body: { segment: ['Choose one of your own segments.'] } };
    return { id: found.id, name: found.name, kind: found.kind === 'customer' ? 'organization' : found.kind };
  };
  const isAnswer = (value: unknown): value is Answer => typeof value === 'object' && value !== null && 'status' in value && 'body' in value;

  /** The write serializer, in brief: checks, then stores what was sent. */
  const write = (one: StoredCampaign, data: Record<string, unknown>): Answer | null => {
    if ('name' in data) {
      const name = String(data.name ?? '').trim();
      if (!name) return { status: 400, body: { name: ['This field may not be blank.'] } };
      if (name.length > NAME_MAX) return { status: 400, body: { name: [`Ensure this field has no more than ${NAME_MAX} characters.`] } };
    }
    for (const key of ['subject', 'body'] as const) {
      if (key in data && unknownField(String(data[key] ?? ''))) return { status: 400, body: { [key]: [SAY.MERGE] } };
    }
    let segment = one.segment;
    if ('segment' in data) {
      if (data.segment === null) segment = null;
      else {
        const ref = segmentRef(data.segment);
        if (isAnswer(ref)) return ref;
        segment = ref;
      }
    }
    const roles = ('roles' in data ? data.roles : one.roles) as StoredCampaign['roles'];
    if (segment && segment.kind !== 'contact' && roles.length === 0) return { status: 400, body: { roles: ['Choose at least one role.'] } };
    const sharing = (data.sharing ?? one.sharing) as StoredCampaign['sharing'];
    const shared = 'shared_with' in data ? teammates(data.shared_with) : one.shared_with;
    if (sharing === 'people' && shared.length === 0) return { status: 400, body: { shared_with: ['Choose at least one teammate.'] } };
    if ('name' in data) one.name = String(data.name).trim();
    if ('subject' in data) one.subject = String(data.subject);
    if ('body' in data) one.body = String(data.body);
    one.segment = segment;
    one.roles = segment && segment.kind !== 'contact' ? roles : [];
    one.sharing = sharing;
    one.shared_with = sharing === 'people' ? shared : [];
    one.updated_at = NOW;
    return null;
  };

  /** §1.3: everyone the segment reaches, each skipped by the first rule that matches. */
  const resolve = (one: StoredCampaign) => {
    const queued: Person[] = [];
    const skipped: { who: Person; reason: SkipReason }[] = [];
    const since = daysBefore(NOW, GAP_DAYS);
    for (const who of one.segment && one.segment.id !== null ? (people[one.segment.id] ?? []) : []) {
      const sentTo = deliveries.filter((d) => d.contact.id === who.contact.id && d.status === 'sent');
      let reason: SkipReason | null = null;
      if (unsubscribed.has(who.contact.id)) reason = 'unsubscribed';
      else if (!who.email) reason = 'no_email';
      else if (sentTo.some((d) => sends.find((s) => s.id === d.send)?.campaign === one.id)) reason = 'already_received';
      else if (sentTo.some((d) => (d.sent_at ?? '') >= since)) reason = 'recent_campaign';
      else if (queued.length >= PEOPLE_MAX) reason = 'over_limit';
      if (reason) skipped.push({ who, reason });
      else queued.push(who);
    }
    return { queued, skipped };
  };
  const audienceOf = (one: StoredCampaign): Audience => {
    const { queued, skipped } = resolve(one);
    const tally = { ...NO_SKIPS };
    for (const { reason } of skipped) tally[reason] += 1;
    return { reach: queued.length, skipped: tally, sample: queued.filter((who) => who.visible).slice(0, 20).map((who) => who.contact) };
  };
  const render = (text: string, who: Person, owner: PersonRef) =>
    text
      .replace(/\{first_name\}/g, who.contact.name.split(' ')[0] || 'there')
      .replace(/\{organisation\}/g, who.record?.name ?? '')
      .replace(/\{sender_name\}/g, owner.name);

  /** §1.4: claim and deliver in one go; `stillSending` keeps it at sending for a few reads. */
  const claim = (one: StoredCampaign, extra: Pick<CampaignSend, 'kind' | 'sent_by' | 'rule'>): StoredSend => {
    const { queued, skipped } = resolve(one);
    const id = nextSend++;
    for (const who of queued) {
      deliveries.push({ id: nextDelivery++, send: id, status: 'sent', reason: '', contact: who.contact, record: who.record, sent_at: NOW, visible: who.visible, token: `tok-${id}-${who.contact.id}` });
    }
    for (const { who, reason } of skipped) {
      deliveries.push({ id: nextDelivery++, send: id, status: 'skipped', reason, contact: who.contact, record: who.record, sent_at: null, visible: who.visible, token: null });
    }
    const tally = { ...NO_SKIPS };
    for (const { reason } of skipped) tally[reason] += 1;
    const sending = (stub.stillSending ?? 0) > 0;
    if (sending) stillSending.set(id, stub.stillSending ?? 0);
    const made: StoredSend = {
      id,
      campaign: one.id,
      migrated: false,
      status: sending ? 'sending' : 'sent',
      started_at: NOW,
      finished_at: sending ? null : NOW,
      subject: one.subject,
      body: one.body,
      counts: { reached: queued.length + skippedTotal(tally), sent: queued.length, skipped: tally },
      ...extra,
    };
    sends.push(made);
    one.status = 'active';
    one.updated_at = NOW;
    return made;
  };

  // Task 13 adds `onCampaignApproved` to these rules options.
  const plans = stubPlans({ ...stub.plans, rules: { ...stub.rules } });

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    const link = /^\/campaigns\/unsubscribe\/([^/]+)\/$/.exec(path);
    if (link) {
      if (stub.throttle) return json(429, { detail: 'Request was throttled.' });
      const token = decodeURIComponent(link[1]);
      const found = deliveries.find((d) => d.token === token);
      if (!found) return reply(NOT_FOUND);
      if (method === 'GET') return json(200, { workspace: WORKSPACE });
      unsubscribed.add(found.contact.id);
      return json(204, null);
    }

    if (path === '/campaigns/' && method === 'GET') {
      if (listFailures > 0) {
        listFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      const tab = url.searchParams.get('tab') === 'shared' ? 'shared' : 'mine';
      const archived = url.searchParams.get('archived') === '1';
      const rows = campaigns
        .filter(readable)
        .filter((one) => (tab === 'mine' ? one.is_owner : !one.is_owner))
        .filter((one) => archived || one.status !== 'archived')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
        .map(row);
      return json(200, paged(rows, url.searchParams.get('cursor')));
    }
    if (path === '/campaigns/' && method === 'POST') {
      if (campaigns.filter((one) => one.is_owner).length >= limit) return json(400, { non_field_errors: [SAY.LIMIT] });
      const made: StoredCampaign = {
        id: 0, name: '', status: 'draft', segment: null, roles: [], owner: ME, is_owner: true, sharing: 'private', shared_with: [], legacy: [], subject: '', body: '', updated_at: NOW,
      };
      const refusal = write(made, { name: '', ...body });
      if (refusal) return reply(refusal);
      made.id = nextCampaign++;
      campaigns.push(made);
      return json(201, payload(made));
    }

    const found = /^\/campaigns\/(\d+)\/(.*)$/.exec(path);
    if (found) {
      const id = Number(found[1]);
      const rest = found[2];
      const one = campaigns.find((candidate) => candidate.id === id);
      // Unreadable reads the same as missing, on every sub-path.
      if (!one || !readable(one)) return reply(NOT_FOUND);
      const ownerOnly = !one.is_owner ? json(403, { detail: SAY.NOT_OWNER }) : null;
      if (rest === '' && method === 'GET') return json(200, payload(one));
      if (rest === '' && method === 'PATCH') {
        if (ownerOnly) return ownerOnly;
        const { status, ...fields } = body;
        const refusal = write(one, fields);
        if (refusal) return reply(refusal);
        if (status === 'archived') one.status = 'archived';
        if (status === 'active') one.status = sendsOf(one.id).length > 0 ? 'active' : 'draft';
        return json(200, payload(one));
      }
      if (rest === '' && method === 'DELETE') {
        if (ownerOnly) return ownerOnly;
        if (sendsOf(one.id).length > 0) return json(409, { code: 'CAMPAIGN_SENT', detail: SAY.CAMPAIGN_SENT });
        campaigns.splice(campaigns.indexOf(one), 1);
        return json(204, null);
      }
      if (rest === 'audience/' && method === 'GET') {
        if (ownerOnly) return ownerOnly;
        if (!one.segment) return json(400, { detail: SAY.CHOOSE_SEGMENT });
        return json(200, audienceOf(one));
      }
      if (rest === 'preview/' && method === 'POST') {
        if (ownerOnly) return ownerOnly;
        const override = stub.preview?.(id, body);
        if (override) return reply(override);
        const subject = typeof body.subject === 'string' ? body.subject : one.subject;
        const text = typeof body.body === 'string' ? body.body : one.body;
        if (unknownField(subject)) return json(400, { subject: [SAY.MERGE] });
        if (unknownField(text)) return json(400, { body: [SAY.MERGE] });
        const { queued } = resolve(one);
        const who = typeof body.contact === 'number' ? queued.find((p) => p.contact.id === body.contact) : queued[0];
        if (!who) return json(400, { detail: SAY.NOBODY });
        const footer = `\n\n—\n${one.owner.name}, ${WORKSPACE}\nUnsubscribe from these emails: https://app.revenact.example/u/preview`;
        return json(200, { subject: render(subject, who, one.owner), body: `${render(text, who, one.owner)}${footer}` });
      }
      if (rest === 'sends/' && method === 'GET') return json(200, paged(sendsOf(id).map(sendOut), url.searchParams.get('cursor'), sendsPageSize));
      if (rest === 'sends/' && method === 'POST') {
        if (ownerOnly) return ownerOnly;
        if (stub.noEmail) return json(400, { detail: SAY.EMAIL_NOT_SET_UP });
        if (one.status === 'archived') return json(400, { detail: SAY.ARCHIVED });
        if (!one.segment) return json(400, { detail: SAY.CHOOSE_SEGMENT });
        if (!one.subject.trim() || !one.body.trim()) return json(400, { detail: SAY.NO_CONTENT });
        if (resolve(one).queued.length === 0) return json(400, { detail: SAY.NOBODY });
        return json(201, sendOut(claim(one, { kind: 'manual', sent_by: ME, rule: null })));
      }
      const oneSend = /^sends\/(\d+)\/(deliveries\/)?$/.exec(rest);
      if (oneSend && method === 'GET') {
        const send = sends.find((candidate) => candidate.id === Number(oneSend[1]) && candidate.campaign === id);
        if (!send) return reply(NOT_FOUND);
        if (!oneSend[2]) {
          // A fixture already at `sending` (SENDING_SEND) counts down from `stillSending` too.
          const left = stillSending.get(send.id) ?? (send.status === 'sending' ? (stub.stillSending ?? 0) : undefined);
          if (left !== undefined) {
            if (left <= 0) {
              stillSending.delete(send.id);
              Object.assign(send, { status: 'sent', finished_at: NOW });
            } else stillSending.set(send.id, left - 1);
          }
          return json(200, sendOut(send));
        }
        const status = url.searchParams.get('status');
        const reason = url.searchParams.get('reason');
        const matching = deliveries
          .filter((d) => d.send === send.id)
          .filter((d) => !status || d.status === status)
          .filter((d) => !reason || d.reason === reason)
          .sort((a, b) => a.id - b.id);
        const seen = matching.filter((d) => d.visible).map(({ send: owner, visible, token, ...rest2 }): Delivery => {
          void owner;
          void visible;
          void token;
          return rest2;
        });
        return json(200, { ...paged(seen, url.searchParams.get('cursor')), hidden: matching.length - seen.length });
      }
    }
    return plans.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return {
    spy,
    /** The tokens a send's emails carried, by contact. */
    tokensOf: (sendId: number) => deliveries.filter((d) => d.send === sendId && d.token).map((d) => ({ contact: d.contact.id, token: d.token as string })),
    /** Someone joins a segment between two sends. */
    addPerson: (segmentId: number, who: Person) => {
      (people[segmentId] ??= []).push(who);
    },
    runNight: plans.runNight,
  };
}
```

`claim` already takes `kind: 'rule'`; Task 13 wires the Rules stub's approvals to it. `stubPlans` returns `{ spy, runNight, … }` on the Plans branch; `runNight` passes through.

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/features/campaigns`
Expected: PASS (campaignText, campaignErrors, campaignParams, campaignApi).

- [ ] **Step 8: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/campaigns`
Expected: no output.

```bash
git add src/features/campaigns
git commit -m "$(cat <<'EOF'
feat(campaigns): API, refusals, URL state and the contract stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The editor's draft, its checks, and inserting a merge field

Spec §1.5 (only three merge fields; the refusal's words), §2.2 (fields, chips insert at the cursor, counters), §4 (`POST`/`PATCH` bodies); Decisions 4, 10; Contract note 16.

**Files:**
- Create: `src/features/campaigns/campaignDraft.ts`
- Test: `src/features/campaigns/campaignDraft.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `CHECK`, `SAY`, `MERGE_FIELDS`, `SUBJECT_MAX`, `BODY_MAX`, `MergeField`; Task 2's `CampaignErrors`; `DEFAULT_ROLES` (`features/surveys/questions`).
- Produces: `CampaignDraft { name; segment: number | null; roles: ContactRole[]; subject; body; sharing: Sharing; sharedWith: PersonRef[] }`, `emptyDraft(segment?) → CampaignDraft`, `fromCampaign(campaign) → CampaignDraft`, `needsRoles(kind) → boolean`, `unknownFields(text) → string[]`, `checkDraft(draft, kind, { forSend }) → CampaignErrors`, `toWrite(draft, kind) → CampaignWrite`, `changedFields(next, saved) → CampaignPatch`, `insertMergeField(text, start, end, field) → { text: string; caret: number }`.

- [ ] **Step 1: Write the failing test**

Create `src/features/campaigns/campaignDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { changedFields, checkDraft, emptyDraft, fromCampaign, insertMergeField, toWrite, unknownFields, type CampaignDraft } from './campaignDraft';
import type { Campaign } from './campaignTypes';

const draft = (patch: Partial<CampaignDraft> = {}): CampaignDraft => ({ ...emptyDraft(7), name: 'Win-back', subject: 'Hi {first_name}', body: 'Hello', ...patch });
const SAVED: Campaign = {
  id: 11,
  name: 'Win-back',
  status: 'active',
  segment: { id: 7, name: 'Renewal risk', kind: 'organization' },
  roles: ['champion', 'decision_maker'],
  owner: { id: 1, name: 'Alice' },
  is_owner: true,
  sharing: 'workspace',
  shared_with: [],
  last_send: null,
  needs_segment: false,
  updated_at: '2026-10-02T12:05:00Z',
  subject: 'Hi {first_name}',
  body: 'Hello',
  legacy_recipients: [],
  legacy_hidden: 0,
  can_delete: false,
};

describe('the campaign draft (spec §2.2)', () => {
  it('starts private with Surveys default roles, and reads a saved one back', () => {
    expect(emptyDraft()).toEqual({ name: '', segment: null, roles: ['champion', 'decision_maker'], subject: '', body: '', sharing: 'private', sharedWith: [] });
    expect(fromCampaign(SAVED)).toEqual({ name: 'Win-back', segment: 7, roles: ['champion', 'decision_maker'], subject: 'Hi {first_name}', body: 'Hello', sharing: 'workspace', sharedWith: [] });
    expect(fromCampaign({ ...SAVED, segment: { id: 9, name: 'Champions', kind: 'contact' }, roles: [] }).roles).toEqual(['champion', 'decision_maker']);
  });

  it('finds merge fields that are not one of the three, ignoring a lone brace', () => {
    expect(unknownFields('Hi {first_name} at {organisation}, {sender_name}')).toEqual([]);
    expect(unknownFields('Hi {nickname} and {}')).toEqual(['nickname', '']);
    expect(unknownFields('Price: {10 or } more')).toEqual(['10 or ']);
    expect(unknownFields('a { b')).toEqual([]);
  });

  it('asks only a name to save, and a segment, roles, subject and body to send', () => {
    expect(checkDraft(draft({ name: ' ', subject: '', body: '' }), 'customer')).toEqual({ name: 'Give the campaign a name.' });
    expect(checkDraft(draft({ segment: null, subject: '', body: '' }), null, { forSend: true })).toEqual({
      segment: 'Choose a segment first.',
      subject: 'Write a subject line.',
      body: 'Write the email.',
    });
    expect(checkDraft(draft({ roles: [] }), 'account')).toEqual({ roles: 'Choose at least one role.' });
    expect(checkDraft(draft({ roles: [] }), 'contact')).toEqual({});
    expect(checkDraft(draft({ body: 'Hi {nick}' }), 'customer')).toEqual({ body: 'Use {first_name}, {organisation} or {sender_name}.' });
    expect(checkDraft(draft({ sharing: 'people' }), 'customer')).toEqual({ shared_with: 'Choose at least one teammate.' });
    expect(checkDraft(draft({ body: 'x'.repeat(5001) }), 'customer')).toEqual({ body: 'Keep the email to 5000 characters.' });
  });

  it('writes trimmed text, roles only for organisation and account segments, people only with "people"', () => {
    expect(toWrite(draft({ name: ' Win-back ', subject: ' Hi ', body: ' Hello \n' }), 'contact')).toEqual({
      name: 'Win-back', segment: 7, roles: [], subject: 'Hi', body: 'Hello', sharing: 'private',
    });
    expect(toWrite(draft({ sharing: 'people', sharedWith: [{ id: 4, name: 'Carl CSM' }] }), 'customer')).toMatchObject({ roles: ['champion', 'decision_maker'], sharing: 'people', shared_with: [4] });
  });

  it('patches only what changed, segment and roles together', () => {
    const same = toWrite(fromCampaign(SAVED), 'customer');
    expect(changedFields(same, SAVED)).toEqual({});
    expect(changedFields({ ...same, body: 'New' }, SAVED)).toEqual({ body: 'New' });
    expect(changedFields({ ...same, roles: ['champion'] }, SAVED)).toEqual({ segment: 7, roles: ['champion'] });
    expect(changedFields({ ...same, sharing: 'private' }, SAVED)).toEqual({ sharing: 'private' });
  });

  it('inserts a merge field at the caret, over a selection, and puts the caret after it', () => {
    expect(insertMergeField('Hello , welcome', 6, 6, 'first_name')).toEqual({ text: 'Hello {first_name}, welcome', caret: 18 });
    expect(insertMergeField('Hello there', 6, 11, 'organisation')).toEqual({ text: 'Hello {organisation}', caret: 20 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 src/features/campaigns/campaignDraft.test.ts`
Expected: FAIL with "Failed to resolve import './campaignDraft'".

- [ ] **Step 3: Write the draft**

Create `src/features/campaigns/campaignDraft.ts`:

```ts
// The campaign editor's state, as plain data: made new or from a saved
// campaign, checked in the backend's own sentences, and turned into the
// POST and PATCH bodies (spec §2.2, §4).
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';
import { DEFAULT_ROLES } from '../surveys/questions';
import type { ContactRole } from '../surveys/surveyTypes';
import type { CampaignErrors } from './campaignErrors';
import { BODY_MAX, CHECK, MERGE_FIELDS, SAY, SUBJECT_MAX, type MergeField } from './campaignOptions';
import type { Campaign, CampaignPatch, CampaignWrite } from './campaignTypes';

export interface CampaignDraft {
  name: string;
  segment: number | null;
  roles: ContactRole[];
  subject: string;
  body: string;
  sharing: Sharing;
  sharedWith: PersonRef[];
}

export function emptyDraft(segment: number | null = null): CampaignDraft {
  return { name: '', segment, roles: [...DEFAULT_ROLES], subject: '', body: '', sharing: 'private', sharedWith: [] };
}

/** A contact segment saves no roles; coming back to one starts from Surveys' defaults. */
export function fromCampaign(campaign: Campaign): CampaignDraft {
  return {
    name: campaign.name,
    segment: campaign.segment?.id ?? null,
    roles: campaign.roles.length > 0 ? [...campaign.roles] : [...DEFAULT_ROLES],
    subject: campaign.subject,
    body: campaign.body,
    sharing: campaign.sharing,
    sharedWith: campaign.sharing === 'people' ? campaign.shared_with : [],
  };
}

export function needsRoles(kind: SegmentKind | null): boolean {
  return kind === 'customer' || kind === 'account';
}

const TOKEN = /\{([^{}]*)\}/g;

/** Every `{…}` that is not one of the three (Contract note 16). */
export function unknownFields(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((match) => match[1]).filter((name) => !(MERGE_FIELDS as readonly string[]).includes(name));
}

/** What the server would refuse, said first. Save needs a name; Send needs the rest. */
export function checkDraft(draft: CampaignDraft, kind: SegmentKind | null, { forSend = false }: { forSend?: boolean } = {}): CampaignErrors {
  const out: CampaignErrors = {};
  if (!draft.name.trim()) out.name = CHECK.NAME;
  if (forSend && draft.segment === null) out.segment = SAY.CHOOSE_SEGMENT;
  if (draft.segment !== null && needsRoles(kind) && draft.roles.length === 0) out.roles = CHECK.ROLES;
  const subject = draft.subject.trim();
  if (forSend && !subject) out.subject = CHECK.SUBJECT;
  else if (subject.length > SUBJECT_MAX) out.subject = CHECK.SUBJECT_LONG;
  else if (unknownFields(subject).length > 0) out.subject = SAY.MERGE;
  const body = draft.body.trim();
  if (forSend && !body) out.body = CHECK.BODY;
  else if (draft.body.length > BODY_MAX) out.body = CHECK.BODY_LONG;
  else if (unknownFields(body).length > 0) out.body = SAY.MERGE;
  if (draft.sharing === 'people' && draft.sharedWith.length === 0) out.shared_with = CHECK.PEOPLE;
  return out;
}

export function toWrite(draft: CampaignDraft, kind: SegmentKind | null): CampaignWrite {
  return {
    name: draft.name.trim(),
    segment: draft.segment,
    roles: needsRoles(kind) ? draft.roles : [],
    subject: draft.subject.trim(),
    body: draft.body.trim(),
    sharing: draft.sharing,
    ...(draft.sharing === 'people' ? { shared_with: draft.sharedWith.map((person) => person.id) } : {}),
  };
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** An edit's PATCH: only what differs from the copy the server last returned. */
export function changedFields(next: CampaignWrite, saved: Campaign): CampaignPatch {
  const patch: CampaignPatch = {};
  if (next.name !== saved.name) patch.name = next.name;
  if (next.subject !== saved.subject) patch.subject = next.subject;
  if (next.body !== saved.body) patch.body = next.body;
  if (next.segment !== (saved.segment?.id ?? null) || next.roles.join() !== saved.roles.join()) {
    patch.segment = next.segment;
    patch.roles = next.roles;
  }
  const before = saved.sharing === 'people' ? saved.shared_with.map((person) => person.id) : [];
  if (next.sharing !== saved.sharing || !sameIds(next.shared_with ?? [], before)) {
    patch.sharing = next.sharing;
    if (next.shared_with) patch.shared_with = next.shared_with;
  }
  return patch;
}

/** Decision 10: the token replaces the selection; the caret lands after it. */
export function insertMergeField(text: string, start: number, end: number, field: MergeField): { text: string; caret: number } {
  const token = `{${field}}`;
  return { text: `${text.slice(0, start)}${token}${text.slice(end)}`, caret: start + token.length };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run --maxWorkers=2 src/features/campaigns/campaignDraft.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/campaigns/campaignDraft.ts src/features/campaigns/campaignDraft.test.ts`
Expected: no output.

```bash
git add src/features/campaigns/campaignDraft.ts src/features/campaigns/campaignDraft.test.ts
git commit -m "$(cat <<'EOF'
feat(campaigns): the editor's draft, merge-field check and write bodies

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/campaigns`: tabs, Show archived, the rows, and their states

Spec §2.1 (tabs Mine and Shared with me plus New campaign; each row's name, segment with its kind icon, owner, status pill, last send; Show archived; skeleton, "No campaigns yet" with New campaign, error with Retry; cursor paging with Show more); Decisions 2, 3, 16; Contract note 5.

**Files:**
- Create: `src/components/campaigns/parts.tsx`, `src/components/campaigns/CampaignRowItem.tsx`, `src/components/campaigns/useCampaignList.ts`, `src/pages/campaigns/CampaignsHome.tsx`, `src/pages/campaigns/testPages.tsx`
- Test: `src/components/campaigns/parts.test.tsx`, `src/pages/campaigns/CampaignsHome.test.tsx`

**Interfaces:**
- Consumes: Task 1's `STATUS_LABEL`, `EXPLAINER`, `lastSendParts`, `segmentKindOf`; Task 2's `fetchCampaigns`, `campaignsTab`, `withTab`, `showArchived`, `withArchived`, `stubCampaigns`; `Parts` (`components/rules/Parts`); `DetailTabs`, `detailPanelId`, `detailTabId`; `OrganizationsFrame`; `EmptyState`, `ErrorBlock`, `ItemSkeleton`, `MoreButton`; `errorMessage`; `makeRulesStore` (`pages/rules/testPages`), `Where`, `SlotHost`, `setViewport`.
- Produces:
  - `parts.tsx`: `StatusPill({ status })`, `SegmentName({ segment })`, `DeliveryStatus({ status })`.
  - `CampaignRowItem({ row })` (`<li data-campaign={id}>`, `[data-part="last-send"]`).
  - `useCampaignList(tab, archived, reload) → { rows: CampaignRow[] | null; next: string | null; error: string | null; more: { busy: boolean; error: string | null }; retry(): void; showMore(): void }`.
  - `CampaignsHome` (renders `<Outlet />` for the modal).
  - `renderCampaigns(url, { width?, nav? }) → { store, unmount }`; later tasks add routes before its `*` catch-all.

- [ ] **Step 1: Write the failing tests**

Create `src/components/campaigns/parts.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeliveryStatus, SegmentName, StatusPill } from './parts';

describe('campaign row parts (no colour-only meaning)', () => {
  it('shows a status as a word and a hidden icon, tinted', () => {
    const { container } = render(<StatusPill status="active" />);
    const pill = container.querySelector('[data-status="active"]') as HTMLElement;
    expect(pill).toHaveTextContent('Active');
    expect(pill).toHaveClass('bg-success-dim', 'text-success');
    expect(pill.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it("names a segment with its kind's icon and words, or says there is none", () => {
    const { container, rerender } = render(<SegmentName segment={{ id: 7, name: 'Renewal risk', kind: 'organization' }} />);
    expect(container).toHaveTextContent('Organisations: Renewal risk');
    expect(container.querySelector('.sr-only')).toHaveTextContent('Organisations:');
    rerender(<SegmentName segment={{ id: 9, name: 'Champions', kind: 'contact' }} />);
    expect(container).toHaveTextContent('Contacts: Champions');
    rerender(<SegmentName segment={null} />);
    expect(screen.getByText('No segment')).toBeInTheDocument();
  });

  it("words a delivery's status with an icon", () => {
    const { container } = render(<DeliveryStatus status="skipped" />);
    expect(container).toHaveTextContent('Skipped');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
```

Create `src/pages/campaigns/CampaignsHome.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const names = async () =>
  within(await screen.findByRole('list', { name: 'Campaigns' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('link')[0].textContent);
const row = (id: number) => document.querySelector(`[data-campaign="${id}"]`) as HTMLElement;

describe('/campaigns (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows a skeleton, then my campaigns newest first: segment, owner, status and last send', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns');
    expect(screen.getByRole('status', { name: 'Loading campaigns' })).toBeInTheDocument();
    expect(await names()).toEqual(['Champion news', 'Win-back', 'Spring offer']);
    const winBack = row(11);
    expect(within(winBack).getByRole('link', { name: 'Win-back' })).toHaveAttribute('href', '/campaigns/11');
    expect(winBack).toHaveTextContent('Active');
    expect(winBack).toHaveTextContent('Renewal risk');
    expect(winBack).toHaveTextContent('You');
    const last = winBack.querySelector('[data-part="last-send"]') as HTMLElement;
    expect(last).toHaveTextContent('2 Oct · 2 sent · 2 skipped');
    expect([...last.querySelectorAll('.font-mono-brand')].map((node) => node.textContent)).toEqual(['2', '2']);
    expect(row(12)).toHaveTextContent('Draft');
    expect(row(12).querySelector('[data-part="last-send"]')).toHaveTextContent('Never sent');
    expect(row(13).querySelector('[data-part="last-send"]')).toHaveTextContent('Choose a segment to send');
    expect(row(13)).toHaveTextContent('No segment');
    expect(screen.getByRole('link', { name: 'New campaign' })).toHaveAttribute('href', '/campaigns/new');
  });

  it('lists what teammates shared under Shared with me, with their names, in the URL', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns');
    await names();
    await userEvent.click(screen.getByRole('tab', { name: 'Shared with me' }));
    await waitFor(() => expect(where()).toBe('/campaigns?tab=shared'));
    expect(await names()).toEqual(['EMEA newsletter']);
    expect(row(14)).toHaveTextContent('Carl CSM');
    expect(row(14)).toHaveTextContent('EMEA accounts');
    expect(requestsOf(spy, 'GET', /^\/campaigns\/$/).map((request) => request.query.get('tab'))).toEqual(['mine', 'shared']);
  });

  it('adds archived campaigns with Show archived, kept in the URL', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns');
    await names();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show archived' }));
    await waitFor(() => expect(where()).toBe('/campaigns?archived=1'));
    await waitFor(() => expect(row(16)).toHaveTextContent('Archived'));
    expect(requestsOf(spy, 'GET', /^\/campaigns\/$/).at(-1)?.query.get('archived')).toBe('1');
  });

  it('says there are none yet, with New campaign, and that nothing is shared yet', async () => {
    stubCampaigns({ campaigns: [] });
    renderCampaigns('/campaigns');
    expect(await screen.findByText('No campaigns yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New campaign' })).toHaveLength(2);
    await userEvent.click(screen.getByRole('tab', { name: 'Shared with me' }));
    expect(await screen.findByText('Nothing shared with you yet')).toBeInTheDocument();
  });

  it('shows an error with Try again, then the list', async () => {
    stubCampaigns({ failList: 1 });
    renderCampaigns('/campaigns');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await names()).toEqual(['Champion news', 'Win-back', 'Spring offer']);
  });

  it('reads the next page with Show more campaigns', async () => {
    stubCampaigns({ pageSize: 2 });
    renderCampaigns('/campaigns');
    expect(await names()).toEqual(['Champion news', 'Win-back']);
    await userEvent.click(screen.getByRole('button', { name: 'Show more campaigns' }));
    await waitFor(() => expect(row(13)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Show more campaigns' })).toBeNull();
  });

  it('keeps every row inside the screen on a phone', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns', { width: 375 });
    await names();
    expect(row(11)).toHaveClass('flex-wrap');
    expect(row(11).querySelector('.basis-56')).toHaveClass('min-w-0');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 src/components/campaigns/parts.test.tsx src/pages/campaigns/CampaignsHome.test.tsx`
Expected: FAIL with "Failed to resolve import './parts'" and "'./testPages'".

- [ ] **Step 3: Write the parts and the row**

Create `src/components/campaigns/parts.tsx`:

```tsx
import { Archive, CheckCircle2, CircleDot, Clock, Layers, MinusCircle, Network, PenLine, Users, type LucideIcon } from 'lucide-react';
import { STATUS_LABEL } from '../../features/campaigns/campaignOptions';
import { segmentKindOf } from '../../features/campaigns/campaignText';
import type { CampaignStatus, DeliveryStatus as Status, SegmentRef } from '../../features/campaigns/campaignTypes';
import { KIND_LABEL } from '../../features/segments/segmentFields';
import type { SegmentKind } from '../../features/segments/segmentTypes';

const STATUS_ICON: Record<CampaignStatus, LucideIcon> = { draft: PenLine, active: CircleDot, archived: Archive };
/** Semantic tints for status only (house rule §4.2). */
const STATUS_TONE: Record<CampaignStatus, string> = {
  draft: 'bg-subtle text-ink-muted',
  active: 'bg-success-dim text-success',
  archived: 'bg-subtle text-ink-muted',
};

/** Draft, Active or Archived: a word and an icon, tinted; never colour alone. */
export function StatusPill({ status }: { status: CampaignStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span data-status={status} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** The sidebar's icon for each record kind. */
const KIND_ICON: Record<SegmentKind, LucideIcon> = { customer: Network, account: Layers, contact: Users };

/** The segment's name after its kind's icon; the kind is read out too. */
export function SegmentName({ segment }: { segment: SegmentRef }) {
  if (!segment) return <span className="text-ink-muted">No segment</span>;
  const kind = segmentKindOf(segment.kind);
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span className="sr-only">{KIND_LABEL[kind]}: </span>
      <span className="truncate">{segment.name}</span>
    </span>
  );
}

const DELIVERY: Record<Status, { icon: LucideIcon; label: string; tone: string }> = {
  sent: { icon: CheckCircle2, label: 'Sent', tone: 'text-success' },
  skipped: { icon: MinusCircle, label: 'Skipped', tone: 'text-ink-muted' },
  queued: { icon: Clock, label: 'Waiting', tone: 'text-ink-muted' },
};

/** A delivery's status: Sent, Skipped or Waiting, with its icon. */
export function DeliveryStatus({ status }: { status: Status }) {
  const { icon: Icon, label, tone } = DELIVERY[status];
  return (
    <span data-delivery-status={status} className={`inline-flex shrink-0 items-center gap-1 text-[13px] ${tone}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}
```

Create `src/components/campaigns/CampaignRowItem.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { lastSendParts } from '../../features/campaigns/campaignText';
import type { CampaignRow } from '../../features/campaigns/campaignTypes';
import { FOCUS } from '../organizations/portfolio/styles';
import { Parts } from '../rules/Parts';
import { SegmentName, StatusPill } from './parts';

/** One campaign (spec §2.1), a rounded row, never a table row: the name and
 *  its status; the segment and owner under it; then its last send, figures
 *  in DM Mono. Phones wrap the last send under the name. */
export function CampaignRowItem({ row }: { row: CampaignRow }) {
  return (
    <li data-campaign={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-56">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link to={`/campaigns/${row.id}`} className={`flex min-h-11 min-w-0 items-center rounded-sm text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
            <span className="truncate">{row.name}</span>
          </Link>
          <StatusPill status={row.status} />
        </span>
        <p className="flex min-w-0 items-center gap-1 text-[11px] text-ink-muted">
          <SegmentName segment={row.segment} />
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{row.is_owner ? 'You' : row.owner.name}</span>
        </p>
      </div>
      <p data-part="last-send" className="text-[13px] text-ink-muted">
        <Parts parts={lastSendParts(row)} />
      </p>
    </li>
  );
}
```

- [ ] **Step 4: Write the list's read**

Create `src/components/campaigns/useCampaignList.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchCampaigns } from '../../features/campaigns/campaignApi';
import type { CampaignRow, CampaignTab } from '../../features/campaigns/campaignTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Load = { key: string; rows: CampaignRow[] | null; next: string | null; error: string | null };

export interface CampaignList {
  rows: CampaignRow[] | null;
  next: string | null;
  error: string | null;
  more: { busy: boolean; error: string | null };
  retry: () => void;
  showMore: () => void;
}

/** The tab's first page, read again when the tab, Show archived or
 *  `reload` (the modal closed) changes; Show more appends the next. */
export function useCampaignList(tab: CampaignTab, archived: boolean, reload: number): CampaignList {
  const [attempt, setAttempt] = useState(0);
  const key = `${tab}|${archived}|${reload}|${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  useEffect(() => {
    let alive = true;
    fetchCampaigns(tab, archived, null).then(
      (page) => {
        if (alive) setLoad({ key, rows: page.results, next: page.next, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key, rows: null, next: null, error: errorMessage(err, 'Could not load campaigns.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, tab, archived]);
  const current = load?.key === key ? load : null;

  async function showMore() {
    if (!current?.next || !current.rows) return;
    setMore({ busy: true, error: null });
    try {
      const page = await fetchCampaigns(tab, archived, current.next);
      setLoad({ ...current, rows: [...current.rows, ...page.results], next: page.next });
      setMore({ busy: false, error: null });
    } catch (err) {
      setMore({ busy: false, error: errorMessage(err, 'Could not load more campaigns.') });
    }
  }

  return {
    rows: current?.rows ?? null,
    next: current?.next ?? null,
    error: current?.error ?? null,
    more,
    retry: () => setAttempt((n) => n + 1),
    showMore: () => void showMore(),
  };
}
```

- [ ] **Step 5: Write the page**

Create `src/pages/campaigns/CampaignsHome.tsx`:

```tsx
import { useId, useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { EXPLAINER } from '../../features/campaigns/campaignOptions';
import { campaignsTab, showArchived, withArchived, withTab } from '../../features/campaigns/campaignParams';
import type { CampaignTab } from '../../features/campaigns/campaignTypes';
import { detailPanelId, detailTabId } from '../../features/organizations/detailParams';
import { CampaignRowItem } from '../../components/campaigns/CampaignRowItem';
import { useCampaignList, type CampaignList } from '../../components/campaigns/useCampaignList';
import { DetailTabs } from '../../components/organizations/detail/DetailTabs';
import { EmptyState, ErrorBlock, ItemSkeleton, MoreButton } from '../../components/organizations/portfolio/PortfolioSections';
import { PRIMARY } from '../../components/organizations/portfolio/styles';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

const TABS: readonly { key: CampaignTab; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'shared', label: 'Shared with me' },
];

function NewCampaignLink() {
  return (
    <Link to="/campaigns/new" className={PRIMARY}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      New campaign
    </Link>
  );
}

function Rows({ tab, list }: { tab: CampaignTab; list: CampaignList }) {
  if (list.error && !list.rows) return <ErrorBlock message={list.error} onRetry={list.retry} />;
  if (!list.rows) return <ItemSkeleton count={4} label="Loading campaigns" avatar={false} />;
  if (list.rows.length === 0) {
    return tab === 'mine' ? (
      <EmptyState title="No campaigns yet" detail={EXPLAINER} action={<NewCampaignLink />} />
    ) : (
      <EmptyState title="Nothing shared with you yet" detail="When a teammate shares a campaign with you, it shows here." action={null} />
    );
  }
  return (
    <>
      <ul aria-label="Campaigns" className="flex flex-col gap-1.5">
        {list.rows.map((row) => (
          <CampaignRowItem key={row.id} row={row} />
        ))}
      </ul>
      <MoreButton next={list.next} loading={list.more.busy} error={list.more.error} label="Show more campaigns" onClick={list.showMore} />
    </>
  );
}

/** /campaigns (spec §2.1): Mine and Shared with me (`?tab=`), Show archived
 *  (`?archived=1`) and New campaign, under the framed bar titled
 *  "Campaigns". /campaigns/new opens its modal over this page. */
export function CampaignsHome() {
  const [search, setSearch] = useSearchParams();
  const tab = campaignsTab(search);
  const archived = showArchived(search);
  const idBase = useId();
  // Each time the modal route closes back to /campaigns, the list reads again.
  const modalOpen = useLocation().pathname.replace(/\/$/, '') !== '/campaigns';
  const [wasOpen, setWasOpen] = useState(modalOpen);
  const [reload, setReload] = useState(0);
  if (wasOpen !== modalOpen) {
    setWasOpen(modalOpen);
    if (!modalOpen) setReload((n) => n + 1);
  }
  const list = useCampaignList(tab, archived, reload);
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <DetailTabs idBase={idBase} active={tab} tabs={TABS} label="Campaign views" onChange={(next) => setSearch(withTab(search, next), { replace: true })} />
          <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-[13px] text-ink sm:min-h-9">
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => setSearch(withArchived(search, event.target.checked), { replace: true })}
              className="h-4 w-4 accent-accent"
            />
            Show archived
          </label>
          <span className="sm:ml-auto">
            <NewCampaignLink />
          </span>
        </div>
        <div role="tabpanel" id={detailPanelId(idBase, tab)} aria-labelledby={detailTabId(idBase, tab)} className="flex flex-col gap-2">
          <Rows tab={tab} list={list} />
        </div>
      </div>
      <Outlet />
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 6: Write the test render**

Create `src/pages/campaigns/testPages.tsx`:

```tsx
// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore } from '../rules/testPages';
import { CampaignsHome } from './CampaignsHome';

/** The Campaigns routes on the real store and router, as App.tsx routes
 *  them. The signed-in user is Alice (id 1) of "Acme Inc". Only fetch is
 *  stubbed, by the caller (stubCampaigns); `nav` adds the real Navbar. */
export function renderCampaigns(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeRulesStore();
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              element={
                <>
                  <CampaignsHome />
                  <Where />
                </>
              }
            >
              <Route path="/campaigns" element={null} />
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

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/components/campaigns/parts.test.tsx src/pages/campaigns/CampaignsHome.test.tsx`
Expected: PASS (3 + 7 tests).

- [ ] **Step 8: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/campaigns src/pages/campaigns/CampaignsHome.tsx src/pages/campaigns/CampaignsHome.test.tsx src/pages/campaigns/testPages.tsx`
Expected: no output.

```bash
git add src/components/campaigns src/pages/campaigns/CampaignsHome.tsx src/pages/campaigns/CampaignsHome.test.tsx src/pages/campaigns/testPages.tsx
git commit -m "$(cat <<'EOF'
feat(campaigns): the list with Mine, Shared with me and Show archived

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: A campaign's page: header, archive, delete, a migrated draft's old recipients

Spec §2.3 (header: name, segment, roles, owner, sharing; for the owner Edit, Archive and Delete, Delete only when never sent; archived notice; migrated drafts' "Picked by hand before segments" and "Choose a segment to send"); §1.7 (404 for unreadable; owner only); §4 (`PATCH status`, `DELETE` 409); Decision 9.

**Files:**
- Create: `src/components/campaigns/useCampaign.ts`, `src/components/campaigns/CampaignStates.tsx`, `src/components/campaigns/CampaignHeader.tsx`, `src/components/campaigns/LegacyRecipients.tsx`, `src/pages/campaigns/CampaignPage.tsx`
- Modify: `src/pages/campaigns/testPages.tsx`
- Test: `src/pages/campaigns/CampaignPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `rolesText`, `segmentKindOf`, `hiddenPeople`; Task 2's `fetchCampaign`, `updateCampaign`, `deleteCampaign`, `campaignErrors`; Task 3's `needsRoles`; Task 4's `StatusPill`, `SegmentName`; `sharingText` (`features/rules/ruleText`); `ConfirmDialog`; `useSubmitOnce` (`components/plans/useSubmitOnce`); `Lines` (`components/surveys/Lines`).
- Produces:
  - `useCampaign(id) → [CampaignLoad, replace(campaign), retry()]`, `CampaignLoad`, `CampaignOutlet { campaign: Campaign; onReplace(campaign: Campaign): void }`.
  - `CampaignLoading`, `CampaignMissing`, `CampaignFailed({ message, onRetry })`.
  - `CampaignHeader({ campaign, onReplace })` (`[data-part="meta"]`, `[data-part="archived"]`).
  - `LegacyRecipients({ campaign })` (`[data-part="legacy"]`).
  - `CampaignPage` (renders `<Outlet context={CampaignOutlet} />`); its inner `CampaignView` is where Tasks 8 and 9 add the sends and Send now….

- [ ] **Step 1: Add the page's route to the test render**

In `src/pages/campaigns/testPages.tsx`, add `import { CampaignPage } from './CampaignPage';` and, before `<Route path="*" element={<Where />} />`, add:

```tsx
            <Route
              path="/campaigns/:id"
              element={
                <>
                  <CampaignPage />
                  <Where />
                </>
              }
            />
```

- [ ] **Step 2: Write the failing test**

Create `src/pages/campaigns/CampaignPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/campaigns/campaignOptions';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const meta = () => document.querySelector('[data-part="meta"]') as HTMLElement;

describe('a campaign page (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("shows its name, status, segment, roles, owner and sharing, and the owner's Edit and Archive", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/11');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Win-back' });
    expect(heading).toHaveClass('text-[22px]');
    expect(meta()).toHaveTextContent('Active');
    expect(meta()).toHaveTextContent('Renewal risk');
    expect(meta()).toHaveTextContent('Champion, Decision Maker');
    expect(meta()).toHaveTextContent('Yours');
    expect(meta()).toHaveTextContent('Shared with the workspace');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/campaigns/11/edit');
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    // It has been sent, so it can only be archived.
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it("offers nothing to change on a teammate's campaign", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/14');
    await screen.findByRole('heading', { level: 1, name: 'EMEA newsletter' });
    expect(meta()).toHaveTextContent('Owned by Carl CSM');
    expect(meta()).toHaveTextContent('Shared with Alice');
    expect(document.querySelector('[data-part="actions"]')).toBeNull();
  });

  it('archives after asking, then says so and offers Unarchive', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/11');
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Win-back?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('This campaign is archived. Unarchive it to send it again.')).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/campaigns\/11\/$/).map((request) => request.body)).toEqual([{ status: 'archived' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Unarchive Win-back?' })).getByRole('button', { name: 'Unarchive' }));
    await waitFor(() => expect(document.querySelector('[data-part="archived"]')).toBeNull());
    expect(meta()).toHaveTextContent('Active');
  });

  it('deletes a never-sent campaign after asking, and goes back to the list', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/12');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete Champion news?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/campaigns'));
    expect(requestsOf(spy, 'DELETE', /^\/campaigns\/12\/$/)).toHaveLength(1);
  });

  it("shows the server's refusal inside the delete dialog", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/12');
    await screen.findByRole('button', { name: 'Delete' });
    // It was sent from another tab since this page read it.
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ code: 'CAMPAIGN_SENT', detail: SAY.CAMPAIGN_SENT }) })));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Champion news?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(SAY.CAMPAIGN_SENT);
  });

  it("shows a migrated draft's old recipients as history, with Choose a segment to send", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/13');
    const legacy = await screen.findByRole('region', { name: 'Picked by hand before segments' });
    expect(within(legacy).getByRole('link', { name: 'Lukas Vermeer' })).toHaveAttribute('href', '/contacts/41');
    expect(legacy).toHaveTextContent("1 more person you can't open");
    expect(within(legacy).getByRole('link', { name: 'Choose a segment to send' })).toHaveAttribute('href', '/campaigns/13/edit');
  });

  it('reads one missing campaign and one not shared the same, and a bad id too', async () => {
    stubCampaigns();
    const first = renderCampaigns('/campaigns/15');
    expect(await screen.findByText('Campaign not found')).toBeInTheDocument();
    first.unmount();
    renderCampaigns('/campaigns/abc');
    expect(await screen.findByText('Campaign not found')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 src/pages/campaigns/CampaignPage.test.tsx`
Expected: FAIL with "Failed to resolve import './CampaignPage'".

- [ ] **Step 4: Write the read and its states**

Create `src/components/campaigns/useCampaign.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchCampaign } from '../../features/campaigns/campaignApi';
import type { Campaign } from '../../features/campaigns/campaignTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type CampaignLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; campaign: Campaign };

/** What the page hands its `edit` child route. */
export interface CampaignOutlet {
  campaign: Campaign;
  onReplace: (campaign: Campaign) => void;
}

/** One campaign, read for the reader: `missing` for a 404, the same for one
 *  that does not exist and one not shared with them (spec §1.7). */
export function useCampaign(id: number): [CampaignLoad, (campaign: Campaign) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: CampaignLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchCampaign(id).then(
      (campaign) => {
        if (alive) setAnswer({ key, load: { status: 'ready', campaign } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this campaign.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((campaign: Campaign) => setAnswer({ key, load: { status: 'ready', campaign } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}
```

Create `src/components/campaigns/CampaignStates.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';

export function CampaignLoading() {
  return <ItemSkeleton count={3} label="Loading campaign" avatar={false} />;
}

/** A 404: missing and not shared read the same. */
export function CampaignMissing() {
  return (
    <EmptyState
      title="Campaign not found"
      detail="It may have been deleted, or it isn't shared with you."
      action={
        <Link to="/campaigns" className={`${QUIET} border border-line`}>
          All campaigns
        </Link>
      }
    />
  );
}

export function CampaignFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorBlock message={message} onRetry={onRetry} />;
}
```

- [ ] **Step 5: Write the header and the old recipients**

Create `src/components/campaigns/CampaignHeader.tsx`:

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { deleteCampaign, updateCampaign } from '../../features/campaigns/campaignApi';
import { needsRoles } from '../../features/campaigns/campaignDraft';
import { campaignErrors } from '../../features/campaigns/campaignErrors';
import { rolesText, segmentKindOf } from '../../features/campaigns/campaignText';
import type { Campaign } from '../../features/campaigns/campaignTypes';
import { sharingText } from '../../features/rules/ruleText';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { BUTTON } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { SegmentName, StatusPill } from './parts';

type Asking = 'archive' | 'unarchive' | 'delete' | null;

/** The campaign's header (spec §2.3): its name; status, segment, roles,
 *  owner and sharing; for the owner Edit, Archive (or Unarchive) and, while
 *  it has never been sent, Delete; a notice once it is archived. */
export function CampaignHeader({ campaign, onReplace }: { campaign: Campaign; onReplace: (campaign: Campaign) => void }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState<Asking>(null);
  const submit = useSubmitOnce();
  const archived = campaign.status === 'archived';
  const kind = campaign.segment ? segmentKindOf(campaign.segment.kind) : null;

  /** ConfirmDialog shows a thrown string as its error. */
  async function write<T>(work: () => Promise<T>, fallback: string): Promise<T | null> {
    const outcome = await submit.run(work);
    if (!outcome) return null;
    if (!outcome.ok) throw campaignErrors(outcome.error, fallback).form ?? fallback;
    return outcome.value;
  }

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 basis-full break-words text-[22px] font-semibold text-ink sm:basis-auto">{campaign.name}</h1>
        {campaign.is_owner ? (
          <div data-part="actions" className="flex flex-wrap items-center gap-2">
            <Link to={`/campaigns/${campaign.id}/edit`} className={BUTTON}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Link>
            <button type="button" onClick={() => setAsking(archived ? 'unarchive' : 'archive')} className={BUTTON}>
              {archived ? <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
              {archived ? 'Unarchive' : 'Archive'}
            </button>
            {campaign.can_delete ? (
              <button type="button" onClick={() => setAsking('delete')} className={`${BUTTON} text-danger`}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p data-part="meta" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-muted">
        <StatusPill status={campaign.status} />
        <SegmentName segment={campaign.segment} />
        {needsRoles(kind) && campaign.roles.length > 0 ? <span>· {rolesText(campaign.roles)}</span> : null}
        <span>· {campaign.is_owner ? 'Yours' : `Owned by ${campaign.owner.name}`}</span>
        <span>· {sharingText(campaign.sharing, campaign.shared_with)}</span>
      </p>
      {archived ? (
        <p role="status" data-part="archived" className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          {campaign.is_owner ? 'This campaign is archived. Unarchive it to send it again.' : 'This campaign is archived.'}
        </p>
      ) : null}
      {asking === 'archive' || asking === 'unarchive' ? (
        <ConfirmDialog
          title={`${asking === 'archive' ? 'Archive' : 'Unarchive'} ${campaign.name}?`}
          message={
            asking === 'archive'
              ? "It can't be sent until you unarchive it, and rules that use it switch themselves off. Its sends stay as they are."
              : 'It can be sent again.'
          }
          confirmLabel={asking === 'archive' ? 'Archive' : 'Unarchive'}
          onConfirm={async () => {
            const saved = await write(() => updateCampaign(campaign.id, { status: asking === 'archive' ? 'archived' : 'active' }), 'Could not change it. Try again.');
            if (saved) onReplace(saved);
          }}
          onClose={() => setAsking(null)}
        />
      ) : null}
      {asking === 'delete' ? (
        <ConfirmDialog
          title={`Delete ${campaign.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            // A 204 resolves null; only a refusal throws (and stays in the dialog).
            await write(() => deleteCampaign(campaign.id), 'Could not delete it. Try again.');
            navigate('/campaigns');
          }}
          onClose={() => setAsking(null)}
        />
      ) : null}
    </header>
  );
}
```

Create `src/components/campaigns/LegacyRecipients.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { hiddenPeople } from '../../features/campaigns/campaignText';
import type { Campaign } from '../../features/campaigns/campaignTypes';
import { FOCUS, MONO, PRIMARY } from '../organizations/portfolio/styles';

/** A migrated draft's hand-picked recipients, read-only history (spec §2.3):
 *  the people the reader may open, a count of the rest, and for the owner
 *  "Choose a segment to send". */
export function LegacyRecipients({ campaign }: { campaign: Campaign }) {
  const headingId = useId();
  if (!campaign.needs_segment) return null;
  const hidden = hiddenPeople(campaign.legacy_hidden);
  return (
    <section aria-labelledby={headingId} data-part="legacy" className="flex flex-col gap-2 rounded-xl bg-surface p-4">
      <h2 id={headingId} className="text-[15px] font-semibold text-ink">
        Picked by hand before segments
      </h2>
      <p className="text-[13px] text-ink-muted">These people were chosen one by one. A campaign now goes to a segment, so this list is kept as history and is never emailed.</p>
      {campaign.legacy_recipients.length > 0 ? (
        <ul aria-label="Old recipients" className="flex flex-col divide-y divide-line-subtle">
          {campaign.legacy_recipients.map((person) => (
            <li key={person.id} className="py-1">
              <Link to={`/contacts/${person.id}`} className={`inline-flex min-h-11 items-center text-[13px] text-ink hover:underline sm:min-h-9 ${FOCUS}`}>
                {person.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {hidden ? (
        <p data-part="hidden" className="text-[11px] text-ink-muted">
          <span className={MONO}>{hidden.n}</span> {hidden.text}
        </p>
      ) : null}
      {campaign.is_owner ? (
        <Link to={`/campaigns/${campaign.id}/edit`} className={`${PRIMARY} self-start`}>
          Choose a segment to send
        </Link>
      ) : (
        <p className="text-[13px] text-ink-muted">Its owner has to choose a segment before it can be sent.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Write the page**

Create `src/pages/campaigns/CampaignPage.tsx`:

```tsx
import { Outlet, useParams } from 'react-router-dom';
import type { Campaign } from '../../features/campaigns/campaignTypes';
import { CampaignHeader } from '../../components/campaigns/CampaignHeader';
import { CampaignFailed, CampaignLoading, CampaignMissing } from '../../components/campaigns/CampaignStates';
import { LegacyRecipients } from '../../components/campaigns/LegacyRecipients';
import { useCampaign, type CampaignOutlet } from '../../components/campaigns/useCampaign';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

/** /campaigns/:id (spec §2.3). */
export function CampaignPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <CampaignMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedCampaign key={id} id={Number(id)} />;
}

function LoadedCampaign({ id }: { id: number }) {
  const [load, replace, retry] = useCampaign(id);
  if (load.status === 'ready') return <CampaignView campaign={load.campaign} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      {load.status === 'loading' ? <CampaignLoading /> : null}
      {load.status === 'missing' ? <CampaignMissing /> : null}
      {load.status === 'failed' ? <CampaignFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

function CampaignView({ campaign, onReplace }: { campaign: Campaign; onReplace: (campaign: Campaign) => void }) {
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <CampaignHeader campaign={campaign} onReplace={onReplace} />
        <LegacyRecipients campaign={campaign} />
      </div>
      {/* /campaigns/:id/edit: the editor over this page. */}
      <Outlet context={{ campaign, onReplace } satisfies CampaignOutlet} />
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 7: Run the test to see it pass**

Run: `npx vitest run --maxWorkers=2 src/pages/campaigns/CampaignPage.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 8: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/campaigns src/pages/campaigns/CampaignPage.tsx src/pages/campaigns/CampaignPage.test.tsx src/pages/campaigns/testPages.tsx`
Expected: no output.

```bash
git add src/components/campaigns src/pages/campaigns/CampaignPage.tsx src/pages/campaigns/CampaignPage.test.tsx src/pages/campaigns/testPages.tsx
git commit -m "$(cat <<'EOF'
feat(campaigns): a campaign's page with archive, delete and its old recipients

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The message fields with merge-field chips, and the preview pane

Spec §2.2 (subject; body with three merge-field chips that insert at the cursor; counters `0 of 150` and `0 of 5000` in mono; the preview pane: the rendered email from `preview/` for one person, a person picker from the audience's first 20, 400 ms after typing stops, latest answer wins, footer and unsubscribe line, below the form on phones); §1.5; Decisions 5, 10; Contract notes 3, 4.

**Files:**
- Create: `src/components/campaigns/MessageFields.tsx`, `src/components/campaigns/useCampaignAudience.ts`, `src/components/campaigns/usePreview.ts`, `src/components/campaigns/PreviewPane.tsx`
- Test: `src/components/campaigns/MessageFields.test.tsx`, `src/components/campaigns/PreviewPane.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MERGE_FIELDS`, `MERGE_LABEL`, `SUBJECT_MAX`, `BODY_MAX`, `PREVIEW_DEBOUNCE_MS`, `footerLines`; Task 2's `fetchAudience`, `previewCampaign`, `campaignErrors`, `stubCampaigns`; Task 3's `insertMergeField`; `Field` (`components/rules/Field`); `INPUT` (`components/plans/styles`); `FILTER_SELECT`; `ItemSkeleton`; `MONO`.
- Produces:
  - `MessageFields({ subject, body, errors: { subject?: string; body?: string }, onSubject(value), onBody(value) })`.
  - `AudienceLoad = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: Audience } | { status: 'error'; message: string }`, `useCampaignAudience(campaignId: number | null, version: number) → AudienceLoad`.
  - `PreviewState`, `usePreview(campaignId: number | null, request: PreviewRequest | null) → PreviewState`.
  - `PreviewPane({ campaignId, subject, body, audience, contact, onContact, stale, sender, workspace })` (`role="region"` named "Preview"; `[data-part="subject"]`, `[data-part="body"]`, `[data-part="footer"]`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/campaigns/MessageFields.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageFields } from './MessageFields';

function Harness({ start = '', errors = {} }: { start?: string; errors?: { subject?: string; body?: string } }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(start);
  return <MessageFields subject={subject} body={body} errors={errors} onSubject={setSubject} onBody={setBody} />;
}
const bodyBox = () => screen.getByRole('textbox', { name: 'Body' }) as HTMLTextAreaElement;

describe('the message fields (spec §2.2)', () => {
  it('counts the subject and the body in DM Mono', async () => {
    render(<Harness />);
    const subjectCount = screen.getByText((_, node) => node?.id.endsWith('-hint') === true && node.textContent === '0 of 150');
    expect([...subjectCount.querySelectorAll('.font-mono-brand')].map((node) => node.textContent)).toEqual(['0', '150']);
    expect(screen.getByText((_, node) => node?.id.endsWith('-hint') === true && node.textContent === '0 of 5000')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Subject' }), 'Hello');
    expect(screen.getByText((_, node) => node?.id.endsWith('-hint') === true && node.textContent === '5 of 150')).toBeInTheDocument();
  });

  it('inserts a merge field at the caret, over a selection, and leaves the caret after it', async () => {
    render(<Harness start="Hello , welcome" />);
    const box = bodyBox();
    box.focus();
    box.setSelectionRange(6, 6);
    fireEvent.select(box);
    await userEvent.click(screen.getByRole('button', { name: 'Insert first name' }));
    expect(box).toHaveValue('Hello {first_name}, welcome');
    expect(document.activeElement).toBe(box);
    expect(box.selectionStart).toBe(18);
    box.setSelectionRange(0, 5);
    fireEvent.select(box);
    await userEvent.click(screen.getByRole('button', { name: 'Insert sender name' }));
    expect(box).toHaveValue('{sender_name} {first_name}, welcome');
  });

  it('adds a merge field at the end when the body was never touched', async () => {
    render(<Harness start="Hi" />);
    await userEvent.click(screen.getByRole('button', { name: 'Insert organisation' }));
    expect(bodyBox()).toHaveValue('Hi{organisation}');
  });

  it('shows a refusal under its field and marks it invalid', () => {
    render(<Harness errors={{ body: 'Use {first_name}, {organisation} or {sender_name}.' }} />);
    expect(bodyBox()).toHaveAttribute('aria-invalid', 'true');
    expect(bodyBox()).toHaveAccessibleDescription(/Use \{first_name\}, \{organisation\} or \{sender_name\}\./);
  });
});
```

Create `src/components/campaigns/PreviewPane.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/campaigns/campaignOptions';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { requestsOf } from '../../features/surveys/testSurveys';
import { PreviewPane } from './PreviewPane';
import { useCampaignAudience } from './useCampaignAudience';

function Harness({ campaignId, subject = 'News for {first_name}', body = 'Hello {first_name}, we have news.' }: { campaignId: number | null; subject?: string; body?: string }) {
  const audience = useCampaignAudience(campaignId, 0);
  const [contact, setContact] = useState<number | null>(null);
  return <PreviewPane campaignId={campaignId} subject={subject} body={body} audience={audience} contact={contact} onContact={setContact} stale={false} sender="Alice" workspace="Acme Inc" />;
}
const pane = () => screen.getByRole('region', { name: 'Preview' });

describe('the preview pane (spec §2.2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws an unsaved campaign as typed, with the footer, and asks for a save to see it for someone', () => {
    const { spy } = stubCampaigns();
    render(<Harness campaignId={null} />);
    expect(pane()).toHaveTextContent('Save the draft to see it for a real person.');
    expect(pane().querySelector('[data-part="subject"]')).toHaveTextContent('News for {first_name}');
    expect(pane().querySelector('[data-part="footer"]')).toHaveTextContent('Alice, Acme Inc');
    expect(pane().querySelector('[data-part="footer"]')).toHaveTextContent('Unsubscribe from these emails: link');
    expect(requestsOf(spy, 'POST', /preview\/$/)).toHaveLength(0);
  });

  it('renders it for the first person in the audience, then for whoever is picked', async () => {
    const { spy } = stubCampaigns();
    render(<Harness campaignId={12} />);
    const picker = await within(pane()).findByRole('combobox', { name: 'Preview for' });
    expect([...picker.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Rosa Diaz', 'Tom Hale']);
    await waitFor(() => expect(pane().querySelector('[data-part="subject"]')).toHaveTextContent('News for Rosa'));
    expect(pane().querySelector('[data-part="body"]')).toHaveTextContent('Hello Rosa, we have news.');
    expect(pane().querySelector('[data-part="body"]')).toHaveTextContent('Unsubscribe from these emails:');
    await userEvent.selectOptions(picker, '62');
    await waitFor(() => expect(pane().querySelector('[data-part="subject"]')).toHaveTextContent('News for Tom'));
    expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/preview\/$/).at(-1)?.body).toEqual({ contact: 62, subject: 'News for {first_name}', body: 'Hello {first_name}, we have news.' });
  });

  it('asks once, 400 ms after the last change, and shows only the latest answer', async () => {
    const { spy } = stubCampaigns();
    const view = render(<Harness campaignId={12} subject="A" />);
    await within(pane()).findByRole('combobox', { name: 'Preview for' });
    view.rerender(<Harness campaignId={12} subject="AB" />);
    view.rerender(<Harness campaignId={12} subject="ABC" />);
    await waitFor(() => expect(pane().querySelector('[data-part="subject"]')).toHaveTextContent('ABC'));
    expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/preview\/$/).map((request) => (request.body as { subject: string }).subject)).toEqual(['ABC']);
  });

  it("shows the server's refusal in the pane", async () => {
    stubCampaigns({ preview: () => ({ status: 400, body: { body: [SAY.MERGE] } }) });
    render(<Harness campaignId={12} />);
    expect(await within(pane()).findByRole('alert')).toHaveTextContent(SAY.MERGE);
  });

  it('says when nobody in the segment can be emailed', async () => {
    stubCampaigns({ people: { 9: [] } });
    render(<Harness campaignId={12} />);
    expect(await within(pane()).findByText('Nobody in this segment can be emailed right now, so there is nobody to preview it for.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 src/components/campaigns/MessageFields.test.tsx src/components/campaigns/PreviewPane.test.tsx`
Expected: FAIL with "Failed to resolve import './MessageFields'" and "'./PreviewPane'".

- [ ] **Step 3: Write the message fields**

Create `src/components/campaigns/MessageFields.tsx`:

```tsx
import { useId, useLayoutEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { insertMergeField } from '../../features/campaigns/campaignDraft';
import { BODY_MAX, MERGE_FIELDS, MERGE_LABEL, SUBJECT_MAX, type MergeField } from '../../features/campaigns/campaignOptions';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { Field } from '../rules/Field';

const CHIP = `inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[13px] text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`;
const border = (error?: string) => (error ? 'border-danger' : 'border-line');

function Count({ n, max }: { n: number; max: number }) {
  return (
    <>
      <span className={MONO}>{n}</span> of <span className={MONO}>{max}</span>
    </>
  );
}

/** Subject and body (spec §2.2), plain text, with the three merge fields as
 *  chips that insert into the body at its caret (Decision 10). */
export function MessageFields({ subject, body, errors, onSubject, onBody }: {
  subject: string;
  body: string;
  errors: { subject?: string; body?: string };
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
}) {
  const subjectId = useId();
  const bodyId = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /** The body's last selection; null until it is touched (then a chip appends). */
  const selection = useRef<{ start: number; end: number } | null>(null);
  /** Where the caret goes once the inserted text has rendered. */
  const pending = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pending.current === null) return;
    const caret = pending.current;
    pending.current = null;
    bodyRef.current?.focus();
    bodyRef.current?.setSelectionRange(caret, caret);
  }, [body]);

  const remember = () => {
    const box = bodyRef.current;
    if (box) selection.current = { start: box.selectionStart, end: box.selectionEnd };
  };
  const insert = (field: MergeField) => {
    const at = selection.current ?? { start: body.length, end: body.length };
    const next = insertMergeField(body, at.start, at.end, field);
    selection.current = { start: next.caret, end: next.caret };
    pending.current = next.caret;
    onBody(next.text);
  };

  return (
    <section aria-label="Message" className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-ink">Message</h3>
      <Field id={subjectId} label="Subject" hint={<Count n={subject.length} max={SUBJECT_MAX} />} error={errors.subject}>
        {(aria) => (
          <input
            id={subjectId}
            {...aria}
            value={subject}
            maxLength={SUBJECT_MAX}
            placeholder="Checking in, {first_name}"
            onChange={(event) => onSubject(event.target.value)}
            className={`${INPUT} ${border(errors.subject)}`}
          />
        )}
      </Field>
      <Field id={bodyId} label="Body" hint={<Count n={body.length} max={BODY_MAX} />} error={errors.body}>
        {(aria) => (
          <textarea
            id={bodyId}
            ref={bodyRef}
            {...aria}
            rows={8}
            value={body}
            maxLength={BODY_MAX}
            onChange={(event) => {
              onBody(event.target.value);
              selection.current = { start: event.target.selectionStart, end: event.target.selectionEnd };
            }}
            onSelect={remember}
            onKeyUp={remember}
            onClick={remember}
            className={`${INPUT} resize-y py-2 ${border(errors.body)}`}
          />
        )}
      </Field>
      <div role="group" aria-label="Merge fields" className="flex flex-wrap items-center gap-1.5">
        {MERGE_FIELDS.map((field) => (
          <button key={field} type="button" aria-label={`Insert ${MERGE_LABEL[field]}`} onClick={() => insert(field)} className={CHIP}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={MONO}>{`{${field}}`}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-muted">Plain text. Every email ends with your name, the workspace and a line to unsubscribe.</p>
    </section>
  );
}
```

- [ ] **Step 4: Write the audience read and the preview's read**

Create `src/components/campaigns/useCampaignAudience.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchAudience } from '../../features/campaigns/campaignApi';
import { campaignErrors } from '../../features/campaigns/campaignErrors';
import type { Audience } from '../../features/campaigns/campaignTypes';

export type AudienceLoad = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: Audience } | { status: 'error'; message: string };
const FALLBACK = 'Could not count who it reaches.';

/** Whom a saved campaign reaches, read as its owner (Contract note 4):
 *  idle without a campaign, again whenever `version` moves (each save). */
export function useCampaignAudience(campaignId: number | null, version: number): AudienceLoad {
  const key = campaignId === null ? null : `${campaignId}#${version}`;
  const [answer, setAnswer] = useState<{ key: string; load: AudienceLoad } | null>(null);
  useEffect(() => {
    if (key === null || campaignId === null) return;
    let alive = true;
    fetchAudience(campaignId).then(
      (data) => {
        if (alive) setAnswer({ key, load: { status: 'ready', data } });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, load: { status: 'error', message: Object.values(campaignErrors(err, FALLBACK))[0] ?? FALLBACK } });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, campaignId]);
  if (key === null) return { status: 'idle' };
  return answer?.key === key ? answer.load : { status: 'loading' };
}
```

Create `src/components/campaigns/usePreview.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { previewCampaign } from '../../features/campaigns/campaignApi';
import { campaignErrors } from '../../features/campaigns/campaignErrors';
import { PREVIEW_DEBOUNCE_MS } from '../../features/campaigns/campaignOptions';
import type { Preview, PreviewRequest } from '../../features/campaigns/campaignTypes';

export type PreviewState = { status: 'idle' } | { status: 'loading'; last: Preview | null } | { status: 'ready'; data: Preview } | { status: 'error'; message: string };
type Answer = { key: string; data: Preview } | { key: string; error: string };
const FALLBACK = 'Could not draw the preview.';

/** The editor's preview (spec §2.2), as Surveys' useAudience: POST preview/
 *  400 ms after the last change, keyed by its body; an answer counts only
 *  while its key is the latest; the last good one stays, dimmed, while a
 *  newer one loads. */
export function usePreview(campaignId: number | null, request: PreviewRequest | null): PreviewState {
  const key = campaignId !== null && request ? JSON.stringify([campaignId, request]) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [last, setLast] = useState<Preview | null>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    latest.current = key;
    if (!key) return;
    let cancelled = false;
    const [id, body] = JSON.parse(key) as [number, PreviewRequest];
    const timer = window.setTimeout(() => {
      previewCampaign(id, body).then(
        (data) => {
          if (cancelled || latest.current !== key) return;
          setAnswer({ key, data });
          setLast(data);
        },
        (err: unknown) => {
          if (cancelled || latest.current !== key) return;
          const found = campaignErrors(err, FALLBACK);
          setAnswer({ key, error: found.subject ?? found.body ?? found.form ?? Object.values(found)[0] ?? FALLBACK });
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  if (!key) return { status: 'idle' };
  if (answer?.key === key) return 'data' in answer ? { status: 'ready', data: answer.data } : { status: 'error', message: answer.error };
  return { status: 'loading', last };
}
```

- [ ] **Step 5: Write the pane**

Create `src/components/campaigns/PreviewPane.tsx`:

```tsx
import { useId } from 'react';
import { footerLines } from '../../features/campaigns/campaignText';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import type { AudienceLoad } from './useCampaignAudience';
import { usePreview, type PreviewState } from './usePreview';

const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

/** An email as text: subject, body, and (locally drawn) the footer, its
 *  dash line drawn as a rule. Never markup (spec §3). */
function Email({ subject, body, footer = null, dim = false }: { subject: string; body: string; footer?: string[] | null; dim?: boolean }) {
  return (
    <div data-part="email" className={`flex flex-col gap-2 ${dim ? 'opacity-60' : ''}`}>
      <p data-part="subject" className="break-words text-[13px] font-semibold text-ink">
        {subject || 'No subject yet'}
      </p>
      <p data-part="body" className="whitespace-pre-wrap break-words text-[13px] text-ink">
        {body || 'Nothing written yet.'}
      </p>
      {footer ? (
        <div data-part="footer" className="flex flex-col border-t border-line pt-2 text-[11px] text-ink-muted">
          {footer.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ServerEmail({ state }: { state: PreviewState }) {
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-[13px] text-danger">
        {state.message}
      </p>
    );
  }
  const data = state.status === 'ready' ? state.data : state.status === 'loading' ? state.last : null;
  if (!data) return <ItemSkeleton count={1} label="Drawing the preview" avatar={false} />;
  return <Email subject={data.subject} body={data.body} dim={state.status === 'loading'} />;
}

/** The editor's preview (spec §2.2, Decision 5): for one person in the saved
 *  campaign's audience, from the server, 400 ms after typing stops; before
 *  the first save (or with nobody to show), the typed text drawn here. */
export function PreviewPane({ campaignId, subject, body, audience, contact, onContact, stale, sender, workspace }: {
  campaignId: number | null;
  subject: string;
  body: string;
  audience: AudienceLoad;
  contact: number | null;
  onContact: (id: number) => void;
  /** The form's segment or roles differ from the saved ones. */
  stale: boolean;
  sender: string;
  workspace: string;
}) {
  const headingId = useId();
  const pickId = useId();
  const sample = audience.status === 'ready' ? audience.data.sample : [];
  const person = contact !== null && sample.some((one) => one.id === contact) ? contact : (sample[0]?.id ?? null);
  const live = campaignId !== null && person !== null;
  const state = usePreview(live ? campaignId : null, live ? { contact: person, subject, body } : null);

  let note: string | null = null;
  if (campaignId === null) note = 'Save the draft to see it for a real person.';
  else if (audience.status === 'idle') note = 'Choose a segment and save to see it for a real person.';
  else if (audience.status === 'error') note = audience.message;
  else if (audience.status === 'ready' && sample.length === 0) note = 'Nobody in this segment can be emailed right now, so there is nobody to preview it for.';

  return (
    <section aria-labelledby={headingId} aria-busy={state.status === 'loading' || audience.status === 'loading'} className="flex flex-col gap-3 rounded-xl bg-subtle p-3">
      <h3 id={headingId} className={LABEL}>
        Preview
      </h3>
      {sample.length > 0 && person !== null ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={pickId} className={LABEL}>
            Preview for
          </label>
          <select id={pickId} value={String(person)} onChange={(event) => onContact(Number(event.target.value))} className={`${FILTER_SELECT} w-full`}>
            {sample.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {stale ? <p className="text-[11px] text-ink-muted">Save to preview it with this segment and these roles.</p> : null}
      {note ? <p className="text-[13px] text-ink-muted">{note}</p> : null}
      {live ? (
        <ServerEmail state={state} />
      ) : audience.status === 'loading' ? (
        <ItemSkeleton count={1} label="Counting who it reaches" avatar={false} />
      ) : (
        <Email subject={subject} body={body} footer={footerLines(sender, workspace)} />
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/components/campaigns/MessageFields.test.tsx src/components/campaigns/PreviewPane.test.tsx`
Expected: PASS (4 + 5 tests).

- [ ] **Step 7: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/campaigns`
Expected: no output.

```bash
git add src/components/campaigns
git commit -m "$(cat <<'EOF'
feat(campaigns): message fields with merge chips, and the live preview

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The editor modal: new and edit, Save once, Send now… on a fresh count

Spec §2.2 (routes `/campaigns/new` over the list and `/campaigns/:id/edit` over the page; `BuilderDialog`, scrim keeps the draft; name, a segment picker of your own segments grouped by kind, `RoleFields` for organisation and account segments, subject, body, sharing; Save; Send now… opens a confirm step with a fresh server count from `audience/`, then posts to `sends/`; field refusals at their fields; `EMAIL_NOT_SET_UP` at the Send button, keeping the campaign; a refusal with no field takes focus; submitting happens once); Decisions 4–6; Contract notes 4, 8, 9.

**Files:**
- Create: `src/components/campaigns/CampaignAudienceFields.tsx`, `src/components/campaigns/SendStep.tsx`, `src/pages/campaigns/CampaignBuilder.tsx`
- Modify: `src/components/surveys/RoleFields.tsx`, `src/components/surveys/RoleFields.test.tsx`, `src/pages/campaigns/testPages.tsx`
- Test: `src/pages/campaigns/CampaignBuilder.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–6; `useMySegments`, `SegmentOptions`, `RoleFields` (Surveys); `SharingFields`, `BuilderDialog`; `useMembers`; `useSubmitOnce`; `useRefusalFocus`, `ANY_REFUSAL` (`components/plans/useRefusalFocus`); `CampaignOutlet` (Task 5).
- Produces:
  - `RoleFields` gains `verb?: 'ask' | 'email'` (default `'ask'`): the legend reads "Who to email at each organisation".
  - `CampaignAudienceFields({ segments, segmentsError, segmentId, fallback, roles, kind, errors, onSegment, onRoles })`.
  - `SendStep({ name, audience, headingRef })` (`[data-part="confirm"]`, `[data-part="audience"]`, `[data-part="blocker"]`), `SendButton({ busy, blocked, refusal, onSend })` (the refusal is `role="alert"`, `data-error`, focused when it arrives, and the button's description).
  - `CampaignForm({ initial, onClose, onDone(saved, sendId?) })`, `NewCampaignRoute`, `EditCampaignRoute`.

- [ ] **Step 1: Let RoleFields say "email"**

In `src/components/surveys/RoleFields.tsx`, change the signature to

```tsx
export function RoleFields({ kind, roles, error, onRoles, verb = 'ask' }: { kind: SegmentKind | null; roles: ContactRole[]; error?: string; onRoles: (roles: ContactRole[]) => void; verb?: 'ask' | 'email' }) {
```

and the legend to `<legend className={`${LABEL} mb-1`}>Who to {verb} at each {place}</legend>`. Update its doc comment's first line to "Which roles to ask (or email) at each organisation or account, in the order ticked".

Append to `src/components/surveys/RoleFields.test.tsx` (add `render`, `screen` from Testing Library if not imported):

```tsx
it('can say "email" for a campaign (campaigns spec §2.2)', () => {
  render(<RoleFields kind="account" roles={['champion']} onRoles={() => {}} verb="email" />);
  expect(screen.getByRole('group', { name: 'Who to email at each account' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add the modal's routes to the test render**

In `src/pages/campaigns/testPages.tsx`, add `import { EditCampaignRoute, NewCampaignRoute } from './CampaignBuilder';`. Under `<Route path="/campaigns" element={null} />` add `<Route path="/campaigns/new" element={<NewCampaignRoute />} />`, and change the `/campaigns/:id` route to hold its edit child:

```tsx
            <Route
              path="/campaigns/:id"
              element={
                <>
                  <CampaignPage />
                  <Where />
                </>
              }
            >
              <Route path="edit" element={<EditCampaignRoute />} />
            </Route>
```

- [ ] **Step 3: Write the failing test**

Create `src/pages/campaigns/CampaignBuilder.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/campaigns/campaignOptions';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const segmentReady = async (modal: HTMLElement) => {
  const select = within(modal).getByRole('combobox', { name: 'Segment' });
  await waitFor(() => expect(select).not.toBeDisabled());
  return select;
};

describe('the campaign editor (spec §2.2)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens over the list with Name focused, and saves a new campaign once, opening its page', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(name);
    await userEvent.type(name, 'Champion update');
    await userEvent.selectOptions(await segmentReady(modal), '9');
    expect(within(modal).queryByRole('group', { name: /Who to email/ })).toBeNull();
    await userEvent.dblClick(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100'));
    const posts = requestsOf(spy, 'POST', /^\/campaigns\/$/);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ name: 'Champion update', segment: 9, roles: [], subject: '', body: '', sharing: 'private' });
  });

  it("asks whom to email at each organisation, Surveys' roles ticked, and refuses none", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Renewals');
    await userEvent.selectOptions(await segmentReady(modal), '7');
    const roles = within(modal).getByRole('group', { name: 'Who to email at each organisation' });
    expect(within(roles).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Decision Maker' })).toBeChecked();
    await userEvent.click(within(roles).getByRole('checkbox', { name: 'Champion' }));
    await userEvent.click(within(roles).getByRole('checkbox', { name: 'Decision Maker' }));
    expect(within(modal).getByRole('button', { name: 'Send now…' })).toBeDisabled();
    expect(modal).toHaveTextContent('Choose at least one role to send.');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    const refusal = await within(roles).findByRole('alert');
    expect(refusal).toHaveTextContent('Choose at least one role.');
    expect(document.activeElement).toBe(refusal);
  });

  it('refuses a missing name at its field, and focuses it', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await segmentReady(modal);
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Give the campaign a name.');
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(requestsOf(spy, 'POST', /^\/campaigns\/$/)).toHaveLength(0);
  });

  it('shows a refusal with no field above the form, focused', async () => {
    stubCampaigns({ limit: 3 });
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await segmentReady(modal);
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'One too many');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    const alert = await within(modal).findByText(SAY.LIMIT);
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it('edits over the page, sending only what changed, and returns to the page', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/11/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Win-back' });
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Win-back');
    const subject = within(modal).getByRole('textbox', { name: 'Subject' });
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Checking in');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(where()).toBe('/campaigns/11'));
    expect(requestsOf(spy, 'PATCH', /^\/campaigns\/11\/$/).map((request) => request.body)).toEqual([{ subject: 'Checking in' }]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Win-back' })).toBeInTheDocument();
  });

  it('tells anyone but the owner who can edit it', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/14/edit');
    expect(await screen.findByText('Only Carl CSM can edit this campaign')).toBeInTheDocument();
  });

  it('keeps the draft when the scrim is clicked', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Kept');
    await userEvent.click(document.querySelector('[data-scrim]') as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'New campaign' })).toBeInTheDocument();
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Kept');
  });

  it('asks for a subject and a body before sending', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Empty');
    await userEvent.selectOptions(await segmentReady(modal), '9');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now…' }));
    expect(within(modal).getByRole('textbox', { name: 'Subject' })).toHaveAccessibleDescription(/Write a subject line\./);
    expect(within(modal).getByRole('textbox', { name: 'Body' })).toHaveAccessibleDescription(/Write the email\./);
    await waitFor(() => expect(document.activeElement).toBe(within(modal).getByRole('textbox', { name: 'Subject' })));
  });

  it('Send now… saves, counts again on the server, confirms, sends once and opens the send', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/12/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Champion news' });
    await within(modal).findByRole('combobox', { name: 'Preview for' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now…' }));
    const heading = await within(modal).findByRole('heading', { name: 'Send Champion news now?' });
    expect(document.activeElement).toBe(heading);
    const audience = modal.querySelector('[data-part="audience"]') as HTMLElement;
    expect(audience).toHaveTextContent('Emails 3 people · Skips 1 without an email');
    expect([...audience.querySelectorAll('.font-mono-brand')].map((node) => node.textContent)).toEqual(['3', '1']);
    expect(requestsOf(spy, 'GET', /^\/campaigns\/12\/audience\/$/)).toHaveLength(2);
    await userEvent.dblClick(within(modal).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/12?send=500'));
    expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/sends\/$/)).toHaveLength(1);
  });

  it('keeps EMAIL_NOT_SET_UP at the Send button, focused, and the campaign saved', async () => {
    const { spy } = stubCampaigns({ noEmail: true });
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Hello');
    await userEvent.selectOptions(await segmentReady(modal), '9');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Subject' }), 'Hi');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Body' }), 'Hello there');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now' }));
    const refusal = await within(modal).findByRole('alert');
    expect(refusal).toHaveTextContent(SAY.EMAIL_NOT_SET_UP);
    expect(document.activeElement).toBe(refusal);
    expect(within(modal).getByRole('button', { name: 'Send now' })).toHaveAccessibleDescription(SAY.EMAIL_NOT_SET_UP);
    expect(requestsOf(spy, 'POST', /^\/campaigns\/$/)).toHaveLength(1);
    // Closing now opens the saved draft.
    await userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100'));
  });

  it('will not send when nobody can be emailed, and Back returns to Send now…', async () => {
    stubCampaigns({ people: { 9: [] } });
    renderCampaigns('/campaigns/12/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Champion news' });
    const send = await within(modal).findByRole('button', { name: 'Send now…' });
    await userEvent.click(send);
    expect(await within(modal).findByText(SAY.NOBODY)).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Send now' })).toBeDisabled();
    await userEvent.click(within(modal).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(document.activeElement).toBe(within(modal).getByRole('button', { name: 'Send now…' })));
  });

  it('lays the preview below the form on phones and beside it from lg', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/new', { width: 375 });
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    expect(modal.querySelector('[data-part="builder-columns"]')).toHaveClass('grid', 'lg:grid-cols-[minmax(0,1fr)_24rem]');
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 src/pages/campaigns/CampaignBuilder.test.tsx src/components/surveys/RoleFields.test.tsx`
Expected: FAIL with "Failed to resolve import './CampaignBuilder'"; the RoleFields test fails on the legend.

- [ ] **Step 5: Write the audience fields and the send step**

Create `src/components/campaigns/CampaignAudienceFields.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { segmentKindOf } from '../../features/campaigns/campaignText';
import type { SegmentRef } from '../../features/campaigns/campaignTypes';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { ContactRole } from '../../features/surveys/surveyTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS } from '../organizations/portfolio/styles';
import { RoleFields } from '../surveys/RoleFields';
import { SegmentOptions } from '../surveys/SegmentOptions';

const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

/** Who it emails (spec §2.2): one of the owner's segments, grouped by kind,
 *  and for an organisation or account segment the roles to email there. */
export function CampaignAudienceFields({ segments, segmentsError, segmentId, fallback, roles, kind, errors, onSegment, onRoles }: {
  /** null while loading. */
  segments: SegmentListRow[] | null;
  segmentsError: string | null;
  segmentId: number | null;
  /** The campaign's saved segment, kept as an option when it is not among mine. */
  fallback: SegmentRef;
  roles: ContactRole[];
  kind: SegmentKind | null;
  errors: { segment?: string; roles?: string };
  onSegment: (id: number | null) => void;
  onRoles: (roles: ContactRole[]) => void;
}) {
  const selectId = useId();
  const describedBy = [`${selectId}-hint`, errors.segment ? `${selectId}-error` : null].filter(Boolean).join(' ');
  const saved = fallback ? { id: fallback.id, name: fallback.name, kind: segmentKindOf(fallback.kind) } : null;
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
          <SegmentOptions rows={segments} fallback={saved} />
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
        {segments !== null && segments.length === 0 && !segmentsError ? (
          <p className="text-[11px] text-ink-muted">
            You have no segments yet.{' '}
            <Link to="/segments/new" className={`inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`}>
              Make one
            </Link>
            , then email it.
          </p>
        ) : null}
        <p id={`${selectId}-hint`} className="text-[11px] text-ink-muted">
          Only your own segments. It reaches the people you can open.
        </p>
      </div>
      <RoleFields kind={kind} roles={roles} error={errors.roles} onRoles={onRoles} verb="email" />
    </section>
  );
}
```

Create `src/components/campaigns/SendStep.tsx`:

```tsx
import { useEffect, useId, useRef, type RefObject } from 'react';
import { SAY } from '../../features/campaigns/campaignOptions';
import { audienceParts } from '../../features/campaigns/campaignText';
import type { Audience } from '../../features/campaigns/campaignTypes';
import { FOCUS, PRIMARY } from '../organizations/portfolio/styles';
import { Parts } from '../rules/Parts';

/** The confirm step (spec §2.2, Decision 6): whom it emails and why the
 *  rest are skipped, counted on the server just now. */
export function SendStep({ name, audience, headingRef }: { name: string; audience: Audience; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const nobody = audience.reach === 0;
  return (
    <section aria-label="Confirm the send" data-part="confirm" className="flex max-w-xl flex-col gap-3">
      <h3 ref={headingRef} tabIndex={-1} className={`text-[15px] font-semibold text-ink ${FOCUS}`}>
        Send {name} now?
      </h3>
      <p data-part="audience" className="text-[13px] text-ink">
        <Parts parts={audienceParts(audience)} />
      </p>
      {nobody ? (
        <p data-part="blocker" className="text-[13px] text-danger">
          {SAY.NOBODY}
        </p>
      ) : (
        <p className="text-[13px] text-ink-muted">
          Each person gets it once, ever, and nobody gets more than one campaign email every 3 days. Every email carries a link to unsubscribe.
        </p>
      )}
    </section>
  );
}

/** Send now, with a refusal that has no field beside it (EMAIL_NOT_SET_UP
 *  and the rest, Contract note 8): it describes the button and takes focus. */
export function SendButton({ busy, blocked, refusal, onSend }: { busy: boolean; blocked: boolean; refusal: string | null; onSend: () => void }) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (refusal) ref.current?.focus();
  }, [refusal]);
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={onSend} disabled={busy || blocked} aria-describedby={refusal ? id : undefined} className={PRIMARY}>
        {busy ? 'Sending…' : 'Send now'}
      </button>
      {refusal ? (
        <p ref={ref} id={id} role="alert" data-error tabIndex={-1} className={`max-w-sm text-right text-[11px] text-danger ${FOCUS}`}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Write the editor**

Create `src/pages/campaigns/CampaignBuilder.tsx`:

```tsx
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { createCampaign, fetchAudience, sendCampaign, updateCampaign } from '../../features/campaigns/campaignApi';
import { changedFields, checkDraft, emptyDraft, fromCampaign, needsRoles, toWrite, type CampaignDraft } from '../../features/campaigns/campaignDraft';
import { campaignErrors, hasErrors, sendRefusal, type CampaignErrors } from '../../features/campaigns/campaignErrors';
import { NAME_MAX, SAY, SHARING_NOTE } from '../../features/campaigns/campaignOptions';
import { campaignPath, segmentKindOf } from '../../features/campaigns/campaignText';
import type { Audience, Campaign } from '../../features/campaigns/campaignTypes';
import { useMembers } from '../../features/knowledge/useMembers';
import type { PersonRef, SegmentKind, Sharing } from '../../features/segments/segmentTypes';
import { DEFAULT_ROLES } from '../../features/surveys/questions';
import { CampaignAudienceFields } from '../../components/campaigns/CampaignAudienceFields';
import { MessageFields } from '../../components/campaigns/MessageFields';
import { PreviewPane } from '../../components/campaigns/PreviewPane';
import { SendButton, SendStep } from '../../components/campaigns/SendStep';
import type { CampaignOutlet } from '../../components/campaigns/useCampaign';
import { useCampaignAudience } from '../../components/campaigns/useCampaignAudience';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { INPUT } from '../../components/plans/styles';
import { ANY_REFUSAL, useRefusalFocus } from '../../components/plans/useRefusalFocus';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { Field } from '../../components/rules/Field';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { SharingFields } from '../../components/segments/SharingFields';
import { useMySegments } from '../../components/surveys/useMySegments';

type Busy = 'save' | 'check' | 'send' | null;

/** Active teammates to share with, the owner left out; someone deactivated
 *  since is dropped once the members load (as Segments and Surveys do). */
function useTeammates(sharedWith: PersonRef[]) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const teammates = useMemo(() => members.filter((m) => m.is_active && m.id !== me).map((m) => ({ id: m.id, name: m.name })), [members, me]);
  const shared = members.length > 0 ? sharedWith.filter((person) => teammates.some((mate) => mate.id === person.id)) : sharedWith;
  return { teammates, shared };
}

/** The editor (spec §2.2) for a new campaign or one of mine. */
export function CampaignForm({ initial, onClose, onDone }: { initial: Campaign | null; onClose: () => void; onDone: (saved: Campaign, sendId?: number) => void }) {
  const workspace = useAppSelector((state) => state.auth.user?.organisation?.name ?? 'your company');
  const sender = useAppSelector((state) => state.auth.user?.name ?? 'You');
  const nameId = useId();
  const reasonId = useId();
  const [draft, setDraft] = useState<CampaignDraft>(() => (initial ? fromCampaign(initial) : emptyDraft()));
  const [saved, setSaved] = useState<Campaign | null>(initial);
  const [version, setVersion] = useState(0);
  const [errors, setErrors] = useState<CampaignErrors>({});
  const [confirm, setConfirm] = useState<Audience | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [contact, setContact] = useState<number | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const submit = useSubmitOnce();
  const { ref: bodyRef, focusRefusal } = useRefusalFocus<HTMLDivElement>(ANY_REFUSAL);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const backToSend = useRef(false);
  useEffect(() => {
    if (confirm) {
      confirmRef.current?.focus();
      return;
    }
    if (backToSend.current) {
      backToSend.current = false;
      sendRef.current?.focus();
    }
  }, [confirm]);

  const segments = useMySegments();
  const { teammates, shared } = useTeammates(draft.sharedWith);
  const ready: CampaignDraft = { ...draft, sharedWith: shared };
  const kindOf = (id: number | null): SegmentKind | null =>
    segments.rows?.find((row) => row.id === id)?.kind ?? (initial?.segment && initial.segment.id === id ? segmentKindOf(initial.segment.kind) : null);
  const kind = kindOf(draft.segment);
  // A new campaign waits for my segments: until then a segment's kind is unknown.
  const segmentsLoading = !initial && segments.rows === null;
  const audience = useCampaignAudience(saved?.segment ? saved.id : null, version);
  const stale = saved !== null && (draft.segment !== (saved.segment?.id ?? null) || (needsRoles(kind) && draft.roles.join() !== saved.roles.join()));
  const change = (patch: Partial<CampaignDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const clear = (...keys: (keyof CampaignErrors)[]) =>
    setErrors((current) => {
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });

  // Why Send now… is off, or null when it can go.
  let reason: string | null = null;
  if (segmentsLoading) reason = 'Loading your segments…';
  else if (saved?.status === 'archived') reason = SAY.ARCHIVED;
  else if (draft.segment === null) reason = 'Choose a segment to send.';
  else if (needsRoles(kind) && draft.roles.length === 0) reason = 'Choose at least one role to send.';

  // Once something was saved, closing counts as done.
  const close = () => (saved && saved !== initial ? onDone(saved) : onClose());

  /** POST the first time, then PATCH only what changed (never a second draft). */
  async function persist(): Promise<Campaign> {
    const body = toWrite(ready, kind);
    if (!saved) {
      const created = await createCampaign(body);
      setSaved(created);
      setVersion((n) => n + 1);
      return created;
    }
    const patch = changedFields(body, saved);
    if (Object.keys(patch).length === 0) return saved;
    const updated = await updateCampaign(saved.id, patch);
    setSaved(updated);
    setVersion((n) => n + 1);
    return updated;
  }

  function refuse(found: CampaignErrors) {
    setErrors(found);
    focusRefusal();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = checkDraft(ready, kind);
    if (hasErrors(found)) {
      refuse(found);
      return;
    }
    setErrors({});
    setBusy('save');
    const outcome = await submit.run(persist);
    if (!outcome) return;
    setBusy(null);
    if (outcome.ok) onDone(outcome.value);
    else refuse(campaignErrors(outcome.error));
  }

  /** Save, then ask the server once more whom it reaches, then confirm. */
  async function startSend() {
    const found = checkDraft(ready, kind, { forSend: true });
    if (hasErrors(found)) {
      refuse(found);
      return;
    }
    setErrors({});
    setBusy('check');
    const outcome = await submit.run(async () => fetchAudience((await persist()).id));
    if (!outcome) return;
    setBusy(null);
    if (!outcome.ok) {
      refuse(campaignErrors(outcome.error));
      return;
    }
    setRefusal(null);
    setConfirm(outcome.value);
  }

  async function sendIt() {
    if (!saved) return;
    setRefusal(null);
    setBusy('send');
    const outcome = await submit.run(() => sendCampaign(saved.id));
    if (!outcome) return;
    setBusy(null);
    if (outcome.ok) {
      onDone(saved, outcome.value.id);
      return;
    }
    const refused = sendRefusal(outcome.error);
    if (refused.at === 'send') setRefusal(refused.message);
    else {
      setConfirm(null);
      refuse(refused.errors);
    }
  }

  return (
    <BuilderDialog title={initial ? `Edit ${initial.name}` : 'New campaign'} onClose={close}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {errors.form ? (
            <p role="alert" data-error tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
              {errors.form}
            </p>
          ) : null}
          {confirm ? (
            <SendStep name={draft.name.trim()} audience={confirm} headingRef={confirmRef} />
          ) : (
            <div data-part="builder-columns" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
              <div className="flex min-w-0 flex-col divide-y divide-line-subtle">
                <div className="flex flex-col gap-2 pb-4">
                  <Field id={nameId} label="Name" error={errors.name}>
                    {(aria) => (
                      <input
                        id={nameId}
                        {...aria}
                        value={draft.name}
                        maxLength={NAME_MAX}
                        placeholder="Win-back"
                        onChange={(event) => {
                          change({ name: event.target.value });
                          clear('name');
                        }}
                        className={`${INPUT} ${errors.name ? 'border-danger' : 'border-line'}`}
                      />
                    )}
                  </Field>
                  {initial?.needs_segment ? <p className="text-[13px] text-ink-muted">Its old recipients were picked by hand. Choose a segment to send it.</p> : null}
                </div>
                <div className="py-4">
                  <CampaignAudienceFields
                    segments={segments.rows}
                    segmentsError={segments.error}
                    segmentId={draft.segment}
                    fallback={initial?.segment ?? null}
                    roles={draft.roles}
                    kind={kind}
                    errors={{ segment: errors.segment, roles: errors.roles }}
                    onSegment={(id) => {
                      // A contact segment asks no roles; coming back starts from the defaults.
                      change({ segment: id, ...(kindOf(id) === 'contact' ? { roles: [...DEFAULT_ROLES] } : {}) });
                      clear('segment', 'roles');
                    }}
                    onRoles={(roles) => {
                      change({ roles });
                      clear('roles');
                    }}
                  />
                </div>
                <div className="py-4">
                  <MessageFields
                    subject={draft.subject}
                    body={draft.body}
                    errors={{ subject: errors.subject, body: errors.body }}
                    onSubject={(subject) => {
                      change({ subject });
                      clear('subject');
                    }}
                    onBody={(body) => {
                      change({ body });
                      clear('body');
                    }}
                  />
                </div>
                <div className="pt-4">
                  <SharingFields
                    sharing={draft.sharing}
                    sharedWith={shared}
                    teammates={teammates}
                    error={errors.shared_with ?? errors.sharing ?? null}
                    onChange={(sharing: Sharing, sharedWith: PersonRef[]) => {
                      change({ sharing, sharedWith });
                      clear('sharing', 'shared_with');
                    }}
                    note={SHARING_NOTE}
                  />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0">
                <PreviewPane
                  campaignId={saved?.id ?? null}
                  subject={draft.subject}
                  body={draft.body}
                  audience={audience}
                  contact={contact}
                  onContact={setContact}
                  stale={stale}
                  sender={sender}
                  workspace={workspace}
                />
              </div>
            </div>
          )}
        </div>
        <div data-part="builder-footer" className="flex flex-wrap items-start justify-end gap-2 border-t border-line-subtle px-4 py-3">
          {confirm ? (
            <>
              <button
                type="button"
                onClick={() => {
                  backToSend.current = true;
                  setConfirm(null);
                }}
                disabled={submit.busy}
                className={QUIET}
              >
                Back
              </button>
              <SendButton busy={busy === 'send'} blocked={confirm.reach === 0} refusal={refusal} onSend={() => void sendIt()} />
            </>
          ) : (
            <>
              {reason ? (
                <p id={reasonId} className="basis-full self-center text-[11px] text-ink-muted sm:mr-auto sm:basis-auto">
                  {reason}
                </p>
              ) : null}
              <button type="button" onClick={close} className={QUIET}>
                Cancel
              </button>
              <button type="submit" disabled={submit.busy || segmentsLoading} className={`${QUIET} border border-line`}>
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button
                ref={sendRef}
                type="button"
                onClick={() => void startSend()}
                disabled={submit.busy || reason !== null}
                aria-describedby={reason ? reasonId : undefined}
                className={PRIMARY}
              >
                {busy === 'check' ? 'Checking…' : 'Send now…'}
              </button>
            </>
          )}
        </div>
      </form>
    </BuilderDialog>
  );
}

/** /campaigns/new: the editor over the list. Saving or sending opens the campaign. */
export function NewCampaignRoute() {
  const navigate = useNavigate();
  return <CampaignForm initial={null} onClose={() => navigate('/campaigns')} onDone={(saved, sendId) => navigate(campaignPath(saved.id, sendId))} />;
}

/** /campaigns/:id/edit: the editor over the campaign's page, which has read
 *  it; anyone but the owner reads a notice. */
export function EditCampaignRoute() {
  const navigate = useNavigate();
  const { campaign, onReplace } = useOutletContext<CampaignOutlet>();
  const close = () => navigate(`/campaigns/${campaign.id}`);
  if (!campaign.is_owner) {
    return (
      <BuilderDialog title={`Edit ${campaign.name}`} onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${campaign.owner.name} can edit this campaign`}
            detail="Ask them to change it or to send it."
            action={
              <Link to={`/campaigns/${campaign.id}`} className={`${QUIET} border border-line`}>
                Open campaign
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  return (
    <CampaignForm
      initial={campaign}
      onClose={close}
      onDone={(saved, sendId) => {
        onReplace(saved);
        navigate(campaignPath(saved.id, sendId));
      }}
    />
  );
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/pages/campaigns/CampaignBuilder.test.tsx src/components/surveys/RoleFields.test.tsx src/components/surveys src/pages/surveys src/components/rules`
Expected: PASS. Surveys and Rules still read "Who to ask at each organisation".

- [ ] **Step 8: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/campaigns src/components/surveys/RoleFields.tsx src/components/surveys/RoleFields.test.tsx src/pages/campaigns`
Expected: no output.

```bash
git add src/components/campaigns src/components/surveys/RoleFields.tsx src/components/surveys/RoleFields.test.tsx src/pages/campaigns
git commit -m "$(cat <<'EOF'
feat(campaigns): the editor modal with Save and Send now on a fresh count

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: A campaign's sends and their deliveries

Spec §2.3 (one row per send: the date, "Sent by <name>" or "From rule <name>" unlinked when the rule isn't readable, sent and skipped counts; "Migrated"; a `sending` send shows "Sending…" and refreshes until it finishes; opening a send shows its subject and body as sent, and its deliveries: filters All / Sent / Skipped with a reason select; each row the contact linked, its organisation or account, the status and the reason in words; "N more people you can't open"); §1.7 (twice filtered); Decisions 7, 8; Contract notes 6, 7, 10.

**Files:**
- Create: `src/components/campaigns/useSendPoll.ts`, `src/components/campaigns/Deliveries.tsx`, `src/components/campaigns/SendsSection.tsx`
- Modify: `src/pages/campaigns/CampaignPage.tsx`
- Test: `src/pages/campaigns/CampaignSends.test.tsx`

**Interfaces:**
- Consumes: Task 1's `countsParts`, `sendByText`, `sendDay`, `reasonText`, `hiddenPeople`, `recordPath`, `SKIP_ORDER`, `REASON_LABEL`, `SENDING_POLL_MS`; Task 2's `fetchSends`, `fetchCampaignSend`, `fetchDeliveries`, `fetchCampaign`, `openSendOf`, `withOpenSend`, `DeliveryShow`, `SENDING_SEND`, `SENDS`; Task 4's `DeliveryStatus`.
- Produces:
  - `useSendPoll(campaignId, send, onUpdate, intervalMs = SENDING_POLL_MS)`.
  - `Deliveries({ campaignId, sendId })` (`aria-label="Deliveries"`; list "People"; `[data-delivery]`; `[data-part="hidden"]`).
  - `SendsSection({ campaign, version, onFinished })` (list "Sends"; `<li data-send={id}>`; `[data-part="figures"]`, `[data-part="as-sent"]`). `version` reads the list again (Task 9).
  - `CampaignPage`'s `CampaignView` gains `refresh()` (reads the campaign again) and `sendsVersion` state.

- [ ] **Step 1: Write the failing test**

Create `src/pages/campaigns/CampaignSends.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SENDING_SEND, SENDS } from '../../features/campaigns/testCampaignFixtures';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const send = (id: number) => document.querySelector(`[data-send="${id}"]`) as HTMLElement;
const people = async () => within(await screen.findByRole('list', { name: 'People' })).getAllByRole('listitem');

describe("a campaign's sends (spec §2.3)", () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetViewport();
  });

  it('lists each send newest first: the day, who sent it, the figures in mono, Migrated marked', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/14');
    const list = await screen.findByRole('list', { name: 'Sends' });
    expect(within(list).getAllByRole('listitem').map((item) => item.getAttribute('data-send'))).toEqual(['42', '43']);
    expect(send(42)).toHaveTextContent('28 Sep 2026');
    expect(within(send(42)).getByRole('link', { name: 'EMEA renewals' })).toHaveAttribute('href', '/scenarios/rules/8');
    expect(send(42)).toHaveTextContent('From rule EMEA renewals');
    const figures = send(42).querySelector('[data-part="figures"]') as HTMLElement;
    expect(figures).toHaveTextContent('2 sent · 1 skipped');
    expect([...figures.querySelectorAll('.font-mono-brand')].map((node) => node.textContent)).toEqual(['2', '1']);
    expect(send(43)).toHaveTextContent('Sent');
    expect(send(43)).toHaveTextContent('Migrated');
  });

  it('opens a send from the URL: what went out, and who it reached, with status and reason in words', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/11?send=41');
    expect(await within(await screen.findByRole('list', { name: 'Sends' })).findByRole('button', { name: '2 Oct 2026' })).toHaveAttribute('aria-expanded', 'true');
    expect(send(41).querySelector('[data-part="as-sent"]')).toHaveTextContent('Checking in, {first_name}');
    const rows = await people();
    expect(rows.map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Sam Patel', 'Lee Wong', 'Kim Lee', 'Ana Ruiz']);
    expect(within(rows[0]).getByRole('link', { name: 'Sam Patel' })).toHaveAttribute('href', '/contacts/51');
    expect(within(rows[0]).getByRole('link', { name: 'Globex' })).toHaveAttribute('href', '/organizations/1');
    expect(rows[0].querySelector('[data-delivery-status]')).toHaveTextContent('Sent');
    expect(rows[2].querySelector('[data-delivery-status]')).toHaveTextContent('Skipped');
    expect(rows[2]).toHaveTextContent("Couldn't be delivered");
    expect(rows[3].querySelector('[data-delivery-status]')).toHaveTextContent('Skipped');
    expect(rows[3]).toHaveTextContent('Unsubscribed');
  });

  it('filters by Sent or Skipped, and by a reason only with Skipped', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/11?send=41');
    await people();
    const show = screen.getByRole('group', { name: 'Show' });
    expect(within(show).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox', { name: 'Reason' })).toBeNull();
    await userEvent.click(within(show).getByRole('button', { name: 'Skipped' }));
    await waitFor(async () => expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Kim Lee', 'Ana Ruiz']));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Reason' }), 'unsubscribed');
    await waitFor(async () => expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Ana Ruiz']));
    const last = requestsOf(spy, 'GET', /^\/campaigns\/11\/sends\/41\/deliveries\/$/).at(-1);
    expect(last?.query.get('status')).toBe('skipped');
    expect(last?.query.get('reason')).toBe('unsubscribed');
    await userEvent.click(within(show).getByRole('button', { name: 'Sent' }));
    await waitFor(async () => expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Sam Patel', 'Lee Wong']));
    expect(screen.queryByRole('combobox', { name: 'Reason' })).toBeNull();
  });

  it("counts the people the reader may not open, and never names them", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/14?send=42');
    expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Pia Holm', 'Eva Lind']);
    expect(document.querySelector('[data-part="hidden"]')).toHaveTextContent("1 more person you can't open");
    expect(screen.queryByText('Ola Berg')).toBeNull();
  });

  it('keeps the open send in the URL', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/11');
    const toggle = await within(await screen.findByRole('list', { name: 'Sends' })).findByRole('button', { name: '2 Oct 2026' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(where()).toBe('/campaigns/11?send=41'));
    await userEvent.click(toggle);
    await waitFor(() => expect(where()).toBe('/campaigns/11'));
  });

  it('pages the people with Show more people', async () => {
    stubCampaigns({ pageSize: 2 });
    renderCampaigns('/campaigns/11?send=41');
    expect(await people()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Show more people' }));
    await waitFor(async () => expect(await people()).toHaveLength(4));
  });

  it('says Sending…, reads the send again every 3 seconds until it is sent, then reads the campaign again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { spy } = stubCampaigns({ sends: [...SENDS, SENDING_SEND], stillSending: 1 });
    renderCampaigns('/campaigns/11');
    await waitFor(() => expect(send(45)).toHaveTextContent('Sending…'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(requestsOf(spy, 'GET', /^\/campaigns\/11\/sends\/45\/$/)).toHaveLength(1);
    expect(send(45)).toHaveTextContent('Sending…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await waitFor(() => expect(send(45).querySelector('[data-part="figures"]')).toHaveTextContent('1 sent · 0 skipped'));
    await waitFor(() => expect(requestsOf(spy, 'GET', /^\/campaigns\/11\/$/)).toHaveLength(2));
  });

  it('says when it has not been sent yet', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/12');
    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 src/pages/campaigns/CampaignSends.test.tsx`
Expected: FAIL: no list named "Sends".

- [ ] **Step 3: Write the poll and the deliveries**

Create `src/components/campaigns/useSendPoll.ts`:

```ts
import { useEffect, useRef } from 'react';
import { fetchCampaignSend } from '../../features/campaigns/campaignApi';
import { SENDING_POLL_MS } from '../../features/campaigns/campaignOptions';
import type { CampaignSend } from '../../features/campaigns/campaignTypes';

/** While a send is `sending` (Contract note 7), read it again every
 *  `intervalMs`; each answer is handed on, and a failed read hands back a
 *  copy so the next one is scheduled. Stops once it is `sent` or unmounted. */
export function useSendPoll(campaignId: number, send: CampaignSend, onUpdate: (send: CampaignSend) => void, intervalMs = SENDING_POLL_MS) {
  const update = useRef(onUpdate);
  useEffect(() => {
    update.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    if (send.status !== 'sending') return;
    let alive = true;
    const timer = window.setTimeout(() => {
      fetchCampaignSend(campaignId, send.id).then(
        (next) => {
          if (alive) update.current(next);
        },
        () => {
          if (alive) update.current({ ...send });
        },
      );
    }, intervalMs);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [campaignId, send, intervalMs]);
}
```

Create `src/components/campaigns/Deliveries.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Network } from 'lucide-react';
import { fetchDeliveries } from '../../features/campaigns/campaignApi';
import { REASON_LABEL, SKIP_ORDER } from '../../features/campaigns/campaignOptions';
import type { DeliveryShow } from '../../features/campaigns/campaignParams';
import { hiddenPeople, reasonText, recordPath } from '../../features/campaigns/campaignText';
import type { Delivery, SkipReason } from '../../features/campaigns/campaignTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { ItemSkeleton, MoreButton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { DeliveryStatus } from './parts';

const SHOW: readonly { value: DeliveryShow; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'skipped', label: 'Skipped' },
];
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';
const LINK = `inline-flex min-h-11 min-w-0 items-center gap-1 rounded-sm text-[13px] text-ink hover:underline sm:min-h-0 ${FOCUS}`;

type Load = { key: string; rows: Delivery[] | null; next: string | null; hidden: number; error: string | null };

function DeliveryRow({ delivery }: { delivery: Delivery }) {
  const record = delivery.record;
  const RecordIcon = record?.kind === 'account' ? Layers : Network;
  return (
    <li data-delivery={delivery.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
      <Link to={`/contacts/${delivery.contact.id}`} className={`${LINK} font-semibold`}>
        {delivery.contact.name}
      </Link>
      {record ? (
        <Link to={recordPath(record)} className={`${LINK} text-ink-muted`}>
          <RecordIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{record.name}</span>
        </Link>
      ) : null}
      <DeliveryStatus status={delivery.status} />
      {delivery.reason ? <span className="text-[13px] text-ink-muted">{reasonText(delivery.reason)}</span> : null}
    </li>
  );
}

/** A send's deliveries (spec §2.3): only people the reader may open, a count
 *  of the rest; All / Sent / Skipped and, with Skipped, a reason (Decision 8). */
export function Deliveries({ campaignId, sendId }: { campaignId: number; sendId: number }) {
  const reasonId = useId();
  const [show, setShow] = useState<DeliveryShow>('all');
  const [reason, setReason] = useState<SkipReason | ''>('');
  const [attempt, setAttempt] = useState(0);
  const key = `${show}|${reason}|${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  useEffect(() => {
    let alive = true;
    const [shown, why] = key.split('|') as [DeliveryShow, SkipReason | ''];
    fetchDeliveries(campaignId, sendId, shown, why, null).then(
      (page) => {
        if (alive) setLoad({ key, rows: page.results, next: page.next, hidden: page.hidden, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key, rows: null, next: null, hidden: 0, error: errorMessage(err, 'Could not load who it reached.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [campaignId, sendId, key]);
  const current = load?.key === key ? load : null;
  const hidden = hiddenPeople(current?.hidden ?? 0);

  async function showMore() {
    if (!current?.next || !current.rows) return;
    setMore({ busy: true, error: null });
    try {
      const page = await fetchDeliveries(campaignId, sendId, show, reason, current.next);
      setLoad({ ...current, rows: [...current.rows, ...page.results], next: page.next, hidden: page.hidden });
      setMore({ busy: false, error: null });
    } catch (err) {
      setMore({ busy: false, error: errorMessage(err, 'Could not load more people.') });
    }
  }

  return (
    <section aria-label="Deliveries" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
          {SHOW.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={show === option.value}
              onClick={() => {
                setShow(option.value);
                setReason('');
              }}
              className={`${QUIET} border ${show === option.value ? 'border-line-strong bg-subtle' : 'border-line'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {show === 'skipped' ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={reasonId} className={LABEL}>
              Reason
            </label>
            <select id={reasonId} value={reason} onChange={(event) => setReason(event.target.value as SkipReason | '')} className={FILTER_SELECT}>
              <option value="">All reasons</option>
              {SKIP_ORDER.map((one) => (
                <option key={one} value={one}>
                  {REASON_LABEL[one]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {!current ? <ItemSkeleton count={3} label="Loading who it reached" avatar={false} /> : null}
      {current?.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{current.error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : null}
      {current?.rows && current.rows.length === 0 ? <p className="text-[13px] text-ink-muted">Nobody here you can open.</p> : null}
      {current?.rows && current.rows.length > 0 ? (
        <ul aria-label="People" className="flex flex-col divide-y divide-line-subtle">
          {current.rows.map((delivery) => (
            <DeliveryRow key={delivery.id} delivery={delivery} />
          ))}
        </ul>
      ) : null}
      {hidden ? (
        <p data-part="hidden" className="text-[11px] text-ink-muted">
          <span className={MONO}>{hidden.n}</span> {hidden.text}
        </p>
      ) : null}
      {current ? <MoreButton next={current.next} loading={more.busy} error={more.error} label="Show more people" onClick={() => void showMore()} /> : null}
    </section>
  );
}
```

- [ ] **Step 4: Write the sends section**

Create `src/components/campaigns/SendsSection.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Clock } from 'lucide-react';
import { fetchSends } from '../../features/campaigns/campaignApi';
import { openSendOf, withOpenSend } from '../../features/campaigns/campaignParams';
import { countsParts, sendByText, sendDay } from '../../features/campaigns/campaignText';
import type { Campaign, CampaignSend } from '../../features/campaigns/campaignTypes';
import { EmptyState, ErrorBlock, ItemSkeleton, MoreButton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Parts } from '../rules/Parts';
import { Deliveries } from './Deliveries';
import { useSendPoll } from './useSendPoll';

const BADGE = 'shrink-0 rounded-full bg-subtle px-1.5 text-[11px] font-semibold text-ink-muted';
const LINK = `inline-flex min-h-11 items-center rounded-sm font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

/** "From rule <link>", or the plain words (Contract note 10). */
function SentBy({ send }: { send: CampaignSend }) {
  if (send.kind === 'rule' && send.rule && send.rule.id !== null) {
    return (
      <span className="text-[13px] text-ink-muted">
        From rule{' '}
        <Link to={`/scenarios/rules/${send.rule.id}`} className={LINK}>
          {send.rule.name}
        </Link>
      </span>
    );
  }
  return <span className="text-[13px] text-ink-muted">{sendByText(send)}</span>;
}

function SendRow({ campaignId, send, open, onToggle, onUpdate }: {
  campaignId: number;
  send: CampaignSend;
  open: boolean;
  onToggle: () => void;
  onUpdate: (send: CampaignSend) => void;
}) {
  const panelId = useId();
  useSendPoll(campaignId, send, onUpdate);
  return (
    <li data-send={send.id} className="flex flex-col rounded-xl bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
          className={`flex min-h-11 items-center gap-2 rounded-lg text-left text-[13px] font-semibold text-ink sm:min-h-9 ${FOCUS}`}
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          {sendDay(send)}
        </button>
        <SentBy send={send} />
        {send.migrated ? <span className={BADGE}>Migrated</span> : null}
        {send.status === 'sending' ? (
          <span role="status" className="inline-flex items-center gap-1 text-[13px] text-ink-muted sm:ml-auto">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Sending…
          </span>
        ) : (
          <span data-part="figures" className="text-[13px] text-ink-muted sm:ml-auto">
            <Parts parts={countsParts(send.counts)} />
          </span>
        )}
      </div>
      {open ? (
        <div id={panelId} className="flex flex-col gap-3 border-t border-line-subtle px-3 py-3">
          <div data-part="as-sent" className="flex max-w-[70ch] flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">As sent</p>
            <p className="break-words text-[13px] font-semibold text-ink">{send.subject}</p>
            <p className="whitespace-pre-wrap break-words text-[13px] text-ink">{send.body}</p>
          </div>
          <Deliveries campaignId={campaignId} sendId={send.id} />
        </div>
      ) : null}
    </li>
  );
}

type Load = { key: string; rows: CampaignSend[] | null; next: string | null; error: string | null };

/** The campaign's sends (spec §2.3), newest first, each a disclosure that
 *  opens what went out and to whom; `?send=` opens one (Decision 7). A
 *  send that finishes while shown reads the campaign again (`onFinished`). */
export function SendsSection({ campaign, version, onFinished }: { campaign: Campaign; version: number; onFinished: () => void }) {
  const headingId = useId();
  const [search, setSearch] = useSearchParams();
  const openId = openSendOf(search);
  const [attempt, setAttempt] = useState(0);
  const key = `${campaign.id}|${version}|${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  useEffect(() => {
    let alive = true;
    fetchSends(campaign.id, null).then(
      (page) => {
        if (alive) setLoad({ key, rows: page.results, next: page.next, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key, rows: null, next: null, error: errorMessage(err, 'Could not load its sends.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [campaign.id, key]);
  const current = load?.key === key ? load : null;

  const replace = (next: CampaignSend) => {
    const before = current?.rows?.find((row) => row.id === next.id);
    setLoad((last) => (last?.rows ? { ...last, rows: last.rows.map((row) => (row.id === next.id ? next : row)) } : last));
    if (before?.status === 'sending' && next.status === 'sent') onFinished();
  };
  const toggle = (id: number) => setSearch((prev) => withOpenSend(prev, openId === id ? null : id), { replace: true });

  async function showMore() {
    if (!current?.next || !current.rows) return;
    setMore({ busy: true, error: null });
    try {
      const page = await fetchSends(campaign.id, current.next);
      setLoad({ ...current, rows: [...current.rows, ...page.results], next: page.next });
      setMore({ busy: false, error: null });
    } catch (err) {
      setMore({ busy: false, error: errorMessage(err, 'Could not load more sends.') });
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-[15px] font-semibold text-ink">
        Sends
      </h2>
      {!current ? <ItemSkeleton count={2} label="Loading its sends" avatar={false} /> : null}
      {current?.error ? <ErrorBlock message={current.error} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {current?.rows && current.rows.length === 0 ? (
        <EmptyState
          title="Not sent yet"
          detail={campaign.is_owner ? 'Each send is kept here with who it reached and who was skipped.' : 'Its owner has not sent it yet.'}
          action={null}
        />
      ) : null}
      {current?.rows && current.rows.length > 0 ? (
        <>
          <ul aria-label="Sends" className="flex flex-col gap-1.5">
            {current.rows.map((send) => (
              <SendRow key={send.id} campaignId={campaign.id} send={send} open={send.id === openId} onToggle={() => toggle(send.id)} onUpdate={replace} />
            ))}
          </ul>
          <MoreButton next={current.next} loading={more.busy} error={more.error} label="Show more sends" onClick={() => void showMore()} />
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Put the sends on the page**

In `src/pages/campaigns/CampaignPage.tsx`:

1. Change the first import to `import { useCallback, useState } from 'react';` plus `import { Outlet, useParams } from 'react-router-dom';`, and add `import { fetchCampaign } from '../../features/campaigns/campaignApi';` and `import { SendsSection } from '../../components/campaigns/SendsSection';`.
2. Replace `CampaignView` with:

```tsx
function CampaignView({ campaign, onReplace }: { campaign: Campaign; onReplace: (campaign: Campaign) => void }) {
  // Task 9 bumps this after a send, so the sends read again.
  const [sendsVersion] = useState(0);
  /** Read the campaign again (a send finished: its status and last send moved). */
  const refresh = useCallback(() => {
    fetchCampaign(campaign.id).then(onReplace, () => undefined);
  }, [campaign.id, onReplace]);
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <CampaignHeader campaign={campaign} onReplace={onReplace} />
        <LegacyRecipients campaign={campaign} />
        <SendsSection campaign={campaign} version={sendsVersion} onFinished={refresh} />
      </div>
      {/* /campaigns/:id/edit: the editor over this page. */}
      <Outlet context={{ campaign, onReplace } satisfies CampaignOutlet} />
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/pages/campaigns`
Expected: PASS (CampaignSends 8 tests; CampaignPage, CampaignBuilder and CampaignsHome still pass).

- [ ] **Step 7: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/campaigns src/pages/campaigns`
Expected: no output.

```bash
git add src/components/campaigns src/pages/campaigns
git commit -m "$(cat <<'EOF'
feat(campaigns): a campaign's sends, polling a send that is going out, and its deliveries

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Send now… on the campaign's page

Spec §2.3 (for the owner: Send now…), §2.2 (the confirm step with a fresh count; `EMAIL_NOT_SET_UP` at the Send button; submit once); Decisions 6, 7; Contract note 8.

**Files:**
- Create: `src/components/campaigns/SendDialog.tsx`
- Modify: `src/components/campaigns/CampaignHeader.tsx`, `src/components/campaigns/useCampaign.ts`, `src/pages/campaigns/CampaignPage.tsx`, `src/pages/campaigns/CampaignBuilder.tsx`
- Test: `src/pages/campaigns/CampaignSendNow.test.tsx`

**Interfaces:**
- Consumes: Task 7's `SendStep`, `SendButton`; Task 2's `fetchAudience`, `sendCampaign`, `sendRefusal`, `campaignPath`; `BuilderDialog` (`size="narrow"`, Plans).
- Produces:
  - `SendDialog({ campaign, onClose, onSent(send: CampaignSend) })`.
  - `CampaignHeader` gains `onSent(sendId: number)`; it shows **Send now…** for the owner of a campaign that is not archived and has a segment.
  - `CampaignOutlet` gains `onSent(sendId: number): void`; `CampaignView.onSent` reads the sends and the campaign again and opens `/campaigns/:id?send=<sid>` (replacing the entry, which also closes the editor).

- [ ] **Step 1: Write the failing test**

Create `src/pages/campaigns/CampaignSendNow.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/campaigns/campaignOptions';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const meta = () => document.querySelector('[data-part="meta"]') as HTMLElement;

describe('Send now… on a campaign page (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('counts again, sends once, and opens the new send with the campaign now active', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/12');
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion news' });
    await waitFor(() => expect(dialog.querySelector('[data-part="audience"]')).toHaveTextContent('Emails 3 people · Skips 1 without an email'));
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/12?send=500'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/sends\/$/)).toHaveLength(1);
    await waitFor(() => expect(meta()).toHaveTextContent('Active'));
    const row = await waitFor(() => {
      const found = document.querySelector('[data-send="500"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(within(row).getByRole('button', { name: /Oct 2026/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await within(row).findByRole('link', { name: 'Rosa Diaz' })).toBeInTheDocument();
  });

  it('keeps EMAIL_NOT_SET_UP at the Send button, focused, and stays open', async () => {
    stubCampaigns({ noEmail: true });
    renderCampaigns('/campaigns/12');
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion news' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send now' }));
    const refusal = await within(dialog).findByRole('alert');
    expect(refusal).toHaveTextContent(SAY.EMAIL_NOT_SET_UP);
    expect(document.activeElement).toBe(refusal);
    expect(where()).toBe('/campaigns/12');
  });

  it('will not send to nobody', async () => {
    stubCampaigns({ people: { 9: [] } });
    renderCampaigns('/campaigns/12');
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion news' });
    expect(await within(dialog).findByText(SAY.NOBODY)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeDisabled();
  });

  it.each([
    ['a teammate’s', 14],
    ['an archived', 16],
    ['a migrated draft with no segment, as', 13],
  ])('offers no Send now… on %s campaign', async (_, id) => {
    stubCampaigns();
    renderCampaigns(`/campaigns/${id}`);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Send now…' })).toBeNull();
  });

  it('a send from the editor over the page opens on the page, which reads again', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/12/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Champion news' });
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/12?send=500'));
    await waitFor(() => expect(meta()).toHaveTextContent('Active'));
    await waitFor(() => expect(document.querySelector('[data-send="500"]')).not.toBeNull());
  });
});
```

(The `it.each` titles use a typographic apostrophe only inside the test title, not UI copy.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 src/pages/campaigns/CampaignSendNow.test.tsx`
Expected: FAIL: no "Send now…" button on the page.

- [ ] **Step 3: Write the dialog**

Create `src/components/campaigns/SendDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { fetchAudience, sendCampaign } from '../../features/campaigns/campaignApi';
import { campaignErrors, sendRefusal } from '../../features/campaigns/campaignErrors';
import type { Audience, Campaign, CampaignSend } from '../../features/campaigns/campaignTypes';
import { ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BuilderDialog } from '../segments/BuilderDialog';
import { SendButton, SendStep } from './SendStep';

type Load = { key: number; audience: Audience | null; error: string | null };
const FALLBACK = 'Could not send it. Try again.';

/** Send now… from the campaign's page (Decision 6): the editor's confirm
 *  step in the narrow builder dialog, on a count read when it opens. */
export function SendDialog({ campaign, onClose, onSent }: { campaign: Campaign; onClose: () => void; onSent: (send: CampaignSend) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const submit = useSubmitOnce();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let alive = true;
    fetchAudience(campaign.id).then(
      (audience) => {
        if (alive) setLoad({ key: attempt, audience, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key: attempt, audience: null, error: Object.values(campaignErrors(err, 'Could not count who it reaches.'))[0] ?? FALLBACK });
      },
    );
    return () => {
      alive = false;
    };
  }, [campaign.id, attempt]);
  const current = load?.key === attempt ? load : null;
  const audience = current?.audience ?? null;
  useEffect(() => {
    if (audience) headingRef.current?.focus();
  }, [audience]);

  async function send() {
    setRefusal(null);
    const outcome = await submit.run(() => sendCampaign(campaign.id));
    if (!outcome) return;
    if (outcome.ok) {
      onSent(outcome.value);
      return;
    }
    const refused = sendRefusal(outcome.error);
    setRefusal(refused.at === 'send' ? refused.message : (Object.values(refused.errors)[0] ?? FALLBACK));
  }

  return (
    <BuilderDialog size="narrow" title={`Send ${campaign.name}`} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
        {!current ? <ItemSkeleton count={1} label="Counting who it reaches" avatar={false} /> : null}
        {current?.error ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
            <span>{current.error}</span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
              Try again
            </button>
          </div>
        ) : null}
        {audience ? <SendStep name={campaign.name} audience={audience} headingRef={headingRef} /> : null}
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2 border-t border-line-subtle px-4 py-3">
        <button type="button" onClick={onClose} className={QUIET}>
          Cancel
        </button>
        <SendButton busy={submit.busy} blocked={!audience || audience.reach === 0} refusal={refusal} onSend={() => void send()} />
      </div>
    </BuilderDialog>
  );
}
```

- [ ] **Step 4: Offer it in the header, and open the send on the page**

In `src/components/campaigns/useCampaign.ts`, add to `CampaignOutlet`:

```ts
  /** A send went out: read the sends and the campaign again, and open it. */
  onSent: (sendId: number) => void;
```

In `src/components/campaigns/CampaignHeader.tsx`:

1. Add `Send` to the `lucide-react` import, `PRIMARY` to the styles import, and `import { SendDialog } from './SendDialog';`.
2. Change the signature to `export function CampaignHeader({ campaign, onReplace, onSent }: { campaign: Campaign; onReplace: (campaign: Campaign) => void; onSent: (sendId: number) => void })`.
3. Add `const [sending, setSending] = useState(false);` under the `asking` state, and `const canSend = campaign.is_owner && !archived && campaign.segment !== null;`.
4. As the first child of `<div data-part="actions" …>`, add:

```tsx
            {canSend ? (
              <button type="button" onClick={() => setSending(true)} className={PRIMARY}>
                <Send className="h-4 w-4" aria-hidden="true" />
                Send now…
              </button>
            ) : null}
```

5. Before `</header>`, add:

```tsx
      {sending ? (
        <SendDialog
          campaign={campaign}
          onClose={() => setSending(false)}
          onSent={(send) => {
            setSending(false);
            onSent(send.id);
          }}
        />
      ) : null}
```

In `src/pages/campaigns/CampaignPage.tsx`:

1. Add `useNavigate` to the `react-router-dom` import and `import { campaignPath } from '../../features/campaigns/campaignText';`.
2. In `CampaignView`, replace `const [sendsVersion] = useState(0);` with:

```tsx
  const navigate = useNavigate();
  const [sendsVersion, setSendsVersion] = useState(0);
```

and, under `refresh`, add:

```tsx
  /** Decision 7: the new send opens on this page (closing the editor if it was open). */
  const onSent = useCallback(
    (sendId: number) => {
      setSendsVersion((n) => n + 1);
      refresh();
      navigate(campaignPath(campaign.id, sendId), { replace: true });
    },
    [campaign.id, navigate, refresh],
  );
```

3. Pass it on: `<CampaignHeader campaign={campaign} onReplace={onReplace} onSent={onSent} />` and `<Outlet context={{ campaign, onReplace, onSent } satisfies CampaignOutlet} />`.

In `src/pages/campaigns/CampaignBuilder.tsx`, in `EditCampaignRoute`, read `onSent` too (`const { campaign, onReplace, onSent } = useOutletContext<CampaignOutlet>();`) and replace the form's `onDone` with:

```tsx
      onDone={(saved, sendId) => {
        onReplace(saved);
        if (sendId) onSent(sendId);
        else close();
      }}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/pages/campaigns`
Expected: PASS (CampaignSendNow 7 tests, and the earlier page suites).

- [ ] **Step 6: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/campaigns src/pages/campaigns`
Expected: no output.

```bash
git add src/components/campaigns src/pages/campaigns
git commit -m "$(cat <<'EOF'
feat(campaigns): Send now from the campaign page, opening the new send

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The unsubscribe page `/u/:token`

Spec §2.4 (public, outside the signed-in guard and the app frame; reads no store or session; always light; a valid link shows "Stop emails from <workspace>?" with an Unsubscribe button, a button rather than an action on load so link scanners don't unsubscribe people; after the click "You're unsubscribed. You won't get more of these emails."; every bad link gets one expired page; a throttled request gets its own copy); §1.6; Decision 11.

**Files:**
- Create: `src/pages/campaigns/Unsubscribe.tsx`
- Modify: `src/lib/theme.ts`, `src/lib/theme.test.ts`, `src/pages/campaigns/testPages.tsx`
- Test: `src/pages/campaigns/Unsubscribe.test.tsx`

**Interfaces:**
- Consumes: Task 2's `fetchUnsubscribe`, `confirmUnsubscribe`, `stubCampaigns`; `LINK_DAYS`; `THROTTLED`; `RevenactMark`; `useSubmitOnce`.
- Produces: `Unsubscribe` (the `/u/:token` page); `renderUnsubscribe(token, { width? })` in `testPages.tsx` (no store at all); `LIGHT_ONLY` matches `/s/…` and `/u/…`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/theme.test.ts`, append inside the `describe`:

```ts
  it('is always light on the unsubscribe page too (campaigns spec §2.4)', () => {
    expect(themeIsDark('dark', true, '/u/tok-41-51')).toBe(false);
    expect(themeIsDark('system', true, '/u/tok-41-51')).toBe(false);
    expect(themeIsDark('dark', true, '/users')).toBe(true);
  });
```

In `src/pages/campaigns/testPages.tsx`, add `import { Unsubscribe } from './Unsubscribe';` and append:

```tsx
/** The unsubscribe page at /u/<token> with no store at all: it must never
 *  read the session, so any store read would throw here. Phone width by default. */
export function renderUnsubscribe(token: string, { width = 375 }: { width?: number } = {}) {
  setViewport(width);
  const view = render(
    <MemoryRouter initialEntries={[`/u/${encodeURIComponent(token)}`]}>
      <Routes>
        <Route path="/u/:token" element={<Unsubscribe />} />
      </Routes>
    </MemoryRouter>,
  );
  return { unmount: view.unmount };
}
```

Create `src/pages/campaigns/Unsubscribe.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { THROTTLED } from '../../features/surveys/surveyErrors';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderUnsubscribe } from './testPages';

const TOKEN = 'tok-41-51';

describe('/u/:token (spec §2.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('asks before it unsubscribes anyone, so opening the link changes nothing', async () => {
    const { spy } = stubCampaigns();
    renderUnsubscribe(TOKEN);
    expect(screen.getByRole('status', { name: 'Opening the link' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Stop emails from Acme Inc?' })).toHaveClass('text-[22px]');
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/campaigns\/unsubscribe\//)).toHaveLength(0);
  });

  it('unsubscribes once on the button, and says so', async () => {
    const { spy } = stubCampaigns();
    renderUnsubscribe(TOKEN);
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByRole('heading', { level: 1, name: "You're unsubscribed." })).toBeInTheDocument();
    expect(screen.getByText("You won't get more of these emails.")).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/campaigns\/unsubscribe\/tok-41-51\/$/)).toHaveLength(1);
  });

  it('shows one expired page for any bad link', async () => {
    stubCampaigns();
    renderUnsubscribe('nope');
    expect(await screen.findByRole('heading', { level: 1, name: 'This link has expired.' })).toBeInTheDocument();
    expect(screen.getByText('Unsubscribe links work for 365 days.')).toBeInTheDocument();
  });

  it('has its own words when there were too many tries', async () => {
    stubCampaigns({ throttle: true });
    renderUnsubscribe(TOKEN);
    expect(await screen.findByText(THROTTLED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keeps a refused click beside the button, focused, and lets it be tried again', async () => {
    stubCampaigns();
    renderUnsubscribe(TOKEN);
    const button = await screen.findByRole('button', { name: 'Unsubscribe' });
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ detail: 'Request was throttled.' }) })));
    await userEvent.click(button);
    const refusal = await screen.findByRole('alert');
    expect(refusal).toHaveTextContent(THROTTLED);
    expect(document.activeElement).toBe(refusal);
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).not.toBeDisabled();
  });

  it('offers Try again when the link could not be read, then opens it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    renderUnsubscribe(TOKEN);
    expect(await screen.findByText('Could not open this link. Check your connection and try again.')).toBeInTheDocument();
    vi.unstubAllGlobals();
    stubCampaigns();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Stop emails from Acme Inc?' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 src/lib/theme.test.ts src/pages/campaigns/Unsubscribe.test.tsx`
Expected: FAIL: `/u/…` is dark under a dark setting; `./Unsubscribe` does not resolve.

- [ ] **Step 3: Keep `/u/` light**

In `src/lib/theme.ts`, change the header comment's second sentence to "Two exceptions to the setting: the hosted survey form (surveys spec §2.4) and the campaign unsubscribe page (campaigns spec §2.4), both opened by a customer from an email, are light only, whatever the device or a signed-in teammate's setting says." and change `LIGHT_ONLY` to:

```ts
/** Pages that are always light: /s/<token> and /u/<token>. */
export const LIGHT_ONLY = /^\/(s|u)\//;
```

- [ ] **Step 4: Write the page**

Create `src/pages/campaigns/Unsubscribe.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { RevenactMark } from '../../components/shared/RevenactMark';
import { confirmUnsubscribe, fetchUnsubscribe } from '../../features/campaigns/campaignApi';
import { LINK_DAYS } from '../../features/campaigns/campaignOptions';
import { THROTTLED } from '../../features/surveys/surveyErrors';
import { ApiError } from '../../lib/apiClient';

type View =
  | { status: 'loading' }
  | { status: 'live'; workspace: string }
  | { status: 'done' }
  | { status: 'expired' }
  | { status: 'failed'; message: string };

const OFFLINE = 'Could not open this link. Check your connection and try again.';

/** /u/:token (spec §2.4): a customer's one-click unsubscribe, outside the
 *  app frame and the signed-in guard. It reads no store and sends no
 *  session; App's ThemeSynchronizer keeps it light. Opening it changes
 *  nothing: only the button does, so link scanners unsubscribe nobody. */
export function Unsubscribe() {
  const { token = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${token}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; view: View } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchUnsubscribe(token).then(
      (link) => {
        if (alive) setAnswer({ key, view: { status: 'live', workspace: link.workspace } });
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) setAnswer({ key, view: { status: 'expired' } });
        else setAnswer({ key, view: { status: 'failed', message: err instanceof ApiError && err.status === 429 ? THROTTLED : OFFLINE } });
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
            <div role="status" aria-label="Opening the link" className="flex flex-col gap-3">
              <span className="block h-6 w-3/4 animate-pulse rounded bg-subtle" />
              <span className="block h-11 w-40 animate-pulse rounded bg-subtle" />
            </div>
          ) : null}
          {view.status === 'live' ? <Confirm token={token} workspace={view.workspace} onDone={(next) => setAnswer({ key, view: next })} /> : null}
          {view.status === 'done' ? <Message title="You're unsubscribed." detail="You won't get more of these emails." /> : null}
          {view.status === 'expired' ? <Message title="This link has expired." detail={`Unsubscribe links work for ${LINK_DAYS} days.`} /> : null}
          {view.status === 'failed' ? (
            <Message
              title="This page didn't open"
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

function Confirm({ token, workspace, onDone }: { token: string; workspace: string; onDone: (view: View) => void }) {
  const submit = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function unsubscribe() {
    setError(null);
    const outcome = await submit.run(() => confirmUnsubscribe(token));
    if (!outcome) return;
    if (outcome.ok) {
      onDone({ status: 'done' });
      return;
    }
    const err = outcome.error;
    if (err instanceof ApiError && err.status === 404) {
      onDone({ status: 'expired' });
      return;
    }
    setError(err instanceof ApiError && err.status === 429 ? THROTTLED : 'Could not unsubscribe you. Check your connection and try again.');
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[22px] font-semibold text-ink">Stop emails from {workspace}?</h1>
      <p className="text-[13px] text-ink-muted">You will stop getting campaign emails from {workspace}.</p>
      <button type="button" onClick={() => void unsubscribe()} disabled={submit.busy} className={`${PRIMARY} self-start px-5`}>
        {submit.busy ? 'Unsubscribing…' : 'Unsubscribe'}
      </button>
      {error ? (
        <p ref={errorRef} role="alert" data-error tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/lib/theme.test.ts src/pages/campaigns/Unsubscribe.test.tsx`
Expected: PASS (3 + 6 tests).

- [ ] **Step 6: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/lib/theme.ts src/lib/theme.test.ts src/pages/campaigns`
Expected: no output.

```bash
git add src/lib/theme.ts src/lib/theme.test.ts src/pages/campaigns/Unsubscribe.tsx src/pages/campaigns/Unsubscribe.test.tsx src/pages/campaigns/testPages.tsx
git commit -m "$(cat <<'EOF'
feat(campaigns): the public unsubscribe page, light only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: A contact's unsubscribe line and Re-subscribe

Spec §2.5 ("Contact page: 'Unsubscribed from campaigns on <date>' plus a Re-subscribe button with a confirm. It is shown to anyone who can open the contact."), §1.6 (`PATCH contacts/:id/ {campaigns_unsubscribed: false}`; the payload gains `campaigns_unsubscribed_at`); Decision 12; Contract note 13.

**Files:**
- Modify: `src/features/customers/customersSlice.ts`, `src/features/contacts/testContacts.ts`, `src/components/contacts/ContactProfile.tsx`
- Test: `src/components/contacts/ContactProfile.test.tsx`

**Interfaces:**
- Consumes: `updateContact` (customersSlice); `ConfirmDialog`; `dayLabel` (Surveys).
- Produces: `Contact.campaigns_unsubscribed_at?: string | null`; `ContactWritePayload.campaigns_unsubscribed?: false`; the stub's PATCH turns `campaigns_unsubscribed: false` into `campaigns_unsubscribed_at: null`; `ContactProfile`'s `<section aria-label="Campaign emails">`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe` of `src/components/contacts/ContactProfile.test.tsx`:

```tsx
  it("says when they unsubscribed from campaigns, and re-subscribes them after asking (campaigns spec §2.5)", async () => {
    const { spy } = renderProfile(41, { people: [{ ...LUKAS, campaigns_unsubscribed_at: '2026-10-03T12:00:00Z' }] });
    const line = await screen.findByRole('region', { name: 'Campaign emails' });
    expect(line).toHaveTextContent('Unsubscribed from campaigns on 3 Oct 2026');
    expect(line.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(within(line).getByRole('button', { name: 'Re-subscribe' }));
    const dialog = screen.getByRole('dialog', { name: 'Re-subscribe Lukas Vermeer?' });
    expect(dialog).toHaveTextContent('They will get campaign emails again from the next send. Only do this if they asked.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Re-subscribe' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Campaign emails' })).toBeNull());
    const patch = spy.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ campaigns_unsubscribed: false });
  });

  it('shows no campaign line for someone still subscribed, or from a backend without the field', async () => {
    renderProfile(41, { people: [{ ...LUKAS, campaigns_unsubscribed_at: null }] });
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(screen.queryByRole('region', { name: 'Campaign emails' })).toBeNull();
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 src/components/contacts/ContactProfile.test.tsx`
Expected: FAIL: TypeScript-free at runtime, but no region named "Campaign emails".

- [ ] **Step 3: Type the field, the write, and the stub**

In `src/features/customers/customersSlice.ts`:

1. At the end of `interface Contact`, add:

```ts
  /** When they unsubscribed from campaigns through an email's link (campaigns
   *  spec §1.6); null while subscribed. Optional until that backend ships. */
  campaigns_unsubscribed_at?: string | null;
```

2. In `interface ContactWritePayload`, add:

```ts
  /** Only `false`: a person re-subscribes someone by hand (campaigns spec §1.6). */
  campaigns_unsubscribed?: false;
```

In `src/features/contacts/testContacts.ts`, replace the PATCH branch's body with:

```ts
      if (method === 'PATCH') {
        const { campaigns_unsubscribed: optIn, ...patch } = JSON.parse(String(init?.body ?? '{}')) as Partial<Contact> & { campaigns_unsubscribed?: boolean };
        // As ContactSerializer does: a sent sentiment is a hand-set one.
        const manual = 'sentiment' in patch ? { sentiment_source: 'manual' as const, sentiment_computed_at: null } : {};
        // Re-subscribing clears the date (campaigns spec §1.6).
        const subscribed = optIn === false ? { campaigns_unsubscribed_at: null } : {};
        const updated = { ...found, ...patch, ...manual, ...subscribed };
        people = people.map((p) => (p.id === id ? updated : p));
        return json(200, updated);
      }
```

- [ ] **Step 4: Show the line**

In `src/components/contacts/ContactProfile.tsx`:

1. Add `MailX` to the `lucide-react` import, `updateContact` to the `customersSlice` import, and `import { dayLabel } from '../../features/surveys/surveyText';`.
2. Add `const [resubscribing, setResubscribing] = useState(false);` beside `deleting`.
3. Right after `</header>`, add:

```tsx
      {contact.campaigns_unsubscribed_at ? (
        <section aria-label="Campaign emails" className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
          <MailX className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <p className="min-w-0 flex-1">Unsubscribed from campaigns on {dayLabel(contact.campaigns_unsubscribed_at)}</p>
          <button type="button" onClick={() => setResubscribing(true)} className={BUTTON}>
            Re-subscribe
          </button>
        </section>
      ) : null}
```

4. Beside the delete `ConfirmDialog`, add:

```tsx
      {resubscribing ? (
        <ConfirmDialog
          title={`Re-subscribe ${contact.name}?`}
          message="They will get campaign emails again from the next send. Only do this if they asked."
          confirmLabel="Re-subscribe"
          onConfirm={async () => {
            try {
              await dispatch(updateContact({ id: contact.id, campaigns_unsubscribed: false })).unwrap();
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw typeof err === 'string' ? err : 'Could not re-subscribe them. Try again.';
            }
          }}
          onClose={() => setResubscribing(false)}
        />
      ) : null}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/components/contacts src/pages/contacts src/e2e/contacts.test.tsx`
Expected: PASS, the contacts house rules included.

- [ ] **Step 6: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/customers/customersSlice.ts src/features/contacts/testContacts.ts src/components/contacts/ContactProfile.tsx src/components/contacts/ContactProfile.test.tsx`
Expected: no output.

```bash
git add src/features/customers/customersSlice.ts src/features/contacts/testContacts.ts src/components/contacts/ContactProfile.tsx src/components/contacts/ContactProfile.test.tsx
git commit -m "$(cat <<'EOF'
feat(contacts): show a campaign unsubscribe and re-subscribe by hand

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Rules: the sixth action, Send a campaign

Spec §2.5 ("Rules builder": a Send a campaign Then card, its picker of your active campaigns whose segment kind matches the rule's; a Send without review switch; the sentence "…then email <Campaign>" plus "without review"; "Rule nights" results; "Paused notice" `campaign_gone`), §1.8 (validation "Choose one of your active campaigns for these records."; 1–3 actions, each once; dry run), §4 "Rules additions"; Decisions 13, 17; Contract notes 12, 17.

**Files:**
- Create: `src/components/campaigns/useMyCampaigns.ts`
- Modify: `src/features/rules/ruleTypes.ts`, `src/features/rules/ruleOptions.ts`, `src/features/rules/ruleDraft.ts`, `src/features/rules/ruleText.ts`, `src/features/rules/testRules.ts`, `src/components/rules/ActionFields.tsx`, `src/components/rules/ActionCards.tsx`, `src/components/rules/TestPanel.tsx`
- Test: `src/features/rules/ruleText.test.ts`, `src/features/rules/ruleOptions.test.ts`, `src/features/rules/ruleDraft.test.ts`, `src/components/rules/ActionCards.test.tsx`, `src/pages/rules/RuleBuilder.test.tsx`, `src/pages/rules/RulePage.test.tsx` (all modified)

**Interfaces:**
- Consumes: Task 2's `fetchAllMine`, `campaignRef`, `campaignUsable`, `stubCampaigns`; Task 1's `segmentKindOf`; `ConfirmedSwitch`, `Field`, `CardError` (in `ActionFields.tsx`).
- Produces:
  - `ruleTypes.ts`: `CampaignAction { action: 'campaign'; campaign: { id: number; name: string } | null; without_review: boolean }`, `CampaignActionWrite { action: 'campaign'; campaign: number | null; without_review: boolean }`, both in `RuleAction` / `RuleActionWrite`; `PausedReason` gains `'campaign_gone'`; `RuleTestResult.campaigns?: { would_email: number; skipped: number }`; `ReviewResult.campaign_send_id?: number`.
  - `ruleOptions.ts`: `ACTION_LABEL.campaign = 'Send a campaign'`, `ACTION_ORDER` ends `'plan', 'campaign'`, `SAY.CHOOSE_CAMPAIGN`.
  - `ruleDraft.ts`: `ActionDraft` includes `CampaignAction`; `newAction('campaign', …) → { action: 'campaign', campaign: null, without_review: false }`; `toActions` sends the campaign's id.
  - `ruleText.ts`: `campaignTestParts({ would_email, skipped }) → SentencePart[]`; the sentence, night results, paused notice and turn-on text know the action.
  - `useMyCampaigns() → [MyCampaigns, retry]`, `MyCampaigns = { status: 'loading' } | { status: 'ready'; rows: CampaignRow[] } | { status: 'failed'; message: string }`.
  - `ActionFields.tsx`: `CampaignFields({ action, kind, errors, onChange })`.
  - `testRules.ts`: `WIN_BACK_ACTION`, `WIN_BACK_RULE` (id 11, "Win-back watch", on, Renewal risk, entered; not in `RULES`), `CAMPAIGN_GONE_RULE` (id 12, "Old win-back", paused `campaign_gone`; not in `RULES`); the stub validates the action, answers night results and the dry run's `campaigns`.

- [ ] **Step 1: Write the failing tests**

In `src/features/rules/ruleText.test.ts`, add `campaignTestParts` to the `./ruleText` import and `CampaignAction` to the `./ruleTypes` type import, and append (it reuses the file's `BLANK`, `RISK`, `NOTIFY_ME`, `sentenceText`):

```ts
describe('the Send a campaign action (campaigns spec §1.8, §2.5)', () => {
  const WIN_BACK: CampaignAction = { action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: false };

  it('reads as "email Win-back", with "without review" when it skips the queue', () => {
    expect(sentenceText(ruleParts({ ...BLANK, actions: [NOTIFY_ME, WIN_BACK] }, RISK))).toBe('When an organisation enters Renewal risk → notify me, email Win-back');
    expect(thenText([{ ...WIN_BACK, without_review: true }])).toBe('email Win-back without review');
    expect(thenText([{ ...WIN_BACK, campaign: null }])).toBe('email a campaign');
  });

  it("reads a night's campaign results per record", () => {
    expect(actionResultText({ action: 'campaign', status: 'queued', detail: 'waiting for your review' })).toBe('Campaign: waiting for your review');
    expect(actionResultText({ action: 'campaign', status: 'done', detail: 'emailed' })).toBe('Campaign: emailed');
    expect(actionResultText({ action: 'campaign', status: 'skipped', detail: 'nobody it could reach' })).toBe('Campaign: nobody it could reach');
    expect(actionResultText({ action: 'campaign', status: 'failed', detail: 'no segment' })).toBe('Campaign: failed (no segment)');
  });

  it('tells the owner what to do when its campaign went', () => {
    expect(pausedText('campaign_gone', 'Its campaign was archived or deleted.', true)).toBe(
      'It switched itself off. Its campaign was archived or deleted. Choose another campaign in Edit, then turn it on.',
    );
  });

  it('says whether its campaign emails wait for review when it is turned on', () => {
    expect(turnOnText([WIN_BACK], RISK)).toBe('From tonight it runs once a night on Renewal risk and will email Win-back. Its campaign emails wait for your review first.');
    expect(turnOnText([{ ...WIN_BACK, without_review: true }], RISK)).toMatch(/Its campaign emails go out without your review\.$/);
  });

  it("words the dry run's emails, the figures apart", () => {
    const parts = campaignTestParts({ would_email: 3, skipped: 1 });
    expect(parts.map((part) => part.text).join('')).toBe('Would email 3 people · 1 skipped');
    expect(parts.filter((part) => part.numeric).map((part) => part.text)).toEqual(['3', '1']);
    expect(campaignTestParts({ would_email: 1, skipped: 0 }).map((part) => part.text).join('')).toBe('Would email 1 person · 0 skipped');
  });
});
```

In `src/features/rules/ruleOptions.test.ts`, change the two `actionsFor` expectations to:

```ts
    expect(actionsFor('customer')).toEqual(['notify', 'task', 'lifecycle', 'survey', 'plan', 'campaign']);
    expect(actionsFor('contact')).toEqual(['notify', 'task', 'survey', 'plan', 'campaign']);
```

In `src/features/rules/ruleDraft.test.ts`, change the two `availableActions([NOTIFY_ME], …)` expectations to `['task', 'lifecycle', 'survey', 'plan', 'campaign']` and `['task', 'survey', 'plan', 'campaign']`, and append inside the top-level `describe`:

```ts
  it('starts a campaign action with nothing chosen, refuses it so, and sends the id', () => {
    expect(newAction('campaign', 'customer', 'Acme Inc')).toEqual({ action: 'campaign', campaign: null, without_review: false });
    expect(checkDraft(draft({ actions: [NOTIFY_ME, { action: 'campaign', campaign: null, without_review: false }] }), 'customer').action).toEqual([
      {},
      { campaign: 'Choose one of your active campaigns for these records.' },
    ]);
    expect(toActions(draft({ actions: [{ action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: true }] }), 'customer')).toEqual([
      { action: 'campaign', campaign: 11, without_review: true },
    ]);
  });
```

In `src/components/rules/ActionCards.test.tsx`, add `import { stubCampaigns } from '../../features/campaigns/testCampaigns';` and append:

```tsx
describe('ActionCards: Send a campaign (campaigns spec §2.5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers only my campaigns that aren't archived and match the segment's kind", async () => {
    stubCampaigns();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Send a campaign' }));
    const select = within(card('campaign')).getByRole('combobox', { name: 'Campaign' });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Choose a campaign…', 'Win-back']);
    await userEvent.selectOptions(select, '11');
    expect(actionsNow()[1]).toEqual({ action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: false });
  });

  it('offers contact campaigns to a contact rule', async () => {
    stubCampaigns();
    render(<Harness kind="contact" />);
    await userEvent.click(screen.getByRole('button', { name: 'Send a campaign' }));
    const select = within(card('campaign')).getByRole('combobox', { name: 'Campaign' });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Choose a campaign…', 'Champion news']);
  });

  it('asks before sending without review', async () => {
    stubCampaigns();
    render(<Harness start={[{ ...NOTIFY_ME }, { action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: false }]} />);
    await userEvent.click(within(card('campaign')).getByRole('switch', { name: 'Send without review' }));
    expect(within(card('campaign')).getByText('Send without review?')).toBeInTheDocument();
    await userEvent.click(within(card('campaign')).getByRole('button', { name: 'Send without review' }));
    expect(actionsNow()[1]).toMatchObject({ without_review: true });
  });

  it('refuses a stored campaign that is no longer one of mine to use', async () => {
    stubCampaigns();
    render(<Harness start={[{ ...NOTIFY_ME }, { action: 'campaign', campaign: { id: 16, name: 'Old promo' }, without_review: false }]} />);
    const select = within(card('campaign')).getByRole('combobox', { name: 'Campaign' });
    await waitFor(() => expect(select).toHaveAccessibleDescription(/Choose one of your active campaigns for these records\./));
  });
});
```

In `src/pages/rules/RuleBuilder.test.tsx`, add `import { stubCampaigns } from '../../features/campaigns/testCampaigns';` and append inside the `describe`:

```tsx
  it('emails a campaign as an action: the sentence names it, the test counts the emails, and it sends the id', async () => {
    const { spy } = stubCampaigns();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Win back');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send a campaign' }));
    const select = within(modal.querySelector('[data-action="campaign"]') as HTMLElement).getByRole('combobox', { name: 'Campaign' });
    await waitFor(() => expect(select).not.toBeDisabled());
    await userEvent.selectOptions(select, '11');
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('When an organisation enters Renewal risk → notify me, email Win-back');
    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    await waitFor(() => expect(modal.querySelector('[data-part="campaigns"]')).toHaveTextContent('Would email 3 people · 1 skipped'));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    expect((requestsOf(spy, 'POST', /^\/rules\/$/)[0].body as { actions: unknown[] }).actions).toEqual([NOTIFY_ME_ACTION, { action: 'campaign', campaign: 11, without_review: false }]);
  });
```

In `src/pages/rules/RulePage.test.tsx`, add `CAMPAIGN_GONE_RULE`, `WIN_BACK_ACTION`, `WIN_BACK_RULE` to the `testRules` import and append inside the `describe`:

```tsx
  it('tells the owner how to mend a rule whose campaign was archived or deleted', async () => {
    stubRules({ rules: [...RULES, CAMPAIGN_GONE_RULE] });
    renderRules('/scenarios/rules/12');
    expect(await screen.findByText('It switched itself off. Its campaign was archived or deleted. Choose another campaign in Edit, then turn it on.')).toBeInTheDocument();
    expect(document.querySelector('[data-part="sentence"]')).toHaveTextContent('When an organisation enters Renewal risk → email a campaign');
  });

  it("shows what a night's campaign did for each record", async () => {
    const { runNight } = stubRules({ rules: [...RULES, { ...WIN_BACK_RULE, actions: [NOTIFY_ME_ACTION, WIN_BACK_ACTION] }] });
    expect(runNight(11)).toMatchObject({ fired: 2 });
    renderRules('/scenarios/rules/11');
    await userEvent.click(within(await nights()).getAllByRole('button')[0]);
    expect(await screen.findAllByText('Notify: done · Campaign: waiting for your review')).toHaveLength(2);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 src/features/rules src/components/rules/ActionCards.test.tsx src/pages/rules/RuleBuilder.test.tsx src/pages/rules/RulePage.test.tsx`
Expected: FAIL: `campaignTestParts` and `WIN_BACK_RULE` are not exported, no "Send a campaign" button, and the action lists lack `'campaign'`.

- [ ] **Step 3: The types and the options**

In `src/features/rules/ruleTypes.ts`:

1. `export type PausedReason = '' | 'segment_gone' | 'segment_not_owned' | 'owner_inactive' | 'template_gone' | 'campaign_gone';`
2. After `PlanActionWrite`, add:

```ts
/** Send a campaign (campaigns spec §4 "Rules additions"), as read: the
 *  campaign a ref, null once deleted. The builder's draft holds this shape. */
export interface CampaignAction {
  action: 'campaign';
  campaign: { id: number; name: string } | null;
  without_review: boolean;
}

/** Send a campaign as written: the campaign's id. */
export interface CampaignActionWrite {
  action: 'campaign';
  campaign: number | null;
  without_review: boolean;
}
```

3. `export type RuleAction = NotifyAction | TaskAction | LifecycleAction | SurveyAction | PlanAction | CampaignAction;` and `export type RuleActionWrite = NotifyAction | TaskAction | LifecycleAction | SurveyAction | PlanActionWrite | CampaignActionWrite;`
4. In `RuleTestResult`, add `/** With a campaign action only. */ campaigns?: { would_email: number; skipped: number };`.
5. In `ReviewResult`, add `campaign_send_id?: number;` and change its comment to "`{}` while waiting; `{survey_send_id}` or `{campaign_send_id}` once approved; `{error}` after a refused approval (the review stays waiting)."

In `src/features/rules/ruleOptions.ts`: add `campaign: 'Send a campaign',` to `ACTION_LABEL`; change `ACTION_ORDER` to `['notify', 'task', 'lifecycle', 'survey', 'plan', 'campaign']`; add `CHOOSE_CAMPAIGN: 'Choose one of your active campaigns for these records.',` to `SAY` after `CHOOSE_TEMPLATE`.

- [ ] **Step 4: The draft**

In `src/features/rules/ruleDraft.ts`:

1. Add `CampaignAction` to the `./ruleTypes` type import.
2. `export type ActionDraft = NotifyAction | TaskAction | LifecycleDraft | SurveyAction | PlanAction | CampaignAction;`
3. Add the overload `export function newAction(type: 'campaign', kind: SegmentKind | null, workspace: string): CampaignAction;` before the implementation, and in its `switch`:

```ts
    case 'campaign':
      return { action: 'campaign', campaign: null, without_review: false };
```

4. In `toActions`, before `return action as LifecycleAction;`, add:

```ts
    if (action.action === 'campaign') return { action: 'campaign', campaign: action.campaign?.id ?? null, without_review: action.without_review };
```

5. In `checkAction`, replace the final branch `} else if (!action.template) {\n    out.template = SAY.CHOOSE_TEMPLATE;\n  }` with:

```ts
  } else if (action.action === 'plan') {
    if (!action.template) out.template = SAY.CHOOSE_TEMPLATE;
  } else if (!action.campaign) {
    out.campaign = SAY.CHOOSE_CAMPAIGN;
  }
```

- [ ] **Step 5: The words**

In `src/features/rules/ruleText.ts`:

1. Add `CampaignAction` to the `./ruleTypes` type import.
2. Above `actionWords`, add:

```ts
/** "email Win-back", "email Win-back without review" (Decision 13). */
function campaignWords(action: CampaignAction): string {
  const words = `email ${action.campaign ? action.campaign.name : 'a campaign'}`;
  return action.without_review ? `${words} without review` : words;
}
```

3. In `actionWords`' `switch`, add `case 'campaign': return campaignWords(action);`.
4. Add `campaign: 'Campaign'` to `SHORT`.
5. In `actionResultText`, after the plan line, add:

```ts
  // A campaign's detail is the whole story: "waiting for your review", "emailed", "nobody it could reach".
  if (result.action === 'campaign' && result.status !== 'failed' && result.detail) return `Campaign: ${result.detail}`;
```

6. Add `campaign_gone: 'Choose another campaign in Edit, then turn it on.',` to `PAUSE_FIX`.
7. Replace `turnOnText` with:

```ts
/** What the confirm says before a rule is turned on (spec §2.2). */
export function turnOnText(actions: readonly ActionLike[], segment: SegmentLike): string {
  const survey = actions.find((action): action is SurveyAction => action.action === 'survey');
  const campaign = actions.find((action): action is CampaignAction => action.action === 'campaign');
  const surveyTail = !survey ? '' : survey.without_review ? ' Its surveys go out without your review.' : ' Its surveys wait for your review first.';
  const campaignTail = !campaign ? '' : campaign.without_review ? ' Its campaign emails go out without your review.' : ' Its campaign emails wait for your review first.';
  return `From tonight it runs once a night on ${segment ? segment.name : 'its segment'} and will ${thenText(actions)}.${surveyTail}${campaignTail}`;
}
```

8. At the end of the file, add:

```ts
/** The dry run's emails (campaigns spec §1.8, Decision 17): "Would email 3 people · 1 skipped". */
export function campaignTestParts(campaigns: { would_email: number; skipped: number }): SentencePart[] {
  return [
    { text: 'Would email ', role: 'join' },
    { text: String(campaigns.would_email), role: 'value', numeric: true },
    { text: ` ${plural(campaigns.would_email, 'person', 'people')} · `, role: 'join' },
    { text: String(campaigns.skipped), role: 'value', numeric: true },
    { text: ' skipped', role: 'join' },
  ];
}
```

In `src/components/rules/TestPanel.tsx`, add `campaignTestParts` to the `ruleText` import and, after the `plans` paragraph, add:

```tsx
      {result.campaigns ? (
        <p data-part="campaigns" className="text-[13px] text-ink-muted">
          <Parts parts={campaignTestParts(result.campaigns)} />
        </p>
      ) : null}
```

- [ ] **Step 6: The picker's read and the card**

Create `src/components/campaigns/useMyCampaigns.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchAllMine } from '../../features/campaigns/campaignApi';
import type { CampaignRow } from '../../features/campaigns/campaignTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type MyCampaigns = { status: 'loading' } | { status: 'ready'; rows: CampaignRow[] } | { status: 'failed'; message: string };

/** Every campaign I own, archived left out (Contract note 17). */
export function useMyCampaigns(): [MyCampaigns, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: number; load: MyCampaigns } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchAllMine().then(
      (rows) => {
        if (alive) setAnswer({ key: attempt, load: { status: 'ready', rows } });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: attempt, load: { status: 'failed', message: errorMessage(err, 'Could not load your campaigns.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  return [answer?.key === attempt ? answer.load : { status: 'loading' }, () => setAttempt((n) => n + 1)];
}
```

In `src/components/rules/ActionFields.tsx`, add `import { segmentKindOf } from '../../features/campaigns/campaignText';`, `import { useMyCampaigns } from '../campaigns/useMyCampaigns';`, `CampaignAction` to the `ruleTypes` type import, `SAY as RULE_SAY` from `../../features/rules/ruleOptions` (the file already imports Plans' `SAY`), and append:

```tsx
/** Send a campaign (campaigns spec §1.8, §2.5): one of my campaigns that
 *  isn't archived, on a segment of this rule's kind; it emails the people
 *  the night fired on, by the campaign's own roles. Send without review is
 *  off by default and asked first. */
export function CampaignFields({ action, kind, errors, onChange }: { action: CampaignAction; kind: SegmentKind | null; errors: ActionErrors; onChange: (next: CampaignAction) => void }) {
  const id = useId();
  const reviewId = useId();
  const [load, retry] = useMyCampaigns();
  const usable = load.status === 'ready' ? load.rows.filter((row) => row.status !== 'archived' && row.segment !== null && segmentKindOf(row.segment.kind) === kind) : [];
  const chosen = action.campaign;
  // A stored campaign I can no longer use here (archived, another kind):
  // shown by name, so the rule still reads, and refused as the server would.
  const stale = load.status === 'ready' && chosen && !usable.some((row) => row.id === chosen.id) ? chosen : null;
  if (load.status === 'failed') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
        <span>{load.message}</span>
        <button type="button" onClick={retry} className={`${QUIET} border border-line`}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Field
        id={id}
        label="Campaign"
        hint={
          kind
            ? "It emails the people the rule fired on, by the campaign's own roles. Anyone it already reached, or emailed by a campaign in the last 3 days, is skipped."
            : 'Choose a segment first to see the campaigns for it.'
        }
        error={errors.campaign ?? (stale ? RULE_SAY.CHOOSE_CAMPAIGN : undefined)}
      >
        {(aria) => (
          <select
            id={id}
            {...aria}
            value={chosen ? String(chosen.id) : ''}
            disabled={load.status !== 'ready' || kind === null}
            onChange={(event) => {
              const picked = usable.find((row) => String(row.id) === event.target.value);
              onChange({ ...action, campaign: picked ? { id: picked.id, name: picked.name } : null });
            }}
            className={`${FILTER_SELECT} w-full ${errors.campaign || stale ? 'border-danger' : ''}`}
          >
            <option value="">{load.status === 'ready' ? (usable.length > 0 ? 'Choose a campaign…' : 'No campaigns for this segment yet') : 'Loading your campaigns…'}</option>
            {stale ? (
              <option value={stale.id} disabled>
                {stale.name}
              </option>
            ) : null}
            {usable.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <ConfirmedSwitch
        label="Send without review"
        checked={action.without_review}
        onChange={(on) => onChange({ ...action, without_review: on })}
        describedBy={reviewId}
        confirm={{
          title: 'Send without review?',
          message: "Each night's campaign goes to the matched people at once instead of waiting in your review queue. Every campaign rule still holds.",
          confirmLabel: 'Send without review',
        }}
      />
      <p id={reviewId} className={`text-[11px] ${action.without_review ? 'text-warning' : 'text-ink-muted'}`}>
        {action.without_review ? 'Campaign emails go out at night without you seeing them first.' : "Off: each night's campaign waits in your review queue until you approve it."}
      </p>
      <CardError message={errors.without_review} />
    </div>
  );
}
```

In `src/components/rules/ActionCards.tsx`:

1. Add `CampaignFields` to the `./ActionFields` import.
2. In `add`'s `switch`, add:

```ts
      case 'campaign':
        onChange([...actions, newAction('campaign', kind, workspace)]);
        return;
```

3. After the plan card line, add `{action.action === 'campaign' ? <CampaignFields action={action} kind={kind} errors={own} onChange={(next) => replace(index, next)} /> : null}`.
4. Change the hint under Then to: "One to three actions, each once. Notify, tasks, lifecycle and plans run on their own; a survey or a campaign waits for your review unless you say otherwise."

- [ ] **Step 7: The stub**

In `src/features/rules/testRules.ts`:

1. Add `import { campaignRef, campaignUsable } from '../campaigns/testCampaignFixtures';` and `CampaignAction` to the `./ruleTypes` type import.
2. After `SAVE_RULE`, add:

```ts
/** Email Win-back (campaigns spec §1.8), waiting for review. */
export const WIN_BACK_ACTION: CampaignAction = { action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: false };
/** Mine, on: Win-back to whoever enters Renewal risk. Not in RULES. */
export const WIN_BACK_RULE: StoredRule = {
  ...BASE, id: 11, name: 'Win-back watch', is_active: true, segment: RENEWAL_RISK, trigger: 'entered', actions: [WIN_BACK_ACTION], sharing: 'private', owner: ME, is_owner: true,
};
/** Mine: it switched itself off when its campaign was archived. Not in RULES. */
export const CAMPAIGN_GONE_RULE: StoredRule = {
  ...BASE, id: 12, name: 'Old win-back', is_active: false, paused_reason: 'campaign_gone', paused_message: 'Its campaign was archived or deleted.',
  segment: RENEWAL_RISK, trigger: 'entered', actions: [{ action: 'campaign', campaign: null, without_review: false }], sharing: 'private', owner: ME, is_owner: true,
};
```

3. In `check`, replace the `actions` mapping with:

```ts
    // A plan's template and a campaign are written as ids and kept as refs.
    const actions: RuleAction[] = sent.map((action) => {
      if (action.action === 'plan') return { action: 'plan', template: typeof action.template === 'number' ? templateRef(action.template) : action.template };
      if (action.action === 'campaign') {
        return { action: 'campaign', campaign: typeof action.campaign === 'number' ? campaignRef(action.campaign) : action.campaign, without_review: Boolean(action.without_review) };
      }
      return action;
    });
```

and in the per-action `errors` checks, after the plan line, add:

```ts
      if (action.action === 'campaign' && (!action.campaign || !campaignUsable(action.campaign.id, kind))) return { campaign: [SAY.CHOOSE_CAMPAIGN] };
```

4. In `runNight`'s per-action results, before the generic `return { action: action.action, … }`, add:

```ts
        if (action.action === 'campaign') {
          return action.without_review ? { action: 'campaign', status: 'done', detail: 'emailed' } : { action: 'campaign', status: 'queued', detail: 'waiting for your review' };
        }
```

5. In the `/rules/test/` branch, answer the dry run's emails too:

```ts
      const planned = (checked.actions ?? []).some((action) => action.action === 'plan');
      const emailing = (checked.actions ?? []).some((action) => action.action === 'campaign');
      return json(200, {
        ...result,
        ...(planned ? { plans: { would_start: Math.max(0, result.count - 1), already_open: Math.min(1, result.count) } } : {}),
        ...(emailing ? { campaigns: { would_email: result.count, skipped: 1 } } : {}),
      });
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/features/rules src/components/rules src/pages/rules src/e2e/rules.test.tsx src/e2e/plans.test.tsx`
Expected: PASS.

- [ ] **Step 9: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/rules src/components/rules src/components/campaigns/useMyCampaigns.ts src/pages/rules`
Expected: no output.

```bash
git add src/features/rules src/components/rules src/components/campaigns/useMyCampaigns.ts src/pages/rules
git commit -m "$(cat <<'EOF'
feat(rules): Send a campaign as a sixth action

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: The Review Queue's campaign reviews

Spec §2.5 ("Review Queue, From your rules: reviews of kind `campaign` show the campaign name, 'Would email N · M skipped', and the records, with Approve and Skip. Approve shows a stored refusal at its control."), §1.8 (with review by default; approving claims and sends then; a Campaigns refusal stored, the review stays waiting; without review the night sends at once); §4 (`kind`, `campaign`, `counts`); Decisions 14, 17; Contract note 11.

**Files:**
- Modify: `src/features/rules/ruleTypes.ts`, `src/features/rules/ruleText.ts`, `src/features/rules/testRules.ts`, `src/features/campaigns/testCampaigns.ts`, `src/components/rules/RuleReviews.tsx`, `src/components/rules/NightsSection.tsx`, `src/components/rules/RuleReviews.test.tsx`, `src/e2e/rules.test.tsx`
- Test: `src/components/rules/RuleReviews.test.tsx` (appended), `src/features/rules/ruleText.test.ts` (appended)

**Interfaces:**
- Consumes: Task 12's `CampaignAction`, `WIN_BACK_RULE`, `WIN_BACK_ACTION`, `campaignTestParts`; Task 1's `skippedTotal`, `NO_SKIPS`, `campaignPath`, `SkipReason`; Task 2's `stubCampaigns` (its `claim`).
- Produces:
  - `ruleTypes.ts`: `SurveyReview` (`kind?: 'survey'`, `action`, `counts: {people, records}`, `organisation_name`), `CampaignReview` (`kind: 'campaign'`, `campaign`, `counts: {reach, skipped}`, `records: NamedRecord[]`, `hidden_count?`), `RuleReview = SurveyReview | CampaignReview`, `ApproveAnswer = { survey_send_id: number } | { campaign_send_id: number }`.
  - `ruleText.ts`: `campaignReviewParts(counts) → SentencePart[]`, `waitingReviews(run) → number`; `runParts` counts every waiting review of the night.
  - `RunRow.reviews?: { id: number; kind: 'survey' | 'campaign'; status: ReviewStatus }[]` (Contract note 12); `NightsSection`'s Review it link uses `waitingReviews`.
  - `testRules.ts`: `RulesStub.onCampaignApproved?(review, by) → number`; `CAMPAIGN_REVIEW` (id 4, Win-back watch, 2 records, 1 hidden); a night with a campaign action makes a campaign review (or sends at once without review).
  - `RuleReviews`: the list is named "Reviews from your rules"; `[data-kind="campaign"]` items.

- [ ] **Step 1: Write the failing tests**

In `src/components/rules/RuleReviews.test.tsx`:

1. Change `items` to `const items = () => screen.findByRole('list', { name: 'Reviews from your rules' });` and the skeleton's name `'Loading surveys from your rules'` to `'Loading reviews from your rules'`.
2. Add imports: `import { fetchSends } from '../../features/campaigns/campaignApi';`, `import { SAY } from '../../features/campaigns/campaignOptions';`, `import { stubCampaigns } from '../../features/campaigns/testCampaigns';`, and `CAMPAIGN_REVIEW`, `REVIEWS`, `RULES`, `WIN_BACK_ACTION`, `WIN_BACK_RULE` from `../../features/rules/testRules`.
3. Append:

```tsx
describe('From your rules: campaign reviews (campaigns spec §2.5)', () => {
  const withCampaign = () => stubCampaigns({ rules: { rules: [...RULES, WIN_BACK_RULE], reviews: [...REVIEWS, CAMPAIGN_REVIEW] } });
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the campaign, whom it would email, the records, Approve and Skip', async () => {
    withCampaign();
    renderRules('/brain/review');
    await items();
    const review = item(4);
    expect(review).toHaveAttribute('data-kind', 'campaign');
    expect(within(review).getByRole('link', { name: 'Win-back watch' })).toHaveAttribute('href', '/scenarios/rules/11');
    expect(within(review).getByRole('link', { name: 'Win-back' })).toHaveAttribute('href', '/campaigns/11');
    const reach = review.querySelector('[data-part="reach"]') as HTMLElement;
    expect(reach).toHaveTextContent('Would email 2 people · 1 skipped');
    expect([...reach.querySelectorAll('.font-mono-brand')].map((node) => node.textContent)).toEqual(['2', '1']);
    expect(within(review).getByRole('link', { name: 'Globex' })).toHaveAttribute('href', '/organizations/1');
    expect(within(review).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(review).toHaveTextContent("1 more record you can't open");
    expect(within(review).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(review).getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('approves it: the campaign is sent and its send opens', async () => {
    withCampaign();
    renderRules('/brain/review');
    await items();
    await userEvent.click(within(item(4)).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(where()).toBe('/campaigns/11?send=500'));
  });

  it("shows a stored refusal at Approve, and moves focus to it", async () => {
    stubCampaigns({ rules: { rules: [...RULES, WIN_BACK_RULE], reviews: [...REVIEWS, CAMPAIGN_REVIEW], refuse: { detail: SAY.EMAIL_NOT_SET_UP } } });
    renderRules('/brain/review');
    await items();
    await userEvent.click(within(item(4)).getByRole('button', { name: 'Approve' }));
    const refusal = await waitFor(() => {
      const found = item(4).querySelector('[data-part="refusal"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(refusal).toHaveTextContent(`Campaigns refused it: ${SAY.EMAIL_NOT_SET_UP} Fix it, then approve again, or skip it.`);
    await waitFor(() => expect(document.activeElement).toBe(refusal));
    expect(within(item(4)).getByRole('button', { name: 'Approve' })).toHaveAccessibleDescription(/Campaigns refused it/);
  });

  it('skips it, and says which kind it skipped', async () => {
    withCampaign();
    renderRules('/brain/review');
    await items();
    await userEvent.click(within(item(4)).getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Skipped the campaign from Win-back watch for 4 Oct 2026.')).toBeInTheDocument();
  });

  it("makes a review from a night's campaign, or sends at once without review, from the rule", async () => {
    const waiting = stubCampaigns({ rules: { rules: [...RULES, WIN_BACK_RULE] } });
    waiting.runNight(11);
    const first = renderRules('/brain/review');
    await items();
    const made = document.querySelector('[data-kind="campaign"]') as HTMLElement;
    expect(made.querySelector('[data-part="reach"]')).toHaveTextContent('Would email 2 people · 0 skipped');
    first.unmount();
    vi.unstubAllGlobals();
    const direct = stubCampaigns({ rules: { rules: [...RULES, { ...WIN_BACK_RULE, actions: [{ ...WIN_BACK_ACTION, without_review: true }] }] } });
    direct.runNight(11);
    const page = await fetchSends(11, null);
    expect(page.results[0]).toMatchObject({ kind: 'rule', rule: { id: 11, name: 'Win-back watch' }, sent_by: null });
  });
});
```

In `src/e2e/rules.test.tsx`, change `'Surveys from your rules'` to `'Reviews from your rules'`.

In `src/features/rules/ruleText.test.ts`, add `waitingReviews` to the `./ruleText` import and append (it reuses the file's `runParts` import; build the row inline):

```ts
describe("a night's reviews (Contract note 12)", () => {
  const night = {
    id: 9, run_on: '2026-10-04', matched: 5, fired: 3, skipped: null, hidden_count: 0, started_at: null, finished_at: null,
    review: { id: 2, status: 'waiting' as const },
  };

  it('counts every waiting review of a night, a survey and a campaign alike', () => {
    const both = { ...night, reviews: [{ id: 2, kind: 'survey' as const, status: 'waiting' as const }, { id: 4, kind: 'campaign' as const, status: 'waiting' as const }] };
    expect(waitingReviews(both)).toBe(2);
    expect(runParts(both).map((part) => part.text).join('')).toBe('4 Oct · fired 3 · 2 waiting for review');
    expect(waitingReviews({ ...both, reviews: [{ id: 2, kind: 'survey', status: 'approved' }, { id: 4, kind: 'campaign', status: 'waiting' }] })).toBe(1);
  });

  it('reads the single review of an older night row', () => {
    expect(waitingReviews(night)).toBe(1);
    expect(waitingReviews({ ...night, review: null })).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 src/components/rules/RuleReviews.test.tsx src/features/rules/ruleText.test.ts`
Expected: FAIL: `CAMPAIGN_REVIEW` and `waitingReviews` are not exported; the list is still named "Surveys from your rules".

- [ ] **Step 3: The review types and words**

In `src/features/rules/ruleTypes.ts`, add `import type { SkipReason } from '../campaigns/campaignTypes';` and replace `RuleReview` and `ApproveAnswer` with:

```ts
interface ReviewBase {
  id: number;
  rule: ReviewRule;
  run_on: string;
  status: ReviewStatus;
  result: ReviewResult;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
}

/** A night's survey. `kind` is absent from an older backend (Contract note 11). */
export interface SurveyReview extends ReviewBase {
  kind?: 'survey';
  action: SurveyAction;
  counts: { people: number; records: number };
  organisation_name: string;
}

/** A night's campaign (campaigns spec §4): the dry claim's counts, and the
 *  fired records the reader may open (Contract note 11). */
export interface CampaignReview extends ReviewBase {
  kind: 'campaign';
  campaign: { id: number; name: string } | null;
  counts: { reach: number; skipped: Record<SkipReason, number> };
  records: NamedRecord[];
  hidden_count?: number;
}

/** GET /rules/reviews/: the caller's own, newest first, at most 100. */
export type RuleReview = SurveyReview | CampaignReview;

export type ApproveAnswer = { survey_send_id: number } | { campaign_send_id: number };
```

and in `RunRow`, under `review`, add:

```ts
  /** Every review of the night, a survey's and a campaign's (Contract note 12). */
  reviews?: { id: number; kind: 'survey' | 'campaign'; status: ReviewStatus }[];
```

In `src/features/rules/ruleText.ts`, add `import { skippedTotal } from '../campaigns/campaignText';` and `CampaignReview` to the type import, and append:

```ts
/** A campaign review's "Would email 2 people · 1 skipped" (Decision 17). */
export function campaignReviewParts(counts: CampaignReview['counts']): SentencePart[] {
  return campaignTestParts({ would_email: counts.reach, skipped: skippedTotal(counts.skipped) });
}

/** How many of a night's reviews still wait: from `reviews`, or the single
 *  `review` of an older row (Contract note 12). */
export function waitingReviews(run: Pick<RunRow, 'review' | 'reviews'>): number {
  if (run.reviews) return run.reviews.filter((review) => review.status === 'waiting').length;
  return run.review?.status === 'waiting' ? 1 : 0;
}
```

In `runParts`, replace the review branch with:

```ts
  const waiting = waitingReviews(run);
  if (waiting > 0) {
    parts.push({ text: ' · ', role: 'join' }, { text: String(waiting), role: 'value', numeric: true }, { text: ' waiting for review', role: 'join' });
  } else if (run.review) {
    parts.push({ text: ` · ${REVIEW_WORDS[run.review.status]}`, role: 'join' });
  }
```

In `src/components/rules/NightsSection.tsx`, import `waitingReviews` from `ruleText` and change the Review it condition to `rule.is_owner && waitingReviews(run) > 0`.

- [ ] **Step 4: The stub's reviews**

In `src/features/rules/testRules.ts`:

1. Add `import { NO_SKIPS } from '../campaigns/campaignText';` and `CampaignReview` to the type import. Add `kind: 'survey'` to `WAITING` (so `REFUSED`, spread from it, has it too).
2. After `REVIEWS`, add:

```ts
/** Win-back watch's campaign for 4 Oct, waiting: two records I can open, one I can't. */
export const CAMPAIGN_REVIEW: CampaignReview = {
  id: 4, kind: 'campaign', rule: reviewRule(WIN_BACK_RULE), run_on: '2026-10-04', campaign: { id: 11, name: 'Win-back' },
  counts: { reach: 2, skipped: { ...NO_SKIPS, recent_campaign: 1 } },
  records: [{ kind: 'customer', id: 1, name: 'Globex' }, { kind: 'customer', id: 7, name: 'Pizza Hut' }], hidden_count: 1,
  status: 'waiting', result: {}, created_at: '2026-10-04T02:00:05Z', expires_at: '2026-10-11T12:00:05Z', decided_at: null,
};
```

3. In `RulesStub`, add:

```ts
  /** An approved campaign review sends through the Campaigns stub; it answers the send's id. */
  onCampaignApproved?: (review: CampaignReview, by: PersonRef | null) => number;
```

4. Replace `approve` with:

```ts
  /** reviews.send_review: a survey send in the Surveys stub, or a campaign
   *  send through `onCampaignApproved`. `by` is null for a night without review. */
  let nextCampaignSend = 900;
  const approve = (review: RuleReview, by: PersonRef | null = ME): Answer => {
    if (stub.refuse) {
      review.result = { error: stub.refuse };
      return { status: 400, body: stub.refuse };
    }
    const run = runs.find((candidate) => candidate.review?.id === review.id || candidate.reviews?.some((one) => one.id === review.id));
    const markApproved = () => {
      if (!run) return;
      if (run.review?.id === review.id) run.review = { id: review.id, status: 'approved' };
      run.reviews = run.reviews?.map((one) => (one.id === review.id ? { ...one, status: 'approved' } : one));
    };
    if (review.kind === 'campaign') {
      const sendId = stub.onCampaignApproved?.(review, by) ?? nextCampaignSend++;
      Object.assign(review, { status: 'approved', result: { campaign_send_id: sendId }, decided_at: NOW });
      markApproved();
      return { status: 200, body: { campaign_send_id: sendId } };
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
    markApproved();
    return { status: 200, body: { survey_send_id: id } };
  };
```

5. In `runNight`, give the survey review `kind: 'survey'` and, beside `run.review = { id: review.id, status: 'waiting' };`, add `run.reviews = [...(run.reviews ?? []), { id: review.id, kind: 'survey', status: 'waiting' }];`. After the survey block add:

```ts
    const campaign = rule.actions.find((action): action is CampaignAction => action.action === 'campaign');
    if (campaign?.campaign && hits.length > 0) {
      const review: CampaignReview = {
        id: nextReview++, kind: 'campaign', rule: reviewRule(rule), run_on: NIGHT_DAY, campaign: { ...campaign.campaign },
        counts: { reach: hits.length, skipped: { ...NO_SKIPS } }, records: hits.map(({ kind, id, name }) => ({ kind, id, name })),
        status: 'waiting', result: {}, created_at: `${NIGHT_DAY}T02:00:05Z`, expires_at: '2026-10-12T12:00:05Z', decided_at: null,
      };
      reviews.unshift(review);
      run.review ??= { id: review.id, status: 'waiting' };
      run.reviews = [...(run.reviews ?? []), { id: review.id, kind: 'campaign', status: 'waiting' }];
      if (campaign.without_review) approve(review, null);
    }
```

In `src/features/campaigns/testCampaigns.ts`, add `import type { CampaignReview } from '../rules/ruleTypes';`, and replace the `// Task 13 adds …` line and the `plans` line with:

```ts
  /** The Rules stub's approval (with or without review) lands here. */
  const onCampaignApproved = (review: CampaignReview, by: PersonRef | null): number => {
    const one = campaigns.find((candidate) => candidate.id === review.campaign?.id);
    if (!one) return nextSend++;
    return claim(one, { kind: 'rule', sent_by: by, rule: { id: review.rule.id, name: review.rule.name } }).id;
  };
  const plans = stubPlans({ ...stub.plans, rules: { ...stub.rules, onCampaignApproved } });
```

(`claim` is declared above it, so move these lines under `claim` if they are not already.)

- [ ] **Step 5: The review item**

Replace `src/components/rules/RuleReviews.tsx` with:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/apiClient';
import { campaignPath } from '../../features/campaigns/campaignText';
import { approveReview, fetchReviews, skipReview } from '../../features/rules/ruleApi';
import { campaignReviewParts, isRuleChanged, refusalText, RULE_CHANGED, triggerParts } from '../../features/rules/ruleText';
import type { CampaignReview, RuleReview, SurveyReview } from '../../features/rules/ruleTypes';
import { dayText } from '../../features/segments/ruleSentence';
import { recordHref } from '../../features/segments/segmentFields';
import { dayLabel, reach } from '../../features/surveys/surveyText';
import { ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { RuleSentence } from '../segments/RuleSentence';
import { SurveyPreview } from '../surveys/SurveyPreview';
import { Parts } from './Parts';

const DECIDED = 'That review was already decided.';
const LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

function SurveyReach({ review }: { review: SurveyReview }) {
  const people = reach({ audience: review.counts.people, organisations: review.counts.records }, review.rule.segment?.kind ?? null);
  return (
    <p data-part="reach" className="text-[13px] text-ink">
      <span className={MONO}>{people.people}</span> {people.peopleNoun} at <span className={MONO}>{people.records}</span> {people.recordNoun}
    </p>
  );
}

/** A campaign review (campaigns spec §2.5): the campaign, whom it would
 *  email (the dry claim's counts) and the records the night fired on. */
function CampaignBody({ review }: { review: CampaignReview }) {
  const hidden = review.hidden_count ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <p data-part="campaign" className="text-[13px] text-ink-muted">
        Campaign:{' '}
        {review.campaign ? (
          <Link to={campaignPath(review.campaign.id)} className={LINK}>
            {review.campaign.name}
          </Link>
        ) : (
          <span className="text-ink">a deleted campaign</span>
        )}
      </p>
      <p data-part="reach" className="text-[13px] text-ink">
        <Parts parts={campaignReviewParts(review.counts)} />
      </p>
      {review.records.length > 0 ? (
        <ul aria-label="Records" className="flex flex-wrap gap-x-3">
          {review.records.map((record) => (
            <li key={`${record.kind}-${record.id}`}>
              <Link to={recordHref(record.kind, record.id)} className={LINK}>
                {record.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 ? (
        <p data-part="hidden" className="text-[11px] text-ink-muted">
          <span className={MONO}>{hidden}</span> more {hidden === 1 ? 'record' : 'records'} you can't open
        </p>
      ) : null}
    </div>
  );
}

/** One night's survey or campaign from one of my rules (spec §2.4; campaigns
 *  spec §2.5): the rule and its trigger, what it would do, a stored refusal
 *  at Approve (focused when it arrives), then Approve or Skip. */
function ReviewItem({ review, onDecided, onRefused }: {
  review: RuleReview;
  onDecided: (id: number, message: string) => void;
  onRefused: (review: RuleReview) => void;
}) {
  const navigate = useNavigate();
  const refusalId = useId();
  const refusalRef = useRef<HTMLParagraphElement>(null);
  const [refusedTick, setRefusedTick] = useState(0);
  useEffect(() => {
    if (refusedTick > 0) refusalRef.current?.focus();
  }, [refusedTick]);
  const [busy, setBusy] = useState<'approve' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCampaign = review.kind === 'campaign';
  const refusal = refusalText(review.result.error);
  const decidedElsewhere = (err: unknown) => err instanceof ApiError && (err.status === 409 || err.status === 404);

  async function approve() {
    setBusy('approve');
    setError(null);
    try {
      const answer = await approveReview(review.id);
      if ('campaign_send_id' in answer) navigate(review.kind === 'campaign' && review.campaign ? campaignPath(review.campaign.id, answer.campaign_send_id) : '/campaigns');
      else navigate(`/surveys/${answer.survey_send_id}`);
    } catch (err) {
      setBusy(null);
      if (decidedElsewhere(err)) onDecided(review.id, DECIDED);
      else if (err instanceof ApiError && err.status === 400 && isRuleChanged(err.body)) onDecided(review.id, RULE_CHANGED);
      else if (err instanceof ApiError && err.status === 400 && err.body !== null && typeof err.body === 'object') {
        // The refusal is stored on the review by the server, shown here.
        setRefusedTick((n) => n + 1);
        onRefused({ ...review, result: { error: err.body as Record<string, unknown> } });
      } else setError(errorMessage(err, 'Could not approve it. Try again.'));
    }
  }

  async function skip() {
    setBusy('skip');
    setError(null);
    try {
      await skipReview(review.id);
      onDecided(review.id, `Skipped the ${isCampaign ? 'campaign' : 'survey'} from ${review.rule.name} for ${dayText(review.run_on)}.`);
    } catch (err) {
      setBusy(null);
      if (decidedElsewhere(err)) onDecided(review.id, DECIDED);
      else setError(errorMessage(err, 'Could not skip it. Try again.'));
    }
  }

  return (
    <li data-review={review.id} data-kind={review.kind ?? 'survey'} className="flex flex-col gap-3 rounded-xl bg-surface p-3">
      <div className="flex flex-col gap-0.5">
        <Link to={`/scenarios/rules/${review.rule.id}`} className={`inline-flex min-h-11 items-center self-start text-[15px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
          {review.rule.name}
        </Link>
        <RuleSentence parts={triggerParts(review.rule, review.rule.segment)} />
        {review.kind === 'campaign' ? null : <SurveyReach review={review} />}
        <p className="text-[11px] text-ink-muted">
          From the night of {dayText(review.run_on)} · waits until {dayLabel(review.expires_at)}
        </p>
      </div>
      {review.kind === 'campaign' ? (
        <CampaignBody review={review} />
      ) : (
        <SurveyPreview type={review.action.survey_type} subject={review.action.subject} intro={review.action.intro} workspace={review.organisation_name} />
      )}
      {refusal ? (
        <p ref={refusalRef} id={refusalId} data-part="refusal" data-error role="alert" tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
          {isCampaign ? 'Campaigns' : 'Surveys'} refused it: {refusal} Fix it, then approve again, or skip it.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void approve()} disabled={busy !== null} aria-describedby={refusal ? refusalId : undefined} className={PRIMARY}>
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
 *  reviews (the endpoint is owner-only), surveys and campaigns, for every
 *  signed-in user. */
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
        if (alive) setLoad({ key: attempt, items: null, error: errorMessage(err, 'Could not load the reviews from your rules.') });
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
      {!current ? <ItemSkeleton count={2} label="Loading reviews from your rules" avatar={false} /> : null}
      {current?.error ? <ErrorBlock message={current.error} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {current?.items && current.items.length === 0 ? (
        <p data-part="none" className="rounded-xl bg-surface px-4 py-3 text-[13px] text-ink-muted">
          Nothing from your rules is waiting. When a rule's survey or campaign is ready, it waits here until you approve or skip it.
        </p>
      ) : null}
      {current?.items && current.items.length > 0 ? (
        <ul aria-label="Reviews from your rules" className="flex flex-col gap-2">
          {current.items.map((review) => (
            <ReviewItem key={review.id} review={review} onDecided={drop} onRefused={refused} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/components/rules src/features/rules src/pages/rules src/pages/brain src/e2e/rules.test.tsx src/features/campaigns`
Expected: PASS (the survey reviews unchanged, the five campaign ones new).

- [ ] **Step 7: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/rules src/components/rules src/features/campaigns/testCampaigns.ts src/e2e/rules.test.tsx`
Expected: no output.

```bash
git add src/features/rules src/components/rules src/features/campaigns/testCampaigns.ts src/e2e/rules.test.tsx
git commit -m "$(cat <<'EOF'
feat(rules): campaign reviews in the Review Queue

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Wire the routes, the bar and frame, `campaign_sent`, and remove hand-picking

Spec §2.1 (`/campaigns`), §2.2 (routes), §2.4 (`/u/:token` outside the guard and the frame), §2.5 ("Notifications: `campaign_sent`, with an icon, linking to the campaign"; "Removed: `RecipientPicker`, and hand-picking recipients"); Decisions 2, 15; Contract notes 14, 15.

**Files:**
- Modify: `src/App.tsx`, `src/components/layout/Navbar.tsx`, `src/components/layout/Navbar.test.tsx`, `src/layouts/DashboardLayout.tsx`, `src/layouts/DashboardLayout.test.tsx`, `src/features/notifications/types.ts`, `src/components/layout/NotificationKindIcon.tsx`, `src/pages/copilot/copilotApi.ts`, `src/pages/copilot/cockpitApi.ts`
- Delete: `src/pages/campaigns/CampaignsList.tsx`, `src/pages/campaigns/CampaignsList.test.tsx`, `src/pages/campaigns/CampaignEditor.tsx`, `src/pages/campaigns/CampaignEditor.test.tsx`, `src/pages/campaigns/RecipientPicker.tsx`, `src/pages/campaigns/campaignApi.ts`, `src/pages/campaigns/types.ts`
- Test: `src/components/layout/NotificationKindIcon.test.tsx` (new), `Navbar.test.tsx`, `DashboardLayout.test.tsx`

**Interfaces:**
- Consumes: `CampaignsHome`, `NewCampaignRoute`, `EditCampaignRoute`, `CampaignPage`, `Unsubscribe`.
- Produces: `NotificationKind` gains `'campaign_sent'`; its icon is `Megaphone` (`data-kind-icon="campaign_sent"`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/layout/NotificationKindIcon.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { NotificationKindIcon } from './NotificationKindIcon';

describe('NotificationKindIcon', () => {
  it('gives campaign_sent an icon, hidden from screen readers (campaigns spec §2.5)', () => {
    const { container } = render(<NotificationKindIcon kind="campaign_sent" />);
    expect(container.querySelector('[data-kind-icon="campaign_sent"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves the older kinds without one', () => {
    const { container } = render(<NotificationKindIcon kind="rule_fired" />);
    expect(container.querySelector('[data-kind-icon]')).toBeNull();
  });
});
```

In `src/components/layout/Navbar.test.tsx`, after the Project Management `describe`, add:

```tsx
describe('Navbar on Campaigns (campaigns spec 2026-10-04 §2)', () => {
  it('wears the framed bar on /campaigns: "Campaigns", no avatar', () => {
    renderNavbar('/campaigns');
    expect(document.querySelector('header')).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    expect(screen.getByRole('heading', { name: 'Campaigns' })).toBeInTheDocument();
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });

  it.each(['/campaigns/new', '/campaigns/11', '/campaigns/11/edit'])('leads back to Campaigns from %s', (url) => {
    renderNavbar(url);
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Campaigns' });
    expect(back).toHaveAttribute('href', '/campaigns');
  });
});
```

In `src/layouts/DashboardLayout.test.tsx`, add to the `it.each([...])('adds no padding around %s', …)` list:

```ts
    // Campaigns wear the same frame (campaigns spec 2026-10-04 §2).
    '/campaigns',
    '/campaigns/new',
    '/campaigns/11',
    '/campaigns/11/edit',
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 src/components/layout src/layouts/DashboardLayout.test.tsx`
Expected: FAIL: `campaign_sent` is not a kind (and has no icon); no "Campaigns" heading; `/campaigns` is padded.

- [ ] **Step 3: The notification kind and its icon**

In `src/features/notifications/types.ts`, add to `NotificationKind` after `'plan_task_assigned'`:

```ts
  // "Win-back emailed 42 people · 6 skipped" for the owner when a rule's send
  // without review finishes; links to /campaigns/<id> (campaigns spec §1.10).
  | 'campaign_sent'
```

In `src/components/layout/NotificationKindIcon.tsx`, import `Megaphone` and add `campaign_sent: Megaphone,` to `ICONS`; change its comment to "The kinds that carry an icon in the bell (plans spec §2.5, campaigns spec §2.5)."

- [ ] **Step 4: The bar and the frame**

In `src/components/layout/Navbar.tsx`, after the Plans lines, add:

```ts
  // Campaigns wear the same frame (campaigns spec 2026-10-04 §2, Decision 2):
  // "Campaigns" on the list; on a campaign, its editor and a new one, the bar leads back.
  const isCampaigns = /^\/campaigns\/?$/.test(location.pathname);
  const isCampaignPage = /^\/campaigns\/(new|\d+)(\/edit)?\/?$/.test(location.pathname);
```

add `|| isCampaigns || isCampaignPage` to `isFramed`, and put these branches first in the title chain (before `isPlanPage ? (`):

```tsx
        {isCampaignPage ? (
          <nav aria-label="Breadcrumb" className="flex items-center h-full">
            <Link
              to="/campaigns"
              className="-ml-2 inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Campaigns
            </Link>
          </nav>
        ) : isCampaigns ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Campaigns</h1>
          </div>
        ) : isPlanPage ? (
```

(The `17px` title matches every other framed bar title in this file; Navbar is outside the Campaigns house-rules suite.)

In `src/layouts/DashboardLayout.tsx`, under `isProjects`, add:

```ts
  // Campaigns wear the Organizations frame too (campaigns spec 2026-10-04 §2).
  const isCampaigns = /^\/campaigns(\/.*)?$/.test(location.pathname);
```

and add `|| isCampaigns` to the `p-0` condition.

- [ ] **Step 5: The routes**

In `src/App.tsx`:

1. Replace the two old imports (`CampaignsList`, `CampaignEditor`) with:

```tsx
import { CampaignsHome } from './pages/campaigns/CampaignsHome';
import { EditCampaignRoute, NewCampaignRoute } from './pages/campaigns/CampaignBuilder';
import { CampaignPage } from './pages/campaigns/CampaignPage';
import { Unsubscribe } from './pages/campaigns/Unsubscribe';
```

2. Under `<Route path="/s/:token" element={<HostedForm />} />`, add:

```tsx
        {/* The one-click unsubscribe a customer opens from a campaign email
            (campaigns spec §2.4): no shell, no session, light only. */}
        <Route path="/u/:token" element={<Unsubscribe />} />
```

3. Replace the `campaigns` route block with:

```tsx
          {/* Campaigns (spec 2026-10-04 §2): Mine and Shared with me, the
              editor modal over the list, a campaign's page with its editor. */}
          <Route path="campaigns">
            <Route element={<CampaignsHome />}>
              <Route index element={null} />
              <Route path="new" element={<NewCampaignRoute />} />
            </Route>
            <Route path="create" element={<Navigate to="/campaigns/new" replace />} />
            <Route path=":id" element={<CampaignPage />}>
              <Route path="edit" element={<EditCampaignRoute />} />
            </Route>
          </Route>
```

4. Change the `ThemeSynchronizer` comment to "The hosted survey form (/s/:token) and the unsubscribe page (/u/:token) are light only."

- [ ] **Step 6: Remove the old campaigns and their pointers**

```bash
git rm src/pages/campaigns/CampaignsList.tsx src/pages/campaigns/CampaignsList.test.tsx src/pages/campaigns/CampaignEditor.tsx src/pages/campaigns/CampaignEditor.test.tsx src/pages/campaigns/RecipientPicker.tsx src/pages/campaigns/campaignApi.ts src/pages/campaigns/types.ts
```

In `src/pages/copilot/copilotApi.ts`, change line 2's `campaigns/campaignApi.ts's own` to `features/campaigns/campaignApi.ts's own`; in `src/pages/copilot/cockpitApi.ts`, change `copilotApi.ts/campaignApi.ts's own.` to `copilotApi.ts's own.`

Run: `grep -rn "RecipientPicker\|recipient_ids\|pages/campaigns/campaignApi\|CampaignsList\|CampaignEditor" src`
Expected: no output.

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run --maxWorkers=2 src/components/layout src/layouts src/pages/campaigns src/lib`
Expected: PASS.

- [ ] **Step 8: Type-check, lint, build, commit**

Run: `npx tsc -b --noEmit && npx eslint src/App.tsx src/components/layout src/layouts src/features/notifications src/pages/copilot/copilotApi.ts src/pages/copilot/cockpitApi.ts && npm run build`
Expected: no lint output; the build succeeds.

```bash
git add -A src/App.tsx src/components/layout src/layouts src/features/notifications src/pages/copilot/copilotApi.ts src/pages/copilot/cockpitApi.ts src/pages/campaigns
git commit -m "$(cat <<'EOF'
feat(campaigns): wire the routes, the bar, campaign_sent, and remove hand-picked recipients

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: The house rules, the journey, the product documents, and final verification

Spec §2.6 ("a Campaigns house-rules suite; unit and page tests; one e2e-style journey: build a campaign on a segment, preview it, send it, read the deliveries, unsubscribe through `/u/:token`, then send again and see that contact skipped as `unsubscribed`"); Global Constraints "Product documents". Skills `verification-before-completion`, `finishing-a-development-branch`.

**Files:**
- Create: `src/components/campaigns/houseRules.test.ts`, `src/e2e/campaigns.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: `houseRuleSuite`, `rowsIconsTargetsSuite` (`src/test/houseRules.ts`); `stubCampaigns`; `renderCampaigns`, `renderUnsubscribe`; everything built in Tasks 1–14.
- Produces: nothing in code.

- [ ] **Step 1: Write the house-rules suite**

Create `src/components/campaigns/houseRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over Campaigns (spec §2.6, Decision 1): both folders whole.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/campaigns/*.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.') && !file.endsWith('/testPages.tsx'));
const UNSUBSCRIBE = '../../pages/campaigns/Unsubscribe.tsx';

houseRuleSuite('campaigns house rules', files);
rowsIconsTargetsSuite('campaigns house rules beyond the shared suite', files);

describe('campaigns: coverage, plain text, copy, and the public page', () => {
  it('covers the pages, the editor, the preview, the sends and the deliveries', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/campaigns/CampaignsHome.tsx',
        '../../pages/campaigns/CampaignBuilder.tsx',
        '../../pages/campaigns/CampaignPage.tsx',
        UNSUBSCRIBE,
        './PreviewPane.tsx',
        './MessageFields.tsx',
        './SendsSection.tsx',
        './Deliveries.tsx',
        './SendDialog.tsx',
      ]),
    );
  });

  it('never renders markup from the server (spec §3: plain text)', () => {
    expect(sources.filter(([, source]) => source.includes('dangerouslySetInnerHTML')).map(([file]) => file)).toEqual([]);
  });

  it('writes no em dash in its copy', () => {
    expect(sources.filter(([, source]) => source.includes('—')).map(([file]) => file)).toEqual([]);
  });

  it('keeps the unsubscribe page light, and away from the session (spec §2.4)', () => {
    expect(files[UNSUBSCRIBE]).toBeDefined();
    expect(files[UNSUBSCRIBE]).not.toMatch(/\bdark:/);
    expect(files[UNSUBSCRIBE]).not.toMatch(/useAppSelector|useAppDispatch|useSelector|authSlice/);
  });

  it('never stores anything in the browser', () => {
    expect(sources.filter(([, source]) => /localStorage|sessionStorage/.test(source)).map(([file]) => file)).toEqual([]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/campaigns/houseRules.test.ts`
Expected: PASS. If a control is reported without a 44px target, give it `min-h-11 sm:min-h-9` (or `h-11 w-11`) in its own `className` or a style constant in the same file; if a Lucide icon is reported, add `aria-hidden="true"`; if a file is reported for an em dash, reword it (comments included). Do not weaken the suite.

- [ ] **Step 2: Write the journey**

Create `src/e2e/campaigns.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCampaigns } from '../features/campaigns/testCampaigns';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { requestsOf } from '../features/surveys/testSurveys';
import { renderCampaigns, renderUnsubscribe } from '../pages/campaigns/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the Campaigns pages,
// the unsubscribe page, the store and the router. Only fetch is stubbed, by a
// stateful stub in the contract's shapes that skips people in spec §1.3's
// order (spec §2.6: build on a segment, preview, send, read the deliveries,
// unsubscribe through /u/:token, send again and see that person skipped).
const where = () => screen.getByTestId('where').textContent;
const names = (list: HTMLElement) => within(list).getAllByRole('listitem').map((item) => within(item).getAllByRole('link')[0].textContent);

describe('Campaigns', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('builds, previews and sends a campaign, takes an unsubscribe, and skips that person next time', { timeout: 30000 }, async () => {
    const { spy, tokensOf, addPerson } = stubCampaigns();

    // 1. A new campaign from the list, on the Champions contact segment.
    const team = renderCampaigns('/campaigns', { nav: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Campaigns' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'New campaign' }));
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    expect(where()).toBe('/campaigns/new');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion update');
    const segment = within(modal).getByRole('combobox', { name: 'Segment' });
    await waitFor(() => expect(segment).not.toBeDisabled());
    await userEvent.selectOptions(segment, '9');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Subject' }), 'News for {{first_name}');
    const body = within(modal).getByRole('textbox', { name: 'Body' });
    await userEvent.type(body, 'Hello ');
    await userEvent.click(within(modal).getByRole('button', { name: 'Insert first name' }));
    await userEvent.type(body, ', we have news.');
    expect(body).toHaveValue('Hello {first_name}, we have news.');
    expect(within(modal).getByRole('region', { name: 'Preview' })).toHaveTextContent('Save the draft to see it for a real person.');

    // 2. Save: its page opens. Edit previews it for real people.
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100'));
    await userEvent.click(await screen.findByRole('link', { name: 'Edit' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit Champion update' });
    const preview = within(edit).getByRole('region', { name: 'Preview' });
    await waitFor(() => expect(preview.querySelector('[data-part="subject"]')).toHaveTextContent('News for Rosa'));
    await userEvent.selectOptions(await within(preview).findByRole('combobox', { name: 'Preview for' }), '62');
    await waitFor(() => expect(preview.querySelector('[data-part="body"]')).toHaveTextContent('Hello Tom, we have news.'));

    // 3. Send now…, on a fresh count; the send opens on the page.
    await userEvent.click(within(edit).getByRole('button', { name: 'Send now…' }));
    await waitFor(() => expect(edit.querySelector('[data-part="audience"]')).toHaveTextContent('Emails 3 people · Skips 1 without an email'));
    await userEvent.click(within(edit).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100?send=500'));

    // 4. Who it reached: the people I can open, one skipped, one I can't open.
    expect(names(await screen.findByRole('list', { name: 'People' }))).toEqual(['Rosa Diaz', 'Tom Hale', 'Ivy Chen']);
    expect(document.querySelector('[data-part="hidden"]')).toHaveTextContent("1 more person you can't open");
    team.unmount();

    // 5. Rosa opens her link: no app frame, no session; she unsubscribes.
    const token = tokensOf(500).find((one) => one.contact === 61)?.token as string;
    const rosa = renderUnsubscribe(token);
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByRole('heading', { level: 1, name: "You're unsubscribed." })).toBeInTheDocument();
    rosa.unmount();

    // 6. Someone joins the segment; the next send reaches only them and
    // skips Rosa as unsubscribed.
    addPerson(9, { contact: { id: 65, name: 'Uma Shah' }, record: { kind: 'organization', id: 2, name: 'Initech' }, email: true, visible: true });
    renderCampaigns('/campaigns/100', { nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion update' });
    await waitFor(() =>
      expect(dialog.querySelector('[data-part="audience"]')).toHaveTextContent('Emails 1 person · Skips 1 unsubscribed · 2 already received it · 1 without an email'),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100?send=501'));
    const next = await waitFor(() => {
      const found = document.querySelector('[data-send="501"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    await within(next).findByRole('list', { name: 'People' });
    await userEvent.click(within(within(next).getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Skipped' }));
    await userEvent.selectOptions(within(next).getByRole('combobox', { name: 'Reason' }), 'unsubscribed');
    await waitFor(() => expect(names(within(next).getByRole('list', { name: 'People' }))).toEqual(['Rosa Diaz']));
    expect(within(next).getByRole('list', { name: 'People' })).toHaveTextContent('Unsubscribed');
    expect(requestsOf(spy, 'POST', /^\/campaigns\/100\/sends\/$/)).toHaveLength(2);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/e2e/campaigns.test.tsx`
Expected: PASS.

- [ ] **Step 3: Update the product documents**

In `docs/03-ui-ux-design.md`, after the "Plans (Project Management)" section, add:

```markdown
### Campaigns

Spec `docs/superpowers/specs/2026-10-04-campaigns-design.md` §2 (plan
`docs/superpowers/plans/2026-10-04-campaigns-frontend.md`). The pages sit in
`OrganizationsFrame` under the framed bar ("Campaigns" on `/campaigns`,
"‹ Campaigns" on a campaign, its editor and a new one).

- **`/campaigns`.** Tabs Mine and Shared with me (`?tab=shared`), Show
  archived (`?archived=1`) and **New campaign**. One rounded row per
  campaign (`CampaignRowItem`): the name and its status pill (Draft, Active,
  Archived: a word, an icon and a tint), the segment with its kind's icon,
  the owner, and the last send ("2 Oct · 6 sent · 2 skipped" in DM Mono,
  "Sending…", "Never sent", or "Choose a segment to send" on a migrated
  draft). Show more on the cursor. "No campaigns yet" with New campaign;
  an error with Try again.
- **The editor** (`BuilderDialog`, `/campaigns/new` over the list,
  `/campaigns/:id/edit` over the page; the scrim keeps the draft): Name; the
  segment (my own, grouped by kind) and, for organisation and account
  segments, `RoleFields` ("Who to email at each organisation"); Subject and
  Body with `0 of 150` / `0 of 5000` in DM Mono and three merge-field chips
  that insert at the caret; Sharing. The preview pane (beside from `lg`,
  below on phones) draws the typed text with the footer until the first
  save, then shows the server's rendering for one person of the audience
  (Preview for), 400 ms after typing stops. Save closes it; Send now… saves,
  counts again on the server ("Emails 212 people · Skips 14 unsubscribed ·
  9 emailed in the last 3 days · 3 already received it") and sends once.
  Field refusals sit at their fields; a refusal with no field (Email isn't
  set up…) sits at the Send button and takes focus.
- **A campaign (`/campaigns/:id`).** The name at 22px; status, segment,
  roles, owner and sharing; the owner's Send now… (the narrow builder
  dialog with the same confirm), Edit, Archive or Unarchive, and Delete
  while it was never sent; an archived notice. A migrated draft lists
  "Picked by hand before segments" with "Choose a segment to send". Sends
  are disclosure rows (date, "Sent by …" or "From rule …", figures in DM
  Mono, Migrated, "Sending…" polled every 3 s); one opens as sent (subject,
  body) with its deliveries: All / Sent / Skipped and a Reason select, each
  person linked with their organisation or account, the status and reason
  in words, and "N more people you can't open".
- **`/u/:token`.** Public, light only, no session: "Stop emails from
  <workspace>?" and Unsubscribe; then "You're unsubscribed."; one expired
  page for every bad link; its own words when throttled.
- **Elsewhere.** A contact who unsubscribed reads "Unsubscribed from
  campaigns on <date>" with Re-subscribe (asked first). The rule builder's
  sixth Then card is Send a campaign (a campaign picker and Send without
  review); a night reads "Campaign: waiting for your review" and the like;
  the Review Queue's From your rules shows campaign reviews ("Would email 2
  people · 1 skipped", the records, Approve and Skip). The bell gives
  `campaign_sent` a megaphone.
```

In `docs/04-app-flow.md`:

1. Replace the row `| \`/campaigns\`, \`/campaigns/create\`, \`/campaigns/:id\` | \`CampaignsList\`, \`CampaignEditor\` | auth |` with:

```markdown
| `/campaigns`, `/campaigns/new`, `/campaigns/:id`, `/campaigns/:id/edit` | `CampaignsHome` (Mine, Shared with me; `?tab=`, `?archived=1`), the editor modal (`NewCampaignRoute`, `EditCampaignRoute` in `pages/campaigns/CampaignBuilder.tsx`), `CampaignPage` (`?send=<id>` opens a send). `/campaigns/create` redirects to `/campaigns/new`. See 4.5l | auth |
| `/u/:token` | `Unsubscribe`: a campaign email's one-click unsubscribe. Outside the guard and the shell, no session, light only | public |
```

2. After section `4.5k Plans`, add:

```markdown
### 4.5l Campaigns

Spec `docs/superpowers/specs/2026-10-04-campaigns-design.md`. A campaign is
the owner's plain-text email to one of their segments (Surveys' audience
rules). The list reads `GET /campaigns/?tab=&archived=&cursor=`; the editor
`POST`s once, then `PATCH`es only what changed; its preview pane posts
`POST /campaigns/<id>/preview/ {contact, subject, body}` 400 ms after the
last change and reads `GET /campaigns/<id>/audience/` for its person picker;
Send now… saves, reads `audience/` again, then `POST /campaigns/<id>/sends/`.
A campaign's page reads `GET /campaigns/<id>/`, `GET …/sends/` and, for an
open send, `GET …/sends/<sid>/deliveries/?status=&reason=&cursor=`; a
`sending` send is read again every 3 s. Archive is `PATCH {status}`; Delete
answers 409 once sent. `/u/:token` reads and posts
`/campaigns/unsubscribe/<token>/` without a session. A contact's
Re-subscribe is `PATCH /contacts/<id>/ {campaigns_unsubscribed: false}`. The
rule action `campaign` and its reviews go through the Rules endpoints.
```

In `.agents/workflows/repo-architecture.md`:

1. In the `features/` tree, after the `plans/` line, add `│   │   ├── campaigns/          ← Campaigns: types, API (the unsubscribe pair sent without a session), options and sentences, the editor's draft, refusals at fields or the Send button, URL state; testCampaignFixtures.ts, testCampaigns.ts (stubCampaigns)`.
2. In the `components/` tree, after the `plans/` line, add `│   │   ├── campaigns/          ← row parts and row, a campaign's header, old recipients, audience and message fields, the preview pane, the confirm step and dialog, sends and deliveries`.
3. In the `pages/` tree, add `│       ├── campaigns/          ← CampaignsHome, CampaignBuilder, CampaignPage, Unsubscribe (/u/:token, public)`.
4. In the route tree, add after `surveys/`:

```
├── campaigns/
│   ├── (layout: CampaignsHome — ?tab=mine|shared, ?archived=1)
│   │   ├── (index)
│   │   └── new                → NewCampaignRoute (the editor over the list)
│   ├── create                 → Redirects to /campaigns/new
│   └── :id                    → CampaignPage (?send=<id> opens a send)
│       └── edit               → EditCampaignRoute (the owner's; a notice for anyone else)
```

5. Change "Outside the guard and the shell: /s/:token → HostedForm (public, no session, light only)." to "Outside the guard and the shell: /s/:token → HostedForm and /u/:token → Unsubscribe (public, no session, light only)."
6. Change the table row `| \`/projects\`, \`/campaigns\`, \`/canvas\` | No route defined |` to `| \`/canvas\` | No route defined |` if `/projects` and `/campaigns` are its only other entries; otherwise remove `/campaigns` from it.
7. After section `### 14. Plans`, add:

```markdown
### 15. Campaigns (`pages/campaigns/`)

Owned, segment-targeted email (spec `docs/superpowers/specs/2026-10-04-campaigns-design.md`),
on backend `services/campaigns`: a campaign is a plain-text subject and body
with three merge fields, sent to one of the owner's segments through Surveys'
audience rules; each send is kept with its deliveries, twice-filtered.
`/campaigns` lists Mine and Shared with me; the editor is the builder modal
(`BuilderDialog`, `SharingFields`, Surveys' `RoleFields`, `SegmentOptions`,
`useMySegments`) with a live preview; a campaign's page lists its sends;
`/u/:token` unsubscribes without a session. Rules can send a campaign, with
or without review; contacts show their unsubscribe. See
`docs/03-ui-ux-design.md` "Campaigns".
```

- [ ] **Step 4: Commit the suite, the journey and the documents**

```bash
git add src/components/campaigns/houseRules.test.ts src/e2e/campaigns.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "$(cat <<'EOF'
test(e2e): the campaigns journey, house rules, and the product documents

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: The whole suite, lint and build**

Run, one at a time:

```bash
npx tsc -b --noEmit
npx vitest run --maxWorkers=2
npm run lint
npm run build
```

Expected: every test passes (Segments, Surveys, Rules, Plans, Contacts, Organizations, Accounts and the new Campaigns suites); `npm run lint` ends with **16 problems (0 errors, 16 warnings)**, the pre-existing ones, and no new warning; the build is clean. Fix what fails in the task that owns it, with its own commit. Never run prettier.

- [ ] **Step 6: The browser check against the local backend**

With `revenact-backend` on its campaigns branch running locally (`venv/bin/python manage.py runserver`, SMTP configured to the console backend) and this app on `npm run dev`:

1. Open **Campaigns** from the sidebar: Mine lists migrated campaigns (a migrated draft reads "Choose a segment to send"); Shared with me and Show archived change the URL.
2. **New campaign** on an organisation segment: roles ticked, chips insert at the caret, the local preview shows the footer; Save; Edit: Preview for a real person updates as you type; Send now…: the count matches the backend; Send now once; the send opens with its deliveries.
3. Copy an unsubscribe link from the console email, open `/u/<token>` in a private window: light, no app frame; Unsubscribe; send again (after adding someone to the segment) and filter Skipped → Unsubscribed. The contact's page reads "Unsubscribed from campaigns on …"; Re-subscribe.
4. In Scenarios, build a rule with **Send a campaign**; Test this rule shows "Would email …"; run `venv/bin/python manage.py run_health_maintenance`; approve the review in `/brain/review` (it opens the send); archive the campaign and run again: the rule reads `campaign_gone` with what to do.
5. Check `/campaigns`, a campaign, the editor and `/u/:token` at 375, 768, 1024 and 1440 px, light and dark (the unsubscribe page stays light): no sideways scroll, every control at least 44px tall on the phone, the preview below the form on phones.

Write what was seen (and any fix) in the PR description.

- [ ] **Step 7: Finish the branch**

Use `superpowers:finishing-a-development-branch`. Do not push from this plan; the backend PR merges and deploys first.

---

## Self-review

**Spec coverage** (frontend scope: §2, §4; §0 and §1 as they show in the UI):

| Spec | Where |
|---|---|
| §0 hand-picked recipients, `RecipientPicker`, old `send/` | Task 14 (removed), Contract note 15 |
| §2.1 tabs Mine / Shared with me, New campaign, rows (name, segment with kind icon, owner, status pill, last send / Never sent / Choose a segment to send), Show archived, skeleton, empty, error with Retry, Show more | Task 4 |
| §2.2 routes over the list and over the page, `BuilderDialog`, scrim keeps the draft | Tasks 7, 14 |
| §2.2 fields: name, segment picker grouped by kind, `RoleFields`, subject, body with three chips at the cursor, sharing, counters in mono | Tasks 3, 6, 7 |
| §2.2 preview pane: one person, picker from the first 20, 400 ms, latest wins, footer, below on phones | Task 6 (and Contract notes 3, 4) |
| §2.2 Save; Send now… with a fresh `audience/` count, then `sends/`; refusals at fields; `EMAIL_NOT_SET_UP` at the Send button keeping the campaign; field-less refusal takes focus; submit once | Tasks 7, 9 |
| §2.3 header (name, segment, roles, owner, sharing; Edit, Send now…, Archive, Delete only when never sent; archived notice) | Tasks 5, 9 |
| §2.3 sends list (date, Sent by / From rule unlinked when unreadable, counts, Migrated, Sending… refreshing) | Task 8 |
| §2.3 a send: subject and body as sent; deliveries with All / Sent / Skipped and reason; contact linked, record, status, reason in words; "N more people you can't open" | Task 8 |
| §2.3 migrated drafts: "Picked by hand before segments", "Choose a segment to send" | Task 5 |
| §2.4 `/u/:token`: public, no store or session, light only, button not on load, done copy, one expired page, throttled copy | Tasks 10, 14 |
| §2.5 contact page: unsubscribed line, Re-subscribe with confirm, for anyone who can open the contact | Task 11 |
| §2.5 rules builder card, picker by kind, Send without review, sentence | Task 12 |
| §2.5 rule nights, paused `campaign_gone` | Task 12 |
| §2.5 Review Queue campaign reviews, stored refusal at Approve | Task 13 |
| §2.5 `campaign_sent` with an icon, linking to the campaign | Task 14 (Contract note 14) |
| §2.6 house rules, unit and page tests, the e2e journey | Tasks 1–15 (suite and journey in Task 15) |
| §4 every endpoint and field name; refusal shapes; rules additions | Task 2 (`campaignApi`, `stubCampaigns`), Tasks 12, 13 |

**Placeholder scan:** no "TBD", "TODO", "similar to", or code steps without code. Edits to existing files name the exact lines to add or replace; the documents' text is given verbatim.

**Type consistency, checked across tasks:**
- `CampaignRow`, `Campaign`, `CampaignSend`, `Delivery`, `Audience`, `Counts`, `SkipReason` (Task 1) are what `campaignApi` returns (Task 2) and every component reads; `SegmentRef.kind` is always passed through `segmentKindOf` before it meets `SegmentKind` (Tasks 4, 5, 7, 12).
- `CampaignErrors` and `sendRefusal` (Task 2) are what `checkDraft` (Task 3) returns and `CampaignForm` (Task 7), `SendDialog` (Task 9) and `CampaignHeader` (Task 5) read.
- `CampaignDraft`, `toWrite`, `changedFields`, `insertMergeField` (Task 3) are used only by `CampaignForm` (Task 7) and `MessageFields` (Task 6).
- `AudienceLoad` / `useCampaignAudience(campaignId, version)` and `PreviewPane({ campaignId, subject, body, audience, contact, onContact, stale, sender, workspace })` (Task 6) match their use in `CampaignForm` (Task 7).
- `SendStep({ name, audience, headingRef })` and `SendButton({ busy, blocked, refusal, onSend })` (Task 7) are what `SendDialog` (Task 9) renders.
- `CampaignOutlet` is `{ campaign, onReplace }` in Task 5 and gains `onSent(sendId)` in Task 9, where both the page and `EditCampaignRoute` are updated together.
- `SendsSection({ campaign, version, onFinished })` (Task 8) gets `version` from `CampaignView`'s `sendsVersion`, which Task 9 bumps.
- `CampaignAction` / `CampaignActionWrite` (Task 12) follow Plans' read/write split; `toActions` sends the id; `RuleReview = SurveyReview | CampaignReview` and `ApproveAnswer` (Task 13) are narrowed with `review.kind === 'campaign'` and `'campaign_send_id' in answer`.
- `stubCampaigns()` returns `{ spy, tokensOf, addPerson, runNight }`; new campaigns are 100+, sends 500+, deliveries 5000+; the Rules stub's `onCampaignApproved(review, by)` (Task 13) sends through the Campaigns stub's `claim`. `renderCampaigns(url, { width?, nav? })` gains routes in Tasks 5, 7 (always before the `*` catch-all); `renderUnsubscribe(token)` (Task 10) has no store.

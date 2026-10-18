# Work, delivery 3 ("tracking that pushes"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings › Work gains Tasks (escalation, the workspace timezone, working days) and Notifications (the daily digest and whether this server can send email), Briefs moves from AI into Work, the bell gets `task_overdue` and `task_escalated`, and the task panel's trail says who Revenact reminded or told.

**Architecture:** `features/work` gains the delivery 3 settings fields (types, stub, fixtures) and one pure module, `workTracking.ts`, holding both new pages' words, drafts, browser checks and patches; the shared `readRefusal` learns the five new field names. `components/work` gains a form and a read-only summary for each page. `pages/settings` gains `WorkSettingsFrame` (the settings h1, intro, `GET /work/settings/` with skeleton and Try again) and the two pages on it. The nav and routes add the pages and move Briefs. `NotificationKindIcon` and `eventSentence` take the new kinds. No Redux, no new hooks: each page reads once, as Recommendations does.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, lib ES2023 so `Intl.supportedValuesOf` is typed), react-router 7, Tailwind v4 tokens, Vitest + Testing Library (jsdom), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-07-work-round-design.md` §3.3 (with §3.1, §3.2, §4 to §6 as they apply to delivery 3). **API contract (binding):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-trk-be/docs/superpowers/plans/2026-10-08-work-tracking-api.md`. House style and the code this plan extends: `docs/superpowers/plans/2026-10-07-work-recommended-frontend.md` (delivery 2) and `docs/superpowers/plans/2026-10-07-work-tasks-frontend.md` (delivery 1). Read the spec section, the contract and this plan before starting.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-trk-fe`, branch `feat/work-tracking`, based on `main` at `994045d` (deliveries 1 and 2 merged). `node_modules` is a symlink: never commit it; always `git add <explicit paths>`, never `git add -A` or `git add .`.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees; use a WIP commit if you must set work aside).
- **Commands.** `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npm run lint`, `npm run build`. Run them in the foreground.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, or named Tailwind palette colours in any `.tsx`.
- **Type sizes 11/13/15 only** on every Work component (`text-[11px]`, `text-[13px]`, `text-[15px]`), at most four per surface; no named sizes. The settings pages keep the settings frame's own `text-[20px] font-bold` h1, which is why the h1 lives in `pages/settings/WorkSettingsFrame.tsx`, never in `components/work`.
- **Figures in DM Mono:** every count, hour and day number a summary shows uses `MONO` (`font-mono-brand tabular-nums`).
- **44px targets:** every `<button>`, `<Link>`, `<select>`, `<input>` and `<textarea>` reaches `min-h-11` on phones, directly or through a compliant constant (`BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `FILTER_SELECT`, `LINK`, or a local `const` holding `min-h-11` or one of those). `className={CONTROL}` alone does not count to the checker; this plan uses `const INPUT = \`${CONTROL} sm:w-28\`` and `const SELECT = \`min-h-11 ${CONTROL} sm:w-72\``. A checkbox's target is its wrapping label (`CHOICE`, `min-h-11`).
- **Lucide icons only**, each with `aria-hidden="true"`. No emoji. **No em dash (`—`) anywhere in a file under `src/components/work/`, `src/pages/work/` or `src/features/work/`, comments and tests included, nor in any `src/pages/settings/Work*.tsx` file.**
- **No glass**, no card inside a card. **One primary per settings page** (Save changes). Today's New task stays the only `PRIMARY` in the Work section itself.
- **Every page has loading (a skeleton, not a spinner) and error (Try again) states.**
- **The UI never guesses rights:** `can_edit` from `GET /work/settings/` decides form versus text; `email_ready` decides the email line. The frontend never computes "today" (the server sends it, now in the workspace timezone).
- **Copy.** Sentence case. The server's refusals are shown verbatim. The contract's sentences are used word for word where it gives them.
- **Out of scope:** any UI for `digest_opt_out` (account settings are a later round; the type only), the backend, the digest email itself, the Recommendations page (unchanged apart from the nav around it), the mock `features/tasks/tasksSlice`.

## Decisions (where the spec or the contract leaves a choice)

1. **The Work group** in `WORKSPACE_SETTINGS_NAV` becomes, in order: Recommendations (`/settings/recommendations`, `Lightbulb`, unchanged), Tasks (`/settings/work-tasks`, `ListTodo`), Notifications (`/settings/work-notifications`, `BellRing`), Briefs (`/settings/brief-delivery`, `Newspaper`, moved out of AI; its URL and page are unchanged). No item is capability-gated: every member opens every Work page and `can_edit` decides form or text.
2. **Tasks page.** Three settings: "Tell the manager after (working days overdue)" (text input, `inputMode="numeric"`, 1 to 30, checked in the browser with the contract's sentence "Choose a whole number from 1 to 30."), "Timezone" (a select), "Working days" (seven checkboxes, Monday to Sunday, in a fieldset; none ticked is refused in the browser with "Choose at least one working day.").
3. **Timezone options** are `Intl.supportedValuesOf('timeZone')` plus `"UTC"` plus the stored value when the list lacks it, de-duplicated, `"UTC"` first then alphabetical. Where `supportedValuesOf` is missing or throws, the options are `["UTC", stored]` (de-duplicated). The server is the judge: a name it refuses comes back as "Choose a timezone from the list." under the select.
4. **Notifications page.** "Daily digest" (a `role="switch"` checkbox) and "Send after" (a select of `00:00` to `23:00`, values 0 to 23, with the note "Local time in <timezone>, set under Tasks."). The hour select stays usable while the digest is off (the hour is kept for when it is switched on). When `email_ready` is `false`, both admin and member see, above the settings, the contract's line "Email isn't set up on this server yet: digests are skipped" in `text-warning` (a plain paragraph: it is a standing fact, not an alert). When it is `true`, nothing is said.
5. **Saving** works exactly as Recommendations does: only changed fields are sent; Save changes is `aria-disabled` (never `disabled`) until something changed; "Saved." in the status line after a save; a refusal goes under its field (shared `readRefusal`, which learns `timezone`, `working_days`, `escalate_after_days`, `digest_enabled`, `digest_hour`), anything else on the form. `working_days` is sent sorted.
6. **Members** read "Only admins can change these." and the values as text: "Tell the manager after (working days overdue): 2", "Timezone: UTC", "Working days: Monday, Tuesday, Wednesday, Thursday, Friday"; "Daily digest: On", "Send after: 08:00". Figures in DM Mono.
7. **One frame for the new pages.** `pages/settings/WorkSettingsFrame.tsx` holds the 20px h1, the intro, the read and its skeleton and error. Recommendations keeps its own copy of that code (moving it onto the frame is a later tidy-up, not this delivery).
8. **The bell.** `task_overdue` gets Lucide `AlarmClock`; `task_escalated` gets Lucide `TriangleAlert`. Both carry the `?task=` link the backend writes, so the Navbar's existing click handling opens the task panel with the same history state as `task_assigned`; this delivery only proves that with tests.
9. **The trail.** `nudged` reads "Revenact reminded Carl CSM: 2 days overdue." and `escalated` reads "Revenact told Mona Manager: 2 working days overdue." (the contract's sentences; "you" for the reader, "1 day", "1 working day"). Without the data (an event written before delivery 3's backend) they keep delivery 1's sentences.
10. **`digest_opt_out`** is added to the `User` type as optional, with no UI and no write.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/features/work/workTypes.ts` | modify | `WorkSettings` and `WorkSettingsPatch` gain the delivery 3 fields |
| `src/features/work/workApi.ts` | modify | `RefusalField` and `FIELDS` gain the five settings fields |
| `src/features/work/testWorkFixtures.ts` | modify | `WORK_SETTINGS` gains the contract's defaults |
| `src/features/work/testWork.ts` | modify | The stub validates and saves the new fields |
| `src/features/work/workTracking.ts` | create | Both pages' words, weekdays, timezone options, hour labels, drafts, checks, patches |
| `src/features/work/workText.ts` | modify | `nudged` and `escalated` sentences |
| `src/features/notifications/types.ts` | modify | `task_overdue`, `task_escalated` |
| `src/features/auth/authSlice.ts` | modify | `User.digest_opt_out?` |
| `src/components/work/WorkTasksForm.tsx` | create | Tasks, for an admin |
| `src/components/work/WorkTasksSummary.tsx` | create | Tasks, for a member |
| `src/components/work/WorkNotificationsForm.tsx` | create | Notifications, for an admin |
| `src/components/work/WorkNotificationsSummary.tsx` | create | Notifications, for a member |
| `src/pages/settings/WorkSettingsFrame.tsx` | create | h1, intro, read, skeleton, error |
| `src/pages/settings/WorkTasksPage.tsx` | create | `/settings/work-tasks` |
| `src/pages/settings/WorkNotificationsPage.tsx` | create | `/settings/work-notifications` |
| `src/pages/settings/workspaceSettingsNav.ts` | modify | Work group; Briefs moved |
| `src/pages/settings/routes.tsx` | modify | Two routes |
| `src/components/layout/NotificationKindIcon.tsx` | modify | Two icons |
| `src/components/work/houseRules.test.ts` | modify | New files covered |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` | modify | Delivery 3 described |

Tests sit beside their files: `workTracking.test.ts`, `workText.test.ts`, `testWork.test.ts`, `workApi.test.ts`, `WorkTasksPage.test.tsx`, `WorkNotificationsPage.test.tsx`, `workspaceSettingsNav.test.ts`, `NotificationKindIcon.test.tsx`, `Navbar.test.tsx`.

---
### Task 1: The delivery 3 settings data layer, the refusal fields and the stub

**Files:**
- Modify: `src/features/work/workTypes.ts` (the `WorkSettings` and `WorkSettingsPatch` interfaces, near line 257)
- Modify: `src/features/work/workApi.ts:52-53` (`RefusalField`, `FIELDS`)
- Modify: `src/features/work/testWorkFixtures.ts` (`WORK_SETTINGS`, near line 176)
- Modify: `src/features/work/testWork.ts` (`settingsRefusal` near line 160, `saveSettings` near line 417)
- Modify: `src/features/auth/authSlice.ts` (`User`, after `is_owner`)
- Test: `src/features/work/testWork.test.ts`, `src/features/work/workApi.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `WorkSettings` with `timezone: string`, `working_days: number[]`, `escalate_after_days: number`, `digest_enabled: boolean`, `digest_hour: number`, `email_ready: boolean`; `WorkSettingsPatch` with the same five writable fields optional; `RefusalField` including `'timezone' | 'working_days' | 'escalate_after_days' | 'digest_enabled' | 'digest_hour'`; `WORK_SETTINGS` with `timezone: 'UTC'`, `working_days: [0, 1, 2, 3, 4]`, `escalate_after_days: 2`, `digest_enabled: true`, `digest_hour: 8`, `email_ready: true`; the stub refusing in the contract's words and storing `working_days` sorted and de-duplicated.

- [ ] **Step 1: Write the failing tests**

Append inside the outer `describe('stubWork ...')` block of `src/features/work/testWork.test.ts`, before its closing `});`:

```ts
  it('reads and saves the delivery 3 settings within the contract limits (2026-10-08-work-tracking-api.md)', async () => {
    const { settings } = stubWork();
    const read = (await get('/work/settings/')).body as WorkSettings;
    expect([read.timezone, read.working_days, read.escalate_after_days, read.digest_enabled, read.digest_hour, read.email_ready]).toEqual([
      'UTC',
      [0, 1, 2, 3, 4],
      2,
      true,
      8,
      true,
    ]);
    expect(
      (await patch('/work/settings/', { timezone: 'Mars/Olympus', working_days: [], escalate_after_days: 31, digest_enabled: 'yes', digest_hour: 24 })).body,
    ).toEqual({
      timezone: ['Choose a timezone from the list.'],
      working_days: ['Choose at least one working day.'],
      escalate_after_days: ['Choose a whole number from 1 to 30.'],
      digest_enabled: ['Choose on or off.'],
      digest_hour: ['Choose a whole number from 0 to 23.'],
    });
    expect((await patch('/work/settings/', { working_days: [7] })).body).toEqual({ working_days: ['Choose at least one working day.'] });
    const saved = (await patch('/work/settings/', { timezone: 'Asia/Kolkata', working_days: [4, 0, 0], escalate_after_days: 3, digest_enabled: false, digest_hour: 0 }))
      .body as WorkSettings;
    expect([saved.timezone, saved.working_days, saved.escalate_after_days, saved.digest_enabled, saved.digest_hour]).toEqual(['Asia/Kolkata', [0, 4], 3, false, 0]);
    expect(settings.working_days).toEqual([0, 4]);
    // email_ready and can_edit are read only: sending them changes nothing.
    expect(((await patch('/work/settings/', { email_ready: false, can_edit: false })).body as WorkSettings).email_ready).toBe(true);
  });
```

Append inside `describe('workApi: reading a refusal', ...)` in `src/features/work/workApi.test.ts`:

```ts
  it('puts a Work setting’s refusal under its field (delivery 3)', () => {
    expect(
      readRefusal(refusal(400, { timezone: ['Choose a timezone from the list.'], digest_hour: ['Choose a whole number from 0 to 23.'] }), 'x'),
    ).toEqual({ field: { timezone: 'Choose a timezone from the list.', digest_hour: 'Choose a whole number from 0 to 23.' }, form: null });
    expect(readRefusal(refusal(400, { working_days: ['Choose at least one working day.'] }), 'x').field.working_days).toBe('Choose at least one working day.');
    expect(readRefusal(refusal(400, { escalate_after_days: ['Choose a whole number from 1 to 30.'] }), 'x').field.escalate_after_days).toBe(
      'Choose a whole number from 1 to 30.',
    );
    expect(readRefusal(refusal(400, { digest_enabled: ['Choose on or off.'] }), 'x').field.digest_enabled).toBe('Choose on or off.');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/work/testWork.test.ts src/features/work/workApi.test.ts --maxWorkers=2`
Expected: FAIL (the stub has no `timezone`; `readRefusal` ignores the new fields; TypeScript errors on `.field.timezone`).

- [ ] **Step 3: Types**

In `src/features/work/workTypes.ts`, replace the two interfaces:

```ts
/** GET /work/settings/ (deliveries 2 and 3). Unknown keys are ignored. */
export interface WorkSettings {
  recommend_to: RecommendTo;
  sources: Record<RecKind, SourceSettings>;
  dismiss_cooldown_days: number;
  /** An IANA name; Work's "today" is the date there (delivery 3). */
  timezone: string;
  /** Monday 0 to Sunday 6, ascending, at least one. */
  working_days: number[];
  /** Working days overdue before the manager is told, 1 to 30. */
  escalate_after_days: number;
  digest_enabled: boolean;
  /** Local hour in `timezone`, 0 to 23. */
  digest_hour: number;
  /** Read only: false when this server cannot send email, so digests are skipped. */
  email_ready: boolean;
  can_edit: boolean;
}

/** PATCH /work/settings/: any field, and inside `sources` any kind and field. */
export interface WorkSettingsPatch {
  recommend_to?: RecommendTo;
  sources?: Partial<Record<RecKind, Partial<SourceSettings>>>;
  dismiss_cooldown_days?: number;
  timezone?: string;
  working_days?: number[];
  escalate_after_days?: number;
  digest_enabled?: boolean;
  digest_hour?: number;
}
```

In `src/features/auth/authSlice.ts`, add after `is_owner?: boolean;` inside `User`:

```ts
  /** `/auth/me/` only: true means no daily Work digest for them (Work
   *  delivery 3). Nothing sets it in the UI yet; account settings will. */
  digest_opt_out?: boolean;
```

- [ ] **Step 4: The refusal fields**

In `src/features/work/workApi.ts`, replace lines 52-53:

```ts
export type RefusalField =
  | 'title'
  | 'description'
  | 'status'
  | 'blocked_reason'
  | 'due_date'
  | 'priority'
  | 'assignee_id'
  | 'body'
  | 'reason'
  | 'note'
  | 'timezone'
  | 'working_days'
  | 'escalate_after_days'
  | 'digest_enabled'
  | 'digest_hour';
const FIELDS: readonly RefusalField[] = [
  'title',
  'description',
  'status',
  'blocked_reason',
  'due_date',
  'priority',
  'assignee_id',
  'body',
  'reason',
  'note',
  'timezone',
  'working_days',
  'escalate_after_days',
  'digest_enabled',
  'digest_hour',
];
```

- [ ] **Step 5: Fixture and stub**

In `src/features/work/testWorkFixtures.ts`, replace the tail of `WORK_SETTINGS` (`dismiss_cooldown_days: 14,` and `can_edit: true,`) with:

```ts
  dismiss_cooldown_days: 14,
  timezone: 'UTC',
  working_days: [0, 1, 2, 3, 4],
  escalate_after_days: 2,
  digest_enabled: true,
  digest_hour: 8,
  email_ready: true,
  can_edit: true,
```

In `src/features/work/testWork.ts`, add above `function settingsRefusal`:

```ts
/** The contract's timezones: whatever this runtime knows, plus UTC. */
function knownZone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value === 'UTC') return true;
  try {
    return Intl.supportedValuesOf('timeZone').includes(value);
  } catch {
    return false;
  }
}

const isWeekdays = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.every((day) => inRange(day, 0, 6, true));
```

In `settingsRefusal`, add before the `if ('sources' in body)` line:

```ts
  if ('timezone' in body && !knownZone(body.timezone)) errors.timezone = ['Choose a timezone from the list.'];
  if ('working_days' in body && !isWeekdays(body.working_days)) errors.working_days = ['Choose at least one working day.'];
  if ('escalate_after_days' in body && !inRange(body.escalate_after_days, 1, 30, true)) {
    errors.escalate_after_days = ['Choose a whole number from 1 to 30.'];
  }
  if ('digest_enabled' in body && typeof body.digest_enabled !== 'boolean') errors.digest_enabled = ['Choose on or off.'];
  if ('digest_hour' in body && !inRange(body.digest_hour, 0, 23, true)) errors.digest_hour = ['Choose a whole number from 0 to 23.'];
```

In `saveSettings`, add after the `dismiss_cooldown_days` line:

```ts
    if (typeof asked.timezone === 'string') settings.timezone = asked.timezone;
    if (isWeekdays(asked.working_days)) settings.working_days = [...new Set(asked.working_days)].sort((a, b) => a - b);
    if (typeof asked.escalate_after_days === 'number') settings.escalate_after_days = asked.escalate_after_days;
    if (typeof asked.digest_enabled === 'boolean') settings.digest_enabled = asked.digest_enabled;
    if (typeof asked.digest_hour === 'number') settings.digest_hour = asked.digest_hour;
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/features/work --maxWorkers=2 && npm run build`
Expected: PASS, and the build succeeds (every object typed `WorkSettings` in the repo now needs the new fields; `WORK_SETTINGS` is the only literal; fix any spread such as `{ ...WORK_SETTINGS, can_edit: false }` needs nothing).

- [ ] **Step 7: Commit**

```bash
git add src/features/work/workTypes.ts src/features/work/workApi.ts src/features/work/workApi.test.ts src/features/work/testWorkFixtures.ts src/features/work/testWork.ts src/features/work/testWork.test.ts src/features/auth/authSlice.ts
git commit -m "feat(work): delivery 3 settings fields in the types, refusals and stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The tracking settings rules (`workTracking.ts`)

**Files:**
- Create: `src/features/work/workTracking.ts`
- Test: `src/features/work/workTracking.test.ts`

**Interfaces:**
- Consumes: `WorkSettings`, `WorkSettingsPatch` (Task 1); `Refusal`, `RefusalField` (`workApi.ts`).
- Produces: `TRACK` (copy), `WEEKDAYS: readonly { value: number; label: string }[]`, `ESCALATE_SPEC`, `timezoneOptions(stored: string): string[]`, `hourLabel(hour: number): string`, `HOURS: readonly number[]`, `weekdayNames(days: readonly number[]): string`, `TasksDraft`, `tasksDraftOf`, `validateTasks(draft): Refusal`, `tasksPatchOf(saved, draft): WorkSettingsPatch`, `NoticesDraft`, `noticesDraftOf`, `noticesPatchOf(saved, draft): WorkSettingsPatch`.

- [ ] **Step 1: Write the failing test**

Create `src/features/work/workTracking.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORK_SETTINGS } from './testWorkFixtures';
import {
  HOURS,
  hourLabel,
  noticesDraftOf,
  noticesPatchOf,
  tasksDraftOf,
  tasksPatchOf,
  timezoneOptions,
  validateTasks,
  weekdayNames,
} from './workTracking';

afterEach(() => vi.restoreAllMocks());

describe('timezoneOptions (Decision 3)', () => {
  it('lists UTC first, then every runtime zone alphabetically, once each', () => {
    const options = timezoneOptions('UTC');
    expect(options[0]).toBe('UTC');
    expect(options).toContain('Asia/Kolkata');
    expect(new Set(options).size).toBe(options.length);
    const rest = options.slice(1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it('keeps a stored zone the runtime does not list', () => {
    expect(timezoneOptions('Etc/GMT+5')).toContain('Etc/GMT+5');
  });

  it('falls back to UTC and the stored zone when the runtime cannot list zones', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new RangeError('no');
    });
    expect(timezoneOptions('Asia/Kolkata')).toEqual(['UTC', 'Asia/Kolkata']);
    expect(timezoneOptions('UTC')).toEqual(['UTC']);
  });
});

describe('hours and weekdays', () => {
  it('labels the 24 hours as 00:00 to 23:00', () => {
    expect(HOURS).toHaveLength(24);
    expect(hourLabel(0)).toBe('00:00');
    expect(hourLabel(8)).toBe('08:00');
    expect(hourLabel(23)).toBe('23:00');
  });

  it('names working days in week order', () => {
    expect(weekdayNames([4, 0, 2])).toBe('Monday, Wednesday, Friday');
    expect(weekdayNames([5, 6])).toBe('Saturday, Sunday');
  });
});

describe('Tasks draft (Decisions 2, 5)', () => {
  it('starts from the saved settings and sends nothing while unchanged', () => {
    const draft = tasksDraftOf(WORK_SETTINGS);
    expect(draft).toEqual({ escalate: '2', timezone: 'UTC', working_days: [0, 1, 2, 3, 4] });
    expect(tasksPatchOf(WORK_SETTINGS, draft)).toEqual({});
  });

  it('sends only what changed, working days sorted', () => {
    expect(tasksPatchOf(WORK_SETTINGS, { escalate: '5', timezone: 'Asia/Kolkata', working_days: [6, 0] })).toEqual({
      escalate_after_days: 5,
      timezone: 'Asia/Kolkata',
      working_days: [0, 6],
    });
    expect(tasksPatchOf(WORK_SETTINGS, { escalate: '2', timezone: 'UTC', working_days: [4, 3, 2, 1, 0] })).toEqual({});
  });

  it('refuses in the contract’s words: escalation 1 to 30, at least one day', () => {
    expect(validateTasks({ escalate: '31', timezone: 'UTC', working_days: [] })).toEqual({
      field: { escalate_after_days: 'Choose a whole number from 1 to 30.', working_days: 'Choose at least one working day.' },
      form: null,
    });
    expect(validateTasks({ escalate: '2.5', timezone: 'UTC', working_days: [0] }).field.escalate_after_days).toBe('Choose a whole number from 1 to 30.');
    expect(validateTasks({ escalate: '', timezone: 'UTC', working_days: [0] }).field.escalate_after_days).toBe('Choose a whole number from 1 to 30.');
    expect(validateTasks({ escalate: ' 30 ', timezone: 'UTC', working_days: [0] })).toEqual({ field: {}, form: null });
  });
});

describe('Notifications draft (Decisions 4, 5)', () => {
  it('sends only what changed', () => {
    const draft = noticesDraftOf(WORK_SETTINGS);
    expect(draft).toEqual({ digest_enabled: true, digest_hour: 8 });
    expect(noticesPatchOf(WORK_SETTINGS, draft)).toEqual({});
    expect(noticesPatchOf(WORK_SETTINGS, { digest_enabled: false, digest_hour: 8 })).toEqual({ digest_enabled: false });
    expect(noticesPatchOf(WORK_SETTINGS, { digest_enabled: true, digest_hour: 0 })).toEqual({ digest_hour: 0 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/features/work/workTracking.test.ts --maxWorkers=2`
Expected: FAIL with "Failed to resolve import ./workTracking".

- [ ] **Step 3: Write the module**

Create `src/features/work/workTracking.ts`:

```ts
// Settings › Work › Tasks and › Notifications (spec §3.3; delivery 3
// Decisions 2 to 6): the pages' words, the weekdays, the timezone and hour
// choices, each page's draft, its checks in the contract's own words, and
// the PATCH it sends (only what changed). Kept free of React. No em dash.
import type { Refusal } from './workApi';
import type { WorkSettings, WorkSettingsPatch } from './workTypes';

export const TRACK = {
  TASKS_TITLE: 'Tasks',
  TASKS_INTRO: 'When Revenact reminds people about overdue tasks, and when it tells their manager.',
  NOTICES_TITLE: 'Notifications',
  NOTICES_INTRO: "The daily email that sums up each person's work.",
  ESCALATE: 'Tell the manager after (working days overdue)',
  ESCALATE_DETAIL:
    'Revenact reminds the assignee once a day while a task is overdue, and tells their manager once it has been overdue this many working days.',
  TIMEZONE: 'Timezone',
  TIMEZONE_DETAIL: 'Today, overdue and the digest hour follow this timezone.',
  WORKING_DAYS: 'Working days',
  WORKING_DAYS_DETAIL: 'Reminders and digests go out on these days, and only these count toward telling a manager.',
  DIGEST: 'Daily digest',
  DIGEST_DETAIL: 'One email a day to each person with something overdue, due today, blocked or waiting for them to decide.',
  DIGEST_HOUR: 'Send after',
  NO_EMAIL: "Email isn't set up on this server yet: digests are skipped",
  NO_DAYS: 'Choose at least one working day.',
  LOAD: 'Could not load these settings.',
  LOADING: 'Loading these settings',
  SAVE_FAILED: 'Could not save these settings.',
} as const;

export const hourNote = (timezone: string): string => `Local time in ${timezone}, set under Tasks.`;

export const WEEKDAYS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

export const ESCALATE_SPEC = { min: 1, max: 30 } as const;
const ESCALATE_MESSAGE = `Choose a whole number from ${ESCALATE_SPEC.min} to ${ESCALATE_SPEC.max}.`;

export const HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);

export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

export function weekdayNames(days: readonly number[]): string {
  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(', ');
}

/** Decision 3: UTC first, then the runtime's zones alphabetically, plus the
 *  stored one if the runtime lacks it; just UTC and the stored one where the
 *  runtime cannot list zones. The server is the judge of a name. */
export function timezoneOptions(stored: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  const rest = [...new Set([...zones, stored])].filter((zone) => zone !== 'UTC').sort((a, b) => a.localeCompare(b));
  return zones.length === 0 ? [...new Set(['UTC', stored])] : ['UTC', ...rest];
}

const sorted = (days: readonly number[]): number[] => [...new Set(days)].sort((a, b) => a - b);
const sameDays = (a: readonly number[], b: readonly number[]): boolean => sorted(a).join() === sorted(b).join();

export interface TasksDraft {
  escalate: string;
  timezone: string;
  working_days: number[];
}

export const tasksDraftOf = (settings: WorkSettings): TasksDraft => ({
  escalate: String(settings.escalate_after_days),
  timezone: settings.timezone,
  working_days: sorted(settings.working_days),
});

function parseEscalate(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= ESCALATE_SPEC.min && value <= ESCALATE_SPEC.max ? value : null;
}

/** The browser's checks, in the contract's words, as a `Refusal` so the
 *  form shows them where it shows the server's. */
export function validateTasks(draft: TasksDraft): Refusal {
  const field: Refusal['field'] = {};
  if (parseEscalate(draft.escalate) === null) field.escalate_after_days = ESCALATE_MESSAGE;
  if (draft.working_days.length === 0) field.working_days = TRACK.NO_DAYS;
  return { field, form: null };
}

/** Only what changed (Decision 5); run it on a draft that passed `validateTasks`. */
export function tasksPatchOf(saved: WorkSettings, draft: TasksDraft): WorkSettingsPatch {
  const patch: WorkSettingsPatch = {};
  const escalate = Number(draft.escalate.trim());
  if (escalate !== saved.escalate_after_days) patch.escalate_after_days = escalate;
  if (draft.timezone !== saved.timezone) patch.timezone = draft.timezone;
  if (!sameDays(draft.working_days, saved.working_days)) patch.working_days = sorted(draft.working_days);
  return patch;
}

export interface NoticesDraft {
  digest_enabled: boolean;
  digest_hour: number;
}

export const noticesDraftOf = (settings: WorkSettings): NoticesDraft => ({
  digest_enabled: settings.digest_enabled,
  digest_hour: settings.digest_hour,
});

export function noticesPatchOf(saved: WorkSettings, draft: NoticesDraft): WorkSettingsPatch {
  const patch: WorkSettingsPatch = {};
  if (draft.digest_enabled !== saved.digest_enabled) patch.digest_enabled = draft.digest_enabled;
  if (draft.digest_hour !== saved.digest_hour) patch.digest_hour = draft.digest_hour;
  return patch;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/features/work/workTracking.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/workTracking.ts src/features/work/workTracking.test.ts
git commit -m "feat(work): the Tasks and Notifications settings rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The trail says who Revenact reminded or told

**Files:**
- Modify: `src/features/work/workText.ts` (the `nudged` and `escalated` cases of `eventSentence`, near line 217)
- Test: `src/features/work/workText.test.ts` (the two `nudged`/`escalated` lines near 125)

**Interfaces:**
- Consumes: the contract's event data: `nudged` `{days_overdue: number, to: {id, name}}`, `escalated` `{working_days_overdue: number, to: {id, name}}`; the module's own `ref`, `whom`.
- Produces: the sentences of Decision 9.

- [ ] **Step 1: Write the failing test**

In `src/features/work/workText.test.ts`, replace the two lines

```ts
    expect(eventSentence(event('nudged', {}, null), ME)).toBe('Revenact sent a reminder.');
    expect(eventSentence(event('escalated', {}, null), ME)).toBe('Revenact told a manager it is overdue.');
```

with:

```ts
    // Delivery 3 (contract 2026-10-08-work-tracking-api.md): who was told, and how late.
    const carl = { id: 3, name: 'Carl CSM' };
    const mona = { id: 2, name: 'Mona Manager' };
    expect(eventSentence(event('nudged', { days_overdue: 2, to: carl }, null), ME)).toBe('Revenact reminded Carl CSM: 2 days overdue.');
    expect(eventSentence(event('nudged', { days_overdue: 1, to: you }, null), ME)).toBe('Revenact reminded you: 1 day overdue.');
    expect(eventSentence(event('escalated', { working_days_overdue: 2, to: mona }, null), ME)).toBe(
      'Revenact told Mona Manager: 2 working days overdue.',
    );
    expect(eventSentence(event('escalated', { working_days_overdue: 1, to: you }, null), ME)).toBe('Revenact told you: 1 working day overdue.');
    // An event without the data keeps delivery 1's words.
    expect(eventSentence(event('nudged', {}, null), ME)).toBe('Revenact sent a reminder.');
    expect(eventSentence(event('escalated', {}, null), ME)).toBe('Revenact told a manager it is overdue.');
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/features/work/workText.test.ts --maxWorkers=2`
Expected: FAIL: "expected 'Revenact sent a reminder.' to be 'Revenact reminded Carl CSM: 2 days overdue.'".

- [ ] **Step 3: Implement**

In `src/features/work/workText.ts`, add above `export function eventSentence`:

```ts
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);
const late = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'} overdue`;
```

and replace the two cases:

```ts
    case 'nudged': {
      const to = ref(data.to);
      const days = count(data.days_overdue);
      return to && days !== null ? `Revenact reminded ${whom(to, me)}: ${late(days, 'day')}.` : 'Revenact sent a reminder.';
    }
    case 'escalated': {
      const to = ref(data.to);
      const days = count(data.working_days_overdue);
      return to && days !== null ? `Revenact told ${whom(to, me)}: ${late(days, 'working day')}.` : 'Revenact told a manager it is overdue.';
    }
```

(`count` must not clash with an existing name in the file; run `grep -n "const count\|function count\|const late" src/features/work/workText.ts` first, and if either exists, name these `wholeCount` and `overdueBy`.)

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/features/work/workText.test.ts src/components/work/ActivityTrail.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/work/workText.ts src/features/work/workText.test.ts
git commit -m "feat(work): the trail says who Revenact reminded or told, and how late

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The settings frame and Settings › Work › Tasks

**Files:**
- Create: `src/pages/settings/WorkSettingsFrame.tsx`
- Create: `src/components/work/WorkTasksForm.tsx`
- Create: `src/components/work/WorkTasksSummary.tsx`
- Create: `src/pages/settings/WorkTasksPage.tsx`
- Test: `src/pages/settings/WorkTasksPage.test.tsx`

**Interfaces:**
- Consumes: `fetchWorkSettings`, `patchWorkSettings`, `readRefusal`, `NO_REFUSAL`, `Refusal` (`workApi.ts`); `SET.READ_ONLY`, `SET.SAVE`, `SET.SAVING`, `SET.SAVED` (`workSettings.ts`); `TRACK`, `WEEKDAYS`, `tasksDraftOf`, `tasksPatchOf`, `timezoneOptions`, `validateTasks`, `weekdayNames`, `TasksDraft` (Task 2); `stubWork`, `sent`, `WORK_SETTINGS`, `renderPage`, `resetViewport`.
- Produces: `WorkSettingsFrame({ title, intro, children })` where `children: (settings: WorkSettings, onSaved: (next: WorkSettings) => void) => ReactNode`; `WorkTasksForm({ settings, onSaved })`; `WorkTasksSummary({ settings })`; `WorkTasksPage()`. Task 5 reuses the frame.

- [ ] **Step 1: Write the failing test**

Create `src/pages/settings/WorkTasksPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { sent, stubWork } from '../../features/work/testWork';
import { WORK_SETTINGS } from '../../features/work/testWorkFixtures';
import { resetViewport } from '../../test/viewport';
import { renderPage } from '../work/testPages';
import { WorkTasksPage } from './WorkTasksPage';

const URL = '/settings/work-tasks';
const ESCALATE = 'Tell the manager after (working days overdue)';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function retype(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

describe('Settings › Work › Tasks (spec §3.3; delivery 3 Decisions 2, 3, 5, 6)', () => {
  it('shows an admin the form, filled from the saved settings, with Save off until something changes', async () => {
    stubWork();
    renderPage(<WorkTasksPage />, URL);
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument();
    expect(await screen.findByLabelText(ESCALATE)).toHaveValue('2');
    expect(screen.getByLabelText('Timezone')).toHaveValue('UTC');
    expect(screen.getByRole('option', { name: 'Asia/Kolkata' })).toBeInTheDocument();
    DAYS.forEach((day, index) => {
      const box = screen.getByRole('checkbox', { name: day });
      if (index < 5) expect(box).toBeChecked();
      else expect(box).not.toBeChecked();
    });
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('sends only what changed, working days sorted, then says Saved.', async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await retype(ESCALATE, '5');
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'Asia/Kolkata');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ escalate_after_days: 5, timezone: 'Asia/Kolkata', working_days: [1, 2, 3, 4, 5] }]);
    expect(settings.timezone).toBe('Asia/Kolkata');
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveFocus();
  });

  it('refuses in place, in the contract’s words, sending nothing', async () => {
    const { spy } = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await retype(ESCALATE, '31');
    for (const day of DAYS.slice(0, 5)) await userEvent.click(screen.getByRole('checkbox', { name: day }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Choose a whole number from 1 to 30.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one working day.')).toBeInTheDocument();
    expect(screen.getByLabelText(ESCALATE)).toHaveAttribute('aria-invalid', 'true');
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([]);
  });

  it('puts the server’s timezone refusal under the select', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { timezone: ['Choose a timezone from the list.'] } } });
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'Asia/Kolkata');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Choose a timezone from the list.')).toBeInTheDocument();
    expect(screen.getByLabelText('Timezone')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a member the settings as text: no controls', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    renderPage(<WorkTasksPage />, URL, { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(document.querySelector('[data-setting="escalate"]')).toHaveTextContent(`${ESCALATE}: 2`);
    expect(document.querySelector('[data-setting="timezone"]')).toHaveTextContent('Timezone: UTC');
    expect(document.querySelector('[data-setting="working_days"]')).toHaveTextContent('Working days: Monday, Tuesday, Wednesday, Thursday, Friday');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('shows a skeleton, then the error with Try again', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkTasksPage />, URL);
    expect(screen.getByRole('status', { name: 'Loading these settings' })).toHaveTextContent('Loading…');
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText(ESCALATE)).toBeInTheDocument();
  });

  it('works at phone width: every control keeps a 44px target', async () => {
    stubWork();
    renderPage(<WorkTasksPage />, URL, { width: 390 });
    expect(await screen.findByLabelText(ESCALATE)).toHaveClass('min-h-11');
    expect(screen.getByLabelText('Timezone')).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveClass('min-h-11');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/settings/WorkTasksPage.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import ./WorkTasksPage".

- [ ] **Step 3: The frame**

Create `src/pages/settings/WorkSettingsFrame.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { fetchWorkSettings } from '../../features/work/workApi';
import { TRACK } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';

/** A Settings › Work page (delivery 3 Decision 7): the settings frame's
 *  20px h1 and its intro, GET /work/settings/ with a skeleton and Try
 *  again, then the page's own body, which may replace the settings after a
 *  save. */
export function WorkSettingsFrame({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: (settings: WorkSettings, onSaved: (next: WorkSettings) => void) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<WorkSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchWorkSettings().then(
      (data) => {
        if (!alive) return;
        setSettings(data);
        setError(null);
      },
      (err: unknown) => {
        if (alive) setError(errorMessage(err, TRACK.LOAD));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  let body: ReactNode;
  if (!settings && error) body = <ErrorBlock message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (!settings)
    body = (
      <div role="status" aria-busy="true" aria-label={TRACK.LOADING} className="flex flex-col gap-3">
        <span className="sr-only">Loading…</span>
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-16 animate-pulse rounded-xl bg-subtle" />
        ))}
      </div>
    );
  else body = children(settings, setSettings);

  return (
    <div className="flex h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <div>
        <h1 className="text-[20px] font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-0.5 text-[13px] font-medium text-ink-faint">{intro}</p>
      </div>
      {body}
    </div>
  );
}
```

- [ ] **Step 4: The form**

Create `src/components/work/WorkTasksForm.tsx`:

```tsx
import { useId, useMemo, useState, type FormEvent } from 'react';
import { NO_REFUSAL, patchWorkSettings, readRefusal, type Refusal } from '../../features/work/workApi';
import { SET } from '../../features/work/workSettings';
import { TRACK, WEEKDAYS, tasksDraftOf, tasksPatchOf, timezoneOptions, validateTasks, type TasksDraft } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';
import { CONTROL, FORM_ERROR } from '../organizations/activity/formStyles';
import { FOCUS, PRIMARY } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';

// CONTROL is min-h-11 below sm (formStyles.ts); INPUT is a name the house
// rules know, SELECT repeats min-h-11 so the checker sees it.
const INPUT = `${CONTROL} sm:w-28`;
const SELECT = `min-h-11 ${CONTROL} sm:w-72`;
const CHOICE = 'flex min-h-11 items-center gap-2 text-[13px] font-semibold text-ink sm:min-h-9';
const BOX = `h-4 w-4 shrink-0 accent-accent ${FOCUS}`;
const LABEL = 'text-[11px] font-semibold text-ink-muted';
const NOTE = 'text-[11px] text-ink-muted';
const ERROR = 'text-[11px] text-danger';

/** Settings › Work › Tasks for an admin (delivery 3 Decisions 2, 3, 5):
 *  when the manager is told, the workspace timezone and its working days.
 *  Save sends only what changed, after the browser's own checks. */
export function WorkTasksForm({ settings, onSaved }: { settings: WorkSettings; onSaved: (next: WorkSettings) => void }) {
  const ids = useId();
  const [draft, setDraft] = useState<TasksDraft>(() => tasksDraftOf(settings));
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const [status, setStatus] = useState('');
  const saving = useSubmitOnce();
  const zones = useMemo(() => timezoneOptions(settings.timezone), [settings.timezone]);
  const dirty = Object.keys(tasksPatchOf(settings, draft)).length > 0;
  const failed = refusal.field;

  const toggleDay = (day: number) =>
    setDraft((current) => ({
      ...current,
      working_days: current.working_days.includes(day) ? current.working_days.filter((d) => d !== day) : [...current.working_days, day],
    }));

  async function save(event: FormEvent) {
    event.preventDefault();
    // A no-op while nothing changed: Save is aria-disabled, not disabled.
    if (!dirty) return;
    setStatus('');
    const local = validateTasks(draft);
    if (Object.keys(local.field).length > 0) {
      setRefusal(local);
      return;
    }
    setRefusal(NO_REFUSAL);
    const outcome = await saving.run(() => patchWorkSettings(tasksPatchOf(settings, draft)));
    if (!outcome) return;
    if (outcome.ok) {
      setDraft(tasksDraftOf(outcome.value));
      onSaved(outcome.value);
      setStatus(SET.SAVED);
    } else {
      setRefusal(readRefusal(outcome.error, TRACK.SAVE_FAILED));
    }
  }

  const escalateId = `${ids}-escalate`;
  const zoneId = `${ids}-zone`;
  return (
    <form onSubmit={(event) => void save(event)} noValidate aria-label={TRACK.TASKS_TITLE} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor={escalateId} className={LABEL}>
          {TRACK.ESCALATE}
        </label>
        <input
          id={escalateId}
          inputMode="numeric"
          value={draft.escalate}
          aria-invalid={Boolean(failed.escalate_after_days)}
          aria-describedby={`${escalateId}-detail`}
          onChange={(event) => setDraft((current) => ({ ...current, escalate: event.target.value }))}
          className={INPUT}
        />
        <p id={`${escalateId}-detail`} className={NOTE}>
          {TRACK.ESCALATE_DETAIL}
        </p>
        {failed.escalate_after_days ? (
          <p role="alert" className={ERROR}>
            {failed.escalate_after_days}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={zoneId} className={LABEL}>
          {TRACK.TIMEZONE}
        </label>
        <select
          id={zoneId}
          value={draft.timezone}
          aria-invalid={Boolean(failed.timezone)}
          aria-describedby={`${zoneId}-detail`}
          onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
          className={SELECT}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <p id={`${zoneId}-detail`} className={NOTE}>
          {TRACK.TIMEZONE_DETAIL}
        </p>
        {failed.timezone ? (
          <p role="alert" className={ERROR}>
            {failed.timezone}
          </p>
        ) : null}
      </div>

      <fieldset className="flex min-w-0 flex-col gap-1" aria-describedby={`${ids}-days-detail`}>
        <legend className={`${LABEL} mb-1`}>{TRACK.WORKING_DAYS}</legend>
        <div className="flex flex-wrap gap-x-4">
          {WEEKDAYS.map((day) => (
            <label key={day.value} className={CHOICE}>
              <input type="checkbox" checked={draft.working_days.includes(day.value)} onChange={() => toggleDay(day.value)} className={BOX} />
              {day.label}
            </label>
          ))}
        </div>
        <p id={`${ids}-days-detail`} className={NOTE}>
          {TRACK.WORKING_DAYS_DETAIL}
        </p>
        {failed.working_days ? (
          <p role="alert" className={ERROR}>
            {failed.working_days}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {/* aria-disabled, never disabled: focus stays here after a save. */}
        <button type="submit" aria-disabled={!dirty || saving.busy || undefined} className={PRIMARY}>
          {saving.busy ? SET.SAVING : SET.SAVE}
        </button>
        <p role="status" className="text-[13px] text-ink-muted">
          {status}
        </p>
      </div>
      {refusal.form ? (
        <p role="alert" className={FORM_ERROR}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 5: The summary and the page**

Create `src/components/work/WorkTasksSummary.tsx`:

```tsx
import { SET } from '../../features/work/workSettings';
import { TRACK, weekdayNames } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';
import { MONO } from '../organizations/portfolio/styles';

const LINE = 'text-[13px] text-ink';

/** Settings › Work › Tasks for a member (delivery 3 Decision 6): the values as text. */
export function WorkTasksSummary({ settings }: { settings: WorkSettings }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-muted">{SET.READ_ONLY}</p>
      <p data-setting="escalate" className={LINE}>
        <span className="font-semibold">{TRACK.ESCALATE}:</span> <span className={MONO}>{settings.escalate_after_days}</span>
      </p>
      <p data-setting="timezone" className={LINE}>
        <span className="font-semibold">{TRACK.TIMEZONE}:</span> {settings.timezone}
      </p>
      <p data-setting="working_days" className={LINE}>
        <span className="font-semibold">{TRACK.WORKING_DAYS}:</span> {weekdayNames(settings.working_days)}
      </p>
    </div>
  );
}
```

Create `src/pages/settings/WorkTasksPage.tsx`:

```tsx
import { WorkTasksForm } from '../../components/work/WorkTasksForm';
import { WorkTasksSummary } from '../../components/work/WorkTasksSummary';
import { TRACK } from '../../features/work/workTracking';
import { WorkSettingsFrame } from './WorkSettingsFrame';

/** Settings › Work › Tasks (spec §3.3): the form for whoever holds
 *  manage_org_settings (`can_edit`), the values as text for everyone else. */
export function WorkTasksPage() {
  return (
    <WorkSettingsFrame title={TRACK.TASKS_TITLE} intro={TRACK.TASKS_INTRO}>
      {(settings, onSaved) => (settings.can_edit ? <WorkTasksForm settings={settings} onSaved={onSaved} /> : <WorkTasksSummary settings={settings} />)}
    </WorkSettingsFrame>
  );
}
```

- [ ] **Step 6: Run it to see it pass**

Run: `npx vitest run src/pages/settings/WorkTasksPage.test.tsx --maxWorkers=2`
Expected: PASS. If "Asia/Kolkata" is missing from the jsdom runtime's `Intl.supportedValuesOf('timeZone')` (it is present in Node 18+), the select has no such option and the two tests that choose it fail at `selectOptions`: check with `node -e "console.log(Intl.supportedValuesOf('timeZone').includes('Asia/Kolkata'))"`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/settings/WorkSettingsFrame.tsx src/components/work/WorkTasksForm.tsx src/components/work/WorkTasksSummary.tsx src/pages/settings/WorkTasksPage.tsx src/pages/settings/WorkTasksPage.test.tsx
git commit -m "feat(settings): Settings › Work › Tasks: escalation, timezone and working days

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Settings › Work › Notifications, with the email line

**Files:**
- Create: `src/components/work/WorkNotificationsForm.tsx`
- Create: `src/components/work/WorkNotificationsSummary.tsx`
- Create: `src/pages/settings/WorkNotificationsPage.tsx`
- Test: `src/pages/settings/WorkNotificationsPage.test.tsx`

**Interfaces:**
- Consumes: `WorkSettingsFrame` (Task 4); `TRACK`, `HOURS`, `hourLabel`, `hourNote`, `noticesDraftOf`, `noticesPatchOf`, `NoticesDraft` (Task 2); `patchWorkSettings`, `readRefusal`, `NO_REFUSAL`, `Refusal`; `SET`.
- Produces: `WorkNotificationsForm({ settings, onSaved })`, `WorkNotificationsSummary({ settings })`, `WorkNotificationsPage()`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/settings/WorkNotificationsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { sent, stubWork } from '../../features/work/testWork';
import { WORK_SETTINGS } from '../../features/work/testWorkFixtures';
import { resetViewport } from '../../test/viewport';
import { renderPage } from '../work/testPages';
import { WorkNotificationsPage } from './WorkNotificationsPage';

const URL = '/settings/work-notifications';
const NO_EMAIL = "Email isn't set up on this server yet: digests are skipped";

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

describe('Settings › Work › Notifications (spec §3.3; delivery 3 Decisions 4 to 6)', () => {
  it('shows an admin the digest switch and hour, in the workspace timezone', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, timezone: 'Asia/Kolkata' } });
    renderPage(<WorkNotificationsPage />, URL);
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'Daily digest' })).toBeChecked();
    const hour = screen.getByLabelText('Send after');
    expect(hour).toHaveValue('8');
    expect(screen.getByRole('option', { name: '08:00' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(24);
    expect(screen.getByText('Local time in Asia/Kolkata, set under Tasks.')).toBeInTheDocument();
    expect(screen.queryByText(NO_EMAIL)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('sends only what changed, then says Saved.', async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkNotificationsPage />, URL);
    await userEvent.click(await screen.findByRole('switch', { name: 'Daily digest' }));
    await userEvent.selectOptions(screen.getByLabelText('Send after'), '00:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ digest_enabled: false, digest_hour: 0 }]);
    expect([settings.digest_enabled, settings.digest_hour]).toEqual([false, 0]);
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('puts the server’s refusal under the hour', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { digest_hour: ['Choose a whole number from 0 to 23.'] } } });
    renderPage(<WorkNotificationsPage />, URL);
    await userEvent.selectOptions(await screen.findByLabelText('Send after'), '09:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Choose a whole number from 0 to 23.')).toBeInTheDocument();
    expect(screen.getByLabelText('Send after')).toHaveAttribute('aria-invalid', 'true');
  });

  it('says digests are skipped when the server cannot send email, to an admin and a member', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, email_ready: false } });
    renderPage(<WorkNotificationsPage />, URL);
    expect(await screen.findByText(NO_EMAIL)).toBeInTheDocument();
    vi.unstubAllGlobals();
    resetViewport();
    document.body.innerHTML = '';
    stubWork({ workSettings: { ...WORK_SETTINGS, email_ready: false, can_edit: false } });
    renderPage(<WorkNotificationsPage />, URL, { role: 'csm' });
    expect(await screen.findByText(NO_EMAIL)).toBeInTheDocument();
  });

  it('shows a member the settings as text: no controls', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    renderPage(<WorkNotificationsPage />, URL, { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(document.querySelector('[data-setting="digest"]')).toHaveTextContent('Daily digest: On');
    expect(document.querySelector('[data-setting="digest_hour"]')).toHaveTextContent('Send after: 08:00');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows a skeleton, then the error with Try again', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkNotificationsPage />, URL);
    expect(screen.getByRole('status', { name: 'Loading these settings' })).toBeInTheDocument();
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('switch', { name: 'Daily digest' })).toBeInTheDocument();
  });

  it('works at phone width: every control keeps a 44px target', async () => {
    stubWork();
    renderPage(<WorkNotificationsPage />, URL, { width: 390 });
    expect(await screen.findByLabelText('Send after')).toHaveClass('min-h-11');
    expect(screen.getByRole('switch', { name: 'Daily digest' }).closest('label')).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveClass('min-h-11');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/settings/WorkNotificationsPage.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import ./WorkNotificationsPage".

- [ ] **Step 3: The form**

Create `src/components/work/WorkNotificationsForm.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react';
import { NO_REFUSAL, patchWorkSettings, readRefusal, type Refusal } from '../../features/work/workApi';
import { SET } from '../../features/work/workSettings';
import { HOURS, TRACK, hourLabel, hourNote, noticesDraftOf, noticesPatchOf, type NoticesDraft } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';
import { CONTROL, FORM_ERROR } from '../organizations/activity/formStyles';
import { FOCUS, PRIMARY } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';

// SELECT repeats min-h-11 so the house rules' checker sees the target.
const SELECT = `min-h-11 ${CONTROL} sm:w-28`;
const CHOICE = 'flex min-h-11 items-center gap-2 text-[13px] font-semibold text-ink sm:min-h-9';
const BOX = `h-4 w-4 shrink-0 accent-accent ${FOCUS}`;
const LABEL = 'text-[11px] font-semibold text-ink-muted';
const NOTE = 'text-[11px] text-ink-muted';
const ERROR = 'text-[11px] text-danger';

/** Settings › Work › Notifications for an admin (delivery 3 Decisions 4,
 *  5): the daily digest on or off, and the local hour it goes out after.
 *  The hour stays usable while the digest is off. */
export function WorkNotificationsForm({ settings, onSaved }: { settings: WorkSettings; onSaved: (next: WorkSettings) => void }) {
  const ids = useId();
  const [draft, setDraft] = useState<NoticesDraft>(() => noticesDraftOf(settings));
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const [status, setStatus] = useState('');
  const saving = useSubmitOnce();
  const dirty = Object.keys(noticesPatchOf(settings, draft)).length > 0;
  const failed = refusal.field;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setStatus('');
    setRefusal(NO_REFUSAL);
    const outcome = await saving.run(() => patchWorkSettings(noticesPatchOf(settings, draft)));
    if (!outcome) return;
    if (outcome.ok) {
      setDraft(noticesDraftOf(outcome.value));
      onSaved(outcome.value);
      setStatus(SET.SAVED);
    } else {
      setRefusal(readRefusal(outcome.error, TRACK.SAVE_FAILED));
    }
  }

  const hourId = `${ids}-hour`;
  return (
    <form onSubmit={(event) => void save(event)} noValidate aria-label={TRACK.NOTICES_TITLE} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label className={CHOICE}>
          <input
            type="checkbox"
            role="switch"
            checked={draft.digest_enabled}
            aria-describedby={`${ids}-digest-detail`}
            onChange={(event) => setDraft((current) => ({ ...current, digest_enabled: event.target.checked }))}
            className={BOX}
          />
          {TRACK.DIGEST}
        </label>
        <p id={`${ids}-digest-detail`} className={NOTE}>
          {TRACK.DIGEST_DETAIL}
        </p>
        {failed.digest_enabled ? (
          <p role="alert" className={ERROR}>
            {failed.digest_enabled}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={hourId} className={LABEL}>
          {TRACK.DIGEST_HOUR}
        </label>
        <select
          id={hourId}
          value={String(draft.digest_hour)}
          aria-invalid={Boolean(failed.digest_hour)}
          aria-describedby={`${hourId}-detail`}
          onChange={(event) => setDraft((current) => ({ ...current, digest_hour: Number(event.target.value) }))}
          className={SELECT}
        >
          {HOURS.map((hour) => (
            <option key={hour} value={String(hour)}>
              {hourLabel(hour)}
            </option>
          ))}
        </select>
        <p id={`${hourId}-detail`} className={NOTE}>
          {hourNote(settings.timezone)}
        </p>
        {failed.digest_hour ? (
          <p role="alert" className={ERROR}>
            {failed.digest_hour}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* aria-disabled, never disabled: focus stays here after a save. */}
        <button type="submit" aria-disabled={!dirty || saving.busy || undefined} className={PRIMARY}>
          {saving.busy ? SET.SAVING : SET.SAVE}
        </button>
        <p role="status" className="text-[13px] text-ink-muted">
          {status}
        </p>
      </div>
      {refusal.form ? (
        <p role="alert" className={FORM_ERROR}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 4: The summary and the page**

Create `src/components/work/WorkNotificationsSummary.tsx`:

```tsx
import { SET } from '../../features/work/workSettings';
import { TRACK, hourLabel } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';
import { MONO } from '../organizations/portfolio/styles';

const LINE = 'text-[13px] text-ink';

/** Settings › Work › Notifications for a member (delivery 3 Decision 6). */
export function WorkNotificationsSummary({ settings }: { settings: WorkSettings }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-muted">{SET.READ_ONLY}</p>
      <p data-setting="digest" className={LINE}>
        <span className="font-semibold">{TRACK.DIGEST}:</span> {settings.digest_enabled ? SET.ON : SET.OFF}
      </p>
      <p data-setting="digest_hour" className={LINE}>
        <span className="font-semibold">{TRACK.DIGEST_HOUR}:</span> <span className={MONO}>{hourLabel(settings.digest_hour)}</span>
      </p>
    </div>
  );
}
```

Create `src/pages/settings/WorkNotificationsPage.tsx`:

```tsx
import { WorkNotificationsForm } from '../../components/work/WorkNotificationsForm';
import { WorkNotificationsSummary } from '../../components/work/WorkNotificationsSummary';
import { TRACK } from '../../features/work/workTracking';
import { WorkSettingsFrame } from './WorkSettingsFrame';

/** Settings › Work › Notifications (spec §3.3; Decision 4): the email line
 *  for everyone when the server cannot send, then the form or the text. */
export function WorkNotificationsPage() {
  return (
    <WorkSettingsFrame title={TRACK.NOTICES_TITLE} intro={TRACK.NOTICES_INTRO}>
      {(settings, onSaved) => (
        <div className="flex flex-col gap-6">
          {settings.email_ready ? null : <p className="text-[13px] font-semibold text-warning">{TRACK.NO_EMAIL}</p>}
          {settings.can_edit ? <WorkNotificationsForm settings={settings} onSaved={onSaved} /> : <WorkNotificationsSummary settings={settings} />}
        </div>
      )}
    </WorkSettingsFrame>
  );
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run src/pages/settings/WorkNotificationsPage.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/WorkNotificationsForm.tsx src/components/work/WorkNotificationsSummary.tsx src/pages/settings/WorkNotificationsPage.tsx src/pages/settings/WorkNotificationsPage.test.tsx
git commit -m "feat(settings): Settings › Work › Notifications: the daily digest and the email line

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The Work group: Tasks, Notifications, and Briefs moved in

**Files:**
- Modify: `src/pages/settings/workspaceSettingsNav.ts` (imports, the Work and AI groups, the doc comment)
- Modify: `src/pages/settings/routes.tsx` (imports, the Work routes)
- Test: `src/pages/settings/workspaceSettingsNav.test.ts`

**Interfaces:**
- Consumes: `WorkTasksPage` (Task 4), `WorkNotificationsPage` (Task 5).
- Produces: the nav of Decision 1. `routes.test.tsx` already opens every nav path for an admin, so it covers the two new routes with no edit.

- [ ] **Step 1: Write the failing test**

In `src/pages/settings/workspaceSettingsNav.test.ts`, replace the `Work` and `AI` rows of the first test's expected array:

```ts
      ['Work', ['Recommendations /settings/recommendations', 'Tasks /settings/work-tasks', 'Notifications /settings/work-notifications', 'Briefs /settings/brief-delivery']],
      ['AI', ['AI agent /settings/ai-agent', 'AI attributes /settings/ai-attributes', 'AI skills /settings/ai-skills', 'AI usage /settings/ai-usage', 'AI feedback /settings/ai-feedback']],
```

and in `'shows a member only the items their routes let them into'`, add after `expect(labels).toContain('Recommendations');`:

```ts
    expect(labels).toContain('Tasks');
    expect(labels).toContain('Notifications');
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/settings/workspaceSettingsNav.test.ts src/pages/settings/routes.test.tsx --maxWorkers=2`
Expected: FAIL in the nav test (the Work group lists one item).

- [ ] **Step 3: The nav**

In `src/pages/settings/workspaceSettingsNav.ts`, replace the `lucide-react` import with:

```ts
import {
  BellRing,
  Bot,
  Building2,
  CreditCard,
  Database,
  Gauge,
  KeyRound,
  Lightbulb,
  ListTodo,
  MessageSquareText,
  Newspaper,
  Package,
  Plug,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  WandSparkles,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
```

Replace the doc comment above `WORKSPACE_SETTINGS_NAV` with:

```ts
/** Settings' grouped navigation (settings spec 2026-10-06 §1; Work spec
 *  §2.4 and §3.3 add Work, with Briefs moved in from AI, its URL kept).
 *  Agents arrives with its feature in a later round; nothing is drawn for
 *  it until then. */
```

Replace the Work group:

```ts
  {
    label: 'Work',
    items: [
      { label: 'Recommendations', path: '/settings/recommendations', icon: Lightbulb },
      { label: 'Tasks', path: '/settings/work-tasks', icon: ListTodo },
      { label: 'Notifications', path: '/settings/work-notifications', icon: BellRing },
      { label: 'Briefs', path: '/settings/brief-delivery', icon: Newspaper },
    ],
  },
```

and delete the line `{ label: 'Briefs', path: '/settings/brief-delivery', icon: Newspaper },` from the AI group.

- [ ] **Step 4: The routes**

In `src/pages/settings/routes.tsx`, add imports after `import { WorkRecommendationsPage } from './WorkRecommendationsPage';`:

```tsx
import { WorkTasksPage } from './WorkTasksPage';
import { WorkNotificationsPage } from './WorkNotificationsPage';
```

Replace the Work routes block:

```tsx
        {/* Work (Work spec §2.4, §3.3): every member opens it; can_edit decides the form. Briefs keeps its URL. */}
        <Route path="recommendations" element={el(<WorkRecommendationsPage />)} />
        <Route path="work-tasks" element={el(<WorkTasksPage />)} />
        <Route path="work-notifications" element={el(<WorkNotificationsPage />)} />
        <Route path="brief-delivery" element={el(<BriefDeliveryPage />)} />
```

and delete the later `<Route path="brief-delivery" element={el(<BriefDeliveryPage />)} />` line from the AI block.

- [ ] **Step 5: Run the settings tests**

Run: `npx vitest run src/pages/settings src/layouts --maxWorkers=2`
Expected: PASS (`routes.test.tsx` opens `/settings/work-tasks` and `/settings/work-notifications` for an admin; any layout test that counts AI items or names Briefs' group must be updated to the new groups, by the same replacement as Step 1).

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/workspaceSettingsNav.ts src/pages/settings/workspaceSettingsNav.test.ts src/pages/settings/routes.tsx
git commit -m "feat(settings): Work group gains Tasks and Notifications; Briefs moves into Work

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add any layout test you changed in Step 5 to the `git add` line by its explicit path.)

---

### Task 7: The bell's `task_overdue` and `task_escalated`

**Files:**
- Modify: `src/features/notifications/types.ts` (`NotificationKind`)
- Modify: `src/components/layout/NotificationKindIcon.tsx`
- Test: `src/components/layout/NotificationKindIcon.test.tsx`, `src/components/layout/Navbar.test.tsx`

**Interfaces:**
- Consumes: the contract's two kinds and their `/work/today?task=<id>` links; the Navbar's existing `handleNotificationClick`.
- Produces: Decision 8.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('NotificationKindIcon', ...)`:

```tsx
  it('gives task_overdue the alarm clock and task_escalated the warning (Work spec §3.3; delivery 3 Decision 8)', () => {
    for (const kind of ['task_overdue', 'task_escalated'] as const) {
      const { container } = render(<NotificationKindIcon kind={kind} />);
      expect(container.querySelector(`[data-kind-icon="${kind}"]`)).toHaveAttribute('aria-hidden', 'true');
    }
  });
```

In `src/components/layout/Navbar.test.tsx`, add after the `recsWaiting` constant:

```tsx
// Work spec §3.2: an overdue nudge and an escalation, each opening the task panel.
const taskOverdue: Notification = {
  ...planStarted,
  id: 10,
  kind: 'task_overdue',
  message: '“Call Pizza Hut” on Pizza Hut is 2 days overdue.',
  link: '/work/today?task=41',
  actor: null,
};
const taskEscalated: Notification = {
  ...planStarted,
  id: 11,
  kind: 'task_escalated',
  message: '“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days overdue.',
  link: '/work/today?task=41',
  actor: null,
};
```

and, inside `describe('Navbar notification bell', ...)` after the `recommendations_waiting` test:

```tsx
  it.each([
    [taskOverdue, 10],
    [taskEscalated, 11],
  ])('opens the task panel from %s, with its icon, like a task_assigned', async (notification, id) => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [notification]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector(`[data-kind-icon="${notification.kind}"]`)).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText(notification.message));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(id);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/work/today?task=41 (opened-here)');
  });
```

(`it.each` names the case with `%s` of an object; if the runner prints `[object Object]`, change the title to `'opens the task panel from a %s notification'` and the rows to `['task_overdue', taskOverdue, 10]` / `['task_escalated', taskEscalated, 11]` with the callback `(_kind, notification, id)`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/layout/NotificationKindIcon.test.tsx src/components/layout/Navbar.test.tsx --maxWorkers=2`
Expected: FAIL (TypeScript: `'task_overdue'` is not a `NotificationKind`; no icon).

- [ ] **Step 3: Implement**

In `src/features/notifications/types.ts`, add to the `NotificationKind` union after `'recommendations_waiting'`:

```ts
  // Work spec §3.2: an assignee's daily nudge about an overdue task, and
  // the once-only notice to their manager (or the workspace owner); both
  // link to /work/today?task=<id>.
  | 'task_overdue'
  | 'task_escalated'
```

Replace `src/components/layout/NotificationKindIcon.tsx`:

```tsx
import { AlarmClock, ClipboardList, Lightbulb, ListChecks, Megaphone, SquareCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { NotificationKind } from '../../features/notifications/types';

/** The kinds that carry an icon in the bell (plans spec §2.5, campaigns spec
 *  §2.5, Work spec §1.3, §2.2 and §3.2). */
const ICONS: Partial<Record<NotificationKind, LucideIcon>> = {
  plan_started: ClipboardList,
  plan_task_assigned: ListChecks,
  campaign_sent: Megaphone,
  task_assigned: SquareCheck,
  recommendations_waiting: Lightbulb,
  task_overdue: AlarmClock,
  task_escalated: TriangleAlert,
};

/** A notification kind's icon, beside its words; nothing for the others. */
export function NotificationKindIcon({ kind }: { kind: NotificationKind }) {
  const Icon = ICONS[kind];
  return Icon ? <Icon data-kind-icon={kind} className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" /> : null;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/layout/NotificationKindIcon.test.tsx src/components/layout/Navbar.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/notifications/types.ts src/components/layout/NotificationKindIcon.tsx src/components/layout/NotificationKindIcon.test.tsx src/components/layout/Navbar.test.tsx
git commit -m "feat(notifications): the bell's task_overdue and task_escalated open the task panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: House rules over the new files, the product docs, and the full check

**Files:**
- Modify: `src/components/work/houseRules.test.ts`
- Modify: `docs/03-ui-ux-design.md` (after the "Settings › Work › Recommendations" bullet near line 1506; the bell line near 1480)
- Modify: `docs/04-app-flow.md` (the route table row near line 90; "4.5f Brief delivery" near line 631; the settings nav list near lines 1205-1215)

**Interfaces:**
- Consumes: every file above.
- Produces: no new code; the house rules cover the four new components and the three new settings files; the two frontend product docs describe delivery 3.

- [ ] **Step 1: Widen the house rules**

In `src/components/work/houseRules.test.ts`:

Replace the `settingsPage` line:

```ts
const settingsPage = raw(
  import.meta.glob(
    [
      '../../pages/settings/WorkRecommendationsPage.tsx',
      '../../pages/settings/WorkTasksPage.tsx',
      '../../pages/settings/WorkNotificationsPage.tsx',
      '../../pages/settings/WorkSettingsFrame.tsx',
    ],
    { query: '?raw', eager: true, import: 'default' },
  ),
);
```

Replace the comment above it (`// The house rules (revenact-design §4) ... Settings › Work › Recommendations.`) with:

```ts
// The house rules (revenact-design §4) over every Work component, the Work
// pages and the Work bar; and, for tokens, targets and copy only (they keep
// the settings frame's own 20px h1), the Settings › Work pages and their frame.
```

Replace `const PRIMARY_OWNERS = [...]` and its comment with:

```ts
// One primary per surface: Today's New task, and each settings form's Save changes.
const PRIMARY_OWNERS = ['../../pages/work/Today.tsx', './WorkSettingsForm.tsx', './WorkTasksForm.tsx', './WorkNotificationsForm.tsx'];
```

In `'covers the pages, the bar and every component'`, add after `'./WorkSettingsSummary.tsx',`:

```ts
        './WorkTasksForm.tsx',
        './WorkTasksSummary.tsx',
        './WorkNotificationsForm.tsx',
        './WorkNotificationsSummary.tsx',
```

and replace `expect(Object.keys(settingsPage)).toEqual(['../../pages/settings/WorkRecommendationsPage.tsx']);` with:

```ts
    expect(Object.keys(settingsPage).sort()).toEqual([
      '../../pages/settings/WorkNotificationsPage.tsx',
      '../../pages/settings/WorkRecommendationsPage.tsx',
      '../../pages/settings/WorkSettingsFrame.tsx',
      '../../pages/settings/WorkTasksPage.tsx',
    ]);
```

In `'sets every figure in DM Mono with tabular-nums'`, add `'./WorkTasksSummary.tsx',` and `'./WorkNotificationsSummary.tsx',` to the first list.

In `'designs loading, empty and error states'`, add:

```ts
    expect(settingsPage['../../pages/settings/WorkSettingsFrame.tsx']).toMatch(/<ErrorBlock /);
    expect(settingsPage['../../pages/settings/WorkSettingsFrame.tsx']).toMatch(/animate-pulse/);
    for (const page of ['../../pages/settings/WorkTasksPage.tsx', '../../pages/settings/WorkNotificationsPage.tsx']) {
      expect(settingsPage[page], page).toMatch(/<WorkSettingsFrame /);
    }
```

Rename the test `'keeps one primary per surface: Today’s New task and the settings form’s Save changes'` to `'keeps one primary per surface: Today’s New task and each settings form’s Save changes'` and `'writes no em dash anywhere in the Work folders or the settings page, comments and tests included'` to `'writes no em dash anywhere in the Work folders or the Work settings pages, comments and tests included'`.

- [ ] **Step 2: Run the house rules**

Run: `npx vitest run src/components/work/houseRules.test.ts --maxWorkers=2`
Expected: PASS. A failure names the file and the rule: fix the file, not the rule (an em dash in a new file, a control without `min-h-11`, or an icon without `aria-hidden`).

- [ ] **Step 3: `docs/03-ui-ux-design.md`**

Replace the bell line

```md
- **The bell.** `task_assigned` gets Lucide `SquareCheck`; `recommendations_waiting` gets Lucide `Lightbulb`.
```

with:

```md
- **The bell.** `task_assigned` gets Lucide `SquareCheck`; `recommendations_waiting` gets Lucide `Lightbulb`; `task_overdue` gets Lucide `AlarmClock` and `task_escalated` Lucide `TriangleAlert` (delivery 3), both opening the task panel like `task_assigned`.
```

After the "Settings › Work › Recommendations" bullet (it ends "States: a skeleton, Try again."), add:

```md
- **Settings › Work › Tasks** (`/settings/work-tasks`, Lucide `ListTodo`;
  spec §3.3). On `WorkSettingsFrame` (`pages/settings/`: the frame's 20px
  h1, intro, skeleton and Try again, shared with Notifications). For an
  admin: "Tell the manager after (working days overdue)" (a narrow number
  input), Timezone (a select, UTC first, then the browser's IANA zones),
  Working days (seven checkboxes, Monday to Sunday, in a fieldset), each
  with an 11px note and its error below in the server's words; Save
  changes is the page's one primary, `aria-disabled` until something
  changed, "Saved." beside it. A member reads "Only admins can change
  these." and three lines of text, the number in DM Mono.
- **Settings › Work › Notifications** (`/settings/work-notifications`,
  Lucide `BellRing`). When the server cannot send email (`email_ready`
  false), everyone first reads "Email isn't set up on this server yet:
  digests are skipped" (13px semibold, `text-warning`). For an admin:
  Daily digest (a switch with its note) and Send after (a select of
  00:00 to 23:00, noted "Local time in <timezone>, set under Tasks."),
  then Save changes as on Tasks. A member reads the two values as text,
  the hour in DM Mono.
- **Briefs** moved from the AI group into Work (`/settings/brief-delivery`
  unchanged). The Work group reads Recommendations, Tasks, Notifications,
  Briefs.
- **The trail** (delivery 3): "Revenact reminded Carl CSM: 2 days
  overdue." and "Revenact told Mona Manager: 2 working days overdue."
  ("you" for the reader).
```

- [ ] **Step 4: `docs/04-app-flow.md`**

In the route table row near line 90, replace `` `/settings/{data,defaults,products,entity-uploads,ai-agent,ai-attributes,brief-delivery,webhooks,agent-access}` `` with `` `/settings/{data,defaults,products,entity-uploads,work-tasks,work-notifications,ai-agent,ai-attributes,brief-delivery,webhooks,agent-access}` ``.

Rename the heading `### 4.5f Brief delivery (Settings › AI › Briefs)` to `### 4.5f Brief delivery (Settings › Work › Briefs)`, and add right after section 4.5f's last numbered item:

```md
### 4.5f2 Tasks and Notifications (Settings › Work)

1. `/settings/work-tasks` and `/settings/work-notifications` each read
   `GET /work/settings/` once (`WorkSettingsFrame`). With `can_edit`
   (`manage_org_settings`) each is a form that sends `PATCH /work/settings/`
   with only what changed; without it the values are text.
2. Tasks: `escalate_after_days` (checked first, "Choose a whole number from
   1 to 30."), `timezone` (the browser's IANA list; the server refuses a
   name it does not know with "Choose a timezone from the list.") and
   `working_days` (sent sorted; none is refused with "Choose at least one
   working day."). The timezone moves every Work date: Today's groups,
   overdue, Assign's prefilled due date and the badge all use the server's
   date there, never the browser's.
3. Notifications: `digest_enabled` and `digest_hour` (local hour in the
   workspace timezone). `email_ready` false shows "Email isn't set up on
   this server yet: digests are skipped" to everyone; nothing else
   changes.
4. The backend reminds an overdue task's assignee once a day
   (`task_overdue`) and tells their manager once (`task_escalated`); both
   arrive in the bell and open `/work/today?task=<id>`, and the task's
   trail gains "Revenact reminded …" and "Revenact told …" lines.
```

In the settings nav list near lines 1205-1215, append to the end of the `**Work.**` bullet (after "Without `can_edit` the values are text."):

```md
  Tasks (`WorkTasksPage`) and Notifications (`WorkNotificationsPage`), the
  same way (4.5f2); Briefs (moved from AI, 4.5f).
```

and replace `the last three `view_all_accounts`), Briefs.` with `the last three `view_all_accounts`).`

- [ ] **Step 5: The full check**

Run, in order, each in the foreground:

```bash
npx vitest run --maxWorkers=2
npm run lint
npm run build
```

Expected: every suite passes, lint is clean, the build succeeds. Fix any failure at its cause before committing (a suite elsewhere that asserted Briefs sits in AI is updated to the new group; nothing else should move).

- [ ] **Step 6: Commit**

```bash
git add src/components/work/houseRules.test.ts docs/03-ui-ux-design.md docs/04-app-flow.md
git commit -m "docs(work): delivery 3 in the UI/UX and app flow docs; house rules over the new pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage (§3.3 and the contract):** Tasks settings (escalation, timezone, working days): Task 4. Notifications (digest, hour, `email_ready` line): Task 5. Briefs moved, URL kept: Task 6. Bell icons and opening the panel: Task 7. Types for the new settings fields and `digest_opt_out`: Task 1. Trail sentences for `nudged`/`escalated`: Task 3. "Today" in the workspace timezone needs no frontend change (the server sends `today` and every bucket; the frontend never computes it), recorded in the docs (Task 8). Every list or page has loading and error states (the frame). Phone width: Tasks 4 and 5. House rules and docs: Task 8.
- **Placeholders:** none; every code step carries its code. Two steps give a guarded fallback (Task 3's helper names if they clash, Task 7's `it.each` title), each with the exact alternative.
- **Type consistency:** `WorkSettings`/`WorkSettingsPatch` fields (Task 1) are the names used in `workTracking.ts` (Task 2), the forms (Tasks 4, 5) and the stub. `Refusal['field']` keys `escalate_after_days`, `working_days`, `timezone`, `digest_enabled`, `digest_hour` exist in `RefusalField` (Task 1) before Tasks 2, 4 and 5 use them. `WorkSettingsFrame`'s `children(settings, onSaved)` is called the same way in both pages. `TRACK.LOAD`/`TRACK.LOADING` are the frame's words and the tests' "Loading these settings".

## Execution handoff

Plan complete. Execute with superpowers:subagent-driven-development (a fresh subagent per task, review between tasks) after the backend for delivery 3 is merged or running locally (the frontend reads the contract's shapes; the stub stands in until then).

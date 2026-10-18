# UI Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one set of UI primitives in `src/components/ui/` (cards, lists, tiles, states, tabs, segments, chips, search, select, switch, toolbar, badges, page header, settings frame), the type and number constants, the `*-ink` tokens, the dev-only `/__ui` gallery, the house-rule ratchet and the skill update, with almost no visible change to existing pages.

**Architecture:** New presentational primitives live in `src/components/ui/` and know nothing about features; `ui/index.ts` re-exports them. Existing imports keep working: `portfolio/styles.ts` re-exports the buttons from `ui/styles.ts`, and `MONO` becomes a deprecated alias of `NUM`, so every figure moves to the body font in one step. Enforcement is a whole-app ratchet test (`src/test/uiRatchet.test.ts`) plus `uiRuleSuite` for folders that have moved; surface PRs (records, ops, impact, settings, dashboard) come after this one and are not in this plan.

**Tech Stack:** React 19 + TypeScript, Vite 8, Tailwind v4 (`@theme` in `src/index.css`), react-router 7, lucide-react, Vitest 5 + Testing Library (jsdom), `@playwright/cli` for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-09-ui-foundations-design.md` (owner-approved 2026-10-09, binding, including §11 owner answers). Read it alongside this plan.

## Global Constraints

- Worktree `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/ui-found-fe`, branch `feat/ui-foundations`, base `origin/main` 3c7cb8e. All paths below are relative to the worktree.
- Scope: spec §1 to §8, §9.3 to §9.4 machinery, §10. No surface migration (rows, tiles, toolbars, headers of real pages stay as they are). Account settings (`/account-settings/*`, `/profile`, `SettingsLayout.tsx`, `SettingsSidebar.tsx`) are not edited.
- Tokens only, in both themes: no hex, `rgb()`, named palette colour or `bg-white`/`text-black` in any `.tsx`/`.ts` under `src/`. A new colour goes in `@theme` and in `html.dark, [data-theme="dark"]`.
- Type sizes 11/13/15/22 px only, roles in `ui/type.ts`; weights `font-normal` and `font-semibold` only in new code.
- Numbers use the body font with `tabular-nums` (`NUM`); DM Mono (`CODE`, `font-mono-brand`) only for IDs, keys, endpoints, code.
- One card standard: `rounded-xl border border-line bg-surface`, no shadow, no card inside a card. `shadow-lg` only on overlays (`OVERLAY`).
- 44px touch targets below `sm` (`min-h-11`); one primary per form; a `role="status"` region is never `display: none`; `min-h-[100dvh]`, never `h-screen`; Lucide icons only, `aria-hidden="true"` when decorative; icon-only buttons carry `aria-label`.
- Copy: sentence case; no em dash in any added `src` line, and none at all in files under `agents`, `work`, `brain`, `plans`, `segments`, `rules`, `campaigns` or `canvas` folders that this plan creates.
- Never run prettier. Never `git stash`. `git add` explicit paths only. Never push.
- Commit messages: conventional (`feat(ui): ...`, `test(ui): ...`, `docs(ui): ...`), each ending with the trailer line exactly: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Checks: `npm test` (Vitest), `npm run lint`, `npm run build`. Run a single file with `npx vitest run <path>`.
- Open PR #128 (`fix/ui-broken`) also edits `src/index.css` (adds `:root { accent-color }` after the dark bridge) and `src/components/surveys/AnswersSection.test.tsx`. This plan touches both (different hunks). Do not touch the other #128 files (`Navbar.tsx`, `DashboardLayout.tsx`, `BrainTabs.tsx`, `WorkTabs.tsx`, `components/brain/Figured.tsx`, `features/agents/evidenceLabel.ts`, `communications/*`, `UserManagement.tsx`, `ActionsGridForm.tsx`, `rowParts.tsx`, boards). After #128 merges, rebase this branch onto `origin/main` before the PR opens (Task 16).
- Local app for screenshots: API at `http://localhost:8000` (already running); Vite from this worktree on port 5175 through `scripts/ui-shots.vite.config.mjs` (the API's CORS list only names 5173 and 5174). Sign-in is the seeded demo admin; the script reads the password from `../../revenact-backend/services/accounts/management/commands/seed_demo.py` at run time. Never write the password into any file, command you echo, or commit.
- Playwright CLI: `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/cleanup-fe/node_modules/.bin/playwright-cli` (pass with `--cli`).

## File structure

| Path | Responsibility |
|---|---|
| `scripts/ui-shots.mjs`, `scripts/ui-shots.vite.config.mjs` | Screenshot runner with layout checks; Vite with an API proxy for any port |
| `src/components/ui/styles.ts`, `type.ts` | Class constants (`FOCUS`, `PRIMARY`, `BUTTON`, `QUIET`, `DANGER`, `ICON_BUTTON`, `SELECT`, `INPUT`, `OVERLAY`, `NUM`, `CODE`) and `TYPE` |
| `src/components/ui/Card.tsx` | `Card`, `CardHeader`, `CardBody`, `CardSection`, `CardFooter`, Card-in-Card dev error |
| `src/components/ui/States.tsx` | `LoadingState`, `EmptyState`, `ErrorState`, `DEFAULT_ERROR_DETAIL` |
| `src/components/ui/List.tsx` | `ListCard`, `ListRow`, `ListHeaderRow`, `TABLE`, `TH`, `TD`, `TD_NUM`, `ROW_ACTIONS` |
| `src/components/ui/Tile.tsx`, `tileRow.ts` | `Tile`; `tileRow()` (a function, so it lives in a `.ts`: react-refresh forbids non-component function exports from `.tsx`) |
| `src/components/ui/Badge.tsx` | `Badge`, `HealthBadge`, `SentimentBadge` and their types |
| `src/components/ui/useScrollFade.ts`, `tabIds.ts`, `Tabs.tsx`, `SegmentedControl.tsx` | Overflow fade hook; tab id helpers; `Tabs`; `SegmentedControl` |
| `src/components/ui/FilterChip.tsx`, `SearchInput.tsx`, `Select.tsx`, `Switch.tsx` | `FilterChip`, `RemovableChip`, `FilterChipRow`; `SearchInput`; `Select`; `Switch`, `SWITCH`, `Track` |
| `src/components/ui/OverflowMenu.tsx`, `ActionCluster.tsx`, `Toolbar.tsx` | `UiAction`, `OverflowMenu`; `ActionCluster`; `Toolbar` |
| `src/components/ui/PageHeader.tsx`, `SettingsFrame.tsx` | `PageHeader`, `PageBody`; `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsSaveBar` |
| `src/components/ui/index.ts` | Re-exports |
| `src/pages/dev/UiGallery.tsx` | The `/__ui` gallery (dev only) |
| `src/test/houseRules.ts`, `src/test/uiRatchet.test.ts`, `src/components/ui/houseRules.test.ts` | New scanners and `uiRuleSuite`; the whole-app ratchet; the ui folder's own suites |
| `src/index.css`, `index.html` | `*-ink` tokens, `.rv-scroll-fade`, Lato dropped (`.rv-card` unchanged: account settings are out of scope) |
| Modified | `portfolio/styles.ts` (re-exports, `MONO = NUM`), `dashboard/shared/Panel.tsx` (through `Card`), `rules/RuleSwitch.tsx` + `ConfirmedSwitch.tsx` (onto `Switch`; `switchParts.tsx` deleted), `GeneralSettingsPage.tsx` + `MessageFields.tsx` (`CODE`), `App.tsx` (route), 32 tests (figure class), `.gitignore`, the revenact-design skill, `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` |

The revenact-design skill: `/Users/tusharaggarwal/Desktop/Projects/Revenact/.claude/skills/revenact-design` is a symlink to `react-ts-app/.claude/skills/revenact-design`, so the file edited in this PR is `.claude/skills/revenact-design/SKILL.md` in this worktree.

---

### Task 1: Screenshot tooling and the "before" set

Take the "before" screenshots now, while the app is unchanged.

**Files:**
- Create: `scripts/ui-shots.mjs`
- Create: `scripts/ui-shots.vite.config.mjs`
- Modify: `.gitignore` (append `shots/`)

**Interfaces:**
- Produces: `node scripts/ui-shots.mjs --seed <seed_demo.py> [--base URL] [--out DIR] [--label NAME] [--cli PATH] [--no-gallery] <route>...` writing `<out>/<label>-<route-slug>-<desktop|phone>-<light|dark>.png`, exit 1 on layout or console problems. Task 16 reuses it with `--label after` (gallery included).

- [ ] **Step 1: Write the Vite config for screenshot runs**

`scripts/ui-shots.vite.config.mjs`:

```js
// Vite for screenshot runs (UI foundations spec §9.3), on any port. The
// API's CORS list names only :5173 and :5174, so this server proxies the
// API and its sockets and the app talks to them on its own origin. Start:
//   VITE_API_URL= npx vite --config scripts/ui-shots.vite.config.mjs --port 5175
// (the empty VITE_API_URL wins over .env, so the app uses its own origin).
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config.ts';

export default mergeConfig(
  base,
  defineConfig({
    server: {
      strictPort: true,
      proxy: {
        '/api': 'http://localhost:8000',
        '/ws': { target: 'ws://localhost:8000', ws: true },
      },
    },
  }),
);
```

- [ ] **Step 2: Write the screenshot runner**

`scripts/ui-shots.mjs`:

```js
// Screenshots and layout checks for UI PRs (UI foundations spec §9.3).
//
//   node scripts/ui-shots.mjs --seed <revenact-backend>/services/accounts/management/commands/seed_demo.py \
//     [--base http://localhost:5175] [--out shots] [--label after] \
//     [--cli node_modules/.bin/playwright-cli] [--no-gallery] /organizations/list /brain
//
// Signs in as the seeded demo admin, then for every route (the /__ui gallery
// first unless --no-gallery) writes <out>/<label>-<route>-<desktop|phone>-<light|dark>.png
// at 1440x900 and 390x844. Dark comes from emulating the colour scheme with
// the user theme left on `system`, since ThemeSynchronizer overwrites a
// hand-added `.dark`. The run exits 1 on sideways scroll at 390, content
// starting under the header, or any console error. The password is read
// from the seed file at run time and never written anywhere; playwright-cli
// echoes the code it runs, so its raw output is never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const flags = new Map();
const routes = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--no-gallery') flags.set('no-gallery', true);
  else if (argv[i].startsWith('--')) flags.set(argv[i].slice(2), argv[++i]);
  else routes.push(argv[i]);
}
const base = flags.get('base') ?? 'http://localhost:5175';
const out = resolve(flags.get('out') ?? 'shots');
const label = flags.get('label') ?? 'shot';
const cli = resolve(flags.get('cli') ?? 'node_modules/.bin/playwright-cli');
const seed = flags.get('seed');
if (!flags.get('no-gallery') && !routes.includes('/__ui')) routes.unshift('/__ui');

if (!seed || !existsSync(seed)) {
  console.error('ui-shots: pass --seed <path to revenact-backend/services/accounts/management/commands/seed_demo.py>');
  process.exit(2);
}
const seedSource = readFileSync(seed, 'utf8');
const password = /^PASSWORD = "([^"]+)"/m.exec(seedSource)?.[1];
const email = /\("([^"]+)", "[^"]+", User\.Role\.ADMIN/.exec(seedSource)?.[1];
if (!password || !email) {
  console.error('ui-shots: could not read the demo admin from the seed file');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const SESSION = '-s=ui-shots';
function cliRun(args) {
  return execFileSync(cli, [SESSION, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

// What a run-code function returned: the line after "### Result" is a JSON
// string holding "UI_SHOTS <json>".
function resultOf(output) {
  const lines = output.split('\n');
  const at = lines.indexOf('### Result');
  if (at === -1) throw new Error('playwright-cli printed no result');
  return JSON.parse(JSON.parse(lines[at + 1]).replace(/^UI_SHOTS /, ''));
}

// The email form appears only after the sign-in providers load, so wait
// for the network to settle before looking for its toggle.
const login = `async page => {
  await page.goto(${JSON.stringify(`${base}/login`)}, { waitUntil: 'networkidle' });
  const toggle = page.getByRole('button', { name: 'Sign in with email' });
  if (await toggle.isVisible().catch(() => false)) await toggle.click();
  await page.fill('#auth-email', ${JSON.stringify(email)});
  await page.fill('#auth-password', ${JSON.stringify(password)});
  await page.locator('form#auth-email-form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  return 'UI_SHOTS ' + JSON.stringify({ at: page.url() });
}`;

const shots = `async page => {
  const routes = ${JSON.stringify(routes)};
  const viewports = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];
  const files = [];
  const failures = [];
  let errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  for (const route of routes) {
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark']) {
        errors = [];
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(${JSON.stringify(base)} + route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        const slug = route.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'root';
        const path = ${JSON.stringify(out)} + '/' + ${JSON.stringify(label)} + '-' + slug + '-' + viewport.name + '-' + theme + '.png';
        await page.screenshot({ path, fullPage: true });
        files.push(path);
        const problems = await page.evaluate((width) => {
          const found = [];
          if (width === 390 && document.documentElement.scrollWidth !== 390) found.push('page scrolls sideways (scrollWidth ' + document.documentElement.scrollWidth + ')');
          const main = document.querySelector('main');
          if (width === 390 && main && main.scrollWidth > main.clientWidth + 1) found.push('main scrolls sideways (' + main.scrollWidth + ' > ' + main.clientWidth + ')');
          const header = document.querySelector('[data-page-header]') || document.querySelector('header');
          if (header && main) {
            const bar = header.getBoundingClientRect();
            if (bar.height > 0 && main.getBoundingClientRect().top < bar.bottom - 1) found.push('content starts under the header');
          }
          return found;
        }, viewport.width);
        for (const problem of problems) failures.push(route + ' ' + viewport.name + ' ' + theme + ': ' + problem);
        for (const error of errors) failures.push(route + ' ' + viewport.name + ' ' + theme + ': console error: ' + error.slice(0, 200));
      }
    }
  }
  return 'UI_SHOTS ' + JSON.stringify({ files, failures });
}`;

let report;
try {
  cliRun(['open', 'about:blank']);
  try {
    cliRun(['run-code', login]);
  } catch {
    // The failed command line holds the password: say only what failed.
    throw new Error(`sign-in as the demo admin failed at ${base}/login (is the API on :8000 and Vite on ${base}?)`);
  }
  report = resultOf(cliRun(['run-code', shots]));
} catch (error) {
  console.error(`ui-shots: ${error instanceof Error ? error.message.split('\n')[0] : 'failed'}`);
  process.exitCode = 1;
} finally {
  try {
    cliRun(['close']);
  } catch {
    // Already closed.
  }
}

if (report) {
  for (const file of report.files) console.log(file);
  if (report.failures.length > 0) {
    console.error(`\n${report.failures.length} layout or console problem(s):`);
    for (const failure of report.failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`\n${report.files.length} screenshots, no layout or console problems.`);
  }
}
```

- [ ] **Step 3: Ignore the output folder**

Append to `.gitignore`:

```
# UI screenshot runs (scripts/ui-shots.mjs)
shots/
```

- [ ] **Step 4: Start Vite on 5175 and take the before set**

Run (background the server; it is used again in Task 16):

```bash
VITE_API_URL= npx vite --config scripts/ui-shots.vite.config.mjs --port 5175
```

Then:

```bash
node scripts/ui-shots.mjs --no-gallery --label before \
  --seed ../../revenact-backend/services/accounts/management/commands/seed_demo.py \
  --cli /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/cleanup-fe/node_modules/.bin/playwright-cli \
  /dashboard/overview /organizations/list /brain /segments /settings/general
```

Expected: 20 file paths printed under `shots/`. Layout problems on these pages are pre-existing (the phone header overlap belongs to #128): note them, do not fix them here. Open two or three PNGs with the Read tool to confirm they show the signed-in app, not the login page. Stop Vite when done.

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-shots.mjs scripts/ui-shots.vite.config.mjs .gitignore
git commit -m "chore(ui): add the screenshot runner for UI PRs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Style and type constants

**Files:**
- Create: `src/components/ui/styles.ts`, `src/components/ui/type.ts`, `src/components/ui/index.ts`
- Test: `src/components/ui/styles.test.ts`
- Modify: `src/components/organizations/portfolio/styles.ts` (whole file)
- Modify: `src/test/houseRules.ts` (the `KNOWN_COMPLIANT` block)

**Interfaces:**
- Produces: `FOCUS`, `BUTTON`, `QUIET`, `PRIMARY`, `DANGER`, `ICON_BUTTON`, `SELECT`, `INPUT`, `OVERLAY`, `NUM` (`'tabular-nums'`), `CODE` (`'font-mono-brand'`) from `ui/styles.ts`; `TYPE` with keys `display`, `title`, `body`, `bodyMuted`, `meta`, `eyebrow`, `label` from `ui/type.ts`. `portfolio/styles.ts` re-exports `BUTTON`, `FOCUS`, `PRIMARY`, `QUIET` from ui (same values) and keeps `MONO` (changed in Task 3) and `COLUMN_ICON_BUTTON`.
- Never append a colour class to a `TYPE` string: use `TYPE.bodyMuted` where the spec writes "`TYPE.body text-ink-muted`".

- [ ] **Step 1: Write the failing test**

`src/components/ui/styles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as portfolio from '../organizations/portfolio/styles';
import { BUTTON, CODE, DANGER, FOCUS, ICON_BUTTON, INPUT, NUM, OVERLAY, PRIMARY, QUIET, SELECT } from './styles';
import { TYPE } from './type';

const CONTROLS = { BUTTON, QUIET, PRIMARY, DANGER, ICON_BUTTON, SELECT, INPUT };

describe('ui/styles (UI foundations spec §3, §5.1)', () => {
  it('gives every control a 44px target below sm and the focus ring', () => {
    for (const [name, value] of Object.entries(CONTROLS)) {
      expect(value, name).toMatch(/\bmin-h-11\b/);
      expect(value, name).toContain(FOCUS);
    }
  });

  it('never dims a disabled control with opacity', () => {
    for (const [name, value] of Object.entries(CONTROLS)) expect(value, name).not.toMatch(/opacity/);
  });

  it('draws disabled buttons with tokens', () => {
    expect(PRIMARY).toContain('disabled:border-line disabled:bg-subtle disabled:text-ink-faint disabled:cursor-not-allowed');
    expect(PRIMARY).toContain('aria-disabled:border-line aria-disabled:bg-subtle aria-disabled:text-ink-faint aria-disabled:cursor-not-allowed');
    expect(BUTTON).toContain('disabled:bg-surface disabled:text-ink-faint disabled:hover:bg-surface disabled:cursor-not-allowed');
    expect(QUIET).toContain('disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed');
  });

  it('keeps DANGER for destructive actions and ICON_BUTTON square', () => {
    expect(DANGER).toContain('text-danger-ink hover:bg-danger-dim');
    expect(ICON_BUTTON).toContain('min-w-11 sm:min-h-9 sm:min-w-9');
  });

  it('sets figures in the body font and code in DM Mono', () => {
    expect(NUM).toBe('tabular-nums');
    expect(CODE).toBe('font-mono-brand');
  });

  it('keeps the only shadow on overlays', () => {
    expect(OVERLAY).toBe('rounded-xl border border-line bg-elevated shadow-lg');
    for (const value of Object.values(CONTROLS)) expect(value).not.toMatch(/shadow/);
  });

  it('re-exports the shared buttons from the portfolio styles, so old imports get the new look', () => {
    expect(portfolio.BUTTON).toBe(BUTTON);
    expect(portfolio.QUIET).toBe(QUIET);
    expect(portfolio.PRIMARY).toBe(PRIMARY);
    expect(portfolio.FOCUS).toBe(FOCUS);
  });
});

describe('ui/type (UI foundations spec §2)', () => {
  const all = Object.values(TYPE).join(' ');

  it('uses only the four sizes', () => {
    const sizes = new Set([...all.matchAll(/text-\[(\d+)px\]/g)].map((match) => match[1]));
    expect([...sizes].sort()).toEqual(['11', '13', '15', '22']);
  });

  it('uses only the regular and semibold weights', () => {
    expect(all).not.toMatch(/font-(?:bold|medium|black|light)/);
  });

  it('keeps uppercase to the eyebrow, and the eyebrow to 11px semibold', () => {
    for (const [key, value] of Object.entries(TYPE)) {
      if (key === 'eyebrow') expect(value).toBe('text-[11px] leading-4 font-semibold uppercase tracking-wider text-ink-muted');
      else expect(value, key).not.toMatch(/uppercase/);
    }
  });

  it('writes the roles as the spec does', () => {
    expect(TYPE.display).toBe('text-[22px] leading-7 font-semibold tracking-tight text-ink');
    expect(TYPE.title).toBe('text-[15px] leading-6 font-semibold text-ink');
    expect(TYPE.body).toBe('text-[13px] leading-5 text-ink');
    expect(TYPE.meta).toBe('text-[11px] leading-4 text-ink-muted');
    expect(TYPE.label).toBe('text-[13px] leading-5 font-semibold text-ink');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/ui/styles.test.ts`
Expected: FAIL, cannot resolve `./styles`.

- [ ] **Step 3: Write the constants**

`src/components/ui/styles.ts`:

```ts
// The shared class strings (UI foundations spec §1, §3, §5.1). Every
// primitive in this folder and every page take their buttons, inputs,
// overlays and figures from here; nothing else writes them by hand.

export const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** The bordered button (toolbars, card actions, Try again). Disabled reads
 *  as faint ink on the surface, not as a see-through button. */
export const BUTTON = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle disabled:bg-surface disabled:text-ink-faint disabled:hover:bg-surface disabled:cursor-not-allowed ${FOCUS}`;

/** The borderless button (Show more, empty-state actions, Back). */
export const QUIET = `inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed ${FOCUS}`;

/** The monochrome primary, one per form: accent fill, its own text colour.
 *  Written out rather than layered on BUTTON, whose surface fill and ink
 *  text would win in the stylesheet's order. */
export const PRIMARY = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover active:bg-accent-hover disabled:border-line disabled:bg-subtle disabled:text-ink-faint disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-subtle aria-disabled:text-ink-faint aria-disabled:cursor-not-allowed ${FOCUS}`;

/** A destructive action, usually inside a ⋯ menu or a confirm dialog. */
export const DANGER = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-danger-ink hover:bg-danger-dim active:bg-danger-dim disabled:text-ink-faint disabled:hover:bg-surface disabled:cursor-not-allowed ${FOCUS}`;

/** An icon-only button: 44px below sm. Every use carries an aria-label
 *  (checked by the house rules). */
export const ICON_BUTTON = `inline-flex min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed ${FOCUS}`;

/** A native select's frame; `Select` adds the chevron. */
export const SELECT = `min-h-11 sm:min-h-9 w-full appearance-none rounded-lg border border-line bg-surface pl-3 pr-8 text-[13px] text-ink hover:border-line-strong disabled:bg-subtle disabled:text-ink-faint ${FOCUS}`;

/** A text input's frame: white everywhere, the same disabled tokens as SELECT. */
export const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong disabled:bg-subtle disabled:text-ink-faint ${FOCUS}`;

/** Menus, popovers, sheets and modals. Not a card: the only shadow in the app. */
export const OVERLAY = 'rounded-xl border border-line bg-elevated shadow-lg';

/** Every figure: money, counts, scores, percentages, dates in tables,
 *  durations. The body font's tabular figures, so columns align. Wrap the
 *  figure only, never the phrase or its trailing punctuation. */
export const NUM = 'tabular-nums';

/** Revenact IDs, API keys and prefixes, endpoints, webhook URLs, raw JSON.
 *  Nothing else is set in DM Mono. */
export const CODE = 'font-mono-brand';
```

`src/components/ui/type.ts`:

```ts
// The type scale (UI foundations spec §2): four sizes (11/13/15/22 px), two
// weights (400, 600), each size with a role. Never append a colour to one
// of these strings: two text colours in one class list resolve by the
// stylesheet's order, not by position. Muted body text is `bodyMuted`.

export const TYPE = {
  /** The one in-content page heading; a tile's value (with NUM). */
  display: 'text-[22px] leading-7 font-semibold tracking-tight text-ink',
  /** Top-bar title, card and section titles, modal and empty-state titles. */
  title: 'text-[15px] leading-6 font-semibold text-ink',
  /** Rows, paragraphs, inputs, buttons (buttons add font-semibold). */
  body: 'text-[13px] leading-5 text-ink',
  /** Body text in the muted ink: intros, descriptions, inline labels. */
  bodyMuted: 'text-[13px] leading-5 text-ink-muted',
  /** Row meta lines, captions, helper text, badges, column headers, times. */
  meta: 'text-[11px] leading-4 text-ink-muted',
  /** Only tile labels and the settings nav's group labels. */
  eyebrow: 'text-[11px] leading-4 font-semibold uppercase tracking-wider text-ink-muted',
  /** Form field labels, above the input. Never uppercase. */
  label: 'text-[13px] leading-5 font-semibold text-ink',
} as const;
```

`src/components/ui/index.ts` (later tasks append one `export *` line each):

```ts
// Every UI primitive (UI foundations spec §1). Pages import from here.
export * from './styles';
export * from './type';
```

`src/components/organizations/portfolio/styles.ts` (replace the whole file):

```ts
// Shared class strings for the portfolio components. The buttons and the
// focus ring live in components/ui/styles.ts now (UI foundations spec §1);
// these re-exports keep every existing import working until each surface
// PR switches to the ui folder.
import { FOCUS } from '../../ui/styles';

export { BUTTON, FOCUS, PRIMARY, QUIET } from '../../ui/styles';

/** Numbers and ids: DM Mono with tabular figures. */
export const MONO = 'font-mono-brand tabular-nums';

/** A board column header's icon button ("+", Hide): 44px below sm. */
export const COLUMN_ICON_BUTTON = `inline-flex min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle ${FOCUS}`;
```

In `src/test/houseRules.ts`, replace the `KNOWN_COMPLIANT` comment and line with:

```ts
// Style constants already proven 44px-compliant by the folders that define
// them (components/ui/styles.ts, components/organizations/portfolio/styles.ts,
// filterParts.tsx, components/plans/styles.ts), and already covered by their
// own tests. A file reaching for one of these needs no touch-target class of
// its own.
const KNOWN_COMPLIANT = ['BUTTON', 'PRIMARY', 'QUIET', 'DANGER', 'ICON_BUTTON', 'COLUMN_ICON_BUTTON', 'FILTER_SELECT', 'INPUT', 'LINK'];
```

- [ ] **Step 4: Run the test and the existing house rules**

Run: `npx vitest run src/components/ui/styles.test.ts src/components/organizations src/test`
Expected: PASS. (No existing test asserts `disabled:opacity-50`; the disabled look of every BUTTON/QUIET/PRIMARY in the app changes here, by design, spec §8.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/styles.ts src/components/ui/type.ts src/components/ui/index.ts src/components/ui/styles.test.ts src/components/organizations/portfolio/styles.ts src/test/houseRules.ts
git commit -m "feat(ui): add the shared style and type constants, disabled buttons on tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Figures in the body font (`MONO` becomes `NUM`)

**Files:**
- Modify: `src/components/organizations/portfolio/styles.ts` (`MONO`)
- Modify: `src/pages/settings/GeneralSettingsPage.tsx` (slug to `CODE`), `src/components/campaigns/MessageFields.tsx` (merge fields to `CODE`)
- Test: `src/components/ui/styles.test.ts`, `src/components/campaigns/MessageFields.test.tsx`, and the 32 test files listed in Step 4

**Interfaces:**
- Consumes: `NUM`, `CODE` from Task 2.
- Produces: `MONO === NUM` (deprecated). The only `MONO` uses on IDs/code (workspace slug, `{merge_field}` chips) move to `CODE`; every other `MONO` use is a figure and becomes `tabular-nums` with no source change. Direct `font-mono-brand` uses (107 in `.tsx`) are untouched; surface PRs move them.

- [ ] **Step 1: Write the failing tests**

In `src/components/ui/styles.test.ts`, add after the re-export test (inside the first `describe`):

```ts
  it('turns the old MONO into NUM, so every figure leaves DM Mono at once', () => {
    expect(portfolio.MONO).toBe(NUM);
  });
```

(The merge-field test that pins the `CODE` move is added in Step 4, after the sed loop, so the loop cannot rewrite it.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/ui/styles.test.ts`
Expected: the MONO test FAILS (`'font-mono-brand tabular-nums'` is not `'tabular-nums'`).

- [ ] **Step 3: Make MONO an alias and move the two code uses to CODE**

In `src/components/organizations/portfolio/styles.ts` change the import to `import { FOCUS, NUM } from '../../ui/styles';` and replace the `MONO` block with:

```ts
/** @deprecated Figures are set in the body font with tabular figures
 *  (UI foundations spec §3, owner decision 2): this is `NUM`, kept so the
 *  existing imports move every figure in one step. IDs and code use `CODE`. */
export const MONO = NUM;
```

In `src/pages/settings/GeneralSettingsPage.tsx`: replace `import { MONO, PRIMARY } from '../../components/organizations/portfolio/styles';` with

```ts
import { PRIMARY } from '../../components/organizations/portfolio/styles';
import { CODE } from '../../components/ui/styles';
```

and `<span className={MONO}>{organisation.slug}</span>` with `<span className={CODE}>{organisation.slug}</span>`.

In `src/components/campaigns/MessageFields.tsx`: add `import { CODE } from '../ui/styles';` after the `INPUT` import, and replace ``<span className={MONO}>{`{${field}}`}</span>`` with ``<span className={CODE}>{`{${field}}`}</span>`` (the `Count` figures keep `MONO`).

- [ ] **Step 4: Point the figure assertions at `tabular-nums`**

These 32 test files assert `font-mono-brand` on figures rendered through `MONO` (measured: 44 failing tests before this step, all pass after it). Run from the worktree root (BSD sed):

```bash
FILES="src/components/agents/UndoAction.test.tsx src/components/brain/ChangedTiles.test.tsx src/components/brain/CustomerLists.test.tsx src/components/brain/CustomerPanels.test.tsx src/components/brain/DoingRows.test.tsx src/components/brain/MeasureTable.test.tsx src/components/brain/MovesList.test.tsx src/components/brain/WaitingRow.test.tsx src/components/campaigns/MessageFields.test.tsx src/components/canvas/PersonCard.test.tsx src/components/pipelines/portfolio/PipelineItem.test.tsx src/components/plans/PlansBoard.test.tsx src/components/plans/parts.test.tsx src/components/rules/TestPanel.test.tsx src/components/segments/PreviewPanel.test.tsx src/components/segments/RuleEditor.test.tsx src/components/segments/RuleSentence.test.tsx src/components/segments/ValueInput.test.tsx src/components/surveys/AnswersSection.test.tsx src/components/surveys/AudienceSummary.test.tsx src/components/work/TaskRowItem.test.tsx src/pages/brain/Doing.test.tsx src/pages/brain/Waiting.test.tsx src/pages/campaigns/CampaignBuilder.test.tsx src/pages/campaigns/CampaignSends.test.tsx src/pages/campaigns/CampaignsHome.test.tsx src/pages/plans/PlanPage.test.tsx src/pages/rules/RulesTab.test.tsx src/pages/segments/SegmentPage.test.tsx src/pages/segments/SegmentsList.test.tsx src/pages/surveys/SurveysHome.test.tsx src/pages/work/Recommended.test.tsx"
for f in $FILES; do
  sed -i '' \
    -e "s/'font-mono-brand', 'tabular-nums'/'tabular-nums'/g" \
    -e "s/'font-mono-brand')/'tabular-nums')/g" \
    -e "s/'font-mono-brand', 'text-\[22px\]')/'tabular-nums', 'text-[22px]')/g" \
    -e "s/\.font-mono-brand/.tabular-nums/g" \
    -e "/it(/s/in DM Mono/in tabular figures/g" "$f"
done
```

Now, after the loop, add the merge-field test to `src/components/campaigns/MessageFields.test.tsx`: import `within` (`import { fireEvent, render, screen, within } from '@testing-library/react';`) and add before `it('inserts a merge field at the caret`:

```tsx
  it('sets each merge field in DM Mono, as code (UI foundations spec §3)', () => {
    render(<Harness />);
    expect(within(screen.getByRole('button', { name: 'Insert {first_name}' })).getByText('{first_name}')).toHaveClass('font-mono-brand');
  });
```

Then fix the two comments that now say the wrong thing:
- `src/components/brain/WaitingRow.test.tsx`: `// Only the number sits in DM Mono, "days" does not.` becomes `// Only the number carries tabular figures, "days" does not.`
- `src/components/work/TaskRowItem.test.tsx`: the three-line comment starting `// Only the date's numbers sit in the mono face` becomes

```ts
    // Only the date's numbers carry tabular figures; the month name and the
    // spaces around it stay plain (see MonoDate).
```

Check: `grep -n "DM Mono\|font-mono-brand" $FILES` prints only the merge-field assertion.

- [ ] **Step 5: Run the affected tests**

Run: `npx vitest run $FILES src/components/ui/styles.test.ts src/pages/settings/GeneralSettingsPage.test.tsx`
Expected: 34 files, all PASS (389 tests at plan time). `GeneralSettingsPage.test.tsx` still finds `acme-inc` with `font-mono-brand`, now through `CODE`.

- [ ] **Step 6: Commit**

```bash
git add src/components/organizations/portfolio/styles.ts src/pages/settings/GeneralSettingsPage.tsx src/components/campaigns/MessageFields.tsx src/components/ui/styles.test.ts $FILES
git commit -m "feat(ui): set figures in the body font with tabular figures, DM Mono for code only

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tokens, the scroll fade, Lato out of the preload

**Files:**
- Modify: `src/index.css`, `index.html`
- Test: `src/styles.foundations.test.ts`

**Interfaces:**
- Produces: Tailwind utilities `text-success-ink`, `text-warning-ink`, `text-danger-ink`, `text-info-ink` (used by `DANGER`, `Badge`, `ErrorState`); `.rv-scroll-fade[data-overflow]` (used by `Tabs`, `FilterChipRow` via `useScrollFade`).
- Overlap: PR #128 adds a `:root { accent-color }` block after the dark bridge in `index.css`; this task's hunks are elsewhere.

- [ ] **Step 1: Write the failing test**

`src/styles.foundations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Read from disk: Vitest's CSS handling empties a `?raw` stylesheet import.
const css = readFileSync('src/index.css', 'utf8');
const html = readFileSync('index.html', 'utf8');

/** The declarations of the first rule whose selector starts at `selector`. */
function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

const light = block('@theme {');
const dark = block('html.dark, [data-theme="dark"] {');

describe('UI foundations tokens and styles (spec §5.7, §8, §2)', () => {
  it.each([
    ['success-ink', '#047857', '#34D399'],
    ['warning-ink', '#B45309', '#FBBF24'],
    ['danger-ink', '#B91C1C', '#F87171'],
    ['info-ink', '#1D4ED8', '#60A5FA'],
  ])('defines --color-%s in both themes', (name, lightValue, darkValue) => {
    expect(light).toMatch(new RegExp(`--color-${name}:\\s*${lightValue};`));
    expect(dark).toMatch(new RegExp(`--color-${name}:\\s*${darkValue};`));
  });

  it('leaves the legacy .rv-card alone (account settings are out of scope this round)', () => {
    const card = block('.rv-card {');
    expect(card).toMatch(/box-shadow:\s*var\(--rv-card-shadow\);/);
  });

  it('fades an overflowing row with an alpha mask', () => {
    const fade = block('.rv-scroll-fade[data-overflow] {');
    expect(fade).toMatch(/-webkit-mask-image:\s*linear-gradient/);
    expect(fade).toMatch(/\bmask-image:\s*linear-gradient/);
  });

  it('loads DM Serif Display and DM Mono, and no longer Lato', () => {
    expect(html).toMatch(/family=DM\+Serif\+Display/);
    expect(html).toMatch(/family=DM\+Mono/);
    expect(html).not.toMatch(/Lato/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/styles.foundations.test.ts`
Expected: FAIL on the ink tokens, the fade and Lato (the `.rv-card` check already passes and guards against an accidental change).

- [ ] **Step 3: Edit `src/index.css`**

After `  --color-info-dim:     #EFF6FF; /* blue-50 */` in `@theme`, add:

```css

  /* Readable status text on a -dim tint (UI foundations spec §5.7): amber
     text on amber-50 is about 2:1. The plain semantic tokens above stay for
     dots, bars, chart marks and icons. */
  --color-success-ink:  #047857; /* emerald-700 */
  --color-warning-ink:  #B45309; /* amber-700 */
  --color-danger-ink:   #B91C1C; /* red-700 */
  --color-info-ink:     #1D4ED8; /* blue-700 */
```

In the first `html.dark, [data-theme="dark"]` block, after `  --color-info-dim:     rgba(59, 130, 246, 0.12);` add:

```css

  --color-success-ink:  #34D399;
  --color-warning-ink:  #FBBF24;
  --color-danger-ink:   #F87171;
  --color-info-ink:     #60A5FA;
```

Replace the typography comment's text (the lines from `   Typography utilities. index.html preloads DM Serif Display, DM Mono and` to `   numbers, ids and eyebrow labels with tabular figures.`) with:

```css
   Typography utilities. index.html loads DM Serif Display and DM Mono;
   these two utilities apply them. The body keeps the system stack, whose
   tabular figures carry every number (`NUM` in components/ui/styles.ts).
   A serif display face at 400 is the house voice for greetings; the mono
   face is for IDs and code only (`CODE`), never figures (UI foundations
   spec §2, §3).
```

Do NOT change the `.rv-card { ... }` rule: it is used by account settings and the platform portal, which the owner has put out of scope this round (controller ruling 2026-10-09, overriding spec §8 for this class). `Card` does not use `.rv-card`.

After the `.rv-rail { ... }` rule at the end of the file, add:

```css

/* A sideways-scrolling row (tabs, filter chips) fades out at its right
   edge while it overflows (UI foundations spec §5.2). `useScrollFade` sets
   data-overflow; the mask is alpha only, so it reads the same in both
   themes. */
.rv-scroll-fade[data-overflow] {
  -webkit-mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
  mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
}
```

- [ ] **Step 4: Edit `index.html`**

In the Google Fonts link, change the `href` family list to
`family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap` (Lato removed, owner answer 1).

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/styles.foundations.test.ts src/pages/organizations/ask src/pages/dashboard/ask`
Expected: PASS (the glass tests still find `rv-card-glass`).

- [ ] **Step 6: Commit**

```bash
git add src/index.css index.html src/styles.foundations.test.ts
git commit -m "feat(ui): add the status ink tokens and the scroll fade, drop the unused Lato preload

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Card, and Panel drawn through it

**Files:**
- Create: `src/components/ui/Card.tsx`
- Test: `src/components/ui/Card.test.tsx`, `src/pages/dashboard/shared/Panel.test.tsx`
- Modify: `src/pages/dashboard/shared/Panel.tsx` (whole file), `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `TYPE` (Task 2).
- Produces: `Card(props: CardProps)` with `as?: 'section'|'div'|'article'|'li'` (default `section`), `pad?: 'none'|'sm'|'md'` (default `md`), `className?` (layout only), `selected?: boolean`, plus any HTML attribute (`role`, `aria-*`, `data-*`); `CardHeader({ title: ReactNode; level?: 2|3|4; meta?: ReactNode; action?: ReactNode })`; `CardBody`, `CardSection`, `CardFooter` (`{ children }`). A Card rendered inside a Card calls `console.error('Card inside Card')` in development.

- [ ] **Step 1: Write the failing tests**

`src/components/ui/Card.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardBody, CardFooter, CardHeader, CardSection } from './Card';

describe('Card (UI foundations spec §4.1)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is a flat surface: rounded-xl, 1px line, no shadow, p-4 by default', () => {
    render(<Card aria-label="Plain">Body</Card>);
    const card = screen.getByRole('region', { name: 'Plain' });
    expect(card.tagName).toBe('SECTION');
    expect(card).toHaveClass('rounded-xl', 'border', 'border-line', 'bg-surface', 'p-4');
    expect(card.className).not.toMatch(/shadow/);
  });

  it('takes its element, padding and layout classes', () => {
    const { container } = render(
      <ul>
        <Card as="li" pad="none" className="min-w-0">
          Row
        </Card>
      </ul>,
    );
    const card = container.querySelector('li')!;
    expect(card).toHaveClass('min-w-0');
    expect(card.className).not.toMatch(/\bp-\d/);
    render(<Card as="div" pad="sm" data-testid="tile">Tile</Card>);
    expect(screen.getByTestId('tile')).toHaveClass('p-3');
  });

  it('draws a selected card with the subtle fill and the accent ring instead of the surface', () => {
    render(<Card selected data-testid="on">On</Card>);
    expect(screen.getByTestId('on')).toHaveClass('bg-subtle', 'ring-1', 'ring-accent');
    expect(screen.getByTestId('on')).not.toHaveClass('bg-surface');
  });

  it('says so in development when a card is put inside a card', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Card>Alone</Card>);
    expect(error).not.toHaveBeenCalled();
    render(
      <Card>
        <Card>Nested</Card>
      </Card>,
    );
    expect(error).toHaveBeenCalledWith('Card inside Card');
  });

  it('lays out the slots: header with title, meta and action, body, section and footer', () => {
    render(
      <Card pad="none" aria-label="Slots">
        <CardHeader title="Average" meta="4 · $245K" action={<button type="button">Open</button>} />
        <CardBody>First</CardBody>
        <CardSection>Divided</CardSection>
        <CardFooter>
          <button type="button">Save</button>
        </CardFooter>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Average' })).toHaveClass('text-[15px]', 'font-semibold');
    expect(screen.getByText('4 · $245K')).toHaveClass('text-[11px]', 'text-ink-muted');
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByText('Divided')).toHaveClass('border-t', 'border-line-subtle', 'px-4', 'py-4');
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('justify-end', 'border-t');
  });

  it('heads at the level asked for', () => {
    render(<CardHeader title="Inside a section" level={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Inside a section' })).toBeInTheDocument();
  });
});
```

`src/pages/dashboard/shared/Panel.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel } from './Panel';

describe('Panel (UI foundations spec §8: drawn by Card, same look)', () => {
  it('renders a flat card with its title and action', () => {
    render(
      <Panel title="Needs attention" action={<a href="/x">Open</a>}>
        Rows
      </Panel>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Needs attention' });
    expect(heading).toHaveClass('text-[15px]', 'font-semibold', 'text-ink');
    const card = heading.closest('section')!;
    expect(card).toHaveClass('rounded-xl', 'border', 'border-line', 'bg-surface', 'p-4');
    expect(card.className).not.toMatch(/shadow/);
    expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByText('Rows')).toBeInTheDocument();
  });

  it('renders no header when it has neither title nor action', () => {
    const { container } = render(<Panel>Only rows</Panel>);
    expect(container.querySelector('header')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/ui/Card.test.tsx src/pages/dashboard/shared/Panel.test.tsx`
Expected: Card FAILS (no module). Panel passes already (it pins the look the rewrite must keep).

- [ ] **Step 3: Write Card and re-draw Panel**

`src/components/ui/Card.tsx`:

```tsx
import { createContext, useContext, useEffect, type HTMLAttributes, type ReactNode } from 'react';
import { TYPE } from './type';

// How deep the current Card sits. A card inside a card is the one layout
// mistake the owner banned outright (UI foundations spec §4.1, decision 1);
// development builds say so in the console.
const CardDepth = createContext(0);

const PAD = { none: '', sm: 'p-3', md: 'p-4' } as const;

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> {
  as?: 'section' | 'div' | 'article' | 'li';
  /** `none` with the slots below; `sm` for tiles only; `md` by default. */
  pad?: keyof typeof PAD;
  /** Layout only (grid span, width, `min-w-0`, `overflow-hidden`): never
   *  colour, border, radius or shadow. */
  className?: string;
  /** A pressed filter tile (spec §4.3): the subtle fill and the accent ring. */
  selected?: boolean;
  children?: ReactNode;
}

/** The one card (spec §4.1): solid surface, 1px line, rounded-xl, no
 *  shadow. Inside it, group with the slots, `divide-y` or whitespace. */
export function Card({ as: Tag = 'section', pad = 'md', className = '', selected = false, children, ...rest }: CardProps) {
  const depth = useContext(CardDepth);
  useEffect(() => {
    if (import.meta.env.DEV && depth > 0) console.error('Card inside Card');
  }, [depth]);
  const classes = ['rounded-xl border border-line', selected ? 'bg-subtle ring-1 ring-accent' : 'bg-surface', PAD[pad], className].filter(Boolean).join(' ');
  return (
    <CardDepth.Provider value={depth + 1}>
      <Tag {...rest} className={classes}>
        {children}
      </Tag>
    </CardDepth.Provider>
  );
}

/** A card's title row: the title as h{level}, an optional meta beside it,
 *  and one QUIET or ICON_BUTTON action on the right. */
export function CardHeader({ title, level = 2, meta, action }: { title: ReactNode; level?: 2 | 3 | 4; meta?: ReactNode; action?: ReactNode }) {
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 pt-4 pb-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <Heading className={`${TYPE.title} truncate`}>{title}</Heading>
        {meta ? <span className={`${TYPE.meta} truncate`}>{meta}</span> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-4 first:pt-4">{children}</div>;
}

/** A divided block inside the same card, in place of a nested box. */
export function CardSection({ children }: { children: ReactNode }) {
  return <div className="border-t border-line-subtle px-4 py-4">{children}</div>;
}

/** The card's last row: Save sits here when the card is a form. */
export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">{children}</div>;
}
```

`src/pages/dashboard/shared/Panel.tsx` (replace the whole file):

```tsx
import type { ReactNode } from 'react';
import { Card } from '../../../components/ui/Card';
import { TYPE } from '../../../components/ui/type';

/** The one container on the dashboard, drawn by the shared Card (UI
 *  foundations spec §9.1; Panel itself goes in the Dashboard PR). Never
 *  nest one inside another: group inside a panel with `divide-y` or
 *  whitespace instead. */
export function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      {(title || action) && (
        <header className="flex items-baseline justify-between gap-3 mb-3">
          {title && <h2 className={TYPE.title}>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </Card>
  );
}
```

Append to `src/components/ui/index.ts`: `export * from './Card';`

- [ ] **Step 4: Run the tests, the dashboard overview included**

Run: `npx vitest run src/components/ui/Card.test.tsx src/pages/dashboard/shared/Panel.test.tsx src/pages/dashboard/overview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Card.tsx src/components/ui/Card.test.tsx src/components/ui/index.ts src/pages/dashboard/shared/Panel.tsx src/pages/dashboard/shared/Panel.test.tsx
git commit -m "feat(ui): add Card with its slots and draw the dashboard Panel through it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Loading, empty and error states

**Files:**
- Create: `src/components/ui/States.tsx`
- Test: `src/components/ui/States.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `BUTTON`, `TYPE`.
- Produces: `LoadingState({ label: string; variant?: 'rows'|'tiles'|'block'; count?: number })` (a `role="status"` `aria-busy` region), `EmptyState({ title: string; detail?: ReactNode; action?: ReactNode; icon?: LucideIcon; size?: 'section'|'inline' })`, `ErrorState({ message: string; detail?: string; onRetry?: () => void })` (`role="alert"`, "Try again"), `DEFAULT_ERROR_DETAIL`.

- [ ] **Step 1: Write the failing test**

`src/components/ui/States.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from './States';

describe('LoadingState (UI foundations spec §4.4)', () => {
  it('is a busy status region named for screen readers, never hidden', () => {
    render(<LoadingState label="Loading organizations" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading organizations');
    expect(screen.getByText('Loading organizations')).toHaveClass('sr-only');
    expect(status).not.toHaveAttribute('hidden');
    expect(status.className).not.toMatch(/\bhidden\b/);
    expect(status).toBeVisible();
  });

  it('draws rows divided like the list, three by default, pulsing only with motion allowed', () => {
    const { container } = render(<LoadingState label="Loading" />);
    const rows = container.querySelectorAll('[data-part="skeleton-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass('h-14', 'px-4');
    expect(rows[0].parentElement).toHaveClass('divide-y', 'divide-line-subtle');
    expect(rows[0].firstElementChild).toHaveClass('motion-safe:animate-pulse');
  });

  it('draws tiles or one block when asked', () => {
    const { container, rerender } = render(<LoadingState label="Loading" variant="tiles" count={4} />);
    expect(container.querySelectorAll('[data-part="skeleton-tile"]')).toHaveLength(4);
    rerender(<LoadingState label="Loading" variant="block" />);
    expect(container.querySelector('[data-part="skeleton-block"]')).toHaveClass('h-32');
  });
});

describe('EmptyState', () => {
  it('centres a title, a detail, the icon and one action, in neutral colours', () => {
    render(<EmptyState title="No organizations yet" detail="Add one to start." icon={Inbox} action={<button type="button">Add organization</button>} />);
    expect(screen.getByText('No organizations yet')).toHaveClass('text-[15px]', 'font-semibold', 'text-ink');
    expect(screen.getByText('Add one to start.')).toHaveClass('text-ink-muted', 'max-w-[48ch]');
    expect(screen.getByRole('button', { name: 'Add organization' })).toBeInTheDocument();
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(document.body.innerHTML).not.toMatch(/text-(success|warning|danger)/);
  });

  it('is one muted line when inline', () => {
    render(<EmptyState title="No open plans." size="inline" />);
    expect(screen.getByText('No open plans.')).toHaveClass('px-4', 'py-3', 'text-[13px]', 'text-ink-muted');
  });
});

describe('ErrorState', () => {
  it('is an alert with the message, the default detail and Try again', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Could not load organizations." onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load organizations.');
    expect(alert).toHaveTextContent('Nothing is shown rather than a partial list.');
    expect(screen.getByText('Could not load organizations.')).toHaveClass('text-danger-ink');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no retry without a handler', () => {
    render(<ErrorState message="Failed." detail="Ask an admin." />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Ask an admin.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/ui/States.test.tsx`
Expected: FAIL, no module.

- [ ] **Step 3: Write the states**

`src/components/ui/States.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { BUTTON } from './styles';
import { TYPE } from './type';

// Loading, empty and error, each drawn inside the card that would hold the
// content (UI foundations spec §4.4): none brings its own card or fill.

const BAR = 'rounded bg-subtle motion-safe:animate-pulse';

/** A `role="status"` region with a screen-reader label and skeletons
 *  shaped like what is loading: `rows` (divided like the list), `tiles`, or
 *  one `block`. */
export function LoadingState({ label, variant = 'rows', count = 3 }: { label: string; variant?: 'rows' | 'tiles' | 'block'; count?: number }) {
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {variant === 'rows' ? (
        <div aria-hidden="true" className="divide-y divide-line-subtle">
          {items.map((index) => (
            <div key={index} data-part="skeleton-row" className="flex h-14 flex-col justify-center gap-2 px-4">
              <div className={`h-3 w-1/3 ${BAR}`} />
              <div className={`h-2.5 w-1/2 ${BAR}`} />
            </div>
          ))}
        </div>
      ) : variant === 'tiles' ? (
        <div aria-hidden="true" className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
          {items.map((index) => (
            <div key={index} data-part="skeleton-tile" className="h-24 rounded-xl bg-subtle motion-safe:animate-pulse" />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="p-4">
          <div data-part="skeleton-block" className={`h-32 ${BAR}`} />
        </div>
      )}
    </div>
  );
}

/** Nothing to show. `section` centres a title, a detail, an optional icon
 *  and one action; `inline` is one muted line for a blank section inside a
 *  populated page ("No open plans."). Always neutral. */
export function EmptyState({
  title,
  detail,
  action,
  icon: Icon,
  size = 'section',
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  size?: 'section' | 'inline';
}) {
  if (size === 'inline') return <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>{title}</p>;
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {Icon ? <Icon className="h-5 w-5 text-ink-faint" aria-hidden="true" /> : null}
      <p className={TYPE.title}>{title}</p>
      {detail ? <p className={`${TYPE.bodyMuted} max-w-[48ch]`}>{detail}</p> : null}
      {action}
    </div>
  );
}

export const DEFAULT_ERROR_DETAIL = 'Nothing is shown rather than a partial list.';

/** A failed load: an alert with the message, a detail line and Try again. */
export function ErrorState({ message, detail = DEFAULT_ERROR_DETAIL, onRetry }: { message: string; detail?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-[13px] font-semibold text-danger-ink">{message}</p>
      <p className={TYPE.meta}>{detail}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={BUTTON}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
```

Append to `src/components/ui/index.ts`: `export * from './States';`

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/ui/States.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/States.tsx src/components/ui/States.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): add the loading, empty and error states that sit inside a card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: ListCard, ListRow and the table constants

**Files:**
- Create: `src/components/ui/List.tsx`
- Test: `src/components/ui/List.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `Card`, `NUM`, `TYPE`; `LoadingState` in the test.
- Produces: `ListCard({ label: string; header?: ReactNode; state?: ReactNode; className?: string; children?: ReactNode })`; `ListRow(props: ListRowProps)` with `title: string; meta?; leading?; cells?: ReactNode[]; trailing?; actions?; href?: string; onSelect?: () => void; selected?: boolean; density?: 'regular'|'compact'; columns?: string`; `ListHeaderRow({ columns: string; labels: string[] })` (hidden below sm, `aria-hidden`); constants `TABLE`, `TH`, `TD`, `TD_NUM`, `ROW_ACTIONS`.

- [ ] **Step 1: Write the failing test**

`src/components/ui/List.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ListCard, ListHeaderRow, ListRow, TD, TD_NUM, TH } from './List';
import { LoadingState } from './States';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderList(rows: ReactNode, state?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
      <ListCard label="Organizations" state={state}>
        {rows}
      </ListCard>
    </MemoryRouter>,
  );
}

describe('ListCard (UI foundations spec §4.2)', () => {
  it('is one flat card holding one labelled, divided list', () => {
    renderList(<ListRow title="Uber" />);
    const list = screen.getByRole('list', { name: 'Organizations' });
    expect(list).toHaveClass('divide-y', 'divide-line-subtle');
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'overflow-hidden');
    expect(list.parentElement!.className).not.toMatch(/\bp-4\b/);
  });

  it('shows a state in place of the list, inside the same card', () => {
    renderList(<ListRow title="Uber" />, <LoadingState label="Loading organizations" />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('status').parentElement).toHaveClass('rounded-xl', 'border-line');
  });
});

describe('ListRow', () => {
  it('opens its route from the title, stretched over the row, on click and on Enter', async () => {
    renderList(<ListRow title="Uber" meta="Carl CSM · Renewal" href="/organizations/19" />);
    const link = screen.getByRole('link', { name: 'Uber' });
    expect(link).toHaveAttribute('title', 'Uber');
    expect(link).toHaveClass('truncate', 'font-semibold', 'after:absolute', 'after:inset-0');
    expect(link.closest('li')).toHaveClass('group', 'relative', 'min-h-14', 'py-3', 'hover:bg-subtle');
    expect(screen.getByText('Carl CSM · Renewal')).toHaveClass('text-[11px]', 'truncate');
    await userEvent.tab();
    expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/organizations/19');
  });

  it('opens in place from a title button, and marks the selected row current', async () => {
    const onSelect = vi.fn();
    renderList(<ListRow title="Stripe" onSelect={onSelect} selected />);
    const button = screen.getByRole('button', { name: 'Stripe' });
    expect(button).toHaveAttribute('aria-current', 'true');
    expect(button.closest('li')).toHaveClass('bg-subtle');
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('is plain text with no hover when it opens nothing', () => {
    renderList(<ListRow title="Read only" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Read only').closest('li')).not.toHaveClass('hover:bg-subtle');
  });

  it('keeps trailing controls above the stretched link and hides actions until hover or focus from sm', () => {
    renderList(
      <ListRow title="Uber" href="/organizations/19" trailing={<span>Risk 55</span>} actions={<button type="button">Ask about this</button>} density="compact" />,
    );
    const row = screen.getByRole('link', { name: 'Uber' }).closest('li')!;
    expect(row).toHaveClass('min-h-11', 'py-2');
    expect(within(row).getByText('Risk 55').parentElement).toHaveClass('relative', 'z-10');
    expect(within(row).getByRole('button', { name: 'Ask about this' }).parentElement).toHaveClass(
      'relative',
      'z-10',
      'sm:opacity-0',
      'sm:group-hover:opacity-100',
      'sm:group-focus-within:opacity-100',
      '[@media(hover:none)]:opacity-100',
    );
  });

  it('becomes a grid on a column template, with its cells in order', () => {
    const columns = 'sm:grid-cols-[minmax(12rem,1fr)_6rem_auto]';
    render(
      <MemoryRouter>
        <ListCard label="Pipelines" header={<ListHeaderRow columns={columns} labels={['Name', 'MRR', '']} />}>
          <ListRow title="Expansion" columns={columns} cells={[<span key="mrr">$2.0K</span>]} />
        </ListCard>
      </MemoryRouter>,
    );
    const row = screen.getByText('Expansion').closest('li')!;
    expect(row).toHaveClass('grid', columns);
    expect(within(row).getByText('$2.0K').parentElement).toHaveClass('min-w-0');
    const header = screen.getByText('MRR').parentElement!;
    expect(header).toHaveClass('hidden', 'sm:grid', columns);
    expect(header).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('table constants', () => {
  it('match the spec', () => {
    expect(TH).toBe('px-4 py-2 text-[11px] leading-4 font-semibold text-ink-muted');
    expect(TD).toBe('px-4 py-3 text-[13px] leading-5 align-middle');
    expect(TD_NUM).toBe(`${TD} text-right tabular-nums`);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/ui/List.test.tsx`
Expected: FAIL, no module.

- [ ] **Step 3: Write the list primitives**

`src/components/ui/List.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from './Card';
import { NUM } from './styles';
import { TYPE } from './type';

// A list is one card whose rows are divided, never a card per row (UI
// foundations spec §4.2, owner decision 1). Tables sit flush in a card too.

export const TABLE = 'w-full text-left';
export const TH = 'px-4 py-2 text-[11px] leading-4 font-semibold text-ink-muted';
export const TD = 'px-4 py-3 text-[13px] leading-5 align-middle';
/** A table cell holding a figure: right-aligned, tabular figures. */
export const TD_NUM = `${TD} text-right ${NUM}`;

/** Row controls beyond the first (spec §7): hidden until hover or focus
 *  from sm, always shown on touch. Opacity only, so they stay in the tab
 *  order; `relative z-10` lifts them over the row's stretched link. */
export const ROW_ACTIONS =
  'relative z-10 flex shrink-0 items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';

const DENSITY = { regular: 'min-h-14 py-3', compact: 'min-h-11 py-2' } as const;
const ROW_FOCUS =
  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent';
const TITLE = `${TYPE.body} block truncate text-left font-semibold focus-visible:outline-none`;
const STRETCH = "after:absolute after:inset-0 after:content-['']";

/** One card holding a labelled list. `state` (a LoadingState, EmptyState
 *  or ErrorState) takes the list's place inside the same card. */
export function ListCard({ label, header, state, className = '', children }: { label: string; header?: ReactNode; state?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <Card pad="none" className={`overflow-hidden ${className}`.trim()}>
      {header}
      {state ? (
        state
      ) : (
        <ul role="list" aria-label={label} className="divide-y divide-line-subtle">
          {children}
        </ul>
      )}
    </Card>
  );
}

/** Column labels over a grid list, on the rows' own template. From sm only:
 *  on a phone each row's meta line says what its figures are. */
export function ListHeaderRow({ columns, labels }: { columns: string; labels: string[] }) {
  return (
    <div aria-hidden="true" className={`hidden items-center gap-3 border-b border-line-subtle px-4 py-2 sm:grid ${columns}`}>
      {labels.map((label, index) => (
        <span key={`${index}-${label}`} className="text-[11px] leading-4 font-semibold text-ink-muted">
          {label}
        </span>
      ))}
    </div>
  );
}

export interface ListRowProps {
  /** The row's name; the real control when the row opens something. */
  title: string;
  /** One meta line, never two: extras go here or into a badge. */
  meta?: ReactNode;
  /** 32 to 40px: an avatar, a ring, an icon chip. */
  leading?: ReactNode;
  /** Grid cells between the title and the trailing slot (with `columns`). */
  cells?: ReactNode[];
  /** Always visible: at most one control, or a badge or figure. */
  trailing?: ReactNode;
  /** Shown on hover or focus from sm (spec §7). */
  actions?: ReactNode;
  /** Opens a route: the title is a Link stretched over the row. */
  href?: string;
  /** Opens in place: the title is a button stretched over the row. */
  onSelect?: () => void;
  selected?: boolean;
  density?: 'regular' | 'compact';
  /** A grid template such as `sm:grid-cols-[minmax(12rem,1fr)_6rem_8rem_auto]`,
   *  so figures line up down the list. Prefix it with sm: so phones stack. */
  columns?: string;
}

/** One row (spec §4.2). Clickable rows put the control on the title and
 *  stretch it over the row; the li itself never takes a click. */
export function ListRow({ title, meta, leading, cells = [], trailing, actions, href, onSelect, selected = false, density = 'regular', columns }: ListRowProps) {
  const current = selected ? 'true' : undefined;
  const titleControl = href ? (
    <Link to={href} title={title} aria-current={current} className={`${TITLE} ${STRETCH}`}>
      {title}
    </Link>
  ) : onSelect ? (
    <button type="button" title={title} aria-current={current} onClick={onSelect} className={`${TITLE} w-full ${STRETCH}`}>
      {title}
    </button>
  ) : (
    <span title={title} className={TITLE}>
      {title}
    </span>
  );
  const clickable = Boolean(href || onSelect);
  const classes = [
    'group relative items-center gap-3 px-4',
    columns ? `grid ${columns}` : 'flex',
    DENSITY[density],
    clickable ? 'hover:bg-subtle active:bg-line-subtle' : '',
    ROW_FOCUS,
    selected ? 'bg-subtle' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {titleControl}
          {meta ? <p className={`${TYPE.meta} truncate`}>{meta}</p> : null}
        </div>
      </div>
      {cells.map((cell, index) => (
        <div key={index} className="min-w-0">
          {cell}
        </div>
      ))}
      {trailing ? <div className="relative z-10 flex shrink-0 items-center gap-2">{trailing}</div> : null}
      {actions ? <div className={ROW_ACTIONS}>{actions}</div> : null}
    </li>
  );
}
```

Append to `src/components/ui/index.ts`: `export * from './List';`

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/ui/List.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/List.tsx src/components/ui/List.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): add ListCard and ListRow with the stretched-title row and table constants

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Tile, tileRow and the badges

**Files:**
- Create: `src/components/ui/Tile.tsx`, `src/components/ui/tileRow.ts`, `src/components/ui/Badge.tsx`
- Test: `src/components/ui/Tile.test.tsx`, `src/components/ui/Badge.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `Card` (incl. `selected`), `FOCUS`, `NUM`, `TYPE`.
- Produces: `Tile({ label: string; value: ReactNode; meta?; action?; pressed?: boolean; onPress?: () => void; children? })`; `tileRow(columns: 2|3|4|5): string`; `Badge({ tone?: BadgeTone; dot?: boolean; children })`, `BadgeTone = 'neutral'|'success'|'warning'|'danger'|'info'`; `HealthBadge({ band: HealthBadgeBand; children? })` with `'good'|'average'|'poor'`; `SentimentBadge({ value: SentimentBadgeValue; children? })` with `'positive'|'neutral'|'negative'`.

- [ ] **Step 1: Write the failing tests**

`src/components/ui/Tile.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tile } from './Tile';
import { tileRow } from './tileRow';

describe('Tile (UI foundations spec §4.3)', () => {
  it('is a group named by its eyebrow label, with the figure at display size in tabular figures', () => {
    render(<Tile label="Accounts" value="128" meta="$4.2M ARR" action={<button type="button">Filter</button>} />);
    const tile = screen.getByRole('group', { name: 'Accounts' });
    expect(tile).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'p-3', 'min-w-[15rem]', 'snap-start', 'sm:min-w-0');
    expect(screen.getByText('Accounts')).toHaveClass('text-[11px]', 'uppercase', 'tracking-wider');
    expect(screen.getByText('128')).toHaveClass('mt-1', 'text-[22px]', 'font-semibold', 'tabular-nums');
    expect(screen.getByText('$4.2M ARR')).toHaveClass('text-[11px]', 'line-clamp-2');
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('shows its breakdown rows under the meta line', () => {
    render(
      <Tile label="Health" value="72">
        <span>Good 40</span>
        <span>Poor 8</span>
      </Tile>,
    );
    expect(screen.getByText('Good 40').parentElement).toHaveClass('mt-2', 'flex-col');
  });

  it('is one pressable button when it filters, ringed while pressed', async () => {
    const onPress = vi.fn();
    const { rerender } = render(<Tile label="At risk" value="9" onPress={onPress} />);
    const button = screen.getByRole('button', { name: /At risk/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveClass('min-h-11', 'w-full', 'p-3', 'text-left');
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Tile label="At risk" value="9" onPress={onPress} pressed />);
    expect(screen.getByRole('button', { name: /At risk/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /At risk/ }).parentElement).toHaveClass('bg-subtle', 'ring-1', 'ring-accent');
  });
});

describe('tileRow', () => {
  it('keeps the phone snap strip and the sm grid, adds the lg columns, and never stretches tiles', () => {
    const row = tileRow(4);
    for (const part of ['-mx-4', 'flex', 'snap-x', 'snap-mandatory', 'overflow-x-auto', 'gap-3', 'sm:grid', 'sm:grid-cols-2', 'lg:grid-cols-4', 'items-start']) {
      expect(row.split(' ')).toContain(part);
    }
    expect(tileRow(3)).toContain('lg:grid-cols-3');
  });
});
```

`src/components/ui/Badge.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, HealthBadge, SentimentBadge } from './Badge';

describe('Badge (UI foundations spec §5.7)', () => {
  it('is a small sentence-case pill, neutral by default', () => {
    render(<Badge>Shared</Badge>);
    expect(screen.getByText('Shared')).toHaveClass('rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-semibold', 'bg-subtle', 'text-ink-muted');
    expect(screen.getByText('Shared').className).not.toMatch(/uppercase/);
  });

  it.each([
    ['success', 'bg-success-dim', 'text-success-ink'],
    ['warning', 'bg-warning-dim', 'text-warning-ink'],
    ['danger', 'bg-danger-dim', 'text-danger-ink'],
    ['info', 'bg-info-dim', 'text-info-ink'],
  ] as const)('tints %s with its dim fill and readable ink', (tone, fill, ink) => {
    render(<Badge tone={tone}>{tone}</Badge>);
    expect(screen.getByText(tone)).toHaveClass(fill, ink);
  });

  it('draws a dot instead of the tint when asked', () => {
    render(
      <Badge tone="danger" dot>
        Overdue
      </Badge>,
    );
    const badge = screen.getByText('Overdue');
    expect(badge).not.toHaveClass('bg-danger-dim');
    expect(badge.querySelector('[aria-hidden="true"]')).toHaveClass('h-1.5', 'w-1.5', 'rounded-full', 'bg-danger');
  });
});

describe('HealthBadge and SentimentBadge: the only tone maps', () => {
  it.each([
    ['good', 'Good', 'bg-success-dim'],
    ['average', 'Average', 'bg-warning-dim'],
    ['poor', 'Poor', 'bg-danger-dim'],
  ] as const)('maps health %s', (band, label, fill) => {
    render(<HealthBadge band={band} />);
    expect(screen.getByText(label)).toHaveClass(fill);
  });

  it.each([
    ['positive', 'Positive', 'bg-success-dim'],
    ['neutral', 'Neutral', 'bg-subtle'],
    ['negative', 'Negative', 'bg-danger-dim'],
  ] as const)('maps sentiment %s', (value, label, fill) => {
    render(<SentimentBadge value={value} />);
    expect(screen.getByText(label)).toHaveClass(fill);
  });

  it('takes its own words', () => {
    render(<HealthBadge band="poor">Risk 55</HealthBadge>);
    expect(screen.getByText('Risk 55')).toHaveClass('bg-danger-dim', 'text-danger-ink');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/ui/Tile.test.tsx src/components/ui/Badge.test.tsx`
Expected: FAIL, no modules.

- [ ] **Step 3: Write them**

`src/components/ui/tileRow.ts`:

```ts
const TILE_COLUMNS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' } as const;

/** A row of tiles (UI foundations spec §4.3): below sm a sideways snap strip
 *  that bleeds to the frame's edge (the page never scrolls sideways), from
 *  sm a grid of two, and `columns` from lg. `items-start`, so each tile
 *  takes its own content's height instead of stretching to the tallest. */
export function tileRow(columns: 2 | 3 | 4 | 5): string {
  return `-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 ${TILE_COLUMNS[columns]}`;
}
```

`src/components/ui/Tile.tsx`:

```tsx
import { useId, type ReactNode } from 'react';
import { Card } from './Card';
import { FOCUS, NUM } from './styles';
import { TYPE } from './type';

const WIDTH = 'min-w-[15rem] shrink-0 snap-start sm:min-w-0';

/** A KPI tile (UI foundations spec §4.3): eyebrow label, a display figure,
 *  one meta line, and at most three breakdown rows as `children`. Every
 *  standard tile has the same anatomy, so a row of them is one height.
 *  With `onPress` the tile is a filter: its content is one button with
 *  `aria-pressed` (so `action` is not shown, and children must be inline). */
export function Tile({
  label,
  value,
  meta,
  action,
  pressed = false,
  onPress,
  children,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  pressed?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const labelId = useId();
  const body = (
    <>
      <span className="flex min-h-6 items-center justify-between gap-2">
        <span id={labelId} className={TYPE.eyebrow}>
          {label}
        </span>
        {onPress ? null : action}
      </span>
      <span className={`mt-1 block ${TYPE.display} ${NUM}`}>{value}</span>
      {meta ? <span className={`mt-0.5 block ${TYPE.meta} line-clamp-2`}>{meta}</span> : null}
      {children ? <span className="mt-2 flex flex-col gap-0.5">{children}</span> : null}
    </>
  );
  if (onPress) {
    return (
      <Card as="div" pad="none" selected={pressed} className={WIDTH}>
        <button type="button" aria-pressed={pressed} onClick={onPress} className={`flex min-h-11 w-full flex-col rounded-xl p-3 text-left hover:bg-subtle ${FOCUS}`}>
          {body}
        </button>
      </Card>
    );
  }
  return (
    <Card as="div" pad="sm" role="group" aria-labelledby={labelId} className={WIDTH}>
      {body}
    </Card>
  );
}
```

`src/components/ui/Badge.tsx`:

```tsx
import type { ReactNode } from 'react';

// Status pills (UI foundations spec §5.7). Tints only, sentence case, no
// icons but the dot; at most two per row and one per tile or card header.

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const BASE = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] leading-4 font-semibold';

const TINT: Record<BadgeTone, string> = {
  neutral: 'bg-subtle text-ink-muted',
  success: 'bg-success-dim text-success-ink',
  warning: 'bg-warning-dim text-warning-ink',
  danger: 'bg-danger-dim text-danger-ink',
  info: 'bg-info-dim text-info-ink',
};

const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-ink-faint',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/** `dot` draws a leading status dot instead of the tint, for inline status
 *  in dense tables. */
export function Badge({ tone = 'neutral', dot = false, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  if (dot) {
    return (
      <span className={`${BASE} text-ink-muted`}>
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
        {children}
      </span>
    );
  }
  return <span className={`${BASE} ${TINT[tone]}`}>{children}</span>;
}

export type HealthBadgeBand = 'good' | 'average' | 'poor';

/** The only health-band tone map: good is success, average warning, poor danger. */
const HEALTH: Record<HealthBadgeBand, { tone: BadgeTone; label: string }> = {
  good: { tone: 'success', label: 'Good' },
  average: { tone: 'warning', label: 'Average' },
  poor: { tone: 'danger', label: 'Poor' },
};

export function HealthBadge({ band, children }: { band: HealthBadgeBand; children?: ReactNode }) {
  return <Badge tone={HEALTH[band].tone}>{children ?? HEALTH[band].label}</Badge>;
}

export type SentimentBadgeValue = 'positive' | 'neutral' | 'negative';

/** The only sentiment tone map: positive is success, neutral neutral, negative danger. */
const SENTIMENT: Record<SentimentBadgeValue, { tone: BadgeTone; label: string }> = {
  positive: { tone: 'success', label: 'Positive' },
  neutral: { tone: 'neutral', label: 'Neutral' },
  negative: { tone: 'danger', label: 'Negative' },
};

export function SentimentBadge({ value, children }: { value: SentimentBadgeValue; children?: ReactNode }) {
  return <Badge tone={SENTIMENT[value].tone}>{children ?? SENTIMENT[value].label}</Badge>;
}
```

Append to `src/components/ui/index.ts`:

```ts
export * from './Tile';
export * from './tileRow';
export * from './Badge';
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/ui/Tile.test.tsx src/components/ui/Badge.test.tsx`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Tile.tsx src/components/ui/tileRow.ts src/components/ui/Badge.tsx src/components/ui/Tile.test.tsx src/components/ui/Badge.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): add Tile, tileRow and the badges with the only health and sentiment tone maps

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Tabs and SegmentedControl

**Files:**
- Create: `src/components/ui/useScrollFade.ts`, `src/components/ui/tabIds.ts`, `src/components/ui/Tabs.tsx`, `src/components/ui/SegmentedControl.tsx`
- Test: `src/components/ui/Tabs.test.tsx`, `src/components/ui/SegmentedControl.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `FOCUS`; `.rv-scroll-fade` (Task 4).
- Produces: `useScrollFade<T extends HTMLElement>(): RefObject<T | null>` (sets `data-overflow`); `tabId(idBase, key)`, `tabPanelId(idBase, key)`; `Tabs<K>({ label: string; items: readonly TabItem<K>[]; value: K; onChange?: (key: K) => void; idBase?: string })` with `TabItem<K> = { key: K; label: string; count?: number; to?: string }` (links without `onChange`, a tablist with it); `SegmentedControl<T>({ label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; size?: 'md'|'sm' })`.

- [ ] **Step 1: Write the failing tests**

`src/components/ui/Tabs.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Tabs, type TabItem } from './Tabs';
import { tabPanelId } from './tabIds';

type Key = 'story' | 'calls' | 'files';
const ITEMS: TabItem<Key>[] = [
  { key: 'story', label: 'Story', count: 12 },
  { key: 'calls', label: 'Calls' },
  { key: 'files', label: 'Files' },
];

function Harness() {
  const [value, setValue] = useState<Key>('story');
  return <Tabs label="Organization sections" items={ITEMS} value={value} onChange={setValue} idBase="org" />;
}

describe('Tabs as a tablist (UI foundations spec §5.2)', () => {
  it('selects one tab, keeps only it in the tab order, and points at its panel', () => {
    render(<Harness />);
    const story = screen.getByRole('tab', { name: 'Story 12' });
    expect(screen.getByRole('tablist', { name: 'Organization sections' })).toHaveClass('overflow-x-auto', 'rv-scroll-fade');
    expect(story).toHaveAttribute('aria-selected', 'true');
    expect(story).toHaveAttribute('tabindex', '0');
    expect(story).toHaveAttribute('aria-controls', tabPanelId('org', 'story'));
    expect(story).toHaveClass('min-h-11', 'border-b-2', 'border-accent', 'text-ink', 'text-[13px]', 'font-semibold');
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveClass('border-transparent', 'text-ink-muted');
    expect(screen.getByText('12')).toHaveClass('text-[11px]', 'tabular-nums');
  });

  it('moves and selects with the arrows, Home and End, wrapping at the ends', async () => {
    render(<Harness />);
    screen.getByRole('tab', { name: 'Story 12' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Story 12' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Story 12' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects on click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('tab', { name: 'Files' }));
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Tabs as links', () => {
  it('marks the current route and links the others', () => {
    render(
      <MemoryRouter>
        <Tabs
          label="Views"
          value="list"
          items={[
            { key: 'list', label: 'List', to: '/organizations/list' },
            { key: 'board', label: 'Board', to: '/organizations/board' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/organizations/board');
    expect(screen.getByRole('link', { name: 'Board' })).not.toHaveAttribute('aria-current');
  });
});

describe('the overflow fade', () => {
  const widths = (scroll: number, client: number) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scroll });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => client });
  };
  afterEach(() => {
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  });

  it('marks the row while it overflows, and not when it fits', () => {
    widths(600, 300);
    const { unmount } = render(<Harness />);
    expect(screen.getByRole('tablist')).toHaveAttribute('data-overflow');
    unmount();
    widths(300, 300);
    render(<Harness />);
    expect(screen.getByRole('tablist')).not.toHaveAttribute('data-overflow');
  });
});
```

`src/components/ui/SegmentedControl.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

type Scope = 'me' | 'team' | 'company';

function Harness({ size }: { size?: 'md' | 'sm' }) {
  const [value, setValue] = useState<Scope>('me');
  return (
    <SegmentedControl
      label="Scope"
      size={size}
      value={value}
      onChange={setValue}
      options={[
        { value: 'me', label: 'Me' },
        { value: 'team', label: 'My team' },
        { value: 'company', label: 'Company' },
      ]}
    />
  );
}

describe('SegmentedControl (UI foundations spec §5.3)', () => {
  it('is a labelled group whose one active segment is pressed', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Scope' })).toHaveClass('inline-flex', 'rounded-lg', 'border', 'border-line', 'bg-surface', 'p-0.5');
    expect(screen.getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Me' })).toHaveClass('bg-subtle', 'text-ink', 'min-h-11', 'sm:min-h-8', 'text-[13px]');
    expect(screen.getByRole('button', { name: 'My team' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'My team' })).toHaveClass('text-ink-muted');
  });

  it('moves the pressed state on click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByRole('button', { name: 'Company' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is smaller inside tiles, still 44px below sm', () => {
    render(<Harness size="sm" />);
    expect(screen.getByRole('button', { name: 'Me' })).toHaveClass('min-h-11', 'sm:min-h-6', 'px-2', 'text-[11px]');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/ui/Tabs.test.tsx src/components/ui/SegmentedControl.test.tsx`
Expected: FAIL, no modules.

- [ ] **Step 3: Write them**

`src/components/ui/useScrollFade.ts`:

```ts
import { useEffect, useRef } from 'react';

/** Marks a sideways-scrolling row with `data-overflow` while its content is
 *  wider than the row, so `.rv-scroll-fade` (index.css) fades its right
 *  edge (UI foundations spec §5.2). Attach the returned ref to the row. */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      if (element.scrollWidth > element.clientWidth + 1) element.setAttribute('data-overflow', '');
      else element.removeAttribute('data-overflow');
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  return ref;
}
```

`src/components/ui/tabIds.ts`:

```ts
/** The ids that tie a tab to its panel (`aria-controls`, `aria-labelledby`). */
export const tabId = (idBase: string, key: string) => `${idBase}-tab-${key}`;
export const tabPanelId = (idBase: string, key: string) => `${idBase}-panel-${key}`;
```

`src/components/ui/Tabs.tsx`:

```tsx
import { useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { FOCUS } from './styles';
import { tabId, tabPanelId } from './tabIds';
import { useScrollFade } from './useScrollFade';

export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
  /** The route, when the tabs are links. */
  to?: string;
}

const ROW = 'flex h-full min-w-0 items-center gap-4 overflow-x-auto [scrollbar-width:none] rv-scroll-fade';
const TAB = `inline-flex h-full min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-semibold focus-visible:outline-offset-[-2px] ${FOCUS}`;
const ACTIVE = 'border-accent text-ink';
const INACTIVE = 'border-transparent text-ink-muted hover:text-ink';

/** A tab's count. The space before it keeps the accessible name "Story 12",
 *  not "Story12"; a flex row does not draw whitespace-only text. */
function Count({ n }: { n?: number }) {
  if (n === undefined) return null;
  return (
    <>
      {' '}
      <span className="text-[11px] text-ink-muted tabular-nums">{n}</span>
    </>
  );
}

/** Page-level underline tabs (UI foundations spec §5.2). Without
 *  `onChange` they are links (`to`), the current one `aria-current="page"`.
 *  With `onChange` they are a tablist: arrows, Home and End move and
 *  select, and only the selected tab is in the tab order. One row of tabs
 *  per page, in the PageHeader or under the page's name. */
export function Tabs<K extends string>({
  label,
  items,
  value,
  onChange,
  idBase,
}: {
  label: string;
  items: readonly TabItem<K>[];
  value: K;
  onChange?: (key: K) => void;
  /** With a tablist: ids from `tabId`/`tabPanelId`, so panels can point back. */
  idBase?: string;
}) {
  const rowRef = useScrollFade<HTMLDivElement>();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (!onChange) {
    return (
      <nav aria-label={label} className="h-full min-w-0">
        <div ref={rowRef} className={ROW}>
          {items.map((item) => {
            const active = item.key === value;
            return (
              <Link key={item.key} to={item.to ?? '.'} aria-current={active ? 'page' : undefined} className={`${TAB} ${active ? ACTIVE : INACTIVE}`}>
                {item.label}
                <Count n={item.count} />
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  const choose = onChange;
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    choose(items[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <div ref={rowRef} role="tablist" aria-label={label} className={ROW}>
      {items.map((item, index) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={idBase ? tabId(idBase, item.key) : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={idBase ? tabPanelId(idBase, item.key) : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => choose(item.key)}
            onKeyDown={(event) => onKey(event, index)}
            className={`${TAB} ${active ? ACTIVE : INACTIVE}`}
          >
            {item.label}
            <Count n={item.count} />
          </button>
        );
      })}
    </div>
  );
}
```

`src/components/ui/SegmentedControl.tsx`:

```tsx
import { FOCUS } from './styles';

const SEGMENT = {
  md: 'min-h-11 sm:min-h-8 px-3 text-[13px]',
  sm: 'min-h-11 sm:min-h-6 px-2 text-[11px]',
} as const;

/** Two to four short options that filter or re-scope the same view (UI
 *  foundations spec §5.3): scope, kind, window, Appearance. Five or more
 *  use Select. `sm` is the size inside tiles. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'sm';
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-line bg-surface p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex ${SEGMENT[size]} items-center justify-center rounded-md font-semibold ${FOCUS} ${active ? 'bg-subtle text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

Append to `src/components/ui/index.ts`:

```ts
export * from './useScrollFade';
export * from './tabIds';
export * from './Tabs';
export * from './SegmentedControl';
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/ui/Tabs.test.tsx src/components/ui/SegmentedControl.test.tsx`
Expected: PASS (8 tests). If a tab's name reads "Story12", the `{' '}` before the count is missing.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/useScrollFade.ts src/components/ui/tabIds.ts src/components/ui/Tabs.tsx src/components/ui/SegmentedControl.tsx src/components/ui/Tabs.test.tsx src/components/ui/SegmentedControl.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): add underline Tabs with the overflow fade, and SegmentedControl

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Filter chips, search, select and the one Switch

**Files:**
- Create: `src/components/ui/FilterChip.tsx`, `src/components/ui/SearchInput.tsx`, `src/components/ui/Select.tsx`, `src/components/ui/Switch.tsx`
- Test: `src/components/ui/FilterChip.test.tsx`, `src/components/ui/SearchInput.test.tsx`, `src/components/ui/Select.test.tsx`, `src/components/ui/Switch.test.tsx`
- Modify: `src/components/rules/RuleSwitch.tsx`, `src/components/rules/ConfirmedSwitch.tsx`, `src/components/ui/index.ts`
- Delete: `src/components/rules/switchParts.tsx` (its only two users move to `Switch`)

**Interfaces:**
- Consumes: `FOCUS`, `ICON_BUTTON`, `SELECT`, `TYPE`, `useScrollFade`.
- Produces: `FilterChip({ label: string; pressed: boolean; onToggle: () => void })`, `RemovableChip({ label: string; onRemove: () => void })` ("Remove filter: {label}"), `FilterChipRow({ label: string; children })`; `SearchInput({ label: string; value: string; onChange: (value: string) => void; placeholder: string; inputRef?: RefObject<HTMLInputElement | null>; width?: 'grow'|'full' })`; `Select<T>({ label: string; labelPosition?: 'above'|'inline'|'hidden'; value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[]; disabled?: boolean; id?: string })`; `Switch({ checked: boolean; onChange: (next: boolean) => void; label?: string; describedBy?: string; disabled?: boolean; className?: string; ref?: Ref<HTMLButtonElement>; children? })`, `SWITCH`, `Track`.
- The `InboxPanel` switch (in #128) and the `AgentsForm` checkbox move onto `Switch` in their surface PRs, not here.

- [ ] **Step 1: Write the failing tests**

`src/components/ui/FilterChip.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChip, FilterChipRow, RemovableChip } from './FilterChip';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <FilterChipRow label="Status">
      <FilterChip label="Open" pressed={open} onToggle={() => setOpen((value) => !value)} />
    </FilterChipRow>
  );
}

describe('FilterChip (UI foundations spec §5.4)', () => {
  it('toggles aria-pressed, outline when off and accent tint when on, never black', async () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: 'Open' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveClass('min-h-11', 'sm:min-h-8', 'rounded-full', 'border-line', 'bg-surface', 'text-ink-muted');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveClass('border-accent', 'bg-accent-dim', 'font-semibold', 'text-ink');
    expect(chip).not.toHaveClass('bg-accent');
  });

  it('sits in a labelled row that scrolls on a phone and wraps from sm', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Status' })).toHaveClass('overflow-x-auto', 'rv-scroll-fade', 'sm:flex-wrap');
  });

  it('removes an active filter from its own named button', async () => {
    const onRemove = vi.fn();
    render(<RemovableChip label="Owner: Carl" onRemove={onRemove} />);
    expect(screen.getByText('Owner: Carl')).toHaveClass('bg-subtle', 'border-transparent', 'text-ink');
    const remove = screen.getByRole('button', { name: 'Remove filter: Owner: Carl' });
    expect(remove).toHaveClass('min-h-11', 'min-w-11');
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
```

`src/components/ui/SearchInput.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchInput } from './SearchInput';

function Harness({ width }: { width?: 'grow' | 'full' }) {
  const [value, setValue] = useState('');
  return <SearchInput label="Search organizations by name or owner" placeholder="Search organizations" value={value} onChange={setValue} width={width} />;
}

describe('SearchInput (UI foundations spec §5.5)', () => {
  it('is a searchbox named by its hidden label, with a short placeholder', () => {
    render(<Harness />);
    const box = screen.getByRole('searchbox', { name: 'Search organizations by name or owner' });
    expect(box).toHaveAttribute('placeholder', 'Search organizations');
    expect(box).toHaveClass('min-h-11', 'sm:min-h-9', 'rounded-lg', 'border-line', 'bg-surface', 'pl-9', 'text-[13px]');
    expect(screen.getByText('Search organizations by name or owner')).toHaveClass('sr-only');
    expect(box.closest('label')!.parentElement).toHaveClass('flex-1', 'sm:max-w-sm');
  });

  it('offers Clear search only while there is a value, and clearing returns focus to the field', async () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, 'Uber');
    expect(box).toHaveValue('Uber');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('takes the full width when asked', () => {
    render(<Harness width="full" />);
    expect(screen.getByRole('searchbox').closest('label')!.parentElement).toHaveClass('w-full');
  });
});
```

`src/components/ui/Select.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

type Sort = 'name' | 'arr';
const OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'arr', label: 'ARR' },
] as const;

function Harness({ position, disabled }: { position?: 'above' | 'inline' | 'hidden'; disabled?: boolean }) {
  const [value, setValue] = useState<Sort>('name');
  return <Select label="Sort by" labelPosition={position} value={value} onChange={setValue} options={OPTIONS} disabled={disabled} />;
}

describe('Select (UI foundations spec §5.5)', () => {
  it('is a labelled native select in the house frame, label above by default', async () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    expect(select).toHaveClass('min-h-11', 'sm:min-h-9', 'appearance-none', 'rounded-lg', 'border-line', 'bg-surface', 'pr-8', 'text-[13px]');
    expect(screen.getByText('Sort by')).toHaveClass('text-[13px]', 'font-semibold');
    await userEvent.selectOptions(select, 'arr');
    expect(select).toHaveValue('arr');
  });

  it('puts the label inline in muted body text, or hides it', () => {
    const { unmount } = render(<Harness position="inline" />);
    expect(screen.getByText('Sort by')).toHaveClass('text-ink-muted', 'shrink-0');
    expect(screen.getByText('Sort by').parentElement).toHaveClass('flex', 'items-center');
    unmount();
    render(<Harness position="hidden" />);
    expect(screen.getByText('Sort by')).toHaveClass('sr-only');
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
  });

  it('disables with tokens, not opacity', () => {
    render(<Harness disabled />);
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    expect(select).toBeDisabled();
    expect(select).toHaveClass('disabled:bg-subtle', 'disabled:text-ink-faint');
    expect(select.className).not.toMatch(/opacity/);
  });
});
```

`src/components/ui/Switch.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';

function Harness({ disabled }: { disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onChange={setOn} label="Email digest" disabled={disabled} />;
}

describe('Switch (UI foundations spec §5.5)', () => {
  it('is a named switch that flips on click, 44px below sm', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Email digest' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass('min-h-11', 'sm:min-h-9');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle.querySelector('[aria-hidden="true"]')).toHaveClass('bg-accent');
  });

  it('takes its name from the words beside the track when it has no label', () => {
    render(
      <Switch checked onChange={vi.fn()}>
        Send without review
      </Switch>,
    );
    expect(screen.getByRole('switch', { name: 'Send without review' })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables with tokens, not opacity, and does not flip', async () => {
    render(<Harness disabled />);
    const toggle = screen.getByRole('switch', { name: 'Email digest' });
    expect(toggle).toBeDisabled();
    expect(toggle.className).not.toMatch(/opacity/);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/ui/FilterChip.test.tsx src/components/ui/SearchInput.test.tsx src/components/ui/Select.test.tsx src/components/ui/Switch.test.tsx`
Expected: FAIL, no modules.

- [ ] **Step 3: Write the controls**

`src/components/ui/FilterChip.tsx`:

```tsx
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { FOCUS } from './styles';
import { useScrollFade } from './useScrollFade';

const CHIP = `inline-flex min-h-11 sm:min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${FOCUS}`;

/** A toggle chip (UI foundations spec §5.4): off is a quiet outline, on is
 *  the accent tint with `aria-pressed`. Never black-filled. */
export function FilterChip({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`${CHIP} ${pressed ? 'border-accent bg-accent-dim font-semibold text-ink' : 'border-line bg-surface text-ink-muted hover:bg-subtle hover:text-ink'}`}
    >
      {label}
    </button>
  );
}

/** An active filter, with its own remove button ("Remove filter: Owner: Carl"). */
export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-11 sm:min-h-8 shrink-0 items-center gap-1 rounded-full border border-transparent bg-subtle pl-3 pr-1 text-[13px] text-ink">
      {label}
      <button
        type="button"
        aria-label={`Remove filter: ${label}`}
        onClick={onRemove}
        className={`inline-flex min-h-11 min-w-11 sm:min-h-6 sm:min-w-6 items-center justify-center rounded-full text-ink-muted hover:bg-line-subtle hover:text-ink ${FOCUS}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

/** A labelled row of chips: one sideways-scrolling line on a phone (with
 *  the edge fade while it overflows), wrapping from sm. */
export function FilterChipRow({ label, children }: { label: string; children: ReactNode }) {
  const ref = useScrollFade<HTMLDivElement>();
  return (
    <div ref={ref} role="group" aria-label={label} className="flex gap-2 overflow-x-auto rv-scroll-fade sm:flex-wrap sm:overflow-visible">
      {children}
    </div>
  );
}
```

`src/components/ui/SearchInput.tsx`:

```tsx
import { useRef, type RefObject } from 'react';
import { Search, X } from 'lucide-react';
import { FOCUS, ICON_BUTTON } from './styles';

/** The one search field (UI foundations spec §5.5): a hidden label with
 *  the full description, a placeholder of at most 24 characters, the
 *  Search icon, and Clear search while there is a value. The clear button
 *  sits outside the label so it never joins the field's accessible name. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
  inputRef,
  width = 'grow',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** At most 24 characters ("Search organizations"), so it never truncates. */
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** `grow` fills a toolbar row up to max-w-sm; `full` takes the whole width. */
  width?: 'grow' | 'full';
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  return (
    <div className={width === 'grow' ? 'relative min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-sm' : 'relative w-full'}>
      <label className="block">
        <span className="sr-only">{label}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          ref={ref}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface pl-9 pr-9 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong [&::-webkit-search-cancel-button]:appearance-none ${FOCUS}`}
        />
      </label>
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            ref.current?.focus();
          }}
          className={`absolute right-0 top-1/2 -translate-y-1/2 ${ICON_BUTTON}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
```

`src/components/ui/Select.tsx`:

```tsx
import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { SELECT } from './styles';
import { TYPE } from './type';

/** A native select with the house frame and chevron (UI foundations spec
 *  §5.5). The label sits `above` (forms), `inline` to the left ("Sort by",
 *  toolbars) or `hidden` (a control whose context names it). */
export function Select<T extends string>({
  label,
  labelPosition = 'above',
  value,
  onChange,
  options,
  disabled = false,
  id,
}: {
  label: string;
  labelPosition?: 'above' | 'inline' | 'hidden';
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  id?: string;
}) {
  const ownId = useId();
  const selectId = id ?? ownId;
  const control = (
    <div className="relative min-w-0">
      <select id={selectId} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)} className={SELECT}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
    </div>
  );
  if (labelPosition === 'inline') {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className={`shrink-0 ${TYPE.bodyMuted}`}>
          {label}
        </label>
        {control}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className={labelPosition === 'hidden' ? 'sr-only' : TYPE.label}>
        {label}
      </label>
      {control}
    </div>
  );
}
```

`src/components/ui/Switch.tsx`:

```tsx
import type { ReactNode, Ref } from 'react';
import { FOCUS } from './styles';

/** The switch's button: the words beside the track, 44px below sm. */
export const SWITCH = `inline-flex min-h-11 sm:min-h-9 items-center gap-2 rounded-lg px-1 text-[13px] font-semibold text-ink hover:bg-subtle disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed ${FOCUS}`;

/** The track and knob, for sight only (the button carries the role and state). */
export function Track({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex h-5 w-9 shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-line-strong'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  );
}

/** The one switch (UI foundations spec §5.5, promoted from the rules'
 *  RuleSwitch): a `role="switch"` button whose click asks for the other
 *  state. Its name is `label`, or the visible `children` beside the track. */
export function Switch({
  checked,
  onChange,
  label,
  describedBy,
  disabled = false,
  className = '',
  ref,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  describedBy?: string;
  disabled?: boolean;
  /** Layout only, such as `self-start`. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${SWITCH} ${className}`.trim()}
    >
      <Track on={checked} />
      {children}
    </button>
  );
}
```

Append to `src/components/ui/index.ts`:

```ts
export * from './FilterChip';
export * from './SearchInput';
export * from './Select';
export * from './Switch';
```

- [ ] **Step 4: Run the new tests**

Run: `npx vitest run src/components/ui/FilterChip.test.tsx src/components/ui/SearchInput.test.tsx src/components/ui/Select.test.tsx src/components/ui/Switch.test.tsx`
Expected: PASS (12 tests).

- [ ] **Step 5: Move the rules switches onto Switch**

In `src/components/rules/RuleSwitch.tsx`: replace `import { SWITCH, Track } from './switchParts';` with `import { Switch } from '../ui/Switch';`, and replace the `<button type="button" role="switch" ...>...</button>` with:

```tsx
      <Switch
        checked={rule.is_active}
        onChange={(on) => (on ? setAsking(true) : void turnOff())}
        label={`Run ${rule.name} every night`}
        describedBy={error ? errorId : undefined}
        disabled={busy}
      >
        <span aria-hidden="true">{rule.is_active ? 'On' : 'Off'}</span>
      </Switch>
```

In `src/components/rules/ConfirmedSwitch.tsx`: replace the `switchParts` import with `import { Switch } from '../ui/Switch';`, and replace the `<button ref={ref} type="button" role="switch" ...>...</button>` with:

```tsx
      <Switch
        ref={ref}
        checked={checked}
        describedBy={describedBy}
        onChange={(on) => {
          if (asking) return;
          if (on) setAsking(true);
          else onChange(false);
        }}
        className="self-start"
      >
        {label}
      </Switch>
```

Then `git rm src/components/rules/switchParts.tsx` and check `grep -rn switchParts src` prints nothing.

- [ ] **Step 6: Run the rules tests**

Run: `npx vitest run src/components/rules src/pages/rules src/e2e/rules.test.tsx src/pages/scenarios src/pages/settings/AgentsSettingsPage.test.tsx`
Expected: PASS (171 tests at plan time; `RuleSwitch.test.tsx` and `ConfirmedSwitch.test.tsx` unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/FilterChip.tsx src/components/ui/SearchInput.tsx src/components/ui/Select.tsx src/components/ui/Switch.tsx src/components/ui/FilterChip.test.tsx src/components/ui/SearchInput.test.tsx src/components/ui/Select.test.tsx src/components/ui/Switch.test.tsx src/components/ui/index.ts src/components/rules/RuleSwitch.tsx src/components/rules/ConfirmedSwitch.tsx src/components/rules/switchParts.tsx
git commit -m "feat(ui): add filter chips, search, select and the one switch, promoted from the rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Toolbar and the action cluster

**Files:**
- Create: `src/components/ui/OverflowMenu.tsx`, `src/components/ui/ActionCluster.tsx`, `src/components/ui/Toolbar.tsx`
- Test: `src/components/ui/Toolbar.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `Menu` / `MenuItem` from `src/components/organizations/detail/Menu.tsx` (the app's generic menu button, reused rather than duplicated), `useMediaQuery(SM)` from `src/lib/useMediaQuery.ts`, `BUTTON`, `DANGER`, `ICON_BUTTON`; `setViewport`/`resetViewport` from `src/test/viewport.ts` in the test.
- Produces: `UiAction` (= `MenuItem`: `{ key: string; label: string; onSelect: () => void; danger?: boolean }`); `OverflowMenu({ label?: string; items: UiAction[] })` ("More actions", nothing when empty); `ActionCluster({ primary?: ReactNode; secondary?: UiAction[] })` (from sm the first two secondaries as buttons, the rest in the menu; below sm all in the menu; primary last); `Toolbar({ lead?; search: ReactNode; filters?; actions?: { primary?: ReactNode; secondary?: UiAction[] }; count?: ReactNode })` with an always-mounted `role="status"` count.

- [ ] **Step 1: Write the failing test**

`src/components/ui/Toolbar.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport, setViewport } from '../../test/viewport';
import { PRIMARY } from './styles';
import { Toolbar } from './Toolbar';

const exportCsv = vi.fn();
const SECONDARY = [
  { key: 'export', label: 'Export', onSelect: exportCsv },
  { key: 'import', label: 'Import', onSelect: vi.fn() },
  { key: 'archive', label: 'Archive', onSelect: vi.fn(), danger: true },
];

function renderToolbar(count?: string) {
  return render(
    <Toolbar
      lead={<button type="button">Opportunities</button>}
      search={<input aria-label="Search" />}
      filters={<button type="button">Owner</button>}
      actions={{
        primary: (
          <button type="button" className={PRIMARY}>
            New organization
          </button>
        ),
        secondary: SECONDARY,
      }}
      count={count}
    />,
  );
}

describe('Toolbar (UI foundations spec §5.6)', () => {
  afterEach(() => {
    resetViewport();
    exportCsv.mockClear();
  });

  it('shows two secondaries from sm, folds the rest into More actions, and puts the primary last', async () => {
    setViewport(1440);
    const { container } = renderToolbar('14 organizations');
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    const buttons = [...container.querySelectorAll('button')].map((button) => button.textContent || button.getAttribute('aria-label'));
    expect(buttons).toEqual(['Opportunities', 'Owner', 'Export', 'Import', 'More actions', 'New organization']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu', { name: 'More actions' })).getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(exportCsv).toHaveBeenCalledTimes(1);
  });

  it('folds every secondary into the menu below sm', async () => {
    setViewport(390);
    renderToolbar();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Export', 'Import', 'Archive']);
  });

  it('announces the count politely beside the search, and keeps the region mounted without one', () => {
    setViewport(1440);
    const { rerender } = renderToolbar();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
    expect(status.parentElement).toContainElement(screen.getByRole('textbox', { name: 'Search' }));
    rerender(
      <Toolbar search={<input aria-label="Search" />} count="14 organizations" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('14 organizations');
    expect(screen.getByRole('status')).toHaveClass('text-[13px]', 'text-ink-muted', 'tabular-nums');
  });

  it('draws no menu when nothing is folded', () => {
    setViewport(1440);
    render(<Toolbar search={<input aria-label="Search" />} actions={{ secondary: SECONDARY.slice(0, 2) }} />);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/ui/Toolbar.test.tsx`
Expected: FAIL, no module.

- [ ] **Step 3: Write them**

`src/components/ui/OverflowMenu.tsx`:

```tsx
import { MoreHorizontal } from 'lucide-react';
import { Menu, type MenuItem } from '../organizations/detail/Menu';
import { ICON_BUTTON } from './styles';

/** An action a toolbar or page header offers: a label and what it does. */
export type UiAction = MenuItem;

/** The ⋯ menu that holds the actions without room of their own ("More
 *  actions"). Renders nothing when it would be empty. Reuses the app's one
 *  menu button (keyboard, focus return, dismiss). */
export function OverflowMenu({ label = 'More actions', items }: { label?: string; items: UiAction[] }) {
  if (items.length === 0) return null;
  return <Menu label={label} trigger={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />} triggerClassName={ICON_BUTTON} items={items} />;
}
```

`src/components/ui/ActionCluster.tsx`:

```tsx
import type { ReactNode } from 'react';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { OverflowMenu, type UiAction } from './OverflowMenu';
import { BUTTON, DANGER } from './styles';

/** The right-hand actions of a toolbar or page header (UI foundations spec
 *  §5.6, §6.1): from sm the first two secondary actions as buttons and the
 *  rest in the ⋯ menu; below sm every secondary in the menu. The one
 *  primary always comes last. */
export function ActionCluster({ primary, secondary = [] }: { primary?: ReactNode; secondary?: UiAction[] }) {
  const wide = useMediaQuery(SM);
  const shown = wide ? secondary.slice(0, 2) : [];
  const folded = wide ? secondary.slice(2) : secondary;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {shown.map((action) => (
        <button key={action.key} type="button" onClick={action.onSelect} className={action.danger ? DANGER : BUTTON}>
          {action.label}
        </button>
      ))}
      <OverflowMenu items={folded} />
      {primary}
    </div>
  );
}
```

`src/components/ui/Toolbar.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ActionCluster } from './ActionCluster';
import type { UiAction } from './OverflowMenu';

/** The one list toolbar (UI foundations spec §5.6): a lead control (a kind
 *  switch), the search with the result count beside it, the filters, then
 *  the actions with the primary last. Below sm the search and count take
 *  the first row; filters and actions share the second. The count is a
 *  polite live region that stays mounted (empty until there is a count). */
export function Toolbar({
  lead,
  search,
  filters,
  actions = {},
  count,
}: {
  lead?: ReactNode;
  search: ReactNode;
  filters?: ReactNode;
  actions?: { primary?: ReactNode; secondary?: UiAction[] };
  /** "14 opportunities": announced politely as it changes. */
  count?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lead}
      <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
        {search}
        <p role="status" aria-live="polite" className="shrink-0 text-[13px] text-ink-muted tabular-nums">
          {count}
        </p>
      </div>
      {filters}
      <ActionCluster primary={actions.primary} secondary={actions.secondary} />
    </div>
  );
}
```

Append to `src/components/ui/index.ts`:

```ts
export * from './OverflowMenu';
export * from './ActionCluster';
export * from './Toolbar';
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/ui/Toolbar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/OverflowMenu.tsx src/components/ui/ActionCluster.tsx src/components/ui/Toolbar.tsx src/components/ui/Toolbar.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): add the list Toolbar with a live count and a More actions menu

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: PageHeader, PageBody and the settings frame

**Files:**
- Create: `src/components/ui/PageHeader.tsx`, `src/components/ui/SettingsFrame.tsx`
- Test: `src/components/ui/PageHeader.test.tsx`, `src/components/ui/SettingsFrame.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `ActionCluster`, `UiAction`, `Card`, `CardFooter`, `PRIMARY`, `QUIET`, `TYPE`.
- Produces: `PageHeader({ title: string; back?: { to: string; label: string }; tabs?: ReactNode; actions?: { primary?: ReactNode; secondary?: UiAction[] } })`, an element with `data-page-header`; `PageBody({ width?: 'full'|'reading'|'form'; children })`, whose top sentinel sets/removes `data-scrolled` on `[data-page-header]` through an IntersectionObserver; `SettingsFrame({ title: string; intro?; width?: 'default'|'wide'; action?; children })`, `SettingsSection({ title: string; description?; footer?; children })`, `SettingsRow({ label: string; hint?; htmlFor?: string; children })`, `SettingsSaveBar({ dirty: boolean; saving: boolean; onSave: () => void })`.
- In this PR PageHeader renders in place (gallery only). Portalling it into the Navbar bar (extending `NavActionsSlotContext` with a title slot, deleting Navbar route branches) needs `Navbar.tsx`, which #128 edits; it is the first step of the Records surface PR.

- [ ] **Step 1: Write the failing tests**

`src/components/ui/PageHeader.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetViewport, setViewport } from '../../test/viewport';
import { PageBody, PageHeader } from './PageHeader';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

describe('PageHeader (UI foundations spec §6.1)', () => {
  afterEach(() => resetViewport());

  it('titles the page with an h1 in the bar, tabs beside it and actions on the right', () => {
    setViewport(1440);
    render(
      <MemoryRouter>
        <PageHeader
          title="Organizations"
          tabs={<nav aria-label="Views">tabs</nav>}
          actions={{ primary: <button type="button">New organization</button>, secondary: [{ key: 'export', label: 'Export', onSelect: vi.fn() }] }}
        />
      </MemoryRouter>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Organizations' });
    expect(title).toHaveClass('text-[15px]', 'font-semibold', 'truncate');
    const bar = title.closest('[data-page-header]')!;
    expect(bar).toHaveClass('h-16', 'px-4', 'border-b', 'border-transparent', 'data-[scrolled]:border-line-subtle');
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New organization' })).toBeInTheDocument();
  });

  it('shows Back instead of the title, keeping the h1 for screen readers', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Uber" back={{ to: '/organizations/list', label: 'Organizations' }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Organizations' })).toHaveAttribute('href', '/organizations/list');
    expect(screen.getByRole('heading', { level: 1, name: 'Uber' })).toHaveClass('sr-only');
  });
});

describe('PageBody (spec §6.2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['full', null],
    ['reading', 'max-w-5xl'],
    ['form', 'max-w-3xl'],
  ] as const)('caps the %s width', (width, cap) => {
    render(<PageBody width={width}>Content</PageBody>);
    const body = screen.getByText('Content');
    expect(body).toHaveClass('flex', 'w-full', 'flex-col', 'gap-4', 'px-4', 'pb-8');
    if (cap) expect(body).toHaveClass(cap);
    else expect(body.className).not.toMatch(/max-w-/);
  });

  it("draws the header's hairline once the sentinel scrolls out of view, and drops it when back", () => {
    let callback: Callback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(
      <MemoryRouter>
        <PageHeader title="Organizations" />
        <PageBody>Content</PageBody>
      </MemoryRouter>,
    );
    const bar = screen.getByRole('heading', { level: 1 }).closest('[data-page-header]')!;
    expect(bar).not.toHaveAttribute('data-scrolled');
    act(() => callback([{ isIntersecting: false }]));
    expect(bar).toHaveAttribute('data-scrolled');
    act(() => callback([{ isIntersecting: true }]));
    expect(bar).not.toHaveAttribute('data-scrolled');
  });
});
```

`src/components/ui/SettingsFrame.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsFrame, SettingsRow, SettingsSaveBar, SettingsSection } from './SettingsFrame';

describe('SettingsFrame (UI foundations spec §6.3)', () => {
  it('heads the page with the display h1 and a muted intro, full width up to its cap', () => {
    render(
      <SettingsFrame title="Members" intro="Who is in this workspace." width="wide" action={<button type="button">Invite</button>}>
        Body
      </SettingsFrame>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Members' });
    expect(title).toHaveClass('text-[22px]', 'font-semibold');
    expect(screen.getByText('Who is in this workspace.')).toHaveClass('text-ink-muted', 'max-w-[68ch]');
    const frame = screen.getByText('Body');
    expect(frame).toHaveClass('w-full', 'max-w-5xl', 'px-4', 'py-6', 'sm:px-6');
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });

  it('caps a default page at max-w-3xl', () => {
    render(<SettingsFrame title="General">Body</SettingsFrame>);
    expect(screen.getByText('Body')).toHaveClass('max-w-3xl');
  });

  it('puts a section heading outside one divided card, rows and footer inside', () => {
    render(
      <SettingsSection title="Workspace" description="The name everyone sees." footer={<button type="button">Save</button>}>
        <SettingsRow label="Name" hint="Shown in the sidebar." htmlFor="name">
          <input id="name" />
        </SettingsRow>
        <SettingsRow label="Owner">Alice</SettingsRow>
      </SettingsSection>,
    );
    const section = screen.getByRole('region', { name: 'Workspace' });
    expect(screen.getByRole('heading', { level: 2, name: 'Workspace' })).toHaveClass('text-[15px]', 'font-semibold');
    const card = section.querySelector('.rounded-xl')!;
    expect(card).toHaveClass('border-line', 'bg-surface');
    expect(card).not.toContainElement(screen.getByRole('heading', { level: 2 }));
    expect(card.firstElementChild).toHaveClass('divide-y', 'divide-line-subtle');
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('Shown in the sidebar.')).toHaveClass('text-[11px]');
    expect(screen.getByText('Owner')).toHaveClass('text-[13px]', 'font-semibold');
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('border-t', 'justify-end');
  });

  it('shows the save bar only while dirty, busy while saving', async () => {
    const onSave = vi.fn();
    const { rerender } = render(<SettingsSaveBar dirty={false} saving={false} onSave={onSave} />);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    rerender(<SettingsSaveBar dirty saving={false} onSave={onSave} />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save.parentElement).toHaveClass('sticky', 'bottom-0', 'bg-base', 'border-t');
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    rerender(<SettingsSaveBar dirty saving onSave={onSave} />);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-busy', 'true');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx src/components/ui/SettingsFrame.test.tsx`
Expected: FAIL, no modules.

- [ ] **Step 3: Write them**

`src/components/ui/PageHeader.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ActionCluster } from './ActionCluster';
import type { UiAction } from './OverflowMenu';
import { QUIET } from './styles';
import { TYPE } from './type';

/** A page's top bar (UI foundations spec §6.1): the h1 title (or a Back
 *  link, the title then for screen readers only), the page's tabs, and on
 *  the right at most two actions plus the ⋯ menu, the primary last. The
 *  bar is transparent on the canvas; its hairline shows once the content
 *  has scrolled (PageBody's sentinel sets `data-scrolled`). It renders in
 *  place; the surface PRs move it into the Navbar's bar. */
export function PageHeader({
  title,
  back,
  tabs,
  actions,
}: {
  title: string;
  back?: { to: string; label: string };
  tabs?: ReactNode;
  actions?: { primary?: ReactNode; secondary?: UiAction[] };
}) {
  return (
    <div data-page-header="" className="relative z-20 flex h-16 shrink-0 items-center gap-3 px-4 border-b border-transparent data-[scrolled]:border-line-subtle">
      <div className="flex h-full min-w-0 flex-1 items-center gap-4">
        {back ? (
          <>
            <Link to={back.to} className={QUIET}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {back.label}
            </Link>
            <h1 className="sr-only">{title}</h1>
          </>
        ) : (
          <h1 className={`${TYPE.title} truncate`}>{title}</h1>
        )}
        {tabs ? <div className="h-full min-w-0 flex-1">{tabs}</div> : null}
      </div>
      {actions ? <ActionCluster primary={actions.primary} secondary={actions.secondary} /> : null}
    </div>
  );
}

const WIDTH = { full: '', reading: 'max-w-5xl', form: 'max-w-3xl' } as const;

/** The scrolling content under a PageHeader (spec §6.2): `full` for lists,
 *  boards and detail pages, `reading` for single-column lists, `form` for
 *  builders outside Settings. `pb-8`, so the last card never touches the
 *  viewport. A 1px sentinel at the top tells the header when content has
 *  scrolled under it. */
export function PageBody({ width = 'full', children }: { width?: keyof typeof WIDTH; children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      const header = document.querySelector('[data-page-header]');
      if (!header) return;
      if (entry.isIntersecting) header.removeAttribute('data-scrolled');
      else header.setAttribute('data-scrolled', '');
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={`flex w-full flex-col gap-4 px-4 pb-8 ${WIDTH[width]}`.trim()}>
      <div ref={sentinel} aria-hidden="true" data-part="scroll-sentinel" className="-mb-4 h-px" />
      {children}
    </div>
  );
}
```

`src/components/ui/SettingsFrame.tsx`:

```tsx
import { useId, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardFooter } from './Card';
import { PRIMARY } from './styles';
import { TYPE } from './type';

/** Every /settings page's frame (UI foundations spec §6.3): the h1 (its
 *  text equals the nav label), a muted intro, an optional action on the
 *  heading row, then sections. Always full width up to its cap, so it never
 *  re-centres. `wide` for Connections, Attributes, AI usage, AI skills and
 *  Members. Account settings keep their own layout this round. */
export function SettingsFrame({
  title,
  intro,
  width = 'default',
  action,
  children,
}: {
  title: string;
  intro?: ReactNode;
  width?: 'default' | 'wide';
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`flex w-full flex-col gap-6 px-4 py-6 sm:px-6 ${width === 'wide' ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className={TYPE.display}>{title}</h1>
          {intro ? <p className={`${TYPE.bodyMuted} max-w-[68ch]`}>{intro}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A titled section: the heading outside, the rows inside one card,
 *  divided. A one-section form puts its Save in `footer`. */
export function SettingsSection({ title, description, footer, children }: { title: string; description?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className={TYPE.title}>
          {title}
        </h2>
        {description ? <p className={TYPE.bodyMuted}>{description}</p> : null}
      </div>
      <Card as="div" pad="none">
        <div className="divide-y divide-line-subtle">{children}</div>
        {footer ? <CardFooter>{footer}</CardFooter> : null}
      </Card>
    </section>
  );
}

/** One setting: label and hint on the left from sm, the control on the
 *  right. Pass `htmlFor` when the control is a single input or select. */
export function SettingsRow({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center">
      <div className="flex flex-col gap-0.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={TYPE.label}>
            {label}
          </label>
        ) : (
          <p className={TYPE.label}>{label}</p>
        )}
        {hint ? <p className={TYPE.meta}>{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Save for a form that spans sections: sticky at the bottom of the page
 *  while there are unsaved changes, never a button floating on the canvas. */
export function SettingsSaveBar({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-base py-3">
      <button type="button" onClick={onSave} disabled={saving} aria-busy={saving || undefined} className={PRIMARY}>
        {saving ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
        Save changes
      </button>
    </div>
  );
}
```

Append to `src/components/ui/index.ts`:

```ts
export * from './PageHeader';
export * from './SettingsFrame';
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx src/components/ui/SettingsFrame.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PageHeader.tsx src/components/ui/SettingsFrame.tsx src/components/ui/PageHeader.test.tsx src/components/ui/SettingsFrame.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): add PageHeader, PageBody and the settings frame primitives

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The `/__ui` gallery

**Files:**
- Create: `src/pages/dev/UiGallery.tsx`
- Test: `src/pages/dev/UiGallery.test.tsx`
- Modify: `src/App.tsx` (import line, a lazy const, one route)

**Interfaces:**
- Consumes: everything from `src/components/ui` (barrel).
- Produces: `UiGallery()` (named export), routed at `/__ui` only when `import.meta.env.DEV` (outside `ProtectedRoute`, no data). Task 16 screenshots it.

- [ ] **Step 1: Write the failing test**

`src/pages/dev/UiGallery.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { store } from '../../store';
import { resetViewport, setViewport } from '../../test/viewport';
import { UiGallery } from './UiGallery';

const SECTIONS = ['Type and figures', 'Buttons', 'Card', 'Lists', 'Table', 'Tiles', 'Badges', 'Controls', 'Toolbar', 'States', 'Settings frame'];

describe('the /__ui gallery (UI foundations spec §1, §9.3)', () => {
  afterEach(() => {
    resetViewport();
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('shows every primitive section, with no card inside a card', () => {
    const error = vi.spyOn(console, 'error');
    setViewport(1440);
    render(
      <MemoryRouter>
        <UiGallery />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'UI primitives' })).toBeInTheDocument();
    for (const title of SECTIONS) expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(error).not.toHaveBeenCalledWith('Card inside Card');
  });

  it('shows the states: loading, empty, error, disabled and pressed', () => {
    setViewport(1440);
    render(
      <MemoryRouter>
        <UiGallery />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('status').some((node) => node.getAttribute('aria-busy') === 'true')).toBe(true);
    expect(screen.getByText('No organizations yet')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load organizations.');
    expect(screen.getAllByRole('button', { name: 'Save' }).some((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('switch', { name: 'Disabled switch' })).toBeDisabled();
  });

  it('is live: a tab, a segment and a filter tile all answer', async () => {
    setViewport(1440);
    render(
      <MemoryRouter>
        <UiGallery />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Lists' }));
    expect(screen.getByRole('tab', { name: 'Lists' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(screen.getByRole('group', { name: 'Scope' })).getByRole('button', { name: 'Company' }));
    expect(within(screen.getByRole('group', { name: 'Scope' })).getByRole('button', { name: 'Company' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /^At risk/ }));
    expect(screen.getByRole('button', { name: /^At risk/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('is routed at /__ui in development, outside the signed-in shell', async () => {
    setViewport(1440);
    window.history.pushState({}, '', '/__ui');
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'UI primitives' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/dev/UiGallery.test.tsx`
Expected: FAIL, no module.

- [ ] **Step 3: Write the gallery**

`src/pages/dev/UiGallery.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { Inbox, Loader2, Pencil } from 'lucide-react';
import {
  Badge,
  BUTTON,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardSection,
  CODE,
  DANGER,
  EmptyState,
  ErrorState,
  FilterChip,
  FilterChipRow,
  HealthBadge,
  ICON_BUTTON,
  INPUT,
  ListCard,
  ListHeaderRow,
  ListRow,
  LoadingState,
  NUM,
  OVERLAY,
  PageBody,
  PageHeader,
  PRIMARY,
  QUIET,
  RemovableChip,
  SearchInput,
  SegmentedControl,
  Select,
  SentimentBadge,
  SettingsFrame,
  SettingsRow,
  SettingsSaveBar,
  SettingsSection,
  Switch,
  TABLE,
  Tabs,
  TD,
  TD_NUM,
  TH,
  Tile,
  tileRow,
  Toolbar,
  TYPE,
} from '../../components/ui';

// The dev-only gallery at /__ui (UI foundations spec §1, §9.3): every
// primitive in every state, on the real canvas, in both themes. It is the
// first page screenshotted in every UI PR. Registered only when
// import.meta.env.DEV, so it never ships.

const noop = () => {};
const COLUMNS = 'sm:grid-cols-[minmax(12rem,1fr)_6rem_7rem_auto]';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={TYPE.title}>{title}</h2>
      {children}
    </section>
  );
}

export function UiGallery() {
  const [view, setView] = useState<'all' | 'lists' | 'controls'>('all');
  const [scope, setScope] = useState<'me' | 'team' | 'company'>('me');
  const [windowDays, setWindowDays] = useState<'30d' | '90d'>('30d');
  const [open, setOpen] = useState(true);
  const [closed, setClosed] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'arr'>('name');
  const [digest, setDigest] = useState(true);
  const [filter, setFilter] = useState<'all' | 'risk'>('all');
  const [selected, setSelected] = useState('uber');

  return (
    <div className="min-h-[100dvh] rv-canvas">
      <PageHeader
        title="UI primitives"
        tabs={
          <Tabs
            label="Gallery views"
            value={view}
            onChange={setView}
            items={[
              { key: 'all', label: 'All', count: 13 },
              { key: 'lists', label: 'Lists' },
              { key: 'controls', label: 'Controls' },
            ]}
          />
        }
        actions={{
          primary: (
            <button type="button" className={PRIMARY}>
              New item
            </button>
          ),
          secondary: [
            { key: 'export', label: 'Export', onSelect: noop },
            { key: 'import', label: 'Import', onSelect: noop },
            { key: 'archive', label: 'Archive', onSelect: noop, danger: true },
          ],
        }}
      />
      <main>
        <PageBody>
          <Section title="Type and figures">
            <Card>
              <p className={TYPE.display}>Display, 22px</p>
              <p className={TYPE.title}>Title, 15px</p>
              <p className={TYPE.body}>
                Body, 13px. Closes in <span className={NUM}>17d</span>, worth <span className={NUM}>$175K</span>.
              </p>
              <p className={TYPE.bodyMuted}>Muted body, for intros and descriptions.</p>
              <p className={TYPE.meta}>Meta, 11px · Carl CSM · Renewal</p>
              <p className={TYPE.eyebrow}>Eyebrow, tile labels only</p>
              <p className={TYPE.label}>Label, above a field</p>
              <p className={TYPE.body}>
                API key <span className={CODE}>rv_live_4f2a9c</span>
              </p>
              <p className={`${TYPE.body} ${NUM}`}>$1,111 and $8,888 line up.</p>
            </Card>
          </Section>

          <Section title="Buttons">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={PRIMARY}>
                  Save
                </button>
                <button type="button" className={BUTTON}>
                  Export
                </button>
                <button type="button" className={QUIET}>
                  Show more
                </button>
                <button type="button" className={DANGER}>
                  Delete
                </button>
                <button type="button" aria-label="Edit" className={ICON_BUTTON}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" disabled aria-busy="true" className={PRIMARY}>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  Saving
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled className={PRIMARY}>
                  Save
                </button>
                <button type="button" disabled className={BUTTON}>
                  Export
                </button>
                <button type="button" disabled className={QUIET}>
                  Show more
                </button>
                <button type="button" disabled className={DANGER}>
                  Delete
                </button>
                <button type="button" disabled aria-label="Edit, disabled" className={ICON_BUTTON}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </Card>
          </Section>

          <Section title="Card">
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card pad="none">
                <CardHeader
                  title="Renewals"
                  meta="4 · $245K"
                  action={
                    <button type="button" aria-label="Edit renewals" className={ICON_BUTTON}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  }
                />
                <CardBody>
                  <p className={TYPE.body}>A card body. Group inside with sections, never a second card.</p>
                </CardBody>
                <CardSection>
                  <p className={TYPE.bodyMuted}>A divided section in the same card.</p>
                </CardSection>
                <CardFooter>
                  <button type="button" className={BUTTON}>
                    Cancel
                  </button>
                  <button type="button" className={PRIMARY}>
                    Save
                  </button>
                </CardFooter>
              </Card>
              <div className={`${OVERLAY} p-4`}>
                <p className={TYPE.title}>Overlay</p>
                <p className={TYPE.bodyMuted}>Menus, popovers, sheets and modals: the only shadow.</p>
              </div>
            </div>
          </Section>

          <Section title="Lists">
            <ListCard label="Organizations" header={<CardHeader title="Average health" meta="3 · $245K" />}>
              <ListRow
                title="Uber"
                meta="Carl CSM · Renewal in 17d"
                href="/__ui"
                selected={selected === 'uber'}
                trailing={<HealthBadge band="poor">Risk 55</HealthBadge>}
                actions={
                  <button type="button" className={QUIET} onClick={() => setSelected('uber')}>
                    Ask about this
                  </button>
                }
              />
              <ListRow title="Stripe" meta="Alice Admin · Expansion" onSelect={() => setSelected('stripe')} selected={selected === 'stripe'} trailing={<Badge>Shared</Badge>} />
              <ListRow title="A very long organisation name that has to truncate before it pushes the badge out of the row" meta="Read only, opens nothing" />
            </ListCard>
            <ListCard label="Compact" header={<CardHeader title="Compact density" />}>
              <ListRow title="Plan kickoff" meta="Due 3 Oct" density="compact" onSelect={noop} />
              <ListRow title="Exec sponsor call" meta="Due 5 Oct" density="compact" onSelect={noop} />
            </ListCard>
            <ListCard label="Opportunities" header={<ListHeaderRow columns={COLUMNS} labels={['Name', 'MRR', 'Stage', '']} />}>
              {[
                ['Expansion', '$2.0K', 'Proposal'],
                ['Upsell', '$12.5K', 'Discovery'],
              ].map(([name, mrr, stage]) => (
                <ListRow
                  key={name}
                  title={name}
                  meta="Pizza Hut"
                  columns={COLUMNS}
                  onSelect={noop}
                  cells={[
                    <span key="mrr" className={`${TYPE.body} ${NUM}`}>
                      {mrr}
                    </span>,
                    <span key="stage" className={TYPE.bodyMuted}>
                      {stage}
                    </span>,
                  ]}
                />
              ))}
            </ListCard>
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <ListCard label="Loading" header={<CardHeader title="Loading" />} state={<LoadingState label="Loading organizations" />} />
              <ListCard
                label="Empty"
                header={<CardHeader title="Empty" />}
                state={<EmptyState title="No organizations yet" detail="Add one, or import a CSV." icon={Inbox} action={<button type="button" className={BUTTON}>Add organization</button>} />}
              />
              <ListCard label="Error" header={<CardHeader title="Error" />} state={<ErrorState message="Could not load organizations." onRetry={noop} />} />
            </div>
            <Card pad="none">
              <EmptyState title="No open plans." size="inline" />
            </Card>
          </Section>

          <Section title="Table">
            <Card pad="none" className="overflow-x-auto">
              <table className={TABLE}>
                <thead>
                  <tr className="border-b border-line-subtle">
                    <th className={TH}>Member</th>
                    <th className={TH}>Role</th>
                    <th className={`${TH} text-right`}>Seats</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  <tr>
                    <td className={TD}>Alice Admin</td>
                    <td className={TD}>Admin</td>
                    <td className={TD_NUM}>3</td>
                  </tr>
                  <tr>
                    <td className={TD}>Carl CSM</td>
                    <td className={TD}>CSM</td>
                    <td className={TD_NUM}>12</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </Section>

          <Section title="Tiles">
            <div className={tileRow(4)}>
              <Tile label="Accounts" value="128" meta="$4.2M ARR" />
              <Tile label="Health" value="72" meta="Average across the book">
                <span className={`flex justify-between ${TYPE.meta}`}>
                  Good <span className={NUM}>40</span>
                </span>
                <span className={`flex justify-between ${TYPE.meta}`}>
                  Poor <span className={NUM}>8</span>
                </span>
              </Tile>
              <Tile label="All" value="47" pressed={filter === 'all'} onPress={() => setFilter('all')} />
              <Tile label="At risk" value="9" meta="Risk at or above 50" pressed={filter === 'risk'} onPress={() => setFilter('risk')} />
            </div>
            <div className={tileRow(2)}>
              <Tile
                label="Window"
                value="$688.6K"
                action={
                  <SegmentedControl
                    label="Window"
                    size="sm"
                    value={windowDays}
                    onChange={setWindowDays}
                    options={[
                      { value: '30d', label: '30d' },
                      { value: '90d', label: '90d' },
                    ]}
                  />
                }
              />
              <Tile label="No meta" value="3" />
            </div>
          </Section>

          <Section title="Badges">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Neutral</Badge>
                <Badge tone="success">Success</Badge>
                <Badge tone="warning">Warning</Badge>
                <Badge tone="danger">Danger</Badge>
                <Badge tone="info">Info</Badge>
                <Badge tone="danger" dot>
                  Overdue
                </Badge>
                <HealthBadge band="good" />
                <HealthBadge band="average" />
                <HealthBadge band="poor" />
                <SentimentBadge value="positive" />
                <SentimentBadge value="neutral" />
                <SentimentBadge value="negative" />
              </div>
            </Card>
          </Section>

          <Section title="Controls">
            <Card className="flex flex-col gap-4">
              <Tabs
                label="Record views"
                value="list"
                items={[
                  { key: 'list', label: 'List', to: '/__ui' },
                  { key: 'board', label: 'Board', to: '/__ui' },
                ]}
              />
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  label="Scope"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'me', label: 'Me' },
                    { value: 'team', label: 'My team' },
                    { value: 'company', label: 'Company' },
                  ]}
                />
                <Switch checked={digest} onChange={setDigest}>
                  Email digest
                </Switch>
                <Switch checked={false} onChange={noop} disabled>
                  Disabled switch
                </Switch>
              </div>
              <FilterChipRow label="Status">
                <FilterChip label="Open" pressed={open} onToggle={() => setOpen((value) => !value)} />
                <FilterChip label="Closed" pressed={closed} onToggle={() => setClosed((value) => !value)} />
                <RemovableChip label="Owner: Carl" onRemove={noop} />
              </FilterChipRow>
              <SearchInput label="Search organizations by name or owner" placeholder="Search organizations" value={query} onChange={setQuery} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Sort by"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'name', label: 'Name' },
                    { value: 'arr', label: 'ARR' },
                  ]}
                />
                <Select
                  label="Sort by"
                  labelPosition="inline"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'name', label: 'Name' },
                    { value: 'arr', label: 'ARR' },
                  ]}
                />
                <Select label="Owner" labelPosition="hidden" value="carl" onChange={noop} options={[{ value: 'carl', label: 'Carl CSM' }]} />
                <Select label="Disabled select" value="carl" onChange={noop} disabled options={[{ value: 'carl', label: 'Carl CSM' }]} />
                <label className="flex flex-col gap-1.5">
                  <span className={TYPE.label}>Name</span>
                  <input className={INPUT} placeholder="Acme Inc" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={TYPE.label}>Disabled input</span>
                  <input className={INPUT} disabled value="Locked" readOnly />
                </label>
              </div>
            </Card>
          </Section>

          <Section title="Toolbar">
            <Toolbar
              lead={
                <SegmentedControl
                  label="Kind"
                  value="opportunities"
                  onChange={noop}
                  options={[
                    { value: 'opportunities', label: 'Opportunities' },
                    { value: 'risks', label: 'Risks' },
                  ]}
                />
              }
              search={<SearchInput label="Search opportunities" placeholder="Search opportunities" value={query} onChange={setQuery} />}
              filters={<FilterChip label="Mine" pressed={open} onToggle={() => setOpen((value) => !value)} />}
              actions={{
                primary: (
                  <button type="button" className={PRIMARY}>
                    New opportunity
                  </button>
                ),
                secondary: [
                  { key: 'export', label: 'Export', onSelect: noop },
                  { key: 'columns', label: 'Columns', onSelect: noop },
                  { key: 'import', label: 'Import', onSelect: noop },
                ],
              }}
              count="14 opportunities"
            />
          </Section>

          <Section title="States">
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card pad="none">
                <LoadingState label="Loading the brief" variant="block" />
              </Card>
              <Card pad="none">
                <LoadingState label="Loading tiles" variant="tiles" count={4} />
              </Card>
            </div>
          </Section>

          <Section title="Settings frame">
            <SettingsFrame title="General" intro="The workspace's name and owner." action={<button type="button" className={BUTTON}>Transfer ownership</button>}>
              <SettingsSection title="Workspace" description="What everyone in the workspace sees.">
                <SettingsRow label="Name" hint="Shown in the sidebar." htmlFor="ui-gallery-name">
                  <input id="ui-gallery-name" className={INPUT} defaultValue="Acme Inc" />
                </SettingsRow>
                <SettingsRow label="Slug">
                  <span className={`${TYPE.body} ${CODE}`}>acme-inc</span>
                </SettingsRow>
              </SettingsSection>
              <SettingsSaveBar dirty saving={false} onSave={noop} />
            </SettingsFrame>
          </Section>
        </PageBody>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Register the route**

In `src/App.tsx`:
- change `import { useEffect } from 'react';` to `import { lazy, Suspense, useEffect } from 'react';`
- after `import { TemplatesPage } from './pages/plans/TemplatesPage';` add:

```tsx

// The primitives gallery (UI foundations spec §1): development builds only,
// so the import and the route both drop out of production.
const UiGallery = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiGallery').then((module) => ({ default: module.UiGallery }))) : null;
```

- after `<Route path="/u/:token" element={<Unsubscribe />} />` add:

```tsx

        {UiGallery ? (
          <Route
            path="/__ui"
            element={
              <Suspense fallback={null}>
                <UiGallery />
              </Suspense>
            }
          />
        ) : null}
```

- [ ] **Step 5: Run the test and check the production bundle drops it**

Run: `npx vitest run src/pages/dev/UiGallery.test.tsx`
Expected: PASS (4 tests).
Run: `npm run build && grep -l "UI primitives" dist/assets/*.js`
Expected: build succeeds; grep prints nothing (the gallery is not in the production bundle).

- [ ] **Step 6: Commit**

```bash
git add src/pages/dev/UiGallery.tsx src/pages/dev/UiGallery.test.tsx src/App.tsx
git commit -m "feat(ui): add the dev-only /__ui gallery of every primitive in every state

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: House rules for the primitives and the whole-app ratchet

**Files:**
- Modify: `src/test/houseRules.ts` (append), `src/test/houseRules.test.ts`
- Create: `src/components/ui/houseRules.test.ts`, `src/test/uiRatchet.test.ts`

**Interfaces:**
- Produces (from `src/test/houseRules.ts`): `cardOffenders(source): string[]`, `sizeOffenceCount(source): number`, `iconButtonsWithoutLabel(source): string[]`, regexes `CARD_SHADOW`, `OPACITY_DISABLED`, `MONO_FONT`, `BOLD`, `HEAVY_WEIGHT`, `UPPERCASE` (all global: use with `match`/`matchAll`, never `.test`), `UI_OFFENCES`, `UiOffence`, `uiOffences(source): Record<UiOffence, number>`, `UiRule`, `uiRuleSuite(title, files, exempt?: Partial<Record<UiRule, string[]>>)`. Surface PRs call `uiRuleSuite` on each migrated folder and lower the ratchet baselines.

- [ ] **Step 1: Write the failing scanner tests**

In `src/test/houseRules.test.ts`, replace the import line with:

```ts
import { cardOffenders, EMOJI, H_SCREEN, HEAVY_WEIGHT, iconButtonsWithoutLabel, RAW, sizeOffenceCount, sizeOffenders, uiOffences, UPPERCASE } from './houseRules';
```

and append:

```ts
describe('UI foundations scanners (spec §9.4)', () => {
  it('finds card markup written by hand and the legacy rv-card, not controls, tints or glass', () => {
    expect(cardOffenders('<div className="rounded-xl border border-line bg-surface p-4">')).toHaveLength(1);
    expect(cardOffenders('<div className="bg-surface rounded-lg shadow-sm p-4">')).toHaveLength(1);
    expect(cardOffenders('<div className="rv-card p-4">')).toEqual(['rv-card']);
    expect(cardOffenders('<div className="rv-card-glass p-4">')).toEqual([]);
    expect(cardOffenders('<button className="min-h-11 rounded-lg border border-line bg-surface px-3">')).toEqual([]);
    expect(cardOffenders('<div className="rounded-xl bg-subtle p-4">')).toEqual([]);
    expect(cardOffenders('<div className="rounded-xl border-line bg-surface">')).toEqual([]);
  });

  it('counts each off-scale size, named sizes included', () => {
    expect(sizeOffenceCount('text-sm text-sm text-[12px] text-[13px] text-[0.8rem]')).toBe(4);
  });

  it('counts every offence the ratchet tracks', () => {
    expect(uiOffences('text-[12px] text-sm text-[13px] shadow-sm disabled:opacity-50 font-mono-brand font-bold font-semibold')).toEqual({
      sizes: 2,
      cards: 0,
      shadows: 1,
      opacityDisabled: 1,
      mono: 1,
      bold: 1,
    });
  });

  it('flags an ICON_BUTTON with no aria-label', () => {
    expect(iconButtonsWithoutLabel('<button type="button" className={ICON_BUTTON}>x</button>')).toHaveLength(1);
    expect(iconButtonsWithoutLabel('<button type="button" aria-label="Close" className={ICON_BUTTON}>x</button>')).toEqual([]);
    expect(iconButtonsWithoutLabel('<button type="button" className={`${ICON_BUTTON} absolute`} aria-label="Clear search">x</button>')).toEqual([]);
    expect(iconButtonsWithoutLabel('<button type="button" className={BUTTON}>Save</button>')).toEqual([]);
  });

  it('knows the heavy weights and a real uppercase class', () => {
    expect('font-bold font-medium font-black font-semibold'.match(HEAVY_WEIGHT)).toEqual(['font-bold', 'font-medium', 'font-black']);
    expect('uppercase tracking-wider'.match(UPPERCASE)).toEqual(['uppercase']);
    expect('data-uppercase normal-case'.match(UPPERCASE)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/test/houseRules.test.ts`
Expected: FAIL (the new functions are not exported).

- [ ] **Step 3: Append the scanners and the suite to `src/test/houseRules.ts`**

```ts
// ---------------------------------------------------------------------------
// UI foundations (spec 2026-10-09 §9.4): the rules the primitives make
// possible. `uiRuleSuite` applies them to a folder that has moved onto the
// primitives; `uiOffences` counts them for the whole-app ratchet
// (src/test/uiRatchet.test.ts) until a count reaches zero.

/** Every quoted class string in a source: "…", '…' and `…`. */
const CLASS_STRING = /`[^`]*`|"[^"\n]*"|'[^'\n]*'/g;
/** A control's height marks a string as a button or input, not a card. */
const CONTROL_HEIGHT = /(?<![\w-])(?:min-h-(?:6|8|9|11)|h-(?:6|8|9|10|11))(?![\w-])/;
const SURFACE = /(?<![\w-])bg-surface(?![\w-])/;
const CARD_RADIUS = /(?<![\w-])rounded-(?:lg|xl|2xl)(?![\w-])/;
const EDGE = /(?<![\w-])(?:border|shadow(?:-sm|-md|-lg)?)(?![\w-])/;
const RV_CARD = /(?<![\w-])rv-card(?![\w-])/g;

export const CARD_SHADOW = /(?<![\w-])shadow-(?:sm|md)(?![\w-])/g;
export const OPACITY_DISABLED = /disabled:opacity-/g;
export const MONO_FONT = /(?<![\w-])font-mono-brand(?![\w-])/g;
export const BOLD = /(?<![\w-])font-bold(?![\w-])/g;
export const HEAVY_WEIGHT = /(?<![\w-])font-(?:bold|medium|black)(?![\w-])/g;
export const UPPERCASE = /(?<![\w-])uppercase(?![\w-])/g;
const NAMED_SIZE_ALL = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/g;

/** Card markup written by hand: a class string holding `bg-surface`, a
 *  `rounded-lg|xl|2xl` and a `border` or shadow (and no control height), or
 *  the legacy `rv-card` class (`rv-card-glass` is the Ask rail's, allowed). */
export function cardOffenders(source: string): string[] {
  const offenders: string[] = [];
  for (const [value] of source.matchAll(CLASS_STRING)) {
    if (SURFACE.test(value) && CARD_RADIUS.test(value) && EDGE.test(value) && !CONTROL_HEIGHT.test(value)) offenders.push(value.slice(0, 90));
  }
  offenders.push(...Array.from(source.matchAll(RV_CARD), () => 'rv-card'));
  return offenders;
}

/** Every off-scale type size, counted one by one (sizeOffenders reports a
 *  named size once per file). */
export function sizeOffenceCount(source: string): number {
  let count = 0;
  for (const match of source.matchAll(PX_SIZE)) if (!['11', '13', '15', '22'].includes(match[1])) count++;
  count += [...source.matchAll(NON_PX_SIZE)].length;
  count += [...source.matchAll(NAMED_SIZE_ALL)].length;
  return count;
}

/** A `<button>` styled with ICON_BUTTON and no aria-label: an icon alone
 *  names nothing (spec §5.1). */
export function iconButtonsWithoutLabel(source: string): string[] {
  return controlTags(source)
    .filter(({ tag, attrs }) => tag === 'button' && /\bICON_BUTTON\b/.test(classExpression(attrs) ?? '') && !/\baria-label(?:ledby)?=/.test(attrs))
    .map(({ attrs }) => `<button ${attrs.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
}

export const UI_OFFENCES = ['sizes', 'cards', 'shadows', 'opacityDisabled', 'mono', 'bold'] as const;
export type UiOffence = (typeof UI_OFFENCES)[number];

const countOf = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length;

/** What the ratchet counts in one source. */
export function uiOffences(source: string): Record<UiOffence, number> {
  return {
    sizes: sizeOffenceCount(source),
    cards: cardOffenders(source).length,
    shadows: countOf(source, CARD_SHADOW),
    opacityDisabled: countOf(source, OPACITY_DISABLED),
    mono: countOf(source, MONO_FONT),
    bold: countOf(source, BOLD),
  };
}

export type UiRule = 'cards' | 'shadows' | 'opacityDisabled' | 'mono' | 'weights' | 'uppercase' | 'iconLabels';

/** The foundations rules over a migrated folder (spec §9.4). `exempt` names
 *  files a rule skips: the ui folder owns card markup, `ui/styles.ts` owns
 *  `CODE`, `ui/type.ts` owns the eyebrow's uppercase. Tests are skipped. */
export function uiRuleSuite(title: string, files: Record<string, string>, exempt: Partial<Record<UiRule, string[]>> = {}): void {
  const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));
  const offenders = (rule: UiRule, find: (source: string) => string[]) => {
    const found: string[] = [];
    for (const [file, source] of sources) {
      if (exempt[rule]?.includes(file)) continue;
      for (const bad of find(source)) found.push(`${file}: ${bad}`);
    }
    return found;
  };
  const matches = (pattern: RegExp) => (source: string) => source.match(pattern) ?? [];

  describe(title, () => {
    it('has sources to check', () => expect(sources.length).toBeGreaterThan(0));

    it('writes no card markup by hand (Card, ListCard and Tile own it)', () => {
      expect(offenders('cards', cardOffenders)).toEqual([]);
    });

    it('puts no shadow on a card (shadow-lg is for overlays)', () => {
      expect(offenders('shadows', matches(CARD_SHADOW))).toEqual([]);
    });

    it('never dims a disabled control with opacity', () => {
      expect(offenders('opacityDisabled', matches(OPACITY_DISABLED))).toEqual([]);
    });

    it('sets figures in the body font: DM Mono only through CODE', () => {
      expect(offenders('mono', matches(MONO_FONT))).toEqual([]);
    });

    it('uses only the regular and semibold weights', () => {
      expect(offenders('weights', matches(HEAVY_WEIGHT))).toEqual([]);
    });

    it('keeps uppercase to the eyebrow', () => {
      expect(offenders('uppercase', matches(UPPERCASE))).toEqual([]);
    });

    it('names every icon button', () => {
      expect(offenders('iconLabels', iconButtonsWithoutLabel)).toEqual([]);
    });
  });
}
```

- [ ] **Step 4: Run the scanner tests**

Run: `npx vitest run src/test/houseRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply the rules to the ui folder and the gallery**

`src/components/ui/houseRules.test.ts`:

```ts
import { houseRuleSuite, uiRuleSuite } from '../../test/houseRules';

// The ui folder and the /__ui gallery hold every house rule and every
// foundations rule (UI foundations spec §9.4). The primitives own card
// markup; styles.ts owns CODE (DM Mono); type.ts owns the eyebrow's
// uppercase.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/dev/UiGallery.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const primitives = Object.keys(files).filter((file) => file.startsWith('./'));

houseRuleSuite('ui primitives: house rules', files);
uiRuleSuite('ui primitives: foundations rules', files, {
  cards: primitives,
  shadows: primitives,
  mono: ['./styles.ts'],
  uppercase: ['./type.ts'],
});
```

Run: `npx vitest run src/components/ui/houseRules.test.ts`
Expected: PASS. A failure names the file and class; fix the primitive, never widen `exempt`.

- [ ] **Step 6: Write the ratchet and record the baselines**

`src/test/uiRatchet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { UI_OFFENCES, uiOffences, type UiOffence } from './houseRules';

// The whole-app ratchet (UI foundations spec §9.4). Applying the
// foundations rules to every file at once would fail on day one, so this
// counts each offence across every non-test .tsx under src/ and holds each
// count at or below its baseline. Every surface PR lowers the numbers for
// its folders and writes the new, lower baselines here; never raise one.
// When a count reaches zero, its rule moves into uiRuleSuite for the whole
// app and leaves this list.
//
// Exempt, by name: the ui primitives themselves (they own card markup and
// run uiRuleSuite), and for type sizes only the Persuade-mode pages whose
// font-display headings keep their 24/26/34px (spec §2).

const files = import.meta.glob(['../**/*.tsx', '!../**/*.test.tsx', '!../components/ui/**'], {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

const SIZE_EXEMPT = ['../pages/auth/Login.tsx', '../pages/auth/WorkspaceSetup.tsx', '../pages/copilot/HomeView.tsx'];

/** Recorded by the foundations PR. Lower them as you fix; never raise them. */
const BASELINE: Record<UiOffence, number> = {
  sizes: 1110,
  cards: 303,
  shadows: 197,
  opacityDisabled: 110,
  mono: 107,
  bold: 662,
};

const perFile = Object.entries(files).map(([file, source]) => {
  const counts = uiOffences(source);
  if (SIZE_EXEMPT.includes(file)) counts.sizes = 0;
  return [file, counts] as const;
});

const totals = Object.fromEntries(UI_OFFENCES.map((rule) => [rule, perFile.reduce((sum, [, counts]) => sum + counts[rule], 0)])) as Record<UiOffence, number>;

/** The ten files with the most offences of one kind, for the failure message. */
function worst(rule: UiOffence): string {
  return perFile
    .filter(([, counts]) => counts[rule] > 0)
    .sort((a, b) => b[1][rule] - a[1][rule])
    .slice(0, 10)
    .map(([file, counts]) => `${file} ${counts[rule]}`)
    .join(', ');
}

describe('UI ratchet (UI foundations spec §9.4)', () => {
  it('reads every .tsx source outside the primitives', () => {
    expect(perFile.length).toBeGreaterThan(400);
    expect(perFile.some(([file]) => file.startsWith('../components/ui/'))).toBe(false);
  });

  it.each(UI_OFFENCES)('has no more %s offences than the baseline', (rule) => {
    expect(totals[rule], `${rule} went up; the worst files: ${worst(rule)}`).toBeLessThanOrEqual(BASELINE[rule]);
  });

  it('keeps every baseline tight: when a count drops, lower its baseline to match', () => {
    expect(totals).toEqual(BASELINE);
  });
});
```

Run: `npx vitest run src/test/uiRatchet.test.ts`
Expected: PASS with the numbers above, measured on this branch after Tasks 1 to 13 (Panel's hand-written card and `switchParts.tsx`'s `disabled:opacity-50` are gone, so cards is 303 and opacityDisabled 110). If the tight-baseline test fails, its diff shows the measured totals: copy those into `BASELINE` only if the difference is explained by this branch's own changes (say which in the commit body); otherwise investigate.

- [ ] **Step 7: Commit**

```bash
git add src/test/houseRules.ts src/test/houseRules.test.ts src/components/ui/houseRules.test.ts src/test/uiRatchet.test.ts
git commit -m "test(ui): add the foundations house rules and the whole-app UI ratchet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The revenact-design skill and the two frontend product docs

**Files:**
- Modify: `.claude/skills/revenact-design/SKILL.md` (the real file behind the monorepo symlink)
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`

No code, no test: the check is a grep in Step 4.

- [ ] **Step 1: Update the skill (spec §10)**

In `.claude/skills/revenact-design/SKILL.md`, §1 table:

Replace the **Fonts** row with:

```markdown
| Fonts | `index.html` loads **DM Serif Display** (display, italic allowed) and **DM Mono** (IDs and code only). `.font-display` and `.font-mono-brand` in `src/index.css` apply them. The body is the **system stack**, whose tabular figures carry every number: figures use `NUM` (`tabular-nums`, body font), never DM Mono (owner, 2026-10-09). Lato is not loaded; moving the body to Lato is its own decision, after checking that `tabular-nums` aligns a column of `$1,111` / `$8,888` in it. Do not load any other font. | `index.html`, `src/index.css`, `src/components/ui/styles.ts` |
```

Add a row after **Fonts**:

```markdown
| Primitives | Card, list, tile, state, tab, segment, chip, search, select, switch, toolbar, badge, page-header and settings-frame markup is written only in `src/components/ui/` (spec 2026-10-09-ui-foundations-design). Pages compose those components and the constants in `ui/styles.ts` and `ui/type.ts`; `/__ui` (development only) shows every one in every state and is the first screenshot of every UI PR (`scripts/ui-shots.mjs`). `src/test/uiRatchet.test.ts` holds the remaining hand-written markup at or below its baseline; surface PRs lower it. | `src/components/ui/` |
```

Replace the **Radius** and **Elevation** rows with:

```markdown
| Radius | Cards `rounded-xl`; controls `rounded-lg` (segments inside `rounded-md`); `rounded-full` for pills, chips and avatars. Do not introduce `rounded-2xl`+ or `rounded-none` without a documented reason. | `src/components/ui/` |
| Elevation | Cards are flat: `rounded-xl border border-line bg-surface`, no shadow (`Card`). `shadow-lg` only on overlays (`OVERLAY`: menus, popovers, sheets, modals). No card inside a card: `Card` logs `Card inside Card` in development. | `src/components/ui/Card.tsx` |
```

In §3, replace the **Fonts** bullet with:

```markdown
- **Fonts:** several skills push Geist/Satoshi/Outfit or ban serif. Overruled; the house fonts are DM Serif Display, DM Mono (IDs and code only) and the system body stack. `impeccable`'s "no system default" rule is overruled this round by the owner (2026-10-09): the system stack has verified tabular figures, which every number now depends on.
```

In §4, replace item 3 with:

```markdown
3. Type: four sizes only, 11/13/15/22 px, with roles in `src/components/ui/type.ts` (`TYPE.display`, `title`, `body`, `bodyMuted`, `meta`, `eyebrow`, `label`); weights 400 and 600 only. Every figure in the body font with `tabular-nums` (`NUM`); DM Mono (`CODE`) only for IDs, keys, endpoints and raw JSON. Body line length capped around 65-75ch in reading surfaces.
```

In §4 item 4, after "and to the Pipelines list and board (spec 2026-09-30-pipelines-redesign-design §3)" insert ", and to Contacts (`/contacts/*`) and Brain (`/brain/*`) by the owner's answer of 2026-10-09". At the end of item 4 add: "Account settings (`/account-settings/*`, `/profile`) keep their `rv-card` / `rv-pill` styling and right rail, untouched until their own round."

Add a new item after item 11:

```markdown
12. Density and colour (UI foundations spec §7): at most one always-visible control per row, the rest shown on hover or focus from `sm` with opacity only (`ROW_ACTIONS`); at most one "Ask about this" per row; at most two badges per row and one per tile or card header, never one that restates the page; uppercase only in `TYPE.eyebrow`; ` · ` between meta items; decorative icon chips `bg-subtle text-ink-muted`; amber and red only for health average/poor, risk at the server's threshold, overdue or past SLA, failed or errored, a trend beside its direction word, and `DANGER` actions, never for counts, categories, "not set up" or empty states. If more than a third of a screen's rows would be red or amber, show neutral and sort by severity.
```

- [ ] **Step 2: Update `docs/03-ui-ux-design.md`**

- Change "Current as of 2026-09-24." to "Current as of 2026-10-09."
- In the Tier 0 table, add after the `--color-info` row:

```markdown
| `--color-success-ink` / `warning-ink` / `danger-ink` / `info-ink` | `#047857` / `#B45309` / `#B91C1C` / `#1D4ED8` | `#34D399` / `#FBBF24` / `#F87171` / `#60A5FA` | Readable status text on a `-dim` tint (badges, `DANGER`, error messages). The plain semantic tokens stay for dots, bars and chart marks |
```

- Replace §3's family table, the "Known gap" note, the "Scale in use" table and the paragraph under it with:

```markdown
`index.html` loads two families from Google Fonts:

| Family | Used for | Weights |
|---|---|---|
| DM Serif Display | Display headings on Persuade-mode pages (login, workspace setup, the Copilot greeting), the wordmark | 400 |
| DM Mono | IDs, API keys, endpoints, code (`CODE`) | 400, 500 |

The body is the system stack. Every figure is set in it with `tabular-nums`
(`NUM`), so columns align without a monospace face. Lato is no longer loaded
(owner, 2026-10-09).

### Scale

Four sizes, two weights, roles in `src/components/ui/type.ts`:

| Role | Class |
|---|---|
| Display | `text-[22px] leading-7 font-semibold tracking-tight` (the in-content h1, tile values) |
| Title | `text-[15px] leading-6 font-semibold` (top bar, card and section titles) |
| Body | `text-[13px] leading-5` (rows, inputs, buttons with `font-semibold`) |
| Meta | `text-[11px] leading-4 text-ink-muted` (meta lines, captions, badges) |
| Eyebrow | `text-[11px] font-semibold uppercase tracking-wider` (tile labels and settings nav groups only) |
| Label | `text-[13px] font-semibold` (form labels, never uppercase) |

Off-scale sizes in older files are counted by `src/test/uiRatchet.test.ts`
and removed surface by surface. Reading surfaces cap line length around 65
to 75 characters.
```

- In §5, replace the **Elevation** row with `| Elevation | Cards are flat (`Card`: `rounded-xl border border-line bg-surface`, no shadow). `shadow-lg` only on overlays (`OVERLAY`). `.rv-card` is the legacy class kept for account settings and the platform portal until their own round |` and the **Inputs** row with `| Inputs | `INPUT` / `SELECT` in `ui/styles.ts`: `min-h-11 sm:min-h-9`, `bg-surface`, `border-line`, `rounded-lg`, `text-[13px]`, disabled `bg-subtle text-ink-faint` |`.
- At the top of §6 (before "### Data display") add:

```markdown
### Primitives (`src/components/ui/`)

Since 2026-10-09 (spec 2026-10-09-ui-foundations-design) every new surface
is built from: `Card` (+ `CardHeader`/`Body`/`Section`/`Footer`),
`ListCard`/`ListRow`/`ListHeaderRow` and the `TABLE`/`TH`/`TD` constants,
`Tile` + `tileRow()`, `LoadingState`/`EmptyState`/`ErrorState`, `Tabs`,
`SegmentedControl`, `FilterChip`/`RemovableChip`/`FilterChipRow`,
`SearchInput`, `Select`, `Switch`, `Toolbar`, `Badge`/`HealthBadge`/
`SentimentBadge`, `PageHeader`/`PageBody` and `SettingsFrame`/
`SettingsSection`/`SettingsRow`/`SettingsSaveBar`. Buttons are `PRIMARY`,
`BUTTON`, `QUIET`, `DANGER`, `ICON_BUTTON`; disabled controls use tokens,
never opacity. `/__ui` (development builds only) shows each in every state.
The inventory below describes surfaces as they are until their surface PR
moves them.
```

- [ ] **Step 3: Update `docs/04-app-flow.md`**

- In the §1 shell diagram, change the public line to `├── /login, /auth/callback, /forgot-password, /reset-password, /s/:token, /u/:token   (public, no shell)` and add under it `├── /__ui                                            (development builds only: the UI primitives gallery)`.
- In the §2 route table, add after the `/s/:token` row:

```markdown
| `/__ui` | `UiGallery` (`src/pages/dev/UiGallery.tsx`): every UI primitive in every state, for screenshots. Registered only when `import.meta.env.DEV`; absent from production builds | public (dev only) |
```

- [ ] **Step 4: Check**

Run: `grep -n "Lato" .claude/skills/revenact-design/SKILL.md docs/03-ui-ux-design.md`
Expected: only the lines saying Lato is not loaded / is its own decision.
Run: `grep -n "numbers and IDs in DM Mono\|Numbers, identifiers, badges" .claude/skills/revenact-design/SKILL.md docs/03-ui-ux-design.md`
Expected: nothing.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/revenact-design/SKILL.md docs/03-ui-ux-design.md docs/04-app-flow.md
git commit -m "docs(ui): record the primitives, figures in the body font and the new tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Full verification, after screenshots, rebase onto #128

**Files:** none changed unless a check fails (then fix in the task that owns the file, with its own commit).

- [ ] **Step 1: Full checks**

Run: `npm run lint` (expected: no errors), `npm run build` (expected: success), `npm test` (expected: every file passes).

- [ ] **Step 2: After screenshots**

Start Vite as in Task 1 Step 4, then:

```bash
node scripts/ui-shots.mjs --label after \
  --seed ../../revenact-backend/services/accounts/management/commands/seed_demo.py \
  --cli /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/cleanup-fe/node_modules/.bin/playwright-cli \
  /dashboard/overview /organizations/list /brain /segments /settings/general
```

Expected: 24 paths (the `/__ui` gallery first, 4 each). The gallery must report no layout or console problem; problems on the other pages must be the same as in the before set. A fullPage capture of the gallery can show the sticky `SettingsSaveBar` over the settings frame's heading; that is the screenshot, not the layout.

Read each pair with the Read tool and confirm the only visible differences are: figures in the body font instead of DM Mono (tiles, rows, dates), disabled buttons in faint ink on a solid fill instead of see-through, `.rv-card` radius (account settings and the platform portal, not in this set), and the Panel looking the same. Check `/__ui` in both themes at both sizes: badges readable on their tints in dark mode, no sideways scroll at 390.

- [ ] **Step 3: Rebase onto main after #128 merges**

When PR #128 is merged:

```bash
git fetch origin
git rebase origin/main
```

Expected conflicts: none or small ones in `src/index.css` (#128's `accent-color` block sits after the dark bridge; keep both) and `src/components/surveys/AnswersSection.test.tsx` (keep #128's new test and this branch's `tabular-nums` assertion). Then rerun `npm test`; if `src/test/uiRatchet.test.ts`'s tight-baseline test reports new totals because #128 changed offending lines, update `BASELINE` to the measured totals in a commit `test(ui): re-record the UI ratchet after rebasing onto #128` (say in the body which counts moved and why). Rerun lint, build and the after screenshots.

- [ ] **Step 4: Hand off**

Do not push. Report: the commit list, the test/lint/build results, the screenshot paths for the PR body (before/after pairs and `/__ui`), and any layout problems the runner reported.

---

## Next plans (not in this plan)

Each is its own frontend PR on its own branch after this one merges (spec §9.2):

1. **Records** (`/organizations/*`, `/accounts/*`, `/contacts/*`): first wires `PageHeader` into the Navbar bar (title slot on `NavActionsSlotContext`), then `ListCard`/`ListRow`, `Tile`, `Toolbar` (Contacts joins it), `EmptyState`, Story/Calls rows, Knowledge cards flattened, board card actions on hover.
2. **Pipelines, Communications, Brain, Work**: grid-column rows, flat rows in the glass shell, `SegmentedControl` for kind and scope, one section-title style on Brain, `PageBody width="reading"` for Work.
3. **Impact** (`/segments`, `/surveys`, `/scenarios`, `/projects`, `/campaigns`, `/canvas`): one `ListCard` per list, detail headers with two actions plus the menu and Delete as `DANGER`, flattened builder boxes, the legacy Scenarios canvas tab and Surveys "Logged scores" restyled (owner answer 4).
4. **Settings** (`/settings/*` only): `SettingsFrame` on every page, sections and rows, Connections as a compact list, neutral property badges.
5. **Dashboard, Copilot and shell**: `Card` replaces the inline strings and `Panel`, fixed heights removed, `HealthBadge`, Copilot gets the `PageHeader`, the Navbar's last route branches deleted, sidebar counts neutral.

Each surface PR adds `uiRuleSuite` for its folders, lowers the ratchet baselines, and ships before/after screenshots from `scripts/ui-shots.mjs`.

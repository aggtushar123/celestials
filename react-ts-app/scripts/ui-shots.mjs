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
          // A bar drawn inside <main> (the scenario builder's own header) is the page's
          // first row, not something the page's content can sit under.
          const header = document.querySelector('[data-page-header]') || document.querySelector('header:not(main header)');
          if (header && main && !main.contains(header)) {
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { CAMPAIGN_GONE_RULE, NOTIFY_ME_ACTION, RENEWAL_WATCH, RULES, SAVE_ACTION, SAVE_RULE, stubRules, WELCOME_TASKS, WIN_BACK_ACTION, WIN_BACK_RULE, type StoredRule } from '../../features/rules/testRules';
import { BUILT_RULE_ID, MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';
import { resetViewport } from '../../test/viewport';
import { renderRules } from './testPages';

/** Pick a segment once the list has loaded: the select is disabled, with a
 *  "Loading your segments…" option, until the request answers (a slow CI
 *  machine got there first). */
async function pickSegment(modal: HTMLElement, value: string) {
  const select = within(modal).getByRole('combobox', { name: 'Segment' });
  await waitFor(() => {
    expect(select).toBeEnabled();
    expect(within(select).getByRole('option', { hidden: true, name: (_, el) => (el as HTMLOptionElement).value === value })).toBeInTheDocument();
  });
  await userEvent.selectOptions(select, value);
}


const where = () => screen.getByTestId('where').textContent;
const nights = () => screen.findByRole('list', { name: 'Nights' }, { timeout: 15000 });

describe('a rule (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("heads the owner's rule with its sentence, sharing, wait, switch, Edit and Delete", async () => {
    stubRules();
    renderRules('/scenarios/rules/5');
    const title = await screen.findByRole('heading', { level: 1, name: 'Renewal watch' }, { timeout: 15000 });
    expect(title).toHaveClass('break-words');
    expect(document.querySelector('[data-part="sentence"]')).toHaveTextContent('When CSAT falls below 60 in Renewal risk → survey, notify me');
    expect(document.querySelector('[data-part="meta"]')).toHaveTextContent('Yours · Shared with the workspace · Once per record every 30 days');
    // One span per part, the dot trailing: a wrapped phone line never starts with "·".
    const parts = [...(document.querySelector('[data-part="meta"]') as HTMLElement).children].map((child) => child.textContent ?? '');
    expect(parts).toHaveLength(3);
    expect(parts.filter((text) => text.trim().startsWith('·'))).toEqual([]);
    expect(screen.getByRole('switch', { name: 'Run Renewal watch every night' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/scenarios/rules/5/edit');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  }, 20000);

  it('lists the nights as the spec words them, newest first, with Review it while one waits', async () => {
    stubRules();
    renderRules('/scenarios/rules/5');
    const list = await nights();
    expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '4 Oct · fired 3 · skipped 2 · 1 waiting for review',
      '3 Oct · fired 1 · 1 waiting for review',
      '2 Oct · fired 1 · skipped 1',
    ]);
    expect(within(list).getAllByRole('link', { name: 'Review it' }).map((link) => link.getAttribute('href'))).toEqual(['/work?queue=mine&kind=approval', '/work?queue=mine&kind=approval']);
  }, 20000);

  it("opens a night's records: what each action did, and why one was skipped", async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/5');
    const night = within(await nights()).getByRole('button', { name: /^4 Oct/ });
    expect(night).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(night);
    expect(night).toHaveAttribute('aria-expanded', 'true');
    const records = await screen.findByRole('list', { name: 'Records on 4 Oct 2026' }, { timeout: 15000 });
    const globex = within(records).getByRole('link', { name: 'Globex' });
    expect(globex).toHaveAttribute('href', '/organizations/1');
    expect(globex.closest('li')).toHaveTextContent('Survey: waiting for review · Notify: done');
    expect(within(records).getByRole('link', { name: 'Shopify' }).closest('li')).toHaveTextContent('Skipped: acted on in the last 30 days');
    expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/9\/$/)).toHaveLength(1);
  }, 20000);

  it('says why a record nothing happened to was skipped, and leaves a deleted record unlinked', async () => {
    stubRules();
    renderRules('/scenarios/rules/5');
    const list = await nights();
    const night = within(list).getByRole('button', { name: /^2 Oct/ });
    expect(night).toHaveTextContent('2 Oct · fired 1 · skipped 1');
    await userEvent.click(night);
    const records = await screen.findByRole('list', { name: 'Records on 2 Oct 2026' }, { timeout: 15000 });
    expect(within(records).getByRole('link', { name: 'Umbrella' }).closest('li')).toHaveTextContent('Skipped: nothing to do for it');
    const gone = within(records).getByText('A deleted record');
    expect(gone.closest('a')).toBeNull();
    expect(within(gone.closest('li') as HTMLElement).queryByRole('link')).toBeNull();
  }, 20000);

  it('opens the night the notification links to', async () => {
    stubRules();
    renderRules('/scenarios/rules/5?run=8');
    expect(await screen.findByRole('list', { name: 'Records on 3 Oct 2026' }, { timeout: 15000 })).toBeInTheDocument();
    expect(within(await nights()).getByRole('button', { name: /^3 Oct/ })).toHaveAttribute('aria-expanded', 'true');
  }, 20000);

  it('pages the nights with Show more under the cursor', async () => {
    const { spy } = stubRules({ pageSize: 2 });
    renderRules('/scenarios/rules/5');
    expect(within(await nights()).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Show more nights' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Nights' })).getAllByRole('listitem')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: 'Show more nights' })).toBeNull();
    expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/$/)[1].query.get('cursor')).toEqual(expect.any(String));
  }, 20000);

  it("shows a reader only what they may open, and counts the rest; no switch, Edit or Delete", async () => {
    stubRules();
    renderRules('/scenarios/rules/8');
    expect(await screen.findByRole('heading', { level: 1, name: 'EMEA renewals' }, { timeout: 15000 })).toBeInTheDocument();
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
  }, 20000);

  it('explains a rule that switched itself off, and has no nights yet', async () => {
    stubRules();
    renderRules('/scenarios/rules/7');
    expect(await screen.findByText(/^It switched itself off\./, undefined, { timeout: 15000 })).toHaveTextContent('It switched itself off. Its segment was deleted. Choose another of your segments in Edit, then turn it on.');
    expect(document.querySelector('[data-part="paused"]')!.closest('[role="status"]')).not.toBeNull();
    expect(document.querySelector('[data-part="sentence"]')).toHaveTextContent('When a record leaves a deleted segment → notify me');
    expect(await screen.findByText('No nights yet')).toBeInTheDocument();
    expect(screen.getByText('Turn it on and it runs tonight, after the scores and segments update.')).toBeInTheDocument();
  }, 20000);

  it('shows the error with Try again when the nights fail, and reads them again', async () => {
    let calls = 0;
    const { spy } = stubRules({
      runsPage: () => {
        calls += 1;
        return calls === 1 ? { status: 500, body: { detail: 'Nights are down.' } } : undefined;
      },
    });
    renderRules('/scenarios/rules/5');
    expect(await screen.findByText('Nights are down.', undefined, { timeout: 15000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await nights()).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/$/)).toHaveLength(2);
  }, 20000);

  it('reads "Rule not found" for a rule that is missing or not shared', async () => {
    stubRules();
    const first = renderRules('/scenarios/rules/9');
    expect(await screen.findByText('Rule not found', undefined, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All rules' })).toHaveAttribute('href', '/scenarios');
    first.unmount();
    renderRules('/scenarios/rules/abc');
    expect(await screen.findByText('Rule not found')).toBeInTheDocument();
  }, 20000);

  it('deletes after the confirm and returns to the list', async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/5');
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }, { timeout: 15000 }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete Renewal watch?' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1) as HTMLElement);
    await waitFor(() => expect(where()).toBe('/scenarios'));
    expect(requestsOf(spy, 'DELETE', /^\/rules\/5\/$/)).toHaveLength(1);
  }, 20000);

  it("tells the owner how to mend a rule whose plan template was deleted", async () => {
    stubRules({ rules: [...RULES, SAVE_RULE] });
    renderRules('/scenarios/rules/10');
    expect(await screen.findByText('It switched itself off. Its plan template was deleted. Choose another template in Edit, then turn it on.', undefined, { timeout: 15000 })).toBeInTheDocument();
    expect(document.querySelector('[data-part="sentence"]')).toHaveTextContent('When an organisation enters Renewal risk → start a plan');
  }, 20000);

  it("shows what a night's plan did for each record", async () => {
    const { runNight } = stubRules({ rules: [...RULES, { ...SAVE_RULE, is_active: true, paused_reason: '', paused_message: '', actions: [NOTIFY_ME_ACTION, SAVE_ACTION] }] });
    expect(runNight(10)).toMatchObject({ fired: 2 });
    renderRules('/scenarios/rules/10');
    await userEvent.click(within(await nights()).getAllByRole('button')[0]);
    expect(await screen.findByText('Notify: done · Plan: already had one', undefined, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText('Notify: done · Plan: started')).toBeInTheDocument();
  }, 20000);

  it('tells the owner how to mend a rule whose campaign was archived or deleted', async () => {
    stubRules({ rules: [...RULES, CAMPAIGN_GONE_RULE] });
    renderRules('/scenarios/rules/12');
    expect(await screen.findByText('It switched itself off. Its campaign was archived or deleted. Choose another campaign in Edit, then turn it on.', undefined, { timeout: 15000 })).toBeInTheDocument();
    expect(document.querySelector('[data-part="sentence"]')).toHaveTextContent('When an organisation enters Renewal risk → email a campaign');
  }, 20000);

  it("shows what a night's campaign did for each record", async () => {
    const { runNight } = stubRules({ rules: [...RULES, { ...WIN_BACK_RULE, actions: [NOTIFY_ME_ACTION, WIN_BACK_ACTION] }] });
    expect(runNight(11)).toMatchObject({ fired: 2 });
    renderRules('/scenarios/rules/11');
    await userEvent.click(within(await nights()).getAllByRole('button')[0]);
    expect(await screen.findAllByText('Notify: done · Campaign: waiting for your review')).toHaveLength(2);
  }, 20000);

  it('says an agent made it, and who approved it (Agents delivery 3)', async () => {
    const agentRule: StoredRule = { ...WELCOME_TASKS, id: BUILT_RULE_ID, name: 'Health watch', made_by: MADE_BY_OPS };
    stubRules({ rules: [...RULES, agentRule] });
    renderRules(`/scenarios/rules/${BUILT_RULE_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Health watch' }, { timeout: 15000 })).toBeInTheDocument();
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  }, 20000);

  it('says nothing of an agent on a rule a person made', async () => {
    stubRules();
    renderRules('/scenarios/rules/5');
    await screen.findByRole('heading', { level: 1, name: 'Renewal watch' }, { timeout: 15000 });
    expect(document.querySelector('[data-part="made-by"]')).toBeNull();
  });
});

describe('Edit (spec §2.2, over the rule)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  }, 20000);

  it("opens the owner's rule filled in, tests it with its own state, saves it whole and updates the page", async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/5');
    await userEvent.click(await screen.findByRole('link', { name: 'Edit' }, { timeout: 15000 }));
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
  }, 20000);

  it('warns that changing the trigger expires the waiting survey, then the nights read again without it', async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/5');
    expect(within(await nights()).getAllByRole('link', { name: 'Review it' })).toHaveLength(2);
    await userEvent.click(screen.getByRole('link', { name: 'Edit' }));
    const modal = await screen.findByRole('dialog', { name: 'Edit Renewal watch' }, { timeout: 15000 });
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Renewal risk'));
    const WARNING = 'Saving this expires the survey waiting for your review.';
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), ' 2');
    expect(within(modal).queryByText(WARNING)).toBeNull();
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'entered');
    const save = within(modal).getByRole('button', { name: 'Save rule' });
    expect(save).toHaveAccessibleDescription(WARNING);
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'crossed');
    expect(within(modal).queryByText(WARNING)).toBeNull();
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'entered');
    await userEvent.click(save);
    await waitFor(() => expect(where()).toBe('/scenarios/rules/5'));
    await waitFor(() => expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/$/)).toHaveLength(2));
    const list = await nights();
    await waitFor(() => expect(within(list).queryByRole('link', { name: 'Review it' })).toBeNull());
    expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '4 Oct · fired 3 · skipped 2 · survey review expired',
      '3 Oct · fired 1 · survey review expired',
      '2 Oct · fired 1 · skipped 1',
    ]);
  }, 20000);

  it('warns about a changed segment too, and not for a rule with nothing waiting', async () => {
    stubRules();
    renderRules('/scenarios/rules/6/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Welcome tasks' }, { timeout: 15000 });
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Champions'));
    await pickSegment(modal, '7');
    expect(within(modal).queryByText(/expires the survey/)).toBeNull();
  }, 20000);

  it('renames and re-shares a rule whose segment was deleted, sending neither segment nor trigger', async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/7/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Old churn watch' }, { timeout: 15000 });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), ' 2');
    await userEvent.click(within(modal).getByRole('radio', { name: /workspace/ }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/7'));
    expect(screen.getByRole('heading', { level: 1, name: 'Old churn watch 2' })).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/rules\/7\/$/)[0].body).toEqual({
      name: 'Old churn watch 2', actions: [{ action: 'notify', to: 'me', people: [], message: '' }], cooldown_days: 30, is_active: false, sharing: 'workspace',
    });
  }, 20000);

  it('still asks for a segment when the deleted-segment rule changes its trigger or is turned on', async () => {
    const { spy } = stubRules();
    renderRules('/scenarios/rules/7/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Old churn watch' }, { timeout: 15000 });
    const segment = within(modal).getByRole('combobox', { name: 'Segment' });
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'entered');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    expect(segment).toHaveAccessibleDescription(/Choose a segment\./);
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Trigger' }), 'left');
    await userEvent.click(within(modal).getByRole('switch', { name: 'Run every night' }));
    await userEvent.click(within(within(modal).getByRole('group', { name: /^Turn on/ })).getByRole('button', { name: 'Turn on' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    expect(segment).toHaveAccessibleDescription(/Choose a segment\./);
    expect(requestsOf(spy, 'PATCH', /^\/rules\/7\/$/)).toHaveLength(0);
  }, 20000);

  it('tells anyone but the owner that only the owner can edit it', async () => {
    stubRules();
    renderRules('/scenarios/rules/8/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit EMEA renewals' }, { timeout: 15000 });
    expect(within(modal).getByText('Only Carl CSM can edit this rule')).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: 'Open rule' })).toHaveAttribute('href', '/scenarios/rules/8');
  }, 20000);
});

describe('a rule on the primitives (Impact PR)', () => {
  it('shows the switch and Edit, and keeps Delete in ⋯ in the danger tone', async () => {
    stubRules();
    renderRules(`/scenarios/rules/${RENEWAL_WATCH.id}`);
    await screen.findByRole('heading', { level: 1, name: RENEWAL_WATCH.name }, { timeout: 15000 });
    const actions = document.querySelector('[data-part="actions"]') as HTMLElement;
    expect(within(actions).getByRole('switch')).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Delete' })).toBeNull();
    await userEvent.click(within(actions).getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('text-danger-ink');
  }, 20000);

  it('draws the nights as one card with its heading inside, each night a disclosure row', async () => {
    stubRules();
    renderRules(`/scenarios/rules/${RENEWAL_WATCH.id}`);
    const heading = await screen.findByRole('heading', { name: 'Nights' }, { timeout: 15000 });
    const card = heading.closest('section')!;
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(await within(card).findByRole('list', { name: 'Nights' })).toBeInTheDocument();
  }, 20000);

  it('keeps the paused notice in the header’s live region, without an amber box', async () => {
    stubRules({ rules: [{ ...RENEWAL_WATCH, paused_reason: 'segment_gone', paused_message: 'Its segment was deleted.' }] });
    renderRules(`/scenarios/rules/${RENEWAL_WATCH.id}`);
    const paused = await screen.findByText(/./, { selector: '[data-part="paused"]' }, { timeout: 15000 });
    expect(paused.closest('[role="status"]')).not.toBeNull();
    expect(paused.className).not.toMatch(/bg-warning-dim/);
  }, 20000);
});

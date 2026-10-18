import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { NOTIFY_ME_ACTION, stubRules } from '../../features/rules/testRules';
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
    // The Rules list stays behind the modal.
    expect(await screen.findByRole('list', { name: 'Rules', hidden: true })).toBeInTheDocument();
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('Choose a segment, and the rule reads here as one sentence.');
    await pickSegment(modal, '7');
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
    await pickSegment(modal, '7');
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
    await pickSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const who = within(modal).getByRole('combobox', { name: 'Who' });
    await waitFor(() => expect(who).toHaveAccessibleDescription('Choose who to notify.'));
    expect(who).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(who).toHaveFocus());
    expect(where()).toBe('/scenarios/rules/new');
  });

  it("focuses a card's own refusal when it names no field: a repeated action", async () => {
    stubRules({ create: () => ({ status: 400, body: { actions: [{}, { action: ['Each action can be used once per rule.'] }] } }) });
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Watch');
    await pickSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send a survey' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const card = modal.querySelector('[data-action="survey"]') as HTMLElement;
    const alert = await within(card).findByText('Each action can be used once per rule.');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("focuses a survey's roles refusal, and shows survey type and review refusals at their controls", async () => {
    let answer: unknown = { actions: [{}, { roles: ['Choose at least one role.'] }] };
    stubRules({ create: () => ({ status: 400, body: answer }) });
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Watch');
    await pickSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send a survey' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const card = modal.querySelector('[data-action="survey"]') as HTMLElement;
    const roles = await within(card).findByText('Choose at least one role.');
    await waitFor(() => expect(roles).toHaveFocus());
    answer = { actions: [{}, { survey_type: ['Choose NPS, CSAT or CES.'], without_review: ['Must be true or false.'] }] };
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const type = await within(within(card).getByRole('group', { name: 'Survey type' })).findByText('Choose NPS, CSAT or CES.');
    await waitFor(() => expect(type).toHaveFocus());
    const review = within(card).getByText('Must be true or false.');
    expect(within(card).getByRole('switch', { name: 'Send without review' }).compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the segment ownership refusal at the segment', async () => {
    stubRules({ create: () => ({ status: 403, body: { detail: 'A rule can only use your own segments.' } }) });
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Watch');
    await pickSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const segment = within(modal).getByRole('combobox', { name: 'Segment' });
    await waitFor(() => expect(segment).toHaveAccessibleDescription(/A rule can only use your own segments\./));
    await waitFor(() => expect(segment).toHaveFocus());
  });

  it('sends one POST however often it is submitted, reading Saving… meanwhile', async () => {
    const { spy } = stubRules();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Twice');
    await pickSegment(modal, '7');
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = spy.getMockImplementation()!;
    spy.mockImplementation(async (input, init) => {
      if (init?.method === 'POST' && String(input).endsWith('/rules/')) await gate;
      return real(input, init);
    });
    const form = modal.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await userEvent.dblClick(within(modal).getByRole('button', { name: /Sav/ }));
    expect(within(modal).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    release();
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    expect(requestsOf(spy, 'POST', /^\/rules\/$/)).toHaveLength(1);
  });

  it('says the 50-rule limit above the form, focused', async () => {
    stubRules({ limit: 3 });
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Watch');
    await pickSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    const alert = await within(modal).findByText('You can own at most 50 rules.');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('warns when a weekly rule waits longer than a week, and checks the wait', async () => {
    stubRules();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Weekly');
    await pickSegment(modal, '7');
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

  it('drops a lifecycle action and the survey roles when the segment turns to contacts', async () => {
    const { spy } = stubRules();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Kinds');
    const segment = within(modal).getByRole('combobox', { name: 'Segment' });
    await userEvent.selectOptions(segment, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Change lifecycle' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Send a survey' }));
    expect(modal.querySelector('[data-action="lifecycle"]')).not.toBeNull();
    await userEvent.selectOptions(segment, '9');
    expect(modal.querySelector('[data-action="lifecycle"]')).toBeNull();
    expect(within(modal).queryByRole('button', { name: 'Change lifecycle' })).toBeNull();
    expect(within(modal).queryByRole('checkbox', { name: 'Champion' })).toBeNull();
    const then = within(modal).getByRole('region', { name: 'Then' });
    expect(within(then).getByRole('status')).toHaveTextContent('Change lifecycle was removed: contacts have no lifecycle stage.');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    const sent = requestsOf(spy, 'POST', /^\/rules\/$/)[0].body as { segment: number; actions: { action: string; roles?: string[] }[] };
    expect(sent.segment).toBe(9);
    expect(sent.actions.map((action) => action.action)).toEqual(['notify', 'survey']);
    expect(sent.actions[1].roles).toEqual([]);
  });

  it('says nothing of a lifecycle card when none was dropped', async () => {
    stubRules();
    const modal = await openNew();
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '9');
    expect(within(within(modal).getByRole('region', { name: 'Then' })).getByRole('status')).toHaveTextContent('');
  });

  it('Test this rule checks what Save would send, less the name and sharing', async () => {
    const { spy } = stubRules();
    const modal = await openNew();
    await pickSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('radio', { name: 'Chosen teammates' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    expect(await within(modal).findByText(/would match/)).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)).toHaveLength(1);
    await userEvent.clear(within(modal).getByRole('spinbutton', { name: 'Once per record every (days)' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    expect(within(modal).getByRole('spinbutton', { name: 'Once per record every (days)' })).toHaveAccessibleDescription(/Choose 1 to 365 days\./);
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)).toHaveLength(1);
  });

  it('offers only active teammates to notify and to share with', async () => {
    stubRules();
    const modal = await openNew();
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Who' })).toBeInTheDocument());
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Who' }), 'people');
    const notify = modal.querySelector('[data-action="notify"]') as HTMLElement;
    const picker = within(notify).getByRole('combobox', { name: 'Teammates' });
    await waitFor(() => expect(within(picker).queryByRole('option', { name: 'Carl CSM' })).not.toBeNull());
    const names = (select: HTMLElement) => [...select.querySelectorAll('option')].map((option) => option.textContent);
    expect(names(picker)).toEqual(expect.arrayContaining(['Carl CSM', 'Dana CSM']));
    expect(names(picker)).not.toContain('Erin Left');
    expect(names(picker)).not.toContain('Alice');
    await userEvent.click(within(modal).getByRole('radio', { name: 'Chosen teammates' }));
    const share = within(modal).getByRole('combobox', { name: 'Add a teammate' });
    expect(names(share)).toEqual(expect.arrayContaining(['Carl CSM', 'Dana CSM']));
    expect(names(share)).not.toContain('Erin Left');
    expect(names(share)).not.toContain('Alice');
  });

  it('focuses the name, keeps Tab inside, keeps the draft on a scrim click and closes on Escape', async () => {
    stubRules();
    const modal = await openNew();
    expect(modal).toHaveAttribute('aria-modal', 'true');
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveFocus();
    await userEvent.type(name, 'Draft');
    await userEvent.click(document.querySelector('[data-scrim]') as HTMLElement);
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Draft');
    within(modal).getByRole('button', { name: 'Save rule' }).focus();
    await userEvent.tab();
    expect(within(modal).getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(modal).getByRole('button', { name: 'Save rule' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(where()).toBe('/scenarios'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Close back to the list', async () => {
    stubRules();
    const modal = await openNew();
    await userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/scenarios'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sets the test and the preview side by side, no card inside another', async () => {
    stubRules();
    const modal = await openNew();
    await pickSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send a survey' }));
    const test = within(modal).getByRole('region', { name: 'Test this rule' });
    const preview = within(modal).getByRole('region', { name: 'Preview' });
    expect(test.parentElement).toBe(preview.parentElement);
    expect(test.contains(preview) || preview.contains(test)).toBe(false);
    const CARD = /(^|\s)(border|rounded-(lg|xl)|bg-subtle)(\s|$)/;
    for (const card of modal.querySelectorAll<HTMLElement>('[data-action]')) {
      let up = card.parentElement;
      while (up && up !== modal) {
        expect(up.className).not.toMatch(CARD);
        up = up.parentElement;
      }
    }
    expect(preview.parentElement?.className).not.toMatch(CARD);
  });

  it('stacks its columns at 375px with nothing scrolling sideways', async () => {
    stubRules();
    renderRules('/scenarios/rules/new', { width: 375 });
    const modal = await screen.findByRole('dialog', { name: 'New rule' });
    const columns = modal.querySelector('[data-part="builder-columns"]') as HTMLElement;
    expect(columns).toHaveClass('grid', 'lg:grid-cols-[minmax(0,1fr)_22rem]');
    expect(columns.className).not.toMatch(/(^|\s)(sm:|md:)?grid-cols-(?!1(\s|$))/);
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    const test = within(modal).getByRole('region', { name: 'Test this rule' });
    expect(name.compareDocumentPosition(test) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(modal.querySelectorAll('[class*="overflow-x-auto"], [class*="overflow-x-scroll"], [class*="overflow-scroll"]')).toHaveLength(0);
    expect(modal.querySelector('[data-part="builder-footer"]')).toHaveClass('flex-wrap');
  });

  it('Cancel returns to the list, which reads again', async () => {
    const { spy } = stubRules();
    const modal = await openNew();
    await screen.findByRole('list', { name: 'Rules' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/scenarios'));
    await waitFor(() => expect(requestsOf(spy, 'GET', /^\/rules\/$/)).toHaveLength(2));
  });

  it('starts a plan as an action: the sentence names it, the test counts the plans, and it sends the id', async () => {
    const { spy } = stubPlans();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Save renewals');
    await pickSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Start a plan' }));
    const select = within(modal.querySelector('[data-action="plan"]') as HTMLElement).getByRole('combobox', { name: 'Template' });
    await waitFor(() => expect(select).not.toBeDisabled());
    await userEvent.selectOptions(select, '3');
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('When an organisation enters Renewal risk → notify me, start a Save plan');
    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    await waitFor(() => expect(modal.querySelector('[data-part="plans"]')).toHaveTextContent('Would start 2 plans · 1 already has one'));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    expect((requestsOf(spy, 'POST', /^\/rules\/$/)[0].body as { actions: unknown[] }).actions).toEqual([NOTIFY_ME_ACTION, { action: 'plan', template: 3 }]);
  });

  it('emails a campaign as an action: the sentence names it, the test counts the emails, and it sends the id', async () => {
    const { spy } = stubCampaigns();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Win back');
    await pickSegment(modal, '7');
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
});

describe('Automate (spec §2.5)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("sits in the owner's segment menu, and not on someone else's", async () => {
    stubRules();
    const first = renderRules('/segments/7');
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Automate' })).toBeInTheDocument();
    first.unmount();
    renderRules('/segments/8');
    expect(await screen.findByRole('heading', { level: 1, name: 'EMEA accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('opens the builder over the segment with it chosen; saving opens the new rule', async () => {
    stubRules();
    renderRules('/segments/7');
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Automate' }));
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

describe('the rule builder, flattened (Impact PR)', () => {
  it('labels fields in sentence case above the shared select', async () => {
    stubRules();
    renderRules('/scenarios/rules/new');
    const trigger = await screen.findByRole('combobox', { name: 'Trigger' });
    expect(trigger).toHaveClass('appearance-none');
    expect(document.querySelector(`label[for="${trigger.id}"]`)).not.toHaveClass('uppercase');
  });

  it('boxes nothing inside the dialog: actions are divided sections, the test panel a flat section', async () => {
    stubRules();
    renderRules('/scenarios/rules/new');
    const dialog = await screen.findByRole('dialog');
    const actions = within(dialog).getByRole('list', { name: 'Actions' });
    expect(actions).toHaveClass('divide-y', 'divide-line-subtle');
    for (const item of within(actions).getAllByRole('listitem')) expect(item.className).not.toMatch(/\bborder-line\b|rounded-lg/);
    const test = within(dialog).getByRole('region', { name: 'Test this rule' });
    expect(test.className).not.toMatch(/bg-subtle|rounded-xl/);
    expect(within(test).getByRole('button', { name: 'Test this rule' })).toHaveClass('border-line', 'bg-surface');
  });

  it("keeps the actions' note region mounted while empty", async () => {
    stubRules();
    renderRules('/scenarios/rules/new');
    const dialog = await screen.findByRole('dialog');
    const note = within(dialog).getAllByRole('status').find((region) => region.className.includes('empty:sr-only'))!;
    expect(note).toBeEmptyDOMElement();
  });
});

import { describe, expect, it } from 'vitest';
import { hasErrors } from './ruleErrors';
import { availableActions, checkDraft, emptyDraft, fromRule, newAction, NOTIFY_ME, toActions, toTestBody, toTrigger, toWrite, withKind, type RuleDraft } from './ruleDraft';
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
    expect(availableActions([NOTIFY_ME], 'customer')).toEqual(['task', 'lifecycle', 'survey', 'plan', 'campaign']);
    expect(availableActions([NOTIFY_ME], 'contact')).toEqual(['task', 'survey', 'plan', 'campaign']);
    const three = [NOTIFY_ME, newAction('task', 'customer', 'A'), newAction('survey', 'customer', 'A')];
    expect(availableActions(three, 'customer')).toEqual([]);
  });

  it('starts a plan action with no template, refuses it so, and sends the id', () => {
    expect(newAction('plan', 'customer', 'Acme Inc')).toEqual({ action: 'plan', template: null });
    expect(checkDraft(draft({ actions: [NOTIFY_ME, { action: 'plan', template: null }] }), 'customer').action).toEqual([{}, { template: 'Choose a template you can use.' }]);
    expect(toActions(draft({ actions: [{ action: 'plan', template: { id: 3, name: 'Save plan' } }] }), 'customer')).toEqual([{ action: 'plan', template: 3 }]);
  });

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

  it("follows the segment's kind with a survey's roles", () => {
    const survey = newAction('survey', 'customer', 'A');
    expect(withKind([survey], 'contact')).toEqual([{ ...survey, roles: [] }]);
    expect(withKind([{ ...survey, roles: [] }], 'account')).toEqual([{ ...survey, roles: ['champion', 'decision_maker'] }]);
    expect(withKind([{ ...survey, roles: ['economic_buyer'] }], 'customer')).toEqual([{ ...survey, roles: ['economic_buyer'] }]);
    expect(withKind([NOTIFY_ME, { action: 'lifecycle', stage: 'live' }, survey], 'contact')).toEqual([NOTIFY_ME, { ...survey, roles: [] }]);
    expect(withKind([{ action: 'lifecycle', stage: 'live' }], 'account')).toEqual([{ action: 'lifecycle', stage: 'live' }]);
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

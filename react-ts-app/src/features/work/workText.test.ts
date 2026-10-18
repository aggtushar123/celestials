import { describe, expect, it } from 'vitest';
import type { TaskEvent } from './workTypes';
import {
  actorName,
  cantOpenText,
  doneLabel,
  doneStatus,
  eventSentence,
  hiddenTeamText,
  isDueDate,
  moreRowsText,
  parentPath,
  personName,
  sourceText,
  teamRowLabel,
  teamTitle,
} from './workText';
import { taskEvent } from './testWorkFixtures';

const ME = 1;
const mona = { id: 2, name: 'Mona Manager' };
const you = { id: ME, name: 'Alice' };
const event = (kind: TaskEvent['kind'], data: Record<string, unknown>, actor: TaskEvent['actor'] = mona, body = ''): TaskEvent => ({
  id: 1,
  kind,
  actor,
  data,
  body,
  created_at: '2026-10-07T09:30:00.123456Z',
});

describe('workText: people, records and sources', () => {
  it('names a person, a deactivated one, and nobody', () => {
    expect(personName({ id: 3, name: 'Carl CSM', active: true })).toBe('Carl CSM');
    expect(personName({ id: 5, name: 'Erin Former', active: false })).toBe('Unassigned (was Erin Former)');
    expect(personName(null)).toBe('Unassigned');
  });

  it('links an organization and an account where they live', () => {
    expect(parentPath({ kind: 'customer', id: 7 })).toBe('/organizations/7');
    expect(parentPath({ kind: 'account', id: 9 })).toBe('/accounts/9');
  });

  it('says where a task came from, and nothing for a manual one', () => {
    expect(sourceText({ source: 'manual', plan: null })).toBeNull();
    expect(sourceText({ source: 'plan', plan: { id: 12, name: 'Onboarding · Pizza Hut' } })).toBe('From Onboarding · Pizza Hut');
    expect(sourceText({ source: 'plan', plan: null })).toBe('From a plan');
    expect(sourceText({ source: 'rule', plan: null })).toBe('From a rule');
    expect(sourceText({ source: 'agent', plan: null })).toBe('From the AI agent');
    expect(sourceText({ source: 'recommendation', plan: null })).toBe('Recommended by Revenact');
  });

  it("counts what can't be opened, never naming it", () => {
    expect(hiddenTeamText(0)).toBeNull();
    expect(hiddenTeamText(1)).toBe("1 task you can't open");
    expect(hiddenTeamText(2)).toBe("2 tasks you can't open");
  });

  it('says when a group was cut short, and the small lines', () => {
    expect(moreRowsText(100, 100)).toBeNull();
    expect(moreRowsText(100, 140)).toBe('Showing 100 of 140');
    expect(teamTitle('me')).toBe('Your tasks');
    expect(teamTitle('team')).toBe("Your team's tasks");
    expect(teamTitle('company')).toBe("Everyone's tasks");
    expect(teamRowLabel({ person: { id: 3, name: 'Carl CSM', active: true }, open: 5, overdue: 1, blocked: 1, oldest_overdue: '2026-10-05' })).toBe(
      'Carl CSM: 5 open, 1 overdue, 1 blocked, oldest due 5 Oct 2026',
    );
    expect(teamRowLabel({ person: { id: 5, name: 'Erin Former', active: false }, open: 0, overdue: 0, blocked: 0, oldest_overdue: null })).toBe(
      'Unassigned (was Erin Former): 0 open, 0 overdue, 0 blocked',
    );
    expect(cantOpenText('customer')).toBe("Can't open this organisation");
    expect(cantOpenText('account')).toBe("Can't open this account");
    expect(doneLabel('Call Pizza Hut')).toBe('Mark “Call Pizza Hut” done');
    expect(doneStatus('Call Pizza Hut')).toBe('Done: Call Pizza Hut.');
  });
});

describe('workText: the activity trail in sentences (spec §1.5)', () => {
  it('names the actor as You, Revenact or the person', () => {
    expect(actorName(you, ME)).toBe('You');
    expect(actorName(null, ME)).toBe('Revenact');
    expect(actorName(mona, ME)).toBe('Mona Manager');
  });

  it('created: for whom, from where, and the agent’s unused suggestion', () => {
    expect(eventSentence(event('created', { source: 'manual', assignee: { id: ME, name: 'Alice' } }), ME)).toBe('Mona Manager created this task for you.');
    expect(eventSentence(event('created', { source: 'rule', rule: 4, assignee: { id: 3, name: 'Carl CSM' } }, null), ME)).toBe(
      'Revenact created this task for Carl CSM from a rule.',
    );
    expect(eventSentence(event('created', { source: 'plan', plan: 12, assignee: null }, you), ME)).toBe('You created this task from a plan.');
    expect(
      eventSentence(event('created', { source: 'agent', proposal: 22, assignee: { id: 2, name: 'Mona Manager' }, suggested: 'Zed', fallback: 'no_member' }, you), ME),
    ).toBe("You created this task for Mona Manager from the AI agent's proposal. The agent suggested Zed, who isn't a member here.");
    expect(
      eventSentence(event('created', { source: 'agent', assignee: { id: 2, name: 'Mona Manager' }, suggested: 'Dana CSM', fallback: 'cannot_open' }, you), ME),
    ).toBe("You created this task for Mona Manager from the AI agent's proposal. The agent suggested Dana CSM, who can't open this record.");
  });

  it('assigned, status, due date and edits', () => {
    expect(eventSentence(event('assigned', { from: { id: ME, name: 'Alice' }, to: { id: 3, name: 'Carl CSM' } }, you), ME)).toBe(
      'You assigned it to Carl CSM (was Alice).',
    );
    expect(eventSentence(event('assigned', { from: null, to: { id: ME, name: 'Alice' } }), ME)).toBe('Mona Manager assigned it to you.');
    expect(eventSentence(event('status', { from: 'pending', to: 'in-progress' }, you), ME)).toBe('You moved it from pending to in progress.');
    expect(eventSentence(event('status', { from: 'pending', to: 'blocked', reason: 'Waiting on legal' }, you), ME)).toBe(
      'You marked it blocked: Waiting on legal',
    );
    expect(eventSentence(event('status', { from: 'blocked', to: 'completed' }, you), ME)).toBe('You marked it done.');
    expect(eventSentence(event('due_changed', { from: '2026-10-05', to: '2026-10-10' }, you), ME)).toBe(
      'You moved the due date from 5 Oct 2026 to 10 Oct 2026.',
    );
    expect(eventSentence(event('edited', { field: 'title', from: 'Call', to: 'Call again' }, you), ME)).toBe('You renamed it from “Call” to “Call again”.');
    expect(eventSentence(event('edited', { field: 'priority', from: 'high', to: 'low' }, you), ME)).toBe('You changed the priority from high to low.');
    expect(eventSentence(event('edited', { field: 'description' }, you), ME)).toBe('You edited the description.');
  });

  it('comments, recommendations and the delivery 3 kinds', () => {
    expect(eventSentence(event('comment', {}, you, 'Left a voicemail.'), ME)).toBe('You commented');
    expect(eventSentence(event('recommended', { facts: ['Renews in 9 days', 'Health fell 5.6 to 4.9'] }, null), ME)).toBe(
      'Revenact recommended it: Renews in 9 days; Health fell 5.6 to 4.9.',
    );
    // Delivery 3 (contract 2026-10-08-work-tracking-api.md): who was told, and how late.
    const carl = { id: 3, name: 'Carl CSM' };
    expect(eventSentence(event('nudged', { days_overdue: 2, to: carl }, null), ME)).toBe('Revenact reminded Carl CSM: 2 days overdue.');
    expect(eventSentence(event('nudged', { days_overdue: 1, to: you }, null), ME)).toBe('Revenact reminded you: 1 day overdue.');
    expect(eventSentence(event('escalated', { working_days_overdue: 2, to: mona }, null), ME)).toBe(
      'Revenact told Mona Manager: 2 working days overdue.',
    );
    expect(eventSentence(event('escalated', { working_days_overdue: 1, to: you }, null), ME)).toBe('Revenact told you: 1 working day overdue.');
    // An event without the data keeps delivery 1's words.
    expect(eventSentence(event('nudged', {}, null), ME)).toBe('Revenact sent a reminder.');
    expect(eventSentence(event('escalated', {}, null), ME)).toBe('Revenact told a manager it is overdue.');
  });
});

describe('isDueDate', () => {
  it('takes a real date from 2000 on, and refuses a half-typed or impossible one', () => {
    expect(isDueDate('2026-10-07')).toBe(true);
    expect(isDueDate('2000-01-01')).toBe(true);
    expect(isDueDate('0002-10-07')).toBe(false);
    expect(isDueDate('1999-12-31')).toBe(false);
    expect(isDueDate('2026-02-30')).toBe(false);
    expect(isDueDate('')).toBe(false);
    expect(isDueDate('7 Oct 2026')).toBe(false);
  });
});

describe('workText: a record attached to a to-do (contract §1.2)', () => {
  it('says a record was attached to a to-do', () => {
    expect(eventSentence(taskEvent(1, 'edited', { id: 1, name: 'Alice' }, { field: 'record', from: null, to: { kind: 'customer', id: 7, name: 'Pizza Hut' } }), 1)).toBe('You attached it to Pizza Hut.');
  });

  it('says a record was attached when the name is missing', () => {
    expect(eventSentence(taskEvent(1, 'edited', { id: 2, name: 'Mona Manager' }, { field: 'record', from: null, to: null }), 1)).toBe('Mona Manager attached it to a record.');
  });
});

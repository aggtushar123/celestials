import { describe, expect, it } from 'vitest';
import { assigneeOf, checkStart, newTask, startDraft, taskCount, toStart, withStart, type StartDraft } from './planDraft';
import { CHECK, SAY } from './planOptions';
import { SERVER } from './testPlans';
import { ONBOARDING } from './testTemplates';

const INITECH = { kind: 'organization' as const, id: 2, name: 'Initech' };
const draft = (): StartDraft => startDraft(ONBOARDING, INITECH, 1, '2026-10-04');

describe("the client's copy", () => {
  it("is the server's wherever both say the same thing", () => {
    expect([CHECK.RECORD, CHECK.NO_MILESTONES, CHECK.TOO_MANY_MILESTONES, CHECK.TOO_MANY_TASKS, CHECK.TASK_TITLE, CHECK.DATE, CHECK.OFFSET, CHECK.NO_PEOPLE, CHECK.ALL_MILESTONES_DONE]).toEqual([
      SERVER.CHOOSE_RECORD, SERVER.MILESTONE_COUNT, SERVER.MILESTONE_COUNT, SERVER.TOO_MANY_TASKS, SERVER.NO_TITLE, SERVER.CHOOSE_DATE, SERVER.OFFSET_RANGE, SERVER.NO_TEAMMATES, SERVER.DONE_NEEDS_MILESTONES,
    ]);
    expect([SAY.CANT_OPEN, SAY.HAS_DONE_WORK, SAY.CHOOSE_TEMPLATE, SAY.MILESTONE_HAS_DONE_WORK]).toEqual([SERVER.CANT_OPEN, SERVER.HAS_DONE_WORK, SERVER.CHOOSE_TEMPLATE, SERVER.MILESTONE_HAS_DONE_WORK]);
  });
});

describe('the New plan draft (spec §2.2)', () => {
  it('copies the template: the default name, due dates from the start, roles to resolve', () => {
    const made = draft();
    expect(made.name).toBe('Onboarding · Initech');
    expect(made.owner).toBe(1);
    expect(made.start_date).toBe('2026-10-04');
    expect(made.milestones.map((m) => [m.name, m.due_date])).toEqual([
      ['Kick-off', '2026-10-04'],
      ['Set up', '2026-10-18'],
      ['First value', '2026-11-03'],
      ['Hand-off', '2026-12-03'],
    ]);
    expect(made.milestones[0].tasks.map((task) => [task.title, task.due_date, task.role, task.assignee])).toEqual([
      ['Hold the kick-off call', '2026-10-04', 'record_owner', null],
      ['Confirm goals and success criteria', '2026-10-07', 'record_owner', null],
    ]);
    expect(made.milestones[3].tasks[1].role).toBe('plan_owner');
    expect(taskCount(made)).toBe(7);
  });

  it("resolves a role to the record's owner or the plan's owner; a hand-picked person wins", () => {
    const [first] = draft().milestones[0].tasks;
    expect(assigneeOf(first, 1, 4)).toBe(4);
    expect(assigneeOf(first, 1, null)).toBe(1);
    expect(assigneeOf({ ...first, role: 'plan_owner' }, 1, 4)).toBe(1);
    expect(assigneeOf({ ...first, role: null, assignee: 5 }, 1, 4)).toBe(5);
  });

  it('moves every date by the same days when the start date changes', () => {
    const moved = withStart({ ...draft(), milestones: draft().milestones.map((m, i) => (i === 1 ? { ...m, due_date: '2026-10-20' } : m)) }, '2026-10-06');
    expect(moved.start_date).toBe('2026-10-06');
    expect(moved.milestones.map((m) => m.due_date)).toEqual(['2026-10-06', '2026-10-22', '2026-11-05', '2026-12-05']);
    expect(moved.milestones[0].tasks[1].due_date).toBe('2026-10-09');
    expect(withStart(draft(), '').milestones[0].due_date).toBe('2026-10-04');
  });

  it("adds a task due with its milestone, for the plan's owner", () => {
    const milestone = draft().milestones[2];
    expect(newTask(milestone)).toMatchObject({ title: '', priority: 'medium', due_date: '2026-11-03', role: 'plan_owner', assignee: null });
  });

  it('builds the POST body: the record by kind, trimmed words, assignees resolved', () => {
    const made = draft();
    made.name = '  Onboarding · Initech  ';
    made.milestones = made.milestones.slice(0, 1);
    expect(toStart(made, 1, INITECH, 4)).toEqual({
      template: 1,
      customer: 2,
      name: 'Onboarding · Initech',
      owner: 1,
      start_date: '2026-10-04',
      milestones: [
        {
          name: 'Kick-off',
          due_date: '2026-10-04',
          tasks: [
            { title: 'Hold the kick-off call', priority: 'high', due_date: '2026-10-04', assignee: 4 },
            { title: 'Confirm goals and success criteria', priority: 'high', due_date: '2026-10-07', assignee: 4 },
          ],
        },
      ],
    });
    expect(toStart(made, 1, { kind: 'account', id: 14, name: 'Initech APAC' }, null)).toMatchObject({ account: 14, milestones: [{ tasks: [{ assignee: 1 }, { assignee: 1 }] }] });
  });

  it('checks before asking, in its own words, at each field', () => {
    const made = draft();
    made.name = ' ';
    made.start_date = '';
    made.milestones[1].name = '';
    made.milestones[2].tasks[0].title = ' ';
    made.milestones[3].due_date = '';
    const found = checkStart(made);
    expect(found.field).toEqual({ name: 'Give the plan a name.', start_date: 'Choose a date.' });
    expect(found.milestones[1].field).toEqual({ name: 'Give the milestone a name.' });
    expect(found.milestones[2].tasks[0]).toEqual({ title: 'Give the task a title.' });
    expect(found.milestones[3].field).toEqual({ due_date: 'Choose a date.' });
    expect(checkStart({ ...draft(), milestones: [] }).field).toEqual({ milestones: 'Choose 1 to 12 milestones.' });
    const crowded = draft();
    crowded.milestones[0].tasks = Array.from({ length: 50 }, () => newTask(crowded.milestones[0]));
    crowded.milestones[0].tasks.forEach((task) => (task.title = 'Call'));
    expect(checkStart(crowded).field).toEqual({ milestones: 'Keep it to 50 tasks in all.' });
  });

  it('keeps every date from the start date to a year after it, as the server does', () => {
    const made = draft();
    made.milestones[0].due_date = '2026-10-03';
    made.milestones[1].tasks[0].due_date = '2027-10-05';
    made.milestones[2].due_date = '2027-10-04';
    const found = checkStart(made);
    expect(found.milestones[0].field).toEqual({ due_date: SERVER.DATE_RANGE });
    expect(found.milestones[1].tasks[0]).toEqual({ due_date: SERVER.DATE_RANGE });
    expect(found.milestones[2].field).toEqual({});
  });
});

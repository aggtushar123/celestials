import { describe, expect, it } from 'vitest';
import { BOARD_COLUMNS, KIND_LABEL, OPEN_STATUSES, STATUS_LABEL } from './planOptions';
import {
  addDays,
  allMilestonesDone,
  dateRange,
  dateBounds,
  dateCheck,
  daysBetween,
  defaultPlanName,
  draftNotice,
  finishedNotice,
  hiddenTasks,
  isDraft,
  isEditable,
  isOpen,
  lengthParts,
  moveNotice,
  moveRefusal,
  newPlanPath,
  planNoun,
  pendingText,
  planOpenText,
  recordHref,
  shortDay,
  todayIso,
} from './planText';
import type { PlanRow } from './planTypes';

const ROW: PlanRow = {
  id: 43, name: 'QBR · Pizza Hut', kind: 'qbr', status: 'not_started', record: { kind: 'organization', id: 7, name: 'Pizza Hut' },
  owner: { id: 1, name: 'Alice' }, start_date: '2026-10-06', target_date: '2026-10-20', milestones_done: 0, milestones_total: 3,
  tasks_done: 0, tasks_total: 5, next_due: '2026-10-06', is_overdue: false, can_edit: true,
  pending_tasks: 0, started_by_agent: null,
};

describe('plan options', () => {
  it('orders the board columns, with cancelled apart', () => {
    expect(BOARD_COLUMNS.map((status) => STATUS_LABEL[status])).toEqual(['Not started', 'On track', 'At risk', 'Done']);
    expect(STATUS_LABEL.cancelled).toBe('Cancelled');
    expect(OPEN_STATUSES).toEqual(['not_started', 'on_track', 'at_risk']);
    expect(Object.values(KIND_LABEL)).toEqual(['Onboarding', 'Success', 'Save', 'QBR', 'Other']);
  });
});

describe('plan dates', () => {
  it('adds days across months and years without a time zone shift', () => {
    expect(addDays('2026-10-04', 0)).toBe('2026-10-04');
    expect(addDays('2026-10-20', 14)).toBe('2026-11-03');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
    expect(addDays('2026-11-03', -14)).toBe('2026-10-20');
  });

  it('counts the days between two dates', () => {
    expect(daysBetween('2026-10-04', '2026-12-03')).toBe(60);
    expect(daysBetween('2026-10-06', '2026-10-04')).toBe(-2);
  });

  it("reads today's local date", () => {
    expect(todayIso(new Date(2026, 9, 4, 23, 30))).toBe('2026-10-04');
    expect(todayIso(new Date(2026, 0, 9, 0, 5))).toBe('2026-01-09');
  });

  it('reads a range with the year and a short day without it', () => {
    expect(dateRange('2026-10-04', '2026-12-03')).toBe('4 Oct 2026 → 3 Dec 2026');
    expect(shortDay('2026-10-04')).toBe('4 Oct');
  });
});

describe('plan words', () => {
  it('names a new plan after its template and record', () => {
    expect(defaultPlanName('Onboarding', 'Globex')).toBe('Onboarding · Globex');
  });

  it('adds "plan" to a template name only when it lacks it', () => {
    expect(planNoun('Onboarding')).toBe('Onboarding plan');
    expect(planNoun('Save plan')).toBe('Save plan');
    expect(planOpenText('Save plan')).toBe('This record already has an open Save plan.');
    expect(planOpenText('Onboarding')).toBe('This record already has an open Onboarding plan.');
  });

  it("reads a template's length with its figures apart", () => {
    const parts = lengthParts({ milestone_count: 4, task_count: 7, length_days: 60 });
    expect(parts.map((part) => part.text).join('')).toBe('4 milestones · 7 tasks · 60 days');
    expect(parts.filter((part) => part.numeric).map((part) => part.text)).toEqual(['4', '7', '60']);
    expect(lengthParts({ milestone_count: 1, task_count: 1, length_days: 1 }).map((part) => part.text).join('')).toBe('1 milestone · 1 task · 1 day');
  });

  it('counts the tasks the reader cannot see', () => {
    expect(hiddenTasks(1)).toEqual({ n: 1, text: "task you can't see" });
    expect(hiddenTasks(3)).toEqual({ n: 3, text: "tasks you can't see" });
  });

  it("links a plan's record and starts a plan over it", () => {
    expect(recordHref({ kind: 'organization', id: 1 })).toBe('/organizations/1');
    expect(recordHref({ kind: 'account', id: 12 })).toBe('/accounts/12');
    expect(newPlanPath({ kind: 'organization', id: 1 })).toBe('/organizations/1/plans/new');
    expect(newPlanPath({ kind: 'account', id: 12 })).toBe('/accounts/12/plans/new');
  });

  it('says what a finished plan still allows', () => {
    expect(finishedNotice('done')).toBe('This plan is done. Only its tasks can still be ticked.');
    expect(finishedNotice('cancelled')).toBe("This plan was cancelled. Its open tasks stay on their owners' lists, and only tasks can still be ticked.");
    expect(finishedNotice('on_track')).toBeNull();
  });

  it('says where a plan moved', () => {
    expect(moveNotice('QBR · Pizza Hut', 'on_track')).toBe('Moved QBR · Pizza Hut to On track.');
  });
});

describe('plan rules on the client', () => {
  it('knows the open statuses and when every milestone is done', () => {
    expect(isOpen('at_risk')).toBe(true);
    expect(isOpen('done')).toBe(false);
    expect(allMilestonesDone(ROW)).toBe(false);
    expect(allMilestonesDone({ ...ROW, milestones_done: 3 })).toBe(true);
    expect(allMilestonesDone({ ...ROW, milestones_done: 0, milestones_total: 0 })).toBe(false);
  });

  it('refuses the moves the contract cannot make, before asking', () => {
    expect(moveRefusal(ROW, 'on_track')).toBeNull();
    expect(moveRefusal(ROW, 'at_risk')).toBeNull();
    expect(moveRefusal({ ...ROW, status: 'on_track' }, 'not_started')).toBe("A plan can't go back to Not started.");
    expect(moveRefusal(ROW, 'done')).toBe('Mark every milestone done first.');
    expect(moveRefusal({ ...ROW, milestones_done: 3 }, 'done')).toBeNull();
    expect(moveRefusal(ROW, 'cancelled')).toBe('Cancel a plan from its own page.');
    expect(moveRefusal({ ...ROW, can_edit: false }, 'on_track')).toBe("Only the plan's owner or their managers can move it.");
    expect(moveRefusal({ ...ROW, status: 'done' }, 'on_track')).toBe('A finished plan stays where it is.');
  });
});

describe('plan dates (the server\'s DATE_RANGE)', () => {
  it('bounds a date input from the start to a year after it', () => {
    expect(dateBounds('2026-10-04')).toEqual({ min: '2026-10-04', max: '2027-10-04' });
    expect(dateBounds('')).toEqual({});
  });

  it('checks a date as the server does', () => {
    expect(dateCheck('', '2026-10-04')).toBe('Choose a date.');
    expect(dateCheck('2026-10-03', '2026-10-04')).toBe('Choose a date from the start date to a year after it.');
    expect(dateCheck('2027-10-05', '2026-10-04')).toBe('Choose a date from the start date to a year after it.');
    expect(dateCheck('2027-10-04', '2026-10-04')).toBeUndefined();
    expect(dateCheck('2026-10-04', '')).toBeUndefined();
  });
});

describe('Draft plans (Agents delivery 2, Decisions 11 and 12)', () => {
  it('keeps Draft out of open, but editable', () => {
    expect(isOpen('draft')).toBe(false);
    expect(isDraft('draft')).toBe(true);
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('done')).toBe(false);
    expect(STATUS_LABEL.draft).toBe('Draft');
  });

  it('words the banner and the row figure', () => {
    expect(draftNotice(9)).toBe('This plan is a draft: Start plan creates its 9 tasks, due from today.');
    expect(draftNotice(1)).toBe('This plan is a draft: Start plan creates its 1 task, due from today.');
    expect(pendingText(9)).toEqual({ n: 9, text: 'tasks to start' });
    expect(pendingText(1)).toEqual({ n: 1, text: 'task to start' });
  });

  it('refuses a board move from or to Draft in the server words', () => {
    expect(moveRefusal({ ...ROW, status: 'draft' }, 'on_track')).toBe('Start a draft plan with Start plan.');
    expect(moveRefusal(ROW, 'draft')).toBe('Start a draft plan with Start plan.');
  });
});

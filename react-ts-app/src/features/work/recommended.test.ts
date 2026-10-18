import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import {
  DISMISS_REASONS,
  KIND_LABEL,
  REC,
  assignedStatus,
  cantDecide,
  decidedElsewhere,
  dismissedStatus,
  pickable,
  prefillAssignee,
  queueText,
  suggestedText,
  validateAssign,
  validateDismiss,
} from './recommended';
import { ALICE, CARL, REC_AGENT, REC_RENEWAL, REC_TICKETS, recRow } from './testWorkFixtures';
import type { AssigneeOption } from './workTypes';

const people: AssigneeOption[] = [
  { id: 1, name: 'Alice', function: 'cs', can_open: true },
  { id: 3, name: 'Carl CSM', function: 'cs', can_open: true },
  { id: 4, name: 'Dana CSM', function: 'cs', can_open: false },
];

describe('recommended: words', () => {
  it('labels every kind and every dismiss reason', () => {
    expect(KIND_LABEL).toEqual({
      renewal_due: 'Renewal',
      health_drop: 'Health drop',
      urgent_tickets: 'Urgent tickets',
      overdue_tasks: 'Overdue tasks',
      open_questions: 'Open questions',
      anomaly: 'Anomaly',
      agent_action: 'AI agent',
    });
    expect(DISMISS_REASONS.map((r) => `${r.value}:${r.label}`)).toEqual([
      'already_handled:Already handled',
      'not_relevant:Not relevant',
      'wrong_person:Wrong person',
      'other:Other',
    ]);
  });

  it('says who it is suggested for, and whose queue it is in', () => {
    expect(suggestedText(REC_RENEWAL, ALICE.id)).toBe('Suggested for Carl CSM');
    expect(suggestedText(REC_RENEWAL, CARL.id)).toBe('Suggested for you');
    expect(suggestedText(REC_TICKETS, ALICE.id)).toBe("Suggested for Dana CSM, who can't open it now");
    expect(suggestedText(recRow({ id: 9, kind: 'anomaly', title: 'Check', suggested_assignee: null }), ALICE.id)).toBe('Nobody suggested');
    expect(
      suggestedText(recRow({ id: 9, kind: 'anomaly', title: 'Check', suggested_assignee: { id: 5, name: 'Erin Former', active: false, can_open: true } }), ALICE.id),
    ).toBe('Suggested for Erin Former (no longer active)');
    expect(queueText(REC_RENEWAL, ALICE.id)).toBeNull();
    expect(queueText(REC_AGENT, ALICE.id)).toBe("In Carl CSM's queue");
  });

  it('says what happened', () => {
    expect(assignedStatus('Prep', { id: 1, name: 'Alice', active: true }, 1)).toBe('Assigned to you: Prep.');
    expect(assignedStatus('Prep', { id: 3, name: 'Carl CSM', active: true }, 1)).toBe('Assigned to Carl CSM: Prep.');
    expect(dismissedStatus('Prep')).toBe('Dismissed: Prep.');
  });
});

describe('recommended: the Assign prefill (contract: do not prefill someone who can no longer take it)', () => {
  it('prefills only an active suggested person who can open the record', () => {
    expect(prefillAssignee(REC_RENEWAL)).toBe(3);
    expect(prefillAssignee(REC_TICKETS)).toBeNull();
    expect(prefillAssignee(recRow({ id: 9, kind: 'anomaly', title: 'Check', suggested_assignee: null }))).toBeNull();
    expect(prefillAssignee(recRow({ id: 9, kind: 'anomaly', title: 'Check', suggested_assignee: { id: 3, name: 'Carl CSM', active: false, can_open: true } }))).toBeNull();
  });

  it('keeps a choice only while the picker offers it enabled; keeps it while the list loads', () => {
    expect(pickable(null, 3)).toBe(3);
    expect(pickable(people, 3)).toBe(3);
    expect(pickable(people, 4)).toBeNull();
    expect(pickable(people, 99)).toBeNull();
    expect(pickable(people, null)).toBeNull();
  });
});

describe('recommended: refusing in the browser, in the server’s words', () => {
  it('checks Assign', () => {
    expect(validateAssign({ assignee: 3, due: '2026-10-09', title: 'Prep' })).toEqual({});
    expect(validateAssign({ assignee: null, due: '', title: '  ' })).toEqual({
      assignee_id: 'Choose who does it.',
      due_date: 'Choose a date.',
      title: 'Give the task a title.',
    });
    expect(validateAssign({ assignee: 3, due: '2026-02-30', title: 'x'.repeat(256) })).toEqual({
      due_date: 'Choose a date.',
      title: 'Keep the title under 255 characters.',
    });
  });

  it('checks Dismiss', () => {
    expect(validateDismiss('', '')).toEqual({ reason: 'Choose a reason.' });
    expect(validateDismiss('not_relevant', '')).toEqual({});
    expect(validateDismiss('other', '   ')).toEqual({ note: 'Say why.' });
    expect(validateDismiss('other', 'x'.repeat(256))).toEqual({ note: 'Keep the note under 255 characters.' });
    expect(validateDismiss('other', 'Moving to annual billing')).toEqual({});
  });
});

describe('recommended: outcomes', () => {
  it('reads a decision that can no longer happen: 409 with its own sentence, 404, else nothing', () => {
    const already = new ApiError(409, { code: 'ALREADY_DECIDED', detail: 'Mona Manager already assigned this.', recommendation: {} }, 'Mona Manager already assigned this.');
    expect(decidedElsewhere(already)).toBe('Mona Manager already assigned this.');
    expect(decidedElsewhere(new ApiError(409, {}, 'Request failed (409)'))).toBe(REC.ALREADY_DECIDED);
    expect(decidedElsewhere(new ApiError(404, { detail: 'No such recommendation.' }, 'No such recommendation.'))).toBe("This recommendation isn't there any more.");
    expect(decidedElsewhere(new ApiError(403, { code: 'CANT_DECIDE', detail: "You can't decide this recommendation." }, 'x'))).toBeNull();
    expect(decidedElsewhere(new Error('offline'))).toBeNull();
  });

  it('knows a 403 CANT_DECIDE, and only that', () => {
    expect(cantDecide(new ApiError(403, { code: 'CANT_DECIDE', detail: "You can't decide this recommendation." }, 'x'))).toBe(true);
    expect(cantDecide(new ApiError(403, { detail: 'Forbidden.' }, 'x'))).toBe(false);
    expect(cantDecide(new ApiError(404, { code: 'CANT_DECIDE' }, 'x'))).toBe(false);
    expect(cantDecide(new Error('offline'))).toBe(false);
  });
});

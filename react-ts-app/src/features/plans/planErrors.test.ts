import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { firstError, hasErrors, isPlanOpen, NO_ERRORS, planErrors } from './planErrors';

const refused = (status: number, body: unknown) => new ApiError(status, body, 'Request failed');
const FIELDS = ['name', 'owner', 'start_date', 'milestones'];

describe('planErrors (spec §4 "Refusals")', () => {
  it('puts a field refusal at its field and an unknown key on the form', () => {
    expect(planErrors(refused(400, { owner: ["They can't open this record."], colour: ['No.'] }), FIELDS, 'Could not.')).toEqual({
      form: 'No.',
      field: { owner: "They can't open this record." },
      milestones: [],
    });
  });

  it('aligns nested milestone and task refusals with what was sent', () => {
    const body = { milestones: [{}, { name: ['This field may not be blank.'], tasks: [{}, { assignee: ["They can't open this record."] }] }] };
    expect(planErrors(refused(400, body), FIELDS, 'Could not.').milestones).toEqual([
      { field: {}, tasks: [] },
      { field: { name: 'This field may not be blank.' }, tasks: [{}, { assignee: "They can't open this record." }] },
    ]);
  });

  it('reads a message for the whole list of milestones as a field', () => {
    expect(planErrors(refused(400, { milestones: ['A plan holds at most 12 milestones.'] }), FIELDS, 'Could not.').field).toEqual({
      milestones: 'A plan holds at most 12 milestones.',
    });
  });

  it('puts detail and non_field_errors on the form, and falls back for anything else', () => {
    expect(planErrors(refused(403, { detail: "Only the plan's owner or their managers can change it." }), FIELDS, 'Could not.').form).toBe(
      "Only the plan's owner or their managers can change it.",
    );
    expect(planErrors(refused(400, { non_field_errors: ['You can own at most 50 templates.'] }), FIELDS, 'Could not.').form).toBe('You can own at most 50 templates.');
    expect(planErrors(new Error('offline'), FIELDS, 'Could not.')).toEqual({ form: 'Could not.', field: {}, milestones: [] });
    expect(planErrors(refused(404, { detail: 'Not found.' }), FIELDS, 'Could not.').form).toBe('It is no longer there, or you can no longer open it.');
  });

  it('says whether anything was refused, and its first message', () => {
    expect(hasErrors(NO_ERRORS)).toBe(false);
    expect(hasErrors({ field: {}, milestones: [{ field: {}, tasks: [{ title: 'Give the task a title.' }] }] })).toBe(true);
    expect(firstError({ field: {}, milestones: [{ field: {}, tasks: [{ title: 'Give the task a title.' }] }] })).toBe('Give the task a title.');
    expect(firstError({ form: 'No.', field: { name: 'Later.' }, milestones: [] })).toBe('No.');
  });

  it('knows a PLAN_OPEN conflict', () => {
    expect(isPlanOpen(refused(409, { code: 'PLAN_OPEN', plan_id: 41, detail: 'x' }))).toBe(true);
    expect(isPlanOpen(refused(409, { code: 'PLAN_HAS_DONE_WORK', detail: 'x' }))).toBe(false);
    expect(isPlanOpen(new Error('x'))).toBe(false);
  });
});

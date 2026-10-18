import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { answerErrors, surveyErrors, THROTTLED } from './surveyErrors';

const refusal = (status: number, body: unknown) => new ApiError(status, body, 'Refused');

describe('surveyErrors: a write refusal at its field (spec §2.2)', () => {
  it('puts each field the server names at that field', () => {
    expect(surveyErrors(refusal(400, { roles: ['Choose at least one role.'], subject: ['A sent survey can only be renamed or re-shared.'] }))).toEqual({
      roles: 'Choose at least one role.',
      subject: 'A sent survey can only be renamed or re-shared.',
    });
    expect(surveyErrors(refusal(400, { segment: ['Nobody to send to.'] }))).toEqual({ segment: 'Nobody to send to.' });
  });

  it('puts a detail (403, 409, 429) and an unknown key at the form', () => {
    expect(surveyErrors(refusal(429, { detail: 'You can send at most 20 surveys a day. Try again tomorrow.' }))).toEqual({
      form: 'You can send at most 20 surveys a day. Try again tomorrow.',
    });
    expect(surveyErrors(refusal(400, { non_field_errors: ['Odd.'] }))).toEqual({ form: 'Odd.' });
  });

  it('falls back for anything that is not an ApiError', () => {
    expect(surveyErrors(new Error('offline'))).toEqual({ form: 'Could not save this survey. Try again.' });
    expect(surveyErrors(new Error('offline'), 'Could not send this survey. Try again.')).toEqual({ form: 'Could not send this survey. Try again.' });
  });
});

describe('answerErrors: the hosted form', () => {
  it('reads every 404 as the one expired page', () => {
    expect(answerErrors(refusal(404, { detail: 'This link has expired.' }))).toBe('expired');
  });

  it('puts a bad score or comment at its field', () => {
    expect(answerErrors(refusal(400, { score: ['Choose a score from 0 to 10.'] }))).toEqual({ score: 'Choose a score from 0 to 10.' });
    expect(answerErrors(refusal(400, { comment: ['Ensure this field has no more than 2000 characters.'] }))).toEqual({
      comment: 'Ensure this field has no more than 2000 characters.',
    });
  });

  it('says to wait on a 429, and to try again on anything else', () => {
    expect(answerErrors(refusal(429, { detail: 'Request was throttled.' }))).toEqual({ form: THROTTLED });
    expect(answerErrors(new TypeError('Failed to fetch'))).toEqual({ form: 'Could not send your answer. Check your connection and try again.' });
  });
});

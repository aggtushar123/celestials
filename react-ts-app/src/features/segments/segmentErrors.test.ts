import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { formErrors, rulesMessage } from './segmentErrors';

describe('segment 400s by field', () => {
  it("puts each field's first message at that field, and a detail at the form", () => {
    const err = new ApiError(400, { name: ['This field may not be blank.'], rules: ['Unknown field "mood" for organisations.'] }, 'x');
    expect(formErrors(err)).toEqual({ name: 'This field may not be blank.', rules: 'Unknown field "mood" for organisations.' });
    expect(formErrors(new ApiError(400, { detail: 'You can own at most 50 segments.' }, 'x'))).toEqual({ form: 'You can own at most 50 segments.' });
    expect(formErrors(new ApiError(400, { shared_with: ['Choose at least one teammate.'] }, 'x'))).toEqual({ shared_with: 'Choose at least one teammate.' });
  });

  it('puts the first message of a key no field owns at the form, beside the fields it does place', () => {
    const err = new ApiError(400, { name: ['Taken.'], non_field_errors: ['Something about the whole segment.'] }, 'x');
    expect(formErrors(err)).toEqual({ name: 'Taken.', form: 'Something about the whole segment.' });
    expect(formErrors(new ApiError(400, { alert_on_changes: ['Must be a valid boolean.'] }, 'x'))).toEqual({ form: 'Must be a valid boolean.' });
    expect(formErrors(new ApiError(400, { detail: 'Limit.', non_field_errors: ['Other.'] }, 'x'))).toEqual({ form: 'Limit.' });
  });

  it("falls back to the error's own message, or the caller's own words for a network failure", () => {
    expect(formErrors(new ApiError(500, null, 'Request failed (500)'))).toEqual({ form: 'Request failed (500)' });
    // No ApiError body to read a field from, so a network failure falls back
    // to whatever the caller passed in — not a message formErrors invents.
    expect(formErrors(new TypeError('Failed to fetch'), 'Could not preview this segment.')).toEqual({ form: 'Could not preview this segment.' });
  });

  it('reads a preview refusal as its rules message', () => {
    expect(rulesMessage(new ApiError(400, { rules: ['"is" cannot be used with Health score.'] }, 'x'))).toBe('"is" cannot be used with Health score.');
    expect(rulesMessage(new TypeError('Failed to fetch'))).toBe('Could not preview this segment.');
  });
});

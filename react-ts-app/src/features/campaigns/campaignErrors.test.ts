import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { campaignErrors, MISSING, sendRefusal } from './campaignErrors';

const refused = (status: number, body: unknown) => new ApiError(status, body, 'Request failed');

describe('campaign refusals (spec §2.2)', () => {
  it('puts a field refusal at its field and anything else above the form', () => {
    expect(campaignErrors(refused(400, { body: ['Use {first_name}, {organisation} or {sender_name}.'], name: ['This field may not be blank.'] }))).toEqual({
      body: 'Use {first_name}, {organisation} or {sender_name}.',
      name: 'This field may not be blank.',
    });
    expect(campaignErrors(refused(400, { non_field_errors: ['You can own at most 50 campaigns.'] }))).toEqual({ form: 'You can own at most 50 campaigns.' });
    expect(campaignErrors(refused(403, { detail: "Only the campaign's owner can change it." }))).toEqual({ form: "Only the campaign's owner can change it." });
    expect(campaignErrors(refused(404, { detail: 'Not found.' }))).toEqual({ form: MISSING });
    expect(campaignErrors(new Error('offline'))).toEqual({ form: 'Could not save this campaign. Try again.' });
  });

  it("keeps a send's form-less refusal at the Send button and a field's at the form (Contract note 8)", () => {
    expect(sendRefusal(refused(400, { detail: "Email isn't set up for this workspace yet, so campaigns can't be sent." }))).toEqual({
      at: 'send',
      message: "Email isn't set up for this workspace yet, so campaigns can't be sent.",
    });
    expect(sendRefusal(refused(400, { roles: ['Choose at least one role.'] }))).toEqual({ at: 'form', errors: { roles: 'Choose at least one role.' } });
    expect(sendRefusal(new Error('offline'))).toEqual({ at: 'send', message: 'Could not send it. Try again.' });
  });
});

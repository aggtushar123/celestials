import { describe, expect, it } from 'vitest';
import { changedFields, checkDraft, emptyDraft, fromCampaign, insertMergeField, toWrite, unknownFields, type CampaignDraft } from './campaignDraft';
import type { Campaign } from './campaignTypes';

const draft = (patch: Partial<CampaignDraft> = {}): CampaignDraft => ({ ...emptyDraft(7), name: 'Win-back', subject: 'Hi {first_name}', body: 'Hello', ...patch });
const SAVED: Campaign = {
  id: 11,
  name: 'Win-back',
  status: 'active',
  segment: { id: 7, name: 'Renewal risk', kind: 'organization' },
  roles: ['champion', 'decision_maker'],
  owner: { id: 1, name: 'Alice' },
  is_owner: true,
  sharing: 'workspace',
  shared_with: [],
  last_send: null,
  needs_segment: false,
  updated_at: '2026-10-02T12:05:00Z',
  subject: 'Hi {first_name}',
  body: 'Hello',
  legacy_recipients: [],
  legacy_hidden: 0,
  can_delete: false,
};

describe('the campaign draft (spec §2.2)', () => {
  it('starts private with Surveys default roles, and reads a saved one back', () => {
    expect(emptyDraft()).toEqual({ name: '', segment: null, roles: ['champion', 'decision_maker'], subject: '', body: '', sharing: 'private', sharedWith: [] });
    expect(fromCampaign(SAVED)).toEqual({ name: 'Win-back', segment: 7, roles: ['champion', 'decision_maker'], subject: 'Hi {first_name}', body: 'Hello', sharing: 'workspace', sharedWith: [] });
    expect(fromCampaign({ ...SAVED, segment: { id: 9, name: 'Champions', kind: 'contact' }, roles: [] }).roles).toEqual(['champion', 'decision_maker']);
  });

  it('finds merge fields that are not one of the three, ignoring a lone brace', () => {
    expect(unknownFields('Hi {first_name} at {organisation}, {sender_name}')).toEqual([]);
    expect(unknownFields('Hi {nickname} and {}')).toEqual(['nickname', '']);
    expect(unknownFields('Price: {10 or } more')).toEqual(['10 or ']);
    expect(unknownFields('a { b')).toEqual([]);
  });

  it('asks only a name to save, and a segment, roles, subject and body to send', () => {
    expect(checkDraft(draft({ name: ' ', subject: '', body: '' }), 'customer')).toEqual({ name: 'Give it a name.' });
    expect(checkDraft(draft({ segment: null, subject: '', body: '' }), null, { forSend: true })).toEqual({
      segment: 'Choose a segment first.',
      subject: 'Write a subject line.',
      body: 'Write the email.',
    });
    expect(checkDraft(draft({ roles: [] }), 'account')).toEqual({ roles: 'Choose at least one role.' });
    expect(checkDraft(draft({ roles: [] }), 'contact')).toEqual({});
    expect(checkDraft(draft({ body: 'Hi {nick}' }), 'customer')).toEqual({ body: 'Use {first_name}, {organisation} or {sender_name}.' });
    expect(checkDraft(draft({ sharing: 'people' }), 'customer')).toEqual({ shared_with: 'Choose at least one teammate.' });
    expect(checkDraft(draft({ body: 'x'.repeat(5001) }), 'customer')).toEqual({ body: 'Keep the body to 5000 characters.' });
  });

  it('writes the name and subject trimmed and the body as written (trim_whitespace=False), roles only for organisation and account segments, people only with "people"', () => {
    expect(toWrite(draft({ name: ' Win-back ', subject: ' Hi ', body: '  Hello \n\n' }), 'contact')).toEqual({
      name: 'Win-back', segment: 7, roles: [], subject: 'Hi', body: '  Hello \n\n', sharing: 'private',
    });
    expect(toWrite(draft({ sharing: 'people', sharedWith: [{ id: 4, name: 'Carl CSM' }] }), 'customer')).toMatchObject({ roles: ['champion', 'decision_maker'], sharing: 'people', shared_with: [4] });
  });

  it('patches only what changed, segment and roles together', () => {
    const same = toWrite(fromCampaign(SAVED), 'customer');
    expect(changedFields(same, SAVED)).toEqual({});
    expect(changedFields({ ...same, body: 'New' }, SAVED)).toEqual({ body: 'New' });
    expect(changedFields({ ...same, roles: ['champion'] }, SAVED)).toEqual({ segment: 7, roles: ['champion'] });
    expect(changedFields({ ...same, sharing: 'private' }, SAVED)).toEqual({ sharing: 'private' });
  });

  it('inserts a merge field at the caret, over a selection, and puts the caret after it', () => {
    expect(insertMergeField('Hello , welcome', 6, 6, 'first_name')).toEqual({ text: 'Hello {first_name}, welcome', caret: 18 });
    expect(insertMergeField('Hello there', 6, 11, 'organisation')).toEqual({ text: 'Hello {organisation}', caret: 20 });
  });
});

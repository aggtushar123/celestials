import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { B_ESCALATION, B_PIZZA, ESCALATION_REPLY } from './testBundleFixtures';
import { ESCALATION, displayOrder, fromMarkers, handlerLines, readHandlerRefusal, runsLastText, toMarkers, withoutMarker } from './escalationText';
import type { Escalation } from './bundleTypes';

const SAID = { by: 'Jesh Sanghvi', quote: '@Faiz Jamal can you take this?', named: 'Faiz Jamal' };
const ESC: Escalation = { function: 'engineering', function_label: 'Engineering', handler: { id: 11, name: 'Faiz Jamal', function_label: 'Customer Success' }, via: 'thread', decision: SAID, can_change: true };
const JESH = { id: 12, name: 'Jesh Sanghvi', function_label: 'Engineering' };
const PLACES = B_ESCALATION.steps[3].placeholders;

describe('handlerLines (frontend Decision 2)', () => {
  it('says the thread decided, and who', () => {
    expect(handlerLines(ESC, 'Globex (QA)')).toEqual({ source: 'Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"', person: 'Faiz Jamal (Customer Success)' });
  });
  it('says the thread named someone no member matches', () => {
    expect(handlerLines({ ...ESC, via: 'unresolved', handler: null, decision: { ...SAID, named: 'Faiz Khan' } }, 'Globex (QA)')).toEqual({ source: 'The thread named Faiz Khan, but no member matches. Choose who handles this.', person: null });
  });
  it('says no one was named, and who it goes to instead', () => {
    expect(handlerLines({ ...ESC, via: 'team', handler: JESH, decision: null }, 'Globex (QA)').source).toBe("No one was named in the thread, so it goes to Jesh Sanghvi (on Globex (QA)'s account team)");
    expect(handlerLines({ ...ESC, via: 'head', handler: JESH, decision: null }, 'Globex (QA)').source).toBe('No one was named in the thread, so it goes to Jesh Sanghvi (Engineering head)');
    expect(handlerLines({ ...ESC, via: 'nobody', handler: null, decision: null }, 'Globex (QA)')).toEqual({ source: ESCALATION.CHOOSE, person: null });
  });
  it('after a department Change, still says what the thread said (R5)', () => {
    const said = 'The thread said: Jesh, "@Faiz Jamal can you take this?"';
    expect(handlerLines({ ...ESC, via: 'head', handler: JESH }, 'Globex (QA)')).toEqual({ source: said, person: 'Jesh Sanghvi (Engineering head)' });
    expect(handlerLines({ ...ESC, via: 'team', handler: JESH }, 'Globex (QA)')).toEqual({ source: said, person: "Jesh Sanghvi (on Globex (QA)'s account team)" });
    expect(handlerLines({ ...ESC, via: 'nobody', handler: null }, 'Globex (QA)')).toEqual({ source: said, person: null });
    expect(handlerLines({ ...ESC, via: 'head', handler: null }, 'Globex (QA)')).toEqual({ source: said, person: null });
  });
  it('a chosen person keeps what the thread said', () => {
    const chosen = { ...ESC, via: 'chosen' as const, handler: { id: 13, name: 'Erin Engineer', function_label: 'Engineering' } };
    expect(handlerLines(chosen, 'Globex (QA)')).toEqual({ source: 'The thread said: Jesh, "@Faiz Jamal can you take this?"', person: 'Erin Engineer (Engineering)' });
    expect(handlerLines({ ...chosen, decision: null }, 'Globex (QA)').source).toBeNull();
  });
  it('a person with no department reads as the name alone', () => {
    expect(handlerLines({ ...ESC, handler: { id: 11, name: 'Faiz Jamal', function_label: '' } }, 'Globex (QA)').person).toBe('Faiz Jamal');
  });
});

describe('displayOrder and runsLastText (Decision 1)', () => {
  it('lists an escalation reply first and the rest by position', () => {
    expect(displayOrder(B_ESCALATION).map((s) => s.id)).toEqual([614, 611, 612, 613]);
    expect(runsLastText(B_ESCALATION)).toBe('Runs last, once the Jira issue exists');
  });
  it('leaves every other bundle in position order', () => {
    expect(displayOrder(B_PIZZA).map((s) => s.position)).toEqual([1, 2, 3]);
  });
  it('says only "Runs last" without a Jira issue', () => {
    expect(runsLastText({ ...B_ESCALATION, steps: B_ESCALATION.steps.filter((s) => s.kind !== 'jira.create') })).toBe('Runs last');
  });
});

describe('the reply markers (Decision 3)', () => {
  it('shows each placeholder as its marker and back', () => {
    const shown = toMarkers(ESCALATION_REPLY, PLACES);
    expect(shown).toBe('Thanks Tushar. Logged as [Jira key] ([Jira link]) with Faiz Jamal (Customer Success).');
    expect(fromMarkers(shown, ESCALATION_REPLY, PLACES)).toBe(ESCALATION_REPLY);
  });
  it('keeps the person words and a removed marker stays removed', () => {
    expect(fromMarkers('Thanks Tushar! It is [Jira key].', ESCALATION_REPLY, PLACES)).toBe('Thanks Tushar! It is {{step 1.ticket_key}}.');
  });
  it('a marker typed beyond the stored ones stays words', () => {
    expect(fromMarkers('[Jira key] and again [Jira key] ([Jira link])', ESCALATION_REPLY, PLACES)).toBe('{{step 1.ticket_key}} and again [Jira key] ({{step 1.ticket_url}})');
  });
  it('text with no placeholders is untouched', () => {
    expect(fromMarkers('[Jira key]', 'No link here.', [])).toBe('[Jira key]');
  });
});

describe('readHandlerRefusal (contract §4)', () => {
  it('reads a field, the detail, and a lost bundle', () => {
    expect(readHandlerRefusal(new ApiError(400, { user_id: ['No such member.'] }, 'x'))).toEqual({ field: 'user_id', message: 'No such member.', lost: false });
    expect(readHandlerRefusal(new ApiError(400, { function: ['Choose a department.'] }, 'x'))).toEqual({ field: 'function', message: 'Choose a department.', lost: false });
    expect(readHandlerRefusal(new ApiError(409, { code: 'NOT_AN_ESCALATION', detail: 'Only an escalation has someone who handles it.' }, 'x'))).toEqual({ field: null, message: 'Only an escalation has someone who handles it.', lost: false });
    expect(readHandlerRefusal(new ApiError(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' }, 'x')).lost).toBe(true);
    expect(readHandlerRefusal(new Error('down'))).toEqual({ field: null, message: ESCALATION.SAVE_FAILED, lost: false });
  });
});

describe('withoutMarker (owner decision: a removed link takes its brackets)', () => {
  it('takes a wrapped marker with its space and brackets', () => {
    expect(withoutMarker('Logged as [Jira key] ([Jira link]) with Faiz', '[Jira link]')).toBe('Logged as [Jira key] with Faiz');
  });
  it('takes a wrapped marker at the start without a space', () => {
    expect(withoutMarker('([Jira link]) is the link', '[Jira link]')).toBe('is the link');
  });
  it('takes an unwrapped marker alone', () => {
    expect(withoutMarker('Logged as [Jira key] now', '[Jira key]')).toBe('Logged as now');
  });
  it('leaves text without the marker as it is', () => {
    expect(withoutMarker('Nothing here', '[Jira link]')).toBe('Nothing here');
  });
});

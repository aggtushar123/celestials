import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { createErrors, deleteRefusal, loadError, saveRefusal } from './canvasErrors';
import { SAY } from './canvasOptions';

const api = (status: number, body: unknown) => new ApiError(status, body, 'Request failed');

describe('canvas refusals', () => {
  it('reads a 409 CANVAS_CHANGED as "someone else changed it"', () => {
    expect(saveRefusal(api(409, { code: 'CANVAS_CHANGED', detail: SAY.CHANGED }))).toEqual({ changed: true, messages: [SAY.CHANGED] });
  });

  it('lists field refusals name, nodes, edges first, then the rest (Contract note 11)', () => {
    const body = { non_field_errors: ['Odd.'], edges: ['Bad line.'], nodes: [SAY.PEOPLE, 'second'], name: [SAY.NAME] };
    expect(saveRefusal(api(400, body))).toEqual({ changed: false, messages: [SAY.NAME, SAY.PEOPLE, 'Bad line.', 'Odd.'] });
  });

  it('reads a 404 on save as the missing-map sentence (deleted, or access lost, while open)', () => {
    expect(saveRefusal(api(404, { detail: 'Not found.' }))).toEqual({ changed: false, messages: [SAY.MISSING] });
  });

  it('falls back to a sentence for anything unreadable', () => {
    expect(saveRefusal(new Error('boom'))).toEqual({ changed: false, messages: ['Could not save this map. Try again.'] });
    expect(saveRefusal(api(403, { detail: 'No.' }))).toEqual({ changed: false, messages: ['No.'] });
  });

  it('puts a create refusal at the name, or above the form', () => {
    expect(createErrors(api(400, { name: [SAY.NAME] }))).toEqual({ name: SAY.NAME });
    expect(createErrors(api(400, { start: ['Pick one.'] }))).toEqual({ form: 'Pick one.' });
    expect(createErrors(new Error('x'))).toEqual({ form: 'Could not create the map. Try again.' });
  });

  it("shows the server's 403 sentence for a delete", () => {
    expect(deleteRefusal(api(403, { detail: SAY.NOT_DELETER }))).toBe(SAY.NOT_DELETER);
    expect(deleteRefusal(new Error('x'))).toBe('Could not delete the map. Try again.');
  });

  it('reads a 404 load as missing', () => {
    expect(loadError(api(404, { detail: 'Not found.' }))).toEqual({ missing: true, message: SAY.MISSING });
    expect(loadError(api(500, {}))).toEqual({ missing: false, message: 'Request failed' });
  });
});

import { describe, expect, it } from 'vitest';
import { BANDS, bandTone, formatFigure, lowFilterLabel, questionFor, SCALE_ENDS, scaleOf } from './questions';

describe('the question per type (backend Decision 9)', () => {
  it('words each type exactly as the backend does, with the workspace name', () => {
    expect(questionFor('nps', 'Acme Inc')).toBe('How likely are you to recommend Acme Inc to a friend or colleague?');
    expect(questionFor('csat', 'Acme Inc')).toBe('How satisfied are you with Acme Inc?');
    expect(questionFor('ces', 'Acme Inc')).toBe('How easy is it to get what you need from Acme Inc?');
  });

  it('lists each scale from end to end: NPS 0–10, CSAT 1–5, CES 1–7', () => {
    expect(scaleOf('nps')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(scaleOf('csat')).toEqual([1, 2, 3, 4, 5]);
    expect(scaleOf('ces')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('labels the NPS ends "Not likely" and "Very likely" (spec §2.4)', () => {
    expect(SCALE_ENDS.nps).toEqual(['Not likely', 'Very likely']);
  });
});

describe('bands and figures (backend Decisions 10, 11)', () => {
  it('names the bands low first, per type', () => {
    expect(BANDS.nps).toEqual(['detractors', 'passives', 'promoters']);
    expect(BANDS.csat).toEqual(['low', 'mid', 'high']);
    expect(BANDS.ces).toEqual(['low', 'mid', 'high']);
  });

  it('tones detractors and low scores as low, promoters and high as high', () => {
    expect([bandTone('detractors'), bandTone('low'), bandTone('passives'), bandTone('mid'), bandTone('promoters'), bandTone('high')]).toEqual([
      'low',
      'low',
      'mid',
      'mid',
      'high',
      'high',
    ]);
  });

  it('signs NPS, puts CSAT and CES in percent, and shows no figure as a dash', () => {
    expect(formatFigure('nps', 32)).toBe('+32');
    expect(formatFigure('nps', -5)).toBe('−5');
    expect(formatFigure('nps', 0)).toBe('0');
    expect(formatFigure('csat', 76)).toBe('76%');
    expect(formatFigure('ces', null)).toBe('—');
  });

  it('calls the low filter Detractors for NPS and Low scores otherwise (plan Decision 9)', () => {
    expect(lowFilterLabel('nps')).toBe('Detractors');
    expect(lowFilterLabel('csat')).toBe('Low scores');
    expect(lowFilterLabel('ces')).toBe('Low scores');
  });
});

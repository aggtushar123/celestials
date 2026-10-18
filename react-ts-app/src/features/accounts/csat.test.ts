import { describe, expect, it } from 'vitest';
import type { Survey } from '../customers/customersSlice';
import { csatBand, csatBreakdown } from './csat';

function survey(score: number | null, extra: Partial<Survey> = {}): Survey {
  return {
    id: 1,
    survey_type: 'csat',
    survey_type_display: 'CSAT',
    status: 'responded',
    status_display: 'Responded',
    score,
    sent_at: '2026-09-01',
    responded_at: '2026-09-03',
    companies: [],
    account_id: 12,
    account_name: 'Pizza EMEA',
    created_at: '2026-09-01T10:00:00Z',
    ...extra,
  };
}

describe('csatBand (the backend\'s CSAT_BANDS)', () => {
  it('puts a score in the first band whose upper bound it reaches', () => {
    expect(csatBand(0)).toBe('very_dissatisfied');
    expect(csatBand(20)).toBe('very_dissatisfied');
    expect(csatBand(21)).toBe('dissatisfied');
    expect(csatBand(60)).toBe('neutral');
    expect(csatBand(80)).toBe('satisfied');
    expect(csatBand(100)).toBe('very_satisfied');
    expect(csatBand(120)).toBe('very_satisfied');
  });
});

describe('csatBreakdown (the backend\'s csat_breakdown)', () => {
  it('counts answered CSAT surveys only, every band listed best first', () => {
    const out = csatBreakdown([
      survey(90),
      survey(75),
      survey(75),
      survey(50),
      survey(10),
      survey(40, { survey_type: 'nps' }),
      survey(null, { status: 'sent' }),
      survey(null),
    ]);
    expect(out.responses).toBe(5);
    expect(out.bands).toEqual([
      { key: 'very_satisfied', label: 'Very Satisfied', count: 1, share: 20 },
      { key: 'satisfied', label: 'Satisfied', count: 2, share: 40 },
      { key: 'neutral', label: 'Neutral', count: 1, share: 20 },
      { key: 'dissatisfied', label: 'Dissatisfied', count: 0, share: 0 },
      { key: 'very_dissatisfied', label: 'Very Dissatisfied', count: 1, share: 20 },
    ]);
  });

  it('rounds shares to two places and is all zeros with no answers', () => {
    expect(csatBreakdown([survey(90), survey(90), survey(10)]).bands[0].share).toBe(66.67);
    expect(csatBreakdown([]).bands.every((band) => band.count === 0 && band.share === 0)).toBe(true);
  });
});

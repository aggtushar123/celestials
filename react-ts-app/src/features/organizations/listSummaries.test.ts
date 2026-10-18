import { describe, expect, it } from 'vitest';
import { callsSummary, opportunitiesSummary, peopleSummary, risksSummary, type SummaryPart } from './listSummaries';
import { CALLS, CONTACTS, OPPORTUNITIES, RISKS } from './testStory';

const text = (parts: SummaryPart[]) => parts.map((part) => `${part.value} ${part.label}`).join(' · ');

describe('the one-line summaries that replace the stat cards (spec 2026-09-27 §2–4)', () => {
  it('people: count, decision makers, active, and the share with positive sentiment', () => {
    expect(text(peopleSummary(CONTACTS))).toBe('3 people · 1 decision maker · 2 active · 33% positive sentiment');
    expect(text(peopleSummary([CONTACTS[0]]))).toBe('1 person · 1 decision maker · 1 active · 100% positive sentiment');
    expect(text(peopleSummary([]))).toBe('0 people · 0 decision makers · 0 active · 0% positive sentiment');
  });

  it("opportunities and risks: today's four figures each", () => {
    expect(text(opportunitiesSummary(OPPORTUNITIES, 'USD'))).toBe('2 opportunities · $1,500.00 pipeline MRR · 1 high priority · 0 closed won');
    expect(text(risksSummary(RISKS, 'USD'))).toBe('1 risk · $800.00 MRR at risk · 1 high priority · 0 realised');
  });

  it('leaves Closed Lost out of the pipeline MRR (pipelines spec §1)', () => {
    const lost = { ...OPPORTUNITIES[1], id: 63, mrr: '900.00', stage: 'closed_lost' as const, stage_display: 'Closed Lost' };
    expect(text(opportunitiesSummary([...OPPORTUNITIES, lost], 'USD'))).toBe(
      '3 opportunities · $1,500.00 pipeline MRR · 1 high priority · 0 closed won',
    );
  });

  it('calls: count, time on calls when known, and the sentiment split', () => {
    expect(text(callsSummary(CALLS))).toBe('2 calls · 1 h 15 min on calls · 1 positive · 0 neutral · 1 negative');
    expect(text(callsSummary([{ ...CALLS[0], duration_minutes: null }]))).toBe('1 call · 0 positive · 0 neutral · 1 negative');
  });
});

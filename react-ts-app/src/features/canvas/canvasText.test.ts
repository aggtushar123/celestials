import { describe, expect, it } from 'vitest';
import {
  contacted,
  contactedText,
  defaultMapName,
  editedText,
  labelText,
  peopleText,
  relationshipText,
  sentimentOf,
  surveyText,
} from './canvasText';

const NOW = new Date('2026-10-04T12:00:00Z');
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('canvas display text', () => {
  it('counts people with the right noun', () => {
    expect([0, 1, 2].map((n) => `${n} ${peopleText(n)}`)).toEqual(['0 people', '1 person', '2 people']);
  });

  it('names a new map after its record, within 120 characters', () => {
    expect(defaultMapName('Pizza Hut')).toBe('Pizza Hut map');
    expect(defaultMapName(null)).toBe('New map');
    expect(defaultMapName('x'.repeat(130))).toHaveLength(120);
  });

  it("reads sentiment as the server's word, keeping the slug for the dot (Contract note 4)", () => {
    expect(sentimentOf({ sentiment: 'positive', sentiment_label: 'Positive' })).toEqual({ reading: 'positive', word: 'Positive' });
    expect(sentimentOf({ sentiment: 'negative', sentiment_label: 'Unhappy' })).toEqual({ reading: 'negative', word: 'Unhappy' });
  });

  it('reads the last contact in days, and 60 or more as stale (spec §2.2, Decision 12)', () => {
    expect(contactedText(contacted(daysBefore(0), NOW))).toBe('Contacted today');
    expect(contactedText(contacted(daysBefore(1), NOW))).toBe('Contacted 1 day ago');
    expect(contacted(daysBefore(12), NOW)).toEqual({ stale: false, lead: 'Contacted ', figure: '12', tail: ' days ago' });
    expect(contacted(daysBefore(59), NOW).stale).toBe(false);
    expect(contacted(daysBefore(60), NOW)).toEqual({ stale: true, lead: 'Not contacted in ', figure: '60+', tail: ' days' });
    expect(contactedText(contacted(daysBefore(60), NOW))).toBe('Not contacted in 60+ days');
    expect(contacted(null, NOW)).toEqual({ stale: true, lead: 'Not contacted yet', figure: null, tail: '' });
  });

  it('writes the latest survey as "NPS 9 · 3 Oct"', () => {
    expect(surveyText({ type: 'nps', score: 9, answered_at: '2026-10-03T12:00:00Z' })).toBe('NPS 9 · 3 Oct');
    expect(surveyText({ type: 'csat', score: 4, answered_at: '2026-09-21T12:00:00Z' })).toBe('CSAT 4 · 21 Sep');
  });

  it('says who edited last, or only when when nobody is recorded', () => {
    const at = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(editedText({ updated_at: at, updated_by: { id: 5, name: 'Dana CSM' } })).toBe('Edited by Dana CSM · 2 days ago');
    expect(editedText({ updated_at: at, updated_by: null })).toBe('Edited 2 days ago');
  });

  it('writes a line as a sentence, and an empty label as "No label"', () => {
    expect(relationshipText('Rosa', 'Reports to', 'Tom')).toBe('Rosa reports to Tom');
    expect(relationshipText('Rosa', 'Introduced by', 'Tom')).toBe('Rosa was introduced by Tom');
    expect(relationshipText('Rosa', 'Blocks', 'Tom')).toBe('Rosa blocks Tom');
    expect(relationshipText('Rosa', 'Influences', 'Tom')).toBe('Rosa influences Tom');
    expect(relationshipText('Rosa', '', 'Tom')).toBe('Rosa is linked to Tom');
    expect(labelText('')).toBe('No label');
    expect(labelText('Blocks')).toBe('Blocks');
  });
});

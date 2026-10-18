import { describe, expect, it } from 'vitest';
import { memberCountText, movesText, summaryFigures } from './summaryFigures';
import { summaryOf } from './testSegments';

describe('segment tile figures', () => {
  it('reads members, ARR covered, average health, average CSAT and the last 7 days for organisations', () => {
    expect(summaryFigures(summaryOf(41, 'customer'), 'customer').map((f) => [f.label, f.value])).toEqual([
      ['Members', '41'],
      ['ARR covered', '$512.0K'],
      ['Average health', '5.4'],
      ['Average CSAT', '71%'],
      ['Last 7 days', '+6 / −2'],
    ]);
  });

  it('says how much ARR could not be converted, and shows a dash for an average nobody has', () => {
    const figures = summaryFigures({ ...summaryOf(2, 'account'), unconverted_count: 1, avg_csat: null }, 'account');
    expect(figures.find((f) => f.key === 'arr')?.detail).toBe('1 not converted');
    expect(figures.find((f) => f.key === 'csat')?.value).toBe('—');
  });

  it('gives contacts only Members and the last 7 days, and the preview no last 7 days', () => {
    expect(summaryFigures(summaryOf(3, 'contact'), 'contact').map((f) => f.key)).toEqual(['members', 'moves']);
    expect(summaryFigures({ ...summaryOf(3, 'customer'), entered_7d: null, left_7d: null }, 'customer').map((f) => f.key)).not.toContain('moves');
  });

  it("writes a day's moves and the members count line", () => {
    expect(movesText({ entered: 3, left: 1 })).toBe('+3 / −1');
    expect(memberCountText(3, 3, '', 'customer')).toBe('3 organisations');
    expect(memberCountText(1, 1, '', 'contact')).toBe('1 contact');
    expect(memberCountText(1, 3, 'piz', 'account')).toBe('1 of 3 accounts');
  });
});

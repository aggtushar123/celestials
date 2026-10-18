import { describe, expect, it } from 'vitest';
import { answersFilter, surveysTab, withAnswersFilter } from './surveyParams';

const params = (text: string) => new URLSearchParams(text);

describe('surveysTab (plan Decision 4)', () => {
  it('opens Sends by default and Logged scores on ?tab=logged', () => {
    expect(surveysTab(params(''))).toBe('sends');
    expect(surveysTab(params('tab=logged'))).toBe('logged');
    expect(surveysTab(params('tab=nonsense'))).toBe('sends');
  });

  it("opens Logged scores for the organisation page's ?customer= link, unless a tab says otherwise", () => {
    expect(surveysTab(params('customer=7'))).toBe('logged');
    expect(surveysTab(params('tab=sends&customer=7'))).toBe('sends');
  });
});

describe('the answers filter in the URL (plan Decision 9)', () => {
  it('reads all, detractors or comments, and anything else as all', () => {
    expect(answersFilter(params(''))).toBe('all');
    expect(answersFilter(params('answers=detractors'))).toBe('detractors');
    expect(answersFilter(params('answers=comments'))).toBe('comments');
    expect(answersFilter(params('answers=everything'))).toBe('all');
  });

  it('writes the filter beside the other parameters, and drops it for all', () => {
    expect(withAnswersFilter(params('x=1'), 'comments').toString()).toBe('x=1&answers=comments');
    expect(withAnswersFilter(params('x=1&answers=comments'), 'all').toString()).toBe('x=1');
  });
});

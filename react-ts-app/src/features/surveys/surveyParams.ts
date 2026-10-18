// The Surveys pages' URL state: which tab (/surveys?tab=) and which answers
// (/surveys/:id?answers=).
import type { AnswersFilter } from './surveyTypes';

export type SurveysTab = 'sends' | 'logged';
const FILTERS: readonly AnswersFilter[] = ['all', 'detractors', 'comments'];

/** Sends unless `?tab=logged`, or unless `?customer=` (the organisation
 *  page's "Manage surveys") arrives with no tab (plan Decision 4). */
export function surveysTab(search: URLSearchParams): SurveysTab {
  const tab = search.get('tab');
  if (tab === 'logged') return 'logged';
  if (tab === 'sends') return 'sends';
  return search.has('customer') ? 'logged' : 'sends';
}

export function answersFilter(search: URLSearchParams): AnswersFilter {
  const value = search.get('answers');
  return FILTERS.find((filter) => filter === value) ?? 'all';
}

export function withAnswersFilter(search: URLSearchParams, filter: AnswersFilter): URLSearchParams {
  const next = new URLSearchParams(search);
  if (filter === 'all') next.delete('answers');
  else next.set('answers', filter);
  return next;
}

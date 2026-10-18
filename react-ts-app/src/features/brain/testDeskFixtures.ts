// Test-only: the people the Brain tests read as (Alice, a manager with one
// report Carl; Dana outside her team) and one rule review's detail, as the
// feed carries it. Alice owns Detractor follow-up (rule 3), so the detail
// holds the full review. Kept from Waiting on you's fixtures when that page
// went (work in one place delivery 2).
import type { SurveyReview } from '../rules/ruleTypes';
import type { SurveyReviewDetail } from './brainTypes';

export const ALICE = { id: 1, name: 'Alice Admin' };
export const CARL = { id: 5, name: 'Carl CSM' };
export const DANA = { id: 7, name: 'Dana CSM' };

export const MY_SURVEY_REVIEW: SurveyReview = {
  id: 14,
  rule: { id: 3, name: 'Detractor follow-up', trigger: 'schedule', score: '', direction: '', threshold: null, cadence: 'weekly', weekday: 1, segment: null },
  run_on: '2026-10-03',
  status: 'waiting',
  result: {},
  created_at: '2026-10-03T02:10:00Z',
  expires_at: '2026-10-10T02:10:00Z',
  decided_at: null,
  kind: 'survey',
  action: { action: 'survey', survey_type: 'nps', subject: 'How are we doing?', intro: 'A quick check-in.', roles: [], without_review: false },
  counts: { people: 12, records: 3 },
  organisation_name: 'Acme Inc',
};

export const MY_REVIEW_DETAIL: SurveyReviewDetail = {
  rule_id: 3, rule_name: 'Detractor follow-up', review_kind: 'survey', counts: { people: 12, records: 3 }, review: MY_SURVEY_REVIEW,
};

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { fetchSend } from '../surveys/surveyApi';
import { requestsOf } from '../surveys/testSurveys';
import {
  approveReview,
  createRule,
  deleteRule,
  fetchReviews,
  fetchRule,
  fetchRules,
  fetchRun,
  fetchRuns,
  skipReview,
  testRule,
  updateRule,
} from './ruleApi';
import { NOTIFY_ME_ACTION, ORPHAN, RENEWAL_WATCH, stubRules, SURVEY_NPS, TOO_MANY } from './testRules';
import type { RuleWrite } from './ruleTypes';

const BODY: RuleWrite = {
  name: 'Unhappy renewals', segment: 7, trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60, cadence: '', weekday: null,
  actions: [NOTIFY_ME_ACTION], cooldown_days: 30, is_active: false, sharing: 'private',
};
const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err instanceof ApiError ? { status: err.status, body: err.body } : err;
  }
  throw new Error('expected a refusal');
};

describe('the rules API on the contract stub', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists readable rules by name, the last night the owner\'s alone', async () => {
    stubRules();
    const rows = await fetchRules();
    expect(rows.map((row) => row.name)).toEqual(['EMEA renewals', 'Old churn watch', 'Renewal watch', 'Welcome tasks']);
    expect(rows.find((row) => row.id === 5)?.last_run).toEqual({ run_on: '2026-10-04', fired: 3, waiting: true });
    expect(rows.find((row) => row.id === 8)?.last_run).toEqual({ run_on: '2026-09-28', fired: null, waiting: false });
    expect(rows.find((row) => row.id === 6)?.last_run).toBeNull();
    expect(rows[0]).not.toHaveProperty('shared_with');
  });

  it("reads one rule with its sharing, and Dana's private one as missing", async () => {
    stubRules();
    expect((await fetchRule(8)).shared_with).toEqual([{ id: 1, name: 'Alice' }]);
    expect(await refusal(fetchRule(9))).toEqual({ status: 404, body: { detail: 'Not found.' } });
  });

  it('creates a rule owned by me, off, and refuses the 51st', async () => {
    const { spy } = stubRules({ limit: 4 });
    const made = await createRule(BODY);
    expect(made).toMatchObject({ id: 100, name: 'Unhappy renewals', is_active: false, is_owner: true, segment: { id: 7, name: 'Renewal risk', kind: 'customer' } });
    expect(requestsOf(spy, 'POST', /^\/rules\/$/)[0].body).toEqual(BODY);
    expect(await refusal(createRule(BODY))).toEqual({ status: 429, body: { detail: 'You can own at most 50 rules.' } });
  });

  it('refuses at the fields the backend names', async () => {
    stubRules();
    expect(await refusal(createRule({ ...BODY, segment: 8 }))).toEqual({ status: 403, body: { detail: 'A rule can only use your own segments.' } });
    expect(await refusal(createRule({ ...BODY, segment: 9 }))).toEqual({ status: 400, body: { trigger: ['Contacts have no scores; choose an organisation or account segment.'] } });
    expect(await refusal(createRule({ ...BODY, threshold: 120 }))).toEqual({ status: 400, body: { threshold: ['Choose a value from 0 to 100.'] } });
    expect(await refusal(createRule({ ...BODY, actions: [NOTIFY_ME_ACTION, { action: 'task', title: '', assignee: 'me', due_in_days: 1 }] }))).toEqual({
      status: 400,
      body: { actions: [{}, { title: ['Give the task a title.'] }] },
    });
  });

  it("switches a rule on, refuses one with no segment or someone else's, and deletes", async () => {
    const { spy } = stubRules();
    expect((await updateRule(6, { is_active: true })).is_active).toBe(true);
    expect(requestsOf(spy, 'PATCH', /^\/rules\/6\/$/)[0].body).toEqual({ is_active: true });
    expect(await refusal(updateRule(7, { is_active: true }))).toEqual({ status: 400, body: { segment: ['Choose a segment.'] } });
    expect(await refusal(updateRule(8, { is_active: false }))).toEqual({ status: 403, body: { detail: "Only the rule's owner can change it." } });
    await deleteRule(6);
    expect(await refusal(fetchRule(6))).toMatchObject({ status: 404 });
  });

  it('tests a rule without saving it', async () => {
    const { spy } = stubRules();
    const result = await testRule({ ...BODY, rule: 5 });
    expect(result).toEqual({
      count: 3,
      records: [
        { kind: 'customer', id: 1, name: 'Globex' },
        { kind: 'customer', id: 2, name: 'Initech' },
        { kind: 'customer', id: 7, name: 'Pizza Hut' },
      ],
      hidden_count: 1,
      skipped: { cooldown: 1, cap: 0, not_visible: 1 },
    });
    expect(requestsOf(spy, 'POST', /^\/rules\/test\/$/)[0].body).toMatchObject({ rule: 5 });
    expect((await fetchRules()).length).toBe(4);
  });

  it('pages the nights under an opaque cursor, and reads a night twice filtered', async () => {
    const { spy } = stubRules({ pageSize: 1 });
    const first = await fetchRuns(5, null);
    expect(first.results.map((run) => run.id)).toEqual([9]);
    expect(first.next).toEqual(expect.any(String));
    const second = await fetchRuns(5, first.next);
    expect(second).toMatchObject({ results: [{ id: 8 }], next: expect.any(String) });
    expect(await fetchRuns(5, second.next)).toMatchObject({ results: [{ id: 7 }], next: null });
    expect(requestsOf(spy, 'GET', /^\/rules\/5\/runs\/$/)[1].query.get('cursor')).toBe(first.next);
    const reader = await fetchRuns(8, null);
    expect(reader.results[0]).toMatchObject({ matched: null, skipped: null, review: null, fired: 1, hidden_count: 2 });
    expect(await fetchRun(8, 12)).toMatchObject({ hidden_count: 2, records: [{ name: 'Pizza EMEA', outcome: 'fired' }] });
  });

  it('lists my waiting reviews, approves one into a survey, and refuses a decided one', async () => {
    stubRules();
    expect((await fetchReviews()).map((review) => review.id)).toEqual([2, 3]);
    expect(await approveReview(2)).toEqual({ survey_send_id: 31 });
    expect(await fetchSend(31)).toMatchObject({ name: 'Renewal watch · 4 Oct 2026', survey_type: 'nps', status: 'sent', segment: { id: 7 } });
    expect((await fetchReviews()).map((review) => review.id)).toEqual([3]);
    expect(await refusal(approveReview(2))).toEqual({ status: 409, body: { detail: 'This review has already been decided.' } });
    expect((await skipReview(3)).status).toBe('skipped');
    expect(await fetchReviews()).toEqual([]);
  });

  it('keeps a refused approval waiting with its reason', async () => {
    stubRules({ refuse: TOO_MANY });
    expect(await refusal(approveReview(2))).toEqual({ status: 400, body: TOO_MANY });
    expect((await fetchReviews()).find((review) => review.id === 2)?.result).toEqual({ error: TOO_MANY });
  });

  it("runs a rule's night: records fired, a review waiting, the last run moved", async () => {
    const { runNight } = stubRules();
    const made = await createRule({ ...BODY, actions: [NOTIFY_ME_ACTION, SURVEY_NPS] });
    expect(runNight(made.id)).toBeNull(); // off: nothing runs
    await updateRule(made.id, { is_active: true });
    const run = runNight(made.id);
    expect(run).toMatchObject({ run_on: '2026-10-05', matched: 2, fired: 2, review: { status: 'waiting' } });
    expect((await fetchRule(made.id)).last_run).toEqual({ run_on: '2026-10-05', fired: 2, waiting: true });
    const reviews = await fetchReviews();
    expect(reviews[0]).toMatchObject({ rule: { id: made.id, name: 'Unhappy renewals' }, counts: { people: 3, records: 2 }, run_on: '2026-10-05' });
    expect((await fetchRun(made.id, run!.id)).records.map((record) => record.name)).toEqual(['Globex', 'Pizza Hut']);
    expect(RENEWAL_WATCH.actions).toEqual([SURVEY_NPS, NOTIFY_ME_ACTION]); // fixtures are copied, never mutated
  });

  it('skips a record nothing happened to as nobody, and counts it', async () => {
    const { runNight } = stubRules();
    const made = await createRule({ ...BODY, segment: 9, trigger: 'entered', score: '', direction: '', threshold: null, is_active: true });
    const run = runNight(made.id);
    expect(run).toMatchObject({ matched: 2, fired: 1, skipped: { cooldown: 0, cap: 0, not_visible: 0, failed: 0, nobody: 1 } });
    const skipped = (await fetchRun(made.id, run!.id)).records.find((record) => record.outcome === 'skipped');
    expect(skipped).toEqual({
      kind: 'contact', id: 53, name: 'Kim Lee', outcome: 'skipped', reason: 'nobody',
      actions: [{ action: 'notify', status: 'skipped', detail: 'nobody to notify may open it' }],
    });
  });

  it("expires the rule's waiting reviews when its segment or trigger changes, not on a rename", async () => {
    stubRules();
    await updateRule(5, { name: 'Renamed' });
    expect((await fetchReviews()).map((review) => review.id)).toEqual([2, 3]);
    await updateRule(5, { trigger: 'entered', score: '', direction: '', threshold: null });
    expect(await fetchReviews()).toEqual([]);
    expect((await fetchRuns(5, null)).results.map((run) => run.review?.status ?? null)).toEqual(['expired', 'expired', null]);
    expect((await fetchRule(5)).last_run?.waiting).toBe(false);
  });

  it('renames a rule whose segment was deleted, still on, as the backend does; a new trigger or turning on needs a segment', async () => {
    stubRules({ rules: [{ ...ORPHAN, is_active: true }] });
    expect(await updateRule(7, { name: 'Renamed', is_active: true, sharing: 'workspace' })).toMatchObject({ name: 'Renamed', is_active: true, segment: null });
    expect(await refusal(updateRule(7, { trigger: 'entered' }))).toEqual({ status: 400, body: { segment: ['Choose a segment.'] } });
    await updateRule(7, { is_active: false });
    expect(await refusal(updateRule(7, { is_active: true }))).toEqual({ status: 400, body: { segment: ['Choose a segment.'] } });
  });

  it('refuses a repeated action on the item, as the backend does', async () => {
    stubRules();
    expect(await refusal(createRule({ ...BODY, actions: [NOTIFY_ME_ACTION, NOTIFY_ME_ACTION] }))).toEqual({
      status: 400, body: { actions: [{}, { action: ['Each action can be used once per rule.'] }] },
    });
  });
});

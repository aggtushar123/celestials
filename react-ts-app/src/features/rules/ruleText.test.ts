import { describe, expect, it } from 'vitest';
import { sentenceText } from '../segments/ruleSentence';
import {
  actionResultText,
  campaignTestParts,
  cooldownHint,
  lastRunParts,
  pausedText,
  planTestParts,
  rangeHint,
  recordNoun,
  refusalText,
  ruleParts,
  runParts,
  sharingText,
  shortDay,
  skipReasonText,
  testLines,
  testSummary,
  thenText,
  thresholdText,
  triggerParts,
  turnOnText,
  waitingReviews,
} from './ruleText';
import type { CampaignAction, NotifyAction, PlanAction, RunRow, SurveyAction, TriggerFields } from './ruleTypes';

const BLANK: TriggerFields = { trigger: 'entered', score: '', direction: '', threshold: null, cadence: '', weekday: null };
const RISK = { name: 'Renewal risk', kind: 'customer' as const };
const NOTIFY_ME: NotifyAction = { action: 'notify', to: 'me', people: [], message: '' };
const SURVEY: SurveyAction = { action: 'survey', survey_type: 'nps', subject: 'Hi', intro: '', roles: ['champion'], without_review: false };
const RUN: RunRow = {
  id: 9, run_on: '2026-10-04', matched: 5, fired: 3,
  skipped: { cooldown: 1, cap: 0, not_visible: 1, failed: 0, nobody: 0 }, review: { id: 2, status: 'waiting' },
  hidden_count: 0, started_at: null, finished_at: null,
};
const text = sentenceText;

describe('the rule as a sentence (spec §2.1)', () => {
  it('reads a crossing rule as the spec does, the figure in DM Mono', () => {
    const parts = ruleParts({ ...BLANK, trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60, actions: [SURVEY, NOTIFY_ME] }, { name: 'My book', kind: 'customer' });
    expect(text(parts)).toBe('When CSAT falls below 60 in My book → survey, notify me');
    expect(parts.filter((part) => part.numeric).map((part) => part.text)).toEqual(['60']);
  });

  it('reads entries and exits by kind, and a deleted segment in italics', () => {
    expect(text(triggerParts(BLANK, RISK))).toBe('When an organisation enters Renewal risk');
    expect(text(triggerParts({ ...BLANK, trigger: 'left' }, { name: 'EMEA', kind: 'account' }))).toBe('When an account leaves EMEA');
    const gone = triggerParts({ ...BLANK, trigger: 'left' }, null);
    expect(text(gone)).toBe('When a record leaves a deleted segment');
    expect(gone.at(-1)).toEqual({ text: 'a deleted segment', role: 'hidden' });
  });

  it('reads a rising NPS with a true minus, and an unfinished line plainly', () => {
    expect(text(triggerParts({ ...BLANK, trigger: 'crossed', score: 'nps', direction: 'above', threshold: -20 }, RISK))).toBe('When NPS rises above −20 in Renewal risk');
    expect(text(triggerParts({ ...BLANK, trigger: 'crossed', score: '', direction: 'below', threshold: null }, RISK))).toBe('When a score crosses a line in Renewal risk');
  });

  it('reads weekly and monthly schedules', () => {
    expect(text(triggerParts({ ...BLANK, trigger: 'schedule', cadence: 'weekly', weekday: 0 }, RISK))).toBe('Every Monday, for everyone in Renewal risk');
    expect(text(triggerParts({ ...BLANK, trigger: 'schedule', cadence: 'monthly', weekday: null }, RISK))).toBe('On the 1st of each month, for everyone in Renewal risk');
  });

  it('names every action, without review included', () => {
    const parts = ruleParts(
      {
        ...BLANK,
        actions: [
          { action: 'notify', to: 'people', people: [4, 5], message: '' },
          { action: 'task', title: 'Call', assignee: 'me', due_in_days: 3 },
          { action: 'lifecycle', stage: 'renewal' },
          { ...SURVEY, without_review: true },
        ],
      },
      RISK,
    );
    expect(text(parts)).toBe('When an organisation enters Renewal risk → notify 2 teammates, create a task, move to Renewal, survey without review');
    expect(text(ruleParts({ ...BLANK, actions: [{ ...NOTIFY_ME, to: 'record_owner' }] }, RISK))).toMatch(/→ notify each record's owner$/);
  });
});

describe('nights and last runs (spec §2.1, §2.3)', () => {
  it('reads the last night for the owner, a reader, and none yet', () => {
    expect(text(lastRunParts({ run_on: '2026-10-04', fired: 3, waiting: false }))).toBe('4 Oct · fired 3');
    expect(text(lastRunParts({ run_on: '2026-10-04', fired: 3, waiting: true }))).toBe('4 Oct · fired 3 · waiting for review');
    expect(text(lastRunParts({ run_on: '2026-10-04', fired: null, waiting: false }))).toBe('Last ran 4 Oct');
    expect(text(lastRunParts(null))).toBe('Not run yet');
  });

  it('reads a night as the spec does, its figures in DM Mono', () => {
    const parts = runParts(RUN);
    expect(text(parts)).toBe('4 Oct · fired 3 · skipped 2 · 1 waiting for review');
    expect(parts.filter((part) => part.numeric).map((part) => part.text)).toEqual(['3', '2', '1']);
  });

  it("reads a decided review, and a reader's night with what they can't open", () => {
    expect(text(runParts({ ...RUN, review: { id: 2, status: 'approved' } }))).toBe('4 Oct · fired 3 · skipped 2 · survey approved');
    expect(text(runParts({ ...RUN, matched: null, skipped: null, review: null, fired: 1, hidden_count: 2 }))).toBe("4 Oct · fired 1 · 2 you can't open");
  });

  it('counts a record nothing happened to among the skipped', () => {
    const skipped = { cooldown: 0, cap: 0, not_visible: 0, failed: 1, nobody: 2 };
    expect(text(runParts({ ...RUN, fired: 0, skipped, review: null }))).toBe('4 Oct · fired 0 · skipped 3');
  });

  it('says what each action did and why a record was skipped', () => {
    expect(actionResultText({ action: 'lifecycle', status: 'done', detail: 'live → renewal' })).toBe('Lifecycle: done (live → renewal)');
    expect(actionResultText({ action: 'survey', status: 'queued', detail: '' })).toBe('Survey: waiting for review');
    expect(actionResultText({ action: 'notify', status: 'skipped', detail: 'nobody to notify may open it' })).toBe('Notify: skipped (nobody to notify may open it)');
    const record = { kind: 'customer' as const, id: 6, name: 'Shopify', outcome: 'skipped' as const, actions: [] };
    expect(skipReasonText({ ...record, reason: 'cooldown' }, 30)).toBe('Skipped: acted on in the last 30 days');
    expect(skipReasonText({ ...record, reason: 'failed' }, 30)).toBe('Skipped: every action failed; it is tried again next time');
    expect(skipReasonText({ ...record, reason: 'nobody' }, 30)).toBe('Skipped: nothing to do for it');
  });

  it('shortens a day to "4 Oct"', () => {
    expect(shortDay('2026-10-04')).toBe('4 Oct');
  });
});

describe('the rest of the copy', () => {
  it('words the paused notice by code, with the fix for the owner only', () => {
    expect(pausedText('', '', true)).toBeNull();
    expect(pausedText('segment_gone', 'Its segment was deleted.', true)).toBe('It switched itself off. Its segment was deleted. Choose another of your segments in Edit, then turn it on.');
    expect(pausedText('segment_gone', 'Its segment was deleted.', false)).toBe('It switched itself off. Its segment was deleted.');
    expect(pausedText('owner_inactive', 'Its owner is no longer active.', true)).toMatch(/It stays off until its owner is active again\.$/);
  });

  it('says what turning on will do, and whether surveys wait', () => {
    expect(turnOnText([SURVEY, NOTIFY_ME], RISK)).toBe('From tonight it runs once a night on Renewal risk and will survey, notify me. Its surveys wait for your review first.');
    expect(turnOnText([{ ...SURVEY, without_review: true }], RISK)).toMatch(/Its surveys go out without your review\.$/);
    expect(turnOnText([NOTIFY_ME], null)).toBe('From tonight it runs once a night on its segment and will notify me.');
  });

  it('words sharing as Segments do', () => {
    expect(sharingText('private', [])).toBe('Private');
    expect(sharingText('workspace', [])).toBe('Shared with the workspace');
    expect(sharingText('people', [{ id: 1, name: 'Alice' }, { id: 4, name: 'Carl CSM' }, { id: 5, name: 'Dana CSM' }])).toBe('Shared with Alice, Carl CSM and 1 more');
  });

  it("sums up a test as an estimate, naming the first records and counting the rest", () => {
    const result = { count: 12, records: [{ kind: 'customer' as const, id: 1, name: 'Globex' }, { kind: 'customer' as const, id: 2, name: 'Initech' }], hidden_count: 1, skipped: { cooldown: 1, cap: 3, not_visible: 1 } };
    expect(testSummary(result, 'customer')).toEqual({ n: 12, text: "organisations would match if tonight's run happened now: Globex, Initech and 10 more." });
    expect(testSummary({ ...result, count: 0, records: [] }, 'contact')).toEqual({ n: 0, text: "contacts would match if tonight's run happened now." });
    expect(testLines(result, 30)).toEqual([
      { n: 1, text: 'skipped (acted on in the last 30 days)' },
      { n: 3, text: 'over the nightly limit of 200' },
      { n: 1, text: "in the segment you can't open isn't included" },
    ]);
  });

  it('warns when a schedule waits longer than its own rhythm (backend gap 3)', () => {
    expect(cooldownHint('schedule', 'weekly', 30)).toBe('A weekly rule that waits 30 days reaches each record about every 5 weeks.');
    expect(cooldownHint('schedule', 'weekly', 7)).toBeNull();
    expect(cooldownHint('schedule', 'monthly', 30)).toBe('Some months are shorter than 30 days, so a monthly rule can miss a record for a month.');
    expect(cooldownHint('entered', 'weekly', 30)).toBeNull();
  });

  it("reads a Surveys refusal's first message, whatever its key", () => {
    expect(refusalText({ segment: ['This survey would reach 612 people; the most is 500.'] })).toBe('This survey would reach 612 people; the most is 500.');
    expect(refusalText({ detail: "Email isn't set up for this workspace yet, so surveys can't be sent." })).toMatch(/^Email isn't set up/);
    expect(refusalText(undefined)).toBeNull();
  });

  it('counts records by kind, and words a range with a true minus', () => {
    expect(recordNoun(1, 'customer')).toBe('organisation');
    expect(recordNoun(2, 'account')).toBe('accounts');
    expect(recordNoun(2, null)).toBe('records');
    expect(thresholdText(-5)).toBe('−5');
    expect(rangeHint('nps')).toBe('NPS runs from −100 to 100.');
  });
});

describe('the Start a plan action (plans spec §1.8, §2.5)', () => {
  const SAVE: PlanAction = { action: 'plan', template: { id: 3, name: 'Save plan' } };

  it('reads as "start a Save plan" at the end of the sentence', () => {
    expect(sentenceText(ruleParts({ ...BLANK, actions: [NOTIFY_ME, SAVE] }, RISK))).toBe('When an organisation enters Renewal risk → notify me, start a Save plan');
    expect(thenText([{ action: 'plan', template: { id: 1, name: 'Onboarding' } }])).toBe('start an Onboarding plan');
    expect(thenText([{ action: 'plan', template: { id: 4, name: 'QBR' } }])).toBe('start a QBR plan');
    expect(thenText([{ action: 'plan', template: null }])).toBe('start a plan');
  });

  it("reads a night's plan results per record", () => {
    expect(actionResultText({ action: 'plan', status: 'done', detail: 'started' })).toBe('Plan: started');
    expect(actionResultText({ action: 'plan', status: 'unchanged', detail: 'already had one' })).toBe('Plan: already had one');
    expect(actionResultText({ action: 'plan', status: 'failed', detail: 'no owner' })).toBe('Plan: failed (no owner)');
  });

  it('tells the owner what to do when its template was deleted', () => {
    expect(pausedText('template_gone', 'Its plan template was deleted.', true)).toBe(
      'It switched itself off. Its plan template was deleted. Choose another template in Edit, then turn it on.',
    );
    expect(pausedText('template_gone', 'Its plan template was deleted.', false)).toBe('It switched itself off. Its plan template was deleted.');
  });

  it("words the dry run's plans, the figures apart", () => {
    expect(planTestParts({ would_start: 2, already_open: 1 }).map((part) => part.text).join('')).toBe('Would start 2 plans · 1 already has one');
    expect(planTestParts({ would_start: 1, already_open: 3 }).map((part) => part.text).join('')).toBe('Would start 1 plan · 3 already have one');
    expect(planTestParts({ would_start: 2, already_open: 1 }).filter((part) => part.numeric).map((part) => part.text)).toEqual(['2', '1']);
  });
});

describe('the Send a campaign action (campaigns spec §1.8, §2.5)', () => {
  const WIN_BACK: CampaignAction = { action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: false };

  it('reads as "email Win-back", with "without review" when it skips the queue', () => {
    expect(sentenceText(ruleParts({ ...BLANK, actions: [NOTIFY_ME, WIN_BACK] }, RISK))).toBe('When an organisation enters Renewal risk → notify me, email Win-back');
    expect(thenText([{ ...WIN_BACK, without_review: true }])).toBe('email Win-back without review');
    expect(thenText([{ ...WIN_BACK, campaign: null }])).toBe('email a campaign');
  });

  it("reads a night's campaign results per record", () => {
    expect(actionResultText({ action: 'campaign', status: 'queued', detail: 'waiting for your review' })).toBe('Campaign: waiting for your review');
    expect(actionResultText({ action: 'campaign', status: 'done', detail: 'emailed' })).toBe('Campaign: emailed');
    expect(actionResultText({ action: 'campaign', status: 'skipped', detail: 'nobody it could reach' })).toBe('Campaign: nobody it could reach');
    expect(actionResultText({ action: 'campaign', status: 'failed', detail: 'no segment' })).toBe('Campaign: failed (no segment)');
  });

  it('tells the owner what to do when its campaign went', () => {
    expect(pausedText('campaign_gone', 'Its campaign was archived or deleted.', true)).toBe(
      'It switched itself off. Its campaign was archived or deleted. Choose another campaign in Edit, then turn it on.',
    );
  });

  it('says whether its campaign emails wait for review when it is turned on', () => {
    expect(turnOnText([WIN_BACK], RISK)).toBe('From tonight it runs once a night on Renewal risk and will email Win-back. Its campaign emails wait for your review first.');
    expect(turnOnText([{ ...WIN_BACK, without_review: true }], RISK)).toMatch(/Its campaign emails go out without your review\.$/);
  });

  it("words the dry run's emails, the figures apart", () => {
    const parts = campaignTestParts({ would_email: 3, skipped: 1 });
    expect(parts.map((part) => part.text).join('')).toBe('Would email 3 people · 1 skipped');
    expect(parts.filter((part) => part.numeric).map((part) => part.text)).toEqual(['3', '1']);
    expect(campaignTestParts({ would_email: 1, skipped: 0 }).map((part) => part.text).join('')).toBe('Would email 1 person · 0 skipped');
  });
});

describe("a night's reviews (Contract note 12)", () => {
  const night = {
    id: 9, run_on: '2026-10-04', matched: 5, fired: 3, skipped: null, hidden_count: 0, started_at: null, finished_at: null,
    review: { id: 2, status: 'waiting' as const },
  };

  it('counts every waiting review of a night, a survey and a campaign alike', () => {
    const both = { ...night, reviews: [{ id: 2, kind: 'survey' as const, status: 'waiting' as const }, { id: 4, kind: 'campaign' as const, status: 'waiting' as const }] };
    expect(waitingReviews(both)).toBe(2);
    expect(runParts(both).map((part) => part.text).join('')).toBe('4 Oct · fired 3 · 2 waiting for review');
    expect(waitingReviews({ ...both, reviews: [{ id: 2, kind: 'survey', status: 'approved' }, { id: 4, kind: 'campaign', status: 'waiting' }] })).toBe(1);
  });

  it('names both reviews of a night once they are decided, and a decided one beside one waiting', () => {
    const decided = { ...night, review: { id: 2, status: 'approved' as const }, reviews: [{ id: 2, kind: 'survey' as const, status: 'approved' as const }, { id: 4, kind: 'campaign' as const, status: 'skipped' as const }] };
    expect(runParts(decided).map((part) => part.text).join('')).toBe('4 Oct · fired 3 · survey approved · campaign skipped');
    const mixed = { ...decided, reviews: [{ id: 2, kind: 'survey' as const, status: 'waiting' as const }, { id: 4, kind: 'campaign' as const, status: 'expired' as const }] };
    expect(runParts(mixed).map((part) => part.text).join('')).toBe('4 Oct · fired 3 · 1 waiting for review · campaign review expired');
  });

  it('reads the single review of an older night row', () => {
    expect(waitingReviews(night)).toBe(1);
    expect(waitingReviews({ ...night, review: null })).toBe(0);
  });
});

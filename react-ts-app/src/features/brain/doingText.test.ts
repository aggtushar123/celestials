import { describe, expect, it } from 'vitest';
import type { DeskMember, DoingPayload, DoingPlan, DoingRule, InitiativeProgress, TrackableMetric } from './brainTypes';
import {
  atRiskText,
  bookPeople,
  bookText,
  canStart,
  daysLeftParts,
  DO,
  doingFigures,
  firedText,
  hiddenPlansText,
  initiativesEmpty,
  initiativeStatusLabel,
  isClosed,
  lastRunParts,
  lastRunText,
  milestonesText,
  onTrackText,
  planHref,
  progressFigures,
  ruleHref,
  ruleStatusText,
  sectionOf,
  segmentText,
  taskStatusText,
  thenNowParts,
  thenNowText,
  withSection,
  workText,
} from './doingText';
import {
  ALICE_INITIATIVE,
  ALICE_PLAN,
  CARL_DOING_RULE,
  CARL_INITIATIVE,
  CARL_PLAN,
  CARL_READABLE_RULE,
  COMPANY_INITIATIVE,
  DANA_DOING_RULE,
  DANA_INITIATIVE,
  DANA_PLAN,
  MY_DOING_RULE,
  NO_BASELINE_INITIATIVE,
  OUTSIDE_VIEW_INITIATIVE,
} from './testDoingFixtures';

const P: InitiativeProgress = {
  baseline: 64100, current: 52000, target: 32000, progress_pct: 37.7, days_left: 56, direction: 'down', unit: 'money', better: 'down',
};
const plan = (then: DoingPlan['then'], now: DoingPlan['now']): DoingPlan => ({
  id: 8, name: 'Renewal save play', status: 'at_risk', record: { type: 'customer', id: 6, name: 'Pizza Hut' },
  owner: { id: 5, name: 'Carl CSM' }, target_date: '2026-11-01', milestones: { done: 1, total: 4 }, then, now,
});
const rule = (over: Partial<DoingRule> = {}): DoingRule => ({
  id: 3, name: 'Detractor follow-up', segment: 'Detractors', is_active: true, paused_reason: null, paused_message: null,
  mine: true, readable: true,
  last_run: { run_on: '2026-10-05', fired: 4, matched: 12, skipped: 2 }, ...over,
});
const TAKEN = '2026-09-01';

describe('doingText (spec §2.1)', () => {
  it('names the sections and reads and writes ?section=, keeping the scope', () => {
    expect(sectionOf('plans')).toBe('plans');
    expect(sectionOf('everything')).toBeNull();
    expect(sectionOf(null)).toBeNull();
    expect(withSection('?section=plans&scope=me', 'rules')).toBe('?section=rules&scope=me');
    expect(withSection('?scope=team', 'initiatives')).toBe('?scope=team&section=initiatives');
  });

  it('offers the registry\'s owner-cut metrics from the payload, not a hard-coded list (Contract note 3; controller override: fix round 2)', () => {
    // The book-mode form reads `trackable` off `doing/`'s own response — it is
    // not tied to any particular fixed set of keys, so a metric the old
    // hard-coded list never had still round-trips through the contract type.
    const trackable: TrackableMetric[] = [
      { key: 'churn_risk_score', label: 'Churn risk score', unit: 'count', better: 'down' },
      { key: 'expansion_arr', label: 'Expansion ARR', unit: 'money', better: 'up' },
    ];
    const payload: Pick<DoingPayload, 'trackable'> = { trackable };
    expect(payload.trackable.map((m) => m.key)).toEqual(['churn_risk_score', 'expansion_arr']);
  });

  it('lets anyone start on their own book; Company needs view_all_accounts (Decision 3)', () => {
    expect(canStart('me', false)).toBe(true);
    expect(canStart('team', false)).toBe(true);
    expect(canStart('company', false)).toBe(false);
    expect(canStart('company', true)).toBe(true);
  });

  it('says whose book an initiative tracks, or nothing once its figures are hidden (I2, final review)', () => {
    const carls = { for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, progress: P };
    expect(bookText(carls, 5)).toBe('Your book');
    expect(bookText(carls, 1)).toBe("Carl CSM's book");
    expect(bookText({ for: { dimension: 'product', member: '4', label: 'Analytics Suite' }, progress: P }, 1)).toBe('Analytics Suite');
    expect(bookText({ for: null, progress: P }, 1)).toBe('Whole company');
    // progress: null is the server's own "hidden" signal — true for a
    // hidden product/segment/other-owner cut too, not only a whole-company
    // one, so the frontend must say nothing rather than guess.
    expect(bookText({ for: null, progress: null }, 1)).toBeNull();
    expect(bookText({ for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, progress: null }, 1)).toBeNull();
  });

  it('reads baseline, now and target in the metric’s unit', () => {
    expect(progressFigures(P, 'USD')).toEqual({ baseline: '$64.1K', now: '$52K', target: '$32K' });
  });

  it('omits the baseline rather than printing "Not measured" when the server captured none', () => {
    // A reader who can't use Company reading an owner-cut initiative
    // (final review follow-up): the row has only now and target.
    expect(progressFigures({ ...P, unit: 'percent', baseline: null, current: 104, target: 110 }, 'USD')).toEqual({
      baseline: null, now: '104%', target: '110%',
    });
  });

  it('counts days left or overdue, none once closed, and names each status', () => {
    expect(daysLeftParts(56, 'active')).toEqual({ n: 56, words: 'days left' });
    expect(daysLeftParts(1, 'planned')).toEqual({ n: 1, words: 'day left' });
    expect(daysLeftParts(-3, 'active')).toEqual({ n: 3, words: 'days overdue' });
    expect(daysLeftParts(10, 'done')).toBeNull();
    expect(isClosed('abandoned')).toBe(true);
    expect(isClosed('planned')).toBe(false);
    expect(initiativeStatusLabel('planned')).toBe('Planned');
    expect(taskStatusText('in-progress')).toBe('In progress');
  });

  it('words the work, the milestones, the empty lines and the hidden plans', () => {
    expect(workText({ open: 2, done: 1 })).toBe('2 open · 1 done');
    expect(milestonesText({ done: 3, total: 5 })).toBe('3 of 5 milestones');
    expect(initiativesEmpty('me')).toBe('No initiatives on your book yet.');
    expect(initiativesEmpty('team')).toBe("No initiatives on your team's book yet.");
    expect(initiativesEmpty('company')).toBe('No initiatives yet.');
    expect(hiddenPlansText(0)).toBeNull();
    expect(hiddenPlansText(1)).toBe("1 more plan on a record you can't open");
    expect(hiddenPlansText(2)).toBe("2 more plans on records you can't open");
    expect(planHref(plan(null, { health_score: 1, arr: 1 }))).toBe('/projects/8');
  });

  it('reads a plan’s health and ARR then → now (Decision 4; Contract note 10)', () => {
    expect(thenNowText(plan({ health_score: 6.2, arr: 40000, taken_on: TAKEN }, { health_score: 7.1, arr: 44000 }), 'USD')).toBe(
      'Health 6.2 → 7.1 · ARR $40K → $44K',
    );
    expect(thenNowParts(plan(null, { health_score: 7.1, arr: 44000 }), 'USD')).toBeNull();
    expect(thenNowText(plan(null, { health_score: 7.1, arr: 44000 }), 'USD')).toBe(DO.BEFORE_FIGURES);
    expect(DO.BEFORE_FIGURES).toBe('Started before starting figures were kept');
    expect(thenNowText(plan({ health_score: null, arr: 40000, taken_on: TAKEN }, { health_score: 5.5, arr: null }), 'USD')).toBe(
      'Health not recorded → 5.5 · ARR $40K → not recorded',
    );
    expect(thenNowText(plan({ health_score: null, arr: 40000, taken_on: TAKEN }, { health_score: null, arr: 44000 }), 'USD')).toBe(
      'ARR $40K → $44K',
    );
    expect(thenNowText(plan({ health_score: null, arr: null, taken_on: TAKEN }, { health_score: null, arr: null }), 'USD')).toBe(DO.NO_FIGURES);
  });

  it('keeps health at one decimal even on a whole-number score (fix round 1: Math.round dropped 4.8 to 5)', () => {
    expect(thenNowText(plan({ health_score: 4.8, arr: null, taken_on: TAKEN }, { health_score: 5.5, arr: null }), 'USD')).toBe(
      'Health 4.8 → 5.5',
    );
    expect(thenNowText(plan({ health_score: 5, arr: null, taken_on: TAKEN }, { health_score: 10, arr: null }), 'USD')).toBe(
      'Health 5.0 → 10.0',
    );
    expect(thenNowText(plan({ health_score: 0, arr: null, taken_on: TAKEN }, { health_score: 0, arr: null }), 'USD')).toBe(
      'Health 0.0 → 0.0',
    );
  });

  it('says whether a rule is on, paused (and why) or off, and what its last run did (Decision 5; Contract note 11; controller override: fix round 2)', () => {
    expect(ruleStatusText(rule())).toBe('On');
    // The paused sentence is the server's own `paused_message`, shown
    // verbatim — not the client's old PAUSED_SHORT wording for the code.
    expect(
      ruleStatusText(
        rule({ is_active: false, paused_reason: 'segment_gone', paused_message: 'The segment behind this rule was removed overnight.' }),
      ),
    ).toBe('Paused: The segment behind this rule was removed overnight.');
    expect(ruleStatusText(rule({ is_active: false, paused_reason: null, paused_message: null }))).toBe('Off');
    expect(ruleStatusText(rule({ is_active: false, paused_reason: '', paused_message: null }))).toBe('Off');
    expect(lastRunText(rule())).toBe('Last run 5 Oct: fired 4 · matched 12 · skipped 2');
    const others = rule({ mine: false, last_run: { run_on: '2026-10-04', fired: 1 } });
    expect(lastRunText(others)).toBe('Last run 4 Oct: fired 1');
    expect(lastRunParts(others)).toEqual({ on: '4 Oct', parts: [{ label: 'fired', n: 1 }] });
    expect(lastRunText(rule({ last_run: null }))).toBe('Not run yet');
    expect(lastRunParts(rule({ last_run: null }))).toBeNull();
    expect(segmentText(rule({ segment: null }))).toBe('No segment');
    // Links on `readable`, not `mine`: a readable rule that isn't the
    // reader's own still gets a link; an unreadable rule never does, even
    // when it is the reader's own.
    expect(ruleHref(rule())).toBe('/scenarios/rules/3');
    expect(ruleHref(rule({ mine: false, readable: true }))).toBe('/scenarios/rules/3');
    expect(ruleHref(rule({ readable: false }))).toBeNull();
  });

  it('offers the reader, then everyone active below them by name, reaching past an inactive member to their reports (Contract note 4; minor fix, final review)', () => {
    const members: DeskMember[] = [
      { id: 1, name: 'Alice Admin', reports_to: null, is_active: true },
      { id: 2, name: 'Bob Lead', reports_to: null, is_active: true },
      { id: 5, name: 'Carl CSM', reports_to: { id: 1, name: 'Alice Admin' }, is_active: true },
      { id: 7, name: 'Dana CSM', reports_to: { id: 2, name: 'Bob Lead' }, is_active: true },
      { id: 9, name: 'Ava Associate', reports_to: { id: 5, name: 'Carl CSM' }, is_active: true },
      // Deactivated, so never offered — but a report still below the reader through her.
      { id: 10, name: 'Eve Exited', reports_to: { id: 1, name: 'Alice Admin' }, is_active: false },
      { id: 11, name: 'Fay Report', reports_to: { id: 10, name: 'Eve Exited' }, is_active: true },
    ];
    expect(bookPeople(members, { id: 1, name: 'Alice' }).map((m) => m.name)).toEqual(['Alice Admin', 'Ava Associate', 'Carl CSM', 'Fay Report']);
    expect(bookPeople([], { id: 1, name: 'Alice' })).toEqual([{ id: 1, name: 'Alice', reports_to: null, is_active: true }]);
  });
});

describe('doingFigures (brain UI spec §2, What’s being done)', () => {
  it('counts active initiatives, and the ones on track: measured and inside their date', () => {
    const late = { ...CARL_INITIATIVE, id: 30, progress: { ...(CARL_INITIATIVE.progress as InitiativeProgress), days_left: -2 } };
    const figures = doingFigures({
      initiatives: [ALICE_INITIATIVE, CARL_INITIATIVE, COMPANY_INITIATIVE, DANA_INITIATIVE, OUTSIDE_VIEW_INITIATIVE, NO_BASELINE_INITIATIVE, late],
      plans: [],
      rules: [],
    });
    // Active: Alice, Carl, outside view, no baseline, late. On track: Alice, Carl.
    expect(figures).toMatchObject({ active: 5, onTrack: 2 });
  });

  it('counts open plans (not done or cancelled) and the ones at risk', () => {
    const cancelled = { ...CARL_PLAN, id: 31, status: 'cancelled' as const };
    expect(doingFigures({ initiatives: [], plans: [CARL_PLAN, ALICE_PLAN, DANA_PLAN, cancelled], rules: [] })).toMatchObject({ openPlans: 2, atRisk: 1 });
  });

  it('does not count a Draft plan as open (Agents delivery 2: Draft is never open)', () => {
    const draft = { ...CARL_PLAN, id: 32, status: 'draft' as const };
    expect(doingFigures({ initiatives: [], plans: [CARL_PLAN, ALICE_PLAN, DANA_PLAN, draft], rules: [] })).toMatchObject({ openPlans: 2, atRisk: 1 });
  });

  it('counts running rules and what they fired last night; a rule not run yet adds nothing', () => {
    expect(doingFigures({ initiatives: [], plans: [], rules: [MY_DOING_RULE, CARL_DOING_RULE, CARL_READABLE_RULE, DANA_DOING_RULE] })).toMatchObject({ running: 3, fired: 6 });
  });

  it('words the tiles', () => {
    expect([onTrackText(2), atRiskText(1), firedText(6)]).toEqual(['2 on track', '1 at risk', '6 fired last night']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BRIEF,
  handedToText,
  briefSummary,
  bundleSourceText,
  greetingText,
  stepChain,
  moreSummary,
  NEXT_UP_KINDS,
  nextUp,
  FEED_CHIPS,
  FEED_GROUP_LABEL,
  GROUP_ORDER,
  addedText,
  bundleHref,
  answeredText,
  approvedText,
  emptyTitle,
  reopenedText,
  threadHref,
  chipAllows,
  chipOf,
  compareIn,
  failedSlots,
  failedText,
  feedBadgeName,
  feedTotal,
  hiddenFeedText,
  kindsOf,
  locateItem,
  queueKindsOf,
  todoBody,
  todoErrors,
  undoPatch,
  withGroup,
  withItem,
  withPage,
  withoutItem,
} from './feed';
import { BUNDLE_ITEM, DRAFT, QUESTION, REVIEW, taskItem } from './testFeedFixtures';
import { CALL_PIZZA, CARL_CHASE, QBR_DECK, RENEWAL_PRICING, ROADMAP, SECURITY, taskDetail } from './testWorkFixtures';
import type { FeedGroup, FeedPayload, TaskDetail } from './workTypes';

const group = (key: FeedGroup['key'], items: FeedGroup['items'], count = items.length, next: string | null = null): FeedGroup => ({ key, count, items, next });
const feedOf = (...groups: FeedGroup[]): FeedPayload => ({
  groups: GROUP_ORDER.map((key) => groups.find((g) => g.key === key) ?? group(key, [])),
  hidden: 0,
  failed: [],
});
const todo = (over: Partial<TaskDetail> & Pick<TaskDetail, 'id' | 'title'>) => taskItem(taskDetail({ due_date: null, parent: null, ...over }));

describe('feed groups and chips', () => {
  it('names the eight groups in the contract order', () => {
    expect(GROUP_ORDER.map((key) => FEED_GROUP_LABEL[key])).toEqual(['Needs your decision', 'Overdue', 'Today', 'This week', 'Later', 'No date', 'Blocked', 'Suggested']);
  });

  it('reads a chip from the URL, unknown as All, and asks the kinds it stands for', () => {
    expect(chipOf('approval')).toBe('approval');
    expect(chipOf('draft')).toBeNull();
    expect(chipOf('constructor')).toBeNull();
    expect(chipOf('toString')).toBeNull();
    expect(chipOf(null)).toBeNull();
    expect(kindsOf(null)).toBeNull();
    expect(chipAllows('approval', 'rule_review')).toBe(true);
    expect(chipAllows('todo', 'task')).toBe(false);
    expect(chipAllows(null, 'draft')).toBe(true);
  });

  it('offers the spec chips in order, Approvals meaning rule reviews, and reads approval as before', () => {
    expect(FEED_CHIPS.map((c) => c.label)).toEqual(['All', 'Bundles', 'Approvals', 'Tasks', 'To-dos', 'Questions', 'Suggestions']);
    expect(kindsOf('bundle')).toEqual(['bundle']);
    expect(kindsOf('approval')).toEqual(['rule_review']);
    expect(chipAllows('approval', 'bundle')).toBe(false);
    expect(emptyTitle('bundle')).toBe('No bundles waiting.');
    expect(failedText(['bundle', 'question'])).toBe("Couldn't load bundles and questions.");
  });

  it('shows Slack messages, meeting proposals and email suggestions under Suggestions in your own feed, never in a Team queue (they are private)', () => {
    expect(kindsOf('suggestion')).toEqual(['suggestion', 'slack_message', 'meeting_proposal', 'email_suggestion']);
    expect(queueKindsOf('suggestion')).toEqual(['suggestion']);
    expect(queueKindsOf('bundle')).toEqual(['bundle']);
    expect(queueKindsOf(null)).toBeNull();
  });

  it('builds the bundle panel link: the Work query kept, or Mine from anywhere else', () => {
    expect(bundleHref('/work', new URLSearchParams('queue=mine&kind=bundle'), 12)).toBe('/work?queue=mine&kind=bundle&bundle=12');
    expect(bundleHref('/copilot', new URLSearchParams(), 12)).toBe('/work?queue=mine&bundle=12');
  });
});

describe('feed ordering (contract §2.1)', () => {
  it('orders decide oldest first, a tie by review, bundle, question, draft', () => {
    const at = '2026-10-05T12:00:00Z';
    const items = [{ ...DRAFT, at }, { ...BUNDLE_ITEM, at }, { ...QUESTION, at }, { ...REVIEW, at }];
    expect(items.sort((a, b) => compareIn('decide', a, b)).map((i) => i.kind)).toEqual(['rule_review', 'bundle', 'question', 'draft']);
  });

  it('orders task groups by date, then priority, and no-date by priority then age', () => {
    const late = taskItem(taskDetail({ id: 1, title: 'a', due_date: '2026-10-09', priority: 'low' }));
    const soonLow = taskItem(taskDetail({ id: 2, title: 'b', due_date: '2026-10-08', priority: 'low' }));
    const soonHigh = taskItem(taskDetail({ id: 3, title: 'c', due_date: '2026-10-08', priority: 'high' }));
    expect([late, soonLow, soonHigh].sort((a, b) => compareIn('week', a, b)).map((i) => i.id)).toEqual([3, 2, 1]);
    const old = todo({ id: 4, title: 'd', priority: 'medium', created_at: '2026-10-01T12:00:00Z' });
    const young = todo({ id: 5, title: 'e', priority: 'medium', created_at: '2026-10-06T12:00:00Z' });
    const urgent = todo({ id: 6, title: 'f', priority: 'high', created_at: '2026-10-07T12:00:00Z' });
    expect([young, old, urgent].sort((a, b) => compareIn('no_date', a, b)).map((i) => i.id)).toEqual([6, 4, 5]);
  });
});

describe('feed changes', () => {
  const pizza = taskItem(CALL_PIZZA);
  const pricing = taskItem(RENEWAL_PRICING);

  it('removes an item from its group, its count one lower, and finds where it was', () => {
    const feed = feedOf(group('overdue', [pizza], 3));
    expect(locateItem(feed, pizza.key)).toEqual({ group: 'overdue', item: pizza });
    const after = withoutItem(feed, pizza.key);
    expect(after.groups[1]).toEqual(group('overdue', [], 2));
    expect(withoutItem(after, pizza.key)).toBe(after);
  });

  it('puts an item back in order, once, its count one higher', () => {
    const feed = feedOf(group('week', [pricing]));
    const early = taskItem(taskDetail({ id: 70, title: 'Early', due_date: '2026-10-08' }));
    const placed = withItem(feed, 'week', early);
    expect(placed.groups[3].items.map((i) => i.id)).toEqual([70, pricing.id]);
    expect(placed.groups[3].count).toBe(2);
    expect(withItem(placed, 'week', early)).toBe(placed);
  });

  it('only counts an item that sorts past a cut group, so Show more never repeats it', () => {
    const feed = feedOf(group('week', [pricing], 5, 'week:1'));
    const late = taskItem(taskDetail({ id: 71, title: 'Late', due_date: '2026-10-14' }));
    const placed = withItem(feed, 'week', late);
    expect(placed.groups[3].items).toEqual([pricing]);
    expect(placed.groups[3].count).toBe(6);
  });

  it('appends a page without repeats and takes its cursor and count', () => {
    const feed = feedOf(group('week', [pricing], 2, 'week:1'));
    const next = taskItem(taskDetail({ id: 72, title: 'Next', due_date: '2026-10-12' }));
    const after = withPage(feed, group('week', [pricing, next], 2, null));
    expect(after.groups[3]).toEqual(group('week', [pricing, next], 2, null));
  });

  it('replaces a retried group and keeps only what still fails', () => {
    const feed = { ...feedOf(), failed: ['bundle', 'question', 'task'] } as FeedPayload;
    const after = withGroup(feed, group('decide', [BUNDLE_ITEM]), ['question'], ['bundle', 'question']);
    expect(after.groups[0].items).toEqual([BUNDLE_ITEM]);
    expect(after.failed).toEqual(['question', 'task']);
  });

  it('adds every group up', () => {
    expect(feedTotal(feedOf(group('decide', [], 2), group('suggested', [], 3)))).toBe(5);
  });
});

describe('feed words', () => {
  it('places each failed source once, where it would show', () => {
    expect(failedSlots(['bundle', 'question', 'task', 'todo', 'suggestion'])).toEqual([
      { at: 'decide', kinds: ['bundle', 'question'], retry: 'decide' },
      { at: 'overdue', kinds: ['task', 'todo'], retry: 'all' },
      { at: 'suggested', kinds: ['suggestion'], retry: 'suggested' },
    ]);
    expect(failedSlots([])).toEqual([]);
  });

  it('says what failed in a list', () => {
    expect(failedText(['bundle'])).toBe("Couldn't load bundles.");
    expect(failedText(['bundle', 'rule_review', 'question'])).toBe("Couldn't load bundles, rule reviews and questions.");
    expect(failedText(['task', 'todo'])).toBe("Couldn't load tasks and to-dos.");
  });

  it('counts what it cannot name', () => {
    expect(hiddenFeedText(0)).toBeNull();
    expect(hiddenFeedText(1)).toBe("1 more on a record you can't open");
    expect(hiddenFeedText(3)).toBe("3 more on records you can't open");
  });

  it('names the badge', () => {
    expect(feedBadgeName(3, 1)).toBe('3 to decide, 1 overdue');
    expect(feedBadgeName(0, 2)).toBe('2 overdue');
    expect(feedBadgeName(0, 0)).toBe('');
  });

  it("links a question's thread on its organisation only", () => {
    expect(threadHref(QUESTION)).toBe('/organizations/3?tab=knowledge');
    expect(threadHref({ ...QUESTION, record: null })).toBeNull();
    expect(threadHref({ ...QUESTION, record: { type: 'account', id: 4, name: 'Uber EMEA' } })).toBeNull();
  });

  it("never doubles a title's own ? or ! in a toast (Chrome test)", () => {
    expect(approvedText('Offer a discount?')).toBe('Approved: Offer a discount?');
    expect(answeredText('When is the offsite?')).toBe('Answered: When is the offsite?');
    expect(reopenedText('Call Oracle')).toBe('Reopened: Call Oracle.');
  });

  it('names the chip in an empty feed, and says nothing waits only under All', () => {
    expect(emptyTitle(null)).toBe('Nothing waiting on you.');
    expect(emptyTitle('approval')).toBe('No approvals waiting.');
    expect(emptyTitle('todo')).toBe('No to-dos waiting.');
    expect(emptyTitle('suggestion')).toBe('No suggestions waiting.');
  });

  it('undoes Done back to the status it had, Blocked with its reason', () => {
    expect(undoPatch(taskItem(CALL_PIZZA).detail)).toEqual({ status: 'pending' });
    expect(undoPatch(taskItem(SECURITY).detail)).toEqual({ status: 'blocked', blocked_reason: 'Waiting on legal' });
  });

  it('says who a new task went to', () => {
    const mine = taskItem(taskDetail({ id: 80, title: 'Book the room', due_date: null, parent: null }));
    expect(addedText({ task: { ...taskDetail({ id: 80, title: 'Book the room', due_date: null }) }, item: mine, group: 'no_date' })).toBe('Added: Book the room.');
    expect(addedText({ task: taskDetail({ id: 81, title: 'Call Ann', due_date: '2026-10-09', assignee: { id: 3, name: 'Carl CSM', active: true } }), item: null, group: null })).toBe('Added for Carl CSM: Call Ann.');
  });
});

describe('quick-add body', () => {
  const base = { title: '  Book the QBR room ', record: null, due: '', priority: 'medium' as const, assignee: null };

  it('sends a plain to-do with no date and no record', () => {
    expect(todoBody(base)).toEqual({ title: 'Book the QBR room', priority: 'medium', due_date: null });
  });

  it('sends the record as customer_id or account_id, with the assignee only then', () => {
    expect(todoBody({ ...base, record: { kind: 'organization', id: 7, name: 'Pizza Hut' }, due: '2026-10-09', assignee: 3 })).toEqual({
      title: 'Book the QBR room', priority: 'medium', due_date: '2026-10-09', customer_id: 7, assignee_id: 3,
    });
    expect(todoBody({ ...base, record: { kind: 'account', id: 9, name: 'Uber EMEA' }, due: '2026-10-09' })).toEqual({
      title: 'Book the QBR room', priority: 'medium', due_date: '2026-10-09', account_id: 9,
    });
    expect(todoBody({ ...base, assignee: 3 })).toEqual({ title: 'Book the QBR room', priority: 'medium', due_date: null });
  });

  it('refuses a blank title, and a record without a date, in the contract words', () => {
    expect(todoErrors({ ...base, title: '  ' })).toEqual({ title: 'Give the task a title.' });
    expect(todoErrors({ ...base, record: { kind: 'organization', id: 7, name: 'Pizza Hut' } })).toEqual({ due_date: 'Choose a date.' });
    expect(todoErrors({ ...base, due: '0002-10-09' })).toEqual({ due_date: 'Choose a date.' });
    expect(todoErrors(base)).toEqual({});
  });
});

describe('moreSummary', () => {
  const plain = { title: 'Call Ann', record: null, due: '', priority: 'medium' as const, assignee: null };
  it('is null for a plain private to-do', () => {
    expect(moreSummary(plain)).toBeNull();
  });
  it('names the record, the person, the date and a non-default priority', () => {
    expect(moreSummary({ ...plain, record: { kind: 'organization', id: 7, name: 'Pizza Hut' }, assignee: 3, due: '2026-10-09', priority: 'low' }, 'Carl CSM')).toBe(
      'With: Pizza Hut · for Carl CSM · due 9 Oct 2026 · Low priority',
    );
  });
});

describe('nextUp (delivery 2 frontend Decision 7)', () => {
  it('takes five from decide, then overdue, then today, and totals the three', () => {
    const feed = feedOf(
      group('decide', [BUNDLE_ITEM, QUESTION]),
      group('overdue', [taskItem(CARL_CHASE)]),
      group('today', [taskItem(QBR_DECK), taskItem(CALL_PIZZA), taskItem(ROADMAP)]),
    );
    const { items, total } = nextUp(feed);
    expect(items.map((entry) => entry.group)).toEqual(['decide', 'decide', 'overdue', 'today', 'today']);
    expect(total).toBe(6);
    expect(NEXT_UP_KINDS).not.toContain('suggestion');
  });

  it('puts bundles first in Next up, then the rest of decide, overdue and today', () => {
    const feed = feedOf(group('decide', [REVIEW, BUNDLE_ITEM]), group('overdue', []), group('today', []));
    expect(nextUp(feed).items.map(({ item }) => item.key)).toEqual([BUNDLE_ITEM.key, REVIEW.key]);
  });
});

describe('Work home: the brief (2026-10-17)', () => {
  it('greets by the hour, with the first name', () => {
    expect(greetingText(0, 'Tushar Aggarwal')).toBe('Good morning, Tushar');
    expect(greetingText(11, 'Tushar')).toBe('Good morning, Tushar');
    expect(greetingText(12, 'Tushar')).toBe('Good afternoon, Tushar');
    expect(greetingText(16, 'Tushar')).toBe('Good afternoon, Tushar');
    expect(greetingText(17, 'Tushar')).toBe('Good evening, Tushar');
    expect(greetingText(23, null)).toBe('Good evening');
    expect(greetingText(9, '  ')).toBe('Good morning');
  });

  it('sums the feed up, leaving out zero parts and pluralising', () => {
    const bundle = (id: number) => ({ ...BUNDLE_ITEM, key: `bundle:${id}`, id });
    expect(briefSummary(feedOf(group('decide', [bundle(1), bundle(2), bundle(3), bundle(4), QUESTION], 5), group('overdue', [], 1), group('today', [], 2)))).toBe(
      'Revenact prepared 4 plans of action · 5 wait on you · 3 due today',
    );
    expect(briefSummary(feedOf(group('decide', [bundle(1)])))).toBe('Revenact prepared 1 plan of action · 1 waits on you');
    expect(briefSummary(feedOf(group('decide', [QUESTION], 2)))).toBe('2 wait on you');
    expect(briefSummary(feedOf(group('today', [], 1)))).toBe('1 due today');
    expect(briefSummary(feedOf(group('suggested', [], 9)))).toBe('Nothing waits on you · Revenact has 9 suggestions to look at');
    expect(briefSummary(feedOf(group('suggested', [], 0)))).toBe(BRIEF.CLEAR);
    expect(briefSummary(feedOf(group('suggested', [], 1)))).toBe('Nothing waits on you · Revenact has 1 suggestion to look at');
    expect(briefSummary(feedOf(group('today', [], 2), group('suggested', [], 9)))).toBe('2 due today · 9 suggestions');
  });

  it('names a bundle source in a word or two', () => {
    expect(bundleSourceText({ kind: 'nightly', label: 'Nightly review' })).toBe('Nightly review');
    expect(bundleSourceText({ kind: 'slack_message', label: 'Slack' })).toBe('Slack message');
    expect(bundleSourceText({ kind: 'thread', label: 'Zendesk' })).toBe('Zendesk');
  });

  it('caps a step chain at five, then counts the rest', () => {
    expect(stepChain(['a', 'b'])).toEqual({ shown: ['a', 'b'], more: 0 });
    expect(stepChain(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual({ shown: ['a', 'b', 'c', 'd', 'e'], more: 2 });
  });
});

describe('handedToText (2026-10-18)', () => {
  it('names one, two or more people', () => {
    expect(handedToText(['Tushar Aggarwal'])).toBe('Sent to Tushar Aggarwal');
    expect(handedToText(['Tushar', 'Jesh'])).toBe('Sent to Tushar and Jesh');
    expect(handedToText(['A', 'B', 'C'])).toBe('Sent to A, B and C');
  });
});

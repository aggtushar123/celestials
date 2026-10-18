import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { FALLBACK_QUEUES, chipsFor, isQueueRefusal, isRoutedQueue, optionText, queueHref, queueOf, railCount, teamRedirect } from './queues';

describe('queues (agent bundles D1 frontend Decisions 1 to 3)', () => {
  it('reads the queue from the URL, Mine by default, delivery 2 keys kept', () => {
    expect(queueOf(new URLSearchParams(''))).toBe('mine');
    expect(queueOf(new URLSearchParams('queue=history'))).toBe('history');
    expect(queueOf(new URLSearchParams('queue=nonsense'))).toBe('mine');
  });

  it('links a queue with nothing else kept, and names a phone option with its count', () => {
    expect(queueHref('team')).toBe('/work?queue=team');
    expect(optionText({ key: 'mine', label: 'Mine', count: 4 })).toBe('Mine (4)');
    expect(optionText({ key: 'history', label: 'History', count: null })).toBe('History');
    expect(optionText({ key: 'department:cs', label: 'Customer Success', count: 2, needs_customer: 3 })).toBe('Customer Success (5)');
    expect(optionText({ key: 'unassigned', label: 'Unassigned', count: 2, needs_customer: null })).toBe('Unassigned (2)');
    expect(FALLBACK_QUEUES.map((q) => q.key)).toEqual(['mine', 'history']);
  });

  it('offers To-dos on Mine only and no chips on History', () => {
    expect(chipsFor('mine').map((c) => c.label)).toEqual(['All', 'Bundles', 'Approvals', 'Tasks', 'To-dos', 'Questions', 'Suggestions']);
    expect(chipsFor('team').map((c) => c.label)).toEqual(['All', 'Bundles', 'Approvals', 'Tasks', 'Questions', 'Suggestions']);
    expect(chipsFor('history')).toEqual([]);
  });

  it('turns an old Team link into its queue, the rest of the query kept', () => {
    expect(teamRedirect('?scope=company&task=4')).toBe('/work?task=4&queue=company');
    expect(teamRedirect('')).toBe('/work?queue=team');
    expect(teamRedirect('?scope=me')).toBe('/work?queue=team');
  });

  it('knows a queue the reader may no longer use', () => {
    expect(isQueueRefusal(new ApiError(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." }, 'Forbidden'))).toBe(true);
    expect(isQueueRefusal(new ApiError(500, {}, 'Down'))).toBe(false);
  });
});

describe('department and Unassigned queues (agent bundles D2 §4.5; Decisions 1, 2)', () => {
  it('reads department codes and Unassigned from the URL, and nothing else', () => {
    expect(queueOf(new URLSearchParams('queue=department:cs'))).toBe('department:cs');
    expect(queueOf(new URLSearchParams('queue=department:engineering'))).toBe('department:engineering');
    expect(queueOf(new URLSearchParams('queue=unassigned'))).toBe('unassigned');
    expect(queueOf(new URLSearchParams('queue=department:3'))).toBe('mine');
    expect(queueOf(new URLSearchParams('queue=department:finance'))).toBe('mine');
  });

  it('gives them no kind chips and links them by key', () => {
    expect(chipsFor('department:cs')).toEqual([]);
    expect(chipsFor('unassigned')).toEqual([]);
    expect(queueHref('department:cs')).toBe('/work?queue=department%3Acs');
    expect(isRoutedQueue('unassigned')).toBe(true);
    expect(isRoutedQueue('team')).toBe(false);
  });
});

describe('railCount (round 2 D3 Decision 5)', () => {
  it('adds the messages that need a customer, and stays null when the count failed', () => {
    expect(railCount({ key: 'department:cs', label: 'Customer Success', count: 2, needs_customer: 3 })).toBe(5);
    expect(railCount({ key: 'department:cs', label: 'Customer Success', count: 2 })).toBe(2);
    expect(railCount({ key: 'department:cs', label: 'Customer Success', count: null, needs_customer: 3 })).toBeNull();
  });

  it('shows no figure for an empty queue, so Mine never reads 0 beside a full list (Work home, 2026-10-17)', () => {
    expect(railCount({ key: 'mine', label: 'Mine', count: 0 })).toBeNull();
    expect(railCount({ key: 'department:cs', label: 'Customer Success', count: 0, needs_customer: 0 })).toBeNull();
    expect(railCount({ key: 'department:cs', label: 'Customer Success', count: 0, needs_customer: 1 })).toBe(1);
    expect(optionText({ key: 'mine', label: 'Mine', count: 0 })).toBe('Mine');
  });
});

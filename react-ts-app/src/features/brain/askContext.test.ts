import { describe, expect, it } from 'vitest';
import { BRAIN_ASK_PATHS, BRAIN_STARTERS, brainAskContext, brainAskTabOf, brainLabel, brainPath } from './askContext';

describe('Ask on the Brain: the rules (brain ask spec §2.1, §2.2)', () => {
  it('reads the question from the four tab paths only', () => {
    expect(brainAskTabOf('/brain')).toBe('changed');
    expect(brainAskTabOf('/brain/')).toBe('changed');
    expect(brainAskTabOf('/brain/waiting')).toBe('waiting');
    expect(brainAskTabOf('/brain/doing')).toBe('doing');
    expect(brainAskTabOf('/brain/customers')).toBe('customers');
    // Feature Requests, Anomalies and the Graph have no Ask context (spec §2.2, §4).
    expect(brainAskTabOf('/brain/requests')).toBeNull();
    expect(brainAskTabOf('/brain/anomalies')).toBeNull();
    expect(brainAskTabOf('/brain/graph')).toBeNull();
    expect(brainAskTabOf('/brainstorm')).toBeNull();
  });

  it('builds the context the server reads: surface, scope and tab, and no focus', () => {
    expect(brainAskContext('waiting', 'team')).toEqual({ surface: 'brain', scope: 'team', tab: 'waiting' });
  });

  it('chips a question with the tab title and the scope label', () => {
    expect(brainLabel({ surface: 'brain', scope: 'company', tab: 'changed' })).toBe('Brain · What changed · Company');
    expect(brainLabel({ surface: 'brain', scope: 'team', tab: 'waiting' })).toBe('Brain · Waiting on you · My team');
    expect(brainLabel({ surface: 'brain', scope: 'me', tab: 'doing' })).toBe("Brain · What's being done · Me");
    expect(brainLabel({ surface: 'brain', scope: 'me', tab: 'customers' })).toBe('Brain · Customers · Me');
  });

  it('reopens a conversation on its tab, with its scope', () => {
    expect(brainPath({ surface: 'brain', scope: 'team', tab: 'changed' })).toBe('/brain?scope=team');
    expect(brainPath({ surface: 'brain', scope: 'company', tab: 'customers' })).toBe('/brain/customers?scope=company');
    expect(BRAIN_ASK_PATHS).toEqual({ changed: '/brain', waiting: '/brain/waiting', doing: '/brain/doing', customers: '/brain/customers' });
  });

  it('has three fixed starters per tab, the spec’s text verbatim (§2.3)', () => {
    expect(BRAIN_STARTERS).toEqual({
      changed: ['Why did these numbers move?', 'Where is the ARR at risk concentrated?', 'What should I watch next?'],
      waiting: ['What should I decide first?', 'What has been waiting longest, and why?', 'Which of these can I clear today?'],
      doing: ['Which initiatives are off track?', 'Are the plans moving health and ARR?', 'What are the rules doing for this book?'],
      customers: ['What are customers asking for most?', 'Who turned negative, and what do they have in common?', 'What do the latest comments say?'],
    });
  });
});

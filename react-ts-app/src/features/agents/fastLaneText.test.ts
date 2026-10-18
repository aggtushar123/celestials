import { describe, expect, it } from 'vitest';
import { FAST_LANE, rulesSummary, usedLine } from './fastLaneText';
import { FAST_LANE_OFF, FAST_LANE_ON } from './testAgentsFixtures';

describe('fast lane words (frontend Decision 7)', () => {
  it('says what was used against the caps', () => {
    expect(usedLine(FAST_LANE_ON)).toBe('Used in the last hour: 1 of 10. In the last 24 hours: 3 of 50.');
  });

  it('summarises the rules for a member', () => {
    expect(rulesSummary(FAST_LANE_ON)).toBe("Jira's top priority; Slack #support; words: outage, data loss; senders: @bigco.com");
    expect(FAST_LANE.TITLE).toBe('Fast lane');
  });

  it('names poor health, and says when there are no rules', () => {
    const lane = { ...FAST_LANE_OFF, rules: { ...FAST_LANE_OFF.rules, jira_priority: false, poor_health: true } };
    expect(rulesSummary(lane)).toBe('customers in poor health');
    expect(rulesSummary({ ...lane, rules: { ...lane.rules, poor_health: false } })).toBe('No rules yet.');
    expect(FAST_LANE.REMOVE('outage')).toBe('Remove outage');
  });
});

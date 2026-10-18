// The words of Settings › Agents › Fast lane (round 2 D3 frontend Decision 7;
// contract §5). Kept free of React. No em dash.
import type { FastLaneSettings } from './agentTypes';

export const FAST_LANE = {
  TITLE: 'Fast lane',
  SWITCH: 'Fast lane',
  HINT: 'Urgent conversations are read after 2 quiet minutes instead of on the schedule above. Rules decide what is urgent, never AI. Each conversation read uses AI credits.',
  JIRA: "Jira's top priority",
  JIRA_HINT: 'Highest, Blocker or Critical',
  SLACK: 'Slack channels',
  SLACK_HINT: 'Every message in these channels is urgent.',
  NO_SLACK: 'No Slack connection yet.',
  WORDS: 'Words',
  WORDS_HINT: 'Up to 20 words or phrases. Whole words, any case.',
  SENDERS: 'Senders',
  SENDERS_HINT: 'Up to 50 email addresses or @domains.',
  ADD: 'Add',
  REMOVE: (tag: string) => `Remove ${tag}`,
  HEALTH: 'Customers in poor health',
  HEALTH_HINT: 'Health score below 4.',
  LIMITS: 'Limits',
  PER_HOUR: 'Per hour',
  PER_DAY: 'Per day',
  ON: 'On',
  OFF: 'Off',
  NO_RULES: 'No rules yet.',
} as const;

/** "Used in the last hour: 1 of 10. In the last 24 hours: 3 of 50." */
export const usedLine = (lane: FastLaneSettings): string =>
  `Used in the last hour: ${lane.used_hour} of ${lane.per_hour}. In the last 24 hours: ${lane.used_day} of ${lane.per_day}.`;

/** The active rules as text, for a member: "Jira's top priority; Slack #support; words: outage; senders: @bigco.com". */
export function rulesSummary(lane: FastLaneSettings): string {
  const { rules } = lane;
  const slack = lane.slack_choices.filter((c) => rules.slack_connectors.includes(c.id)).map((c) => c.name);
  const parts = [
    rules.jira_priority ? FAST_LANE.JIRA : '',
    ...slack,
    rules.words.length > 0 ? `words: ${rules.words.join(', ')}` : '',
    rules.senders.length > 0 ? `senders: ${rules.senders.join(', ')}` : '',
    rules.poor_health ? FAST_LANE.HEALTH.replace(/^C/, 'c') : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : FAST_LANE.NO_RULES;
}

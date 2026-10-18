// Words for a Slack message sent to Work (connections spec 2026-10-16 §3).
// Sentence case, no em dash.
export const SLACK_ROW = {
  FROM: 'From',
  OPEN: 'Open in Slack',
  DISMISS: 'Dismiss',
  DISMISSED: 'Slack message dismissed.',
  DISMISS_FAILED: "Couldn't dismiss it. Try again.",
  GONE: 'That Slack message is no longer in your Work.',
  SUGGESTED: (label: string) => `Suggested next step: ${label}`,
  ABOUT: (name: string) => `About ${name}`,
  HEALTH: (score: string) => `Health ${score}`,
  ARR: (money: string) => `${money} ARR`,
  RENEWS: (days: number) => (days < 0 ? `Renewal ${-days}d overdue` : `Renews in ${days}d`),
  OWNER: (name: string) => `Owner ${name}`,
  TICKET: (number: string, title: string, days: number | null) => `${number} ${title}${days === null ? '' : ` · ${days} ${days === 1 ? 'day' : 'days'} open`}`,
  JIRA_HEADING: 'Jira issue',
  JIRA_TITLE: (project: string) => `Jira issue title (${project})`,
  JIRA_CREATE: 'Create in Jira',
  JIRA_CREATING: 'Creating…',
  JIRA_MADE: 'Created',
  JIRA_FAILED: "Couldn't create the Jira issue. Try again.",
  JIRA_NONE: 'Connect Jira in Settings › Connections to create issues from here.',
  REPLY_HEADING: 'Reply',
  REPLY_LABEL: (to: string) => `Reply to ${to || 'the sender'}, as you`,
  REPLY_SEND: 'Send reply',
  REPLY_SENDING: 'Sending…',
  REPLIED: (to: string) => `Replied to ${to || 'the sender'}.`,
  REPLY_VIEW: 'View in Slack',
  REPLY_FAILED: "Couldn't send the reply. Try again.",
  BOTH: 'Do both',
} as const;

/** The reply once the issue exists: "{issue}" becomes its key and link. */
export function withIssue(template: string, key: string, url: string): string {
  return template.split('{issue}').join(`${key} (${url})`);
}

export function compactMoney(value: number | null): string {
  if (value === null) return '';
  return value >= 1000 ? `$${(value / 1000).toFixed(1)}K` : `$${value.toFixed(0)}`;
}

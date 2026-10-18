// "Your Jira account" on Settings › Connections (round 2 D2 frontend
// Decisions 1 to 3). Plain words; no em dash.
import type { JiraLink, JiraLinkState } from './jiraLink';

export const JIRA_LINK = {
  TITLE: 'Your Jira account',
  INTRO: "Link it so the Jira steps you run act as you. Until then they act as the Jira connection's account.",
  LINK: 'Link your Jira account',
  LINK_AGAIN: 'Link again',
  OPENING: 'Opening Atlassian…',
  LINKED_AS: 'Linked as',
  ACTS_IN: 'Acts as you in',
  NONE_COVERED: "None of this workspace's Jira sites",
  LOST: 'Your Jira link stopped working. Link it again, or unlink it.',
  UNLINK: 'Unlink',
  UNLINKING: 'Unlinking…',
  UNLINK_TITLE: 'Unlink your Jira account?',
  UNLINK_MESSAGE: "The Jira steps you run will act as the Jira connection's account. To remove Revenact's access fully, also remove it under Connected apps in your Atlassian account.",
  LOADING: 'Loading your Jira link…',
  LOAD_FAILED: "Couldn't load your Jira link.",
  START_FAILED: "Couldn't open Atlassian. Try again.",
  LINKED: 'Jira account linked.',
  FAILED: 'Could not link Jira: ',
} as const;

export const linkedAsText = (link: JiraLink): string => (link.email ? `${link.name} (${link.email})` : link.name);

export function coversText(state: JiraLinkState): string {
  const covered = state.connectors.filter((c) => state.link?.covers.includes(c.id)).map((c) => c.name);
  return covered.length > 0 ? covered.join(', ') : JIRA_LINK.NONE_COVERED;
}

export const showsSection = (state: JiraLinkState): boolean => state.link !== null || (state.configured && state.connectors.length > 0);

export function outcomeLine(query: URLSearchParams): { text: string; failed: boolean } | null {
  const outcome = query.get('jira_link');
  if (outcome === 'linked') return { text: JIRA_LINK.LINKED, failed: false };
  if (outcome === 'error') return { text: `${JIRA_LINK.FAILED}${query.get('detail') || 'Atlassian refused.'}`, failed: true };
  return null;
}

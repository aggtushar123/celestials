// Words for Settings › Connections (connections page spec 2026-10-16).
// Sentence case, no em dash.
import type { Connector, Provider } from './connectorsSlice';

export const CONNECTIONS = {
  INTRO: 'Your accounts and the tools Revenact reads from.',
  YOURS: 'Your accounts',
  YOURS_HINT: 'Only you connect these. They act as you.',
  WORKSPACE: 'Workspace',
  WORKSPACE_HINT: 'Connected once for the whole company.',
  SOON: 'Coming soon',
  SOON_HINT: 'Records already brought in from these stay on your customers.',
  SOON_BADGE: 'Coming soon',
  /** The two parts of a tool's card. */
  PART_YOURS: 'Your account',
  PART_WORKSPACE: 'Workspace',
} as const;

/** The three tools, each one card (owner, 2026-10-16): what the tool does,
 *  for you and for the company. */
export const TOOL_CARDS = {
  gmail: { name: 'Gmail', desc: 'Your customer email, synced from your own mailbox.' },
  slack: { name: 'Slack', desc: 'Channel threads file on the customer they name, and your own link sends your replies as you. Revenact never reads your DMs.' },
  jira: { name: 'Jira', desc: 'Issues sync as tickets for the engineering team, and Jira steps you run act as you.' },
} as const;

export const GMAIL = {
  NAME: 'Gmail',
  DESC: 'Your email with customers, matched to their records. Only you read it until you add a conversation to Revenact.',
  CONNECT: 'Connect Gmail',
  CONNECT_GOOGLE: 'Connect with Google',
  USE_APP_PASSWORD: 'Use an app password instead',
  OTHER_PROVIDER: 'Another mail provider (IMAP)',
  NOT_CONNECTED: 'Not connected',
  ADDRESS: 'Gmail address',
  APP_PASSWORD: 'App password',
  APP_PASSWORD_HELP: 'Turn on 2-Step Verification in your Google account, then create an app password for Revenact.',
  APP_PASSWORD_LINK: 'Create an app password',
  CHECKING: 'Checking login…',
  CANCEL: 'Cancel',
  DISCONNECT: 'Disconnect',
  SYNC: 'Sync now',
  SYNCING: 'Syncing…',
  RECONNECT: 'Reconnect',
  CONNECTED: 'Mailbox connected.',
} as const;

export const SLACK_LINK = {
  NAME: 'Slack',
  DESC: 'Replies you send from Revenact post as you, and your messages show as yours. Revenact never reads your DMs.',
  LINK: 'Link Slack',
  LINK_AGAIN: 'Reconnect',
  OPENING: 'Opening Slack…',
  NOT_LINKED: 'Not linked',
  NEEDS_WORKSPACE: 'Available once an admin connects Slack for the workspace',
  UNAVAILABLE: 'Not available on this deployment yet',
  LOST: 'Stopped working. Reconnect, or unlink it.',
  UNLINK: 'Unlink',
  UNLINK_TITLE: 'Unlink your Slack account?',
  UNLINK_MESSAGE: 'Replies you send from Revenact will post as the Revenact app. Your Slack token is revoked and deleted.',
  START_FAILED: "Couldn't open Slack. Try again.",
  LINKED: 'Slack account linked.',
  FAILED: 'Could not link Slack: ',
} as const;

export const JIRA_ACCOUNT = {
  NAME: 'Jira',
  DESC: 'Jira steps you run act as you.',
  NEEDS_WORKSPACE: 'Available once an admin connects Jira for the workspace',
} as const;

export const TOOL = {
  NOT_CONNECTED: 'Not connected',
  CONNECT: 'Connect',
  SYNC: 'Sync now',
  RECONNECT: 'Reconnect',
  ALREADY_HERE: 'already here',
} as const;

/** The two tools an admin connects for the workspace, and what each one does. */
export const WORKSPACE_TOOLS: { id: Extract<Provider, 'slack' | 'jira'>; name: string; desc: string }[] = [
  { id: 'slack', name: 'Slack', desc: 'Reads the channels you choose; each thread files on the customer it names.' },
  { id: 'jira', name: 'Jira', desc: 'Issues from a project, synced as tickets for the engineering team.' },
];

/** Everything else the backend knows, listed without buttons for now. */
export const COMING_SOON: { id: Provider; name: string; category: string }[] = [
  { id: 'salesforce', name: 'Salesforce', category: 'CRM' },
  { id: 'hubspot', name: 'HubSpot', category: 'CRM' },
  { id: 'zendesk', name: 'Zendesk', category: 'Support' },
  { id: 'freshdesk', name: 'Freshdesk', category: 'Support' },
  { id: 'intercom', name: 'Intercom', category: 'Support' },
  { id: 'webhook', name: 'Any other system', category: 'Support' },
  { id: 'github', name: 'GitHub', category: 'Productivity' },
  { id: 'figma', name: 'Figma', category: 'Productivity' },
  { id: 'ms_teams', name: 'Microsoft Teams', category: 'Communication' },
  { id: 'zoom', name: 'Zoom', category: 'Communication' },
];

export function slackLinkOutcome(query: URLSearchParams): { text: string; failed: boolean } | null {
  const outcome = query.get('slack_link');
  if (outcome === 'linked') return { text: SLACK_LINK.LINKED, failed: false };
  if (outcome === 'error') return { text: `${SLACK_LINK.FAILED}${query.get('detail') || 'Slack refused.'}`, failed: true };
  return null;
}

/** The connection a tool's row stands for: the one with credentials, else the first. */
export function primaryConnector(connectors: Connector[]): Connector | null {
  return connectors.find((c) => c.has_credentials) ?? connectors[0] ?? null;
}

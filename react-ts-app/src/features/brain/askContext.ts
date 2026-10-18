// Ask Revenact on the Brain (brain ask spec 2026-10-06 §2): which of the four
// questions a path shows, the context a question carries, its chip, and the
// page a History pick reopens. Kept free of React so the rules are
// unit-tested on their own.
import type { BrainAskContext, BrainAskOrigin, BrainAskTab } from '../../pages/copilot/types';
import { BRAIN_TABS, WAITING_LABEL, WAITING_TAB } from './brainTabs';
import type { ScopeKey } from './brainTypes';

const SEPARATOR = ' · ';

/** Each question's tab, as the Brain bar links it. */
export const BRAIN_ASK_PATHS: Record<BrainAskTab, string> = {
  changed: '/brain',
  waiting: WAITING_TAB,
  doing: '/brain/doing',
  customers: '/brain/customers',
};

/** The scope names the server's scopes/ read gives (brain.scope), so a stored
 *  turn's chip reads the same as the switch without a read of its own. */
export const BRAIN_SCOPE_LABELS: Record<ScopeKey, string> = { me: 'Me', team: 'My team', company: 'Company' };

const TAB_PATHS: readonly [BrainAskTab, RegExp][] = [
  ['changed', /^\/brain\/?$/],
  ['waiting', /^\/brain\/waiting\/?$/],
  ['doing', /^\/brain\/doing\/?$/],
  ['customers', /^\/brain\/customers\/?$/],
];

/** The question a Brain path shows; null on Feature Requests, Anomalies, the
 *  Graph and anywhere else (brainTabOf lights Customers on two of those, but
 *  they have no Ask context in this delivery). */
export function brainAskTabOf(pathname: string): BrainAskTab | null {
  return TAB_PATHS.find(([, path]) => path.test(pathname))?.[0] ?? null;
}

/** Where the person is on the Brain, as the server needs it. */
export function brainAskContext(tab: BrainAskTab, scope: ScopeKey): BrainAskContext {
  return { surface: 'brain', scope, tab };
}

/** "Brain · What changed · Company": the tab title, then the scope label. */
export function brainLabel(context: BrainAskContext | BrainAskOrigin): string {
  const title = [...BRAIN_TABS, { path: WAITING_TAB, label: WAITING_LABEL }].find((tab) => tab.path === BRAIN_ASK_PATHS[context.tab])?.label;
  return ['Brain', title, BRAIN_SCOPE_LABELS[context.scope]].filter(Boolean).join(SEPARATOR);
}

/** The tab a Brain conversation started on, with its scope. */
export function brainPath(origin: BrainAskOrigin): string {
  return `${BRAIN_ASK_PATHS[origin.tab]}?${new URLSearchParams({ scope: origin.scope }).toString()}`;
}

/** The composer, while the page's scope is still settling (spec §2.2). */
export const ASK_AFTER_SCOPE = 'Ask opens once this view loads.';

/** The composer on Feature Requests, Anomalies and the Graph, which have no
 *  Ask context in this delivery (spec §2.2). */
export const ASK_FROM_A_TAB = 'Ask from one of the four Brain tabs.';

/** A 400 refusing the scope a question was asked in (spec §2.4): the
 *  reader's views changed after the page settled. */
export const VIEW_CHANGED = 'That view changed; ask again.';

/** Three fixed questions per tab (spec §2.3, owner decision 1): no model
 *  call, shown only while the conversation is empty. */
export const BRAIN_STARTERS: Record<BrainAskTab, readonly string[]> = {
  changed: ['Why did these numbers move?', 'Where is the ARR at risk concentrated?', 'What should I watch next?'],
  waiting: ['What should I decide first?', 'What has been waiting longest, and why?', 'Which of these can I clear today?'],
  doing: ['Which initiatives are off track?', 'Are the plans moving health and ARR?', 'What are the rules doing for this book?'],
  customers: ['What are customers asking for most?', 'Who turned negative, and what do they have in common?', 'What do the latest comments say?'],
};

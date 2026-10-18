import type { AskFocus, OrganizationDetailContext, OrganizationDetailOrigin, StoryFocus } from '../../pages/copilot/types';
import { ACCOUNT_TABS, type DetailParams } from './detailParams';
import { KIND_NAME, isStoryKind } from './storyKinds';

// Ask Revenact on one organisation's page (spec 2026-09-26 §3): the context
// a question carries, its chip, the History tag and the path a restore opens.

const SEPARATOR = ' · ';

/** What the organisation page reports so a live question's chip can name
 *  it before the server has: the organisation's name and its accounts'. */
export interface DetailNames {
  organization: number;
  name: string;
  accounts: Record<number, string>;
}

/** The route's `:id` as an organisation id: a positive integer written
 *  plainly ("7"), else null ("0", "007", "abc"). The page and its Ask
 *  context both read the id through this, so they never disagree. */
export function parseOrganizationId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

/** `/organizations/7` gives 7; any other path gives null. */
export function detailIdOf(pathname: string): number | null {
  // …/plans/new is the New plan modal over this page (plans spec §2.2).
  const match = /^\/organizations\/([^/]+)(?:\/plans\/new)?$/.exec(pathname);
  return match ? parseOrganizationId(match[1]) : null;
}

/** The page as a question carries it. The account follows the account chip
 *  (`?account=`) on the tabs that show the chips. It is null for All, for
 *  "Organization" (`none`, which the server has no scope for), and on
 *  Details and Knowledge, which are the whole organisation's. */
export function detailContext(organization: number, params: DetailParams): OrganizationDetailContext {
  const account = ACCOUNT_TABS.has(params.tab) && /^[1-9]\d*$/.test(params.account) ? Number(params.account) : null;
  return { surface: 'organizations', view: 'detail', organization, account, focus: null };
}

/** A story item's focus, as opposed to a Dashboard or List one. */
export function isStoryFocus(focus: AskFocus | null | undefined): focus is StoryFocus {
  return focus != null && isStoryKind(focus.kind);
}

function kindWords(focus: StoryFocus): string {
  return (KIND_NAME[focus.kind] ?? 'Item').toLowerCase();
}

/** The focus part of a chip, named by the item's own word: "This note",
 *  "This opportunity". Shared by every item-level "Ask about this" (story
 *  items here, Pipelines opportunities and risks in
 *  `features/pipelines/askContext`), so the template lives once. */
export function itemFocusLabel(word: string): string {
  return `This ${word}`;
}

/** The question "Ask about this" prefills, named by the item's own word.
 *  The person can edit it. Shared the same way as `itemFocusLabel`. */
export function itemAskQuestion(word: string): string {
  return `What should I know about this ${word}?`;
}

/** The focus part of the chip: "This note", "This calendar event". */
export function storyFocusLabel(focus: StoryFocus): string {
  return itemFocusLabel(kindWords(focus));
}

/** The question "Ask about this" prefills. The person can edit it. */
export function askAboutQuestion(focus: StoryFocus): string {
  return itemAskQuestion(kindWords(focus));
}

/** The chip: "Pizza Hut" or "Pizza Hut · EMEA", then the focus. A stored
 *  context's `label` is the server's and wins. A live one is named from what
 *  the page reported, and reads "This organization" or "Account" until the
 *  page has loaded. The focus is never in `label`, so it is always named
 *  from `focus`. */
export function detailLabel(context: OrganizationDetailContext, names: DetailNames | null = null): string {
  const ours = names?.organization === context.organization ? names : null;
  const parts = context.label
    ? [context.label]
    : [ours?.name ?? 'This organization', ...(context.account === null ? [] : [ours?.accounts[context.account] ?? 'Account'])];
  if (context.focus) parts.push(storyFocusLabel(context.focus));
  return parts.join(SEPARATOR);
}

/** Where a conversation started on an organisation's page reopens (spec §3):
 *  the page, with its account chip when there was one. */
export function detailPath(origin: OrganizationDetailOrigin): string {
  const path = `/organizations/${origin.organization}`;
  return origin.account === null ? path : `${path}?account=${origin.account}`;
}

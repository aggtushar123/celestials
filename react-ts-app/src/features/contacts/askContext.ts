import type {
  ContactsFilters,
  ContactsListContext,
  ContactsListOrigin,
  ContactsPersonContext,
  ContactsPersonOrigin,
} from '../../pages/copilot/types';
import { CONTACT_ROLES, SENTIMENTS, parseContactsParams, toContactsSearch } from './contactsParams';

// Ask Revenact on Contacts (spec 2026-09-28 §4): the context a question
// carries, its chip, the History restore path and "Why this sentiment?".

const SEPARATOR = ' · ';

/** What the Contacts page reports so a live question's chip can name it
 *  before the server has: the open person, and the filtered organisation
 *  and account. */
export interface ContactsNames {
  person: { id: number; name: string; place: string } | null;
  organisation: { id: number; name: string } | null;
  account: { id: number; name: string } | null;
}

/** `/contacts/41` gives 41; any other path gives null. The page reads its
 *  `:id` with the same rule, so the two never disagree. */
export function contactsIdOf(pathname: string): number | null {
  const match = /^\/contacts\/([1-9]\d*)$/.exec(pathname);
  return match ? Number(match[1]) : null;
}

/** Where the person is on Contacts, as the server needs it (backend #72):
 *  one person's id, or the page's own set filters. Never names or figures. */
export function contactsContextOf(pathname: string, search: string): ContactsListContext | ContactsPersonContext | null {
  const contact = contactsIdOf(pathname);
  if (contact !== null) return { surface: 'contacts', view: 'person', contact, focus: null };
  if (pathname !== '/contacts' && pathname !== '/contacts/') return null;
  const filters: ContactsFilters = Object.fromEntries(toContactsSearch(parseContactsParams(new URLSearchParams(search))));
  return { surface: 'contacts', view: 'list', filters };
}

function listParts(filters: ContactsFilters, names: ContactsNames | null): string[] {
  const parts = ['Contacts'];
  if (filters.customer) {
    const organisation = names?.organisation?.id === Number(filters.customer) ? names.organisation.name : 'Organisation';
    const account = filters.account ? (names?.account?.id === Number(filters.account) ? names.account.name : 'Account') : null;
    parts.push(account ? `${organisation} › ${account}` : organisation);
  }
  const sentiment = SENTIMENTS.find((s) => s.value === filters.sentiment);
  if (sentiment) parts.push(sentiment.label);
  const role = CONTACT_ROLES.find((r) => r.value === filters.role);
  if (role) parts.push(role.label);
  if (filters.q) parts.push(`"${filters.q}"`);
  return parts;
}

/** The chip. A stored context's `label` is the server's and wins; a live one
 *  is named from what the page reported. The sentiment focus is never in
 *  `label`, so it is always named from `focus`. */
export function contactsLabel(context: ContactsListContext | ContactsPersonContext, names: ContactsNames | null = null): string {
  if (context.view === 'list') return context.label ?? listParts(context.filters, names).join(SEPARATOR);
  const person = names?.person?.id === context.contact ? names.person : null;
  const base = context.label ?? (person ? `${person.name}${SEPARATOR}${person.place || 'No organisation'}` : 'This person');
  return context.focus === 'sentiment' ? `${base}${SEPARATOR}Sentiment` : base;
}

/** Where a conversation started on Contacts reopens: the person, or the list
 *  with its filters, in the page's own URL order. */
export function contactsPath(origin: ContactsListOrigin | ContactsPersonOrigin): string {
  if (origin.view === 'person') return `/contacts/${origin.contact}`;
  const query = new URLSearchParams();
  for (const key of ['q', 'customer', 'account', 'sentiment', 'role'] as const) {
    const value = origin.filters[key];
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `/contacts?${text}` : '/contacts';
}

/** The question "Why this sentiment?" types in. The person can edit it. */
export function whyQuestion(name: string, sentiment: string): string {
  const first = name.trim().split(/\s+/)[0] || name.trim();
  return `Why is ${first}'s sentiment ${sentiment}?`;
}

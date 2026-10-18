import type { Contact } from '../customers/customersSlice';

// The Contacts page's URL state (spec 2026-09-28 §3): the search and the
// four filters. Unknown values read as "all".

export const SENTIMENTS: { value: Contact['sentiment']; label: string }[] = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
];

/** Contact.Role on the backend, value for value. */
export const CONTACT_ROLES: { value: Contact['role']; label: string }[] = [
  { value: 'executive_sponsor', label: 'Executive Sponsor' },
  { value: 'champion', label: 'Champion' },
  { value: 'economic_buyer', label: 'Economic Buyer' },
  { value: 'technical_lead', label: 'Technical Lead' },
  { value: 'decision_maker', label: 'Decision Maker' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'finance_manager', label: 'Finance Manager' },
  { value: 'other', label: 'Other' },
];

export interface ContactsParams {
  q: string;
  /** An organisation (Customer) id, or '' for all. */
  customer: string;
  /** An account id inside that organisation, or ''. */
  account: string;
  sentiment: Contact['sentiment'] | '';
  role: Contact['role'] | '';
}

export const NO_FILTERS: ContactsParams = { q: '', customer: '', account: '', sentiment: '', role: '' };

const idValue = (raw: string | null) => (raw && /^[1-9]\d*$/.test(raw) ? raw : '');

export function parseContactsParams(search: URLSearchParams): ContactsParams {
  const customer = idValue(search.get('customer'));
  const sentiment = search.get('sentiment') ?? '';
  const role = search.get('role') ?? '';
  return {
    q: search.get('q') ?? '',
    customer,
    // An account means something only inside its organisation.
    account: customer ? idValue(search.get('account')) : '',
    sentiment: SENTIMENTS.some((s) => s.value === sentiment) ? (sentiment as Contact['sentiment']) : '',
    role: CONTACT_ROLES.some((r) => r.value === role) ? (role as Contact['role']) : '',
  };
}

/** In a fixed order, empty values left out, so equal filters make one URL. */
export function toContactsSearch(p: ContactsParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.q.trim()) out.set('q', p.q);
  if (p.customer) out.set('customer', p.customer);
  if (p.customer && p.account) out.set('account', p.account);
  if (p.sentiment) out.set('sentiment', p.sentiment);
  if (p.role) out.set('role', p.role);
  return out;
}

/** GET /contacts/ for these filters: `q` is the API's `search`. */
export function contactsApiPath(p: ContactsParams): string {
  const out = new URLSearchParams();
  if (p.q.trim()) out.set('search', p.q.trim());
  if (p.customer) out.set('customer', p.customer);
  if (p.customer && p.account) out.set('account', p.account);
  if (p.sentiment) out.set('sentiment', p.sentiment);
  if (p.role) out.set('role', p.role);
  const query = out.toString();
  return query ? `/contacts/?${query}` : '/contacts/';
}

/** One filter changed; a new organisation clears the account. */
export function withFilter<K extends keyof ContactsParams>(p: ContactsParams, key: K, value: ContactsParams[K]): ContactsParams {
  const next = { ...p, [key]: value };
  if (key === 'customer' && value !== p.customer) next.account = '';
  return next;
}

export function hasFilters(p: ContactsParams): boolean {
  return Boolean(p.q.trim() || p.customer || p.sentiment || p.role);
}

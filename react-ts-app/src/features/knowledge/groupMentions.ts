/**
 * Mentions that name a function or the whole team rather than a person. The
 * backend routes "@engineering" to whoever is responsible for the customer in
 * Engineering — or, when nobody is, to everyone in Engineering — so the
 * asker need not know who owns what.
 */
export type GroupMention = { token: string; label: string; hint: string };
export const GROUP_MENTIONS: GroupMention[] = [
  { token: 'engineering', label: 'Engineering', hint: 'whoever is responsible for this customer' },
  { token: 'sales', label: 'Sales', hint: 'whoever is responsible for this customer' },
  { token: 'analytics', label: 'Analytics', hint: 'whoever is responsible for this customer' },
  { token: 'cs', label: 'Customer Success', hint: 'the account owner' },
  { token: 'leadership', label: 'Leadership', hint: 'whoever is responsible for this customer' },
  { token: 'team', label: 'Whole team', hint: 'everyone responsible for this customer' },
];

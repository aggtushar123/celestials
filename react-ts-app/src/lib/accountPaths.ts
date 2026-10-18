/** Where an account's records live. Through the organisation a page came
 *  from, the nested route every existing caller uses; without one, the flat
 *  route the account page uses (backend #75: the same view classes keyed by
 *  the account alone, since a viewer may open an account and none of its
 *  organisations). No trailing slash: callers add `/contacts/` and so on. */
export function accountBase(accountId: number, customerId?: number | null): string {
  return customerId == null ? `/accounts/${accountId}` : `/customers/${customerId}/accounts/${accountId}`;
}

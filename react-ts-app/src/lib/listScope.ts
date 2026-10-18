/** Which organization or account a shared list slot holds, so a read for one
 *  never lands under another: `organization:<customer>`; an account read
 *  through its organisation, `account:<customer>:<account>`; an account read
 *  on its own page (no organisation), `account:<account>`. */
export function listScope(customerId: number | null | undefined, accountId?: number | null): string {
  if (accountId == null) return `organization:${customerId}`;
  return customerId == null ? `account:${accountId}` : `account:${customerId}:${accountId}`;
}

/** The scope of a Files / CallSense parent. */
export function parentScope(parent: { entityType: 'organization' | 'account'; customerId: number | null; accountId?: number }): string {
  return listScope(parent.customerId, parent.entityType === 'account' ? parent.accountId : null);
}

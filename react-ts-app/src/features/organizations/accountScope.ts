import type { Account } from '../customers/customersSlice';

// The account chips' rule on the organization page's lists (spec 2026-09-27
// §1): People, Deals & risks and Files read the organization's roll-up once
// and narrow it here by `account_id`, which is null on a record kept on the
// organization itself.

/** A record the chips can place. Optional in the types because other
 *  routes' fixtures predate the field; absent reads as null. */
export interface AccountTagged {
  account_id?: number | null;
}

/** Whether `record` is under the chip `selected`: '' is All, 'none' the
 *  organization itself, anything else an account id. */
export function inAccount(record: AccountTagged, selected: string): boolean {
  if (!selected) return true;
  const id = record.account_id ?? null;
  if (selected === 'none') return id === null;
  return id !== null && String(id) === selected;
}

/** The records under the chip; All hands back the same array. */
export function byAccount<T extends AccountTagged>(records: T[], selected: string): T[] {
  return selected ? records.filter((record) => inAccount(record, selected)) : records;
}

/** Counts in the story's `counts.by_account` shape: `all`, `none`, and
 *  every account of the organization (0 when it has nothing here). */
export function countByAccount(records: AccountTagged[], accountIds: number[]): Record<string, number> {
  const counts: Record<string, number> = { all: records.length, none: 0 };
  for (const id of accountIds) counts[String(id)] = 0;
  for (const record of records) {
    const key = record.account_id == null ? 'none' : String(record.account_id);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** The account the chip names, or undefined for All, Organization, or an id
 *  the organization does not have (a stale or hand-edited ?account=). New
 *  records go on it; without one they go on the organization. */
export function chosenAccount(accounts: Account[], selected: string): Account | undefined {
  return /^\d+$/.test(selected) ? accounts.find((account) => account.id === Number(selected)) : undefined;
}

/** A chip names an account the list of accounts does not hold (yet): while
 *  it loads, after it failed, or a stale id. Nothing is added then, rather
 *  than saved on the organization instead. */
export function awaitingAccount(accounts: Account[], selected: string): boolean {
  return /^\d+$/.test(selected) && !chosenAccount(accounts, selected);
}

/** What an empty list is empty for: null under All. */
export function scopeLabel(accounts: Account[], selected: string): string | null {
  if (!selected) return null;
  if (selected === 'none') return 'the organization itself';
  return chosenAccount(accounts, selected)?.name ?? 'this account';
}

/** The tag a list item shows: its account's name, or "Organization". The
 *  name comes from `accounts` when it has the record's account (current
 *  after a rename), else from the record. */
export function accountTag(record: { account_id?: number | null; account_name?: string | null }, accounts: Account[] = []): string {
  const account = record.account_id == null ? undefined : accounts.find((a) => a.id === record.account_id);
  return account?.name ?? record.account_name ?? 'Organization';
}

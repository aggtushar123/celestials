import { useId } from 'react';
import { Pencil } from 'lucide-react';
import type { Account } from '../../../features/customers/customersSlice';
import { QUIET } from '../portfolio/styles';
import { CountChip } from './CountChip';

/** The account chips (spec §1.4, and 2026-09-27 §1): All, each account and
 *  the organization itself (always, 0 where it has nothing, so the row is the
 *  same on every tab; owner 2026-09-28), numbered by the active tab's counts (the story's
 *  `counts.by_account` on Story; the lists' own on People, Deals & risks and
 *  Files). The chips stay name plus count; account figures live on the
 *  Details tab's Accounts section. With an account chosen the row ends with
 *  Edit <account>; adding one is on the name row. */
export function AccountChips({
  accounts,
  loading,
  error,
  counts: allCounts,
  selected,
  onSelect,
  onRetry,
  onEdit,
  applies = true,
}: {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  /** `counts.by_account` from the story (`all`, `none`, each account in
   *  scope by id); null until it lands. */
  counts: Record<string, number> | null;
  /** An account id, 'none', or '' for All. */
  selected: string;
  onSelect: (value: string) => void;
  onRetry: () => void;
  onEdit: (account: Account) => void;
  /** False on Details and Knowledge (owner, 2026-09-28): the row stays so
   *  nothing jumps, dimmed and without numbers, with a note tied to each
   *  chip. A press there still moves the remembered `?account=`. */
  applies?: boolean;
}) {
  const noteId = useId();
  const counts = applies ? allCounts : null;
  const total = counts ? (counts.all ?? 0) : null;
  const orgCount = counts?.none ?? 0;
  const current = accounts.find((account) => String(account.id) === selected) ?? null;
  // The accounts endpoint lists every account of the organization; the
  // story counts only those in this viewer's scope, so on Story an account
  // it leaves out is not this viewer's to filter by. The lists count every
  // account (0 where this viewer sees nothing), so there every chip shows.
  const shown = counts ? accounts.filter((account) => String(account.id) in counts) : accounts;

  const chip = (value: string, label: string, n: number | null) => {
    const pressed = selected === value;
    return (
      <CountChip
        key={value || 'all'}
        label={label}
        count={n}
        pressed={pressed}
        onClick={() => onSelect(pressed && value ? '' : value)}
        dimmed={!applies}
        describedBy={applies ? undefined : noteId}
      />
    );
  };
  const hasChips = !error && accounts.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* From sm the group lends its chips to the row (display: contents), so
          the chips and Edit wrap as one row; on phones the chips scroll
          sideways and Edit follows. */}
      <div role="group" aria-label="Filter by account" className="flex min-w-0 max-w-full gap-2 overflow-x-auto sm:contents">
        {loading && accounts.length === 0 ? (
          <span role="status" aria-label="Loading accounts" className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} aria-hidden="true" className="h-8 w-24 motion-safe:animate-pulse rounded-full bg-subtle" />
            ))}
          </span>
        ) : error ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-danger-ink">
            {error}
            <button type="button" onClick={onRetry} className={QUIET}>
              Try again
            </button>
          </span>
        ) : accounts.length ? (
          <>
            {chip('', 'All', total)}
            {shown.map((account) => chip(String(account.id), account.name, counts ? (counts[String(account.id)] ?? 0) : null))}
            {/* Always shown (0 where empty), so the row is the same on every tab. */}
            {chip('none', 'Organization', counts ? orgCount : null)}
          </>
        ) : null}
      </div>
      {!applies && hasChips ? (
        <span id={noteId} className="text-[13px] text-ink-muted">
          Details and Knowledge cover the whole organization
        </span>
      ) : null}
      {current ? (
        <button type="button" onClick={() => onEdit(current)} className={QUIET}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit {current.name}
        </button>
      ) : null}
    </div>
  );
}

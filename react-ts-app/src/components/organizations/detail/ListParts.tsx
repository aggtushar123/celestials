import { Fragment, useContext } from 'react';
import { accountTag } from '../../../features/organizations/accountScope';
import type { SummaryPart } from '../../../features/organizations/listSummaries';
import { BUTTON, Badge, EmptyState, NUM, SearchInput, TYPE } from '../../ui';
import { AccountNames, ShowAccountTags } from './accountNames';
import { LIST } from './listStyles';

/** A record on the organisation itself: no tag, since "Organization" would
 *  only restate the page's own record (spec §7). */
function onOrganization(record: { account_id?: number | null; account_name?: string | null }): boolean {
  return record.account_id == null && !record.account_name;
}

/** The account a record is on, as the Story tags it, named from the
 *  organization's accounts when a list tab provides them. None on an
 *  account's own page, and none for the organisation's own records. */
export function AccountTag({ record }: { record: { account_id?: number | null; account_name?: string | null } }) {
  const accounts = useContext(AccountNames);
  const shown = useContext(ShowAccountTags);
  if (!shown || onOrganization(record)) return null;
  return <Badge truncate>{accountTag(record, accounts)}</Badge>;
}

/** The same tag as plain text after its separator, closing a phone row's
 *  meta line (the badge would squeeze the name out); hidden from sm. */
export function AccountText({ record }: { record: { account_id?: number | null; account_name?: string | null } }) {
  const accounts = useContext(AccountNames);
  const shown = useContext(ShowAccountTags);
  if (!shown || onOrganization(record)) return null;
  return <span className="sm:hidden"> · {accountTag(record, accounts)}</span>;
}

/** Why the add or upload controls wait (see awaitingAccount). */
export function AddPaused({ id }: { id: string }) {
  return (
    <p id={id} className={TYPE.bodyMuted}>
      Waiting for the chosen account. Choose All to add on the organization.
    </p>
  );
}

/** The one line above a list that replaces the stat cards: figures in
 *  tabular numerals, parted by middle dots, wrapping between parts only.
 *  `as="span"` sets it as a card header's meta. */
export function SummaryLine({ parts, as: Tag = 'p' }: { parts: SummaryPart[]; as?: 'p' | 'span' }) {
  return (
    <Tag data-summary="" className={Tag === 'p' ? TYPE.bodyMuted : undefined}>
      {parts.map((part, i) => (
        <Fragment key={part.label}>
          {i > 0 ? ' · ' : null}
          <span className="whitespace-nowrap">
            <span className={`${NUM} text-ink`}>{part.value}</span> {part.label}
          </span>
        </Fragment>
      ))}
    </Tag>
  );
}

/** A list's loading state: rows shaped like its items, not a spinner. */
export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      <ul aria-hidden="true" className={LIST}>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex gap-3 px-3 py-2.5">
            <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-subtle" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="block h-3 w-48 animate-pulse rounded bg-subtle" />
              <span className="block h-2.5 w-full animate-pulse rounded bg-subtle" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An empty list: under an account chip it offers All; under All it says
 *  there is nothing yet and how things arrive. */
export function ScopedEmpty({
  what,
  scope,
  detail,
  onShowAll,
}: {
  /** Plural noun: "people", "files". */
  what: string;
  /** From scopeLabel: null under All. */
  scope: string | null;
  detail: string;
  onShowAll: () => void;
}) {
  if (scope) {
    return (
      <EmptyState
        title={`No ${what} on ${scope}`}
        detail="The other accounts show under All."
        action={
          <button type="button" onClick={onShowAll} className={BUTTON}>
            Show all accounts
          </button>
        }
      />
    );
  }
  return <EmptyState title={`No ${what} yet`} detail={detail} action={null} />;
}

export function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  return (
    <EmptyState
      title={`Nothing matches “${q.trim()}”`}
      detail="Try another word, or clear the search."
      action={
        <button type="button" onClick={onClear} aria-label={`Clear search for “${q.trim()}”`} className={BUTTON}>
          Clear search
        </button>
      }
    />
  );
}

/** A list's search: the shared field, a row's width on phones, capped from sm. */
export function ListSearch({
  label,
  value,
  onChange,
  isSm,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isSm: boolean;
}) {
  return (
    <div role="search" className={isSm ? 'min-w-0 max-w-xs flex-1' : 'w-full'}>
      <SearchInput label={label} placeholder={label} value={value} onChange={onChange} width="full" />
    </div>
  );
}

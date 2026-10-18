import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Contact } from '../../features/customers/customersSlice';
import { formatCompactMoney } from '../../features/customers/formatters';
import type { PortfolioGroup, PortfolioRowBase } from '../../features/organizations/portfolioTypes';
import { fetchMembers, setMemberState } from '../../features/segments/segmentApi';
import { KIND_NOUN } from '../../features/segments/segmentFields';
import {
  MEMBERS_PAGE_SIZE,
  memberGroupOptions,
  membersQuery,
  memberSortOptions,
  type SegmentPageParams,
} from '../../features/segments/segmentParams';
import type { MemberState, MemberStateValue, Segment, SegmentMembersPage } from '../../features/segments/segmentTypes';
import { memberCountText } from '../../features/segments/summaryFigures';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { ACCOUNT_KIND } from '../accounts/portfolio/accountKind';
import { ContactListItem } from '../contacts/ContactListItem';
import { AccountRow } from '../organizations/portfolio/AccountRow';
import { AccountSheet } from '../organizations/portfolio/AccountSheet';
import { GroupSortFields } from '../organizations/portfolio/filterParts';
import { ORGANIZATION_KIND } from '../organizations/portfolio/organizationKind';
import { PortfolioKindContext, usePortfolioKind } from '../organizations/portfolio/portfolioKind';
import { MoreButton, PagedSections, RowSkeleton } from '../organizations/portfolio/PortfolioSections';
import { rowAligns, rowColumns, rowLabels } from '../organizations/portfolio/rowColumns';
import { EmptyState as UiEmptyState, ErrorState, ListCard, ListHeaderRow, LoadingState, SearchInput, Toolbar } from '../ui';
import { usePagedBook } from '../organizations/portfolio/usePagedBook';
import { errorMessage, usePagedRead } from '../organizations/portfolio/usePagedRead';
import { SECTION_PAGE_SIZE } from '../organizations/portfolio/usePortfolio';
import { useSearchText } from '../organizations/portfolio/useSearchText';
import { KeptOut } from './KeptOut';
import { MemberMenu } from './MemberMenu';
import { tabPanelProps, type TabPanelIds } from './tabPanel';

type MenuFor = (id: number, name: string) => ReactNode;
const noop = () => {};

function emptyMembers(search: string): ReactNode {
  return search ? (
    <UiEmptyState title={`No members match "${search}"`} detail="Try another name." />
  ) : (
    <UiEmptyState title="No members yet" detail="Nobody matches the rules today. Edit the rules, or pin a record." />
  );
}

function MembersToolbar({
  segment,
  params,
  update,
  count,
  countRef,
}: {
  segment: Segment;
  params: SegmentPageParams;
  update: (patch: Partial<SegmentPageParams>) => void;
  count: ReactNode;
  /** Where Pin / Keep out sends focus once the chosen row unmounts. */
  countRef: RefObject<HTMLParagraphElement | null>;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const commit = useCallback((search: string) => update({ search }), [update]);
  const [text, setText] = useSearchText(params.search, commit);
  return (
    <Toolbar
      search={<SearchInput label="Search members by name" placeholder="Search members" value={text} onChange={setText} inputRef={searchRef} />}
      count={count}
      countRef={countRef}
      filters={
        segment.kind !== 'contact' ? (
          <GroupSortFields
            group={params.group || 'none'}
            sort={params.sort}
            groupOptions={memberGroupOptions(segment.kind)}
            sortOptions={memberSortOptions(segment.kind)}
            onGroup={(group) => update({ group: group === 'none' ? '' : group })}
            onSort={(sort) => update({ sort })}
          />
        ) : undefined
      }
    />
  );
}

/** Organisations and accounts: the kind's own rows, groups and opened-row
 *  panels (inline from sm, a sheet on phones), never selectable. */
function PortfolioMemberList({
  segment,
  params,
  version,
  menu,
  countRef,
  update,
}: {
  segment: Segment;
  params: SegmentPageParams;
  update: (patch: Partial<SegmentPageParams>) => void;
  version: number;
  menu: MenuFor;
  /** Where Pin / Keep out sends focus once the chosen row unmounts. */
  countRef: RefObject<HTMLParagraphElement | null>;
}) {
  const kind = usePortfolioKind();
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();
  const grouped = params.group !== '';
  const noun = KIND_NOUN[segment.kind];
  const read = useCallback((query: string) => fetchMembers<PortfolioRowBase>(segment.id, query), [segment.id]);
  const frameQuery = membersQuery(params, segment.kind, { limit: grouped ? '1' : String(MEMBERS_PAGE_SIZE) });
  const book = usePagedBook<PortfolioRowBase, SegmentMembersPage<PortfolioRowBase>>(read, noun, frameQuery, grouped, version, undefined, null, 0);
  const [openRow, setOpenRow] = useState<PortfolioRowBase | null>(null);
  const currency = book.data?.currency ?? orgCurrency;

  const renderRow = (row: PortfolioRowBase) => {
    const open = openRow?.id === row.id;
    return (
      <AccountRow
        key={row.id}
        row={row}
        currency={currency}
        pins={[]}
        isSm={isSm}
        selectable={false}
        selecting={false}
        selected={false}
        open={open}
        onToggleSelect={noop}
        onLongPress={noop}
        onToggleOpen={(r) => setOpenRow((current) => (current?.id === r.id ? null : r))}
        menu={menu(row.id, row.name)}
      >
        {open && isSm ? kind.renderDetails({ row, currency, id: `account-${row.id}-details` }) : null}
      </AccountRow>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <MembersToolbar
        segment={segment}
        params={params}
        update={update}
        countRef={countRef}
        count={
          book.data ? (
            <span data-part="member-count">{memberCountText(book.data.count, book.data.summary.members, params.search, segment.kind)}</span>
          ) : null
        }
      />
      <div className="@container flex flex-col gap-2">
        <PagedSections<PortfolioRowBase, SegmentMembersPage<PortfolioRowBase>, PortfolioGroup>
          book={book}
          read={read}
          noun={noun}
          grouped={grouped}
          listHeading="Members"
          sectionQuery={(groupKey) => membersQuery(params, segment.kind, { group_value: groupKey, limit: String(SECTION_PAGE_SIZE) })}
          version={version}
          groupMoney={(group) => formatCompactMoney(group.arr, currency)}
          renderRow={renderRow}
          onRowsLoaded={noop}
          empty={emptyMembers(params.search)}
          skeleton={(n) => <RowSkeleton count={n} />}
          framed
          listHeader={<ListHeaderRow columns={rowColumns(false)} labels={rowLabels(false)} align={rowAligns(false)} show="@min-[62rem]:grid @min-[62rem]:gap-x-2" />}
        />
        {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={() => setOpenRow(null)} /> : null}
      </div>
    </div>
  );
}

/** Contacts: the Contacts list's own rows, by name, with Show more. */
function ContactMemberList({
  segment,
  params,
  version,
  menu,
  countRef,
  update,
}: {
  segment: Segment;
  params: SegmentPageParams;
  update: (patch: Partial<SegmentPageParams>) => void;
  version: number;
  menu: MenuFor;
  /** Where Pin / Keep out sends focus once the chosen row unmounts. */
  countRef: RefObject<HTMLParagraphElement | null>;
}) {
  const read = useCallback((query: string) => fetchMembers<Contact>(segment.id, query), [segment.id]);
  const listRef = useRef<HTMLUListElement>(null);
  const page = usePagedRead<Contact, SegmentMembersPage<Contact>>(
    read,
    KIND_NOUN.contact,
    membersQuery(params, 'contact', { limit: String(MEMBERS_PAGE_SIZE) }),
    true,
    version,
  );
  return (
    <div className="flex flex-col gap-3">
      <MembersToolbar
        segment={segment}
        params={params}
        update={update}
        countRef={countRef}
        count={
          page.data ? <span data-part="member-count">{memberCountText(page.data.count, page.data.summary.members, params.search, 'contact')}</span> : null
        }
      />
      <ListCard
        label="Members"
        busy={page.loading}
        state={
          !page.data && page.error ? (
            <ErrorState message={page.error} onRetry={page.retry} />
          ) : !page.data ? (
            <LoadingState label="Loading members" count={6} />
          ) : page.data.count === 0 ? (
            emptyMembers(params.search)
          ) : undefined
        }
        listRef={listRef}
        footer={
          page.next ? (
            <MoreButton next={page.next} loading={page.loadingMore} error={page.moreError} label="Show more members" onClick={() => void page.loadMore()} list={listRef} />
          ) : undefined
        }
      >
        {page.rows.map((contact) => (
          <ContactListItem key={contact.id} contact={contact} to={`/contacts/${contact.id}`} selected={false} actions={menu(contact.id, contact.name)} />
        ))}
      </ListCard>
    </div>
  );
}

/** A segment's Members tab (spec §3): the kind's own list rows, search,
 *  sort and grouping; for the owner, Pin and Keep out in each row's menu and
 *  the Kept out list. The kind picks the rows here and only here (plan
 *  Decision 8). */
export function MembersTab({
  segment,
  params,
  update,
  version,
  onChanged,
  onNotice,
  panel,
}: {
  segment: Segment;
  params: SegmentPageParams;
  update: (patch: Partial<SegmentPageParams>) => void;
  version: number;
  onChanged: (state: MemberState) => void;
  onNotice: (message: string | null) => void;
  /** The page's Tabs ids: this is then that tab's panel (no second
   *  tabpanel around it). */
  panel?: TabPanelIds;
}) {
  const [busy, setBusy] = useState(false);
  // Keep out (from a row's menu) and Let back in (from Kept out) each
  // unmount the row or list item that held focus; without somewhere to send
  // it, focus falls to <body>. Keep out moves it to the members count status
  // line below, Let back in to the Kept out disclosure's own toggle. Pin and
  // Unpin never unmount their row, so they keep MoveToMenu's own focus
  // return to its trigger button (no focusAfter).
  const countRef = useRef<HTMLParagraphElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const stateOf = (id: number): MemberStateValue =>
    segment.pinned_ids.includes(id) ? 'pinned' : segment.excluded_ids.includes(id) ? 'excluded' : 'none';
  const choose = async (recordId: number, state: MemberStateValue, focusAfter?: RefObject<HTMLElement | null>) => {
    setBusy(true);
    onNotice(null);
    try {
      onChanged(await setMemberState(segment.id, recordId, state));
      focusAfter?.current?.focus();
    } catch (err) {
      onNotice(errorMessage(err, 'Could not change this member.'));
    } finally {
      setBusy(false);
    }
  };
  // Owner only (the backend refuses anyone else with a 403).
  const menu: MenuFor = (id, name) =>
    segment.is_owner ? (
      <MemberMenu name={name} state={stateOf(id)} disabled={busy} onChoose={(state) => void choose(id, state, state === 'excluded' ? countRef : undefined)} />
    ) : null;
  const portfolioKind = (segment.kind === 'customer' ? ORGANIZATION_KIND : ACCOUNT_KIND);

  return (
    <div role="tabpanel" {...tabPanelProps('Members', panel)} className="flex flex-col gap-3">
      {segment.kind === 'contact' ? (
        <ContactMemberList segment={segment} params={params} update={update} version={version} menu={menu} countRef={countRef} />
      ) : (
        <PortfolioKindContext.Provider value={portfolioKind}>
          <PortfolioMemberList segment={segment} params={params} update={update} version={version} menu={menu} countRef={countRef} />
        </PortfolioKindContext.Provider>
      )}
      {segment.is_owner && segment.excluded_ids.length > 0 ? (
        <KeptOut
          segment={segment}
          disabled={busy}
          toggleRef={toggleRef}
          // Letting back in the last kept-out record unmounts this
          // disclosure, toggle and all, so that one falls back to the
          // count line instead.
          onLetBackIn={(id) => void choose(id, 'none', segment.excluded_ids.length > 1 ? toggleRef : countRef)}
        />
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { fetchAccountsForCustomer, type Account } from '../../features/customers/customersSlice';
import { ACCOUNT_TABS, DETAIL_TABS, storyFilters } from '../../features/organizations/detailParams';
import { parseOrganizationId, type DetailNames } from '../../features/organizations/detailAskContext';
import { bulkUpdate } from '../../features/organizations/portfolioApi';
import { storyQuery } from '../../features/organizations/storyApi';
import { MapsTab } from '../../components/canvas/MapsTab';
import { ChurnOrganizationModal } from '../../components/organizations/ChurnOrganizationModal';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { OrganizationFormModal } from '../../components/organizations/OrganizationFormModal';
import { RecordPlans } from '../../components/plans/RecordPlans';
import { AccountChips } from '../../components/organizations/detail/AccountChips';
import { DealsTab } from '../../components/organizations/detail/DealsTab';
import { DetailColumn, DetailLoadFailed, DetailNotFound, DetailTabPanels, RefreshFailed } from '../../components/organizations/detail/DetailPage';
import { DetailsTab } from '../../components/organizations/detail/DetailsTab';
import { FilesCallsTab } from '../../components/organizations/detail/FilesCallsTab';
import { HeaderTiles } from '../../components/organizations/detail/HeaderTiles';
import { KnowledgeTab } from '../../components/organizations/detail/KnowledgeTab';
import { OrganizationHeader } from '../../components/organizations/detail/OrganizationHeader';
import { PeopleTab } from '../../components/organizations/detail/PeopleTab';
import { HeaderSkeleton, TabSkeleton } from '../../components/organizations/detail/Skeletons';
import { StoryTab } from '../../components/organizations/detail/StoryTab';
import { useDetailParams } from '../../components/organizations/detail/useDetailParams';
import { useOrganization } from '../../components/organizations/detail/useOrganization';
import { usePanelJump } from '../../components/organizations/detail/usePanelJump';
import { useStory } from '../../components/organizations/detail/useStory';
import { useChipCounts } from '../../components/organizations/detail/useChipCounts';
import { useDetailVersions, useVisitedTabs } from '../../components/organizations/detail/useDetailPage';
import { errorMessage } from '../../components/organizations/portfolio/usePortfolio';
import { AccountFormModal } from './AccountFormModal';
import { useReportDetailNames } from './ask/detailNames';
import { OrganizationsFrame } from './OrganizationsFrame';
import { PageHeader, Tabs } from '../../components/ui';

const NO_ACCOUNTS: Account[] = [];

/** Archive through the bulk endpoint, as the List does. ConfirmDialog shows a
 *  thrown string as the reason, so a refusal says why. */
async function archiveOrganization(id: number): Promise<void> {
  let failure: string | null = null;
  try {
    const result = await bulkUpdate({ ids: [id], action: 'archive', value: null });
    failure = result.failed[0]?.reason ?? null;
  } catch (err) {
    failure = errorMessage(err, 'Could not archive this organization.');
  }
  if (failure) throw failure;
}

/** The bar leads back to the list; the page names the record itself. */
const BACK = { to: '/organizations/list', label: 'Organizations' };

function NotFound() {
  return (
    <>
      <PageHeader back={BACK} title="Organization" />
      <DetailNotFound title="Organization not found" backTo="/organizations/list" backLabel="Back to organizations" />
    </>
  );
}

/** The page is keyed by the route's id, so moving to another organization
 *  starts from nothing: no story, chips, sheets or visited tabs of the last
 *  one show under the next one's header. */
export function Details() {
  const { id } = useParams<{ id: string }>();
  const orgId = parseOrganizationId(id);
  // Not a number: nothing to ask the server.
  if (orgId === null) return <NotFound />;
  return <OrganizationPage key={orgId} orgId={orgId} />;
}

/** /organizations/:id, the organization's story (spec 2026-09-26, delivery 1):
 *  the name row and tiles from the List's own row, the account chips, and six
 *  tabs whose choice, like the story's filters, lives in the URL. It lands in
 *  four requests; every other tab reads its data when first opened. Ask sits
 *  beside it (delivery 3): OrganizationsAskLayout draws the frame and the
 *  rail, and the page reports its names for the question's chip. */
function OrganizationPage({ orgId }: { orgId: number }) {
  const isSm = useMediaQuery(SM);
  const dispatch = useAppDispatch();
  const { params, update } = useDetailParams();
  const idBase = useId();

  const { version, storyVersion, callsVersion, reloadHeader, reloadStory, onAdded } = useDetailVersions();
  const org = useOrganization(orgId, version);

  // People, Deals and Knowledge read on mount, so each stays mounted once
  // opened (useVisitedTabs).
  const visited = useVisitedTabs(params.tab);
  const story = useStory(orgId, storyQuery(storyFilters(params)), storyVersion, visited.has('story'));

  const { accountsForCustomer, accountsLoading, accountsError, accountsCustomerId } = useAppSelector((state) => state.customers);
  // The accounts slot is global: until it holds this organization's list,
  // the page shows it loading rather than another organization's accounts.
  const accountsOurs = accountsCustomerId === orgId;
  const accounts = accountsOurs ? accountsForCustomer : NO_ACCOUNTS;
  const accountsBusy = accountsLoading || !accountsOurs;
  const accountsFailure = accountsOurs ? accountsError : null;
  const [accountsAttempt, setAccountsAttempt] = useState(0);
  useEffect(() => {
    dispatch(fetchAccountsForCustomer(orgId));
  }, [dispatch, orgId, accountsAttempt]);

  // The chips' numbers follow the tab (spec 2026-09-27 §1).
  const chipCounts = useChipCounts(params.tab, story.data?.counts.by_account ?? null, accounts, orgId);

  // The Ask chip's names: "Pizza Hut · EMEA" (spec §3).
  const orgName = org.row?.name ?? null;
  const names = useMemo<DetailNames | null>(
    () =>
      orgName !== null
        ? { organization: orgId, name: orgName, accounts: Object.fromEntries(accounts.map((account) => [account.id, account.name])) }
        : null,
    [orgId, orgName, accounts],
  );
  useReportDetailNames(names);
  const showAll = useCallback(() => update({ account: '' }), [update]);

  const [editing, setEditing] = useState(false);
  const [churning, setChurning] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // A tile jumps to its Details panel (usePanelJump).
  const openDetails = useCallback(() => update({ tab: 'details' }), [update]);
  const jumpTo = usePanelJump(params.tab === 'details', org.row !== null, openDetails);

  // Until the record lands (loading, or its read failed) the page has no
  // name of its own: the bar carries an sr-only h1 instead.
  const header = <PageHeader back={BACK} title={org.row ? undefined : 'Organization'} />;
  if (org.notFound) return <NotFound />;
  if (org.error && !org.row) {
    return (
      <>
        {header}
        <DetailLoadFailed message={org.error} onRetry={org.retry} />
      </>
    );
  }

  const row = org.row;
  const tab = params.tab;
  return (
    <OrganizationsFrame bleed>
      {header}
      <DetailColumn>
        {row ? (
          <section data-part="header" aria-label="Organization summary" className="flex flex-col gap-3">
            <OrganizationHeader
              row={row}
              canEdit={org.customer !== null}
              editError={org.customerError}
              onRetryEdit={org.retry}
              onEdit={() => setEditing(true)}
              onArchive={() => setArchiving(true)}
              onChurn={() => setChurning(true)}
              onAddAccount={() => setAddingAccount(true)}
            />
            <HeaderTiles row={row} customer={org.customer} customerError={org.customerError} onJump={jumpTo} />
          </section>
        ) : (
          <HeaderSkeleton label="Loading organization" />
        )}

        {row && org.error ? (
          // A reload (after an edit, archive or churn) failed: the last row stays.
          <RefreshFailed what="organization" error={org.error} onRetry={org.retry} />
        ) : null}

        {/* Plans (plans spec §2.5): the same on every tab (Decision 12). */}
        <RecordPlans record={{ kind: 'organization', id: orgId }} />

        {/* On every tab, so nothing jumps (owner, 2026-09-28); dimmed on
            Details and Knowledge, which cover the whole organization. */}
        <AccountChips
          accounts={accounts}
          loading={accountsBusy}
          error={accountsFailure}
          counts={chipCounts}
          selected={params.account}
          onSelect={(account) => update({ account })}
          onRetry={() => setAccountsAttempt((n) => n + 1)}
          onEdit={setEditingAccount}
          applies={ACCOUNT_TABS.has(tab)}
        />

        <div className="-mx-4 h-11 border-b border-line-subtle px-4 sm:mx-0 sm:px-0">
          <Tabs label="Organization sections" idBase={idBase} items={DETAIL_TABS} value={tab} onChange={(next) => update({ tab: next })} />
        </div>

        <DetailTabPanels idBase={idBase} tabs={DETAIL_TABS} active={tab} visited={visited}>
          {(key) =>
            key === 'story' ? (
              <StoryTab
                orgId={orgId}
                story={story}
                params={params}
                accounts={accounts}
                isSm={isSm}
                active={tab === 'story'}
                onUpdate={update}
                onAdded={onAdded}
                onOpenTab={(next) => update({ tab: next })}
                onJump={jumpTo}
              />
            ) : key === 'details' ? (
              row ? (
                <DetailsTab
                  row={row}
                  customerId={orgId}
                  isSm={isSm}
                  accounts={{
                    items: accounts,
                    loading: accountsBusy,
                    error: accountsFailure,
                    onRetry: () => setAccountsAttempt((n) => n + 1),
                    onAdd: () => setAddingAccount(true),
                    onEdit: setEditingAccount,
                  }}
                  customer={org.customer}
                  customerError={org.customerError}
                  onRetryCustomer={org.retry}
                  onEdit={org.customer ? () => setEditing(true) : undefined}
                />
              ) : (
                <TabSkeleton label="Loading details" />
              )
            ) : key === 'people' ? (
              <PeopleTab customerId={orgId} account={params.account} accounts={accounts} isSm={isSm} onShowAll={showAll} />
            ) : key === 'maps' ? (
              <MapsTab record={{ kind: 'organization', id: orgId, name: row?.name ?? null }} />
            ) : key === 'deals' ? (
              <DealsTab customerId={orgId} account={params.account} accounts={accounts} isSm={isSm} onShowAll={showAll} />
            ) : key === 'knowledge' ? (
              row ? <KnowledgeTab customerId={orgId} customerName={row.name} /> : <TabSkeleton label="Loading knowledge" />
            ) : (
              <FilesCallsTab
                customerId={orgId}
                account={params.account}
                accounts={accounts}
                isSm={isSm}
                active={tab === 'files'}
                callsVersion={callsVersion}
                // The call is in the calls list already; the story reads again.
                onCallLogged={reloadStory}
                onShowAll={showAll}
              />
            )
          }
        </DetailTabPanels>
      </DetailColumn>

      {editing && org.customer ? (
        <OrganizationFormModal
          customer={org.customer}
          onSaved={() => {
            // Needs attention (the renewal) comes with the story.
            reloadHeader();
            reloadStory();
          }}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {churning && row ? (
        <ChurnOrganizationModal
          customerIds={[row.id]}
          customerNames={[row.name]}
          onChurned={reloadHeader}
          onClose={() => setChurning(false)}
        />
      ) : null}
      {archiving && row ? (
        <ConfirmDialog
          title={`Archive ${row.name}?`}
          message="Hidden from the Organizations list and its summary, but not deleted. You can unarchive later."
          confirmLabel="Archive"
          danger
          onConfirm={async () => {
            await archiveOrganization(row.id);
            reloadHeader();
          }}
          onClose={() => setArchiving(false)}
        />
      ) : null}
      {addingAccount ? (
        <AccountFormModal
          customerId={orgId}
          onSaved={() => {
            setAccountsAttempt((n) => n + 1);
            // The chips list only the accounts the story counts, so the
            // story counts again to take the new one in.
            reloadStory();
          }}
          onClose={() => setAddingAccount(false)}
        />
      ) : null}
      {editingAccount ? (
        <AccountFormModal customerId={orgId} account={editingAccount} onClose={() => setEditingAccount(null)} />
      ) : null}
      {/* /organizations/:id/plans/new: the New plan modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}

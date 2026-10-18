import { useCallback, useId, useMemo, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { ACCOUNT_PAGE_TABS, parseAccountId } from '../../features/accounts/accountPageParams';
import { fetchContactsForAccount, updateAccount, type Account } from '../../features/customers/customersSlice';
import { storyFilters } from '../../features/organizations/detailParams';
import type { DetailScope } from '../../features/organizations/detailScope';
import { storyQuery } from '../../features/organizations/storyApi';
import type { AddKind } from '../../features/organizations/storyKinds';
import { AccountDetailsTab } from '../../components/accounts/detail/AccountDetailsTab';
import { AccountHeader } from '../../components/accounts/detail/AccountHeader';
import { AccountTiles } from '../../components/accounts/detail/AccountTiles';
import { useAccount } from '../../components/accounts/detail/useAccount';
import { useAccountPageParams } from '../../components/accounts/detail/useAccountPageParams';
import { MapsTab } from '../../components/canvas/MapsTab';
import { ContactFormModal } from '../../components/contacts/ContactFormModal';
import { AddFlow } from '../../components/organizations/detail/AddFlow';
import { RecordPlans } from '../../components/plans/RecordPlans';
import { DealsTab } from '../../components/organizations/detail/DealsTab';
import { DetailColumn, DetailLoadFailed, DetailNotFound, DetailTabPanels, RefreshFailed } from '../../components/organizations/detail/DetailPage';
import { FilesCallsTab } from '../../components/organizations/detail/FilesCallsTab';
import { PeopleTab } from '../../components/organizations/detail/PeopleTab';
import { HeaderSkeleton, TabSkeleton } from '../../components/organizations/detail/Skeletons';
import { StoryTab } from '../../components/organizations/detail/StoryTab';
import { ShowAccountTags } from '../../components/organizations/detail/accountNames';
import { useDetailVersions, useVisitedTabs } from '../../components/organizations/detail/useDetailPage';
import { usePanelJump } from '../../components/organizations/detail/usePanelJump';
import { useStory } from '../../components/organizations/detail/useStory';
import { CustomObjectsTab } from '../../components/shared/CustomObjectsTab';
import type { OwnerSummary } from '../../components/shared/OwnerTile';
import { AccountFormModal } from '../organizations/AccountFormModal';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { PageHeader, Tabs } from '../../components/ui';
import { useReportAccountName } from './ask/accountsNames';

/** One account has no account chips: the organization page's lists get none. */
const NO_ACCOUNTS: Account[] = [];
const noop = () => {};

/** The bar leads back to the list; the page names the record itself. */
const BACK = { to: '/accounts/list', label: 'Accounts' };

function NotFound() {
  return (
    <>
      <PageHeader back={BACK} title="Account" />
      <DetailNotFound title="Account not found" backTo="/accounts/list" backLabel="Back to accounts" />
    </>
  );
}

/** Keyed by the route's id, so moving to another account starts from
 *  nothing: no story, sheets or visited tabs of the last one show under the
 *  next one's name. */
export function AccountDetails() {
  const { id } = useParams<{ id: string }>();
  const accountId = parseAccountId(id);
  // Not a number: nothing to ask the server.
  if (accountId === null) return <NotFound />;
  return <AccountPage key={accountId} accountId={accountId} />;
}

/** /accounts/:id, the account's story (spec 2026-09-29 §2): the organization
 *  page's design scoped to one account, read by the URL id alone (no
 *  navigation state, no mock). The name row and tiles come from the Accounts
 *  list's own row; the record adds the owner, the account pulse and the
 *  edit form; seven tabs whose choice, like the story's filters, lives in
 *  the URL. Ask Revenact sits beside it (`AccountsAskLayout`), and each
 *  story item's "Ask about this" narrows one question to that item. */
function AccountPage({ accountId }: { accountId: number }) {
  const isSm = useMediaQuery(SM);
  const dispatch = useAppDispatch();
  const { params, update } = useAccountPageParams();
  const idBase = useId();
  const me = useAppSelector((state) => state.auth.user);
  const canAssign = useCapability('view_all_accounts');

  const { version, storyVersion, callsVersion, reloadHeader, reloadStory, onAdded } = useDetailVersions();
  const account = useAccount(accountId, version);
  const row = account.row;
  const record = account.account;
  const name = row?.name ?? '';
  const scope = useMemo<DetailScope>(() => ({ kind: 'account', id: accountId, name }), [accountId, name]);

  // Ask Revenact (spec §3): the chip names this account from its own row
  // until the server's label comes back; "This account" until it lands.
  useReportAccountName(accountId, name);

  // Each tab reads when first opened, then stays mounted (useVisitedTabs).
  const visited = useVisitedTabs(params.tab);
  const story = useStory(scope, storyQuery(storyFilters(params)), storyVersion, visited.has('story'));

  const openDetails = useCallback(() => update({ tab: 'details' }), [update]);
  const jumpTo = usePanelJump(params.tab === 'details', row !== null, openDetails);

  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [adding, setAdding] = useState<AddKind | null>(null);

  // The owner as the record names them (with their function); undefined
  // until it lands. Who may hand over: the old page's rule, which the
  // backend's may_change_owner enforces for real.
  const owner: OwnerSummary | null | undefined = record
    ? record.owner
      ? { id: record.owner.id, name: record.owner.name, function: record.owner.function ?? null }
      : null
    : undefined;
  const mayChangeOwner = record !== null && (canAssign || !record.owner || record.owner.id === me?.id);
  const saveOwner = useCallback(
    async (userId: number | null, note: string) => {
      const result = await dispatch(updateAccount({ id: accountId, owner_id: userId, handover_note: note }));
      if (!updateAccount.fulfilled.match(result)) return result.payload ?? 'Could not update the owner.';
      reloadHeader();
      return null;
    },
    [dispatch, accountId, reloadHeader],
  );

  // Until the record lands (loading, or its read failed) the page has no
  // name of its own: the bar carries an sr-only h1 instead.
  const header = <PageHeader back={BACK} title={row ? undefined : 'Account'} />;
  if (account.notFound) return <NotFound />;
  if (account.error && !row) {
    return (
      <>
        {header}
        <DetailLoadFailed message={account.error} onRetry={account.retry} />
      </>
    );
  }

  const tab = params.tab;
  return (
    <OrganizationsFrame bleed>
      {header}
      <ShowAccountTags.Provider value={false}>
        <DetailColumn>
          {row ? (
            <section data-part="header" aria-label="Account summary" className="flex flex-col gap-3">
              <AccountHeader
                row={row}
                canEdit={record !== null}
                editError={account.accountError}
                onRetryEdit={account.retry}
                onEdit={() => setEditing(true)}
                onAddContact={() => setAddingContact(true)}
                onLogCall={() => setAdding('call')}
                onNewTask={() => setAdding('task')}
              />
              <AccountTiles
                row={row}
                currency={account.currency}
                account={record}
                accountError={account.accountError}
                onJump={jumpTo}
              />
            </section>
          ) : (
            <HeaderSkeleton label="Loading account" />
          )}

          {row && account.error ? (
            // A reload (after an edit or a handover) failed: the last row stays.
            <RefreshFailed what="account" error={account.error} onRetry={account.retry} />
          ) : null}

          {/* Plans (plans spec §2.5): the same on every tab (Decision 12). */}
          <RecordPlans record={{ kind: 'account', id: accountId }} />

          <div className="-mx-4 h-11 border-b border-line-subtle px-4 sm:mx-0 sm:px-0">
            <Tabs label="Account sections" idBase={idBase} items={ACCOUNT_PAGE_TABS} value={tab} onChange={(next) => update({ tab: next })} />
          </div>

          <DetailTabPanels idBase={idBase} tabs={ACCOUNT_PAGE_TABS} active={tab} visited={visited}>
            {(key) =>
              key === 'story' ? (
                <StoryTab
                  scope={scope}
                  story={story}
                  params={params}
                  accounts={NO_ACCOUNTS}
                  isSm={isSm}
                  active={tab === 'story'}
                  onUpdate={update}
                  onAdded={onAdded}
                  onJump={jumpTo}
                />
              ) : key === 'details' ? (
                row ? (
                  <AccountDetailsTab
                    row={row}
                    currency={account.currency}
                    isSm={isSm}
                    owner={owner}
                    ownerError={owner === undefined ? account.accountError : null}
                    mayChangeOwner={mayChangeOwner}
                    onSaveOwner={saveOwner}
                    onRetryOwner={account.retry}
                    onEdit={record ? () => setEditing(true) : undefined}
                  />
                ) : (
                  <TabSkeleton label="Loading details" />
                )
              ) : key === 'people' ? (
                <PeopleTab scope={scope} account="" accounts={NO_ACCOUNTS} isSm={isSm} onShowAll={noop} />
              ) : key === 'maps' ? (
                <MapsTab record={{ kind: 'account', id: accountId, name: row?.name ?? null }} />
              ) : key === 'deals' ? (
                <DealsTab scope={scope} account="" accounts={NO_ACCOUNTS} isSm={isSm} onShowAll={noop} />
              ) : key === 'files' ? (
                <FilesCallsTab
                  scope={scope}
                  account=""
                  accounts={NO_ACCOUNTS}
                  isSm={isSm}
                  active={tab === 'files'}
                  callsVersion={callsVersion}
                  // The call is in the calls list already; the story reads again.
                  onCallLogged={reloadStory}
                  onShowAll={noop}
                />
              ) : (
                <CustomObjectsTab accountId={accountId} />
              )
            }
          </DetailTabPanels>
        </DetailColumn>
      </ShowAccountTags.Provider>

      {editing && record ? (
        <AccountFormModal
          account={record}
          onClose={() => {
            // The form reports an edit only through updateAccount's reducers:
            // read the row (name row, tiles, panels) and the story (Needs
            // attention's renewal) again.
            setEditing(false);
            reloadHeader();
            reloadStory();
          }}
        />
      ) : null}
      {addingContact ? (
        <ContactFormModal
          accountId={accountId}
          onClose={() => setAddingContact(false)}
          onSaved={() => void dispatch(fetchContactsForAccount({ accountId }))}
        />
      ) : null}
      {adding ? (
        <AddFlow
          what={adding}
          accountId={accountId}
          accountName={name || undefined}
          isSm={isSm}
          onClose={() => setAdding(null)}
          onAdded={() => {
            onAdded(adding);
            setAdding(null);
          }}
        />
      ) : null}
      {/* /accounts/:id/plans/new: the New plan modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}

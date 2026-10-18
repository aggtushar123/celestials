import { useRef, useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { EXPLAINER } from '../../features/campaigns/campaignOptions';
import { campaignsTab, showArchived, withArchived, withTab } from '../../features/campaigns/campaignParams';
import type { CampaignTab } from '../../features/campaigns/campaignTypes';
import { CAMPAIGN_GRID } from '../../components/campaigns/campaignGrid';
import { CampaignRowItem } from '../../components/campaigns/CampaignRowItem';
import { useCampaignList, type CampaignList } from '../../components/campaigns/useCampaignList';
import { MoreButton } from '../../components/organizations/portfolio/PortfolioSections';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { EmptyState, ErrorState, FilterChip, ListCard, ListHeaderRow, LoadingState, PageHeader, PRIMARY, SegmentedControl, Toolbar } from '../../components/ui';

const TABS: readonly { value: CampaignTab; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Shared with me' },
];

function NewCampaignLink() {
  return (
    <Link to="/campaigns/new" className={PRIMARY}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      New campaign
    </Link>
  );
}

function Rows({ tab, list }: { tab: CampaignTab; list: CampaignList }) {
  const listRef = useRef<HTMLUListElement>(null);
  const state =
    list.error && !list.rows ? (
      <ErrorState message={list.error} onRetry={list.retry} />
    ) : !list.rows ? (
      <LoadingState label="Loading campaigns" count={4} />
    ) : list.rows.length === 0 ? (
      tab === 'mine' ? (
        <EmptyState title="No campaigns yet" detail={EXPLAINER} />
      ) : (
        <EmptyState title="Nothing shared with you yet" detail="When a teammate shares a campaign with you, it shows here." />
      )
    ) : undefined;
  return (
    <div className="@container">
      <ListCard
        label="Campaigns"
        state={state}
        header={state ? undefined : <ListHeaderRow columns={CAMPAIGN_GRID.columns} labels={CAMPAIGN_GRID.labels} align={CAMPAIGN_GRID.aligns} show={CAMPAIGN_GRID.headerShow} />}
        listRef={listRef}
        footer={
          list.next ? <MoreButton next={list.next} loading={list.more.busy} error={list.more.error} label="Show more campaigns" onClick={list.showMore} list={listRef} /> : undefined
        }
      >
        {list.rows?.map((row) => <CampaignRowItem key={row.id} row={row} />)}
      </ListCard>
    </div>
  );
}

/** /campaigns (spec §2.1): Mine and Shared with me (`?tab=`), Show archived
 *  (`?archived=1`) and New campaign, under the framed bar titled
 *  "Campaigns". /campaigns/new opens its modal over this page. */
export function CampaignsHome() {
  const [search, setSearch] = useSearchParams();
  const tab = campaignsTab(search);
  const archived = showArchived(search);
  // Each time the modal route closes back to /campaigns, the list reads again.
  const modalOpen = useLocation().pathname.replace(/\/$/, '') !== '/campaigns';
  const [wasOpen, setWasOpen] = useState(modalOpen);
  const [reload, setReload] = useState(0);
  if (wasOpen !== modalOpen) {
    setWasOpen(modalOpen);
    if (!modalOpen) setReload((n) => n + 1);
  }
  const list = useCampaignList(tab, archived, reload);
  return (
    <OrganizationsFrame>
      <PageHeader title="Campaigns" />
      <div className="flex flex-col gap-4 pb-6">
        <Toolbar
          lead={<SegmentedControl label="Show" options={TABS} value={tab} onChange={(next) => setSearch(withTab(search, next), { replace: true })} />}
          filters={<FilterChip label="Show archived" pressed={archived} onToggle={() => setSearch(withArchived(search, !archived), { replace: true })} />}
          actions={{ primary: <NewCampaignLink /> }}
        />
        <Rows tab={tab} list={list} />
      </div>
      <Outlet />
    </OrganizationsFrame>
  );
}

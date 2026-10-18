import { useCallback, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { fetchCampaign } from '../../features/campaigns/campaignApi';
import { campaignPath } from '../../features/campaigns/campaignText';
import type { Campaign } from '../../features/campaigns/campaignTypes';
import { CampaignHeader } from '../../components/campaigns/CampaignHeader';
import { CampaignFailed, CampaignLoading, CampaignMissing } from '../../components/campaigns/CampaignStates';
import { LegacyRecipients } from '../../components/campaigns/LegacyRecipients';
import { SendsSection } from '../../components/campaigns/SendsSection';
import { useCampaign, type CampaignOutlet } from '../../components/campaigns/useCampaign';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { PageHeader } from '../../components/ui';

const BACK = { to: '/campaigns', label: 'Campaigns' } as const;

/** /campaigns/:id (spec §2.3). */
export function CampaignPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <PageHeader back={BACK} title="Campaign" />
        <CampaignMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedCampaign key={id} id={Number(id)} />;
}

function LoadedCampaign({ id }: { id: number }) {
  const [load, replace, retry] = useCampaign(id);
  if (load.status === 'ready') return <CampaignView campaign={load.campaign} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} title="Campaign" />
      {load.status === 'loading' ? <CampaignLoading /> : null}
      {load.status === 'missing' ? <CampaignMissing /> : null}
      {load.status === 'failed' ? <CampaignFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

function CampaignView({ campaign, onReplace }: { campaign: Campaign; onReplace: (campaign: Campaign) => void }) {
  const navigate = useNavigate();
  const [sendsVersion, setSendsVersion] = useState(0);
  /** Read the campaign again (a send finished: its status and last send moved). */
  const refresh = useCallback(() => {
    fetchCampaign(campaign.id).then(onReplace, () => undefined);
  }, [campaign.id, onReplace]);
  /** Decision 7: the new send opens on this page (closing the editor if it was open). */
  const onSent = useCallback(
    (sendId: number) => {
      setSendsVersion((n) => n + 1);
      refresh();
      navigate(campaignPath(campaign.id, sendId), { replace: true });
    },
    [campaign.id, navigate, refresh],
  );
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} />
      <div className="flex flex-col gap-4 pb-6">
        <CampaignHeader campaign={campaign} onReplace={onReplace} onSent={onSent} />
        <LegacyRecipients campaign={campaign} />
        <SendsSection campaign={campaign} version={sendsVersion} onFinished={refresh} />
      </div>
      {/* /campaigns/:id/edit: the editor over this page. */}
      <Outlet context={{ campaign, onReplace, onSent } satisfies CampaignOutlet} />
    </OrganizationsFrame>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchCampaign } from '../../features/campaigns/campaignApi';
import type { Campaign } from '../../features/campaigns/campaignTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type CampaignLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; campaign: Campaign };

/** What the page hands its `edit` child route. */
export interface CampaignOutlet {
  campaign: Campaign;
  onReplace: (campaign: Campaign) => void;
  /** A send went out: read the sends and the campaign again, and open it. */
  onSent: (sendId: number) => void;
}

/** One campaign, read for the reader: `missing` for a 404, the same for one
 *  that does not exist and one not shared with them (spec §1.7). */
export function useCampaign(id: number): [CampaignLoad, (campaign: Campaign) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: CampaignLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchCampaign(id).then(
      (campaign) => {
        if (alive) setAnswer({ key, load: { status: 'ready', campaign } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this campaign.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((campaign: Campaign) => setAnswer({ key, load: { status: 'ready', campaign } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}

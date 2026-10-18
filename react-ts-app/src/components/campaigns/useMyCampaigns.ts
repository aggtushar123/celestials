import { useEffect, useState } from 'react';
import { fetchAllMine } from '../../features/campaigns/campaignApi';
import type { CampaignRow } from '../../features/campaigns/campaignTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type MyCampaigns = { status: 'loading' } | { status: 'ready'; rows: CampaignRow[] } | { status: 'failed'; message: string };

/** Every campaign I own, archived left out (Contract note 17). */
export function useMyCampaigns(): [MyCampaigns, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: number; load: MyCampaigns } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchAllMine().then(
      (rows) => {
        if (alive) setAnswer({ key: attempt, load: { status: 'ready', rows } });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: attempt, load: { status: 'failed', message: errorMessage(err, 'Could not load your campaigns.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  return [answer?.key === attempt ? answer.load : { status: 'loading' }, () => setAttempt((n) => n + 1)];
}

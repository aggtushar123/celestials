import { useEffect, useState } from 'react';
import { fetchAudience } from '../../features/campaigns/campaignApi';
import { campaignErrors } from '../../features/campaigns/campaignErrors';
import type { Audience } from '../../features/campaigns/campaignTypes';

export type AudienceLoad = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: Audience } | { status: 'error'; message: string };
const FALLBACK = 'Could not count who it reaches.';

/** Whom a saved campaign reaches, read as its owner (Contract note 4):
 *  idle without a campaign, again whenever `version` moves (each save). */
export function useCampaignAudience(campaignId: number | null, version: number): AudienceLoad {
  const key = campaignId === null ? null : `${campaignId}#${version}`;
  const [answer, setAnswer] = useState<{ key: string; load: AudienceLoad } | null>(null);
  useEffect(() => {
    if (key === null || campaignId === null) return;
    let alive = true;
    fetchAudience(campaignId).then(
      (data) => {
        if (alive) setAnswer({ key, load: { status: 'ready', data } });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, load: { status: 'error', message: Object.values(campaignErrors(err, FALLBACK))[0] ?? FALLBACK } });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, campaignId]);
  if (key === null) return { status: 'idle' };
  return answer?.key === key ? answer.load : { status: 'loading' };
}

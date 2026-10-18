import { fetchCampaigns } from '../../features/campaigns/campaignApi';
import type { CampaignRow, CampaignTab } from '../../features/campaigns/campaignTypes';
import { usePagedList } from './usePagedList';

export interface CampaignList {
  rows: CampaignRow[] | null;
  next: string | null;
  error: string | null;
  more: { busy: boolean; error: string | null };
  retry: () => void;
  showMore: () => void;
}

const WORDS = { error: 'Could not load campaigns.', more: 'Could not load more campaigns.' };

/** The tab's first page, read again when the tab, Show archived or
 *  `reload` (the modal closed) changes; Show more appends the next. */
export function useCampaignList(tab: CampaignTab, archived: boolean, reload: number): CampaignList {
  const list = usePagedList(`${tab}|${archived}|${reload}`, (cursor) => fetchCampaigns(tab, archived, cursor), WORDS);
  return { rows: list.rows, next: list.next, error: list.error, more: list.more, retry: list.retry, showMore: list.showMore };
}

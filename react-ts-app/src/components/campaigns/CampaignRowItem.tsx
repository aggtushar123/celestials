import { STATUS_LABEL } from '../../features/campaigns/campaignOptions';
import { lastSendParts } from '../../features/campaigns/campaignText';
import type { CampaignRow } from '../../features/campaigns/campaignTypes';
import { Parts } from '../rules/Parts';
import { ListRow, TYPE } from '../ui';
import { CAMPAIGN_GRID } from './campaignGrid';
import { SegmentName, StatusPill } from './parts';

/** One campaign (spec §2.1; UI foundations spec §4.2): the name opens it;
 *  segment and owner are the meta line; the status and the last send sit
 *  in the campaigns grid's columns from a 44rem list (the last send in the
 *  meta line below it), so the last-send column never wanders. */
export function CampaignRowItem({ row }: { row: CampaignRow }) {
  return (
    <ListRow
      dataAttrs={{ 'data-campaign': row.id }}
      title={row.name}
      href={`/campaigns/${row.id}`}
      columns={CAMPAIGN_GRID.columns}
      gridAt={CAMPAIGN_GRID.gridAt}
      meta={
        <>
          <span data-part="status-narrow" className={CAMPAIGN_GRID.narrowOnly}>
            {STATUS_LABEL[row.status]} ·{' '}
          </span>
          <SegmentName segment={row.segment} /> · {row.is_owner ? 'You' : row.owner.name}
          <span className={CAMPAIGN_GRID.narrowOnly}>
            {' · '}
            <Parts parts={lastSendParts(row)} />
          </span>
        </>
      }
      cells={[
        <span key="status" className="block">
          <StatusPill status={row.status} />
        </span>,
        <p key="last-send" data-part="last-send" className={`truncate ${TYPE.bodyMuted}`}>
          <Parts parts={lastSendParts(row)} />
        </p>,
      ]}
    />
  );
}

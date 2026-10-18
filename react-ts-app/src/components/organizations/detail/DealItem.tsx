import { useOrgCurrency } from '../../../hooks';
import type { Opportunity, Risk } from '../../../features/customers/customersSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { localDay } from '../../../features/organizations/storyDays';
import { dealDateLine } from '../../../features/pipelines/pipelineKinds';
import { Badge, ListRow, NUM, TYPE } from '../../ui';
import { DEAL_COLUMNS } from './dealColumns';
import { AccountTag } from './ListParts';

/** One opportunity or risk (spec 2026-09-27 §3) as a list row: the title,
 *  one meta line of stage, priority in words, department and the date line
 *  (pipelines spec 2026-09-30 §1), MRR in its own column in compact money so
 *  figures line up, then the account tag and the Overdue badge, the only
 *  colour. The whole row opens the record's existing edit form. `today` is
 *  the viewer's (tests pin it). */
export function DealItem({ deal, onOpen, today = localDay(new Date()) }: { deal: Opportunity | Risk; onOpen: () => void; today?: string }) {
  const currency = useOrgCurrency();
  const date = dealDateLine(deal, today);
  return (
    <ListRow
      dataAttrs={{ 'data-deal': deal.id }}
      title={deal.title}
      onSelect={onOpen}
      columns={DEAL_COLUMNS}
      meta={[deal.stage_display, `${deal.priority_display} priority`, deal.department ? deal.department_display : 'Whole company', date.text].filter(Boolean).join(' · ')}
      cells={[
        <span key="mrr" className={`block ${TYPE.body} @min-[40rem]:text-right`}>
          <span className={NUM}>{formatCompactMoney(deal.mrr, currency)}</span> <span className="text-ink-muted">MRR</span>
        </span>,
      ]}
      trailing={
        <>
          <AccountTag record={deal} />
          {date.overdue ? <Badge tone="danger">Overdue</Badge> : null}
        </>
      }
    />
  );
}

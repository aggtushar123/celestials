import { useId, useState, type ReactNode } from 'react';
import type { Customer } from '../../../features/customers/customersSlice';
import { formatCompactMoney, formatDate } from '../../../features/customers/formatters';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import { HEALTH_LABEL } from '../../../features/organizations/portfolioLabels';
import type { PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { PulseDots, RenewalBar, TrendLine, renewalText } from '../portfolio/rowParts';
import { NO_VALUE, Tile, tileRow } from '../../ui';
import { HealthBreakdown } from './HealthBreakdown';

/** Every tile's one child row, one fixed height (the trend line's 20px), so
 *  the four tiles share one anatomy and one height (spec §4.3). */
const CHILD_ROW = 'flex h-5 items-center';

/** The four tiles on either detail page (organisation spec §1.3; account
 *  spec §2.3). Health opens what the page breaks it into below them; ARR,
 *  Renewal and Pulse jump to their Details panel. One tile row sized by its
 *  own column, not the window (`@container`): four across once the column
 *  is 50rem wide, two beside the open rail on a narrow window, a strip that
 *  snaps sideways on phones. */
export function DetailTiles({
  row,
  arr,
  arrNote,
  renewalPanel,
  breakdownWord,
  breakdown,
  onJump,
}: {
  row: PortfolioRowBase;
  /** ARR as the page prints it, "—" when there is none. */
  arr: string;
  /** The line under it: which figure, in which currency. */
  arrNote: string;
  /** Where Renewal jumps: the organization's contract timeline, or the account's Commercial panel. */
  renewalPanel: 'contract' | 'commercial';
  /** What Health opens, in words: "breakdown", "account pulse". */
  breakdownWord: string;
  /** What Health opens, given the id its button controls. */
  breakdown: (id: string) => ReactNode;
  onJump: (panel: PanelKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const breakdownId = useId();
  const pulse = row.pulse;
  const pulseWords = `AI ${pulse.ai ?? 'not set'}, CSM ${pulse.csm ?? 'not set'}${pulse.disagree ? ', pulses disagree' : ''}`;
  const band = HEALTH_LABEL[row.health.category];
  const overdue = row.renewal.days != null && row.renewal.days < 0;
  const renewalHint = renewalPanel === 'contract' ? 'Show the contract timeline' : 'Show the renewal timeline';

  return (
    <div className="@container flex flex-col gap-3">
      <div className={tileRow(4, 'container')}>
        <Tile
          label="Health"
          value={<span data-field="health">{row.health.score.toFixed(1)}</span>}
          meta={`${band} · ${open ? 'Hide' : 'Show'} ${breakdownWord}`}
          onOpen={() => setOpen((value) => !value)}
          expanded={open}
          controls={breakdownId}
          buttonLabel={`Health ${row.health.score.toFixed(1)}, ${band}. ${open ? 'Hide' : 'Show'} the ${breakdownWord}`}
        >
          <span className={CHILD_ROW}>
            <TrendLine trend={row.health.trend} category={row.health.category} />
          </span>
        </Tile>
        <Tile label="ARR" value={arr} meta={arrNote} onOpen={() => onJump('commercial')} buttonLabel={`ARR ${arr}. Show commercial details`}>
          <span aria-hidden="true" className={CHILD_ROW} />
        </Tile>
        <Tile
          label="Renewal"
          value={
            row.renewal.days == null ? NO_VALUE : <span className={overdue ? 'text-danger-ink' : undefined}>{renewalText(row.renewal.days)}</span>
          }
          meta={row.renewal.date ? formatDate(row.renewal.date) : 'No renewal date'}
          onOpen={() => onJump(renewalPanel)}
          buttonLabel={`Renewal ${renewalText(row.renewal.days)}. ${renewalHint}`}
        >
          <span className={CHILD_ROW}>
            <RenewalBar renewal={row.renewal} />
          </span>
        </Tile>
        <Tile
          label="Pulse"
          value={`AI ${pulse.ai ?? NO_VALUE} · CSM ${pulse.csm ?? NO_VALUE}`}
          meta={
            <>
              <span data-field="aiPulseScore">{pulse.ai_label || NO_VALUE}</span>
              {pulse.disagree ? ' · pulses disagree' : null}
            </>
          }
          onOpen={() => onJump('voice')}
          buttonLabel={`Pulse ${pulseWords}. Show the voice of the customer`}
        >
          <span className={CHILD_ROW}>
            <PulseDots history={pulse.history} field="pulse" />
          </span>
        </Tile>
      </div>
      {open ? breakdown(breakdownId) : null}
    </div>
  );
}

/** The organization page's tiles (spec §1.3): ARR billed at the account in
 *  the customer's own currency; Health opens the five-part rubric. */
export function HeaderTiles({
  row,
  customer,
  customerError,
  onJump,
}: {
  row: PortfolioRow;
  customer: Customer | null;
  customerError: string | null;
  onJump: (panel: PanelKey) => void;
}) {
  const commercial = row.details.commercial;
  const arr = commercial.arr_billed_at_account == null ? '—' : formatCompactMoney(commercial.arr_billed_at_account, commercial.currency);
  return (
    <DetailTiles
      row={row}
      arr={arr}
      arrNote={`Billed at account, in ${commercial.currency}`}
      renewalPanel="contract"
      breakdownWord="breakdown"
      breakdown={(id) => <HealthBreakdown id={id} customer={customer} error={customerError} />}
      onJump={onJump}
    />
  );
}

import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { ACCOUNT_FIELDS, ACCOUNT_PANELS, type AccountFieldId, type AccountPanelKey } from '../../../features/accounts/accountFields';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { npsBand, timelinePositions } from '../../organizations/portfolio/AccountDetails';
import type { DetailsProps } from '../../organizations/portfolio/portfolioKind';
import { BUTTON, FOCUS } from '../../organizations/portfolio/styles';
import { NUM, TYPE } from '../../ui';

type Row = AccountPortfolioRow;

function Panel({ panel, children }: { panel: AccountPanelKey; children: ReactNode }) {
  const title = ACCOUNT_PANELS.find((p) => p.key === panel)?.title ?? panel;
  // A headed section with no accessible name: four per opened row would
  // otherwise each be a region landmark.
  return (
    <section data-panel={panel} className="min-w-0">
      <h3 className={`mb-2 ${TYPE.label}`}>{title}</h3>
      {children}
    </section>
  );
}

function Pairs({
  row,
  currency,
  ids,
  mono = true,
  tone = {},
}: {
  row: Row;
  currency: CurrencyCode;
  ids: AccountFieldId[];
  mono?: boolean;
  tone?: Partial<Record<AccountFieldId, string>>;
}) {
  return (
    // The label column fits its longest label (up to 60%), and a long value
    // wraps in the rest: a label is never cut short by its value.
    <dl className="grid grid-cols-[fit-content(60%)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
      {ids.map((id) => (
        <Fragment key={id}>
          <dt className="break-words text-ink-muted">{ACCOUNT_FIELDS[id].label}</dt>
          <dd
            data-field={id}
            className={`text-right break-words ${mono ? NUM : ''} ${tone[id] ?? 'text-ink'}`}
          >
            {ACCOUNT_FIELDS[id].value(row, currency)}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** ARR, and the renewal date on a line with today marked (danger when overdue). */
function CommercialPanel({ row, currency, today }: { row: Row; currency: CurrencyCode; today: string }) {
  const renewal = row.details.commercial.renewal_date;
  const { marks, today: todayAt } = timelinePositions([renewal], today);
  const overdue = row.renewal.days != null && row.renewal.days < 0;
  return (
    <Panel panel="commercial">
      {renewal ? (
        <>
          <div className="relative h-6" aria-hidden="true">
            <span className="absolute left-0 right-0 top-1/2 h-px bg-line" />
            {marks[0] == null ? null : (
              <span
                data-mark="renewalDate"
                className={`absolute top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${overdue ? 'bg-danger' : 'bg-ink-muted'}`}
                style={{ left: `${marks[0]}%` }}
              />
            )}
            {todayAt == null ? null : (
              <span data-mark="today" className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-ink" style={{ left: `${todayAt}%` }} />
            )}
          </div>
          <p className="mb-2 text-[11px] text-ink-muted">The dot marks the renewal date. The line marks today.</p>
        </>
      ) : null}
      <Pairs row={row} currency={currency} ids={['arr', 'renewalDate']} tone={overdue ? { renewalDate: 'text-danger-ink font-semibold' } : {}} />
    </Panel>
  );
}

/** NPS on its −100…+100 bar with its band in words, CSAT, and the AI pulse reason as a quote. */
function VoicePanel({ row, currency }: { row: Row; currency: CurrencyCode }) {
  const nps = row.details.voice.nps_score;
  const at = nps == null ? null : (Math.max(-100, Math.min(100, nps)) + 100) / 2;
  return (
    <Panel panel="voice">
      <p className="mb-1 text-[11px] font-semibold text-ink">{npsBand(nps)}</p>
      <div className="relative h-1.5 rounded-full bg-line" aria-hidden="true">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-ink-muted" />
        {at == null ? null : (
          <span
            className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
            style={{ left: `${at}%` }}
          />
        )}
      </div>
      <p className="mt-1 mb-2 flex justify-between ${NUM} text-[11px] text-ink-muted" aria-hidden="true">
        <span>−100</span>
        <span>0</span>
        <span>+100</span>
      </p>
      <Pairs row={row} currency={currency} ids={['nps', 'csatScore']} />
      <p className="mt-3 text-[11px] text-ink-muted">{ACCOUNT_FIELDS.aiPulseReason.label}</p>
      <blockquote data-field="aiPulseReason" className="mt-1 border-l-2 border-line pl-3 text-[13px] text-ink">
        {ACCOUNT_FIELDS.aiPulseReason.value(row, currency)}
      </blockquote>
    </Panel>
  );
}

/** The Revenact ID, the organisations as links (each opens with this
 *  account's chip chosen), then contact details. */
function ProfilePanel({ row, currency }: { row: Row; currency: CurrencyCode }) {
  const organisations = row.details.profile.organisations;
  return (
    <Panel panel="profile">
      <Pairs row={row} currency={currency} ids={['revenactId']} />
      <p className="mt-2 text-[13px] text-ink-muted">{ACCOUNT_FIELDS.organizations.label}</p>
      <div data-field="organizations" className="mt-1 flex flex-wrap gap-x-3 text-[13px]">
        {organisations.length ? (
          organisations.map((organisation) => (
            <Link
              key={organisation.id}
              to={`/organizations/${organisation.id}?account=${row.id}`}
              className={`inline-flex min-h-11 items-center rounded-sm text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`}
            >
              {organisation.name}
            </Link>
          ))
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </div>
      <div className="mt-2">
        <Pairs row={row} currency={currency} ids={['domain', 'industry', 'email', 'phone', 'address']} mono={false} />
      </div>
    </Panel>
  );
}

/** Every account field the row header does not show, in four panels (spec
 *  2026-09-29 §1 "Opened row"). Part of its row: grouped by whitespace, never
 *  boxed, so there is no card in a card. */
export function AccountPanels({
  row,
  currency,
  id,
  today = new Date().toISOString().slice(0, 10),
  onEdit,
  stacked = false,
}: DetailsProps<AccountPortfolioRow>) {
  return (
    <div
      id={id}
      className={`grid gap-x-8 gap-y-5 border-t border-line-subtle px-4 py-4 ${stacked ? '' : 'md:grid-cols-2 xl:grid-cols-4'}`}
    >
      <CommercialPanel row={row} currency={currency} today={today} />
      <VoicePanel row={row} currency={currency} />
      <ProfilePanel row={row} currency={currency} />
      <Panel panel="history">
        <Pairs row={row} currency={currency} ids={['createdDate', 'modifiedDate', 'pulseRecordedOn', 'csmPulseModifiedAt']} mono={false} />
      </Panel>
      {onEdit ? (
        <div className={`flex justify-end ${stacked ? '' : 'md:col-span-2 xl:col-span-4'}`}>
          <button type="button" onClick={() => onEdit(row.id)} className={BUTTON}>
            <Pencil className="w-4 h-4" aria-hidden="true" />
            Edit details
          </button>
        </div>
      ) : null}
    </div>
  );
}

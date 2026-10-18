import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import type { SalesReport as Report, SalesReportDeal, SalesReportStage } from '../../features/agents/agentTypes';
import { formatDate } from '../../features/customers/formatters';
import {
  SALES,
  dealRecordPath,
  downloadSalesReport,
  moreText,
  movedInText,
  printSalesReport,
  reportMoney,
  salesReportTitle,
  winRateText,
} from '../../features/agents/salesReport';
import { BUTTON, Card, FOCUS, FORM_ALERT, INLINE_TARGET, MetaParts, NUM, PRIMARY, TYPE, Tile, tileRow } from '../ui';
import { AgentBubble } from './GuidedParts';
import { useEnter } from './useEnter';

/** A deal's record, in its meta line: a 44px hit area on phones. */
const RECORD_LINK = `inline-flex items-center font-semibold text-ink-muted hover:text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`;

/** Rows shown per list before "+N more". */
const LIST_CAP = 5;

/** The guided `report.sales` result (sales review report, 2026-10-18): the
 *  agent says it is ready, then the report under it: the period, four
 *  figures, the summary, won, lost and closing deals, the stages, and
 *  Download and Print / Save as PDF. `primary`: Download is the surface's
 *  one primary (nothing else is asked once the step ran). */
export function SalesReportResult({ report, downloadUrl, fresh, primary }: { report: Report; downloadUrl: string | null; fresh: boolean; primary: boolean }) {
  const titleId = useId();
  const enter = useEnter(fresh);
  const t = report.totals;
  const money = (amount: string) => reportMoney(amount, report.currency);
  return (
    <>
      <AgentBubble fresh={fresh} part="sales-report-ready">
        <p>{SALES.READY}</p>
      </AgentBubble>
      <li data-part="sales-report" className={`@container flex min-w-0 flex-col gap-3 ${enter}`.trim()}>
        <h3 id={titleId} className={`${TYPE.title} break-words`}>
          <span className={NUM}>{salesReportTitle(report.period.from, report.period.to)}</span>
        </h3>
        <div className={tileRow(4, 'container')}>
          <Tile label={SALES.WON} value={t.won_count} meta={<span className={NUM}>{money(t.won_amount)}</span>} />
          <Tile label={SALES.LOST} value={t.lost_count} meta={<span className={NUM}>{money(t.lost_amount)}</span>} />
          <Tile label={SALES.CLOSING} value={t.closing_count} meta={<span className={NUM}>{money(t.closing_amount)}</span>} />
          <Tile label={SALES.WIN_RATE} value={winRateText(t.win_rate)} meta={t.win_rate === null ? SALES.NO_CLOSED : SALES.OF_CLOSED} />
        </div>
        <Card as="article" pad="none" aria-labelledby={titleId}>
          <div className="divide-y divide-line-subtle">
            {report.summary ? <p className={`max-w-[68ch] break-words px-4 py-3 ${TYPE.body}`}>{report.summary}</p> : null}
            <DealList title={SALES.WON} deals={report.won} total={t.won_count} money={money} when={(d) => (d.closed_on ? formatDate(d.closed_on) : null)} />
            <DealList title={SALES.LOST} deals={report.lost} total={t.lost_count} money={money} when={(d) => (d.closed_on ? formatDate(d.closed_on) : null)} />
            <DealList
              title={SALES.CLOSING_LIST}
              deals={report.closing}
              total={t.closing_count}
              money={money}
              when={(d) => [d.stage_label, d.closes_on ? formatDate(d.closes_on) : null].filter(Boolean).join(' · ') || null}
            />
            <StageList stages={report.stages} money={money} history={report.stage_history} />
          </div>
        </Card>
        {downloadUrl ? <ReportActions downloadUrl={downloadUrl} to={report.period.to} primary={primary} /> : null}
      </li>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1 px-4 py-3">
      <h4 id={id} className={TYPE.label}>
        {title}
      </h4>
      {children}
    </section>
  );
}

function DealList({ title, deals, total, money, when }: { title: string; deals: SalesReportDeal[]; total: number; money: (amount: string) => string; when: (deal: SalesReportDeal) => string | null }) {
  const shown = deals.slice(0, LIST_CAP);
  const more = Math.max(0, Math.max(total, deals.length) - shown.length);
  return (
    <Section title={title}>
      {shown.length === 0 ? (
        <p className={TYPE.bodyMuted}>{SALES.NONE}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-subtle">
          {shown.map((deal) => (
            <li key={deal.id} className="flex min-w-0 items-start justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col">
                <p className={`${TYPE.body} break-words`}>{deal.name}</p>
                <p className={`${TYPE.meta} break-words`}>
                  <MetaParts
                    parts={[
                      <Link key="record" to={dealRecordPath(deal.record)} className={RECORD_LINK}>
                        {deal.record.name}
                      </Link>,
                      when(deal) ? <span className={NUM}>{when(deal)}</span> : null,
                    ]}
                  />
                </p>
              </div>
              <span className={`shrink-0 ${TYPE.body} ${NUM}`}>{money(deal.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? <p className={`${TYPE.meta} ${NUM}`}>{moreText(more)}</p> : null}
    </Section>
  );
}

function StageList({ stages, money, history }: { stages: SalesReportStage[]; money: (amount: string) => string; history: boolean }) {
  return (
    <Section title={SALES.STAGES}>
      {stages.length === 0 ? (
        <p className={TYPE.bodyMuted}>{SALES.NONE}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-subtle">
          {stages.map((stage) => (
            <li key={stage.stage} data-stage={stage.stage} className="flex min-w-0 items-start justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col">
                <p className={`${TYPE.body} break-words`}>{stage.label}</p>
                {stage.moved_in > 0 ? <p className={`${TYPE.meta} ${NUM}`}>{movedInText(stage.moved_in)}</p> : null}
              </div>
              <span className={`shrink-0 ${TYPE.body} ${NUM}`}>
                <MetaParts parts={[String(stage.count), money(stage.amount)]} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {history ? null : <p className={TYPE.meta}>{SALES.NO_HISTORY}</p>}
    </Section>
  );
}

/** Download and Print / Save as PDF, each fetched with the session. */
function ReportActions({ downloadUrl, to, primary }: { downloadUrl: string; to: string; primary: boolean }) {
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (what: 'download' | 'print') => {
    if (busy) return;
    setBusy(what);
    setError(null);
    try {
      if (what === 'download') await downloadSalesReport(downloadUrl, to);
      else await printSalesReport(downloadUrl);
    } catch {
      setError(SALES.DOWNLOAD_FAILED);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={SALES.ACTIONS} className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void act('download')} aria-disabled={busy !== null || undefined} className={`${primary ? PRIMARY : BUTTON} flex-1 justify-center sm:flex-none`}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {busy === 'download' ? SALES.DOWNLOADING : SALES.DOWNLOAD}
        </button>
        <button type="button" onClick={() => void act('print')} aria-disabled={busy !== null || undefined} className={`${BUTTON} flex-1 justify-center sm:flex-none`}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {busy === 'print' ? SALES.PREPARING : SALES.PRINT}
        </button>
      </div>
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

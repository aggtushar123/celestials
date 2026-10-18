// Sales review report (2026-10-18; backend docs/API_CONTRACTS.md
// "report.sales"): the words of the guided report, and its download. The
// report page is served with the session's bearer token, so no plain link
// can open it: it is fetched into a blob, then saved or printed. No em dash.
import { apiFetchBlob } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';
import { formatDate, formatMoney } from '../customers/formatters';
import { saveUrl } from '../mail/mailAttachments';
import type { SalesReportDeal, SalesReportPreview } from './agentTypes';

export const SALES = {
  READY: 'Here is the sales report.',
  WON: 'Won',
  LOST: 'Lost',
  CLOSING: 'Closing in 30 days',
  CLOSING_LIST: 'Closing next 30 days',
  WIN_RATE: 'Win rate',
  OF_CLOSED: 'Of closed deals',
  NO_CLOSED: 'No closed deals',
  STAGES: 'Stages',
  NONE: 'None in this period.',
  NO_HISTORY: "Stage moves count changes into a stage; moves out aren't tracked yet.",
  DOWNLOAD: 'Download',
  DOWNLOADING: 'Downloading…',
  PRINT: 'Print / Save as PDF',
  PREPARING: 'Preparing…',
  DOWNLOAD_FAILED: "Couldn't get the report. Try again.",
  ACTIONS: 'Report actions',
} as const;

export const salesReportTitle = (from: string, to: string): string => `Sales report · ${formatDate(from)}–${formatDate(to)}`;

/** "Reads 4 won, 2 lost, 4 closing and 6 open deals." */
export const salesReadsText = (c: SalesReportPreview['counts']): string => `Reads ${c.won} won, ${c.lost} lost, ${c.closing} closing and ${c.open} open deals.`;

export const moreText = (n: number): string => `+${n} more`;
export const movedInText = (n: number): string => `+${n} moved in`;
export const onlyRunnerText = (runner: string): string => `Only ${runner} can open the report.`;
export const winRateText = (rate: number | null): string => (rate === null ? '-' : `${rate}%`);

/** An MRR amount in the report's currency; a code Intl doesn't know reads as a plain number. */
export function reportMoney(amount: string, currency: string): string {
  try {
    return formatMoney(amount, currency as CurrencyCode);
  } catch {
    return `${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

/** Where a deal's record opens. */
export function dealRecordPath(record: SalesReportDeal['record']): string {
  return record.type === 'account' ? `/accounts/${record.id}` : `/organizations/${record.id}`;
}

/** The saved file's name: "sales-report-2026-10-18.html", by the period's end. */
export const reportFilename = (to: string): string => `sales-report-${to}.html`;

async function reportBlob(downloadUrl: string): Promise<Blob> {
  const blob = await apiFetchBlob(downloadUrl);
  return new Blob([blob], { type: 'text/html;charset=utf-8' });
}

/** Download: fetched with the session, saved under its file name. */
export async function downloadSalesReport(downloadUrl: string, to: string): Promise<void> {
  const url = URL.createObjectURL(await reportBlob(downloadUrl));
  try {
    saveUrl(url, reportFilename(to));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** How long a print frame stays, at most, when the browser never says the dialog closed. */
const PRINT_FRAME_MS = 60_000;

/** Print / Save as PDF: the page in a hidden, sandboxed frame (no scripts
 *  run in it), printed once it loads, removed after the print dialog. */
export async function printSalesReport(downloadUrl: string): Promise<void> {
  const url = URL.createObjectURL(await reportBlob(downloadUrl));
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.title = SALES.PRINT;
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';
  let timer = 0;
  const cleanup = () => {
    window.clearTimeout(timer);
    frame.remove();
    URL.revokeObjectURL(url);
  };
  frame.addEventListener(
    'load',
    () => {
      const win = frame.contentWindow;
      if (!win) return cleanup();
      win.addEventListener('afterprint', cleanup, { once: true });
      timer = window.setTimeout(cleanup, PRINT_FRAME_MS);
      win.focus();
      win.print();
    },
    { once: true },
  );
  frame.src = url;
  document.body.appendChild(frame);
}

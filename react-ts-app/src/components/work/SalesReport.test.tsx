import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KIND_LABEL, SHORT_KIND_LABEL, previewText } from '../../features/agents/agentsText';
import { bundleForText, meetingSlotText, sourceParts, stepAsAction } from '../../features/agents/bundleText';
import { SALES, reportFilename, reportMoney, salesReadsText } from '../../features/agents/salesReport';
import { GUIDED } from '../../features/agents/guidedText';
import { bundleItem } from '../../features/agents/testBundleFixtures';
import { B_SALES, B_SALES_DONE, B_SALES_OTHERS, MEETING, SALES_DOWNLOAD, SALES_REPORT, stepRuns, stubGuided } from '../../features/agents/testGuided';
import { bundleSourceText } from '../../features/work/feed';
import { renderWork } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';
import { BundleRow } from './BundleRow';
import { BundleSource } from './BundleSource';

const open = async (title = B_SALES.title, id = 900) => {
  renderWork(`/work?queue=mine&bundle=${id}`);
  return screen.findByRole('dialog', { name: title });
};
const thread = (panel: HTMLElement) => within(panel).getByRole('list', { name: GUIDED.THREAD });
const report = (panel: HTMLElement) => panel.querySelector<HTMLElement>('[data-part="sales-report"]') as HTMLElement;
const reportFetches = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.filter(([url]) => new URL(String(url)).pathname === SALES_DOWNLOAD);

describe('sales review report text (2026-10-18)', () => {
  it('names the kind and words its preview from the meeting', () => {
    expect(KIND_LABEL['report.sales']).toBe('Prepare the sales report');
    expect(SHORT_KIND_LABEL['report.sales']).toBe('Sales report');
    expect(previewText(stepAsAction(B_SALES, B_SALES.steps[0]))).toBe('Prepare the sales report for Sales review, last 30 days');
    expect(salesReadsText({ won: 4, lost: 2, closing: 4, open: 6 })).toBe('Reads 4 won, 2 lost, 4 closing and 6 open deals.');
  });

  it('words the meeting source, its slot in local time, and who it is for', () => {
    expect(sourceParts(MEETING)).toEqual(['Meeting', 'Sales review']);
    expect(meetingSlotText(MEETING.starts_at, MEETING.ends_at)).toBe('Tue 10:00–10:30');
    expect(bundleSourceText({ kind: 'meeting', label: 'Meeting' })).toBe('Meeting');
    expect(bundleForText(B_SALES)).toBe('For you');
  });

  it('formats money in the report currency, and names the file by the period end', () => {
    expect(reportMoney('9550.00', 'USD')).toBe('$9,550.00');
    expect(reportMoney('9550.00', 'EUR')).toBe('€9,550.00');
    expect(reportMoney('12.5', 'NOT_A_CODE')).toBe('12.50 NOT_A_CODE');
    expect(reportFilename('2026-10-18')).toBe('sales-report-2026-10-18.html');
  });
});

describe('meeting source (2026-10-18)', () => {
  it('draws Meeting, the title, the slot and Only you', () => {
    render(<BundleSource source={MEETING} />);
    const line = screen.getByTestId('bundle-source');
    expect(line).toHaveTextContent('Meeting · Sales review · Tue 10:00–10:30 · Only you');
  });

  it('labels a meeting bundle row Meeting, for you only', () => {
    render(
      <MemoryRouter>
        <ul>
          <BundleRow item={bundleItem(B_SALES)} group="decide" />
        </ul>
      </MemoryRouter>,
    );
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('Meeting');
    expect(row).toHaveTextContent('For you');
    expect(row).toHaveTextContent('Only you');
    expect(within(row).getByText('Priority')).toBeInTheDocument();
  });
});

describe('sales report in the guided conversation (2026-10-18)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('asks about the meeting with what it will read, then Yes shows the report with Download as the primary', async () => {
    const { spy } = stubGuided({ bundles: [B_SALES] });
    const panel = await open();
    expect(within(panel).getByTestId('bundle-source')).toHaveTextContent('Meeting · Sales review');
    const question = within(thread(panel)).getByText('You have Sales review tomorrow at 10:00. Should I prepare the sales report?');
    expect(question.closest('[data-bubble="agent"]')).toHaveTextContent('Reads 7 won, 0 lost, 1 closing and 6 open deals.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Yes' }));
    expect(await within(panel).findByText(SALES.READY)).toBeInTheDocument();
    expect(stepRuns(spy)).toEqual([{ step: 901, body: {} }]);
    const card = report(panel);
    expect(within(card).getByRole('heading', { name: 'Sales report · 18 Sep 2026–18 Oct 2026' })).toBeInTheDocument();
    // The answer bar is gone, so Download is the panel's one primary.
    expect(within(panel).queryByRole('button', { name: 'Yes' })).toBeNull();
    expect(within(card).getByRole('button', { name: SALES.DOWNLOAD })).toHaveClass('bg-accent');
    expect(within(card).getByRole('button', { name: SALES.PRINT })).not.toHaveClass('bg-accent');
    // The preview line is only for the question before it runs.
    expect(within(panel).queryByText('Reads 7 won, 0 lost, 1 closing and 6 open deals.')).toBeNull();
  });

  it('draws the four figures, the summary, the lists capped at five with +N more, and the stages', async () => {
    stubGuided({ bundles: [B_SALES_DONE] });
    const panel = await open();
    const card = report(panel);
    const tiles = within(card).getAllByRole('group').filter((g) => g.getAttribute('data-part') === 'tile');
    expect(tiles.map((t) => t.textContent)).toEqual(['Won7$9,550.00', 'Lost0$0.00', 'Closing in 30 days1$5,200.00', 'Win rate100%Of closed deals']);
    expect(within(card).getByText(SALES_REPORT.summary)).toBeInTheDocument();
    const won = within(card).getByRole('region', { name: 'Won' });
    expect(within(won).getAllByRole('listitem')).toHaveLength(5);
    expect(won).toHaveTextContent('+2 more');
    expect(within(won).getByText('$4,200.00')).toHaveClass('tabular-nums');
    expect(within(won).getAllByRole('link', { name: 'Twilio' })[0]).toHaveAttribute('href', '/organizations/4');
    expect(within(won).getByText('Training')).toBeInTheDocument();
    expect(within(won).queryByText('Sandbox')).toBeNull();
    const closing = within(card).getByRole('region', { name: 'Closing next 30 days' });
    expect(within(closing).getByRole('link', { name: 'Stripe EMEA' })).toHaveAttribute('href', '/accounts/2');
    expect(closing).toHaveTextContent('Negotiation · 23 Oct 2026');
    const stages = within(card).getByRole('region', { name: 'Stages' });
    expect(stages.querySelector('[data-stage="negotiation"]')).toHaveTextContent('Negotiation+1 moved in1 · $5,200.00');
    expect(stages.querySelector('[data-stage="qualification"]')).not.toHaveTextContent('moved in');
  });

  it('says "None in this period." for an empty list, and notes that moves out are not tracked', async () => {
    stubGuided({ bundles: [B_SALES_DONE] });
    const panel = await open();
    const card = report(panel);
    expect(within(within(card).getByRole('region', { name: 'Lost' })).getByText(SALES.NONE)).toBeInTheDocument();
    expect(within(card).getByText(SALES.NO_HISTORY)).toBeInTheDocument();
  });

  it('drops the note once stage history is recorded, and an empty summary', async () => {
    const step = B_SALES_DONE.steps[0];
    const preview = step.preview.sales_report!;
    const withHistory = { ...B_SALES_DONE, steps: [{ ...step, preview: { sales_report: { ...preview, report: { ...SALES_REPORT, stage_history: true, summary: '', stages: [] } } } }] };
    stubGuided({ bundles: [withHistory] });
    const panel = await open();
    const card = report(panel);
    expect(within(card).queryByText(SALES.NO_HISTORY)).toBeNull();
    expect(within(within(card).getByRole('region', { name: 'Stages' })).getByText(SALES.NONE)).toBeInTheDocument();
  });

  it('Download fetches the report with the session and saves it under its file name', async () => {
    const { spy } = stubGuided({ bundles: [B_SALES_DONE] });
    const create = vi.fn(() => 'blob:report');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const saved: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ href: this.href, download: this.download });
    });
    const panel = await open();
    await userEvent.click(within(report(panel)).getByRole('button', { name: SALES.DOWNLOAD }));
    await waitFor(() => expect(saved).toEqual([{ href: 'blob:report', download: 'sales-report-2026-10-18.html' }]));
    const calls = reportFetches(spy);
    expect(calls).toHaveLength(1);
    // Through the app's client (apiFetchBlob), never a plain link.
    expect(String(calls[0][0])).toMatch(/\/api\/v1\/agents\/bundles\/900\/steps\/901\/report\/$/);
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('text/html;charset=utf-8');
    expect(revoke).toHaveBeenCalledWith('blob:report');
  });

  it('Print / Save as PDF loads the report in a hidden sandboxed frame and prints it', async () => {
    const { spy } = stubGuided({ bundles: [B_SALES_DONE] });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:print'), revokeObjectURL: vi.fn() }));
    const panel = await open();
    await userEvent.click(within(report(panel)).getByRole('button', { name: SALES.PRINT }));
    const frame = await waitFor(() => {
      const found = document.querySelector<HTMLIFrameElement>('iframe[title="Print / Save as PDF"]');
      expect(found).not.toBeNull();
      return found as HTMLIFrameElement;
    });
    expect(reportFetches(spy)).toHaveLength(1);
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-modals');
    expect(frame.getAttribute('src')).toBe('blob:print');
    const win = frame.contentWindow as Window;
    vi.spyOn(win, 'focus').mockImplementation(() => {});
    const print = vi.spyOn(win, 'print').mockImplementation(() => {});
    fireEvent.load(frame);
    expect(print).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe[title="Print / Save as PDF"]')).toBeNull();
  });

  it('says so when the report cannot be fetched', async () => {
    const { spy } = stubGuided({ bundles: [B_SALES_DONE] });
    const original = spy.getMockImplementation();
    spy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input)).pathname === SALES_DOWNLOAD ? ({ ok: false, status: 404, json: async () => ({ code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' }) } as unknown as Response) : (original as (i: RequestInfo | URL, n?: RequestInit) => Promise<Response>)(input, init),
    );
    const panel = await open();
    await userEvent.click(within(report(panel)).getByRole('button', { name: SALES.DOWNLOAD }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(SALES.DOWNLOAD_FAILED);
  });

  it('shows anyone but its runner that the report is theirs, with no report and no download', async () => {
    stubGuided({ bundles: [B_SALES_OTHERS] });
    const panel = await open();
    expect(await within(panel).findByText('Only Alice can open the report.')).toBeInTheDocument();
    expect(report(panel)).toBeNull();
    expect(within(panel).queryByRole('button', { name: SALES.DOWNLOAD })).toBeNull();
  });
});

// Test-only: a guided bundle (guided agent, 2026-10-18; backend
// docs/API_CONTRACTS.md "Guided agent: diagnose, write, send") and the step
// run and stop routes in front of stubBundles. Fake people and records
// only; nothing is sent anywhere. No em dash.
import { vi } from 'vitest';
import { KIND_LABEL } from './agentsText';
import type { ComposePreview, DiagnosePreview, SalesReport, SalesReportDeal, SalesReportPreview, SendPreview } from './agentTypes';
import type { Bundle, BundleStep, MeetingSource, StepFields } from './bundleTypes';
import { SLACK_MESSAGE_SOURCE, bundle, step } from './testBundleFixtures';
import { stubBundles, type BundlesStub } from './testBundles';

export const NIMBUS = { type: 'customer' as const, id: 81, name: 'Nimbus' };

export const DIAGNOSE_BEFORE: DiagnosePreview = {
  record: 'Nimbus',
  reads: ['health', 'tickets', 'calls', 'emails', 'slack', 'contacts'],
  counts: { tickets: 3, calls: 1, emails: 4 },
  summary: null,
  summary_hidden: false,
  findings: [],
};

export const DIAGNOSE_AFTER: DiagnosePreview = {
  ...DIAGNOSE_BEFORE,
  counts: { tickets: 3, calls: 1, emails: 4, slack: 1 },
  summary: "Nimbus's EU latency has been open for nine days and their champion has gone quiet.",
  findings: [
    { text: 'Three latency tickets are open, the oldest 9 days.', source: { kind: 'ticket', label: 'NB-4088: API latency regression', url: 'https://nimbus-help.example.com/tickets/4088' } },
    { text: 'Health fell from 7.8 to 6.1 in two weeks.', source: { kind: 'health', label: 'Nimbus health', url: '/organizations/81' } },
    { text: 'The last call raised renewal concerns.', source: { kind: 'call', label: 'Call on 12 Oct', url: 'javascript:alert(1)' } },
    { text: 'Dana has not replied for 14 days.', source: { kind: 'contact', label: 'Dana Smith', url: null } },
  ],
};

export const COMPOSE_BEFORE: ComposePreview = { record: 'Nimbus', to: { name: 'Dana Smith', address: 'dana@nimbus.example' }, from: 'alice@acme.example', subject: null, body: null, draft_id: null, private: false, owner: null };
export const COMPOSE_AFTER: ComposePreview = {
  ...COMPOSE_BEFORE,
  subject: 'Our plan for your latency issues',
  body: 'Hi Dana,\n\nWe know the EU latency has hurt.\n\nAlice',
  draft_id: 41,
  owner: 'Alice',
};
export const COMPOSE_OTHERS: ComposePreview = { ...COMPOSE_AFTER, to: { name: 'Dana Smith', address: null }, from: null, subject: null, body: null, draft_id: null, private: true };

export const SEND_BEFORE: SendPreview = { to: null, from: null, subject: null, excerpt: null, draft_id: null, sent: false, shared: false, private: false };
export const SEND_READY: SendPreview = { to: { name: 'Dana Smith', address: 'dana@nimbus.example' }, from: 'alice@acme.example', subject: COMPOSE_AFTER.subject, excerpt: 'Hi Dana,', draft_id: 41, sent: false, shared: false, private: false };
export const SEND_AFTER: SendPreview = { ...SEND_READY, sent: true, shared: true };

const DIAGNOSE = step({ id: 801, position: 1, kind: 'record.diagnose', label: KIND_LABEL['record.diagnose'], title: 'Diagnose Nimbus', question: "Nimbus's health dropped from 7.8 to 6.1. Should I diagnose?", preview: { diagnose: DIAGNOSE_BEFORE } });
const COMPOSE = step({ id: 802, position: 2, kind: 'mail.compose', label: KIND_LABEL['mail.compose'], title: 'Write an email to Dana Smith', question: 'Should I write an email to save Nimbus?', preview: { compose: COMPOSE_BEFORE } });
const SEND = step({ id: 803, position: 3, kind: 'mail.send_draft', label: KIND_LABEL['mail.send_draft'], title: 'Send the email', question: 'Should I send it to Dana Smith?', irreversible: true, outside: true, preview: { send: SEND_BEFORE } });

/** Waiting on its first question. */
export const B_GUIDED: Bundle = bundle({
  id: 800,
  title: 'Nimbus is unhappy',
  record: NIMBUS,
  source: { ...SLACK_MESSAGE_SOURCE, excerpt: 'Can you look at Nimbus? They sound unhappy.' },
  routed_to: 'person',
  guided: true,
  priority: 'high',
  next_step: 801,
  can_stop: true,
  steps: [DIAGNOSE, COMPOSE, SEND],
});

const applied = (s: BundleStep, over: Partial<BundleStep>): BundleStep => ({ ...s, status: 'applied', ...over });

/** Diagnosed and written: asking whether to send. */
export const B_GUIDED_SEND: Bundle = {
  ...B_GUIDED,
  next_step: 803,
  run_by: { id: 1, name: 'Alice' },
  steps: [
    applied(DIAGNOSE, { preview: { diagnose: DIAGNOSE_AFTER } }),
    applied(COMPOSE, { preview: { compose: COMPOSE_AFTER }, outputs: { draft_id: 41 } }),
    { ...SEND, preview: { send: SEND_READY }, editable: ['to', 'subject', 'body'], fields: { to: 'dana@nimbus.example', subject: COMPOSE_AFTER.subject as string, body: COMPOSE_AFTER.body as string } },
  ],
};

/** The same bundle as someone other than the draft's owner reads it. */
export const B_GUIDED_OTHERS: Bundle = {
  ...B_GUIDED_SEND,
  can_stop: false,
  steps: [
    applied(DIAGNOSE, { preview: { diagnose: { ...DIAGNOSE_AFTER, summary: '', summary_hidden: true, findings: DIAGNOSE_AFTER.findings.slice(0, 1) } } }),
    applied(COMPOSE, { preview: { compose: COMPOSE_OTHERS } }),
    { ...SEND, can_run: false, disabled_reason: 'Only Alice can send this email: it is in their mailbox.', preview: { send: { ...SEND_READY, to: { name: 'Dana Smith', address: null }, from: null, subject: null, excerpt: null, draft_id: null, private: true } } },
  ],
};

// Sales review report (2026-10-18): a "Sales review" on Tue 20 Oct 2026,
// 10:00 to 10:30 in the reader's own time zone, for its organiser Alice.
export const MEETING: MeetingSource = {
  kind: 'meeting',
  label: 'Meeting',
  title: 'Sales review',
  starts_at: new Date(2026, 9, 20, 10, 0).toISOString(),
  ends_at: new Date(2026, 9, 20, 10, 30).toISOString(),
  meeting_id: 77,
  private: true,
};

const deal = (id: number, name: string, record: SalesReportDeal['record'], amount: string, over: Partial<SalesReportDeal> = {}): SalesReportDeal => ({ id, name, record, amount, ...over });
const TWILIO = { type: 'customer' as const, id: 4, name: 'Twilio' };
const STRIPE_EMEA = { type: 'account' as const, id: 2, name: 'Stripe EMEA' };

export const SALES_BEFORE: SalesReportPreview = {
  meeting: { title: 'Sales review', starts_at: MEETING.starts_at },
  period: { from: '2026-09-18', to: '2026-10-18' },
  counts: { won: 7, lost: 0, closing: 1, open: 6 },
  report: null,
  download_url: null,
};

export const SALES_REPORT: SalesReport = {
  period: { from: '2026-09-18', to: '2026-10-18' },
  currency: 'USD',
  generated_at: '2026-10-18T14:31:02+00:00',
  won: [
    deal(9, 'Platform renewal, two years', TWILIO, '4200.00', { closed_on: '2026-10-15' }),
    deal(10, 'Seat expansion', TWILIO, '1800.00', { closed_on: '2026-10-11' }),
    deal(11, 'Support add-on', STRIPE_EMEA, '1200.00', { closed_on: '2026-10-02' }),
    deal(12, 'Analytics pack', TWILIO, '900.00', { closed_on: '2026-09-30' }),
    deal(14, 'Training', STRIPE_EMEA, '600.00', { closed_on: '2026-09-25' }),
    deal(16, 'Sandbox', TWILIO, '450.00', { closed_on: '2026-09-21' }),
  ],
  lost: [],
  closing: [deal(15, 'Enterprise upgrade', STRIPE_EMEA, '5200.00', { stage: 'negotiation', stage_label: 'Negotiation', closes_on: '2026-10-23' })],
  stages: [
    { stage: 'qualification', label: 'Qualification', count: 2, amount: '3000.00', moved_in: 0, moved_out: null },
    { stage: 'negotiation', label: 'Negotiation', count: 1, amount: '5200.00', moved_in: 1, moved_out: null },
  ],
  totals: { won_count: 7, won_amount: '9550.00', lost_count: 0, lost_amount: '0.00', closing_count: 1, closing_amount: '5200.00', open_count: 6, open_amount: '20500.00', win_rate: 100 },
  stage_history: false,
  summary: 'Seven deals were won this month and none were lost.',
};

export const SALES_DOWNLOAD = '/api/v1/agents/bundles/900/steps/901/report/';
export const SALES_HTML = '<!doctype html><title>Sales report</title><p>Report</p>';

const REPORT = step({
  id: 901,
  position: 1,
  kind: 'report.sales',
  label: KIND_LABEL['report.sales'],
  title: 'Prepare the sales report',
  question: 'You have Sales review tomorrow at 10:00. Should I prepare the sales report?',
  preview: { sales_report: SALES_BEFORE },
});

/** The organiser's priority bundle, the day before the meeting. */
export const B_SALES: Bundle = bundle({
  id: 900,
  agent: 'sales',
  agent_label: 'Sales agent',
  title: 'Prepare the sales report for Sales review',
  record: null,
  source: MEETING,
  routed_to: 'person',
  guided: true,
  priority: 'high',
  next_step: 901,
  can_stop: true,
  steps: [REPORT],
});

/** Ran: the organiser's report, and its download. */
export const B_SALES_DONE: Bundle = {
  ...B_SALES,
  status: 'done',
  next_step: null,
  can_stop: false,
  run_by: { id: 1, name: 'Alice' },
  steps: [{ ...REPORT, status: 'applied', preview: { sales_report: { ...SALES_BEFORE, report: SALES_REPORT, download_url: SALES_DOWNLOAD } } }],
};

/** Ran, as anyone but its runner reads it: no report. */
export const B_SALES_OTHERS: Bundle = { ...B_SALES_DONE, steps: [{ ...B_SALES_DONE.steps[0], preview: { sales_report: SALES_BEFORE } }] };

const RESULTS: Partial<Record<BundleStep['kind'], (s: BundleStep, fields: StepFields) => Partial<BundleStep>>> = {
  'record.diagnose': () => ({ preview: { diagnose: DIAGNOSE_AFTER } }),
  'mail.compose': () => ({ preview: { compose: COMPOSE_AFTER }, outputs: { draft_id: 41 } }),
  'report.sales': () => ({ preview: { sales_report: { ...SALES_BEFORE, report: SALES_REPORT, download_url: SALES_DOWNLOAD } } }),
  'mail.send_draft': (_s, fields) => ({
    preview: { send: { ...SEND_AFTER, to: { name: 'Dana Smith', address: String(fields.to ?? SEND_AFTER.to?.address) }, subject: String(fields.subject ?? SEND_AFTER.subject) } },
    links: [{ label: 'Open the sent email', url: '/communications?source=mailbox:google&message=9', external: false }],
  }),
};

export interface GuidedStub extends BundlesStub {
  /** Step id: the error its first run gives (a retry succeeds). */
  failRun?: Record<number, string>;
  /** The next step run answers this instead, once. */
  refuseNextStep?: { status: number; body: unknown };
  /** Each step run waits for this before it answers. */
  gate?: Promise<void>;
}

const json = (status: number, body: unknown) => {
  const copy = JSON.parse(JSON.stringify(body)) as unknown;
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};

/** stubBundles, plus POST .../steps/<id>/run/, .../stop/ and a guided retry. */
export function stubGuided(stub: GuidedStub = {}) {
  const base = stubBundles({ bundles: [B_GUIDED], ...stub });
  const failing = { ...(stub.failRun ?? {}) };
  let refuse = stub.refuseNextStep ?? null;
  const settle = (b: Bundle) => {
    const waiting = [...b.steps].sort((x, y) => x.position - y.position).find((s) => s.status === 'proposed' || s.status === 'failed');
    b.next_step = waiting && waiting.status === 'proposed' ? waiting.id : null;
    if (!b.steps.some((s) => s.status === 'proposed' || s.status === 'failed')) {
      b.status = b.steps.some((s) => s.status === 'failed') ? 'partly_done' : 'done';
      b.can_stop = false;
    }
  };
  const apply = (b: Bundle, s: BundleStep, fields: StepFields) => {
    if (failing[s.id]) {
      Object.assign(s, { status: 'failed', error: failing[s.id] });
      delete failing[s.id];
    } else Object.assign(s, { status: 'applied', error: '' }, RESULTS[s.kind]?.(s, fields) ?? {});
    if (s.kind === 'mail.compose') {
      const send = b.steps.find((x) => x.kind === 'mail.send_draft');
      if (send) Object.assign(send, { preview: { send: SEND_READY }, editable: ['to', 'subject', 'body'], fields: { to: 'dana@nimbus.example', subject: COMPOSE_AFTER.subject, body: COMPOSE_AFTER.body } });
    }
    b.run_by = { id: 1, name: 'Alice' };
    settle(b);
  };
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as { fields?: StepFields }) : {};
    if (method === 'GET' && /^\/agents\/bundles\/\d+\/steps\/\d+\/report\/$/.test(path)) {
      return { ok: true, status: 200, json: async () => null, blob: async () => new Blob([SALES_HTML], { type: 'text/html; charset=utf-8' }) };
    }
    if (method === 'GET' && /^\/agents\/bundles\/\d+\/steps\/\d+\/report\/$/.test(path)) {
      return { ok: true, status: 200, json: async () => null, blob: async () => new Blob([SALES_HTML], { type: 'text/html; charset=utf-8' }) };
    }
    const run = /^\/agents\/bundles\/(\d+)\/steps\/(\d+)\/(run|retry)\/$/.exec(path);
    const stop = /^\/agents\/bundles\/(\d+)\/stop\/$/.exec(path);
    if (method === 'POST' && (run || stop)) {
      const b = base.bundles.get(Number((run ?? stop)?.[1]));
      if (!b) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
      if (refuse) {
        const answer = refuse;
        refuse = null;
        return json(answer.status, answer.body);
      }
      if (stop) {
        for (const s of b.steps) if (s.status === 'proposed') Object.assign(s, { status: 'skipped', note: 'Stopped by Alice.' });
        settle(b);
        b.next_step = null;
        return json(200, { bundle: b });
      }
      await stub.gate;
      const s = b.steps.find((x) => x.id === Number(run?.[2]));
      if (!s) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
      if (run?.[3] === 'retry') {
        if (s.status !== 'failed') return json(409, { code: 'NOT_FAILED', detail: 'Only a failed step can be retried.', bundle: b });
      } else if (b.next_step !== s.id) {
        return json(409, { code: 'NOT_NEXT', detail: 'Answer step 1 first.', step: b.next_step, bundle: b });
      }
      apply(b, s, body.fields ?? {});
      return json(200, { bundle: b });
    }
    return base.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { ...base, spy };
}

/** The bodies of the step runs sent, by step id. */
export const stepRuns = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls
    .filter(([url, init]) => /\/steps\/\d+\/run\/$/.test(new URL(String(url)).pathname) && (init as RequestInit | undefined)?.method === 'POST')
    .map(([url, init]) => ({ step: Number(/steps\/(\d+)\//.exec(String(url))?.[1]), body: JSON.parse(String((init as RequestInit).body)) as unknown }));

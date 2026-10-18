// The screen runs on the real `/customers/health/` endpoint now (see
// features/health/healthSlice.ts). This generator is kept as a test fixture
// and as the shape's own documentation; the type itself moved to
// features/health/types.ts, where the domain modules read it from.
export type { HealthDataRow, HealthStatus } from '../../../../features/health/types';
import type { HealthDataRow, HealthStatus } from '../../../../features/health/types';
import { trajectoryOf } from './triage';

export type Owner = 'Melak Anbessa' | 'Justin Middleton' | 'Joey Gilkey' | 'Gerry Hill';

export const MOCK_OWNERS: Owner[] = ['Melak Anbessa', 'Justin Middleton', 'Joey Gilkey', 'Gerry Hill'];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Label and stored value together, the way the API sends them — a fixture
 *  that carried only the label would let a filter keyed on the value look
 *  broken in tests and fine on screen. */
function lifecycleOf(roll: number) {
  if (roll > 0.8) return { lifecycleStage: 'Pilot', lifecycleKey: 'pilot' };
  if (roll > 0.72) return { lifecycleStage: 'Closed Lost', lifecycleKey: 'closed_lost' };
  return { lifecycleStage: 'Customer - Active', lifecycleKey: 'customer_active' };
}

/** Worst to best, so a step along it is one grade of health. */
const STATUS_LADDER: HealthStatus[] = ['Poor', 'Average', 'Good'];

/** How many months of health history each account carries. */
export const HISTORY_MONTHS = 12;

/**
 * Month-end labels for the last `HISTORY_MONTHS` complete months, oldest first.
 *
 * Derived from today rather than hardcoded, so the history stays adjacent to
 * the renewal dates instead of drifting into the past as the year turns.
 */
const historyMonthLabels = (): string[] =>
  Array.from({ length: HISTORY_MONTHS }, (_, i) => {
    const monthsBack = HISTORY_MONTHS - i;
    const now = new Date();
    // Day 0 of month m is the last day of month m-1.
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0);
    return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  });

const HISTORY_LABELS = historyMonthLabels();

/**
 * A year of month-end health readings, ending at `end`.
 *
 * Walks backwards from the current state one grade at a time. It used to carry
 * three months with the middle one hardcoded to 'Average' on every account,
 * which made month-on-month movement impossible to read and left the flow and
 * change-over-time charts nothing real to draw. Accounts mostly hold their
 * grade month to month, so the walk stays put more often than it steps.
 */
const historyEndingAt = (end: HealthStatus): { month: string; status: HealthStatus }[] => {
  const step = () => (Math.random() < 0.72 ? 0 : Math.random() < 0.5 ? -1 : 1);
  const clamp = (i: number) => Math.min(STATUS_LADDER.length - 1, Math.max(0, i));

  const statuses: HealthStatus[] = [end];
  let idx = STATUS_LADDER.indexOf(end);
  for (let i = 1; i < HISTORY_LABELS.length; i++) {
    idx = clamp(idx + step());
    statuses.unshift(STATUS_LADDER[idx]);
  }

  return HISTORY_LABELS.map((month, i) => ({ month, status: statuses[i] }));
};

/** What the AI Pulse claims to have spotted, by how the account is doing.
 *  One shared string across all 60 rows made the reason column unreadable. */
const AI_PULSE_REASONS: Record<HealthStatus, string[]> = {
  Poor: [
    'Support ticket volume up 3.1x over 60 days',
    'Exec sponsor left; no replacement mapped',
    'Career-site traffic down 42% QoQ',
    'Two consecutive missed QBRs',
    'Recruiter seats idle 21+ days',
  ],
  Average: [
    'Usage flat while headcount grew 18%',
    'Adoption concentrated in a single team',
    'Renewal owner has not engaged since January',
    'Sentiment dipped across the last four tickets',
  ],
  Good: [
    'Career-site traffic surging; expansion likely',
    'Seat utilisation at 94% of contract',
    'Champion referred two new business units',
    'Ticket sentiment positive nine weeks running',
  ],
};

const reasonFor = (status: HealthStatus, aiPulse: number, csmPulse: number): string => {
  // When the model reads colder than the CSM, the reason has to explain the
  // risk it spotted — not congratulate an account it is quietly flagging.
  const pool = csmPulse - aiPulse >= 2 ? AI_PULSE_REASONS.Poor : AI_PULSE_REASONS[status];
  return pool[Math.floor(Math.random() * pool.length)];
};

/**
 * A renewal date `days` out from today, in the "MMM d, yyyy" shape the rest of
 * the app renders and `triage.ts` parses.
 *
 * Every generated row used to carry the same literal "Dec 31, 2026", which made
 * renewal proximity a constant — the Triage view ranks on how close a renewal
 * is, so it needs these to actually spread.
 */
const renewalDateIn = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

/**
 * A stand-in for the backend's `triage_score` / `triage_factors`, keyed on
 * health status alone — same simplification as `riskOfLoss` above: this
 * generator is a test fixture, not a second copy of the server's scoring.
 */
const triageStandInFor = (status: HealthStatus): { score: number; factors: { label: string; points: number }[] } => {
  const score = status === 'Poor' ? 90 : status === 'Average' ? 40 : 5;
  return { score, factors: [{ label: `${status} health`, points: score }] };
};

// Generate ~50 diverse mock rows with varied health distributions
const generateMockData = (): HealthDataRow[] => {
  const data: HealthDataRow[] = [];
  const accounts = [
    'Nova Enterprises', 'Stream Technologies', 'Prime Enterprises', 'Quantum Logistics', 
    'Horizon Labs', 'Global Partners', 'Bloomreach', 'Summit Consulting', 'Evo Labs', 
    'Horizon Industries', 'Global Group', 'Evo Group', 'Stream Consulting', 'Core Systems', 
    'Apex Dynamics', 'Velocity Logistics', 'Stark Industries', 'Wayne Enterprises'
  ];

  for (let i = 1; i <= 60; i++) {
    // Artificial distribution skewing towards 'Good' to match screenshot 398 vs 182 vs 38
    const rand = Math.random();
    let status: HealthStatus = 'Good';
    let csmPulse = 3;
    let aiPulse = 3;

    if (rand < 0.15) {
      status = 'Poor';
      csmPulse = Math.floor(Math.random() * 2) + 1; // 1-2
      aiPulse = Math.floor(Math.random() * 2) + 1;
    } else if (rand < 0.45) {
      status = 'Average';
      csmPulse = 3;
      aiPulse = Math.floor(Math.random() * 2) + 2; // 2-3
    } else {
      status = 'Good';
      csmPulse = Math.floor(Math.random() * 2) + 4; // 4-5
      aiPulse = Math.floor(Math.random() * 2) + 4;
    }

    // The two pulses were drawn in lockstep above — in every branch they land
    // within one point of each other, so a real disagreement between the owner
    // and the model was arithmetically impossible and the AI Pulse was only ever
    // a ±1 echo of the CSM's. Two independent reads are the point of having
    // both, so a share of the book genuinely diverges.
    const divergence = Math.random();
    if (divergence < 0.11) {
      // The model reads the account colder than its owner does.
      aiPulse = Math.max(1, csmPulse - (2 + Math.floor(Math.random() * 2)));
    } else if (divergence < 0.17) {
      // The owner has caught something the model hasn't.
      csmPulse = Math.max(1, aiPulse - (2 + Math.floor(Math.random() * 2)));
    }

    const owner = MOCK_OWNERS[Math.floor(Math.random() * MOCK_OWNERS.length)];
    const account = accounts[Math.floor(Math.random() * accounts.length)];
    const history = historyEndingAt(status);
    const triage = triageStandInFor(status);

    data.push({
      id: `${i}`,
      account: `${account} ${i}`,
      owner,
      // The generator has names, not ids; the index into MOCK_OWNERS stands in
      // for one, which is enough for a fixture and keeps the key stable per
      // owner the way a real id is.
      ownerKey: String(MOCK_OWNERS.indexOf(owner)),
      ...lifecycleOf(Math.random()),
      renewalDate: renewalDateIn(12 + Math.floor(Math.random() * 350)),
      healthStatus: status,
      healthScore: status === 'Good' ? 8 : (status === 'Average' ? 5 : 2),
      csmPulseScore: csmPulse,
      aiPulseScore: aiPulse,
      lastPulseModified: 'Feb 4, 2026',
      aiPulseReason: reasonFor(status, aiPulse, csmPulse),
      // Log-ish spread rather than uniform: a real book has a few large
      // contracts carrying most of the revenue, which is the shape the Renewal
      // tab's money charts are read against.
      arr: Math.round((5_000 + Math.random() ** 3 * 400_000) / 1000) * 1000,
      daysSinceTouch: Math.floor(Math.random() * 120),
      // The fixture stands in for the backend's rule rather than reimplementing
      // it — this generator is a test fixture, not a second churn model.
      riskOfLoss: status === 'Poor' ? 0.5 : status === 'Average' ? 0.25 : 0.05,
      riskFactors: [{ label: `${status} health`, points: status === 'Poor' ? 0.5 : status === 'Average' ? 0.25 : 0.05 }],
      activeSeats: Math.floor(Math.random() * 50) + 10,
      history,
      triageScore: triage.score,
      triageFactors: triage.factors,
      triageDirection: trajectoryOf({ history } as HealthDataRow).direction,
    });
  }

  // Inject a few hardcoded 'Poor' ones from the screenshot to ensure exact matches.
  // The id continues past the generated loop: this row used to reuse '2', which
  // collided with the generated row 2 and gave React two children with the same
  // key in every list that renders this data (the detail table, and now the
  // triage queue and divergence lists).
  data.push({
    id: String(data.length + 1),
    account: 'Nova Enterprises',
    owner: 'Gerry Hill',
    ownerKey: String(MOCK_OWNERS.indexOf('Gerry Hill')),
    lifecycleKey: 'customer_active',
    lifecycleStage: 'Customer - Active',
    renewalDate: renewalDateIn(23),
    healthStatus: 'Poor',
    healthScore: 2,
    csmPulseScore: 1,
    aiPulseScore: 2,
    lastPulseModified: 'Feb 4, 2026',
    aiPulseReason: 'Exec sponsor left; no replacement mapped',
    arr: 180_000,
    daysSinceTouch: 96,
    riskOfLoss: 0.6,
    riskFactors: [
      { label: 'Poor health', points: 0.5 },
      { label: 'No contact in 96 days', points: 0.1 },
    ],
    activeSeats: 38,
    // Deliberately empty: this hand-written row is the one account with no
    // pulse history, which keeps the "no trajectory" path exercised on screen.
    history: [],
    triageScore: 90,
    triageFactors: [{ label: 'Poor health', points: 90 }],
    triageDirection: 'unknown',
  });

  return data;
};

export const MOCK_HEALTH_DATA = generateMockData();

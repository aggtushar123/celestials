import { describe, it, expect } from 'vitest';
import { toHealthDataRow, toHealthDataRows } from './toHealthDataRow';
import type { CustomerHealthApiRow } from './toHealthDataRow';

// The adapter is the seam between the API and the four tabs. Its whole job is
// to translate without inventing: every absence on the backend has to stay an
// absence here, because a substituted number reads as a measurement downstream.

function apiRow(overrides: Partial<CustomerHealthApiRow> = {}): CustomerHealthApiRow {
  return {
    id: 10,
    name: 'Hyatt Hotels Corporation',
    owner_id: 5,
  owner_name: 'Carl CSM',
    lifecycle_stage: 'live',
    lifecycle_stage_display: 'Live',
    renewal_date: '2026-02-02',
    health_score: '5.4',
    health_category: 'average',
    csm_pulse_score: 4,
    csm_pulse_modified_at: '2026-08-19T09:30:00Z',
    ai_pulse_value: 2,
    ai_pulse_reason: 'Career-site traffic down 42% QoQ',
    arr: 120000,
  days_since_touch: 14,
  risk_of_loss: 0.35,
  risk_factors: [
    { label: 'Average health', points: 0.25 },
    { label: 'CSM and AI pulse disagree', points: 0.1 },
  ],
  total_active_seats: 822,
    history: [
      {
        captured_on: '2025-09-30',
        health_score: '10.0',
        health_category: 'good',
        csm_pulse_score: 5,
        ai_pulse_value: 5,
      },
      {
        captured_on: '2025-10-31',
        health_score: '4.0',
        health_category: 'average',
        csm_pulse_score: 3,
        ai_pulse_value: 3,
      },
    ],
    ...overrides,
  };
}

describe('toHealthDataRow', () => {
  it('maps the fields the tabs read', () => {
    const row = toHealthDataRow(apiRow());

    expect(row.id).toBe('10');
    expect(row.account).toBe('Hyatt Hotels Corporation');
    expect(row.owner).toBe('Carl CSM');
    expect(row.lifecycleStage).toBe('Live');
    expect(row.healthStatus).toBe('Average');
    expect(row.healthScore).toBe(5.4);
    expect(row.csmPulseScore).toBe(4);
    expect(row.aiPulseScore).toBe(2);
    expect(row.activeSeats).toBe(822);
  });

  it('reformats dates into the shape triage parses', () => {
    // triage.daysToRenewal reads "MMM d, yyyy"; the API sends ISO.
    expect(toHealthDataRow(apiRow()).renewalDate).toBe('Feb 2, 2026');
  });

  it('maps each health category onto its display status', () => {
    const status = (category: CustomerHealthApiRow['health_category']) =>
      toHealthDataRow(apiRow({ health_category: category })).healthStatus;
    expect(status('good')).toBe('Good');
    expect(status('average')).toBe('Average');
    expect(status('poor')).toBe('Poor');
  });

  it('keeps an unrated pulse null rather than substituting a number', () => {
    // A 0 or a 3 here would read as a real score: the Divergence view would
    // plot the account and count it as one both sides agree on.
    const row = toHealthDataRow(apiRow({ csm_pulse_score: null, ai_pulse_value: null }));
    expect(row.csmPulseScore).toBeNull();
    expect(row.aiPulseScore).toBeNull();
  });

  it('keeps missing seats null rather than zero', () => {
    // Zero seats is a real, alarming reading; "not recorded" is not.
    expect(toHealthDataRow(apiRow({ total_active_seats: null })).activeSeats).toBeNull();
  });

  it('renders an unassigned owner rather than blank', () => {
    expect(toHealthDataRow(apiRow({ owner_name: null })).owner).toBe('Unassigned');
  });

  it('leaves the renewal date empty when there is none', () => {
    // Empty rather than a placeholder date: daysToRenewal returns null for
    // this, and the row shows an em dash.
    expect(toHealthDataRow(apiRow({ renewal_date: null })).renewalDate).toBe('');
  });

  it('leaves the pulse timestamp null when the CSM never set one', () => {
    expect(toHealthDataRow(apiRow({ csm_pulse_modified_at: null })).lastPulseModified).toBeNull();
  });

  it('carries history oldest first, as month labels and statuses', () => {
    const { history } = toHealthDataRow(apiRow());
    expect(history).toEqual([
      { month: 'Sep 30, 2025', status: 'Good' },
      { month: 'Oct 31, 2025', status: 'Average' },
    ]);
  });

  it('handles a customer with no recorded history', () => {
    expect(toHealthDataRow(apiRow({ history: [] })).history).toEqual([]);
  });

  it('falls back to the raw lifecycle stage if there is no display label', () => {
    expect(toHealthDataRow(apiRow({ lifecycle_stage_display: '' })).lifecycleStage).toBe('live');
  });

  it('maps a whole page', () => {
    const rows = toHealthDataRows([apiRow({ id: 1 }), apiRow({ id: 2 })]);
    expect(rows.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('maps the server-computed triage fields', () => {
    const row = toHealthDataRow(
      apiRow({
        triage_score: 82,
        triage_factors: [{ label: 'Health is Poor', points: 66 }],
        triage_direction: 'declining',
      }),
    );
    expect(row.triageScore).toBe(82);
    expect(row.triageFactors).toEqual([{ label: 'Health is Poor', points: 66 }]);
    expect(row.triageDirection).toBe('declining');
  });

  it('defaults the triage fields for a fixture written before they existed', () => {
    // triage_score/triage_factors/triage_direction are optional on the API
    // type precisely so an old fixture like the plain `apiRow()` above still
    // parses — this pins what it gets instead of `undefined` leaking through.
    const row = toHealthDataRow(apiRow());
    expect(row.triageScore).toBe(0);
    expect(row.triageFactors).toEqual([]);
    expect(row.triageDirection).toBe('unknown');
  });
});

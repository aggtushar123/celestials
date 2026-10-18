import { describe, it, expect } from 'vitest';
import { mapCustomerToOrgRow } from './mapToOrgRow';
import type { Customer } from './customersSlice';

// Unit tier (see the `testing` skill): the pure adapter in isolation, no
// store/network involved.

const carl = {
  id: 2,
  email: 'carl@acme.io',
  name: 'Carl CSM',
  avatar: 'https://i.pravatar.cc/150?u=carl@acme.io',
  role: 'csm' as const,
  role_id: 2,
  role_name: 'CSM',
  permissions: [],
  function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)', default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional' },
  is_active: true,
};

// Field-for-field the real Apple Inc customer this session created against
// the live backend and verified via curl — see revenact-backend's
// docs/API_CONTRACTS.md -> customers.
function appleCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 6,
    name: 'Apple Inc',
    address: 'Cupertino, CA',
    domain: 'apple.com',
    industry: 'Consumer electronics & technology',
    email: 'contact@apple.com',
    phone: '+1 (408) 996-1010',
    owner: carl,
    created_by: carl,
    modified_by: carl,
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    lifecycle_stage: 'live',
    health_score: '9.3',
    health_category: 'good',
    pulse: [1, 1, 1, 1, 1],
    ai_pulse_score: 'very_satisfied',
    health_score_is_overridden: false,
    csat_breakdown: {
      responses: 8,
      bands: [
        { key: 'very_satisfied', label: 'Very Satisfied', count: 3, share: 37.5 },
        { key: 'satisfied', label: 'Satisfied', count: 3, share: 37.5 },
        { key: 'neutral', label: 'Neutral', count: 2, share: 25 },
        { key: 'dissatisfied', label: 'Dissatisfied', count: 0, share: 0 },
        { key: 'very_dissatisfied', label: 'Very Dissatisfied', count: 0, share: 0 },
      ],
    },
    health_breakdown: [
      { key: 'customer_touch', label: 'Customer Touch', weight: '4.0', points: '0.0', ratio: 0, available: true },
      { key: 'ai_pulse', label: 'AI Pulse', weight: '2.0', points: '2.0', ratio: 1, available: true },
      { key: 'licence_utilization', label: 'Licence Utilization', weight: '2.0', points: '1.7', ratio: 0.841, available: true },
      { key: 'adoption', label: 'Aggregate Adoption Score', weight: '1.5', points: '1.5', ratio: 1, available: true },
      { key: 'support_tickets', label: 'Support Tickets Volume', weight: '0.5', points: '0.2', ratio: 0.5, available: true },
    ],
    ai_pulse_reason: 'Consistent high feature adoption and proactive usage across all key metrics.',
    nps_score: 100,
    csat_score: '100.00',
    joined_date: '2024-10-19',
    renewal_date: '2026-03-02',
    contract_start_date: '2024-10-26',
    contract_end_date: '2025-08-12',
    currency: 'USD',
    currency_display: 'US Dollar ($)',
    arr_billed_at_account: '51200.00',
    arr_billed_at_hq: '128300.00',
    implementation_fee: '70000.00',
    total_contract_value: '179500.00',
    total_forecasted_renewal_revenue: '188475.00',
    primary_product: 1,
  primary_product_name: 'Product A',
    additional_products_count: 3,
    top_source_channel: 'Talent Pool Re-engage',
    total_contracted_seats: 560,
    total_active_seats: 471,
    seat_utilization_percentage: 84.11,
    total_hires: 124,
    scope_web_app: 'N/A',
    ces_percentage: '98.00',
    churn_date: null,
    churn_reason: '' as const,
    churn_reason_display: '',
    churn_comment: '',
    is_archived: false,
    ...overrides,
  };
}

describe('mapCustomerToOrgRow', () => {
  it('maps a fully-populated customer to match the table columns exactly', () => {
    const row = mapCustomerToOrgRow(appleCustomer());

    expect(row.org).toBe('Apple Inc');
    expect(row.id).toBe(6);
    expect(row.owner).toBe('Carl CSM');
    expect(row.img).toBe(carl.avatar);
    expect(row.stage).toBe('Live');
    expect(row.health).toEqual({ val: 9.3, clr: 'bg-[var(--success)]' });
    expect(row.pulse).toEqual([1, 1, 1, 1, 1]);
    expect(row.aiScore).toBe('Very Satisfied');
    expect(row.nps).toBe('+100');
    expect(row.npsColor).toBe('bg-[var(--success)]');
    expect(row.csat).toBe('100%');
    expect(row.csatColor).toBe('bg-[var(--success)]');
    expect(row.joined).toBe('19 Oct 2024');
    expect(row.renewal).toBe('2 Mar 2026');
    expect(row.currency).toBe('USD');
    expect(row.arrAccount).toBe('$51,200.00');
    expect(row.arrHQ).toBe('$128,300.00');
    expect(row.totalSeatUtilization).toBe('84.11%');
    expect(row.cesPercentage).toBe('98%');
    expect(row.domain).toBe('apple.com');
    expect(row.createdBy).toBe('Carl CSM');
    expect(row.nameAddress).toBe('Cupertino, CA');
    expect(row.email).toBe('contact@apple.com');
    expect(row.phone).toBe('+1 (408) 996-1010');
    expect(row.industry).toBe('Consumer electronics & technology');
    // Derived the same way the old mock data was: arr / 12, rounded.
    expect(row.arr).toBe(51200);
    expect(row.mrr).toBe(4267);
  });

  it('falls back gracefully when owner/dates/scores are unset', () => {
    const row = mapCustomerToOrgRow(
      appleCustomer({
        owner: null,
        created_by: null,
        modified_by: null,
        ai_pulse_score: '',
        ai_pulse_reason: '',
        nps_score: null,
        csat_score: null,
        joined_date: null,
        renewal_date: null,
        total_contracted_seats: null,
        total_active_seats: null,
        seat_utilization_percentage: null,
        ces_percentage: null,
        scope_web_app: '',
        email: '',
        phone: '',
        industry: '',
      })
    );

    expect(row.owner).toBe('Unassigned');
    expect(row.email).toBeUndefined();
    expect(row.phone).toBeUndefined();
    expect(row.industry).toBeUndefined();
    expect(row.img).toBeUndefined();
    expect(row.aiScore).toBe('—');
    expect(row.reason).toBe('-');
    expect(row.nps).toBe('0');
    expect(row.npsColor).toBe('bg-[var(--warning)]');
    expect(row.csat).toBe('N/A');
    expect(row.joined).toBe('-');
    expect(row.renewal).toBe('-');
    expect(row.totalSeatUtilization).toBe('N/A');
    expect(row.cesPercentage).toBe('N/A');
    expect(row.scopeWebApp).toBe('N/A');
    expect(row.createdBy).toBe('System');
    expect(row.modifiedBy).toBe('System');
  });

  it('surfaces churn fields and a negative NPS as a detractor', () => {
    const row = mapCustomerToOrgRow(
      appleCustomer({
        lifecycle_stage: 'churn',
        health_score: '1.2',
        health_category: 'poor',
        nps_score: -100,
        churn_date: '2025-01-31',
        churn_reason: 'budget' as const,
        churn_reason_display: 'Budget cut',
        churn_comment: 'Leadership restructuring led to budget realignment.',
      })
    );

    expect(row.stage).toBe('Churn');
    expect(row.health).toEqual({ val: 1.2, clr: 'bg-[var(--danger)]' });
    expect(row.nps).toBe('-100');
    expect(row.npsColor).toBe('bg-[var(--danger)]');
    expect(row.churnDate).toBe('31 Jan 2025');
    // The API's own label, not the stored value and not a lookup of ours.
    expect(row.churnReason).toBe('Budget cut');
    expect(row.churnComment).toBe('Leadership restructuring led to budget realignment.');
  });

  it("formats money per this customer's own currency, with no decimal places for JPY", () => {
    const usd = mapCustomerToOrgRow(appleCustomer());
    expect(usd.arrAccount).toBe('$51,200.00');
    expect(usd.currency).toBe('USD');

    // JPY's minor unit is 0 — Intl.NumberFormat handles that
    // automatically (see formatMoney in ./formatters.ts), unlike the
    // old hardcoded-2-decimals preview this replaced. A customer's own
    // currency (Tier 1) drives this now, not a value passed in from
    // outside — see this file's own docstring.
    const jpy = mapCustomerToOrgRow(appleCustomer({ currency: 'JPY', currency_display: 'Japanese Yen (¥)' }));
    expect(jpy.arrAccount).toBe('¥51,200');
    expect(jpy.currency).toBe('JPY');
  });
});

import { describe, it, expect } from 'vitest';
import { mapAccountToAccountRow } from './mapToAccountRow';
import type { Account } from './customersSlice';

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

// Field-for-field the real "North America Enterprise" account seeded (see
// revenact-backend's seed_demo_accounts) under Apple Inc.
function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    customers: [{ id: 6, name: 'Apple Inc' }],
    name: 'North America Enterprise',
    domain: '',
    industry: '',
    address: '',
    email: '',
    phone: '',
    owner: carl,
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    lifecycle_stage: 'live',
    health_score: '9.5',
    health_category: 'good',
    pulse: [1, 1, 1, 1, 0],
    ai_pulse_score: 'very_satisfied',
    ai_pulse_reason: 'Customer demonstrates high engagement with strong executive sponsorship.',
    nps_score: 100,
    csat_score: '100.00',
    renewal_date: '2026-03-02',
    arr: '33600.00',
    account_pulse: { value: '4.0', label: 'Healthy', category: 1, breakdown: [] },
    ...overrides,
  };
}

describe('mapAccountToAccountRow', () => {
  it('maps a fully-populated account, using its own domain/address/email/phone', () => {
    const row = mapAccountToAccountRow(
      account({
        domain: 'americas.apple.com',
        address: 'Austin, TX',
        email: 'na-enterprise@apple.com',
        phone: '+1 (512) 555-0199',
      }),
      6,
      'Apple Inc',
      'apple.com',
      'Cupertino, CA',
      'contact@apple.com',
      '+1 (408) 996-1010'
    );

    expect(row.orgId).toBe(6);
    expect(row.orgs).toEqual([{ id: 6, name: 'Apple Inc' }]);
    expect(row.id).toBe('1');
    expect(row.name).toBe('North America Enterprise');
    expect(row.orgName).toBe('Apple Inc');
    expect(row.logo).toBe('https://logo.clearbit.com/americas.apple.com');
    expect(row.revenactId).toBe(1);
    expect(row.domain).toBe('americas.apple.com');
    expect(row.location).toBe('Austin, TX');
    expect(row.email).toBe('na-enterprise@apple.com');
    expect(row.phone).toBe('+1 (512) 555-0199');
    expect(row.pulse).toEqual([1, 1, 1, 1, 0]);
    expect(row.aiPulseScore).toBe('Very Satisfied');
    expect(row.owner).toBe('Carl CSM');
    expect(row.avatar).toBe('CC');
    expect(row.health).toEqual({ val: 9.5, clr: 'bg-[var(--success)]' });
    expect(row.healthCategory).toBe('good');
    expect(row.nps).toBe('+100');
    expect(row.npsValue).toBe(100);
    expect(row.csat).toBe('100%');
    expect(row.csatValue).toBe(100);
    expect(row.lifecycleStage).toBe('Live');
    expect(row.renewal).toBe('2 Mar 2026');
    // Derived the same way Customer's own arr/mrr are: arr / 12, rounded.
    expect(row.arr).toBe(33600);
    expect(row.mrr).toBe(2800);
  });

  it('falls back to the parent customer\'s domain/address/email/phone when the account has none of its own', () => {
    const row = mapAccountToAccountRow(
      account({ domain: '', address: '', email: '', phone: '' }),
      6,
      'Apple Inc',
      'apple.com',
      'Cupertino, CA',
      'contact@apple.com',
      '+1 (408) 996-1010'
    );

    expect(row.logo).toBe('https://logo.clearbit.com/apple.com');
    expect(row.domain).toBe('apple.com');
    expect(row.location).toBe('Cupertino, CA');
    expect(row.email).toBe('contact@apple.com');
    expect(row.phone).toBe('+1 (408) 996-1010');
  });

  it("uses its own industry when set, else falls back to the parent's", () => {
    const ownIndustry = mapAccountToAccountRow(
      account({ industry: 'Enterprise device management' }),
      6,
      'Apple Inc',
      'apple.com',
      'Cupertino, CA',
      'contact@apple.com',
      '+1 (408) 996-1010',
      'Consumer electronics & technology'
    );
    expect(ownIndustry.industry).toBe('Enterprise device management');

    const fallback = mapAccountToAccountRow(
      account({ industry: '' }),
      6,
      'Apple Inc',
      'apple.com',
      'Cupertino, CA',
      'contact@apple.com',
      '+1 (408) 996-1010',
      'Consumer electronics & technology'
    );
    expect(fallback.industry).toBe('Consumer electronics & technology');

    const neither = mapAccountToAccountRow(
      account({ industry: '' }),
      6,
      'Apple Inc',
      'apple.com',
      'Cupertino, CA',
      'contact@apple.com',
      '+1 (408) 996-1010'
    );
    expect(neither.industry).toBeUndefined();
  });

  it('falls back gracefully when owner/scores/renewal are unset', () => {
    const row = mapAccountToAccountRow(
      account({
        owner: null,
        ai_pulse_score: '',
        ai_pulse_reason: '',
        nps_score: null,
        csat_score: null,
        renewal_date: null,
      }),
      6,
      'Apple Inc',
      'apple.com',
      'Cupertino, CA',
      'contact@apple.com',
      '+1 (408) 996-1010'
    );

    expect(row.owner).toBe('Unassigned');
    expect(row.avatar).toBe('—');
    expect(row.aiPulseScore).toBe('—');
    expect(row.aiPulseReason).toBe('-');
    expect(row.nps).toBe('0');
    expect(row.csat).toBe('N/A');
    expect(row.renewal).toBe('-');
  });

  it('maps churn lifecycle and a negative NPS the same way Customer does', () => {
    const row = mapAccountToAccountRow(
      account({ lifecycle_stage: 'churn', health_score: '1.2', health_category: 'poor', nps_score: -100 }),
      6,
      'Apple Inc',
      'apple.com',
      'Cupertino, CA',
      'contact@apple.com',
      '+1 (408) 996-1010'
    );

    expect(row.lifecycleStage).toBe('Churn');
    expect(row.health).toEqual({ val: 1.2, clr: 'bg-[var(--danger)]' });
    expect(row.nps).toBe('-100');
  });

  it('carries every linked Customer through as `orgs`, not just the first', () => {
    const row = mapAccountToAccountRow(
      account({ customers: [{ id: 6, name: 'Apple Inc' }, { id: 9, name: 'Kraft Heinz' }] }),
      6,
      'Apple Inc',
      'apple.com',
      'Cupertino, CA',
      'contact@apple.com',
      '+1 (408) 996-1010'
    );

    expect(row.orgs).toEqual([{ id: 6, name: 'Apple Inc' }, { id: 9, name: 'Kraft Heinz' }]);
  });
});

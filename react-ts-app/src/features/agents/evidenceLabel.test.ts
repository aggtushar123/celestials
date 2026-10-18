import { describe, expect, it } from 'vitest';
import { evidenceLabel } from './evidenceLabel';

// UI broken-things fix 10: the labels as the server sends them today.
describe('evidenceLabel', () => {
  it.each([
    [
      '- account:11: "Oracle Cloud Division", owner "Carl CSM", lifecycle onboarding, renews 2027-05-15, health good',
      'Oracle Cloud Division, owner "Carl CSM", lifecycle onboarding, renews 2027-05-15, health good',
    ],
    ['- customer:19: "Uber", owner "Carl CSM", ARR 95,000', 'Uber, owner "Carl CSM", ARR 95,000'],
    ['7: Pizza Hut \u2014 owner Carl CSM, ARR USD 69,600', 'Pizza Hut \u2014 owner Carl CSM, ARR USD 69,600'],
    ['Seat utilisation [seat_utilisation]: 59.6%', 'Seat utilisation: 59.6%'],
    ['Shelfware ARR [shelfware_arr]: USD 252,934', 'Shelfware ARR: USD 252,934'],
    ['at_risk_arr by product: 4: Product B = 64090.0', 'At risk ARR by product: Product B = 64090.0'],
  ])('reads %j as %j', (raw, shown) => {
    expect(evidenceLabel(raw)).toBe(shown);
  });

  // The figures block's own lines (metrics/proposals.py): "- {id}: {name}", an
  // em dash (written \u2014 here), then the facts.
  it('drops the id the figures block puts before a name and its em dash', () => {
    expect(evidenceLabel('- 12: Acme \u2014 account owner Carl CSM')).toBe('Acme \u2014 account owner Carl CSM');
  });

  // Fix round 1: none of these carries an internal reference; each must read
  // exactly as written.
  it.each([
    'task 42: "Escalate cloud migration delay", assigned to nobody, due 2026-08-30',
    'Carl CSM: Agreed. I will take the Pizza Hut save play and have it done by next Friday.',
    '10:30 call with Uber',
    '2026: renewals up 12%',
    'localhost:8000: webhook failing',
    'Acme [EU], owner Carl',
    'Ticket [P1]: login broken',
    'john_doe@acme.com replied',
    'Score: 4: detractor comment',
  ])('leaves %j unchanged', (plain) => {
    expect(evidenceLabel(plain)).toBe(plain);
  });
});

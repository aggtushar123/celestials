import type { UserFunction } from '../../features/auth/authSlice';
import type { AccountPulse } from '../../features/customers/customersSlice';

export type AccountHealthCategory = 'good' | 'average' | 'poor';

export interface AccountRow {
  orgId: number;
  id: string;
  name: string;
  orgName: string;
  logo: string;
  revenactId: number;
  pulse: number[];
  aiPulseScore: string;
  aiPulseReason: string;
  owner: string;
  /** The owner's id and function when the row came from the API (mapToAccountRow); the mock rows have neither. */
  ownerId?: number | null;
  ownerFunction?: UserFunction | null;
  /** The computed pulse from the API; absent on the mock rows. */
  accountPulse?: AccountPulse | null;
  avatar: string;
  health: { val: number; clr: string };
  healthCategory: AccountHealthCategory;
  nps: string;
  npsValue: number;
  csat: string;
  csatValue: number;
  lifecycleStage: string;
  mrr: number;
  arr: number;
  renewal: string;
  /** Shown on ActivityFeed's Overview tab — optional since the mock
   * ACCOUNTS_DATA below (only used as a no-nav-state URL fallback,
   * never for real data) predates these fields. */
  domain?: string;
  location?: string;
  email?: string;
  phone?: string;
  industry?: string;
  /** Every Customer this account is linked to (see the backend Account
   * model's own docstring — a true many-to-many, no primary owner) —
   * `orgId`/`orgName` above are just the first of these, kept for the
   * call sites (ActivityFeed's overview, AccountMetricsBanner) that
   * only ever needed a single label. Powers the standalone Account
   * page's own Organizations tab, which lists every one of these
   * rather than assuming there's only one. Optional since the mock
   * ACCOUNTS_DATA below predates this field. */
  orgs?: { id: number; name: string }[];
}

export const ACCOUNTS_DATA: AccountRow[] = [
  {
    orgId: 1, // Apple Inc
    id: 'acc-1',
    name: 'North America Enterprise',
    orgName: 'Apple Inc',
    logo: 'https://logo.clearbit.com/apple.com',
    revenactId: 3,
    pulse: [1, 1, 1, 1, 0],
    aiPulseScore: 'Very Satisfied',
    aiPulseReason: 'Customer demonstrates high engagement (85% utilization) with strong executive sponsorship.',
    owner: 'Daniel Trial Test',
    avatar: 'DT',
    health: { val: 9.5, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+100', npsValue: 100,
    csat: '100%', csatValue: 100,
    lifecycleStage: 'Live (Enterprise)',
    mrr: 2800, arr: 33600,
    renewal: '2 Mar 2026',
  },
  {
    orgId: 1, // Apple Inc
    id: 'acc-2',
    name: 'Apple EMEA',
    orgName: 'Apple Inc',
    logo: 'https://logo.clearbit.com/apple.com',
    revenactId: 2,
    pulse: [1, 1, 1, 1, 1],
    aiPulseScore: 'Very Satisfied',
    aiPulseReason: 'Customer demonstrates high engagement (80% utilization) and expanding use cases.',
    owner: 'Daniel Trial Test',
    avatar: 'DT',
    health: { val: 9.8, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+90', npsValue: 90,
    csat: '98%', csatValue: 98,
    lifecycleStage: 'Live (Enterprise)',
    mrr: 1200, arr: 14400,
    renewal: '15 Jun 2026',
  },
  {
    orgId: 1, // Apple Inc
    id: 'acc-3',
    name: 'Apple APAC',
    orgName: 'Apple Inc',
    logo: 'https://logo.clearbit.com/apple.com',
    revenactId: 1,
    pulse: [1, 1, 1, 0, 0],
    aiPulseScore: 'Satisfied',
    aiPulseReason: 'Steady growth but requires expansion focus into new verticals.',
    owner: 'Daniel Trial Test',
    avatar: 'DT',
    health: { val: 8.2, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+50', npsValue: 50,
    csat: '85%', csatValue: 85,
    lifecycleStage: 'Adoption (Enterprise)',
    mrr: 267, arr: 3200,
    renewal: '28 Sep 2026',
  },
  // --- Pizza Hut accounts ---
  {
    orgId: 2,
    id: 'acc-4',
    name: 'Pizza Hut US Operations',
    orgName: 'Pizza Hut',
    logo: 'https://logo.clearbit.com/pizzahut.com',
    revenactId: 4,
    pulse: [2, 0, 0, 0, 0],
    aiPulseScore: 'High Risk',
    aiPulseReason: 'Severe drop in engagement with unresolved critical tickets.',
    owner: 'Edgar Holmes',
    avatar: 'EH',
    health: { val: 1.5, clr: 'bg-danger' },
    healthCategory: 'poor',
    nps: '-90', npsValue: -90,
    csat: '15%', csatValue: 15,
    lifecycleStage: 'Live (Enterprise)',
    mrr: 4200, arr: 50400,
    renewal: '15 Jun 2026',
  },
  {
    orgId: 2,
    id: 'acc-5',
    name: 'Pizza Hut International',
    orgName: 'Pizza Hut',
    logo: 'https://logo.clearbit.com/pizzahut.com',
    revenactId: 5,
    pulse: [3, 2, 0, 0, 0],
    aiPulseScore: 'At Risk',
    aiPulseReason: 'Low feature adoption and declining user sentiment scores.',
    owner: 'Edgar Holmes',
    avatar: 'EH',
    health: { val: 2.1, clr: 'bg-danger' },
    healthCategory: 'poor',
    nps: '-70', npsValue: -70,
    csat: '25%', csatValue: 25,
    lifecycleStage: 'Live (Enterprise)',
    mrr: 1600, arr: 19200,
    renewal: '15 Jun 2026',
  },
  // --- Kraft Heinz accounts ---
  {
    orgId: 3,
    id: 'acc-6',
    name: 'Kraft Heinz North America',
    orgName: 'Kraft Heinz',
    logo: 'https://logo.clearbit.com/kraftheinz.com',
    revenactId: 6,
    pulse: [1, 1, 1, 1, 1],
    aiPulseScore: 'Satisfied',
    aiPulseReason: 'Strong onboarding progress with high milestone completion rate.',
    owner: 'Edgar Holmes',
    avatar: 'EH',
    health: { val: 8.9, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+20', npsValue: 20,
    csat: '72%', csatValue: 72,
    lifecycleStage: 'Onboarding (Enterprise)',
    mrr: 8500, arr: 102000,
    renewal: '15 Nov 2027',
  },
  {
    orgId: 3,
    id: 'acc-7',
    name: 'Heinz Europe',
    orgName: 'Kraft Heinz',
    logo: 'https://logo.clearbit.com/kraftheinz.com',
    revenactId: 7,
    pulse: [1, 1, 3, 0, 0],
    aiPulseScore: 'Moderate',
    aiPulseReason: 'Technical integration delays with the ERP system.',
    owner: 'Sarah Chen',
    avatar: 'SC',
    health: { val: 6.4, clr: 'bg-warning' },
    healthCategory: 'average',
    nps: '-30', npsValue: -30,
    csat: '40%', csatValue: 40,
    lifecycleStage: 'Onboarding (Enterprise)',
    mrr: 4217, arr: 50600,
    renewal: '15 Nov 2027',
  },
  // --- Hyatt accounts ---
  {
    orgId: 4,
    id: 'acc-8',
    name: 'Hyatt Americas',
    orgName: 'Hyatt Hotels',
    logo: 'https://logo.clearbit.com/hyatt.com',
    revenactId: 8,
    pulse: [1, 1, 1, 1, 0],
    aiPulseScore: 'Satisfied',
    aiPulseReason: 'Strong renewal probability with LATAM expansion.',
    owner: 'Edgar Holmes',
    avatar: 'EH',
    health: { val: 9.0, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+55', npsValue: 55,
    csat: '80%', csatValue: 80,
    lifecycleStage: 'Live (Enterprise)',
    mrr: 3500, arr: 42000,
    renewal: '2 Feb 2026',
  },
  {
    orgId: 4,
    id: 'acc-9',
    name: 'Hyatt EMEA & APAC',
    orgName: 'Hyatt Hotels',
    logo: 'https://logo.clearbit.com/hyatt.com',
    revenactId: 9,
    pulse: [3, 3, 1, 0, 0],
    aiPulseScore: 'Moderate',
    aiPulseReason: 'Adoption phase with mixed results across regions.',
    owner: 'Sarah Chen',
    avatar: 'SC',
    health: { val: 5.8, clr: 'bg-warning' },
    healthCategory: 'average',
    nps: '+10', npsValue: 10,
    csat: '55%', csatValue: 55,
    lifecycleStage: 'Adoption (Enterprise)',
    mrr: 1458, arr: 17500,
    renewal: '2 Sep 2026',
  },
  // --- Arista accounts ---
  {
    orgId: 5,
    id: 'acc-10',
    name: 'Arista Global',
    orgName: 'Arista Networks',
    logo: 'https://logo.clearbit.com/arista.com',
    revenactId: 10,
    pulse: [1, 1, 1, 1, 1],
    aiPulseScore: 'Very Satisfied',
    aiPulseReason: 'Exceptional onboarding velocity with proactive engagement.',
    owner: 'Edgar Holmes',
    avatar: 'EH',
    health: { val: 10, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+47', npsValue: 47,
    csat: '80%', csatValue: 80,
    lifecycleStage: 'Onboarding (Enterprise)',
    mrr: 8475, arr: 101700,
    renewal: '28 Sep 2026',
  },
  // --- Oracle accounts ---
  {
    orgId: 6,
    id: 'acc-11',
    name: 'Oracle Cloud Division',
    orgName: 'Oracle',
    logo: 'https://logo.clearbit.com/oracle.com',
    revenactId: 11,
    pulse: [1, 1, 1, 1, 0],
    aiPulseScore: 'Very Satisfied',
    aiPulseReason: 'Peak utilization and frequent beta feature participation.',
    owner: 'Daniel Trial Test',
    avatar: 'DT',
    health: { val: 10, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+100', npsValue: 100,
    csat: '100%', csatValue: 100,
    lifecycleStage: 'Onboarding (Enterprise)',
    mrr: 0, arr: 0,
    renewal: '15 May 2026',
  },
  // --- Salesforce ---
  {
    orgId: 7,
    id: 'acc-12',
    name: 'Salesforce Core Platform',
    orgName: 'Salesforce',
    logo: 'https://logo.clearbit.com/salesforce.com',
    revenactId: 12,
    pulse: [1, 1, 1, 0, 0],
    aiPulseScore: 'Satisfied',
    aiPulseReason: 'Strong exec sponsorship driving kickoff momentum.',
    owner: 'Sarah Chen',
    avatar: 'SC',
    health: { val: 7.2, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+60', npsValue: 60,
    csat: '82%', csatValue: 82,
    lifecycleStage: 'Kickoff (Enterprise)',
    mrr: 7450, arr: 89400,
    renewal: '15 Feb 2027',
  },
  // --- Spotify ---
  {
    orgId: 8,
    id: 'acc-13',
    name: 'Spotify Business',
    orgName: 'Spotify',
    logo: 'https://logo.clearbit.com/spotify.com',
    revenactId: 13,
    pulse: [1, 3, 1, 0, 0],
    aiPulseScore: 'Moderate',
    aiPulseReason: 'Growing adoption but inconsistent engagement across teams.',
    owner: 'Sarah Chen',
    avatar: 'SC',
    health: { val: 6.5, clr: 'bg-warning' },
    healthCategory: 'average',
    nps: '+10', npsValue: 10,
    csat: '58%', csatValue: 58,
    lifecycleStage: 'Adoption (Mid-Market)',
    mrr: 3200, arr: 38400,
    renewal: '10 Aug 2026',
  },
  // --- Stripe ---
  {
    orgId: 9,
    id: 'acc-14',
    name: 'Stripe Payments',
    orgName: 'Stripe',
    logo: 'https://logo.clearbit.com/stripe.com',
    revenactId: 14,
    pulse: [1, 1, 1, 1, 0],
    aiPulseScore: 'Satisfied',
    aiPulseReason: 'Strong ROI metrics heading into renewal cycle.',
    owner: 'Edgar Holmes',
    avatar: 'EH',
    health: { val: 8.1, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+55', npsValue: 55,
    csat: '76%', csatValue: 76,
    lifecycleStage: 'Renewal (Enterprise)',
    mrr: 9333, arr: 112000,
    renewal: '5 May 2026',
  },
  // --- WeWork ---
  {
    orgId: 10,
    id: 'acc-15',
    name: 'WeWork US',
    orgName: 'WeWork',
    logo: 'https://logo.clearbit.com/wework.com',
    revenactId: 15,
    pulse: [2, 2, 0, 0, 0],
    aiPulseScore: 'Critical',
    aiPulseReason: 'Account marked for churn due to budget constraints.',
    owner: 'Daniel Trial Test',
    avatar: 'DT',
    health: { val: 1.2, clr: 'bg-danger' },
    healthCategory: 'poor',
    nps: '-100', npsValue: -100,
    csat: '12%', csatValue: 12,
    lifecycleStage: 'Churn',
    mrr: 2000, arr: 24000,
    renewal: '-',
  },
  // --- Shopify ---
  {
    orgId: 11,
    id: 'acc-16',
    name: 'Shopify Plus',
    orgName: 'Shopify',
    logo: 'https://logo.clearbit.com/shopify.com',
    revenactId: 16,
    pulse: [1, 1, 1, 1, 1],
    aiPulseScore: 'Very Satisfied',
    aiPulseReason: 'Expanding license count with APAC team onboarding.',
    owner: 'Sarah Chen',
    avatar: 'SC',
    health: { val: 9.5, clr: 'bg-success' },
    healthCategory: 'good',
    nps: '+85', npsValue: 85,
    csat: '94%', csatValue: 94,
    lifecycleStage: 'Expansion (Enterprise)',
    mrr: 14583, arr: 175000,
    renewal: '12 Jul 2026',
  },
];

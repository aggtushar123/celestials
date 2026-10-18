export type AreaKey = 'revenue' | 'health' | 'support';

export interface SubView {
  label: string;
  path: string;
}

export const AREAS: { key: AreaKey; label: string; views: SubView[] }[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    views: [
      { label: 'Forecast', path: 'forecast' },
      { label: 'Customers', path: 'customers' },
      { label: 'Products', path: 'products' },
    ],
  },
  {
    key: 'health',
    label: 'Health',
    views: [
      { label: 'Triage', path: 'triage' },
      { label: 'Divergence', path: 'divergence' },
      { label: 'Movement', path: 'movement' },
      { label: 'Renewals', path: 'renewals' },
      { label: 'Usage', path: 'usage' },
      { label: 'Activity', path: 'activity' },
      { label: 'Distribution', path: 'distribution' },
    ],
  },
  {
    key: 'support',
    label: 'Support',
    views: [
      { label: 'Tickets', path: 'tickets' },
      { label: 'Topics', path: 'topics' },
    ],
  },
];

/** Every path the old "Advance Dashboards" served, and where it lives now.
 *  Anything under an old tab that is not listed (the retired filter-chip
 *  paths) falls back to that tab's entry with no suffix. */
export const LEGACY: Record<string, string> = {
  health: '/dashboard/health/triage',
  'health/triage': '/dashboard/health/triage',
  'health/divergence': '/dashboard/health/divergence',
  'health/movement': '/dashboard/health/movement',
  'health/renewal-date': '/dashboard/health/renewals',
  'health/controls': '/dashboard/health/distribution',
  usage: '/dashboard/health/usage',
  activity: '/dashboard/health/activity',
  revenue: '/dashboard/revenue/forecast',
  customer: '/dashboard/revenue/customers',
  product: '/dashboard/revenue/products',
  ticket: '/dashboard/support/tickets',
  'ai-trending': '/dashboard/support/topics',
};

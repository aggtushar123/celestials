import type { HealthBand, NpsBand } from './portfolioTypes';

// One source for the words the portfolio shows for its bands and windows:
// the tiles, the filters panel, the chips and the row visuals all read these.

export const HEALTH_LABEL: Record<HealthBand, 'Good' | 'Average' | 'Poor'> = {
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
};

export const NPS_BANDS: NpsBand[] = ['promoter', 'passive', 'detractor'];
export const NPS_LABEL: Record<NpsBand, string> = {
  promoter: 'Promoters',
  passive: 'Passives',
  detractor: 'Detractors',
};

/** The renewal windows the `renews_within` filter accepts, in days. */
export const RENEWAL_WINDOWS = ['30', '90', '180'] as const;
export type RenewalWindow = (typeof RENEWAL_WINDOWS)[number];
export const windowLabel = (days: RenewalWindow) => `${days} days`;

/** What a portfolio lists, in its own words ("organization", "account"). */
export interface PortfolioNoun {
  one: string;
  many: string;
}

export const ORGANIZATION_NOUN: PortfolioNoun = { one: 'organization', many: 'organizations' };

/** "organizations" → "Organizations". */
export const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

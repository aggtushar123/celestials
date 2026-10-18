import type { CsatBreakdown, Survey } from '../customers/customersSlice';

// How an account's answered CSAT surveys spread over the five bands. The
// backend computes this for an organisation (`Customer.csat_breakdown`) but
// AccountSerializer has none, so the account page computes it from
// GET /accounts/<id>/surveys/ with the backend's own rule
// (services/customers/models.py: CSAT_BANDS, csat_band, csat_breakdown).

const BANDS: { upper: number; key: string; label: string }[] = [
  { upper: 20, key: 'very_dissatisfied', label: 'Very Dissatisfied' },
  { upper: 40, key: 'dissatisfied', label: 'Dissatisfied' },
  { upper: 60, key: 'neutral', label: 'Neutral' },
  { upper: 80, key: 'satisfied', label: 'Satisfied' },
  { upper: 100, key: 'very_satisfied', label: 'Very Satisfied' },
];

/** The first band whose upper bound the score reaches; above 100 is Very Satisfied. */
export function csatBand(score: number): string {
  return (BANDS.find((band) => score <= band.upper) ?? BANDS[BANDS.length - 1]).key;
}

/** Answered CSAT surveys only; every band listed, best first, shares to two places. */
export function csatBreakdown(surveys: Survey[]): CsatBreakdown {
  const counts: Record<string, number> = Object.fromEntries(BANDS.map((band) => [band.key, 0]));
  let responses = 0;
  for (const survey of surveys) {
    if (survey.survey_type !== 'csat' || survey.status !== 'responded' || survey.score == null) continue;
    counts[csatBand(survey.score)] += 1;
    responses += 1;
  }
  return {
    responses,
    bands: [...BANDS].reverse().map((band) => ({
      key: band.key,
      label: band.label,
      count: counts[band.key],
      share: responses ? Math.round((counts[band.key] / responses) * 10000) / 100 : 0,
    })),
  };
}

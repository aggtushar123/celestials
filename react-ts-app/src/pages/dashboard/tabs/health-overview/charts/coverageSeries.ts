import { CONTACT_COLD_DAYS, CONTACT_FRESH_DAYS } from '../renewal';
import { ROLE } from '../../../shared/chartPalette';

/** Contact age, not health — green is "somebody is in this deal", red is
 *  "nobody has spoken to them". Deliberately the same three hues the health
 *  charts use: on this screen those colours already mean good/attention/bad,
 *  and inventing a second palette for a second meaning of "bad" costs more
 *  than it explains. */
export const COVERAGE_SERIES = [
  { key: 'cold', label: `No contact ${CONTACT_COLD_DAYS}d+`, color: ROLE.loss },
  { key: 'ageing', label: `${CONTACT_FRESH_DAYS}–${CONTACT_COLD_DAYS}d`, color: ROLE.caution },
  { key: 'fresh', label: `Contacted <${CONTACT_FRESH_DAYS}d`, color: ROLE.gain },
  { key: 'unknown', label: 'No activity logged', color: ROLE.faint },
] as const;

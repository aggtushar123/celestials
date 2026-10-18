// The question per type, its scale and its bands, mirrored from the
// backend's services/surveys/questions.py (backend plan Decisions 9, 10).
import type { BandName, ContactRole, SurveyType } from './surveyTypes';

export const TYPE_LABEL: Record<SurveyType, string> = { nps: 'NPS', csat: 'CSAT', ces: 'CES' };

/** Under each type's tile in the builder. */
export const TYPE_HINT: Record<SurveyType, string> = {
  nps: 'Would they recommend you? 0 to 10',
  csat: 'How satisfied are they? 1 to 5',
  ces: 'How easy are you to work with? 1 to 7',
};

export const SCALES: Record<SurveyType, readonly [number, number]> = { nps: [0, 10], csat: [1, 5], ces: [1, 7] };

/** The words under the lowest and the highest score: NPS's from spec §2.4,
 *  CSAT's and CES's from plan Decision 8. */
export const SCALE_ENDS: Record<SurveyType, readonly [string, string]> = {
  nps: ['Not likely', 'Very likely'],
  csat: ['Very unsatisfied', 'Very satisfied'],
  ces: ['Very difficult', 'Very easy'],
};

const QUESTIONS: Record<SurveyType, string> = {
  nps: 'How likely are you to recommend {name} to a friend or colleague?',
  csat: 'How satisfied are you with {name}?',
  ces: 'How easy is it to get what you need from {name}?',
};

/** Low, middle and high, per type. */
export const BANDS: Record<SurveyType, readonly [BandName, BandName, BandName]> = {
  nps: ['detractors', 'passives', 'promoters'],
  csat: ['low', 'mid', 'high'],
  ces: ['low', 'mid', 'high'],
};

export const BAND_LABEL: Record<BandName, string> = {
  detractors: 'Detractors',
  passives: 'Passives',
  promoters: 'Promoters',
  low: 'Low',
  mid: 'Middle',
  high: 'High',
};

/** What each figure counts (spec Decisions, "Scores"). */
export const FIGURE_HINT: Record<SurveyType, string> = {
  nps: 'Promoters minus detractors',
  csat: 'Answering 4 or 5',
  ces: 'Answering 5 to 7',
};

export const NAME_MAX = 120;
export const SUBJECT_MAX = 120;
export const INTRO_MAX = 500;
export const COMMENT_MAX = 2000;
export const LINK_DAYS = 14;
export const PER_RECORD_CAP = 3;
/** Ticked when an organisation or account segment is chosen (spec §2.2). */
export const DEFAULT_ROLES: ContactRole[] = ['champion', 'decision_maker'];

export function questionFor(type: SurveyType, workspace: string): string {
  return QUESTIONS[type].replace('{name}', workspace);
}

export function scaleOf(type: SurveyType): number[] {
  const [low, high] = SCALES[type];
  return Array.from({ length: high - low + 1 }, (_, i) => low + i);
}

export function bandTone(band: BandName): 'low' | 'mid' | 'high' {
  if (band === 'detractors' || band === 'low') return 'low';
  if (band === 'promoters' || band === 'high') return 'high';
  return 'mid';
}

/** The `detractors` filter is the low band for every type (backend
 *  Decision 10); only NPS calls them detractors. */
export function lowFilterLabel(type: SurveyType): string {
  return type === 'nps' ? 'Detractors' : 'Low scores';
}

export function formatFigure(type: SurveyType, figure: number | null): string {
  if (figure === null) return '—';
  if (type !== 'nps') return `${figure}%`;
  if (figure > 0) return `+${figure}`;
  if (figure < 0) return `−${Math.abs(figure)}`;
  return '0';
}

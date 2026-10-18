import { FUNCTION_LABELS, type UserFunction } from '../auth/authSlice';
import type { Opportunity, Risk } from '../customers/customersSlice';
import { formatDate } from '../customers/formatters';
import type { PortfolioNoun } from '../organizations/portfolioLabels';
import type { Option } from '../organizations/portfolioTypes';
import { fetchPipeline } from './pipelineApi';
import type { PipelineKindKey, PipelinePage, PipelineRow } from './pipelineTypes';

// What differs between the two kinds the Pipelines page lists, named once
// (as the backend's services/pipelines_portfolio/kinds.py does): the stages,
// which are open, the "…this quarter" stage, the date's words, the tiles'
// titles and the endpoint. Components take a PipelineKind and never branch
// on which one it is.

export interface Choice {
  value: string;
  label: string;
}

/** Opportunity.Stage on the backend, in board order. */
export const OPPORTUNITY_STAGES: { value: Opportunity['stage']; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'solution_validation', label: 'Solution Validation' },
  { value: 'proposal_price_review', label: 'Proposal / Price Review' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
];

/** Risk.Stage on the backend, in board order. */
export const RISK_STAGES: { value: Risk['stage']; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'mitigated', label: 'Mitigated' },
  { value: 'realised', label: 'Realised' },
  { value: 'abandoned', label: 'Abandoned' },
];

export interface PipelineKind {
  key: PipelineKindKey;
  /** A row's `kind`. */
  item: 'opportunity' | 'risk';
  noun: PortfolioNoun;
  /** The switch's word: "Opportunities". */
  title: string;
  stages: Choice[];
  /** Open: opportunities not Closed Won or Lost; risks Open. */
  openStages: string[];
  /** The "…this quarter" tile's stage. */
  doneStage: string;
  /** Board columns that start collapsed (Closed Lost). */
  collapsedStages: string[];
  /** The form's date label. */
  dateLabel: string;
  /** "Closes in 12d" / "Due in 12d". */
  dateVerb: string;
  /** A closed item's date, past or ahead: "Expected 5 Sep 2026" / "Due by 5 Sep 2026". */
  pastLabel: string;
  sortDateLabel: string;
  monthLabel: string;
  tiles: { open: string; within: string; done: string };
  /** GET /pipelines/<kind>/. A property (not a method): it is passed around
   *  as a stable reader. */
  fetch: (query: string) => Promise<PipelinePage>;
}

export const OPPORTUNITIES_KIND: PipelineKind = {
  key: 'opportunities',
  item: 'opportunity',
  noun: { one: 'opportunity', many: 'opportunities' },
  title: 'Opportunities',
  stages: OPPORTUNITY_STAGES,
  openStages: ['discovery', 'qualification', 'solution_validation', 'proposal_price_review', 'negotiation'],
  doneStage: 'closed_won',
  collapsedStages: ['closed_lost'],
  dateLabel: 'Expected close',
  dateVerb: 'Closes',
  pastLabel: 'Expected',
  sortDateLabel: 'Close date',
  monthLabel: 'Close month',
  tiles: { open: 'Open pipeline', within: 'Closing', done: 'Won this quarter' },
  fetch: (query) => fetchPipeline('opportunities', query),
};

export const RISKS_KIND: PipelineKind = {
  key: 'risks',
  item: 'risk',
  noun: { one: 'risk', many: 'risks' },
  title: 'Risks',
  stages: RISK_STAGES,
  openStages: ['open'],
  doneStage: 'mitigated',
  collapsedStages: [],
  dateLabel: 'Due by',
  dateVerb: 'Due',
  pastLabel: 'Due by',
  sortDateLabel: 'Due date',
  monthLabel: 'Due month',
  tiles: { open: 'MRR at risk', within: 'Due', done: 'Mitigated this quarter' },
  fetch: (query) => fetchPipeline('risks', query),
};

export const PIPELINE_KINDS: Record<PipelineKindKey, PipelineKind> = {
  opportunities: OPPORTUNITIES_KIND,
  risks: RISKS_KIND,
};

export const PRIORITY_CHOICES: Option[] = [
  { value: 'high', name: 'High' },
  { value: 'medium', name: 'Medium' },
  { value: 'low', name: 'Low' },
];

/** The department value that stands for the whole company (a blank
 *  department) in the URL, the filter and a bulk choice. */
export const NO_DEPARTMENT = 'none';

export const DEPARTMENT_CHOICES: Option[] = [
  ...(Object.entries(FUNCTION_LABELS) as [UserFunction, string][]).map(([value, name]) => ({ value, name })),
  { value: NO_DEPARTMENT, name: 'Whole company' },
];

export const stageLabel = (kind: PipelineKind, value: string): string =>
  kind.stages.find((stage) => stage.value === value)?.label ?? value;

/** Every stage of the kind, as a bulk choice. */
export const stageTargets = (kind: PipelineKind): Option[] => kind.stages.map((stage) => ({ value: stage.value, name: stage.label }));

/** "an opportunity", "a risk": for empty-state copy. */
export const withArticle = (word: string): string => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;

export function pipelineSortOptions(kind: PipelineKind): Choice[] {
  return [
    { value: 'mrr', label: 'MRR' },
    { value: 'date', label: kind.sortDateLabel },
    { value: 'priority', label: 'Priority' },
    { value: 'stage', label: 'Stage' },
    { value: 'title', label: 'Title' },
  ];
}

/** The Group choices; the Board has no "None" (a board always has columns). */
export function pipelineGroupOptions(kind: PipelineKind, board: boolean): Choice[] {
  const options = [
    { value: 'none', label: 'None' },
    { value: 'stage', label: 'Stage' },
    { value: 'month', label: kind.monthLabel },
    { value: 'parent', label: 'Organization or account' },
    { value: 'owner', label: 'Owner' },
    { value: 'department', label: 'Department' },
    { value: 'priority', label: 'Priority' },
  ];
  return board ? options.filter((option) => option.value !== 'none') : options;
}

export function parentHref(parent: PipelineRow['parent']): string {
  return parent.type === 'organisation' ? `/organizations/${parent.id}` : `/accounts/${parent.id}`;
}

/** The date line (spec §1): "Closes in 12d", "Overdue 5d", "No date"
 *  (risks "Due in 12d"); "Closes today" at 0; a closed item, whether its
 *  date has passed or not, names the date (plan Decision 4), so it never
 *  reads as if it will still close. */
export function dateText(kind: PipelineKind, date: PipelineRow['date'], open: boolean): string {
  if (date.value === null || date.days === null) return 'No date';
  if (!open) return `${kind.pastLabel} ${formatDate(date.value)}`;
  if (date.days < 0) return `Overdue ${-date.days}d`;
  if (date.days === 0) return `${kind.dateVerb} today`;
  return `${kind.dateVerb} in ${date.days}d`;
}

/** Whole days from `today` to `iso` (both YYYY-MM-DD), negative once passed.
 *  Counted in UTC so a daylight-saving change never makes a day 23 hours. */
export function daysFrom(iso: string, today: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(iso) - utc(today)) / 86_400_000);
}

/** A row as it reads once moved to `to` (a Board move's guess): the stage,
 *  whether it is open, overdue, and its one signal (Overdue first, then
 *  High priority on an open item), as the server computes them. */
export function rowWithStage(row: PipelineRow, to: string, kind: PipelineKind): PipelineRow {
  const open = kind.openStages.includes(to);
  const overdue = open && row.date.days !== null && row.date.days < 0;
  const signal: PipelineRow['signal'] = overdue
    ? { kind: 'overdue', label: 'Overdue' }
    : open && row.priority.value === 'high'
      ? { kind: 'high_priority', label: 'High priority' }
      : null;
  return { ...row, stage: { value: to, label: stageLabel(kind, to) }, open, overdue, signal };
}

function recordBase(row: PipelineRow) {
  const onAccount = row.parent.type === 'account';
  return {
    id: row.id,
    title: row.title,
    mrr: row.mrr.toFixed(2),
    stage_display: row.stage.label,
    priority: row.priority.value,
    priority_display: row.priority.label,
    department: row.department.value,
    department_display: row.department.label,
    companies: row.companies,
    account_id: onAccount ? row.parent.id : null,
    account_name: onAccount ? row.parent.name : null,
    stage_changed_at: row.stage_changed_at,
  };
}

/** The Opportunity the edit form reads, from a Pipelines row (plan Decision 2). */
export function opportunityRecord(row: PipelineRow): Opportunity {
  return { ...recordBase(row), stage: row.stage.value as Opportunity['stage'], expected_close: row.date.value };
}

/** The Risk the edit form reads, from a Pipelines row. */
export function riskRecord(row: PipelineRow): Risk {
  return { ...recordBase(row), stage: row.stage.value as Risk['stage'], due_by: row.date.value };
}

const RISK_STAGE_VALUES: string[] = RISK_STAGES.map((stage) => stage.value);

/** A Deals & risks item's date line and whether it is overdue, from its own
 *  record (the stages of the two kinds do not overlap). */
export function dealDateLine(deal: Opportunity | Risk, today: string): { text: string; overdue: boolean } {
  const isRisk = RISK_STAGE_VALUES.includes(deal.stage);
  const kind = isRisk ? RISKS_KIND : OPPORTUNITIES_KIND;
  const value = (isRisk ? (deal as Risk).due_by : (deal as Opportunity).expected_close) ?? null;
  const days = value === null ? null : daysFrom(value, today);
  const open = kind.openStages.includes(deal.stage);
  return { text: dateText(kind, { value, days }, open), overdue: open && days !== null && days < 0 };
}

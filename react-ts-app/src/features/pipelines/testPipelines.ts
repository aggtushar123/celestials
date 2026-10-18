import { vi } from 'vitest';
import { FUNCTION_LABELS, type UserFunction } from '../auth/authSlice';
import type { BulkResult, Option } from '../organizations/portfolioTypes';
import { PIPELINE_KINDS, daysFrom, opportunityRecord, riskRecord, rowWithStage, type PipelineKind } from './pipelineKinds';
import type {
  PipelineBulkRequest,
  PipelineFilterOptions,
  PipelineGroup,
  PipelineKindKey,
  PipelinePage,
  PipelineRow,
  PipelineSummary,
  PipelineTotal,
} from './pipelineTypes';

// Test-only: rows shaped like revenact-backend's GET /pipelines/{kind}/
// (branch feat/pipelines-portfolio) and a fetch stub that answers the book,
// export, bulk, the per-item PATCH/POST/DELETE and the form's organisation
// and account pickers the way the backend does — services/pipelines_portfolio
// params.py (unknown values dropped), book.py (filters, the stage last),
// shape.py (order, sections, totals) and serializers.py (bulk validation).
// Writes change the stub's copy of the book, so a reload after a move or an
// edit sees them; a stage change restamps `stage_changed_at`, as the model's
// StageClockMixin does. Its "today" is 2026-09-30; its quarter began
// 2026-07-01. One difference, on purpose: the cursor is an offset here (the
// backend's is an opaque keyset; the page only passes it back).

export const STUB_TODAY = '2026-09-30';
export const QUARTER_START = '2026-07-01';
/** "Now" for a write: stamps a moved stage and a created item. */
const STUB_NOW = '2026-09-30T12:00:00+00:00';
const QUARTER_SINCE = Date.parse(`${QUARTER_START}T00:00:00Z`);
const QUARTER_UNTIL = Date.parse('2026-10-01T00:00:00Z');
const THIS_QUARTER = '2026-09-02T10:00:00+00:00';
const LAST_QUARTER = '2026-05-02T10:00:00+00:00';

export const emeaSeats: PipelineRow = {
  id: 41,
  kind: 'opportunity',
  title: 'EMEA seats',
  parent: { type: 'account', id: 12, name: 'Pizza Hut EMEA' },
  companies: [{ id: 7, name: 'Pizza Hut' }],
  owner: { id: 2, name: 'Carl CSM' },
  mrr: 2000,
  stage: { value: 'negotiation', label: 'Negotiation' },
  priority: { value: 'high', label: 'High' },
  department: { value: 'cs', label: 'Customer Success' },
  date: { value: '2026-10-07', days: 7 },
  open: true,
  overdue: false,
  signal: { kind: 'high_priority', label: 'High priority' },
  stage_changed_at: LAST_QUARTER,
  created_at: '2026-09-01T09:00:00+00:00',
};

export const analyticsAddOn: PipelineRow = {
  ...emeaSeats,
  id: 42,
  title: 'Analytics add-on',
  parent: { type: 'organisation', id: 7, name: 'Pizza Hut' },
  mrr: 300,
  stage: { value: 'discovery', label: 'Discovery' },
  priority: { value: 'medium', label: 'Medium' },
  department: { value: '', label: '' },
  date: { value: null, days: null },
  signal: null,
};

export const globexUplift: PipelineRow = {
  ...emeaSeats,
  id: 43,
  title: 'Globex uplift',
  parent: { type: 'organisation', id: 1, name: 'Globex' },
  companies: [{ id: 1, name: 'Globex' }],
  owner: { id: 3, name: 'Priya' },
  mrr: 5000,
  stage: { value: 'proposal_price_review', label: 'Proposal / Price Review' },
  priority: { value: 'low', label: 'Low' },
  department: { value: 'sales', label: 'Sales' },
  date: { value: '2026-09-25', days: -5 },
  overdue: true,
  signal: { kind: 'overdue', label: 'Overdue' },
};

/** Won this quarter, on an account whose owner is outside the viewer's
 *  organisation and none of whose organisations the viewer may open. */
export const initechWin: PipelineRow = {
  ...emeaSeats,
  id: 44,
  title: 'Initech expansion',
  parent: { type: 'account', id: 14, name: 'Initech APAC' },
  companies: [],
  owner: { id: null, name: 'Not in your book' },
  mrr: 1500,
  stage: { value: 'closed_won', label: 'Closed Won' },
  priority: { value: 'medium', label: 'Medium' },
  date: { value: '2026-09-10', days: -20 },
  open: false,
  overdue: false,
  signal: null,
  stage_changed_at: THIS_QUARTER,
};

export const hooliPilot: PipelineRow = {
  ...emeaSeats,
  id: 45,
  title: 'Hooli pilot',
  parent: { type: 'organisation', id: 5, name: 'Hooli' },
  companies: [{ id: 5, name: 'Hooli' }],
  owner: null,
  mrr: 800,
  stage: { value: 'closed_lost', label: 'Closed Lost' },
  priority: { value: 'low', label: 'Low' },
  department: { value: '', label: '' },
  date: { value: null, days: null },
  open: false,
  overdue: false,
  signal: null,
};

export const OPPORTUNITY_ROWS: PipelineRow[] = [emeaSeats, analyticsAddOn, globexUplift, initechWin, hooliPilot];

export const adminLeft: PipelineRow = {
  ...emeaSeats,
  id: 71,
  kind: 'risk',
  title: 'Admin left',
  mrr: 800,
  stage: { value: 'open', label: 'Open' },
  date: { value: '2026-10-20', days: 20 },
};

export const budgetFreeze: PipelineRow = {
  ...adminLeft,
  id: 72,
  title: 'Budget freeze',
  parent: { type: 'organisation', id: 1, name: 'Globex' },
  companies: [{ id: 1, name: 'Globex' }],
  owner: { id: 3, name: 'Priya' },
  mrr: 1200,
  priority: { value: 'medium', label: 'Medium' },
  department: { value: '', label: '' },
  date: { value: '2026-09-28', days: -2 },
  overdue: true,
  signal: { kind: 'overdue', label: 'Overdue' },
};

export const championMitigated: PipelineRow = {
  ...adminLeft,
  id: 73,
  title: 'Champion churned',
  parent: { type: 'organisation', id: 7, name: 'Pizza Hut' },
  mrr: 600,
  stage: { value: 'mitigated', label: 'Mitigated' },
  priority: { value: 'low', label: 'Low' },
  date: { value: null, days: null },
  open: false,
  overdue: false,
  signal: null,
  stage_changed_at: THIS_QUARTER,
};

export const RISK_ROWS: PipelineRow[] = [adminLeft, budgetFreeze, championMitigated];

// --- The backend's constants (params.py, shape.py, serializers.py) ---------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
export const MAX_IDS = 500;
const SORT_KEYS = ['mrr', 'date', 'priority', 'stage', 'title'];
const GROUPS = ['stage', 'month', 'parent', 'owner', 'department', 'priority'];
const DATE_FILTERS = ['30', '90', '180', 'overdue', 'none'];
const TILE_WINDOWS = ['30', '90'] as const;
const NO_DEPARTMENT = 'none';
const FUNCTIONS = Object.keys(FUNCTION_LABELS) as UserFunction[];
const PRIORITIES = ['high', 'medium', 'low'] as const;
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const PRIORITY_RANK = { high: 3, medium: 2, low: 1 } as const;
const EMPTY_KEYS = ['unassigned', 'none'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_VALUE = 'A date is YYYY-MM-DD, or null to clear it.';

/** Python's `int(raw)`, or null: surrounding spaces allowed, nothing else. */
export const intOrNull = (raw: string | null): number | null => (raw !== null && /^\s*[+-]?\d+\s*$/.test(raw) ? Number(raw) : null);
export const commaList = (raw: string | null) =>
  (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
/** The allowed values, in the order given, each once. */
const choices = (raw: string | null, allowed: readonly string[]) => [...new Set(commaList(raw).filter((value) => allowed.includes(value)))];
const ownerKey = (row: PipelineRow) => (row.owner === null ? 'unassigned' : row.owner.id === null ? 'outside' : String(row.owner.id));
const money = (rows: PipelineRow[]) => Math.round(rows.reduce((sum, row) => sum + row.mrr, 0) * 100) / 100;
const total = (rows: PipelineRow[]): PipelineTotal => ({ count: rows.length, mrr: money(rows) });
const inQuarter = (moment: string) => {
  const at = Date.parse(moment);
  return at >= QUARTER_SINCE && at < QUARTER_UNTIL;
};

// --- Ordering (portfolio_core.shape + pipelines_portfolio.shape) ------------

type Value = number | string;
type Rank = (Value | null | Value[] | Desc)[];

/** An orderable value compared in reverse (shape.Desc). */
class Desc {
  readonly value: Value;
  constructor(value: Value) {
    this.value = value;
  }
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Desc && b instanceof Desc) return compare(b.value, a.value);
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const order = compare(a[index], b[index]);
      if (order !== 0) return order;
    }
    return a.length - b.length;
  }
  if (a === b || a === null || b === null) return 0;
  return (a as Value) < (b as Value) ? -1 : 1;
}

function groupKey(row: PipelineRow, group: string): [string, string] {
  if (group === 'stage') return [row.stage.value, row.stage.label];
  if (group === 'month') {
    if (row.overdue) return ['overdue', 'Overdue'];
    if (!row.date.value) return ['none', 'No date'];
    const [year, month] = row.date.value.split('-');
    return [`${year}-${month}`, `${MONTHS[Number(month) - 1]} ${year}`];
  }
  if (group === 'parent') return [`${row.parent.type}:${row.parent.id}`, row.parent.name];
  if (group === 'owner') return [ownerKey(row), row.owner?.name ?? 'Unassigned'];
  if (group === 'department') return row.department.value ? [row.department.value, row.department.label || row.department.value] : ['none', 'No department'];
  return [row.priority.value, row.priority.label];
}

/** shape.section_rank: an (int, str, str) triple. */
function sectionRank(key: string, label: string, group: string, kind: PipelineKind): Value[] {
  if (group === 'stage') return [kind.stages.findIndex((stage) => stage.value === key), '', ''];
  if (group === 'priority') return [PRIORITIES.indexOf(key as (typeof PRIORITIES)[number]), '', ''];
  if (group === 'month') return key === 'overdue' ? [0, '', ''] : key === 'none' ? [2, '', ''] : [1, key, key];
  if (group === 'owner' && (key === 'outside' || key === 'unassigned')) return [key === 'outside' ? 1 : 2, '', key];
  return [EMPTY_KEYS.includes(key) ? 1 : 0, label.toLowerCase(), key];
}

function sortValue(row: PipelineRow, sortKey: string, kind: PipelineKind): Value | null {
  if (sortKey === 'mrr') return row.mrr;
  if (sortKey === 'date') return row.date.value;
  if (sortKey === 'priority') return PRIORITY_RANK[row.priority.value];
  if (sortKey === 'stage') return kind.stages.findIndex((stage) => stage.value === row.stage.value);
  return row.title.toLowerCase();
}

/** portfolio_core.rank_of: section, missing values last either way, the
 *  value (reversed when descending), then title and id. */
function rankOf(row: PipelineRow, sort: string, group: string, kind: PipelineKind): Rank {
  const section = group ? sectionRank(...groupKey(row, group), group, kind) : [];
  const descending = sort.startsWith('-');
  const value = sortValue(row, sort.replace(/^-/, ''), kind);
  const tiebreak = [row.title.toLowerCase(), row.id];
  if (value === null) return [section, 1, null, tiebreak];
  return [section, 0, descending ? new Desc(value) : value, tiebreak];
}

function groupsOf(rows: PipelineRow[], group: string, kind: PipelineKind): PipelineGroup[] {
  const found = new Map<string, { key: string; label: string; rows: PipelineRow[] }>();
  for (const row of rows) {
    const [key, label] = groupKey(row, group);
    const bucket = found.get(key) ?? { key, label, rows: [] };
    bucket.rows.push(row);
    found.set(key, bucket);
  }
  return [...found.values()]
    .sort((a, b) => compare(sectionRank(a.key, a.label, group, kind), sectionRank(b.key, b.label, group, kind)))
    .map(({ key, label, rows: inGroup }) => ({ key, label, ...total(inGroup) }));
}

// --- The book, the tiles and the filter options ------------------------------

function summarise(book: PipelineRow[], kind: PipelineKind): PipelineSummary {
  const open = book.filter((row) => row.open);
  const within = (days: number) => total(open.filter((row) => row.date.days !== null && row.date.days >= 0 && row.date.days <= days));
  return {
    items: book.length,
    mrr: money(book),
    open: total(open),
    within: { [TILE_WINDOWS[0]]: within(30), [TILE_WINDOWS[1]]: within(90) } as PipelineSummary['within'],
    overdue: total(open.filter((row) => row.overdue)),
    done_this_quarter: {
      stage: kind.doneStage,
      ...total(book.filter((row) => row.stage.value === kind.doneStage && inQuarter(row.stage_changed_at))),
    },
    stages: kind.stages.map((stage) => ({ value: stage.value, label: stage.label, ...total(book.filter((row) => row.stage.value === stage.value)) })),
  };
}

const byName = (a: Option, b: Option) => compare([a.name.toLowerCase(), Number(a.value)], [b.name.toLowerCase(), Number(b.value)]);

/** book.filter_options: from the whole book the viewer may read, never the
 *  query's rows. Owners by name, then "Not in your book", then Unassigned;
 *  departments present, in User.Function order, then "No department". */
export function pipelineFilterOptions(rows: PipelineRow[], kind: PipelineKind): PipelineFilterOptions {
  const organisations = new Map<number, string>();
  const accounts = new Map<number, string>();
  const owners = new Map<number, string>();
  const departments = new Set(rows.map((row) => row.department.value));
  for (const row of rows) {
    if (row.parent.type === 'account') accounts.set(row.parent.id, row.parent.name);
    for (const company of row.companies) organisations.set(company.id, company.name);
    if (row.owner?.id != null) owners.set(row.owner.id, row.owner.name);
  }
  const options = (found: Map<number, string>) => [...found].map(([id, name]) => ({ value: String(id), name })).sort(byName);
  return {
    organisations: options(organisations),
    accounts: options(accounts),
    owners: [
      ...[...owners].map(([id, name]) => ({ value: String(id), name })).sort((a, b) => compare(a.name.toLowerCase(), b.name.toLowerCase())),
      ...(rows.some((row) => ownerKey(row) === 'outside') ? [{ value: 'outside', name: 'Not in your book' }] : []),
      ...(rows.some((row) => row.owner === null) ? [{ value: 'unassigned', name: 'Unassigned' }] : []),
    ],
    stages: kind.stages.map((stage) => ({ value: stage.value, name: stage.label })),
    priorities: PRIORITIES.map((value) => ({ value, name: PRIORITY_LABEL[value] })),
    departments: [
      ...FUNCTIONS.filter((value) => departments.has(value)).map((value) => ({ value, name: FUNCTION_LABELS[value] })),
      ...(departments.has('') ? [{ value: NO_DEPARTMENT, name: 'No department' }] : []),
    ],
  };
}

/** The filter options of the default opportunities book (OPPORTUNITY_ROWS),
 *  without the stages: for tests of chips and the filter sheet. */
export const PIPELINE_FILTER_OPTIONS: Omit<PipelineFilterOptions, 'stages'> = {
  organisations: [
    { value: '1', name: 'Globex' },
    { value: '5', name: 'Hooli' },
    { value: '7', name: 'Pizza Hut' },
  ],
  accounts: [
    { value: '14', name: 'Initech APAC' },
    { value: '12', name: 'Pizza Hut EMEA' },
  ],
  owners: [
    { value: '2', name: 'Carl CSM' },
    { value: '3', name: 'Priya' },
    { value: 'outside', name: 'Not in your book' },
    { value: 'unassigned', name: 'Unassigned' },
  ],
  priorities: [
    { value: 'high', name: 'High' },
    { value: 'medium', name: 'Medium' },
    { value: 'low', name: 'Low' },
  ],
  departments: [
    { value: 'cs', name: 'Customer Success' },
    { value: 'sales', name: 'Sales' },
    { value: 'none', name: 'No department' },
  ],
};

/** What the backend answers for `query` over `rows` (the viewer's whole
 *  book). Unknown values are dropped. Every filter but `stage` narrows the
 *  tiles' set; `stage` (default: the open stages; every stage with `ids`)
 *  narrows the rows and groups; `group_value` narrows results and count
 *  only. `date=30|90|180` is dated today to today+N at any stage;
 *  `overdue` is open and dated before today. Rows come section first, then
 *  by `sort` (default -mrr, missing values last, ties by title then id). */
export function buildPipelinePage(kindKey: PipelineKindKey, query: URLSearchParams, rows: PipelineRow[]): PipelinePage {
  const kind = PIPELINE_KINDS[kindKey];
  const allStages = kind.stages.map((stage) => stage.value);
  const ownerRaw = query.get('owner');
  const owner = ownerRaw === 'unassigned' || ownerRaw === 'outside' ? ownerRaw : intOrNull(ownerRaw);
  const ids = query.has('ids')
    ? (query.get('ids') ?? '')
        .split(',')
        .slice(0, MAX_IDS)
        .map(intOrNull)
        .filter((id): id is number => id !== null)
    : null;
  const stagesGiven = choices(query.get('stage'), allStages);
  const stages = stagesGiven.length ? stagesGiven : ids !== null ? allStages : kind.openStages;
  const sortRaw = query.get('sort') || '-mrr';
  const sort = SORT_KEYS.includes(sortRaw.replace(/^-/, '')) ? sortRaw : '-mrr';
  const group = GROUPS.includes(query.get('group') ?? '') ? (query.get('group') as string) : '';
  const groupValue = group && query.has('group_value') ? query.get('group_value') : null;
  const limitRaw = intOrNull(query.get('limit'));
  const limit = limitRaw === null || limitRaw < 1 ? DEFAULT_LIMIT : Math.min(limitRaw, MAX_LIMIT);
  const search = (query.get('search') ?? '').trim().toLowerCase();
  const organisations = commaList(query.get('organisation')).map(intOrNull).filter((id): id is number => id !== null);
  const accounts = commaList(query.get('account')).map(intOrNull).filter((id): id is number => id !== null);
  const priorities = choices(query.get('priority'), PRIORITIES);
  const departments = choices(query.get('department'), [...FUNCTIONS, NO_DEPARTMENT]);
  const date = DATE_FILTERS.includes(query.get('date') ?? '') ? query.get('date') : null;
  const changed = query.get('changed') === 'quarter';

  const matchesDate = (row: PipelineRow) => {
    if (date === null) return true;
    if (date === 'overdue') return row.date.days !== null && row.date.days < 0 && kind.openStages.includes(row.stage.value);
    if (date === 'none') return row.date.value === null;
    return row.date.days !== null && row.date.days >= 0 && row.date.days <= Number(date);
  };
  const book = rows.filter(
    (row) =>
      (ids === null || ids.includes(row.id)) &&
      (!search || row.title.toLowerCase().includes(search) || row.parent.name.toLowerCase().includes(search)) &&
      (organisations.length === 0 ||
        (row.parent.type === 'organisation' ? organisations.includes(row.parent.id) : row.companies.some((company) => organisations.includes(company.id)))) &&
      (accounts.length === 0 || (row.parent.type === 'account' && accounts.includes(row.parent.id))) &&
      (owner === null || ownerKey(row) === String(owner)) &&
      (priorities.length === 0 || priorities.includes(row.priority.value)) &&
      (departments.length === 0 || departments.includes(row.department.value || NO_DEPARTMENT)) &&
      matchesDate(row) &&
      (!changed || inQuarter(row.stage_changed_at)),
  );
  const ordered = book
    .filter((row) => stages.includes(row.stage.value))
    .map((row) => ({ row, rank: rankOf(row, sort, group, kind) }))
    .sort((a, b) => compare(a.rank, b.rank))
    .map(({ row }) => row);
  const scoped = groupValue !== null ? ordered.filter((row) => groupKey(row, group)[0] === groupValue) : ordered;
  const cursor = intOrNull(query.get('cursor'));
  const start = cursor !== null && cursor > 0 ? cursor : 0;
  const page = scoped.slice(start, start + limit);
  return {
    kind: kindKey,
    results: page,
    next_cursor: page.length && start + page.length < scoped.length ? String(start + page.length) : null,
    count: scoped.length,
    groups: group ? groupsOf(ordered, group, kind) : [],
    summary: summarise(book, kind),
    filters: pipelineFilterOptions(rows, kind),
    currency: 'USD',
  };
}

// --- The fetch stub -----------------------------------------------------------

export interface PipelinesStub {
  /** The books the default answers read, copied (default OPPORTUNITY_ROWS / RISK_ROWS). */
  opportunities?: PipelineRow[];
  risks?: PipelineRow[];
  /** Answer GET /pipelines/<kind>/ yourself; return `{status, body}` for an error. */
  pipeline?: (kind: PipelineKindKey, query: URLSearchParams) => PipelinePage | { status: number; body: unknown };
  /** Answer a valid POST /pipelines/<kind>/bulk/ yourself: a result, or
   *  `{status, body}` for an error (a 500's HTML page reads as body null). */
  bulk?: (kind: PipelineKindKey, body: PipelineBulkRequest) => BulkResult | { status: number; body: unknown };
  /** Answer GET /pipelines/<kind>/export.csv with an error `{status, body}`;
   *  return null for the default CSV. */
  exportCsv?: (kind: PipelineKindKey, query: URLSearchParams) => { status: number; body: unknown } | null;
  /** Answer PATCH /opportunities/<id>/ or /risks/<id>/ yourself (a failure, say). */
  patch?: (kind: PipelineKindKey, id: number, body: Record<string, unknown>) => { status: number; body: unknown };
}

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

const dateKey = (kind: PipelineKindKey) => (kind === 'opportunities' ? 'expected_close' : 'due_by');
const record = (kind: PipelineKindKey, row: PipelineRow) => (kind === 'opportunities' ? opportunityRecord(row) : riskRecord(row));

/** A PATCH or bulk write applied to a row, as the backend would store it:
 *  a changed stage restamps `stage_changed_at` (StageClockMixin). */
function applyEdit(row: PipelineRow, kindKey: PipelineKindKey, body: Record<string, unknown>): PipelineRow {
  const kind = PIPELINE_KINDS[kindKey];
  let next = row;
  if (typeof body.title === 'string') next = { ...next, title: body.title };
  if (typeof body.mrr === 'string' || typeof body.mrr === 'number') next = { ...next, mrr: Number(body.mrr) };
  if (typeof body.priority === 'string') {
    const priority = body.priority as PipelineRow['priority']['value'];
    next = { ...next, priority: { value: priority, label: PRIORITY_LABEL[priority] } };
  }
  if (typeof body.department === 'string') {
    const department = body.department as UserFunction | '';
    next = { ...next, department: { value: department, label: department ? FUNCTION_LABELS[department] : '' } };
  }
  if (dateKey(kindKey) in body) {
    const value = (body[dateKey(kindKey)] as string | null) ?? null;
    next = { ...next, date: { value, days: value === null ? null : daysFrom(value, STUB_TODAY) } };
  }
  const stage = typeof body.stage === 'string' ? body.stage : next.stage.value;
  if (stage !== row.stage.value) next = { ...next, stage_changed_at: STUB_NOW };
  return rowWithStage(next, stage, kind);
}

const BULK_FIELD: Record<PipelineBulkRequest['action'], (kind: PipelineKindKey) => string> = {
  set_stage: () => 'stage',
  set_priority: () => 'priority',
  set_department: () => 'department',
  set_date: dateKey,
};

const isDate = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** serializers.BulkRequestSerializer: the 400 the backend answers, or null. */
function bulkError(kindKey: PipelineKindKey, body: Record<string, unknown>): Record<string, string[]> | null {
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_IDS || !ids.every((id) => Number.isInteger(id) && id >= 1)) {
    return { ids: ['A list of 1 to 500 ids, each a positive integer.'] };
  }
  const action = body.action as string;
  if (!(action in BULK_FIELD)) return { action: [`"${String(action)}" is not a valid choice.`] };
  const value = body.value;
  const allowed: Record<string, [readonly string[], string]> = {
    set_stage: [PIPELINE_KINDS[kindKey].stages.map((stage) => stage.value), 'Not a stage.'],
    set_priority: [PRIORITIES, 'Not a priority.'],
    set_department: [['', ...FUNCTIONS], 'Not a department.'],
  };
  if (action in allowed) {
    const [values, message] = allowed[action];
    if (typeof value !== 'string' || !values.includes(value)) return { value: [message] };
  }
  if (action === 'set_date' && (!('value' in body) || (value !== null && !isDate(value)))) return { value: [DATE_VALUE] };
  return null;
}

/** Where a new item lands: its parent as the book already names it, so it
 *  reads with that parent's owner and openable organisations. */
function parentOf(books: Record<PipelineKindKey, PipelineRow[]>, type: 'organisation' | 'account', id: number) {
  const known = [...books.opportunities, ...books.risks].find((row) => row.parent.type === type && row.parent.id === id);
  if (known) return { parent: known.parent, companies: known.companies, owner: known.owner };
  const name = (type === 'organisation' ? PICKER_ORGANISATIONS : PICKER_ACCOUNTS).find((parent) => parent.id === id)?.name ?? `${type === 'organisation' ? 'Organization' : 'Account'} ${id}`;
  return { parent: { type, id, name }, companies: type === 'organisation' ? [{ id, name }] : [], owner: null };
}

/** The organisations and accounts the viewer may open, as the Add
 *  picker's searches list them (a Customer's and an Account's fields that
 *  the picker reads; the real rows carry more). */
export const PICKER_ORGANISATIONS = [
  { id: 7, name: 'Pizza Hut' },
  { id: 1, name: 'Globex' },
];
export const PICKER_ACCOUNTS = [
  { id: 12, name: 'Pizza Hut EMEA', customers: [{ id: 7, name: 'Pizza Hut' }] },
  { id: 14, name: 'Initech APAC', customers: [] },
];

/** DRF's PageNumberPagination (PAGE_SIZE 25) over a `?search=` on the name. */
function searchPage<T extends { name: string }>(rows: T[], query: URLSearchParams) {
  const search = (query.get('search') ?? '').trim().toLowerCase();
  const results = rows.filter((row) => row.name.toLowerCase().includes(search));
  return { count: results.length, next: null, previous: null, results: results.slice(0, 25) };
}

export function stubPipelines(stub: PipelinesStub = {}) {
  const books: Record<PipelineKindKey, PipelineRow[]> = {
    opportunities: [...(stub.opportunities ?? OPPORTUNITY_ROWS)],
    risks: [...(stub.risks ?? RISK_ROWS)],
  };
  /** POST of a new item on its parent, as the backend stores it. */
  const createItem = (kind: PipelineKindKey, type: 'organisation' | 'account', parentId: number, body: Record<string, unknown>) => {
    const id = Math.max(0, ...books.opportunities.map((row) => row.id), ...books.risks.map((row) => row.id)) + 1;
    const where = parentOf(books, type, parentId);
    const first = PIPELINE_KINDS[kind].stages[0];
    const row = applyEdit(
      {
        ...where,
        id,
        kind: PIPELINE_KINDS[kind].item,
        title: '',
        mrr: 0,
        stage: { value: first.value, label: first.label },
        priority: { value: 'medium', label: 'Medium' },
        department: { value: '', label: '' },
        date: { value: null, days: null },
        open: true,
        overdue: false,
        signal: null,
        stage_changed_at: STUB_NOW,
        created_at: STUB_NOW,
      },
      kind,
      body,
    );
    books[kind].push(row);
    return json(201, record(kind, row));
  };
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    const book = /^\/pipelines\/(opportunities|risks)\/$/.exec(path);
    if (book) {
      const kind = book[1] as PipelineKindKey;
      const out = (stub.pipeline ?? ((k: PipelineKindKey, q: URLSearchParams) => buildPipelinePage(k, q, books[k])))(kind, url.searchParams);
      return 'results' in out ? json(200, out) : json(out.status, out.body);
    }
    const exported = /^\/pipelines\/(opportunities|risks)\/export\.csv$/.exec(path);
    if (exported) {
      const failure = stub.exportCsv?.(exported[1] as PipelineKindKey, url.searchParams) ?? null;
      if (failure) return json(failure.status, failure.body);
      return { ok: true, status: 200, json: async () => null, blob: async () => new Blob(['Title,Revenact ID\nEMEA seats,41\n'], { type: 'text/csv' }) };
    }
    const bulk = /^\/pipelines\/(opportunities|risks)\/bulk\/$/.exec(path);
    if (bulk && method === 'POST') {
      const kind = bulk[1] as PipelineKindKey;
      const error = bulkError(kind, body);
      if (error) return json(400, error);
      const request = body as unknown as PipelineBulkRequest;
      if (stub.bulk) {
        const out = stub.bulk(kind, request);
        return 'updated' in out ? json(200, out) : json(out.status, out.body);
      }
      const result: BulkResult = { updated: [], failed: [] };
      for (const id of [...new Set(request.ids)]) {
        const index = books[kind].findIndex((row) => row.id === id);
        if (index < 0) result.failed.push({ id, reason: 'Not found.' });
        else {
          books[kind][index] = applyEdit(books[kind][index], kind, { [BULK_FIELD[request.action](kind)]: request.value });
          result.updated.push(id);
        }
      }
      return json(200, result);
    }
    const item = /^\/(opportunities|risks)\/(\d+)\/$/.exec(path);
    if (item) {
      const kind = item[1] as PipelineKindKey;
      const id = Number(item[2]);
      const index = books[kind].findIndex((row) => row.id === id);
      if (method === 'PATCH' && stub.patch) {
        const out = stub.patch(kind, id, body);
        return json(out.status, out.body);
      }
      if (index < 0) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        books[kind].splice(index, 1);
        return json(204, null);
      }
      if (method === 'PATCH') books[kind][index] = applyEdit(books[kind][index], kind, body);
      return json(200, record(kind, books[kind][index]));
    }
    const create = /^\/(opportunities|risks)\/$/.exec(path);
    if (create && method === 'POST') {
      const onAccount = body.account_id !== undefined && body.account_id !== null;
      return createItem(create[1] as PipelineKindKey, onAccount ? 'account' : 'organisation', Number(onAccount ? body.account_id : body.customer_id), body);
    }
    // The forms' scoped creates: an organisation's (/customers/<id>/…), one
    // of its accounts' (/customers/<id>/accounts/<id>/…), and an account's
    // own flat route (/accounts/<id>/…); the parent comes from the URL.
    const nested = /^\/customers\/(\d+)\/(?:accounts\/(\d+)\/)?(opportunities|risks)\/$/.exec(path);
    if (nested && method === 'POST') {
      const kind = nested[3] as PipelineKindKey;
      return nested[2] ? createItem(kind, 'account', Number(nested[2]), body) : createItem(kind, 'organisation', Number(nested[1]), body);
    }
    const flat = /^\/accounts\/(\d+)\/(opportunities|risks)\/$/.exec(path);
    if (flat && method === 'POST') return createItem(flat[2] as PipelineKindKey, 'account', Number(flat[1]), body);
    // The Add picker's searches: CustomerListCreateView and AccountListView,
    // `?search=` a case-insensitive substring of the name, paginated.
    if (path === '/customers/' && method === 'GET') return json(200, searchPage(PICKER_ORGANISATIONS, url.searchParams));
    if (path === '/accounts/' && method === 'GET') return json(200, searchPage(PICKER_ACCOUNTS, url.searchParams));
    // The form's optional Account picker: one organisation's accounts, unpaginated.
    const accountsOf = /^\/customers\/(\d+)\/accounts\/$/.exec(path);
    if (accountsOf) return json(200, PICKER_ACCOUNTS.filter((account) => account.customers.some((org) => org.id === Number(accountsOf[1]))));
    return json(404, { detail: `Not stubbed: ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type FetchSpy = ReturnType<typeof stubPipelines>;

/** Every GET /pipelines/<kind>/ so far, as parsed query strings, oldest first. */
export function pipelineQueries(spy: FetchSpy, kind: PipelineKindKey): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith(`/pipelines/${kind}/`))
    .map((url) => url.searchParams);
}

export function pipelineBulkBodies(spy: FetchSpy, kind: PipelineKindKey): PipelineBulkRequest[] {
  return spy.mock.calls
    .filter(([input, init]) => String(input).endsWith(`/pipelines/${kind}/bulk/`) && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as PipelineBulkRequest);
}

/** An item's own routes, and the forms' scoped creates under an
 *  organisation or an account. */
const WRITE_PATH = /^\/(?:customers\/\d+\/(?:accounts\/\d+\/)?|accounts\/\d+\/)?(opportunities|risks)\//;

/** Every POST, PATCH or DELETE to an opportunity or risk route so far, oldest first. */
export function recordWrites(spy: FetchSpy): { method: string; path: string; body: Record<string, unknown> | null }[] {
  return spy.mock.calls
    .map(([input, init]) => ({ path: new URL(String(input)).pathname.replace(/^\/api\/v1/, ''), init }))
    .filter(({ path, init }) => init?.method !== undefined && init.method !== 'GET' && WRITE_PATH.test(path))
    .map(({ path, init }) => ({
      method: String(init?.method),
      path,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    }));
}

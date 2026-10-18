import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { FUNCTION_LABELS, type UserFunction } from '../../../features/auth/authSlice';
import { NO_DEPARTMENT, PIPELINE_KINDS, PRIORITY_CHOICES } from '../../../features/pipelines/pipelineKinds';
import type { PipelineKindKey, PipelineRow } from '../../../features/pipelines/pipelineTypes';
import {
  MAX_IDS,
  OPPORTUNITY_ROWS,
  PICKER_ACCOUNTS,
  PICKER_ORGANISATIONS,
  RISK_ROWS,
  commaList,
  intOrNull,
  pipelineFilterOptions,
  stubPipelines,
  type PipelinesStub,
} from '../../../features/pipelines/testPipelines';

// --- The server's label (revenact-backend services/copilot/pipelines_context.py)

/** portfolio_context.UNKNOWN: an organisation or account nobody may name. */
const UNKNOWN = 'not in your book';
const NOT_IN_BOOK = 'Not in your book';
const DATE_LABELS: Record<PipelineKindKey, { overdue: string; none: string; within: string }> = {
  opportunities: { overdue: 'Overdue', none: 'No close date', within: 'Closes within {} days' },
  risks: { overdue: 'Overdue', none: 'No due date', within: 'Due within {} days' },
};
const DATE_FILTERS = ['30', '90', '180', 'overdue', 'none'];
const DEPARTMENTS = [...Object.keys(FUNCTION_LABELS), NO_DEPARTMENT];

const isInt = (id: number | null): id is number => id !== null;
/** canonical()'s ids: each once, in the order given (`_joined`). */
const ints = (raw: string | undefined) => [...new Set(commaList(raw ?? null).map(intOrNull).filter(isInt))];
/** params._choices: the allowed values, in the order given, each once. */
const choices = (raw: string | undefined, allowed: readonly string[]) => [...new Set(commaList(raw ?? null).filter((value) => allowed.includes(value)))];
const sameSet = (a: string[], b: string[]) => new Set(a).size === new Set(b).size && a.every((value) => b.includes(value));

/** Test-only. The `label` the server stores on a Pipelines context, built as
 *  `filter_labels` + `list_label` build it, in the server's order and words:
 *  Chosen, Search (quoted), Organisation, Account, Owner, Stage (only when not
 *  the view's default), Priority, Department, date, changed; multi-value
 *  filters joined with ", ". `books` is the viewer's whole book per kind: an
 *  owner is named from the asked kind's book (`book.filter_options`), an
 *  organisation or account from anything the viewer may open (both books and
 *  the Add picker's lists); anything else reads as the server's
 *  placeholders. */
export function pipelinesServerLabel(context: Record<string, unknown>, books: Record<PipelineKindKey, PipelineRow[]>): string {
  const kindKey: PipelineKindKey = context.kind === 'risks' ? 'risks' : 'opportunities';
  const kind = PIPELINE_KINDS[kindKey];
  const filters = (context.filters ?? {}) as Record<string, string | undefined>;
  const allStages = kind.stages.map((stage) => stage.value);
  const ids = 'ids' in filters ? (filters.ids ?? '').split(',').slice(0, MAX_IDS).map(intOrNull).filter(isInt) : null;
  const named = choices(filters.stage, allStages);
  const defaults = ids !== null || context.view === 'board' ? allStages : kind.openStages;
  const stages = named.length ? named : defaults;

  const rows = [...books.opportunities, ...books.risks];
  const organisations = new Map<number, string>(PICKER_ORGANISATIONS.map((org) => [org.id, org.name]));
  const accounts = new Map<number, string>(PICKER_ACCOUNTS.map((account) => [account.id, account.name]));
  for (const row of rows) {
    if (row.parent.type === 'organisation') organisations.set(row.parent.id, row.parent.name);
    else accounts.set(row.parent.id, row.parent.name);
    for (const company of row.companies) organisations.set(company.id, company.name);
  }
  const owners = pipelineFilterOptions(books[kindKey], kind).owners;

  const labels: string[] = [];
  if (ids !== null) labels.push(`Chosen ${kindKey} (${new Set(ids).size})`);
  const search = (filters.search ?? '').trim();
  if (search) labels.push(`Search: "${search}"`);
  const orgIds = ints(filters.organisation);
  if (orgIds.length) labels.push(`Organisation: ${orgIds.map((id) => organisations.get(id) ?? UNKNOWN).join(', ')}`);
  const accountIds = ints(filters.account);
  if (accountIds.length) labels.push(`Account: ${accountIds.map((id) => accounts.get(id) ?? UNKNOWN).join(', ')}`);
  // _owner_label: the two buckets read as themselves; a person is named
  // only from the asked kind's book.
  const ownerId = intOrNull(filters.owner ?? null);
  if (filters.owner === 'unassigned') labels.push('Owner: Unassigned');
  else if (filters.owner === 'outside') labels.push(`Owner: ${NOT_IN_BOOK}`);
  else if (ownerId !== null) labels.push(`Owner: ${owners.find((option) => option.value === String(ownerId))?.name ?? NOT_IN_BOOK}`);
  if (!sameSet(stages, defaults)) labels.push(`Stage: ${stages.map((value) => kind.stages.find((stage) => stage.value === value)!.label).join(', ')}`);
  const priorities = choices(
    filters.priority,
    PRIORITY_CHOICES.map((choice) => choice.value),
  );
  if (priorities.length) labels.push(`Priority: ${priorities.map((value) => PRIORITY_CHOICES.find((choice) => choice.value === value)!.name).join(', ')}`);
  const departments = choices(filters.department, DEPARTMENTS);
  if (departments.length) {
    labels.push(`Department: ${departments.map((value) => (value === NO_DEPARTMENT ? 'No department' : FUNCTION_LABELS[value as UserFunction])).join(', ')}`);
  }
  if (filters.date && DATE_FILTERS.includes(filters.date)) {
    const words = DATE_LABELS[kindKey];
    labels.push(filters.date === 'overdue' || filters.date === 'none' ? words[filters.date] : words.within.replace('{}', filters.date));
  }
  if (filters.changed === 'quarter') labels.push('Stage changed this quarter');
  return ['Pipelines', kind.title, ...labels].join(' · ');
}

/** Test-only. The Pipelines book (stubPipelines) and the Copilot
 *  (stubCopilot) behind one fetch, so the page and its rail both answer.
 *  `copilot` is the spy postedBodies reads; `pipelines` is stubPipelines'
 *  own spy (pipelineQueries, recordWrites). As the real server always does,
 *  a sent context is stored with a server-shaped `label`
 *  (`pipelinesServerLabel` over the stub's starting books) unless the test
 *  passes its own `copilot.label`. */
export function stubPipelinesAsk(options: { copilot?: Parameters<typeof stubCopilot>[0]; pipelines?: PipelinesStub } = {}) {
  const books = {
    opportunities: options.pipelines?.opportunities ?? OPPORTUNITY_ROWS,
    risks: options.pipelines?.risks ?? RISK_ROWS,
  };
  const copilot = stubCopilot({ label: (context) => pipelinesServerLabel(context, books), ...options.copilot });
  const pipelines = stubPipelines(options.pipelines);
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? copilot.spy(String(input), init) : pipelines(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { copilot: copilot.spy, pipelines, release: copilot.release };
}

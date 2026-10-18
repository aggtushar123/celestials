import { stageLabel, type PipelineKind, NO_DEPARTMENT } from './pipelineKinds';
import type { DateFilter, PipelineParams } from './pipelineParams';
import type { PipelineFilterOptions } from './pipelineTypes';
import type { Option } from '../organizations/portfolioTypes';

export interface PipelineChip {
  key: string;
  label: string;
  /** What removing this chip writes to the URL. */
  patch: Partial<PipelineParams>;
}

const nameIn = (options: Option[] | undefined, value: string) => options?.find((option) => option.value === value)?.name;
const OWNER_BUCKETS: Record<string, string> = { unassigned: 'Unassigned', outside: 'Not in your book' };
const PRIORITY: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** "Closes within 30 days" / "Due within 30 days", "Overdue", "No date". */
export function dateFilterLabel(kind: PipelineKind, date: DateFilter): string {
  if (date === 'overdue') return 'Overdue';
  if (date === 'none') return 'No date';
  return `${kind.dateVerb} within ${date} days`;
}

/** One removable chip per active filter, in a fixed order (spec §1). */
export function pipelineChips(p: PipelineParams, options: PipelineFilterOptions | null, kind: PipelineKind): PipelineChip[] {
  const chips: PipelineChip[] = [];
  if (p.ids.length) chips.push({ key: 'ids', label: `Chosen items (${p.ids.length})`, patch: { ids: [] } });
  if (p.search) chips.push({ key: 'search', label: `Search: ${p.search}`, patch: { search: '' } });
  if (p.owner) {
    const name = OWNER_BUCKETS[p.owner] ?? nameIn(options?.owners, p.owner) ?? `User ${p.owner}`;
    chips.push({ key: 'owner', label: `Owner: ${name}`, patch: { owner: '' } });
  }
  for (const id of p.organisation) {
    const name = nameIn(options?.organisations, id) ?? `Organization ${id}`;
    chips.push({ key: `organisation:${id}`, label: `Organization: ${name}`, patch: { organisation: p.organisation.filter((v) => v !== id) } });
  }
  for (const id of p.account) {
    const name = nameIn(options?.accounts, id) ?? `Account ${id}`;
    chips.push({ key: `account:${id}`, label: `Account: ${name}`, patch: { account: p.account.filter((v) => v !== id) } });
  }
  for (const stage of p.stage) {
    chips.push({ key: `stage:${stage}`, label: `Stage: ${stageLabel(kind, stage)}`, patch: { stage: p.stage.filter((v) => v !== stage) } });
  }
  if (p.changed) chips.push({ key: 'changed', label: 'Stage changed this quarter', patch: { changed: '' } });
  for (const priority of p.priority) {
    chips.push({ key: `priority:${priority}`, label: `Priority: ${PRIORITY[priority]}`, patch: { priority: p.priority.filter((v) => v !== priority) } });
  }
  for (const department of p.department) {
    const name = department === NO_DEPARTMENT ? 'Whole company' : (nameIn(options?.departments, department) ?? department);
    chips.push({ key: `department:${department}`, label: `Department: ${name}`, patch: { department: p.department.filter((v) => v !== department) } });
  }
  if (p.date) chips.push({ key: 'date', label: dateFilterLabel(kind, p.date), patch: { date: '' } });
  return chips;
}

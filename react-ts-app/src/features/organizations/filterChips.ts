import { LIFECYCLE_LABELS } from '../customers/formatters';
import type { PortfolioParams } from './portfolioParams';
import { HEALTH_LABEL, NPS_LABEL, ORGANIZATION_NOUN, capitalise, type PortfolioNoun } from './portfolioLabels';
import type { FilterOptions, Option } from './portfolioTypes';

export interface Chip {
  key: string;
  label: string;
  /** What removing this chip writes to the URL. */
  patch: Partial<PortfolioParams>;
}

const nameIn = (list: Option[] | undefined, value: string) => list?.find((o) => o.value === value)?.name;

/** One removable chip per active filter (spec §1), in a fixed order. */
export function filterChips(p: PortfolioParams, options: FilterOptions | null): Chip[] {
  const chips: Chip[] = [];
  if (p.ids.length) chips.push({ key: 'ids', label: `Opened from the dashboard (${p.ids.length})`, patch: { ids: [] } });
  if (p.search) chips.push({ key: 'search', label: `Search: ${p.search}`, patch: { search: '' } });
  if (p.owner) {
    const name = p.owner === 'unassigned' ? 'Unassigned' : (nameIn(options?.owners, p.owner) ?? `User ${p.owner}`);
    chips.push({ key: 'owner', label: `Owner: ${name}`, patch: { owner: '' } });
  }
  const organisations = p.organisation ?? [];
  for (const id of organisations) {
    const name = nameIn(options?.organisations, id) ?? `Organization ${id}`;
    chips.push({ key: `organisation:${id}`, label: `Organization: ${name}`, patch: { organisation: organisations.filter((v) => v !== id) } });
  }
  for (const stage of p.lifecycle) {
    const name = nameIn(options?.lifecycles, stage) ?? LIFECYCLE_LABELS[stage];
    chips.push({ key: `lifecycle:${stage}`, label: `Lifecycle: ${name}`, patch: { lifecycle: p.lifecycle.filter((s) => s !== stage) } });
  }
  for (const band of p.health) {
    chips.push({ key: `health:${band}`, label: `Health: ${HEALTH_LABEL[band]}`, patch: { health: p.health.filter((b) => b !== band) } });
  }
  for (const product of p.product) {
    const name = nameIn(options?.products, product) ?? `Product ${product}`;
    chips.push({ key: `product:${product}`, label: `Product: ${name}`, patch: { product: p.product.filter((v) => v !== product) } });
  }
  if (p.renews_within) chips.push({ key: 'renews', label: `Renews within ${p.renews_within} days`, patch: { renews_within: '' } });
  if (p.nps) chips.push({ key: 'nps', label: `NPS: ${NPS_LABEL[p.nps]}`, patch: { nps: '' } });
  if (p.include_churned) chips.push({ key: 'churned', label: 'Includes churned', patch: { include_churned: false } });
  return chips;
}

export function countText(
  count: number | null,
  total: number | null,
  filtered: boolean,
  failed = false,
  noun: PortfolioNoun = ORGANIZATION_NOUN,
): string {
  if (count == null) return failed ? `${capitalise(noun.many)} unavailable` : `Loading ${noun.many}…`;
  if (filtered && total != null) return `${count} of ${total} ${noun.many}`;
  return `${count} ${count === 1 ? noun.one : noun.many}`;
}

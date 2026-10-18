import type { ToolbarFilter } from './DashboardToolbar';

type Opt = { value: string; name: string };

const choices = (list: Opt[] | undefined) => [
  { value: '', label: 'All' },
  ...(list ?? []).map((option) => ({ value: option.value, label: option.name })),
];

/** Owner, Lifecycle and Account: the three filters every book-level view
 *  offers, with options from that view's own response. */
export function bookFilters(options?: { owners?: Opt[]; lifecycles?: Opt[]; customers?: Opt[] }): ToolbarFilter[] {
  return [
    { key: 'owner', label: 'Primary Owner', options: choices(options?.owners) },
    { key: 'lifecycle', label: 'Lifecycle Stage', options: choices(options?.lifecycles) },
    { key: 'customer', label: 'Account', options: choices(options?.customers) },
  ];
}

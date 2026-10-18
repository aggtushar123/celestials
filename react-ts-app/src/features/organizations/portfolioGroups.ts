import type { GroupKey } from './portfolioTypes';

// The Group choices, moved here from FiltersPanel.tsx so a portfolio kind
// (a plain module) can name them without importing a component.

export interface GroupOption {
  value: GroupKey | 'none';
  label: string;
}

export const GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: 'None' },
  { value: 'health', label: 'Health' },
  { value: 'owner', label: 'Owner' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'product', label: 'Product' },
  { value: 'renewal', label: 'Renewal window' },
];

/** The Board always has columns, so it offers no "None". */
export const BOARD_GROUP_OPTIONS: GroupOption[] = GROUP_OPTIONS.filter((option) => option.value !== 'none');

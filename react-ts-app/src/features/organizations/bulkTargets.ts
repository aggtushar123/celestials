import type { User } from '../auth/authSlice';
import { LIFECYCLE_LABELS } from '../customers/formatters';
import { LIFECYCLE_VALUES } from './portfolioParams';
import type { Option } from './portfolioTypes';

// What a bulk edit can write, as opposed to what the list can be filtered
// by: the filter lists only name owners and stages already in use, so they
// would hide a new CSM, an unused stage and "Unassigned" in a fully
// assigned book.

/** Every stage but churn (churn has its own modal, one account at a time). */
export const LIFECYCLE_TARGETS: Option[] = LIFECYCLE_VALUES.filter((value) => value !== 'churn').map((value) => ({
  value,
  name: LIFECYCLE_LABELS[value],
}));

/** "Unassigned" (sent as null) first, then every active member of the org:
 *  the backend refuses inactive users as owners. */
export function ownerTargets(members: Pick<User, 'id' | 'name' | 'is_active'>[]): Option[] {
  return [
    { value: 'unassigned', name: 'Unassigned' },
    ...members.filter((member) => member.is_active !== false).map((member) => ({ value: String(member.id), name: member.name })),
  ];
}

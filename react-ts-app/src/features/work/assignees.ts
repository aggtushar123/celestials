import { cantOpenText } from './workText';
import type { AssigneeOption, ParentKind, TaskPerson } from './workTypes';

export interface PickerOption {
  id: number;
  label: string;
  disabled: boolean;
}

/** The picker's options for a record of `kind` (spec §1.5): everyone, those
 *  who can't open it disabled and saying so. A `current` assignee the list
 *  does not hold (deactivated, or still loading) leads, disabled. */
export function assigneeOptions(people: AssigneeOption[], kind: ParentKind, current: TaskPerson | null = null): PickerOption[] {
  const options = people.map((person) => ({
    id: person.id,
    label: person.can_open ? person.name : `${person.name} · ${cantOpenText(kind)}`,
    disabled: !person.can_open,
  }));
  if (current && !people.some((person) => person.id === current.id)) {
    options.unshift({ id: current.id, label: current.active ? current.name : `${current.name} (no longer active)`, disabled: true });
  }
  return options;
}

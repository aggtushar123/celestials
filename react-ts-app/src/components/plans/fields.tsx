import { PRIORITIES, PRIORITY_LABEL } from '../../features/plans/planOptions';
import type { PersonRef, Priority } from '../../features/plans/planTypes';
import { Select } from '../ui';

/** What `Field` hands its control. */
export type Aria = { 'aria-describedby'?: string; 'aria-invalid': boolean };

/** The name a chosen person the active list does not hold reads under:
 *  their own name when it is `known` (a task's assignee, the plan's owner),
 *  and, once the list has loaded, that they are no longer active. */
function missingName(value: number, people: PersonRef[], known: PersonRef[]): string {
  const name = known.find((person) => person.id === value)?.name;
  if (people.length === 0) return name ?? 'Loading teammates';
  return name ? `${name} (no longer active)` : 'No longer active';
}

/** Active teammates; a chosen person the list does not hold (the members
 *  still loading, or someone deactivated) stays chosen, named if known. */
export function PersonSelect({ id, aria, value, people, known = [], onChange }: {
  id: string;
  aria: Aria;
  value: number;
  people: PersonRef[];
  known?: PersonRef[];
  onChange: (id: number) => void;
}) {
  const options = people.some((person) => person.id === value) ? people : [{ id: value, name: missingName(value, people, known) }, ...people];
  return (
    <Select
      id={id}
      label="Person"
      labelPosition="external"
      invalid={aria['aria-invalid']}
      describedBy={aria['aria-describedby']}
      value={String(value)}
      onChange={(next) => onChange(Number(next))}
      options={options.map((person) => ({ value: String(person.id), label: person.name }))}
    />
  );
}

export function PrioritySelect({ id, aria, value, onChange }: { id: string; aria: Aria; value: Priority; onChange: (priority: Priority) => void }) {
  return (
    <Select
      id={id}
      label="Priority"
      labelPosition="external"
      invalid={aria['aria-invalid']}
      describedBy={aria['aria-describedby']}
      value={value}
      onChange={onChange}
      options={PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_LABEL[priority] }))}
    />
  );
}

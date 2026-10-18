import type { PickerOption } from '../../features/work/assignees';
import { CONTROL } from '../organizations/activity/formStyles';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';

const PANEL_SELECT = `${FILTER_SELECT} w-full aria-disabled:opacity-50`;

/** Who does it (spec §1.5). `size="form"` matches the create forms' controls
 *  (15px on phones); the panel uses the 13px select. `meOption` leads with
 *  "Assign to me", which answers null (the server's default: the caller). */
export function AssigneeSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  busy = false,
  meOption = false,
  size = 'panel',
  aria,
}: {
  id: string;
  value: number | null;
  options: PickerOption[];
  onChange: (id: number | null) => void;
  disabled?: boolean;
  /** A write is running: marked aria-disabled, not disabled, so focus stays. */
  busy?: boolean;
  meOption?: boolean;
  size?: 'form' | 'panel';
  aria?: { 'aria-describedby'?: string; 'aria-invalid': boolean };
}) {
  const invalid = aria?.['aria-invalid'] ?? false;
  return (
    <select
      id={id}
      {...aria}
      value={value === null ? '' : String(value)}
      disabled={disabled}
      aria-disabled={busy || undefined}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      className={`${size === 'form' ? CONTROL : PANEL_SELECT} ${invalid ? 'border-danger' : ''}`}
    >
      {meOption ? <option value="">Assign to me</option> : null}
      {!meOption && value === null ? (
        <option value="" disabled>
          Nobody yet
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

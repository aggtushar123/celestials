import type { ColumnId } from '../../components/organizations/tableData';
import { PINNABLE_FIELDS } from './portfolioFields';

/** Up to three fields shown as chips on every row, remembered per user in
 *  this browser (spec §1 "Pin a field"). Storage can be off (private
 *  windows, blocked site data): then pins last for the visit only. */
export const MAX_PINS = 3;

const PINNABLE = new Set<string>(PINNABLE_FIELDS.map((f) => f.id));
const key = (userId: number | null) => `revenact.organizations.pins.${userId ?? 'anon'}`;

export function readPins(userId: number | null): ColumnId[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is ColumnId => typeof id === 'string' && PINNABLE.has(id))
      .slice(0, MAX_PINS);
  } catch {
    return [];
  }
}

export function writePins(userId: number | null, pins: ColumnId[]): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(pins.slice(0, MAX_PINS)));
  } catch {
    // Storage is off: the pins still apply for this visit.
  }
}

export function togglePin(pins: ColumnId[], id: ColumnId): ColumnId[] {
  if (pins.includes(id)) return pins.filter((pin) => pin !== id);
  return pins.length < MAX_PINS ? [...pins, id] : pins;
}

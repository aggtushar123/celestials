import { toCsv } from '../../lib/csv';
import { attributeDescription, attributeProperties, usagePercent } from './attributeConfig';
import type { AttributeDef, AttributeType } from './attributeConfig';

export type UsageFilter = 'filled' | 'empty';

export interface AttributeFilters {
  types: AttributeType[];
  usage: UsageFilter[];
}

export const NO_ATTRIBUTE_FILTERS: AttributeFilters = { types: [], usage: [] };

export function activeFilterCount(filters: AttributeFilters): number {
  return filters.types.length + filters.usage.length;
}

/** Client-side, over the rows already on screen (settings spec 2026-10-06
 *  §3.3). No type ticked means any type; "Has values" is usage above 0,
 *  "Empty" usage of 0, and both or neither means any usage. */
export function applyAttributeFilters<T>(attributes: AttributeDef<T>[], entities: T[], filters: AttributeFilters): AttributeDef<T>[] {
  return attributes.filter((attr) => {
    if (filters.types.length > 0 && !filters.types.includes(attr.type)) return false;
    if (filters.usage.length === 0) return true;
    const usage = usagePercent(attr, entities);
    return (filters.usage.includes('filled') && usage > 0) || (filters.usage.includes('empty') && usage === 0);
  });
}

export const ATTRIBUTE_CSV_HEADER = ['Display name', 'Name', 'Description', 'Type', 'Properties', 'Usage %'];

export function attributesCsv<T>(attributes: AttributeDef<T>[], entities: T[]): string {
  return toCsv([
    ATTRIBUTE_CSV_HEADER,
    ...attributes.map((attr) => [
      attr.displayName,
      attr.name,
      attributeDescription(attr),
      attr.type,
      attributeProperties(attr).join('; '),
      usagePercent(attr, entities),
    ]),
  ]);
}

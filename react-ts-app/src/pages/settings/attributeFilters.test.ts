import { describe, expect, it } from 'vitest';
import { NO_ATTRIBUTE_FILTERS, activeFilterCount, applyAttributeFilters, attributesCsv } from './attributeFilters';
import { ATTRS, CSV_HEADER, CSV_NAME, CSV_NOTE, CSV_SEATS, ROWS } from './testAttributes';

const names = (list: { displayName: string }[]) => list.map((attr) => attr.displayName);

describe('applyAttributeFilters (settings spec 2026-10-06 §3.3)', () => {
  it('keeps everything with no filter', () => {
    expect(names(applyAttributeFilters(ATTRS, ROWS, NO_ATTRIBUTE_FILTERS))).toEqual(['Name', 'Note, "quoted"', 'Seats']);
  });

  it('narrows by type', () => {
    expect(names(applyAttributeFilters(ATTRS, ROWS, { types: ['number'], usage: [] }))).toEqual(['Seats']);
  });

  it('"Has values" keeps usage above 0 and "Empty" keeps usage of 0', () => {
    expect(names(applyAttributeFilters(ATTRS, ROWS, { types: [], usage: ['filled'] }))).toEqual(['Name', 'Note, "quoted"']);
    expect(names(applyAttributeFilters(ATTRS, ROWS, { types: [], usage: ['empty'] }))).toEqual(['Seats']);
    expect(names(applyAttributeFilters(ATTRS, ROWS, { types: [], usage: ['filled', 'empty'] }))).toHaveLength(3);
  });

  it('combines type and usage', () => {
    expect(applyAttributeFilters(ATTRS, ROWS, { types: ['text'], usage: ['empty'] })).toEqual([]);
  });
});

describe('activeFilterCount', () => {
  it('counts every ticked box', () => {
    expect(activeFilterCount(NO_ATTRIBUTE_FILTERS)).toBe(0);
    expect(activeFilterCount({ types: ['text', 'number'], usage: ['empty'] })).toBe(3);
  });
});

describe('attributesCsv', () => {
  it('writes the six columns for the rows it is given', () => {
    expect(attributesCsv(ATTRS, ROWS)).toBe([CSV_HEADER, CSV_NAME, CSV_NOTE, CSV_SEATS].join('\r\n'));
  });
});

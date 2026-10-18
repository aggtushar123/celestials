import { describe, expect, it } from 'vitest';
import { ALL_COLUMNS } from '../../components/organizations/tableData';
import { parseParams } from './portfolioParams';
import { HEADER_FIELDS, PANEL_ORDER, PINNABLE_FIELDS, PORTFOLIO_FIELDS, SORT_OPTIONS, signed } from './portfolioFields';
import { initech, pizzaHut } from './testPortfolio';

describe('portfolio field registry', () => {
  it('describes exactly the 34 fields of the old table', () => {
    expect(ALL_COLUMNS).toHaveLength(34);
    expect(Object.keys(PORTFOLIO_FIELDS).sort()).toEqual(ALL_COLUMNS.map((c) => c.id).sort());
    for (const [key, def] of Object.entries(PORTFOLIO_FIELDS)) expect(def.id).toBe(key);
  });

  it('puts the six header fields in the row and every other field in exactly one panel', () => {
    expect([...HEADER_FIELDS].sort()).toEqual(['aiPulseScore', 'health', 'lifecycleStage', 'organization', 'owner', 'pulse']);
    const inPanels = Object.values(PANEL_ORDER).flat();
    expect(new Set(inPanels).size).toBe(inPanels.length);
    expect(inPanels.length + HEADER_FIELDS.length).toBe(34);
    for (const [panel, ids] of Object.entries(PANEL_ORDER)) {
      for (const id of ids) expect(PORTFOLIO_FIELDS[id].place).toBe(panel);
    }
  });

  it('pins any panel field and no header field', () => {
    expect(PINNABLE_FIELDS).toHaveLength(28);
    expect(PINNABLE_FIELDS.some((f) => f.place === 'header')).toBe(false);
  });

  it('formats values the way the row and panels print them', () => {
    const v = (id: keyof typeof PORTFOLIO_FIELDS, row = pizzaHut) => PORTFOLIO_FIELDS[id].value(row);
    expect(v('nps')).toBe('−80');
    expect(v('totalSeatUtilization')).toBe('16%');
    expect(v('arrAccount')).toBe('$69,600.00');
    expect(v('productsUtilized')).toBe('Hiring (+1)');
    expect(v('pulse')).toBe('good, poor, poor');
    expect(v('aiPulseScore')).toBe('High Risk');
    expect(v('modifiedBy')).toBe('Carl CSM · 1 Sep 2026');
    expect(v('createdBy')).toBe('Alice Admin · 1 Aug 2024');
    expect(v('renewalDate')).toBe('9 Aug 2026');
    expect(v('owner', initech)).toBe('Unassigned');
    expect(v('churnReason', initech)).toBe('Budget cuts');
    expect(v('churnReason')).toBe('—');
  });

  it('signs NPS with a real minus and a plus', () => {
    expect(signed(-80)).toBe('−80');
    expect(signed(12)).toBe('+12');
    expect(signed(0)).toBe('0');
    expect(signed(null)).toBe('—');
  });

  it('offers only sort keys the URL parser accepts, each once', () => {
    const values = SORT_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.slice(0, 6)).toEqual(['arr', 'health', 'renewal', 'touch', 'risk', 'name']);
    for (const value of values) expect(parseParams(new URLSearchParams(`sort=${value}`)).sort).toBe(value);
    expect(values).toContain('total_contract_value');
    expect(values).toContain('csm_pulse_score');
    expect(SORT_OPTIONS.find((o) => o.value === 'ai_pulse_value')?.label).toBe('AI pulse');
  });
});

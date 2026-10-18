import { describe, it, expect } from 'vitest';
import { contextLabel, focusLabel, viewLabel } from './dashboardLabels';

const base = { surface: 'dashboard' as const, filters: { owner: '', lifecycle: '', customer: '' } };

describe('dashboard labels', () => {
  it('names the view', () => {
    expect(viewLabel('overview', null)).toBe('Overview');
    expect(viewLabel('revenue', 'forecast')).toBe('Revenue › Forecast');
    expect(viewLabel('health', 'renewals')).toBe('Health › Renewals');
    expect(viewLabel('support', 'nope')).toBe('Support');
  });

  it('names the focus', () => {
    expect(focusLabel(null)).toBe('');
    expect(focusLabel({ kind: 'companies', ids: [3] })).toBe('1 account');
    expect(focusLabel({ kind: 'companies', ids: [3, 7] })).toBe('2 accounts');
    expect(focusLabel({ kind: 'attention', key: 'risk:12' })).toBe('This attention item');
  });

  it('builds the chip from the filter option names, falling back to the value', () => {
    const context = { ...base, area: 'revenue' as const, view: 'forecast', filters: { owner: '2', lifecycle: 'customer', customer: '12' } };
    expect(contextLabel(context, { owner: { '2': 'Priya' }, lifecycle: { customer: 'Customer' } })).toBe(
      'Revenue › Forecast · Owner: Priya · Lifecycle: Customer · Account: 12',
    );
    expect(contextLabel({ ...base, area: 'overview', view: null })).toBe('Overview');
    expect(contextLabel({ ...base, area: 'overview', view: null, focus: { kind: 'companies', ids: [1, 2, 3] } })).toBe('Overview · 3 accounts');
  });
});

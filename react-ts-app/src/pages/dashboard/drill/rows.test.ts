import { describe, it, expect } from 'vitest';
import { healthRow } from '../tabs/health-overview/testUtils';
import type { UsageAccount } from '../../../features/usage/usageSlice';
import { fromHealthRows, fromUsageRows } from './rows';

function usageAccount(overrides: Partial<UsageAccount> = {}): UsageAccount {
  return {
    id: 1,
    name: 'Acme',
    owner: 'Sam CSM',
    lifecycle_stage: 'Live',
    health_category: 'average',
    utilisation: 50,
    active_seats: 50,
    contracted_seats: 100,
    idle_seats: 50,
    arr: 50_000,
    shelfware_arr: 0,
    products: 1,
    renewal_date: null,
    band: 'fair',
    ...overrides,
  };
}

describe('fromHealthRows', () => {
  it('maps id, account, owner and arr onto a DrillRow', () => {
    const row = healthRow({ id: '9', account: 'Acme', owner: 'Sam CSM', arr: 50_000 });
    expect(fromHealthRows([row])).toEqual([
      { id: '9', name: 'Acme', owner: 'Sam CSM', arr: 50_000, detail: undefined },
    ]);
  });

  it('carries a null arr through rather than coercing it', () => {
    const row = healthRow({ id: '1', arr: null });
    expect(fromHealthRows([row])[0].arr).toBeNull();
  });

  it('leaves detail undefined when no detail function is given', () => {
    const row = healthRow({ id: '1' });
    expect(fromHealthRows([row])[0].detail).toBeUndefined();
  });

  it('calls the detail function per row when given', () => {
    const a = healthRow({ id: '1', account: 'A', healthScore: 7 });
    const b = healthRow({ id: '2', account: 'B', healthScore: 3 });
    const rows = fromHealthRows([a, b], (r) => `risk ${r.healthScore}`);
    expect(rows.map((r) => r.detail)).toEqual(['risk 7', 'risk 3']);
  });

  it('maps many rows in order, and returns nothing for an empty list', () => {
    const a = healthRow({ id: '1', account: 'A' });
    const b = healthRow({ id: '2', account: 'B' });
    expect(fromHealthRows([a, b]).map((r) => r.name)).toEqual(['A', 'B']);
    expect(fromHealthRows([])).toEqual([]);
  });
});

describe('fromUsageRows', () => {
  it('maps id (stringified), name, owner and arr onto a DrillRow', () => {
    const row = usageAccount({ id: 9, name: 'Acme', owner: 'Sam CSM', arr: 50_000 });
    expect(fromUsageRows([row])).toEqual([
      { id: '9', name: 'Acme', owner: 'Sam CSM', arr: 50_000, detail: undefined },
    ]);
  });

  it('carries a null arr through rather than coercing it', () => {
    const row = usageAccount({ id: 1, arr: null });
    expect(fromUsageRows([row])[0].arr).toBeNull();
  });

  it('leaves detail undefined when no detail function is given', () => {
    const row = usageAccount({ id: 1 });
    expect(fromUsageRows([row])[0].detail).toBeUndefined();
  });

  it('calls the detail function per row when given', () => {
    const a = usageAccount({ id: 1, name: 'A', utilisation: 91 });
    const b = usageAccount({ id: 2, name: 'B', utilisation: 12 });
    const rows = fromUsageRows([a, b], (r) => `${r.utilisation}% used`);
    expect(rows.map((r) => r.detail)).toEqual(['91% used', '12% used']);
  });

  it('maps many rows in order, and returns nothing for an empty list', () => {
    const a = usageAccount({ id: 1, name: 'A' });
    const b = usageAccount({ id: 2, name: 'B' });
    expect(fromUsageRows([a, b]).map((r) => r.name)).toEqual(['A', 'B']);
    expect(fromUsageRows([])).toEqual([]);
  });
});

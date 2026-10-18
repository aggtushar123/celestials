import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tier: each wrapper hits the path and method docs/API_CONTRACTS.md's
// `attributes` section names, and nothing else.
vi.mock('../../lib/apiClient', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { apiFetch } from '../../lib/apiClient';
import { createAttribute, deleteAttribute, fetchAttributes, fetchHistory, fetchValues, fillAttribute, overrideValue } from './attributesApi';

const mocked = vi.mocked(apiFetch);

describe('attributesApi', () => {
  beforeEach(() => mocked.mockClear());

  it('lists, creates and deletes definitions', async () => {
    await fetchAttributes();
    expect(mocked).toHaveBeenLastCalledWith('/attributes/definitions/');
    const payload = { name: 'Tier', prompt: 'Which tier?', value_type: 'picklist' as const, picklist_options: ['SMB'], applies_to_customer: true, applies_to_account: true, refresh: 'nightly' as const };
    await createAttribute(payload);
    expect(mocked).toHaveBeenLastCalledWith('/attributes/definitions/', { method: 'POST', body: payload });
    await deleteAttribute(4);
    expect(mocked).toHaveBeenLastCalledWith('/attributes/definitions/4/', { method: 'DELETE' });
  });

  it('fills one company or every company', async () => {
    await fillAttribute(3, { customerId: 12 });
    expect(mocked).toHaveBeenLastCalledWith('/attributes/definitions/3/fill/', { method: 'POST', body: { customer: 12 } });
    await fillAttribute(3, { accountId: 7 });
    expect(mocked).toHaveBeenLastCalledWith('/attributes/definitions/3/fill/', { method: 'POST', body: { account: 7 } });
    await fillAttribute(3);
    expect(mocked).toHaveBeenLastCalledWith('/attributes/definitions/3/fill/', { method: 'POST', body: {} });
  });

  it('reads values and history for a company and writes an override', async () => {
    await fetchValues({ customerId: 12 });
    expect(mocked).toHaveBeenLastCalledWith('/attributes/values/?customer=12');
    await fetchHistory(3, { accountId: 7 });
    expect(mocked).toHaveBeenLastCalledWith('/attributes/values/history/?attribute=3&account=7');
    await overrideValue(3, { customerId: 12 }, 'SMB');
    expect(mocked).toHaveBeenLastCalledWith('/attributes/values/', { method: 'POST', body: { attribute: 3, customer: 12, value: 'SMB' } });
  });
});

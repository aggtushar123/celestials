import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tier: each wrapper hits the path and method the contract names.
vi.mock('../../lib/apiClient', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { apiFetch } from '../../lib/apiClient';
import { answerGap, dismissGap, fetchBrief, fetchGaps, generateBrief } from './briefApi';

const mocked = vi.mocked(apiFetch);

describe('briefApi', () => {
  beforeEach(() => mocked.mockClear());

  it('reads and writes the brief', async () => {
    await fetchBrief(7);
    expect(mocked).toHaveBeenLastCalledWith('/customers/7/brief/');
    await generateBrief(7);
    expect(mocked).toHaveBeenLastCalledWith('/customers/7/brief/', { method: 'POST', body: {} });
  });

  it('lists gaps with and without filters', async () => {
    await fetchGaps();
    expect(mocked).toHaveBeenLastCalledWith('/knowledge/gaps/');
    await fetchGaps({ customerId: 7 });
    expect(mocked).toHaveBeenLastCalledWith('/knowledge/gaps/?customer=7');
    await fetchGaps({ customerId: 7, status: 'filled' });
    expect(mocked).toHaveBeenLastCalledWith('/knowledge/gaps/?customer=7&status=filled');
  });

  it('answers and dismisses', async () => {
    await answerGap(12, 'They run Salesforce.');
    expect(mocked).toHaveBeenLastCalledWith('/knowledge/gaps/12/answer/', {
      method: 'POST',
      body: { body: 'They run Salesforce.' },
    });
    await dismissGap(12);
    expect(mocked).toHaveBeenLastCalledWith('/knowledge/gaps/12/dismiss/', { method: 'POST', body: {} });
  });
});

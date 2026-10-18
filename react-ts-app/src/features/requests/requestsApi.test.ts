import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tier: each wrapper hits the path and method the contract names.
vi.mock('../../lib/apiClient', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { apiFetch } from '../../lib/apiClient';
import { dismissEvidence, fetchRequest, fetchRequests, gatherRequests, mergeRequest, moveEvidence, updateRequest } from './requestsApi';

const mocked = vi.mocked(apiFetch);

describe('requestsApi', () => {
  beforeEach(() => mocked.mockClear());

  it('lists with and without a status filter', async () => {
    await fetchRequests();
    expect(mocked).toHaveBeenLastCalledWith('/requests/');
    await fetchRequests('all');
    expect(mocked).toHaveBeenLastCalledWith('/requests/');
    await fetchRequests('planned');
    expect(mocked).toHaveBeenLastCalledWith('/requests/?status=planned');
  });

  it('reads one, patches it, and gathers', async () => {
    await fetchRequest(4);
    expect(mocked).toHaveBeenLastCalledWith('/requests/4/');
    await updateRequest(4, { status: 'shipped', owner: 5 });
    expect(mocked).toHaveBeenLastCalledWith('/requests/4/', { method: 'PATCH', body: { status: 'shipped', owner: 5 } });
    await gatherRequests();
    expect(mocked).toHaveBeenLastCalledWith('/requests/gather/', { method: 'POST', body: {} });
  });

  it('merges and curates evidence', async () => {
    await mergeRequest(4, 7);
    expect(mocked).toHaveBeenLastCalledWith('/requests/4/merge/', { method: 'POST', body: { into: 7 } });
    await moveEvidence(11, 7);
    expect(mocked).toHaveBeenLastCalledWith('/requests/evidence/11/move/', { method: 'POST', body: { request: 7 } });
    await dismissEvidence(11);
    expect(mocked).toHaveBeenLastCalledWith('/requests/evidence/11/dismiss/', { method: 'POST', body: {} });
  });

  it('names the scope after the status (customers spec §1.5)', async () => {
    await fetchRequests('all', 'team');
    expect(mocked).toHaveBeenLastCalledWith('/requests/?scope=team');
    await fetchRequests('planned', 'me');
    expect(mocked).toHaveBeenLastCalledWith('/requests/?status=planned&scope=me');
    await fetchRequest(4, 'company');
    expect(mocked).toHaveBeenLastCalledWith('/requests/4/?scope=company');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tier: each wrapper hits the path and method the contract names.
vi.mock('../../lib/apiClient', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { apiFetch } from '../../lib/apiClient';
import { detectAnomalies, fetchAnomalies, fetchAnomaly, setAnomalyStatus } from './anomaliesApi';

const mocked = vi.mocked(apiFetch);

describe('anomaliesApi', () => {
  beforeEach(() => mocked.mockClear());

  it('lists with and without a status filter', async () => {
    await fetchAnomalies();
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/');
    await fetchAnomalies('all');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/');
    await fetchAnomalies('live');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/?status=live');
  });

  it('reads one, sets its status, and detects', async () => {
    await fetchAnomaly(3);
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/3/');
    await setAnomalyStatus(3, 'acknowledged');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/3/', { method: 'PATCH', body: { status: 'acknowledged' } });
    await detectAnomalies();
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/detect/', { method: 'POST', body: {} });
  });

  it('names the scope after the status (customers spec §1.5)', async () => {
    await fetchAnomalies('all', 'team');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/?scope=team');
    await fetchAnomalies('live', 'me');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/?status=live&scope=me');
    await fetchAnomaly(3, 'company');
    expect(mocked).toHaveBeenLastCalledWith('/anomalies/3/?scope=company');
  });
});

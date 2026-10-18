import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tier: each wrapper hits the path and method the contract names.
vi.mock('../../lib/apiClient', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { apiFetch } from '../../lib/apiClient';
import { fetchAttention, snooze, unsnooze } from './attentionApi';

const mocked = vi.mocked(apiFetch);

describe('attentionApi', () => {
  beforeEach(() => mocked.mockClear());

  it('fetches attention with and without query filters', async () => {
    await fetchAttention('');
    expect(mocked).toHaveBeenLastCalledWith('/dashboard/attention/');
    await fetchAttention('owner=user1&lifecycle=renewal');
    expect(mocked).toHaveBeenLastCalledWith('/dashboard/attention/?owner=user1&lifecycle=renewal');
  });

  it('snoozes with days and done', async () => {
    await snooze('risk:12', { days: 7 });
    expect(mocked).toHaveBeenLastCalledWith('/dashboard/attention/snooze/', {
      method: 'POST',
      body: { key: 'risk:12', days: 7 },
    });
    await snooze('renewal:5', { done: true });
    expect(mocked).toHaveBeenLastCalledWith('/dashboard/attention/snooze/', {
      method: 'POST',
      body: { key: 'renewal:5', done: true },
    });
  });

  it('unsnoozes with encoded key', async () => {
    await unsnooze('risk:12');
    expect(mocked).toHaveBeenLastCalledWith('/dashboard/attention/snooze/risk%3A12/', { method: 'DELETE' });
  });
});

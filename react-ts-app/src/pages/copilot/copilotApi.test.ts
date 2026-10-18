import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tier: the wrapper sends the body the contract names, and nothing more.
vi.mock('../../lib/apiClient', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { apiFetch } from '../../lib/apiClient';
import { sendMessage } from './copilotApi';
import type { DashboardContext } from './types';

const mocked = vi.mocked(apiFetch);

const context: DashboardContext = {
  surface: 'dashboard',
  area: 'revenue',
  view: 'forecast',
  filters: { owner: '2', lifecycle: 'customer', customer: '' },
  focus: null,
};

describe('sendMessage', () => {
  beforeEach(() => mocked.mockClear());

  it('sends no context key at all when none is given (Communications, Copilot)', async () => {
    await sendMessage({ conversationId: 7, content: 'Hello' });
    expect(mocked).toHaveBeenLastCalledWith('/copilot/messages/', {
      method: 'POST',
      body: { conversation_id: 7, content: 'Hello' },
    });
  });

  it('sends the dashboard context as its own field', async () => {
    await sendMessage({ content: 'Why is at-risk ARR up?', context });
    expect(mocked).toHaveBeenLastCalledWith('/copilot/messages/', {
      method: 'POST',
      body: { conversation_id: undefined, content: 'Why is at-risk ARR up?', context },
    });
  });
});

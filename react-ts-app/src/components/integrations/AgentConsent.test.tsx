import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import { AgentConsent } from './AgentConsent';

afterEach(() => vi.unstubAllGlobals());

describe('The email agent consent (off by default)', () => {
  it('says internal mail is never kept, and switching on asks the server', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ connection: null, providers: [] }) };
    }));
    render(<Provider store={configureStore({ reducer: rootReducer })}><AgentConsent on={false} /></Provider>);
    const toggle = screen.getByRole('switch', { name: 'Suggest tasks and meetings from what I send colleagues' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription(/Mail between colleagues is never kept in Revenact/);
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    const patch = calls.find((c) => c.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ agent_reads_mail: true });
  });
});

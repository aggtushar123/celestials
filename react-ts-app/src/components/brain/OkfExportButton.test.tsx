import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';
import { ToastContext } from '../ui';
import { OKF_SAY } from '../../features/knowledge/okfText';
import { OkfExportButton } from './OkfExportButton';

// Unit + integration tier: the button follows the server's rule (only
// view_all_accounts may export), downloads the bundle through the
// authenticated blob call, and says how it went.

const apiFetchBlob = vi.fn();
vi.mock('../../lib/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/apiClient')>()),
  apiFetchBlob: (path: string) => apiFetchBlob(path),
}));
const saveUrl = vi.fn();
vi.mock('../../features/mail/mailAttachments', () => ({ saveUrl: (url: string, name: string) => saveUrl(url, name) }));

function renderAs(role: 'admin' | 'csm') {
  const toast = vi.fn();
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'tushar@alfee.io', name: 'Tushar', avatar: '', role, role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Alfee', slug: 'alfee', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <ToastContext.Provider value={toast}>
        <OkfExportButton />
      </ToastContext.Provider>
    </Provider>,
  );
  return toast;
}

describe('OkfExportButton', () => {
  beforeEach(() => {
    apiFetchBlob.mockReset();
    saveUrl.mockReset();
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:okf', revokeObjectURL: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is not offered to someone who sees only their own book', () => {
    renderAs('csm');
    expect(screen.queryByRole('button', { name: OKF_SAY.LABEL })).toBeNull();
  });

  it('downloads the bundle as a zip and says so', async () => {
    apiFetchBlob.mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }));
    const toast = renderAs('admin');

    await userEvent.click(screen.getByRole('button', { name: OKF_SAY.LABEL }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: OKF_SAY.DONE }));
    expect(apiFetchBlob).toHaveBeenCalledWith('/knowledge/okf/');
    expect(saveUrl).toHaveBeenCalledWith('blob:okf', 'revenact-knowledge-okf.zip');
  });

  it('is busy while exporting, then ready again', async () => {
    let finish: (blob: Blob) => void = () => {};
    apiFetchBlob.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderAs('admin');

    await userEvent.click(screen.getByRole('button', { name: OKF_SAY.LABEL }));
    const busy = screen.getByRole('button', { name: OKF_SAY.BUSY });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');

    finish(new Blob(['zip']));
    await waitFor(() => expect(screen.getByRole('button', { name: OKF_SAY.LABEL })).toBeEnabled());
  });

  it('says plainly when the export fails', async () => {
    apiFetchBlob.mockRejectedValue(new Error('403'));
    const toast = renderAs('admin');

    await userEvent.click(screen.getByRole('button', { name: OKF_SAY.LABEL }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ message: OKF_SAY.FAILED }));
    expect(saveUrl).not.toHaveBeenCalled();
  });
});

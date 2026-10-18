import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../../features/auth/authSlice';
import filesReducer from '../../../features/files/filesSlice';
import { FilesTab } from './FilesTab';
import { setAuthHooks } from '../../../lib/apiClient';
import { capabilitiesForRole } from '../../../test/capabilities';

const contract = {
  id: 7, name: 'Signed MSA.pdf', content_type: 'application/pdf', size: 183220, description: 'Countersigned 12 Sep',
  source: 'upload' as const, uploaded_by: { id: 3, name: 'Carl' }, download_url: '/api/v1/files/7/download/', created_at: '2026-09-16T09:00:00Z',
};
const transcript = {
  id: 8, name: 'qbr.vtt', content_type: 'text/vtt', size: 2048, description: '',
  source: 'transcript' as const, uploaded_by: { id: 1, name: 'Alice' }, download_url: '/api/v1/files/8/download/', created_at: '2026-09-15T09:00:00Z',
};

function mockApi() {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    const ok = (body: unknown, status = 200) => Promise.resolve({ ok: true, status, json: async () => body, blob: async () => new Blob(['%PDF']) });
    if (init?.method === 'POST') {
      const form = init.body as FormData;
      const file = form.get('file') as File;
      return ok({ ...contract, id: 9, name: file.name, size: file.size, description: form.get('description') ?? '', uploaded_by: { id: 1, name: 'Alice' } }, 201);
    }
    if (init?.method === 'DELETE') return Promise.resolve({ ok: true, status: 204, json: async () => null });
    if (url.endsWith('/download/')) return ok(null);
    return ok([contract, transcript]);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderTab(role: 'admin' | 'csm' = 'csm', props: Partial<React.ComponentProps<typeof FilesTab>> = {}) {
  const store = configureStore({
    reducer: { auth: authReducer, files: filesReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  setAuthHooks({ getAccessToken: () => 'token', refreshAccessToken: async () => null, onAuthFailure: () => {} });
  render(
    <Provider store={store}>
      <FilesTab entityType="organization" entityId={10} {...props} />
    </Provider>
  );
  return store;
}

describe('FilesTab', () => {
  it("lists a filed email's attachment with its sender and offers no delete, even to an admin (D2 contract §6)", async () => {
    const email = { ...contract, id: 31, name: 'Renewal quote.pdf', source: 'email' as const, uploaded_by: null, description: '', download_url: '/api/v1/mail/attachments/31/download/', email: { id: 812, subject: 'Renewal terms', from: 'Ann Lee' } };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [email] })));
    renderTab('admin');
    expect(await screen.findByText(/email from Ann Lee/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Renewal quote.pdf' })).toBeNull();
  });

  beforeEach(() => vi.unstubAllGlobals());

  it('lists the files with size, uploader, date and kind', async () => {
    const spy = mockApi();
    renderTab();

    const list = await screen.findByLabelText('Files');
    expect(within(list).getByText('Signed MSA.pdf')).toBeInTheDocument();
    expect(within(list).getByText('Signed MSA.pdf').closest('li')).toHaveTextContent('179 KB · Carl · 16 Sep 2026 · Countersigned 12 Sep');
    expect(within(list).getByText('qbr.vtt').closest('li')).toHaveTextContent('2 KB · Alice · 15 Sep 2026 · call transcript');
    expect(spy.mock.calls[0][0]).toMatch(/\/customers\/10\/files\/$/);
  });

  it('uploads a chosen file as multipart with its description', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Signed MSA.pdf');

    await user.type(screen.getByLabelText('Description for the next upload'), 'Q3 deck');
    const file = new File(['PK'], 'Q3 deck.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    await user.upload(screen.getByLabelText('Choose files'), file);

    expect(await screen.findByText('Q3 deck.pptx')).toBeInTheDocument();
    const post = spy.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toMatch(/\/customers\/10\/files\/$/);
    const form = post?.[1]?.body as FormData;
    expect((form.get('file') as File).name).toBe('Q3 deck.pptx');
    expect(form.get('description')).toBe('Q3 deck');
    expect((post?.[1]?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('downloads through the session rather than a plain link', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Download Signed MSA.pdf' }));
    const download = spy.mock.calls.find(([url]) => url.endsWith('/api/v1/files/7/download/'));
    expect(download).toBeDefined();
    expect((download?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(createObjectURL).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Signed MSA/ })).not.toBeInTheDocument();
  });

  it('offers delete to the uploader and to admins only', async () => {
    mockApi();
    const user = userEvent.setup();
    renderTab('csm');
    await screen.findByText('Signed MSA.pdf');
    expect(screen.queryByRole('button', { name: 'Delete Signed MSA.pdf' })).not.toBeInTheDocument(); // Carl's
    expect(screen.getByRole('button', { name: 'Delete qbr.vtt' })).toBeInTheDocument(); // mine

    await user.click(screen.getByRole('button', { name: 'Delete qbr.vtt' }));
    expect(screen.queryByText('qbr.vtt')).not.toBeInTheDocument();
  });

  it('shows an empty state and no upload for an account without a resolvable parent', async () => {
    mockApi();
    renderTab('csm', { entityType: 'account', entityId: 'acc-1' });
    expect(await screen.findByText('No files yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload file/ })).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentAccessPage } from './AgentAccessPage';

// Integration tier: the real page against the fetch boundary.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const existing = { id: 1, label: 'Claude Desktop', hint: '…7fQx', last_used_at: '2026-09-22T09:00:00Z', created_at: '2026-09-01T09:00:00Z' };

describe('AgentAccessPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('lists the keys with what they are and when they were last used', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [existing]));
    render(<AgentAccessPage />);
    const row = await screen.findByRole('listitem');
    expect(within(row).getByText('Claude Desktop')).toBeInTheDocument();
    expect(within(row).getByText(/…7fQx/)).toBeInTheDocument();
    expect(within(row).getByText(/Last used/)).toBeInTheDocument();
  });

  it('issues one and shows the secret exactly once', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(201, { ...existing, id: 2, label: 'My agent', token: 'rvn_mcp_secret-value' }))
      .mockResolvedValueOnce(jsonResponse(200, [{ ...existing, id: 2, label: 'My agent' }]));
    render(<AgentAccessPage />);
    expect(await screen.findByText(/No agent has access/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('What is it for'), 'My agent');
    await userEvent.click(screen.getByRole('button', { name: 'Create a key' }));
    expect(await screen.findByText('rvn_mcp_secret-value')).toBeInTheDocument();
    expect(screen.getByText(/only time/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('rvn_mcp_secret-value')).not.toBeInTheDocument();
  });

  it('needs a name before it will make one', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    render(<AgentAccessPage />);
    await screen.findByText(/No agent has access/);
    expect(screen.getByRole('button', { name: 'Create a key' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('revokes one after confirming', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [existing]))
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValueOnce(jsonResponse(200, []));
    render(<AgentAccessPage />);
    await screen.findByText('Claude Desktop');
    await userEvent.click(screen.getByRole('button', { name: 'Revoke Claude Desktop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText(/No agent has access/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/mcp\/tokens\/1\/$/);
  });

  it('shows the error with a retry', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { detail: 'Boom' }))
      .mockResolvedValueOnce(jsonResponse(200, [existing]));
    render(<AgentAccessPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Claude Desktop')).toBeInTheDocument();
  });

  it('tells you where to point the agent', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    render(<AgentAccessPage />);
    expect(await screen.findByText(/\/api\/v1\/mcp\//)).toBeInTheDocument();
  });
});

describe('Agent access on the settings frame (UI foundations spec §6.3, §3)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('heads the page from the nav, names the endpoint as code, and lists keys as rows with Revoke on hover', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [existing]));
    render(<AgentAccessPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Webhooks & API access' })).toHaveClass('text-[22px]');
    expect(screen.getByText('/api/v1/mcp/')).toHaveClass('font-mono-brand');
    const list = await screen.findByRole('list', { name: 'Agent keys' });
    const revoke = within(list).getByRole('button', { name: 'Revoke Claude Desktop' });
    expect(revoke).toHaveClass('text-danger-ink');
    expect(revoke.parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
  });

  it('shows a load failure inside the keys card with Try again', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: 'Boom' }));
    render(<AgentAccessPage />);
    const alert = await screen.findByRole('alert');
    expect(alert.closest('section')).toHaveAccessibleName('Keys');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the new key once as code, in a section of its own, with the warning in ink', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(201, { id: 2, label: 'My agent', token: 'rvn_mcp_secret-value', hint: '…alue', created_at: '2026-10-10T00:00:00Z', last_used_at: null }))
      .mockResolvedValue(jsonResponse(200, []));
    render(<AgentAccessPage />);
    await screen.findByText(/No agent has access/);
    await userEvent.type(screen.getByLabelText('What is it for'), 'My agent');
    await userEvent.click(screen.getByRole('button', { name: 'Create a key' }));
    const key = await screen.findByText('rvn_mcp_secret-value');
    expect(key).toHaveClass('font-mono-brand');
    expect(key.closest('section')).toHaveAccessibleName('Your new key');
    expect(screen.getByText(/only time/i).closest('[data-part="settings-note"]')).toHaveClass('text-ink');
  });
});

describe('Agent access keeps keyboard focus where it was', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('moves to the new key heading after creating, and to the name field on Done', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(201, { id: 2, label: 'My agent', token: 'rvn_mcp_secret-value', hint: '…alue', created_at: '2026-10-10T00:00:00Z', last_used_at: null }))
      .mockResolvedValue(jsonResponse(200, []));
    render(<AgentAccessPage />);
    await screen.findByText(/No agent has access/);
    await userEvent.type(screen.getByLabelText('What is it for'), 'My agent');
    await userEvent.click(screen.getByRole('button', { name: 'Create a key' }));
    await screen.findByText('rvn_mcp_secret-value');
    expect(screen.getByRole('heading', { level: 2, name: 'Your new key' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByLabelText('What is it for')).toHaveFocus();
  });

  it('does not create a key without a name', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    render(<AgentAccessPage />);
    await screen.findByText(/No agent has access/);
    await userEvent.click(screen.getByRole('button', { name: 'Create a key' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns to Revoke when the revoke is cancelled', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [existing]));
    render(<AgentAccessPage />);
    const revoke = await screen.findByRole('button', { name: 'Revoke Claude Desktop' });
    await userEvent.click(revoke);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(revoke).toHaveFocus();
  });

  it('focuses the list after revoking one of two, and the name field after the last', async () => {
    const two = { ...existing, id: 2, label: 'Second agent' };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [existing, two]))
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValueOnce(jsonResponse(200, [two]))
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValue(jsonResponse(200, []));
    render(<AgentAccessPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke Claude Desktop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(screen.queryByText('Claude Desktop')).toBeNull());
    expect(screen.getByRole('list', { name: 'Agent keys' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke Second agent' }));
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await screen.findByText(/No agent has access/);
    expect(screen.getByLabelText('What is it for')).toHaveFocus();
  });
});

describe('Agent access: creating and a refused revoke', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('says Creating… in a status region that was there before, the same node after', async () => {
    let release: () => void = () => {};
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(jsonResponse(201, { ...existing, id: 2, label: 'My agent', token: 'rvn_mcp_x' })))))
      .mockResolvedValueOnce(jsonResponse(200, [{ ...existing, id: 2, label: 'My agent' }]));
    render(<AgentAccessPage />);
    await screen.findByText(/No agent has access/);
    const form = screen.getByRole('region', { name: 'New key' });
    const region = within(form).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    await userEvent.type(screen.getByLabelText('What is it for'), 'My agent');
    await userEvent.click(screen.getByRole('button', { name: 'Create a key' }));
    expect(region).toHaveTextContent('Creating…');
    await act(async () => release());
    await screen.findByText('rvn_mcp_x');
    expect(region).toBeEmptyDOMElement();
    expect(within(screen.getByRole('region', { name: 'New key' })).getByRole('status')).toBe(region);
  });

  it('a revoke that gets a 500 leaves the row in place and shows the alert', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [existing])).mockResolvedValueOnce(jsonResponse(500, { detail: 'Server error.' }));
    render(<AgentAccessPage />);
    await screen.findByText('Claude Desktop');
    await userEvent.click(screen.getByRole('button', { name: 'Revoke Claude Desktop' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error.');
    expect(within(screen.getByRole('list', { name: 'Agent keys' })).getByText('Claude Desktop')).toBeInTheDocument();
  });
});

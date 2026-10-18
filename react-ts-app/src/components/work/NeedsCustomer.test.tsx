import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NeedsCustomer } from './NeedsCustomer';
import { ITEMS_CS, ITEM_JIRA, ITEM_SLACK, stubUnmatched } from '../../features/work/testUnmatched';

afterEach(() => vi.unstubAllGlobals());

function renderList(props: Partial<Parameters<typeof NeedsCustomer>[0]> = {}) {
  const onToast = vi.fn();
  const onCount = vi.fn();
  const onRefused = vi.fn(() => true);
  render(
    <MemoryRouter>
      <NeedsCustomer queue="department:cs" onCount={onCount} onToast={onToast} onRefused={onRefused} {...props} />
    </MemoryRouter>,
  );
  return { onToast, onCount, onRefused };
}

describe('NeedsCustomer (round 2 D3 frontend Decisions 1, 2, 4, 6)', () => {
  it('lists the messages with who sent them and when they go', async () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    renderList();
    const list = await screen.findByRole('region', { name: /Needs a customer/ });
    expect(within(list).getByText('Export fails for the whole team')).toBeInTheDocument();
    expect(within(list).getByText(/from Ann Lee \(ann@newco\.io\)/)).toBeInTheDocument();
    expect(within(list).getByText('Deleted on 13 Nov if no one matches it.')).toBeInTheDocument();
    expect(within(list).getByText('Critical')).toBeInTheDocument();
    const link = within(list).getByRole('link', { name: 'Open in Jira' });
    expect(link).toHaveAttribute('href', ITEM_JIRA.url);
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('draws nothing when the queue has none', async () => {
    stubUnmatched({ items: [] });
    const { onCount } = renderList();
    await vi.waitFor(() => expect(onCount).toHaveBeenCalledWith(0));
    expect(screen.queryByRole('region', { name: /Needs a customer/ })).toBeNull();
  });

  it('pages 25 at a time', async () => {
    stubUnmatched({ items: ITEMS_CS });
    renderList();
    await screen.findByRole('region', { name: /Needs a customer \(30\)/ });
    expect(screen.getAllByRole('button', { name: 'Match to a customer' })).toHaveLength(25);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findAllByRole('button', { name: 'Match to a customer' })).toHaveLength(30);
  });

  it('dismisses after asking', async () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    const { onToast, onCount } = renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    const dialog = screen.getByRole('dialog', { name: 'Dismiss this message?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith('Dismissed.'));
    expect(screen.queryByText('Export fails for the whole team')).toBeNull();
    await vi.waitFor(() => expect(onCount).toHaveBeenLastCalledWith(0));
  });

  it('says Dismissing… on the confirm while the dismiss is in flight', async () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    const inner = globalThis.fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/dismiss/')) await gate;
      return inner(input, init);
    });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dismiss' }));
    expect(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Dismissing…' })).toBeInTheDocument();
    release();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reloads from the top when the server says the cursor is stale (Decision 6)', async () => {
    stubUnmatched({ items: ITEMS_CS });
    const inner = globalThis.fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
    let stale = true;
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (stale && String(input).includes('cursor=')) {
        stale = false;
        return { ok: false, status: 400, json: async () => ({ cursor: ['That list has changed. Reload Work.'] }) };
      }
      return inner(input, init);
    });
    vi.stubGlobal('fetch', spy);
    renderList();
    await screen.findByRole('region', { name: /Needs a customer \(30\)/ });
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await vi.waitFor(() => expect(spy.mock.calls.filter(([url]) => String(url).includes('/work/unmatched/?queue') && !String(url).includes('cursor=')).length).toBe(2));
    expect(await screen.findAllByRole('button', { name: 'Match to a customer' })).toHaveLength(25);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes a row someone else dealt with and says so', async () => {
    stubUnmatched({ items: [ITEM_JIRA], refuseNextDismiss: { status: 409, body: { code: 'GONE', detail: 'Someone else dealt with this message. Reload the list.' } } });
    const { onToast } = renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dismiss' }));
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith('Someone else dealt with this message. Reload the list.'));
    expect(screen.queryByText('Export fails for the whole team')).toBeNull();
  });

  it('treats a 404 on dismiss as gone: removes the row and says so', async () => {
    stubUnmatched({ items: [ITEM_JIRA], refuseNextDismiss: { status: 404, body: { detail: 'Not found.' } } });
    const { onToast } = renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dismiss' }));
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith('Someone else dealt with this message. Reload the list.'));
    expect(screen.queryByText('Export fails for the whole team')).toBeNull();
  });

  it('reports a failed read as failed, not as none', async () => {
    stubUnmatched({ items: [ITEM_JIRA], failList: 1 });
    const { onCount } = renderList();
    await screen.findByRole('alert');
    expect(onCount).toHaveBeenCalledWith('failed');
    expect(onCount).not.toHaveBeenCalledWith(0);
  });

  it('says when the list could not load, with Retry', async () => {
    stubUnmatched({ items: [ITEM_JIRA], failList: 1 });
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the messages that need a customer.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Export fails for the whole team')).toBeInTheDocument();
  });

  it('hands a 403 to the queue and shows no error of its own', async () => {
    stubUnmatched({ forbidden: true });
    const { onRefused } = renderList();
    await vi.waitFor(() => expect(onRefused).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the long text on request', async () => {
    stubUnmatched({ items: [{ ...ITEM_JIRA, text: 'word '.repeat(80) }] });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('matches a message: removes the row, closes the dialog and says so', async () => {
    const stub = stubUnmatched({ items: [ITEM_JIRA] });
    const inner = globalThis.fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/customers/') && url.searchParams.has('search')) return { ok: true, status: 200, json: async () => ({ results: [{ id: 7, name: 'Pizza Hut' }] }) };
      if (url.pathname.endsWith('/accounts/') && url.searchParams.has('search')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
      return inner(input, init);
    });
    const { onToast, onCount } = renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Match to a customer' }));
    const dialog = screen.getByRole('dialog', { name: 'Match to a customer' });
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Organisation or account' }), 'piz');
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Pizza Hut' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Match' }));
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith('Matched to Pizza Hut. An agent reads it at the next run.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Export fails for the whole team')).toBeNull();
    await vi.waitFor(() => expect(onCount).toHaveBeenLastCalledWith(0));
    expect(stub.spy).toHaveBeenCalled();
  });

  it('removes the row behind the dialog when the message is gone, and keeps the alert', async () => {
    stubUnmatched({ items: [ITEM_JIRA, ITEM_SLACK], refuseNextMatch: { status: 409, body: { code: 'GONE', detail: 'Someone else dealt with this message. Reload the list.' } } });
    const inner = globalThis.fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/customers/') && url.searchParams.has('search')) return { ok: true, status: 200, json: async () => ({ results: [{ id: 7, name: 'Pizza Hut' }] }) };
      if (url.pathname.endsWith('/accounts/') && url.searchParams.has('search')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
      return inner(input, init);
    });
    renderList();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Match to a customer' }))[0]);
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Organisation or account' }), 'piz');
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Pizza Hut' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Match' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Someone else dealt with this message.');
    const list = screen.getByRole('region', { name: /Needs a customer/ });
    expect(within(list).queryByText('Export fails for the whole team')).toBeNull();
    expect(screen.getByText('Is anyone seeing the dashboard time out?')).toBeInTheDocument();
  });

  it('matches a Slack message through the dialog and toasts the record it was filed under', async () => {
    stubUnmatched({ items: [ITEM_SLACK] });
    const { onToast } = renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Match to a customer' }));
    const dialog = screen.getByRole('dialog', { name: 'Match to a customer' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Globex (QA)' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Match' }));
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith('Matched to Globex (QA). An agent reads it at the next run.'));
    expect(screen.queryByText(ITEM_SLACK.title)).toBeNull();
  });
});

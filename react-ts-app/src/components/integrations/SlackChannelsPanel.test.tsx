import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { CHANNEL_ROWS, stubSlackChannels } from '../../features/connectors/testSlackChannels';
import { SlackChannelsPanel } from './SlackChannelsPanel';

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function renderPanel(props: Partial<Parameters<typeof SlackChannelsPanel>[0]> = {}) {
  const onReconnect = props.onReconnect ?? vi.fn();
  const onChanged = props.onChanged ?? vi.fn();
  const onDone = props.onDone ?? vi.fn();
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <SlackChannelsPanel connectorId={7} onReconnect={onReconnect} onChanged={onChanged} onDone={onDone} />
    </Provider>,
  );
  return { onReconnect, onChanged, onDone };
}

const rowOf = (name: string) => screen.getByText(`#${name}`).closest('li') as HTMLElement;

describe('SlackChannelsPanel (frontend Decisions 2 to 4)', () => {
  it('lists every channel with its state, its count and its customer', async () => {
    stubSlackChannels();
    renderPanel();
    expect(await screen.findByText('Syncs 3 of 4 public channels. New ones are added on their own.')).toBeInTheDocument();
    expect(within(rowOf('all-alfiee')).getByText(/12 conversations/)).toBeInTheDocument();
    expect(within(rowOf('globex-escalations')).getByText(/Joins on the next sync/)).toBeInTheDocument();
    expect(within(rowOf('globex-shared')).getByText(/Shared with another company/)).toBeInTheDocument();
    expect(within(rowOf('globex-shared')).getByRole('switch', { name: 'Sync #globex-shared' })).toHaveAttribute('aria-checked', 'false');
    expect(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' })).toHaveAttribute('aria-checked', 'true');
  });

  it('says whether Slack events arrive (Decision 7)', async () => {
    stubSlackChannels();
    renderPanel();
    expect(await screen.findByText(/^Events: receiving\. The last one arrived .+ ago\.$/)).toBeInTheDocument();
  });

  it('says when events are not set up', async () => {
    stubSlackChannels({ eventsAt: null });
    renderPanel();
    expect(await screen.findByText('Events: not set up. Revenact checks one channel at each sync until they are.')).toBeInTheDocument();
  });

  it('stops syncing a channel and says so', async () => {
    const { patches } = stubSlackChannels();
    const { onChanged } = renderPanel();
    await userEvent.click(within(await screen.findByText('#random').then((el) => el.closest('li') as HTMLElement)).getByRole('switch', { name: 'Sync #random' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Stopped syncing #random.');
    expect(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' })).toHaveAttribute('aria-checked', 'false');
    expect(patches).toEqual([{ channel: 'C0RANDOM', body: { included: false } }]);
    expect(onChanged).toHaveBeenCalled();
  });

  it('sets a channel to a customer', async () => {
    const { patches } = stubSlackChannels({
      fallback: (url) => ok(url.pathname.includes('/customers/') ? { results: [{ id: 29, name: 'Globex (QA)' }] } : { results: [] }),
    });
    renderPanel();
    await screen.findByText('#globex-escalations');
    await userEvent.click(within(rowOf('globex-escalations')).getByRole('button', { name: 'Choose the customer of #globex-escalations' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Glo');
    await userEvent.click(await screen.findByRole('button', { name: 'Globex (QA)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('#globex-escalations now files under Globex (QA).');
    expect(within(rowOf('globex-escalations')).getByText(/Files under Globex \(QA\)/)).toBeInTheDocument();
    expect(patches).toEqual([{ channel: 'C0GLOBEX', body: { record: { type: 'customer', id: 29 } } }]);
  });

  it('shows a refusal under its row', async () => {
    stubSlackChannels({ refuse: { status: 400, body: { included: ['Choose on or off.'] } } });
    renderPanel();
    await screen.findByText('#random');
    await userEvent.click(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' }));
    expect(await within(rowOf('random')).findByRole('alert')).toHaveTextContent('Choose on or off.');
    expect(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows a refused customer save once, inside the form (R4)', async () => {
    stubSlackChannels({
      refuse: { status: 400, body: { record: ['That customer is not yours.'] } },
      fallback: (url) => ok(url.pathname.includes('/customers/') ? { results: [{ id: 29, name: 'Globex (QA)' }] } : { results: [] }),
    });
    renderPanel();
    await screen.findByText('#globex-escalations');
    await userEvent.click(within(rowOf('globex-escalations')).getByRole('button', { name: 'Choose the customer of #globex-escalations' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Glo');
    await userEvent.click(await screen.findByRole('button', { name: 'Globex (QA)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('That customer is not yours.');
    expect(alerts[0].closest('form')).not.toBeNull();
  });

  it('clears the earlier status line when the next change is refused (R5)', async () => {
    const { spy } = stubSlackChannels();
    let patched = 0;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PATCH' && ++patched === 2 ? Promise.resolve({ ok: false, status: 400, json: async () => ({ included: ['Choose on or off.'] }) }) : spy(input, init),
    );
    renderPanel();
    await screen.findByText('#random');
    await userEvent.click(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Stopped syncing #random.');
    await userEvent.click(within(rowOf('all-alfiee')).getByRole('switch', { name: 'Sync #all-alfiee' }));
    await within(rowOf('all-alfiee')).findByRole('alert');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('says when it cannot join yet, and offers to approve the app again', async () => {
    stubSlackChannels({ canJoin: false });
    const { onReconnect } = renderPanel();
    expect(await screen.findByText(/Slack hasn't let Revenact join channels yet/)).toBeInTheDocument();
    expect(within(rowOf('globex-escalations')).getByText(/Revenact isn't in it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve again' }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it('finds a channel by name when there are many', async () => {
    const many = Array.from({ length: 10 }, (_, n) => ({ ...CHANNEL_ROWS[1], id: `C0N${n}`, name: `team-${n}` }));
    stubSlackChannels({ rows: [...CHANNEL_ROWS, ...many] });
    renderPanel();
    const find = await screen.findByRole('searchbox', { name: 'Find a channel' });
    await userEvent.type(find, 'globex');
    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual(['Sync #globex-escalations', 'Sync #globex-shared']);
    await userEvent.clear(find);
    await userEvent.type(find, 'nothing-like-it');
    expect(screen.getByText('No channel has that name.')).toBeInTheDocument();
  });

  it('loading, empty and a failed load', async () => {
    stubSlackChannels({ rows: [] });
    renderPanel();
    expect(screen.getByText('Loading channels…')).toBeInTheDocument();
    expect(await screen.findByText('No public channels yet')).toBeInTheDocument();
  });

  it('a failed load offers Retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({ detail: 'down' }) })));
    renderPanel();
    expect(await screen.findByText("Couldn't load the channels.")).toBeInTheDocument();
    stubSlackChannels();
    await userEvent.click(screen.getByRole('button', { name: /Retry|Try again/ }));
    expect(await screen.findByText('#all-alfiee')).toBeInTheDocument();
  });

  it('Done closes the panel from the list, the empty state and an error', async () => {
    stubSlackChannels();
    const loaded = renderPanel();
    await screen.findByText('#random');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(loaded.onDone).toHaveBeenCalledTimes(1);
    cleanup();
    stubSlackChannels({ rows: [] });
    const empty = renderPanel();
    await screen.findByText('No public channels yet');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(empty.onDone).toHaveBeenCalledTimes(1);
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    const failed = renderPanel();
    await screen.findByText("Couldn't load the channels.");
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(failed.onDone).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the row Customer button after Cancel', async () => {
    stubSlackChannels();
    renderPanel();
    await screen.findByText('#random');
    const button = within(rowOf('random')).getByRole('button', { name: 'Choose the customer of #random' });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(button).toHaveFocus();
  });

  it('keeps each channel busy on its own while saves overlap', async () => {
    const { spy } = stubSlackChannels();
    const gates: Record<string, () => void> = {};
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'PATCH') return spy(input, init);
      const channel = decodeURIComponent(/slack-channels\/([^/]+)\//.exec(String(input))![1]);
      return new Promise((resolve) => {
        gates[channel] = () => resolve(spy(input, init));
      });
    });
    renderPanel();
    await screen.findByText('#random');
    const a = () => within(rowOf('random')).getByRole('switch', { name: 'Sync #random' });
    const b = () => within(rowOf('all-alfiee')).getByRole('switch', { name: 'Sync #all-alfiee' });
    await userEvent.click(a());
    await userEvent.click(b());
    await waitFor(() => expect(a()).toHaveAttribute('aria-busy', 'true'));
    expect(b()).toHaveAttribute('aria-busy', 'true');
    gates.C0CA7PPRP7A();
    await waitFor(() => expect(b()).not.toHaveAttribute('aria-busy', 'true'));
    expect(a()).toHaveAttribute('aria-busy', 'true');
    gates.C0RANDOM();
    await waitFor(() => expect(a()).not.toHaveAttribute('aria-busy', 'true'));
  });

  it("a busy channel's customer save sends nothing and says so inside the form", async () => {
    const { spy } = stubSlackChannels({
      fallback: (url) => ok(url.pathname.includes('/customers/') ? { results: [{ id: 29, name: 'Globex (QA)' }] } : { results: [] }),
    });
    let release: () => void = () => {};
    let patches = 0;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'PATCH') return spy(input, init);
      patches += 1;
      return new Promise((resolve) => {
        release = () => resolve(spy(input, init));
      });
    });
    renderPanel();
    await screen.findByText('#random');
    await userEvent.click(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' }));
    await waitFor(() => expect(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' })).toHaveAttribute('aria-busy', 'true'));
    await userEvent.click(within(rowOf('random')).getByRole('button', { name: 'Choose the customer of #random' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Always this customer:' }));
    await userEvent.type(screen.getByLabelText('Organisation or account'), 'Glo');
    await userEvent.click(await screen.findByRole('button', { name: 'Globex (QA)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByText('Still saving this channel. Try again in a moment.');
    expect(alert.closest('form')).not.toBeNull();
    expect(patches).toBe(1);
    release();
    await waitFor(() => expect(within(rowOf('random')).getByRole('switch', { name: 'Sync #random' })).not.toHaveAttribute('aria-busy', 'true'));
  });
});

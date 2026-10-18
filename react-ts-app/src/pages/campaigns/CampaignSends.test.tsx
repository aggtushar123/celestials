import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SENDING_DELIVERY, SENDING_SEND, SENDS } from '../../features/campaigns/testCampaignFixtures';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const send = (id: number) => document.querySelector(`[data-send="${id}"]`) as HTMLElement;
const people = async () => within(await screen.findByRole('list', { name: 'People' })).getAllByRole('listitem');

describe("a campaign's sends (spec §2.3)", () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetViewport();
  });

  it('lists each send newest first: the day, who sent it, the figures in mono, Migrated marked', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/14');
    const list = await screen.findByRole('list', { name: 'Sends' });
    expect(within(list).getAllByRole('listitem').map((item) => item.getAttribute('data-send'))).toEqual(['42', '43']);
    expect(send(42)).toHaveTextContent('28 Sep 2026');
    expect(within(send(42)).getByRole('link', { name: 'EMEA renewals' })).toHaveAttribute('href', '/scenarios/rules/8');
    expect(send(42)).toHaveTextContent('From rule EMEA renewals');
    const figures = send(42).querySelector('[data-part="figures"]') as HTMLElement;
    expect(figures).toHaveTextContent('2 sent · 1 skipped');
    expect([...figures.querySelectorAll('.tabular-nums')].map((node) => node.textContent)).toEqual(['2', '1']);
    expect(send(43)).toHaveTextContent('Sent');
    expect(send(43)).toHaveTextContent('Migrated');
  });

  it('opens a send from the URL: what went out, and who it reached, with status and reason in words', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/11?send=41');
    expect(await within(await screen.findByRole('list', { name: 'Sends' })).findByRole('button', { name: '2 Oct 2026' })).toHaveAttribute('aria-expanded', 'true');
    expect(send(41).querySelector('[data-part="as-sent"]')).toHaveTextContent('Checking in, {first_name}');
    const rows = await people();
    expect(rows.map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Sam Patel', 'Lee Wong', 'Kim Lee', 'Ana Ruiz']);
    expect(within(rows[0]).getByRole('link', { name: 'Sam Patel' })).toHaveAttribute('href', '/contacts/51');
    expect(within(rows[0]).getByRole('link', { name: 'Globex' })).toHaveAttribute('href', '/organizations/1');
    expect(rows[0].querySelector('[data-delivery-status]')).toHaveTextContent('Sent');
    expect(rows[2].querySelector('[data-delivery-status]')).toHaveTextContent('Skipped');
    expect(rows[2]).toHaveTextContent("Couldn't be delivered");
    expect(rows[3].querySelector('[data-delivery-status]')).toHaveTextContent('Skipped');
    expect(rows[3]).toHaveTextContent('Unsubscribed');
  });

  it('filters by Sent or Skipped, and by a reason only with Skipped', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/11?send=41');
    await people();
    const show = screen.getByRole('group', { name: 'Show' });
    expect(within(show).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox', { name: 'Reason' })).toBeNull();
    await userEvent.click(within(show).getByRole('button', { name: 'Skipped' }));
    await waitFor(async () => expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Kim Lee', 'Ana Ruiz']));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Reason' }), 'unsubscribed');
    await waitFor(async () => expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Ana Ruiz']));
    const last = requestsOf(spy, 'GET', /^\/campaigns\/11\/sends\/41\/deliveries\/$/).at(-1);
    expect(last?.query.get('status')).toBe('skipped');
    expect(last?.query.get('reason')).toBe('unsubscribed');
    await userEvent.click(within(show).getByRole('button', { name: 'Sent' }));
    await waitFor(async () => expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Sam Patel', 'Lee Wong']));
    expect(screen.queryByRole('combobox', { name: 'Reason' })).toBeNull();
  });

  it("counts the people the reader may not open, and never names them", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/14?send=42');
    expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Pia Holm', 'Eva Lind']);
    expect(document.querySelector('[data-part="hidden"]')).toHaveTextContent("1 more person you can't open");
    expect(screen.queryByText('Ola Berg')).toBeNull();
  });

  it('keeps the open send in the URL', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/11');
    const toggle = await within(await screen.findByRole('list', { name: 'Sends' })).findByRole('button', { name: '2 Oct 2026' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(where()).toBe('/campaigns/11?send=41'));
    await userEvent.click(toggle);
    await waitFor(() => expect(where()).toBe('/campaigns/11'));
  });

  it('pages the people with Show more people', async () => {
    stubCampaigns({ pageSize: 2 });
    renderCampaigns('/campaigns/11?send=41');
    expect(await people()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Show more people' }));
    await waitFor(async () => expect(await people()).toHaveLength(4));
  });

  it('a Show more people that answers after switching to Skipped leaves the Skipped list, never a stuck skeleton', async () => {
    const { spy } = stubCampaigns({ pageSize: 2 });
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('cursor=')) await held;
      return spy(input, init);
    });
    renderCampaigns('/campaigns/11?send=41');
    expect(await people()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Show more people' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Skipped' }));
    await waitFor(async () => expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Kim Lee', 'Ana Ruiz']));
    await act(async () => {
      release();
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByLabelText('Loading who it reached')).toBeNull();
    expect((await people()).map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Kim Lee', 'Ana Ruiz']);
    expect(screen.queryByText('Could not load more people.')).toBeNull();
  });

  it('says Sending… with the counts so far, reads the send again every 5 seconds until it is sent, then reads the campaign again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { spy } = stubCampaigns({ sends: [...SENDS, SENDING_SEND], stillSending: 1 });
    renderCampaigns('/campaigns/11');
    await waitFor(() => expect(send(45)).toHaveTextContent('Sending…'));
    // The counts so far are shown alongside "Sending…", not hidden until it finishes.
    expect(send(45)).toHaveTextContent('1 sent · 0 skipped');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(requestsOf(spy, 'GET', /^\/campaigns\/11\/sends\/45\/$/)).toHaveLength(1);
    expect(send(45)).toHaveTextContent('Sending…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(send(45).querySelector('[data-part="figures"]')).toHaveTextContent('1 sent · 0 skipped'));
    expect(send(45)).not.toHaveTextContent('Sending…');
    await waitFor(() => expect(requestsOf(spy, 'GET', /^\/campaigns\/11\/$/)).toHaveLength(2));
  });

  it('stops polling a sending send once the component unmounts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { spy } = stubCampaigns({ sends: [...SENDS, SENDING_SEND], stillSending: 5 });
    const page = renderCampaigns('/campaigns/11');
    await waitFor(() => expect(send(45)).toHaveTextContent('Sending…'));
    page.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(requestsOf(spy, 'GET', /^\/campaigns\/11\/sends\/45\/$/)).toHaveLength(0);
  });

  it('backs off after a failed read instead of retrying every 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { spy } = stubCampaigns({ sends: [...SENDS, SENDING_SEND], stillSending: 1 });
    let fail = true;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (fail && /\/campaigns\/11\/sends\/45\/$/.test(new URL(String(input)).pathname) && (init?.method ?? 'GET') === 'GET') {
        fail = false;
        throw new Error('network down');
      }
      return spy(input, init);
    });
    renderCampaigns('/campaigns/11');
    await waitFor(() => expect(send(45)).toHaveTextContent('Sending…'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    // The failed read is retried, but not after another plain 5s: it backs off.
    expect(requestsOf(spy, 'GET', /^\/campaigns\/11\/sends\/45\/$/)).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(requestsOf(spy, 'GET', /^\/campaigns\/11\/sends\/45\/$/)).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(requestsOf(spy, 'GET', /^\/campaigns\/11\/sends\/45\/$/)).toHaveLength(1);
  });

  it('refreshes an open Deliveries panel once the send it belongs to finishes', async () => {
    // Fake timers from before the first render: a timer useSendPoll schedules
    // on mount must be one `advanceTimersByTimeAsync` can see, or it never fires.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubCampaigns({ sends: [...SENDS, SENDING_SEND], deliveries: [SENDING_DELIVERY], stillSending: 1 });
    renderCampaigns('/campaigns/11?send=45');
    const rows = () => within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem');
    await waitFor(() => expect(screen.queryByRole('list', { name: 'People' })).not.toBeNull());
    expect(rows().map((row) => row.querySelector('[data-delivery-status]')?.textContent)).toEqual(['Waiting']);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(send(45)).not.toHaveTextContent('Sending…'));
    // Still open, no toggle, no manual reload: the panel re-read itself.
    await waitFor(() => expect(rows().map((row) => row.querySelector('[data-delivery-status]')?.textContent)).toEqual(['Sent']));
  });

  it('says when it has not been sent yet', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/12');
    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WIN_BACK } from '../../features/campaigns/testCampaignFixtures';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const names = async () =>
  within(await screen.findByRole('list', { name: 'Campaigns' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('link')[0].textContent);
const row = (id: number) => document.querySelector(`[data-campaign="${id}"]`) as HTMLElement;

describe('/campaigns (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows a skeleton, then my campaigns newest first: segment, owner, status and last send', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns');
    expect(screen.getByRole('status', { busy: true })).toHaveTextContent('Loading campaigns');
    expect(await names()).toEqual(['Champion news', 'Win-back', 'Spring offer']);
    const winBack = row(11);
    expect(within(winBack).getByRole('link', { name: 'Win-back' })).toHaveAttribute('href', '/campaigns/11');
    expect(winBack).toHaveTextContent('Active');
    expect(winBack).toHaveTextContent('Renewal risk');
    expect(winBack).toHaveTextContent('You');
    const last = winBack.querySelector('[data-part="last-send"]') as HTMLElement;
    expect(last).toHaveTextContent('2 Oct · 2 sent · 2 skipped');
    expect([...last.querySelectorAll('.tabular-nums')].map((node) => node.textContent)).toEqual(['2', '2']);
    expect(row(12)).toHaveTextContent('Draft');
    expect(row(12).querySelector('[data-part="last-send"]')).toHaveTextContent('Never sent');
    expect(row(13).querySelector('[data-part="last-send"]')).toHaveTextContent('Choose a segment to send');
    expect(row(13)).toHaveTextContent('No segment');
    expect(screen.getByRole('link', { name: 'New campaign' })).toHaveAttribute('href', '/campaigns/new');
  });

  it('lists what teammates shared under Shared with me, with their names, in the URL', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns');
    await names();
    await userEvent.click(screen.getByRole('button', { name: 'Shared with me' }));
    await waitFor(() => expect(where()).toBe('/campaigns?tab=shared'));
    expect(await names()).toEqual(['EMEA newsletter']);
    expect(row(14)).toHaveTextContent('Carl CSM');
    expect(row(14)).toHaveTextContent('EMEA accounts');
    expect(requestsOf(spy, 'GET', /^\/campaigns\/$/).map((request) => request.query.get('tab'))).toEqual(['mine', 'shared']);
  });

  it('adds archived campaigns with Show archived, kept in the URL', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns');
    await names();
    await userEvent.click(screen.getByRole('button', { name: 'Show archived' }));
    await waitFor(() => expect(where()).toBe('/campaigns?archived=1'));
    await waitFor(() => expect(row(16)).toHaveTextContent('Archived'));
    expect(requestsOf(spy, 'GET', /^\/campaigns\/$/).at(-1)?.query.get('archived')).toBe('1');
  });

  it('says there are none yet, with New campaign, and that nothing is shared yet', async () => {
    stubCampaigns({ campaigns: [] });
    renderCampaigns('/campaigns');
    expect(await screen.findByText('No campaigns yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New campaign' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Shared with me' }));
    expect(await screen.findByText('Nothing shared with you yet')).toBeInTheDocument();
  });

  it('shows an error with Try again, then the list', async () => {
    stubCampaigns({ failList: 1 });
    renderCampaigns('/campaigns');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await names()).toEqual(['Champion news', 'Win-back', 'Spring offer']);
  });

  it('reads the next page with Show more campaigns', async () => {
    stubCampaigns({ pageSize: 2 });
    renderCampaigns('/campaigns');
    expect(await names()).toEqual(['Champion news', 'Win-back']);
    await userEvent.click(screen.getByRole('button', { name: 'Show more campaigns' }));
    await waitFor(() => expect(row(13)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Show more campaigns' })).toBeNull();
  });

  it('moves focus to the first new row on the last page, after Show more is gone', async () => {
    stubCampaigns({ pageSize: 2 });
    renderCampaigns('/campaigns');
    expect(await names()).toEqual(['Champion news', 'Win-back']);
    await userEvent.click(screen.getByRole('button', { name: 'Show more campaigns' }));
    await waitFor(() => expect(within(row(13)).getAllByRole('link')[0]).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Show more campaigns' })).toBeNull();
  });

  it('moves focus to the first new row on a page that is not the last', async () => {
    stubCampaigns({ pageSize: 1 });
    renderCampaigns('/campaigns');
    expect(await names()).toEqual(['Champion news']);
    await userEvent.click(screen.getByRole('button', { name: 'Show more campaigns' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Campaigns' })).getAllByRole('listitem')).toHaveLength(2));
    const second = within(screen.getByRole('list', { name: 'Campaigns' })).getAllByRole('listitem')[1];
    await waitFor(() => expect(within(second).getAllByRole('link')[0]).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Show more campaigns' })).toBeInTheDocument();
  });

  it('keeps every row inside the screen on a phone', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns', { width: 375 });
    await names();
    // Below the container breakpoint a row is one flex line, its title block allowed to shrink.
    expect(row(11)).toHaveClass('flex');
    expect(row(11).querySelector('.min-w-0')).not.toBeNull();
  });
});

describe('Campaigns on the primitives (Impact PR)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('is one toolbar: Mine | Shared with me leads, Show archived a chip, New campaign last', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns');
    const scope = await screen.findByRole('group', { name: 'Show' });
    expect(within(scope).getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
    expect(scope.closest('[data-part="toolbar-lead"]')).not.toBeNull();
    const archived = screen.getByRole('button', { name: 'Show archived' });
    expect(archived).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Show archived' })).toBeNull();
    expect(screen.getByRole('link', { name: 'New campaign' })).toHaveClass('bg-accent');
  });

  it('lists the campaigns in one card on the campaigns grid', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns');
    const list = await screen.findByRole('list', { name: 'Campaigns' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line');
    expect(list.closest('.\\@container')).not.toBeNull();
    const item = list.querySelector(`[data-campaign="${WIN_BACK.id}"]`)!;
    expect(item.className).toContain('@min-[44rem]:grid-cols-[minmax(14rem,1fr)_6rem_16rem]');
    expect(within(item as HTMLElement).getByText('Active')).toHaveClass('bg-success-dim', 'text-success-ink');
  });

  it('carries the status word in the narrow meta line, where the status column is hidden', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns?archived=1');
    await waitFor(() => expect(row(16)).toBeInTheDocument());
    const narrow = row(16).querySelector('[data-part="status-narrow"]') as HTMLElement;
    expect(narrow).toHaveClass('@min-[44rem]:hidden');
    expect(narrow).toHaveTextContent('Archived');
  });
});

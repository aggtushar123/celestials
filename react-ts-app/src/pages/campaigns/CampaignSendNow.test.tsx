import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/campaigns/campaignOptions';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const meta = () => document.querySelector('[data-part="meta"]') as HTMLElement;

describe('Send now… on a campaign page (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('counts again, sends once, and opens the new send with the campaign now active', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/12');
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion news' });
    await waitFor(() => expect(dialog.querySelector('[data-part="audience"]')).toHaveTextContent('Emails 3 people · Skips 1 without an email'));
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/12?send=500'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/sends\/$/)).toHaveLength(1);
    await waitFor(() => expect(meta()).toHaveTextContent('Active'));
    const row = await waitFor(() => {
      const found = document.querySelector('[data-send="500"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(within(row).getByRole('button', { name: /Oct 2026/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await within(row).findByRole('link', { name: 'Rosa Diaz' })).toBeInTheDocument();
  });

  it('keeps EMAIL_NOT_SET_UP at the Send button, focused, and stays open', async () => {
    stubCampaigns({ noEmail: true });
    renderCampaigns('/campaigns/12');
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion news' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Send now' }));
    const refusal = await within(dialog).findByRole('alert');
    expect(refusal).toHaveTextContent(SAY.EMAIL_NOT_SET_UP);
    expect(document.activeElement).toBe(refusal);
    expect(where()).toBe('/campaigns/12');
  });

  it('will not send to nobody', async () => {
    stubCampaigns({ people: { 9: [] } });
    renderCampaigns('/campaigns/12');
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion news' });
    expect(await within(dialog).findByText(SAY.NOBODY)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeDisabled();
  });

  it.each([
    ['a teammate’s', 14],
    ['an archived', 16],
    ['a migrated draft with no segment, as', 13],
  ])('offers no Send now… on %s campaign', async (_, id) => {
    stubCampaigns();
    renderCampaigns(`/campaigns/${id}`);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Send now…' })).toBeNull();
  });

  it('a send from the editor over the page opens on the page, which reads again', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/12/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Champion news' });
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/12?send=500'));
    await waitFor(() => expect(meta()).toHaveTextContent('Active'));
    await waitFor(() => expect(document.querySelector('[data-send="500"]')).not.toBeNull());
  });
});

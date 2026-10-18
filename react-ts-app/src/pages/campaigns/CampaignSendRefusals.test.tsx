import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { updateCampaign } from '../../features/campaigns/campaignApi';
import { SAY } from '../../features/campaigns/campaignOptions';
import { stubCampaigns, type CampaignsStub } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const POSTS = /^\/campaigns\/12\/sends\/$/;

/** Open the confirm step, from the campaign page's dialog or the editor. */
const ENTRIES = {
  'the campaign page': async () => {
    renderCampaigns('/campaigns/12');
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion news' });
    await within(dialog).findByRole('heading', { name: 'Send Champion news now?' });
    return dialog;
  },
  'the editor': async () => {
    renderCampaigns('/campaigns/12/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Champion news' });
    await within(modal).findByRole('combobox', { name: 'Preview for' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now…' }));
    await within(modal).findByRole('heading', { name: 'Send Champion news now?' });
    return modal;
  },
};

describe.each(Object.entries(ENTRIES))('Send now refusals from %s (backend sending._refusal)', (_, open) => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  async function refusedWith(words: string, scope: HTMLElement) {
    await userEvent.click(within(scope).getByRole('button', { name: 'Send now' }));
    const refusal = await within(scope).findByRole('alert');
    expect(refusal).toHaveTextContent(words);
    expect(document.activeElement).toBe(refusal);
    expect(within(scope).getByRole('button', { name: 'Send now' })).toHaveAccessibleDescription(words);
    expect(where()).not.toMatch(/send=/);
  }

  it('keeps "Its owner is no longer active." at the Send button, focused', async () => {
    const { spy } = stubCampaigns({ ownerInactive: true });
    await refusedWith(SAY.OWNER_INACTIVE, await open());
    expect(requestsOf(spy, 'POST', POSTS)).toHaveLength(1);
  });

  it('keeps "This campaign is archived." at the Send button when it was archived meanwhile', async () => {
    const { spy } = stubCampaigns();
    const scope = await open();
    await act(async () => {
      await updateCampaign(12, { status: 'archived' });
    });
    await refusedWith(SAY.ARCHIVED, scope);
    expect(requestsOf(spy, 'POST', POSTS)).toHaveLength(1);
  });

  it('sends on a second click after a refusal: exactly two POSTs', async () => {
    const options: CampaignsStub = { noEmail: true };
    const { spy } = stubCampaigns(options);
    const scope = await open();
    await refusedWith(SAY.EMAIL_NOT_SET_UP, scope);
    options.noEmail = false;
    await userEvent.click(within(scope).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/12?send=500'));
    expect(requestsOf(spy, 'POST', POSTS)).toHaveLength(2);
  });
});

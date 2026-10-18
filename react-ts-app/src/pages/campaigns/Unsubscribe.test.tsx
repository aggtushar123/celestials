import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { THROTTLED } from '../../features/surveys/surveyErrors';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderUnsubscribe } from './testPages';

const TOKEN = 'tok-41-51';

describe('/u/:token (spec §2.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('asks before it unsubscribes anyone, so opening the link changes nothing', async () => {
    const { spy } = stubCampaigns();
    renderUnsubscribe(TOKEN);
    expect(screen.getByRole('status', { name: 'Opening the link' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Stop emails from Acme Inc?' })).toHaveClass('text-[22px]');
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/campaigns\/unsubscribe\//)).toHaveLength(0);
  });

  it('unsubscribes once on the button, and says so', async () => {
    const { spy } = stubCampaigns();
    renderUnsubscribe(TOKEN);
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByRole('heading', { level: 1, name: "You're unsubscribed." })).toBeInTheDocument();
    expect(screen.getByText("You won't get more of these emails.")).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/campaigns\/unsubscribe\/tok-41-51\/$/)).toHaveLength(1);
  });

  it('announces the result in a live region and moves focus to it', async () => {
    stubCampaigns();
    renderUnsubscribe(TOKEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    const heading = await screen.findByRole('heading', { level: 1, name: "You're unsubscribed." });
    const status = screen.getByRole('status');
    expect(status).toContainElement(heading);
    expect(status).toHaveTextContent(/You're unsubscribed\.\s*You won't get more of these emails\./);
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('announces and focuses the expired page when the click finds the link expired', async () => {
    stubCampaigns();
    renderUnsubscribe(TOKEN);
    const button = await screen.findByRole('button', { name: 'Unsubscribe' });
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ detail: 'This link has expired.' }) })));
    await userEvent.click(button);
    const heading = await screen.findByRole('heading', { level: 1, name: 'This link has expired.' });
    expect(screen.getByRole('status')).toContainElement(heading);
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('shows one expired page for any bad link', async () => {
    stubCampaigns();
    renderUnsubscribe('nope');
    expect(await screen.findByRole('heading', { level: 1, name: 'This link has expired.' })).toBeInTheDocument();
    expect(screen.getByText('Unsubscribe links work for 365 days.')).toBeInTheDocument();
  });

  it('has its own words when there were too many tries', async () => {
    stubCampaigns({ throttle: true });
    renderUnsubscribe(TOKEN);
    expect(await screen.findByText(THROTTLED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keeps a refused click beside the button, focused, and lets it be tried again', async () => {
    stubCampaigns();
    renderUnsubscribe(TOKEN);
    const button = await screen.findByRole('button', { name: 'Unsubscribe' });
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ detail: 'Request was throttled.' }) })));
    await userEvent.click(button);
    const refusal = await screen.findByRole('alert');
    expect(refusal).toHaveTextContent(THROTTLED);
    expect(document.activeElement).toBe(refusal);
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).not.toBeDisabled();
  });

  it('offers Try again when the link could not be read, then opens it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    renderUnsubscribe(TOKEN);
    expect(await screen.findByText('Could not open this link. Check your connection and try again.')).toBeInTheDocument();
    vi.unstubAllGlobals();
    stubCampaigns();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Stop emails from Acme Inc?' })).toBeInTheDocument();
  });
});

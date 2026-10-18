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
const segmentReady = async (modal: HTMLElement) => {
  const select = within(modal).getByRole('combobox', { name: 'Segment' });
  await waitFor(() => expect(select).not.toBeDisabled());
  return select;
};

describe('the campaign editor (spec §2.2)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens over the list with Name focused, and saves a new campaign once, opening its page', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(name);
    await userEvent.type(name, 'Champion update');
    await userEvent.selectOptions(await segmentReady(modal), '9');
    expect(within(modal).queryByRole('group', { name: /Who to email/ })).toBeNull();
    await userEvent.dblClick(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100'));
    const posts = requestsOf(spy, 'POST', /^\/campaigns\/$/);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ name: 'Champion update', segment: 9, roles: [], subject: '', body: '', sharing: 'private' });
  });

  it("asks whom to email at each organisation, Surveys' roles ticked, and refuses none", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Renewals');
    await userEvent.selectOptions(await segmentReady(modal), '7');
    const roles = within(modal).getByRole('group', { name: 'Who to email at each organisation' });
    expect(within(roles).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Decision Maker' })).toBeChecked();
    await userEvent.click(within(roles).getByRole('checkbox', { name: 'Champion' }));
    await userEvent.click(within(roles).getByRole('checkbox', { name: 'Decision Maker' }));
    expect(within(modal).getByRole('button', { name: 'Send now…' })).toBeDisabled();
    expect(modal).toHaveTextContent('Choose at least one role to send.');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    const refusal = await within(roles).findByRole('alert');
    expect(refusal).toHaveTextContent('Choose at least one role.');
    expect(document.activeElement).toBe(refusal);
  });

  it('refuses a missing name at its field, and focuses it', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await segmentReady(modal);
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Give it a name.');
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(requestsOf(spy, 'POST', /^\/campaigns\/$/)).toHaveLength(0);
  });

  it('shows a refusal with no field above the form, focused', async () => {
    stubCampaigns({ limit: 3 });
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await segmentReady(modal);
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'One too many');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    const alert = await within(modal).findByText(SAY.LIMIT);
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it('edits over the page, sending only what changed, and returns to the page', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/11/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Win-back' });
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Win-back');
    const subject = within(modal).getByRole('textbox', { name: 'Subject' });
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Checking in');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(where()).toBe('/campaigns/11'));
    expect(requestsOf(spy, 'PATCH', /^\/campaigns\/11\/$/).map((request) => request.body)).toEqual([{ subject: 'Checking in' }]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Win-back' })).toBeInTheDocument();
  });

  it('tells anyone but the owner who can edit it', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/14/edit');
    expect(await screen.findByText('Only Carl CSM can edit this campaign')).toBeInTheDocument();
  });

  it('keeps the draft when the scrim is clicked', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Kept');
    await userEvent.click(document.querySelector('[data-scrim]') as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'New campaign' })).toBeInTheDocument();
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Kept');
  });

  it('asks for a subject and a body before sending', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Empty');
    await userEvent.selectOptions(await segmentReady(modal), '9');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now…' }));
    expect(within(modal).getByRole('textbox', { name: 'Subject' })).toHaveAccessibleDescription(/Write a subject line\./);
    expect(within(modal).getByRole('textbox', { name: 'Body' })).toHaveAccessibleDescription(/Write the email\./);
    await waitFor(() => expect(document.activeElement).toBe(within(modal).getByRole('textbox', { name: 'Subject' })));
  });

  it('Send now… saves, counts again on the server, confirms, sends once and opens the send', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/12/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Champion news' });
    await within(modal).findByRole('combobox', { name: 'Preview for' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now…' }));
    const heading = await within(modal).findByRole('heading', { name: 'Send Champion news now?' });
    expect(document.activeElement).toBe(heading);
    const audience = modal.querySelector('[data-part="audience"]') as HTMLElement;
    expect(audience).toHaveTextContent('Emails 3 people · Skips 1 without an email');
    expect([...audience.querySelectorAll('.tabular-nums')].map((node) => node.textContent)).toEqual(['3', '1']);
    expect(requestsOf(spy, 'GET', /^\/campaigns\/12\/audience\/$/)).toHaveLength(2);
    await userEvent.dblClick(within(modal).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/12?send=500'));
    expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/sends\/$/)).toHaveLength(1);
  });

  it('keeps EMAIL_NOT_SET_UP at the Send button, focused, and the campaign saved', async () => {
    const { spy } = stubCampaigns({ noEmail: true });
    renderCampaigns('/campaigns/new');
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Hello');
    await userEvent.selectOptions(await segmentReady(modal), '9');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Subject' }), 'Hi');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Body' }), 'Hello there');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now' }));
    const refusal = await within(modal).findByRole('alert');
    expect(refusal).toHaveTextContent(SAY.EMAIL_NOT_SET_UP);
    expect(document.activeElement).toBe(refusal);
    expect(within(modal).getByRole('button', { name: 'Send now' })).toHaveAccessibleDescription(SAY.EMAIL_NOT_SET_UP);
    expect(requestsOf(spy, 'POST', /^\/campaigns\/$/)).toHaveLength(1);
    // Closing now opens the saved draft.
    await userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100'));
  });

  it('will not send when nobody can be emailed, and Back returns to Send now…', async () => {
    stubCampaigns({ people: { 9: [] } });
    renderCampaigns('/campaigns/12/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Champion news' });
    const send = await within(modal).findByRole('button', { name: 'Send now…' });
    await userEvent.click(send);
    expect(await within(modal).findByText(SAY.NOBODY)).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Send now' })).toBeDisabled();
    await userEvent.click(within(modal).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(document.activeElement).toBe(within(modal).getByRole('button', { name: 'Send now…' })));
  });

  it('lays the preview below the form on phones and beside it from lg', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/new', { width: 375 });
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    expect(modal.querySelector('[data-part="builder-columns"]')).toHaveClass('grid', 'lg:grid-cols-[minmax(0,1fr)_24rem]');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCampaigns } from '../features/campaigns/testCampaigns';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { requestsOf } from '../features/surveys/testSurveys';
import { renderCampaigns, renderUnsubscribe } from '../pages/campaigns/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the Campaigns pages,
// the unsubscribe page, the store and the router. Only fetch is stubbed, by a
// stateful stub in the contract's shapes that skips people in spec §1.3's
// order (spec §2.6: build on a segment, preview, send, read the deliveries,
// unsubscribe through /u/:token, send again and see that person skipped).
const where = () => screen.getByTestId('where').textContent;
const names = (list: HTMLElement) => within(list).getAllByRole('listitem').map((item) => within(item).getAllByRole('link')[0].textContent);

describe('Campaigns', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('builds, previews and sends a campaign, takes an unsubscribe, and skips that person next time', { timeout: 30000 }, async () => {
    const { spy, tokensOf, addPerson } = stubCampaigns();

    // 1. A new campaign from the list, on the Champions contact segment.
    const team = renderCampaigns('/campaigns', { nav: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Campaigns' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'New campaign' }));
    const modal = await screen.findByRole('dialog', { name: 'New campaign' });
    expect(where()).toBe('/campaigns/new');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion update');
    const segment = within(modal).getByRole('combobox', { name: 'Segment' });
    await waitFor(() => expect(segment).not.toBeDisabled());
    await userEvent.selectOptions(segment, '9');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Subject' }), 'News for {{first_name}');
    const body = within(modal).getByRole('textbox', { name: 'Body' });
    await userEvent.type(body, 'Hello ');
    await userEvent.click(within(modal).getByRole('button', { name: 'Insert {first_name}' }));
    await userEvent.type(body, ', we have news.');
    expect(body).toHaveValue('Hello {first_name}, we have news.');
    expect(within(modal).getByRole('region', { name: 'Preview' })).toHaveTextContent('Save the draft to see it for a real person.');

    // 2. Save: its page opens. Edit previews it for real people.
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100'));
    await userEvent.click(await screen.findByRole('link', { name: 'Edit' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit Champion update' });
    const preview = within(edit).getByRole('region', { name: 'Preview' });
    await waitFor(() => expect(preview.querySelector('[data-part="subject"]')).toHaveTextContent('News for Rosa'));
    await userEvent.selectOptions(await within(preview).findByRole('combobox', { name: 'Preview for' }), '62');
    await waitFor(() => expect(preview.querySelector('[data-part="body"]')).toHaveTextContent('Hello Tom, we have news.'));

    // 3. Send now…, on a fresh count; the send opens on the page.
    await userEvent.click(within(edit).getByRole('button', { name: 'Send now…' }));
    await waitFor(() => expect(edit.querySelector('[data-part="audience"]')).toHaveTextContent('Emails 3 people · Skips 1 without an email'));
    await userEvent.click(within(edit).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100?send=500'));

    // 4. Who it reached: the people I can open, one skipped, one I can't open.
    expect(names(await screen.findByRole('list', { name: 'People' }))).toEqual(['Rosa Diaz', 'Tom Hale', 'Ivy Chen']);
    expect(document.querySelector('[data-part="hidden"]')).toHaveTextContent("1 more person you can't open");
    team.unmount();

    // 5. Rosa opens her link: no app frame, no session; she unsubscribes.
    const token = tokensOf(500).find((one) => one.contact === 61)?.token as string;
    const rosa = renderUnsubscribe(token);
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByRole('heading', { level: 1, name: "You're unsubscribed." })).toBeInTheDocument();
    rosa.unmount();

    // 6. Someone joins the segment; the next send reaches only them and
    // skips Rosa as unsubscribed.
    addPerson(9, { contact: { id: 65, name: 'Uma Shah' }, record: { kind: 'organization', id: 2, name: 'Initech' }, email: true, visible: true });
    renderCampaigns('/campaigns/100', { nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Send now…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send Champion update' });
    await waitFor(() =>
      expect(dialog.querySelector('[data-part="audience"]')).toHaveTextContent('Emails 1 person · Skips 1 unsubscribed · 2 already received it · 1 without an email'),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/campaigns/100?send=501'));
    const next = await waitFor(() => {
      const found = document.querySelector('[data-send="501"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    await within(next).findByRole('list', { name: 'People' });
    await userEvent.click(within(within(next).getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Skipped' }));
    await userEvent.selectOptions(within(next).getByRole('combobox', { name: 'Reason' }), 'unsubscribed');
    await waitFor(() => expect(names(within(next).getByRole('list', { name: 'People' }))).toEqual(['Rosa Diaz']));
    expect(within(next).getByRole('list', { name: 'People' })).toHaveTextContent('Unsubscribed');
    expect(requestsOf(spy, 'POST', /^\/campaigns\/100\/sends\/$/)).toHaveLength(2);
  });
});

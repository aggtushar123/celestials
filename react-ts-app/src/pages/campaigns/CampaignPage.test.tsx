import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BUILT_CAMPAIGN_ID, MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';
import { SAY } from '../../features/campaigns/campaignOptions';
import { CAMPAIGNS, CHAMPION_NEWS, WIN_BACK, type StoredCampaign } from '../../features/campaigns/testCampaignFixtures';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderCampaigns } from './testPages';

const where = () => screen.getByTestId('where').textContent;
/** Archive, Unarchive and Delete live in the header's ⋯ menu. */
const choose = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
  await userEvent.click(within(screen.getByRole('menu', { name: 'More actions' })).getByRole('menuitem', { name }));
};
const meta = () => document.querySelector('[data-part="meta"]') as HTMLElement;

describe('a campaign page (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("shows its name, status, segment, roles, owner and sharing, and the owner's Edit and Archive", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/11');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Win-back' });
    expect(heading).toHaveClass('text-[22px]');
    expect(meta()).toHaveTextContent('Active');
    expect(meta()).toHaveTextContent('Renewal risk');
    expect(meta()).toHaveTextContent('Champion, Decision Maker');
    expect(meta()).toHaveTextContent('Yours');
    expect(meta()).toHaveTextContent('Shared with the workspace');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/campaigns/11/edit');
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const items = within(screen.getByRole('menu', { name: 'More actions' })).getAllByRole('menuitem');
    // It has been sent, so it can only be archived.
    expect(items.map((item) => item.textContent)).toEqual(['Archive']);
  });

  it("offers nothing to change on a teammate's campaign", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/14');
    await screen.findByRole('heading', { level: 1, name: 'EMEA newsletter' });
    expect(meta()).toHaveTextContent('Owned by Carl CSM');
    expect(meta()).toHaveTextContent('Shared with Alice');
    expect(document.querySelector('[data-part="actions"]')).toBeNull();
  });

  it('archives after asking, then says so and offers Unarchive', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/11');
    await choose('Archive');
    const dialog = screen.getByRole('dialog', { name: 'Archive Win-back?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('This campaign is archived. Unarchive it to send it again.')).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/campaigns\/11\/$/).map((request) => request.body)).toEqual([{ status: 'archived' }]);
    await choose('Unarchive');
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Unarchive Win-back?' })).getByRole('button', { name: 'Unarchive' }));
    await waitFor(() => expect(document.querySelector('[data-part="archived"]')).toBeNull());
    expect(meta()).toHaveTextContent('Active');
  });

  it('deletes a never-sent campaign after asking, and goes back to the list', async () => {
    const { spy } = stubCampaigns();
    renderCampaigns('/campaigns/12');
    await choose('Delete');
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete Champion news?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/campaigns'));
    expect(requestsOf(spy, 'DELETE', /^\/campaigns\/12\/$/)).toHaveLength(1);
  });

  it("shows the server's refusal inside the delete dialog", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/12');
    await screen.findByRole('button', { name: 'More actions' });
    // It was sent from another tab since this page read it.
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ code: 'CAMPAIGN_SENT', detail: SAY.CAMPAIGN_SENT }) })));
    await choose('Delete');
    const dialog = screen.getByRole('dialog', { name: 'Delete Champion news?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(SAY.CAMPAIGN_SENT);
  });

  it("shows a migrated draft's old recipients as history, with Choose a segment to send", async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/13');
    const legacy = await screen.findByRole('region', { name: 'Picked by hand before segments' });
    expect(within(legacy).getByRole('link', { name: 'Lukas Vermeer' })).toHaveAttribute('href', '/contacts/41');
    expect(legacy).toHaveTextContent("1 more person you can't open");
    expect(within(legacy).getByRole('link', { name: 'Choose a segment to send' })).toHaveAttribute('href', '/campaigns/13/edit');
  });

  it('reads one missing campaign and one not shared the same, and a bad id too', async () => {
    stubCampaigns();
    const first = renderCampaigns('/campaigns/15');
    expect(await screen.findByText('Campaign not found')).toBeInTheDocument();
    first.unmount();
    renderCampaigns('/campaigns/abc');
    expect(await screen.findByText('Campaign not found')).toBeInTheDocument();
  });

  it('says an agent drafted it, and who approved it (Agents delivery 3)', async () => {
    const agentCampaign: StoredCampaign = { ...CHAMPION_NEWS, id: BUILT_CAMPAIGN_ID, name: 'Champion check-in', made_by: MADE_BY_OPS };
    stubCampaigns({ campaigns: [...CAMPAIGNS, agentCampaign] });
    renderCampaigns(`/campaigns/${BUILT_CAMPAIGN_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Champion check-in' })).toBeInTheDocument();
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });

  it('says nothing of an agent on a campaign a person made', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns/11');
    await screen.findByRole('heading', { level: 1, name: 'Win-back' });
    expect(document.querySelector('[data-part="made-by"]')).toBeNull();
  });
});

describe('a campaign on the primitives (Impact PR)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows Send now… and Edit, and keeps Archive and Delete in the menu with Delete last', async () => {
    stubCampaigns();
    // Never sent (id 12), so Delete is offered beside Archive.
    renderCampaigns('/campaigns/12');
    await screen.findByRole('heading', { level: 1, name: CHAMPION_NEWS.name });
    const actions = document.querySelector('[data-part="actions"]') as HTMLElement;
    expect(within(actions).getByRole('button', { name: 'Send now…' })).toHaveClass('bg-accent');
    expect(within(actions).getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.click(within(actions).getByRole('button', { name: 'More actions' }));
    const items = within(screen.getByRole('menu', { name: 'More actions' })).getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Archive');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('Delete');
    expect(items[1]).toHaveClass('text-danger-ink');
  });

  it('draws the sends as one card, each send’s figures in a live region that stays mounted', async () => {
    stubCampaigns();
    renderCampaigns(`/campaigns/${WIN_BACK.id}`);
    const heading = await screen.findByRole('heading', { name: 'Sends' });
    const card = heading.closest('section')!;
    expect(card).toHaveClass('rounded-xl', 'border-line');
    const figuresIn = () => within(card).queryAllByRole('status').filter((region) => region.getAttribute('data-part') === 'figures');
    await waitFor(() => expect(figuresIn().length).toBeGreaterThan(0));
  });
});

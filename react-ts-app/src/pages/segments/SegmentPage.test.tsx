import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AGENT_SEGMENT, DANA_PRIVATE, EMEA_ACCOUNTS, RENEWAL_RISK, SEGMENTS, requests, stubSegments } from '../../features/segments/testSegments';
import { resetViewport } from '../../test/viewport';
import { renderSegments } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const tile = (name: string) => screen.getByRole('group', { name });
const choose = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
  await userEvent.click(screen.getByRole('menuitem', { name }));
};

describe('/segments/:id (spec §3)', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('heads my segment with its name, its rules as one sentence, owner and sharing, and Edit and Survey these', async () => {
    stubSegments();
    renderSegments('/segments/7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Renewal risk' })).toBeInTheDocument();
    expect(screen.getByText('Organisations').closest('p')).toHaveTextContent(
      'Organisations where CSAT % is less than 60 and (Renewal date is in the next 90 days or Health is Poor)',
    );
    const meta = document.querySelector('[data-part="meta"]') as HTMLElement;
    expect(meta).toHaveTextContent('Yours · Shared with the workspace');
    // One span per part, the dot trailing: a wrapped phone line never starts with "·".
    const parts = [...meta.children].map((child) => child.textContent ?? '');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.filter((text) => text.trim().startsWith('·'))).toEqual([]);
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/segments/7/edit');
    expect(screen.getByRole('link', { name: 'Survey these' })).toHaveAttribute('href', '/segments/7/survey');
  });

  it('shows the tiles over every member: members, ARR covered, average health and CSAT, and the last 7 days', async () => {
    stubSegments();
    renderSegments('/segments/7');
    expect(await within(await screen.findByRole('group', { name: 'Members' })).findByText('3')).toHaveClass('tabular-nums');
    expect(within(tile('ARR covered')).getByText('$512.0K')).toBeInTheDocument();
    expect(within(tile('Average health')).getByText('5.4')).toBeInTheDocument();
    expect(within(tile('Average CSAT')).getByText('71%')).toBeInTheDocument();
    expect(within(tile('Last 7 days')).getByText('+6 / −2')).toBeInTheDocument();
  });

  it('shows a shared reader the rules with what they cannot open unnamed, the count of the rest in mono, and no Edit or Delete', async () => {
    stubSegments();
    renderSegments('/segments/8');
    expect(await screen.findByText("an organisation you can't open")).toBeInTheDocument();
    expect(document.querySelector('[data-part="meta"]')).toHaveTextContent('Owned by Carl CSM · Shared with Alice');
    const hidden = await screen.findByText(/more members you can't open\./);
    expect(hidden).toHaveTextContent("2 more members you can't open.");
    expect(within(hidden).getByText('2')).toHaveClass('tabular-nums');
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
  });

  it('shows no hidden-members line to the owner', async () => {
    stubSegments();
    renderSegments('/segments/7');
    await within(await screen.findByRole('group', { name: 'Members' })).findByText('3');
    expect(screen.queryByText(/members? you can't open/)).not.toBeInTheDocument();
  });

  it('deletes after confirming, then returns to the list', async () => {
    const spy = stubSegments();
    renderSegments('/segments/7');
    await choose('Delete');
    expect(screen.getByText('Delete Renewal risk?')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(where()).toBe('/segments'));
    expect(requests(spy, 'DELETE', /^\/segments\/7\/$/)).toHaveLength(1);
  });

  it('returns focus to ⋯ when the Delete dialog is cancelled', async () => {
    const spy = stubSegments();
    renderSegments('/segments/7');
    await choose('Delete');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete Renewal risk?')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus());
    expect(requests(spy, 'DELETE', /^\/segments\/7\/$/)).toHaveLength(0);
  });

  it('keeps the dialog open with the refusal, and stays on the segment, when the delete fails', async () => {
    const spy = stubSegments({ remove: () => ({ status: 403, body: { detail: "Only the segment's owner can change it." } }) });
    renderSegments('/segments/7');
    await choose('Delete');
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    expect(await screen.findByText("Only the segment's owner can change it.")).toBeInTheDocument();
    expect(screen.getByText('Delete Renewal risk?')).toBeInTheDocument();
    expect(requests(spy, 'DELETE', /^\/segments\/7\/$/)).toHaveLength(1);
    expect(where()).toBe('/segments/7');
  });

  it('offers Try again when the totals fail, and shows the tiles once a retry succeeds', async () => {
    let failures = 1;
    stubSegments({
      members: (_id, query) =>
        query.get('limit') === '1' && failures-- > 0 ? { status: 500, body: { detail: 'Server error.' } } : undefined,
    });
    renderSegments('/segments/7');
    expect(await screen.findByText('Could not load the totals.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Members' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await within(await screen.findByRole('group', { name: 'Members' })).findByText('3')).toBeInTheDocument();
    expect(screen.queryByText('Could not load the totals.')).not.toBeInTheDocument();
  });

  it('duplicates into a copy of my own and opens it', async () => {
    stubSegments();
    renderSegments('/segments/8');
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(where()).toBe('/segments/200'));
    expect(await screen.findByRole('heading', { level: 1, name: 'EMEA accounts (copy)' })).toBeInTheDocument();
  });

  it("focuses the new page's title after Duplicate, since the row that opened it is gone", async () => {
    stubSegments();
    renderSegments('/segments/8');
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(where()).toBe('/segments/200'));
    const h1 = await screen.findByRole('heading', { level: 1, name: 'EMEA accounts (copy)' }, { timeout: 15000 });
    await waitFor(() => expect(h1).toHaveFocus(), { timeout: 15000 });
  }, 30000);

  it('retries the tiles on their own counter, so the attempt never refetches the members list', async () => {
    let failures = 1;
    const spy = stubSegments({
      members: (_id, query) =>
        query.get('limit') === '1' && failures-- > 0 ? { status: 500, body: { detail: 'Server error.' } } : undefined,
    });
    renderSegments('/segments/7');
    expect(await screen.findByText('Could not load the totals.')).toBeInTheDocument();
    const listReads = () => requests(spy, 'GET', /^\/segments\/7\/members\/$/).filter((r) => r.query.get('limit') !== '1');
    const before = listReads().length;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await within(await screen.findByRole('group', { name: 'Members' })).findByText('3')).toBeInTheDocument();
    expect(listReads()).toHaveLength(before);
  });

  it('exports the members the way the tab lists them', async () => {
    const spy = stubSegments();
    renderSegments('/segments/7?search=piz&sort=name');
    await choose('Export CSV');
    await waitFor(() => expect(requests(spy, 'GET', /^\/segments\/7\/members\/export\.csv$/)).toHaveLength(1));
    expect(requests(spy, 'GET', /export\.csv$/)[0].query.toString()).toBe('search=piz&sort=name');
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
  });

  it("opens on the Changes tab from the alert's link, and switches tabs in the URL", async () => {
    stubSegments();
    renderSegments('/segments/7?tab=changes');
    expect(await screen.findByRole('tab', { name: 'Changes' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tabpanel', { name: 'Changes' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Members' }));
    await waitFor(() => expect(where()).toBe('/segments/7'));
    expect(screen.getByRole('tabpanel', { name: 'Members' })).toBeInTheDocument();
  });

  it("names each tab's one panel by the tab that controls it, and moves to Changes with the right arrow", async () => {
    stubSegments();
    renderSegments('/segments/7');
    const members = await screen.findByRole('tab', { name: 'Members' });
    const panel = screen.getByRole('tabpanel', { name: 'Members' });
    expect(members).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', members.id);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    members.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(where()).toBe('/segments/7?tab=changes'));
    expect(screen.getByRole('tab', { name: 'Changes' })).toHaveFocus();
  });

  it('gives a contacts segment only the Members and Last 7 days tiles', async () => {
    stubSegments();
    renderSegments('/segments/9');
    await screen.findByRole('group', { name: 'Members' });
    expect(tile('Last 7 days')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'ARR covered' })).not.toBeInTheDocument();
  });

  it('reads a segment that is not there as not found', async () => {
    stubSegments();
    renderSegments('/segments/99');
    expect(await screen.findByText('Segment not found')).toBeInTheDocument();
  });

  it("reads someone else's private segment as not found, without its name", async () => {
    stubSegments({ segments: [...SEGMENTS, DANA_PRIVATE] });
    renderSegments('/segments/10');
    expect(await screen.findByText('Segment not found')).toBeInTheDocument();
    expect(screen.queryByText("Dana's pipeline")).not.toBeInTheDocument();
  });

  it('says an agent made it, and who approved it (Agents delivery 3)', async () => {
    stubSegments({ segments: [...SEGMENTS, AGENT_SEGMENT] });
    renderSegments(`/segments/${AGENT_SEGMENT.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Poor health renewals' })).toBeInTheDocument();
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });

  it('says nothing of an agent on a segment a person made', async () => {
    stubSegments();
    renderSegments('/segments/7');
    await screen.findByRole('heading', { level: 1, name: 'Renewal risk' });
    expect(document.querySelector('[data-part="made-by"]')).toBeNull();
  });
});

describe('a segment on the primitives (Impact PR)', () => {
  it('names it once, offers Edit and Survey these, and keeps the rest in the menu with Delete last in the danger tone', async () => {
    stubSegments();
    renderSegments(`/segments/${RENEWAL_RISK.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: RENEWAL_RISK.name })).toHaveClass('text-[22px]');
    const actions = document.querySelector('[data-part="actions"]') as HTMLElement;
    expect(within(actions).getAllByRole('link').map((link) => link.textContent)).toEqual(['Edit', 'Survey these']);
    await userEvent.click(within(actions).getByRole('button', { name: 'More actions' }));
    const items = within(screen.getByRole('menu', { name: 'More actions' })).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Duplicate', 'Export CSV', 'Automate', 'Delete']);
    expect(items[3]).toHaveClass('text-danger-ink');
  });

  it('gives a reader Duplicate and Export CSV and no menu', async () => {
    stubSegments();
    renderSegments(`/segments/${EMEA_ACCOUNTS.id}`);
    await screen.findByRole('heading', { level: 1, name: EMEA_ACCOUNTS.name });
    const actions = document.querySelector('[data-part="actions"]') as HTMLElement;
    expect(within(actions).getAllByRole('button').map((button) => button.textContent)).toEqual(['Duplicate', 'Export CSV']);
    expect(within(actions).queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('draws the totals as tiles of one anatomy, and Members and Changes as a tablist under the name', async () => {
    stubSegments();
    renderSegments(`/segments/${RENEWAL_RISK.id}`);
    const tiles = await screen.findAllByRole('group', { name: /Members|ARR|health|CSAT|7 days/i });
    expect(tiles[0]).toHaveClass('rounded-xl', 'border-line', 'p-3');
    expect(tiles[0].parentElement!.className).toContain('@min-[50rem]:grid-cols-');
    const tabs = screen.getByRole('tablist', { name: 'Segment views' });
    expect(within(tabs).getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', within(tabs).getByRole('tab', { name: 'Members' }).id);
  });

  it('says a missing segment inside a card, with a way back', async () => {
    stubSegments();
    renderSegments('/segments/abc');
    const title = await screen.findByText('Segment not found');
    expect(title.closest('section')).toHaveClass('rounded-xl', 'border-line');
    expect(screen.getByRole('link', { name: 'All segments' })).toHaveAttribute('href', '/segments');
  });
});

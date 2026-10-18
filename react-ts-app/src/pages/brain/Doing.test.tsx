import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { DO } from '../../features/brain/doingText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { BOOK_BODY, doingWorld, FIRST_NEW_ID } from '../../features/brain/testDoingFixtures';
import { resetViewport } from '../../test/viewport';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const rowOf = (selector: string) =>
  waitFor(() => {
    const found = document.querySelector(selector);
    expect(found).not.toBeNull();
    return found as HTMLElement;
  });
const meta = (row: Element) => row.querySelector('[data-part="meta"]');

describe("What's being done (spec §2.1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the skeleton until the scope and the work land', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me');
    expect(screen.getByText(DO.LOADING)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: DO.INITIATIVES })).toBeInTheDocument();
    expect(screen.queryByText(DO.LOADING)).toBeNull();
  });

  it('shows the skeleton, not the previous scope’s rows, while a scope switch is in flight (fix, final re-review)', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/doing?scope=me');
    expect(await rowOf('[data-initiative="1"]')).toBeInTheDocument();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const passThrough = spy.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/doing/') && url.searchParams.get('scope') === 'team') await held;
        return passThrough(input, init);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    // Held mid-flight: no stale "me" row survives under the new scope, and
    // the page reads as loading rather than as an empty team.
    expect(screen.getByText(DO.LOADING)).toBeInTheDocument();
    expect(document.querySelector('[data-initiative]')).toBeNull();
    release();
    expect(await rowOf('[data-initiative="3"]')).toBeInTheDocument();
    expect(screen.queryByText(DO.LOADING)).toBeNull();
  });

  it('titles each section at 15px over one list card, and jumps from a tile that marks its section', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me');
    for (const title of [DO.INITIATIVES, DO.PLANS, DO.RULES]) {
      expect(await screen.findByRole('heading', { level: 2, name: title })).toHaveClass('text-[15px]', 'font-semibold');
    }
    const initiatives = screen.getByRole('list', { name: DO.INITIATIVES });
    expect(initiatives.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    const plans = screen.getByRole('link', { name: new RegExp(`^${DO.OPEN_PLANS}:`) });
    await userEvent.click(plans);
    expect(screen.getByRole('link', { name: new RegExp(`^${DO.OPEN_PLANS}:`) })).toHaveAttribute('aria-current', 'location');
  });

  it('Me: my initiative on my book, my plan, my rule’s full counts, New initiative, no Company knowledge', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/doing?scope=me');
    // The only h1 is the Brain bar's (BrainAskLayout's PageHeader); the page draws none.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
    expect(meta(await rowOf('[data-initiative="1"]'))).toHaveTextContent('Customers in poor health · Your book · Active');
    expect(document.querySelectorAll('[data-initiative]')).toHaveLength(1);
    expect(document.querySelector('[data-plan="9"] [data-part="figures"]')).toHaveTextContent(DO.BEFORE_FIGURES);
    expect(document.querySelector('[data-rule="3"] [data-part="run"]')).toHaveTextContent('fired 4 · matched 12 · skipped 2');
    expect(screen.getByRole('button', { name: DO.NEW })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
    expect(requests(spy, 'GET', '/brain/doing/')).toEqual(['/brain/doing/?scope=me']);
  });

  it("My team: Carl's initiative on his book, his plan then → now, his rule's fired count only", async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=team');
    expect(meta(await rowOf('[data-initiative="3"]'))).toHaveTextContent("ARR at risk · Carl CSM's book · Active · Carl CSM");
    // health_score is 0-10, one decimal (controller override, testDoingFixtures.ts).
    expect(document.querySelector('[data-plan="8"] [data-part="figures"]')).toHaveTextContent('Health 4.8 → 5.5 · ARR $69.6K → $69.6K');
    const run = document.querySelector('[data-rule="6"] [data-part="run"]');
    expect(run).toHaveTextContent('Last run 4 Oct: fired 1');
    expect(run).not.toHaveTextContent('matched');
  });

  it('Company: every initiative, the hidden plans and Knowledge by function for view_all_accounts (Decision 6)', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=company');
    expect(meta(await rowOf('[data-initiative="4"]'))).toHaveTextContent('Whole company');
    expect(document.querySelectorAll('[data-initiative]')).toHaveLength(4);
    expect(screen.getByText("2 more plans on records you can't open")).toBeInTheDocument();
    const knowledge = screen.getByRole('region', { name: SAY.KNOWLEDGE });
    expect(await within(knowledge).findByRole('region', { name: 'Knowledge by function' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DO.NEW })).toBeInTheDocument();
  });

  it('Company without view_all_accounts: no New initiative and no Knowledge by function (Decision 3)', async () => {
    stubBrain({ offered: ['company'], viewAll: false });
    renderBrain('/brain/doing', { role: 'csm' });
    await rowOf('[data-initiative="4"]');
    expect(screen.queryByRole('button', { name: DO.NEW })).toBeNull();
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
  });

  it('says so when a section is empty, and still offers New initiative', async () => {
    stubBrain({ world: doingWorld([]), doing: { me: { plans: [], rules: [], hidden: 0 } } });
    renderBrain('/brain/doing?scope=me');
    expect(await screen.findByText('No initiatives on your book yet.')).toBeInTheDocument();
    expect(screen.getByText(DO.NO_PLANS)).toBeInTheDocument();
    expect(screen.getByText(DO.NO_RULES)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DO.NEW })).toBeInTheDocument();
  });

  it('offers Try again when the read fails, and the retry lands', async () => {
    stubBrain({ failDoing: 1 });
    renderBrain('/brain/doing?scope=me');
    expect(await screen.findByText(DO.LOAD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await rowOf('[data-initiative="1"]')).toBeInTheDocument();
  });

  it('falls back to the default with the notice when the view is no longer offered', async () => {
    const { revoke } = stubBrain();
    revoke('team');
    renderBrain('/brain/doing?scope=team');
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain/doing?scope=company'));
  });

  it('lands on ?section= and focuses its heading; a section link moves there, keeping the scope (Decision 2)', async () => {
    stubBrain();
    renderBrain('/brain/doing?section=plans&scope=me');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.PLANS })).toHaveFocus());
    const nav = screen.getByRole('navigation', { name: DO.SECTIONS });
    expect(within(nav).getByRole('link', { name: /^Open plans/ })).toHaveAttribute('aria-current', 'location');
    await userEvent.click(within(nav).getByRole('link', { name: /^Rules running/ }));
    expect(where()).toBe('/brain/doing?section=rules&scope=me');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.RULES })).toHaveFocus());
    expect(within(nav).getByRole('link', { name: /^Rules running/ })).toHaveAttribute('aria-current', 'location');
  });

  it('starts an initiative for a report in My team, once, then focuses its row (Decision 3)', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], viewAll: false });
    renderBrain('/brain/doing?scope=team', { role: 'csm' });
    await rowOf('[data-initiative="3"]');
    // The live region is mounted but takes no room until it has words.
    const region = document.querySelector('[data-part="doing-status"]') as HTMLElement;
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveClass('sr-only');
    expect(region.className).not.toMatch(/min-h-/);
    const start = screen.getByRole('button', { name: DO.NEW });
    await userEvent.click(start);
    expect(start).toHaveAttribute('aria-expanded', 'true');
    const form = screen.getByRole('form', { name: DO.NEW });
    const whose = within(form).getByLabelText(DO.FIELD_WHOSE_BOOK);
    await waitFor(() => expect(within(whose).getAllByRole('option')).toHaveLength(2));
    await userEvent.selectOptions(whose, 'Carl CSM');
    // The trackable list's own order (controller override, testDoingFixtures.ts)
    // puts Forecast ARR first, not ARR at risk: choose it explicitly.
    await userEvent.selectOptions(within(form).getByLabelText(DO.FIELD_METRIC), 'ARR at risk');
    await userEvent.type(within(form).getByLabelText(DO.FIELD_TITLE), BOOK_BODY.title);
    await userEvent.type(within(form).getByLabelText(DO.FIELD_TARGET), BOOK_BODY.target_value);
    fireEvent.change(within(form).getByLabelText(DO.FIELD_TARGET_BY), { target: { value: BOOK_BODY.target_by } });
    await userEvent.dblClick(within(form).getByRole('button', { name: DO.SAVE_INITIATIVE }));
    const made = await rowOf(`[data-initiative="${FIRST_NEW_ID}"]`);
    expect(meta(made)).toHaveTextContent("ARR at risk · Carl CSM's book · Active · Carl CSM");
    expect(screen.getByText(DO.STARTED)).toBeInTheDocument();
    expect(document.querySelector('[data-part="doing-status"]')).toBe(region);
    expect(region).toHaveTextContent(DO.STARTED);
    expect(region).not.toHaveClass('sr-only');
    expect(screen.queryByRole('form', { name: DO.NEW })).toBeNull();
    await waitFor(() => expect(made.contains(document.activeElement)).toBe(true));
    expect(requests(spy, 'POST', '/brain/initiatives/')).toEqual(['/brain/initiatives/?scope=team']);
    expect(requests(spy, 'GET', '/brain/doing/')).toEqual(['/brain/doing/?scope=team', '/brain/doing/?scope=team']);
  });

  it('Cancel closes the form and hands focus back to New initiative', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me');
    await rowOf('[data-initiative="1"]');
    await userEvent.click(screen.getByRole('button', { name: DO.NEW }));
    await userEvent.click(within(screen.getByRole('form', { name: DO.NEW })).getByRole('button', { name: DO.CANCEL }));
    expect(screen.queryByRole('form', { name: DO.NEW })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: DO.NEW })).toHaveFocus());
  });

  it('Company: New initiative opens the existing form, with its cut', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=company');
    await rowOf('[data-initiative="4"]');
    await userEvent.click(screen.getByRole('button', { name: DO.NEW }));
    expect(within(screen.getByRole('form', { name: DO.NEW })).getByLabelText(DO.FIELD_CUT)).toBeInTheDocument();
  });

  it('at 375px the view is a segmented control and the tiles scroll sideways', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me', { width: 375 });
    await rowOf('[data-initiative="1"]');
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: DO.SECTIONS })).toHaveClass('overflow-x-auto', 'snap-x');
  });

  it('opens with three tiles read from the payload: initiatives on track, open plans at risk, rules that fired', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=team');
    await rowOf('[data-initiative="3"]');
    const nav = screen.getByRole('navigation', { name: DO.SECTIONS });
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Initiatives: 2 active, 2 on track',
      'Open plans: 2, 1 at risk',
      'Rules running: 2, 6 fired last night',
    ]);
    expect(within(within(nav).getByRole('link', { name: /^Open plans/ })).getByText('2')).toHaveClass('tabular-nums', 'text-[22px]');
  });

  it('a tile on the section already named moves focus there again', async () => {
    stubBrain();
    renderBrain('/brain/doing?section=plans&scope=me');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.PLANS })).toHaveFocus());
    screen.getByRole('button', { name: DO.NEW }).focus();
    await userEvent.click(screen.getByRole('link', { name: /^Open plans/ }));
    expect(screen.getByRole('heading', { level: 2, name: DO.PLANS })).toHaveFocus();
  });

  it('sits in BrainFrame, its sections titled in the section style', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me');
    await rowOf('[data-initiative="1"]');
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(document.querySelector('.font-display')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: DO.INITIATIVES })).toHaveClass('text-[15px]', 'font-semibold');
  });

  it('gives every section header row the same min height, so Initiatives lines up beside New initiative (fix wave item 3)', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me');
    await rowOf('[data-initiative="1"]');
    for (const name of [DO.INITIATIVES, DO.PLANS, DO.RULES]) {
      expect(screen.getByRole('heading', { level: 2, name }).parentElement).toHaveClass('min-h-9');
    }
  });
});

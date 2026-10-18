import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pizzaEmea } from '../../features/accounts/testPortfolio';
import { LUKAS } from '../../features/contacts/testContacts';
import { pizzaHut } from '../../features/organizations/testPortfolio';
import { parseSegmentPage, toSegmentPageSearch, type SegmentPageParams } from '../../features/segments/segmentParams';
import type { Segment } from '../../features/segments/segmentTypes';
import { CHAMPIONS, EMEA_ACCOUNTS, RENEWAL_RISK, requests, stubSegments } from '../../features/segments/testSegments';
import { renderInApp } from '../../pages/segments/testPages';
import { resetViewport } from '../../test/viewport';
import { MembersTab } from './MembersTab';

/** The page's part of the contract: the segment, its URL state, and a
 *  reload after a pin. */
function Host({ initial }: { initial: Segment }) {
  const [segment, setSegment] = useState(initial);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useSearchParams();
  const params = parseSegmentPage(search, segment.kind);
  const update = (patch: Partial<SegmentPageParams>) => setSearch(toSegmentPageSearch({ ...params, ...patch }), { replace: true });
  return (
    <>
      <MembersTab
        segment={segment}
        params={params}
        update={update}
        version={version}
        onChanged={(state) => {
          setSegment((current) => ({ ...current, ...state }));
          setVersion((v) => v + 1);
        }}
        onNotice={setNotice}
      />
      {notice ? <p data-testid="notice">{notice}</p> : null}
    </>
  );
}

const where = () => screen.getByTestId('where').textContent;
const count = () => document.querySelector('[data-part="member-count"]');
const two = (i: number) => String(i).padStart(2, '0');

/** `n` records of a kind, named "<prefix> 00" onwards, ids from 1000. */
const many = <R extends { id: number; name: string }>(base: R, prefix: string, n: number): R[] =>
  Array.from({ length: n }, (_, i) => ({ ...base, id: 1000 + i, name: `${prefix} ${two(i)}` }));

describe('MembersTab (spec §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists an organisations segment\'s members as Organizations rows, never selectable', async () => {
    stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(screen.getByRole('link', { name: 'Globex' })).toBeInTheDocument();
    expect(count()).toHaveTextContent('3 organisations');
    expect(screen.queryByRole('checkbox', { name: 'Select Pizza Hut' })).not.toBeInTheDocument();
  });

  it('pins a member from its row menu, and the menu then offers Unpin', async () => {
    const spy = stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Pizza Hut' })).getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(requests(spy, 'PATCH', /^\/segments\/7\/members\/7\/$/).map((r) => r.body)).toEqual([{ state: 'pinned' }]));
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    expect(within(screen.getByRole('menu', { name: 'Actions for Pizza Hut' })).getByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument();
  });

  it('portals the row menu to the page body, so a one-row card never clips it (Ruling G13)', async () => {
    stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    expect(screen.getByRole('menu', { name: 'Actions for Pizza Hut' }).parentElement).toBe(document.body);
  });

  it('hands focus back to the row menu button once a Pin has saved', async () => {
    const spy = stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Pizza Hut' })).getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(requests(spy, 'PATCH', /^\/segments\/7\/members\/7\/$/)).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', 'Actions for Pizza Hut'));
    expect(document.activeElement).toBeEnabled();
  }, 10000);

  it('keeps a member out, lists it under Kept out, and lets it back in', async () => {
    const spy = stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Globex' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Globex' })).getByRole('menuitem', { name: 'Keep out' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^Kept out/ }));
    const kept = await screen.findByRole('list', { name: 'Kept out' });
    await userEvent.click(within(kept).getByRole('button', { name: 'Let Globex back in' }));
    expect(await screen.findByRole('link', { name: 'Globex' })).toBeInTheDocument();
    expect(requests(spy, 'PATCH', /^\/segments\/7\/members\/1\/$/).map((r) => r.body)).toEqual([{ state: 'excluded' }, { state: 'none' }]);
    expect(requests(spy, 'POST', /^\/segments\/preview\/$/)[0].body).toEqual({ kind: 'customer', rules: { match: 'all', conditions: [] }, pinned_ids: [1] });
  });

  it("sends focus to the members count line once Keep out unmounts the row that held it, instead of <body>", async () => {
    stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Globex' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Globex' })).getByRole('menuitem', { name: 'Keep out' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument());
    expect(count()?.parentElement).toHaveFocus();
  });

  it("sends focus to the Kept out toggle once Let back in unmounts the row that held it, while others stay kept out", async () => {
    stubSegments({ segments: [{ ...RENEWAL_RISK, excluded_ids: [1, 2] }] });
    renderInApp(<Host initial={{ ...RENEWAL_RISK, excluded_ids: [1, 2] }} />, { url: '/segments/7' });
    const toggle = await screen.findByRole('button', { name: /^Kept out/ });
    await userEvent.click(toggle);
    await userEvent.click(await screen.findByRole('button', { name: 'Let Globex back in' }));
    // The preview that names the one id still kept out reloads (its own
    // answer cache is keyed by the whole excluded set), so the row reappears
    // asynchronously.
    expect(await screen.findByRole('button', { name: 'Let Initech back in' })).toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("sends focus to the members count line once Let back in unmounts the last kept-out record, toggle and all", async () => {
    stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Globex' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Globex' })).getByRole('menuitem', { name: 'Keep out' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^Kept out/ }));
    const kept = await screen.findByRole('list', { name: 'Kept out' });
    await userEvent.click(within(kept).getByRole('button', { name: 'Let Globex back in' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Kept out/ })).not.toBeInTheDocument());
    expect(count()?.parentElement).toHaveFocus();
  });

  it('shows the server\'s refusal word for word, reloads nothing, and enables the menu again', async () => {
    const detail = 'A segment can pin at most 500 records, and keep out as many.';
    const spy = stubSegments({ member: () => ({ status: 400, body: { detail } }) });
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    const reads = () => requests(spy, 'GET', /^\/segments\/7\/members\/$/).length;
    const before = reads();
    await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Pizza Hut' })).getByRole('menuitem', { name: 'Pin' }));
    expect(await screen.findByTestId('notice')).toHaveTextContent(detail);
    expect(screen.getByTestId('notice').textContent).toBe(detail);
    expect(requests(spy, 'PATCH', /^\/segments\/7\/members\/7\/$/)).toHaveLength(1);
    expect(reads()).toBe(before);
    expect(screen.getByRole('button', { name: 'Actions for Pizza Hut' })).toBeEnabled();
  });

  it('names kept-out records ten ids at a time, and Show more reaches the rest (Ruling G2)', async () => {
    const rows = many(pizzaHut, 'Org', 12);
    const kept = rows.slice(0, 11).map((row) => row.id);
    const segment = { ...RENEWAL_RISK, excluded_ids: kept };
    const spy = stubSegments({ segments: [segment], rows: { customer: rows } });
    renderInApp(<Host initial={segment} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: /^Kept out/ }));
    const list = await screen.findByRole('list', { name: 'Kept out' });
    expect(within(list).getAllByRole('button', { name: /^Let Org \d\d back in$/ })).toHaveLength(10);
    expect(within(list).queryByRole('button', { name: 'Let Org 10 back in' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show more kept-out records' }));
    expect(await within(list).findByRole('button', { name: 'Let Org 10 back in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more kept-out records' })).not.toBeInTheDocument();
    expect(requests(spy, 'POST', /^\/segments\/preview\/$/).map((r) => (r.body as { pinned_ids: number[] }).pinned_ids)).toEqual([
      kept.slice(0, 10),
      kept.slice(10),
    ]);
  });

  it('searches, sorts and groups in the URL, asking the endpoint only for the names it reads', async () => {
    const spy = stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search members by name' }), 'piz');
    await waitFor(() => expect(where()).toBe('/segments/7?search=piz'));
    await waitFor(() => expect(count()).toHaveTextContent('1 of 3 organisations'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'Name');
    await waitFor(() => expect(where()).toBe('/segments/7?search=piz&sort=-name'));
    const reads = () => requests(spy, 'GET', /^\/segments\/7\/members\/$/).map((r) => r.query);
    await waitFor(() => expect(reads().some((q) => q.get('sort') === '-name')).toBe(true));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'Health');
    await waitFor(() => expect(where()).toBe('/segments/7?search=piz&sort=-name&group=health'));
    await waitFor(() => expect(reads().some((q) => q.get('group') === 'health' && !q.has('group_value'))).toBe(true));
    const frame = reads().find((q) => q.get('group') === 'health' && !q.has('group_value'))!;
    expect([...frame.keys()].sort()).toEqual(['group', 'limit', 'search', 'sort']);
    expect(frame.get('limit')).toBe('1');
    expect(frame.get('sort')).toBe('-name');
    const allowed = ['sort', 'group', 'group_value', 'search', 'cursor', 'limit'];
    expect(reads().every((q) => [...q.keys()].every((key) => allowed.includes(key)))).toBe(true);
  });

  it('gives a segment shared with me its rows but no row menu, and no Kept out though it keeps some out', async () => {
    stubSegments();
    expect(EMEA_ACCOUNTS.excluded_ids.length).toBeGreaterThan(0);
    renderInApp(<Host initial={EMEA_ACCOUNTS} />, { url: '/segments/8' });
    expect(await screen.findByRole('link', { name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Kept out/ })).not.toBeInTheDocument();
  });

  it('lists a contacts segment\'s members as Contacts rows, searched by name, with no grouping', async () => {
    stubSegments();
    renderInApp(<Host initial={CHAMPIONS} />, { url: '/segments/9' });
    expect(await screen.findByRole('link', { name: /Lukas Vermeer/ })).toHaveAttribute('href', '/contacts/41');
    expect(count()).toHaveTextContent('3 contacts');
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Lukas Vermeer' })).toBeInTheDocument();
    // Ruling G13: the card clips, so the row menu is portalled (see above).
  });

  it.each([
    ['organisations', RENEWAL_RISK, { customer: many(pizzaHut, 'Item', 52) }],
    ['accounts', EMEA_ACCOUNTS, { account: many(pizzaEmea, 'Item', 52) }],
    ['contacts', CHAMPIONS, { contact: many(LUKAS, 'Item', 52) }],
  ] as const)('pages %s members by the cursor, with Show more', async (_noun, segment, rows) => {
    const spy = stubSegments({ rows });
    renderInApp(<Host initial={segment} />, { url: `/segments/${segment.id}` });
    const items = () => screen.getAllByRole('link', { name: /^Item \d\d/ });
    await waitFor(() => expect(items()).toHaveLength(50));
    await userEvent.click(screen.getByRole('button', { name: /^Show more/ }));
    await waitFor(() => expect(items()).toHaveLength(52));
    const reads = requests(spy, 'GET', new RegExp(`^/segments/${segment.id}/members/$`)).map((r) => r.query);
    expect(reads.map((q) => q.get('cursor'))).toEqual([null, '50']);
    expect(screen.queryByRole('button', { name: /^Show more/ })).not.toBeInTheDocument();
  });
});

/** Renders the tab for a kind; `slow` holds the members read open until
 *  `release()`, `many` answers a first page with a cursor. */
function renderTab({ kind, slow = false, many: lots = false }: { kind: 'customer' | 'contact'; slow?: boolean; many?: boolean }) {
  const rows = lots ? { contact: many(LUKAS, 'Item', 52) } : undefined;
  stubSegments(rows ? { rows } : {});
  let release = () => {};
  if (slow) {
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (/\/segments\/\d+\/members\//.test(String(input))) await gate;
      return inner(input, init);
    });
  }
  const segment = kind === 'contact' ? CHAMPIONS : RENEWAL_RISK;
  renderInApp(<Host initial={segment} />, { url: `/segments/${segment.id}` });
  return { release };
}

describe('Members on the primitives (Impact PR)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts the search, its count and Group / Sort in one toolbar, and labels the columns over the rows', async () => {
    renderTab({ kind: 'customer' });
    const search = await screen.findByRole('searchbox', { name: 'Search members by name' });
    expect(search).toHaveAttribute('placeholder', 'Search members');
    expect(screen.getByLabelText('Sort by').closest('[data-part="toolbar-search"]')).toBeNull();
    const labels = (await screen.findByRole('list', { name: /Members/ })).parentElement!.querySelector('[aria-hidden="true"].hidden')!;
    expect(labels).toHaveClass('@min-[62rem]:grid');
    expect(labels).toHaveTextContent('ARR');
  });

  it.each(['customer', 'contact'] as const)('keeps one count region mounted from loading to loaded (%s)', async (kind) => {
    const { release } = renderTab({ kind, slow: true });
    const region = document.querySelector('[data-part="toolbar-search"] [role="status"]')!;
    expect(region).toBeEmptyDOMElement();
    release();
    const found = await screen.findByText(/(members?|organisations?|contacts?)$/, { selector: '[data-part="member-count"]' });
    expect(found.parentElement).toBe(region);
    expect(document.querySelector('[data-part="toolbar-search"] [role="status"]')).toBe(region);
  });

  it('draws the contacts as one list card, Show more inside it', async () => {
    renderTab({ kind: 'contact', many: true });
    const list = await screen.findByRole('list', { name: 'Members' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'overflow-hidden');
    expect(screen.getByRole('button', { name: 'Show more members' }).closest('[data-part="list-footer"]')).not.toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchDialog } from './MatchDialog';
import { ITEM_JIRA, ITEM_SLACK, stubUnmatched } from '../../features/work/testUnmatched';
import type { UnmatchedItem } from '../../features/work/unmatched';

afterEach(() => vi.unstubAllGlobals());

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;

/** The RecordStep search reads /customers/?search= and /accounts/?search=. */
function stubRecordSearch() {
  const next = globalThis.fetch as unknown as Fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const ok = (results: unknown[]) => ({ ok: true, status: 200, json: async () => ({ results }) });
    if (url.pathname.endsWith('/customers/') && url.searchParams.has('search')) return ok([{ id: 4, name: 'Pizza Hut' }]);
    if (url.pathname.endsWith('/accounts/') && url.searchParams.has('search')) return ok([{ id: 9, name: 'Pizza Hut EMEA' }]);
    return next(input, init);
  });
}

const sentBody = (spy: ReturnType<typeof stubUnmatched>['spy'], suffix: string) => {
  const call = spy.mock.calls.find(([url, init]) => String(url).includes(suffix) && init?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body));
};

function renderDialog(item: UnmatchedItem = ITEM_JIRA, props: { onMatched?: () => void; onGone?: (id: number) => void } = {}) {
  const onMatched = props.onMatched ?? vi.fn();
  const onGone = props.onGone ?? vi.fn();
  render(<MatchDialog item={item} onMatched={onMatched} onGone={onGone} onClose={vi.fn()} />);
  return { onMatched, onGone };
}

async function pick(name: RegExp | string) {
  await userEvent.type(screen.getByRole('searchbox', { name: 'Organisation or account' }), 'piz');
  await userEvent.click(await screen.findByRole('button', { name }));
}

describe('MatchDialog (round 2 D3 frontend Decision 3)', () => {
  it('matches to the picked record and adds the contact when asked', async () => {
    const s = stubUnmatched({ items: [ITEM_JIRA] });
    stubRecordSearch();
    const onMatched = vi.fn();
    renderDialog(ITEM_JIRA, { onMatched });
    expect(screen.getByRole('checkbox', { name: /Also add ann@newco\.io/ })).not.toBeChecked();
    await pick(/^Pizza Hut$/);
    await userEvent.click(screen.getByRole('checkbox', { name: /Also add ann@newco\.io/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    await vi.waitFor(() => expect(onMatched).toHaveBeenCalledWith(expect.objectContaining({ contact_added: true })));
    expect(sentBody(s.spy, '/match/')).toEqual({ customer_id: 4, add_contact: true });
  });

  it('sends an account as account_id and no contact by default', async () => {
    const s = stubUnmatched({ items: [ITEM_JIRA] });
    stubRecordSearch();
    const onMatched = vi.fn();
    renderDialog(ITEM_JIRA, { onMatched });
    await pick('Pizza Hut EMEA');
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    await vi.waitFor(() => expect(onMatched).toHaveBeenCalled());
    expect(sentBody(s.spy, '/match/')).toEqual({ account_id: 9, add_contact: false });
  });

  it('asks for a record before matching', async () => {
    const s = stubUnmatched({ items: [ITEM_JIRA] });
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(screen.getByText('Choose a customer or account first.')).toBeInTheDocument();
    expect(s.spy.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('offers no contact when there is no email or it is known', () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    renderDialog({ ...ITEM_JIRA, can_add_contact: false });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shows a connection that does not cover the record', async () => {
    stubUnmatched({ items: [ITEM_JIRA], refuseNextMatch: { status: 409, body: { code: 'NOT_COVERED', detail: "Jira SUP doesn't cover Pizza Hut. Choose another, or change the connection in Settings." } } });
    stubRecordSearch();
    const { onGone } = renderDialog();
    await pick(/^Pizza Hut$/);
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Jira SUP doesn't cover Pizza Hut.");
    expect(onGone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Match' })).not.toHaveAttribute('aria-disabled');
  });

  it('a message dealt with meanwhile leaves the list', async () => {
    stubUnmatched({ items: [ITEM_JIRA], refuseNextMatch: { status: 409, body: { code: 'GONE', detail: 'Someone else dealt with this message. Reload the list.' } } });
    stubRecordSearch();
    const { onGone } = renderDialog();
    await pick(/^Pizza Hut$/);
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else dealt with this message. Reload the list.');
    expect(onGone).toHaveBeenCalledWith(ITEM_JIRA.id);
  });

  it('treats a 404 as gone: removes the row and disables Match', async () => {
    stubUnmatched({ items: [ITEM_JIRA], refuseNextMatch: { status: 404, body: { detail: 'Not found.' } } });
    stubRecordSearch();
    const { onGone } = renderDialog();
    await pick(/^Pizza Hut$/);
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else dealt with this message. Reload the list.');
    expect(onGone).toHaveBeenCalledWith(ITEM_JIRA.id);
    expect(screen.getByRole('button', { name: 'Match' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('puts a field refusal under its field', async () => {
    stubUnmatched({ items: [ITEM_JIRA], refuseNextMatch: { status: 400, body: { add_contact: ['This message has no sender email to add.'] } } });
    stubRecordSearch();
    renderDialog();
    await pick(/^Pizza Hut$/);
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(await screen.findByText('This message has no sender email to add.')).toBeInTheDocument();
  });

  it('says Matching… and stays focusable while it sends', async () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    stubRecordSearch();
    const inner = globalThis.fetch as unknown as Fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/match/')) await gate;
      return inner(input, init);
    });
    const { onMatched } = renderDialog();
    await pick(/^Pizza Hut$/);
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    const busy = await screen.findByRole('button', { name: 'Matching…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toBeDisabled();
    release();
    await vi.waitFor(() => expect(onMatched).toHaveBeenCalledTimes(1));
  });

  it('clears the pick-a-record sentence once a record is picked or cleared', async () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    stubRecordSearch();
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    expect(screen.getByText('Choose a customer or account first.')).toBeInTheDocument();
    await pick(/^Pizza Hut$/);
    expect(screen.queryByText('Choose a customer or account first.')).not.toBeInTheDocument();
  });

  it('offers the customers a Slack message mentions, and picking one chooses it', async () => {
    const s = stubUnmatched({ items: [ITEM_SLACK] });
    const onMatched = vi.fn();
    renderDialog(ITEM_SLACK, { onMatched });
    const globex = screen.getByRole('button', { name: 'Globex (QA)' });
    expect(globex).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(globex);
    expect(globex).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Match' }));
    await vi.waitFor(() => expect(onMatched).toHaveBeenCalledWith(expect.objectContaining({ record: expect.objectContaining({ type: 'customer', id: 29 }), ticket: null })));
    expect(sentBody(s.spy, '/match/')).toEqual({ customer_id: 29 });
  });

  it('unpresses the chip when the chosen record is cleared', async () => {
    stubUnmatched({ items: [ITEM_SLACK] });
    renderDialog(ITEM_SLACK);
    await userEvent.click(screen.getByRole('button', { name: 'Initech (QA)' }));
    expect(screen.getByRole('button', { name: 'Initech (QA)' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('button', { name: 'Initech (QA)' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('has no Mentioned row when nothing is mentioned', () => {
    stubUnmatched({ items: [ITEM_JIRA] });
    renderDialog(ITEM_JIRA);
    expect(screen.queryByText('Mentioned')).not.toBeInTheDocument();
  });
});

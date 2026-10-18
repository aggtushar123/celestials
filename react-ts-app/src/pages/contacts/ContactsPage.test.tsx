import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LUKAS, LUKAS_HISTORY, requested, stubContactsApi } from '../../features/contacts/testContacts';
import { resetViewport } from '../../test/viewport';
import { renderContactsPage } from './testPage';

const where = () => screen.getByTestId('where').textContent;
const listRequests = (spy: ReturnType<typeof stubContactsApi>) => requested(spy).filter((path) => path.startsWith('/contacts/?') || path === '/contacts/');
const people = () => within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem');

describe('Contacts page (spec 2026-09-28 §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('desktop: the summary tiles, the list and a prompt to choose a person', async () => {
    stubContactsApi();
    renderContactsPage();
    expect(await screen.findByRole('list', { name: 'People' })).toBeInTheDocument();
    expect(people()).toHaveLength(3);
    expect(screen.getByRole('group', { name: 'People' })).toHaveTextContent('2 active');
    expect(screen.getByRole('group', { name: 'Decision makers' })).toHaveTextContent('1');
    expect(screen.getByRole('group', { name: 'Sentiment' })).toHaveTextContent('33%positive · 1 negative');
    expect(screen.getByRole('status')).toHaveTextContent('3 people');
    expect(within(screen.getByRole('region', { name: 'Profile' })).getByText('Choose a person')).toBeInTheDocument();
  });

  it('reads the filters from the URL and asks the API with them', async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts?customer=6&role=champion&q=luk');
    await screen.findByRole('list', { name: 'People' });
    expect(listRequests(spy)).toEqual(['/contacts/?search=luk&customer=6&role=champion']);
    expect(screen.getByLabelText('Search people')).toHaveValue('luk');
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveDisplayValue('Champion');
  });

  it('/contacts/:id opens that person beside the list, marked in it', async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts/41?sentiment=neutral');
    const profile = within(screen.getByRole('region', { name: 'Profile' }));
    expect(await profile.findByRole('heading', { level: 2, name: 'Lukas Vermeer' })).toBeInTheDocument();
    await screen.findByRole('list', { name: 'People' });
    expect(within(people()[0]).getByRole('link')).toHaveAttribute('aria-current', 'true');
    expect(requested(spy)).toContain('/contacts/41/history/');
  });

  it('a filter writes the URL and reads again; choosing a person keeps the filters', async () => {
    const spy = stubContactsApi();
    renderContactsPage();
    await screen.findByRole('list', { name: 'People' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sentiment' }), 'Negative');
    await waitFor(() => expect(people()).toHaveLength(1));
    expect(where()).toBe('/contacts?sentiment=negative');
    expect(listRequests(spy)).toEqual(['/contacts/', '/contacts/?sentiment=negative']);
    await userEvent.click(within(people()[0]).getByRole('link'));
    expect(where()).toBe('/contacts/43?sentiment=negative');
    expect(await screen.findByRole('heading', { level: 2, name: 'Owen Price' })).toBeInTheDocument();
  });

  it('the organisation filter narrows to its people and offers its accounts', async () => {
    stubContactsApi();
    renderContactsPage();
    await screen.findByRole('list', { name: 'People' });
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Organisation' }), 'Kraft Heinz');
    await waitFor(() => expect(people()).toHaveLength(1));
    expect(where()).toBe('/contacts?customer=6');
    const account = screen.getByRole('combobox', { name: 'Account' });
    await within(account).findByRole('option', { name: 'Kraft Heinz NA' });
    await userEvent.selectOptions(account, 'Kraft Heinz NA');
    expect(await screen.findByText('Nobody matches')).toBeInTheDocument();
    expect(where()).toBe('/contacts?customer=6&account=32');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(people()).toHaveLength(3));
    expect(where()).toBe('/contacts');
  });

  it('loads more at the end', async () => {
    stubContactsApi({ pageSize: 2 });
    renderContactsPage();
    await screen.findByRole('list', { name: 'People' });
    expect(people()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Load more (2 of 3)' }));
    await waitFor(() => expect(people()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
  });

  it('a failed read offers Try again', async () => {
    stubContactsApi({ failList: 1 });
    renderContactsPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'People' })).toBeInTheDocument();
  });

  it('deleting the open person goes back to the list, read again without them', async () => {
    stubContactsApi();
    renderContactsPage('/contacts/41?role=champion');
    await screen.findByRole('heading', { level: 2, name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Lukas Vermeer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByText('Delete Lukas Vermeer?').closest('div')!.parentElement!;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/contacts?role=champion'));
    expect(await screen.findByText('Nobody matches')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'People' })).toHaveTextContent('0');
  });

  it('editing only the name keeps a computed sentiment: it is not sent, and the profile and list read again', async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts/41');
    await screen.findByRole('heading', { level: 2, name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Lukas V.');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Lukas V.' })).toBeInTheDocument();
    const patch = spy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')!;
    expect(JSON.parse(String((patch[1] as RequestInit).body))).not.toHaveProperty('sentiment');
    expect(screen.getByRole('region', { name: 'Sentiment' })).toHaveTextContent('Neutral: 3 positive · 2 neutral · 1 negative');
    expect(within(people()[0]).getByText('Lukas V.')).toBeInTheDocument();
  });

  it('changing the sentiment re-reads the person, their history and the summary', async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts/41');
    await screen.findByRole('heading', { level: 2, name: 'Lukas Vermeer' });
    await screen.findByRole('list', { name: 'People' });
    expect(screen.getByRole('group', { name: 'Sentiment' })).toHaveTextContent('33%positive · 1 negative');
    const before = requested(spy).filter((path) => path === '/contacts/41/history/').length;
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.selectOptions(screen.getByLabelText(/^Sentiment \(/), 'Negative');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const patch = spy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')!;
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toMatchObject({ sentiment: 'negative' });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Sentiment' })).toHaveTextContent(/^Negative/));
    expect(screen.getByRole('region', { name: 'Sentiment' })).not.toHaveTextContent('3 positive');
    expect(requested(spy).filter((path) => path === '/contacts/41/history/').length).toBeGreaterThan(before);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Sentiment' })).toHaveTextContent('33%positive · 2 negative'));
    expect(within(people()[0]).getByText('Negative')).toBeInTheDocument();
  });

  it('+ Add opens the existing form with the organisations to choose from', async () => {
    stubContactsApi();
    renderContactsPage();
    await screen.findByRole('list', { name: 'People' });
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(screen.getByText('Add Contact', { selector: 'h2, h3' })).toBeInTheDocument();
  });

  it('desktop: the list and the profile each scroll in the frame; no table, no stat cards', async () => {
    stubContactsApi();
    renderContactsPage('/contacts/41');
    await screen.findByRole('heading', { level: 2, name: 'Lukas Vermeer' });
    expect(document.querySelector('[data-frame="contacts"]')).toHaveClass('pb-4');
    expect(document.querySelector('[data-pane="list"]')).toHaveClass('overflow-y-auto', 'shrink-0');
    expect(document.querySelector('[data-pane="profile"]')).toHaveClass('overflow-y-auto', 'flex-1');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/Total Contacts/i)).toBeNull();
  });

  it('the gutter matches the organisation page: 16px inside the column below sm, 16px around it from sm (the bar\'s own, UI foundations spec §6.1), the column capped at 1800px', async () => {
    stubContactsApi();
    renderContactsPage('/contacts');
    await screen.findByRole('list', { name: 'People' });
    const frame = document.querySelector('[data-frame="contacts"]')!;
    expect(frame).toHaveClass('px-0', 'sm:px-4');
    expect(frame).not.toHaveClass('sm:px-6');
    expect(frame).not.toHaveClass('px-4');
    expect(frame.firstElementChild).toHaveClass('overflow-y-auto', 'px-4', 'sm:px-0');
    expect(document.querySelector('[data-part="column"]')).toHaveClass('mx-auto', 'w-full', 'max-w-[1800px]');
  });

  it('the old /contacts/list keeps its query string', async () => {
    stubContactsApi();
    renderContactsPage('/contacts/list?role=champion&q=luk');
    await screen.findByRole('list', { name: 'People' });
    expect(where()).toBe('/contacts?role=champion&q=luk');
  });

  it('/contacts/abc is not a person: the designed not-found state, and nothing is asked for it', async () => {
    const spy = stubContactsApi();
    renderContactsPage('/contacts/abc');
    await screen.findByRole('list', { name: 'People' });
    const profile = within(screen.getByRole('region', { name: 'Profile' }));
    expect(profile.getByRole('alert')).toHaveTextContent('Could not open this person');
    expect(profile.getByRole('alert')).toHaveTextContent('This person is not here.');
    expect(profile.queryByText('Choose a person')).toBeNull();
    expect(requested(spy).some((path) => path.startsWith('/contacts/abc'))).toBe(false);
  });

  it('the old /contacts/list lands on /contacts', async () => {
    stubContactsApi();
    renderContactsPage('/contacts/list');
    await screen.findByRole('list', { name: 'People' });
    expect(where()).toBe('/contacts');
  });

  it('the old backend shape (sentiment_evidence, no calls or sentiment_readable) still renders the list and the profile (this frontend deploys before that backend change)', async () => {
    // The old shape, revenact-backend before PR fix/contacts-readable-evidence:
    // rows carry `sentiment_evidence`, never `calls`; history carries
    // `sentiment_evidence`, never `sentiment_readable`.
    const oldEvidence = { score: 0.1, calls: 6, emails: 2, tickets: 0, positive: 3, neutral: 2, negative: 1, latest_at: '2026-09-12T10:00:00Z' };
    const oldLukas = { ...LUKAS, calls: undefined, sentiment_evidence: oldEvidence };
    const oldHistory = { ...LUKAS_HISTORY, sentiment_readable: undefined, sentiment_evidence: oldEvidence };
    const spy = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (path === '/contacts/') return ok({ count: 1, next: null, previous: null, results: [oldLukas] });
      if (path === '/contacts/41/') return ok(oldLukas);
      if (path === '/contacts/41/history/') return ok(oldHistory);
      if (path === '/customers/') return ok({ count: 0, next: null, previous: null, results: [] });
      return { ok: false, status: 404, json: async () => ({ detail: 'Not found.' }) };
    });
    vi.stubGlobal('fetch', spy);
    renderContactsPage('/contacts/41');
    expect(await screen.findByText(/· 6 calls ·/)).toBeInTheDocument();
    const sentiment = await screen.findByRole('region', { name: 'Sentiment' });
    expect(sentiment).toHaveTextContent('Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep');
  });
});

describe('Contacts page on phones (spec 2026-09-28 §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('the list is full width with no profile beside it', async () => {
    stubContactsApi();
    renderContactsPage('/contacts', { width: 375 });
    await screen.findByRole('list', { name: 'People' });
    expect(screen.queryByRole('region', { name: 'Profile' })).toBeNull();
    expect(screen.queryByText('Choose a person')).toBeNull();
  });

  it('/contacts/abc on a phone is the not-found screen with the back link', async () => {
    stubContactsApi();
    renderContactsPage('/contacts/abc', { width: 375 });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open this person');
    expect(screen.getByRole('link', { name: 'Contacts' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'People' })).toBeNull();
  });

  it('a person opens as their own screen, with a back link that keeps the filters', async () => {
    stubContactsApi();
    renderContactsPage('/contacts?role=champion', { width: 375 });
    await screen.findByRole('list', { name: 'People' });
    await userEvent.click(within(people()[0]).getByRole('link'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Lukas Vermeer' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'People' })).toBeNull();
    const back = screen.getByRole('link', { name: 'Contacts' });
    expect(back).toHaveClass('min-h-11');
    await userEvent.click(back);
    expect(where()).toBe('/contacts?role=champion');
    expect(await screen.findByRole('list', { name: 'People' })).toBeInTheDocument();
  });
});

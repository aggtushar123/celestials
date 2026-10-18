import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ACCOUNT_LISTS,
  LINE_ITEMS,
  LINE_ITEM_RECORDS,
  accountStoryQueries,
  stubAccountPage,
} from '../../features/accounts/testAccountPage';
import { initechApac } from '../../features/accounts/testPortfolio';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { postBodies, requestPaths } from '../../features/organizations/testStory';
import { resetViewport } from '../../test/viewport';
import { renderAccountPage } from './testDetail';

// Integration tier: the real page, store and router; only fetch is stubbed,
// in backend #75's shapes (stubAccountPage). Every render starts from the
// URL alone: no navigation state, no mock data (spec 2026-09-29 §2).

const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));
const landed = (name = 'Pizza EMEA') => screen.findByRole('heading', { level: 1, name });
const header = () => document.querySelector('[data-part="header"]') as HTMLElement;
type Spy = ReturnType<typeof stubAccountPage>;
const patches = (spy: Spy) =>
  spy.mock.calls
    .filter(([, init]) => init?.method === 'PATCH')
    .map(([input, init]) => [new URL(String(input)).pathname.replace(/^\/api\/v1/, ''), JSON.parse(String(init?.body))]);

describe('the account page (/accounts/:id)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    document.body.style.overflow = '';
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('lands by the URL id alone in four requests: the row, the record, the story and its plans', async () => {
    const spy = stubAccountPage();
    renderAccountPage();
    await landed();
    expect(within(header()).getByText('Carl CSM').closest('p')).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(within(header()).getByText('Renewal overdue')).toBeInTheDocument();
    expect(within(header()).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7?account=12');
    expect(within(header()).getByRole('link', { name: 'Yum Brands' })).toHaveAttribute('href', '/organizations/9?account=12');
    expect(within(header()).getByRole('button', { name: 'ARR $69.6K. Show commercial details' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
    await waitFor(() => expect(itemKeys()).toEqual(['email:141', 'call:112', 'ticket:188', 'task:105', 'health:103']));
    for (const item of document.querySelectorAll('[data-story-item]')) expect(item).not.toHaveTextContent('Pizza EMEA');
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
    expect([...requestPaths(spy)].sort()).toEqual(['GET /accounts/12/', 'GET /accounts/12/plans/', 'GET /accounts/12/story/', 'GET /accounts/portfolio/']);
    expect(accountStoryQueries(spy)[0].toString()).toBe('limit=30');
  });

  it('has the seven tabs, no account chips, and none of the removed parts', async () => {
    stubAccountPage();
    renderAccountPage();
    await landed();
    const tablist = screen.getByRole('tablist', { name: 'Account sections' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Story',
      'Details',
      'People',
      'Maps',
      'Deals & risks',
      'Files',
      'Custom objects',
    ]);
    expect(screen.queryByRole('group', { name: 'Filter by account' })).not.toBeInTheDocument();
    for (const gone of [/Company View/, /Enable new 360 UI/, /Ask Copilot/, /Success Plans/, /coming soon/i, /Integrating Salesforce Data/, /Canvas List/]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('tab', { name: 'Organizations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Knowledge' })).not.toBeInTheDocument();
  });

  it('keeps the tab in the URL, with arrows moving it, and never reads the story twice', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage();
    await landed();
    await waitFor(() => expect(itemKeys()).toHaveLength(5));
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(where().searchParams.get('tab')).toBe('details');
    await userEvent.keyboard('{ArrowRight}');
    expect(where().searchParams.get('tab')).toBe('people');
    expect(screen.getByRole('tab', { name: 'People' })).toHaveFocus();
    await userEvent.click(screen.getByRole('tab', { name: 'Story' }));
    expect(where().search).toBe('');
    expect(accountStoryQueries(spy)).toHaveLength(1);
  });

  it('opens on the tab the URL names, reading only what it shows', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage('/accounts/12?tab=canvases');
    await landed();
    expect(screen.getByRole('tab', { name: 'Maps' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: 'EMEA buying group' })).toHaveAttribute('href', '/canvas/301');
    expect(accountStoryQueries(spy)).toHaveLength(0);
  });

  it('reads an unknown tab as the Story', async () => {
    stubAccountPage();
    renderAccountPage('/accounts/12?tab=knowledge');
    await landed();
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
  });

  it('says the account is not found when the viewer may not open it', async () => {
    stubAccountPage({ row: null });
    renderAccountPage();
    expect(await screen.findByText('Account not found')).toBeInTheDocument();
    expect(screen.getByText('It may have been removed, or you may not have access to it.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to accounts' })).toHaveAttribute('href', '/accounts/list');
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toHaveClass('sr-only');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('says the account is not found for an id that is not a number, without asking the server', async () => {
    const spy = stubAccountPage();
    renderAccountPage('/accounts/acc-1');
    expect(await screen.findByText('Account not found')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('says so when the row cannot be read, and Try again reads it again', async () => {
    stubAccountPage({ failPortfolio: 1 });
    renderAccountPage();
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toHaveClass('sr-only');
    expect(screen.getByText('Nothing is shown rather than part of this record.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await landed()).toBeInTheDocument();
  });

  it('a tile jumps to its Details panel and focuses it', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage();
    await landed();
    await userEvent.click(screen.getByRole('button', { name: 'ARR $69.6K. Show commercial details' }));
    expect(where().searchParams.get('tab')).toBe('details');
    await waitFor(() => expect(document.querySelector('[data-panel="commercial"]')).toHaveFocus());
  });

  it('Health opens the account pulse', async () => {
    stubAccountPage();
    renderAccountPage();
    await landed();
    await userEvent.click(screen.getByRole('button', { name: 'Health 4.9, Average. Show the account pulse' }));
    const pulse = screen.getByRole('region', { name: 'Account pulse' });
    expect(await within(pulse).findByText('AI pulse')).toBeInTheDocument();
    expect(pulse).toHaveTextContent('Account pulse: At risk · 2.4 / 5');
  });

  it('Edit saves through the first organisation, and the page reads the account again', async () => {
    const spy = stubAccountPage();
    renderAccountPage();
    await landed();
    const edit = within(header()).getByRole('button', { name: 'Edit' });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    expect(screen.getByRole('heading', { name: 'Edit Pizza EMEA' })).toBeInTheDocument();
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Pizza Europe');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await landed('Pizza Europe')).toBeInTheDocument();
    expect(patches(spy)).toEqual([['/customers/7/accounts/12/', expect.objectContaining({ name: 'Pizza Europe' })]]);
  });

  it('Edit on an account with no organisation the viewer may open saves on the account itself', async () => {
    const spy = stubAccountPage({ row: initechApac });
    renderAccountPage('/accounts/14');
    await landed('Initech APAC');
    const edit = within(header()).getByRole('button', { name: 'Edit' });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches(spy)).toEqual([['/accounts/14/', expect.objectContaining({ name: 'Initech APAC' })]]));
  });

  it('hands the account over from Details with a note, and the name row follows', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage('/accounts/12?tab=details');
    await landed();
    await userEvent.click(await screen.findByRole('button', { name: 'Hand over' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Alice · Customer Success' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('New account owner'), '1');
    await userEvent.type(screen.getByLabelText('Handover note'), 'Covering while Carl is away');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(header()).getByText('Alice')).toBeInTheDocument());
    expect(patches(spy)).toEqual([['/accounts/12/', { owner_id: 1, handover_note: 'Covering while Carl is away' }]]);
  });

  it('⋯ adds a contact and a task on the account, and People and the Story show them', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage();
    await landed();
    await waitFor(() => expect(itemKeys()).toHaveLength(5));
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza EMEA' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add contact' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(postBodies(spy, '/accounts/12/contacts/')).toHaveLength(1));
    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(await screen.findByRole('link', { name: 'Robin Ops' })).toHaveAttribute('href', '/contacts/901');

    await userEvent.click(screen.getByRole('tab', { name: 'Story' }));
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza EMEA' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    expect(dialog).toHaveAccessibleDescription('On Pizza EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Task title' }), 'Book the retraining');
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(itemKeys()).toContain('task:902'));
    expect(postBodies(spy, '/accounts/12/tasks/')).toHaveLength(1);
  });

  it('reads every other tab by the account alone, never through an organisation', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS, definitions: [LINE_ITEMS], records: LINE_ITEM_RECORDS });
    renderAccountPage();
    await landed();
    for (const name of ['People', 'Deals & risks', 'Files', 'Custom objects']) {
      await userEvent.click(screen.getByRole('tab', { name }));
    }
    // Asserted while its panel shows: a visited tab stays mounted but hidden.
    expect(await screen.findByRole('heading', { name: 'Seat licence' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Maps' }));
    expect(await screen.findByRole('link', { name: 'EMEA buying group' })).toBeInTheDocument();
    await waitFor(() =>
      expect(requestPaths(spy)).toEqual(
        expect.arrayContaining([
          'GET /accounts/12/contacts/',
          'GET /accounts/12/opportunities/',
          'GET /accounts/12/risks/',
          'GET /accounts/12/files/',
          'GET /accounts/12/calls/',
          'GET /custom-objects/definitions/',
          'GET /custom-objects/records/',
          'GET /accounts/12/canvases/',
        ]),
      ),
    );
    expect(requestPaths(spy).filter((path) => path.includes('/customers/'))).toEqual([]);
  });

  it('never links an organisation the viewer may not open', async () => {
    stubAccountPage({ row: initechApac });
    renderAccountPage('/accounts/14?tab=details');
    await landed('Initech APAC');
    expect(document.querySelector('[data-part="part-of"]')).toBeNull();
    expect(screen.getByRole('region', { name: 'Knowledge' })).toHaveTextContent('there is none for this account that you can open');
    expect(document.querySelectorAll('a[href^="/organizations/"]')).toHaveLength(0);
  });

  it('on phones: the name row, a strip of tiles, then the scrolling tabs', async () => {
    stubAccountPage();
    renderAccountPage('/accounts/12', { width: 375 });
    await landed();
    expect(within(header()).getByRole('button', { name: /^ARR/ }).parentElement!.parentElement).toHaveClass('snap-x', 'overflow-x-auto');
    const tablist = screen.getByRole('tablist', { name: 'Account sections' });
    expect(tablist).toHaveClass('overflow-x-auto');
    expect(header().compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

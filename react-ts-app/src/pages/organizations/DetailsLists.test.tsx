import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ORGANIZATION_LISTS, postBodies, stubOrganizationPage } from '../../features/organizations/testStory';
import { resetViewport } from '../../test/viewport';
import { renderOrganizationPage } from './testDetail';

// End to end in jsdom (spec 2026-09-27 §7): the real page, store and router;
// only fetch is stubbed. Choosing an account on the Story narrows People,
// Deals & risks and Files, the chips count each tab, and a file uploaded
// while the account is chosen lands on it.
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const chips = () => screen.getByRole('group', { name: 'Filter by account' });
const chip = (name: string) => within(chips()).getByRole('button', { name });

describe('the organization page, delivery 2: the lists and the account chips', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('narrows People, Deals & risks and Files to the chosen account, counting each tab, and uploads to it', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    renderOrganizationPage();
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
    await userEvent.click(await within(chips()).findByRole('button', { name: 'EMEA 1' }));
    expect(where().searchParams.get('account')).toBe('31');

    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    const people = screen.getByRole('tabpanel', { name: 'People' });
    expect(await within(people).findByRole('link', { name: 'Dana Buyer' })).toBeInTheDocument();
    expect(within(people).queryByText('Sam Admin')).not.toBeInTheDocument();
    await waitFor(() => expect(chip('All 3')).toBeInTheDocument());
    expect(chip('EMEA 1')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('North America 1')).toBeInTheDocument();
    expect(chip('Organization 1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Deals & risks' }));
    const deals = screen.getByRole('tabpanel', { name: 'Deals & risks' });
    expect(await within(deals).findByText('EMEA seat expansion')).toBeInTheDocument();
    expect(within(deals).queryByText('Analytics add-on')).not.toBeInTheDocument();
    await waitFor(() => expect(chip('All 3')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Files' }));
    const files = screen.getByRole('tabpanel', { name: 'Files' });
    expect(await within(files).findByText('Order form.pdf')).toBeInTheDocument();
    expect(within(files).queryByText('QBR deck.pptx')).not.toBeInTheDocument();
    expect(await within(files).findByText('EMEA renewal call')).toBeInTheDocument();
    expect(within(files).queryByText('Quarterly check-in')).not.toBeInTheDocument();
    await waitFor(() => expect(chip('All 4')).toBeInTheDocument());
    expect(chip('EMEA 2')).toBeInTheDocument();

    await userEvent.upload(within(files).getByLabelText('Choose files'), new File(['x'], 'Notes.txt', { type: 'text/plain' }));
    expect(await within(files).findByText('Notes.txt')).toBeInTheDocument();
    expect(postBodies(spy, '/customers/7/accounts/31/files/')).toHaveLength(1);
    await waitFor(() => expect(chip('EMEA 3')).toBeInTheDocument());
    expect(where().searchParams.get('account')).toBe('31');

    // Back on the Story, the chips count story items again.
    await userEvent.click(screen.getByRole('tab', { name: 'Story' }));
    expect(chip('EMEA 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    // Dimmed there (owner 2026-09-28): names only, no numbers.
    expect(chip('EMEA')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the chip row on every tab, dimmed on Details and Knowledge, and filters People again after them (owner 2026-09-28)', async () => {
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    renderOrganizationPage('/organizations/7?account=31');
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
    // One element across every switch, so nothing shifts.
    const row = chips();
    // A chip's name is its first span; the count, where shown, follows it.
    const names = () => within(row).getAllByRole('button').map((b) => b.firstElementChild?.textContent ?? '');
    const namesByTab: string[][] = [];
    const note = () => screen.queryByText('Details and Knowledge cover the whole organization');
    for (const tab of ['Story', 'Details', 'People', 'Deals & risks', 'Knowledge', 'Files']) {
      await userEvent.click(screen.getByRole('tab', { name: tab }));
      expect(chips()).toBe(row);
      namesByTab.push(names());
      const whole = tab === 'Details' || tab === 'Knowledge';
      if (whole) {
        expect(note()).toBeInTheDocument();
        expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'EMEA', 'North America', 'Organization']);
        for (const button of within(row).getAllByRole('button')) {
          expect(button).toHaveClass('text-ink-faint');
          expect(button).toHaveAttribute('aria-describedby', note()!.id);
        }
        expect(where().searchParams.get('account')).toBe('31');
        // The row's own Edit (Details lists the accounts with theirs too).
        expect(within(row.parentElement!).getByRole('button', { name: 'Edit EMEA' })).toBeEnabled();
      } else {
        expect(note()).not.toBeInTheDocument();
        for (const button of within(row).getAllByRole('button')) expect(button).not.toHaveAttribute('aria-describedby');
      }
    }
    // The same chips, by name, on all six tabs: Organization never drops out.
    expect(namesByTab).toHaveLength(6);
    for (const tabNames of namesByTab) expect(tabNames).toEqual(['All', 'EMEA', 'North America', 'Organization']);

    // Choosing on Knowledge moves the remembered account; People filters by it.
    await userEvent.click(screen.getByRole('tab', { name: 'Knowledge' }));
    await userEvent.click(within(row).getByRole('button', { name: 'North America' }));
    expect(where().searchParams.get('account')).toBe('32');
    expect(within(row).getByRole('button', { name: 'North America' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    const people = screen.getByRole('tabpanel', { name: 'People' });
    expect(await within(people).findByRole('link', { name: 'Sam Admin' })).toBeInTheDocument();
    expect(within(people).queryByRole('link', { name: 'Dana Buyer' })).not.toBeInTheDocument();
    await waitFor(() => expect(chip('North America 1')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('adds, edits and deletes on People after Files was visited: both tabs stay right, and the chips count each change', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    renderOrganizationPage('/organizations/7?tab=files');
    const files = await screen.findByRole('tabpanel', { name: 'Files' });
    expect(await within(files).findByText('Order form.pdf')).toBeInTheDocument();
    await waitFor(() => expect(chip('All 4')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    const people = screen.getByRole('tabpanel', { name: 'People' });
    expect(await within(people).findByRole('link', { name: 'Pat Finance' })).toBeInTheDocument();
    await waitFor(() => expect(chip('All 3')).toBeInTheDocument());

    // Add on the organization.
    await userEvent.click(within(people).getByRole('button', { name: 'Add contact' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    expect(await within(people).findByRole('link', { name: 'Robin Ops' })).toBeInTheDocument();
    await waitFor(() => expect(chip('All 4')).toBeInTheDocument());
    expect(chip('Organization 2')).toBeInTheDocument();

    // Edit.
    await userEvent.click(within(people).getByRole('button', { name: 'Actions for Robin Ops' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Robin Lead');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await within(people).findByRole('link', { name: 'Robin Lead' })).toBeInTheDocument();

    // Delete: the chips count it at once, without another read.
    const reads = spy.mock.calls.length;
    await userEvent.click(within(people).getByRole('button', { name: 'Actions for Pat Finance' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(people).queryByRole('link', { name: 'Pat Finance' })).not.toBeInTheDocument());
    await waitFor(() => expect(chip('All 3')).toBeInTheDocument());
    expect(chip('Organization 1')).toBeInTheDocument();
    expect(spy.mock.calls.slice(reads).map(([, init]) => init?.method ?? 'GET')).toEqual(['DELETE']);

    // Files kept its lists and its counts.
    await userEvent.click(screen.getByRole('tab', { name: 'Files' }));
    expect(within(files).getByText('Order form.pdf')).toBeInTheDocument();
    expect(within(files).getByText('Quarterly check-in')).toBeInTheDocument();
    expect(chip('All 4')).toBeInTheDocument();

    // Back on People, still the edited list.
    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(within(people).getByRole('link', { name: 'Robin Lead' })).toBeInTheDocument();
    expect(chip('All 3')).toBeInTheDocument();
  });

  it('deletes a file after People was visited: the chips count the delete, and People is unchanged', async () => {
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    renderOrganizationPage('/organizations/7?tab=people');
    const people = await screen.findByRole('tabpanel', { name: 'People' });
    expect(await within(people).findByRole('link', { name: 'Dana Buyer' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Files' }));
    const files = screen.getByRole('tabpanel', { name: 'Files' });
    expect(await within(files).findByText('QBR deck.pptx')).toBeInTheDocument();
    await waitFor(() => expect(chip('All 4')).toBeInTheDocument());
    await userEvent.click(within(files).getByRole('button', { name: /delete qbr deck\.pptx/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(files).queryByText('QBR deck.pptx')).not.toBeInTheDocument());
    await waitFor(() => expect(chip('All 3')).toBeInTheDocument());
    expect(chip('Organization 1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(people.querySelectorAll('[data-person]')).toHaveLength(3);
    expect(chip('All 3')).toBeInTheDocument();
  });

  it('renders the phone layouts at 375px: a row that keeps its name, no board, 44px chips', async () => {
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    renderOrganizationPage('/organizations/7?tab=people', { width: 375 });
    const email = await screen.findByRole('link', { name: 'Email Dana Buyer' });
    // Below sm the row keeps the name, sentiment and ⋯; the profile has the reach links.
    expect(email).toHaveClass('max-sm:hidden');
    expect(screen.getByRole('button', { name: 'Actions for Dana Buyer' })).toHaveClass('min-h-11', 'min-w-11');
    for (const button of within(chips()).getAllByRole('button')) expect(button).toHaveClass('min-h-11');
    const header = document.querySelector('[data-part="header"]') as HTMLElement;
    expect(within(header).getByRole('button', { name: 'Add account' })).toHaveClass('min-w-11');
    await userEvent.click(screen.getByRole('tab', { name: 'Deals & risks' }));
    expect(await screen.findByText('EMEA seat expansion')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
  });
});

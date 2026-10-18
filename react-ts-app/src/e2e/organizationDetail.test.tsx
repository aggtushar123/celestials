import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postBodies, stubOrganizationPage } from '../features/organizations/testStory';
import { renderOrganizationPage } from '../pages/organizations/testDetail';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the List, the
// organization page, the store and the router. Only fetch is stubbed, with
// §2-shaped bodies; "+ Add" writes into the stub's story.
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));

describe('the organization page, end to end (spec §5)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('opens an organization, filters by an account, opens an email, adds a task and sees it in the story', { timeout: 30000 }, async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage('/organizations/list', { nav: true, list: true });

    // 1. Open Pizza Hut from the List; the page wears the Organizations frame.
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza Hut' }));
    expect(where().pathname).toBe('/organizations/7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Organizations' })).toHaveAttribute(
      'href',
      '/organizations/list',
    );
    // The bar is transparent: its hairline shows only once the content scrolls.
    expect(document.querySelector('header')).toHaveClass('border-transparent');
    expect(document.querySelector('header')).not.toHaveClass('bg-surface');

    // 2. Filter the story by EMEA.
    await userEvent.click(await screen.findByRole('button', { name: 'EMEA 1' }));
    expect(where().searchParams.get('account')).toBe('31');
    await waitFor(() => expect(itemKeys()).toEqual(['email:41']));

    // 3. Open the email: its real thread (the message on the organization
    // itself included, though EMEA is chosen), then back to where we were.
    const email = screen.getByRole('button', { name: 'Re: Renewal pricing' });
    await userEvent.click(email);
    const thread = screen.getByRole('dialog', { name: 'Re: Renewal pricing' });
    expect(await within(thread).findByText('Can we see the quote before the board meets on Friday?')).toBeInTheDocument();
    expect(within(thread).getByText('Sharing the renewal quote ahead of your board meeting.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(email).toHaveFocus();

    // 4. Add a task; the chosen account is where it goes.
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    const sheet = screen.getByRole('dialog', { name: 'New task' });
    expect(sheet).toHaveAccessibleDescription('On EMEA');
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Task title' }), 'Send the EMEA quote');
    fireEvent.change(within(sheet).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save task' }));

    // 5. It is in the story, filed under EMEA, and the chip counts it.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postBodies(spy, '/customers/7/accounts/31/tasks/')).toHaveLength(1);
    // Its one-line summary fits, so its title is plain text, not a toggle.
    const added = await screen.findByRole('heading', { level: 3, name: 'Send the EMEA quote' });
    expect(added.closest('[data-story-item]')).toHaveTextContent('EMEA');
    expect(await screen.findByRole('button', { name: 'EMEA 2' })).toHaveAttribute('aria-pressed', 'true');

    // 6. Back to All: the whole story, the new task included.
    await userEvent.click(screen.getByRole('button', { name: 'All 6' }));
    expect(where().searchParams.has('account')).toBe(false);
    await waitFor(() => expect(itemKeys()).toHaveLength(6));

    // 7. Back to the List through the top bar.
    await userEvent.click(screen.getByRole('link', { name: 'Organizations' }));
    expect(where().pathname).toBe('/organizations/list');
  });
});

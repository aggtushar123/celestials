import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pipelineBulkBodies, recordWrites, stubPipelines } from '../features/pipelines/testPipelines';
import { renderPipelines } from '../pages/pipelines/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, pages, store, router
// and every Pipelines component. Only fetch is stubbed, with the backend's
// shapes (branch feat/pipelines-portfolio).
const where = () => screen.getByTestId('where').textContent;
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;

describe('Pipelines', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('filters the book, sets dates in bulk, carries the view to the Board, moves a card and switches to risks', { timeout: 30000 }, async () => {
    const spy = stubPipelines();
    renderPipelines('/pipelines/list', { nav: true });
    expect(screen.getByRole('heading', { name: 'Pipelines' })).toBeInTheDocument();
    expect(await screen.findByText('3 opportunities')).toBeInTheDocument();

    // 1. Carl's book, from the Filters panel.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('combobox', { name: 'Owner' }), '2');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('2 of 3 opportunities')).toBeInTheDocument();

    // 2. A flat list; both items get an expected close in one go.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'none');
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select EMEA seats' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Analytics add-on' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    fireEvent.change(within(bar).getByLabelText('Set date'), { target: { value: '2026-10-15' } });
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
    await waitFor(() => expect(pipelineBulkBodies(spy, 'opportunities')).toEqual([{ ids: [41, 42], action: 'set_date', value: '2026-10-15' }]));
    expect(await within(bar).findByText('Updated 2 opportunities.')).toBeInTheDocument();
    await waitFor(() => expect([...document.querySelectorAll('[data-field="date"]')].filter((d) => d.textContent === 'Closes in 15d')).toHaveLength(4));

    // 3. Part of links the account's page.
    expect(screen.getByRole('link', { name: 'Pizza Hut EMEA' })).toHaveAttribute('href', '/accounts/12');

    // 4. The Board keeps the filter (and reads "no grouping" as by stage).
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Pipelines views' })).getByRole('link', { name: 'Board' }));
    await waitFor(() => expect(where()).toBe('/pipelines/board?owner=2&group=none'));
    await waitFor(() => expect(column('negotiation')).not.toBeNull());
    await within(column('negotiation')).findByRole('button', { name: 'EMEA seats' });

    // 5. Won: saved on the opportunity, landing in Closed Won.
    await userEvent.click(within(column('negotiation')).getByRole('button', { name: 'Move EMEA seats to…' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move EMEA seats to' })).getByRole('menuitem', { name: 'Closed Won' }));
    await waitFor(() => expect(recordWrites(spy)).toEqual([{ method: 'PATCH', path: '/opportunities/41/', body: { stage: 'closed_won' } }]));
    expect(await within(column('closed_won')).findByRole('button', { name: 'EMEA seats' })).toBeInTheDocument();

    // 6. Risks, on the same Board, for the same owner.
    await userEvent.click(within(screen.getByRole('group', { name: 'Opportunities or risks' })).getByRole('button', { name: 'Risks' }));
    await waitFor(() => expect(where()).toBe('/pipelines/board?owner=2&group=none&kind=risks'));
    await waitFor(() => expect(column('open')).not.toBeNull());
    expect(await within(column('open')).findByRole('button', { name: 'Admin left' })).toBeInTheDocument();
  });
});

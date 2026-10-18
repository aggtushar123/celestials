import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { requests, stubSegments } from '../features/segments/testSegments';
import { renderSegments } from '../pages/segments/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the Organizations
// list, the three Segments pages, the store and the router. Only fetch is
// stubbed, in backend PR #84's shapes (spec §5: build, preview, save, open,
// pin, Changes, Save as segment).
const where = () => screen.getByTestId('where').textContent;

describe('Segments', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('saves a filtered list as a segment, previews and saves it, opens it, pins a member, reads its changes and finds it in the list', { timeout: 30000 }, async () => {
    const spy = stubSegments();
    renderSegments('/organizations/list?health=poor', { nav: true });

    // 1. Save as segment from the filtered Organizations list: the builder
    // opens as a modal over the list, which stays where it was.
    await userEvent.click(await screen.findByRole('button', { name: 'Save as segment' }));
    expect(await screen.findByRole('dialog', { name: 'New segment' })).toBeInTheDocument();
    expect(where()).toBe('/organizations/list?health=poor');
    const row = document.querySelector('[data-condition]') as HTMLElement;
    expect(within(row).getByRole('combobox', { name: 'Condition 1 field' })).toHaveDisplayValue('Health');
    expect(within(row).getByRole('combobox', { name: 'Condition 1 value' })).toHaveDisplayValue('Poor');

    // 2. Name it; the preview answers.
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Poor health');
    await waitFor(() => expect(document.querySelector('[data-part="match-count"]')).toHaveTextContent('3 organisations match'));

    // 3. Save: the segment opens, its rules as one sentence, its tiles.
    await userEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    await waitFor(() => expect(where()).toBe('/segments/100'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Poor health' })).toBeInTheDocument();
    expect(screen.getByText('Organisations').closest('p')).toHaveTextContent('Organisations where Health is Poor');
    expect(requests(spy, 'POST', /^\/segments\/$/)[0].body).toMatchObject({
      kind: 'customer',
      rules: { match: 'all', conditions: [{ field: 'health_category', op: 'is', value: 'poor' }] },
    });

    // 4. Pin a member from its row menu.
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Actions for Pizza Hut' })).getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(requests(spy, 'PATCH', /^\/segments\/100\/members\/7\/$/).map((r) => r.body)).toEqual([{ state: 'pinned' }]));

    // 5. The Changes tab, day by day.
    await userEvent.click(screen.getByRole('tab', { name: 'Changes' }));
    await waitFor(() => expect(where()).toBe('/segments/100?tab=changes'));
    expect(await screen.findByText('3 Oct 2026')).toBeInTheDocument();

    // 6. Back to the list through the bar: the new segment is there.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Segments' }));
    await waitFor(() => expect(where()).toBe('/segments'));
    expect(await screen.findByRole('link', { name: 'Poor health' })).toHaveAttribute('href', '/segments/100');
  });
});

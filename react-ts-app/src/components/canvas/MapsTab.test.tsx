import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SAY } from '../../features/canvas/canvasOptions';
import type { RecordKind } from '../../features/canvas/canvasTypes';
import { sentBodies, stubCanvases } from '../../features/canvas/testCanvases';
import { Where } from '../../pages/organizations/testList';
import { MapsTab } from './MapsTab';

function renderTab(record: { kind: RecordKind; id: number; name: string } = { kind: 'account', id: 12, name: 'Pizza EMEA' }) {
  render(
    <MemoryRouter initialEntries={['/here']}>
      <Routes>
        <Route path="/here" element={<MapsTab record={record} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MapsTab (spec §2.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the record's maps, newest edit first, with people and who edited", async () => {
    stubCanvases();
    renderTab();
    const list = await screen.findByRole('list', { name: 'Maps' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual(['EMEA buying group', "Dana's renewal map"]);
    expect(rows[0]).toHaveTextContent('4 people');
    expect(rows[0]).toHaveTextContent('Edited by Dana CSM · 2 days ago');
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/canvas/301');
  });

  it('shows a skeleton, then "No maps yet" with New map', async () => {
    stubCanvases({ maps: [] });
    renderTab();
    expect(screen.getByText('Loading maps')).toBeInTheDocument();
    expect(await screen.findByText(SAY.NO_MAPS)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New map' }).length).toBeGreaterThan(0);
  });

  it('reads again after an error', async () => {
    stubCanvases({ failList: 1 });
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'EMEA buying group' })).toBeInTheDocument();
  });

  it('creates a map from the record\'s people once, then opens the editor', async () => {
    const { spy } = stubCanvases();
    renderTab({ kind: 'organization', id: 7, name: 'Pizza Hut' });
    await userEvent.click(await screen.findByRole('button', { name: 'New map' }));
    const dialog = screen.getByRole('dialog', { name: 'New map' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Pizza Hut map');
    expect(within(dialog).getByRole('radio', { name: "From this record's people" })).toBeChecked();
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Create map' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/canvas/700'));
    expect(sentBodies(spy, 'POST')).toEqual([{ name: 'Pizza Hut map', customer: 7, start: 'people' }]);
  });

  it('starts a blank account map, and shows a name refusal at the name', async () => {
    const { spy } = stubCanvases();
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'New map' }));
    const dialog = screen.getByRole('dialog', { name: 'New map' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, '   ');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Blank' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create map' }));
    expect(await within(dialog).findByText(SAY.NAME)).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(sentBodies(spy, 'POST')).toEqual([{ name: '   ', account: 12, start: 'blank' }]);
  });
});

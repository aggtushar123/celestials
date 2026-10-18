import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../features/canvas/canvasOptions';
import { sentBodies, stubCanvases } from '../features/canvas/testCanvases';
import { renderCanvas } from '../pages/canvas/testPages';
import { mockReactFlow } from '../test/reactFlow';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the Maps tab, the
// editor and the router. Only fetch is stubbed, by a stateful stub in the
// contract's shapes (spec §2.4: new map from people, add a relationship, save,
// a second editor's save gets 409 and reloads, a hidden person stays nameless).
mockReactFlow();
const where = () => screen.getByTestId('where').textContent;
type Patch = { version: number; nodes: { id: string; data: { contact_id: number } }[]; edges: { source: string; target: string; label: string }[] };

describe('Canvas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('builds a map from people, saves a relationship, meets a 409, reloads, and keeps a hidden person nameless', { timeout: 30000 }, async () => {
    const { spy, otherSave } = stubCanvases();

    // 1. New map from the organisation's people.
    renderCanvas('/organizations/7', { nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'New map' }));
    const dialog = screen.getByRole('dialog', { name: 'New map' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create map' }));
    await waitFor(() => expect(where()).toBe('/canvas/700'));
    // The Navbar renders from the URL at once; wait for the map itself.
    expect(await screen.findByText('Rosa Diaz')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Canvas' })).toHaveAttribute('href', '/canvas');
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();

    // 2. Rosa reports to Tom, without dragging; save.
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add a relationship to…' }));
    const relate = screen.getByRole('dialog', { name: 'Add a relationship' });
    await userEvent.selectOptions(within(relate).getByRole('combobox', { name: 'Person' }), 'c52');
    await userEvent.selectOptions(within(relate).getByRole('combobox', { name: 'Relationship' }), 'Reports to');
    await userEvent.click(within(relate).getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByText(SAY.UNSAVED)).toBeNull());
    expect((sentBodies(spy, 'PATCH')[0] as Patch).edges).toEqual([{ id: 'e-c51-c52', source: 'c51', target: 'c52', label: 'Reports to' }]);

    // 3. A second editor (Dana) saves first and adds Hal, whom Alice can't open.
    otherSave(700, (m) => m.nodes.push({ id: 'd54', position: { x: 480, y: 480 }, data: { contact_id: 54 } }));

    // 4. Alice's next save is refused with 409; Reload takes Dana's version.
    await userEvent.type(screen.getByRole('textbox', { name: 'Map name' }), ' (EMEA)');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SAY.CHANGED);
    await userEvent.click(within(alert).getByRole('button', { name: 'Reload' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Discard your changes?' })).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Map name' })).toHaveValue('Pizza Hut map'));

    // 5. Hal is on the map, nameless, with no menu; the relationship survived.
    expect(screen.getByText(SAY.HIDDEN)).toBeInTheDocument();
    expect(screen.queryByText('Hal Hidden')).toBeNull();
    expect(screen.queryByRole('button', { name: `Actions for ${SAY.HIDDEN}` })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    expect(within(screen.getByRole('complementary', { name: 'Rosa Diaz' })).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Rosa Diaz reports to Tom Lee');

    // 6. Saving again keeps Hal's node as stored, on the new version.
    await userEvent.type(screen.getByRole('textbox', { name: 'Map name' }), ' (EMEA)');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(3));
    const last = sentBodies(spy, 'PATCH')[2] as Patch;
    expect(last.version).toBe(3);
    expect(last.nodes).toContainEqual({ id: 'd54', position: { x: 480, y: 480 }, data: { contact_id: 54 } });
    expect(screen.getByRole('textbox', { name: 'Map name' })).toHaveValue('Pizza Hut map (EMEA)');
  });
});

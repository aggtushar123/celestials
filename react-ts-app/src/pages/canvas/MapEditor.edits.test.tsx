import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/canvas/canvasOptions';
import { sentBodies, stubCanvases } from '../../features/canvas/testCanvases';
import { mockReactFlow } from '../../test/reactFlow';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

mockReactFlow();

type Patch = { nodes: { id: string; position: { x: number; y: number }; data: { contact_id: number } }[]; edges: { source: string; target: string; label: string }[] };

describe('MapEditor: every edit without dragging (spec §2.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens a person from their menu: facts, Open contact and their relationships', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Open person', 'Add a relationship to…', 'Remove from map']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    const panel = screen.getByRole('complementary', { name: 'Rosa Diaz' });
    expect(within(panel).getByRole('link', { name: 'Open contact' })).toHaveAttribute('href', '/contacts/51');
    expect(within(panel).getByRole('list', { name: 'Facts' })).toHaveTextContent('Contacted 12 days ago');
    expect(within(panel).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Rosa Diaz reports to Tom Lee');
    expect(within(panel).getByRole('heading', { name: 'Rosa Diaz' })).toHaveFocus();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Actions for Rosa Diaz' })).toHaveFocus();
  });

  it('adds a relationship by picking a person and a label', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Tom Lee' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add a relationship to…' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a relationship' });
    expect(within(dialog).getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['Rosa Diaz', 'Reports to', 'Introduced by', 'Blocks', 'Influences', 'No label']),
    );
    expect(within(dialog).queryByRole('option', { name: SAY.HIDDEN })).toBeNull();
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Person' }), 'n1');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Relationship' }), 'Influences');
    expect(dialog).toHaveTextContent('Tom Lee influences Rosa Diaz');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(1));
    expect((sentBodies(spy, 'PATCH')[0] as Patch).edges).toContainEqual({ id: 'e-n2-n1', source: 'n2', target: 'n1', label: 'Influences' });
  });

  it('refuses a duplicate relationship with a status line', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add a relationship to…' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a relationship' });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Person' }), 'n2');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Relationship' }), 'Reports to');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('They already have this relationship.')).toBeInTheDocument();
  });

  it('relabels and removes a line from the person panel', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Tom Lee' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    const panel = screen.getByRole('complementary', { name: 'Tom Lee' });
    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Relationship: Rosa Diaz reports to Tom Lee' }), 'Blocks');
    expect(within(panel).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Rosa Diaz blocks Tom Lee');
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove the line: Rosa Diaz blocks Tom Lee' }));
    expect(within(panel).getByText('No relationships yet.')).toBeInTheDocument();
  });

  it('adds a tray person at the next free grid spot, and they leave the tray', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    const tray = await screen.findByRole('region', { name: SAY.NOT_ON_MAP });
    await userEvent.click(within(tray).getByRole('button', { name: /^Not on the map/ }));
    await userEvent.click(within(tray).getByRole('button', { name: 'Add Omar Farouk to the map' }));
    expect(within(tray).queryByRole('button', { name: 'Add Omar Farouk to the map' })).toBeNull();
    expect(screen.getByText('Omar Farouk')).toBeInTheDocument();
    expect(screen.getByText('Save to see their facts.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(1));
    // n1-n3 fill row 0's first three cells and n4 row 1's first: the next free one is row 0, column 4.
    expect((sentBodies(spy, 'PATCH')[0] as Patch).nodes.at(-1)).toEqual({ id: 'c55', position: { x: 720, y: 0 }, data: { contact_id: 55 } });
    expect(await screen.findByText('Not contacted yet')).toBeInTheDocument();
  });

  it('removes a removed contact, keeps the hidden one without a menu', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${SAY.REMOVED}` }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Remove from map']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from map' }));
    expect(screen.queryByText(SAY.REMOVED)).toBeNull();
    expect(screen.queryByRole('button', { name: `Actions for ${SAY.HIDDEN}` })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(1));
    expect((sentBodies(spy, 'PATCH')[0] as Patch).nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
  });
});

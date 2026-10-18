import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/canvas/canvasOptions';
import { stubCanvases } from '../../features/canvas/testCanvases';
import { dragNode, mockReactFlow } from '../../test/reactFlow';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

mockReactFlow();
const where = () => screen.getByTestId('where').textContent;

describe('MapEditor: 409, leaving, delete, phones (spec §2.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the 409 sentence with Reload, which discards local edits after a confirm', async () => {
    const { otherSave } = stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.type(name, ' 2');
    otherSave(301, (m) => { m.name = 'Renamed by Dana'; });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SAY.CHANGED);
    expect(alert).toHaveFocus();
    await userEvent.click(within(alert).getByRole('button', { name: 'Reload' }));
    const confirm = screen.getByRole('dialog', { name: 'Discard your changes?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Map name' })).toHaveValue('Renamed by Dana'));
    expect(screen.queryByText(SAY.UNSAVED)).toBeNull();
  });

  it('asks before leaving with unsaved changes, and stays on Cancel', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.type(await screen.findByRole('textbox', { name: 'Map name' }), ' 2');
    await userEvent.click(screen.getByRole('link', { name: 'Pizza EMEA' }));
    const ask = screen.getByRole('dialog', { name: 'Leave without saving?' });
    expect(where()).toBe('/canvas/301');
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(where()).toBe('/canvas/301');
    await userEvent.click(screen.getByRole('link', { name: 'Pizza EMEA' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(where()).toBe('/accounts/12'));
  });

  it('leaves without asking when nothing changed', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza EMEA' }));
    await waitFor(() => expect(where()).toBe('/accounts/12'));
  });

  it("deletes a map its creator's manager may delete, once, then opens the record's Maps tab", async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Map actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.dblClick(within(screen.getByRole('dialog', { name: 'Delete EMEA buying group?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/accounts/12?tab=maps'));
    expect(spy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toHaveLength(1);
  });

  it("offers no Delete on a map someone else's team made", async () => {
    stubCanvases();
    renderCanvas('/canvas/303');
    await screen.findByRole('textbox', { name: 'Map name' });
    expect(screen.queryByRole('button', { name: 'Map actions' })).toBeNull();
  });

  it('is read-only on a phone, with a People view, relationships as sentences and the note', async () => {
    stubCanvases();
    renderCanvas('/canvas/301', { width: 375 });
    expect(await screen.findByText(SAY.PHONE_NOTE)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'EMEA buying group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute('aria-pressed', 'true');
    const people = screen.getByRole('region', { name: 'People' });
    expect(within(people).getByText('Rosa Diaz')).toBeInTheDocument();
    expect(within(people).getByText(SAY.HIDDEN)).toBeInTheDocument();
    expect(within(people).queryByText('Hal Hidden')).toBeNull();
    expect(within(people).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Rosa Diaz reports to Tom Lee');
    await userEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByRole('region', { name: 'Map board' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Rosa Diaz' })).toBeNull();
    const drag = await dragNode('n1');
    expect(drag.after).toBe(drag.before);
  });
});

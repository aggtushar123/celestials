import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCanvases } from '../../features/canvas/testCanvases';
import { mockReactFlow } from '../../test/reactFlow';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

mockReactFlow();

const board = () => screen.getByRole('region', { name: 'Map board' });
const pathOf = (edgeId: string) => document.querySelector(`.react-flow__edge[data-id="${edgeId}"] path.react-flow__edge-path`)?.getAttribute('d') ?? '';
/** A path's first and last points: "M x,y C ... x,y". */
const endsOf = (d: string) => {
  const numbers = d.match(/-?[\d.]+/g)?.map(Number) ?? [];
  return { start: { x: numbers[0], y: numbers[1] }, end: { x: numbers.at(-2)!, y: numbers.at(-1)! } };
};

async function linkTomToRosa() {
  await userEvent.click(await screen.findByRole('button', { name: 'Actions for Tom Lee' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Add a relationship to…' }));
  const dialog = screen.getByRole('dialog', { name: 'Add a relationship' });
  await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Person' }), 'n1');
  await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Relationship' }), 'Influences');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
}

describe('MapEditor board: lines, menus and focus (canvas visuals)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('gives every card a drag handle on all four sides', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await screen.findByText('Rosa Diaz');
    const sides = [...document.querySelectorAll('.react-flow__node[data-id="n1"] .react-flow__handle')].map((h) => h.getAttribute('data-handlepos'));
    expect(sides.sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });

  it('keeps the handles invisible until the card is hovered or focused, or a line is being drawn', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await screen.findByText('Rosa Diaz');
    const card = document.querySelector('.react-flow__node[data-id="n1"] [data-node]')!;
    expect(card).toHaveClass('group');
    const handles = [...card.querySelectorAll('.react-flow__handle')];
    expect(handles).toHaveLength(4);
    for (const handle of handles) {
      expect(handle).toHaveClass('!opacity-0', 'group-hover:!opacity-100', 'group-focus-within:!opacity-100');
      // Tabbing to a card focuses React Flow's node wrapper, outside the card's group.
      expect(handle).toHaveClass('in-[[aria-roledescription=node]:focus-visible]:!opacity-100');
      // Still there to drag from.
      expect(handle).toHaveClass('connectable');
    }
  });

  it('runs a line between the sides of two cards that face each other', async () => {
    // Rosa (n1) sits left of Tom (n2) on one row: the line leaves Rosa's
    // right side and meets Tom's left side, both halfway down.
    stubCanvases();
    renderCanvas('/canvas/301');
    await screen.findByText('Rosa Diaz');
    await waitFor(() => expect(pathOf('e1')).not.toBe(''));
    const { start, end } = endsOf(pathOf('e1'));
    expect(start.y).toBe(end.y);
    expect(start.x).toBeLessThan(end.x);
  });

  it('bows a two-way pair apart: two paths and two labels in different places', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await linkTomToRosa();
    await waitFor(() => expect(pathOf('e-n2-n1')).not.toBe(''));
    expect(pathOf('e1')).not.toBe(pathOf('e-n2-n1'));
    const there = screen.getByRole('button', { name: /^Relationship: Reports to\./ }).closest<HTMLElement>('.absolute')!;
    const back = screen.getByRole('button', { name: /^Relationship: Influences\./ }).closest<HTMLElement>('.absolute')!;
    const yOf = (el: HTMLElement) => Number(el.style.transform.match(/translate\([^)]*\) translate\([-\d.]+px, ([-\d.]+)px\)/)![1]);
    // A label is at most 44px tall: the pair's labels sit further apart than that.
    expect(Math.abs(yOf(there) - yOf(back))).toBeGreaterThanOrEqual(44);
  });

  it("opens a card's menu outside the board, so the board's edge never clips it", async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    const menu = screen.getByRole('menu', { name: 'Actions for Rosa Diaz' });
    expect(board().contains(menu)).toBe(false);
    expect(screen.getByRole('menuitem', { name: 'Open person' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Actions for Rosa Diaz' })).toHaveFocus();
    // Escape stays with the menu: React Flow never sees it, so the card is
    // not selected (a Delete straight after would remove it).
    expect(document.querySelector('.react-flow__node[data-id="n1"]')).not.toHaveClass('selected');
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.react-flow__node[data-id="n1"]')).not.toHaveClass('selected');
  });

  it('moves focus to the board after Remove from map, not to the page', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from map' }));
    expect(screen.queryByRole('button', { name: 'Actions for Rosa Diaz' })).toBeNull();
    expect(board()).toHaveFocus();
  });

  it('removes once on a double-click of Remove from map, without an error', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.dblClick(screen.getByRole('menuitem', { name: 'Remove from map' }));
    expect(document.querySelector('.react-flow__node[data-id="n1"]')).toBeNull();
    expect(document.querySelectorAll('.react-flow__node')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Actions for Tom Lee' })).toBeInTheDocument();
  });

  it('removes a selected card with the Delete key, and focus lands on the board', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await screen.findByText('Rosa Diaz');
    // A click without the mousedown: d3-drag (React Flow's dragging) needs a real window on mousedown.
    fireEvent.click(document.querySelector<HTMLElement>('.react-flow__node[data-id="n1"]')!);
    await userEvent.keyboard('{Delete}');
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="n1"]')).toBeNull());
    expect(document.querySelectorAll('.react-flow__node')).toHaveLength(3);
    expect(board()).toHaveFocus();
  });

  it('returns focus to the card that opened the panel most recently', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Tom Lee' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    const panel = screen.getByRole('complementary', { name: 'Tom Lee' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Actions for Tom Lee' })).toHaveFocus();
  });

  it('stacks line labels above every card, a selected one included, and their menu outside the board', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await screen.findByText('Rosa Diaz');
    // A selected card is lifted by React Flow (z-index 1000): select one first.
    fireEvent.click(document.querySelector<HTMLElement>('.react-flow__node[data-id="n2"]')!);
    const label = screen.getByRole('button', { name: /^Relationship: Reports to\./ }).closest<HTMLElement>('.absolute')!;
    const cards = [...document.querySelectorAll<HTMLElement>('.react-flow__node')].map((node) => Number(node.style.zIndex || 0));
    expect(Math.max(...cards)).toBeGreaterThanOrEqual(1000);
    expect(Number(label.style.zIndex)).toBeGreaterThan(Math.max(...cards));
    await userEvent.click(screen.getByRole('button', { name: /^Relationship: Reports to\./ }));
    const menu = screen.getByRole('menu');
    expect(board().contains(menu)).toBe(false);
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus();
    // Escape closes the menu and stays there: the line is not selected by it.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.querySelector('.react-flow__edge[data-id="e1"]')).not.toHaveClass('selected');
  });
});

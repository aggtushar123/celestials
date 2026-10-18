import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BUILT_CANVAS_ID, MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';
import { SAY } from '../../features/canvas/canvasOptions';
import { EMEA_MAP, EMEA_PLAN, HUT_MAP, MAPS } from '../../features/canvas/testCanvasFixtures';
import { sentBodies, stubCanvases } from '../../features/canvas/testCanvases';
import { dragNode, mockReactFlow } from '../../test/reactFlow';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

mockReactFlow();

describe('MapEditor: load, header, plans, board, save (spec §2.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the name, the record, who edited, the open plans and every node class', async () => {
    stubCanvases({ plans: [EMEA_PLAN] });
    renderCanvas('/canvas/301');
    expect(await screen.findByRole('textbox', { name: 'Map name' })).toHaveValue('EMEA buying group');
    expect(screen.getByRole('link', { name: 'Pizza EMEA' })).toHaveAttribute('href', '/accounts/12');
    expect(screen.getByText(/Edited by Dana CSM/)).toBeInTheDocument();
    const plans = screen.getByRole('region', { name: 'Open plans' });
    expect(within(plans).getByRole('link', { name: /EMEA onboarding/ })).toHaveAttribute('href', '/projects/41');
    expect(within(plans).getByText('On track')).toBeInTheDocument();
    // The board's nodes land a render after the header: wait for them.
    expect(await screen.findByText('Rosa Diaz')).toBeInTheDocument();
    expect(screen.getByText(SAY.HIDDEN)).toBeInTheDocument();
    expect(screen.queryByText('Hal Hidden')).toBeNull();
    expect(screen.getByText(SAY.REMOVED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByText(SAY.UNSAVED)).toBeNull();
    expect(screen.getByRole('button', { name: 'Map actions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'EMEA buying group' })).toBeInTheDocument();
  });

  it('never shows the last map under a new map id', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301', { goTo: '/canvas/302' });
    await screen.findByRole('textbox', { name: 'Map name' });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = spy.getMockImplementation()!;
    spy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => (String(input).includes('/canvases/302/') ? gate.then(() => real(input, init)) : real(input, init)));
    await userEvent.click(screen.getByRole('button', { name: 'Go to /canvas/302' }));
    expect(screen.queryByRole('textbox', { name: 'Map name' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    release();
    expect(await screen.findByRole('textbox', { name: 'Map name' })).toHaveValue('Pizza Hut leadership');
  });

  it('reads a 404 on save as the missing-map sentence', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.type(await screen.findByRole('textbox', { name: 'Map name' }), ' 2');
    const real = spy.getMockImplementation()!;
    spy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PATCH' ? Promise.resolve(new Response(JSON.stringify({ detail: 'Not found.' }), { status: 404, headers: { 'Content-Type': 'application/json' } })) : real(input, init),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(SAY.MISSING);
  });

  it('keeps the board wide at tablet widths: the closed tray is only its button, the panel overlays', async () => {
    stubCanvases();
    renderCanvas('/canvas/301', { width: 800 });
    const tray = await screen.findByRole('region', { name: SAY.NOT_ON_MAP });
    expect(tray).not.toHaveClass('w-60');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    expect(screen.getByRole('complementary', { name: 'Rosa Diaz' })).toHaveClass('max-lg:absolute');
    await userEvent.click(within(tray).getByRole('button', { name: new RegExp(SAY.NOT_ON_MAP) }));
    expect(tray).toHaveClass('w-60');
  });

  it('offers no Delete when the reader may not delete the map', async () => {
    stubCanvases();
    renderCanvas('/canvas/303');
    await screen.findByRole('textbox', { name: 'Map name' });
    expect(screen.queryByRole('button', { name: 'Map actions' })).toBeNull();
  });

  it('says No open plans with Start a plan', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    const plans = await screen.findByRole('region', { name: 'Open plans' });
    expect(plans).toHaveTextContent(SAY.NO_PLANS);
    expect(within(plans).getByRole('link', { name: 'Start a plan' })).toHaveAttribute('href', '/accounts/12/plans/new');
  });

  it('renames, shows Unsaved changes, and saves once with the version and only the contract keys', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'EMEA buyers');
    expect(screen.getByText(SAY.UNSAVED)).toBeInTheDocument();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByText(SAY.UNSAVED)).toBeNull());
    const [body] = sentBodies(spy, 'PATCH') as { name: string; version: number; nodes: object[]; edges: object[] }[];
    expect(sentBodies(spy, 'PATCH')).toHaveLength(1);
    expect(body.name).toBe('EMEA buyers');
    expect(body.version).toBe(4);
    expect(body.nodes.map((n) => Object.keys(n).sort())).toEqual(Array(4).fill(['data', 'id', 'position']));
    expect(body.edges).toEqual([{ id: 'e1', source: 'n1', target: 'n2', label: 'Reports to' }]);
    expect(screen.getByText(/Edited by Alice/)).toBeInTheDocument();
  });

  it('saves again once the version has moved, even with an identical payload', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'EMEA buyers ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(1));
    // The server trims the trailing space (applySave's own `name.trim()`);
    // typing it straight back in makes the map dirty again against the
    // trimmed copy, with a payload byte-for-byte identical to the first
    // save's. The old payload-keyed latch dropped this outright; version-
    // keying it lets a real, later save through regardless.
    await userEvent.clear(name);
    await userEvent.type(name, 'EMEA buyers ');
    await waitFor(() => expect(screen.getByText(SAY.UNSAVED)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(2));
    const bodies = sentBodies(spy, 'PATCH') as { version: number; name: string }[];
    expect(bodies[0].version).toBe(4);
    expect(bodies[1].version).toBe(5);
    expect(bodies[0].name).toBe(bodies[1].name);
  });

  it('moves a person by dragging, which is an unsaved change; a hidden person stays put', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await screen.findByText('Rosa Diaz');
    const hidden = await dragNode('n3');
    expect(hidden.after).toBe(hidden.before);
    expect(screen.queryByText(SAY.UNSAVED)).toBeNull();
    const handles = (id: string) => [...document.querySelectorAll(`.react-flow__node[data-id="${id}"] .react-flow__handle`)];
    expect(handles('n3').some((h) => h.classList.contains('connectable'))).toBe(false);
    expect(handles('n1').every((h) => h.classList.contains('connectable'))).toBe(true);
    const rosa = await dragNode('n1');
    expect(rosa.after).not.toBe(rosa.before);
    expect(screen.getByText(SAY.UNSAVED)).toBeInTheDocument();
  });

  it('locks the name input and the board while a save is in flight, without losing the edit', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'EMEA buyers');

    // Hold the PATCH open so the in-flight window is observable, rather
    // than racing the stub's own (near-instant) promise chain.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = spy.getMockImplementation()!;
    spy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PATCH' ? gate.then(() => real(input, init)) : real(input, init),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(name).toBeDisabled();
    expect(name).toHaveValue('EMEA buyers');
    const drag = await dragNode('n1');
    expect(drag.after).toBe(drag.before);

    release();
    await waitFor(() => expect(screen.queryByText(SAY.UNSAVED)).toBeNull());
    expect(name).not.toBeDisabled();
    expect(name).toHaveValue('EMEA buyers');
  });

  it('lists field refusals in a summary that takes focus', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent(SAY.NAME);
    expect(summary).toHaveFocus();
  });

  it('saves again once a field refusal is fixed', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    await userEvent.type(name, 'Fixed name');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the 409 message when someone else changed the map first', async () => {
    const { otherSave } = stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'EMEA buyers');
    otherSave(301, (map) => {
      map.name = 'Dana renamed it';
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent(SAY.CHANGED);
  });

  it('labels a line from its menu', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: /^Relationship: Reports to\./ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Influences' }));
    expect(screen.getByRole('button', { name: /^Relationship: Influences\. Rosa Diaz influences Tom Lee/ })).toBeInTheDocument();
    expect(screen.getByText(SAY.UNSAVED)).toBeInTheDocument();
  });

  it('says a missing map is missing', async () => {
    stubCanvases();
    renderCanvas('/canvas/304');
    expect(await screen.findByText(SAY.MISSING)).toBeInTheDocument();
  });

  it('says an agent laid the map out, and who approved it (Agents delivery 3)', async () => {
    stubCanvases({ maps: [...MAPS, { ...HUT_MAP, id: BUILT_CANVAS_ID, name: 'Pizza Hut people', made_by: MADE_BY_OPS }] });
    renderCanvas(`/canvas/${BUILT_CANVAS_ID}`);
    expect(await screen.findByRole('textbox', { name: 'Map name' })).toHaveValue('Pizza Hut people');
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');
  });

  it('says nothing of an agent on a map a person made', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await screen.findByRole('textbox', { name: 'Map name' });
    expect(document.querySelector('[data-part="made-by"]')).toBeNull();
  });
});

describe('a map on the primitives (Impact PR)', () => {
  it('keeps Save as the one primary, Delete in the menu, and says Unsaved changes in a region that stays mounted', async () => {
    stubCanvases();
    renderCanvas(`/canvas/${EMEA_MAP.id}`);
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    const region = document.querySelector('[data-part="status"]')!;
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toBeEmptyDOMElement();
    await userEvent.type(name, ' 2');
    expect(document.querySelector('[data-part="status"]')).toBe(region);
    expect(region).toHaveTextContent(SAY.UNSAVED);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-accent');
    await userEvent.click(screen.getByRole('button', { name: 'Map actions' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('text-danger-ink');
  });

  it('frames the tray, the board and the panel as one surface', async () => {
    stubCanvases();
    renderCanvas(`/canvas/${EMEA_MAP.id}`);
    const board = await screen.findByRole('region', { name: 'Map board' });
    expect(board.className).not.toMatch(/\bborder\b|rounded-xl/);
    const frame = board.parentElement!;
    expect(frame).toHaveClass('rounded-xl', 'border', 'border-line', 'overflow-hidden');
    expect(within(frame).getByRole('region', { name: new RegExp(SAY.NOT_ON_MAP) })).toBeInTheDocument();
  });
});

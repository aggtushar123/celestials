import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ACT_DRAFT_REPLY,
  ACT_LIFECYCLE,
  ACT_PLAN_START,
  ACT_SEGMENT_CREATE,
  BUILT_SEGMENT_ID,
  DRAFT_EMAIL_ID,
  STARTED_PLAN_ID,
} from '../features/agents/testAgentsFixtures';
import { stubAgents } from '../features/agents/testAgents';
import { bundleOfOne, step } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { stubDrafts } from '../features/agents/testDrafts';
import { AGENT_SEGMENT, SEGMENTS, stubSegments } from '../features/segments/testSegments';
import { notificationsReceived } from '../features/notifications/notificationsSlice';
import { renderWork, where } from '../pages/work/testPages';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom): the real Navbar, WorkRoutes and the router; only
// fetch is stubbed (stubBundles in front of stubAgents). Agents spec §6 on
// agent bundles: an agent proposes a lifecycle change as a bundle of one,
// the owner runs it from Mine, finds it in History and undoes it; the bell's
// agent_action_undone notice (an Activity link) lands on its bundle in
// History. No em dash.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agents: propose, run, see, undo', () => {
  it('runs the CS agent lifecycle change, finds it in History and undoes it', { timeout: 30000 }, async () => {
    const agents = stubAgents({ actions: [ACT_LIFECYCLE] });
    stubBundles({
      bundles: [bundleOfOne(ACT_LIFECYCLE)],
      recommendations: [],
      passThrough: agents.spy,
      outputs: { [ACT_LIFECYCLE.id]: {} },
      actions: { [ACT_LIFECYCLE.id]: ACT_LIFECYCLE.bundle },
    });
    const { store } = renderWork('/work?queue=mine&kind=bundle', { nav: true });

    await userEvent.click(await screen.findByRole('link', { name: `Review ${ACT_LIFECYCLE.title}` }));
    const panel = await screen.findByRole('dialog', { name: ACT_LIFECYCLE.title });
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(panel).findByText('Done: all 1 step ran.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));

    const rail = screen.getByRole('navigation', { name: 'Queues' });
    await userEvent.click(within(rail).getByRole('link', { name: 'History' }));
    const row = (await screen.findByRole('link', { name: `Review ${ACT_LIFECYCLE.title}` })).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Ran by Alice');
    await userEvent.click(within(row).getByRole('link', { name: `Review ${ACT_LIFECYCLE.title}` }));
    const done = await screen.findByRole('dialog', { name: ACT_LIFECYCLE.title });
    const ran = within(done.querySelector(`[data-step="${ACT_LIFECYCLE.id}"]`) as HTMLElement);
    expect(await ran.findByText('Applied')).toBeInTheDocument();

    await userEvent.click(ran.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(within(done.querySelector(`[data-step="${ACT_LIFECYCLE.id}"]`) as HTMLElement).getByText('Undone')).toBeInTheDocument());
    expect(within(done).getByText('Undone: Move Pizza Hut to Renewal.')).toBeInTheDocument();
    await userEvent.click(within(done).getByRole('button', { name: 'Close' }));

    // The approver hears of the undo through the bell, and its Activity link
    // opens that action's bundle in History, focused in its panel.
    await userEvent.click(within(rail).getByRole('link', { name: /^Mine/ }));
    act(() => {
      store.dispatch(
        notificationsReceived([
          {
            id: 501,
            kind: 'agent_action_undone',
            message: 'Alice undid "Move Pizza Hut to Renewal".',
            link: `/work/activity?action=${ACT_LIFECYCLE.id}`,
            actor: { id: 1, name: 'Alice' },
            is_read: false,
            created_at: '2026-10-08T10:00:00Z',
          },
        ]),
      );
    });
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await userEvent.click(screen.getByText('Alice undid "Move Pizza Hut to Renewal".'));
    await waitFor(() => expect(where()).toBe(`/work?queue=history&bundle=${ACT_LIFECYCLE.bundle}`));
    const linked = await screen.findByRole('dialog', { name: ACT_LIFECYCLE.title });
    await waitFor(() => expect(linked).toContainElement(document.activeElement as HTMLElement));
    expect(await within(linked.querySelector(`[data-step="${ACT_LIFECYCLE.id}"]`) as HTMLElement).findByText('Undone')).toBeInTheDocument();
  });
});

// Agents delivery 2: an Auto draft.reply is opened from Mine, sent from
// Communications, and Undo in History then answers that it was sent; a
// plan.start is run from Mine and reads Applied in History. Stubs: bundles
// in front of drafts in front of agents in front of work.

/** The Auto draft as History holds it: applied on its own (no runner). */
const DRAFT_BUNDLE = (() => {
  const waiting = bundleOfOne(ACT_DRAFT_REPLY);
  return {
    ...waiting,
    status: 'done' as const,
    can_run: false,
    can_reject: false,
    run_finished_at: ACT_DRAFT_REPLY.applied_at,
    updated_at: ACT_DRAFT_REPLY.applied_at as string,
    steps: [step({ ...waiting.steps[0], status: 'applied', can_run: false, outputs: { draft_id: DRAFT_EMAIL_ID }, undo: ACT_DRAFT_REPLY.undo })],
  };
})();

describe('Agents: drafts and plans', () => {
  it('opens an Auto draft from Mine, sends it, and Undo in History says it was sent', { timeout: 30000 }, async () => {
    const agents = stubAgents({ actions: [ACT_DRAFT_REPLY], draftSent: (id) => drafts.isSent(id) });
    const drafts = stubDrafts({ passThrough: agents.spy });
    const bundles = stubBundles({ bundles: [DRAFT_BUNDLE], recommendations: [], passThrough: drafts.spy });
    // Undoing a draft reply is the action's own undo (contract §3): the agents
    // stub, which knows whether the draft was sent, answers it.
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes(`/agents/actions/${ACT_DRAFT_REPLY.id}/undo/`) ? agents.spy(input, init) : bundles.spy(input, init),
    );
    renderWork('/work?queue=mine', { nav: true, drafts: true });

    const draftRow = (await screen.findByRole('link', { name: 'Open draft' })).closest('article') as HTMLElement;
    expect(draftRow).toHaveTextContent('CS agent');
    await userEvent.click(within(draftRow).getByRole('link', { name: 'Open draft' }));
    await waitFor(() => expect(where()).toBe(`/communications?draft=${DRAFT_EMAIL_ID}`));

    const panel = await screen.findByRole('region', { name: 'Draft reply' });
    const heading = await within(panel).findByRole('heading', { level: 2, name: 'Reply to Ann Lee' });
    await waitFor(() => expect(heading).toHaveFocus());
    await userEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    const status = await within(panel).findByText('Sent to Ann Lee <ann@x.com>.');
    await waitFor(() => expect(status).toHaveFocus());
    expect(panel.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Alice.');
    expect(within(panel).queryByRole('textbox')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Test back' }));
    await waitFor(() => expect(where()).toBe('/work?queue=mine'));
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Queues' })).getByRole('link', { name: 'History' }));
    const row = (await screen.findByRole('link', { name: `Review ${ACT_DRAFT_REPLY.title}` })).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Applied on its own');
    await userEvent.click(within(row).getByRole('link', { name: `Review ${ACT_DRAFT_REPLY.title}` }));
    const done = await screen.findByRole('dialog', { name: ACT_DRAFT_REPLY.title });
    const sentStep = within(done.querySelector(`[data-step="${ACT_DRAFT_REPLY.id}"]`) as HTMLElement);
    await userEvent.click(await sentStep.findByRole('button', { name: 'Undo' }));
    expect(await sentStep.findByRole('alert')).toHaveTextContent('This draft has been sent.');
  });

  it('runs a plan start from Mine, and History reads it Applied', { timeout: 30000 }, async () => {
    const agents = stubAgents({ actions: [ACT_PLAN_START] });
    const { spy } = stubBundles({ bundles: [bundleOfOne(ACT_PLAN_START)], recommendations: [], passThrough: agents.spy, outputs: { [ACT_PLAN_START.id]: { plan_id: STARTED_PLAN_ID } } });
    renderWork('/work?queue=mine&kind=bundle', { nav: true });

    await userEvent.click(await screen.findByRole('link', { name: `Review ${ACT_PLAN_START.title}` }));
    const panel = await screen.findByRole('dialog', { name: ACT_PLAN_START.title });
    expect(panel.querySelector(`[data-step="${ACT_PLAN_START.id}"] [data-part="preview"]`)).toHaveTextContent('Start a plan: Onboarding, 3 milestones, 9 tasks');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(panel).findByText('Done: all 1 step ran.')).toBeInTheDocument();
    expect(spy.mock.calls.some(([url, init]) => String(url).endsWith(`/agents/bundles/${ACT_PLAN_START.bundle}/run/`) && init?.method === 'POST')).toBe(true);
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));

    // Contract §6.2: a plan's id has no page, so its step reads Applied with no link.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Queues' })).getByRole('link', { name: 'History' }));
    const row = (await screen.findByRole('link', { name: `Review ${ACT_PLAN_START.title}` })).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Ran by Alice');
    await userEvent.click(within(row).getByRole('link', { name: `Review ${ACT_PLAN_START.title}` }));
    const done = await screen.findByRole('dialog', { name: ACT_PLAN_START.title });
    const ran = within(done.querySelector(`[data-step="${ACT_PLAN_START.id}"]`) as HTMLElement);
    expect(await ran.findByText('Applied')).toBeInTheDocument();
    expect(ran.queryByRole('link', { name: 'Open plan' })).toBeNull();
  });
});

// Agents delivery 3: the Ops agent's segment waits on the rest of the
// company (it has no record), is run from its panel, opened from History (it
// says who made it), then undone, and History stops linking it. Stubs:
// bundles in front of agents in front of segments. The segments stub holds
// the built segment from the start (Decision 7).

describe('Agents: the builder', () => {
  it('runs an Ops segment from the company queue, opens it from History, then undoes it', { timeout: 30000 }, async () => {
    const segments = stubSegments({ segments: [...SEGMENTS, AGENT_SEGMENT] });
    const agents = stubAgents({ actions: [ACT_SEGMENT_CREATE], passThrough: segments });
    stubBundles({
      bundles: [bundleOfOne(ACT_SEGMENT_CREATE)],
      recommendations: [],
      passThrough: agents.spy,
      outputs: { [ACT_SEGMENT_CREATE.id]: { segment_id: BUILT_SEGMENT_ID, segment_url: `/segments/${BUILT_SEGMENT_ID}` } },
    });
    renderWork('/work?queue=company&kind=bundle', { nav: true, segments: true });

    // 1. In the queue: the proposal with no record (Review is its only link);
    //    in the panel, the proposal in words.
    const title = await screen.findByRole('heading', { name: ACT_SEGMENT_CREATE.title });
    const proposal = title.closest('li') as HTMLElement;
    expect(within(proposal).getAllByRole('link').map((link) => link.getAttribute('aria-label') ?? link.textContent)).toEqual([`Review ${ACT_SEGMENT_CREATE.title}`]);
    await userEvent.click(within(proposal).getByRole('link', { name: `Review ${ACT_SEGMENT_CREATE.title}` }));
    const panel = await screen.findByRole('dialog', { name: ACT_SEGMENT_CREATE.title });
    // The preview's figures sit in their own tabular spans, so read the whole line.
    expect(panel.querySelector(`[data-step="${ACT_SEGMENT_CREATE.id}"] [data-part="preview"]`)).toHaveTextContent('Build a segment: Poor health renewals, 2 conditions, 12 organisations');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(panel).findByText('Done: all 1 step ran.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));

    // 2. History: ran by me, with Open segment.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Queues' })).getByRole('link', { name: 'History' }));
    const row = (await screen.findByRole('link', { name: `Review ${ACT_SEGMENT_CREATE.title}` })).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Ran by Alice');
    await userEvent.click(within(row).getByRole('link', { name: `Review ${ACT_SEGMENT_CREATE.title}` }));
    const done = await screen.findByRole('dialog', { name: ACT_SEGMENT_CREATE.title });
    const ran = within(done.querySelector(`[data-step="${ACT_SEGMENT_CREATE.id}"]`) as HTMLElement);
    expect(await ran.findByText('Applied')).toBeInTheDocument();
    await userEvent.click(ran.getByRole('link', { name: 'Open segment' }));
    await waitFor(() => expect(where()).toBe(`/segments/${BUILT_SEGMENT_ID}`));

    // 3. The segment says who made it.
    expect(await screen.findByRole('heading', { level: 1, name: AGENT_SEGMENT.name })).toBeInTheDocument();
    expect(document.querySelector('[data-part="made-by"]')).toHaveTextContent('Made by the Ops agent, approved by Alice');

    // 4. Back in History, Undo; the step stops linking the segment.
    await userEvent.click(screen.getByRole('button', { name: 'Test back' }));
    await waitFor(() => expect(where()).toBe(`/work?queue=history&bundle=${ACT_SEGMENT_CREATE.bundle}`));
    const again = await screen.findByRole('dialog', { name: ACT_SEGMENT_CREATE.title });
    const undoStep = () => within(again.querySelector(`[data-step="${ACT_SEGMENT_CREATE.id}"]`) as HTMLElement);
    await userEvent.click(await undoStep().findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(undoStep().getByText('Undone')).toBeInTheDocument());
    expect(undoStep().queryByRole('link', { name: 'Open segment' })).toBeNull();
    expect(within(again).getByText(`Undone: ${ACT_SEGMENT_CREATE.title}.`)).toBeInTheDocument();
  });
});

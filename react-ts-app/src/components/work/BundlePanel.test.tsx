import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bundle } from '../../features/agents/bundleTypes';
import { BUNDLES, B_BLOCKED, B_LIVE, B_CAMPAIGN, B_DEPT, B_MAIL, B_OUTSIDE, B_PIZZA, B_SURVEY, B_TICKET, MESSAGE_BUNDLES, OUTSIDE_BUNDLES } from '../../features/agents/testBundleFixtures';
import { bundle, step } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { renderWork, where } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';

const sentRuns = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.filter(([url, init]) => String(url).includes('/run/') && (init as RequestInit | undefined)?.method === 'POST').map(([, init]) => JSON.parse(String((init as RequestInit).body)));
const sentSaves = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
    .map(([url, init]) => ({ step: Number(/steps\/(\d+)\//.exec(String(url))?.[1]), body: JSON.parse(String((init as RequestInit).body)) }));

const mineReads = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.filter(([url, init]) => new URL(String(url)).pathname === '/api/v1/work/feed/' && ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET').length;

describe('Bundle panel (spec §8.2; frontend Decisions 5 to 11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('opens from Review with its heading focused, every step in order, the one it may not run disabled with why', async () => {
    stubBundles();
    renderWork('/work?queue=mine');
    await userEvent.click(await screen.findByRole('link', { name: `Review & run ${B_PIZZA.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await waitFor(() => expect(within(panel).getByRole('heading', { name: B_PIZZA.title })).toHaveFocus());
    expect(where()).toBe('/work?queue=mine&bundle=12');
    expect(within(panel).queryByTestId('bundle-source')).not.toBeInTheDocument();
    expect(within(panel).getByText(B_PIZZA.reason)).toBeInTheDocument();
    const ticks = within(panel).getAllByRole('checkbox');
    expect(ticks.map((t) => (t as HTMLInputElement).checked)).toEqual([true, true, false]);
    expect(ticks[2]).toBeDisabled();
    expect(within(panel).getByText("You can't run this step.")).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Run 2 selected' })).toBeInTheDocument();
  });

  it('runs the ticked steps with only the changed fields, says what happened, links the result, and the row leaves', async () => {
    const { spy } = stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    const title = await within(panel).findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Call today');
    await userEvent.click(within(panel).getByRole('checkbox', { name: '2. File a note' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    const summary = await within(panel).findByText('Done: all 1 step ran.');
    expect(summary).toHaveFocus();
    expect(sentSaves(spy)).toEqual([
      { step: 41, body: { fields: { title: 'Call today' } } },
      { step: 42, body: { selected: false } },
    ]);
    expect(sentRuns(spy)).toEqual([{ steps: [{ id: 41, selected: true }, { id: 42, selected: false }, { id: 43, selected: false }] }]);
    expect(within(panel).getByRole('link', { name: 'Open task' })).toHaveAttribute('href', '/work/mine?task=990');
    expect(within(panel).getAllByText('Not run')).toHaveLength(2);
    expect(within(panel).queryByRole('button', { name: /^Run / })).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: `Review & run ${B_PIZZA.title}` })).not.toBeInTheDocument());
  });

  it("marks a send Can't be undone only once Save as draft only is turned off, and shows placeholders as chips, never braces", async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=13');
    const panel = await screen.findByRole('dialog', { name: B_CAMPAIGN.title });
    const send = await within(panel).findByTestId('step-51');
    expect(within(send).queryByText("Can't be undone")).not.toBeInTheDocument();
    expect(within(send).getByText('42 contacts across 3 organisations')).toBeInTheDocument();
    expect(send.querySelector('[data-part="preview"]')).toHaveTextContent('Send a campaign: Champion check-in (At-risk champions, Champion): Quick check-in');
    expect(send.querySelector('[data-part="excerpt"]')).toHaveTextContent('Hi {first_name}, how is it going?');
    await userEvent.click(within(send).getByRole('switch', { name: 'Save as draft only' }));
    expect(within(send).getByText("Can't be undone")).toBeInTheDocument();
    const follow = within(panel).getByTestId('step-52');
    // The server keeps the placeholder in the task's title (the preview), not the step's title.
    const preview = follow.querySelector('[data-part="preview"]') as HTMLElement;
    expect(preview.textContent).toContain('Create a task: Follow up on Campaign link from step 1');
    const chip = within(preview).getByText('Campaign link from step 1');
    expect(chip).toHaveAttribute('data-part', 'placeholder');
    expect(chip.className).toContain('font-semibold');
    expect(within(follow).getByText('Filled in from step 1 when it runs.')).toBeInTheDocument();
    expect(within(follow).queryByLabelText('Title')).not.toBeInTheDocument();
    expect(panel.textContent).not.toContain('{{');
  });

  it('names the lowest source step in the filled-in hint whatever order the server lists placeholders in', async () => {
    const later = { field: 'description', step: 2, key: 'ticket_key', label: 'Jira ticket from step 2' };
    const reordered = { ...B_CAMPAIGN, steps: B_CAMPAIGN.steps.map((s) => (s.id === 52 ? { ...s, placeholders: [later, ...s.placeholders] } : s)) };
    stubBundles({ bundles: [...BUNDLES.filter((b) => b.id !== B_CAMPAIGN.id), reordered] });
    renderWork('/work?queue=company&bundle=13');
    const panel = await screen.findByRole('dialog', { name: B_CAMPAIGN.title });
    const follow = await within(panel).findByTestId('step-52');
    expect(within(follow).getByText('Filled in from step 1 when it runs.')).toBeInTheDocument();
  });

  it('drops the audience sentence from a send step once it has run', async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=13');
    const panel = await screen.findByRole('dialog', { name: B_CAMPAIGN.title });
    const send = await within(panel).findByTestId('step-51');
    expect(within(send).getByText('42 contacts across 3 organisations')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /^Run/ }));
    await waitFor(() => expect(within(panel).getByTestId('step-51').textContent).toContain('Open campaign'));
    expect(within(panel).getByTestId('step-51').textContent).not.toContain('42 contacts');
  });

  it("shows a survey's question and audience, and is full screen on a phone", async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=14', { width: 390 });
    const panel = await screen.findByRole('dialog', { name: B_SURVEY.title });
    expect(panel.className).toContain('h-full');
    expect(within(panel).getByText('How likely are you to recommend Acme to a friend or colleague?')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Survey type')).toHaveValue('nps');
    expect(within(panel).getByTestId('step-61').querySelector('[data-part="preview"]')).toHaveTextContent('Send a survey: Q4 NPS (At-risk champions, Champion): Two minutes for Pizza Hut?');
    expect(within(panel).getByText('42 contacts across 3 organisations · at most 500')).toBeInTheDocument();
  });

  it('says a send saved only as a draft was saved as a draft', async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=14');
    const panel = await screen.findByRole('dialog', { name: B_SURVEY.title });
    await within(panel).findByTestId('step-61');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    await within(panel).findByText('Done: all 1 step ran.');
    expect(within(within(panel).getByTestId('step-61')).getByText('Saved as a draft.')).toBeInTheDocument();
    expect(within(within(panel).getByTestId('step-61')).queryByText('Applied')).not.toBeInTheDocument();
  });

  it("says a bundle it can't read is gone", async () => {
    stubBundles({ bundles: [] });
    renderWork('/work?queue=mine&bundle=99');
    expect(await screen.findByText("That bundle isn't there any more, or it's on a record you can't open.")).toBeInTheDocument();
  });

  it("names nothing once a run finds the bundle gone: no title, no record, no Run", async () => {
    stubBundles({ refuseNextRun: { status: 404, body: { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' } } });
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await within(panel).findByLabelText('Title');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 2 selected' }));
    const gone = await screen.findByRole('dialog', { name: "You can't open that any more." });
    expect(within(gone).getByText("That bundle isn't there any more, or it's on a record you can't open.")).toBeInTheDocument();
    expect(gone.textContent).not.toContain(B_PIZZA.title);
    expect(gone.textContent).not.toContain('Pizza Hut');
    expect(within(gone).queryByRole('button', { name: /^Run / })).not.toBeInTheDocument();
  });
});

describe('Bundle panel: retry, reject, discard and refusals (frontend Decisions 6, 12, 14, 15)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('shows a failed step with Retry, a dependent step waiting on it, and retries both', async () => {
    stubBundles({ failSteps: { 51: 'Nobody to send to.' } });
    renderWork('/work?queue=company&bundle=13');
    const panel = await screen.findByRole('dialog', { name: B_CAMPAIGN.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByText('0 of 2 steps ran. Retry the failed ones.')).toHaveFocus();
    const first = within(panel).getByTestId('step-51');
    expect(within(first).getByRole('alert')).toHaveTextContent('Nobody to send to.');
    expect(within(within(panel).getByTestId('step-52')).getByRole('alert')).toHaveTextContent("Needs step 1, which didn't run.");
    await userEvent.click(within(first).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(within(panel).getByTestId('step-51')).getByText('Saved as a draft.')).toBeInTheDocument());
    await userEvent.click(within(within(panel).getByTestId('step-52')).getByRole('button', { name: 'Retry' }));
    const done = await within(panel).findByText('Done: all 2 steps ran.');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(done).toHaveFocus();
    const filled = within(panel).getByTestId('step-52').querySelector('[data-part="preview"]') as HTMLElement;
    expect(filled.textContent).toContain('Follow up on /campaigns/990');
    expect(within(panel).getByTestId('step-52').querySelector('[data-part="placeholder"]')).toBeNull();
  });

  it('asks before throwing away edits to a failed step of a partly done bundle', async () => {
    stubBundles({ failSteps: { 51: 'Nobody to send to.' } });
    renderWork('/work?queue=company&bundle=13');
    const panel = await screen.findByRole('dialog', { name: B_CAMPAIGN.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Run 2 selected' }));
    await within(panel).findByText('0 of 2 steps ran. Retry the failed ones.');
    await userEvent.type(within(within(panel).getByTestId('step-51')).getByLabelText('Subject'), ' soon');
    await userEvent.keyboard('{Escape}');
    expect(within(panel).getByText('Discard your edits?')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('keeps the edits to another failed step when one step is retried', async () => {
    stubBundles({ failSteps: { 51: 'Nobody to send to.' } });
    renderWork('/work?queue=company&bundle=13');
    const panel = await screen.findByRole('dialog', { name: B_CAMPAIGN.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Run 2 selected' }));
    await within(panel).findByText('0 of 2 steps ran. Retry the failed ones.');
    const due = within(within(panel).getByTestId('step-52')).getByLabelText('Due date');
    await userEvent.clear(due);
    await userEvent.type(due, '2026-10-20');
    await userEvent.click(within(within(panel).getByTestId('step-51')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(within(panel).getByTestId('step-51')).getByText('Saved as a draft.')).toBeInTheDocument());
    expect(within(within(panel).getByTestId('step-52')).getByLabelText('Due date')).toHaveValue('2026-10-20');
  });

  it('saves unsaved edits when it closes, then closes back to the Review button (Decision 7)', async () => {
    const { spy } = stubBundles();
    renderWork('/work?queue=mine');
    await userEvent.click(await screen.findByRole('link', { name: `Review & run ${B_PIZZA.title}` }));
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.type(await within(panel).findByLabelText('Title'), ' now');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sentSaves(spy)).toEqual([{ step: 41, body: { fields: { title: 'Call Pizza Hut about the renewal now' } } }]);
    expect(screen.getByRole('link', { name: `Review & run ${B_PIZZA.title}` })).toHaveFocus();
  });

  it('asks before closing when the save on close fails, showing why', async () => {
    stubBundles({ refuseNextSave: { status: 400, body: { steps: { 41: { title: ['Give the task a title.'] } } } } });
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.clear(await within(panel).findByLabelText('Title'));
    await userEvent.keyboard('{Escape}');
    expect(await within(panel).findByText('Give the task a title.')).toBeInTheDocument();
    expect(within(panel).getByText('Discard your edits?')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('saves a field when focus leaves its step, says Saved, and marks the step edited', async () => {
    const { spy } = stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    const title = await within(panel).findByLabelText('Title');
    await userEvent.type(title, ' soon');
    await userEvent.click(within(panel).getByRole('heading', { name: B_PIZZA.title }));
    const step = within(panel).getByTestId('step-41');
    expect(await within(step).findByText('Saved.')).toBeInTheDocument();
    expect(within(step).getByText('Edited')).toBeInTheDocument();
    expect(sentSaves(spy)).toEqual([{ step: 41, body: { fields: { title: 'Call Pizza Hut about the renewal soon' } } }]);
  });

  it('waits for a save still on its way before it runs, and the save answer never overwrites the run (ruling X3)', async () => {
    const { spy } = stubBundles();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const answer = await spy(input, init);
        await gate;
        return answer;
      }
      return spy(input, init);
    });
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.click(await within(panel).findByRole('checkbox', { name: '2. File a note' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(sentRuns(spy)).toEqual([]);
    release();
    expect(await within(panel).findByText('Done: all 1 step ran.')).toHaveFocus();
    expect(sentSaves(spy)).toEqual([{ step: 42, body: { selected: false } }]);
    expect(sentRuns(spy)).toEqual([{ steps: [{ id: 41, selected: true }, { id: 42, selected: false }, { id: 43, selected: false }] }]);
    expect(within(panel).getAllByText('Not run')).toHaveLength(2);
    expect(within(panel).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('drops a save answer that arrives after the bundle was rejected (ruling X3)', async () => {
    const { spy } = stubBundles();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const answer = await spy(input, init);
        await gate;
        return answer;
      }
      return spy(input, init);
    });
    renderWork('/work?queue=company&bundle=14');
    const panel = await screen.findByRole('dialog', { name: B_SURVEY.title });
    await userEvent.type(await within(within(panel).getByTestId('step-61')).findByLabelText('Subject'), ' soon');
    await userEvent.click(within(panel).getByRole('button', { name: 'Reject bundle' }));
    expect(sentSaves(spy)).toHaveLength(1);
    await userEvent.selectOptions(within(panel).getByLabelText('Why'), 'not_relevant');
    await userEvent.click(within(panel).getByRole('button', { name: 'Reject it' }));
    expect(await within(panel).findByText('Rejected.')).toHaveFocus();
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(panel).getByText('Rejected.')).toBeInTheDocument();
    expect(within(panel).queryByText('Saved.')).not.toBeInTheDocument();
    expect(within(within(panel).getByTestId('step-61')).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Reject bundle' })).not.toBeInTheDocument();
  });

  it('keeps one Saved. per step, each clearing on its own after 4 s (ruling M1)', async () => {
    stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.click(await within(panel).findByRole('checkbox', { name: '2. File a note' }));
    expect(await within(within(panel).getByTestId('step-42')).findByText('Saved.')).toBeInTheDocument();
    await userEvent.type(within(panel).getByLabelText('Title'), ' soon');
    await userEvent.click(within(panel).getByRole('heading', { name: B_PIZZA.title }));
    expect(await within(within(panel).getByTestId('step-41')).findByText('Saved.')).toBeInTheDocument();
    expect(within(within(panel).getByTestId('step-42')).getByText('Saved.')).toBeInTheDocument();
    await waitFor(() => expect(within(panel).queryByText('Saved.')).not.toBeInTheDocument(), { timeout: 6000 });
  }, 10000);

  it('rejects with a reason, refusing none first, and the row leaves', async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=14');
    const panel = await screen.findByRole('dialog', { name: B_SURVEY.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Reject bundle' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Reject it' }));
    expect(within(panel).getByText('Choose a reason.')).toBeInTheDocument();
    await userEvent.selectOptions(within(panel).getByLabelText('Why'), 'not_relevant');
    await userEvent.type(within(panel).getByLabelText('Note (optional)'), 'Surveyed last month.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Reject it' }));
    expect(await within(panel).findByText('Rejected.')).toHaveFocus();
  });

  it('takes the rejected row out of its queue without a reload', async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=14');
    const panel = await screen.findByRole('dialog', { name: B_SURVEY.title });
    expect(await screen.findByRole('link', { name: `Review ${B_SURVEY.title}` })).toBeInTheDocument();
    await userEvent.click(await within(panel).findByRole('button', { name: 'Reject bundle' }));
    await userEvent.selectOptions(within(panel).getByLabelText('Why'), 'not_relevant');
    await userEvent.click(within(panel).getByRole('button', { name: 'Reject it' }));
    await within(panel).findByText('Rejected.');
    await waitFor(() => expect(screen.queryByRole('link', { name: `Review ${B_SURVEY.title}` })).not.toBeInTheDocument());
  });

  it('focuses Why when the reject form opens, and asks before Escape throws its contents away', async () => {
    stubBundles();
    renderWork('/work?queue=company&bundle=14');
    const panel = await screen.findByRole('dialog', { name: B_SURVEY.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Reject bundle' }));
    expect(within(panel).getByLabelText('Why')).toHaveFocus();
    await userEvent.selectOptions(within(panel).getByLabelText('Why'), 'wrong_person');
    await userEvent.type(within(panel).getByLabelText('Note (optional)'), 'Dana owns this.');
    await userEvent.keyboard('{Escape}');
    expect(within(panel).getByText('Discard your edits?')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Keep editing' }));
    expect(within(panel).getByLabelText('Why')).toHaveValue('wrong_person');
    expect(within(panel).getByLabelText('Note (optional)')).toHaveValue('Dana owns this.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(within(panel).getByRole('button', { name: 'Reject bundle' })).toHaveFocus();
    await userEvent.click(within(panel).getByRole('button', { name: 'Reject bundle' }));
    expect(within(panel).getByLabelText('Why')).toHaveValue('');
    expect(within(panel).getByLabelText('Note (optional)')).toHaveValue('');
  });

  it('names a record bundle once, with who it is for, and says the whole company when it is for nobody', async () => {
    stubBundles({ bundles: [{ ...B_PIZZA, for: null }] });
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await within(panel).findByLabelText('Title');
    expect(within(panel).getAllByText('Pizza Hut')).toHaveLength(1);
    expect(within(panel).getByText('For the whole company')).toBeInTheDocument();
  });

  it('shows a 409 in the server words and the bundle as it is now; a field refusal under its field', async () => {
    stubBundles({ refuseNextRun: { status: 409, body: { code: 'BUNDLE_RAN', detail: 'Carl CSM ran this at 10:42.', bundle: { ...B_PIZZA, status: 'done', can_run: false, steps: B_PIZZA.steps.map((s) => ({ ...s, status: 'applied', can_run: false })) } } } });
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Carl CSM ran this at 10:42.');
    expect(within(panel).queryByRole('button', { name: /^Run / })).not.toBeInTheDocument();
  });

  it('puts a 400 field error under the field', async () => {
    stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.clear(await within(panel).findByLabelText('Title'));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 2 selected' }));
    expect(await within(panel).findByText('Give the task a title.')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  });

  it('says where a message bundle came from and links the ticket in a new tab (Decision 3)', async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_TICKET.id}`);
    const panel = await screen.findByRole('dialog', { name: B_TICKET.title });
    const line = await within(panel).findByTestId('bundle-source');
    expect(line.textContent).toContain('Zendesk ZD-1042 from ann@pizzahut.com');
    // One " · " between parts, each separator ending its part, so a wrapped line never starts with one.
    expect(line.textContent).toMatch(/from ann@pizzahut\.com · \S/);
    expect([...line.querySelectorAll('span')].some((part) => part.textContent?.trim().startsWith('·'))).toBe(false);
    const open = within(line).getByRole('link', { name: 'Open in Zendesk (opens in a new tab)' });
    expect(open).toHaveAttribute('href', 'https://acme.zendesk.com/agent/tickets/1042');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    // The source label is said once: the meta line does not repeat it.
    expect(within(panel).getAllByText(/Zendesk/)).toHaveLength(2);
  });

  it('says a department bundle is for its department, and a nightly one has no source line', async () => {
    stubBundles({ bundles: [...BUNDLES, ...MESSAGE_BUNDLES], departments: [{ key: 'cs', label: 'Customer Success' }] });
    renderWork(`/work?queue=department:cs&bundle=${B_DEPT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_DEPT.title });
    expect(await within(panel).findByText('For Customer Success')).toBeInTheDocument();
    expect(within(panel).queryByText('For the whole company')).not.toBeInTheDocument();
  });
  it('shows the newer-message banner and refreshes, keeping the edited step (Decision 9)', async () => {
    const { spy } = stubBundles({ bundles: [...MESSAGE_BUNDLES] });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    const banner = await within(panel).findByTestId('newer-message');
    expect(banner).toHaveTextContent('New message since this was edited');
    // Phones put the button under the sentence; from sm they sit side by side.
    expect(banner.className).toContain('flex-col');
    expect(banner.className).toContain('sm:flex-row');
    expect(within(banner).getByRole('status')).toHaveTextContent('New message since this was edited');
    expect(within(within(banner).getByRole('status')).queryByRole('button')).not.toBeInTheDocument();
    const refresh = within(banner).getByRole('button', { name: 'Refresh suggestions' });
    expect(refresh.className).not.toContain('bg-accent');
    const before = mineReads(spy);
    await userEvent.click(refresh);
    expect(await within(panel).findByText('Suggestions refreshed.')).toHaveFocus();
    // The list behind the panel reads again, so its row shows the new steps.
    await waitFor(() => expect(mineReads(spy)).toBeGreaterThan(before));
    expect(within(panel).queryByTestId('newer-message')).not.toBeInTheDocument();
    expect(within(panel).getByTestId('step-211')).toBeInTheDocument();
    expect(within(panel).queryByTestId('step-212')).not.toBeInTheDocument();
    expect(within(panel).getByTestId('step-290')).toBeInTheDocument();
    expect(spy.mock.calls.filter(([url]) => String(url).endsWith('/agents/bundles/21/refresh/'))).toHaveLength(1);
  });

  it('says the agent no longer suggests a bundle the refresh left empty, and never claims it refreshed (contract §4.2)', async () => {
    const quiet = { ...B_TICKET, has_newer_message: true };
    stubBundles({ bundles: [quiet], refreshAnswer: [] });
    renderWork(`/work?queue=mine&bundle=${quiet.id}`);
    const panel = await screen.findByRole('dialog', { name: quiet.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByText('The agent no longer suggests this.')).toHaveFocus();
    expect(within(panel).queryByText('Suggestions refreshed.')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('newer-message')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /^Run/ })).not.toBeInTheDocument();
  });

  it('holds Run and Reject while suggestions refresh', async () => {
    const { spy } = stubBundles({ bundles: [...MESSAGE_BUNDLES] });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/refresh/')) await gate;
      return spy(input, init);
    });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Refresh suggestions' }));
    expect(within(panel).getByRole('button', { name: /^Run \d selected$/ })).toHaveAttribute('aria-disabled', 'true');
    const reject = within(panel).getByRole('button', { name: 'Reject bundle' });
    expect(reject).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(reject);
    expect(within(panel).queryByLabelText('Why')).not.toBeInTheDocument();
    release();
    expect(await within(panel).findByText('Suggestions refreshed.')).toHaveFocus();
    expect(within(panel).getByRole('button', { name: 'Reject bundle' })).not.toHaveAttribute('aria-disabled');
  });

  it('closes a bundle lost while its edits were saving, on Close and on Escape', async () => {
    const { bundles } = stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.type(await within(panel).findByLabelText('Title'), ' soon');
    bundles.delete(B_PIZZA.id);
    await userEvent.click(within(panel).getByRole('heading', { name: B_PIZZA.title }));
    const gone = await screen.findByRole('dialog', { name: "You can't open that any more." });
    await userEvent.click(within(gone).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes a lost bundle on Escape without saving again', async () => {
    const { spy, bundles } = stubBundles();
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.type(await within(panel).findByLabelText('Title'), ' soon');
    bundles.delete(B_PIZZA.id);
    await userEvent.click(within(panel).getByRole('heading', { name: B_PIZZA.title }));
    await screen.findByRole('dialog', { name: "You can't open that any more." });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sentSaves(spy)).toHaveLength(1);
  });

  it('clears a save refusal once a later save of that step goes through', async () => {
    const detail = 'Only a waiting step can be changed.';
    stubBundles({ refuseNextSave: { status: 409, body: { code: 'STEP_NOT_WAITING', detail } } });
    renderWork('/work?queue=mine&bundle=12');
    const panel = await screen.findByRole('dialog', { name: B_PIZZA.title });
    await userEvent.type(await within(panel).findByLabelText('Title'), ' soon');
    await userEvent.click(within(panel).getByRole('heading', { name: B_PIZZA.title }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(detail);
    await userEvent.type(within(panel).getByLabelText('Title'), ' now');
    await userEvent.click(within(panel).getByRole('heading', { name: B_PIZZA.title }));
    expect(await within(within(panel).getByTestId('step-41')).findByText('Saved.')).toBeInTheDocument();
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a refresh refusal verbatim and keeps the banner', async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextRefresh: { status: 409, body: { code: 'BUDGET_USED', detail: "This agent's budget is used up: it resumes on 1 Nov.", resets_on: '2026-11-01' } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent("This agent's budget is used up: it resumes on 1 Nov.");
    expect(within(panel).getByTestId('newer-message')).toBeInTheDocument();
  });

  it('shows NO_READER verbatim (contract §4.2)', async () => {
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextRefresh: { status: 409, body: { code: 'NO_READER', detail: 'Nobody this bundle is for may read its message any more.' } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Nobody this bundle is for may read its message any more.');
  });

  it('takes the fresh bundle when it changed while refreshing', async () => {
    const changed = { ...B_MAIL, has_newer_message: false, steps: [B_MAIL.steps[0]] };
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextRefresh: { status: 409, body: { code: 'BUNDLE_CHANGED', detail: 'This bundle changed while it refreshed. Review it again.', bundle: changed } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: 'Refresh suggestions' }));
    expect(await within(panel).findByText('This bundle changed while it refreshed. Review it again.')).toBeInTheDocument();
    expect(within(panel).queryByTestId('step-212')).not.toBeInTheDocument();
  });

  it('takes the returned bundle when a save finds its step removed by a refresh (contract STEP_NOT_WAITING)', async () => {
    const fresh = { ...B_MAIL, has_newer_message: false, steps: [B_MAIL.steps[0]] };
    const detail = 'Only a waiting step can be changed.';
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextSave: { status: 409, body: { code: 'STEP_NOT_WAITING', detail, bundle: fresh } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    const step = await within(panel).findByTestId('step-212');
    await userEvent.type(within(step).getByRole('textbox', { name: 'Note' }), ' now');
    await userEvent.click(within(panel).getByRole('heading', { name: B_MAIL.title }));
    await waitFor(() => expect(within(panel).queryByTestId('step-212')).not.toBeInTheDocument());
    expect(within(panel).getByTestId('step-211')).toBeInTheDocument();
    expect(within(panel).queryByTestId('newer-message')).not.toBeInTheDocument();
    expect(within(panel).getByRole('alert')).toHaveTextContent(detail);
  });

  it('shows a run against replaced steps as the server says, with the fresh bundle (Decision 10)', async () => {
    const fresh = { ...B_MAIL, has_newer_message: false, refreshed_at: '2026-10-07T10:00:00Z' };
    stubBundles({ bundles: [...MESSAGE_BUNDLES], refuseNextRun: { status: 409, body: { code: 'BUNDLE_REFRESHED', detail: 'This bundle was updated with a newer message. Review it again.', bundle: fresh } } });
    renderWork(`/work?queue=mine&bundle=${B_MAIL.id}`);
    const panel = await screen.findByRole('dialog', { name: B_MAIL.title });
    await userEvent.click(await within(panel).findByRole('button', { name: /^Run \d selected$/ }));
    expect(await within(panel).findByText('This bundle was updated with a newer message. Review it again.')).toBeInTheDocument();
    expect(within(panel).queryByTestId('newer-message')).not.toBeInTheDocument();
  });
});

async function openPanel(b: Bundle) {
  renderWork(`/work?queue=mine&bundle=${b.id}`);
  return screen.findByRole('dialog', { name: b.title });
}

describe('outside steps (agent bundles D3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('a blocked step says why and links to Connections, and Reject stays', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const panel = await openPanel(B_BLOCKED);
    const step = within(panel).getByTestId('step-421');
    expect(within(step).getByRole('checkbox')).toBeDisabled();
    expect(within(step).getByText('Ask an admin to allow Revenact to post in Slack.')).toBeInTheDocument();
    expect(within(step).getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
    expect(within(panel).getByRole('button', { name: 'Reject bundle' })).toBeEnabled();
  });

  it("every outside step says it can't be undone before Run", async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const panel = await openPanel(B_OUTSIDE);
    for (const id of [411, 412, 413, 414]) expect(within(within(panel).getByTestId(`step-${id}`)).getByText("Can't be undone")).toBeInTheDocument();
  });

  it('a run shows the result links, opening outside tools in a new tab', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const panel = await openPanel(B_OUTSIDE);
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const jira = await within(within(panel).getByTestId('step-413')).findByRole('link', { name: 'Open SUP-501 in Jira (opens in a new tab)' });
    expect(jira).toHaveAttribute('href', 'https://acme.atlassian.net/browse/SUP-501');
    expect(jira).toHaveAttribute('target', '_blank');
    expect(jira).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(within(panel).getByTestId('step-412')).getByRole('link', { name: 'Open the Slack message (opens in a new tab)' })).toBeInTheDocument();
  });

  it("a failed outside step shows Slack's sentence and Retry", async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOutside: { 412: "Slack refused the post: the app isn't in #support." } });
    const panel = await openPanel(B_OUTSIDE);
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const step = within(panel).getByTestId('step-412');
    expect(await within(step).findByRole('alert')).toHaveTextContent("Slack refused the post: the app isn't in #support.");
    await userEvent.click(within(step).getByRole('button', { name: 'Retry' }));
    expect(await within(step).findByRole('link', { name: 'Open the Slack message (opens in a new tab)' })).toBeInTheDocument();
  });

  it('saves a channel pick as channel_choice alone, never with connector_id', async () => {
    const moved = [{ id: '5', name: '#support', detail: 'This thread' }, { id: '6:C0OTHER', name: '#other', detail: 'Not synced' }];
    const { spy } = stubBundles({ bundles: [B_LIVE], liveChannels: moved });
    const panel = await openPanel(B_LIVE);
    const row = within(panel).getByTestId('step-471');
    expect(B_LIVE.steps[0].fields.connector_id).toBe(5);
    await userEvent.type(within(row).getByRole('searchbox', { name: 'Search channels' }), 'oth');
    const channel = await within(row).findByRole('combobox', { name: 'Channel' });
    await waitFor(() => expect(within(channel).getByRole('option', { name: '#other (Not synced)' })).toBeInTheDocument());
    await userEvent.selectOptions(channel, '6:C0OTHER');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    await waitFor(() => expect(sentSaves(spy)).toHaveLength(1));
    expect(sentSaves(spy)[0].body).toEqual({ fields: { channel_choice: '6:C0OTHER' } });
    expect(JSON.stringify(sentSaves(spy))).not.toContain('connector_id');
  });

  it('after a pick moved the step, a later edit does not re-send the stale connector_id', { timeout: 30000 }, async () => {
    const moved = [{ id: '5', name: '#support', detail: 'This thread' }, { id: '6:C0OTHER', name: '#other', detail: 'Not synced' }];
    const { spy } = stubBundles({ bundles: [B_LIVE], liveChannels: moved });
    const panel = await openPanel(B_LIVE);
    const row = within(panel).getByTestId('step-471');
    await userEvent.type(within(row).getByRole('searchbox', { name: 'Search channels' }), 'oth');
    const channel = await within(row).findByRole('combobox', { name: 'Channel' });
    await waitFor(() => expect(within(channel).getByRole('option', { name: '#other (Not synced)' })).toBeInTheDocument());
    await userEvent.selectOptions(channel, '6:C0OTHER');
    await userEvent.click(within(row).getByRole('textbox', { name: 'Message' }));
    await userEvent.click(within(row).getByText("Tell Ann we're on it"));
    await waitFor(() => expect(sentSaves(spy)).toHaveLength(1));
    await userEvent.type(within(row).getByRole('textbox', { name: 'Message' }), ' Soon.');
    await userEvent.click(within(row).getByText("Tell Ann we're on it"));
    await waitFor(() => expect(sentSaves(spy)).toHaveLength(2));
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    for (const save of sentSaves(spy)) expect(save.body.fields).not.toHaveProperty('connector_id');
    expect(sentSaves(spy)[1].body).toEqual({ fields: { text: 'We are on it. Soon.' } });
  });

  it('a private unsynced channel for a reader without manage_integrations: the sentence and the excerpt, no read-only text, Reject stays', async () => {
    const sentence = "Only an admin can post in #leads-private, a private channel Revenact doesn't read.";
    const base = B_LIVE.steps[0];
    const locked = bundle({
      ...B_LIVE,
      id: 408,
      can_run: false,
      steps: [
        step({
          ...base,
          id: 481,
          can_run: false,
          selected: false,
          disabled_reason: sentence,
          disabled_link: null,
          fields: { connector_id: 5, channel_choice: '5:C0PRIVATE', text: 'We are on it.' },
          preview: { slack: { channel: '#leads-private', in_thread: false, as: 'Revenact', excerpt: 'We are on it.', synced: false } },
        }),
      ],
    });
    stubBundles({ bundles: [locked] });
    const panel = await openPanel(locked);
    const row = within(panel).getByTestId('step-481');
    expect(within(row).getByText(sentence)).toBeInTheDocument();
    expect(within(row).getByText('We are on it.')).toBeInTheDocument();
    expect(within(row).queryByText('Message')).toBeNull();
    expect(within(row).queryByRole('link', { name: 'Open Connections' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Reject bundle' })).toBeEnabled();
  });
});

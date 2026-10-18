import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GUIDED, changedEmail, emailDraftOf, prioritySort, readsText, threadOf } from '../../features/agents/guidedText';
import { previewText, KIND_LABEL } from '../../features/agents/agentsText';
import { stepAsAction } from '../../features/agents/bundleText';
import type { Bundle } from '../../features/agents/bundleTypes';
import { bundleItem } from '../../features/agents/testBundleFixtures';
import { B_GUIDED, B_GUIDED_OTHERS, B_GUIDED_SEND, stepRuns, stubGuided } from '../../features/agents/testGuided';
import { renderWork } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';
import { BundleRow } from './BundleRow';
import { PriorityBanner } from './PriorityBanner';

const open = async (id = 800) => {
  renderWork(`/work?queue=mine&bundle=${id}`);
  return screen.findByRole('dialog', { name: B_GUIDED.title });
};
const thread = (panel: HTMLElement) => within(panel).getByRole('list', { name: GUIDED.THREAD });
const bar = (panel: HTMLElement) => within(panel).getByRole('group', { name: GUIDED.ANSWER });
const stops = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.filter(([url, init]) => String(url).endsWith('/stop/') && (init as RequestInit | undefined)?.method === 'POST').length;

/** A matchMedia that answers prefers-reduced-motion as `reduced`, every width query as a phone. */
function motion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduced-motion') ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('guided text (guided agent, 2026-10-18)', () => {
  it('names the three kinds and words their previews', () => {
    expect([KIND_LABEL['record.diagnose'], KIND_LABEL['mail.compose'], KIND_LABEL['mail.send_draft']]).toEqual(['Diagnose', 'Write an email', 'Send it']);
    const [diagnose, compose, send] = B_GUIDED.steps;
    expect(previewText(stepAsAction(B_GUIDED, diagnose))).toBe('Diagnose what is going on with Nimbus');
    expect(previewText(stepAsAction(B_GUIDED, compose))).toBe('Write an email to Dana Smith about Nimbus');
    expect(previewText(stepAsAction(B_GUIDED, send))).toBe('Send the email once it is written');
    expect(previewText(stepAsAction(B_GUIDED_SEND, B_GUIDED_SEND.steps[2]))).toBe('Send the email to Dana Smith: Our plan for your latency issues');
  });

  it('reads the reads in words', () => {
    expect(readsText(['tickets', 'calls', 'emails', 'slack'])).toBe('Reading tickets, calls, emails, Slack…');
  });

  it('threads each step up to the one asked now, and ends at a stop', () => {
    expect(threadOf(B_GUIDED).map((e) => e.kind)).toEqual(['ask']);
    expect(threadOf(B_GUIDED_SEND).map((e) => e.kind)).toEqual(['ask', 'yes', 'result', 'ask', 'yes', 'result', 'ask']);
    const stopped: Bundle = { ...B_GUIDED, status: 'done', next_step: null, steps: B_GUIDED.steps.map((s) => ({ ...s, status: 'skipped' })) };
    expect(threadOf(stopped).map((e) => e.kind)).toEqual(['ask', 'not-now', 'stopped']);
  });

  it('sends only the email fields that changed', () => {
    const send = B_GUIDED_SEND.steps[2];
    expect(changedEmail(send, { ...emailDraftOf(send), subject: 'New' })).toEqual({ subject: 'New' });
  });

  it('puts priority bundles first and keeps the rest in order', () => {
    const items = [bundleItem({ ...B_GUIDED, id: 1, priority: 'normal' }), bundleItem({ ...B_GUIDED, id: 2 }), bundleItem({ ...B_GUIDED, id: 3, priority: 'normal' })];
    expect(prioritySort(items).map((i) => i.id)).toEqual([2, 1, 3]);
  });
});

describe('Guided conversation (guided agent, 2026-10-18)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('asks the first question with the source on top, and offers Yes and Not now for it only', async () => {
    stubGuided();
    const panel = await open();
    expect(within(panel).getByTestId('bundle-source')).toHaveTextContent('Slack message from Faiz Jamal');
    expect(within(panel).getByText('Priority')).toBeInTheDocument();
    const lines = within(thread(panel)).getAllByRole('listitem');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent("Nimbus's health dropped from 7.8 to 6.1. Should I diagnose?");
    expect(within(panel).queryByText('Should I write an email to save Nimbus?')).toBeNull();
    expect(within(bar(panel)).getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(within(bar(panel)).getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    expect(within(panel).queryByRole('checkbox')).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Run \d selected/ })).toBeNull();
  });

  it('Yes runs the step and answers with the summary and the findings, linked safely', async () => {
    const { spy } = stubGuided();
    const panel = await open();
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Yes' }));
    const diagnosis = await within(panel).findByText(/EU latency has been open/);
    expect(stepRuns(spy)).toEqual([{ step: 801, body: {} }]);
    const t = thread(panel);
    expect(within(t).getByText('Yes')).toBeInTheDocument();
    const external = within(t).getByRole('link', { name: /NB-4088: API latency regression/ });
    expect(external).toHaveAttribute('href', 'https://nimbus-help.example.com/tickets/4088');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(t).getByRole('link', { name: 'Nimbus health' })).toHaveAttribute('href', '/organizations/81');
    // A source that is neither https nor an app path is a label, never a link.
    expect(within(t).getByText('Call on 12 Oct').closest('a')).toBeNull();
    expect(within(t).getByText('Dana Smith').closest('a')).toBeNull();
    // The next question is asked, and focus lands on the newest agent bubble.
    expect(within(t).getByText('Should I write an email to save Nimbus?')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Should I write an email to save Nimbus?'));
    expect(diagnosis.closest('[data-bubble="agent"]')).not.toBeNull();
  });

  it('says it is working, with what it reads, while the step runs', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubGuided({ gate });
    const panel = await open();
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Yes' }));
    const working = await within(panel).findByText(GUIDED.WORKING);
    expect(working.closest('[role="status"]')).toHaveTextContent('Reading health, tickets, calls, emails, Slack, contacts…');
    expect(within(bar(panel)).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-disabled', 'true');
    await act(async () => release());
    await waitFor(() => expect(within(panel).queryByText(GUIDED.WORKING)).toBeNull());
  });

  it('keeps the working dots still under reduced motion', async () => {
    let release = () => {};
    stubGuided({ gate: new Promise<void>((resolve) => (release = resolve)) });
    const panel = await open();
    motion(true);
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Yes' }));
    await within(panel).findByText(GUIDED.WORKING);
    const dots = panel.querySelector('[data-part="typing"]') as HTMLElement;
    expect(dots).toHaveAttribute('data-motion', 'static');
    expect(dots.querySelector('.rv-typing-dot')).toBeNull();
    expect(panel.querySelector('.animate-fade-up')).toBeNull();
    await act(async () => release());
  });

  it('animates new lines and the dots when motion is allowed', async () => {
    let release = () => {};
    stubGuided({ gate: new Promise<void>((resolve) => (release = resolve)) });
    const panel = await open();
    motion(false);
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Yes' }));
    await within(panel).findByText(GUIDED.WORKING);
    expect(panel.querySelector('[data-part="typing"]')).toHaveAttribute('data-motion', 'animated');
    expect(panel.querySelectorAll('.rv-typing-dot')).toHaveLength(3);
    await act(async () => release());
  });

  it("shows the draft to its owner as an email, Edit turns it into fields, and Yes sends only what changed", async () => {
    const { spy } = stubGuided({ bundles: [B_GUIDED_SEND] });
    const panel = await open();
    const card = within(panel).getByRole('article', { name: 'Our plan for your latency issues' });
    expect(card).toHaveTextContent('Dana Smith <dana@nimbus.example>');
    expect(card).toHaveTextContent('alice@acme.example');
    expect(card.querySelector('[data-part="email-body"]')).toHaveClass('whitespace-pre-line');
    expect(within(bar(panel)).getByText("Can't be undone")).toBeInTheDocument();
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Edit' }));
    const subject = within(panel).getByLabelText('Subject');
    await userEvent.clear(subject);
    await userEvent.type(subject, 'A plan for EU latency');
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Yes' }));
    expect(await within(panel).findByText('Sent to Dana Smith from alice@acme.example.')).toBeInTheDocument();
    expect(stepRuns(spy)).toEqual([{ step: 803, body: { fields: { subject: 'A plan for EU latency' } } }]);
    expect(within(panel).getByText("Added to Nimbus's timeline.")).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Open the sent email' })).toHaveAttribute('href', '/communications?source=mailbox:google&message=9');
    expect(within(panel).getByText("Done. Everything is in History and on Nimbus's timeline.")).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: GUIDED.OPEN_HISTORY })).toHaveAttribute('href', '/work?queue=history&bundle=800');
    expect(within(panel).queryByRole('group', { name: GUIDED.ANSWER })).toBeNull();
  });

  it('hides the draft and the summary from anyone else, and says why they cannot send', async () => {
    stubGuided({ bundles: [B_GUIDED_OTHERS] });
    const panel = await open();
    expect(within(panel).getByText('Only Alice can see the draft')).toBeInTheDocument();
    expect(within(panel).queryByRole('article')).toBeNull();
    expect(within(panel).getByText("Summary hidden: it used Alice's private mail.")).toBeInTheDocument();
    expect(within(panel).getByText('Three latency tickets are open, the oldest 9 days.')).toBeInTheDocument();
    expect(within(bar(panel)).getByText('Only Alice can send this email: it is in their mailbox.')).toBeInTheDocument();
    expect(within(bar(panel)).queryByRole('button')).toBeNull();
  });

  it('Not now stops the bundle and says nothing else was done', async () => {
    const { spy } = stubGuided();
    const panel = await open();
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Not now' }));
    expect(await within(panel).findByText(GUIDED.STOPPED)).toBeInTheDocument();
    expect(stops(spy)).toBe(1);
    expect(within(thread(panel)).getByText('Not now')).toBeInTheDocument();
    expect(within(panel).queryByRole('group', { name: GUIDED.ANSWER })).toBeNull();
  });

  it('shows a failed step with its error, and Retry runs it again', async () => {
    const { spy } = stubGuided({ failRun: { 801: "Couldn't diagnose this just now. Retry it." } });
    const panel = await open();
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Yes' }));
    const error = await within(panel).findByText("Couldn't diagnose this just now. Retry it.");
    expect(error).toHaveClass('text-danger-ink');
    await userEvent.click(within(panel).getByRole('button', { name: 'Retry' }));
    expect(await within(panel).findByText(/EU latency has been open/)).toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => String(url).endsWith('/steps/801/retry/'))).toBe(true);
  });

  it('takes the bundle a NOT_NEXT refusal carries and says why', async () => {
    stubGuided({ refuseNextStep: { status: 409, body: { code: 'NOT_NEXT', detail: 'Answer step 1 first.', step: 801, bundle: B_GUIDED_SEND } } });
    const panel = await open();
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Yes' }));
    expect(await within(panel).findByText('Answer step 1 first.')).toHaveAttribute('role', 'status');
    expect(within(panel).getByText('Should I send it to Dana Smith?')).toBeInTheDocument();
  });

  it('shows any other refusal inline', async () => {
    stubGuided({ refuseNextStep: { status: 403, body: { code: 'CANT_RUN_STEP', detail: "You can't run step 1." } } });
    const panel = await open();
    await userEvent.click(within(bar(panel)).getByRole('button', { name: 'Yes' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent("You can't run step 1.");
  });

  it('pins the answer bar under a full-height sheet on a phone, with 44px answers', async () => {
    stubGuided();
    renderWork('/work?queue=mine&bundle=800', { width: 375 });
    const panel = await screen.findByRole('dialog', { name: B_GUIDED.title });
    expect(panel.className).toContain('h-full');
    const footer = panel.querySelector('footer') as HTMLElement;
    expect(within(footer).getByRole('button', { name: 'Yes' }).className).toContain('min-h-11');
    expect(within(footer).getByRole('button', { name: 'Not now' }).className).toContain('min-h-11');
  });
});

describe('Priority (guided agent, 2026-10-18)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('leads Ready to run with the priority bundle and its badge, and shows the banner', async () => {
    stubGuided();
    renderWork('/work?queue=mine');
    const banner = await screen.findByText(`Priority: ${B_GUIDED.title}`);
    expect(banner.closest('[data-part="priority-banner"]')).not.toHaveAttribute('data-fresh');
    const rows = document.querySelectorAll('[data-part="ready-bundle"]');
    expect(rows[0]).toHaveTextContent(B_GUIDED.title);
    expect(within(rows[0] as HTMLElement).getByText('Priority')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Open ${B_GUIDED.title}` })).toHaveAttribute('href', '/work?queue=mine&bundle=800');
  });

  it('badges a priority bundle row in a queue, and no other', () => {
    render(
      <MemoryRouter>
        <ul>
          <BundleRow item={bundleItem(B_GUIDED)} group="decide" />
          <BundleRow item={bundleItem({ ...B_GUIDED, id: 9, title: 'Calm', priority: 'normal' })} group="decide" />
        </ul>
      </MemoryRouter>,
    );
    const [hot, calm] = screen.getAllByRole('listitem');
    expect(within(hot).getByText('Priority')).toHaveClass('text-warning-ink');
    expect(within(calm).queryByText('Priority')).toBeNull();
  });

  it('shows a priority bundle that arrives later, fading up once', () => {
    const calm = bundleItem({ ...B_GUIDED, id: 5, title: 'Calm', priority: 'normal' });
    const hot = bundleItem({ ...B_GUIDED, id: 6, title: 'Urgent one' });
    motion(false);
    const { rerender, container } = render(
      <MemoryRouter>
        <PriorityBanner items={[calm]} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-part="priority-banner"]')).toBeNull();
    rerender(
      <MemoryRouter>
        <PriorityBanner items={[calm, hot]} />
      </MemoryRouter>,
    );
    const banner = container.querySelector('[data-part="priority-banner"]') as HTMLElement;
    expect(banner).toHaveTextContent('Priority: Urgent one');
    expect(banner).toHaveAttribute('data-fresh', 'true');
    expect(banner).toHaveClass('animate-fade-up');
  });

  it('does not animate the arrival under reduced motion', () => {
    motion(true);
    const hot = bundleItem({ ...B_GUIDED, id: 6, title: 'Urgent one' });
    const { rerender, container } = render(
      <MemoryRouter>
        <PriorityBanner items={[]} />
      </MemoryRouter>,
    );
    rerender(
      <MemoryRouter>
        <PriorityBanner items={[hot]} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-part="priority-banner"]')).not.toHaveClass('animate-fade-up');
  });
});

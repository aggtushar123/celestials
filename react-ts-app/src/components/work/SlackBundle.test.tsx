import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { bundleForText, routedText, sourceParts } from '../../features/agents/bundleText';
import type { Bundle, BundleStep as Step } from '../../features/agents/bundleTypes';
import { B_SLACK, B_SLACK_DONE, SLACK_MESSAGE_SOURCE, SLACK_PURGED, bundleItem } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { renderWork } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';
import { BundleRow } from './BundleRow';
import { BundleSource } from './BundleSource';
import { BundleStep } from './BundleStep';

const sentSaves = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
    .map(([url, init]) => ({ step: Number(/steps\/(\d+)\//.exec(String(url))?.[1]), body: JSON.parse(String((init as RequestInit).body)) }));

function renderStep(bundle: Bundle, step: Step) {
  return render(
    <MemoryRouter>
      <ul>
        <BundleStep bundle={bundle} step={step} entry={{ selected: step.selected, fields: step.fields }} errors={{}} ticking={bundle.status === 'waiting'} editing={bundle.status === 'waiting'} onToggle={vi.fn()} onField={vi.fn()} onUndone={vi.fn()} />
      </ul>
    </MemoryRouter>,
  );
}

describe('Slack bundles (2026-10-17)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('says a person bundle is for you, and names the sender', () => {
    expect(bundleForText(B_SLACK)).toBe('For you');
    expect(routedText(bundleItem(B_SLACK).detail)).toBe('For you');
    expect(sourceParts(SLACK_MESSAGE_SOURCE)).toEqual(['Slack message from Faiz Jamal']);
    expect(sourceParts(SLACK_PURGED)).toEqual(['Slack message']);
  });

  it('shows the Slack message: sender, excerpt, Open in Slack and Only you', () => {
    render(<BundleSource source={SLACK_MESSAGE_SOURCE} />);
    const block = screen.getByTestId('bundle-source');
    expect(block).toHaveTextContent('Slack message from Faiz Jamal');
    expect(within(block).getByText(SLACK_MESSAGE_SOURCE.excerpt).tagName).toBe('BLOCKQUOTE');
    const open = within(block).getByRole('link', { name: 'Open in Slack (opens in a new tab)' });
    expect(open).toHaveAttribute('href', SLACK_MESSAGE_SOURCE.link);
    expect(open).toHaveAttribute('target', '_blank');
    expect(open.getAttribute('rel')).toContain('noreferrer');
    expect(within(block).getByText('Only you')).toBeInTheDocument();
  });

  it('keeps only the label once the message is purged', () => {
    render(<BundleSource source={SLACK_PURGED} />);
    const block = screen.getByTestId('bundle-source');
    expect(block).toHaveTextContent('Slack message');
    expect(block).not.toHaveTextContent('Faiz');
    expect(within(block).queryByRole('link')).toBeNull();
    expect(block.querySelector('blockquote')).toBeNull();
  });

  it('lists the row with its source label, For you and Only you', () => {
    render(
      <MemoryRouter>
        <ul>
          <BundleRow item={bundleItem(B_SLACK, true)} group="decide" />
        </ul>
      </MemoryRouter>,
    );
    const meta = document.querySelector('[data-part="meta"]') as HTMLElement;
    expect(meta).toHaveTextContent('Slack message');
    expect(meta).toHaveTextContent('For you');
    expect(meta).not.toHaveTextContent('For Alice');
    expect(within(meta).getByText('Only you')).toBeInTheDocument();
  });

  it("shows a survey's question and audience, a pin's change, and no wait before the run", () => {
    renderStep(B_SLACK, B_SLACK.steps[0]);
    const survey = screen.getByTestId('step-701');
    expect(survey.querySelector('[data-part="preview"]')).toHaveTextContent("Send a CSAT survey to Pizza Hut's Champion: How did we do, Pizza Hut?");
    expect(within(survey).getByText('How satisfied are you with how we handled this?')).toBeInTheDocument();
    expect(within(survey).getByText('2 contacts across 1 organisation')).toBeInTheDocument();
    renderStep(B_SLACK, B_SLACK.steps[1]);
    expect(within(screen.getByTestId('step-702')).getByText('Not pinned → Pinned')).toBeInTheDocument();
  });

  it("after the run shows the survey's wait, its note, and the scenario run's note", () => {
    renderStep(B_SLACK_DONE, B_SLACK_DONE.steps[0]);
    const survey = screen.getByTestId('step-711');
    expect(survey.querySelector('[data-part="state"]')).toHaveTextContent('Applied · Waiting for KAN-12');
    expect(survey.querySelector('[data-part="preview"]')).toHaveTextContent(', when KAN-12 is resolved');
    expect(within(survey).getByText('Sends when KAN-12 is resolved.')).toBeInTheDocument();
    renderStep(B_SLACK_DONE, B_SLACK_DONE.steps[2]);
    expect(screen.getByTestId('step-713').querySelector('[data-part="state"]')).toHaveTextContent('Applied · Made 2 tasks.');
    const failed = { ...B_SLACK_DONE.steps[2], id: 714, preview: { scenario_run: { scenario: { id: 7, name: 'Escalation playbook' }, record: 'Pizza Hut', run: { id: 32, status: 'failed' as const, note: '' } } } };
    renderStep(B_SLACK_DONE, failed);
    expect(screen.getByTestId('step-714').querySelector('[data-part="state"]')).toHaveTextContent('Applied · The scenario failed.');
  });

  it('draws an after_jira placeholder issue as a chip, never braces', () => {
    const held: Step = {
      ...B_SLACK.steps[0],
      placeholders: [{ field: 'issue', step: 1, key: 'ticket_key', label: 'Jira issue key' }],
      preview: { record_survey: { ...B_SLACK.steps[0].preview.record_survey!, timing: 'after_jira', issue: '{{step 1.ticket_key}}' } },
    };
    renderStep(B_SLACK, held);
    const preview = screen.getByTestId('step-701').querySelector('[data-part="preview"]') as HTMLElement;
    expect(preview).toHaveTextContent(', when Jira issue key is resolved');
    expect(preview.textContent).not.toContain('{{');
  });

  it('opens in the panel with the Slack source, For you, no Refresh, and saves a timing switch', async () => {
    const { spy } = stubBundles({ bundles: [B_SLACK] });
    renderWork(`/work?queue=mine&bundle=${B_SLACK.id}`);
    const panel = await screen.findByRole('dialog', { name: B_SLACK.title });
    const source = await within(panel).findByTestId('bundle-source');
    expect(source).toHaveTextContent('Slack message from Faiz Jamal');
    expect(within(source).getByText('Only you')).toBeInTheDocument();
    expect(within(panel).getByText('For you')).toBeInTheDocument();
    // can_refresh false: the newer-message banner shows, without its button.
    expect(within(panel).getByTestId('newer-message')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Refresh suggestions' })).toBeNull();
    const step = within(panel).getByTestId('step-701');
    expect(within(step).getByLabelText('Survey type')).toBeInTheDocument();
    expect(within(step).getByLabelText('Subject')).toBeInTheDocument();
    expect(within(step).getByText('Who at each record')).toBeInTheDocument();
    await userEvent.selectOptions(within(step).getByLabelText('When it sends'), 'after_jira');
    await userEvent.click(within(panel).getByRole('heading', { name: B_SLACK.title }));
    await waitFor(() => expect(sentSaves(spy)).toEqual([{ step: 701, body: { fields: { timing: 'after_jira' } } }]));
  });
});

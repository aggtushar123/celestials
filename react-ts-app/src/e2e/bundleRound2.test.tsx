import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { BUNDLES, B_COMMENT, B_OUTSIDE, OUTSIDE_BUNDLES } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real panel, router and History;
// only fetch is stubbed, in the round 2 D1 contract's shapes. Nothing is
// sent to Jira. Carl edits and runs an internal Jira comment and History
// links to it; with Jira down, a Jira step shows one error and one Try again.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agent bundles round 2 D1', () => {
  it('edits and runs a Jira comment; History links to the comment', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES, B_COMMENT] });
    renderWork(`/work?queue=mine&bundle=${B_COMMENT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_COMMENT.title });
    const step = within(panel).getByTestId('step-451');
    expect(within(step).getByText("Can't be undone")).toBeInTheDocument();
    expect(within(step).getByText('Only your team sees this comment in Jira.')).toBeInTheDocument();
    const box = within(step).getByRole('textbox', { name: 'Comment' });
    await userEvent.clear(box);
    await userEvent.type(box, 'Fails on Safari as well.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(step).findByRole('link', { name: 'Open the comment on SUP-12 in Jira (opens in a new tab)' })).toHaveAttribute('target', '_blank');
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await userEvent.click(await screen.findByRole('link', { name: /^History/ }));
    const row = (await screen.findByText(B_COMMENT.title)).closest('li') as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Open the comment on SUP-12 in Jira (opens in a new tab)' })).toHaveAttribute('target', '_blank');
  });

  it('shows one Jira error with one Try again when Jira is down', { timeout: 30000 }, async () => {
    const down = { status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } };
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES], failOptions: { jira_projects: down, jira_priorities: down, jira_assignees: down } });
    renderWork(`/work?queue=mine&bundle=${B_OUTSIDE.id}`);
    const panel = await screen.findByRole('dialog', { name: B_OUTSIDE.title });
    const create = within(panel).getByTestId('step-413');
    expect(await within(create).findByRole('alert')).toHaveTextContent("Couldn't reach Jira. Try again.");
    await waitFor(() => expect(within(create).getAllByRole('button', { name: 'Try again' })).toHaveLength(1));
  });
});

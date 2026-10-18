import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard, Where } from './testAsk';
import { ASK_PREFERENCE_KEY } from './askPreference';

const sparkles = () => within(screen.getByTestId('nav-actions')).getByRole('button', { name: /Copilot$/ });

describe('the Ask sheet on a phone', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('has no rail, only the Copilot switch, even when the rail was left open on a desktop', () => {
    stubCopilot();
    localStorage.setItem(ASK_PREFERENCE_KEY, 'open');
    renderDashboard('/dashboard/overview', () => <Where />, 375);
    expect(screen.queryByRole('complementary', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    expect(sparkles()).toHaveAccessibleName('Show Copilot');
    expect(sparkles()).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens full screen from the Copilot switch with focus inside, and gives focus back on Escape and on Close', async () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Where />, 375);
    const button = sparkles();
    await userEvent.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(screen.getByPlaceholderText('Ask Revenact')).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ask Revenact' })).not.toBeInTheDocument());
    expect(sparkles()).toHaveFocus();

    await userEvent.click(sparkles());
    await userEvent.click(await screen.findByRole('button', { name: 'Close Ask Revenact' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ask Revenact' })).not.toBeInTheDocument());
    expect(sparkles()).toHaveFocus();
    // The sheet is a visit, not a saved choice.
    expect(localStorage.getItem(ASK_PREFERENCE_KEY)).toBeNull();
  });

  it('keeps Tab inside the sheet', async () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <Where />, 375);
    await userEvent.click(sparkles());
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    within(sheet).getByRole('button', { name: 'Close Ask Revenact' }).focus();
    await userEvent.tab({ shift: true });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
  });
});

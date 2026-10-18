import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { sent, stubWork } from '../features/work/testWork';
import { WORK_SETTINGS } from '../features/work/testWorkFixtures';
import { renderPage } from '../pages/work/testPages';
import { WorkNotificationsPage } from '../pages/settings/WorkNotificationsPage';
import { WorkTasksPage } from '../pages/settings/WorkTasksPage';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real pages, the shared frame and
// the forms; only fetch is stubbed, by the stateful Work stub. Settings ›
// Work › Tasks and Notifications: an admin changes a setting and sees it
// saved; a member without edit reads the values as text.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

const ESCALATE = 'Tell the manager after (working days overdue)';

describe('Settings › Work › Tasks', () => {
  it('lets an admin change the escalation and see it saved, then a member reads it', { timeout: 30000 }, async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkTasksPage />, '/settings/work/tasks');
    const days = await screen.findByLabelText(ESCALATE);
    await userEvent.clear(days);
    await userEvent.type(days, '4');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ escalate_after_days: 4 }]));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
    expect(settings.escalate_after_days).toBe(4);

    cleanup();
    vi.unstubAllGlobals();
    stubWork({ workSettings: { ...settings, can_edit: false } });
    renderPage(<WorkTasksPage />, '/settings/work/tasks', { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(document.querySelector('[data-setting="escalate"]')).toHaveTextContent(ESCALATE);
    expect(document.querySelector('[data-setting="escalate"]')).toHaveTextContent('4');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.querySelector('button[aria-pressed]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

describe('Settings › Work › Notifications', () => {
  it('lets an admin turn the digest off and see it saved, then a member reads it', { timeout: 30000 }, async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkNotificationsPage />, '/settings/work/notifications');
    await userEvent.click(await screen.findByRole('switch', { name: 'Daily digest' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ digest_enabled: false }]);
    expect(settings.digest_enabled).toBe(false);

    cleanup();
    vi.unstubAllGlobals();
    stubWork({ workSettings: { ...WORK_SETTINGS, ...settings, can_edit: false } });
    renderPage(<WorkNotificationsPage />, '/settings/work/notifications', { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    // The section heading names the digest; its row says only Off.
    expect(screen.getByRole('region', { name: 'Daily digest' })).toContainElement(document.querySelector('[data-setting="digest"]') as HTMLElement);
    expect(document.querySelector('[data-setting="digest"]')).toHaveTextContent('Off');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

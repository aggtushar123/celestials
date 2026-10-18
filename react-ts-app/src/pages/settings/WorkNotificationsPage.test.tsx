import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { sent, stubWork } from '../../features/work/testWork';
import { WORK_SETTINGS } from '../../features/work/testWorkFixtures';
import { resetViewport } from '../../test/viewport';
import { renderPage } from '../work/testPages';
import { WorkNotificationsPage } from './WorkNotificationsPage';

const URL = '/settings/work/notifications';
const NO_EMAIL = "Email isn't set up on this server yet: digests are skipped";

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

describe('Settings › Work › Notifications (spec §3.3; delivery 3 Decisions 4 to 6)', () => {
  it('shows an admin the digest switch and hour, in the workspace timezone', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, timezone: 'Asia/Kolkata' } });
    renderPage(<WorkNotificationsPage />, URL);
    expect(screen.getByRole('heading', { level: 1, name: 'Work' })).toBeInTheDocument();
    const digest = await screen.findByRole('switch', { name: 'Daily digest' });
    expect(digest).toBeChecked();
    const hour = screen.getByLabelText('Send after');
    expect(hour).toHaveValue('8');
    expect(screen.getByRole('option', { name: '08:00' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(24);
    expect(screen.getByText('Local time in Asia/Kolkata, set under Tasks.')).toBeInTheDocument();
    expect(screen.queryByText(NO_EMAIL)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(digest).not.toHaveTextContent('On');
  });

  it('saves the digest switch the moment it changes, with an Undo (settings production spec §5.4)', async () => {
    const { spy } = stubWork();
    renderPage(<WorkNotificationsPage />, URL);
    const digest = await screen.findByRole('switch', { name: 'Daily digest' });
    expect(digest).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(digest);
    await waitFor(() => expect(digest).toHaveAttribute('aria-checked', 'false'));
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ digest_enabled: false }]);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ digest_enabled: false }, { digest_enabled: true }]));
    await waitFor(() => expect(digest).toHaveAttribute('aria-checked', 'true'));
  });

  it('saves the hour the moment it is chosen', async () => {
    const { spy } = stubWork();
    renderPage(<WorkNotificationsPage />, URL);
    await userEvent.selectOptions(await screen.findByLabelText('Send after'), '09:00');
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ digest_hour: 9 }]));
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('puts the server’s refusal under the hour and keeps the saved hour', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { digest_hour: ['Choose a whole number from 0 to 23.'] } } });
    renderPage(<WorkNotificationsPage />, URL);
    await userEvent.selectOptions(await screen.findByLabelText('Send after'), '09:00');
    expect(await screen.findByText('Choose a whole number from 0 to 23.')).toBeInTheDocument();
    const hourSelect = screen.getByLabelText('Send after');
    expect(hourSelect).toHaveValue('8');
    expect(hourSelect).toHaveAttribute('aria-invalid', 'true');
    expect(hourSelect).toHaveAccessibleDescription(expect.stringContaining('Choose a whole number from 0 to 23.'));
  });

  it('says digests are skipped when the server cannot send email, to an admin', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, email_ready: false } });
    renderPage(<WorkNotificationsPage />, URL);
    expect(await screen.findByRole('note')).toHaveTextContent(NO_EMAIL);
  });

  it('says digests are skipped when the server cannot send email, to a member', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, email_ready: false, can_edit: false } });
    renderPage(<WorkNotificationsPage />, URL, { role: 'csm' });
    expect(await screen.findByText(NO_EMAIL)).toBeInTheDocument();
  });

  it('keeps the hour select usable while the digest is off (Decision 4)', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, digest_enabled: false } });
    renderPage(<WorkNotificationsPage />, URL);
    expect(await screen.findByRole('switch', { name: 'Daily digest' })).not.toBeChecked();
    const hour = screen.getByLabelText('Send after');
    expect(hour).toBeEnabled();
    await userEvent.selectOptions(hour, '10:00');
    await waitFor(() => expect(hour).toHaveValue('10'));
  });

  it('puts a digest_enabled refusal under the switch, linked and marked invalid', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { digest_enabled: ['Digests need a working email setup.'] } } });
    renderPage(<WorkNotificationsPage />, URL);
    await userEvent.click(await screen.findByRole('switch', { name: 'Daily digest' }));
    expect(await screen.findByText('Digests need a working email setup.')).toBeInTheDocument();
    const digest = screen.getByRole('switch', { name: 'Daily digest' });
    expect(digest).toHaveAttribute('aria-checked', 'true');
    // aria-invalid is not a switch attribute: the refusal is linked through the description.
    expect(digest).toHaveAccessibleDescription(expect.stringContaining('Digests need a working email setup.'));
  });

  it('shows a member the settings as text: no controls', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    renderPage(<WorkNotificationsPage />, URL, { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    // The section heading says Daily digest; its row says the value, not the name again.
    expect(within(screen.getByRole('region', { name: 'Daily digest' })).getAllByText('Daily digest')).toHaveLength(1);
    expect(document.querySelector('[data-setting="digest"]')).toHaveTextContent('On');
    expect(document.querySelector('[data-setting="digest_hour"]')).toHaveTextContent('Send after');
    expect(document.querySelector('[data-setting="digest_hour"]')).toHaveTextContent('08:00');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows a skeleton, then the error with Try again', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkNotificationsPage />, URL);
    const loading = screen.getByText('Loading these settings').closest('[role="status"]');
    expect(loading).not.toBeNull();
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    // fireEvent is synchronous: the skeleton must replace the error before the re-read lands.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('Down.')).toBeNull();
    expect(screen.getByText('Loading these settings')).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'Daily digest' })).toBeInTheDocument();
  });

  it('works at phone width: every control keeps a 44px target', async () => {
    stubWork();
    renderPage(<WorkNotificationsPage />, URL, { width: 390 });
    expect(await screen.findByLabelText('Send after')).toHaveClass('min-h-11');
    expect(screen.getByRole('switch', { name: 'Daily digest' })).toHaveClass('min-h-11');
  });
});

describe('Settings › Work › Notifications: after Try again', () => {
  it('says what is not shown, and keeps focus off the page on a first load', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkNotificationsPage />, URL);
    expect(await screen.findByText('Nothing is shown rather than settings that may be out of date.')).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the heading when the retried load succeeds', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkNotificationsPage />, URL);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('switch', { name: 'Daily digest' });
    const heading = screen.getByRole('heading', { level: 1, name: 'Work' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus back to Try again when the retried load fails again', async () => {
    stubWork({ failSettings: 2 });
    renderPage(<WorkNotificationsPage />, URL);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
  });
});

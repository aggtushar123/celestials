import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { sent, stubWork } from '../../features/work/testWork';
import { WORK_SETTINGS } from '../../features/work/testWorkFixtures';
import { resetViewport } from '../../test/viewport';
import { renderPage } from '../work/testPages';
import { WorkTasksPage } from './WorkTasksPage';

const URL = '/settings/work/tasks';
const ESCALATE = 'Tell the manager after (working days overdue)';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function retype(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
});

describe('Settings › Work › Tasks (spec §3.3; delivery 3 Decisions 2, 3, 5, 6)', () => {
  it('shows an admin the form, filled from the saved settings, with no Save until something changes', async () => {
    stubWork();
    renderPage(<WorkTasksPage />, URL);
    expect(screen.getByRole('heading', { level: 1, name: 'Work' })).toBeInTheDocument();
    expect(await screen.findByLabelText(ESCALATE)).toHaveValue('2');
    expect(screen.getByLabelText('Timezone')).toHaveValue('UTC');
    expect(screen.getByRole('option', { name: 'Europe/London' })).toBeInTheDocument();
    DAYS.forEach((day, index) => expect(screen.getByRole('button', { name: day })).toHaveAttribute('aria-pressed', index < 5 ? 'true' : 'false'));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('saves the timezone the moment it is chosen', async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await userEvent.selectOptions(await screen.findByLabelText('Timezone'), 'Europe/London');
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ timezone: 'Europe/London' }]));
    expect(settings.timezone).toBe('Europe/London');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('collects the threshold and the days in the save bar, and sends them with one Save', async () => {
    const { spy } = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await retype(ESCALATE, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ escalate_after_days: 5, working_days: [0, 1, 2, 3, 4, 5] }]));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  });

  it('saves through the page bar when Enter is pressed in the threshold', async () => {
    const { spy } = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await userEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    await retype(ESCALATE, '5{Enter}');
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ escalate_after_days: 5, working_days: [0, 1, 2, 3, 4, 5] }]));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
    expect(screen.getByText('Saved.')).toBeInTheDocument();
  });

  it('keeps the edited threshold and sends only the draft fields after an instant timezone change', async () => {
    const { spy } = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await retype(ESCALATE, '5');
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'Europe/London');
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ timezone: 'Europe/London' }]));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByLabelText(ESCALATE)).toHaveValue('5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ timezone: 'Europe/London' }, { escalate_after_days: 5 }]));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  });

  it('keeps a refused threshold in the bar with its error under the field', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { escalate_after_days: ['Too many.'] } } });
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await retype(ESCALATE, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Too many.')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('discards the edits', async () => {
    stubWork();
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await retype(ESCALATE, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText(ESCALATE)).toHaveValue('2');
  });

  it('refuses in place, in the contract’s words, sending nothing', async () => {
    const { spy } = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await retype(ESCALATE, '31');
    for (const day of DAYS.slice(0, 5)) await userEvent.click(screen.getByRole('button', { name: day }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Choose a whole number from 1 to 30.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one working day.')).toBeInTheDocument();
    expect(screen.getByLabelText(ESCALATE)).toHaveAttribute('aria-invalid', 'true');
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([]);
    await retype(ESCALATE, '5');
    expect(screen.queryByText('Choose a whole number from 1 to 30.')).toBeNull();
    expect(screen.getByLabelText(ESCALATE)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Choose at least one working day.')).toBeInTheDocument();
  });

  it('puts the server’s timezone refusal under the select', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { timezone: ['Choose a timezone from the list.'] } } });
    renderPage(<WorkTasksPage />, URL);
    await screen.findByLabelText(ESCALATE);
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'Europe/London');
    expect(await screen.findByText('Choose a timezone from the list.')).toBeInTheDocument();
    expect(screen.getByLabelText('Timezone')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Timezone')).toHaveAccessibleDescription(expect.stringContaining('Choose a timezone from the list.'));
  });

  it('shows a member the settings as text: no controls', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    renderPage(<WorkTasksPage />, URL, { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(document.querySelector('[data-setting="escalate"]')).toHaveTextContent(ESCALATE);
    expect(document.querySelector('[data-setting="escalate"]')).toHaveTextContent('2');
    expect(document.querySelector('[data-setting="timezone"]')).toHaveTextContent('Timezone');
    expect(document.querySelector('[data-setting="timezone"]')).toHaveTextContent('UTC');
    expect(document.querySelector('[data-setting="working_days"]')).toHaveTextContent('Working days');
    expect(document.querySelector('[data-setting="working_days"]')).toHaveTextContent('Monday, Tuesday, Wednesday, Thursday, Friday');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Monday' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('shows a skeleton, then the error with Try again', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkTasksPage />, URL);
    expect(screen.getByText('Loading these settings')).toBeInTheDocument();
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText(ESCALATE)).toBeInTheDocument();
  });

  it('works at phone width: every control keeps a 44px target', async () => {
    stubWork();
    renderPage(<WorkTasksPage />, URL, { width: 390 });
    expect(await screen.findByLabelText(ESCALATE)).toHaveClass('min-h-11');
    expect(screen.getByLabelText('Timezone')).toHaveClass('min-h-11');
    for (const day of DAYS) expect(screen.getByRole('button', { name: day })).toHaveClass('min-h-11');
  });
});

describe('Settings › Work › Tasks: after Try again', () => {
  it('says what is not shown, and keeps focus off the page on a first load', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkTasksPage />, URL);
    expect(await screen.findByText('Nothing is shown rather than settings that may be out of date.')).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the heading when the retried load succeeds', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkTasksPage />, URL);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Monday' });
    const heading = screen.getByRole('heading', { level: 1, name: 'Work' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus back to Try again when the retried load fails again', async () => {
    stubWork({ failSettings: 2 });
    renderPage(<WorkTasksPage />, URL);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
  });
});

describe('Settings › Work › Tasks on the settings frame (UI foundations spec §6.3)', () => {
  it('puts the three settings in one section, with no Save of its own', async () => {
    stubWork();
    renderPage(<WorkTasksPage />, '/settings/work/tasks');
    const section = await screen.findByRole('region', { name: 'Reminders' });
    expect(within(section).getByLabelText('Tell the manager after (working days overdue)')).toHaveClass('tabular-nums');
    expect(within(section).getByRole('combobox', { name: 'Timezone' })).toHaveClass('appearance-none');
    expect(within(section).getByRole('group', { name: 'Working days' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRecommendationChanges } from '../../components/work/taskChanges';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { calls, sent, stubWork } from '../../features/work/testWork';
import { WORK_SETTINGS } from '../../features/work/testWorkFixtures';
import { resetViewport } from '../../test/viewport';
import { renderPage } from '../work/testPages';
import { WorkRecommendationsPage } from './WorkRecommendationsPage';

const URL = '/settings/work/recommendations';
const row = (kind: string) => document.querySelector(`[data-source="${kind}"]`) as HTMLElement;

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

describe('Settings › Work › Recommendations (spec §2.4; Decisions 10 to 12)', () => {
  it('shows an admin the form, filled from the saved settings, with Save off until something changes', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    expect(screen.getByRole('heading', { level: 1, name: 'Work' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: "The suggested person's manager" })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'The suggested person' })).not.toBeChecked();
    for (const name of ['Renewal due', 'Health drop', 'Urgent tickets', 'Anomalies']) {
      expect(screen.getByRole('switch', { name })).toBeChecked();
    }
    expect(screen.getByLabelText('Within (days)')).toHaveValue('30');
    expect(screen.getByLabelText('Drop of at least')).toHaveValue('0.5');
    expect(screen.getByLabelText('Compared with (days ago)')).toHaveValue('14');
    expect(screen.getByLabelText('At least (tickets)')).toHaveValue('1');
    expect(screen.getByLabelText('After a dismissal (days)')).toHaveValue('14');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Signals' })).toContainElement(screen.getByRole('switch', { name: 'Health drop' }));
    expect(screen.getByRole('list', { name: 'Signals' })).toHaveClass('divide-y');
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled();
  });

  it('lists the four signals Revenact still recommends from', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    const signals = await screen.findByRole('list', { name: 'Signals' });
    expect(within(signals).getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual(['Renewal due', 'Health drop', 'Urgent tickets', 'Anomalies']);
    for (const gone of ['Overdue tasks', 'Open questions', 'AI agent']) expect(within(signals).queryByText(gone)).toBeNull();
  });

  it('saves who receives them the moment it changes', async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('radio', { name: 'The suggested person' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ recommend_to: 'owner' }]));
    expect(settings.recommend_to).toBe('owner');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'The suggested person' })).toBeChecked());
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('saves a signal switch the moment it changes', async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('switch', { name: 'Health drop' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ sources: { health_drop: { enabled: false } } }]));
    expect(settings.sources.health_drop.enabled).toBe(false);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Health drop' })).not.toBeChecked());
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(screen.queryByText('On')).toBeNull();
  });

  it('undoes a signal switch: a second PATCH restores the previous enabled and the switch flips back', async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('switch', { name: 'Health drop' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Health drop' })).not.toBeChecked());
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ sources: { health_drop: { enabled: false } } }, { sources: { health_drop: { enabled: true } } }]),
    );
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Health drop' })).toBeChecked());
    expect(settings.sources.health_drop.enabled).toBe(true);
  });

  it('puts a refused instant save under its switch and leaves the switch as saved', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { sources: { health_drop: { enabled: ['Cannot turn this off.'] } } } } });
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('switch', { name: 'Health drop' }));
    expect(await within(row('health_drop')).findByText('Cannot turn this off.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Health drop' })).toBeChecked();
  });

  it('collects thresholds and the cooldown in the save bar, sending only what changed', async () => {
    const { spy, settings } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByLabelText('Within (days)');
    await retype('Within (days)', '45');
    await retype('After a dismissal (days)', '7');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ dismiss_cooldown_days: 7, sources: { renewal_due: { days: 45 } } }]));
    expect(settings.sources.renewal_due.days).toBe(45);
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  });

  it('saves through the page bar when Enter is pressed in a threshold', async () => {
    const { spy } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByLabelText('Within (days)');
    await retype('Within (days)', '45');
    await retype('After a dismissal (days)', '7{Enter}');
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ dismiss_cooldown_days: 7, sources: { renewal_due: { days: 45 } } }]));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
    expect(screen.getByText('Saved.')).toBeInTheDocument();
  });

  it('keeps an edited threshold when a switch is flipped, and its Save sends no enabled or recommend_to', async () => {
    const { spy } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByLabelText('Within (days)');
    await retype('Within (days)', '45');
    await userEvent.click(screen.getByRole('switch', { name: 'Health drop' }));
    await userEvent.click(screen.getByRole('radio', { name: 'The suggested person' }));
    await waitFor(() =>
      expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ sources: { health_drop: { enabled: false } } }, { recommend_to: 'owner' }]),
    );
    await waitFor(() => expect(screen.getByRole('radio', { name: 'The suggested person' })).toBeChecked());
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByLabelText('Within (days)')).toHaveValue('45');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toHaveLength(3));
    expect(sent(spy, 'PATCH', '/work/settings/')[2]).toEqual({ sources: { renewal_due: { days: 45 } } });
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  });

  it('refuses numbers outside the limits in place, in the contract’s words, sending nothing', async () => {
    const { spy } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByRole('switch', { name: 'Renewal due' });
    await retype('Within (days)', '121');
    await retype('Drop of at least', '6');
    await retype('At least (tickets)', '2.5');
    await retype('After a dismissal (days)', '');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await within(row('renewal_due')).findByText('Choose a whole number from 1 to 120.')).toBeInTheDocument();
    expect(within(row('health_drop')).getByText('Choose a number from 0.1 to 5.')).toBeInTheDocument();
    expect(within(row('urgent_tickets')).getByText('Choose a whole number from 1 to 50.')).toBeInTheDocument();
    expect(screen.getByText('Choose a whole number from 0 to 120.')).toBeInTheDocument();
    expect(screen.getByLabelText('Within (days)')).toHaveAttribute('aria-invalid', 'true');
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([]);
  });

  it('puts a server refusal under its field', async () => {
    stubWork({ refuseNextSettings: { status: 400, body: { sources: { urgent_tickets: { min: ['Choose a whole number from 1 to 120.'] } } } } });
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByRole('switch', { name: 'Anomalies' });
    await retype('At least (tickets)', '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await within(row('urgent_tickets')).findByText('Choose a whole number from 1 to 120.')).toBeInTheDocument();
  });

  it('runs the recommender now, says what it did, and tells Work', async () => {
    stubWork({ refreshResult: { created: 2, updated: 5, expired: 1, unrouted: 1, notified: 1, failed: ['health_drop'] } });
    const heard = vi.fn();
    renderHook(() => useRecommendationChanges(heard));
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    expect(await screen.findByText(/Run finished/)).toHaveTextContent(
      "Run finished: 2 new, 5 updated, 1 expired. 1 couldn't be sent to anyone who can open the record. 1 person told.",
    );
    expect(screen.getByText('These sources failed this run: Health drop.')).toBeInTheDocument();
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
  });

  it('shows a member the settings as text: no controls, no Run now', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    renderPage(<WorkRecommendationsPage />, URL, { role: 'csm' });
    expect(await screen.findByText('Only admins can change these.')).toBeInTheDocument();
    expect(screen.getByText("The suggested person's manager")).toBeInTheDocument();
    expect(row('renewal_due')).toHaveTextContent('Renewal due: On · Within (days) 30');
    expect(row('health_drop')).toHaveTextContent('Health drop: On · Drop of at least 0.5 · Compared with (days ago) 14');
    expect(row('anomaly')).toHaveTextContent('Anomalies: On');
    expect(screen.getByRole('region', { name: 'Dismissals' })).toHaveTextContent('After a dismissal (days)');
    expect(screen.getByRole('region', { name: 'Dismissals' })).toHaveTextContent('14');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
  });

  it('shows a skeleton, then the error with Try again', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkRecommendationsPage />, URL);
    expect(screen.getByText('Loading these settings')).toBeInTheDocument();
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('switch', { name: 'Renewal due' })).toBeInTheDocument();
  });
});

describe('Settings › Work › Recommendations: after Try again', () => {
  it('says what is not shown, and keeps focus off the page on a first load', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkRecommendationsPage />, URL);
    expect(await screen.findByText('Nothing is shown rather than settings that may be out of date.')).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the heading when the retried load succeeds', async () => {
    stubWork({ failSettings: 1 });
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('switch', { name: 'Renewal due' });
    const heading = screen.getByRole('heading', { level: 1, name: 'Work' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus back to Try again when the retried load fails again', async () => {
    stubWork({ failSettings: 2 });
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
  });
});

describe('Settings › Work › Recommendations on the settings frame (UI foundations spec §6.3)', () => {
  it('heads the page with the nav label in the display size, inside the default frame', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    const title = screen.getByRole('heading', { level: 1, name: 'Work' });
    expect(title).toHaveClass('text-[22px]', 'font-semibold');
    expect(title.closest('.max-w-\\[960px\\]')).not.toBeNull();
    await screen.findByRole('radio', { name: 'The suggested person' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Who receives them', 'Signals', 'Dismissals', 'Run now']);
  });

  it('marks a refused threshold on its field: the danger edge, the error under it, named by the field', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByLabelText('Within (days)');
    await retype('Within (days)', '121');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const field = screen.getByLabelText('Within (days)');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveClass('aria-[invalid=true]:border-danger');
    const error = within(row('renewal_due')).getByRole('alert');
    expect(error).toHaveClass('text-[11px]', 'text-danger-ink');
    expect(field.getAttribute('aria-describedby')).toContain(error.id);
  });
});

describe('Settings › Work › Recommendations: final wave', () => {
  it('a double press on Run now while it runs sends one run, and keeps focus on it', async () => {
    const { spy } = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    const run = await screen.findByRole('button', { name: 'Run now' });
    run.focus();
    fireEvent.click(run);
    expect(run).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(run);
    await screen.findByText(/Run finished/);
    expect(calls(spy, 'POST', '/work/recommendations/refresh/')).toHaveLength(1);
    expect(run).toHaveFocus();
  });

  it('sits each signal\'s detail line right under its 44px switch row, with no gap between them', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    const toggle = await screen.findByRole('switch', { name: 'Renewal due' });
    expect(row('renewal_due')).toContainElement(toggle);
    expect(toggle).toHaveClass('min-h-11');
    const detail = within(row('renewal_due')).getByText('A renewal within this many days, or overdue.');
    const pair = detail.parentElement!;
    expect(pair).toContainElement(toggle);
    expect(pair.className).not.toMatch(/\bgap-/);
    expect(pair).not.toBe(row('renewal_due'));
  });

  it('says who receives them once, in the section heading, for a member', async () => {
    stubWork({ workSettings: { ...WORK_SETTINGS, can_edit: false } });
    renderPage(<WorkRecommendationsPage />, URL, { role: 'csm' });
    const receives = await screen.findByRole('region', { name: 'Who receives them' });
    expect(within(receives).getAllByText('Who receives them')).toHaveLength(1);
    expect(receives).toHaveTextContent("The suggested person's manager");
  });
});

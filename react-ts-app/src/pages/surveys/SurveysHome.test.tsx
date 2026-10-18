import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { Q3_NPS, requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import type { SendListRow } from '../../features/surveys/surveyTypes';
import { resetViewport } from '../../test/viewport';
import { renderSurveys } from './testPages';

// Integration tier: the real store and router, fetch stubbed in the
// backend's contract shapes (stubSurveys).
const where = () => screen.getByTestId('where').textContent;

describe('/surveys (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens on Sends: a row per send with its type, segment, date, sender and "N of M answered · R%"', async () => {
    stubSurveys();
    renderSurveys('/surveys');
    expect(await screen.findByRole('link', { name: 'Sends' })).toHaveAttribute('aria-current', 'page');
    const list = await screen.findByRole('list', { name: 'Survey sends' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const q3 = within(list).getByRole('link', { name: 'Q3 NPS' }).closest('li') as HTMLElement;
    expect(within(q3).getByRole('link', { name: 'Q3 NPS' })).toHaveAttribute('href', '/surveys/3');
    expect(q3).toHaveTextContent('NPS');
    expect(q3).toHaveTextContent('Renewal risk · Sent 3 Oct 2026 · You · Workspace');
    expect(q3.querySelector('[data-part="answered"]')).toHaveTextContent('3 of 5');
    expect(q3).toHaveTextContent('60%');
    const draft = within(list).getByRole('link', { name: 'Onboarding effort' }).closest('li') as HTMLElement;
    expect(draft).toHaveTextContent('Draft');
    expect(draft.querySelector('[data-part="answered"]')).toHaveTextContent('Draft');
    const carl = within(list).getByRole('link', { name: 'Support CSAT' }).closest('li') as HTMLElement;
    expect(carl).toHaveTextContent('EMEA accounts · Sent 1 Oct 2026 · Carl CSM');
    expect(carl.querySelector('[data-part="answered"]')).toHaveTextContent('1 of 1');
    expect(carl).toHaveTextContent('100%');
  });

  it('sets the answered figures in tabular figures', async () => {
    stubSurveys();
    renderSurveys('/surveys');
    const list = await screen.findByRole('list', { name: 'Survey sends' });
    const q3 = within(list).getByRole('link', { name: 'Q3 NPS' }).closest('li') as HTMLElement;
    expect([...q3.querySelectorAll('[data-part="answered"] .tabular-nums')].map((node) => node.textContent)).toEqual(['3', '5']);
  });

  it('explains a survey and offers New survey when there are none', async () => {
    stubSurveys({ sends: [] });
    renderSurveys('/surveys');
    expect(await screen.findByText('No surveys yet')).toBeInTheDocument();
    expect(screen.getByText(/A survey emails one standard question/)).toBeInTheDocument();
    // New survey is the bar's primary, not repeated in the empty state.
    expect(screen.getAllByRole('link', { name: 'New survey' }).map((link) => link.getAttribute('href'))).toEqual(['/surveys/new']);
  });

  it('shows a skeleton while loading, then the error with Try again, which reads again', async () => {
    let calls = 0;
    const { spy } = stubSurveys({
      list: () => {
        calls += 1;
        return calls === 1 ? { status: 500, body: { detail: 'Surveys are down.' } } : { status: 200, body: [] };
      },
    });
    renderSurveys('/surveys');
    expect(screen.getByRole('status')).toHaveTextContent('Loading surveys');
    expect(await screen.findByText('Surveys are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No surveys yet')).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/$/)).toHaveLength(2);
  });

  it('reads the list again when the New survey modal closes', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys');
    await screen.findByRole('list', { name: 'Survey sends' });
    expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/$/)).toHaveLength(1);
    await userEvent.click(screen.getAllByRole('link', { name: 'New survey' })[0]);
    const modal = await screen.findByRole('dialog', { name: 'New survey' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/surveys'));
    await waitFor(() => expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/$/)).toHaveLength(2));
  });

  it('keeps the last list beside the error when a reload fails, with Try again', async () => {
    const q3: SendListRow = { ...Q3_NPS, sent: 5, answered: 3, rate: 60 };
    let calls = 0;
    const { spy } = stubSurveys({
      list: () => {
        calls += 1;
        return calls === 2 ? { status: 500, body: { detail: 'Surveys are down.' } } : { status: 200, body: [q3] };
      },
    });
    renderSurveys('/surveys');
    const list = await screen.findByRole('list', { name: 'Survey sends' });
    await userEvent.click(screen.getByRole('link', { name: 'New survey' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'New survey' })).getByRole('button', { name: 'Cancel' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Surveys are down. Showing the last result.');
    expect(within(list).getByRole('link', { name: 'Q3 NPS' })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(within(screen.getByRole('list', { name: 'Survey sends' })).getByRole('link', { name: 'Q3 NPS' })).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/$/)).toHaveLength(3);
  });

  it('switches to Logged scores and back in the URL', async () => {
    stubSurveys();
    renderSurveys('/surveys');
    await userEvent.click(await screen.findByRole('link', { name: 'Logged scores' }));
    expect(where()).toBe('/surveys?tab=logged');
    expect(await screen.findByRole('button', { name: /Log survey/ })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Survey sends' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'New survey' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Sends' }));
    expect(where()).toBe('/surveys');
  });

  it("opens Logged scores for the organisation page's ?customer= link", async () => {
    stubSurveys();
    renderSurveys('/surveys?customer=6');
    expect(await screen.findByRole('link', { name: 'Logged scores' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows Logged scores without a second heading, keeps the tab when the organisation filter clears, and links sent rows to their send', async () => {
    stubSurveys();
    renderSurveys('/surveys?customer=6');
    await screen.findByRole('button', { name: /Log survey/ });
    // The one h1 is the page bar's (PageHeader); the tab adds none of its own.
    const [heading, ...others] = screen.getAllByRole('heading', { level: 1 });
    expect(others).toHaveLength(0);
    expect(heading).toHaveAccessibleName('Surveys');
    expect(heading.closest('[data-page-header]')).not.toBeNull();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Organization' }), '');
    expect(where()).toBe('/surveys?tab=logged');
    expect(screen.getByRole('link', { name: 'Logged scores' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('link', { name: 'From a sent survey' })).toHaveAttribute('href', '/surveys/3');
  });
});

describe('Surveys on the primitives (Impact PR)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('puts Sends | Logged scores and New survey in the bar, and the sends in one card on the sends grid', async () => {
    stubSurveys();
    renderSurveys('/surveys', { nav: true });
    const header = document.querySelector('header')!;
    const tabs = await within(header).findByRole('navigation', { name: 'Survey views' });
    expect(within(tabs).getByRole('link', { name: 'Sends' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Logged scores' })).toHaveAttribute('href', '/surveys?tab=logged');
    expect(within(header).getByRole('link', { name: 'New survey' })).toHaveClass('bg-accent');
    const list = await screen.findByRole('list', { name: 'Survey sends' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(list.closest('.\\@container')).not.toBeNull();
    const row = list.querySelector('[data-send]')!;
    expect(row.className).toContain('@min-[40rem]:grid-cols-[minmax(14rem,1fr)_5rem_8rem_5rem]');
  });

  it('drops New survey from the bar on Logged scores', async () => {
    stubSurveys();
    renderSurveys('/surveys?tab=logged', { nav: true });
    const header = document.querySelector('header')!;
    expect(await within(header).findByRole('link', { name: 'Logged scores' })).toHaveAttribute('aria-current', 'page');
    expect(within(header).queryByRole('link', { name: 'New survey' })).toBeNull();
  });
});

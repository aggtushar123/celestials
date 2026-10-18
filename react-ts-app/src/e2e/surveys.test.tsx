import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { requestsOf, stubSurveys } from '../features/surveys/testSurveys';
import { renderHosted, renderSurveys } from '../pages/surveys/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the segment's page,
// the Surveys pages, the hosted form, the store and the router. Only fetch is
// stubbed, by a stateful stub in the backend's contract shapes (spec §4:
// build → send → answer on the hosted form → the send page and the
// organisation's score move).
const where = () => screen.getByTestId('where').textContent;

describe('Surveys', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('surveys a segment, sends it, takes an answer on the hosted form, and the send page and the logged score move', { timeout: 30000 }, async () => {
    const { spy, tokensOf } = stubSurveys();

    // 1. Survey these on the owner's contact segment: the modal opens over it.
    const team = renderSurveys('/segments/9', { nav: true });
    await userEvent.click(await screen.findByRole('link', { name: 'Survey these' }));
    const modal = await screen.findByRole('dialog', { name: 'New survey' });
    expect(where()).toBe('/segments/9/survey');
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Champions'));

    // 2. Build: a name, NPS as chosen; who it reaches comes from the server.
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion NPS');
    await waitFor(() => expect(modal.querySelector('[data-part="reach"]')).toHaveTextContent('2 people at 2 organisations'));

    // 3. Send, confirming the server's count; the send's page opens.
    await userEvent.click(within(modal).getByRole('button', { name: 'Send to 2 people…' }));
    expect(await within(modal).findByRole('heading', { name: 'Send Champion NPS now?' })).toBeInTheDocument();
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(within(await screen.findByRole('group', { name: 'Answered' })).getByText('0')).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/100\/send\/$/)).toHaveLength(1);
    team.unmount();

    // 4. A customer opens their link: no app frame, no session.
    const [token] = tokensOf(100);
    const customer = renderHosted(token);
    expect(await screen.findByRole('heading', { level: 1, name: 'How likely are you to recommend Acme Inc to a friend or colleague?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '9' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Anything to add/ }), 'Always quick to help');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Thanks, your answer was recorded.' })).toBeInTheDocument();
    customer.unmount();

    // 5. The send's page moved: one answer of two, a promoter, the comment.
    renderSurveys('/surveys/100', { nav: true });
    expect(within(await screen.findByRole('group', { name: 'Answered' })).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Response rate' })).getByText('50%')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'NPS' })).getByText('+100')).toBeInTheDocument();
    expect(await screen.findByText('Always quick to help')).toBeInTheDocument();

    // 6. Back through the bar: the send leads the list, and Logged scores
    // carry its row for the organisation, read-only.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Surveys' }));
    await waitFor(() => expect(where()).toBe('/surveys'));
    expect(await screen.findByRole('link', { name: 'Champion NPS' })).toHaveAttribute('href', '/surveys/100');
    await userEvent.click(screen.getByRole('link', { name: 'Logged scores' }));
    const links = await screen.findAllByRole('link', { name: 'From a sent survey' });
    const row = links.find((link) => link.getAttribute('href') === '/surveys/100')?.closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Pizza Hut');
    expect(row).toHaveTextContent('100');
  });
});

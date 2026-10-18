import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderSurveys } from './testPages';

// Integration tier: the modal routes on the real store and router, over the
// pages that open them; fetch stubbed in the backend's contract shapes.
const where = () => screen.getByTestId('where').textContent;
const dialog = (name = 'New survey') => screen.findByRole('dialog', { name });

/** Picks a segment once the caller's own segments have loaded. */
async function chooseSegment(modal: HTMLElement, value: string) {
  const select = within(modal).getByRole('combobox', { name: 'Segment' });
  await waitFor(() => expect(select).toBeEnabled());
  await userEvent.selectOptions(select, value);
}

describe('the New survey modal (spec §2.2)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens over the Sends list with NPS chosen, the subject filled and the preview asking the question', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    expect(where()).toBe('/surveys/new');
    expect(await screen.findByRole('list', { name: 'Survey sends' })).toBeInTheDocument();
    expect(within(modal).getByRole('radio', { name: 'NPS' })).toBeChecked();
    expect(within(modal).getByRole('textbox', { name: 'Email subject' })).toHaveValue('A quick question from Acme Inc');
    expect(within(modal).getByRole('region', { name: 'The email' })).toHaveTextContent('How likely are you to recommend Acme Inc to a friend or colleague?');
    await userEvent.click(within(modal).getByRole('radio', { name: 'CES' }));
    expect(within(modal).getByRole('region', { name: 'The form' })).toHaveTextContent('How easy is it to get what you need from Acme Inc?');
    expect(within(modal).getByRole('button', { name: 'Send…' })).toHaveAccessibleDescription('Choose a segment to send.');
    expect(modal).toHaveTextContent('Teammates see the answers only from people they may open');
  });

  it('shows the roles for an organisation segment, Champion and Decision Maker ticked, and none for a contact segment', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await chooseSegment(modal, '7');
    const roles = within(modal).getByRole('group', { name: 'Who to ask at each organisation' });
    expect(within(roles).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Decision Maker' })).toBeChecked();
    await chooseSegment(modal, '9');
    expect(within(modal).queryByRole('group', { name: /Who to ask/ })).toBeNull();
  });

  it('counts who it reaches 400 ms after the last change, with the skips and the hidden count, and again when a role changes', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await chooseSegment(modal, '7');
    await waitFor(() => expect(modal.querySelector('[data-part="reach"]')).toHaveTextContent('3 people at 3 organisations'));
    expect(modal.querySelector('[data-part="skips"]')).toHaveTextContent('1 skipped (surveyed in the last 30 days) · 1 without an email');
    expect(modal.querySelector('[data-part="hidden"]')).toHaveTextContent("2 in the segment you can't open aren't included");
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/audience\/$/).map((r) => r.body)).toEqual([{ segment: 7, roles: ['champion', 'decision_maker'] }]);
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Decision Maker' }));
    await waitFor(() =>
      expect(requestsOf(spy, 'POST', /audience\/$/).map((r) => r.body)).toEqual([
        { segment: 7, roles: ['champion', 'decision_maker'] },
        { segment: 7, roles: ['champion'] },
      ]),
    );
    expect(await within(modal).findByRole('button', { name: 'Send to 3 people…' })).toBeEnabled();
  });

  it('disables Send with the reason when nobody is reached, and when no role is ticked', async () => {
    stubSurveys({ audience: () => ({ status: 200, body: { audience: 0, organisations: 0, skipped_recent: 4, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await chooseSegment(modal, '7');
    const send = await within(modal).findByRole('button', { name: 'Send to 0 people…' });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription('Nobody to send to.');
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Champion' }));
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Decision Maker' }));
    expect(within(modal).getByRole('button', { name: 'Send…' })).toHaveAccessibleDescription('Choose at least one role to send.');
  });

  it('saves a draft with the contract body, then opens its page', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Q4 CSAT');
    await userEvent.click(within(modal).getByRole('radio', { name: 'CSAT' }));
    await userEvent.type(within(modal).getByRole('textbox', { name: /Intro line/ }), 'Thanks for a good quarter.');
    await chooseSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/).map((r) => r.body)).toEqual([
      { name: 'Q4 CSAT', survey_type: 'csat', subject: 'A quick question from Acme Inc', intro: 'Thanks for a good quarter.', segment: 7, roles: ['champion', 'decision_maker'], sharing: 'private' },
    ]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Q4 CSAT' })).toBeInTheDocument();
  });

  it('caps the intro at 500 characters and counts them', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const intro = within(await dialog()).getByRole('textbox', { name: /Intro line/ });
    expect(intro).toHaveAttribute('maxlength', '500');
    await userEvent.type(intro, 'Hi');
    expect(intro).toHaveAccessibleDescription('2 of 500');
  });

  it('checks the name and the subject before saving anything', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.clear(within(modal).getByRole('textbox', { name: 'Email subject' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription('Give the survey a name.');
    expect(within(modal).getByRole('textbox', { name: 'Email subject' })).toHaveAccessibleDescription('Write a subject line.');
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/)).toEqual([]);
  });

  it('sends after a confirm step that repeats the count from the server', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion CES');
    await userEvent.click(within(modal).getByRole('radio', { name: 'CES' }));
    await chooseSegment(modal, '9');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    const heading = await within(modal).findByRole('heading', { name: 'Send Champion CES now?' });
    expect(heading).toHaveFocus();
    expect(modal.querySelector('[data-part="confirm"] [data-part="reach"]')).toHaveTextContent('2 people at 2 organisations');
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/).map((r) => r.body)).toEqual([expect.objectContaining({ segment: 9, roles: [], survey_type: 'ces' })]);
    expect(requestsOf(spy, 'POST', /audience\/$/)).toHaveLength(2);
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/100\/send\/$/)).toHaveLength(1);
    expect(within(await screen.findByRole('group', { name: 'Sent' })).getByText('2')).toBeInTheDocument();
  });

  it('goes Back from the confirm keeping the form, and never saves a second draft', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion NPS');
    await chooseSegment(modal, '9');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Back' }));
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Champion NPS');
    await userEvent.click(within(modal).getByRole('button', { name: 'Send to 2 people…' }));
    await within(modal).findByRole('button', { name: 'Send now' });
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/)).toHaveLength(1);
    expect(requestsOf(spy, 'PATCH', /^\/surveys\/sends\/100\/$/)).toEqual([]);
  });

  it("puts a roles refusal at the roles", async () => {
    stubSurveys({ create: () => ({ status: 400, body: { roles: ['Choose at least one role.'] } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Q4 NPS');
    await chooseSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    const roles = within(modal).getByRole('group', { name: 'Who to ask at each organisation' });
    expect(await within(roles).findByRole('alert')).toHaveTextContent('Choose at least one role.');
    expect(where()).toBe('/surveys/new');
  });

  it('puts the daily limit at the form and returns to it', async () => {
    stubSurveys({ sendNow: () => ({ status: 429, body: { detail: 'You can send at most 20 surveys a day. Try again tomorrow.' } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion NPS');
    await chooseSegment(modal, '9');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now' }));
    expect(await within(modal).findByText('You can send at most 20 surveys a day. Try again tomorrow.')).toBeInTheDocument();
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Champion NPS');
  });

  it('closes on Cancel back to the list', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/surveys'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('editing a survey (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('edits a draft over its page, every field open; PATCH carries only what changed', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/5/edit');
    const modal = await dialog('Edit Onboarding effort');
    expect(within(modal).getByRole('radio', { name: 'CES' })).toBeChecked();
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Champions'));
    const subject = within(modal).getByRole('textbox', { name: 'Email subject' });
    await userEvent.clear(subject);
    await userEvent.type(subject, 'How easy were we?');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(where()).toBe('/surveys/5'));
    expect(requestsOf(spy, 'PATCH', /^\/surveys\/sends\/5\/$/).map((r) => r.body)).toEqual([{ subject: 'How easy were we?' }]);
  });

  it('lets the owner only rename and re-share a sent survey', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/3/edit');
    const modal = await dialog('Edit Q3 NPS');
    expect(within(modal).queryByRole('textbox', { name: 'Email subject' })).toBeNull();
    expect(within(modal).queryByRole('combobox', { name: 'Segment' })).toBeNull();
    expect(modal.querySelector('[data-part="locked"]')).toHaveTextContent('NPS to Renewal risk, sent 3 Oct 2026. A sent survey can only be renamed or re-shared.');
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Q3 NPS final');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(where()).toBe('/surveys/3'));
    expect(requestsOf(spy, 'PATCH', /^\/surveys\/sends\/3\/$/).map((r) => r.body)).toEqual([{ name: 'Q3 NPS final' }]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Q3 NPS final' })).toBeInTheDocument();
  });

  it('tells a reader who is not the owner that only the owner edits', async () => {
    stubSurveys();
    renderSurveys('/surveys/4/edit');
    const modal = await dialog('Edit Support CSAT');
    expect(within(modal).getByText('Only Carl CSM can edit this survey')).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: 'Open survey' })).toHaveAttribute('href', '/surveys/4');
  });
});

describe('the New survey modal behaves as the segment builder (carried requirements)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  /** Longer than the audience debounce, so a request that would go has gone. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

  it('focuses the name, keeps Tab inside, keeps the draft on a scrim click and closes on Escape', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    expect(modal).toHaveAttribute('aria-modal', 'true');
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveFocus();
    await userEvent.type(name, 'Draft');
    await userEvent.click(document.querySelector('[data-scrim]') as HTMLElement);
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Draft');
    within(modal).getByRole('button', { name: 'Save draft' }).focus();
    await userEvent.tab();
    expect(within(modal).getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(where()).toBe('/surveys'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Close back to the list', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/surveys'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never asks who it reaches without a segment, or with no role ticked, and says why', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await settle();
    expect(requestsOf(spy, 'POST', /audience\/$/)).toEqual([]);
    expect(within(modal).getByRole('button', { name: 'Send…' })).toHaveAccessibleDescription('Choose a segment to send.');
    await chooseSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Champion' }));
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Decision Maker' }));
    await settle();
    expect(requestsOf(spy, 'POST', /audience\/$/)).toEqual([]);
    expect(within(modal).getByRole('button', { name: 'Send…' })).toHaveAccessibleDescription('Choose at least one role to send.');
    expect(within(modal).getByRole('region', { name: 'Who it reaches' })).toHaveTextContent('Choose a segment, and who to ask at each organisation');
  });

  it('drops the roles for a contact segment and ticks the defaults again on the way back', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await chooseSegment(modal, '7');
    await userEvent.click(within(modal).getByRole('checkbox', { name: 'Decision Maker' }));
    await chooseSegment(modal, '9');
    await waitFor(() => expect(requestsOf(spy, 'POST', /audience\/$/).map((r) => r.body)).toEqual([{ segment: 9, roles: [] }]));
    await chooseSegment(modal, '7');
    const roles = within(modal).getByRole('group', { name: 'Who to ask at each organisation' });
    expect(within(roles).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Decision Maker' })).toBeChecked();
  });

  it('sets the preview and who it reaches side by side, neither inside the other', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    const preview = within(modal).getByRole('region', { name: 'Preview' });
    const summary = within(modal).getByRole('region', { name: 'Who it reaches' });
    expect(preview.parentElement).toBe(summary.parentElement);
    expect(preview.contains(summary) || summary.contains(preview)).toBe(false);
    expect(preview.parentElement?.className).not.toMatch(/(^|\s)(border|rounded|bg-)/);
  });

  it("keeps the confirm step and the draft when the workspace's email isn't set up", async () => {
    const { spy } = stubSurveys({ noEmail: true });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion NPS');
    await chooseSegment(modal, '9');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send now' }));
    expect(await within(modal).findByRole('alert')).toHaveTextContent("Email isn't set up for this workspace yet, so surveys can't be sent.");
    expect(within(modal).getByRole('heading', { name: 'Send Champion NPS now?' })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Send now' })).toBeEnabled();
    expect(where()).toBe('/surveys/new');
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/)).toHaveLength(1);
    // The draft stays: Back returns to the form and a second try saves no second draft.
    await userEvent.click(within(modal).getByRole('button', { name: 'Back' }));
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Champion NPS');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/)).toHaveLength(1);
    expect(await screen.findByRole('heading', { level: 1, name: 'Champion NPS' })).toBeInTheDocument();
  });
});

/** Holds GET /segments/ (my segments) until the returned release runs. */
function holdMySegments(spy: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.replace(/^\/api\/v1/, '') === '/segments/' && (init?.method ?? 'GET') === 'GET') await gate;
    return spy(input, init);
  });
  return release;
}

/** Name, the Champions contact segment, then Send… to the confirm step. */
async function toConfirm(modal: HTMLElement, name = 'Champion NPS') {
  await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), name);
  await chooseSegment(modal, '9');
  await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
  await within(modal).findByRole('button', { name: 'Send now' });
}

describe('the New survey modal after the final review', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens the saved draft when the modal closes after Send… made it (Back, then Cancel)', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await toConfirm(modal);
    await userEvent.click(within(modal).getByRole('button', { name: 'Back' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Champion NPS' })).toBeInTheDocument();
  });

  it("opens the saved draft when the modal closes on the no-email refusal", async () => {
    stubSurveys({ noEmail: true });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await toConfirm(modal);
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now' }));
    await within(modal).findByRole('alert');
    await userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
  });

  it('opens the draft on Survey these too, once Send… has saved it', async () => {
    stubSurveys();
    renderSurveys('/segments/9/survey');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Champion NPS');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(where()).toBe('/surveys/100'));
  });

  it("keeps a draft's page current when its edit closes after Send… saved a change", async () => {
    stubSurveys();
    renderSurveys('/surveys/5/edit');
    const modal = await dialog('Edit Onboarding effort');
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Effort CES');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Send to 2 people…' }));
    await within(modal).findByRole('button', { name: 'Send now' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/surveys/5'));
    expect(screen.getByRole('heading', { level: 1, name: 'Effort CES' })).toBeInTheDocument();
  });

  it('opens the send when send/ answers 409 (already being sent)', async () => {
    stubSurveys({ sendNow: () => ({ status: 409, body: { detail: 'This survey is being sent.' } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await toConfirm(modal);
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('turns Send now off with the reason when the fresh count is 0', async () => {
    let asked = 0;
    stubSurveys({
      audience: () => {
        asked += 1;
        const audience = asked === 1 ? 2 : 0;
        return { status: 200, body: { audience, organisations: audience, skipped_recent: 2, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 } };
      },
    });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await toConfirm(modal);
    const now = within(modal).getByRole('button', { name: 'Send now' });
    expect(now).toBeDisabled();
    expect(now).toHaveAccessibleDescription('Nobody to send to.');
  });

  it('turns Send now off with the reason when the fresh count is over 500', async () => {
    let asked = 0;
    stubSurveys({
      audience: () => {
        asked += 1;
        const audience = asked === 1 ? 2 : 501;
        return { status: 200, body: { audience, organisations: 40, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 } };
      },
    });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await toConfirm(modal);
    const now = within(modal).getByRole('button', { name: 'Send now' });
    expect(now).toBeDisabled();
    expect(now).toHaveAccessibleDescription('This survey would reach 501 people; the most is 500.');
  });

  it('returns focus to the Send button on Back from the confirm', async () => {
    stubSurveys();
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await toConfirm(modal);
    await userEvent.click(within(modal).getByRole('button', { name: 'Back' }));
    const send = within(modal).getByRole('button', { name: 'Send to 2 people…' });
    await waitFor(() => expect(send).toHaveFocus());
  });

  it('returns a send/ field refusal to the form, the error at the segment and focus on it', async () => {
    stubSurveys({ sendNow: () => ({ status: 400, body: { segment: ['Nobody to send to.'] } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await toConfirm(modal);
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now' }));
    const segment = await within(modal).findByRole('combobox', { name: 'Segment' });
    expect(segment).toHaveAttribute('aria-invalid', 'true');
    expect(segment).toHaveAccessibleDescription(expect.stringContaining('Nobody to send to.'));
    await waitFor(() => expect(segment).toHaveFocus());
    expect(within(modal).queryByRole('heading', { name: 'Send Champion NPS now?' })).toBeNull();
  });

  it('focuses the form alert when a refusal with no field returns to the form', async () => {
    stubSurveys({ sendNow: () => ({ status: 429, body: { detail: 'You can send at most 20 surveys a day. Try again tomorrow.' } }) });
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await toConfirm(modal);
    await userEvent.click(within(modal).getByRole('button', { name: 'Send now' }));
    const alert = await within(modal).findByText('You can send at most 20 surveys a day. Try again tomorrow.');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('keeps Save draft and Send off until my segments load, so no draft goes without the default roles', async () => {
    const { spy } = stubSurveys();
    const release = holdMySegments(spy);
    renderSurveys('/surveys/new');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Q4 NPS');
    expect(within(modal).getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(within(modal).getByRole('button', { name: 'Send…' })).toBeDisabled();
    expect(within(modal).getByRole('button', { name: 'Send…' })).toHaveAccessibleDescription('Loading your segments…');
    release();
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'Save draft' })).toBeEnabled());
  });

  it('keeps Save draft off on Survey these until my segments load, then saves with the default roles', async () => {
    const { spy } = stubSurveys();
    const release = holdMySegments(spy);
    renderSurveys('/segments/7/survey');
    const modal = await dialog();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Renewal NPS');
    expect(within(modal).getByRole('button', { name: 'Save draft' })).toBeDisabled();
    release();
    const save = within(modal).getByRole('button', { name: 'Save draft' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() => expect(where()).toBe('/surveys/100'));
    expect(requestsOf(spy, 'POST', /^\/surveys\/sends\/$/).map((r) => r.body)).toEqual([expect.objectContaining({ segment: 7, roles: ['champion', 'decision_maker'] })]);
  });

  it('stacks its columns at 375px with nothing scrolling sideways', async () => {
    stubSurveys();
    renderSurveys('/surveys/new', { width: 375 });
    const modal = await dialog();
    const columns = modal.querySelector('[data-part="builder-columns"]') as HTMLElement;
    expect(columns).toHaveClass('grid', 'lg:grid-cols-[minmax(0,1fr)_22rem]');
    expect(columns.className).not.toMatch(/(^|\s)(sm:|md:)?grid-cols-(?!1(\s|$))/);
    const name = within(modal).getByRole('textbox', { name: 'Name' });
    const preview = within(modal).getByRole('region', { name: 'Preview' });
    expect(name.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(modal.querySelectorAll('[class*="overflow-x-auto"], [class*="overflow-x-scroll"], [class*="overflow-scroll"]')).toHaveLength(0);
    // Why Send is off sits on its own line above the buttons on phones.
    const reason = within(modal.querySelector('[data-part="builder-footer"]') as HTMLElement).getByText('Choose a segment to send.');
    expect(reason).toHaveClass('basis-full', 'sm:basis-auto');
  });
});

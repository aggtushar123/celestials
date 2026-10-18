import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizationPage } from '../testDetail';
import { stubOrganizationPageAsk } from './testOrganizationsAsk';

// Integration tier: "Ask about this" on a story item (spec §3), through the
// real page, layout, rail, store and router.
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact') as HTMLInputElement;
const page = { surface: 'organizations', view: 'detail', organization: 7 };

describe('Ask about this', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens the rail with a question about the item, focused on it for one question', async () => {
    const { copilot } = stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7?account=31', { ask: true, width: 1100 });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Re: Renewal pricing' }));
    expect(await within(rail()).findByText('Pizza Hut · EMEA · This email')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this email?');
    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this email?');
    expect(postedBodies(copilot)[0].context).toEqual({ ...page, account: 31, focus: { kind: 'email', id: 41 } });
    // Spent by the send: the chip is the page again, and so is the next question.
    expect(within(rail()).getByText('Pizza Hut · EMEA')).toBeInTheDocument();
    await userEvent.type(composer(), 'And the renewal?{enter}');
    await screen.findByText('Answer to: And the renewal?');
    expect(postedBodies(copilot)[1].context).toEqual({ ...page, account: 31, focus: null });
  });

  it("drops the focus with the chip's ×, keeping the question", async () => {
    const { copilot } = stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    await within(rail()).findByText('Pizza Hut · This call');
    await userEvent.click(within(rail()).getByRole('button', { name: 'Remove focus' }));
    expect(within(rail()).getByText('Pizza Hut')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this call?');
    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this call?');
    expect(postedBodies(copilot)[0].context).toEqual({ ...page, account: null, focus: null });
  });

  it('drops the focus when the story filters change', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    await within(rail()).findByText('Pizza Hut · This call');
    const chips = screen.getByRole('group', { name: 'Filter by account' });
    await userEvent.click(within(chips).getByRole('button', { name: /^EMEA/ }));
    expect(await within(rail()).findByText('Pizza Hut · EMEA')).toBeInTheDocument();
    expect(within(rail()).queryByText(/This call/)).not.toBeInTheDocument();
  });

  it('drops the untouched prefilled question with the focus, when the URL changes', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    expect(composer()).toHaveValue('What should I know about this call?');
    const chips = screen.getByRole('group', { name: 'Filter by account' });
    await userEvent.click(within(chips).getByRole('button', { name: /^EMEA/ }));
    await within(rail()).findByText('Pizza Hut · EMEA');
    expect(composer()).toHaveValue('');
  });

  it('keeps the question the person edited when the URL changes', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    await userEvent.type(composer(), ' And the next step');
    const chips = screen.getByRole('group', { name: 'Filter by account' });
    await userEvent.click(within(chips).getByRole('button', { name: /^EMEA/ }));
    await within(rail()).findByText('Pizza Hut · EMEA');
    expect(composer()).toHaveValue('What should I know about this call? And the next step');
  });

  it('opens the sheet on phones, prefilled', async () => {
    stubOrganizationPageAsk();
    renderOrganizationPage('/organizations/7', { ask: true, width: 375 });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(within(sheet).getByText('Pizza Hut · This call')).toBeInTheDocument();
    expect(within(sheet).getByPlaceholderText('Ask Revenact')).toHaveValue('What should I know about this call?');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { accountFixture, initechApac, pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountFormModal } from '../../../pages/organizations/AccountFormModal';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { ContactFormModal } from '../../contacts/ContactFormModal';
import { LogSurveyForm } from '../../organizations/activity/SurveysTab';
import { OpportunityFormModal } from '../../pipelines/OpportunityFormModal';
import { RiskFormModal } from '../../pipelines/RiskFormModal';

// The account page has no organisation id to hand these forms (an account
// can be open to a viewer while none of its organisations is): given only
// `accountId`, each saves on that account through backend #75's flat route.

type Sent = { method: string; path: string; body: Record<string, unknown> };

function stubSaves() {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
      if (method === 'GET') return { ok: true, status: 200, json: async () => [] };
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.push({ method, path, body });
      return { ok: true, status: method === 'POST' ? 201 : 200, json: async () => ({ id: 900, ...body }) };
    }),
  );
  return sent;
}

function renderWithStore(ui: ReactNode) {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

const submit = (name: string) => userEvent.click(screen.getAllByRole('button', { name }).find((button) => button.closest('form'))!);

describe('the forms on an account alone', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds a person on the account, with no organisation or account to pick', async () => {
    const sent = stubSaves();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithStore(<ContactFormModal accountId={12} onClose={onClose} onSaved={onSaved} />);
    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByLabelText(/^Email/), 'robin@pizzahut.example');
    await submit('Add Contact');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    // The account-alone save goes through the flat route, not
    // /customers/<id>/accounts/12/contacts/ — proves no organisation id
    // leaked in even though none was ever given to this modal.
    expect(sent).toEqual([
      { method: 'POST', path: '/accounts/12/contacts/', body: expect.objectContaining({ name: 'Robin Ops', email: 'robin@pizzahut.example' }) },
    ]);
  });

  it('adds an opportunity on the account', async () => {
    const sent = stubSaves();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithStore(<OpportunityFormModal accountId={12} defaultStage="discovery" onClose={onClose} onSaved={onSaved} />);
    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Upsell');
    await submit('Add Opportunity');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(sent).toEqual([
      { method: 'POST', path: '/accounts/12/opportunities/', body: expect.objectContaining({ title: 'Upsell', stage: 'discovery' }) },
    ]);
  });

  it('adds a risk on the account', async () => {
    const sent = stubSaves();
    const onClose = vi.fn();
    renderWithStore(<RiskFormModal accountId={12} defaultStage="open" onClose={onClose} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Budget freeze');
    await submit('Add Risk');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(sent).toEqual([{ method: 'POST', path: '/accounts/12/risks/', body: expect.objectContaining({ title: 'Budget freeze' }) }]);
  });

  it('logs a survey on the account, with no CES', async () => {
    const sent = stubSaves();
    const onLogged = vi.fn();
    renderWithStore(<LogSurveyForm accountId={12} allowCes={false} onLogged={onLogged} onCancel={vi.fn()} />);
    expect(screen.queryByRole('option', { name: 'CES' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    expect(sent[0]).toMatchObject({ method: 'POST', path: '/accounts/12/surveys/', body: { survey_type: 'nps' } });
  });

  it('edits an account none of whose organisations the viewer may open on the flat route', async () => {
    const sent = stubSaves();
    const onClose = vi.fn();
    renderWithStore(<AccountFormModal account={accountFixture(initechApac)} onClose={onClose} />);
    await submit('Save changes');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(sent).toEqual([{ method: 'PATCH', path: '/accounts/14/', body: expect.objectContaining({ name: 'Initech APAC' }) }]);
  });

  it('still edits through the first organisation when there is one', async () => {
    const sent = stubSaves();
    const onClose = vi.fn();
    renderWithStore(<AccountFormModal account={accountFixture(pizzaEmea)} onClose={onClose} />);
    await submit('Save changes');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(sent[0]).toMatchObject({ method: 'PATCH', path: '/customers/7/accounts/12/' });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import customersReducer from '../../features/customers/customersSlice';
import { opportunityRecord, riskRecord } from '../../features/pipelines/pipelineKinds';
import { budgetFreeze, emeaSeats, recordWrites, stubPipelines } from '../../features/pipelines/testPipelines';
import { OpportunityFormModal } from './OpportunityFormModal';
import { RiskFormModal } from './RiskFormModal';

function renderForm(ui: ReactNode) {
  const store = configureStore({ reducer: { auth: authReducer, customers: customersReducer } });
  render(<Provider store={store}>{ui}</Provider>);
}

describe('the opportunity and risk forms (pipelines spec §1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers Closed Lost, edits the expected close, and calls onSaved after the edit', async () => {
    const spy = stubPipelines();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderForm(<OpportunityFormModal opportunity={opportunityRecord(emeaSeats)} onClose={onClose} onSaved={onSaved} />);
    expect(within(screen.getByLabelText('Stage')).getAllByRole('option').map((option) => option.textContent)).toContain('Closed Lost');
    const date = screen.getByLabelText('Expected close');
    expect(date).toHaveValue('2026-10-07');
    fireEvent.change(date, { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(recordWrites(spy)).toEqual([
      { method: 'PATCH', path: '/opportunities/41/', body: expect.objectContaining({ expected_close: '2026-11-01', stage: 'negotiation' }) },
    ]);
  });

  it('clears a due-by date as null', async () => {
    const spy = stubPipelines();
    const onSaved = vi.fn();
    renderForm(<RiskFormModal risk={riskRecord(budgetFreeze)} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Due by'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(recordWrites(spy)[0]).toMatchObject({ method: 'PATCH', path: '/risks/72/', body: { due_by: null } });
  });

  it('adds on a chosen organisation with its date, then calls onSaved', async () => {
    const spy = stubPipelines();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderForm(
      <OpportunityFormModal companies={[{ id: 7, name: 'Pizza Hut' }]} defaultStage="qualification" onClose={onClose} onSaved={onSaved} />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/^Company/), '7');
    await userEvent.type(screen.getByLabelText(/^Title/), 'Seats');
    fireEvent.change(screen.getByLabelText('Expected close'), { target: { value: '2026-12-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add Opportunity' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(recordWrites(spy)).toEqual([
      {
        method: 'POST',
        path: '/opportunities/',
        body: expect.objectContaining({ customer_id: 7, title: 'Seats', stage: 'qualification', expected_close: '2026-12-01' }),
      },
    ]);
  });
});

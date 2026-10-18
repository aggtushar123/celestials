import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer from '../../features/customers/customersSlice';
import { ChurnOrganizationModal } from './ChurnOrganizationModal';

// The reason field is the point of these tests: it was a free-text box, and
// the Customer Overview's "why they left" chart spent its life apologising
// for it — "Budget cuts" and "Budget Cut" were two rows nothing could merge.

function mockFetch() {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 1, name: 'WeWork' }) })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderModal(customerIds = [1], customerNames = ['WeWork']) {
  const store = configureStore({ reducer: { customers: customersReducer } });
  const onClose = vi.fn();
  const onChurned = vi.fn();
  render(
    <Provider store={store}>
      <ChurnOrganizationModal
        customerIds={customerIds}
        customerNames={customerNames}
        onClose={onClose}
        onChurned={onChurned}
      />
    </Provider>
  );
  return { onClose, onChurned };
}

const bodyOf = (spy: ReturnType<typeof mockFetch>, call = 0) =>
  JSON.parse(String(spy.mock.calls[call][1]?.body));

describe('ChurnOrganizationModal', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers the reasons as a list rather than a text box', async () => {
    mockFetch();
    renderModal();

    const reason = screen.getByLabelText('Reason');
    expect(reason.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Budget cut' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Switched to a competitor' })).toBeInTheDocument();
  });

  it('sends the stored value, not the label', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderModal();

    await user.selectOptions(screen.getByLabelText('Reason'), 'budget');
    await user.click(screen.getByRole('button', { name: 'Confirm Churn' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock).churn_reason).toBe('budget');
    expect(bodyOf(fetchMock).lifecycle_stage).toBe('churn');
  });

  it('lets a reason go unrecorded, which is not the same as Other', async () => {
    // Blank means nobody wrote down why — a gap in the CRM. "Other" is a CSM
    // saying none of the listed reasons fit.
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderModal();

    expect(screen.getByRole('option', { name: 'Not recorded' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm Churn' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock).churn_reason).toBe('');
  });

  it('keeps the comment for what the list cannot say', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderModal();

    await user.selectOptions(screen.getByLabelText('Reason'), 'champion_left');
    await user.type(
      screen.getByLabelText('Comment (optional)'),
      'Our exec sponsor moved to a competitor.'
    );
    await user.click(screen.getByRole('button', { name: 'Confirm Churn' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock).churn_comment).toBe('Our exec sponsor moved to a competitor.');
  });

  it('calls onChurned only after a churn succeeds, not on Cancel', async () => {
    mockFetch();
    const user = userEvent.setup();
    const { onClose, onChurned } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChurned).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm Churn' }));
    await waitFor(() => expect(onChurned).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('churns several organizations with the same reason', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderModal([1, 2], ['WeWork', 'Notion Labs']);

    await user.selectOptions(screen.getByLabelText('Reason'), 'price');
    await user.click(screen.getByRole('button', { name: 'Confirm Churn' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetchMock, 0).churn_reason).toBe('price');
    expect(bodyOf(fetchMock, 1).churn_reason).toBe('price');
  });
});

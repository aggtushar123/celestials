import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderSurveys } from './testPages';

const where = () => screen.getByTestId('where').textContent;

describe('Survey these (spec §2.5)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("sits in the header beside Edit on the owner's segment, and not on someone else's", async () => {
    stubSurveys();
    const first = renderSurveys('/segments/7');
    const link = await screen.findByRole('link', { name: 'Survey these' });
    expect(link).toHaveAttribute('href', '/segments/7/survey');
    expect(screen.getByRole('link', { name: 'Edit' }).compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    first.unmount();
    renderSurveys('/segments/8');
    expect(await screen.findByRole('heading', { level: 1, name: 'EMEA accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Survey these' })).toBeNull();
  });

  it('opens the New survey modal over the segment with that segment chosen, counts it, and Cancel returns to it', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/segments/7');
    await userEvent.click(await screen.findByRole('link', { name: 'Survey these' }));
    const modal = await screen.findByRole('dialog', { name: 'New survey' });
    expect(where()).toBe('/segments/7/survey');
    expect(screen.getByRole('heading', { level: 1, name: 'Renewal risk' })).toBeInTheDocument();
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Renewal risk'));
    expect(within(modal).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    await waitFor(() => expect(modal.querySelector('[data-part="reach"]')).toHaveTextContent('3 people at 3 organisations'));
    expect(requestsOf(spy, 'POST', /audience\/$/)[0].body).toEqual({ segment: 7, roles: ['champion', 'decision_maker'] });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/segments/7'));
  });

  it("tells a reader who doesn't own the segment that only its owner can survey it", async () => {
    stubSurveys();
    renderSurveys('/segments/8/survey');
    const modal = await screen.findByRole('dialog', { name: 'New survey' });
    expect(within(modal).getByText('Only Carl CSM can survey this segment')).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: 'Open segment' })).toHaveAttribute('href', '/segments/8');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../../../components/copilot/testCopilot';
import { resetViewport } from '../../../test/viewport';
import { renderPipelines } from '../testPages';
import { stubPipelinesAsk } from './testPipelinesAsk';

// Integration tier: "Ask about this" on the real List and Board under
// PipelinesAskLayout, the real rail and sheet, store and router; fetch
// answers the book and the Copilot (feat/pipelines-ask, #79). Opening an
// item or card narrows nothing (plan Decision 8); only this button focuses.
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact') as HTMLInputElement;
const kinds = () => screen.getByRole('group', { name: 'Opportunities or risks' });
const LIST = { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {} };

describe('Ask about this on Pipelines', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('types a question about a List item, focused on it for one question, and opens no form', async () => {
    const { copilot } = stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA seats' }));
    expect(await within(rail()).findByText('Pipelines · Opportunities · This opportunity')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this opportunity?');
    expect(within(rail()).getByRole('button', { name: 'Remove focus' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit EMEA seats' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(0);

    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this opportunity?');
    expect(postedBodies(copilot)[0].context).toEqual({ ...LIST, focus: { kind: 'opportunity', id: 41 } });
    // Spent by the send: the chip is the list again, and so is the next question.
    expect(within(rail()).getByText('Pipelines · Opportunities')).toBeInTheDocument();
    await userEvent.type(composer(), 'And the rest?{enter}');
    await screen.findByText('Answer to: And the rest?');
    expect(postedBodies(copilot)[1].context).toEqual(LIST);
  });

  it('opening an item narrows nothing: the question after its form is about the list', async () => {
    const { copilot } = stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'EMEA seats' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit EMEA seats' })).not.toBeInTheDocument());
    expect(within(rail()).getByText('Pipelines · Opportunities')).toBeInTheDocument();
    await userEvent.type(composer(), 'What is open?{enter}');
    await screen.findByText('Answer to: What is open?');
    expect(postedBodies(copilot)[0].context).toEqual(LIST);
  });

  it('opens the rail below xl with the question about a Board card', async () => {
    const { copilot } = stubPipelinesAsk();
    renderPipelines('/pipelines/board?kind=risks', { ask: true, width: 1100 });
    expect(screen.queryByRole('complementary', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Admin left' }));
    expect(await within(rail()).findByText('Pipelines · Risks · This risk')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this risk?');
    await userEvent.type(composer(), '{enter}');
    await screen.findByText('Answer to: What should I know about this risk?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'pipelines', kind: 'risks', view: 'board', filters: {}, focus: { kind: 'risk', id: 71 } });
  });

  it('opens the sheet with the question on a phone', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true, width: 375 });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Globex uplift' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ask Revenact' });
    expect(within(sheet).getByText('Pipelines · Opportunities · This opportunity')).toBeInTheDocument();
    expect(within(sheet).getByPlaceholderText('Ask Revenact')).toHaveValue('What should I know about this opportunity?');
  });

  it('drops an unsent focus and its untouched question when the kind changes', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list', { ask: true, nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA seats' }));
    await within(rail()).findByText('Pipelines · Opportunities · This opportunity');
    await userEvent.click(within(kinds()).getByRole('button', { name: 'Risks' }));
    expect(await within(rail()).findByText('Pipelines · Risks')).toBeInTheDocument();
    expect(composer()).toHaveValue('');
  });

  it('refuses an item the asker can no longer read, and the next question is about the list', async () => {
    const { copilot } = stubPipelinesAsk({ copilot: { refuse: { focus: ['Not an opportunity or risk you can open.'] } } });
    renderPipelines('/pipelines/list', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: EMEA seats' }));
    await userEvent.type(composer(), '{enter}');
    expect(await within(rail()).findByRole('alert')).toHaveTextContent('You can no longer ask about this opportunity.');
    expect(within(rail()).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    await waitFor(() => expect(within(rail()).getByText('Pipelines · Opportunities')).toBeInTheDocument());
    expect(postedBodies(copilot)).toHaveLength(1);
    expect(postedBodies(copilot)[0].context).toEqual({ ...LIST, focus: { kind: 'opportunity', id: 41 } });
    await userEvent.type(composer(), 'And the rest?{enter}');
    await screen.findByText('Answer to: And the rest?');
    expect(postedBodies(copilot)).toHaveLength(2);
    expect(postedBodies(copilot)[1].context).toEqual(LIST);
  });

  it('is not offered outside the Ask layout', async () => {
    stubPipelinesAsk();
    renderPipelines('/pipelines/list');
    await screen.findByRole('button', { name: 'EMEA seats' });
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});

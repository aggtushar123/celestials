import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postedBodies } from '../components/copilot/testCopilot';
import { stubPipelinesAsk } from '../pages/pipelines/ask/testPipelinesAsk';
import { renderPipelines } from '../pages/pipelines/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Pipelines List and Board
// under PipelinesAskLayout, with the real Navbar, rail and pill, store and
// router. Only fetch is stubbed: the Pipelines book and the Copilot's
// (stubPipelinesAsk), in the backend's shapes (feat/pipelines-ask, #79).
const rail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });
const composer = () => screen.getByPlaceholderText('Ask Revenact');
const where = () => screen.getByTestId('where').textContent;
const views = () => screen.getByRole('navigation', { name: 'Pipelines views' });
const kinds = () => screen.getByRole('group', { name: 'Opportunities or risks' });

// The conversation as History lists it after the journey below: its origin
// is the first Ask context (the List's) without its focus, labelled by the server.
const ASKED = {
  id: 16,
  title: 'What should I chase?',
  created_at: '',
  updated_at: '',
  origin: { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2' }, label: 'Pipelines · Opportunities · Owner: Carl CSM' },
};

describe('Ask Revenact on Pipelines, end to end (spec 2026-09-30 §3)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('asks on the List, the Board and the risks in one conversation, asks about a risk, and lists it in History tagged with the server label and the Pipelines icon', { timeout: 30000 }, async () => {
    const { copilot } = stubPipelinesAsk({ copilot: { conversations: [ASKED] } });
    renderPipelines('/pipelines/list?owner=2', { width: 1440, nav: true, ask: true });
    await screen.findByRole('button', { name: 'EMEA seats' });

    // 1. The List: the chip names Carl; the question carries the kind and the filter.
    expect(await within(rail()).findByText('Pipelines · Opportunities · Owner: Carl CSM')).toBeInTheDocument();
    await userEvent.type(composer(), 'What should I chase?{Enter}');
    await screen.findByText('Answer to: What should I chase?');
    expect(postedBodies(copilot)[0].context).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2' } });

    // 2. The Board, carrying the query: the same conversation, the Board's view.
    await userEvent.click(within(views()).getByRole('link', { name: 'Board' }));
    expect(where()).toBe('/pipelines/board?owner=2');
    await userEvent.type(composer(), 'What closes this month?{Enter}');
    await screen.findByText('Answer to: What closes this month?');
    expect(screen.getByText('Answer to: What should I chase?')).toBeInTheDocument();
    expect(postedBodies(copilot)[1].context).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'board', filters: { owner: '2' } });

    // 3. Risks, keeping the owner: the chip follows the kind; the conversation stays.
    await userEvent.click(within(kinds()).getByRole('button', { name: 'Risks' }));
    expect(where()).toBe('/pipelines/board?owner=2&kind=risks');
    expect(await within(rail()).findByText('Pipelines · Risks · Owner: Carl CSM')).toBeInTheDocument();
    expect(screen.getByText('Answer to: What closes this month?')).toBeInTheDocument();

    // 4. "Ask about this" on a risk card: typed in, not sent, no form; sending names it.
    await userEvent.click(await screen.findByRole('button', { name: 'Ask about this: Admin left' }));
    expect(await within(rail()).findByText('Pipelines · Risks · Owner: Carl CSM · This risk')).toBeInTheDocument();
    expect(composer()).toHaveValue('What should I know about this risk?');
    expect(screen.queryByRole('heading', { name: 'Edit Admin left' })).not.toBeInTheDocument();
    expect(postedBodies(copilot)).toHaveLength(2);
    await userEvent.type(composer(), '{Enter}');
    await screen.findByText('Answer to: What should I know about this risk?');
    expect(postedBodies(copilot)[2].context).toEqual({
      surface: 'pipelines',
      kind: 'risks',
      view: 'board',
      filters: { owner: '2' },
      focus: { kind: 'risk', id: 71 },
    });

    // 5. History lists it, tagged with the server's label and the Pipelines icon.
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    const item = await screen.findByRole('button', { name: /What should I chase\?/ });
    expect(item).toHaveAccessibleName(/What should I chase\?\s*Started on Pipelines · Opportunities · Owner: Carl CSM/);
    expect(item.querySelector('svg.lucide-target')).not.toBeNull();
  });
});

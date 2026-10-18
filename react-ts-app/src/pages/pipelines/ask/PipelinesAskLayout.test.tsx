import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { OPPORTUNITIES_KIND } from '../../../features/pipelines/pipelineKinds';
import { OPPORTUNITY_ROWS, pipelineFilterOptions } from '../../../features/pipelines/testPipelines';
import { useAsk } from '../../dashboard/ask/useAsk';
import { PipelinesAskLayout } from './PipelinesAskLayout';
import { useReportPipelineOptions } from './pipelinesNames';

const OPTIONS = pipelineFilterOptions(OPPORTUNITY_ROWS, OPPORTUNITIES_KIND);

/** Stands in for a Pipelines view: it reports the opportunities read's
 *  options whatever the URL's kind, so a mismatch shows. */
function Page({ name }: { name: string }) {
  const ask = useAsk()!;
  useReportPipelineOptions('opportunities', OPTIONS);
  const { context, chipLabel } = ask.surface;
  return (
    <div>
      <p data-testid="page">{name}</p>
      <p data-testid="surface">{ask.surface.name}</p>
      <p data-testid="context">{JSON.stringify(context)}</p>
      <p data-testid="chip">{context ? chipLabel(context) : 'none'}</p>
      <p data-testid="conversation">{ask.conversation?.title ?? 'none'}</p>
      <button type="button" onClick={() => ask.setConversation({ id: 3, title: 'Kept', created_at: '', updated_at: '', messages: [] })}>
        Start
      </button>
      <Link to="/pipelines/board?owner=2">Board</Link>
      <Link to="/pipelines/board?owner=2&kind=risks">Risks</Link>
    </div>
  );
}

function renderLayout(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/pipelines" element={<PipelinesAskLayout />}>
          <Route path="list" element={<Page name="List" />} />
          <Route path="board" element={<Page name="Board" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const context = () => JSON.parse(screen.getByTestId('context').textContent!);

describe('PipelinesAskLayout', () => {
  it('asks from the pipelines surface, naming filters from the options a page reports', async () => {
    renderLayout('/pipelines/list?owner=2');
    expect(screen.getByTestId('surface')).toHaveTextContent('pipelines');
    expect(context()).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2' } });
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Pipelines · Opportunities · Owner: Carl CSM'));
  });

  it("names nothing from a read of the other kind", async () => {
    renderLayout('/pipelines/list?kind=risks&owner=2');
    // The page reported opportunities' options: on risks they name nothing.
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Pipelines · Risks · Owner: User 2'));
  });

  it('keeps one conversation across the List, the Board and both kinds', async () => {
    renderLayout('/pipelines/list');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(screen.getByRole('link', { name: 'Board' }));
    expect(screen.getByTestId('page')).toHaveTextContent('Board');
    expect(context()).toEqual({ surface: 'pipelines', kind: 'opportunities', view: 'board', filters: { owner: '2' } });
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
    await userEvent.click(screen.getByRole('link', { name: 'Risks' }));
    expect(context()).toEqual({ surface: 'pipelines', kind: 'risks', view: 'board', filters: { owner: '2' } });
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
  });
});

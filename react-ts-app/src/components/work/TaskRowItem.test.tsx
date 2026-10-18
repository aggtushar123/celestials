import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CARL_CHASE, ERIN_OLD, KICKOFF, QBR_DECK, SECURITY, TODAY } from '../../features/work/testWorkFixtures';
import type { TaskRow } from '../../features/work/workTypes';
import { TaskRowItem } from './TaskRowItem';

function renderRow(row: TaskRow, props: Partial<Parameters<typeof TaskRowItem>[0]> = {}) {
  render(
    <MemoryRouter initialEntries={['/work/team?scope=team']}>
      <ul>
        <TaskRowItem row={row} today={TODAY} {...props} />
      </ul>
    </MemoryRouter>,
  );
  return screen.getByRole('listitem');
}

describe('TaskRowItem', () => {
  it('opens its task on the page it is on, and links its record', () => {
    const row = renderRow(CARL_CHASE, { showAssignee: true });
    expect(within(row).getByRole('link', { name: 'Chase the exec sponsor' })).toHaveAttribute('href', '/work/team?scope=team&task=46');
    expect(within(row).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(within(row).getByRole('link', { name: 'Pizza Hut' })).toHaveClass('before:h-11');
    expect(within(row).getByRole('link', { name: 'Pizza Hut' })).not.toHaveClass('min-h-11');
    expect(row.querySelector('[data-part="meta"]')).toHaveTextContent('Pizza Hut · Due 3 Oct 2026 · Overdue · High priority · Carl CSM');
    // The whole date carries tabular figures in the body font.
    const figures = Array.from(row.querySelectorAll('.tabular-nums'));
    expect(figures.map((el) => el.textContent)).toEqual(['3 Oct 2026']);
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('shows Blocked with its reason, never as Overdue', () => {
    const row = renderRow(SECURITY);
    expect(row.querySelector('[data-part="blocked"]')).toHaveTextContent('Blocked: Waiting on legal');
    expect(row.querySelector('[data-part="meta"]')).not.toHaveTextContent('Overdue');
  });

  it('says In progress', () => {
    expect(renderRow(QBR_DECK).querySelector('[data-part="meta"]')).toHaveTextContent('In progress');
  });

  it('names a plan task’s plan and a deactivated assignee', () => {
    render(
      <MemoryRouter>
        <ul>
          <TaskRowItem row={KICKOFF} today={TODAY} />
          <TaskRowItem row={ERIN_OLD} today={TODAY} showAssignee />
        </ul>
      </MemoryRouter>,
    );
    const [kickoff, erin] = screen.getAllByRole('listitem');
    expect(kickoff).toHaveTextContent('From Onboarding · Pizza Hut');
    expect(erin).toHaveTextContent('Unassigned (was Erin Former)');
  });

  it('offers a 44px quick Done, disabled while it saves, with its error under the row', async () => {
    const onDone = vi.fn();
    const row = renderRow(CARL_CHASE, { onDone, error: 'Could not mark that done. Try again.' });
    const done = within(row).getByRole('button', { name: 'Mark “Chase the exec sponsor” done' });
    expect(done).toHaveClass('min-h-11', 'min-w-11', 'sm:min-h-9', 'sm:min-w-9');
    await userEvent.click(done);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(within(row).getByRole('alert')).toHaveTextContent('Could not mark that done. Try again.');
  });
});

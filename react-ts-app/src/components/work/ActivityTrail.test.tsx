import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { taskEvent } from '../../features/work/testWorkFixtures';
import { makeRulesStore } from '../../pages/rules/testPages';
import { ActivityTrail } from './ActivityTrail';

const renderTrail = (events: Parameters<typeof ActivityTrail>[0]['events']) =>
  render(
    <Provider store={makeRulesStore('csm')}>
      <ActivityTrail events={events} />
    </Provider>,
  );

describe('ActivityTrail (spec §1.5: written in plain sentences)', () => {
  it('writes each event for the reader, oldest first, with a comment’s words under it', () => {
    renderTrail([
      taskEvent(1, 'created', { id: 2, name: 'Mona Manager' }, { source: 'manual', assignee: { id: 1, name: 'Alice' } }),
      taskEvent(2, 'status', { id: 1, name: 'Alice' }, { from: 'pending', to: 'blocked', reason: 'Waiting on legal' }),
      taskEvent(3, 'comment', { id: 1, name: 'Alice' }, {}, 'Chased legal again.'),
    ]);
    const items = within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Mona Manager created this task for you.',
      'You marked it blocked: Waiting on legal',
      'You commented',
    ]);
    expect(items[2]).toHaveTextContent('Chased legal again.');
    expect(items[0].querySelector('time')).toHaveAttribute('dateTime', '2026-10-07T10:00:00.000000Z');
  });

  it('says when nothing is recorded (tasks from before the trail existed)', () => {
    renderTrail([]);
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
  });
});

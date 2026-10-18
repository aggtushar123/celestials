import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoveToMenu } from './MoveToMenu';

describe('MoveToMenu', () => {
  it('keeps its move words by default', async () => {
    render(<MoveToMenu name="Pizza Hut" disabled={false} note={null} targets={[{ value: 'live', label: 'Live' }]} onChoose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Pizza Hut to…' }));
    expect(screen.getByRole('menu', { name: 'Move Pizza Hut to' })).toBeInTheDocument();
  });

  it('takes its own button and menu names for another menu, and reports the choice', async () => {
    const onChoose = vi.fn();
    render(
      <MoveToMenu
        name="Pizza Hut"
        disabled={false}
        note={null}
        targets={[{ value: 'pinned', label: 'Pin' }]}
        onChoose={onChoose}
        label="Actions for Pizza Hut"
        menuLabel="Pizza Hut actions"
        icon={<span aria-hidden="true">…</span>}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Pizza Hut actions' })).getByRole('menuitem', { name: 'Pin' }));
    expect(onChoose).toHaveBeenCalledWith('pinned');
  });
});

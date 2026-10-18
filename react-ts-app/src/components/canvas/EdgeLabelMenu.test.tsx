import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EdgeLabelMenu } from './EdgeLabelMenu';

describe('EdgeLabelMenu (spec §2.2: a small menu with the four labels plus No label)', () => {
  it('picks a label from the menu', async () => {
    const onPick = vi.fn();
    render(<EdgeLabelMenu label="" sentence="Rosa Diaz is linked to Tom Lee" editable selected={false} onPick={onPick} onRemove={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Relationship: No label. Rosa Diaz is linked to Tom Lee' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Reports to', 'Introduced by', 'Blocks', 'Influences', 'No label']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Blocks' }));
    expect(onPick).toHaveBeenCalledWith('Blocks');
  });

  it('offers Remove only on a selected line', async () => {
    const onRemove = vi.fn();
    const { rerender } = render(<EdgeLabelMenu label="Blocks" sentence="Rosa Diaz blocks Tom Lee" editable selected={false} onPick={() => {}} onRemove={onRemove} />);
    expect(screen.queryByRole('button', { name: 'Remove the line: Rosa Diaz blocks Tom Lee' })).toBeNull();
    rerender(<EdgeLabelMenu label="Blocks" sentence="Rosa Diaz blocks Tom Lee" editable selected onPick={() => {}} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove the line: Rosa Diaz blocks Tom Lee' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows a read-only label as text, and nothing for no label', () => {
    const { rerender } = render(<EdgeLabelMenu label="Influences" sentence="x" editable={false} selected={false} onPick={() => {}} onRemove={() => {}} />);
    expect(screen.getByText('Influences')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<EdgeLabelMenu label="" sentence="x" editable={false} selected={false} onPick={() => {}} onRemove={() => {}} />);
    expect(screen.queryByText('No label')).toBeNull();
  });
});

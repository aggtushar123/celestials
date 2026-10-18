import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationSearch } from './ConversationSearch';
import { ComposeButton } from './ComposeButton';

describe('ConversationSearch', () => {
  it('reports typing and submits the draft on enter', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<ConversationSearch value="renew" onChange={onChange} onSubmit={onSubmit} />);
    const box = screen.getByRole('searchbox', { name: 'Search all conversations' });
    await userEvent.type(box, 'a');
    expect(onChange).toHaveBeenCalledWith('renewa');
    await userEvent.type(box, '{enter}');
    expect(onSubmit).toHaveBeenCalledWith('renew');
    expect(screen.getByText('/')).toBeInTheDocument();
  });
});

describe('ComposeButton', () => {
  it('is disabled with the reason as its title, and clickable without one', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<ComposeButton onClick={onClick} disabledReason="Connect a mailbox to compose" />);
    const button = screen.getByRole('button', { name: 'Compose' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Connect a mailbox to compose');
    rerender(<ComposeButton onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Compose' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

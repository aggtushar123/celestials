import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AskDraftContext } from '../../pages/dashboard/ask/context';
import { AskAboutButton } from './AskAboutButton';

function renderButton(draft: ((question: string, focus: unknown) => void) | null, onParent = vi.fn()) {
  render(
    <AskDraftContext.Provider value={draft}>
      <div onClick={onParent}>
        <AskAboutButton name="EMEA seats" question="What should I know about this opportunity?" focus={{ kind: 'opportunity', id: 41 }} className="ml-auto" />
      </div>
    </AskDraftContext.Provider>,
  );
  return onParent;
}

describe('AskAboutButton', () => {
  it('prefills the question, focused on the item, without the click reaching what it sits in', async () => {
    const draft = vi.fn();
    const onParent = renderButton(draft);
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this: EMEA seats' }));
    expect(draft).toHaveBeenCalledWith('What should I know about this opportunity?', { kind: 'opportunity', id: 41 });
    expect(onParent).not.toHaveBeenCalled();
  });

  it('is a quiet 11px, 44px target on phones and 36px from sm, with a hidden icon', () => {
    renderButton(vi.fn());
    const button = screen.getByRole('button', { name: 'Ask about this: EMEA seats' });
    expect(button).toHaveClass('min-h-11', 'sm:min-h-9', 'text-[11px]', 'text-ink-muted', 'ml-auto');
    expect(button).toHaveAttribute('draggable', 'false');
    expect(button).toHaveTextContent('Ask about this');
    // Icon-only on phones: the words stay for screen readers, shown from sm.
    expect(screen.getByText('Ask about this')).toHaveClass('max-sm:sr-only');
    expect(button).toHaveClass('max-sm:min-w-11');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is not offered outside an Ask provider', () => {
    renderButton(null);
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});

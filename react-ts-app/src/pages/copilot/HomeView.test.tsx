import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { type User } from '../../features/auth/authSlice';
import { HomeView } from './HomeView';
import { SKILLS } from './skillsCatalog';

vi.mock('../../components/shared/MentionTextarea', () => ({
  MentionTextarea: ({ value, onChange, onSubmit, ...rest }: { value: string; onChange: (v: string) => void; onSubmit?: () => void; [k: string]: unknown }) => (
    <textarea
      {...(rest as object)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit?.();
      }}
    />
  ),
}));

function renderHome(props: Partial<React.ComponentProps<typeof HomeView>> = {}) {
  const user = { id: 1, email: 'alice@acme.io', name: 'Alice Admin', permissions: [], organisation: { id: 1, name: 'Acme', slug: 'acme' }, is_active: true } as unknown as User;
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user, accessToken: 'a', refreshToken: 'r', isAuthenticated: true, isLoading: false, error: null } },
  });
  const onSendPrompt = vi.fn();
  const onSelectSkill = vi.fn();
  render(
    <Provider store={store}>
      <HomeView onSendPrompt={onSendPrompt} onSelectSkill={onSelectSkill} {...props} />
    </Provider>
  );
  return { onSendPrompt, onSelectSkill };
}

describe('Copilot home', () => {
  it('greets the person by first name and offers the ask box', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Alice\.$/);
    expect(screen.getByLabelText('Message Copilot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('sends what was typed, trimmed', async () => {
    const { onSendPrompt } = renderHome();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Message Copilot'), '  Which renewals are at risk?  ');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSendPrompt).toHaveBeenCalledWith('Which renewals are at risk?');
  });

  it('a suggestion is a real question sent as-is', async () => {
    const { onSendPrompt } = renderHome();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'What changed in my accounts this week?' }));
    expect(onSendPrompt).toHaveBeenCalledWith('What changed in my accounts this week?');
  });

  it('filters skills by category and selects one', async () => {
    const { onSelectSkill } = renderHome();
    const user = userEvent.setup();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(SKILLS.length);
    await user.click(screen.getByRole('tab', { name: 'Product' }));
    expect(screen.getByText('Deep dive on product...')).toBeInTheDocument();
    expect(screen.queryByText('Internal Business Review')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Deep dive on product/ }));
    expect(onSelectSkill).toHaveBeenCalledWith('Deep dive on product...');
  });

  it('shows the chosen skill and runs it', async () => {
    const { onSendPrompt, onSelectSkill } = renderHome({ selectedSkill: 'Quick Start Brief' });
    const user = userEvent.setup();
    expect(screen.getByRole('heading', { name: 'Quick Start Brief' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Message Copilot')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run skill' }));
    expect(onSendPrompt).toHaveBeenCalledWith(expect.stringContaining('Run the "Quick Start Brief" skill'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSelectSkill).toHaveBeenCalledWith(null);
  });
});

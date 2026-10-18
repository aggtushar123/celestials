import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScopeOption } from '../../features/brain/brainTypes';
import { resetViewport, setViewport } from '../../test/viewport';
import { ScopeSwitch } from './ScopeSwitch';

const ALL: ScopeOption[] = [{ key: 'me', label: 'Me' }, { key: 'team', label: 'My team' }, { key: 'company', label: 'Company' }];

describe('ScopeSwitch (spec §2.2)', () => {
  afterEach(() => resetViewport());

  it('is a segmented control of the offered scopes, the current one pressed', async () => {
    setViewport(1024);
    const onChange = vi.fn();
    render(<ScopeSwitch scopes={ALL} value="team" onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'View' });
    expect(group).toHaveTextContent('MeMy teamCompany');
    expect(screen.getByRole('button', { name: 'My team' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    expect(onChange.mock.calls).toEqual([['company']]);
  });

  it('stays a segmented control below sm, never a select', async () => {
    setViewport(375);
    const onChange = vi.fn();
    render(<ScopeSwitch scopes={ALL} value="me" onChange={onChange} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(onChange).toHaveBeenCalledWith('company');
  });

  it('shows a single scope as a label, not a control', () => {
    setViewport(1024);
    render(<ScopeSwitch scopes={[{ key: 'me', label: 'Me' }]} value="me" onChange={vi.fn()} />);
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

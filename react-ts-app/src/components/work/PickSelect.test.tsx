import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PickSelect } from './PickSelect';
import type { PickState } from './usePickList';

// Frontend Decision 3: a tool's list as a select. No fetch: the state is given.
const ONE: PickState = { status: 'ready', options: [{ id: 'SUP', name: 'Support', detail: 'SUP' }], more: false, note: null };

function draw(state: PickState, onChange = vi.fn(), none?: string) {
  render(<PickSelect id="p" label="Project" list="jira_projects" state={state} retry={() => undefined} value={null} onChange={onChange} none={none} />);
  return onChange;
}

describe('PickSelect', () => {
  it('with nothing stored and no none choice it starts on Choose…, so the only option can be picked', async () => {
    const onChange = draw(ONE);
    const select = screen.getByRole('combobox', { name: 'Project' }) as HTMLSelectElement;
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Support (SUP)']);
    expect(select.value).toBe('');
    await userEvent.selectOptions(select, 'SUP');
    expect(onChange).toHaveBeenCalledWith({ id: 'SUP', name: 'Support' });
  });

  it('choosing Choose… does nothing', async () => {
    const onChange = draw(ONE);
    const select = screen.getByRole('combobox', { name: 'Project' });
    await userEvent.selectOptions(select, 'SUP');
    onChange.mockClear();
    await userEvent.selectOptions(select, '');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a none choice stands in for Choose…', () => {
    draw(ONE, vi.fn(), "Jira's default");
    expect(within(screen.getByRole('combobox', { name: 'Project' })).getAllByRole('option').map((o) => o.textContent)).toEqual(["Jira's default", 'Support (SUP)']);
  });

  it('the loading line is announced', () => {
    draw({ status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading Jira projects…');
  });

  it('an empty list is announced', () => {
    draw({ status: 'ready', options: [], more: false, note: null });
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to choose from.');
  });

  it('draws no error of its own when quiet', () => {
    render(<PickSelect id="p" label="Project" list="jira_projects" state={{ status: 'failed', message: "Couldn't reach Jira. Try again." }} retry={vi.fn()} value={{ id: 'SUP', name: 'SUP' }} onChange={vi.fn()} quiet />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Project' })).toBeInTheDocument();
  });
});

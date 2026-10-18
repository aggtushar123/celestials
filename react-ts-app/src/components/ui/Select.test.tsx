import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

type Sort = 'name' | 'arr';
const OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'arr', label: 'ARR' },
] as const;

function Harness({ position, disabled }: { position?: 'above' | 'inline' | 'hidden'; disabled?: boolean }) {
  const [value, setValue] = useState<Sort>('name');
  return <Select label="Sort by" labelPosition={position} value={value} onChange={setValue} options={OPTIONS} disabled={disabled} />;
}

describe('Select (UI foundations spec §5.5)', () => {
  it('is a labelled native select in the house frame, label above by default', async () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    expect(select).toHaveClass('min-h-11', 'sm:min-h-9', 'appearance-none', 'rounded-lg', 'border-line', 'bg-surface', 'pr-8', 'text-[13px]');
    expect(screen.getByText('Sort by')).toHaveClass('text-[13px]', 'font-semibold');
    await userEvent.selectOptions(select, 'arr');
    expect(select).toHaveValue('arr');
  });

  it('puts the label inline in muted body text, or hides it', () => {
    const { unmount } = render(<Harness position="inline" />);
    expect(screen.getByText('Sort by')).toHaveClass('text-ink-muted', 'shrink-0');
    expect(screen.getByText('Sort by').parentElement).toHaveClass('flex', 'items-center');
    unmount();
    render(<Harness position="hidden" />);
    expect(screen.getByText('Sort by')).toHaveClass('sr-only');
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
  });

  it('disables with tokens, not opacity', () => {
    render(<Harness disabled />);
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    expect(select).toBeDisabled();
    expect(select).toHaveClass('disabled:bg-subtle', 'disabled:text-ink-faint');
    expect(select.className).not.toMatch(/opacity/);
  });
  it('keeps an inline select at its own width, so a toolbar row wraps rather than clipping it', () => {
    render(
      <Select
        label="Sort by"
        labelPosition="inline"
        value="mrr"
        onChange={() => {}}
        options={[
          { value: 'mrr', label: 'MRR' },
          { value: 'close', label: 'Expected close date' },
        ]}
      />,
    );
    expect(screen.getByText('Sort by').parentElement).toHaveClass('flex', 'shrink-0', 'items-center');
  });

  it('sits inside an outside label (external): no label of its own, named by that label', () => {
    render(
      <>
        <label htmlFor="who">Who</label>
        <Select id="who" label="Who" labelPosition="external" value="me" onChange={() => {}} options={[{ value: 'me', label: 'Me' }]} className="w-56" />
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Who' });
    expect(select).toHaveAttribute('id', 'who');
    expect(document.querySelectorAll('label')).toHaveLength(1);
    expect(select.parentElement).toHaveClass('relative', 'w-56');
  });

  it('marks an invalid choice, points at its error, and shows a disabled option it will not take', () => {
    render(
      <>
        <Select
          label="Status"
          labelPosition="hidden"
          value="on_track"
          invalid
          describedBy="status-error"
          onChange={() => {}}
          options={[
            { value: 'on_track', label: 'On track' },
            { value: 'done', label: 'Done', disabled: true },
          ]}
          className="w-40"
        />
        <p id="status-error">Not every milestone is done.</p>
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Not every milestone is done.');
    expect(select).toHaveClass('aria-[invalid=true]:border-danger');
    expect(screen.getByRole('option', { name: 'Done' })).toBeDisabled();
    expect(select.closest('.w-40')).not.toBeNull();
  });

  it('groups options under their optgroup labels', () => {
    render(
      <Select
        label="Field"
        labelPosition="hidden"
        value="arr"
        onChange={() => {}}
        options={[
          { label: 'Fields', options: [{ value: 'arr', label: 'ARR' }] },
          { label: 'AI attributes', options: [{ value: 'tone', label: 'Tone' }] },
        ]}
      />,
    );
    const group = document.querySelector('optgroup[label="AI attributes"]')!;
    expect(group).toContainElement(screen.getByRole('option', { name: 'Tone' }));
    expect(screen.getByRole('combobox', { name: 'Field' })).toHaveValue('arr');
  });
});

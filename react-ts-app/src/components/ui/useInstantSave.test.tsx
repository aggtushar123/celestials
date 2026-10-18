import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './Toast';
import { INSTANT, useInstantSave, type InstantChange } from './useInstantSave';

function Probe({ change }: { change: InstantChange<string> }) {
  const { busyKey, run } = useInstantSave();
  return (
    <>
      <button type="button" onClick={() => void run(change)}>
        Change
      </button>
      <p data-testid="busy">{busyKey ?? ''}</p>
    </>
  );
}

const renderProbe = (change: InstantChange<string>) =>
  render(
    <ToastProvider>
      <Probe change={change} />
    </ToastProvider>,
  );

describe('useInstantSave (settings production spec §5.4, §10.5)', () => {
  it('saves, reports the answer, then offers Undo that sends the previous value', async () => {
    const onSaved = vi.fn();
    const onUndone = vi.fn();
    const undo = vi.fn().mockResolvedValue('old');
    renderProbe({ key: 'tone', request: () => Promise.resolve('new'), onSaved, undo, onUndone, onError: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onSaved).toHaveBeenCalledWith('new');
    expect(screen.getByRole('status')).toHaveTextContent(INSTANT.SAVED);
    await userEvent.click(screen.getByRole('button', { name: INSTANT.UNDO }));
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith('old'));
    expect(screen.getByRole('status')).toHaveTextContent(INSTANT.UNDONE);
  });

  it('marks the control busy while it runs and sends one request at a time', async () => {
    let finish: (value: string) => void = () => {};
    const request = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    renderProbe({ key: 'tone', request, onSaved: vi.fn(), onError: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByTestId('busy')).toHaveTextContent('tone');
    expect(request).toHaveBeenCalledTimes(1);
    finish('done');
    await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent(''));
  });

  it('hands a refusal to onError and shows no toast', async () => {
    const onError = vi.fn();
    const failure = new Error('no');
    renderProbe({ key: 'tone', request: () => Promise.reject(failure), onSaved: vi.fn(), onError });
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('says so when the undo fails', async () => {
    renderProbe({ key: 'tone', request: () => Promise.resolve('new'), onSaved: vi.fn(), undo: () => Promise.reject(new Error('x')), onError: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: INSTANT.UNDO }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(INSTANT.UNDO_FAILED));
  });
});

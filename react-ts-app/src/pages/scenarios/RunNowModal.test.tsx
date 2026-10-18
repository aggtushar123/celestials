import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunNowModal } from './RunNowModal';

describe('RunNowModal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts focus on the dialog while the organisations load, not on the disabled select', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<RunNowModal onRun={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Run now' });
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(dialog);
  });
});

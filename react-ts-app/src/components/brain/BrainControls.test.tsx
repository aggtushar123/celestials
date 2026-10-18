import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ScopesPayload } from '../../features/brain/brainTypes';
import { SlotHost } from '../../test/SlotHost';
import { resetViewport, setViewport } from '../../test/viewport';
import { BrainControls } from './BrainControls';
import type { BrainScope } from './useBrainScope';

const OFFERED: ScopesPayload = {
  scopes: [
    { key: 'me', label: 'Me' },
    { key: 'team', label: 'My team' },
    { key: 'company', label: 'Company' },
  ],
  default: 'company',
};
type Controls = Pick<BrainScope, 'offered' | 'scope' | 'choose'>;
const brain = (over: Partial<Controls> = {}): Controls => ({ offered: OFFERED, scope: 'team', choose: vi.fn(), ...over });

describe('BrainControls (brain UI spec §1.2)', () => {
  afterEach(resetViewport);

  it('puts the scope in the bar’s actions slot from sm, as a segmented control before the Ask controls', () => {
    setViewport(1440);
    render(
      <SlotHost bare>
        <main>
          <BrainControls brain={brain()} />
        </main>
      </SlotHost>,
    );
    const slot = screen.getByTestId('nav-actions');
    const group = within(slot).getByRole('group', { name: 'View' });
    expect(within(group).getByRole('button', { name: 'My team' })).toHaveAttribute('aria-pressed', 'true');
    expect(group.closest('[data-page-actions="bar"]')).toHaveClass('order-first', 'mr-3');
    expect(within(screen.getByRole('main')).queryByRole('group', { name: 'View' })).toBeNull();
  });

  it('stays a segmented control in place on a phone, never a select', () => {
    setViewport(375);
    render(
      <SlotHost bare>
        <main>
          <BrainControls brain={brain()} />
        </main>
      </SlotHost>,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    const group = within(screen.getByRole('main')).getByRole('group', { name: 'View' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(group.closest('[data-page-actions="inline"]')).not.toBeNull();
  });

  it('renders inline when there is no slot (a page rendered on its own)', () => {
    setViewport(1440);
    render(
      <main>
        <BrainControls brain={brain()} />
      </main>,
    );
    expect(within(screen.getByRole('main')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });

  it('renders nothing until the scope settles', () => {
    setViewport(1440);
    render(
      <SlotHost bare>
        <BrainControls brain={brain({ scope: null })} />
      </SlotHost>,
    );
    expect(screen.getByTestId('nav-actions')).toBeEmptyDOMElement();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });
});

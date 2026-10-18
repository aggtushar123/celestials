import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BundleStep } from './BundleStep';
import type { Bundle, BundleStep as Step } from '../../features/agents/bundleTypes';
import { B_BLOCKED } from '../../features/agents/testBundleFixtures';

function renderStep(bundle: Bundle, step: Step) {
  return render(
    <MemoryRouter>
      <ul>
        <BundleStep
          bundle={bundle}
          step={step}
          entry={{ selected: false, fields: step.fields }}
          errors={{}}
          ticking
          editing
          onToggle={vi.fn()}
          onField={vi.fn()}
          onUndone={vi.fn()}
        />
      </ul>
    </MemoryRouter>,
  );
}

describe('BundleStep', () => {
  it('shows a tool-blocked step its full text, read only (round 2 D2 Decision 6)', () => {
    renderStep(B_BLOCKED, B_BLOCKED.steps[0]);
    expect(screen.getByText('Ask an admin to allow Revenact to post in Slack.')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps a rights-blocked step to its excerpt', () => {
    const step = { ...B_BLOCKED.steps[0], disabled_link: null, fields: { ...B_BLOCKED.steps[0].fields, text: 'A much longer full message.' } };
    renderStep(B_BLOCKED, step);
    expect(screen.queryByText('Message')).toBeNull();
    expect(screen.queryByText('A much longer full message.')).toBeNull();
  });
});

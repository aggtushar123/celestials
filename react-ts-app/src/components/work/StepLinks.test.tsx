import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StepLinks } from './StepLinks';

// Contract §4.1, D3-16; frontend Decision 9: only https pages go out, only app paths stay in.
describe('StepLinks', () => {
  it('draws a good external and a good app link, and drops hostile ones', () => {
    render(
      <MemoryRouter>
        <StepLinks
          links={[
            { label: 'Script', url: 'javascript:alert(1)', external: true },
            { label: 'Plain http', url: 'http://x.com', external: true },
            { label: 'Protocol relative', url: '//evil.com', external: false },
            { label: 'Backslash', url: '/\\evil.com', external: false },
            { label: 'Open SUP-1 in Jira', url: 'https://acme.atlassian.net/browse/SUP-1', external: true },
            { label: 'Open the task', url: '/work', external: false },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Open SUP-1 in Jira (opens in a new tab)', 'Open the task']);
    expect(screen.getByRole('link', { name: 'Open the task' })).toHaveAttribute('href', '/work');
  });
});

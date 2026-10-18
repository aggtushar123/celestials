import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MetaParts } from './MetaParts';

describe('MetaParts (a meta line, spec §7 separators)', () => {
  it('drops empty parts and ends every span but the last with " ·"', () => {
    const { container } = render(
      <p>
        <MetaParts parts={['Ends 4f2a', false, null, '', 'made 3 Oct 2026', 'never used']} />
      </p>,
    );
    const spans = [...container.querySelectorAll('p > span')];
    expect(spans.map((span) => span.textContent)).toEqual(['Ends 4f2a ·', 'made 3 Oct 2026 ·', 'never used']);
    expect(container.querySelector('p')!.textContent).toBe('Ends 4f2a · made 3 Oct 2026 · never used');
  });

  it('renders nothing for no parts', () => {
    const { container } = render(
      <p>
        <MetaParts parts={[false, undefined]} />
      </p>,
    );
    expect(container.querySelector('p')).toBeEmptyDOMElement();
  });
});

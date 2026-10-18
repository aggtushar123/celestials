import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { madeByText } from '../../features/agents/agentsText';
import { MADE_BY_OPS } from '../../features/agents/testAgentsFixtures';
import { MadeByLine } from './MadeByLine';

describe('MadeByLine (Agents delivery 3, Decision 4)', () => {
  it('names the agent and who approved it, with a hidden icon', () => {
    const { container } = render(<MadeByLine madeBy={MADE_BY_OPS} className="px-2" />);
    const line = container.querySelector('[data-part="made-by"]') as HTMLElement;
    expect(line).toHaveTextContent(/^Made by the Ops agent, approved by Alice$/);
    expect(line).toHaveClass('text-[11px]', 'text-ink-muted', 'px-2');
    expect(line.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names only the agent when the server sends no approver', () => {
    expect(madeByText({ agent: 'cs', approved_by: null })).toBe('Made by the CS agent');
  });

  it('renders nothing for an object a person made', () => {
    expect(render(<MadeByLine madeBy={null} />).container).toBeEmptyDOMElement();
    expect(render(<MadeByLine madeBy={undefined} />).container).toBeEmptyDOMElement();
  });
});

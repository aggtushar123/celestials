import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDrill } from '../drill/useDrill';
import type { DrillRow } from '../drill/types';
import { resetViewport } from '../../../test/viewport';
import { postedBodies, stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard } from './testAsk';

function Opener({ rows }: { rows: DrillRow[] }) {
  const { open } = useDrill();
  return (
    <button type="button" onClick={(event) => open({ title: 'At risk', figure: '$80.1K', source: { kind: 'rows', rows } }, event.currentTarget)}>
      At risk $80.1K
    </button>
  );
}

const two: DrillRow[] = [{ id: '3', name: 'Uber', arr: 42000 }, { id: '7', name: 'Pizza Hut', arr: 38100 }];

describe('"Ask about these" in the drill panel', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('closes the drill, opens a collapsed rail, and prefills an editable question about those accounts', async () => {
    const { spy } = stubCopilot();
    renderDashboard('/dashboard/revenue/forecast', () => <Opener rows={two} />, 1100);
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask about these' }));

    expect(screen.queryByRole('dialog', { name: /At risk/ })).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText('Ask Revenact');
    expect(input).toHaveValue('Why are these in At risk?');
    expect(input).toHaveFocus();
    expect(screen.getByText('Revenue › Forecast · 2 accounts')).toBeInTheDocument();
    expect(postedBodies(spy)).toHaveLength(0);

    await userEvent.type(input, ' Short answer.{enter}');
    await screen.findByText('Answer to: Why are these in At risk? Short answer.');
    expect(postedBodies(spy)[0].context).toMatchObject({ area: 'revenue', view: 'forecast', focus: { kind: 'companies', ids: [3, 7] } });

    // The focus was for that one question.
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'And overall?{enter}');
    await screen.findByText('Answer to: And overall?');
    expect(postedBodies(spy)[1].context).toMatchObject({ focus: null });
  });

  it('is off, and says why, for more than 200 accounts', async () => {
    stubCopilot();
    const many = Array.from({ length: 201 }, (_, i) => ({ id: String(i + 1), name: `Co ${i + 1}` }));
    renderDashboard('/dashboard/revenue/forecast', () => <Opener rows={many} />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));
    const button = screen.getByRole('button', { name: 'Ask about these' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Ask about up to 200 accounts at a time. Narrow the filters to ask.');
  });
});

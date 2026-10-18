import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fromRules, toRules, type DraftRules } from '../../features/segments/ruleDraft';
import { fieldsFor } from '../../features/segments/segmentFields';
import { NO_LABELS, type RuleLabels, type Rules } from '../../features/segments/segmentTypes';
import { CARL, stubSegments } from '../../features/segments/testSegments';
import { RuleEditor } from './RuleEditor';

/** Owns the labels and feeds the picker's picks back into them, as the
 *  builder does (Task 11). */
function Harness({ initial, kind = 'customer', invalid = false, error = null }: {
  initial: Rules | null;
  kind?: 'customer' | 'account';
  invalid?: boolean;
  error?: string | null;
}) {
  const [draft, setDraft] = useState<DraftRules>(() => fromRules(initial));
  const [labels, setLabels] = useState<RuleLabels>(NO_LABELS);
  const first = draft.conditions[0]?.uid ?? null;
  return (
    <>
      <RuleEditor
        draft={draft}
        fields={fieldsFor(kind, [])}
        options={{
          people: [CARL],
          products: [],
          labels,
          onNamed: (group, id, name) => setLabels((current) => ({ ...current, [group]: { ...current[group], [String(id)]: name } })),
        }}
        invalidUid={invalid ? first : null}
        error={error}
        onChange={setDraft}
      />
      <output data-testid="rules">{JSON.stringify(toRules(draft))}</output>
    </>
  );
}

const rules = () => JSON.parse(screen.getByTestId('rules').textContent ?? '{}') as Rules;
const row = (n: number) => document.querySelectorAll('[data-condition]')[n - 1] as HTMLElement;
/** The paragraph whose whole text (across its spans) is `text`. */
const prose = (text: string) => screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === text);

describe('RuleEditor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a condition as a row, field then operator then value, and adds one on the first field', async () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'csat_score', op: 'lt', value: 60 }] }} />);
    expect(within(row(1)).getByRole('combobox', { name: 'Condition 1 field' })).toHaveDisplayValue('CSAT %');
    expect(within(row(1)).getByRole('combobox', { name: 'Condition 1 operator' })).toHaveDisplayValue('is less than');
    expect(within(row(1)).getByRole('spinbutton', { name: 'Condition 1 value' })).toHaveValue(60);
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(rules().conditions[1]).toEqual({ field: 'lifecycle_stage', op: 'is' });
  });

  it('reads as a sentence: Where, then and (All) or or (Any), and inside a group by its own match', async () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'csat_score', op: 'lt', value: 60 }, { field: 'csat_score', op: 'gt', value: 10 }] }} />);
    expect(screen.getByText('Include records that match')).toBeInTheDocument();
    const lead = (n: number) => row(n).querySelector('[aria-hidden="true"]')?.textContent;
    expect([lead(1), lead(2)]).toEqual(['Where', 'and']);
    await userEvent.click(within(screen.getByRole('group', { name: 'Match' })).getByRole('button', { name: 'Any' }));
    expect(lead(2)).toBe('or');
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
    const group = document.querySelector('[data-group]') as HTMLElement;
    expect(group.firstElementChild).toHaveTextContent('or');
    await userEvent.click(within(group).getByRole('button', { name: 'Add condition to group' }));
    expect([lead(3), lead(4)]).toEqual(['Where', 'and']);
  });

  it('shows the note under the rows when given one', () => {
    render(<RuleEditor draft={fromRules(null)} fields={fieldsFor('customer', [])} options={{ people: [], products: [], labels: NO_LABELS, onNamed: () => {} }} invalidUid={null} error={null} noun="organisations" note="Churned are left out." onChange={() => {}} />);
    expect(screen.getByText('Include organisations that match')).toBeInTheDocument();
    expect(screen.getByText('Churned are left out.')).toBeInTheDocument();
  });

  it("offers only the field's operators, and starts the value over when the field changes", async () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'csat_score', op: 'lt', value: 60 }] }} />);
    const ops = within(row(1)).getByRole('combobox', { name: 'Condition 1 operator' });
    expect(within(ops).getAllByRole('option').map((o) => o.textContent)).toEqual(['is more than', 'is less than', 'is between', 'is empty', 'is not empty']);
    await userEvent.selectOptions(within(row(1)).getByRole('combobox', { name: 'Condition 1 field' }), 'Renewal date');
    expect(rules().conditions[0]).toEqual({ field: 'renewal_date', op: 'within_next' });
  });

  it('switches all to any, adds a group asking the other way, and removes the group with its last condition', async () => {
    render(<Harness initial={{ match: 'all', conditions: [] }} />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Match' })).getByRole('button', { name: 'Any' }));
    expect(rules().match).toBe('any');
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
    const group = document.querySelector('[data-group]') as HTMLElement;
    expect(within(within(group).getByRole('group', { name: 'Group 1 match' })).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'Add condition to group' }));
    expect(rules().conditions).toEqual([{ group: { match: 'all', conditions: [{ field: 'lifecycle_stage', op: 'is' }, { field: 'lifecycle_stage', op: 'is' }] } }]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    expect(rules().conditions).toEqual([]);
    expect(document.querySelector('[data-group]')).toBeNull();
  });

  it('removes a whole group from its own button', async () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'arr', op: 'is_empty' }, { group: { match: 'any', conditions: [{ field: 'arr', op: 'is_empty' }, { field: 'arr', op: 'is_not_empty' }] } }] }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove group 1' }));
    expect(rules().conditions).toEqual([{ field: 'arr', op: 'is_empty' }]);
  });

  it('stops adding at 20 conditions and says why, with the 20 in mono', () => {
    const twenty: Rules = { match: 'all', conditions: Array.from({ length: 20 }, () => ({ field: 'arr', op: 'is_empty' as const })) };
    render(<Harness initial={twenty} />);
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add group' })).toBeDisabled();
    const limit = prose('A segment can have at most 20 conditions.');
    expect(within(limit).getByText('20')).toHaveClass('tabular-nums');
  });

  it('counts conditions inside groups against the 20, in mono', () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'arr', op: 'is_empty' }, { group: { match: 'any', conditions: [{ field: 'arr', op: 'is_empty' }, { field: 'arr', op: 'is_not_empty' }] } }] }} />);
    const count = prose('3 of 20 conditions');
    expect(within(count).getByText('3')).toHaveClass('tabular-nums');
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeEnabled();
  });

  it("marks the unfinished condition and shows the server's rules message", () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'csat_score', op: 'lt' }] }} invalid error='"is" cannot be used with Health score.' />);
    expect(row(1)).toHaveClass('border-danger');
    expect(within(row(1)).getByText('Finish this condition, or remove it.')).toBeInTheDocument();
    expect(within(row(1)).getByRole('spinbutton', { name: 'Condition 1 value' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('"is" cannot be used with Health score.');
  });

  it('hands a picked organisation to onNamed, so its chip reads its name', async () => {
    stubSegments();
    render(<Harness kind="account" initial={{ match: 'all', conditions: [{ field: 'organisation', op: 'is' }] }} />);
    await userEvent.type(within(row(1)).getByRole('searchbox', { name: 'Condition 1 value: search' }), 'piz');
    const matches = await screen.findByRole('list', { name: 'Condition 1 value: matches' });
    await userEvent.click(within(matches).getByRole('button', { name: 'Pizza Hut' }));
    expect(rules().conditions[0]).toEqual({ field: 'organisation', op: 'is', value: 7 });
    expect(within(within(row(1)).getByRole('list', { name: 'Condition 1 value' })).getByText('Pizza Hut')).toBeInTheDocument();
  });
});

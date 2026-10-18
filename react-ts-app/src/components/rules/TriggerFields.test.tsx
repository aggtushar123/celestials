import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { emptyDraft, type RuleDraft } from '../../features/rules/ruleDraft';
import type { RuleErrors } from '../../features/rules/ruleErrors';
import { CHAMPIONS, EMEA_ACCOUNTS, listRow, RENEWAL_RISK } from '../../features/segments/testSegments';
import { TriggerFields } from './TriggerFields';

const MINE = [listRow(RENEWAL_RISK), { ...listRow(EMEA_ACCOUNTS), is_owner: true }, listRow(CHAMPIONS)];

function Harness({ start = emptyDraft(7), errors = {} }: { start?: RuleDraft; errors?: RuleErrors['field'] }) {
  const [draft, setDraft] = useState(start);
  const kind = MINE.find((row) => row.id === draft.segment)?.kind ?? null;
  return (
    <MemoryRouter>
      <TriggerFields draft={draft} kind={kind} segments={MINE} segmentsError={null} fallback={null} errors={errors} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </MemoryRouter>
  );
}
const draftNow = () => JSON.parse(screen.getByTestId('draft').textContent as string) as RuleDraft;

describe('TriggerFields (spec §2.2, When)', () => {
  it("words the triggers for the segment's kind, and offers my segments by kind", async () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'When' })).toBeInTheDocument();
    const trigger = screen.getByRole('combobox', { name: 'Trigger' });
    expect([...trigger.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['An organisation enters', 'An organisation leaves', 'A score crosses a line', 'On a schedule']);
    const segment = screen.getByRole('combobox', { name: 'Segment' });
    expect(segment).toHaveDisplayValue('Renewal risk');
    expect(segment.querySelector('optgroup[label="Contacts"]')).toHaveTextContent('Champions');
    await userEvent.selectOptions(segment, '9');
    expect(draftNow().segment).toBe(9);
    expect(within(trigger).getByRole('option', { name: 'A contact enters' })).toBeInTheDocument();
  });

  it('keeps a score line out of reach for a contact segment, and says why', () => {
    render(<Harness start={{ ...emptyDraft(9) }} />);
    expect(screen.getByRole('option', { name: 'A score crosses a line' })).toBeDisabled();
    expect(screen.getByText('Contacts have no scores, so a score rule needs an organisation or account segment.')).toBeInTheDocument();
  });

  it('asks for the score, its direction and a value within its range', async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Trigger' }), 'crossed');
    const score = screen.getByRole('combobox', { name: 'Score' });
    expect([...score.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Choose a score…', 'CSAT', 'NPS', 'CES', 'Health']);
    await userEvent.selectOptions(score, 'nps');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), 'above');
    const value = screen.getByRole('spinbutton', { name: 'Value' });
    expect(value).toHaveAttribute('min', '-100');
    expect(value).toHaveAttribute('max', '100');
    expect(screen.getByText('NPS runs from −100 to 100.')).toBeInTheDocument();
    await userEvent.type(value, '45');
    expect(draftNow()).toMatchObject({ trigger: 'crossed', score: 'nps', direction: 'above', threshold: '45' });
  });

  it('offers no CES for an account segment', async () => {
    render(<Harness start={{ ...emptyDraft(8), trigger: 'crossed' }} />);
    expect([...screen.getByRole('combobox', { name: 'Score' }).querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Choose a score…', 'CSAT', 'NPS', 'Health']);
  });

  it('asks for the day of a weekly schedule, and not of a monthly one', async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Trigger' }), 'schedule');
    const day = screen.getByRole('combobox', { name: 'Day' });
    expect(day).toHaveDisplayValue('Monday');
    await userEvent.selectOptions(day, '4');
    expect(draftNow()).toMatchObject({ trigger: 'schedule', cadence: 'weekly', weekday: 4 });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Repeat' }), 'monthly');
    expect(screen.queryByRole('combobox', { name: 'Day' })).toBeNull();
    expect(screen.getByText('On the 1st of each month, overnight (UTC).')).toBeInTheDocument();
  });

  it('shows errors under their fields and marks the fields invalid', () => {
    render(<Harness start={{ ...emptyDraft(7), trigger: 'crossed' }} errors={{ segment: 'A rule can only use your own segments.', threshold: 'Choose a value.' }} />);
    const segment = screen.getByRole('combobox', { name: 'Segment' });
    expect(segment).toHaveAttribute('aria-invalid', 'true');
    expect(segment).toHaveAccessibleDescription(/A rule can only use your own segments\./);
    expect(screen.getByRole('spinbutton', { name: 'Value' })).toHaveAccessibleDescription('Choose a value.');
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual(['A rule can only use your own segments.', 'Choose a value.']);
  });

  it('offers to make a segment when I have none', () => {
    render(
      <MemoryRouter>
        <TriggerFields draft={emptyDraft(null)} kind={null} segments={[]} segmentsError={null} fallback={null} errors={{}} onChange={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Make one' })).toHaveAttribute('href', '/segments/new');
  });
});

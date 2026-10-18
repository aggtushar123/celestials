import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { stubPlans } from '../../features/plans/testPlans';
import { NOTIFY_ME, type ActionDraft } from '../../features/rules/ruleDraft';
import type { ActionErrors } from '../../features/rules/ruleErrors';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { ActionCards } from './ActionCards';

const TEAMMATES = [{ id: 4, name: 'Carl CSM' }, { id: 5, name: 'Dana CSM' }];

function Harness({ start = [{ ...NOTIFY_ME }], kind = 'customer', errors = [], listError }: { start?: ActionDraft[]; kind?: SegmentKind | null; errors?: ActionErrors[]; listError?: string }) {
  const [actions, setActions] = useState<ActionDraft[]>(start);
  return (
    <>
      <ActionCards actions={actions} kind={kind} workspace="Acme Inc" teammates={TEAMMATES} errors={errors} listError={listError} onChange={setActions} />
      <output data-testid="actions">{JSON.stringify(actions)}</output>
    </>
  );
}
const actionsNow = () => JSON.parse(screen.getByTestId('actions').textContent as string) as ActionDraft[];
const card = (type: string) => document.querySelector(`[data-action="${type}"]`) as HTMLElement;

describe('ActionCards (spec §2.2, Then)', () => {
  it('adds each unused action once, at most three, and removes one', async () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Then' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Actions' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Remove Notify' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Create a task' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send a survey' }));
    expect(actionsNow().map((action) => action.action)).toEqual(['notify', 'task', 'survey']);
    expect(screen.queryByRole('button', { name: 'Change lifecycle' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Create a task' }));
    expect(actionsNow().map((action) => action.action)).toEqual(['notify', 'survey']);
    expect(screen.getByRole('button', { name: 'Create a task' })).toBeInTheDocument();
  });

  it('offers no lifecycle action for a contact segment', () => {
    render(<Harness kind="contact" />);
    expect(screen.getByRole('button', { name: 'Create a task' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change lifecycle' })).toBeNull();
  });

  it('notifies me, each owner or chosen teammates, with an optional note counted to 280', async () => {
    render(<Harness />);
    const who = within(card('notify')).getByRole('combobox', { name: 'Who' });
    expect([...who.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Me', "Each record's owner", 'Chosen teammates']);
    await userEvent.selectOptions(who, 'people');
    await userEvent.selectOptions(within(card('notify')).getByRole('combobox', { name: 'Teammates' }), '4');
    expect(within(card('notify')).getByRole('list', { name: 'Teammates to notify' })).toHaveTextContent('Carl CSM');
    await userEvent.type(within(card('notify')).getByRole('textbox', { name: 'Message (optional)' }), 'Call them');
    expect(card('notify')).toHaveTextContent('9 of 280');
    expect(actionsNow()[0]).toEqual({ action: 'notify', to: 'people', people: [4], message: 'Call them' });
    await userEvent.selectOptions(who, 'me');
    expect(actionsNow()[0]).toMatchObject({ to: 'me', people: [] });
  });

  it('creates a task with a title, an assignee and days until due', async () => {
    render(<Harness start={[{ action: 'task', title: '', assignee: 'record_owner', due_in_days: 7 }]} />);
    const task = card('task');
    await userEvent.type(within(task).getByRole('textbox', { name: 'Task title' }), 'Check in');
    expect([...within(task).getByRole('combobox', { name: 'Assign to' }).querySelectorAll('option')].map((option) => option.textContent)).toEqual(["The record's owner", 'Me']);
    const due = within(task).getByRole('spinbutton', { name: 'Due in (days)' });
    expect(due).toHaveValue(7);
    await userEvent.clear(due);
    await userEvent.type(due, '3');
    expect(actionsNow()[0]).toEqual({ action: 'task', title: 'Check in', assignee: 'record_owner', due_in_days: 3 });
  });

  it('changes the lifecycle stage, chosen first, saying Churn sets the stage only', async () => {
    render(<Harness start={[{ action: 'lifecycle', stage: '' }]} />);
    const stage = within(card('lifecycle')).getByRole('combobox', { name: 'Stage' });
    expect(stage).toHaveDisplayValue('Choose a stage…');
    await userEvent.selectOptions(stage, 'churn');
    expect(card('lifecycle')).toHaveTextContent('Churn sets the stage only; it does not record a churn date.');
    expect(actionsNow()[0]).toEqual({ action: 'lifecycle', stage: 'churn' });
  });

  it("sends a survey with Surveys' fields, the 500 note, and asks before Send without review", async () => {
    render(<Harness start={[{ action: 'survey', survey_type: 'nps', subject: 'A quick question from Acme Inc', intro: '', roles: ['champion', 'decision_maker'], without_review: false }]} />);
    const survey = card('survey');
    expect(within(survey).getByRole('radio', { name: 'NPS' })).toBeChecked();
    await userEvent.click(within(survey).getByRole('radio', { name: 'CSAT' }));
    expect(within(survey).getByRole('textbox', { name: 'Email subject' })).toHaveValue('A quick question from Acme Inc');
    expect(within(survey).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(survey).toHaveTextContent('A night that reaches more than 500 people is refused by Surveys and waits in Waiting on you with the reason.');
    const toggle = within(survey).getByRole('switch', { name: 'Send without review' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    const question = within(survey).getByRole('group', { name: 'Send without review?' });
    await userEvent.click(within(question).getByRole('button', { name: 'Send without review' }));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleDescription('Surveys go out at night without you seeing them first.');
    expect(actionsNow()[0]).toMatchObject({ survey_type: 'csat', without_review: true });
  });

  it("shows each action's errors at its own fields, and the list's above the add buttons", () => {
    render(
      <Harness
        start={[{ ...NOTIFY_ME }, { action: 'task', title: '', assignee: 'me', due_in_days: 7 }]}
        errors={[{}, { title: 'Give the task a title.' }]}
        listError="Each action can be used once per rule."
      />,
    );
    const title = within(card('task')).getByRole('textbox', { name: 'Task title' });
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('Give the task a title.');
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual(['Give the task a title.', 'Each action can be used once per rule.']);
  });

  it('shows a lifecycle refusal for a contact segment on its card', () => {
    render(<Harness kind="contact" start={[{ action: 'lifecycle', stage: 'live' }]} errors={[{ action: 'Contacts have no lifecycle stage; choose an organisation or account segment.' }]} />);
    expect(within(card('lifecycle')).getByRole('alert')).toHaveTextContent('Contacts have no lifecycle stage');
  });
});

describe('ActionCards: Start a plan (plans spec §2.5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds Start a plan with templates grouped as built-in, yours and shared with you', async () => {
    stubPlans();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Start a plan' }));
    const select = within(card('plan')).getByRole('combobox', { name: 'Template' });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select.querySelector('optgroup[label="Built-in"]')).toHaveTextContent('OnboardingSuccess planSave planQBR');
    expect(select.querySelector('optgroup[label="Yours"]')).toHaveTextContent('Renewal prep');
    expect(select.querySelector('optgroup[label="Shared with you"]')).toHaveTextContent("Carl's expansion play");
    await userEvent.selectOptions(select, '3');
    expect(actionsNow()[1]).toEqual({ action: 'plan', template: { id: 3, name: 'Save plan' } });
  });

  it('shows a stored template the owner can no longer use by name, and says to choose one', async () => {
    stubPlans();
    render(<Harness start={[{ ...NOTIFY_ME }, { action: 'plan', template: { id: 77, name: 'Old playbook' } }]} />);
    const select = within(card('plan')).getByRole('combobox', { name: 'Template' });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select).toHaveDisplayValue('Old playbook');
    expect(select).toHaveAccessibleDescription(/Choose a template you can use\./);
    await userEvent.selectOptions(select, '3');
    expect(actionsNow()[1]).toEqual({ action: 'plan', template: { id: 3, name: 'Save plan' } });
    expect(select).not.toHaveAccessibleDescription(/Choose a template you can use\./);
  });

  it('shows the refusal at the template', async () => {
    stubPlans();
    render(<Harness start={[{ ...NOTIFY_ME }, { action: 'plan', template: null }]} errors={[{}, { template: 'Choose a template you can use.' }]} />);
    expect(within(card('plan')).getByRole('combobox', { name: 'Template' })).toHaveAccessibleDescription(/Choose a template you can use\./);
  });
});

describe('ActionCards: Send a campaign (campaigns spec §2.5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers only my campaigns that aren't archived and match the segment's kind", async () => {
    stubCampaigns();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Send a campaign' }));
    const select = within(card('campaign')).getByRole('combobox', { name: 'Campaign' });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Choose a campaign…', 'Win-back']);
    await userEvent.selectOptions(select, '11');
    expect(actionsNow()[1]).toEqual({ action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: false });
  });

  it('offers contact campaigns to a contact rule', async () => {
    stubCampaigns();
    render(<Harness kind="contact" />);
    await userEvent.click(screen.getByRole('button', { name: 'Send a campaign' }));
    const select = within(card('campaign')).getByRole('combobox', { name: 'Campaign' });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Choose a campaign…', 'Champion news']);
  });

  it('asks before sending without review', async () => {
    stubCampaigns();
    render(<Harness start={[{ ...NOTIFY_ME }, { action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: false }]} />);
    await userEvent.click(within(card('campaign')).getByRole('switch', { name: 'Send without review' }));
    expect(within(card('campaign')).getByText('Send without review?')).toBeInTheDocument();
    await userEvent.click(within(card('campaign')).getByRole('button', { name: 'Send without review' }));
    expect(actionsNow()[1]).toMatchObject({ without_review: true });
  });

  it('refuses a stored campaign that is no longer one of mine to use', async () => {
    stubCampaigns();
    render(<Harness start={[{ ...NOTIFY_ME }, { action: 'campaign', campaign: { id: 16, name: 'Old promo' }, without_review: false }]} />);
    const select = within(card('campaign')).getByRole('combobox', { name: 'Campaign' });
    await waitFor(() => expect(select).toHaveAccessibleDescription(/Choose one of your active campaigns for these records\./));
  });
});

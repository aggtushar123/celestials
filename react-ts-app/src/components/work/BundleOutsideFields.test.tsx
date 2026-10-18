import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { B_AS_YOU, B_COMMENT, B_LIVE, B_OUTSIDE, OUTSIDE_BUNDLES } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { OUTSIDE, draftOf, startFields } from '../../features/agents/bundleText';
import type { Bundle, BundleStep, StepFields, StepFieldValue } from '../../features/agents/bundleTypes';
import { BundleOutsideFields } from './BundleOutsideFields';

// Agent bundles D3 contract §2; frontend Decisions 1 to 6. Only fetch is stubbed.
afterEach(() => vi.unstubAllGlobals());

function renderStep(index: number, overrides: StepFields = {}) {
  const step = B_OUTSIDE.steps[index];
  const changes: [string, StepFieldValue][] = [];
  // The panel's draft: what the editor is given (draftOf).
  const fields = draftOf(B_OUTSIDE)[step.id].fields;
  render(
    <MemoryRouter>
      <BundleOutsideFields bundle={B_OUTSIDE} step={step} fields={{ ...fields, ...overrides }} errors={{}} onField={(key, value) => changes.push([key, value])} />
    </MemoryRouter>,
  );
  return changes;
}

function renderFields({ bundle, step, fields, errors = {}, onField = () => undefined }: { bundle: Bundle; step: BundleStep; fields: StepFields; errors?: Record<string, string>; onField?: (key: string, value: StepFieldValue) => void }) {
  render(
    <MemoryRouter>
      <BundleOutsideFields bundle={bundle} step={step} fields={fields} errors={errors} onField={onField} />
    </MemoryRouter>,
  );
}

describe('BundleOutsideFields', () => {
  it('a reply: who it goes from, then to, cc, subject and body', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(0);
    expect(screen.getByText('From alice@acme.io')).toBeInTheDocument();
    expect(screen.getByText('Goes in the same email thread.')).toBeInTheDocument();
    const to = screen.getByRole('textbox', { name: 'To' });
    expect(to).toHaveValue('ann@pizzahut.com');
    await userEvent.type(to, ', ops@pizzahut.com');
    expect(changes.at(-1)).toEqual(['to', ['ann@pizzahut.com', 'ops@pizzahut.com']]);
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue('Re: Login loop');
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue("We're on it: the fix ships Friday.");
  });

  it('a Slack reply: the channel from the server, and the message', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(1);
    expect(screen.getByText('Posts as Revenact')).toBeInTheDocument();
    const channel = await screen.findByRole('combobox', { name: 'Channel' });
    await waitFor(() => expect(Array.from((channel as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['#support (This thread)', '#escalations (A new message)']));
    await userEvent.selectOptions(channel, '6');
    expect(changes.at(-1)).toEqual(['connector_id', 6]);
  });

  it('a Jira issue: project, type for that project, priority with Jira default, assignee matched later', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(2);
    expect(screen.getByText('Created in Jira as Jira Bot')).toBeInTheDocument();
    const project = await screen.findByRole('combobox', { name: 'Project' });
    await userEvent.selectOptions(project, 'ENG');
    expect(changes.at(-1)).toEqual(['project', 'ENG']);
    const type = await screen.findByRole('combobox', { name: 'Issue type' });
    await waitFor(() => expect(Array.from((type as HTMLSelectElement).options).map((o) => o.textContent)).toContain('Bug'));
    const priority = await screen.findByRole('combobox', { name: 'Priority' });
    await waitFor(() => expect((priority as HTMLSelectElement).options[0].textContent).toBe("Jira's default"));
    await userEvent.selectOptions(priority, '__none__');
    expect(changes.at(-1)).toEqual(['priority', null]);
    expect(screen.getByText('Erin Eng (matched in Jira by email when it runs)')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Summary' })).toHaveValue('Login loop after password reset');
  });

  it('a Jira project left empty says so', () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    renderStep(2, { project: '' });
    expect(screen.getByText('Choose a project.')).toBeInTheDocument();
  });

  it('a Jira assignment: only the assignee, searched', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(3);
    expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search people in Jira' }), 'eri');
    const who = await screen.findByRole('combobox', { name: 'Assignee' });
    await waitFor(() => expect(within(who).getAllByRole('option').map((o) => o.textContent)).toContain('Erin Eng (erin@acme.io)'));
    await userEvent.selectOptions(who, 'acc-erin');
    expect(changes.at(-1)).toEqual(['assignee', { id: 'acc-erin', name: 'Erin Eng' }]);
  });

  it('the Assignee label sits above its search box, then the select', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    renderStep(3);
    const label = screen.getByText('Assignee', { selector: 'label' });
    const search = screen.getByRole('searchbox', { name: 'Search people in Jira' });
    const who = await screen.findByRole('combobox', { name: 'Assignee' });
    expect(screen.getAllByText('Assignee')).toHaveLength(1);
    expect(label.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.compareDocumentPosition(who) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says Created in Jira for a new issue and Assigned in Jira for an assignment', () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    renderStep(3);
    expect(screen.getByText(/^Assigned in Jira as /)).toBeInTheDocument();
    expect(screen.queryByText(/Created in Jira/)).toBeNull();
  });

  it('the model member shows as the chosen assignee of a Jira issue, with Unassigned still offered', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(2);
    const who = screen.getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement;
    expect(who.selectedOptions[0].textContent).toBe('Erin Eng');
    await waitFor(() => expect(within(who).getAllByRole('option').map((o) => o.textContent)).toContain('Priya Shah (priya@acme.io)'));
    expect(who.selectedOptions[0].textContent).toMatch(/^Erin Eng/);
    expect(within(who).getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getByText('Erin Eng (matched in Jira by email when it runs)')).toBeInTheDocument();
    await userEvent.selectOptions(who, 'acc-priya');
    expect(changes.at(-1)).toEqual(['assignee', { id: 'acc-priya', name: 'Priya Shah' }]);
    await userEvent.selectOptions(who, '__none__');
    expect(changes.at(-1)).toEqual(['assignee', null]);
  });

  it('the model member shows as the chosen assignee of a Jira assignment, with no Unassigned', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    renderStep(3);
    const who = screen.getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement;
    expect(who.selectedOptions[0].textContent).toBe('Erin Eng');
    await waitFor(() => expect(within(who).getAllByRole('option').map((o) => o.textContent)).toContain('Priya Shah (priya@acme.io)'));
    expect(who.selectedOptions[0].textContent).toMatch(/^Erin Eng/);
    expect(within(who).queryByRole('option', { name: 'Unassigned' })).toBeNull();
  });

  it("asks for the priorities of the step's project and issue type, and asks again when either changes", async () => {
    const { spy } = stubBundles({ bundles: OUTSIDE_BUNDLES });
    const create = B_OUTSIDE.steps.find((s) => s.kind === 'jira.create')!;
    function Editor() {
      const [fields, setFields] = useState<StepFields>({ ...draftOf(B_OUTSIDE)[create.id].fields, issue_type: { id: '10001', name: 'Task' } });
      return <BundleOutsideFields bundle={B_OUTSIDE} step={create} fields={fields} errors={{}} onField={(key, value) => setFields((f) => ({ ...f, [key]: value }))} />;
    }
    render(
      <MemoryRouter>
        <Editor />
      </MemoryRouter>,
    );
    const asked = () => spy.mock.calls.map(([input]) => new URL(String(input))).filter((u) => u.pathname.includes('/jira_priorities/'));
    await waitFor(() => expect(asked().at(-1)?.searchParams.get('project')).toBe('SUP'));
    expect(asked().at(-1)?.searchParams.get('issue_type')).toBe('10001');

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Project' }), 'ENG');
    // A new project keeps only the type's name: no id is sent until one is picked.
    await waitFor(() => expect(asked().at(-1)?.searchParams.get('project')).toBe('ENG'));
    expect(asked().at(-1)?.searchParams.has('issue_type')).toBe(false);

    const type = await screen.findByRole('combobox', { name: 'Issue type' });
    await waitFor(() => expect(Array.from((type as HTMLSelectElement).options).map((o) => o.value)).toContain('10002'));
    await userEvent.selectOptions(type, '10002');
    await waitFor(() => expect(asked().at(-1)?.searchParams.get('issue_type')).toBe('10002'));
    expect(asked().at(-1)?.searchParams.get('project')).toBe('ENG');
  });

  it("offers Jira's default alone when the create screen has no priority field", async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, options: { jira_priorities: [] } });
    renderStep(2, { priority: null });
    const priority = await screen.findByRole('combobox', { name: 'Priority' });
    await waitFor(() => expect(Array.from((priority as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(["Jira's default"]));
  });

  it("shows the server's sentence word for word when the person's Jira link may not read priorities", async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOptions: { jira_priorities: { status: 409, body: { code: 'TOOL_REFUSED', detail: "Your Jira link can't do this in Jira." } } } });
    renderStep(2);
    expect(await screen.findByRole('alert')).toHaveTextContent("Your Jira link can't do this in Jira.");
  });

  it('a new Jira project clears the issue type id and keeps its name', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const changes = renderStep(2, { issue_type: { id: '10001', name: 'Task' } });
    const project = await screen.findByRole('combobox', { name: 'Project' });
    await userEvent.selectOptions(project, 'ENG');
    expect(changes).toContainEqual(['project', 'ENG']);
    expect(changes).toContainEqual(['issue_type', { id: '', name: 'Task' }]);
  });

  it('the address boxes follow the stored list when it changes from outside', () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const step = B_OUTSIDE.steps[0];
    const props = { bundle: B_OUTSIDE, step, errors: {}, onField: () => undefined };
    const { rerender } = render(<BundleOutsideFields {...props} fields={{ ...step.fields, to: ['a@x.io'], cc: ['c@x.io'] }} />);
    expect(screen.getByRole('textbox', { name: 'Cc' })).toHaveValue('c@x.io');
    rerender(<BundleOutsideFields {...props} fields={{ ...step.fields, to: ['b@x.io', 'd@x.io'], cc: ['e@x.io'] }} />);
    expect(screen.getByRole('textbox', { name: 'To' })).toHaveValue('b@x.io, d@x.io');
    expect(screen.getByRole('textbox', { name: 'Cc' })).toHaveValue('e@x.io');
  });

  it('edits a Jira comment and says where it goes (round 2 D1 Decision 1)', async () => {
    const onField = vi.fn();
    const [s] = B_COMMENT.steps;
    renderFields({ bundle: B_COMMENT, step: s, fields: { ...s.fields }, onField });
    expect(screen.getByText('Comments in Jira as Jira Bot')).toBeInTheDocument();
    expect(screen.getByText('On SUP-12')).toBeInTheDocument();
    expect(screen.getByText('Only your team sees this comment in Jira.')).toBeInTheDocument();
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await userEvent.type(box, '!');
    expect(onField).toHaveBeenLastCalledWith('body', 'Customer confirms it fails on Chrome too.!');
  });

  it('a Jira comment on a placeholder issue has no On line', () => {
    const [s] = B_COMMENT.steps;
    const step = { ...s, preview: { jira_comment: { ...s.preview.jira_comment!, issue: '{{step 1.ticket_key}}' } } };
    renderFields({ bundle: B_COMMENT, step, fields: { ...s.fields } });
    expect(screen.getByText('Comments in Jira as Jira Bot')).toBeInTheDocument();
    expect(screen.queryByText(/^On /)).toBeNull();
  });

  it('a Jira comment whose body is not editable has no Comment box', () => {
    const [s] = B_COMMENT.steps;
    renderFields({ bundle: B_COMMENT, step: { ...s, editable: [] }, fields: { ...s.fields } });
    expect(screen.queryByRole('textbox', { name: 'Comment' })).toBeNull();
  });

  it('a Jira comment with a placeholder shows its text read only, chip included', () => {
    const [s] = B_COMMENT.steps;
    const body = 'Tracked as {{step 2.ticket_key}}.';
    const step = { ...s, editable: [], fields: { body }, placeholders: [{ field: 'body', step: 2, key: 'ticket_key', label: 'Jira ticket' }] };
    renderFields({ bundle: B_COMMENT, step, fields: { body } });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Comment')).toBeInTheDocument();
    expect(screen.getByText(/Tracked as/)).toBeInTheDocument();
    expect(screen.getByText('Jira ticket')).toBeInTheDocument();
  });

  it('a read only Jira comment falls back to the preview excerpt', () => {
    const [s] = B_COMMENT.steps;
    renderFields({ bundle: B_COMMENT, step: { ...s, editable: [] }, fields: {} });
    expect(screen.getByText('Customer confirms it fails on Chrome too.')).toBeInTheDocument();
  });

  it('shows the field error the server sent', () => {
    const [s] = B_COMMENT.steps;
    renderFields({ bundle: B_COMMENT, step: s, fields: { body: '' }, errors: { body: 'Write the comment.' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Write the comment.');
  });

  it('shows one Jira error and one Try again for the whole step when Jira is down (C1)', async () => {
    const down = { status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } };
    const { spy } = stubBundles({ bundles: [B_OUTSIDE], failOptions: { jira_projects: down, jira_priorities: down, jira_assignees: down } });
    const create = B_OUTSIDE.steps.find((s) => s.kind === 'jira.create')!;
    renderFields({ bundle: B_OUTSIDE, step: create, fields: startFields(create) });
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Jira. Try again.");
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1));
    const before = spy.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    const asked = spy.mock.calls.slice(before).map(([input]) => new URL(String(input)).pathname.split('/').at(-2));
    expect(new Set(asked)).toEqual(new Set(['jira_projects', 'jira_priorities', 'jira_assignees']));
  });
});

describe('who a Jira step acts as (round 2 D2 Decision 4)', () => {
  const create = B_OUTSIDE.steps.find((s) => s.kind === 'jira.create')!;
  const assign = B_OUTSIDE.steps.find((s) => s.kind === 'jira.assign')!;
  const [comment] = B_COMMENT.steps;

  it('names you when your link covers the site', () => {
    stubBundles({ bundles: [B_AS_YOU] });
    renderFields({ bundle: B_AS_YOU, step: B_AS_YOU.steps[0], fields: startFields(B_AS_YOU.steps[0]) });
    expect(screen.getByText('Created in Jira as you (Carl Lee)')).toBeInTheDocument();
    expect(screen.queryByText('Link your Jira account to act as yourself.')).toBeNull();
  });

  it('names the connection and points to the link when you have none', () => {
    stubBundles({ bundles: [B_OUTSIDE] });
    renderFields({ bundle: B_OUTSIDE, step: create, fields: startFields(create) });
    expect(screen.getByText('Created in Jira as Jira Bot')).toBeInTheDocument();
    expect(screen.getByText('Link your Jira account to act as yourself.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: OUTSIDE.OPEN_SETTING })).toHaveAttribute('href', '/settings/connections');
  });

  it('a comment acts as you when linked', () => {
    const step = { ...comment, preview: { jira_comment: { ...comment.preview.jira_comment!, as: 'Carl Lee', as_you: true, link: null } } };
    renderFields({ bundle: B_COMMENT, step, fields: startFields(step) });
    expect(screen.getByText('Comments in Jira as you (Carl Lee)')).toBeInTheDocument();
  });

  it('an assign step acts as you when linked', () => {
    stubBundles({ bundles: [B_OUTSIDE] });
    const step = { ...assign, preview: { jira_assign: { ...assign.preview.jira_assign!, as: 'Carl Lee', as_you: true, link: null } } };
    renderFields({ bundle: B_OUTSIDE, step, fields: startFields(step) });
    expect(screen.getByText('Assigned in Jira as you (Carl Lee)')).toBeInTheDocument();
  });

  it('says when your link does not cover the site, with no link to settings', () => {
    const step = { ...comment, preview: { jira_comment: { ...comment.preview.jira_comment!, link: 'other_site' as const } } };
    renderFields({ bundle: B_COMMENT, step, fields: startFields(step) });
    expect(screen.getByText("Your Jira link doesn't cover acme.atlassian.net.")).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: OUTSIDE.OPEN_SETTING })).toBeNull();
  });

  it('shows no hint when the link is off', () => {
    const step = { ...comment, preview: { jira_comment: { ...comment.preview.jira_comment!, link: 'off' as const } } };
    renderFields({ bundle: B_COMMENT, step, fields: startFields(step) });
    expect(screen.getByText('Comments in Jira as Jira Bot')).toBeInTheDocument();
    expect(screen.queryByText(/Jira link|Link your Jira/)).toBeNull();
  });

  it('shows the bot line and no hint when the link is lost', () => {
    const step = { ...comment, preview: { jira_comment: { ...comment.preview.jira_comment!, as_you: false, link: null } } };
    renderFields({ bundle: B_COMMENT, step, fields: startFields(step) });
    expect(screen.getByText('Comments in Jira as Jira Bot')).toBeInTheDocument();
    expect(screen.queryByText(/Link your Jira|Jira link doesn/)).toBeNull();
  });
});

describe('the live Slack list (round 2 D2 Decision 5)', () => {
  it('searches channels the bot is in and picks an unsynced one', async () => {
    const { spy } = stubBundles({ bundles: [B_LIVE] });
    const onField = vi.fn();
    renderFields({ bundle: B_LIVE, step: B_LIVE.steps[0], fields: { ...B_LIVE.steps[0].fields }, onField });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search channels' }), 'esc');
    const box = await screen.findByRole('combobox', { name: 'Channel' });
    await waitFor(() => expect(within(box).getAllByRole('option').map((o) => o.textContent)).toContain('#escalations (Not synced)'));
    expect(spy.mock.calls.some(([u]) => String(u).includes('live=1'))).toBe(true);
    await userEvent.selectOptions(box, '5:C0ESCALATE');
    expect(onField).toHaveBeenCalledWith('channel_choice', '5:C0ESCALATE');
  });

  it('strips a leading # (and spaces) from the channel search before it is sent', async () => {
    const { spy } = stubBundles({ bundles: [B_LIVE] });
    renderFields({ bundle: B_LIVE, step: B_LIVE.steps[0], fields: { ...B_LIVE.steps[0].fields } });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search channels' }), ' #esc ');
    const sent = () => spy.mock.calls.map(([u]) => new URL(String(u), 'http://x')).filter((u) => u.searchParams.get('live') === '1');
    await waitFor(() => expect(sent().some((u) => u.searchParams.get('query') === 'esc')).toBe(true));
    const box = await screen.findByRole('combobox', { name: 'Channel' });
    await waitFor(() => expect(within(box).getAllByRole('option').map((o) => o.textContent)).toContain('#escalations (Not synced)'));
    expect(sent().some((u) => (u.searchParams.get('query') ?? '').includes('#'))).toBe(false);
  });

  it('keeps the picked channel in the select when a later search leaves it out', async () => {
    stubBundles({ bundles: [B_LIVE] });
    function Harness() {
      const [fields, setFields] = useState<StepFields>({ ...B_LIVE.steps[0].fields });
      return (
        <MemoryRouter>
          <BundleOutsideFields bundle={B_LIVE} step={B_LIVE.steps[0]} fields={fields} errors={{}} onField={(key, value) => setFields((f) => ({ ...f, [key]: value }))} />
        </MemoryRouter>
      );
    }
    render(<Harness />);
    const search = screen.getByRole('searchbox', { name: 'Search channels' });
    await userEvent.type(search, 'esc');
    const box = await screen.findByRole('combobox', { name: 'Channel' });
    await waitFor(() => expect(within(box).getAllByRole('option').map((o) => o.textContent)).toContain('#escalations (Not synced)'));
    await userEvent.selectOptions(box, '5:C0ESCALATE');
    await userEvent.clear(search);
    await userEvent.type(search, 'rand');
    await waitFor(() => expect(within(box).getAllByRole('option').map((o) => o.textContent)).not.toContain('#support (This thread)'));
    const selected = (box as HTMLSelectElement).selectedOptions[0];
    expect(selected.textContent).toContain('#escalations');
    expect(selected.textContent).not.toContain('#support');
  });

  it('says no channels match, not nobody', async () => {
    stubBundles({ bundles: [B_LIVE] });
    renderFields({ bundle: B_LIVE, step: B_LIVE.steps[0], fields: { ...B_LIVE.steps[0].fields } });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search channels' }), 'zzzz');
    expect(await screen.findByText('No channels match.')).toBeInTheDocument();
    expect(screen.queryByText('Nobody matches.')).toBeNull();
  });

  it('shows the server note when Slack did not list its channels', async () => {
    stubBundles({ bundles: [B_LIVE], channelNote: "Slack didn't list its other channels. Try again in a minute." });
    renderFields({ bundle: B_LIVE, step: B_LIVE.steps[0], fields: { ...B_LIVE.steps[0].fields } });
    expect(await screen.findByText("Slack didn't list its other channels. Try again in a minute.")).toBeInTheDocument();
  });

  it('shows the channel_choice error', async () => {
    stubBundles({ bundles: [B_LIVE] });
    renderFields({ bundle: B_LIVE, step: B_LIVE.steps[0], fields: { ...B_LIVE.steps[0].fields }, errors: { channel_choice: 'Pick a channel the bot is in.' } });
    expect(await screen.findByText('Pick a channel the bot is in.')).toBeInTheDocument();
  });

  it('keeps the old select when channel_choice is not editable', async () => {
    stubBundles({ bundles: [B_OUTSIDE] });
    const slack = B_OUTSIDE.steps.find((s) => s.kind === 'slack.reply')!;
    renderFields({ bundle: B_OUTSIDE, step: slack, fields: { ...slack.fields } });
    expect(screen.queryByRole('searchbox', { name: 'Search channels' })).toBeNull();
    expect(await screen.findByRole('combobox', { name: 'Channel' })).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import {
  SHORT_KIND_LABEL,
  shortStepLabel,
  AGENTS,
  agentsDraftOf,
  agentsPatchOf,
  budgetText,
  builtLinks,
  capFor,
  draftHref,
  changedSinceText,
  hiddenActivityText,
  lastRunText,
  lastReadText,
  levelsDraftOf,
  KIND_LABEL,
  levelsPatchOf,
  levelsUpTo,
  taskChangeText,
  previewText,
  runAnswerText,
  scenarioStepsText,
  skippedText,
  statusText,
  undoReasonText,
  usesKind,
  validateAgents,
  waitingKindLabel,
  waitingText,
} from './agentsText';
import { ACTION_KINDS } from './agentTypes';
import type { ActionKind, AgentAction } from './agentTypes';
import { ACT_APPLIED_AUTO, ACT_CAMPAIGN_CREATE, ACT_CANVAS_CREATE, ACT_PLAN_TEMPLATE, ACT_SCENARIO_CREATE, ACT_SEGMENT_CREATE, ACT_DRAFT_REPLY, ACT_DRAFT_TICKET, ACT_INITIATIVE, ACT_LIFECYCLE, ACT_PLAN_START, ACT_TASK_CREATE, ACT_UNDONE, AGENT_SETTINGS, BUILT_RULE_ID, BUILT_SEGMENT_ID, BUILT_TEMPLATE_ID, CARDS } from './testAgentsFixtures';
import { B_SURVEY } from './testBundleFixtures';

describe('task kinds', () => {
  it('words a task change without its title, and the preview puts the title in front', () => {
    expect(taskChangeText(ACT_UNDONE)).toBe('Due date 7 Oct 2026 → 20 Oct 2026');
    expect(previewText(ACT_UNDONE)).toBe(`Send the QBR deck: ${taskChangeText(ACT_UNDONE)}`);
  });
});

describe('previews (contract "preview")', () => {
  it('words each kind', () => {
    expect(previewText(ACT_LIFECYCLE)).toBe('Lifecycle stage: Live → Renewal');
    expect(previewText(ACT_TASK_CREATE)).toBe('Create a task: Call Pizza Hut about the renewal, for Carl CSM, due 12 Oct 2026, high priority');
    expect(previewText(ACT_UNDONE)).toBe('Send the QBR deck: Due date 7 Oct 2026 → 20 Oct 2026');
    expect(previewText(ACT_INITIATIVE)).toBe('Start an initiative: At-risk ARR, Analytics Suite, target 10% by 31 Dec 2026');
    expect(previewText({ ...ACT_LIFECYCLE, kind: 'note.create', preview: { note: { title: 'What the call settled' } } })).toBe('File a note: What the call settled');
  });
});

describe('jira comment preview (round 2 D1)', () => {
  it('reads a Jira comment', () => {
    const comment = { ...ACT_TASK_CREATE, kind: 'jira.comment' as const, preview: { jira_comment: { site: 'acme.atlassian.net', issue: 'SUP-12', excerpt: 'Seen again.', as: 'Jira Bot', internal: true } } };
    expect(previewText(comment)).toBe('Comment on SUP-12 in Jira');
    const later = { ...comment, preview: { jira_comment: { ...comment.preview.jira_comment, issue: '{{step 1.ticket_key}}' } } };
    expect(previewText(later)).toBe('Comment in Jira on the issue from step 1');
  });
});

describe('Slack bundle previews (2026-10-17)', () => {
  const survey = {
    survey_type: 'csat' as const,
    question: 'How satisfied are you?',
    subject: 'How did we do?',
    intro: '',
    roles: ['Champion'],
    record: 'Pizza Hut',
    timing: 'now' as const,
    issue: null,
    audience: null,
    wait: null,
  };
  const record = { ...ACT_TASK_CREATE, kind: 'survey.record' as const, preview: { record_survey: survey } };

  it('words a survey to one record, now or once the Jira issue is resolved', () => {
    expect(previewText(record)).toBe("Send a CSAT survey to Pizza Hut's Champion: How did we do?");
    expect(previewText({ ...record, preview: { record_survey: { ...survey, timing: 'after_jira' as const, issue: 'KAN-12' } } })).toBe(
      "Send a CSAT survey to Pizza Hut's Champion: How did we do?, when KAN-12 is resolved",
    );
    // A proposed step keeps the placeholder; the panel draws it as a chip.
    expect(previewText({ ...record, preview: { record_survey: { ...survey, timing: 'after_jira' as const, issue: '{{step 1.ticket_key}}' } } })).toBe(
      "Send a CSAT survey to Pizza Hut's Champion: How did we do?, when {{step 1.ticket_key}} is resolved",
    );
    expect(previewText({ ...record, preview: { record_survey: { ...survey, roles: [] } } })).toBe("Send a CSAT survey to Pizza Hut's contacts: How did we do?");
  });

  it('words a segment pin and a scenario run', () => {
    const pin = { ...ACT_TASK_CREATE, kind: 'segment.pin' as const, preview: { segment_pin: { segment: { id: 4, name: 'At-risk renewals', members: 12 }, record: 'Pizza Hut', from: 'Not pinned', to: 'Pinned' } } };
    expect(previewText(pin)).toBe('Add Pizza Hut to At-risk renewals, 12 members');
    expect(previewText({ ...pin, preview: { segment_pin: { ...pin.preview.segment_pin, segment: { id: null, name: 'New', members: 1 } } } })).toBe('Add Pizza Hut to New, 1 member');
    const run = { ...ACT_TASK_CREATE, kind: 'scenario.run' as const, preview: { scenario_run: { scenario: { id: 7, name: 'Escalation playbook' }, record: 'Pizza Hut', run: null } } };
    expect(previewText(run)).toBe('Run Escalation playbook on Pizza Hut');
    expect([KIND_LABEL['survey.record'], KIND_LABEL['segment.pin'], KIND_LABEL['scenario.run']]).toEqual(['Send a survey to this customer', 'Add to a segment', 'Run a scenario']);
  });
});

describe('statuses and undo', () => {
  it('says who decided, or Auto', () => {
    expect(statusText(ACT_LIFECYCLE, 1)).toBe('Waiting for a decision');
    expect(statusText(ACT_APPLIED_AUTO, 1)).toBe('Applied automatically');
    expect(statusText(ACT_UNDONE, 1)).toBe('Undone by you');
    expect(statusText({ ...ACT_LIFECYCLE, status: 'rejected', decided_by: { id: 2, name: 'Mona Manager' } }, 1)).toBe('Rejected by Mona Manager');
    expect(statusText({ ...ACT_LIFECYCLE, status: 'expired' }, 1)).toBe('Expired');
  });

  it('words each undo reason and CHANGED_SINCE', () => {
    expect(undoReasonText('expired')).toBe('Undo was available for 7 days.');
    expect(undoReasonText('cant_decide')).toBe('Only someone who could approve this can undo it.');
    expect(undoReasonText('changed_since')).toBe('This has changed since it applied.');
    expect(changedSinceText('Churn', 'Renewal')).toBe('Now: Churn · Agent set: Renewal');
  });
});

describe('agent cards', () => {
  it('words the last run, a skip, the budget and a run', () => {
    expect(lastRunText(CARDS[0])).toBe('Last run 8 Oct 2026: 4 proposed, 1 applied');
    expect(lastRunText(CARDS[1])).toBe('Has not run yet.');
    expect(lastRunText(CARDS[2])).toBe('Switched off.');
    expect(skippedText('budget', '2026-11-01')).toBe('Budget used up: resumes on 1 Nov 2026.');
    expect(skippedText('ai_off', '2026-11-01')).toBe('AI is switched off for this workspace.');
    expect(budgetText(CARDS[0])).toBe('12 of 133 credits this month · resets on 1 Nov 2026');
    expect(runAnswerText(CARDS[0])).toBe('The CS agent ran: 4 proposed, 1 applied.');
  });
});

describe('levels and the grid (Decision 6)', () => {
  it('offers only what max_level allows', () => {
    expect(levelsUpTo('auto')).toEqual(['auto', 'ask', 'never']);
    expect(levelsUpTo('ask')).toEqual(['ask', 'never']);
    expect(levelsUpTo('never')).toEqual(['never']);
  });

  it('patches only the cells that changed', () => {
    const draft = levelsDraftOf(AGENT_SETTINGS);
    expect(levelsPatchOf(AGENT_SETTINGS, draft)).toEqual({});
    draft.cs['record.lifecycle'] = 'auto';
    draft.ops['initiative.create'] = 'never';
    expect(levelsPatchOf(AGENT_SETTINGS, draft)).toEqual({ levels: { cs: { 'record.lifecycle': 'auto' }, ops: { 'initiative.create': 'never' } } });
  });
});

describe('the agents form (Decision 7)', () => {
  it('checks budgets in the contract words and patches only changes', () => {
    const draft = agentsDraftOf(AGENT_SETTINGS);
    expect(agentsPatchOf(AGENT_SETTINGS, draft)).toEqual({});
    draft.cs.budget = '2001';
    draft.sales.budget = '1.5';
    expect(validateAgents(draft, 2000)).toEqual({
      cs: 'Choose a whole number from 0 to 2000.',
      sales: 'Choose a whole number from 0 to 2000.',
    });
    const fixed = { ...agentsDraftOf(AGENT_SETTINGS), ai_enabled: false };
    fixed.cs = { enabled: false, budget: '200' };
    expect(validateAgents(fixed, 2000)).toEqual({});
    expect(agentsPatchOf(AGENT_SETTINGS, fixed)).toEqual({ ai_enabled: false, agents: { cs: { enabled: false, monthly_credits: 200 } } });
  });
});

describe('the hidden line and the Waiting label', () => {
  it('counts what the reader cannot open, never naming it', () => {
    expect(hiddenActivityText(0)).toBeNull();
    expect(hiddenActivityText(1)).toBe("1 more about a record you can't open");
    expect(hiddenActivityText(3)).toBe("3 more about records you can't open");
  });

  it('labels a Waiting item by agent and kind', () => {
    expect(waitingKindLabel(ACT_LIFECYCLE)).toBe('CS agent · Change lifecycle stage');
    expect(AGENTS.EMPTY_TITLE).toBe('No agent actions yet');
  });
});

describe('fix round 1 edge cases', () => {
  const task = (t: object) => ({ ...ACT_TASK_CREATE, preview: { task: { title: 'Ring', ...t } } });

  it('builds a task.create preview from the parts that exist', () => {
    expect(previewText(task({}))).toBe('Create a task: Ring');
    expect(previewText(task({ assignee: null, due_date: '2026-10-12' }))).toBe('Create a task: Ring, due 12 Oct 2026');
    expect(previewText(task({ assignee: { id: 3, name: 'Carl CSM' }, priority: 'low' }))).toBe('Create a task: Ring, for Carl CSM, low priority');
  });

  it('formats a snooze date and keeps the reason', () => {
    const snooze = { ...ACT_UNDONE, kind: 'task.snooze' as const, preview: { task: { id: 1, title: 'Roadmap review' }, field: 'Snoozed until', from: '2026-10-08', to: '2026-11-01 (snoozed: waiting on legal)' } };
    expect(previewText(snooze)).toBe('Roadmap review: Snoozed until 8 Oct 2026 → 1 Nov 2026 (snoozed: waiting on legal)');
  });

  it('words a reassign and a null from or to', () => {
    const re = { ...ACT_UNDONE, kind: 'task.reassign' as const, preview: { task: { id: 1, title: 'QBR deck' }, field: 'Assignee', from: 'Carl CSM', to: 'Dana CSM' } };
    expect(previewText(re)).toBe('QBR deck: Assignee Carl CSM → Dana CSM');
    expect(previewText({ ...ACT_LIFECYCLE, preview: { field: 'Owner', to: 'Dana CSM' } })).toBe('Owner: Nobody → Dana CSM');
    expect(previewText({ ...ACT_LIFECYCLE, preview: { field: 'Owner' } })).toBe('Owner: Nobody → Nobody');
  });

  it('knows who uses a kind, the cap, and clamps the patch', () => {
    expect(usesKind(AGENT_SETTINGS.kinds, 'ops', 'record.lifecycle')).toBe(false);
    expect(usesKind(AGENT_SETTINGS.kinds, 'cs', 'record.lifecycle')).toBe(true);
    expect(capFor(AGENT_SETTINGS.kinds, 'record.owner')).toBe('ask');
    const draft = levelsDraftOf(AGENT_SETTINGS);
    draft.cs['record.owner'] = 'auto';
    draft.ops['record.lifecycle'] = 'auto';
    expect(levelsPatchOf(AGENT_SETTINGS, draft)).toEqual({});
    draft.cs['record.owner'] = 'never';
    expect(levelsPatchOf(AGENT_SETTINGS, draft)).toEqual({ levels: { cs: { 'record.owner': 'never' } } });
  });

  it('clamps a stored level above the kind\'s cap down to the cap', () => {
    // task.complete caps at ask; a level stored before the cap was set may still read auto.
    const stored = { ...AGENT_SETTINGS, levels: { ...AGENT_SETTINGS.levels, cs: { ...AGENT_SETTINGS.levels.cs, 'task.complete': 'auto' as const } } };
    const draft = levelsDraftOf(stored);
    expect(levelsPatchOf(stored, draft)).toEqual({ levels: { cs: { 'task.complete': 'ask' } } });
    draft.cs['task.complete'] = 'never';
    expect(levelsPatchOf(stored, draft)).toEqual({ levels: { cs: { 'task.complete': 'never' } } });
  });

  it('checks budget edge cases', () => {
    const at = (budget: string) => validateAgents({ ...agentsDraftOf(AGENT_SETTINGS), cs: { enabled: true, budget } }, 2000).cs;
    const bad = 'Choose a whole number from 0 to 2000.';
    expect(at('')).toBe(bad);
    expect(at('-1')).toBe(bad);
    expect(at('abc')).toBe(bad);
    expect(at('0')).toBeUndefined();
    expect(at('2000')).toBeUndefined();
    expect(at('2001')).toBe(bad);
  });

  it('words statuses for a person and for none', () => {
    expect(statusText({ ...ACT_LIFECYCLE, status: 'applied', decided_by: { id: 2, name: 'Mona Manager' } }, 1)).toBe('Applied by Mona Manager');
    expect(statusText({ ...ACT_LIFECYCLE, status: 'applied', decided_by: { id: 1, name: 'Alice' } }, 1)).toBe('Applied by you');
    expect(statusText({ ...ACT_LIFECYCLE, status: 'applied' }, 1)).toBe('Applied');
  });

  it('words all six skipped reasons, in a card and in an answer', () => {
    const want = {
      ai_off: 'AI is switched off for this workspace.',
      disabled: 'Switched off.',
      no_actions: 'Every action is set to never.',
      budget: 'Budget used up: resumes on 1 Nov 2026.',
      credits: 'Workspace credits are used up.',
      failed: 'The last run failed. Try Run now.',
    } as const;
    for (const [reason, text] of Object.entries(want)) {
      expect(skippedText(reason as keyof typeof want, '2026-11-01')).toBe(text);
      const card = { ...CARDS[0], last_run: { ...CARDS[0].last_run!, skipped_reason: reason as keyof typeof want } };
      expect(lastRunText(card)).toBe(text);
    }
    const skipped = (r: keyof typeof want) => runAnswerText({ ...CARDS[1], last_run: { ...CARDS[0].last_run!, skipped_reason: r } });
    expect(skipped('budget')).toBe('The Sales agent did not run. Budget used up: resumes on 1 Nov 2026.');
    expect(skipped('failed')).toBe('The Sales agent could not run. Try again.');
  });
});

describe('delivery 2 kinds (contract "New action kinds")', () => {
  it('puts both kinds after File a note and before Start an initiative, with the contract labels', () => {
    expect(ACTION_KINDS.slice(8, 11)).toEqual(['note.create', 'draft.reply', 'plan.start']);
    expect(ACTION_KINDS[ACTION_KINDS.length - 1]).toBe('initiative.create');
    expect(KIND_LABEL['draft.reply']).toBe('Draft a reply');
    expect(KIND_LABEL['plan.start']).toBe('Start a plan');
  });

  it('words an email draft, a ticket draft and a plan', () => {
    expect(previewText(ACT_DRAFT_REPLY)).toBe('Draft a reply to Ann Lee <ann@x.com>: Re: Renewal terms');
    expect(previewText(ACT_DRAFT_TICKET)).toBe('Draft a reply on TKT-1042: Export fails');
    expect(previewText(ACT_PLAN_START)).toBe('Start a plan: Onboarding, 3 milestones, 9 tasks');
    expect(previewText({ ...ACT_PLAN_START, preview: { plan: { template: 'QBR', milestones: 1, tasks: 1 } } })).toBe('Start a plan: QBR, 1 milestone, 1 task');
  });

  it('names the kind in Waiting', () => {
    expect(waitingKindLabel(ACT_PLAN_START)).toBe('CS agent · Start a plan');
  });

  it('links a draft, and starts every result key at null', () => {
    expect(draftHref(7)).toBe('/communications?draft=7');
    expect(Object.values(ACT_PLAN_START.result).every((value) => value === null)).toBe(true);
  });
});

describe('delivery 3 kinds (contract "New kinds")', () => {
  const BUILDER: ActionKind[] = ['segment.create', 'scenario.create', 'campaign.create', 'campaign.send', 'survey.send', 'canvas.create', 'plan.template'];

  it('puts the seven builder kinds after Start a plan and before Start an initiative, with the contract labels', () => {
    expect(ACTION_KINDS.slice(10)).toEqual(['plan.start', ...BUILDER.slice(0, 5), 'mail.send_reply', 'slack.reply', 'jira.create', 'jira.assign', 'jira.comment', ...BUILDER.slice(5), 'survey.record', 'segment.pin', 'scenario.run', 'record.diagnose', 'mail.compose', 'mail.send_draft', 'report.sales', 'initiative.create']);
    expect(BUILDER.map((kind) => KIND_LABEL[kind])).toEqual(['Build a segment', 'Build a scenario', 'Draft a campaign', 'Send a campaign', 'Send a survey', "Map a record's people", 'Write a plan template']);
  });

  it('words each builder preview, plurals included', () => {
    expect(previewText(ACT_SEGMENT_CREATE)).toBe('Build a segment: Poor health renewals, 2 conditions, 12 organisations');
    expect(previewText({ ...ACT_SEGMENT_CREATE, preview: { segment: { kind: 'contact', name: 'Champions', conditions: 1, members: 1 } } })).toBe(
      'Build a segment: Champions, 1 condition, 1 contact',
    );
    expect(previewText(ACT_SCENARIO_CREATE)).toBe('Build a scenario: Health watch, on Poor health renewals');
    expect(previewText(ACT_CAMPAIGN_CREATE)).toBe('Draft a campaign: Champion check-in (At-risk organisations, Champion): Checking in, {first_name}');
    expect(previewText({ ...ACT_CAMPAIGN_CREATE, preview: { campaign: { ...ACT_CAMPAIGN_CREATE.preview.campaign!, roles: [] } } })).toBe(
      'Draft a campaign: Champion check-in (At-risk organisations): Checking in, {first_name}',
    );
    expect(previewText({ ...ACT_CAMPAIGN_CREATE, kind: 'campaign.send' })).toBe('Send a campaign: Champion check-in (At-risk organisations, Champion): Checking in, {first_name}');
    expect(previewText({ ...ACT_CAMPAIGN_CREATE, kind: 'survey.send', preview: B_SURVEY.steps[0].preview })).toBe('Send a survey: Q4 NPS (At-risk champions, Champion): Two minutes for Pizza Hut?');
    expect(previewText({ ...ACT_CAMPAIGN_CREATE, kind: 'survey.send', preview: { survey: { ...B_SURVEY.steps[0].preview.survey!, roles: [] } } })).toBe('Send a survey: Q4 NPS (At-risk champions): Two minutes for Pizza Hut?');
    expect(previewText(ACT_CANVAS_CREATE)).toBe("Map a record's people: Pizza Hut people, 6 people");
    expect(previewText({ ...ACT_CANVAS_CREATE, preview: { canvas: { name: 'Solo', people: 1 } } })).toBe("Map a record's people: Solo, 1 person");
    expect(previewText(ACT_PLAN_TEMPLATE)).toBe('Write a plan template: Save play for at-risk renewals (Save), 3 milestones, 9 tasks');
  });

  it("joins a scenario's trigger and steps, the server's sentences unchanged", () => {
    expect(scenarioStepsText(ACT_SCENARIO_CREATE.preview.scenario!)).toBe('Entered the segment \u00b7 Task the owner \u00b7 Notify me');
  });

  it('never falls back to "from -> to" for a builder kind', () => {
    for (const action of [ACT_SEGMENT_CREATE, ACT_SCENARIO_CREATE, ACT_CAMPAIGN_CREATE, ACT_CANVAS_CREATE, ACT_PLAN_TEMPLATE]) {
      expect(previewText(action), action.kind).not.toContain('\u2192');
    }
  });

  it('names a builder kind in Waiting', () => {
    expect(waitingKindLabel(ACT_SEGMENT_CREATE)).toBe('Ops agent \u00b7 Build a segment');
  });

  it('starts all ten result keys at null', () => {
    expect(ACT_SEGMENT_CREATE.result).toEqual({
      task_id: null,
      note_id: null,
      initiative_id: null,
      draft_id: null,
      plan_id: null,
      segment_id: null,
      rule_id: null,
      campaign_id: null,
      canvas_id: null,
      template_id: null,
    });
  });
});

describe('builtLinks (delivery 3, Decision 2)', () => {
  const applied = (action: AgentAction, result: Partial<AgentAction['result']>): AgentAction => ({
    ...action,
    status: 'applied',
    result: { ...action.result, ...result },
  });

  it('links nothing until the action is applied, and nothing once it is undone', () => {
    expect(builtLinks(ACT_SEGMENT_CREATE)).toEqual([]);
    expect(builtLinks({ ...applied(ACT_SEGMENT_CREATE, { segment_id: BUILT_SEGMENT_ID }), status: 'undone' })).toEqual([]);
  });

  it('links a scenario before its segment, and a template to its editor', () => {
    expect(builtLinks(applied(ACT_SCENARIO_CREATE, { rule_id: BUILT_RULE_ID, segment_id: BUILT_SEGMENT_ID }))).toEqual([
      { label: 'Open scenario', to: `/scenarios/rules/${BUILT_RULE_ID}` },
      { label: 'Open segment', to: `/segments/${BUILT_SEGMENT_ID}` },
    ]);
    expect(builtLinks(applied(ACT_PLAN_TEMPLATE, { template_id: BUILT_TEMPLATE_ID }))).toEqual([
      { label: 'Open template', to: `/projects/templates/${BUILT_TEMPLATE_ID}/edit` },
    ]);
  });
});

describe('delivery 3 final review fixes', () => {
  it('links nothing when an applied result lacks the five newer keys', () => {
    const { rule_id, campaign_id, segment_id, canvas_id, template_id, ...older } = ACT_LIFECYCLE.result;
    void [rule_id, campaign_id, segment_id, canvas_id, template_id];
    const action = { ...ACT_LIFECYCLE, status: 'applied', result: older } as unknown as AgentAction;
    expect(builtLinks(action)).toEqual([]);
  });

  it('words a segment preview with an unknown kind without crashing', () => {
    const base = ACT_SEGMENT_CREATE;
    const action = { ...base, preview: { ...base.preview, segment: { ...base.preview.segment!, kind: 'partner', members: 3 } } } as unknown as AgentAction;
    expect(previewText(action)).toContain('3 partner');
  });
});

it('says the agents read messages on the interval, not only each night', () => {
  expect(AGENTS.SETTINGS_INTRO).toBe('Three agents read the workspace each night and customer messages on the schedule below. They propose or apply actions within the budget and the rules you set here.');
});

it('says when agents last read messages (Decision 12)', () => {
  expect(lastReadText(null)).toBe('Not read yet.');
  expect(lastReadText('2026-10-08T09:00:02Z')).toMatch(/^Last read .+\.$/);
});

it('says how many conversations wait on credits (agent bundles D2-23; Decision 13)', () => {
  expect(waitingText(CARDS[0])).toBeNull();
  expect(waitingText({ ...CARDS[0], waiting_threads: 3, waiting_reason: 'budget' })).toBe("3 conversations are waiting: this agent's credits are used up until 1 Nov 2026.");
  expect(waitingText({ ...CARDS[0], waiting_threads: 1, waiting_reason: 'credits' })).toBe('1 conversation is waiting: the workspace is out of AI credits.');
});

describe('outside previews (agent bundles D3 contract §2)', () => {
  const base = { id: 1, agent: 'cs' as const, title: 't', status: 'proposed' as const, record: null, rationale: '', evidence: [], decided_by: null, decided_at: null, auto: false, applied_at: null, undo: null, undone_by: null, undone_at: null, result: {} as never, created_at: '', bundle: 1 };

  it('says what each outside step will do', () => {
    expect(previewText({ ...base, kind: 'mail.send_reply', preview: { mail: { from: 'alice@acme.io', to: ['ann@pizzahut.com'], cc: [], subject: 'Re: Login loop', excerpt: '', threaded: true } } } as never)).toBe('Send a reply to ann@pizzahut.com: Re: Login loop');
    expect(previewText({ ...base, kind: 'slack.reply', preview: { slack: { channel: '#support', in_thread: true, as: 'revenact', excerpt: '' } } } as never)).toBe('Reply in Slack in #support, in the thread');
    expect(previewText({ ...base, kind: 'slack.reply', preview: { slack: { channel: '#escalations', in_thread: false, as: 'revenact', excerpt: '' } } } as never)).toBe('Post in Slack in #escalations');
    expect(previewText({ ...base, kind: 'jira.create', preview: { jira: { site: 'acme.atlassian.net', project: 'SUP', issue_type: 'Bug', summary: 'Login loop', excerpt: '', priority: null, assignee: null, as: 'Jira Bot' } } } as never)).toBe('Create a Jira Bug in SUP: Login loop');
    expect(previewText({ ...base, kind: 'jira.create', preview: { jira: { site: '', project: '', issue_type: 'Task', summary: 'Login loop', excerpt: '', priority: null, assignee: null, as: '' } } } as never)).toBe('Create a Jira Task: Login loop');
    expect(previewText({ ...base, kind: 'jira.assign', preview: { jira_assign: { site: '', issue: 'SUP-12', assignee: { name: 'Erin Eng', matched_later: false }, as: '' } } } as never)).toBe('Assign SUP-12 in Jira to Erin Eng');
  });
});

describe('shortStepLabel (Work home step chain)', () => {
  it('has a short label for every action kind', () => {
    for (const kind of ACTION_KINDS) expect(SHORT_KIND_LABEL[kind], kind).toBeTruthy();
  });

  it('shortens a step label or a kind, and passes anything else through', () => {
    expect(shortStepLabel('Create a Jira issue')).toBe('Jira');
    expect(shortStepLabel('Reply in Slack')).toBe('Reply');
    expect(shortStepLabel('task.create')).toBe('To-do');
    expect(shortStepLabel('Something new')).toBe('Something new');
  });
});

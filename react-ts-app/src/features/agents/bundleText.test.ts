import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { timeLabel } from '../organizations/storyDays';
import { B_CAMPAIGN, B_DEPT, B_DONE, B_MAIL, B_OUTSIDE, B_OUTSIDE_DONE, B_PARTLY, B_PIZZA, B_REJECTED, B_SURVEY, B_TICKET, B_UNASSIGNED, bundleItem } from './testBundleFixtures';
import { whenText } from './whenText';
import type { MessageSource } from './bundleTypes';
import {
  addressesText,
  audienceText,
  fromText,
  historyLinks,
  changedFields,
  isAppPath,
  isExternal,
  listFailed,
  listLoading,
  listNoun,
  parseAddresses,
  bundleForText,
  assignedAsText,
  commentsAsText,
  jiraAsText,
  linkHintText,
  onIssueText,
  OUTSIDE,
  openInText,
  routedText,
  sourceParts,
  draftOf,
  finishedByText,
  historyFiltersOf,
  historyParams,
  isDirty,
  outputLinks,
  readRunRefusal,
  runBody,
  runLabel,
  selectedCount,
  showsCantUndo,
  stepSave,
  stepStateText,
  stepAsAction,
  summaryText,
  textParts,
} from './bundleText';

describe('bundleText (agent bundles D1, frontend Decisions 6 to 15)', () => {
  it('starts every runnable step ticked and every other step unticked', () => {
    const draft = draftOf(B_PIZZA);
    expect([draft[41].selected, draft[42].selected, draft[43].selected]).toEqual([true, true, false]);
    expect(selectedCount(B_PIZZA, draft)).toBe(2);
    expect(runLabel(2)).toBe('Run 2 selected');
    expect(runLabel(1)).toBe('Run 1 selected');
  });

  it('names every waiting step once and sends only changed fields on ticked steps', () => {
    const draft = draftOf(B_PIZZA);
    expect(isDirty(B_PIZZA, draft)).toBe(false);
    draft[41].fields = { ...draft[41].fields, title: 'Call today' };
    draft[42].selected = false;
    draft[42].fields = { ...draft[42].fields, body: 'Ignored' };
    expect(isDirty(B_PIZZA, draft)).toBe(true);
    expect(runBody(B_PIZZA, draft)).toEqual({
      steps: [
        { id: 41, selected: true, fields: { title: 'Call today' } },
        { id: 42, selected: false },
        { id: 43, selected: false },
      ],
    });
  });

  it("shows Can't be undone while Save as draft only is off", () => {
    const send = { ...B_CAMPAIGN.steps[0], fields: { ...B_CAMPAIGN.steps[0].fields, draft_only: false } };
    expect(showsCantUndo(send, send.fields)).toBe(true);
    expect(showsCantUndo(send, { ...send.fields, draft_only: true })).toBe(false);
    expect(showsCantUndo(B_PIZZA.steps[0], B_PIZZA.steps[0].fields)).toBe(false);
  });

  it('turns placeholders into chips, never raw braces, and leaves other braces alone', () => {
    const task = B_CAMPAIGN.steps[1];
    expect(task.title).not.toContain('{{');
    expect(textParts(task.preview.task!.title, task.placeholders)).toEqual(['Follow up on ', { chip: 'Campaign link from step 1' }]);
    expect(textParts('Hi {first_name} {{nope}}', [])).toEqual(['Hi {first_name} {{nope}}']);
    expect(textParts('{{ step 2.task_id }}', [])).toEqual([{ chip: 'From step 2' }]);
  });

  it('says the audience, the summary and the links', () => {
    expect(audienceText(B_SURVEY.steps[0].preview.survey!.audience!, 500)).toBe('42 contacts across 3 organisations · at most 500');
    expect(audienceText({ contacts: 1, records: 1, record_noun: 'accounts' })).toBe('1 contact across 1 account');
    expect(summaryText(B_PARTLY)).toBe('1 of 2 steps ran. Retry the failed one.');
    expect(summaryText({ ...B_PARTLY, status: 'done', steps: [B_PARTLY.steps[0]] })).toBe('Done: all 1 step ran.');
    expect(outputLinks({ task_id: 9, task_url: '/work/mine?task=9', segment_id: 5, segment_url: '/segments/5', note_id: 3 })).toEqual([
      { label: 'Open task', to: '/work/mine?task=9' },
      { label: 'Open segment', to: '/segments/5' },
    ]);
  });

  it('says a send saved as a draft was saved, not applied', () => {
    const send = { ...B_CAMPAIGN.steps[0], status: 'applied' as const, fields: { ...B_CAMPAIGN.steps[0].fields, draft_only: false } };
    expect(stepStateText(send)).toBe('Applied');
    expect(stepStateText({ ...send, fields: { ...send.fields, draft_only: true } })).toBe('Saved as a draft.');
    expect(stepStateText({ ...B_PIZZA.steps[0], status: 'applied' as const, fields: { ...B_PIZZA.steps[0].fields, draft_only: true } })).toBe('Applied');
  });

  it("says a campaign's audience with no cap", () => {
    const campaign = B_CAMPAIGN.steps[0].preview.campaign!;
    expect(campaign.limit).toBeNull();
    expect(audienceText(campaign.audience!, campaign.limit)).toBe('42 contacts across 3 organisations');
  });

  it('names only steps that can be retried, and pluralises the count', () => {
    const expired = { ...B_PARTLY.steps[0], status: 'expired' as const, expired_reason: 'changed' };
    const applied = { ...B_PARTLY.steps[0], status: 'applied' as const };
    const failed = { ...B_PARTLY.steps[0], status: 'failed' as const };
    expect(summaryText({ ...B_PARTLY, steps: [applied, applied, expired] })).toBe('2 of 3 steps ran.');
    expect(summaryText({ ...B_PARTLY, steps: [failed] })).toBe('0 of 1 step ran. Retry the failed one.');
    expect(summaryText({ ...B_PARTLY, steps: [failed, failed] })).toBe('0 of 2 steps ran. Retry the failed ones.');
  });

  it('reads a run refusal: a form line, field errors by step, a 409 bundle', () => {
    expect(readRunRefusal(new ApiError(400, { steps: ['Choose at least one step to run.'] }, 'Bad request'))).toEqual({ form: 'Choose at least one step to run.', fields: {}, bundle: null, lost: false });
    expect(readRunRefusal(new ApiError(400, { steps: { 41: { title: ['Give the task a title.'] } } }, 'Bad request')).fields).toEqual({ 41: { title: 'Give the task a title.' } });
    const conflict = readRunRefusal(new ApiError(409, { code: 'BUNDLE_RAN', detail: 'Carl CSM ran this at 10:42.', bundle: B_PARTLY }, 'Conflict'));
    expect([conflict.form, conflict.bundle?.id]).toEqual(['Carl CSM ran this at 10:42.', 16]);
    expect(readRunRefusal(new ApiError(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' }, 'Not found')).lost).toBe(true);
  });

  it('reads a step as an action for the shared preview, braces turned into words', () => {
    const action = stepAsAction(B_CAMPAIGN, B_CAMPAIGN.steps[1]);
    expect(action.bundle).toBe(13);
    expect(action.preview.task?.title).toBe('Follow up on Campaign link from step 1');
    expect(JSON.stringify(action)).not.toContain('{{');
  });

  it('reads History filters from the URL and writes them back, page 1 left out', () => {
    expect(historyFiltersOf(new URLSearchParams('queue=history&agent=ops&status=done&step_kind=survey.send&page=2'))).toEqual({ agent: 'ops', step_kind: 'survey.send', status: 'done', page: 2 });
    expect(historyFiltersOf(new URLSearchParams('agent=robot&status=waiting&page=x'))).toEqual({ agent: null, step_kind: null, status: null, page: 1 });
    expect(historyParams({ agent: 'cs', step_kind: null, status: null, page: 1 }, new URLSearchParams('queue=history&bundle=4')).toString()).toBe('queue=history&agent=cs');
  });

  it('names who finished a bundle only when the bundle says (contract §5.3: a reject sets no run_by)', () => {
    expect(finishedByText(B_DONE)).toBe('Ran by Carl CSM');
    expect(finishedByText({ ...B_DONE, run_by: null })).toBe('Applied on its own');
    expect(finishedByText({ ...B_REJECTED, rejected_by: null })).toBeNull();
    expect(finishedByText(B_REJECTED)).toBe('Rejected by Carl CSM');
    expect(finishedByText({ ...B_REJECTED, rejected_by: null, run_by: { id: 1, name: 'Alice' } })).toBe('Rejected by Alice');
    expect(finishedByText({ ...B_PARTLY, status: 'expired' })).toBeNull();
    expect(finishedByText({ ...B_PARTLY, status: 'superseded' })).toBeNull();
  });
});

describe('where a bundle came from (agent bundles D2 §3.1; Decisions 3, 5)', () => {
  it('names the source, the ticket and the sender, and the message count for mail', () => {
    expect(sourceParts(B_TICKET.source)).toEqual(['Zendesk ZD-1042 from ann@pizzahut.com']);
    expect(sourceParts(B_MAIL.source)).toEqual(['Email from ann@pizzahut.com', '3 messages']);
    expect(sourceParts({ ...(B_MAIL.source as MessageSource), messages: 1, from: '' })).toEqual(['Email']);
  });

  it('says the time today and the day and time before', () => {
    const iso = '2026-10-07T09:58:12Z';
    const clock = timeLabel({ occurred_at: iso, all_day: false });
    expect(whenText(iso, new Date(iso))).toBe(clock);
    expect(whenText(iso, new Date('2026-10-20T12:00:00Z'))).toBe(`7 Oct 2026, ${clock}`);
  });

  it('says who a routed bundle is for', () => {
    expect(bundleForText(B_DEPT)).toBe('For Customer Success');
    expect(bundleForText(B_UNASSIGNED)).toBe('Unassigned');
    expect(bundleForText(B_TICKET)).toBe('For Alice');
    expect(openInText('Zendesk')).toBe('Open in Zendesk (opens in a new tab)');
    expect(routedText(bundleItem(B_DEPT, true).detail)).toBe('For Customer Success');
    expect(routedText(bundleItem(B_UNASSIGNED, true).detail)).toBe('Unassigned');
    expect(routedText(bundleItem(B_TICKET).detail)).toBeNull();
  });
});

describe('saving a step (agent bundles D2 §4.1; Decision 6)', () => {
  const s = B_TICKET.steps[1];
  it('sends only changed fields, or the tick when it changed', () => {
    expect(stepSave(s, { selected: true, fields: { ...s.fields } }, { tick: false })).toBeNull();
    expect(stepSave(s, { selected: true, fields: { ...s.fields, title: 'Fix it today' } }, { tick: false })).toEqual({ fields: { title: 'Fix it today' } });
    expect(stepSave(s, { selected: false, fields: { ...s.fields } }, { tick: true })).toEqual({ selected: false });
    expect(stepSave({ ...s, status: 'failed' }, { selected: true, fields: { title: 'x' } }, { tick: false })).toBeNull();
  });
});

describe('outside words (agent bundles D3)', () => {
  it('reads addresses typed as one line', () => {
    expect(parseAddresses(' ann@pizzahut.com, ops@pizzahut.com;  sam@x.com ,,')).toEqual(['ann@pizzahut.com', 'ops@pizzahut.com', 'sam@x.com']);
    expect(addressesText(['a@x.com', 'b@x.com'])).toBe('a@x.com, b@x.com');
    expect(addressesText(null)).toBe('');
  });

  it('names each list', () => {
    expect(listLoading('jira_projects')).toBe('Loading Jira projects…');
    expect(listFailed('jira_assignees')).toBe("Couldn't load people in Jira.");
    expect(listNoun('slack_channels')).toBe('Slack channels');
  });

  it('says who a reply goes from', () => {
    expect(fromText({ from: 'alice@acme.io', to: [], cc: [], subject: '', excerpt: '', threaded: true })).toBe('From alice@acme.io');
    expect(fromText({ from: null, to: [], cc: [], subject: '', excerpt: '', threaded: false })).toBeNull();
  });

  it('follows only a single-slash app path', () => {
    expect(['/work', '/settings/connections'].map(isAppPath)).toEqual([true, true]);
    expect(['//evil.com', '/\\evil.com', 'https://x.com', 'javascript:alert(1)', 'work'].map(isAppPath)).toEqual([false, false, false, false, false]);
  });

  it('starts a model-picked Jira assignee by name, so Unassigned is a change', () => {
    const create = B_OUTSIDE.steps[2];
    const fields = draftOf(B_OUTSIDE)[create.id].fields;
    expect(fields.assignee).toEqual({ id: '', name: 'Erin Eng' });
    expect(changedFields(create, fields)).toEqual({});
    expect(changedFields(create, { ...fields, assignee: null })).toEqual({ assignee: null });
  });

  it('draws only https links as external, and History shows outside ones', () => {
    expect(isExternal({ label: 'x', url: 'https://acme.atlassian.net/browse/SUP-1', external: true })).toBe(true);
    expect(isExternal({ label: 'x', url: 'javascript:alert(1)', external: true })).toBe(false);
    expect(historyLinks(B_OUTSIDE_DONE).map((l) => l.label)).toEqual(['Open SUP-77 in Jira', 'Open the Slack message']);
  });

  it('names who comments in Jira and on what', () => {
    expect(commentsAsText('Jira Bot')).toBe('Comments in Jira as Jira Bot');
    expect(onIssueText('SUP-12')).toBe('On SUP-12');
    expect(OUTSIDE.INTERNAL).toBe('Only your team sees this comment in Jira.');
  });
});

describe('who a Jira step acts as (round 2 D2 Decision 4)', () => {
  it('names you or the connection', () => {
    expect(jiraAsText('Carl Lee', true)).toBe('Created in Jira as you (Carl Lee)');
    expect(jiraAsText('Jira Bot')).toBe('Created in Jira as Jira Bot');
    expect(assignedAsText('Carl Lee', true)).toBe('Assigned in Jira as you (Carl Lee)');
    expect(commentsAsText('Carl Lee', true)).toBe('Comments in Jira as you (Carl Lee)');
  });

  it('hints how to act as yourself', () => {
    expect(linkHintText('none', 'acme.atlassian.net')).toBe('Link your Jira account to act as yourself.');
    expect(linkHintText('other_site', 'acme.atlassian.net')).toBe("Your Jira link doesn't cover acme.atlassian.net.");
    expect(linkHintText('off', 'acme.atlassian.net')).toBeNull();
    expect(linkHintText(null, 'acme.atlassian.net')).toBeNull();
  });
});

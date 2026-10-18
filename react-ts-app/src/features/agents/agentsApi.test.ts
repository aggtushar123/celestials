import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { approveAction, fetchAction, fetchAgentSettings, patchAgentSettings, readAgentRefusal, readFastLaneRefusal, readSignalRefusal, refusalCode, rejectAction, runAgent, undoAction } from './agentsApi';
import { calls, sent, stubAgents } from './testAgents';

afterEach(() => vi.unstubAllGlobals());

describe('agentsApi: the routes the contract names', () => {
  it('reads and patches the settings, runs an agent, reads an action and decides', async () => {
    const { spy } = stubAgents();
    await fetchAgentSettings();
    await patchAgentSettings({ levels: { cs: { 'record.lifecycle': 'auto' } } });
    await runAgent('cs');
    await fetchAction(81);
    await approveAction(81);
    await rejectAction(82, 'Not now');
    await undoAction(83);
    expect(calls(spy, 'GET', '/agents/')).toEqual(['/agents/settings/', '/agents/actions/81/']);
    expect(calls(spy, 'POST', '/agents/')).toEqual(['/agents/cs/run/', '/agents/actions/81/approve/', '/agents/actions/82/reject/', '/agents/actions/83/undo/']);
    expect(sent(spy, 'POST', '/reject/')).toEqual([{ note: 'Not now' }]);
    expect(sent(spy, 'POST', '/approve/')).toEqual([{}]);
  });
});

describe('readAgentRefusal', () => {
  it('places nested settings errors under their agent and kind', () => {
    const err = new ApiError(400, {
      ai_enabled: ['Choose on or off.'],
      agents: { cs: { monthly_credits: ['Choose a whole number from 0 to 2000.'] } },
      levels: { cs: { 'record.owner': ["This action can't be set to auto."] } },
    }, 'Bad');
    expect(readAgentRefusal(err, 'Could not save these settings.')).toEqual({
      top: { ai_enabled: 'Choose on or off.' },
      agents: { cs: { monthly_credits: 'Choose a whole number from 0 to 2000.' } },
      levels: { cs: { 'record.owner': "This action can't be set to auto." } },
      form: null,
    });
  });

  it('puts a detail or an unknown failure on the form', () => {
    expect(readAgentRefusal(new ApiError(403, { detail: 'You do not have permission.' }, 'No'), 'Fallback.').form).toBe('You do not have permission.');
    expect(readAgentRefusal(new Error('offline'), 'Fallback.').form).toBe('Fallback.');
  });

  it('reads a refusal code', () => {
    expect(refusalCode(new ApiError(409, { code: 'BUDGET_USED', detail: 'd' }, 'x'))).toBe('BUDGET_USED');
    expect(refusalCode(new Error('x'))).toBeNull();
  });
});

describe('fix round: refusals and filters', () => {
  it('falls back to the form when an agent entry has no known field', () => {
    const err = new ApiError(400, { agents: { cs: { bogus: ['x'] } }, detail: 'Nope.' }, 'Bad');
    expect(readAgentRefusal(err, 'Fallback.').form).toBe('Nope.');
  });

  it('sends no note when blank', async () => {
    const { spy } = stubAgents();
    await rejectAction(82, '  ');
    expect(sent(spy, 'POST', '/reject/')).toEqual([{}]);
  });
});

describe('readSignalRefusal (contract §4.8)', () => {
  const NONE = { interval: null, sources: {}, form: null };
  it.each([
    ['an interval error, under How often', new ApiError(400, { signal_interval: ['Choose one of the intervals.'] }, 'x'), { ...NONE, interval: 'Choose one of the intervals.' }],
    ['a whole signal_sources error, as the form alert', new ApiError(400, { signal_sources: ['Send a source map.'] }, 'x'), { ...NONE, form: 'Send a source map.' }],
    ['a per-source map, under each switch', new ApiError(400, { signal_sources: { slack: ['Connect Slack first.'], jira: ['Connect Jira first.'] } }, 'x'), { ...NONE, sources: { slack: 'Connect Slack first.', jira: 'Connect Jira first.' } }],
    ['a bare detail, as the form alert', new ApiError(403, { detail: 'You do not have permission.' }, 'x'), { ...NONE, form: 'You do not have permission.' }],
    ['a body with nothing it knows, as the fallback', new ApiError(500, { other: ['x'] }, 'x'), { ...NONE, form: 'Fallback.' }],
    ['anything that is not an ApiError, as the fallback', new TypeError('Failed to fetch'), { ...NONE, form: 'Fallback.' }],
  ])('reads %s', (_name, err, want) => {
    expect(readSignalRefusal(err, 'Fallback.')).toEqual(want);
  });
});

describe('readFastLaneRefusal (round 2 D3 contract §5.2)', () => {
  const NONE = { on: null, words: null, senders: null, slack_connectors: null, jira_priority: null, poor_health: null, per_hour: null, per_day: null, form: null };
  it.each([
    ['a rule refusal, under its row', new ApiError(400, { fast_lane: { rules: { words: ['Use 2 to 40 characters for each word.'] } } }, 'x'), { ...NONE, words: 'Use 2 to 40 characters for each word.' }],
    [
      'top-level and rule keys together',
      new ApiError(400, { fast_lane: { on: ['Choose on or off.'], per_hour: ["The hourly limit can't be more than the daily limit."], rules: { senders: ['Add at most 50 senders.'], slack_connectors: ['Choose Slack connections from the list.'] } } }, 'x'),
      { ...NONE, on: 'Choose on or off.', per_hour: "The hourly limit can't be more than the daily limit.", senders: 'Add at most 50 senders.', slack_connectors: 'Choose Slack connections from the list.' },
    ],
    ['a whole fast_lane error, as the form alert', new ApiError(400, { fast_lane: ['Send the fast lane as one object.'] }, 'x'), { ...NONE, form: 'Send the fast lane as one object.' }],
    ['an unknown key, as the form alert', new ApiError(400, { fast_lane: { colour: ['Unknown setting.'] } }, 'x'), { ...NONE, form: 'Unknown setting.' }],
    ['a bare detail, as the form alert', new ApiError(403, { detail: 'Only admins can change the agents.' }, 'x'), { ...NONE, form: 'Only admins can change the agents.' }],
    ['a body with nothing it knows, as the fallback', new ApiError(500, { other: ['x'] }, 'x'), { ...NONE, form: 'Fallback.' }],
    ['anything that is not an ApiError, as the fallback', new TypeError('Failed to fetch'), { ...NONE, form: 'Fallback.' }],
  ])('reads %s', (_name, err, want) => {
    expect(readFastLaneRefusal(err, 'Fallback.')).toEqual(want);
  });
});

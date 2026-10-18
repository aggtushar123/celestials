import { describe, expect, it } from 'vitest';
import { actionsFor, SAY, scoresFor, STAGES, thresholdRange, triggerOption, WEEKDAYS } from './ruleOptions';

describe('rule options (backend validation, mirrored)', () => {
  it('offers every score to organisations, no CES to accounts and none to contacts', () => {
    expect(scoresFor('customer')).toEqual(['csat', 'nps', 'ces', 'health']);
    expect(scoresFor('account')).toEqual(['csat', 'nps', 'health']);
    expect(scoresFor('contact')).toEqual([]);
    expect(scoresFor(null)).toEqual(['csat', 'nps', 'ces', 'health']);
  });

  it('offers no lifecycle action to a contact segment', () => {
    expect(actionsFor('customer')).toEqual(['notify', 'task', 'lifecycle', 'survey', 'plan', 'campaign']);
    expect(actionsFor('contact')).toEqual(['notify', 'task', 'survey', 'plan', 'campaign']);
  });

  it("words the trigger for the segment's kind", () => {
    expect(triggerOption('entered', 'customer')).toBe('An organisation enters');
    expect(triggerOption('left', 'account')).toBe('An account leaves');
    expect(triggerOption('entered', 'contact')).toBe('A contact enters');
    expect(triggerOption('left', null)).toBe('A record leaves');
    expect(triggerOption('crossed', 'customer')).toBe('A score crosses a line');
    expect(triggerOption('schedule', null)).toBe('On a schedule');
  });

  it("keeps the backend's sentences, the range one per score", () => {
    expect(thresholdRange('nps')).toBe('Choose a value from -100 to 100.');
    expect(thresholdRange('health')).toBe('Choose a value from 0 to 10.');
    expect(SAY.LIMIT_REACHED).toBe('You can own at most 50 rules.');
    expect(SAY.NOT_SEGMENT_OWNER).toBe('A rule can only use your own segments.');
  });

  it('counts weekdays from Monday and lists the lifecycle stages in order', () => {
    expect(WEEKDAYS[0]).toBe('Monday');
    expect(WEEKDAYS[6]).toBe('Sunday');
    expect(STAGES.map((stage) => stage.value)).toEqual(['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other']);
    expect(STAGES[4].label).toBe('Renewal');
  });
});

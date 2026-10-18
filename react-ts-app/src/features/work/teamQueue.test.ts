import { describe, expect, it } from 'vitest';
import { forText } from './feed';
import { TEAM_GROUP_LABEL, TEAM_GROUP_ORDER, queueEmpty, queueTitle } from './teamQueue';

describe('the Team queue words (delivery 2 frontend Decisions 2, 3)', () => {
  it('titles, empties and labels by scope', () => {
    expect([queueTitle('team'), queueTitle('company')]).toEqual(['Waiting on your team', 'Waiting on the rest of the company']);
    expect([queueEmpty('team'), queueEmpty('company')]).toEqual(['Nothing is waiting on your team.', 'Nothing is waiting on the rest of the company.']);
    expect(TEAM_GROUP_ORDER.map((key) => TEAM_GROUP_LABEL[key])).toEqual(['To decide', 'Overdue', 'Suggested']);
  });

  it('says who an item is for', () => {
    expect(forText({ id: 3, name: 'Carl CSM' })).toBe('For Carl CSM');
    expect(forText(null)).toBe('For the whole company');
    expect(forText(undefined)).toBeNull();
  });
});

describe('department and Unassigned queue words (Decision 1)', () => {
  it('names them by their label', () => {
    expect(queueTitle('department:cs', 'Customer Success')).toBe('Waiting in Customer Success');
    expect(queueEmpty('department:cs', 'Customer Success')).toBe('Nothing is waiting in Customer Success.');
    expect(queueTitle('unassigned')).toBe('Waiting for an owner');
    expect(queueEmpty('unassigned')).toBe('Nothing is waiting for an owner.');
    expect(queueTitle('team')).toBe('Waiting on your team');
  });
});

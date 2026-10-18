import { describe, expect, it } from 'vitest';
import {
  ADD_FLOWS,
  GROUP_KEYS,
  KIND_GROUP,
  STORY_GROUPS,
  STORY_KINDS,
  isStoryGroup,
  isStoryKind,
  kindsIn,
  offeredSources,
  sourceName,
} from './storyKinds';

describe('story groups and kinds (spec §1.6 and "Where today\'s 13 feed filters go")', () => {
  it('lists the six filters in the spec order, All first', () => {
    expect(STORY_GROUPS.map((group) => group.label)).toEqual([
      'All',
      'Conversations',
      'Tickets',
      'Tasks & notes',
      'Feedback',
      'Health & usage',
    ]);
    expect(STORY_GROUPS.slice(1).map((group) => group.key)).toEqual(GROUP_KEYS);
  });

  it('files every real kind under one group and lists no placeholder source', () => {
    expect(STORY_KINDS.map((kind) => kind.kind)).toEqual([
      'call',
      'activity',
      'email',
      'slack',
      'calendar_event',
      'ticket',
      'task',
      'note',
      'survey',
      'health',
    ]);
    expect(kindsIn('conversations')).toEqual(['call', 'activity', 'email', 'slack', 'calendar_event']);
    expect(kindsIn('tasks')).toEqual(['task', 'note']);
    expect(kindsIn('')).toHaveLength(10);
    expect(KIND_GROUP.survey).toBe('feedback');
    expect(isStoryKind('email')).toBe(true);
    expect(isStoryKind('slack')).toBe(true);
    expect(isStoryKind('sessions')).toBe(false);
    expect(isStoryGroup('health')).toBe(true);
    expect(isStoryGroup('sessions')).toBe(false);
  });

  it('offers a group\'s sources that have data, keeps a chosen one, and offers all until counts land', () => {
    const byKind = { activity: 0, calendar_event: 0, call: 1, email: 1, health: 1, note: 0, slack: 0, survey: 0, task: 1, ticket: 1 };
    expect(offeredSources('tasks', byKind, [])).toEqual(['task']);
    expect(offeredSources('tasks', byKind, ['note'])).toEqual(['task', 'note']);
    expect(offeredSources('tasks', null, [])).toEqual(['task', 'note']);
  });

  it('names where a record came from, and nothing for a record logged in Revenact', () => {
    expect(sourceName('zendesk')).toBe('Zendesk');
    expect(sourceName('google')).toBe('Gmail');
    expect(sourceName('ms_teams')).toBe('Microsoft Teams');
    expect(sourceName('revenact')).toBe('');
    expect(sourceName('newcomer')).toBe('newcomer');
  });

  it('offers the create flows (a call has a create endpoint; an activity has none), Schedule meeting last', () => {
    expect(ADD_FLOWS.map((flow) => flow.label)).toEqual(['Log a call', 'New task', 'New note', 'Log survey', 'Schedule meeting']);
  });
});

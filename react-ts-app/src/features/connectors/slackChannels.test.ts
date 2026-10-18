import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import type { Connector } from './connectorsSlice';
import { CHANNELS, channelMeta, eventsLine, readChannelRefusal, scopeText } from './slackChannels';
import { CHANNEL_ROWS } from './testSlackChannels';

const [ALL, RANDOM, ESCALATIONS, SHARED] = CHANNEL_ROWS;

describe('channelMeta (frontend Decisions 3 and 4)', () => {
  it('a synced channel the bot is in: its conversations and its customer', () => {
    expect(channelMeta({ ...ALL, record: { type: 'customer', id: 29, name: 'Globex (QA)' } }, true)).toEqual(['12 conversations', 'Files under Globex (QA)']);
    expect(channelMeta(RANDOM, true)).toEqual(['No conversations yet', 'Files under the customer each message names']);
  });
  it('a channel the bot is not in yet', () => {
    expect(channelMeta(ESCALATIONS, true)[0]).toBe('Joins on the next sync');
    expect(channelMeta(ESCALATIONS, false)[0]).toBe("Revenact isn't in it");
    expect(channelMeta({ ...ESCALATIONS, join_error: 'method_not_supported_for_channel_type' }, true)[0]).toBe("Slack wouldn't let Revenact join it");
    expect(channelMeta({ ...ESCALATIONS, join_error: 'removed' }, true)[0]).toBe('Someone removed Revenact from it');
  });
  it('a Slack Connect channel, off and on', () => {
    expect(channelMeta(SHARED, true).slice(0, 2)).toEqual(['Shared with another company', 'Not synced']);
    expect(channelMeta({ ...SHARED, included: true, member: true }, true)).toContain('Replies there never carry Jira links');
  });
  it('one conversation reads in the singular', () => {
    expect(channelMeta({ ...ALL, conversations: 1 }, true)[0]).toBe('1 conversation');
  });
});

describe('scopeText (Decision 5)', () => {
  it('reads the counts, or nothing from an older backend', () => {
    expect(scopeText({ provider: 'slack', slack_channels: { synced: 12, total: 14, can_join: true } } as Connector)).toBe('syncs 12 of 14 public channels');
    expect(scopeText({ provider: 'slack', slack_channels: { synced: 1, total: 1, can_join: false, events_at: null } } as Connector)).toBe('syncs 1 of 1 public channel');
    expect(scopeText({ provider: 'slack' } as Connector)).toBeNull();
    expect(scopeText({ provider: 'jira', slack_channels: null } as Connector)).toBeNull();
  });
});

describe('eventsLine (Decision 7, contract SC3-30)', () => {
  it('says when the last event arrived, or that events are not set up', () => {
    expect(eventsLine('2026-10-17T09:25:00Z', new Date('2026-10-17T09:30:00Z'))).toBe('Events: receiving. The last one arrived 5 minutes ago.');
    expect(eventsLine('2026-10-17T09:29:59Z', new Date('2026-10-17T09:30:00Z'))).toBe('Events: receiving. The last one arrived 1 second ago.');
    expect(eventsLine(null)).toBe(CHANNELS.EVENTS_OFF);
    expect(CHANNELS.EVENTS_OFF).toBe('Events: not set up. Revenact checks one channel at each sync until they are.');
  });
});

describe('readChannelRefusal (contract §3.2)', () => {
  it('reads a field, the detail, or says it failed', () => {
    expect(readChannelRefusal(new ApiError(400, { record: ["Globex (QA) isn't covered by this Slack connection."] }, 'x'))).toBe("Globex (QA) isn't covered by this Slack connection.");
    expect(readChannelRefusal(new ApiError(400, { included: ['Choose on or off.'] }, 'x'))).toBe('Choose on or off.');
    expect(readChannelRefusal(new ApiError(404, { code: 'NO_SUCH_CHANNEL', detail: 'No such channel.' }, 'x'))).toBe('No such channel.');
    expect(readChannelRefusal(new Error('down'))).toBe(CHANNELS.SAVE_FAILED);
  });
});

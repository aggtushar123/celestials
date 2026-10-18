import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSlackConversation, filedText } from './slackApi';
import { SLACK_THREAD } from './testSlack';
import { KIND_GROUP, KIND_NAME, isStoryKind } from './storyKinds';

afterEach(() => vi.unstubAllGlobals());

describe('a Slack thread (Slack escalations D1 contract §4)', () => {
  it('reads one thread by id', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => SLACK_THREAD }));
    vi.stubGlobal('fetch', spy);
    expect(await fetchSlackConversation(41)).toEqual(SLACK_THREAD);
    expect(new URL(String((spy.mock.calls[0] as unknown[])[0])).pathname).toBe('/api/v1/slack-conversations/41/');
  });

  it('says why it is filed where it is', () => {
    expect(filedText(SLACK_THREAD)).toBe('Filed under Globex (QA) because the message names it.');
    expect(filedText({ ...SLACK_THREAD, matched_by: 'channel' })).toBe('Filed under Globex (QA) because the channel is set to it.');
    expect(filedText({ ...SLACK_THREAD, matched_by: 'person' })).toBe('Matched to Globex (QA) by hand.');
    expect(filedText({ ...SLACK_THREAD, matched_by: 'earlier' })).toBe('');
  });

  it('is a story kind under Conversations', () => {
    expect(isStoryKind('slack')).toBe(true);
    expect(KIND_GROUP.slack).toBe('conversations');
    expect(KIND_NAME.slack).toBe('Slack thread');
  });
});

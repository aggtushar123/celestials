import { describe, expect, it } from 'vitest';
import { JIRA_LINK, coversText, linkedAsText, outcomeLine, showsSection } from './jiraLinkText';
import type { JiraLinkState } from './jiraLink';

const LINK = { name: 'Carl Lee', email: 'carl@acme.io', status: 'linked' as const, sites: [], covers: [6], linked_at: '2026-10-14T09:00:00Z' };
const STATE: JiraLinkState = { configured: true, connectors: [{ id: 6, name: 'Jira', host: 'acme.atlassian.net' }], link: LINK };

describe('Jira link words (round 2 D2 frontend Decisions 1 to 3)', () => {
  it('says who and where', () => {
    expect(linkedAsText(LINK)).toBe('Carl Lee (carl@acme.io)');
    expect(linkedAsText({ ...LINK, email: '' })).toBe('Carl Lee');
    expect(coversText(STATE)).toBe('Jira');
    expect(coversText({ ...STATE, link: { ...LINK, covers: [] } })).toBe("None of this workspace's Jira sites");
  });

  it('shows the section only when there is something to do', () => {
    expect(showsSection(STATE)).toBe(true);
    expect(showsSection({ configured: false, connectors: STATE.connectors, link: null })).toBe(false);
    expect(showsSection({ configured: true, connectors: [], link: null })).toBe(false);
    expect(showsSection({ configured: false, connectors: [], link: LINK })).toBe(true);
  });

  it('reads the callback outcome', () => {
    expect(outcomeLine(new URLSearchParams('jira_link=linked'))).toEqual({ text: 'Jira account linked.', failed: false });
    expect(outcomeLine(new URLSearchParams('jira_link=error&detail=Open%20the%20link%20in%20the%20browser%20that%20started%20it.'))).toEqual({ text: 'Could not link Jira: Open the link in the browser that started it.', failed: true });
    expect(outcomeLine(new URLSearchParams(''))).toBeNull();
  });

  it('keeps the fixed sentences', () => {
    expect(JIRA_LINK.LOST).toBe('Your Jira link stopped working. Link it again, or unlink it.');
    expect(JIRA_LINK.UNLINK_MESSAGE).toBe("The Jira steps you run will act as the Jira connection's account. To remove Revenact's access fully, also remove it under Connected apps in your Atlassian account.");
  });
});

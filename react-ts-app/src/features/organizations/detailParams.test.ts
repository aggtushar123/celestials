import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TABS,
  DETAIL_TABS,
  detailPanelId,
  detailTabId,
  hasStoryFilters,
  parseDetailParams,
  storyFilters,
  toDetailSearch,
  withPatch,
} from './detailParams';

const parse = (search: string) => parseDetailParams(new URLSearchParams(search));

describe('the organization page URL state', () => {
  it('has seven tabs, Story first (spec §1)', () => {
    expect(DETAIL_TABS.map((tab) => tab.label)).toEqual(['Story', 'Details', 'People', 'Maps', 'Deals & risks', 'Knowledge', 'Files']);
  });

  it('reads ?tab=maps, the Maps tab after People (canvas spec §2.1)', () => {
    expect(parseDetailParams(new URLSearchParams('tab=maps')).tab).toBe('maps');
    expect(DETAIL_TABS.map(({ label }) => label).slice(2, 4)).toEqual(['People', 'Maps']);
    expect(ACCOUNT_TABS.has('maps')).toBe(false);
  });

  it('lets the account chips filter Story, People, Deals & risks and Files, not Details or Knowledge (spec 2026-09-27 §1)', () => {
    expect(DETAIL_TABS.filter(({ key }) => ACCOUNT_TABS.has(key)).map(({ key }) => key)).toEqual(['story', 'people', 'deals', 'files']);
  });

  it('reads defaults, and drops unknown values rather than failing', () => {
    expect(parse('')).toEqual({ tab: 'story', account: '', group: '', sources: [], q: '' });
    expect(parse('tab=overview&account=emea&group=sessions&source=jira,email')).toEqual({
      tab: 'story',
      account: '',
      group: '',
      sources: ['email'],
      q: '',
    });
    expect(parse('tab=deals&account=31&q=renewal').tab).toBe('deals');
    expect(parse('account=none').account).toBe('none');
    expect(parse('account=0').account).toBe('');
  });

  it('keeps only the sources inside the chosen group', () => {
    expect(parse('group=tickets&source=email,ticket').sources).toEqual(['ticket']);
    const p = parse('source=email,ticket,email');
    expect(p.sources).toEqual(['email', 'ticket']);
    expect(withPatch(p, { group: 'conversations' }).sources).toEqual(['email']);
  });

  it('writes only what differs from the default, in one order', () => {
    expect(toDetailSearch(parse('')).toString()).toBe('');
    const p = parse('q=quote&source=task&group=tasks&account=31&tab=story');
    expect([...toDetailSearch(p).keys()]).toEqual(['account', 'group', 'source', 'q']);
    expect(toDetailSearch({ ...p, tab: 'files' }).get('tab')).toBe('files');
  });

  it('writes the sources sorted, so equal filters make the same URL', () => {
    const a = toDetailSearch(parse('group=conversations&source=email,call')).toString();
    const b = toDetailSearch(parse('group=conversations&source=call,email')).toString();
    expect(a).toBe(b);
    expect(new URLSearchParams(a).get('source')).toBe('call,email');
  });

  it('hands the story its filters and says when any is set', () => {
    const p = parse('account=31&group=tasks&source=note&q=kickoff');
    expect(storyFilters(p)).toEqual({ group: 'tasks', sources: ['note'], account: '31', q: 'kickoff' });
    expect(hasStoryFilters(p)).toBe(true);
    expect(hasStoryFilters(parse('tab=files'))).toBe(false);
  });

  it('names the tab and its panel for aria wiring', () => {
    expect(detailTabId('x', 'people')).toBe('x-tab-people');
    expect(detailPanelId('x', 'people')).toBe('x-panel-people');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFunctionHeads, setFunctionHead, teamLine } from './functionHeads';
import { HEADS_JESH, NO_HEADS } from './testHeads';

afterEach(() => vi.unstubAllGlobals());

const JESH = { id: 12, name: 'Jesh Sanghvi' };

describe('department heads (Slack escalations D2 contract §2)', () => {
  it('reads the six rows', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => HEADS_JESH }));
    vi.stubGlobal('fetch', spy);
    expect(await fetchFunctionHeads()).toEqual(HEADS_JESH);
    expect(new URL(String((spy.mock.calls[0] as unknown[])[0])).pathname).toBe('/api/v1/function-heads/');
  });

  it('names or clears one head with both keys', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => NO_HEADS }));
    vi.stubGlobal('fetch', spy);
    await setFunctionHead('engineering', null);
    const init = (spy.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ function: 'engineering', user_id: null });
  });
});

describe('the account team line (spec §4.4, Decision 3)', () => {
  it('says who takes an empty row', () => {
    expect(teamLine({ label: 'Engineering', person: null, deactivated: false, moved: false, head: JESH })).toBe('Nobody yet · Jesh Sanghvi (Engineering head) takes it');
    expect(teamLine({ label: 'Sales', person: null, deactivated: false, moved: false, head: null })).toBe('Nobody yet · No Sales head is set');
    expect(teamLine({ label: 'Sales', person: null, deactivated: false, moved: false, head: undefined })).toBe('Nobody yet');
  });

  it('says so when the person left', () => {
    expect(teamLine({ label: 'Engineering', person: { id: 14, name: 'Ann Former' }, deactivated: true, moved: false, head: JESH })).toBe(
      'Ann Former is deactivated · Jesh Sanghvi (Engineering head) takes it',
    );
  });

  it('says so when the person moved to another department', () => {
    expect(teamLine({ label: 'Engineering', person: { id: 15, name: 'Sam Seller' }, deactivated: false, moved: true, head: JESH })).toBe(
      'Sam Seller is no longer in Engineering · Jesh Sanghvi (Engineering head) takes it',
    );
  });

  it('is empty when someone on duty has it', () => {
    expect(teamLine({ label: 'Engineering', person: { id: 13, name: 'Erin Engineer' }, deactivated: false, moved: false, head: JESH })).toBe('');
  });
});

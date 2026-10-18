import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { fetchReviews } from '../rules/ruleApi';
import { RULES, WIN_BACK_ACTION, WIN_BACK_RULE } from '../rules/testRules';
import { requestsOf } from '../surveys/testSurveys';
import {
  confirmUnsubscribe,
  createCampaign,
  deleteCampaign,
  fetchAllMine,
  fetchAudience,
  fetchCampaign,
  fetchCampaigns,
  fetchDeliveries,
  fetchSends,
  fetchUnsubscribe,
  previewCampaign,
  sendCampaign,
  updateCampaign,
} from './campaignApi';
import { SAY } from './campaignOptions';
import { stubCampaigns } from './testCampaigns';

const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('expected a refusal');
};

describe('the campaigns API against the contract stub (spec §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists Mine and Shared with me, newest first, archived only when asked', async () => {
    stubCampaigns();
    expect((await fetchCampaigns('mine', false, null)).results.map((row) => row.name)).toEqual(['Champion news', 'Win-back', 'Spring offer']);
    expect((await fetchCampaigns('mine', true, null)).results.map((row) => row.name)).toEqual(['Champion news', 'Win-back', 'Spring offer', 'Old promo']);
    expect((await fetchCampaigns('shared', false, null)).results.map((row) => row.name)).toEqual(['EMEA newsletter']);
    expect((await fetchAllMine()).map((row) => row.id)).toEqual([12, 11, 13]);
  });

  it('reads one campaign, and 404s one the reader may not read', async () => {
    stubCampaigns();
    const migrated = await fetchCampaign(13);
    expect(migrated).toMatchObject({ needs_segment: true, legacy_recipients: [{ id: 41, name: 'Lukas Vermeer' }], legacy_hidden: 1, can_delete: true });
    expect((await refusal(fetchCampaign(15))).status).toBe(404);
  });

  it('creates, refuses an unknown merge field at its field, archives, and refuses to delete a sent campaign', async () => {
    const { spy } = stubCampaigns();
    const made = await createCampaign({ name: 'Hello', segment: 9, roles: [], subject: 'Hi {first_name}', body: 'Hello', sharing: 'private' });
    expect(made).toMatchObject({ id: 100, status: 'draft', segment: { id: 9, kind: 'contact' }, is_owner: true });
    expect((await refusal(updateCampaign(100, { body: 'Hi {nickname}' }))).body).toEqual({ body: [SAY.MERGE] });
    expect((await updateCampaign(11, { status: 'archived' })).status).toBe('archived');
    const sent = await refusal(deleteCampaign(11));
    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({ code: 'CAMPAIGN_SENT', detail: SAY.CAMPAIGN_SENT });
    expect(await deleteCampaign(12)).toBeNull();
    expect(requestsOf(spy, 'DELETE', /^\/campaigns\/12\/$/)).toHaveLength(1);
  });

  it("answers audience and preview for the owner only, the draft's text rendered for one person", async () => {
    stubCampaigns();
    const audience = await fetchAudience(12);
    expect(audience).toEqual({ reach: 3, skipped: expect.objectContaining({ no_email: 1 }), sample: [{ id: 61, name: 'Rosa Diaz' }, { id: 62, name: 'Tom Hale' }] });
    const preview = await previewCampaign(12, { contact: 62, subject: 'For {first_name}', body: 'Hello {first_name} at {organisation}' });
    expect(preview.subject).toBe('For Tom');
    expect(preview.body).toContain('Hello Tom at Initech');
    expect(preview.body).toContain('Unsubscribe from these emails:');
    expect((await refusal(fetchAudience(14))).body).toEqual({ detail: SAY.NOT_OWNER });
  });

  it('sends to the segment, skipping in order, and lists only the deliveries the reader may open', async () => {
    stubCampaigns();
    const send = await sendCampaign(12);
    expect(send).toMatchObject({ id: 500, kind: 'manual', status: 'sent', counts: { reached: 4, sent: 3, skipped: expect.objectContaining({ no_email: 1 }) } });
    expect((await fetchSends(12, null)).results.map((row) => row.id)).toEqual([500]);
    const page = await fetchDeliveries(12, 500, 'all', '', null);
    expect(page.results.map((row) => [row.contact.name, row.status, row.reason])).toEqual([
      ['Rosa Diaz', 'sent', ''],
      ['Tom Hale', 'sent', ''],
      ['Ivy Chen', 'skipped', 'no_email'],
    ]);
    expect(page.hidden).toBe(1);
    expect((await fetchDeliveries(12, 500, 'skipped', 'no_email', null)).results.map((row) => row.contact.name)).toEqual(['Ivy Chen']);
  });

  it('refuses a send without email set up, an archived one, an empty one, and one that reaches nobody, each as a detail', async () => {
    stubCampaigns({ noEmail: true });
    expect((await refusal(sendCampaign(12))).body).toEqual({ detail: SAY.EMAIL_NOT_SET_UP });
    vi.unstubAllGlobals();
    stubCampaigns();
    expect((await refusal(sendCampaign(16))).body).toEqual({ detail: SAY.ARCHIVED });
    const blank = await createCampaign({ name: 'Blank', segment: 9, roles: [], subject: '', body: '', sharing: 'private' });
    expect((await refusal(sendCampaign(blank.id))).body).toEqual({ detail: SAY.NO_CONTENT });
    await sendCampaign(12);
    expect((await refusal(sendCampaign(12))).body).toEqual({ detail: SAY.NOBODY });
  });

  it('opens an unsubscribe link without a session, records the opt-out once, and 404s a bad link', async () => {
    const { spy, tokensOf } = stubCampaigns();
    const send = await sendCampaign(12);
    const token = tokensOf(send.id).find((one) => one.contact === 61)?.token as string;
    expect(await fetchUnsubscribe(token)).toEqual({ workspace: 'Acme Inc' });
    expect(await confirmUnsubscribe(token)).toBeNull();
    expect(await confirmUnsubscribe(token)).toBeNull();
    const [read] = requestsOf(spy, 'GET', /^\/campaigns\/unsubscribe\//);
    expect(read).toBeDefined();
    const headers = (spy.mock.calls.find(([input]) => String(input).includes('/unsubscribe/'))?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect((await refusal(fetchUnsubscribe('nope'))).status).toBe(404);
  });

  it("answers preview's three distinct refusals: no segment, nobody reachable, and a contact not in the audience (backend contract note 3)", async () => {
    stubCampaigns();
    expect((await refusal(previewCampaign(13, {}))).body).toEqual({ detail: SAY.CHOOSE_SEGMENT });
    expect((await refusal(previewCampaign(12, { contact: 999 }))).body).toEqual({ contact: ['Choose someone this campaign would email.'] });
    vi.unstubAllGlobals();
    stubCampaigns({ people: { 9: [] } });
    expect((await refusal(previewCampaign(12, {}))).body).toEqual({ detail: SAY.NOBODY });
    // The backend checks someone asked for first: outside an empty audience is NOT_IN_AUDIENCE.
    expect((await refusal(previewCampaign(12, { contact: 61 }))).body).toEqual({ contact: ['Choose someone this campaign would email.'] });
  });

  it("collapses the preview's subject to one line, as the backend renders it", async () => {
    stubCampaigns();
    expect((await previewCampaign(12, { contact: 62, subject: '  For\n {first_name}  ', body: 'Hi' })).subject).toBe('For Tom');
  });

  it("refuses a blank or long name in the backend's own words", async () => {
    stubCampaigns();
    const base = { segment: 9, roles: [], subject: '', body: '', sharing: 'private' as const };
    expect((await refusal(createCampaign({ ...base, name: '  ' }))).body).toEqual({ name: [SAY.NO_NAME] });
    expect((await refusal(createCampaign({ ...base, name: 'x'.repeat(121) }))).body).toEqual({ name: ['Keep the name to 120 characters.'] });
  });

  it('refuses a send whose owner is no longer active, after archived and before the rest (backend sending._refusal)', async () => {
    stubCampaigns({ ownerInactive: true });
    expect((await refusal(sendCampaign(16))).body).toEqual({ detail: SAY.ARCHIVED });
    expect((await refusal(sendCampaign(13))).body).toEqual({ detail: SAY.OWNER_INACTIVE });
    expect((await refusal(sendCampaign(12))).body).toEqual({ detail: 'Its owner is no longer active.' });
  });

  it("refuses PATCH {status} with anything but archived or active (backend contract note 11)", async () => {
    stubCampaigns();
    expect((await refusal(updateCampaign(11, { status: 'sent' } as never))).body).toEqual({ status: ['Choose archived or active.'] });
  });

  it("answers a bad unsubscribe link with the backend's own copy, not the generic 404 (backend contract note 7)", async () => {
    stubCampaigns();
    expect((await refusal(fetchUnsubscribe('nope'))).body).toEqual({ detail: 'This link has expired.' });
  });
});

describe("a rule's night campaign (campaigns spec §2.5, moved from the old Review Queue's tests)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it('makes a review that waits, or sends at once without review', async () => {
    const waiting = stubCampaigns({ rules: { rules: [...RULES, WIN_BACK_RULE] } });
    waiting.runNight(11);
    const reviews = await fetchReviews('waiting');
    expect(reviews.find((review) => review.kind === 'campaign')).toMatchObject({ kind: 'campaign', rule: { id: 11 }, counts: { reach: 2 } });
    vi.unstubAllGlobals();
    const direct = stubCampaigns({ rules: { rules: [...RULES, { ...WIN_BACK_RULE, actions: [{ ...WIN_BACK_ACTION, without_review: true }] }] } });
    direct.runNight(11);
    const page = await fetchSends(11, null);
    expect(page.results[0]).toMatchObject({ kind: 'rule', rule: { id: 11, name: 'Win-back watch' }, sent_by: null });
  });
});
